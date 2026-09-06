/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

import { getIncomingDirectOrderTimestamp } from './directMessageProjection'

describe('direct message projection ordering', () => {
  it('keeps delayed relay messages ordered by their message timestamp', () => {
    const fallback = vi.fn(() => 5000)

    expect(getIncomingDirectOrderTimestamp({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'remote-identity',
      content: '1',
      timestamp: 1000,
      signatureVerified: true,
      serverSequence: 10,
    }, fallback)).toBe(1000)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('uses a monotonic fallback for non-relay direct messages', () => {
    const fallback = vi.fn(() => 5000)

    expect(getIncomingDirectOrderTimestamp({
      id: 'message-ble',
      conversationId: 'conversation-1',
      senderId: 'remote-identity',
      content: 'nearby',
      timestamp: 1000,
      signatureVerified: true,
    }, fallback)).toBe(5000)
    expect(fallback).toHaveBeenCalledWith(1000)
  })
})
