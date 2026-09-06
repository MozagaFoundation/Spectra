/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  invalidateQueries: vi.fn(async () => {}),
  refreshNotifications: vi.fn(async () => {}),
  registerWakeup: vi.fn((handler: () => void) => {
    mockState.wakeupHandler = handler
    return () => {
      if (mockState.wakeupHandler === handler) mockState.wakeupHandler = null
    }
  }),
  syncDeliveries: vi.fn(async () => ({
    appliedEventIds: [],
    leaseStateChanged: false,
  })),
  syncGlobalBadge: vi.fn(async () => {}),
  wakeupHandler: null as null | (() => void),
  wallet: {
    address: 'EXO0000000000000000000000000000000000000000',
    spectreMode: false,
  },
  isVaultUnlocked: true,
}))

vi.mock('react-native', async () => await import('../test/react-native'))

vi.mock('@tanstack/react-query', async () => {
  const ReactActual = await import('react')
  return {
    useQueryClient: () => ({
      invalidateQueries: mockState.invalidateQueries,
    }),
    QueryClientProvider: ({ children }: { children: ReactActual.ReactNode }) => children,
  }
})

vi.mock('@/lib/accountScope', () => ({
  isSameAccountStorageScope: () => true,
}))

vi.mock('@/services/notifications/badgeSync', () => ({
  syncGlobalBadge: mockState.syncGlobalBadge,
}))

vi.mock('@/services/notifications/walletIndexWakeup', () => ({
  registerWalletIndexWakeupHandler: mockState.registerWakeup,
}))

vi.mock('@/services/wallet/walletIndexDelivery', () => ({
  syncWalletIndexDeliveries: mockState.syncDeliveries,
}))

vi.mock('@/store/walletTransferNotificationStore', () => ({
  useWalletTransferNotificationStore: {
    getState: () => ({ refresh: mockState.refreshNotifications }),
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      isVaultUnlocked: mockState.isVaultUnlocked,
      wallet: mockState.wallet,
    }),
  },
}))

vi.mock('@/services/crypto/portfolioBalances', () => ({
  cryptoPortfolioWalletKey: (wallet: { address: string }) => wallet.address,
}))

const { renderHook } = await import('../test/hookTestHarness')
const { useWalletIndexDelivery } = await import('./useWalletIndexDelivery')

describe('useWalletIndexDelivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.wakeupHandler = null
    mockState.isVaultUnlocked = true
    mockState.wallet = {
      address: 'EXO0000000000000000000000000000000000000000',
      spectreMode: false,
    }
  })

  it('syncs on mount and wakeup without a session-wide interval', async () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    const { unmount } = renderHook(() => useWalletIndexDelivery(mockState.wallet as any))

    expect(mockState.syncDeliveries).toHaveBeenCalledTimes(1)
    expect(intervalSpy.mock.calls.some((call) => call[1] === 60_000)).toBe(false)

    mockState.wakeupHandler?.()
    await Promise.resolve()
    expect(mockState.syncDeliveries).toHaveBeenCalledWith(mockState.wallet, { force: true })

    unmount()
    intervalSpy.mockRestore()
  })

  it('does not start wallet-index delivery for Spectre wallets', () => {
    mockState.wallet = {
      ...mockState.wallet,
      spectreMode: true,
    }
    renderHook(() => useWalletIndexDelivery(mockState.wallet as any))
    expect(mockState.syncDeliveries).not.toHaveBeenCalled()
    expect(mockState.registerWakeup).not.toHaveBeenCalled()
  })
})
