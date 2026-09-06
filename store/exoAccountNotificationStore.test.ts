/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  storage: new Map<string, string>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockState.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockState.storage.set(key, value)
    }),
  },
}))

describe('useExoAccountNotificationStore', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.storage.clear()
  })

  it('persists unread wallet markers without duplicates', async () => {
    const { STORAGE_KEYS } = await import('@/lib/constants')
    const { useExoAccountNotificationStore } = await import('./exoAccountNotificationStore')

    await useExoAccountNotificationStore.getState().markWalletUnread('EXO00work')
    await useExoAccountNotificationStore.getState().markWalletUnread('EXO00work')
    await useExoAccountNotificationStore.getState().markWalletUnread('EXO00friends')

    expect(useExoAccountNotificationStore.getState().unreadWalletAddresses).toEqual([
      'EXO00work',
      'EXO00friends',
    ])
    expect(JSON.parse(mockState.storage.get(STORAGE_KEYS.EXO_ACCOUNT_UNREAD_NOTIFICATIONS) ?? '[]')).toEqual([
      'EXO00work',
      'EXO00friends',
    ])
  })

  it('hydrates and clears a wallet marker', async () => {
    const { STORAGE_KEYS } = await import('@/lib/constants')
    mockState.storage.set(
      STORAGE_KEYS.EXO_ACCOUNT_UNREAD_NOTIFICATIONS,
      JSON.stringify(['EXO00work', 'EXO00friends']),
    )

    const { useExoAccountNotificationStore } = await import('./exoAccountNotificationStore')

    await useExoAccountNotificationStore.getState().hydrate()
    await useExoAccountNotificationStore.getState().clearWalletUnread('EXO00work')

    expect(useExoAccountNotificationStore.getState().unreadWalletAddresses).toEqual(['EXO00friends'])
    expect(JSON.parse(mockState.storage.get(STORAGE_KEYS.EXO_ACCOUNT_UNREAD_NOTIFICATIONS) ?? '[]')).toEqual([
      'EXO00friends',
    ])
  })
})
