/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Manages the BLE layer in central and peripheral roles.
 * Central scans, connects, subscribes, and writes. Peripheral advertises,
 * receives writes, and sends notifications.
 */

import { Platform, PermissionsAndroid, type Permission } from 'react-native'
import {
  type BLEPeer,
  type BLEMeshStatus,
  type BLEMeshConfig,
  type BLEMeshEventCallback,
  type BLEMeshEvent,
  BLE_SERVICE_UUID,
  BLE_CHARACTERISTIC_WRITE_UUID,
  BLE_CHARACTERISTIC_NOTIFY_UUID,
  BLE_IOS_COMPAT_MTU,
  BLE_FALLBACK_VALUE_BYTES,
  BLE_FRAGMENT_SPACING_MS,
  DEFAULT_BLE_MESH_CONFIG,
} from './types'
import { createLogger } from './logger'
import {
  compareLinkOffers,
  createLinkOffer,
  encodeLinkOfferFrame,
  parseAdvertisedLinkOffer,
  sameLinkOffer,
  splitLeadingLinkOffer,
} from './linkOffer'
import {
  type BLEDiagnosticBudgetSource,
  recordBLEDiagnosticFailure,
  recordBLEDiagnosticPeerBudget,
  recordBLEDiagnosticPeerFailure,
  recordBLEDiagnosticPeerStage,
  recordBLEDiagnosticStage,
} from './diagnostics'

const ANDROID_12_API_LEVEL = 31

export function androidBleRuntimePermissions(apiLevel: number): Permission[] {
  if (apiLevel >= ANDROID_12_API_LEVEL) {
    return [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    ]
  }

  return [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
}

const log = createLogger('BLEManager')
const MAX_RAW_FRAME_BYTES = 512
const MAX_ATT_MTU = 517
const GATT_WRITE_TIMEOUT_MS = 5_000
const NOTIFY_SEND_TIMEOUT_MS = 15_000
const BLUETOOTH_STATE_TIMEOUT_MS = 5_000
const ADVERTISING_START_TIMEOUT_MS = 10_000
const NATIVE_STOP_TIMEOUT_MS = 5_000
const SCAN_ERROR_BACKOFF_MS = 2_000
const BLE_PLX_OPERATION_CANCELLED = 2
const BLE_PLX_DEVICE_CONNECTION_FAILED = 200
const BLE_PLX_DEVICE_DISCONNECTED = 201
const MIN_PROTOCOL_VALUE_BYTES = 21
const READY_FRAME = new Uint8Array([0x53, 0x42, 0x02, 0x7f])

// Dynamic imports

let BleManagerClass: any = null
let bleManagerInstance: any = null

async function getBleManager(): Promise<any> {
  if (bleManagerInstance) return bleManagerInstance

  try {
    const mod = await import('react-native-ble-plx')
    BleManagerClass = mod.BleManager
    bleManagerInstance = new BleManagerClass()
    log.info('Central: react-native-ble-plx loaded successfully')
    return bleManagerInstance
  } catch (e) {
    log.warn('Central: react-native-ble-plx not available — Central mode disabled', e)
    return null
  }
}

function waitForBluetoothState(
  manager: any,
  signal?: AbortSignal,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(null)
      return
    }
    let subscription: { remove: () => void } | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    let settled = false
    const finish = (state: string | null): void => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      subscription?.remove()
      resolve(state)
    }
    const onAbort = (): void => finish(null)
    signal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => finish(null), BLUETOOTH_STATE_TIMEOUT_MS)
    try {
      subscription = manager.onStateChange((state: string) => {
        if (state !== 'Unknown') finish(state)
      }, true)
      if (settled) subscription?.remove()
    } catch {
      finish(null)
    }
  })
}

async function startAdvertisingWithDeadline(
  peripheral: NonNullable<typeof peripheralModule>,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return false
  let timer: ReturnType<typeof setTimeout> | null = null
  let onAbort: (() => void) | null = null
  const cancelled = new Promise<null>((resolve) => {
    const finish = (): void => resolve(null)
    onAbort = finish
    signal?.addEventListener('abort', finish, { once: true })
    timer = setTimeout(finish, ADVERTISING_START_TIMEOUT_MS)
  })
  let result: boolean | null
  try {
    result = await Promise.race([
      peripheral.startAdvertising(
        BLE_SERVICE_UUID,
        BLE_CHARACTERISTIC_WRITE_UUID,
        BLE_CHARACTERISTIC_NOTIFY_UUID,
        bytesToBase64(localLinkOffer ?? createLinkOffer()),
      ),
      cancelled,
    ])
  } finally {
    if (timer) clearTimeout(timer)
    if (onAbort) signal?.removeEventListener('abort', onAbort)
  }
  if (result !== null) return result
  void Promise.resolve(peripheral.stopAdvertising()).catch(() => {})
  return false
}

let peripheralModule: typeof import('../../modules/expo-ble-peripheral/src') | null = null

async function getPeripheralModule() {
  if (peripheralModule) return peripheralModule

  try {
    peripheralModule = await import('../../modules/expo-ble-peripheral/src')
    log.info('Peripheral: expo-ble-peripheral module loaded successfully')
    return peripheralModule
  } catch (e) {
    log.warn('Peripheral: expo-ble-peripheral module not available — Peripheral mode disabled', e)
    return null
  }
}

// State

let status: BLEMeshStatus = 'disabled'
let config: BLEMeshConfig = { ...DEFAULT_BLE_MESH_CONFIG }
const peers = new Map<string, BLEPeer>()
const eventListeners = new Set<BLEMeshEventCallback>()
let scanTimer: ReturnType<typeof setTimeout> | null = null
let scanGeneration = 0
let cleanupTimer: ReturnType<typeof setInterval> | null = null
let onDataReceived: ((deviceId: string, data: Uint8Array) => void) | null = null
let isScanning = false
let isAdvertising = false
let scanDesired = false
let advertisingDesired = false
let pendingAdvertisingStart: Promise<boolean> | null = null
let adapterStateSubscription: { remove(): void } | null = null
let lastAdapterState: string | null = null

// Cleanup handles
let peripheralListenerSub: { remove(): void } | null = null
const disconnectSubscriptions = new Map<string, { remove(): void }>()
const monitorSubscriptions = new Map<string, { remove(): void }>()
const centralConnectionGenerations = new Map<string, number>()
const outgoingFrameBudgets = new Map<string, number>()
const incomingFrameBudgets = new Map<string, number>()
const outgoingCentralLinks = new Set<string>()
const incomingCentralSubscriptions = new Set<string>()
const peerSendGenerations = new Map<string, number>()
const sendSequenceQueues = new Map<string, Promise<boolean>>()
const remoteOffers = new Map<string, Uint8Array>()
const deviceAliases = new Map<string, string>()
let localLinkOffer: Uint8Array | null = null
let generationCounter = 0

// Events

function isOperationCancelled(error: unknown): boolean {
  const described = describeBleError(error)
  if (described.errorCode === BLE_PLX_OPERATION_CANCELLED) return true
  return /cancell?ed/i.test(described.message)
}

