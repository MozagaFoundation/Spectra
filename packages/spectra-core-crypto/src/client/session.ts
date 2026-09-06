/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Session Management
 * 
 * Handles cryptographic session establishment and management
 * using X3DH and Double Ratchet protocols with proper multi-session support.
 * 
 * Features:
 * - Multiple sessions per remote identity (active + inactive)
 * - Automatic session switching on incoming messages
 * - Session fingerprints for identification
 * - Graceful handling of concurrent session establishment
 * - Proper session promotion on fallback decryption
 * - Device-level session tracking
 * - Identity key binding per session
 * - Stale record handling for multi-session state
 */

import type {
  Session,
  SessionRecord,
  DeviceRecord,
  ChatIdentityWithKeys,
  PrivateKeyBundle,
  PublicKeyBundle,
  EncryptedMessage,
  DecryptedMessage,
  X3DHInitialData,
  TrackedIdentity
} from '../types/index'
import { SessionError, CryptoError, ReplayError, DEFAULT_SECURITY_CONFIG, SESAME_TIMING } from '../types/index'
import {
  x3dhInitiator,
  x3dhResponder,
  X3DHInitiatorResult,
  consumeOneTimePreKey,
  replenishOneTimePreKeys
} from '../crypto/x3dh'
import {
  initSessionAsInitiator,
  initSessionAsResponder,
  ratchetEncrypt,
  ratchetDecrypt,
  canSend,
  canReceive,
  needsReestablishment,
  securelyDeleteSessionState,
  cleanupExpiredKeys
} from '../crypto/ratchet'
import { 
  generateUUID, 
  now,
  isTimestampValid,
  generateRandomInt,
  bytesToBase64,
  base64ToBytes
} from '../crypto/utils'
import { deriveX25519PublicKey } from '../crypto/x25519'
import { localChatStorage } from '../storage/local'

// Constants

const MAX_UNANSWERED_MESSAGES = 100
let TIMESTAMP_TOLERANCE = DEFAULT_SECURITY_CONFIG.timestampTolerance
let MAX_PAST_MESSAGE_AGE = DEFAULT_SECURITY_CONFIG.processedMessageRetention

// Default device ID when multi-device is not explicitly used
const DEFAULT_DEVICE_ID = 'default'

// Maximum inactive sessions to keep per device
const MAX_INACTIVE_SESSIONS_PER_DEVICE = 5

// Session age limits
const MAX_SESSION_AGE_FOR_SEND = SESAME_TIMING.maxSend
const MAX_SESSION_AGE_FOR_RECV = SESAME_TIMING.maxRecv

type X3DHBootstrapFailureReason = 'responder_decrypt'

export interface X3DHBootstrapFailureDetails {
  code: 'X3DH_BOOTSTRAP_FAILED'
  reason: X3DHBootstrapFailureReason
  usedOneTimePreKeyId?: number
  bundleTimestamp?: number
  sessionFingerprint?: string | null
}

function createX3DHBootstrapFailure(
  error: unknown,
  encrypted: EncryptedMessage,
  reason: X3DHBootstrapFailureReason,
  sessionFingerprint?: string | null,
): SessionError {
  const message = error instanceof Error ? error.message : String(error)
  return new SessionError(message, {
    code: 'X3DH_BOOTSTRAP_FAILED',
    reason,
    usedOneTimePreKeyId: encrypted.x3dhData?.usedOneTimePreKeyId,
    bundleTimestamp: encrypted.x3dhData?.bundleTimestamp,
    sessionFingerprint: sessionFingerprint ?? encrypted.header?.sessionFingerprint ?? null,
  } satisfies X3DHBootstrapFailureDetails)
}

export function getX3DHBootstrapFailureDetails(error: unknown): X3DHBootstrapFailureDetails | null {
  if (!(error instanceof SessionError) || !error.details || typeof error.details !== 'object') {
    return null
  }

  const details = error.details as Partial<X3DHBootstrapFailureDetails>
  if (details.code !== 'X3DH_BOOTSTRAP_FAILED' || details.reason !== 'responder_decrypt') {
    return null
  }

  return {
    code: 'X3DH_BOOTSTRAP_FAILED',
    reason: 'responder_decrypt',
    usedOneTimePreKeyId: typeof details.usedOneTimePreKeyId === 'number'
      ? details.usedOneTimePreKeyId
      : undefined,
    bundleTimestamp: typeof details.bundleTimestamp === 'number'
      ? details.bundleTimestamp
      : undefined,
    sessionFingerprint: typeof details.sessionFingerprint === 'string'
      ? details.sessionFingerprint
      : null,
  }
}

export function setSessionSecurityConfig(config?: Partial<{
  timestampTolerance: number
  processedMessageRetention: number
}>): void {
  TIMESTAMP_TOLERANCE = config?.timestampTolerance ?? DEFAULT_SECURITY_CONFIG.timestampTolerance
  MAX_PAST_MESSAGE_AGE = config?.processedMessageRetention ?? DEFAULT_SECURITY_CONFIG.processedMessageRetention
}

function assertX3DHSenderMatchesBundle(
  x3dhData: X3DHInitialData,
  senderIdentityId: string,
  senderBundle: PublicKeyBundle | null,
): void {
  if (!senderBundle) {
    throw new SessionError(`Sender key bundle not found for identity ${senderIdentityId}`, {
      code: 'SENDER_BUNDLE_MISSING'
    })
  }
  if (senderBundle.identityId !== senderIdentityId) {
    throw new SessionError('Sender bundle identity ID mismatch', {
      code: 'IDENTITY_MISMATCH'
    })
  }
  if (
    x3dhData.initiatorIdentityKey !== senderBundle.identityKey ||
    x3dhData.initiatorDilithiumKey !== senderBundle.dilithiumKey
  ) {
    throw new SessionError('X3DH initiator keys do not match sender bundle', {
      code: 'IDENTITY_MISMATCH'
    })
  }
}

function assertSessionSignatureKey(session: Session, senderDilithiumPublicKey: string): void {
  if (senderDilithiumPublicKey !== session.boundDilithiumKey) {
    throw new SessionError('Sender signing key does not match session identity binding', {
      code: 'IDENTITY_MISMATCH'
    })
  }
}

function getResponderSignedPreKeyPair(
  usedSignedPreKeyId: number,
  publicBundle: PublicKeyBundle,
  privateBundle: PrivateKeyBundle,
): { publicKey: string; privateKey: string } {
  if (publicBundle.signedPreKey.id === usedSignedPreKeyId) {
    return {
      publicKey: publicBundle.signedPreKey.x25519PublicKey,
      privateKey: privateBundle.signedPreKeyPrivate,
    }
  }

  const previous = privateBundle.previousSignedPreKeys?.find(
    key => key.id === usedSignedPreKeyId && key.expiresAt > now()
  )
  if (!previous) {
    throw new SessionError(`Signed pre-key ${usedSignedPreKeyId} not found for responder ratchet initialization`)
  }

  return {
    publicKey: deriveX25519PublicKey(previous.x25519Private),
    privateKey: previous.x25519Private,
  }
}

