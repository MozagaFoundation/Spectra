/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  bleEnabled: false,
  contacts: [] as Array<{
    identityId: string
    displayName: string
    publicKeyBundle: unknown
    identityChanged?: boolean
    trustState?: string
  }>,
  contactSubscriber: null as null | ((state: {
    contacts: Array<{
      identityId: string
      displayName: string
      publicKeyBundle: unknown
      identityChanged?: boolean
      trustState?: string
    }>
  }) => void),
  ensureRouteCapability: vi.fn(async (_identityId: string): Promise<{
    capability: string
    rotated: boolean
  } | null> => null),
  initializeTransport: vi.fn(async () => true),
  shutdownTransport: vi.fn(async () => {}),
  updateKnownContacts: vi.fn(),
  sendControl: vi.fn(async () => true),
  contactUnsubscribe: vi.fn(),
  transportUnsubscribe: vi.fn(),
  nearbyUnsubscribe: vi.fn(),
  clearMessageDiagnostics: vi.fn(),
  resetBluetoothStore: vi.fn(),
  buildDirectEnvelope: vi.fn((
    _type: string,
    payload: { capability: string },
  ) => `capability:${payload.capability}`),
}))

vi.mock('../transportManager', () => ({
  initialize: mocks.initializeTransport,
  shutdown: mocks.shutdownTransport,
  addEventListener: vi.fn(() => mocks.transportUnsubscribe),
  onNearbyContactsChanged: vi.fn(() => mocks.nearbyUnsubscribe),
  ensureRouteCapability: mocks.ensureRouteCapability,
  updateKnownContacts: mocks.updateKnownContacts,
  isBLEEnabled: vi.fn(() => mocks.bleEnabled),
  getStatus: vi.fn(() => mocks.bleEnabled ? 'initializing' : 'disabled'),
  isInternetAvailable: vi.fn(() => true),
  getStats: vi.fn(() => ({
    totalSent: 0,
    totalReceived: 0,
    totalRelayed: 0,
    totalDropped: 0,
    peerCount: 0,
  })),
}))

vi.mock('@/store/bluetoothStore', () => ({
  useBluetoothStore: {
    getState: vi.fn(() => ({
      loadConfig: vi.fn(async () => ({
        enabled: mocks.bleEnabled,
        maxTTL: 5,
        scanDutyMs: 5_000,
        scanPauseMs: 10_000,
        storeForwardEnabled: false,
        storeForwardMaxMessages: 128,
        storeForwardTTLMs: 24 * 60 * 60 * 1_000,
        relayEnabled: false,
        maxConcurrentConnections: 6,
      })),
      setStatus: vi.fn(),
      setError: vi.fn(),
      setInternetAvailable: vi.fn(),
      setNearbyContacts: vi.fn(),
      setDiagnostics: vi.fn(),
      setMessageDiagnostics: vi.fn(),
      clearMessageDiagnostics: mocks.clearMessageDiagnostics,
      setStats: vi.fn(),
      setInitialized: vi.fn(),
      reset: mocks.resetBluetoothStore,
    })),
  },
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: {
    getState: vi.fn(() => ({ contacts: mocks.contacts })),
    subscribe: vi.fn((subscriber) => {
      mocks.contactSubscriber = subscriber
      return mocks.contactUnsubscribe
    }),
  },
}))

vi.mock('@/services/shared/envelopeTypes', () => ({
  buildDirectEnvelope: mocks.buildDirectEnvelope,
}))

