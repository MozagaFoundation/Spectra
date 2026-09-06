/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { CryptoNetworkId } from './chainRegistry'

// Receipt formats: V2 adds chain id; V3 adds status.

export type CryptoReceiptStatus = 'confirmed' | 'pending' | 'failed'

export interface CryptoReceipt {
  chainId?: string
  symbol: string
  amount: string
  txHash: string
  status?: CryptoReceiptStatus
  recipientIdentityId?: string
  recipientName?: string
}

const RECEIPT_SYMBOL_PATTERN = '[A-Za-z0-9]+'
const RECEIPT_AMOUNT_PATTERN = '(?:0\\.[0-9]*[1-9][0-9]*|[1-9][0-9]*(?:\\.[0-9]+)?)'
const RECEIPT_TX_HASH_PATTERN = '[A-Za-z0-9]+'
const RECEIPT_CHAIN_ID_PATTERN = '[A-Za-z0-9_-]+'
const RECEIPT_STATUS_PATTERN = '(?:confirmed|pending|failed)'
const RECEIPT_CHAIN_ID_REGEX = new RegExp(`^${RECEIPT_CHAIN_ID_PATTERN}$`)
const RECEIPT_OPTIONAL_PARTS_PATTERN = '(?::[^:\\]]*){0,2}'
const CRYPTO_RECEIPT_REGEX = new RegExp(
  `^\\[(?:CRYPTO_TX:${RECEIPT_SYMBOL_PATTERN}|CRYPTO_TX_V2:${RECEIPT_CHAIN_ID_PATTERN}:${RECEIPT_SYMBOL_PATTERN}):${RECEIPT_AMOUNT_PATTERN}:${RECEIPT_TX_HASH_PATTERN}${RECEIPT_OPTIONAL_PARTS_PATTERN}\\]$`
    + `|^\\[CRYPTO_TX_V3:${RECEIPT_CHAIN_ID_PATTERN}:${RECEIPT_SYMBOL_PATTERN}:${RECEIPT_AMOUNT_PATTERN}:${RECEIPT_TX_HASH_PATTERN}:${RECEIPT_STATUS_PATTERN}${RECEIPT_OPTIONAL_PARTS_PATTERN}\\]$`,
)
const CRYPTO_RECEIPT_V3_REGEX = new RegExp(
  `^\\[CRYPTO_TX_V3:(${RECEIPT_CHAIN_ID_PATTERN}):(${RECEIPT_SYMBOL_PATTERN}):(${RECEIPT_AMOUNT_PATTERN}):(${RECEIPT_TX_HASH_PATTERN}):(${RECEIPT_STATUS_PATTERN})(?::([^:\\]]*))?(?::([^:\\]]*))?\\]$`,
)
const CRYPTO_RECEIPT_V2_REGEX = new RegExp(
  `^\\[CRYPTO_TX_V2:(${RECEIPT_CHAIN_ID_PATTERN}):(${RECEIPT_SYMBOL_PATTERN}):(${RECEIPT_AMOUNT_PATTERN}):(${RECEIPT_TX_HASH_PATTERN})(?::([^:\\]]*))?(?::([^:\\]]*))?\\]$`,
)
const CRYPTO_RECEIPT_V1_REGEX = new RegExp(
  `^\\[CRYPTO_TX:(${RECEIPT_SYMBOL_PATTERN}):(${RECEIPT_AMOUNT_PATTERN}):(${RECEIPT_TX_HASH_PATTERN})(?::([^:\\]]*))?(?::([^:\\]]*))?\\]$`,
)
const RECEIPT_NETWORK_IDS: readonly CryptoNetworkId[] = ['mozaga', 'ethereum', 'bitcoin', 'solana', 'tron']
const RECEIPT_NETWORK_ID_SET = new Set<string>(RECEIPT_NETWORK_IDS)

function encodeReceiptPart(value: string): string {
  return encodeURIComponent(value)
}

function decodeReceiptPart(value?: string): string | undefined {
  if (!value) return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function createChainCryptoReceiptMessage(
  chainId: string,
  symbol: string,
  amount: string,
  txHash: string,
  recipientIdentityId?: string,
  recipientName?: string,
  status: CryptoReceiptStatus = 'confirmed',
): string {
  if (!RECEIPT_CHAIN_ID_REGEX.test(chainId)) {
    throw new Error('Invalid crypto receipt chain id')
  }

  if (status !== 'confirmed') {
    const prefix = `CRYPTO_TX_V3:${chainId}`
    if (recipientIdentityId || recipientName) {
      return `[${prefix}:${symbol}:${amount}:${txHash}:${status}:${encodeReceiptPart(recipientIdentityId || '')}:${encodeReceiptPart(recipientName || '')}]`
    }
    return `[${prefix}:${symbol}:${amount}:${txHash}:${status}]`
  }

  const prefix = `CRYPTO_TX_V2:${chainId}`
  if (recipientIdentityId || recipientName) {
    return `[${prefix}:${symbol}:${amount}:${txHash}:${encodeReceiptPart(recipientIdentityId || '')}:${encodeReceiptPart(recipientName || '')}]`
  }
  return `[${prefix}:${symbol}:${amount}:${txHash}]`
}

export function isCryptoReceipt(content: string): boolean {
  return CRYPTO_RECEIPT_REGEX.test(content.trim())
}

export function parseCryptoReceipt(content: string): CryptoReceipt | null {
  const v3Match = content.trim().match(CRYPTO_RECEIPT_V3_REGEX)
  if (v3Match) {
    return {
      chainId: v3Match[1],
      symbol: v3Match[2],
      amount: v3Match[3],
      txHash: v3Match[4],
      status: v3Match[5] as CryptoReceiptStatus,
      recipientIdentityId: decodeReceiptPart(v3Match[6]),
      recipientName: decodeReceiptPart(v3Match[7]),
    }
  }

  const v2Match = content.trim().match(CRYPTO_RECEIPT_V2_REGEX)
  if (v2Match) {
    return {
      chainId: v2Match[1],
      symbol: v2Match[2],
      amount: v2Match[3],
      txHash: v2Match[4],
      recipientIdentityId: decodeReceiptPart(v2Match[5]),
      recipientName: decodeReceiptPart(v2Match[6]),
    }
  }

  const match = content.trim().match(CRYPTO_RECEIPT_V1_REGEX)
  if (!match) return null
  return {
    symbol: match[1],
    amount: match[2],
    txHash: match[3],
    recipientIdentityId: decodeReceiptPart(match[4]),
    recipientName: decodeReceiptPart(match[5]),
  }
}

export function isCryptoReceiptNetworkId(value?: string | null): value is CryptoNetworkId {
  return Boolean(value && RECEIPT_NETWORK_ID_SET.has(value))
}

export function resolveCryptoReceiptNetwork(receipt: Pick<CryptoReceipt, 'chainId' | 'symbol'>): CryptoNetworkId {
  if (isCryptoReceiptNetworkId(receipt.chainId)) {
    return receipt.chainId
  }

  switch (receipt.symbol.trim().toUpperCase()) {
    case 'ETH':
      return 'ethereum'
    case 'BTC':
      return 'bitcoin'
    case 'SOL':
      return 'solana'
    case 'TRX':
      return 'tron'
    default:
      return 'mozaga'
  }
}
