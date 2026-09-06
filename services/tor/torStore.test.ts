/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  deleteItemAsync: vi.fn(async () => {}),
  getItemAsync: vi.fn(async () => null as string | null),
  setItemAsync: vi.fn(async () => {}),
  assertBridgeBootstrapConsent: vi.fn(async () => {}),
}))

vi.mock('@/lib/constants', () => ({
  SECURE_STORE_OPTIONS: { keychainAccessible: 'after-first-unlock' },
  STORAGE_KEYS: {
    VAULT: 'vault',
  },
}))

vi.mock('expo-secure-store', () => ({
  deleteItemAsync: mockState.deleteItemAsync,
  getItemAsync: mockState.getItemAsync,
  setItemAsync: mockState.setItemAsync,
}))

vi.mock('./snowflakeConsent', () => ({
  assertBridgeBootstrapConsent: mockState.assertBridgeBootstrapConsent,
}))

import { TOR_STORAGE_KEYS } from './torConstants'
import { useTorStore } from './torStore'
import {
  isClearnetEgressAllowed,
  registerClearnetOperation,
  setClearnetEgressAllowed,
} from './torEgressPolicy'

function resetTorStoreState(): void {
  useTorStore.setState({
    enabled: false,
    status: 'disconnected',
    socksPort: 9050,
    errorMessage: null,
    bridges: [],
    bridgeType: 'none',
    initialized: false,
    exitIp: null,
    exitCountry: null,
    exitCountryCode: null,
    isTorVerified: null,
    lastVerifiedAt: null,
    lastHealthError: null,
    presenceGateReason: null,
  })
}

