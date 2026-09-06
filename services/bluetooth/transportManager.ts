/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/** Coordinates the authenticated BLE v2 link and opaque mesh transport. */

import { AppState, type AppStateStatus } from 'react-native'
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import type { EncryptedMessage, PublicKeyBundle } from '@spectra/core-crypto'
import {
  type BLEMeshConfig,
  type BLEMeshEvent,
  type BLEMeshEventCallback,
  type BLEMeshStatus,
  type BLEOutboundDeliveryEvent,
  type TransportDecision,
  type TransportRoute,
  DEFAULT_BLE_MESH_CONFIG,
  MAX_TTL,
  BLE_IDLE_SCAN_DUTY_MS,
} from './types'
import * as bleManager from './bleManager'
import {
  BLEIdentityContext,
  type BLEKnownIdentity,
} from './identity/bleIdentity'
import { BleLinkManager, type BleLinkFailureCause } from './link/linkManager'
import { BLECapabilityStore } from './mesh/capabilityStore'
import { BLEDirectTransport } from './mesh/directTransport'
import {
  BLEPeerRegistry,
  type BLEKnownContact,
  type NearbyContact,
} from './peerRegistry'
import { createLogger } from './logger'
import {
  activateBLEDiagnosticTransport,
  beginBLEDiagnostics,
  clearBLEDiagnosticFailure,
  clearBLEDiagnostics,
  finalizeBLEDiagnosticPeerFailure,
  finalizeBLEDiagnostics,
  getBLEDiagnosticSnapshot,
  hasReachedBLEDiagnosticStage,
  recordBLEDiagnosticFailure,
  recordBLEDiagnosticPeerFailure,
  recordBLEDiagnosticPeerHandshakeProgress,
  recordBLEDiagnosticPeerStage,
  recordBLEDiagnosticStage,
  releaseBLEDiagnosticPeer,
  setBLEDiagnosticEligibleContacts,
  setBLENoiseSelfTestStatus,
  type BLEDiagnosticFailure,
  type BLEDiagnosticFailureCause,
} from './diagnostics'
import { runBLENoiseSelfTest } from './noiseSelfTest'

const log = createLogger('TransportMgr')
const BLE_STARTUP_DEFER_MS = 1_000
const CONNECT_INTERVAL_MS = 10_000
const CLEANUP_INTERVAL_MS = 60_000
const DIAGNOSTIC_TIMEOUT_MS = 45_000
const RECONNECT_BACKOFF_MS = [1_000, 3_000, 8_000]
const RECONNECT_SCAN_DUTY_MS = 8_000
const RECONNECT_SCAN_PAUSE_MS = 2_000
const CONNECT_JITTER_MAX_MS = 1_500
const MAX_PROBE_FAILURES = 2

export interface BLETransportKnownIdentity extends BLEKnownIdentity {
  displayName: string | null
}

export interface BLEEnsuredRouteCapability {
  capability: string
  rotated: boolean
}

interface AuthenticatedLinkPeer {
  deviceId: string
  identityId: string
  knownContact: boolean
  role: 'initiator' | 'responder'
  linkGeneration: number
}

let initialized = false
let bleStarted = false
let bleStartTimer: ReturnType<typeof setTimeout> | null = null
let bleStartPromise: Promise<boolean> | null = null
let bleStartController: AbortController | null = null
let bleStartGeneration = 0
let bleConfigTransition: Promise<void> = Promise.resolve()
let config: BLEMeshConfig = { ...DEFAULT_BLE_MESH_CONFIG }
let localIdentityId = ''
let localBundle: PublicKeyBundle | null = null
let knownIdentities: BLETransportKnownIdentity[] = []
let internetAvailable = true
let cleanupTimer: ReturnType<typeof setInterval> | null = null
let connectTimer: ReturnType<typeof setInterval> | null = null
let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null
let netInfoUnsubscribe: (() => void) | null = null
let connectInFlight = false
let diagnosticRunPromise: Promise<boolean> | null = null
let diagnosticTimer: ReturnType<typeof setTimeout> | null = null
let runtimeGeneration = 0

let identityContext: BLEIdentityContext | null = null
let capabilityStore: BLECapabilityStore | null = null
let linkManager: BleLinkManager | null = null
let directTransport: BLEDirectTransport | null = null
const peerRegistry = new BLEPeerRegistry()

const internalUnsubscribers: Array<() => void> = []
const eventListeners = new Set<BLEMeshEventCallback>()
const nearbyListeners = new Set<(contacts: NearbyContact[]) => void>()
const authenticatedSetupQueues = new Map<string, Promise<void>>()
const reconnectAttempts = new Map<string, {
  attempts: number
  timer: ReturnType<typeof setTimeout> | null
}>()
const probeFailures = new Map<string, number>()
const reconnectingIdentities = new Map<string, string>()
const suppressReconnect = new Set<string>()
const outboundDialLocks = new Map<string, Promise<void>>()
let connectJitterTimer: ReturnType<typeof setTimeout> | null = null
const connectReadyAt = new Map<string, number>()

function normalizeConfig(updates?: Partial<BLEMeshConfig>): BLEMeshConfig {
  const merged = { ...DEFAULT_BLE_MESH_CONFIG, ...updates }
  return {
    ...merged,
    maxTTL: Math.max(1, Math.min(MAX_TTL, Math.floor(merged.maxTTL))),
    maxConcurrentConnections: Math.max(
      1,
      Math.min(8, Math.floor(merged.maxConcurrentConnections)),
    ),
    storeForwardMaxMessages: Math.max(
      1,
      Math.min(500, Math.floor(merged.storeForwardMaxMessages)),
    ),
    storeForwardTTLMs: Math.max(
      1_000,
      Math.min(24 * 60 * 60 * 1000, Math.floor(merged.storeForwardTTLMs)),
    ),
    relayEnabled: merged.relayEnabled === true,
    storeForwardEnabled: merged.storeForwardEnabled === true,
  }
}

function emit(event: BLEMeshEvent): void {
  for (const listener of eventListeners) {
    try {
      listener(event)
    } catch (error) {
      log.error('Event listener error', error)
    }
  }
}

function diagnosticFailureFromLink(
  stage: 'handshake' | 'authentication' | 'transport',
  cause: BleLinkFailureCause,
): BLEDiagnosticFailure {
  if (cause === 'credential_rejected' || stage === 'authentication') {
    return 'credential_rejected'
  }
  if (
    stage === 'transport'
    || cause === 'transport_send_failed'
    || cause === 'transport_failed'
  ) {
    return 'transport_failed'
  }
  return 'noise_handshake_failed'
}

function diagnosticCauseFromLink(
  cause: BleLinkFailureCause,
): BLEDiagnosticFailureCause {
  if (cause === 'credential_rejected') return 'credential_verify_failed'
  if (cause === 'transport_failed') return 'transport_decrypt_failed'
  return cause
}

