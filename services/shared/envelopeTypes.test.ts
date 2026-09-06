/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  buildDirectEnvelope,
  createDirectEnvelope,
  serializeDirectMessageContent,
  serializeDirectEnvelope,
} from './envelopeTypes'

describe('buildDirectEnvelope', () => {
  it.each([
    ['text', { text: 'hello' }],
    ['view_once', { kind: 'text', body: 'secret' }],
    ['reaction', { reaction: { targetMessageId: 'message-1', emoji: 'OK' } }],
    ['deletion', { deletionTarget: 'message-1' }],
    ['conversation_delete', { targetIdentityId: 'identity-1', issuedAt: 1 }],
    ['screenshot_protection', { enabled: true, updatedAt: 2 }],
    ['screenshot_taken', { takenAt: 3 }],
    ['tor_state', { enabled: false, updatedAt: 4 }],
    ['view_once_consumed', { targetMessageId: 'message-2', consumedAt: 5 }],
    ['disappearing_timer', { timer: null, updatedAt: 6 }],
  ] as const)('serializes a %s envelope', (type, payload) => {
    const parsed = JSON.parse(buildDirectEnvelope(type as never, payload as never))

    expect(parsed).toMatchObject(payload)
    expect(parsed.v).toBe(2)
    expect(parsed.type).toBe(type)
  })

  it('does not allow payload fields to override envelope metadata', () => {
    const parsed = JSON.parse(buildDirectEnvelope('text', {
      text: 'hello',
      v: 99,
      type: 'deletion',
    } as never))

    expect(parsed).toEqual({
      text: 'hello',
      v: 2,
      type: 'text',
    })
  })

  it('keeps typed envelopes immutable until their single serialization boundary', () => {
    const envelope = createDirectEnvelope('view_once', {
      kind: 'text',
      body: 'secret',
    })

    expect(Object.isFrozen(envelope)).toBe(true)
    expect(serializeDirectEnvelope(envelope)).toBe(
      '{"kind":"text","body":"secret","v":2,"type":"view_once"}',
    )
    expect(serializeDirectMessageContent(envelope)).toBe(serializeDirectEnvelope(envelope))
    expect(serializeDirectMessageContent('plain text')).toBe('plain text')
  })
})
