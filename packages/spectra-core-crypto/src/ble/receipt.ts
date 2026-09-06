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
  stringToBytes,
} from '../crypto/utils'
import {
  BLE_V2_ACCEPTANCE_RECEIPT_BYTES,
  BLE_V2_ACCEPTANCE_RECEIPT_MAGIC,
  BLE_V2_ACCEPTANCE_RECEIPT_PURPOSE,
  BLE_V2_ENVELOPE_ID_BYTES,
  BLE_V2_HASH_BYTES,
  BLE_V2_HMAC_BYTES,
  BLE_V2_MAX_ENVELOPE_LIFETIME_MS,
  BLE_V2_PROTOCOL_VERSION,
  BLE_V2_ROUTE_ID_BYTES,
  BleAcceptanceStatus,
} from './constants'
import {
  assertByteLength,
  assertCurrentlyValid,
  assertNonZeroBytes,
  assertTimeWindow,
  assertU32,
  BleBinaryReader,
  BleBinaryWriter,
} from './binary'
import {
  deriveBleCacheDeletionPreimage,
  deriveBleRouteMacKey,
  verifyBleCacheDeletionPreimage,
} from './routeCapability'
import {
  assertCapabilityRoute,
  verifyBleRouteEnvelope,
} from './routeEnvelope'
import type {
  BleAcceptanceReceipt,
  BleRouteCapability,
  BleRouteEnvelope,
} from './types'

const ACCEPTANCE_RECEIPT_PREFIX_BYTES =
  BLE_V2_ACCEPTANCE_RECEIPT_BYTES - BLE_V2_HMAC_BYTES

export function createBleAcceptanceReceipt(
  envelope: BleRouteEnvelope,
  forwardCapability: BleRouteCapability,
  returnCapability: BleRouteCapability,
  acceptedAt: number = Date.now(),
): BleAcceptanceReceipt {
  if (!verifyBleRouteEnvelope(envelope, forwardCapability, returnCapability, acceptedAt)) {
    throw new Error('BLE route envelope authentication is invalid')
  }
  if (acceptedAt >= envelope.expiresAt) {
    throw new Error('BLE route envelope has expired')
  }
  const receipt: BleAcceptanceReceipt = {
    version: BLE_V2_PROTOCOL_VERSION,
    status: BleAcceptanceStatus.Accepted,
    envelopeId: envelope.envelopeId.slice(),
    routeId: returnCapability.routeId.slice(),
    routeEpoch: returnCapability.routeEpoch,
    forwardRouteId: forwardCapability.routeId.slice(),
    forwardRouteEpoch: forwardCapability.routeEpoch,
    payloadHash: envelope.payloadHash.slice(),
    cacheDeletionPreimage: deriveBleCacheDeletionPreimage(
      forwardCapability,
      envelope.envelopeId,
      envelope.payloadHash,
    ),
    acceptedAt,
    expiresAt: envelope.expiresAt,
    authTag: new Uint8Array(BLE_V2_HMAC_BYTES),
  }
  receipt.authTag = computeBleAcceptanceReceiptAuthTag(receipt, returnCapability)
  return receipt
}

export function encodeBleAcceptanceReceipt(receipt: BleAcceptanceReceipt): Uint8Array {
  assertBleAcceptanceReceipt(receipt)
  return concatBytes(encodeAcceptanceReceiptPrefix(receipt), receipt.authTag)
}

export function decodeBleAcceptanceReceipt(data: Uint8Array): BleAcceptanceReceipt {
  if (!(data instanceof Uint8Array) || data.length !== BLE_V2_ACCEPTANCE_RECEIPT_BYTES) {
    throw new Error('BLE acceptance receipt length is invalid')
  }
  const reader = new BleBinaryReader(data)
  if (reader.readU32() !== BLE_V2_ACCEPTANCE_RECEIPT_MAGIC) {
    throw new Error('BLE acceptance receipt magic is invalid')
  }
  const version = reader.readU8()
  const status = reader.readU8()
  if (reader.readU8() !== 0 || reader.readU8() !== 0) {
    throw new Error('BLE acceptance receipt reserved fields are invalid')
  }
  const receipt: BleAcceptanceReceipt = {
    version: version as typeof BLE_V2_PROTOCOL_VERSION,
    status,
    envelopeId: reader.readBytes(BLE_V2_ENVELOPE_ID_BYTES),
    routeId: reader.readBytes(BLE_V2_ROUTE_ID_BYTES),
    routeEpoch: reader.readU32(),
    forwardRouteId: reader.readBytes(BLE_V2_ROUTE_ID_BYTES),
    forwardRouteEpoch: reader.readU32(),
    payloadHash: reader.readBytes(BLE_V2_HASH_BYTES),
    cacheDeletionPreimage: reader.readBytes(BLE_V2_HASH_BYTES),
    acceptedAt: reader.readU64(),
    expiresAt: reader.readU64(),
    authTag: reader.readBytes(BLE_V2_HMAC_BYTES),
  }
  reader.finish()
  assertBleAcceptanceReceipt(receipt)
  return receipt
}

