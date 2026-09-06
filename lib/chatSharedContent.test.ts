/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

const parseLinksMock = vi.hoisted(() => vi.fn((content: string): Array<{ type: 'text' | 'link'; content: string }> => {
  const match = content.match(/https?:\/\/\S+/)
  if (!match) {
    return [{ type: 'text', content }]
  }

  const parts: Array<{ type: 'text' | 'link'; content: string }> = [
    { type: 'text', content: content.slice(0, match.index) },
    { type: 'link', content: match[0] },
    { type: 'text', content: content.slice((match.index ?? 0) + match[0].length) },
  ]

  return parts.filter((part) => part.content.length > 0)
}))

vi.mock('@/lib/utils', () => ({
  parseLinks: parseLinksMock,
}))

import {
  getDirectConversationIds,
  getDirectConversationMessages,
  getDirectConversationSharedContentSummary,
  getSharedChatContent,
} from './chatSharedContent'
import type { ChatMessage, Conversation } from './types/messaging'
import type { MediaAttachment } from './types/media'

const imageAttachment: MediaAttachment = {
  id: 'image-1',
  type: 'image',
  uri: 'file:///image-1.jpg',
  fileName: 'image-1.jpg',
  mimeType: 'image/jpeg',
  fileSize: 10,
}

const documentAttachment: MediaAttachment = {
  id: 'doc-1',
  type: 'document',
  uri: 'file:///doc.pdf',
  fileName: 'doc.pdf',
  mimeType: 'application/pdf',
  fileSize: 10,
}

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'message',
    conversationId: 'conversation-1',
    senderId: 'remote',
    content: '',
    timestamp: 1,
    ...overrides,
  } as ChatMessage
}

function conversation(overrides: Partial<Conversation>): Conversation {
  return {
    id: 'conversation-1',
    remoteIdentityId: 'identity-a',
    remoteWalletAddress: 'wallet-a',
    unreadCount: 0,
    createdAt: 1,
    ...overrides,
  } as Conversation
}

afterEach(() => {
  parseLinksMock.mockClear()
})

describe('direct conversation shared-content selection', () => {
  it('merges direct conversation ids by identity and wallet while skipping group threads', () => {
    const ids = getDirectConversationIds('identity-a', conversation({ id: 'conversation-current' }), [
      conversation({ id: 'conversation-same-identity', remoteIdentityId: 'identity-a' }),
      conversation({ id: 'conversation-same-wallet', remoteIdentityId: 'identity-b', remoteWalletAddress: 'wallet-a' }),
      conversation({ id: 'conversation-route-wallet', remoteIdentityId: 'identity-c', remoteWalletAddress: 'identity-a' }),
      conversation({ id: 'conversation-group', type: 'group', remoteIdentityId: 'identity-a' }),
    ])

    expect(Array.from(ids).sort()).toEqual([
      'conversation-current',
      'conversation-route-wallet',
      'conversation-same-identity',
      'conversation-same-wallet',
    ])
  })

  it('returns only matching direct messages sorted oldest to newest', () => {
    const messages = getDirectConversationMessages([
      message({ id: 'newer', conversationId: 'conversation-1', timestamp: 3 }),
      message({ id: 'other', conversationId: 'conversation-2', timestamp: 2 }),
      message({ id: 'older', conversationId: 'conversation-1', timestamp: 1 }),
    ], new Set(['conversation-1']))

    expect(messages.map((item) => item.id)).toEqual(['older', 'newer'])
    expect(getDirectConversationMessages([message({})], new Set()).length).toBe(0)
  })
})

describe('getDirectConversationSharedContentSummary', () => {
  it('counts shared content and keeps only recent attachment previews', () => {
    const messages: ChatMessage[] = [
      message({
        id: 'message-1',
        content: 'https://example.com',
        timestamp: 1,
      }),
      message({
        id: 'message-2',
        timestamp: 2,
        attachments: [{ ...imageAttachment, id: 'attachment-1' }],
      }),
      message({
        id: 'message-3',
        conversationId: 'conversation-2',
        timestamp: 3,
        attachments: [{ ...imageAttachment, id: 'attachment-2' }],
      }),
      message({
        id: 'message-4',
        timestamp: 4,
        attachments: [{ ...documentAttachment, id: 'attachment-3' }],
      }),
    ]

    const summary = getDirectConversationSharedContentSummary(
      messages,
      new Set(['conversation-1']),
      1,
    )

    expect(summary.totalCount).toBe(3)
    expect(summary.attachmentPreviews).toEqual([
      expect.objectContaining({
        key: 'message-4:attachment-3',
        createdAt: 4,
      }),
    ])
  })

  it('skips deleted and one-time attachments but still counts visible links', () => {
    const summary = getDirectConversationSharedContentSummary([
      message({ id: 'deleted', deleted: true, attachments: [imageAttachment], content: 'https://deleted.example' }),
      message({ id: 'one-time', oneTime: { kind: 'image', state: 'locked' }, attachments: [imageAttachment] }),
      message({ id: 'link', content: 'see https://example.com' }),
    ], new Set(['conversation-1']))

    expect(summary.totalCount).toBe(1)
    expect(summary.attachmentPreviews).toEqual([])
  })
})

describe('getSharedChatContent', () => {
  it('classifies media, documents, and links while sorting newest first', () => {
    const shared = getSharedChatContent([
      message({
        id: 'older',
        timestamp: 1,
        attachments: [imageAttachment],
        content: 'older https://older.example',
      }),
      message({
        id: 'newer',
        timestamp: 2,
        attachments: [documentAttachment],
        content: 'newer https://newer.example',
      }),
      message({
        id: 'deleted',
        timestamp: 3,
        deleted: true,
        attachments: [imageAttachment],
        content: 'https://deleted.example',
      }),
      message({
        id: 'one-time',
        timestamp: 4,
        oneTime: { kind: 'image', state: 'locked' },
        attachments: [imageAttachment],
      }),
    ])

    expect(shared.media.map((item) => item.messageId)).toEqual(['older'])
    expect(shared.docs.map((item) => item.messageId)).toEqual(['newer'])
    expect(shared.links.map((item) => item.url)).toEqual(['https://newer.example', 'https://older.example'])
  })

  it('does not invoke link parsing on oversized message content', () => {
    const oversizedContent = `https://example.com/${'x'.repeat(8192)}`

    expect(getSharedChatContent([message({ content: oversizedContent })]).links).toEqual([])
    expect(getDirectConversationSharedContentSummary(
      [message({ content: oversizedContent })],
      new Set(['conversation-1']),
    ).totalCount).toBe(0)
    expect(parseLinksMock).not.toHaveBeenCalled()
  })
})
