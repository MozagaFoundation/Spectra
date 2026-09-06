/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', () => ({
  translate: (key: string) => key,
}))

import {
  DIRECT_DISAPPEARING_TIMER_PRESETS_MS,
  GROUP_DISAPPEARING_TIMER_PRESETS_MS,
  MIN_DIRECT_DISAPPEARING_FALLBACK_MS,
  armDisappearingMessageOnRead,
  buildDirectDisappearingTimer,
  buildGroupDisappearingTimer,
  createMessageDisappearingState,
  formatDisappearingTimerDuration,
  getDisappearingMessageExpiryTimestamp,
  getDisappearingMessageRemainingMs,
  getDisappearingTimerDescription,
  hasDisappearingMessageExpired,
  isDisappearingTimerEnabled,
  normalizeDisappearingTimer,
} from './disappearingMessages'

describe('disappearingMessages helpers', () => {
  it('keeps direct and group preset policies distinct', () => {
    expect(DIRECT_DISAPPEARING_TIMER_PRESETS_MS).toEqual([
      5_000,
      10_000,
      30_000,
      60_000,
      5 * 60_000,
      60 * 60_000,
    ])
    expect(GROUP_DISAPPEARING_TIMER_PRESETS_MS[0]).toBe(60 * 60_000)
    expect(GROUP_DISAPPEARING_TIMER_PRESETS_MS).not.toContain(5_000)
  })

  it('normalizes timers and rejects invalid disabled values', () => {
    expect(isDisappearingTimerEnabled(null)).toBe(false)
    expect(isDisappearingTimerEnabled({ durationMs: 0, trigger: 'after_send' })).toBe(false)
    expect(normalizeDisappearingTimer(null)).toBeNull()
    expect(normalizeDisappearingTimer({
      durationMs: Number.NaN,
      trigger: 'after_send',
    })).toBeNull()
    expect(normalizeDisappearingTimer({
      durationMs: 5_000,
      trigger: 'invalid' as any,
      fallbackDurationMs: 10_000,
      updatedAt: 123,
      updatedBy: 'identity-1',
    })).toEqual({
      durationMs: 5_000,
      trigger: 'after_send',
      fallbackDurationMs: MIN_DIRECT_DISAPPEARING_FALLBACK_MS,
      updatedAt: 123,
      updatedBy: 'identity-1',
    })
  })

  it('applies the minimum direct send fallback window', () => {
    const timer = buildDirectDisappearingTimer(5_000)

    expect(timer).toEqual({
      durationMs: 5_000,
      trigger: 'after_read',
      fallbackDurationMs: MIN_DIRECT_DISAPPEARING_FALLBACK_MS,
    })
  })

  it('returns null timers for disabled direct and group durations', () => {
    expect(buildDirectDisappearingTimer(null)).toBeNull()
    expect(buildDirectDisappearingTimer(0)).toBeNull()
    expect(buildGroupDisappearingTimer(null)).toBeNull()
    expect(buildGroupDisappearingTimer(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('creates an outgoing direct state with a fallback but no active countdown', () => {
    const timer = buildDirectDisappearingTimer(10_000)
    const state = createMessageDisappearingState(timer, {
      sentAt: 1_000,
      applyFallback: true,
    })

    expect(state).toEqual({
      durationMs: 10_000,
      trigger: 'after_read',
      fallbackDurationMs: MIN_DIRECT_DISAPPEARING_FALLBACK_MS,
      fallbackExpiresAt: 1_000 + MIN_DIRECT_DISAPPEARING_FALLBACK_MS,
    })
  })

  it('can start an after-read timer on send when fallback policy requires it', () => {
    const timer = buildDirectDisappearingTimer(10_000)
    const state = createMessageDisappearingState(timer, {
      sentAt: 1_000,
      startOnSend: true,
      applyFallback: true,
    })

    expect(state).toEqual({
      durationMs: 10_000,
      trigger: 'after_read',
      fallbackDurationMs: MIN_DIRECT_DISAPPEARING_FALLBACK_MS,
      fallbackExpiresAt: 1_000 + MIN_DIRECT_DISAPPEARING_FALLBACK_MS,
      armedAt: 1_000,
      expiresAt: 1_000 + MIN_DIRECT_DISAPPEARING_FALLBACK_MS,
      expiresFrom: 'send_fallback',
    })
  })

  it('arms an after-read state when the message is read', () => {
    const timer = buildDirectDisappearingTimer(15_000)
    const initial = createMessageDisappearingState(timer, {
      sentAt: 1_000,
      applyFallback: true,
    })

    const armed = armDisappearingMessageOnRead(initial, 9_000)

    expect(armed).toMatchObject({
      durationMs: 15_000,
      trigger: 'after_read',
      armedAt: 9_000,
      expiresAt: 24_000,
      expiresFrom: 'after_read',
      fallbackExpiresAt: 1_000 + MIN_DIRECT_DISAPPEARING_FALLBACK_MS,
    })
  })

  it('starts group timers immediately from send time', () => {
    const timer = buildGroupDisappearingTimer(60 * 60 * 1000)
    const state = createMessageDisappearingState(timer, {
      sentAt: 5_000,
      startOnSend: true,
    })

    expect(state).toMatchObject({
      durationMs: 60 * 60 * 1000,
      trigger: 'after_send',
      armedAt: 5_000,
      expiresAt: 5_000 + 60 * 60 * 1000,
      expiresFrom: 'after_send',
    })
    expect(hasDisappearingMessageExpired(state, 5_000 + 60 * 60 * 1000 - 1)).toBe(false)
    expect(hasDisappearingMessageExpired(state, 5_000 + 60 * 60 * 1000)).toBe(true)
  })

  it('resolves expiry and remaining time with fallback precedence only when needed', () => {
    expect(getDisappearingMessageExpiryTimestamp(null)).toBeNull()
    expect(getDisappearingMessageExpiryTimestamp({ fallbackExpiresAt: 3_000 })).toBe(3_000)
    expect(getDisappearingMessageExpiryTimestamp({
      expiresAt: 2_000,
      fallbackExpiresAt: 3_000,
    })).toBe(2_000)
    expect(getDisappearingMessageRemainingMs({ expiresAt: 2_000 }, 1_500)).toBe(500)
    expect(getDisappearingMessageRemainingMs({ expiresAt: 2_000 }, 2_500)).toBe(0)
    expect(hasDisappearingMessageExpired({ fallbackExpiresAt: 2_000 }, 2_000)).toBe(true)
  })

  it('formats timer labels and descriptions through i18n keys', () => {
    expect(formatDisappearingTimerDuration(null)).toBe('disappearing.off')
    expect(formatDisappearingTimerDuration(30_000)).toBe('duration.seconds')
    expect(formatDisappearingTimerDuration(5 * 60_000)).toBe('duration.minutes')
    expect(formatDisappearingTimerDuration(2 * 60 * 60_000)).toBe('duration.hours')
    expect(formatDisappearingTimerDuration(2 * 24 * 60 * 60_000)).toBe('duration.days')
    expect(getDisappearingTimerDescription(null)).toBe('disappearing.off')
    expect(getDisappearingTimerDescription({ durationMs: 30_000, trigger: 'after_read' }))
      .toBe('disappearing.afterRead')
    expect(getDisappearingTimerDescription({ durationMs: 30_000, trigger: 'after_send' }))
      .toBe('disappearing.afterSend')
  })
})
