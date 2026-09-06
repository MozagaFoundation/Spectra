/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type {
  DisappearingMessageState,
  DisappearingMessageTimer,
  DisappearingMessageTrigger,
} from '@/lib/types'
import { translate } from '@/lib/i18n'

export const MIN_DIRECT_DISAPPEARING_FALLBACK_MS = 60 * 60 * 1000

export const DIRECT_DISAPPEARING_TIMER_PRESETS_MS = [
  5 * 1000,
  10 * 1000,
  30 * 1000,
  60 * 1000,
  5 * 60 * 1000,
  60 * 60 * 1000,
] as const

export const GROUP_DISAPPEARING_TIMER_PRESETS_MS = [
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
] as const

function isDisappearingMessageTrigger(value: unknown): value is DisappearingMessageTrigger {
  return value === 'after_send' || value === 'after_read'
}

export function isDisappearingTimerEnabled(
  timer?: DisappearingMessageTimer | null,
): timer is DisappearingMessageTimer {
  return Boolean(timer && Number.isFinite(timer.durationMs) && timer.durationMs > 0)
}

export function normalizeDisappearingTimer(
  timer?: Partial<DisappearingMessageTimer> | null,
): DisappearingMessageTimer | null {
  if (!timer || !Number.isFinite(timer.durationMs) || Number(timer.durationMs) <= 0) {
    return null
  }

  const trigger = isDisappearingMessageTrigger(timer.trigger) ? timer.trigger : 'after_send'
  const fallbackDurationMs = Number.isFinite(timer.fallbackDurationMs)
    ? Math.max(Number(timer.fallbackDurationMs), MIN_DIRECT_DISAPPEARING_FALLBACK_MS)
    : undefined

  return {
    durationMs: Number(timer.durationMs),
    trigger,
    ...(typeof fallbackDurationMs === 'number' ? { fallbackDurationMs } : {}),
    ...(typeof timer.updatedAt === 'number' ? { updatedAt: timer.updatedAt } : {}),
    ...(typeof timer.updatedBy === 'string' && timer.updatedBy.length > 0
      ? { updatedBy: timer.updatedBy }
      : {}),
  }
}

export function buildDirectDisappearingTimer(
  durationMs: number | null,
  options?: { updatedAt?: number; updatedBy?: string },
): DisappearingMessageTimer | null {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null
  }

  return {
    durationMs,
    trigger: 'after_read',
    fallbackDurationMs: Math.max(durationMs, MIN_DIRECT_DISAPPEARING_FALLBACK_MS),
    ...(typeof options?.updatedAt === 'number' ? { updatedAt: options.updatedAt } : {}),
    ...(typeof options?.updatedBy === 'string' && options.updatedBy.length > 0
      ? { updatedBy: options.updatedBy }
      : {}),
  }
}

export function buildGroupDisappearingTimer(
  durationMs: number | null,
  options?: { updatedAt?: number; updatedBy?: string },
): DisappearingMessageTimer | null {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null
  }

  return {
    durationMs,
    trigger: 'after_send',
    ...(typeof options?.updatedAt === 'number' ? { updatedAt: options.updatedAt } : {}),
    ...(typeof options?.updatedBy === 'string' && options.updatedBy.length > 0
      ? { updatedBy: options.updatedBy }
      : {}),
  }
}

export function createMessageDisappearingState(
  timer: DisappearingMessageTimer | null | undefined,
  options: {
    sentAt: number
    startOnSend?: boolean
    applyFallback?: boolean
  },
): DisappearingMessageState | undefined {
  if (!isDisappearingTimerEnabled(timer)) {
    return undefined
  }

  const normalized = normalizeDisappearingTimer(timer)
  if (!normalized) {
    return undefined
  }

  const state: DisappearingMessageState = {
    durationMs: normalized.durationMs,
    trigger: normalized.trigger,
    ...(typeof normalized.fallbackDurationMs === 'number'
      ? { fallbackDurationMs: normalized.fallbackDurationMs }
      : {}),
  }

  if (options.applyFallback && typeof normalized.fallbackDurationMs === 'number') {
    state.fallbackExpiresAt = options.sentAt + normalized.fallbackDurationMs
  }

  const shouldStartOnSend = normalized.trigger === 'after_send' || options.startOnSend === true
  if (shouldStartOnSend) {
    const expiryDuration = normalized.trigger === 'after_send'
      ? normalized.durationMs
      : normalized.fallbackDurationMs ?? normalized.durationMs

    state.armedAt = options.sentAt
    state.expiresAt = options.sentAt + expiryDuration
    state.expiresFrom = normalized.trigger === 'after_send' ? 'after_send' : 'send_fallback'
  }

  return state
}

export function armDisappearingMessageOnRead(
  state: DisappearingMessageState | null | undefined,
  readAt: number = Date.now(),
): DisappearingMessageState | undefined {
  if (!state || state.trigger !== 'after_read') {
    return state ?? undefined
  }

  return {
    ...state,
    armedAt: readAt,
    expiresAt: readAt + state.durationMs,
    expiresFrom: 'after_read',
  }
}

export function getDisappearingMessageExpiryTimestamp(
  state?: Pick<DisappearingMessageState, 'expiresAt' | 'fallbackExpiresAt'> | null,
): number | null {
  if (!state) {
    return null
  }

  if (typeof state.expiresAt === 'number') {
    return state.expiresAt
  }

  if (typeof state.fallbackExpiresAt === 'number') {
    return state.fallbackExpiresAt
  }

  return null
}

export function hasDisappearingMessageExpired(
  state?: Pick<DisappearingMessageState, 'expiresAt' | 'fallbackExpiresAt'> | null,
  now: number = Date.now(),
): boolean {
  const expiresAt = getDisappearingMessageExpiryTimestamp(state)
  return typeof expiresAt === 'number' && expiresAt <= now
}

export function getDisappearingMessageRemainingMs(
  state?: Pick<DisappearingMessageState, 'expiresAt' | 'fallbackExpiresAt'> | null,
  now: number = Date.now(),
): number | null {
  const expiresAt = getDisappearingMessageExpiryTimestamp(state)
  if (typeof expiresAt !== 'number') {
    return null
  }
  return Math.max(0, expiresAt - now)
}

export function formatDisappearingTimerDuration(durationMs?: number | null): string {
  if (!durationMs || !Number.isFinite(durationMs) || durationMs <= 0) {
    return translate('disappearing.off')
  }

  if (durationMs < 60 * 1000) {
    return translate('duration.seconds', { count: Math.round(durationMs / 1000) })
  }

  if (durationMs < 60 * 60 * 1000) {
    return translate('duration.minutes', { count: Math.round(durationMs / (60 * 1000)) })
  }

  if (durationMs < 24 * 60 * 60 * 1000) {
    return translate('duration.hours', { count: Math.round(durationMs / (60 * 60 * 1000)) })
  }

  return translate('duration.days', { count: Math.round(durationMs / (24 * 60 * 60 * 1000)) })
}

export function getDisappearingTimerDescription(
  timer?: DisappearingMessageTimer | null,
): string {
  if (!isDisappearingTimerEnabled(timer)) {
    return translate('disappearing.off')
  }

  const durationLabel = formatDisappearingTimerDuration(timer.durationMs)
  return timer.trigger === 'after_read'
    ? translate('disappearing.afterRead', { duration: durationLabel })
    : translate('disappearing.afterSend', { duration: durationLabel })
}
