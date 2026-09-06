/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  alerts: [] as Array<{
    buttons?: Array<{ onPress?: () => void | Promise<void>; style?: string; text: string }>
    message?: string
    title: string
  }>,
  chat: {
    archivedConversationIds: [] as string[],
    conversations: [] as Array<any>,
    manuallyUnreadConversationIds: [] as string[],
    mutedConversationIds: [] as string[],
    pinnedConversationIds: [] as string[],
    toggleManuallyUnread: vi.fn(),
    toggleMuteConversation: vi.fn(),
    togglePinConversation: vi.fn(),
    unarchiveConversation: vi.fn(),
  },
  group: {
    groups: [] as Array<any>,
  },
  router: {
    back: vi.fn(),
    push: vi.fn(),
  },
  services: {
    blockContact: vi.fn(),
    clearConversationChat: vi.fn(async () => ({ error: null })),
    clearGroupChatLocally: vi.fn(async () => ({ error: null })),
    deleteConversation: vi.fn(async () => ({ error: null })),
    deleteConversationForBoth: vi.fn(async () => ({ error: null })),
    isContactBlocked: vi.fn(() => false),
    leaveGroup: vi.fn(async () => {}),
    unblockContact: vi.fn(),
  },
  wallet: {
    wallet: { address: 'EXO_ACTIVE' },
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../test/react-native')
  return {
    ...rn,
    Alert: {
      alert: (
        title: string,
        message?: string,
        buttons?: Array<{ onPress?: () => void | Promise<void>; style?: string; text: string }>,
      ) => {
        mockState.alerts.push({ buttons, message, title })
      },
    },
  }
})

vi.mock('@shopify/flash-list', async () => {
  const ReactActual = await import('react')
  const { View } = await import('../../test/react-native')
  return {
    FlashList: ({ data, renderItem }: { data: Array<any>; renderItem: (params: { item: any }) => React.ReactNode }) => (
      ReactActual.createElement(
        View,
        { testID: 'archived-list' },
        data.map((item) => (
          ReactActual.createElement(ReactActual.Fragment, { key: item.id }, renderItem({ item }))
        )),
      )
    ),
  }
})

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../test/mainAppMocks')
  return { ArrowLeft: TestIcon }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { resolvedLanguage: 'en' } }),
}))

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
}))

vi.mock('@/lib/i18n', async () => {
  const { translateForTest } = await import('../../test/mainAppMocks')
  return { translate: translateForTest }
})

vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../test/mainAppMocks')
  return { useThemeColors: () => testColors }
})

vi.mock('@/components/chat/ConversationItem', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text } = await import('../../test/react-native')
  return {
    ConversationItem: ({ conversation, onPress }: { conversation: any; onPress: () => void }) => (
      ReactActual.createElement(
        Pressable,
        { onPress, testID: `conversation-${conversation.id}` },
        ReactActual.createElement(Text, null, conversation.title || conversation.displayName || conversation.remoteIdentityId),
      )
    ),
  }
})

vi.mock('@/components/chat/SwipeableConversationItem', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text, View } = await import('../../test/react-native')
  return {
    SwipeableConversationItem: ({
      children,
      conversationId,
      onMore,
      onPin,
      onToggleUnread,
      onUnarchive,
    }: {
      children: React.ReactNode
      conversationId: string
      onMore: (id: string) => void
      onPin: (id: string) => void
      onToggleUnread: (id: string) => void
      onUnarchive?: (id: string) => void
    }) => (
      ReactActual.createElement(
        View,
        { testID: `swipe-${conversationId}` },
        children,
        ReactActual.createElement(Pressable, { onPress: () => onMore(conversationId), testID: `more-${conversationId}` }, ReactActual.createElement(Text, null, 'More')),
        ReactActual.createElement(Pressable, { onPress: () => onUnarchive?.(conversationId), testID: `unarchive-${conversationId}` }, ReactActual.createElement(Text, null, 'Unarchive')),
        ReactActual.createElement(Pressable, { onPress: () => onPin(conversationId), testID: `pin-${conversationId}` }, ReactActual.createElement(Text, null, 'Pin')),
        ReactActual.createElement(Pressable, { onPress: () => onToggleUnread(conversationId), testID: `unread-${conversationId}` }, ReactActual.createElement(Text, null, 'Unread')),
      )
    ),
  }
})

