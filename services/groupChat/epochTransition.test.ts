/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PendingGroupEpochSecret } from '@/services/storage/groupEpochKeyringCrypto'

const mockState = vi.hoisted(() => ({
  getPending: vi.fn(),
  storePending: vi.fn(),
  clearPending: vi.fn(),
  listPending: vi.fn(),
  getKey: vi.fn(),
  storeKey: vi.fn(),
  send: vi.fn(),
  events: [] as string[],
}))

vi.mock('./epochKeyringStorage', () => ({
  getPendingGroupEpoch: mockState.getPending,
  getGroupEpochKey: mockState.getKey,
  storePendingGroupEpoch: mockState.storePending,
  clearPendingGroupEpoch: mockState.clearPending,
  listPendingGroupEpochs: mockState.listPending,
  storeGroupEpochKey: mockState.storeKey,
}))

vi.mock('@spectra/core-crypto', () => ({
  generateRandomBytes: vi.fn(() => new Uint8Array(32).fill(9)),
  bytesToBase64: vi.fn(() => 'generated-key-base64'),
  generateUUID: vi.fn(() => 'distribution-2'),
}))

function buildEnvelope(
  recipientIdentityId: string,
  pending: PendingGroupEpochSecret,
  includeKey: boolean,
): string {
  return JSON.stringify({ recipientIdentityId, includeKey, epoch: pending.epoch })
}

describe('epochTransition', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockState.events = []
    mockState.getPending.mockResolvedValue(null)
    mockState.getKey.mockResolvedValue(null)
    mockState.listPending.mockResolvedValue([])
    mockState.storePending.mockImplementation(async () => {
      mockState.events.push('persist')
    })
    mockState.storeKey.mockImplementation(async () => {
      mockState.events.push('store-key')
    })
    mockState.clearPending.mockImplementation(async () => {
      mockState.events.push('clear')
    })
    mockState.send.mockImplementation(async () => {
      mockState.events.push('send')
    })
  })

  it('persists fresh key material without sending', async () => {
    const module = await import('./epochTransition')
    module.configureGroupEpochTransitions('owner', mockState.send)

    const pending = await module.beginLocalEpochDistribution({
      groupId: 'group-1',
      epoch: 2,
      rosterHash: 'a'.repeat(64),
      title: 'Team',
      createdAtIso: new Date(0).toISOString(),
      members: [
        { identityId: 'owner', role: 'owner', joinedEpoch: 1 },
        { identityId: 'member', role: 'member', joinedEpoch: 1 },
      ],
      recipientIdentityIds: ['owner', 'member'],
    })

    expect(mockState.events[0]).toBe('persist')
    expect(mockState.send).not.toHaveBeenCalled()
    expect(pending.distributionId).toBe('distribution-2')
  })

  it('persists fresh key material before delivering packages', async () => {
    const module = await import('./epochTransition')
    module.configureGroupEpochTransitions('owner', mockState.send)

    await module.distributeLocalEpochPackages({
      groupId: 'group-1',
      epoch: 2,
      rosterHash: 'a'.repeat(64),
      title: 'Team',
      createdAtIso: new Date(0).toISOString(),
      members: [
        { identityId: 'owner', role: 'owner', joinedEpoch: 1 },
        { identityId: 'member', role: 'member', joinedEpoch: 1 },
      ],
      recipientIdentityIds: ['owner', 'member'],
      buildEnvelope,
    })

    expect(mockState.events[0]).toBe('persist')
    expect(mockState.events.indexOf('send')).toBeGreaterThan(
      mockState.events.indexOf('store-key'),
    )
    expect(mockState.storeKey).toHaveBeenCalledWith(
      expect.objectContaining({ epoch: 2, keyBase64: 'generated-key-base64' }),
    )
    expect(mockState.events.slice(-1)).toEqual(['clear'])
  })

  it('does not clear pending state when any recipient package delivery fails', async () => {
    const module = await import('./epochTransition')
    mockState.send.mockImplementation(async () => {
      mockState.events.push('send')
      throw new Error('relay unavailable')
    })
    module.configureGroupEpochTransitions('owner', mockState.send)

    await expect(
      module.distributeLocalEpochPackages({
        groupId: 'group-1',
        epoch: 2,
        rosterHash: 'a'.repeat(64),
        title: 'Team',
        createdAtIso: new Date(0).toISOString(),
        members: [
          { identityId: 'owner', role: 'owner', joinedEpoch: 1 },
          { identityId: 'member', role: 'member', joinedEpoch: 1 },
        ],
        recipientIdentityIds: ['owner', 'member'],
        buildEnvelope,
      }),
    ).rejects.toThrow('relay unavailable')

    expect(mockState.clearPending).not.toHaveBeenCalled()
    expect(mockState.storePending).toHaveBeenCalled()
  })
})
