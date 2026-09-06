/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  buildSealedMessagePushPayload,
  isLegacySealedMessagePushData,
  isNotificationEventId,
  isNotificationScopeId,
  normalizeSealedMessagePushData,
} from './pushPayload'

describe('pushPayload', () => {
  const scopeId = 'nsc1.0123456789abcdef0123456789abcdef'
  const eventId = 'nev1.fedcba9876543210fedcba9876543210'

  it('accepts only versioned 128-bit opaque identifiers', () => {
    expect(isNotificationScopeId(scopeId)).toBe(true)
    expect(isNotificationEventId(eventId)).toBe(true)
    expect(isNotificationScopeId('EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false)
    expect(isNotificationEventId('message-1')).toBe(false)
  })

  it('builds a sealed-message wakeup with opaque routing only', () => {
    expect(buildSealedMessagePushPayload(scopeId, eventId)).toEqual({
      title: 'Spectra',
      body: 'New encrypted message',
      data: {
        notificationScopeId: scopeId,
        notificationEventId: eventId,
      },
    })
  })

  it('allows a localized generic copy without adding it to routing data', () => {
    expect(buildSealedMessagePushPayload(scopeId, eventId, {
      title: 'Spectra',
      body: 'Nuevo mensaje cifrado',
    })).toEqual({
      title: 'Spectra',
      body: 'Nuevo mensaje cifrado',
      data: {
        notificationScopeId: scopeId,
        notificationEventId: eventId,
      },
    })
  })

  it('fails closed when routing identifiers are missing or malformed', () => {
    expect(normalizeSealedMessagePushData({
      type: 'sealed_direct_message',
      notificationScopeId: scopeId,
    })).toBeNull()
    expect(normalizeSealedMessagePushData({
      type: 'sealed_direct_message',
      notificationScopeId: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      notificationEventId: eventId,
    })).toBeNull()
    expect(() => buildSealedMessagePushPayload(scopeId, 'message-1')).toThrow()
  })

  it('recognizes only the rollout type-only legacy wakeup', () => {
    expect(isLegacySealedMessagePushData({ type: 'sealed_direct_message' })).toBe(true)
    expect(isLegacySealedMessagePushData({
      type: 'sealed_direct_message',
      notificationScopeId: 'malformed',
      notificationEventId: eventId,
    })).toBe(false)
    expect(isLegacySealedMessagePushData({
      type: 'sealed_direct_message',
      walletAddress: 'EXO_ROOT',
    })).toBe(false)
  })
})
