/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useChatStore } from '@/store/chatStore'
import { useGroupChatStore } from '@/store/groupChatStore'
import { useWalletStore } from '@/store/walletStore'
import { isSameAccountStorageScope, matchesAccountStorageScope } from '@/lib/accountScope'
import { normalizeSealedMessagePushData } from '@spectra/privacy-protocol'

const GROUP_ROUTE_PREFIX = 'group:'

type NotificationData = Record<string, unknown> | null | undefined
type NotificationRoute =
  | '/(auth)/unlock'
  | '/(auth)/unlock?pendingCall=1'
  | '/(main)/(tabs)/chats?pendingCall=1'
  | `/(main)/chat/${string}`
  | '/(main)/(tabs)/crypto'

function toRouteParam(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return null
}

function toRouteSegment(value: string): string {
  return encodeURIComponent(value)
}

function resolveChatRoute(data: NotificationData): NotificationRoute | null {
  const groupId = toRouteParam(data?.groupId)
  if (groupId) {
    return `/(main)/chat/${GROUP_ROUTE_PREFIX}${toRouteSegment(groupId)}`
  }

  const chatAddr =
    toRouteParam(data?.remoteWalletAddress) || toRouteParam(data?.remoteIdentityId)

  if (!chatAddr) {
    return null
  }

  const localWalletAddress = toRouteParam(data?.localWalletAddress)
  const localQuery = localWalletAddress ? `?local=${encodeURIComponent(localWalletAddress)}` : ''
  return `/(main)/chat/${toRouteSegment(chatAddr)}${localQuery}`
}

function matchesLocalWalletScope(
  item: { localWalletAddress?: string },
  localWalletAddress: string | null,
): boolean {
  return matchesAccountStorageScope(item.localWalletAddress, localWalletAddress)
}

function hasUnlockedLocalWallet(localWalletAddress: string | null): boolean {
  if (!localWalletAddress) {
    return false
  }

  const { isVaultUnlocked, wallets } = useWalletStore.getState()
  return isVaultUnlocked && wallets.some(
    (wallet) => wallet.spectreMode !== true && isSameAccountStorageScope(wallet.address, localWalletAddress),
  )
}

function hasKnownChatTarget(data: NotificationData): boolean {
  const groupId = toRouteParam(data?.groupId)
  if (groupId) {
    return useGroupChatStore.getState().groups.some((group) => group.groupId === groupId)
  }

  const conversationId = toRouteParam(data?.conversationId)
  const chatAddr =
    toRouteParam(data?.remoteWalletAddress) || toRouteParam(data?.remoteIdentityId)
  const localWalletAddress = toRouteParam(data?.localWalletAddress)
  const { conversations, contacts } = useChatStore.getState()

  const matchingConversation = conversationId
    ? conversations.find(
      (conversation) => conversation.id === conversationId
        && matchesLocalWalletScope(conversation, localWalletAddress),
    )
    : null

  if (matchingConversation) {
    if (!chatAddr) {
      return true
    }

    return (
      matchingConversation.remoteIdentityId === chatAddr
      || matchingConversation.remoteWalletAddress === chatAddr
    )
  }

  if (!chatAddr) {
    return false
  }

  if (conversationId && hasUnlockedLocalWallet(localWalletAddress)) {
    return true
  }

  return (
    conversations.some(
      (conversation) =>
        matchesLocalWalletScope(conversation, localWalletAddress)
        && (
          conversation.remoteIdentityId === chatAddr
          || conversation.remoteWalletAddress === chatAddr
        )
    )
    || contacts.some(
      (contact) =>
        matchesLocalWalletScope(contact, localWalletAddress)
        && (
          contact.identityId === chatAddr
          || contact.walletAddress === chatAddr
        )
    )
  )
}

export function isIncomingCallNotification(data: NotificationData): boolean {
  return data?.type === 'call' && typeof data?.callSessionId === 'string'
}

export function isCallEndNotification(data: NotificationData): boolean {
  return data?.type === 'call_end' && typeof data?.callSessionId === 'string'
}

export function isCallLifecycleNotification(data: NotificationData): boolean {
  return isIncomingCallNotification(data) || isCallEndNotification(data)
}

export function isWalletIndexWakeupNotification(data: NotificationData): boolean {
  return data?.type === 'wallet_index_wakeup'
}

export function isChatWakeupNotification(data: NotificationData): boolean {
  if (!data || isCallLifecycleNotification(data)) {
    return false
  }

  return Boolean(
    normalizeSealedMessagePushData(data)
      || typeof data.conversationId === 'string'
      || typeof data.remoteIdentityId === 'string'
      || typeof data.remoteWalletAddress === 'string'
      || typeof data.groupId === 'string'
  )
}

export function resolveNotificationRoute(
  data: NotificationData,
  isAuthenticated: boolean,
  isVaultUnlocked: boolean,
): NotificationRoute | null {
  if (!data) {
    return null
  }

  const requiresUnlock = !isAuthenticated || !isVaultUnlocked

  if (isIncomingCallNotification(data)) {
    return requiresUnlock ? '/(auth)/unlock?pendingCall=1' : '/(main)/(tabs)/chats?pendingCall=1'
  }

  if (isCallEndNotification(data)) {
    return null
  }

  if (isWalletIndexWakeupNotification(data)) {
    return requiresUnlock ? '/(auth)/unlock' : '/(main)/(tabs)/crypto'
  }

  const conversationId = toRouteParam(data.conversationId)
  const chatAddr =
    toRouteParam(data.remoteWalletAddress) || toRouteParam(data.remoteIdentityId)
  if (conversationId && chatAddr && hasKnownChatTarget(data)) {
    const localWalletAddress = toRouteParam(data.localWalletAddress)
    const localQuery = localWalletAddress ? `?local=${encodeURIComponent(localWalletAddress)}` : ''
    return requiresUnlock ? '/(auth)/unlock' : `/(main)/chat/${toRouteSegment(chatAddr)}${localQuery}`
  }

  return null
}
