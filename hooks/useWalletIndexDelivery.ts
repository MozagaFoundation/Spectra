/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppState } from 'react-native'
import { isSameAccountStorageScope } from '@/lib/accountScope'
import { syncGlobalBadge } from '@/services/notifications/badgeSync'
import { registerWalletIndexWakeupHandler } from '@/services/notifications/walletIndexWakeup'
import { syncWalletIndexDeliveries } from '@/services/wallet/walletIndexDelivery'
import { useWalletTransferNotificationStore } from '@/store/walletTransferNotificationStore'
import { useWalletStore } from '@/store/walletStore'
import { cryptoPortfolioWalletKey } from '@/services/crypto/portfolioBalances'
import type { EXOWallet } from '@spectra/identity-vault'

export function useWalletIndexDelivery(wallet: EXOWallet | null): void {
  const queryClient = useQueryClient()
  const sync = useCallback(async (force = false) => {
    if (!wallet || wallet.spectreMode || !useWalletStore.getState().isVaultUnlocked) return
    try {
      const result = await syncWalletIndexDeliveries(wallet, { force })
      const current = useWalletStore.getState().wallet
      if (!current || !isSameAccountStorageScope(current.address, wallet.address)) return
      if (result.appliedEventIds.length > 0 || result.leaseStateChanged) {
        await queryClient.invalidateQueries({
          exact: true,
          queryKey: ['cryptoPortfolio', cryptoPortfolioWalletKey(wallet), 'localWalletIndex'],
        })
      }
      await useWalletTransferNotificationStore.getState().refresh()
      await syncGlobalBadge()
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.warn('Failed to synchronize local wallet activity:', error)
      }
    }
  }, [queryClient, wallet])

  useEffect(() => {
    if (!wallet || wallet.spectreMode) return
    let active = true
    const trigger = (force = false) => {
      if (active) void sync(force)
    }
    trigger()
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') trigger(false)
    })
    const unregisterWakeup = registerWalletIndexWakeupHandler(() => trigger(true))
    return () => {
      active = false
      appState.remove()
      unregisterWakeup()
    }
  }, [sync, wallet])
}
