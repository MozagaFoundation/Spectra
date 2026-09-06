/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  storage: new Map<string, string>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getAllKeys: vi.fn(async () => [...mockState.storage.keys()]),
    getItem: vi.fn(async (key: string) => mockState.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockState.storage.set(key, value)
    }),
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const key of keys) {
        mockState.storage.delete(key)
      }
    }),
  },
}))

import {
  clearAllPendingCryptoTransactionStorage,
  recordPendingCryptoTransaction,
} from './pendingTransactions'

describe('pendingTransactions storage cleanup', () => {
  beforeEach(() => {
    mockState.storage.clear()
  })

  it('removes every pending transaction namespace', async () => {
    await recordPendingCryptoTransaction({
      network: 'ethereum',
      txHash: '0xabc',
      from: '0xfrom',
      to: '0xto',
      amount: '1',
      symbol: 'ETH',
      assetType: 'native',
    })
    await recordPendingCryptoTransaction({
      network: 'bitcoin',
      txHash: 'btc-hash',
      from: 'bc1from',
      to: 'bc1to',
      amount: '0.1',
      symbol: 'BTC',
      assetType: 'native',
    })

    expect(mockState.storage.size).toBeGreaterThan(0)
    await clearAllPendingCryptoTransactionStorage()
    expect(mockState.storage.size).toBe(0)
  })

  it('is a no-op when no pending transaction keys exist', async () => {
    await expect(clearAllPendingCryptoTransactionStorage()).resolves.toBeUndefined()
    expect(mockState.storage.size).toBe(0)
  })
})
