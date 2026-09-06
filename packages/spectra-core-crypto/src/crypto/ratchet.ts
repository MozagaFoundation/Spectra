/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Double Ratchet Protocol Implementation
 * 
 * Implements Double Ratchet state transitions for forward secrecy,
 * break-in recovery, and out-of-order message handling.
 * 
 * Key features:
 * - Forward secrecy: Compromise of current keys doesn't reveal past messages
 * - Break-in recovery: Future messages remain secure after key compromise
 * - Out-of-order message handling via skipped message keys
 * - Header encryption for metadata protection
 * - Proper skipped key expiration and secure deletion
 */

import type { 
  SessionState, 
  MessageHeader, 
  EncryptedMessage,
  EncryptedHeader,
  SkippedMessageKey,
  MessageMetadata
} from '../types/index'
import { CryptoError, SessionError } from '../types/index'
import { generateX25519KeyPair, x25519DH } from './x25519'
import { encryptMessage, decryptMessage } from './aes'
import { signWithDilithiumAsync as dilithiumSignAsync, verifyDilithiumSignatureAsync as dilithiumVerifyAsync } from './dilithium'
import { 
  deriveKey,
  kdfRoot, 
  kdfChain,
  kdfHeaderKey,
  createKeyId, 
  parseKeyId,
  stringToBytes, 
  bytesToBase64, 
  base64ToBytes,
  concatBytes,
  bytesToString,
  secureZero,
  now,
  isExpired,
  generateUUID
} from './utils'
import { PROTOCOL_VERSIONS, assertExactVersion } from './protocolVersion'

// Protocol Constants

const MAX_SKIP = 2000 // Maximum number of message keys to skip
const MAX_SKIPPED_KEYS = 2000 // Maximum skipped keys to store
const SKIPPED_KEY_EXPIRATION = 30 * 24 * 60 * 60 * 1000 // 30 days
const PROTOCOL_VERSION = PROTOCOL_VERSIONS.doubleRatchetMessage
const SESSION_STATE_SCHEMA_VERSION = 2

function deriveInitialHeaderKeys(
  dhOutput: Uint8Array
): { headerKey: Uint8Array; nextHeaderKey: Uint8Array } {
  const info = stringToBytes('QuantumChat_HeaderKDF_v2')
  const salt = new Uint8Array(32).fill(0xFF)
  const derived = deriveKey(dhOutput, salt, info, 64)
  
  return {
    headerKey: derived.slice(0, 32),
    nextHeaderKey: derived.slice(32, 64)
  }
}

// Session Initialization

/**
 * Create initial session state
 */
function createInitialState(): SessionState {
  return {
    remoteRatchetKey: null,
    localRatchetKeyPair: null,
    rootKey: new Uint8Array(32),
    sendingChainKey: null,
    receivingChainKey: null,
    previousSendingChainLength: 0,
    skippedMessageKeys: new Map(),
    sentMessageCount: 0,
    receivedMessageCount: 0,
    receivedFirstMessage: false,
    createdAt: now(),
    lastActivityAt: now(),
    // Header encryption keys
    // HKs, HKr = current header keys
    // NHKs, NHKr = next header keys (promoted to current during DH ratchet)
    sendingHeaderKey: null,
    receivingHeaderKey: null,
    nextSendingHeaderKey: null,
    nextReceivingHeaderKey: null,
    previousReceivingHeaderKey: null
  }
}

/**
 * Initialize a new session state for the initiator (Alice)
 * Called after X3DH completes
 * 
 * Also derives initial header encryption keys from the DH ratchet step,
 * not from chain keys.
 * 
 * For the initial message, the X3DH ephemeral key should be used as the first
 * ratchet key. This allows the responder to derive the matching header
 * decryption key using only the X3DH data.
 * 
 * @param sharedSecret - The X3DH shared secret
 * @param remoteRatchetKey - The responder's signed pre-key (initial remote ratchet key)
 * @param initialRatchetKeyPair - Optional first ratchet key pair.
 */
export function initSessionAsInitiator(
  sharedSecret: Uint8Array,
  remoteRatchetKey: string,
  initialRatchetKeyPair?: { publicKey: string; privateKey: string }
): SessionState {
  const state = createInitialState()
  
  // Use provided key pair or generate new one
  // For proper header key derivation, the X3DH ephemeral key should be passed here
  const ratchetKeyPair = initialRatchetKeyPair || generateX25519KeyPair()
  
  // Perform initial DH ratchet step
  const dhOutput = x25519DH(ratchetKeyPair.privateKey, remoteRatchetKey)
  const { rootKey, chainKey } = kdfRoot(sharedSecret, dhOutput)
  
  
  state.remoteRatchetKey = remoteRatchetKey
  state.localRatchetKeyPair = ratchetKeyPair
  state.rootKey = rootKey
  state.sendingChainKey = { key: chainKey, index: 0 }
  state.receivingChainKey = null // Will be set on first received message
  
  // Derive initial header keys from the DH output.
  // Header keys are derived from a separate branch of the key tree
  const { headerKey, nextHeaderKey } = deriveInitialHeaderKeys(dhOutput)
  state.sendingHeaderKey = headerKey
  state.nextReceivingHeaderKey = nextHeaderKey
  
  return state
}

