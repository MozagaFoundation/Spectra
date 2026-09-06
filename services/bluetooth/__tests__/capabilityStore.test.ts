/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BlePayloadType,
  BleRouteFlags,
  createBleAcceptanceReceipt,
  createBleRouteEnvelope,
  encodeBleRouteCapability,
  encodeBleRouteEnvelope,
} from '@spectra/core-crypto'
import { BLECapabilityStore } from '../mesh/capabilityStore'

const mockState = vi.hoisted(() => ({
  asyncStorage: new Map<string, string>(),
  secureStore: new Map<string, string>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockState.asyncStorage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockState.asyncStorage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      mockState.asyncStorage.delete(key)
    }),
    getAllKeys: vi.fn(async () => [...mockState.asyncStorage.keys()]),
    multiRemove: vi.fn(async (keys: string[]) => {
      keys.forEach((key) => mockState.asyncStorage.delete(key))
    }),
  },
}))

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: vi.fn(async (length: number) => crypto.getRandomValues(
    new Uint8Array(length),
  )),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockState.secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockState.secureStore.set(key, value)
  }),
}))

describe('BLECapabilityStore', () => {
  const now = 1_000_000

  beforeEach(() => {
    mockState.asyncStorage.clear()
    mockState.secureStore.clear()
  })

  it('establishes bilateral sender-bound route capabilities', async () => {
    const alice = await BLECapabilityStore.open({
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      localIdentityId: 'alice',
    })
    const bob = await BLECapabilityStore.open({
      walletScope: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      localIdentityId: 'bob',
    })
    const aliceInbound = await alice.ensureInboundCapability('bob', now)
    const bobInbound = await bob.ensureInboundCapability('alice', now)

    await expect(bob.acceptOutboundCapability(
      'alice',
      encodeBleRouteCapability(aliceInbound.capability),
      now + 1,
    )).resolves.toBe(true)
    await expect(alice.acceptOutboundCapability(
      'bob',
      encodeBleRouteCapability(bobInbound.capability),
      now + 1,
    )).resolves.toBe(true)

    const pair = alice.getRoutePair('bob', now + 2)
    expect(pair?.forward.routeId).toEqual(bobInbound.capability.routeId)
    expect(pair?.return.routeId).toEqual(aliceInbound.capability.routeId)
    expect([...mockState.asyncStorage.values()].join('')).not.toContain(
      alice.encodeForDelivery(aliceInbound.capability),
    )
  })

  it('rejects sender substitution and epoch downgrade', async () => {
    const alice = await BLECapabilityStore.open({
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      localIdentityId: 'alice',
    })
    const bob = await BLECapabilityStore.open({
      walletScope: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      localIdentityId: 'bob',
    })
    const wrongBinding = await alice.ensureInboundCapability('mallory', now)
    await expect(bob.acceptOutboundCapability(
      'alice',
      encodeBleRouteCapability(wrongBinding.capability),
      now + 1,
    )).resolves.toBe(false)

    const first = await alice.ensureInboundCapability('bob', now)
    await bob.acceptOutboundCapability(
      'alice',
      encodeBleRouteCapability(first.capability),
      now + 1,
    )
    const rotated = await alice.ensureInboundCapability(
      'bob',
      first.capability.expiresAt - 1,
    )
    expect(rotated.capability.routeEpoch).toBe(first.capability.routeEpoch + 1)
    await bob.acceptOutboundCapability(
      'alice',
      encodeBleRouteCapability(rotated.capability),
      rotated.capability.issuedAt,
    )

    await expect(bob.acceptOutboundCapability(
      'alice',
      encodeBleRouteCapability(first.capability),
      rotated.capability.issuedAt,
    )).resolves.toBe(false)
  })

  it('accepts an authenticated-link capability even after an epoch reset', async () => {
    const alice = await BLECapabilityStore.open({
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      localIdentityId: 'alice',
    })
    const bob = await BLECapabilityStore.open({
      walletScope: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      localIdentityId: 'bob',
    })
    const first = await alice.ensureInboundCapability('bob', now)
    await bob.ensureInboundCapability('alice', now)
    await bob.acceptOutboundCapability(
      'alice',
      encodeBleRouteCapability(first.capability),
      now + 1,
    )
    const rotated = await alice.ensureInboundCapability(
      'bob',
      first.capability.expiresAt - 1,
    )
    await bob.acceptOutboundCapability(
      'alice',
      encodeBleRouteCapability(rotated.capability),
      rotated.capability.issuedAt,
    )

    await expect(bob.acceptOutboundCapability(
      'alice',
      encodeBleRouteCapability(first.capability),
      rotated.capability.issuedAt,
      { fromAuthenticatedLink: true },
    )).resolves.toBe(true)
    expect(bob.getRoutePair('alice', rotated.capability.issuedAt)?.forward.routeId)
      .toEqual(first.capability.routeId)
  })

  it('does not rotate a still-valid inbound while sending', async () => {
    const alice = await BLECapabilityStore.open({
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      localIdentityId: 'alice',
    })
    const first = await alice.ensureInboundCapability('bob', now)
    const reused = await alice.ensureInboundCapability(
      'bob',
      first.capability.expiresAt - 1,
      { rotateExpiring: false },
    )
    expect(reused.rotated).toBe(false)
    expect(reused.capability.routeEpoch).toBe(first.capability.routeEpoch)
    expect(reused.capability.routeId).toEqual(first.capability.routeId)
  })

  it('seals bounded store-forward records and deletes only with the endpoint proof', async () => {
    const alice = await BLECapabilityStore.open({
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      localIdentityId: 'alice',
    })
    const bob = await BLECapabilityStore.open({
      walletScope: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      localIdentityId: 'bob',
    })
    const aliceInbound = await alice.ensureInboundCapability('bob', now)
    const bobInbound = await bob.ensureInboundCapability('alice', now)
    await alice.acceptOutboundCapability(
      'bob',
      encodeBleRouteCapability(bobInbound.capability),
      now,
    )
    await bob.acceptOutboundCapability(
      'alice',
      encodeBleRouteCapability(aliceInbound.capability),
      now,
    )
    const pair = alice.getRoutePair('bob', now)!
    const envelope = createBleRouteEnvelope({
      payloadType: BlePayloadType.ChatCiphertext,
      flags: BleRouteFlags.StoreForward | BleRouteFlags.AcceptanceReceiptRequired,
      maxHops: 3,
      issuedAt: now,
      expiresAt: now + 10_000,
      payload: new Uint8Array([7, 8, 9]),
    }, pair.forward, pair.return, now)
    const encoded = encodeBleRouteEnvelope(envelope)

    await expect(alice.queueEnvelope({
      envelope,
      encoded,
      hopCount: 0,
      ttl: 3,
      maxMessages: 4,
      now,
    })).resolves.toBe(true)
    expect([...mockState.asyncStorage.values()].join('')).not.toContain(
      Buffer.from(encoded).toString('base64'),
    )
    const receipt = createBleAcceptanceReceipt(
      envelope,
      pair.forward,
      pair.return,
      now + 1,
    )
    await expect(alice.deleteQueuedWithProof(
      envelope.envelopeId,
      new Uint8Array(32),
    )).resolves.toBe(false)
    await expect(alice.deleteQueuedWithProof(
      envelope.envelopeId,
      receipt.cacheDeletionPreimage,
    )).resolves.toBe(true)
    await expect(alice.getQueuedEnvelopes(now + 2)).resolves.toHaveLength(0)
  })

  it('restores stored correlation and accepts a verified receipt after restart', async () => {
    const wallet = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const alice = await BLECapabilityStore.open({
      walletScope: wallet,
      localIdentityId: 'alice',
    })
    const bob = await BLECapabilityStore.open({
      walletScope: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      localIdentityId: 'bob',
    })
    const aliceInbound = await alice.ensureInboundCapability('bob', now)
    const bobInbound = await bob.ensureInboundCapability('alice', now)
    await alice.acceptOutboundCapability(
      'bob',
      encodeBleRouteCapability(bobInbound.capability),
      now,
    )
    await bob.acceptOutboundCapability(
      'alice',
      encodeBleRouteCapability(aliceInbound.capability),
      now,
    )
    const pair = alice.getRoutePair('bob', now)!
    const envelope = createBleRouteEnvelope({
      payloadType: BlePayloadType.ChatCiphertext,
      flags: BleRouteFlags.StoreForward | BleRouteFlags.AcceptanceReceiptRequired,
      maxHops: 3,
      issuedAt: now,
      expiresAt: now + 10_000,
      payload: new Uint8Array([4, 5, 6]),
    }, pair.forward, pair.return, now)

    await expect(alice.recordOutboundCorrelation({
      envelope,
      returnCapability: pair.return,
      localMessageId: 'local-message-1',
      remoteIdentityId: 'bob',
      now,
    })).resolves.toBe(true)
    expect(alice.drainOutboundDeliveryEvents()).toEqual([
      expect.objectContaining({
        localMessageId: 'local-message-1',
        state: 'pending',
        sequence: 1,
      }),
    ])
    await alice.queueEnvelope({
      envelope,
      encoded: encodeBleRouteEnvelope(envelope),
      hopCount: 0,
      ttl: 3,
      maxMessages: 8,
      now,
    })

    const restored = await BLECapabilityStore.open({
      walletScope: wallet,
      localIdentityId: 'alice',
    })
    await expect(restored.reconcileOutbound(now + 1)).resolves.toEqual([
      expect.objectContaining({
        localMessageId: 'local-message-1',
        state: 'stored',
        sequence: 2,
      }),
    ])
    const receipt = createBleAcceptanceReceipt(
      envelope,
      pair.forward,
      pair.return,
      now + 2,
    )
    await expect(restored.acceptOutboundReceipt(receipt, 3, now + 3))
      .resolves.toBe(true)
    expect(restored.drainOutboundDeliveryEvents()).toEqual([
      expect.objectContaining({
        localMessageId: 'local-message-1',
        state: 'delivered',
        sequence: 3,
      }),
    ])
    expect([...mockState.asyncStorage.values()].join('')).not.toContain(
      'local-message-1',
    )
  })

  it('fails at max attempts but lets a later verified receipt advance to delivered', async () => {
    const alice = await BLECapabilityStore.open({
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      localIdentityId: 'alice',
    })
    const bob = await BLECapabilityStore.open({
      walletScope: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      localIdentityId: 'bob',
    })
    const aliceInbound = await alice.ensureInboundCapability('bob', now)
    const bobInbound = await bob.ensureInboundCapability('alice', now)
    await alice.acceptOutboundCapability(
      'bob',
      encodeBleRouteCapability(bobInbound.capability),
      now,
    )
    await bob.acceptOutboundCapability(
      'alice',
      encodeBleRouteCapability(aliceInbound.capability),
      now,
    )
    const pair = alice.getRoutePair('bob', now)!
    const envelope = createBleRouteEnvelope({
      payloadType: BlePayloadType.ChatCiphertext,
      flags: BleRouteFlags.StoreForward | BleRouteFlags.AcceptanceReceiptRequired,
      maxHops: 2,
      issuedAt: now,
      expiresAt: now + 20_000,
      payload: new Uint8Array([7]),
    }, pair.forward, pair.return, now)
    await alice.recordOutboundCorrelation({
      envelope,
      returnCapability: pair.return,
      localMessageId: 'local-message-2',
      remoteIdentityId: 'bob',
      now,
    })
    await alice.queueEnvelope({
      envelope,
      encoded: encodeBleRouteEnvelope(envelope),
      hopCount: 0,
      ttl: 2,
      maxMessages: 8,
      now,
    })
    await alice.markOutboundStored(envelope.envelopeId, now)
    alice.drainOutboundDeliveryEvents()

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      await alice.recordQueueAttempt(envelope.envelopeId, now + attempt)
    }
    expect(alice.drainOutboundDeliveryEvents()).toEqual([
      expect.objectContaining({
        state: 'failed',
        failureReason: 'max_attempts',
        attempts: 8,
      }),
    ])
    await expect(alice.getQueuedEnvelopes(now + 9)).resolves.toHaveLength(0)

    const receipt = createBleAcceptanceReceipt(
      envelope,
      pair.forward,
      pair.return,
      now + 10,
    )
    await expect(alice.acceptOutboundReceipt(receipt, 2, now + 11))
      .resolves.toBe(true)
    expect(alice.drainOutboundDeliveryEvents()).toEqual([
      expect.objectContaining({
        state: 'delivered',
        failureReason: null,
        attempts: 8,
      }),
    ])
    await alice.markOutboundFailed(
      envelope.envelopeId,
      'transmission_failed',
      now + 12,
    )
    expect(alice.drainOutboundDeliveryEvents()).toEqual([])

    const expiringEnvelope = createBleRouteEnvelope({
      payloadType: BlePayloadType.ChatCiphertext,
      flags: BleRouteFlags.StoreForward | BleRouteFlags.AcceptanceReceiptRequired,
      maxHops: 2,
      issuedAt: now,
      expiresAt: now + 100,
      payload: new Uint8Array([9]),
    }, pair.forward, pair.return, now)
    await alice.recordOutboundCorrelation({
      envelope: expiringEnvelope,
      returnCapability: pair.return,
      localMessageId: 'local-message-expiring',
      remoteIdentityId: 'bob',
      now,
    })
    await alice.queueEnvelope({
      envelope: expiringEnvelope,
      encoded: encodeBleRouteEnvelope(expiringEnvelope),
      hopCount: 0,
      ttl: 2,
      maxMessages: 8,
      now,
    })
    await alice.markOutboundStored(expiringEnvelope.envelopeId, now)
    alice.drainOutboundDeliveryEvents()

    await expect(alice.getQueuedEnvelopes(now + 101)).resolves.toHaveLength(0)
    expect(alice.drainOutboundDeliveryEvents()).toEqual([
      expect.objectContaining({
        localMessageId: 'local-message-expiring',
        state: 'failed',
        failureReason: 'expired',
      }),
    ])
  })

  it('rejects forged late receipts without advancing delivery state', async () => {
    const alice = await BLECapabilityStore.open({
      walletScope: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      localIdentityId: 'alice',
    })
    const bob = await BLECapabilityStore.open({
      walletScope: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      localIdentityId: 'bob',
    })
    const aliceInbound = await alice.ensureInboundCapability('bob', now)
    const bobInbound = await bob.ensureInboundCapability('alice', now)
    await alice.acceptOutboundCapability(
      'bob',
      encodeBleRouteCapability(bobInbound.capability),
      now,
    )
    await bob.acceptOutboundCapability(
      'alice',
      encodeBleRouteCapability(aliceInbound.capability),
      now,
    )
    const pair = alice.getRoutePair('bob', now)!
    const envelope = createBleRouteEnvelope({
      payloadType: BlePayloadType.ChatCiphertext,
      flags: BleRouteFlags.AcceptanceReceiptRequired,
      maxHops: 1,
      issuedAt: now,
      expiresAt: now + 10_000,
      payload: new Uint8Array([8]),
    }, pair.forward, pair.return, now)
    await alice.recordOutboundCorrelation({
      envelope,
      returnCapability: pair.return,
      localMessageId: 'local-message-3',
      remoteIdentityId: 'bob',
      now,
    })
    alice.drainOutboundDeliveryEvents()
    const forged = createBleAcceptanceReceipt(
      envelope,
      pair.forward,
      pair.return,
      now + 1,
    )
    forged.authTag[0] ^= 0xff

    await expect(alice.acceptOutboundReceipt(forged, 1, now + 2))
      .resolves.toBe(false)
    expect(alice.drainOutboundDeliveryEvents()).toEqual([])
  })
})
