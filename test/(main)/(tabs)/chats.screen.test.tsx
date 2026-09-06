/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { isHiddenConversationPreview } from '@/lib/chatHiddenPreview'

describe('ChatsScreen hidden system previews', () => {
  it('hides only known internal control-message previews', () => {
    expect(isHiddenConversationPreview(JSON.stringify({ v: 2, type: 'reaction' }))).toBe(true)
    expect(isHiddenConversationPreview(JSON.stringify({ v: 2, type: 'deletion' }))).toBe(true)
    expect(isHiddenConversationPreview(JSON.stringify({ v: 2, type: 'crypto_payment_request_update' }))).toBe(true)
    expect(isHiddenConversationPreview(JSON.stringify({ v: 2, type: 'group_sender_key_request' }))).toBe(true)
    expect(isHiddenConversationPreview(JSON.stringify({ v: 2, type: 'text' }))).toBe(false)
    expect(isHiddenConversationPreview('hello')).toBe(false)
  })

  it('treats malformed or oversized previews as visible instead of blocking the UI thread', () => {
    expect(isHiddenConversationPreview('{not json')).toBe(false)
    expect(isHiddenConversationPreview(`{"v":2,"type":"reaction","padding":"${'x'.repeat(5000)}"}`)).toBe(false)
  })
})

