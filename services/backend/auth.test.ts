/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  torAwareFetch: vi.fn(),
}))

vi.mock('@/lib/constants', () => ({
  APP_VERSION: '1.2.5',
  SPECTRA_API_URL: 'https://api.spectra.test',
  STORAGE_KEYS: { VAULT: 'exo_vault' },
}))

vi.mock('@/services/tor/torFetch', () => ({
  torAwareFetch: mockState.torAwareFetch,
}))

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: vi.fn(async () => JSON.stringify(body)),
  } as unknown as Response
}

describe('Spectra backend auth adapter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('requests wallet auth challenges without bearer auth', async () => {
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({
      challenge: 'challenge',
      expiresAt: 1_700_000_000_000,
    }))
    const { requestWalletAuthChallengeWithBackend } = await import('./auth')

    const challenge = await requestWalletAuthChallengeWithBackend('EXO00abc')

    expect(challenge).toEqual({ challenge: 'challenge', expiresAt: 1_700_000_000_000 })
    expect(mockState.torAwareFetch).toHaveBeenCalledWith('https://api.spectra.test/v1/auth/wallet/challenge', expect.objectContaining({
      method: 'POST',
      headers: expect.not.objectContaining({ Authorization: expect.any(String) }),
    }))
  })

  it('maps verified wallet sessions to app auth sessions', async () => {
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({
      verified: true,
      identityId: 'identity-current',
      walletAddress: 'EXO00abc',
      verifiedAt: '2026-05-16T19:05:00.000Z',
      session: {
        accessToken: 'access',
        refreshToken: 'refresh',
        accessExpiresAt: 1_700_000_000_000,
        refreshExpiresAt: 1_800_000_000_000,
        sessionId: 'session-1',
        identityId: 'identity-current',
      },
    }))
    const { verifyWalletAuthChallengeWithBackend, BACKEND_AUTH_SESSION_METADATA_VERSION } = await import('./auth')

    const result = await verifyWalletAuthChallengeWithBackend({
      challenge: 'challenge',
      walletAddress: 'EXO00abc',
      publicKey: 'public',
      identityId: null,
      signature: 'signature',
    })

    expect(result.verified).toBe(true)
    expect(result.session).toMatchObject({
      exoAddress: 'EXO00abc',
      identityId: 'identity-current',
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: 1_700_000_000_000,
      metadataVersion: BACKEND_AUTH_SESSION_METADATA_VERSION,
    })
  })

  it('binds a locally verified identity with wallet-scoped bearer auth', async () => {
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({
      identityId: 'identity-current',
    }))
    const { bindPrivateChatIdentityWithBackend } = await import('./auth')
    const bundle = {
      identityId: 'identity-current',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      signedPreKey: {},
      oneTimePreKeys: [],
      version: 1,
      timestamp: 1,
    } as any

    await expect(bindPrivateChatIdentityWithBackend({
      identityId: 'identity-current',
      walletAddress: 'EXO00abc',
      recipientMailboxToken: 'smbx1.mailbox',
      bundle,
    }, { accessToken: 'wallet-session' })).resolves.toBe(true)

    expect(mockState.torAwareFetch).toHaveBeenCalledWith(
      'https://api.spectra.test/v1/chat/identity-bindings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer wallet-session' }),
        body: JSON.stringify({
          identityId: 'identity-current',
          walletAddress: 'EXO00abc',
          recipientMailboxToken: 'smbx1.mailbox',
          bundle,
        }),
      }),
    )
  })

  it('revokes backend sessions by refresh token', async () => {
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({ revoked: true }))
    const { revokeBackendSession } = await import('./auth')

    await revokeBackendSession('refresh-token')

    expect(mockState.torAwareFetch).toHaveBeenCalledWith('https://api.spectra.test/v1/auth/session/logout', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ refreshToken: 'refresh-token' }),
    }))
  })
})
