/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Local Storage with Encryption at Rest
 * 
 * Stores all chat data locally using IndexedDB or localStorage.
 * Everything stays on the device - no server required.
 * 
 * Features:
 * - Encryption at rest for sensitive data
 * - Session records with multi-session support
 * - Processed message tracking for deduplication
 * - Secure key deletion
 */

import type { 
  ChatIdentityWithKeys, 
  Session,
  SessionRecord,
  PrivateKeyBundle,
  PublicKeyBundle,
  Conversation,
  Message,
  MessageStatusUpdateOptions,
  InboundMessageCommit,
  OutboundMessageCommit,
  DecryptedMessage,
  ProcessedMessageRecord,
  RelayReceiptJob,
  TrackedIdentity,
  RetryRequestRecord,
  MailboxScopeState,
  RelaySenderBundleAttachState,
} from '../types/index'
import { serializeSessionState, deserializeSessionState, securelyDeleteSessionState } from '../crypto/ratchet'
import { encryptMessage, decryptMessage } from '../crypto/aes'
import { 
  generateRandomBytes, 
  bytesToBase64, 
  base64ToBytes,
  deriveStorageKey,
  secureZero,
  now
} from '../crypto/utils'
import { PROTOCOL_VERSIONS, assertSupportedVersion } from '../crypto/protocolVersion'
import {
  compareMessageStatus,
  completeRelayDeliveryOutbox,
  hasPendingRelayDelivery,
  shouldSyncOutboundStatus,
} from '../messageLifecycle'

// Storage keys for localStorage fallback
const STORAGE_PREFIX = 'quantum_chat_'
const IDENTITY_KEY = `${STORAGE_PREFIX}identity_`
const SESSION_KEY = `${STORAGE_PREFIX}session_`
const SESSION_RECORD_KEY = `${STORAGE_PREFIX}session_record_`
const PRIVATE_BUNDLE_KEY = `${STORAGE_PREFIX}private_bundle_`
const PUBLIC_BUNDLE_KEY = `${STORAGE_PREFIX}public_bundle_`
const SESSION_BY_REMOTE_KEY = `${STORAGE_PREFIX}session_remote_`
const CONVERSATION_KEY = `${STORAGE_PREFIX}conversation_`
const MESSAGE_KEY = `${STORAGE_PREFIX}message_`
const MESSAGE_BY_RELAY_KEY = `${STORAGE_PREFIX}relay_message_`
const RECEIPT_JOB_KEY = `${STORAGE_PREFIX}receipt_job_`
const RETRY_REQUEST_KEY = `${STORAGE_PREFIX}retry_request_`
const RETRY_REQUEST_BY_RELAY_KEY = `${STORAGE_PREFIX}relay_retry_request_`
const MAILBOX_SCOPE_KEY = `${STORAGE_PREFIX}mailbox_scope_`
const MAILBOX_SCOPE_INDEX_KEY = `${STORAGE_PREFIX}mailbox_scope_index_`
const MAILBOX_SCOPE_INDEX_SEPARATOR = ':'
const RELAY_MAILBOX_CURSOR_KEY = `${STORAGE_PREFIX}relay_cursor_`
const RELAY_SENDER_BUNDLE_ATTACH_KEY = `${STORAGE_PREFIX}relay_sender_bundle_attach_`
const MESSAGES_BY_CONV_KEY = `${STORAGE_PREFIX}messages_conv_`
const OUTBOUND_COMMIT_KEY = `${STORAGE_PREFIX}outbound_commit_`
const INBOUND_COMMIT_KEY = `${STORAGE_PREFIX}inbound_commit_`
const PROCESSED_MESSAGE_KEY = `${STORAGE_PREFIX}processed_`
const ENCRYPTION_SALT_KEY = `${STORAGE_PREFIX}encryption_salt`
const ENCRYPTION_METADATA_KEY = `${STORAGE_PREFIX}encryption_metadata`
const DEFAULT_STORAGE_KDF_ITERATIONS = 100000

function shouldSyncMessageStatus(message: Message, senderIdentityId: string): boolean {
  return shouldSyncOutboundStatus(message, senderIdentityId, now())
}

// Storage Encryption

interface StorageEncryption {
  key: Uint8Array | null
  salt: Uint8Array
  enabled: boolean
}

export interface StorageKdfMetadata {
  version: number
  algorithm: 'PBKDF2-HMAC-SHA256'
  salt: string
  iterations: number
  createdAt: number
}

interface EncryptedStorageRecord {
  __encryptedRecord: true
  v: number
  payload: string
}

function getMailboxScopeIndexEntry(scope: MailboxScopeState): string {
  return `${scope.remoteIdentityId}${MAILBOX_SCOPE_INDEX_SEPARATOR}${scope.scopeId}`
}

function getMailboxScopeStorageId(scope: MailboxScopeState): string {
  return `${scope.localIdentityId}:${scope.remoteIdentityId}:${scope.scopeId}`
}

function getMailboxScopeStorageIdFromIndex(localIdentityId: string, entry: string): string {
  const [remoteIdentityId, scopeId] = entry.split(MAILBOX_SCOPE_INDEX_SEPARATOR)
  if (remoteIdentityId && scopeId) {
    return `${localIdentityId}:${remoteIdentityId}:${scopeId}`
  }
  return `${localIdentityId}:${entry}`
}

function getMailboxScopeRemoteIdentityId(entry: string): string {
  return entry.split(MAILBOX_SCOPE_INDEX_SEPARATOR)[0] || entry
}

function isRelayMailboxCursorIdentityId(identityId: string): boolean {
  return identityId.length >= 8 && identityId.length <= 200
}

export function parseRelayMailboxCursor(value: unknown): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value
  }
  if (value && typeof value === 'object' && 'sequence' in value) {
    const sequence = (value as { sequence?: unknown }).sequence
    if (typeof sequence === 'number' && Number.isSafeInteger(sequence) && sequence >= 0) {
      return sequence
    }
  }
  return 0
}

function relaySenderBundleAttachPairKey(
  localIdentityId: string,
  remoteIdentityId: string,
): string | null {
  if (
    !isRelayMailboxCursorIdentityId(localIdentityId)
    || !isRelayMailboxCursorIdentityId(remoteIdentityId)
  ) {
    return null
  }
  return `${localIdentityId}:${remoteIdentityId}`
}

export function parseRelaySenderBundleAttachState(value: unknown): RelaySenderBundleAttachState | null {
  if (!value || typeof value !== 'object') return null
  const fingerprint = (value as { fingerprint?: unknown }).fingerprint
  const attachedAt = (value as { attachedAt?: unknown }).attachedAt
  if (typeof fingerprint !== 'string' || fingerprint.length === 0 || fingerprint.length > 256) {
    return null
  }
  if (typeof attachedAt !== 'number' || !Number.isSafeInteger(attachedAt) || attachedAt <= 0) {
    return null
  }
  return { fingerprint, attachedAt }
}

function getPreferredMailboxScope(scopes: MailboxScopeState[]): MailboxScopeState | null {
  return [...scopes].sort((a, b) => {
    const aReady = a.status === 'active' && a.registeredAt && a.acknowledgedAt ? 1 : 0
    const bReady = b.status === 'active' && b.registeredAt && b.acknowledgedAt ? 1 : 0
    if (aReady !== bReady) return bReady - aReady
    return (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt)
  })[0] ?? null
}

let storageEncryption: StorageEncryption = {
  key: null,
  salt: new Uint8Array(32),
  enabled: false
}

/**
 * Initialize storage encryption with a key
 */
export function initStorageEncryption(encryptionKey: Uint8Array): void {
  storageEncryption.key = encryptionKey
  storageEncryption.enabled = true
}

/**
 * Initialize storage encryption from password
 */
export function initStorageEncryptionFromPassword(password: string): Uint8Array {
  const metadata = getOrCreateStorageKdfMetadata()
  storageEncryption.salt = base64ToBytes(metadata.salt)
  
  // Derive key from password
  const key = deriveStorageKey(password, storageEncryption.salt, metadata.iterations)
  initStorageEncryption(key)
  return key
}

export function getStorageKdfMetadata(): StorageKdfMetadata | null {
  const metadataJson = localStorage.getItem(ENCRYPTION_METADATA_KEY)
  if (!metadataJson) return null
  const metadata = JSON.parse(metadataJson) as StorageKdfMetadata
  assertSupportedVersion('Storage KDF metadata', metadata.version, PROTOCOL_VERSIONS.storageKdf)
  return metadata
}

function getOrCreateStorageKdfMetadata(): StorageKdfMetadata {
  const existing = getStorageKdfMetadata()
  if (existing) return existing

  const legacySalt = localStorage.getItem(ENCRYPTION_SALT_KEY)
  const salt = legacySalt ?? bytesToBase64(generateRandomBytes(32))
  const metadata: StorageKdfMetadata = {
    version: PROTOCOL_VERSIONS.storageKdf,
    algorithm: 'PBKDF2-HMAC-SHA256',
    salt,
    iterations: DEFAULT_STORAGE_KDF_ITERATIONS,
    createdAt: now(),
  }

  localStorage.setItem(ENCRYPTION_METADATA_KEY, JSON.stringify(metadata))
  localStorage.setItem(ENCRYPTION_SALT_KEY, salt)
  return metadata
}

/**
 * Disable storage encryption
 */
export function disableStorageEncryption(): void {
  if (storageEncryption.key) {
    secureZero(storageEncryption.key)
  }
  storageEncryption.key = null
  storageEncryption.enabled = false
}

/**
 * Check if storage encryption is enabled
 */
export function isStorageEncryptionEnabled(): boolean {
  return storageEncryption.enabled && storageEncryption.key !== null
}

/**
 * Encrypt data for storage
 */
function encryptForStorage(data: string): string {
  if (!storageEncryption.enabled || !storageEncryption.key) {
    return data
  }
  
  const { ciphertext, nonce, tag } = encryptMessage(storageEncryption.key, data, new Uint8Array(0))
  return JSON.stringify({ c: ciphertext, n: nonce, t: tag, e: true, v: PROTOCOL_VERSIONS.storagePayload })
}

/**
 * Decrypt data from storage
 */
function decryptFromStorage(encrypted: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(encrypted)
  } catch {
    // Not JSON or not encrypted format
    return encrypted
  }

  if (!parsed || typeof parsed !== 'object' || !(parsed as { e?: boolean }).e) {
    return encrypted
  }

  assertSupportedVersion(
    'Storage payload',
    (parsed as { v?: number }).v,
    PROTOCOL_VERSIONS.storagePayload,
  )

  if (!storageEncryption.enabled || !storageEncryption.key) {
    throw new Error('Storage encryption key not available')
  }

  const payload = parsed as { c?: string; n?: string; t?: string }
  if (!payload.c || !payload.n || !payload.t) {
    throw new Error('Invalid encrypted storage payload')
  }
  
  return decryptMessage(storageEncryption.key, payload.c, payload.n, payload.t, new Uint8Array(0))
}

function encryptRecordForStorage<T>(record: T): T | EncryptedStorageRecord {
  if (!storageEncryption.enabled || !storageEncryption.key) {
    return record
  }
  return {
    __encryptedRecord: true,
    v: PROTOCOL_VERSIONS.storagePayload,
    payload: encryptForStorage(JSON.stringify(record)),
  }
}

function decryptRecordFromStorage<T>(record: T | EncryptedStorageRecord): T {
  if (
    record &&
    typeof record === 'object' &&
    (record as Partial<EncryptedStorageRecord>).__encryptedRecord
  ) {
    const encryptedRecord = record as EncryptedStorageRecord
    assertSupportedVersion('Encrypted storage record', encryptedRecord.v, PROTOCOL_VERSIONS.storagePayload)
    return JSON.parse(decryptFromStorage(encryptedRecord.payload)) as T
  }
  return record as T
}

// Storage Interface

export interface LocalStorage {
  // Identity operations
  storeIdentity(identity: ChatIdentityWithKeys): Promise<void>
  getIdentity(id: string): Promise<ChatIdentityWithKeys | null>
  getIdentityByAddress(address: string): Promise<ChatIdentityWithKeys | null>
  getAllIdentities(): Promise<ChatIdentityWithKeys[]>
  
  // Session operations (individual sessions)
  storeSession(session: Session): Promise<void>
  getSession(id: string): Promise<Session | null>
  deleteSession(id: string): Promise<void>
  
  // Session record operations (multi-session management)
  storeSessionRecord(record: SessionRecord): Promise<void>
  getSessionRecord(remoteIdentityId: string): Promise<SessionRecord | null>
  getActiveSession(remoteIdentityId: string): Promise<Session | null>
  getAllSessions(remoteIdentityId: string): Promise<Session[]>
  setActiveSession(remoteIdentityId: string, sessionId: string): Promise<void>
  
  // Key bundle operations
  storePrivateKeyBundle(identityId: string, bundle: PrivateKeyBundle): Promise<void>
  getPrivateKeyBundle(identityId: string): Promise<PrivateKeyBundle | null>
  storePublicKeyBundle(identityId: string, bundle: PublicKeyBundle): Promise<void>
  getPublicKeyBundle(identityId: string): Promise<PublicKeyBundle | null>
  
  // Conversation operations
  storeConversation(conversation: Conversation): Promise<void>
  getConversation(id: string): Promise<Conversation | null>
  getConversationByParticipants(localId: string, remoteId: string): Promise<Conversation | null>
  getConversations(identityId: string): Promise<Conversation[]>
  updateConversation(id: string, updates: Partial<Conversation>): Promise<void>
  rekeyConversation(sourceConversationId: string, targetConversationId: string): Promise<void>
  
