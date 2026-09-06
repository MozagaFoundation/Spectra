/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'
import type {
  LocalStorage,
  MailboxScopeState,
  Message,
  MessageStatusUpdateOptions,
  InboundMessageCommit,
  OutboundMessageCommit,
  RelayReceiptJob,
  RetryRequestRecord,
  RelaySenderBundleAttachState,
} from '@spectra/core-crypto'
import {
  base64ToBytes,
  bytesToBase64,
  decrypt,
  encrypt,
} from '@spectra/identity-vault'
import {
  buildAccountScopedPrefix,
  isAccountStorageScope,
  normalizeAccountStorageScope,
} from '@/lib/accountScope'
import { SECURE_STORE_OPTIONS, VAULT_SECURITY_KEYS } from '@/lib/constants'
import {
  buildLocalCacheAad,
  openLocalCacheText,
  sealLocalCacheText,
  type LocalCacheCipher,
} from './localCacheCrypto'
import {
  isChatSecretStorageEnvelope,
  openChatSecretRecord,
  sealChatSecretRecord,
  type ChatSecretRecordKind,
} from './chatSecretStorageCrypto'
import { getAppKeyValueStorage, prepareAppKeyValueStorage } from './keyValueStorage'
import {
  compareMessageStatus,
  completeRelayDeliveryOutbox,
  deserializeSessionState,
  hasPendingRelayDelivery,
  parseRelaySenderBundleAttachState,
  serializeSessionState,
  shouldSyncOutboundStatus,
} from '@spectra/core-crypto'

const PREFIX = 'qc_'
const SCHEMA_VERSION_KEY = 'qc__schema_version'
const LEGACY_MIGRATION_MARKER_PREFIX = 'qc__legacy_scope_migrated_'
const CONTENT_SEAL_MARKER_PREFIX = 'qc__content_sealed_v4_'
const CHAT_SECRET_SEAL_MARKER_PREFIX = 'qc__chat_secrets_sealed_v1_'
const CHAT_SECRET_SECURE_MARKER_PREFIX = 'exo_chat_secrets_sealed_v1_'
const DECRYPTED_CACHE_CLEAN_MARKER = 'qc__strict_cache_cleanup_v1'
// Schema v5 seals durable relay outbox capabilities.
const CURRENT_SCHEMA_VERSION = 5
const RELAY_MESSAGE_KEY = 'relay_message_'
const RECEIPT_JOB_KEY = 'receipt_job_'
const RETRY_REQUEST_KEY = 'retry_request_'
const RETRY_REQUEST_BY_RELAY_KEY = 'relay_retry_request_'
const MESSAGE_TIME_INDEX_KEY = 'message_time_index_'
const DECRYPTED_TIME_INDEX_KEY = 'decrypted_time_index_'
const STATUS_SYNC_INDEX_KEY = 'status_sync_index_'
const STATUS_SYNC_MARKER_KEY = 'status_sync_marker_'
const STATUS_SYNC_INDEX_VERSION_KEY = 'status_sync_index_version_'
const STATUS_SYNC_INDEX_VERSION = 1
const OUTBOUND_COMMIT_WAL_KEY = 'outbound_commit_wal'
const INBOUND_COMMIT_WAL_KEY = 'inbound_commit_wal'
const LOCAL_CONTENT_AAD_PREFIX = 'spectra:local-message-content:v1'
const MAILBOX_SCOPE_INDEX_SEPARATOR = ':'
const MESSAGE_HYDRATION_CONCURRENCY = 8
const MESSAGE_SEAL_CONCURRENCY = 4
const CHAT_SECRET_SEAL_CONCURRENCY = 4
let activeScope: string | null = null
const repairedStatusSyncSenders = new Set<string>()
const sealedChatSecretScopes = new Set<string>()
const storageMutationQueues = new Map<string, Promise<void>>()
const cleanOutboundCommitScopes = new Set<string>()
const cleanInboundCommitScopes = new Set<string>()

async function enqueueStorageMutation<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = storageMutationQueues.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  const tail = current.then(() => undefined, () => undefined)
  storageMutationQueues.set(key, tail)
  try {
    return await current
  } finally {
    if (storageMutationQueues.get(key) === tail) {
      storageMutationQueues.delete(key)
    }
  }
}

type TimedIndexEntry = {
  id: string
  timestamp: number
}

type OutboundCommitWal = {
  v: 1
  scope: string
  entries: Array<[string, string]>
}

type InboundCommitWal = OutboundCommitWal

export interface QuantumChatStorageSnapshot {
  schemaVersion: 1
  scope: string | null
  entries: Array<readonly [string, string]>
}

function isBackupIndexEntryKey(key: string): boolean {
  return key === 'identity_index'
    || key === 'processed_index'
    || key === 'tracked_index'
    || key.startsWith('session_index_')
    || key.startsWith('conversation_index_')
    || key.startsWith('conversation_participant_')
    || key.startsWith('message_index_')
    || key.startsWith('decrypted_index_')
}

function mergeStoredStringArray(existingRaw: string, incomingRaw: string): string | null {
  try {
    const existing = JSON.parse(existingRaw)
    const incoming = JSON.parse(incomingRaw)
    if (!Array.isArray(existing) || !Array.isArray(incoming)) {
      return null
    }
    return JSON.stringify([...existing, ...incoming].filter((value, index, values) => (
      typeof value === 'string' && values.indexOf(value) === index
    )))
  } catch {
    return null
  }
}

function isStoredMessageKey(key: string): boolean {
  return key.startsWith('message_')
    && !key.startsWith('message_index_')
    && !key.startsWith(MESSAGE_TIME_INDEX_KEY)
}

function isStoredConversationKey(key: string): boolean {
  return key.startsWith('conversation_')
    && !key.startsWith('conversation_index_')
    && !key.startsWith('conversation_participant_')
}

type ChatSecretStorageDescriptor = {
  kind: ChatSecretRecordKind
  storageKey: string
}

function getChatSecretStorageDescriptor(key: string): ChatSecretStorageDescriptor | null {
  if (key.startsWith('identity_') && key !== 'identity_index') {
    return { kind: 'identity', storageKey: key }
  }
  if (key.startsWith('private_bundle_')) {
    return { kind: 'private-bundle', storageKey: key }
  }
  if (key.startsWith('session_record_')) {
    return { kind: 'session-record', storageKey: key }
  }
  if (key.startsWith('session_') && !key.startsWith('session_index_')) {
    return { kind: 'session', storageKey: key }
  }
  if (key.startsWith('mailbox_scope_') && !key.startsWith('mailbox_scope_index_')) {
    return { kind: 'mailbox-scope', storageKey: key }
  }
  return null
}

function isMessageStorageKey(key: string): boolean {
  if (!key.startsWith(PREFIX)) {
    return false
  }

  const suffix = key.slice(PREFIX.length)
  if (isStoredMessageKey(suffix)) {
    return true
  }

  const delimiterIndex = suffix.indexOf('_')
  if (delimiterIndex === -1) {
    return false
  }

  const scope = suffix.slice(0, delimiterIndex)
  const unscopedKey = suffix.slice(delimiterIndex + 1)
  return isAccountStorageScope(scope) && isStoredMessageKey(unscopedKey)
}

const cache = new Map<string, string>()
const MAX_CACHE_SIZE = 1000
let shouldPersistDecryptedMessages = false
const volatileDecryptedMessages = new Map<string, any>()
const volatileDecryptedIndexes = new Map<string, string[]>()
let localMessageContentKey: Uint8Array | null = null

function getCached(key: string): string | undefined {
  return cache.get(key)
}

function setCache(key: string, value: string): void {
  if (cache.size >= MAX_CACHE_SIZE) {
    const keys = [...cache.keys()].slice(0, MAX_CACHE_SIZE / 2)
    keys.forEach(k => cache.delete(k))
  }
  cache.set(key, value)
}

function deleteCache(key: string): void {
  cache.delete(key)
}

function getScopedPrefix(scope: string | null = activeScope): string {
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (!normalizedScope) {
    return PREFIX
  }

  return buildAccountScopedPrefix(PREFIX, normalizedScope)
}

function getFullKey(key: string, scope: string | null = activeScope): string {
  return `${getScopedPrefix(scope)}${key}`
}

function getLegacyMigrationMarkerKey(scope: string): string {
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (!normalizedScope) {
    throw new Error('AsyncStorage scope is not configured')
  }

  return `${LEGACY_MIGRATION_MARKER_PREFIX}${normalizedScope}`
}

function getContentSealMarkerKey(scope: string): string {
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (!normalizedScope) {
    throw new Error('AsyncStorage scope is not configured')
  }
  return `${CONTENT_SEAL_MARKER_PREFIX}${normalizedScope}`
}

function getChatSecretSealMarkerKey(scope: string): string {
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (!normalizedScope) {
    throw new Error('AsyncStorage scope is not configured')
  }
  return `${CHAT_SECRET_SEAL_MARKER_PREFIX}${normalizedScope}`
}

function getChatSecretSecureMarkerKey(scope: string): string {
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (!normalizedScope) {
    throw new Error('AsyncStorage scope is not configured')
  }
  return `${CHAT_SECRET_SECURE_MARKER_PREFIX}${normalizedScope}`
}

function getMailboxScopeIndexEntry(scope: MailboxScopeState): string {
  return `${scope.remoteIdentityId}${MAILBOX_SCOPE_INDEX_SEPARATOR}${scope.scopeId}`
}

function getMailboxScopeStorageKey(scope: MailboxScopeState): string {
  return `mailbox_scope_${scope.localIdentityId}_${scope.remoteIdentityId}_${scope.scopeId}`
}

function getMailboxScopeStorageKeyFromIndex(localIdentityId: string, entry: string): string {
  const [remoteIdentityId, scopeId] = entry.split(MAILBOX_SCOPE_INDEX_SEPARATOR)
  if (remoteIdentityId && scopeId) {
    return `mailbox_scope_${localIdentityId}_${remoteIdentityId}_${scopeId}`
  }

  // Legacy entries were keyed only by remote identity. Keep them readable so
  // existing scoped mailboxes remain usable after the storage format change.
  return `mailbox_scope_${localIdentityId}_${entry}`
}

function getMailboxScopeRemoteIdentityId(entry: string): string {
  return entry.split(MAILBOX_SCOPE_INDEX_SEPARATOR)[0] || entry
}

function getPreferredMailboxScope(scopes: MailboxScopeState[]): MailboxScopeState | null {
  return [...scopes].sort((a, b) => {
    const aReady = a.status === 'active' && a.registeredAt && a.acknowledgedAt ? 1 : 0
    const bReady = b.status === 'active' && b.registeredAt && b.acknowledgedAt ? 1 : 0
    if (aReady !== bReady) return bReady - aReady
    return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
  })[0] ?? null
}

function isScopedAsyncStorageKey(key: string): boolean {
  if (!key.startsWith(PREFIX)) {
    return false
  }

  const suffix = key.slice(PREFIX.length)
  const delimiterIndex = suffix.indexOf('_')
  if (delimiterIndex === -1) {
    return false
  }

  return isAccountStorageScope(suffix.slice(0, delimiterIndex))
}

function isLegacyAsyncStorageKey(key: string): boolean {
  return key.startsWith(PREFIX)
    && !isScopedAsyncStorageKey(key)
    && key !== SCHEMA_VERSION_KEY
    && !key.startsWith(LEGACY_MIGRATION_MARKER_PREFIX)
    && !key.startsWith('qc__content_sealed_')
    && !key.startsWith(CHAT_SECRET_SEAL_MARKER_PREFIX)
}

function isDecryptedCacheStorageKey(key: string): boolean {
  if (!key.startsWith(PREFIX)) {
    return false
  }

  const suffix = key.slice(PREFIX.length)
  if (suffix.startsWith('decrypted_') || suffix.startsWith(DECRYPTED_TIME_INDEX_KEY)) {
    return true
  }

  const delimiterIndex = suffix.indexOf('_')
  if (delimiterIndex === -1) {
    return false
  }

  const scope = suffix.slice(0, delimiterIndex)
  const unscopedKey = suffix.slice(delimiterIndex + 1)
  return isAccountStorageScope(scope)
    && (unscopedKey.startsWith('decrypted_') || unscopedKey.startsWith(DECRYPTED_TIME_INDEX_KEY))
}

function messageContentAssociatedData(messageId: string): Uint8Array {
  return new TextEncoder().encode(`${LOCAL_CONTENT_AAD_PREFIX}:${messageId}`)
}

const SENSITIVE_MESSAGE_FIELDS = [
  'content',
  'senderName',
  'senderAvatarUrl',
  'deliveryHint',
  'relayDeliveryToken',
  'relayDeliveryOutbox',
  'attachments',
  'replyTo',
  'reactions',
  'oneTime',
  'disappearing',
  'systemEvent',
] as const

function requireContentScope(scope?: string | null): string {
  const normalizedScope = normalizeAccountStorageScope(scope ?? activeScope)
  if (!normalizedScope) {
    throw new Error('Message cache wallet scope is required')
  }
  return normalizedScope
}

function messagePayloadAssociatedData(message: any, scope: string): Uint8Array {
  return buildLocalCacheAad([
    'spectra',
    'direct-message-payload',
    'v2',
    scope,
    String(message.id),
    String(message.conversationId ?? ''),
    String(message.senderId ?? ''),
  ])
}

async function getLocalMessageContentKey(): Promise<Uint8Array> {
  if (localMessageContentKey) {
    return localMessageContentKey
  }

  const raw = await SecureStore.getItemAsync(
    VAULT_SECURITY_KEYS.LOCAL_MESSAGE_CONTENT_KEY,
    SECURE_STORE_OPTIONS,
  )
  if (raw) {
    const key = base64ToBytes(raw)
    if (key.byteLength === 32) {
      localMessageContentKey = key
      return key
    }
  }

  const key = await Crypto.getRandomBytesAsync(32)
  localMessageContentKey = key
  await SecureStore.setItemAsync(
    VAULT_SECURITY_KEYS.LOCAL_MESSAGE_CONTENT_KEY,
    bytesToBase64(key),
    SECURE_STORE_OPTIONS,
  )
  return key
}

async function sealPersistentMessageContent(message: any, scope?: string | null): Promise<any> {
  if (
    !message
    || !SENSITIVE_MESSAGE_FIELDS.some(
      (field) => Object.prototype.hasOwnProperty.call(message, field),
    )
  ) {
    return message
  }

  const storageScope = requireContentScope(scope ?? message.localWalletAddress)
  const payload: Record<string, unknown> = {}
  const rest = { ...message }
  for (const field of SENSITIVE_MESSAGE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rest, field)) {
      payload[field] = rest[field]
      delete rest[field]
    }
  }
  const encrypted = await sealLocalCacheText(
    storageScope,
    'direct',
    JSON.stringify(payload),
    messagePayloadAssociatedData(message, storageScope),
  )
  return {
    ...rest,
    localContentCipher: {
      v: 2,
      algorithm: 'AES-256-GCM',
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
    },
  }
}

