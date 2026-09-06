/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearChatDiagnosticEvents,
  getChatOperationalCounters,
  getRecentChatDiagnosticEvents,
  recordChatDiagnostic,
  recordChatOperationalCounter,
} from './chatDiagnostics'

describe('chatDiagnostics', () => {
  beforeEach(() => {
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
    clearChatDiagnosticEvents()
  })

  it('redacts sensitive fields and identifiers', () => {
    recordChatDiagnostic('send', 'service_send_failed', {
      messageId: 'message-123',
      recipientIdentityId: 'remote-identity-abcdef123456',
      authorization: 'Bearer super-secret-token',
      error: 'x'.repeat(300),
    })

    const [event] = getRecentChatDiagnosticEvents()

    expect(event.fields.messageId).toBe('[redacted]')
    expect(event.fields.recipientIdentityId).toBe('[redacted]')
    expect(event.fields.authorization).toBe('[redacted]')
    expect(String(event.fields.error).length).toBeLessThanOrEqual(240)
  })

  it('counts bounded operational outcomes without identifiers', () => {
    recordChatOperationalCounter('duplicate', 'poll_merged')
    recordChatOperationalCounter('duplicate', 'poll_merged', 2)
    recordChatOperationalCounter('orphan', 'outbound_wal_replayed')
    recordChatOperationalCounter('stuck', 'invalid:name')

    expect(getChatOperationalCounters()).toEqual([
      { kind: 'duplicate', name: 'poll_merged', count: 3 },
      { kind: 'orphan', name: 'outbound_wal_replayed', count: 1 },
    ])
  })
})
