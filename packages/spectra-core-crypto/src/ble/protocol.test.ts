/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { bytesToHex } from '../crypto/utils'
import {
  BLE_V2_FRAGMENT_FIXED_BYTES,
  BLE_V2_MAX_FRAGMENT_CHUNK_BYTES,
  BLE_V2_MAX_PAYLOAD_BYTES,
  BLE_V2_PROTOCOL_VERSION,
  BLE_V2_ROUTE_ENVELOPE_FIXED_BYTES,
  BleAcceptanceStatus,
  BleEnvelopeReplayCache,
  BlePayloadType,
  BleRouteFlags,
  createBleAcceptanceReceipt,
  createBleRouteCapability,
  createBleRouteEnvelope,
  decodeBleAcceptanceReceipt,
  decodeBleFragment,
  decodeBleRouteCapability,
  decodeBleRouteEnvelope,
  encodeBleAcceptanceReceipt,
  encodeBleFragment,
  encodeBleRouteCapability,
  encodeBleRouteEnvelope,
  fragmentBleRouteEnvelope,
  generateBleEnvelopeId,
  hashBleCacheDeletionPreimage,
  reassembleBleFragments,
  verifyBleAcceptanceReceipt,
  verifyBleCacheDeletionPreimage,
  verifyBleFragment,
  verifyBleRouteEnvelope,
} from './index'
import type {
  BleAcceptanceReceipt,
  BleFragment,
  BleRouteCapability,
  BleRouteEnvelope,
} from './index'

const NOW = 1_800_000_000_000

function sequence(length: number, start: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (start + index) & 0xff)
}

function capability(
  routeStart: number,
  secretStart: number,
  senderStart: number,
  epoch: number,
): BleRouteCapability {
  return {
    version: BLE_V2_PROTOCOL_VERSION,
    routeId: sequence(16, routeStart),
    routeEpoch: epoch,
    senderBinding: sequence(32, senderStart),
    secret: sequence(32, secretStart),
    issuedAt: NOW - 1000,
    expiresAt: NOW + 60_000,
  }
}

function makeEnvelope(payload: Uint8Array = sequence(97, 1)): {
  envelope: BleRouteEnvelope
  forward: BleRouteCapability
  reverse: BleRouteCapability
} {
  const forward = capability(0x10, 0x30, 0x50, 7)
  const reverse = capability(0x70, 0x90, 0xb0, 9)
  const envelope = createBleRouteEnvelope({
    payloadType: BlePayloadType.ChatCiphertext,
    flags: BleRouteFlags.StoreForward | BleRouteFlags.AcceptanceReceiptRequired,
    maxHops: 5,
    envelopeId: sequence(16, 0xd0),
    issuedAt: NOW,
    expiresAt: NOW + 30_000,
    payload,
  }, forward, reverse, NOW)
  return { envelope, forward, reverse }
}

function cloneEnvelope(envelope: BleRouteEnvelope): BleRouteEnvelope {
  return {
    ...envelope,
    envelopeId: envelope.envelopeId.slice(),
    routeId: envelope.routeId.slice(),
    returnRouteId: envelope.returnRouteId.slice(),
    payload: envelope.payload.slice(),
    payloadHash: envelope.payloadHash.slice(),
    cacheDeletionHash: envelope.cacheDeletionHash.slice(),
    authTag: envelope.authTag.slice(),
  }
}

function cloneFragment(fragment: BleFragment): BleFragment {
  return {
    ...fragment,
    envelopeId: fragment.envelopeId.slice(),
    routeId: fragment.routeId.slice(),
    returnRouteId: fragment.returnRouteId.slice(),
    payloadHash: fragment.payloadHash.slice(),
    cacheDeletionHash: fragment.cacheDeletionHash.slice(),
    chunk: fragment.chunk.slice(),
    authTag: fragment.authTag.slice(),
  }
}

function cloneReceipt(receipt: BleAcceptanceReceipt): BleAcceptanceReceipt {
  return {
    ...receipt,
    envelopeId: receipt.envelopeId.slice(),
    routeId: receipt.routeId.slice(),
    forwardRouteId: receipt.forwardRouteId.slice(),
    payloadHash: receipt.payloadHash.slice(),
    cacheDeletionPreimage: receipt.cacheDeletionPreimage.slice(),
    authTag: receipt.authTag.slice(),
  }
}

