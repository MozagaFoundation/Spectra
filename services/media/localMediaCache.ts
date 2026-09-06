/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'
import { File } from 'expo-file-system'
import * as FileSystem from 'expo-file-system/legacy'
import { base64ToBytes, bytesToBase64 } from '@spectra/identity-vault'
import type { MediaAttachment, MediaType } from '@/lib/types'
import { normalizeAccountStorageScope } from '@/lib/accountScope'
import {
  buildLocalCacheAad,
  openLocalCacheText,
  sealLocalCacheText,
  type LocalCacheCipher,
} from '@/services/storage/localCacheCrypto'
import { useWalletStore } from '@/store/walletStore'
import {
  clearTransientRenderCache,
  getTransientRenderDirectory,
  getTransientRenderPath,
  initializeTransientRenderCache,
  isTransientRenderUri,
  protectTransientRenderPath,
  writeTransientRenderFile,
} from './transientRenderCache'

const LEGACY_MEDIA_PREFIX = 'qc_media_'
const LEGACY_MEDIA_INDEX_PREFIX = 'qc_media_index_'
const MEDIA_PREFIX = 'qc_media_v2_'
const MEDIA_INDEX_PREFIX = 'qc_media_index_v2_'
const SAFE_MEDIA_ID_PATTERN = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,127}$/
const SAFE_EXTENSION_PATTERN = /^[a-z0-9]{1,12}$/
const CHUNK_BYTES = 512 * 1024

const PERSISTENT_DIRECTORY = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}spectra-encrypted-media-v1/`
  : null
const LEGACY_MEDIA_DIRECTORY = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}media_cache/`
  : null
const initializedScopes = new Set<string>()
let legacyPurged = false

export interface CachedMedia {
  id: string
  messageId: string
  conversationId: string
  type: MediaType
  fileName: string
  mimeType: string
  localUri: string
  fileSize: number
  width?: number
  height?: number
  durationMs?: number
  waveform?: number[]
  cachedAt: number
  originalRemoteUrl?: string
  remoteObjectRef?: string
  remoteDeletePending?: boolean
}

type StoredMediaMetadata = Omit<CachedMedia, 'localUri'> & {
  v: 1
  chunkCount: number
  extension: string
}

type StoredMetadataRecord = {
  v: 1
  cipher: LocalCacheCipher
}

function getActiveScope(): string {
  const scope = normalizeAccountStorageScope(useWalletStore.getState().wallet?.address)
  if (!scope) throw new Error('Media cache wallet scope is required')
  return scope
}

function resolveMediaScope(walletAddress?: string): string {
  if (walletAddress === undefined) return getActiveScope()
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) throw new Error('Media cache wallet scope is required')
  return scope
}

function scopedMediaKey(scope: string, mediaId: string): string {
  return `${MEDIA_PREFIX}${scope}_${mediaId}`
}

function scopedIndexKey(scope: string, conversationId: string): string {
  return `${MEDIA_INDEX_PREFIX}${scope}_${conversationId}`
}

function metadataAad(scope: string, mediaId: string): Uint8Array {
  return buildLocalCacheAad(['spectra', 'attachment-metadata', 'v1', scope, mediaId])
}

function chunkAad(
  scope: string,
  metadata: StoredMediaMetadata,
  chunkIndex: number,
): Uint8Array {
  return buildLocalCacheAad([
    'spectra',
    'attachment-chunk',
    'v1',
    scope,
    metadata.id,
    metadata.messageId,
    metadata.conversationId,
    String(chunkIndex),
    String(metadata.chunkCount),
  ])
}

function getPersistentScopeDirectory(scope: string): string {
  if (!PERSISTENT_DIRECTORY) throw new Error('Persistent media directory is unavailable')
  return `${PERSISTENT_DIRECTORY}${scope}/`
}

function getPersistentMediaDirectory(scope: string, mediaId: string): string {
  assertSafeMediaId(mediaId)
  return `${getPersistentScopeDirectory(scope)}${mediaId}/`
}

function getChunkPath(scope: string, mediaId: string, chunkIndex: number): string {
  return `${getPersistentMediaDirectory(scope, mediaId)}${chunkIndex}.chunk`
}

function normalizeExtensionCandidate(value?: string | null): string | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  return SAFE_EXTENSION_PATTERN.test(normalized) ? normalized : null
}

