/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  BlePayloadType,
  BleRouteFlags,
  createBleAcceptanceReceipt,
  createBleRouteCapability,
  createBleRouteEnvelope,
  encodeBleAcceptanceReceipt,
  encodeBleRouteCapability,
  encryptSessionMessage,
  establishSessionAndDecrypt,
  establishSessionAsInitiator,
  type BleRouteCapability,
  type EncryptedMessage,
  type PublicKeyBundle,
} from '@spectra/core-crypto'
import {
  InMemoryChatStorage,
  makeIdentityPair,
} from '../../../packages/spectra-core-crypto/src/__tests__/helpers/cryptoTestHelpers'
import { setStorageInstance } from '../../../packages/spectra-core-crypto/src/storage/local'
import { BLEPeerRegistry } from '../peerRegistry'
import { BLEDirectTransport } from '../mesh/directTransport'
import { BLE_SECURE_LINK_PAYLOAD_BYTES } from '../link/linkManager'
import { getBLEMessageDiagnosticSnapshot } from '../messageDiagnostics'

function registry(remoteIdentityId: string, deviceId: string): BLEPeerRegistry {
  return registryMany([{ identityId: remoteIdentityId, deviceId }])
}

function registryMany(peers: Array<{
  identityId: string
  deviceId: string
}>): BLEPeerRegistry {
  const value = new BLEPeerRegistry()
  value.setKnownContacts(peers.map((peer) => ({
    identityId: peer.identityId,
    displayName: peer.identityId,
  })))
  for (const peer of peers) {
    value.authenticated({ ...peer, knownContact: true })
  }
  return value
}

function capability(seed: number, now: number): BleRouteCapability {
  return createBleRouteCapability(
    new Uint8Array(32).fill(seed),
    1,
    now - 1_000,
    now + 5 * 60_000,
  )
}

function encryptedMessage(messageId = 'message-1'): EncryptedMessage {
  return {
    header: {} as never,
    ciphertext: 'ciphertext',
    tag: 'tag',
    nonce: 'nonce',
    signature: 'signature',
    metadata: {
      messageId,
      senderId: 'alice',
      recipientId: 'bob',
      sessionId: 'session-1',
      timestamp: Date.now(),
      sequenceNumber: 1,
    },
    version: 3,
  }
}

function deliveryStoreMocks() {
  return {
    recordOutboundCorrelation: vi.fn(async () => true),
    markOutboundStored: vi.fn(async () => {}),
    markOutboundFailed: vi.fn(async () => {}),
    acceptOutboundReceipt: vi.fn(async () => true),
    reconcileOutbound: vi.fn(async () => []),
    drainOutboundDeliveryEvents: vi.fn(() => []),
    hasOutboundCorrelation: vi.fn(() => false),
  }
}

function productionBundle(identityId: string): PublicKeyBundle {
  return {
    identityId,
    identityKey: 'i'.repeat(44),
    mlkemIdentityKey: 'm'.repeat(1_580),
    dilithiumKey: 'd'.repeat(5_184),
    signedPreKey: {
      id: 1,
      x25519PublicKey: 'x'.repeat(44),
      mlkemPublicKey: 'p'.repeat(1_580),
      signature: 's'.repeat(6_618),
      timestamp: 1,
    },
    oneTimePreKeys: Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      x25519PublicKey: 'x'.repeat(44),
      mlkemPublicKey: 'o'.repeat(1_580),
    })),
    version: 1,
    timestamp: 1,
    bundleSignature: 'b'.repeat(6_618),
  }
}

