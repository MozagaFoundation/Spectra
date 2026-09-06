/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as FileSystem from 'expo-file-system/legacy'
import { base64ToBytes, bytesToBase64 } from '@spectra/identity-vault'
import {
  buildLocalCacheAad,
  openLocalCacheText,
  sealLocalCacheText,
  type LocalCacheCipher,
} from '@/services/storage/localCacheCrypto'
import { normalizeAccountStorageScope } from '@/lib/accountScope'
import { torAwareFetchBytes } from '@/services/tor/torFetch'
import { digestMediaCacheKey } from './cacheKey'

const CACHE_VERSION = 2 as const

type AvatarCacheRecord = {
  v: typeof CACHE_VERSION
  cipher: LocalCacheCipher
}

type AvatarPayload = {
  mimeType: string
  base64: string
}

const LEGACY_CACHE_DIRECTORY = FileSystem.cacheDirectory
  ? `${FileSystem.cacheDirectory}spectra-encrypted-avatars-v1/`
  : null
const CACHE_DIRECTORY = FileSystem.cacheDirectory
  ? `${FileSystem.cacheDirectory}spectra-encrypted-avatars-v2/`
  : null
const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const MAX_AVATAR_MEMORY_BYTES = 24 * 1024 * 1024
const memoryCache = new Map<string, string>()
const inFlightLoads = new Map<string, Promise<string | null>>()
const cacheKeyGenerations = new Map<string, number>()
let cacheGeneration = 0
let clearPromise: Promise<void> | null = null
let legacyCleanupPromise: Promise<void> | null = null
let memoryCacheBytes = 0

function estimateStringBytes(value: string): number {
  return value.length * 2
}

function deleteMemoryEntry(key: string): void {
  const existing = memoryCache.get(key)
  if (existing) {
    memoryCacheBytes = Math.max(0, memoryCacheBytes - estimateStringBytes(existing))
  }
  memoryCache.delete(key)
}

function getMemoryEntry(key: string): string | undefined {
  const value = memoryCache.get(key)
  if (!value) return undefined
  memoryCache.delete(key)
  memoryCache.set(key, value)
  return value
}

function setMemoryEntry(key: string, value: string): void {
  deleteMemoryEntry(key)
  const valueBytes = estimateStringBytes(value)
  if (valueBytes > MAX_AVATAR_MEMORY_BYTES) return
  while (memoryCacheBytes + valueBytes > MAX_AVATAR_MEMORY_BYTES) {
    const oldestKey = memoryCache.keys().next().value as string | undefined
    if (!oldestKey) break
    deleteMemoryEntry(oldestKey)
  }
  memoryCache.set(key, value)
  memoryCacheBytes += valueBytes
}

function clearMemoryEntries(): void {
  memoryCache.clear()
  memoryCacheBytes = 0
}

function requireScope(walletAddress: string): string {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (!scope) throw new Error('Avatar cache wallet scope is required')
  return scope
}

function isAllowedMimeType(value: string): boolean {
  return /^image\/(avif|gif|heic|heif|jpeg|png|webp)$/i.test(value)
}

function asciiAt(bytes: Uint8Array, offset: number, value: string): boolean {
  if (bytes.length < offset + value.length) return false
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false
  }
  return true
}

function matchesImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  switch (mimeType) {
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    case 'image/png':
      return bytes[0] === 0x89 && asciiAt(bytes, 1, 'PNG\r\n\u001a\n')
    case 'image/gif':
      return asciiAt(bytes, 0, 'GIF87a') || asciiAt(bytes, 0, 'GIF89a')
    case 'image/webp':
      return asciiAt(bytes, 0, 'RIFF') && asciiAt(bytes, 8, 'WEBP')
    case 'image/avif':
      return asciiAt(bytes, 4, 'ftyp') && (
        asciiAt(bytes, 8, 'avif') || asciiAt(bytes, 8, 'avis')
      )
    case 'image/heic':
    case 'image/heif':
      return asciiAt(bytes, 4, 'ftyp') && (
        asciiAt(bytes, 8, 'heic')
        || asciiAt(bytes, 8, 'heix')
        || asciiAt(bytes, 8, 'hevc')
        || asciiAt(bytes, 8, 'hevx')
        || asciiAt(bytes, 8, 'mif1')
        || asciiAt(bytes, 8, 'msf1')
      )
    default:
      return false
  }
}

