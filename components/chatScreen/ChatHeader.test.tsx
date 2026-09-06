/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  router: {
    back: vi.fn(),
    push: vi.fn(),
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../test/react-native')
  return rn
})
vi.mock('react-i18next', () => ({ useTranslation: () => ({}) }))
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))
vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../test/mainAppMocks')
  return {
    Ban: TestIcon,
    ChevronLeft: TestIcon,
    Clock3: TestIcon,
    EllipsisVertical: TestIcon,
    Phone: TestIcon,
    Shield: TestIcon,
    Skull: TestIcon,
    Users: TestIcon,
  }
})
vi.mock('@/components/common', async () => {
  const { TestAvatar } = await import('../../test/mainAppMocks')
  return { Avatar: TestAvatar }
})
vi.mock('@/components/chat', async () => {
  const ReactActual = await import('react')
  const { Text, View } = await import('../../test/react-native')
  return {
    TorDeliveryIndicator: () => (
      ReactActual.createElement(View, { testID: 'tor-indicator-local' }, ReactActual.createElement(Text, null, 'local'))
    ),
  }
})
vi.mock('@/components/chat/BLERouteIndicator', async () => {
  const ReactActual = await import('react')
  const { Text, View } = await import('../../test/react-native')
  return {
    BLERouteIndicator: ({ route }: { route: string }) => (
      ReactActual.createElement(View, { testID: 'ble-route-indicator' }, ReactActual.createElement(Text, null, route))
    ),
  }
})
vi.mock('@/components/chat/NearbyBadge', async () => {
  const ReactActual = await import('react')
  const { Text, View } = await import('../../test/react-native')
  return {
    NearbyBadge: () => (
      ReactActual.createElement(View, { testID: 'nearby-badge' }, ReactActual.createElement(Text, null, 'Nearby'))
    ),
  }
})
vi.mock('@/hooks/useGuardedRouter', () => ({ useGuardedRouter: () => mockState.router }))
vi.mock('@/lib/i18n', async () => {
  const { translateForTest } = await import('../../test/mainAppMocks')
  return { translate: translateForTest }
})
vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../test/mainAppMocks')
  return {
    useThemeColors: () => testColors,
  }
})

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { ChatHeader } = await import('./ChatHeader')

function renderHeader(overrides: Partial<React.ComponentProps<typeof ChatHeader>> = {}) {
  const props: React.ComponentProps<typeof ChatHeader> = {
    address: 'identity-direct',
    bleRoute: 'internet',
    contactAvatarUrl: null,
    contactIsOnline: true,
    contactName: 'Alice',
    groupId: null,
    groupMemberCount: 0,
    internetAvailable: true,
    isPeerNearby: false,
    isBlocked: false,
    isGroupChat: false,
    localDisplayName: undefined,
    localWalletAddress: undefined,
    onOpenCallOptions: vi.fn(),
    onOpenOptions: vi.fn(),
    peerTorCallAlert: null,
    torEnabled: false,
    ...overrides,
  }

  return { props, ...render(<ChatHeader {...props} />) }
}

describe('ChatHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates back and opens a direct contact with encoded local scope', async () => {
    renderHeader({ localWalletAddress: 'EXO/local+wallet' })

    await fireEvent.press(screen.getByTestId('chat-header-back'))
    await fireEvent.press(screen.getByTestId('chat-header-title'))

    expect(mockState.router.back).toHaveBeenCalledOnce()
    expect(mockState.router.push).toHaveBeenCalledWith('/(main)/contact/identity-direct?local=EXO%2Flocal%2Bwallet')
  })

  it('routes group headers to group info and does not expose direct-call controls', async () => {
    renderHeader({
      groupId: 'group-1',
      groupMemberCount: 3,
      isGroupChat: true,
      onOpenCallOptions: vi.fn(),
      onOpenOptions: undefined,
    })

    await fireEvent.press(screen.getByTestId('chat-header-title'))

    expect(mockState.router.push).toHaveBeenCalledWith('/(main)/group/group-1/info')
    expect(screen.getAllByText('3 members').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('chat-header-call-options')).toBeNull()
    expect(screen.queryByTestId('chat-header-chat-options')).toBeNull()
  })

  it('shows a deleted account state without call controls', () => {
    renderHeader({ remoteAccountDeleted: true })

    expect(screen.getByText('Account deleted')).toBeTruthy()
    expect(screen.queryByTestId('chat-header-call-options')).toBeNull()
  })

  it('opens direct chat options and call menu without starting a call directly', async () => {
    const onOpenCallOptions = vi.fn()
    const onOpenOptions = vi.fn()
    renderHeader({ onOpenCallOptions, onOpenOptions })

    await fireEvent.press(screen.getByTestId('chat-header-chat-options'))
    await fireEvent.press(screen.getByTestId('chat-header-call-options'))

    expect(onOpenOptions).toHaveBeenCalledOnce()
    expect(onOpenCallOptions).toHaveBeenCalledOnce()
  })

  it('truncates long contact names while preserving header actions', () => {
    const longName = 'A very long public display name that must not overlap the header actions'
    renderHeader({ contactName: longName })

    const name = screen.getAllByText(longName).find((node) => node.props.ellipsizeMode === 'tail')

    expect(name?.props.numberOfLines).toBe(1)
    expect(name?.props.style).toEqual(expect.objectContaining({ minWidth: 0 }))
    expect(screen.getByTestId('chat-header-chat-options')).toBeTruthy()
    expect(screen.getByTestId('chat-header-call-options')).toBeTruthy()
  })

  it('disables the direct call entry when Spectre or transport policy blocks calls', async () => {
    const onOpenCallOptions = vi.fn()
    renderHeader({
      onOpenCallOptions,
      peerTorCallAlert: {
        message: 'Calls are blocked',
        reason: 'Disabled',
        title: 'Unavailable',
      },
    })

    await fireEvent.press(screen.getByTestId('chat-header-call-options'))

    expect(onOpenCallOptions).not.toHaveBeenCalled()
  })

  it('renders subtitle precedence for blocked, local-scope, BLE, and Tor states', () => {
    const blocked = renderHeader({ isBlocked: true })
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0)
    blocked.unmount()

    const local = renderHeader({ localDisplayName: 'Primary EXO' })
    expect(screen.getAllByText('via Primary EXO').length).toBeGreaterThan(0)
    local.unmount()

    const ble = renderHeader({ bleRoute: 'ble', internetAvailable: false })
    expect(screen.getByTestId('ble-route-indicator')).toBeTruthy()
    ble.unmount()

    renderHeader({ torEnabled: true })
    expect(screen.getByTestId('tor-indicator-local')).toBeTruthy()
  })

  it('shows authenticated nearby presence alongside the local account subtitle', () => {
    renderHeader({
      isPeerNearby: true,
      localDisplayName: 'Primary EXO',
    })

    expect(screen.getByTestId('nearby-badge')).toBeTruthy()
    expect(screen.getAllByText('via Primary EXO').length).toBeGreaterThan(0)
  })
})
