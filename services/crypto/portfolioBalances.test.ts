/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  getAllTokenBalances: vi.fn(async () => []),
  getEthBalance: vi.fn(async () => '9'),
  getBalance: vi.fn(async () => '10'),
  getUserAssets: vi.fn(async () => []),
  getNativeBalanceForNetwork: vi.fn(async () => '8'),
  getAllSolanaTokenBalances: vi.fn(async () => []),
  getAllTronTokenBalances: vi.fn(async () => []),
  canUseRpcProxy: vi.fn(async () => true),
}))

vi.mock('@/lib/constants', () => ({
  BITCOIN_EXPLORER_URL: '',
  BITCOIN_RPC_URL: 'https://bitcoin.example',
  ETH_EXPLORER_URL: '',
  ETH_RPC_URL: 'https://ethereum.example',
  EXPLORER_URL: '',
  SOLANA_EXPLORER_URL: '',
  SOLANA_RPC_URL: 'https://solana.example',
  TRON_EXPLORER_URL: '',
  TRON_RPC_URL: 'https://tron.example',
}))

vi.mock('@/services/backend/rpcProxy', () => ({
  canUseRpcProxy: mockState.canUseRpcProxy,
}))

vi.mock('./ethereumService', () => ({
  getAllTokenBalances: mockState.getAllTokenBalances,
  getEthBalance: mockState.getEthBalance,
}))

vi.mock('./mozagaBlockchain', () => ({
  getBalance: mockState.getBalance,
  getUserAssets: mockState.getUserAssets,
}))

vi.mock('./nativeChainService', () => ({
  getNativeBalanceForNetwork: mockState.getNativeBalanceForNetwork,
}))

vi.mock('./solanaService', () => ({
  getAllSolanaTokenBalances: mockState.getAllSolanaTokenBalances,
}))

vi.mock('./tronService', () => ({
  getAllTronTokenBalances: mockState.getAllTronTokenBalances,
}))

vi.mock('./cryptoNetworkAdmission', () => ({
  assertCryptoNetworkAdmission: vi.fn(),
  assertCryptoNetworkAdmissions: vi.fn(),
}))

import { CRYPTO_NETWORK_BY_ID } from './chainRegistry'
import {
  loadEthereumPortfolioData,
  loadExternalPortfolioData,
  loadNativeBalanceForNetwork,
} from './portfolioBalances'

const wallet = {
  address: 'EXO0000000000000000000000000000000000000000',
  ethereumAddress: '0x1111111111111111111111111111111111111111',
  chainAccounts: {
    evm: { address: '0x1111111111111111111111111111111111111111' },
    bitcoin: { address: 'bc1sender' },
    solana: { address: 'So11111111111111111111111111111111111111112' },
    tron: { address: 'TWalletAddress' },
  },
} as any

describe('portfolioBalances', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.canUseRpcProxy.mockResolvedValue(true)
    mockState.getEthBalance.mockResolvedValue('9')
    mockState.getNativeBalanceForNetwork.mockResolvedValue('8')
  })

  it('loads Ethereum data directly from the RPC path', async () => {
    await expect(loadEthereumPortfolioData(wallet)).resolves.toEqual({
      balance: '9',
      tokens: [],
    })
    expect(mockState.getEthBalance).toHaveBeenCalledWith(wallet.ethereumAddress)
    expect(mockState.getAllTokenBalances).toHaveBeenCalledWith(wallet.ethereumAddress)
  })

  it('uses the active EVM chain account for direct Ethereum requests', async () => {
    const activeEvmAddress = '0x2222222222222222222222222222222222222222'
    const migratedWallet = {
      ...wallet,
      chainAccounts: { ...wallet.chainAccounts, evm: { address: activeEvmAddress } },
    }

    await loadEthereumPortfolioData(migratedWallet)

    expect(mockState.getEthBalance).toHaveBeenCalledWith(activeEvmAddress)
    expect(mockState.getAllTokenBalances).toHaveBeenCalledWith(activeEvmAddress)
  })

  it('does not make RPC requests when the secure RPC path is unavailable', async () => {
    mockState.canUseRpcProxy.mockResolvedValue(false)

    await expect(loadEthereumPortfolioData(wallet)).resolves.toEqual({
      balance: '0.0',
      tokens: [],
    })

    expect(mockState.getEthBalance).not.toHaveBeenCalled()
    expect(mockState.getAllTokenBalances).not.toHaveBeenCalled()
  })

  it('loads external balances directly while preserving per-chain isolation', async () => {
    await expect(loadExternalPortfolioData(wallet, [CRYPTO_NETWORK_BY_ID.solana])).resolves.toEqual({
      balances: { solana: '8' },
      tokens: {},
    })

    expect(mockState.getNativeBalanceForNetwork).toHaveBeenCalledWith(
      'solana',
      wallet.chainAccounts.solana.address,
    )
  })

  it('returns the caller fallback for the send screen without RPC access', async () => {
    mockState.canUseRpcProxy.mockResolvedValue(false)

    await expect(loadNativeBalanceForNetwork('tron', wallet.chainAccounts.tron.address, '7')).resolves.toBe('7')
    expect(mockState.getNativeBalanceForNetwork).not.toHaveBeenCalled()
  })
})
