/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChatMessage, createMediaAttachment, findPressableByText } from '@/test/chatComponentMocks'

const mockState = vi.hoisted(() => ({
  hydrateMessageAttachment: vi.fn(async (_messageId: string, _conversationId: string, attachment: any) => ({
    ...attachment,
    uri: 'file:///hydrated.bin',
  })),
  translatedKeys: [] as string[],
  stores: {
    groupMessages: {} as Record<string, any[]>,
    directMessages: [] as any[],
    updateDirectMessage: vi.fn(),
    updateGroupMessage: vi.fn(),
  },
  crypto: {
    isCryptoReceipt: vi.fn<(content: string) => boolean>(() => false),
    parseCryptoReceipt: vi.fn<(content: string) => any>(() => null),
  },
}))

vi.mock('lucide-react-native', async () => {
  const ReactActual = await import('react')
  const makeIcon = (name: string) => function Icon() {
    return ReactActual.createElement('Text', null, name)
  }
  return {
    AlertCircle: makeIcon('AlertCircle'),
    Check: makeIcon('Check'),
    CheckCheck: makeIcon('CheckCheck'),
    Clock: makeIcon('Clock'),
    Clock3: makeIcon('Clock3'),
    LoaderCircle: makeIcon('LoaderCircle'),
    Shield: makeIcon('Shield'),
    X: makeIcon('X'),
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/common', async () => {
  const { TestChatAvatar } = await import('../../test/chatComponentMocks')
  return { Avatar: TestChatAvatar }
})

vi.mock('@/lib/i18n', async () => {
  const { translateForChatTest } = await import('../../test/chatComponentMocks')
  return {
    translate: (key: string, values?: Record<string, unknown>) => {
      mockState.translatedKeys.push(key)
      return translateForChatTest(key, values)
    },
  }
})

vi.mock('@/lib/i18n/direction', () => ({
  getDirectionalTextStyle: () => ({}),
  useIsCurrentLanguageRtl: () => false,
}))

vi.mock('@/lib/theme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return {
    useThemeColors: () => chatTestColors,
  }
})

vi.mock('@/lib/constants', () => ({
  MESSAGE_FONT_SIZES: { normal: 16 },
}))

vi.mock('@/lib/utils', () => ({
  formatTime: () => '12:00',
  parseLinks: (value: string) => value.includes('https://')
    ? [
        { type: 'text', content: 'visit ' },
        { type: 'link', content: 'https://example.test' },
      ]
    : [{ type: 'text', content: value }],
}))

vi.mock('@/lib/disappearingMessages', () => ({
  formatDisappearingTimerDuration: () => '1m',
  getDisappearingMessageRemainingMs: () => 60_000,
}))

vi.mock('@/lib/viewOnce', () => ({
  isLockedOneTimeMessage: () => false,
}))

vi.mock('@/services/shared/callInvitationFormat', () => ({
  isCallInvitation: () => false,
  parseCallInvitation: () => null,
}))

vi.mock('@/services/crypto', () => ({
  isCryptoReceipt: mockState.crypto.isCryptoReceipt,
  parseCryptoReceipt: mockState.crypto.parseCryptoReceipt,
}))

vi.mock('@/services/crypto/receipts', () => ({
  isCryptoReceipt: mockState.crypto.isCryptoReceipt,
  parseCryptoReceipt: mockState.crypto.parseCryptoReceipt,
}))

vi.mock('@/services/media/attachmentHydration', () => ({
  hydrateMessageAttachment: mockState.hydrateMessageAttachment,
}))

vi.mock('@/store', () => {
  const useChatStore = (selector: (state: any) => unknown) => selector({
    messages: mockState.stores.directMessages,
    updateMessage: mockState.stores.updateDirectMessage,
  })
  useChatStore.getState = () => ({ messages: mockState.stores.directMessages })

  const useGroupChatStore = (selector: (state: any) => unknown) => selector({
    messages: mockState.stores.groupMessages,
    updateMessage: mockState.stores.updateGroupMessage,
  })
  useGroupChatStore.getState = () => ({ messages: mockState.stores.groupMessages })

  return {
    useChatStore,
    useGroupChatStore,
    useUIStore: (selector: (state: any) => unknown) => selector({ messageFontSize: 'normal' }),
  }
})

vi.mock('@/store/chatStore', () => {
  const useChatStore = (selector: (state: any) => unknown) => selector({
    messages: mockState.stores.directMessages,
    updateMessage: mockState.stores.updateDirectMessage,
  })
  useChatStore.getState = () => ({ messages: mockState.stores.directMessages })
  return { useChatStore }
})