async function hydratePersistentMessageContent(message: any, scope?: string | null): Promise<any> {
  if (typeof message?.content === 'string' || !message?.localContentCipher) {
    return message
  }

  try {
    if (
      message.localContentCipher.v === 1
      && message.localContentCipher.algorithm === 'AES-256-GCM'
    ) {
      const key = await getLocalMessageContentKey()
      const { localContentCipher: _cipher, ...rest } = message
      return {
        ...rest,
        content: decrypt(
          message.localContentCipher.ciphertext,
          message.localContentCipher.iv,
          key,
          messageContentAssociatedData(message.id),
        ),
      }
    }

    if (
      message.localContentCipher.v !== 2
      || message.localContentCipher.algorithm !== 'AES-256-GCM'
    ) {
      throw new Error('Unsupported message cache cipher')
    }

    const storageScope = requireContentScope(scope ?? message.localWalletAddress)
    const cipher: LocalCacheCipher = {
      v: 1,
      algorithm: 'AES-256-GCM',
      ciphertext: message.localContentCipher.ciphertext,
      iv: message.localContentCipher.iv,
    }
    const payload = JSON.parse(await openLocalCacheText(
      storageScope,
      'direct',
      cipher,
      messagePayloadAssociatedData(message, storageScope),
    ))
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Invalid message cache payload')
    }
    const { localContentCipher: _cipher, ...rest } = message
    return {
      ...rest,
      ...payload,
    }
  } catch {
    const { localContentCipher: _cipher, ...rest } = message || {}
    return {
      ...rest,
      content: '',
      localContentUnavailable: true,
    }
  }
}

function conversationPreviewAssociatedData(conversation: any, scope: string): Uint8Array {
  return buildLocalCacheAad([
    'spectra',
    'direct-conversation-preview',
    'v1',
    scope,
    String(conversation.id),
    String(conversation.localIdentityId ?? ''),
  ])
}

async function sealConversationPreview(conversation: any, scope?: string | null): Promise<any> {
  if (typeof conversation?.lastMessage?.content !== 'string') {
    return conversation
  }
  const storageScope = requireContentScope(scope ?? conversation.localWalletAddress)
  const { content, ...previewMetadata } = conversation.lastMessage
  const sealed = await sealLocalCacheText(
    storageScope,
    'direct',
    content,
    conversationPreviewAssociatedData(conversation, storageScope),
  )
  return {
    ...conversation,
    lastMessage: previewMetadata,
    localPreviewCipher: {
      v: 1,
      algorithm: 'AES-256-GCM',
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
    },
  }
}

async function hydrateConversationPreview(conversation: any, scope?: string | null): Promise<any> {
  if (
    !conversation?.localPreviewCipher
    || conversation.localPreviewCipher.v !== 1
    || conversation.localPreviewCipher.algorithm !== 'AES-256-GCM'
  ) {
    return conversation
  }
  try {
    const storageScope = requireContentScope(scope ?? conversation.localWalletAddress)
    const content = await openLocalCacheText(
      storageScope,
      'direct',
      conversation.localPreviewCipher as LocalCacheCipher,
      conversationPreviewAssociatedData(conversation, storageScope),
    )
    const { localPreviewCipher: _cipher, ...rest } = conversation
    return {
      ...rest,
      lastMessage: {
        ...conversation.lastMessage,
        content,
      },
    }
  } catch {
    const { localPreviewCipher: _cipher, ...rest } = conversation || {}
    return {
      ...rest,
      lastMessage: undefined,
    }
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(concurrency, items.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      results[currentIndex] = await mapper(items[currentIndex])
    }
  }))

  return results
}

async function sealPersistentMessageContentKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return
  }

  const entries = Array.from(await getAppKeyValueStorage().multiGet(keys))
  const updates = await mapWithConcurrency(entries, MESSAGE_SEAL_CONCURRENCY, async ([key, rawValue]) => {
    if (!rawValue) return undefined

    try {
      const message = JSON.parse(rawValue)
      if (
        message?.localContentCipher?.v === 2
        && !Object.prototype.hasOwnProperty.call(message, 'relayDeliveryToken')
        && !Object.prototype.hasOwnProperty.call(message, 'relayDeliveryOutbox')
      ) {
        return undefined
      }

      const suffix = key.startsWith(PREFIX) ? key.slice(PREFIX.length) : ''
      const delimiterIndex = suffix.indexOf('_')
      const storageScope = delimiterIndex === -1 ? null : suffix.slice(0, delimiterIndex)
      if (!isAccountStorageScope(storageScope)) {
        await getAppKeyValueStorage().removeItem(key)
        deleteCache(key)
        return undefined
      }
      const hydrated = await hydratePersistentMessageContent(message, storageScope)
      if (typeof hydrated?.content !== 'string' || hydrated.localContentUnavailable) {
        return undefined
      }
      const sealed = await sealPersistentMessageContent(hydrated, storageScope)
      deleteCache(key)
      return [key, JSON.stringify(sealed)] as [string, string]
    } catch {
      await getAppKeyValueStorage().removeItem(key)
      deleteCache(key)
    }
  })

  const validUpdates = updates.filter((entry): entry is [string, string] => entry !== undefined)
  if (validUpdates.length > 0) {
    await getAppKeyValueStorage().multiSet(validUpdates)
  }
}

async function sealConversationPreviewKeys(keys: string[]): Promise<void> {
  const entries = Array.from(await getAppKeyValueStorage().multiGet(keys))
  const updates = await mapWithConcurrency(entries, MESSAGE_SEAL_CONCURRENCY, async ([key, rawValue]) => {
    if (!rawValue) return undefined
    try {
      const conversation = JSON.parse(rawValue)
      if (
        conversation?.localPreviewCipher?.v === 1
        || typeof conversation?.lastMessage?.content !== 'string'
      ) {
        return undefined
      }
      const suffix = key.startsWith(PREFIX) ? key.slice(PREFIX.length) : ''
      const delimiterIndex = suffix.indexOf('_')
      const storageScope = delimiterIndex === -1 ? null : suffix.slice(0, delimiterIndex)
      if (!isAccountStorageScope(storageScope)) return undefined
      const sealed = await sealConversationPreview(conversation, storageScope)
      deleteCache(key)
      return [key, JSON.stringify(sealed)] as [string, string]
    } catch {
      await getAppKeyValueStorage().removeItem(key)
      deleteCache(key)
      return undefined
    }
  })
  const validUpdates = updates.filter((entry): entry is [string, string] => entry !== undefined)
  if (validUpdates.length > 0) {
    await getAppKeyValueStorage().multiSet(validUpdates)
  }
}

function clearVolatileDecryptedMessages(options: { allScopes?: boolean } = {}): void {
  if (options.allScopes) {
    volatileDecryptedMessages.clear()
    volatileDecryptedIndexes.clear()
    return
  }

  const scopedPrefix = getScopedPrefix()
  for (const key of [...volatileDecryptedMessages.keys()]) {
    if (key.startsWith(scopedPrefix)) {
      volatileDecryptedMessages.delete(key)
    }
  }
  for (const key of [...volatileDecryptedIndexes.keys()]) {
    if (key.startsWith(scopedPrefix)) {
      volatileDecryptedIndexes.delete(key)
    }
  }
}

async function migrateLegacyStorageForScope(scope: string): Promise<void> {
  const markerKey = getLegacyMigrationMarkerKey(scope)
  const marker = await getAppKeyValueStorage().getItem(markerKey)
  if (marker === 'true') {
    return
  }

  const scopedPrefix = getScopedPrefix(scope)
  const allKeys = await getAppKeyValueStorage().getAllKeys()
  const legacyKeys = allKeys.filter(isLegacyAsyncStorageKey)

  if (legacyKeys.length === 0) {
    await getAppKeyValueStorage().setItem(markerKey, 'true')
    return
  }

  const scopedKeys = new Set(allKeys.filter((key) => key.startsWith(scopedPrefix)))
  const legacyEntries = await getAppKeyValueStorage().multiGet(legacyKeys)
  const candidateEntries = legacyEntries.flatMap(([legacyKey, rawValue]) => {
    if (rawValue === null) {
      return []
    }

    const targetKey = `${scopedPrefix}${legacyKey.slice(PREFIX.length)}`
    if (scopedKeys.has(targetKey)) {
      return []
    }

    return [[targetKey, rawValue, legacyKey.slice(PREFIX.length)] as const]
  })
  const protectedEntries = await mapWithConcurrency(
    candidateEntries,
    MESSAGE_SEAL_CONCURRENCY,
    async ([targetKey, rawValue, unscopedKey]) => {
      if (
        unscopedKey.startsWith('decrypted_')
        || unscopedKey.startsWith(DECRYPTED_TIME_INDEX_KEY)
      ) {
        return undefined
      }
      const secretDescriptor = getChatSecretStorageDescriptor(unscopedKey)
      if (secretDescriptor) {
        const parsed = JSON.parse(rawValue) as unknown
        if (isChatSecretStorageEnvelope(parsed)) {
          await openChatSecretRecord(
            scope,
            secretDescriptor.kind,
            secretDescriptor.storageKey,
            parsed,
          )
          return [targetKey, rawValue] as [string, string]
        }
        if (hasChatSecretCipherMarker(parsed)) {
          throw new Error(`Invalid chat secret envelope: ${unscopedKey}`)
        }
        return [
          targetKey,
          JSON.stringify(
            await sealChatSecretRecord(
              scope,
              secretDescriptor.kind,
              secretDescriptor.storageKey,
              parsed,
            ),
          ),
        ] as [string, string]
      }
      try {
        if (isStoredMessageKey(unscopedKey)) {
          const hydrated = await hydratePersistentMessageContent(JSON.parse(rawValue), scope)
          if (typeof hydrated?.content !== 'string' || hydrated.localContentUnavailable) {
            return undefined
          }
          return [
            targetKey,
            JSON.stringify(await sealPersistentMessageContent(hydrated, scope)),
          ] as [string, string]
        }
        if (isStoredConversationKey(unscopedKey)) {
          return [
            targetKey,
            JSON.stringify(await sealConversationPreview(JSON.parse(rawValue), scope)),
          ] as [string, string]
        }
        return [targetKey, rawValue] as [string, string]
      } catch {
        return undefined
      }
    },
  )
  const entriesToCopy = protectedEntries.filter(
    (entry): entry is [string, string] => entry !== undefined,
  )

  if (entriesToCopy.length > 0) {
    await getAppKeyValueStorage().multiSet(entriesToCopy)
  }

  await getAppKeyValueStorage().multiRemove(legacyKeys)
  await getAppKeyValueStorage().setItem(markerKey, 'true')
}

async function migrateContentForScope(scope: string): Promise<void> {
  const markerKey = getContentSealMarkerKey(scope)
  if (await getAppKeyValueStorage().getItem(markerKey) === 'true') {
    return
  }

  const scopedPrefix = getScopedPrefix(scope)
  const allKeys = await getAppKeyValueStorage().getAllKeys()
  const decryptedKeys = allKeys.filter((key) => (
    key.startsWith(scopedPrefix)
    && (
      key.slice(scopedPrefix.length).startsWith('decrypted_')
      || key.slice(scopedPrefix.length).startsWith(DECRYPTED_TIME_INDEX_KEY)
    )
  ))
  if (decryptedKeys.length > 0) {
    await getAppKeyValueStorage().multiRemove(decryptedKeys)
    for (const key of decryptedKeys) deleteCache(key)
  }

  const messageKeys = allKeys.filter((key) => (
    key.startsWith(scopedPrefix)
    && isStoredMessageKey(key.slice(scopedPrefix.length))
  ))
  const conversationKeys = allKeys.filter((key) => {
    if (!key.startsWith(scopedPrefix)) return false
    const suffix = key.slice(scopedPrefix.length)
    return isStoredConversationKey(suffix)
  })
  await sealPersistentMessageContentKeys(messageKeys)
  await sealConversationPreviewKeys(conversationKeys)
  await getAppKeyValueStorage().setItem(markerKey, 'true')
}

async function getItem<T>(
  key: string,
  scope: string | null = activeScope,
): Promise<T | null> {
  const fullKey = getFullKey(key, scope)
  const cached = getCached(fullKey)
  if (cached !== undefined) {
    try {
      return JSON.parse(cached)
    } catch {
      // Evict corrupt cache and read storage.
      deleteCache(fullKey)
    }
  }
  
  const data = await getAppKeyValueStorage().getItem(fullKey)
  if (data === null) return null
  
  try {
    const parsed = JSON.parse(data) as T
    setCache(fullKey, data)
    return parsed
  } catch {
    // Remove corrupt storage data.
    await getAppKeyValueStorage().removeItem(fullKey)
    return null
  }
}

async function setItem<T>(
  key: string,
  value: T,
  scope: string | null = activeScope,
): Promise<void> {
  const fullKey = getFullKey(key, scope)
  const data = JSON.stringify(value)
  await getAppKeyValueStorage().setItem(fullKey, data)
  setCache(fullKey, data)
}

async function removeItem(key: string, scope: string | null = activeScope): Promise<void> {
  const fullKey = getFullKey(key, scope)
  await getAppKeyValueStorage().removeItem(fullKey)
  deleteCache(fullKey)
}

export async function getScopedSealedStorageRecord<T>(key: string): Promise<T | null> {
  const record = await getItem<any>(key)
  const hydrated = await hydratePersistentMessageContent(record)
  if (typeof hydrated?.content !== 'string') return null

  try {
    return JSON.parse(hydrated.content) as T
  } catch {
    await removeItem(key)
    return null
  }
}

export async function setScopedSealedStorageRecord<T>(key: string, value: T): Promise<void> {
  await setItem(key, await sealPersistentMessageContent({
    id: `scoped:${key}`,
    content: JSON.stringify(value),
  }))
}

async function getAllKeys(
  prefix: string,
  scope: string | null = activeScope,
): Promise<string[]> {
  const allKeys = await getAppKeyValueStorage().getAllKeys()
  const fullPrefix = getFullKey(prefix, scope)
  const scopedPrefix = getScopedPrefix(scope)
  return allKeys
    .filter(k => k.startsWith(fullPrefix))
    .map(k => k.slice(scopedPrefix.length))
}

