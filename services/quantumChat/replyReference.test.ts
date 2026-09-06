/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { normalizeReplyReference } from './replyReference'

describe('normalizeReplyReference', () => {
  it('returns a normalized copy without mutating the input', () => {
    const originalReplyReference = Object.freeze({
      messageId: 'message-1',
      previewText: 'Hello there',
      senderName: 'You',
      senderId: 'remote-identity',
    })

    const normalizedReplyReference = normalizeReplyReference(
      originalReplyReference,
      'Alice',
      'local-identity',
    )

    expect(normalizedReplyReference).toEqual({
      ...originalReplyReference,
      senderName: 'Alice',
    })
    expect(originalReplyReference.senderName).toBe('You')
  })

  it('maps local replies back to "You"', () => {
    const normalizedReplyReference = normalizeReplyReference(
      {
        messageId: 'message-2',
        previewText: 'Hi',
        senderName: 'Alice',
        senderId: 'local-identity',
      },
      'Alice',
      'local-identity',
    )

    expect(normalizedReplyReference?.senderName).toBe('You')
  })
})
