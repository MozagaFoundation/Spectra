/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * RTP-Style Voice/Video Call Encryption Helpers
 * 
 * Provides packet and signaling helpers for integrations that explicitly use
 * this RTP-style format:
 * - SRTP-like key derivation from session keys
 * - AES-256-GCM for packet encryption
 * - ML-DSA-65 signatures for call signaling
 * - Configurable call-key rotation
 * 
 * Callers supply the session root key, so this module inherits rather than
 * establishes the key's security properties. The Spectra application's live
 * media path uses WebRTC DTLS-SRTP and does not wire these helpers into media
 * transport.
 * 
 * Security features:
 * - Per-packet encryption with unique nonces
 * - AEAD authentication of RTP headers
 * - Regular key rotation (configurable interval)
 * - Replay protection via extended sequence numbers
 * - Signaling messages signed with ML-DSA-65
 */

import { gcm } from '@noble/ciphers/aes'
import { 
  deriveKey, 
  generateRandomBytes, 
  bytesToBase64, 
  base64ToBytes, 
  stringToBytes, 
  concatBytes,
  now,
  generateUUID,
  secureZero,
  int32ToLittleEndianBytes,
  int64ToLittleEndianBytes
} from './utils'
import { signWithDilithium, verifyDilithiumSignature } from './dilithium'
import { CryptoError } from '../types/index'
import type { 
  CallKeyMaterial, 
  EncryptedCallSignal, 
  CallSession, 
  SRTPHeader,
  EncryptedRTPPacket,
  CallEncryptionOptions,
  CallType,
  CallState,
  CallReplayState,
  CallRTPReplayStreamState
} from '../types/index'
import { PROTOCOL_VERSIONS, assertExactVersion } from './protocolVersion'

// Constants

// Key derivation constants
const SRTP_MASTER_KEY_LENGTH = 32  // AES-256
const SRTP_MASTER_SALT_LENGTH = 14 // Per SRTP spec
const RTCP_AUTH_KEY_LENGTH = 32    // HMAC-SHA256 key
const MASTER_SECRET_LENGTH = 32

// Key derivation labels (domain separation)
const LABEL_MASTER_SECRET = 'QuantumChat_CallMaster_v1'
const LABEL_SRTP_KEY = 'QuantumChat_SRTP_Key_v1'
const LABEL_SRTP_SALT = 'QuantumChat_SRTP_Salt_v1'
const LABEL_RTCP_AUTH = 'QuantumChat_RTCP_Auth_v1'

// Default key rotation interval (1 minute)
const DEFAULT_KEY_ROTATION_INTERVAL = 60 * 1000

// Maximum ROC value before requiring new call
const MAX_ROC = 0xFFFFFFFF
const defaultReplayStates = new WeakMap<CallKeyMaterial, CallReplayState>()

function assertUintRange(value: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new CryptoError(`${label} must be an integer in [0, ${max}]`)
  }
}

function validateRTPHeader(header: SRTPHeader): void {
  if (header.version !== 2) {
    throw new CryptoError('RTP version must be 2')
  }
  assertUintRange(header.csrcCount, 0x0f, 'RTP CSRC count')
  assertUintRange(header.payloadType, 0x7f, 'RTP payload type')
  assertUintRange(header.sequenceNumber, 0xffff, 'RTP sequence number')
  assertUintRange(header.timestamp, 0xffffffff, 'RTP timestamp')
  assertUintRange(header.ssrc, 0xffffffff, 'RTP SSRC')
}

// Key Derivation

/**
 * Derive call key material from session root key
 * 
 * This function creates all cryptographic material needed for a call
 * from a caller-supplied session root key. This provides unique key material
 * for each call and key index, but does not perform X3DH or ML-KEM key
 * establishment itself.
 * 
 * @param sessionRootKey Current session root key (32 bytes)
 * @param callId Unique call identifier
 * @param keyIndex Key rotation index (0 for initial keys)
 * @param options Call encryption options
 * @returns Complete call key material
 */
