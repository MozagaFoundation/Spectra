/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { Platform } from 'react-native'

export type PerformanceMetricScope =
  | 'navigation'
  | 'chat_open'
  | 'composer'
  | 'event_loop'
  | 'list_startup'
export type PerformanceRouteClass =
  | 'chats'
  | 'contacts'
  | 'agora'
  | 'wallets'
  | 'settings'
  | 'direct_chat'
  | 'group_chat'
export type ListStartupMetricName =
  | 'storage_scope_ready'
  | 'first_contact_projection'
  | 'first_conversation_merge'
  | 'contacts_list_ready'
  | 'chats_list_ready'
  | 'contacts_first_paint'
  | 'chats_first_paint'
  | 'runtime_ready'

export interface PerformanceMetric {
  scope: PerformanceMetricScope
  name: string
  durationMs: number
  count?: number
  routeClass?: PerformanceRouteClass
  platform: string
  build: 'development' | 'release'
  recordedAt: number
}

const MAX_METRICS = 200
const EVENT_LOOP_SAMPLE_MS = 500
const EVENT_LOOP_STALL_MS = 100
const metrics: PerformanceMetric[] = []
const navigationStarts = new Map<string, number>()
let listStartupStartedAt: number | null = null
const listStartupMarks = new Set<string>()

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

export function isPerformanceMetricsEnabled(): boolean {
  return typeof process !== 'undefined'
    && process.env?.EXPO_PUBLIC_PERFORMANCE_METRICS === 'true'
}

export function recordPerformanceMetric(
  scope: PerformanceMetricScope,
  name: string,
  durationMs: number,
  fields: Pick<PerformanceMetric, 'count' | 'routeClass'> = {},
): void {
  if (!isPerformanceMetricsEnabled() || !Number.isFinite(durationMs)) return

  metrics.push({
    scope,
    name,
    durationMs: Math.max(0, Math.round(durationMs * 10) / 10),
    ...fields,
    platform: Platform.OS,
    build: typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'release',
    recordedAt: Date.now(),
  })
  if (metrics.length > MAX_METRICS) {
    metrics.splice(0, metrics.length - MAX_METRICS)
  }
}

export function startPerformanceSpan(
  scope: PerformanceMetricScope,
  name: string,
): (fields?: Pick<PerformanceMetric, 'count' | 'routeClass'>) => void {
  if (!isPerformanceMetricsEnabled()) return () => {}
  const startedAt = nowMs()
  let ended = false
  return (fields = {}) => {
    if (ended) return
    ended = true
    recordPerformanceMetric(scope, name, nowMs() - startedAt, fields)
  }
}

export function markNavigationStart(routeClass: PerformanceRouteClass): void {
  if (!isPerformanceMetricsEnabled()) return
  navigationStarts.set(routeClass, nowMs())
}

export function markNavigationFocused(routeClass: PerformanceRouteClass): void {
  const startedAt = navigationStarts.get(routeClass)
  if (startedAt === undefined) return
  navigationStarts.delete(routeClass)
  recordPerformanceMetric('navigation', 'press_to_focus', nowMs() - startedAt, {
    routeClass,
  })
}

export function beginListStartupMetrics(): void {
  if (!isPerformanceMetricsEnabled()) return
  listStartupStartedAt = nowMs()
  listStartupMarks.clear()
}

export function markListStartupMetric(
  name: ListStartupMetricName,
  fields: Pick<PerformanceMetric, 'count' | 'routeClass'> = {},
): void {
  if (
    listStartupStartedAt === null
    || listStartupMarks.has(name)
  ) {
    return
  }
  listStartupMarks.add(name)
  recordPerformanceMetric(
    'list_startup',
    name,
    nowMs() - listStartupStartedAt,
    fields,
  )
}

export function startEventLoopLatencyMonitor(): () => void {
  if (!isPerformanceMetricsEnabled()) return () => {}

  let expectedAt = nowMs() + EVENT_LOOP_SAMPLE_MS
  const timer = setInterval(() => {
    const current = nowMs()
    const lagMs = current - expectedAt
    expectedAt = current + EVENT_LOOP_SAMPLE_MS
    if (lagMs >= EVENT_LOOP_STALL_MS) {
      recordPerformanceMetric('event_loop', 'stall', lagMs)
    }
  }, EVENT_LOOP_SAMPLE_MS)

  return () => clearInterval(timer)
}

export function getPerformanceMetrics(): readonly PerformanceMetric[] {
  return [...metrics]
}

export function clearPerformanceMetrics(): void {
  metrics.length = 0
  navigationStarts.clear()
  listStartupStartedAt = null
  listStartupMarks.clear()
}
