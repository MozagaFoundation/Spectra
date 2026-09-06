/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import { SECURE_STORE_OPTIONS, STORAGE_KEYS } from '@/lib/constants'

const PENDING_SPECTRE_REMOTE_ACTIVATION_KEY = STORAGE_KEYS.PENDING_SPECTRE_REMOTE_ACTIVATION

export async function readPendingRemoteActivationWalletAddress(): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(
    PENDING_SPECTRE_REMOTE_ACTIVATION_KEY,
    SECURE_STORE_OPTIONS,
  )
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

export async function writePendingRemoteActivationWalletAddress(walletAddress: string | null): Promise<void> {
  if (!walletAddress) {
    await SecureStore.deleteItemAsync(
      PENDING_SPECTRE_REMOTE_ACTIVATION_KEY,
      SECURE_STORE_OPTIONS,
    )
    return
  }

  await SecureStore.setItemAsync(
    PENDING_SPECTRE_REMOTE_ACTIVATION_KEY,
    walletAddress,
    SECURE_STORE_OPTIONS,
  )
}