export function deriveCallKeyMaterial(
  sessionRootKey: Uint8Array,
  callId: string,
  keyIndex: number = 0,
  options: CallEncryptionOptions = {}
): CallKeyMaterial {
  if (sessionRootKey.length !== 32) {
    throw new CryptoError('Session root key must be 32 bytes')
  }
  
  // Create unique salt for this call + key index
  const callContext = stringToBytes(`${callId}:${keyIndex}`)
  
  // Derive master secret
  const masterSecret = deriveKey(
    sessionRootKey,
    callContext,
    stringToBytes(LABEL_MASTER_SECRET),
    MASTER_SECRET_LENGTH
  )
  
  // Derive SRTP master key
  const srtpMasterKey = deriveKey(
    masterSecret,
    callContext,
    stringToBytes(LABEL_SRTP_KEY),
    SRTP_MASTER_KEY_LENGTH
  )
  
  // Derive SRTP master salt
  const srtpMasterSalt = deriveKey(
    masterSecret,
    callContext,
    stringToBytes(LABEL_SRTP_SALT),
    SRTP_MASTER_SALT_LENGTH
  )
  
  // Derive RTCP authentication key
  const rtcpAuthKey = deriveKey(
    masterSecret,
    callContext,
    stringToBytes(LABEL_RTCP_AUTH),
    RTCP_AUTH_KEY_LENGTH
  )
  
  return {
    masterSecret,
    srtpMasterKey,
    srtpMasterSalt,
    rtcpAuthKey,
    derivedAt: now(),
    rotationInterval: options.keyRotationInterval || DEFAULT_KEY_ROTATION_INTERVAL,
    keyIndex
  }
}

/**
 * Rotate call keys
 * 
 * Creates new key material for an ongoing call. The old keys should be
 * securely zeroed after the transition period.
 * 
 * @param currentKeyMaterial Current key material
 * @param sessionRootKey Session root key
 * @param callId Call identifier
 * @returns New key material with incremented index
 */
export function rotateCallKeys(
  currentKeyMaterial: CallKeyMaterial,
  sessionRootKey: Uint8Array,
  callId: string
): CallKeyMaterial {
  const newKeyMaterial = deriveCallKeyMaterial(
    sessionRootKey,
    callId,
    currentKeyMaterial.keyIndex + 1,
    { keyRotationInterval: currentKeyMaterial.rotationInterval }
  )
  
  return newKeyMaterial
}

/**
 * Check if key rotation is needed
 */
export function shouldRotateKeys(keyMaterial: CallKeyMaterial): boolean {
  const elapsed = now() - keyMaterial.derivedAt
  return elapsed >= keyMaterial.rotationInterval
}

/**
 * Securely dispose of key material
 */
export function disposeCallKeyMaterial(keyMaterial: CallKeyMaterial): void {
  secureZero(keyMaterial.masterSecret)
  secureZero(keyMaterial.srtpMasterKey)
  secureZero(keyMaterial.srtpMasterSalt)
  secureZero(keyMaterial.rtcpAuthKey)
}

// RTP PACKET ENCRYPTION (Voice/Video)

/**
 * Derive per-packet encryption key and nonce
 * 
 * Uses SRTP-like key derivation with extended sequence number (48-bit)
 * to generate unique keys for each packet.
 * 
 * @param keyMaterial Call key material
 * @param ssrc Synchronization source (stream identifier)
 * @param sequenceNumber 16-bit RTP sequence number
 * @param roc Rollover counter (extends sequence to 48-bit)
 * @returns Encryption key and nonce
 */
function derivePacketKey(
  keyMaterial: CallKeyMaterial,
  ssrc: number,
  sequenceNumber: number,
  roc: number
): { key: Uint8Array; nonce: Uint8Array } {
  // Create extended sequence number (ROC || sequence)
  const extendedSeq = new Uint8Array(8)
  const view = new DataView(extendedSeq.buffer)
  view.setUint32(0, roc, false)       // ROC (big-endian)
  view.setUint16(4, sequenceNumber, false)  // Sequence (big-endian)
  view.setUint16(6, 0, false)         // Padding
  
  // Create SSRC bytes
  const ssrcBytes = new Uint8Array(4)
  new DataView(ssrcBytes.buffer).setUint32(0, ssrc, false)
  
  // Derive per-packet key
  const keyContext = concatBytes(ssrcBytes, extendedSeq)
  const packetKey = deriveKey(
    keyMaterial.srtpMasterKey,
    keyContext,
    stringToBytes('packet_key'),
    32
  )
  
  // Create nonce from salt XOR packet index
  const nonce = new Uint8Array(12)
  nonce.set(keyMaterial.srtpMasterSalt.slice(0, nonce.length))
  // XOR in SSRC and sequence
  for (let i = 0; i < 4; i++) {
    nonce[i] ^= ssrcBytes[i]
  }
  nonce[10] ^= (sequenceNumber >> 8) & 0xff
  nonce[11] ^= sequenceNumber & 0xff
  
  return { key: packetKey, nonce }
}

