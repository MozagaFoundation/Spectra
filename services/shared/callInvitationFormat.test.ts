/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  createCallInvitationMessage,
  describeCallInvitation,
  isCallInvitation,
  parseCallInvitation,
} from './callInvitationFormat'

describe('callInvitationFormat', () => {
  const sessionId = '123e4567-e89b-12d3-a456-426614174000'
  const encryptionKey = 'YWJjZGVmZw=='

  it('round-trips voice and video invitations', () => {
    for (const callType of ['voice', 'video'] as const) {
      const message = createCallInvitationMessage(sessionId, callType, encryptionKey)

      expect(isCallInvitation(message)).toBe(true)
      expect(parseCallInvitation(message)).toEqual({
        sessionId,
        callType,
        encryptionKey,
      })
    }
  })

  it('requires the invitation token to be the entire message', () => {
    const message = createCallInvitationMessage(sessionId, 'voice', encryptionKey)

    expect(isCallInvitation(`Join me ${message}`)).toBe(false)
    expect(isCallInvitation(`${message} now`)).toBe(false)
    expect(parseCallInvitation(`Join me ${message}`)).toBeNull()
    expect(parseCallInvitation(`${message} now`)).toBeNull()
  })

  it('rejects malformed invitations', () => {
    const malformed = [
      '',
      'hello',
      '[QCALL:]',
      '[QCALL:123e4567-e89b-12d3-a456-426614174000:screen:YWJj]',
      '[QCALL:123e4567-e89b-12d3-a456-426614174000:voice:]',
      '[QCALL:123e4567-e89b-12d3-a456-426614174000:voice:abc-_]',
      '[QCALL:123E4567-E89B-12D3-A456-426614174000:voice:YWJj]',
    ]

    for (const value of malformed) {
      expect(isCallInvitation(value)).toBe(false)
      expect(parseCallInvitation(value)).toBeNull()
    }
  })

  it('keeps isCallInvitation and parseCallInvitation in sync', () => {
    const inputs = [
      createCallInvitationMessage(sessionId, 'voice', encryptionKey),
      createCallInvitationMessage(sessionId, 'video', encryptionKey),
      'not an invitation',
      `[QCALL:${sessionId}:voice:YWJj] trailing`,
    ]

    for (const value of inputs) {
      expect(isCallInvitation(value)).toBe(parseCallInvitation(value) !== null)
    }
  })

  it('describes valid invitations by direction and type', () => {
    expect(describeCallInvitation(
      createCallInvitationMessage(sessionId, 'voice', encryptionKey),
      'incoming',
    )).toBe('Incoming voice call')
    expect(describeCallInvitation(
      createCallInvitationMessage(sessionId, 'video', encryptionKey),
      'outgoing',
    )).toBe('Outgoing video call')
    expect(describeCallInvitation('hello', 'incoming')).toBeNull()
  })
})
