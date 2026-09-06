/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  acknowledgeKeyChange,
  blockIdentity,
  createTrackedIdentityFromBundle,
  hasIdentityChanged,
  identityHashesMatch,
  isCommunicationAllowed,
  updateTrackedIdentity,
  verifyIdentity,
  verifySessionIdentity,
} from './identityTracking'
import { makeIdentityPair, tamperBase64, tamperHex } from '../__tests__/helpers/cryptoTestHelpers'

describe('identity tracking and TOFU', () => {
  it('starts trusted, can be verified, and blocks communication after explicit block', () => {
    const { bob } = makeIdentityPair()
    const tracked = createTrackedIdentityFromBundle(bob.bundle)

    expect(tracked.trustState).toBe('trusted')
    expect(isCommunicationAllowed(tracked).allowed).toBe(true)

    const verified = verifyIdentity(tracked)
    expect(verified.trustState).toBe('verified')

    const blocked = blockIdentity(verified)
    expect(isCommunicationAllowed(blocked)).toEqual({
      allowed: false,
      requiresUserAction: false,
      reason: 'This identity has been blocked',
    })
  })

  it('detects and records identity key changes until acknowledged', () => {
    const { bob } = makeIdentityPair()
    const tracked = createTrackedIdentityFromBundle(bob.bundle)
    const changedIdentityKey = tamperBase64(bob.bundle.identityKey)

    expect(hasIdentityChanged(
      tracked,
      changedIdentityKey,
      bob.bundle.dilithiumKey,
      bob.bundle.mlkemIdentityKey,
    )).toBe(true)

    const { updated, event } = updateTrackedIdentity(
      tracked,
      changedIdentityKey,
      bob.bundle.dilithiumKey,
      bob.bundle.mlkemIdentityKey,
    )

    expect(updated.trustState).toBe('changed')
    expect(event.acknowledged).toBe(false)
    expect(isCommunicationAllowed(updated).allowed).toBe(false)
    expect(acknowledgeKeyChange(updated).trustState).toBe('trusted')
  })

  it('rejects sessions bound to stale identity keys', () => {
    const { bob } = makeIdentityPair()
    const tracked = createTrackedIdentityFromBundle(bob.bundle)

    expect(verifySessionIdentity(
      tracked,
      bob.bundle.identityKey,
      bob.bundle.dilithiumKey,
    ).valid).toBe(true)

    expect(verifySessionIdentity(
      tracked,
      tamperBase64(bob.bundle.identityKey),
      bob.bundle.dilithiumKey,
    ).valid).toBe(false)

    expect(verifySessionIdentity(
      tracked,
      bob.bundle.identityKey,
      tamperHex(bob.bundle.dilithiumKey),
    ).valid).toBe(false)
  })

  it('compares equal-length identity hashes consistently', () => {
    const { bob } = makeIdentityPair()
    const tracked = createTrackedIdentityFromBundle(bob.bundle)
    const changed = createTrackedIdentityFromBundle({
      ...bob.bundle,
      identityKey: tamperBase64(bob.bundle.identityKey),
    })

    expect(identityHashesMatch(tracked.identityHash, tracked.identityHash)).toBe(true)
    expect(identityHashesMatch(tracked.identityHash, changed.identityHash)).toBe(false)
  })
})