/**
 * Initialize a new session state for the responder (Bob)
 * Called after X3DH completes
 * 
 * The initiator's ephemeral public key is required to derive the initial
 * header decryption key.
 * 
 * Initial header key derivation:
 * - Initiator derives header keys from DH(ephemeralKey, SPK_responder)
 * - Responder must compute the same DH to derive matching header keys
 * - The initiator's ephemeral key comes from the X3DH header data
 */
export function initSessionAsResponder(
  sharedSecret: Uint8Array,
  ourSignedPreKeyPair: { publicKey: string; privateKey: string },
  initiatorEphemeralKey: string
): SessionState {
  const state = createInitialState()
  
  state.localRatchetKeyPair = ourSignedPreKeyPair
  state.sendingChainKey = null // Will be set after first DH ratchet when we send
  
  if (!initiatorEphemeralKey) {
    throw new SessionError('Responder initialization requires initiator ephemeral key')
  }

  state.remoteRatchetKey = initiatorEphemeralKey
  
  // Compute DH(ourSPK_private, initiatorEphemeralKey)
  // This matches what the initiator computed as DH(ephemeralPrivate, ourSPK_public)
  const dhOutput = x25519DH(ourSignedPreKeyPair.privateKey, initiatorEphemeralKey)
  
  // Derive the RECEIVING chain key from the DH output
  // The initiator used this same DH to derive their SENDING chain key
  // We need to derive from the X3DH shared secret combined with this DH output
  const { rootKey, chainKey } = kdfRoot(sharedSecret, dhOutput)
  state.rootKey = rootKey
  state.receivingChainKey = { key: chainKey, index: 0 }
  
  // Derive header keys. The next header key from this DH becomes our first
  // sending header key, matching the initiator's first reply expectation.
  const { headerKey, nextHeaderKey } = deriveInitialHeaderKeys(dhOutput)
  state.receivingHeaderKey = headerKey
  state.nextReceivingHeaderKey = nextHeaderKey
  
  // Use the matching first-reply header key for our initial response.
  state.sendingHeaderKey = nextHeaderKey
  
  secureZero(dhOutput)
  
  return state
}

// Skipped Message Key Management

/**
 * Clean up expired skipped message keys
 */
export function cleanupExpiredKeys(state: SessionState): number {
  let removed = 0
  
  for (const [keyId, key] of state.skippedMessageKeys.entries()) {
    if (isExpired(key.expiresAt)) {
      // Securely zero the key before removing
      secureZero(key.key)
      state.skippedMessageKeys.delete(keyId)
      removed++
    }
  }
  
  return removed
}

/**
 * Remove oldest skipped keys when over limit (secure LIFO with expiration check)
 */
function enforceSkippedKeyLimit(state: SessionState, maxKeys: number = MAX_SKIPPED_KEYS): void {
  // First, clean up expired keys
  cleanupExpiredKeys(state)
  
  // If still over limit, remove oldest by storedAt timestamp
  while (state.skippedMessageKeys.size > maxKeys) {
    let oldestKey: string | null = null
    let oldestTime = Infinity
    
    for (const [keyId, key] of state.skippedMessageKeys.entries()) {
      if (key.storedAt < oldestTime) {
        oldestTime = key.storedAt
        oldestKey = keyId
      }
    }
    
    if (oldestKey) {
      const key = state.skippedMessageKeys.get(oldestKey)
      if (key) {
        secureZero(key.key)
      }
      state.skippedMessageKeys.delete(oldestKey)
    } else {
      break
    }
  }
}

/**
 * Store a skipped message key
 */
function storeSkippedKey(
  state: SessionState,
  ratchetKey: string,
  messageNumber: number,
  messageKey: Uint8Array,
  expirationMs: number = SKIPPED_KEY_EXPIRATION
): void {
  const keyId = createKeyId(ratchetKey, messageNumber)
  const currentTime = now()
  
  state.skippedMessageKeys.set(keyId, {
    key: messageKey,
    index: messageNumber,
    ratchetKey,
    storedAt: currentTime,
    expiresAt: currentTime + expirationMs
  })
  
  // Enforce storage limit
  enforceSkippedKeyLimit(state)
}

/**
 * Skip message keys for out-of-order messages
 * Properly handles both current and previous receiving chains
 */
function skipMessageKeys(
  state: SessionState, 
  ratchetKey: string, 
  until: number
): void {
  if (!state.receivingChainKey) {
    throw new SessionError('No receiving chain key')
  }
  
  const toSkip = until - state.receivingChainKey.index
  
  if (toSkip > MAX_SKIP) {
    throw new SessionError(`Too many skipped messages: ${toSkip} (max: ${MAX_SKIP})`)
  }
  
  if (toSkip < 0) {
    // Message is from the past - might be in skipped keys
    return
  }
  
  // Skip keys and store them
  while (state.receivingChainKey.index < until) {
    const { chainKey, messageKey } = kdfChain(state.receivingChainKey.key)
    
    storeSkippedKey(
      state,
      ratchetKey,
      state.receivingChainKey.index,
      messageKey
    )
    
    state.receivingChainKey = {
      key: chainKey,
      index: state.receivingChainKey.index + 1
    }
  }
}

