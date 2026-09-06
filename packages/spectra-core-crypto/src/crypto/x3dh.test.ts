/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  bundleNeedsRefresh,
  consumeOneTimePreKey,
  createX3DHHeader,
  generateOneTimePreKeysAsync,
  OPK_GENERATE_YIELD_EVERY,
  parseX3DHHeader,
  replenishOneTimePreKeys,
  replenishOneTimePreKeysAsync,
  rotateSignedPreKey,
  STARTUP_PREKEY_COUNT,
  verifyPublicKeyBundle,
  verifyPublicKeyBundleAsync,
  x3dhInitiator,
  x3dhResponder,
} from './x3dh'
import { bytesToBase64, generateRandomBytes } from './utils'
import {
  buildDefaultBundleMetadataCapabilities,
  bundleSupportsScopedMailbox,
  signBundleMetadataCapabilities,
} from './bundleCapabilities'
import {
  int32LE,
  int64LE,
  makeIdentityPair,
  tamperBase64,
  tamperHex,
} from '../__tests__/helpers/cryptoTestHelpers'

async function responderSecretFor(
  bob: ReturnType<typeof makeIdentityPair>['bob'],
  initiator: Awaited<ReturnType<typeof x3dhInitiator>>,
  bundle = bob.bundle,
  privateBundle = bob.privateBundle,
) {
  return x3dhResponder(
    {
      initiatorIdentityKey: initiator.identityPublicKey,
      initiatorEphemeralKey: initiator.ephemeralPublicKey,
      mlkemCiphertext: initiator.mlkemCiphertext,
      usedOneTimePreKeyId: initiator.usedOneTimePreKeyId,
      usedSignedPreKeyId: initiator.usedSignedPreKeyId,
      initiatorDilithiumKey: 'unused-in-kdf-but-bound',
      bundleTimestamp: initiator.bundleTimestamp,
    },
    bob.privateBundle.identityPrivateKey,
    bob.identity.identityPublicKey,
    bob.identity.dilithiumPublicKey,
    bob.bundle.mlkemIdentityKey,
    privateBundle.signedPreKeyPrivate,
    privateBundle.mlkemSignedPreKeyPrivate,
    privateBundle.oneTimePreKeyPrivates,
    privateBundle.mlkemOneTimePreKeyPrivates,
    bundle,
    privateBundle,
  )
}

