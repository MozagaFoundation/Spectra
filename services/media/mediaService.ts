/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { File } from 'expo-file-system'
import * as FileSystem from 'expo-file-system/legacy'
import { Platform } from 'react-native'
import { isSpectraBackendConfigured } from '@/services/backend/client'
import { backendData } from '@/services/backend/data'
import {
  ensureBoundBackendAccessForIdentity,
  getValidBackendAccessToken,
} from '../backend/session'
import { torAwareFetchBytes, type TorByteResponse } from '@/services/tor/torFetch'
import {
  deleteObjectWithBackend,
  signObjectDownloadWithBackend,
  uploadObjectWithBackend,
} from '@/services/backend/objectStorage'
import {
  mobileLogDebug,
  mobileLogError,
  mobileLogWarn,
} from '@/services/logging/mobileLogger'
import type { MediaAttachment, MediaType } from '@/lib/types'
import {
  isPreparedOutgoingMediaAttachment,
  prepareOutgoingMediaAttachment,
  releasePreparedOutgoingMediaAttachment,
  type PreparedOutgoingMediaAttachment,
} from './outgoingAttachment'
import {
  registerMediaSendUpload,
  requestMediaSendAbandonment,
} from './mediaSendOutbox'

import {
  encryptMediaMeasuredAsync,
  encryptMediaToBlobFileMeasuredAsync,
  canUseNativeMediaFileCrypto,
  NATIVE_MEDIA_FILE_THRESHOLD_BYTES,
  decryptMediaMeasuredAsync,
  decryptMediaFromBlobFileMeasuredAsync,
  computeContentHash,
  generateRandomBytes,
  bytesToBase64,
  base64ToBytes,
} from '@spectra/core-crypto'
import type {
  DecryptedMedia,
  EncryptedMedia,
  MediaMetadata,
} from '@spectra/core-crypto'
import {
  ATTACHMENT_PIPELINE_EVENT_NAME,
  buildAttachmentPipelineFields,
  summarizeAttachmentObjectPath,
  tagAttachmentPipelineError,
  type AttachmentDiagnosticRecorder,
  type AttachmentPipelineStage,
  type AttachmentPipelineTraceContext,
} from '@spectra/core-crypto/client/attachmentDiagnostics'
import {
  ATTACHMENT_HYDRATION_EVENT_NAME,
  ATTACHMENT_HYDRATION_FAILURE_EVENT_NAME,
  buildAttachmentHydrationFailureFields,
  buildAttachmentHydrationFields,
  createAttachmentHydrationCorrelationId,
  type AttachmentHydrationDiagnostics,
} from './attachmentHydrationDiagnostics'

declare const __DEV__: boolean | undefined


export interface UploadedMedia {
  id: string
  storagePath: string
  downloadUrl: string
  encryptedMetadata: {
    ciphertext: string
    nonce: string
    tag: string
  }
  mediaType: MediaType
  encryptedSize: number
  contentHash: string
  isChunked: boolean
  totalChunks?: number
}

export interface MediaUploadProgress {
  bytesUploaded: number
  totalBytes: number
  percentage: number
  stage: 'encrypting' | 'uploading' | 'finalizing'
}

export interface MediaDownloadProgress {
  bytesDownloaded: number
  totalBytes: number
  percentage: number
  stage: 'downloading' | 'decrypting' | 'finalizing'
}

export interface RemoteMediaDisposition {
  remoteObjectRef: string
  shouldConsumeRemote: boolean
}

export interface MediaUploadDiagnostics extends AttachmentPipelineTraceContext {
  recordDiagnostic?: AttachmentDiagnosticRecorder
}

export type MediaDownloadDiagnostics = AttachmentHydrationDiagnostics

export interface MediaUploadPerformanceMetrics {
  source: 'js' | 'native' | 'mixed'
  hashSource: 'js' | 'native'
  encryptSource: 'js' | 'native' | 'mixed'
  fileReadMs: number
  hashMs: number
  encryptMs: number
  blobBuildMs: number
  tempWriteMs: number
  authHeadersMs: number
  uploadMs: number
  metadataInsertMs: number
  totalMs: number
  sourceBytes: number
  uploadBytes: number
  isChunked: boolean
  totalChunks?: number
}

type TorDownloadCandidateEncoding = 'default' | 'latin1' | 'utf8' | 'base64'
type TorDownloadFailureStage = 'size_mismatch' | 'blob_parse' | 'decrypt' | 'integrity'

interface TorDownloadCandidate {
  encoding: TorDownloadCandidateEncoding
  bytes: Uint8Array
  matchesExpectedSize: boolean
}

interface TorDownloadCandidateFailure {
  encoding: TorDownloadCandidateEncoding
  length: number
  failureStage: TorDownloadFailureStage
  error: string
}

interface TorDownloadSelection {
  bytes: Uint8Array
  encoding: TorDownloadCandidateEncoding
  encrypted: EncryptedMedia | null
  decrypted: DecryptedMedia
  plaintextPath?: string
  candidateCount: number
  failures: TorDownloadCandidateFailure[]
}

const TOR_DOWNLOAD_CANDIDATE_PRIORITY: Record<TorDownloadCandidateEncoding, number> = {
  base64: 0,
  latin1: 1,
  utf8: 2,
  default: 3,
}

const MEDIA_UPLOAD_LOG_PREFIX = 'MediaUpload'
const MEDIA_DOWNLOAD_LOG_PREFIX = 'MediaDownload'

function nowMs(): number {
  return globalThis.performance?.now?.() ?? Date.now()
}

function combineMediaUploadCryptoSource(
  hashSource: MediaUploadPerformanceMetrics['hashSource'],
  encryptSource: MediaUploadPerformanceMetrics['encryptSource'],
): MediaUploadPerformanceMetrics['source'] {
  if (encryptSource === 'mixed' || hashSource !== encryptSource) {
    return 'mixed'
  }
  return hashSource
}

function shouldLogMediaDiagnostics(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true
}

function summarizeLogValue(value?: string | null): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  if (value.length <= 96) {
    return value
  }

  return `${value.slice(0, 40)}...${value.slice(-32)}`
}

function getUriScheme(value?: string | null): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  const match = value.match(/^([a-z0-9+.-]+):/i)
  return match?.[1]?.toLowerCase() ?? 'unknown'
}

function getFileExtension(fileName?: string | null, uri?: string | null): string | null {
  const candidates = [fileName, uri]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || candidate.length === 0) {
      continue
    }

    const normalized = candidate.trim()
    const queryStart = normalized.indexOf('?')
    const cleanValue = queryStart >= 0 ? normalized.slice(0, queryStart) : normalized
    const slashIndex = cleanValue.lastIndexOf('/')
    const fileSegment = slashIndex >= 0 ? cleanValue.slice(slashIndex + 1) : cleanValue
    const dotIndex = fileSegment.lastIndexOf('.')

    if (dotIndex > 0 && dotIndex < fileSegment.length - 1) {
      return fileSegment.slice(dotIndex + 1).toLowerCase()
    }
  }

  return null
}

function summarizeHexRange(bytes: Uint8Array, count: number, fromEnd = false): string | null {
  if (bytes.length === 0) {
    return null
  }

  const sample = fromEnd ? bytes.slice(-count) : bytes.slice(0, count)
  return Array.from(sample)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ')
}

