/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Cryptographic Utility Functions
 * 
 * Low-level utilities for encoding, random generation, key derivation,
 * and secure memory handling.
 */

import { hkdf } from '@noble/hashes/hkdf'
import { pbkdf2 } from '@noble/hashes/pbkdf2'
import { sha256 } from '@noble/hashes/sha256'
import { hmac } from '@noble/hashes/hmac'
import { randomBytes } from '@noble/hashes/utils'

// Encoding Utilities

/**
 * Detect if running in React Native environment
 */
function isReactNative(): boolean {
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative'
}

/**
 * Convert Uint8Array to base64 string
 * 
 * Uses chunked processing to avoid stack overflow with large arrays.
 * Avoids Buffer in React Native as the polyfill causes stack overflow.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  // Skip Buffer in React Native - the polyfill causes stack overflow
  if (!isReactNative() && typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    // Node.js - use Buffer which handles large arrays efficiently
    return Buffer.from(bytes).toString('base64')
  }
  
  // Browser/React Native - chunk processing to avoid stack overflow
  const CHUNK_SIZE = 32768 // Process 32KB at a time
  let binary = ''
  
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length))
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j])
    }
  }
  
  if (typeof btoa !== 'undefined') {
    return btoa(binary)
  }
  
  // Fallback manual base64 encoding
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let result = ''
  
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i)
    const b = binary.charCodeAt(i + 1)
    const c = binary.charCodeAt(i + 2)
    
    const enc1 = a >> 2
    const enc2 = ((a & 3) << 4) | (b >> 4)
    const enc3 = isNaN(b) ? 64 : ((b & 15) << 2) | (c >> 6)
    const enc4 = isNaN(c) ? 64 : c & 63
    
    result += chars[enc1] + chars[enc2] + 
              (enc3 === 64 ? '=' : chars[enc3]) + 
              (enc4 === 64 ? '=' : chars[enc4])
  }
  
  return result
}

/**
 * Convert base64 string to Uint8Array
 * 
 * Handles large strings efficiently without stack overflow.
 * Avoids Buffer in React Native as the polyfill causes stack overflow.
 */
export function base64ToBytes(base64: string): Uint8Array {
  // Skip Buffer in React Native - the polyfill causes stack overflow
  if (!isReactNative() && typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    // Node.js - use Buffer which handles large strings efficiently
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }
  
  // Browser/React Native
  if (typeof atob !== 'undefined') {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
  
  // Fallback manual base64 decoding
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const cleanBase64 = base64.replace(/[^A-Za-z0-9+/]/g, '')
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  const outputLength = (cleanBase64.length * 3 / 4) - padding
  const bytes = new Uint8Array(outputLength)
  
  let byteIndex = 0
  for (let i = 0; i < cleanBase64.length; i += 4) {
    const enc1 = chars.indexOf(cleanBase64[i])
    const enc2 = chars.indexOf(cleanBase64[i + 1])
    const enc3 = chars.indexOf(cleanBase64[i + 2])
    const enc4 = chars.indexOf(cleanBase64[i + 3])
    
    const chr1 = (enc1 << 2) | (enc2 >> 4)
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2)
    const chr3 = ((enc3 & 3) << 6) | enc4
    
    bytes[byteIndex++] = chr1
    if (enc3 !== -1 && byteIndex < outputLength) bytes[byteIndex++] = chr2
    if (enc4 !== -1 && byteIndex < outputLength) bytes[byteIndex++] = chr3
  }
  
  return bytes
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Invalid hex string length')
  }
  if (!/^[0-9a-fA-F]*$/.test(cleanHex)) {
    throw new Error('Invalid hex string')
  }
  const bytes = new Uint8Array(cleanHex.length / 2)
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16)
  }
  return bytes
}

/**
 * Convert string to Uint8Array (UTF-8)
 */
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

/**
 * Convert Uint8Array to string (UTF-8)
 */
export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

// Random Generation

/**
 * Generate cryptographically secure random bytes
 */
export function generateRandomBytes(length: number): Uint8Array {
  return randomBytes(length)
}

/**
 * Generate a random UUID v4
 */
