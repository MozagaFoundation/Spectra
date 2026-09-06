/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ACTIVE_DISCOVERY_MAX_MS, ACTIVE_DISCOVERY_STEP_MS } from '@/lib/discoveryLease'
import { subscribeToVdfActivity } from '@/services/shared/vdfActivity'
import { useVdfActivityStore } from '@/store/vdfActivityStore'

const mocks = vi.hoisted(() => ({
  extend: vi.fn(),
  fetchLease: vi.fn(),
  getClient: vi.fn(),
  readVisibility: vi.fn(),
  setLease: vi.fn(),
  unpublish: vi.fn(),
  wallet: {
    address: `EXO00${'aa'.repeat(19)}`,
    spectreMode: false,
  },
}))

vi.mock('@/services/backend/ephemeralDiscovery', () => ({
  extendActiveDiscoveryLease: mocks.extend,
  fetchOwnDiscoveryLease: mocks.fetchLease,
  unpublishPublicDiscovery: mocks.unpublish,
}))
vi.mock('@/services/backend/request', () => ({
  SpectraBackendError: class SpectraBackendError extends Error {
    constructor(
      readonly status: number,
      readonly code: string | null = null,
    ) {
      super(code ? `backend ${status}: ${code}` : `backend ${status}`)
    }
  },
}))
vi.mock('@/services/quantumChat', () => ({
  getQuantumChatClient: mocks.getClient,
}))
vi.mock('@/services/shared/accountRuntimeLifecycle', () => ({
  registerAccountRuntimeAbortListener: () => () => undefined,
  registerAccountRuntimeResetListener: () => () => undefined,
}))
vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({ wallet: mocks.wallet }),
  },
}))
vi.mock('@/store/ephemeralDiscoveryStore', () => ({
  useEphemeralDiscoveryStore: {
    getState: () => ({ setPublicDiscoveryLease: mocks.setLease }),
  },
}))
vi.mock('./discoveryModeStorage', () => ({
  readDiscoveryVisibility: mocks.readVisibility,
}))
vi.mock('./discoveryAliasPublish', () => ({
  discoveryAliasLeaseFields: vi.fn(async () => ({})),
}))

const coordinator = await import('./activeDiscoveryCoordinator')

const bundle = { identityId: 'identity-local' }

