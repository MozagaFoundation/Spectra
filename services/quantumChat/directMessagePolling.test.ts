/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  groupPendingDirectMessagesByConversation,
  isRealtimeDirectPollFastPath,
  prioritizePendingDirectMessageGroups,
  shouldContinueDirectBurstPolling,
  shouldPollGroupsWithDirectCycle,
} from './directMessagePolling'

describe('direct message polling helpers', () => {
  it('only uses the fast path for realtime wakeups and sequenced queued wakeups', () => {
    expect(isRealtimeDirectPollFastPath({ source: 'websocket' })).toBe(true)
    expect(isRealtimeDirectPollFastPath({ source: 'subscription_catchup' })).toBe(false)
    expect(isRealtimeDirectPollFastPath({ source: 'queued', latestServerSequence: 10 })).toBe(true)
    expect(isRealtimeDirectPollFastPath({ source: 'queued' })).toBe(false)
    expect(isRealtimeDirectPollFastPath({ source: 'scheduled' })).toBe(false)
  })

  it('keeps group polling out of healthy realtime direct cycles', () => {
    expect(shouldPollGroupsWithDirectCycle(false, false)).toBe(false)
    expect(shouldPollGroupsWithDirectCycle(true, false)).toBe(true)
    expect(shouldPollGroupsWithDirectCycle(false, true)).toBe(true)
  })

  it('runs direct burst polling only while fallback polling is primary', () => {
    expect(shouldContinueDirectBurstPolling({
      fallbackDirectPolling: false,
      directMessageCount: 1,
      consecutiveBurstPolls: 0,
      maxBurstPolls: 3,
    })).toBe(false)
    expect(shouldContinueDirectBurstPolling({
      fallbackDirectPolling: true,
      directMessageCount: 1,
      consecutiveBurstPolls: 2,
      maxBurstPolls: 3,
    })).toBe(true)
    expect(shouldContinueDirectBurstPolling({
      fallbackDirectPolling: true,
      directMessageCount: 1,
      consecutiveBurstPolls: 3,
      maxBurstPolls: 3,
    })).toBe(false)
  })

  it('preserves per-conversation ordering when grouping dispatch work', () => {
    const groups = groupPendingDirectMessagesByConversation([
      { id: 'a-1', conversationId: 'a', senderId: 'sender', timestamp: 1 } as any,
      { id: 'b-1', conversationId: 'b', senderId: 'sender', timestamp: 2 } as any,
      { id: 'a-2', conversationId: 'a', senderId: 'sender', timestamp: 3 } as any,
    ])

    expect(groups.map((group) => group.map((message) => message.id))).toEqual([
      ['a-1', 'a-2'],
      ['b-1'],
    ])
  })

  it('prioritizes the active conversation without reordering its messages', () => {
    const groups = groupPendingDirectMessagesByConversation([
      { id: 'a-1', conversationId: 'a', senderId: 'sender-a', timestamp: 1 } as any,
      { id: 'b-1', conversationId: 'b', senderId: 'sender-b', timestamp: 2 } as any,
      { id: 'b-2', conversationId: 'b', senderId: 'sender-b', timestamp: 3 } as any,
    ])

    const prioritized = prioritizePendingDirectMessageGroups(groups, 'b')

    expect(prioritized.map((group) => group.map((message) => message.id))).toEqual([
      ['b-1', 'b-2'],
      ['a-1'],
    ])
  })
})
