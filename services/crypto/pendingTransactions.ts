/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'
import type { CryptoNetworkId } from './chainRegistry'
import type { TxHistoryItem } from './transactionHistory'

export interface PendingCryptoTransactionInput {
  network: CryptoNetworkId
  txHash: string
  from: string
  to: string
  amount: string
  symbol: string
  assetType: 'native' | 'token'
  tokenIdentifier?: string | null
}

export interface PendingCryptoTransaction extends PendingCryptoTransactionInput {
  id: string
  timestamp: number
}

const PENDING_TX_STORAGE_KEY_PREFIX = 'spectra.crypto.pendingTransactions.v1'
const MAX_PENDING_TRANSACTIONS = 80
const PENDING_TX_TTL_MS = 7 * 24 * 60 * 60 * 1000

function transactionKey(network: CryptoNetworkId, hash: string): string {
  const trimmed = hash.trim()
  const normalizedHash = trimmed.startsWith('0x') ? trimmed.toLowerCase() : trimmed
  return `${network}:${normalizedHash}`
}

function addressMatches(network: CryptoNetworkId, left: string, right: string): boolean {
  return network === 'ethereum' || network === 'mozaga' || network === 'tron'
    ? left.trim().toLowerCase() === right.trim().toLowerCase()
    : left.trim() === right.trim()
}

function storageAddress(network: CryptoNetworkId, address: string): string {
  const trimmed = address.trim()
  return network === 'ethereum' || network === 'mozaga' || network === 'tron'
    ? trimmed.toLowerCase()
    : trimmed
}

function storageKey(network: CryptoNetworkId, address: string): string {
  return `${PENDING_TX_STORAGE_KEY_PREFIX}:${network}:${storageAddress(network, address)}`
}

function normalizeRecord(input: PendingCryptoTransactionInput): PendingCryptoTransaction {
  const txHash = input.txHash.trim()
  const network = input.network
  return {
    ...input,
    network,
    txHash,
    from: input.from.trim(),
    to: input.to.trim(),
    amount: input.amount.trim(),
    symbol: input.symbol.trim().toUpperCase(),
    id: transactionKey(network, txHash),
    timestamp: Date.now(),
  }
}

function isPendingRecord(value: unknown): value is PendingCryptoTransaction {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<PendingCryptoTransaction>
  return typeof record.id === 'string'
    && typeof record.txHash === 'string'
    && typeof record.from === 'string'
    && typeof record.to === 'string'
    && typeof record.amount === 'string'
    && typeof record.symbol === 'string'
    && typeof record.timestamp === 'number'
    && typeof record.assetType === 'string'
    && typeof record.network === 'string'
}

async function readPendingTransactions(
  network: CryptoNetworkId,
  address: string,
): Promise<PendingCryptoTransaction[]> {
  try {
    const raw = await getAppKeyValueStorage().getItem(storageKey(network, address))
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    const cutoff = Date.now() - PENDING_TX_TTL_MS
    return parsed
      .filter(isPendingRecord)
      .filter((record) => record.timestamp >= cutoff)
  } catch {
    return []
  }
}

async function writePendingTransactions(
  network: CryptoNetworkId,
  address: string,
  records: PendingCryptoTransaction[],
): Promise<void> {
  const cutoff = Date.now() - PENDING_TX_TTL_MS
  const trimmed = records
    .filter((record) => record.timestamp >= cutoff)
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, MAX_PENDING_TRANSACTIONS)
  await getAppKeyValueStorage().setItem(storageKey(network, address), JSON.stringify(trimmed))
}

export async function recordPendingCryptoTransaction(input: PendingCryptoTransactionInput): Promise<void> {
  try {
    const nextRecord = normalizeRecord(input)
    const records = await readPendingTransactions(nextRecord.network, nextRecord.from)
    const withoutDuplicate = records.filter((record) => record.id !== nextRecord.id)
    await writePendingTransactions(nextRecord.network, nextRecord.from, [nextRecord, ...withoutDuplicate])
  } catch (error) {
    if (__DEV__) console.warn('[CryptoPending] Failed to record pending transaction:', error)
  }
}

export async function clearAllPendingCryptoTransactionStorage(): Promise<void> {
  const keys = await getAppKeyValueStorage().getAllKeys()
  const pendingKeys = keys.filter((key) => key.startsWith(PENDING_TX_STORAGE_KEY_PREFIX))
  if (pendingKeys.length > 0) {
    await getAppKeyValueStorage().multiRemove(pendingKeys)
  }
}

export async function loadPendingCryptoTransactions(
  network: CryptoNetworkId,
  address: string,
): Promise<PendingCryptoTransaction[]> {
  if (!address) return []
  const records = await readPendingTransactions(network, address)
  return records.filter((record) => (
    record.network === network
    && addressMatches(network, record.from, address)
  ))
}

export async function pruneIndexedPendingCryptoTransactions(
  network: CryptoNetworkId,
  address: string,
  indexedTransactions: TxHistoryItem[],
): Promise<void> {
  if (!address || indexedTransactions.length === 0) return
  const indexedKeys = new Set(indexedTransactions.map((tx) => transactionKey(tx.network, tx.hash)))
  const records = await readPendingTransactions(network, address)
  const nextRecords = records.filter((record) => !indexedKeys.has(record.id))
  if (nextRecords.length !== records.length) {
    await writePendingTransactions(network, address, nextRecords)
  }
}

export function mergePendingCryptoTransactions(
  indexedTransactions: TxHistoryItem[],
  pendingTransactions: PendingCryptoTransaction[],
): TxHistoryItem[] {
  if (pendingTransactions.length === 0) return indexedTransactions

  const indexedKeys = new Set(indexedTransactions.map((tx) => transactionKey(tx.network, tx.hash)))
  const pendingItems = pendingTransactions
    .filter((record) => !indexedKeys.has(record.id))
    .map((record): TxHistoryItem => ({
      hash: record.txHash,
      from: record.from,
      to: record.to,
      value: record.assetType === 'token' ? `${record.amount} ${record.symbol}` : record.amount,
      timestamp: record.timestamp,
      status: 'pending',
      blockNumber: 0,
      direction: 'sent',
      category: record.assetType === 'token' ? 'token_transfer' : 'transfer',
      typeName: `${record.symbol} Transfer`,
      network: record.network,
    }))

  return [...pendingItems, ...indexedTransactions]
    .sort((left, right) => right.timestamp - left.timestamp)
}
