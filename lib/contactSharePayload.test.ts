/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  contactShareDisplayHandle,
  contactShareQrPayload,
  findableContactShareLink,
} from './contactSharePayload'

const ADDRESS = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

describe('contact share payload', () => {
  it('emits an HTTPS findable link only for listed non-Spectre wallets', () => {
    expect(findableContactShareLink(ADDRESS, false, 'findable'))
      .toBe(`https://spectraprotocol.org/u/${ADDRESS}`)
    expect(findableContactShareLink(ADDRESS, false, 'private')).toBeNull()
    expect(findableContactShareLink(ADDRESS, true, 'findable')).toBeNull()
  })

  it('prefers the findable link for QR payload', () => {
    expect(contactShareQrPayload('https://spectraprotocol.org/u/' + ADDRESS, 'spectra:contact:v1:x'))
      .toBe('https://spectraprotocol.org/u/' + ADDRESS)
    expect(contactShareQrPayload(null, 'spectra:contact:v1:x')).toBe('spectra:contact:v1:x')
  })

  it('uses a valid alias as the share handle and ignores freeform names', () => {
    expect(contactShareDisplayHandle('@alice🌟')).toBe('@alice🌟')
    expect(contactShareDisplayHandle('Alice')).toBeNull()
    expect(contactShareDisplayHandle('Alice Smith')).toBeNull()
  })
})
