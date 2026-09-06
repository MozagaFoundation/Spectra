/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createCard: vi.fn(),
  createInvite: vi.fn(),
  ensureProfile: vi.fn(),
  getClient: vi.fn(),
  ownerStatus: vi.fn(),
  publishLease: vi.fn(),
  release: vi.fn(),
  reserve: vi.fn(),
  readPersisted: vi.fn(),
  writePersisted: vi.fn(),
  deletePersisted: vi.fn(),
  clearPersisted: vi.fn(),
}))

vi.mock('@/lib/contactInvite', () => ({
  createOneTimeContactCardInvite: mocks.createInvite,
}))
vi.mock('@/services/backend/ephemeralDiscovery', () => ({
  canReuseReservedContactCardPreKey: () => false,
  createOneTimeContactCard: mocks.createCard,
  isOwnOneTimeContactCardActive: mocks.ownerStatus,
  publishPublicDiscoveryLease: mocks.publishLease,
}))
vi.mock('@/services/quantumChat', () => ({
  getQuantumChatClient: mocks.getClient,
}))
vi.mock('@/services/chat/contactProfile', () => ({
  ensureOwnContactProfile: mocks.ensureProfile,
}))
vi.mock('./oneTimeContactCardStorage', () => ({
  readPersistedContactCard: mocks.readPersisted,
  writePersistedContactCard: mocks.writePersisted,
  deletePersistedContactCard: mocks.deletePersisted,
  clearAllPersistedContactCards: mocks.clearPersisted,
}))
vi.mock('@/services/shared/accountRuntimeLifecycle', () => ({
  registerAccountRuntimeAbortListener: () => () => undefined,
  registerAccountRuntimeResetListener: () => () => undefined,
}))
vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      wallet: {
        address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    }),
  },
}))

const { subscribeToEphemeralDiscoveryActivity, resetEphemeralDiscoveryActivity, clearActiveContactCard } = await import(
  '@/services/shared/ephemeralDiscoveryActivity'
)
const coordinator = await import('./ephemeralDiscoveryCoordinator')

const card = (suffix: string) => ({
  cardId: `scc1.${suffix.repeat(32)}`,
  cardCapability: 'sccap1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  profileCapability: 'sccpc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  expiresAt: Date.now() + 60_000,
})