function detectImageMimeType(bytes: Uint8Array): string | null {
  const mimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/heif',
  ]
  return mimeTypes.find((mimeType) => matchesImageSignature(bytes, mimeType)) ?? null
}

function selectAvatarPayload(
  response: Awaited<ReturnType<typeof torAwareFetchBytes>>,
  declaredMimeType: string,
): { bytes: Uint8Array; mimeType: string } {
  const candidates = [
    response.bytes,
    response.byteCandidates?.base64,
    response.byteCandidates?.latin1,
    response.byteCandidates?.utf8,
  ].filter((candidate): candidate is Uint8Array => Boolean(candidate))

  if (isAllowedMimeType(declaredMimeType)) {
    const matching = candidates.find((candidate) => (
      matchesImageSignature(candidate, declaredMimeType)
    ))
    if (matching) {
      return { bytes: matching, mimeType: declaredMimeType }
    }
    throw new Error('Avatar response does not match its image type')
  }

  if (declaredMimeType !== 'application/octet-stream') {
    throw new Error('Avatar response is not a supported image')
  }

  for (const candidate of candidates) {
    const mimeType = detectImageMimeType(candidate)
    if (mimeType) {
      return { bytes: candidate, mimeType }
    }
  }
  throw new Error('Avatar response does not contain a supported image')
}

async function getCacheId(scope: string, stableSourceKey: string): Promise<string> {
  return digestMediaCacheKey('avatar-v2', [scope, stableSourceKey])
}

function getAssociatedData(scope: string, cacheId: string): Uint8Array {
  return buildLocalCacheAad(['spectra', 'avatar', 'v2', scope, cacheId])
}

async function clearLegacyCache(): Promise<void> {
  if (!LEGACY_CACHE_DIRECTORY) return
  if (!legacyCleanupPromise) {
    legacyCleanupPromise = FileSystem.deleteAsync(
      LEGACY_CACHE_DIRECTORY,
      { idempotent: true },
    ).catch((error) => {
      legacyCleanupPromise = null
      if (__DEV__) console.warn('[AvatarCache] Failed to remove legacy cache:', error)
    })
  }
  await legacyCleanupPromise
}

async function ensureCacheDirectory(): Promise<void> {
  await clearLegacyCache()
  if (!CACHE_DIRECTORY) return
  const info = await FileSystem.getInfoAsync(CACHE_DIRECTORY)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_DIRECTORY, { intermediates: true })
  }
}

function recordPath(cacheId: string): string | null {
  return CACHE_DIRECTORY ? `${CACHE_DIRECTORY}${cacheId}.json` : null
}

function parseDataUri(uri: string): AvatarPayload | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(uri)
  if (!match || !isAllowedMimeType(match[1])) return null
  const base64 = match[2].replace(/\s/g, '')
  if (Math.ceil(base64.length * 0.75) > MAX_AVATAR_BYTES) return null
  const mimeType = match[1].toLowerCase()
  if (!matchesImageSignature(base64ToBytes(base64), mimeType)) return null
  return { mimeType, base64 }
}

