/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { getAttachmentPreviewUri } from './mediaPreview'

describe('mediaPreview', () => {
  it('does not inline encrypted thumbnails unless a decrypted URI exists', () => {
    expect(getAttachmentPreviewUri({
      isEncrypted: true,
      mimeType: 'image/jpeg',
      thumbnail: 'abc',
    })).toBeNull()

    expect(getAttachmentPreviewUri({
      isEncrypted: true,
      mimeType: 'image/jpeg',
      thumbnail: 'abc',
      uri: 'file:///tmp/decrypted.jpg',
    })).toBe('file:///tmp/decrypted.jpg')
  })

  it('passes through local preview URI schemes and rejects remote schemes', () => {
    expect(getAttachmentPreviewUri({ uri: 'https://spectra.app/image.jpg' })).toBeNull()
    expect(getAttachmentPreviewUri({ uri: 'http://example.test/image.jpg' })).toBeNull()
    expect(getAttachmentPreviewUri({ uri: 'data:image/png;base64,abc' }))
      .toBe('data:image/png;base64,abc')
    expect(getAttachmentPreviewUri({ uri: 'content://media/image.jpg' }))
      .toBe('content://media/image.jpg')
    expect(getAttachmentPreviewUri({ uri: 'httpx://example.test/image.jpg' })).toBeNull()
    expect(getAttachmentPreviewUri({ uri: 'javascript:alert(1)' })).toBeNull()
  })

  it('wraps bounded inline base64 thumbnails with a MIME type', () => {
    expect(getAttachmentPreviewUri({
      mimeType: 'image/png',
      thumbnail: 'abc',
    })).toBe('data:image/png;base64,abc')

    expect(getAttachmentPreviewUri({ thumbnail: 'abc' })).toBe('data:image/jpeg;base64,abc')
    expect(getAttachmentPreviewUri({ thumbnail: 'x'.repeat(120_001) })).toBeNull()
  })
})
