/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearCallDiagnosticEvents,
  clearCallLatencyEvents,
  getRecentCallDiagnosticEvents,
  getRecentCallLatencyEvents,
  recordCallDiagnostic,
  startCallLatencySpan,
} from './callDiagnostics'

describe('callDiagnostics', () => {
  beforeEach(() => {
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
    clearCallDiagnosticEvents()
    clearCallLatencyEvents()
  })

  it('redacts sensitive fields and identifiers', () => {
    recordCallDiagnostic('signal', 'send_failed', {
      sessionId: 'session-abcdef1234567890',
      recipientIdentityId: 'identity-abcdef1234567890',
      encryptionKey: 'super-secret-key',
      signature: 'signature-data',
      sdp: 'v=0...',
      error: 'x'.repeat(300),
    })

    const [event] = getRecentCallDiagnosticEvents()

    expect(event.fields.sessionId).toBe('[redacted]')
    expect(event.fields.recipientIdentityId).toBe('[redacted]')
    expect(event.fields.encryptionKey).toBe('[redacted]')
    expect(event.fields.signature).toBe('[redacted]')
    expect(event.fields.sdp).toBe('[redacted]')
    expect(String(event.fields.error).length).toBeLessThanOrEqual(240)
  })

  it('records latency spans with sanitized fields', () => {
    const span = startCallLatencySpan('webrtc', 'create_peer_connection', {
      sessionId: 'session-abcdef1234567890',
    })

    span.end({ candidate: 'candidate:1 1 udp 2130706431 127.0.0.1 9000 typ host' })

    const [event] = getRecentCallLatencyEvents()

    expect(event.name).toBe('create_peer_connection')
    expect(event.fields.sessionId).toBe('[redacted]')
    expect(event.fields.candidate).toBe('[redacted]')
    expect(event.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('retains only the most recent diagnostic events', () => {
    for (let index = 0; index < 505; index += 1) {
      recordCallDiagnostic('session', 'buffer_event', {
        sequenceNumber: index,
      })
    }

    const events = getRecentCallDiagnosticEvents()

    expect(events).toHaveLength(500)
    expect(events[0]?.fields.sequenceNumber).toBe(5)
    expect(events.at(-1)?.fields.sequenceNumber).toBe(504)
  })
})
