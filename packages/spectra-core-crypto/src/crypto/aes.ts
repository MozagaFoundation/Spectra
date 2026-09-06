/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * AES-256-GCM Encryption Functions
 * 
 * Provides authenticated encryption using AES-256-GCM.
 * Uses @noble/ciphers for pure JavaScript implementation.
 * 
 * Supports:
 * - String message encryption
 * - Binary data encryption (images, documents, etc.)
 * - Chunked encryption for large files
 * - Header encryption for message headers
 * 
 * The security properties of encrypted data depend on how callers establish,
 * distribute, and protect the supplied keys.
 */

import { gcm } from '@noble/ciphers/aes'
import { generateRandomBytes, bytesToBase64, base64ToBytes, concatBytes, stringToBytes, bytesToString, sha256Hash, hexToBytes, constantTimeEqual, int32ToLittleEndianBytes } from './utils'
import { CryptoError } from '../types/index'
import type { EncryptedChunk, MediaMetadata, EncryptedMedia, DecryptedMedia, MediaEncryptionOptions } from '../types/index'

// Constants
const NONCE_LENGTH = 12  // 96 bits as recommended for GCM
const TAG_LENGTH = 16    // 128-bit authentication tag
const DEFAULT_CHUNK_SIZE = 1024 * 1024  // 1MB chunks for large files
const MAX_SINGLE_ENCRYPT_SIZE = 5 * 1024 * 1024  // 5MB threshold for chunking
const MAX_CHUNK_METADATA_VALUE = 0x7fffffff
export const NATIVE_MEDIA_FILE_THRESHOLD_BYTES = 64 * 1024
export const MAX_MEDIA_FILE_BYTES = 50 * 1024 * 1024

export type MediaCryptoSource = 'js' | 'native' | 'mixed'

export interface ContentHashMetrics {
  hash: string
  source: Exclude<MediaCryptoSource, 'mixed'>
  elapsedMs: number
  bytes: number
}

export interface MediaEncryptionMetrics {
  source: MediaCryptoSource
  hashMs: number
  encryptMs: number
  totalMs: number
  sourceBytes: number
  isChunked: boolean
  totalChunks?: number
}

export interface MeasuredEncryptedMedia {
  encrypted: EncryptedMedia
  performance: MediaEncryptionMetrics
}

export interface NativeMediaCryptoModule {
  sha256(data: string): Promise<string>
  sha256File?(path: string): Promise<string>
  encryptAesGcm(
    key: string,
    plaintext: string,
    associatedData?: string | null,
    jobId?: string | null,
  ): Promise<{ ciphertext: string; nonce: string; tag: string }>
  encryptAesGcmFile?(
    key: string,
    plaintextPath: string,
    destCiphertextPath: string,
    associatedData?: string | null,
    jobId?: string | null,
  ): Promise<{ nonce: string; tag: string; ciphertextBytes: number }>
  decryptAesGcm?(
    key: string,
    ciphertext: string,
    nonce: string,
    tag: string,
    associatedData?: string | null,
    jobId?: string | null,
  ): Promise<string>
  decryptAesGcmFile?(
    key: string,
    ciphertextPath: string,
    destPlaintextPath: string,
    nonce: string,
    tag: string,
    associatedData?: string | null,
    jobId?: string | null,
  ): Promise<string>
  writeMediaBlob?(
    headerJson: string,
    ciphertextPath: string,
    nonce: string,
    tag: string,
    destPath: string,
  ): Promise<{ bytes?: number }>
  decryptMediaBlobFile?(
    key: string,
    blobPath: string,
    destPlaintextPath: string,
    associatedData?: string | null,
    jobId?: string | null,
  ): Promise<{ headerJson: string; plaintextBytes: number }>
  deriveSafetyNumberFingerprint?(
    keyMaterial: string,
    identityId: string,
    version: number,
  ): Promise<string>
  cancel?(jobId: string): void
  cancelAll?(): void
}

let nativeMediaCryptoModule: NativeMediaCryptoModule | null | undefined
let nativeAesJobSeq = 0

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now()
}

function nextNativeAesJobId(): string {
  nativeAesJobSeq += 1
  return `media-aes-${nativeAesJobSeq}`
}

function isNativeAesCancelled(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : ''
  const message = error instanceof Error ? error.message : String(error ?? '')
  return code === 'ERR_CANCELLED' || /cancelled/i.test(message)
}

function getNativeMediaCryptoModule(): NativeMediaCryptoModule | null {
  if (nativeMediaCryptoModule !== undefined) {
    return nativeMediaCryptoModule
  }

  try {
    const { NativeModules } = require('react-native')
    nativeMediaCryptoModule = (NativeModules.MediaCryptoModule as NativeMediaCryptoModule | undefined) ?? null
  } catch {
    nativeMediaCryptoModule = null
  }

  return nativeMediaCryptoModule
}

export function __setNativeMediaCryptoModuleForTests(module: NativeMediaCryptoModule | null | undefined): void {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
    return
  }
  nativeMediaCryptoModule = module
}

export function canUseNativeMediaFileCrypto(): boolean {
  const native = getNativeMediaCryptoModule()
  return Boolean(
    native?.sha256File
    && native.encryptAesGcmFile
    && native.writeMediaBlob
    && native.decryptMediaBlobFile,
  )
}

function isHexSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value)
}

function resolveMediaCryptoSource(sources: Array<Exclude<MediaCryptoSource, 'mixed'>>): MediaCryptoSource {
  if (sources.every((source) => source === 'native')) {
    return 'native'
  }
  if (sources.every((source) => source === 'js')) {
    return 'js'
  }
  return 'mixed'
}

function combineMediaCryptoSources(sources: MediaCryptoSource[]): MediaCryptoSource {
  if (sources.includes('mixed')) {
    return 'mixed'
  }
  return resolveMediaCryptoSource(sources as Array<Exclude<MediaCryptoSource, 'mixed'>>)
}

function assertChunkMetadata(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CHUNK_METADATA_VALUE) {
    throw new CryptoError(`${label} must be a non-negative 31-bit safe integer`)
  }
}

function createChunkAssociatedData(
  chunkIndex: number,
  originalSize: number,
  isFinal: boolean,
  associatedData?: Uint8Array
): Uint8Array {
  assertChunkMetadata(chunkIndex, 'Chunk index')
  assertChunkMetadata(originalSize, 'Chunk original size')
  const metadata = concatBytes(
    int32ToLittleEndianBytes(chunkIndex),
    int32ToLittleEndianBytes(originalSize),
    new Uint8Array([isFinal ? 1 : 0])
  )
  return associatedData ? concatBytes(associatedData, metadata) : metadata
}

/**
 * Encrypt data using AES-256-GCM
 * 
 * @param key 32-byte encryption key
 * @param plaintext Data to encrypt
 * @param associatedData Optional additional authenticated data
 * @returns Object with ciphertext, nonce, and tag (all base64 encoded)
 */
export function encryptAES(
  key: Uint8Array,
  plaintext: Uint8Array,
  associatedData?: Uint8Array
): { ciphertext: string; nonce: string; tag: string } {
  if (key.length !== 32) {
    throw new CryptoError('AES key must be 32 bytes')
  }

  const nonce = generateRandomBytes(NONCE_LENGTH)
  
  const cipher = gcm(key, nonce, associatedData)
  const ciphertextWithTag = cipher.encrypt(plaintext)
  
  // Extract tag from the end of ciphertext (last 16 bytes)
  const ciphertext = ciphertextWithTag.slice(0, -TAG_LENGTH)
  const tag = ciphertextWithTag.slice(-TAG_LENGTH)

  return {
    ciphertext: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
    tag: bytesToBase64(tag)
  }
}

/**
 * Decrypt data using AES-256-GCM
 * 
 * @param key 32-byte decryption key
 * @param ciphertext Base64 encoded ciphertext
 * @param nonce Base64 encoded nonce
 * @param tag Base64 encoded authentication tag
 * @param associatedData Optional additional authenticated data
 * @returns Decrypted plaintext
 */
export function decryptAES(
  key: Uint8Array,
  ciphertext: string,
  nonce: string,
  tag: string,
  associatedData?: Uint8Array
): Uint8Array {
  if (key.length !== 32) {
    throw new CryptoError('AES key must be 32 bytes')
  }

  const nonceBytes = base64ToBytes(nonce)
  const ciphertextBytes = base64ToBytes(ciphertext)
  const tagBytes = base64ToBytes(tag)

  if (nonceBytes.length !== NONCE_LENGTH) {
    throw new CryptoError(`Invalid nonce length: expected ${NONCE_LENGTH}, got ${nonceBytes.length}`)
  }

  if (tagBytes.length !== TAG_LENGTH) {
    throw new CryptoError(`Invalid tag length: expected ${TAG_LENGTH}, got ${tagBytes.length}`)
  }

  // Combine ciphertext and tag for @noble/ciphers
  const ciphertextWithTag = concatBytes(ciphertextBytes, tagBytes)

  const cipher = gcm(key, nonceBytes, associatedData)
  
  try {
    return cipher.decrypt(ciphertextWithTag)
  } catch (error) {
    throw new CryptoError('Decryption failed: authentication tag mismatch', error)
  }
}

async function encryptAESMeasuredNativeOptional(
  key: Uint8Array,
  plaintext: Uint8Array,
  associatedData?: Uint8Array
): Promise<{
  encrypted: { ciphertext: string; nonce: string; tag: string }
  source: Exclude<MediaCryptoSource, 'mixed'>
}> {
  if (key.length !== 32) {
    throw new CryptoError('AES key must be 32 bytes')
  }

  const nativeModule = getNativeMediaCryptoModule()
  if (nativeModule) {
    try {
      const encrypted = await nativeModule.encryptAesGcm(
        bytesToBase64(key),
        bytesToBase64(plaintext),
        associatedData ? bytesToBase64(associatedData) : null,
        nextNativeAesJobId(),
      )
      if (
        base64ToBytes(encrypted.nonce).length === NONCE_LENGTH
        && base64ToBytes(encrypted.tag).length === TAG_LENGTH
      ) {
        return { encrypted, source: 'native' }
      }
    } catch (error) {
      if (isNativeAesCancelled(error)) {
        throw new CryptoError('AES-GCM job cancelled', error)
      }
    }
  }

  return {
    encrypted: encryptAES(key, plaintext, associatedData),
    source: 'js',
  }
}

