/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { getAppKeyValueStorage, prepareAppKeyValueStorage } from '@/services/storage/keyValueStorage'
import * as SecureStore from 'expo-secure-store'
import { SECURE_STORE_OPTIONS } from '@/lib/constants'
import {
  buildAccountScopedPrefix,
  isAccountStorageScope,
  normalizeAccountStorageScope,
} from '@/lib/accountScope'
import type { ChatMessage, GroupChatMember, GroupConversation } from '@/lib/types'
import {
  isSealedGroupConversationRecord,
  isSealedGroupMessageRecord,
  openGroupConversationRecord,
  openGroupMessageRecord,
  sealGroupConversationRecord,
  sealGroupMessageRecord,
} from '@/services/storage/groupChatCacheCrypto'
import {
  buildLocalCacheAad,
  openLocalCacheText,
  sealLocalCacheText,
  type LocalCacheCipher,
} from '@/services/storage/localCacheCrypto'
import {
  GROUP_UNREAD_PROJECTION_VERSION,
  type GroupUnreadProjection,
} from './groupUnreadState'

const ASYNC_PREFIX = 'qc_group_'
const LEGACY_GROUP_INDEX_KEY = `${ASYNC_PREFIX}group_index`
const LEGACY_MIGRATION_MARKER_PREFIX = 'qc_group__legacy_scope_migrated_'
const CONTENT_SEAL_MARKER_PREFIX = 'qc_group__content_sealed_v1_'
let activeGroupStorageScope: string | null = null
const groupMessageIndexQueues = new Map<string, Promise<void>>()

export interface StoredGroupMessagePage {
  messages: ChatMessage[]
  hasMore: boolean
  nextCursor: string | null
}

interface StoredGroupMessagePageOptions {
  limit?: number
  beforeMessageId?: string
  scope?: string | null
}

async function enqueueGroupMessageIndexMutation<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = groupMessageIndexQueues.get(key) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(operation)
  const tail = current.then(() => undefined, () => undefined)
  groupMessageIndexQueues.set(key, tail)
  try {
    return await current
  } finally {
    if (groupMessageIndexQueues.get(key) === tail) {
      groupMessageIndexQueues.delete(key)
    }
  }
}

export interface GroupChatStorageBackupSnapshot {
  schemaVersion: 1
  scope: string | null
  asyncEntries: Array<readonly [string, string]>
  senderKeyEntries: Array<readonly [string, string]>
}

function isGroupBackupIndexEntryKey(key: string): boolean {
  return key === 'group_index' || key.startsWith('message_index_')
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

export interface GroupSenderKeyState {
  groupId: string
  distributionId: string
  keyBase64: string
  keyVersion: number
  sharedWith: string[]
  rotationRevision: number
  updatedBy: string
  updatedAt: number
}

function getScopedAsyncPrefix(scope: string | null = activeGroupStorageScope): string {
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (!normalizedScope) {
    return ASYNC_PREFIX
  }

  return buildAccountScopedPrefix(ASYNC_PREFIX, normalizedScope)
}

function getLegacyMigrationMarkerKey(scope: string): string {
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (!normalizedScope) {
    throw new Error('Group storage scope is required')
  }

  return `${LEGACY_MIGRATION_MARKER_PREFIX}${normalizedScope}`
}

function getContentSealMarkerKey(scope: string): string {
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (!normalizedScope) {
    throw new Error('Group storage scope is required')
  }
  return `${CONTENT_SEAL_MARKER_PREFIX}${normalizedScope}`
}

function requireGroupStorageScope(scope: string | null = activeGroupStorageScope): string {
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (!normalizedScope) {
    throw new Error('Group storage scope is required')
  }
  return normalizedScope
}

export function getActiveGroupStorageScope(): string {
  return requireGroupStorageScope()
}

export function buildScopedGroupStorageKey(suffix: string): string {
  if (!suffix.trim()) {
    throw new Error('Group storage key suffix is required')
  }
  return `${getScopedAsyncPrefix()}${suffix}`
}

function isScopedGroupAsyncStorageKey(key: string): boolean {
  if (!key.startsWith(ASYNC_PREFIX)) {
    return false
  }

  const suffix = key.slice(ASYNC_PREFIX.length)
  const delimiterIndex = suffix.indexOf('_')
  if (delimiterIndex === -1) {
    return false
  }

  return isAccountStorageScope(suffix.slice(0, delimiterIndex))
}

function isLegacyGroupAsyncStorageKey(key: string): boolean {
  return key.startsWith(ASYNC_PREFIX)
    && !isScopedGroupAsyncStorageKey(key)
    && !key.startsWith(LEGACY_MIGRATION_MARKER_PREFIX)
    && !key.startsWith(CONTENT_SEAL_MARKER_PREFIX)
}

function groupIndexKey(scope: string | null = activeGroupStorageScope): string {
  return `${getScopedAsyncPrefix(scope)}group_index`
}

function pendingCiphertextKey(groupId: string, scope: string | null = activeGroupStorageScope): string {
  return `${getScopedAsyncPrefix(scope)}pending_ct_${groupId}`
}

function senderKeyStorageKey(groupId: string, scope: string | null = activeGroupStorageScope): string {
  return `${getScopedAsyncPrefix(scope)}sender_key_${groupId}`
}

function groupKey(groupId: string, scope: string | null = activeGroupStorageScope): string {
  return `${getScopedAsyncPrefix(scope)}group_${groupId}`
}

function membersKey(groupId: string, scope: string | null = activeGroupStorageScope): string {
  return `${getScopedAsyncPrefix(scope)}members_${groupId}`
}

function messageIndexKey(groupId: string, scope: string | null = activeGroupStorageScope): string {
  return `${getScopedAsyncPrefix(scope)}message_index_${groupId}`
}

function unreadProjectionKey(
  groupId: string,
  scope: string | null = activeGroupStorageScope,
): string {
  return `${getScopedAsyncPrefix(scope)}unread_projection_${groupId}`
}

function messageKey(
  groupId: string,
  messageId: string,
  scope: string | null = activeGroupStorageScope,
): string {
  return `${getScopedAsyncPrefix(scope)}message_${groupId}_${messageId}`
}

async function getJson<T>(key: string): Promise<T | null> {
  const raw = await getAppKeyValueStorage().getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    await getAppKeyValueStorage().removeItem(key)
    return null
  }
}