async function getItemsBatch<T>(
  keys: string[],
  scope: string | null = activeScope,
): Promise<Map<string, T>> {
  if (keys.length === 0) return new Map()
  
  const fullKeys = keys.map((key) => getFullKey(key, scope))
  const results = new Map<string, T>()
  
  const uncachedKeys: string[] = []
  const uncachedFullKeys: string[] = []
  
  for (let i = 0; i < keys.length; i++) {
    const cached = getCached(fullKeys[i])
    if (cached !== undefined) {
      try {
        results.set(keys[i], JSON.parse(cached))
      } catch {
        deleteCache(fullKeys[i])
        uncachedKeys.push(keys[i])
        uncachedFullKeys.push(fullKeys[i])
      }
    } else {
      uncachedKeys.push(keys[i])
      uncachedFullKeys.push(fullKeys[i])
    }
  }
  
  if (uncachedFullKeys.length > 0) {
    const pairs = await getAppKeyValueStorage().multiGet(uncachedFullKeys)
    const logicalByFullKey = new Map(
      uncachedFullKeys.map((fullKey, index) => [fullKey, uncachedKeys[index]]),
    )
    for (const [fullKey, data] of pairs) {
      const logicalKey = logicalByFullKey.get(fullKey)
      if (logicalKey === undefined || data === null) continue
      try {
        setCache(fullKey, data)
        results.set(logicalKey, JSON.parse(data))
      } catch {
        deleteCache(fullKey)
        await getAppKeyValueStorage().removeItem(fullKey)
      }
    }
  }
  
  return results
}

function getOutboundCommitWalAad(scope: string): Uint8Array {
  return buildLocalCacheAad([
    'spectra',
    'outbound-commit',
    'v1',
    scope,
  ])
}

function getInboundCommitWalAad(scope: string): Uint8Array {
  return buildLocalCacheAad([
    'spectra',
    'inbound-commit',
    'v1',
    scope,
  ])
}

async function applyOutboundCommitWal(
  wal: OutboundCommitWal,
  scope: string,
  walStorageKey = OUTBOUND_COMMIT_WAL_KEY,
): Promise<void> {
  const scopedPrefix = getScopedPrefix(scope)
  if (
    wal.v !== 1
    || wal.scope !== scope
    || !Array.isArray(wal.entries)
    || wal.entries.length === 0
    || wal.entries.length > 16
    || wal.entries.some((entry) => (
      !Array.isArray(entry)
      || entry.length !== 2
      || typeof entry[0] !== 'string'
      || typeof entry[1] !== 'string'
      || !entry[0].startsWith(scopedPrefix)
      || entry[0] === getFullKey(walStorageKey, scope)
    ))
  ) {
    throw new Error('Outbound commit journal is invalid')
  }

  await getAppKeyValueStorage().multiSet(wal.entries)
  for (const [key, value] of wal.entries) {
    setCache(key, value)
  }
}

async function replayOutboundCommitWal(scope: string): Promise<void> {
  if (cleanOutboundCommitScopes.has(scope)) return
  const walKey = getFullKey(OUTBOUND_COMMIT_WAL_KEY, scope)
  const raw = await getAppKeyValueStorage().getItem(walKey)
  if (!raw) {
    cleanOutboundCommitScopes.add(scope)
    return
  }

  const envelope = JSON.parse(raw) as LocalCacheCipher
  const plaintext = await openLocalCacheText(
    scope,
    'chat-secret',
    envelope,
    getOutboundCommitWalAad(scope),
  )
  const wal = JSON.parse(plaintext) as OutboundCommitWal
  await applyOutboundCommitWal(wal, scope)
  await getAppKeyValueStorage().removeItem(walKey)
  deleteCache(walKey)
  cleanOutboundCommitScopes.add(scope)
}

async function replayInboundCommitWal(scope: string): Promise<void> {
  if (cleanInboundCommitScopes.has(scope)) return
  const walKey = getFullKey(INBOUND_COMMIT_WAL_KEY, scope)
  const raw = await getAppKeyValueStorage().getItem(walKey)
  if (!raw) {
    cleanInboundCommitScopes.add(scope)
    return
  }

  const envelope = JSON.parse(raw) as LocalCacheCipher
  const plaintext = await openLocalCacheText(
    scope,
    'chat-secret',
    envelope,
    getInboundCommitWalAad(scope),
  )
  const wal = JSON.parse(plaintext) as InboundCommitWal
  await applyOutboundCommitWal(wal, scope, INBOUND_COMMIT_WAL_KEY)
  await getAppKeyValueStorage().removeItem(walKey)
  deleteCache(walKey)
  cleanInboundCommitScopes.add(scope)
}

function requireChatSecretScope(scope: string | null = activeScope): string {
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (!normalizedScope) {
    throw new Error('Chat secret wallet scope is required')
  }
  return normalizedScope
}

function hasChatSecretCipherMarker(value: unknown): boolean {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as { __chatSecretCipher?: unknown }).__chatSecretCipher === true,
  )
}

async function isChatSecretSealComplete(scope: string): Promise<boolean> {
  if (sealedChatSecretScopes.has(scope)) return true
  const complete = await SecureStore.getItemAsync(
    getChatSecretSecureMarkerKey(scope),
    SECURE_STORE_OPTIONS,
  ) === 'true'
  if (complete) sealedChatSecretScopes.add(scope)
  return complete
}

async function hydrateChatSecretRecord<T>(
  key: string,
  stored: unknown,
  scope: string,
  allowPlaintextMigration: boolean,
): Promise<T> {
  const descriptor = getChatSecretStorageDescriptor(key)
  if (!descriptor) {
    throw new Error(`Unsupported chat secret storage key: ${key}`)
  }

  if (isChatSecretStorageEnvelope(stored)) {
    return openChatSecretRecord<T>(
      scope,
      descriptor.kind,
      descriptor.storageKey,
      stored,
    )
  }
  if (hasChatSecretCipherMarker(stored)) {
    throw new Error(`Invalid chat secret envelope: ${key}`)
  }
  if (!allowPlaintextMigration) {
    throw new Error(`Unsealed chat secret record rejected: ${key}`)
  }

  await setItem(
    key,
    await sealChatSecretRecord(scope, descriptor.kind, descriptor.storageKey, stored),
    scope,
  )
  return stored as T
}

async function getChatSecretItem<T>(
  key: string,
  scope: string | null = activeScope,
): Promise<T | null> {
  const storageScope = requireChatSecretScope(scope)
  const stored = await getItem<unknown>(key, storageScope)
  if (stored === null) return null
  return hydrateChatSecretRecord<T>(
    key,
    stored,
    storageScope,
    !(await isChatSecretSealComplete(storageScope)),
  )
}

async function setChatSecretItem(
  key: string,
  value: unknown,
  scope: string | null = activeScope,
): Promise<void> {
  const storageScope = requireChatSecretScope(scope)
  const descriptor = getChatSecretStorageDescriptor(key)
  if (!descriptor) {
    throw new Error(`Unsupported chat secret storage key: ${key}`)
  }
  await setItem(
    key,
    await sealChatSecretRecord(storageScope, descriptor.kind, descriptor.storageKey, value),
    storageScope,
  )
}

async function getChatSecretItemsBatch<T>(
  keys: string[],
  scope: string | null = activeScope,
): Promise<Map<string, T>> {
  if (keys.length === 0) return new Map()
  const storageScope = requireChatSecretScope(scope)
  const storedItems = await getItemsBatch<unknown>(keys, storageScope)
  const allowPlaintextMigration = !(await isChatSecretSealComplete(storageScope))
  const hydrated = await mapWithConcurrency(
    [...storedItems.entries()],
    CHAT_SECRET_SEAL_CONCURRENCY,
    async ([key, stored]) => [
      key,
      await hydrateChatSecretRecord<T>(
        key,
        stored,
        storageScope,
        allowPlaintextMigration,
      ),
    ] as const,
  )
  return new Map(hydrated)
}

