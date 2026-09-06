/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { create } from 'zustand'
import { useWalletStore } from '@/store/walletStore'
import {
  loadWalletIndexState,
  markWalletIndexTransactionsRead,
  type WalletIndexLocalChain,
} from '@/services/storage/walletIndexStorage'

export type WalletTransferNotificationChain = WalletIndexLocalChain

const SUPPORTED_CHAINS = new Set<WalletTransferNotificationChain>([
  'mozaga',
  'ethereum',
  'bitcoin',
  'solana',
  'tron',
])

function normalizeChain(chain: string | null | undefined): WalletTransferNotificationChain | null {
  const normalized = chain?.trim().toLowerCase()
  return normalized && SUPPORTED_CHAINS.has(normalized as WalletTransferNotificationChain)
    ? normalized as WalletTransferNotificationChain
    : null
}

function countTotal(countsByChain: Partial<Record<WalletTransferNotificationChain, number>>): number {
  return Object.values(countsByChain).reduce((sum, count) => sum + Math.max(0, count || 0), 0)
}

interface WalletTransferNotificationState {
  countsByChain: Partial<Record<WalletTransferNotificationChain, number>>
  totalUnreadCount: number
  isRefreshing: boolean
  refresh: () => Promise<void>
  markChainRead: (chain: string) => Promise<void>
}

export const useWalletTransferNotificationStore = create<WalletTransferNotificationState>((set, get) => ({
  countsByChain: {},
  totalUnreadCount: 0,
  isRefreshing: false,

  refresh: async () => {
    set({ isRefreshing: true })
    try {
      const wallet = useWalletStore.getState().wallet
      if (!wallet || wallet.spectreMode) {
        set({ countsByChain: {}, totalUnreadCount: 0 })
        return
      }
      const local = await loadWalletIndexState(wallet.address)
      const countsByChain: Partial<Record<WalletTransferNotificationChain, number>> = {}
      for (const [chain, eventIds] of Object.entries(local.unreadEventIdsByChain)) {
        const normalized = normalizeChain(chain)
        if (normalized) countsByChain[normalized] = eventIds?.length ?? 0
      }
      set({ countsByChain, totalUnreadCount: countTotal(countsByChain) })
    } finally {
      set({ isRefreshing: false })
    }
  },

  markChainRead: async (chainValue) => {
    const chain = normalizeChain(chainValue)
    const wallet = useWalletStore.getState().wallet
    if (!chain || !wallet || wallet.spectreMode) return

    await markWalletIndexTransactionsRead(wallet.address, chain)
    const nextCounts = { ...get().countsByChain, [chain]: 0 }
    set({ countsByChain: nextCounts, totalUnreadCount: countTotal(nextCounts) })
    await get().refresh()
  },
}))
