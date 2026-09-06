/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { isSafeExternalUrl } from '@/lib/externalLinks'
import { getAttachmentPreviewUri } from '@/lib/mediaPreview'

describe('ContactSharedMediaScreen helpers', () => {
  it('allows only http and https shared links to leave the app', () => {
    expect(isSafeExternalUrl('https://spectra.app')).toBe(true)
    expect(isSafeExternalUrl('http://example.test/path')).toBe(false)
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
  })

  it('hydrates safe preview URIs without inlining encrypted or oversized payloads', () => {
    expect(getAttachmentPreviewUri({
      isEncrypted: true,
      mimeType: 'image/jpeg',
      thumbnail: 'abc',
      uri: '',
    })).toBeNull()

    expect(getAttachmentPreviewUri({
      mimeType: 'image/jpeg',
      thumbnail: 'abc',
      uri: '',
    })).toBe('data:image/jpeg;base64,abc')

    expect(getAttachmentPreviewUri({
      mimeType: 'image/jpeg',
      thumbnail: 'x'.repeat(120_001),
      uri: '',
    })).toBeNull()
  })
})

