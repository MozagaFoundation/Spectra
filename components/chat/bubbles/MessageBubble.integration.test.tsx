/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  bubbleMocks,
  createAttachment,
  createMessage,
  fireEvent,
  nearestPressable,
  render,
  resetBubbleMocks,
  screen,
  textContent,
} from './testUtils'

describe('MessageBubble attachment integration', () => {
  let MessageBubble: typeof import('../MessageBubble').MessageBubble

  beforeEach(async () => {
    resetBubbleMocks()
    ;({ MessageBubble } = await import('../MessageBubble'))
  })

  it('hydrates encrypted attachments through the real bubble prepare callback', async () => {
    const attachment = createAttachment({
      id: 'encrypted-image',
      uri: '',
      isEncrypted: true,
    })
    const message = createMessage({
      id: 'message-1',
      content: '',
      attachments: [attachment],
      conversationType: 'direct',
    })
    const preparedAttachment = {
      ...attachment,
      uri: 'file:///cache/encrypted-image.jpg',
      isEncrypted: false,
    }

    bubbleMocks.chatStore.messages = [message]
    bubbleMocks.hydrateMessageAttachment.mockResolvedValue(preparedAttachment)

    render(
      <MessageBubble
        message={message}
        isOwn={false}
        contactName="Alice"
      />,
    )

    const loadLabel = screen.getAllByText('Tap to load image')
      .find((node) => String(node.type) === 'Text' && textContent(node) === 'Tap to load image')
    expect(loadLabel).toBeTruthy()

    await fireEvent.press(nearestPressable(loadLabel!))

    expect(bubbleMocks.hydrateMessageAttachment).toHaveBeenCalledWith(
      'message-1',
      'conversation-1',
      attachment,
      expect.objectContaining({
        conversationId: 'conversation-1',
        messageId: 'message-1',
        source: 'messageBubble.prepareDirectAttachment',
      }),
    )
    expect(bubbleMocks.chatStore.updateMessage).toHaveBeenCalledWith('message-1', {
      attachments: [preparedAttachment],
    })
  })
})