function describeBleError(error: unknown): {
  message: string
  errorCode: number | null
  attErrorCode: number | null
  iosErrorCode: number | null
  reason: string | null
} {
  if (error == null) {
    return {
      message: 'null',
      errorCode: null,
      attErrorCode: null,
      iosErrorCode: null,
      reason: null,
    }
  }
  const record = typeof error === 'object' ? error as {
    errorCode?: unknown
    attErrorCode?: unknown
    iosErrorCode?: unknown
    reason?: unknown
    code?: unknown
    message?: unknown
  } : null
  const errorCode = asFiniteNumber(record?.errorCode ?? record?.code)
  return {
    message: error instanceof Error
      ? error.message
      : typeof record?.message === 'string'
        ? record.message
        : String(error),
    errorCode,
    attErrorCode: asFiniteNumber(record?.attErrorCode),
    iosErrorCode: asFiniteNumber(record?.iosErrorCode),
    reason: typeof record?.reason === 'string' ? record.reason : null,
  }
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function bleErrorCodeLabel(code: number | null): string {
  if (code === BLE_PLX_OPERATION_CANCELLED) return 'operation_cancelled'
  if (code === BLE_PLX_DEVICE_CONNECTION_FAILED) return 'device_connection_failed'
  if (code === BLE_PLX_DEVICE_DISCONNECTED) return 'device_disconnected'
  if (code == null) return 'unknown'
  return `ble_plx_${code}`
}

function radioPeerSnapshot(deviceId?: string): Record<string, unknown> {
  const snapshot = Array.from(peers.values()).map((peer) => ({
    id: peer.deviceId.slice(0, 8),
    state: peer.connectionState,
    out: peer.isPeripheral,
    inn: peer.isCentral,
    rssi: peer.rssi,
  }))
  return {
    incoming: incomingCentralSubscriptions.size,
    outgoing: outgoingCentralLinks.size,
    peers: deviceId
      ? snapshot.filter((peer) => peer.id === deviceId.slice(0, 8))
      : snapshot,
  }
}

function sameDeviceId(left: string, right: string): boolean {
  return left === right || left.toUpperCase() === right.toUpperCase()
}

function canonicalDeviceId(deviceId: string): string {
  const aliased = deviceAliases.get(deviceId)
  if (aliased && aliased !== deviceId) return canonicalDeviceId(aliased)
  for (const [from, to] of deviceAliases) {
    if (sameDeviceId(from, deviceId)) return to
  }
  return deviceId
}

function bindDeviceIds(left: string, right: string): void {
  if (sameDeviceId(left, right)) return
  const canonical = outgoingCentralLinks.has(left) || incomingCentralSubscriptions.has(right)
    ? left
    : right
  const other = canonical === left ? right : left
  deviceAliases.set(other, canonical)
  const otherPeer = peers.get(other)
  const canonicalPeer = peers.get(canonical)
  if (otherPeer && canonicalPeer) {
    canonicalPeer.isPeripheral = canonicalPeer.isPeripheral || otherPeer.isPeripheral
    canonicalPeer.isCentral = canonicalPeer.isCentral || otherPeer.isCentral
    canonicalPeer.lastSeenAt = Math.max(canonicalPeer.lastSeenAt, otherPeer.lastSeenAt)
    canonicalPeer.rssi = Math.min(canonicalPeer.rssi, otherPeer.rssi)
  }
}

function resolveOutgoingId(deviceId: string): string | null {
  if (outgoingCentralLinks.has(deviceId)) return deviceId
  const canonical = canonicalDeviceId(deviceId)
  if (outgoingCentralLinks.has(canonical)) return canonical
  for (const [from, to] of deviceAliases) {
    if (sameDeviceId(from, deviceId) && outgoingCentralLinks.has(to)) return to
    if (sameDeviceId(to, deviceId) && outgoingCentralLinks.has(from)) return from
  }
  return null
}

function resolveIncomingId(deviceId: string): string | null {
  const candidates = [deviceId, canonicalDeviceId(deviceId)]
  for (const [from, to] of deviceAliases) {
    if (sameDeviceId(to, deviceId) || sameDeviceId(from, deviceId)) {
      candidates.push(from, to)
    }
  }
  for (const candidate of candidates) {
    if (incomingCentralSubscriptions.has(candidate)) return candidate
    for (const id of incomingCentralSubscriptions) {
      if (sameDeviceId(id, candidate)) return id
    }
  }
  return null
}

function emit(event: BLEMeshEvent): void {
  for (const listener of eventListeners) {
    try {
      listener(event)
    } catch (e) {
      log.error('Event listener error', e)
    }
  }
}

export function addEventListener(callback: BLEMeshEventCallback): () => void {
  eventListeners.add(callback)
  return () => {
    eventListeners.delete(callback)
  }
}

// Permissions

async function requestPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    log.info('iOS: BLE permissions are declarative (Info.plist)')
    return true
  }

  try {
    const apiLevel = Platform.Version
    log.info(`Requesting BLE permissions — Android API level ${apiLevel}`)

    if (typeof apiLevel === 'number' && apiLevel >= ANDROID_12_API_LEVEL) {
      const permissions = androidBleRuntimePermissions(apiLevel)
      const results = await PermissionsAndroid.requestMultiple(permissions)
      const allGranted = permissions.every(
        (permission) => results[permission] === PermissionsAndroid.RESULTS.GRANTED,
      )

      if (!allGranted) {
        log.warn('Not all BLE permissions granted', results)
        setStatus('permission_denied')
        return false
      }

      log.info('All BLE permissions granted (Android 12+)', results)
      return true
    }

    const locationResult = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    )

    if (locationResult !== PermissionsAndroid.RESULTS.GRANTED) {
      log.warn('Location permission denied — BLE scanning requires location on Android < 12')
      setStatus('permission_denied')
      return false
    }

    log.info('Location permission granted (Android < 12)')
    return true
  } catch (e) {
    log.error('Permission request failed', e)
    setStatus('permission_denied')
    return false
  }
}

// Status

function setStatus(newStatus: BLEMeshStatus): void {
  if (status === newStatus) return
  const prev = status
  status = newStatus
  log.info(`Status transition: ${prev} → ${newStatus}`)
  emit({ type: 'mesh:status_changed', data: { previous: prev, current: newStatus }, timestamp: Date.now() })
}

export function getStatus(): BLEMeshStatus {
  return status
}

export function getPeers(): BLEPeer[] {
  return Array.from(peers.values())
}

export function hasIncomingCentral(): boolean {
  return incomingCentralSubscriptions.size > 0
}

export function shouldDialPeer(deviceId: string): boolean {
  if (!localLinkOffer) return false
  const offer = remoteOfferFor(deviceId)
  if (!offer) return false
  if (compareLinkOffers(localLinkOffer, offer) >= 0) return false
  const incomingId = resolveIncomingId(deviceId)
  if (incomingId && !outgoingCentralLinks.has(canonicalDeviceId(deviceId))) return false
  return true
}

export function shouldConnectPeer(deviceId: string): boolean {
  if (!localLinkOffer) return false
  const offer = remoteOfferFor(deviceId)
  if (!offer) return true
  return compareLinkOffers(localLinkOffer, offer) < 0
}

export function resolveLinkDeviceId(deviceId: string): string {
  return canonicalDeviceId(deviceId)
}

export function aliasedDeviceIds(deviceId: string): string[] {
  const ids = new Set<string>([deviceId, canonicalDeviceId(deviceId)])
  for (const [from, to] of deviceAliases) {
    if (
      sameDeviceId(from, deviceId)
      || sameDeviceId(to, deviceId)
      || ids.has(from)
      || ids.has(to)
    ) {
      ids.add(from)
      ids.add(to)
    }
  }
  return [...ids]
}

export function getNearbyPeers(): BLEPeer[] {
  const NEARBY_TIMEOUT_MS = 60_000
  const cutoff = Date.now() - NEARBY_TIMEOUT_MS
  return Array.from(peers.values()).filter(
    (p) => p.lastSeenAt > cutoff && (p.connectionState === 'connected' || p.connectionState === 'discovered')
  )
}

export function getPeerFrameBudget(deviceId: string): number {
  const outgoing = outgoingFrameBudgets.get(deviceId)
  const incomingId = resolveIncomingId(deviceId)
  const incoming = incomingId != null
    ? incomingFrameBudgets.get(incomingId)
    : incomingFrameBudgets.get(deviceId)
  if (outgoing != null && incoming != null) return Math.min(outgoing, incoming)
  return outgoing ?? incoming ?? BLE_FALLBACK_VALUE_BYTES
}

// Initialize

