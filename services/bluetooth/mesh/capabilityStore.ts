/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  base64ToBytes,
  bytesToBase64,
  createBleRouteCapability,
  decodeBleRouteCapability,
  decodeBleRouteEnvelope,
  encodeBleRouteCapability,
  encodeBleRouteEnvelope,
  sha256Hash,
  hexToBytes,
  verifyBleAcceptanceReceipt,
  verifyBleCacheDeletionPreimage,
  type BleAcceptanceReceipt,
  type BleRouteCapability,
  type BleRouteEnvelope,
} from '@spectra/core-crypto'
import {
  loadBleMeshState,
  MAX_BLE_OUTBOUND_CORRELATIONS,
  MAX_BLE_OUTBOUND_CORRELATION_BYTES,
  saveBleMeshState,
  type BleMeshPersistedState,
  type PersistedBleOutboundCorrelation,
  type PersistedBleOutboundFailureReason,
  type PersistedBleRouteCapability,
} from '@/services/storage/bleMeshStorage'
import type { BLEOutboundDeliveryEvent } from '../types'

const CAPABILITY_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
const ROTATE_BEFORE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_QUEUED_BYTES = 2 * 1024 * 1024
const MAX_QUEUE_ATTEMPTS = 8
const MAX_REPLAY_ENTRIES = 4096
const REPLAY_TTL_MS = 24 * 60 * 60 * 1000
const TERMINAL_CORRELATION_RETENTION_MS = 24 * 60 * 60 * 1000

function senderBinding(identityId: string): Uint8Array {
  return hexToBytes(sha256Hash(new TextEncoder().encode(identityId)))
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index]
  }
  return diff === 0
}

function restoreCapability(
  record: PersistedBleRouteCapability,
  localIdentityId: string,
): BleRouteCapability {
  return {
    version: 2,
    routeId: base64ToBytes(record.routeId),
    routeEpoch: record.epoch,
    senderBinding: senderBinding(
      record.direction === 'outbound'
        ? localIdentityId
        : record.remoteIdentityId,
    ),
    secret: base64ToBytes(record.secret),
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
  }
}

function persistCapability(
  remoteIdentityId: string,
  direction: PersistedBleRouteCapability['direction'],
  capability: BleRouteCapability,
): PersistedBleRouteCapability {
  return {
    remoteIdentityId,
    routeId: bytesToBase64(capability.routeId),
    secret: bytesToBase64(capability.secret),
    epoch: capability.routeEpoch,
    issuedAt: capability.issuedAt,
    expiresAt: capability.expiresAt,
    direction,
  }
}

export class BLECapabilityStore {
  private readonly walletScope: string
  private readonly localIdentityId: string
  private state: BleMeshPersistedState
  private saveChain: Promise<void> = Promise.resolve()
  private readonly deliveryEvents: BLEOutboundDeliveryEvent[] = []
  private readonly stagedDeliveryEvents: BLEOutboundDeliveryEvent[] = []

  private constructor(options: {
    walletScope: string
    localIdentityId: string
    state: BleMeshPersistedState
  }) {
    this.walletScope = options.walletScope
    this.localIdentityId = options.localIdentityId
    this.state = options.state
  }

  static async open(options: {
    walletScope: string
    localIdentityId: string
  }): Promise<BLECapabilityStore> {
    return new BLECapabilityStore({
      ...options,
      state: await loadBleMeshState(options.walletScope),
    })
  }

