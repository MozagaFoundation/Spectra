/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha256'
import {
  concatBytes,
  constantTimeEqual,
  generateRandomBytes,
  stringToBytes,
} from '../crypto/utils'
import {
  BLE_V2_ENVELOPE_ID_BYTES,
  BLE_V2_HASH_BYTES,
  BLE_V2_HMAC_BYTES,
  BLE_V2_MAX_PAYLOAD_BYTES,
  BLE_V2_PROTOCOL_VERSION,
  BLE_V2_ROUTE_ENVELOPE_FIXED_BYTES,
  BLE_V2_ROUTE_ENVELOPE_MAGIC,
  BLE_V2_ROUTE_ENVELOPE_PURPOSE,
  BLE_V2_ROUTE_ID_BYTES,
} from './constants'
import {
  assertByteLength,
  assertCurrentlyValid,
  assertNonZeroBytes,
  assertRouteFields,
  assertU32,
  BleBinaryReader,
  BleBinaryWriter,
} from './binary'
import {
  assertBleRouteCapability,
  deriveBleCacheDeletionPreimage,
  deriveBleRouteMacKey,
  hashBleCacheDeletionPreimage,
} from './routeCapability'
import type {
  BleRouteCapability,
  BleRouteEnvelope,
  BleRouteEnvelopeInput,
} from './types'

const ROUTE_ENVELOPE_PREFIX_BYTES = BLE_V2_ROUTE_ENVELOPE_FIXED_BYTES - BLE_V2_HMAC_BYTES

export function generateBleEnvelopeId(): Uint8Array {
  let envelopeId: Uint8Array
  do {
    envelopeId = generateRandomBytes(BLE_V2_ENVELOPE_ID_BYTES)
  } while (envelopeId.every(byte => byte === 0))
  return envelopeId
}

export function createBleRouteEnvelope(
  input: BleRouteEnvelopeInput,
  forwardCapability: BleRouteCapability,
  returnCapability: BleRouteCapability,
  now: number = Date.now(),
): BleRouteEnvelope {
  assertBleRouteCapability(forwardCapability)
  assertBleRouteCapability(returnCapability)
  const envelopeId = input.envelopeId?.slice() ?? generateBleEnvelopeId()
  const payload = input.payload.slice()
  assertRouteFields(
    BLE_V2_PROTOCOL_VERSION,
    input.payloadType,
    input.flags,
    input.maxHops,
    input.issuedAt,
    input.expiresAt,
  )
  assertByteLength(envelopeId, BLE_V2_ENVELOPE_ID_BYTES, 'BLE envelope ID')
  assertPayloadLength(payload.length)
  assertCapabilitiesCoverEnvelope(
    forwardCapability,
    returnCapability,
    input.issuedAt,
    input.expiresAt,
    now,
  )

  const payloadHash = sha256(payload)
  const cacheDeletionHash = hashBleCacheDeletionPreimage(
    deriveBleCacheDeletionPreimage(forwardCapability, envelopeId, payloadHash),
  )
  const envelope: BleRouteEnvelope = {
    version: BLE_V2_PROTOCOL_VERSION,
    payloadType: input.payloadType,
    flags: input.flags,
    maxHops: input.maxHops,
    envelopeId,
    routeId: forwardCapability.routeId.slice(),
    routeEpoch: forwardCapability.routeEpoch,
    returnRouteId: returnCapability.routeId.slice(),
    returnRouteEpoch: returnCapability.routeEpoch,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    payload,
    payloadHash,
    cacheDeletionHash,
    authTag: new Uint8Array(BLE_V2_HMAC_BYTES),
  }
  envelope.authTag = computeBleRouteEnvelopeAuthTag(envelope, forwardCapability)
  return envelope
}

export function encodeBleRouteEnvelope(envelope: BleRouteEnvelope): Uint8Array {
  assertBleRouteEnvelope(envelope)
  const prefix = encodeRouteEnvelopePrefix(envelope)
  return concatBytes(prefix, envelope.payload, envelope.authTag)
}