async function setJson<T>(key: string, value: T): Promise<void> {
  await getAppKeyValueStorage().setItem(key, JSON.stringify(value))
}

async function removeJson(key: string): Promise<void> {
  await getAppKeyValueStorage().removeItem(key)
}

function parseGroupIds(raw: string | null): string[] {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function extractScopeFromIndexKey(key: string): string | null {
  if (key === LEGACY_GROUP_INDEX_KEY) {
    return null
  }

  if (!key.startsWith(ASYNC_PREFIX)) {
    return null
  }

  const suffix = key.slice(ASYNC_PREFIX.length)
  const delimiterIndex = suffix.indexOf('_')
  if (delimiterIndex === -1) {
    return null
  }

  const candidate = suffix.slice(0, delimiterIndex)
  return isAccountStorageScope(candidate) ? candidate : null
}

async function migrateLegacyGroupStorageForScope(scope: string): Promise<void> {
  const markerKey = getLegacyMigrationMarkerKey(scope)
  const marker = await getAppKeyValueStorage().getItem(markerKey)
  if (marker === 'true') {
    return
  }

  const scopedPrefix = getScopedAsyncPrefix(scope)
  const allKeys = await getAppKeyValueStorage().getAllKeys()
  const legacyKeys = allKeys.filter(isLegacyGroupAsyncStorageKey)

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

    const targetKey = `${scopedPrefix}${legacyKey.slice(ASYNC_PREFIX.length)}`
    if (scopedKeys.has(targetKey)) {
      return []
    }

    return [[targetKey, rawValue, legacyKey.slice(ASYNC_PREFIX.length)] as const]
  })
  const protectedEntries = await Promise.all(candidateEntries.map(async (
    [targetKey, rawValue, unscopedKey],
  ) => {
    try {
      const parsed: unknown = JSON.parse(rawValue)
      if (unscopedKey.startsWith('group_') && unscopedKey !== 'group_index') {
        return [
          targetKey,
          JSON.stringify(
            isSealedGroupConversationRecord(parsed)
              ? parsed
              : await sealGroupConversationRecord(scope, parsed as GroupConversation),
          ),
        ] as [string, string]
      }
      if (unscopedKey.startsWith('message_') && !unscopedKey.startsWith('message_index_')) {
        if (isSealedGroupMessageRecord(parsed)) {
          return [targetKey, rawValue] as [string, string]
        }
        const message = parsed as ChatMessage
        const groupId = message.groupId
          || (message.conversationId?.startsWith('group:')
            ? message.conversationId.slice('group:'.length)
            : null)
        if (!groupId) return undefined
        return [
          targetKey,
          JSON.stringify(await sealGroupMessageRecord(scope, groupId, message)),
        ] as [string, string]
      }
      return [targetKey, rawValue] as [string, string]
    } catch {
      return undefined
    }
  }))
  const entriesToCopy = protectedEntries.filter(
    (entry): entry is [string, string] => entry !== undefined,
  )

  if (entriesToCopy.length > 0) {
    await getAppKeyValueStorage().multiSet(entriesToCopy)
  }

  const legacyGroupIds = parseGroupIds(
    legacyEntries.find(([legacyKey]) => legacyKey === LEGACY_GROUP_INDEX_KEY)?.[1] ?? null,
  )

  await Promise.all(
    legacyGroupIds.map(async (groupId) => {
      const legacySenderKey = senderKeyStorageKey(groupId, null)
      const scopedSenderKey = senderKeyStorageKey(groupId, scope)
      const [legacyValue, scopedValue] = await Promise.all([
        SecureStore.getItemAsync(legacySenderKey, SECURE_STORE_OPTIONS),
        SecureStore.getItemAsync(scopedSenderKey, SECURE_STORE_OPTIONS),
      ])

      if (legacyValue && !scopedValue) {
        await SecureStore.setItemAsync(scopedSenderKey, legacyValue, SECURE_STORE_OPTIONS)
      }

      await SecureStore.deleteItemAsync(legacySenderKey, SECURE_STORE_OPTIONS)
    }),
  )

  await getAppKeyValueStorage().multiRemove(legacyKeys)
  await getAppKeyValueStorage().setItem(markerKey, 'true')
}

