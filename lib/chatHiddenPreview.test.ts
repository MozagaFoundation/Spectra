/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { isHiddenConversationPreview } from './chatHiddenPreview'

describe('isHiddenConversationPreview', () => {
  it('hides only supported control-message preview envelopes', () => {
    for (const type of [
      'reaction',
      'deletion',
      'conversation_delete',
      'view_once_consumed',
      'disappearing_timer',
      'crypto_payment_request_update',
      'group_sender_key_distribution',
      'group_sender_key_request',
      'group_ciphertext',
      'screenshot_protection',
      'tor_state',
      'group_tor_state',
      'ble_route_capability',
    ]) {
      expect(isHiddenConversationPreview(JSON.stringify({ v: 2, type }))).toBe(true)
    }
  })

  it('keeps visible message-like, old-version, malformed, and non-object content visible', () => {
    expect(isHiddenConversationPreview(JSON.stringify({ v: 2, type: 'text' }))).toBe(false)
    expect(isHiddenConversationPreview(JSON.stringify({ v: 1, type: 'reaction' }))).toBe(false)
    expect(isHiddenConversationPreview('{not json')).toBe(false)
    expect(isHiddenConversationPreview('hello')).toBe(false)
    expect(isHiddenConversationPreview('["reaction"]')).toBe(false)
  })

  it('hides escaped or double-encoded control previews from persisted rows', () => {
    const update = JSON.stringify({ v: 2, type: 'crypto_payment_request_update', requestId: 'request-1' })

    expect(isHiddenConversationPreview(update.replace(/"/g, '\\"'))).toBe(true)
    expect(isHiddenConversationPreview(JSON.stringify(update))).toBe(true)
    expect(isHiddenConversationPreview(`  ${update}  `)).toBe(true)
  })

  it('hides truncated BLE capability previews written by legacy persistence', () => {
    const truncated = `{"capability":"${'A'.repeat(85)}`

    expect(truncated).toHaveLength(100)
    expect(isHiddenConversationPreview(truncated)).toBe(true)
    expect(isHiddenConversationPreview(truncated.replace(/"/g, '\\"'))).toBe(true)
    expect(isHiddenConversationPreview('{"capability":"short user text')).toBe(false)
  })

  it('bounds JSON parsing work by content length', () => {
    const prefix = '{"v":2,"type":"reaction","padding":"'
    const suffix = '"}'
    const maxParseable = `${prefix}${'x'.repeat(4096 - prefix.length - suffix.length)}${suffix}`
    const oversized = `${maxParseable} `

    expect(maxParseable.length).toBe(4096)
    expect(oversized.length).toBe(4097)
    expect(isHiddenConversationPreview(maxParseable)).toBe(true)
    expect(isHiddenConversationPreview(oversized)).toBe(false)
  })
})
