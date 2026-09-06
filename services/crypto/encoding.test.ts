/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  isValidEntityId,
  normalizeEntityIdHex,
  writeEntityId,
} from './encoding'

describe('entity ID encoding', () => {
  it('normalizes supported entity ID prefixes into 32-byte hex', () => {
    expect(normalizeEntityIdHex('0xabc')).toBe(`${'0'.repeat(61)}abc`)
    expect(normalizeEntityIdHex('EXOabc')).toBe(`${'0'.repeat(61)}abc`)
    expect(normalizeEntityIdHex('EXIABC')).toBe(`${'0'.repeat(61)}abc`)
  })

  it('rejects malformed entity IDs before byte encoding', () => {
    expect(isValidEntityId('')).toBe(false)
    expect(isValidEntityId('not-a-market')).toBe(false)
    expect(isValidEntityId(`0x${'a'.repeat(65)}`)).toBe(false)
    expect(() => normalizeEntityIdHex('EXOzz')).toThrow('Entity ID must be hexadecimal')
  })

  it('writes only validated entity bytes', () => {
    expect(Array.from(writeEntityId('0x01')).slice(-1)).toEqual([1])
    expect(() => writeEntityId('0xzz')).toThrow('Entity ID must be hexadecimal')
  })
})