async function decryptAESMeasuredNativeOptional(
  key: Uint8Array,
  ciphertext: string,
  nonce: string,
  tag: string,
  associatedData?: Uint8Array,
): Promise<{
  plaintext: Uint8Array
  source: Exclude<MediaCryptoSource, 'mixed'>
}> {
  if (key.length !== 32) {
    throw new CryptoError('AES key must be 32 bytes')
  }

  const nativeModule = getNativeMediaCryptoModule()
  if (nativeModule?.decryptAesGcm) {
    try {
      const plaintextBase64 = await nativeModule.decryptAesGcm(
        bytesToBase64(key),
        ciphertext,
        nonce,
        tag,
        associatedData ? bytesToBase64(associatedData) : null,
        nextNativeAesJobId(),
      )
      return { plaintext: base64ToBytes(plaintextBase64), source: 'native' }
    } catch (error) {
      if (isNativeAesCancelled(error)) {
        throw new CryptoError('AES-GCM job cancelled', error)
      }
    }
  }

  return {
    plaintext: decryptAES(key, ciphertext, nonce, tag, associatedData),
    source: 'js',
  }
}

/**
 * Encrypt a string message
 * 
 * @param key 32-byte encryption key
 * @param message String message to encrypt
 * @param associatedData Optional additional authenticated data
 * @returns Object with ciphertext, nonce, and tag (all base64 encoded)
 */
export function encryptMessage(
  key: Uint8Array,
  message: string,
  associatedData?: Uint8Array
): { ciphertext: string; nonce: string; tag: string } {
  const plaintext = stringToBytes(message)
  return encryptAES(key, plaintext, associatedData)
}

/**
 * Decrypt a string message
 * 
 * @param key 32-byte decryption key
 * @param ciphertext Base64 encoded ciphertext
 * @param nonce Base64 encoded nonce
 * @param tag Base64 encoded authentication tag
 * @param associatedData Optional additional authenticated data
 * @returns Decrypted message string
 */
export function decryptMessage(
  key: Uint8Array,
  ciphertext: string,
  nonce: string,
  tag: string,
  associatedData?: Uint8Array
): string {
  const plaintext = decryptAES(key, ciphertext, nonce, tag, associatedData)
  return bytesToString(plaintext)
}

// Binary / media Encryption

/**
 * Encrypt binary data (images, documents, etc.)
 * 
 * This is the core function for encrypting binary content with a caller-supplied
 * AES-256-GCM key. It does not establish or rotate that key.
 * 
 * @param key 32-byte encryption key
 * @param data Binary data to encrypt
 * @param associatedData Optional AAD for binding to context
 * @returns Encrypted payload
 */
export function encryptBinary(
  key: Uint8Array,
  data: Uint8Array,
  associatedData?: Uint8Array
): { ciphertext: string; nonce: string; tag: string } {
  return encryptAES(key, data, associatedData)
}

/**
 * Decrypt binary data
 * 
 * @param key 32-byte decryption key
 * @param ciphertext Base64 encoded ciphertext
 * @param nonce Base64 encoded nonce
 * @param tag Base64 encoded authentication tag
 * @param associatedData Optional AAD (must match encryption)
 * @returns Decrypted binary data
 */
export function decryptBinary(
  key: Uint8Array,
  ciphertext: string,
  nonce: string,
  tag: string,
  associatedData?: Uint8Array
): Uint8Array {
  return decryptAES(key, ciphertext, nonce, tag, associatedData)
}

/**
 * Encrypt a single chunk of data
 * 
 * @param key Encryption key
 * @param chunk Chunk data
 * @param chunkIndex Index of this chunk
 * @param isFinal Whether this is the last chunk
 * @param associatedData Optional AAD
 * @returns Encrypted chunk
 */
export function encryptChunk(
  key: Uint8Array,
  chunk: Uint8Array,
  chunkIndex: number,
  isFinal: boolean,
  associatedData?: Uint8Array
): EncryptedChunk {
  assertChunkMetadata(chunkIndex, 'Chunk index')
  assertChunkMetadata(chunk.length, 'Chunk original size')

  const chunkAD = createChunkAssociatedData(chunkIndex, chunk.length, isFinal, associatedData)
  
  const { ciphertext, nonce, tag } = encryptAES(key, chunk, chunkAD)
  
  return {
    index: chunkIndex,
    ciphertext,
    nonce,
    tag,
    originalSize: chunk.length,
    isFinal
  }
}

/**
 * Decrypt a single chunk of data
 * 
 * @param key Decryption key
 * @param encryptedChunk Encrypted chunk data
 * @param associatedData Optional AAD (must match encryption)
 * @returns Decrypted chunk data
 */
