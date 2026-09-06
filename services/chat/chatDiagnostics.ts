/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  mobileLogDebug,
  sanitizeMobileLogPrimitiveFields,
} from '@/services/logging/mobileLogger'
import { persistDevSessionLog } from '@/services/logging/devSessionLog'

type ChatDiagnosticField = string | number | boolean | null | undefined

export interface ChatDiagnosticEvent {
  scope: string
  name: string
  recordedAt: number
  fields: Record<string, ChatDiagnosticField>
}

export type ChatOperationalCounterKind = 'duplicate' | 'stuck' | 'orphan'

export interface ChatOperationalCounter {
  kind: ChatOperationalCounterKind
  name: string
  count: number
}

const MAX_CHAT_DIAGNOSTIC_EVENTS = 400
const MAX_CHAT_OPERATIONAL_COUNTERS = 128
const recentChatDiagnosticEvents: ChatDiagnosticEvent[] = []
const chatOperationalCounters = new Map<string, ChatOperationalCounter>()
let chatDiagnosticRecordingEnabled = true

export function recordChatDiagnostic(
  scope: string,
  name: string,
  fields: Record<string, ChatDiagnosticField> = {},
): void {
  if (!chatDiagnosticRecordingEnabled) {
    return
  }

  const event: ChatDiagnosticEvent = {
    scope,
    name,
    recordedAt: Date.now(),
    fields: sanitizeMobileLogPrimitiveFields(fields),
  }

  recentChatDiagnosticEvents.push(event)
  if (recentChatDiagnosticEvents.length > MAX_CHAT_DIAGNOSTIC_EVENTS) {
    recentChatDiagnosticEvents.splice(
      0,
      recentChatDiagnosticEvents.length - MAX_CHAT_DIAGNOSTIC_EVENTS,
    )
  }

  mobileLogDebug('ChatDiag', `${scope}.${name}`, event.fields)
}

export function recordCatchupTiming(
  name: string,
  fields: Record<string, ChatDiagnosticField> = {},
): void {
  recordChatDiagnostic('catchup', name, fields)
  persistDevSessionLog('ChatCatchup', name, fields)
}

export function getRecentChatDiagnosticEvents(): ChatDiagnosticEvent[] {
  return [...recentChatDiagnosticEvents]
}

export function recordChatOperationalCounter(
  kind: ChatOperationalCounterKind,
  name: string,
  delta = 1,
): void {
  if (
    !chatDiagnosticRecordingEnabled
    || !/^[a-z][a-z0-9_]{0,63}$/.test(name)
    || !Number.isSafeInteger(delta)
    || delta < 1
  ) return
  const key = `${kind}:${name}`
  const current = chatOperationalCounters.get(key)
  if (!current && chatOperationalCounters.size >= MAX_CHAT_OPERATIONAL_COUNTERS) return
  chatOperationalCounters.set(key, {
    kind,
    name,
    count: (current?.count ?? 0) + delta,
  })
}

export function getChatOperationalCounters(): ChatOperationalCounter[] {
  return [...chatOperationalCounters.values()].map((counter) => ({ ...counter }))
}

export function clearChatDiagnosticEvents(): void {
  recentChatDiagnosticEvents.length = 0
  chatOperationalCounters.clear()
}

export function disableChatDiagnosticRecording(): void {
  chatDiagnosticRecordingEnabled = false
}

export function enableChatDiagnosticRecording(): void {
  chatDiagnosticRecordingEnabled = true
}
