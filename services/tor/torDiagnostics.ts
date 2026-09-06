/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import NetInfo from '@react-native-community/netinfo'
import {
  describeMobileLogError,
  mobileLogDebug,
  sanitizeMobileLogPrimitiveFields,
} from '@/services/logging/mobileLogger'
export type TorDiagnosticField = string | number | boolean | null | undefined

export interface TorDiagnosticEvent {
  scope: string
  name: string
  recordedAt: number
  fields: Record<string, TorDiagnosticField>
}

export interface TorLatencyEvent {
  scope: string
  name: string
  elapsedMs: number
  recordedAt: number
  fields: Record<string, TorDiagnosticField>
}

const MAX_TOR_DIAGNOSTIC_EVENTS = 500
const MAX_TOR_LATENCY_EVENTS = 250
const recentTorDiagnosticEvents: TorDiagnosticEvent[] = []
const recentTorLatencyEvents: TorLatencyEvent[] = []
let torDiagnosticRecordingEnabled = true

let correlationCounter = 0

function trimStoredEvents<T>(events: T[], max: number): void {
  if (events.length > max) {
    events.splice(0, events.length - max)
  }
}

export function recordTorDiagnostic(
  scope: string,
  name: string,
  fields: Record<string, TorDiagnosticField> = {},
): void {
  if (!torDiagnosticRecordingEnabled) {
    return
  }

  const event: TorDiagnosticEvent = {
    scope,
    name,
    recordedAt: Date.now(),
    fields: sanitizeMobileLogPrimitiveFields(fields),
  }

  recentTorDiagnosticEvents.push(event)
  trimStoredEvents(recentTorDiagnosticEvents, MAX_TOR_DIAGNOSTIC_EVENTS)

  mobileLogDebug('TorDiag', `${scope}.${name}`, event.fields)
}

export function recordTorLatency(
  scope: string,
  name: string,
  elapsedMs: number,
  fields: Record<string, TorDiagnosticField> = {},
): void {
  if (!torDiagnosticRecordingEnabled) {
    return
  }

  const event: TorLatencyEvent = {
    scope,
    name,
    elapsedMs,
    recordedAt: Date.now(),
    fields: sanitizeMobileLogPrimitiveFields(fields),
  }

  recentTorLatencyEvents.push(event)
  trimStoredEvents(recentTorLatencyEvents, MAX_TOR_LATENCY_EVENTS)

  mobileLogDebug('TorLatency', `${scope}.${name}`, {
    elapsedMs,
    ...event.fields,
  })
}

export function startTorLatencySpan(
  scope: string,
  name: string,
  fields: Record<string, TorDiagnosticField> = {},
): { end: (extraFields?: Record<string, TorDiagnosticField>) => void } {
  const startedAt = Date.now()

  return {
    end(extraFields: Record<string, TorDiagnosticField> = {}) {
      recordTorLatency(scope, name, Date.now() - startedAt, {
        ...fields,
        ...extraFields,
      })
    },
  }
}

export function createTorCorrelationId(prefix: string = 'tor'): string {
  correlationCounter += 1
  return `${prefix}:${Date.now()}:${correlationCounter}`
}

export async function captureTorNetworkSnapshot(): Promise<Record<string, TorDiagnosticField>> {
  try {
    const state = await NetInfo.fetch()
    const details = state.details as { isConnectionExpensive?: boolean } | null | undefined

    return {
      networkType: state.type,
      networkConnected: Boolean(state.isConnected),
      networkReachable: state.isInternetReachable ?? null,
      networkExpensive: details?.isConnectionExpensive ?? null,
    }
  } catch (error) {
    return {
      networkSnapshotError: describeMobileLogError(error),
    }
  }
}

export function summarizeTorUrl(url: string): string {
  return url ? '[redacted]' : ''
}

export function getRecentTorDiagnosticEvents(): TorDiagnosticEvent[] {
  return [...recentTorDiagnosticEvents]
}

export function clearTorDiagnosticEvents(): void {
  recentTorDiagnosticEvents.length = 0
}

export function clearTorLatencyEvents(): void {
  recentTorLatencyEvents.length = 0
}

export function disableTorDiagnosticRecording(): void {
  torDiagnosticRecordingEnabled = false
}

export function enableTorDiagnosticRecording(): void {
  torDiagnosticRecordingEnabled = true
}