function getExtensionFromMimeType(mimeType: string, fileName?: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/wav': 'wav',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/json': 'json',
  }
  const mapped = normalizeExtensionCandidate(mimeToExt[mimeType])
  if (mapped) return mapped
  const normalizedFileName = fileName?.trim()
  const dotIndex = normalizedFileName?.lastIndexOf('.') ?? -1
  if (normalizedFileName && dotIndex > -1 && dotIndex < normalizedFileName.length - 1) {
    return normalizeExtensionCandidate(normalizedFileName.slice(dotIndex + 1)) ?? 'bin'
  }
  return 'bin'
}

async function purgeLegacyPlaintextCache(): Promise<void> {
  if (legacyPurged) return
  if (LEGACY_MEDIA_DIRECTORY) {
    await FileSystem.deleteAsync(LEGACY_MEDIA_DIRECTORY, { idempotent: true })
  }
  const keys = await getAppKeyValueStorage().getAllKeys()
  const legacyKeys = keys.filter((key) => (
    (
      key.startsWith(LEGACY_MEDIA_PREFIX)
      || key.startsWith(LEGACY_MEDIA_INDEX_PREFIX)
    )
    && !key.startsWith(MEDIA_PREFIX)
    && !key.startsWith(MEDIA_INDEX_PREFIX)
  ))
  if (legacyKeys.length > 0) {
    await getAppKeyValueStorage().multiRemove(legacyKeys)
  }
  legacyPurged = true
}

export async function initializeMediaCache(walletAddress?: string): Promise<void> {
  const scope = resolveMediaScope(walletAddress)
  await purgeLegacyPlaintextCache()
  await initializeTransientRenderCache(scope)
  if (initializedScopes.has(scope)) return
  const scopeDirectory = getPersistentScopeDirectory(scope)
  const info = await FileSystem.getInfoAsync(scopeDirectory)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(scopeDirectory, { intermediates: true })
  }
  initializedScopes.add(scope)
}

export function getMediaCacheDirectory(walletAddress?: string): string {
  return getTransientRenderDirectory(resolveMediaScope(walletAddress))
}

export function assertSafeMediaId(mediaId: string): void {
  if (!SAFE_MEDIA_ID_PATTERN.test(mediaId) || mediaId.includes('..')) {
    throw new Error('Unsafe media id')
  }
}

async function storeMediaMetadata(scope: string, media: StoredMediaMetadata): Promise<void> {
  const cipher = await sealLocalCacheText(
    scope,
    'attachment',
    JSON.stringify(media),
    metadataAad(scope, media.id),
  )
  await getAppKeyValueStorage().setItem(
    scopedMediaKey(scope, media.id),
    JSON.stringify({ v: 1, cipher } satisfies StoredMetadataRecord),
  )
  const indexKey = scopedIndexKey(scope, media.conversationId)
  const rawIndex = await getAppKeyValueStorage().getItem(indexKey)
  const index: string[] = rawIndex ? JSON.parse(rawIndex) : []
  if (!index.includes(media.id)) {
    await getAppKeyValueStorage().setItem(indexKey, JSON.stringify([...index, media.id]))
  }
}

async function getMediaMetadata(
  scope: string,
  mediaId: string,
): Promise<StoredMediaMetadata | null> {
  const raw = await getAppKeyValueStorage().getItem(scopedMediaKey(scope, mediaId))
  if (!raw) return null
  try {
    const record = JSON.parse(raw) as StoredMetadataRecord
    if (record?.v !== 1 || !record.cipher) throw new Error('Invalid media metadata')
    const metadata = JSON.parse(await openLocalCacheText(
      scope,
      'attachment',
      record.cipher,
      metadataAad(scope, mediaId),
    )) as StoredMediaMetadata
    if (
      metadata?.v !== 1
      || metadata.id !== mediaId
      || !Number.isSafeInteger(metadata.chunkCount)
      || metadata.chunkCount < 1
    ) {
      throw new Error('Invalid media metadata payload')
    }
    return metadata
  } catch {
    await deleteCachedMediaRecord(scope, mediaId)
    return null
  }
}