vi.mock('@/store/groupChatStore', () => {
  const useGroupChatStore = (selector: (state: any) => unknown) => selector({
    messages: mockState.stores.groupMessages,
    updateMessage: mockState.stores.updateGroupMessage,
  })
  useGroupChatStore.getState = () => ({ messages: mockState.stores.groupMessages })
  return { useGroupChatStore }
})

vi.mock('@/store/uiStore', () => ({
  useUIStore: (selector: (state: any) => unknown) => selector({ messageFontSize: 'normal' }),
}))

vi.mock('./bubbles', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text, View } = await import('../../test/react-native')
  return {
    CallInvitationBubble: () => ReactActual.createElement(Text, null, 'Call invitation'),
    CryptoReceiptBubble: ({
      onLongPress,
      onPress,
      symbol,
    }: {
      onLongPress?: () => void
      onPress?: () => void
      symbol: string
    }) => ReactActual.createElement(
      Pressable,
      { onLongPress, onPress, testID: 'crypto-receipt' },
      ReactActual.createElement(Text, null, `Crypto receipt ${symbol}`),
    ),
    CryptoPaymentRequestBubble: ({
      onLongPress,
      onPress,
      request,
    }: {
      onLongPress?: () => void
      onPress?: () => void
      request: { symbol: string }
    }) => ReactActual.createElement(
      Pressable,
      { onLongPress, onPress, testID: 'crypto-payment-request' },
      ReactActual.createElement(Text, null, `Crypto payment request ${request.symbol}`),
    ),
    ReactionsBar: ({ reactions }: { reactions: Array<{ emoji: string }> }) => ReactActual.createElement(Text, null, reactions.map((reaction) => reaction.emoji).join('')),
    ReplyPreview: ({ replyTo, onPress }: { replyTo: { previewText: string }; onPress?: () => void }) => ReactActual.createElement(Pressable, { onPress, testID: 'reply-preview' }, ReactActual.createElement(Text, null, replyTo.previewText)),
    ViewOnceMessageContent: () => ReactActual.createElement(Text, null, 'View once'),
    renderAttachment: (
      attachment: { id: string; fileName: string },
      _isOwn: boolean,
      onPrepare?: () => Promise<unknown>,
      onEdit?: () => Promise<void> | void,
    ) => ReactActual.createElement(
      View,
      { key: attachment.id },
      ReactActual.createElement(
        Pressable,
        { onPress: onPrepare, testID: `attachment-${attachment.id}` },
        ReactActual.createElement(View, null, ReactActual.createElement(Text, null, attachment.fileName)),
      ),
      onEdit
        ? ReactActual.createElement(
            Pressable,
            { onPress: onEdit, testID: `edit-${attachment.id}` },
            ReactActual.createElement(Text, null, 'Edit image'),
          )
        : null,
    ),
  }
})

const { fireEvent, render } = await import('@testing-library/react-native')
const { MessageBubble } = await import('./MessageBubble')