// Ratchet Operations

/**
 * Perform a DH ratchet step
 * Core Double Ratchet step.
 * 
 * When receiving a message with a new ratchet key:
 * 1. Derive the receiving chain from current local and new remote keys.
 * 2. Generate a new local ratchet key pair.
 * 3. Derive the sending chain from new local and remote keys.
 * 4. Update header encryption keys (derived from DH outputs, not chain keys)
 * 
 * This ensures both parties derive the same chain keys when communicating.
 */
function dhRatchet(state: SessionState, newRemoteRatchetKey: string): void {
  // Store previous sending chain length for header
  state.previousSendingChainLength = state.sendingChainKey?.index ?? 0
  
  // Update remote ratchet key
  state.remoteRatchetKey = newRemoteRatchetKey
  
  // Header key promotion happens first.
  // HKr ← NHKr (promote next receiving header key to current)
  // HKs ← NHKs (promote next sending header key to current)
  
  // Save previous receiving header key for out-of-order messages
  if (state.receivingHeaderKey) {
    if (state.previousReceivingHeaderKey) {
      secureZero(state.previousReceivingHeaderKey)
    }
    state.previousReceivingHeaderKey = state.receivingHeaderKey
  }
  
  // Promote header keys
  state.receivingHeaderKey = state.nextReceivingHeaderKey
  // NHKs becomes HKs - this is what we'll use to encrypt our next message
  // The peer derived this same key as their NHKr during their last ratchet
  const promotedSendingHeaderKey = state.nextSendingHeaderKey
  if (promotedSendingHeaderKey) {
    if (state.sendingHeaderKey) {
      secureZero(state.sendingHeaderKey)
    }
    state.sendingHeaderKey = promotedSendingHeaderKey
  }
  
  // Step 1: Derive receiving chain key using CURRENT (existing) local ratchet key
  // Also derive NHKs from this DH - this will be our NEXT sending header key
  // The peer will derive their NHKr from the same DH (when they receive our message)
  let dhOutputReceiving: Uint8Array | null = null
  if (state.localRatchetKeyPair) {
    dhOutputReceiving = x25519DH(state.localRatchetKeyPair.privateKey, newRemoteRatchetKey)
    const { rootKey, chainKey } = kdfRoot(state.rootKey, dhOutputReceiving)
    state.rootKey = rootKey
    state.receivingChainKey = { key: chainKey, index: 0 }
    
    // Derive NHKs (next sending header key) from receiving-side DH.
    // Use kdfHeaderKey (single key) to ensure both parties derive the same key
    // When peer does their receiving DH (same as our sending DH), they get their NHKr
    // NHKs comes from the receiving-side DH output.
    const newNHKs = kdfHeaderKey(dhOutputReceiving)
    state.nextSendingHeaderKey = newNHKs
  }
  
  // Step 2: Generate NEW ratchet key pair (for forward secrecy)
  const newKeyPair = generateX25519KeyPair()
  
  // JavaScript limits secure key deletion.
  if (state.localRatchetKeyPair) {
    const oldPrivateKeyBytes = base64ToBytes(state.localRatchetKeyPair.privateKey)
    secureZero(oldPrivateKeyBytes)
    state.localRatchetKeyPair = null as any
  }
  
  state.localRatchetKeyPair = newKeyPair
  
  // Step 3: Derive sending chain key using NEW local ratchet key
  // Also derive NHKr from this DH - this is what the peer will use to decrypt our messages
  // When the peer sends their next message, they'll use their HKs (promoted from their NHKs)
  // Their NHKs was derived from their receiving DH = our sending DH
  const dhOutputSending = x25519DH(state.localRatchetKeyPair.privateKey, newRemoteRatchetKey)
  const { rootKey, chainKey } = kdfRoot(state.rootKey, dhOutputSending)
  state.rootKey = rootKey
  state.sendingChainKey = { key: chainKey, index: 0 }
  
  // Derive NHKr (next receiving header key) from sending-side DH.
  // Use kdfHeaderKey (single key) for consistency
  // Peer's NHKs (from their receiving DH = our sending DH) will match our NHKr
  const newNHKr = kdfHeaderKey(dhOutputSending)
  state.nextReceivingHeaderKey = newNHKr
  
  // Securely zero DH outputs
  if (dhOutputReceiving) {
    secureZero(dhOutputReceiving)
  }
  secureZero(dhOutputSending)
}

// Header Encryption

/**
 * Encrypt a message header
 */
function encryptHeader(
  header: MessageHeader,
  headerKey: Uint8Array
): EncryptedHeader {
  const headerBytes = stringToBytes(JSON.stringify(header))
  const { ciphertext, nonce, tag } = encryptMessage(
    headerKey,
    bytesToString(headerBytes),
    new Uint8Array(0)
  )
  
  return { ciphertext, nonce, tag }
}