function listLiveNearby(): NearbyContact[] {
  const live = peerRegistry.listNearby().filter((contact) => (
    linkManager?.isAuthenticated(contact.deviceId) === true
  ))
  const seen = new Set(live.map((contact) => contact.identityId))
  for (const [identityId, deviceId] of reconnectingIdentities) {
    if (seen.has(identityId) || !isIdentityAuthorized(identityId)) continue
    const peer = bleManager.getPeers().find((candidate) => candidate.deviceId === deviceId)
    if (!peer) continue
    const known = knownIdentities.find((contact) => contact.identityId === identityId)
    if (!known) continue
    live.push({
      identityId,
      displayName: known.displayName,
      rssi: peer.rssi,
      lastSeenAt: peer.lastSeenAt,
      deviceId,
    })
    seen.add(identityId)
  }
  return live
}

function notifyNearby(): void {
  const nearby = listLiveNearby()
  for (const listener of nearbyListeners) {
    try {
      listener(nearby)
    } catch (error) {
      log.error('Nearby listener error', error)
    }
  }
}

function radioSnapshot(): Record<string, unknown> {
  return {
    incoming: bleManager.hasIncomingCentral(),
    nearby: listLiveNearby().length,
    responderBusy: linkManager?.hasUnauthenticatedResponder() === true,
    handshakeBusy: linkManager?.hasUnauthenticatedHandshake() === true,
    reconnecting: reconnectAttempts.size,
    peers: bleManager.getPeers().map((peer) => ({
      id: peer.deviceId.slice(0, 8),
      state: peer.connectionState,
      out: peer.isPeripheral,
      inn: peer.isCentral,
      rssi: peer.rssi,
    })),
  }
}

function isIdentityAuthorized(identityId: string): boolean {
  return initialized
    && config.enabled
    && knownIdentities.some((known) => known.identityId === identityId)
}

export function addEventListener(callback: BLEMeshEventCallback): () => void {
  eventListeners.add(callback)
  return () => eventListeners.delete(callback)
}

export async function initialize(options: {
  walletScope: string
  identityId: string
  identityPrivateKey: string
  displayName?: string
  bundle: PublicKeyBundle | null
  knownIdentities: BLETransportKnownIdentity[]
  meshConfig?: Partial<BLEMeshConfig>
  onMessageReceived: (
    senderId: string,
    message: EncryptedMessage,
    route: TransportRoute,
  ) => Promise<void> | void
  onBundleReceived: (
    fromIdentityId: string,
    bundle: PublicKeyBundle,
  ) => Promise<void>
  onDeliveryEvent?: (
    event: BLEOutboundDeliveryEvent,
  ) => Promise<void> | void
}): Promise<boolean> {
  if (initialized) await shutdown()
  runtimeGeneration += 1
  const initializationGeneration = runtimeGeneration

  const nextConfig = normalizeConfig(options.meshConfig)
  const nextKnownIdentities = [...options.knownIdentities]
  const initializedMessageReceivedCallback = options.onMessageReceived
  const initializedBundleReceivedCallback = options.onBundleReceived
  const initializedDeliveryCallback = options.onDeliveryEvent
  const initializedIdentityContext = await BLEIdentityContext.create({
    walletScope: options.walletScope,
    identityId: options.identityId,
    identityPrivateKey: options.identityPrivateKey,
    knownIdentities: nextKnownIdentities,
  })
  if (initializationGeneration !== runtimeGeneration) {
    initializedIdentityContext.destroy()
    return false
  }
  let initializedCapabilityStore: BLECapabilityStore
  try {
    initializedCapabilityStore = await BLECapabilityStore.open({
      walletScope: options.walletScope,
      localIdentityId: options.identityId,
    })
  } catch (error) {
    initializedIdentityContext.destroy()
    throw error
  }
  if (initializationGeneration !== runtimeGeneration) {
    initializedIdentityContext.destroy()
    return false
  }

  config = nextConfig
  localIdentityId = options.identityId
  localBundle = options.bundle
  knownIdentities = nextKnownIdentities
  peerRegistry.setKnownContacts(asKnownContacts(knownIdentities))
  identityContext = initializedIdentityContext
  capabilityStore = initializedCapabilityStore
  if (config.enabled) {
    beginBLEDiagnostics(knownIdentities.length)
    activateBLEDiagnosticTransport()
  }
  let initializedLinkManager: BleLinkManager | null = null
  let initializedDirectTransport: BLEDirectTransport | null = null

  linkManager = new BleLinkManager({
    staticKeyPair: initializedIdentityContext.staticKeyPair,
    credential: initializedIdentityContext.credentialPayload,
    verifyCredential: async (deviceId, credential, remoteStaticKey) => {
      if (initializationGeneration !== runtimeGeneration) return null
      const verified = await initializedIdentityContext.verifyCredentialPayload(
        credential,
        remoteStaticKey,
      )
      if (initializationGeneration !== runtimeGeneration) return null
      if (!verified || !isIdentityAuthorized(verified.identityId)) {
        recordBLEDiagnosticPeerFailure(
          'credential_rejected',
          deviceId,
          Date.now(),
          'credential_verify_failed',
        )
        return null
      }
      return verified
    },
    sendRaw: (deviceId, frames) => bleManager.sendDataSequence(
      deviceId,
      frames,
      undefined,
      {
        pipe: linkManager?.getRole(deviceId) === 'responder' ? 'incoming' : 'outgoing',
        teardownOnTimeout: false,
      },
    ),
    onSecureData: async (deviceId, remoteIdentityId, data) => {
      if (initializationGeneration !== runtimeGeneration) return
      if (!isIdentityAuthorized(remoteIdentityId)) {
        finalizeBLEDiagnosticPeerFailure('contact_not_admitted', deviceId, {
          stage: 'identity_authenticated',
          handshakeProgress: 'credential_authenticated',
        })
        releaseBLEDiagnosticPeer(deviceId, true)
        await retireFailedLink(deviceId, initializationGeneration)
        return
      }
      const rawPeer = bleManager.getPeers().find((peer) => peer.deviceId === deviceId)
      const registeredIdentityId = peerRegistry.getIdentity(deviceId)
      if (registeredIdentityId && registeredIdentityId !== remoteIdentityId) {
        finalizeBLEDiagnosticPeerFailure('contact_not_admitted', deviceId, {
          stage: 'identity_authenticated',
          handshakeProgress: 'credential_authenticated',
        })
        releaseBLEDiagnosticPeer(deviceId, true)
        await retireFailedLink(deviceId, initializationGeneration)
        return
      }
      let restoredPeer = false
      if (
        !registeredIdentityId
        && !peerRegistry.authenticated({
          deviceId,
          identityId: remoteIdentityId,
          knownContact: true,
          rssi: rawPeer?.rssi,
        })
      ) {
        finalizeBLEDiagnosticPeerFailure('contact_not_admitted', deviceId, {
          stage: 'identity_authenticated',
          handshakeProgress: 'credential_authenticated',
        })
        releaseBLEDiagnosticPeer(deviceId, true)
        await retireFailedLink(deviceId, initializationGeneration)
        return
      }
      if (!registeredIdentityId) restoredPeer = true
      peerRegistry.seen(deviceId, rawPeer?.rssi)
      probeFailures.delete(deviceId)
      if (restoredPeer) notifyNearby()
      await initializedDirectTransport?.receiveSecure(deviceId, remoteIdentityId, data)
    },
    onAuthenticated: (peer) => {
      enqueueAuthenticatedSetup(peer, initializationGeneration)
    },
    onLinkStage: (deviceId, stage) => {
      if (initializationGeneration !== runtimeGeneration) return
      if (stage === 'handshaking') {
        recordBLEDiagnosticPeerStage('noise_handshaking', deviceId)
      } else if (stage === 'secure') {
        recordBLEDiagnosticPeerStage('noise_secured', deviceId)
      } else {
        recordBLEDiagnosticPeerStage('identity_authenticated', deviceId)
      }
    },
    onHandshakeProgress: (deviceId, progress) => {
      if (initializationGeneration !== runtimeGeneration) return
      recordBLEDiagnosticPeerHandshakeProgress(progress, deviceId)
    },
    onLinkFailure: (deviceId, stage, cause) => {
      if (initializationGeneration !== runtimeGeneration) return
      log.warn(`BLE link failed during ${stage}`, {
        device: deviceId.slice(0, 8),
        cause,
        ...radioSnapshot(),
      })
      recordBLEDiagnosticPeerFailure(
        diagnosticFailureFromLink(stage, cause),
        deviceId,
        Date.now(),
        diagnosticCauseFromLink(cause),
      )
      releaseBLEDiagnosticPeer(deviceId, true)
      if (stage === 'transport') {
        void dropAuthenticatedTransport(deviceId, initializationGeneration)
        return
      }
      if (stage === 'handshake') {
        void recoverFailedHandshake(deviceId, initializationGeneration)
        return
      }
      void retireFailedLink(deviceId, initializationGeneration)
    },
    onAbortCompetingInitiators: (deviceIds) => {
      if (initializationGeneration !== runtimeGeneration) return
      for (const deviceId of deviceIds) {
        deferOutboundHandshake(deviceId, 'incoming_handshake_won')
      }
    },
    maxFrameBytes: (deviceId) => bleManager.getPeerFrameBudget(deviceId),
  })
  initializedLinkManager = linkManager

  directTransport = new BLEDirectTransport({
    linkManager,
    peerRegistry,
    capabilityStore: initializedCapabilityStore,
    onIncoming: async (senderId, message, viaMesh) => {
      if (initializationGeneration !== runtimeGeneration) return
      await initializedMessageReceivedCallback(
        senderId,
        message,
        viaMesh ? 'ble' : 'ble-nearby',
      )
    },
    onBundle: async (senderId, bundle) => {
      if (initializationGeneration !== runtimeGeneration) return
      await initializedBundleReceivedCallback(senderId, bundle)
    },
    onCapability: async (senderId, encoded) => {
      if (
        initializationGeneration !== runtimeGeneration
        || !isIdentityAuthorized(senderId)
      ) return false
      const accepted = await initializedCapabilityStore.acceptOutboundCapability(
        senderId,
        encoded,
        Date.now(),
        { fromAuthenticatedLink: true },
      )
      if (
        initializationGeneration !== runtimeGeneration
        || !isIdentityAuthorized(senderId)
      ) {
        await initializedCapabilityStore.removeRemote(senderId)
        return false
      }
      if (accepted) {
        const deviceId = peerRegistry.getDevice(senderId)
        if (deviceId) {
          recordBLEDiagnosticPeerStage('route_ready', deviceId)
          if (
            hasReachedBLEDiagnosticStage(
              getBLEDiagnosticSnapshot(),
              'route_ready',
            )
          ) clearDiagnosticTimer()
        }
      }
      return accepted
    },
    onDelivery: async (delivery) => {
      if (initializationGeneration !== runtimeGeneration) return
      emit({
        type: 'message:delivery',
        data: delivery,
        timestamp: delivery.updatedAt,
      })
      if (!initializedDeliveryCallback) return
      try {
        await initializedDeliveryCallback(delivery)
      } catch {
        log.warn('BLE delivery callback failed')
      }
    },
  })
  initializedDirectTransport = directTransport
  configureTransport()
  resetInternalSubscriptions()
  internalUnsubscribers.push(bleManager.addEventListener(handleBLEEvent))

  appStateSubscription = AppState.addEventListener('change', handleAppStateChange)
  netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    setInternetAvailable(!!(state.isConnected && state.isInternetReachable !== false))
  })
  initialized = true
  try {
    await initializedDirectTransport.reconcileOutbound()
  } catch (error) {
    log.warn('BLE outbound reconciliation failed', error)
  }
  if (initializationGeneration !== runtimeGeneration) return false

  if (config.enabled) scheduleDeferredBLEStart('initialization')
  log.info('Authenticated BLE v2 transport initialized', {
    enabled: config.enabled,
    relay: config.relayEnabled,
    storeForward: config.storeForwardEnabled,
  })
  return true
}

