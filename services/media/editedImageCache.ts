/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as FileSystem from 'expo-file-system/legacy'
import type { MediaAttachment } from '@/lib/types'
import { protectSensitiveFilePath } from './transientRenderCache'

export type EditedImageFormat = 'jpeg' | 'png'

export interface EditedImageResult {
  uri: string
  width: number
  height: number
  fileSize?: number
  format: EditedImageFormat
}

const EDITED_IMAGE_SOURCE = 'image_editor'
const EDITED_IMAGE_DIRECTORY_NAME = 'edited_image_cache'

let editedImageDirectory: string | null = null
let editedImageDirectoryReady = false

function getEditedImageDirectory(): string {
  if (!editedImageDirectory) {
    const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory
    if (!baseDirectory) {
      throw new Error('No writable image editor cache directory is available')
    }

    editedImageDirectory = `${baseDirectory}${EDITED_IMAGE_DIRECTORY_NAME}/`
  }

  return editedImageDirectory
}

async function ensureEditedImageDirectory(): Promise<string> {
  const directory = getEditedImageDirectory()
  if (editedImageDirectoryReady) {
    return directory
  }

  const info = await FileSystem.getInfoAsync(directory)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
  }
  await protectSensitiveFilePath(directory)

  editedImageDirectoryReady = true
  return directory
}

function normalizeFileBaseName(fileName?: string | null): string {
  const cleanName = (fileName?.trim() || `image_${Date.now()}`)
    .replace(/\.[a-z0-9]{1,8}$/i, '')
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)

  return cleanName || `image_${Date.now()}`
}

function getEditedFileName(fileName: string | undefined, format: EditedImageFormat): string {
  const extension = format === 'png' ? 'png' : 'jpg'
  return `${normalizeFileBaseName(fileName)}_edited_${Date.now()}.${extension}`
}

async function getFileSize(uri: string, fallback = 0): Promise<number> {
  const fileInfo = await FileSystem.getInfoAsync(uri)
  return fileInfo.exists && 'size' in fileInfo ? fileInfo.size || fallback : fallback
}

export function isEditedImageAttachment(attachment?: Pick<MediaAttachment, 'source' | 'uri'> | null): boolean {
  return attachment?.source === EDITED_IMAGE_SOURCE
}

export async function deleteEditedImageUri(uri?: string | null): Promise<void> {
  if (!uri || !uri.startsWith('file:')) {
    return
  }

  try {
    await FileSystem.deleteAsync(uri, { idempotent: true })
  } catch {
    // Ignore cleanup failures.
  }
}

export async function deleteEditedImageUris(uris: Array<string | null | undefined>): Promise<void> {
  await Promise.allSettled(uris.map((uri) => deleteEditedImageUri(uri)))
}

export async function clearEditedImageCache(): Promise<void> {
  const baseDirectory = FileSystem.cacheDirectory ?? FileSystem.documentDirectory
  if (!baseDirectory) {
    return
  }

  const directory = editedImageDirectory ?? `${baseDirectory}${EDITED_IMAGE_DIRECTORY_NAME}/`
  await FileSystem.deleteAsync(directory, { idempotent: true }).catch(() => {})
  editedImageDirectoryReady = false
}

export async function createEditedImageAttachment(
  source: MediaAttachment,
  result: EditedImageResult,
): Promise<MediaAttachment> {
  const directory = await ensureEditedImageDirectory()
  const fileName = getEditedFileName(source.fileName, result.format)
  const destinationUri = `${directory}${fileName}`

  await FileSystem.copyAsync({
    from: result.uri,
    to: destinationUri,
  })
  await protectSensitiveFilePath(destinationUri)

  const fileSize = await getFileSize(destinationUri, result.fileSize ?? source.fileSize)

  return {
    id: `edited_${Date.now()}`,
    type: 'image',
    uri: destinationUri,
    source: EDITED_IMAGE_SOURCE,
    fileName,
    mimeType: result.format === 'png' ? 'image/png' : 'image/jpeg',
    fileSize,
    width: result.width,
    height: result.height,
    isEncrypted: false,
    isViewOnce: false,
  }
}

export async function cleanupEditedAttachments(attachments?: MediaAttachment[] | null): Promise<void> {
  const uris = (attachments ?? [])
    .filter(isEditedImageAttachment)
    .map((attachment) => attachment.uri)

  await deleteEditedImageUris(uris)
}