/**
 * Decrypt a message header
 */
function decryptHeader(
  encryptedHeader: EncryptedHeader,
  headerKey: Uint8Array
): MessageHeader {
  const headerStr = decryptMessage(
    headerKey,
    encryptedHeader.ciphertext,
    encryptedHeader.nonce,
    encryptedHeader.tag,
    new Uint8Array(0)
  )
  
  return JSON.parse(headerStr) as MessageHeader
}

// Message Encryption

/**
 * Create message metadata for signing and replay protection
 */
function createMetadata(
  senderId: string,
  recipientId: string,
  sessionId: string,
  sequenceNumber: number,
  previousMessageHash?: string
): MessageMetadata {
  return {
    messageId: generateUUID(),
    senderId,
    recipientId,
    sessionId,
    timestamp: now(),
    sequenceNumber,
    previousMessageHash
  }
}

/**
 * Normalize metadata to ensure consistent JSON serialization order
 * This is critical for signature verification - both sender and receiver
 * must serialize metadata in the exact same order.
 */
function normalizeMetadata(metadata: MessageMetadata): MessageMetadata {
  // Always use this exact field order for serialization
  return {
    messageId: metadata.messageId,
    senderId: metadata.senderId,
    recipientId: metadata.recipientId,
    sessionId: metadata.sessionId,
    timestamp: metadata.timestamp,
    sequenceNumber: metadata.sequenceNumber,
    previousMessageHash: metadata.previousMessageHash
  }
}

/**
 * Normalize header to ensure consistent JSON serialization order
 * This is critical for signature verification.
 */
function normalizeHeader(header: MessageHeader): MessageHeader {
  // Always use this exact field order for serialization
  return {
    ratchetKey: header.ratchetKey,
    messageNumber: header.messageNumber,
    previousChainLength: header.previousChainLength,
    sessionFingerprint: header.sessionFingerprint
  }
}

/**
 * Encrypt a message using the Double Ratchet
 */
export async function ratchetEncrypt(
  state: SessionState,
  plaintext: string,
  dilithiumPrivateKey: string,
  metadata: {
    senderId: string
    recipientId: string
    sessionId: string
    sequenceNumber: number
    previousMessageHash?: string
  },
  options: {
    enableHeaderEncryption?: boolean
    associatedData?: Uint8Array
    sessionFingerprint?: string // Include in header before signing
  } = {}
): Promise<EncryptedMessage> {
  // Ensure we have a sending chain
  if (!state.sendingChainKey || !state.localRatchetKeyPair) {
    throw new SessionError('Session not initialized for sending')
  }
  
  // Clean up expired keys periodically
  cleanupExpiredKeys(state)
  
  // Derive message key
  const { chainKey, messageKey } = kdfChain(state.sendingChainKey.key)
  
  // Create message header
  // Include the session fingerprint before signing so receiver verification
  // uses the same authenticated header.
  const header: MessageHeader = {
    ratchetKey: state.localRatchetKeyPair.publicKey,
    messageNumber: state.sendingChainKey.index,
    previousChainLength: state.previousSendingChainLength,
    sessionFingerprint: options.sessionFingerprint
  }
  
  // Create message metadata
  const messageMetadata = createMetadata(
    metadata.senderId,
    metadata.recipientId,
    metadata.sessionId,
    metadata.sequenceNumber,
    metadata.previousMessageHash
  )
  
  // Normalize metadata and header to ensure consistent field ordering for signature
  const normalizedMetadata = normalizeMetadata(messageMetadata)
  const normalizedHeader = normalizeHeader(header)
  
  // Create AD for AEAD: metadata || header
  const headerBytes = stringToBytes(JSON.stringify(normalizedHeader))
  const metadataBytes = stringToBytes(JSON.stringify(normalizedMetadata))
  const ad = options.associatedData 
    ? concatBytes(options.associatedData, metadataBytes, headerBytes)
    : concatBytes(metadataBytes, headerBytes)
  
  // Encrypt the message
  const { ciphertext, nonce, tag } = encryptMessage(messageKey, plaintext, ad)
  
  // Securely zero the message key after use
  secureZero(messageKey)

  // Encrypt header if enabled
  // Header encryption uses the DH-ratchet header key, not a message chain key.
  let encryptedHeader: EncryptedHeader | undefined
  if (options.enableHeaderEncryption && state.sendingHeaderKey) {
    encryptedHeader = encryptHeader(header, state.sendingHeaderKey)
  } else if (options.enableHeaderEncryption && !state.sendingHeaderKey) {
    throw new SessionError(
      'Cannot encrypt header: missing sending header key. ' +
      'Session may not be fully initialized.'
    )
  }

  const messageToSign = concatBytes(
    metadataBytes,
    headerBytes,
    base64ToBytes(ciphertext),
    base64ToBytes(nonce),
    base64ToBytes(tag)
  )

  const signature = await dilithiumSignAsync(messageToSign, dilithiumPrivateKey)

  state.sendingChainKey = {
    key: chainKey,
    index: state.sendingChainKey.index + 1
  }
  state.sentMessageCount++
  state.lastActivityAt = now()

  return {
    header: encryptedHeader ? undefined as unknown as MessageHeader : header,
    encryptedHeader,
    ciphertext,
    nonce,
    tag,
    signature,
    metadata: messageMetadata,
    version: PROTOCOL_VERSION
  }
}