  async ensureInboundCapability(
    remoteIdentityId: string,
    now: number = Date.now(),
    options?: { rotateExpiring?: boolean },
  ): Promise<{ capability: BleRouteCapability; rotated: boolean }> {
    const rotateExpiring = options?.rotateExpiring !== false
    const existingRecord = this.find(remoteIdentityId, 'inbound')
    if (existingRecord) {
      try {
        const existing = restoreCapability(existingRecord, this.localIdentityId)
        const remaining = existing.expiresAt - now
        if (remaining > 0 && (!rotateExpiring || remaining > ROTATE_BEFORE_MS)) {
          return { capability: existing, rotated: false }
        }
      } catch {
        this.remove(remoteIdentityId, 'inbound')
      }
    }

    const nextEpoch = Math.max(0, existingRecord?.epoch ?? 0) + 1
    const capability = createBleRouteCapability(
      senderBinding(remoteIdentityId),
      nextEpoch,
      now,
      now + CAPABILITY_LIFETIME_MS,
    )
    this.replace(
      persistCapability(remoteIdentityId, 'inbound', capability),
    )
    await this.save()
    return { capability, rotated: true }
  }

  async acceptOutboundCapability(
    remoteIdentityId: string,
    encoded: Uint8Array,
    now: number = Date.now(),
    options?: { fromAuthenticatedLink?: boolean },
  ): Promise<boolean> {
    try {
      const capability = decodeBleRouteCapability(encoded)
      if (
        !sameBytes(capability.senderBinding, senderBinding(this.localIdentityId))
        || capability.issuedAt > now + 5 * 60 * 1000
        || capability.expiresAt <= now
      ) {
        return false
      }
      const existingRecord = this.find(remoteIdentityId, 'outbound')
      if (existingRecord) {
        const existing = restoreCapability(existingRecord, this.localIdentityId)
        const sameCapability = sameBytes(capability.routeId, existing.routeId)
          && sameBytes(capability.secret, existing.secret)
          && capability.routeEpoch === existing.routeEpoch
        if (sameCapability) return true
        if (!options?.fromAuthenticatedLink) {
          if (capability.routeEpoch < existing.routeEpoch) return false
          if (capability.routeEpoch === existing.routeEpoch) return false
        }
      }
      this.replace(
        persistCapability(remoteIdentityId, 'outbound', capability),
      )
      await this.save()
      return true
    } catch {
      return false
    }
  }

  getRoutePair(remoteIdentityId: string, now: number = Date.now()): {
    forward: BleRouteCapability
    return: BleRouteCapability
  } | null {
    try {
      const outboundRecord = this.find(remoteIdentityId, 'outbound')
      const inboundRecord = this.find(remoteIdentityId, 'inbound')
      if (!outboundRecord || !inboundRecord) return null
      const forward = restoreCapability(outboundRecord, this.localIdentityId)
      const returnCapability = restoreCapability(inboundRecord, this.localIdentityId)
      if (forward.expiresAt <= now || returnCapability.expiresAt <= now) return null
      return { forward, return: returnCapability }
    } catch {
      return null
    }
  }

  encodeForDelivery(capability: BleRouteCapability): string {
    return bytesToBase64(encodeBleRouteCapability(capability))
  }

  encodeCapability(capability: BleRouteCapability): Uint8Array {
    return encodeBleRouteCapability(capability)
  }

  async recordOutboundCorrelation(options: {
    envelope: BleRouteEnvelope
    returnCapability: BleRouteCapability
    localMessageId: string
    remoteIdentityId: string
    now?: number
  }): Promise<boolean> {
    const now = options.now ?? Date.now()
    if (
      !options.localMessageId
      || options.localMessageId.length > 512
      || !options.remoteIdentityId
      || options.remoteIdentityId.length > 512
    ) return false

    await this.cleanupQueue(now)
    const envelopeId = bytesToBase64(options.envelope.envelopeId)
    const existing = this.findOutboundCorrelation(envelopeId)
    if (existing) {
      return existing.localMessageId === options.localMessageId
        && existing.remoteIdentityId === options.remoteIdentityId
    }
    const existingByMessage = this.state.outboundCorrelations.find(
      (record) => record.localMessageId === options.localMessageId,
    )
    if (existingByMessage) {
      if (
        existingByMessage.state === 'delivered'
        || existingByMessage.state === 'stored'
      ) return false
      this.state.outboundCorrelations = this.state.outboundCorrelations.filter(
        (record) => record !== existingByMessage,
      )
    }

    const sequence = this.state.outboundDeliverySequence + 1
    const record: PersistedBleOutboundCorrelation = {
      version: 1,
      envelopeId,
      localMessageId: options.localMessageId,
      remoteIdentityId: options.remoteIdentityId,
      encodedEnvelope: bytesToBase64(encodeBleRouteEnvelope(options.envelope)),
      encodedReturnCapability: bytesToBase64(
        encodeBleRouteCapability(options.returnCapability),
      ),
      state: 'pending',
      failureReason: null,
      createdAt: now,
      expiresAt: options.envelope.expiresAt,
      updatedAt: now,
      attempts: 0,
      sequence,
    }
    const retained = this.fitOutboundCorrelation(record, now)
    if (!retained) return false

    this.state.outboundCorrelations = [...retained, record]
    this.state.outboundDeliverySequence = sequence
    this.stagedDeliveryEvents.push(this.asDeliveryEvent(record))
    await this.save()
    return true
  }

