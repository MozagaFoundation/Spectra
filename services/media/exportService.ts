/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { Linking, Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import * as MediaLibrary from 'expo-media-library'
import * as Sharing from 'expo-sharing'
import type { MediaAttachment } from '@/lib/types'
import { mobileLogWarn } from '@/services/logging/mobileLogger'
import {
  assertExternalUrlAllowed,
  openExternalUrl,
} from '@/services/tor/externalLinkPolicy'
import { resolveEgressSafeAssetUri } from './egressSafeAsset'
import { protectSensitiveFilePath } from './transientRenderCache'

const CONTENT_URI_PATTERN = /^content:\/\//i
const DATA_URI_PATTERN = /^data:.*;base64,(.+)$/i
const MIME_TYPE_TO_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

export type MediaExportErrorCode =
  | 'missing_uri'
  | 'permission_denied'
  | 'sharing_unavailable'
  | 'unresolvable_uri'
  | 'unsupported_uri'

export class MediaExportError extends Error {
  constructor(
    public readonly code: MediaExportErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'MediaExportError'
  }
}

export interface MediaExportOptions {
  defaultExtension?: string
  dialogTitle?: string
  fileName?: string
  mimeType?: string
  UTI?: string
}

let mediaExportDirectory: string | null = null
let mediaExportDirectoryInitialized = false

function getMediaExportDirectory(): string {
  if (!mediaExportDirectory) {
    const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory
    if (!baseDirectory) {
      throw new MediaExportError('unsupported_uri', 'No writable export directory is available')
    }
    mediaExportDirectory = `${baseDirectory}media_exports/`
  }

  return mediaExportDirectory
}

async function ensureMediaExportDirectory(): Promise<void> {
  if (mediaExportDirectoryInitialized) {
    return
  }

  const directory = getMediaExportDirectory()
  const info = await FileSystem.getInfoAsync(directory)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
  }
  await protectSensitiveFilePath(directory)

  mediaExportDirectoryInitialized = true
}

export async function clearMediaExportCache(): Promise<void> {
  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory
  if (!baseDirectory) {
    return
  }

  const directory = mediaExportDirectory ?? `${baseDirectory}media_exports/`
  await FileSystem.deleteAsync(directory, { idempotent: true })
  mediaExportDirectoryInitialized = false
}

function getExtensionFromFileName(fileName?: string | null): string | null {
  const trimmedName = fileName?.trim()
  const dotIndex = trimmedName?.lastIndexOf('.') ?? -1
  if (!trimmedName || dotIndex <= 0 || dotIndex === trimmedName.length - 1) {
    return null
  }

  return trimmedName.slice(dotIndex + 1).toLowerCase()
}

function getExtensionFromUri(uri: string): string | null {
  const path = uri.split('?')[0]?.split('#')[0] ?? uri
  const slashIndex = path.lastIndexOf('/')
  const fileName = slashIndex >= 0 ? path.slice(slashIndex + 1) : path
  return getExtensionFromFileName(fileName)
}

function getBaseNameCandidate(uri: string, fileName?: string | null): string {
  const trimmedName = fileName?.trim()
  if (trimmedName) {
    return trimmedName
  }

  const path = uri.split('?')[0]?.split('#')[0] ?? uri
  const slashIndex = path.lastIndexOf('/')
  return slashIndex >= 0 ? path.slice(slashIndex + 1) : path
}

function sanitizeFileStem(value: string): string {
  const withoutExtension = value.replace(/\.[^./\\]+$/, '')
  const sanitized = withoutExtension
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return sanitized || 'attachment'
}

function inferExtension(uri: string, options?: MediaExportOptions): string {
  return (
    getExtensionFromFileName(options?.fileName)
    || (options?.mimeType ? MIME_TYPE_TO_EXTENSION[options.mimeType.toLowerCase()] : null)
    || getExtensionFromUri(uri)
    || options?.defaultExtension
    || 'bin'
  )
}

