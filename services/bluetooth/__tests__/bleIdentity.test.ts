/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  generateDilithiumKeyPair,
  type PublicKeyBundle,
} from '@spectra/core-crypto'
import { BLEIdentityContext } from '../identity/bleIdentity'

const mockState = vi.hoisted(() => ({
  asyncStorage: new Map<string, string>(),
  secureStore: new Map<string, string>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockState.asyncStorage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockState.asyncStorage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      mockState.asyncStorage.delete(key)
    }),
    getAllKeys: vi.fn(async () => [...mockState.asyncStorage.keys()]),
    multiRemove: vi.fn(async (keys: string[]) => {
      keys.forEach((key) => mockState.asyncStorage.delete(key))
    }),
  },
}))

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: vi.fn(async (length: number) => crypto.getRandomValues(
    new Uint8Array(length),
  )),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockState.secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockState.secureStore.set(key, value)
  }),
}))

describe('BLEIdentityContext', () => {
  beforeEach(() => {
    mockState.asyncStorage.clear()
    mockState.secureStore.clear()
  })

  it('binds the encrypted contact identity to the dedicated Noise static key', async () => {
    const aliceSigning = generateDilithiumKeyPair()
    const bobSigning = generateDilithiumKeyPair()
    const alice = await BLEIdentityContext.create({
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      identityId: 'alice-identity',
      identityPrivateKey: aliceSigning.privateKey,
      knownIdentities: [{
        identityId: 'bob-identity',
        bundle: { dilithiumKey: bobSigning.publicKey } as PublicKeyBundle,
      }],
      now: 1_000_000,
    })
    const bob = await BLEIdentityContext.create({
      walletScope: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      identityId: 'bob-identity',
      identityPrivateKey: bobSigning.privateKey,
      knownIdentities: [{
        identityId: 'alice-identity',
        bundle: { dilithiumKey: aliceSigning.publicKey } as PublicKeyBundle,
      }],
      now: 1_000_000,
    })

    expect(bob.credentialPayload.length).toBeGreaterThan(3_000)
    expect(bob.credentialPayload.length).toBeLessThanOrEqual(8 * 1024)
    expect(alice.verifyCredentialPayload(
      bob.credentialPayload,
      bob.staticKeyPair.publicKey,
      1_000_001,
    )).toEqual({
      identityId: 'bob-identity',
      knownContact: true,
    })
    expect(alice.verifyCredentialPayload(
      bob.credentialPayload,
      alice.staticKeyPair.publicKey,
      1_000_001,
    )).toBeNull()
  })

  it('rejects unknown identities and persists one wallet-scoped static key', async () => {
    const signing = generateDilithiumKeyPair()
    const options = {
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      identityId: 'alice-identity',
      identityPrivateKey: signing.privateKey,
      knownIdentities: [],
      now: 1_000_000,
    }
    const first = await BLEIdentityContext.create(options)
    const publicKey = first.staticKeyPair.publicKey.slice()
    const second = await BLEIdentityContext.create(options)

    expect(second.staticKeyPair.publicKey).toEqual(publicKey)
    expect(second.verifyCredentialPayload(
      second.credentialPayload,
      second.staticKeyPair.publicKey,
      1_000_001,
    )).toBeNull()
    expect([...mockState.asyncStorage.values()].join('')).not.toContain(
      Buffer.from(second.staticKeyPair.privateKey).toString('base64'),
    )
  })
})
