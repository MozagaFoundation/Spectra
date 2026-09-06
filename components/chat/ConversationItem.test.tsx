/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createConversation } from '@/test/chatComponentMocks'

const aliceContact = {
  displayName: 'Alice Contact',
  avatarUrl: undefined,
  isOnline: true,
}

vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return {
    BellOff: TestChatIcon,
    Bluetooth: TestChatIcon,
    Pin: TestChatIcon,
    Skull: TestChatIcon,
    Users: TestChatIcon,
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
  return { translate: translateForChatTest }
})

vi.mock('@/lib/theme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return {
    useThemeColors: () => chatTestColors,
  }
})

vi.mock('@/lib/utils', () => ({
  formatAddress: (value: string, count = 4) => `${value.slice(0, count)}...${value.slice(-count)}`,
  formatRelativeTime: () => 'now',
}))

const { fireEvent, render } = await import('@testing-library/react-native')
const { ConversationItem } = await import('./ConversationItem')

describe('ConversationItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders contact-derived direct conversation metadata and handles press', async () => {
    const onPress = vi.fn()
    const view = render(
      <ConversationItem
        conversation={createConversation()}
        contact={{ ...aliceContact, avatarUrl: 'spectra://objects/alice/avatar' }}
        onPress={onPress}
      />,
    )

    expect(view.getAllByText('Alice Contact').length).toBeGreaterThan(0)
    expect(view.getByText('Last message')).toBeTruthy()
    expect(view.getByText('now')).toBeTruthy()
    expect(view.getByTestId('avatar').props.accessibilityLabel).toBe(
      'spectra://objects/alice/avatar',
    )

    await fireEvent.press(view.root.findByType('Pressable' as any))

    expect(onPress).toHaveBeenCalled()
  })

  it('strips QMEDIA markers from previews and falls back to attachment labels', () => {
    const view = render(
      <ConversationItem
        conversation={createConversation({
          lastMessage: {
            content: '[QMEDIA:encrypted] ',
            isOwn: false,
            timestamp: 1,
          },
        })}
        onPress={vi.fn()}
      />,
    )

    expect(view.getByText('Attachment')).toBeTruthy()
  })

  it('marks a deleted direct account without loading its avatar', () => {
    const view = render(
      <ConversationItem
        conversation={createConversation({ remoteAccountState: 'deleted' })}
        contact={{ ...aliceContact, avatarUrl: 'spectra://objects/alice/avatar' }}
        onPress={vi.fn()}
      />,
    )

    expect(view.getByText('Account deleted')).toBeTruthy()
    expect(view.getByTestId('avatar').props.accessibilityLabel).toBeUndefined()
  })

  it('does not show hidden control payload JSON in previews', () => {
    const view = render(
      <ConversationItem
        conversation={createConversation({
          lastMessage: {
            content: JSON.stringify({
              v: 2,
              type: 'crypto_payment_request_update',
              requestId: 'request-1',
            }),
            isOwn: true,
            timestamp: 1,
          },
        })}
        onPress={vi.fn()}
      />,
    )

    expect(view.getByText('No messages yet')).toBeTruthy()
    expect(() => view.getByText(/crypto_payment_request_update/)).toThrow()
  })

  it('renders group, unread, pinned, muted, and nearby states', () => {
    const groupView = render(
      <ConversationItem
        conversation={createConversation({
          type: 'group',
          title: 'Audit Group',
          memberCount: 3,
          unreadCount: 120,
        })}
        isPinned
        isMuted
        onPress={vi.fn()}
      />,
    )
    expect(groupView.getAllByText('Audit Group').length).toBeGreaterThan(0)
    expect(groupView.getByText('3')).toBeTruthy()
    expect(groupView.getByText('99+')).toBeTruthy()

    const nearbyView = render(
      <ConversationItem conversation={createConversation()} contact={aliceContact} isNearby onPress={vi.fn()} />,
    )
    expect(nearbyView.getByText('Nearby')).toBeTruthy()
  })

  it('truncates long names without yielding timestamp space', () => {
    const longName = 'A very long public display name that must never overlap message metadata'
    const view = render(
      <ConversationItem
        conversation={createConversation({ localDisplayName: 'An equally long local account label' })}
        contact={{ ...aliceContact, displayName: longName }}
        isPinned
        isMuted
        onPress={vi.fn()}
      />,
    )

    const displayName = view.getAllByText(longName).find((node) => node.props.ellipsizeMode === 'tail')
    const localName = view.getByText('An equally long local account label')

    expect(displayName?.props.numberOfLines).toBe(1)
    expect(displayName?.props.style).toEqual(expect.objectContaining({ minWidth: 0 }))
    expect(localName.props.numberOfLines).toBe(1)
    expect(view.getByText('now').props.numberOfLines).toBe(1)
  })
})