export async function sendViaBLE(
  recipientIdentityId: string,
  encryptedMessage: EncryptedMessage,
): Promise<{ success: boolean; stored: boolean; error?: string }> {
  if (!initialized || !config.enabled || !directTransport) {
    return { success: false, stored: false, error: 'BLE mesh not enabled' }
  }
  if (!(await ensureBLEStarted('send'))) {
    return { success: false, stored: false, error: 'BLE mesh not available' }
  }
  return directTransport.send(recipientIdentityId, encryptedMessage)
}

export async function ensureRouteCapability(
  remoteIdentityId: string,
): Promise<BLEEnsuredRouteCapability | null> {
  const generation = runtimeGeneration
  const activeCapabilityStore = capabilityStore
  if (!initialized || !config.enabled || !activeCapabilityStore || !knownIdentities.some(
    (known) => known.identityId === remoteIdentityId,
  )) {
    return null
  }
  const { capability, rotated } = await activeCapabilityStore
    .ensureInboundCapability(remoteIdentityId)
  if (
    generation !== runtimeGeneration
    || activeCapabilityStore !== capabilityStore
    || !isIdentityAuthorized(remoteIdentityId)
  ) {
    if (
      generation === runtimeGeneration
      && activeCapabilityStore === capabilityStore
      && !isIdentityAuthorized(remoteIdentityId)
    ) await activeCapabilityStore.removeRemote(remoteIdentityId)
    return null
  }
  return {
    capability: activeCapabilityStore.encodeForDelivery(capability),
    rotated,
  }
}

export async function acceptRouteCapability(
  remoteIdentityId: string,
  base64Capability: string,
): Promise<boolean> {
  const generation = runtimeGeneration
  const activeCapabilityStore = capabilityStore
  if (
    !activeCapabilityStore
    || !knownIdentities.some((known) => known.identityId === remoteIdentityId)
  ) {
    return false
  }
  try {
    const binary = atob(base64Capability)
    const encoded = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      encoded[index] = binary.charCodeAt(index)
    }
    const accepted = await activeCapabilityStore.acceptOutboundCapability(
      remoteIdentityId,
      encoded,
    )
    if (
      generation !== runtimeGeneration
      || activeCapabilityStore !== capabilityStore
    ) return false
    if (!isIdentityAuthorized(remoteIdentityId)) {
      await activeCapabilityStore.removeRemote(remoteIdentityId)
      return false
    }
    return accepted
  } catch {
    return false
  }
}

