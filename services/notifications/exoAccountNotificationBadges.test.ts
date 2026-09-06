/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  walletState: {
    wallet: null as null | { address: string },
    wallets: [] as Array<{ address: string; spectreMode?: boolean }>,
  },
  markWalletUnread: vi.fn(async () => {}),
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => mockState.walletState,
  },
}))

vi.mock('@/store/exoAccountNotificationStore', () => ({
  useExoAccountNotificationStore: {
    getState: () => ({
      markWalletUnread: mockState.markWalletUnread,
    }),
  },
}))

import { markWalletUnreadFromNotification } from './exoAccountNotificationBadges'

describe('exoAccountNotificationBadges', () => {
  beforeEach(() => {
    mockState.walletState.wallet = null
    mockState.walletState.wallets = []
    mockState.markWalletUnread.mockClear()
  })

  it('ignores local previews, call lifecycle events, and payloads without a local wallet', async () => {
    await markWalletUnreadFromNotification({
      localPreview: true,
      conversationId: 'conversation-1',
      localWalletAddress: 'EXO_ROOT',
    })
    await markWalletUnreadFromNotification({
      type: 'call',
      callSessionId: 'call-1',
      localWalletAddress: 'EXO_ROOT',
    })
    await markWalletUnreadFromNotification({
      conversationId: 'conversation-1',
    })

    expect(mockState.markWalletUnread).not.toHaveBeenCalled()
  })

  it('marks an inactive unlocked wallet unread from a chat notification', async () => {
    mockState.walletState.wallet = { address: 'EXO_ACTIVE' }
    mockState.walletState.wallets = [
      { address: 'EXO_ACTIVE' },
      { address: 'EXO_INACTIVE' },
      { address: 'EXO_SPECTRE', spectreMode: true },
    ]

    await markWalletUnreadFromNotification({
      conversationId: 'conversation-1',
      localWalletAddress: ' EXO_INACTIVE ',
    }, {
      requireInactiveWallet: true,
      requireUnlockedWallet: true,
    })

    expect(mockState.markWalletUnread).toHaveBeenCalledWith('EXO_INACTIVE')
  })

  it('marks an inactive unlocked wallet unread from a sealed direct notification', async () => {
    mockState.walletState.wallet = { address: 'EXO_ACTIVE' }
    mockState.walletState.wallets = [
      { address: 'EXO_ACTIVE' },
      { address: 'EXO_INACTIVE' },
    ]

    await markWalletUnreadFromNotification({
      type: 'sealed_direct_message',
      localWalletAddress: 'EXO_INACTIVE',
      messageId: 'message-1',
    }, {
      requireInactiveWallet: true,
      requireUnlockedWallet: true,
    })

    expect(mockState.markWalletUnread).toHaveBeenCalledWith('EXO_INACTIVE')
  })

  it('skips active, locked, and Spectre-only wallet matches when required', async () => {
    mockState.walletState.wallet = { address: 'EXO_ACTIVE' }
    mockState.walletState.wallets = [
      { address: 'EXO_ACTIVE' },
      { address: 'EXO_SPECTRE', spectreMode: true },
    ]

    await markWalletUnreadFromNotification({
      conversationId: 'conversation-1',
      localWalletAddress: 'EXO_ACTIVE',
    }, {
      requireInactiveWallet: true,
      requireUnlockedWallet: true,
    })
    await markWalletUnreadFromNotification({
      conversationId: 'conversation-2',
      localWalletAddress: 'EXO_MISSING',
    }, {
      requireUnlockedWallet: true,
    })
    await markWalletUnreadFromNotification({
      conversationId: 'conversation-3',
      localWalletAddress: 'EXO_SPECTRE',
    }, {
      requireUnlockedWallet: true,
    })

    expect(mockState.markWalletUnread).not.toHaveBeenCalled()
  })
})