beforeEach(async () => {
  await setClearnetEgressAllowed(true)
  resetTorStoreState()
  mockState.deleteItemAsync.mockClear()
  mockState.getItemAsync.mockReset()
  mockState.getItemAsync.mockResolvedValue(null)
  mockState.setItemAsync.mockClear()
  mockState.assertBridgeBootstrapConsent.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('useTorStore persistence', () => {
  it('initializes persisted enabled and bridge state', async () => {
    mockState.getItemAsync
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(JSON.stringify([' obfs4 192.0.2.1:443 cert=abc iat-mode=0 ']))
      .mockResolvedValueOnce('obfs4')

    await useTorStore.getState().initialize()

    expect(useTorStore.getState()).toMatchObject({
      enabled: true,
      bridges: ['obfs4 192.0.2.1:443 cert=abc iat-mode=0'],
      bridgeType: 'obfs4',
      initialized: true,
      exitIp: null,
      lastHealthError: null,
    })
  })

  it('degrades safely when persisted bridge JSON is corrupt', async () => {
    mockState.getItemAsync
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('{bad json')
      .mockResolvedValueOnce('obfs4')

    await useTorStore.getState().initialize()

    expect(useTorStore.getState().initialized).toBe(true)
    expect(useTorStore.getState().enabled).toBe(true)
    expect(useTorStore.getState().status).toBe('error')
    expect(useTorStore.getState().bridges).toEqual([])
    expect(isClearnetEgressAllowed()).toBe(false)
  })

  it('persists normalized bridge lines and rejects torrc control characters', async () => {
    await useTorStore.getState().setBridges([
      '  obfs4 192.0.2.1:443 cert=abc iat-mode=0  ',
      '',
    ], 'obfs4')

    expect(useTorStore.getState().bridges).toEqual(['obfs4 192.0.2.1:443 cert=abc iat-mode=0'])
    expect(mockState.setItemAsync).toHaveBeenCalledWith(
      TOR_STORAGE_KEYS.BRIDGE_CONFIG,
      JSON.stringify({
        v: 1,
        bridges: ['obfs4 192.0.2.1:443 cert=abc iat-mode=0'],
        bridgeType: 'obfs4',
      }),
      expect.any(Object),
    )

    await expect(useTorStore.getState().setBridges([
      'obfs4 192.0.2.1:443 cert=abc\nSocksPort 0',
    ], 'obfs4')).rejects.toThrow('unsupported control characters')
  })

  it('loads the atomic bridge configuration before legacy keys', async () => {
    mockState.getItemAsync
      .mockResolvedValueOnce('true')
      .mockResolvedValueOnce(JSON.stringify({
        v: 1,
        bridges: ['snowflake 192.0.2.3:443'],
        bridgeType: 'snowflake',
      }))
      .mockResolvedValueOnce(JSON.stringify(['legacy.example:443']))
      .mockResolvedValueOnce('none')

    await useTorStore.getState().initialize()

    expect(useTorStore.getState()).toMatchObject({
      bridges: ['snowflake 192.0.2.3:443'],
      bridgeType: 'snowflake',
    })
  })

  it('keeps the previous in-memory configuration when persistence fails', async () => {
    useTorStore.setState({
      bridges: ['obfs4 192.0.2.1:443 cert=old iat-mode=0'],
      bridgeType: 'obfs4',
    })
    mockState.setItemAsync.mockRejectedValueOnce(new Error('secure storage unavailable'))

    await expect(useTorStore.getState().setBridges(
      ['snowflake 192.0.2.2:443'],
      'snowflake',
    )).rejects.toThrow('secure storage unavailable')

    expect(useTorStore.getState()).toMatchObject({
      bridges: ['obfs4 192.0.2.1:443 cert=old iat-mode=0'],
      bridgeType: 'obfs4',
    })
  })

  it('keeps clearnet closed when persisted Tor state is corrupt', async () => {
    mockState.getItemAsync
      .mockResolvedValueOnce('false')
      .mockResolvedValueOnce('{bad json')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)

    await useTorStore.getState().initialize()

    expect(useTorStore.getState().enabled).toBe(true)
    expect(useTorStore.getState().status).toBe('error')
    expect(isClearnetEgressAllowed()).toBe(false)
  })

  it('clears presence gates and health state on status/enable transitions', async () => {
    useTorStore.getState().requestPresenceGate('startup')
    await useTorStore.getState().setEnabled(false)
    expect(useTorStore.getState().presenceGateReason).toBeNull()

    useTorStore.getState().requestPresenceGate('foreground_resume')
    useTorStore.getState().setStatus('error', 'health failed')
    expect(useTorStore.getState().lastHealthError).toBe('health failed')

    useTorStore.getState().setStatus('connected')
    expect(useTorStore.getState().presenceGateReason).toBeNull()
    expect(useTorStore.getState().lastHealthError).toBeNull()
  })

  it('closes the clearnet boundary before enabling Tor and reopens it on disable', async () => {
    const cancel = vi.fn()
    registerClearnetOperation(cancel)

    await useTorStore.getState().setEnabled(true)

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(isClearnetEgressAllowed()).toBe(false)

    await useTorStore.getState().setEnabled(false)
    expect(isClearnetEgressAllowed()).toBe(true)
  })

  it('notifies subscribers only after the matching egress policy is active', async () => {
    const observations: Array<{ enabled: boolean; clearnetAllowed: boolean }> = []
    const unsubscribe = useTorStore.subscribe((state, previousState) => {
      if (state.enabled !== previousState.enabled) {
        observations.push({
          enabled: state.enabled,
          clearnetAllowed: isClearnetEgressAllowed(),
        })
      }
    })

    await useTorStore.getState().setEnabled(true)
    await useTorStore.getState().setEnabled(false)
    unsubscribe()

    expect(observations).toEqual([
      { enabled: true, clearnetAllowed: false },
      { enabled: false, clearnetAllowed: true },
    ])
  })

  it('serializes overlapping enable and disable transitions', async () => {
    let finishCancellation: (() => void) | null = null
    registerClearnetOperation(() => new Promise<void>((resolve) => {
      finishCancellation = resolve
    }))

    const enable = useTorStore.getState().setEnabled(true)
    await vi.waitFor(() => {
      expect(finishCancellation).not.toBeNull()
    })
    const disable = useTorStore.getState().setEnabled(false)

    expect(isClearnetEgressAllowed()).toBe(false)
    finishCancellation!()
    await Promise.all([enable, disable])

    expect(useTorStore.getState().enabled).toBe(false)
    expect(isClearnetEgressAllowed()).toBe(true)
    expect(mockState.setItemAsync).toHaveBeenNthCalledWith(
      1,
      TOR_STORAGE_KEYS.ENABLED,
      'true',
      expect.any(Object),
    )
    expect(mockState.setItemAsync).toHaveBeenNthCalledWith(
      2,
      TOR_STORAGE_KEYS.ENABLED,
      'false',
      expect.any(Object),
    )
  })

  it('serializes reset behind an in-flight enable transition', async () => {
    const cancellation = { finish: null as (() => void) | null }
    registerClearnetOperation(() => new Promise<void>((resolve) => {
      cancellation.finish = resolve
    }))

    const enable = useTorStore.getState().setEnabled(true)
    await vi.waitFor(() => {
      expect(cancellation.finish).not.toBeNull()
    })
    useTorStore.getState().reset()
    cancellation.finish?.()
    await enable
    await vi.waitFor(() => {
      expect(useTorStore.getState().enabled).toBe(false)
      expect(isClearnetEgressAllowed()).toBe(true)
    })
  })

  it('stores and clears verification snapshots independently of persistence', () => {
    useTorStore.getState().setVerificationSnapshot({
      exitIp: '203.0.113.9',
      exitCountry: 'Germany',
      exitCountryCode: 'DE',
      isTorVerified: true,
      lastVerifiedAt: 1234,
      lastHealthError: null,
    })

    expect(useTorStore.getState()).toMatchObject({
      exitIp: '203.0.113.9',
      exitCountry: 'Germany',
      exitCountryCode: 'DE',
      isTorVerified: true,
      lastVerifiedAt: 1234,
      lastHealthError: null,
    })
  })
})
