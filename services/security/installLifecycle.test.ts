/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  getItem: vi.fn(async () => null as string | null),
  setItem: vi.fn(async () => {}),
  removeItem: vi.fn(async () => {}),
  hasPersistedSensitiveSecureStoreData: vi.fn(async () => false),
  hasPendingAccountDeletionOperation: vi.fn(async () => false),
  clearPersistedSensitiveSecureStoreData: vi.fn(async () => {}),
  hasAnyAccountStorageWallet: vi.fn(async () => false),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: mockState.getItem,
    setItem: mockState.setItem,
    removeItem: mockState.removeItem,
  },
}))

vi.mock('./persistedSensitiveData', () => ({
  hasPersistedSensitiveSecureStoreData: mockState.hasPersistedSensitiveSecureStoreData,
  hasPendingAccountDeletionOperation: mockState.hasPendingAccountDeletionOperation,
  clearPersistedSensitiveSecureStoreData: mockState.clearPersistedSensitiveSecureStoreData,
}))

vi.mock('./accountStorageRecovery', () => ({
  hasAnyAccountStorageWallet: mockState.hasAnyAccountStorageWallet,
}))

import { clearInstallSentinel, reconcileSecureStoreForCurrentInstall } from './installLifecycle'

describe('installLifecycle', () => {
  beforeEach(() => {
    mockState.getItem.mockReset()
    mockState.getItem.mockResolvedValue(null)
    mockState.setItem.mockClear()
    mockState.hasAnyAccountStorageWallet.mockReset()
    mockState.hasAnyAccountStorageWallet.mockResolvedValue(false)
    mockState.hasPersistedSensitiveSecureStoreData.mockReset()
    mockState.hasPersistedSensitiveSecureStoreData.mockResolvedValue(false)
    mockState.hasPendingAccountDeletionOperation.mockReset()
    mockState.hasPendingAccountDeletionOperation.mockResolvedValue(false)
    mockState.clearPersistedSensitiveSecureStoreData.mockClear()
    mockState.removeItem.mockClear()
  })

  it('clears the install sentinel key', async () => {
    await clearInstallSentinel()
    expect(mockState.removeItem).toHaveBeenCalledWith('spectra_install_sentinel_v1')
  })

  it('leaves SecureStore untouched when the install sentinel is present', async () => {
    mockState.getItem.mockResolvedValue('present')

    await expect(reconcileSecureStoreForCurrentInstall()).resolves.toEqual({
      status: 'current_install',
    })

    expect(mockState.hasPersistedSensitiveSecureStoreData).not.toHaveBeenCalled()
    expect(mockState.hasAnyAccountStorageWallet).not.toHaveBeenCalled()
    expect(mockState.clearPersistedSensitiveSecureStoreData).not.toHaveBeenCalled()
    expect(mockState.setItem).not.toHaveBeenCalled()
  })

  it('marks a fresh install when no old SecureStore data survived', async () => {
    await expect(reconcileSecureStoreForCurrentInstall()).resolves.toEqual({
      status: 'fresh_install',
    })

    expect(mockState.hasPersistedSensitiveSecureStoreData).toHaveBeenCalled()
    expect(mockState.clearPersistedSensitiveSecureStoreData).not.toHaveBeenCalled()
    expect(mockState.setItem).toHaveBeenCalledWith('spectra_install_sentinel_v1', 'present')
  })

  it('preserves surviving wallet data when the install sentinel is missing', async () => {
    mockState.hasAnyAccountStorageWallet.mockResolvedValue(true)
    mockState.hasPersistedSensitiveSecureStoreData.mockResolvedValue(true)

    await expect(reconcileSecureStoreForCurrentInstall()).resolves.toEqual({
      status: 'wallet_data_preserved',
    })

    expect(mockState.clearPersistedSensitiveSecureStoreData).not.toHaveBeenCalled()
    expect(mockState.hasPersistedSensitiveSecureStoreData).not.toHaveBeenCalled()
    expect(mockState.setItem).toHaveBeenCalledWith('spectra_install_sentinel_v1', 'present')
  })

  it('wipes surviving SecureStore data before marking a reinstall as reconciled', async () => {
    mockState.hasPersistedSensitiveSecureStoreData.mockResolvedValue(true)

    await expect(reconcileSecureStoreForCurrentInstall()).resolves.toEqual({
      status: 'secure_store_wiped_after_reinstall',
    })

    expect(mockState.clearPersistedSensitiveSecureStoreData).toHaveBeenCalled()
    expect(mockState.setItem).toHaveBeenCalledWith('spectra_install_sentinel_v1', 'present')
    expect(mockState.clearPersistedSensitiveSecureStoreData.mock.invocationCallOrder[0])
      .toBeLessThan(mockState.setItem.mock.invocationCallOrder[0])
  })

  it('preserves only deletion recovery and Tor state after an interrupted wipe', async () => {
    mockState.hasPendingAccountDeletionOperation.mockResolvedValue(true)
    mockState.hasPersistedSensitiveSecureStoreData.mockResolvedValue(true)

    await reconcileSecureStoreForCurrentInstall()

    expect(mockState.clearPersistedSensitiveSecureStoreData).toHaveBeenCalledWith({
      preserveAccountDeletion: true,
      preserveTorSettings: true,
    })
  })

  it('skips destructive cleanup if install-state storage cannot be read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockState.getItem.mockRejectedValue(new Error('storage unavailable'))

    await expect(reconcileSecureStoreForCurrentInstall()).resolves.toEqual({
      status: 'skipped',
      reason: 'storage_error',
    })

    expect(mockState.clearPersistedSensitiveSecureStoreData).not.toHaveBeenCalled()
    expect(mockState.setItem).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
