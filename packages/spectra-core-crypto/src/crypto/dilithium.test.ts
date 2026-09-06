/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  benchmarkDilithiumVerify,
  createDilithiumVerifier,
  generateDilithiumKeyPair,
  isValidPublicKey,
  signWithDilithium,
  signWithDilithiumAsync,
  verifyDilithiumSignatureMeasured,
  verifyWithDilithiumVerifierMeasured,
  verifyDilithiumSignature,
  verifyDilithiumSignatureAsync,
  __setNativeMlDsaModuleForTests,
} from './dilithium'
import { stringToBytes, bytesToBase64, hexToBytes } from './utils'
import { tamperHex } from '../__tests__/helpers/cryptoTestHelpers'

afterEach(() => {
  __setNativeMlDsaModuleForTests(undefined)
})

describe('ML-DSA-65 signatures', () => {
  it('signs and verifies messages with real keys', () => {
    const keyPair = generateDilithiumKeyPair()
    const message = stringToBytes('message to sign')
    const signature = signWithDilithium(message, keyPair.privateKey)

    expect(verifyDilithiumSignature(message, signature, keyPair.publicKey)).toBe(true)
    expect(isValidPublicKey(keyPair.publicKey)).toBe(true)
  })

  it('rejects tampered messages, signatures, and public keys', () => {
    const keyPair = generateDilithiumKeyPair()
    const otherKeyPair = generateDilithiumKeyPair()
    const message = stringToBytes('message to sign')
    const signature = signWithDilithium(message, keyPair.privateKey)

    expect(verifyDilithiumSignature(stringToBytes('tampered'), signature, keyPair.publicKey)).toBe(false)
    expect(verifyDilithiumSignature(message, tamperHex(signature), keyPair.publicKey)).toBe(false)
    expect(verifyDilithiumSignature(message, signature, otherKeyPair.publicKey)).toBe(false)
  })

  it('rejects malformed key and signature sizes without noisy logs', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const keyPair = generateDilithiumKeyPair()

    expect(verifyDilithiumSignature(stringToBytes('msg'), '0x1234', keyPair.publicKey)).toBe(false)
    expect(isValidPublicKey('0x1234')).toBe(false)
    expect(consoleSpy).not.toHaveBeenCalled()

    consoleSpy.mockRestore()
  })

  it('verifies with a reusable public-key verifier', () => {
    const keyPair = generateDilithiumKeyPair()
    const message = stringToBytes('message to verify with reusable key')
    const signature = signWithDilithium(message, keyPair.privateKey)
    const verifier = createDilithiumVerifier(keyPair.publicKey)

    expect(verifier).toBeTruthy()
    expect(verifier?.(message, signature)).toBe(true)
    expect(verifier?.(stringToBytes('tampered'), signature)).toBe(false)
    expect(createDilithiumVerifier('0x1234')).toBeNull()
  })

  it('reports verification metrics', () => {
    const keyPair = generateDilithiumKeyPair()
    const message = stringToBytes('message to measure')
    const signature = signWithDilithium(message, keyPair.privateKey)
    const verifier = createDilithiumVerifier(keyPair.publicKey)

    expect(verifyDilithiumSignatureMeasured(message, signature, keyPair.publicKey)).toEqual(
      expect.objectContaining({ ok: true, source: 'js' }),
    )
    expect(verifier).toBeTruthy()
    expect(verifyWithDilithiumVerifierMeasured(verifier!, message, signature)).toEqual(
      expect.objectContaining({ ok: true, source: 'js_reused_public_key' }),
    )
  })

  it('offloads async verify through a native module without accepting native errors', async () => {
    const keyPair = generateDilithiumKeyPair()
    const message = stringToBytes('native verify')
    const signature = signWithDilithium(message, keyPair.privateKey)
    const native = {
      verify: vi.fn(async () => true),
    }
    __setNativeMlDsaModuleForTests(native)

    await expect(verifyDilithiumSignatureAsync(message, signature, keyPair.publicKey)).resolves.toBe(true)
    expect(native.verify).toHaveBeenCalled()

    native.verify.mockResolvedValueOnce(false)
    await expect(verifyDilithiumSignatureAsync(message, signature, keyPair.publicKey)).resolves.toBe(false)

    native.verify.mockRejectedValueOnce(new Error('bridge failed'))
    await expect(verifyDilithiumSignatureAsync(message, signature, keyPair.publicKey)).resolves.toBe(false)

    __setNativeMlDsaModuleForTests(null)
    await expect(verifyDilithiumSignatureAsync(message, signature, keyPair.publicKey)).resolves.toBe(true)
    await expect(
      verifyDilithiumSignatureAsync(stringToBytes('tampered'), signature, keyPair.publicKey),
    ).resolves.toBe(false)
  })

  it('offloads async sign through a native module without falling back after native errors', async () => {
    const keyPair = generateDilithiumKeyPair()
    const message = stringToBytes('native sign')
    const native = {
      verify: vi.fn(async () => true),
      sign: vi.fn(async () => bytesToBase64(hexToBytes(signWithDilithium(message, keyPair.privateKey)))),
    }
    __setNativeMlDsaModuleForTests(native)

    const signature = await signWithDilithiumAsync(message, keyPair.privateKey)
    expect(native.sign).toHaveBeenCalled()
    expect(verifyDilithiumSignature(message, signature, keyPair.publicKey)).toBe(true)

    native.sign.mockRejectedValueOnce(new Error('bridge failed'))
    await expect(signWithDilithiumAsync(message, keyPair.privateKey)).rejects.toThrow()

    native.sign.mockResolvedValueOnce('AAAA')
    await expect(signWithDilithiumAsync(message, keyPair.privateKey)).rejects.toThrow(/invalid signature/)

    __setNativeMlDsaModuleForTests(null)
    const jsSignature = await signWithDilithiumAsync(message, keyPair.privateKey)
    expect(verifyDilithiumSignature(message, jsSignature, keyPair.publicKey)).toBe(true)
  })

  it('benchmarks legacy and reused-key verification', () => {
    const result = benchmarkDilithiumVerify(2)

    expect(result.primitive).toBe('ml_dsa65_verify')
    expect(result.samples).toBe(2)
    expect(result.legacy.totalMs).toBeGreaterThanOrEqual(0)
    expect(result.reusedPublicKey.totalMs).toBeGreaterThanOrEqual(0)
  })
})
