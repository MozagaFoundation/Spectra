/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  httpGet: vi.fn(),
  getServiceStatus: vi.fn(),
  startTorIfNotRunning: vi.fn(),
  shutdownService: vi.fn(),
  startTransport: vi.fn(),
  stopTransports: vi.fn(),
  registerBackgroundFetch: vi.fn(),
  unregisterBackgroundFetch: vi.fn(),
  startTorLatencySpan: vi.fn(() => ({ end: vi.fn() })),
  recordTorDiagnostic: vi.fn(),
  createTorCorrelationId: vi.fn((prefix: string) => `${prefix}-test-id`),
  fileDeletes: [] as string[],
  fileExistsByUri: new Map<string, boolean>(),
  fileWrites: [] as Array<{ uri: string; contents: string }>,
  appState: 'active',
}))

vi.mock('./torConstants', async (importOriginal) => {
  const original = await importOriginal<typeof import('./torConstants')>()
  return {
    ...original,
    TOR_CONFIG: {
      ...original.TOR_CONFIG,
      RECONNECT_DELAY_MS: 0,
      POST_CONNECT_STABILIZATION_MS: 0,
    },
  }
})

vi.mock('@/lib/constants', () => ({
  STORAGE_KEYS: {
    VAULT: 'vault',
  },
  SECURE_STORE_OPTIONS: {},
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}))

vi.mock('react-native-nitro-tor', () => ({
  RnTor: {
    httpGet: mockState.httpGet,
    getServiceStatus: mockState.getServiceStatus,
    startTorIfNotRunning: mockState.startTorIfNotRunning,
    shutdownService: mockState.shutdownService,
  },
}))

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return mockState.appState
    },
  },
}))

vi.mock('expo-file-system', () => ({
  Paths: {
    document: { uri: 'file:///tmp' },
  },
  Directory: class Directory {
    exists = true
    constructor(private uri: string) {}
    create(_options?: { idempotent?: boolean }) {}
    delete() {
      mockState.fileDeletes.push(this.uri)
      mockState.fileExistsByUri.set(this.uri, false)
    }
  },
  File: class File {
    constructor(private uri: string) {}
    get exists(): boolean {
      return mockState.fileExistsByUri.get(this.uri) ?? false
    }
    delete() {
      mockState.fileDeletes.push(this.uri)
      mockState.fileExistsByUri.set(this.uri, false)
    }
    write(contents: string) {
      mockState.fileWrites.push({ uri: this.uri, contents })
      mockState.fileExistsByUri.set(this.uri, true)
    }
  },
}))

vi.mock('./iptProxy', () => ({
  startTransport: mockState.startTransport,
  stopTransports: mockState.stopTransports,
  isIPtProxyAvailable: vi.fn(() => true),
}))

vi.mock('./torBackgroundFetch', () => ({
  registerBackgroundFetch: mockState.registerBackgroundFetch,
  unregisterBackgroundFetch: mockState.unregisterBackgroundFetch,
}))

vi.mock('./torDiagnostics', () => ({
  captureTorNetworkSnapshot: vi.fn(async () => ({})),
  createTorCorrelationId: mockState.createTorCorrelationId,
  recordTorDiagnostic: mockState.recordTorDiagnostic,
  startTorLatencySpan: mockState.startTorLatencySpan,
}))

import { useTorStore } from './torStore'
import { isIPtProxyAvailable } from './iptProxy'
import {
  applyTorBridgeConfiguration,
  ensureTorReady,
  refreshTorExitNodeDetails,
  runPeriodicTorHealthCheck,
  startTor,
  stopTor,
} from './torService'

function resetTorStore(
  overrides: Partial<ReturnType<typeof useTorStore.getState>> = {},
) {
  useTorStore.setState({
    enabled: true,
    status: 'connected',
    socksPort: 9050,
    errorMessage: null,
    bridges: [],
    bridgeType: 'none',
    initialized: true,
    exitIp: null,
    exitCountry: null,
    exitCountryCode: null,
    isTorVerified: null,
    lastVerifiedAt: null,
    lastHealthError: null,
    presenceGateReason: null,
    ...overrides,
  })
}