describe('BLEDirectTransport', () => {
  it('delivers through an authenticated link and resolves only a core-authenticated receipt', async () => {
    const now = Date.now()
    const forward = capability(1, now)
    const reverse = capability(2, now)
    const aliceToBob: Uint8Array[] = []
    const bobToAlice: Uint8Array[] = []
    let completeIncoming!: () => void
    const incomingPending = new Promise<void>((resolve) => {
      completeIncoming = resolve
    })
    const onIncoming = vi.fn(() => incomingPending)

    const aliceStore = {
      ...deliveryStoreMocks(),
      getRoutePair: vi.fn(() => ({ forward, return: reverse })),
      getQueuedEnvelopes: vi.fn(async () => []),
      queueEnvelope: vi.fn(async () => true),
      deleteQueuedWithProof: vi.fn(async () => false),
    }
    const bobStore = {
      ...deliveryStoreMocks(),
      findInboundRoute: vi.fn(() => ({
        remoteIdentityId: 'alice',
        forward,
        return: reverse,
      })),
      hasReplay: vi.fn(() => false),
      checkAndRecordReplay: vi.fn(async () => true),
      getQueuedEnvelopes: vi.fn(async () => []),
      deleteQueuedWithProof: vi.fn(async () => false),
    }
    const aliceLink = {
      isAuthenticated: vi.fn(() => true),
      send: vi.fn(async (_deviceId: string, frame: Uint8Array) => {
        expect(frame.length).toBeLessThanOrEqual(BLE_SECURE_LINK_PAYLOAD_BYTES)
        aliceToBob.push(frame)
        return true
      }),
    }
    const bobLink = {
      isAuthenticated: vi.fn(() => true),
      send: vi.fn(async (_deviceId: string, frame: Uint8Array) => {
        expect(frame.length).toBeLessThanOrEqual(BLE_SECURE_LINK_PAYLOAD_BYTES)
        bobToAlice.push(frame)
        return true
      }),
    }
    const alice = new BLEDirectTransport({
      linkManager: aliceLink as never,
      peerRegistry: registry('bob', 'device-b'),
      capabilityStore: aliceStore as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })
    const bob = new BLEDirectTransport({
      linkManager: bobLink as never,
      peerRegistry: registry('alice', 'device-a'),
      capabilityStore: bobStore as never,
      onIncoming,
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })

    const result = alice.send('bob', encryptedMessage())
    await vi.waitFor(() => expect(aliceToBob.length).toBeGreaterThan(0))
    const expectedFrames = new DataView(
      aliceToBob[0].buffer,
      aliceToBob[0].byteOffset,
      aliceToBob[0].byteLength,
    ).getUint16(22, false)
    await vi.waitFor(() => expect(aliceToBob).toHaveLength(expectedFrames))
    const firstDelivery = Promise.all(aliceToBob.map(
      (frame) => bob.receiveSecure('device-a', 'alice', frame),
    ))
    await vi.waitFor(() => expect(onIncoming).toHaveBeenCalledTimes(1))
    bob.resetRadioSession()
    await Promise.all(aliceToBob.map(
      (frame) => bob.receiveSecure('device-a', 'alice', frame),
    ))
    expect(onIncoming).toHaveBeenCalledTimes(1)
    completeIncoming()
    await firstDelivery
    for (const frame of bobToAlice) {
      await alice.receiveSecure('device-b', 'bob', frame)
    }

    await expect(result).resolves.toEqual({ success: true, stored: false })
    expect(onIncoming).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ ciphertext: 'ciphertext' }),
      false,
    )
  })

  it('does not expire a receipt while a production-size message is transmitting', async () => {
    vi.useFakeTimers()
    try {
      const now = Date.now()
      const forward = capability(1, now)
      const reverse = capability(2, now)
      const aliceStore = {
        ...deliveryStoreMocks(),
        getRoutePair: vi.fn(() => ({ forward, return: reverse })),
        getQueuedEnvelopes: vi.fn(async () => []),
        queueEnvelope: vi.fn(async () => true),
        deleteQueuedWithProof: vi.fn(async () => false),
      }
      const bobStore = {
        ...deliveryStoreMocks(),
        findInboundRoute: vi.fn(() => ({
          remoteIdentityId: 'alice',
          forward,
          return: reverse,
        })),
        hasReplay: vi.fn(() => false),
        checkAndRecordReplay: vi.fn(async () => true),
        getQueuedEnvelopes: vi.fn(async () => []),
        deleteQueuedWithProof: vi.fn(async () => false),
      }
      let alice!: BLEDirectTransport
      let bob!: BLEDirectTransport
      const aliceLink = {
        isAuthenticated: vi.fn(() => true),
        send: vi.fn(async (_deviceId: string, frame: Uint8Array) => {
          await new Promise((resolve) => setTimeout(resolve, 400))
          await bob.receiveSecure('device-a', 'alice', frame)
          return true
        }),
      }
      const bobLink = {
        isAuthenticated: vi.fn(() => true),
        send: vi.fn(async (_deviceId: string, frame: Uint8Array) => {
          await alice.receiveSecure('device-b', 'bob', frame)
          return true
        }),
      }
      alice = new BLEDirectTransport({
        linkManager: aliceLink as never,
        peerRegistry: registry('bob', 'device-b'),
        capabilityStore: aliceStore as never,
        onIncoming: vi.fn(),
        onBundle: vi.fn(),
        onCapability: vi.fn(),
      })
      bob = new BLEDirectTransport({
        linkManager: bobLink as never,
        peerRegistry: registry('alice', 'device-a'),
        capabilityStore: bobStore as never,
        onIncoming: vi.fn(async () => {}),
        onBundle: vi.fn(),
        onCapability: vi.fn(),
      })
      const message: EncryptedMessage = {
        header: {} as never,
        ciphertext: 'ciphertext',
        tag: 'tag',
        nonce: 'nonce',
        signature: 's'.repeat(6_618),
        metadata: {
          messageId: 'message-production-size',
          senderId: 'alice',
          recipientId: 'bob',
          sessionId: 'session-1',
          timestamp: now,
          sequenceNumber: 1,
        },
        version: 3,
      }

      const result = alice.send('bob', message)
      await vi.runAllTimersAsync()

      expect(aliceLink.send.mock.calls.length * 400).toBeGreaterThan(20_000)
      await expect(result).resolves.toEqual({ success: true, stored: false })
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('moves an interrupted receipt wait into store-forward on radio reset', async () => {
    const now = Date.now()
    const delivery = deliveryStoreMocks()
    const link = {
      isAuthenticated: () => true,
      send: vi.fn(async () => true),
    }
    const store = {
      ...delivery,
      getRoutePair: () => ({
        forward: capability(1, now),
        return: capability(2, now),
      }),
      queueEnvelope: vi.fn(async () => true),
    }
    const transport = new BLEDirectTransport({
      linkManager: link as never,
      peerRegistry: registry('bob', 'device-b'),
      capabilityStore: store as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })
    transport.configure({
      relayEnabled: false,
      storeForwardEnabled: true,
      maxHops: 3,
      storeForwardMaxMessages: 8,
      storeForwardTTLMs: 60_000,
    })

    const result = transport.send('bob', encryptedMessage('radio-reset-message'))
    await vi.waitFor(() => expect(link.send).toHaveBeenCalled())
    transport.resetRadioSession()

    await expect(result).resolves.toEqual({ success: false, stored: true })
    expect(store.queueEnvelope).toHaveBeenCalled()
    expect(delivery.markOutboundStored).toHaveBeenCalled()
  })

  it('cleans pending receipt state when route transmission throws', async () => {
    const now = Date.now()
    const transport = new BLEDirectTransport({
      linkManager: {
        isAuthenticated: () => true,
        send: vi.fn(async () => {
          throw new Error('link unavailable')
        }),
      } as never,
      peerRegistry: registry('bob', 'device-b'),
      capabilityStore: {
        ...deliveryStoreMocks(),
        getRoutePair: () => ({
          forward: capability(1, now),
          return: capability(2, now),
        }),
      } as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })

    for (let attempt = 0; attempt < 33; attempt += 1) {
      await expect(transport.send('bob', encryptedMessage())).resolves.toEqual({
        success: false,
        stored: false,
        error: 'BLE message transmission failed',
      })
    }
  })

  it('bounds concurrent outbound receipt reservations under load', async () => {
    const now = Date.now()
    const store = {
      ...deliveryStoreMocks(),
      getRoutePair: () => ({
        forward: capability(1, now),
        return: capability(2, now),
      }),
    }
    const transport = new BLEDirectTransport({
      linkManager: {
        isAuthenticated: () => true,
        send: vi.fn(async () => false),
      } as never,
      peerRegistry: registry('bob', 'device-b'),
      capabilityStore: store as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })

    const results = await Promise.all(Array.from(
      { length: 33 },
      (_, index) => transport.send('bob', encryptedMessage(`message-${index}`)),
    ))

    expect(results.filter(
      (result) => result.error === 'BLE receipt limit reached',
    )).toHaveLength(1)
    expect(store.recordOutboundCorrelation).toHaveBeenCalledTimes(32)
  })

  it('accepts an authenticated receipt that arrives before the final send settles', async () => {
    const now = Date.now()
    const forward = capability(1, now)
    const reverse = capability(2, now)
    let alice!: BLEDirectTransport
    let bob!: BLEDirectTransport
    const aliceLink = {
      isAuthenticated: vi.fn(() => true),
      send: vi.fn(async (_deviceId: string, frame: Uint8Array) => {
        await bob.receiveSecure('device-a', 'alice', frame)
        const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
        const index = view.getUint16(20, false)
        const total = view.getUint16(22, false)
        return index + 1 < total
      }),
    }
    const bobLink = {
      isAuthenticated: vi.fn(() => true),
      send: vi.fn(async (_deviceId: string, frame: Uint8Array) => {
        await alice.receiveSecure('device-b', 'bob', frame)
        return true
      }),
    }
    alice = new BLEDirectTransport({
      linkManager: aliceLink as never,
      peerRegistry: registry('bob', 'device-b'),
      capabilityStore: {
        ...deliveryStoreMocks(),
        getRoutePair: () => ({ forward, return: reverse }),
        deleteQueuedWithProof: vi.fn(async () => false),
      } as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })
    bob = new BLEDirectTransport({
      linkManager: bobLink as never,
      peerRegistry: registry('alice', 'device-a'),
      capabilityStore: {
        findInboundRoute: () => ({
          remoteIdentityId: 'alice',
          forward,
          return: reverse,
        }),
        hasReplay: () => false,
        checkAndRecordReplay: vi.fn(async () => true),
      } as never,
      onIncoming: vi.fn(async () => {}),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })

    await expect(alice.send('bob', encryptedMessage())).resolves.toEqual({
      success: true,
      stored: false,
    })
  })

  it('does not delete a tracked queue entry for a forged receipt', async () => {
    const now = Date.now()
    const forward = capability(1, now)
    const reverse = capability(2, now)
    const envelope = createBleRouteEnvelope({
      payloadType: BlePayloadType.ChatCiphertext,
      flags: BleRouteFlags.StoreForward | BleRouteFlags.AcceptanceReceiptRequired,
      maxHops: 1,
      issuedAt: now,
      expiresAt: now + 60_000,
      payload: new Uint8Array([1]),
    }, forward, reverse, now)
    const forged = createBleAcceptanceReceipt(
      envelope,
      forward,
      reverse,
      now + 1,
    )
    forged.authTag[0] ^= 0xff
    const deleteQueuedWithProof = vi.fn(async () => true)
    const store = {
      ...deliveryStoreMocks(),
      acceptOutboundReceipt: vi.fn(async () => false),
      hasOutboundCorrelation: vi.fn(() => true),
      deleteQueuedWithProof,
    }
    const transport = new BLEDirectTransport({
      linkManager: {
        isAuthenticated: () => true,
        send: vi.fn(async () => true),
      } as never,
      peerRegistry: registry('bob', 'device-b'),
      capabilityStore: store as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })

    await (transport as any).receiveReceipt('device-b', {
      kind: 2,
      hopCount: 0,
      ttl: 1,
      payload: encodeBleAcceptanceReceipt(forged),
    })

    expect(deleteQueuedWithProof).not.toHaveBeenCalled()
    expect(transport.getStats().totalDropped).toBe(1)
  })

  it('exchanges binary route capabilities only over an authenticated mapping', async () => {
    const sent: Uint8Array[] = []
    const accepted = vi.fn(async () => true)
    const link = {
      isAuthenticated: vi.fn(() => true),
      send: vi.fn(async (_deviceId: string, frame: Uint8Array) => {
        sent.push(frame)
        return true
      }),
    }
    const receiver = new BLEDirectTransport({
      linkManager: link as never,
      peerRegistry: registry('alice', 'device-a'),
      capabilityStore: {} as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: accepted,
    })
    const routeCapability = capability(8, Date.now())

    await receiver.sendCapability(
      'device-a',
      encodeBleRouteCapability(routeCapability),
    )
    for (const frame of sent) {
      await receiver.receiveSecure('device-a', 'mallory', frame)
    }
    expect(accepted).not.toHaveBeenCalled()
    for (const frame of sent) {
      await receiver.receiveSecure('device-a', 'alice', frame)
    }
    expect(accepted).toHaveBeenCalledWith(
      'alice',
      encodeBleRouteCapability(routeCapability),
    )
  })

  it('sends only the compact signed portion of a production bundle', async () => {
    const sent: Uint8Array[] = []
    const received = vi.fn(async () => {})
    const sender = new BLEDirectTransport({
      linkManager: {
        isAuthenticated: () => true,
        send: async (_deviceId: string, frame: Uint8Array) => {
          sent.push(frame)
          return true
        },
      } as never,
      peerRegistry: registry('bob', 'device-b'),
      capabilityStore: {} as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })
    const receiver = new BLEDirectTransport({
      linkManager: {
        isAuthenticated: () => true,
        send: vi.fn(async () => true),
      } as never,
      peerRegistry: registry('alice', 'device-a'),
      capabilityStore: {} as never,
      onIncoming: vi.fn(),
      onBundle: received,
      onCapability: vi.fn(),
    })
    const bundle = productionBundle('alice')

    await expect(sender.sendBundle('device-b', bundle)).resolves.toBe(true)
    expect(sent.length).toBeGreaterThan(100)
    expect(sent.length).toBeLessThan(400)
    for (const frame of sent) {
      await receiver.receiveSecure('device-a', 'alice', frame)
    }

    expect(received).toHaveBeenCalledWith('alice', expect.objectContaining({
      identityId: 'alice',
      dilithiumKey: bundle.dilithiumKey,
      signedPreKey: bundle.signedPreKey,
      bundleSignature: bundle.bundleSignature,
      oneTimePreKeys: [],
    }))
  })

  it('converts asynchronous secure-link failures into send failure', async () => {
    const transport = new BLEDirectTransport({
      linkManager: {
        isAuthenticated: () => true,
        send: vi.fn(async () => {
          throw new Error('link unavailable')
        }),
      } as never,
      peerRegistry: registry('alice', 'device-a'),
      capabilityStore: {} as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })

    await expect(transport.sendBundle(
      'device-a',
      productionBundle('alice'),
    )).resolves.toBe(false)
    await expect(transport.sendCapability(
      'device-a',
      new Uint8Array([1]),
    )).resolves.toBe(false)
    await expect(transport.probe('device-a')).resolves.toBe(false)
  })

  it('acknowledges liveness only across an authenticated secure link', async () => {
    const aliceToBob: Uint8Array[] = []
    const bobToAlice: Uint8Array[] = []
    const alice = new BLEDirectTransport({
      linkManager: {
        isAuthenticated: () => true,
        send: async (_deviceId: string, frame: Uint8Array) => {
          aliceToBob.push(frame)
          return true
        },
      } as never,
      peerRegistry: registry('bob', 'device-b'),
      capabilityStore: {} as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })
    const bob = new BLEDirectTransport({
      linkManager: {
        isAuthenticated: () => true,
        send: async (_deviceId: string, frame: Uint8Array) => {
          bobToAlice.push(frame)
          return true
        },
      } as never,
      peerRegistry: registry('alice', 'device-a'),
      capabilityStore: {} as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })

    await expect(alice.probe('device-b')).resolves.toBe(true)
    for (const frame of aliceToBob) {
      await bob.receiveSecure('device-a', 'alice', frame)
    }
    expect(bobToAlice.length).toBeGreaterThan(0)
    for (const frame of bobToAlice) {
      await alice.receiveSecure('device-b', 'bob', frame)
    }
  })

  it('floods with monotonic hop/TTL metadata and returns an authenticated receipt', async () => {
    const now = Date.now()
    const forward = capability(4, now)
    const reverse = capability(5, now)
    const aliceToRelay: Uint8Array[] = []
    const relayToBob: Uint8Array[] = []
    const bobToRelay: Uint8Array[] = []
    const relayToAlice: Uint8Array[] = []
    const delivered = vi.fn(async () => {})
    const aliceStore = {
      ...deliveryStoreMocks(),
      getRoutePair: vi.fn(() => ({ forward, return: reverse })),
      getQueuedEnvelopes: vi.fn(async () => []),
      queueEnvelope: vi.fn(async () => false),
      deleteQueuedWithProof: vi.fn(async () => false),
    }
    const relayStore = {
      ...deliveryStoreMocks(),
      acceptOutboundReceipt: vi.fn(async () => false),
      findInboundRoute: vi.fn(() => null),
      getQueuedEnvelopes: vi.fn(async () => []),
      deleteQueuedWithProof: vi.fn(async () => false),
    }
    const bobStore = {
      ...deliveryStoreMocks(),
      findInboundRoute: vi.fn(() => ({
        remoteIdentityId: 'alice',
        forward,
        return: reverse,
      })),
      hasReplay: vi.fn(() => false),
      checkAndRecordReplay: vi.fn(async () => true),
      getQueuedEnvelopes: vi.fn(async () => []),
      deleteQueuedWithProof: vi.fn(async () => false),
    }
    const alice = new BLEDirectTransport({
      linkManager: {
        isAuthenticated: () => true,
        send: async (_deviceId: string, frame: Uint8Array) => {
          aliceToRelay.push(frame)
          return true
        },
      } as never,
      peerRegistry: registry('relay', 'device-r'),
      capabilityStore: aliceStore as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })
    const relay = new BLEDirectTransport({
      linkManager: {
        isAuthenticated: () => true,
        send: async (deviceId: string, frame: Uint8Array) => {
          if (deviceId === 'device-b') relayToBob.push(frame)
          if (deviceId === 'device-a') relayToAlice.push(frame)
          return true
        },
      } as never,
      peerRegistry: registryMany([
        { identityId: 'alice', deviceId: 'device-a' },
        { identityId: 'bob', deviceId: 'device-b' },
      ]),
      capabilityStore: relayStore as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })
    const bob = new BLEDirectTransport({
      linkManager: {
        isAuthenticated: () => true,
        send: async (_deviceId: string, frame: Uint8Array) => {
          bobToRelay.push(frame)
          return true
        },
      } as never,
      peerRegistry: registry('relay', 'device-r'),
      capabilityStore: bobStore as never,
      onIncoming: delivered,
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })
    for (const transport of [alice, relay, bob]) {
      transport.configure({
        relayEnabled: true,
        storeForwardEnabled: false,
        maxHops: 3,
        storeForwardMaxMessages: 8,
        storeForwardTTLMs: 60_000,
      })
    }

    const result = alice.send('bob', encryptedMessage())
    await vi.waitFor(() => expect(aliceToRelay.length).toBeGreaterThan(0))
    for (const frame of aliceToRelay) {
      await relay.receiveSecure('device-a', 'alice', frame)
    }
    expect(relayToBob.length).toBeGreaterThan(0)
    for (const frame of relayToBob) {
      await bob.receiveSecure('device-r', 'relay', frame)
    }
    for (const frame of bobToRelay) {
      await relay.receiveSecure('device-b', 'bob', frame)
    }
    for (const frame of relayToAlice) {
      await alice.receiveSecure('device-r', 'relay', frame)
    }

    await expect(result).resolves.toEqual({ success: true, stored: false })
    expect(delivered).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ ciphertext: 'ciphertext' }),
      true,
    )
  })

  it('delivers and decrypts a production-crypto bootstrap message end to end', async () => {
    const storage = new InMemoryChatStorage()
    setStorageInstance(storage)
    const { alice: aliceIdentity, bob: bobIdentity } = makeIdentityPair()
    for (const participant of [aliceIdentity, bobIdentity]) {
      await storage.storeIdentity(participant.identity)
      await storage.storePublicKeyBundle(
        participant.identity.id,
        participant.bundle,
      )
      await storage.storePrivateKeyBundle(
        participant.identity.id,
        participant.privateBundle,
      )
    }

    const established = await establishSessionAsInitiator(
      aliceIdentity.identity,
      aliceIdentity.privateBundle,
      bobIdentity.identity.id,
    )
    const encrypted = await encryptSessionMessage(
      established.session,
      'production BLE hello',
      aliceIdentity.identity.dilithiumPrivateKey,
      0,
    )
    expect(encrypted.x3dhData).toBeDefined()
    expect(encrypted.signature.length).toBeGreaterThan(6_000)

    const now = Date.now()
    const forward = capability(1, now)
    const reverse = capability(2, now)
    let alice!: BLEDirectTransport
    let bob!: BLEDirectTransport
    let decryptedContent: string | null = null
    const aliceLink = {
      isAuthenticated: vi.fn(() => true),
      send: vi.fn(async (_deviceId: string, frame: Uint8Array) => {
        await bob.receiveSecure(
          'device-a',
          aliceIdentity.identity.id,
          frame,
        )
        return true
      }),
    }
    const bobLink = {
      isAuthenticated: vi.fn(() => true),
      send: vi.fn(async (_deviceId: string, frame: Uint8Array) => {
        await alice.receiveSecure(
          'device-b',
          bobIdentity.identity.id,
          frame,
        )
        return true
      }),
    }
    alice = new BLEDirectTransport({
      linkManager: aliceLink as never,
      peerRegistry: registry(bobIdentity.identity.id, 'device-b'),
      capabilityStore: {
        ...deliveryStoreMocks(),
        getRoutePair: () => ({ forward, return: reverse }),
        getQueuedEnvelopes: vi.fn(async () => []),
        queueEnvelope: vi.fn(async () => true),
        deleteQueuedWithProof: vi.fn(async () => false),
      } as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })
    bob = new BLEDirectTransport({
      linkManager: bobLink as never,
      peerRegistry: registry(aliceIdentity.identity.id, 'device-a'),
      capabilityStore: {
        ...deliveryStoreMocks(),
        findInboundRoute: () => ({
          remoteIdentityId: aliceIdentity.identity.id,
          forward,
          return: reverse,
        }),
        hasReplay: vi.fn(() => false),
        checkAndRecordReplay: vi.fn(async () => true),
        getQueuedEnvelopes: vi.fn(async () => []),
        queueEnvelope: vi.fn(async () => true),
      } as never,
      onIncoming: async (_senderIdentityId, message) => {
        const result = await establishSessionAndDecrypt(
          bobIdentity.identity,
          bobIdentity.privateBundle,
          message,
          aliceIdentity.identity.id,
        )
        decryptedContent = result.decrypted.content
      },
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })

    const delivery = await alice.send(bobIdentity.identity.id, encrypted)
    expect({
      delivery,
      outbound: getBLEMessageDiagnosticSnapshot(bobIdentity.identity.id),
      inbound: getBLEMessageDiagnosticSnapshot(aliceIdentity.identity.id),
    }).toEqual({
      delivery: { success: true, stored: false },
      outbound: expect.objectContaining({ stage: 'receipt_received' }),
      inbound: expect.objectContaining({ stage: 'receipt_sent' }),
    })
    expect(decryptedContent).toBe('production BLE hello')
    expect(aliceLink.send.mock.calls.length).toBeGreaterThan(20)
    expect(bobLink.send).toHaveBeenCalled()
  }, 35_000)

  it('fails fast when no authenticated peer can refresh a missing route pair', async () => {
    const transport = new BLEDirectTransport({
      linkManager: {
        isAuthenticated: () => false,
        send: vi.fn(async () => true),
      } as never,
      peerRegistry: registry('bob', 'device-b'),
      capabilityStore: {
        ...deliveryStoreMocks(),
        getRoutePair: () => null,
        ensureInboundCapability: vi.fn(),
      } as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })

    await expect(transport.send('bob', encryptedMessage())).resolves.toEqual({
      success: false,
      stored: false,
      error: 'BLE route capability unavailable',
    })
  })

  it('asks the authenticated peer for a route capability before giving up', async () => {
    vi.useFakeTimers()
    try {
      const now = Date.now()
      const ensureInboundCapability = vi.fn(async () => ({
        capability: capability(2, now),
        rotated: false,
      }))
      const transport = new BLEDirectTransport({
        linkManager: {
          isAuthenticated: () => true,
          send: vi.fn(async () => true),
        } as never,
        peerRegistry: registry('bob', 'device-b'),
        capabilityStore: {
          ...deliveryStoreMocks(),
          getRoutePair: () => null,
          ensureInboundCapability,
          encodeCapability: vi.fn(() => encodeBleRouteCapability(capability(2, now))),
        } as never,
        onIncoming: vi.fn(),
        onBundle: vi.fn(),
        onCapability: vi.fn(),
      })

      const sending = transport.send('bob', encryptedMessage())
      await vi.advanceTimersByTimeAsync(6_100)
      await expect(sending).resolves.toEqual({
        success: false,
        stored: false,
        error: 'BLE route capability unavailable',
      })
      expect(ensureInboundCapability).toHaveBeenCalledWith(
        'bob',
        expect.any(Number),
        { rotateExpiring: false },
      )
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('announces the current inbound capability when a nearby route is not recognized', async () => {
    const now = Date.now()
    const forward = capability(1, now)
    const reverse = capability(2, now)
    const inbound = capability(3, now)
    const aliceToBob: Uint8Array[] = []
    const bobToAlice: Uint8Array[] = []
    const ensureInboundCapability = vi.fn(async () => ({
      capability: inbound,
      rotated: false,
    }))
    const encodeCapability = vi.fn(() => encodeBleRouteCapability(inbound))
    const alice = new BLEDirectTransport({
      linkManager: {
        isAuthenticated: () => true,
        send: async (_deviceId: string, frame: Uint8Array) => {
          aliceToBob.push(frame)
          return true
        },
      } as never,
      peerRegistry: registry('bob', 'device-b'),
      capabilityStore: {
        ...deliveryStoreMocks(),
        getRoutePair: () => ({ forward, return: reverse }),
        getQueuedEnvelopes: vi.fn(async () => []),
        queueEnvelope: vi.fn(async () => false),
      } as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })
    const bob = new BLEDirectTransport({
      linkManager: {
        isAuthenticated: () => true,
        send: async (_deviceId: string, frame: Uint8Array) => {
          bobToAlice.push(frame)
          return true
        },
      } as never,
      peerRegistry: registry('alice', 'device-a'),
      capabilityStore: {
        ...deliveryStoreMocks(),
        findInboundRoute: () => null,
        ensureInboundCapability,
        encodeCapability,
        getQueuedEnvelopes: vi.fn(async () => []),
        queueEnvelope: vi.fn(async () => false),
      } as never,
      onIncoming: vi.fn(),
      onBundle: vi.fn(),
      onCapability: vi.fn(),
    })

    const result = alice.send('bob', encryptedMessage())
    await vi.waitFor(() => expect(aliceToBob.length).toBeGreaterThan(0))
    for (const frame of [...aliceToBob]) {
      await bob.receiveSecure('device-a', 'alice', frame)
    }
    expect(ensureInboundCapability).toHaveBeenCalledWith(
      'alice',
      expect.any(Number),
      { rotateExpiring: false },
    )
    expect(bobToAlice.length).toBeGreaterThan(0)
    alice.resetRadioSession()
    await expect(result).resolves.toEqual({
      success: false,
      stored: false,
      error: 'BLE acceptance receipt timed out',
    })
  })

  it('resyncs the inbound capability and retries once after a receipt timeout', async () => {
    vi.useFakeTimers()
    try {
      const now = Date.now()
      const inbound = capability(3, now)
      const ensureInboundCapability = vi.fn(async () => ({
        capability: inbound,
        rotated: false,
      }))
      const encodeCapability = vi.fn(() => encodeBleRouteCapability(inbound))
      const send = vi.fn(async () => true)
      const transport = new BLEDirectTransport({
        linkManager: {
          isAuthenticated: () => true,
          send,
        } as never,
        peerRegistry: registry('bob', 'device-b'),
        capabilityStore: {
          ...deliveryStoreMocks(),
          getRoutePair: () => ({
            forward: capability(1, now),
            return: capability(2, now),
          }),
          ensureInboundCapability,
          encodeCapability,
          queueEnvelope: vi.fn(async () => false),
        } as never,
        onIncoming: vi.fn(),
        onBundle: vi.fn(),
        onCapability: vi.fn(),
      })

      const sending = transport.send('bob', encryptedMessage())
      await vi.advanceTimersByTimeAsync(0)
      expect(send).toHaveBeenCalled()
      const sendsAfterFirst = send.mock.calls.length
      await vi.advanceTimersByTimeAsync(20_000)
      expect(ensureInboundCapability).toHaveBeenCalledWith(
        'bob',
        expect.any(Number),
        { rotateExpiring: false },
      )
      await vi.advanceTimersByTimeAsync(400)
      expect(send.mock.calls.length).toBeGreaterThan(sendsAfterFirst)
      await vi.advanceTimersByTimeAsync(20_000)
      await expect(sending).resolves.toEqual({
        success: false,
        stored: false,
        error: 'BLE acceptance receipt timed out',
      })
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })
})