// Message Decryption

/**
 * Try to decrypt using a skipped message key
 */
function trySkippedMessageKeys(
  state: SessionState,
  header: MessageHeader,
  ciphertext: string,
  nonce: string,
  tag: string,
  metadata: MessageMetadata,
  associatedData?: Uint8Array
): string | null {
  const keyId = createKeyId(header.ratchetKey, header.messageNumber)
  const skippedKey = state.skippedMessageKeys.get(keyId)
  
  if (!skippedKey) {
    return null
  }
  
  // Check if key is expired
  if (isExpired(skippedKey.expiresAt)) {
    secureZero(skippedKey.key)
    state.skippedMessageKeys.delete(keyId)
    return null
  }
  
  // Create AD for AEAD using the same canonical field order as encryption.
  const headerBytes = stringToBytes(JSON.stringify(normalizeHeader(header)))
  const metadataBytes = stringToBytes(JSON.stringify(normalizeMetadata(metadata)))
  const ad = associatedData 
    ? concatBytes(associatedData, metadataBytes, headerBytes)
    : concatBytes(metadataBytes, headerBytes)
  
  // Decrypt
  const plaintext = decryptMessage(skippedKey.key, ciphertext, nonce, tag, ad)
  
  // Securely remove used key
  secureZero(skippedKey.key)
  state.skippedMessageKeys.delete(keyId)
  
  return plaintext
}

/**
 * Try to decrypt a header with multiple header keys
 * Returns the decrypted header and which key succeeded
 */
function tryDecryptHeader(
  encryptedHeader: EncryptedHeader,
  state: SessionState
): { header: MessageHeader; usedPreviousKey: boolean } | null {
  // Try current receiving header key first
  if (state.receivingHeaderKey) {
    try {
      const header = decryptHeader(encryptedHeader, state.receivingHeaderKey)
      return { header, usedPreviousKey: false }
    } catch {
      // Continue to try other keys
    }
  }
  
  // Try previous receiving header key (for out-of-order messages)
  if (state.previousReceivingHeaderKey) {
    try {
      const header = decryptHeader(encryptedHeader, state.previousReceivingHeaderKey)
      return { header, usedPreviousKey: true }
    } catch {
      // Continue to try next header key
    }
  }
  
  // Try next header key (might be a message from a new ratchet step)
  if (state.nextReceivingHeaderKey) {
    try {
      const header = decryptHeader(encryptedHeader, state.nextReceivingHeaderKey)
      return { header, usedPreviousKey: false }
    } catch {
      // All keys failed
    }
  }
  
  return null
}

/**
 * Decrypt a message using the Double Ratchet
 * 
 * Uses the DH-ratchet header key chain instead of keys derived from the
 * message chain.
 */