function validateAuthenticatedMessageMetadata(session: Session, encrypted: EncryptedMessage): void {
  if (!encrypted.metadata) {
    throw new CryptoError('Message metadata is required for security validation')
  }
  if (encrypted.metadata.senderId !== session.remoteIdentityId) {
    throw new CryptoError('Message sender does not match session remote identity')
  }
  if (encrypted.metadata.recipientId !== session.localIdentityId) {
    throw new CryptoError('Message recipient does not match session local identity')
  }

  const currentTime = now()
  const maxFutureTimestamp = currentTime + TIMESTAMP_TOLERANCE
  const minPastTimestamp = currentTime - MAX_PAST_MESSAGE_AGE

  if (encrypted.metadata.timestamp > maxFutureTimestamp) {
    throw new CryptoError('Message timestamp is too far in the future. Please check your device time is correct.')
  }

  if (encrypted.metadata.timestamp < minPastTimestamp) {
    throw new CryptoError('Message is older than the supported offline delivery window.')
  }

  if (encrypted.metadata.sequenceNumber < 0) {
    throw new CryptoError('Invalid sequence number: negative values not allowed')
  }

  const expectedMinSequence = session.state.receivedMessageCount
  const maxAllowedSkip = 2000
  const sequenceGap = expectedMinSequence - encrypted.metadata.sequenceNumber

  if (sequenceGap > maxAllowedSkip) {
    throw new CryptoError(
      `Message sequence number (${encrypted.metadata.sequenceNumber}) is too old ` +
      `(expected >= ${expectedMinSequence - maxAllowedSkip}). ` +
      `The session may be desynchronized. Please re-establish the conversation.`
    )
  }

  const maxFutureSkip = maxAllowedSkip * 2
  if (encrypted.metadata.sequenceNumber > expectedMinSequence + maxFutureSkip) {
    throw new CryptoError(
      `Message sequence number (${encrypted.metadata.sequenceNumber}) is too far in the future ` +
      `(expected <= ${expectedMinSequence + maxFutureSkip}). ` +
      `The session may be desynchronized.`
    )
  }
}

// Session Record Management

/**
 * Get or create a session record for a remote identity
 */
async function getOrCreateSessionRecord(remoteIdentityId: string): Promise<SessionRecord> {
  let record = await localChatStorage.getSessionRecord(remoteIdentityId)
  
  if (!record) {
    record = {
      remoteIdentityId,
      deviceRecords: new Map(),
      sessions: new Map(),
      activeSessionId: null,
      isStale: false,
      updatedAt: now()
    }
  }
  
  // Normalize legacy records and JSON-deserialized Maps.
  const deviceRecords = record.deviceRecords as unknown
  if (!deviceRecords || !(deviceRecords instanceof Map)) {
    if (deviceRecords && typeof deviceRecords === 'object') {
      record.deviceRecords = new Map(
        Object.entries(deviceRecords as Record<string, DeviceRecord>)
      )
    } else {
      record.deviceRecords = new Map()
    }
  }
  const sessions = record.sessions as unknown
  if (!sessions || !(sessions instanceof Map)) {
    if (sessions && typeof sessions === 'object') {
      record.sessions = new Map(
        Object.entries(sessions as Record<string, Session>)
      )
    } else {
      record.sessions = new Map()
    }
  }
  if (record.isStale === undefined) {
    record.isStale = false
  }
  
  return record
}

/**
 * Prepare, but do not persist, the record required to make a responder
 * session discoverable after an inbound message commit.
 */
async function stageInboundSessionRecord(session: Session): Promise<SessionRecord> {
  const record = await getOrCreateSessionRecord(session.remoteIdentityId)
  record.sessions.set(session.id, session)
  record.activeSessionId = session.id
  record.updatedAt = now()
  return record
}

/**
 * Get or create a device record within a session record
 */
async function getOrCreateDeviceRecord(
  remoteIdentityId: string,
  deviceId: string,
  deviceKey?: string,
  deviceDilithiumKey?: string,
  registrationId?: number
): Promise<DeviceRecord> {
  const sessionRecord = await getOrCreateSessionRecord(remoteIdentityId)
  
  let deviceRecord = sessionRecord.deviceRecords.get(deviceId)
  
  if (!deviceRecord) {
    deviceRecord = {
      deviceId,
      identityId: remoteIdentityId,
      deviceKey: deviceKey || '',
      deviceDilithiumKey: deviceDilithiumKey || '',
      registrationId: registrationId || generateRandomInt(0x7FFFFFFF),
      activeSessionId: null,
      inactiveSessionIds: [],
      isStale: false,
      lastActivityAt: now(),
      createdAt: now()
    }
    sessionRecord.deviceRecords.set(deviceId, deviceRecord)
    await localChatStorage.storeSessionRecord(sessionRecord)
  }
  
  return deviceRecord
}

/**
 * Mark a device record as stale.
 */
export async function markDeviceStale(
  remoteIdentityId: string,
  deviceId: string
): Promise<void> {
  const record = await getOrCreateSessionRecord(remoteIdentityId)
  const deviceRecord = record.deviceRecords.get(deviceId)
  
  if (deviceRecord && !deviceRecord.isStale) {
    deviceRecord.isStale = true
    deviceRecord.staleAt = now()
    record.deviceRecords.set(deviceId, deviceRecord)
    record.updatedAt = now()
    await localChatStorage.storeSessionRecord(record)
  }
}

/**
 * Clean up stale records using configured timing parameters.
 * 
 * Cleans up:
 * 1. Stale device records past retention period
 * 2. Expired sessions (past deleteAfter timestamp)
 * 3. Expired skipped message keys in archived sessions
 * 
 * Should be called periodically (e.g., on app startup, hourly)
 */
export async function cleanupStaleRecords(remoteIdentityId: string): Promise<number> {
  const record = await getOrCreateSessionRecord(remoteIdentityId)
  const currentTime = now()
  let cleaned = 0
  
  // Remove stale device records past retention.
  for (const [deviceId, deviceRecord] of record.deviceRecords.entries()) {
    if (deviceRecord.isStale && deviceRecord.staleAt) {
      if (currentTime - deviceRecord.staleAt > SESAME_TIMING.staleRetention) {
        // Delete this device's sessions.
        for (const sessionId of [deviceRecord.activeSessionId, ...deviceRecord.inactiveSessionIds]) {
          if (sessionId) {
            const session = await localChatStorage.getSession(sessionId)
            if (session) {
              securelyDeleteSessionState(session.state)
              await localChatStorage.deleteSession(sessionId)
              record.sessions.delete(sessionId)
              cleaned++
            }
          }
        }
        record.deviceRecords.delete(deviceId)
      }
    }
  }
  
  // Clean up sessions past their deleteAfter timestamp
  for (const [sessionId, session] of record.sessions.entries()) {
    if (session.deleteAfter && currentTime > session.deleteAfter) {
      securelyDeleteSessionState(session.state)
      await localChatStorage.deleteSession(sessionId)
      record.sessions.delete(sessionId)
      cleaned++
    }
  }
  
  // Clean up expired skipped keys even when archived sessions are retained.
  for (const session of record.sessions.values()) {
    if (session.status === 'archived' || session.status === 'inactive') {
      const expiredKeyCount = cleanupExpiredKeys(session.state)
      if (expiredKeyCount > 0) {
        await localChatStorage.storeSession(session)
        cleaned += expiredKeyCount
      }
    }
  }
  
  if (cleaned > 0) {
    record.updatedAt = currentTime
    await localChatStorage.storeSessionRecord(record)
  }
  
  return cleaned
}

/**
 * Enforce maximum inactive sessions per device.
 * Deletes oldest inactive/archived sessions when over limit
 */
