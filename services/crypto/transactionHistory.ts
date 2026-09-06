/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import {
  BITCOIN_EXPLORER_URL,
  ETH_EXPLORER_URL,
  EXPLORER_URL,
  SOLANA_EXPLORER_URL,
  TRON_EXPLORER_URL,
} from '@/lib/constants'
import type { CryptoNetworkId } from './chainRegistry'
import type { WalletIndexLocalTransaction } from '@/services/storage/walletIndexStorage'

const ETH_TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/
const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/
const EXO_ADDRESS_REGEX = /^(EXO|EXI|exo|exi)(00|01)[0-9a-fA-F]{38}$/

export interface TxHistoryItem {
  hash: string
  from: string
  to: string
  value: string
  timestamp: number
  status: 'success' | 'pending' | 'failed'
  blockNumber: number
  direction: 'sent' | 'received' | 'self'
  category: string
  typeName: string
  network: CryptoNetworkId
}

const NATIVE_DECIMALS: Record<CryptoNetworkId, number> = {
  mozaga: 18,
  ethereum: 18,
  bitcoin: 8,
  solana: 9,
  tron: 6,
}

function formatAtomicAmount(value: string, decimals: number): string {
  try {
    const raw = BigInt(value)
    if (raw === 0n) return '0'
    const divisor = 10n ** BigInt(decimals)
    const whole = raw / divisor
    const remainder = raw % divisor
    if (remainder === 0n) return whole.toString()
    const decimal = remainder.toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '')
    return decimal ? `${whole}.${decimal}` : whole.toString()
  } catch {
    return '0'
  }
}

function firstTokenTransfer(value: unknown[]): Record<string, unknown> | null {
  const first = value[0]
  return first && typeof first === 'object' ? first as Record<string, unknown> : null
}

export function mapLocalWalletIndexTransaction(
  transaction: WalletIndexLocalTransaction,
): TxHistoryItem {
  const network = transaction.chain
  const tokenTransfer = firstTokenTransfer(transaction.tokenTransfers)
  const tokenSymbol = typeof tokenTransfer?.tokenSymbol === 'string'
    ? tokenTransfer.tokenSymbol
    : typeof tokenTransfer?.tokenIdentifier === 'string'
    ? tokenTransfer.tokenIdentifier
    : 'Token'
  const tokenDecimals = typeof tokenTransfer?.tokenDecimals === 'number'
    ? tokenTransfer.tokenDecimals
    : 0
  const tokenAmount = typeof tokenTransfer?.amountAtomic === 'string'
    ? tokenTransfer.amountAtomic
    : typeof tokenTransfer?.amountAtomic === 'number'
    ? String(tokenTransfer.amountAtomic)
    : '0'
  const direction = transaction.direction === 'outbound'
    ? 'sent'
    : transaction.direction === 'self'
    ? 'self'
    : 'received'
  const status = transaction.status === 'pending'
    ? 'pending'
    : transaction.status === 'confirmed'
    ? 'success'
    : 'failed'
  return {
    hash: transaction.txHash,
    from: direction === 'sent' ? transaction.address : transaction.counterpartyAddress,
    to: direction === 'sent' ? transaction.counterpartyAddress : transaction.address,
    value: tokenTransfer
      ? `${formatAtomicAmount(tokenAmount, tokenDecimals)} ${tokenSymbol}`
      : formatAtomicAmount(transaction.nativeAmountAtomic, NATIVE_DECIMALS[network]),
    timestamp: transaction.occurredAt,
    status,
    blockNumber: transaction.blockHeight,
    direction,
    category: tokenTransfer ? 'token_transfer' : 'transfer',
    typeName: tokenTransfer ? `${tokenSymbol} Transfer` : `${transaction.nativeSymbol} Transfer`,
    network,
  }
}

function getMozagaExplorerBaseUrl(): string {
  const baseUrl = EXPLORER_URL.trim().replace(/\/+$/, '')
  if (!baseUrl) throw new Error('Mozaga explorer URL is not configured')
  return baseUrl
}

function normalizeMozagaExplorerAddress(address: string): string {
  const trimmed = address.trim()
  if (EXO_ADDRESS_REGEX.test(trimmed)) {
    return `0x${trimmed.slice(3)}`.toLowerCase()
  }
  if (ETH_ADDRESS_REGEX.test(trimmed)) return trimmed.toLowerCase()
  throw new Error('Invalid Mozaga address')
}

export function getMozagaExplorerTxUrl(hash: string): string {
  if (!ETH_TX_HASH_REGEX.test(hash.trim())) throw new Error('Invalid transaction hash')
  return `${getMozagaExplorerBaseUrl()}/tx/${hash.trim()}`
}

export function getMozagaExplorerAddressUrl(address: string): string {
  return `${getMozagaExplorerBaseUrl()}/address/${normalizeMozagaExplorerAddress(address)}`
}

export function getEthExplorerTxUrl(hash: string): string {
  if (!ETH_TX_HASH_REGEX.test(hash.trim())) throw new Error('Invalid transaction hash')
  return `${ETH_EXPLORER_URL.replace(/\/+$/, '')}/tx/${hash.trim()}`
}

export function getEthExplorerAddressUrl(address: string): string {
  if (!ETH_ADDRESS_REGEX.test(address.trim())) throw new Error('Invalid Ethereum address')
  return `${ETH_EXPLORER_URL.replace(/\/+$/, '')}/address/${address.trim()}`
}

export function getBitcoinExplorerTxUrl(hash: string): string {
  return `${BITCOIN_EXPLORER_URL.replace(/\/+$/, '')}/tx/${encodeURIComponent(hash.trim())}`
}

export function getBitcoinExplorerAddressUrl(address: string): string {
  return `${BITCOIN_EXPLORER_URL.replace(/\/+$/, '')}/address/${encodeURIComponent(address.trim())}`
}

export function getSolanaExplorerTxUrl(hash: string): string {
  return `${SOLANA_EXPLORER_URL.replace(/\/+$/, '')}/tx/${encodeURIComponent(hash.trim())}`
}

export function getSolanaExplorerAddressUrl(address: string): string {
  return `${SOLANA_EXPLORER_URL.replace(/\/+$/, '')}/address/${encodeURIComponent(address.trim())}`
}

export function getTronExplorerTxUrl(hash: string): string {
  return `${TRON_EXPLORER_URL.replace(/\/+$/, '')}/transaction/${encodeURIComponent(hash.trim())}`
}

export function getTronExplorerAddressUrl(address: string): string {
  return `${TRON_EXPLORER_URL.replace(/\/+$/, '')}/address/${encodeURIComponent(address.trim())}`
}
