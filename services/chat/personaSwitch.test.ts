/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => {
  const wallet = {
    id: 'wallet-1',
    address: 'EXO00ABCDEFabcdefABCDEFabcdefABCDEFabcdefAB',
    publicKey: 'public-key',
    privateKey: 'private-key',
    displayName: 'Main EXO',
    createdAt: 1,
  }

  const walletState = {
    wallet: null as typeof wallet | null,
    wallets: [wallet],
    switchWallet: vi.fn((walletId: string) => {
      walletState.wallet = walletState.wallets.find((entry) => entry.id === walletId) ?? null
    }),
  }

  return {
    wallet,
    walletState,
    authState: {
      setAuthenticated: vi.fn(),
    },
    spectreState: {
      enabled: false,
      isApplying: false,
    },
    chatState: {
      setStorageScope: vi.fn(),
    },
    notificationState: {
      clearWalletUnread: vi.fn(async () => undefined),
    },
    cleanupChat: vi.fn(),
    waitForChatQuiescence: vi.fn(async () => undefined),
    realignChatForActiveWallet: vi.fn(async () => {}),
    prepareAsyncStorageScope: vi.fn(async () => undefined),
    setActiveGroupStorageScope: vi.fn(),
    consumePendingMessagingNotifications: vi.fn(async () => false),
    invalidateAuthCaches: vi.fn(),
    prepareActiveWalletPushHandoff: vi.fn(async () => undefined),
    synchronizeActiveWalletPushRegistration: vi.fn(async () => true),
  }
})

vi.mock('@/services/storage', () => ({
  prepareAsyncStorageScope: mockState.prepareAsyncStorageScope,
}))

vi.mock('@/services/groupChat/storage', () => ({
  setActiveGroupStorageScope: mockState.setActiveGroupStorageScope,
}))

vi.mock('@/services/backend/session', () => ({
  invalidateAuthCaches: mockState.invalidateAuthCaches,
}))

vi.mock('@/services/notifications/notificationCoordinator', () => ({
  consumePendingMessagingNotifications: mockState.consumePendingMessagingNotifications,
}))

vi.mock('@/services/notifications/registrationCoordinator', () => ({
  prepareActiveWalletPushHandoff: mockState.prepareActiveWalletPushHandoff,
  synchronizeActiveWalletPushRegistration: mockState.synchronizeActiveWalletPushRegistration,
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => mockState.authState,
  },
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: {
    getState: () => mockState.chatState,
  },
}))

vi.mock('@/store/exoAccountNotificationStore', () => ({
  useExoAccountNotificationStore: {
    getState: () => mockState.notificationState,
  },
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: {
    getState: () => mockState.spectreState,
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => mockState.walletState,
  },
}))

vi.mock('./chatService', () => ({
  cleanupChat: mockState.cleanupChat,
  realignChatForActiveWallet: mockState.realignChatForActiveWallet,
  waitForChatQuiescence: mockState.waitForChatQuiescence,
}))

import { activateChatPersona, activateChatPersonaByAddress } from './personaSwitch'

