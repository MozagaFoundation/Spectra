/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { decapsulate, decapsulateAsync, encapsulate, encapsulateAsync, generateMLKEMKeyPair, generateMLKEMKeyPairAsync, isValidMLKEMPublicKey, __setNativeMlKemModuleForTests } from './mlkem'
import { bytesToBase64 } from './utils'
import { tamperBase64 } from '../__tests__/helpers/cryptoTestHelpers'

afterEach(() => {
  __setNativeMlKemModuleForTests(undefined)
})

describe('ML-KEM-768 encapsulation', () => {
  it('round-trips encapsulated shared secrets', () => {
    const recipient = generateMLKEMKeyPair()
    const encapsulated = encapsulate(recipient.publicKey)
    const decapsulated = decapsulate(encapsulated.ciphertext, recipient.privateKey)

    expect(decapsulated).toEqual(encapsulated.sharedSecret)
    expect(decapsulated).toHaveLength(32)
  })

  it('validates public key length', () => {
    const keyPair = generateMLKEMKeyPair()

    expect(isValidMLKEMPublicKey(keyPair.publicKey)).toBe(true)
    expect(isValidMLKEMPublicKey(bytesToBase64(new Uint8Array(1183)))).toBe(false)
    expect(isValidMLKEMPublicKey(bytesToBase64(new Uint8Array(1185)))).toBe(false)
  })

  it('rejects malformed key and ciphertext sizes', () => {
    const recipient = generateMLKEMKeyPair()
    const encapsulated = encapsulate(recipient.publicKey)

    expect(() => encapsulate(bytesToBase64(new Uint8Array(10)))).toThrow()
    expect(() => decapsulate(bytesToBase64(new Uint8Array(10)), recipient.privateKey)).toThrow()
    expect(() => decapsulate(encapsulated.ciphertext, bytesToBase64(new Uint8Array(10)))).toThrow()
  })

  it('does not return the original shared secret for tampered ciphertext', () => {
    const recipient = generateMLKEMKeyPair()
    const encapsulated = encapsulate(recipient.publicKey)
    const decapsulated = decapsulate(tamperBase64(encapsulated.ciphertext), recipient.privateKey)

    expect(decapsulated).not.toEqual(encapsulated.sharedSecret)
  })

  it('offloads async encaps/decaps through a native module without falling back after native errors', async () => {
    const recipient = generateMLKEMKeyPair()
    const js = encapsulate(recipient.publicKey)
    const native = {
      encapsulate: vi.fn(async () => ({
        ciphertext: js.ciphertext,
        sharedSecret: bytesToBase64(js.sharedSecret),
      })),
      decapsulate: vi.fn(async () => bytesToBase64(js.sharedSecret)),
    }
    __setNativeMlKemModuleForTests(native)

    const encapsulated = await encapsulateAsync(recipient.publicKey)
    expect(native.encapsulate).toHaveBeenCalled()
    expect(encapsulated.ciphertext).toBe(js.ciphertext)
    expect(encapsulated.sharedSecret).toEqual(js.sharedSecret)

    const decapsulated = await decapsulateAsync(js.ciphertext, recipient.privateKey)
    expect(native.decapsulate).toHaveBeenCalled()
    expect(decapsulated).toEqual(js.sharedSecret)

    native.encapsulate.mockRejectedValueOnce(new Error('bridge failed'))
    await expect(encapsulateAsync(recipient.publicKey)).rejects.toThrow()

    native.decapsulate.mockRejectedValueOnce(new Error('bridge failed'))
    await expect(decapsulateAsync(js.ciphertext, recipient.privateKey)).rejects.toThrow()

    __setNativeMlKemModuleForTests(null)
    const jsRoundTrip = await encapsulateAsync(recipient.publicKey)
    await expect(decapsulateAsync(jsRoundTrip.ciphertext, recipient.privateKey)).resolves.toEqual(jsRoundTrip.sharedSecret)
  })

  it('offloads async keygen through a native module without falling back after native errors', async () => {
    const js = generateMLKEMKeyPair()
    const native = {
      encapsulate: vi.fn(),
      decapsulate: vi.fn(),
      generateKeyPair: vi.fn(async () => ({
        publicKey: js.publicKey,
        privateKey: js.privateKey,
      })),
    }
    __setNativeMlKemModuleForTests(native)

    const generated = await generateMLKEMKeyPairAsync()
    expect(native.generateKeyPair).toHaveBeenCalled()
    expect(generated.publicKey).toBe(js.publicKey)
    expect(generated.privateKey).toBe(js.privateKey)

    native.generateKeyPair.mockResolvedValueOnce({
      publicKey: bytesToBase64(new Uint8Array(10)),
      privateKey: js.privateKey,
    })
    await expect(generateMLKEMKeyPairAsync()).rejects.toThrow(/invalid sizes/)

    native.generateKeyPair.mockRejectedValueOnce(new Error('bridge failed'))
    await expect(generateMLKEMKeyPairAsync()).rejects.toThrow()

    __setNativeMlKemModuleForTests(null)
    const fallback = await generateMLKEMKeyPairAsync()
    expect(isValidMLKEMPublicKey(fallback.publicKey)).toBe(true)
  })
})
