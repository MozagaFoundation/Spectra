/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  bytesToBase64,
  bytesToHex,
  constantTimeBase64Equal,
  constantTimeEqual,
  createMessageHash,
  deriveStorageKey,
  hexToBytes,
  int32ToLittleEndianBytes,
  int64ToLittleEndianBytes,
  stringToBytes,
} from './utils'

describe('utility byte packing and message hashes', () => {
  it('encodes integer fields with explicit little-endian DataView semantics', () => {
    expect(Array.from(int32ToLittleEndianBytes(0x01020304))).toEqual([0x04, 0x03, 0x02, 0x01])
    expect(Array.from(int64ToLittleEndianBytes(0x0102030405060708n))).toEqual([
      0x08,
      0x07,
      0x06,
      0x05,
      0x04,
      0x03,
      0x02,
      0x01,
    ])
  })

  it('has a golden vector for message hash byte layout', () => {
    expect(createMessageHash(
      'alice',
      'bob',
      'session',
      7,
      1_717_171_717_000,
      bytesToBase64(stringToBytes('cipher')),
      bytesToBase64(stringToBytes('prev')),
    )).toBe('ZkA24nu0VYUxeMYo/37RLM0kqajun5P9idDyAj0h7+Y=')
  })

  it('rejects malformed hex input', () => {
    expect(() => hexToBytes('0xzz')).toThrow()
    expect(() => hexToBytes('abc')).toThrow()
  })
})

describe('storage KDF and constant-time comparisons', () => {
  it('matches PBKDF2-HMAC-SHA256 golden vectors', () => {
    expect(bytesToHex(deriveStorageKey('password', stringToBytes('salt'), 1)).slice(2)).toBe(
      '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b',
    )
    expect(bytesToHex(deriveStorageKey('password', stringToBytes('salt'), 2)).slice(2)).toBe(
      'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43',
    )
  })

  it('rejects invalid KDF iteration counts', () => {
    expect(() => deriveStorageKey('password', stringToBytes('salt'), 0)).toThrow()
    expect(() => deriveStorageKey('password', stringToBytes('salt'), 1.5)).toThrow()
  })

  it('compares byte and base64 values without early exit semantics', () => {
    const a = new Uint8Array([1, 2, 3, 4])
    const b = new Uint8Array([1, 2, 3, 4])
    const c = new Uint8Array([1, 2, 3, 5])
    const d = new Uint8Array([1, 2, 3])

    expect(constantTimeEqual(a, b)).toBe(true)
    expect(constantTimeEqual(a, c)).toBe(false)
    expect(constantTimeEqual(a, d)).toBe(false)
    expect(constantTimeBase64Equal(bytesToBase64(a), bytesToBase64(b))).toBe(true)
    expect(constantTimeBase64Equal(bytesToBase64(a), bytesToBase64(c))).toBe(false)
    expect(constantTimeBase64Equal(bytesToBase64(a), bytesToBase64(d))).toBe(false)
  })
})
