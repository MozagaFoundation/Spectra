/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => {
  const values = new Map<string, string>()
  return {
    values,
    storage: {
      getItem: vi.fn(async (key: string) => values.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => { values.set(key, value) }),
      removeItem: vi.fn(async (key: string) => { values.delete(key) }),
      getAllKeys: vi.fn(async () => [...values.keys()]),
      multiRemove: vi.fn(async (keys: string[]) => { keys.forEach((key) => values.delete(key)) }),
    },
  }
})

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: mockState.storage,
}))

vi.mock('@/lib/accountScope', () => ({
  normalizeAccountStorageScope: (value?: string) => value?.toLowerCase() ?? null,
}))

vi.mock('./localCacheCrypto', () => ({
  buildLocalCacheAad: () => new Uint8Array(),
  sealLocalCacheText: async (_scope: string, _domain: string, text: string) => ({ text }),
  openLocalCacheText: async (_scope: string, _domain: string, cipher: { text: string }) => cipher.text,
}))

import {
  applyWalletIndexDeliveries,
  clearWalletIndexState,
  loadWalletIndexState,
  recordWalletIndexActivation,
  reconcileWalletIndexLeases,
} from './walletIndexStorage'

const wallet = 'EXO0000000000000000000000000000000000000000'
const address = `0x${'11'.repeat(20)}`
const activation = {
  chain: 'ethereum' as const,
  address,
  baselineHeight: 100,
  leaseGeneration: 1,
  activatedAt: 1_700_000_000_000,
  expiresAt: 1_800_000_000_000,
}
const eventId = `wie1.${'a'.repeat(32)}`