export function computeBleAcceptanceReceiptAuthTag(
  receipt: BleAcceptanceReceipt,
  returnCapability: BleRouteCapability,
): Uint8Array {
  assertBleAcceptanceReceipt(receipt)
  assertCapabilityRoute(returnCapability, receipt.routeId, receipt.routeEpoch, 'return')
  return hmac(
    sha256,
    deriveBleRouteMacKey(returnCapability),
    concatBytes(
      stringToBytes(BLE_V2_ACCEPTANCE_RECEIPT_PURPOSE),
      encodeAcceptanceReceiptPrefix(receipt),
    ),
  )
}

export function verifyBleAcceptanceReceipt(
  receipt: BleAcceptanceReceipt,
  envelope: BleRouteEnvelope,
  returnCapability: BleRouteCapability,
  now: number = Date.now(),
): boolean {
  try {
    assertBleAcceptanceReceipt(receipt)
    assertCapabilityRoute(returnCapability, receipt.routeId, receipt.routeEpoch, 'return')
    assertCurrentlyValid(
      returnCapability.issuedAt,
      returnCapability.expiresAt,
      now,
      'BLE return route capability',
    )
    assertCurrentlyValid(receipt.acceptedAt, receipt.expiresAt, now, 'BLE acceptance receipt')
    if (receipt.acceptedAt < returnCapability.issuedAt
      || receipt.expiresAt > returnCapability.expiresAt
      || receipt.acceptedAt < envelope.issuedAt
      || receipt.expiresAt !== envelope.expiresAt
      || receipt.forwardRouteEpoch !== envelope.routeEpoch
      || receipt.routeEpoch !== envelope.returnRouteEpoch
      || !constantTimeEqual(receipt.envelopeId, envelope.envelopeId)
      || !constantTimeEqual(receipt.routeId, envelope.returnRouteId)
      || !constantTimeEqual(receipt.forwardRouteId, envelope.routeId)
      || !constantTimeEqual(receipt.payloadHash, envelope.payloadHash)
      || !verifyBleCacheDeletionPreimage(
        envelope.cacheDeletionHash,
        receipt.cacheDeletionPreimage,
      )) {
      return false
    }
    return constantTimeEqual(
      receipt.authTag,
      computeBleAcceptanceReceiptAuthTag(receipt, returnCapability),
    )
  } catch {
    return false
  }
}

export function assertBleAcceptanceReceipt(receipt: BleAcceptanceReceipt): void {
  if (!receipt || receipt.version !== BLE_V2_PROTOCOL_VERSION) {
    throw new Error('BLE acceptance receipt version is not supported')
  }
  if (receipt.status !== BleAcceptanceStatus.Accepted) {
    throw new Error('BLE acceptance receipt status is invalid')
  }
  assertByteLength(receipt.envelopeId, BLE_V2_ENVELOPE_ID_BYTES, 'BLE envelope ID')
  assertNonZeroBytes(receipt.envelopeId, 'BLE envelope ID')
  assertByteLength(receipt.routeId, BLE_V2_ROUTE_ID_BYTES, 'BLE return route ID')
  assertNonZeroBytes(receipt.routeId, 'BLE return route ID')
  assertU32(receipt.routeEpoch, 'BLE return route epoch', false)
  assertByteLength(receipt.forwardRouteId, BLE_V2_ROUTE_ID_BYTES, 'BLE forward route ID')
  assertNonZeroBytes(receipt.forwardRouteId, 'BLE forward route ID')
  assertU32(receipt.forwardRouteEpoch, 'BLE forward route epoch', false)
  assertByteLength(receipt.payloadHash, BLE_V2_HASH_BYTES, 'BLE payload hash')
  assertByteLength(
    receipt.cacheDeletionPreimage,
    BLE_V2_HASH_BYTES,
    'BLE cache-deletion preimage',
  )
  assertTimeWindow(
    receipt.acceptedAt,
    receipt.expiresAt,
    BLE_V2_MAX_ENVELOPE_LIFETIME_MS,
    'BLE acceptance receipt',
  )
  assertByteLength(receipt.authTag, BLE_V2_HMAC_BYTES, 'BLE receipt authentication tag')
}

function encodeAcceptanceReceiptPrefix(receipt: BleAcceptanceReceipt): Uint8Array {
  const writer = new BleBinaryWriter(ACCEPTANCE_RECEIPT_PREFIX_BYTES)
  writer.writeU32(BLE_V2_ACCEPTANCE_RECEIPT_MAGIC)
  writer.writeU8(receipt.version)
  writer.writeU8(receipt.status)
  writer.writeU8(0)
  writer.writeU8(0)
  writer.writeBytes(receipt.envelopeId)
  writer.writeBytes(receipt.routeId)
  writer.writeU32(receipt.routeEpoch)
  writer.writeBytes(receipt.forwardRouteId)
  writer.writeU32(receipt.forwardRouteEpoch)
  writer.writeBytes(receipt.payloadHash)
  writer.writeBytes(receipt.cacheDeletionPreimage)
  writer.writeU64(receipt.acceptedAt)
  writer.writeU64(receipt.expiresAt)
  return writer.finish()
}
