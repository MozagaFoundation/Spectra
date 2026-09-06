/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export const PROTOCOL_VERSIONS = {
  x3dhHeader: 1,
  doubleRatchetMessage: 3,
  callSignal: 1,
  sealedRelayEnvelope: 1,
  sealedControlEnvelope: 1,
  relayMailboxToken: 1,
  scopedRelayMailboxToken: 2,
  storagePayload: 1,
  storageKdf: 1,
  bleRouteCapability: 2,
  bleRouteEnvelope: 2,
  bleFragment: 2,
  bleAcceptanceReceipt: 2,
  bleX25519Credential: 2,
} as const

export function assertSupportedVersion(
  label: string,
  version: number | undefined,
  supportedVersion: number,
): void {
  if (version === undefined) return
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`${label} version is invalid`)
  }
  if (version > supportedVersion) {
    throw new Error(`${label} version ${version} is not supported`)
  }
}

export function assertExactVersion(
  label: string,
  version: number | undefined,
  expectedVersion: number,
): void {
  if (version === undefined) {
    throw new Error(`${label} version is required`)
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`${label} version is invalid`)
  }
  if (version !== expectedVersion) {
    throw new Error(`${label} version ${version} is not supported`)
  }
}