async function enforceInactiveSessionLimit(
  record: SessionRecord,
  deviceId: string
): Promise<void> {
  const deviceRecord = record.deviceRecords.get(deviceId)
  if (!deviceRecord) return
  
  // Get all inactive sessions for this device
  const inactiveSessions: Session[] = []
  for (const sessionId of deviceRecord.inactiveSessionIds) {
    const session = await localChatStorage.getSession(sessionId)
    if (session && (session.status === 'inactive' || session.status === 'archived')) {
      inactiveSessions.push(session)
    }
  }
  
  // Sort by last activity (oldest first)
  inactiveSessions.sort((a, b) => 
    (a.lastMessageAt || a.createdAt) - (b.lastMessageAt || b.createdAt)
  )
  
  // Delete oldest sessions over the limit
  while (inactiveSessions.length > MAX_INACTIVE_SESSIONS_PER_DEVICE) {
    const oldestSession = inactiveSessions.shift()
    if (oldestSession) {
      securelyDeleteSessionState(oldestSession.state)
      await localChatStorage.deleteSession(oldestSession.id)
      record.sessions.delete(oldestSession.id)
      deviceRecord.inactiveSessionIds = deviceRecord.inactiveSessionIds.filter(
        id => id !== oldestSession.id
      )
    }
  }
}

/**
 * Add a session to a session record
 * Archives old sessions instead of just deactivating them.
 * 
 * Skipped message keys from old sessions are retained only for the configured
 * in-flight message window.
 */
async function addSessionToRecord(session: Session): Promise<void> {
  const record = await getOrCreateSessionRecord(session.remoteIdentityId)
  
  // Add session to record
  record.sessions.set(session.id, session)
  
  // If this is the first session or marked as active, make it active
  if (!record.activeSessionId || session.status === 'active') {
    // Archive any previously active session (not just deactivate)
    if (record.activeSessionId && record.activeSessionId !== session.id) {
      const prevSession = await localChatStorage.getSession(record.activeSessionId)
      if (prevSession) {
        // Archive instead of just marking inactive - keeps session for fallback decryption
        prevSession.status = 'archived'
        prevSession.archivedAt = now()
        prevSession.archiveReason = 'superseded'
        
        // Schedule cleanup of skipped keys from archived sessions.
        // After that, they should be securely deleted
        prevSession.deleteAfter = now() + SESAME_TIMING.maxRecv // 30 days
        
        await localChatStorage.storeSession(prevSession)
        record.sessions.set(prevSession.id, prevSession)
        
        // Add to device's inactive list
        const deviceId = prevSession.remoteDeviceId || DEFAULT_DEVICE_ID
        const deviceRecord = record.deviceRecords.get(deviceId)
        if (deviceRecord && !deviceRecord.inactiveSessionIds.includes(prevSession.id)) {
          deviceRecord.inactiveSessionIds.push(prevSession.id)
          record.deviceRecords.set(deviceId, deviceRecord)
        }
      }
    }
    record.activeSessionId = session.id
  }
  
  // Enforce inactive session limit per device
  const deviceId = session.remoteDeviceId || DEFAULT_DEVICE_ID
  await enforceInactiveSessionLimit(record, deviceId)
  
  record.updatedAt = now()
  await localChatStorage.storeSessionRecord(record)
}

/**
 * Archive a session (keep for decryption but don't use for sending)
 */
export async function archiveSession(
  sessionId: string,
  reason: 'superseded' | 'manual' | 'expired' | 'error' = 'manual'
): Promise<void> {
  const session = await localChatStorage.getSession(sessionId)
  if (!session) return

  session.status = 'archived'
  session.archivedAt = now()
  session.archiveReason = reason
  await localChatStorage.storeSession(session)

  // Update session record
  const record = await localChatStorage.getSessionRecord(session.remoteIdentityId)
  if (record && record.activeSessionId === sessionId) {
    // Find the newest non-archived session to make active
    const sessions = await localChatStorage.getAllSessions(session.remoteIdentityId)
    const nonArchivedSessions = sessions.filter(s => s.status !== 'archived' && s.id !== sessionId)
    
    if (nonArchivedSessions.length > 0) {
      const newestSession = nonArchivedSessions.reduce((a, b) => 
        a.createdAt > b.createdAt ? a : b
      )
      record.activeSessionId = newestSession.id
      newestSession.status = 'active'
      await localChatStorage.storeSession(newestSession)
    } else {
      record.activeSessionId = null
    }
    
    record.updatedAt = now()
    await localChatStorage.storeSessionRecord(record)
  }
}

/**
 * Get all sessions including archived ones for a remote identity
 * Used for fallback decryption.
 */
export async function getAllSessionsIncludingArchived(remoteIdentityId: string): Promise<Session[]> {
  return localChatStorage.getAllSessions(remoteIdentityId)
}

/**
 * Find the best session to use for decryption based on message header
 * Session selection:
 * 1. Try to match by session fingerprint
 * 2. Try active session
 * 3. Try archived sessions (newest first)
 */
export async function findSessionForDecryption(
  remoteIdentityId: string,
  sessionFingerprint?: string
): Promise<Session | null> {
  const sessions = await getAllSessionsIncludingArchived(remoteIdentityId)
  const { constantTimeBase64Equal } = await import('../crypto/utils')
  
  if (sessions.length === 0) {
    return null
  }

  // If we have a fingerprint, try to match it first
  if (sessionFingerprint) {
    const matchingSession = sessions.find(s => constantTimeBase64Equal(s.baseKeyFingerprint, sessionFingerprint))
    if (matchingSession) {
      return matchingSession
    }
  }

  // Try active session
  const activeSession = sessions.find(s => s.status === 'active')
  if (activeSession) {
    return activeSession
  }

  // Try inactive sessions
  const inactiveSession = sessions.find(s => s.status === 'inactive')
  if (inactiveSession) {
    return inactiveSession
  }

  // Try archived sessions (newest first)
  const archivedSessions = sessions
    .filter(s => s.status === 'archived')
    .sort((a, b) => (b.archivedAt || b.createdAt) - (a.archivedAt || a.createdAt))
  
  if (archivedSessions.length > 0) {
    return archivedSessions[0]
  }

  return null
}

// Session Establishment

export interface SessionEstablishmentResult {
  session: Session
  x3dhResult?: X3DHInitiatorResult
  initialMessage?: {
    ciphertext: string
    nonce: string
    tag: string
    signature: string
  }
  isNewSession: boolean
}

export interface SessionEstablishmentOptions {
  /** Target device ID (default: 'default') */
  deviceId?: string
  /** Preferred OPK ID from server allocation */
  preferredOPKId?: number
  /** Initial message to send */
  initialMessage?: string
  /** Tracked identity for verification */
  trackedIdentity?: TrackedIdentity
}

/**
 * Establish a new session as the initiator (Alice)
 * This is called when starting a conversation with someone new
 */