function inferBinaryFormatHint(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg'
  }

  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return 'png'
  }

  if (bytes.length >= 6) {
    const header = String.fromCharCode(...bytes.slice(0, 6))
    if (header === 'GIF87a' || header === 'GIF89a') {
      return 'gif'
    }
  }

  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'webp'
  }

  if (bytes.length >= 12) {
    const brand = String.fromCharCode(...bytes.slice(4, 12))
    if (brand.startsWith('ftypheic') || brand.startsWith('ftypheix')) {
      return 'heic'
    }
    if (brand.startsWith('ftypheif')) {
      return 'heif'
    }
  }

  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') {
    return 'pdf'
  }

  return 'unknown'
}

function describeBinaryFingerprint(
  label: string,
  bytes: Uint8Array,
  options: {
    includeHash?: boolean
    includeFormatHint?: boolean
  } = {},
): Record<string, string | number | null | undefined> {
  const includeHash = options.includeHash ?? shouldLogMediaDiagnostics()
  const includeFormatHint = options.includeFormatHint ?? true

  return {
    [`${label}Bytes`]: bytes.length,
    [`${label}PrefixHex`]: summarizeHexRange(bytes, 12),
    [`${label}SuffixHex`]: summarizeHexRange(bytes, 12, true),
    ...(includeFormatHint ? { [`${label}FormatHint`]: inferBinaryFormatHint(bytes) } : {}),
    ...(includeHash ? { [`${label}Hash`]: computeContentHash(bytes) } : {}),
  }
}

function describeAttachmentForLogs(
  attachment: Pick<MediaAttachment, 'id' | 'type' | 'source' | 'uri' | 'fileName' | 'mimeType' | 'fileSize' | 'width' | 'height' | 'durationMs'>
): Record<string, unknown> {
  return {
    id: attachment.id,
    type: attachment.type,
    source: attachment.source ?? null,
    fileName: attachment.fileName,
    fileExtension: getFileExtension(attachment.fileName, attachment.uri),
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    width: attachment.width,
    height: attachment.height,
    durationMs: attachment.durationMs,
    uri: summarizeLogValue(attachment.uri),
    uriScheme: getUriScheme(attachment.uri),
  }
}

function describeMediaError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const errorWithExtras = error as Error & { code?: unknown; cause?: unknown }
    return {
      name: error.name,
      message: error.message,
      code: errorWithExtras.code ?? null,
      cause: errorWithExtras.cause ? summarizeLogValue(String(errorWithExtras.cause)) : null,
      stack: error.stack ? summarizeLogValue(error.stack) : null,
    }
  }

  if (typeof error === 'object' && error !== null) {
    const errorRecord = error as Record<string, unknown>
    let serializedDetails: string | null = null
    try {
      serializedDetails = JSON.stringify(errorRecord)
    } catch {
      serializedDetails = String(error)
    }

    return {
      name: typeof errorRecord.name === 'string' ? errorRecord.name : null,
      message: typeof errorRecord.message === 'string' ? errorRecord.message : String(error),
      code: errorRecord.code ?? null,
      details: summarizeLogValue(serializedDetails),
    }
  }

  return {
    message: String(error),
  }
}

function logMediaUpload(event: string, details?: Record<string, unknown>): void {
  if (!shouldLogMediaDiagnostics()) return
  mobileLogDebug(MEDIA_UPLOAD_LOG_PREFIX, event, details)
}

function logMediaUploadTransport(event: string, details?: Record<string, unknown>): void {
  mobileLogDebug(MEDIA_UPLOAD_LOG_PREFIX, event, details)
}

function logMediaDownload(event: string, details?: Record<string, unknown>): void {
  if (!shouldLogMediaDiagnostics()) return
  mobileLogDebug(MEDIA_DOWNLOAD_LOG_PREFIX, event, details)
}

function recordHydrationStage(
  diagnostics: MediaDownloadDiagnostics | undefined,
  stage: string,
  extraFields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  diagnostics?.recordDiagnostic?.(
    ATTACHMENT_HYDRATION_EVENT_NAME,
    buildAttachmentHydrationFields(stage, diagnostics, extraFields),
  )
}

function recordHydrationFailure(
  diagnostics: MediaDownloadDiagnostics | undefined,
  failureStage: string,
  error: unknown,
  lastSuccessfulStage?: string | null,
  extraFields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  diagnostics?.recordDiagnostic?.(
    ATTACHMENT_HYDRATION_FAILURE_EVENT_NAME,
    buildAttachmentHydrationFailureFields(diagnostics, {
      failureStage,
      lastSuccessfulStage,
      error: error instanceof Error ? error.message : String(error),
      statusCode:
        typeof extraFields.statusCode === 'number' ? extraFields.statusCode : undefined,
    }),
  )
}

function resolveMediaDownloadDiagnostics(
  mediaId: string,
  diagnostics?: MediaDownloadDiagnostics,
): MediaDownloadDiagnostics {
  return {
    ...diagnostics,
    correlationId:
      diagnostics?.correlationId ?? createAttachmentHydrationCorrelationId(mediaId),
    mediaId: diagnostics?.mediaId ?? mediaId,
  }
}

function buildMediaTransportCorrelationId(encryptedId: string): string {
  return `media:${encryptedId}`
}

function describeMediaTransportHint(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error)

  if (/ArrayBuffer|ArrayBufferView|Blob/i.test(message)) {
    return 'Native upload failed while building or serializing the request body before any HTTP response.'
  }

  if (/Network request failed/i.test(message)) {
    return 'Native upload failed after body creation, during fetch dispatch or transport.'
  }

  return null
}

async function writeBytesToFile(bytes: Uint8Array, uri: string): Promise<void> {
  const file = new File(uri)
  file.create({ intermediates: true, overwrite: true })
  file.write(bytes)
}

function generateStoragePath(
  senderId: string,
  recipientId: string,
  mediaId: string,
  extension: string = 'enc'
): string {
  const timestamp = Date.now()
  return `${senderId}/${recipientId}/${timestamp}_${mediaId}.${extension}`
}

function encryptedToBlob(encrypted: EncryptedMedia): Uint8Array {
  const contentJson = JSON.stringify({
    id: encrypted.id,
    mediaType: encrypted.mediaType,
    encryptedMetadata: encrypted.encryptedMetadata,
    isChunked: encrypted.isChunked,
    totalChunks: encrypted.totalChunks,
    encryptedSize: encrypted.encryptedSize,
    version: encrypted.version,
  })
  
  const headerBytes = new TextEncoder().encode(contentJson)
  const headerLength = new Uint8Array(4)
  new DataView(headerLength.buffer).setUint32(0, headerBytes.length, true)
  
  let contentBytes: Uint8Array
  if (encrypted.isChunked) {
    const chunks = encrypted.encryptedContent as Array<{
      index: number
      ciphertext: string
      nonce: string
      tag: string
      originalSize: number
      isFinal: boolean
    }>
    const chunksJson = JSON.stringify(chunks)
    contentBytes = new TextEncoder().encode(chunksJson)
  } else {
    const content = encrypted.encryptedContent as { ciphertext: string; nonce: string; tag: string }
    const contentJson2 = JSON.stringify(content)
    contentBytes = new TextEncoder().encode(contentJson2)
  }
  
  const totalLength = 4 + headerBytes.length + contentBytes.length
  const result = new Uint8Array(totalLength)
  result.set(headerLength, 0)
  result.set(headerBytes, 4)
  result.set(contentBytes, 4 + headerBytes.length)
  
  return result
}