/**
 * Serialize RTP header for AAD
 */
function serializeRTPHeader(header: SRTPHeader): Uint8Array {
  const buffer = new ArrayBuffer(12)
  const view = new DataView(buffer)
  const arr = new Uint8Array(buffer)
  
  // First byte: V(2) | P(1) | X(1) | CC(4)
  const firstByte = (header.version << 6) | 
                    (header.padding ? 0x20 : 0) | 
                    (header.extension ? 0x10 : 0) | 
                    (header.csrcCount & 0x0f)
  arr[0] = firstByte
  
  // Second byte: M(1) | PT(7)
  arr[1] = (header.marker ? 0x80 : 0) | (header.payloadType & 0x7f)
  
  // Bytes 2-3: Sequence number (big-endian)
  view.setUint16(2, header.sequenceNumber, false)
  
  // Bytes 4-7: Timestamp (big-endian)
  view.setUint32(4, header.timestamp, false)
  
  // Bytes 8-11: SSRC (big-endian)
  view.setUint32(8, header.ssrc, false)
  
  return arr
}

/**
 * Encrypt an RTP packet (voice/video frame)
 * 
 * Uses AES-256-GCM with:
 * - Per-packet key derivation for forward secrecy
 * - RTP header as authenticated data
 * - Extended sequence number for replay protection
 * 
 * @param keyMaterial Call key material
 * @param header RTP header
 * @param payload Unencrypted payload data
 * @param roc Rollover counter
 * @returns Encrypted RTP packet
 */
export function encryptRTPPacket(
  keyMaterial: CallKeyMaterial,
  header: SRTPHeader,
  payload: Uint8Array,
  roc: number
): EncryptedRTPPacket {
  validateRTPHeader(header)
  assertUintRange(roc, MAX_ROC, 'RTP rollover counter')
  
  // Derive per-packet key and nonce
  const { key, nonce } = derivePacketKey(
    keyMaterial,
    header.ssrc,
    header.sequenceNumber,
    roc
  )
  
  // Serialize header for AAD (authenticated but not encrypted)
  const headerBytes = serializeRTPHeader(header)
  
  // Encrypt payload with AES-256-GCM
  const cipher = gcm(key, nonce, headerBytes)
  const ciphertextWithTag = cipher.encrypt(payload)
  
  // Extract ciphertext and tag
  const ciphertext = ciphertextWithTag.slice(0, -16)
  const authTag = ciphertextWithTag.slice(-16)
  
  // Securely zero the key
  secureZero(key)
  
  return {
    header,
    encryptedPayload: bytesToBase64(ciphertext),
    authTag: bytesToBase64(authTag),
    roc
  }
}

/**
 * Decrypt an RTP packet
 * 
 * @param keyMaterial Call key material
 * @param encryptedPacket Encrypted packet
 * @returns Decrypted payload
 */
export function decryptRTPPacket(
  keyMaterial: CallKeyMaterial,
  encryptedPacket: EncryptedRTPPacket
): Uint8Array {
  let replayState = defaultReplayStates.get(keyMaterial)
  if (!replayState) {
    replayState = createCallReplayState()
    defaultReplayStates.set(keyMaterial, replayState)
  }
  return decryptRTPPacketWithReplay(keyMaterial, encryptedPacket, replayState)
}