  // Message operations
  commitOutboundMessage(commit: OutboundMessageCommit): Promise<void>
  commitInboundMessage(commit: InboundMessageCommit): Promise<void>
  storeMessage(message: Message): Promise<void>
  getMessage(id: string): Promise<Message | null>
  getMessageByRelayId(relayMessageId: string): Promise<Message | null>
  getMessages(conversationId: string, options?: { limit?: number; before?: number }): Promise<Message[]>
  getMessagesNeedingStatusSync(senderIdentityId: string): Promise<Message[]>
  getPendingRelayDeliveries(senderIdentityId: string): Promise<Message[]>
  linkRelayMessage(
    messageId: string,
    relayMessageId: string,
    relayDeliveryToken?: string,
  ): Promise<Message | null>
  updateMessageStatus(
    id: string,
    status: Message['status'],
    options?: MessageStatusUpdateOptions,
  ): Promise<void>
  deleteMessage(id: string): Promise<void>
  
  // Decrypted message cache (for display)
  storeDecryptedMessage(message: DecryptedMessage): Promise<void>
  getDecryptedMessage(id: string): Promise<DecryptedMessage | null>
  getDecryptedMessages(conversationId: string, options?: { limit?: number; before?: number }): Promise<DecryptedMessage[]>
  updateDecryptedMessage(id: string, updates: Partial<DecryptedMessage>): Promise<void>
  deleteDecryptedMessage(id: string): Promise<void>
  
  // Message deduplication
  storeProcessedMessage(record: ProcessedMessageRecord): Promise<void>
  getProcessedMessage(messageId: string): Promise<ProcessedMessageRecord | null>
  isMessageProcessed(messageId: string): Promise<boolean>
  cleanupProcessedMessages(maxAgeMs: number): Promise<number>

  // Retry-request deduplication
  storeRetryRequestRecord(record: RetryRequestRecord): Promise<void>
  getRetryRequestRecord(key: string): Promise<RetryRequestRecord | null>
  getRetryRequestRecordByRelayId(relayMessageId: string): Promise<RetryRequestRecord | null>
  cleanupRetryRequestRecords(maxAgeMs: number): Promise<number>
  storeRelayReceiptJob(job: RelayReceiptJob): Promise<void>
  getRelayReceiptJob(key: string): Promise<RelayReceiptJob | null>
  getPendingRelayReceiptJobs(nowMs: number, limit?: number): Promise<RelayReceiptJob[]>
  deleteRelayReceiptJob(key: string): Promise<void>
  cleanupRelayReceiptJobs(maxAgeMs: number): Promise<number>
  storeMailboxScope(scope: MailboxScopeState): Promise<void>
  getMailboxScope(localIdentityId: string, remoteIdentityId: string): Promise<MailboxScopeState | null>
  getMailboxScopes(localIdentityId: string): Promise<MailboxScopeState[]>
  deleteMailboxScope(localIdentityId: string, remoteIdentityId: string): Promise<void>
  getRelayMailboxCursor(identityId: string): Promise<number>
  storeRelayMailboxCursor(identityId: string, sequence: number): Promise<void>
  getRelaySenderBundleAttachState(
    localIdentityId: string,
    remoteIdentityId: string,
  ): Promise<RelaySenderBundleAttachState | null>
  storeRelaySenderBundleAttachState(
    localIdentityId: string,
    remoteIdentityId: string,
    state: RelaySenderBundleAttachState,
  ): Promise<void>
  
  // Tracked identities (TOFU)
  storeTrackedIdentity(tracked: TrackedIdentity): Promise<void>
  getTrackedIdentity(identityId: string): Promise<TrackedIdentity | null>
  getAllTrackedIdentities(): Promise<TrackedIdentity[]>
  deleteTrackedIdentity(identityId: string): Promise<void>
  
  // Deletion operations
  deleteConversation(id: string): Promise<void>
  deleteConversationMessages(conversationId: string): Promise<void>
  deletePublicKeyBundle(identityId: string): Promise<void>
  deleteSessionRecord(remoteIdentityId: string): Promise<void>
  
  // Clear all data
  clear(): Promise<void>
}

// INDEXEDDB STORAGE (Primary)

const DB_NAME = 'QuantumChat'
const DB_VERSION = 10

class IndexedDBStorage implements LocalStorage {
  private db: IDBDatabase | null = null
  private initPromise: Promise<void> | null = null

