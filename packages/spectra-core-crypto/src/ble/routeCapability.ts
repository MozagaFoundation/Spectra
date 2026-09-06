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
  BLE_V2_CACHE_DELETE_HASH_PURPOSE,
  BLE_V2_CACHE_DELETE_PREIMAGE_PURPOSE,
  BLE_V2_ENVELOPE_ID_BYTES,
  BLE_V2_HASH_BYTES,
  BLE_V2_MAX_ROUTE_CAPABILITY_LIFETIME_MS,
  BLE_V2_PROTOCOL_VERSION,
  BLE_V2_ROUTE_CAPABILITY_BYTES,
  BLE_V2_ROUTE_CAPABILITY_MAGIC,
  BLE_V2_ROUTE_ID_BYTES,
  BLE_V2_ROUTE_MAC_KEY_PURPOSE,
  BLE_V2_ROUTE_SECRET_BYTES,
  BLE_V2_SENDER_BINDING_BYTES,
} from './constants'
import {
  assertByteLength,
  assertNonZeroBytes,
  assertTimeWindow,
  assertU32,
  BleBinaryReader,
  BleBinaryWriter,
} from './binary'
import type { BleRouteCapability } from './types'

export function createBleRouteCapability(
  senderBinding: Uint8Array,
  routeEpoch: number,
  issuedAt: number,
  expiresAt: number,
): BleRouteCapability {
  assertByteLength(senderBinding, BLE_V2_SENDER_BINDING_BYTES, 'BLE sender binding')
  assertNonZeroBytes(senderBinding, 'BLE sender binding')
  assertU32(routeEpoch, 'BLE route epoch', false)
  assertTimeWindow(
    issuedAt,
    expiresAt,
    BLE_V2_MAX_ROUTE_CAPABILITY_LIFETIME_MS,
    'BLE route capability',
  )
  const capability: BleRouteCapability = {
    version: BLE_V2_PROTOCOL_VERSION,
    routeId: generateOpaqueBytes(BLE_V2_ROUTE_ID_BYTES),
    routeEpoch,
    senderBinding: senderBinding.slice(),
    secret: generateOpaqueBytes(BLE_V2_ROUTE_SECRET_BYTES),
    issuedAt,
    expiresAt,
  }
  assertBleRouteCapability(capability)
  return capability
}

export function encodeBleRouteCapability(capability: BleRouteCapability): Uint8Array {
  assertBleRouteCapability(capability)
  const writer = new BleBinaryWriter(BLE_V2_ROUTE_CAPABILITY_BYTES)
  writer.writeU32(BLE_V2_ROUTE_CAPABILITY_MAGIC)
  writer.writeU8(capability.version)
  writer.writeU8(0)
  writer.writeU16(0)
  writer.writeBytes(capability.routeId)
  writer.writeU32(capability.routeEpoch)
  writer.writeBytes(capability.senderBinding)
  writer.writeBytes(capability.secret)
  writer.writeU64(capability.issuedAt)
  writer.writeU64(capability.expiresAt)
  return writer.finish()
}

export function decodeBleRouteCapability(data: Uint8Array): BleRouteCapability {
  if (!(data instanceof Uint8Array) || data.length !== BLE_V2_ROUTE_CAPABILITY_BYTES) {
    throw new Error('BLE route capability length is invalid')
  }
  const reader = new BleBinaryReader(data)
  if (reader.readU32() !== BLE_V2_ROUTE_CAPABILITY_MAGIC) {
    throw new Error('BLE route capability magic is invalid')
  }
  const version = reader.readU8()
  if (reader.readU8() !== 0 || reader.readU16() !== 0) {
    throw new Error('BLE route capability reserved fields are invalid')
  }
  const capability: BleRouteCapability = {
    version: version as typeof BLE_V2_PROTOCOL_VERSION,
    routeId: reader.readBytes(BLE_V2_ROUTE_ID_BYTES),
    routeEpoch: reader.readU32(),
    senderBinding: reader.readBytes(BLE_V2_SENDER_BINDING_BYTES),
    secret: reader.readBytes(BLE_V2_ROUTE_SECRET_BYTES),
    issuedAt: reader.readU64(),
    expiresAt: reader.readU64(),
  }
  reader.finish()
  assertBleRouteCapability(capability)
  return capability
}

export function deriveBleCacheDeletionPreimage(
  capability: BleRouteCapability,
  envelopeId: Uint8Array,
  payloadHash: Uint8Array,
): Uint8Array {
  assertBleRouteCapability(capability)
  assertByteLength(envelopeId, BLE_V2_ENVELOPE_ID_BYTES, 'BLE envelope ID')
  assertByteLength(payloadHash, BLE_V2_HASH_BYTES, 'BLE payload hash')
  return hmac(
    sha256,
    capability.secret,
    concatBytes(
      stringToBytes(BLE_V2_CACHE_DELETE_PREIMAGE_PURPOSE),
      capability.senderBinding,
      capability.routeId,
      encodeU32(capability.routeEpoch),
      envelopeId,
      payloadHash,
    ),
  )
}

export function hashBleCacheDeletionPreimage(preimage: Uint8Array): Uint8Array {
  assertByteLength(preimage, BLE_V2_HASH_BYTES, 'BLE cache-deletion preimage')
  return sha256(concatBytes(
    stringToBytes(BLE_V2_CACHE_DELETE_HASH_PURPOSE),
    preimage,
  ))
}

export function verifyBleCacheDeletionPreimage(
  expectedHash: Uint8Array,
  preimage: Uint8Array,
): boolean {
  try {
    assertByteLength(expectedHash, BLE_V2_HASH_BYTES, 'BLE cache-deletion hash')
    return constantTimeEqual(expectedHash, hashBleCacheDeletionPreimage(preimage))
  } catch {
    return false
  }
}

export function deriveBleRouteMacKey(capability: BleRouteCapability): Uint8Array {
  assertBleRouteCapability(capability)
  return hmac(
    sha256,
    capability.secret,
    concatBytes(
      stringToBytes(BLE_V2_ROUTE_MAC_KEY_PURPOSE),
      capability.senderBinding,
      capability.routeId,
      encodeU32(capability.routeEpoch),
    ),
  )
}

export function assertBleRouteCapability(capability: BleRouteCapability): void {
  if (!capability || capability.version !== BLE_V2_PROTOCOL_VERSION) {
    throw new Error('BLE route capability version is not supported')
  }
  assertByteLength(capability.routeId, BLE_V2_ROUTE_ID_BYTES, 'BLE route ID')
  assertNonZeroBytes(capability.routeId, 'BLE route ID')
  assertU32(capability.routeEpoch, 'BLE route epoch', false)
  assertByteLength(
    capability.senderBinding,
    BLE_V2_SENDER_BINDING_BYTES,
    'BLE sender binding',
  )
  assertNonZeroBytes(capability.senderBinding, 'BLE sender binding')
  assertByteLength(capability.secret, BLE_V2_ROUTE_SECRET_BYTES, 'BLE route secret')
  assertNonZeroBytes(capability.secret, 'BLE route secret')
  assertTimeWindow(
    capability.issuedAt,
    capability.expiresAt,
    BLE_V2_MAX_ROUTE_CAPABILITY_LIFETIME_MS,
    'BLE route capability',
  )
}

function encodeU32(value: number): Uint8Array {
  const writer = new BleBinaryWriter(4)
  writer.writeU32(value)
  return writer.finish()
}

function generateOpaqueBytes(length: number): Uint8Array {
  let value: Uint8Array
  do {
    value = generateRandomBytes(length)
  } while (value.every(byte => byte === 0))
  return value
}