export async function initialize(
  meshConfig: BLEMeshConfig,
  dataCallback: (deviceId: string, data: Uint8Array) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  if (signal?.aborted) return false
  log.info('=== BLE Manager Initialization ===', {
    enabled: meshConfig.enabled,
    maxTTL: meshConfig.maxTTL,
    relay: meshConfig.relayEnabled,
    storeForward: meshConfig.storeForwardEnabled,
    maxConnections: meshConfig.maxConcurrentConnections,
  })

  config = { ...meshConfig }
  onDataReceived = dataCallback
  localLinkOffer = createLinkOffer()

  if (!config.enabled) {
    log.info('BLE mesh disabled in config — skipping initialization')
    setStatus('disabled')
    return false
  }

  const permissionsGranted = await requestPermissions()
  if (signal?.aborted || !permissionsGranted) {
    log.error('BLE permissions not granted — cannot proceed')
    recordBLEDiagnosticFailure('radio_unavailable')
    return false
  }

  // Start central role.
  const manager = await getBleManager()
  if (signal?.aborted) return false
  if (!manager) {
    log.error('Central: BLE library not available')
    setStatus('error')
    recordBLEDiagnosticFailure('radio_unavailable')
    return false
  } else {
    const btState = await waitForBluetoothState(manager, signal)
    if (signal?.aborted) return false
    if (!btState) {
      log.warn('Central: Timed out waiting for Bluetooth adapter state')
      setStatus('error')
      recordBLEDiagnosticFailure('radio_unavailable')
      return false
    }

    log.info(`Central: Bluetooth adapter state = ${btState}`)

    if (btState !== 'PoweredOn') {
      log.warn(`Central: Bluetooth not powered on (state: ${btState})`)
      lastAdapterState = btState
      setStatus('bluetooth_off')
      recordBLEDiagnosticFailure('radio_unavailable')
      return false
    }
    lastAdapterState = btState
    subscribeAdapterState(manager)
  }

  // Start peripheral role.
  const peripheral = await getPeripheralModule()
  if (signal?.aborted) return false
  if (!peripheral) {
    log.error('Peripheral: Module not available')
    setStatus('error')
    recordBLEDiagnosticFailure('radio_unavailable')
    return false
  } else {
    log.info('Peripheral: Setting up event listener for GATT server events')
    setupPeripheralEventListener(peripheral)
  }

  setStatus('initializing')

  cleanupTimer = setInterval(() => {
    cleanupStalePeers()
  }, 30_000)

  log.info('=== BLE Manager Initialized (Central + Peripheral) ===')
  return true
}

// Peripheral events

function setupPeripheralEventListener(peripheral: NonNullable<typeof peripheralModule>): void {
  if (peripheralListenerSub) {
    peripheralListenerSub.remove()
    peripheralListenerSub = null
  }

  peripheralListenerSub = peripheral.addPeripheralListener((event) => {
    log.info(`Peripheral event: type=${event.type}`, {
      centralId: event.centralId?.slice(0, 8),
      state: event.state,
      error: event.error,
      dataSize: event.data ? event.data.length : undefined,
    })

    switch (event.type) {
      case 'advertisingStarted':
        isAdvertising = true
        updateStatusFromState()
        recordBLEDiagnosticStage('radio_active')
        log.info('Peripheral: Now advertising — other devices can discover us')
        break

      case 'advertisingStopped':
        isAdvertising = false
        updateStatusFromState()
        log.info('Peripheral: Advertising stopped')
        break

      case 'bluetoothOff':
        handleRadioPoweredOff()
        log.warn('Peripheral: Bluetooth turned off')
        break

      case 'unauthorized':
        setStatus('permission_denied')
        recordBLEDiagnosticFailure('radio_unavailable')
        log.error('Peripheral: Bluetooth permission denied by user')
        break

      case 'unsupported':
        recordBLEDiagnosticFailure('radio_unavailable')
        log.error('Peripheral: BLE peripheral role not supported on this device')
        break

      case 'centralSubscribed':
        log.info(`Peripheral: Central ${event.centralId?.slice(0, 8)}... subscribed to notifications`)
        if (event.centralId) {
          incomingCentralSubscriptions.add(event.centralId)
          const valueBudget = normalizeValueBudget(
            event.maxPayloadBytes ?? BLE_FALLBACK_VALUE_BYTES,
          )
          incomingFrameBudgets.set(event.centralId, valueBudget)
          recordBLEDiagnosticPeerBudget(
            valueBudget === BLE_FALLBACK_VALUE_BYTES ? 'ios_fallback' : 'peripheral_reported',
            valueBudget,
            event.centralId,
          )
          ensurePeripheralPeer(event.centralId, 'subscribed')
          recordBLEDiagnosticPeerStage('gatt_ready', event.centralId)
        }
        break

      case 'centralUnsubscribed':
        log.info(`Peripheral: Central ${event.centralId?.slice(0, 8)}... unsubscribed`, {
          remainingIncoming: incomingCentralSubscriptions.size,
        })
        if (event.centralId) {
          incomingCentralSubscriptions.delete(event.centralId)
          incomingFrameBudgets.delete(event.centralId)
          markPeripheralPeerDisconnected(event.centralId)
        }
        break

      case 'centralConnected':
        log.info(`Peripheral: Central ${event.centralId?.slice(0, 8)}... connected to our GATT server`)
        if (event.centralId) {
          const valueBudget = normalizeValueBudget(
            event.maxPayloadBytes ?? BLE_FALLBACK_VALUE_BYTES,
          )
          if (!incomingFrameBudgets.has(event.centralId)) {
            incomingFrameBudgets.set(event.centralId, valueBudget)
          }
          ensurePeripheralPeer(event.centralId, 'connected')
        }
        break

      case 'centralDisconnected':
        log.warn(
          `Peripheral: Central ${event.centralId?.slice(0, 8)}... disconnected from GATT server`,
          radioPeerSnapshot(event.centralId),
        )
        if (event.centralId) {
          incomingCentralSubscriptions.delete(event.centralId)
          incomingFrameBudgets.delete(event.centralId)
          markPeripheralPeerDisconnected(event.centralId)
        }
        break

      case 'dataReceived':
        if (event.centralId && event.data) {
          const received = consumeLinkOffer(event.centralId, base64ToBytes(event.data))
          if (!received) break
          const incomingBudget = incomingFrameBudgets.get(event.centralId)
            ?? incomingFrameBudgets.get(canonicalDeviceId(event.centralId))
          const admitted = incomingCentralSubscriptions.has(event.centralId)
            || peers.get(event.centralId)?.isCentral === true
          if (
            !admitted
            || received.length === 0
            || received.length > MAX_RAW_FRAME_BYTES
            || (incomingBudget != null && received.length > incomingBudget)
          ) {
            log.warn('Peripheral: Rejected raw frame with invalid length')
            break
          }
          log.info(
            `Peripheral: Received ${received.length}B from central ${event.centralId.slice(0, 8)}... via GATT write`
          )
          const peer = peers.get(event.centralId)
          if (peer) peer.messagesReceived++
          onDataReceived?.(canonicalDeviceId(event.centralId), received)
        }
        break

      case 'stateChanged':
        log.info(`Peripheral: BLE state changed to ${event.state}`)
        break

      case 'error':
        log.error(`Peripheral error: ${event.error}`)
        emit({ type: 'mesh:error', data: { error: event.error, source: 'peripheral' }, timestamp: Date.now() })
        break
    }
  })
}

