/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  base58CheckDecode,
  base58Decode,
  base58Encode,
  decodeSegwitAddress,
} from './baseEncoding'

const BECH32_ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

function bech32Polymod(values: number[]): number {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const value of values) {
    const top = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ value
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) chk ^= generators[i]
    }
  }
  return chk
}

function bech32HrpExpand(hrp: string): number[] {
  return [
    ...Array.from(hrp, (char) => char.charCodeAt(0) >> 5),
    0,
    ...Array.from(hrp, (char) => char.charCodeAt(0) & 31),
  ]
}

function bech32EncodeForTest(hrp: string, data: number[]): string {
  const polymod = bech32Polymod([...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1
  const checksum = Array.from({ length: 6 }, (_, index) => (polymod >> (5 * (5 - index))) & 31)
  return `${hrp}1${[...data, ...checksum].map((value) => BECH32_ALPHABET[value]).join('')}`
}

describe('base encoding helpers', () => {
  it('round-trips Base58 payloads and preserves leading zero bytes', () => {
    const payload = Uint8Array.from([0, 0, 1, 2, 3, 253, 254, 255])
    const encoded = base58Encode(payload)

    expect(encoded).toBe('11W7N4RuG')
    expect(Array.from(base58Decode(encoded))).toEqual(Array.from(payload))
  })

  it('rejects invalid Base58 characters and overlong input before BigInt work', () => {
    expect(() => base58Decode('0')).toThrow('Invalid base58 character')
    expect(() => base58Decode('1'.repeat(513))).toThrow('Base58 value is too long')
  })

  it('decodes Base58Check payloads and rejects checksum tampering', () => {
    expect(Array.from(base58CheckDecode('BscwPTeiqQM'))).toEqual([0x41, 1, 2, 3])
    expect(() => base58CheckDecode('BscwPTeiqQN')).toThrow('Invalid base58check checksum')
  })

  it('decodes native SegWit addresses exactly', () => {
    const decoded = decodeSegwitAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')

    expect(decoded.hrp).toBe('bc')
    expect(decoded.witnessVersion).toBe(0)
    expect(Array.from(decoded.witnessProgram)).toEqual([
      0xc0, 0xce, 0xbc, 0xd6, 0xc3, 0xd3, 0xca, 0x8c, 0x75, 0xdc,
      0x5e, 0xc6, 0x2e, 0xbe, 0x55, 0x33, 0x0e, 0xf9, 0x10, 0xe2,
    ])
  })

  it('rejects malformed Bech32 strings before callers accept Bitcoin addresses', () => {
    expect(() => decodeSegwitAddress('bc1Qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')).toThrow('Mixed-case bech32 string')
    expect(() => decodeSegwitAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyq')).toThrow('Invalid bech32 checksum')
    expect(() => decodeSegwitAddress(`bc1${'q'.repeat(100)}`)).toThrow('Invalid bech32 string')
  })

  it('rejects valid-checksum SegWit payloads with invalid 5-bit padding', () => {
    const invalidPaddingAddress = bech32EncodeForTest('bc', [0, 31])

    expect(() => decodeSegwitAddress(invalidPaddingAddress)).toThrow('Invalid bech32 padding')
  })
})
