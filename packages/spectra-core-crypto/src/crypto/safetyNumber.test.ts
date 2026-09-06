/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compareSafetyNumbers,
  generateSafetyNumber,
  generateSafetyNumberFromBundles,
  generateSafetyNumberFromBundlesAsync,
  verifyQRCode,
  verifyQRCodeFromBundles,
  __setNativeSafetyNumberModuleForTests,
} from './safetyNumber'
import { base64ToBytes, concatBytes, stringToBytes } from './utils'
import { sha256 } from '@noble/hashes/sha256'
import { makeIdentityPair, tamperBase64, tamperHex } from '../__tests__/helpers/cryptoTestHelpers'

afterEach(() => {
  __setNativeSafetyNumberModuleForTests(undefined)
})

describe('safety numbers', () => {
  it('are stable regardless of local/remote ordering', () => {
    const { alice, bob } = makeIdentityPair()

    const aliceView = generateSafetyNumberFromBundles(alice.bundle, bob.bundle)
    const bobView = generateSafetyNumberFromBundles(bob.bundle, alice.bundle)

    expect(compareSafetyNumbers(aliceView, bobView)).toBe(true)
  })

  it('changes when an X25519 identity key changes', () => {
    const { alice, bob } = makeIdentityPair()

    const original = generateSafetyNumberFromBundles(alice.bundle, bob.bundle)
    const changed = generateSafetyNumberFromBundles(
      { ...alice.bundle, identityKey: tamperBase64(alice.bundle.identityKey) },
      bob.bundle,
    )

    expect(compareSafetyNumbers(original, changed)).toBe(false)
  })

  it('changes when an ML-DSA-65 identity key changes', () => {
    const { alice, bob } = makeIdentityPair()

    const original = generateSafetyNumberFromBundles(alice.bundle, bob.bundle)
    const changed = generateSafetyNumberFromBundles(
      { ...alice.bundle, dilithiumKey: tamperHex(alice.bundle.dilithiumKey) },
      bob.bundle,
    )

    expect(compareSafetyNumbers(original, changed)).toBe(false)
  })

  it('changes when an ML-KEM identity key changes', () => {
    const { alice, bob } = makeIdentityPair()

    const original = generateSafetyNumberFromBundles(alice.bundle, bob.bundle)
    const changed = generateSafetyNumberFromBundles(
      { ...alice.bundle, mlkemIdentityKey: tamperBase64(alice.bundle.mlkemIdentityKey) },
      bob.bundle,
    )

    expect(compareSafetyNumbers(original, changed)).toBe(false)
  })

  it('verifies QR payloads and rejects substituted keys', () => {
    const { alice, bob } = makeIdentityPair()
    const safetyNumber = generateSafetyNumber(
      alice.bundle.identityKey,
      alice.bundle.identityId,
      bob.bundle.identityKey,
      bob.bundle.identityId,
    )

    expect(verifyQRCode(
      safetyNumber.qrData,
      alice.bundle.identityKey,
      alice.bundle.identityId,
      bob.bundle.identityKey,
      bob.bundle.identityId,
    )).toEqual({ valid: true })

    expect(verifyQRCode(
      safetyNumber.qrData,
      tamperBase64(alice.bundle.identityKey),
      alice.bundle.identityId,
      bob.bundle.identityKey,
      bob.bundle.identityId,
    ).valid).toBe(false)
  })

  it('verifies QR payloads against post-quantum bundle keys', () => {
    const { alice, bob } = makeIdentityPair()
    const safetyNumber = generateSafetyNumberFromBundles(alice.bundle, bob.bundle)

    expect(verifyQRCodeFromBundles(safetyNumber.qrData, alice.bundle, bob.bundle)).toEqual({ valid: true })
    expect(verifyQRCodeFromBundles(
      safetyNumber.qrData,
      { ...alice.bundle, mlkemIdentityKey: tamperBase64(alice.bundle.mlkemIdentityKey) },
      bob.bundle,
    ).valid).toBe(false)
  })

  it('matches the JS fingerprint when native KDF is used', async () => {
    const { alice, bob } = makeIdentityPair()
    const js = generateSafetyNumberFromBundles(alice.bundle, bob.bundle)
    const native = {
      deriveSafetyNumberFingerprint: vi.fn(async (keyMaterial: string, identityId: string, version: number) => {
        const material = base64ToBytes(keyMaterial)
        const identityIdBytes = stringToBytes(identityId)
        let hash = concatBytes(new Uint8Array([version]), material, identityIdBytes)
        for (let i = 0; i < 5200; i++) {
          hash = sha256(concatBytes(hash, material))
        }
        return Array.from(hash).map((byte) => byte.toString(16).padStart(2, '0')).join('')
      }),
    }
    __setNativeSafetyNumberModuleForTests(native)

    const nativeResult = await generateSafetyNumberFromBundlesAsync(alice.bundle, bob.bundle)
    expect(native.deriveSafetyNumberFingerprint).toHaveBeenCalled()
    expect(compareSafetyNumbers(js, nativeResult)).toBe(true)
  })

  it('fails closed when native KDF returns an invalid digest', async () => {
    const { alice, bob } = makeIdentityPair()
    __setNativeSafetyNumberModuleForTests({
      deriveSafetyNumberFingerprint: vi.fn(async () => 'not-a-digest'),
    })
    await expect(generateSafetyNumberFromBundlesAsync(alice.bundle, bob.bundle)).rejects.toThrow(/invalid digest/)
  })

  it('falls back to JS when the native KDF method is missing', async () => {
    const { alice, bob } = makeIdentityPair()
    const js = generateSafetyNumberFromBundles(alice.bundle, bob.bundle)
    __setNativeSafetyNumberModuleForTests(null)
    const fallback = await generateSafetyNumberFromBundlesAsync(alice.bundle, bob.bundle)
    expect(compareSafetyNumbers(js, fallback)).toBe(true)
  })
})
