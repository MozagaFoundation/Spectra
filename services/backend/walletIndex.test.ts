/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
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

const address = `0x${'11'.repeat(20)}`
const activationId = `wia1.${'a'.repeat(32)}`
const challengeId = `vdfc1.${'b'.repeat(32)}`
const eventId = `wie1.${'c'.repeat(32)}`

describe('wallet index backend adapter', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('begins owner-bound activation with bearer authentication', async () => {
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({
      activationId,
      chain: 'ethereum',
      address,
      nonceHex: 'd'.repeat(64),
      expiresAt: 1_800_000_000_000,
    }))
    const { beginWalletIndexActivationWithBackend } = await import('./walletIndex')

    const result = await beginWalletIndexActivationWithBackend('ethereum', address, { accessToken: 'token' })

    expect(result).toMatchObject({ error: null, data: { activationId } })
    expect(mockState.torAwareFetch).toHaveBeenCalledWith(
      'https://api.spectra.test/v1/wallet-index/activations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        body: JSON.stringify({ chain: 'ethereum', address }),
      }),
    )
  })

  it('submits a proof before accepting an activation VDF challenge', async () => {
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({
      activationId,
      vdfChallenge: {
        challengeId,
        nonceHex: 'e'.repeat(64),
        bindingHash: 'f'.repeat(64),
        expiresAt: 1_800_000_000_000,
        notBeforeAt: 1_700_000_000_000,
        params: { parameterId: 'wallet-index-vdf' },
      },
    }))
    const { issueWalletIndexActivationVdfWithBackend } = await import('./walletIndex')
    const addressProof = {
      algorithm: 'secp256k1' as const,
      publicKeyHex: `04${'11'.repeat(64)}`,
      signatureHex: '22'.repeat(64),
    }

    const result = await issueWalletIndexActivationVdfWithBackend(
      activationId,
      addressProof,
      { accessToken: 'token' },
    )

    expect(result).toMatchObject({
      error: null,
      data: { activationId, vdfChallenge: { challengeId } },
    })
    expect(mockState.torAwareFetch).toHaveBeenCalledWith(
      'https://api.spectra.test/v1/wallet-index/activations/vdf-challenge',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ activationId, addressProof }),
      }),
    )
  })

  it('rejects malformed deliveries rather than persisting them locally', async () => {
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({
      events: [{
        eventId,
        chain: 'ethereum',
        addressHash: 'a'.repeat(64),
        leaseGeneration: 1,
        kind: 'transaction',
        payload: {},
        createdAt: 1_700_000_000_000,
        expiresAt: 1_800_000_000_000,
      }, {
        eventId: 'invalid',
      }],
      activeLeases: [],
    }))
    const { getWalletIndexDeliveriesWithBackend } = await import('./walletIndex')

    const result = await getWalletIndexDeliveriesWithBackend({ accessToken: 'token' })

    expect(result.data).toEqual([])
    expect(result.error?.message).toBe('Invalid wallet delivery response')
  })

  it('returns the server-authoritative active lease state with deliveries', async () => {
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({
      events: [],
      activeLeases: [{
        chain: 'ethereum',
        address,
        leaseGeneration: 2,
        baselineHeight: 100,
        activatedAt: 1_700_000_000_000,
        expiresAt: 1_800_000_000_000,
      }],
    }))
    const { getWalletIndexDeliveriesWithBackend } = await import('./walletIndex')

    const result = await getWalletIndexDeliveriesWithBackend({ accessToken: 'token' })

    expect(result).toEqual({
      data: [],
      activeLeases: [{
        chain: 'ethereum',
        address,
        leaseGeneration: 2,
        baselineHeight: 100,
        activatedAt: 1_700_000_000_000,
        expiresAt: 1_800_000_000_000,
      }],
      error: null,
    })
  })

  it('acknowledges only explicit delivery identifiers', async () => {
    mockState.torAwareFetch.mockResolvedValue(jsonResponse({ acknowledgedEventIds: [eventId] }))
    const { acknowledgeWalletIndexDeliveriesWithBackend } = await import('./walletIndex')

    const result = await acknowledgeWalletIndexDeliveriesWithBackend([eventId], { accessToken: 'token' })

    expect(result).toEqual({ data: [eventId], error: null })
    expect(mockState.torAwareFetch).toHaveBeenCalledWith(
      'https://api.spectra.test/v1/wallet-index/deliveries/ack',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ eventIds: [eventId] }),
      }),
    )
  })
})
