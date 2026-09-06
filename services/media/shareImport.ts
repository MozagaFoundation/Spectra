/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as FileSystem from 'expo-file-system/legacy'
import type { MediaAttachment, MediaType } from '@/lib/types'
import {
  deleteAppOwnedMediaIngress,
  stageAndValidateMediaIngress,
} from './mediaIngress'

const SHARE_IMPORT_SOURCE = 'ios-share-extension'
const SHARE_IMPORT_MANIFEST_VERSION = 2
const SHARE_IMPORT_DIRECTORY_SEGMENT = '/SpectraShare/'
const SHARE_IMPORT_MAX_AGE_MS = 30 * 60 * 1000
const SHARE_IMPORT_MAX_FUTURE_SKEW_MS = 5 * 60 * 1000
const SHARE_IMPORT_MAX_ITEMS = 10
const SHARE_IMPORT_MAX_TEXT_BYTES = 100 * 1024
const SHARE_IMPORT_MAX_MANIFEST_BYTES = 256 * 1024
const SHARE_IMPORT_MAX_SINGLE_FILE_BYTES = 100 * 1024 * 1024
const SHARE_IMPORT_MAX_TOTAL_FILE_BYTES = 250 * 1024 * 1024
const SHARE_IMPORT_MANIFEST_FILE = 'manifest.json'
const SHARE_IMPORT_ID_PATTERN = /^[a-f0-9-]{36}$/

type ShareManifestItem = {
  id?: unknown
  kind?: unknown
  typeIdentifier?: unknown
  fileName?: unknown
  mimeType?: unknown
  fileUri?: unknown
  fileSize?: unknown
  digest?: unknown
  text?: unknown
  url?: unknown
}

type ShareManifest = {
  schemaVersion?: unknown
  id?: unknown
  source?: unknown
  createdAt?: unknown
  items?: unknown
}

export type PendingShareImport = {
  id: string
  manifestUri: string
  createdAt: number
  content: string
  attachments: MediaAttachment[]
}

export class ShareImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShareImportError'
  }
}

function byteLength(value: string): number {
  let bytes = 0
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index)
    if (codePoint < 0x80) {
      bytes += 1
    } else if (codePoint < 0x800) {
      bytes += 2
    } else if (codePoint >= 0xd800 && codePoint <= 0xdbff && index + 1 < value.length) {
      bytes += 4
      index += 1
    } else {
      bytes += 3
    }
  }
  return bytes
}

function assertFileUri(uri: string, label: string): void {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    throw new ShareImportError(`${label} must be a local file URL`)
  }
  let decodedPath: string
  try {
    decodedPath = decodeURIComponent(parsed.pathname)
  } catch {
    throw new ShareImportError(`${label} contains an invalid path`)
  }
  if (
    parsed.protocol !== 'file:'
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || /%2f|%5c/i.test(parsed.pathname)
    || decodedPath.split('/').includes('..')
    || decodedPath.includes('\0')
  ) {
    throw new ShareImportError(`${label} contains an invalid path`)
  }
}

function assertManifestUri(uri: string): void {
  assertFileUri(uri, 'Share import manifest')
  if (!uri.includes(SHARE_IMPORT_DIRECTORY_SEGMENT) || !uri.endsWith(`/${SHARE_IMPORT_MANIFEST_FILE}`)) {
    throw new ShareImportError('Share import manifest is outside the expected handoff directory')
  }
}

function getManifestDirectory(manifestUri: string): string {
  return manifestUri.slice(0, -`/${SHARE_IMPORT_MANIFEST_FILE}`.length)
}

function getShareImportRootDirectory(manifestUri: string): string {
  const segmentIndex = manifestUri.indexOf(SHARE_IMPORT_DIRECTORY_SEGMENT)
  if (segmentIndex < 0) {
    throw new ShareImportError('Share import manifest is outside the expected handoff directory')
  }
  return manifestUri.slice(0, segmentIndex + SHARE_IMPORT_DIRECTORY_SEGMENT.length - 1)
}

function joinFileUri(directoryUri: string, childName: string): string {
  return `${directoryUri.replace(/\/+$/, '')}/${childName}`
}

function assertManifestId(value: unknown): string {
  if (typeof value !== 'string' || !SHARE_IMPORT_ID_PATTERN.test(value)) {
    throw new ShareImportError('Share import manifest has an invalid id')
  }
  return value
}

function assertString(value: unknown, label: string, maxBytes = 512): string {
  if (typeof value !== 'string') {
    throw new ShareImportError(`${label} is missing`)
  }
  const trimmed = value.trim()
  if (!trimmed || byteLength(trimmed) > maxBytes) {
    throw new ShareImportError(`${label} is invalid`)
  }
  return trimmed
}

