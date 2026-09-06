/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  flashListScrollToEnd: vi.fn(),
  spectreThemeActive: false,
  throwMessageIds: new Set<string>(),
  ui: {
    chatBackground: { type: 'none' as 'none' | 'preset' | 'custom', id: undefined as string | undefined, uri: undefined as string | undefined },
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../test/react-native')
  const ReactActual = await import('react')
  return {
    ...rn,
    ImageBackground: ({ children, source }: { children: React.ReactNode; source: unknown }) => (
      ReactActual.createElement(rn.View, { source, testID: 'image-background' }, children)
    ),
  }
})
vi.mock('@shopify/flash-list', async () => {
  const ReactActual = await import('react')
  const { View } = await import('../../test/react-native')
  type FlashListMockProps = {
    data?: Array<any>
    keyExtractor?: (item: any, index: number) => string
    ListHeaderComponent?: React.ReactNode
    renderItem?: (params: { item: any; index: number }) => React.ReactNode
    [key: string]: any
  }
  return {
    FlashList: ReactActual.forwardRef<{ scrollToEnd: typeof mockState.flashListScrollToEnd }, FlashListMockProps>(({
        data = [],
        keyExtractor,
        ListHeaderComponent,
        renderItem,
        ...props
      }, ref) => {
      ReactActual.useImperativeHandle(ref, () => ({
        scrollToEnd: mockState.flashListScrollToEnd,
      }))
      return ReactActual.createElement(
        View,
        { testID: 'flash-list', ...props },
        ListHeaderComponent,
        data.map((item: any, index: number) => (
          ReactActual.createElement(
            View,
            { key: keyExtractor?.(item, index) ?? item.key ?? String(index) },
            renderItem?.({ item, index }),
          )
        )),
      )
    }),
  }
})
vi.mock('expo-linear-gradient', async () => {
  const ReactActual = await import('react')
  const { View } = await import('../../test/react-native')
  return {
    LinearGradient: ({ children, colors }: { children: React.ReactNode; colors: string[] }) => (
      ReactActual.createElement(View, { colors, testID: 'linear-gradient' }, children)
    ),
  }
})
vi.mock('react-i18next', () => ({ useTranslation: () => ({}) }))
vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../test/mainAppMocks')
  return { Shield: TestIcon }
})
vi.mock('@/components/chat/MessageBubble', async () => {
  const ReactActual = await import('react')
  const { Text, View } = await import('../../test/react-native')
  return {
    MessageBubble: ({
      contactName,
      message,
      onLongPress,
      onCryptoReceiptPress,
      onReplyPress,
      senderAvatarUrl,
      senderName,
    }: {
      contactName: string
      message: { id: string; content?: string }
      onCryptoReceiptPress?: unknown
      onLongPress?: unknown
      onReplyPress?: unknown
      senderAvatarUrl?: string
      senderName?: string
    }) => {
      if (mockState.throwMessageIds.has(message.id)) {
        throw new Error('bubble failed')
      }

      return ReactActual.createElement(
        View,
        {
          onCryptoReceiptPress,
          onLongPress,
          onReplyPress,
          senderAvatarUrl,
          senderName,
          testID: `message-bubble-${message.id}`,
        },
        ReactActual.createElement(Text, null, senderName || contactName),
        ReactActual.createElement(Text, null, message.content || ''),
      )
    },
  }
})
vi.mock('@/lib/i18n', () => ({ translate: (key: string) => key }))
vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../test/mainAppMocks')
  return {
    useIsSpectreThemeActive: () => mockState.spectreThemeActive,
    useThemeColors: () => testColors,
  }
})
vi.mock('@/lib/utils', () => ({ formatDate: (value: number) => `date:${value}` }))
vi.mock('@/store/uiStore', () => ({
  useUIStore: (selector: (state: typeof mockState.ui) => unknown) => selector(mockState.ui),
}))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { ChatMessageList } = await import('./ChatMessageList')

type ChatMessageListProps = React.ComponentProps<typeof ChatMessageList>

function messageItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    isOwn: false,
    key: `message-${id}`,
    message: {
      content: `message ${id}`,
      id,
      senderId: 'remote-identity',
      timestamp: Date.now(),
      ...overrides,
    },
    showAvatar: true,
    type: 'message',
  }
}

function renderList(overrides: Partial<ChatMessageListProps> = {}) {
  const props: ChatMessageListProps = {
    conversationKey: 'direct:alice',
    contactAvatarUrl: 'contact.png',
    contactName: 'Alice',
    contacts: [],
    data: [],
    extraData: null,
    groupMembers: [],
    hasOlderMessages: false,
    isGroupChat: false,
    isLoading: false,
    isLoadingOlder: false,
    isSyncing: false,
    listRef: { current: null },
    onLoadOlder: vi.fn(),
    ...overrides,
  }

  return { props, ...render(<ChatMessageList {...props} />) }
}

describe('ChatMessageList', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    mockState.flashListScrollToEnd.mockClear()
    mockState.spectreThemeActive = false
    mockState.throwMessageIds.clear()
    mockState.ui.chatBackground = { type: 'none', id: undefined, uri: undefined }
  })

  it('shows loading and direct empty states without rendering FlashList', () => {
    const loading = renderList({ isLoading: true })
    expect(screen.getAllByText('Loading messages...').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('flash-list')).toBeNull()
    loading.unmount()

    renderList()
    expect(screen.getAllByText('Conversation started').length).toBeGreaterThan(0)
    expect(screen.getAllByText('End-to-end encrypted').length).toBeGreaterThan(0)
  })

  it('keeps syncing state silent while preserving the message list', () => {
    renderList({ data: [messageItem('sync') as any], isSyncing: true })

    expect(() => screen.getByText('Syncing...')).toThrow()
    expect(screen.getByTestId('flash-list')).toBeTruthy()
  })

  it('starts at the bottom once per conversation without freezing an item index', async () => {
    const listRef = { current: null } as any
    const view = renderList({
      data: [messageItem('first') as any],
      listRef,
    })

    expect(screen.getByTestId('flash-list').props.initialScrollIndex).toBeUndefined()
    expect(screen.getByTestId('flash-list').props.maintainVisibleContentPosition).toEqual({
      startRenderingFromBottom: true,
    })

    await act(async () => {
      screen.getByTestId('flash-list').props.onLoad()
      screen.getByTestId('flash-list').props.onLoad()
    })
    expect(mockState.flashListScrollToEnd).toHaveBeenCalledTimes(1)
    expect(mockState.flashListScrollToEnd).toHaveBeenCalledWith({ animated: false })

    view.update(
      <ChatMessageList
        {...view.props}
        conversationKey="direct:bob"
        data={[messageItem('second') as any]}
      />,
    )
    await act(async () => {
      screen.getByTestId('flash-list').props.onLoad()
    })
    expect(mockState.flashListScrollToEnd).toHaveBeenCalledTimes(2)
  })

  it('loads older messages only when the reader taps the history control', async () => {
    const onLoadOlder = vi.fn()
    const view = renderList({
      data: [messageItem('older') as any],
      hasOlderMessages: true,
      onLoadOlder,
    })

    expect(screen.getByTestId('flash-list').props.onStartReached).toBeUndefined()
    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Load more' }))

    expect(onLoadOlder).toHaveBeenCalledOnce()
  })

  it('reports bottom proximity changes and forwards drag starts', async () => {
    const onNearBottomChange = vi.fn()
    const onScrollBeginDrag = vi.fn()
    renderList({
      data: [messageItem('scrolling') as any],
      onNearBottomChange,
      onScrollBeginDrag,
    })
    const list = screen.getByTestId('flash-list')
    onNearBottomChange.mockClear()

    await act(async () => {
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { y: 400 },
          contentSize: { height: 1_000 },
          layoutMeasurement: { height: 400 },
        },
      })
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { y: 350 },
          contentSize: { height: 1_000 },
          layoutMeasurement: { height: 400 },
        },
      })
      list.props.onScroll({
        nativeEvent: {
          contentOffset: { y: 580 },
          contentSize: { height: 1_000 },
          layoutMeasurement: { height: 400 },
        },
      })
      list.props.onScrollBeginDrag()
    })

    expect(onNearBottomChange.mock.calls).toEqual([[false], [true]])
    expect(onScrollBeginDrag).toHaveBeenCalledTimes(1)
    expect(list.props.scrollEventThrottle).toBe(16)
  })

  it('auto-scrolls new messages only while the reader is near the bottom', async () => {
    vi.useFakeTimers()
    const first = messageItem('first') as any
    const view = renderList({ data: [first] })
    mockState.flashListScrollToEnd.mockClear()

    await act(async () => {
      screen.getByTestId('flash-list').props.onScroll({
        nativeEvent: {
          contentOffset: { y: 100 },
          contentSize: { height: 1_000 },
          layoutMeasurement: { height: 400 },
        },
      })
    })
    view.update(<ChatMessageList {...view.props} data={[first, messageItem('second') as any]} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(mockState.flashListScrollToEnd).not.toHaveBeenCalled()

    await act(async () => {
      screen.getByTestId('flash-list').props.onScroll({
        nativeEvent: {
          contentOffset: { y: 580 },
          contentSize: { height: 1_000 },
          layoutMeasurement: { height: 400 },
        },
      })
    })
    view.update(
      <ChatMessageList
        {...view.props}
        data={[first, messageItem('second') as any, messageItem('third') as any]}
      />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(mockState.flashListScrollToEnd).toHaveBeenCalledWith({ animated: false })
    vi.useRealTimers()
  })

  it('passes crypto receipt taps through to message bubbles', () => {
    const onCryptoReceiptPress = vi.fn()
    renderList({
      data: [messageItem('receipt') as any],
      onCryptoReceiptPress,
    })

    expect(screen.getByTestId('message-bubble-receipt').props.onCryptoReceiptPress).toBe(onCryptoReceiptPress)
  })

  it('keeps the list mounted when one message bubble fails to render', () => {
    mockState.throwMessageIds.add('broken')
    renderList({
      data: [
        messageItem('ok') as any,
        messageItem('broken') as any,
      ],
    })

    expect(screen.getByTestId('message-bubble-ok')).toBeTruthy()
    expect(screen.getByText('Message unavailable')).toBeTruthy()
  })

  it('renders date headers and resolves group sender names and avatars', () => {
    renderList({
      contacts: [{ avatarUrl: 'remote-avatar.png', identityId: 'remote-identity' }],
      data: [
        { date: 'Tue May 05 2026', key: 'header-1', type: 'header' },
        messageItem('group') as any,
      ],
      groupMembers: [{ displayName: 'Remote Member', identityId: 'remote-identity' }],
      isGroupChat: true,
    })

    const bubble = screen.getByTestId('message-bubble-group')
    expect(screen.getAllByText(/^date:/).length).toBeGreaterThan(0)
    expect(bubble.props.senderName).toBe('Remote Member')
    expect(bubble.props.senderAvatarUrl).toBe('remote-avatar.png')
  })

  it('uses preset and custom backgrounds unless Spectre theme is active', () => {
    mockState.ui.chatBackground = { type: 'preset', id: 'midnight', uri: undefined }
    const preset = renderList({ data: [messageItem('preset') as any] })
    expect(screen.getByTestId('linear-gradient').props.colors).toEqual(['#0f0c29', '#302b63', '#24243e'])
    preset.unmount()

    mockState.ui.chatBackground = { type: 'custom', id: undefined, uri: 'file:///custom.jpg' }
    const custom = renderList({ data: [messageItem('custom') as any] })
    expect(screen.getByTestId('image-background').props.source).toEqual({ uri: 'file:///custom.jpg' })
    custom.unmount()

    mockState.spectreThemeActive = true
    mockState.ui.chatBackground = { type: 'preset', id: 'midnight', uri: undefined }
    renderList({ data: [messageItem('spectre') as any] })
    expect(screen.queryByTestId('linear-gradient')).toBeNull()
  })
})
