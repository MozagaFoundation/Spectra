/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  secureStore: new Map<string, string>(),
  authenticateAsync: vi.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: true })),
}))

function scopedKey(
  key: string,
  options?: { keychainService?: string; requireAuthentication?: boolean }
) {
  const service = options?.keychainService ?? 'default-service'
  const auth = options?.requireAuthentication ? 'auth' : 'plain'
  return `${key}:${service}:${auth}`
}

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (
    key: string,
    options?: { keychainService?: string; requireAuthentication?: boolean }
  ) => (
    mockState.secureStore.get(scopedKey(key, options)) ?? null
  )),
  setItemAsync: vi.fn(async (
    key: string,
    value: string,
    options?: { keychainService?: string; requireAuthentication?: boolean }
  ) => {
    mockState.secureStore.set(scopedKey(key, options), value)
  }),
  deleteItemAsync: vi.fn(async (
    key: string,
    options?: { keychainService?: string; requireAuthentication?: boolean }
  ) => {
    mockState.secureStore.delete(scopedKey(key, options))
  }),
}))

vi.mock('expo-local-authentication', () => ({
  authenticateAsync: mockState.authenticateAsync,
}))

vi.mock('@spectra/identity-vault', () => ({
  bytesToBase64: vi.fn(() => 'encoded-key'),
}))

vi.mock('@/lib/constants', () => ({
  BIOMETRIC_SECURE_STORE_OPTIONS: {
    keychainService: 'biometric-service',
    requireAuthentication: true,
  },
  SECURE_STORE_OPTIONS: {
    keychainService: 'default-service',
  },
  STORAGE_KEYS: {
    BIOMETRIC_ENABLED: 'biometric_enabled',
  },
  VAULT_SECURITY_KEYS: {
    BIOMETRIC_PIN: 'biometric_pin',
  },
}))

import {
  clearBiometricUnlock,
  getBiometricUnlockState,
  readBiometricUnlockKey,
  readLegacyBiometricUnlockSecret,
  storeBiometricUnlockKey,
} from './biometricUnlock'
import * as SecureStore from 'expo-secure-store'

describe('biometricUnlock', () => {
  beforeEach(() => {
    mockState.secureStore.clear()
    vi.clearAllMocks()
    mockState.authenticateAsync.mockResolvedValue({ success: true })
  })

  it('stores the biometric key in protected storage and enables unlock', async () => {
    mockState.secureStore.set(scopedKey('biometric_pin', { keychainService: 'default-service' }), 'legacy-pin')
    mockState.secureStore.set(
      scopedKey('biometric_pin', {
        keychainService: 'default-service',
        requireAuthentication: true,
      }),
      'legacy-auth-key'
    )

    await storeBiometricUnlockKey(new Uint8Array([1, 2, 3]), 'Enable biometric unlock')

    expect(mockState.secureStore.get(
      scopedKey('biometric_pin', {
        keychainService: 'biometric-service',
        requireAuthentication: true,
      })
    )).toBe('encoded-key')
    expect(mockState.secureStore.get(
      scopedKey('biometric_enabled', {
        keychainService: 'default-service',
      })
    )).toBe('true')
    expect(mockState.secureStore.has(
      scopedKey('biometric_pin', {
        keychainService: 'default-service',
      })
    )).toBe(false)
    expect(mockState.secureStore.has(
      scopedKey('biometric_pin', {
        keychainService: 'default-service',
        requireAuthentication: true,
      })
    )).toBe(false)
  })

  it('reports biometric unlock as disabled when the preference is unset', async () => {
    await expect(getBiometricUnlockState()).resolves.toEqual({
      configured: false,
      enabled: false,
    })
  })

  it('reports biometric unlock as enabled when the preference is on', async () => {
    mockState.secureStore.set(
      scopedKey('biometric_enabled', {
        keychainService: 'default-service',
      }),
      'true'
    )

    await expect(getBiometricUnlockState()).resolves.toEqual({
      configured: true,
      enabled: true,
    })
  })

  it('reads the biometric key with protected storage and the provided prompt', async () => {
    mockState.secureStore.set(
      scopedKey('biometric_pin', {
        keychainService: 'biometric-service',
        requireAuthentication: true,
      }),
      'encoded-key'
    )

    await expect(readBiometricUnlockKey('Unlock Spectra')).resolves.toBe('encoded-key')

    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('biometric_pin', {
      keychainService: 'biometric-service',
      requireAuthentication: true,
      authenticationPrompt: 'Unlock Spectra',
    })
  })

  it('clears biometric state across protected and legacy storage', async () => {
    mockState.secureStore.set(
      scopedKey('biometric_pin', {
        keychainService: 'biometric-service',
        requireAuthentication: true,
      }),
      'encoded-key'
    )
    mockState.secureStore.set(scopedKey('biometric_pin', { keychainService: 'default-service' }), 'legacy-pin')
    mockState.secureStore.set(
      scopedKey('biometric_pin', {
        keychainService: 'default-service',
        requireAuthentication: true,
      }),
      'legacy-auth-key'
    )
    mockState.secureStore.set(
      scopedKey('biometric_enabled', {
        keychainService: 'default-service',
      }),
      'true'
    )

    await clearBiometricUnlock()

    expect(mockState.secureStore.has(
      scopedKey('biometric_pin', {
        keychainService: 'biometric-service',
        requireAuthentication: true,
      })
    )).toBe(false)
    expect(mockState.secureStore.has(
      scopedKey('biometric_pin', {
        keychainService: 'default-service',
      })
    )).toBe(false)
    expect(mockState.secureStore.has(
      scopedKey('biometric_pin', {
        keychainService: 'default-service',
        requireAuthentication: true,
      })
    )).toBe(false)
    expect(mockState.secureStore.get(
      scopedKey('biometric_enabled', {
        keychainService: 'default-service',
      })
    )).toBe('false')
  })

  it('requires OS authentication before reading legacy biometric material', async () => {
    mockState.secureStore.set(scopedKey('biometric_pin', { keychainService: 'default-service' }), 'legacy-pin')

    await expect(readLegacyBiometricUnlockSecret('Upgrade biometric unlock')).resolves.toBe('legacy-pin')

    expect(mockState.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Upgrade biometric unlock',
    })
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('biometric_pin', {
      keychainService: 'default-service',
    })
  })

  it('does not read the legacy biometric secret when OS authentication fails', async () => {
    mockState.secureStore.set(scopedKey('biometric_pin', { keychainService: 'default-service' }), 'legacy-pin')
    mockState.authenticateAsync.mockResolvedValueOnce({ success: false, error: 'user_cancel' })

    await expect(readLegacyBiometricUnlockSecret('Upgrade biometric unlock')).resolves.toBeNull()

    expect(mockState.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Upgrade biometric unlock',
    })
    expect(SecureStore.getItemAsync).not.toHaveBeenCalledWith('biometric_pin', {
      keychainService: 'default-service',
    })
  })
})