export async function ratchetDecrypt(
  state: SessionState,
  encrypted: EncryptedMessage,
  senderDilithiumPublicKey: string,
  options: {
    enableHeaderEncryption?: boolean
    associatedData?: Uint8Array
    validateAuthenticatedData?: (metadata: MessageMetadata, header: MessageHeader) => void
  } = {}
): Promise<string> {
  let { header } = encrypted
  const { ciphertext, nonce, tag, signature, metadata } = encrypted
  try {
    assertExactVersion('Double Ratchet message', encrypted.version, PROTOCOL_VERSION)
  } catch (error) {
    throw new CryptoError((error as Error).message, error)
  }
  
  // Validate required fields
  if (!ciphertext || !nonce || !tag || !signature || !metadata) {
    throw new CryptoError('Invalid encrypted message format - missing required fields')
  }
  
  // Decrypt header if encrypted
  if (encrypted.encryptedHeader) {
    // Try using state header keys first.
    const headerDecryptResult = tryDecryptHeader(encrypted.encryptedHeader, state)
    
    if (headerDecryptResult) {
      header = headerDecryptResult.header
    } else {
      throw new CryptoError('Failed to decrypt message header - no valid header key found')
    }
  } else if (!header) {
    throw new CryptoError('Invalid encrypted message format - missing message header')
  }

  if (!header) {
    throw new CryptoError('Invalid encrypted message format - missing message header')
  }
  
  // Match sender-side field ordering before signature verification.
  const normalizedMetadata = normalizeMetadata(metadata)
  const normalizedHeader = normalizeHeader(header)
  
  // Verify the ML-DSA-65 signature first.
  const headerBytes = stringToBytes(JSON.stringify(normalizedHeader))
  const metadataBytes = stringToBytes(JSON.stringify(normalizedMetadata))
  
  const messageToVerify = concatBytes(
    metadataBytes,
    headerBytes,
    base64ToBytes(ciphertext),
    base64ToBytes(nonce),
    base64ToBytes(tag)
  )
  
  const signatureValid = await dilithiumVerifyAsync(messageToVerify, signature, senderDilithiumPublicKey)
  
  if (!signatureValid) {
    throw new CryptoError('Message signature verification failed')
  }

  options.validateAuthenticatedData?.(metadata, header)
  
  // Clean up expired keys
  cleanupExpiredKeys(state)
  
  // Try skipped message keys first
  const skippedResult = trySkippedMessageKeys(
    state, 
    header, 
    ciphertext, 
    nonce, 
    tag,
    metadata,
    options.associatedData
  )
  if (skippedResult !== null) {
    state.receivedMessageCount++
    state.lastActivityAt = now()
    return skippedResult
  }
  
  // Check if we need to perform a DH ratchet (new ratchet key from sender)
  const needsRatchet = header.ratchetKey !== state.remoteRatchetKey
  
    // Initialize the sending chain if responder has not sent yet.
  // After receiving the first message, the responder needs a sending chain to reply
  const needsSendingChainInit = !state.sendingChainKey && state.localRatchetKeyPair
  
  if (needsRatchet) {
    // Skip any remaining message keys from the PREVIOUS receiving chain
    // before switching to the new one
    if (state.receivingChainKey && state.remoteRatchetKey) {
      // previousChainLength tells us total messages sent in sender's previous chain
      // We should skip keys from our current index up to that length
      // Only skip if there are actually messages to skip (previousChainLength > our index)
      const skipUntil = header.previousChainLength
      if (skipUntil > state.receivingChainKey.index) {
        skipMessageKeys(state, state.remoteRatchetKey, skipUntil)
      }
    }
    
    // Perform DH ratchet with new remote key
    dhRatchet(state, header.ratchetKey)
  } else if (needsSendingChainInit) {
    // Responder received first message but hasn't set up sending chain yet
    // Generate new ratchet key pair and derive sending chain
    
    // Generate a NEW ratchet key pair for the responder to use when sending
    const newKeyPair = generateX25519KeyPair()
    
    // Save the current local ratchet key pair (the SPK) for reference
    const oldKeyPair = state.localRatchetKeyPair
    state.localRatchetKeyPair = newKeyPair
    state.previousSendingChainLength = 0
    
    // Derive sending chain from DH(new_local_private, remote_ratchet_key)
    const dhOutputSending = x25519DH(newKeyPair.privateKey, state.remoteRatchetKey!)
    const { rootKey, chainKey } = kdfRoot(state.rootKey, dhOutputSending)
    state.rootKey = rootKey
    state.sendingChainKey = { key: chainKey, index: 0 }
    
    // Keep the responder header key for the first reply.
    // 
    // The next full DH ratchet updates header keys.
    //
    // Derive NHKr to match the initiator's symmetric receiving DH.
    const newNHKr = kdfHeaderKey(dhOutputSending)
    state.nextReceivingHeaderKey = newNHKr
    
    // Zero old key pair
    if (oldKeyPair) {
      const oldPrivateKeyBytes = base64ToBytes(oldKeyPair.privateKey)
      secureZero(oldPrivateKeyBytes)
    }
    secureZero(dhOutputSending)
  }
  
  // Skip message keys in CURRENT receiving chain if needed
  if (state.receivingChainKey && header.messageNumber > state.receivingChainKey.index) {
    skipMessageKeys(state, header.ratchetKey, header.messageNumber)
  }
  
  // Derive message key
  if (!state.receivingChainKey) {
    throw new SessionError('No receiving chain key after ratchet')
  }
  
  const { chainKey, messageKey } = kdfChain(state.receivingChainKey.key)
  
  // Create AD for AEAD
  const ad = options.associatedData 
    ? concatBytes(options.associatedData, metadataBytes, headerBytes)
    : concatBytes(metadataBytes, headerBytes)
  
  // Decrypt
  const plaintext = decryptMessage(messageKey, ciphertext, nonce, tag, ad)
  
  // Securely zero the message key after use
  secureZero(messageKey)
  
  // Update receiving chain
  state.receivingChainKey = {
    key: chainKey,
    index: state.receivingChainKey.index + 1
  }
  
  state.receivedFirstMessage = true
  state.receivedMessageCount++
  state.lastActivityAt = now()
  
  return plaintext
}

// Session Serialization

/**
 * Serialize session state for storage
 * Note: This should be encrypted before persisting
 */