function inferMediaType(kind: string): MediaType {
  if (kind === 'image') return 'image'
  if (kind === 'video') return 'video'
  if (kind === 'audio') return 'audio'
  return 'document'
}

function defaultMimeType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'gif':
      return 'image/gif'
    case 'heic':
      return 'image/heic'
    case 'heif':
      return 'image/heif'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'm4a':
      return 'audio/m4a'
    case 'mp3':
      return 'audio/mpeg'
    case 'mp4':
      return 'video/mp4'
    case 'pdf':
      return 'application/pdf'
    case 'png':
      return 'image/png'
    case 'txt':
      return 'text/plain'
    case 'webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

async function toMediaAttachment(
  manifestId: string,
  manifestDirectory: string,
  item: ShareManifestItem,
  index: number,
  totalBytes: { value: number },
): Promise<MediaAttachment | null> {
  if (typeof item.fileUri !== 'string') {
    return null
  }

  const fileUri = item.fileUri
  assertFileUri(fileUri, 'Shared file')
  if (!fileUri.startsWith(`${manifestDirectory}/`)) {
    throw new ShareImportError('Shared file is outside the expected handoff directory')
  }

  const fileName = assertString(item.fileName, 'Shared file name', 512)
  const mimeType = typeof item.mimeType === 'string' && item.mimeType.trim()
    ? item.mimeType.trim()
    : defaultMimeType(fileName)
  const kind = typeof item.kind === 'string' ? item.kind : 'document'
  const digest = assertString(item.digest, 'Shared file digest', 64).toLowerCase()

  const info = await FileSystem.getInfoAsync(fileUri)
  if (!info.exists) {
    throw new ShareImportError('Shared file no longer exists')
  }

  const manifestFileSize = typeof item.fileSize === 'number' && Number.isSafeInteger(item.fileSize)
    ? item.fileSize
    : 0
  if (manifestFileSize <= 0) {
    throw new ShareImportError('Shared file has an invalid size')
  }

  if (manifestFileSize > SHARE_IMPORT_MAX_SINGLE_FILE_BYTES) {
    throw new ShareImportError('Shared file is too large')
  }

  totalBytes.value += manifestFileSize
  if (totalBytes.value > SHARE_IMPORT_MAX_TOTAL_FILE_BYTES) {
    throw new ShareImportError('Shared files are too large')
  }

  const expectedMediaType = inferMediaType(kind)
  const validated = await stageAndValidateMediaIngress({
    id: `share_import_${manifestId}_${index}`,
    uri: fileUri,
    fileName,
    mimeType,
    fileSize: manifestFileSize,
    mediaType: expectedMediaType,
  }, {
    expectedDigest: digest,
    requireDeclaredSizeMatch: true,
    maxBytes: SHARE_IMPORT_MAX_SINGLE_FILE_BYTES,
  })

  return {
    id: `share_import_${manifestId}_${index}`,
    type: validated.mediaType,
    uri: validated.uri,
    source: 'ios_share_extension',
    fileName,
    mimeType: validated.mimeType,
    fileSize: validated.fileSize,
    width: validated.width,
    height: validated.height,
  }
}

function collectTextContent(items: ShareManifestItem[]): string {
  const parts = items.flatMap((item) => {
    const values = [item.text, item.url]
    return values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
  })

  const content = [...new Set(parts)].join('\n')
  if (byteLength(content) > SHARE_IMPORT_MAX_TEXT_BYTES) {
    throw new ShareImportError('Shared text is too large')
  }
  return content
}

function normalizeModificationTime(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return value > 1_000_000_000_000 ? value : value * 1000
}

function getCreatedAtFromManifest(rawManifest: string): number | null {
  try {
    const parsed = JSON.parse(rawManifest) as ShareManifest
    return typeof parsed.createdAt === 'number' && Number.isFinite(parsed.createdAt)
      ? parsed.createdAt
      : null
  } catch {
    return null
  }
}

async function getShareImportDirectoryTimestamp(directoryUri: string): Promise<number | null> {
  const manifestUri = joinFileUri(directoryUri, SHARE_IMPORT_MANIFEST_FILE)

  try {
    const rawManifest = await FileSystem.readAsStringAsync(manifestUri, {
      encoding: FileSystem.EncodingType.UTF8,
    })
    const createdAt = getCreatedAtFromManifest(rawManifest)
    if (createdAt !== null) {
      return createdAt
    }
  } catch {}

  try {
    const info = await FileSystem.getInfoAsync(directoryUri)
    return normalizeModificationTime((info as { modificationTime?: unknown }).modificationTime)
  } catch {
    return null
  }
}