async function migrateGroupContentForScope(scope: string): Promise<void> {
  const markerKey = getContentSealMarkerKey(scope)
  if (await getAppKeyValueStorage().getItem(markerKey) === 'true') {
    return
  }

  const groupIds = (await getJson<string[]>(groupIndexKey(scope))) || []
  for (const groupId of groupIds) {
    const storedGroupKey = groupKey(groupId, scope)
    const rawGroup = await getAppKeyValueStorage().getItem(storedGroupKey)
    if (rawGroup) {
      try {
        const parsed: unknown = JSON.parse(rawGroup)
        if (!isSealedGroupConversationRecord(parsed)) {
          const group = parsed as GroupConversation
          if (group?.groupId !== groupId || typeof group.id !== 'string') {
            await getAppKeyValueStorage().removeItem(storedGroupKey)
          } else {
            const sealed = await sealGroupConversationRecord(scope, group)
            await getAppKeyValueStorage().setItem(storedGroupKey, JSON.stringify(sealed))
          }
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          await getAppKeyValueStorage().removeItem(storedGroupKey)
        } else {
          throw error
        }
      }
    }

    const messageIds = (await getJson<string[]>(messageIndexKey(groupId, scope))) || []
    for (const messageId of messageIds) {
      const storedMessageKey = messageKey(groupId, messageId, scope)
      const rawMessage = await getAppKeyValueStorage().getItem(storedMessageKey)
      if (!rawMessage) continue
      try {
        const parsed: unknown = JSON.parse(rawMessage)
        if (!isSealedGroupMessageRecord(parsed)) {
          const message = parsed as ChatMessage
          if (message?.id !== messageId || typeof message.senderId !== 'string') {
            await getAppKeyValueStorage().removeItem(storedMessageKey)
          } else {
            const sealed = await sealGroupMessageRecord(scope, groupId, message)
            await getAppKeyValueStorage().setItem(storedMessageKey, JSON.stringify(sealed))
          }
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          await getAppKeyValueStorage().removeItem(storedMessageKey)
        } else {
          throw error
        }
      }
    }
  }

  await getAppKeyValueStorage().setItem(markerKey, 'true')
}

export function setActiveGroupStorageScope(scope?: string | null): void {
  activeGroupStorageScope = normalizeAccountStorageScope(scope)
}

export async function prepareGroupStorageScope(
  scope?: string | null,
  options?: { allowLegacyMigration?: boolean; activate?: boolean },
): Promise<void> {
  await prepareAppKeyValueStorage()
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (options?.activate !== false) {
    setActiveGroupStorageScope(normalizedScope)
  }

  if (!normalizedScope) {
    return
  }

  if (options?.allowLegacyMigration) {
    await migrateLegacyGroupStorageForScope(normalizedScope)
  }
  await migrateGroupContentForScope(normalizedScope)
}

export async function listStoredGroups(scope?: string | null): Promise<GroupConversation[]> {
  const storageScope = requireGroupStorageScope(
    normalizeAccountStorageScope(scope ?? activeGroupStorageScope),
  )
  const index = (await getJson<string[]>(groupIndexKey(storageScope))) || []
  if (index.length === 0) return []

  const pairs = await getAppKeyValueStorage().multiGet(index.map((groupId) => groupKey(groupId, storageScope)))
  const groups: GroupConversation[] = []

  for (const [, raw] of pairs) {
    if (!raw) continue
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!isSealedGroupConversationRecord(parsed)) continue
      groups.push(await openGroupConversationRecord(storageScope, parsed))
    } catch {
      // Sync will repair corrupted rows.
    }
  }

  return groups.sort((a, b) => {
    const aTime = a.lastMessage?.timestamp || a.updatedAt || a.createdAt
    const bTime = b.lastMessage?.timestamp || b.updatedAt || b.createdAt
    return bTime - aTime
  })
}