async function migrateChatSecretsForScope(scope: string): Promise<void> {
  const storageScope = requireChatSecretScope(scope)
  if (await isChatSecretSealComplete(storageScope)) return

  const scopedPrefix = getScopedPrefix(storageScope)
  const allKeys = await getAppKeyValueStorage().getAllKeys()
  const secretKeys = allKeys.filter((fullKey) => (
    fullKey.startsWith(scopedPrefix)
    && getChatSecretStorageDescriptor(fullKey.slice(scopedPrefix.length)) !== null
  ))
  const storedEntries = Array.from(await getAppKeyValueStorage().multiGet(secretKeys))
  const updates = await mapWithConcurrency(
    storedEntries,
    CHAT_SECRET_SEAL_CONCURRENCY,
    async ([fullKey, raw]) => {
      if (raw === null) return undefined
      const key = fullKey.slice(scopedPrefix.length)
      const descriptor = getChatSecretStorageDescriptor(key)
      if (!descriptor) return undefined
      const parsed = JSON.parse(raw) as unknown
      if (isChatSecretStorageEnvelope(parsed)) {
        await openChatSecretRecord(
          storageScope,
          descriptor.kind,
          descriptor.storageKey,
          parsed,
        )
        return undefined
      }
      if (hasChatSecretCipherMarker(parsed)) {
        throw new Error(`Invalid chat secret envelope: ${key}`)
      }
      return [
        fullKey,
        JSON.stringify(
          await sealChatSecretRecord(
            storageScope,
            descriptor.kind,
            descriptor.storageKey,
            parsed,
          ),
        ),
      ] as [string, string]
    },
  )
  const sealedEntries = updates.filter(
    (entry): entry is [string, string] => entry !== undefined,
  )
  if (sealedEntries.length > 0) {
    await getAppKeyValueStorage().multiSet(sealedEntries)
  }
  await SecureStore.setItemAsync(
    getChatSecretSecureMarkerKey(storageScope),
    'true',
    SECURE_STORE_OPTIONS,
  )
  await getAppKeyValueStorage().setItem(getChatSecretSealMarkerKey(storageScope), 'true')
  sealedChatSecretScopes.add(storageScope)
  clearStorageCache()
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function getMessageIndexTimestamp(message: any): number | null {
  const timestamp = message?.localOrderTimestamp
    ?? message?.createdAt
    ?? message?.timestamp
    ?? message?.encryptedData?.metadata?.timestamp
  return isFiniteTimestamp(timestamp) ? timestamp : null
}

function getDecryptedIndexTimestamp(message: any): number | null {
  const timestamp = message?.localOrderTimestamp ?? message?.timestamp ?? message?.createdAt
  return isFiniteTimestamp(timestamp) ? timestamp : null
}

function sortTimedIndex(index: TimedIndexEntry[]): TimedIndexEntry[] {
  return [...index].sort((a, b) => b.timestamp - a.timestamp)
}

async function removeTimedIndexEntry(
  indexKey: string,
  id: string,
  scope: string | null = activeScope,
): Promise<void> {
  const index = await getItem<TimedIndexEntry[]>(indexKey, scope) || []
  if (index.length === 0) return
  await setItem(indexKey, index.filter((entry) => entry.id !== id), scope)
}

async function upsertTimedIndexEntry(
  indexKey: string,
  id: string,
  timestamp: number | null,
  scope: string | null = activeScope,
): Promise<void> {
  if (!isFiniteTimestamp(timestamp)) return
  const index = await getItem<TimedIndexEntry[]>(indexKey, scope) || []
  const next = sortTimedIndex([
    ...index.filter((entry) => entry.id !== id && isFiniteTimestamp(entry.timestamp)),
    { id, timestamp },
  ])
  await setItem(indexKey, next, scope)
}

async function getTimedIndexForItems(
  indexKey: string,
  ids: string[],
  itemKeyPrefix: string,
  getTimestamp: (item: any) => number | null,
  scope: string | null = activeScope,
): Promise<TimedIndexEntry[]> {
  if (ids.length === 0) return []

  const idSet = new Set(ids)
  const existing = (await getItem<TimedIndexEntry[]>(indexKey, scope) || [])
    .filter((entry) => idSet.has(entry.id) && isFiniteTimestamp(entry.timestamp))

  if (existing.length === idSet.size) {
    return sortTimedIndex(existing)
  }

  const itemsMap = await getItemsBatch<any>(ids.map((id) => `${itemKeyPrefix}${id}`), scope)
  const rebuilt = ids.flatMap((id) => {
    const item = itemsMap.get(`${itemKeyPrefix}${id}`)
    const timestamp = getTimestamp(item)
    return timestamp === null ? [] : [{ id, timestamp }]
  })
  const sorted = sortTimedIndex(rebuilt)
  await setItem(indexKey, sorted, scope)
  return sorted
}

function selectTimedPage(index: TimedIndexEntry[], options?: { limit?: number; before?: number }): string[] {
  const filtered = options?.before
    ? index.filter((entry) => entry.timestamp < options.before!)
    : index
  const limited = options?.limit ? filtered.slice(0, options.limit) : filtered
  return limited.map((entry) => entry.id)
}

function shouldSyncMessageStatus(message: any, senderIdentityId: string): boolean {
  return shouldSyncOutboundStatus(message, senderIdentityId)
}

function shouldTrackOutboundMessage(message: any, senderIdentityId: string): boolean {
  return shouldSyncMessageStatus(message, senderIdentityId)
    || hasPendingRelayDelivery(message, senderIdentityId)
}

function mayTrackOutboundMessage(message: any, senderIdentityId: string): boolean {
  return Boolean(
    message
    && message.senderIdentityId === senderIdentityId
    && (
      shouldSyncMessageStatus(message, senderIdentityId)
      || (
        !message.relayMessageId
        && ['pending', 'sending', 'sent', 'failed'].includes(message.status)
      )
    ),
  )
}

async function removeStatusSyncIndexEntry(
  senderIdentityId: string | undefined,
  messageId: string,
  scope: string | null = activeScope,
): Promise<void> {
  if (!senderIdentityId) return
  const indexKey = `${STATUS_SYNC_INDEX_KEY}${senderIdentityId}`
  await enqueueStorageMutation(
    statusSyncIndexMutationKey(senderIdentityId, scope),
    async () => {
      const index = await getItem<string[]>(indexKey, scope) || []
      if (index.length > 0) {
        await setItem(indexKey, index.filter((id) => id !== messageId), scope)
      }
      await removeItem(`${STATUS_SYNC_MARKER_KEY}${senderIdentityId}_${messageId}`, scope)
    },
  )
}

async function updateStatusSyncIndex(
  message: any,
  previous?: any | null,
  scope: string | null = activeScope,
): Promise<void> {
  const previousSenderIdentityId = previous?.senderIdentityId
  const previousTracked = Boolean(
    previousSenderIdentityId
    && shouldTrackOutboundMessage(previous, previousSenderIdentityId),
  )
  const senderIdentityId = message?.senderIdentityId
  const currentTracked = Boolean(
    senderIdentityId
    && shouldTrackOutboundMessage(message, senderIdentityId),
  )

  if (
    previousTracked
    && (
      !currentTracked
      || previousSenderIdentityId !== senderIdentityId
    )
  ) {
    await removeStatusSyncIndexEntry(previousSenderIdentityId, message.id, scope)
  }

  if (!senderIdentityId || !currentTracked) {
    return
  }

  const indexKey = `${STATUS_SYNC_INDEX_KEY}${senderIdentityId}`
  await enqueueStorageMutation(
    statusSyncIndexMutationKey(senderIdentityId, scope),
    async () => {
      const index = await getItem<string[]>(indexKey, scope) || []
      if (!index.includes(message.id)) {
        await setItem(indexKey, [...index, message.id], scope)
      }
      await setItem(`${STATUS_SYNC_MARKER_KEY}${senderIdentityId}_${message.id}`, true, scope)
    },
  )
}

async function listIndexedMessageIdsForIdentity(
  identityId: string,
  scope: string | null,
): Promise<string[]> {
  const conversationIds = await getItem<string[]>(`conversation_index_${identityId}`, scope) || []
  if (conversationIds.length === 0) return []
  const indexes = await getItemsBatch<string[]>(
    conversationIds.map((conversationId) => `message_index_${conversationId}`),
    scope,
  )
  const ids: string[] = []
  for (const conversationId of conversationIds) {
    const index = indexes.get(`message_index_${conversationId}`) || []
    ids.push(...index)
  }
  return ids
}

async function hydrateTrackedOutboundMessages(
  senderIdentityId: string,
  messageIds: string[],
  scope: string | null,
): Promise<any[]> {
  const uniqueIds = Array.from(new Set(messageIds))
  if (uniqueIds.length === 0) return []
  const messagesMap = await getItemsBatch<any>(
    uniqueIds.map((id) => `message_${id}`),
    scope,
  )
  const candidates = uniqueIds
    .map((id) => messagesMap.get(`message_${id}`))
    .filter((message): message is any => mayTrackOutboundMessage(message, senderIdentityId))
  const hydrated = await mapWithConcurrency(
    candidates,
    MESSAGE_HYDRATION_CONCURRENCY,
    (message) => hydratePersistentMessageContent(message, scope),
  )
  return hydrated.filter((message): message is any => (
    shouldTrackOutboundMessage(message, senderIdentityId)
  ))
}

async function persistRepairedStatusSyncIndex(
  senderIdentityId: string,
  messages: any[],
  scope: string | null,
): Promise<void> {
  const statusIndexKey = `${STATUS_SYNC_INDEX_KEY}${senderIdentityId}`
  const statusVersionKey = `${STATUS_SYNC_INDEX_VERSION_KEY}${senderIdentityId}`
  await enqueueStorageMutation(
    statusSyncIndexMutationKey(senderIdentityId, scope),
    async () => {
      const currentIndex = await getItem<string[]>(statusIndexKey, scope) || []
      await setItem(statusIndexKey, Array.from(new Set([
        ...currentIndex,
        ...messages.map((message) => message.id),
      ])), scope)
      await setItem(statusVersionKey, STATUS_SYNC_INDEX_VERSION, scope)
    },
  )
  await Promise.all(messages.flatMap((message) => {
    const writes = [
      setItem(`${STATUS_SYNC_MARKER_KEY}${senderIdentityId}_${message.id}`, true, scope),
    ]
    if (message.relayMessageId) {
      writes.push(setItem(`${RELAY_MESSAGE_KEY}${message.relayMessageId}`, message.id, scope))
    }
    return writes
  }))
}

/** Normalize parsed map data to Map<number, string>. */
function toNumberKeyedMap(raw: unknown): Map<number, string> {
  if (raw instanceof Map) return raw
  if (Array.isArray(raw)) return new Map(raw.map(([k, v]) => [Number(k), v]))
  if (raw && typeof raw === 'object') {
    return new Map(
      Object.entries(raw).map(([k, v]) => [Number(k), v as string])
    )
  }
  return new Map()
}

async function getConversationAtScope(
  id: string,
  scope: string | null,
): Promise<any | null> {
  return hydrateConversationPreview(
    await getItem(`conversation_${id}`, scope),
    scope,
  )
}

function conversationMutationKey(id: string, scope: string | null): string {
  return `conversation:${scope ?? 'unscoped'}:${id}`
}

function sessionMutationKey(id: string, scope: string | null): string {
  return `session:${scope ?? 'unscoped'}:${id}`
}

function messageMutationKey(id: string, scope: string | null): string {
  return `message:${scope ?? 'unscoped'}:${id}`
}

function messageIndexMutationKey(conversationId: string, scope: string | null): string {
  return `message-index:${scope ?? 'unscoped'}:${conversationId}`
}

function statusSyncIndexMutationKey(senderIdentityId: string, scope: string | null): string {
  return `status-sync-index:${scope ?? 'unscoped'}:${senderIdentityId}`
}

function decryptedMessageMutationKey(id: string, scope: string | null): string {
  return `decrypted-message:${scope ?? 'unscoped'}:${id}`
}

function decryptedMessageIndexMutationKey(conversationId: string, scope: string | null): string {
  return `decrypted-message-index:${scope ?? 'unscoped'}:${conversationId}`
}

function conversationParticipantIndexKey(localIdentityId: string, remoteIdentityId: string): string {
  return `conversation_participant_${localIdentityId}_${remoteIdentityId}`
}

async function storeConversationAtScopeUnlocked(
  conversation: any,
  scope: string | null,
): Promise<void> {
  await setItem(
    `conversation_${conversation.id}`,
    await sealConversationPreview(conversation, scope),
    scope,
  )

  const indexKey = `conversation_index_${conversation.localIdentityId}`
  await enqueueStorageMutation(`index:${scope ?? 'unscoped'}:${indexKey}`, async () => {
    const index = await getItem<string[]>(indexKey, scope) || []
    if (!index.includes(conversation.id)) {
      await setItem(indexKey, [...index, conversation.id], scope)
    }
    if (conversation.remoteIdentityId) {
      await setItem(
        conversationParticipantIndexKey(conversation.localIdentityId, conversation.remoteIdentityId),
        conversation.id,
        scope,
      )
    }
  })
}

async function storeConversationAtScope(
  conversation: any,
  scope: string | null,
): Promise<void> {
  return enqueueStorageMutation(
    conversationMutationKey(conversation.id, scope),
    () => storeConversationAtScopeUnlocked(conversation, scope),
  )
}

export class AsyncStorageAdapter implements LocalStorage {
  async storeIdentity(identity: any): Promise<void> {
    await setChatSecretItem(`identity_${identity.id}`, identity)
    
    const index = await getItem<string[]>('identity_index') || []
    if (!index.includes(identity.id)) {
      index.push(identity.id)
      await setItem('identity_index', index)
    }
  }

  async getIdentity(id: string): Promise<any | null> {
    return getChatSecretItem(`identity_${id}`)
  }

  async getIdentityByAddress(address: string): Promise<any | null> {
    const index = await getItem<string[]>('identity_index') || []
    if (index.length === 0) return null

    const keys = index.map(id => `identity_${id}`)
    const identitiesMap = await getChatSecretItemsBatch<any>(keys)
    for (const id of index) {
      const identity = identitiesMap.get(`identity_${id}`)
      if (identity?.blockchainAddress === address) {
        return identity
      }
    }
    return null
  }

  async getAllIdentities(): Promise<any[]> {
    const index = await getItem<string[]>('identity_index') || []
    if (index.length === 0) return []
    
    const keys = index.map(id => `identity_${id}`)
    const identitiesMap = await getChatSecretItemsBatch<any>(keys)
    
    return index
      .map(id => identitiesMap.get(`identity_${id}`))
      .filter((identity): identity is any => identity !== undefined)
  }

  async storeSession(session: any): Promise<void> {
    const scope = requireChatSecretScope(activeScope)
    await replayOutboundCommitWal(scope)
    await enqueueStorageMutation(sessionMutationKey(session.id, scope), async () => {
      const serializedSession = {
        ...session,
        state: serializeSessionState(session.state),
      }
      await setChatSecretItem(`session_${session.id}`, serializedSession, scope)
      
      const indexKey = `session_index_${session.remoteIdentityId}`
      const index = await getItem<string[]>(indexKey, scope) || []
      if (!index.includes(session.id)) {
        await setItem(indexKey, [...index, session.id], scope)
      }
    })
  }

  async getSession(id: string): Promise<any | null> {
    const scope = requireChatSecretScope(activeScope)
    await replayOutboundCommitWal(scope)
    await replayInboundCommitWal(scope)
    const session = await getChatSecretItem<any>(`session_${id}`, scope)
    if (!session) return null
    
    try {
      return {
        ...session,
        state: deserializeSessionState(session.state)
      }
    } catch (e) {
      console.warn(`[AsyncStorageAdapter] Corrupt session ${id}, removing:`, e)
      await removeItem(`session_${id}`)
      return null
    }
  }

  async deleteSession(id: string): Promise<void> {
    const session = await this.getSession(id)
    if (session) {
      const indexKey = `session_index_${session.remoteIdentityId}`
      const index = await getItem<string[]>(indexKey) || []
      const newIndex = index.filter(sid => sid !== id)
      await setItem(indexKey, newIndex)
    }
    await removeItem(`session_${id}`)
  }

  async storeSessionRecord(record: any): Promise<void> {
    // Serialize Maps to arrays.
    const serialized = {
      ...record,
      deviceRecords: record.deviceRecords instanceof Map 
        ? Array.from(record.deviceRecords.entries())
        : record.deviceRecords,
      sessions: record.sessions instanceof Map
        ? Array.from(record.sessions.entries())
        : record.sessions,
    }
    await setChatSecretItem(`session_record_${record.remoteIdentityId}`, serialized)
  }

  async getSessionRecord(remoteIdentityId: string): Promise<any | null> {
    const record = await getChatSecretItem<any>(`session_record_${remoteIdentityId}`)
    if (!record) return null
    
    // Restore Maps from stored arrays.
    return {
      ...record,
      deviceRecords: Array.isArray(record.deviceRecords)
        ? new Map(record.deviceRecords)
        : new Map(Object.entries(record.deviceRecords || {})),
      sessions: Array.isArray(record.sessions)
        ? new Map(record.sessions)
        : new Map(Object.entries(record.sessions || {})),
    }
  }

  async getActiveSession(remoteIdentityId: string): Promise<any | null> {
    const record = await this.getSessionRecord(remoteIdentityId)
    if (!record?.activeSessionId) return null
    return this.getSession(record.activeSessionId)
  }

  async getAllSessions(remoteIdentityId: string): Promise<any[]> {
    const indexKey = `session_index_${remoteIdentityId}`
    const index = await getItem<string[]>(indexKey) || []
    if (index.length === 0) return []
    
    const keys = index.map(id => `session_${id}`)
    const sessionsMap = await getChatSecretItemsBatch<any>(keys)
    
    return index
      .map(id => {
        const session = sessionsMap.get(`session_${id}`)
        if (!session) return undefined
        try {
          return {
            ...session,
            state: deserializeSessionState(session.state)
          }
        } catch (e) {
          console.warn(`[AsyncStorageAdapter] Corrupt session ${id} (skipping):`, e)
          removeItem(`session_${id}`).catch(() => {})
          return undefined
        }
      })
      .filter((session): session is any => session !== undefined)
  }

  async setActiveSession(remoteIdentityId: string, sessionId: string): Promise<void> {
    const record = await this.getSessionRecord(remoteIdentityId) || {
      remoteIdentityId,
      deviceRecords: new Map(),
      sessions: new Map(),
      activeSessionId: null,
      isStale: false,
      updatedAt: Date.now()
    }
    record.activeSessionId = sessionId
    await this.storeSessionRecord(record)
  }

  async storePrivateKeyBundle(identityId: string, bundle: any): Promise<void> {
    const serialized = {
      ...bundle,
      oneTimePreKeyPrivates: bundle.oneTimePreKeyPrivates instanceof Map
        ? Array.from(bundle.oneTimePreKeyPrivates.entries())
        : bundle.oneTimePreKeyPrivates,
      mlkemOneTimePreKeyPrivates: bundle.mlkemOneTimePreKeyPrivates instanceof Map
        ? Array.from(bundle.mlkemOneTimePreKeyPrivates.entries())
        : bundle.mlkemOneTimePreKeyPrivates,
    }
    await setChatSecretItem(`private_bundle_${identityId}`, serialized)
  }

  async getPrivateKeyBundle(identityId: string): Promise<any | null> {
    const bundle = await getChatSecretItem<any>(`private_bundle_${identityId}`)
    if (!bundle) return null

    return {
      ...bundle,
      oneTimePreKeyPrivates: toNumberKeyedMap(bundle.oneTimePreKeyPrivates),
      mlkemOneTimePreKeyPrivates: toNumberKeyedMap(bundle.mlkemOneTimePreKeyPrivates),
    }
  }

  async storePublicKeyBundle(identityId: string, bundle: any): Promise<void> {
    await setItem(`public_bundle_${identityId}`, bundle)
  }

  async getPublicKeyBundle(identityId: string): Promise<any | null> {
    return getItem(`public_bundle_${identityId}`)
  }

  async storeConversation(conversation: any): Promise<void> {
    const scope = activeScope
    await storeConversationAtScope(conversation, scope)
  }

  async getConversation(id: string): Promise<any | null> {
    const scope = activeScope
    if (scope) {
      await replayOutboundCommitWal(scope)
      await replayInboundCommitWal(scope)
    }
    return getConversationAtScope(id, scope)
  }

  async getConversationByParticipants(localId: string, remoteId: string): Promise<any | null> {
    const scope = activeScope
    const indexedId = await getItem<string>(
      conversationParticipantIndexKey(localId, remoteId),
      scope,
    )
    if (indexedId) {
      const indexedConversation = await getConversationAtScope(indexedId, scope)
      if (
        indexedConversation?.localIdentityId === localId
        && indexedConversation.remoteIdentityId === remoteId
      ) {
        return indexedConversation
      }
      await removeItem(conversationParticipantIndexKey(localId, remoteId), scope)
    }
    const indexKey = `conversation_index_${localId}`
    const index = await getItem<string[]>(indexKey, scope) || []

    if (index.length === 0) return null

    const keys = index.map(id => `conversation_${id}`)
    const conversationsMap = await getItemsBatch<any>(keys, scope)
    for (const id of index) {
      const conv = await hydrateConversationPreview(
        conversationsMap.get(`conversation_${id}`),
        scope,
      )
      if (conv?.remoteIdentityId === remoteId) {
        await setItem(conversationParticipantIndexKey(localId, remoteId), conv.id, scope)
        return conv
      }
    }
    return null
  }

  async getConversations(identityId: string): Promise<any[]> {
    const scope = activeScope
    const indexKey = `conversation_index_${identityId}`
    const index = await getItem<string[]>(indexKey, scope) || []
    
    if (index.length === 0) return []
    
    const keys = index.map(id => `conversation_${id}`)
    const conversationsMap = await getItemsBatch<any>(keys, scope)
    
    const storedConversations = index
      .map(id => conversationsMap.get(`conversation_${id}`))
      .filter((conv): conv is any => conv !== undefined)
    const conversations = await mapWithConcurrency(
      storedConversations,
      MESSAGE_HYDRATION_CONCURRENCY,
      (conversation) => hydrateConversationPreview(conversation, scope),
    )
    
    return conversations.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
  }

  async updateConversation(id: string, updates: any): Promise<void> {
    const scope = activeScope
    await enqueueStorageMutation(conversationMutationKey(id, scope), async () => {
      const conv = await getConversationAtScope(id, scope)
      if (!conv) return
      await storeConversationAtScopeUnlocked(
        { ...conv, ...updates, updatedAt: Date.now() },
        scope,
      )
    })
  }

  async rekeyConversation(sourceConversationId: string, targetConversationId: string): Promise<void> {
    if (sourceConversationId === targetConversationId) return

    const conversation = await this.getConversation(sourceConversationId)
    const encryptedMessages = await this.getMessages(sourceConversationId)
    const decryptedMessages = await this.getDecryptedMessages(sourceConversationId)

    if (conversation) {
      await this.storeConversation({
        ...conversation,
        id: targetConversationId,
        updatedAt: Date.now(),
      })
    }

    for (const message of encryptedMessages) {
      await this.storeMessage({
        ...message,
        conversationId: targetConversationId,
      })
    }

    for (const message of decryptedMessages) {
      await this.storeDecryptedMessage({
        ...message,
        conversationId: targetConversationId,
      })
    }

    if (conversation?.localIdentityId) {
      const indexKey = `conversation_index_${conversation.localIdentityId}`
      const index = await getItem<string[]>(indexKey) || []
      await setItem(indexKey, index.filter((id) => id !== sourceConversationId))
    }

    await removeItem(`conversation_${sourceConversationId}`)
    await removeItem(`message_index_${sourceConversationId}`)
    await removeItem(`decrypted_index_${sourceConversationId}`)
  }

  private async getMessageAtScope(id: string, scope: string | null): Promise<any | null> {
    return hydratePersistentMessageContent(await getItem(`message_${id}`, scope), scope)
  }

  private async storeMessageUnlocked(message: any, scope: string | null): Promise<void> {
    const existing = await this.getMessageAtScope(message.id, scope)
    if (existing?.relayMessageId && existing.relayMessageId !== message.relayMessageId) {
      await removeItem(`${RELAY_MESSAGE_KEY}${existing.relayMessageId}`, scope)
    }

    await setItem(
      `message_${message.id}`,
      await sealPersistentMessageContent(message, scope),
      scope,
    )
    if (message.relayMessageId) {
      await setItem(`${RELAY_MESSAGE_KEY}${message.relayMessageId}`, message.id, scope)
    }
    await updateStatusSyncIndex(message, existing, scope)
    
    const indexKey = `message_index_${message.conversationId}`
    await enqueueStorageMutation(messageIndexMutationKey(message.conversationId, scope), async () => {
      const index = await getItem<string[]>(indexKey, scope) || []
      if (!index.includes(message.id)) {
        await setItem(indexKey, [...index, message.id], scope)
      }
      await upsertTimedIndexEntry(
        `${MESSAGE_TIME_INDEX_KEY}${message.conversationId}`,
        message.id,
        getMessageIndexTimestamp(message),
        scope,
      )
    })
  }

  async commitOutboundMessage(commit: OutboundMessageCommit): Promise<void> {
    const scope = requireChatSecretScope(activeScope)
    return enqueueStorageMutation(`outbound-commit:${scope}`, async () => {
      await replayOutboundCommitWal(scope)
      return enqueueStorageMutation(sessionMutationKey(commit.session.id, scope), () => (
        enqueueStorageMutation(
          conversationMutationKey(commit.message.conversationId, scope),
          () => enqueueStorageMutation(
            messageMutationKey(commit.message.id, scope),
            () => enqueueStorageMutation(
              messageIndexMutationKey(commit.message.conversationId, scope),
              async () => {
                const conversation = await getConversationAtScope(
                  commit.message.conversationId,
                  scope,
                )
                if (!conversation) {
                  throw new Error('Conversation is not available for outbound commit')
                }

                const sessionKey = `session_${commit.session.id}`
                const sessionIndexKey = `session_index_${commit.session.remoteIdentityId}`
                const messageKey = `message_${commit.message.id}`
                const messageIndexKey = `message_index_${commit.message.conversationId}`
                const messageTimeIndexKey =
                  `${MESSAGE_TIME_INDEX_KEY}${commit.message.conversationId}`
                const conversationKey = `conversation_${commit.message.conversationId}`
                const [sessionIndex, messageIndex, messageTimeIndex] = await Promise.all([
                  getItem<string[]>(sessionIndexKey, scope),
                  getItem<string[]>(messageIndexKey, scope),
                  getItem<TimedIndexEntry[]>(messageTimeIndexKey, scope),
                ])
                const messageTimestamp = getMessageIndexTimestamp(commit.message)
                if (!isFiniteTimestamp(messageTimestamp)) {
                  throw new Error('Outbound message timestamp is invalid')
                }

                const serializedSession = {
                  ...commit.session,
                  state: serializeSessionState(commit.session.state),
                }
                const updatedConversation = {
                  ...conversation,
                  ...commit.conversationUpdate,
                  updatedAt: Date.now(),
                }
                const nextSessionIndex = sessionIndex?.includes(commit.session.id)
                  ? sessionIndex
                  : [...(sessionIndex ?? []), commit.session.id]
                const nextMessageIndex = messageIndex?.includes(commit.message.id)
                  ? messageIndex
                  : [...(messageIndex ?? []), commit.message.id]
                const nextMessageTimeIndex = sortTimedIndex([
                  ...(messageTimeIndex ?? []).filter((entry) => (
                    entry.id !== commit.message.id && isFiniteTimestamp(entry.timestamp)
                  )),
                  { id: commit.message.id, timestamp: messageTimestamp },
                ])
                const [sealedSession, sealedMessage, sealedPreview] = await Promise.all([
                  sealChatSecretRecord(
                    scope,
                    'session',
                    sessionKey,
                    serializedSession,
                  ),
                  sealPersistentMessageContent(commit.message, scope),
                  sealConversationPreview(updatedConversation, scope),
                ])
                const entries: Array<[string, string]> = [
                  [
                    getFullKey(sessionKey, scope),
                    JSON.stringify(sealedSession),
                  ],
                  [getFullKey(sessionIndexKey, scope), JSON.stringify(nextSessionIndex)],
                  [
                    getFullKey(messageKey, scope),
                    JSON.stringify(sealedMessage),
                  ],
                  [getFullKey(messageIndexKey, scope), JSON.stringify(nextMessageIndex)],
                  [getFullKey(messageTimeIndexKey, scope), JSON.stringify(nextMessageTimeIndex)],
                  [
                    getFullKey(conversationKey, scope),
                    JSON.stringify(sealedPreview),
                  ],
                ]
                const wal: OutboundCommitWal = {
                  v: 1,
                  scope,
                  entries,
                }
                const walKey = getFullKey(OUTBOUND_COMMIT_WAL_KEY, scope)
                const walCipher = await sealLocalCacheText(
                  scope,
                  'chat-secret',
                  JSON.stringify(wal),
                  getOutboundCommitWalAad(scope),
                )

                cleanOutboundCommitScopes.delete(scope)
                await getAppKeyValueStorage().setItem(walKey, JSON.stringify(walCipher))
                await applyOutboundCommitWal(wal, scope)
                await getAppKeyValueStorage().removeItem(walKey)
                deleteCache(walKey)
                cleanOutboundCommitScopes.add(scope)
              },
            ),
          ),
        )
      ))
    })
  }

  async commitInboundMessage(commit: InboundMessageCommit): Promise<void> {
    const scope = requireChatSecretScope(activeScope)
    return enqueueStorageMutation(`inbound-commit:${scope}`, async () => {
      await replayOutboundCommitWal(scope)
      await replayInboundCommitWal(scope)

      const conversation = await getConversationAtScope(commit.message.conversationId, scope)
      if (!conversation) {
        throw new Error('Conversation is not available for inbound commit')
      }

      const sessionKey = `session_${commit.session.id}`
      const sessionIndexKey = `session_index_${commit.session.remoteIdentityId}`
      const messageKey = `message_${commit.message.id}`
      const relayMessageKey = commit.message.relayMessageId
        ? `${RELAY_MESSAGE_KEY}${commit.message.relayMessageId}`
        : null
      const messageIndexKey = `message_index_${commit.message.conversationId}`
      const messageTimeIndexKey = `${MESSAGE_TIME_INDEX_KEY}${commit.message.conversationId}`
      const processedMessageKey = `processed_${commit.processedMessage.messageId}`
      const processedIndexKey = 'processed_index'
      const conversationKey = `conversation_${commit.message.conversationId}`
      const decryptedKey = `decrypted_${commit.decryptedMessage.id}`
      const decryptedIndexKey = `decrypted_index_${commit.decryptedMessage.conversationId}`
      const decryptedTimeIndexKey =
        `${DECRYPTED_TIME_INDEX_KEY}${commit.decryptedMessage.conversationId}`
      const sessionRecordKey = commit.sessionRecord
        ? `session_record_${commit.sessionRecord.remoteIdentityId}`
        : null
      const serializedRecord = commit.sessionRecord
        ? {
            ...commit.sessionRecord,
            deviceRecords: Array.from(commit.sessionRecord.deviceRecords.entries()),
            sessions: Array.from(commit.sessionRecord.sessions.entries()),
          }
        : null
      const privateBundleKey = commit.privateKeyBundle
        ? `private_bundle_${commit.privateKeyBundle.identityId}`
        : null
      const serializedBundle = commit.privateKeyBundle
        ? {
            ...commit.privateKeyBundle.bundle,
            oneTimePreKeyPrivates:
              commit.privateKeyBundle.bundle.oneTimePreKeyPrivates instanceof Map
                ? Array.from(commit.privateKeyBundle.bundle.oneTimePreKeyPrivates.entries())
                : commit.privateKeyBundle.bundle.oneTimePreKeyPrivates,
            mlkemOneTimePreKeyPrivates:
              commit.privateKeyBundle.bundle.mlkemOneTimePreKeyPrivates instanceof Map
                ? Array.from(commit.privateKeyBundle.bundle.mlkemOneTimePreKeyPrivates.entries())
                : commit.privateKeyBundle.bundle.mlkemOneTimePreKeyPrivates,
          }
        : null
      const [
        sessionIndex,
        messageIndex,
        messageTimeIndex,
        processedIndex,
        decryptedIndex,
        decryptedTimeIndex,
      ] = await Promise.all([
        getItem<string[]>(sessionIndexKey, scope),
        getItem<string[]>(messageIndexKey, scope),
        getItem<TimedIndexEntry[]>(messageTimeIndexKey, scope),
        getItem<string[]>(processedIndexKey, scope),
        shouldPersistDecryptedMessages
          ? getItem<string[]>(decryptedIndexKey, scope)
          : Promise.resolve(null),
        shouldPersistDecryptedMessages
          ? getItem<TimedIndexEntry[]>(decryptedTimeIndexKey, scope)
          : Promise.resolve(null),
      ])

      const messageTimestamp = getMessageIndexTimestamp(commit.message)
      if (!isFiniteTimestamp(messageTimestamp)) {
        throw new Error('Inbound message timestamp is invalid')
      }

      const serializedSession = {
        ...commit.session,
        state: serializeSessionState(commit.session.state),
      }
      const updatedConversation = {
        ...conversation,
        ...commit.conversationUpdate,
        updatedAt: Date.now(),
      }
      const nextSessionIndex = sessionIndex?.includes(commit.session.id)
        ? sessionIndex
        : [...(sessionIndex ?? []), commit.session.id]
      const nextMessageIndex = messageIndex?.includes(commit.message.id)
        ? messageIndex
        : [...(messageIndex ?? []), commit.message.id]
      const nextMessageTimeIndex = sortTimedIndex([
        ...(messageTimeIndex ?? []).filter((entry) => (
          entry.id !== commit.message.id && isFiniteTimestamp(entry.timestamp)
        )),
        { id: commit.message.id, timestamp: messageTimestamp },
      ])
      const nextProcessedIndex = processedIndex?.includes(commit.processedMessage.messageId)
        ? processedIndex
        : [...(processedIndex ?? []), commit.processedMessage.messageId]
      let nextDecryptedIndex: string[] | null = null
      let nextDecryptedTimeIndex: TimedIndexEntry[] | null = null
      if (shouldPersistDecryptedMessages) {
        const decryptedTimestamp = getDecryptedIndexTimestamp(commit.decryptedMessage)
        if (!isFiniteTimestamp(decryptedTimestamp)) {
          throw new Error('Inbound decrypted message timestamp is invalid')
        }
        nextDecryptedIndex = decryptedIndex?.includes(commit.decryptedMessage.id)
          ? decryptedIndex
          : [...(decryptedIndex ?? []), commit.decryptedMessage.id]
        nextDecryptedTimeIndex = sortTimedIndex([
          ...(decryptedTimeIndex ?? []).filter((entry) => (
            entry.id !== commit.decryptedMessage.id && isFiniteTimestamp(entry.timestamp)
          )),
          { id: commit.decryptedMessage.id, timestamp: decryptedTimestamp },
        ])
      }

      const [
        sealedSession,
        sealedMessage,
        sealedPreview,
        sealedSessionRecord,
        sealedPrivateBundle,
      ] = await Promise.all([
        sealChatSecretRecord(scope, 'session', sessionKey, serializedSession),
        sealPersistentMessageContent(commit.message, scope),
        sealConversationPreview(updatedConversation, scope),
        serializedRecord && sessionRecordKey
          ? sealChatSecretRecord(scope, 'session-record', sessionRecordKey, serializedRecord)
          : Promise.resolve(null),
        serializedBundle && privateBundleKey
          ? sealChatSecretRecord(scope, 'private-bundle', privateBundleKey, serializedBundle)
          : Promise.resolve(null),
      ])
      const entries: Array<[string, string]> = [
        [getFullKey(sessionKey, scope), JSON.stringify(sealedSession)],
        [getFullKey(sessionIndexKey, scope), JSON.stringify(nextSessionIndex)],
        [getFullKey(messageKey, scope), JSON.stringify(sealedMessage)],
        [getFullKey(messageIndexKey, scope), JSON.stringify(nextMessageIndex)],
        [getFullKey(messageTimeIndexKey, scope), JSON.stringify(nextMessageTimeIndex)],
        [getFullKey(processedMessageKey, scope), JSON.stringify(commit.processedMessage)],
        [getFullKey(processedIndexKey, scope), JSON.stringify(nextProcessedIndex)],
        [getFullKey(conversationKey, scope), JSON.stringify(sealedPreview)],
      ]

      if (relayMessageKey) {
        entries.push([getFullKey(relayMessageKey, scope), commit.message.id])
      }
      if (sealedSessionRecord && sessionRecordKey) {
        entries.push([
          getFullKey(sessionRecordKey, scope),
          JSON.stringify(sealedSessionRecord),
        ])
      }
      if (sealedPrivateBundle && privateBundleKey) {
        entries.push([
          getFullKey(privateBundleKey, scope),
          JSON.stringify(sealedPrivateBundle),
        ])
      }
      if (commit.publicKeyBundle) {
        entries.push([
          getFullKey(`public_bundle_${commit.publicKeyBundle.identityId}`, scope),
          JSON.stringify(commit.publicKeyBundle.bundle),
        ])
      }
      if (shouldPersistDecryptedMessages && nextDecryptedIndex && nextDecryptedTimeIndex) {
        entries.push(
          [getFullKey(decryptedKey, scope), JSON.stringify(commit.decryptedMessage)],
          [getFullKey(decryptedIndexKey, scope), JSON.stringify(nextDecryptedIndex)],
          [getFullKey(decryptedTimeIndexKey, scope), JSON.stringify(nextDecryptedTimeIndex)],
        )
      }

      const wal: InboundCommitWal = {
        v: 1,
        scope,
        entries,
      }
      const walKey = getFullKey(INBOUND_COMMIT_WAL_KEY, scope)
      const walCipher = await sealLocalCacheText(
        scope,
        'chat-secret',
        JSON.stringify(wal),
        getInboundCommitWalAad(scope),
      )

      cleanInboundCommitScopes.delete(scope)
      await getAppKeyValueStorage().setItem(walKey, JSON.stringify(walCipher))
      await applyOutboundCommitWal(wal, scope, INBOUND_COMMIT_WAL_KEY)
      await getAppKeyValueStorage().removeItem(walKey)
      deleteCache(walKey)
      cleanInboundCommitScopes.add(scope)

      if (!shouldPersistDecryptedMessages) {
        volatileDecryptedMessages.set(
          getFullKey(`decrypted_${commit.decryptedMessage.id}`, scope),
          commit.decryptedMessage,
        )
        const decryptedIndexKey = getFullKey(
          `decrypted_index_${commit.decryptedMessage.conversationId}`,
          scope,
        )
        const decryptedIndex = volatileDecryptedIndexes.get(decryptedIndexKey) ?? []
        if (!decryptedIndex.includes(commit.decryptedMessage.id)) {
          volatileDecryptedIndexes.set(decryptedIndexKey, [
            ...decryptedIndex,
            commit.decryptedMessage.id,
          ])
        }
      }
    })
  }

  async storeMessage(message: any): Promise<void> {
    const scope = activeScope
    await enqueueStorageMutation(
      messageMutationKey(message.id, scope),
      () => this.storeMessageUnlocked(message, scope),
    )
  }

  async getMessage(id: string): Promise<any | null> {
    const scope = activeScope
    if (scope) {
      await replayOutboundCommitWal(scope)
      await replayInboundCommitWal(scope)
    }
    return this.getMessageAtScope(id, scope)
  }

  async getMessageByRelayId(relayMessageId: string): Promise<any | null> {
    if (activeScope) {
      await replayOutboundCommitWal(activeScope)
      await replayInboundCommitWal(activeScope)
    }
    const linkedMessageId = await getItem<string>(`${RELAY_MESSAGE_KEY}${relayMessageId}`)
    if (!linkedMessageId) return null
    return this.getMessage(linkedMessageId)
  }

  async getMessages(conversationId: string, options?: { limit?: number; before?: number }): Promise<any[]> {
    const scope = activeScope
    const indexKey = `message_index_${conversationId}`
    const index = await getItem<string[]>(indexKey, scope) || []
    
    if (index.length === 0) return []

    const timedIndex = await getTimedIndexForItems(
      `${MESSAGE_TIME_INDEX_KEY}${conversationId}`,
      index,
      'message_',
      getMessageIndexTimestamp,
      scope,
    )
    const ids = selectTimedPage(timedIndex, options)
    if (ids.length === 0) return []

    const keys = ids.map(id => `message_${id}`)
    const messagesMap = await getItemsBatch<any>(keys, scope)
    
    const messages = ids
      .map(id => messagesMap.get(`message_${id}`))
      .filter((msg): msg is any => msg !== undefined)

    return mapWithConcurrency(
      messages,
      MESSAGE_HYDRATION_CONCURRENCY,
      (message) => hydratePersistentMessageContent(message, scope),
    )
  }

  private async getTrackedOutboundMessages(senderIdentityId: string): Promise<any[]> {
    const scope = activeScope
    const repairKey = `${scope ?? 'unscoped'}:${senderIdentityId}`
    const statusIndexKey = `${STATUS_SYNC_INDEX_KEY}${senderIdentityId}`
    const statusVersionKey = `${STATUS_SYNC_INDEX_VERSION_KEY}${senderIdentityId}`
    const statusIndex = await getItem<string[]>(statusIndexKey, scope)
    const statusIndexVersion = await getItem<number>(statusVersionKey, scope)
    if (!repairedStatusSyncSenders.has(repairKey)) {
      if (statusIndex && statusIndexVersion === STATUS_SYNC_INDEX_VERSION) {
        repairedStatusSyncSenders.add(repairKey)
      } else {
        const conversationMessageIds = await listIndexedMessageIdsForIdentity(senderIdentityId, scope)
        if (conversationMessageIds.length > 0) {
          const messages = await hydrateTrackedOutboundMessages(
            senderIdentityId,
            conversationMessageIds,
            scope,
          )
          await persistRepairedStatusSyncIndex(senderIdentityId, messages, scope)
          repairedStatusSyncSenders.add(repairKey)
          return messages
        }
        await enqueueStorageMutation(
          statusSyncIndexMutationKey(senderIdentityId, scope),
          async () => {
            const currentIndex = await getItem<string[]>(statusIndexKey, scope) || []
            await setItem(statusIndexKey, currentIndex, scope)
            await setItem(statusVersionKey, STATUS_SYNC_INDEX_VERSION, scope)
          },
        )
        repairedStatusSyncSenders.add(repairKey)
      }
    }

    const indexedIds = Array.from(new Set(statusIndex || []))
    if (indexedIds.length === 0 && statusIndexVersion !== STATUS_SYNC_INDEX_VERSION) {
      const conversationMessageIds = await listIndexedMessageIdsForIdentity(senderIdentityId, scope)
      indexedIds.push(...conversationMessageIds)
    }
    if (indexedIds.length === 0) return []
    const messages = await hydrateTrackedOutboundMessages(senderIdentityId, indexedIds, scope)
    const liveIds = new Set(messages.map((message) => message.id))
    const staleIds = new Set(indexedIds.filter((id) => !liveIds.has(id)))
    await enqueueStorageMutation(
      statusSyncIndexMutationKey(senderIdentityId, scope),
      async () => {
        const currentIndex = await getItem<string[]>(statusIndexKey, scope) || []
        await setItem(statusIndexKey, Array.from(new Set([
          ...currentIndex.filter((id) => !staleIds.has(id)),
          ...messages.map((message) => message.id),
        ])), scope)
      },
    )
    if (messages.length !== indexedIds.length) {
      await Promise.all(indexedIds
        .filter((id) => !liveIds.has(id))
        .map((id) => removeItem(`${STATUS_SYNC_MARKER_KEY}${senderIdentityId}_${id}`, scope)))
    }
    return messages
  }

  async getMessagesNeedingStatusSync(senderIdentityId: string): Promise<any[]> {
    const messages = await this.getTrackedOutboundMessages(senderIdentityId)
    return messages.filter((message) => shouldSyncMessageStatus(message, senderIdentityId))
  }

  async getPendingRelayDeliveries(senderIdentityId: string): Promise<any[]> {
    const messages = await this.getTrackedOutboundMessages(senderIdentityId)
    return messages.filter((message) => hasPendingRelayDelivery(message, senderIdentityId))
  }

  async linkRelayMessage(
    messageId: string,
    relayMessageId: string,
    relayDeliveryToken?: string,
  ): Promise<Message | null> {
    const scope = activeScope
    return enqueueStorageMutation(messageMutationKey(messageId, scope), async () => {
      const message = await this.getMessageAtScope(messageId, scope)
      if (!message) return null
      const completed = completeRelayDeliveryOutbox(
        message,
        relayMessageId,
        relayDeliveryToken,
      )
      if (completed !== message) {
        await this.storeMessageUnlocked(completed, scope)
      }
      return completed
    })
  }

  async updateMessageStatus(
    id: string,
    status: any,
    options?: MessageStatusUpdateOptions,
  ): Promise<void> {
    const scope = activeScope
    await enqueueStorageMutation(messageMutationKey(id, scope), async () => {
      const msg = await this.getMessageAtScope(id, scope)
      if (!msg) return
      if (compareMessageStatus(status, msg.status) < 0) return
      const wasRead = msg.status === 'read'
      await this.storeMessageUnlocked({
        ...msg,
        status,
        ...(status === 'delivered' ? { deliveredAt: Date.now() } : {}),
        ...(status === 'read' ? { readAt: Date.now() } : {}),
        ...(status === 'read'
          && !wasRead
          && msg.relayReadReceiptEligible === undefined
          && options?.relayReadReceiptEligible !== undefined
          ? { relayReadReceiptEligible: options.relayReadReceiptEligible }
          : {}),
      }, scope)

      await enqueueStorageMutation(
        decryptedMessageMutationKey(id, scope),
        () => this.updateDecryptedMessageAtScope(id, { status }, scope),
      )
    })
  }

  async deleteMessage(id: string): Promise<void> {
    const scope = activeScope
    await enqueueStorageMutation(messageMutationKey(id, scope), async () => {
      const message = await this.getMessageAtScope(id, scope)
      if (!message) return

      if (message.relayMessageId) {
        await removeItem(`${RELAY_MESSAGE_KEY}${message.relayMessageId}`, scope)
      }
      await removeStatusSyncIndexEntry(message.senderIdentityId, id, scope)
      await removeItem(`message_${id}`, scope)

      const indexKey = `message_index_${message.conversationId}`
      await enqueueStorageMutation(messageIndexMutationKey(message.conversationId, scope), async () => {
        const index = await getItem<string[]>(indexKey, scope) || []
        await setItem(indexKey, index.filter((messageId) => messageId !== id), scope)
        await removeTimedIndexEntry(`${MESSAGE_TIME_INDEX_KEY}${message.conversationId}`, id, scope)
      })
    })
  }

  // Decrypted message cache.

  async storeDecryptedMessage(message: any): Promise<void> {
    const scope = activeScope
    await enqueueStorageMutation(decryptedMessageMutationKey(message.id, scope), async () => {
      if (!shouldPersistDecryptedMessages) {
        volatileDecryptedMessages.set(getFullKey(`decrypted_${message.id}`, scope), message)
        const indexKey = getFullKey(`decrypted_index_${message.conversationId}`, scope)
        const index = volatileDecryptedIndexes.get(indexKey) ?? []
        if (!index.includes(message.id)) {
          volatileDecryptedIndexes.set(indexKey, [...index, message.id])
        }
        return
      }

      await setItem(`decrypted_${message.id}`, message, scope)
      await enqueueStorageMutation(
        decryptedMessageIndexMutationKey(message.conversationId, scope),
        async () => {
          const indexKey = `decrypted_index_${message.conversationId}`
          const index = await getItem<string[]>(indexKey, scope) || []
          if (!index.includes(message.id)) {
            await setItem(indexKey, [...index, message.id], scope)
          }
          await upsertTimedIndexEntry(
            `${DECRYPTED_TIME_INDEX_KEY}${message.conversationId}`,
            message.id,
            getDecryptedIndexTimestamp(message),
            scope,
          )
        },
      )
    })
  }

  async getDecryptedMessage(id: string): Promise<any | null> {
    if (!shouldPersistDecryptedMessages) {
      return volatileDecryptedMessages.get(getFullKey(`decrypted_${id}`)) ?? null
    }

    return getItem(`decrypted_${id}`)
  }

  async getDecryptedMessages(conversationId: string, options?: { limit?: number; before?: number }): Promise<any[]> {
    const scope = activeScope
    if (!shouldPersistDecryptedMessages) {
      const index = volatileDecryptedIndexes.get(getFullKey(`decrypted_index_${conversationId}`, scope)) ?? []
      let messages = index
        .map((id) => volatileDecryptedMessages.get(getFullKey(`decrypted_${id}`, scope)))
        .filter((msg): msg is any => msg !== undefined)

      if (options?.before) {
        messages = messages.filter(msg => msg.timestamp < options.before!)
      }

      messages.sort((a, b) => (
        (b.localOrderTimestamp ?? b.timestamp) - (a.localOrderTimestamp ?? a.timestamp)
      ))

      return options?.limit ? messages.slice(0, options.limit) : messages
    }

    const indexKey = `decrypted_index_${conversationId}`
    const index = await getItem<string[]>(indexKey, scope) || []
    
    if (index.length === 0) return []

    const timedIndex = await getTimedIndexForItems(
      `${DECRYPTED_TIME_INDEX_KEY}${conversationId}`,
      index,
      'decrypted_',
      getDecryptedIndexTimestamp,
      scope,
    )
    const ids = selectTimedPage(timedIndex, options)
    if (ids.length === 0) return []

    const keys = ids.map(id => `decrypted_${id}`)
    const messagesMap = await getItemsBatch<any>(keys, scope)
    
    const messages = ids
      .map(id => messagesMap.get(`decrypted_${id}`))
      .filter((msg): msg is any => msg !== undefined)
    return messages
  }

  private async updateDecryptedMessageAtScope(
    id: string,
    updates: any,
    scope: string | null,
  ): Promise<void> {
    if (!shouldPersistDecryptedMessages) {
      const messageKey = getFullKey(`decrypted_${id}`, scope)
      const decrypted = volatileDecryptedMessages.get(messageKey)
      if (decrypted) {
        volatileDecryptedMessages.set(messageKey, {
          ...decrypted,
          ...updates,
        })
      }
      return
    }

    const decrypted = await getItem<any>(`decrypted_${id}`, scope)
    if (!decrypted) {
      return
    }

    await setItem(`decrypted_${id}`, {
      ...decrypted,
      ...updates,
    }, scope)
    await enqueueStorageMutation(
      decryptedMessageIndexMutationKey(decrypted.conversationId, scope),
      () => upsertTimedIndexEntry(
        `${DECRYPTED_TIME_INDEX_KEY}${decrypted.conversationId}`,
        id,
        getDecryptedIndexTimestamp({ ...decrypted, ...updates }),
        scope,
      ),
    )
  }

  async updateDecryptedMessage(id: string, updates: any): Promise<void> {
    const scope = activeScope
    await enqueueStorageMutation(
      decryptedMessageMutationKey(id, scope),
      () => this.updateDecryptedMessageAtScope(id, updates, scope),
    )
  }

  async deleteDecryptedMessage(id: string): Promise<void> {
    const scope = activeScope
    await enqueueStorageMutation(decryptedMessageMutationKey(id, scope), async () => {
      if (!shouldPersistDecryptedMessages) {
        const messageKey = getFullKey(`decrypted_${id}`, scope)
        const message = volatileDecryptedMessages.get(messageKey)
        volatileDecryptedMessages.delete(messageKey)
        if (!message) return

        const indexKey = getFullKey(`decrypted_index_${message.conversationId}`, scope)
        const index = volatileDecryptedIndexes.get(indexKey) ?? []
        volatileDecryptedIndexes.set(indexKey, index.filter((messageId) => messageId !== id))
        return
      }

      const message = await getItem<any>(`decrypted_${id}`, scope)
      await removeItem(`decrypted_${id}`, scope)
      if (!message) return

      await enqueueStorageMutation(
        decryptedMessageIndexMutationKey(message.conversationId, scope),
        async () => {
          const indexKey = `decrypted_index_${message.conversationId}`
          const index = await getItem<string[]>(indexKey, scope) || []
          await setItem(indexKey, index.filter((messageId) => messageId !== id), scope)
          await removeTimedIndexEntry(
            `${DECRYPTED_TIME_INDEX_KEY}${message.conversationId}`,
            id,
            scope,
          )
        },
      )
    })
  }

  async storeProcessedMessage(record: any): Promise<void> {
    await setItem(`processed_${record.messageId}`, record)
    
    const index = await getItem<string[]>('processed_index') || []
    if (!index.includes(record.messageId)) {
      index.push(record.messageId)
      await setItem('processed_index', index)
    }
  }

  async getProcessedMessage(messageId: string): Promise<any | null> {
    return getItem(`processed_${messageId}`)
  }

  async isMessageProcessed(messageId: string): Promise<boolean> {
    const record = await this.getProcessedMessage(messageId)
    return record !== null
  }

  async cleanupProcessedMessages(maxAgeMs: number): Promise<number> {
    const index = await getItem<string[]>('processed_index') || []
    const cutoff = Date.now() - maxAgeMs
    let deleted = 0
    const newIndex: string[] = []
    
    for (const messageId of index) {
      const record = await this.getProcessedMessage(messageId)
      if (record && record.processedAt < cutoff) {
        await removeItem(`processed_${messageId}`)
        deleted++
      } else {
        newIndex.push(messageId)
      }
    }
    
    await setItem('processed_index', newIndex)
    return deleted
  }

  async storeRetryRequestRecord(record: RetryRequestRecord): Promise<void> {
    const existing = await this.getRetryRequestRecord(record.key)
    if (existing?.relayMessageId && existing.relayMessageId !== record.relayMessageId) {
      await removeItem(`${RETRY_REQUEST_BY_RELAY_KEY}${existing.relayMessageId}`)
    }

    await setItem(`${RETRY_REQUEST_KEY}${record.key}`, record)
    if (record.relayMessageId) {
      await setItem(`${RETRY_REQUEST_BY_RELAY_KEY}${record.relayMessageId}`, record.key)
    }
  }

  async getRetryRequestRecord(key: string): Promise<RetryRequestRecord | null> {
    return getItem<RetryRequestRecord>(`${RETRY_REQUEST_KEY}${key}`)
  }

  async getRetryRequestRecordByRelayId(relayMessageId: string): Promise<RetryRequestRecord | null> {
    const retryKey = await getItem<string>(`${RETRY_REQUEST_BY_RELAY_KEY}${relayMessageId}`)
    if (!retryKey) return null
    return this.getRetryRequestRecord(retryKey)
  }

  async cleanupRetryRequestRecords(maxAgeMs: number): Promise<number> {
    const retryKeys = await getAllKeys(RETRY_REQUEST_KEY)
    if (retryKeys.length === 0) return 0

    const cutoff = Date.now() - maxAgeMs
    const retryMap = await getItemsBatch<RetryRequestRecord>(retryKeys)
    const keysToRemove: string[] = []
    const relayKeysToRemove: string[] = []

    for (const key of retryKeys) {
      const record = retryMap.get(key)
      if (!record || record.lastSeenAt >= cutoff) continue
      keysToRemove.push(key)
      if (record.relayMessageId) {
        relayKeysToRemove.push(`${RETRY_REQUEST_BY_RELAY_KEY}${record.relayMessageId}`)
      }
    }

    if (keysToRemove.length === 0 && relayKeysToRemove.length === 0) {
      return 0
    }

    const fullKeys = [
      ...keysToRemove.map((key) => getFullKey(key)),
      ...relayKeysToRemove.map((key) => getFullKey(key)),
    ]
    await getAppKeyValueStorage().multiRemove(fullKeys)
    for (const key of keysToRemove) deleteCache(getFullKey(key))
    for (const key of relayKeysToRemove) deleteCache(getFullKey(key))
    return keysToRemove.length
  }

  async storeRelayReceiptJob(job: RelayReceiptJob): Promise<void> {
    await setItem(`${RECEIPT_JOB_KEY}${job.key}`, job)
  }

  async getRelayReceiptJob(key: string): Promise<RelayReceiptJob | null> {
    return getItem<RelayReceiptJob>(`${RECEIPT_JOB_KEY}${key}`)
  }

  async getPendingRelayReceiptJobs(nowMs: number, limit = 50): Promise<RelayReceiptJob[]> {
    const keys = await getAllKeys(RECEIPT_JOB_KEY)
    if (keys.length === 0) return []

    const jobsMap = await getItemsBatch<RelayReceiptJob>(keys)
    return keys
      .map((key) => jobsMap.get(key))
      .filter((job): job is RelayReceiptJob => job !== undefined && job.nextAttemptAt <= nowMs)
      .sort((left, right) => left.nextAttemptAt - right.nextAttemptAt)
      .slice(0, limit)
  }

  async deleteRelayReceiptJob(key: string): Promise<void> {
    await removeItem(`${RECEIPT_JOB_KEY}${key}`)
  }

  async cleanupRelayReceiptJobs(maxAgeMs: number): Promise<number> {
    const keys = await getAllKeys(RECEIPT_JOB_KEY)
    if (keys.length === 0) return 0

    const cutoff = Date.now() - maxAgeMs
    const jobsMap = await getItemsBatch<RelayReceiptJob>(keys)
    const keysToRemove = keys.filter((key) => {
      const job = jobsMap.get(key)
      return job && job.updatedAt < cutoff
    })
    if (keysToRemove.length === 0) return 0

    const fullKeys = keysToRemove.map((key) => getFullKey(key))
    await getAppKeyValueStorage().multiRemove(fullKeys)
    for (const key of keysToRemove) deleteCache(getFullKey(key))
    return keysToRemove.length
  }

  async storeMailboxScope(scope: MailboxScopeState): Promise<void> {
    await setChatSecretItem(getMailboxScopeStorageKey(scope), scope)
    const indexKey = `mailbox_scope_index_${scope.localIdentityId}`
    const index = await getItem<string[]>(indexKey) || []
    const indexEntry = getMailboxScopeIndexEntry(scope)
    if (!index.includes(indexEntry)) {
      index.push(indexEntry)
      await setItem(indexKey, index)
    }
  }

  async getMailboxScope(localIdentityId: string, remoteIdentityId: string): Promise<MailboxScopeState | null> {
    const scopes = (await this.getMailboxScopes(localIdentityId))
      .filter((scope) => scope.remoteIdentityId === remoteIdentityId)
    return getPreferredMailboxScope(scopes)
  }

  async getMailboxScopes(localIdentityId: string): Promise<MailboxScopeState[]> {
    const index = await getItem<string[]>(`mailbox_scope_index_${localIdentityId}`) || []
    if (index.length === 0) return []
    const keys = index.map((entry) => getMailboxScopeStorageKeyFromIndex(localIdentityId, entry))
    const scopeMap = await getChatSecretItemsBatch<MailboxScopeState>(keys)
    const scopesById = new Map<string, MailboxScopeState>()
    keys
      .map((key) => scopeMap.get(key))
      .filter((scope): scope is MailboxScopeState => scope !== undefined)
      .forEach((scope) => {
        scopesById.set(`${scope.localIdentityId}:${scope.remoteIdentityId}:${scope.scopeId}`, scope)
      })
    return [...scopesById.values()]
  }

  async deleteMailboxScope(localIdentityId: string, remoteIdentityId: string): Promise<void> {
    const indexKey = `mailbox_scope_index_${localIdentityId}`
    const index = await getItem<string[]>(indexKey) || []
    const entriesToRemove = index.filter((entry) => getMailboxScopeRemoteIdentityId(entry) === remoteIdentityId)
    await Promise.all(entriesToRemove.map((entry) => (
      removeItem(getMailboxScopeStorageKeyFromIndex(localIdentityId, entry))
    )))
    await removeItem(`mailbox_scope_${localIdentityId}_${remoteIdentityId}`)
    await setItem(indexKey, index.filter((entry) => getMailboxScopeRemoteIdentityId(entry) !== remoteIdentityId))
  }

  async getRelayMailboxCursor(identityId: string): Promise<number> {
    if (identityId.length < 8 || identityId.length > 200) return 0
    const stored = await getItem<{ sequence?: unknown }>(`relay_cursor_${identityId}`)
    const sequence = stored?.sequence
    return typeof sequence === 'number' && Number.isSafeInteger(sequence) && sequence >= 0
      ? sequence
      : 0
  }

  async storeRelayMailboxCursor(identityId: string, sequence: number): Promise<void> {
    if (identityId.length < 8 || identityId.length > 200) return
    const key = `relay_cursor_${identityId}`
    if (!Number.isSafeInteger(sequence) || sequence <= 0) {
      await removeItem(key)
      return
    }
    await setItem(key, { sequence })
  }

  async getRelaySenderBundleAttachState(
    localIdentityId: string,
    remoteIdentityId: string,
  ): Promise<RelaySenderBundleAttachState | null> {
    if (localIdentityId.length < 8 || localIdentityId.length > 200) return null
    if (remoteIdentityId.length < 8 || remoteIdentityId.length > 200) return null
    const stored = await getItem<unknown>(
      `relay_sender_bundle_attach_${localIdentityId}_${remoteIdentityId}`,
    )
    return parseRelaySenderBundleAttachState(stored)
  }

  async storeRelaySenderBundleAttachState(
    localIdentityId: string,
    remoteIdentityId: string,
    state: RelaySenderBundleAttachState,
  ): Promise<void> {
    if (localIdentityId.length < 8 || localIdentityId.length > 200) return
    if (remoteIdentityId.length < 8 || remoteIdentityId.length > 200) return
    const parsed = parseRelaySenderBundleAttachState(state)
    if (!parsed) return
    await setItem(
      `relay_sender_bundle_attach_${localIdentityId}_${remoteIdentityId}`,
      parsed,
    )
  }

  async storeTrackedIdentity(tracked: any): Promise<void> {
    await setItem(`tracked_${tracked.identityId}`, tracked)
    
    const index = await getItem<string[]>('tracked_index') || []
    if (!index.includes(tracked.identityId)) {
      index.push(tracked.identityId)
      await setItem('tracked_index', index)
    }
  }

  async getTrackedIdentity(identityId: string): Promise<any | null> {
    return getItem(`tracked_${identityId}`)
  }

  async getAllTrackedIdentities(): Promise<any[]> {
    const index = await getItem<string[]>('tracked_index') || []
    
    if (index.length === 0) return []
    
    const keys = index.map(id => `tracked_${id}`)
    const trackedMap = await getItemsBatch<any>(keys)
    
    return index
      .map(id => trackedMap.get(`tracked_${id}`))
      .filter((tracked): tracked is any => tracked !== undefined)
  }

  async deleteTrackedIdentity(identityId: string): Promise<void> {
    await removeItem(`tracked_${identityId}`)
    
    const index = await getItem<string[]>('tracked_index') || []
    const newIndex = index.filter(id => id !== identityId)
    await setItem('tracked_index', newIndex)
  }

  async deleteConversation(id: string): Promise<void> {
    await this.deleteConversationMessages(id)
    const scope = activeScope
    await enqueueStorageMutation(conversationMutationKey(id, scope), async () => {
      const conv = await getConversationAtScope(id, scope)
      if (conv?.localIdentityId) {
        const indexKey = `conversation_index_${conv.localIdentityId}`
        await enqueueStorageMutation(`index:${scope ?? 'unscoped'}:${indexKey}`, async () => {
          const index = await getItem<string[]>(indexKey, scope) || []
          await setItem(indexKey, index.filter(cid => cid !== id), scope)
          if (conv.remoteIdentityId) {
            await removeItem(
              conversationParticipantIndexKey(conv.localIdentityId, conv.remoteIdentityId),
              scope,
            )
          }
        })
      }
      await removeItem(`conversation_${id}`, scope)
    })
  }

  async deleteConversationMessages(conversationId: string): Promise<void> {
    const msgIndexKey = `message_index_${conversationId}`
    const msgIndex = await getItem<string[]>(msgIndexKey) || []
    if (msgIndex.length > 0) {
      const messagesMap = await getItemsBatch<any>(msgIndex.map(mid => `message_${mid}`))
      const relayKeys = msgIndex
        .map((mid) => messagesMap.get(`message_${mid}`)?.relayMessageId)
        .filter((relayMessageId): relayMessageId is string => Boolean(relayMessageId))

      const fullKeys = msgIndex.map((mid) => getFullKey(`message_${mid}`))
      const relayFullKeys = relayKeys.map((relayMessageId) => getFullKey(`${RELAY_MESSAGE_KEY}${relayMessageId}`))
      await getAppKeyValueStorage().multiRemove([
        ...fullKeys,
        ...relayFullKeys,
        getFullKey(`${MESSAGE_TIME_INDEX_KEY}${conversationId}`),
      ])
      for (const mid of msgIndex) deleteCache(getFullKey(`message_${mid}`))
      for (const relayMessageId of relayKeys) deleteCache(getFullKey(`${RELAY_MESSAGE_KEY}${relayMessageId}`))
      deleteCache(getFullKey(`${MESSAGE_TIME_INDEX_KEY}${conversationId}`))
    }
    await removeItem(msgIndexKey)
    await removeItem(`${MESSAGE_TIME_INDEX_KEY}${conversationId}`)

    const decIndexKey = `decrypted_index_${conversationId}`
    const decIndex = await getItem<string[]>(decIndexKey) || []
    if (decIndex.length > 0) {
      const fullKeys = decIndex.map((mid) => getFullKey(`decrypted_${mid}`))
      await getAppKeyValueStorage().multiRemove([
        ...fullKeys,
        getFullKey(`${DECRYPTED_TIME_INDEX_KEY}${conversationId}`),
      ])
      for (const mid of decIndex) deleteCache(getFullKey(`decrypted_${mid}`))
      deleteCache(getFullKey(`${DECRYPTED_TIME_INDEX_KEY}${conversationId}`))
    }
    await removeItem(decIndexKey)
    await removeItem(`${DECRYPTED_TIME_INDEX_KEY}${conversationId}`)
  }

  async deletePublicKeyBundle(identityId: string): Promise<void> {
    await removeItem(`public_bundle_${identityId}`)
  }

  async deleteSessionRecord(remoteIdentityId: string): Promise<void> {
    const allSessions = await this.getAllSessions(remoteIdentityId)
    if (allSessions.length > 0) {
      const fullKeys = allSessions.map((session) => getFullKey(`session_${session.id}`))
      await getAppKeyValueStorage().multiRemove(fullKeys)
      for (const session of allSessions) deleteCache(getFullKey(`session_${session.id}`))
    }

    await removeItem(`session_index_${remoteIdentityId}`)
    await removeItem(`session_record_${remoteIdentityId}`)
  }

  async clear(): Promise<void> {
    const allKeys = await getAppKeyValueStorage().getAllKeys()
    const qcKeys = allKeys.filter(k => k.startsWith(PREFIX))
    const secretScopes = new Set([
      ...sealedChatSecretScopes,
      ...allKeys
        .filter((key) => key.startsWith(CHAT_SECRET_SEAL_MARKER_PREFIX))
        .map((key) => key.slice(CHAT_SECRET_SEAL_MARKER_PREFIX.length))
        .filter(isAccountStorageScope),
    ])
    if (qcKeys.length > 0) {
      await getAppKeyValueStorage().multiRemove(qcKeys)
    }
    await Promise.all([...secretScopes].map((scope) => (
      SecureStore.deleteItemAsync(
        getChatSecretSecureMarkerKey(scope),
        SECURE_STORE_OPTIONS,
      )
    )))
    cache.clear()
    repairedStatusSyncSenders.clear()
    sealedChatSecretScopes.clear()
    cleanOutboundCommitScopes.clear()
    localMessageContentKey = null
  }

  async clearDecryptedMessageCache(options: { allScopes?: boolean; force?: boolean } = {}): Promise<void> {
    clearVolatileDecryptedMessages(options)
    if (
      options.allScopes
      && !options.force
      && await getAppKeyValueStorage().getItem(DECRYPTED_CACHE_CLEAN_MARKER) === 'true'
    ) {
      return
    }
    const scopedPrefix = getScopedPrefix()
    const allKeys = await getAppKeyValueStorage().getAllKeys()
    const decryptedKeys = options.allScopes
      ? allKeys.filter(isDecryptedCacheStorageKey)
      : allKeys.filter((key) => key.startsWith(scopedPrefix) && key.slice(scopedPrefix.length).startsWith('decrypted_'))
    const messageKeys = options.allScopes
      ? allKeys.filter(isMessageStorageKey)
      : allKeys.filter((key) => key.startsWith(scopedPrefix) && isStoredMessageKey(key.slice(scopedPrefix.length)))

    if (decryptedKeys.length > 0) {
      await getAppKeyValueStorage().multiRemove(decryptedKeys)
    }
    await sealPersistentMessageContentKeys(messageKeys)
    if (options.allScopes) {
      await getAppKeyValueStorage().setItem(DECRYPTED_CACHE_CLEAN_MARKER, 'true')
    }

    for (const key of decryptedKeys) {
      deleteCache(key)
    }
  }

  async clearScope(scope: string): Promise<void> {
    const storageScope = requireChatSecretScope(scope)
    const scopedPrefix = getScopedPrefix(storageScope)
    const markerKey = getLegacyMigrationMarkerKey(storageScope)
    const contentMarkerKey = getContentSealMarkerKey(storageScope)
    const legacyContentMarkerKeys = [
      `qc__content_sealed_v2_${storageScope}`,
      `qc__content_sealed_v3_${storageScope}`,
    ]
    const secretMarkerKey = getChatSecretSealMarkerKey(storageScope)
    const allKeys = await getAppKeyValueStorage().getAllKeys()
    const scopedKeys = allKeys.filter((key) => key.startsWith(scopedPrefix))

    if (scopedKeys.length > 0) {
      await getAppKeyValueStorage().multiRemove(scopedKeys)
    }

    await getAppKeyValueStorage().multiRemove([
      markerKey,
      contentMarkerKey,
      ...legacyContentMarkerKeys,
      secretMarkerKey,
    ])
    await SecureStore.deleteItemAsync(
      getChatSecretSecureMarkerKey(storageScope),
      SECURE_STORE_OPTIONS,
    )
    sealedChatSecretScopes.delete(storageScope)
    cleanOutboundCommitScopes.delete(storageScope)
  cleanInboundCommitScopes.delete(storageScope)

    for (const key of [
      ...scopedKeys,
      markerKey,
      contentMarkerKey,
      ...legacyContentMarkerKeys,
      secretMarkerKey,
    ]) {
      deleteCache(key)
    }
  }
}

async function runMigrations(): Promise<void> {
  let currentVersion = 0
  try {
    const stored = await getAppKeyValueStorage().getItem(SCHEMA_VERSION_KEY)
    if (stored !== null) {
      currentVersion = parseInt(stored, 10) || 0
    }
  } catch {
    // Use version 0 when unset or corrupt.
  }

  if (currentVersion >= CURRENT_SCHEMA_VERSION) return

  if (currentVersion < 5) {
    const allKeys = await getAppKeyValueStorage().getAllKeys()
    await sealPersistentMessageContentKeys(allKeys.filter(isMessageStorageKey))
  }

  await getAppKeyValueStorage().setItem(SCHEMA_VERSION_KEY, String(CURRENT_SCHEMA_VERSION))
}

/** Clear cached storage state. */
export function clearStorageCache(): void {
  cache.clear()
  clearVolatileDecryptedMessages({ allScopes: true })
  cleanOutboundCommitScopes.clear()
  cleanInboundCommitScopes.clear()
  localMessageContentKey?.fill(0)
  localMessageContentKey = null
}

export function setDecryptedMessagePersistenceEnabled(_enabled: boolean): void {
  shouldPersistDecryptedMessages = false
  clearStorageCache()
}

export function isDecryptedMessagePersistenceEnabled(): boolean {
  return shouldPersistDecryptedMessages
}

export function setAsyncStorageScope(scope?: string | null): void {
  activeScope = normalizeAccountStorageScope(scope)
  repairedStatusSyncSenders.clear()
  clearStorageCache()
}

let _instance: AsyncStorageAdapter | null = null
let _migrationsRun = false
let _migrationsPromise: Promise<void> | null = null
const scopePreparationPromises = new Map<string, {
  allowLegacyMigration: boolean
  promise: Promise<void>
}>()

export function getAsyncStorageAdapter(): AsyncStorageAdapter {
  if (!_instance) {
    _instance = new AsyncStorageAdapter()
  }
  return _instance
}

/** Run storage migrations once. */
export async function ensureMigrations(): Promise<void> {
  if (_migrationsRun) return

  if (!_migrationsPromise) {
    _migrationsPromise = runMigrations()
      .then(() => {
        _migrationsRun = true
      })
      .finally(() => {
        _migrationsPromise = null
      })
  }

  await _migrationsPromise
}

function yieldStoragePrep(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

export async function prepareAsyncStorageScope(
  scope?: string | null,
  options?: { allowLegacyMigration?: boolean },
): Promise<void> {
  await prepareAppKeyValueStorage()
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (activeScope !== normalizedScope) {
    setAsyncStorageScope(normalizedScope)
  }

  if (!normalizedScope) {
    return
  }

  const allowLegacyMigration = options?.allowLegacyMigration === true
  const pending = scopePreparationPromises.get(normalizedScope)
  if (pending) {
    await pending.promise
    if (!allowLegacyMigration || pending.allowLegacyMigration) {
      return
    }
  }

  const promise = (async () => {
    await replayOutboundCommitWal(normalizedScope)
    await yieldStoragePrep()
    await replayInboundCommitWal(normalizedScope)
    await yieldStoragePrep()
    if (!allowLegacyMigration) {
      await migrateChatSecretsForScope(normalizedScope)
      await yieldStoragePrep()
      await migrateContentForScope(normalizedScope)
      return
    }

    await migrateLegacyStorageForScope(normalizedScope)
    await yieldStoragePrep()
    await migrateChatSecretsForScope(normalizedScope)
    await yieldStoragePrep()
    await migrateContentForScope(normalizedScope)
  })()
  scopePreparationPromises.set(normalizedScope, {
    allowLegacyMigration,
    promise,
  })
  try {
    await promise
  } finally {
    if (scopePreparationPromises.get(normalizedScope)?.promise === promise) {
      scopePreparationPromises.delete(normalizedScope)
    }
  }
}

export async function clearAsyncStorageScope(scope: string): Promise<void> {
  await getAsyncStorageAdapter().clearScope(scope)
}

export async function exportActiveQuantumChatStorageSnapshot(
  options: { includeDecryptedMessages?: boolean } = {},
): Promise<QuantumChatStorageSnapshot> {
  const scopedPrefix = getScopedPrefix()
  const allKeys = await getAppKeyValueStorage().getAllKeys()
  const scopedKeys = allKeys.filter((key) => {
    if (!key.startsWith(scopedPrefix)) {
      return false
    }
    if (options.includeDecryptedMessages === true) {
      return true
    }
    const unscopedKey = key.slice(scopedPrefix.length)
    return !unscopedKey.startsWith('decrypted_')
      && !unscopedKey.startsWith('decrypted_index_')
  })

  const entries = await getAppKeyValueStorage().multiGet(scopedKeys)
  return {
    schemaVersion: 1,
    scope: activeScope,
    entries: entries.flatMap(([fullKey, value]) => (
      value === null ? [] : [[fullKey.slice(scopedPrefix.length), value] as const]
    )),
  }
}

export async function importActiveQuantumChatStorageSnapshot(
  snapshot: QuantumChatStorageSnapshot,
  options: { replaceExisting?: boolean } = {},
): Promise<void> {
  if (snapshot.schemaVersion !== 1) {
    throw new Error('Unsupported QuantumChat storage backup schema')
  }
  const storageScope = requireContentScope()
  const snapshotScope = normalizeAccountStorageScope(snapshot.scope)
  if (snapshotScope && snapshotScope !== storageScope) {
    throw new Error('QuantumChat storage backup belongs to another wallet')
  }
  await migrateChatSecretsForScope(storageScope)

  if (options.replaceExisting) {
    const scopedPrefix = getScopedPrefix()
    const allKeys = await getAppKeyValueStorage().getAllKeys()
    const scopedKeys = allKeys.filter((key) => key.startsWith(scopedPrefix))
    if (scopedKeys.length > 0) {
      await getAppKeyValueStorage().multiRemove(scopedKeys)
    }
  }

  let pairs = snapshot.entries.map(([key, value]) => [getFullKey(key), value, key] as [string, string, string])
  if (!options.replaceExisting && pairs.length > 0) {
    const existing = new Map(await getAppKeyValueStorage().multiGet(pairs.map(([fullKey]) => fullKey)))
    pairs = pairs.flatMap(([fullKey, incomingValue, unscopedKey]) => {
      const existingValue = existing.get(fullKey)
      if (existingValue === null || existingValue === undefined) {
        return [[fullKey, incomingValue, unscopedKey] as [string, string, string]]
      }
      if (isBackupIndexEntryKey(unscopedKey)) {
        const merged = mergeStoredStringArray(existingValue, incomingValue)
        return merged === null ? [] : [[fullKey, merged, unscopedKey] as [string, string, string]]
      }
      return []
    })
  }
  if (pairs.length > 0) {
    const protectedPairs = await mapWithConcurrency(
      pairs,
      MESSAGE_SEAL_CONCURRENCY,
      async ([fullKey, value, unscopedKey]) => {
        const secretDescriptor = getChatSecretStorageDescriptor(unscopedKey)
        if (secretDescriptor) {
          const parsed = JSON.parse(value) as unknown
          if (isChatSecretStorageEnvelope(parsed)) {
            await openChatSecretRecord(
              storageScope,
              secretDescriptor.kind,
              secretDescriptor.storageKey,
              parsed,
            )
            return [fullKey, value] as [string, string]
          }
          if (hasChatSecretCipherMarker(parsed)) {
            throw new Error(`Invalid chat secret envelope: ${unscopedKey}`)
          }
          return [
            fullKey,
            JSON.stringify(
              await sealChatSecretRecord(
                storageScope,
                secretDescriptor.kind,
                secretDescriptor.storageKey,
                parsed,
              ),
            ),
          ] as [string, string]
        }
        if (
          unscopedKey.startsWith('decrypted_')
          || unscopedKey.startsWith(DECRYPTED_TIME_INDEX_KEY)
        ) {
          return undefined
        }
        try {
          if (isStoredMessageKey(unscopedKey)) {
            const hydrated = await hydratePersistentMessageContent(JSON.parse(value), storageScope)
            if (typeof hydrated?.content !== 'string' || hydrated.localContentUnavailable) {
              return undefined
            }
            return [
              fullKey,
              JSON.stringify(await sealPersistentMessageContent(hydrated, storageScope)),
            ] as [string, string]
          }
          if (isStoredConversationKey(unscopedKey)) {
            return [
              fullKey,
              JSON.stringify(await sealConversationPreview(JSON.parse(value), storageScope)),
            ] as [string, string]
          }
          return [fullKey, value] as [string, string]
        } catch {
          return undefined
        }
      },
    )
    const validPairs = protectedPairs.filter((entry): entry is [string, string] => entry !== undefined)
    if (validPairs.length > 0) {
      await getAppKeyValueStorage().multiSet(validPairs)
    }
  }
  await getAppKeyValueStorage().setItem(getContentSealMarkerKey(storageScope), 'true')
  await SecureStore.setItemAsync(
    getChatSecretSecureMarkerKey(storageScope),
    'true',
    SECURE_STORE_OPTIONS,
  )
  await getAppKeyValueStorage().setItem(getChatSecretSealMarkerKey(storageScope), 'true')
  sealedChatSecretScopes.add(storageScope)
  clearStorageCache()
}
