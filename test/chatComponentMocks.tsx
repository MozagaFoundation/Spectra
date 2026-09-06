/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import type { ReactTestInstance } from 'react-test-renderer'
import { Text, View } from 'react-native'
import type { ChatMessage, Conversation, MediaAttachment } from '@/lib/types'

export const chatTestColors = {
  background: '#000000',
  backgroundSecondary: '#050505',
  backgroundTertiary: '#101010',
  border: '#222222',
  borderLight: '#333333',
  card: '#111111',
  error: '#ff4d4f',
  info: '#4aa3ff',
  messageReceived: '#1f2937',
  messageSent: '#00ff99',
  overlay: 'rgba(0,0,0,0.5)',
  primary: '#00ff99',
  success: '#20c997',
  surface: '#111111',
  text: '#ffffff',
  textMuted: '#999999',
  textOnPrimary: '#000000',
  textSecondary: '#cccccc',
  textTertiary: '#777777',
  warning: '#ffaa00',
}

export function translateForChatTest(key: string, values?: Record<string, unknown>): string {
  if (!values) return key

  return Object.entries(values).reduce(
    (result, [name, value]) => result.replace(new RegExp(`{{${name}}}`, 'g'), String(value)),
    key,
  )
}

export function TestChatIcon() {
  return null
}

export function TestChatAvatar({
  name,
  imageUrl,
}: {
  name?: string
  imageUrl?: string | null
}) {
  return (
    <View testID="avatar" accessibilityLabel={imageUrl ?? undefined}>
      <Text>{name || 'Avatar'}</Text>
    </View>
  )
}

export function createChatMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderId: 'identity-alice',
    content: 'Hello from chat',
    timestamp: 1_717_171_717_000,
    status: 'sent',
    signatureVerified: true,
    ...overrides,
  }
}

export function createConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conversation-1',
    remoteIdentityId: 'identity-alice',
    remoteWalletAddress: 'EXO_ALICE_ADDRESS',
    displayName: 'Alice',
    lastMessage: {
      content: 'Last message',
      isOwn: false,
      timestamp: 1_717_171_717_000,
    },
    unreadCount: 0,
    createdAt: 1_717_171_700_000,
    ...overrides,
  }
}

export function createMediaAttachment(overrides: Partial<MediaAttachment> = {}): MediaAttachment {
  return {
    id: 'attachment-1',
    type: 'image',
    uri: 'file:///tmp/image.jpg',
    source: 'gallery',
    fileName: 'image.jpg',
    mimeType: 'image/jpeg',
    fileSize: 1024,
    width: 100,
    height: 100,
    ...overrides,
  }
}

export function testNodeText(node: ReactTestInstance | string): string {
  if (typeof node === 'string') return node

  return node.children.map((child) => (
    typeof child === 'string'
      ? child
      : testNodeText(child as ReactTestInstance)
  )).join('')
}

export function findPressableByText(root: ReactTestInstance, text: string | RegExp): ReactTestInstance {
  const matches = root.findAllByType('Pressable' as any).filter((node) => {
    const content = testNodeText(node)
    return typeof text === 'string' ? content.includes(text) : text.test(content)
  })
  const match = matches.sort((left, right) => testNodeText(left).length - testNodeText(right).length)[0]

  if (!match) {
    throw new Error(`Missing pressable containing ${String(text)}`)
  }

  return match
}