export async function storeGroup(
  group: GroupConversation,
  scope?: string | null,
): Promise<void> {
  const storageScope = requireGroupStorageScope(
    normalizeAccountStorageScope(scope ?? activeGroupStorageScope),
  )
  await setJson(
    groupKey(group.groupId, storageScope),
    await sealGroupConversationRecord(storageScope, group),
  )
  const index = (await getJson<string[]>(groupIndexKey(storageScope))) || []
  if (!index.includes(group.groupId)) {
    index.push(group.groupId)
    await setJson(groupIndexKey(storageScope), index)
  }
}

export async function getStoredGroup(groupId: string): Promise<GroupConversation | null> {
  const storageScope = requireGroupStorageScope()
  const parsed = await getJson<unknown>(groupKey(groupId, storageScope))
  if (!isSealedGroupConversationRecord(parsed)) {
    return null
  }
  try {
    return await openGroupConversationRecord(storageScope, parsed)
  } catch {
    return null
  }
}

export async function removeStoredGroup(groupId: string): Promise<void> {
  const storageScope = requireGroupStorageScope()
  await removeJson(groupKey(groupId, storageScope))
  await removeJson(membersKey(groupId, storageScope))
  await removeJson(unreadProjectionKey(groupId, storageScope))
  await removeJson(pendingCiphertextKey(groupId, storageScope))

  const index = (await getJson<string[]>(groupIndexKey(storageScope))) || []
  const nextIndex = index.filter((entry) => entry !== groupId)
  await setJson(groupIndexKey(storageScope), nextIndex)

  const indexKey = messageIndexKey(groupId, storageScope)
  await enqueueGroupMessageIndexMutation(indexKey, async () => {
    const messageIndex = (await getJson<string[]>(indexKey)) || []
    if (messageIndex.length > 0) {
      await getAppKeyValueStorage().multiRemove(
        messageIndex.map((messageId) => messageKey(groupId, messageId, storageScope)),
      )
    }
    await removeJson(indexKey)
  })
  await SecureStore.deleteItemAsync(
    senderKeyStorageKey(groupId, storageScope),
    SECURE_STORE_OPTIONS,
  )
}

export async function clearStoredGroupMessages(groupId: string): Promise<void> {
  const storageScope = requireGroupStorageScope()
  const indexKey = messageIndexKey(groupId, storageScope)
  await enqueueGroupMessageIndexMutation(indexKey, async () => {
    const messageIndex = (await getJson<string[]>(indexKey)) || []
    if (messageIndex.length > 0) {
      await getAppKeyValueStorage().multiRemove(
        messageIndex.map((messageId) => messageKey(groupId, messageId, storageScope)),
      )
    }
    await removeJson(indexKey)
  })
  await removeJson(unreadProjectionKey(groupId, storageScope))
}

export async function getStoredGroupUnreadProjection(
  groupId: string,
  scope?: string | null,
): Promise<GroupUnreadProjection | null> {
  const storageScope = requireGroupStorageScope(
    normalizeAccountStorageScope(scope ?? activeGroupStorageScope),
  )
  const stored = await getJson<unknown>(
    unreadProjectionKey(groupId, storageScope),
  )
  if (!stored || typeof stored !== 'object') return null
  let projection: GroupUnreadProjection
  if (
    'v' in stored
    && stored.v === 1
    && 'cipher' in stored
  ) {
    try {
      projection = JSON.parse(await openLocalCacheText(
        storageScope,
        'notification',
        stored.cipher as LocalCacheCipher,
        buildLocalCacheAad(['spectra', 'group-unread', 'v1', storageScope, groupId]),
      )) as GroupUnreadProjection
    } catch {
      await removeJson(unreadProjectionKey(groupId, storageScope))
      return null
    }
  } else {
    projection = stored as GroupUnreadProjection
  }
  if (
    projection?.version !== GROUP_UNREAD_PROJECTION_VERSION
    || !Array.isArray(projection.unreadMessageIds)
    || projection.unreadMessageIds.some((id) => typeof id !== 'string' || !id)
  ) {
    return null
  }
  const normalized: GroupUnreadProjection = {
    version: GROUP_UNREAD_PROJECTION_VERSION,
    unreadMessageIds: [...new Set(projection.unreadMessageIds)],
  }
  if (!('v' in stored)) {
    await setStoredGroupUnreadProjection(groupId, normalized, storageScope)
  }
  return normalized
}