  async markOutboundStored(
    envelopeId: Uint8Array,
    now: number = Date.now(),
  ): Promise<void> {
    const changed = this.transitionOutbound(
      bytesToBase64(envelopeId),
      'stored',
      null,
      now,
    )
    if (changed) await this.save()
  }

  async markOutboundFailed(
    envelopeId: Uint8Array,
    reason: PersistedBleOutboundFailureReason,
    now: number = Date.now(),
  ): Promise<void> {
    const changed = this.transitionOutbound(
      bytesToBase64(envelopeId),
      'failed',
      reason,
      now,
    )
    if (changed) await this.save()
  }

  async acceptOutboundReceipt(
    receipt: BleAcceptanceReceipt,
    totalHops: number,
    now: number = Date.now(),
  ): Promise<boolean> {
    const record = this.findOutboundCorrelation(bytesToBase64(receipt.envelopeId))
    if (!record) return false
    try {
      const envelope = decodeBleRouteEnvelope(base64ToBytes(record.encodedEnvelope))
      const returnCapability = decodeBleRouteCapability(
        base64ToBytes(record.encodedReturnCapability),
      )
      if (
        totalHops !== envelope.maxHops
        || !verifyBleAcceptanceReceipt(receipt, envelope, returnCapability, now)
      ) return false
      if (record.state === 'delivered') return true
      if (!this.transitionOutbound(record.envelopeId, 'delivered', null, now)) {
        return false
      }
      await this.save()
      return true
    } catch {
      return false
    }
  }

  async reconcileOutbound(
    now: number = Date.now(),
  ): Promise<BLEOutboundDeliveryEvent[]> {
    await this.cleanupQueue(now)
    const queuedIds = new Set(
      this.state.queuedEnvelopes.map((record) => record.envelopeId),
    )
    let changed = false
    for (const record of this.state.outboundCorrelations) {
      if (record.state === 'pending') {
        changed = this.transitionOutbound(
          record.envelopeId,
          queuedIds.has(record.envelopeId) ? 'stored' : 'failed',
          queuedIds.has(record.envelopeId) ? null : 'interrupted',
          now,
        ) || changed
      } else if (record.state === 'stored' && !queuedIds.has(record.envelopeId)) {
        changed = this.transitionOutbound(
          record.envelopeId,
          'failed',
          record.attempts >= MAX_QUEUE_ATTEMPTS
            ? 'max_attempts'
            : record.expiresAt <= now
              ? 'expired'
              : 'interrupted',
          now,
        ) || changed
      }
    }
    if (changed) await this.save()

    this.deliveryEvents.length = 0
    return [...this.state.outboundCorrelations]
      .sort((left, right) => left.sequence - right.sequence)
      .map(
      (record) => this.asDeliveryEvent(record),
      )
  }

  drainOutboundDeliveryEvents(): BLEOutboundDeliveryEvent[] {
    return this.deliveryEvents.splice(0)
  }

  hasOutboundCorrelation(envelopeId: Uint8Array): boolean {
    return Boolean(this.findOutboundCorrelation(bytesToBase64(envelopeId)))
  }