function ensurePeripheralPeer(centralId: string, reason: string): void {
  if (peers.has(centralId)) {
    const peer = peers.get(centralId)!
    const wasConnected = peer.connectionState === 'connected'
    peer.connectionState = 'connected'
    peer.lastSeenAt = Date.now()
    peer.isCentral = true
    log.debug(`Updated existing peer for central ${centralId.slice(0, 8)}... (reason=${reason})`)
    if (!wasConnected) {
      emit({ type: 'peer:connected', data: { peer }, timestamp: Date.now() })
    }
    return
  }

  const peer: BLEPeer = {
    deviceId: centralId,
    displayName: null,
    connectionState: 'connected',
    rssi: -50,
    lastSeenAt: Date.now(),
    discoveredAt: Date.now(),
    isPeripheral: false,
    isCentral: true,
    messagesSent: 0,
    messagesReceived: 0,
  }

  peers.set(centralId, peer)
  log.info(`Created peer for incoming central ${centralId.slice(0, 8)}... (reason=${reason})`)
  emit({ type: 'peer:connected', data: { peer }, timestamp: Date.now() })
}

function markPeripheralPeerDisconnected(deviceId: string): void {
  const peer = peers.get(deviceId)
  if (!peer) return
  peer.isCentral = false
  if (outgoingCentralLinks.has(deviceId)) {
    peer.connectionState = 'connected'
    peer.lastSeenAt = Date.now()
    return
  }
  invalidatePeerSends(deviceId)
  peer.connectionState = 'disconnected'
  peer.lastSeenAt = Date.now()
  emit({ type: 'peer:disconnected', data: { peer }, timestamp: Date.now() })
}

function normalizeValueBudget(value: unknown): number {
  if (
    typeof value !== 'number'
    || !Number.isInteger(value)
    || value < 1
    || value > MAX_RAW_FRAME_BYTES
  ) {
    return BLE_FALLBACK_VALUE_BYTES
  }
  if (value < MIN_PROTOCOL_VALUE_BYTES) return BLE_FALLBACK_VALUE_BYTES
  return value
}

export function resolveCentralFrameBudget(
  reportedMtu: unknown,
  platform: string = Platform.OS,
): { bytes: number; source: BLEDiagnosticBudgetSource } {
  const mtu = Number(reportedMtu)
  if (platform === 'ios' && (!Number.isFinite(mtu) || mtu <= 23)) {
    return { bytes: BLE_FALLBACK_VALUE_BYTES, source: 'ios_fallback' }
  }
  const bytes = mtu - 3
  if (
    !Number.isInteger(bytes)
    || bytes < 1
    || mtu > MAX_ATT_MTU
  ) {
    return { bytes: 0, source: 'fallback' }
  }
  return {
    bytes: Math.min(bytes, MAX_RAW_FRAME_BYTES),
    source: 'negotiated',
  }
}

function isReadyFrame(data: Uint8Array): boolean {
  return data.length === READY_FRAME.length
    && READY_FRAME.every((byte, index) => data[index] === byte)
}

function nextGeneration(): number {
  generationCounter += 1
  return generationCounter
}

function invalidatePeerSends(deviceId: string): number {
  const generation = nextGeneration()
  peerSendGenerations.set(deviceId, generation)
  return generation
}

function invalidateCentralConnection(deviceId: string): number {
  const generation = nextGeneration()
  centralConnectionGenerations.set(deviceId, generation)
  return generation
}

// Central scanning

export async function startScanning(
  signal?: AbortSignal,
  options?: { force?: boolean },
): Promise<void> {
  const manager = await getBleManager()
  if (signal?.aborted) return
  if (!manager) {
    log.warn('Central: Cannot start scanning — BLE manager not available')
    return
  }

  if (isScanning && !options?.force) {
    log.debug('Central: Already scanning, skipping duplicate start')
    return
  }

  if (options?.force && (isScanning || scanTimer)) {
    await haltScanning()
  }

  log.info(`Central: Starting scan (duty cycle: ${config.scanDutyMs}ms on / ${config.scanPauseMs}ms pause, filter: ${BLE_SERVICE_UUID})`)
  scanDesired = true
  isScanning = true
  const generation = ++scanGeneration

  const runScanCycle = async () => {
    if (!isScanning || !scanDesired || signal?.aborted || generation !== scanGeneration) return

    try {
      log.debug('Central: Scan cycle — starting scan...')

      manager.startDeviceScan(
        [BLE_SERVICE_UUID],
        { allowDuplicates: true },
        (error: any, device: any) => {
          if (!isScanning || generation !== scanGeneration) return
          if (error) {
            if (isOperationCancelled(error)) {
              log.debug('Central: Scan cycle stopped')
              return
            }
            log.error('Central: Scan callback error', error)
            try {
              manager.stopDeviceScan()
            } catch {
              // Scanner may already be stopped.
            }
            recordBLEDiagnosticFailure('scan_failed')
            if (scanTimer) clearTimeout(scanTimer)
            scanTimer = setTimeout(() => {
              if (generation === scanGeneration && isScanning && scanDesired) {
                void runScanCycle()
              }
            }, SCAN_ERROR_BACKOFF_MS)
            return
          }

          if (device) {
            handleDiscoveredDevice(device)
          }
        },
      )

      scanTimer = setTimeout(() => {
        if (generation !== scanGeneration) return
        try {
          manager.stopDeviceScan()
        } catch {
          // Scanner may already be stopped.
        }
        if (signal?.aborted) {
          isScanning = false
          scanDesired = false
          return
        }
        if (config.scanPauseMs <= 0) {
          log.debug('Central: Scan cycle — continuous')
          return
        }
        log.debug(`Central: Scan cycle — pausing for ${config.scanPauseMs}ms...`)

        scanTimer = setTimeout(() => {
          if (generation === scanGeneration) void runScanCycle()
        }, config.scanPauseMs)
      }, config.scanDutyMs)
    } catch (e) {
      if (generation !== scanGeneration) return
      log.error('Central: Scan cycle error', e)
      isScanning = false
      scanGeneration += 1
      updateStatusFromState()
      recordBLEDiagnosticFailure('scan_failed')
      if (scanDesired) {
        scanTimer = setTimeout(() => {
          if (scanDesired) void startScanning(signal)
        }, SCAN_ERROR_BACKOFF_MS)
      }
    }
  }

  await runScanCycle()
  updateStatusFromState()
}

export async function stopScanning(): Promise<void> {
  scanDesired = false
  await haltScanning()
  log.info('Central: Scanning stopped')
  updateStatusFromState()
}

async function haltScanning(): Promise<void> {
  isScanning = false
  scanGeneration += 1
  if (scanTimer) {
    clearTimeout(scanTimer)
    scanTimer = null
  }
  const manager = await getBleManager()
  if (manager) {
    try {
      manager.stopDeviceScan()
    } catch (e) {
      log.debug('Central: Error stopping scan (may already be stopped)', e)
    }
  }
}

export function setScanDuty(dutyMs: number, pauseMs: number): void {
  const duty = Math.max(1_000, Math.min(30_000, Math.floor(dutyMs)))
  const pause = Math.max(0, Math.min(60_000, Math.floor(pauseMs)))
  if (config.scanDutyMs === duty && config.scanPauseMs === pause) return
  config = { ...config, scanDutyMs: duty, scanPauseMs: pause }
}

export async function suspendDiscovery(): Promise<void> {
  await haltScanning()
  updateStatusFromState()
}

export async function resumeDiscovery(signal?: AbortSignal): Promise<void> {
  await startScanning(signal, { force: true })
  if (!isAdvertising && advertisingDesired) {
    await startAdvertising(signal)
  }
}

// Device handling

