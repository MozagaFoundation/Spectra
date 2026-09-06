/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicKeyBundle } from '@spectra/core-crypto'

const mocks = vi.hoisted(() => ({
  appStateRemove: vi.fn(),
  appStateHandler: null as null | ((state: string) => void),
  netInfoUnsubscribe: vi.fn(),
  bleEventHandler: null as ((event: unknown) => void) | null,
  directOptions: null as null | {
    onIncoming: (
      senderId: string,
      message: unknown,
      viaMesh: boolean,
    ) => Promise<void>
    onBundle: (senderId: string, bundle: PublicKeyBundle) => Promise<void>
    onCapability: (senderId: string, encoded: Uint8Array) => Promise<boolean>
    onDelivery: (event: {
      localMessageId: string
      state: string
      sequence: number
    }) => Promise<void> | void
  },
  onMessageReceived: vi.fn(async () => {}),
  onBundleReceived: vi.fn(async () => {}),
  bleDataHandler: null as null | ((deviceId: string, data: Uint8Array) => void),
  linkOptions: null as null | {
    onAuthenticated: (peer: {
      deviceId: string
      identityId: string
      knownContact: boolean
      role: 'initiator' | 'responder'
      linkGeneration?: number
    }) => void
    onSecureData: (
      deviceId: string,
      remoteIdentityId: string,
      data: Uint8Array,
    ) => Promise<void>
    onLinkFailure: (
      deviceId: string,
      stage: 'handshake' | 'authentication' | 'transport',
      cause: string,
    ) => void
  },
  initializeBLE: vi.fn(async (
    _config: unknown,
    _onData: (deviceId: string, data: Uint8Array) => void,
    _signal?: AbortSignal,
  ) => true),
  shutdownBLE: vi.fn(async () => {}),
  startScanning: vi.fn(async () => {}),
  stopScanning: vi.fn(async () => {}),
  startAdvertising: vi.fn(async () => true),
  stopAdvertising: vi.fn(async () => {}),
  evictPeer: vi.fn(async () => {}),
  disconnectPeer: vi.fn(async () => {}),
  connectToPeer: vi.fn(async () => true),
  shouldDialPeer: vi.fn(() => true),
  shouldConnectPeer: vi.fn(() => true),
  aliasedDeviceIds: vi.fn((deviceId: string) => [deviceId]),
  setScanDuty: vi.fn(),
  suspendDiscovery: vi.fn(async () => {}),
  resumeDiscovery: vi.fn(async () => {}),
  sendDataSequence: vi.fn(async () => true),
  announceLinkOffer: vi.fn(async () => {}),
  resolveLinkDeviceId: vi.fn((deviceId: string) => deviceId),
  directConfigure: vi.fn(),
  directSend: vi.fn(async () => ({ success: true, stored: false })),
  directSendCapability: vi.fn(async () => true),
  directSendBundle: vi.fn(async () => true),
  directProbe: vi.fn(async () => true),
  directReceive: vi.fn(async () => {}),
  directFlush: vi.fn(async () => {}),
  directReconcile: vi.fn(async () => {}),
  directReset: vi.fn(),
  directResetRadioSession: vi.fn(),
  runNoiseSelfTest: vi.fn(async () => true),
  rawPeers: [{
    deviceId: 'device-peer',
    connectionState: 'connected',
    rssi: -40,
    isPeripheral: true,
    isCentral: false,
  }],
  linkRoles: new Map<string, 'initiator' | 'responder'>(),
  authenticatedLinkIdentities: new Map<string, string>(),
  staleLinkDeviceIds: new Set<string>(),
  linkReceive: vi.fn(async () => {}),
  linkReset: vi.fn(),
  linkIsAuthenticated: vi.fn(() => true),
  linkStart: vi.fn(async () => true),
  linkRemove: vi.fn(),
  incomingCentral: false,
  unauthenticatedResponder: false,
  unauthenticatedHandshake: false,
  identityDestroy: vi.fn(),
  openCapabilityStore: vi.fn(),
  ensureInboundCapability: vi.fn(async () => ({
    capability: {
      version: 2,
      routeId: new Uint8Array(16).fill(1),
      routeEpoch: 1,
      senderBinding: new Uint8Array(32).fill(2),
      secret: new Uint8Array(32).fill(3),
      issuedAt: 1,
      expiresAt: Number.MAX_SAFE_INTEGER,
    },
    rotated: true,
  })),
  encodeForDelivery: vi.fn(() => 'capability'),
  acceptOutboundCapability: vi.fn(async () => true),
  removeRemoteCapability: vi.fn(async () => {}),
  capability: {
    version: 2,
    routeId: new Uint8Array(16).fill(1),
    routeEpoch: 1,
    senderBinding: new Uint8Array(32).fill(2),
    secret: new Uint8Array(32).fill(3),
    issuedAt: 1,
    expiresAt: Number.MAX_SAFE_INTEGER,
  },
}))

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: vi.fn((_event: string, handler: (state: string) => void) => {
      mocks.appStateHandler = handler
      return { remove: mocks.appStateRemove }
    }),
  },
}))

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    addEventListener: vi.fn(() => mocks.netInfoUnsubscribe),
  },
}))