export async function establishSessionAsInitiator(
  localIdentity: ChatIdentityWithKeys,
  localPrivateBundle: PrivateKeyBundle,
  remoteIdentityId: string,
  initialMessageOrOptions?: string | SessionEstablishmentOptions
): Promise<SessionEstablishmentResult> {
  // Parse options
  const options: SessionEstablishmentOptions = typeof initialMessageOrOptions === 'string'
    ? { initialMessage: initialMessageOrOptions }
    : initialMessageOrOptions || {}
  
  const deviceId = options.deviceId || DEFAULT_DEVICE_ID
  const initialMessage = options.initialMessage
  
  // Get remote identity's key bundle from local storage
  const remoteBundle = await localChatStorage.getPublicKeyBundle(remoteIdentityId)
  if (!remoteBundle) {
    throw new SessionError(`No key bundle found for identity ${remoteIdentityId}. You need to import their public key bundle first.`)
  }
  
  // If tracked identity provided, verify keys match
  if (options.trackedIdentity) {
    const tracked = options.trackedIdentity
    if (tracked.currentIdentityKey !== remoteBundle.identityKey ||
        tracked.currentDilithiumKey !== remoteBundle.dilithiumKey) {
      throw new SessionError(
        'Remote identity keys do not match tracked identity. ' +
        'The contact may have changed their keys. Please verify before proceeding.',
        { code: 'IDENTITY_MISMATCH' }
      )
    }
  }
  
  // Include ML-DSA-65 in the X3DH identity binding.
  const x3dhResult = await x3dhInitiator(
    localPrivateBundle.identityPrivateKey,
    localIdentity.identityPublicKey,
    localIdentity.dilithiumPublicKey, // ML-DSA-65 key, added for identity binding
    remoteBundle,
    { preferredOTPKId: options.preferredOPKId }
  )
  
  // Initialize Double Ratchet session
  // Use the remote's X25519 signed pre-key as the initial ratchet key
  // Pass the X3DH ephemeral key pair so both sides derive matching header keys.
  const sessionState = initSessionAsInitiator(
    x3dhResult.sharedSecret,
    remoteBundle.signedPreKey.x25519PublicKey,
    {
      publicKey: x3dhResult.ephemeralPublicKey,
      privateKey: x3dhResult.ephemeralPrivateKey
    }
  )
  
  // Create X3DH initial data to include in messages
  const pendingX3DHData: X3DHInitialData = {
    initiatorIdentityKey: localIdentity.identityPublicKey,
    ephemeralKey: x3dhResult.ephemeralPublicKey,
    mlkemCiphertext: x3dhResult.mlkemCiphertext,
    usedOneTimePreKeyId: x3dhResult.usedOneTimePreKeyId,
    usedSignedPreKeyId: x3dhResult.usedSignedPreKeyId,
    initiatorDilithiumKey: localIdentity.dilithiumPublicKey,
    bundleTimestamp: x3dhResult.bundleTimestamp
  }
  
  const currentTime = now()
  
  // Create session with proper identity binding and device tracking
  const session: Session = {
    id: generateUUID(),
    localIdentityId: localIdentity.id,
    remoteIdentityId,
    remoteDeviceId: deviceId, // REQUIRED for proper Sesame
    state: sessionState,
    status: 'active',
    baseKeyFingerprint: x3dhResult.sessionFingerprint,
    // Bind identity keys for per-message verification.
    boundIdentityKey: remoteBundle.identityKey,
    boundDilithiumKey: remoteBundle.dilithiumKey,
    // Bind AEAD to the X3DH transcript.
    boundAssociatedData: bytesToBase64(x3dhResult.associatedData),
    createdAt: currentTime,
    updatedAt: currentTime,
    pendingX3DHData,
    unansweredMessages: 0,
    maxUnansweredMessages: MAX_UNANSWERED_MESSAGES,
    isStale: false
  }
  
  // Store session locally
  await localChatStorage.storeSession(session)
  
  // Add to session record with device tracking
  await addSessionToRecord(session)
  
  // Update device record
  const deviceRecord = await getOrCreateDeviceRecord(
    remoteIdentityId,
    deviceId,
    remoteBundle.identityKey,
    remoteBundle.dilithiumKey
  )
  deviceRecord.activeSessionId = session.id
  deviceRecord.lastActivityAt = currentTime
  
  const sessionRecord = await getOrCreateSessionRecord(remoteIdentityId)
  sessionRecord.deviceRecords.set(deviceId, deviceRecord)
  await localChatStorage.storeSessionRecord(sessionRecord)
  
  // If there's an initial message, encrypt it
  let encryptedInitial: { ciphertext: string; nonce: string; tag: string; signature: string } | undefined
  if (initialMessage) {
    const encrypted = await ratchetEncrypt(
      session.state,
      initialMessage,
      localIdentity.dilithiumPrivateKey,
      {
        senderId: localIdentity.id,
        recipientId: remoteIdentityId,
        sessionId: session.id,
        sequenceNumber: 0
      },
      { 
        associatedData: x3dhResult.associatedData,
        enableHeaderEncryption: true,  // Enable header encryption by default
        sessionFingerprint: session.baseKeyFingerprint  // Include in header before signing
      }
    )
    
    encryptedInitial = {
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      tag: encrypted.tag,
      signature: encrypted.signature
    }
    
    session.unansweredMessages++
    
    // Update session after encryption (state changed)
    session.updatedAt = now()
    await localChatStorage.storeSession(session)
  }
  
  return {
    session,
    x3dhResult,
    initialMessage: encryptedInitial,
    isNewSession: true
  }
}

/**
 * Establish a session as the responder (Bob)
 * This is called when receiving a hybrid X3DH message from a new contact
 */
export async function establishSessionAsResponder(
  localIdentity: ChatIdentityWithKeys,
  localPrivateBundle: PrivateKeyBundle,
  x3dhMessage: X3DHInitialData,
  initiatorIdentityId: string
): Promise<Session> {
  // Get our public key bundle for the ML-KEM identity key
  const ourBundle = await localChatStorage.getPublicKeyBundle(localIdentity.id)
  if (!ourBundle) {
    throw new SessionError('Cannot find our own key bundle')
  }

  const initiatorBundle = await localChatStorage.getPublicKeyBundle(initiatorIdentityId)
  assertX3DHSenderMatchesBundle(x3dhMessage, initiatorIdentityId, initiatorBundle)
  
  // Include ML-DSA-65 in the responder identity binding.
  const x3dhResult = await x3dhResponder(
    {
      initiatorIdentityKey: x3dhMessage.initiatorIdentityKey,
      initiatorEphemeralKey: x3dhMessage.ephemeralKey,
      mlkemCiphertext: x3dhMessage.mlkemCiphertext,
      usedOneTimePreKeyId: x3dhMessage.usedOneTimePreKeyId,
      usedSignedPreKeyId: x3dhMessage.usedSignedPreKeyId,
      initiatorDilithiumKey: x3dhMessage.initiatorDilithiumKey,
      bundleTimestamp: x3dhMessage.bundleTimestamp
    },
    localPrivateBundle.identityPrivateKey,
    localIdentity.identityPublicKey,
    localIdentity.dilithiumPublicKey, // ML-DSA-65 key, added for identity binding
    ourBundle.mlkemIdentityKey,
    localPrivateBundle.signedPreKeyPrivate,
    localPrivateBundle.mlkemSignedPreKeyPrivate,
    localPrivateBundle.oneTimePreKeyPrivates,
    localPrivateBundle.mlkemOneTimePreKeyPrivates,
    ourBundle,
    localPrivateBundle
  )
  
  const responderSignedPreKey = getResponderSignedPreKeyPair(
    x3dhMessage.usedSignedPreKeyId,
    ourBundle,
    localPrivateBundle,
  )

  // Initialize Double Ratchet session as responder
  // Use the signed pre-key selected by the X3DH bootstrap.
  // Pass the initiator's ephemeral key to derive the header decryption key.
  const sessionState = initSessionAsResponder(
    x3dhResult.sharedSecret,
    responderSignedPreKey,
    x3dhMessage.ephemeralKey // Required for header key derivation
  )
  
  const currentTime = now()
  
  // Create session with identity binding
  const session: Session = {
    id: generateUUID(),
    localIdentityId: localIdentity.id,
    remoteIdentityId: initiatorIdentityId,
    remoteDeviceId: DEFAULT_DEVICE_ID, // Default device for responder
    state: sessionState,
    status: 'active',
    baseKeyFingerprint: x3dhResult.sessionFingerprint,
    boundIdentityKey: x3dhMessage.initiatorIdentityKey,
    boundDilithiumKey: x3dhMessage.initiatorDilithiumKey,
    // Bind AEAD to the X3DH transcript.
    boundAssociatedData: bytesToBase64(x3dhResult.associatedData),
    createdAt: currentTime,
    updatedAt: currentTime,
    unansweredMessages: 0,
    maxUnansweredMessages: MAX_UNANSWERED_MESSAGES,
    isStale: false
  }
  
  // Store session locally
  await localChatStorage.storeSession(session)
  
  // Add to session record (this will switch active session)
  await addSessionToRecord(session)
  
  // Remove used one-time pre-keys from local storage (both X25519 and ML-KEM)
  if (x3dhMessage.usedOneTimePreKeyId !== undefined) {
    const { bundle: newBundle, privateBundle: newPrivateBundle } = consumeOneTimePreKey(
      ourBundle,
      localPrivateBundle,
      x3dhMessage.usedOneTimePreKeyId
    )
    
    await localChatStorage.storePublicKeyBundle(localIdentity.id, newBundle)
    await localChatStorage.storePrivateKeyBundle(localIdentity.id, newPrivateBundle)
    
    // Replenish OPKs if running low
    if (newBundle.oneTimePreKeys.length < 20) {
      const { bundle: refreshedBundle, privateBundle: refreshedPrivateBundle } = replenishOneTimePreKeys(
        newBundle,
        newPrivateBundle,
        100
      )
      await localChatStorage.storePublicKeyBundle(localIdentity.id, refreshedBundle)
      await localChatStorage.storePrivateKeyBundle(localIdentity.id, refreshedPrivateBundle)
    }
  }
  
  return session
}

