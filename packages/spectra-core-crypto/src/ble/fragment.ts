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
  BLE_V2_ENVELOPE_ID_BYTES,
  BLE_V2_FRAGMENT_FIXED_BYTES,
  BLE_V2_FRAGMENT_MAGIC,
  BLE_V2_FRAGMENT_PURPOSE,
  BLE_V2_HASH_BYTES,
  BLE_V2_HMAC_BYTES,
  BLE_V2_MAX_FRAGMENT_CHUNK_BYTES,
  BLE_V2_MAX_FRAGMENTS,
  BLE_V2_MAX_PAYLOAD_BYTES,
  BLE_V2_PROTOCOL_VERSION,
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
import {
  assertBleRouteEnvelope,
  assertCapabilityRoute,
  computeBleRouteEnvelopeAuthTag,
} from './routeEnvelope'
import type {
  BleFragment,
  BleRouteCapability,
  BleRouteEnvelope,
} from './types'

const FRAGMENT_PREFIX_BYTES = BLE_V2_FRAGMENT_FIXED_BYTES - BLE_V2_HMAC_BYTES

export function fragmentBleRouteEnvelope(
  envelope: BleRouteEnvelope,
  forwardCapability: BleRouteCapability,
  chunkSize: number = BLE_V2_MAX_FRAGMENT_CHUNK_BYTES,
): BleFragment[] {
  assertBleRouteEnvelope(envelope)
  assertBleRouteCapability(forwardCapability)
  assertCapabilityRoute(forwardCapability, envelope.routeId, envelope.routeEpoch, 'forward')
  if (!constantTimeEqual(
    envelope.authTag,
    computeBleRouteEnvelopeAuthTag(envelope, forwardCapability),
  )) {
    throw new Error('BLE route envelope authentication is invalid')
  }
  if (envelope.issuedAt < forwardCapability.issuedAt
    || envelope.expiresAt > forwardCapability.expiresAt
    || !constantTimeEqual(envelope.payloadHash, sha256(envelope.payload))) {
    throw new Error('BLE route envelope content is invalid')
  }
  const expectedDeletionHash = hashBleCacheDeletionPreimage(
    deriveBleCacheDeletionPreimage(
      forwardCapability,
      envelope.envelopeId,
      envelope.payloadHash,
    ),
  )
  if (!constantTimeEqual(envelope.cacheDeletionHash, expectedDeletionHash)) {
    throw new Error('BLE route envelope cache-deletion hash is invalid')
  }
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1
    || chunkSize > BLE_V2_MAX_FRAGMENT_CHUNK_BYTES) {
    throw new Error('BLE fragment chunk size is invalid')
  }
  const fragmentCount = Math.ceil(envelope.payload.length / chunkSize)
  if (fragmentCount < 1 || fragmentCount > BLE_V2_MAX_FRAGMENTS) {
    throw new Error('BLE fragment count exceeds the protocol limit')
  }

  const fragments: BleFragment[] = []
  for (let fragmentIndex = 0; fragmentIndex < fragmentCount; fragmentIndex += 1) {
    const chunkOffset = fragmentIndex * chunkSize
    const chunk = envelope.payload.slice(
      chunkOffset,
      Math.min(chunkOffset + chunkSize, envelope.payload.length),
    )
    const fragment: BleFragment = {
      version: BLE_V2_PROTOCOL_VERSION,
      payloadType: envelope.payloadType,
      flags: envelope.flags,
      maxHops: envelope.maxHops,
      envelopeId: envelope.envelopeId.slice(),
      routeId: envelope.routeId.slice(),
      routeEpoch: envelope.routeEpoch,
      returnRouteId: envelope.returnRouteId.slice(),
      returnRouteEpoch: envelope.returnRouteEpoch,
      issuedAt: envelope.issuedAt,
      expiresAt: envelope.expiresAt,
      totalPayloadLength: envelope.payload.length,
      payloadHash: envelope.payloadHash.slice(),
      cacheDeletionHash: envelope.cacheDeletionHash.slice(),
      fragmentIndex,
      fragmentCount,
      chunkOffset,
      chunk,
      authTag: new Uint8Array(BLE_V2_HMAC_BYTES),
    }
    fragment.authTag = computeBleFragmentAuthTag(fragment, forwardCapability)
    fragments.push(fragment)
  }
  return fragments
}

export function encodeBleFragment(fragment: BleFragment): Uint8Array {
  assertBleFragment(fragment)
  return concatBytes(
    encodeFragmentPrefix(fragment),
    fragment.chunk,
    fragment.authTag,
  )
}