function decryptRTPPacketPayload(
  keyMaterial: CallKeyMaterial,
  encryptedPacket: EncryptedRTPPacket
): Uint8Array {
  const { header, encryptedPayload, authTag, roc } = encryptedPacket
  validateRTPHeader(header)
  assertUintRange(roc, MAX_ROC, 'RTP rollover counter')
  
  // Derive per-packet key and nonce
  const { key, nonce } = derivePacketKey(
    keyMaterial,
    header.ssrc,
    header.sequenceNumber,
    roc
  )
  
  // Serialize header for AAD
  const headerBytes = serializeRTPHeader(header)
  
  // Combine ciphertext and tag
  const ciphertext = base64ToBytes(encryptedPayload)
  const tag = base64ToBytes(authTag)
  const ciphertextWithTag = concatBytes(ciphertext, tag)
  
  // Decrypt
  const cipher = gcm(key, nonce, headerBytes)
  
  try {
    const payload = cipher.decrypt(ciphertextWithTag)
    secureZero(key)
    return payload
  } catch (error) {
    secureZero(key)
    throw new CryptoError('RTP packet decryption failed - authentication failed', error)
  }
}

export function createCallReplayState(): CallReplayState {
  return { rtp: {} }
}

export function decryptRTPPacketWithReplay(
  keyMaterial: CallKeyMaterial,
  encryptedPacket: EncryptedRTPPacket,
  replayState: CallReplayState
): Uint8Array {
  validateRTPHeader(encryptedPacket.header)
  assertUintRange(encryptedPacket.roc, MAX_ROC, 'RTP rollover counter')
  const streamKey = String(encryptedPacket.header.ssrc)
  const replayWindow = new ReplayWindow(replayState.rtp[streamKey])
  const replayCheck = replayWindow.checkAndUpdate(encryptedPacket.header.sequenceNumber)
  if (replayCheck.isReplay || replayCheck.roc !== encryptedPacket.roc) {
    throw new CryptoError('RTP packet replay detected')
  }
  const payload = decryptRTPPacketPayload(keyMaterial, encryptedPacket)
  replayState.rtp[streamKey] = replayWindow.toJSON()
  return payload
}

// Call Signaling Encryption

/**
 * Encrypt a call signaling message (offer, answer, ICE candidates, etc.)
 * 
 * Signaling messages are encrypted with AES-256-GCM and signed with ML-DSA-65
 * for post-quantum authentication.
 * 
 * @param keyMaterial Call key material
 * @param dilithiumPrivateKey Sender's ML-DSA-65 private key (legacy parameter name)
 * @param signalType Type of signal
 * @param payload Call signaling payload (will be JSON serialized)
 * @param sequenceNumber Sequence number for replay protection
 * @returns Encrypted and signed signal
 */
export function encryptCallSignal(
  keyMaterial: CallKeyMaterial,
  dilithiumPrivateKey: string,
  signalType: EncryptedCallSignal['type'],
  payload: unknown,
  sequenceNumber: number
): EncryptedCallSignal {
  // Serialize payload
  const payloadBytes = stringToBytes(JSON.stringify(payload))
  
  // Generate unique nonce
  const nonce = generateRandomBytes(12)
  
  // Encrypt with master secret (signaling doesn't need per-packet keys)
  const cipher = gcm(keyMaterial.masterSecret, nonce)
  const ciphertextWithTag = cipher.encrypt(payloadBytes)
  
  const ciphertext = ciphertextWithTag.slice(0, -16)
  const tag = ciphertextWithTag.slice(-16)
  
  const timestamp = now()
  
  // Create signature over all signal data
  const signatureData = concatBytes(
    stringToBytes(signalType),
    ciphertext,
    nonce,
    tag,
    int64ToLittleEndianBytes(timestamp),
    int32ToLittleEndianBytes(sequenceNumber)
  )
  
  const signature = signWithDilithium(signatureData, dilithiumPrivateKey)
  
  return {
    version: PROTOCOL_VERSIONS.callSignal,
    type: signalType,
    ciphertext: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
    tag: bytesToBase64(tag),
    signature,
    timestamp,
    sequenceNumber
  }
}

/**
 * Decrypt and verify a call signaling message
 * 
 * @param keyMaterial Call key material
 * @param dilithiumPublicKey Sender's ML-DSA-65 public key (legacy parameter name)
 * @param encryptedSignal Encrypted signal
 * @param expectedSequence Expected sequence number (for replay protection)
 * @returns Decrypted payload
 */
