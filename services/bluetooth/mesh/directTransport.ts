/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  BLE_V2_MAX_HOPS,
  BlePayloadType,
  BleRouteFlags,
  createBleAcceptanceReceipt,
  createBleRouteEnvelope,
  createCompactTransportBundle,
  decodeBleAcceptanceReceipt,
  decodeBleRouteEnvelope,
  encodeBleAcceptanceReceipt,
  encodeBleRouteEnvelope,
  generateRandomBytes,
  verifyBleRouteEnvelope,
  type BleRouteEnvelope,
  type EncryptedMessage,
  type PublicKeyBundle,
} from '@spectra/core-crypto'
import {
  BLE_SECURE_LINK_PAYLOAD_BYTES,
  type BleLinkManager,
} from '../link/linkManager'
import type { BLEPeerRegistry } from '../peerRegistry'
import {
  DirectFrameAssembler,
  encodeDirectDataFrames,
} from './directFrames'
import type { BLECapabilityStore } from './capabilityStore'
import { decodeBinaryValue, encodeBinaryValue } from './binaryValueCodec'
import {
  decodeBLEEncryptedMessage,
  encodeBLEEncryptedMessage,
} from './encryptedMessageCodec'
import {
  beginBLEMessageDiagnostics,
  getBLEMessageDiagnosticGeneration,
  recordBLEMessageDiagnosticFailure,
  recordBLEMessageDiagnosticStage,
} from '../messageDiagnostics'
import type { BLEOutboundDeliveryEvent } from '../types'

const WIRE_MAGIC_0 = 0x53
const WIRE_MAGIC_1 = 0x4d
const WIRE_VERSION = 2
const WIRE_HEADER_BYTES = 8
const WIRE_ROUTE = 1
const WIRE_RECEIPT = 2
const WIRE_CAPABILITY = 3
const WIRE_BUNDLE = 4
const WIRE_LIVENESS_PROBE = 5
const WIRE_LIVENESS_ACK = 6
const LIVENESS_NONCE_BYTES = 16

const RECEIPT_TIMEOUT_MS = 20_000
const MAX_PENDING_RECEIPTS = 32
const MAX_DEDUP_ENTRIES = 4096
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000
const MAX_ENVELOPE_LIFETIME_MS = 24 * 60 * 60 * 1000
const ONLINE_ENVELOPE_LIFETIME_MS = 2 * 60 * 1000
const ROUTE_PAIR_WAIT_MS = 6_000
const ROUTE_PAIR_POLL_MS = 50
const ROUTE_CAPABILITY_RESYNC_MS = 400

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type ReceiptWait = 'accepted' | 'timeout' | 'cancelled'

interface PendingReceipt {
  remoteIdentityId: string
  diagnosticOperation: number
  resolve: (result: ReceiptWait) => void
  timeout: ReturnType<typeof setTimeout> | null
}

interface WireMessage {
  kind: number
  hopCount: number
  ttl: number
  payload: Uint8Array
}