  private async init(): Promise<void> {
    if (this.db) return
    if (this.initPromise) return this.initPromise

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        // Identities
        if (!db.objectStoreNames.contains('identities')) {
          const store = db.createObjectStore('identities', { keyPath: 'id' })
          store.createIndex('blockchainAddress', 'blockchainAddress', { unique: false })
        }
        
        // Sessions (individual)
        if (!db.objectStoreNames.contains('sessions')) {
          const store = db.createObjectStore('sessions', { keyPath: 'id' })
          store.createIndex('remoteIdentityId', 'remoteIdentityId', { unique: false })
          store.createIndex('status', 'status', { unique: false })
        }
        
        // Session records (multi-session management)
        if (!db.objectStoreNames.contains('sessionRecords')) {
          db.createObjectStore('sessionRecords', { keyPath: 'remoteIdentityId' })
        }
        
        // Private key bundles
        if (!db.objectStoreNames.contains('privateBundles')) {
          db.createObjectStore('privateBundles', { keyPath: 'identityId' })
        }
        
        // Public key bundles
        if (!db.objectStoreNames.contains('publicBundles')) {
          db.createObjectStore('publicBundles', { keyPath: 'identityId' })
        }
        
        // Conversations
        if (!db.objectStoreNames.contains('conversations')) {
          const store = db.createObjectStore('conversations', { keyPath: 'id' })
          store.createIndex('localIdentityId', 'localIdentityId', { unique: false })
          store.createIndex('participants', ['localIdentityId', 'remoteIdentityId'], { unique: true })
        }
        
        // Messages (encrypted)
        let messageStore: IDBObjectStore
        if (!db.objectStoreNames.contains('messages')) {
          messageStore = db.createObjectStore('messages', { keyPath: 'id' })
        } else {
          messageStore = request.transaction!.objectStore('messages')
        }
        if (!messageStore.indexNames.contains('conversationId')) {
          messageStore.createIndex('conversationId', 'conversationId', { unique: false })
        }
        if (!messageStore.indexNames.contains('conversationTime')) {
          messageStore.createIndex('conversationTime', ['conversationId', 'createdAt'], { unique: false })
        }
        if (!messageStore.indexNames.contains('senderIdentityId')) {
          messageStore.createIndex('senderIdentityId', 'senderIdentityId', { unique: false })
        }
        if (!messageStore.indexNames.contains('relayMessageId')) {
          messageStore.createIndex('relayMessageId', 'relayMessageId', { unique: false })
        }
        
        // Decrypted messages (cache for display)
        if (!db.objectStoreNames.contains('decryptedMessages')) {
          const store = db.createObjectStore('decryptedMessages', { keyPath: 'id' })
          store.createIndex('conversationId', 'conversationId', { unique: false })
          store.createIndex('conversationTime', ['conversationId', 'timestamp'], { unique: false })
        }
        
        // Processed messages (for deduplication)
        if (!db.objectStoreNames.contains('processedMessages')) {
          const store = db.createObjectStore('processedMessages', { keyPath: 'messageId' })
          store.createIndex('sessionId', 'sessionId', { unique: false })
          store.createIndex('processedAt', 'processedAt', { unique: false })
        }

        // Retry-request ledger (durable duplicate suppression/backoff)
        let retryRequestStore: IDBObjectStore
        if (!db.objectStoreNames.contains('retryRequests')) {
          retryRequestStore = db.createObjectStore('retryRequests', { keyPath: 'key' })
        } else {
          retryRequestStore = request.transaction!.objectStore('retryRequests')
        }
        if (!retryRequestStore.indexNames.contains('senderIdentityId')) {
          retryRequestStore.createIndex('senderIdentityId', 'senderIdentityId', { unique: false })
        }
        if (!retryRequestStore.indexNames.contains('relayMessageId')) {
          retryRequestStore.createIndex('relayMessageId', 'relayMessageId', { unique: false })
        }
        if (!retryRequestStore.indexNames.contains('lastSeenAt')) {
          retryRequestStore.createIndex('lastSeenAt', 'lastSeenAt', { unique: false })
        }

        let receiptJobStore: IDBObjectStore
        if (!db.objectStoreNames.contains('relayReceiptJobs')) {
          receiptJobStore = db.createObjectStore('relayReceiptJobs', { keyPath: 'key' })
        } else {
          receiptJobStore = request.transaction!.objectStore('relayReceiptJobs')
        }
        if (!receiptJobStore.indexNames.contains('nextAttemptAt')) {
          receiptJobStore.createIndex('nextAttemptAt', 'nextAttemptAt', { unique: false })
        }
        if (!receiptJobStore.indexNames.contains('updatedAt')) {
          receiptJobStore.createIndex('updatedAt', 'updatedAt', { unique: false })
        }

        let mailboxScopeStore: IDBObjectStore
        if (!db.objectStoreNames.contains('mailboxScopes')) {
          mailboxScopeStore = db.createObjectStore('mailboxScopes', { keyPath: 'key' })
        } else {
          mailboxScopeStore = request.transaction!.objectStore('mailboxScopes')
        }
        if (!mailboxScopeStore.indexNames.contains('localIdentityId')) {
          mailboxScopeStore.createIndex('localIdentityId', 'localIdentityId', { unique: false })
        }

        if (!db.objectStoreNames.contains('relayMailboxCursors')) {
          db.createObjectStore('relayMailboxCursors', { keyPath: 'identityId' })
        }

        if (!db.objectStoreNames.contains('relaySenderBundleAttach')) {
          db.createObjectStore('relaySenderBundleAttach', { keyPath: 'pairKey' })
        }
        
        // Tracked identities (TOFU - Trust on First Use)
        if (!db.objectStoreNames.contains('trackedIdentities')) {
          const store = db.createObjectStore('trackedIdentities', { keyPath: 'identityId' })
          store.createIndex('trustState', 'trustState', { unique: false })
          store.createIndex('lastUpdatedAt', 'lastUpdatedAt', { unique: false })
        }
      }
    })

    return this.initPromise
  }

  private async getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')
    const tx = this.db.transaction(storeName, mode)
    return tx.objectStore(storeName)
  }

  // Identity Operations

  async storeIdentity(identity: ChatIdentityWithKeys): Promise<void> {
    const store = await this.getStore('identities', 'readwrite')
    // Encrypt sensitive fields
    const encrypted = {
      ...identity,
      identityPrivateKey: encryptForStorage(identity.identityPrivateKey),
      mlkemPrivateKey: encryptForStorage(identity.mlkemPrivateKey),
      dilithiumPrivateKey: encryptForStorage(identity.dilithiumPrivateKey)
    }
    return new Promise((resolve, reject) => {
      const request = store.put(encrypted)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getIdentity(id: string): Promise<ChatIdentityWithKeys | null> {
    const store = await this.getStore('identities')
    return new Promise((resolve, reject) => {
      const request = store.get(id)
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null)
          return
        }
        // Decrypt sensitive fields
        const decrypted = {
          ...request.result,
          identityPrivateKey: decryptFromStorage(request.result.identityPrivateKey),
          mlkemPrivateKey: decryptFromStorage(request.result.mlkemPrivateKey),
          dilithiumPrivateKey: decryptFromStorage(request.result.dilithiumPrivateKey)
        }
        resolve(decrypted)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getIdentityByAddress(address: string): Promise<ChatIdentityWithKeys | null> {
    const store = await this.getStore('identities')
    const index = store.index('blockchainAddress')
    return new Promise((resolve, reject) => {
      const request = index.get(address)
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null)
          return
        }
        // Decrypt sensitive fields
        const decrypted = {
          ...request.result,
          identityPrivateKey: decryptFromStorage(request.result.identityPrivateKey),
          mlkemPrivateKey: decryptFromStorage(request.result.mlkemPrivateKey),
          dilithiumPrivateKey: decryptFromStorage(request.result.dilithiumPrivateKey)
        }
        resolve(decrypted)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getAllIdentities(): Promise<ChatIdentityWithKeys[]> {
    const store = await this.getStore('identities')
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => {
        const identities = (request.result || []).map(result => ({
          ...result,
          identityPrivateKey: decryptFromStorage(result.identityPrivateKey),
          mlkemPrivateKey: decryptFromStorage(result.mlkemPrivateKey),
          dilithiumPrivateKey: decryptFromStorage(result.dilithiumPrivateKey)
        }))
        resolve(identities)
      }
      request.onerror = () => reject(request.error)
    })
  }

  // Session Operations

  async storeSession(session: Session): Promise<void> {
    const store = await this.getStore('sessions', 'readwrite')
    const serializedState = serializeSessionState(session.state)
    const serializedSession = {
      ...session,
      state: encryptForStorage(serializedState)
    }
    return new Promise((resolve, reject) => {
      const request = store.put(serializedSession)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getSession(id: string): Promise<Session | null> {
    const store = await this.getStore('sessions')
    return new Promise((resolve, reject) => {
      const request = store.get(id)
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null)
          return
        }
        const decryptedState = decryptFromStorage(request.result.state)
        const session = {
          ...request.result,
          state: deserializeSessionState(decryptedState)
        }
        resolve(session)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async deleteSession(id: string): Promise<void> {
    // First get the session to securely clear its state
    const session = await this.getSession(id)
    if (session) {
      // Securely clear the session state
      securelyDeleteSessionState(session.state)
    }
    
    const store = await this.getStore('sessions', 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // SESSION RECORD OPERATIONS (Multi-session)

  async storeSessionRecord(record: SessionRecord): Promise<void> {
    const store = await this.getStore('sessionRecords', 'readwrite')
    // Convert Maps to arrays for storage (JSON doesn't serialize Maps)
    const serialized = {
      ...record,
      sessions: Array.from(record.sessions.entries()),
      deviceRecords: Array.from(record.deviceRecords.entries())
    }
    const storedRecord = {
      remoteIdentityId: record.remoteIdentityId,
      activeSessionId: record.activeSessionId,
      updatedAt: record.updatedAt,
      payload: encryptRecordForStorage(serialized),
    }
    return new Promise((resolve, reject) => {
      const request = store.put(storedRecord)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getSessionRecord(remoteIdentityId: string): Promise<SessionRecord | null> {
    const store = await this.getStore('sessionRecords')
    return new Promise((resolve, reject) => {
      const request = store.get(remoteIdentityId)
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null)
          return
        }
        const stored = request.result.payload
          ? decryptRecordFromStorage<any>(request.result.payload)
          : request.result
        // Convert arrays back to Maps
        const record: SessionRecord = {
          ...stored,
          sessions: new Map(stored.sessions || []),
          deviceRecords: new Map(stored.deviceRecords || [])
        }
        resolve(record)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getActiveSession(remoteIdentityId: string): Promise<Session | null> {
    const record = await this.getSessionRecord(remoteIdentityId)
    if (!record || !record.activeSessionId) {
      return this.getLegacySessionByRemoteIdentity(remoteIdentityId)
    }
    return this.getSession(record.activeSessionId)
  }

  async getAllSessions(remoteIdentityId: string): Promise<Session[]> {
    const store = await this.getStore('sessions')
    const index = store.index('remoteIdentityId')
    return new Promise((resolve, reject) => {
      const request = index.getAll(remoteIdentityId)
      request.onsuccess = () => {
        const sessions = (request.result || []).map(result => ({
          ...result,
          state: deserializeSessionState(decryptFromStorage(result.state))
        }))
        resolve(sessions)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async setActiveSession(remoteIdentityId: string, sessionId: string): Promise<void> {
    let record = await this.getSessionRecord(remoteIdentityId)
    
    if (!record) {
      // Create new record
      record = {
        remoteIdentityId,
        deviceRecords: new Map(),
        sessions: new Map(),
        activeSessionId: sessionId,
        isStale: false,
        updatedAt: now()
      }
    } else {
      record.activeSessionId = sessionId
      record.updatedAt = now()
    }
    
    // Update all session statuses
    const allSessions = await this.getAllSessions(remoteIdentityId)
    for (const session of allSessions) {
      if (session.id === sessionId) {
        session.status = 'active'
      } else if (session.status === 'active') {
        session.status = 'inactive'
      }
      await this.storeSession(session)
      record.sessions.set(session.id, session)
    }
    
    await this.storeSessionRecord(record)
  }

  private async getLegacySessionByRemoteIdentity(remoteIdentityId: string): Promise<Session | null> {
    const store = await this.getStore('sessions')
    const index = store.index('remoteIdentityId')
    return new Promise((resolve, reject) => {
      const request = index.get(remoteIdentityId)
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null)
          return
        }
        const decryptedState = decryptFromStorage(request.result.state)
        const session = {
          ...request.result,
          state: deserializeSessionState(decryptedState)
        }
        resolve(session)
      }
      request.onerror = () => reject(request.error)
    })
  }

  // Key Bundle Operations

  async storePrivateKeyBundle(identityId: string, bundle: PrivateKeyBundle): Promise<void> {
    const store = await this.getStore('privateBundles', 'readwrite')
    const serializedBundle = {
      identityId,
      bundle: {
        ...bundle,
        // Encrypt all private keys
        identityPrivateKey: encryptForStorage(bundle.identityPrivateKey),
        mlkemIdentityPrivateKey: encryptForStorage(bundle.mlkemIdentityPrivateKey),
        dilithiumPrivateKey: encryptForStorage(bundle.dilithiumPrivateKey),
        signedPreKeyPrivate: encryptForStorage(bundle.signedPreKeyPrivate),
        mlkemSignedPreKeyPrivate: encryptForStorage(bundle.mlkemSignedPreKeyPrivate),
        oneTimePreKeyPrivates: Array.from(bundle.oneTimePreKeyPrivates.entries()).map(
          ([id, key]) => [id, encryptForStorage(key)]
        ),
        mlkemOneTimePreKeyPrivates: Array.from(bundle.mlkemOneTimePreKeyPrivates.entries()).map(
          ([id, key]) => [id, encryptForStorage(key)]
        ),
        previousSignedPreKeys: bundle.previousSignedPreKeys?.map(spk => ({
          ...spk,
          x25519Private: encryptForStorage(spk.x25519Private),
          mlkemPrivate: encryptForStorage(spk.mlkemPrivate)
        }))
      }
    }
    return new Promise((resolve, reject) => {
      const request = store.put(serializedBundle)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getPrivateKeyBundle(identityId: string): Promise<PrivateKeyBundle | null> {
    const store = await this.getStore('privateBundles')
    return new Promise((resolve, reject) => {
      const request = store.get(identityId)
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null)
          return
        }
        const storedBundle = request.result.bundle
        const bundle: PrivateKeyBundle = {
          identityPrivateKey: decryptFromStorage(storedBundle.identityPrivateKey),
          mlkemIdentityPrivateKey: decryptFromStorage(storedBundle.mlkemIdentityPrivateKey),
          dilithiumPrivateKey: decryptFromStorage(storedBundle.dilithiumPrivateKey),
          signedPreKeyPrivate: decryptFromStorage(storedBundle.signedPreKeyPrivate),
          mlkemSignedPreKeyPrivate: decryptFromStorage(storedBundle.mlkemSignedPreKeyPrivate),
          oneTimePreKeyPrivates: new Map(
            (storedBundle.oneTimePreKeyPrivates || []).map(
              ([id, key]: [number, string]) => [id, decryptFromStorage(key)]
            )
          ),
          mlkemOneTimePreKeyPrivates: new Map(
            (storedBundle.mlkemOneTimePreKeyPrivates || []).map(
              ([id, key]: [number, string]) => [id, decryptFromStorage(key)]
            )
          ),
          nextPreKeyId: storedBundle.nextPreKeyId || 1,
          signedPreKeyRotatedAt: storedBundle.signedPreKeyRotatedAt,
          previousSignedPreKeys: storedBundle.previousSignedPreKeys?.map((spk: any) => ({
            ...spk,
            x25519Private: decryptFromStorage(spk.x25519Private),
            mlkemPrivate: decryptFromStorage(spk.mlkemPrivate)
          }))
        }
        resolve(bundle)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async storePublicKeyBundle(identityId: string, bundle: PublicKeyBundle): Promise<void> {
    const store = await this.getStore('publicBundles', 'readwrite')
    const record = {
      identityId,
      payload: encryptRecordForStorage(bundle),
    }
    return new Promise((resolve, reject) => {
      const request = store.put(record)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getPublicKeyBundle(identityId: string): Promise<PublicKeyBundle | null> {
    const store = await this.getStore('publicBundles')
    return new Promise((resolve, reject) => {
      const request = store.get(identityId)
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null)
          return
        }
        const bundle: PublicKeyBundle = request.result.payload
          ? decryptRecordFromStorage<PublicKeyBundle>(request.result.payload)
          : {
              identityId: request.result.identityId,
              identityKey: request.result.identityKey,
              mlkemIdentityKey: request.result.mlkemIdentityKey,
              dilithiumKey: request.result.dilithiumKey,
              signedPreKey: request.result.signedPreKey,
              oneTimePreKeys: request.result.oneTimePreKeys,
              version: request.result.version || 1,
              timestamp: request.result.timestamp || 0,
              bundleSignature: request.result.bundleSignature
            }
        resolve(bundle)
      }
      request.onerror = () => reject(request.error)
    })
  }

  // Conversation Operations

  async storeConversation(conversation: Conversation): Promise<void> {
    const store = await this.getStore('conversations', 'readwrite')
    const record = {
      id: conversation.id,
      localIdentityId: conversation.localIdentityId,
      remoteIdentityId: conversation.remoteIdentityId,
      updatedAt: conversation.updatedAt,
      payload: encryptRecordForStorage(conversation),
    }
    return new Promise((resolve, reject) => {
      const request = store.put(record)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getConversation(id: string): Promise<Conversation | null> {
    const store = await this.getStore('conversations')
    return new Promise((resolve, reject) => {
      const request = store.get(id)
      request.onsuccess = () => resolve(request.result ? decryptRecordFromStorage<Conversation>(request.result.payload ?? request.result) : null)
      request.onerror = () => reject(request.error)
    })
  }

  async getConversationByParticipants(localId: string, remoteId: string): Promise<Conversation | null> {
    const store = await this.getStore('conversations')
    const index = store.index('participants')
    return new Promise((resolve, reject) => {
      const request = index.get([localId, remoteId])
      request.onsuccess = () => resolve(request.result ? decryptRecordFromStorage<Conversation>(request.result.payload ?? request.result) : null)
      request.onerror = () => reject(request.error)
    })
  }

  async getConversations(identityId: string): Promise<Conversation[]> {
    const store = await this.getStore('conversations')
    const index = store.index('localIdentityId')
    return new Promise((resolve, reject) => {
      const request = index.getAll(identityId)
      request.onsuccess = () => {
        const conversations = (request.result || []).map(result =>
          decryptRecordFromStorage<Conversation>(result.payload ?? result)
        )
        // Sort by updatedAt descending
        conversations.sort((a, b) => b.updatedAt - a.updatedAt)
        resolve(conversations)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
    const conversation = await this.getConversation(id)
    if (!conversation) return
    
    const updated = { ...conversation, ...updates, updatedAt: now() }
    await this.storeConversation(updated)
  }

  async rekeyConversation(sourceConversationId: string, targetConversationId: string): Promise<void> {
    if (sourceConversationId === targetConversationId) return

    const [conversation, encryptedMessages, decryptedMessages] = await Promise.all([
      this.getConversation(sourceConversationId),
      this.getMessages(sourceConversationId),
      this.getDecryptedMessages(sourceConversationId),
    ])

    if (conversation) {
      await this.storeConversation({
        ...conversation,
        id: targetConversationId,
        updatedAt: now(),
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

    await this.deleteConversation(sourceConversationId)
  }

  // Message Operations

  async commitOutboundMessage(commit: OutboundMessageCommit): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    const transaction = this.db.transaction(
      ['sessions', 'messages', 'conversations'],
      'readwrite',
    )
    const sessionStore = transaction.objectStore('sessions')
    const messageStore = transaction.objectStore('messages')
    const conversationStore = transaction.objectStore('conversations')
    let failure: Error | null = null

    const conversationRequest = conversationStore.get(commit.message.conversationId)
    conversationRequest.onsuccess = () => {
      if (!conversationRequest.result) {
        failure = new Error('Conversation is not available for outbound commit')
        transaction.abort()
        return
      }

      const conversation = decryptRecordFromStorage<Conversation>(
        conversationRequest.result.payload ?? conversationRequest.result,
      )
      const updatedConversation = {
        ...conversation,
        ...commit.conversationUpdate,
        updatedAt: now(),
      }
      const serializedSession = {
        ...commit.session,
        state: encryptForStorage(serializeSessionState(commit.session.state)),
      }
      const messageRecord = {
        id: commit.message.id,
        conversationId: commit.message.conversationId,
        createdAt: commit.message.createdAt,
        senderIdentityId: commit.message.senderIdentityId,
        relayMessageId: commit.message.relayMessageId,
        status: commit.message.status,
        payload: encryptRecordForStorage(commit.message),
      }
      const conversationRecord = {
        id: updatedConversation.id,
        localIdentityId: updatedConversation.localIdentityId,
        remoteIdentityId: updatedConversation.remoteIdentityId,
        updatedAt: updatedConversation.updatedAt,
        payload: encryptRecordForStorage(updatedConversation),
      }

      sessionStore.put(serializedSession)
      messageStore.put(messageRecord)
      conversationStore.put(conversationRecord)
    }
    conversationRequest.onerror = () => {
      failure = conversationRequest.error ?? new Error('Outbound conversation read failed')
      transaction.abort()
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(failure ?? transaction.error)
      transaction.onabort = () => reject(
        failure ?? transaction.error ?? new Error('Outbound commit aborted'),
      )
    })
  }

  async commitInboundMessage(commit: InboundMessageCommit): Promise<void> {
    await this.init()
    if (!this.db) throw new Error('Database not initialized')

    const transaction = this.db.transaction(
      [
        'sessions',
        'sessionRecords',
        'privateBundles',
        'publicBundles',
        'messages',
        'decryptedMessages',
        'processedMessages',
        'conversations',
      ],
      'readwrite',
    )
    const sessionStore = transaction.objectStore('sessions')
    const sessionRecordStore = transaction.objectStore('sessionRecords')
    const privateBundleStore = transaction.objectStore('privateBundles')
    const publicBundleStore = transaction.objectStore('publicBundles')
    const messageStore = transaction.objectStore('messages')
    const decryptedMessageStore = transaction.objectStore('decryptedMessages')
    const processedMessageStore = transaction.objectStore('processedMessages')
    const conversationStore = transaction.objectStore('conversations')
    let failure: Error | null = null

    const conversationRequest = conversationStore.get(commit.message.conversationId)
    conversationRequest.onsuccess = () => {
      if (!conversationRequest.result) {
        failure = new Error('Conversation is not available for inbound commit')
        transaction.abort()
        return
      }

      const conversation = decryptRecordFromStorage<Conversation>(
        conversationRequest.result.payload ?? conversationRequest.result,
      )
      const updatedConversation = {
        ...conversation,
        ...commit.conversationUpdate,
        updatedAt: now(),
      }
      const serializedSession = {
        ...commit.session,
        state: encryptForStorage(serializeSessionState(commit.session.state)),
      }
      const messageRecord = {
        id: commit.message.id,
        conversationId: commit.message.conversationId,
        createdAt: commit.message.createdAt,
        senderIdentityId: commit.message.senderIdentityId,
        relayMessageId: commit.message.relayMessageId,
        status: commit.message.status,
        payload: encryptRecordForStorage(commit.message),
      }
      const decryptedMessageRecord = {
        id: commit.decryptedMessage.id,
        conversationId: commit.decryptedMessage.conversationId,
        timestamp: commit.decryptedMessage.timestamp,
        payload: encryptRecordForStorage(commit.decryptedMessage),
      }
      const processedMessageRecord = {
        messageId: commit.processedMessage.messageId,
        sessionId: commit.processedMessage.sessionId,
        processedAt: commit.processedMessage.processedAt,
        payload: encryptRecordForStorage(commit.processedMessage),
      }
      const conversationRecord = {
        id: updatedConversation.id,
        localIdentityId: updatedConversation.localIdentityId,
        remoteIdentityId: updatedConversation.remoteIdentityId,
        updatedAt: updatedConversation.updatedAt,
        payload: encryptRecordForStorage(updatedConversation),
      }

      sessionStore.put(serializedSession)
      messageStore.put(messageRecord)
      decryptedMessageStore.put(decryptedMessageRecord)
      processedMessageStore.put(processedMessageRecord)
      conversationStore.put(conversationRecord)

      if (commit.sessionRecord) {
        const serializedRecord = {
          ...commit.sessionRecord,
          sessions: Array.from(commit.sessionRecord.sessions.entries()),
          deviceRecords: Array.from(commit.sessionRecord.deviceRecords.entries()),
        }
        sessionRecordStore.put({
          remoteIdentityId: commit.sessionRecord.remoteIdentityId,
          activeSessionId: commit.sessionRecord.activeSessionId,
          updatedAt: commit.sessionRecord.updatedAt,
          payload: encryptRecordForStorage(serializedRecord),
        })
      }

      if (commit.privateKeyBundle) {
        const { identityId, bundle } = commit.privateKeyBundle
        privateBundleStore.put({
          identityId,
          bundle: {
            ...bundle,
            identityPrivateKey: encryptForStorage(bundle.identityPrivateKey),
            mlkemIdentityPrivateKey: encryptForStorage(bundle.mlkemIdentityPrivateKey),
            dilithiumPrivateKey: encryptForStorage(bundle.dilithiumPrivateKey),
            signedPreKeyPrivate: encryptForStorage(bundle.signedPreKeyPrivate),
            mlkemSignedPreKeyPrivate: encryptForStorage(bundle.mlkemSignedPreKeyPrivate),
            oneTimePreKeyPrivates: Array.from(bundle.oneTimePreKeyPrivates.entries()).map(
              ([id, key]) => [id, encryptForStorage(key)],
            ),
            mlkemOneTimePreKeyPrivates: Array.from(bundle.mlkemOneTimePreKeyPrivates.entries()).map(
              ([id, key]) => [id, encryptForStorage(key)],
            ),
            previousSignedPreKeys: bundle.previousSignedPreKeys?.map((preKey) => ({
              ...preKey,
              x25519Private: encryptForStorage(preKey.x25519Private),
              mlkemPrivate: encryptForStorage(preKey.mlkemPrivate),
            })),
          },
        })
      }

      if (commit.publicKeyBundle) {
        publicBundleStore.put({
          identityId: commit.publicKeyBundle.identityId,
          payload: encryptRecordForStorage(commit.publicKeyBundle.bundle),
        })
      }
    }
    conversationRequest.onerror = () => {
      failure = conversationRequest.error ?? new Error('Inbound conversation read failed')
      transaction.abort()
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(failure ?? transaction.error)
      transaction.onabort = () => reject(
        failure ?? transaction.error ?? new Error('Inbound commit aborted'),
      )
    })
  }

  async storeMessage(message: Message): Promise<void> {
    const store = await this.getStore('messages', 'readwrite')
    const record = {
      id: message.id,
      conversationId: message.conversationId,
      createdAt: message.createdAt,
      senderIdentityId: message.senderIdentityId,
      relayMessageId: message.relayMessageId,
      status: message.status,
      payload: encryptRecordForStorage(message),
    }
    return new Promise((resolve, reject) => {
      const request = store.put(record)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getMessage(id: string): Promise<Message | null> {
    const store = await this.getStore('messages')
    return new Promise((resolve, reject) => {
      const request = store.get(id)
      request.onsuccess = () => resolve(request.result ? decryptRecordFromStorage<Message>(request.result.payload ?? request.result) : null)
      request.onerror = () => reject(request.error)
    })
  }

  async getMessageByRelayId(relayMessageId: string): Promise<Message | null> {
    const store = await this.getStore('messages')
    const index = store.index('relayMessageId')
    return new Promise((resolve, reject) => {
      const request = index.get(relayMessageId)
      request.onsuccess = () => resolve(request.result ? decryptRecordFromStorage<Message>(request.result.payload ?? request.result) : null)
      request.onerror = () => reject(request.error)
    })
  }

  async getMessages(conversationId: string, options?: { limit?: number; before?: number }): Promise<Message[]> {
    const store = await this.getStore('messages')
    const index = store.index('conversationId')
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(conversationId)
      request.onsuccess = () => {
        let messages = (request.result || []).map(result =>
          decryptRecordFromStorage<Message>(result.payload ?? result)
        )
        
        // Filter by before timestamp if provided
        if (options?.before) {
          messages = messages.filter(m => m.createdAt < options.before!)
        }
        
        // Sort by createdAt descending
        messages.sort((a, b) => b.createdAt - a.createdAt)
        
        // Apply limit
        if (options?.limit) {
          messages = messages.slice(0, options.limit)
        }
        
        resolve(messages)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getMessagesNeedingStatusSync(senderIdentityId: string): Promise<Message[]> {
    const store = await this.getStore('messages')
    const index = store.index('senderIdentityId')
    return new Promise((resolve, reject) => {
      const request = index.getAll(senderIdentityId)
      request.onsuccess = () => {
        const messages = (request.result || [])
          .map(result => decryptRecordFromStorage<Message>(result.payload ?? result))
          .filter((message) => shouldSyncMessageStatus(message, senderIdentityId))
        resolve(messages)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getPendingRelayDeliveries(senderIdentityId: string): Promise<Message[]> {
    const store = await this.getStore('messages')
    const index = store.index('senderIdentityId')
    return new Promise((resolve, reject) => {
      const request = index.getAll(senderIdentityId)
      request.onsuccess = () => {
        const messages = (request.result || [])
          .map(result => decryptRecordFromStorage<Message>(result.payload ?? result))
          .filter((message) => hasPendingRelayDelivery(message, senderIdentityId))
        resolve(messages)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async linkRelayMessage(
    messageId: string,
    relayMessageId: string,
    relayDeliveryToken?: string,
  ): Promise<Message | null> {
    const message = await this.getMessage(messageId)
    if (!message) return null
    const completed = completeRelayDeliveryOutbox(message, relayMessageId, relayDeliveryToken)
    if (completed !== message) {
      await this.storeMessage(completed)
    }
    return completed
  }

  async updateMessageStatus(
    id: string,
    status: Message['status'],
    options?: MessageStatusUpdateOptions,
  ): Promise<void> {
    const message = await this.getMessage(id)
    if (!message) return
    if (compareMessageStatus(status, message.status) < 0) return

    const wasRead = message.status === 'read'
    message.status = status
    if (status === 'delivered') {
      message.deliveredAt = now()
    }
    if (status === 'read') {
      message.readAt = now()
      if (
        !wasRead
        && message.relayReadReceiptEligible === undefined
        && options?.relayReadReceiptEligible !== undefined
      ) {
        message.relayReadReceiptEligible = options?.relayReadReceiptEligible
      }
    }
    await this.storeMessage(message)

    // Keep decrypted cache in sync so ticks survive reloads
    try {
      const decrypted = await this.getDecryptedMessage(id)
      if (decrypted) {
        await this.storeDecryptedMessage({ ...decrypted, status })
      }
    } catch {
      // Non-fatal: encrypted store is the source of truth
    }
  }

  async deleteMessage(id: string): Promise<void> {
    const store = await this.getStore('messages', 'readwrite')
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // Decrypted Message Cache

  async storeDecryptedMessage(message: DecryptedMessage): Promise<void> {
    const store = await this.getStore('decryptedMessages', 'readwrite')
    const record = {
      id: message.id,
      conversationId: message.conversationId,
      timestamp: message.timestamp,
      payload: encryptRecordForStorage(message),
    }
    return new Promise((resolve, reject) => {
      const request = store.put(record)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getDecryptedMessage(id: string): Promise<DecryptedMessage | null> {
    const store = await this.getStore('decryptedMessages')
    return new Promise((resolve, reject) => {
      const request = store.get(id)
      request.onsuccess = () => resolve(request.result ? decryptRecordFromStorage<DecryptedMessage>(request.result.payload ?? request.result) : null)
      request.onerror = () => reject(request.error)
    })
  }

  async getDecryptedMessages(conversationId: string, options?: { limit?: number; before?: number }): Promise<DecryptedMessage[]> {
    const store = await this.getStore('decryptedMessages')
    const index = store.index('conversationId')
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(conversationId)
      request.onsuccess = () => {
        let messages = (request.result || []).map(result =>
          decryptRecordFromStorage<DecryptedMessage>(result.payload ?? result)
        )
        
        // Filter by before timestamp if provided
        if (options?.before) {
          messages = messages.filter(m => m.timestamp < options.before!)
        }
        
        // Sort by timestamp ascending (oldest first for display)
        messages.sort((a, b) => a.timestamp - b.timestamp)
        
        // Apply limit (from the end for "before" queries)
        if (options?.limit && options.before) {
          messages = messages.slice(-options.limit)
        } else if (options?.limit) {
          messages = messages.slice(-options.limit)
        }
        
        resolve(messages)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async updateDecryptedMessage(id: string, updates: Partial<DecryptedMessage>): Promise<void> {
    const store = await this.getStore('decryptedMessages', 'readwrite')
    const existing = await new Promise<DecryptedMessage | undefined>((resolve, reject) => {
      const request = store.get(id)
      request.onsuccess = () => resolve(request.result
        ? decryptRecordFromStorage<DecryptedMessage>(request.result.payload ?? request.result)
        : undefined)
      request.onerror = () => reject(request.error)
    })
    if (!existing) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      const updated = { ...existing, ...updates }
      const request = store.put({
        id: updated.id,
        conversationId: updated.conversationId,
        timestamp: updated.timestamp,
        payload: encryptRecordForStorage(updated),
      })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async deleteDecryptedMessage(id: string): Promise<void> {
    const store = await this.getStore('decryptedMessages', 'readwrite')
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // Message Deduplication

  async storeProcessedMessage(record: ProcessedMessageRecord): Promise<void> {
    const store = await this.getStore('processedMessages', 'readwrite')
    const storedRecord = {
      messageId: record.messageId,
      sessionId: record.sessionId,
      processedAt: record.processedAt,
      payload: encryptRecordForStorage(record),
    }
    return new Promise((resolve, reject) => {
      const request = store.put(storedRecord)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getProcessedMessage(messageId: string): Promise<ProcessedMessageRecord | null> {
    const store = await this.getStore('processedMessages')
    return new Promise((resolve, reject) => {
      const request = store.get(messageId)
      request.onsuccess = () => resolve(request.result ? decryptRecordFromStorage<ProcessedMessageRecord>(request.result.payload ?? request.result) : null)
      request.onerror = () => reject(request.error)
    })
  }

  async isMessageProcessed(messageId: string): Promise<boolean> {
    const record = await this.getProcessedMessage(messageId)
    return record !== null
  }

  async cleanupProcessedMessages(maxAgeMs: number): Promise<number> {
    const store = await this.getStore('processedMessages', 'readwrite')
    const cutoff = now() - maxAgeMs
    
    return new Promise((resolve, reject) => {
      const index = store.index('processedAt')
      const range = IDBKeyRange.upperBound(cutoff)
      const request = index.openCursor(range)
      let deleted = 0
      
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          deleted++
          cursor.continue()
        } else {
          resolve(deleted)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  async storeRetryRequestRecord(record: RetryRequestRecord): Promise<void> {
    const store = await this.getStore('retryRequests', 'readwrite')
    const storedRecord = {
      key: record.key,
      senderIdentityId: record.senderIdentityId,
      relayMessageId: record.relayMessageId,
      lastSeenAt: record.lastSeenAt,
      payload: encryptRecordForStorage(record),
    }
    return new Promise((resolve, reject) => {
      const request = store.put(storedRecord)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getRetryRequestRecord(key: string): Promise<RetryRequestRecord | null> {
    const store = await this.getStore('retryRequests')
    return new Promise((resolve, reject) => {
      const request = store.get(key)
      request.onsuccess = () => resolve(request.result ? decryptRecordFromStorage<RetryRequestRecord>(request.result.payload ?? request.result) : null)
      request.onerror = () => reject(request.error)
    })
  }

  async getRetryRequestRecordByRelayId(relayMessageId: string): Promise<RetryRequestRecord | null> {
    const store = await this.getStore('retryRequests')
    const index = store.index('relayMessageId')
    return new Promise((resolve, reject) => {
      const request = index.get(relayMessageId)
      request.onsuccess = () => resolve(request.result ? decryptRecordFromStorage<RetryRequestRecord>(request.result.payload ?? request.result) : null)
      request.onerror = () => reject(request.error)
    })
  }

  async cleanupRetryRequestRecords(maxAgeMs: number): Promise<number> {
    const store = await this.getStore('retryRequests', 'readwrite')
    const cutoff = now() - maxAgeMs

    return new Promise((resolve, reject) => {
      const index = store.index('lastSeenAt')
      const range = IDBKeyRange.upperBound(cutoff)
      const request = index.openCursor(range)
      let deleted = 0

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          deleted++
          cursor.continue()
        } else {
          resolve(deleted)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  async storeRelayReceiptJob(job: RelayReceiptJob): Promise<void> {
    const store = await this.getStore('relayReceiptJobs', 'readwrite')
    const record = {
      key: job.key,
      nextAttemptAt: job.nextAttemptAt,
      updatedAt: job.updatedAt,
      payload: encryptRecordForStorage(job),
    }
    return new Promise((resolve, reject) => {
      const request = store.put(record)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getRelayReceiptJob(key: string): Promise<RelayReceiptJob | null> {
    const store = await this.getStore('relayReceiptJobs')
    return new Promise((resolve, reject) => {
      const request = store.get(key)
      request.onsuccess = () => resolve(request.result ? decryptRecordFromStorage<RelayReceiptJob>(request.result.payload ?? request.result) : null)
      request.onerror = () => reject(request.error)
    })
  }

  async getPendingRelayReceiptJobs(nowMs: number, limit = 50): Promise<RelayReceiptJob[]> {
    const store = await this.getStore('relayReceiptJobs')
    const index = store.index('nextAttemptAt')
    const jobs: RelayReceiptJob[] = []
    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.upperBound(nowMs))
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor || jobs.length >= limit) {
          resolve(jobs)
          return
        }
        jobs.push(decryptRecordFromStorage<RelayReceiptJob>(cursor.value.payload ?? cursor.value))
        cursor.continue()
      }
      request.onerror = () => reject(request.error)
    })
  }

  async deleteRelayReceiptJob(key: string): Promise<void> {
    const store = await this.getStore('relayReceiptJobs', 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.delete(key)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async cleanupRelayReceiptJobs(maxAgeMs: number): Promise<number> {
    const store = await this.getStore('relayReceiptJobs', 'readwrite')
    const cutoff = now() - maxAgeMs

    return new Promise((resolve, reject) => {
      const index = store.index('updatedAt')
      const request = index.openCursor(IDBKeyRange.upperBound(cutoff))
      let deleted = 0

      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          deleted++
          cursor.continue()
        } else {
          resolve(deleted)
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  async storeMailboxScope(scope: MailboxScopeState): Promise<void> {
    const store = await this.getStore('mailboxScopes', 'readwrite')
    const record = {
      key: getMailboxScopeStorageId(scope),
      localIdentityId: scope.localIdentityId,
      remoteIdentityId: scope.remoteIdentityId,
      payload: encryptRecordForStorage(scope),
    }
    return new Promise((resolve, reject) => {
      const request = store.put(record)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getMailboxScope(localIdentityId: string, remoteIdentityId: string): Promise<MailboxScopeState | null> {
    const scopes = (await this.getMailboxScopes(localIdentityId))
      .filter((scope) => scope.remoteIdentityId === remoteIdentityId)
    return getPreferredMailboxScope(scopes)
  }

  async getMailboxScopes(localIdentityId: string): Promise<MailboxScopeState[]> {
    const store = await this.getStore('mailboxScopes')
    const index = store.index('localIdentityId')
    return new Promise((resolve, reject) => {
      const request = index.getAll(localIdentityId)
      request.onsuccess = () => {
        resolve((request.result || []).map((record) => decryptRecordFromStorage<MailboxScopeState>(record.payload)))
      }
      request.onerror = () => reject(request.error)
    })
  }

  async deleteMailboxScope(localIdentityId: string, remoteIdentityId: string): Promise<void> {
    const store = await this.getStore('mailboxScopes', 'readwrite')
    const index = store.index('localIdentityId')
    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.only(localIdentityId))
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          resolve()
          return
        }
        const record = cursor.value as { remoteIdentityId?: string }
        if (record.remoteIdentityId === remoteIdentityId) {
          cursor.delete()
        }
        cursor.continue()
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getRelayMailboxCursor(identityId: string): Promise<number> {
    if (!isRelayMailboxCursorIdentityId(identityId)) return 0
    try {
      const store = await this.getStore('relayMailboxCursors')
      return await new Promise((resolve, reject) => {
        const request = store.get(identityId)
        request.onsuccess = () => {
          const record = request.result as { payload?: unknown } | undefined
          resolve(record?.payload == null
            ? 0
            : parseRelayMailboxCursor(decryptRecordFromStorage(record.payload)))
        }
        request.onerror = () => reject(request.error)
      })
    } catch {
      return 0
    }
  }

  async storeRelayMailboxCursor(identityId: string, sequence: number): Promise<void> {
    if (!isRelayMailboxCursorIdentityId(identityId)) return
    const parsed = parseRelayMailboxCursor(sequence)
    const store = await this.getStore('relayMailboxCursors', 'readwrite')
    if (parsed <= 0) {
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(identityId)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
      return
    }
    await new Promise<void>((resolve, reject) => {
      const request = store.put({
        identityId,
        payload: encryptRecordForStorage({ sequence: parsed }),
      })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getRelaySenderBundleAttachState(
    localIdentityId: string,
    remoteIdentityId: string,
  ): Promise<RelaySenderBundleAttachState | null> {
    const pairKey = relaySenderBundleAttachPairKey(localIdentityId, remoteIdentityId)
    if (!pairKey) return null
    try {
      const store = await this.getStore('relaySenderBundleAttach')
      return await new Promise((resolve, reject) => {
        const request = store.get(pairKey)
        request.onsuccess = () => {
          const record = request.result as { payload?: unknown } | undefined
          resolve(record?.payload == null
            ? null
            : parseRelaySenderBundleAttachState(decryptRecordFromStorage(record.payload)))
        }
        request.onerror = () => reject(request.error)
      })
    } catch {
      return null
    }
  }

  async storeRelaySenderBundleAttachState(
    localIdentityId: string,
    remoteIdentityId: string,
    state: RelaySenderBundleAttachState,
  ): Promise<void> {
    const pairKey = relaySenderBundleAttachPairKey(localIdentityId, remoteIdentityId)
    const parsed = parseRelaySenderBundleAttachState(state)
    if (!pairKey || !parsed) return
    const store = await this.getStore('relaySenderBundleAttach', 'readwrite')
    await new Promise<void>((resolve, reject) => {
      const request = store.put({
        pairKey,
        payload: encryptRecordForStorage(parsed),
      })
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // Tracked Identities (TOFU)

  async storeTrackedIdentity(tracked: TrackedIdentity): Promise<void> {
    const store = await this.getStore('trackedIdentities', 'readwrite')
    const record = {
      identityId: tracked.identityId,
      trustState: tracked.trustState,
      lastUpdatedAt: tracked.lastUpdatedAt,
      payload: encryptRecordForStorage(tracked),
    }
    return new Promise((resolve, reject) => {
      const request = store.put(record)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getTrackedIdentity(identityId: string): Promise<TrackedIdentity | null> {
    const store = await this.getStore('trackedIdentities')
    return new Promise((resolve, reject) => {
      const request = store.get(identityId)
      request.onsuccess = () => resolve(request.result ? decryptRecordFromStorage<TrackedIdentity>(request.result.payload ?? request.result) : null)
      request.onerror = () => reject(request.error)
    })
  }

  async getAllTrackedIdentities(): Promise<TrackedIdentity[]> {
    const store = await this.getStore('trackedIdentities')
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onsuccess = () => resolve((request.result || []).map(result =>
        decryptRecordFromStorage<TrackedIdentity>(result.payload ?? result)
      ))
      request.onerror = () => reject(request.error)
    })
  }

  async deleteTrackedIdentity(identityId: string): Promise<void> {
    const store = await this.getStore('trackedIdentities', 'readwrite')
    return new Promise((resolve, reject) => {
      const request = store.delete(identityId)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // Deletion Operations

  async deleteConversation(id: string): Promise<void> {
    await this.deleteConversationMessages(id)
    const store = await this.getStore('conversations', 'readwrite')
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async deleteConversationMessages(conversationId: string): Promise<void> {
    // Delete encrypted messages
    const msgStore = await this.getStore('messages', 'readwrite')
    await new Promise<void>((resolve, reject) => {
      const index = msgStore.index('conversationId')
      const request = index.openCursor(IDBKeyRange.only(conversationId))
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          resolve()
        }
      }
      request.onerror = () => reject(request.error)
    })

    // Delete decrypted message cache
    const decStore = await this.getStore('decryptedMessages', 'readwrite')
    await new Promise<void>((resolve, reject) => {
      const index = decStore.index('conversationId')
      const request = index.openCursor(IDBKeyRange.only(conversationId))
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          cursor.delete()
          cursor.continue()
        } else {
          resolve()
        }
      }
      request.onerror = () => reject(request.error)
    })
  }

  async deletePublicKeyBundle(identityId: string): Promise<void> {
    const store = await this.getStore('publicBundles', 'readwrite')
    await new Promise<void>((resolve, reject) => {
      const request = store.delete(identityId)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async deleteSessionRecord(remoteIdentityId: string): Promise<void> {
    const allSessions = await this.getAllSessions(remoteIdentityId)
    for (const session of allSessions) {
      securelyDeleteSessionState(session.state)
      const store = await this.getStore('sessions', 'readwrite')
      await new Promise<void>((resolve, reject) => {
        const request = store.delete(session.id)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
      })
    }

    const recordStore = await this.getStore('sessionRecords', 'readwrite')
    await new Promise<void>((resolve, reject) => {
      const request = recordStore.delete(remoteIdentityId)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  // Clear All Data

  async clear(): Promise<void> {
    await this.init()
    if (!this.db) return

    const storeNames = [
      'identities', 
      'sessions',
      'sessionRecords',
      'privateBundles', 
      'publicBundles',
      'conversations', 
      'messages',
      'decryptedMessages',
      'processedMessages',
      'retryRequests',
      'relayReceiptJobs',
      'mailboxScopes',
      'relayMailboxCursors',
      'relaySenderBundleAttach',
      'trackedIdentities'
    ]
    
    for (const storeName of storeNames) {
      try {
        const store = await this.getStore(storeName, 'readwrite')
        await new Promise<void>((resolve, reject) => {
          const request = store.clear()
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
        })
      } catch {
        // Store might not exist in older DB versions
      }
    }
    
    // Also disable encryption
    disableStorageEncryption()
  }
}

// Localstorage Fallback

type LocalStorageOutboundCommitWal = {
  v: 1
  entries: Array<[string, string]>
}

class LocalStorageFallback implements LocalStorage {
  private recoverOutboundCommits(): void {
    const walKeys: string[] = []
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (key?.startsWith(OUTBOUND_COMMIT_KEY) || key?.startsWith(INBOUND_COMMIT_KEY)) {
        walKeys.push(key)
      }
    }

    for (const walKey of walKeys) {
      const raw = localStorage.getItem(walKey)
      if (!raw) continue
      const wal = JSON.parse(raw) as LocalStorageOutboundCommitWal
      if (
        wal.v !== 1
        || !Array.isArray(wal.entries)
        || wal.entries.length === 0
        || wal.entries.length > 16
        || wal.entries.some(([key, value]) => (
          typeof key !== 'string'
          || typeof value !== 'string'
          || !key.startsWith(STORAGE_PREFIX)
          || key.startsWith(OUTBOUND_COMMIT_KEY)
          || key.startsWith(INBOUND_COMMIT_KEY)
        ))
      ) {
        throw new Error('Outbound commit journal is invalid')
      }
      for (const [key, value] of wal.entries) {
        localStorage.setItem(key, value)
      }
      localStorage.removeItem(walKey)
    }
  }

  // Identity operations
  async storeIdentity(identity: ChatIdentityWithKeys): Promise<void> {
    const encrypted = {
      ...identity,
      identityPrivateKey: encryptForStorage(identity.identityPrivateKey),
      mlkemPrivateKey: encryptForStorage(identity.mlkemPrivateKey),
      dilithiumPrivateKey: encryptForStorage(identity.dilithiumPrivateKey)
    }
    localStorage.setItem(`${IDENTITY_KEY}${identity.id}`, JSON.stringify(encrypted))
    
    // Also index by address if available
    if (identity.blockchainAddress) {
      const addressIndex = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}address_index`) || '{}')
      addressIndex[identity.blockchainAddress] = identity.id
      localStorage.setItem(`${STORAGE_PREFIX}address_index`, JSON.stringify(addressIndex))
    }
  }

  async getIdentity(id: string): Promise<ChatIdentityWithKeys | null> {
    const data = localStorage.getItem(`${IDENTITY_KEY}${id}`)
    if (!data) return null
    const stored = JSON.parse(data)
    return {
      ...stored,
      identityPrivateKey: decryptFromStorage(stored.identityPrivateKey),
      mlkemPrivateKey: decryptFromStorage(stored.mlkemPrivateKey),
      dilithiumPrivateKey: decryptFromStorage(stored.dilithiumPrivateKey)
    }
  }

  async getIdentityByAddress(address: string): Promise<ChatIdentityWithKeys | null> {
    const addressIndex = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}address_index`) || '{}')
    const id = addressIndex[address]
    if (!id) return null
    return this.getIdentity(id)
  }

  async getAllIdentities(): Promise<ChatIdentityWithKeys[]> {
    const identities: ChatIdentityWithKeys[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(IDENTITY_KEY)) {
        const identity = await this.getIdentity(key.replace(IDENTITY_KEY, ''))
        if (identity) identities.push(identity)
      }
    }
    return identities
  }

  // Session operations
  async storeSession(session: Session): Promise<void> {
    const serialized = {
      ...session,
      state: encryptForStorage(serializeSessionState(session.state))
    }
    localStorage.setItem(`${SESSION_KEY}${session.id}`, JSON.stringify(serialized))
    localStorage.setItem(`${SESSION_BY_REMOTE_KEY}${session.remoteIdentityId}`, session.id)
  }

  async getSession(id: string): Promise<Session | null> {
    this.recoverOutboundCommits()
    const data = localStorage.getItem(`${SESSION_KEY}${id}`)
    if (!data) return null
    const parsed = JSON.parse(data)
    return {
      ...parsed,
      state: deserializeSessionState(decryptFromStorage(parsed.state))
    }
  }

  async deleteSession(id: string): Promise<void> {
    const session = await this.getSession(id)
    if (session) {
      securelyDeleteSessionState(session.state)
      localStorage.removeItem(`${SESSION_BY_REMOTE_KEY}${session.remoteIdentityId}`)
    }
    localStorage.removeItem(`${SESSION_KEY}${id}`)
  }

  async storeSessionRecord(record: SessionRecord): Promise<void> {
    // Convert Maps to arrays for storage (JSON doesn't serialize Maps)
    const serialized = {
      ...record,
      sessions: Array.from(record.sessions.entries()),
      deviceRecords: Array.from(record.deviceRecords.entries())
    }
    localStorage.setItem(`${SESSION_RECORD_KEY}${record.remoteIdentityId}`, JSON.stringify(encryptRecordForStorage(serialized)))
  }

  async getSessionRecord(remoteIdentityId: string): Promise<SessionRecord | null> {
    const data = localStorage.getItem(`${SESSION_RECORD_KEY}${remoteIdentityId}`)
    if (!data) return null
    const parsed = decryptRecordFromStorage<any>(JSON.parse(data))
    // Convert arrays back to Maps
    return {
      ...parsed,
      sessions: new Map(parsed.sessions || []),
      deviceRecords: new Map(parsed.deviceRecords || [])
    }
  }

  async getActiveSession(remoteIdentityId: string): Promise<Session | null> {
    const record = await this.getSessionRecord(remoteIdentityId)
    if (!record || !record.activeSessionId) {
      return this.getLegacySessionByRemoteIdentity(remoteIdentityId)
    }
    return this.getSession(record.activeSessionId)
  }

  async getAllSessions(remoteIdentityId: string): Promise<Session[]> {
    const sessions: Session[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(SESSION_KEY)) {
        const session = await this.getSession(key.replace(SESSION_KEY, ''))
        if (session && session.remoteIdentityId === remoteIdentityId) {
          sessions.push(session)
        }
      }
    }
    return sessions
  }

  async setActiveSession(remoteIdentityId: string, sessionId: string): Promise<void> {
    let record = await this.getSessionRecord(remoteIdentityId)
    if (!record) {
      record = {
        remoteIdentityId,
        deviceRecords: new Map(),
        sessions: new Map(),
        activeSessionId: sessionId,
        isStale: false,
        updatedAt: now()
      }
    } else {
      record.activeSessionId = sessionId
      record.updatedAt = now()
    }
    await this.storeSessionRecord(record)
  }

  private async getLegacySessionByRemoteIdentity(remoteIdentityId: string): Promise<Session | null> {
    const sessionId = localStorage.getItem(`${SESSION_BY_REMOTE_KEY}${remoteIdentityId}`)
    if (!sessionId) return null
    return this.getSession(sessionId)
  }

  // Key bundle operations
  async storePrivateKeyBundle(identityId: string, bundle: PrivateKeyBundle): Promise<void> {
    const serialized = {
      ...bundle,
      identityPrivateKey: encryptForStorage(bundle.identityPrivateKey),
      mlkemIdentityPrivateKey: encryptForStorage(bundle.mlkemIdentityPrivateKey),
      dilithiumPrivateKey: encryptForStorage(bundle.dilithiumPrivateKey),
      signedPreKeyPrivate: encryptForStorage(bundle.signedPreKeyPrivate),
      mlkemSignedPreKeyPrivate: encryptForStorage(bundle.mlkemSignedPreKeyPrivate),
      oneTimePreKeyPrivates: Array.from(bundle.oneTimePreKeyPrivates.entries()).map(
        ([id, key]) => [id, encryptForStorage(key)]
      ),
      mlkemOneTimePreKeyPrivates: Array.from(bundle.mlkemOneTimePreKeyPrivates.entries()).map(
        ([id, key]) => [id, encryptForStorage(key)]
      ),
      previousSignedPreKeys: bundle.previousSignedPreKeys?.map(spk => ({
        ...spk,
        x25519Private: encryptForStorage(spk.x25519Private),
        mlkemPrivate: encryptForStorage(spk.mlkemPrivate),
      }))
    }
    localStorage.setItem(`${PRIVATE_BUNDLE_KEY}${identityId}`, JSON.stringify(serialized))
  }

  async getPrivateKeyBundle(identityId: string): Promise<PrivateKeyBundle | null> {
    const data = localStorage.getItem(`${PRIVATE_BUNDLE_KEY}${identityId}`)
    if (!data) return null
    const parsed = JSON.parse(data)
    return {
      identityPrivateKey: decryptFromStorage(parsed.identityPrivateKey),
      mlkemIdentityPrivateKey: decryptFromStorage(parsed.mlkemIdentityPrivateKey),
      dilithiumPrivateKey: decryptFromStorage(parsed.dilithiumPrivateKey),
      signedPreKeyPrivate: decryptFromStorage(parsed.signedPreKeyPrivate),
      mlkemSignedPreKeyPrivate: decryptFromStorage(parsed.mlkemSignedPreKeyPrivate),
      oneTimePreKeyPrivates: new Map(
        (parsed.oneTimePreKeyPrivates || []).map(
          ([id, key]: [number, string]) => [id, decryptFromStorage(key)]
        )
      ),
      mlkemOneTimePreKeyPrivates: new Map(
        (parsed.mlkemOneTimePreKeyPrivates || []).map(
          ([id, key]: [number, string]) => [id, decryptFromStorage(key)]
        )
      ),
      nextPreKeyId: parsed.nextPreKeyId || 1,
      signedPreKeyRotatedAt: parsed.signedPreKeyRotatedAt,
      previousSignedPreKeys: parsed.previousSignedPreKeys?.map((spk: any) => ({
        ...spk,
        x25519Private: decryptFromStorage(spk.x25519Private),
        mlkemPrivate: decryptFromStorage(spk.mlkemPrivate),
      }))
    }
  }

  async storePublicKeyBundle(identityId: string, bundle: PublicKeyBundle): Promise<void> {
    localStorage.setItem(`${PUBLIC_BUNDLE_KEY}${identityId}`, JSON.stringify(encryptRecordForStorage(bundle)))
  }

  async getPublicKeyBundle(identityId: string): Promise<PublicKeyBundle | null> {
    const data = localStorage.getItem(`${PUBLIC_BUNDLE_KEY}${identityId}`)
    return data ? decryptRecordFromStorage<PublicKeyBundle>(JSON.parse(data)) : null
  }

  // Conversation operations
  async storeConversation(conversation: Conversation): Promise<void> {
    localStorage.setItem(`${CONVERSATION_KEY}${conversation.id}`, JSON.stringify(encryptRecordForStorage(conversation)))
    
    // Update conversation index for identity
    const indexKey = `${STORAGE_PREFIX}conv_index_${conversation.localIdentityId}`
    const index = JSON.parse(localStorage.getItem(indexKey) || '[]')
    if (!index.includes(conversation.id)) {
      index.push(conversation.id)
      localStorage.setItem(indexKey, JSON.stringify(index))
    }
  }

  async getConversation(id: string): Promise<Conversation | null> {
    this.recoverOutboundCommits()
    const data = localStorage.getItem(`${CONVERSATION_KEY}${id}`)
    return data ? decryptRecordFromStorage<Conversation>(JSON.parse(data)) : null
  }

  async getConversationByParticipants(localId: string, remoteId: string): Promise<Conversation | null> {
    const conversations = await this.getConversations(localId)
    return conversations.find(c => c.remoteIdentityId === remoteId) || null
  }

  async getConversations(identityId: string): Promise<Conversation[]> {
    const indexKey = `${STORAGE_PREFIX}conv_index_${identityId}`
    const index = JSON.parse(localStorage.getItem(indexKey) || '[]')
    const conversations: Conversation[] = []
    
    for (const id of index) {
      const conv = await this.getConversation(id)
      if (conv) conversations.push(conv)
    }
    
    return conversations.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async updateConversation(id: string, updates: Partial<Conversation>): Promise<void> {
    const conversation = await this.getConversation(id)
    if (!conversation) return
    
    const updated = { ...conversation, ...updates, updatedAt: now() }
    await this.storeConversation(updated)
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
        updatedAt: now(),
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
      const indexKey = `${STORAGE_PREFIX}conv_index_${conversation.localIdentityId}`
      const index = JSON.parse(localStorage.getItem(indexKey) || '[]')
      localStorage.setItem(indexKey, JSON.stringify(index.filter((id: string) => id !== sourceConversationId)))
    }

    localStorage.removeItem(`${CONVERSATION_KEY}${sourceConversationId}`)
    localStorage.removeItem(`${MESSAGES_BY_CONV_KEY}${sourceConversationId}`)
    localStorage.removeItem(`${STORAGE_PREFIX}decrypted_index_${sourceConversationId}`)
  }

  // Message operations
  async commitOutboundMessage(commit: OutboundMessageCommit): Promise<void> {
    this.recoverOutboundCommits()
    const conversation = await this.getConversation(commit.message.conversationId)
    if (!conversation) {
      throw new Error('Conversation is not available for outbound commit')
    }

    const serializedSession = {
      ...commit.session,
      state: encryptForStorage(serializeSessionState(commit.session.state)),
    }
    const updatedConversation = {
      ...conversation,
      ...commit.conversationUpdate,
      updatedAt: now(),
    }
    const messageIndexKey = `${MESSAGES_BY_CONV_KEY}${commit.message.conversationId}`
    const messageIndex = JSON.parse(localStorage.getItem(messageIndexKey) || '[]') as string[]
    const entries: Array<[string, string]> = [
      [`${SESSION_KEY}${commit.session.id}`, JSON.stringify(serializedSession)],
      [`${SESSION_BY_REMOTE_KEY}${commit.session.remoteIdentityId}`, commit.session.id],
      [`${MESSAGE_KEY}${commit.message.id}`, JSON.stringify(encryptRecordForStorage(commit.message))],
      [
        messageIndexKey,
        JSON.stringify(messageIndex.includes(commit.message.id)
          ? messageIndex
          : [...messageIndex, commit.message.id]),
      ],
      [
        `${CONVERSATION_KEY}${updatedConversation.id}`,
        JSON.stringify(encryptRecordForStorage(updatedConversation)),
      ],
    ]
    const walKey = `${OUTBOUND_COMMIT_KEY}${commit.message.id}`
    localStorage.setItem(walKey, JSON.stringify({
      v: 1,
      entries,
    } satisfies LocalStorageOutboundCommitWal))
    for (const [key, value] of entries) {
      localStorage.setItem(key, value)
    }
    localStorage.removeItem(walKey)
  }

  async commitInboundMessage(commit: InboundMessageCommit): Promise<void> {
    this.recoverOutboundCommits()
    const conversation = await this.getConversation(commit.message.conversationId)
    if (!conversation) {
      throw new Error('Conversation is not available for inbound commit')
    }

    const serializedSession = {
      ...commit.session,
      state: encryptForStorage(serializeSessionState(commit.session.state)),
    }
    const updatedConversation = {
      ...conversation,
      ...commit.conversationUpdate,
      updatedAt: now(),
    }
    const messageIndexKey = `${MESSAGES_BY_CONV_KEY}${commit.message.conversationId}`
    const messageIndex = JSON.parse(localStorage.getItem(messageIndexKey) || '[]') as string[]
    const decryptedIndexKey = `${STORAGE_PREFIX}decrypted_index_${commit.decryptedMessage.conversationId}`
    const decryptedIndex = JSON.parse(localStorage.getItem(decryptedIndexKey) || '[]') as string[]
    const processedIndexKey = `${STORAGE_PREFIX}processed_index`
    const processedIndex = JSON.parse(localStorage.getItem(processedIndexKey) || '[]') as string[]
    const entries: Array<[string, string]> = [
      [`${SESSION_KEY}${commit.session.id}`, JSON.stringify(serializedSession)],
      [`${SESSION_BY_REMOTE_KEY}${commit.session.remoteIdentityId}`, commit.session.id],
      [`${MESSAGE_KEY}${commit.message.id}`, JSON.stringify(encryptRecordForStorage(commit.message))],
      [
        messageIndexKey,
        JSON.stringify(messageIndex.includes(commit.message.id)
          ? messageIndex
          : [...messageIndex, commit.message.id]),
      ],
      [
        `${STORAGE_PREFIX}decrypted_${commit.decryptedMessage.id}`,
        JSON.stringify(encryptRecordForStorage(commit.decryptedMessage)),
      ],
      [
        decryptedIndexKey,
        JSON.stringify(decryptedIndex.includes(commit.decryptedMessage.id)
          ? decryptedIndex
          : [...decryptedIndex, commit.decryptedMessage.id]),
      ],
      [
        `${PROCESSED_MESSAGE_KEY}${commit.processedMessage.messageId}`,
        JSON.stringify(encryptRecordForStorage(commit.processedMessage)),
      ],
      [
        processedIndexKey,
        JSON.stringify(processedIndex.includes(commit.processedMessage.messageId)
          ? processedIndex
          : [...processedIndex, commit.processedMessage.messageId]),
      ],
      [
        `${CONVERSATION_KEY}${updatedConversation.id}`,
        JSON.stringify(encryptRecordForStorage(updatedConversation)),
      ],
    ]
    if (commit.message.relayMessageId) {
      entries.push([
        `${MESSAGE_BY_RELAY_KEY}${commit.message.relayMessageId}`,
        commit.message.id,
      ])
    }
    if (commit.sessionRecord) {
      const serializedRecord = {
        ...commit.sessionRecord,
        sessions: Array.from(commit.sessionRecord.sessions.entries()),
        deviceRecords: Array.from(commit.sessionRecord.deviceRecords.entries()),
      }
      entries.push([
        `${SESSION_RECORD_KEY}${commit.sessionRecord.remoteIdentityId}`,
        JSON.stringify(encryptRecordForStorage(serializedRecord)),
      ])
    }
    if (commit.privateKeyBundle) {
      const { identityId, bundle } = commit.privateKeyBundle
      const serializedBundle = {
        ...bundle,
        identityPrivateKey: encryptForStorage(bundle.identityPrivateKey),
        mlkemIdentityPrivateKey: encryptForStorage(bundle.mlkemIdentityPrivateKey),
        dilithiumPrivateKey: encryptForStorage(bundle.dilithiumPrivateKey),
        signedPreKeyPrivate: encryptForStorage(bundle.signedPreKeyPrivate),
        mlkemSignedPreKeyPrivate: encryptForStorage(bundle.mlkemSignedPreKeyPrivate),
        oneTimePreKeyPrivates: Array.from(bundle.oneTimePreKeyPrivates.entries()).map(
          ([id, key]) => [id, encryptForStorage(key)],
        ),
        mlkemOneTimePreKeyPrivates: Array.from(bundle.mlkemOneTimePreKeyPrivates.entries()).map(
          ([id, key]) => [id, encryptForStorage(key)],
        ),
        previousSignedPreKeys: bundle.previousSignedPreKeys?.map((preKey) => ({
          ...preKey,
          x25519Private: encryptForStorage(preKey.x25519Private),
          mlkemPrivate: encryptForStorage(preKey.mlkemPrivate),
        })),
      }
      entries.push([
        `${PRIVATE_BUNDLE_KEY}${identityId}`,
        JSON.stringify(serializedBundle),
      ])
    }
    if (commit.publicKeyBundle) {
      entries.push([
        `${PUBLIC_BUNDLE_KEY}${commit.publicKeyBundle.identityId}`,
        JSON.stringify(encryptRecordForStorage(commit.publicKeyBundle.bundle)),
      ])
    }

    const walKey = `${INBOUND_COMMIT_KEY}${commit.message.id}`
    localStorage.setItem(walKey, JSON.stringify({
      v: 1,
      entries,
    } satisfies LocalStorageOutboundCommitWal))
    for (const [key, value] of entries) {
      localStorage.setItem(key, value)
    }
    localStorage.removeItem(walKey)
  }

  async storeMessage(message: Message): Promise<void> {
    const existing = await this.getMessage(message.id)
    if (existing?.relayMessageId && existing.relayMessageId !== message.relayMessageId) {
      localStorage.removeItem(`${MESSAGE_BY_RELAY_KEY}${existing.relayMessageId}`)
    }
    localStorage.setItem(`${MESSAGE_KEY}${message.id}`, JSON.stringify(encryptRecordForStorage(message)))
    if (message.relayMessageId) {
      localStorage.setItem(`${MESSAGE_BY_RELAY_KEY}${message.relayMessageId}`, message.id)
    }
    
    // Update message index for conversation
    const indexKey = `${MESSAGES_BY_CONV_KEY}${message.conversationId}`
    const index = JSON.parse(localStorage.getItem(indexKey) || '[]')
    if (!index.includes(message.id)) {
      index.push(message.id)
      localStorage.setItem(indexKey, JSON.stringify(index))
    }
  }

  async getMessage(id: string): Promise<Message | null> {
    this.recoverOutboundCommits()
    const data = localStorage.getItem(`${MESSAGE_KEY}${id}`)
    return data ? decryptRecordFromStorage<Message>(JSON.parse(data)) : null
  }

  async getMessageByRelayId(relayMessageId: string): Promise<Message | null> {
    const messageId = localStorage.getItem(`${MESSAGE_BY_RELAY_KEY}${relayMessageId}`)
    if (!messageId) return null
    return this.getMessage(messageId)
  }

  async getMessages(conversationId: string, options?: { limit?: number; before?: number }): Promise<Message[]> {
    const indexKey = `${MESSAGES_BY_CONV_KEY}${conversationId}`
    const index = JSON.parse(localStorage.getItem(indexKey) || '[]')
    let messages: Message[] = []
    
    for (const id of index) {
      const msg = await this.getMessage(id)
      if (msg) messages.push(msg)
    }
    
    // Filter by before timestamp
    if (options?.before) {
      messages = messages.filter(m => m.createdAt < options.before!)
    }
    
    // Sort by createdAt descending
    messages.sort((a, b) => b.createdAt - a.createdAt)
    
    // Apply limit
    if (options?.limit) {
      messages = messages.slice(0, options.limit)
    }
    
    return messages
  }

  async getMessagesNeedingStatusSync(senderIdentityId: string): Promise<Message[]> {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(MESSAGE_KEY))
    const messages: Message[] = []

    for (const key of keys) {
      const data = localStorage.getItem(key)
      if (!data) continue
      const message = decryptRecordFromStorage<Message>(JSON.parse(data))
      if (shouldSyncMessageStatus(message, senderIdentityId)) {
        messages.push(message)
      }
    }

    return messages
  }

  async getPendingRelayDeliveries(senderIdentityId: string): Promise<Message[]> {
    const keys = Object.keys(localStorage).filter((key) => key.startsWith(MESSAGE_KEY))
    const messages: Message[] = []

    for (const key of keys) {
      const data = localStorage.getItem(key)
      if (!data) continue
      const message = decryptRecordFromStorage<Message>(JSON.parse(data))
      if (hasPendingRelayDelivery(message, senderIdentityId)) {
        messages.push(message)
      }
    }

    return messages
  }

  async linkRelayMessage(
    messageId: string,
    relayMessageId: string,
    relayDeliveryToken?: string,
  ): Promise<Message | null> {
    const message = await this.getMessage(messageId)
    if (!message) return null
    const completed = completeRelayDeliveryOutbox(message, relayMessageId, relayDeliveryToken)
    if (completed !== message) {
      await this.storeMessage(completed)
    }
    return completed
  }

  async updateMessageStatus(
    id: string,
    status: Message['status'],
    options?: MessageStatusUpdateOptions,
  ): Promise<void> {
    const message = await this.getMessage(id)
    if (!message) return
    if (compareMessageStatus(status, message.status) < 0) return

    const wasRead = message.status === 'read'
    message.status = status
    if (status === 'delivered') {
      message.deliveredAt = now()
    }
    if (status === 'read') {
      message.readAt = now()
      if (
        !wasRead
        && message.relayReadReceiptEligible === undefined
        && options?.relayReadReceiptEligible !== undefined
      ) {
        message.relayReadReceiptEligible = options?.relayReadReceiptEligible
      }
    }
    await this.storeMessage(message)

    // Keep decrypted cache in sync so ticks survive reloads
    try {
      const key = `${STORAGE_PREFIX}decrypted_${id}`
      const data = localStorage.getItem(key)
      if (data) {
        const decrypted = decryptRecordFromStorage<DecryptedMessage>(JSON.parse(data))
        localStorage.setItem(key, JSON.stringify(encryptRecordForStorage({ ...decrypted, status })))
      }
    } catch {
      // Non-fatal
    }
  }

  async deleteMessage(id: string): Promise<void> {
    const message = await this.getMessage(id)
    if (!message) return

    if (message.relayMessageId) {
      localStorage.removeItem(`${MESSAGE_BY_RELAY_KEY}${message.relayMessageId}`)
    }
    localStorage.removeItem(`${MESSAGE_KEY}${id}`)

    const msgIndexKey = `${MESSAGES_BY_CONV_KEY}${message.conversationId}`
    const msgIndex: string[] = JSON.parse(localStorage.getItem(msgIndexKey) || '[]')
    localStorage.setItem(
      msgIndexKey,
      JSON.stringify(msgIndex.filter((messageId: string) => messageId !== id)),
    )
  }

  // Decrypted message cache
  async storeDecryptedMessage(message: DecryptedMessage): Promise<void> {
    const key = `${STORAGE_PREFIX}decrypted_${message.id}`
    localStorage.setItem(key, JSON.stringify(encryptRecordForStorage(message)))
    
    // Update index
    const indexKey = `${STORAGE_PREFIX}decrypted_index_${message.conversationId}`
    const index = JSON.parse(localStorage.getItem(indexKey) || '[]')
    if (!index.includes(message.id)) {
      index.push(message.id)
      localStorage.setItem(indexKey, JSON.stringify(index))
    }
  }

  async getDecryptedMessage(id: string): Promise<DecryptedMessage | null> {
    const data = localStorage.getItem(`${STORAGE_PREFIX}decrypted_${id}`)
    return data ? decryptRecordFromStorage<DecryptedMessage>(JSON.parse(data)) : null
  }

  async getDecryptedMessages(conversationId: string, options?: { limit?: number; before?: number }): Promise<DecryptedMessage[]> {
    const indexKey = `${STORAGE_PREFIX}decrypted_index_${conversationId}`
    const index = JSON.parse(localStorage.getItem(indexKey) || '[]')
    let messages: DecryptedMessage[] = []
    
    for (const id of index) {
      const data = localStorage.getItem(`${STORAGE_PREFIX}decrypted_${id}`)
      if (data) messages.push(decryptRecordFromStorage<DecryptedMessage>(JSON.parse(data)))
    }
    
    // Filter by before timestamp
    if (options?.before) {
      messages = messages.filter(m => m.timestamp < options.before!)
    }
    
    // Sort by timestamp ascending
    messages.sort((a, b) => a.timestamp - b.timestamp)
    
    // Apply limit
    if (options?.limit) {
      messages = messages.slice(-options.limit)
    }
    
    return messages
  }

  async updateDecryptedMessage(id: string, updates: Partial<DecryptedMessage>): Promise<void> {
    const key = `${STORAGE_PREFIX}decrypted_${id}`
    const data = localStorage.getItem(key)
    if (!data) {
      return
    }

    const message = decryptRecordFromStorage<DecryptedMessage>(JSON.parse(data))
    localStorage.setItem(key, JSON.stringify(encryptRecordForStorage({
      ...message,
      ...updates,
    })))
  }

  async deleteDecryptedMessage(id: string): Promise<void> {
    const existing = await this.getDecryptedMessage(id)
    localStorage.removeItem(`${STORAGE_PREFIX}decrypted_${id}`)

    if (!existing) return

    const decIndexKey = `${STORAGE_PREFIX}decrypted_index_${existing.conversationId}`
    const decIndex: string[] = JSON.parse(localStorage.getItem(decIndexKey) || '[]')
    localStorage.setItem(
      decIndexKey,
      JSON.stringify(decIndex.filter((messageId: string) => messageId !== id)),
    )
  }

  // Message deduplication
  async storeProcessedMessage(record: ProcessedMessageRecord): Promise<void> {
    localStorage.setItem(`${PROCESSED_MESSAGE_KEY}${record.messageId}`, JSON.stringify(encryptRecordForStorage(record)))
  }

  async getProcessedMessage(messageId: string): Promise<ProcessedMessageRecord | null> {
    const data = localStorage.getItem(`${PROCESSED_MESSAGE_KEY}${messageId}`)
    return data ? decryptRecordFromStorage<ProcessedMessageRecord>(JSON.parse(data)) : null
  }

  async isMessageProcessed(messageId: string): Promise<boolean> {
    return (await this.getProcessedMessage(messageId)) !== null
  }

  async cleanupProcessedMessages(maxAgeMs: number): Promise<number> {
    const cutoff = now() - maxAgeMs
    let deleted = 0
    const keysToRemove: string[] = []
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(PROCESSED_MESSAGE_KEY)) {
        const data = localStorage.getItem(key)
        if (data) {
          const record = decryptRecordFromStorage<ProcessedMessageRecord>(JSON.parse(data))
          if (record.processedAt < cutoff) {
            keysToRemove.push(key)
          }
        }
      }
    }
    
    for (const key of keysToRemove) {
      localStorage.removeItem(key)
      deleted++
    }
    
    return deleted
  }

  async storeRetryRequestRecord(record: RetryRequestRecord): Promise<void> {
    const existing = await this.getRetryRequestRecord(record.key)
    if (existing?.relayMessageId && existing.relayMessageId !== record.relayMessageId) {
      localStorage.removeItem(`${RETRY_REQUEST_BY_RELAY_KEY}${existing.relayMessageId}`)
    }

    localStorage.setItem(`${RETRY_REQUEST_KEY}${record.key}`, JSON.stringify(encryptRecordForStorage(record)))
    if (record.relayMessageId) {
      localStorage.setItem(`${RETRY_REQUEST_BY_RELAY_KEY}${record.relayMessageId}`, record.key)
    }
  }

  async getRetryRequestRecord(key: string): Promise<RetryRequestRecord | null> {
    const data = localStorage.getItem(`${RETRY_REQUEST_KEY}${key}`)
    return data ? decryptRecordFromStorage<RetryRequestRecord>(JSON.parse(data)) : null
  }

  async getRetryRequestRecordByRelayId(relayMessageId: string): Promise<RetryRequestRecord | null> {
    const retryKey = localStorage.getItem(`${RETRY_REQUEST_BY_RELAY_KEY}${relayMessageId}`)
    if (retryKey) {
      return this.getRetryRequestRecord(retryKey)
    }

    const keys = Object.keys(localStorage).filter((key) => key.startsWith(RETRY_REQUEST_KEY))
    for (const key of keys) {
      const data = localStorage.getItem(key)
      if (!data) continue
      const record = decryptRecordFromStorage<RetryRequestRecord>(JSON.parse(data))
      if (record.relayMessageId === relayMessageId) {
        localStorage.setItem(`${RETRY_REQUEST_BY_RELAY_KEY}${relayMessageId}`, record.key)
        return record
      }
    }

    return null
  }

  async cleanupRetryRequestRecords(maxAgeMs: number): Promise<number> {
    const cutoff = now() - maxAgeMs
    let deleted = 0
    const keysToRemove: string[] = []
    const relayKeysToRemove: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(RETRY_REQUEST_KEY)) continue

      const data = localStorage.getItem(key)
      if (!data) continue

      const record = decryptRecordFromStorage<RetryRequestRecord>(JSON.parse(data))
      if (record.lastSeenAt < cutoff) {
        keysToRemove.push(key)
        if (record.relayMessageId) {
          relayKeysToRemove.push(`${RETRY_REQUEST_BY_RELAY_KEY}${record.relayMessageId}`)
        }
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key)
      deleted++
    }
    for (const key of relayKeysToRemove) {
      localStorage.removeItem(key)
    }

    return deleted
  }

  async storeRelayReceiptJob(job: RelayReceiptJob): Promise<void> {
    localStorage.setItem(`${RECEIPT_JOB_KEY}${job.key}`, JSON.stringify(encryptRecordForStorage(job)))
  }

  async getRelayReceiptJob(key: string): Promise<RelayReceiptJob | null> {
    const data = localStorage.getItem(`${RECEIPT_JOB_KEY}${key}`)
    return data ? decryptRecordFromStorage<RelayReceiptJob>(JSON.parse(data)) : null
  }

  async getPendingRelayReceiptJobs(nowMs: number, limit = 50): Promise<RelayReceiptJob[]> {
    const jobs: RelayReceiptJob[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(RECEIPT_JOB_KEY)) continue

      const data = localStorage.getItem(key)
      if (!data) continue

      const job = decryptRecordFromStorage<RelayReceiptJob>(JSON.parse(data))
      if (job.nextAttemptAt <= nowMs) {
        jobs.push(job)
      }
    }
    return jobs
      .sort((left, right) => left.nextAttemptAt - right.nextAttemptAt)
      .slice(0, limit)
  }

  async deleteRelayReceiptJob(key: string): Promise<void> {
    localStorage.removeItem(`${RECEIPT_JOB_KEY}${key}`)
  }

  async cleanupRelayReceiptJobs(maxAgeMs: number): Promise<number> {
    const cutoff = now() - maxAgeMs
    let deleted = 0
    const keysToRemove: string[] = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(RECEIPT_JOB_KEY)) continue

      const data = localStorage.getItem(key)
      if (!data) continue

      const job = decryptRecordFromStorage<RelayReceiptJob>(JSON.parse(data))
      if (job.updatedAt < cutoff) {
        keysToRemove.push(key)
      }
    }

    for (const key of keysToRemove) {
      localStorage.removeItem(key)
      deleted++
    }

    return deleted
  }

  async storeMailboxScope(scope: MailboxScopeState): Promise<void> {
    const key = getMailboxScopeStorageId(scope)
    localStorage.setItem(`${MAILBOX_SCOPE_KEY}${key}`, JSON.stringify(encryptRecordForStorage(scope)))
    const indexKey = `${MAILBOX_SCOPE_INDEX_KEY}${scope.localIdentityId}`
    const index = JSON.parse(localStorage.getItem(indexKey) || '[]') as string[]
    const indexEntry = getMailboxScopeIndexEntry(scope)
    if (!index.includes(indexEntry)) {
      index.push(indexEntry)
      localStorage.setItem(indexKey, JSON.stringify(index))
    }
  }

  async getMailboxScope(localIdentityId: string, remoteIdentityId: string): Promise<MailboxScopeState | null> {
    const scopes = (await this.getMailboxScopes(localIdentityId))
      .filter((scope) => scope.remoteIdentityId === remoteIdentityId)
    return getPreferredMailboxScope(scopes)
  }

  async getMailboxScopes(localIdentityId: string): Promise<MailboxScopeState[]> {
    const index = JSON.parse(localStorage.getItem(`${MAILBOX_SCOPE_INDEX_KEY}${localIdentityId}`) || '[]') as string[]
    const scopesById = new Map<string, MailboxScopeState>()
    for (const entry of index) {
      const key = getMailboxScopeStorageIdFromIndex(localIdentityId, entry)
      const data = localStorage.getItem(`${MAILBOX_SCOPE_KEY}${key}`)
      if (!data) continue
      const scope = decryptRecordFromStorage<MailboxScopeState>(JSON.parse(data))
      scopesById.set(`${scope.localIdentityId}:${scope.remoteIdentityId}:${scope.scopeId}`, scope)
    }
    return [...scopesById.values()]
  }

  async deleteMailboxScope(localIdentityId: string, remoteIdentityId: string): Promise<void> {
    const indexKey = `${MAILBOX_SCOPE_INDEX_KEY}${localIdentityId}`
    const index = JSON.parse(localStorage.getItem(indexKey) || '[]') as string[]
    const entriesToRemove = index.filter((entry) => getMailboxScopeRemoteIdentityId(entry) === remoteIdentityId)
    for (const entry of entriesToRemove) {
      localStorage.removeItem(`${MAILBOX_SCOPE_KEY}${getMailboxScopeStorageIdFromIndex(localIdentityId, entry)}`)
    }
    localStorage.removeItem(`${MAILBOX_SCOPE_KEY}${localIdentityId}:${remoteIdentityId}`)
    localStorage.setItem(indexKey, JSON.stringify(
      index.filter((entry) => getMailboxScopeRemoteIdentityId(entry) !== remoteIdentityId),
    ))
  }

  async getRelayMailboxCursor(identityId: string): Promise<number> {
    if (!isRelayMailboxCursorIdentityId(identityId)) return 0
    const data = localStorage.getItem(`${RELAY_MAILBOX_CURSOR_KEY}${identityId}`)
    if (!data) return 0
    try {
      return parseRelayMailboxCursor(decryptRecordFromStorage(JSON.parse(data)))
    } catch {
      return 0
    }
  }

  async storeRelayMailboxCursor(identityId: string, sequence: number): Promise<void> {
    if (!isRelayMailboxCursorIdentityId(identityId)) return
    const parsed = parseRelayMailboxCursor(sequence)
    const key = `${RELAY_MAILBOX_CURSOR_KEY}${identityId}`
    if (parsed <= 0) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, JSON.stringify(encryptRecordForStorage({ sequence: parsed })))
  }

  async getRelaySenderBundleAttachState(
    localIdentityId: string,
    remoteIdentityId: string,
  ): Promise<RelaySenderBundleAttachState | null> {
    const pairKey = relaySenderBundleAttachPairKey(localIdentityId, remoteIdentityId)
    if (!pairKey) return null
    const data = localStorage.getItem(`${RELAY_SENDER_BUNDLE_ATTACH_KEY}${pairKey}`)
    if (!data) return null
    try {
      return parseRelaySenderBundleAttachState(decryptRecordFromStorage(JSON.parse(data)))
    } catch {
      return null
    }
  }

  async storeRelaySenderBundleAttachState(
    localIdentityId: string,
    remoteIdentityId: string,
    state: RelaySenderBundleAttachState,
  ): Promise<void> {
    const pairKey = relaySenderBundleAttachPairKey(localIdentityId, remoteIdentityId)
    const parsed = parseRelaySenderBundleAttachState(state)
    if (!pairKey || !parsed) return
    localStorage.setItem(
      `${RELAY_SENDER_BUNDLE_ATTACH_KEY}${pairKey}`,
      JSON.stringify(encryptRecordForStorage(parsed)),
    )
  }

  // Tracked identities (TOFU)
  async storeTrackedIdentity(tracked: TrackedIdentity): Promise<void> {
    localStorage.setItem(`${STORAGE_PREFIX}tracked_${tracked.identityId}`, JSON.stringify(encryptRecordForStorage(tracked)))
  }

  async getTrackedIdentity(identityId: string): Promise<TrackedIdentity | null> {
    const data = localStorage.getItem(`${STORAGE_PREFIX}tracked_${identityId}`)
    return data ? decryptRecordFromStorage<TrackedIdentity>(JSON.parse(data)) : null
  }

  async getAllTrackedIdentities(): Promise<TrackedIdentity[]> {
    const identities: TrackedIdentity[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(`${STORAGE_PREFIX}tracked_`)) {
        const data = localStorage.getItem(key)
        if (data) identities.push(decryptRecordFromStorage<TrackedIdentity>(JSON.parse(data)))
      }
    }
    return identities
  }

  async deleteTrackedIdentity(identityId: string): Promise<void> {
    localStorage.removeItem(`${STORAGE_PREFIX}tracked_${identityId}`)
  }

  // Deletion operations
  async deleteConversation(id: string): Promise<void> {
    await this.deleteConversationMessages(id)
    const conv = await this.getConversation(id)
    if (conv) {
      const indexKey = `${STORAGE_PREFIX}conv_index_${conv.localIdentityId}`
      const index = JSON.parse(localStorage.getItem(indexKey) || '[]')
      localStorage.setItem(indexKey, JSON.stringify(index.filter((cid: string) => cid !== id)))
    }
    localStorage.removeItem(`${CONVERSATION_KEY}${id}`)
  }

  async deleteConversationMessages(conversationId: string): Promise<void> {
    const msgIndexKey = `${MESSAGES_BY_CONV_KEY}${conversationId}`
    const msgIndex: string[] = JSON.parse(localStorage.getItem(msgIndexKey) || '[]')
    for (const msgId of msgIndex) {
      const message = await this.getMessage(msgId)
      if (message?.relayMessageId) {
        localStorage.removeItem(`${MESSAGE_BY_RELAY_KEY}${message.relayMessageId}`)
      }
      localStorage.removeItem(`${MESSAGE_KEY}${msgId}`)
    }
    localStorage.removeItem(msgIndexKey)

    const decIndexKey = `${STORAGE_PREFIX}decrypted_index_${conversationId}`
    const decIndex: string[] = JSON.parse(localStorage.getItem(decIndexKey) || '[]')
    for (const msgId of decIndex) {
      localStorage.removeItem(`${STORAGE_PREFIX}decrypted_${msgId}`)
    }
    localStorage.removeItem(decIndexKey)
  }

  async deletePublicKeyBundle(identityId: string): Promise<void> {
    localStorage.removeItem(`${PUBLIC_BUNDLE_KEY}${identityId}`)
  }

  async deleteSessionRecord(remoteIdentityId: string): Promise<void> {
    const allSessions = await this.getAllSessions(remoteIdentityId)
    for (const session of allSessions) {
      securelyDeleteSessionState(session.state)
      localStorage.removeItem(`${SESSION_KEY}${session.id}`)
    }
    localStorage.removeItem(`${SESSION_RECORD_KEY}${remoteIdentityId}`)
    localStorage.removeItem(`${SESSION_BY_REMOTE_KEY}${remoteIdentityId}`)
  }

  // Clear all data
  async clear(): Promise<void> {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key))
    disableStorageEncryption()
  }
}

// Factory

/**
 * Storage singleton - can be set externally for React Native
 */
let _storageInstance: LocalStorage | null = null
let _storageInitialized = false

/**
 * Set the storage instance (used by React Native)
 * Call before storage operations in React Native.
 */
export function setStorageInstance(storage: LocalStorage): void {
  _storageInstance = storage
  _storageInitialized = true
}

/**
 * Check if running in React Native environment
 */
function isReactNative(): boolean {
  // @ts-ignore - navigator.product may not exist in all environments
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative'
}

/**
 * Create the appropriate storage backend
 */
export function createLocalStorage(): LocalStorage {
  // If storage was set externally (React Native), use that
  if (_storageInstance) {
    return _storageInstance
  }
  
  // Check for IndexedDB support (browser)
  if (typeof indexedDB !== 'undefined') {
    return new IndexedDBStorage()
  }
  
  // Fallback to localStorage (browser)
  if (typeof localStorage !== 'undefined') {
    return new LocalStorageFallback()
  }
  
  // For React Native, storage must be set via setStorageInstance()
  if (isReactNative()) {
    throw new Error(
      'No storage backend available. For React Native, call setStorageInstance() ' +
      'before using @spectra/core-crypto.'
    )
  }
  
  throw new Error('No storage backend available')
}

/**
 * Get the storage instance, creating if needed
 */
export function getLocalStorage(): LocalStorage {
  if (_storageInstance) {
    return _storageInstance
  }
  
  // Only auto-create in browser environments
  if (typeof indexedDB !== 'undefined' || typeof localStorage !== 'undefined') {
    _storageInstance = createLocalStorage()
    return _storageInstance
  }
  
  throw new Error(
    'Storage not initialized. For React Native, call setStorageInstance() first.'
  )
}

/**
 * Check if storage is initialized
 */
export function isStorageInitialized(): boolean {
  return _storageInitialized || _storageInstance !== null
}

/**
 * Export a lazy-loading proxy for the singleton
 * This prevents auto-initialization at import time
 */
export const localChatStorage: LocalStorage = new Proxy({} as LocalStorage, {
  get: (_, prop) => {
    const storage = getLocalStorage()
    const value = (storage as any)[prop]
    if (typeof value === 'function') {
      return value.bind(storage)
    }
    return value
  }
})

