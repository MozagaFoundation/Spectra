/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  createMessage,
  fireEvent,
  nearestPressable,
  render,
  resetBubbleMocks,
  screen,
} from './testUtils'

describe('presentational chat bubbles', () => {
  let CallInvitationBubble: typeof import('./CallInvitationBubble').CallInvitationBubble
  let CryptoReceiptBubble: typeof import('./CryptoReceiptBubble').CryptoReceiptBubble
  let InlineStreamingStatus: typeof import('./InlineStreamingStatus').InlineStreamingStatus
  let ReactionsBar: typeof import('./ReactionsBar').ReactionsBar
  let ReplyPreview: typeof import('./ReplyPreview').ReplyPreview

  beforeEach(async () => {
    resetBubbleMocks()
    ;({ CallInvitationBubble } = await import('./CallInvitationBubble'))
    ;({ CryptoReceiptBubble } = await import('./CryptoReceiptBubble'))
    ;({ InlineStreamingStatus } = await import('./InlineStreamingStatus'))
    ;({ ReactionsBar } = await import('./ReactionsBar'))
    ;({ ReplyPreview } = await import('./ReplyPreview'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders reply previews as pressable quoted text when a handler is supplied', async () => {
    const onPress = vi.fn()
    render(
      <ReplyPreview
        replyTo={{
          messageId: 'reply-1',
          senderId: 'sender-1',
          senderName: 'Alice',
          previewText: 'quoted text',
        }}
        isOwn={false}
        onPress={onPress}
      />,
    )

    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('quoted text')).toBeTruthy()

    await fireEvent.press(nearestPressable(screen.getByText('quoted text')))

    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('groups duplicate reactions without rendering empty reaction bars', () => {
    const empty = render(
      React.createElement('View', null, <ReactionsBar reactions={[]} isOwn={false} />),
    )
    expect(empty.root.findAll((node) => String(node.type) === 'Text')).toHaveLength(0)
    empty.unmount()

    render(
      <ReactionsBar
        isOwn={false}
        reactions={[
          { emoji: '👍', senderId: 'alice', timestamp: 1 },
          { emoji: '👍', senderId: 'bob', timestamp: 2 },
          { emoji: '🔥', senderId: 'cara', timestamp: 3 },
        ]}
      />,
    )

    expect(screen.getByText('👍')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    expect(screen.getByText('🔥')).toBeTruthy()
  })

  it('animates streaming status dots without duplicating caller-provided ellipses', () => {
    vi.useFakeTimers()
    render(<InlineStreamingStatus text="Thinking..." isOwn={false} />)

    expect(screen.getByText('Thinking.')).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(450)
    })

    expect(screen.getByText('Thinking..')).toBeTruthy()
  })

  it('renders call invitation labels by call type and direction', () => {
    render(<CallInvitationBubble isOwn={false} callType="video" timestamp={1} />)
    expect(screen.getByText('Incoming video call')).toBeTruthy()
    expect(screen.getByText('End-to-end encrypted · 12:00 AM')).toBeTruthy()

    render(<CallInvitationBubble isOwn callType="voice" timestamp={1} />)
    expect(screen.getByText('Voice call started')).toBeTruthy()
  })

  it('uses the transfer symbol in crypto receipts and truncates long hashes', () => {
    render(
      <CryptoReceiptBubble
        isOwn
        senderName="Alice"
        symbol="EXO"
        amount="42"
        txHash="abcdef1234567890fedcba"
        recipientName="Bob"
        timestamp={1}
      />,
    )

    expect(() => screen.getByText('$')).toThrow()
    expect(screen.getByText('42 EXO')).toBeTruthy()
    expect(screen.getByText('abcdef12...90fedcba')).toBeTruthy()
    expect(screen.getByText('You sent to Bob')).toBeTruthy()
  })

  it('renders reaction-compatible message data shape', () => {
    const message = createMessage({
      reactions: [{ emoji: '✅', senderId: 'auditor', timestamp: 1 }],
    })

    render(<ReactionsBar reactions={message.reactions!} isOwn />)

    expect(screen.getByText('✅')).toBeTruthy()
  })
})