export function decryptChunk(
  key: Uint8Array,
  encryptedChunk: EncryptedChunk,
  associatedData?: Uint8Array
): Uint8Array {
  assertChunkMetadata(encryptedChunk.index, 'Chunk index')
  assertChunkMetadata(encryptedChunk.originalSize, 'Chunk original size')

  const chunkAD = createChunkAssociatedData(
    encryptedChunk.index,
    encryptedChunk.originalSize,
    encryptedChunk.isFinal,
    associatedData
  )
  
  const decrypted = decryptAES(
    key,
    encryptedChunk.ciphertext,
    encryptedChunk.nonce,
    encryptedChunk.tag,
    chunkAD
  )
  if (decrypted.length !== encryptedChunk.originalSize) {
    throw new CryptoError('Chunk original size mismatch')
  }
  return decrypted
}

/**
 * Encrypt large binary data with chunking
 * 
 * For files larger than MAX_SINGLE_ENCRYPT_SIZE, data is split into chunks
 * and each chunk is encrypted independently. This allows:
 * - Streaming encryption/decryption
 * - Progress reporting
 * - Memory-efficient processing of large files
 * 
 * @param key 32-byte encryption key
 * @param data Binary data to encrypt
 * @param options Encryption options including chunk size and progress callback
 * @returns Array of encrypted chunks or single encrypted payload
 */
export function encryptBinaryChunked(
  key: Uint8Array,
  data: Uint8Array,
  options: MediaEncryptionOptions = {}
): { ciphertext: string; nonce: string; tag: string } | EncryptedChunk[] {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE
  
  // For small files, use single encryption
  if (data.length <= MAX_SINGLE_ENCRYPT_SIZE) {
    return encryptBinary(key, data, options.associatedData)
  }
  
  // For large files, use chunked encryption
  const chunks: EncryptedChunk[] = []
  const totalChunks = Math.ceil(data.length / chunkSize)
  let bytesProcessed = 0
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize
    const end = Math.min(start + chunkSize, data.length)
    const chunk = data.slice(start, end)
    const isFinal = i === totalChunks - 1
    
    const encryptedChunk = encryptChunk(key, chunk, i, isFinal, options.associatedData)
    chunks.push(encryptedChunk)
    
    bytesProcessed += chunk.length
    
    // Report progress
    if (options.onProgress) {
      options.onProgress({
        bytesProcessed,
        totalBytes: data.length,
        chunksComplete: i + 1,
        totalChunks
      })
    }
  }
  
  return chunks
}

async function encryptChunkMeasuredNativeOptional(
  key: Uint8Array,
  chunk: Uint8Array,
  chunkIndex: number,
  isFinal: boolean,
  associatedData?: Uint8Array
): Promise<{ chunk: EncryptedChunk; source: Exclude<MediaCryptoSource, 'mixed'> }> {
  assertChunkMetadata(chunkIndex, 'Chunk index')
  assertChunkMetadata(chunk.length, 'Chunk original size')

  const chunkAD = createChunkAssociatedData(chunkIndex, chunk.length, isFinal, associatedData)
  const { encrypted, source } = await encryptAESMeasuredNativeOptional(key, chunk, chunkAD)

  return {
    chunk: {
      index: chunkIndex,
      ciphertext: encrypted.ciphertext,
      nonce: encrypted.nonce,
      tag: encrypted.tag,
      originalSize: chunk.length,
      isFinal,
    },
    source,
  }
}

async function encryptBinaryChunkedMeasuredNativeOptional(
  key: Uint8Array,
  data: Uint8Array,
  options: MediaEncryptionOptions = {}
): Promise<{
  encryptedContent: { ciphertext: string; nonce: string; tag: string } | EncryptedChunk[]
  source: MediaCryptoSource
}> {
  const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE
  const sources: Array<Exclude<MediaCryptoSource, 'mixed'>> = []

  if (data.length <= MAX_SINGLE_ENCRYPT_SIZE) {
    const { encrypted, source } = await encryptAESMeasuredNativeOptional(key, data, options.associatedData)
    return {
      encryptedContent: encrypted,
      source,
    }
  }

  const chunks: EncryptedChunk[] = []
  const totalChunks = Math.ceil(data.length / chunkSize)
  let bytesProcessed = 0

  for (let i = 0; i < totalChunks; i += 1) {
    const start = i * chunkSize
    const end = Math.min(start + chunkSize, data.length)
    const chunk = data.slice(start, end)
    const isFinal = i === totalChunks - 1
    const encryptedChunk = await encryptChunkMeasuredNativeOptional(
      key,
      chunk,
      i,
      isFinal,
      options.associatedData,
    )
    chunks.push(encryptedChunk.chunk)
    sources.push(encryptedChunk.source)
    bytesProcessed += chunk.length

    options.onProgress?.({
      bytesProcessed,
      totalBytes: data.length,
      chunksComplete: i + 1,
      totalChunks,
    })
  }

  return {
    encryptedContent: chunks,
    source: resolveMediaCryptoSource(sources),
  }
}

/**
 * Decrypt chunked binary data
 * 
 * @param key 32-byte decryption key
 * @param chunks Array of encrypted chunks
 * @param associatedData Optional AAD (must match encryption)
 * @param onProgress Optional progress callback
 * @returns Decrypted binary data
 */
