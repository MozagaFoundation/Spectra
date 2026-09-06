/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type {
  BLE_NOISE_XX_PROTOCOL_NAME,
  BLE_V2_PROTOCOL_VERSION,
  BLE_V2_X25519_CREDENTIAL_PURPOSE,
  BleAcceptanceStatus,
  BlePayloadType,
} from './constants'

export interface BleRouteCapability {
  version: typeof BLE_V2_PROTOCOL_VERSION
  routeId: Uint8Array
  routeEpoch: number
  senderBinding: Uint8Array
  secret: Uint8Array
  issuedAt: number
  expiresAt: number
}

export interface BleRouteEnvelope {
  version: typeof BLE_V2_PROTOCOL_VERSION
  payloadType: BlePayloadType
  flags: number
  maxHops: number
  envelopeId: Uint8Array
  routeId: Uint8Array
  routeEpoch: number
  returnRouteId: Uint8Array
  returnRouteEpoch: number
  issuedAt: number
  expiresAt: number
  payload: Uint8Array
  payloadHash: Uint8Array
  cacheDeletionHash: Uint8Array
  authTag: Uint8Array
}

export type BleRouteEnvelopeInput = Pick<
  BleRouteEnvelope,
  'payloadType' | 'flags' | 'maxHops' | 'issuedAt' | 'expiresAt' | 'payload'
> & {
  envelopeId?: Uint8Array
}

export interface BleFragment {
  version: typeof BLE_V2_PROTOCOL_VERSION
  payloadType: BlePayloadType
  flags: number
  maxHops: number
  envelopeId: Uint8Array
  routeId: Uint8Array
  routeEpoch: number
  returnRouteId: Uint8Array
  returnRouteEpoch: number
  issuedAt: number
  expiresAt: number
  totalPayloadLength: number
  payloadHash: Uint8Array
  cacheDeletionHash: Uint8Array
  fragmentIndex: number
  fragmentCount: number
  chunkOffset: number
  chunk: Uint8Array
  authTag: Uint8Array
}

export interface BleAcceptanceReceipt {
  version: typeof BLE_V2_PROTOCOL_VERSION
  status: BleAcceptanceStatus
  envelopeId: Uint8Array
  routeId: Uint8Array
  routeEpoch: number
  forwardRouteId: Uint8Array
  forwardRouteEpoch: number
  payloadHash: Uint8Array
  cacheDeletionPreimage: Uint8Array
  acceptedAt: number
  expiresAt: number
  authTag: Uint8Array
}

export interface BleX25519Credential {
  version: typeof BLE_V2_PROTOCOL_VERSION
  purpose: typeof BLE_V2_X25519_CREDENTIAL_PURPOSE
  credentialId: Uint8Array
  publicKey: Uint8Array
  issuedAt: number
  expiresAt: number
  signature: string
}

export interface BleX25519StaticKeyMaterial {
  algorithm: 'X25519'
  publicKey: Uint8Array
  privateKey: Uint8Array
}

export type BleNoiseXXRole = 'initiator' | 'responder'

export interface BleNoiseXXHandshakeMaterial {
  protocolName: typeof BLE_NOISE_XX_PROTOCOL_NAME
  role: BleNoiseXXRole
  prologue: Uint8Array
  localStaticKey: BleX25519StaticKeyMaterial
  localCredential: BleX25519Credential
}

export interface BleNoiseXXHandshakeResult {
  outboundMessage: Uint8Array | null
  remoteCredential: Uint8Array | null
  complete: boolean
}

export interface BleNoiseXXTransport {
  readonly remoteStaticPublicKey: Uint8Array
  seal(plaintext: Uint8Array, aad?: Uint8Array): Uint8Array
  open(ciphertext: Uint8Array, aad?: Uint8Array): Uint8Array
  destroy(): void
}

export interface BleNoiseXXHandshake {
  next(inboundMessage?: Uint8Array): BleNoiseXXHandshakeResult
  toTransport(): BleNoiseXXTransport
  destroy(): void
}

export interface BleNoiseXXAdapter {
  readonly protocolName: typeof BLE_NOISE_XX_PROTOCOL_NAME
  createHandshake(material: BleNoiseXXHandshakeMaterial): BleNoiseXXHandshake
}
