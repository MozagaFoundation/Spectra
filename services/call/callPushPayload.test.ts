/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { normalizeIncomingCallPushPayload } from './callSessionRegistry'

describe('normalizeIncomingCallPushPayload', () => {
  it('normalizes incoming call payloads with fallback identity fields', () => {
    const payload = normalizeIncomingCallPushPayload({
      type: 'call',
      sessionId: 'session-1',
      callType: 'voice',
      remoteIdentityId: 'identity-1',
      callerName: 'Alice',
      conversationId: 'conversation-1',
      notificationScopeId: `nsc1.${'a'.repeat(32)}`,
    }, 'expo')

    expect(payload).toMatchObject({
      type: 'call',
      callSessionId: 'session-1',
      callType: 'voice',
      callerIdentityId: 'identity-1',
      callerName: 'Alice',
      conversationId: 'conversation-1',
      notificationScopeId: `nsc1.${'a'.repeat(32)}`,
      source: 'expo',
    })
    expect(typeof payload?.receivedAt).toBe('number')
  })

  it('rejects incoming call payloads when the call type is missing', () => {
    expect(normalizeIncomingCallPushPayload({
      type: 'call',
      callSessionId: 'session-2',
      remoteIdentityId: 'identity-2',
    }, 'expo')).toBeNull()
  })

  it('normalizes call end payloads from the legacy reason field', () => {
    const payload = normalizeIncomingCallPushPayload({
      type: 'call_end',
      callSessionId: 'session-3',
      reason: 'missed',
      remoteIdentityId: 'identity-3',
    }, 'message')

    expect(payload).toMatchObject({
      type: 'call_end',
      callSessionId: 'session-3',
      callerIdentityId: 'identity-3',
      endReason: 'missed',
      source: 'message',
    })
  })
})
