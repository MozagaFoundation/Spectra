/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  deriveExoAddressFromWalletPublicKey,
  signPublicKeyBundleWalletAuthorization,
  verifyPublicKeyBundleWalletAuthorization,
} from './walletAuthorization'
import { makeIdentityPair, tamperBase64 } from '../__tests__/helpers/cryptoTestHelpers'

describe('wallet-authorized public key bundles', () => {
  it('verifies a bundle signed by the wallet key', () => {
    const { bob } = makeIdentityPair()
    const walletAddress = deriveExoAddressFromWalletPublicKey(bob.identity.dilithiumPublicKey)
    const walletAuthorization = signPublicKeyBundleWalletAuthorization(
      bob.bundle,
      walletAddress,
      bob.identity.dilithiumPublicKey,
      bob.identity.dilithiumPrivateKey,
      1_771_000_000_000,
    )

    const verification = verifyPublicKeyBundleWalletAuthorization({
      ...bob.bundle,
      walletAuthorization,
    }, walletAddress)

    expect(verification.valid).toBe(true)
  })

  it('rejects a wallet signature replayed onto a different identity bundle', () => {
    const { alice, bob } = makeIdentityPair()
    const walletAddress = deriveExoAddressFromWalletPublicKey(bob.identity.dilithiumPublicKey)
    const walletAuthorization = signPublicKeyBundleWalletAuthorization(
      bob.bundle,
      walletAddress,
      bob.identity.dilithiumPublicKey,
      bob.identity.dilithiumPrivateKey,
      1_771_000_000_000,
    )

    const verification = verifyPublicKeyBundleWalletAuthorization({
      ...alice.bundle,
      walletAuthorization,
    }, walletAddress)

    expect(verification.valid).toBe(false)
    expect(verification.error).toContain('identity ID mismatch')
  })

  it('rejects tampering with wallet-authorized bundle fields', () => {
    const { bob } = makeIdentityPair()
    const walletAddress = deriveExoAddressFromWalletPublicKey(bob.identity.dilithiumPublicKey)
    const walletAuthorization = signPublicKeyBundleWalletAuthorization(
      bob.bundle,
      walletAddress,
      bob.identity.dilithiumPublicKey,
      bob.identity.dilithiumPrivateKey,
    )

    const verification = verifyPublicKeyBundleWalletAuthorization({
      ...bob.bundle,
      identityKey: tamperBase64(bob.bundle.identityKey),
      walletAuthorization,
    }, walletAddress)

    expect(verification.valid).toBe(false)
  })

  it('rejects wallet-linked bundles without explicit wallet authorization', () => {
    const { bob } = makeIdentityPair()
    const walletAddress = deriveExoAddressFromWalletPublicKey(bob.identity.dilithiumPublicKey)

    const verification = verifyPublicKeyBundleWalletAuthorization(
      bob.bundle,
      walletAddress,
    )

    expect(verification.valid).toBe(false)
    expect(verification.error).toContain('missing wallet authorization')
  })
})