vi.mock('../bleManager', () => ({
  initialize: mocks.initializeBLE,
  shutdown: mocks.shutdownBLE,
  startScanning: mocks.startScanning,
  stopScanning: mocks.stopScanning,
  startAdvertising: mocks.startAdvertising,
  stopAdvertising: mocks.stopAdvertising,
  evictPeer: mocks.evictPeer,
  disconnectPeer: mocks.disconnectPeer,
  connectToPeer: mocks.connectToPeer,
  setScanDuty: mocks.setScanDuty,
  suspendDiscovery: mocks.suspendDiscovery,
  resumeDiscovery: mocks.resumeDiscovery,
  sendDataSequence: mocks.sendDataSequence,
  announceLinkOffer: mocks.announceLinkOffer,
  resolveLinkDeviceId: mocks.resolveLinkDeviceId,
  getStatus: vi.fn(() => 'active'),
  getPeerFrameBudget: vi.fn(() => 182),
  getPeers: vi.fn(() => mocks.rawPeers),
  hasIncomingCentral: vi.fn(() => mocks.incomingCentral),
  shouldDialPeer: mocks.shouldDialPeer,
  shouldConnectPeer: mocks.shouldConnectPeer,
  aliasedDeviceIds: mocks.aliasedDeviceIds,
  addEventListener: vi.fn((handler) => {
    mocks.bleEventHandler = handler
    return vi.fn()
  }),
}))

vi.mock('../identity/bleIdentity', () => ({
  BLEIdentityContext: {
    create: vi.fn(async () => ({
      staticKeyPair: {
        publicKey: new Uint8Array(32),
        privateKey: new Uint8Array(32),
      },
      credentialPayload: new Uint8Array([2]),
      verifyCredentialPayload: vi.fn(),
      updateKnownIdentities: vi.fn(),
      destroy: mocks.identityDestroy,
    })),
  },
}))

vi.mock('../mesh/capabilityStore', () => ({
  BLECapabilityStore: {
    open: mocks.openCapabilityStore,
  },
}))

vi.mock('../link/linkManager', () => ({
  BleLinkManager: class {
    constructor(options: typeof mocks.linkOptions) {
      mocks.linkOptions = options
    }
    start = mocks.linkStart
    receive = mocks.linkReceive
    remove = mocks.linkRemove
    reset = mocks.linkReset
    cleanup = vi.fn()
    isAuthenticated = mocks.linkIsAuthenticated
    hasUnauthenticatedResponder = vi.fn(() => mocks.unauthenticatedResponder)
    hasUnauthenticatedHandshake = vi.fn(() => mocks.unauthenticatedHandshake)
    getRole = vi.fn((deviceId: string) => mocks.linkRoles.get(deviceId) ?? null)
    getDevicesForIdentity = vi.fn((identityId: string) =>
      [...mocks.authenticatedLinkIdentities]
        .filter(([, candidateIdentityId]) => candidateIdentityId === identityId)
        .map(([deviceId]) => deviceId))
    isCurrentAuthenticatedLink = vi.fn((peer: { deviceId: string }) =>
      !mocks.staleLinkDeviceIds.has(peer.deviceId))
  },
}))

vi.mock('../mesh/directTransport', () => ({
  BLEDirectTransport: class {
    constructor(options: typeof mocks.directOptions) {
      mocks.directOptions = options
    }
    configure = mocks.directConfigure
    send = mocks.directSend
    sendCapability = mocks.directSendCapability
    sendBundle = mocks.directSendBundle
    probe = mocks.directProbe
    receiveSecure = mocks.directReceive
    flushQueued = mocks.directFlush
    reconcileOutbound = mocks.directReconcile
    reset = mocks.directReset
    resetRadioSession = mocks.directResetRadioSession
    getStats = vi.fn(() => ({
      totalSent: 1,
      totalReceived: 2,
      totalRelayed: 3,
      totalDropped: 4,
      peerCount: 1,
    }))
  },
}))

