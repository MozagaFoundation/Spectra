/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { File } from 'expo-file-system'
import * as FileSystem from 'expo-file-system/legacy'
import { protectSensitiveFilePath as protectNativeSensitiveFilePath } from '@/services/storage/sensitiveFileProtection'

const RENDER_DIRECTORY = FileSystem.cacheDirectory
  ? `${FileSystem.cacheDirectory}spectra-transient-render-v1/`
  : null
const SAFE_MEDIA_ID_PATTERN = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]{0,127}$/
const SAFE_SCOPE_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/

function getRenderDirectory(scope?: string): string {
  if (!RENDER_DIRECTORY) {
    throw new Error('Transient render directory is unavailable')
  }
  if (!scope) return RENDER_DIRECTORY
  if (!SAFE_SCOPE_PATTERN.test(scope)) {
    throw new Error('Invalid transient render scope')
  }
  return `${RENDER_DIRECTORY}${scope}/`
}

export async function initializeTransientRenderCache(scope?: string): Promise<void> {
  const directory = getRenderDirectory(scope)
  const info = await FileSystem.getInfoAsync(directory)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
  }
  await protectNativeSensitiveFilePath(directory)
}

export function getTransientRenderDirectory(scope?: string): string {
  return getRenderDirectory(scope)
}

export function getTransientRenderPath(
  mediaId: string,
  extension: string,
  scope?: string,
): string {
  if (!SAFE_MEDIA_ID_PATTERN.test(mediaId) || mediaId.includes('..')) {
    throw new Error('Unsafe media id')
  }
  if (!/^[a-z0-9]{1,12}$/i.test(extension)) {
    throw new Error('Invalid transient render path')
  }
  return `${getRenderDirectory(scope)}${mediaId}.${extension.toLowerCase()}`
}

export async function writeTransientRenderFile(
  uri: string,
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): Promise<void> {
  await initializeTransientRenderCache()
  if (!uri.startsWith(RENDER_DIRECTORY!)) {
    throw new Error('Transient render path is outside the protected directory')
  }

  const file = new File(uri)
  file.create({ overwrite: true, intermediates: true })
  const handle = file.open()
  try {
    for await (const chunk of chunks) {
      handle.writeBytes(chunk)
    }
  } catch (error) {
    handle.close()
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)
    throw error
  }
  handle.close()
  await protectNativeSensitiveFilePath(uri)
}

export async function clearTransientRenderCache(): Promise<void> {
  if (!RENDER_DIRECTORY) return
  await FileSystem.deleteAsync(RENDER_DIRECTORY, { idempotent: true })
}

export async function protectTransientRenderPath(uri: string): Promise<void> {
  if (!RENDER_DIRECTORY || !uri.startsWith(RENDER_DIRECTORY)) {
    throw new Error('Transient render path is outside the protected directory')
  }
  await protectNativeSensitiveFilePath(uri)
}

export async function protectSensitiveFilePath(uri: string): Promise<void> {
  await protectNativeSensitiveFilePath(uri)
}

export function isTransientRenderUri(uri: string | null | undefined): boolean {
  return Boolean(uri && RENDER_DIRECTORY && uri.startsWith(RENDER_DIRECTORY))
}