async function readAvatarSource(uri: string): Promise<AvatarPayload> {
  const inline = parseDataUri(uri)
  if (inline) return inline

  if (uri.startsWith('file:')) {
    const info = await FileSystem.getInfoAsync(uri)
    if (!info.exists || (typeof info.size === 'number' && info.size > MAX_AVATAR_BYTES)) {
      throw new Error('Avatar file is unavailable or too large')
    }
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
    if (Math.ceil(base64.length * 0.75) > MAX_AVATAR_BYTES) {
      throw new Error('Avatar file is too large')
    }
    const bytes = base64ToBytes(base64)
    const mimeType = detectImageMimeType(bytes)
    if (!mimeType) {
      throw new Error('Avatar file is not a supported image')
    }
    return { mimeType, base64 }
  }

  const parsedUrl = new URL(uri)
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Avatar downloads require HTTPS')
  }
  const response = await torAwareFetchBytes(uri, {
    headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' },
  })
  if (!response.ok) {
    throw new Error(`Avatar download failed with status ${response.status}`)
  }
  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength > MAX_AVATAR_BYTES) {
    throw new Error('Avatar download is too large')
  }
  const declaredMimeType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase()
  const { bytes, mimeType } = selectAvatarPayload(response, declaredMimeType)
  if (bytes.byteLength > MAX_AVATAR_BYTES) {
    throw new Error('Avatar download is too large')
  }
  return { mimeType, base64: bytesToBase64(bytes) }
}

async function readCachedAvatar(
  scope: string,
  cacheId: string,
): Promise<string | null> {
  const path = recordPath(cacheId)
  if (!path) return null
  const info = await FileSystem.getInfoAsync(path)
  if (!info.exists) return null
  try {
    const record = JSON.parse(await FileSystem.readAsStringAsync(path)) as AvatarCacheRecord
    if (record?.v !== CACHE_VERSION || !record.cipher) throw new Error('Invalid avatar cache record')
    const payload = JSON.parse(await openLocalCacheText(
      scope,
      'avatar',
      record.cipher,
      getAssociatedData(scope, cacheId),
    )) as AvatarPayload
    if (
      !isAllowedMimeType(payload?.mimeType)
      || typeof payload?.base64 !== 'string'
      || Math.ceil(payload.base64.length * 0.75) > MAX_AVATAR_BYTES
    ) {
      throw new Error('Invalid avatar cache payload')
    }
    return `data:${payload.mimeType};base64,${payload.base64}`
  } catch {
    await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined)
    return null
  }
}

async function writeCachedAvatar(
  scope: string,
  cacheId: string,
  payload: AvatarPayload,
  expectedGeneration: number,
  memoryKey: string,
  expectedKeyGeneration: number,
): Promise<void> {
  const path = recordPath(cacheId)
  if (!path) return
  await ensureCacheDirectory()
  const cipher = await sealLocalCacheText(
    scope,
    'avatar',
    JSON.stringify(payload),
    getAssociatedData(scope, cacheId),
  )
  const temporaryPath = `${path}.${Date.now()}.tmp`
  await FileSystem.writeAsStringAsync(
    temporaryPath,
    JSON.stringify({ v: CACHE_VERSION, cipher } satisfies AvatarCacheRecord),
  )
  if (
    expectedGeneration !== cacheGeneration
    || expectedKeyGeneration !== (cacheKeyGenerations.get(memoryKey) ?? 0)
  ) {
    await FileSystem.deleteAsync(temporaryPath, { idempotent: true })
    return
  }
  await FileSystem.moveAsync({ from: temporaryPath, to: path })
  if (
    expectedGeneration !== cacheGeneration
    || expectedKeyGeneration !== (cacheKeyGenerations.get(memoryKey) ?? 0)
  ) {
    await FileSystem.deleteAsync(path, { idempotent: true })
  }
}

