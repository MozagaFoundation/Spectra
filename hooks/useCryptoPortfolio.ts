/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { InteractionManager } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import type { EXOWallet } from '@spectra/identity-vault'
import {
  getAvailableNetworks,
  getWalletAddressForNetwork,
  type CryptoNetworkId,
} from '@/services/crypto/chainRegistry'
import {
  mapLocalWalletIndexTransaction,
  type TxHistoryItem,
} from '@/services/crypto/transactionHistory'
import {
  loadPendingCryptoTransactions,
  mergePendingCryptoTransactions,
  pruneIndexedPendingCryptoTransactions,
  type PendingCryptoTransaction,
} from '@/services/crypto/pendingTransactions'
import {
  DEFAULT_ETH_PORTFOLIO_DATA,
  DEFAULT_EXTERNAL_PORTFOLIO_DATA,
  DEFAULT_MOZAGA_PORTFOLIO_DATA,
  cryptoPortfolioWalletKey,
  loadEthereumPortfolioData,
  loadExternalPortfolioData,
  loadMozagaPortfolioData,
  type EthPortfolioData,
  type ExternalPortfolioData,
  type NetworkBalances,
} from '@/services/crypto/portfolioBalances'
import {
  loadWalletIndexState,
  type WalletIndexLocalState,
} from '@/services/storage/walletIndexStorage'
import { syncWalletIndexDeliveries } from '@/services/wallet/walletIndexDelivery'

interface TransactionPortfolioData {
  mozaga: TxHistoryItem[]
  ethereum: TxHistoryItem[]
  external: Partial<Record<CryptoNetworkId, TxHistoryItem[]>>
  errors: Partial<Record<CryptoNetworkId, string>>
}

type PendingTransactionsByNetwork = Partial<Record<CryptoNetworkId, PendingCryptoTransaction[]>>

export interface PortfolioNetworkRow {
  id: CryptoNetworkId
  name: string
  shortName: string
  nativeSymbol: string
  balance: string
  tokenCount: number
  recentTxCount: number
}

const DEFAULT_TX_DATA: TransactionPortfolioData = { mozaga: [], ethereum: [], external: {}, errors: {} }
const FOCUSED_PORTFOLIO_REFRESH_MS = 30_000
const PENDING_PORTFOLIO_REFRESH_MS = 5_000

interface LocalWalletIndexStatus {
  chain: CryptoNetworkId
  address: string
  is_registered: boolean
  is_owned: boolean
  transaction_count: number
  latest_transaction_at: string | null
  latest_run_status: string | null
  latest_run_error: string | null
  is_sync_complete: boolean
}

function transactionDataFromLocalState(state: WalletIndexLocalState): TransactionPortfolioData {
  const transactions = state.transactions.map(mapLocalWalletIndexTransaction)
  return {
    mozaga: transactions.filter((transaction) => transaction.network === 'mozaga'),
    ethereum: transactions.filter((transaction) => transaction.network === 'ethereum'),
    external: {
      bitcoin: transactions.filter((transaction) => transaction.network === 'bitcoin'),
      solana: transactions.filter((transaction) => transaction.network === 'solana'),
      tron: transactions.filter((transaction) => transaction.network === 'tron'),
    },
    errors: {},
  }
}

