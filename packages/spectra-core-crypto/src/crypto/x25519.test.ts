/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { deriveX25519PublicKey, generateX25519KeyPair, isValidX25519PublicKey, x25519DH } from './x25519'
import { bytesToBase64, hexToBytes } from './utils'

describe('X25519 key exchange', () => {
  it('generates key pairs that derive matching shared secrets', () => {
    const alice = generateX25519KeyPair()
    const bob = generateX25519KeyPair()

    const aliceSecret = x25519DH(alice.privateKey, bob.publicKey)
    const bobSecret = x25519DH(bob.privateKey, alice.publicKey)

    expect(aliceSecret).toEqual(bobSecret)
    expect(aliceSecret).toHaveLength(32)
  })

  it('derives a public key from an existing private key', () => {
    const alice = generateX25519KeyPair()

    expect(deriveX25519PublicKey(alice.privateKey)).toBe(alice.publicKey)
  })

  it('rejects invalid public and private key lengths', () => {
    const alice = generateX25519KeyPair()
    const shortKey = bytesToBase64(new Uint8Array(31))
    const longKey = bytesToBase64(new Uint8Array(33))

    expect(isValidX25519PublicKey(shortKey)).toBe(false)
    expect(isValidX25519PublicKey(longKey)).toBe(false)
    expect(() => x25519DH(shortKey, alice.publicKey)).toThrow()
    expect(() => x25519DH(alice.privateKey, shortKey)).toThrow()
    expect(() => deriveX25519PublicKey(shortKey)).toThrow()
  })

  it('rejects the all-zero public key', () => {
    expect(isValidX25519PublicKey(bytesToBase64(new Uint8Array(32)))).toBe(false)
  })

  it('rejects known low-order public keys during validation', () => {
    const lowOrderU1 = new Uint8Array(32)
    lowOrderU1[0] = 1

    expect(isValidX25519PublicKey(bytesToBase64(lowOrderU1))).toBe(false)
    expect(() => x25519DH(generateX25519KeyPair().privateKey, bytesToBase64(lowOrderU1))).toThrow()
    expect(isValidX25519PublicKey(bytesToBase64(hexToBytes(
      'e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800',
    )))).toBe(false)
  })
})
