/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  describeMobileLogError,
  mobileLogDebug,
  sanitizeMobileLogPrimitiveFields,
} from '@/services/logging/mobileLogger'

export type CallDiagnosticField = string | number | boolean | null | undefined

export interface CallDiagnosticEvent {
  scope: string
  name: string
  recordedAt: number
  fields: Record<string, CallDiagnosticField>
}

export interface CallLatencyEvent {
  scope: 'session' | 'signal' | 'webrtc' | 'native' | 'recovery' | 'transport'
  name: string
  elapsedMs: number
  recordedAt: number
  fields: Record<string, CallDiagnosticField>
}

const MAX_CALL_DIAGNOSTIC_EVENTS = 500
const MAX_CALL_LATENCY_EVENTS = 250
const recentCallDiagnosticEvents: CallDiagnosticEvent[] = []
const recentCallLatencyEvents: CallLatencyEvent[] = []
let callDiagnosticRecordingEnabled = true

function trimStoredEvents<T>(events: T[], max: number): void {
  if (events.length > max) {
    events.splice(0, events.length - max)
  }
}

export function describeCallError(error: unknown): string {
  return describeMobileLogError(error)
}

export function recordCallDiagnostic(
  scope: string,
  name: string,
  fields: Record<string, CallDiagnosticField> = {},
): void {
  if (!callDiagnosticRecordingEnabled) {
    return
  }

  const event: CallDiagnosticEvent = {
    scope,
    name,
    recordedAt: Date.now(),
    fields: sanitizeMobileLogPrimitiveFields(fields),
  }

  recentCallDiagnosticEvents.push(event)
  trimStoredEvents(recentCallDiagnosticEvents, MAX_CALL_DIAGNOSTIC_EVENTS)

  mobileLogDebug('CallDiag', `${scope}.${name}`, event.fields)
}

export function recordCallLatency(
  scope: CallLatencyEvent['scope'],
  name: string,
  elapsedMs: number,
  fields: Record<string, CallDiagnosticField> = {},
): void {
  if (!callDiagnosticRecordingEnabled) {
    return
  }

  const event: CallLatencyEvent = {
    scope,
    name,
    elapsedMs,
    recordedAt: Date.now(),
    fields: sanitizeMobileLogPrimitiveFields(fields),
  }

  recentCallLatencyEvents.push(event)
  trimStoredEvents(recentCallLatencyEvents, MAX_CALL_LATENCY_EVENTS)

  mobileLogDebug('CallLatency', `${scope}.${name}`, {
    elapsedMs,
    ...event.fields,
  })
}

export function startCallLatencySpan(
  scope: CallLatencyEvent['scope'],
  name: string,
  fields: Record<string, CallDiagnosticField> = {},
): { end: (extraFields?: Record<string, CallDiagnosticField>) => void } {
  const startedAt = Date.now()

  return {
    end(extraFields: Record<string, CallDiagnosticField> = {}) {
      recordCallLatency(scope, name, Date.now() - startedAt, {
        ...fields,
        ...extraFields,
      })
    },
  }
}

export function getRecentCallDiagnosticEvents(): CallDiagnosticEvent[] {
  return [...recentCallDiagnosticEvents]
}

export function clearCallDiagnosticEvents(): void {
  recentCallDiagnosticEvents.length = 0
}

export function getRecentCallLatencyEvents(): CallLatencyEvent[] {
  return [...recentCallLatencyEvents]
}

export function clearCallLatencyEvents(): void {
  recentCallLatencyEvents.length = 0
}

export function disableCallDiagnosticRecording(): void {
  callDiagnosticRecordingEnabled = false
}

export function enableCallDiagnosticRecording(): void {
  callDiagnosticRecordingEnabled = true
}