function blobToEncrypted(blob: Uint8Array): EncryptedMedia {
  if (blob.length < 4) {
    throw new Error('Malformed encrypted media blob: missing header length')
  }

  const headerLength = new DataView(blob.buffer, blob.byteOffset, 4).getUint32(0, true)
  const maxHeaderLength = 64 * 1024
  if (
    headerLength === 0
    || headerLength > maxHeaderLength
    || 4 + headerLength > blob.length
  ) {
    throw new Error('Malformed encrypted media blob: invalid header length')
  }
  
  const headerBytes = blob.slice(4, 4 + headerLength)
  const headerJson = new TextDecoder().decode(headerBytes)
  const header = JSON.parse(headerJson)
  
  const contentBytes = blob.slice(4 + headerLength)
  if (contentBytes.length === 0) {
    throw new Error('Malformed encrypted media blob: missing content')
  }
  const contentJson = new TextDecoder().decode(contentBytes)
  const encryptedContent = JSON.parse(contentJson)
  
  return {
    id: header.id,
    mediaType: header.mediaType,
    encryptedMetadata: header.encryptedMetadata,
    encryptedContent,
    isChunked: header.isChunked,
    totalChunks: header.totalChunks,
    encryptedSize: header.encryptedSize,
    version: header.version,
  }
}

/**
 * Encrypts and uploads media, returning the key for the encrypted chat message.
 * Direct-message media is removed from storage after download.
 */
