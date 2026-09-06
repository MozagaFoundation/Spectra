/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const secureState = vi.hoisted(() => ({
  data: new Map<string, string>(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: secureState.getItemAsync,
  setItemAsync: secureState.setItemAsync,
  deleteItemAsync: secureState.deleteItemAsync,
}))

describe('persisted sensitive data migrations', () => {
  beforeEach(() => {
    vi.resetModules()
    secureState.data.clear()
    secureState.getItemAsync.mockReset()
    secureState.setItemAsync.mockReset()
    secureState.deleteItemAsync.mockReset()
    secureState.getItemAsync.mockImplementation(async (key: string) => secureState.data.get(key) ?? null)
    secureState.setItemAsync.mockImplementation(async (key: string, value: string) => {
      secureState.data.set(key, value)
    })
    secureState.deleteItemAsync.mockImplementation(async (key: string) => {
      secureState.data.delete(key)
    })
  })

  it('uses a durable marker instead of rewriting every SecureStore key each startup', async () => {
    secureState.data.set('exo_has_wallet', 'true')
    const { hardenSensitiveSecureStoreAccessibility } = await import('./persistedSensitiveData')

    await hardenSensitiveSecureStoreAccessibility()
    const firstReadCount = secureState.getItemAsync.mock.calls.length
    expect(firstReadCount).toBeGreaterThan(1)
    expect(secureState.data.get('exo_sensitive_accessibility_hardened_v1')).toBe('true')

    secureState.getItemAsync.mockClear()
    secureState.setItemAsync.mockClear()
    await hardenSensitiveSecureStoreAccessibility()

    expect(secureState.getItemAsync).toHaveBeenCalledTimes(1)
    expect(secureState.setItemAsync).not.toHaveBeenCalled()
  })

  it('preserves only pending deletion and Tor settings during resumable cleanup', async () => {
    secureState.data.set('exo_vault', 'vault')
    secureState.data.set('spectra_pending_account_deletion_v1', 'operation')
    secureState.data.set('exo_vault_tor_enabled', 'true')
    const { clearPersistedSensitiveSecureStoreData } = await import('./persistedSensitiveData')

    await clearPersistedSensitiveSecureStoreData({
      preserveAccountDeletion: true,
      preserveTorSettings: true,
    })

    expect(secureState.data.get('exo_vault')).toBeUndefined()
    expect(secureState.data.get('spectra_pending_account_deletion_v1')).toBe('operation')
    expect(secureState.data.get('exo_vault_tor_enabled')).toBe('true')
  })
})
