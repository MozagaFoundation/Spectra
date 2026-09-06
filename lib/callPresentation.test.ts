/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  canMinimizeCallUi,
  isIncomingRingingCall,
  shouldShowFullScreenCall,
  shouldShowMinimizedCallBanner,
} from './callPresentation'
import type { CallState } from '@/lib/types'

describe('call presentation helpers', () => {
  it('forces incoming ringing calls to stay fullscreen', () => {
    expect(isIncomingRingingCall('ringing', true)).toBe(true)
    expect(canMinimizeCallUi('ringing', true)).toBe(false)
    expect(shouldShowFullScreenCall('ringing', true, 'minimized')).toBe(true)
    expect(shouldShowMinimizedCallBanner('ringing', true, 'minimized')).toBe(false)
  })

  it('allows active calls to move between fullscreen and minimized states', () => {
    expect(canMinimizeCallUi('connected', false)).toBe(true)
    expect(shouldShowFullScreenCall('connected', false, 'fullscreen')).toBe(true)
    expect(shouldShowFullScreenCall('connected', false, 'minimized')).toBe(false)
    expect(shouldShowMinimizedCallBanner('connected', false, 'minimized')).toBe(true)
  })

  it('hides both surfaces when no call is active', () => {
    expect(canMinimizeCallUi(null, false)).toBe(false)
    expect(shouldShowFullScreenCall(null, false, 'fullscreen')).toBe(false)
    expect(shouldShowMinimizedCallBanner(null, false, 'minimized')).toBe(false)
  })

  it('keeps the fullscreen and minimized surfaces mutually exclusive across live states', () => {
    const states: CallState[] = ['initiating', 'ringing', 'connecting', 'connected', 'reconnecting']

    for (const state of states) {
      const incomingRinging = state === 'ringing'
      expect(shouldShowFullScreenCall(state, incomingRinging, 'fullscreen')).toBe(true)
      expect(shouldShowMinimizedCallBanner(state, incomingRinging, 'fullscreen')).toBe(false)
      expect(shouldShowFullScreenCall(state, incomingRinging, 'minimized')).toBe(incomingRinging)
      expect(shouldShowMinimizedCallBanner(state, incomingRinging, 'minimized')).toBe(!incomingRinging)
    }
  })
})