export async function setStoredGroupUnreadProjection(
  groupId: string,
  projection: GroupUnreadProjection,
  scope?: string | null,
): Promise<void> {
  const storageScope = requireGroupStorageScope(
    normalizeAccountStorageScope(scope ?? activeGroupStorageScope),
  )
  const cipher = await sealLocalCacheText(
    storageScope,
    'notification',
    JSON.stringify(projection),
    buildLocalCacheAad(['spectra', 'group-unread', 'v1', storageScope, groupId]),
  )
  await setJson(unreadProjectionKey(groupId, storageScope), { v: 1, cipher })
}

export async function removeStoredGroupUnreadProjection(
  groupId: string,
  scope?: string | null,
): Promise<void> {
  const storageScope = requireGroupStorageScope(
    normalizeAccountStorageScope(scope ?? activeGroupStorageScope),
  )
  await removeJson(unreadProjectionKey(groupId, storageScope))
}

export async function storeGroupMembers(groupId: string, members: GroupChatMember[]): Promise<void> {
  await setJson(membersKey(groupId), members)
}

export async function getStoredGroupMembers(groupId: string): Promise<GroupChatMember[]> {
  return (await getJson<GroupChatMember[]>(membersKey(groupId))) || []
}

export async function storeGroupMessage(groupId: string, message: ChatMessage): Promise<void> {
  await storeGroupMessages(groupId, [message])
}

export async function storeGroupMessages(groupId: string, messages: ChatMessage[]): Promise<void> {
  if (messages.length === 0) return
  const storageScope = requireGroupStorageScope()
  const uniqueMessages: ChatMessage[] = []
  const seen = new Set<string>()
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (seen.has(message.id)) continue
    seen.add(message.id)
    uniqueMessages.push(message)
  }
  uniqueMessages.reverse()

  const sealedMessages = await Promise.all(
    uniqueMessages.map((message) => sealGroupMessageRecord(storageScope, groupId, message)),
  )
  const indexKey = messageIndexKey(groupId, storageScope)
  await enqueueGroupMessageIndexMutation(indexKey, async () => {
    await getAppKeyValueStorage().multiSet(
      uniqueMessages.map((message, index) => [
        messageKey(groupId, message.id, storageScope),
        JSON.stringify(sealedMessages[index]),
      ]),
    )
    const index = (await getJson<string[]>(indexKey)) || []
    const existing = new Set(index)
    const next = [...index]
    for (const message of uniqueMessages) {
      if (existing.has(message.id)) continue
      existing.add(message.id)
      next.push(message.id)
    }
    if (next.length !== index.length) {
      await setJson(indexKey, next)
    }
  })
}

export async function getStoredGroupMessageIds(
  groupId: string,
  scope?: string | null,
): Promise<string[]> {
  const storageScope = requireGroupStorageScope(
    normalizeAccountStorageScope(scope ?? activeGroupStorageScope),
  )
  return (await getJson<string[]>(messageIndexKey(groupId, storageScope))) || []
}

export async function getStoredGroupMessagesPage(
  groupId: string,
  options: StoredGroupMessagePageOptions = {},
): Promise<StoredGroupMessagePage> {
  const storageScope = requireGroupStorageScope(
    normalizeAccountStorageScope(options.scope ?? activeGroupStorageScope),
  )
  const index = (await getJson<string[]>(messageIndexKey(groupId, storageScope))) || []
  if (index.length === 0) {
    return { messages: [], hasMore: false, nextCursor: null }
  }

  const limit = Math.max(1, Math.floor(options.limit ?? 100))
  const endExclusive = options.beforeMessageId
    ? index.lastIndexOf(options.beforeMessageId)
    : index.length
  if (endExclusive < 0) {
    return { messages: [], hasMore: false, nextCursor: null }
  }

  const start = Math.max(0, endExclusive - limit)
  const pageIds = index.slice(start, endExclusive)
  if (pageIds.length === 0) {
    return { messages: [], hasMore: false, nextCursor: null }
  }

  const pairs = await getAppKeyValueStorage().multiGet(
    pageIds.map((messageId) => messageKey(groupId, messageId, storageScope)),
  )
  const messages: ChatMessage[] = []

  for (const [, raw] of pairs) {
    if (!raw) continue
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!isSealedGroupMessageRecord(parsed)) continue
      messages.push(await openGroupMessageRecord(storageScope, groupId, parsed))
    } catch {
      // Skip corrupted rows.
    }
  }

  return {
    messages: messages.sort((a, b) => a.timestamp - b.timestamp),
    hasMore: start > 0,
    nextCursor: pageIds[0] ?? null,
  }
}