async function getConversationMedia(
  scope: string,
  conversationId: string,
): Promise<StoredMediaMetadata[]> {
  const rawIndex = await getAppKeyValueStorage().getItem(scopedIndexKey(scope, conversationId))
  const index: string[] = rawIndex ? JSON.parse(rawIndex) : []
  const media = await Promise.all(index.map((id) => getMediaMetadata(scope, id)))
  return media.filter((entry): entry is StoredMediaMetadata => entry !== null)
}

async function persistEncryptedChunks(
  scope: string,
  sourceUri: string,
  metadata: StoredMediaMetadata,
): Promise<void> {
  const finalDirectory = getPersistentMediaDirectory(scope, metadata.id)
  const temporaryDirectory = `${finalDirectory.slice(0, -1)}.tmp-${Date.now()}/`
  await FileSystem.makeDirectoryAsync(temporaryDirectory, { intermediates: true })

  const source = new File(sourceUri)
  const handle = source.open()
  try {
    for (let index = 0; index < metadata.chunkCount; index++) {
      const bytes = handle.readBytes(CHUNK_BYTES)
      const cipher = await sealLocalCacheText(
        scope,
        'attachment',
        bytesToBase64(bytes),
        chunkAad(scope, metadata, index),
      )
      await FileSystem.writeAsStringAsync(
        `${temporaryDirectory}${index}.chunk`,
        JSON.stringify(cipher),
      )
    }
  } catch (error) {
    handle.close()
    await FileSystem.deleteAsync(temporaryDirectory, { idempotent: true })
    throw error
  }
  handle.close()

  await FileSystem.deleteAsync(finalDirectory, { idempotent: true })
  await FileSystem.moveAsync({ from: temporaryDirectory, to: finalDirectory })
}

async function cacheMediaFile(
  scope: string,
  mediaId: string,
  messageId: string,
  conversationId: string,
  sourceUri: string,
  attachment: Omit<MediaAttachment, 'uri'>,
  originalRemoteUrl?: string,
  remoteDeletePending = false,
): Promise<StoredMediaMetadata> {
  await initializeMediaCache(scope)
  assertSafeMediaId(mediaId)
  const source = new File(sourceUri)
  const sourceInfo = source.info()
  if (!sourceInfo.exists || typeof sourceInfo.size !== 'number') {
    throw new Error(`Media file not found at ${sourceUri}`)
  }
  const fileSize = sourceInfo.size
  const metadata: StoredMediaMetadata = {
    v: 1,
    id: mediaId,
    messageId,
    conversationId,
    type: attachment.type,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    fileSize,
    width: attachment.width,
    height: attachment.height,
    durationMs: attachment.durationMs,
    waveform: attachment.waveform,
    cachedAt: Date.now(),
    originalRemoteUrl,
    remoteObjectRef: remoteDeletePending ? originalRemoteUrl : undefined,
    remoteDeletePending,
    chunkCount: Math.max(1, Math.ceil(fileSize / CHUNK_BYTES)),
    extension: getExtensionFromMimeType(attachment.mimeType, attachment.fileName),
  }
  await persistEncryptedChunks(scope, sourceUri, metadata)
  try {
    await storeMediaMetadata(scope, metadata)
  } catch (error) {
    await FileSystem.deleteAsync(
      getPersistentMediaDirectory(scope, mediaId),
      { idempotent: true },
    )
    throw error
  }
  return metadata
}

async function *openEncryptedChunks(
  scope: string,
  metadata: StoredMediaMetadata,
): AsyncGenerator<Uint8Array> {
  for (let index = 0; index < metadata.chunkCount; index++) {
    const raw = await FileSystem.readAsStringAsync(getChunkPath(scope, metadata.id, index))
    const cipher = JSON.parse(raw) as LocalCacheCipher
    const base64 = await openLocalCacheText(
      scope,
      'attachment',
      cipher,
      chunkAad(scope, metadata, index),
    )
    yield base64ToBytes(base64)
  }
}

export async function isMediaCached(mediaId: string, walletAddress?: string): Promise<boolean> {
  assertSafeMediaId(mediaId)
  const scope = resolveMediaScope(walletAddress)
  const metadata = await getMediaMetadata(scope, mediaId)
  if (!metadata) return false
  const first = await FileSystem.getInfoAsync(getChunkPath(scope, mediaId, 0))
  const last = await FileSystem.getInfoAsync(
    getChunkPath(scope, mediaId, metadata.chunkCount - 1),
  )
  return first.exists && last.exists
}