function buildExportFileUri(uri: string, options?: MediaExportOptions): string {
  const extension = inferExtension(uri, options)
  const fileStem = sanitizeFileStem(getBaseNameCandidate(uri, options?.fileName))
  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return `${getMediaExportDirectory()}${fileStem}-${uniqueSuffix}.${extension}`
}

async function resolveExportUri(uri: string, options?: MediaExportOptions): Promise<string> {
  if (!uri) {
    throw new MediaExportError('missing_uri', 'Attachment URI is missing')
  }

  const resolvedUri = await resolveEgressSafeAssetUri(uri, {
    expectedMimeType: options?.mimeType,
  })
  if (!resolvedUri) {
    throw new MediaExportError('unresolvable_uri', 'Attachment URI could not be resolved')
  }

  return resolvedUri
}

export async function ensureLocalAttachmentUri(
  uri: string,
  options?: MediaExportOptions,
): Promise<string> {
  const resolvedUri = await resolveExportUri(uri, options)
  if (resolvedUri.startsWith('file://')) {
    return resolvedUri
  }

  await ensureMediaExportDirectory()
  const exportUri = buildExportFileUri(resolvedUri, options)

  if (CONTENT_URI_PATTERN.test(resolvedUri)) {
    await FileSystem.copyAsync({
      from: resolvedUri,
      to: exportUri,
    })
    await protectSensitiveFilePath(exportUri)
    return exportUri
  }

  const dataUriMatch = resolvedUri.match(DATA_URI_PATTERN)
  if (dataUriMatch?.[1]) {
    await FileSystem.writeAsStringAsync(exportUri, dataUriMatch[1], {
      encoding: FileSystem.EncodingType.Base64,
    })
    await protectSensitiveFilePath(exportUri)
    return exportUri
  }

  throw new MediaExportError(
    'unsupported_uri',
    `Unsupported attachment URI scheme: ${resolvedUri}`,
  )
}

async function requestPhotoSavePermission(): Promise<void> {
  const permission = Platform.OS === 'android'
    ? await MediaLibrary.requestPermissionsAsync(true, ['photo'])
    : await MediaLibrary.requestPermissionsAsync(true)

  if (permission.status !== 'granted') {
    throw new MediaExportError(
      'permission_denied',
      'Photo library permission was not granted',
    )
  }
}

export async function saveImageToLibrary(
  uri: string,
  options?: MediaExportOptions,
): Promise<void> {
  await requestPhotoSavePermission()
  const localUri = await ensureLocalAttachmentUri(uri, options)
  await MediaLibrary.saveToLibraryAsync(localUri)
}

export async function shareAttachment(
  uri: string,
  options?: MediaExportOptions,
): Promise<void> {
  assertExternalUrlAllowed()
  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) {
    throw new MediaExportError(
      'sharing_unavailable',
      'Sharing is not available on this device',
    )
  }

  const localUri = await ensureLocalAttachmentUri(uri, options)
  await Sharing.shareAsync(localUri, {
    dialogTitle: options?.dialogTitle ?? options?.fileName,
    mimeType: options?.mimeType,
    UTI: options?.UTI,
  })
}

type ExportableAttachment = Pick<MediaAttachment, 'fileName' | 'mimeType' | 'uri'>

export async function openAttachmentExternally(
  attachment: ExportableAttachment,
): Promise<boolean> {
  assertExternalUrlAllowed()
  let localUri: string | null = null

  try {
    localUri = await ensureLocalAttachmentUri(attachment.uri, {
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    })

    let openUri = localUri
    if (Platform.OS === 'android') {
      openUri = await FileSystem.getContentUriAsync(localUri)
    }

    const canOpen = await Linking.canOpenURL(openUri)
    if (canOpen) {
      return openExternalUrl(openUri)
    }
  } catch (error) {
    mobileLogWarn('MediaExport', 'direct_open_failed', { error })
  }

  try {
    await shareAttachment(localUri ?? attachment.uri, {
      dialogTitle: attachment.fileName,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    })
    return true
  } catch (error) {
    mobileLogWarn('MediaExport', 'share_failed', { error })
  }

  return false
}