export async function uploadEncryptedMedia(
  attachment: MediaAttachment | PreparedOutgoingMediaAttachment,
  senderId: string,
  recipientId: string,
  conversationId: string,
  onProgress?: (progress: MediaUploadProgress) => void,
  diagnostics?: MediaUploadDiagnostics,
): Promise<UploadedMedia & { encryptionKey: string; performance: MediaUploadPerformanceMetrics }> {
  const preparedByCaller = isPreparedOutgoingMediaAttachment(attachment)
  const sourceAttachment = preparedByCaller
    ? attachment.attachment
    : attachment
  const uploadStartedAt = Date.now()
  const uploadLogContext = {
    senderId: summarizeLogValue(senderId),
    recipientId: summarizeLogValue(recipientId),
    conversationId: summarizeLogValue(conversationId),
    attachment: describeAttachmentForLogs(sourceAttachment),
  }
  let lastSuccessfulStage: AttachmentPipelineStage | string | null = 'send_started'
  const performanceStartedAt = nowMs()
  const performanceMetrics: MediaUploadPerformanceMetrics = {
    source: 'js',
    hashSource: 'js',
    encryptSource: 'js',
    fileReadMs: 0,
    hashMs: 0,
    encryptMs: 0,
    blobBuildMs: 0,
    tempWriteMs: 0,
    authHeadersMs: 0,
    uploadMs: 0,
    metadataInsertMs: 0,
    totalMs: 0,
    sourceBytes: 0,
    uploadBytes: 0,
    isChunked: false,
  }
  const recordAttachmentStage = (
    stage: AttachmentPipelineStage,
    contextOverrides: Partial<AttachmentPipelineTraceContext> = {},
    extraFields: Record<string, string | number | boolean | null | undefined> = {},
  ): void => {
    if (!diagnostics?.recordDiagnostic || !diagnostics.attachmentSendId) {
      return
    }

    diagnostics.recordDiagnostic(
      ATTACHMENT_PIPELINE_EVENT_NAME,
      buildAttachmentPipelineFields(
        stage,
        {
          attachmentSendId: diagnostics.attachmentSendId,
          sendStartedAt: diagnostics.sendStartedAt,
          attachmentIndex: diagnostics.attachmentIndex,
          attachmentCount: diagnostics.attachmentCount,
          attempt: diagnostics.attempt ?? 1,
          fileSize: sourceAttachment.fileSize,
          mimeType: sourceAttachment.mimeType,
          bucket: 'chat-media',
          objectPathSummary: contextOverrides.objectPathSummary ?? undefined,
          conversationId,
          optimisticMessageId: diagnostics.optimisticMessageId,
          ...contextOverrides,
        },
        extraFields,
      ),
    )
  }
  const tagUploadFailure = (
    error: unknown,
    failureStage: string,
    details: {
      lastSuccessfulStage?: string | null
      statusCode?: number | null
      failureReason?: string | null
      transient?: boolean | null
    } = {},
  ): Error => tagAttachmentPipelineError(error, {
    failureStage,
    lastSuccessfulStage: details.lastSuccessfulStage ?? lastSuccessfulStage,
    statusCode: details.statusCode,
    failureReason: details.failureReason,
    transient: details.transient,
  })

  logMediaUpload('upload_encrypted_media_start', uploadLogContext)

  if (!isSpectraBackendConfigured()) {
    mobileLogWarn(MEDIA_UPLOAD_LOG_PREFIX, 'upload_encrypted_media_backend_unconfigured', uploadLogContext)
    throw tagUploadFailure(new Error('Backend not configured'), 'upload_encrypt_started')
  }

  const preparedAttachment = preparedByCaller
    ? attachment
    : await prepareOutgoingMediaAttachment(attachment)
  const uploadAttachment = preparedAttachment.attachment
  if (Platform.OS === 'android') {
    mobileLogDebug(MEDIA_UPLOAD_LOG_PREFIX, 'android_normalized_attachment', {
      attachmentId: uploadAttachment.id,
      type: uploadAttachment.type,
      mimeType: uploadAttachment.mimeType,
      uriScheme: getUriScheme(uploadAttachment.uri),
      fileSize: uploadAttachment.fileSize,
    })
  }
  
  onProgress?.({
    bytesUploaded: 0,
    totalBytes: uploadAttachment.fileSize,
    percentage: 0,
    stage: 'encrypting',
  })
  recordAttachmentStage('upload_encrypt_started')
  
  const fileContent = preparedAttachment.ingress.bytes
  const sourceContentHash = preparedAttachment.ingress.digest
  performanceMetrics.sourceBytes = fileContent.length
  logMediaUpload('upload_encrypted_media_input_ready', {
    ...uploadLogContext,
    pickerReportedFileSize: uploadAttachment.fileSize,
    fileSizeDelta: fileContent.length - uploadAttachment.fileSize,
    attachmentUriScheme: getUriScheme(uploadAttachment.uri),
    attachmentFileExtension: getFileExtension(uploadAttachment.fileName, uploadAttachment.uri),
    ...describeBinaryFingerprint('source', fileContent, {
      includeHash: false,
    }),
    sourceContentHash,
  })
  logMediaUpload('upload_encrypted_media_source_diagnostics', {
    ...uploadLogContext,
    pickerReportedFileSize: uploadAttachment.fileSize,
    actualSourceBytes: fileContent.length,
    fileSizeMatchesPicker: uploadAttachment.fileSize === fileContent.length,
    sourceContentHash,
  })
  
  const mediaKey = generateRandomBytes(32)
  const mediaKeyBase64 = bytesToBase64(mediaKey)
  
  const metadata: MediaMetadata = {
    mediaType: uploadAttachment.type,
    fileName: uploadAttachment.fileName,
    mimeType: uploadAttachment.mimeType,
    fileSize: fileContent.length,
    width: uploadAttachment.width,
    height: uploadAttachment.height,
    durationMs: uploadAttachment.durationMs,
    waveform: uploadAttachment.waveform,
    contentHash: '',
    createdAt: Date.now(),
  }
  
  let encrypted: EncryptedMedia
  let nativeBlobPath: string | null = null
  let nativeBlobBytes = 0
  const encryptionStartedAt = nowMs()
  try {
    const cacheDir = FileSystem.cacheDirectory
    if (
      canUseNativeMediaFileCrypto()
      && fileContent.length >= NATIVE_MEDIA_FILE_THRESHOLD_BYTES
      && cacheDir
    ) {
      const plaintextPath = `${cacheDir}media-pt-${uploadAttachment.id}`
      const ciphertextPath = `${cacheDir}media-ct-${uploadAttachment.id}`
      const destBlobPath = `${cacheDir}media-blob-${uploadAttachment.id}.enc`
      try {
        await writeBytesToFile(fileContent, plaintextPath)
        const encryptionResult = await encryptMediaToBlobFileMeasuredAsync(
          mediaKey,
          plaintextPath,
          destBlobPath,
          ciphertextPath,
          metadata,
          { contentHash: sourceContentHash },
        )
        encrypted = encryptionResult.encrypted
        nativeBlobPath = encryptionResult.blobPath
        nativeBlobBytes = encryptionResult.blobBytes
        const info = await FileSystem.getInfoAsync(nativeBlobPath)
        if (!info.exists || typeof info.size !== 'number' || info.size <= 0 || info.size !== nativeBlobBytes) {
          throw new Error('Native media blob size mismatch')
        }
        performanceMetrics.uploadBytes = info.size
        performanceMetrics.encryptMs = encryptionResult.performance.encryptMs || (nowMs() - encryptionStartedAt)
        performanceMetrics.encryptSource = encryptionResult.performance.source
      } finally {
        try {
          new File(plaintextPath).delete()
          new File(ciphertextPath).delete()
        } catch {
          // Best-effort wipe of plaintext/ciphertext scratch files.
        }
      }
    } else {
      const encryptionResult = await encryptMediaMeasuredAsync(mediaKey, fileContent, metadata, {
        contentHash: sourceContentHash,
        onProgress: (encProgress) => {
          onProgress?.({
            bytesUploaded: 0,
            totalBytes: uploadAttachment.fileSize,
            percentage: Math.floor((encProgress.bytesProcessed / encProgress.totalBytes) * 30),
            stage: 'encrypting',
          })
        },
      })
      encrypted = encryptionResult.encrypted
      performanceMetrics.encryptMs = encryptionResult.performance.encryptMs || (nowMs() - encryptionStartedAt)
      performanceMetrics.encryptSource = encryptionResult.performance.source
    }
    performanceMetrics.source = combineMediaUploadCryptoSource(
      performanceMetrics.hashSource,
      performanceMetrics.encryptSource,
    )
    performanceMetrics.isChunked = encrypted.isChunked
    performanceMetrics.totalChunks = encrypted.totalChunks
    logMediaUpload('upload_encrypted_media_encrypt_success', {
      ...uploadLogContext,
      encryptedId: encrypted.id,
      encryptedSize: encrypted.encryptedSize,
      isChunked: encrypted.isChunked,
      totalChunks: encrypted.totalChunks,
      sourceContentHash,
      source: performanceMetrics.source,
      hashSource: performanceMetrics.hashSource,
      encryptSource: performanceMetrics.encryptSource,
      elapsedMs: Math.round(performanceMetrics.encryptMs),
    })
    recordAttachmentStage('upload_encrypt_succeeded')
    lastSuccessfulStage = 'upload_encrypt_succeeded'
  } catch (error) {
    mobileLogError(MEDIA_UPLOAD_LOG_PREFIX, 'upload_encrypted_media_encrypt_failed', {
      ...uploadLogContext,
      sourceBytes: fileContent.length,
      elapsedMs: Math.round(nowMs() - encryptionStartedAt),
      error: describeMediaError(error),
    })
    if (!preparedByCaller) {
      await releasePreparedOutgoingMediaAttachment(preparedAttachment).catch(() => undefined)
    }
    throw tagUploadFailure(error, 'upload_encrypt_started')
  }
  
  const blobBuildStartedAt = nowMs()
  const uploadBlob = nativeBlobPath ? null : encryptedToBlob(encrypted)
  performanceMetrics.blobBuildMs = nowMs() - blobBuildStartedAt
  if (!nativeBlobPath) {
    performanceMetrics.uploadBytes = uploadBlob?.length ?? 0
  }
  
  const storagePath = generateStoragePath(senderId, recipientId, encrypted.id)
  logMediaUpload('upload_encrypted_media_blob_ready', {
    ...uploadLogContext,
    encryptedId: encrypted.id,
    uploadBytes: performanceMetrics.uploadBytes,
    storagePath,
    nativeBlob: Boolean(nativeBlobPath),
  })
  
  onProgress?.({
    bytesUploaded: 0,
    totalBytes: performanceMetrics.uploadBytes,
    percentage: 30,
    stage: 'uploading',
  })
  
  const tempFileUri = nativeBlobPath ?? `${FileSystem.cacheDirectory}upload_${encrypted.id}.enc`
  const tempFile = new File(tempFileUri)
  const tempWriteStartedAt = nowMs()
  try {
    if (!nativeBlobPath) {
      tempFile.create({ intermediates: true, overwrite: true })
      tempFile.write(uploadBlob!)
    }
    performanceMetrics.tempWriteMs = nowMs() - tempWriteStartedAt
    logMediaUpload('upload_encrypted_media_temp_file_ready', {
      ...uploadLogContext,
      encryptedId: encrypted.id,
      tempFileUri: summarizeLogValue(tempFileUri),
      tempFileUriScheme: getUriScheme(tempFileUri),
      tempFileExists: tempFile.exists,
      uploadBytes: performanceMetrics.uploadBytes,
    })
    recordAttachmentStage('upload_temp_file_succeeded', {
      objectPathSummary: summarizeAttachmentObjectPath(storagePath),
    })
    lastSuccessfulStage = 'upload_temp_file_succeeded'
  } catch (error) {
    mobileLogError(MEDIA_UPLOAD_LOG_PREFIX, 'upload_encrypted_media_temp_file_failed', {
      ...uploadLogContext,
      encryptedId: encrypted.id,
      tempFileUri: summarizeLogValue(tempFileUri),
      uploadBytes: performanceMetrics.uploadBytes,
      error: describeMediaError(error),
    })
    if (!preparedByCaller) {
      await releasePreparedOutgoingMediaAttachment(preparedAttachment).catch(() => undefined)
    }
    throw tagUploadFailure(error, 'upload_temp_file_succeeded')
  }
  
  let metadataPersisted = false
  let uploadRegistered = false
  let uploadedObjectRef = ''
  let accessToken: string | null = null
  try {
    const transportCaller = 'media.uploadEncryptedMedia'
    const transportCorrelationId = buildMediaTransportCorrelationId(encrypted.id)
    const storageUploadContext = {
      ...uploadLogContext,
      encryptedId: encrypted.id,
      storagePath,
      tempFileUri: summarizeLogValue(tempFileUri),
      uploadBytes: performanceMetrics.uploadBytes,
      transportCaller,
      transportCorrelationId,
    }
    logMediaUpload('upload_encrypted_media_storage_upload_start', storageUploadContext)
    logMediaUploadTransport('upload_encrypted_media_storage_transport_start', storageUploadContext)

    const authHeadersStartedAt = nowMs()
    try {
      const session = await ensureBoundBackendAccessForIdentity(senderId)
      accessToken = session?.accessToken ?? null
      if (!accessToken) {
        throw new Error('Backend auth token is required')
      }
      performanceMetrics.authHeadersMs = nowMs() - authHeadersStartedAt
      logMediaUpload('upload_encrypted_media_storage_headers_ready', {
        ...storageUploadContext,
        headerKeys: ['Authorization'],
      })
    } catch (error) {
      mobileLogError(MEDIA_UPLOAD_LOG_PREFIX, 'upload_encrypted_media_storage_headers_failed', {
        ...storageUploadContext,
        elapsedMs: Date.now() - uploadStartedAt,
        error: describeMediaError(error),
      })
      throw tagUploadFailure(error, 'upload_transport_started')
    }

    const storageUploadStartedAt = nowMs()
    try {
      logMediaUploadTransport('upload_encrypted_media_tor_safe_upload_invoke', {
        ...storageUploadContext,
        elapsedMs: Math.round(nowMs() - storageUploadStartedAt),
      })
      const uploadResult = await uploadObjectWithBackend({
        fileUri: tempFileUri,
        fileName: `${encrypted.id}.enc`,
        contentType: 'application/octet-stream',
        size: performanceMetrics.uploadBytes,
        diagnostics: {
          caller: transportCaller,
          correlationId: transportCorrelationId,
          attachmentSendId: diagnostics?.attachmentSendId,
          sendStartedAt: diagnostics?.sendStartedAt,
          attachmentIndex: diagnostics?.attachmentIndex,
          attachmentCount: diagnostics?.attachmentCount,
          attempt: diagnostics?.attempt ?? 1,
          fileSize: uploadAttachment.fileSize,
          mimeType: uploadAttachment.mimeType,
          bucket: 'chat-media',
          objectPathSummary: summarizeAttachmentObjectPath(storagePath),
          conversationId,
          optimisticMessageId: diagnostics?.optimisticMessageId,
          recordDiagnostic: diagnostics?.recordDiagnostic,
        },
      }, { accessToken })
      if (uploadResult.error) {
        throw uploadResult.error
      }
      uploadedObjectRef = uploadResult.objectRef
      performanceMetrics.uploadMs = nowMs() - storageUploadStartedAt
    } catch (error) {
      mobileLogError(MEDIA_UPLOAD_LOG_PREFIX, 'upload_encrypted_media_storage_transport_exception', {
        ...storageUploadContext,
        elapsedMs: Math.round(nowMs() - storageUploadStartedAt),
        hint: describeMediaTransportHint(error),
        error: describeMediaError(error),
      })
      throw tagUploadFailure(error, 'upload_transport_started')
    }

    logMediaUpload('upload_encrypted_media_storage_upload_response', {
      ...storageUploadContext,
      ok: true,
      status: 204,
      statusText: 'uploaded',
      elapsedMs: Math.round(performanceMetrics.uploadMs),
    })
    logMediaUploadTransport('upload_encrypted_media_storage_transport_response', {
      ...storageUploadContext,
      ok: true,
      status: 204,
      statusText: 'uploaded',
      elapsedMs: Math.round(performanceMetrics.uploadMs),
    })
    lastSuccessfulStage = 'upload_transport_response'

    const mediaSendId = diagnostics?.optimisticMessageId ?? diagnostics?.attachmentSendId
    if (mediaSendId) {
      await registerMediaSendUpload({
        mediaId: encrypted.id,
        objectRef: uploadedObjectRef,
        sendId: mediaSendId,
        conversationId,
      })
      uploadRegistered = true
    }
    
    onProgress?.({
      bytesUploaded: performanceMetrics.uploadBytes,
      totalBytes: performanceMetrics.uploadBytes,
      percentage: 90,
      stage: 'finalizing',
    })
    
    const contentHash = sourceContentHash
    logMediaUpload('upload_encrypted_media_chat_media_insert_start', {
      ...uploadLogContext,
      encryptedId: encrypted.id,
      storagePath,
      contentHash,
      uploadBytes: performanceMetrics.uploadBytes,
    })
    recordAttachmentStage('chat_media_insert_started', {
      objectPathSummary: summarizeAttachmentObjectPath(storagePath),
    })
    
    const metadataInsertStartedAt = nowMs()
    const { error: dbError } = await backendData
      .table('chat_media')
      .insert({
        id: encrypted.id,
        sender_identity_id: senderId,
        recipient_identity_id: recipientId,
        conversation_id: conversationId,
        storage_path: uploadedObjectRef,
        encrypted_metadata: encrypted.encryptedMetadata,
        media_type: uploadAttachment.type,
        encrypted_size: performanceMetrics.uploadBytes,
        is_chunked: encrypted.isChunked,
        total_chunks: encrypted.totalChunks,
        content_hash: contentHash,
        status: 'uploaded',
      })
    performanceMetrics.metadataInsertMs = nowMs() - metadataInsertStartedAt
    
    if (dbError) {
      mobileLogError(MEDIA_UPLOAD_LOG_PREFIX, 'upload_encrypted_media_chat_media_insert_failed', {
        ...uploadLogContext,
        encryptedId: encrypted.id,
        storagePath,
        error: describeMediaError(dbError),
      })
      throw tagUploadFailure(
        new Error(`Failed to save media metadata: ${dbError.message}`),
        'chat_media_insert_started',
        {
          failureReason: dbError.message,
        },
      )
    }

    metadataPersisted = true
    logMediaUpload('upload_encrypted_media_chat_media_insert_success', {
      ...uploadLogContext,
      encryptedId: encrypted.id,
      storagePath,
      contentHash,
    })
    recordAttachmentStage('chat_media_insert_succeeded', {
      objectPathSummary: summarizeAttachmentObjectPath(storagePath),
    })
    lastSuccessfulStage = 'chat_media_insert_succeeded'
    
    onProgress?.({
      bytesUploaded: performanceMetrics.uploadBytes,
      totalBytes: performanceMetrics.uploadBytes,
      percentage: 100,
      stage: 'finalizing',
    })
    performanceMetrics.totalMs = nowMs() - performanceStartedAt
    logMediaUpload('upload_encrypted_media_success', {
      ...uploadLogContext,
      encryptedId: encrypted.id,
      storagePath,
      totalElapsedMs: Date.now() - uploadStartedAt,
      performance: {
        ...performanceMetrics,
        fileReadMs: Math.round(performanceMetrics.fileReadMs),
        hashMs: Math.round(performanceMetrics.hashMs),
        encryptMs: Math.round(performanceMetrics.encryptMs),
        blobBuildMs: Math.round(performanceMetrics.blobBuildMs),
        tempWriteMs: Math.round(performanceMetrics.tempWriteMs),
        authHeadersMs: Math.round(performanceMetrics.authHeadersMs),
        uploadMs: Math.round(performanceMetrics.uploadMs),
        metadataInsertMs: Math.round(performanceMetrics.metadataInsertMs),
        totalMs: Math.round(performanceMetrics.totalMs),
      },
    })

    return {
      id: encrypted.id,
      storagePath,
      downloadUrl: '',
      encryptedMetadata: encrypted.encryptedMetadata,
      mediaType: uploadAttachment.type,
      encryptedSize: performanceMetrics.uploadBytes,
      contentHash,
      isChunked: encrypted.isChunked,
      totalChunks: encrypted.totalChunks,
      encryptionKey: mediaKeyBase64,
      performance: performanceMetrics,
    }
  } catch (error) {
    mobileLogError(MEDIA_UPLOAD_LOG_PREFIX, 'upload_encrypted_media_failed', {
      ...uploadLogContext,
      encryptedId: encrypted.id,
      storagePath,
      metadataPersisted,
      elapsedMs: Date.now() - uploadStartedAt,
      error: describeMediaError(error),
    })
    if (!metadataPersisted && uploadedObjectRef) {
      logMediaUpload('upload_encrypted_media_rollback_started', {
        ...uploadLogContext,
        encryptedId: encrypted.id,
        objectRef: summarizeLogValue(uploadedObjectRef),
      })
      let cleanupQueued = false
      if (uploadRegistered) {
        try {
          await requestMediaSendAbandonment([encrypted.id])
          cleanupQueued = true
        } catch (cleanupError) {
          mobileLogWarn(MEDIA_UPLOAD_LOG_PREFIX, 'upload_encrypted_media_cleanup_queue_failed', {
            ...uploadLogContext,
            encryptedId: encrypted.id,
            error: describeMediaError(cleanupError),
          })
        }
      }
      if (!cleanupQueued && accessToken) {
        const rollback = await deleteObjectWithBackend(uploadedObjectRef, { accessToken })
        if (rollback.error) {
          mobileLogWarn(MEDIA_UPLOAD_LOG_PREFIX, 'upload_encrypted_media_rollback_failed', {
            ...uploadLogContext,
            encryptedId: encrypted.id,
            error: describeMediaError(rollback.error),
          })
        }
      }
    }

    throw error
  } finally {
    logMediaUpload('upload_encrypted_media_temp_file_cleanup_start', {
      ...uploadLogContext,
      encryptedId: encrypted.id,
      tempFileUri: summarizeLogValue(tempFileUri),
    })
    await FileSystem.deleteAsync(tempFileUri, { idempotent: true })
    logMediaUpload('upload_encrypted_media_temp_file_cleanup_success', {
      ...uploadLogContext,
      encryptedId: encrypted.id,
      tempFileUri: summarizeLogValue(tempFileUri),
    })
    if (!preparedByCaller) {
      await releasePreparedOutgoingMediaAttachment(preparedAttachment).catch(() => undefined)
    }
  }
}

