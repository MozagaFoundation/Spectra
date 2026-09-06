/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { CallState } from '@/lib/types'

export type CallPresentationMode = 'fullscreen' | 'minimized'

export function isIncomingRingingCall(
  callState: CallState | null,
  isIncoming: boolean,
): boolean {
  return Boolean(callState === 'ringing' && isIncoming)
}

export function canMinimizeCallUi(
  callState: CallState | null,
  isIncoming: boolean,
): boolean {
  if (!callState) {
    return false
  }

  return !isIncomingRingingCall(callState, isIncoming)
}

export function shouldShowFullScreenCall(
  callState: CallState | null,
  isIncoming: boolean,
  presentationMode: CallPresentationMode,
): boolean {
  if (!callState) {
    return false
  }

  if (isIncomingRingingCall(callState, isIncoming)) {
    return true
  }

  return presentationMode === 'fullscreen'
}

export function shouldShowMinimizedCallBanner(
  callState: CallState | null,
  isIncoming: boolean,
  presentationMode: CallPresentationMode,
): boolean {
  return (
    Boolean(callState)
    && presentationMode === 'minimized'
    && !isIncomingRingingCall(callState, isIncoming)
  )
}
