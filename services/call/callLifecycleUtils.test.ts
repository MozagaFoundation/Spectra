/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  resolveLocalCallEndReason,
  shouldIgnoreCallStateTransition,
} from './callLifecycleUtils'

describe('shouldIgnoreCallStateTransition', () => {
  it('blocks non-terminal regressions after a call already ended', () => {
    expect(shouldIgnoreCallStateTransition('ended', 'connecting')).toBe(true)
    expect(shouldIgnoreCallStateTransition('failed', 'ringing')).toBe(true)
  })

  it('blocks stale regressions after a call already moved forward', () => {
    expect(shouldIgnoreCallStateTransition('ringing', 'initiating')).toBe(true)
    expect(shouldIgnoreCallStateTransition('connecting', 'ringing')).toBe(true)
    expect(shouldIgnoreCallStateTransition('connected', 'connecting')).toBe(true)
    expect(shouldIgnoreCallStateTransition('reconnecting', 'ringing')).toBe(true)
  })

  it('allows normal in-flight transitions', () => {
    expect(shouldIgnoreCallStateTransition('ringing', 'connecting')).toBe(false)
    expect(shouldIgnoreCallStateTransition('connecting', 'connected')).toBe(false)
    expect(shouldIgnoreCallStateTransition('connected', 'reconnecting')).toBe(false)
    expect(shouldIgnoreCallStateTransition('reconnecting', 'connected')).toBe(false)
  })
})

describe('resolveLocalCallEndReason', () => {
  it('marks local outgoing pre-connect hangups as cancelled', () => {
    expect(resolveLocalCallEndReason('initiating', false)).toBe('cancelled')
    expect(resolveLocalCallEndReason('ringing', false)).toBe('cancelled')
    expect(resolveLocalCallEndReason('connecting', false)).toBe('cancelled')
  })

  it('marks incoming ringing dismissal as declined', () => {
    expect(resolveLocalCallEndReason('ringing', true)).toBe('declined')
  })

  it('keeps connected local hangups as completed', () => {
    expect(resolveLocalCallEndReason('connected', false)).toBe('completed')
    expect(resolveLocalCallEndReason('reconnecting', false)).toBe('completed')
  })
})