// Session Lookup

/**
 * Get existing session by ID
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  return localChatStorage.getSession(sessionId)
}

/**
 * Get active session by remote identity ID
 */
export async function getActiveSessionByRemoteIdentity(remoteIdentityId: string): Promise<Session | null> {
  return localChatStorage.getActiveSession(remoteIdentityId)
}

/**
 * Get all sessions for a remote identity
 */
export async function getAllSessionsForRemoteIdentity(remoteIdentityId: string): Promise<Session[]> {
  return localChatStorage.getAllSessions(remoteIdentityId)
}

/**
 * Find session by base key fingerprint
 * 
 * Uses constant-time comparison for fingerprint matching.
 */
export async function findSessionByFingerprint(
  remoteIdentityId: string,
  fingerprint: string
): Promise<Session | null> {
  const sessions = await getAllSessionsForRemoteIdentity(remoteIdentityId)
  const { constantTimeBase64Equal } = await import('../crypto/utils')
  return sessions.find(s => constantTimeBase64Equal(s.baseKeyFingerprint, fingerprint)) || null
}

/**
 * Get or establish session with a remote identity
 */
export async function getOrEstablishSession(
  localIdentity: ChatIdentityWithKeys,
  localPrivateBundle: PrivateKeyBundle,
  remoteIdentityId: string
): Promise<Session> {
  // Try to get existing active session
  const existingSession = await getActiveSessionByRemoteIdentity(remoteIdentityId)
  if (existingSession && canSend(existingSession.state)) {
    // Check if session needs re-establishment
    if (!needsReestablishment(existingSession.state)) {
      return existingSession
    }
  }
  
  // Establish new session
  const { session } = await establishSessionAsInitiator(
    localIdentity,
    localPrivateBundle,
    remoteIdentityId
  )
  
  return session
}

// Message Encryption/Decryption

/**
 * Encrypt a message for a session
 * 
 * @param session - The session to encrypt for
 * @param message - The plaintext message
 * @param dilithiumPrivateKey - ML-DSA-65 private key for signing (legacy parameter name)
 * @param sequenceNumber - Message sequence number
 * @param previousMessageHash - Hash of previous message (for chaining)
 * @param options - Encryption options (header encryption enabled by default)
 */
export async function prepareSessionMessage(
  session: Session,
  message: string,
  dilithiumPrivateKey: string,
  sequenceNumber: number,
  previousMessageHash?: string,
  options: {
    enableHeaderEncryption?: boolean
  } = { enableHeaderEncryption: true }
): Promise<EncryptedMessage> {
  if (!canSend(session.state)) {
    throw new SessionError('Session not ready for sending')
  }
  
  // Bind message encryption to the session identity context.
  const associatedData = session.boundAssociatedData 
    ? base64ToBytes(session.boundAssociatedData)
    : undefined
  
  const encrypted = await ratchetEncrypt(
    session.state,
    message,
    dilithiumPrivateKey,
    {
      senderId: session.localIdentityId,
      recipientId: session.remoteIdentityId,
      sessionId: session.id,
      sequenceNumber,
      previousMessageHash
    },
    {
      enableHeaderEncryption: options.enableHeaderEncryption ?? true,
      associatedData,
      sessionFingerprint: session.baseKeyFingerprint  // Include in header before signing
    }
  )
  
  // Only stamp the bootstrap tuple onto the first unanswered message.
  // Later recovery should use explicit retry/session repair instead of
  // replaying the same stale X3DH payload on every outbound message.
  if (session.pendingX3DHData && session.unansweredMessages === 0) {
    encrypted.x3dhData = session.pendingX3DHData
  }
  
  // Track unanswered messages
  session.unansweredMessages++
  session.lastMessageAt = now()
  
  // Update session state
  session.updatedAt = now()
  
  return encrypted
}

export async function encryptSessionMessage(
  session: Session,
  message: string,
  dilithiumPrivateKey: string,
  sequenceNumber: number,
  previousMessageHash?: string,
  options: {
    enableHeaderEncryption?: boolean
  } = { enableHeaderEncryption: true },
): Promise<EncryptedMessage> {
  const encrypted = await prepareSessionMessage(
    session,
    message,
    dilithiumPrivateKey,
    sequenceNumber,
    previousMessageHash,
    options,
  )
  await localChatStorage.storeSession(session)
  return encrypted
}

/**
 * Decrypt a message for a session
 * 
 * Timestamp and sequence number validation occur after cryptographic
 * verification so attackers cannot manipulate unauthenticated metadata fields
 * in transit.
 * 
 * Order of operations:
 * 1. Basic format validation (fields exist)
 * 2. Replay check by messageId (fast rejection)
 * 3. Cryptographic verification (signature + decryption) - establishes authenticity
 * 4. Timestamp validation (on authenticated data)
 * 5. Sequence number validation (on authenticated data)
 */
