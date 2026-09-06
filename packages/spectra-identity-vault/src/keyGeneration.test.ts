/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('./dilithium', () => ({
  Dilithium: {
    init: vi.fn(async () => ({
      generateKeyPairFromSeed: (seed: Uint8Array) => ({
        publicKey: seed.slice(0, 32),
        privateKey: seed.slice(0, 32),
      }),
      deriveAddress: (publicKey: Uint8Array) => {
        const suffix = Array.from(publicKey.slice(0, 19))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('')
        return `EXO00${suffix}`
      },
    })),
  },
  bytesToHex: vi.fn((bytes: Uint8Array) => `0x${Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')}`),
}))

vi.mock('./hex', () => ({
  bytesToHex: vi.fn((bytes: Uint8Array) => Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')),
  generateId: vi.fn(() => 'wallet-id'),
  hexToBytes: vi.fn(() => new Uint8Array()),
}))

vi.mock('./chainKeyDerivation', () => ({
  deriveChainAccounts: vi.fn(() => ({
    evm: {
      address: '0x0000000000000000000000000000000000000000',
      publicKey: '0x00',
      privateKey: '0x00',
      derivationPath: "m/44'/60'/0'/0/0",
    },
    bitcoin: {
      address: 'bc1qmock',
      publicKey: '0x01',
      privateKey: '0x01',
      derivationPath: "m/84'/0'/0'/0/0",
    },
    solana: {
      address: 'solmock',
      publicKey: '0x02',
      privateKey: '0x02',
      derivationPath: "m/44'/501'/0'/0'",
    },
    tron: {
      address: 'Tmock',
      publicKey: '0x03',
      privateKey: '0x03',
      derivationPath: "m/44'/195'/0'/0/0",
    },
  })),
}))

let generateMnemonic: typeof import('./keyGeneration').generateMnemonic
let validateMnemonic: typeof import('./keyGeneration').validateMnemonic
let importWalletFromMnemonic: typeof import('./keyGeneration').importWalletFromMnemonic
let deriveSpectreWallet: typeof import('./keyGeneration').deriveSpectreWallet
let deriveTransparentEXOWallet: typeof import('./keyGeneration').deriveTransparentEXOWallet
let deriveDeterministicEXOWalletBundle: typeof import('./keyGeneration').deriveDeterministicEXOWalletBundle

describe('wallet mnemonic helpers', () => {
  beforeAll(async () => {
    const keyGeneration = await import('./keyGeneration')
    generateMnemonic = keyGeneration.generateMnemonic
    validateMnemonic = keyGeneration.validateMnemonic
    importWalletFromMnemonic = keyGeneration.importWalletFromMnemonic
    deriveSpectreWallet = keyGeneration.deriveSpectreWallet
    deriveTransparentEXOWallet = keyGeneration.deriveTransparentEXOWallet
    deriveDeterministicEXOWalletBundle = keyGeneration.deriveDeterministicEXOWalletBundle
  })

  it('generates a valid 24-word mnemonic', () => {
    const mnemonic = generateMnemonic()

    expect(mnemonic.split(' ')).toHaveLength(24)
    expect(validateMnemonic(mnemonic)).toEqual({ valid: true })
  })

  it('rejects unsupported word counts', () => {
    const mnemonic = Array.from({ length: 23 }, () => 'abandon').join(' ')

    expect(validateMnemonic(mnemonic)).toEqual({
      valid: false,
      code: 'mnemonic_invalid_word_count',
    })
  })

  it('rejects words outside the BIP39 wordlist', () => {
    const mnemonic = [
      'abandon',
      'ability',
      'able',
      'about',
      'above',
      'absent',
      'absorb',
      'abstract',
      'absurd',
      'abuse',
      'access',
      'not-a-word',
    ].join(' ')

    expect(validateMnemonic(mnemonic)).toEqual({
      valid: false,
      code: 'mnemonic_invalid_word',
      params: { word: 'not-a-word' },
    })
  })

  it('rejects mnemonics with an invalid checksum', () => {
    const mnemonic = Array.from({ length: 12 }, () => 'abandon').join(' ')

    expect(validateMnemonic(mnemonic)).toEqual({
      valid: false,
      code: 'mnemonic_invalid_checksum',
    })
  })
})

describe('domain-separated wallet derivation', () => {
  const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

  it('derives transparent EXO accounts separately from primary accounts', async () => {
    const primary = await importWalletFromMnemonic(mnemonic, 'Primary')
    const transparent = await deriveTransparentEXOWallet(mnemonic, 'Work EXO')

    expect(primary.chainAccounts?.evm?.address).toBe(primary.ethereumAddress)
    expect(primary.chainAccounts?.bitcoin?.address).toMatch(/^bc1q/)
    expect(primary.chainAccounts?.solana?.address).toBeTruthy()
    expect(primary.chainAccounts?.tron?.address).toMatch(/^T/)
    expect(transparent.transparentMode).toBe(true)
    expect(transparent).not.toHaveProperty('issuerWalletAddress')
    expect(transparent.publicKey).not.toBe(primary.publicKey)
    expect(transparent.address).not.toBe(primary.address)
  })

  it('derives transparent EXO accounts separately from Spectre accounts', async () => {
    const transparent = await deriveTransparentEXOWallet(mnemonic, 'Work EXO')
    const spectre = await deriveSpectreWallet(mnemonic)

    expect(transparent.transparentMode).toBe(true)
    expect(spectre.spectreMode).toBe(true)
    expect(transparent.publicKey).not.toBe(spectre.publicKey)
    expect(transparent.address).not.toBe(spectre.address)
  })

  it('derives five deterministic transparent EXO accounts from one mnemonic', async () => {
    const transparentWallets = await Promise.all(
      [1, 2, 3, 4, 5].map((index) => deriveTransparentEXOWallet(mnemonic, `EXO Account ${index}`, index)),
    )
    const addresses = new Set(transparentWallets.map((wallet) => wallet.address))

    expect(addresses.size).toBe(5)
    expect(transparentWallets.map((wallet) => wallet.transparentMode)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ])
  })

  it('rejects transparent EXO account indexes outside the bundled range', async () => {
    await expect(deriveTransparentEXOWallet(mnemonic, 'Invalid EXO', 0))
      .rejects.toThrow('Transparent EXO account index must be between 1 and 5')
    await expect(deriveTransparentEXOWallet(mnemonic, 'Invalid EXO', 6))
      .rejects.toThrow('Transparent EXO account index must be between 1 and 5')
  })

  it('builds a recoverable root, transparent, and Spectre wallet bundle', async () => {
    const { deriveChainAccounts } = await import('./chainKeyDerivation')
    vi.mocked(deriveChainAccounts).mockClear()

    const bundle = await deriveDeterministicEXOWalletBundle(mnemonic)

    expect(bundle.rootWallet.spectreMode).toBeUndefined()
    expect(bundle.rootWallet.transparentMode).toBeUndefined()
    expect(bundle.transparentWallets).toHaveLength(5)
    expect(bundle.spectreWallet.spectreMode).toBe(true)
    expect(bundle.transparentWallets.every((wallet) => wallet.transparentMode === true)).toBe(true)
    expect(vi.mocked(deriveChainAccounts).mock.calls.map(([, options]) => options?.accountIndex))
      .toEqual([undefined, 2, 3, 4, 5, 6, 1])
  })

  it('reports each sequential derivation and awaits the injected yield callback', async () => {
    const { deriveChainAccounts } = await import('./chainKeyDerivation')
    const progress: Array<{
      completed: number
      total: number
      stage: string
      transparentIndex?: number
    }> = []
    vi.mocked(deriveChainAccounts).mockClear()

    const yieldToEventLoop = vi.fn(async ({ completed }: { completed: number }) => {
      expect(vi.mocked(deriveChainAccounts)).toHaveBeenCalledTimes(completed)
    })

    await deriveDeterministicEXOWalletBundle(mnemonic, {
      onProgress: (update) => progress.push(update),
      yieldToEventLoop,
    })

    expect(progress).toEqual([
      { completed: 1, total: 7, stage: 'root' },
      { completed: 2, total: 7, stage: 'transparent', transparentIndex: 1 },
      { completed: 3, total: 7, stage: 'transparent', transparentIndex: 2 },
      { completed: 4, total: 7, stage: 'transparent', transparentIndex: 3 },
      { completed: 5, total: 7, stage: 'transparent', transparentIndex: 4 },
      { completed: 6, total: 7, stage: 'transparent', transparentIndex: 5 },
      { completed: 7, total: 7, stage: 'spectre' },
    ])
    expect(yieldToEventLoop).toHaveBeenCalledTimes(7)
    expect(yieldToEventLoop.mock.calls.map(([update]) => update)).toEqual(progress)
  })

  it('preserves deterministic key material when deriving the bundle sequentially', async () => {
    const rootWallet = await importWalletFromMnemonic(mnemonic)
    const transparentWallets = await Promise.all(
      [1, 2, 3, 4, 5].map((index) => (
        deriveTransparentEXOWallet(mnemonic, `EXO Account ${index}`, index)
      )),
    )
    const spectreWallet = await deriveSpectreWallet(mnemonic)

    const bundle = await deriveDeterministicEXOWalletBundle(mnemonic)

    expect(bundle.rootWallet.address).toBe(rootWallet.address)
    expect(bundle.rootWallet.publicKey).toBe(rootWallet.publicKey)
    expect(bundle.rootWallet.privateKey).toBe(rootWallet.privateKey)
    expect(bundle.transparentWallets.map(({ address }) => address))
      .toEqual(transparentWallets.map(({ address }) => address))
    expect(bundle.transparentWallets.map(({ publicKey }) => publicKey))
      .toEqual(transparentWallets.map(({ publicKey }) => publicKey))
    expect(bundle.spectreWallet.address).toBe(spectreWallet.address)
    expect(bundle.spectreWallet.publicKey).toBe(spectreWallet.publicKey)
    expect(bundle.spectreWallet.privateKey).toBe(spectreWallet.privateKey)
  })

})
