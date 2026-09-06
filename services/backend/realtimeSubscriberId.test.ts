/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  createRealtimeSubscriberId,
  isValidRealtimeSubscriberId,
  normalizeRealtimeSubscriberId,
  REALTIME_SUBSCRIBER_ID_MAX_LENGTH,
  REALTIME_SUBSCRIBER_ID_PATTERN,
} from './realtimeSubscriberId'

describe('realtime subscriber IDs', () => {
  it('normalizes server-invalid delimiters and bounds the result', () => {
    const normalized = normalizeRealtimeSubscriberId(
      `  chat:\0primary:${'scope'.repeat(40)}  `,
    )

    expect(normalized).toMatch(REALTIME_SUBSCRIBER_ID_PATTERN)
    expect(normalized.length).toBe(REALTIME_SUBSCRIBER_ID_MAX_LENGTH)
    expect(normalized).not.toContain(':')
    expect(normalizeRealtimeSubscriberId(':\0 \t')).toBe('realtime')
  })

  it('creates bounded unique IDs without copying sensitive scope identifiers', () => {
    const sensitiveValue = 'identity-secret-value'
    const ids = Array.from(
      { length: 256 },
      () => createRealtimeSubscriberId('chat-primary'),
    )

    expect(new Set(ids)).toHaveLength(ids.length)
    for (const subscriberId of ids) {
      expect(isValidRealtimeSubscriberId(subscriberId)).toBe(true)
      expect(subscriberId.length).toBeLessThanOrEqual(REALTIME_SUBSCRIBER_ID_MAX_LENGTH)
      expect(subscriberId).not.toContain(':')
      expect(subscriberId).not.toContain(sensitiveValue)
    }
  })

  it('rejects values outside the server contract', () => {
    expect(isValidRealtimeSubscriberId('subscriber-1')).toBe(true)
    expect(isValidRealtimeSubscriberId('subscriber:1')).toBe(false)
    expect(isValidRealtimeSubscriberId('subscriber 1')).toBe(false)
    expect(isValidRealtimeSubscriberId('subscriber\0id')).toBe(false)
    expect(isValidRealtimeSubscriberId('x'.repeat(129))).toBe(false)
    expect(isValidRealtimeSubscriberId('')).toBe(false)
  })
})
