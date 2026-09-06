/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { isSameAccountStorageScope, matchesStrictAccountStorageScope } from '@/lib/accountScope'
import type { Conversation } from '@/lib/types'
import { useChatStore } from '@/store/chatStore'
import { useWalletStore } from '@/store/walletStore'

function persistRemoteAccountState(
  target: {
    remoteIdentityId?: string
    remoteWalletAddress?: string
    conversationId?: string
  },
  remoteAccountState: Conversation['remoteAccountState'] | null,
  expectedLocalWalletAddress?: string,
): void {
  const wallet = useWalletStore.getState().wallet
  if (!wallet) return
  if (
    expectedLocalWalletAddress
    && !isSameAccountStorageScope(wallet.address, expectedLocalWalletAddress)
  ) {
    return
  }

  const state = useChatStore.getState()
  const matchesTargetWallet = (value: string | null | undefined) => (
    Boolean(target.remoteWalletAddress)
    && value?.toLowerCase() === target.remoteWalletAddress?.toLowerCase()
  )
  const contacts = state.contacts.filter((candidate) => (
    matchesStrictAccountStorageScope(candidate.localWalletAddress, wallet.address)
    && (
      candidate.identityId === target.remoteIdentityId
      || matchesTargetWallet(candidate.walletAddress)
    )
  ))
  const contactIdentityIds = new Set(contacts.map((contact) => contact.identityId))
  const conversations = state.conversations.filter((candidate) => (
    matchesStrictAccountStorageScope(candidate.localWalletAddress, wallet.address)
    && (
      candidate.remoteIdentityId === target.remoteIdentityId
      || matchesTargetWallet(candidate.remoteWalletAddress)
      || candidate.id === target.conversationId
      || contactIdentityIds.has(candidate.remoteIdentityId)
    )
  ))
  const hasStoredState = contacts.some((contact) => contact.remoteAccountState === 'deleted')
    || conversations.some((conversation) => conversation.remoteAccountState === 'deleted')
  if (remoteAccountState === null && !hasStoredState) return

  if (!isSameAccountStorageScope(useWalletStore.getState().wallet?.address, wallet.address)) {
    return
  }
  const updatedAt = Date.now()
  if (contacts.length > 0) {
    useChatStore.getState().batchUpdateContacts(contacts.map((contact) => ({
      identityId: contact.identityId,
      changes: {
        remoteAccountState: remoteAccountState ?? undefined,
        remoteAccountStateUpdatedAt: updatedAt,
      },
    })))
  }
  if (conversations.length > 0) {
    useChatStore.getState().batchUpdateConversations(conversations.map((conversation) => ({
      id: conversation.id,
      changes: {
        remoteAccountState: remoteAccountState ?? undefined,
        remoteAccountStateUpdatedAt: updatedAt,
      },
    })))
  }
}

export function markRemoteAccountUnavailable(remoteIdentityId: string): void {
  persistRemoteAccountState({ remoteIdentityId }, 'deleted')
}

export function hasRemoteAccountUnavailableMarker(): boolean {
  const wallet = useWalletStore.getState().wallet
  if (!wallet) return false

  const state = useChatStore.getState()
  return state.contacts.some((contact) => (
    matchesStrictAccountStorageScope(contact.localWalletAddress, wallet.address)
    && contact.remoteAccountState === 'deleted'
  )) || state.conversations.some((conversation) => (
    matchesStrictAccountStorageScope(conversation.localWalletAddress, wallet.address)
    && conversation.remoteAccountState === 'deleted'
  ))
}

export function clearRemoteAccountUnavailableAfterMessage(
  remoteIdentityId: string,
  verifiedRemoteWalletAddress?: string,
  expectedLocalWalletAddress?: string,
  conversationId?: string,
): void {
  persistRemoteAccountState(
    verifiedRemoteWalletAddress
      ? {
          remoteWalletAddress: verifiedRemoteWalletAddress,
          conversationId,
        }
      : { remoteIdentityId, conversationId },
    null,
    expectedLocalWalletAddress,
  )
}

export function isAvailabilityCorroboratingOutboundMessageKind(
  messageKind?: string,
): boolean {
  return messageKind === 'text'
    || messageKind === 'view_once'
    || messageKind === 'call_invitation'
}

export function isAuthenticatedRemoteAvailabilityCorroboration({
  signatureVerified,
  senderIdentityId,
  localIdentityId,
  senderBlocked,
  lockedViewOnce,
}: {
  signatureVerified: boolean
  senderIdentityId: string
  localIdentityId?: string
  senderBlocked: boolean
  lockedViewOnce: boolean
}): boolean {
  return signatureVerified
    && Boolean(senderIdentityId)
    && senderIdentityId !== localIdentityId
    && !senderBlocked
    && !lockedViewOnce
}

export function isRecipientUnavailableRelayFailure(result: {
  relayFailureReason?: string
  relayStatusCode?: number
  relayTransient?: boolean
}): boolean {
  return result.relayFailureReason === 'recipient_unavailable'
    && result.relayStatusCode === 410
    && result.relayTransient === false
}
