/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  SpectraBackendError: class SpectraBackendError extends Error {
    constructor(
      readonly status: number,
      readonly code: string | null = null,
    ) {
      super(code ? `backend ${status}: ${code}` : `backend ${status}`)
    }
  },
  backendRequest: vi.fn(),
  ensureBackendSession: vi.fn(),
  hashBinding: vi.fn(),
  mailboxToken: vi.fn(),
  retry: vi.fn(),
  sealProfile: vi.fn(),
  solve: vi.fn(),
  verifyProfile: vi.fn(),
  wait: vi.fn(),
}))

vi.mock('@spectra/core-crypto', () => ({
  deriveRecipientMailboxToken: mocks.mailboxToken,
  sealContactCardProfile: mocks.sealProfile,
  verifySignedContactProfile: mocks.verifyProfile,
}))
vi.mock('@spectra/privacy-protocol', () => ({
  hashVdfBinding: mocks.hashBinding,
}))
vi.mock('./request', () => ({
  backendRequest: mocks.backendRequest,
  SpectraBackendError: mocks.SpectraBackendError,
}))
vi.mock('./session', () => ({
  ensureBackendSession: mocks.ensureBackendSession,
}))
vi.mock('./vdfChallengeTiming', () => ({
  retryVdfSubmissionAfterServerFloor: mocks.retry,
  waitForVdfChallengeAge: mocks.wait,
}))
vi.mock('@/services/security/nativeVdf', () => ({
  solveVdfOnDevice: mocks.solve,
}))

const {
  canReuseReservedContactCardPreKey,
  claimSessionOpk,
  createOneTimeContactCard,
  extendActiveDiscoveryLease,
  fetchOwnDiscoveryLease,
  isOwnOneTimeContactCardActive,
  patchOwnDiscoveryAlias,
  publishPublicDiscoveryLease,
  unpublishPublicDiscovery,
} = await import('./ephemeralDiscovery')
const { subscribeToVdfActivity, beginVdfActivity } = await import('../shared/vdfActivity')