function mockTorVerificationSuccess(
  options: {
    includeGeo?: boolean
    ip?: string
    country?: string
    countryCode?: string
  } = {},
): void {
  mockState.httpGet.mockResolvedValueOnce({
    error: '',
    body: JSON.stringify({
      IP: options.ip ?? '203.0.113.5',
      IsTor: true,
    }),
  })

  if (options.includeGeo) {
    mockState.httpGet.mockResolvedValueOnce({
      error: '',
      body: JSON.stringify({
        country: options.country ?? 'Germany',
        countryCode: options.countryCode ?? 'DE',
      }),
    })
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void

  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

beforeEach(() => {
  vi.stubGlobal('__DEV__', false)
  resetTorStore()
  mockState.httpGet.mockReset()
  mockState.getServiceStatus.mockReset()
  mockState.startTorIfNotRunning.mockReset()
  mockState.shutdownService.mockReset()
  mockState.startTransport.mockReset()
  mockState.stopTransports.mockReset()
  mockState.registerBackgroundFetch.mockReset()
  mockState.unregisterBackgroundFetch.mockReset()
  mockState.recordTorDiagnostic.mockReset()
  mockState.startTorLatencySpan.mockClear()
  mockState.fileDeletes = []
  mockState.fileWrites = []
  mockState.fileExistsByUri = new Map()
  mockState.appState = 'active'

  mockState.startTorIfNotRunning.mockResolvedValue({
    is_success: true,
    onion_address: '',
    control: '',
    error_message: '',
  })
  mockState.shutdownService.mockResolvedValue(true)
  mockState.startTransport.mockResolvedValue(15000)
  mockState.stopTransports.mockResolvedValue(undefined)
  mockState.registerBackgroundFetch.mockResolvedValue(undefined)
  mockState.unregisterBackgroundFetch.mockResolvedValue(undefined)

  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  try {
    await stopTor()
  } catch {
    // Ignore cleanup failures.
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('ensureTorReady', () => {
  it('restarts when the store says connected but the native service is gone', async () => {
    resetTorStore({ status: 'connected' })

    const onRecoveryNeeded = vi.fn()
    const statusTransitions: string[] = []
    const unsubscribe = useTorStore.subscribe((state, previousState) => {
      if (state.status !== previousState.status) {
        statusTransitions.push(state.status)
      }
    })

    mockState.getServiceStatus
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
    mockTorVerificationSuccess()

    const ready = await ensureTorReady({
      reason: 'foreground_resume',
      onRecoveryNeeded,
    })
    unsubscribe()

    expect(ready).toBe(true)
    expect(onRecoveryNeeded).toHaveBeenCalledTimes(1)
    expect(mockState.startTorIfNotRunning).toHaveBeenCalledTimes(1)
    expect(statusTransitions).toEqual(
      expect.arrayContaining(['error', 'connecting', 'connected'])
    )
    expect(useTorStore.getState().status).toBe('connected')
  })

  it('adopts a healthy running native Tor service without restarting it', async () => {
    resetTorStore({ status: 'disconnected' })

    const onRecoveryNeeded = vi.fn()
    mockState.getServiceStatus.mockResolvedValueOnce(1)
    mockTorVerificationSuccess({
      ip: '203.0.113.7',
    })
    mockTorVerificationSuccess({
      includeGeo: true,
      ip: '203.0.113.7',
      country: 'United States',
      countryCode: 'US',
    })

    const ready = await ensureTorReady({
      reason: 'startup',
      onRecoveryNeeded,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(ready).toBe(true)
    expect(onRecoveryNeeded).not.toHaveBeenCalled()
    expect(mockState.startTorIfNotRunning).not.toHaveBeenCalled()
    expect(useTorStore.getState().status).toBe('connected')
    expect(useTorStore.getState().exitIp).toBe('203.0.113.7')
    expect(useTorStore.getState().exitCountry).toBe('United States')
    expect(useTorStore.getState().exitCountryCode).toBe('US')
  })

  it('adopts a running native daemon when the website probe fails', async () => {
    resetTorStore({ status: 'disconnected' })

    const onRecoveryNeeded = vi.fn()
    mockState.getServiceStatus.mockResolvedValueOnce(1)
    mockState.httpGet.mockResolvedValueOnce({
      error: 'Network request failed',
      body: '',
    })

    const ready = await ensureTorReady({
      reason: 'startup',
      onRecoveryNeeded,
    })

    expect(ready).toBe(true)
    expect(onRecoveryNeeded).not.toHaveBeenCalled()
    expect(mockState.startTorIfNotRunning).not.toHaveBeenCalled()
    expect(useTorStore.getState().status).toBe('connected')
  })
})

describe('startTor', () => {
  it('reuses an in-flight startup for concurrent callers', async () => {
    resetTorStore({ status: 'disconnected' })
    const nativeStartDeferred = createDeferred<{
      is_success: boolean
      onion_address: string
      control: string
      error_message: string
    }>()
    mockState.startTorIfNotRunning.mockImplementationOnce(() => nativeStartDeferred.promise)
    mockState.getServiceStatus
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
    mockTorVerificationSuccess()

    const firstStart = startTor()
    const secondStart = startTor()

    await vi.waitFor(() => {
      expect(mockState.startTorIfNotRunning).toHaveBeenCalledTimes(1)
    })

    nativeStartDeferred.resolve({
      is_success: true,
      onion_address: '',
      control: '',
      error_message: '',
    })

    await expect(Promise.all([firstStart, secondStart])).resolves.toEqual([true, true])
    expect(mockState.startTorIfNotRunning).toHaveBeenCalledTimes(1)
    expect(useTorStore.getState().status).toBe('connected')
  })

  it('cleans up a native startup that finishes after Tor is disabled', async () => {
    resetTorStore({ status: 'disconnected' })
    const nativeStartDeferred = createDeferred<{
      is_success: boolean
      onion_address: string
      control: string
      error_message: string
    }>()
    mockState.getServiceStatus.mockResolvedValueOnce(2)
    mockState.startTorIfNotRunning.mockImplementationOnce(() => nativeStartDeferred.promise)

    const activation = startTor()
    await vi.waitFor(() => {
      expect(mockState.startTorIfNotRunning).toHaveBeenCalledTimes(1)
    })

    await useTorStore.getState().setEnabled(false)
    const deactivation = stopTor()
    nativeStartDeferred.resolve({
      is_success: true,
      onion_address: '',
      control: '',
      error_message: '',
    })

    await expect(activation).resolves.toBe(false)
    await deactivation

    expect(useTorStore.getState()).toMatchObject({
      enabled: false,
      status: 'disconnected',
    })
    expect(mockState.shutdownService).toHaveBeenCalled()
    expect(mockState.registerBackgroundFetch).not.toHaveBeenCalled()
    expect(mockState.recordTorDiagnostic).toHaveBeenCalledWith(
      'service',
      'start_cancelled',
      expect.objectContaining({ stage: 'native_start' }),
    )
  })

  it('marks chat ready when the daemon is running even if the website probe fails', async () => {
    resetTorStore({ status: 'disconnected' })

    mockState.getServiceStatus
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
    mockState.httpGet.mockResolvedValueOnce({
      error: 'Network request failed',
      body: '',
    })

    const started = await startTor()

    expect(started).toBe(true)
    expect(mockState.startTorIfNotRunning).toHaveBeenCalledTimes(1)
    expect(mockState.registerBackgroundFetch).toHaveBeenCalledTimes(1)
    expect(useTorStore.getState().status).toBe('connected')
  })

  it('does not block startup on exit-country lookup', async () => {
    resetTorStore({ status: 'disconnected' })

    const geoDeferred = createDeferred<{ error: string; body: string }>()
    mockState.getServiceStatus
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
    mockState.httpGet
      .mockResolvedValueOnce({
        error: '',
        body: JSON.stringify({
          IP: '203.0.113.9',
          IsTor: true,
        }),
      })
      .mockResolvedValueOnce({
        error: '',
        body: JSON.stringify({
          IP: '203.0.113.9',
          IsTor: true,
        }),
      })
      .mockImplementationOnce(() => geoDeferred.promise)

    const started = await startTor()

    expect(started).toBe(true)
    expect(useTorStore.getState().status).toBe('connected')
    expect(useTorStore.getState().exitIp).toBe('203.0.113.9')
    expect(useTorStore.getState().exitCountry).toBeNull()

    geoDeferred.resolve({
      error: '',
      body: JSON.stringify({
        country: 'Germany',
        countryCode: 'DE',
      }),
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(useTorStore.getState().exitCountry).toBe('Germany')
    expect(useTorStore.getState().exitCountryCode).toBe('DE')
  })

  it('fails before native start when bridge transport support is unavailable', async () => {
    resetTorStore({
      status: 'disconnected',
      enabled: false,
      bridges: ['obfs4 192.0.2.1:443 cert=abc iat-mode=0'],
      bridgeType: 'obfs4',
    })
    vi.mocked(isIPtProxyAvailable).mockReturnValueOnce(false)
    mockState.getServiceStatus.mockResolvedValueOnce(2)

    const started = await startTor()

    expect(started).toBe(false)
    expect(mockState.startTorIfNotRunning).not.toHaveBeenCalled()
    expect(useTorStore.getState().status).toBe('error')
    expect(useTorStore.getState().errorMessage).toContain('requires a native rebuild')
  })

  it('rejects invalid bridge lines before touching the native service', async () => {
    resetTorStore({
      status: 'disconnected',
      bridges: ['obfs4 192.0.2.1:443 cert=abc\nSocksPort 0'],
      bridgeType: 'obfs4',
    })

    const started = await startTor()

    expect(started).toBe(false)
    expect(mockState.getServiceStatus).not.toHaveBeenCalled()
    expect(mockState.startTorIfNotRunning).not.toHaveBeenCalled()
    expect(useTorStore.getState().errorMessage).toContain('unsupported control characters')
  })

  it('removes a stale torrc when starting without bridges', async () => {
    resetTorStore({ status: 'disconnected', bridges: [], bridgeType: 'none' })
    mockState.fileExistsByUri.set('file:///tmp/tor-data/torrc', true)
    mockState.getServiceStatus
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
    mockTorVerificationSuccess()

    const started = await startTor()

    expect(started).toBe(true)
    expect(mockState.fileDeletes).toContain('file:///tmp/tor-data/torrc')
    expect(mockState.fileWrites).toEqual([])
  })
})

describe('applyTorBridgeConfiguration', () => {
  const previousBridge = 'obfs4 192.0.2.1:443 cert=old iat-mode=0'

  it('commits a clear only after direct Tor is verified', async () => {
    resetTorStore({
      bridges: [previousBridge],
      bridgeType: 'obfs4',
      status: 'connected',
    })
    mockState.getServiceStatus
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
    mockTorVerificationSuccess()

    const result = await applyTorBridgeConfiguration([], 'none')

    expect(result).toEqual({ outcome: 'applied', success: true, routeReady: true })
    expect(useTorStore.getState()).toMatchObject({
      enabled: true,
      status: 'connected',
      bridges: [],
      bridgeType: 'none',
    })
  })

  it('restores the prior bridges when direct Tor cannot connect', async () => {
    resetTorStore({
      bridges: [previousBridge],
      bridgeType: 'obfs4',
      status: 'connected',
    })
    mockState.startTorIfNotRunning
      .mockResolvedValueOnce({
        is_success: false,
        onion_address: '',
        control: '',
        error_message: 'direct route blocked',
      })
      .mockResolvedValueOnce({
        is_success: true,
        onion_address: '',
        control: '',
        error_message: '',
      })
    mockState.getServiceStatus
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
    mockTorVerificationSuccess()

    const result = await applyTorBridgeConfiguration([], 'none')

    expect(result).toEqual({
      outcome: 'restored',
      success: false,
      routeReady: true,
      error: 'direct route blocked',
    })
    expect(useTorStore.getState()).toMatchObject({
      enabled: true,
      status: 'connected',
      bridges: [previousBridge],
      bridgeType: 'obfs4',
    })
    expect(mockState.startTransport).toHaveBeenCalledWith('obfs4')
  })

  it('reports a blocked route if both requested and rollback connections fail', async () => {
    resetTorStore({
      bridges: [previousBridge],
      bridgeType: 'obfs4',
      status: 'connected',
    })
    mockState.startTorIfNotRunning
      .mockResolvedValueOnce({
        is_success: false,
        onion_address: '',
        control: '',
        error_message: 'direct route blocked',
      })
      .mockResolvedValueOnce({
        is_success: false,
        onion_address: '',
        control: '',
        error_message: 'bridge route blocked',
      })
    mockState.getServiceStatus
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)

    const result = await applyTorBridgeConfiguration([], 'none')

    expect(result).toMatchObject({
      outcome: 'rollback_failed',
      success: false,
      routeReady: false,
    })
    expect(useTorStore.getState()).toMatchObject({
      enabled: true,
      status: 'error',
      bridges: [previousBridge],
      bridgeType: 'obfs4',
    })
  })

  it('persists without reconnecting while Tor is disabled', async () => {
    resetTorStore({ enabled: false, status: 'disconnected' })

    const result = await applyTorBridgeConfiguration(
      ['198.51.100.1:443 ABCDEF'],
      'none',
    )

    expect(result).toEqual({ outcome: 'applied', success: true, routeReady: false })
    expect(mockState.shutdownService).not.toHaveBeenCalled()
    expect(mockState.startTorIfNotRunning).not.toHaveBeenCalled()
    expect(useTorStore.getState().bridges).toEqual(['198.51.100.1:443 ABCDEF'])
  })
})

describe('refreshTorExitNodeDetails', () => {
  it('stores the verified exit-node metadata after a geo-enabled refresh', async () => {
    mockTorVerificationSuccess({ includeGeo: true })

    const startedAt = Date.now()
    const result = await refreshTorExitNodeDetails('test_refresh')
    const state = useTorStore.getState()

    expect(result).toEqual({
      connected: true,
      ip: '203.0.113.5',
      isTor: true,
      country: 'Germany',
      countryCode: 'DE',
    })
    expect(mockState.httpGet).toHaveBeenCalledTimes(2)
    expect(state.exitIp).toBe('203.0.113.5')
    expect(state.exitCountry).toBe('Germany')
    expect(state.exitCountryCode).toBe('DE')
    expect(state.isTorVerified).toBe(true)
    expect(state.lastVerifiedAt).not.toBeNull()
    expect((state.lastVerifiedAt ?? 0) >= startedAt).toBe(true)
    expect(state.lastHealthError).toBeNull()
  })

  it('preserves the last verified exit metadata when the refresh fails', async () => {
    useTorStore.setState({
      exitIp: '198.51.100.8',
      exitCountry: 'France',
      exitCountryCode: 'FR',
      isTorVerified: true,
      lastVerifiedAt: 123456,
      lastHealthError: null,
    })
    mockState.httpGet.mockResolvedValueOnce({
      error: 'Network request failed',
      body: '',
    })

    const result = await refreshTorExitNodeDetails('test_failure')
    const state = useTorStore.getState()

    expect(result).toEqual({
      connected: false,
      error: 'Network request failed',
    })
    expect(mockState.httpGet).toHaveBeenCalledTimes(1)
    expect(state.exitIp).toBe('198.51.100.8')
    expect(state.exitCountry).toBe('France')
    expect(state.exitCountryCode).toBe('FR')
    expect(state.lastVerifiedAt).toBe(123456)
    expect(state.lastHealthError).toBe('Network request failed')
  })
})

describe('runPeriodicTorHealthCheck', () => {
  it('does not restart a running daemon when the website probe fails', async () => {
    resetTorStore({ status: 'connected' })
    mockState.getServiceStatus.mockResolvedValue(1)
    mockState.httpGet.mockResolvedValue({
      error: 'Network request failed',
      body: '',
    })
    mockState.shutdownService.mockClear()

    await runPeriodicTorHealthCheck()
    await runPeriodicTorHealthCheck()

    expect(mockState.shutdownService).not.toHaveBeenCalled()
    expect(useTorStore.getState().status).toBe('connected')
  })

  it('reconnects after consecutive native-daemon failures', async () => {
    resetTorStore({ status: 'connected' })
    mockState.getServiceStatus.mockResolvedValue(2)
    mockState.shutdownService.mockClear()

    await runPeriodicTorHealthCheck()
    expect(mockState.shutdownService).not.toHaveBeenCalled()

    await runPeriodicTorHealthCheck()
    expect(mockState.shutdownService).toHaveBeenCalled()
  })
})