  findInboundRoute(
    routeId: Uint8Array,
    routeEpoch: number,
    now: number = Date.now(),
  ): {
    remoteIdentityId: string
    forward: BleRouteCapability
    return: BleRouteCapability
  } | null {
    for (const record of this.state.capabilities) {
      if (record.direction !== 'inbound' || record.epoch !== routeEpoch) continue
      try {
        const forward = restoreCapability(record, this.localIdentityId)
        if (!sameBytes(forward.routeId, routeId) || forward.expiresAt <= now) continue
        const returnRecord = this.find(record.remoteIdentityId, 'outbound')
        if (!returnRecord) return null
        const returnCapability = restoreCapability(returnRecord, this.localIdentityId)
        if (returnCapability.expiresAt <= now) return null
        return {
          remoteIdentityId: record.remoteIdentityId,
          forward,
          return: returnCapability,
        }
      } catch {
        return null
      }
    }
    return null
  }

  async queueEnvelope(options: {
    envelope: BleRouteEnvelope
    encoded: Uint8Array
    hopCount: number
    ttl: number
    maxMessages: number
    now?: number
  }): Promise<boolean> {
    const now = options.now ?? Date.now()
    await this.cleanupQueue(now)
    const envelopeId = bytesToBase64(options.envelope.envelopeId)
    if (this.state.queuedEnvelopes.some((record) => record.envelopeId === envelopeId)) {
      return true
    }
    const maxMessages = Math.max(1, Math.min(500, Math.floor(options.maxMessages)))
    if (
      !Number.isInteger(options.hopCount)
      || !Number.isInteger(options.ttl)
      || options.hopCount < 0
      || options.ttl < 1
      || options.hopCount + options.ttl !== options.envelope.maxHops
    ) {
      return false
    }
    const persisted = new Uint8Array(2 + options.encoded.length)
    persisted[0] = options.hopCount
    persisted[1] = options.ttl
    persisted.set(options.encoded, 2)
    const encoded = bytesToBase64(persisted)
    if (
      this.state.queuedEnvelopes.length >= maxMessages
      || this.queuedBytes() + encoded.length > MAX_QUEUED_BYTES
    ) {
      return false
    }
    this.state.queuedEnvelopes.push({
      envelopeId,
      routeId: bytesToBase64(options.envelope.routeId),
      encoded,
      createdAt: now,
      expiresAt: options.envelope.expiresAt,
      attempts: 0,
      lastAttemptAt: 0,
      deletionTokenHash: bytesToBase64(options.envelope.cacheDeletionHash),
    })
    await this.save()
    return true
  }

  async getQueuedEnvelopes(now: number = Date.now()): Promise<Array<{
    envelope: BleRouteEnvelope
    encoded: Uint8Array
    hopCount: number
    ttl: number
    attempts: number
  }>> {
    await this.cleanupQueue(now)
    const queued: Array<{
      envelope: BleRouteEnvelope
      encoded: Uint8Array
      hopCount: number
      ttl: number
      attempts: number
    }> = []
    let removedCorruptRecord = false
    for (const record of this.state.queuedEnvelopes) {
      try {
        const persisted = base64ToBytes(record.encoded)
        if (persisted.length < 3) throw new Error('BLE queued envelope is truncated')
        const encoded = persisted.slice(2)
        const envelope = decodeBleRouteEnvelope(encoded)
        if (persisted[0] + persisted[1] !== envelope.maxHops) {
          throw new Error('BLE queued envelope hop metadata is invalid')
        }
        queued.push({
          envelope,
          encoded,
          hopCount: persisted[0],
          ttl: persisted[1],
          attempts: record.attempts,
        })
      } catch {
        removedCorruptRecord = true
        this.transitionOutbound(
          record.envelopeId,
          'failed',
          'interrupted',
          now,
        )
        this.state.queuedEnvelopes = this.state.queuedEnvelopes.filter(
          (candidate) => candidate !== record,
        )
      }
    }
    if (removedCorruptRecord) await this.save()
    return queued
  }

