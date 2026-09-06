/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export function resolveRelayFetchAfterSequence(input: {
  lastServerSequence: number
  replayMailbox?: boolean
}): number | undefined {
  if (input.replayMailbox) return undefined
  if (!Number.isSafeInteger(input.lastServerSequence) || input.lastServerSequence <= 0) {
    return undefined
  }
  return input.lastServerSequence
}

export function shouldReplayMailboxFromZero(input: {
  replayMailbox?: boolean
  fullResync?: boolean
  reason?: string
}): boolean {
  if (input.replayMailbox) return true
  return Boolean(input.fullResync && input.reason === 'manual_recovery')
}