function handleDiscoveredDevice(device: any): void {
  const deviceId = device.id as string
  const rssi = (device.rssi as number) ?? -100
  const name = device.name || device.localName || null
  const advertisedOffer = parseAdvertisedLinkOffer(device)
  if (advertisedOffer) rememberRemoteOffer(deviceId, advertisedOffer)
  recordBLEDiagnosticPeerStage('peer_discovered', deviceId)

  let existingPeer = peers.get(deviceId)

  if (existingPeer) {
    existingPeer.lastSeenAt = Date.now()
    existingPeer.rssi = rssi
    existingPeer.isPeripheral = true
    if (existingPeer.connectionState === 'disconnected') {
      existingPeer.connectionState = 'discovered'
      emit({ type: 'peer:discovered', data: { peer: existingPeer }, timestamp: Date.now() })
    }
    return
  }

  const peer: BLEPeer = {
    deviceId,
    displayName: name,
    connectionState: 'discovered',
    rssi,
    lastSeenAt: Date.now(),
    discoveredAt: Date.now(),
    isPeripheral: true,
    isCentral: false,
    messagesSent: 0,
    messagesReceived: 0,
  }

  peers.set(deviceId, peer)

  log.info(
    `Central: Discovered BLE v2 service — device=${deviceId.slice(0, 8)}... rssi=${rssi}`
  )

  emit({ type: 'peer:discovered', data: { peer }, timestamp: Date.now() })
}

// Central connections

export async function connectToPeer(deviceId: string): Promise<boolean> {
  const manager = await getBleManager()
  if (!manager) return false

  const peer = peers.get(deviceId)
  if (!peer) {
    log.warn('Central: Cannot connect — peer is not in the peer table')
    return false
  }

  if (outgoingCentralLinks.has(deviceId)) return true
  if (peer.connectionState === 'connecting') return false

  const connectionGeneration = invalidateCentralConnection(deviceId)
  invalidatePeerSends(deviceId)
  peer.connectionState = 'connecting'
  recordBLEDiagnosticPeerStage('gatt_connecting', deviceId)
  log.info(`Central: Connecting to ${deviceId.slice(0, 8)}... (rssi=${peer.rssi})`, {
    generation: connectionGeneration,
    ...radioPeerSnapshot(deviceId),
  })

  let specificFailureRecorded = false
  try {
    let device = await manager.connectToDevice(deviceId, {
      timeout: 10_000,
      autoConnect: false,
    })

    if (Platform.OS === 'android' && typeof manager.requestMTUForDevice === 'function') {
      try {
        device = await manager.requestMTUForDevice(deviceId, BLE_IOS_COMPAT_MTU)
          ?? device
        log.info(`Central: Requested MTU ${BLE_IOS_COMPAT_MTU} for ${deviceId.slice(0, 8)}...`)
      } catch (e) {
        log.debug(`Central: MTU request failed for ${deviceId.slice(0, 8)}...`, e)
      }
    }

    log.info(`Central: Connected to ${deviceId.slice(0, 8)}... — discovering services...`)
    await device.discoverAllServicesAndCharacteristics()
    log.info(`Central: Service discovery complete for ${deviceId.slice(0, 8)}...`)

    if (typeof device.characteristicsForService === 'function') {
      const characteristics = await device.characteristicsForService(BLE_SERVICE_UUID)
      const write = characteristics.find(
        (characteristic: any) =>
          String(characteristic.uuid).toUpperCase() === BLE_CHARACTERISTIC_WRITE_UUID,
      )
      const notify = characteristics.find(
        (characteristic: any) =>
          String(characteristic.uuid).toUpperCase() === BLE_CHARACTERISTIC_NOTIFY_UUID,
      )
      if (
        !(write?.isWritableWithResponse || write?.isWritableWithoutResponse)
        || !notify?.isNotifiable
      ) {
        specificFailureRecorded = true
        recordBLEDiagnosticPeerFailure('gatt_service_missing', deviceId)
        throw new Error('BLE v2 GATT characteristics are unavailable')
      }
    }

    const resolvedBudget = resolveCentralFrameBudget(device.mtu)
    const valueBudget = resolvedBudget.bytes
    recordBLEDiagnosticPeerBudget(
      resolvedBudget.source,
      valueBudget,
      deviceId,
    )
    if (valueBudget < MIN_PROTOCOL_VALUE_BYTES) {
      specificFailureRecorded = true
      recordBLEDiagnosticPeerFailure('gatt_mtu_too_small', deviceId)
      throw new Error('BLE ATT value budget is too small for protocol framing')
    }
    outgoingFrameBudgets.set(deviceId, valueBudget)

    monitorSubscriptions.get(deviceId)?.remove()
    const monitorSub = device.monitorCharacteristicForService(
      BLE_SERVICE_UUID,
      BLE_CHARACTERISTIC_NOTIFY_UUID,
      (error: any, characteristic: any) => {
        if (centralConnectionGenerations.get(deviceId) !== connectionGeneration) return
        if (error) {
          if (isOperationCancelled(error)) {
            log.debug('Central: Notify cancelled', describeBleError(error))
            return
          }
          const described = describeBleError(error)
          log.warn('Central: Notify error after connect', {
            device: deviceId.slice(0, 8),
            label: bleErrorCodeLabel(described.errorCode),
            state: peer.connectionState,
            ...described,
            ...radioPeerSnapshot(deviceId),
          })
          recordBLEDiagnosticPeerFailure('gatt_connection_failed', deviceId)
          void evictPeer(deviceId)
          return
        }
        if (characteristic?.value) {
          const received = consumeLinkOffer(deviceId, base64ToBytes(characteristic.value))
          if (!received || isReadyFrame(received)) return
          if (received.length === 0 || received.length > MAX_RAW_FRAME_BYTES) {
            log.warn('Central: Rejected raw frame with invalid length')
            return
          }
          log.info(`Central: Received ${received.length}B via notify from ${deviceId.slice(0, 8)}...`)
          peer.messagesReceived++
          onDataReceived?.(canonicalDeviceId(deviceId), received)
        }
      },
    )
    if (monitorSub?.remove) monitorSubscriptions.set(deviceId, monitorSub)

    peer.connectionState = 'connected'
    peer.lastSeenAt = Date.now()
    peer.isPeripheral = true
    outgoingCentralLinks.add(deviceId)
    recordBLEDiagnosticPeerStage('gatt_ready', deviceId)
    log.info(`Central: Subscription ready for ${deviceId.slice(0, 8)}... ✓`)
    emit({ type: 'peer:connected', data: { peer }, timestamp: Date.now() })

    // Replace any stale disconnect listener.
    const existingSub = disconnectSubscriptions.get(deviceId)
    if (existingSub) {
      existingSub.remove()
      disconnectSubscriptions.delete(deviceId)
    }

    const disconnectSub = manager.onDeviceDisconnected(deviceId, () => {
      if (centralConnectionGenerations.get(deviceId) !== connectionGeneration) {
        log.debug(`Central: Ignoring stale disconnect for ${deviceId.slice(0, 8)}...`)
        return
      }
      invalidateCentralConnection(deviceId)
      log.warn(`Central: Peer ${deviceId.slice(0, 8)}... disconnected`, {
        generation: connectionGeneration,
        hadIncoming: resolveIncomingId(deviceId) != null,
        ...radioPeerSnapshot(deviceId),
      })
      outgoingCentralLinks.delete(deviceId)
      peer.isPeripheral = false
      disconnectSubscriptions.delete(deviceId)
      monitorSubscriptions.get(deviceId)?.remove()
      monitorSubscriptions.delete(deviceId)
      outgoingFrameBudgets.delete(deviceId)
      if (resolveIncomingId(deviceId) != null) {
        peer.connectionState = 'connected'
        peer.lastSeenAt = Date.now()
        return
      }
      invalidatePeerSends(deviceId)
      peer.connectionState = 'disconnected'
      emit({ type: 'peer:disconnected', data: { peer }, timestamp: Date.now() })
    })
    disconnectSubscriptions.set(deviceId, disconnectSub)

    log.info(`Central: Connected to ${deviceId.slice(0, 8)}...`)

    return true
  } catch (e) {
    const described = describeBleError(e)
    if (!specificFailureRecorded) {
      log.warn('Central: Recording gatt_connection_failed', {
        device: deviceId.slice(0, 8),
        label: bleErrorCodeLabel(described.errorCode),
        ...described,
        ...radioPeerSnapshot(deviceId),
      })
      recordBLEDiagnosticPeerFailure('gatt_connection_failed', deviceId)
    }
    if (centralConnectionGenerations.get(deviceId) !== connectionGeneration) {
      log.debug('Central: Connection failed after a newer generation replaced it', described)
      return false
    }
    invalidateCentralConnection(deviceId)
    log.error('Central: Connection failed', described)
    outgoingCentralLinks.delete(deviceId)
    peer.isPeripheral = false
    monitorSubscriptions.get(deviceId)?.remove()
    monitorSubscriptions.delete(deviceId)
    outgoingFrameBudgets.delete(deviceId)
    try {
      await settleWithin(Promise.resolve(manager.cancelDeviceConnection(deviceId)))
    } catch {
      // The connection may already be closed.
    }
    if (resolveIncomingId(deviceId) != null) {
      peer.connectionState = 'connected'
      peer.lastSeenAt = Date.now()
    } else {
      invalidatePeerSends(deviceId)
      peer.connectionState = 'disconnected'
      emit({ type: 'peer:disconnected', data: { peer }, timestamp: Date.now() })
    }
    return false
  }
}

