/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createProfile: vi.fn(),
  loadProfile: vi.fn(),
  saveProfile: vi.fn(),
}))

vi.mock('@spectra/core-crypto', () => ({
  createSignedContactProfile: mocks.createProfile,
  localChatStorage: {
    getIdentity: vi.fn(async () => ({
      dilithiumPrivateKey: 'private-key',
      dilithiumPublicKey: 'public-key',
    })),
  },
  normalizeContactProfileDisplayName: (value: string) => value.trim(),
  verifySignedContactProfile: vi.fn(() => true),
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      wallet: { address: 'EXO00alice0000000000000000000000000000000' },
      getActiveAddressBookKey: () => new Uint8Array(32),
    }),
  },
}))

vi.mock('@/services/storage/contactProfileStorage', () => ({
  loadContactProfile: mocks.loadProfile,
  saveContactProfile: mocks.saveProfile,
}))

const {
  clearOwnContactProfileMemoryCache,
  updateOwnContactProfile,
} = await import('./contactProfile')

describe('contact profile updates', () => {
  beforeEach(() => {
    clearOwnContactProfileMemoryCache()
    mocks.createProfile.mockReset()
    mocks.loadProfile.mockReset()
    mocks.saveProfile.mockReset()
  })

  it('serializes concurrent updates into strictly increasing revisions', async () => {
    mocks.loadProfile.mockResolvedValue({
      version: 1,
      identityId: 'identity-alice',
      revision: 1,
      signature: '0xinitial',
    })
    mocks.createProfile.mockImplementation((payload: Record<string, unknown>) => ({
      ...payload,
      signature: `0xrevision-${payload.revision}`,
    }))
    mocks.saveProfile.mockResolvedValue(undefined)

    const [nameProfile, avatarProfile] = await Promise.all([
      updateOwnContactProfile('identity-alice', { displayName: 'Alice' }),
      updateOwnContactProfile('identity-alice', { avatarDataUri: 'data:image/png;base64,AA==' }),
    ])

    expect(nameProfile.revision).toBe(2)
    expect(avatarProfile.revision).toBe(3)
    expect(avatarProfile.displayName).toBe('Alice')
    expect(mocks.createProfile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ revision: 2 }),
      'private-key',
    )
    expect(mocks.createProfile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ revision: 3 }),
      'private-key',
    )
  })
})
