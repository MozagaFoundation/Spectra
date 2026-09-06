/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  loadPending: vi.fn(async () => []),
  loadMozaga: vi.fn(async () => ({ balance: '1', assets: [] })),
  loadEthereum: vi.fn(async () => ({ balance: '0', tokens: [] })),
  loadExternal: vi.fn(async () => ({ balances: {}, tokens: {} })),
  loadIndex: vi.fn(async () => ({
    version: 1,
    activations: [],
    balances: [],
    transactions: [],
    unreadEventIdsByChain: {},
    appliedEvents: [],
    remoteLeaseCheckAt: 0,
  })),
  syncDeliveries: vi.fn(async () => ({
    appliedEventIds: [] as string[],
    leaseStateChanged: false,
  })),
}))

vi.mock('react-native', async () => await import('../test/react-native'))

vi.mock('@react-navigation/native', async () => {
  const ReactActual = await import('react')
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      ReactActual.useEffect(() => {
        const cleanup = callback()
        return () => {
          if (typeof cleanup === 'function') cleanup()
        }
      }, [callback])
    },
  }
})

vi.mock('@/services/crypto/chainRegistry', () => ({
  getAvailableNetworks: () => ([
    { id: 'mozaga', name: 'Mozaga', shortName: 'Mozaga', nativeSymbol: 'EXO' },
  ]),
  getWalletAddressForNetwork: (wallet: { address: string }) => wallet.address,
}))

vi.mock('@/services/crypto/transactionHistory', () => ({
  mapLocalWalletIndexTransaction: (transaction: { network: string }) => transaction,
}))

vi.mock('@/services/crypto/pendingTransactions', () => ({
  loadPendingCryptoTransactions: mockState.loadPending,
  mergePendingCryptoTransactions: (indexed: unknown[], pending: unknown[]) => [...indexed, ...pending],
  pruneIndexedPendingCryptoTransactions: vi.fn(async () => {}),
}))

vi.mock('@/services/crypto/portfolioBalances', () => ({
  DEFAULT_ETH_PORTFOLIO_DATA: { balance: '0', tokens: [] },
  DEFAULT_EXTERNAL_PORTFOLIO_DATA: { balances: {}, tokens: {} },
  DEFAULT_MOZAGA_PORTFOLIO_DATA: { balance: '0', assets: [] },
  cryptoPortfolioWalletKey: (wallet: { address?: string } | null) => wallet?.address ?? 'none',
  loadEthereumPortfolioData: mockState.loadEthereum,
  loadExternalPortfolioData: mockState.loadExternal,
  loadMozagaPortfolioData: mockState.loadMozaga,
}))

vi.mock('@/services/storage/walletIndexStorage', () => ({
  loadWalletIndexState: mockState.loadIndex,
}))

vi.mock('@/services/wallet/walletIndexDelivery', () => ({
  syncWalletIndexDeliveries: mockState.syncDeliveries,
}))

const { act } = await import('@testing-library/react-native')
const { renderHook } = await import('../test/hookTestHarness')
const { useCryptoPortfolio } = await import('./useCryptoPortfolio')

const wallet = {
  address: 'EXO0000000000000000000000000000000000000000',
  spectreMode: false,
} as any

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

describe('useCryptoPortfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.loadPending.mockResolvedValue([])
  })

  it('syncs wallet-index on focus without stacking React Query refetch intervals', async () => {
    vi.useFakeTimers()
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    renderHook(() => useCryptoPortfolio(wallet), { wrapper: createWrapper() })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockState.syncDeliveries).toHaveBeenCalledWith(wallet)
    expect(intervalSpy.mock.calls.every((call) => (
      call[1] === 5_000 || call[1] === 30_000
    ))).toBe(true)
    expect(intervalSpy.mock.calls.some((call) => call[1] === 60_000)).toBe(false)

    intervalSpy.mockRestore()
    vi.useRealTimers()
  })
})
