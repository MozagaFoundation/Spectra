/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance } from 'react-test-renderer'

const mockState = vi.hoisted(() => ({
  alert: vi.fn(),
  params: { id: 'group-id' as string | undefined },
  router: {
    back: vi.fn(),
    dismissAll: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  },
  chat: {
    contacts: [
      { avatarUrl: null, displayName: 'Alice', identityId: 'alice-id', walletAddress: 'EXOalice' },
      { avatarUrl: null, displayName: 'Bob', identityId: 'bob-id', walletAddress: 'EXObob' },
    ],
  },
  group: {
    groups: [{
      createdAt: 1770000000000,
      distributionId: 'distribution-id',
      groupId: 'group-id',
      maxMembers: 50,
      memberIds: ['owner-id', 'alice-id'],
      title: 'Audit Group',
      memberCount: 2,
      myRole: 'member' as 'member' | 'owner' | 'admin',
      revision: 1,
    }],
    members: {
      'group-id': [
        { groupId: 'group-id', identityId: 'owner-id', role: 'owner', displayName: 'Owner', joinedAt: 1, updatedAt: 1 },
        { groupId: 'group-id', identityId: 'alice-id', role: 'member', displayName: 'Alice', walletAddress: 'EXOalice', joinedAt: 1, updatedAt: 1 },
      ],
    },
    messages: {
      'group-id': [],
    },
  },
  services: {
    MAX_GROUP_CHAT_MEMBERS: 50,
    addGroupMembers: vi.fn(async () => mockState.group.groups[0]),
    getGroupRouteParam: (id: string) => `group:${id}`,
    leaveGroup: vi.fn(async () => {}),
    loadGroupMessages: vi.fn(async () => []),
    updateGroupAvatar: vi.fn(async () => ({ group: null, error: null })),
    updateGroupDisappearingTimer: vi.fn(async () => ({ group: null, error: null })),
    uploadGroupAvatar: vi.fn(async () => ({ url: 'storage://avatar', error: null })),
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../../../test/react-native')
  return {
    ...rn,
    Alert: { alert: mockState.alert },
  }
})

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
  useRouter: () => mockState.router,
}))

vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn(async () => ({
    assets: [{ fileName: 'group.jpg', mimeType: 'image/jpeg', uri: 'file://group.jpg' }],
    canceled: false,
  })),
  requestMediaLibraryPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
}))

vi.mock('expo-image', async () => {
  const { Image } = await import('../../../../test/react-native')
  return { Image }
})

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../../test/mainScreenMocks')
  return {
    ArrowLeft: TestIcon,
    ChevronRight: TestIcon,
    Clock3: TestIcon,
    Crown: TestIcon,
    FileText: TestIcon,
    Image: TestIcon,
    LogOut: TestIcon,
    MessageSquare: TestIcon,
    Shield: TestIcon,
    UserPlus: TestIcon,
    Users: TestIcon,
    Video: TestIcon,
  }
})

vi.mock('@/components/common', async () => {
  const { TestAvatar } = await import('../../../../test/mainScreenMocks')
  return { Avatar: TestAvatar }
})

vi.mock('@/components/ui', async () => {
  const { TestButton, TestCard } = await import('../../../../test/mainScreenMocks')
  return { Button: TestButton, Card: TestCard }
})

vi.mock('@/components/shared/RecipientSelector', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text, View } = await import('../../../../test/react-native')
  return {
    RecipientSelector: ({
      onDone,
      onSelectionChange,
    }: {
      onDone: () => void
      onSelectionChange: (ids: string[]) => void
    }) => ReactActual.createElement(
      View,
      { testID: 'recipient-selector' },
      ReactActual.createElement(
        Pressable,
        { testID: 'select-bob', onPress: () => onSelectionChange(['bob-id']) },
        ReactActual.createElement(Text, null, 'Select Bob'),
      ),
      ReactActual.createElement(
        Pressable,
        { testID: 'done-members', onPress: onDone },
        ReactActual.createElement(Text, null, 'Done'),
      ),
    ),
  }
})

vi.mock('@/lib/disappearingMessages', () => ({
  GROUP_DISAPPEARING_TIMER_PRESETS_MS: [900000, 3600000],
  formatDisappearingTimerDuration: (durationMs: number) => `${durationMs}`,
  getDisappearingTimerDescription: () => 'Off',
}))