export function getRoute(recipientIdentityId: string): TransportDecision {
  const bleAvailable = initialized && config.enabled && bleStarted
  const deviceId = peerRegistry.getDevice(recipientIdentityId)
  const peerNearby = bleAvailable
    && deviceId !== null
    && linkManager?.isAuthenticated(deviceId) === true
  if (!bleAvailable) {
    return {
      route: 'internet',
      reason: 'BLE mesh disabled',
      bleAvailable: false,
      internetAvailable,
      peerNearby: false,
    }
  }
  if (!internetAvailable) {
    return {
      route: 'ble',
      reason: peerNearby
        ? 'No internet — authenticated contact is nearby'
        : 'No internet — BLE mesh fallback',
      bleAvailable: true,
      internetAvailable: false,
      peerNearby,
    }
  }
  return {
    route: 'internet',
    reason: peerNearby
      ? 'Internet available (authenticated contact is nearby)'
      : 'Internet available',
    bleAvailable: true,
    internetAvailable: true,
    peerNearby,
  }
}

export function isContactNearby(identityId: string): boolean {
  if (!initialized || !config.enabled) return false
  return listLiveNearby().some((contact) => contact.identityId === identityId)
}

export function setInternetAvailable(available: boolean): void {
  if (internetAvailable === available) return
  internetAvailable = available
  emit({
    type: 'internet:changed',
    data: { available },
    timestamp: Date.now(),
  })
  if (!available) void reestablishNearbyAfterOffline()
}

export function isInternetAvailable(): boolean {
  return internetAvailable
}

export function updateConfig(updates: Partial<BLEMeshConfig>): void {
  const previousEnabled = config.enabled
  config = normalizeConfig({ ...config, ...updates })
  configureTransport()
  if (!initialized) return
  if (previousEnabled === config.enabled) return
  if (config.enabled) {
    beginBLEDiagnostics(knownIdentities.length)
    activateBLEDiagnosticTransport()
  }
  if (!config.enabled) {
    clearDiagnosticTimer()
    bleStartGeneration += 1
    bleStartController?.abort()
    clearDeferredBLEStart()
  }
  bleConfigTransition = bleConfigTransition
    .then(async () => {
      if (!initialized) return
      if (config.enabled) {
        await ensureBLEStarted('config_enabled')
      } else {
        await stopBLE()
      }
    })
    .catch((error) => {
      log.warn('BLE config transition failed', error)
    })
}

export function getConfig(): BLEMeshConfig {
  return { ...config }
}

export function getStatus(): BLEMeshStatus {
  if (!initialized || !config.enabled) return 'disabled'
  if (!bleStarted) return 'initializing'
  return bleManager.getStatus()
}

export function getStats(): {
  totalSent: number
  totalReceived: number
  totalRelayed: number
  totalDropped: number
  peerCount: number
  nearbyContacts: number
  bleStatus: BLEMeshStatus
  internetAvailable: boolean
  config: Pick<BLEMeshConfig, 'enabled' | 'relayEnabled' | 'storeForwardEnabled'>
} {
  const stats = directTransport?.getStats() ?? {
    totalSent: 0,
    totalReceived: 0,
    totalRelayed: 0,
    totalDropped: 0,
    peerCount: 0,
  }
  return {
    ...stats,
    nearbyContacts: listLiveNearby().length,
    bleStatus: bleManager.getStatus(),
    internetAvailable,
    config: {
      enabled: config.enabled,
      relayEnabled: config.relayEnabled,
      storeForwardEnabled: config.storeForwardEnabled,
    },
  }
}

export function updateKnownContacts(contacts: BLETransportKnownIdentity[]): void {
  const retained = new Set(contacts.map((contact) => contact.identityId))
  const revokedIdentityIds = knownIdentities
    .map((contact) => contact.identityId)
    .filter((identityId) => !retained.has(identityId))
  const revokedDeviceIds = new Set(peerRegistry.listNearby()
    .filter((nearby) => !retained.has(nearby.identityId))
    .map((nearby) => nearby.deviceId))
  for (const identityId of revokedIdentityIds) {
    for (const deviceId of linkManager?.getDevicesForIdentity(identityId) ?? []) {
      revokedDeviceIds.add(deviceId)
    }
  }
  for (const deviceId of revokedDeviceIds) {
    linkManager?.remove(deviceId)
  }
  knownIdentities = [...contacts]
  setBLEDiagnosticEligibleContacts(contacts.length)
  peerRegistry.setKnownContacts(asKnownContacts(contacts))
  identityContext?.updateKnownIdentities(contacts)
  const activeCapabilityStore = capabilityStore
  if (activeCapabilityStore) {
    for (const identityId of revokedIdentityIds) {
      void activeCapabilityStore.removeRemote(identityId).catch((error) => {
        log.warn('Failed to remove revoked BLE capability', error)
      })
    }
  }
  for (const deviceId of revokedDeviceIds) {
    forgetReconnect(deviceId)
    probeFailures.delete(deviceId)
    void bleManager.evictPeer(deviceId)
  }
  notifyNearby()
}

export function onNearbyContactsChanged(
  callback: (contacts: NearbyContact[]) => void,
): () => void {
  nearbyListeners.add(callback)
  callback(listLiveNearby())
  return () => nearbyListeners.delete(callback)
}

export function getNearbyContacts(): NearbyContact[] {
  return listLiveNearby()
}

export async function shutdown(): Promise<void> {
  runtimeGeneration += 1
  clearDiagnosticTimer()
  if (appStateSubscription) {
    appStateSubscription.remove()
    appStateSubscription = null
  }
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe()
    netInfoUnsubscribe = null
  }
  stopTimers()
  clearConnectJitter()
  bleStartGeneration += 1
  bleStartController?.abort()
  bleStartController = null
  clearDeferredBLEStart()
  bleStarted = false
  resetInternalSubscriptions()
  const retiringDirectTransport = directTransport
  const retiringLinkManager = linkManager
  const retiringIdentityContext = identityContext
  peerRegistry.reset()
  directTransport = null
  linkManager = null
  capabilityStore = null
  identityContext = null
  localIdentityId = ''
  localBundle = null
  knownIdentities = []
  initialized = false
  connectInFlight = false
  authenticatedSetupQueues.clear()
  eventListeners.clear()
  nearbyListeners.clear()
  suppressReconnect.clear()
  outboundDialLocks.clear()
  clearAllReconnects()
  probeFailures.clear()

  let shutdownError: unknown = null
  try {
    retiringDirectTransport?.reset()
  } catch (error) {
    shutdownError = error
  }
  try {
    retiringLinkManager?.reset()
  } catch (error) {
    shutdownError ??= error
  }
  try {
    retiringIdentityContext?.destroy()
  } catch (error) {
    shutdownError ??= error
  }
  try {
    await bleManager.shutdown()
  } catch (error) {
    shutdownError ??= error
  }
  clearBLEDiagnostics()
  diagnosticRunPromise = null
  bleStartPromise = null
  if (shutdownError) throw shutdownError
}

export function isInitialized(): boolean {
  return initialized
}

