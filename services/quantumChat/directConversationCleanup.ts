/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { QuantumChat } from '@spectra/core-crypto'
import { localChatStorage } from '@spectra/core-crypto/storage/local'
import { useChatStore } from '@/store/chatStore'
import { useWalletStore } from '@/store/walletStore'
import { deleteConversationMedia } from '../media/localMediaCache'
import { clearDirectMessagesAndReconcile } from './directUnreadState'

type DirectConversationCleanupClient = Pick<QuantumChat, 'removeConversation'>

type IncomingConversationDeleteOptions = {
  conversationId: string
  targetIdentityId: string
  localIdentityId?: string | null
  client?: DirectConversationCleanupClient | null
}

export async function clearDirectConversationLocally(conversationId: string): Promise<void> {
  const chatState = useChatStore.getState()
  const conversation = await localChatStorage.getConversation(conversationId)
  const localWalletAddress = useWalletStore.getState().wallet?.address
  if (!conversation?.localIdentityId || !localWalletAddress) {
    throw new Error('Direct conversation storage context is unavailable')
  }

  const result = await clearDirectMessagesAndReconcile({
    conversationId,
    localIdentityId: conversation.localIdentityId,
    localWalletAddress,
    additionalMessageIds: chatState.messages
      .filter((message) => message.conversationId === conversationId)
      .map((message) => message.id),
  })
  if (!result.applied) {
    throw new Error('Direct conversation clear was not applied')
  }
  useChatStore.getState().removeMessages(result.deletedMessageIds)
  await deleteConversationMedia(conversationId).catch(() => {})
}

export async function deleteDirectConversationLocally(
  conversationId: string,
  options?: { client?: DirectConversationCleanupClient | null },
): Promise<void> {
  const client = options?.client
  if (client) {
    await client.removeConversation(conversationId)
  } else {
    await localChatStorage.deleteConversation(conversationId)
  }

  useChatStore.getState().removeConversation(conversationId)
  await deleteConversationMedia(conversationId).catch(() => {})
}

export async function applyIncomingDirectConversationDelete(
  options: IncomingConversationDeleteOptions,
): Promise<boolean> {
  const {
    conversationId,
    targetIdentityId,
    localIdentityId,
    client,
  } = options

  if (!localIdentityId || targetIdentityId !== localIdentityId) {
    return false
  }

  await deleteDirectConversationLocally(conversationId, { client })
  return true
}
