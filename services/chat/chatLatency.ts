/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { sanitizeMobileLogPrimitiveFields } from '@/services/logging/mobileLogger'
import { persistDevSessionLog } from '@/services/logging/devSessionLog'

type ChatLatencyField = string | number | boolean | null | undefined

export interface ChatLatencyEvent {
  scope: 'poll' | 'receive' | 'send' | 'transport'
  name: string
  elapsedMs: number
  recordedAt: number
  fields: Record<string, ChatLatencyField>
}

export interface ChatLatencyRollup {
  scope: ChatLatencyEvent['scope']
  name: string
  count: number
  p50Ms: number
  p95Ms: number
  maxMs: number
}

const MAX_CHAT_LATENCY_EVENTS = 200
const recentChatLatencyEvents: ChatLatencyEvent[] = []
let chatLatencyRecordingEnabled = true

function formatLatencyFields(fields: Record<string, ChatLatencyField>): string {
  const pairs = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)

  return pairs.length > 0 ? ` ${pairs.join(' ')}` : ''
}

export function recordChatLatency(
  scope: ChatLatencyEvent['scope'],
  name: string,
  elapsedMs: number,
  fields: Record<string, ChatLatencyField> = {}
): void {
  if (!chatLatencyRecordingEnabled) {
    return
  }

  const event: ChatLatencyEvent = {
    scope,
    name,
    elapsedMs,
    recordedAt: Date.now(),
    fields: sanitizeMobileLogPrimitiveFields(fields),
  }

  recentChatLatencyEvents.push(event)
  if (recentChatLatencyEvents.length > MAX_CHAT_LATENCY_EVENTS) {
    recentChatLatencyEvents.splice(0, recentChatLatencyEvents.length - MAX_CHAT_LATENCY_EVENTS)
  }

  if (__DEV__) {
    if (
      name === 'mailbox_http_get'
      || name === 'mailbox_scope_ensure'
      || name === 'relay_fetch'
    ) {
      persistDevSessionLog('ChatLatency', `${scope}.${name}`, {
        elapsedMs,
        ...event.fields,
      })
    }
    console.log(
      `[ChatLatency] ${scope}.${name} ${elapsedMs}ms${formatLatencyFields(fields)}`
    )
  }
}

export function startChatLatencySpan(
  scope: ChatLatencyEvent['scope'],
  name: string,
  fields: Record<string, ChatLatencyField> = {}
): { end: (extraFields?: Record<string, ChatLatencyField>) => void } {
  const startedAt = Date.now()

  return {
    end(extraFields: Record<string, ChatLatencyField> = {}) {
      recordChatLatency(scope, name, Date.now() - startedAt, {
        ...fields,
        ...extraFields,
      })
    },
  }
}

export function getRecentChatLatencyEvents(): ChatLatencyEvent[] {
  return [...recentChatLatencyEvents]
}

export function getChatLatencyRollups(): ChatLatencyRollup[] {
  const groups = new Map<string, {
    scope: ChatLatencyEvent['scope']
    name: string
    values: number[]
  }>()
  for (const event of recentChatLatencyEvents) {
    const key = `${event.scope}\0${event.name}`
    const group = groups.get(key) ?? {
      scope: event.scope,
      name: event.name,
      values: [],
    }
    group.values.push(event.elapsedMs)
    groups.set(key, group)
  }
  return [...groups.values()].map(({ scope, name, values }) => {
    const sorted = [...values].sort((left, right) => left - right)
    return {
      scope,
      name,
      count: sorted.length,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      maxMs: sorted[sorted.length - 1] ?? 0,
    }
  })
}

export function clearChatLatencyEvents(): void {
  recentChatLatencyEvents.length = 0
}

export function disableChatLatencyRecording(): void {
  chatLatencyRecordingEnabled = false
}

export function enableChatLatencyRecording(): void {
  chatLatencyRecordingEnabled = true
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0
  return values[Math.max(0, Math.ceil(values.length * ratio) - 1)] ?? 0
}
