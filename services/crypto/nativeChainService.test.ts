/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  getBalance: vi.fn(async () => '10'),
  sendEXOTransfer: vi.fn(async () => ({ txHash: '0xexo' })),
  waitForTransaction: vi.fn(async () => ({ status: 'confirmed' })),
  isValidExoAddress: vi.fn((address: string) => address.startsWith('EXO')),
  getEvmNativeBalance: vi.fn(async () => '2'),
  getEvmGasPrice: vi.fn(async () => 3n),
  sendEvmNativeTransfer: vi.fn(async () => ({ txHash: '0xevm' })),
  waitForEvmTransaction: vi.fn(async () => ({ status: 'pending' })),
  isValidEthAddress: vi.fn((address: string) => address.startsWith('0x')),
  getBitcoinBalance: vi.fn(async () => '0.1'),
  sendBitcoinTransfer: vi.fn(async () => ({ txHash: 'btc' })),
  waitForBitcoinTransaction: vi.fn(async () => ({ status: 'confirmed' })),
  isValidBitcoinAddress: vi.fn((address: string) => address.startsWith('bc1')),
  getSolanaBalance: vi.fn(async () => '1'),
  sendSolanaTransfer: vi.fn(async () => ({ txHash: 'sol' })),
  waitForSolanaTransaction: vi.fn(async () => ({ status: 'confirmed' })),
  isValidSolanaAddress: vi.fn((address: string) => address.startsWith('sol')),
  getTronBalance: vi.fn(async () => '3'),
  sendTronTransfer: vi.fn(async () => ({ txHash: 'tron' })),
  waitForTronTransaction: vi.fn(async () => ({ status: 'failed' })),
  isValidTronAddress: vi.fn((address: string) => address.startsWith('T')),
}))

vi.mock('@/lib/constants', () => ({
  BITCOIN_EXPLORER_URL: '',
  BITCOIN_RPC_URL: '',
  ETH_EXPLORER_URL: '',
  ETH_RPC_URL: '',
  EXPLORER_URL: '',
  SOLANA_EXPLORER_URL: '',
  SOLANA_RPC_URL: '',
  TRON_EXPLORER_URL: '',
  TRON_RPC_URL: '',
}))

vi.mock('./mozagaBlockchain', () => ({
  getBalance: mockState.getBalance,
  sendEXOTransfer: mockState.sendEXOTransfer,
  waitForTransaction: mockState.waitForTransaction,
  isValidExoAddress: mockState.isValidExoAddress,
}))

vi.mock('./ethereumService', () => ({
  getEvmGasPrice: mockState.getEvmGasPrice,
  getEvmNativeBalance: mockState.getEvmNativeBalance,
  sendEvmNativeTransfer: mockState.sendEvmNativeTransfer,
  waitForEvmTransaction: mockState.waitForEvmTransaction,
  isValidEthAddress: mockState.isValidEthAddress,
}))

vi.mock('./bitcoinService', () => ({
  getBitcoinBalance: mockState.getBitcoinBalance,
  isValidBitcoinAddress: mockState.isValidBitcoinAddress,
  sendBitcoinTransfer: mockState.sendBitcoinTransfer,
  waitForBitcoinTransaction: mockState.waitForBitcoinTransaction,
}))

vi.mock('./solanaService', () => ({
  getSolanaBalance: mockState.getSolanaBalance,
  isValidSolanaAddress: mockState.isValidSolanaAddress,
  sendSolanaTransfer: mockState.sendSolanaTransfer,
  waitForSolanaTransaction: mockState.waitForSolanaTransaction,
}))

vi.mock('./tronService', () => ({
  getTronBalance: mockState.getTronBalance,
  isValidTronAddress: mockState.isValidTronAddress,
  sendTronTransfer: mockState.sendTronTransfer,
  waitForTronTransaction: mockState.waitForTronTransaction,
}))

vi.mock('./cryptoNetworkAdmission', () => ({
  assertCryptoNetworkAdmission: vi.fn(),
}))

import {
  getNativeBalanceForNetwork,
  getNativeFeeForNetwork,
  isEvmNetwork,
  isValidAddressForNetwork,
  sendNativeTransferForNetwork,
  waitForNativeTransaction,
} from './nativeChainService'

const wallet = {
  address: 'EXO0000000000000000000000000000000000000000',
  privateKey: 'mozaga-private',
  publicKey: 'mozaga-public',
  chainAccounts: {
    evm: { address: '0xevm', privateKey: 'evm-private' },
    bitcoin: { address: 'bc1sender', privateKey: 'btc-private' },
    solana: { address: 'solSender', privateKey: 'sol-private' },
    tron: { address: 'TSender', privateKey: 'tron-private' },
  },
} as any

describe('nativeChainService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('identifies EVM networks only', () => {
    expect(isEvmNetwork('ethereum')).toBe(true)
    expect(isEvmNetwork('mozaga')).toBe(false)
  })

  it('dispatches address validation by network', () => {
    expect(isValidAddressForNetwork('mozaga', 'EXOabc')).toBe(true)
    expect(isValidAddressForNetwork('ethereum', '0xabc')).toBe(true)
    expect(isValidAddressForNetwork('bitcoin', 'bc1abc')).toBe(true)
    expect(isValidAddressForNetwork('solana', 'solabc')).toBe(true)
    expect(isValidAddressForNetwork('tron', 'Tabc')).toBe(true)
  })

  it('dispatches balance, fee, send, and wait operations to the selected chain', async () => {
    await expect(getNativeBalanceForNetwork('ethereum', '0xabc')).resolves.toBe('2')
    expect(mockState.getEvmNativeBalance).toHaveBeenCalledWith('ethereum', '0xabc')

    await expect(getNativeFeeForNetwork('ethereum')).resolves.toBe(63_000n)
    await expect(getNativeFeeForNetwork('bitcoin')).resolves.toBe(0n)

    await expect(sendNativeTransferForNetwork('ethereum', wallet, '0xto', '1')).resolves.toEqual({ txHash: '0xevm' })
    expect(mockState.sendEvmNativeTransfer).toHaveBeenCalledWith('ethereum', 'evm-private', '0xevm', '0xto', '1')

    await expect(sendNativeTransferForNetwork('bitcoin', wallet, 'bc1to', '0.01')).resolves.toEqual({ txHash: 'btc' })
    expect(mockState.sendBitcoinTransfer).toHaveBeenCalledWith('btc-private', 'bc1sender', 'bc1to', '0.01')

    await expect(waitForNativeTransaction('tron', 'hash')).resolves.toEqual({ status: 'failed' })
  })
})
