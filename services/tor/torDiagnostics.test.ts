/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  netInfoFetch: vi.fn(async () => ({
    type: 'wifi',
    isConnected: true,
    isInternetReachable: true,
    details: {
      isConnectionExpensive: false,
    },
  })),
}))

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: mockState.netInfoFetch,
  },
}))

import {
  captureTorNetworkSnapshot,
  clearTorDiagnosticEvents,
  clearTorLatencyEvents,
  disableTorDiagnosticRecording,
  enableTorDiagnosticRecording,
  getRecentTorDiagnosticEvents,
  recordTorDiagnostic,
  recordTorLatency,
  startTorLatencySpan,
  summarizeTorUrl,
} from './torDiagnostics'

beforeEach(() => {
  vi.stubGlobal('__DEV__', false)
  clearTorDiagnosticEvents()
  clearTorLatencyEvents()
  enableTorDiagnosticRecording()
  mockState.netInfoFetch.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  clearTorDiagnosticEvents()
  clearTorLatencyEvents()
  enableTorDiagnosticRecording()
})

describe('torDiagnostics', () => {
  it('redacts secrets and truncates diagnostic field values', () => {
    recordTorDiagnostic('bridge', 'request_response', {
      Authorization: 'Bearer secret-token',
      apikey: 'anon-key',
      bodyPreview: 'x'.repeat(300),
      correlationId: 'correlation-identifier-that-is-long',
      url: `https://example.com/${'path'.repeat(100)}`,
    })

    const [event] = getRecentTorDiagnosticEvents()

    expect(event.fields.Authorization).toBe('[redacted]')
    expect(event.fields.apikey).toBe('[redacted]')
    expect(event.fields.bodyPreview).toBe('[redacted]')
    expect(event.fields.correlationId).toBe('[redacted]')
    expect(event.fields.url).toBe('[redacted]')
  })

  it('keeps only the most recent diagnostic events', () => {
    for (let index = 0; index < 505; index += 1) {
      recordTorDiagnostic('fetch', 'event', { index })
    }

    const events = getRecentTorDiagnosticEvents()

    expect(events).toHaveLength(500)
    expect(events[0].fields.index).toBe(5)
    expect(events[499].fields.index).toBe(504)
  })

  it('can disable diagnostic and latency recording for Spectre privacy mode', () => {
    disableTorDiagnosticRecording()

    recordTorDiagnostic('fetch', 'blocked')
    recordTorLatency('fetch', 'blocked', 12)
    startTorLatencySpan('fetch', 'span').end()

    expect(getRecentTorDiagnosticEvents()).toEqual([])
  })

  it('summarizes URLs without leaking hosts or sensitive query values and captures network state', async () => {
    expect(summarizeTorUrl('https://example.com/storage/v1/object/file?token=abc&page=2'))
      .toBe('[redacted]')

    await expect(captureTorNetworkSnapshot()).resolves.toEqual({
      networkType: 'wifi',
      networkConnected: true,
      networkReachable: true,
      networkExpensive: false,
    })
  })
})
