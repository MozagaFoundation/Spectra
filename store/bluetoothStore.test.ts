/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  storage: new Map<string, string>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockState.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockState.storage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      mockState.storage.delete(key)
    }),
    getAllKeys: vi.fn(async () => [...mockState.storage.keys()]),
    multiRemove: vi.fn(async (keys: string[]) => {
      keys.forEach((key) => mockState.storage.delete(key))
    }),
  },
}))

describe('bluetoothStore', () => {
  const walletA = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const walletB = 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

  beforeEach(() => {
    vi.resetModules()
    mockState.storage.clear()
  })

  it('migrates legacy config without carrying forward unsafe enablement', async () => {
    mockState.storage.set('ble_mesh_config', JSON.stringify({
      enabled: true,
      maxTTL: 3,
      relayEnabled: true,
      storeForwardEnabled: true,
    }))

    const { useBluetoothStore } = await import('./bluetoothStore')
    const config = await useBluetoothStore.getState().loadConfig(walletA)

    expect(config).toEqual(expect.objectContaining({
      enabled: false,
      maxTTL: 3,
      relayEnabled: false,
      storeForwardEnabled: false,
      scanDutyMs: expect.any(Number),
    }))
    expect(mockState.storage.has('ble_mesh_config')).toBe(false)
    expect(mockState.storage.has(`ble_mesh_config:v2:${walletA}`)).toBe(true)
  })

  it('loads only the active wallet config and falls back on corrupt JSON', async () => {
    mockState.storage.set(`ble_mesh_config:v2:${walletA}`, JSON.stringify({
      enabled: true,
      maxTTL: 3,
      relayEnabled: false,
    }))
    mockState.storage.set(`ble_mesh_config:v2:${walletB}`, JSON.stringify({
      enabled: false,
      maxTTL: 2,
    }))

    const { useBluetoothStore } = await import('./bluetoothStore')
    const config = await useBluetoothStore.getState().loadConfig(walletA)
    expect(config).toEqual(expect.objectContaining({ enabled: true, maxTTL: 3 }))

    mockState.storage.set(`ble_mesh_config:v2:${walletA}`, '{')
    const fallback = await useBluetoothStore.getState().loadConfig(walletA)

    expect(fallback).toEqual(expect.objectContaining({
      enabled: false,
    }))
  })

  it('persists config changes and reflects enabled status transitions', async () => {
    const { useBluetoothStore } = await import('./bluetoothStore')
    await useBluetoothStore.getState().loadConfig(walletA)

    useBluetoothStore.getState().setConfig({ maxTTL: 4, storeForwardEnabled: false })
    await Promise.resolve()

    expect(JSON.parse(mockState.storage.get(`ble_mesh_config:v2:${walletA}`) || '{}')).toEqual(expect.objectContaining({
      maxTTL: 4,
      storeForwardEnabled: false,
    }))

    await useBluetoothStore.getState().setEnabled(true)

    expect(useBluetoothStore.getState().status).toBe('initializing')
    expect(JSON.parse(mockState.storage.get(`ble_mesh_config:v2:${walletA}`) || '{}')).toEqual(expect.objectContaining({
      enabled: true,
    }))
  })

  it('clears scoped and legacy BLE settings during teardown', async () => {
    mockState.storage.set('ble_mesh_config', '{}')
    mockState.storage.set(`ble_mesh_config:v2:${walletA}`, '{}')
    mockState.storage.set(`ble_mesh_config:v2:${walletB}`, '{}')
    mockState.storage.set('unrelated', 'keep')

    const { clearPersistedBluetoothConfig } = await import('./bluetoothStore')
    await clearPersistedBluetoothConfig()

    expect([...mockState.storage.entries()]).toEqual([['unrelated', 'keep']])
  })

  it('tracks volatile status, nearby contacts, stats, and reset state', async () => {
    const { useBluetoothStore } = await import('./bluetoothStore')

    useBluetoothStore.getState().setStatus('active')
    useBluetoothStore.getState().setInitialized(true)
    useBluetoothStore.getState().setError('permission denied')
    useBluetoothStore.getState().setInternetAvailable(false)
    useBluetoothStore.getState().setNearbyContacts([
      { identityId: 'identity-1', displayName: 'Alice', rssi: -60, lastSeenAt: 1, deviceId: 'device-1' },
    ])
    useBluetoothStore.getState().setStats({
      totalSent: 1,
      totalReceived: 2,
      totalRelayed: 3,
      totalDropped: 4,
      peerCount: 5,
    })
    useBluetoothStore.getState().setDiagnostics({
      runId: 2,
      running: true,
      startedAt: 1,
      updatedAt: 2,
      currentStage: 'gatt_ready',
      furthestStage: 'gatt_ready',
      lastFailure: null,
      lastFailureCause: null,
      eligibleContactCount: 1,
      noiseSelfTest: 'passed',
      payloadBudgetSource: 'ios_fallback',
      payloadBudgetBytes: 182,
      handshakeProgress: 'step_2_received',
    })
    useBluetoothStore.getState().setMessageDiagnostics({
      peerIdentityId: 'identity-1',
      operationId: 1,
      direction: 'outbound',
      stage: 'awaiting_receipt',
      failure: null,
      startedAt: 1,
      updatedAt: 2,
    })
    useBluetoothStore.getState().clearMessageDiagnostics()
    expect(useBluetoothStore.getState().messageDiagnostics).toEqual({})

    useBluetoothStore.getState().reset()

    expect(useBluetoothStore.getState()).toEqual(expect.objectContaining({
      status: 'disabled',
      walletScope: null,
      initialized: false,
      error: null,
      internetAvailable: true,
      nearbyContacts: [],
      messageDiagnostics: {},
      diagnostics: expect.objectContaining({
        runId: 0,
        startedAt: null,
        currentStage: 'idle',
        noiseSelfTest: 'not_run',
      }),
      stats: {
        totalSent: 0,
        totalReceived: 0,
        totalRelayed: 0,
        totalDropped: 0,
        peerCount: 0,
      },
    }))
  })
})