export function decryptCallSignal<T = unknown>(
  keyMaterial: CallKeyMaterial,
  dilithiumPublicKey: string,
  encryptedSignal: EncryptedCallSignal,
  expectedSequence?: number
): T {
  let replayState = defaultReplayStates.get(keyMaterial)
  if (!replayState) {
    replayState = createCallReplayState()
    defaultReplayStates.set(keyMaterial, replayState)
  }
  return decryptCallSignalWithReplay(keyMaterial, dilithiumPublicKey, encryptedSignal, replayState, expectedSequence)
}

export function decryptCallSignalWithReplay<T = unknown>(
  keyMaterial: CallKeyMaterial,
  dilithiumPublicKey: string,
  encryptedSignal: EncryptedCallSignal,
  replayState: CallReplayState,
  expectedSequence?: number
): T {
  assertExactVersion(
    'Call signal',
    encryptedSignal.version,
    PROTOCOL_VERSIONS.callSignal,
  )
  const { type, ciphertext, nonce, tag, signature, timestamp, sequenceNumber } = encryptedSignal
  
  const replayBaseline = expectedSequence ?? replayState.lastSignalSequence
  if (replayBaseline !== undefined && sequenceNumber <= replayBaseline) {
    throw new CryptoError('Call signal replay detected - sequence number too low')
  }
  
  // Verify timestamp is recent (within 5 minutes)
  const age = now() - timestamp
  if (age > 5 * 60 * 1000 || age < -60 * 1000) {
    throw new CryptoError('Call signal timestamp out of range')
  }
  
  // Verify the ML-DSA-65 signature.
  const ciphertextBytes = base64ToBytes(ciphertext)
  const nonceBytes = base64ToBytes(nonce)
  const tagBytes = base64ToBytes(tag)
  
  const signatureData = concatBytes(
    stringToBytes(type),
    ciphertextBytes,
    nonceBytes,
    tagBytes,
    int64ToLittleEndianBytes(timestamp),
    int32ToLittleEndianBytes(sequenceNumber)
  )
  
  const valid = verifyDilithiumSignature(signatureData, signature, dilithiumPublicKey)
  if (!valid) {
    throw new CryptoError('Call signal signature verification failed')
  }
  
  // Decrypt payload
  const ciphertextWithTag = concatBytes(ciphertextBytes, tagBytes)
  const cipher = gcm(keyMaterial.masterSecret, nonceBytes)
  
  try {
    const payloadBytes = cipher.decrypt(ciphertextWithTag)
    const payloadJson = new TextDecoder().decode(payloadBytes)
    replayState.lastSignalSequence = sequenceNumber
    return JSON.parse(payloadJson) as T
  } catch (error) {
    throw new CryptoError('Call signal decryption failed', error)
  }
}

// Call Session Management

/**
 * Create a new call session
 * 
 * @param chatSessionId The chat session ID (from Double Ratchet session)
 * @param localIdentityId Local user's identity
 * @param remoteIdentityId Remote user's identity
 * @param callType Voice or video call
 * @param isInitiator Whether we are initiating the call
 * @returns New call session
 */
export function createCallSession(
  chatSessionId: string,
  localIdentityId: string,
  remoteIdentityId: string,
  callType: CallType,
  isInitiator: boolean
): CallSession {
  return {
    id: generateUUID(),
    chatSessionId,
    localIdentityId,
    remoteIdentityId,
    type: callType,
    state: 'initiating',
    isInitiator,
    keyMaterial: null,
    replayState: createCallReplayState(),
    signalSequence: 0,
    createdAt: now()
  }
}

/**
 * Initialize key material for a call session
 * 
 * @param session Call session
 * @param sessionRootKey Root key from the chat session
 * @param options Encryption options
 * @returns Updated session with key material
 */
export function initializeCallKeys(
  session: CallSession,
  sessionRootKey: Uint8Array,
  options: CallEncryptionOptions = {}
): CallSession {
  const keyMaterial = deriveCallKeyMaterial(
    sessionRootKey,
    session.id,
    0,
    options
  )
  
  return {
    ...session,
    keyMaterial,
    replayState: session.replayState ?? createCallReplayState(),
    state: 'connecting'
  }
}