export function decryptBinaryChunked(
  key: Uint8Array,
  chunks: EncryptedChunk[],
  associatedData?: Uint8Array,
  onProgress?: (progress: { bytesProcessed: number; totalBytes: number; chunksComplete: number; totalChunks: number }) => void
): Uint8Array {
  // Sort chunks by index to ensure correct order
  const sortedChunks = [...chunks].sort((a, b) => a.index - b.index)
  
  // Validate chunk sequence
  for (let i = 0; i < sortedChunks.length; i++) {
    if (sortedChunks[i].index !== i) {
      throw new CryptoError(`Missing chunk at index ${i}`)
    }
  }
  
  // Verify last chunk is marked as final
  if (sortedChunks.length > 0 && !sortedChunks[sortedChunks.length - 1].isFinal) {
    throw new CryptoError('Last chunk is not marked as final - data may be incomplete')
  }

  const decryptedChunks: Uint8Array[] = []
  let totalSize = 0
  for (let i = 0; i < sortedChunks.length; i++) {
    const decryptedChunk = decryptChunk(key, sortedChunks[i], associatedData)
    decryptedChunks.push(decryptedChunk)
    totalSize += decryptedChunk.length
    
    if (onProgress) {
      onProgress({
        bytesProcessed: totalSize,
        totalBytes: totalSize,
        chunksComplete: i + 1,
        totalChunks: sortedChunks.length
      })
    }
  }

  const result = new Uint8Array(totalSize)
  let offset = 0
  for (const decryptedChunk of decryptedChunks) {
    result.set(decryptedChunk, offset)
    offset += decryptedChunk.length
  }
  
  return result
}

async function decryptChunkMeasuredNativeOptional(
  key: Uint8Array,
  encryptedChunk: EncryptedChunk,
  associatedData?: Uint8Array,
): Promise<{ plaintext: Uint8Array; source: Exclude<MediaCryptoSource, 'mixed'> }> {
  assertChunkMetadata(encryptedChunk.index, 'Chunk index')
  assertChunkMetadata(encryptedChunk.originalSize, 'Chunk original size')
  const chunkAD = createChunkAssociatedData(
    encryptedChunk.index,
    encryptedChunk.originalSize,
    encryptedChunk.isFinal,
    associatedData,
  )
  const decrypted = await decryptAESMeasuredNativeOptional(
    key,
    encryptedChunk.ciphertext,
    encryptedChunk.nonce,
    encryptedChunk.tag,
    chunkAD,
  )
  if (decrypted.plaintext.length !== encryptedChunk.originalSize) {
    throw new CryptoError('Chunk original size mismatch')
  }
  return decrypted
}

async function decryptBinaryChunkedMeasuredNativeOptional(
  key: Uint8Array,
  chunks: EncryptedChunk[],
  associatedData?: Uint8Array,
  onProgress?: MediaEncryptionOptions['onProgress'],
): Promise<{ plaintext: Uint8Array; source: MediaCryptoSource }> {
  const sortedChunks = [...chunks].sort((a, b) => a.index - b.index)
  for (let i = 0; i < sortedChunks.length; i++) {
    if (sortedChunks[i].index !== i) {
      throw new CryptoError(`Missing chunk at index ${i}`)
    }
  }
  if (sortedChunks.length > 0 && !sortedChunks[sortedChunks.length - 1].isFinal) {
    throw new CryptoError('Last chunk is not marked as final - data may be incomplete')
  }

  const decryptedChunks: Uint8Array[] = []
  const sources: Array<Exclude<MediaCryptoSource, 'mixed'>> = []
  let totalSize = 0
  for (let i = 0; i < sortedChunks.length; i++) {
    const decryptedChunk = await decryptChunkMeasuredNativeOptional(key, sortedChunks[i], associatedData)
    decryptedChunks.push(decryptedChunk.plaintext)
    sources.push(decryptedChunk.source)
    totalSize += decryptedChunk.plaintext.length
    onProgress?.({
      bytesProcessed: totalSize,
      totalBytes: totalSize,
      chunksComplete: i + 1,
      totalChunks: sortedChunks.length,
    })
  }

  const result = new Uint8Array(totalSize)
  let offset = 0
  for (const decryptedChunk of decryptedChunks) {
    result.set(decryptedChunk, offset)
    offset += decryptedChunk.length
  }
  return { plaintext: result, source: resolveMediaCryptoSource(sources) }
}

/**
 * Compute content hash for integrity verification
 * 
 * @param data Binary data to hash
 * @returns SHA-256 hash as hex string
 */
export function computeContentHash(data: Uint8Array): string {
  return sha256Hash(data)
}

export async function computeContentHashMeasuredAsync(data: Uint8Array): Promise<ContentHashMetrics> {
  const startedAt = nowMs()
  const nativeModule = getNativeMediaCryptoModule()

  if (nativeModule) {
    try {
      const hash = await nativeModule.sha256(bytesToBase64(data))
      if (isHexSha256(hash)) {
        return {
          hash: hash.toLowerCase(),
          source: 'native',
          elapsedMs: nowMs() - startedAt,
          bytes: data.length,
        }
      }
    } catch {
      // Fall through to the JS implementation.
    }
  }

  return {
    hash: computeContentHash(data),
    source: 'js',
    elapsedMs: nowMs() - startedAt,
    bytes: data.length,
  }
}