export async function loadEncryptedAvatar(
  walletAddress: string,
  stableSourceKey: string,
  resolveUri: string | (() => Promise<string | null>),
): Promise<string | null> {
  await clearLegacyCache()
  const scope = requireScope(walletAddress)
  const cacheId = await getCacheId(scope, stableSourceKey)
  const memoryKey = `${scope}:${cacheId}`
  const memoryValue = getMemoryEntry(memoryKey)
  if (memoryValue) return memoryValue

  const existingLoad = inFlightLoads.get(memoryKey)
  if (existingLoad) return existingLoad

  const load = (async () => {
    const generation = cacheGeneration
    const keyGeneration = cacheKeyGenerations.get(memoryKey) ?? 0
    const cached = await readCachedAvatar(scope, cacheId)
    if (
      generation !== cacheGeneration
      || keyGeneration !== (cacheKeyGenerations.get(memoryKey) ?? 0)
    ) return null
    if (cached) {
      setMemoryEntry(memoryKey, cached)
      return cached
    }
    const resolvedUri = typeof resolveUri === 'function' ? await resolveUri() : resolveUri
    if (!resolvedUri) return null
    const payload = await readAvatarSource(resolvedUri)
    if (
      generation !== cacheGeneration
      || keyGeneration !== (cacheKeyGenerations.get(memoryKey) ?? 0)
    ) return null
    const dataUri = `data:${payload.mimeType};base64,${payload.base64}`
    await writeCachedAvatar(
      scope,
      cacheId,
      payload,
      generation,
      memoryKey,
      keyGeneration,
    )
    if (
      generation !== cacheGeneration
      || keyGeneration !== (cacheKeyGenerations.get(memoryKey) ?? 0)
    ) return null
    setMemoryEntry(memoryKey, dataUri)
    return dataUri
  })()

  inFlightLoads.set(memoryKey, load)
  const releaseLoad = () => {
    if (inFlightLoads.get(memoryKey) === load) {
      inFlightLoads.delete(memoryKey)
    }
  }
  void load.then(releaseLoad, releaseLoad)
  return load
}

export async function evictEncryptedAvatar(
  walletAddress: string,
  stableSourceKey: string,
): Promise<void> {
  await clearLegacyCache()
  const scope = requireScope(walletAddress)
  const cacheId = await getCacheId(scope, stableSourceKey)
  const memoryKey = `${scope}:${cacheId}`
  cacheKeyGenerations.set(memoryKey, (cacheKeyGenerations.get(memoryKey) ?? 0) + 1)
  deleteMemoryEntry(memoryKey)
  inFlightLoads.delete(memoryKey)
  const path = recordPath(cacheId)
  if (path) {
    await FileSystem.deleteAsync(path, { idempotent: true })
  }
}

export async function primeEncryptedAvatar(
  walletAddress: string,
  stableSourceKey: string,
  localUri: string,
): Promise<string> {
  const scope = requireScope(walletAddress)
  const cacheId = await getCacheId(scope, stableSourceKey)
  const memoryKey = `${scope}:${cacheId}`
  await evictEncryptedAvatar(walletAddress, stableSourceKey)
  const generation = cacheGeneration
  const keyGeneration = cacheKeyGenerations.get(memoryKey) ?? 0
  const payload = await readAvatarSource(localUri)
  if (
    generation !== cacheGeneration
    || keyGeneration !== (cacheKeyGenerations.get(memoryKey) ?? 0)
  ) {
    throw new Error('Avatar cache changed while priming')
  }
  const dataUri = `data:${payload.mimeType};base64,${payload.base64}`
  await writeCachedAvatar(
    scope,
    cacheId,
    payload,
    generation,
    memoryKey,
    keyGeneration,
  )
  if (
    generation !== cacheGeneration
    || keyGeneration !== (cacheKeyGenerations.get(memoryKey) ?? 0)
  ) {
    throw new Error('Avatar cache changed while priming')
  }
  setMemoryEntry(memoryKey, dataUri)
  return dataUri
}

export async function clearEncryptedAvatarCache(): Promise<void> {
  cacheGeneration += 1
  cacheKeyGenerations.clear()
  clearMemoryEntries()
  inFlightLoads.clear()
  if (!clearPromise) {
    const directories = [LEGACY_CACHE_DIRECTORY, CACHE_DIRECTORY]
      .filter((path): path is string => Boolean(path))
    clearPromise = Promise.all(directories.map(
      (path) => FileSystem.deleteAsync(path, { idempotent: true }),
    )).then(() => undefined).finally(() => {
      clearPromise = null
    })
  }
  await clearPromise
}

export function clearEncryptedAvatarMemoryCache(): void {
  clearMemoryEntries()
  inFlightLoads.clear()
}