vi.mock('../noiseSelfTest', () => ({
  runBLENoiseSelfTest: mocks.runNoiseSelfTest,
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
  addEventListener,
  ensureRouteCapability,
  getConfig,
  getNearbyContacts,
  getRoute,
  initialize,
  isBLEEnabled,
  isInitialized,
  runSecureBLEDiagnostics,
  setInternetAvailable,
  shutdown,
  updateConfig,
  updateKnownContacts,
} from '../transportManager'
import {
  getBLEDiagnosticSnapshot,
  recordBLEDiagnosticPeerFailure,
  recordBLEDiagnosticPeerStage,
  recordBLEDiagnosticStage,
  releaseBLEDiagnosticPeer,
} from '../diagnostics'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

function initializeTransport(
  enabled: boolean,
  bundle: PublicKeyBundle | null = null,
  onDeliveryEvent?: (event: any) => Promise<void> | void,
) {
  return initialize({
    walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    identityId: 'local',
    identityPrivateKey: 'private-key',
    bundle,
    knownIdentities: [{
      identityId: 'peer',
      displayName: 'Peer',
      bundle: { identityId: 'peer', version: 1 } as never,
    }],
    meshConfig: { enabled },
    onMessageReceived: mocks.onMessageReceived,
    onBundleReceived: mocks.onBundleReceived,
    onDeliveryEvent,
  })
}

function localBundle(): PublicKeyBundle {
  return {
    identityId: 'local',
    identityKey: 'identity-key',
    mlkemIdentityKey: 'mlkem-key',
    dilithiumKey: 'dilithium-key',
    signedPreKey: {
      id: 1,
      x25519PublicKey: 'signed-x25519',
      mlkemPublicKey: 'signed-mlkem',
      signature: 'signature',
      timestamp: 1,
    },
    oneTimePreKeys: [{
      id: 1,
      x25519PublicKey: 'one-time-x25519',
      mlkemPublicKey: 'one-time-mlkem',
    }],
    version: 1,
    timestamp: 1,
    bundleSignature: 'bundle-signature',
  }
}

describe('transportManager BLE v2 integration', () => {
  beforeEach(async () => {
    await shutdown()
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.linkOptions = null
    mocks.directOptions = null
    mocks.bleEventHandler = null
    mocks.bleDataHandler = null
    mocks.appStateHandler = null
    mocks.linkIsAuthenticated.mockReturnValue(true)
    mocks.rawPeers = [{
      deviceId: 'device-peer',
      connectionState: 'connected',
      rssi: -40,
      isPeripheral: true,
      isCentral: false,
    }]
    mocks.linkRoles.clear()
    mocks.authenticatedLinkIdentities.clear()
    mocks.staleLinkDeviceIds.clear()
    mocks.incomingCentral = false
    mocks.unauthenticatedResponder = false
    mocks.unauthenticatedHandshake = false
    mocks.linkStart.mockResolvedValue(true)
    mocks.shouldDialPeer.mockReturnValue(true)
    mocks.shouldConnectPeer.mockReturnValue(true)
    mocks.aliasedDeviceIds.mockImplementation((deviceId: string) => [deviceId])
    mocks.resolveLinkDeviceId.mockImplementation((deviceId: string) => deviceId)
    mocks.announceLinkOffer.mockResolvedValue(undefined)
    mocks.initializeBLE.mockImplementation(async (_config, onData) => {
      mocks.bleDataHandler = onData
      return true
    })
    mocks.openCapabilityStore.mockResolvedValue({
      ensureInboundCapability: mocks.ensureInboundCapability,
      encodeCapability: vi.fn(() => new Uint8Array([2])),
      encodeForDelivery: mocks.encodeForDelivery,
      acceptOutboundCapability: mocks.acceptOutboundCapability,
      removeRemote: mocks.removeRemoteCapability,
    })
    setInternetAvailable(true)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('keeps relay and store-forward disabled by default', async () => {
    await initializeTransport(false)

    expect(getConfig()).toMatchObject({
      enabled: false,
      relayEnabled: false,
      storeForwardEnabled: false,
    })
    expect(isInitialized()).toBe(true)
    expect(isBLEEnabled()).toBe(false)
    expect(mocks.initializeBLE).not.toHaveBeenCalled()
  })

  it('emits typed delivery updates through the transport callback boundary', async () => {
    const callback = vi.fn()
    const listener = vi.fn()
    await initializeTransport(false, null, callback)
    const unsubscribe = addEventListener(listener)
    const delivery = {
      localMessageId: 'local-message',
      state: 'stored',
      failureReason: null,
      attempts: 0,
      expiresAt: 2,
      updatedAt: 1,
      sequence: 2,
    } as const

    mocks.directOptions?.onDelivery(delivery)

    expect(callback).toHaveBeenCalledWith(delivery)
    expect(listener).toHaveBeenCalledWith({
      type: 'message:delivery',
      data: delivery,
      timestamp: 1,
    })
    unsubscribe()
  })

  it('destroys local link keys when capability storage initialization fails', async () => {
    mocks.openCapabilityStore.mockRejectedValueOnce(new Error('storage failed'))

    await expect(initializeTransport(false)).rejects.toThrow('storage failed')

    expect(mocks.identityDestroy).toHaveBeenCalledOnce()
    expect(isInitialized()).toBe(false)
  })

  it('runs the production-path self-test and safely restarts BLE', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(mocks.startAdvertising).toHaveBeenCalledTimes(1)
    const staleDataHandler = mocks.bleDataHandler

    await expect(runSecureBLEDiagnostics()).resolves.toBe(true)

    expect(mocks.runNoiseSelfTest).toHaveBeenCalledTimes(1)
    expect(mocks.shutdownBLE).toHaveBeenCalledTimes(1)
    expect(mocks.startAdvertising).toHaveBeenCalledTimes(2)
    expect(mocks.directResetRadioSession).toHaveBeenCalledTimes(1)
    expect(mocks.directReset).not.toHaveBeenCalled()
    staleDataHandler?.('device-peer', new Uint8Array([1]))
    expect(mocks.linkReceive).not.toHaveBeenCalled()

    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => expect(getNearbyContacts()).toEqual([
      expect.objectContaining({
        deviceId: 'device-peer',
        identityId: 'peer',
      }),
    ]))
  })

  it('ends a manual diagnostic when no other phone is discovered', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    await runSecureBLEDiagnostics()
    recordBLEDiagnosticStage('radio_active')

    await vi.advanceTimersByTimeAsync(45_001)

    expect(getBLEDiagnosticSnapshot()).toEqual(expect.objectContaining({
      running: false,
      lastFailure: 'peer_not_discovered',
    }))
  })

  it('preserves the last peer failure when the diagnostic deadline expires', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    await runSecureBLEDiagnostics()
    recordBLEDiagnosticStage('radio_active')
    recordBLEDiagnosticPeerStage('noise_secured', 'device-peer')
    recordBLEDiagnosticPeerFailure('credential_rejected', 'device-peer')
    releaseBLEDiagnosticPeer('device-peer')

    await vi.advanceTimersByTimeAsync(45_001)

    expect(getBLEDiagnosticSnapshot()).toEqual(expect.objectContaining({
      running: false,
      lastFailure: 'credential_rejected',
    }))
  })

  it('does not create internet capabilities while BLE is disabled', async () => {
    await initializeTransport(false)

    await expect(ensureRouteCapability('peer')).resolves.toBeNull()
    expect(mocks.ensureInboundCapability).not.toHaveBeenCalled()
  })

  it('returns the capability rotation state while BLE is enabled', async () => {
    mocks.ensureInboundCapability.mockResolvedValueOnce({
      capability: mocks.capability,
      rotated: false,
    })
    await initializeTransport(true)

    await expect(ensureRouteCapability('peer')).resolves.toEqual({
      capability: 'capability',
      rotated: false,
    })
    expect(mocks.encodeForDelivery).toHaveBeenCalledWith(mocks.capability)
  })

  it('drops an ensured capability after account reinitialization', async () => {
    await initializeTransport(true)
    const pendingCapability = createDeferred<{
      capability: typeof mocks.capability
      rotated: boolean
    }>()
    mocks.ensureInboundCapability.mockReturnValueOnce(pendingCapability.promise)
    const ensuring = ensureRouteCapability('peer')
    await vi.waitFor(() => {
      expect(mocks.ensureInboundCapability).toHaveBeenCalled()
    })

    await initializeTransport(false)
    pendingCapability.resolve({ capability: mocks.capability, rotated: true })

    await expect(ensuring).resolves.toBeNull()
    expect(mocks.encodeForDelivery).not.toHaveBeenCalled()
  })

  it('drops and purges a pending capability after trust revocation', async () => {
    await initializeTransport(true)
    const pendingCapability = createDeferred<{
      capability: typeof mocks.capability
      rotated: boolean
    }>()
    mocks.ensureInboundCapability.mockReturnValueOnce(pendingCapability.promise)
    const ensuring = ensureRouteCapability('peer')
    await vi.waitFor(() => {
      expect(mocks.ensureInboundCapability).toHaveBeenCalled()
    })

    updateKnownContacts([])
    pendingCapability.resolve({ capability: mocks.capability, rotated: true })

    await expect(ensuring).resolves.toBeNull()
    await vi.waitFor(() => {
      expect(mocks.removeRemoteCapability).toHaveBeenCalledWith('peer')
    })
    expect(mocks.encodeForDelivery).not.toHaveBeenCalled()
  })

  it('defers radio startup and starts only the v2 scan/advertise path', async () => {
    await initializeTransport(true)
    expect(mocks.initializeBLE).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(15_000)

    expect(mocks.initializeBLE).toHaveBeenCalledTimes(1)
    expect(mocks.startScanning).toHaveBeenCalled()
    expect(mocks.startAdvertising).toHaveBeenCalled()
  })

  it('does not resume a deferred radio start after shutdown', async () => {
    const initialization = createDeferred<boolean>()
    mocks.initializeBLE.mockReturnValueOnce(initialization.promise)
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(mocks.initializeBLE).toHaveBeenCalledTimes(1)

    await shutdown()
    initialization.resolve(true)
    await vi.waitFor(() => expect(mocks.startScanning).not.toHaveBeenCalled())

    expect(mocks.startAdvertising).not.toHaveBeenCalled()
  })

  it('interrupts an in-flight radio enable when disabled', async () => {
    const initialization = createDeferred<boolean>()
    let startupSignal: AbortSignal | undefined
    mocks.initializeBLE.mockImplementationOnce((...args: any[]) => {
      startupSignal = args[2]
      return initialization.promise
    })
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)

    updateConfig({ enabled: false })
    expect(startupSignal?.aborted).toBe(true)
    initialization.resolve(true)

    await vi.waitFor(() => expect(mocks.shutdownBLE).toHaveBeenCalled())
    expect(mocks.startScanning).not.toHaveBeenCalled()
    expect(mocks.startAdvertising).not.toHaveBeenCalled()
  })

  it('serializes rapid radio disable and enable transitions', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    const radioShutdown = createDeferred<void>()
    mocks.shutdownBLE.mockReturnValueOnce(radioShutdown.promise)

    updateConfig({ enabled: false })
    await vi.waitFor(() => expect(mocks.shutdownBLE).toHaveBeenCalledTimes(1))
    updateConfig({ enabled: true })
    radioShutdown.resolve()

    await vi.waitFor(() => expect(mocks.initializeBLE).toHaveBeenCalledTimes(2))
    expect(mocks.startScanning).toHaveBeenCalledTimes(2)
    expect(mocks.startAdvertising).toHaveBeenCalledTimes(2)
  })

  it('shows only contacts admitted by authenticated identity binding', async () => {
    await initializeTransport(true)

    mocks.linkOptions?.onAuthenticated({
      deviceId: 'unknown-device',
      identityId: 'unknown',
      knownContact: false,
      role: 'initiator',
    })
    await vi.waitFor(() => expect(getNearbyContacts()).toHaveLength(0))

    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => expect(getNearbyContacts()).toEqual([
      expect.objectContaining({
        deviceId: 'device-peer',
        identityId: 'peer',
        displayName: 'Peer',
      }),
    ]))
    expect(mocks.directSendCapability).toHaveBeenCalled()
  })

  it('evicts a native peer when its contact trust is revoked', async () => {
    await initializeTransport(true)
    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => expect(getNearbyContacts()).toHaveLength(1))

    updateKnownContacts([])

    await vi.waitFor(() => expect(mocks.evictPeer).toHaveBeenCalledWith('device-peer'))
    expect(getNearbyContacts()).toHaveLength(0)
  })

  it('evicts a revoked authenticated link before registry admission', async () => {
    await initializeTransport(true)
    mocks.authenticatedLinkIdentities.set('pending-device', 'peer')

    updateKnownContacts([])

    expect(mocks.linkRemove).toHaveBeenCalledWith('pending-device')
    await vi.waitFor(() => {
      expect(mocks.evictPeer).toHaveBeenCalledWith('pending-device')
    })
  })

  it('keeps the only authenticated radio role available', async () => {
    mocks.linkRoles.set('duplicate-device', 'responder')
    await initializeTransport(true)

    mocks.linkOptions?.onAuthenticated({
      deviceId: 'duplicate-device',
      identityId: 'peer',
      knownContact: true,
      role: 'responder',
    })

    await vi.waitFor(() => expect(getNearbyContacts()).toEqual([
      expect.objectContaining({
        deviceId: 'duplicate-device',
        identityId: 'peer',
      }),
    ]))
    expect(mocks.evictPeer).not.toHaveBeenCalledWith('duplicate-device')
    expect(mocks.directSendCapability).toHaveBeenCalledTimes(1)
  })

  it('keeps the first authenticated link when a reverse role also authenticates', async () => {
    mocks.linkRoles.set('responder-device', 'responder')
    mocks.linkRoles.set('initiator-device', 'initiator')
    await initializeTransport(true)

    mocks.linkOptions?.onAuthenticated({
      deviceId: 'responder-device',
      identityId: 'peer',
      knownContact: true,
      role: 'responder',
    })
    mocks.linkOptions?.onAuthenticated({
      deviceId: 'initiator-device',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })

    await vi.waitFor(() => expect(getNearbyContacts()).toEqual([
      expect.objectContaining({
        deviceId: 'responder-device',
        identityId: 'peer',
      }),
    ]))
    expect(mocks.evictPeer).toHaveBeenCalledWith('initiator-device')
    expect(mocks.evictPeer).not.toHaveBeenCalledWith('responder-device')
    expect(mocks.directSendCapability).toHaveBeenCalledTimes(1)
  })

  it('drops authenticated setup queued for a stale replacement link', async () => {
    const firstCapability = createDeferred<{
      capability: typeof mocks.capability
      rotated: boolean
    }>()
    mocks.ensureInboundCapability.mockImplementationOnce(
      () => firstCapability.promise,
    )
    mocks.linkRoles.set('responder-device', 'responder')
    mocks.linkRoles.set('initiator-device', 'initiator')
    await initializeTransport(true)

    mocks.linkOptions?.onAuthenticated({
      deviceId: 'responder-device',
      identityId: 'peer',
      knownContact: true,
      role: 'responder',
    })
    await vi.waitFor(() => {
      expect(mocks.ensureInboundCapability).toHaveBeenCalledTimes(1)
    })
    mocks.linkOptions?.onAuthenticated({
      deviceId: 'initiator-device',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    mocks.staleLinkDeviceIds.add('initiator-device')
    firstCapability.resolve({
      capability: mocks.capability,
      rotated: true,
    })

    await vi.waitFor(() => expect(getNearbyContacts()).toEqual([
      expect.objectContaining({ deviceId: 'responder-device' }),
    ]))
    expect(mocks.evictPeer).not.toHaveBeenCalledWith('responder-device')
    expect(mocks.evictPeer).not.toHaveBeenCalledWith('initiator-device')
    expect(mocks.directSendCapability).toHaveBeenCalledTimes(1)
    expect(mocks.removeRemoteCapability).not.toHaveBeenCalled()
  })

  it('evicts a failed secure link so discovery can reconnect it', async () => {
    await initializeTransport(false)

    mocks.linkOptions?.onLinkFailure('device-peer', 'authentication', 'credential_rejected')

    await vi.waitFor(() => {
      expect(mocks.evictPeer).toHaveBeenCalledWith('device-peer')
    })
    expect(mocks.linkRemove).toHaveBeenCalledWith('device-peer')
    expect(getNearbyContacts()).toHaveLength(0)
  })

  it('does not drop remote capabilities when mesh is disabled', async () => {
    await initializeTransport(true)
    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => expect(getNearbyContacts()).toHaveLength(1))
    await vi.waitFor(() => expect(mocks.directSendCapability).toHaveBeenCalled())
    mocks.removeRemoteCapability.mockClear()

    updateConfig({ enabled: false })
    await vi.waitFor(() => expect(mocks.shutdownBLE).toHaveBeenCalled())

    expect(mocks.removeRemoteCapability).not.toHaveBeenCalled()
  })

  it('retries capability delivery without evicting the authenticated link', async () => {
    mocks.directSendCapability
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    await initializeTransport(true)

    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => expect(getNearbyContacts()).toHaveLength(1))
    expect(mocks.evictPeer).not.toHaveBeenCalled()
    expect(mocks.directSendCapability).toHaveBeenCalledTimes(2)
  })

  it('keeps nearby after capability delivery is exhausted', async () => {
    mocks.directSendCapability
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
    await initializeTransport(true)

    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => expect(getNearbyContacts()).toHaveLength(1))
    expect(mocks.evictPeer).not.toHaveBeenCalled()
    expect(mocks.directSendCapability).toHaveBeenCalledTimes(2)
  })

  it('retires the link when capability setup throws', async () => {
    mocks.ensureInboundCapability.mockRejectedValueOnce(
      new Error('capability storage unavailable'),
    )
    await initializeTransport(true)

    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })

    await vi.waitFor(() => {
      expect(mocks.evictPeer).toHaveBeenCalledWith('device-peer')
    })
    expect(getNearbyContacts()).toHaveLength(0)
  })

  it('ignores authenticated setup that completes after account reinitialization', async () => {
    const capability = createDeferred<{
      capability: typeof mocks.capability
      rotated: boolean
    }>()
    mocks.ensureInboundCapability.mockReturnValueOnce(capability.promise)
    await initializeTransport(true)
    const oldLinkOptions = mocks.linkOptions

    oldLinkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => {
      expect(mocks.ensureInboundCapability).toHaveBeenCalledTimes(1)
    })

    await initializeTransport(false)
    capability.resolve({ capability: mocks.capability, rotated: true })
    await Promise.resolve()
    await Promise.resolve()

    expect(mocks.directSendCapability).not.toHaveBeenCalled()
    expect(mocks.evictPeer).not.toHaveBeenCalled()
    expect(getNearbyContacts()).toHaveLength(0)
  })

  it('drops inbound callbacks from a previous account generation', async () => {
    await initializeTransport(false)
    const oldDirectOptions = mocks.directOptions
    await initializeTransport(false)

    await oldDirectOptions?.onIncoming(
      'peer',
      { id: 'message' },
      false,
    )
    await oldDirectOptions?.onBundle('peer', localBundle())
    await expect(
      oldDirectOptions?.onCapability('peer', new Uint8Array([1])),
    ).resolves.toBe(false)

    expect(mocks.onMessageReceived).not.toHaveBeenCalled()
    expect(mocks.onBundleReceived).not.toHaveBeenCalled()
    expect(mocks.acceptOutboundCapability).not.toHaveBeenCalled()
  })

  it('marks the route ready only after accepting the peer capability', async () => {
    await initializeTransport(true)
    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => {
      expect(mocks.directSendCapability).toHaveBeenCalled()
    })
    expect(getBLEDiagnosticSnapshot().furthestStage).toBe('contact_admitted')

    await expect(
      mocks.directOptions?.onCapability('peer', new Uint8Array([1])),
    ).resolves.toBe(true)
    expect(getBLEDiagnosticSnapshot().furthestStage).toBe('route_ready')
  })

  it('keeps an authenticated peer when compact bundle refresh fails', async () => {
    mocks.directSendBundle.mockResolvedValueOnce(false)
    await initializeTransport(true, localBundle())

    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })

    await vi.waitFor(() => expect(mocks.directSendBundle).toHaveBeenCalled())
    expect(getNearbyContacts()).toHaveLength(1)
    expect(mocks.evictPeer).not.toHaveBeenCalled()
    expect(mocks.directFlush.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.directSendBundle.mock.invocationCallOrder[0],
    )
  })

  it('keeps an authenticated peer when queued delivery flush fails', async () => {
    mocks.directFlush.mockRejectedValueOnce(new Error('queue unavailable'))
    await initializeTransport(true)

    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })

    await vi.waitFor(() => expect(mocks.directFlush).toHaveBeenCalled())
    expect(getNearbyContacts()).toHaveLength(1)
    expect(mocks.evictPeer).not.toHaveBeenCalled()
  })

  it('keeps an authenticated contact nearby while secure liveness traffic continues', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)

    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => expect(getNearbyContacts()).toHaveLength(1))

    await vi.advanceTimersByTimeAsync(90_000)
    await mocks.linkOptions?.onSecureData(
      'device-peer',
      'peer',
      new Uint8Array([1]),
    )
    await vi.advanceTimersByTimeAsync(90_000)

    expect(getNearbyContacts()).toEqual([
      expect.objectContaining({
        deviceId: 'device-peer',
        identityId: 'peer',
      }),
    ])
    expect(mocks.directProbe).toHaveBeenCalled()
  })

  it('expires an authenticated connected contact without a liveness response', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)

    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => expect(getNearbyContacts()).toHaveLength(1))

    await vi.advanceTimersByTimeAsync(3 * 60_000)

    expect(getNearbyContacts()).toHaveLength(0)
    expect(mocks.directProbe).toHaveBeenCalled()
    expect(mocks.evictPeer).toHaveBeenCalledWith('device-peer')

    await mocks.linkOptions?.onSecureData(
      'device-peer',
      'peer',
      new Uint8Array([1]),
    )
    expect(getNearbyContacts()).toHaveLength(1)
  })

  it('clears secure transport state when native radio shutdown fails', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.shutdownBLE.mockRejectedValueOnce(new Error('native shutdown failed'))

    await expect(shutdown()).rejects.toThrow('native shutdown failed')

    expect(mocks.directReset).toHaveBeenCalled()
    expect(mocks.linkReset).toHaveBeenCalled()
    expect(mocks.identityDestroy).toHaveBeenCalled()
    expect(isInitialized()).toBe(false)
  })

  it('selects BLE fallback only after the radio starts', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    setInternetAvailable(false)

    expect(getRoute('peer')).toMatchObject({
      route: 'ble',
      bleAvailable: true,
      internetAvailable: false,
    })
  })

  it('hides nearby contacts whose authenticated link is gone', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => expect(getNearbyContacts()).toHaveLength(1))
    expect(getRoute('peer').peerNearby).toBe(true)

    mocks.linkIsAuthenticated.mockReturnValue(false)

    expect(getNearbyContacts()).toHaveLength(0)
    expect(getRoute('peer').peerNearby).toBe(false)
  })

  it('reconnects a disconnected GATT peer without waiting for rediscovery', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => expect(getNearbyContacts()).toHaveLength(1))
    mocks.rawPeers = [{
      deviceId: 'device-peer',
      connectionState: 'disconnected',
      rssi: -40,
      isPeripheral: true,
      isCentral: false,
    }]

    mocks.bleEventHandler?.({
      type: 'peer:disconnected',
      data: { peer: mocks.rawPeers[0] },
      timestamp: Date.now(),
    })

    expect(getNearbyContacts()).toHaveLength(1)
    expect(mocks.setScanDuty).toHaveBeenCalledWith(8_000, 2_000)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(mocks.connectToPeer).toHaveBeenCalledWith('device-peer')
  })

  it('retires a link after consecutive failed liveness probes', async () => {
    mocks.directProbe.mockResolvedValue(false)
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => expect(getNearbyContacts()).toHaveLength(1))

    await vi.advanceTimersByTimeAsync(60_000)
    expect(mocks.evictPeer).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(mocks.evictPeer).toHaveBeenCalledWith('device-peer')
    expect(getNearbyContacts()).toHaveLength(0)
  })

  it('reconnects after an authenticated transport failure without evicting the peer', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => expect(getNearbyContacts()).toHaveLength(1))

    mocks.linkOptions?.onLinkFailure('device-peer', 'transport', 'transport_failed')

    await vi.waitFor(() => {
      expect(mocks.disconnectPeer).toHaveBeenCalledWith('device-peer')
    })
    mocks.rawPeers = [{
      deviceId: 'device-peer',
      connectionState: 'disconnected',
      rssi: -40,
      isPeripheral: true,
      isCentral: false,
    }]
    expect(mocks.evictPeer).not.toHaveBeenCalledWith('device-peer')
    expect(getNearbyContacts()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(mocks.connectToPeer).toHaveBeenCalledWith('device-peer')
  })

  it('force-resumes discovery when returning to the foreground', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)

    mocks.appStateHandler?.('inactive')
    expect(mocks.suspendDiscovery).not.toHaveBeenCalled()

    mocks.appStateHandler?.('background')
    expect(mocks.suspendDiscovery).toHaveBeenCalled()

    mocks.appStateHandler?.('active')
    expect(mocks.resumeDiscovery).toHaveBeenCalled()
  })

  it('starts an outbound handshake even when an incoming central is already subscribed', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkIsAuthenticated.mockReturnValue(false)
    mocks.incomingCentral = true
    mocks.linkStart.mockClear()
    mocks.disconnectPeer.mockClear()

    mocks.bleEventHandler?.({
      type: 'peer:connected',
      data: {
        peer: {
          deviceId: 'reverse-device',
          isPeripheral: true,
        },
      },
      timestamp: Date.now(),
    })

    await vi.waitFor(() => {
      expect(mocks.announceLinkOffer).toHaveBeenCalledWith('reverse-device')
    })
    expect(mocks.linkStart).toHaveBeenCalledWith('reverse-device')
    expect(mocks.disconnectPeer).not.toHaveBeenCalled()
  })

  it('does not start Noise until the link offer write has finished', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkIsAuthenticated.mockReturnValue(false)
    mocks.linkStart.mockClear()
    let releaseOffer!: () => void
    mocks.announceLinkOffer.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseOffer = resolve
    }))

    mocks.bleEventHandler?.({
      type: 'peer:connected',
      data: {
        peer: {
          deviceId: 'reverse-device',
          isPeripheral: true,
        },
      },
      timestamp: Date.now(),
    })

    await vi.waitFor(() => {
      expect(releaseOffer).toEqual(expect.any(Function))
    })
    expect(mocks.linkStart).not.toHaveBeenCalled()
    releaseOffer()
    await vi.waitFor(() => {
      expect(mocks.linkStart).toHaveBeenCalledWith('reverse-device')
    })
  })

  it('starts Noise after an overlapping incoming offer announce finishes', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkIsAuthenticated.mockReturnValue(false)
    mocks.linkStart.mockClear()
    let releaseFirst!: () => void
    mocks.announceLinkOffer.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseFirst = resolve
    }))

    mocks.bleEventHandler?.({
      type: 'peer:connected',
      data: {
        peer: {
          deviceId: 'reverse-device',
          isPeripheral: false,
        },
      },
      timestamp: Date.now(),
    })
    await vi.waitFor(() => {
      expect(releaseFirst).toEqual(expect.any(Function))
    })
    mocks.bleEventHandler?.({
      type: 'peer:connected',
      data: {
        peer: {
          deviceId: 'reverse-device',
          isPeripheral: true,
        },
      },
      timestamp: Date.now(),
    })
    await Promise.resolve()
    expect(mocks.linkStart).not.toHaveBeenCalled()

    releaseFirst()
    await vi.waitFor(() => {
      expect(mocks.linkStart).toHaveBeenCalledWith('reverse-device')
    })
  })

  it('does not start a second initiator on a device that already has a handshake role', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkIsAuthenticated.mockReturnValue(false)
    mocks.linkRoles.set('reverse-device', 'responder')
    mocks.linkStart.mockClear()
    mocks.disconnectPeer.mockClear()

    mocks.bleEventHandler?.({
      type: 'peer:connected',
      data: {
        peer: {
          deviceId: 'reverse-device',
          isPeripheral: true,
        },
      },
      timestamp: Date.now(),
    })

    await vi.waitFor(() => {
      expect(mocks.announceLinkOffer).toHaveBeenCalledWith('reverse-device')
    })
    expect(mocks.linkStart).not.toHaveBeenCalled()
    expect(mocks.disconnectPeer).not.toHaveBeenCalled()
  })

  it('does not start an initiator before the remote link offer is known', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkIsAuthenticated.mockReturnValue(false)
    mocks.shouldDialPeer.mockReturnValue(false)
    mocks.linkStart.mockClear()

    mocks.bleEventHandler?.({
      type: 'peer:connected',
      data: {
        peer: {
          deviceId: 'reverse-device',
          isPeripheral: true,
        },
      },
      timestamp: Date.now(),
    })

    await vi.waitFor(() => {
      expect(mocks.announceLinkOffer).toHaveBeenCalledWith('reverse-device')
    })
    expect(mocks.linkStart).not.toHaveBeenCalled()
  })

  it('keeps an authenticated sibling radio when the other OS id fails handshake', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkIsAuthenticated.mockImplementation((deviceId: string) => deviceId === 'live-device')
    mocks.aliasedDeviceIds.mockReturnValue(['failed-device', 'live-device'])
    mocks.disconnectPeer.mockClear()
    mocks.evictPeer.mockClear()
    mocks.linkRemove.mockClear()

    mocks.linkOptions?.onLinkFailure('failed-device', 'handshake', 'handshake_noise_failed')

    await vi.waitFor(() => {
      expect(mocks.linkRemove).toHaveBeenCalledWith('failed-device')
    })
    expect(mocks.disconnectPeer).not.toHaveBeenCalled()
    expect(mocks.evictPeer).not.toHaveBeenCalled()
  })

  it('dials a newly discovered peer even if another incoming handshake is in flight', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkIsAuthenticated.mockReturnValue(false)
    mocks.incomingCentral = true
    mocks.unauthenticatedResponder = true
    mocks.rawPeers = [{
      deviceId: 'advertised-peer',
      connectionState: 'discovered',
      rssi: -40,
      isPeripheral: true,
      isCentral: false,
    }]
    mocks.connectToPeer.mockClear()
    mocks.linkStart.mockClear()

    mocks.bleEventHandler?.({
      type: 'peer:discovered',
      data: {
        peer: {
          deviceId: 'advertised-peer',
          isPeripheral: true,
        },
      },
      timestamp: Date.now(),
    })
    await vi.advanceTimersByTimeAsync(2_000)

    expect(mocks.connectToPeer).toHaveBeenCalledWith('advertised-peer')
  })

  it('reconnects a scannable peer after a handshake failure', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkIsAuthenticated.mockReturnValue(false)
    mocks.disconnectPeer.mockClear()
    mocks.evictPeer.mockClear()
    mocks.connectToPeer.mockClear()

    mocks.linkOptions?.onLinkFailure('device-peer', 'handshake', 'handshake_timeout')

    await vi.waitFor(() => {
      expect(mocks.disconnectPeer).toHaveBeenCalledWith('device-peer')
    })
    expect(mocks.evictPeer).not.toHaveBeenCalledWith('device-peer')
    mocks.rawPeers = [{
      deviceId: 'device-peer',
      connectionState: 'disconnected',
      rssi: -40,
      isPeripheral: true,
      isCentral: false,
    }]
    await vi.advanceTimersByTimeAsync(1_000)
    expect(mocks.connectToPeer).toHaveBeenCalledWith('device-peer')
  })

  it('auto-connects a discovered peripheral after an incoming handshake failure', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkIsAuthenticated.mockReturnValue(false)
    mocks.rawPeers = [
      {
        deviceId: 'incoming-central',
        connectionState: 'connected',
        rssi: -40,
        isPeripheral: false,
        isCentral: true,
      },
      {
        deviceId: 'advertised-peer',
        connectionState: 'discovered',
        rssi: -45,
        isPeripheral: true,
        isCentral: false,
      },
    ]
    mocks.connectToPeer.mockClear()
    mocks.evictPeer.mockClear()

    mocks.linkOptions?.onLinkFailure('incoming-central', 'handshake', 'handshake_timeout')

    await vi.waitFor(() => {
      expect(mocks.evictPeer).toHaveBeenCalledWith('incoming-central')
    })
    mocks.rawPeers = [{
      deviceId: 'advertised-peer',
      connectionState: 'discovered',
      rssi: -45,
      isPeripheral: true,
      isCentral: false,
    }]
    await vi.waitFor(() => {
      expect(mocks.connectToPeer).toHaveBeenCalledWith('advertised-peer')
    })
  })

  it('restarts discovery and auto-connects when internet drops', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkIsAuthenticated.mockReturnValue(false)
    mocks.rawPeers = [{
      deviceId: 'device-peer',
      connectionState: 'discovered',
      rssi: -40,
      isPeripheral: true,
      isCentral: false,
    }]
    mocks.resumeDiscovery.mockClear()
    mocks.startScanning.mockClear()
    mocks.connectToPeer.mockClear()

    setInternetAvailable(false)

    await vi.waitFor(() => {
      expect(mocks.resumeDiscovery).toHaveBeenCalled()
    })
    expect(mocks.startScanning).toHaveBeenCalledWith(undefined, { force: true })
    await vi.waitFor(() => {
      expect(mocks.connectToPeer).toHaveBeenCalledWith('device-peer')
    })
  })

  it('does not record a handshake failure while another nearby session is live', async () => {
    await initializeTransport(true)
    await vi.advanceTimersByTimeAsync(15_000)
    mocks.linkOptions?.onAuthenticated({
      deviceId: 'device-peer',
      identityId: 'peer',
      knownContact: true,
      role: 'initiator',
    })
    await vi.waitFor(() => expect(getNearbyContacts()).toHaveLength(1))
    recordBLEDiagnosticPeerStage('contact_admitted', 'device-peer')

    mocks.linkOptions?.onLinkFailure('reverse-device', 'handshake', 'handshake_timeout')

    await vi.waitFor(() => {
      expect(mocks.evictPeer).toHaveBeenCalledWith('reverse-device')
    })
    expect(getBLEDiagnosticSnapshot().lastFailure).not.toBe('noise_handshake_failed')
    expect(getNearbyContacts()).toHaveLength(1)
  })
})
