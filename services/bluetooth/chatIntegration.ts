/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/** Bridges BLE mesh events into chat handling and UI state. */

import type { EncryptedMessage, PublicKeyBundle } from '@spectra/core-crypto'
import * as transportManager from './transportManager'
import type { BLEOutboundDeliveryEvent, TransportRoute } from './types'
import { useBluetoothStore } from '@/store/bluetoothStore'
import { useChatStore } from '@/store/chatStore'
import type { ChatContact } from '@/lib/types'
import { buildDirectEnvelope } from '@/services/shared/envelopeTypes'
import { createLogger } from './logger'
import {
  getBLEDiagnosticSnapshot,
  onBLEDiagnosticsChanged,
} from './diagnostics'
import {
  clearBLEMessageDiagnostics,
  onBLEMessageDiagnosticsChanged,
} from './messageDiagnostics'

const log = createLogger('ChatBridge')

// State

let bridgeInitialized = false
let bridgeGeneration = 0
let receiveMessageFn: ((
  conversationId: string,
  encryptedData: EncryptedMessage,
  senderIdentityId: string,
) => Promise<void>) | null = null
let receiveBundleFn: ((fromIdentityId: string, bundle: PublicKeyBundle) => Promise<void>) | null = null

// Cleanup handles
let statsInterval: ReturnType<typeof setInterval> | null = null
let contactStoreUnsubscribe: (() => void) | null = null
let transportEventUnsubscribe: (() => void) | null = null
let nearbyContactsUnsubscribe: (() => void) | null = null
let diagnosticsUnsubscribe: (() => void) | null = null
let messageDiagnosticsUnsubscribe: (() => void) | null = null

type BridgeKnownIdentity = {
  identityId: string
  displayName: string | null
  bundle: PublicKeyBundle
}

function knownIdentityFingerprint(contacts: BridgeKnownIdentity[]): string {
  return contacts
    .map((contact) => [
      contact.identityId,
      contact.bundle.version,
      contact.bundle.identityKey,
      contact.bundle.mlkemIdentityKey,
      contact.bundle.dilithiumKey,
      contact.displayName ?? '',
    ].join(':'))
    .sort()
    .join('|')
}

// Initialize