export function decodeBleRouteEnvelope(data: Uint8Array): BleRouteEnvelope {
  if (!(data instanceof Uint8Array) || data.length < BLE_V2_ROUTE_ENVELOPE_FIXED_BYTES) {
    throw new Error('BLE route envelope length is invalid')
  }
  const reader = new BleBinaryReader(data)
  if (reader.readU32() !== BLE_V2_ROUTE_ENVELOPE_MAGIC) {
    throw new Error('BLE route envelope magic is invalid')
  }
  const version = reader.readU8()
  const payloadType = reader.readU8()
  const flags = reader.readU8()
  const maxHops = reader.readU8()
  const envelopeId = reader.readBytes(BLE_V2_ENVELOPE_ID_BYTES)
  const routeId = reader.readBytes(BLE_V2_ROUTE_ID_BYTES)
  const routeEpoch = reader.readU32()
  const returnRouteId = reader.readBytes(BLE_V2_ROUTE_ID_BYTES)
  const returnRouteEpoch = reader.readU32()
  const issuedAt = reader.readU64()
  const expiresAt = reader.readU64()
  const payloadLength = reader.readU32()
  assertPayloadLength(payloadLength)
  if (data.length !== BLE_V2_ROUTE_ENVELOPE_FIXED_BYTES + payloadLength) {
    throw new Error('BLE route envelope payload length does not match input')
  }
  const payloadHash = reader.readBytes(BLE_V2_HASH_BYTES)
  const cacheDeletionHash = reader.readBytes(BLE_V2_HASH_BYTES)
  const payload = reader.readBytes(payloadLength)
  const authTag = reader.readBytes(BLE_V2_HMAC_BYTES)
  reader.finish()

  const envelope: BleRouteEnvelope = {
    version: version as typeof BLE_V2_PROTOCOL_VERSION,
    payloadType,
    flags,
    maxHops,
    envelopeId,
    routeId,
    routeEpoch,
    returnRouteId,
    returnRouteEpoch,
    issuedAt,
    expiresAt,
    payload,
    payloadHash,
    cacheDeletionHash,
    authTag,
  }
  assertBleRouteEnvelope(envelope)
  if (!constantTimeEqual(payloadHash, sha256(payload))) {
    throw new Error('BLE route envelope payload hash is invalid')
  }
  return envelope
}

export function computeBleRouteEnvelopeAuthTag(
  envelope: BleRouteEnvelope,
  forwardCapability: BleRouteCapability,
): Uint8Array {
  assertBleRouteEnvelope(envelope)
  assertCapabilityRoute(forwardCapability, envelope.routeId, envelope.routeEpoch, 'forward')
  return hmac(
    sha256,
    deriveBleRouteMacKey(forwardCapability),
    concatBytes(
      stringToBytes(BLE_V2_ROUTE_ENVELOPE_PURPOSE),
      encodeRouteEnvelopePrefix(envelope),
    ),
  )
}

export function verifyBleRouteEnvelope(
  envelope: BleRouteEnvelope,
  forwardCapability: BleRouteCapability,
  returnCapability: BleRouteCapability,
  now: number = Date.now(),
): boolean {
  try {
    assertBleRouteEnvelope(envelope)
    assertCapabilityRoute(forwardCapability, envelope.routeId, envelope.routeEpoch, 'forward')
    assertCapabilityRoute(
      returnCapability,
      envelope.returnRouteId,
      envelope.returnRouteEpoch,
      'return',
    )
    assertCapabilitiesCoverEnvelope(
      forwardCapability,
      returnCapability,
      envelope.issuedAt,
      envelope.expiresAt,
      now,
    )
    assertCurrentlyValid(envelope.issuedAt, envelope.expiresAt, now, 'BLE route envelope')
    if (!constantTimeEqual(envelope.payloadHash, sha256(envelope.payload))) {
      return false
    }
    const expectedDeletionHash = hashBleCacheDeletionPreimage(
      deriveBleCacheDeletionPreimage(
        forwardCapability,
        envelope.envelopeId,
        envelope.payloadHash,
      ),
    )
    if (!constantTimeEqual(envelope.cacheDeletionHash, expectedDeletionHash)) {
      return false
    }
    return constantTimeEqual(
      envelope.authTag,
      computeBleRouteEnvelopeAuthTag(envelope, forwardCapability),
    )
  } catch {
    return false
  }
}

