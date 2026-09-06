/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  act,
  bubbleMocks,
  createAttachment,
  createMessage,
  fireEvent,
  nearestPressable,
  render,
  resetBubbleMocks,
  screen,
} from './testUtils'

describe('ViewOnceMessageContent', () => {
  let ViewOnceMessageContent: typeof import('./ViewOnceMessageContent').ViewOnceMessageContent

  beforeEach(async () => {
    resetBubbleMocks()
    ;({ ViewOnceMessageContent } = await import('./ViewOnceMessageContent'))
  })

  it('reveals text once and consumes it only when the viewer closes', async () => {
    const message = createMessage({
      content: 'locked preview',
      oneTime: { kind: 'text', state: 'locked', requiresReveal: true },
    })
    const onReveal = vi.fn(async () => ({
      kind: 'text' as const,
      content: 'secret text',
    }))
    const onConsume = vi.fn()

    render(
      <ViewOnceMessageContent
        message={message}
        isOwn={false}
        onReveal={onReveal}
        onConsume={onConsume}
      />,
    )

    await fireEvent.press(nearestPressable(screen.getByText('One-time message  ·  Tap to open')))

    const textViewer = screen.getByTestId('view-once-text-viewer')
    expect(textViewer.props.visible).toBe(true)
    expect(screen.getByText('secret text')).toBeTruthy()
    expect(onConsume).not.toHaveBeenCalled()

    act(() => {
      textViewer.props.onClose()
    })

    expect(onConsume).toHaveBeenCalledWith(message)
  })

  it('prepares one-time images, opens the lightbox with export disabled, then consumes on close', async () => {
    const lockedAttachment = createAttachment({
      uri: '',
      isEncrypted: true,
      isViewOnce: true,
    })
    const message = createMessage({
      content: '',
      attachments: [lockedAttachment],
      oneTime: { kind: 'image', state: 'locked', requiresReveal: true },
    })
    const preparedAttachment = {
      ...lockedAttachment,
      uri: 'file:///cache/one-time.jpg',
      isEncrypted: false,
    }
    const onReveal = vi.fn(async () => ({
      kind: 'image' as const,
      content: '',
      attachments: [lockedAttachment],
    }))
    const onPrepareAttachment = vi.fn(async () => preparedAttachment)
    const onConsume = vi.fn()

    render(
      <ViewOnceMessageContent
        message={message}
        isOwn={false}
        onReveal={onReveal}
        onPrepareAttachment={onPrepareAttachment}
        onConsume={onConsume}
      />,
    )

    await fireEvent.press(nearestPressable(screen.getByText('One-time message  ·  Tap to open')))

    const lightbox = screen.getByTestId('media-lightbox')
    expect(lightbox.props).toMatchObject({
      visible: true,
      uri: 'file:///cache/one-time.jpg',
      mediaType: 'image',
      allowExport: false,
    })

    act(() => {
      lightbox.props.onClose()
    })

    expect(onConsume).toHaveBeenCalledWith(message)
  })

  it('does not open or consume one-time attachments that prepare to untrusted URIs', async () => {
    const lockedAttachment = createAttachment({
      type: 'voice_note',
      uri: '',
      fileName: 'voice.m4a',
      mimeType: 'audio/m4a',
      isEncrypted: true,
      isViewOnce: true,
    })
    const message = createMessage({
      content: '',
      attachments: [lockedAttachment],
      oneTime: { kind: 'voice_note', state: 'locked', requiresReveal: true },
    })
    const onPrepareAttachment = vi.fn(async () => ({
      ...lockedAttachment,
      uri: 'https://evil.example/voice.m4a',
      isEncrypted: false,
    }))
    const onConsume = vi.fn()

    render(
      <ViewOnceMessageContent
        message={message}
        isOwn={false}
        onPrepareAttachment={onPrepareAttachment}
        onConsume={onConsume}
      />,
    )

    await fireEvent.press(nearestPressable(screen.getByText('One-time message  ·  Tap to open')))

    expect(bubbleMocks.alert.alert).toHaveBeenCalledWith(
      'Unable to open message',
      'This one-time attachment is not available right now.',
    )
    expect(screen.queryByTestId('view-once-voice-viewer')).toBeNull()
    expect(onConsume).not.toHaveBeenCalled()
  })
})
