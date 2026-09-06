/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useExoAccountNotificationStore } from '@/store/exoAccountNotificationStore'
import { useWalletStore } from '@/store/walletStore'
import { isSameAccountStorageScope } from '@/lib/accountScope'

type NotificationData = Record<string, unknown> | null | undefined

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function shouldMarkWalletUnread(data: NotificationData): boolean {
  if (!data || data.localPreview === true || data.type === 'call' || data.type === 'call_end') {
    return false
  }

  return Boolean(
    data.type === 'sealed_direct_message'
      || asNonEmptyString(data.conversationId)
      || asNonEmptyString(data.remoteIdentityId)
      || asNonEmptyString(data.remoteWalletAddress)
      || asNonEmptyString(data.groupId),
  )
}

function getNotificationLocalWalletAddress(data: NotificationData): string | null {
  return asNonEmptyString(data?.localWalletAddress)
}

export async function markWalletUnreadFromNotification(
  data: NotificationData,
  options: {
    requireInactiveWallet?: boolean
    requireUnlockedWallet?: boolean
  } = {},
): Promise<void> {
  if (!shouldMarkWalletUnread(data)) {
    return
  }

  const localWalletAddress = getNotificationLocalWalletAddress(data)
  if (!localWalletAddress) {
    return
  }

  const { wallet, wallets } = useWalletStore.getState()
  if (options.requireInactiveWallet === true && isSameAccountStorageScope(wallet?.address, localWalletAddress)) {
    return
  }

  if (options.requireUnlockedWallet === true) {
    const isUnlockedWallet = wallets.some(
      (entry) => entry.spectreMode !== true && isSameAccountStorageScope(entry.address, localWalletAddress),
    )
    if (!isUnlockedWallet) {
      return
    }
  }

  await useExoAccountNotificationStore
    .getState()
    .markWalletUnread(localWalletAddress)
    .catch((error) => {
      console.warn('Failed to mark EXO account notification badge:', error)
    })
}