  async recordQueueAttempt(envelopeId: Uint8Array, now: number = Date.now()): Promise<void> {
    const encodedId = bytesToBase64(envelopeId)
    const record = this.state.queuedEnvelopes.find(
      (candidate) => candidate.envelopeId === encodedId,
    )
    if (!record) return
    record.attempts += 1
    record.lastAttemptAt = now
    const correlation = this.findOutboundCorrelation(encodedId)
    if (correlation) correlation.attempts = record.attempts
    if (record.attempts >= MAX_QUEUE_ATTEMPTS) {
      this.state.queuedEnvelopes = this.state.queuedEnvelopes.filter(
        (candidate) => candidate !== record,
      )
      this.transitionOutbound(encodedId, 'failed', 'max_attempts', now)
    }
    await this.save()
  }

  async deleteQueuedWithProof(
    envelopeId: Uint8Array,
    deletionPreimage: Uint8Array,
  ): Promise<boolean> {
    const encodedId = bytesToBase64(envelopeId)
    const record = this.state.queuedEnvelopes.find(
      (candidate) => candidate.envelopeId === encodedId,
    )
    if (
      !record
      || !verifyBleCacheDeletionPreimage(
        base64ToBytes(record.deletionTokenHash),
        deletionPreimage,
      )
    ) {
      return false
    }
    this.state.queuedEnvelopes = this.state.queuedEnvelopes.filter(
      (candidate) => candidate !== record,
    )
    await this.save()
    return true
  }

  async checkAndRecordReplay(
    envelopeId: Uint8Array,
    now: number = Date.now(),
  ): Promise<boolean> {
    const encodedId = bytesToBase64(envelopeId)
    this.state.replayEntries = this.state.replayEntries.filter(
      (entry) => now - entry.acceptedAt <= REPLAY_TTL_MS,
    )
    if (this.state.replayEntries.some((entry) => entry.envelopeId === encodedId)) {
      return false
    }
    while (this.state.replayEntries.length >= MAX_REPLAY_ENTRIES) {
      this.state.replayEntries.shift()
    }
    this.state.replayEntries.push({ envelopeId: encodedId, acceptedAt: now })
    await this.save()
    return true
  }

  hasReplay(envelopeId: Uint8Array): boolean {
    const encodedId = bytesToBase64(envelopeId)
    return this.state.replayEntries.some((entry) => entry.envelopeId === encodedId)
  }

  async removeRemote(remoteIdentityId: string): Promise<void> {
    const before = this.state.capabilities.length
    this.state.capabilities = this.state.capabilities.filter(
      (record) => record.remoteIdentityId !== remoteIdentityId,
    )
    if (this.state.capabilities.length !== before) await this.save()
  }

  private find(
    remoteIdentityId: string,
    direction: PersistedBleRouteCapability['direction'],
  ): PersistedBleRouteCapability | undefined {
    return this.state.capabilities.find(
      (record) => record.remoteIdentityId === remoteIdentityId
        && record.direction === direction,
    )
  }

  private replace(record: PersistedBleRouteCapability): void {
    this.remove(record.remoteIdentityId, record.direction)
    this.state.capabilities.push(record)
  }

  private remove(
    remoteIdentityId: string,
    direction: PersistedBleRouteCapability['direction'],
  ): void {
    this.state.capabilities = this.state.capabilities.filter(
      (record) => record.remoteIdentityId !== remoteIdentityId
        || record.direction !== direction,
    )
  }

  private async cleanupQueue(now: number): Promise<void> {
    let changed = false
    this.state.queuedEnvelopes = this.state.queuedEnvelopes.filter((record) => {
      const reason = record.expiresAt <= now
        ? 'expired'
        : record.attempts >= MAX_QUEUE_ATTEMPTS
          ? 'max_attempts'
          : null
      if (!reason) return true
      changed = true
      this.transitionOutbound(record.envelopeId, 'failed', reason, now)
      return false
    })
    changed = this.cleanupOutboundCorrelations(now) || changed
    if (changed) await this.save()
  }