export async function getLocalMediaUri(mediaId: string, walletAddress?: string): Promise<string | null> {
  assertSafeMediaId(mediaId)
  const scope = resolveMediaScope(walletAddress)
  await initializeMediaCache(scope)
  const metadata = await getMediaMetadata(scope, mediaId)
  if (!metadata) return null
  const renderUri = getTransientRenderPath(mediaId, metadata.extension, scope)
  const existing = await FileSystem.getInfoAsync(renderUri)
  if (existing.exists) return renderUri
  try {
    await writeTransientRenderFile(renderUri, openEncryptedChunks(scope, metadata))
    return renderUri
  } catch {
    await FileSystem.deleteAsync(renderUri, { idempotent: true }).catch(() => undefined)
    return null
  }
}

export async function cacheMediaFromFile(
  mediaId: string,
  messageId: string,
  conversationId: string,
  attachment: MediaAttachment,
  walletAddress?: string,
): Promise<CachedMedia> {
  const scope = resolveMediaScope(walletAddress)
  const metadata = await cacheMediaFile(
    scope,
    mediaId,
    messageId,
    conversationId,
    attachment.uri,
    attachment,
    attachment.uri.startsWith('https:') ? attachment.uri : undefined,
  )
  return { ...metadata, localUri: attachment.uri }
}

export async function registerCachedMedia(
  mediaId: string,
  messageId: string,
  conversationId: string,
  localUri: string,
  attachment: Omit<MediaAttachment, 'uri'>,
  walletAddress?: string,
  remoteObjectRef?: string,
): Promise<CachedMedia> {
  const scope = resolveMediaScope(walletAddress)
  if (isTransientRenderUri(localUri)) {
    await protectTransientRenderPath(localUri)
  }
  const metadata = await cacheMediaFile(
    scope,
    mediaId,
    messageId,
    conversationId,
    localUri,
    attachment,
    remoteObjectRef,
    Boolean(remoteObjectRef),
  )
  return { ...metadata, localUri }
}

export interface PendingRemoteMediaDelete {
  mediaId: string
  objectRef: string
}

export async function listPendingRemoteMediaDeletes(
  walletAddress?: string,
): Promise<PendingRemoteMediaDelete[]> {
  const scope = resolveMediaScope(walletAddress)
  const prefix = `${MEDIA_PREFIX}${scope}_`
  const keys = await getAppKeyValueStorage().getAllKeys()
  const pending = await Promise.all(keys.filter((key) => key.startsWith(prefix)).map(async (key) => {
    const mediaId = key.slice(prefix.length)
    if (!SAFE_MEDIA_ID_PATTERN.test(mediaId)) return null
    const metadata = await getMediaMetadata(scope, mediaId)
    return metadata?.remoteDeletePending && metadata.remoteObjectRef
      ? { mediaId, objectRef: metadata.remoteObjectRef }
      : null
  }))
  return pending.filter((entry): entry is PendingRemoteMediaDelete => entry !== null)
}

export async function markRemoteMediaDeleteComplete(
  mediaId: string,
  walletAddress?: string,
): Promise<void> {
  assertSafeMediaId(mediaId)
  const scope = resolveMediaScope(walletAddress)
  const metadata = await getMediaMetadata(scope, mediaId)
  if (!metadata || !metadata.remoteDeletePending) return
  await storeMediaMetadata(scope, {
    ...metadata,
    remoteDeletePending: false,
    remoteObjectRef: undefined,
  })
}

async function deleteCachedMediaRecord(scope: string, mediaId: string): Promise<void> {
  const metadata = await getAppKeyValueStorage().getItem(scopedMediaKey(scope, mediaId))
  if (metadata) {
    try {
      const record = JSON.parse(metadata) as StoredMetadataRecord
      const opened = JSON.parse(await openLocalCacheText(
        scope,
        'attachment',
        record.cipher,
        metadataAad(scope, mediaId),
      )) as StoredMediaMetadata
      const indexKey = scopedIndexKey(scope, opened.conversationId)
      const rawIndex = await getAppKeyValueStorage().getItem(indexKey)
      const index: string[] = rawIndex ? JSON.parse(rawIndex) : []
      await getAppKeyValueStorage().setItem(indexKey, JSON.stringify(index.filter((id) => id !== mediaId)))
      await FileSystem.deleteAsync(
        getTransientRenderPath(mediaId, opened.extension, scope),
        { idempotent: true },
      )
    } catch {
      // The encrypted directory is still removed below.
    }
  }
  await Promise.all([
    getAppKeyValueStorage().removeItem(scopedMediaKey(scope, mediaId)),
    FileSystem.deleteAsync(getPersistentMediaDirectory(scope, mediaId), { idempotent: true }),
  ])
}

