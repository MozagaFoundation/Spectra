/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  base64ToBytes,
  bytesToBase64,
  createBleX25519Credential,
  decodeBleX25519Credential,
  encodeBleX25519Credential,
  generateBleX25519StaticKeyMaterial,
  hexToBytes,
  sha256Hash,
  verifyBleX25519Credential,
  type BleX25519StaticKeyMaterial,
  type PublicKeyBundle,
} from '@spectra/core-crypto'
import {
  loadBleMeshState,
  saveBleMeshState,
  type BleMeshPersistedState,
} from '@/services/storage/bleMeshStorage'

const CREDENTIAL_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
const MAX_IDENTITY_ID_BYTES = 192
const CREDENTIAL_PAYLOAD_VERSION = 2

export interface BLEKnownIdentity {
  identityId: string
  bundle: PublicKeyBundle
}

export interface BLEVerifiedIdentity {
  identityId: string
  knownContact: true
}

function encodeCredentialPayload(
  identityId: string,
  credential: Uint8Array,
): Uint8Array {
  const identityBytes = new TextEncoder().encode(identityId)
  if (identityBytes.length === 0 || identityBytes.length > MAX_IDENTITY_ID_BYTES) {
    throw new Error('BLE credential identity length is invalid')
  }
  const payload = new Uint8Array(4 + identityBytes.length + credential.length)
  payload[0] = CREDENTIAL_PAYLOAD_VERSION
  payload[1] = 0
  new DataView(payload.buffer).setUint16(2, identityBytes.length, false)
  payload.set(identityBytes, 4)
  payload.set(credential, 4 + identityBytes.length)
  return payload
}

function decodeCredentialPayload(payload: Uint8Array): {
  identityId: string
  credential: Uint8Array
} {
  if (
    payload.length < 5
    || payload[0] !== CREDENTIAL_PAYLOAD_VERSION
    || payload[1] !== 0
  ) {
    throw new Error('BLE credential payload is invalid')
  }
  const identityLength = new DataView(
    payload.buffer,
    payload.byteOffset,
    payload.byteLength,
  ).getUint16(2, false)
  if (
    identityLength === 0
    || identityLength > MAX_IDENTITY_ID_BYTES
    || 4 + identityLength >= payload.length
  ) {
    throw new Error('BLE credential payload identity is invalid')
  }
  const identityId = new TextDecoder('utf-8', { fatal: true }).decode(
    payload.slice(4, 4 + identityLength),
  )
  if (!identityId.trim()) throw new Error('BLE credential identity is invalid')
  return {
    identityId,
    credential: payload.slice(4 + identityLength),
  }
}

function staticKeyFromState(state: BleMeshPersistedState): BleX25519StaticKeyMaterial | null {
  if (!state.staticKey) return null
  try {
    const publicKey = base64ToBytes(state.staticKey.publicKey)
    const privateKey = base64ToBytes(state.staticKey.privateKey)
    if (publicKey.length !== 32 || privateKey.length !== 32) return null
    return { algorithm: 'X25519', publicKey, privateKey }
  } catch {
    return null
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index]
  }
  return diff === 0
}

export class BLEIdentityContext {
  readonly staticKeyPair: BleX25519StaticKeyMaterial
  readonly credentialPayload: Uint8Array
  readonly senderBinding: Uint8Array
  private readonly knownIdentities: Map<string, PublicKeyBundle>

  private constructor(options: {
    identityId: string
    identityPrivateKey: string
    staticKeyPair: BleX25519StaticKeyMaterial
    knownIdentities: BLEKnownIdentity[]
    now: number
  }) {
    this.staticKeyPair = options.staticKeyPair
    this.senderBinding = hexToBytes(
      sha256Hash(new TextEncoder().encode(options.identityId)),
    )
    const credential = createBleX25519Credential(
      options.staticKeyPair.publicKey,
      options.identityPrivateKey,
      options.now,
      options.now + CREDENTIAL_LIFETIME_MS,
    )
    this.credentialPayload = encodeCredentialPayload(
      options.identityId,
      encodeBleX25519Credential(credential),
    )
    this.knownIdentities = new Map(
      options.knownIdentities.map((known) => [known.identityId, known.bundle]),
    )
  }

  static async create(options: {
    walletScope: string
    identityId: string
    identityPrivateKey: string
    knownIdentities: BLEKnownIdentity[]
    now?: number
  }): Promise<BLEIdentityContext> {
    const state = await loadBleMeshState(options.walletScope)
    let staticKeyPair = staticKeyFromState(state)
    if (!staticKeyPair) {
      staticKeyPair = generateBleX25519StaticKeyMaterial()
      state.staticKey = {
        publicKey: bytesToBase64(staticKeyPair.publicKey),
        privateKey: bytesToBase64(staticKeyPair.privateKey),
      }
      state.capabilities = []
      state.queuedEnvelopes = []
      state.replayEntries = []
      await saveBleMeshState(options.walletScope, state)
    }
    return new BLEIdentityContext({
      identityId: options.identityId,
      identityPrivateKey: options.identityPrivateKey,
      staticKeyPair,
      knownIdentities: options.knownIdentities,
      now: options.now ?? Date.now(),
    })
  }

  verifyCredentialPayload(
    payload: Uint8Array,
    remoteStaticKey: Uint8Array,
    now: number = Date.now(),
  ): BLEVerifiedIdentity | null {
    try {
      const decoded = decodeCredentialPayload(payload)
      const bundle = this.knownIdentities.get(decoded.identityId)
      if (!bundle) return null
      const credential = decodeBleX25519Credential(decoded.credential)
      if (
        !sameBytes(credential.publicKey, remoteStaticKey)
        || !verifyBleX25519Credential(credential, bundle.dilithiumKey, now)
      ) {
        return null
      }
      return {
        identityId: decoded.identityId,
        knownContact: true,
      }
    } catch {
      return null
    }
  }

  updateKnownIdentities(knownIdentities: BLEKnownIdentity[]): void {
    this.knownIdentities.clear()
    for (const known of knownIdentities) {
      if (known.identityId.trim()) {
        this.knownIdentities.set(known.identityId, known.bundle)
      }
    }
  }

  destroy(): void {
    this.staticKeyPair.privateKey.fill(0)
    this.credentialPayload.fill(0)
  }
}
