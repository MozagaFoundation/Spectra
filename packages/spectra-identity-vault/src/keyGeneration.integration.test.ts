/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { Dilithium, hexToBytes as dilithiumHexToBytes } from './dilithium'
import {
  createSignedMessagePayload,
  deriveSpectreWallet,
  deriveDeterministicEXOWalletBundle,
  deriveTransparentEXOWallet,
  importWalletFromMnemonic,
  signMessage,
  validateMnemonic,
} from './keyGeneration'

const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('real wallet key generation integration', () => {
  it('imports the primary wallet from a BIP39 mnemonic with real crypto modules', async () => {
    const wallet = await importWalletFromMnemonic(mnemonic, 'Primary')

    expect(wallet.address).toBe('EXO00e33bf43544be82155197f8d2ee9a28604e207b')
    expect(wallet.publicKey).toMatch(/^0x[0-9a-f]+$/)
    expect(wallet.publicKey).toHaveLength(2 + 1952 * 2)
    expect(wallet.privateKey).toMatch(/^0x[0-9a-f]+$/)
    expect(wallet.privateKey).toHaveLength(2 + 4032 * 2)
    expect(wallet.ethereumAddress).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')
    expect(wallet.chainAccounts?.evm?.address).toBe(wallet.ethereumAddress)
  })

  it('domain-separates primary, Spectre, and transparent EXO wallets', async () => {
    const primary = await importWalletFromMnemonic(mnemonic, 'Primary')
    const spectre = await deriveSpectreWallet(mnemonic)
    const transparent = await deriveTransparentEXOWallet(
      mnemonic,
      'Transparent',
    )

    expect(spectre.address).toBe('EXO003ef74faee30135712d1413d115814c0f7a7df3')
    expect(transparent.address).toMatch(/^EXO00[0-9a-f]{38}$/)
    expect(new Set([primary.address, spectre.address, transparent.address]).size).toBe(3)
    expect(spectre.spectreMode).toBe(true)
    expect(transparent.transparentMode).toBe(true)
    expect(transparent).not.toHaveProperty('issuerWalletAddress')
  })

  it('derives the full deterministic wallet bundle from the root mnemonic', async () => {
    const bundle = await deriveDeterministicEXOWalletBundle(mnemonic)
    const addresses = [
      bundle.rootWallet.address,
      ...bundle.transparentWallets.map((wallet) => wallet.address),
      bundle.spectreWallet.address,
    ]

    expect(bundle.rootWallet.address).toBe('EXO00e33bf43544be82155197f8d2ee9a28604e207b')
    expect(bundle.spectreWallet.address).toBe('EXO003ef74faee30135712d1413d115814c0f7a7df3')
    expect(bundle.transparentWallets).toHaveLength(5)
    expect(new Set(addresses).size).toBe(7)
  })

  it('signs messages with imported ML-DSA private keys', async () => {
    const wallet = await importWalletFromMnemonic(mnemonic, 'Primary')
    const signatureHex = await signMessage('identity-vault audit', wallet.privateKey)
    const dilithium = await Dilithium.init()

    expect(signatureHex).toMatch(/^0x[0-9a-f]+$/)
    expect(signatureHex).toHaveLength(2 + 3309 * 2)
    expect(dilithium.verify(
      createSignedMessagePayload('identity-vault audit'),
      dilithiumHexToBytes(signatureHex),
      dilithiumHexToBytes(wallet.publicKey),
    )).toBe(true)
    expect(dilithium.verify(
      new TextEncoder().encode('identity-vault audit'),
      dilithiumHexToBytes(signatureHex),
      dilithiumHexToBytes(wallet.publicKey),
    )).toBe(false)
  })

  it('normalizes mnemonic casing and whitespace before import', async () => {
    const normalized = await importWalletFromMnemonic(mnemonic, 'Primary')
    const padded = await importWalletFromMnemonic(`  ${mnemonic.toUpperCase().replaceAll(' ', '   \n')}  `, 'Primary')

    expect(padded.address).toBe(normalized.address)
    expect(padded.publicKey).toBe(normalized.publicKey)
  })

  it('rejects malformed mnemonics and malformed private-key hex', async () => {
    expect(validateMnemonic('abandon abandon')).toEqual({
      valid: false,
      code: 'mnemonic_invalid_word_count',
    })
    await expect(importWalletFromMnemonic('abandon abandon')).rejects
      .toThrow('mnemonic_invalid_word_count')
    await expect(signMessage('audit', `0x${'zz'.repeat(4032)}`))
      .rejects.toThrow('Invalid hex string')
  })
})
