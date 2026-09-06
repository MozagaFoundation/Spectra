/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createOneTimeContactCardInvite } from '@/lib/contactInvite'
import { STORAGE_KEYS } from '@/lib/constants'

const secureState = vi.hoisted(() => ({
  data: new Map<string, string>(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: secureState.getItemAsync,
  setItemAsync: secureState.setItemAsync,
  deleteItemAsync: secureState.deleteItemAsync,
}))

const {
  clearAllPersistedContactCards,
  deletePersistedContactCard,
  readPersistedContactCard,
  writePersistedContactCard,
} = await import('./oneTimeContactCardStorage')

const walletAddress = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const card = {
  cardId: `scc1.${'a'.repeat(32)}`,
  invite: createOneTimeContactCardInvite({
    cardId: `scc1.${'a'.repeat(32)}`,
    cardCapability: `sccap1.${'A'.repeat(43)}`,
    profileCapability: `sccpc1.${'B'.repeat(43)}`,
  }),
  expiresAt: Date.now() + 60_000,
  identityId: 'identity-local',
  walletAddress,
}

describe('one-time contact card storage', () => {
  beforeEach(() => {
    secureState.data.clear()
    secureState.getItemAsync.mockReset()
    secureState.setItemAsync.mockReset()
    secureState.deleteItemAsync.mockReset()
    secureState.getItemAsync.mockImplementation(async (key: string) => secureState.data.get(key) ?? null)
    secureState.setItemAsync.mockImplementation(async (key: string, value: string) => {
      secureState.data.set(key, value)
    })
    secureState.deleteItemAsync.mockImplementation(async (key: string) => {
      secureState.data.delete(key)
    })
  })

  it('round-trips a live card for the owning wallet', async () => {
    await writePersistedContactCard(card)

    await expect(readPersistedContactCard(walletAddress)).resolves.toEqual(card)
    expect(secureState.data.has(STORAGE_KEYS.ONE_TIME_CONTACT_CARD)).toBe(true)
  })

  it('ignores an expired or malformed persisted card', async () => {
    secureState.data.set(
      STORAGE_KEYS.ONE_TIME_CONTACT_CARD,
      JSON.stringify({
        [walletAddress.toLowerCase()]: { ...card, expiresAt: Date.now() - 1 },
      }),
    )
    await expect(readPersistedContactCard(walletAddress)).resolves.toBeNull()

    secureState.data.set(STORAGE_KEYS.ONE_TIME_CONTACT_CARD, '{"not":"valid"}')
    await expect(readPersistedContactCard(walletAddress)).resolves.toBeNull()
  })

  it('removes a wallet card without leaving an empty store entry', async () => {
    await writePersistedContactCard(card)
    await deletePersistedContactCard(walletAddress)
    await clearAllPersistedContactCards()

    expect(secureState.data.has(STORAGE_KEYS.ONE_TIME_CONTACT_CARD)).toBe(false)
  })
})