describe('activateChatPersonaByAddress', () => {
  beforeEach(() => {
    mockState.walletState.wallet = null
    mockState.walletState.wallets = [mockState.wallet]
    mockState.spectreState.enabled = false
    mockState.spectreState.isApplying = false
    vi.clearAllMocks()
    mockState.walletState.switchWallet.mockImplementation((walletId: string) => {
      mockState.walletState.wallet = mockState.walletState.wallets.find(
        (entry) => entry.id === walletId,
      ) ?? null
    })
  })

  it('matches route wallet addresses regardless of account-scope casing', async () => {
    const selectedWallet = await activateChatPersonaByAddress(mockState.wallet.address.toLowerCase(), {
      verifyCloudBinding: false,
    })

    expect(selectedWallet).toBe(mockState.wallet)
    expect(mockState.walletState.switchWallet).toHaveBeenCalledWith(mockState.wallet.id)
    expect(mockState.authState.setAuthenticated).toHaveBeenCalledWith(
      mockState.wallet.address,
      mockState.wallet.publicKey,
    )
    expect(mockState.prepareAsyncStorageScope).toHaveBeenCalledWith(mockState.wallet.address, {
      allowLegacyMigration: true,
    })
    expect(mockState.setActiveGroupStorageScope).toHaveBeenCalledWith(mockState.wallet.address)
    expect(mockState.chatState.setStorageScope).toHaveBeenCalledWith(mockState.wallet.address, {
      allowLegacyMigration: true,
    })
    expect(mockState.synchronizeActiveWalletPushRegistration).not.toHaveBeenCalled()
    expect(mockState.realignChatForActiveWallet).toHaveBeenCalled()
    expect(mockState.consumePendingMessagingNotifications).toHaveBeenCalledWith('persona_activation')
  })

  it('cleans up chat before switching to a different local account', async () => {
    mockState.walletState.wallet = {
      ...mockState.wallet,
      id: 'current-wallet',
      address: 'EXO00BBBBBBbbbbbbBBBBBBbbbbbbBBBBBBbbbbbbBB',
    }

    await activateChatPersonaByAddress(mockState.wallet.address, {
      verifyCloudBinding: false,
    })

    expect(mockState.cleanupChat).toHaveBeenCalled()
    expect(mockState.prepareActiveWalletPushHandoff).toHaveBeenCalled()
    expect(mockState.waitForChatQuiescence).toHaveBeenCalled()
    expect(mockState.invalidateAuthCaches).toHaveBeenCalled()
    expect(mockState.prepareActiveWalletPushHandoff.mock.invocationCallOrder[0])
      .toBeLessThan(mockState.cleanupChat.mock.invocationCallOrder[0])
    expect(mockState.cleanupChat.mock.invocationCallOrder[0])
      .toBeLessThan(mockState.waitForChatQuiescence.mock.invocationCallOrder[0])
    expect(mockState.waitForChatQuiescence.mock.invocationCallOrder[0])
      .toBeLessThan(mockState.walletState.switchWallet.mock.invocationCallOrder[0])
    expect(mockState.invalidateAuthCaches.mock.invocationCallOrder[0])
      .toBeLessThan(mockState.walletState.switchWallet.mock.invocationCallOrder[0])
  })

  it('rejects persona changes while Spectre is active or transitioning', async () => {
    mockState.spectreState.enabled = true

    await expect(
      activateChatPersonaByAddress(mockState.wallet.address, { verifyCloudBinding: false }),
    ).rejects.toThrow('Disable Spectre Mode before switching EXO accounts')

    mockState.spectreState.enabled = false
    mockState.spectreState.isApplying = true

    await expect(
      activateChatPersona(mockState.wallet.id, { verifyCloudBinding: false }),
    ).rejects.toThrow('Disable Spectre Mode before switching EXO accounts')

    expect(mockState.walletState.switchWallet).not.toHaveBeenCalled()
    expect(mockState.authState.setAuthenticated).not.toHaveBeenCalled()
  })

  it('serializes concurrent persona switches', async () => {
    const secondWallet = {
      ...mockState.wallet,
      id: 'wallet-2',
      address: 'EXO00BBBBBBbbbbbbBBBBBBbbbbbbBBBBBBbbbbbbBB',
    }
    mockState.walletState.wallets = [mockState.wallet, secondWallet]
    let releaseFirst!: () => void
    mockState.walletState.switchWallet.mockImplementation(async (walletId: string) => {
      if (walletId === mockState.wallet.id) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
      }
      mockState.walletState.wallet = mockState.walletState.wallets.find(
        (entry) => entry.id === walletId,
      ) ?? null
    })

    const first = activateChatPersona(mockState.wallet.id, { verifyCloudBinding: false })
    await vi.waitFor(() => {
      expect(mockState.walletState.switchWallet).toHaveBeenCalledTimes(1)
    })
    const second = activateChatPersona(secondWallet.id, { verifyCloudBinding: false })
    await Promise.resolve()
    expect(mockState.walletState.switchWallet).toHaveBeenCalledTimes(1)

    releaseFirst()
    await Promise.all([first, second])

    expect(mockState.walletState.switchWallet).toHaveBeenNthCalledWith(2, secondWallet.id)
    expect(mockState.walletState.wallet).toBe(secondWallet)
  })
})
