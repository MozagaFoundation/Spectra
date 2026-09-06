/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  secureStore: new Map<string, string>(),
}))

function scopedKey(
  key: string,
  options?: { keychainService?: string }
) {
  return `${key}:${options?.keychainService ?? 'default'}`
}

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string, options?: { keychainService?: string }) => (
    mockState.secureStore.get(scopedKey(key, options)) ?? null
  )),
  setItemAsync: vi.fn(async (key: string, value: string, options?: { keychainService?: string }) => {
    mockState.secureStore.set(scopedKey(key, options), value)
  }),
}))

vi.mock('@/lib/constants', () => ({
  SECURE_STORE_OPTIONS: { keychainService: 'default' },
  VAULT_SECURITY_KEYS: {
    DELIVERY_RECEIPTS: 'delivery_receipts',
    READ_RECEIPTS: 'read_receipts',
  },
}))

describe('receiptPreferences', () => {
  beforeEach(() => {
    mockState.secureStore.clear()
    vi.resetModules()
  })

  it('defaults both delivery and read receipts to enabled', async () => {
    const { getReceiptPreferences, getCachedReceiptPreferences } = await import('./receiptPreferences')

    await expect(getReceiptPreferences()).resolves.toEqual({
      deliveryReceiptsEnabled: true,
      readReceiptsEnabled: true,
    })
    expect(getCachedReceiptPreferences()).toEqual({
      deliveryReceiptsEnabled: true,
      readReceiptsEnabled: true,
    })
  })

  it('persists changes and updates the cache', async () => {
    const {
      getReceiptPreferences,
      getCachedReceiptPreferences,
      setDeliveryReceiptsEnabled,
      setReadReceiptsEnabled,
    } = await import('./receiptPreferences')

    await setDeliveryReceiptsEnabled(false)
    await setReadReceiptsEnabled(false)

    const expectedPreferences = {
      deliveryReceiptsEnabled: false,
      readReceiptsEnabled: false,
    }

    expect(getCachedReceiptPreferences()).toEqual(expectedPreferences)
    await expect(getReceiptPreferences()).resolves.toEqual(expectedPreferences)
  })

  it('preserves the other cached preference when toggling one receipt type', async () => {
    const {
      getCachedReceiptPreferences,
      setDeliveryReceiptsEnabled,
      setReadReceiptsEnabled,
    } = await import('./receiptPreferences')

    await setReadReceiptsEnabled(false)
    await setDeliveryReceiptsEnabled(false)

    expect(getCachedReceiptPreferences()).toEqual({
      deliveryReceiptsEnabled: false,
      readReceiptsEnabled: false,
    })
  })
})
