/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  BITCOIN_EXPLORER_URL,
  BITCOIN_RPC_URL,
  ETH_EXPLORER_URL,
  ETH_RPC_URL,
  EXPLORER_URL,
  SOLANA_EXPLORER_URL,
  SOLANA_RPC_URL,
  TRON_EXPLORER_URL,
  TRON_RPC_URL,
} from '@/lib/constants'
import {
  deriveBitcoinP2wpkhAddressFromPrivateKey,
  type EXOWallet,
  type WalletChainAccountId,
} from '@spectra/identity-vault'

export type CryptoNetworkId = 'mozaga' | 'ethereum' | 'bitcoin' | 'solana' | 'tron'

export interface CryptoNetworkConfig {
  id: CryptoNetworkId
  accountId?: WalletChainAccountId
  name: string
  shortName: string
  nativeSymbol: string
  decimals: number
  chainIdLabel: string
  accountType: string
  derivationLabel: string
  accentName: 'mozaga' | 'ethereum' | 'bitcoin' | 'solana' | 'tron'
  rpcUrl: string
  explorerUrl: string
  supportsTokens?: boolean
}

export const CRYPTO_NETWORKS: CryptoNetworkConfig[] = [
  {
    id: 'mozaga',
    name: 'Mozaga Mainnet',
    shortName: 'Mozaga',
    nativeSymbol: 'EXO',
    decimals: 18,
    chainIdLabel: '27182818',
    accountType: 'Post-quantum',
    derivationLabel: 'ML-DSA-65 (FIPS 204)',
    accentName: 'mozaga',
    rpcUrl: '',
    explorerUrl: EXPLORER_URL,
    supportsTokens: true,
  },
  {
    id: 'ethereum',
    accountId: 'evm',
    name: 'Ethereum',
    shortName: 'Ethereum',
    nativeSymbol: 'ETH',
    decimals: 18,
    chainIdLabel: '1',
    accountType: 'secp256k1 (ECDSA)',
    derivationLabel: "m/44'/60'/0'/0/0",
    accentName: 'ethereum',
    rpcUrl: ETH_RPC_URL,
    explorerUrl: ETH_EXPLORER_URL,
    supportsTokens: true,
  },
  {
    id: 'bitcoin',
    accountId: 'bitcoin',
    name: 'Bitcoin',
    shortName: 'Bitcoin',
    nativeSymbol: 'BTC',
    decimals: 8,
    chainIdLabel: 'mainnet',
    accountType: 'secp256k1 (P2WPKH)',
    derivationLabel: "m/84'/0'/0'/0/0",
    accentName: 'bitcoin',
    rpcUrl: BITCOIN_RPC_URL,
    explorerUrl: BITCOIN_EXPLORER_URL,
  },
  {
    id: 'solana',
    accountId: 'solana',
    name: 'Solana',
    shortName: 'Solana',
    nativeSymbol: 'SOL',
    decimals: 9,
    chainIdLabel: 'mainnet-beta',
    accountType: 'ed25519',
    derivationLabel: "m/44'/501'/0'/0'",
    accentName: 'solana',
    rpcUrl: SOLANA_RPC_URL,
    explorerUrl: SOLANA_EXPLORER_URL,
    supportsTokens: true,
  },
  {
    id: 'tron',
    accountId: 'tron',
    name: 'Tron',
    shortName: 'Tron',
    nativeSymbol: 'TRX',
    decimals: 6,
    chainIdLabel: 'mainnet',
    accountType: 'secp256k1',
    derivationLabel: "m/44'/195'/0'/0/0",
    accentName: 'tron',
    rpcUrl: TRON_RPC_URL,
    explorerUrl: TRON_EXPLORER_URL,
    supportsTokens: true,
  },
]

export const CRYPTO_NETWORK_BY_ID = CRYPTO_NETWORKS.reduce((acc, network) => {
  acc[network.id] = network
  return acc
}, {} as Record<CryptoNetworkId, CryptoNetworkConfig>)

const bitcoinAddressCache = new WeakMap<object, string>()

function canonicalBitcoinAddress(
  account: { address: string; privateKey?: string } | undefined,
): string | undefined {
  if (!account) return undefined
  const cached = bitcoinAddressCache.get(account)
  if (cached) return cached
  if (!account.privateKey) return account.address
  try {
    const address = deriveBitcoinP2wpkhAddressFromPrivateKey(account.privateKey)
    bitcoinAddressCache.set(account, address)
    return address
  } catch {
    return account.address
  }
}

export function getWalletAddressForNetwork(wallet: EXOWallet, networkId: CryptoNetworkId): string | undefined {
  const network = CRYPTO_NETWORK_BY_ID[networkId]
  if (networkId === 'mozaga') return wallet.address
  if (!network.accountId) return undefined
  if (network.accountId === 'evm') {
    return wallet.chainAccounts?.evm?.address || wallet.ethereumAddress
  }
  if (network.accountId === 'bitcoin') {
    return canonicalBitcoinAddress(wallet.chainAccounts?.bitcoin)
  }
  return wallet.chainAccounts?.[network.accountId]?.address
}

export function getWalletPrivateKeyForNetwork(wallet: EXOWallet, networkId: CryptoNetworkId): string | undefined {
  const network = CRYPTO_NETWORK_BY_ID[networkId]
  if (!network.accountId) return undefined
  if (network.accountId === 'evm') {
    return wallet.chainAccounts?.evm?.privateKey || wallet.ethereumPrivateKey
  }
  return wallet.chainAccounts?.[network.accountId]?.privateKey
}

export function getWalletPublicKeyForNetwork(wallet: EXOWallet, networkId: CryptoNetworkId): string | undefined {
  const network = CRYPTO_NETWORK_BY_ID[networkId]
  if (!network.accountId) return wallet.publicKey
  if (network.accountId === 'evm') {
    return wallet.chainAccounts?.evm?.publicKey || wallet.ethereumPublicKey
  }
  return wallet.chainAccounts?.[network.accountId]?.publicKey
}

export function getAvailableNetworks(wallet: EXOWallet | null): CryptoNetworkConfig[] {
  if (!wallet) return []
  return CRYPTO_NETWORKS.filter((network) => Boolean(getWalletAddressForNetwork(wallet, network.id)))
}
