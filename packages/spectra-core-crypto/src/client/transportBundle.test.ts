/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import type { PublicKeyBundle } from '../types'
import {
  compactTransportBundleFingerprint,
  createCompactTransportBundle,
  RELAY_SENDER_BUNDLE_REATTACH_AFTER_MS,
  shouldAttachRelaySenderBundle,
} from './transportBundle'

function createBundle(overrides: Record<string, unknown> = {}): PublicKeyBundle {
  return {
    identityId: 'local-identity',
    identityKey: 'identity-key',
    mlkemIdentityKey: 'mlkem-identity-key',
    dilithiumKey: 'dilithium-key',
    signedPreKey: {
      id: 1,
      x25519PublicKey: 'spk-x25519',
      mlkemPublicKey: 'spk-mlkem',
      signature: 'spk-sig',
      timestamp: 1_717_171_700_000,
    },
    oneTimePreKeys: [{
      id: 9,
      x25519PublicKey: 'opk-x25519',
      mlkemPublicKey: 'opk-mlkem',
    }],
    version: 1,
    timestamp: 1_717_171_700_000,
    ...overrides,
  } as PublicKeyBundle
}

describe('compact transport bundle attach policy', () => {
  it('fingerprints static material and ignores one-time pre-keys', () => {
    const full = createBundle()
    const compact = createCompactTransportBundle(full)
    const rotatedOpks = createBundle({
      oneTimePreKeys: [{
        id: 10,
        x25519PublicKey: 'opk-x25519-2',
        mlkemPublicKey: 'opk-mlkem-2',
      }],
    })

    expect(compact.oneTimePreKeys).toEqual([])
    expect(compactTransportBundleFingerprint(full)).toBe(compactTransportBundleFingerprint(compact))
    expect(compactTransportBundleFingerprint(full)).toBe(compactTransportBundleFingerprint(rotatedOpks))
  })

  it('changes fingerprint when signed pre-key, version, wallet auth, or identity keys rotate', () => {
    const base = createBundle()
    const baseFingerprint = compactTransportBundleFingerprint(base)

    expect(compactTransportBundleFingerprint(createBundle({
      signedPreKey: { ...base.signedPreKey, id: 2 },
    }))).not.toBe(baseFingerprint)
    expect(compactTransportBundleFingerprint(createBundle({ version: 2 }))).not.toBe(baseFingerprint)
    expect(compactTransportBundleFingerprint(createBundle({
      walletAuthorization: {
        payload: { signedAt: 99 },
        signature: 'sig',
      },
    } as Record<string, unknown>))).not.toBe(baseFingerprint)
    expect(compactTransportBundleFingerprint(createBundle({
      identityKey: 'identity-key-rotated',
    }))).not.toBe(baseFingerprint)
  })

  it('attaches for X3DH, first contact, rotation, and stale pins', () => {
    const last = { fingerprint: 'fp-1', attachedAt: 1_000 }
    expect(shouldAttachRelaySenderBundle({
      hasX3DH: true,
      fingerprint: 'fp-1',
      last,
      now: 1_000,
    })).toBe(true)
    expect(shouldAttachRelaySenderBundle({
      hasX3DH: false,
      fingerprint: 'fp-1',
      last: null,
      now: 1_000,
    })).toBe(true)
    expect(shouldAttachRelaySenderBundle({
      hasX3DH: false,
      fingerprint: 'fp-2',
      last,
      now: 1_000,
    })).toBe(true)
    expect(shouldAttachRelaySenderBundle({
      hasX3DH: false,
      fingerprint: 'fp-1',
      last,
      now: last.attachedAt + RELAY_SENDER_BUNDLE_REATTACH_AFTER_MS,
    })).toBe(true)
    expect(shouldAttachRelaySenderBundle({
      hasX3DH: false,
      fingerprint: 'fp-1',
      last,
      now: last.attachedAt + RELAY_SENDER_BUNDLE_REATTACH_AFTER_MS - 1,
    })).toBe(false)
  })
})
