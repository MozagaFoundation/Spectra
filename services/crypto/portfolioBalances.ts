/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { QueryClient } from '@tanstack/react-query'
import type { EXOWallet } from '@spectra/identity-vault'
import { canUseRpcProxy } from '@/services/backend/rpcProxy'
import {
  getAvailableNetworks,
  getWalletAddressForNetwork,
  type CryptoNetworkConfig,
  type CryptoNetworkId,
} from './chainRegistry'
import {
  getAllTokenBalances,
  getEthBalance,
  type TokenBalance,
} from './ethereumService'
import {
  getBalance,
  getUserAssets,
  type UserAsset,
} from './mozagaBlockchain'
import { getNativeBalanceForNetwork } from './nativeChainService'
import {
  getAllSolanaTokenBalances,
} from './solanaService'
import {
  getAllTronTokenBalances,
} from './tronService'
import type { NetworkTokenBalance } from './tokenRegistry'
import {
  assertCryptoNetworkAdmission,
  assertCryptoNetworkAdmissions,
} from './cryptoNetworkAdmission'

export type NetworkBalances = Partial<Record<CryptoNetworkId, string>>

export interface MozagaPortfolioData {
  balance: string
  assets: UserAsset[]
}

export interface EthPortfolioData {
  balance: string
  tokens: TokenBalance[]
}

export interface ExternalPortfolioData {
  balances: NetworkBalances
  tokens: Partial<Record<CryptoNetworkId, NetworkTokenBalance[]>>
}

export const DEFAULT_MOZAGA_PORTFOLIO_DATA: MozagaPortfolioData = { balance: '0.0', assets: [] }
export const DEFAULT_ETH_PORTFOLIO_DATA: EthPortfolioData = { balance: '0.0', tokens: [] }
export const DEFAULT_EXTERNAL_PORTFOLIO_DATA: ExternalPortfolioData = { balances: {}, tokens: {} }

export function cryptoPortfolioWalletKey(wallet: EXOWallet | null): string {
  if (!wallet) return 'no-wallet'

  const chainAccounts = Object.entries(wallet.chainAccounts || {})
    .map(([network, account]) => `${network}:${account?.address || ''}`)
    .sort()
    .join('|')

  return [
    wallet.address || '',
    wallet.ethereumAddress || '',
    chainAccounts,
  ].join('|')
}

export function invalidateCryptoPortfolio(
  queryClient: QueryClient,
  wallet: EXOWallet | null,
): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: ['cryptoPortfolio', cryptoPortfolioWalletKey(wallet)] })
}

export function refetchCryptoPortfolio(
  queryClient: QueryClient,
  wallet: EXOWallet | null,
): Promise<void> {
  return queryClient.refetchQueries({
    queryKey: ['cryptoPortfolio', cryptoPortfolioWalletKey(wallet)],
    type: 'active',
  })
}

export async function loadNativeBalanceForNetwork(
  network: CryptoNetworkId,
  address: string,
  fallbackBalance = '0',
): Promise<string> {
  assertCryptoNetworkAdmission(network)
  const canLoadLiveRpc = await canUseRpcProxy()
  if (!canLoadLiveRpc) return fallbackBalance
  return await getNativeBalanceForNetwork(network, address)
}

export async function loadMozagaPortfolioData(wallet: EXOWallet | null): Promise<MozagaPortfolioData> {
  if (!wallet?.address) return DEFAULT_MOZAGA_PORTFOLIO_DATA
  assertCryptoNetworkAdmission('mozaga')

  const [balance, assets] = await Promise.all([
    getBalance(wallet.address),
    getUserAssets(wallet.address),
  ])

  return { balance, assets }
}

export async function loadEthereumPortfolioData(wallet: EXOWallet | null): Promise<EthPortfolioData> {
  const ethereumAddress = wallet ? getWalletAddressForNetwork(wallet, 'ethereum') : undefined
  if (!ethereumAddress) return DEFAULT_ETH_PORTFOLIO_DATA
  assertCryptoNetworkAdmission('ethereum')
  const canLoadLiveRpc = await canUseRpcProxy()

  const [balance, tokens] = await Promise.all([
    canLoadLiveRpc ? getEthBalance(ethereumAddress) : Promise.resolve(DEFAULT_ETH_PORTFOLIO_DATA.balance),
    canLoadLiveRpc ? getAllTokenBalances(ethereumAddress) : Promise.resolve([]),
  ])

  return { balance, tokens }
}

export async function loadExternalPortfolioData(
  wallet: EXOWallet | null,
  networks: CryptoNetworkConfig[] = getAvailableNetworks(wallet)
    .filter((network) => network.id !== 'mozaga' && network.id !== 'ethereum'),
): Promise<ExternalPortfolioData> {
  if (!wallet || networks.length === 0) return DEFAULT_EXTERNAL_PORTFOLIO_DATA
  assertCryptoNetworkAdmissions(networks.map((network) => network.id))
  const canLoadLiveRpc = await canUseRpcProxy()

  const balances: NetworkBalances = {}
  const tokens: Partial<Record<CryptoNetworkId, NetworkTokenBalance[]>> = {}

  await Promise.allSettled(networks.map(async (network) => {
    const address = getWalletAddressForNetwork(wallet, network.id)
    if (!address) return

    const [nativeBalance, tokenBalances] = await Promise.all([
      canLoadLiveRpc ? getNativeBalanceForNetwork(network.id, address) : Promise.resolve('0'),
      canLoadLiveRpc && network.id === 'solana'
        ? getAllSolanaTokenBalances(address)
        : canLoadLiveRpc && network.id === 'tron'
          ? getAllTronTokenBalances(address)
          : Promise.resolve([]),
    ])

    balances[network.id] = nativeBalance
    if (tokenBalances.length > 0) {
      tokens[network.id] = tokenBalances
    }
  }))

  return { balances, tokens }
}
