/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import {
  generateDilithiumKeyPair,
} from '../crypto/dilithium'
import {
  BLE_NOISE_XX_PROTOCOL_NAME,
  BLE_V2_PROTOCOL_VERSION,
  BLE_V2_X25519_CREDENTIAL_PURPOSE,
  assertBleNoiseXXHandshakeMaterial,
  createBleNoiseXXPrologue,
  createBleX25519Credential,
  decodeBleX25519Credential,
  encodeBleX25519Credential,
  generateBleX25519StaticKeyMaterial,
  verifyBleX25519Credential,
} from './index'
import type {
  BleX25519Credential,
  BleX25519StaticKeyMaterial,
} from './index'

const NOW = 1_800_000_000_000

function cloneCredential(credential: BleX25519Credential): BleX25519Credential {
  return {
    ...credential,
    credentialId: credential.credentialId.slice(),
    publicKey: credential.publicKey.slice(),
  }
}

describe('BLE v2 X25519 identity credential', () => {
  let identity: ReturnType<typeof generateDilithiumKeyPair>
  let staticKey: BleX25519StaticKeyMaterial
  let credential: BleX25519Credential

  beforeAll(() => {
    identity = generateDilithiumKeyPair()
    staticKey = generateBleX25519StaticKeyMaterial()
    credential = createBleX25519Credential(
      staticKey.publicKey,
      identity.privateKey,
      NOW,
      NOW + 60_000,
      new Uint8Array(16).fill(0x42),
    )
  })

  it('signs, verifies, and round-trips the dedicated BLE static key', () => {
    const decoded = decodeBleX25519Credential(encodeBleX25519Credential(credential))

    expect(decoded).toEqual(credential)
    expect(decoded.version).toBe(BLE_V2_PROTOCOL_VERSION)
    expect(decoded.purpose).toBe(BLE_V2_X25519_CREDENTIAL_PURPOSE)
    expect(verifyBleX25519Credential(decoded, identity.publicKey, NOW + 1)).toBe(true)
  })

  it('rejects purpose, version, key, signature, and identity tampering', () => {
    const wrongIdentity = generateDilithiumKeyPair()
    const badPurpose = {
      ...cloneCredential(credential),
      purpose: 'wrong',
    } as unknown as BleX25519Credential
    const badVersion = {
      ...cloneCredential(credential),
      version: 1,
    } as unknown as BleX25519Credential
    const badKey = cloneCredential(credential)
    badKey.publicKey[0] ^= 1
    const badSignature = cloneCredential(credential)
    const signatureOffset = badSignature.signature.startsWith('0x') ? 2 : 0
    const replacement = badSignature.signature[signatureOffset] === '0' ? '1' : '0'
    badSignature.signature = `${badSignature.signature.slice(0, signatureOffset)}${replacement}${badSignature.signature.slice(signatureOffset + 1)}`

    expect(verifyBleX25519Credential(badPurpose, identity.publicKey, NOW + 1)).toBe(false)
    expect(verifyBleX25519Credential(badVersion, identity.publicKey, NOW + 1)).toBe(false)
    expect(verifyBleX25519Credential(badKey, identity.publicKey, NOW + 1)).toBe(false)
    expect(verifyBleX25519Credential(badSignature, identity.publicKey, NOW + 1)).toBe(false)
    expect(verifyBleX25519Credential(credential, wrongIdentity.publicKey, NOW + 1)).toBe(false)
  })

  it('rejects credentials outside their issue and expiry window', () => {
    expect(verifyBleX25519Credential(credential, identity.publicKey, NOW - 300_001)).toBe(false)
    expect(verifyBleX25519Credential(
      credential,
      identity.publicKey,
      credential.expiresAt,
    )).toBe(false)
  })

  it('validates only dedicated matching material at the Noise XX boundary', () => {
    const material = {
      protocolName: BLE_NOISE_XX_PROTOCOL_NAME,
      role: 'initiator' as const,
      prologue: createBleNoiseXXPrologue(),
      localStaticKey: staticKey,
      localCredential: credential,
    }
    expect(() => assertBleNoiseXXHandshakeMaterial(material)).not.toThrow()

    const wrongStatic = {
      ...staticKey,
      privateKey: staticKey.privateKey.slice(),
    }
    wrongStatic.privateKey[1] ^= 1
    expect(() => assertBleNoiseXXHandshakeMaterial({
      ...material,
      localStaticKey: wrongStatic,
    })).toThrow()

    const wrongCredential = cloneCredential(credential)
    wrongCredential.publicKey = generateBleX25519StaticKeyMaterial().publicKey
    expect(() => assertBleNoiseXXHandshakeMaterial({
      ...material,
      localCredential: wrongCredential,
    })).toThrow()
  })
})
