/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { createTrackedIdentityFromBundle } from '../crypto/identityTracking'
import { tamperBase64, InMemoryChatStorage, makeIdentityMaterial, makeIdentityPair } from '../__tests__/helpers/cryptoTestHelpers'
import { setStorageInstance } from '../storage/local'
import {
  decryptSessionMessage,
  establishSessionAndDecrypt,
  establishSessionAsInitiator,
  establishSessionAsResponder,
  encryptSessionMessage,
} from './session'

async function installProtocolStorage() {
  const storage = new InMemoryChatStorage()
  setStorageInstance(storage)

  const { alice, bob } = makeIdentityPair()
  await storage.storeIdentity(alice.identity)
  await storage.storeIdentity(bob.identity)
  await storage.storePublicKeyBundle(alice.identity.id, alice.bundle)
  await storage.storePublicKeyBundle(bob.identity.id, bob.bundle)
  await storage.storePrivateKeyBundle(alice.identity.id, alice.privateBundle)
  await storage.storePrivateKeyBundle(bob.identity.id, bob.privateBundle)

  return { storage, alice, bob }
}

describe('full real-primitive session protocol', () => {
  beforeEach(() => {
    setStorageInstance(new InMemoryChatStorage())
  })

  it('establishes an Alice/Bob session, decrypts the bootstrap message, and decrypts a reply', async () => {
    const { alice, bob } = await installProtocolStorage()
    const aliceEstablished = await establishSessionAsInitiator(
      alice.identity,
      alice.privateBundle,
      bob.identity.id,
    )
    const initial = await encryptSessionMessage(
      aliceEstablished.session,
      'initial hello',
      alice.identity.dilithiumPrivateKey,
      0,
    )

    expect(initial.x3dhData).toBeDefined()

    const bobSession = await establishSessionAsResponder(
      bob.identity,
      bob.privateBundle,
      initial.x3dhData!,
      alice.identity.id,
    )
    const decryptedInitial = await decryptSessionMessage(
      bobSession,
      initial,
      alice.identity.dilithiumPublicKey,
    )

    expect(decryptedInitial.content).toBe('initial hello')

    const reply = await encryptSessionMessage(
      bobSession,
      'reply hello',
      bob.identity.dilithiumPrivateKey,
      0,
    )
    const decryptedReply = await decryptSessionMessage(
      aliceEstablished.session,
      reply,
      bob.identity.dilithiumPublicKey,
    )

    expect(decryptedReply.content).toBe('reply hello')
  })

  it('rejects replay of an already processed session message', async () => {
    const { alice, bob } = await installProtocolStorage()
    const aliceEstablished = await establishSessionAsInitiator(alice.identity, alice.privateBundle, bob.identity.id)
    const initial = await encryptSessionMessage(aliceEstablished.session, 'initial hello', alice.identity.dilithiumPrivateKey, 0)
    const bobSession = await establishSessionAsResponder(bob.identity, bob.privateBundle, initial.x3dhData!, alice.identity.id)

    await decryptSessionMessage(bobSession, initial, alice.identity.dilithiumPublicKey)

    await expect(decryptSessionMessage(bobSession, initial, alice.identity.dilithiumPublicKey)).rejects.toThrow()
  })

  it('blocks session establishment when tracked identity keys no longer match', async () => {
    const { storage, alice, bob } = await installProtocolStorage()
    const tracked = createTrackedIdentityFromBundle(bob.bundle)

    await storage.storePublicKeyBundle(bob.identity.id, {
      ...bob.bundle,
      identityKey: tamperBase64(bob.bundle.identityKey),
    })

    await expect(establishSessionAsInitiator(
      alice.identity,
      alice.privateBundle,
      bob.identity.id,
      { trackedIdentity: tracked },
    )).rejects.toMatchObject({
      details: { code: 'IDENTITY_MISMATCH' },
    })
  })

  it('does not consume OPKs until the first responder decrypt succeeds', async () => {
    const { storage, alice, bob } = await installProtocolStorage()
    const initialOPKCount = bob.bundle.oneTimePreKeys.length
    const aliceEstablished = await establishSessionAsInitiator(alice.identity, alice.privateBundle, bob.identity.id)
    const initial = await encryptSessionMessage(aliceEstablished.session, 'initial hello', alice.identity.dilithiumPrivateKey, 0)

    await expect(establishSessionAndDecrypt(
      bob.identity,
      bob.privateBundle,
      {
        ...initial,
        x3dhData: {
          ...initial.x3dhData!,
          mlkemCiphertext: tamperBase64(initial.x3dhData!.mlkemCiphertext),
        },
      },
      alice.identity.id,
    )).rejects.toThrow()

    expect((await storage.getPublicKeyBundle(bob.identity.id))?.oneTimePreKeys).toHaveLength(initialOPKCount)
    expect(await storage.getActiveSession(alice.identity.id)).toBeNull()
  })

  it('rejects bootstrap messages whose initiator keys do not match the claimed sender', async () => {
    const { storage, alice, bob } = await installProtocolStorage()
    const mallory = makeIdentityMaterial('mallory', 1)
    await storage.storeIdentity(mallory.identity)
    await storage.storePrivateKeyBundle(mallory.identity.id, mallory.privateBundle)
    await storage.storePublicKeyBundle(mallory.identity.id, mallory.bundle)

    const malloryEstablished = await establishSessionAsInitiator(
      mallory.identity,
      mallory.privateBundle,
      bob.identity.id,
    )
    const forgedInitial = await encryptSessionMessage(
      malloryEstablished.session,
      'forged hello',
      mallory.identity.dilithiumPrivateKey,
      0,
    )

    await expect(establishSessionAndDecrypt(
      bob.identity,
      bob.privateBundle,
      forgedInitial,
      alice.identity.id,
    )).rejects.toMatchObject({
      details: { code: 'IDENTITY_MISMATCH' },
    })
    expect(await storage.getActiveSession(alice.identity.id)).toBeNull()
  })

  it('consumes OPKs only after a successful bootstrap decrypt', async () => {
    const { storage, alice, bob } = await installProtocolStorage()
    const initialOPKCount = bob.bundle.oneTimePreKeys.length
    const aliceEstablished = await establishSessionAsInitiator(alice.identity, alice.privateBundle, bob.identity.id)
    const initial = await encryptSessionMessage(aliceEstablished.session, 'initial hello', alice.identity.dilithiumPrivateKey, 0)

    await expect(establishSessionAndDecrypt(
      bob.identity,
      bob.privateBundle,
      initial,
      alice.identity.id,
    )).resolves.toMatchObject({
      decrypted: { content: 'initial hello' },
    })

    expect((await storage.getPublicKeyBundle(bob.identity.id))?.oneTimePreKeys.length).toBeGreaterThanOrEqual(initialOPKCount - 1)
    expect(await storage.getActiveSession(alice.identity.id)).not.toBeNull()
  })

  it('establishes concurrent initiator sessions without auto-promoting archived sessions', async () => {
    const { storage, alice, bob } = await installProtocolStorage()
    const first = await establishSessionAsInitiator(alice.identity, alice.privateBundle, bob.identity.id)
    first.session.status = 'archived'
    first.session.archivedAt = Date.now()
    await storage.storeSession(first.session)

    const second = await establishSessionAsInitiator(alice.identity, alice.privateBundle, bob.identity.id)

    expect(first.session.id).not.toBe(second.session.id)
    expect((await storage.getSession(first.session.id))?.status).toBe('archived')
    expect((await storage.getActiveSession(bob.identity.id))?.id).toBe(second.session.id)
  })

  /*
    Keep the low-level responder constructor covered for callers that need to
    stage a session before decrypting through a separate transport pipeline.
  */
  it('constructs a responder session from valid X3DH data', async () => {
    const { alice, bob } = await installProtocolStorage()
    const aliceEstablished = await establishSessionAsInitiator(alice.identity, alice.privateBundle, bob.identity.id)
    const initial = await encryptSessionMessage(aliceEstablished.session, 'initial hello', alice.identity.dilithiumPrivateKey, 0)

    const bobSession = await establishSessionAsResponder(
      bob.identity,
      bob.privateBundle,
      initial.x3dhData!,
      alice.identity.id,
    )

    expect(bobSession.remoteIdentityId).toBe(alice.identity.id)
  })
})
