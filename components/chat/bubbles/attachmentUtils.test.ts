/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bubbleMocks, resetBubbleMocks } from './testUtils'

describe('chat bubble attachment utilities', () => {
  let utilities: typeof import('./attachmentUtils')

  beforeEach(async () => {
    resetBubbleMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    utilities = await import('./attachmentUtils')
  })

  it('classifies image and PDF MIME types defensively', () => {
    expect(utilities.isImageMimeType('image/jpeg')).toBe(true)
    expect(utilities.isImageMimeType('IMAGE/PNG')).toBe(true)
    expect(utilities.isImageMimeType('application/pdf')).toBe(false)
    expect(utilities.isImageMimeType(null)).toBe(false)

    expect(utilities.isPdfMimeType('application/pdf')).toBe(true)
    expect(utilities.isPdfMimeType('APPLICATION/PDF')).toBe(true)
    expect(utilities.isPdfMimeType('application/pdf; charset=utf-8')).toBe(false)
    expect(utilities.isPdfMimeType(undefined)).toBe(false)
  })

  it('returns only trusted media URIs', () => {
    expect(utilities.getTrustedMediaUri('file:///cache/photo.jpg')).toBe('file:///cache/photo.jpg')
    expect(utilities.getTrustedMediaUri('https://trusted.example/media/photo.jpg')).toBeNull()
    expect(utilities.getTrustedMediaUri('https://evil.example/photo.jpg')).toBeNull()
    expect(utilities.getTrustedMediaUri('')).toBeNull()
  })

  it('shows success and permission alerts when saving images', async () => {
    await utilities.saveImageToGallery('file:///cache/photo.jpg')

    expect(bubbleMocks.saveImageToLibrary).toHaveBeenCalledWith('file:///cache/photo.jpg', {
      defaultExtension: 'jpg',
    })
    expect(bubbleMocks.alert.alert).toHaveBeenCalledWith('Saved', 'Image saved to your photo library.')

    bubbleMocks.saveImageToLibrary.mockRejectedValueOnce(
      new bubbleMocks.MediaExportError('permission_denied', 'denied'),
    )

    await utilities.saveImageToGallery('file:///cache/photo.jpg')

    expect(bubbleMocks.alert.alert).toHaveBeenCalledWith(
      'Permission needed',
      'Allow photo library access to save images.',
    )
  })

  it('handles share availability and unexpected export failures', async () => {
    await utilities.shareAttachment('file:///cache/photo.jpg', 'photo.jpg', 'image/jpeg')

    expect(bubbleMocks.shareAttachment).toHaveBeenCalledWith('file:///cache/photo.jpg', {
      dialogTitle: 'photo.jpg',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
    })

    bubbleMocks.shareAttachment.mockRejectedValueOnce(
      new bubbleMocks.MediaExportError('sharing_unavailable', 'unavailable'),
    )

    await utilities.shareAttachment('file:///cache/photo.jpg')

    expect(bubbleMocks.alert.alert).toHaveBeenCalledWith(
      'Unavailable',
      'Sharing is not available on this device.',
    )
  })
})
