/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'
import { x25519 } from '@noble/curves/ed25519'
import {
  BleLinkManager,
  type BleLinkManagerOptions,
} from '../link/linkManager'
import {
  decodeHandshakeFrame,
  encodeHandshakeFrames,
} from '../link/handshakeFrames'
import { encodeTransportFrames } from '../link/transportFrames'

const encoder = new TextEncoder()

function staticKey(seed: number) {
  const privateKey = new Uint8Array(32).fill(seed)
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) }
}

describe('BleLinkManager', () => {
  it('authenticates large credentials across asymmetric iOS frame budgets', async () => {
    const aliceToBob: Uint8Array[] = []
    const bobToAlice: Uint8Array[] = []
    const aliceReceived = vi.fn()
    const bobReceived = vi.fn()
    const aliceAuthenticated = vi.fn()
    const bobAuthenticated = vi.fn()
    const aliceProgress = vi.fn()
    const bobProgress = vi.fn()
    const aliceCredential = new Uint8Array(3_500).fill(17)
    const bobCredential = new Uint8Array(3_500).fill(29)
    let alice!: BleLinkManager
    let bob!: BleLinkManager

    const options = (
      local: 'alice' | 'bob',
    ): BleLinkManagerOptions => ({
      staticKeyPair: staticKey(local === 'alice' ? 7 : 11),
      credential: local === 'alice' ? aliceCredential : bobCredential,
      verifyCredential: async (_deviceId, credential) => {
        const expected = local === 'alice' ? bobCredential : aliceCredential
        if (
          credential.length !== expected.length
          || !credential.every((byte, index) => byte === expected[index])
        ) return null
        return {
          identityId: local === 'alice' ? 'bob-identity' : 'alice-identity',
          knownContact: true,
        }
      },
      sendRaw: async (_deviceId, frames) => {
        const frameBudget = local === 'alice' ? 182 : 512
        expect(frames.every((frame) => frame.length <= frameBudget)).toBe(true)
        const outbound = local === 'alice' ? aliceToBob : bobToAlice
        outbound.push(...frames)
        return true
      },
      onSecureData: local === 'alice' ? aliceReceived : bobReceived,
      onAuthenticated: local === 'alice' ? aliceAuthenticated : bobAuthenticated,
      onHandshakeProgress: local === 'alice' ? aliceProgress : bobProgress,
      maxFrameBytes: () => local === 'alice' ? 182 : 512,
    })

    alice = new BleLinkManager(options('alice'))
    bob = new BleLinkManager(options('bob'))
    await alice.start('bob-device')

    for (let round = 0; round < 10; round += 1) {
      const forBob = aliceToBob.splice(0)
      await Promise.all(forBob.map((frame) => bob.receive('alice-device', frame)))
      const forAlice = bobToAlice.splice(0)
      await Promise.all(forAlice.map((frame) => alice.receive('bob-device', frame)))
    }

    expect(alice.isAuthenticated('bob-device')).toBe(true)
    expect(bob.isAuthenticated('alice-device')).toBe(true)
    await expect(alice.start('bob-device')).resolves.toBe(true)
    expect(alice.isAuthenticated('bob-device')).toBe(true)
    expect(aliceAuthenticated).toHaveBeenCalledWith(expect.objectContaining({
      identityId: 'bob-identity',
      knownContact: true,
    }))
    expect(bobAuthenticated).toHaveBeenCalledWith(expect.objectContaining({
      identityId: 'alice-identity',
      knownContact: true,
    }))
    expect(aliceProgress).toHaveBeenCalledWith('bob-device', 'step_1_sent')
    expect(aliceProgress).toHaveBeenCalledWith('bob-device', 'step_2_received')
    expect(aliceProgress).toHaveBeenCalledWith('bob-device', 'step_3_sent')
    expect(aliceProgress).toHaveBeenCalledWith('bob-device', 'transport_keys_ready')
    expect(aliceProgress).toHaveBeenCalledWith('bob-device', 'credential_authenticated')
    expect(bobProgress).toHaveBeenCalledWith('alice-device', 'step_1_received')
    expect(bobProgress).toHaveBeenCalledWith('alice-device', 'step_2_sent')
    expect(bobProgress).toHaveBeenCalledWith('alice-device', 'step_3_received')

    await Promise.all([
      alice.send('bob-device', encoder.encode('secure mesh frame')),
      alice.send('bob-device', encoder.encode('second secure frame')),
    ])
    const secureFrames = aliceToBob.splice(0)
    await Promise.all(
      secureFrames.map((frame) => bob.receive('alice-device', frame)),
    )
    expect(bobReceived).toHaveBeenCalledWith(
      'alice-device',
      'alice-identity',
      encoder.encode('secure mesh frame'),
    )
    expect(bobReceived).toHaveBeenLastCalledWith(
      'alice-device',
      'alice-identity',
      encoder.encode('second secure frame'),
    )

    const staleStepOne = encodeHandshakeFrames({
      handshakeId: new Uint8Array(8),
      step: 1,
      message: new Uint8Array([1]),
      mtu: 182,
    })
    for (const frame of staleStepOne) await alice.receive('bob-device', frame)
    expect(alice.isAuthenticated('bob-device')).toBe(true)
  })

  it('keeps a single Noise session when both radios start at once', async () => {
    const pending: Array<{
      target: 'alice' | 'bob'
      deviceId: string
      frame: Uint8Array
    }> = []
    const aliceAuthenticated = vi.fn()
    const bobAuthenticated = vi.fn()
    const aliceCredential = new Uint8Array(3_500).fill(41)
    const bobCredential = new Uint8Array(3_500).fill(43)
    let alice!: BleLinkManager
    let bob!: BleLinkManager

    const manager = (local: 'alice' | 'bob') => new BleLinkManager({
      staticKeyPair: staticKey(local === 'alice' ? 37 : 39),
      credential: local === 'alice' ? aliceCredential : bobCredential,
      verifyCredential: async (_deviceId, credential) => {
        const expected = local === 'alice' ? bobCredential : aliceCredential
        if (
          credential.length !== expected.length
          || !credential.every((byte, index) => byte === expected[index])
        ) return null
        return {
          identityId: local === 'alice' ? 'bob-identity' : 'alice-identity',
          knownContact: true,
        }
      },
      sendRaw: async (deviceId, frames) => {
        const target: 'alice' | 'bob' = local === 'alice' ? 'bob' : 'alice'
        const targetDeviceId = local === 'alice'
          ? (deviceId === 'bob-out' ? 'alice-in' : 'alice-out')
          : (deviceId === 'alice-out' ? 'bob-in' : 'bob-out')
        pending.push(...frames.map((frame) => ({
          target,
          deviceId: targetDeviceId,
          frame,
        })))
        return true
      },
      onSecureData: vi.fn(),
      onAuthenticated: local === 'alice' ? aliceAuthenticated : bobAuthenticated,
      maxFrameBytes: () => 64,
    })

    alice = manager('alice')
    bob = manager('bob')
    await Promise.all([
      alice.start('bob-out'),
      bob.start('alice-out'),
    ])

    for (let round = 0; round < 20 && (
      pending.length > 0
      || aliceAuthenticated.mock.calls.length < 1
      || bobAuthenticated.mock.calls.length < 1
    ); round += 1) {
      const batch = pending.splice(0)
      await Promise.all(batch.map(({ target, deviceId, frame }) =>
        (target === 'alice' ? alice : bob).receive(deviceId, frame)))
    }

    expect(aliceAuthenticated).toHaveBeenCalledTimes(1)
    expect(bobAuthenticated).toHaveBeenCalledTimes(1)
    const alicePeer = aliceAuthenticated.mock.calls[0][0]
    const bobPeer = bobAuthenticated.mock.calls[0][0]
    expect(new Set([alicePeer.role, bobPeer.role])).toEqual(
      new Set(['initiator', 'responder']),
    )
    if (alicePeer.role === 'initiator') {
      expect(alicePeer).toEqual(expect.objectContaining({
        deviceId: 'bob-out',
        identityId: 'bob-identity',
      }))
      expect(bobPeer).toEqual(expect.objectContaining({
        deviceId: 'alice-in',
        identityId: 'alice-identity',
      }))
    } else {
      expect(alicePeer).toEqual(expect.objectContaining({
        deviceId: 'bob-in',
        identityId: 'bob-identity',
      }))
      expect(bobPeer).toEqual(expect.objectContaining({
        deviceId: 'alice-out',
        identityId: 'alice-identity',
      }))
    }
  })

  it('arbitrates simultaneous initiators sharing one CoreBluetooth peer ID', async () => {
    const pending: Array<{
      target: 'alice' | 'bob'
      frame: Uint8Array
    }> = []
    const aliceAuthenticated = vi.fn()
    const bobAuthenticated = vi.fn()
    const aliceReceived = vi.fn()
    const bobReceived = vi.fn()
    const aliceCredential = new Uint8Array(3_500).fill(47)
    const bobCredential = new Uint8Array(3_500).fill(53)
    let aliceHandshakeId: Uint8Array | null = null
    let bobHandshakeId: Uint8Array | null = null
    let alice!: BleLinkManager
    let bob!: BleLinkManager

    const manager = (local: 'alice' | 'bob') => new BleLinkManager({
      staticKeyPair: staticKey(local === 'alice' ? 41 : 43),
      credential: local === 'alice' ? aliceCredential : bobCredential,
      verifyCredential: async (_deviceId, credential, remoteStaticKey) => {
        const expected = local === 'alice' ? bobCredential : aliceCredential
        const expectedStatic = staticKey(local === 'alice' ? 43 : 41).publicKey
        if (
          credential.length !== expected.length
          || !credential.every((byte, index) => byte === expected[index])
          || !remoteStaticKey.every((byte, index) => byte === expectedStatic[index])
        ) return null
        return {
          identityId: local === 'alice' ? 'bob-identity' : 'alice-identity',
          knownContact: true,
        }
      },
      sendRaw: async (_deviceId, frames) => {
        const target: 'alice' | 'bob' = local === 'alice' ? 'bob' : 'alice'
        if (local === 'alice' && !aliceHandshakeId) {
          aliceHandshakeId = decodeHandshakeFrame(frames[0]).handshakeId
        } else if (local === 'bob' && !bobHandshakeId) {
          bobHandshakeId = decodeHandshakeFrame(frames[0]).handshakeId
        }
        pending.push(...frames.map((frame) => ({ target, frame })))
        return true
      },
      onSecureData: local === 'alice' ? aliceReceived : bobReceived,
      onAuthenticated: local === 'alice' ? aliceAuthenticated : bobAuthenticated,
      maxFrameBytes: () => 182,
    })

    alice = manager('alice')
    bob = manager('bob')
    await Promise.all([
      alice.start('shared-peer'),
      bob.start('shared-peer'),
    ])

    for (let round = 0; round < 20 && (
      pending.length > 0
      || aliceAuthenticated.mock.calls.length === 0
      || bobAuthenticated.mock.calls.length === 0
    ); round += 1) {
      const batch = pending.splice(0)
      await Promise.all(batch.map(({ target, frame }) =>
        (target === 'alice' ? alice : bob).receive('shared-peer', frame)))
    }

    expect(alice.isAuthenticated('shared-peer')).toBe(true)
    expect(bob.isAuthenticated('shared-peer')).toBe(true)
    expect(aliceAuthenticated).toHaveBeenCalledTimes(1)
    expect(bobAuthenticated).toHaveBeenCalledTimes(1)
    expect(new Set([
      aliceAuthenticated.mock.calls[0][0].role,
      bobAuthenticated.mock.calls[0][0].role,
    ])).toEqual(new Set(['initiator', 'responder']))
    expect(aliceHandshakeId).not.toBeNull()
    expect(bobHandshakeId).not.toBeNull()
    let handshakeOrder = 0
    for (let index = 0; index < aliceHandshakeId!.length; index += 1) {
      if (aliceHandshakeId![index] !== bobHandshakeId![index]) {
        handshakeOrder = aliceHandshakeId![index] - bobHandshakeId![index]
        break
      }
    }
    expect(aliceAuthenticated.mock.calls[0][0].role).toBe(
      handshakeOrder < 0 ? 'initiator' : 'responder',
    )

    await expect(
      alice.send('shared-peer', encoder.encode('same-id secure frame')),
    ).resolves.toBe(true)
    while (pending.length > 0) {
      const batch = pending.splice(0)
      await Promise.all(batch.map(({ target, frame }) =>
        (target === 'alice' ? alice : bob).receive('shared-peer', frame)))
    }
    expect(bobReceived).toHaveBeenCalledWith(
      'shared-peer',
      'alice-identity',
      encoder.encode('same-id secure frame'),
    )
  })

  it('does not expose a secure route before handshake completion', async () => {
    const manager = new BleLinkManager({
      staticKeyPair: staticKey(17),
      credential: encoder.encode('local'),
      verifyCredential: async () => null,
      sendRaw: async () => true,
      onSecureData: vi.fn(),
    })

    expect(manager.isAuthenticated('unknown')).toBe(false)
    await expect(manager.send('unknown', encoder.encode('message'))).resolves.toBe(false)
  })

  it('does not start a second initiator while another handshake is in flight', async () => {
    const manager = new BleLinkManager({
      staticKeyPair: staticKey(19),
      credential: encoder.encode('local'),
      verifyCredential: async () => ({
        identityId: 'peer-identity',
        knownContact: true,
      }),
      sendRaw: async () => true,
      onSecureData: vi.fn(),
    })

    await expect(manager.start('peer-a')).resolves.toBe(true)
    await expect(manager.start('peer-b')).resolves.toBe(false)
    expect(manager.getRole('peer-a')).toBe('initiator')
    expect(manager.getRole('peer-b')).toBeNull()
    expect(manager.hasUnauthenticatedHandshake()).toBe(true)
  })

  it('reports handshake timeout so the native peer can reconnect', async () => {
    const onLinkFailure = vi.fn()
    const manager = new BleLinkManager({
      staticKeyPair: staticKey(18),
      credential: encoder.encode('local'),
      verifyCredential: async () => null,
      sendRaw: async () => true,
      onSecureData: vi.fn(),
      onLinkFailure,
    })
    await manager.start('peer')

    manager.cleanup(Date.now() + 45_001)

    expect(onLinkFailure).toHaveBeenCalledWith('peer', 'handshake', 'handshake_timeout')
  })

  it('reports handshake send failure so the banner can show the cause', async () => {
    const onLinkFailure = vi.fn()
    const manager = new BleLinkManager({
      staticKeyPair: staticKey(25),
      credential: encoder.encode('local'),
      verifyCredential: async () => null,
      sendRaw: async () => false,
      onSecureData: vi.fn(),
      onLinkFailure,
    })

    await expect(manager.start('peer')).resolves.toBe(false)
    expect(onLinkFailure).toHaveBeenCalledWith('peer', 'handshake', 'handshake_send_failed')
  })

  it('does not replace a live responder with a new initiator', async () => {
    const aliceToBob: Uint8Array[] = []
    const bobToAlice: Uint8Array[] = []
    const aliceCredential = encoder.encode('alice')
    const bobCredential = encoder.encode('bob')
    const alice = new BleLinkManager({
      staticKeyPair: staticKey(61),
      credential: aliceCredential,
      verifyCredential: async () => ({ identityId: 'bob-identity', knownContact: true }),
      sendRaw: async (_deviceId, frames) => {
        aliceToBob.push(...frames)
        return true
      },
      onSecureData: vi.fn(),
    })
    const bob = new BleLinkManager({
      staticKeyPair: staticKey(67),
      credential: bobCredential,
      verifyCredential: async () => ({ identityId: 'alice-identity', knownContact: true }),
      sendRaw: async (_deviceId, frames) => {
        bobToAlice.push(...frames)
        return true
      },
      onSecureData: vi.fn(),
    })
    await alice.start('bob-device')
    await Promise.all(aliceToBob.splice(0).map((frame) => bob.receive('alice-device', frame)))

    expect(bob.getRole('alice-device')).toBe('responder')
    await expect(bob.start('alice-device')).resolves.toBe(false)
    expect(bob.getRole('alice-device')).toBe('responder')
  })

  it('reports a malformed first handshake frame instead of a Noise failure', async () => {
    const onLinkFailure = vi.fn()
    const manager = new BleLinkManager({
      staticKeyPair: staticKey(71),
      credential: encoder.encode('local'),
      verifyCredential: async () => null,
      sendRaw: async () => true,
      onSecureData: vi.fn(),
      onLinkFailure,
    })
    const bad = new Uint8Array(24)
    bad[0] = 0x53
    bad[1] = 0x42
    bad[2] = 2
    bad[3] = 1
    bad[15] = 1

    await manager.receive('peer', bad)

    expect(onLinkFailure).toHaveBeenCalledWith('peer', 'handshake', 'handshake_malformed')
  })

  it('reports a Noise progress timeout when the first handshake message never advances', async () => {
    vi.useFakeTimers()
    const onLinkFailure = vi.fn()
    const manager = new BleLinkManager({
      staticKeyPair: staticKey(73),
      credential: encoder.encode('local'),
      verifyCredential: async () => null,
      sendRaw: async () => true,
      onSecureData: vi.fn(),
      onLinkFailure,
      maxFrameBytes: () => 64,
    })
    const frames = encodeHandshakeFrames({
      handshakeId: new Uint8Array(8).fill(1),
      step: 1,
      message: new Uint8Array([1, 2, 3, 4]),
      mtu: 64,
    })

    try {
      const receive = manager.receive('peer', frames[0])
      await vi.advanceTimersByTimeAsync(20_000)
      await receive
    } finally {
      vi.useRealTimers()
    }

    expect(onLinkFailure).toHaveBeenCalledWith(
      'peer',
      'handshake',
      'handshake_progress_timeout',
    )
  })

  it('does not publish progress from a removed link send', async () => {
    let resolveSend!: (sent: boolean) => void
    const sendRaw = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveSend = resolve
    }))
    const onHandshakeProgress = vi.fn()
    const manager = new BleLinkManager({
      staticKeyPair: staticKey(23),
      credential: encoder.encode('local'),
      verifyCredential: async () => null,
      sendRaw,
      onSecureData: vi.fn(),
      onHandshakeProgress,
    })

    const starting = manager.start('peer')
    await vi.waitFor(() => expect(sendRaw).toHaveBeenCalledTimes(1))
    manager.remove('peer')
    resolveSend(true)

    await expect(starting).resolves.toBe(false)
    expect(onHandshakeProgress).not.toHaveBeenCalled()
  })

  it('does not publish progress for an unexpected handshake step', async () => {
    const onHandshakeProgress = vi.fn()
    const manager = new BleLinkManager({
      staticKeyPair: staticKey(24),
      credential: encoder.encode('local'),
      verifyCredential: async () => null,
      sendRaw: async () => true,
      onSecureData: vi.fn(),
      onHandshakeProgress,
      maxFrameBytes: () => 64,
    })
    const frames = encodeHandshakeFrames({
      handshakeId: new Uint8Array(8).fill(1),
      step: 2,
      message: new Uint8Array([1]),
      mtu: 64,
    })

    for (const frame of frames) await manager.receive('peer', frame)

    expect(onHandshakeProgress).not.toHaveBeenCalled()
  })

  it('rejects transport fragments before Noise establishes transport keys', async () => {
    const onLinkFailure = vi.fn()
    const manager = new BleLinkManager({
      staticKeyPair: staticKey(19),
      credential: encoder.encode('local'),
      verifyCredential: async () => null,
      sendRaw: async () => true,
      onSecureData: vi.fn(),
      onLinkFailure,
      maxFrameBytes: () => 64,
    })
    await manager.start('peer')
    const [frame] = encodeTransportFrames({
      message: new Uint8Array([1]),
      maxFrameBytes: 64,
    })

    await manager.receive('peer', frame)

    expect(onLinkFailure).toHaveBeenCalledWith('peer', 'handshake', 'handshake_out_of_order')
    expect(manager.isAuthenticated('peer')).toBe(false)
  })

  it('fails closed when the encrypted credential is not trusted', async () => {
    const aliceToBob: Uint8Array[] = []
    const bobToAlice: Uint8Array[] = []
    const alice = new BleLinkManager({
      staticKeyPair: staticKey(21),
      credential: encoder.encode('alice-credential'),
      verifyCredential: async () => null,
      sendRaw: async (_deviceId, frames) => {
        aliceToBob.push(...frames)
        return true
      },
      onSecureData: vi.fn(),
    })
    const bob = new BleLinkManager({
      staticKeyPair: staticKey(22),
      credential: encoder.encode('bob-credential'),
      verifyCredential: async () => ({
        identityId: 'alice-identity',
        knownContact: true,
      }),
      sendRaw: async (_deviceId, frames) => {
        bobToAlice.push(...frames)
        return true
      },
      onSecureData: vi.fn(),
    })
    await alice.start('bob-device')

    for (let round = 0; round < 10; round += 1) {
      while (aliceToBob.length > 0) {
        await bob.receive('alice-device', aliceToBob.shift()!)
      }
      while (bobToAlice.length > 0) {
        await alice.receive('bob-device', bobToAlice.shift()!)
      }
    }

    expect(alice.isAuthenticated('bob-device')).toBe(false)
    await expect(alice.send('bob-device', encoder.encode('message'))).resolves.toBe(false)
  })

  it('rejects invalid static key material', async () => {
    const manager = new BleLinkManager({
      staticKeyPair: {
        publicKey: new Uint8Array(31),
        privateKey: new Uint8Array(32),
      },
      credential: encoder.encode('credential'),
      verifyCredential: async () => null,
      sendRaw: async () => true,
      onSecureData: vi.fn(),
    })

    await expect(manager.start('peer')).rejects.toThrow('must be 32 bytes')
  })

  it('rejects protocol v1 before creating a link', async () => {
    const manager = new BleLinkManager({
      staticKeyPair: staticKey(31),
      credential: encoder.encode('credential'),
      verifyCredential: async () => null,
      sendRaw: async () => true,
      onSecureData: vi.fn(),
    })

    await manager.receive('legacy-peer', Uint8Array.of(1, 1, 1, 1))

    expect(manager.isAuthenticated('legacy-peer')).toBe(false)
    expect(manager.getAuthenticatedIdentity('legacy-peer')).toBeNull()
  })

  it('does not treat leftover handshake frames as a post-auth Noise failure', async () => {
    const aliceToBob: Uint8Array[] = []
    const bobToAlice: Uint8Array[] = []
    let handshakeId: Uint8Array | null = null
    const onLinkFailure = vi.fn()
    const alice = new BleLinkManager({
      staticKeyPair: staticKey(51),
      credential: encoder.encode('alice-credential'),
      verifyCredential: async () => ({
        identityId: 'bob-identity',
        knownContact: true,
      }),
      sendRaw: async (_deviceId, frames) => {
        if (!handshakeId && frames[0]) {
          handshakeId = decodeHandshakeFrame(frames[0]).handshakeId.slice()
        }
        aliceToBob.push(...frames)
        return true
      },
      onSecureData: vi.fn(),
      onLinkFailure,
    })
    const bob = new BleLinkManager({
      staticKeyPair: staticKey(52),
      credential: encoder.encode('bob-credential'),
      verifyCredential: async () => ({
        identityId: 'alice-identity',
        knownContact: true,
      }),
      sendRaw: async (_deviceId, frames) => {
        bobToAlice.push(...frames)
        return true
      },
      onSecureData: vi.fn(),
    })
    await alice.start('bob-device')
    for (let round = 0; round < 10; round += 1) {
      if (alice.isAuthenticated('bob-device') && bob.isAuthenticated('alice-device')) break
      const forBob = aliceToBob.splice(0)
      await Promise.all(forBob.map((frame) => bob.receive('alice-device', frame)))
      const forAlice = bobToAlice.splice(0)
      await Promise.all(forAlice.map((frame) => alice.receive('bob-device', frame)))
    }
    expect(alice.isAuthenticated('bob-device')).toBe(true)
    expect(handshakeId).not.toBeNull()

    const leftover = encodeHandshakeFrames({
      handshakeId: handshakeId!,
      step: 1,
      message: new Uint8Array([1]),
      mtu: 64,
    })
    for (const frame of leftover) await alice.receive('bob-device', frame)
    expect(alice.isAuthenticated('bob-device')).toBe(true)
    expect(onLinkFailure).not.toHaveBeenCalled()
  })

  it('reports a post-auth plaintext failure as transport, not handshake', async () => {
    const aliceToBob: Uint8Array[] = []
    const bobToAlice: Uint8Array[] = []
    const onLinkFailure = vi.fn()
    let failPlaintext = false
    const alice = new BleLinkManager({
      staticKeyPair: staticKey(53),
      credential: encoder.encode('alice-credential'),
      verifyCredential: async () => ({
        identityId: 'bob-identity',
        knownContact: true,
      }),
      sendRaw: async (_deviceId, frames) => {
        aliceToBob.push(...frames)
        return true
      },
      onSecureData: async () => {
        if (failPlaintext) throw new Error('BLE Noise remote identity is unavailable')
      },
      onLinkFailure,
    })
    const bob = new BleLinkManager({
      staticKeyPair: staticKey(54),
      credential: encoder.encode('bob-credential'),
      verifyCredential: async () => ({
        identityId: 'alice-identity',
        knownContact: true,
      }),
      sendRaw: async (_deviceId, frames) => {
        bobToAlice.push(...frames)
        return true
      },
      onSecureData: vi.fn(),
    })
    await alice.start('bob-device')
    for (let round = 0; round < 10; round += 1) {
      if (alice.isAuthenticated('bob-device') && bob.isAuthenticated('alice-device')) break
      const forBob = aliceToBob.splice(0)
      await Promise.all(forBob.map((frame) => bob.receive('alice-device', frame)))
      const forAlice = bobToAlice.splice(0)
      await Promise.all(forAlice.map((frame) => alice.receive('bob-device', frame)))
    }
    expect(alice.isAuthenticated('bob-device')).toBe(true)

    failPlaintext = true
    await expect(bob.send('alice-device', encoder.encode('after-auth'))).resolves.toBe(true)
    const forAlice = bobToAlice.splice(0)
    await Promise.all(forAlice.map((frame) => alice.receive('bob-device', frame)))
    expect(onLinkFailure).toHaveBeenCalledWith('bob-device', 'transport', 'transport_failed')
    expect(alice.isAuthenticated('bob-device')).toBe(false)
  })

  it('keeps post-key application data that arrives before the identity credential', async () => {
    const aliceToBob: Uint8Array[] = []
    const bobToAlice: Uint8Array[] = []
    const bobReceived = vi.fn()
    const aliceCredential = new Uint8Array(3_500).fill(61)
    const bobCredential = new Uint8Array(3_500).fill(67)
    const alice = new BleLinkManager({
      staticKeyPair: staticKey(61),
      credential: aliceCredential,
      verifyCredential: async () => ({
        identityId: 'bob-identity',
        knownContact: true,
      }),
      sendRaw: async (_deviceId, frames) => {
        aliceToBob.push(...frames)
        return true
      },
      onSecureData: vi.fn(),
    })
    const bob = new BleLinkManager({
      staticKeyPair: staticKey(67),
      credential: bobCredential,
      verifyCredential: async () => ({
        identityId: 'alice-identity',
        knownContact: true,
      }),
      sendRaw: async (_deviceId, frames) => {
        bobToAlice.push(...frames)
        return true
      },
      onSecureData: bobReceived,
    })
    await alice.start('bob-device')
    let extraSent = false
    for (let round = 0; round < 400; round += 1) {
      if (
        alice.isAuthenticated('bob-device')
        && !bob.isAuthenticated('alice-device')
        && !extraSent
      ) {
        extraSent = true
        await alice.send('bob-device', encoder.encode('early-route'))
      }
      const nextToBob = aliceToBob.shift()
      if (nextToBob) await bob.receive('alice-device', nextToBob)
      const nextToAlice = bobToAlice.shift()
      if (nextToAlice) await alice.receive('bob-device', nextToAlice)
      if (
        alice.isAuthenticated('bob-device')
        && bob.isAuthenticated('alice-device')
        && extraSent
        && aliceToBob.length === 0
        && bobToAlice.length === 0
      ) break
    }
    expect(extraSent).toBe(true)
    expect(bob.isAuthenticated('alice-device')).toBe(true)
    expect(bobReceived).toHaveBeenCalledWith(
      'alice-device',
      'alice-identity',
      encoder.encode('early-route'),
    )
  })
})