describe('walletIndexStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.values.clear()
    vi.setSystemTime(new Date(1_750_000_000_000))
  })

  it('persists an acknowledged delivery before it can be removed remotely', async () => {
    await recordWalletIndexActivation(wallet, activation)

    const result = await applyWalletIndexDeliveries(wallet, [{
      eventId,
      chain: 'ethereum',
      leaseGeneration: 1,
      kind: 'transaction',
      expiresAt: 1_800_000_000_000,
      payload: {
        chain: 'ethereum',
        address,
        leaseExpiresAt: 1_800_000_000_000,
        transaction: {
          txHash: `0x${'ab'.repeat(32)}`,
          occurredAt: 1_750_000_000_000,
          direction: 'inbound',
          status: 'confirmed',
          blockHeight: 101,
          nativeAmountAtomic: '1000000000000000000',
          nativeSymbol: 'ETH',
          feeAtomic: '0',
          counterpartyAddress: `0x${'22'.repeat(20)}`,
          tokenTransfers: [],
        },
      },
    }])

    expect(result.newTransactionCount).toBe(1)
    expect(result.state.transactions).toHaveLength(1)
    expect(result.state.unreadEventIdsByChain.ethereum).toEqual([eventId])
    await expect(loadWalletIndexState(wallet)).resolves.toMatchObject({
      transactions: [expect.objectContaining({ txHash: `0x${'ab'.repeat(32)}` })],
    })
  })

  it('keeps existing local history when an expired address is reactivated', async () => {
    await recordWalletIndexActivation(wallet, activation)
    await applyWalletIndexDeliveries(wallet, [{
      eventId,
      chain: 'ethereum',
      leaseGeneration: 1,
      kind: 'transaction',
      expiresAt: 1_800_000_000_000,
      payload: {
        chain: 'ethereum',
        address,
        leaseExpiresAt: 1_800_000_000_000,
        transaction: {
          txHash: `0x${'ab'.repeat(32)}`,
          occurredAt: 1_750_000_000_000,
          direction: 'inbound',
          status: 'confirmed',
          blockHeight: 101,
          nativeAmountAtomic: '1',
          nativeSymbol: 'ETH',
          feeAtomic: '0',
          counterpartyAddress: `0x${'22'.repeat(20)}`,
          tokenTransfers: [],
        },
      },
    }])

    await recordWalletIndexActivation(wallet, {
      ...activation,
      baselineHeight: 200,
      leaseGeneration: 2,
      activatedAt: 1_850_000_000_000,
      expiresAt: 1_950_000_000_000,
    })

    await expect(loadWalletIndexState(wallet)).resolves.toMatchObject({
      activations: [expect.objectContaining({ baselineHeight: 200 })],
      transactions: [expect.objectContaining({ txHash: `0x${'ab'.repeat(32)}` })],
    })
  })

  it('restores an expired local lease from the server-authoritative lease state', async () => {
    await recordWalletIndexActivation(wallet, {
      ...activation,
      expiresAt: 1_740_000_000_000,
    })

    const result = await reconcileWalletIndexLeases(wallet, [{
      chain: 'ethereum',
      address,
      leaseGeneration: 2,
      baselineHeight: 200,
      activatedAt: 1_750_000_000_000,
      expiresAt: 1_800_000_000_000,
    }])

    expect(result.changed).toBe(true)
    expect(result.state.activations[0]).toMatchObject({
      baselineHeight: 200,
      leaseGeneration: 2,
      expiresAt: 1_800_000_000_000,
    })
  })

  it('serializes concurrent activation and delivery writes', async () => {
    await recordWalletIndexActivation(wallet, activation)
    const bitcoinAddress = `bc1${'q'.repeat(38)}`

    await Promise.all([
      applyWalletIndexDeliveries(wallet, [{
        eventId,
        chain: 'ethereum',
        leaseGeneration: 1,
        kind: 'transaction',
        expiresAt: 1_800_000_000_000,
        payload: {
          chain: 'ethereum',
          address,
          leaseExpiresAt: 1_800_000_000_000,
          transaction: {
            txHash: `0x${'ab'.repeat(32)}`,
            occurredAt: 1_750_000_000_000,
            direction: 'inbound',
            status: 'confirmed',
            blockHeight: 101,
            nativeAmountAtomic: '1',
            nativeSymbol: 'ETH',
            feeAtomic: '0',
            counterpartyAddress: `0x${'22'.repeat(20)}`,
            tokenTransfers: [],
          },
        },
      }]),
      recordWalletIndexActivation(wallet, {
        chain: 'bitcoin',
        address: bitcoinAddress,
        baselineHeight: 1,
        leaseGeneration: 1,
        activatedAt: 1_750_000_000_000,
        expiresAt: 1_800_000_000_000,
      }),
    ])

    await expect(loadWalletIndexState(wallet)).resolves.toMatchObject({
      activations: expect.arrayContaining([
        expect.objectContaining({ chain: 'ethereum' }),
        expect.objectContaining({ chain: 'bitcoin', address: bitcoinAddress }),
      ]),
      transactions: [expect.objectContaining({ txHash: `0x${'ab'.repeat(32)}` })],
    })
  })

  it('acknowledges a stale delivery without restoring superseded activity', async () => {
    await recordWalletIndexActivation(wallet, {
      ...activation,
      leaseGeneration: 2,
      baselineHeight: 200,
    })

    const result = await applyWalletIndexDeliveries(wallet, [{
      eventId,
      chain: 'ethereum',
      leaseGeneration: 1,
      kind: 'transaction',
      expiresAt: 1_800_000_000_000,
      payload: {
        chain: 'ethereum',
        address,
        leaseExpiresAt: 1_800_000_000_000,
        transaction: {
          txHash: `0x${'cd'.repeat(32)}`,
          occurredAt: 1_750_000_000_000,
          direction: 'inbound',
          status: 'confirmed',
          blockHeight: 101,
          nativeAmountAtomic: '1',
          nativeSymbol: 'ETH',
          feeAtomic: '0',
          counterpartyAddress: `0x${'22'.repeat(20)}`,
          tokenTransfers: [],
        },
      },
    }])

    expect(result.newTransactionCount).toBe(0)
    expect(result.state.transactions).toEqual([])
    expect(result.state.appliedEvents).toEqual([{ eventId, expiresAt: 1_800_000_000_000 }])
  })

  it('removes every wallet index record during account-wide local cleanup', async () => {
    await recordWalletIndexActivation(wallet, activation)
    await clearWalletIndexState()

    await expect(loadWalletIndexState(wallet)).resolves.toMatchObject({
      activations: [],
      balances: [],
      transactions: [],
    })
  })
})
