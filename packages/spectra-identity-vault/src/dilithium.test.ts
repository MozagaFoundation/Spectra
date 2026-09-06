/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { Dilithium, bytesToHex, hexToBytes } from './dilithium'

const seed = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index))
const message = new TextEncoder().encode('identity-vault audit vector')

describe('ML-DSA-65 Dilithium wrapper', () => {
  it('derives deterministic key material and EXO addresses from a 32-byte seed', async () => {
    const dilithium = await Dilithium.init()
    const first = dilithium.generateKeyPairFromSeed(seed)
    const second = dilithium.generateKeyPairFromSeed(seed)

    expect(first.publicKey).toHaveLength(1952)
    expect(first.privateKey).toHaveLength(4032)
    expect(Array.from(second.publicKey)).toEqual(Array.from(first.publicKey))
    expect(Array.from(second.privateKey)).toEqual(Array.from(first.privateKey))
    expect(dilithium.deriveAddress(first.publicKey)).toMatch(/^EXO00[0-9a-f]{38}$/)
  })

  it('signs and verifies messages, and rejects modified messages', async () => {
    const dilithium = await Dilithium.init()
    const keyPair = dilithium.generateKeyPairFromSeed(seed)
    const signature = dilithium.sign(message, keyPair.privateKey)

    expect(signature).toHaveLength(3309)
    expect(dilithium.verify(message, signature, keyPair.publicKey)).toBe(true)
    expect(dilithium.verify(new TextEncoder().encode('modified'), signature, keyPair.publicKey))
      .toBe(false)
  })

  it('validates key and signature sizes before cryptographic operations', async () => {
    const dilithium = await Dilithium.init()
    const keyPair = dilithium.generateKeyPairFromSeed(seed)
    const signature = dilithium.sign(message, keyPair.privateKey)

    expect(() => dilithium.generateKeyPairFromSeed(seed.slice(0, 31)))
      .toThrow('Seed must be exactly 32 bytes')
    expect(() => dilithium.sign(message, keyPair.privateKey.slice(0, 32)))
      .toThrow('Private key must be 4032 bytes')
    expect(() => dilithium.verify(message, signature.slice(0, 32), keyPair.publicKey))
      .toThrow('Signature must be 3309 bytes')
    expect(() => dilithium.verify(message, signature, keyPair.publicKey.slice(0, 32)))
      .toThrow('Public key must be 1952 bytes')
  })

  it('round-trips valid hex and rejects malformed hex', () => {
    const bytes = Uint8Array.from([1, 2, 171, 205])
    const hex = bytesToHex(bytes)

    expect(hex).toBe('0x0102abcd')
    expect(Array.from(hexToBytes(hex))).toEqual(Array.from(bytes))
    expect(() => hexToBytes('0xzz')).toThrow('Invalid hex string')
  })
})