export function serializeSessionState(state: SessionState): string {
  const skippedKeysArray = Array.from(state.skippedMessageKeys.entries()).map(
    ([id, key]) => ({
      id,
      key: bytesToBase64(key.key),
      index: key.index,
      ratchetKey: key.ratchetKey,
      storedAt: key.storedAt,
      expiresAt: key.expiresAt
    })
  )
  
  const serializable = {
    _schemaVersion: SESSION_STATE_SCHEMA_VERSION,
    remoteRatchetKey: state.remoteRatchetKey,
    localRatchetKeyPair: state.localRatchetKeyPair,
    rootKey: bytesToBase64(state.rootKey),
    sendingChainKey: state.sendingChainKey ? {
      key: bytesToBase64(state.sendingChainKey.key),
      index: state.sendingChainKey.index
    } : null,
    receivingChainKey: state.receivingChainKey ? {
      key: bytesToBase64(state.receivingChainKey.key),
      index: state.receivingChainKey.index
    } : null,
    previousSendingChainLength: state.previousSendingChainLength,
    skippedMessageKeys: skippedKeysArray,
    sentMessageCount: state.sentMessageCount,
    receivedMessageCount: state.receivedMessageCount,
    receivedFirstMessage: state.receivedFirstMessage,
    createdAt: state.createdAt,
    lastActivityAt: state.lastActivityAt,
    sendingHeaderKey: state.sendingHeaderKey ? bytesToBase64(state.sendingHeaderKey) : null,
    receivingHeaderKey: state.receivingHeaderKey ? bytesToBase64(state.receivingHeaderKey) : null,
    nextSendingHeaderKey: state.nextSendingHeaderKey ? bytesToBase64(state.nextSendingHeaderKey) : null,
    nextReceivingHeaderKey: state.nextReceivingHeaderKey ? bytesToBase64(state.nextReceivingHeaderKey) : null,
    previousReceivingHeaderKey: state.previousReceivingHeaderKey ? bytesToBase64(state.previousReceivingHeaderKey) : null
  }
  
  return JSON.stringify(serializable)
}

/**
 * Validate that a base64 string decodes to a valid Uint8Array key.
 * Returns the decoded bytes or null if invalid.
 */
function safeBase64ToBytes(value: unknown): Uint8Array | null {
  if (typeof value !== 'string' || value.length === 0) return null
  try {
    const bytes = base64ToBytes(value)
    if (bytes.length === 0) return null
    return bytes
  } catch {
    return null
  }
}

/**
 * Deserialize session state from storage.
 * Handles both current schema (v2) and legacy unversioned formats.
 * Throws if the data is irrecoverably corrupt.
 */
export function deserializeSessionState(serialized: string): SessionState {
  let parsed: any
  try {
    parsed = JSON.parse(serialized)
  } catch {
    throw new SessionError('Session state is not valid JSON — session must be re-established')
  }

  // --- rootKey is mandatory; without it the session is dead ---
  const rootKey = safeBase64ToBytes(parsed.rootKey)
  if (!rootKey || rootKey.length !== 32) {
    throw new SessionError('Session state has invalid rootKey — session must be re-established')
  }

  // --- Chain keys (optional but validated if present) ---
  let sendingChainKey: { key: Uint8Array; index: number } | null = null
  if (parsed.sendingChainKey) {
    const key = safeBase64ToBytes(parsed.sendingChainKey.key)
    if (key) {
      sendingChainKey = { key, index: parsed.sendingChainKey.index ?? 0 }
    }
  }

  let receivingChainKey: { key: Uint8Array; index: number } | null = null
  if (parsed.receivingChainKey) {
    const key = safeBase64ToBytes(parsed.receivingChainKey.key)
    if (key) {
      receivingChainKey = { key, index: parsed.receivingChainKey.index ?? 0 }
    }
  }

  // --- Local ratchet key pair (validated) ---
  let localRatchetKeyPair = parsed.localRatchetKeyPair
  if (localRatchetKeyPair) {
    if (typeof localRatchetKeyPair.publicKey !== 'string' ||
        typeof localRatchetKeyPair.privateKey !== 'string' ||
        localRatchetKeyPair.publicKey.length === 0 ||
        localRatchetKeyPair.privateKey.length === 0) {
      localRatchetKeyPair = null
    }
  }

  // --- Skipped message keys (tolerant of corrupt entries) ---
  const skippedMessageKeys = new Map<string, SkippedMessageKey>()
  for (const item of parsed.skippedMessageKeys || []) {
    try {
      const key = safeBase64ToBytes(item.key)
      if (!key) continue
      skippedMessageKeys.set(item.id, {
        key,
        index: item.index,
        ratchetKey: item.ratchetKey || parseKeyId(item.id).ratchetKey,
        storedAt: item.storedAt || now(),
        expiresAt: item.expiresAt || (now() + SKIPPED_KEY_EXPIRATION)
      })
    } catch {
      // Skip corrupt entries instead of failing the whole deserialization
    }
  }

  // --- Header keys (added in schema v1, always optional) ---
  const sendingHeaderKey = safeBase64ToBytes(parsed.sendingHeaderKey)
  const receivingHeaderKey = safeBase64ToBytes(parsed.receivingHeaderKey)
  const nextSendingHeaderKey = safeBase64ToBytes(parsed.nextSendingHeaderKey)
  const nextReceivingHeaderKey = safeBase64ToBytes(parsed.nextReceivingHeaderKey)
  const previousReceivingHeaderKey = safeBase64ToBytes(parsed.previousReceivingHeaderKey)

  return {
    remoteRatchetKey: typeof parsed.remoteRatchetKey === 'string' ? parsed.remoteRatchetKey : null,
    localRatchetKeyPair,
    rootKey,
    sendingChainKey,
    receivingChainKey,
    previousSendingChainLength: parsed.previousSendingChainLength ?? 0,
    skippedMessageKeys,
    sentMessageCount: parsed.sentMessageCount ?? 0,
    receivedMessageCount: parsed.receivedMessageCount ?? 0,
    receivedFirstMessage: !!parsed.receivedFirstMessage,
    createdAt: parsed.createdAt || now(),
    lastActivityAt: parsed.lastActivityAt || now(),
    sendingHeaderKey,
    receivingHeaderKey,
    nextSendingHeaderKey,
    nextReceivingHeaderKey,
    previousReceivingHeaderKey
  }
}