/**
 * Verify content integrity by comparing hashes
 * 
 * @param data Decrypted data
 * @param expectedHash Expected SHA-256 hash (hex)
 * @returns True if hash matches
 */
export function verifyContentIntegrity(data: Uint8Array, expectedHash: string): boolean {
  const actualHash = computeContentHash(data)
  try {
    return constantTimeEqual(hexToBytes(actualHash), hexToBytes(expectedHash))
  } catch {
    return false
  }
}

/**
 * Encrypt media metadata
 * 
 * @param key Encryption key
 * @param metadata Media metadata object
 * @param associatedData Optional AAD
 * @returns Encrypted metadata
 */
export function encryptMetadata(
  key: Uint8Array,
  metadata: MediaMetadata,
  associatedData?: Uint8Array
): { ciphertext: string; nonce: string; tag: string } {
  const metadataJson = JSON.stringify(metadata)
  const metadataBytes = stringToBytes(metadataJson)
  return encryptAES(key, metadataBytes, associatedData)
}

/**
 * Decrypt media metadata
 * 
 * @param key Decryption key
 * @param encryptedMetadata Encrypted metadata
 * @param associatedData Optional AAD
 * @returns Decrypted metadata object
 */
export function decryptMetadata(
  key: Uint8Array,
  encryptedMetadata: { ciphertext: string; nonce: string; tag: string },
  associatedData?: Uint8Array
): MediaMetadata {
  const decryptedBytes = decryptAES(
    key,
    encryptedMetadata.ciphertext,
    encryptedMetadata.nonce,
    encryptedMetadata.tag,
    associatedData
  )
  const metadataJson = bytesToString(decryptedBytes)
  return JSON.parse(metadataJson) as MediaMetadata
}

/**
 * Encrypt a complete media attachment (metadata + content)
 * 
 * This is the high-level function for encrypting any media attachment
 * (images, documents, stickers, voice notes, etc.) with AES-256-GCM.
 * Spectra's chat flow supplies a per-attachment random key and transports that
 * key inside encrypted message content; this helper does not impose a session
 * or key-establishment scheme.
 * 
 * @param key 32-byte encryption key
 * @param content Binary content to encrypt
 * @param metadata Media metadata
 * @param options Encryption options
 * @returns Encrypted media attachment
 */
export function encryptMedia(
  key: Uint8Array,
  content: Uint8Array,
  metadata: MediaMetadata,
  options: MediaEncryptionOptions = {}
): EncryptedMedia {
  const contentHash = options.contentHash ?? computeContentHash(content)
  const metadataWithHash: MediaMetadata = {
    ...metadata,
    contentHash
  }
  
  // Encrypt metadata
  const encryptedMetadata = encryptMetadata(key, metadataWithHash, options.associatedData)
  
  // Encrypt content (with chunking for large files)
  const encryptedContent = encryptBinaryChunked(key, content, options)
  
  // Determine if chunked
  const isChunked = Array.isArray(encryptedContent)
  
  // Calculate encrypted size
  let encryptedSize: number
  if (isChunked) {
    encryptedSize = (encryptedContent as EncryptedChunk[]).reduce((sum, chunk) => {
      return sum + base64ToBytes(chunk.ciphertext).length + NONCE_LENGTH + TAG_LENGTH
    }, 0)
  } else {
    encryptedSize = base64ToBytes((encryptedContent as { ciphertext: string }).ciphertext).length + NONCE_LENGTH + TAG_LENGTH
  }
  
  return {
    id: generateMediaId(),
    mediaType: metadata.mediaType,
    encryptedMetadata,
    encryptedContent,
    isChunked,
    totalChunks: isChunked ? (encryptedContent as EncryptedChunk[]).length : undefined,
    encryptedSize,
    version: 1
  }
}

export async function encryptMediaMeasuredAsync(
  key: Uint8Array,
  content: Uint8Array,
  metadata: MediaMetadata,
  options: MediaEncryptionOptions = {}
): Promise<MeasuredEncryptedMedia> {
  const totalStartedAt = nowMs()
  const sources: MediaCryptoSource[] = []
  let hashMs = 0
  let contentHash = options.contentHash

  if (!contentHash) {
    const hashMetrics = await computeContentHashMeasuredAsync(content)
    contentHash = hashMetrics.hash
    hashMs = hashMetrics.elapsedMs
    sources.push(hashMetrics.source)
  }

  const metadataWithHash: MediaMetadata = {
    ...metadata,
    contentHash,
  }

  const metadataJson = JSON.stringify(metadataWithHash)
  const metadataBytes = stringToBytes(metadataJson)
  const encryptedMetadataResult = await encryptAESMeasuredNativeOptional(
    key,
    metadataBytes,
    options.associatedData,
  )
  const encryptedMetadata = encryptedMetadataResult.encrypted
  sources.push(encryptedMetadataResult.source)
  const encryptionStartedAt = nowMs()
  const { encryptedContent, source } = await encryptBinaryChunkedMeasuredNativeOptional(key, content, options)
  sources.push(source)

  const isChunked = Array.isArray(encryptedContent)
  let encryptedSize: number
  if (isChunked) {
    encryptedSize = (encryptedContent as EncryptedChunk[]).reduce((sum, chunk) => {
      return sum + base64ToBytes(chunk.ciphertext).length + NONCE_LENGTH + TAG_LENGTH
    }, 0)
  } else {
    encryptedSize = base64ToBytes((encryptedContent as { ciphertext: string }).ciphertext).length + NONCE_LENGTH + TAG_LENGTH
  }

  const encrypted: EncryptedMedia = {
    id: generateMediaId(),
    mediaType: metadata.mediaType,
    encryptedMetadata,
    encryptedContent,
    isChunked,
    totalChunks: isChunked ? (encryptedContent as EncryptedChunk[]).length : undefined,
    encryptedSize,
    version: 1,
  }

  return {
    encrypted,
    performance: {
      source: combineMediaCryptoSources(sources),
      hashMs,
      encryptMs: nowMs() - encryptionStartedAt,
      totalMs: nowMs() - totalStartedAt,
      sourceBytes: content.length,
      isChunked,
      totalChunks: encrypted.totalChunks,
    },
  }
}

