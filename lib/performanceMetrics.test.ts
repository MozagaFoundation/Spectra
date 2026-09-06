/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  beginListStartupMetrics,
  clearPerformanceMetrics,
  getPerformanceMetrics,
  markListStartupMetric,
  markNavigationFocused,
  markNavigationStart,
  recordPerformanceMetric,
} from './performanceMetrics'

const previousMetricsFlag = process.env.EXPO_PUBLIC_PERFORMANCE_METRICS

describe('performanceMetrics', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_PERFORMANCE_METRICS = 'true'
    clearPerformanceMetrics()
  })

  afterEach(() => {
    if (previousMetricsFlag === undefined) {
      delete process.env.EXPO_PUBLIC_PERFORMANCE_METRICS
    } else {
      process.env.EXPO_PUBLIC_PERFORMANCE_METRICS = previousMetricsFlag
    }
    clearPerformanceMetrics()
  })

  it('keeps only bounded privacy-safe metric fields', () => {
    for (let index = 0; index < 205; index += 1) {
      recordPerformanceMetric('composer', 'input_commit', index, { count: 1 })
    }

    const recorded = getPerformanceMetrics()
    expect(recorded).toHaveLength(200)
    expect(recorded[0]).toMatchObject({
      scope: 'composer',
      name: 'input_commit',
      durationMs: 5,
      count: 1,
    })
    expect(Object.keys(recorded[0]).sort()).toEqual([
      'build',
      'count',
      'durationMs',
      'name',
      'platform',
      'recordedAt',
      'scope',
    ])
  })

  it('records navigation duration only after a matching focus', () => {
    markNavigationFocused('contacts')
    expect(getPerformanceMetrics()).toHaveLength(0)

    markNavigationStart('contacts')
    markNavigationFocused('contacts')

    expect(getPerformanceMetrics()).toHaveLength(1)
    expect(getPerformanceMetrics()[0]).toMatchObject({
      scope: 'navigation',
      name: 'press_to_focus',
      routeClass: 'contacts',
    })
  })

  it('records each startup mark once per lifecycle', () => {
    markListStartupMetric('storage_scope_ready')
    expect(getPerformanceMetrics()).toHaveLength(0)

    beginListStartupMetrics()
    markListStartupMetric('storage_scope_ready')
    markListStartupMetric('storage_scope_ready')
    expect(getPerformanceMetrics()).toHaveLength(1)

    beginListStartupMetrics()
    markListStartupMetric('storage_scope_ready')
    expect(getPerformanceMetrics()).toHaveLength(2)
  })

  it('does not retain metrics when disabled', () => {
    process.env.EXPO_PUBLIC_PERFORMANCE_METRICS = 'false'
    recordPerformanceMetric('event_loop', 'stall', 250)
    expect(getPerformanceMetrics()).toHaveLength(0)
  })
})
