/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  evaluateForegroundMailboxCatchup,
  FOREGROUND_STALE_MS,
  isForegroundMailboxStale,
} from './foregroundMailboxCatchup'

describe('foregroundMailboxCatchup', () => {
  it('keeps brief resumes incremental and debounceable', () => {
    const catchup = evaluateForegroundMailboxCatchup({
      lastServerSequence: 12,
      backgroundedMs: FOREGROUND_STALE_MS - 1,
      realtimeDead: false,
      now: 40_000,
      lastRequestedAt: 20_000,
      inFlight: false,
    })

    expect(isForegroundMailboxStale(FOREGROUND_STALE_MS - 1)).toBe(false)
    expect(catchup).toEqual({
      skipReason: 'debounced',
      urgentCatchup: false,
      fullResync: false,
      restartRealtime: false,
    })
  })

  it('polls immediately after a long background without idle gates', () => {
    const catchup = evaluateForegroundMailboxCatchup({
      lastServerSequence: 12,
      backgroundedMs: FOREGROUND_STALE_MS,
      realtimeDead: false,
      now: 40_000,
      lastRequestedAt: 39_000,
      inFlight: false,
    })

    expect(catchup).toEqual({
      skipReason: null,
      urgentCatchup: true,
      fullResync: false,
      restartRealtime: true,
    })
  })

  it('full-resyncs when the in-memory mailbox sequence is gone', () => {
    expect(evaluateForegroundMailboxCatchup({
      lastServerSequence: 0,
      backgroundedMs: 1_000,
      realtimeDead: false,
      now: 1_000,
      lastRequestedAt: 900,
      inFlight: false,
    })).toMatchObject({
      skipReason: null,
      urgentCatchup: true,
      fullResync: true,
      restartRealtime: false,
    })
  })

  it('restarts dead realtime without waiting for the brief-resume debounce', () => {
    expect(evaluateForegroundMailboxCatchup({
      lastServerSequence: 12,
      backgroundedMs: 1_000,
      realtimeDead: true,
      now: 40_000,
      lastRequestedAt: 39_000,
      inFlight: false,
    })).toEqual({
      skipReason: null,
      urgentCatchup: true,
      fullResync: false,
      restartRealtime: true,
    })
  })

  it('does not start a second catch-up while one is in flight', () => {
    expect(evaluateForegroundMailboxCatchup({
      lastServerSequence: 0,
      backgroundedMs: FOREGROUND_STALE_MS,
      realtimeDead: true,
      now: 40_000,
      lastRequestedAt: 1,
      inFlight: true,
    }).skipReason).toBe('in_flight')
  })
})