export function useCryptoPortfolio(wallet: EXOWallet | null) {
  const [focusedWorkEnabled, setFocusedWorkEnabled] = useState(false)
  const [isManualRefreshing, setIsManualRefreshing] = useState(false)
  const walletKey = useMemo(() => cryptoPortfolioWalletKey(wallet), [wallet])
  const availableNetworks = useMemo(() => getAvailableNetworks(wallet), [wallet])
  const ethereumAddress = useMemo(
    () => wallet ? getWalletAddressForNetwork(wallet, 'ethereum') : undefined,
    [wallet],
  )
  const externalNetworks = useMemo(
    () => availableNetworks.filter((network) => network.id !== 'mozaga' && network.id !== 'ethereum'),
    [availableNetworks],
  )
  const externalAddressKey = useMemo(
    () => externalNetworks
      .map((network) => `${network.id}:${wallet ? getWalletAddressForNetwork(wallet, network.id) || '' : ''}`)
      .join('|'),
    [externalNetworks, wallet],
  )
  const watchedHistoryAddressKey = useMemo(
    () => availableNetworks
      .map((network) => `${network.id}:${wallet ? getWalletAddressForNetwork(wallet, network.id) || '' : ''}`)
      .join('|'),
    [availableNetworks, wallet],
  )
  useFocusEffect(useCallback(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      setFocusedWorkEnabled(true)
    })
    return () => {
      task.cancel()
      setFocusedWorkEnabled(false)
    }
  }, []))

  const mozagaPortfolioQuery = useQuery({
    queryKey: ['cryptoPortfolio', walletKey, 'mozaga'],
    enabled: focusedWorkEnabled && Boolean(wallet?.address),
    staleTime: 30_000,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    queryFn: () => loadMozagaPortfolioData(wallet),
  })

  const ethQuery = useQuery({
    queryKey: ['cryptoPortfolio', walletKey, 'balance', 'ethereum'],
    enabled: focusedWorkEnabled && Boolean(ethereumAddress),
    staleTime: 30_000,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<EthPortfolioData> => {
      return loadEthereumPortfolioData(wallet)
    },
  })

  const externalQuery = useQuery({
    queryKey: ['cryptoPortfolio', walletKey, 'balance', 'external', externalAddressKey],
    enabled: focusedWorkEnabled && Boolean(wallet?.address && externalNetworks.length > 0),
    staleTime: 30_000,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<ExternalPortfolioData> => {
      return loadExternalPortfolioData(wallet, externalNetworks)
    },
  })

  const localWalletIndexQuery = useQuery({
    queryKey: ['cryptoPortfolio', walletKey, 'localWalletIndex'],
    enabled: focusedWorkEnabled && Boolean(wallet?.address),
    staleTime: 30_000,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<WalletIndexLocalState> => {
      if (!wallet?.address) {
        return {
          version: 1,
          activations: [],
          balances: [],
          transactions: [],
          unreadEventIdsByChain: {},
          appliedEvents: [],
          remoteLeaseCheckAt: 0,
        }
      }
      return loadWalletIndexState(wallet.address)
    },
  })

  const pendingTransactionsQuery = useQuery({
    queryKey: ['cryptoPortfolio', walletKey, 'pendingTransactions', watchedHistoryAddressKey],
    enabled: focusedWorkEnabled && Boolean(wallet?.address),
    staleTime: 5_000,
    refetchInterval: false,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<PendingTransactionsByNetwork> => {
      if (!wallet?.address) return {}
      const entries = await Promise.all(availableNetworks.map(async (network) => {
        const address = getWalletAddressForNetwork(wallet, network.id)
        if (!address) return [network.id, [] as PendingCryptoTransaction[]] as const
        const pending = await loadPendingCryptoTransactions(network.id, address)
        return [network.id, pending] as const
      }))

      return entries.reduce((acc, [network, pending]) => {
        acc[network] = pending
        return acc
      }, {} as PendingTransactionsByNetwork)
    },
  })

  const hasPendingTransactions = useMemo(() => {
    const pending = pendingTransactionsQuery.data
    if (!pending) {
      return !pendingTransactionsQuery.isFetched
    }
    return Object.values(pending).some((list) => (list?.length ?? 0) > 0)
  }, [pendingTransactionsQuery.data, pendingTransactionsQuery.isFetched])

  const portfolioRefreshRef = useRef({
    wallet,
    hasPendingTransactions,
    refetchBalances: async () => {},
    refetchLocalIndex: async () => {},
    refetchPending: async () => {},
  })
  portfolioRefreshRef.current = {
    wallet,
    hasPendingTransactions,
    refetchBalances: async () => {
      await Promise.allSettled([
        mozagaPortfolioQuery.refetch(),
        ethQuery.refetch(),
        externalQuery.refetch(),
      ])
    },
    refetchLocalIndex: () => localWalletIndexQuery.refetch().then(() => undefined),
    refetchPending: () => pendingTransactionsQuery.refetch().then(() => undefined),
  }

  useEffect(() => {
    if (!focusedWorkEnabled) return
    const activeWallet = portfolioRefreshRef.current.wallet
    if (!activeWallet?.address || activeWallet.spectreMode) return

    let cancelled = false
    const refresh = async (includeBalances: boolean) => {
      try {
        const result = await syncWalletIndexDeliveries(activeWallet)
        if (cancelled) return
        if (result.appliedEventIds.length > 0 || result.leaseStateChanged) {
          await portfolioRefreshRef.current.refetchLocalIndex()
        }
      } catch {
        // Keep the cached portfolio on screen; pull-to-refresh still forces a retry.
      }
      if (cancelled || !includeBalances) return
      await Promise.allSettled([
        portfolioRefreshRef.current.refetchBalances(),
        portfolioRefreshRef.current.refetchPending(),
      ])
    }

    void refresh(false)
    const interval = setInterval(() => {
      void refresh(true)
    }, portfolioRefreshRef.current.hasPendingTransactions
      ? PENDING_PORTFOLIO_REFRESH_MS
      : FOCUSED_PORTFOLIO_REFRESH_MS)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [focusedWorkEnabled, hasPendingTransactions, walletKey, wallet?.spectreMode])

  const refreshAll = useCallback(async () => {
    setIsManualRefreshing(true)
    try {
      await Promise.allSettled([
        wallet ? syncWalletIndexDeliveries(wallet, { force: true }) : Promise.resolve(),
        mozagaPortfolioQuery.refetch(),
        ethQuery.refetch(),
        externalQuery.refetch(),
        pendingTransactionsQuery.refetch(),
      ])
      await localWalletIndexQuery.refetch()
    } finally {
      setIsManualRefreshing(false)
    }
  }, [
    ethQuery,
    externalQuery,
    localWalletIndexQuery,
    mozagaPortfolioQuery,
    pendingTransactionsQuery,
    wallet,
  ])

  const mozagaData = mozagaPortfolioQuery.data ?? DEFAULT_MOZAGA_PORTFOLIO_DATA
  const ethData = ethQuery.data ?? DEFAULT_ETH_PORTFOLIO_DATA
  const externalData = externalQuery.data ?? DEFAULT_EXTERNAL_PORTFOLIO_DATA
  const txData = localWalletIndexQuery.data
    ? transactionDataFromLocalState(localWalletIndexQuery.data)
    : DEFAULT_TX_DATA
  const pendingTxData = pendingTransactionsQuery.data ?? {}
  const mozagaTxs = mergePendingCryptoTransactions(txData.mozaga, pendingTxData.mozaga ?? [])
  const ethTxs = mergePendingCryptoTransactions(txData.ethereum, pendingTxData.ethereum ?? [])
  const networkTxs = availableNetworks.reduce((acc, network) => {
    if (network.id !== 'mozaga' && network.id !== 'ethereum') {
      acc[network.id] = mergePendingCryptoTransactions(
        txData.external[network.id] ?? [],
        pendingTxData[network.id] ?? [],
      )
    }
    return acc
  }, {} as Partial<Record<CryptoNetworkId, TxHistoryItem[]>>)

  useEffect(() => {
    void Promise.allSettled(availableNetworks.map((network) => {
      if (!wallet) return Promise.resolve()
      const address = getWalletAddressForNetwork(wallet, network.id)
      if (!address) return Promise.resolve()
      const indexedTransactions = network.id === 'mozaga'
        ? txData.mozaga
        : network.id === 'ethereum'
          ? txData.ethereum
          : txData.external[network.id] ?? []
      return pruneIndexedPendingCryptoTransactions(network.id, address, indexedTransactions)
    })).catch((error) => {
      if (__DEV__) console.warn('[CryptoPortfolio] Failed to prune pending transactions:', error)
    })
  }, [availableNetworks, txData, wallet])

  const networkBalances = {
    ...(mozagaPortfolioQuery.data ? { mozaga: mozagaData.balance } : {}),
    ...(ethQuery.data ? { ethereum: ethData.balance } : {}),
    ...externalData.balances,
  } as NetworkBalances
  const portfolioRows = availableNetworks.map((network) => {
    const recentTransactions = network.id === 'mozaga'
      ? mozagaTxs
      : network.id === 'ethereum'
        ? ethTxs
        : networkTxs[network.id] ?? []
    const tokenCount = network.id === 'mozaga'
      ? mozagaData.assets.length
      : network.id === 'ethereum'
        ? ethData.tokens.length
        : (externalData.tokens[network.id] ?? []).length

    return {
      id: network.id,
      name: network.name,
      shortName: network.shortName,
      nativeSymbol: network.nativeSymbol,
      balance: networkBalances[network.id] ?? '0',
      tokenCount,
      recentTxCount: recentTransactions.length,
    }
  })
  const recentActivity = [
    ...mozagaTxs,
    ...ethTxs,
    ...Object.values(networkTxs).flat(),
  ].sort((left, right) => right.timestamp - left.timestamp)
  const historyStatusByChain = availableNetworks.reduce((acc, network) => {
    const address = wallet ? getWalletAddressForNetwork(wallet, network.id) : undefined
    if (!address) return acc
    const activation = localWalletIndexQuery.data?.activations.find((entry) =>
      entry.chain === network.id &&
      (
        entry.address === address ||
        (
          (network.id === 'ethereum' || network.id === 'mozaga') &&
          entry.address.toLowerCase() === address.toLowerCase()
        )
      )
    )
    const transactions = network.id === 'mozaga'
      ? txData.mozaga
      : network.id === 'ethereum'
      ? txData.ethereum
      : txData.external[network.id] ?? []
    const latest = transactions.reduce<number | null>(
      (current, transaction) => current === null || transaction.timestamp > current
        ? transaction.timestamp
        : current,
      null,
    )
    acc[network.id] = {
      chain: network.id,
      address,
      is_registered: Boolean(activation && activation.expiresAt > Date.now()),
      is_owned: true,
      transaction_count: transactions.length,
      latest_transaction_at: latest === null ? null : new Date(latest).toISOString(),
      latest_run_status: null,
      latest_run_error: null,
      is_sync_complete: true,
    }
    return acc
  }, {} as Partial<Record<CryptoNetworkId, LocalWalletIndexStatus>>)

  return {
    availableNetworks,
    balance: mozagaData.balance,
    ethBalance: ethData.balance,
    tokens: ethData.tokens,
    networkBalances,
    networkTokens: externalData.tokens,
    nativeAssets: mozagaData.assets,
    portfolioRows,
    recentActivity,
    mozagaTxs,
    ethTxs,
    networkTxs,
    historyErrorsByChain: txData.errors,
    historyStatusByChain,
    historyStatusError: localWalletIndexQuery.error instanceof Error
      ? localWalletIndexQuery.error.message
      : null,
    isLoading: mozagaPortfolioQuery.isPending,
    isLoadingEth: Boolean(ethereumAddress) && ethQuery.isPending,
    isLoadingExternalBalances: externalNetworks.length > 0 && externalQuery.isPending,
    isLoadingExternalTokens: externalNetworks.length > 0 && externalQuery.isPending,
    isLoadingAssets: mozagaPortfolioQuery.isPending,
    isLoadingTxs: localWalletIndexQuery.isPending,
    isLoadingHistoryStatus: localWalletIndexQuery.isPending,
    isRefreshing: isManualRefreshing,
    isFetchingBalances: mozagaPortfolioQuery.isFetching || ethQuery.isFetching || externalQuery.isFetching,
    isFetchingAssets: mozagaPortfolioQuery.isFetching,
    isFetchingTxs: localWalletIndexQuery.isFetching,
    refreshAll,
  }
}
