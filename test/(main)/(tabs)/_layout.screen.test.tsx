/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  auth: { exoAddress: 'EXO_ROOT' },
  wallet: { wallet: { address: 'EXO_ROOT', spectreMode: false } },
  spectre: { enabled: false },
  chat: { totalUnreadCount: 3, storageScope: 'EXO_ROOT' },
  group: {
    groups: [
      { unreadCount: 2, localWalletAddress: 'EXO_ROOT' },
      { unreadCount: 1, localWalletAddress: 'EXO_ROOT' },
    ],
  },
  walletTransfers: { totalUnreadCount: 6, refresh: vi.fn(async () => {}) },
  tabsShouldThrow: false,
}))

vi.mock('react-native', async () => await import('../../../test/react-native'))

vi.mock('expo-router', async () => {
  const ReactActual = await import('react')
  const { Text, View } = await import('../../../test/react-native')

  function Tabs({ children }: { children: React.ReactNode }) {
    if (mockState.tabsShouldThrow) {
      throw new Error('boom')
    }

    return ReactActual.createElement(View, { testID: 'tabs-root' }, children)
  }

  Tabs.Screen = ({ name, options }: { name: string; options: { tabBarBadge?: number; title: string; href?: null } }) => (
    options.href === null
      ? null
      : ReactActual.createElement(
          View,
          { testID: `tab-${name}` },
          ReactActual.createElement(Text, null, options.title),
          options.tabBarBadge !== undefined
            ? ReactActual.createElement(Text, null, `badge:${options.tabBarBadge}`)
            : null,
        )
  )

  return { Tabs }
})

vi.mock('expo-blur', async () => {
  const { View } = await import('../../../test/react-native')
  return { BlurView: View }
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainAppMocks')
  return {
    Landmark: TestIcon,
    MessageSquare: TestIcon,
    Settings: TestIcon,
    Users: TestIcon,
    Wallet: TestIcon,
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/i18n', () => ({
  translate: (key: string) => key,
}))

vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../../test/mainAppMocks')
  return {
    useResolvedThemeVariant: () => 'dark',
    useThemeColors: () => testColors,
  }
})

vi.mock('@/services/notifications/badgeSync', () => ({
  syncGlobalBadge: vi.fn(async () => {}),
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof mockState.auth) => unknown) => selector(mockState.auth),
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: (selector: (state: typeof mockState.chat) => unknown) => selector(mockState.chat),
}))

vi.mock('@/store/groupChatStore', () => ({
  useGroupChatStore: (selector: (state: typeof mockState.group) => unknown) => selector(mockState.group),
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: typeof mockState.spectre) => unknown) => selector(mockState.spectre),
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: typeof mockState.wallet) => unknown) => selector(mockState.wallet),
}))

vi.mock('@/store/walletTransferNotificationStore', () => ({
  useWalletTransferNotificationStore: (selector: (state: typeof mockState.walletTransfers) => unknown) => selector(mockState.walletTransfers),
}))

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: TabsLayout } = await import('../../../app/(main)/(tabs)/_layout')

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

describe('TabsLayout', () => {
  beforeEach(() => {
    mockState.auth.exoAddress = 'EXO_ROOT'
    mockState.wallet.wallet.address = 'EXO_ROOT'
    mockState.chat.totalUnreadCount = 3
    mockState.chat.storageScope = 'EXO_ROOT'
    mockState.group.groups = [
      { unreadCount: 2, localWalletAddress: 'EXO_ROOT' },
      { unreadCount: 1, localWalletAddress: 'EXO_ROOT' },
    ]
    mockState.wallet.wallet.spectreMode = false
    mockState.spectre.enabled = false
    mockState.walletTransfers.totalUnreadCount = 6
    mockState.walletTransfers.refresh.mockClear()
    mockState.tabsShouldThrow = false
  })

  it('renders the audited tab routes with settings labeled correctly', () => {
    render(<TabsLayout />)

    expect(screen.getByTestId('tab-chats')).toBeTruthy()
    expect(screen.getByText('Chats')).toBeTruthy()
    expect(nodeText(screen.getByTestId('tab-chats'))).toContain('badge:6')
    expect(nodeText(screen.getByTestId('tab-crypto'))).toContain('badge:6')
    expect(screen.getAllByText('Contacts').length).toBeGreaterThan(0)
    expect(screen.getByTestId('tab-agora')).toBeTruthy()
    expect(screen.getAllByText('Agora').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Wallets').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0)
  })

  it('excludes stale wallet state from tab badges', () => {
    mockState.auth.exoAddress = 'EXO_OTHER'
    mockState.chat.storageScope = 'EXO_OTHER'
    mockState.group.groups = [
      { unreadCount: 7, localWalletAddress: 'EXO_OTHER' },
      { unreadCount: 1, localWalletAddress: 'EXO_ROOT' },
    ]

    render(<TabsLayout />)

    expect(nodeText(screen.getByTestId('tab-chats'))).toContain('badge:1')
    expect(nodeText(screen.getByTestId('tab-chats'))).not.toContain('badge:6')
    expect(nodeText(screen.getByTestId('tab-crypto'))).not.toContain('badge:6')
  })

  it('hides Agora while Spectre Mode is active', () => {
    mockState.spectre.enabled = true
    render(<TabsLayout />)
    expect(screen.queryByTestId('tab-agora')).toBeNull()
  })

  it('shows a retryable fallback if tabs fail to render', async () => {
    mockState.tabsShouldThrow = true
    const view = render(<TabsLayout />)

    expect(screen.getByText('Tabs failed to load')).toBeTruthy()

    mockState.tabsShouldThrow = false
    const retryButton = view.root.findAll((node) => (
      String(node.type) === 'Pressable' && nodeText(node).includes('Retry')
    ))[0]
    await fireEvent.press(retryButton)

    expect(screen.getByTestId('tabs-root')).toBeTruthy()
  })
})