function hasExpectedTorDownloadSize(
  bytes: Uint8Array,
  expectedSize: number | null | undefined,
): boolean {
  return typeof expectedSize === 'number' && expectedSize > 0 && bytes.length === expectedSize
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left === right) {
    return true
  }

  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

function buildTorDownloadCandidates(
  response: TorByteResponse,
  expectedSize: number | null | undefined,
): TorDownloadCandidate[] {
  const candidates: TorDownloadCandidate[] = []

  const pushCandidate = (
    encoding: TorDownloadCandidateEncoding,
    bytes: Uint8Array,
  ): void => {
    if (candidates.some((candidate) => bytesEqual(candidate.bytes, bytes))) {
      return
    }

    candidates.push({
      encoding,
      bytes,
      matchesExpectedSize: hasExpectedTorDownloadSize(bytes, expectedSize),
    })
  }

  if (!response.byteCandidates) {
    pushCandidate('default', response.bytes)
    return candidates
  }

  if (response.byteCandidates.base64) {
    pushCandidate('base64', response.byteCandidates.base64)
  }
  pushCandidate('latin1', response.byteCandidates.latin1)
  pushCandidate('utf8', response.byteCandidates.utf8)

  if (candidates.length === 0) {
    pushCandidate('default', response.bytes)
  }

  return candidates.sort((left, right) => {
    if (left.matchesExpectedSize !== right.matchesExpectedSize) {
      return left.matchesExpectedSize ? -1 : 1
    }

    return TOR_DOWNLOAD_CANDIDATE_PRIORITY[left.encoding]
      - TOR_DOWNLOAD_CANDIDATE_PRIORITY[right.encoding]
  })
}

