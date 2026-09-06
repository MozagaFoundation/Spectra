/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { createCallInvitationMessage } from '../shared/callInvitationFormat'
import { classifyDirectMessageKind } from './messageKinds'

describe('classifyDirectMessageKind', () => {
  it('marks call invitations as call_invitation', () => {
    expect(
      classifyDirectMessageKind(
        createCallInvitationMessage(
          '123e4567-e89b-12d3-a456-426614174000',
          'voice',
          'YWJj',
        ),
      ),
    ).toBe('call_invitation')
  })

  it('marks hidden control envelopes as hidden_control', () => {
    expect(
      classifyDirectMessageKind(
        JSON.stringify({ v: 2, type: 'screenshot_protection', enabled: true }),
      ),
    ).toBe('hidden_control')

    expect(
      classifyDirectMessageKind(
        JSON.stringify({ v: 2, type: 'tor_state', enabled: true }),
      ),
    ).toBe('hidden_control')

    expect(
      classifyDirectMessageKind(
        JSON.stringify({ v: 2, type: 'group_ciphertext', groupId: 'group-1' }),
      ),
    ).toBe('hidden_control')
  })

  it('keeps screenshot taken notices visible as text', () => {
    expect(
      classifyDirectMessageKind(
        JSON.stringify({ v: 2, type: 'screenshot_taken', takenAt: 1 }),
      ),
    ).toBe('text')
  })

  it('keeps payment requests visible and payment updates hidden', () => {
    expect(
      classifyDirectMessageKind(
        JSON.stringify({ v: 2, type: 'crypto_payment_request', requestId: 'request-1' }),
      ),
    ).toBe('text')

    expect(
      classifyDirectMessageKind(
        JSON.stringify({ v: 2, type: 'crypto_payment_request_update', requestId: 'request-1' }),
      ),
    ).toBe('hidden_control')
  })

  it('treats view-once consumption envelopes as hidden control', () => {
    expect(
      classifyDirectMessageKind(
        JSON.stringify({ v: 2, type: 'view_once_consumed', targetMessageId: 'msg-1', consumedAt: 1 }),
      ),
    ).toBe('hidden_control')
  })

  it('treats bilateral conversation delete envelopes as hidden control', () => {
    expect(
      classifyDirectMessageKind(
        JSON.stringify({
          v: 2,
          type: 'conversation_delete',
          targetIdentityId: 'identity-me',
          issuedAt: 1,
        }),
      ),
    ).toBe('hidden_control')
  })

  it('keeps malformed known controls hidden instead of rendering their JSON', () => {
    expect(
      classifyDirectMessageKind(
        JSON.stringify({ v: 2, type: 'view_once_consumed', targetMessageId: '', consumedAt: 1 }),
      ),
    ).toBe('hidden_control')

    expect(
      classifyDirectMessageKind(
        JSON.stringify({ v: 2, type: 'conversation_delete', targetIdentityId: 'identity-me' }),
      ),
    ).toBe('hidden_control')
  })

  it('keeps view-once envelopes visible', () => {
    expect(
      classifyDirectMessageKind(
        JSON.stringify({ v: 2, type: 'view_once', kind: 'text', body: 'secret' }),
      ),
    ).toBe('view_once')
  })

  it('keeps normal text envelopes as text', () => {
    expect(
      classifyDirectMessageKind(
        JSON.stringify({ v: 2, type: 'text', text: 'hello' }),
      ),
    ).toBe('text')
  })

  it('reuses an already parsed envelope', () => {
    expect(classifyDirectMessageKind('not-json', {
      type: 'view_once',
      kind: 'text',
      body: 'secret',
    })).toBe('view_once')
  })
})