describe('BLE v2 route protocol', () => {
  it('matches the canonical route-envelope golden vector', () => {
    const { envelope } = makeEnvelope(new TextEncoder().encode('spectra-ble-v2'))

    expect(bytesToHex(encodeBleRouteEnvelope(envelope))).toBe(
      '0x5342523202010305d0d1d2d3d4d5d6d7d8d9dadbdcdddedf101112131415161718191a1b1c1d1e1f00000007707172737475767778797a7b7c7d7e7f00000009000001a3185c5000000001a3185cc5300000000e1b08b10852f28772b9848f287fcf0a77b3a7c754d00fb77a51ca51e42bcc0819a8d32faef0f6752bc0adb1b387a7b70bac0cbee87ea7e942b002ad64e15aab8b737065637472612d626c652d7632c4f80f5645aed7a45809b870a22ba7cad460c35feefd564ff87bc0f447477df3',
    )
  })

  it('round-trips capabilities and authenticated route envelopes', () => {
    const { envelope, forward, reverse } = makeEnvelope()
    const decodedCapability = decodeBleRouteCapability(encodeBleRouteCapability(forward))
    const decodedEnvelope = decodeBleRouteEnvelope(encodeBleRouteEnvelope(envelope))

    expect(decodedCapability).toEqual(forward)
    expect(decodedEnvelope).toEqual(envelope)
    expect(verifyBleRouteEnvelope(decodedEnvelope, decodedCapability, reverse, NOW)).toBe(true)
  })

  it('generates unique CSPRNG 128-bit envelope IDs and opaque capabilities', () => {
    const firstId = generateBleEnvelopeId()
    const secondId = generateBleEnvelopeId()
    const firstCapability = createBleRouteCapability(
      sequence(32, 1),
      1,
      NOW,
      NOW + 1000,
    )
    const secondCapability = createBleRouteCapability(
      sequence(32, 1),
      2,
      NOW,
      NOW + 1000,
    )

    expect(firstId).toHaveLength(16)
    expect(secondId).toHaveLength(16)
    expect(firstId).not.toEqual(secondId)
    expect(firstCapability.secret).toHaveLength(32)
    expect(firstCapability.routeId).toHaveLength(16)
    expect(firstCapability.routeId).not.toEqual(secondCapability.routeId)
    expect(firstCapability.secret).not.toEqual(secondCapability.secret)
  })

  it('rejects every independently tampered immutable envelope field', () => {
    const { envelope, forward, reverse } = makeEnvelope()
    const encoded = encodeBleRouteEnvelope(envelope)
    const offsets = [
      4, 5, 6, 7, 8, 24, 40, 44, 60, 64, 72, 80, 84, 116, 148,
      encoded.length - 1,
    ]

    for (const offset of offsets) {
      const tampered = encoded.slice()
      tampered[offset] ^= 0x01
      try {
        const decoded = decodeBleRouteEnvelope(tampered)
        expect(verifyBleRouteEnvelope(decoded, forward, reverse, NOW)).toBe(false)
      } catch {
        expect(true).toBe(true)
      }
    }
  })

  it('binds authentication to the sender-specific capability', () => {
    const { envelope, forward, reverse } = makeEnvelope()
    const wrongSender = {
      ...forward,
      senderBinding: sequence(32, 0xee),
    }

    expect(verifyBleRouteEnvelope(envelope, wrongSender, reverse, NOW)).toBe(false)
  })

  it('rejects expired envelopes and replayed IDs', () => {
    const { envelope, forward, reverse } = makeEnvelope()
    const replay = new BleEnvelopeReplayCache(2)

    expect(verifyBleRouteEnvelope(envelope, forward, reverse, envelope.expiresAt)).toBe(false)
    expect(replay.checkAndRecord(envelope.envelopeId, envelope.expiresAt, NOW)).toBe(true)
    expect(replay.checkAndRecord(envelope.envelopeId, envelope.expiresAt, NOW)).toBe(false)
    expect(replay.checkAndRecord(sequence(16, 1), envelope.expiresAt, NOW)).toBe(true)
    expect(replay.checkAndRecord(sequence(16, 2), envelope.expiresAt, NOW)).toBe(false)
    expect(replay.checkAndRecord(sequence(16, 2), NOW + 100_000, envelope.expiresAt)).toBe(true)
  })

  it('rejects malformed and allocation-exceeding route lengths', () => {
    const { envelope } = makeEnvelope()
    const encoded = encodeBleRouteEnvelope(envelope)
    const oversized = new Uint8Array(BLE_V2_ROUTE_ENVELOPE_FIXED_BYTES)
    const oversizedView = new DataView(oversized.buffer)
    oversized.set(encoded.slice(0, 80), 0)
    oversizedView.setUint32(80, BLE_V2_MAX_PAYLOAD_BYTES + 1)

    expect(() => decodeBleRouteEnvelope(encoded.slice(0, -1))).toThrow()
    expect(() => decodeBleRouteEnvelope(new Uint8Array(BLE_V2_ROUTE_ENVELOPE_FIXED_BYTES - 1)))
      .toThrow()
    expect(() => decodeBleRouteEnvelope(oversized)).toThrow()
  })
})

