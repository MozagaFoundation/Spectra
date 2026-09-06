/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { x25519 } from '@noble/curves/ed25519'
import {
  PRIVATE_KEY_SIZE,
  PUBLIC_KEY_SIZE,
  SIGNATURE_SIZE,
  signWithDilithium,
  verifyDilithiumSignature,
} from '../crypto/dilithium'
import {
  bytesToBase64,
  bytesToHex,
  concatBytes,
  generateRandomBytes,
  hexToBytes,
  stringToBytes,
} from '../crypto/utils'
import { isValidX25519PublicKey } from '../crypto/x25519'
import {
  BLE_V2_CREDENTIAL_ID_BYTES,
  BLE_V2_MAX_CREDENTIAL_LIFETIME_MS,
  BLE_V2_PROTOCOL_VERSION,
  BLE_V2_X25519_CREDENTIAL_BYTES,
  BLE_V2_X25519_CREDENTIAL_MAGIC,
  BLE_V2_X25519_CREDENTIAL_PURPOSE,
  BLE_V2_X25519_KEY_BYTES,
} from './constants'
import {
  assertByteLength,
  assertCurrentlyValid,
  assertNonZeroBytes,
  assertTimeWindow,
  BleBinaryReader,
  BleBinaryWriter,
} from './binary'
import type {
  BleX25519Credential,
  BleX25519StaticKeyMaterial,
} from './types'

const CREDENTIAL_PREFIX_BYTES =
  BLE_V2_X25519_CREDENTIAL_BYTES - SIGNATURE_SIZE
const X25519_ALGORITHM_ID = 1

export function generateBleX25519StaticKeyMaterial(): BleX25519StaticKeyMaterial {
  const privateKey = generateRandomBytes(BLE_V2_X25519_KEY_BYTES)
  return {
    algorithm: 'X25519',
    publicKey: x25519.getPublicKey(privateKey),
    privateKey,
  }
}

export function createBleX25519Credential(
  publicKey: Uint8Array,
  identityPrivateKey: string,
  issuedAt: number,
  expiresAt: number,
  credentialId: Uint8Array = generateRandomBytes(BLE_V2_CREDENTIAL_ID_BYTES),
): BleX25519Credential {
  assertByteLength(hexToBytes(identityPrivateKey), PRIVATE_KEY_SIZE, 'ML-DSA identity private key')
  const credential: BleX25519Credential = {
    version: BLE_V2_PROTOCOL_VERSION,
    purpose: BLE_V2_X25519_CREDENTIAL_PURPOSE,
    credentialId: credentialId.slice(),
    publicKey: publicKey.slice(),
    issuedAt,
    expiresAt,
    signature: '',
  }
  assertBleX25519Credential(credential, false)
  credential.signature = signWithDilithium(
    buildBleX25519CredentialSigningPayload(credential),
    identityPrivateKey,
  )
  return credential
}

export function encodeBleX25519Credential(credential: BleX25519Credential): Uint8Array {
  assertBleX25519Credential(credential)
  return concatBytes(
    encodeCredentialPrefix(credential),
    hexToBytes(credential.signature),
  )
}

export function decodeBleX25519Credential(data: Uint8Array): BleX25519Credential {
  if (!(data instanceof Uint8Array) || data.length !== BLE_V2_X25519_CREDENTIAL_BYTES) {
    throw new Error('BLE X25519 credential length is invalid')
  }
  const reader = new BleBinaryReader(data)
  if (reader.readU32() !== BLE_V2_X25519_CREDENTIAL_MAGIC) {
    throw new Error('BLE X25519 credential magic is invalid')
  }
  const version = reader.readU8()
  if (reader.readU8() !== X25519_ALGORITHM_ID || reader.readU16() !== 0) {
    throw new Error('BLE X25519 credential algorithm is invalid')
  }
  const credentialId = reader.readBytes(BLE_V2_CREDENTIAL_ID_BYTES)
  const publicKey = reader.readBytes(BLE_V2_X25519_KEY_BYTES)
  const issuedAt = reader.readU64()
  const expiresAt = reader.readU64()
  if (reader.readU16() !== SIGNATURE_SIZE) {
    throw new Error('BLE X25519 credential signature length is invalid')
  }
  const signatureBytes = reader.readBytes(SIGNATURE_SIZE)
  reader.finish()
  const credential: BleX25519Credential = {
    version: version as typeof BLE_V2_PROTOCOL_VERSION,
    purpose: BLE_V2_X25519_CREDENTIAL_PURPOSE,
    credentialId,
    publicKey,
    issuedAt,
    expiresAt,
    signature: bytesToHex(signatureBytes),
  }
  assertBleX25519Credential(credential)
  return credential
}

export function buildBleX25519CredentialSigningPayload(
  credential: BleX25519Credential,
): Uint8Array {
  assertBleX25519Credential(credential, false)
  return concatBytes(
    stringToBytes(BLE_V2_X25519_CREDENTIAL_PURPOSE),
    encodeCredentialPrefix(credential),
  )
}

export function verifyBleX25519Credential(
  credential: BleX25519Credential,
  identityPublicKey: string,
  now: number = Date.now(),
): boolean {
  try {
    assertByteLength(hexToBytes(identityPublicKey), PUBLIC_KEY_SIZE, 'ML-DSA identity public key')
    assertBleX25519Credential(credential)
    assertCurrentlyValid(credential.issuedAt, credential.expiresAt, now, 'BLE X25519 credential')
    return verifyDilithiumSignature(
      buildBleX25519CredentialSigningPayload(credential),
      credential.signature,
      identityPublicKey,
    )
  } catch {
    return false
  }
}

export function assertBleX25519Credential(
  credential: BleX25519Credential,
  requireSignature: boolean = true,
): void {
  if (!credential
    || credential.version !== BLE_V2_PROTOCOL_VERSION
    || credential.purpose !== BLE_V2_X25519_CREDENTIAL_PURPOSE) {
    throw new Error('BLE X25519 credential purpose or version is invalid')
  }
  assertByteLength(
    credential.credentialId,
    BLE_V2_CREDENTIAL_ID_BYTES,
    'BLE credential ID',
  )
  assertNonZeroBytes(credential.credentialId, 'BLE credential ID')
  assertByteLength(credential.publicKey, BLE_V2_X25519_KEY_BYTES, 'BLE X25519 public key')
  if (!isValidX25519PublicKey(bytesToBase64(credential.publicKey))) {
    throw new Error('BLE X25519 public key is invalid')
  }
  assertTimeWindow(
    credential.issuedAt,
    credential.expiresAt,
    BLE_V2_MAX_CREDENTIAL_LIFETIME_MS,
    'BLE X25519 credential',
  )
  if (requireSignature) {
    assertByteLength(hexToBytes(credential.signature), SIGNATURE_SIZE, 'ML-DSA signature')
  } else if (credential.signature !== '') {
    assertByteLength(hexToBytes(credential.signature), SIGNATURE_SIZE, 'ML-DSA signature')
  }
}

function encodeCredentialPrefix(credential: BleX25519Credential): Uint8Array {
  const writer = new BleBinaryWriter(CREDENTIAL_PREFIX_BYTES)
  writer.writeU32(BLE_V2_X25519_CREDENTIAL_MAGIC)
  writer.writeU8(credential.version)
  writer.writeU8(X25519_ALGORITHM_ID)
  writer.writeU16(0)
  writer.writeBytes(credential.credentialId)
  writer.writeBytes(credential.publicKey)
  writer.writeU64(credential.issuedAt)
  writer.writeU64(credential.expiresAt)
  writer.writeU16(SIGNATURE_SIZE)
  return writer.finish()
}
