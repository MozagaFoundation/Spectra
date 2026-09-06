/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearChatLatencyEvents,
  disableChatLatencyRecording,
  enableChatLatencyRecording,
  getChatLatencyRollups,
  getRecentChatLatencyEvents,
  recordChatLatency,
  startChatLatencySpan,
} from './chatLatency'

describe('chatLatency', () => {
  beforeEach(() => {
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
    vi.useRealTimers()
    enableChatLatencyRecording()
    clearChatLatencyEvents()
  })

  it('records bounded latency events and returns defensive copies', () => {
    for (let index = 0; index < 205; index += 1) {
      recordChatLatency('send', `event-${index}`, index, { remoteIdentityId: `identity-${index}` })
    }

    const events = getRecentChatLatencyEvents()
    expect(events).toHaveLength(200)
    expect(events[0].name).toBe('event-5')

    events.length = 0
    expect(getRecentChatLatencyEvents()).toHaveLength(200)
  })

  it('supports spans and recording disablement', () => {
    vi.useFakeTimers()
    const span = startChatLatencySpan('poll', 'cycle', { fullResync: false })
    vi.advanceTimersByTime(42)
    span.end({ result: 'ok' })

    expect(getRecentChatLatencyEvents()[0]).toEqual(expect.objectContaining({
      scope: 'poll',
      name: 'cycle',
      elapsedMs: 42,
      fields: { fullResync: false, result: 'ok' },
    }))

    disableChatLatencyRecording()
    recordChatLatency('send', 'ignored', 1)
    expect(getRecentChatLatencyEvents()).toHaveLength(1)
  })

  it('builds bounded stage rollups without retaining identifiers', () => {
    for (const elapsedMs of [5, 10, 20, 40]) {
      recordChatLatency('send', 'relay_accept', elapsedMs, {
        messageId: 'message-secret',
      })
    }

    expect(getChatLatencyRollups()).toEqual([{
      scope: 'send',
      name: 'relay_accept',
      count: 4,
      p50Ms: 10,
      p95Ms: 40,
      maxMs: 40,
    }])
    expect(getRecentChatLatencyEvents()[0]?.fields.messageId).toBe('[redacted]')
  })
})