export function decodeBleFragment(data: Uint8Array): BleFragment {
  if (!(data instanceof Uint8Array) || data.length <= BLE_V2_FRAGMENT_FIXED_BYTES) {
    throw new Error('BLE fragment length is invalid')
  }
  const reader = new BleBinaryReader(data)
  if (reader.readU32() !== BLE_V2_FRAGMENT_MAGIC) {
    throw new Error('BLE fragment magic is invalid')
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
  const totalPayloadLength = reader.readU32()
  const payloadHash = reader.readBytes(BLE_V2_HASH_BYTES)
  const cacheDeletionHash = reader.readBytes(BLE_V2_HASH_BYTES)
  const fragmentIndex = reader.readU16()
  const fragmentCount = reader.readU16()
  const chunkOffset = reader.readU32()
  const chunkLength = reader.readU16()
  if (chunkLength < 1 || chunkLength > BLE_V2_MAX_FRAGMENT_CHUNK_BYTES) {
    throw new Error('BLE fragment chunk length is invalid')
  }
  if (data.length !== BLE_V2_FRAGMENT_FIXED_BYTES + chunkLength) {
    throw new Error('BLE fragment chunk length does not match input')
  }
  const chunk = reader.readBytes(chunkLength)
  const authTag = reader.readBytes(BLE_V2_HMAC_BYTES)
  reader.finish()

  const fragment: BleFragment = {
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
    totalPayloadLength,
    payloadHash,
    cacheDeletionHash,
    fragmentIndex,
    fragmentCount,
    chunkOffset,
    chunk,
    authTag,
  }
  assertBleFragment(fragment)
  return fragment
}

export function computeBleFragmentAuthTag(
  fragment: BleFragment,
  forwardCapability: BleRouteCapability,
): Uint8Array {
  assertBleFragment(fragment)
  assertCapabilityRoute(forwardCapability, fragment.routeId, fragment.routeEpoch, 'forward')
  return hmac(
    sha256,
    deriveBleRouteMacKey(forwardCapability),
    concatBytes(
      stringToBytes(BLE_V2_FRAGMENT_PURPOSE),
      encodeFragmentPrefix(fragment),
      fragment.chunk,
    ),
  )
}

export function verifyBleFragment(
  fragment: BleFragment,
  forwardCapability: BleRouteCapability,
  now: number = Date.now(),
): boolean {
  try {
    assertBleFragment(fragment)
    assertCapabilityRoute(forwardCapability, fragment.routeId, fragment.routeEpoch, 'forward')
    assertCurrentlyValid(
      forwardCapability.issuedAt,
      forwardCapability.expiresAt,
      now,
      'BLE forward route capability',
    )
    assertCurrentlyValid(fragment.issuedAt, fragment.expiresAt, now, 'BLE fragment')
    if (fragment.issuedAt < forwardCapability.issuedAt
      || fragment.expiresAt > forwardCapability.expiresAt) {
      return false
    }
    const deletionHash = hashBleCacheDeletionPreimage(
      deriveBleCacheDeletionPreimage(
        forwardCapability,
        fragment.envelopeId,
        fragment.payloadHash,
      ),
    )
    if (!constantTimeEqual(fragment.cacheDeletionHash, deletionHash)) {
      return false
    }
    return constantTimeEqual(
      fragment.authTag,
      computeBleFragmentAuthTag(fragment, forwardCapability),
    )
  } catch {
    return false
  }
}

export function reassembleBleFragments(
  fragments: readonly BleFragment[],
  forwardCapability: BleRouteCapability,
  now: number = Date.now(),
): BleRouteEnvelope {
  if (fragments.length < 1 || fragments.length > BLE_V2_MAX_FRAGMENTS) {
    throw new Error('BLE fragment set size is invalid')
  }
  const ordered = [...fragments].sort((left, right) => left.fragmentIndex - right.fragmentIndex)
  const first = ordered[0]
  if (first.fragmentCount !== ordered.length) {
    throw new Error('BLE fragment set is incomplete')
  }
  let expectedOffset = 0
  for (let index = 0; index < ordered.length; index += 1) {
    const fragment = ordered[index]
    if (!verifyBleFragment(fragment, forwardCapability, now)) {
      throw new Error('BLE fragment authentication is invalid')
    }
    if (fragment.fragmentIndex !== index || fragment.chunkOffset !== expectedOffset) {
      throw new Error('BLE fragment ordering is invalid')
    }
    if (!fragmentMetadataMatches(first, fragment)) {
      throw new Error('BLE fragment metadata is inconsistent')
    }
    expectedOffset += fragment.chunk.length
  }
  if (expectedOffset !== first.totalPayloadLength) {
    throw new Error('BLE fragment payload length is inconsistent')
  }

  const payload = new Uint8Array(first.totalPayloadLength)
  for (const fragment of ordered) {
    payload.set(fragment.chunk, fragment.chunkOffset)
  }
  if (!constantTimeEqual(first.payloadHash, sha256(payload))) {
    throw new Error('BLE reassembled payload hash is invalid')
  }
  const envelope: BleRouteEnvelope = {
    version: BLE_V2_PROTOCOL_VERSION,
    payloadType: first.payloadType,
    flags: first.flags,
    maxHops: first.maxHops,
    envelopeId: first.envelopeId.slice(),
    routeId: first.routeId.slice(),
    routeEpoch: first.routeEpoch,
    returnRouteId: first.returnRouteId.slice(),
    returnRouteEpoch: first.returnRouteEpoch,
    issuedAt: first.issuedAt,
    expiresAt: first.expiresAt,
    payload,
    payloadHash: first.payloadHash.slice(),
    cacheDeletionHash: first.cacheDeletionHash.slice(),
    authTag: new Uint8Array(BLE_V2_HMAC_BYTES),
  }
  envelope.authTag = computeBleRouteEnvelopeAuthTag(envelope, forwardCapability)
  return envelope
}

export function assertBleFragment(fragment: BleFragment): void {
  if (!fragment) {
    throw new Error('BLE fragment is required')
  }
  assertRouteFields(
    fragment.version,
    fragment.payloadType,
    fragment.flags,
    fragment.maxHops,
    fragment.issuedAt,
    fragment.expiresAt,
  )
  assertByteLength(fragment.envelopeId, BLE_V2_ENVELOPE_ID_BYTES, 'BLE envelope ID')
  assertNonZeroBytes(fragment.envelopeId, 'BLE envelope ID')
  assertByteLength(fragment.routeId, BLE_V2_ROUTE_ID_BYTES, 'BLE forward route ID')
  assertNonZeroBytes(fragment.routeId, 'BLE forward route ID')
  assertU32(fragment.routeEpoch, 'BLE forward route epoch', false)
  assertByteLength(fragment.returnRouteId, BLE_V2_ROUTE_ID_BYTES, 'BLE return route ID')
  assertNonZeroBytes(fragment.returnRouteId, 'BLE return route ID')
  assertU32(fragment.returnRouteEpoch, 'BLE return route epoch', false)
  if (!Number.isSafeInteger(fragment.totalPayloadLength)
    || fragment.totalPayloadLength < 1
    || fragment.totalPayloadLength > BLE_V2_MAX_PAYLOAD_BYTES) {
    throw new Error('BLE fragment total payload length is invalid')
  }
  assertByteLength(fragment.payloadHash, BLE_V2_HASH_BYTES, 'BLE payload hash')
  assertByteLength(
    fragment.cacheDeletionHash,
    BLE_V2_HASH_BYTES,
    'BLE cache-deletion hash',
  )
  if (!Number.isSafeInteger(fragment.fragmentCount)
    || fragment.fragmentCount < 1
    || fragment.fragmentCount > BLE_V2_MAX_FRAGMENTS
    || !Number.isSafeInteger(fragment.fragmentIndex)
    || fragment.fragmentIndex < 0
    || fragment.fragmentIndex >= fragment.fragmentCount) {
    throw new Error('BLE fragment position is invalid')
  }
  if (!Number.isSafeInteger(fragment.chunkOffset)
    || fragment.chunkOffset < 0
    || !(fragment.chunk instanceof Uint8Array)
    || fragment.chunk.length < 1
    || fragment.chunk.length > BLE_V2_MAX_FRAGMENT_CHUNK_BYTES
    || fragment.chunkOffset + fragment.chunk.length > fragment.totalPayloadLength) {
    throw new Error('BLE fragment chunk bounds are invalid')
  }
  assertByteLength(fragment.authTag, BLE_V2_HMAC_BYTES, 'BLE fragment authentication tag')
}

function encodeFragmentPrefix(fragment: BleFragment): Uint8Array {
  const writer = new BleBinaryWriter(FRAGMENT_PREFIX_BYTES)
  writer.writeU32(BLE_V2_FRAGMENT_MAGIC)
  writer.writeU8(fragment.version)
  writer.writeU8(fragment.payloadType)
  writer.writeU8(fragment.flags)
  writer.writeU8(fragment.maxHops)
  writer.writeBytes(fragment.envelopeId)
  writer.writeBytes(fragment.routeId)
  writer.writeU32(fragment.routeEpoch)
  writer.writeBytes(fragment.returnRouteId)
  writer.writeU32(fragment.returnRouteEpoch)
  writer.writeU64(fragment.issuedAt)
  writer.writeU64(fragment.expiresAt)
  writer.writeU32(fragment.totalPayloadLength)
  writer.writeBytes(fragment.payloadHash)
  writer.writeBytes(fragment.cacheDeletionHash)
  writer.writeU16(fragment.fragmentIndex)
  writer.writeU16(fragment.fragmentCount)
  writer.writeU32(fragment.chunkOffset)
  writer.writeU16(fragment.chunk.length)
  return writer.finish()
}

function fragmentMetadataMatches(left: BleFragment, right: BleFragment): boolean {
  return left.version === right.version
    && left.payloadType === right.payloadType
    && left.flags === right.flags
    && left.maxHops === right.maxHops
    && constantTimeEqual(left.envelopeId, right.envelopeId)
    && constantTimeEqual(left.routeId, right.routeId)
    && left.routeEpoch === right.routeEpoch
    && constantTimeEqual(left.returnRouteId, right.returnRouteId)
    && left.returnRouteEpoch === right.returnRouteEpoch
    && left.issuedAt === right.issuedAt
    && left.expiresAt === right.expiresAt
    && left.totalPayloadLength === right.totalPayloadLength
    && constantTimeEqual(left.payloadHash, right.payloadHash)
    && constantTimeEqual(left.cacheDeletionHash, right.cacheDeletionHash)
    && left.fragmentCount === right.fragmentCount
}
