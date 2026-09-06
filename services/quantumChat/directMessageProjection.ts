/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { DecryptedMessage } from '@spectra/core-crypto'
import type {
  ChatContact,
  ChatMessage,
  Conversation,
  MediaAttachment,
  ReplyReference,
} from '@/lib/types'

export type LocalConversationContext = Pick<
  Conversation,
  'localIdentityId' | 'localWalletAddress' | 'localDisplayName'
>

type IncomingDirectMessage = DecryptedMessage & {
  serverSequence?: number
  localOrderTimestamp?: number
}

export function getDirectSenderDisplayName(
  senderContact: Pick<ChatContact, 'displayName'> | undefined,
  senderIdentityId: string,
): string {
  return senderContact?.displayName || `User ${senderIdentityId.slice(0, 8)}`
}

export function getIncomingDirectOrderTimestamp(
  message: IncomingDirectMessage,
  createFallbackTimestamp: (baseTimestamp?: number) => number,
): number {
  if (typeof message.localOrderTimestamp === 'number') {
    return message.localOrderTimestamp
  }
  if (message.serverSequence && message.serverSequence > 0) {
    return message.timestamp
  }
  return createFallbackTimestamp(message.timestamp)
}

export function buildLockedViewOnceChatMessage(params: {
  message: IncomingDirectMessage
  localConversationContext: LocalConversationContext
  senderDisplayName: string
  localOrderTimestamp: number
  oneTime: ChatMessage['oneTime']
  disappearing: ChatMessage['disappearing']
}): ChatMessage {
  const { message, localConversationContext } = params
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    localIdentityId: localConversationContext.localIdentityId,
    localWalletAddress: localConversationContext.localWalletAddress,
    senderName: params.senderDisplayName,
    content: '',
    timestamp: message.timestamp,
    localOrderTimestamp: params.localOrderTimestamp,
    status: 'delivered',
    signatureVerified: message.signatureVerified,
    serverSequence: message.serverSequence,
    oneTime: params.oneTime,
    disappearing: params.disappearing,
  }
}

export function buildIncomingDirectChatMessage(params: {
  message: IncomingDirectMessage
  localConversationContext: LocalConversationContext
  conversationId: string
  senderDisplayName: string
  content: string
  localOrderTimestamp: number
  attachments?: MediaAttachment[]
  replyTo?: ReplyReference
  oneTime: ChatMessage['oneTime']
  disappearing: ChatMessage['disappearing']
  systemEvent?: ChatMessage['systemEvent']
}): ChatMessage {
  const { message, localConversationContext } = params
  return {
    id: message.id,
    conversationId: params.conversationId,
    senderId: message.senderId,
    localIdentityId: localConversationContext.localIdentityId,
    localWalletAddress: localConversationContext.localWalletAddress,
    senderName: params.senderDisplayName,
    content: params.content,
    timestamp: message.timestamp,
    localOrderTimestamp: params.localOrderTimestamp,
    status: 'delivered',
    signatureVerified: true,
    serverSequence: message.serverSequence,
    attachments: params.attachments,
    replyTo: params.replyTo,
    oneTime: params.oneTime,
    disappearing: params.disappearing,
    systemEvent: params.systemEvent,
  }
}