/**
 * Decrypt a complete media attachment
 * 
 * @param key 32-byte decryption key
 * @param encryptedMedia Encrypted media attachment
 * @param options Decryption options
 * @returns Decrypted media with content and metadata
 */
export function decryptMedia(
  key: Uint8Array,
  encryptedMedia: EncryptedMedia,
  options: { associatedData?: Uint8Array; onProgress?: MediaEncryptionOptions['onProgress'] } = {}
): DecryptedMedia {
  // Decrypt metadata first
  const metadata = decryptMetadata(key, encryptedMedia.encryptedMetadata, options.associatedData)
  
  // Decrypt content
  let content: Uint8Array
  if (encryptedMedia.isChunked) {
    content = decryptBinaryChunked(
      key,
      encryptedMedia.encryptedContent as EncryptedChunk[],
      options.associatedData,
      options.onProgress
    )
  } else {
    const singleContent = encryptedMedia.encryptedContent as { ciphertext: string; nonce: string; tag: string }
    content = decryptBinary(
      key,
      singleContent.ciphertext,
      singleContent.nonce,
      singleContent.tag,
      options.associatedData
    )
  }
  
  // Verify content integrity
  const integrityVerified = verifyContentIntegrity(content, metadata.contentHash)
  
  if (!integrityVerified) {
    throw new CryptoError('Media content integrity verification failed - hash mismatch')
  }
  
  return {
    id: encryptedMedia.id,
    content,
    metadata,
    integrityVerified
  }
}

export async function decryptMediaMeasuredAsync(
  key: Uint8Array,
  encryptedMedia: EncryptedMedia,
  options: { associatedData?: Uint8Array; onProgress?: MediaEncryptionOptions['onProgress'] } = {},
): Promise<DecryptedMedia> {
  const encryptedMetadata = encryptedMedia.encryptedMetadata
  const decryptedMetadata = await decryptAESMeasuredNativeOptional(
    key,
    encryptedMetadata.ciphertext,
    encryptedMetadata.nonce,
    encryptedMetadata.tag,
    options.associatedData,
  )
  const metadata = JSON.parse(bytesToString(decryptedMetadata.plaintext)) as MediaMetadata
  let content: Uint8Array
  if (encryptedMedia.isChunked) {
    const decrypted = await decryptBinaryChunkedMeasuredNativeOptional(
      key,
      encryptedMedia.encryptedContent as EncryptedChunk[],
      options.associatedData,
      options.onProgress,
    )
    content = decrypted.plaintext
  } else {
    const singleContent = encryptedMedia.encryptedContent as { ciphertext: string; nonce: string; tag: string }
    const decrypted = await decryptAESMeasuredNativeOptional(
      key,
      singleContent.ciphertext,
      singleContent.nonce,
      singleContent.tag,
      options.associatedData,
    )
    content = decrypted.plaintext
  }

  const integrityVerified = verifyContentIntegrity(content, metadata.contentHash)
  if (!integrityVerified) {
    throw new CryptoError('Media content integrity verification failed - hash mismatch')
  }

  return {
    id: encryptedMedia.id,
    content,
    metadata,
    integrityVerified,
  }
}

export interface MeasuredEncryptedMediaFile {
  encrypted: EncryptedMedia
  blobPath: string
  blobBytes: number
  performance: MediaEncryptionMetrics
}

