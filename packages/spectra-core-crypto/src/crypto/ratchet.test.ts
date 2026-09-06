/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import type { EncryptedMessage, MessageHeader, MessageMetadata, SessionState } from '../types'
import {
  deserializeSessionState,
  initSessionAsInitiator,
  initSessionAsResponder,
  ratchetDecrypt,
  ratchetEncrypt,
  securelyDeleteSessionState,
  serializeSessionState,
} from './ratchet'
import { x3dhInitiator, x3dhResponder } from './x3dh'
import { makeIdentityPair, tamperBase64, tamperHex } from '../__tests__/helpers/cryptoTestHelpers'

async function makeRatchetPair() {
  const { alice, bob } = makeIdentityPair()
  const x3dh = await x3dhInitiator(
    alice.privateBundle.identityPrivateKey,
    alice.identity.identityPublicKey,
    alice.identity.dilithiumPublicKey,
    bob.bundle,
    { preferredOTPKId: bob.bundle.oneTimePreKeys[0].id },
  )
  const responder = await x3dhResponder(
    {
      initiatorIdentityKey: alice.identity.identityPublicKey,
      initiatorEphemeralKey: x3dh.ephemeralPublicKey,
      mlkemCiphertext: x3dh.mlkemCiphertext,
      usedOneTimePreKeyId: x3dh.usedOneTimePreKeyId,
      usedSignedPreKeyId: x3dh.usedSignedPreKeyId,
      initiatorDilithiumKey: alice.identity.dilithiumPublicKey,
      bundleTimestamp: x3dh.bundleTimestamp,
    },
    bob.privateBundle.identityPrivateKey,
    bob.identity.identityPublicKey,
    bob.identity.dilithiumPublicKey,
    bob.bundle.mlkemIdentityKey,
    bob.privateBundle.signedPreKeyPrivate,
    bob.privateBundle.mlkemSignedPreKeyPrivate,
    bob.privateBundle.oneTimePreKeyPrivates,
    bob.privateBundle.mlkemOneTimePreKeyPrivates,
    bob.bundle,
    bob.privateBundle,
  )

  return {
    alice,
    bob,
    associatedData: x3dh.associatedData,
    fingerprint: x3dh.sessionFingerprint,
    aliceState: initSessionAsInitiator(
      x3dh.sharedSecret,
      bob.bundle.signedPreKey.x25519PublicKey,
      {
        publicKey: x3dh.ephemeralPublicKey,
        privateKey: x3dh.ephemeralPrivateKey,
      },
    ),
    bobState: initSessionAsResponder(
      responder.sharedSecret,
      {
        publicKey: bob.bundle.signedPreKey.x25519PublicKey,
        privateKey: bob.privateBundle.signedPreKeyPrivate,
      },
      x3dh.ephemeralPublicKey,
    ),
  }
}

async function encryptFromAlice(
  state: SessionState,
  privateKey: string,
  plaintext: string,
  sequenceNumber: number,
  associatedData: Uint8Array,
  fingerprint: string,
  enableHeaderEncryption = true,
): Promise<EncryptedMessage> {
  return ratchetEncrypt(
    state,
    plaintext,
    privateKey,
    {
      senderId: 'alice',
      recipientId: 'bob',
      sessionId: 'session',
      sequenceNumber,
    },
    { associatedData, enableHeaderEncryption, sessionFingerprint: fingerprint },
  )
}

function reorderMessageObjects(message: EncryptedMessage): EncryptedMessage {
  const header = message.header
  const metadata = message.metadata
  return {
    ...message,
    header: {
      sessionFingerprint: header.sessionFingerprint,
      previousChainLength: header.previousChainLength,
      messageNumber: header.messageNumber,
      ratchetKey: header.ratchetKey,
    } as MessageHeader,
    metadata: {
      previousMessageHash: metadata.previousMessageHash,
      sequenceNumber: metadata.sequenceNumber,
      timestamp: metadata.timestamp,
      sessionId: metadata.sessionId,
      recipientId: metadata.recipientId,
      senderId: metadata.senderId,
      messageId: metadata.messageId,
    } as MessageMetadata,
  }
}

