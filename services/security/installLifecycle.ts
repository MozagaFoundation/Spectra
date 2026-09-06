/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'

import {
  clearPersistedSensitiveSecureStoreData,
  hasPendingAccountDeletionOperation,
  hasPersistedSensitiveSecureStoreData,
} from './persistedSensitiveData'
import { hasAnyAccountStorageWallet } from './accountStorageRecovery'

const INSTALL_SENTINEL_KEY = 'spectra_install_sentinel_v1'
const INSTALL_SENTINEL_VALUE = 'present'

export async function clearInstallSentinel(): Promise<void> {
  await getAppKeyValueStorage().removeItem(INSTALL_SENTINEL_KEY)
}

export type InstallReconciliationResult =
  | { status: 'current_install' }
  | { status: 'fresh_install' }
  | { status: 'wallet_data_preserved' }
  | { status: 'secure_store_wiped_after_reinstall' }
  | { status: 'skipped'; reason: 'storage_error' }

export async function reconcileSecureStoreForCurrentInstall(): Promise<InstallReconciliationResult> {
  try {
    const sentinel = await getAppKeyValueStorage().getItem(INSTALL_SENTINEL_KEY)
    if (sentinel === INSTALL_SENTINEL_VALUE) {
      return { status: 'current_install' }
    }

    const hasSurvivingWalletData = await hasAnyAccountStorageWallet()
    if (hasSurvivingWalletData) {
      await getAppKeyValueStorage().setItem(INSTALL_SENTINEL_KEY, INSTALL_SENTINEL_VALUE)
      return { status: 'wallet_data_preserved' }
    }

    const hasPendingDeletion = await hasPendingAccountDeletionOperation()
    const hasSurvivingSecureStoreData = await hasPersistedSensitiveSecureStoreData()
    if (hasSurvivingSecureStoreData) {
      await clearPersistedSensitiveSecureStoreData({
        preserveAccountDeletion: hasPendingDeletion,
        preserveTorSettings: hasPendingDeletion,
      })
      await getAppKeyValueStorage().setItem(INSTALL_SENTINEL_KEY, INSTALL_SENTINEL_VALUE)
      return { status: 'secure_store_wiped_after_reinstall' }
    }

    await getAppKeyValueStorage().setItem(INSTALL_SENTINEL_KEY, INSTALL_SENTINEL_VALUE)
    return { status: 'fresh_install' }
  } catch (error) {
    console.warn('[InstallLifecycle] SecureStore reinstall reconciliation skipped:', error)
    return { status: 'skipped', reason: 'storage_error' }
  }
}
