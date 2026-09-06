/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { EXOWallet } from '@spectra/identity-vault'
import { getWalletAddressForNetwork, getWalletPrivateKeyForNetwork, type CryptoNetworkId } from './chainRegistry'
import { getBalance, sendEXOTransfer, waitForTransaction } from './mozagaBlockchain'
import {
  getEvmGasPrice,
  getEvmNativeBalance,
  sendEvmNativeTransfer,
  waitForEvmTransaction,
  isValidEthAddress,
  type EvmNetworkId,
  type EvmSendOptions,
} from './ethereumService'
import {
  getBitcoinBalance,
  isValidBitcoinAddress,
  sendBitcoinTransfer,
  waitForBitcoinTransaction,
} from './bitcoinService'
import {
  getSolanaBalance,
  isValidSolanaAddress,
  sendSolanaTransfer,
  waitForSolanaTransaction,
} from './solanaService'
import {
  getTronBalance,
  isValidTronAddress,
  sendTronTransfer,
  waitForTronTransaction,
} from './tronService'
import { isValidExoAddress } from './mozagaBlockchain'
import { assertCryptoNetworkAdmission } from './cryptoNetworkAdmission'

export type NativeSendStatus = 'confirmed' | 'failed' | 'pending'

export function isEvmNetwork(networkId: CryptoNetworkId): networkId is EvmNetworkId {
  return networkId === 'ethereum'
}

export function isValidAddressForNetwork(networkId: CryptoNetworkId, address: string): boolean {
  switch (networkId) {
    case 'mozaga':
      return isValidExoAddress(address)
    case 'ethereum':
      return isValidEthAddress(address)
    case 'bitcoin':
      return isValidBitcoinAddress(address)
    case 'solana':
      return isValidSolanaAddress(address)
    case 'tron':
      return isValidTronAddress(address)
  }
}

export async function getNativeBalanceForNetwork(
  networkId: CryptoNetworkId,
  address: string,
): Promise<string> {
  assertCryptoNetworkAdmission(networkId)

  switch (networkId) {
    case 'mozaga':
      return getBalance(address)
    case 'ethereum':
      return getEvmNativeBalance(networkId, address)
    case 'bitcoin':
      return getBitcoinBalance(address)
    case 'solana':
      return getSolanaBalance(address)
    case 'tron':
      return getTronBalance(address)
  }
}

export async function getNativeFeeForNetwork(networkId: CryptoNetworkId): Promise<bigint> {
  assertCryptoNetworkAdmission(networkId)

  switch (networkId) {
    case 'ethereum':
      return (await getEvmGasPrice(networkId)) * 21000n
    default:
      return 0n
  }
}

export async function sendNativeTransferForNetwork(
  networkId: CryptoNetworkId,
  wallet: EXOWallet,
  to: string,
  amount: string,
  options: EvmSendOptions & { donation?: { to: string; amount: string } } = {},
): Promise<{ txHash: string }> {
  assertCryptoNetworkAdmission(networkId)

  const from = getWalletAddressForNetwork(wallet, networkId)
  if (!from) {
    throw new Error('Wallet account is not available for this network')
  }

  switch (networkId) {
    case 'mozaga':
      return sendEXOTransfer(wallet.privateKey, wallet.publicKey, from, to, amount)
    case 'ethereum': {
      const privateKey = getWalletPrivateKeyForNetwork(wallet, networkId)
      if (!privateKey) throw new Error('EVM private key is not available')
      if (options.nonce === undefined) {
        return sendEvmNativeTransfer(networkId, privateKey, from, to, amount)
      }
      return sendEvmNativeTransfer(networkId, privateKey, from, to, amount, options)
    }
    case 'bitcoin': {
      const privateKey = getWalletPrivateKeyForNetwork(wallet, networkId)
      if (!privateKey) throw new Error('Bitcoin private key is not available')
      if (!options.donation) {
        return sendBitcoinTransfer(privateKey, from, to, amount)
      }
      return sendBitcoinTransfer(privateKey, from, to, amount, { donation: options.donation })
    }
    case 'solana': {
      const privateKey = getWalletPrivateKeyForNetwork(wallet, networkId)
      if (!privateKey) throw new Error('Solana private key is not available')
      return sendSolanaTransfer(privateKey, from, to, amount)
    }
    case 'tron': {
      const privateKey = getWalletPrivateKeyForNetwork(wallet, networkId)
      if (!privateKey) throw new Error('Tron private key is not available')
      return sendTronTransfer(privateKey, from, to, amount)
    }
  }
}

export async function waitForNativeTransaction(
  networkId: CryptoNetworkId,
  txHash: string,
): Promise<{ status: NativeSendStatus; blockNumber?: string }> {
  assertCryptoNetworkAdmission(networkId)

  switch (networkId) {
    case 'mozaga': {
      const result = await waitForTransaction(txHash)
      return { status: result.status === 'confirmed' ? 'confirmed' : result.status === 'failed' ? 'failed' : 'pending' }
    }
    case 'ethereum':
      return waitForEvmTransaction(networkId, txHash)
    case 'bitcoin':
      return waitForBitcoinTransaction(txHash)
    case 'solana':
      return waitForSolanaTransaction(txHash)
    case 'tron':
      return waitForTronTransaction(txHash)
  }
}
