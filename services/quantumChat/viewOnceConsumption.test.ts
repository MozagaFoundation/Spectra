/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { authorizeViewOnceConsumption } from './viewOnceConsumption'

const lockedOneTime = { kind: 'text' as const, state: 'locked' as const }

describe('authorizeViewOnceConsumption', () => {
  it('allows local consumption of a real view-once message in the same conversation', () => {
    expect(authorizeViewOnceConsumption({
      consumedAt: 123,
      requestedConversationId: 'conversation-1',
      targetExists: true,
      targetConversationId: 'conversation-1',
      targetSenderId: 'remote-identity',
      targetOneTime: lockedOneTime,
      source: { kind: 'local' },
    })).toEqual({ allowed: true })
  })

  it('allows a peer receipt only for the local user outgoing view-once message', () => {
    expect(authorizeViewOnceConsumption({
      consumedAt: 123,
      requestedConversationId: 'conversation-1',
      targetExists: true,
      targetConversationId: 'conversation-1',
      targetSenderId: 'identity-me',
      targetOneTime: lockedOneTime,
      source: {
        kind: 'remote',
        controlSenderId: 'identity-them',
        localIdentityId: 'identity-me',
      },
    })).toEqual({ allowed: true })
  })

  it('rejects peer attempts to consume incoming messages', () => {
    expect(authorizeViewOnceConsumption({
      consumedAt: 123,
      requestedConversationId: 'conversation-1',
      targetExists: true,
      targetConversationId: 'conversation-1',
      targetSenderId: 'identity-them',
      targetOneTime: lockedOneTime,
      source: {
        kind: 'remote',
        controlSenderId: 'identity-them',
        localIdentityId: 'identity-me',
      },
    })).toEqual({
      allowed: false,
      reason: 'remote_target_not_own_message',
    })
  })

  it('rejects missing, cross-conversation, and non-view-once targets', () => {
    expect(authorizeViewOnceConsumption({
      consumedAt: 123,
      requestedConversationId: 'conversation-1',
      targetExists: false,
      targetOneTime: lockedOneTime,
      source: { kind: 'local' },
    })).toEqual({ allowed: false, reason: 'target_missing' })

    expect(authorizeViewOnceConsumption({
      consumedAt: 123,
      requestedConversationId: 'conversation-1',
      targetExists: true,
      targetConversationId: 'conversation-2',
      targetOneTime: lockedOneTime,
      source: { kind: 'local' },
    })).toEqual({ allowed: false, reason: 'target_wrong_conversation' })

    expect(authorizeViewOnceConsumption({
      consumedAt: 123,
      requestedConversationId: 'conversation-1',
      targetExists: true,
      targetConversationId: 'conversation-1',
      targetOneTime: undefined,
      source: { kind: 'local' },
    })).toEqual({ allowed: false, reason: 'target_not_view_once' })
  })

  it('rejects invalid consumed timestamps', () => {
    for (const consumedAt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(authorizeViewOnceConsumption({
        consumedAt,
        requestedConversationId: 'conversation-1',
        targetExists: true,
        targetConversationId: 'conversation-1',
        targetOneTime: lockedOneTime,
        source: { kind: 'local' },
      })).toEqual({ allowed: false, reason: 'invalid_consumed_at' })
    }
  })
})
