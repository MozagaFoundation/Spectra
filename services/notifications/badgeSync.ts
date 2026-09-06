/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as Notifications from 'expo-notifications'
import { isSameAccountStorageScope } from '@/lib/accountScope'
import {
  deriveApplicationBadgeCount,
  type UnreadBadgeDomains,
} from './badgeDomains'

let activeSync: Promise<void> | null = null
let rerunRequested = false

function emptyDomains(): UnreadBadgeDomains {
  return {
    direct: 0,
    group: 0,
    walletTransfer: 0,
  }
}

async function readUnreadDomains(): Promise<UnreadBadgeDomains> {
  const [
    { useAuthStore },
    { useChatStore },
    { useGroupChatStore },
    { useWalletStore },
    { useWalletTransferNotificationStore },
  ] = await Promise.all([
    import('@/store/authStore'),
    import('@/store/chatStore'),
    import('@/store/groupChatStore'),
    import('@/store/walletStore'),
    import('@/store/walletTransferNotificationStore'),
  ])

  const activeWalletAddress = useWalletStore.getState().wallet?.address
  if (!activeWalletAddress) {
    return emptyDomains()
  }

  const chatState = useChatStore.getState()
  const direct = isSameAccountStorageScope(chatState.storageScope, activeWalletAddress)
    ? chatState.totalUnreadCount
    : 0
  const group = useGroupChatStore.getState().groups.reduce((sum, conversation) => (
    isSameAccountStorageScope(conversation.localWalletAddress, activeWalletAddress)
      ? sum + (conversation.unreadCount || 0)
      : sum
  ), 0)
  const walletTransfer = isSameAccountStorageScope(
    useAuthStore.getState().exoAddress,
    activeWalletAddress,
  )
    ? useWalletTransferNotificationStore.getState().totalUnreadCount
    : 0

  return { direct, group, walletTransfer }
}

async function projectApplicationBadge(): Promise<void> {
  const domains = await readUnreadDomains()
  await Notifications.setBadgeCountAsync(deriveApplicationBadgeCount(domains))
}

export function syncGlobalBadge(): Promise<void> {
  if (activeSync) {
    rerunRequested = true
    return activeSync
  }

  activeSync = (async () => {
    do {
      rerunRequested = false
      try {
        await projectApplicationBadge()
      } catch (error) {
        console.warn('Failed to sync global badge:', error)
      }
    } while (rerunRequested)
  })().finally(() => {
    activeSync = null
  })

  return activeSync
}

export function scheduleGlobalBadgeSync(): void {
  void syncGlobalBadge()
}
