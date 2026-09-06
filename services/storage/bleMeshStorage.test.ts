/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  asyncStorage: new Map<string, string>(),
  secureStore: new Map<string, string>(),
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

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: vi.fn(async (length: number) => new Uint8Array(length).fill(19)),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockState.secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockState.secureStore.set(key, value)
  }),
}))

describe('bleMeshStorage', () => {
  const walletA = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const walletB = 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

  beforeEach(() => {
    vi.resetModules()
    mockState.asyncStorage.clear()
    mockState.secureStore.clear()
  })

  it('seals wallet-scoped BLE keys, capabilities, replay, and queued envelopes', async () => {
    const { loadBleMeshState, saveBleMeshState } = await import('./bleMeshStorage')
    const state = await loadBleMeshState(walletA)
    state.staticKey = { publicKey: 'public', privateKey: 'private-secret' }
    state.capabilities.push({
      remoteIdentityId: 'identity-b',
      routeId: 'route-id',
      secret: 'capability-secret',
      epoch: 1,
      issuedAt: 1,
      expiresAt: 2,
      direction: 'outbound',
    })
    state.replayEntries.push({ envelopeId: 'envelope-id', acceptedAt: 1 })
    state.queuedEnvelopes.push({
      envelopeId: 'envelope-id',
      routeId: 'route-id',
      encoded: 'ciphertext',
      createdAt: 1,
      expiresAt: 2,
      attempts: 0,
      lastAttemptAt: 0,
      deletionTokenHash: 'deletion-hash',
    })
    state.outboundDeliverySequence = 1
    state.outboundCorrelations.push({
      version: 1,
      envelopeId: 'envelope-id',
      localMessageId: 'local-message-id',
      remoteIdentityId: 'identity-b',
      encodedEnvelope: 'sealed-route-envelope',
      encodedReturnCapability: 'sealed-return-capability',
      state: 'stored',
      failureReason: null,
      createdAt: 1,
      expiresAt: 2,
      updatedAt: 1,
      attempts: 0,
      sequence: 1,
    })

    await saveBleMeshState(walletA, state)

    const raw = [...mockState.asyncStorage.values()].join('')
    expect(raw).not.toContain('private-secret')
    expect(raw).not.toContain('capability-secret')
    expect(raw).not.toContain('identity-b')
    expect(raw).not.toContain('local-message-id')
    await expect(loadBleMeshState(walletA)).resolves.toEqual(state)
    await expect(loadBleMeshState(walletB)).resolves.toEqual({
      version: 3,
      staticKey: null,
      capabilities: [],
      queuedEnvelopes: [],
      replayEntries: [],
      outboundCorrelations: [],
      outboundDeliverySequence: 0,
    })
  })

  it('fails closed and deletes a tampered state record', async () => {
    const { loadBleMeshState, saveBleMeshState } = await import('./bleMeshStorage')
    await saveBleMeshState(walletA, {
      version: 3,
      staticKey: null,
      capabilities: [],
      queuedEnvelopes: [],
      replayEntries: [],
      outboundCorrelations: [],
      outboundDeliverySequence: 0,
    })
    const key = [...mockState.asyncStorage.keys()][0]
    const cipher = JSON.parse(mockState.asyncStorage.get(key) || '{}')
    cipher.ciphertext = `${cipher.ciphertext}A`
    mockState.asyncStorage.set(key, JSON.stringify(cipher))

    await expect(loadBleMeshState(walletA)).rejects.toThrow(
      'BLE mesh state authentication failed',
    )
    expect(mockState.asyncStorage.has(key)).toBe(false)
  })

  it('clears every wallet-scoped BLE record without touching unrelated storage', async () => {
    const { clearBleMeshState, saveBleMeshState } = await import('./bleMeshStorage')
    const empty = {
      version: 3 as const,
      staticKey: null,
      capabilities: [],
      queuedEnvelopes: [],
      replayEntries: [],
      outboundCorrelations: [],
      outboundDeliverySequence: 0,
    }
    await saveBleMeshState(walletA, empty)
    await saveBleMeshState(walletB, empty)
    mockState.asyncStorage.set('unrelated', 'keep')

    await clearBleMeshState()

    expect([...mockState.asyncStorage.entries()]).toEqual([['unrelated', 'keep']])
  })

  it('migrates an authenticated v2 wallet state to v3', async () => {
    const { buildLocalCacheAad, sealLocalCacheText } = await import('./localCacheCrypto')
    const { normalizeAccountStorageScope } = await import('@/lib/accountScope')
    const scope = normalizeAccountStorageScope(walletA)!
    const legacyState = {
      version: 2,
      staticKey: null,
      capabilities: [],
      queuedEnvelopes: [],
      replayEntries: [{ envelopeId: 'accepted-envelope', acceptedAt: 1 }],
    }
    const cipher = await sealLocalCacheText(
      scope,
      'ble',
      JSON.stringify(legacyState),
      buildLocalCacheAad(['spectra', 'ble-mesh', 'v2', scope]),
    )
    mockState.asyncStorage.set(
      `ble_mesh_state:v2:${scope}`,
      JSON.stringify(cipher),
    )

    const { loadBleMeshState } = await import('./bleMeshStorage')
    await expect(loadBleMeshState(walletA)).resolves.toEqual({
      ...legacyState,
      version: 3,
      outboundCorrelations: [],
      outboundDeliverySequence: 0,
    })
    expect(mockState.asyncStorage.has(`ble_mesh_state:v2:${scope}`)).toBe(false)
    expect(mockState.asyncStorage.has(`ble_mesh_state:v3:${scope}`)).toBe(true)
  })

  it('rejects outbound correlation state beyond the persisted count bound', async () => {
    const {
      MAX_BLE_OUTBOUND_CORRELATIONS,
      saveBleMeshState,
    } = await import('./bleMeshStorage')
    const outboundCorrelations = Array.from(
      { length: MAX_BLE_OUTBOUND_CORRELATIONS + 1 },
      (_, index) => ({
        version: 1 as const,
        envelopeId: `envelope-${index}`,
        localMessageId: `message-${index}`,
        remoteIdentityId: 'identity-b',
        encodedEnvelope: 'envelope',
        encodedReturnCapability: 'capability',
        state: 'pending' as const,
        failureReason: null,
        createdAt: 1,
        expiresAt: 2,
        updatedAt: 1,
        attempts: 0,
        sequence: index + 1,
      }),
    )

    await expect(saveBleMeshState(walletA, {
      version: 3,
      staticKey: null,
      capabilities: [],
      queuedEnvelopes: [],
      replayEntries: [],
      outboundCorrelations,
      outboundDeliverySequence: outboundCorrelations.length,
    })).rejects.toThrow('BLE outbound correlation state exceeds its bound')
    expect(mockState.asyncStorage.size).toBe(0)
  })
})
