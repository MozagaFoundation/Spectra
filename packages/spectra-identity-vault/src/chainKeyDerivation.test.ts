/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  deriveBitcoinAccount,
  deriveBitcoinP2wpkhAddressFromPrivateKey,
  deriveChainAccounts,
  deriveEvmAccount,
  deriveSolanaAccount,
  deriveTronAccount,
} from './chainKeyDerivation'

const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('multi-chain deterministic derivation vectors', () => {
  it('derives the standard EVM account vector', () => {
    expect(deriveEvmAccount(mnemonic)).toEqual({
      address: '0x9858EfFD232B4033E47d90003D41EC34EcaEda94',
      privateKey: '0x1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727',
      publicKey: '0x0437b0bb7a8288d38ed49a524b5dc98cff3eb5ca824c9f9dc0dfdb3d9cd600f299a6179912b7451c09896c4098eca7ce6b2e58330672795e847c4d6af44e024230',
      derivationPath: "m/44'/60'/0'/0/0",
    })
  })

  it('derives standard Bitcoin, Solana, and Tron account vectors', () => {
    expect(deriveBitcoinAccount(mnemonic)).toEqual({
      address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
      privateKey: '0x4604b4b710fe91f584fff084e1a9159fe4f8408fff380596a604948474ce4fa3',
      publicKey: '0x0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c',
      derivationPath: "m/84'/0'/0'/0/0",
    })
    expect(deriveSolanaAccount(mnemonic)).toEqual({
      address: 'HAgk14JpMQLgt6rVgv7cBQFJWFto5Dqxi472uT3DKpqk',
      privateKey: '0x37df573b3ac4ad5b522e064e25b63ea16bcbe79d449e81a0268d1047948bb445',
      publicKey: '0xf036276246a75b9de3349ed42b15e232f6518fc20f5fcd4f1d64e81f9bd258f7',
      derivationPath: "m/44'/501'/0'/0'",
    })
    expect(deriveTronAccount(mnemonic)).toEqual({
      address: 'TUEZSdKsoDHQMeZwihtdoBiN46zxhGWYdH',
      privateKey: '0xb5a4cea271ff424d7c31dc12a3e43e401df7a40d7412a15750f3f0b6b5449a28',
      publicKey: '0x04ff21f8e64d3a3c0198edfbb7afdc79be959432e92e2f8a1984bb436a414b8edcec0345aad0c1bf7da04fd036dd7f9f617e30669224283d950fab9dd84831dc83',
      derivationPath: "m/44'/195'/0'/0/0",
    })
  })

  it('derives the canonical mainnet Bitcoin address from a private key', () => {
    expect(deriveBitcoinP2wpkhAddressFromPrivateKey(
      '0x4604b4b710fe91f584fff084e1a9159fe4f8408fff380596a604948474ce4fa3',
    )).toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')
  })

  it('normalizes mnemonic casing and whitespace', () => {
    const paddedMnemonic = `  ${mnemonic.toUpperCase()}  `

    expect(deriveChainAccounts(paddedMnemonic)).toEqual(deriveChainAccounts(mnemonic))
  })

  it('uses distinct derivation paths for nonzero account indexes', () => {
    expect(deriveEvmAccount(mnemonic, { accountIndex: 1 }).derivationPath)
      .toBe("m/44'/60'/0'/0/1")
    expect(deriveBitcoinAccount(mnemonic, { accountIndex: 1 }).derivationPath)
      .toBe("m/84'/0'/0'/0/1")
    expect(deriveSolanaAccount(mnemonic, { accountIndex: 1 }).derivationPath)
      .toBe("m/44'/501'/1'/0'")
    expect(deriveTronAccount(mnemonic, { accountIndex: 1 }).derivationPath)
      .toBe("m/44'/195'/0'/0/1")
  })
})