export async function decryptSessionMessage(
  session: Session,
  encrypted: EncryptedMessage,
  senderDilithiumPublicKey: string
): Promise<DecryptedMessage> {
  if (!canReceive(session.state)) {
    throw new SessionError('Session not ready for receiving')
  }
  assertSessionSignatureKey(session, senderDilithiumPublicKey)
  
  // STEP 1: Basic format validation (required fields exist)
  // This is safe pre-decryption as we're only checking structure, not values
  if (!encrypted.metadata) {
    throw new CryptoError('Message metadata is required for security validation')
  }
  
  if (!encrypted.metadata.messageId) {
    throw new CryptoError('Message ID is required for replay protection')
  }
  
  if (encrypted.metadata.timestamp === undefined || encrypted.metadata.timestamp === null) {
    throw new CryptoError('Message timestamp is required')
  }
  
  if (encrypted.metadata.sequenceNumber === undefined || encrypted.metadata.sequenceNumber === null) {
    throw new CryptoError('Message sequence number is required for ordering validation')
  }
  
  // STEP 2: Fast replay rejection by messageId (before expensive crypto ops)
  // The messageId is included in the signature, so forgery would be detected later
  const isProcessed = await localChatStorage.isMessageProcessed(encrypted.metadata.messageId)
  if (isProcessed) {
    throw new ReplayError(`Message ${encrypted.metadata.messageId} has already been processed (replay attempt)`)
  }
  
  // Verify AEAD against the session identity context.
  const associatedData = session.boundAssociatedData 
    ? base64ToBytes(session.boundAssociatedData)
    : undefined
  
  // STEP 3: Verify signature and decrypt.
  const content = await ratchetDecrypt(
    session.state,
    encrypted,
    senderDilithiumPublicKey,
    {
      associatedData,
      validateAuthenticatedData: () => validateAuthenticatedMessageMetadata(session, encrypted)
    }
  )
  
  // Metadata checks below run on authenticated data.
  validateAuthenticatedMessageMetadata(session, encrypted)
  
  // STEP 4: Validate the signed timestamp.
  const currentTime = now()
  const maxFutureTimestamp = currentTime + TIMESTAMP_TOLERANCE
  const minPastTimestamp = currentTime - MAX_PAST_MESSAGE_AGE

  if (encrypted.metadata.timestamp > maxFutureTimestamp) {
    console.warn(
      `[Session] SECURITY: Authenticated message timestamp is too far in the future. ` +
      `Timestamp: ${new Date(encrypted.metadata.timestamp).toISOString()}, ` +
      `Current: ${new Date(currentTime).toISOString()}, Future tolerance: ${TIMESTAMP_TOLERANCE}ms.`
    )
    throw new CryptoError(
      'Message timestamp is too far in the future. Please check your device time is correct.'
    )
  }

  if (encrypted.metadata.timestamp < minPastTimestamp) {
    console.warn(
      `[Session] SECURITY: Authenticated message is older than the relay retention window. ` +
      `Timestamp: ${new Date(encrypted.metadata.timestamp).toISOString()}, ` +
      `Current: ${new Date(currentTime).toISOString()}, Max age: ${MAX_PAST_MESSAGE_AGE}ms.`
    )
    throw new CryptoError(
      'Message is older than the supported offline delivery window.'
    )
  }

  if (!isTimestampValid(encrypted.metadata.timestamp, TIMESTAMP_TOLERANCE)) {
    console.warn(
      `[Session] Allowing authenticated delayed message outside the live skew window. ` +
      `Timestamp: ${new Date(encrypted.metadata.timestamp).toISOString()}, ` +
      `Current: ${new Date(currentTime).toISOString()}, Live tolerance: ${TIMESTAMP_TOLERANCE}ms.`
    )
  }
  
  // STEP 5: Validate the signed sequence number.
  const expectedMinSequence = session.state.receivedMessageCount
  const maxAllowedSkip = 2000 // Match MAX_SKIP in ratchet.ts
  
  // Reject sequence numbers beyond the skip window.
  if (encrypted.metadata.sequenceNumber < 0) {
    throw new CryptoError('Invalid sequence number: negative values not allowed')
  }
  
  // Measure lag against the expected sequence.
  const sequenceGap = expectedMinSequence - encrypted.metadata.sequenceNumber
  
  if (sequenceGap > maxAllowedSkip) {
    // Reject authenticated messages outside the replay window.
    console.error(`[Session] SECURITY REJECTION: Sequence number too old. ` +
      `Received: ${encrypted.metadata.sequenceNumber}, ` +
      `Expected min: ${expectedMinSequence - maxAllowedSkip}, ` +
      `Gap: ${sequenceGap}. ` +
      `This could indicate a replay attack or severe desynchronization.`)
    throw new CryptoError(
      `Message sequence number (${encrypted.metadata.sequenceNumber}) is too old ` +
      `(expected >= ${expectedMinSequence - maxAllowedSkip}). ` +
      `The session may be desynchronized. Please re-establish the conversation.`
    )
  }
  
  // Check for sequence numbers that are unreasonably far in the future
  // This could indicate an attempt to exhaust skipped key storage
  const maxFutureSkip = maxAllowedSkip * 2 // Allow some buffer but not unlimited
  if (encrypted.metadata.sequenceNumber > expectedMinSequence + maxFutureSkip) {
    console.error(`[Session] SECURITY REJECTION: Sequence number too far in future. ` +
      `Received: ${encrypted.metadata.sequenceNumber}, ` +
      `Expected max: ${expectedMinSequence + maxFutureSkip}. ` +
      `This could indicate an attempt to exhaust skipped key storage.`)
    throw new CryptoError(
      `Message sequence number (${encrypted.metadata.sequenceNumber}) is too far in the future ` +
      `(expected <= ${expectedMinSequence + maxFutureSkip}). ` +
      `The session may be desynchronized.`
    )
  }
  
  // Log warning for messages that are old but within acceptable window
  if (sequenceGap > maxAllowedSkip / 2) {
    console.warn(`[Session] WARNING: Message has old sequence number but within tolerance. ` +
      `Received: ${encrypted.metadata.sequenceNumber}, Gap: ${sequenceGap}.`)
  }
  
  // Stage state for atomic commit with the message projection.
  // Clear pending X3DH data after the first received message.
  if (session.pendingX3DHData) {
    session.pendingX3DHData = undefined
  }
  
  // Reset unanswered message count
  session.unansweredMessages = 0
  
  // Update session state
  session.updatedAt = now()
  session.lastMessageAt = now()
  
  return {
    id: encrypted.metadata.messageId, // Guaranteed to exist after validation
    conversationId: '', // Set by caller who knows the conversation context
    senderId: session.remoteIdentityId,
    content,
    timestamp: encrypted.metadata.timestamp, // Guaranteed to exist after validation
    signatureVerified: true,
    sequenceNumber: encrypted.metadata.sequenceNumber
  }
}

/**
 * Try to decrypt a message using multiple sessions.
 * 
 * This handles cases like:
 * - Out-of-order message delivery
 * - Race conditions during concurrent session establishment
 * - Messages from archived sessions
 * 
 * @param remoteIdentityId - The sender's identity ID
 * @param encrypted - The encrypted message
 * @param senderDilithiumPublicKey - Sender's ML-DSA-65 public key (legacy parameter name)
 * @returns Decrypted message, selected session, and promotion guidance.
 */
export async function decryptWithSessionFallback(
  remoteIdentityId: string,
  encrypted: EncryptedMessage,
  senderDilithiumPublicKey: string
): Promise<{ 
  decrypted: DecryptedMessage
  session: Session
  usedFallback: boolean
  sessionPromotable: boolean
}> {
  // Get all sessions for this remote identity
  const sessions = await getAllSessionsIncludingArchived(remoteIdentityId)
  
  if (sessions.length === 0) {
    throw new SessionError(`No sessions found for identity ${remoteIdentityId}`)
  }

  // Sort sessions: active first, then inactive, then archived (newest first)
  const sortedSessions = [...sessions].sort((a, b) => {
    const statusOrder: Record<string, number> = { active: 0, inactive: 1, pending: 2, archived: 3, expired: 4 }
    const orderA = statusOrder[a.status] ?? 5
    const orderB = statusOrder[b.status] ?? 5
    if (orderA !== orderB) return orderA - orderB
    return b.createdAt - a.createdAt // Newest first within same status
  })

  // Try the preferred session (by fingerprint) first if available
  const sessionFingerprint = encrypted.header?.sessionFingerprint
  if (sessionFingerprint) {
    const { constantTimeBase64Equal } = await import('../crypto/utils')
    const preferredSession = sortedSessions.find(s => constantTimeBase64Equal(s.baseKeyFingerprint, sessionFingerprint))
    if (preferredSession && preferredSession !== sortedSessions[0]) {
      // Move preferred session to front
      const idx = sortedSessions.indexOf(preferredSession)
      sortedSessions.splice(idx, 1)
      sortedSessions.unshift(preferredSession)
    }
  }

  const errors: Error[] = []
  
  for (let i = 0; i < sortedSessions.length; i++) {
    const session = sortedSessions[i]
    
    // Skip expired sessions
    if (session.status === 'expired') continue
    
    // Skip stale sessions
    if (session.isStale) continue
    
    // Skip sessions that can't receive
    if (!canReceive(session.state)) continue
    
    try {
      const decrypted = await decryptSessionMessage(
        session,
        encrypted,
        senderDilithiumPublicKey
      )
      
      const usedFallback = i > 0
      const sessionPromotable = usedFallback
        && (session.status === 'inactive' || session.status === 'archived')
      
      return { decrypted, session, usedFallback, sessionPromotable }
    } catch (error) {
      errors.push(error as Error)
      // Continue to next session
    }
  }

  // All sessions failed - throw the first error (most relevant)
  throw errors[0] || new SessionError('Failed to decrypt message with any available session')
}