export async function encryptMediaToBlobFileMeasuredAsync(
  key: Uint8Array,
  plaintextPath: string,
  destBlobPath: string,
  destCiphertextPath: string,
  metadata: MediaMetadata,
  options: MediaEncryptionOptions = {},
): Promise<MeasuredEncryptedMediaFile> {
  const native = getNativeMediaCryptoModule()
  if (!native?.sha256File || !native.encryptAesGcmFile || !native.writeMediaBlob) {
    throw new CryptoError('Native media file crypto is unavailable')
  }
  if (key.length !== 32) {
    throw new CryptoError('AES key must be 32 bytes')
  }

  const totalStartedAt = nowMs()
  const aad = options.associatedData ? bytesToBase64(options.associatedData) : null
  const hashStartedAt = nowMs()
  const hash = (options.contentHash ?? await native.sha256File(plaintextPath)).toLowerCase()
  if (!isHexSha256(hash)) {
    throw new CryptoError('Native media SHA-256 returned an invalid digest')
  }
  const hashMs = nowMs() - hashStartedAt
  const metadataWithHash: MediaMetadata = { ...metadata, contentHash: hash }
  const encryptedMetadataResult = await encryptAESMeasuredNativeOptional(
    key,
    stringToBytes(JSON.stringify(metadataWithHash)),
    options.associatedData,
  )
  const encryptionStartedAt = nowMs()
  const encryptedContent = await native.encryptAesGcmFile(
    bytesToBase64(key),
    plaintextPath,
    destCiphertextPath,
    aad,
    nextNativeAesJobId(),
  )
  const encryptedSize = encryptedContent.ciphertextBytes + NONCE_LENGTH + TAG_LENGTH
  const mediaId = generateMediaId()
  const headerJson = JSON.stringify({
    id: mediaId,
    mediaType: metadata.mediaType,
    encryptedMetadata: encryptedMetadataResult.encrypted,
    isChunked: false,
    encryptedSize,
    version: 1,
  })
  const blobWrite = await native.writeMediaBlob(
    headerJson,
    destCiphertextPath,
    encryptedContent.nonce,
    encryptedContent.tag,
    destBlobPath,
  )
  const blobBytes = blobWrite?.bytes
  const maxBlobBytes = Math.ceil(MAX_MEDIA_FILE_BYTES * 4 / 3) + 64 * 1024 + 256
  if (
    typeof blobBytes !== 'number'
    || !Number.isFinite(blobBytes)
    || blobBytes <= 4
    || blobBytes > maxBlobBytes
  ) {
    throw new CryptoError('Native media blob write returned an invalid size')
  }

  return {
    encrypted: {
      id: mediaId,
      mediaType: metadata.mediaType,
      encryptedMetadata: encryptedMetadataResult.encrypted,
      encryptedContent: {
        ciphertext: '',
        nonce: encryptedContent.nonce,
        tag: encryptedContent.tag,
      },
      isChunked: false,
      encryptedSize,
      version: 1,
    },
    blobPath: destBlobPath,
    blobBytes,
    performance: {
      source: encryptedMetadataResult.source === 'native' ? 'native' : 'mixed',
      hashMs,
      encryptMs: nowMs() - encryptionStartedAt,
      totalMs: nowMs() - totalStartedAt,
      sourceBytes: encryptedContent.ciphertextBytes,
      isChunked: false,
    },
  }
}

export async function decryptMediaFromBlobFileMeasuredAsync(
  key: Uint8Array,
  blobPath: string,
  destPlaintextPath: string,
  options: { associatedData?: Uint8Array } = {},
): Promise<{ metadata: MediaMetadata; destPath: string; plaintextBytes: number; id: string }> {
  const native = getNativeMediaCryptoModule()
  if (!native?.decryptMediaBlobFile || !native.sha256File) {
    throw new CryptoError('Native media file crypto is unavailable')
  }
  if (key.length !== 32) {
    throw new CryptoError('AES key must be 32 bytes')
  }

  const result = await native.decryptMediaBlobFile(
    bytesToBase64(key),
    blobPath,
    destPlaintextPath,
    options.associatedData ? bytesToBase64(options.associatedData) : null,
    nextNativeAesJobId(),
  )
  let header: { id?: string; encryptedMetadata?: EncryptedMedia['encryptedMetadata'] }
  try {
    header = JSON.parse(result.headerJson) as {
      id?: string
      encryptedMetadata?: EncryptedMedia['encryptedMetadata']
    }
  } catch {
    throw new CryptoError('Native media blob returned an invalid header')
  }
  if (!header.id || !header.encryptedMetadata) {
    throw new CryptoError('Native media blob returned an invalid header')
  }
  const decryptedMetadata = await decryptAESMeasuredNativeOptional(
    key,
    header.encryptedMetadata.ciphertext,
    header.encryptedMetadata.nonce,
    header.encryptedMetadata.tag,
    options.associatedData,
  )
  const metadata = JSON.parse(bytesToString(decryptedMetadata.plaintext)) as MediaMetadata
  const actualHash = (await native.sha256File(destPlaintextPath)).toLowerCase()
  if (!isHexSha256(actualHash) || !isHexSha256(metadata.contentHash)) {
    throw new CryptoError('Media content integrity verification failed - hash mismatch')
  }
  try {
    if (!constantTimeEqual(hexToBytes(actualHash), hexToBytes(metadata.contentHash))) {
      throw new CryptoError('Media content integrity verification failed - hash mismatch')
    }
  } catch (error) {
    if (error instanceof CryptoError) throw error
    throw new CryptoError('Media content integrity verification failed - hash mismatch')
  }

  return {
    metadata,
    destPath: destPlaintextPath,
    plaintextBytes: result.plaintextBytes,
    id: header.id,
  }
}

/**
 * Generate a unique media attachment ID (UUID v4 format)
 * Uses the generateUUID utility for proper UUID generation
 */
function generateMediaId(): string {
  // Generate UUID v4 format for database compatibility
  const bytes = generateRandomBytes(16)
  // Set version (4) and variant (RFC4122)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join('-')
}