describe('MessageBubble', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.stores.directMessages = []
    mockState.stores.groupMessages = {}
    mockState.crypto.isCryptoReceipt.mockReturnValue(false)
    mockState.crypto.parseCryptoReceipt.mockReturnValue(null)
    mockState.translatedKeys = []
  })

  it('renders verified peer text without enabling markdown', () => {
    const view = render(
      <MessageBubble
        message={createChatMessage({ content: 'visit https://example.test' })}
        isOwn={false}
        contactName="Alice"
      />,
    )

    expect(view.getByText('visit https://example.test')).toBeTruthy()
    expect(view.getByText('Shield')).toBeTruthy()
    expect(() => view.getByText('markdown:visit https://example.test')).toThrow()
  })

  it('keeps long sender labels on one truncated line', () => {
    const longName = 'A very long group sender name that must not expand into message metadata'
    const view = render(
      <MessageBubble
        message={createChatMessage({ content: 'hello' })}
        isOwn={false}
        contactName="Alice"
        senderName={longName}
      />,
    )

    const senderLabel = view.getAllByText(longName).find((node) => node.props.ellipsizeMode === 'tail')

    expect(senderLabel?.props.numberOfLines).toBe(1)
    expect(senderLabel?.props.ellipsizeMode).toBe('tail')
  })

  it('hides deleted messages and renders screenshot system messages as non-interactive notices', () => {
    const deletedView = render(
      <MessageBubble
        message={createChatMessage({ deleted: true })}
        isOwn={false}
        contactName="Alice"
      />,
    )
    expect(() => deletedView.getByText('This message was deleted')).toThrow()

    const systemView = render(
      <MessageBubble
        message={createChatMessage({ systemEvent: 'screenshot_taken' })}
        isOwn={false}
        contactName="Alice"
      />,
    )
    expect(systemView.getByText(/Alice took a screenshot/)).toBeTruthy()
  })

  it('does not render hidden control payload JSON as chat text', () => {
    const view = render(
      <MessageBubble
        message={createChatMessage({
          content: JSON.stringify({
            v: 2,
            type: 'crypto_payment_request_update',
            requestId: 'request-1',
            network: 'tron',
            symbol: 'TRX',
            amount: '1',
            txHash: '5125c5bb8506d120',
            status: 'pending',
            paidAt: 1778646807344,
          }),
          status: 'failed',
        })}
        isOwn
        contactName="Alice"
      />,
    )

    expect(() => view.getByText(/crypto_payment_request_update/)).toThrow()
    expect(() => view.getByText('Failed')).toThrow()
  })

  it('shows failed delivery icons for own messages and unverified trust state', () => {
    const view = render(
      <MessageBubble
        message={createChatMessage({
          content: 'failed',
          signatureVerified: false,
          status: 'failed',
        })}
        isOwn
        contactName="Alice"
      />,
    )

    expect(() => view.getByText('Failed')).toThrow()
    expect(view.getByText('X')).toBeTruthy()
    expect(view.getByText('AlertCircle')).toBeTruthy()
  })

  it('localizes known delivery hints without treating arbitrary errors as translation keys', () => {
    const localizedView = render(
      <MessageBubble
        message={createChatMessage({
          status: 'sending',
          deliveryStage: 'queued',
          deliveryHint: 'Queued nearby',
        })}
        isOwn
        contactName="Alice"
      />,
    )

    expect(localizedView.root.findByProps({ accessibilityLabel: 'Queued nearby' })).toBeTruthy()
    expect(mockState.translatedKeys).toContain('Queued nearby')

    mockState.translatedKeys = []
    const errorHint = 'Transport error: ECONNRESET'
    const errorView = render(
      <MessageBubble
        message={createChatMessage({
          status: 'failed',
          deliveryStage: 'failed',
          deliveryHint: errorHint,
        })}
        isOwn
        contactName="Alice"
      />,
    )

    expect(errorView.root.findByProps({ accessibilityLabel: errorHint })).toBeTruthy()
    expect(mockState.translatedKeys).not.toContain(errorHint)
  })

  it('retries failed own messages when the bubble is tapped', async () => {
    const onRetryFailedMessage = vi.fn()
    const message = createChatMessage({
      content: 'failed',
      status: 'failed',
    })
    const view = render(
      <MessageBubble
        message={message}
        isOwn
        contactName="Alice"
        onRetryFailedMessage={onRetryFailedMessage}
      />,
    )

    await fireEvent.press(findPressableByText(view.root, 'failed'))

    expect(onRetryFailedMessage).toHaveBeenCalledWith(message)
  })

  it('forwards crypto receipt taps with parsed chain metadata', async () => {
    const receipt = {
      amount: '1',
      chainId: 'ethereum',
      symbol: 'USDT',
      txHash: '0xabc123',
    }
    mockState.crypto.isCryptoReceipt.mockReturnValue(true)
    mockState.crypto.parseCryptoReceipt.mockReturnValue(receipt)
    const onCryptoReceiptPress = vi.fn()
    const onLongPress = vi.fn()
    const message = createChatMessage({ content: '[CRYPTO_TX_V2:ethereum:USDT:1:0xabc123]' })

    const view = render(
      <MessageBubble
        message={message}
        isOwn
        contactName="Alice"
        onCryptoReceiptPress={onCryptoReceiptPress}
        onLongPress={onLongPress}
      />,
    )

    await fireEvent.press(view.getByTestId('crypto-receipt'))
    view.getByTestId('crypto-receipt').props.onLongPress()

    expect(onCryptoReceiptPress).toHaveBeenCalledWith(receipt)
    expect(onLongPress).toHaveBeenCalledWith(message)
  })

  it('forwards paid own payment request taps to the request handler', async () => {
    const onCryptoPaymentRequestPress = vi.fn()
    const onLongPress = vi.fn()
    const message = createChatMessage({
      content: JSON.stringify({
        v: 2,
        type: 'crypto_payment_request',
        requestId: 'request-1',
        network: 'ethereum',
        symbol: 'USDT',
        amount: '10',
        decimals: 6,
        recipientAddress: '0xreceiver',
        assetType: 'token',
        contractAddress: '0xtoken',
        createdAt: 1_700_000_000_000,
        state: 'paid',
        settlement: {
          txHash: '0xabc123',
          status: 'confirmed',
          paidAt: 1_700_000_001_000,
        },
      }),
    })

    const view = render(
      <MessageBubble
        message={message}
        isOwn
        contactName="Alice"
        onCryptoPaymentRequestPress={onCryptoPaymentRequestPress}
        onLongPress={onLongPress}
      />,
    )

    await fireEvent.press(view.getByTestId('crypto-payment-request'))
    view.getByTestId('crypto-payment-request').props.onLongPress()

    expect(onCryptoPaymentRequestPress).toHaveBeenCalledWith(
      message,
      expect.objectContaining({
        network: 'ethereum',
        settlement: expect.objectContaining({ txHash: '0xabc123' }),
        state: 'paid',
        symbol: 'USDT',
      }),
    )
    expect(onLongPress).toHaveBeenCalledWith(message)
  })

  it('does not open an unpaid own payment request', async () => {
    const onCryptoPaymentRequestPress = vi.fn()
    const message = createChatMessage({
      content: JSON.stringify({
        v: 2,
        type: 'crypto_payment_request',
        requestId: 'request-1',
        network: 'tron',
        symbol: 'TRX',
        amount: '10',
        decimals: 6,
        recipientAddress: 'TReceiver',
        assetType: 'native',
        createdAt: 1_700_000_000_000,
        state: 'open',
      }),
    })

    const view = render(
      <MessageBubble
        message={message}
        isOwn
        contactName="Alice"
        onCryptoPaymentRequestPress={onCryptoPaymentRequestPress}
      />,
    )

    await fireEvent.press(view.getByTestId('crypto-payment-request'))

    expect(onCryptoPaymentRequestPress).not.toHaveBeenCalled()
  })

  it('shows a sent fallback icon for own messages missing delivery metadata', () => {
    const view = render(
      <MessageBubble
        message={createChatMessage({
          content: 'stored before status sync',
          status: undefined,
          deliveryStage: undefined,
          deliveryHint: undefined,
        })}
        isOwn
        contactName="Alice"
      />,
    )

    expect(() => view.getByText('Sent')).toThrow()
    expect(view.getByText('Check')).toBeTruthy()
  })

  it('hydrates encrypted direct attachments before updating the store', async () => {
    const attachment = createMediaAttachment({ id: 'encrypted-1', fileName: 'secret.pdf', isEncrypted: true })
    const message = createChatMessage({ attachments: [attachment], content: '' })
    mockState.stores.directMessages = [message]

    const view = render(
      <MessageBubble
        message={message}
        isOwn={false}
        contactName="Alice"
      />,
    )

    await fireEvent.press(view.getByTestId('attachment-encrypted-1'))

    expect(mockState.hydrateMessageAttachment).toHaveBeenCalledWith(
      message.id,
      message.conversationId,
      attachment,
      expect.objectContaining({ source: 'messageBubble.prepareDirectAttachment' }),
    )
    expect(mockState.stores.updateDirectMessage).toHaveBeenCalledWith(message.id, {
      attachments: [expect.objectContaining({ uri: 'file:///hydrated.bin' })],
    })
  })

  it('hydrates encrypted images before opening edit and resend', async () => {
    const attachment = createMediaAttachment({
      id: 'encrypted-image',
      fileName: 'secret.jpg',
      uri: '',
      isEncrypted: true,
    })
    const message = createChatMessage({ attachments: [attachment], content: '' })
    mockState.stores.directMessages = [message]
    const onEditImageAttachment = vi.fn()

    const view = render(
      <MessageBubble
        message={message}
        isOwn={false}
        contactName="Alice"
        onEditImageAttachment={onEditImageAttachment}
      />,
    )

    await fireEvent.press(view.getByTestId('edit-encrypted-image'))

    expect(mockState.hydrateMessageAttachment).toHaveBeenCalledWith(
      message.id,
      message.conversationId,
      attachment,
      expect.objectContaining({ source: 'messageBubble.prepareDirectAttachment' }),
    )
    expect(onEditImageAttachment).toHaveBeenCalledWith(
      message,
      expect.objectContaining({ uri: 'file:///hydrated.bin' }),
    )
  })

  it('does not expose edit and resend for disappearing images', () => {
    const attachment = createMediaAttachment({ id: 'disappearing-image' })
    const message = createChatMessage({
      attachments: [attachment],
      content: '',
      disappearing: {
        durationMs: 60_000,
        trigger: 'after_read',
      },
    })

    const view = render(
      <MessageBubble
        message={message}
        isOwn={false}
        contactName="Alice"
        onEditImageAttachment={vi.fn()}
      />,
    )

    expect(() => view.getByTestId('edit-disappearing-image')).toThrow()
  })
})