export async function getStoredGroupMessages(
  groupId: string,
  limit: number = 100,
  scope?: string | null,
): Promise<ChatMessage[]> {
  const storageScope = requireGroupStorageScope(
    normalizeAccountStorageScope(scope ?? activeGroupStorageScope),
  )
  return (await getStoredGroupMessagesPage(groupId, {
    limit,
    scope: storageScope,
  })).messages
}

export async function getStoredGroupMessage(
  groupId: string,
  messageId: string,
  scope?: string | null,
): Promise<ChatMessage | null> {
  const storageScope = requireGroupStorageScope(
    normalizeAccountStorageScope(scope ?? activeGroupStorageScope),
  )
  const parsed = await getJson<unknown>(messageKey(groupId, messageId, storageScope))
  if (!isSealedGroupMessageRecord(parsed)) return null
  try {
    return await openGroupMessageRecord(storageScope, groupId, parsed)
  } catch {
    return null
  }
}

export async function updateStoredGroupMessage(
  groupId: string,
  messageId: string,
  updates: Partial<ChatMessage>
): Promise<void> {
  const storageScope = requireGroupStorageScope()
  const parsed = await getJson<unknown>(messageKey(groupId, messageId, storageScope))
  if (!isSealedGroupMessageRecord(parsed)) return
  try {
    const existing = await openGroupMessageRecord(storageScope, groupId, parsed)
    const next = { ...existing, ...updates }
    await setJson(
      messageKey(groupId, messageId, storageScope),
      await sealGroupMessageRecord(storageScope, groupId, next),
    )
  } catch {
    await removeJson(messageKey(groupId, messageId, storageScope))
  }
}

export async function deleteStoredGroupMessage(groupId: string, messageId: string): Promise<void> {
  const storageScope = requireGroupStorageScope()
  const indexKey = messageIndexKey(groupId, storageScope)
  await enqueueGroupMessageIndexMutation(indexKey, async () => {
    await removeJson(messageKey(groupId, messageId, storageScope))
    const index = (await getJson<string[]>(indexKey)) || []
    if (index.includes(messageId)) {
      await setJson(indexKey, index.filter((entry) => entry !== messageId))
    }
  })
}

export interface PendingGroupCiphertextRow {
  id: string
  groupId: string
  senderIdentityId: string
  distributionId: string
  keyVersion: number
  groupRevision: number
  contentType: 'text' | 'reaction' | 'deletion'
  ciphertext: string
  nonce: string
  tag: string
  signature: string
  createdAt: string
  receivedAt: number
  disappearingDurationMs?: number | null
  disappearingTrigger?: 'after_send' | 'after_read' | null
}

const MAX_PENDING_GROUP_CIPHERTEXTS = 32
const PENDING_GROUP_CIPHERTEXT_TTL_MS = 7 * 24 * 60 * 60 * 1000

function isPendingGroupCiphertextRow(value: unknown): value is PendingGroupCiphertextRow {
  if (!value || typeof value !== 'object') return false
  const row = value as PendingGroupCiphertextRow
  return (
    typeof row.id === 'string'
    && typeof row.groupId === 'string'
    && typeof row.senderIdentityId === 'string'
    && typeof row.distributionId === 'string'
    && Number.isInteger(row.keyVersion)
    && Number.isInteger(row.groupRevision)
    && (row.contentType === 'text' || row.contentType === 'reaction' || row.contentType === 'deletion')
    && typeof row.ciphertext === 'string'
    && typeof row.nonce === 'string'
    && typeof row.tag === 'string'
    && typeof row.signature === 'string'
    && typeof row.createdAt === 'string'
    && Number.isFinite(row.receivedAt)
  )
}

export async function storePendingGroupCiphertext(
  row: PendingGroupCiphertextRow,
): Promise<void> {
  const storageScope = requireGroupStorageScope()
  const now = Date.now()
  const existing = (await loadPendingGroupCiphertexts(row.groupId))
    .filter((entry) => (
      entry.id !== row.id
      && now - entry.receivedAt < PENDING_GROUP_CIPHERTEXT_TTL_MS
    ))
  const next = [...existing, row].slice(-MAX_PENDING_GROUP_CIPHERTEXTS)
  const cipher = await sealLocalCacheText(
    storageScope,
    'chat-secret',
    JSON.stringify(next),
    buildLocalCacheAad(['spectra', 'group-pending-ct', 'v1', storageScope, row.groupId]),
  )
  await setJson(pendingCiphertextKey(row.groupId, storageScope), { v: 1, cipher })
}