describe('ephemeral discovery coordinator', () => {
  let unsubscribe: (() => void) | null = null

  beforeEach(() => {
    coordinator.invalidateEphemeralDiscoveryOperations()
    resetEphemeralDiscoveryActivity()
    mocks.createCard.mockReset()
    mocks.createInvite.mockReset()
    mocks.ensureProfile.mockReset()
    mocks.getClient.mockReset()
    mocks.ownerStatus.mockReset()
    mocks.publishLease.mockReset()
    mocks.release.mockReset()
    mocks.reserve.mockReset()
    mocks.readPersisted.mockReset()
    mocks.writePersisted.mockReset()
    mocks.deletePersisted.mockReset()
    mocks.clearPersisted.mockReset()
    mocks.readPersisted.mockResolvedValue(null)
    mocks.writePersisted.mockResolvedValue(undefined)
    mocks.deletePersisted.mockResolvedValue(undefined)
    mocks.clearPersisted.mockResolvedValue(undefined)

    mocks.createInvite.mockImplementation((value: { cardId: string }) =>
      `spectra://contact-card/${value.cardId}`
    )
    mocks.ensureProfile.mockResolvedValue({ identityId: 'identity-local' })
    mocks.reserve.mockResolvedValue({
      bundle: { identityId: 'identity-local' },
      cardOpk: { id: 1 },
    })
    mocks.getClient.mockReturnValue({
      getIdentity: () => ({ id: 'identity-local' }),
      getPublicKeyBundle: vi.fn(),
      releaseOneTimeContactCardPreKey: mocks.release,
      reserveOneTimeContactCardPreKey: mocks.reserve,
    })
  })

  afterEach(() => {
    unsubscribe?.()
    unsubscribe = null
  })

  it('does not create a second live card when the owner status is active', async () => {
    const events: string[] = []
    unsubscribe = subscribeToEphemeralDiscoveryActivity((event) => events.push(event.type))
    mocks.createCard.mockResolvedValue(card('a'))

    await coordinator.startOneTimeContactCardCreation()
    mocks.ownerStatus.mockResolvedValue(true)

    await coordinator.startOneTimeContactCardCreation()

    expect(mocks.createCard).toHaveBeenCalledTimes(1)
    expect(mocks.writePersisted).toHaveBeenCalledTimes(1)
    expect(mocks.ownerStatus).toHaveBeenCalledWith(`scc1.${'a'.repeat(32)}`, expect.any(Object))
    expect(events).toEqual([
      'started',
      'contact_card_ready',
      'started',
      'failed',
    ])
  })

  it('creates a replacement card only after the prior card is inactive', async () => {
    mocks.createCard
      .mockResolvedValueOnce(card('a'))
      .mockResolvedValueOnce(card('b'))
    mocks.ownerStatus.mockResolvedValue(false)

    await coordinator.startOneTimeContactCardCreation()
    await coordinator.startOneTimeContactCardCreation()

    expect(mocks.createCard).toHaveBeenCalledTimes(2)
    expect(mocks.ownerStatus).toHaveBeenCalledTimes(1)
  })

  it('does not publish a card after account invalidation', async () => {
    let resolveCard: ((value: ReturnType<typeof card>) => void) | null = null
    mocks.createCard.mockImplementation(
      () => new Promise<ReturnType<typeof card>>((resolve) => {
        resolveCard = resolve
      }),
    )
    const events: string[] = []
    unsubscribe = subscribeToEphemeralDiscoveryActivity((event) => events.push(event.type))

    const operation = coordinator.startOneTimeContactCardCreation()
    await vi.waitFor(() => expect(mocks.createCard).toHaveBeenCalledTimes(1))
    coordinator.invalidateEphemeralDiscoveryOperations()
    expect(resolveCard).not.toBeNull()
    const completeCard = resolveCard as unknown as (value: ReturnType<typeof card>) => void
    completeCard(card('c'))
    await operation

    expect(events).toEqual(['started', 'reset'])
  })

  it('keeps a submitted card after cancellation', async () => {
    let resolveCard: ((value: ReturnType<typeof card>) => void) | null = null
    mocks.createCard.mockImplementation(
      () => new Promise<ReturnType<typeof card>>((resolve) => {
        resolveCard = resolve
      }),
    )
    const events: string[] = []
    unsubscribe = subscribeToEphemeralDiscoveryActivity((event) => events.push(event.type))

    const operation = coordinator.startOneTimeContactCardCreation()
    await vi.waitFor(() => expect(mocks.createCard).toHaveBeenCalledTimes(1))
    coordinator.abortEphemeralDiscoveryOperations()
    expect(resolveCard).not.toBeNull()
    const completeCard = resolveCard as unknown as (value: ReturnType<typeof card>) => void
    completeCard(card('d'))
    await operation

    expect(events).toEqual(['started', 'contact_card_ready'])
  })

  it('keeps a ready card after abort so a replacement stays blocked while it is active', async () => {
    mocks.createCard.mockResolvedValue(card('e'))
    mocks.ownerStatus.mockResolvedValue(true)

    await coordinator.startOneTimeContactCardCreation()
    coordinator.abortEphemeralDiscoveryOperations()
    await coordinator.startOneTimeContactCardCreation()

    expect(mocks.createCard).toHaveBeenCalledTimes(1)
    expect(mocks.ownerStatus).toHaveBeenCalledTimes(1)
  })

  it('drops a ready card after presentation expiry so a replacement can be created', async () => {
    mocks.createCard
      .mockResolvedValueOnce(card('f'))
      .mockResolvedValueOnce(card('g'))

    await coordinator.startOneTimeContactCardCreation()
    clearActiveContactCard({
      walletAddress: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      identityId: 'identity-local',
    })
    await coordinator.startOneTimeContactCardCreation()

    expect(mocks.createCard).toHaveBeenCalledTimes(2)
    expect(mocks.ownerStatus).not.toHaveBeenCalled()
  })

  it('restores a persisted live card after restart instead of creating another', async () => {
    const persisted = {
      cardId: `scc1.${'h'.repeat(32)}`,
      invite: `spectra:contact-card:v1:scc1.${'h'.repeat(32)}:sccap1.${'A'.repeat(43)}`,
      expiresAt: Date.now() + 60_000,
      walletAddress: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      identityId: 'identity-local',
    }
    mocks.readPersisted.mockResolvedValue(persisted)
    mocks.ownerStatus.mockResolvedValue(true)
    const events: string[] = []
    unsubscribe = subscribeToEphemeralDiscoveryActivity((event) => events.push(event.type))

    await coordinator.restorePersistedOneTimeContactCard()
    expect(mocks.ownerStatus).not.toHaveBeenCalled()
    await coordinator.startOneTimeContactCardCreation()

    expect(mocks.createCard).not.toHaveBeenCalled()
    expect(events).toEqual(['contact_card_restored', 'started', 'failed'])
    expect(mocks.ownerStatus).toHaveBeenCalledWith(persisted.cardId, expect.any(Object))
  })

  it('clears a claimed persisted card so a replacement can be created', async () => {
    const persisted = {
      cardId: `scc1.${'i'.repeat(32)}`,
      invite: `spectra:contact-card:v1:scc1.${'i'.repeat(32)}:sccap1.${'A'.repeat(43)}`,
      expiresAt: Date.now() + 60_000,
      walletAddress: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      identityId: 'identity-local',
    }
    mocks.readPersisted.mockResolvedValue(persisted)
    mocks.ownerStatus.mockResolvedValue(false)
    mocks.createCard.mockResolvedValue(card('j'))

    await coordinator.restorePersistedOneTimeContactCard()
    await coordinator.verifyRestoredOneTimeContactCard()
    await vi.waitFor(() => expect(mocks.deletePersisted).toHaveBeenCalledWith(persisted.walletAddress))
    mocks.readPersisted.mockResolvedValue(null)

    await coordinator.startOneTimeContactCardCreation()

    expect(mocks.createCard).toHaveBeenCalledTimes(1)
  })

  it('wipes persisted cards on account reset', () => {
    coordinator.invalidateEphemeralDiscoveryOperations()
    expect(mocks.clearPersisted).toHaveBeenCalled()
  })

  it('does not publish a second live discovery lease', async () => {
    mocks.publishLease.mockResolvedValue({ expiresAt: Date.now() + 60_000 })
    mocks.getClient.mockReturnValue({
      getIdentity: () => ({ id: 'identity-local' }),
      getPublicKeyBundle: vi.fn(async () => ({ identityId: 'identity-local' })),
      releaseOneTimeContactCardPreKey: mocks.release,
      reserveOneTimeContactCardPreKey: mocks.reserve,
    })

    await coordinator.startPublicDiscoveryPublication()
    await coordinator.startPublicDiscoveryPublication()

    expect(mocks.publishLease).toHaveBeenCalledTimes(1)
  })

  it('maps a live public discovery conflict without starting another VDF', async () => {
    const { SpectraBackendError } = await import('@/services/backend/request')
    mocks.publishLease.mockRejectedValue(new SpectraBackendError(409, 'public_discovery_active'))
    mocks.getClient.mockReturnValue({
      getIdentity: () => ({ id: 'identity-local' }),
      getPublicKeyBundle: vi.fn(async () => ({ identityId: 'identity-local' })),
      releaseOneTimeContactCardPreKey: mocks.release,
      reserveOneTimeContactCardPreKey: mocks.reserve,
    })
    const events: Array<{ type: string; failure?: string }> = []
    unsubscribe = subscribeToEphemeralDiscoveryActivity((event) => {
      events.push(event.type === 'failed' ? { type: event.type, failure: event.failure } : { type: event.type })
    })

    await coordinator.startPublicDiscoveryPublication()

    expect(events).toEqual([
      { type: 'started' },
      { type: 'failed', failure: 'active_public_discovery' },
    ])
  })
})