function idHex(id: Uint8Array): string {
  return Array.from(id, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function encodeWire(message: WireMessage): Uint8Array {
  if (
    !Number.isInteger(message.hopCount)
    || !Number.isInteger(message.ttl)
    || message.hopCount < 0
    || message.hopCount > BLE_V2_MAX_HOPS
    || message.ttl < 0
    || message.ttl > BLE_V2_MAX_HOPS
  ) {
    throw new Error('BLE mesh hop metadata is invalid')
  }
  const encoded = new Uint8Array(WIRE_HEADER_BYTES + message.payload.length)
  encoded[0] = WIRE_MAGIC_0
  encoded[1] = WIRE_MAGIC_1
  encoded[2] = WIRE_VERSION
  encoded[3] = message.kind
  encoded[4] = message.hopCount
  encoded[5] = message.ttl
  encoded[6] = 0
  encoded[7] = 0
  encoded.set(message.payload, WIRE_HEADER_BYTES)
  return encoded
}

function decodeWire(data: Uint8Array): WireMessage {
  if (
    data.length <= WIRE_HEADER_BYTES
    || data[0] !== WIRE_MAGIC_0
    || data[1] !== WIRE_MAGIC_1
    || data[2] !== WIRE_VERSION
    || data[6] !== 0
    || data[7] !== 0
    || ![
      WIRE_ROUTE,
      WIRE_RECEIPT,
      WIRE_CAPABILITY,
      WIRE_BUNDLE,
      WIRE_LIVENESS_PROBE,
      WIRE_LIVENESS_ACK,
    ].includes(data[3])
  ) {
    throw new Error('BLE mesh wire frame is invalid')
  }
  return {
    kind: data[3],
    hopCount: data[4],
    ttl: data[5],
    payload: data.slice(WIRE_HEADER_BYTES),
  }
}

function parseBundle(data: Uint8Array, remoteIdentityId: string): PublicKeyBundle {
  const parsed = decodeBinaryValue(data) as Partial<PublicKeyBundle> | null
  if (
    !parsed
    || typeof parsed !== 'object'
    || parsed.identityId !== remoteIdentityId
    || typeof parsed.identityKey !== 'string'
    || typeof parsed.mlkemIdentityKey !== 'string'
    || typeof parsed.dilithiumKey !== 'string'
    || typeof parsed.version !== 'number'
  ) {
    throw new Error('BLE public-key bundle is invalid')
  }
  return parsed as PublicKeyBundle
}

export class BLEDirectTransport {
  private readonly linkManager: BleLinkManager
  private readonly peerRegistry: BLEPeerRegistry
  private readonly capabilityStore: BLECapabilityStore
  private readonly onIncoming: (
    remoteIdentityId: string,
    message: EncryptedMessage,
    viaMesh: boolean,
  ) => Promise<void>
  private readonly onBundle: (
    remoteIdentityId: string,
    bundle: PublicKeyBundle,
  ) => Promise<void>
  private readonly onCapability: (
    remoteIdentityId: string,
    capability: Uint8Array,
  ) => Promise<boolean>
  private readonly onDelivery: (
    event: BLEOutboundDeliveryEvent,
  ) => Promise<void> | void
  private readonly assembler = new DirectFrameAssembler()
  private readonly pendingReceipts = new Map<string, PendingReceipt>()
  private pendingReceiptReservations = 0
  private readonly dedup = new Map<string, number>()
  private readonly processingEndpoints = new Set<string>()
  private readonly diagnosticGeneration = getBLEMessageDiagnosticGeneration()
  private deliveryCallbackChain: Promise<void> = Promise.resolve()
  private relayEnabled = false
  private storeForwardEnabled = false
  private maxHops = 1
  private storeForwardMaxMessages = 1
  private storeForwardTTLMs = ONLINE_ENVELOPE_LIFETIME_MS
  private totalSent = 0
  private totalReceived = 0
  private totalRelayed = 0
  private totalDropped = 0

  constructor(options: {
    linkManager: BleLinkManager
    peerRegistry: BLEPeerRegistry
    capabilityStore: BLECapabilityStore
    onIncoming: (
      remoteIdentityId: string,
      message: EncryptedMessage,
      viaMesh: boolean,
    ) => Promise<void>
    onBundle: (
      remoteIdentityId: string,
      bundle: PublicKeyBundle,
    ) => Promise<void>
    onCapability: (
      remoteIdentityId: string,
      capability: Uint8Array,
    ) => Promise<boolean>
    onDelivery?: (event: BLEOutboundDeliveryEvent) => Promise<void> | void
  }) {
    this.linkManager = options.linkManager
    this.peerRegistry = options.peerRegistry
    this.capabilityStore = options.capabilityStore
    this.onIncoming = options.onIncoming
    this.onBundle = options.onBundle
    this.onCapability = options.onCapability
    this.onDelivery = options.onDelivery ?? (() => {})
  }

  configure(options: {
    relayEnabled: boolean
    storeForwardEnabled: boolean
    maxHops: number
    storeForwardMaxMessages: number
    storeForwardTTLMs: number
  }): void {
    this.relayEnabled = options.relayEnabled === true
    this.storeForwardEnabled = options.storeForwardEnabled === true
    this.maxHops = Math.max(1, Math.min(BLE_V2_MAX_HOPS, Math.floor(options.maxHops)))
    this.storeForwardMaxMessages = Math.max(
      1,
      Math.min(500, Math.floor(options.storeForwardMaxMessages)),
    )
    this.storeForwardTTLMs = Math.max(
      1_000,
      Math.min(MAX_ENVELOPE_LIFETIME_MS, Math.floor(options.storeForwardTTLMs)),
    )
  }

  async send(
    remoteIdentityId: string,
    message: EncryptedMessage,
  ): Promise<{ success: boolean; stored: boolean; error?: string }> {
    const diagnosticOperation = beginBLEMessageDiagnostics(
      remoteIdentityId,
      'outbound',
      'route_selected',
      Date.now(),
      this.diagnosticGeneration,
    )
    const recordStage = (
      stage: Parameters<typeof recordBLEMessageDiagnosticStage>[2],
    ) => recordBLEMessageDiagnosticStage(
      remoteIdentityId,
      'outbound',
      stage,
      diagnosticOperation,
    )
    const recordFailure = (
      failure: Parameters<typeof recordBLEMessageDiagnosticFailure>[2],
    ) => recordBLEMessageDiagnosticFailure(
      remoteIdentityId,
      'outbound',
      failure,
      diagnosticOperation,
    )
    let pair = this.capabilityStore.getRoutePair(remoteIdentityId)
    if (!pair) {
      await this.refreshRoutePair(remoteIdentityId)
      pair = this.capabilityStore.getRoutePair(remoteIdentityId)
    }
    if (!pair) {
      recordFailure('route_capability_unavailable')
      return { success: false, stored: false, error: 'BLE route capability unavailable' }
    }
    const localMessageId = message.metadata?.messageId
    if (typeof localMessageId !== 'string' || localMessageId.length === 0) {
      recordFailure('message_encoding_failed')
      return { success: false, stored: false, error: 'BLE message identifier unavailable' }
    }
    recordStage('route_pair_ready')
    if (
      this.pendingReceipts.size + this.pendingReceiptReservations
      >= MAX_PENDING_RECEIPTS
    ) {
      recordFailure('receipt_limit_reached')
      return { success: false, stored: false, error: 'BLE receipt limit reached' }
    }
    this.pendingReceiptReservations += 1

    const now = Date.now()
    const expiresAt = Math.min(
      pair.forward.expiresAt,
      pair.return.expiresAt,
      now + (
        this.storeForwardEnabled
          ? this.storeForwardTTLMs
          : ONLINE_ENVELOPE_LIFETIME_MS
      ),
    )
    if (expiresAt <= now + 1_000) {
      this.pendingReceiptReservations -= 1
      recordFailure('route_capability_expiring')
      return { success: false, stored: false, error: 'BLE route capability is expiring' }
    }
    let envelope: BleRouteEnvelope
    try {
      envelope = createBleRouteEnvelope({
        payloadType: BlePayloadType.ChatCiphertext,
        flags: BleRouteFlags.AcceptanceReceiptRequired
          | (this.storeForwardEnabled ? BleRouteFlags.StoreForward : BleRouteFlags.None),
        maxHops: this.maxHops,
        issuedAt: now,
        expiresAt,
        payload: encodeBLEEncryptedMessage(message),
      }, pair.forward, pair.return, now)
    } catch {
      this.pendingReceiptReservations -= 1
      recordFailure('message_encoding_failed')
      return { success: false, stored: false, error: 'BLE message encoding failed' }
    }
    const encodedEnvelope = encodeBleRouteEnvelope(envelope)
    let correlationRecorded = false
    try {
      correlationRecorded = await this.capabilityStore.recordOutboundCorrelation({
        envelope,
        returnCapability: pair.return,
        localMessageId,
        remoteIdentityId,
        now,
      })
    } catch {
      correlationRecorded = false
    }
    this.publishStoreDeliveryEvents()
    if (!correlationRecorded) {
      this.pendingReceiptReservations -= 1
      recordFailure('message_encoding_failed')
      return { success: false, stored: false, error: 'BLE delivery tracking unavailable' }
    }
    const receiptPromise = this.waitForReceipt(
      remoteIdentityId,
      envelope,
      diagnosticOperation,
    )
    this.pendingReceiptReservations -= 1
    recordStage('transmitting')
    let sent: boolean
    try {
      sent = await this.sendInitialRoute(remoteIdentityId, envelope, encodedEnvelope)
    } catch {
      this.cancelReceipt(envelope.envelopeId)
      if ((await receiptPromise) === 'accepted') {
        recordStage('receipt_received')
        this.totalSent += 1
        return { success: true, stored: false }
      }
      await this.failOutbound(envelope.envelopeId, 'transmission_failed')
      recordFailure('message_transmission_failed')
      return { success: false, stored: false, error: 'BLE message transmission failed' }
    }
    if (!sent) {
      this.cancelReceipt(envelope.envelopeId)
      if ((await receiptPromise) === 'accepted') {
        recordStage('receipt_received')
        this.totalSent += 1
        return { success: true, stored: false }
      }
      recordFailure('authenticated_link_unavailable')
      const stored = await this.storeForForward(envelope, encodedEnvelope, 0, envelope.maxHops)
      if (!stored) {
        await this.failOutbound(envelope.envelopeId, 'transmission_failed')
      }
      return stored
        ? { success: false, stored: true }
        : { success: false, stored: false, error: 'No authenticated BLE route' }
    }
    recordStage('transmitted')
    this.armReceiptTimeout(envelope.envelopeId)
    recordStage('awaiting_receipt')
    this.totalSent += 1
    const receipt = await receiptPromise
    if (receipt === 'accepted') {
      recordStage('receipt_received')
      return { success: true, stored: false }
    }
    if (receipt === 'timeout') {
      const retried = await this.resendAfterReceiptTimeout(
        remoteIdentityId,
        message,
        localMessageId,
        diagnosticOperation,
        recordStage,
        recordFailure,
      )
      if (retried !== null) return retried
    }

    recordFailure('receipt_timeout')
    const stored = await this.storeForForward(envelope, encodedEnvelope, 0, envelope.maxHops)
    if (!stored) await this.failOutbound(envelope.envelopeId, 'receipt_timeout')
    return stored
      ? { success: false, stored: true }
      : { success: false, stored: false, error: 'BLE acceptance receipt timed out' }
  }

  async sendCapability(deviceId: string, encodedCapability: Uint8Array): Promise<boolean> {
    try {
      return await this.sendWire(deviceId, {
        kind: WIRE_CAPABILITY,
        hopCount: 0,
        ttl: 1,
        payload: encodedCapability,
      })
    } catch {
      return false
    }
  }

  async sendBundle(deviceId: string, bundle: PublicKeyBundle): Promise<boolean> {
    try {
      return await this.sendWire(deviceId, {
        kind: WIRE_BUNDLE,
        hopCount: 0,
        ttl: 1,
        payload: encodeBinaryValue(createCompactTransportBundle(bundle)),
      })
    } catch {
      return false
    }
  }

  async probe(deviceId: string): Promise<boolean> {
    try {
      return await this.sendWire(deviceId, {
        kind: WIRE_LIVENESS_PROBE,
        hopCount: 0,
        ttl: 1,
        payload: generateRandomBytes(LIVENESS_NONCE_BYTES),
      })
    } catch {
      return false
    }
  }

  async receiveSecure(
    deviceId: string,
    remoteIdentityId: string,
    frame: Uint8Array,
  ): Promise<void> {
    if (this.peerRegistry.getIdentity(deviceId) !== remoteIdentityId) return
    let assembled
    try {
      assembled = this.assembler.accept(deviceId, frame)
    } catch {
      throw new Error('BLE direct frame was rejected')
    }
    if (!assembled) return
    let wire: WireMessage
    try {
      wire = decodeWire(assembled.message)
    } catch {
      throw new Error('BLE direct wire message was rejected')
    }
    if (wire.kind === WIRE_LIVENESS_PROBE || wire.kind === WIRE_LIVENESS_ACK) {
      if (
        wire.hopCount !== 0
        || wire.ttl !== 1
        || wire.payload.length !== LIVENESS_NONCE_BYTES
      ) {
        throw new Error('BLE liveness metadata is invalid')
      }
      if (wire.kind === WIRE_LIVENESS_PROBE) {
        await this.sendWire(deviceId, {
          kind: WIRE_LIVENESS_ACK,
          hopCount: 0,
          ttl: 1,
          payload: wire.payload,
        })
      }
      return
    }
    if (wire.kind === WIRE_CAPABILITY) {
      if (wire.hopCount !== 0 || wire.ttl !== 1) {
        throw new Error('BLE capability hop metadata is invalid')
      }
      if (!(await this.onCapability(remoteIdentityId, wire.payload))) {
        return
      }
      return
    }
    if (wire.kind === WIRE_BUNDLE) {
      if (wire.hopCount !== 0 || wire.ttl !== 1) {
        throw new Error('BLE bundle hop metadata is invalid')
      }
      await this.onBundle(remoteIdentityId, parseBundle(wire.payload, remoteIdentityId))
      return
    }
    if (wire.kind === WIRE_ROUTE) {
      await this.receiveRoute(deviceId, wire)
      return
    }
    await this.receiveReceipt(deviceId, wire)
  }

  async flushQueued(): Promise<void> {
    const peers = this.peerRegistry.listNearby()
      .filter((peer) => this.linkManager.isAuthenticated(peer.deviceId))
    const queued = await this.capabilityStore.getQueuedEnvelopes()
    this.publishStoreDeliveryEvents()
    if (peers.length === 0) return
    for (const item of queued) {
      if (item.ttl < 1 || item.hopCount + item.ttl !== item.envelope.maxHops) continue
      let sent = 0
      for (const peer of peers) {
        if (await this.sendWire(peer.deviceId, {
          kind: WIRE_ROUTE,
          hopCount: item.hopCount,
          ttl: item.ttl,
          payload: item.encoded,
        })) {
          sent += 1
        }
      }
      if (sent > 0) {
        await this.capabilityStore.recordQueueAttempt(item.envelope.envelopeId)
        this.publishStoreDeliveryEvents()
      }
    }
  }

  async reconcileOutbound(): Promise<void> {
    const events = await this.capabilityStore.reconcileOutbound()
    for (const event of events) this.publishDeliveryEvent(event)
  }

  getStats(): {
    totalSent: number
    totalReceived: number
    totalRelayed: number
    totalDropped: number
    peerCount: number
  } {
    return {
      totalSent: this.totalSent,
      totalReceived: this.totalReceived,
      totalRelayed: this.totalRelayed,
      totalDropped: this.totalDropped,
      peerCount: this.peerRegistry.listNearby().length,
    }
  }

  reset(): void {
    this.resetRadioSession()
    this.dedup.clear()
    this.processingEndpoints.clear()
    this.totalSent = 0
    this.totalReceived = 0
    this.totalRelayed = 0
    this.totalDropped = 0
  }

  resetRadioSession(): void {
    this.assembler.reset()
    for (const pending of this.pendingReceipts.values()) {
      if (pending.timeout) clearTimeout(pending.timeout)
      pending.resolve('cancelled')
    }
    this.pendingReceipts.clear()
  }

  private async receiveRoute(deviceId: string, wire: WireMessage): Promise<void> {
    let diagnosticIdentityId: string | null = null
    let diagnosticOperation: number | undefined
    let diagnosticFailure: Parameters<typeof recordBLEMessageDiagnosticFailure>[2]
      = 'encrypted_message_invalid'
    try {
      const envelope = decodeBleRouteEnvelope(wire.payload)
      if (
        envelope.maxHops > this.maxHops
        || wire.hopCount + wire.ttl !== envelope.maxHops
        || wire.ttl < 1
      ) {
        throw new Error('BLE route hop metadata is invalid')
      }

      const endpoint = this.capabilityStore.findInboundRoute(
        envelope.routeId,
        envelope.routeEpoch,
      )
      if (endpoint) {
        diagnosticIdentityId = endpoint.remoteIdentityId
        diagnosticOperation = beginBLEMessageDiagnostics(
          endpoint.remoteIdentityId,
          'inbound',
          'assembling',
          Date.now(),
          this.diagnosticGeneration,
        )
        if (!verifyBleRouteEnvelope(envelope, endpoint.forward, endpoint.return)) {
          diagnosticFailure = 'envelope_authentication_failed'
          throw new Error('BLE route endpoint authentication failed')
        }
        recordBLEMessageDiagnosticStage(
          endpoint.remoteIdentityId,
          'inbound',
          'envelope_verified',
          diagnosticOperation,
        )
        const endpointKey = idHex(envelope.envelopeId)
        if (this.processingEndpoints.has(endpointKey)) return
        if (!this.capabilityStore.hasReplay(envelope.envelopeId)) {
          this.processingEndpoints.add(endpointKey)
          try {
            let message: EncryptedMessage
            try {
              message = decodeBLEEncryptedMessage(
                envelope.payload,
                endpoint.remoteIdentityId,
              )
            } catch {
              diagnosticFailure = 'encrypted_message_invalid'
              throw new Error('BLE encrypted message was rejected')
            }
            recordBLEMessageDiagnosticStage(
              endpoint.remoteIdentityId,
              'inbound',
              'chat_processing',
              diagnosticOperation,
            )
            diagnosticFailure = 'chat_processing_failed'
            await this.onIncoming(
              endpoint.remoteIdentityId,
              message,
              wire.hopCount > 0,
            )
            await this.capabilityStore.checkAndRecordReplay(envelope.envelopeId)
            this.totalReceived += 1
            recordBLEMessageDiagnosticStage(
              endpoint.remoteIdentityId,
              'inbound',
              'persisted',
              diagnosticOperation,
            )
          } finally {
            this.processingEndpoints.delete(endpointKey)
          }
        }
        recordBLEMessageDiagnosticStage(
          endpoint.remoteIdentityId,
          'inbound',
          'sending_receipt',
          diagnosticOperation,
        )
        const receipt = createBleAcceptanceReceipt(
          envelope,
          endpoint.forward,
          endpoint.return,
        )
        diagnosticFailure = 'receipt_send_failed'
        const sent = await this.sendWire(deviceId, {
          kind: WIRE_RECEIPT,
          hopCount: 0,
          ttl: envelope.maxHops,
          payload: encodeBleAcceptanceReceipt(receipt),
        })
        if (!sent) throw new Error('BLE acceptance receipt send failed')
        recordBLEMessageDiagnosticStage(
          endpoint.remoteIdentityId,
          'inbound',
          'receipt_sent',
          diagnosticOperation,
        )
        return
      }

      const dedupKey = `route:${idHex(envelope.envelopeId)}`
      if (this.isDuplicate(dedupKey)) return
      if (!this.relayEnabled || wire.ttl <= 1) {
        diagnosticIdentityId = this.peerRegistry.getIdentity(deviceId)
        if (diagnosticIdentityId) {
          diagnosticOperation = beginBLEMessageDiagnostics(
            diagnosticIdentityId,
            'inbound',
            'assembling',
            Date.now(),
            this.diagnosticGeneration,
          )
          recordBLEMessageDiagnosticFailure(
            diagnosticIdentityId,
            'inbound',
            'route_not_recognized',
            diagnosticOperation,
          )
          await this.announceInboundCapability(diagnosticIdentityId)
        }
        this.totalDropped += 1
        return
      }
      const nextHop = wire.hopCount + 1
      const nextTTL = wire.ttl - 1
      if ((envelope.flags & BleRouteFlags.StoreForward) !== 0) {
        await this.storeForForward(envelope, wire.payload, nextHop, nextTTL)
      }
      const relayed = await this.flood({
        kind: WIRE_ROUTE,
        hopCount: nextHop,
        ttl: nextTTL,
        payload: wire.payload,
      }, deviceId)
      if (relayed > 0) this.totalRelayed += 1
    } catch {
      if (diagnosticIdentityId) {
        recordBLEMessageDiagnosticFailure(
          diagnosticIdentityId,
          'inbound',
          diagnosticFailure,
          diagnosticOperation,
        )
      }
      this.totalDropped += 1
    }
  }

  private async receiveReceipt(deviceId: string, wire: WireMessage): Promise<void> {
    try {
      if (wire.ttl < 1 || wire.hopCount + wire.ttl > this.maxHops) {
        throw new Error('BLE receipt hop metadata is invalid')
      }
      const receipt = decodeBleAcceptanceReceipt(wire.payload)
      const key = idHex(receipt.envelopeId)
      const tracked = this.capabilityStore.hasOutboundCorrelation(
        receipt.envelopeId,
      )
      const accepted = await this.capabilityStore.acceptOutboundReceipt(
        receipt,
        wire.hopCount + wire.ttl,
      )
      const pending = this.pendingReceipts.get(key)
      if (accepted) {
        try {
          await this.capabilityStore.deleteQueuedWithProof(
            receipt.envelopeId,
            receipt.cacheDeletionPreimage,
          )
        } catch {
          // A replayed envelope can deliver the deletion proof again.
        }
        this.publishStoreDeliveryEvents()
        if (!pending) return
        if (pending.timeout) clearTimeout(pending.timeout)
        this.pendingReceipts.delete(key)
        recordBLEMessageDiagnosticStage(
          pending.remoteIdentityId,
          'outbound',
          'receipt_received',
          pending.diagnosticOperation,
        )
        pending.resolve('accepted')
        return
      }
      if (tracked) throw new Error('BLE tracked receipt authentication failed')

      await this.capabilityStore.deleteQueuedWithProof(
          receipt.envelopeId,
          receipt.cacheDeletionPreimage,
      )
      this.publishStoreDeliveryEvents()

      const dedupKey = `receipt:${key}:${idHex(receipt.routeId)}`
      if (this.isDuplicate(dedupKey)) return
      if (!this.relayEnabled || wire.ttl <= 1) return
      const relayed = await this.flood({
        kind: WIRE_RECEIPT,
        hopCount: wire.hopCount + 1,
        ttl: wire.ttl - 1,
        payload: wire.payload,
      }, deviceId)
      if (relayed > 0) this.totalRelayed += 1
    } catch {
      this.totalDropped += 1
    }
  }

  private waitForReceipt(
    remoteIdentityId: string,
    envelope: BleRouteEnvelope,
    diagnosticOperation: number,
  ): Promise<ReceiptWait> {
    const key = idHex(envelope.envelopeId)
    return new Promise((resolve) => {
      this.pendingReceipts.set(key, {
        remoteIdentityId,
        diagnosticOperation,
        resolve,
        timeout: null,
      })
    })
  }

  private armReceiptTimeout(envelopeId: Uint8Array): void {
    const key = idHex(envelopeId)
    const pending = this.pendingReceipts.get(key)
    if (!pending || pending.timeout) return
    pending.timeout = setTimeout(() => {
      if (this.pendingReceipts.get(key) !== pending) return
      this.pendingReceipts.delete(key)
      pending.resolve('timeout')
    }, RECEIPT_TIMEOUT_MS)
  }

  private cancelReceipt(envelopeId: Uint8Array): void {
    const key = idHex(envelopeId)
    const pending = this.pendingReceipts.get(key)
    if (!pending) return
    if (pending.timeout) clearTimeout(pending.timeout)
    this.pendingReceipts.delete(key)
    pending.resolve('cancelled')
  }

  private async sendInitialRoute(
    remoteIdentityId: string,
    envelope: BleRouteEnvelope,
    encodedEnvelope: Uint8Array,
  ): Promise<boolean> {
    const wire: WireMessage = {
      kind: WIRE_ROUTE,
      hopCount: 0,
      ttl: envelope.maxHops,
      payload: encodedEnvelope,
    }
    const directDevice = this.peerRegistry.getDevice(remoteIdentityId)
    if (
      directDevice
      && this.linkManager.isAuthenticated(directDevice)
      && await this.sendWire(directDevice, wire)
    ) {
      return true
    }
    if (!this.relayEnabled) return false
    return (await this.flood(wire, directDevice ?? undefined)) > 0
  }

  private async flood(wire: WireMessage, excludeDeviceId?: string): Promise<number> {
    let sent = 0
    for (const peer of this.peerRegistry.listNearby()) {
      if (
        peer.deviceId === excludeDeviceId
        || !this.linkManager.isAuthenticated(peer.deviceId)
      ) {
        continue
      }
      if (await this.sendWire(peer.deviceId, wire)) sent += 1
    }
    return sent
  }

  private authenticatedDeviceFor(remoteIdentityId: string): string | null {
    const deviceId = this.peerRegistry.getDevice(remoteIdentityId)
    if (!deviceId || !this.linkManager.isAuthenticated(deviceId)) return null
    return deviceId
  }

  private async announceInboundCapability(remoteIdentityId: string): Promise<boolean> {
    const deviceId = this.authenticatedDeviceFor(remoteIdentityId)
    if (!deviceId) return false
    try {
      const inbound = await this.capabilityStore.ensureInboundCapability(
        remoteIdentityId,
        Date.now(),
        { rotateExpiring: false },
      )
      if (!inbound?.capability) return false
      return await this.sendCapability(
        deviceId,
        this.capabilityStore.encodeCapability(inbound.capability),
      )
    } catch {
      return false
    }
  }

  private async refreshRoutePair(remoteIdentityId: string): Promise<void> {
    if (!this.authenticatedDeviceFor(remoteIdentityId)) return
    await this.announceInboundCapability(remoteIdentityId)
    const deadline = Date.now() + ROUTE_PAIR_WAIT_MS
    while (
      Date.now() < deadline
      && !this.capabilityStore.getRoutePair(remoteIdentityId)
    ) {
      await sleep(ROUTE_PAIR_POLL_MS)
    }
  }

  private async resendAfterReceiptTimeout(
    remoteIdentityId: string,
    message: EncryptedMessage,
    localMessageId: string,
    diagnosticOperation: number,
    recordStage: (
      stage: Parameters<typeof recordBLEMessageDiagnosticStage>[2],
    ) => void,
    recordFailure: (
      failure: Parameters<typeof recordBLEMessageDiagnosticFailure>[2],
    ) => void,
  ): Promise<{ success: boolean; stored: boolean; error?: string } | null> {
    if (!this.authenticatedDeviceFor(remoteIdentityId)) return null
    await this.announceInboundCapability(remoteIdentityId)
    await sleep(ROUTE_CAPABILITY_RESYNC_MS)
    const pair = this.capabilityStore.getRoutePair(remoteIdentityId)
    if (!pair) return null
    if (
      this.pendingReceipts.size + this.pendingReceiptReservations
      >= MAX_PENDING_RECEIPTS
    ) return null

    this.pendingReceiptReservations += 1
    const now = Date.now()
    const expiresAt = Math.min(
      pair.forward.expiresAt,
      pair.return.expiresAt,
      now + (
        this.storeForwardEnabled
          ? this.storeForwardTTLMs
          : ONLINE_ENVELOPE_LIFETIME_MS
      ),
    )
    if (expiresAt <= now + 1_000) {
      this.pendingReceiptReservations -= 1
      return null
    }
    let envelope: BleRouteEnvelope
    try {
      envelope = createBleRouteEnvelope({
        payloadType: BlePayloadType.ChatCiphertext,
        flags: BleRouteFlags.AcceptanceReceiptRequired
          | (this.storeForwardEnabled ? BleRouteFlags.StoreForward : BleRouteFlags.None),
        maxHops: this.maxHops,
        issuedAt: now,
        expiresAt,
        payload: encodeBLEEncryptedMessage(message),
      }, pair.forward, pair.return, now)
    } catch {
      this.pendingReceiptReservations -= 1
      return null
    }
    const encodedEnvelope = encodeBleRouteEnvelope(envelope)
    let correlationRecorded = false
    try {
      correlationRecorded = await this.capabilityStore.recordOutboundCorrelation({
        envelope,
        returnCapability: pair.return,
        localMessageId,
        remoteIdentityId,
        now,
      })
    } catch {
      correlationRecorded = false
    }
    this.publishStoreDeliveryEvents()
    if (!correlationRecorded) {
      this.pendingReceiptReservations -= 1
      return null
    }
    const receiptPromise = this.waitForReceipt(
      remoteIdentityId,
      envelope,
      diagnosticOperation,
    )
    this.pendingReceiptReservations -= 1
    recordStage('transmitting')
    let sent: boolean
    try {
      sent = await this.sendInitialRoute(remoteIdentityId, envelope, encodedEnvelope)
    } catch {
      this.cancelReceipt(envelope.envelopeId)
      if ((await receiptPromise) === 'accepted') {
        recordStage('receipt_received')
        this.totalSent += 1
        return { success: true, stored: false }
      }
      await this.failOutbound(envelope.envelopeId, 'transmission_failed')
      recordFailure('message_transmission_failed')
      return { success: false, stored: false, error: 'BLE message transmission failed' }
    }
    if (!sent) {
      this.cancelReceipt(envelope.envelopeId)
      await receiptPromise
      await this.failOutbound(envelope.envelopeId, 'transmission_failed')
      return {
        success: false,
        stored: false,
        error: 'No authenticated BLE route',
      }
    }
    recordStage('transmitted')
    this.armReceiptTimeout(envelope.envelopeId)
    recordStage('awaiting_receipt')
    this.totalSent += 1
    if ((await receiptPromise) === 'accepted') {
      recordStage('receipt_received')
      return { success: true, stored: false }
    }
    const stored = await this.storeForForward(envelope, encodedEnvelope, 0, envelope.maxHops)
    if (!stored) await this.failOutbound(envelope.envelopeId, 'receipt_timeout')
    recordFailure('receipt_timeout')
    return stored
      ? { success: false, stored: true }
      : { success: false, stored: false, error: 'BLE acceptance receipt timed out' }
  }

  private sendWire(
    deviceId: string,
    wire: WireMessage,
  ): Promise<boolean> {
    const frames = encodeDirectDataFrames({
      message: encodeWire(wire),
      maxFramePayload: BLE_SECURE_LINK_PAYLOAD_BYTES,
    })
    return this.sendFrames(deviceId, frames)
  }

  private async sendFrames(deviceId: string, frames: Uint8Array[]): Promise<boolean> {
    for (const frame of frames) {
      if (!(await this.linkManager.send(deviceId, frame))) return false
    }
    return true
  }

  private async storeForForward(
    envelope: BleRouteEnvelope,
    encodedEnvelope: Uint8Array,
    hopCount: number,
    ttl: number,
  ): Promise<boolean> {
    if (!this.storeForwardEnabled || ttl < 1) return false
    let stored: boolean
    try {
      stored = await this.capabilityStore.queueEnvelope({
        envelope,
        encoded: encodedEnvelope,
        hopCount,
        ttl,
        maxMessages: this.storeForwardMaxMessages,
      })
    } catch {
      return false
    }
    try {
      if (stored) {
        await this.capabilityStore.markOutboundStored(envelope.envelopeId)
      } else {
        await this.capabilityStore.markOutboundFailed(
          envelope.envelopeId,
          'queue_full',
        )
      }
    } catch {
      // Startup reconciliation repairs a queued pending correlation.
    }
    this.publishStoreDeliveryEvents()
    return stored
  }

  private async failOutbound(
    envelopeId: Uint8Array,
    reason: 'transmission_failed' | 'receipt_timeout',
  ): Promise<void> {
    try {
      await this.capabilityStore.markOutboundFailed(envelopeId, reason)
    } catch {
      // The send result remains authoritative for this attempt.
    }
    this.publishStoreDeliveryEvents()
  }

  private publishStoreDeliveryEvents(): void {
    for (const event of this.capabilityStore.drainOutboundDeliveryEvents()) {
      this.publishDeliveryEvent(event)
    }
  }

  private publishDeliveryEvent(event: BLEOutboundDeliveryEvent): void {
    const snapshot = { ...event }
    this.deliveryCallbackChain = this.deliveryCallbackChain
      .catch(() => {})
      .then(() => this.onDelivery(snapshot))
      .then(() => undefined, () => undefined)
  }

  private isDuplicate(key: string, now: number = Date.now()): boolean {
    this.cleanupDedup(now)
    if (this.dedup.has(key)) return true
    this.dedup.set(key, now)
    while (this.dedup.size >= MAX_DEDUP_ENTRIES) {
      const oldest = this.dedup.keys().next().value
      if (typeof oldest !== 'string') break
      this.dedup.delete(oldest)
    }
    return false
  }

  private cleanupDedup(now: number): void {
    for (const [key, receivedAt] of this.dedup) {
      if (now - receivedAt > DEDUP_TTL_MS) this.dedup.delete(key)
    }
  }
}
