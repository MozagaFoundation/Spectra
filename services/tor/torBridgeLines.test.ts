/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { normalizeTorBridgeLines } from './torBridgeLines'

describe('normalizeTorBridgeLines', () => {
  it('trims bridge lines and removes empty entries', () => {
    expect(normalizeTorBridgeLines([
      '  obfs4 192.0.2.1:443 cert=abc iat-mode=0  ',
      '',
      '   ',
    ])).toEqual(['obfs4 192.0.2.1:443 cert=abc iat-mode=0'])
  })

  it('rejects control characters that could create extra torrc directives', () => {
    expect(() => normalizeTorBridgeLines([
      'obfs4 192.0.2.1:443 cert=abc\nSocksPort 0',
    ])).toThrow('unsupported control characters')
    expect(() => normalizeTorBridgeLines([
      'obfs4 192.0.2.1:443 cert=abc\u0000iat-mode=0',
    ])).toThrow('unsupported control characters')
  })
})