export function isBLEEnabled(): boolean {
  return initialized && config.enabled
}

export function runSecureBLEDiagnostics(): Promise<boolean> {
  if (diagnosticRunPromise) return diagnosticRunPromise

  const operation = (async (): Promise<boolean> => {
    if (!initialized || !config.enabled) return false
    const initialGeneration = bleStartGeneration
    const diagnostic = beginBLEDiagnostics(knownIdentities.length)
    clearDiagnosticTimer()
    startDiagnosticTimer(diagnostic.runId)
    setBLENoiseSelfTestStatus('running')
    const noisePassed = await runBLENoiseSelfTest()
    if (
      initialGeneration !== bleStartGeneration
      || !initialized
      || !config.enabled
    ) return false
    const currentDiagnostic = getBLEDiagnosticSnapshot()
    if (
      currentDiagnostic.runId !== diagnostic.runId
      || !currentDiagnostic.running
    ) return false
    setBLENoiseSelfTestStatus(noisePassed ? 'passed' : 'failed')

    try {
      await stopBLE()
      if (!initialized || !config.enabled) return false
      const afterStop = getBLEDiagnosticSnapshot()
      if (afterStop.runId !== diagnostic.runId || !afterStop.running) return false
      activateBLEDiagnosticTransport()
      recordBLEDiagnosticStage('radio_starting')
      const started = await ensureBLEStarted('diagnostic')
      return started
    } catch (error) {
      log.warn('Secure BLE diagnostic restart failed', error)
      const current = getBLEDiagnosticSnapshot()
      if (current.runId !== diagnostic.runId || !current.running) return false
      activateBLEDiagnosticTransport()
      recordBLEDiagnosticFailure('transport_failed')
      return false
    }
  })()
  diagnosticRunPromise = operation
  void operation.finally(() => {
    if (diagnosticRunPromise === operation) diagnosticRunPromise = null
  })
  return operation
}

async function handleAuthenticated(
  peer: AuthenticatedLinkPeer,
  generation: number,
): Promise<void> {
  if (generation !== runtimeGeneration) return
  if (!isIdentityAuthorized(peer.identityId)) {
    finalizeBLEDiagnosticPeerFailure('contact_not_admitted', peer.deviceId, {
      stage: 'identity_authenticated',
      handshakeProgress: 'credential_authenticated',
    })
    releaseBLEDiagnosticPeer(peer.deviceId, true)
    await retireFailedLink(peer.deviceId, generation)
    return
  }
  const activeLinkManager = linkManager
  const activeCapabilityStore = capabilityStore
  const activeDirectTransport = directTransport
  if (!activeLinkManager || !activeCapabilityStore || !activeDirectTransport) return
  if (!activeLinkManager.isCurrentAuthenticatedLink(peer)) return
  const rawPeer = bleManager.getPeers().find(
    (candidate) => candidate.deviceId === peer.deviceId,
  )
  const existingDeviceId = peerRegistry.getDevice(peer.identityId)
  if (existingDeviceId && existingDeviceId !== peer.deviceId) {
    if (activeLinkManager.isAuthenticated(existingDeviceId)) {
      releaseBLEDiagnosticPeer(peer.deviceId)
      await retireFailedLink(peer.deviceId, generation)
      return
    }
    peerRegistry.disconnected(existingDeviceId)
  }
  if (!peerRegistry.authenticated({
    ...peer,
    rssi: rawPeer?.rssi,
  })) {
    log.warn('Rejected authenticated BLE peer without a known contact binding')
    finalizeBLEDiagnosticPeerFailure('contact_not_admitted', peer.deviceId, {
      stage: 'identity_authenticated',
      handshakeProgress: 'credential_authenticated',
    })
    releaseBLEDiagnosticPeer(peer.deviceId, true)
    await retireFailedLink(peer.deviceId, generation)
    return
  }
  log.info('Authenticated known BLE contact')
  recordBLEDiagnosticPeerStage('contact_admitted', peer.deviceId)
  clearBLEDiagnosticFailure()
  reconnectingIdentities.delete(peer.identityId)
  forgetReconnect(peer.deviceId)
  probeFailures.delete(peer.deviceId)
  refreshScanDuty()
  const nearby = peerRegistry.listNearby().find(
    (candidate) => candidate.deviceId === peer.deviceId,
  )
  if (nearby) {
    emit({ type: 'peer:connected', data: { peer: nearby }, timestamp: Date.now() })
  }
  notifyNearby()

  const inbound = await activeCapabilityStore.ensureInboundCapability(peer.identityId)
  if (generation !== runtimeGeneration) return
  if (!isIdentityAuthorized(peer.identityId)) {
    await activeCapabilityStore.removeRemote(peer.identityId)
    return
  }
  if (
    activeCapabilityStore !== capabilityStore
    || !activeLinkManager.isCurrentAuthenticatedLink(peer)
  ) return
  if (inbound) {
    const encoded = activeCapabilityStore.encodeCapability(inbound.capability)
    let sent = await activeDirectTransport.sendCapability(peer.deviceId, encoded)
    if (
      !sent
      && generation === runtimeGeneration
      && isIdentityAuthorized(peer.identityId)
      && activeLinkManager.isCurrentAuthenticatedLink(peer)
    ) {
      sent = await activeDirectTransport.sendCapability(peer.deviceId, encoded)
    }
    if (generation !== runtimeGeneration) return
    if (!isIdentityAuthorized(peer.identityId)) {
      await activeCapabilityStore.removeRemote(peer.identityId)
      return
    }
    if (
      activeCapabilityStore !== capabilityStore
      || !activeLinkManager.isCurrentAuthenticatedLink(peer)
    ) return
    if (!sent) {
      recordBLEDiagnosticPeerFailure('capability_failed', peer.deviceId)
      log.warn('Authenticated BLE capability delivery deferred')
    }
  }
  try {
    await activeDirectTransport.flushQueued()
  } catch (error) {
    log.warn('Authenticated BLE queue flush failed', error)
  }
  if (
    generation !== runtimeGeneration
    || !isIdentityAuthorized(peer.identityId)
    || !activeLinkManager.isCurrentAuthenticatedLink(peer)
  ) return
  refreshPeerBundle(peer.deviceId)
}

function enqueueAuthenticatedSetup(
  peer: AuthenticatedLinkPeer,
  generation: number,
): void {
  const previous = authenticatedSetupQueues.get(peer.identityId) ?? Promise.resolve()
  const operation = previous
    .catch(() => {})
    .then(() => handleAuthenticated(peer, generation))
    .catch(async (error) => {
      log.warn('Authenticated BLE peer setup failed', error)
      if (!linkManager?.isCurrentAuthenticatedLink(peer)) return
      try {
        await retireFailedLink(peer.deviceId, generation)
      } catch (retireError) {
        log.warn('Failed to retire authenticated BLE peer', retireError)
      }
    })
  authenticatedSetupQueues.set(peer.identityId, operation)
  void operation.then(() => {
    if (authenticatedSetupQueues.get(peer.identityId) === operation) {
      authenticatedSetupQueues.delete(peer.identityId)
    }
  })
}