export async function takePendingGroupCiphertexts(
  groupId: string,
): Promise<PendingGroupCiphertextRow[]> {
  const rows = await loadPendingGroupCiphertexts(groupId)
  await removeJson(pendingCiphertextKey(groupId))
  return rows
}

async function loadPendingGroupCiphertexts(
  groupId: string,
): Promise<PendingGroupCiphertextRow[]> {
  const storageScope = requireGroupStorageScope()
  const stored = await getJson<{ v: 1; cipher: LocalCacheCipher }>(
    pendingCiphertextKey(groupId, storageScope),
  )
  if (!stored || stored.v !== 1 || !stored.cipher) {
    return []
  }
  try {
    const plaintext = await openLocalCacheText(
      storageScope,
      'chat-secret',
      stored.cipher,
      buildLocalCacheAad(['spectra', 'group-pending-ct', 'v1', storageScope, groupId]),
    )
    const parsed = JSON.parse(plaintext) as unknown
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    return parsed.filter((entry): entry is PendingGroupCiphertextRow => (
      isPendingGroupCiphertextRow(entry)
      && now - entry.receivedAt < PENDING_GROUP_CIPHERTEXT_TTL_MS
    ))
  } catch {
    await removeJson(pendingCiphertextKey(groupId, storageScope))
    return []
  }
}

export async function getGroupSenderKeyState(groupId: string): Promise<GroupSenderKeyState | null> {
  const raw = await SecureStore.getItemAsync(senderKeyStorageKey(groupId), SECURE_STORE_OPTIONS)
  if (!raw) return null
  try {
    return JSON.parse(raw) as GroupSenderKeyState
  } catch {
    await SecureStore.deleteItemAsync(senderKeyStorageKey(groupId), SECURE_STORE_OPTIONS)
    return null
  }
}

export async function storeGroupSenderKeyState(state: GroupSenderKeyState): Promise<void> {
  await SecureStore.setItemAsync(
    senderKeyStorageKey(state.groupId),
    JSON.stringify(state),
    SECURE_STORE_OPTIONS
  )
}

export async function clearGroupSenderKeyState(groupId: string): Promise<void> {
  await SecureStore.deleteItemAsync(senderKeyStorageKey(groupId), SECURE_STORE_OPTIONS)
}

export async function clearGroupChatStorageScope(scope: string): Promise<void> {
  const indexKey = groupIndexKey(scope)
  const groupIds = (await getJson<string[]>(indexKey)) || []
  const scopedPrefix = getScopedAsyncPrefix(scope)
  const markerKey = getLegacyMigrationMarkerKey(scope)
  const allKeys = await getAppKeyValueStorage().getAllKeys()
  const asyncKeys = allKeys.filter((key) => key.startsWith(scopedPrefix))

  if (asyncKeys.length > 0) {
    await getAppKeyValueStorage().multiRemove(asyncKeys)
  }

  await getAppKeyValueStorage().removeItem(markerKey)
  await Promise.all(
    groupIds.map((groupId) =>
      SecureStore.deleteItemAsync(senderKeyStorageKey(groupId, scope), SECURE_STORE_OPTIONS)
    ),
  )
}

export async function clearAllGroupChatStorage(): Promise<void> {
  const keys = await getAppKeyValueStorage().getAllKeys()
  const asyncKeys = keys.filter((key) => key.startsWith(ASYNC_PREFIX))
  const indexKeys = asyncKeys.filter((key) => key.endsWith('group_index'))

  const senderKeys = new Set<string>()
  if (indexKeys.length > 0) {
    const indexEntries = await getAppKeyValueStorage().multiGet(indexKeys)
    for (const [indexKey, raw] of indexEntries) {
      const groupIds = parseGroupIds(raw)
      const scope = extractScopeFromIndexKey(indexKey)
      groupIds.forEach((groupId) => {
        senderKeys.add(senderKeyStorageKey(groupId, scope))
      })
    }
  }

  if (asyncKeys.length > 0) {
    await getAppKeyValueStorage().multiRemove(asyncKeys)
  }

  await Promise.all(
    [...senderKeys].map((senderKey) =>
      SecureStore.deleteItemAsync(senderKey, SECURE_STORE_OPTIONS)
    ),
  )
}