describe('BLE v2 fragments', () => {
  it('round-trips, verifies, and reassembles out-of-order fragments', () => {
    const { envelope, forward, reverse } = makeEnvelope(sequence(10_000, 3))
    const fragments = fragmentBleRouteEnvelope(envelope, forward, 1024)
    const decoded = fragments
      .map((fragment) => decodeBleFragment(encodeBleFragment(fragment)))
      .reverse()
    const reassembled = reassembleBleFragments(decoded, forward, NOW)

    expect(fragments).toHaveLength(10)
    expect(decoded.every((fragment) => verifyBleFragment(fragment, forward, NOW))).toBe(true)
    expect(reassembled.payload).toEqual(envelope.payload)
    expect(verifyBleRouteEnvelope(reassembled, forward, reverse, NOW)).toBe(true)
  })

  it('rejects independently tampered fragment metadata, chunks, and tags', () => {
    const { envelope, forward } = makeEnvelope(sequence(200, 1))
    const original = fragmentBleRouteEnvelope(envelope, forward, 100)[0]
    const tampered = [
      (() => {
        const value = cloneFragment(original)
        value.fragmentIndex = 1
        return value
      })(),
      (() => {
        const value = cloneFragment(original)
        value.totalPayloadLength += 1
        return value
      })(),
      (() => {
        const value = cloneFragment(original)
        value.chunk[0] ^= 1
        return value
      })(),
      (() => {
        const value = cloneFragment(original)
        value.payloadHash[0] ^= 1
        return value
      })(),
      (() => {
        const value = cloneFragment(original)
        value.authTag[0] ^= 1
        return value
      })(),
    ]

    for (const fragment of tampered) {
      expect(verifyBleFragment(fragment, forward, NOW)).toBe(false)
    }
  })

  it('rejects malformed fragment lengths before reassembly allocation', () => {
    const { envelope, forward } = makeEnvelope(sequence(200, 1))
    const encoded = encodeBleFragment(fragmentBleRouteEnvelope(envelope, forward, 100)[0])
    const oversizedChunk = encoded.slice()
    new DataView(oversizedChunk.buffer).setUint16(156, BLE_V2_MAX_FRAGMENT_CHUNK_BYTES + 1)
    const oversizedPayload = encoded.slice()
    new DataView(oversizedPayload.buffer).setUint32(80, BLE_V2_MAX_PAYLOAD_BYTES + 1)

    expect(() => decodeBleFragment(encoded.slice(0, BLE_V2_FRAGMENT_FIXED_BYTES))).toThrow()
    expect(() => decodeBleFragment(oversizedChunk)).toThrow()
    expect(() => decodeBleFragment(oversizedPayload)).toThrow()
  })
})

describe('BLE v2 endpoint acceptance receipts', () => {
  it('authenticates acceptance and reveals only the deletion preimage', () => {
    const { envelope, forward, reverse } = makeEnvelope()
    const receipt = createBleAcceptanceReceipt(envelope, forward, reverse, NOW + 100)
    const decoded = decodeBleAcceptanceReceipt(encodeBleAcceptanceReceipt(receipt))

    expect(decoded.status).toBe(BleAcceptanceStatus.Accepted)
    expect(verifyBleAcceptanceReceipt(decoded, envelope, reverse, NOW + 200)).toBe(true)
    expect(verifyBleCacheDeletionPreimage(
      envelope.cacheDeletionHash,
      decoded.cacheDeletionPreimage,
    )).toBe(true)
    expect(hashBleCacheDeletionPreimage(decoded.cacheDeletionPreimage))
      .toEqual(envelope.cacheDeletionHash)
  })

  it('rejects independently tampered acceptance receipt fields', () => {
    const { envelope, forward, reverse } = makeEnvelope()
    const receipt = createBleAcceptanceReceipt(envelope, forward, reverse, NOW + 100)
    const tampered = [
      (() => {
        const value = cloneReceipt(receipt)
        value.envelopeId[0] ^= 1
        return value
      })(),
      (() => {
        const value = cloneReceipt(receipt)
        value.routeEpoch += 1
        return value
      })(),
      (() => {
        const value = cloneReceipt(receipt)
        value.forwardRouteId[0] ^= 1
        return value
      })(),
      (() => {
        const value = cloneReceipt(receipt)
        value.payloadHash[0] ^= 1
        return value
      })(),
      (() => {
        const value = cloneReceipt(receipt)
        value.cacheDeletionPreimage[0] ^= 1
        return value
      })(),
      (() => {
        const value = cloneReceipt(receipt)
        value.acceptedAt += 1
        return value
      })(),
      (() => {
        const value = cloneReceipt(receipt)
        value.authTag[0] ^= 1
        return value
      })(),
    ]

    for (const value of tampered) {
      expect(verifyBleAcceptanceReceipt(value, envelope, reverse, NOW + 200)).toBe(false)
    }
  })

  it('rejects expired and malformed receipts', () => {
    const { envelope, forward, reverse } = makeEnvelope()
    const receipt = createBleAcceptanceReceipt(envelope, forward, reverse, NOW + 100)
    const encoded = encodeBleAcceptanceReceipt(receipt)

    expect(verifyBleAcceptanceReceipt(
      receipt,
      envelope,
      reverse,
      receipt.expiresAt,
    )).toBe(false)
    expect(() => decodeBleAcceptanceReceipt(encoded.slice(0, -1))).toThrow()
  })
})
