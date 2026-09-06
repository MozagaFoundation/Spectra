/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  base58CheckEncode,
  base58Encode,
  bech32Encode,
  encodeSegwitAddress,
} from './baseEncoding'

describe('base encodings', () => {
  it('encodes Base58 and preserves leading zero bytes', () => {
    const payload = Uint8Array.from([0, 0, 1, 2, 3, 253, 254, 255])
    const encoded = base58Encode(payload)

    expect(encoded.startsWith('11')).toBe(true)
    expect(encoded).toBe('11W7N4RuG')
  })

  it('encodes Base58Check payloads', () => {
    const payload = Uint8Array.from([0x41, 1, 2, 3])
    const encoded = base58CheckEncode(payload)

    expect(encoded).toBe('BscwPTeiqQM')
  })

  it('encodes Bech32 and SegWit addresses', () => {
    const data = [0, 14, 20, 15, 7, 13]
    const encoded = bech32Encode('bc', data)
    const witnessProgram = Uint8Array.from([
      0xc0, 0xce, 0xbc, 0xd6, 0xc3, 0xd3, 0xca, 0x8c, 0x75, 0xdc,
      0x5e, 0xc6, 0x2e, 0xbe, 0x55, 0x33, 0x0e, 0xf9, 0x10, 0xe2,
    ])
    const segwit = encodeSegwitAddress('bc', 0, witnessProgram)

    expect(encoded).toBe('bc1qw508dkdcy27')
    expect(segwit).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')
  })

  it('rejects invalid SegWit witness versions', () => {
    expect(() => encodeSegwitAddress('bc', 17, new Uint8Array(20)))
      .toThrow('Invalid witness version')
  })
})