function categorizeTorDownloadCandidateFailure(error: unknown): TorDownloadFailureStage {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()

  if (message.includes('integrity') || message.includes('hash mismatch')) {
    return 'integrity'
  }

  return 'decrypt'
}

async function validateTorDownloadCandidates(
  candidates: TorDownloadCandidate[],
  mediaKey: Uint8Array,
  diagnostics: MediaDownloadDiagnostics | undefined,
  expectedSize: number | null | undefined,
): Promise<TorDownloadSelection> {
  const failures: TorDownloadCandidateFailure[] = []

  for (const [index, candidate] of candidates.entries()) {
    const candidateNumber = index + 1
    const candidateFingerprint = describeBinaryFingerprint('candidate', candidate.bytes, {
      includeFormatHint: false,
    })
    logMediaDownload('download_candidate_attempted', {
      candidateIndex: candidateNumber,
      candidateCount: candidates.length,
      candidateEncoding: candidate.encoding,
      expectedEncryptedSize: expectedSize ?? null,
      matchesExpectedSize: candidate.matchesExpectedSize,
      ...candidateFingerprint,
    })
    recordHydrationStage(diagnostics, 'download_candidate_attempted', {
      candidateIndex: candidateNumber,
      candidateCount: candidates.length,
      candidateEncoding: candidate.encoding,
      candidateLength: candidate.bytes.length,
      expectedEncryptedSize: expectedSize ?? null,
      matchesExpectedSize: candidate.matchesExpectedSize,
      ...candidateFingerprint,
    })

    if (!candidate.matchesExpectedSize && typeof expectedSize === 'number' && expectedSize > 0) {
      logMediaDownload('download_candidate_size_mismatch', {
        candidateIndex: candidateNumber,
        candidateEncoding: candidate.encoding,
        candidateLength: candidate.bytes.length,
        expectedEncryptedSize: expectedSize,
      })
      recordHydrationStage(diagnostics, 'download_candidate_size_mismatch', {
        candidateIndex: candidateNumber,
        candidateEncoding: candidate.encoding,
        candidateLength: candidate.bytes.length,
        expectedEncryptedSize: expectedSize,
      })
    }

    let encrypted: EncryptedMedia | null = null
    const cacheDir = FileSystem.cacheDirectory
    const useNativeBlobDecrypt = (
      canUseNativeMediaFileCrypto()
      && candidate.bytes.length >= NATIVE_MEDIA_FILE_THRESHOLD_BYTES
      && Boolean(cacheDir)
    )

    try {
      if (useNativeBlobDecrypt && cacheDir) {
        const blobPath = `${cacheDir}media-in-${candidate.encoding}-${candidateNumber}.enc`
        const plaintextPath = `${cacheDir}media-out-${candidate.encoding}-${candidateNumber}`
        try {
          await writeBytesToFile(candidate.bytes, blobPath)
          const nativeDecrypt = await decryptMediaFromBlobFileMeasuredAsync(
            mediaKey,
            blobPath,
            plaintextPath,
          )
          const decrypted: DecryptedMedia = {
            id: nativeDecrypt.id,
            content: new Uint8Array(0),
            metadata: nativeDecrypt.metadata,
            integrityVerified: true,
          }
          logMediaDownload('download_candidate_selected', {
            candidateIndex: candidateNumber,
            candidateCount: candidates.length,
            candidateEncoding: candidate.encoding,
            expectedEncryptedSize: expectedSize ?? null,
            matchesExpectedSize: candidate.matchesExpectedSize,
            failedCandidates: failures.length,
            decryptedFileName: decrypted.metadata.fileName,
            decryptedMimeType: decrypted.metadata.mimeType,
            decryptedDeclaredSize: decrypted.metadata.fileSize,
            nativeFileDecrypt: true,
            ...candidateFingerprint,
          })
          recordHydrationStage(diagnostics, 'download_candidate_selected', {
            candidateIndex: candidateNumber,
            candidateCount: candidates.length,
            candidateEncoding: candidate.encoding,
            candidateLength: candidate.bytes.length,
            expectedEncryptedSize: expectedSize ?? null,
            matchesExpectedSize: candidate.matchesExpectedSize,
            failedCandidates: failures.length,
          })
          try {
            new File(blobPath).delete()
          } catch {
            // Best-effort ciphertext scratch cleanup.
          }
          return {
            bytes: candidate.bytes,
            encoding: candidate.encoding,
            encrypted: null,
            decrypted,
            plaintextPath: nativeDecrypt.destPath,
            candidateCount: candidates.length,
            failures,
          }
        } catch {
          try {
            new File(blobPath).delete()
            new File(plaintextPath).delete()
          } catch {
            // Best-effort scratch cleanup after native decrypt failure.
          }
        }
      }

      encrypted = blobToEncrypted(candidate.bytes)
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : String(error)
      failures.push({
        encoding: candidate.encoding,
        length: candidate.bytes.length,
        failureStage: 'blob_parse',
        error: failureMessage,
      })
      logMediaDownload('download_candidate_failed', {
        candidateIndex: candidateNumber,
        candidateEncoding: candidate.encoding,
        expectedEncryptedSize: expectedSize ?? null,
        failureStage: 'blob_parse',
        error: summarizeLogValue(failureMessage),
        ...candidateFingerprint,
      })
      recordHydrationStage(diagnostics, 'download_candidate_failed', {
        candidateIndex: candidateNumber,
        candidateEncoding: candidate.encoding,
        candidateLength: candidate.bytes.length,
        expectedEncryptedSize: expectedSize ?? null,
        failureStage: 'blob_parse',
        error: summarizeLogValue(failureMessage),
      })
      continue
    }

    if (!encrypted) {
      continue
    }

    try {
      const decrypted = await decryptMediaMeasuredAsync(mediaKey, encrypted)
      const decryptedFingerprint = describeBinaryFingerprint('decrypted', decrypted.content)
      logMediaDownload('download_candidate_selected', {
        candidateIndex: candidateNumber,
        candidateCount: candidates.length,
        candidateEncoding: candidate.encoding,
        expectedEncryptedSize: expectedSize ?? null,
        matchesExpectedSize: candidate.matchesExpectedSize,
        failedCandidates: failures.length,
        decryptedFileName: decrypted.metadata.fileName,
        decryptedMimeType: decrypted.metadata.mimeType,
        decryptedDeclaredSize: decrypted.metadata.fileSize,
        ...candidateFingerprint,
        ...decryptedFingerprint,
      })
      recordHydrationStage(diagnostics, 'download_candidate_selected', {
        candidateIndex: candidateNumber,
        candidateCount: candidates.length,
        candidateEncoding: candidate.encoding,
        candidateLength: candidate.bytes.length,
        expectedEncryptedSize: expectedSize ?? null,
        matchesExpectedSize: candidate.matchesExpectedSize,
        failedCandidates: failures.length,
      })
      return {
        bytes: candidate.bytes,
        encoding: candidate.encoding,
        encrypted,
        decrypted,
        candidateCount: candidates.length,
        failures,
      }
    } catch (error) {
      const failureStage = categorizeTorDownloadCandidateFailure(error)
      const failureMessage = error instanceof Error ? error.message : String(error)
      failures.push({
        encoding: candidate.encoding,
        length: candidate.bytes.length,
        failureStage,
        error: failureMessage,
      })
      logMediaDownload('download_candidate_failed', {
        candidateIndex: candidateNumber,
        candidateEncoding: candidate.encoding,
        expectedEncryptedSize: expectedSize ?? null,
        failureStage,
        error: summarizeLogValue(failureMessage),
        ...candidateFingerprint,
      })
      recordHydrationStage(diagnostics, 'download_candidate_failed', {
        candidateIndex: candidateNumber,
        candidateEncoding: candidate.encoding,
        candidateLength: candidate.bytes.length,
        expectedEncryptedSize: expectedSize ?? null,
        failureStage,
        error: summarizeLogValue(failureMessage),
      })
    }
  }

  const attemptedSummary = failures
    .map((failure) => `${failure.encoding}:${failure.failureStage}`)
    .join(', ')
  logMediaDownload('download_candidate_exhausted', {
    candidateCount: candidates.length,
    expectedEncryptedSize: expectedSize ?? null,
    attemptedCandidates: attemptedSummary || null,
  })
  recordHydrationStage(diagnostics, 'download_candidate_exhausted', {
    candidateCount: candidates.length,
    expectedEncryptedSize: expectedSize ?? null,
    attemptedCandidates: attemptedSummary || null,
  })

  throw new Error(
    attemptedSummary.length > 0
      ? `Unable to decode Tor media response after trying ${attemptedSummary}`
      : 'Unable to decode Tor media response',
  )
}

