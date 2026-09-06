/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaAttachment } from '@/lib/types'

const mockState = vi.hoisted(() => ({
  stageAndValidateMediaIngress: vi.fn(),
  deleteAppOwnedMediaIngress: vi.fn(),
}))

vi.mock('./mediaIngress', () => ({
  stageAndValidateMediaIngress: mockState.stageAndValidateMediaIngress,
  deleteAppOwnedMediaIngress: mockState.deleteAppOwnedMediaIngress,
}))

const {
  hasMediaLibraryAccess,
  normalizeOutgoingFileUri,
  normalizeOutgoingMediaAttachment,
  prepareOutgoingMediaAttachment,
  releasePreparedOutgoingMediaAttachment,
} = await import('./outgoingAttachment')

const attachment: MediaAttachment = {
  id: 'attachment-1',
  type: 'document',
  uri: 'content://downloads/report',
  source: 'document',
  fileName: 'report.pdf',
  mimeType: 'application/pdf',
  fileSize: 123,
}

describe('outgoingAttachment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.stageAndValidateMediaIngress.mockResolvedValue({
      uri: 'file:///cache/media_ingress/attachment-1.pdf',
      fileSize: 2048,
      mimeType: 'application/pdf',
      mediaType: 'document',
      digest: 'a'.repeat(64),
      bytes: Uint8Array.from([1, 2, 3]),
      deleteOnRelease: true,
      pageCount: 1,
    })
  })

  it('accepts limited Android photo-library access', () => {
    expect(hasMediaLibraryAccess({ status: 'denied', accessPrivileges: 'limited' })).toBe(true)
    expect(hasMediaLibraryAccess({ granted: true })).toBe(true)
    expect(hasMediaLibraryAccess({ status: 'denied' })).toBe(false)
  })

  it('stages picker URIs through the shared validator before encryption', async () => {
    const normalized = await normalizeOutgoingMediaAttachment(attachment)

    expect(normalized.uri).toBe('file:///cache/media_ingress/attachment-1.pdf')
    expect(normalized.fileSize).toBe(2048)
    expect(mockState.stageAndValidateMediaIngress).toHaveBeenCalledWith({
      ...attachment,
      mediaType: 'document',
    })
  })

  it('uses the same validator for avatar file sources', async () => {
    const normalized = await normalizeOutgoingFileUri({
      id: 'avatar-1',
      uri: 'content://media/avatar',
      fileName: 'avatar.jpg',
      mimeType: 'image/jpeg',
      fileSize: 123,
    })

    expect(normalized.uri).toBe('file:///cache/media_ingress/attachment-1.pdf')
    expect(normalized.fileSize).toBe(2048)
    expect(normalized.digest).toBe('a'.repeat(64))
  })

  it('carries validated bytes and digest through upload preparation', async () => {
    const prepared = await prepareOutgoingMediaAttachment(attachment)

    expect(prepared.ingress.digest).toBe('a'.repeat(64))
    expect(prepared.ingress.bytes).toEqual(Uint8Array.from([1, 2, 3]))
    expect(prepared.attachment.uri).toBe('file:///cache/media_ingress/attachment-1.pdf')
  })

  it('zeroes plaintext bytes and releases copied ingress files', async () => {
    const prepared = await prepareOutgoingMediaAttachment(attachment)

    await releasePreparedOutgoingMediaAttachment(prepared)

    expect(prepared.ingress.bytes).toEqual(new Uint8Array(3))
    expect(mockState.deleteAppOwnedMediaIngress).toHaveBeenCalledWith(
      'file:///cache/media_ingress/attachment-1.pdf',
    )
  })

  it('propagates validator failures', async () => {
    mockState.stageAndValidateMediaIngress.mockRejectedValueOnce(new Error('Selected file is unavailable'))

    await expect(normalizeOutgoingFileUri({
      id: 'missing',
      uri: 'content://media/missing',
      mimeType: 'application/pdf',
    })).rejects.toThrow('Selected file is unavailable')
  })

  it('revalidates regular file URIs instead of trusting their location', async () => {
    const fileAttachment = { ...attachment, uri: 'file:///cache/report.pdf' }

    await normalizeOutgoingMediaAttachment(fileAttachment)

    expect(mockState.stageAndValidateMediaIngress).toHaveBeenCalledWith({
      ...fileAttachment,
      mediaType: 'document',
    })
  })
})