describe('hybrid X3DH agreement', () => {
  it('derives matching shared secrets and associated data with a one-time prekey', async () => {
    const { alice, bob } = makeIdentityPair()
    const selectedOPK = bob.bundle.oneTimePreKeys[0]
    const initiator = await x3dhInitiator(
      alice.privateBundle.identityPrivateKey,
      alice.identity.identityPublicKey,
      alice.identity.dilithiumPublicKey,
      bob.bundle,
      { preferredOTPKId: selectedOPK.id },
    )
    const responder = await x3dhResponder(
      {
        initiatorIdentityKey: alice.identity.identityPublicKey,
        initiatorEphemeralKey: initiator.ephemeralPublicKey,
        mlkemCiphertext: initiator.mlkemCiphertext,
        usedOneTimePreKeyId: initiator.usedOneTimePreKeyId,
        usedSignedPreKeyId: initiator.usedSignedPreKeyId,
        initiatorDilithiumKey: alice.identity.dilithiumPublicKey,
        bundleTimestamp: initiator.bundleTimestamp,
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

    expect(initiator.sharedSecret).toEqual(responder.sharedSecret)
    expect(initiator.associatedData).toEqual(responder.associatedData)
    expect(initiator.usedOneTimePreKeyId).toBe(selectedOPK.id)
  })

  it('derives matching shared secrets without one-time prekeys', async () => {
    const { alice, bob } = makeIdentityPair(0)
    const initiator = await x3dhInitiator(
      alice.privateBundle.identityPrivateKey,
      alice.identity.identityPublicKey,
      alice.identity.dilithiumPublicKey,
      bob.bundle,
    )
    const responder = await x3dhResponder(
      {
        initiatorIdentityKey: alice.identity.identityPublicKey,
        initiatorEphemeralKey: initiator.ephemeralPublicKey,
        mlkemCiphertext: initiator.mlkemCiphertext,
        usedSignedPreKeyId: initiator.usedSignedPreKeyId,
        initiatorDilithiumKey: alice.identity.dilithiumPublicKey,
        bundleTimestamp: initiator.bundleTimestamp,
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

    expect(initiator.sharedSecret).toEqual(responder.sharedSecret)
    expect(initiator.usedOneTimePreKeyId).toBeUndefined()
  })

  it('uses previous signed prekeys during the retention window', async () => {
    const { alice, bob } = makeIdentityPair()
    const oldBundle = bob.bundle
    const rotated = rotateSignedPreKey(bob.bundle, bob.privateBundle, bob.identity.dilithiumPrivateKey)
    const initiator = await x3dhInitiator(
      alice.privateBundle.identityPrivateKey,
      alice.identity.identityPublicKey,
      alice.identity.dilithiumPublicKey,
      oldBundle,
      { preferredOTPKId: oldBundle.oneTimePreKeys[0].id },
    )
    const responder = await responderSecretFor(bob, initiator, rotated.bundle, rotated.privateBundle)

    expect(responder.sharedSecret).toEqual(initiator.sharedSecret)
  })
})

describe('X3DH bundle verification and lifecycle', () => {
  it('verifies valid bundles and rejects tampered signed fields', () => {
    const { bob } = makeIdentityPair()

    expect(verifyPublicKeyBundle(bob.bundle).valid).toBe(true)
    expect(verifyPublicKeyBundle({ ...bob.bundle, identityKey: tamperBase64(bob.bundle.identityKey) }).valid).toBe(false)
    expect(verifyPublicKeyBundle({ ...bob.bundle, mlkemIdentityKey: bytesToBase64(generateRandomBytes(1184)) }).valid).toBe(false)
    expect(verifyPublicKeyBundle({ ...bob.bundle, dilithiumKey: tamperHex(bob.bundle.dilithiumKey) }).valid).toBe(false)
    expect(verifyPublicKeyBundle({
      ...bob.bundle,
      signedPreKey: { ...bob.bundle.signedPreKey, signature: tamperHex(bob.bundle.signedPreKey.signature) },
    }).valid).toBe(false)
    expect(verifyPublicKeyBundle({ ...bob.bundle, bundleSignature: tamperHex(bob.bundle.bundleSignature!) }).valid).toBe(false)
  })

  it('matches async bundle verification against the synchronous oracle', async () => {
    const { bob } = makeIdentityPair()
    await expect(verifyPublicKeyBundleAsync(bob.bundle)).resolves.toEqual(verifyPublicKeyBundle(bob.bundle))
    await expect(
      verifyPublicKeyBundleAsync({ ...bob.bundle, bundleSignature: tamperHex(bob.bundle.bundleSignature!) }),
    ).resolves.toEqual({ valid: false, error: 'Bundle signature verification failed' })
  })

  it('rejects bundles missing the outer bundle signature', () => {
    const { bob } = makeIdentityPair()
    const unsigned = { ...bob.bundle, bundleSignature: undefined }

    expect(verifyPublicKeyBundle(unsigned).valid).toBe(false)
  })

  it('verifies separately signed metadata capabilities without profile metadata', () => {
    const { bob } = makeIdentityPair()
    const capabilities = buildDefaultBundleMetadataCapabilities(Date.now())
    const capabilityBundle = {
      ...bob.bundle,
      metadataCapabilities: capabilities,
      capabilitiesSignature: signBundleMetadataCapabilities(
        bob.bundle,
        capabilities,
        bob.privateBundle.dilithiumPrivateKey,
      ),
    }

    expect(bundleSupportsScopedMailbox(bob.bundle)).toBe(true)
    expect(verifyPublicKeyBundle(capabilityBundle).valid).toBe(true)
    expect(verifyPublicKeyBundle({
      ...capabilityBundle,
      metadataCapabilities: {
        ...capabilities,
        // @ts-expect-error Legacy profile metadata is forbidden.
        publicDisplayName: 'Mallory',
      },
    }).valid).toBe(false)
    expect(verifyPublicKeyBundle({
      ...bob.bundle,
      metadataCapabilities: {
        ...bob.bundle.metadataCapabilities!,
        mailboxTokens: ['legacy_v1'],
      },
    }).valid).toBe(false)
    expect(verifyPublicKeyBundle({
      ...bob.bundle,
      metadataCapabilities: undefined,
      capabilitiesSignature: undefined,
    }).valid).toBe(true)
    expect(bundleSupportsScopedMailbox({
      ...bob.bundle,
      metadataCapabilities: undefined,
      capabilitiesSignature: undefined,
    })).toBe(false)
  })

  it('detects bundles needing proactive refresh', () => {
    const { bob } = makeIdentityPair(1)

    expect(bundleNeedsRefresh(bob.bundle, { minOTPKs: 2 })).toEqual({
      needsRefresh: true,
      reason: 'Low OPK count: 1',
    })
  })

  it('keeps public and private OPK maps in sync while consuming and replenishing', () => {
    const { bob } = makeIdentityPair(2)
    const usedId = bob.bundle.oneTimePreKeys[0].id
    const consumed = consumeOneTimePreKey(bob.bundle, bob.privateBundle, usedId)

    expect(consumed.bundle.oneTimePreKeys.some(k => k.id === usedId)).toBe(false)
    expect(consumed.privateBundle.oneTimePreKeyPrivates.has(usedId)).toBe(false)
    expect(consumed.privateBundle.mlkemOneTimePreKeyPrivates.has(usedId)).toBe(false)

    const replenished = replenishOneTimePreKeys(consumed.bundle, consumed.privateBundle, 4)
    expect(replenished.bundle.oneTimePreKeys).toHaveLength(4)
    for (const opk of replenished.bundle.oneTimePreKeys) {
      expect(replenished.privateBundle.oneTimePreKeyPrivates.has(opk.id)).toBe(true)
      expect(replenished.privateBundle.mlkemOneTimePreKeyPrivates.has(opk.id)).toBe(true)
    }
  })

  it('yields while generating more OPKs than one batch', async () => {
    const yieldToHost = vi.fn(async () => undefined)
    const count = OPK_GENERATE_YIELD_EVERY + 2
    const generated = await generateOneTimePreKeysAsync(1, count, yieldToHost)
    expect(generated.preKeys).toHaveLength(count)
    expect(yieldToHost).toHaveBeenCalled()
    expect(STARTUP_PREKEY_COUNT).toBeLessThan(100)
  })

  it('replenishes OPKs asynchronously without dropping private keys', async () => {
    const { bob } = makeIdentityPair(2)
    const replenished = await replenishOneTimePreKeysAsync(
      bob.bundle,
      bob.privateBundle,
      6,
      async () => undefined,
    )
    expect(replenished.bundle.oneTimePreKeys).toHaveLength(6)
    for (const opk of replenished.bundle.oneTimePreKeys) {
      expect(replenished.privateBundle.oneTimePreKeyPrivates.has(opk.id)).toBe(true)
      expect(replenished.privateBundle.mlkemOneTimePreKeyPrivates.has(opk.id)).toBe(true)
    }
  })
})

describe('X3DH wire format regressions', () => {
  it('round-trips normal signed and one-time prekey ids in headers', () => {
    const header = createX3DHHeader('ik', 'ek', 'ct', 1, 0, 123)

    expect(parseX3DHHeader(header)).toEqual({
      initiatorIdentityKey: 'ik',
      ephemeralPublicKey: 'ek',
      mlkemCiphertext: 'ct',
      usedSignedPreKeyId: 1,
      usedOneTimePreKeyId: 0,
      bundleTimestamp: 123,
    })
  })

  it('rejects unsupported future header versions', () => {
    const header = bytesToBase64(new TextEncoder().encode(JSON.stringify({
      v: 999,
      ik: 'ik',
      ek: 'ek',
      mc: 'ct',
      spk: 1,
    })))

    expect(() => parseX3DHHeader(header)).toThrow()
  })

  it('rejects headers missing an explicit signed prekey id', () => {
    const header = bytesToBase64(new TextEncoder().encode(JSON.stringify({
      v: 1,
      ik: 'ik',
      ek: 'ek',
      mc: 'ct',
    })))

    expect(() => parseX3DHHeader(header)).toThrow()
  })

  it('preserves a signed prekey id of zero', () => {
    const header = createX3DHHeader('ik', 'ek', 'ct', 0, 0, 123)

    expect(parseX3DHHeader(header).usedSignedPreKeyId).toBe(0)
  })

  it('documents deterministic little-endian byte packing for ids and timestamps', () => {
    expect(Array.from(int32LE(0x01020304))).toEqual([0x04, 0x03, 0x02, 0x01])
    expect(Array.from(int64LE(0x0102030405060708n))).toEqual([0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01])
  })
})
