/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const token = {
  algorithm: 'rsa-fdh-v1' as const,
  domain: 'spectra.mobile.account-ticket.v1.spectre_ephemeral',
  isEphemeral: true,
  keyId: 'test-key',
  nullifierHex: '11'.repeat(32),
  purpose: 'spectre_ephemeral' as const,
  signatureHex: '22'.repeat(256),
  walletAddress: `EXO00${'b'.repeat(38)}`,
}

const mockState = vi.hoisted(() => ({
  ensureVerifiedBackendAccess: vi.fn(async () => null),
  getCachedBackendAccessToken: vi.fn(() => 'access-token'),
  persistStoredBlindToken: vi.fn(async () => undefined),
  readPendingRemoteActivationWalletAddress: vi.fn(async () => null),
  readStoredBlindToken: vi.fn(async () => null),
  recordAppUpdateRequiredResponse: vi.fn(),
  removeStoredBlindTokens: vi.fn(async () => undefined),
  setAccess: vi.fn(async () => undefined),
  setLastError: vi.fn(),
  setRefreshing: vi.fn(),
  torAwareFetch: vi.fn(),
  writePendingRemoteActivationWalletAddress: vi.fn(async () => undefined),
}))

function activationGrant(walletAddress = token.walletAddress) {
  return {
    access: {
      canRequestEphemeralToken: false,
      currentSpectreExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      currentSpectreIsEphemeral: true,
      currentWalletIsSpectre: true,
      refreshedAt: new Date().toISOString(),
      spectreTokenAvailableAt: null,
      spectreTokenLastIssuedAt: null,
      walletAddress,
    },
    activatedWalletAddress: walletAddress,
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    isEphemeral: true,
  }
}

vi.mock('@/lib/constants', () => ({
  SPECTRA_API_URL: 'https://api.example.test',
}))

vi.mock('@/lib/i18n/messages', () => ({
  translateMessage: (message: string) => message,
}))

vi.mock('@/services/backend/session', () => ({
  ensureVerifiedBackendAccess: mockState.ensureVerifiedBackendAccess,
  getCachedBackendAccessToken: mockState.getCachedBackendAccessToken,
}))

vi.mock('./torBlindTokenStorage', () => ({
  persistStoredBlindToken: mockState.persistStoredBlindToken,
  readStoredBlindToken: mockState.readStoredBlindToken,
  removeStoredBlindTokens: mockState.removeStoredBlindTokens,
}))

vi.mock('./spectreActivationStorage', () => ({
  readPendingRemoteActivationWalletAddress: mockState.readPendingRemoteActivationWalletAddress,
  writePendingRemoteActivationWalletAddress: mockState.writePendingRemoteActivationWalletAddress,
}))

vi.mock('@/services/tor/torFetch', () => ({
  torAwareFetch: mockState.torAwareFetch,
}))

vi.mock('./appVersion', () => ({
  getAppVersionHeaders: () => ({
    'X-Spectra-App-Version': '1.2.5',
    'X-Spectra-Client-Platform': 'ios',
  }),
}))

vi.mock('./request', () => ({
  recordAppUpdateRequiredResponse: mockState.recordAppUpdateRequiredResponse,
}))

vi.mock('@/store/spectreAccessStore', () => ({
  useSpectreAccessStore: {
    getState: () => ({
      access: null,
      initialize: vi.fn(async () => undefined),
      setAccess: mockState.setAccess,
      setLastError: mockState.setLastError,
      setRefreshing: mockState.setRefreshing,
    }),
  },
}))

describe('spectreAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.getCachedBackendAccessToken.mockReturnValue('access-token')
    mockState.torAwareFetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(activationGrant()),
    })
  })

  it('redeems a token through the Spectre activation route', async () => {
    const { redeemSpectreBlindActivationToken } = await import('./spectreAccess')

    await redeemSpectreBlindActivationToken(token)

    expect(mockState.torAwareFetch).toHaveBeenCalledWith(
      'https://api.example.test/v1/spectre/activation/redeem',
      expect.objectContaining({
        body: expect.stringContaining(`"walletAddress":"${token.walletAddress}"`),
        headers: expect.objectContaining({
          'X-Spectra-App-Version': '1.2.5',
          'X-Spectra-Client-Platform': 'ios',
        }),
      }),
    )
    expect(mockState.removeStoredBlindTokens).toHaveBeenCalledWith({
      isEphemeral: true,
      purpose: 'spectre_ephemeral',
      walletAddress: token.walletAddress,
    })
  })

  it('rejects a grant for a different wallet', async () => {
    mockState.torAwareFetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(activationGrant(`EXO00${'c'.repeat(38)}`)),
    })
    const { redeemSpectreBlindActivationToken } = await import('./spectreAccess')

    await expect(redeemSpectreBlindActivationToken(token))
      .rejects.toThrow('Invalid blind activation token')
    expect(mockState.removeStoredBlindTokens).not.toHaveBeenCalled()
  })

  it('does not expose malformed backend errors', async () => {
    mockState.torAwareFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'invalid_json' }),
    })
    const { redeemSpectreBlindActivationToken } = await import('./spectreAccess')

    await expect(redeemSpectreBlindActivationToken(token))
      .rejects.toThrow('Unable to complete Spectre activation')
  })

  it('reports a required update from the direct Spectre transport', async () => {
    mockState.torAwareFetch.mockResolvedValue({
      ok: false,
      status: 426,
      text: async () => JSON.stringify({
        error: 'app_update_required',
        platform: 'ios',
        minimumSupportedVersion: '1.2.1',
        latestVersion: '1.4.0',
        storeUrl: 'https://apps.apple.com/us/app/spectra/id1234567890',
        updateAvailable: true,
        updateRequired: true,
      }),
    })
    const { redeemSpectreBlindActivationToken } = await import('./spectreAccess')

    await expect(redeemSpectreBlindActivationToken(token))
      .rejects.toThrow('Unable to complete Spectre activation')
    expect(mockState.recordAppUpdateRequiredResponse).toHaveBeenCalledWith(
      426,
      expect.stringContaining('app_update_required'),
    )
  })

  it('closes the authenticated Spectre address without sending a wallet address', async () => {
    mockState.torAwareFetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        closed: true,
        reason: 'closed',
        walletAddress: token.walletAddress,
      }),
    })
    const { closeSpectreAddress } = await import('./spectreAccess')

    await closeSpectreAddress({ bootstrapIfNeeded: false })

    expect(mockState.torAwareFetch).toHaveBeenCalledWith(
      'https://api.example.test/v1/spectre/access/close',
      expect.objectContaining({ body: '{}' }),
    )
  })
})
