/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { CallEndReason, CallState } from '@/lib/types'

export function isTerminalCallState(state: CallState | null | undefined): boolean {
  return state === 'ended' || state === 'failed'
}

export function shouldIgnoreCallStateTransition(
  currentState: CallState | null | undefined,
  nextState: CallState,
): boolean {
  if (isTerminalCallState(currentState) && !isTerminalCallState(nextState)) {
    return true
  }

  if (currentState === 'ringing' && nextState === 'initiating') {
    return true
  }

  if (
    currentState === 'connecting'
    && (nextState === 'initiating' || nextState === 'ringing')
  ) {
    return true
  }

  if (
    (currentState === 'connected' || currentState === 'reconnecting')
    && (nextState === 'initiating' || nextState === 'ringing' || nextState === 'connecting')
  ) {
    return true
  }

  return false
}

export function resolveLocalCallEndReason(
  currentState: CallState | null | undefined,
  isIncoming: boolean,
): CallEndReason {
  if (isIncoming && currentState === 'ringing') {
    return 'declined'
  }

  if (
    currentState === 'initiating'
    || currentState === 'ringing'
    || currentState === 'connecting'
  ) {
    return 'cancelled'
  }

  return 'completed'
}
