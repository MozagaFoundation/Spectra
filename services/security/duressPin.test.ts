/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  secureStore: new Map<string, string>(),
  deriveKeyAndHashAsync: vi.fn(async (pin: string) => ({
    pinHash: `hash:${pin}`,
    salt: `salt:${pin}`,
    iterations: 100000,
  })),
  verifyPinAsync: vi.fn(async (pin: string, storedHash: string, storedSalt: string) => (
    storedHash === `hash:${pin}` && storedSalt === `salt:${pin}`
  )),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockState.secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockState.secureStore.set(key, value)
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    mockState.secureStore.delete(key)
  }),
}))

vi.mock('@spectra/identity-vault', () => ({
  deriveKeyAndHashAsync: mockState.deriveKeyAndHashAsync,
  verifyPinAsync: mockState.verifyPinAsync,
}))

vi.mock('@/lib/constants', () => ({
  SECURE_STORE_OPTIONS: {},
  VAULT_SECURITY_KEYS: {
    DURESS_PIN: 'legacy_duress_pin',
    DURESS_PIN_HASH: 'duress_pin_hash',
    DURESS_PIN_SALT: 'duress_pin_salt',
    DURESS_PIN_KDF_ITERATIONS: 'duress_pin_kdf_iterations',
    DURESS_ENABLED: 'duress_enabled',
  },
}))

import {
  clearDuressPin,
  loadDuressPinState,
  saveDuressPin,
  setDuressProtectionEnabled,
  verifyDuressPin,
} from './duressPin'

describe('duressPin', () => {
  beforeEach(() => {
    mockState.secureStore.clear()
    mockState.deriveKeyAndHashAsync.mockClear()
    mockState.verifyPinAsync.mockClear()
  })

  it('stores the duress PIN as a hash and enables protection', async () => {
    await saveDuressPin('654321')

    expect(mockState.secureStore.get('duress_pin_hash')).toBe('hash:654321')
    expect(mockState.secureStore.get('duress_pin_salt')).toBe('salt:654321')
    expect(mockState.secureStore.get('duress_pin_kdf_iterations')).toBe('100000')
    expect(mockState.secureStore.get('duress_enabled')).toBe('true')
    expect(mockState.secureStore.has('legacy_duress_pin')).toBe(false)

    await expect(verifyDuressPin('654321')).resolves.toBe(true)
  })

  it('migrates a legacy plaintext duress PIN before reading state', async () => {
    mockState.secureStore.set('legacy_duress_pin', '123456')

    await expect(loadDuressPinState()).resolves.toEqual({
      enabled: true,
      hasDuressPin: true,
    })

    expect(mockState.secureStore.get('duress_pin_hash')).toBe('hash:123456')
    expect(mockState.secureStore.get('duress_pin_salt')).toBe('salt:123456')
    expect(mockState.secureStore.get('duress_pin_kdf_iterations')).toBe('100000')
    expect(mockState.secureStore.get('duress_enabled')).toBe('true')
    expect(mockState.secureStore.has('legacy_duress_pin')).toBe(false)
  })

  it('backfills missing iteration metadata for previously hashed duress PINs', async () => {
    mockState.secureStore.set('duress_pin_hash', 'hash:111111')
    mockState.secureStore.set('duress_pin_salt', 'salt:111111')
    mockState.secureStore.set('duress_enabled', 'true')

    await expect(loadDuressPinState()).resolves.toEqual({
      enabled: true,
      hasDuressPin: true,
    })

    expect(mockState.secureStore.get('duress_pin_kdf_iterations')).toBe('100000')
  })

  it('clears all persisted duress PIN material', async () => {
    await saveDuressPin('777777')
    await clearDuressPin()

    expect(mockState.secureStore.size).toBe(0)
  })

  it('can disable protection while preserving configured PIN material', async () => {
    await saveDuressPin('777777')
    await setDuressProtectionEnabled(false)

    await expect(loadDuressPinState()).resolves.toEqual({
      enabled: false,
      hasDuressPin: true,
    })
    await expect(verifyDuressPin('777777')).resolves.toBe(false)
    expect(mockState.secureStore.get('duress_pin_hash')).toBe('hash:777777')
  })

  it('throws when enabling protection without a configured duress PIN', async () => {
    await expect(setDuressProtectionEnabled(true))
      .rejects.toThrow('Duress PIN is not configured')
  })
})
