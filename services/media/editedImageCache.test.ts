/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaAttachment } from '@/lib/types'

const mockState = vi.hoisted(() => ({
  copyAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
  getInfoAsync: vi.fn(async (uri: string) => ({
    exists: uri === 'file:///cache/edited_image_cache/' || uri.startsWith('file:///cache/edited_image_cache/'),
    size: 4096,
  })),
  makeDirectoryAsync: vi.fn(async () => undefined),
  protectSensitiveFilePath: vi.fn(async () => undefined),
}))

vi.mock('./transientRenderCache', () => ({
  protectSensitiveFilePath: mockState.protectSensitiveFilePath,
}))

vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  documentDirectory: 'file:///documents/',
  copyAsync: mockState.copyAsync,
  deleteAsync: mockState.deleteAsync,
  getInfoAsync: mockState.getInfoAsync,
  makeDirectoryAsync: mockState.makeDirectoryAsync,
}))

const {
  cleanupEditedAttachments,
  clearEditedImageCache,
  createEditedImageAttachment,
  deleteEditedImageUris,
  isEditedImageAttachment,
} = await import('./editedImageCache')

function sourceAttachment(overrides: Partial<MediaAttachment> = {}): MediaAttachment {
  return Object.assign({
    id: 'encrypted-source',
    type: 'image',
    uri: 'file:///decrypted/source.jpg',
    source: 'received',
    fileName: 'Secret Photo.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024,
    width: 640,
    height: 480,
    isEncrypted: false,
  }, overrides) as MediaAttachment
}

describe('editedImageCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates sanitized edited attachments in the controlled cache', async () => {
    const source = {
      ...sourceAttachment(),
      encryptionKey: 'old-secret-key',
    } as MediaAttachment & { encryptionKey: string }

    const edited = await createEditedImageAttachment(source, {
      uri: 'file:///tmp/rendered.jpg',
      width: 320,
      height: 240,
      format: 'jpeg',
    })

    expect(mockState.copyAsync).toHaveBeenCalledWith({
      from: 'file:///tmp/rendered.jpg',
      to: expect.stringMatching(/^file:\/\/\/cache\/edited_image_cache\/Secret_Photo_edited_\d+\.jpg$/),
    })
    expect(edited).toEqual(expect.objectContaining({
      id: expect.stringMatching(/^edited_/),
      type: 'image',
      source: 'image_editor',
      uri: expect.stringMatching(/^file:\/\/\/cache\/edited_image_cache\//),
      mimeType: 'image/jpeg',
      fileSize: 4096,
      width: 320,
      height: 240,
      isEncrypted: false,
      isViewOnce: false,
    }))
    expect('encryptionKey' in edited).toBe(false)
  })

  it('cleans up only edited attachment files', async () => {
    await cleanupEditedAttachments([
      sourceAttachment({ source: 'image_editor', uri: 'file:///cache/edited_image_cache/a.jpg' }),
      sourceAttachment({ source: 'gallery', uri: 'file:///tmp/original.jpg' }),
    ])

    expect(mockState.deleteAsync).toHaveBeenCalledTimes(1)
    expect(mockState.deleteAsync).toHaveBeenCalledWith('file:///cache/edited_image_cache/a.jpg', { idempotent: true })
  })

  it('clears the whole edited image cache directory', async () => {
    await clearEditedImageCache()

    expect(mockState.deleteAsync).toHaveBeenCalledWith('file:///cache/edited_image_cache/', { idempotent: true })
  })

  it('ignores non-file cleanup URIs', async () => {
    await deleteEditedImageUris(['https://example.test/image.jpg', null, undefined])

    expect(mockState.deleteAsync).not.toHaveBeenCalled()
    expect(isEditedImageAttachment(sourceAttachment({ source: 'image_editor' }))).toBe(true)
  })
})
