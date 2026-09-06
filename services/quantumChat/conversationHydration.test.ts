/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  buildLastMessageFromStoredMessage,
  findLastHydratableConversationPreview,
  mapStoredConversationLastMessage,
  pickPreferredConversationLastMessage,
  resolveLocalConversationDisplayName,
} from './conversationHydration'

vi.mock('react-native', () => ({
  NativeModules: {},
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => (
      options.ios ?? options.native ?? options.default ?? undefined
    ),
  },
  TurboModuleRegistry: {
    get: vi.fn(() => null),
    getEnforcing: vi.fn(() => ({})),
  },
}))

vi.mock('@/lib/i18n', () => ({
  translate: (key: string) => key,
}))

describe('conversationHydration', () => {
  it('prefers a local contact alias over cached alphanumeric display fallbacks', () => {
    const displayName = resolveLocalConversationDisplayName({
      remoteIdentityId: 'identity-alice',
      remoteWalletAddress: 'EXO00alice0000000000000000000000000000000000',
      storedDisplayName: 'EXO00a...000000',
    }, [
      {
        identityId: 'identity-alice',
        walletAddress: 'EXO00alice0000000000000000000000000000000000',
        displayName: 'alice',
        addedAt: 1,
      },
    ])

    expect(displayName).toBe('alice')
  })

  it('falls back to stored display name before formatting identity values', () => {
    const displayName = resolveLocalConversationDisplayName({
      remoteIdentityId: 'identity-bob-123456789',
      storedDisplayName: 'bob',
    }, [])

    expect(displayName).toBe('bob')
  })

  it('builds a cached preview from a decrypted sender identity', () => {
    expect(buildLastMessageFromStoredMessage({
      content: 'Hello brother',
      timestamp: 10,
      senderIdentityId: 'identity-alice',
    }, 'identity-me')).toEqual({
      content: 'Hello brother',
      timestamp: 10,
      isOwn: false,
    })
  })

  it('selects the newest previewable message from sorted durable history', () => {
    const messages = [
      { id: 'older', content: 'Older', timestamp: 10, senderId: 'identity-alice' },
      { id: 'newer', content: 'Newer', timestamp: 20, senderId: 'identity-alice' },
      {
        id: 'control',
        content: JSON.stringify({
          v: 2,
          type: 'reaction',
          reaction: { targetMessageId: 'newer', emoji: ':)' },
        }),
        timestamp: 30,
        senderId: 'identity-alice',
      },
    ]

    const result = findLastHydratableConversationPreview(
      messages,
      (message) => buildLastMessageFromStoredMessage(message, 'identity-me') ?? null,
    )

    expect(result).toEqual({
      message: messages[1],
      preview: { content: 'Newer', timestamp: 20, isOwn: false },
    })
  })

  it('skips hidden stored last messages and keeps newer previews', () => {
    const hidden = mapStoredConversationLastMessage({
      content: JSON.stringify({ v: 2, type: 'deletion', deletionTarget: 'message-1' }),
      timestamp: 30,
      senderId: 'identity-alice',
    }, 'identity-me')

    expect(hidden).toBeUndefined()
    expect(pickPreferredConversationLastMessage(
      { content: 'Existing preview', timestamp: 40, isOwn: true },
      { content: 'Older preview', timestamp: 10, isOwn: false },
    )).toEqual({ content: 'Existing preview', timestamp: 40, isOwn: true })
  })

  it('repairs legacy truncated BLE previews from the prior visible message', () => {
    const messages = [
      { content: 'Previous text', timestamp: 10, senderId: 'identity-alice' },
      {
        content: `{"capability":"${'A'.repeat(85)}`,
        timestamp: 20,
        senderId: 'identity-alice',
      },
    ]

    expect(mapStoredConversationLastMessage(messages[1], 'identity-me')).toBeUndefined()
    expect(findLastHydratableConversationPreview(
      messages,
      (message) => buildLastMessageFromStoredMessage(message, 'identity-me') ?? null,
    )).toEqual({
      message: messages[0],
      preview: { content: 'Previous text', timestamp: 10, isOwn: false },
    })
  })

  it('skips persisted hidden-control messages even if their content is malformed', () => {
    expect(buildLastMessageFromStoredMessage({
      content: '{malformed control',
      messageKind: 'hidden_control',
      timestamp: 10,
      senderId: 'identity-alice',
    }, 'identity-me')).toBeUndefined()
  })

  it('keeps the runtime preview when hydration races at the same timestamp', () => {
    const runtimePreview = { content: 'Live message', timestamp: 40, isOwn: false }

    expect(pickPreferredConversationLastMessage(
      runtimePreview,
      { content: 'Stale hydration', timestamp: 40, isOwn: false },
    )).toBe(runtimePreview)
  })
})