vi.mock('@/components/chat/ChatOptionsModal', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text, View } = await import('../../test/react-native')
  return {
    ChatOptionsModal: ({
      conversation,
      onBlock,
      onClearChat,
      onDeleteChat,
      onMute,
      visible,
    }: {
      conversation: any
      onBlock: () => void
      onClearChat: () => void
      onDeleteChat: () => void
      onMute: () => void
      visible: boolean
    }) => visible ? (
      ReactActual.createElement(
        View,
        { testID: 'chat-options-modal' },
        ReactActual.createElement(Text, null, conversation?.id || 'missing'),
        ReactActual.createElement(Pressable, { onPress: onMute, testID: 'modal-mute' }, ReactActual.createElement(Text, null, 'Mute')),
        ReactActual.createElement(Pressable, { onPress: onClearChat, testID: 'modal-clear' }, ReactActual.createElement(Text, null, 'Clear')),
        ReactActual.createElement(Pressable, { onPress: onDeleteChat, testID: 'modal-delete' }, ReactActual.createElement(Text, null, 'Delete')),
        ReactActual.createElement(Pressable, { onPress: onBlock, testID: 'modal-block' }, ReactActual.createElement(Text, null, 'Block')),
      )
    ) : null,
  }
})

vi.mock('@/services/chat/chatService', () => mockState.services)

vi.mock('@/services/groupChat', () => ({
  clearGroupChatLocally: mockState.services.clearGroupChatLocally,
  getGroupRouteParam: (groupId: string) => `group:${groupId}`,
  leaveGroup: mockState.services.leaveGroup,
}))

vi.mock('@/store', () => ({
  useChatStore: (selector: (state: typeof mockState.chat) => unknown) => selector(mockState.chat),
  useGroupChatStore: (selector: (state: typeof mockState.group) => unknown) => selector(mockState.group),
  useWalletStore: (selector: (state: typeof mockState.wallet) => unknown) => selector(mockState.wallet),
}))

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: ArchivedChatsScreen } = await import('../../app/(main)/archived-chats')

const directConversation = {
  createdAt: 10,
  displayName: 'Alice',
  id: 'direct-1',
  lastMessage: { content: 'hello', isOwn: false, timestamp: 20 },
  remoteIdentityId: 'identity-alice',
  unreadCount: 1,
}

const scopedConversation = {
  ...directConversation,
  displayName: 'Scoped Alice',
  id: 'direct-2',
  localWalletAddress: 'EXO_LOCAL',
}

const groupConversation = {
  createdAt: 30,
  groupId: 'group-1',
  id: 'group:group-1',
  lastMessage: { content: 'group hello', isOwn: false, timestamp: 40 },
  remoteIdentityId: 'group:group-1',
  title: 'Study Group',
  type: 'group',
  unreadCount: 0,
}

