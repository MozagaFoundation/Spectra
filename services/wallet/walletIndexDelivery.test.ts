/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const walletAddress = 'EXO0000000000000000000000000000000000000000'
const eventId = `wie1.${'a'.repeat(32)}`
const order: string[] = []

const mockState = vi.hoisted(() => ({
  acknowledge: vi.fn(),
  apply: vi.fn(),
  ensureSession: vi.fn(),
  getDeliveries: vi.fn(),
  load: vi.fn(),
  reconcile: vi.fn(),
  shouldSync: vi.fn(),
}))

vi.mock('@/lib/accountScope', () => ({
  isSameAccountStorageScope: () => true,
}))

vi.mock('@/services/backend/session', () => ({
  ensureVerifiedBackendAccess: mockState.ensureSession,
}))

vi.mock('@/services/backend/walletIndex', () => ({
  acknowledgeWalletIndexDeliveriesWithBackend: mockState.acknowledge,
  getWalletIndexDeliveriesWithBackend: mockState.getDeliveries,
}))

vi.mock('@/services/storage/walletIndexStorage', () => ({
  applyWalletIndexDeliveries: mockState.apply,
  loadWalletIndexState: mockState.load,
  reconcileWalletIndexLeases: mockState.reconcile,
  shouldSyncWalletIndexDeliveries: mockState.shouldSync,
}))

function localState(active = true) {
  return {
    version: 1 as const,
    activations: active ? [{
      chain: 'ethereum' as const,
      address: `0x${'11'.repeat(20)}`,
      baselineHeight: 1,
      leaseGeneration: 1,
      activatedAt: 1,
      expiresAt: Date.now() + 60_000,
    }] : [],
    balances: [],
    transactions: [],
    unreadEventIdsByChain: {},
    appliedEvents: [],
  }
}

describe('walletIndexDelivery', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    order.length = 0
    mockState.load.mockImplementation(async () => {
      order.push('load')
      return localState()
    })
    mockState.ensureSession.mockImplementation(async () => {
      order.push('session')
      return { accessToken: 'token', exoAddress: walletAddress }
    })
    mockState.shouldSync.mockImplementation((state) => state.activations.length > 0)
    mockState.getDeliveries.mockImplementation(async () => {
      order.push('deliveries')
      return {
        data: [{
          eventId,
          chain: 'ethereum',
          addressHash: 'b'.repeat(64),
          leaseGeneration: 1,
          kind: 'transaction',
          payload: {},
          createdAt: 1,
          expiresAt: Date.now() + 60_000,
        }],
        activeLeases: [{
          chain: 'ethereum',
          address: `0x${'11'.repeat(20)}`,
          leaseGeneration: 1,
          baselineHeight: 1,
          activatedAt: 1,
          expiresAt: Date.now() + 60_000,
        }],
        error: null,
      }
    })
    mockState.apply.mockImplementation(async () => {
      order.push('apply')
      return { state: localState(), newTransactionCount: 1 }
    })
    mockState.reconcile.mockImplementation(async () => {
      order.push('reconcile')
      return { state: localState(), changed: false }
    })
    mockState.acknowledge.mockImplementation(async () => {
      order.push('acknowledge')
      return { data: [eventId], error: null }
    })
  })

  it('persists deliveries before acknowledging their deletion', async () => {
    const { syncWalletIndexDeliveries } = await import('./walletIndexDelivery')

    const result = await syncWalletIndexDeliveries({ address: walletAddress } as any)

    expect(order).toEqual(['load', 'session', 'deliveries', 'reconcile', 'apply', 'acknowledge'])
    expect(mockState.acknowledge).toHaveBeenCalledWith([eventId], { accessToken: 'token' })
    expect(result).toMatchObject({
      appliedEventIds: [eventId],
      acknowledgedEventIds: [eventId],
      newTransactionCount: 1,
    })
  })

  it('does not contact the backend without an active local lease', async () => {
    mockState.load.mockResolvedValueOnce(localState(false))
    const { syncWalletIndexDeliveries } = await import('./walletIndexDelivery')

    const result = await syncWalletIndexDeliveries({ address: walletAddress } as any)

    expect(mockState.ensureSession).not.toHaveBeenCalled()
    expect(mockState.getDeliveries).not.toHaveBeenCalled()
    expect(result.appliedEventIds).toEqual([])
  })

  it('checks server lease state after a wallet wakeup even when local state expired', async () => {
    mockState.load.mockResolvedValueOnce(localState(false))
    mockState.getDeliveries.mockResolvedValueOnce({ data: [], activeLeases: [], error: null })
    const { syncWalletIndexDeliveries } = await import('./walletIndexDelivery')

    await syncWalletIndexDeliveries({ address: walletAddress } as any, { force: true })

    expect(mockState.ensureSession).toHaveBeenCalled()
    expect(mockState.getDeliveries).toHaveBeenCalled()
  })
})