/** Initialize after quantum chat is ready. */
export async function initializeBLEBridge(options: {
  walletScope: string
  identityId: string
  identityPrivateKey: string
  displayName?: string
  bundle: PublicKeyBundle | null
  knownIdentities: Array<{
    identityId: string
    displayName: string | null
    bundle: PublicKeyBundle
  }>
  sendControl: (remoteIdentityId: string, content: string) => Promise<boolean>
  onReceiveMessage: (
    conversationId: string,
    encryptedData: EncryptedMessage,
    senderIdentityId: string,
  ) => Promise<void>
  onReceiveBundle?: (fromIdentityId: string, bundle: PublicKeyBundle) => Promise<void>
  onDeliveryEvent?: (
    event: BLEOutboundDeliveryEvent,
  ) => Promise<void> | void
}): Promise<boolean> {
  if (bridgeInitialized) {
    log.warn('BLE bridge already initialized')
    return true
  }
  const initializationGeneration = ++bridgeGeneration

  log.info(`Initializing BLE bridge for identity ${options.identityId.slice(0, 8)}...`)

  receiveMessageFn = options.onReceiveMessage
  receiveBundleFn = options.onReceiveBundle ?? null

  const store = useBluetoothStore.getState()
  const config = await store.loadConfig(options.walletScope)

  if (!config.enabled) {
    log.info('BLE mesh disabled in config — preparing bridge in pass-through mode')
  }

  const contactList = options.knownIdentities

  log.info(`Initializing with ${contactList.length} known contact(s)`)

  const success = await transportManager.initialize({
    walletScope: options.walletScope,
    identityId: options.identityId,
    identityPrivateKey: options.identityPrivateKey,
    displayName: options.displayName,
    bundle: options.bundle,
    meshConfig: config,
    knownIdentities: contactList,
    onMessageReceived: handleBLEMessageReceived,
    onBundleReceived: handleBLEBundleReceived,
    onDeliveryEvent: options.onDeliveryEvent,
  })
  if (initializationGeneration !== bridgeGeneration) return false

  if (!success) {
    log.warn('Transport manager initialization returned false')
  }

  transportEventUnsubscribe = transportManager.addEventListener((event) => {
    if (event.type === 'mesh:status_changed') {
      const data = event.data as { current: string }
      store.setStatus(data.current as any)
    }
    if (event.type === 'mesh:error') {
      store.setError(String((event.data as any)?.error ?? 'Unknown error'))
    }
    if (event.type === 'internet:changed') {
      const data = event.data as { available: boolean }
      store.setInternetAvailable(data.available)
    }
  })

  nearbyContactsUnsubscribe = transportManager.onNearbyContactsChanged((nearby) => {
    store.setNearbyContacts(nearby)
  })
  store.setDiagnostics(getBLEDiagnosticSnapshot())
  diagnosticsUnsubscribe = onBLEDiagnosticsChanged((diagnostics) => {
    store.setDiagnostics(diagnostics)
  })
  messageDiagnosticsUnsubscribe = onBLEMessageDiagnosticsChanged((diagnostics) => {
    store.setMessageDiagnostics(diagnostics)
  })

  let previousContactFingerprint = knownIdentityFingerprint(contactList)
  let knownByIdentity = new Map(
    contactList.map((contact) => [contact.identityId, contact]),
  )
  const reconcileKnownContacts = (contacts: ChatContact[]): void => {
    if (initializationGeneration !== bridgeGeneration) return
    const nextContacts = contacts.flatMap((contact) => {
      if (
        contact.identityChanged
        || (contact.trustState !== 'trusted' && contact.trustState !== 'verified')
      ) return []
      const existing = knownByIdentity.get(contact.identityId)
      const bundle = contact.publicKeyBundle ?? existing?.bundle
      return bundle
        ? [{
          identityId: contact.identityId,
          displayName: contact.displayName || existing?.displayName || null,
          bundle,
        }]
        : []
    })
    const fingerprint = knownIdentityFingerprint(nextContacts)
    if (fingerprint === previousContactFingerprint) return
    previousContactFingerprint = fingerprint
    knownByIdentity = new Map(
      nextContacts.map((contact) => [contact.identityId, contact]),
    )
    transportManager.updateKnownContacts(nextContacts)
    void deliverInternetCapabilities(
      nextContacts,
      options.sendControl,
      initializationGeneration,
      (identityId) => knownByIdentity.has(identityId),
    ).catch((error) => {
      log.warn('Failed to reconcile BLE route capabilities', error)
    })
  }
  contactStoreUnsubscribe = useChatStore.subscribe((state, previousState) => {
    if (state.contacts === previousState?.contacts) return
    reconcileKnownContacts(state.contacts)
  })
  reconcileKnownContacts(useChatStore.getState().contacts)

  await deliverInternetCapabilities(
    [...knownByIdentity.values()],
    options.sendControl,
    initializationGeneration,
    (identityId) => knownByIdentity.has(identityId),
  )
  if (initializationGeneration !== bridgeGeneration) return false

  let lastPublishedStats: {
    totalSent: number
    totalReceived: number
    totalRelayed: number
    totalDropped: number
    peerCount: number
  } | null = null
  statsInterval = setInterval(() => {
    if (
      initializationGeneration === bridgeGeneration
      && bridgeInitialized
      && transportManager.isBLEEnabled()
    ) {
      const stats = transportManager.getStats()
      if (
        lastPublishedStats
        && lastPublishedStats.totalSent === stats.totalSent
        && lastPublishedStats.totalReceived === stats.totalReceived
        && lastPublishedStats.totalRelayed === stats.totalRelayed
        && lastPublishedStats.totalDropped === stats.totalDropped
        && lastPublishedStats.peerCount === stats.peerCount
      ) {
        return
      }
      lastPublishedStats = {
        totalSent: stats.totalSent,
        totalReceived: stats.totalReceived,
        totalRelayed: stats.totalRelayed,
        totalDropped: stats.totalDropped,
        peerCount: stats.peerCount,
      }
      store.setStats(lastPublishedStats)
    }
  }, 15_000)

  store.setInitialized(true)
  store.setStatus(transportManager.getStatus())
  store.setInternetAvailable(transportManager.isInternetAvailable())
  bridgeInitialized = true

  log.info('BLE bridge initialized successfully')
  return true
}

// Incoming messages

async function handleBLEMessageReceived(
  senderId: string,
  encryptedMessage: EncryptedMessage,
  route: TransportRoute,
): Promise<void> {
  log.info(
    `BLE message received from ${senderId.slice(0, 8)}... via ${route}`
  )

  if (!receiveMessageFn) {
    log.error('No receiveMessage callback registered — cannot process BLE message')
    throw new Error('BLE receive callback is unavailable')
  }

  const conversationId = encryptedMessage.metadata?.senderId
    ? `${encryptedMessage.metadata.senderId}`
    : senderId

  try {
    await receiveMessageFn(conversationId, encryptedMessage, senderId)
    log.info(`BLE message from ${senderId.slice(0, 8)}... processed successfully via ${route}`)
  } catch (e) {
    log.error('Failed to process BLE message', e)
    throw e
  }
}