describe('ArchivedChatsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.alerts = []
    mockState.chat.archivedConversationIds = []
    mockState.chat.conversations = []
    mockState.chat.manuallyUnreadConversationIds = []
    mockState.chat.mutedConversationIds = []
    mockState.chat.pinnedConversationIds = []
    mockState.group.groups = []
    mockState.wallet.wallet = { address: 'EXO_ACTIVE' }
  })

  it('shows an empty state when no archived conversations exist', () => {
    render(<ArchivedChatsScreen />)

    expect(screen.getByText('No archived chats')).toBeTruthy()
    expect(screen.getByText('Swipe left on a chat and tap Archive to move it here')).toBeTruthy()
  })

  it('supports back navigation and archived row actions', async () => {
    mockState.chat.archivedConversationIds = ['direct-1']
    mockState.chat.conversations = [directConversation]

    const view = render(<ArchivedChatsScreen />)
    const firstPressable = view.root.findAll((node: { type: unknown }) => node.type === 'Pressable')[0]

    await fireEvent.press(firstPressable)
    await fireEvent.press(screen.getByTestId('unarchive-direct-1'))
    await fireEvent.press(screen.getByTestId('pin-direct-1'))
    await fireEvent.press(screen.getByTestId('unread-direct-1'))

    expect(mockState.router.back).toHaveBeenCalled()
    expect(mockState.chat.unarchiveConversation).toHaveBeenCalledWith('direct-1')
    expect(mockState.chat.togglePinConversation).toHaveBeenCalledWith('direct-1')
    expect(mockState.chat.toggleManuallyUnread).toHaveBeenCalledWith('direct-1')
  })

  it('opens direct archived chats with the active wallet fallback and clears manual unread state', async () => {
    mockState.chat.archivedConversationIds = ['direct-1']
    mockState.chat.conversations = [directConversation]
    mockState.chat.manuallyUnreadConversationIds = ['direct-1']

    render(<ArchivedChatsScreen />)
    await fireEvent.press(screen.getByTestId('conversation-direct-1'))

    expect(mockState.chat.toggleManuallyUnread).toHaveBeenCalledWith('direct-1')
    expect(mockState.router.push).toHaveBeenCalledWith('/(main)/chat/identity-alice?local=EXO_ACTIVE')
  })

  it('preserves explicit local wallet scopes when opening direct archived chats', async () => {
    mockState.chat.archivedConversationIds = ['direct-2']
    mockState.chat.conversations = [scopedConversation]

    render(<ArchivedChatsScreen />)
    await fireEvent.press(screen.getByTestId('conversation-direct-2'))

    expect(mockState.router.push).toHaveBeenCalledWith('/(main)/chat/identity-alice?local=EXO_LOCAL')
  })

  it('opens group archived chats through the group route parameter', async () => {
    mockState.chat.archivedConversationIds = ['group:group-1']
    mockState.group.groups = [groupConversation]

    render(<ArchivedChatsScreen />)
    await fireEvent.press(screen.getByTestId('conversation-group:group-1'))

    expect(mockState.router.push).toHaveBeenCalledWith('/(main)/chat/group:group-1')
  })

  it('drives modal actions through guarded service confirmations', async () => {
    mockState.chat.archivedConversationIds = ['direct-1']
    mockState.chat.conversations = [directConversation]

    render(<ArchivedChatsScreen />)
    await fireEvent.press(screen.getByTestId('more-direct-1'))
    await fireEvent.press(screen.getByTestId('modal-mute'))
    expect(mockState.chat.toggleMuteConversation).toHaveBeenCalledWith('direct-1')

    await fireEvent.press(screen.getByTestId('more-direct-1'))
    await fireEvent.press(screen.getByTestId('modal-clear'))
    await mockState.alerts[0].buttons?.[1].onPress?.()
    expect(mockState.services.clearConversationChat).toHaveBeenCalledWith('direct-1')

    await fireEvent.press(screen.getByTestId('more-direct-1'))
    await fireEvent.press(screen.getByTestId('modal-delete'))
    await mockState.alerts[1].buttons?.[2].onPress?.()
    expect(mockState.services.deleteConversationForBoth)
      .toHaveBeenCalledWith('direct-1', 'identity-alice')

    await fireEvent.press(screen.getByTestId('more-direct-1'))
    await fireEvent.press(screen.getByTestId('modal-block'))
    mockState.alerts[2].buttons?.[1].onPress?.()
    expect(mockState.services.blockContact).toHaveBeenCalledWith('identity-alice')
  })

  it('routes archived group clear and delete through group services', async () => {
    mockState.chat.archivedConversationIds = ['group:group-1']
    mockState.group.groups = [groupConversation]

    render(<ArchivedChatsScreen />)
    await fireEvent.press(screen.getByTestId('more-group:group-1'))
    await fireEvent.press(screen.getByTestId('modal-clear'))
    await mockState.alerts[0].buttons?.[1].onPress?.()

    expect(mockState.services.clearGroupChatLocally).toHaveBeenCalledWith('group-1')
    expect(mockState.services.clearConversationChat).not.toHaveBeenCalled()

    await fireEvent.press(screen.getByTestId('more-group:group-1'))
    await fireEvent.press(screen.getByTestId('modal-delete'))
    await mockState.alerts[1].buttons?.[1].onPress?.()

    expect(mockState.services.leaveGroup).toHaveBeenCalledWith('group-1')
    expect(mockState.services.deleteConversation).not.toHaveBeenCalled()
  })
})
