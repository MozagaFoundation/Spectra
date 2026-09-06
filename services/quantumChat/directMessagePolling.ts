/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { PendingMessageFetchResult } from '@spectra/core-crypto'

export type DirectMessagePollSource = 'scheduled' | 'websocket' | 'subscription_catchup' | 'queued'

export type DirectMessagePollOptions = {
  fullResync?: boolean
  source?: DirectMessagePollSource
  latestServerSequence?: number
  realtimeRequestedAt?: number
}

export type PendingDirectMessage = PendingMessageFetchResult['messages'][number]

export function isRealtimeDirectPollFastPath(options?: DirectMessagePollOptions | null): boolean {
  return options?.source === 'websocket' || (
    options?.source === 'queued' && options.latestServerSequence !== undefined
  )
}

export function shouldPollGroupsWithDirectCycle(
  fullResync: boolean,
  fallbackGroupPolling: boolean,
): boolean {
  return fullResync || fallbackGroupPolling
}

export function shouldContinueDirectBurstPolling(params: {
  fallbackDirectPolling: boolean
  directMessageCount: number
  consecutiveBurstPolls: number
  maxBurstPolls: number
}): boolean {
  return params.fallbackDirectPolling
    && params.directMessageCount > 0
    && params.consecutiveBurstPolls < params.maxBurstPolls
}

export function groupPendingDirectMessagesByConversation(
  messages: PendingDirectMessage[],
): PendingDirectMessage[][] {
  const messagesByConversation = new Map<string, PendingDirectMessage[]>()
  for (const message of messages) {
    const conversationMessages = messagesByConversation.get(message.conversationId)
    if (conversationMessages) {
      conversationMessages.push(message)
    } else {
      messagesByConversation.set(message.conversationId, [message])
    }
  }
  return Array.from(messagesByConversation.values())
}

export function prioritizePendingDirectMessageGroups(
  groups: PendingDirectMessage[][],
  activeConversationId?: string | null,
  activeRemoteIdentityId?: string,
): PendingDirectMessage[][] {
  if (!activeConversationId && !activeRemoteIdentityId) return groups
  return groups
    .map((messages, index) => ({
      messages,
      index,
      active: messages.some((message) => (
        message.conversationId === activeConversationId
        || message.senderId === activeRemoteIdentityId
      )),
    }))
    .sort((left, right) => Number(right.active) - Number(left.active) || left.index - right.index)
    .map(({ messages }) => messages)
}
