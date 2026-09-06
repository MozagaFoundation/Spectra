/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/constants', () => ({
  BITCOIN_EXPLORER_URL: 'https://btc.example/',
  BITCOIN_RPC_URL: 'https://btc-rpc.example',
  ETH_EXPLORER_URL: 'https://eth.example/',
  ETH_RPC_URL: 'https://eth-rpc.example',
  EXPLORER_URL: 'https://mozaga.example/',
  SOLANA_EXPLORER_URL: 'https://sol.example/',
  SOLANA_RPC_URL: 'https://sol-rpc.example',
  TRON_EXPLORER_URL: 'https://tron.example/',
  TRON_RPC_URL: 'https://tron-rpc.example',
}))

import {
  CRYPTO_NETWORK_BY_ID,
  CRYPTO_NETWORKS,
  getAvailableNetworks,
  getWalletAddressForNetwork,
  getWalletPrivateKeyForNetwork,
  getWalletPublicKeyForNetwork,
} from './chainRegistry'

const wallet = {
  address: 'EXO0000000000000000000000000000000000000000',
  privateKey: 'mozaga-private',
  publicKey: 'mozaga-public',
  ethereumAddress: '0xlegacy',
  ethereumPrivateKey: 'legacy-private',
  ethereumPublicKey: 'legacy-public',
  chainAccounts: {
    evm: {
      address: '0xevm',
      privateKey: 'evm-private',
      publicKey: 'evm-public',
    },
    bitcoin: {
      address: 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu',
      privateKey: 'btc-private',
      publicKey: 'btc-public',
    },
    solana: {
      address: 'solana-address',
      privateKey: 'sol-private',
      publicKey: 'sol-public',
    },
    tron: {
      address: 'tron-address',
      privateKey: 'tron-private',
      publicKey: 'tron-public',
    },
  },
} as any

describe('chainRegistry', () => {
  it('keeps one canonical config per crypto network id', () => {
    expect(new Set(CRYPTO_NETWORKS.map((network) => network.id)).size).toBe(CRYPTO_NETWORKS.length)
    expect(CRYPTO_NETWORK_BY_ID.mozaga.name).toBe('Mozaga Mainnet')
    expect(CRYPTO_NETWORK_BY_ID.mozaga.chainIdLabel).toBe('27182818')
    expect(CRYPTO_NETWORK_BY_ID.mozaga.nativeSymbol).toBe('EXO')
    expect(CRYPTO_NETWORK_BY_ID.ethereum.supportsTokens).toBe(true)
  })

  it('resolves wallet addresses and keys with legacy EVM fallback', () => {
    expect(getWalletAddressForNetwork(wallet, 'mozaga')).toBe(wallet.address)
    expect(getWalletPublicKeyForNetwork(wallet, 'mozaga')).toBe(wallet.publicKey)
    expect(getWalletAddressForNetwork(wallet, 'ethereum')).toBe('0xevm')
    expect(getWalletPrivateKeyForNetwork(wallet, 'ethereum')).toBe('evm-private')

    const legacyEvmWallet = { ...wallet, chainAccounts: {} } as any
    expect(getWalletAddressForNetwork(legacyEvmWallet, 'ethereum')).toBe('0xlegacy')
    expect(getWalletPrivateKeyForNetwork(legacyEvmWallet, 'ethereum')).toBe('legacy-private')
  })

  it('uses the derived mainnet Bitcoin address for the native signing key', () => {
    const bitcoinWallet = {
      ...wallet,
      chainAccounts: {
        ...wallet.chainAccounts,
        bitcoin: {
          ...wallet.chainAccounts.bitcoin,
          address: 'tb1qstoredaddress',
          privateKey: '0x4604b4b710fe91f584fff084e1a9159fe4f8408fff380596a604948474ce4fa3',
        },
      },
    } as any

    expect(getWalletAddressForNetwork(bitcoinWallet, 'bitcoin'))
      .toBe('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')
  })

  it('returns every configured network with an available account', () => {
    expect(getAvailableNetworks(wallet).map((network) => network.id)).toEqual([
      'mozaga',
      'ethereum',
      'bitcoin',
      'solana',
      'tron',
    ])
  })
})