export function generateUUID(): string {
  const bytes = generateRandomBytes(16)
  // Set version (4) and variant (RFC4122)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  
  const hex = bytesToHex(bytes).slice(2)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-')
}

/**
 * Generate a random integer in range [0, max)
 * 
 * Uses rejection sampling to avoid modulo bias.
 * This ensures uniform distribution across all values in [0, max).
 */
export function generateRandomInt(max: number): number {
  if (max <= 0) {
    throw new Error('max must be positive')
  }
  if (max === 1) {
    return 0
  }
  
  // Use rejection sampling to avoid modulo bias
  // Calculate the largest multiple of max that fits in 32 bits
  const maxUint32 = 0xFFFFFFFF
  const limit = maxUint32 - (maxUint32 % max)
  
  let value: number
  do {
    const bytes = generateRandomBytes(4)
    value = new DataView(bytes.buffer).getUint32(0, true)
    // Reject values >= limit to ensure uniform distribution
  } while (value >= limit)
  
  return value % max
}

// Secure Memory Handling

/**
 * Securely zero out a Uint8Array
 * Note: JavaScript doesn't guarantee secure memory zeroing,
 * but this is the best we can do
 */
export function secureZero(array: Uint8Array): void {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    // Overwrite with random data first (defense against cold boot attacks)
    crypto.getRandomValues(array)
  }
  // Then zero
  array.fill(0)
}

// Key Derivation

/**
 * HKDF-SHA256 key derivation
 */
export function deriveKey(
  inputKeyMaterial: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Uint8Array {
  return hkdf(sha256, inputKeyMaterial, salt, info, length)
}

/**
 * KDF chain step (for Double Ratchet)
 * Returns new chain key and message key
 */
export function kdfChain(chainKey: Uint8Array): { chainKey: Uint8Array; messageKey: Uint8Array } {
  const messageKeyInput = new Uint8Array([0x01])
  const chainKeyInput = new Uint8Array([0x02])
  
  const messageKey = hmac(sha256, chainKey, messageKeyInput)
  const newChainKey = hmac(sha256, chainKey, chainKeyInput)
  
  return {
    chainKey: newChainKey,
    messageKey
  }
}

/**
 * Root KDF (for deriving new chain keys)
 * 
 * KDF_RK(rk, dh_out) = HKDF(salt=rk, ikm=dh_out, info=info)
 * 
 * The root key is used as the HKDF salt, which provides domain separation
 * between ratchet steps.
 * 
 * @param rootKey Current root key (used as HKDF salt)
 * @param dhOutput DH shared secret output (used as HKDF input key material)
 * @returns New root key and chain key
 */
export function kdfRoot(
  rootKey: Uint8Array,
  dhOutput: Uint8Array
): { rootKey: Uint8Array; chainKey: Uint8Array } {
  const info = stringToBytes('QuantumChat_RootKDF_v2')
  // deriveKey signature: (ikm, salt, info, length)
  const derived = deriveKey(dhOutput, rootKey, info, 64)
  
  return {
    rootKey: derived.slice(0, 32),
    chainKey: derived.slice(32, 64)
  }
}

/**
 * Derive a single header encryption key from DH output
 * 
 * Note: We derive a single key per DH output. The naming (HKs, HKr, NHKs, NHKr)
 * refers to different DH outputs, not multiple keys from one DH.
 */
export function kdfHeaderKey(
  dhOutput: Uint8Array
): Uint8Array {
  const info = stringToBytes('QuantumChat_HeaderKDF_v3')
  // Use a non-zero fixed salt for domain-separated extraction.
  const salt = new Uint8Array(32).fill(0xFF)
  return deriveKey(dhOutput, salt, info, 32)
}

/**
 * Derive storage encryption key from user password/PIN
 */
export function deriveStorageKey(
  password: string,
  salt: Uint8Array,
  iterations: number = 100000
): Uint8Array {
  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new Error('Storage KDF iterations must be a positive integer')
  }

  const passwordBytes = stringToBytes(password)
  return pbkdf2(sha256, passwordBytes, salt, { c: iterations, dkLen: 32 })
}

// Comparison Utilities