describe('ephemeral discovery VDF activity', () => {
  let unsubscribe: (() => void) | null = null

  async function rejectContactCard(error: InstanceType<typeof mocks.SpectraBackendError>) {
    mocks.ensureBackendSession.mockResolvedValue({ accessToken: 'access-token' })
    mocks.mailboxToken.mockReturnValue('smbx1.mailbox-token')
    mocks.verifyProfile.mockReturnValue(true)
    mocks.sealProfile.mockReturnValue({
      version: 1,
      ciphertext: 'ciphertext',
      nonce: 'nonce',
      tag: 'tag',
    })
    mocks.hashBinding.mockReturnValue('binding-hash')
    mocks.backendRequest.mockImplementation(async (path: string) => {
      if (path === '/v1/chat/discovery/vdf-challenges') {
        return {
          challengeId: 'vdfc1.contact-card',
          nonceHex: 'ab'.repeat(32),
          expiresAt: Date.now() + 60_000,
          notBeforeAt: Date.now(),
          params: {
            algorithm: 'wesolowski-rsa-v1',
            domain: 'spectra.discovery.vdf.v1',
            parameterId: 'test-v1',
            modulusHex: 'a'.repeat(512),
            iterations: 200_000,
          },
        }
      }
      throw error
    })
    mocks.solve.mockResolvedValue({ outputHex: '01', proofHex: '02' })
    mocks.wait.mockResolvedValue(undefined)
    mocks.retry.mockImplementation(async (submit: () => Promise<unknown>) => await submit())

    try {
      await createOneTimeContactCard(
        'identity-local',
        'exo1wallet',
        { identityId: 'identity-local', dilithiumKey: 'dilithium-key' } as any,
        { id: 1, x25519PublicKey: 'x', mlkemPublicKey: 'm' },
        {
          version: 1,
          identityId: 'identity-local',
          revision: 1,
          signature: '0xsignature',
        },
      )
      return undefined
    } catch (failure) {
      return failure
    }
  }

  afterEach(() => {
    unsubscribe?.()
    unsubscribe = null
    mocks.backendRequest.mockReset()
    mocks.ensureBackendSession.mockReset()
    mocks.hashBinding.mockReset()
    mocks.mailboxToken.mockReset()
    mocks.retry.mockReset()
    mocks.sealProfile.mockReset()
    mocks.solve.mockReset()
    mocks.verifyProfile.mockReset()
    mocks.wait.mockReset()
  })

  it('checks one-time card status through the owner-authorized endpoint', async () => {
    const cardId = `scc1.${'a'.repeat(32)}`
    mocks.ensureBackendSession.mockResolvedValue({ accessToken: 'access-token' })
    mocks.backendRequest.mockResolvedValue({ active: false })

    await expect(isOwnOneTimeContactCardActive(cardId)).resolves.toBe(false)

    expect(mocks.backendRequest).toHaveBeenCalledWith(
      `/v1/chat/contact-cards/${cardId}/owner-status`,
      { method: 'POST' },
      { accessToken: 'access-token' },
    )
    expect(mocks.hashBinding).not.toHaveBeenCalled()
    expect(mocks.solve).not.toHaveBeenCalled()
  })

  it('reports and submits a VDF-bound discovery lease', async () => {
    const notBeforeAt = Date.now() + 15_000
    const onProgress = vi.fn()
    mocks.ensureBackendSession.mockResolvedValue({ accessToken: 'access-token' })
    mocks.mailboxToken.mockReturnValue('smbx1.mailbox-token')
    mocks.hashBinding.mockReturnValue('binding-hash')
    mocks.backendRequest.mockImplementation(async (path: string) => {
      if (path === '/v1/chat/discovery/vdf-challenges') {
        return {
          challengeId: 'vdfc1.discovery',
          nonceHex: 'ab'.repeat(32),
          expiresAt: Date.now() + 60_000,
          notBeforeAt,
          params: {
            algorithm: 'wesolowski-rsa-v1',
            domain: 'spectra.discovery.vdf.v1',
            parameterId: 'test-v1',
            modulusHex: 'a'.repeat(512),
            iterations: 200_000,
          },
        }
      }
      if (path === '/v1/chat/bundles') {
        return { expiresAt: Date.now() + 300_000 }
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    mocks.solve.mockImplementation(async (_params: unknown, _input: unknown, options: {
      onProgress?: (progress: { phase: 'evaluate' | 'prove'; completedIterations: number; totalIterations: number }) => void
    }) => {
      options.onProgress?.({
        phase: 'evaluate',
        completedIterations: 100,
        totalIterations: 400_000,
      })
      return { outputHex: '01', proofHex: '02' }
    })
    mocks.wait.mockImplementation(async (
      earliest: number,
      _signal: AbortSignal | undefined,
      onWaiting?: (at: number, retrying: boolean) => void,
    ) => {
      onWaiting?.(earliest, false)
    })
    mocks.retry.mockImplementation(async (
      submit: () => Promise<unknown>,
      _signal: AbortSignal | undefined,
      onWaiting?: (at: number, retrying: boolean) => void,
    ) => {
      onWaiting?.(Date.now() + 1_000, true)
      return await submit()
    })

    const eventTypes: string[] = []
    unsubscribe = subscribeToVdfActivity((event) => eventTypes.push(event.type))

    await expect(publishPublicDiscoveryLease(
      'identity-local',
      'exo1wallet',
      { id: 'bundle-local' } as any,
      { onProgress },
    )).resolves.toEqual(expect.objectContaining({ expiresAt: expect.any(Number) }))

    expect(onProgress).toHaveBeenCalledWith({
      phase: 'evaluate',
      completedIterations: 100,
      totalIterations: 400_000,
    })
    expect(eventTypes).toEqual([
      'started',
      'progress',
      'waiting_for_server',
      'waiting_for_server',
      'submitting',
      'waiting_for_server',
      'completed',
    ])
    expect(mocks.backendRequest).toHaveBeenNthCalledWith(
      2,
      '/v1/chat/bundles',
      expect.objectContaining({
        body: expect.objectContaining({
          vdfChallengeId: 'vdfc1.discovery',
          vdfProof: { outputHex: '01', proofHex: '02' },
        }),
      }),
      { accessToken: 'access-token' },
    )
  })

  it('keeps the contact-card profile capability out of the backend request', async () => {
    mocks.ensureBackendSession.mockResolvedValue({ accessToken: 'access-token' })
    mocks.mailboxToken.mockReturnValue('smbx1.mailbox-token')
    mocks.verifyProfile.mockReturnValue(true)
    mocks.sealProfile.mockReturnValue({
      version: 1,
      ciphertext: 'ciphertext',
      nonce: 'nonce',
      tag: 'tag',
    })
    mocks.hashBinding.mockReturnValue('binding-hash')
    mocks.backendRequest.mockImplementation(async (path: string) => {
      if (path === '/v1/chat/discovery/vdf-challenges') {
        return {
          challengeId: 'vdfc1.contact-card',
          nonceHex: 'ab'.repeat(32),
          expiresAt: Date.now() + 60_000,
          notBeforeAt: Date.now(),
          params: {
            algorithm: 'wesolowski-rsa-v1',
            domain: 'spectra.discovery.vdf.v1',
            parameterId: 'test-v1',
            modulusHex: 'a'.repeat(512),
            iterations: 200_000,
          },
        }
      }
      if (path === '/v1/chat/contact-cards') {
        return { expiresAt: Date.now() + 300_000 }
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    mocks.solve.mockResolvedValue({ outputHex: '01', proofHex: '02' })
    mocks.wait.mockResolvedValue(undefined)
    mocks.retry.mockImplementation(async (submit: () => Promise<unknown>) => await submit())

    const profile = {
      version: 1 as const,
      identityId: 'identity-local',
      revision: 1,
      signature: '0xsignature',
    }
    const card = await createOneTimeContactCard(
      'identity-local',
      'exo1wallet',
      { identityId: 'identity-local', dilithiumKey: 'dilithium-key' } as any,
      { id: 1, x25519PublicKey: 'x', mlkemPublicKey: 'm' },
      profile,
    )

    expect(mocks.sealProfile).toHaveBeenCalledWith(
      profile,
      card.cardId,
      card.profileCapability,
    )
    const request = mocks.backendRequest.mock.calls.find(
      ([path]) => path === '/v1/chat/contact-cards',
    )?.[1] as { body: Record<string, unknown> }
    expect(request.body.profileCapsule).toEqual({
      version: 1,
      ciphertext: 'ciphertext',
      nonce: 'nonce',
      tag: 'tag',
    })
    expect(request.body.profileCapability).toBeUndefined()
    expect(card.profileCapability).toMatch(/^sccpc1\.[A-Za-z0-9_-]{43}$/)
  })

  it('restores a reserved OPK when the live card is still active', async () => {
    const failure = await rejectContactCard(new mocks.SpectraBackendError(409, 'contact_card_active'))
    expect(failure).toBeInstanceOf(mocks.SpectraBackendError)
    expect(canReuseReservedContactCardPreKey(failure)).toBe(true)
  })

  it('does not restore a reserved OPK after a consumed pre-key conflict', async () => {
    const failure = await rejectContactCard(new mocks.SpectraBackendError(409, 'contact_card_conflict'))
    expect(failure).toBeInstanceOf(mocks.SpectraBackendError)
    expect(canReuseReservedContactCardPreKey(failure)).toBe(false)
  })

  it('extends an active discovery lease through the rent endpoint', async () => {
    mocks.ensureBackendSession.mockResolvedValue({ accessToken: 'access-token' })
    mocks.mailboxToken.mockReturnValue('smbx1.mailbox-token')
    mocks.hashBinding.mockReturnValue('binding-hash')
    mocks.backendRequest.mockImplementation(async (path: string) => {
      if (path === '/v1/chat/discovery/vdf-challenges') {
        return {
          challengeId: 'vdfc1.extend',
          nonceHex: 'ab'.repeat(32),
          expiresAt: Date.now() + 60_000,
          notBeforeAt: Date.now(),
          params: {
            algorithm: 'wesolowski-rsa-v1',
            domain: 'spectra.discovery.vdf.v1',
            parameterId: 'test-v1',
            modulusHex: 'a'.repeat(512),
            iterations: 200_000,
          },
        }
      }
      if (path === '/v1/chat/discovery/leases') {
        return { expiresAt: Date.now() + 86_400_000, discoveryMode: 'active' }
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    mocks.solve.mockResolvedValue({ outputHex: '01', proofHex: '02' })
    mocks.wait.mockResolvedValue(undefined)
    mocks.retry.mockImplementation(async (submit: () => Promise<unknown>) => await submit())

    await expect(extendActiveDiscoveryLease(
      'identity-local',
      'exo1wallet',
      { id: 'bundle-local' } as any,
    )).resolves.toEqual(expect.objectContaining({ discoveryMode: 'active' }))

    expect(mocks.hashBinding).toHaveBeenCalledWith(expect.objectContaining({
      action: 'extend_public_discovery',
    }))
    expect(mocks.backendRequest).toHaveBeenCalledWith(
      '/v1/chat/discovery/leases',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          vdfChallengeId: 'vdfc1.extend',
        }),
      }),
      { accessToken: 'access-token' },
    )
  })

  it('holds a reused rent activity until the caller settles it', async () => {
    const events: string[] = []
    unsubscribe = subscribeToVdfActivity((event) => {
      events.push(event.type)
    })
    const activity = beginVdfActivity({ action: 'extend_public_discovery' })
    mocks.ensureBackendSession.mockResolvedValue({ accessToken: 'access-token' })
    mocks.mailboxToken.mockReturnValue('smbx1.mailbox-token')
    mocks.hashBinding.mockReturnValue('binding-hash')
    mocks.backendRequest.mockImplementation(async (path: string) => {
      if (path === '/v1/chat/discovery/vdf-challenges') {
        return {
          challengeId: 'vdfc1.extend-hold',
          nonceHex: 'ab'.repeat(32),
          expiresAt: Date.now() + 60_000,
          notBeforeAt: Date.now(),
          params: {
            algorithm: 'wesolowski-rsa-v1',
            domain: 'spectra.discovery.vdf.v1',
            parameterId: 'test-v1',
            modulusHex: 'a'.repeat(512),
            iterations: 200_000,
          },
        }
      }
      if (path === '/v1/chat/discovery/leases') {
        return { expiresAt: Date.now() + 86_400_000, discoveryMode: 'active' }
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    mocks.solve.mockResolvedValue({ outputHex: '01', proofHex: '02' })
    mocks.wait.mockResolvedValue(undefined)
    mocks.retry.mockImplementation(async (submit: () => Promise<unknown>) => await submit())

    await extendActiveDiscoveryLease(
      'identity-local',
      'exo1wallet',
      { id: 'bundle-local' } as any,
      { activity, holdActivity: true },
    )
    await extendActiveDiscoveryLease(
      'identity-local',
      'exo1wallet',
      { id: 'bundle-local' } as any,
      { activity, holdActivity: true },
    )

    expect(events.filter((type) => type === 'started')).toHaveLength(1)
    expect(events).not.toContain('completed')
    activity.complete()
    expect(events.filter((type) => type === 'completed')).toHaveLength(1)
  })

  it('does not fail a held rent activity when one extend errors', async () => {
    const events: string[] = []
    unsubscribe = subscribeToVdfActivity((event) => {
      events.push(event.type)
    })
    const activity = beginVdfActivity({ action: 'extend_public_discovery' })
    mocks.ensureBackendSession.mockResolvedValue({ accessToken: 'access-token' })
    mocks.mailboxToken.mockReturnValue('smbx1.mailbox-token')
    mocks.hashBinding.mockReturnValue('binding-hash')
    mocks.backendRequest.mockImplementation(async (path: string) => {
      if (path === '/v1/chat/discovery/vdf-challenges') {
        return {
          challengeId: 'vdfc1.extend-hold-fail',
          nonceHex: 'ab'.repeat(32),
          expiresAt: Date.now() + 60_000,
          notBeforeAt: Date.now(),
          params: {
            algorithm: 'wesolowski-rsa-v1',
            domain: 'spectra.discovery.vdf.v1',
            parameterId: 'test-v1',
            modulusHex: 'a'.repeat(512),
            iterations: 200_000,
          },
        }
      }
      if (path === '/v1/chat/discovery/leases') {
        throw new mocks.SpectraBackendError(503, 'database_unavailable')
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    mocks.solve.mockResolvedValue({ outputHex: '01', proofHex: '02' })
    mocks.wait.mockResolvedValue(undefined)
    mocks.retry.mockImplementation(async (submit: () => Promise<unknown>) => await submit())

    await expect(extendActiveDiscoveryLease(
      'identity-local',
      'exo1wallet',
      { id: 'bundle-local' } as any,
      { activity, holdActivity: true },
    )).rejects.toMatchObject({ code: 'database_unavailable' })

    expect(events).not.toContain('failed')
    expect(events).not.toContain('completed')
  })

  it('claims a session OPK after a requestor VDF', async () => {
    mocks.ensureBackendSession.mockResolvedValue({ accessToken: 'access-token' })
    mocks.hashBinding.mockReturnValue('binding-hash')
    mocks.backendRequest.mockImplementation(async (path: string) => {
      if (path === '/v1/chat/discovery/vdf-challenges') {
        return {
          challengeId: 'vdfc1.claim',
          nonceHex: 'ab'.repeat(32),
          expiresAt: Date.now() + 60_000,
          notBeforeAt: Date.now(),
          params: {
            algorithm: 'wesolowski-rsa-v1',
            domain: 'spectra.discovery.vdf.v1',
            parameterId: 'test-v1',
            modulusHex: 'a'.repeat(512),
            iterations: 200_000,
          },
        }
      }
      if (path === '/v1/chat/discovery/session-opk') {
        return {
          bundle: { identityId: 'identity-remote', oneTimePreKeys: [] },
          allocatedOPK: { id: 9 },
          allocatedOPKId: 9,
        }
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    mocks.solve.mockResolvedValue({ outputHex: '01', proofHex: '02' })
    mocks.wait.mockResolvedValue(undefined)
    mocks.retry.mockImplementation(async (submit: () => Promise<unknown>) => await submit())

    await expect(claimSessionOpk('identity-remote', 'identity-local')).resolves.toEqual({
      bundle: {
        identityId: 'identity-remote',
        oneTimePreKeys: [{ id: 9 }],
      },
      allocatedOPKId: 9,
    })
    expect(mocks.hashBinding).toHaveBeenCalledWith({
      action: 'claim_session_opk',
      requestorIdentityId: 'identity-local',
      targetIdentityId: 'identity-remote',
    })
  })

  it('unpublishes and reads the owner lease without a VDF', async () => {
    mocks.ensureBackendSession.mockResolvedValue({ accessToken: 'access-token' })
    mocks.backendRequest.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (path === '/v1/chat/discovery/lease' && options?.method === 'DELETE') return {}
      if (path === '/v1/chat/discovery/lease') {
        return { exists: true, discoveryMode: 'active', expiresAt: Date.now() + 60_000 }
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    await unpublishPublicDiscovery()
    await expect(fetchOwnDiscoveryLease()).resolves.toEqual(expect.objectContaining({
      exists: true,
      discoveryMode: 'active',
    }))
    expect(mocks.solve).not.toHaveBeenCalled()
  })

  it('patches a live discovery alias without a VDF', async () => {
    mocks.ensureBackendSession.mockResolvedValue({ accessToken: 'access-token' })
    mocks.backendRequest.mockResolvedValue({ updated: true })

    await expect(
      patchOwnDiscoveryAlias({ discoveryAlias: 'Peter', aliasAutocomplete: false }),
    ).resolves.toBe('updated')
    expect(mocks.backendRequest).toHaveBeenCalledWith(
      '/v1/chat/discovery/lease',
      {
        method: 'PATCH',
        body: { discoveryAlias: 'Peter', aliasAutocomplete: false },
      },
      { accessToken: 'access-token' },
    )
    expect(mocks.solve).not.toHaveBeenCalled()
  })

  it('reports missing or unimplemented live-alias patches', async () => {
    mocks.ensureBackendSession.mockResolvedValue({ accessToken: 'access-token' })
    mocks.backendRequest.mockRejectedValueOnce(new mocks.SpectraBackendError(404, 'not_found'))
    await expect(patchOwnDiscoveryAlias({ discoveryAlias: 'Peter' })).resolves.toBe('missing')

    mocks.backendRequest.mockRejectedValueOnce(new mocks.SpectraBackendError(405, 'method_not_allowed'))
    await expect(patchOwnDiscoveryAlias({ aliasAutocomplete: true })).resolves.toBe('missing')
    expect(mocks.solve).not.toHaveBeenCalled()
  })
})
