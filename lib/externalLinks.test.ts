/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { isSafeExternalUrl } from './externalLinks'

describe('externalLinks', () => {
  it('allows only absolute HTTPS URLs without credentials', () => {
    expect(isSafeExternalUrl('https://spectra.app/help?topic=security')).toBe(true)
    expect(isSafeExternalUrl('http://example.test/path')).toBe(false)
    expect(isSafeExternalUrl('HTTPS://SPECTRA.APP')).toBe(true)
    expect(isSafeExternalUrl('https://user:password@spectra.app/help')).toBe(false)
    expect(isSafeExternalUrl(`https://spectra.app/${'a'.repeat(2048)}`)).toBe(false)

    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('data:text/html;base64,PHNjcmlwdD4=')).toBe(false)
    expect(isSafeExternalUrl('mailto:security@spectra.app')).toBe(false)
    expect(isSafeExternalUrl('/relative/path')).toBe(false)
    expect(isSafeExternalUrl('not a url')).toBe(false)
  })
})