export function assertBleRouteEnvelope(envelope: BleRouteEnvelope): void {
  if (!envelope) {
    throw new Error('BLE route envelope is required')
  }
  assertRouteFields(
    envelope.version,
    envelope.payloadType,
    envelope.flags,
    envelope.maxHops,
    envelope.issuedAt,
    envelope.expiresAt,
  )
  assertByteLength(envelope.envelopeId, BLE_V2_ENVELOPE_ID_BYTES, 'BLE envelope ID')
  assertNonZeroBytes(envelope.envelopeId, 'BLE envelope ID')
  assertByteLength(envelope.routeId, BLE_V2_ROUTE_ID_BYTES, 'BLE forward route ID')
  assertNonZeroBytes(envelope.routeId, 'BLE forward route ID')
  assertU32(envelope.routeEpoch, 'BLE forward route epoch', false)
  assertByteLength(envelope.returnRouteId, BLE_V2_ROUTE_ID_BYTES, 'BLE return route ID')
  assertNonZeroBytes(envelope.returnRouteId, 'BLE return route ID')
  assertU32(envelope.returnRouteEpoch, 'BLE return route epoch', false)
  assertPayloadLength(envelope.payload.length)
  assertByteLength(envelope.payloadHash, BLE_V2_HASH_BYTES, 'BLE payload hash')
  assertByteLength(
    envelope.cacheDeletionHash,
    BLE_V2_HASH_BYTES,
    'BLE cache-deletion hash',
  )
  assertByteLength(envelope.authTag, BLE_V2_HMAC_BYTES, 'BLE route authentication tag')
}

export function assertCapabilityRoute(
  capability: BleRouteCapability,
  routeId: Uint8Array,
  routeEpoch: number,
  label: string,
): void {
  assertBleRouteCapability(capability)
  if (!constantTimeEqual(capability.routeId, routeId)
    || capability.routeEpoch !== routeEpoch) {
    throw new Error(`BLE ${label} route capability does not match`)
  }
}

function encodeRouteEnvelopePrefix(envelope: BleRouteEnvelope): Uint8Array {
  const writer = new BleBinaryWriter(ROUTE_ENVELOPE_PREFIX_BYTES)
  writer.writeU32(BLE_V2_ROUTE_ENVELOPE_MAGIC)
  writer.writeU8(envelope.version)
  writer.writeU8(envelope.payloadType)
  writer.writeU8(envelope.flags)
  writer.writeU8(envelope.maxHops)
  writer.writeBytes(envelope.envelopeId)
  writer.writeBytes(envelope.routeId)
  writer.writeU32(envelope.routeEpoch)
  writer.writeBytes(envelope.returnRouteId)
  writer.writeU32(envelope.returnRouteEpoch)
  writer.writeU64(envelope.issuedAt)
  writer.writeU64(envelope.expiresAt)
  writer.writeU32(envelope.payload.length)
  writer.writeBytes(envelope.payloadHash)
  writer.writeBytes(envelope.cacheDeletionHash)
  return writer.finish()
}

function assertCapabilitiesCoverEnvelope(
  forwardCapability: BleRouteCapability,
  returnCapability: BleRouteCapability,
  issuedAt: number,
  expiresAt: number,
  now: number,
): void {
  assertCurrentlyValid(
    forwardCapability.issuedAt,
    forwardCapability.expiresAt,
    now,
    'BLE forward route capability',
  )
  assertCurrentlyValid(
    returnCapability.issuedAt,
    returnCapability.expiresAt,
    now,
    'BLE return route capability',
  )
  if (issuedAt < forwardCapability.issuedAt || expiresAt > forwardCapability.expiresAt
    || issuedAt < returnCapability.issuedAt || expiresAt > returnCapability.expiresAt) {
    throw new Error('BLE route capability does not cover the envelope validity window')
  }
}

function assertPayloadLength(length: number): void {
  if (!Number.isSafeInteger(length) || length < 1 || length > BLE_V2_MAX_PAYLOAD_BYTES) {
    throw new Error('BLE route payload length is invalid')
  }
}
