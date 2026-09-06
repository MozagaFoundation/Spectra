/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  resolveRelayFetchAfterSequence,
  shouldReplayMailboxFromZero,
} from './relayMailboxCursor'

describe('relayMailboxCursor', () => {
  it('replays from zero only when the cursor is unknown or recovery asks for it', () => {
    expect(resolveRelayFetchAfterSequence({
      lastServerSequence: 0,
      replayMailbox: false,
    })).toBeUndefined()
    expect(resolveRelayFetchAfterSequence({
      lastServerSequence: 2025,
      replayMailbox: true,
    })).toBeUndefined()
  })

  it('keeps a known cursor incremental even for catch-up polls', () => {
    expect(resolveRelayFetchAfterSequence({
      lastServerSequence: 2025,
    })).toBe(2025)
    expect(resolveRelayFetchAfterSequence({
      lastServerSequence: Number.NaN,
    })).toBeUndefined()
  })

  it('does not reuse another identity’s cursor on explicit recovery', () => {
    expect(shouldReplayMailboxFromZero({
      fullResync: true,
      reason: 'initialization',
    })).toBe(false)
    expect(shouldReplayMailboxFromZero({
      fullResync: true,
      reason: 'foreground_resume',
    })).toBe(false)
    expect(shouldReplayMailboxFromZero({
      fullResync: true,
      reason: 'manual_recovery',
    })).toBe(true)
  })
})