describe('active discovery rent', () => {
  beforeEach(() => {
    coordinator.invalidateActiveDiscoveryRent()
    mocks.wallet.spectreMode = false
    mocks.extend.mockReset()
    mocks.fetchLease.mockReset()
    mocks.getClient.mockReset()
    mocks.readVisibility.mockReset()
    mocks.setLease.mockReset()
    mocks.unpublish.mockReset()
    mocks.getClient.mockReturnValue({
      getIdentity: () => ({ id: 'identity-local' }),
      getPublicKeyBundle: async () => bundle,
    })
    mocks.readVisibility.mockResolvedValue('findable')
  })

  afterEach(() => {
    coordinator.invalidateActiveDiscoveryRent()
    useVdfActivityStore.getState().reset()
  })

  it('skips Spectre personas', async () => {
    mocks.wallet.spectreMode = true
    await coordinator.ensureActiveDiscoveryRent()
    expect(mocks.fetchLease).not.toHaveBeenCalled()
    expect(mocks.extend).not.toHaveBeenCalled()
  })

  it('skips private visibility', async () => {
    mocks.readVisibility.mockResolvedValue('private')
    await coordinator.ensureActiveDiscoveryRent()
    expect(mocks.fetchLease).not.toHaveBeenCalled()
    expect(mocks.extend).not.toHaveBeenCalled()
  })

  it('does not extend an already capped lease', async () => {
    mocks.fetchLease.mockResolvedValue({
      exists: true,
      discoveryMode: 'active',
      expiresAt: Date.now() + ACTIVE_DISCOVERY_MAX_MS,
    })

    await coordinator.ensureActiveDiscoveryRent()

    expect(mocks.extend).not.toHaveBeenCalled()
    expect(mocks.setLease).toHaveBeenCalledWith(expect.objectContaining({
      scope: expect.objectContaining({ identityId: 'identity-local' }),
    }))
  })

  it('does not extend a lease that already displays 7/7', async () => {
    mocks.fetchLease.mockResolvedValue({
      exists: true,
      discoveryMode: 'active',
      expiresAt: Date.now() + 6.6 * ACTIVE_DISCOVERY_STEP_MS,
    })

    await coordinator.ensureActiveDiscoveryRent()

    expect(mocks.extend).not.toHaveBeenCalled()
  })

  it('grinds one-day extensions until the cap', async () => {
    const now = Date.now()
    mocks.fetchLease.mockResolvedValue({ exists: false })
    mocks.extend
      .mockResolvedValueOnce({ expiresAt: now + ACTIVE_DISCOVERY_STEP_MS })
      .mockResolvedValueOnce({ expiresAt: now + ACTIVE_DISCOVERY_MAX_MS })

    await coordinator.ensureActiveDiscoveryRent()

    expect(mocks.extend).toHaveBeenCalledTimes(2)
    expect(mocks.setLease).toHaveBeenLastCalledWith(expect.objectContaining({
      expiresAt: now + ACTIVE_DISCOVERY_MAX_MS,
    }))
  })

  it('keeps one VDF banner activity for the whole grind', async () => {
    const events: Array<{ type: string, completed?: number, total?: number }> = []
    const unsubscribe = subscribeToVdfActivity((event) => {
      events.push(event.type === 'step'
        ? { type: event.type, completed: event.completed, total: event.total }
        : { type: event.type })
    })
    const now = Date.now()
    mocks.fetchLease.mockResolvedValue({ exists: false })
    mocks.extend
      .mockResolvedValueOnce({ expiresAt: now + ACTIVE_DISCOVERY_STEP_MS })
      .mockResolvedValueOnce({ expiresAt: now + ACTIVE_DISCOVERY_MAX_MS })

    try {
      await coordinator.ensureActiveDiscoveryRent()
    } finally {
      unsubscribe()
    }

    expect(events.filter((event) => event.type === 'started')).toEqual([{ type: 'started' }])
    expect(events.filter((event) => event.type === 'completed')).toEqual([{ type: 'completed' }])
    expect(events.filter((event) => event.type === 'step')).toEqual([
      { type: 'step', completed: 0, total: 7 },
      { type: 'step', completed: 1, total: 7 },
      { type: 'step', completed: 1, total: 7 },
      { type: 'step', completed: 7, total: 7 },
    ])
    expect(mocks.extend).toHaveBeenNthCalledWith(
      1,
      'identity-local',
      mocks.wallet.address,
      bundle,
      expect.objectContaining({ holdActivity: true, signal: expect.any(AbortSignal) }),
      {},
    )
    expect(mocks.extend.mock.calls[0]?.[3]?.activity).toBe(mocks.extend.mock.calls[1]?.[3]?.activity)
  })

  it('does not retry an invalid VDF proof', async () => {
    const { SpectraBackendError } = await import('@/services/backend/request')
    mocks.fetchLease.mockResolvedValue({ exists: false })
    mocks.extend.mockRejectedValue(new SpectraBackendError(400, 'invalid_vdf_proof'))

    await coordinator.ensureActiveDiscoveryRent()

    expect(mocks.extend).toHaveBeenCalledTimes(1)
  })

  it('does not retry a missing native solver', async () => {
    mocks.fetchLease.mockResolvedValue({ exists: false })
    const error = new Error('Native VDF solver is unavailable in this app build') as Error & {
      code: string
    }
    error.code = 'ERR_VDF_UNAVAILABLE'
    mocks.extend.mockRejectedValue(error)

    await coordinator.ensureActiveDiscoveryRent()

    expect(mocks.extend).toHaveBeenCalledTimes(1)
  })

  it('retries a transient extend failure and continues the grind', async () => {
    const { SpectraBackendError } = await import('@/services/backend/request')
    const now = Date.now()
    mocks.fetchLease.mockResolvedValue({ exists: false })
    mocks.extend
      .mockRejectedValueOnce(new SpectraBackendError(503, 'database_unavailable'))
      .mockResolvedValueOnce({ expiresAt: now + ACTIVE_DISCOVERY_MAX_MS })

    await coordinator.ensureActiveDiscoveryRent()

    expect(mocks.extend).toHaveBeenCalledTimes(2)
    expect(mocks.setLease).toHaveBeenLastCalledWith(expect.objectContaining({
      expiresAt: now + ACTIVE_DISCOVERY_MAX_MS,
    }))
  })

  it('restarts rent after unpublish aborts an in-flight grind', async () => {
    mocks.fetchLease.mockResolvedValue({ exists: false })
    mocks.extend.mockImplementationOnce((
      _identity: string,
      _wallet: string,
      _bundle: unknown,
      options: { signal?: AbortSignal },
    ) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => {
        const error = new Error('VDF solving was cancelled')
        error.name = 'AbortError'
        reject(error)
      }, { once: true })
    }))
    mocks.extend.mockResolvedValue({ expiresAt: Date.now() + ACTIVE_DISCOVERY_MAX_MS })
    mocks.unpublish.mockResolvedValue(undefined)

    const first = coordinator.ensureActiveDiscoveryRent()
    await vi.waitFor(() => expect(mocks.extend).toHaveBeenCalledTimes(1))

    await coordinator.unpublishActiveDiscovery()
    await first

    await coordinator.ensureActiveDiscoveryRent()
    expect(mocks.extend).toHaveBeenCalledTimes(2)
  })

  it('unpublishes immediately and clears the local lease', async () => {
    mocks.unpublish.mockResolvedValue(undefined)
    await coordinator.unpublishActiveDiscovery()
    expect(mocks.unpublish).toHaveBeenCalledTimes(1)
    expect(mocks.setLease).toHaveBeenCalledWith(null)
  })

  it('keeps the local lease if unpublish fails', async () => {
    mocks.unpublish.mockRejectedValue(new Error('offline'))
    await expect(coordinator.unpublishActiveDiscovery()).rejects.toThrow('offline')
    expect(mocks.setLease).not.toHaveBeenCalled()
  })
})
