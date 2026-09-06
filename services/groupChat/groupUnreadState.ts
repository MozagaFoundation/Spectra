/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { ChatMessage } from '@/lib/types'
import { hasDisappearingMessageExpired } from '@/lib/disappearingMessages'

export const GROUP_UNREAD_PROJECTION_VERSION = 1

export type GroupUnreadProjection = {
  version: typeof GROUP_UNREAD_PROJECTION_VERSION
  unreadMessageIds: string[]
}

function isUnreadCandidate(
  message: ChatMessage,
  localIdentityId: string,
  now: number,
): boolean {
  return message.signatureVerified === true
    && message.senderId !== localIdentityId
    && message.deleted !== true
    && !hasDisappearingMessageExpired(message.disappearing, now)
    && (message.content.trim().length > 0 || Boolean(message.attachments?.length))
}

export function deriveGroupUnreadProjection(options: {
  messages: ChatMessage[]
  localIdentityId: string
  persisted?: GroupUnreadProjection | null
  legacyUnreadCount?: number
  addUnreadMessageId?: string
  markRead?: boolean
  now?: number
}): GroupUnreadProjection {
  const now = options.now ?? Date.now()
  const candidates = new Map<string, ChatMessage>()
  for (const message of options.messages) {
    if (message?.id && isUnreadCandidate(message, options.localIdentityId, now)) {
      candidates.set(message.id, message)
    }
  }

  if (options.markRead) {
    return { version: GROUP_UNREAD_PROJECTION_VERSION, unreadMessageIds: [] }
  }

  const legacyUnreadCount = Math.max(0, Math.trunc(options.legacyUnreadCount || 0))
  const persistedIds = options.persisted?.version === GROUP_UNREAD_PROJECTION_VERSION
    ? options.persisted.unreadMessageIds
    : legacyUnreadCount === 0
      ? []
      : [...candidates.values()]
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-legacyUnreadCount)
          .map((message) => message.id)

  const unreadMessageIds = [...new Set(persistedIds)].filter((id) => candidates.has(id))
  if (
    options.addUnreadMessageId
    && candidates.has(options.addUnreadMessageId)
    && !unreadMessageIds.includes(options.addUnreadMessageId)
  ) {
    unreadMessageIds.push(options.addUnreadMessageId)
  }

  return {
    version: GROUP_UNREAD_PROJECTION_VERSION,
    unreadMessageIds,
  }
}