vi.mock('../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

import {
  initializeBLEBridge,
  shutdownBLEBridge,
} from '../chatIntegration'

const bundle = {
  identityId: 'peer',
  version: 1,
} as never

function initializeBridge() {
  return initializeBLEBridge({
    walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    identityId: 'local',
    identityPrivateKey: 'private-key',
    displayName: 'Local',
    bundle: null,
    knownIdentities: [{
      identityId: 'peer',
      displayName: 'Peer',
      bundle,
    }],
    sendControl: mocks.sendControl,
    onReceiveMessage: vi.fn(async () => {}),
  })
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe('chatIntegration route capability delivery', () => {
  beforeEach(async () => {
    await shutdownBLEBridge()
    vi.clearAllMocks()
    mocks.bleEnabled = false
    mocks.contactSubscriber = null
    mocks.contacts = [{
      identityId: 'peer',
      displayName: 'Peer',
      publicKeyBundle: bundle,
      trustState: 'trusted',
    }]
    mocks.ensureRouteCapability.mockResolvedValue(null)
    mocks.sendControl.mockResolvedValue(true)
  })

  afterEach(async () => {
    await shutdownBLEBridge()
  })

  it('sends no internet capability when BLE is disabled', async () => {
    await initializeBridge()

    expect(mocks.ensureRouteCapability).not.toHaveBeenCalled()
    expect(mocks.sendControl).not.toHaveBeenCalled()
  })

  it('sends no internet capability when the existing capability is unchanged', async () => {
    mocks.bleEnabled = true
    mocks.ensureRouteCapability.mockResolvedValue({
      capability: 'unchanged',
      rotated: false,
    })

    await initializeBridge()

    expect(mocks.ensureRouteCapability).toHaveBeenCalledOnce()
    expect(mocks.sendControl).not.toHaveBeenCalled()
  })

  it('sends a newly created or rotated capability exactly once', async () => {
    mocks.bleEnabled = true
    mocks.ensureRouteCapability.mockResolvedValue({
      capability: 'rotated',
      rotated: true,
    })

    await initializeBridge()

    expect(mocks.sendControl).toHaveBeenCalledOnce()
    expect(mocks.sendControl).toHaveBeenCalledWith(
      'peer',
      'capability:rotated',
    )
  })

  it('does not resend an unchanged capability after a display-name change', async () => {
    mocks.bleEnabled = true
    mocks.ensureRouteCapability
      .mockResolvedValueOnce({
        capability: 'new',
        rotated: true,
      })
      .mockResolvedValue({
        capability: 'new',
        rotated: false,
      })
    await initializeBridge()

    mocks.contactSubscriber?.({
      contacts: [{
        identityId: 'peer',
        displayName: 'Renamed Peer',
        publicKeyBundle: bundle,
        trustState: 'trusted',
      }],
    })
    await flushAsyncWork()

    expect(mocks.updateKnownContacts).toHaveBeenCalledOnce()
    expect(mocks.ensureRouteCapability).toHaveBeenCalledTimes(2)
    expect(mocks.sendControl).toHaveBeenCalledOnce()
  })

  it('admits a contact when its public bundle hydrates after bridge startup', async () => {
    await initializeBridge()
    const hydratedBundle = {
      identityId: 'hydrated-peer',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      version: 1,
    }

    mocks.contactSubscriber?.({
      contacts: [{
        identityId: 'hydrated-peer',
        displayName: 'Hydrated Peer',
        publicKeyBundle: hydratedBundle,
        trustState: 'trusted',
      }],
    })

    expect(mocks.updateKnownContacts).toHaveBeenCalledWith([
      expect.objectContaining({
        identityId: 'hydrated-peer',
        bundle: hydratedBundle,
      }),
    ])
  })

  it('reconciles contact hydration while initial capabilities are being delivered', async () => {
    mocks.bleEnabled = true
    const capability = createDeferred<{
      capability: string
      rotated: boolean
    } | null>()
    mocks.ensureRouteCapability.mockReturnValueOnce(capability.promise)
    const initializing = initializeBridge()
    await vi.waitFor(() => expect(mocks.contactSubscriber).not.toBeNull())
    const hydratedBundle = {
      identityId: 'hydrated-peer',
      identityKey: 'identity-key',
      mlkemIdentityKey: 'mlkem-key',
      dilithiumKey: 'dilithium-key',
      version: 1,
    }

    mocks.contactSubscriber?.({
      contacts: [{
        identityId: 'hydrated-peer',
        displayName: 'Hydrated Peer',
        publicKeyBundle: hydratedBundle,
        trustState: 'trusted',
      }],
    })
    capability.resolve(null)
    await initializing

    expect(mocks.updateKnownContacts).toHaveBeenCalledWith([
      expect.objectContaining({
        identityId: 'hydrated-peer',
        bundle: hydratedBundle,
      }),
    ])
  })

  it('removes identity-changed contacts from BLE admission', async () => {
    await initializeBridge()

    mocks.contactSubscriber?.({
      contacts: [{
        identityId: 'peer',
        displayName: 'Peer',
        publicKeyBundle: bundle,
        identityChanged: true,
        trustState: 'changed',
      }],
    })

    expect(mocks.updateKnownContacts).toHaveBeenCalledWith([])
  })

  it('removes persisted changed contacts without an in-memory identity flag', async () => {
    await initializeBridge()

    mocks.contactSubscriber?.({
      contacts: [{
        identityId: 'peer',
        displayName: 'Peer',
        publicKeyBundle: bundle,
        trustState: 'changed',
      }],
    })

    expect(mocks.updateKnownContacts).toHaveBeenCalledWith([])
  })

  it('does not deliver a capability after the bridge generation shuts down', async () => {
    await initializeBridge()
    mocks.bleEnabled = true
    const pending = createDeferred<{
      capability: string
      rotated: boolean
    } | null>()
    mocks.ensureRouteCapability.mockReturnValueOnce(pending.promise)

    mocks.contactSubscriber?.({
      contacts: [{
        identityId: 'peer',
        displayName: 'Peer updated',
        publicKeyBundle: bundle,
        trustState: 'trusted',
      }],
    })
    await flushAsyncWork()
    expect(mocks.ensureRouteCapability).toHaveBeenCalled()

    const shutdown = shutdownBLEBridge()
    pending.resolve({ capability: 'stale-capability', rotated: true })
    await shutdown
    await flushAsyncWork()

    expect(mocks.clearMessageDiagnostics).toHaveBeenCalled()
    expect(mocks.sendControl).not.toHaveBeenCalled()
  })

  it('does not deliver a pending capability after contact trust is revoked', async () => {
    await initializeBridge()
    mocks.bleEnabled = true
    const pending = createDeferred<{
      capability: string
      rotated: boolean
    } | null>()
    mocks.ensureRouteCapability.mockReturnValueOnce(pending.promise)

    mocks.contactSubscriber?.({
      contacts: [{
        identityId: 'peer',
        displayName: 'Peer updated',
        publicKeyBundle: bundle,
        trustState: 'trusted',
      }],
    })
    await flushAsyncWork()
    mocks.contactSubscriber?.({ contacts: [] })
    pending.resolve({ capability: 'revoked-capability', rotated: true })
    await flushAsyncWork()

    expect(mocks.sendControl).not.toHaveBeenCalled()
  })
})
