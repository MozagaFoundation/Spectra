/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export const FOREGROUND_RECONCILE_DEBOUNCE_MS = 30_000
export const FOREGROUND_STALE_MS = 5 * 60 * 1000

export type ForegroundCatchupSkipReason = 'in_flight' | 'debounced'

export type ForegroundMailboxCatchup = {
  skipReason: ForegroundCatchupSkipReason | null
  urgentCatchup: boolean
  fullResync: boolean
  restartRealtime: boolean
}

export function isForegroundMailboxStale(backgroundedMs: number): boolean {
  return backgroundedMs >= FOREGROUND_STALE_MS
}

export function evaluateForegroundMailboxCatchup(input: {
  lastServerSequence: number
  backgroundedMs: number
  realtimeDead: boolean
  now: number
  lastRequestedAt: number
  inFlight: boolean
}): ForegroundMailboxCatchup {
  const sequenceUnknown = input.lastServerSequence <= 0
  const stale = isForegroundMailboxStale(input.backgroundedMs)
  const catchup: ForegroundMailboxCatchup = {
    skipReason: null,
    urgentCatchup: sequenceUnknown || stale || input.realtimeDead,
    fullResync: sequenceUnknown,
    restartRealtime: stale || input.realtimeDead,
  }

  if (input.inFlight) {
    return { ...catchup, skipReason: 'in_flight' }
  }
  if (
    !catchup.urgentCatchup
    && input.lastRequestedAt > 0
    && input.now - input.lastRequestedAt < FOREGROUND_RECONCILE_DEBOUNCE_MS
  ) {
    return { ...catchup, skipReason: 'debounced' }
  }
  return catchup
}