export async function deleteCachedMedia(mediaId: string, walletAddress?: string): Promise<void> {
  assertSafeMediaId(mediaId)
  const scope = resolveMediaScope(walletAddress)
  await deleteCachedMediaRecord(scope, mediaId)
}

export async function deleteCachedMediaForMessage(
  messageId: string,
  conversationId: string,
  walletAddress?: string,
): Promise<void> {
  const scope = resolveMediaScope(walletAddress)
  const media = await getConversationMedia(scope, conversationId)
  await Promise.all(
    media.filter((item) => item.messageId === messageId).map((item) => deleteCachedMediaRecord(scope, item.id)),
  )
}

export async function deleteConversationMedia(
  conversationId: string,
  walletAddress?: string,
): Promise<void> {
  const scope = resolveMediaScope(walletAddress)
  const media = await getConversationMedia(scope, conversationId)
  await Promise.all(media.map((item) => deleteCachedMediaRecord(scope, item.id)))
  await getAppKeyValueStorage().removeItem(scopedIndexKey(scope, conversationId))
}

export async function clearMediaCache(): Promise<void> {
  initializedScopes.clear()
  const keys = await getAppKeyValueStorage().getAllKeys()
  const mediaKeys = keys.filter((key) => (
    key.startsWith(MEDIA_PREFIX)
    || key.startsWith(MEDIA_INDEX_PREFIX)
    || (
      (
        key.startsWith(LEGACY_MEDIA_PREFIX)
        || key.startsWith(LEGACY_MEDIA_INDEX_PREFIX)
      )
      && !key.startsWith(MEDIA_PREFIX)
      && !key.startsWith(MEDIA_INDEX_PREFIX)
    )
  ))
  await Promise.all([
    PERSISTENT_DIRECTORY
      ? FileSystem.deleteAsync(PERSISTENT_DIRECTORY, { idempotent: true })
      : Promise.resolve(),
    LEGACY_MEDIA_DIRECTORY
      ? FileSystem.deleteAsync(LEGACY_MEDIA_DIRECTORY, { idempotent: true })
      : Promise.resolve(),
    clearTransientRenderCache(),
    mediaKeys.length > 0 ? getAppKeyValueStorage().multiRemove(mediaKeys) : Promise.resolve(),
  ])
}

export async function clearMediaCacheScope(walletAddress: string): Promise<void> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) return
  initializedScopes.delete(scope)
  const keys = await getAppKeyValueStorage().getAllKeys()
  const scopedKeys = keys.filter((key) => (
    key.startsWith(`${MEDIA_PREFIX}${scope}_`)
    || key.startsWith(`${MEDIA_INDEX_PREFIX}${scope}_`)
  ))
  await Promise.all([
    PERSISTENT_DIRECTORY
      ? FileSystem.deleteAsync(getPersistentScopeDirectory(scope), { idempotent: true })
      : Promise.resolve(),
    scopedKeys.length > 0 ? getAppKeyValueStorage().multiRemove(scopedKeys) : Promise.resolve(),
    clearTransientRenderCache(),
  ])
}

async function resolveAttachmentUri(
  attachment: MediaAttachment,
  scope: string,
): Promise<MediaAttachment> {
  const localUri = await getLocalMediaUri(attachment.id, scope)
  return localUri ? { ...attachment, uri: localUri } : attachment
}

export async function resolveAttachmentUris(
  attachments: MediaAttachment[] | undefined,
  walletAddress?: string,
): Promise<MediaAttachment[] | undefined> {
  if (!attachments || attachments.length === 0) return attachments
  const scope = resolveMediaScope(walletAddress)
  return Promise.all(attachments.map((attachment) => resolveAttachmentUri(attachment, scope)))
}