vi.mock('@/lib/groupChatPermissions', () => ({
  canManageGroupDisappearingTimer: (role?: string) => role === 'owner' || role === 'admin',
}))

vi.mock('@/lib/i18n', async () => {
  const { createI18nMock } = await import('../../../../test/mainScreenMocks')
  return createI18nMock()
})

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../../../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/lib/utils', () => ({
  formatFileSize: (value?: number) => `${value ?? 0} B`,
  formatRelativeTime: () => 'now',
  formatAddress: (value: string) => value,
}))
vi.mock('@/lib/mediaPreview', () => ({
  getAttachmentPreviewUri: () => null,
}))

vi.mock('@/store', () => ({
  useChatStore: (selector: (state: typeof mockState.chat) => unknown) => selector(mockState.chat),
  useGroupChatStore: (selector: (state: typeof mockState.group) => unknown) => selector(mockState.group),
}))

vi.mock('@/services/chat', () => mockState.services)

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: GroupInfoScreen } = await import('../../../../app/(main)/group/[id]/info')

function textContent(node: ReactTestInstance): string {
  return node.children.map((child) => (
    typeof child === 'string' ? child : textContent(child)
  )).join('')
}

function getPressableByText(root: ReactTestInstance, text: string): ReactTestInstance {
  const match = root.findAll((node) => (
    typeof node.props.onPress === 'function' && textContent(node) === text
  ))[0]
  if (!match) throw new Error(`Unable to find pressable ${text}`)
  return match
}

function getPressableContainingText(root: ReactTestInstance, text: string): ReactTestInstance {
  const match = root.findAll((node) => (
    typeof node.props.onPress === 'function' && textContent(node).includes(text)
  ))[0]
  if (!match) throw new Error(`Unable to find pressable containing ${text}`)
  return match
}

describe('GroupInfoScreen', () => {
  beforeEach(() => {
    mockState.alert.mockClear()
    mockState.params = { id: 'group-id' }
    mockState.group.groups[0].myRole = 'member'
    mockState.router.push.mockClear()
    mockState.router.dismissAll.mockClear()
    mockState.router.replace.mockClear()
    mockState.services.addGroupMembers.mockClear()
    mockState.services.leaveGroup.mockClear()
    mockState.services.loadGroupMessages.mockClear()
    mockState.services.updateGroupDisappearingTimer.mockClear()
  })

  it('renders a safe fallback for unknown route ids', () => {
    mockState.params = { id: 'missing-id' }

    render(<GroupInfoScreen />)

    expect(screen.getByText('Group not found')).toBeTruthy()
  })

  it('does not call timer updates for non-admin members', async () => {
    const view = render(<GroupInfoScreen />)

    await fireEvent.press(getPressableByText(view.root, 'Off'))

    expect(mockState.services.updateGroupDisappearingTimer).not.toHaveBeenCalled()
  })

  it('confirms leave before calling service and returning to chats', async () => {
    const view = render(<GroupInfoScreen />)

    await fireEvent.press(getPressableContainingText(view.root, 'Leave Group'))
    const buttons = mockState.alert.mock.calls[0][2]
    await act(async () => {
      await buttons[1].onPress()
    })

    expect(mockState.services.leaveGroup).toHaveBeenCalledWith('group-id')
    expect(mockState.router.dismissAll).toHaveBeenCalled()
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/chats')
  })

  it('lets admins add contacts who are not already members', async () => {
    mockState.group.groups[0].myRole = 'admin'
    const view = render(<GroupInfoScreen />)

    await fireEvent.press(getPressableContainingText(view.root, 'Add user'))
    expect(screen.getByTestId('recipient-selector')).toBeTruthy()

    await fireEvent.press(screen.getByTestId('select-bob'))
    await fireEvent.press(screen.getByTestId('done-members'))

    expect(mockState.services.addGroupMembers).toHaveBeenCalledWith('group-id', ['bob-id'])
  })

  it('routes member rows and shared media from the profile', async () => {
    const view = render(<GroupInfoScreen />)

    await fireEvent.press(getPressableContainingText(view.root, 'Alice'))
    await fireEvent.press(getPressableByText(view.root, 'Media'))

    expect(mockState.router.push).toHaveBeenNthCalledWith(1, '/(main)/contact/alice-id')
    expect(mockState.router.push).toHaveBeenNthCalledWith(2, '/(main)/group/group-id/media')
  })
})