/**
 * Promote a session to active status.
 * This is called when an inactive/archived session successfully decrypts a message
 */
export async function promoteSessionToActive(
  remoteIdentityId: string,
  sessionIdToPromote: string
): Promise<void> {
  const record = await getOrCreateSessionRecord(remoteIdentityId)
  const sessionToPromote = await localChatStorage.getSession(sessionIdToPromote)
  
  if (!sessionToPromote) {
    return
  }
  
  const previousActiveId = record.activeSessionId
  
  // If there's a current active session, demote it to inactive (not archived)
  // Archived sessions should stay archived for potential out-of-order messages
  if (previousActiveId && previousActiveId !== sessionIdToPromote) {
    const previousActive = await localChatStorage.getSession(previousActiveId)
    if (previousActive && previousActive.status === 'active') {
      previousActive.status = 'inactive'
      previousActive.updatedAt = now()
      await localChatStorage.storeSession(previousActive)
      record.sessions.set(previousActive.id, previousActive)
    }
  }
  
  // Promote the new session
  sessionToPromote.status = 'active'
  sessionToPromote.updatedAt = now()
  
  // Clear archive metadata if it was archived
  if (sessionToPromote.archivedAt) {
    sessionToPromote.archivedAt = undefined
    sessionToPromote.archiveReason = undefined
  }
  
  await localChatStorage.storeSession(sessionToPromote)
  record.sessions.set(sessionToPromote.id, sessionToPromote)
  
  // Update the record's active session ID
  record.activeSessionId = sessionIdToPromote
  record.updatedAt = now()
  
  // Also update device record if applicable
  const deviceId = sessionToPromote.remoteDeviceId || DEFAULT_DEVICE_ID
  const deviceRecord = record.deviceRecords.get(deviceId)
  if (deviceRecord) {
    // Move previous active to inactive list if needed
    if (deviceRecord.activeSessionId && 
        deviceRecord.activeSessionId !== sessionIdToPromote &&
        !deviceRecord.inactiveSessionIds.includes(deviceRecord.activeSessionId)) {
      deviceRecord.inactiveSessionIds.push(deviceRecord.activeSessionId)
    }
    
    // Remove from inactive list if it was there
    deviceRecord.inactiveSessionIds = deviceRecord.inactiveSessionIds.filter(
      id => id !== sessionIdToPromote
    )
    
    deviceRecord.activeSessionId = sessionIdToPromote
    deviceRecord.lastActivityAt = now()
    record.deviceRecords.set(deviceId, deviceRecord)
  }
  
  await localChatStorage.storeSessionRecord(record)
}

/**
 * Establish session as responder and decrypt an initial message
 * This is called when receiving a message with X3DH data from a new contact
 */
export async function establishSessionAndDecrypt(
  localIdentity: ChatIdentityWithKeys,
  localPrivateBundle: PrivateKeyBundle,
  encrypted: EncryptedMessage,
  senderIdentityId: string,
  authenticatedSenderBundle?: PublicKeyBundle,
): Promise<{
  session: Session
  sessionRecord: SessionRecord
  decrypted: DecryptedMessage
  privateBundle: PrivateKeyBundle
  publicBundle?: PublicKeyBundle
}> {
  if (!encrypted.x3dhData) {
    throw new SessionError('Message does not contain X3DH data for session establishment')
  }

  if (!encrypted.metadata) {
    throw new CryptoError('Message metadata is required for security validation')
  }
  if (!encrypted.metadata.messageId) {
    throw new CryptoError('Message ID is required for replay protection')
  }
  if (encrypted.metadata.timestamp === undefined || encrypted.metadata.timestamp === null) {
    throw new CryptoError('Message timestamp is required')
  }
  if (encrypted.metadata.sequenceNumber === undefined || encrypted.metadata.sequenceNumber === null) {
    throw new CryptoError('Message sequence number is required for ordering validation')
  }
  
  // Check for replay before doing expensive crypto
  if (encrypted.metadata?.messageId) {
    const isProcessed = await localChatStorage.isMessageProcessed(encrypted.metadata.messageId)
    if (isProcessed) {
      throw new ReplayError(`Message ${encrypted.metadata.messageId} has already been processed (replay attempt)`)
    }
  }
  
  // Get our public key bundle for the ML-KEM identity key
  const ourBundle = await localChatStorage.getPublicKeyBundle(localIdentity.id)
  if (!ourBundle) {
    throw new SessionError('Cannot find our own key bundle')
  }

  const senderBundle = authenticatedSenderBundle
    ?? await localChatStorage.getPublicKeyBundle(senderIdentityId)
  assertX3DHSenderMatchesBundle(encrypted.x3dhData, senderIdentityId, senderBundle)
  
  // Include ML-DSA-65 in the responder identity binding.
  const x3dhResult = await x3dhResponder(
    {
      initiatorIdentityKey: encrypted.x3dhData.initiatorIdentityKey,
      initiatorEphemeralKey: encrypted.x3dhData.ephemeralKey,
      mlkemCiphertext: encrypted.x3dhData.mlkemCiphertext,
      usedOneTimePreKeyId: encrypted.x3dhData.usedOneTimePreKeyId,
      usedSignedPreKeyId: encrypted.x3dhData.usedSignedPreKeyId,
      initiatorDilithiumKey: encrypted.x3dhData.initiatorDilithiumKey,
      bundleTimestamp: encrypted.x3dhData.bundleTimestamp
    },
    localPrivateBundle.identityPrivateKey,
    localIdentity.identityPublicKey,
    localIdentity.dilithiumPublicKey, // ML-DSA-65 key, added for identity binding
    ourBundle.mlkemIdentityKey,
    localPrivateBundle.signedPreKeyPrivate,
    localPrivateBundle.mlkemSignedPreKeyPrivate,
    localPrivateBundle.oneTimePreKeyPrivates,
    localPrivateBundle.mlkemOneTimePreKeyPrivates,
    ourBundle,
    localPrivateBundle
  )
  
  const responderSignedPreKey = getResponderSignedPreKeyPair(
    encrypted.x3dhData.usedSignedPreKeyId,
    ourBundle,
    localPrivateBundle,
  )

  // Initialize Double Ratchet session as responder
  // Use the signed pre-key selected by the X3DH bootstrap.
  // Pass the initiator's ephemeral key to derive the header decryption key.
  const sessionState = initSessionAsResponder(
    x3dhResult.sharedSecret,
    responderSignedPreKey,
    encrypted.x3dhData.ephemeralKey // Required for header key derivation
  )
  
  const currentTime = now()
  
  // Create session with identity binding
  const session: Session = {
    id: generateUUID(),
    localIdentityId: localIdentity.id,
    remoteIdentityId: senderIdentityId,
    remoteDeviceId: DEFAULT_DEVICE_ID,
    state: sessionState,
    status: 'active',
    baseKeyFingerprint: x3dhResult.sessionFingerprint,
    boundIdentityKey: encrypted.x3dhData.initiatorIdentityKey,
    boundDilithiumKey: encrypted.x3dhData.initiatorDilithiumKey,
    // Bind AEAD to the X3DH transcript.
    boundAssociatedData: bytesToBase64(x3dhResult.associatedData),
    createdAt: currentTime,
    updatedAt: currentTime,
    unansweredMessages: 0,
    maxUnansweredMessages: MAX_UNANSWERED_MESSAGES,
    isStale: false
  }
  
  // Decrypt against the established session context.
  let content: string
  try {
    content = await ratchetDecrypt(
      session.state,
      encrypted,
      encrypted.x3dhData.initiatorDilithiumKey,
      {
        associatedData: x3dhResult.associatedData,
        validateAuthenticatedData: () => validateAuthenticatedMessageMetadata(session, encrypted)
      }
    )
  } catch (decryptError) {
    throw createX3DHBootstrapFailure(
      decryptError,
      encrypted,
      'responder_decrypt',
      encrypted.header?.sessionFingerprint ?? x3dhResult.sessionFingerprint,
    )
  }

  validateAuthenticatedMessageMetadata(session, encrypted)

  const decryptedAt = now()
  session.updatedAt = decryptedAt
  session.lastMessageAt = decryptedAt
  session.lastReceivedAt = decryptedAt

  // Stage responder changes for the atomic inbound commit.
  let latestPrivateBundle = localPrivateBundle
  let latestPublicBundle: PublicKeyBundle | undefined

  if (encrypted.x3dhData.usedOneTimePreKeyId !== undefined) {
    const { bundle: newBundle, privateBundle: newPrivateBundle } = consumeOneTimePreKey(
      ourBundle,
      localPrivateBundle,
      encrypted.x3dhData.usedOneTimePreKeyId
    )

    latestPrivateBundle = newPrivateBundle
    latestPublicBundle = newBundle

    // Replenish OPKs if running low
    if (newBundle.oneTimePreKeys.length < 20) {
      const { bundle: refreshedBundle, privateBundle: refreshedPrivateBundle } = replenishOneTimePreKeys(
        newBundle,
        latestPrivateBundle,
        100
      )
      latestPrivateBundle = refreshedPrivateBundle
      latestPublicBundle = refreshedBundle
    }
  }
  const sessionRecord = await stageInboundSessionRecord(session)
  
  const decrypted: DecryptedMessage = {
    id: encrypted.metadata?.messageId || generateUUID(),
    conversationId: '', // Set by caller
    senderId: senderIdentityId,
    content,
    timestamp: encrypted.metadata?.timestamp || now(),
    signatureVerified: true,
    sequenceNumber: encrypted.metadata?.sequenceNumber
  }
  
  return {
    session,
    sessionRecord,
    decrypted,
    privateBundle: latestPrivateBundle,
    publicBundle: latestPublicBundle,
  }
}