describe('Double Ratchet real protocol flow', () => {
  it('decrypts an initial header-encrypted message and a reply', async () => {
    const { alice, bob, aliceState, bobState, associatedData, fingerprint } = await makeRatchetPair()

    const first = await encryptFromAlice(
      aliceState,
      alice.identity.dilithiumPrivateKey,
      'hello bob',
      0,
      associatedData,
      fingerprint,
    )
    await expect(ratchetDecrypt(bobState, first, alice.identity.dilithiumPublicKey, { associatedData })).resolves.toBe('hello bob')

    const reply = await ratchetEncrypt(
      bobState,
      'hello alice',
      bob.identity.dilithiumPrivateKey,
      {
        senderId: 'bob',
        recipientId: 'alice',
        sessionId: 'session',
        sequenceNumber: 0,
      },
      { associatedData, enableHeaderEncryption: true, sessionFingerprint: fingerprint },
    )

    await expect(ratchetDecrypt(aliceState, reply, bob.identity.dilithiumPublicKey, { associatedData })).resolves.toBe('hello alice')
  })

  it('decrypts multiple messages in one sending chain in order', async () => {
    const { alice, bobState, aliceState, associatedData, fingerprint } = await makeRatchetPair()
    const messages = [
      await encryptFromAlice(aliceState, alice.identity.dilithiumPrivateKey, 'one', 0, associatedData, fingerprint, false),
      await encryptFromAlice(aliceState, alice.identity.dilithiumPrivateKey, 'two', 1, associatedData, fingerprint, false),
      await encryptFromAlice(aliceState, alice.identity.dilithiumPrivateKey, 'three', 2, associatedData, fingerprint, false),
    ]

    expect(await ratchetDecrypt(bobState, messages[0], alice.identity.dilithiumPublicKey, { associatedData })).toBe('one')
    expect(await ratchetDecrypt(bobState, messages[1], alice.identity.dilithiumPublicKey, { associatedData })).toBe('two')
    expect(await ratchetDecrypt(bobState, messages[2], alice.identity.dilithiumPublicKey, { associatedData })).toBe('three')
  })

  it('decrypts delayed messages using skipped keys', async () => {
    const { alice, bobState, aliceState, associatedData, fingerprint } = await makeRatchetPair()
    const first = await encryptFromAlice(aliceState, alice.identity.dilithiumPrivateKey, 'first', 0, associatedData, fingerprint, false)
    const second = await encryptFromAlice(aliceState, alice.identity.dilithiumPrivateKey, 'second', 1, associatedData, fingerprint, false)
    const third = await encryptFromAlice(aliceState, alice.identity.dilithiumPrivateKey, 'third', 2, associatedData, fingerprint, false)

    expect(await ratchetDecrypt(bobState, third, alice.identity.dilithiumPublicKey, { associatedData })).toBe('third')
    expect(bobState.skippedMessageKeys.size).toBe(2)
    expect(await ratchetDecrypt(bobState, first, alice.identity.dilithiumPublicKey, { associatedData })).toBe('first')
    expect(await ratchetDecrypt(bobState, second, alice.identity.dilithiumPublicKey, { associatedData })).toBe('second')
  })

  it('normalizes skipped-key AAD for delayed messages with reordered object keys', async () => {
    const { alice, bobState, aliceState, associatedData, fingerprint } = await makeRatchetPair()
    const first = reorderMessageObjects(
      await encryptFromAlice(aliceState, alice.identity.dilithiumPrivateKey, 'first', 0, associatedData, fingerprint, false),
    )
    const second = await encryptFromAlice(aliceState, alice.identity.dilithiumPrivateKey, 'second', 1, associatedData, fingerprint, false)

    expect(await ratchetDecrypt(bobState, second, alice.identity.dilithiumPublicKey, { associatedData })).toBe('second')
    expect(await ratchetDecrypt(bobState, first, alice.identity.dilithiumPublicKey, { associatedData })).toBe('first')
  })
})

