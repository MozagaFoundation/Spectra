/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { EXOWallet } from '@/lib/types'
import { prepareAsyncStorageScope } from '@/services/storage'
import { setActiveGroupStorageScope } from '@/services/groupChat/storage'
import { invalidateAuthCaches } from '@/services/backend/session'
import { isSameAccountStorageScope } from '@/lib/accountScope'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useExoAccountNotificationStore } from '@/store/exoAccountNotificationStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import { consumePendingMessagingNotifications } from '@/services/notifications/notificationCoordinator'
import {
  prepareActiveWalletPushHandoff,
  synchronizeActiveWalletPushRegistration,
} from '@/services/notifications/registrationCoordinator'
import {
  cleanupChat,
  realignChatForActiveWallet,
  waitForChatQuiescence,
} from './chatService'

let personaSwitchQueue: Promise<void> = Promise.resolve()

function enqueuePersonaSwitch<T>(operation: () => Promise<T>): Promise<T> {
  const task = personaSwitchQueue.then(operation, operation)
  personaSwitchQueue = task.then(() => undefined, () => undefined)
  return task
}

async function activateChatPersonaInternal(
  walletId: string,
  options?: { verifyCloudBinding?: boolean },
): Promise<EXOWallet> {
  const walletState = useWalletStore.getState()
  const spectreState = useSpectreStore.getState()
  const selectedWallet = walletState.wallets.find((wallet) => wallet.id === walletId)

  if (!selectedWallet) {
    throw new Error('EXO account not found')
  }

  if (
    spectreState.enabled
    || spectreState.isApplying
    || walletState.wallet?.spectreMode === true
  ) {
    throw new Error('Disable Spectre Mode before switching EXO accounts')
  }

  if (selectedWallet.spectreMode === true) {
    throw new Error('Spectre accounts cannot be used for normal chat personas')
  }

  if (
    walletState.wallet?.address
    && !isSameAccountStorageScope(walletState.wallet.address, selectedWallet.address)
  ) {
    await prepareActiveWalletPushHandoff()
    cleanupChat()
    await waitForChatQuiescence()
    invalidateAuthCaches()
  }

  await walletState.switchWallet(selectedWallet.id)
  useAuthStore.getState().setAuthenticated(selectedWallet.address, selectedWallet.publicKey)

  await prepareAsyncStorageScope(selectedWallet.address, {
    allowLegacyMigration: true,
  })
  setActiveGroupStorageScope(selectedWallet.address)
  useChatStore.getState().setStorageScope(selectedWallet.address, {
    allowLegacyMigration: true,
  })
  void useExoAccountNotificationStore.getState().clearWalletUnread(selectedWallet.address)
  await realignChatForActiveWallet().catch((error) => {
    console.warn('Failed to realign chat after EXO account switch:', error)
  })
  await consumePendingMessagingNotifications('persona_activation').catch((error) => {
    console.warn('Failed to reconcile pending messages after EXO account switch:', error)
  })

  if (options?.verifyCloudBinding !== false) {
    void synchronizeActiveWalletPushRegistration().catch((error) => {
      console.warn('Failed to register selected EXO account for notifications:', error)
    })
  }

  return selectedWallet
}

export function activateChatPersona(
  walletId: string,
  options?: { verifyCloudBinding?: boolean },
): Promise<EXOWallet> {
  return enqueuePersonaSwitch(() => activateChatPersonaInternal(walletId, options))
}

export async function activateChatPersonaByAddress(
  walletAddress: string,
  options?: { verifyCloudBinding?: boolean },
): Promise<EXOWallet> {
  const normalizedAddress = walletAddress.trim()
  const selectedWallet = useWalletStore
    .getState()
    .wallets
    .find((wallet) => isSameAccountStorageScope(wallet.address, normalizedAddress))

  if (!selectedWallet) {
    throw new Error('EXO account not found')
  }

  return activateChatPersona(selectedWallet.id, options)
}
