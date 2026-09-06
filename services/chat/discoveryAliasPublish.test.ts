/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  patchOwnDiscoveryAlias: vi.fn(async () => 'updated' as 'updated' | 'missing'),
  getIdentity: vi.fn(() => ({ id: 'identity-id' })),
  ensureOwnContactProfile: vi.fn(async () => ({ displayName: '@Peter' })),
  readAliasAutocomplete: vi.fn(async () => true),
  readDiscoveryVisibility: vi.fn(async () => 'findable' as 'findable' | 'private'),
  ensureActiveDiscoveryRent: vi.fn(async () => {}),
  wallet: {
    address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    spectreMode: false,
  } as { address: string; spectreMode: boolean } | null,
}))

vi.mock('@/services/backend/ephemeralDiscovery', () => ({
  patchOwnDiscoveryAlias: mocks.patchOwnDiscoveryAlias,
}))

vi.mock('@/services/backend/request', () => ({
  SpectraBackendError: class SpectraBackendError extends Error {
    readonly status: number
    readonly code: string
    constructor(status: number, code: string) {
      super(`Spectra backend ${status}: ${code}`)
      this.name = 'SpectraBackendError'
      this.status = status
      this.code = code
    }
  },
}))

vi.mock('@/services/quantumChat', () => ({
  getIdentity: mocks.getIdentity,
}))

vi.mock('./contactProfile', () => ({
  ensureOwnContactProfile: mocks.ensureOwnContactProfile,
}))

vi.mock('./aliasAutocompleteStorage', () => ({
  readAliasAutocomplete: mocks.readAliasAutocomplete,
}))

vi.mock('./discoveryModeStorage', () => ({
  readDiscoveryVisibility: mocks.readDiscoveryVisibility,
}))

vi.mock('./activeDiscoveryCoordinator', () => ({
  ensureActiveDiscoveryRent: mocks.ensureActiveDiscoveryRent,
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({ wallet: mocks.wallet }),
  },
}))

const { syncLiveDiscoveryAlias } = await import('./discoveryAliasPublish')

describe('syncLiveDiscoveryAlias', () => {
  beforeEach(() => {
    mocks.patchOwnDiscoveryAlias.mockReset()
    mocks.patchOwnDiscoveryAlias.mockResolvedValue('updated')
    mocks.getIdentity.mockClear()
    mocks.ensureOwnContactProfile.mockClear()
    mocks.readAliasAutocomplete.mockClear()
    mocks.readDiscoveryVisibility.mockReset()
    mocks.readDiscoveryVisibility.mockResolvedValue('findable')
    mocks.ensureActiveDiscoveryRent.mockReset()
    mocks.wallet = {
      address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      spectreMode: false,
    }
    mocks.getIdentity.mockReturnValue({ id: 'identity-id' })
    mocks.ensureOwnContactProfile.mockResolvedValue({ displayName: '@Peter' })
    mocks.readAliasAutocomplete.mockResolvedValue(true)
  })

  it('patches the live Findable alias from the saved profile', async () => {
    await syncLiveDiscoveryAlias()
    expect(mocks.patchOwnDiscoveryAlias).toHaveBeenCalledWith({
      discoveryAlias: '@Peter',
      aliasAutocomplete: true,
    })
    expect(mocks.ensureActiveDiscoveryRent).not.toHaveBeenCalled()
  })

  it('does not send alias fields while Spectre Mode is on', async () => {
    mocks.wallet = {
      address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      spectreMode: true,
    }
    await syncLiveDiscoveryAlias()
    expect(mocks.patchOwnDiscoveryAlias).toHaveBeenCalledWith({})
    expect(mocks.ensureOwnContactProfile).not.toHaveBeenCalled()
    expect(mocks.ensureActiveDiscoveryRent).not.toHaveBeenCalled()
  })

  it('re-rents Findable when the live lease is missing', async () => {
    mocks.patchOwnDiscoveryAlias
      .mockResolvedValueOnce('missing')
      .mockResolvedValueOnce('updated')

    await syncLiveDiscoveryAlias()
    expect(mocks.readDiscoveryVisibility).toHaveBeenCalledWith(
      'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    )
    expect(mocks.ensureActiveDiscoveryRent).toHaveBeenCalledTimes(1)
    expect(mocks.patchOwnDiscoveryAlias).toHaveBeenCalledTimes(2)
  })

  it('does not rent when visibility is private', async () => {
    mocks.patchOwnDiscoveryAlias.mockResolvedValue('missing')
    mocks.readDiscoveryVisibility.mockResolvedValue('private')

    await syncLiveDiscoveryAlias()
    expect(mocks.ensureActiveDiscoveryRent).not.toHaveBeenCalled()
  })

  it('fails when Findable re-rent still has no live lease', async () => {
    mocks.patchOwnDiscoveryAlias.mockResolvedValue('missing')

    await expect(syncLiveDiscoveryAlias()).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    })
    expect(mocks.ensureActiveDiscoveryRent).toHaveBeenCalledTimes(1)
  })
})
