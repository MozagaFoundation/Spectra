/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  asyncStorage: new Map<string, string>(),
  sealed: new Map<string, unknown>(),
  sealCounter: 0,
  legacy: null as null | {
    groupId: string
    distributionId: string
    keyBase64: string
    keyVersion: number
    sharedWith: string[]
    rotationRevision: number
    updatedBy: string
    updatedAt: number
  },
  clearLegacy: vi.fn(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockState.asyncStorage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockState.asyncStorage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      mockState.asyncStorage.delete(key)
    }),
    getAllKeys: vi.fn(async () => [...mockState.asyncStorage.keys()]),
    multiRemove: vi.fn(async (keys: string[]) => {
      keys.forEach((key) => mockState.asyncStorage.delete(key))
    }),
  },
}))

vi.mock('@spectra/identity-vault', () => ({
  base64ToBytes: vi.fn(() => new Uint8Array(32).fill(1)),
}))

vi.mock('@/services/storage/groupEpochKeyringCrypto', () => ({
  sealGroupEpochKey: vi.fn(async (_scope: string, entry: unknown) => {
    const key = `sealed-${++mockState.sealCounter}`
    mockState.sealed.set(key, entry)
    return key
  }),
  openGroupEpochKey: vi.fn(async (
    _scope: string,
    _groupId: string,
    _epoch: number,
    raw: string,
  ) => mockState.sealed.get(raw)),
  sealPendingGroupEpoch: vi.fn(async (_scope: string, pending: unknown) => {
    const key = `sealed-${++mockState.sealCounter}`
    mockState.sealed.set(key, pending)
    return key
  }),
  openPendingGroupEpoch: vi.fn(async (
    _scope: string,
    _groupId: string,
    _transitionId: string,
    raw: string,
  ) => mockState.sealed.get(raw)),
}))

vi.mock('./storage', () => ({
  getActiveGroupStorageScope: () => 'wallet-scope',
  buildScopedGroupStorageKey: (suffix: string) => `qc_group_wallet-scope_${suffix}`,
  getGroupSenderKeyState: vi.fn(async () => mockState.legacy),
  clearGroupSenderKeyState: mockState.clearLegacy,
}))

describe('epochKeyringStorage', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockState.asyncStorage.clear()
    mockState.sealed.clear()
    mockState.sealCounter = 0
    mockState.legacy = null
  })

  it('stores independent encrypted entries for multiple epochs', async () => {
    const storage = await import('./epochKeyringStorage')
    await storage.storeGroupEpochKey({
      schemaVersion: 1,
      groupId: 'group-1',
      epoch: 1,
      distributionId: 'distribution-1',
      keyBase64: 'epoch-1-key',
      createdAt: 1,
    })
    await storage.storeGroupEpochKey({
      schemaVersion: 1,
      groupId: 'group-1',
      epoch: 2,
      distributionId: 'distribution-2',
      keyBase64: 'epoch-2-key',
      createdAt: 2,
    })

    expect(mockState.asyncStorage.size).toBe(2)
    await expect(storage.getGroupEpochKey('group-1', 1)).resolves.toEqual(
      expect.objectContaining({ epoch: 1, keyBase64: 'epoch-1-key' }),
    )
    await expect(storage.getGroupEpochKey('group-1', 2)).resolves.toEqual(
      expect.objectContaining({ epoch: 2, keyBase64: 'epoch-2-key' }),
    )
  })

  it('migrates the legacy current key once and removes its plaintext record', async () => {
    mockState.legacy = {
      groupId: 'group-1',
      distributionId: 'distribution-3',
      keyBase64: 'legacy-key',
      keyVersion: 3,
      sharedWith: [],
      rotationRevision: 3,
      updatedBy: 'owner',
      updatedAt: 3,
    }
    const storage = await import('./epochKeyringStorage')

    const migrated = await storage.getGroupEpochKey('group-1', 3)

    expect(migrated).toEqual(expect.objectContaining({ epoch: 3, keyBase64: 'legacy-key' }))
    expect(mockState.clearLegacy).toHaveBeenCalledWith('group-1')
  })

  it('recovers a committed epoch key after a crash between activation and finalization', async () => {
    const storage = await import('./epochKeyringStorage')
    await storage.storePendingGroupEpoch({
      schemaVersion: 1,
      transitionId: 'transition-4',
      groupId: 'group-1',
      epoch: 4,
      distributionId: 'distribution-4',
      keyBase64: 'pending-key',
      rosterHash: 'a'.repeat(64),
      recipientIdentityIds: ['member'],
      deliveredIdentityIds: ['member'],
      createdAt: 4,
      updatedAt: 4,
    })

    const recovered = await storage.getGroupEpochKey('group-1', 4)

    expect(recovered).toEqual(expect.objectContaining({
      epoch: 4,
      keyBase64: 'pending-key',
      transitionId: 'transition-4',
    }))
    expect([...mockState.asyncStorage.keys()].some((key) => key.includes('epoch_pending'))).toBe(false)
  })
})
