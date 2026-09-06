/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export * from './constants'
export type {
  BleAcceptanceReceipt,
  BleFragment,
  BleNoiseXXAdapter,
  BleNoiseXXHandshake,
  BleNoiseXXHandshakeMaterial,
  BleNoiseXXHandshakeResult,
  BleNoiseXXRole,
  BleNoiseXXTransport,
  BleRouteCapability,
  BleRouteEnvelope,
  BleRouteEnvelopeInput,
  BleX25519Credential,
  BleX25519StaticKeyMaterial,
} from './types'

export {
  createBleRouteCapability,
  decodeBleRouteCapability,
  deriveBleCacheDeletionPreimage,
  encodeBleRouteCapability,
  hashBleCacheDeletionPreimage,
  verifyBleCacheDeletionPreimage,
} from './routeCapability'
export {
  createBleRouteEnvelope,
  decodeBleRouteEnvelope,
  encodeBleRouteEnvelope,
  generateBleEnvelopeId,
  verifyBleRouteEnvelope,
} from './routeEnvelope'
export {
  decodeBleFragment,
  encodeBleFragment,
  fragmentBleRouteEnvelope,
  reassembleBleFragments,
  verifyBleFragment,
} from './fragment'
export {
  createBleAcceptanceReceipt,
  decodeBleAcceptanceReceipt,
  encodeBleAcceptanceReceipt,
  verifyBleAcceptanceReceipt,
} from './receipt'
export {
  buildBleX25519CredentialSigningPayload,
  createBleX25519Credential,
  decodeBleX25519Credential,
  encodeBleX25519Credential,
  generateBleX25519StaticKeyMaterial,
  verifyBleX25519Credential,
} from './credential'
export {
  assertBleNoiseXXHandshakeMaterial,
  createBleNoiseXXPrologue,
} from './noise'
export { BleEnvelopeReplayCache } from './replay'