export async function evictPeer(deviceId: string): Promise<void> {
  const peer = peers.get(deviceId)
  const incomingId = resolveIncomingId(deviceId)
  invalidateCentralConnection(deviceId)
  invalidatePeerSends(deviceId)
  forgetDeviceRadioState(deviceId)
  const disconnectSub = disconnectSubscriptions.get(deviceId)
  disconnectSub?.remove()
  disconnectSubscriptions.delete(deviceId)
  monitorSubscriptions.get(deviceId)?.remove()
  monitorSubscriptions.delete(deviceId)
  outgoingFrameBudgets.delete(deviceId)
  incomingFrameBudgets.delete(deviceId)
  if (incomingId) incomingFrameBudgets.delete(incomingId)
  outgoingCentralLinks.delete(deviceId)
  incomingCentralSubscriptions.delete(deviceId)
  if (incomingId) incomingCentralSubscriptions.delete(incomingId)
  peers.delete(deviceId)
  const peripheral = await getPeripheralModule()
  try {
    await peripheral?.cancelNotifications(incomingId ?? deviceId)
  } catch (error) {
    log.debug(`Peripheral: Error cancelling queued data for ${deviceId.slice(0, 8)}...`, error)
  }
  if (!peer) return

  emit({ type: 'peer:lost', data: { peer }, timestamp: Date.now() })
  if (peer.isPeripheral) {
    const manager = await getBleManager()
    if (manager) {
      try {
        await settleWithin(Promise.resolve(manager.cancelDeviceConnection(deviceId)))
      } catch (error) {
        log.debug(`Central: Error evicting stale peer ${deviceId.slice(0, 8)}...`, error)
      }
    }
  }
}

export async function disconnectPeer(deviceId: string): Promise<void> {
  const peer = peers.get(deviceId)
  const incomingId = resolveIncomingId(deviceId)
  const dropIncoming = incomingId != null && sameDeviceId(incomingId, deviceId)
  log.info(`Disconnecting ${deviceId.slice(0, 8)}...`, {
    dropIncoming,
    isPeripheral: peer?.isPeripheral === true,
    state: peer?.connectionState,
    ...radioPeerSnapshot(deviceId),
  })
  invalidatePeerSends(deviceId)
  outgoingCentralLinks.delete(deviceId)
  if (dropIncoming && incomingId) {
    incomingCentralSubscriptions.delete(incomingId)
    incomingFrameBudgets.delete(incomingId)
  }
  if (dropIncoming) {
    const peripheral = await getPeripheralModule()
    try {
      await peripheral?.cancelNotifications(incomingId ?? deviceId)
    } catch (error) {
      log.debug(`Peripheral: Error cancelling queued data for ${deviceId.slice(0, 8)}...`, error)
    }
  }
  if (peer?.isPeripheral) {
    invalidateCentralConnection(deviceId)
    clearOutgoingLink(deviceId, peer)
    const manager = await getBleManager()
    if (manager) {
      try {
        await settleWithin(Promise.resolve(manager.cancelDeviceConnection(deviceId)))
      } catch {
        // The connection may already be closed.
      }
    }
  }
  if (!peer) return
  peer.isPeripheral = false
  if (dropIncoming) peer.isCentral = false
  peer.connectionState = peer.isCentral ? 'connected' : 'disconnected'
  peer.lastSeenAt = Date.now()
  emit({ type: 'peer:disconnected', data: { peer }, timestamp: Date.now() })
}

export type BLESendPipe = 'outgoing' | 'incoming' | 'auto'

export async function sendData(
  deviceId: string,
  data: Uint8Array,
  options?: { pipe?: BLESendPipe; requireAck?: boolean; teardownOnTimeout?: boolean },
): Promise<boolean> {
  if (data.length === 0 || data.length > MAX_RAW_FRAME_BYTES) {
    log.warn('Rejected outbound raw frame with invalid length')
    return false
  }
  const requested = options?.pipe ?? 'auto'
  const pipe = resolveSendPipe(deviceId, requested)
  const teardownOnTimeout = options?.teardownOnTimeout !== false
  if (pipe === 'outgoing') {
    const centralResult = await sendDataViaCentral(
      deviceId,
      data,
      options?.requireAck === true,
      teardownOnTimeout,
    )
    if (centralResult === 'sent') return true
    const peripheralSent = await sendDataViaPeripheral(deviceId, data)
    if (peripheralSent) return true
    if (centralResult === 'timeout') return false
  } else if (pipe === 'incoming') {
    const peripheralSent = await sendDataViaPeripheral(deviceId, data)
    if (peripheralSent) return true
    if (requested !== 'incoming') {
      const centralResult = await sendDataViaCentral(
        deviceId,
        data,
        options?.requireAck === true,
        teardownOnTimeout,
      )
      if (centralResult === 'sent') return true
    }
  }

  log.warn(`Cannot send ${data.length}B — no viable path`)
  return false
}

export async function sendDataSequence(
  deviceId: string,
  packets: Uint8Array[],
  spacingMs = BLE_FRAGMENT_SPACING_MS,
  options?: { pipe?: BLESendPipe; requireAck?: boolean; teardownOnTimeout?: boolean },
): Promise<boolean> {
  const sendGeneration = peerSendGenerations.get(deviceId) ?? 0
  const previous = sendSequenceQueues.get(deviceId) ?? Promise.resolve(true)
  const operation = previous
    .catch(() => false)
    .then(async () => {
      for (let i = 0; i < packets.length; i++) {
        if ((peerSendGenerations.get(deviceId) ?? 0) !== sendGeneration) {
          return false
        }
        const success = await sendData(deviceId, packets[i], options)
        if (!success) return false

        if (i < packets.length - 1 && spacingMs > 0) {
          await sleep(spacingMs)
          if ((peerSendGenerations.get(deviceId) ?? 0) !== sendGeneration) {
            return false
          }
        }
      }
      return true
    })
  sendSequenceQueues.set(deviceId, operation)
  try {
    return await operation
  } finally {
    if (sendSequenceQueues.get(deviceId) === operation) {
      sendSequenceQueues.delete(deviceId)
    }
  }
}

function resolveSendPipe(deviceId: string, pipe: BLESendPipe): BLESendPipe | null {
  const outgoingId = resolveOutgoingId(deviceId)
  const incomingId = resolveIncomingId(deviceId)
  if (pipe === 'outgoing') {
    if (outgoingId) return 'outgoing'
    if (incomingId) return 'incoming'
    return null
  }
  if (pipe === 'incoming') {
    if (incomingId) return 'incoming'
    if (outgoingId) return 'outgoing'
    return null
  }
  if (outgoingId) return 'outgoing'
  if (incomingId) return 'incoming'
  return null
}

