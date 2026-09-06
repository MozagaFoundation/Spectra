/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '@/lib/types'
import {
  deriveGroupUnreadProjection,
  GROUP_UNREAD_PROJECTION_VERSION,
} from './groupUnreadState'

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    conversationId: 'group:group-1',
    content: 'hello',
    senderId: 'identity-remote',
    signatureVerified: true,
    timestamp: 1,
    ...overrides,
  }
}

describe('group unread projection', () => {
  it('counts only durable verified incoming messages and deduplicates ids', () => {
    const projection = deriveGroupUnreadProjection({
      localIdentityId: 'identity-me',
      messages: [
        message(),
        message({ content: 'duplicate copy', timestamp: 2 }),
        message({ id: 'own', senderId: 'identity-me' }),
        message({ id: 'control', content: '', attachments: [] }),
        message({ id: 'unverified', signatureVerified: false }),
        message({ id: 'deleted', deleted: true }),
        message({
          id: 'expired',
          disappearing: { durationMs: 10, expiresAt: 20, trigger: 'after_send' },
        }),
      ],
      persisted: {
        version: GROUP_UNREAD_PROJECTION_VERSION,
        unreadMessageIds: ['message-1', 'expired', 'missing'],
      },
      now: 100,
    })

    expect(projection.unreadMessageIds).toEqual(['message-1'])
  })

  it('migrates the encrypted legacy count and supports durable mark-read', () => {
    const messages = [
      message({ id: 'first', timestamp: 1 }),
      message({ id: 'second', timestamp: 2 }),
      message({ id: 'third', timestamp: 3 }),
    ]

    const migrated = deriveGroupUnreadProjection({
      localIdentityId: 'identity-me',
      legacyUnreadCount: 2,
      messages,
    })
    expect(migrated.unreadMessageIds).toEqual(['second', 'third'])

    expect(deriveGroupUnreadProjection({
      localIdentityId: 'identity-me',
      markRead: true,
      messages,
      persisted: migrated,
    }).unreadMessageIds).toEqual([])
  })
})