function refreshPeerBundle(deviceId: string): void {
  const transport = directTransport
  const bundle = localBundle
  if (!transport || !bundle) return
  void transport.sendBundle(deviceId, bundle)
    .then((sent) => {
      if (!sent) log.warn('Compact BLE bundle refresh failed')
    })
    .catch((error) => {
      log.warn('Compact BLE bundle refresh failed', error)
    })
}

async function recoverFailedHandshake(
  deviceId: string,
  generation = runtimeGeneration,
): Promise<void> {
  if (generation !== runtimeGeneration || !initialized) return
  const siblingIds = bleManager.aliasedDeviceIds(deviceId)
  if (siblingIds.some((id) => id !== deviceId && linkManager?.isAuthenticated(id))) {
    log.warn(`Keeping authenticated sibling after handshake fail on ${deviceId.slice(0, 8)}...`)
    linkManager?.remove(deviceId)
    return
  }
  const peer = bleManager.getPeers().find((candidate) => candidate.deviceId === deviceId)
  log.warn(`Recovering failed handshake for ${deviceId.slice(0, 8)}...`, {
    scannable: peer?.isPeripheral === true,
    state: peer?.connectionState,
    ...radioSnapshot(),
  })
  clearReconnectIdentity(deviceId)
  probeFailures.delete(deviceId)
  linkManager?.remove(deviceId)
  peerRegistry.disconnected(deviceId)
  notifyNearby()
  if (peer?.isPeripheral) {
    rememberReconnect(deviceId)
    refreshScanDuty()
    await bleManager.disconnectPeer(deviceId)
    return
  }
  forgetReconnect(deviceId)
  refreshScanDuty()
  await bleManager.evictPeer(deviceId)
  for (const candidate of bleManager.getPeers()) {
    if (
      candidate.deviceId === deviceId
      || !candidate.isPeripheral
      || (
        candidate.connectionState !== 'discovered'
        && candidate.connectionState !== 'disconnected'
      )
    ) continue
    rememberReconnect(candidate.deviceId)
  }
  void autoConnect()
}

function deferOutboundHandshake(deviceId: string, reason: string): void {
  log.warn(`Deferring outbound handshake for ${deviceId.slice(0, 8)}... (${reason})`, radioSnapshot())
  forgetReconnect(deviceId)
  connectReadyAt.delete(deviceId)
  suppressReconnect.add(deviceId)
}

function outboundHandshakeDeferReason(deviceId: string): string | null {
  if (linkManager?.getRole(deviceId) != null) return 'handshake_in_flight'
  return null
}

async function announceThenMaybeDial(
  deviceId: string,
  isPeripheral: boolean,
  generation: number,
): Promise<void> {
  const lockId = bleManager.resolveLinkDeviceId(deviceId)
  const previous = outboundDialLocks.get(lockId) ?? Promise.resolve()
  const run = previous
    .catch(() => {})
    .then(() => announceThenMaybeDialLocked(deviceId, isPeripheral, generation))
  const settled = run.then(() => undefined, () => undefined)
  outboundDialLocks.set(lockId, settled)
  try {
    await run
  } finally {
    if (outboundDialLocks.get(lockId) === settled) {
      outboundDialLocks.delete(lockId)
    }
  }
}

async function announceThenMaybeDialLocked(
  deviceId: string,
  isPeripheral: boolean,
  generation: number,
): Promise<void> {
  await bleManager.announceLinkOffer(deviceId)
  if (generation !== runtimeGeneration || !initialized || !bleStarted) return
  if (!isPeripheral) return
  const dialId = bleManager.resolveLinkDeviceId(deviceId)
  if (
    linkManager?.isAuthenticated(dialId) === true
    || linkManager?.isAuthenticated(deviceId) === true
  ) return
  if (linkManager?.getRole(dialId) === 'responder'
    || linkManager?.getRole(deviceId) === 'responder') return
  const deferReason = outboundHandshakeDeferReason(dialId)
    ?? outboundHandshakeDeferReason(deviceId)
  if (deferReason) {
    deferOutboundHandshake(deviceId, deferReason)
    return
  }
  if (
    !bleManager.shouldDialPeer(dialId)
    && !bleManager.shouldDialPeer(deviceId)
  ) return
  const startId = bleManager.shouldDialPeer(dialId) ? dialId : deviceId
  log.info(`Starting outbound handshake on ${startId.slice(0, 8)}...`, radioSnapshot())
  await linkManager?.start(startId).catch(() => retireFailedLink(startId, generation))
}

async function retireFailedLink(
  deviceId: string,
  generation = runtimeGeneration,
): Promise<void> {
  if (generation !== runtimeGeneration || !initialized) return
  clearReconnectIdentity(deviceId)
  forgetReconnect(deviceId)
  probeFailures.delete(deviceId)
  linkManager?.remove(deviceId)
  peerRegistry.disconnected(deviceId)
  notifyNearby()
  refreshScanDuty()
  await bleManager.evictPeer(deviceId)
}

async function dropAuthenticatedTransport(
  deviceId: string,
  generation = runtimeGeneration,
): Promise<void> {
  if (generation !== runtimeGeneration || !initialized) return
  noteReconnectIdentity(deviceId)
  probeFailures.delete(deviceId)
  linkManager?.remove(deviceId)
  peerRegistry.disconnected(deviceId)
  rememberReconnect(deviceId)
  notifyNearby()
  refreshScanDuty()
  await bleManager.disconnectPeer(deviceId)
}

function handleBLEEvent(event: BLEMeshEvent): void {
  if (event.type === 'mesh:status_changed' || event.type === 'mesh:error') {
    emit(event)
    return
  }
  if (
    event.type !== 'peer:discovered'
    && event.type !== 'peer:connected'
    && event.type !== 'peer:disconnected'
    && event.type !== 'peer:lost'
  ) {
    return
  }
  const peer = (event.data as { peer?: { deviceId: string; isPeripheral?: boolean } }).peer
  if (!peer) return
  if (event.type === 'peer:discovered') {
    log.info(`Discovered ${peer.deviceId.slice(0, 8)}...`, radioSnapshot())
    void autoConnect()
  } else if (event.type === 'peer:connected') {
    void announceThenMaybeDial(
      peer.deviceId,
      peer.isPeripheral === true,
      runtimeGeneration,
    )
  } else if (event.type === 'peer:disconnected') {
    log.warn(`Peer disconnected ${peer.deviceId.slice(0, 8)}...`, {
      out: peer.isPeripheral === true,
      ...radioSnapshot(),
    })
    releaseBLEDiagnosticPeer(peer.deviceId)
    noteReconnectIdentity(peer.deviceId)
    linkManager?.remove(peer.deviceId)
    peerRegistry.disconnected(peer.deviceId)
    probeFailures.delete(peer.deviceId)
    notifyNearby()
    if (suppressReconnect.delete(peer.deviceId)) forgetReconnect(peer.deviceId)
    else rememberReconnect(peer.deviceId)
    void autoConnect()
  } else if (event.type === 'peer:lost') {
    releaseBLEDiagnosticPeer(peer.deviceId)
    clearReconnectIdentity(peer.deviceId)
    linkManager?.remove(peer.deviceId)
    peerRegistry.disconnected(peer.deviceId)
    probeFailures.delete(peer.deviceId)
    forgetReconnect(peer.deviceId)
    notifyNearby()
  }
}