// Incoming bundles

async function handleBLEBundleReceived(
  fromIdentityId: string,
  bundle: PublicKeyBundle,
): Promise<void> {
  log.info(`Received key bundle via BLE from ${fromIdentityId.slice(0, 8)}...`)

  try {
    if (!receiveBundleFn) {
      log.warn('No BLE bundle callback registered — ignoring bundle')
      return
    }

    await receiveBundleFn(fromIdentityId, bundle)
    log.info(`Bundle from ${fromIdentityId.slice(0, 8)}... handed to quantumChat`)
  } catch (e) {
    log.error('Failed to process BLE bundle', e)
  }
}

// Send via BLE

/** Send an encrypted message over BLE mesh. */
export async function sendViaBLE(
  recipientIdentityId: string,
  encryptedMessage: EncryptedMessage,
): Promise<{ success: boolean; stored: boolean; error?: string }> {
  if (!bridgeInitialized) {
    return { success: false, stored: false, error: 'BLE bridge not initialized' }
  }

  log.info(`sendViaBLE to ${recipientIdentityId.slice(0, 8)}...`)
  return transportManager.sendViaBLE(recipientIdentityId, encryptedMessage)
}

export async function acceptRouteCapability(
  remoteIdentityId: string,
  base64Capability: string,
): Promise<boolean> {
  if (!bridgeInitialized) return false
  return transportManager.acceptRouteCapability(remoteIdentityId, base64Capability)
}

// Routing

export function getRoute(recipientIdentityId: string) {
  return transportManager.getRoute(recipientIdentityId)
}

export function isContactNearby(identityId: string): boolean {
  return transportManager.isContactNearby(identityId)
}

// Internet status

export function setInternetAvailable(available: boolean): void {
  transportManager.setInternetAvailable(available)
}

// Shutdown

export async function shutdownBLEBridge(): Promise<void> {
  bridgeGeneration += 1
  log.info('Shutting down BLE bridge...')

  if (statsInterval) {
    clearInterval(statsInterval)
    statsInterval = null
    log.info('Stats interval cleared')
  }

  if (contactStoreUnsubscribe) {
    contactStoreUnsubscribe()
    contactStoreUnsubscribe = null
    log.info('Contact store subscription removed')
  }

  if (transportEventUnsubscribe) {
    transportEventUnsubscribe()
    transportEventUnsubscribe = null
    log.info('Transport event subscription removed')
  }

  if (nearbyContactsUnsubscribe) {
    nearbyContactsUnsubscribe()
    nearbyContactsUnsubscribe = null
    log.info('Nearby contacts subscription removed')
  }

  if (diagnosticsUnsubscribe) {
    diagnosticsUnsubscribe()
    diagnosticsUnsubscribe = null
  }
  if (messageDiagnosticsUnsubscribe) {
    messageDiagnosticsUnsubscribe()
    messageDiagnosticsUnsubscribe = null
  }
  clearBLEMessageDiagnostics()
  useBluetoothStore.getState().clearMessageDiagnostics()

  bridgeInitialized = false
  receiveMessageFn = null
  receiveBundleFn = null
  try {
    await transportManager.shutdown()
  } finally {
    useBluetoothStore.getState().reset()
  }

  log.info('BLE bridge shut down')
}

async function deliverInternetCapabilities(
  contacts: Array<{
    identityId: string
    displayName: string | null
    bundle: PublicKeyBundle
  }>,
  sendControl: (remoteIdentityId: string, content: string) => Promise<boolean>,
  generation: number,
  isEligible: (identityId: string) => boolean,
): Promise<void> {
  if (
    generation !== bridgeGeneration
    || !transportManager.isBLEEnabled()
  ) return

  for (const contact of contacts) {
    if (generation !== bridgeGeneration) return
    if (!isEligible(contact.identityId)) continue
    const ensured = await transportManager.ensureRouteCapability(contact.identityId)
    if (generation !== bridgeGeneration) return
    if (!isEligible(contact.identityId)) continue
    if (!ensured?.rotated) continue
    try {
      await sendControl(
        contact.identityId,
        buildDirectEnvelope('ble_route_capability', {
          capability: ensured.capability,
        }),
      )
    } catch (error) {
      log.warn('Failed to deliver BLE route capability over internet', error)
    }
  }
}