/**
 * Update call session state
 */
export function updateCallState(
  session: CallSession,
  newState: CallState
): CallSession {
  const updated: CallSession = {
    ...session,
    state: newState
  }
  
  if (newState === 'connected' && !session.startedAt) {
    updated.startedAt = now()
  }
  
  if (newState === 'ended' || newState === 'failed') {
    updated.endedAt = now()
    if (updated.startedAt) {
      updated.durationMs = updated.endedAt - updated.startedAt
    }
  }
  
  return updated
}

/**
 * End a call session and clean up keys
 */
export function endCallSession(
  session: CallSession,
  reason: CallSession['endReason']
): CallSession {
  // Securely dispose of key material
  if (session.keyMaterial) {
    disposeCallKeyMaterial(session.keyMaterial)
  }
  
  return {
    ...session,
    state: 'ended',
    endedAt: now(),
    endReason: reason,
    durationMs: session.startedAt ? now() - session.startedAt : undefined,
    keyMaterial: null
  }
}

/**
 * Increment and return the next signal sequence number
 */
export function getNextSignalSequence(session: CallSession): { session: CallSession; sequence: number } {
  const sequence = session.signalSequence + 1
  return {
    session: { ...session, signalSequence: sequence },
    sequence
  }
}

// Replay Protection

/**
 * Replay window for RTP packets
 * Tracks received sequence numbers to detect replays
 */
export class ReplayWindow {
  private windowBase: number = 0
  private roc: number = 0
  private bitmap: bigint = 0n
  private readonly windowSize: number = 128
  private highestSequence: number = -1

  constructor(state?: CallRTPReplayStreamState) {
    if (state) {
      this.windowBase = state.windowBase
      this.roc = state.roc
      this.bitmap = BigInt(state.bitmap)
      this.highestSequence = state.highestSequence
    }
  }
  
  /**
   * Check and update replay window for incoming packet
   * 
   * @param sequenceNumber 16-bit RTP sequence number
   * @returns Object with isReplay flag and current ROC
   */
  checkAndUpdate(sequenceNumber: number): { isReplay: boolean; roc: number } {
    assertUintRange(sequenceNumber, 0xffff, 'RTP sequence number')
    if (this.highestSequence < 0) {
      this.highestSequence = sequenceNumber
      this.windowBase = Math.max(0, this.highestSequence - this.windowSize + 1)
      this.bitmap = 1n << BigInt(this.highestSequence - this.windowBase)
      return { isReplay: false, roc: 0 }
    }

    const highestRoc = Math.floor(this.highestSequence / 0x10000)
    const highestLow = this.highestSequence & 0xffff
    let packetROC = highestRoc

    if (highestLow > 0x8000 && sequenceNumber < highestLow - 0x8000) {
      packetROC = highestRoc + 1
    } else if (sequenceNumber > highestLow + 0x8000 && highestRoc > 0) {
      packetROC = highestRoc - 1
    }

    const extendedSequence = packetROC * 0x10000 + sequenceNumber
    if (extendedSequence < this.windowBase) {
      return { isReplay: true, roc: packetROC }
    }

    if (extendedSequence > this.highestSequence) {
      const oldBase = this.windowBase
      this.highestSequence = extendedSequence
      this.windowBase = Math.max(0, this.highestSequence - this.windowSize + 1)
      const shift = this.windowBase - oldBase
      if (shift > 0) {
        this.bitmap >>= BigInt(Math.min(shift, this.windowSize))
      }
      this.roc = Math.floor(this.highestSequence / 0x10000)
    }

    const index = extendedSequence - this.windowBase
    if (index < this.windowSize) {
      if ((this.bitmap & (1n << BigInt(index))) !== 0n) {
        return { isReplay: true, roc: packetROC }
      }
      this.bitmap |= 1n << BigInt(index)
    }

    return { isReplay: false, roc: packetROC }
  }
  
  /**
   * Get current ROC for outgoing packets
   */
  getCurrentROC(): number {
    return this.roc
  }

  toJSON(): CallRTPReplayStreamState {
    return {
      windowBase: this.windowBase,
      roc: this.roc,
      bitmap: this.bitmap.toString(),
      highestSequence: this.highestSequence,
    }
  }
}
