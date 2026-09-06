/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import { SECURE_STORE_OPTIONS, VAULT_SECURITY_KEYS } from '@/lib/constants'

export interface ReceiptPreferences {
  deliveryReceiptsEnabled: boolean
  readReceiptsEnabled: boolean
}

const DEFAULT_RECEIPT_PREFERENCES: ReceiptPreferences = {
  deliveryReceiptsEnabled: true,
  readReceiptsEnabled: true,
}

let cachedPreferences: ReceiptPreferences | null = null

export function getCachedReceiptPreferences(): ReceiptPreferences {
  return cachedPreferences ?? DEFAULT_RECEIPT_PREFERENCES
}

export function clearCachedReceiptPreferences(): void {
  cachedPreferences = null
}

export async function getReceiptPreferences(): Promise<ReceiptPreferences> {
  const [deliveryReceiptsValue, readReceiptsValue] = await Promise.all([
    SecureStore.getItemAsync(VAULT_SECURITY_KEYS.DELIVERY_RECEIPTS, SECURE_STORE_OPTIONS),
    SecureStore.getItemAsync(VAULT_SECURITY_KEYS.READ_RECEIPTS, SECURE_STORE_OPTIONS),
  ])

  const preferences: ReceiptPreferences = {
    deliveryReceiptsEnabled: deliveryReceiptsValue !== 'false',
    readReceiptsEnabled: readReceiptsValue !== 'false',
  }
  cachedPreferences = preferences
  return preferences
}

export async function setDeliveryReceiptsEnabled(enabled: boolean): Promise<void> {
  const current = cachedPreferences ?? await getReceiptPreferences()
  await SecureStore.setItemAsync(
    VAULT_SECURITY_KEYS.DELIVERY_RECEIPTS,
    String(enabled),
    SECURE_STORE_OPTIONS,
  )
  cachedPreferences = {
    ...current,
    deliveryReceiptsEnabled: enabled,
  }
}

export async function setReadReceiptsEnabled(enabled: boolean): Promise<void> {
  const current = cachedPreferences ?? await getReceiptPreferences()
  await SecureStore.setItemAsync(
    VAULT_SECURITY_KEYS.READ_RECEIPTS,
    String(enabled),
    SECURE_STORE_OPTIONS,
  )
  cachedPreferences = {
    ...current,
    readReceiptsEnabled: enabled,
  }
}
