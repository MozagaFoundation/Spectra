/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', () => ({
  translate: (key: string) => key,
}))

import { isControlEnvelope, parseDirectEnvelope } from './envelopes'

describe('parseDirectEnvelope', () => {
  it('parses view-once payloads as visible envelopes', () => {
    const parsed = parseDirectEnvelope(
      JSON.stringify({
        v: 2,
        type: 'view_once',
        kind: 'image',
        body: '[QMEDIA:abc:image:photo.jpg:image/jpeg:42]',
      }),
    )

    expect(parsed).toEqual({
      type: 'view_once',
      kind: 'image',
      body: '[QMEDIA:abc:image:photo.jpg:image/jpeg:42]',
      replyTo: undefined,
    })
    expect(isControlEnvelope(parsed)).toBe(false)
  })

  it('parses view-once consumption payloads as hidden control envelopes', () => {
    const parsed = parseDirectEnvelope(
      JSON.stringify({
        v: 2,
        type: 'view_once_consumed',
        targetMessageId: 'message-1',
        consumedAt: 123,
      }),
    )

    expect(parsed).toEqual({
      type: 'view_once_consumed',
      targetMessageId: 'message-1',
      consumedAt: 123,
    })
    expect(isControlEnvelope(parsed)).toBe(true)
  })

  it('treats malformed destructive control envelopes as hidden controls', () => {
    expect(parseDirectEnvelope(JSON.stringify({
      v: 2,
      type: 'view_once_consumed',
      targetMessageId: '',
      consumedAt: 123,
    }))).toEqual({
      type: 'hidden_control',
      raw: {
        v: 2,
        type: 'view_once_consumed',
        targetMessageId: '',
        consumedAt: 123,
      },
    })

    expect(parseDirectEnvelope(JSON.stringify({
      v: 2,
      type: 'conversation_delete',
      targetIdentityId: 'identity-me',
    }))).toEqual({
      type: 'hidden_control',
      raw: {
        v: 2,
        type: 'conversation_delete',
        targetIdentityId: 'identity-me',
      },
    })
  })

  it('parses valid bilateral conversation deletes as hidden controls', () => {
    const parsed = parseDirectEnvelope(JSON.stringify({
      v: 2,
      type: 'conversation_delete',
      targetIdentityId: 'identity-me',
      issuedAt: 123,
    }))

    expect(parsed).toEqual({
      type: 'conversation_delete',
      targetIdentityId: 'identity-me',
      issuedAt: 123,
    })
    expect(isControlEnvelope(parsed)).toBe(true)
  })

  it('parses screenshot notifications as visible system envelopes', () => {
    const parsed = parseDirectEnvelope(
      JSON.stringify({
        v: 2,
        type: 'screenshot_taken',
        takenAt: 123,
      }),
    )

    expect(parsed).toEqual({
      type: 'screenshot_taken',
      takenAt: 123,
    })
    expect(isControlEnvelope(parsed)).toBe(false)
  })

  it('parses timed text envelopes with disappearing metadata', () => {
    const parsed = parseDirectEnvelope(
      JSON.stringify({
        v: 2,
        type: 'text',
        text: 'hello',
        disappearing: {
          durationMs: 10_000,
          trigger: 'after_read',
          fallbackDurationMs: 60 * 60 * 1000,
        },
      }),
    )

    expect(parsed).toEqual({
      type: 'text',
      text: 'hello',
      replyTo: undefined,
      disappearing: {
        durationMs: 10_000,
        trigger: 'after_read',
        fallbackDurationMs: 60 * 60 * 1000,
      },
    })
    expect(isControlEnvelope(parsed)).toBe(false)
  })

  it('parses direct disappearing timer control envelopes', () => {
    const parsed = parseDirectEnvelope(
      JSON.stringify({
        v: 2,
        type: 'disappearing_timer',
        timer: {
          durationMs: 30_000,
          trigger: 'after_read',
          fallbackDurationMs: 60 * 60 * 1000,
        },
        updatedAt: 12345,
      }),
    )

    expect(parsed).toEqual({
      type: 'disappearing_timer',
      timer: {
        durationMs: 30_000,
        trigger: 'after_read',
        fallbackDurationMs: 60 * 60 * 1000,
      },
      updatedAt: 12345,
    })
    expect(isControlEnvelope(parsed)).toBe(true)
  })

  it('parses crypto payment requests as visible envelopes', () => {
    const parsed = parseDirectEnvelope(JSON.stringify({
      v: 2,
      type: 'crypto_payment_request',
      requestId: 'request-1',
      network: 'mozaga',
      symbol: 'EXO',
      amount: '1',
      decimals: 18,
      recipientAddress: 'EXO_RECEIVER',
      assetType: 'native',
      createdAt: 123,
      state: 'open',
    }))

    expect(parsed).toMatchObject({
      type: 'crypto_payment_request',
      request: {
        requestId: 'request-1',
        amount: '1',
        symbol: 'EXO',
      },
    })
    expect(isControlEnvelope(parsed)).toBe(false)
  })

  it('parses crypto payment request updates as hidden controls', () => {
    const parsed = parseDirectEnvelope(JSON.stringify({
      v: 2,
      type: 'crypto_payment_request_update',
      requestId: 'request-1',
      network: 'mozaga',
      symbol: 'EXO',
      amount: '1',
      txHash: 'abc123',
      status: 'confirmed',
      paidAt: 456,
    }))

    expect(parsed).toMatchObject({
      type: 'crypto_payment_request_update',
      update: {
        requestId: 'request-1',
        txHash: 'abc123',
      },
    })
    expect(isControlEnvelope(parsed)).toBe(true)
  })

  it('preserves updatedAt on hidden screenshot and Tor state envelopes', () => {
    expect(parseDirectEnvelope(JSON.stringify({
      v: 2,
      type: 'screenshot_protection',
      enabled: true,
      updatedAt: 123,
    }))).toEqual({
      type: 'screenshot_protection',
      enabled: true,
      updatedAt: 123,
    })

    expect(parseDirectEnvelope(JSON.stringify({
      v: 2,
      type: 'tor_state',
      enabled: false,
      updatedAt: 456,
    }))).toEqual({
      type: 'tor_state',
      enabled: false,
      updatedAt: 456,
    })
  })

  it('parses bounded BLE route capabilities only as hidden controls', () => {
    const capability = 'A'.repeat(144)
    const parsed = parseDirectEnvelope(JSON.stringify({
      v: 2,
      type: 'ble_route_capability',
      capability,
    }))

    expect(parsed).toEqual({
      type: 'ble_route_capability',
      capability,
    })
    expect(isControlEnvelope(parsed)).toBe(true)
    expect(parseDirectEnvelope(JSON.stringify({
      v: 2,
      type: 'ble_route_capability',
      capability: 'too-short',
    }))).toMatchObject({
      type: 'hidden_control',
    })
  })
})
