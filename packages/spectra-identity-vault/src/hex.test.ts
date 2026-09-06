/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { bytesToHex, generateId, hexToBytes } from './hex'

describe('hex utilities', () => {
  it('round-trips bytes with optional 0x prefixes', () => {
    const bytes = Uint8Array.from([0, 1, 15, 16, 254, 255])
    const hex = bytesToHex(bytes)

    expect(hex).toBe('00010f10feff')
    expect(Array.from(hexToBytes(hex))).toEqual(Array.from(bytes))
    expect(Array.from(hexToBytes(`0x${hex}`))).toEqual(Array.from(bytes))
  })

  it('rejects malformed hex instead of silently coercing bytes', () => {
    expect(() => hexToBytes('abc')).toThrow('Invalid hex string length')
    expect(() => hexToBytes('zz')).toThrow('Invalid hex string')
    expect(() => hexToBytes('0x00gg')).toThrow('Invalid hex string')
  })

  it('generates opaque CSPRNG-backed wallet IDs', () => {
    const first = generateId()
    const second = generateId()

    expect(first).toMatch(/^wallet_[0-9a-f]{32}$/)
    expect(second).toMatch(/^wallet_[0-9a-f]{32}$/)
    expect(second).not.toBe(first)
  })
})