async function sendDataViaCentral(
  deviceId: string,
  data: Uint8Array,
  requireAck = false,
  teardownOnTimeout = true,
): Promise<'sent' | 'unavailable' | 'failed' | 'timeout'> {
  const manager = await getBleManager()
  if (!manager) return 'unavailable'

  const peer = peers.get(deviceId) ?? peers.get(canonicalDeviceId(deviceId))
  const outgoingId = resolveOutgoingId(deviceId)
  const budget = outgoingId != null ? outgoingFrameBudgets.get(outgoingId) : undefined
  if (
    !peer
    || peer.connectionState !== 'connected'
    || outgoingId == null
    || budget == null
    || data.length > budget
  ) {
    return 'unavailable'
  }

  try {
    const base64 = bytesToBase64(data)
    const sent = await Promise.race([
      writeCharacteristic(manager, outgoingId, base64, requireAck).then(() => true),
      sleep(GATT_WRITE_TIMEOUT_MS).then(() => false),
    ])
    if (!sent) {
      if (teardownOnTimeout) teardownOutgoingCentral(outgoingId, peer, manager)
      return 'timeout'
    }
    peer.messagesSent++
    log.debug(`Central: Sent ${data.length}B to ${outgoingId.slice(0, 8)}... via GATT write`)
    return 'sent'
  } catch (e) {
    log.debug(`Central: Write to ${outgoingId.slice(0, 8)}... failed — will try peripheral path`, e)
    return 'failed'
  }
}

async function sendDataViaPeripheral(deviceId: string, data: Uint8Array): Promise<boolean> {
  const peripheral = await getPeripheralModule()
  if (!peripheral) return false
  const incomingId = resolveIncomingId(deviceId)
  if (incomingId == null) return false
  const budget = incomingFrameBudgets.get(incomingId)
  if (budget == null || data.length > budget) return false

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sent = await notifyIncomingCentral(peripheral, incomingId, data)
    if (sent) {
      const peer = peers.get(deviceId) ?? peers.get(incomingId)
      if (peer) peer.messagesSent++
      log.debug(`Peripheral: Sent ${data.length}B to ${deviceId.slice(0, 8)}... via notify`)
      return true
    }
    if (attempt === 0 && resolveIncomingId(deviceId) != null) continue
    break
  }
  return false
}

async function notifyIncomingCentral(
  peripheral: NonNullable<typeof peripheralModule>,
  incomingId: string,
  data: Uint8Array,
): Promise<boolean> {
  try {
    const notification = Promise.resolve(
      peripheral.sendNotification(bytesToBase64(data), incomingId),
    ).then((value) => value === true).catch(() => false)
    const result = await Promise.race([
      notification.then((value): 'sent' | 'failed' => (value ? 'sent' : 'failed')),
      sleep(NOTIFY_SEND_TIMEOUT_MS).then((): 'timeout' => 'timeout'),
    ])
    if (result === 'sent') return true
    if (result === 'timeout') {
      try {
        await peripheral.cancelNotifications(incomingId)
      } catch {
        // Native queue may already be empty.
      }
    }
    return false
  } catch (e) {
    log.debug(`Peripheral: Notify to ${incomingId.slice(0, 8)}... failed`, e)
    return false
  }
}

// Peripheral advertising

export async function startAdvertising(
  signal?: AbortSignal,
  options?: { force?: boolean },
): Promise<boolean> {
  const peripheral = await getPeripheralModule()
  if (signal?.aborted) return false
  if (!peripheral) {
    log.warn(
      'Peripheral: Cannot start advertising — expo-ble-peripheral module not available. ' +
      'Without advertising, other devices cannot discover this device.'
    )
    recordBLEDiagnosticFailure('advertising_failed')
    return false
  }

  advertisingDesired = true
  if (isAdvertising && !options?.force) {
    log.debug('Peripheral: Already advertising, skipping duplicate start')
    return true
  }

  log.info(`Peripheral: Starting GATT server and advertising (service=${BLE_SERVICE_UUID})`)

  const operation = (async () => {
    try {
      const success = await startAdvertisingWithDeadline(peripheral, signal)

      if (signal?.aborted) {
        try {
          await settleWithin(Promise.resolve(peripheral.stopAdvertising()))
        } catch {
          // Shutdown owns final cleanup.
        }
        isAdvertising = false
        return false
      } else if (success) {
        isAdvertising = true
        updateStatusFromState()
        recordBLEDiagnosticStage('radio_active')
        log.info('Peripheral: Advertising started')
        return true
      } else {
        log.warn('Peripheral: startAdvertising returned false')
        recordBLEDiagnosticFailure('advertising_failed')
        return false
      }
    } catch (e) {
      log.error('Peripheral: Failed to start advertising', e)
      recordBLEDiagnosticFailure('advertising_failed')
      emit({ type: 'mesh:error', data: { error: 'Failed to start peripheral advertising', source: 'bleManager' }, timestamp: Date.now() })
      return false
    }
  })()
  pendingAdvertisingStart = operation
  try {
    return await operation
  } finally {
    if (pendingAdvertisingStart === operation) pendingAdvertisingStart = null
  }
}

export async function stopAdvertising(): Promise<void> {
  advertisingDesired = false
  const peripheral = await getPeripheralModule()
  if (peripheral) {
    try {
      await settleWithin(Promise.resolve(peripheral.stopAdvertising()))
    } catch (e) {
      log.debug('Peripheral: Error stopping advertising (may already be stopped)', e)
    }
  }

  isAdvertising = false
  log.info('Peripheral: Advertising stopped')
  updateStatusFromState()
}

// Cleanup

function cleanupStalePeers(): void {
  const STALE_TIMEOUT_MS = 5 * 60 * 1000
  const cutoff = Date.now() - STALE_TIMEOUT_MS
  let removed = 0

  for (const [id, peer] of peers) {
    if (peer.lastSeenAt < cutoff && peer.connectionState !== 'connected') {
      invalidateCentralConnection(id)
      invalidatePeerSends(id)
      peers.delete(id)
      removed++
      emit({ type: 'peer:lost', data: { peer }, timestamp: Date.now() })
    }
  }

  if (removed > 0) {
    log.info(`Cleaned up ${removed} stale peer(s), ${peers.size} remaining`)
  }
}

// Shutdown

export async function shutdown(): Promise<void> {
  log.info('=== BLE Manager Shutdown ===')

  const sendDeviceIds = new Set([
    ...peers.keys(),
    ...sendSequenceQueues.keys(),
  ])
  for (const deviceId of sendDeviceIds) invalidatePeerSends(deviceId)
  centralConnectionGenerations.clear()
  adapterStateSubscription?.remove()
  adapterStateSubscription = null
  lastAdapterState = null
  scanDesired = false
  advertisingDesired = false

  await stopScanning()
  const pendingStart = pendingAdvertisingStart
  await stopAdvertising()
  if (pendingStart) await settleWithin(pendingStart)
  await settleWithin(Promise.allSettled([...sendSequenceQueues.values()]))

  if (peripheralListenerSub) {
    peripheralListenerSub.remove()
    peripheralListenerSub = null
    log.info('Peripheral: Event listener removed')
  }

  for (const [deviceId, sub] of disconnectSubscriptions) {
    sub.remove()
    log.debug(`Central: Cleaned up disconnect subscription for ${deviceId.slice(0, 8)}...`)
  }
  disconnectSubscriptions.clear()
  for (const sub of monitorSubscriptions.values()) sub.remove()
  monitorSubscriptions.clear()
  outgoingFrameBudgets.clear()
  incomingFrameBudgets.clear()
  outgoingCentralLinks.clear()
  incomingCentralSubscriptions.clear()
  sendSequenceQueues.clear()
  peerSendGenerations.clear()
  remoteOffers.clear()
  deviceAliases.clear()
  localLinkOffer = null

  if (cleanupTimer) {
    clearInterval(cleanupTimer)
    cleanupTimer = null
  }

  // Disconnect central-role connections.
  const manager = await getBleManager()
  if (manager) {
    await Promise.allSettled([...peers.values()].map(async (peer) => {
      if (peer.connectionState === 'connected' && peer.isPeripheral) {
        try {
          await settleWithin(Promise.resolve(
            manager.cancelDeviceConnection(peer.deviceId),
          ))
          log.info(`Central: Disconnected from ${peer.deviceId.slice(0, 8)}...`)
        } catch (e) {
          log.debug(`Central: Error disconnecting from ${peer.deviceId.slice(0, 8)}...`, e)
        }
      }
    }))
  }

  peers.clear()
  onDataReceived = null
  setStatus('disabled')

  log.info('=== BLE Manager Shut Down ===')
}