async function autoConnect(): Promise<void> {
  if (!initialized || !bleStarted || connectInFlight) return
  connectInFlight = true
  try {
    const peers = bleManager.getPeers()
    for (const peer of peers) {
      if (
        !peer.isPeripheral
        || peer.connectionState !== 'connected'
        || !bleManager.shouldDialPeer(peer.deviceId)
        || linkManager?.isAuthenticated(peer.deviceId) === true
        || linkManager?.getRole(peer.deviceId) != null
        || outboundHandshakeDeferReason(peer.deviceId) != null
      ) continue
      await announceThenMaybeDial(peer.deviceId, true, runtimeGeneration)
      if (!initialized || !bleStarted) return
    }
    const connected = peers.filter((peer) => peer.connectionState === 'connected').length
    const available = Math.max(0, config.maxConcurrentConnections - connected)
    const reconnecting = new Set(reconnectAttempts.keys())
    const now = Date.now()
    let soonestWait = Number.POSITIVE_INFINITY
    const ready: typeof peers = []
    for (const peer of peers) {
      if (!peer.isPeripheral) continue
      if (!bleManager.shouldConnectPeer(peer.deviceId)) continue
      const isReconnect = reconnecting.has(peer.deviceId)
      if (isReconnect) {
        if (
          peer.connectionState !== 'discovered'
          && peer.connectionState !== 'disconnected'
        ) continue
      } else if (peer.connectionState !== 'discovered') {
        continue
      }
      if (!isReconnect) {
        const readyAt = connectReadyAt.get(peer.deviceId) ?? now + outboundConnectDelayMs()
        connectReadyAt.set(peer.deviceId, readyAt)
        if (now < readyAt) {
          soonestWait = Math.min(soonestWait, readyAt - now)
          continue
        }
        connectReadyAt.delete(peer.deviceId)
      }
      ready.push(peer)
    }
    ready.sort((left, right) => right.rssi - left.rssi)
    if (Number.isFinite(soonestWait) && !connectJitterTimer) {
      connectJitterTimer = setTimeout(() => {
        connectJitterTimer = null
        void autoConnect()
      }, soonestWait)
    }
    for (const peer of ready.slice(0, available)) {
      log.info(`Auto-connect ${peer.deviceId.slice(0, 8)}... rssi=${peer.rssi}`, {
        reconnect: reconnecting.has(peer.deviceId),
      })
      await bleManager.connectToPeer(peer.deviceId)
    }
  } finally {
    connectInFlight = false
  }
}

