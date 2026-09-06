/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'
import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'

import { STORAGE_KEYS } from '@/lib/constants'

function normalizeAddress(address: string | null | undefined): string | null {
  const trimmed = address?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

function parseStoredAddresses(raw: string | null): string[] {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

async function persistUnreadWalletAddresses(addresses: string[]): Promise<void> {
  await getAppKeyValueStorage().setItem(
    STORAGE_KEYS.EXO_ACCOUNT_UNREAD_NOTIFICATIONS,
    JSON.stringify(addresses),
  )
}

interface ExoAccountNotificationState {
  hydrated: boolean
  unreadWalletAddresses: string[]
  hydrate: () => Promise<void>
  markWalletUnread: (address: string) => Promise<void>
  clearWalletUnread: (address: string) => Promise<void>
  clearAllWalletUnread: () => Promise<void>
}

export const useExoAccountNotificationStore = create<ExoAccountNotificationState>((set, get) => ({
  hydrated: false,
  unreadWalletAddresses: [],

  hydrate: async () => {
    const stored = parseStoredAddresses(
      await getAppKeyValueStorage().getItem(STORAGE_KEYS.EXO_ACCOUNT_UNREAD_NOTIFICATIONS),
    )
    set({ hydrated: true, unreadWalletAddresses: [...new Set(stored)] })
  },

  markWalletUnread: async (address) => {
    if (!get().hydrated) {
      await get().hydrate()
    }

    const normalized = normalizeAddress(address)
    if (!normalized) return

    const current = get().unreadWalletAddresses
    if (current.includes(normalized)) {
      return
    }

    const next = [...current, normalized]
    set({ unreadWalletAddresses: next })
    await persistUnreadWalletAddresses(next)
  },

  clearWalletUnread: async (address) => {
    if (!get().hydrated) {
      await get().hydrate()
    }

    const normalized = normalizeAddress(address)
    if (!normalized) return

    const current = get().unreadWalletAddresses
    if (!current.includes(normalized)) {
      return
    }

    const next = current.filter((entry) => entry !== normalized)
    set({ unreadWalletAddresses: next })
    await persistUnreadWalletAddresses(next)
  },

  clearAllWalletUnread: async () => {
    if (!get().hydrated) {
      await get().hydrate()
    }

    set({ unreadWalletAddresses: [] })
    await persistUnreadWalletAddresses([])
  },
}))