// Helpers

function updateStatusFromState(): void {
  if (!config.enabled) {
    setStatus('disabled')
    return
  }
  if (lastAdapterState && lastAdapterState !== 'PoweredOn') {
    setStatus('bluetooth_off')
    return
  }
  if (isScanning && isAdvertising) setStatus('active')
  else if (isScanning) setStatus('scanning')
  else if (isAdvertising) setStatus('advertising')
  else setStatus('initializing')
}

function subscribeAdapterState(manager: { onStateChange: (
  callback: (state: string) => void,
  emitCurrent?: boolean,
) => { remove(): void } }): void {
  adapterStateSubscription?.remove()
  adapterStateSubscription = manager.onStateChange((state: string) => {
    handleAdapterState(state)
  }, false)
}

function handleAdapterState(state: string): void {
  if (state === 'Unknown') return
  const previous = lastAdapterState
  lastAdapterState = state
  if (state === 'PoweredOff' || state === 'Resetting') {
    handleRadioPoweredOff()
    return
  }
  if (state === 'Unauthorized') {
    isScanning = false
    isAdvertising = false
    setStatus('permission_denied')
    return
  }
  if (state !== 'PoweredOn' || !previous || previous === 'PoweredOn') return
  if (scanDesired) {
    isScanning = false
    void startScanning(undefined, { force: true })
  }
  if (advertisingDesired) {
    isAdvertising = false
    void startAdvertising(undefined, { force: true })
  }
}

function handleRadioPoweredOff(): void {
  isScanning = false
  isAdvertising = false
  if (scanTimer) {
    clearTimeout(scanTimer)
    scanTimer = null
  }
  const manager = bleManagerInstance
  if (manager) {
    try {
      manager.stopDeviceScan()
    } catch {
      // Adapter is already down.
    }
  }
  setStatus('bluetooth_off')
  recordBLEDiagnosticFailure('radio_unavailable')
  for (const [deviceId, peer] of peers) {
    if (
      peer.connectionState !== 'connected'
      && peer.connectionState !== 'connecting'
    ) continue
    invalidateCentralConnection(deviceId)
    clearOutgoingLink(deviceId, peer)
    incomingCentralSubscriptions.delete(deviceId)
    incomingFrameBudgets.delete(deviceId)
    peer.isCentral = false
    invalidatePeerSends(deviceId)
    peer.connectionState = 'disconnected'
    emit({ type: 'peer:disconnected', data: { peer }, timestamp: Date.now() })
  }
}

function clearOutgoingLink(deviceId: string, peer: BLEPeer): void {
  outgoingCentralLinks.delete(deviceId)
  outgoingFrameBudgets.delete(deviceId)
  peer.isPeripheral = false
  try {
    monitorSubscriptions.get(deviceId)?.remove()
  } catch {
    // Native subscription may already be gone.
  }
  monitorSubscriptions.delete(deviceId)
  try {
    disconnectSubscriptions.get(deviceId)?.remove()
  } catch {
    // Native subscription may already be gone.
  }
  disconnectSubscriptions.delete(deviceId)
}

function teardownOutgoingCentral(
  deviceId: string,
  peer: BLEPeer,
  manager: { cancelDeviceConnection: (deviceId: string) => unknown },
): void {
  invalidateCentralConnection(deviceId)
  clearOutgoingLink(deviceId, peer)
  try {
    void settleWithin(Promise.resolve(manager.cancelDeviceConnection(deviceId)))
  } catch {
    // Timeout state remains authoritative.
  }
  if (resolveIncomingId(deviceId) != null) {
    peer.connectionState = 'connected'
    peer.lastSeenAt = Date.now()
    return
  }
  invalidatePeerSends(deviceId)
  peer.connectionState = 'disconnected'
  emit({ type: 'peer:disconnected', data: { peer }, timestamp: Date.now() })
}

function writeCharacteristic(
  manager: any,
  deviceId: string,
  base64: string,
  requireAck = false,
): Promise<unknown> {
  if (
    !requireAck
    && typeof manager.writeCharacteristicWithoutResponseForDevice === 'function'
  ) {
    return Promise.resolve(manager.writeCharacteristicWithoutResponseForDevice(
      deviceId,
      BLE_SERVICE_UUID,
      BLE_CHARACTERISTIC_WRITE_UUID,
      base64,
    )).catch(() => manager.writeCharacteristicWithResponseForDevice(
      deviceId,
      BLE_SERVICE_UUID,
      BLE_CHARACTERISTIC_WRITE_UUID,
      base64,
    ))
  }
  return Promise.resolve(manager.writeCharacteristicWithResponseForDevice(
    deviceId,
    BLE_SERVICE_UUID,
    BLE_CHARACTERISTIC_WRITE_UUID,
    base64,
  ))
}

export async function announceLinkOffer(deviceId: string): Promise<void> {
  if (!localLinkOffer) return
  const pipe: BLESendPipe = resolveOutgoingId(deviceId) ? 'outgoing' : 'incoming'
  try {
    await sendDataSequence(
      deviceId,
      [encodeLinkOfferFrame(localLinkOffer)],
      0,
      { pipe, teardownOnTimeout: false },
    )
  } catch {
    log.debug(`Link offer send failed for ${deviceId.slice(0, 8)}...`)
  }
}

function consumeLinkOffer(deviceId: string, data: Uint8Array): Uint8Array | null {
  const { offer, remainder } = splitLeadingLinkOffer(data)
  if (!offer) return data
  const previous = remoteOfferFor(deviceId)
  rememberRemoteOffer(deviceId, offer)
  if (!previous || !sameLinkOffer(previous, offer)) {
    const peer = peers.get(deviceId) ?? peers.get(canonicalDeviceId(deviceId))
    if (peer) {
      emit({ type: 'peer:discovered', data: { peer }, timestamp: Date.now() })
    }
  }
  return remainder.length > 0 ? remainder : null
}

function remoteOfferFor(deviceId: string): Uint8Array | undefined {
  for (const id of aliasedDeviceIds(deviceId)) {
    const offer = remoteOffers.get(id)
      ?? [...remoteOffers.entries()].find(([key]) => sameDeviceId(key, id))?.[1]
    if (offer) return offer
  }
  return undefined
}

function rememberRemoteOffer(deviceId: string, offer: Uint8Array): void {
  remoteOffers.set(deviceId, offer.slice())
  for (const [id, existing] of remoteOffers) {
    if (id === deviceId || !sameLinkOffer(existing, offer)) continue
    bindDeviceIds(deviceId, id)
  }
}

function forgetDeviceRadioState(deviceId: string): void {
  remoteOffers.delete(deviceId)
  deviceAliases.delete(deviceId)
  for (const [from, to] of [...deviceAliases]) {
    if (sameDeviceId(from, deviceId) || sameDeviceId(to, deviceId)) {
      deviceAliases.delete(from)
    }
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function settleWithin(operation: Promise<unknown>): Promise<void> {
  await Promise.race([
    operation.then(() => undefined, () => undefined),
    sleep(NATIVE_STOP_TIMEOUT_MS),
  ])
}