// Session Utilities

/**
 * Check if session can send messages
 * Session must not be older than MAX_SESSION_AGE_FOR_SEND from last activity.
 */
export function sessionCanSend(session: Session): boolean {
  if (!canSend(session.state)) return false
  
  // Check session age against the configured send window.
  const currentTime = now()
  const lastActivity = session.lastMessageAt || session.createdAt
  if (currentTime - lastActivity > MAX_SESSION_AGE_FOR_SEND) {
    return false
  }
  
  return true
}

/**
 * Check if session can receive messages
 * Session must not be older than MAX_SESSION_AGE_FOR_RECV.
 */
export function sessionCanReceive(session: Session): boolean {
  if (!canReceive(session.state)) return false
  
  // Check session age against the configured receive window.
  const currentTime = now()
  if (currentTime - session.createdAt > MAX_SESSION_AGE_FOR_RECV) {
    return false
  }
  
  return true
}

/**
 * Check if session needs re-establishment
 */
export function sessionNeedsReestablishment(session: Session): boolean {
  // Check for too many unanswered messages
  if (needsReestablishment(session.state, session.maxUnansweredMessages)) {
    return true
  }
  
  // Check for session age (Sesame MAXSEND)
  const currentTime = now()
  const lastActivity = session.lastMessageAt || session.createdAt
  if (currentTime - lastActivity > MAX_SESSION_AGE_FOR_SEND) {
    return true
  }
  
  return false
}

/**
 * Get session fingerprint for verification
 */
export function getSessionFingerprint(session: Session): string {
  return session.baseKeyFingerprint
}

/**
 * Delete a session securely
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const session = await localChatStorage.getSession(sessionId)
  if (!session) return
  
  // Securely clear the session state
  securelyDeleteSessionState(session.state)
  
  // Remove from storage
  await localChatStorage.deleteSession(sessionId)
  
  // Update session record
  const record = await localChatStorage.getSessionRecord(session.remoteIdentityId)
  if (record) {
    record.sessions.delete(sessionId)
    
    // If this was the active session, pick a new one
    if (record.activeSessionId === sessionId) {
      const remainingSessions = Array.from(record.sessions.values())
      if (remainingSessions.length > 0) {
        // Pick the most recently updated session
        remainingSessions.sort((a, b) => b.updatedAt - a.updatedAt)
        record.activeSessionId = remainingSessions[0].id
        remainingSessions[0].status = 'active'
        await localChatStorage.storeSession(remainingSessions[0])
      } else {
        record.activeSessionId = null
      }
    }
    
    record.updatedAt = now()
    await localChatStorage.storeSessionRecord(record)
  }
}

/**
 * Delete all sessions for a remote identity
 */
export async function deleteAllSessions(remoteIdentityId: string): Promise<void> {
  const sessions = await getAllSessionsForRemoteIdentity(remoteIdentityId)
  
  for (const session of sessions) {
    securelyDeleteSessionState(session.state)
    await localChatStorage.deleteSession(session.id)
  }
  
  // Clear session record
  const record = await localChatStorage.getSessionRecord(remoteIdentityId)
  if (record) {
    record.sessions.clear()
    record.activeSessionId = null
    record.updatedAt = now()
    await localChatStorage.storeSessionRecord(record)
  }
}

/**
 * Cleanup old processed messages
 */
export async function cleanupProcessedMessages(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  return localChatStorage.cleanupProcessedMessages(maxAgeMs)
}

/**
 * Get session statistics
 */
export interface SessionStats {
  totalSessions: number
  activeSessions: number
  inactiveSessions: number
  pendingSessions: number
  expiredSessions: number
}

export async function getSessionStats(remoteIdentityId: string): Promise<SessionStats> {
  const sessions = await getAllSessionsForRemoteIdentity(remoteIdentityId)
  
  const stats: SessionStats = {
    totalSessions: sessions.length,
    activeSessions: 0,
    inactiveSessions: 0,
    pendingSessions: 0,
    expiredSessions: 0
  }
  
  for (const session of sessions) {
    switch (session.status) {
      case 'active':
        stats.activeSessions++
        break
      case 'inactive':
        stats.inactiveSessions++
        break
      case 'pending':
        stats.pendingSessions++
        break
      case 'expired':
        stats.expiredSessions++
        break
    }
  }
  
  return stats
}
