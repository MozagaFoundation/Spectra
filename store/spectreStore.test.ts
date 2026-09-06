/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  secureStore: new Map<string, string>(),
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

vi.mock('@/lib/constants', () => ({
  SECURE_STORE_OPTIONS: {},
  STORAGE_KEYS: {
    SPECTRE_MODE: 'spectre_mode',
    SPECTRE_SNAPSHOT: 'spectre_snapshot',
    SPECTRE_WALLET_ID: 'spectre_wallet_id',
    SPECTRE_ACCOUNT_MODE: 'spectre_account_mode',
  },
}))

describe('spectreStore', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.secureStore.clear()
  })

  it('hydrates persisted Spectre flags and ignores invalid account modes', async () => {
    mockState.secureStore.set('spectre_mode', 'true')
    mockState.secureStore.set('spectre_wallet_id', 'wallet-spectre')
    mockState.secureStore.set('spectre_account_mode', 'legacy-mode')

    const { useSpectreStore } = await import('./spectreStore')
    await useSpectreStore.getState().initialize()

    expect(useSpectreStore.getState()).toEqual(expect.objectContaining({
      isLoaded: true,
      enabled: true,
      spectreWalletId: 'wallet-spectre',
      spectreAccountMode: null,
      themePreviewActive: false,
    }))
  })

  it('persists and clears enabled, wallet id, and account mode values', async () => {
    const { useSpectreStore } = await import('./spectreStore')

    await useSpectreStore.getState().setEnabled(true)
    await useSpectreStore.getState().setSpectreWalletId('wallet-spectre')
    await useSpectreStore.getState().setSpectreAccountMode('expendable')

    expect(mockState.secureStore.get('spectre_mode')).toBe('true')
    expect(mockState.secureStore.get('spectre_wallet_id')).toBe('wallet-spectre')
    expect(mockState.secureStore.get('spectre_account_mode')).toBe('expendable')

    await useSpectreStore.getState().setEnabled(false)
    await useSpectreStore.getState().setSpectreWalletId(null)
    await useSpectreStore.getState().setSpectreAccountMode(null)

    expect(mockState.secureStore.has('spectre_mode')).toBe(false)
    expect(mockState.secureStore.has('spectre_wallet_id')).toBe(false)
    expect(mockState.secureStore.has('spectre_account_mode')).toBe(false)
  })

  it('migrates version-one snapshots without weakening cache or duress protection', async () => {
    mockState.secureStore.set('spectre_snapshot', JSON.stringify({
      version: 1,
      activeWalletId: 'wallet-root',
      torEnabled: true,
      deliveryReceiptsEnabled: false,
      readReceiptsEnabled: true,
      screenshotProtectionEnabled: true,
      appSwitcherPrivacyEnabled: true,
      autoLockEnabled: true,
      autoLockTime: 'Immediately',
      failWipeEnabled: false,
      failWipeAttempts: '12',
      bluetoothEnabled: false,
      clearImageCacheOnLockEnabled: true,
      messageCachePrivacyMode: 'strict',
    }))

    const {
      readPersistedSpectreSnapshot,
      writePersistedSpectreSnapshot,
    } = await import('./spectreStore')

    await expect(readPersistedSpectreSnapshot()).resolves.toEqual(expect.objectContaining({
      version: 2,
      primaryWalletId: 'wallet-root',
      primaryWalletAddress: null,
      torEnabled: true,
      deliveryReceiptsEnabled: false,
      autoLockTime: 'Immediately',
      failWipeAttempts: '12',
      duressProtectionEnabled: true,
      clearImageCacheOnLockEnabled: true,
      messageCachePrivacyMode: 'strict',
      bluetoothOverrideEnabled: null,
    }))
    expect(JSON.parse(mockState.secureStore.get('spectre_snapshot') ?? '{}')).toEqual(
      expect.objectContaining({ version: 2 }),
    )

    await writePersistedSpectreSnapshot(null)
    expect(mockState.secureStore.has('spectre_snapshot')).toBe(false)
  })

  it('persists an explicit Bluetooth exit override in a version-two snapshot', async () => {
    mockState.secureStore.set('spectre_snapshot', JSON.stringify({
      version: 2,
      capturedAt: 100,
      generation: '100:wallet-root',
      primaryWalletId: 'wallet-root',
      primaryWalletAddress: 'EXOROOT',
      torEnabled: false,
      deliveryReceiptsEnabled: true,
      readReceiptsEnabled: true,
      screenshotProtectionEnabled: true,
      appSwitcherPrivacyEnabled: true,
      autoLockEnabled: true,
      autoLockTime: 'Immediately',
      failWipeEnabled: true,
      failWipeAttempts: '5',
      duressProtectionEnabled: false,
      bluetoothEnabled: false,
      bluetoothOverrideEnabled: null,
      clearImageCacheOnLockEnabled: false,
      messageCachePrivacyMode: 'standard',
    }))

    const {
      readPersistedSpectreSnapshot,
      setPersistedSpectreBluetoothOverride,
    } = await import('./spectreStore')
    await setPersistedSpectreBluetoothOverride(true)

    await expect(readPersistedSpectreSnapshot()).resolves.toEqual(expect.objectContaining({
      version: 2,
      bluetoothEnabled: false,
      bluetoothOverrideEnabled: true,
    }))
  })

  it('rejects unversioned persisted snapshots', async () => {
    mockState.secureStore.set('spectre_snapshot', JSON.stringify({
      activeWalletId: 'wallet-root',
      torEnabled: true,
    }))

    const { readPersistedSpectreSnapshot } = await import('./spectreStore')

    await expect(readPersistedSpectreSnapshot()).resolves.toBeNull()
  })

  it('handles corrupt snapshots and reset removes every persisted Spectre key', async () => {
    mockState.secureStore.set('spectre_mode', 'true')
    mockState.secureStore.set('spectre_snapshot', '{')
    mockState.secureStore.set('spectre_wallet_id', 'wallet-spectre')
    mockState.secureStore.set('spectre_account_mode', 'mnemonic')

    const { readPersistedSpectreSnapshot, useSpectreStore } = await import('./spectreStore')

    await expect(readPersistedSpectreSnapshot()).resolves.toBeNull()
    await useSpectreStore.getState().reset()

    expect(mockState.secureStore.size).toBe(0)
    expect(useSpectreStore.getState()).toEqual(expect.objectContaining({
      enabled: false,
      isApplying: false,
      themePreviewActive: false,
      spectreWalletId: null,
      spectreAccountMode: null,
    }))
  })
})