function outboundConnectDelayMs(): number {
  let hash = 2166136261
  for (let index = 0; index < localIdentityId.length; index += 1) {
    hash ^= localIdentityId.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % (CONNECT_JITTER_MAX_MS + 1)
}

function clearConnectJitter(): void {
  if (connectJitterTimer) clearTimeout(connectJitterTimer)
  connectJitterTimer = null
  connectReadyAt.clear()
}

async function reestablishNearbyAfterOffline(): Promise<void> {
  if (!initialized || !config.enabled) return
  log.warn('Internet dropped — re-establishing Nearby', radioSnapshot())
  if (!bleStarted) {
    await ensureBLEStarted('internet_offline')
    return
  }
  void bleManager.resumeDiscovery()
  if (listLiveNearby().length > 0) return
  refreshScanDuty(true)
  for (const peer of bleManager.getPeers()) {
    if (
      !peer.isPeripheral
      || (
        peer.connectionState !== 'discovered'
        && peer.connectionState !== 'disconnected'
      )
    ) continue
    rememberReconnect(peer.deviceId)
  }
  void autoConnect()
}

function configureTransport(): void {
  directTransport?.configure({
    relayEnabled: config.relayEnabled,
    storeForwardEnabled: config.storeForwardEnabled,
    maxHops: config.maxTTL,
    storeForwardMaxMessages: config.storeForwardMaxMessages,
    storeForwardTTLMs: config.storeForwardTTLMs,
  })
}

function resetInternalSubscriptions(): void {
  for (const unsubscribe of internalUnsubscribers) unsubscribe()
  internalUnsubscribers.length = 0
}

function startTimers(): void {
  if (!cleanupTimer) {
    cleanupTimer = setInterval(() => {
      linkManager?.cleanup()
      peerRegistry.cleanup()
      for (const deviceId of peerRegistry.drainExpiredDeviceIds()) {
        linkManager?.remove(deviceId)
        void bleManager.evictPeer(deviceId)
      }
      for (const peer of bleManager.getPeers()) {
        if (
          peer.connectionState === 'connected'
          && linkManager?.isAuthenticated(peer.deviceId)
          && peerRegistry.getIdentity(peer.deviceId)
        ) {
          void probeAuthenticatedPeer(peer.deviceId)
        }
      }
      notifyNearby()
      void directTransport?.flushQueued()
    }, CLEANUP_INTERVAL_MS)
  }
  if (!connectTimer) {
    connectTimer = setInterval(() => {
      void autoConnect()
    }, CONNECT_INTERVAL_MS)
  }
}

function stopTimers(): void {
  if (cleanupTimer) clearInterval(cleanupTimer)
  if (connectTimer) clearInterval(connectTimer)
  cleanupTimer = null
  connectTimer = null
}

function forgetReconnect(deviceId: string): void {
  const entry = reconnectAttempts.get(deviceId)
  if (entry?.timer) clearTimeout(entry.timer)
  reconnectAttempts.delete(deviceId)
  refreshScanDuty()
}

function clearReconnectIdentity(deviceId: string): void {
  for (const [identityId, id] of reconnectingIdentities) {
    if (id === deviceId) reconnectingIdentities.delete(identityId)
  }
}

function noteReconnectIdentity(deviceId: string): void {
  const identityId = peerRegistry.getIdentity(deviceId)
    ?? linkManager?.getAuthenticatedIdentity(deviceId)?.identityId
    ?? [...reconnectingIdentities.entries()].find((entry) => entry[1] === deviceId)?.[0]
    ?? null
  if (identityId && isIdentityAuthorized(identityId)) {
    reconnectingIdentities.set(identityId, deviceId)
  }
}

function clearAllReconnects(): void {
  for (const entry of reconnectAttempts.values()) {
    if (entry.timer) clearTimeout(entry.timer)
  }
  reconnectAttempts.clear()
  reconnectingIdentities.clear()
}

function rememberReconnect(deviceId: string): void {
  if (!initialized || !config.enabled || !bleStarted) return
  if (!bleManager.getPeers().some((peer) => peer.deviceId === deviceId)) return
  const existing = reconnectAttempts.get(deviceId)
  if (existing?.timer) return
  const attempts = existing?.attempts ?? 0
  const delay = RECONNECT_BACKOFF_MS[
    Math.min(attempts, RECONNECT_BACKOFF_MS.length - 1)
  ]
  const timer = setTimeout(() => {
    const current = reconnectAttempts.get(deviceId)
    if (current) current.timer = null
    void attemptReconnect(deviceId)
  }, delay)
  reconnectAttempts.set(deviceId, { attempts, timer })
  refreshScanDuty(true)
}

async function attemptReconnect(deviceId: string): Promise<void> {
  if (!initialized || !config.enabled || !bleStarted) return
  const entry = reconnectAttempts.get(deviceId)
  if (!entry) return
  const peer = bleManager.getPeers().find((candidate) => candidate.deviceId === deviceId)
  if (!peer) {
    clearReconnectIdentity(deviceId)
    forgetReconnect(deviceId)
    notifyNearby()
    return
  }
  if (peer.connectionState === 'connected' || peer.connectionState === 'connecting') {
    return
  }
  entry.attempts += 1
  const connected = await bleManager.connectToPeer(deviceId)
  if (!connected) rememberReconnect(deviceId)
}

function refreshScanDuty(restartScan = false): void {
  if (!initialized || !config.enabled) return
  const live = listLiveNearby().length > 0
  const reconnecting = reconnectAttempts.size > 0
  if (!live) {
    bleManager.setScanDuty(BLE_IDLE_SCAN_DUTY_MS, 0)
  } else if (reconnecting) {
    bleManager.setScanDuty(RECONNECT_SCAN_DUTY_MS, RECONNECT_SCAN_PAUSE_MS)
  } else {
    bleManager.setScanDuty(config.scanDutyMs, config.scanPauseMs)
  }
  if (restartScan && bleStarted) {
    void bleManager.startScanning(undefined, { force: true })
  }
}

async function probeAuthenticatedPeer(deviceId: string): Promise<void> {
  const ok = await directTransport?.probe(deviceId)
  if (!initialized || !config.enabled) return
  if (ok !== false) {
    probeFailures.delete(deviceId)
    return
  }
  const failures = (probeFailures.get(deviceId) ?? 0) + 1
  if (failures < MAX_PROBE_FAILURES) {
    probeFailures.set(deviceId, failures)
    return
  }
  probeFailures.delete(deviceId)
  await retireFailedLink(deviceId)
}

function handleAppStateChange(state: AppStateStatus): void {
  if (!config.enabled || !initialized) return
  if (state === 'active') {
    if (!bleStarted) {
      scheduleDeferredBLEStart('foreground')
      return
    }
    void bleManager.resumeDiscovery()
    return
  }
  if ((state === 'background') && bleStarted) {
    void bleManager.suspendDiscovery()
  }
}

function clearDiagnosticTimer(): void {
  if (diagnosticTimer) clearTimeout(diagnosticTimer)
  diagnosticTimer = null
}

function startDiagnosticTimer(runId: number): void {
  clearDiagnosticTimer()
  diagnosticTimer = setTimeout(() => {
    diagnosticTimer = null
    const diagnostic = getBLEDiagnosticSnapshot()
    if (diagnostic.runId !== runId || !diagnostic.running) return
    if (diagnostic.noiseSelfTest === 'running') {
      setBLENoiseSelfTestStatus('failed')
      finalizeBLEDiagnostics('noise_self_test_failed')
      return
    }
    if (diagnostic.lastFailure) {
      finalizeBLEDiagnostics(diagnostic.lastFailure)
      return
    }
    if (!hasReachedBLEDiagnosticStage(diagnostic, 'radio_active')) {
      finalizeBLEDiagnostics('advertising_failed')
    } else if (!hasReachedBLEDiagnosticStage(diagnostic, 'peer_discovered')) {
      finalizeBLEDiagnostics('peer_not_discovered')
    } else if (!hasReachedBLEDiagnosticStage(diagnostic, 'gatt_ready')) {
      finalizeBLEDiagnostics('gatt_timeout')
    } else if (!hasReachedBLEDiagnosticStage(diagnostic, 'noise_secured')) {
      finalizeBLEDiagnostics('noise_handshake_failed')
    } else if (!hasReachedBLEDiagnosticStage(diagnostic, 'contact_admitted')) {
      finalizeBLEDiagnostics('contact_admission_timeout')
    } else {
      finalizeBLEDiagnostics('route_timeout')
    }
  }, DIAGNOSTIC_TIMEOUT_MS)
}

function clearDeferredBLEStart(): void {
  if (bleStartTimer) clearTimeout(bleStartTimer)
  bleStartTimer = null
}

function scheduleDeferredBLEStart(reason: string): void {
  if (!initialized || !config.enabled || bleStarted || bleStartTimer) return
  log.info(`Deferring BLE v2 start (${reason}) by ${BLE_STARTUP_DEFER_MS}ms`)
  bleStartTimer = setTimeout(() => {
    bleStartTimer = null
    void ensureBLEStarted('deferred_start')
  }, BLE_STARTUP_DEFER_MS)
}

async function ensureBLEStarted(reason: string): Promise<boolean> {
  if (!initialized || !config.enabled || !linkManager) return false
  if (bleStarted) return true
  if (bleStartPromise) return bleStartPromise
  clearDeferredBLEStart()
  const generation = bleStartGeneration
  const controller = new AbortController()
  bleStartController = controller
  const startPromise = startBLE(reason, generation, controller.signal)
    .then((success) => {
      if (generation !== bleStartGeneration || !initialized || !config.enabled) {
        return false
      }
      bleStarted = success
      return success
    })
    .finally(() => {
      if (bleStartController === controller) {
        bleStartPromise = null
        bleStartController = null
      }
    })
  bleStartPromise = startPromise
  return startPromise
}

async function startBLE(
  reason: string,
  generation: number,
  signal: AbortSignal,
): Promise<boolean> {
  log.info(`Starting authenticated BLE v2 transport (${reason})`)
  const ready = await bleManager.initialize(config, (deviceId, data) => {
    if (signal.aborted || generation !== bleStartGeneration) return
    void linkManager?.receive(bleManager.resolveLinkDeviceId(deviceId), data)
  }, signal)
  if (
    !ready
    || signal.aborted
    || generation !== bleStartGeneration
    || !initialized
    || !config.enabled
  ) return false
  refreshScanDuty()
  await bleManager.startScanning(signal)
  if (signal.aborted || generation !== bleStartGeneration) return false
  const advertising = await bleManager.startAdvertising(signal)
  if (!advertising || signal.aborted || generation !== bleStartGeneration) {
    await bleManager.shutdown()
    return false
  }
  startTimers()
  return true
}

async function stopBLE(): Promise<void> {
  bleStartGeneration += 1
  bleStartController?.abort()
  bleStartController = null
  clearDeferredBLEStart()
  bleStarted = false
  stopTimers()
  clearAllReconnects()
  clearConnectJitter()
  suppressReconnect.clear()
  outboundDialLocks.clear()
  probeFailures.clear()
  linkManager?.reset()
  directTransport?.resetRadioSession()
  peerRegistry.clearPeers()
  notifyNearby()
  await bleManager.shutdown()
  bleStartPromise = null
}

function asKnownContacts(contacts: BLETransportKnownIdentity[]): BLEKnownContact[] {
  return contacts.map((contact) => ({
    identityId: contact.identityId,
    displayName: contact.displayName,
  }))
}