describe('Double Ratchet tamper, replay, and serialization behavior', () => {
  it('rejects tampered message fields before advancing receiving state', async () => {
    const { alice, bobState, aliceState, associatedData, fingerprint } = await makeRatchetPair()
    const encrypted = await encryptFromAlice(aliceState, alice.identity.dilithiumPrivateKey, 'secure', 0, associatedData, fingerprint, false)
    const originalIndex = bobState.receivingChainKey?.index

    await expect(ratchetDecrypt(
      bobState,
      { ...encrypted, ciphertext: tamperBase64(encrypted.ciphertext) },
      alice.identity.dilithiumPublicKey,
      { associatedData },
    )).rejects.toThrow()
    expect(bobState.receivingChainKey?.index).toBe(originalIndex)

    await expect(ratchetDecrypt(
      bobState,
      { ...encrypted, signature: tamperHex(encrypted.signature) },
      alice.identity.dilithiumPublicKey,
      { associatedData },
    )).rejects.toThrow()
    expect(bobState.receivingChainKey?.index).toBe(originalIndex)
  })

  it('rejects replaying the same encrypted message after successful decrypt', async () => {
    const { alice, bobState, aliceState, associatedData, fingerprint } = await makeRatchetPair()
    const encrypted = await encryptFromAlice(aliceState, alice.identity.dilithiumPrivateKey, 'once', 0, associatedData, fingerprint, false)

    expect(await ratchetDecrypt(bobState, encrypted, alice.identity.dilithiumPublicKey, { associatedData })).toBe('once')
    await expect(ratchetDecrypt(bobState, encrypted, alice.identity.dilithiumPublicKey, { associatedData })).rejects.toThrow()
  })

  it('rejects unsupported future message versions', async () => {
    const { alice, bobState, aliceState, associatedData, fingerprint } = await makeRatchetPair()
    const encrypted = await encryptFromAlice(aliceState, alice.identity.dilithiumPrivateKey, 'future', 0, associatedData, fingerprint, false)

    await expect(ratchetDecrypt(
      bobState,
      { ...encrypted, version: 999 },
      alice.identity.dilithiumPublicKey,
      { associatedData },
    )).rejects.toThrow()
  })

  it('serializes and deserializes session state with chains and header keys intact', async () => {
    const { aliceState } = await makeRatchetPair()
    const serialized = serializeSessionState(aliceState)
    const deserialized = deserializeSessionState(serialized)

    expect(deserialized.rootKey).toEqual(aliceState.rootKey)
    expect(deserialized.sendingChainKey?.key).toEqual(aliceState.sendingChainKey?.key)
    expect(deserialized.sendingHeaderKey).toEqual(aliceState.sendingHeaderKey)
    expect(() => deserializeSessionState(JSON.stringify({ rootKey: 'bad' }))).toThrow()
  })

  it('zeros Uint8Array key material during secure deletion', async () => {
    const { aliceState } = await makeRatchetPair()
    const rootKey = aliceState.rootKey

    securelyDeleteSessionState(aliceState)

    expect(Array.from(rootKey)).toEqual(new Array(32).fill(0))
    expect(aliceState.sendingChainKey).toBeNull()
    expect(aliceState.localRatchetKeyPair).toBeNull()
  })

  it('omits plaintext headers when header encryption is enabled', async () => {
    const { alice, aliceState, associatedData, fingerprint } = await makeRatchetPair()
    const encrypted = await encryptFromAlice(
      aliceState,
      alice.identity.dilithiumPrivateKey,
      'metadata should be hidden',
      0,
      associatedData,
      fingerprint,
      true,
    )

    expect(encrypted.header).toBeUndefined()
  })
})
