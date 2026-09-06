/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  secureStore: new Map<string, string>(),
}))

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: vi.fn(async (length: number) => new Uint8Array(length).fill(23)),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockState.secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockState.secureStore.set(key, value)
  }),
}))

describe('groupEpochKeyringCrypto', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.secureStore.clear()
  })

  it('seals group epoch keys without plaintext key material', async () => {
    const { openGroupEpochKey, sealGroupEpochKey } = await import('./groupEpochKeyringCrypto')
    const scope = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const entry = {
      schemaVersion: 1 as const,
      groupId: 'group-1',
      epoch: 4,
      distributionId: 'distribution-4',
      keyBase64: 'c2VjcmV0LWdyb3VwLWVwb2NoLWtleS0zMmJ5dGVzIQ==',
      transitionId: 'transition-4',
      rosterHash: 'a'.repeat(64),
      createdAt: 100,
    }

    const sealed = await sealGroupEpochKey(scope, entry)

    expect(sealed).not.toContain(entry.keyBase64)
    await expect(openGroupEpochKey(scope, entry.groupId, entry.epoch, sealed)).resolves.toEqual(entry)
  })

  it('rejects wallet, group, and epoch substitution', async () => {
    const { openGroupEpochKey, sealGroupEpochKey } = await import('./groupEpochKeyringCrypto')
    const scope = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const sealed = await sealGroupEpochKey(scope, {
      schemaVersion: 1,
      groupId: 'group-1',
      epoch: 2,
      distributionId: 'distribution-2',
      keyBase64: 'c2VjcmV0LWdyb3VwLWVwb2NoLWtleS0zMmJ5dGVzIQ==',
      createdAt: 100,
    })

    await expect(openGroupEpochKey(
      'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      'group-1',
      2,
      sealed,
    )).rejects.toThrow()
    await expect(openGroupEpochKey(scope, 'group-2', 2, sealed)).rejects.toThrow()
    await expect(openGroupEpochKey(scope, 'group-1', 3, sealed)).rejects.toThrow()
  })

  it('binds pending secrets to their transition identifier', async () => {
    const {
      openPendingGroupEpoch,
      sealPendingGroupEpoch,
    } = await import('./groupEpochKeyringCrypto')
    const scope = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const pending = {
      schemaVersion: 1 as const,
      transitionId: 'transition-2',
      groupId: 'group-1',
      epoch: 2,
      distributionId: 'distribution-2',
      keyBase64: 'c2VjcmV0LWdyb3VwLWVwb2NoLWtleS0zMmJ5dGVzIQ==',
      rosterHash: 'b'.repeat(64),
      recipientIdentityIds: ['member-2'],
      deliveredIdentityIds: [],
      createdAt: 100,
      updatedAt: 100,
    }
    const sealed = await sealPendingGroupEpoch(scope, pending)

    await expect(openPendingGroupEpoch(
      scope,
      pending.groupId,
      pending.transitionId,
      sealed,
    )).resolves.toEqual(pending)
    await expect(openPendingGroupEpoch(
      scope,
      pending.groupId,
      'transition-replay',
      sealed,
    )).rejects.toThrow()
  })
})