/**
 * Securely clear a session state (zero all sensitive data)
 * 
 * JavaScript platform constraints:
 * - JavaScript strings are immutable and cannot be securely overwritten
 * - The base64-encoded private key strings may persist in memory until garbage collection
 * - JIT compiler optimizations may skip "dead" writes in some cases
 * - Garbage collector timing is non-deterministic
 * 
 * This function does its best within these constraints:
 * - Zeros all Uint8Array key material (raw bytes)
 * - Nulls object references to help GC collect sooner
 * - Clears collections to release references
 * 
 * For production security-critical deployments, consider:
 * - WebCrypto API with non-exportable keys
 * - WebAssembly with explicit memory management
 * - Hardware security modules or secure enclaves
 */
export function securelyDeleteSessionState(state: SessionState): void {
  // Zero root key
  secureZero(state.rootKey)
  
  // Zero chain keys
  if (state.sendingChainKey) {
    secureZero(state.sendingChainKey.key)
    state.sendingChainKey = null
  }
  if (state.receivingChainKey) {
    secureZero(state.receivingChainKey.key)
    state.receivingChainKey = null
  }
  
  // Zero all skipped message keys
  for (const [, key] of state.skippedMessageKeys) {
    secureZero(key.key)
  }
  state.skippedMessageKeys.clear()
  
  // Zero local ratchet private key if present
  // Base64 strings cannot be zeroed; clear decoded bytes and drop references.
  if (state.localRatchetKeyPair) {
    const privateKeyBytes = base64ToBytes(state.localRatchetKeyPair.privateKey)
    secureZero(privateKeyBytes)
    state.localRatchetKeyPair = null
  }
  
  // Zero header encryption keys
  if (state.sendingHeaderKey) {
    secureZero(state.sendingHeaderKey)
    state.sendingHeaderKey = null
  }
  if (state.receivingHeaderKey) {
    secureZero(state.receivingHeaderKey)
    state.receivingHeaderKey = null
  }
  if (state.nextReceivingHeaderKey) {
    secureZero(state.nextReceivingHeaderKey)
    state.nextReceivingHeaderKey = null
  }
  if (state.nextSendingHeaderKey) {
    secureZero(state.nextSendingHeaderKey)
    state.nextSendingHeaderKey = null
  }
  if (state.previousReceivingHeaderKey) {
    secureZero(state.previousReceivingHeaderKey)
    state.previousReceivingHeaderKey = null
  }
  
  // Clear other state
  state.remoteRatchetKey = null
  state.sendingChainKey = null
  state.receivingChainKey = null
}

// Session Utilities

/**
 * Check if a session can send messages
 */
export function canSend(state: SessionState): boolean {
  return state.sendingChainKey !== null && state.localRatchetKeyPair !== null
}

/**
 * Check if a session can receive messages
 */
export function canReceive(state: SessionState): boolean {
  return state.rootKey !== null && state.rootKey.length > 0
}

/**
 * Get the current sending ratchet key
 */
export function getSendingRatchetKey(state: SessionState): string | null {
  return state.localRatchetKeyPair?.publicKey ?? null
}

/**
 * Get the remote ratchet key
 */
export function getRemoteRatchetKey(state: SessionState): string | null {
  return state.remoteRatchetKey
}

/**
 * Check if session needs re-establishment (too many unanswered messages)
 */
export function needsReestablishment(
  state: SessionState,
  maxUnanswered: number = 100
): boolean {
  const unanswered = state.sentMessageCount - state.receivedMessageCount
  return unanswered > maxUnanswered
}

/**
 * Get session statistics
 */
export function getSessionStats(state: SessionState): {
  sentMessages: number
  receivedMessages: number
  skippedKeys: number
  createdAt: number
  lastActivityAt: number
  needsReestablishment: boolean
} {
  return {
    sentMessages: state.sentMessageCount,
    receivedMessages: state.receivedMessageCount,
    skippedKeys: state.skippedMessageKeys.size,
    createdAt: state.createdAt,
    lastActivityAt: state.lastActivityAt,
    needsReestablishment: needsReestablishment(state)
  }
}
