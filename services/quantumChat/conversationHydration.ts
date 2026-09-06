/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { ChatContact, Conversation } from '@/lib/types'
import { isHiddenConversationPreview } from '@/lib/chatHiddenPreview'
import { formatAddress } from '@/lib/utils'
import { buildDirectMessagePreview } from './messagePresentation'
import { getVisibleText } from './envelopes'

export type StoredConversationMessage = {
  content: string
  timestamp: number
  senderId?: string
  senderIdentityId?: string
  messageKind?: 'text' | 'view_once' | 'call_invitation' | 'hidden_control'
}

export function resolveLocalConversationDisplayName(
  params: {
    remoteIdentityId?: string | null
    remoteWalletAddress?: string | null
    storedDisplayName?: string | null
  },
  contacts: ChatContact[],
): string | undefined {
  const contact = contacts.find((entry) =>
    entry.identityId === params.remoteIdentityId
    || (params.remoteWalletAddress && entry.walletAddress === params.remoteWalletAddress)
  )

  return contact?.displayName
    || params.storedDisplayName
    || (params.remoteWalletAddress
      ? formatAddress(params.remoteWalletAddress, 6)
      : params.remoteIdentityId
        ? formatAddress(params.remoteIdentityId, 6)
        : undefined)
}

export function mapStoredConversationLastMessage(
  storedLastMessage: StoredConversationMessage | undefined,
  myIdentityId: string | null | undefined,
): Conversation['lastMessage'] | undefined {
  if (!storedLastMessage) {
    return undefined
  }

  return buildLastMessageFromStoredMessage(storedLastMessage, myIdentityId)
}

export function pickPreferredConversationLastMessage(
  existingLastMessage: Conversation['lastMessage'] | undefined,
  storedLastMessage: Conversation['lastMessage'] | undefined,
): Conversation['lastMessage'] | undefined {
  if (!storedLastMessage) {
    return existingLastMessage
  }

  if (!existingLastMessage) {
    return storedLastMessage
  }

  return storedLastMessage.timestamp > existingLastMessage.timestamp
    ? storedLastMessage
    : existingLastMessage
}

export function findLastHydratableConversationPreview<T>(
  messages: T[],
  buildPreview: (message: T) => Conversation['lastMessage'] | null,
): { message: T; preview: NonNullable<Conversation['lastMessage']> } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const preview = buildPreview(message)
    if (preview) {
      return { message, preview }
    }
  }
  return null
}

export function buildLastMessageFromStoredMessage(
  message: StoredConversationMessage,
  myIdentityId: string | null | undefined,
): Conversation['lastMessage'] | undefined {
  if (
    message.messageKind === 'hidden_control'
    || isHiddenConversationPreview(message.content)
    || getVisibleText(message.content) === null
  ) {
    return undefined
  }

  const isOwn = (message.senderId ?? message.senderIdentityId) === myIdentityId
  const { preview } = buildDirectMessagePreview(message.content, undefined, { isOwn })

  return {
    content: preview,
    timestamp: message.timestamp,
    isOwn,
  }
}