/**
 * Downloads and decrypts media with the key carried by the chat message.
 * Remote deletion is committed after the encrypted local cache is durable.
 */
export async function downloadAndDecryptMedia(
  encryptionKey: string,
  mediaId: string,
  destinationUri: string,
  onProgress?: (progress: MediaDownloadProgress) => void,
  diagnostics?: MediaDownloadDiagnostics,
  onRemoteDisposition?: (disposition: RemoteMediaDisposition) => void,
): Promise<MediaMetadata> {
  const resolvedDiagnostics = resolveMediaDownloadDiagnostics(mediaId, diagnostics)
  const downloadLogContext = {
    mediaId,
    correlationId: resolvedDiagnostics.correlationId ?? null,
    destinationUri: summarizeLogValue(destinationUri),
    source: resolvedDiagnostics.source ?? null,
  }
  let lastSuccessfulStage: string | null = 'download_requested'

  logMediaDownload('download_and_decrypt_start', downloadLogContext)
  recordHydrationStage(resolvedDiagnostics, 'download_requested', {
    destinationUri: summarizeLogValue(destinationUri),
  })

  const mediaKey = base64ToBytes(encryptionKey)
  if (!isSpectraBackendConfigured()) {
    const error = new Error('Backend not configured')
    recordHydrationFailure(
      resolvedDiagnostics,
      'download_requested',
      error,
      lastSuccessfulStage,
    )
    throw new Error('Backend not configured')
  }
  
  onProgress?.({
    bytesDownloaded: 0,
    totalBytes: 0,
    percentage: 0,
    stage: 'downloading',
  })
  
  const dbLookupStartedAt = Date.now()
  const { data: mediaRecord, error: dbError } = await backendData
    .table('chat_media')
    .select('*')
    .eq('id', mediaId)
    .single()
  
  if (dbError || !mediaRecord) {
    const error = new Error(`Media not found: ${dbError?.message || 'Not found'}`)
    recordHydrationFailure(
      resolvedDiagnostics,
      'db_lookup',
      error,
      lastSuccessfulStage,
    )
    throw new Error(`Media not found: ${dbError?.message || 'Not found'}`)
  }
  lastSuccessfulStage = 'db_lookup_succeeded'
  recordHydrationStage(resolvedDiagnostics, 'db_lookup_succeeded', {
    elapsedMs: Date.now() - dbLookupStartedAt,
    mediaStatus: mediaRecord.status,
    expectedEncryptedSize: mediaRecord.encrypted_size ?? null,
    storedContentHash: mediaRecord.content_hash ?? null,
    storagePath: summarizeLogValue(mediaRecord.storage_path),
  })
  
  if (
    mediaRecord.status === 'downloaded'
    || mediaRecord.status === 'deleted'
    || mediaRecord.status === 'abandoned'
  ) {
    const error = new Error('Media no longer available')
    recordHydrationFailure(
      resolvedDiagnostics,
      'availability_check',
      error,
      lastSuccessfulStage,
    )
    throw error
  }
  
  const signedUrlStartedAt = Date.now()
  const accessToken = await getValidBackendAccessToken()
  if (!accessToken || !mediaRecord.storage_path.startsWith('spectra://objects/')) {
    const error = new Error('Backend media object is unavailable')
    recordHydrationFailure(
      resolvedDiagnostics,
      'signed_url',
      error,
      lastSuccessfulStage,
    )
    throw error
  }
  const signedObject = await signObjectDownloadWithBackend(mediaRecord.storage_path, { accessToken })
  lastSuccessfulStage = 'signed_url_succeeded'
  recordHydrationStage(resolvedDiagnostics, 'signed_url_succeeded', {
    elapsedMs: Date.now() - signedUrlStartedAt,
    signedUrl: summarizeLogValue(signedObject.url),
  })
  
  const transportStartedAt = Date.now()
  const downloadResponse = await torAwareFetchBytes(signedObject.url)
  const expectedEncryptedSize =
    typeof mediaRecord.encrypted_size === 'number' ? mediaRecord.encrypted_size : null
  const downloadCandidates = buildTorDownloadCandidates(
    downloadResponse,
    expectedEncryptedSize,
  )
  const transportFingerprint = describeBinaryFingerprint('transport', downloadResponse.bytes, {
    includeFormatHint: false,
  })
  logMediaDownload('download_transport_response', {
    ...downloadLogContext,
    elapsedMs: Date.now() - transportStartedAt,
    statusCode: downloadResponse.status,
    responseContentType: downloadResponse.headers.get('content-type'),
    expectedEncryptedSize,
    responseEncoding: downloadResponse.byteCandidates?.preferredEncoding ?? 'default',
    candidateCount: downloadCandidates.length,
    candidateEncodings: downloadCandidates.map((candidate) => candidate.encoding).join(','),
    latin1Length: downloadResponse.byteCandidates?.latin1.length ?? null,
    utf8Length: downloadResponse.byteCandidates?.utf8.length ?? null,
    base64Length: downloadResponse.byteCandidates?.base64?.length ?? null,
    ...transportFingerprint,
  })
  recordHydrationStage(resolvedDiagnostics, 'download_transport_response', {
    elapsedMs: Date.now() - transportStartedAt,
    statusCode: downloadResponse.status,
    responseBytes: downloadResponse.bytes.length,
    responseContentType: downloadResponse.headers.get('content-type'),
    expectedEncryptedSize,
    responseEncoding: downloadResponse.byteCandidates?.preferredEncoding ?? 'default',
    candidateCount: downloadCandidates.length,
    candidateEncodings: downloadCandidates.map((candidate) => candidate.encoding).join(','),
    latin1Length: downloadResponse.byteCandidates?.latin1.length ?? null,
    utf8Length: downloadResponse.byteCandidates?.utf8.length ?? null,
    base64Length: downloadResponse.byteCandidates?.base64?.length ?? null,
    ...transportFingerprint,
  })
  if (!downloadResponse.ok) {
    const error = new Error(`Failed to download media: HTTP ${downloadResponse.status}`)
    recordHydrationFailure(
      resolvedDiagnostics,
      'download_transport',
      error,
      lastSuccessfulStage,
      {
        statusCode: downloadResponse.status,
      },
    )
    throw error
  }
  lastSuccessfulStage = 'download_transport_response'

  recordHydrationStage(resolvedDiagnostics, 'decrypt_started', {
    candidateCount: downloadCandidates.length,
    candidateEncodings: downloadCandidates.map((candidate) => candidate.encoding).join(','),
    expectedEncryptedSize,
  })
  logMediaDownload('decrypt_started', {
    ...downloadLogContext,
    candidateCount: downloadCandidates.length,
    candidateEncodings: downloadCandidates.map((candidate) => candidate.encoding).join(','),
    expectedEncryptedSize,
  })
  let selectedDownload: TorDownloadSelection
  try {
    selectedDownload = await validateTorDownloadCandidates(
      downloadCandidates,
      mediaKey,
      resolvedDiagnostics,
      expectedEncryptedSize,
    )
  } catch (error) {
    recordHydrationFailure(
      resolvedDiagnostics,
      'download_candidate_validation',
      error,
      lastSuccessfulStage,
    )
    logMediaDownload('download_candidate_validation_failed', {
      ...downloadLogContext,
      expectedEncryptedSize,
      candidateCount: downloadCandidates.length,
      candidateEncodings: downloadCandidates.map((candidate) => candidate.encoding).join(','),
      error: describeMediaError(error),
    })
    throw error
  }

  const encryptedBlob = selectedDownload.bytes
  const decrypted = selectedDownload.decrypted
  lastSuccessfulStage = 'decrypt_succeeded'

  onProgress?.({
    bytesDownloaded: encryptedBlob.length,
    totalBytes: encryptedBlob.length,
    percentage: 50,
    stage: 'decrypting',
  })
  const decryptedFingerprint = decrypted.content.length > 0
    ? describeBinaryFingerprint('decrypted', decrypted.content)
    : { decryptedBytes: decrypted.metadata.fileSize }
  logMediaDownload('decrypt_succeeded', {
    ...downloadLogContext,
    selectedEncoding: selectedDownload.encoding,
    candidateCount: selectedDownload.candidateCount,
    failedCandidates: selectedDownload.failures.length,
    storedContentHash: mediaRecord.content_hash ?? null,
    decryptedMetadataFileName: decrypted.metadata.fileName,
    decryptedMetadataMimeType: decrypted.metadata.mimeType,
    decryptedDeclaredSize: decrypted.metadata.fileSize,
    nativeFileDecrypt: Boolean(selectedDownload.plaintextPath),
    ...describeBinaryFingerprint('encryptedBlob', encryptedBlob, {
      includeFormatHint: false,
    }),
    ...decryptedFingerprint,
  })
  recordHydrationStage(resolvedDiagnostics, 'decrypt_succeeded', {
    decryptedBytes: decrypted.content.length || decrypted.metadata.fileSize,
    declaredFileSize: decrypted.metadata.fileSize,
    encryptedBytes: encryptedBlob.length,
    selectedEncoding: selectedDownload.encoding,
    candidateCount: selectedDownload.candidateCount,
    failedCandidates: selectedDownload.failures.length,
    storedContentHash: mediaRecord.content_hash ?? null,
    ...decryptedFingerprint,
  })
  
  if (selectedDownload.plaintextPath) {
    try {
      const destDirectory = destinationUri.replace(/\/[^/]+\/?$/, '')
      if (destDirectory && destDirectory !== destinationUri) {
        await FileSystem.makeDirectoryAsync(destDirectory, { intermediates: true }).catch(() => undefined)
      }
      await FileSystem.copyAsync({
        from: selectedDownload.plaintextPath,
        to: destinationUri,
      })
    } finally {
      try {
        new File(selectedDownload.plaintextPath).delete()
      } catch {
        // Best-effort plaintext scratch cleanup.
      }
    }
  } else {
    await writeBytesToFile(decrypted.content, destinationUri)
  }
  lastSuccessfulStage = 'file_write_succeeded'
  recordHydrationStage(resolvedDiagnostics, 'file_write_succeeded', {
    destinationUri: summarizeLogValue(destinationUri),
    decryptedBytes: decrypted.content.length,
  })
  
  onProgress?.({
    bytesDownloaded: encryptedBlob.length,
    totalBytes: encryptedBlob.length,
    percentage: 90,
    stage: 'finalizing',
  })

  const isGroupMedia = typeof mediaRecord.conversation_id === 'string'
    && mediaRecord.conversation_id.startsWith('group:')

  onProgress?.({
    bytesDownloaded: encryptedBlob.length,
    totalBytes: encryptedBlob.length,
    percentage: 100,
    stage: 'finalizing',
  })
  recordHydrationStage(resolvedDiagnostics, 'download_completed', {
    isGroupMedia,
    decryptedBytes: decrypted.content.length,
  })
  logMediaDownload('download_and_decrypt_success', {
    ...downloadLogContext,
    isGroupMedia,
    encryptedBytes: encryptedBlob.length,
    decryptedBytes: decrypted.content.length,
  })
  
  onRemoteDisposition?.({
    remoteObjectRef: mediaRecord.storage_path,
    shouldConsumeRemote: !isGroupMedia,
  })
  return decrypted.metadata
}