export async function exportActiveGroupChatStorageSnapshot(): Promise<GroupChatStorageBackupSnapshot> {
  const scopedPrefix = getScopedAsyncPrefix()
  const allKeys = await getAppKeyValueStorage().getAllKeys()
  const asyncKeys = allKeys.filter((key) => key.startsWith(scopedPrefix))
  const asyncEntries = await getAppKeyValueStorage().multiGet(asyncKeys)
  const groupIds = parseGroupIds(
    asyncEntries.find(([key]) => key === groupIndexKey())?.[1] ?? null,
  )

  const senderKeyEntries = await Promise.all(
    groupIds.map(async (groupId) => {
      const value = await SecureStore.getItemAsync(senderKeyStorageKey(groupId), SECURE_STORE_OPTIONS)
      return value === null ? null : [groupId, value] as const
    }),
  )

  return {
    schemaVersion: 1,
    scope: activeGroupStorageScope,
    asyncEntries: asyncEntries.flatMap(([fullKey, value]) => (
      value === null ? [] : [[fullKey.slice(scopedPrefix.length), value] as const]
    )),
    senderKeyEntries: senderKeyEntries.filter((entry): entry is readonly [string, string] => entry !== null),
  }
}

export async function importActiveGroupChatStorageSnapshot(
  snapshot: GroupChatStorageBackupSnapshot,
  options: { replaceExisting?: boolean } = {},
): Promise<void> {
  if (snapshot.schemaVersion !== 1) {
    throw new Error('Unsupported group chat storage backup schema')
  }
  const storageScope = requireGroupStorageScope()

  if (options.replaceExisting) {
    const scopedPrefix = getScopedAsyncPrefix()
    const allKeys = await getAppKeyValueStorage().getAllKeys()
    const scopedKeys = allKeys.filter((key) => key.startsWith(scopedPrefix))
    const existingGroups = parseGroupIds(await getAppKeyValueStorage().getItem(groupIndexKey()))
    if (scopedKeys.length > 0) {
      await getAppKeyValueStorage().multiRemove(scopedKeys)
    }
    await Promise.all(
      existingGroups.map((groupId) =>
        SecureStore.deleteItemAsync(senderKeyStorageKey(groupId), SECURE_STORE_OPTIONS)
      ),
    )
  }

  const scopedPrefix = getScopedAsyncPrefix()
  let asyncPairs = snapshot.asyncEntries.map(([key, value]) => [
    `${scopedPrefix}${key}`,
    value,
    key,
  ] as [string, string, string])
  if (!options.replaceExisting && asyncPairs.length > 0) {
    const existing = new Map(await getAppKeyValueStorage().multiGet(asyncPairs.map(([fullKey]) => fullKey)))
    asyncPairs = asyncPairs.flatMap(([fullKey, incomingValue, unscopedKey]) => {
      const existingValue = existing.get(fullKey)
      if (existingValue === null || existingValue === undefined) {
        return [[fullKey, incomingValue, unscopedKey] as [string, string, string]]
      }
      if (isGroupBackupIndexEntryKey(unscopedKey)) {
        const merged = mergeStoredStringArray(existingValue, incomingValue)
        return merged === null ? [] : [[fullKey, merged, unscopedKey] as [string, string, string]]
      }
      return []
    })
  }
  if (asyncPairs.length > 0) {
    const protectedPairs = await Promise.all(asyncPairs.map(async ([fullKey, value, unscopedKey]) => {
      try {
        const parsed: unknown = JSON.parse(value)
        if (unscopedKey.startsWith('group_') && unscopedKey !== 'group_index') {
          const stored = isSealedGroupConversationRecord(parsed)
            ? parsed
            : await sealGroupConversationRecord(storageScope, parsed as GroupConversation)
          return [fullKey, JSON.stringify(stored)] as [string, string]
        }
        if (unscopedKey.startsWith('message_') && !unscopedKey.startsWith('message_index_')) {
          if (isSealedGroupMessageRecord(parsed)) {
            return [fullKey, value] as [string, string]
          }
          const message = parsed as ChatMessage
          const groupId = message.groupId
            || (message.conversationId?.startsWith('group:')
              ? message.conversationId.slice('group:'.length)
              : null)
          if (!groupId) return undefined
          return [
            fullKey,
            JSON.stringify(await sealGroupMessageRecord(storageScope, groupId, message)),
          ] as [string, string]
        }
        return [fullKey, value] as [string, string]
      } catch {
        return undefined
      }
    }))
    const validPairs = protectedPairs.filter((entry): entry is [string, string] => entry !== undefined)
    if (validPairs.length > 0) {
      await getAppKeyValueStorage().multiSet(validPairs)
    }
  }
  await getAppKeyValueStorage().setItem(getContentSealMarkerKey(storageScope), 'true')

  await Promise.all(
    snapshot.senderKeyEntries.map(async ([groupId, value]) => {
      if (!options.replaceExisting) {
        const existing = await SecureStore.getItemAsync(senderKeyStorageKey(groupId), SECURE_STORE_OPTIONS)
        if (existing) return
      }
      await SecureStore.setItemAsync(senderKeyStorageKey(groupId), value, SECURE_STORE_OPTIONS)
    }),
  )
}