export async function loadPendingShareImport(manifestUri: string): Promise<PendingShareImport> {
  assertManifestUri(manifestUri)

  const manifestInfo = await FileSystem.getInfoAsync(manifestUri)
  if (
    !manifestInfo.exists
    || typeof manifestInfo.size !== 'number'
    || manifestInfo.size <= 0
    || manifestInfo.size > SHARE_IMPORT_MAX_MANIFEST_BYTES
  ) {
    throw new ShareImportError('Share import manifest is unavailable or too large')
  }
  const rawManifest = await FileSystem.readAsStringAsync(manifestUri, {
    encoding: FileSystem.EncodingType.UTF8,
  })
  const parsed = JSON.parse(rawManifest) as ShareManifest

  if (parsed.schemaVersion !== SHARE_IMPORT_MANIFEST_VERSION || parsed.source !== SHARE_IMPORT_SOURCE) {
    throw new ShareImportError('Unsupported share import manifest')
  }

  const id = assertManifestId(parsed.id)
  const manifestDirectory = getManifestDirectory(manifestUri)
  if (!manifestDirectory.endsWith(`/${id}`)) {
    throw new ShareImportError('Share import manifest id does not match its directory')
  }

  if (typeof parsed.createdAt !== 'number' || !Number.isFinite(parsed.createdAt)) {
    throw new ShareImportError('Share import manifest has an invalid timestamp')
  }
  const manifestAge = Date.now() - parsed.createdAt
  if (manifestAge > SHARE_IMPORT_MAX_AGE_MS || manifestAge < -SHARE_IMPORT_MAX_FUTURE_SKEW_MS) {
    throw new ShareImportError('Shared content expired. Please share it again.')
  }

  if (!Array.isArray(parsed.items) || parsed.items.length === 0 || parsed.items.length > SHARE_IMPORT_MAX_ITEMS) {
    throw new ShareImportError('Share import manifest has an invalid item count')
  }

  const items = parsed.items as ShareManifestItem[]
  if (items.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new ShareImportError('Share import manifest has an invalid item')
  }
  const totalBytes = { value: 0 }
  const attachments: MediaAttachment[] = []
  let content: string
  try {
    for (const [index, item] of items.entries()) {
      const attachment = await toMediaAttachment(id, manifestDirectory, item, index, totalBytes)
      if (attachment) attachments.push(attachment)
    }
    content = collectTextContent(items)
  } catch (error) {
    await Promise.all(attachments.map((attachment) =>
      deleteAppOwnedMediaIngress(attachment.uri).catch(() => undefined)
    ))
    throw error
  }

  if (!content && attachments.length === 0) {
    throw new ShareImportError('Shared content is empty or unsupported')
  }

  return {
    id,
    manifestUri,
    createdAt: parsed.createdAt,
    content,
    attachments,
  }
}

export async function cleanupPendingShareImport(
  pending: Pick<PendingShareImport, 'manifestUri'> & Partial<Pick<PendingShareImport, 'attachments'>>,
): Promise<void> {
  assertManifestUri(pending.manifestUri)
  await Promise.all([
    FileSystem.deleteAsync(getManifestDirectory(pending.manifestUri), { idempotent: true }),
    ...(pending.attachments ?? []).map((attachment) => deleteAppOwnedMediaIngress(attachment.uri)),
  ])
}

export async function cleanupStaleShareImports(
  manifestUri: string,
  options: { excludeManifestUri?: string } = {},
): Promise<void> {
  assertManifestUri(manifestUri)
  if (options.excludeManifestUri) {
    assertManifestUri(options.excludeManifestUri)
  }

  const rootDirectory = getShareImportRootDirectory(manifestUri)
  const excludedDirectory = options.excludeManifestUri
    ? getManifestDirectory(options.excludeManifestUri)
    : null

  let entries: string[]
  try {
    entries = await FileSystem.readDirectoryAsync(rootDirectory)
  } catch {
    return
  }

  const now = Date.now()
  await Promise.all(entries.map(async (entry) => {
    if (!SHARE_IMPORT_ID_PATTERN.test(entry)) {
      return
    }

    const directoryUri = joinFileUri(rootDirectory, entry)
    if (directoryUri === excludedDirectory) {
      return
    }

    const timestamp = await getShareImportDirectoryTimestamp(directoryUri)
    if (timestamp === null || now - timestamp <= SHARE_IMPORT_MAX_AGE_MS) {
      return
    }

    await FileSystem.deleteAsync(directoryUri, { idempotent: true })
  }))
}