  private queuedBytes(): number {
    return this.state.queuedEnvelopes.reduce(
      (total, record) => total + record.encoded.length,
      0,
    )
  }

  private findOutboundCorrelation(
    envelopeId: string,
  ): PersistedBleOutboundCorrelation | undefined {
    return this.state.outboundCorrelations.find(
      (record) => record.envelopeId === envelopeId,
    )
  }

  private transitionOutbound(
    envelopeId: string,
    state: PersistedBleOutboundCorrelation['state'],
    failureReason: PersistedBleOutboundFailureReason | null,
    now: number,
  ): boolean {
    const record = this.findOutboundCorrelation(envelopeId)
    if (!record || record.state === state || record.state === 'delivered') return false
    const allowed = state === 'delivered'
      || (state === 'stored' && record.state === 'pending')
      || (
        state === 'failed'
        && (record.state === 'pending' || record.state === 'stored')
      )
    if (!allowed) return false

    this.state.outboundDeliverySequence += 1
    record.state = state
    record.failureReason = state === 'failed' ? failureReason : null
    record.updatedAt = now
    record.sequence = this.state.outboundDeliverySequence
    this.stagedDeliveryEvents.push(this.asDeliveryEvent(record))
    return true
  }

  private asDeliveryEvent(
    record: PersistedBleOutboundCorrelation,
  ): BLEOutboundDeliveryEvent {
    return {
      localMessageId: record.localMessageId,
      state: record.state,
      failureReason: record.failureReason,
      attempts: record.attempts,
      expiresAt: record.expiresAt,
      updatedAt: record.updatedAt,
      sequence: record.sequence,
    }
  }

  private fitOutboundCorrelation(
    record: PersistedBleOutboundCorrelation,
    now: number,
  ): PersistedBleOutboundCorrelation[] | null {
    const retained = [...this.state.outboundCorrelations]
    const removable = retained
      .filter((candidate) =>
        candidate.state === 'delivered'
        || (candidate.state === 'failed' && candidate.expiresAt <= now))
      .sort((left, right) => left.updatedAt - right.updatedAt)
    while (
      !this.outboundCorrelationsFit([...retained, record])
      && removable.length > 0
    ) {
      const oldest = removable.shift()!
      const index = retained.indexOf(oldest)
      if (index >= 0) retained.splice(index, 1)
    }
    return this.outboundCorrelationsFit([...retained, record])
      ? retained
      : null
  }

  private outboundCorrelationsFit(
    records: PersistedBleOutboundCorrelation[],
  ): boolean {
    return records.length <= MAX_BLE_OUTBOUND_CORRELATIONS
      && new TextEncoder().encode(JSON.stringify(records)).length
        <= MAX_BLE_OUTBOUND_CORRELATION_BYTES
  }

  private cleanupOutboundCorrelations(now: number): boolean {
    let changed = false
    for (const record of this.state.outboundCorrelations) {
      if (
        (record.state === 'pending' || record.state === 'stored')
        && record.expiresAt <= now
      ) {
        changed = this.transitionOutbound(
          record.envelopeId,
          'failed',
          'expired',
          now,
        ) || changed
      }
    }
    const retained = this.state.outboundCorrelations.filter((record) => {
      const terminal = record.state === 'delivered' || record.state === 'failed'
      const expired = now > Math.max(
        record.expiresAt,
        record.updatedAt + TERMINAL_CORRELATION_RETENTION_MS,
      )
      if (terminal && expired) {
        changed = true
        return false
      }
      return true
    })
    this.state.outboundCorrelations = retained
    return changed
  }

  private save(): Promise<void> {
    const stagedEvents = this.stagedDeliveryEvents.splice(0)
    const operation = this.saveChain
      .catch(() => {})
      .then(() => saveBleMeshState(this.walletScope, this.state))
    this.saveChain = operation
    return operation.then(() => {
      this.deliveryEvents.push(...stagedEvents)
    })
  }
}