/**
 * Compare byte arrays in constant time.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let result = a.length ^ b.length
  const maxLength = Math.max(a.length, b.length)
  for (let i = 0; i < maxLength; i++) {
    result |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  
  return result === 0
}

/**
 * Compare base64 values in constant time.
 * Returns false on decode errors.
 */
export function constantTimeBase64Equal(a: string, b: string): boolean {
  try {
    const bytesA = base64ToBytes(a)
    const bytesB = base64ToBytes(b)
    return constantTimeEqual(bytesA, bytesB)
  } catch {
    return false
  }
}

// Serialization Utilities

/**
 * Concatenate multiple Uint8Arrays
 */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

/**
 * Encode a signed 32-bit integer in explicit little-endian order.
 */
export function int32ToLittleEndianBytes(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setInt32(0, value, true)
  return bytes
}

/**
 * Encode a signed 64-bit integer in explicit little-endian order.
 */
export function int64ToLittleEndianBytes(value: number | bigint): Uint8Array {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setBigInt64(0, BigInt(value), true)
  return bytes
}

/**
 * Create a key identifier from public keys (for skipped message key storage)
 */
export function createKeyId(ratchetKey: string, messageNumber: number): string {
  return `${ratchetKey}:${messageNumber}`
}

/**
 * Parse a key identifier
 */
export function parseKeyId(keyId: string): { ratchetKey: string; messageNumber: number } {
  const parts = keyId.split(':')
  if (parts.length !== 2) {
    throw new Error('Invalid key ID format')
  }
  return {
    ratchetKey: parts[0],
    messageNumber: parseInt(parts[1], 10)
  }
}

/**
 * Hash data with SHA-256
 */
export function hash(data: Uint8Array): Uint8Array {
  return sha256(data)
}

/**
 * Hash data with SHA-256 and return as hex string
 * Useful for content integrity verification
 */
export function sha256Hash(data: Uint8Array): string {
  const hashBytes = sha256(data)
  return bytesToHex(hashBytes).slice(2) // Remove '0x' prefix
}

/**
 * Create a fingerprint from a public key (for display/verification)
 */
export function createFingerprint(publicKey: string): string {
  const keyBytes = base64ToBytes(publicKey)
  const hashBytes = hash(keyBytes)
  // Return first 8 bytes as hex, grouped for readability
  const hex = bytesToHex(hashBytes.slice(0, 8)).slice(2)
  return hex.match(/.{1,4}/g)?.join(' ') || hex
}

/**
 * Create a base key fingerprint for session identification
 */
export function createSessionFingerprint(
  localIdentityKey: string,
  remoteIdentityKey: string,
  ephemeralKey: string
): string {
  const combined = concatBytes(
    base64ToBytes(localIdentityKey),
    base64ToBytes(remoteIdentityKey),
    base64ToBytes(ephemeralKey)
  )
  return bytesToBase64(hash(combined).slice(0, 16))
}

// Timestamp Utilities

/**
 * Get current timestamp in milliseconds
 */
export function now(): number {
  return Date.now()
}

/**
 * Check if a timestamp is within acceptable range
 */
export function isTimestampValid(
  timestamp: number,
  toleranceMs: number = 5 * 60 * 1000 // 5 minutes
): boolean {
  const current = now()
  const diff = Math.abs(current - timestamp)
  return diff <= toleranceMs
}

/**
 * Check if a timestamp has expired
 */
export function isExpired(expiresAt: number): boolean {
  return now() > expiresAt
}

// Message Hash Utilities

/**
 * Create a hash of message content for chaining and deduplication
 */
export function createMessageHash(
  senderId: string,
  recipientId: string,
  sessionId: string,
  sequenceNumber: number,
  timestamp: number,
  ciphertext: string,
  previousHash?: string
): string {
  const data = concatBytes(
    stringToBytes(senderId),
    stringToBytes(recipientId),
    stringToBytes(sessionId),
    int64ToLittleEndianBytes(sequenceNumber),
    int64ToLittleEndianBytes(timestamp),
    base64ToBytes(ciphertext),
    previousHash ? base64ToBytes(previousHash) : new Uint8Array(0)
  )
  return bytesToBase64(hash(data))
}
