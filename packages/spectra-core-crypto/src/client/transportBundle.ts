/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { PublicKeyBundle, RelaySenderBundleAttachState } from '../types/index'
import { bytesToBase64, hash, stringToBytes } from '../crypto/utils'

/**
 * Transport payloads only need the static identity material.
 * OPKs stay on the bundle server so relay/control requests stay small.
 */
export function createCompactTransportBundle(bundle: PublicKeyBundle): PublicKeyBundle {
  return {
    ...bundle,
    oneTimePreKeys: [],
  }
}

/** Reattach a compact bundle if the recipient may have wiped local pins. */
export const RELAY_SENDER_BUNDLE_REATTACH_AFTER_MS = 7 * 24 * 60 * 60 * 1000

export function compactTransportBundleFingerprint(bundle: PublicKeyBundle): string {
  const identityMaterial = [
    bundle.identityId,
    bundle.identityKey,
    bundle.mlkemIdentityKey,
    bundle.dilithiumKey,
  ].join('\n')
  return [
    String(bundle.version),
    String(bundle.timestamp),
    String(bundle.signedPreKey.id),
    String(bundle.signedPreKey.timestamp),
    String(bundle.walletAuthorization?.payload.signedAt ?? 0),
    bytesToBase64(hash(stringToBytes(identityMaterial))),
  ].join(':')
}

export function shouldAttachRelaySenderBundle(input: {
  hasX3DH: boolean
  fingerprint: string
  last: RelaySenderBundleAttachState | null
  now: number
}): boolean {
  if (input.hasX3DH) return true
  if (!input.last || input.last.fingerprint !== input.fingerprint) return true
  return input.now - input.last.attachedAt >= RELAY_SENDER_BUNDLE_REATTACH_AFTER_MS
}
