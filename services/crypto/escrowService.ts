/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { translate } from '@/lib/i18n'
import { formatBigIntAmount, parseDecimalToBigInt } from '@/lib/amounts'
import {
  concatBytes,
  writeAddress,
  writeBigInt,
  writeEntityId,
  writeUint16,
  writeUint64,
  writeUint8,
} from './encoding'
import { rpcCall, signAndSendTransaction } from './shared'

const ESCROW_STATE_ADDR = '0xE555555555555555555555555555555555555555'

const TX_TYPE = {
  CREATE_FIAT_ORDER: 0x60,
  CREATE_CONDITION_ORDER: 0x61,
  ACCEPT_ORDER: 0x62,
  CONFIRM_PAYMENT: 0x63,
  BUYER_CONFIRM: 0x64,
  CANCEL_ORDER: 0x65,
  RAISE_DISPUTE: 0x66,
  RESOLVE_DISPUTE: 0x67,
  CREATE_BUY_FIAT_ORDER: 0x6B,
  CREATE_BUY_CONDITION_ORDER: 0x6C,
} as const

export enum EscrowOrderType { Fiat = 0, Condition = 1 }
export enum EscrowOrderSide { Sell = 0, Buy = 1 }
export enum EscrowOrderStatus { Open = 0, Accepted = 1, SellerConfirmed = 2, Completed = 3, Cancelled = 4, Disputed = 5, Expired = 6 }
export enum EscrowDisputeStatus { Pending = 0, Resolved = 1, Expired = 2 }
export enum EscrowResolution { None = 0, BuyerWins = 1, SellerWins = 2, Split = 3 }

export const MIN_ORDER_EXPIRATION_DAYS = 1
export const MAX_ORDER_EXPIRATION_DAYS = 30

export interface EscrowOrder {
  orderId: string; seller: string; buyer: string; amount: string;
  orderType: string; side: string; fiatPrice?: string; fiatCurrency?: string;
  conditionHash?: string; conditionDescription?: string; status: string;
  createdAt: number; expiresAt: number; buyerConfirmDeadline?: number;
  sellerConfirmDeadline?: number;
  arbitrator?: string; proposedArbitrator?: string; arbitratorAgreed?: boolean;
  minBuyerReputation?: number;
  sellerWantsCancel?: boolean; buyerWantsCancel?: boolean;
}

export interface ArbitratorInfo {
  address: string; active: boolean; registeredAt: number; totalCases: number;
  resolvedCases: number; reputationScore: number; stakedAmount: string;
}

export interface DisputeInfo {
  disputeID: string; orderID: string; initiator: string; reason: string;
  createdAt: number; resolveDeadline: number; status: string;
  resolution?: string; arbitrator?: string;
}

export interface ReputationInfo {
  address: string; score: number; totalTrades: number; successfulTrades: number;
  failedTrades: number; disputesRaised: number; disputesWon: number;
  disputesLost: number; totalVolume?: string;
}

export interface EscrowStats {
  totalOrders: number; activeOrders: number; totalDisputes: number;
  arbitratorCount: number; arbitratorReserve: string;
}

// RPC reads

export async function getEscrowOrder(orderId: string): Promise<EscrowOrder | null> {
  try {
    return await rpcCall<EscrowOrder>('escrow_getOrder', [orderId])
  } catch (error: any) {
    if (!error?.message?.includes('not found')) console.error('Error fetching escrow order:', error)
    return null
  }
}

export async function listEscrowOrders(
  status?: string,
  address?: string,
  limit: number = 50,
  offset: number = 0,
): Promise<EscrowOrder[]> {
  try {
    const statusParam = status || ''
    const addressParam = address || ''
    const result = await rpcCall<{ orders: EscrowOrder[]; total: number; hasMore: boolean }>('escrow_listOrders', [statusParam, addressParam, offset, limit])
    return result?.orders || []
  } catch (error) {
    console.error('Error listing escrow orders:', error)
    return []
  }
}

export async function getArbitrator(address: string): Promise<ArbitratorInfo | null> {
  try {
    return await rpcCall<ArbitratorInfo>('escrow_getArbitrator', [address])
  } catch (error) {
    console.error('Error fetching arbitrator:', error)
    return null
  }
}

export async function getReputation(address: string): Promise<ReputationInfo | null> {
  try {
    return await rpcCall<ReputationInfo>('escrow_getReputation', [address])
  } catch (error) {
    console.error('Error fetching reputation:', error)
    return null
  }
}

export async function getEscrowDispute(disputeId: string): Promise<DisputeInfo | null> {
  try {
    return await rpcCall<DisputeInfo>('escrow_getDispute', [disputeId])
  } catch (error) {
    console.error('Error fetching dispute:', error)
    return null
  }
}

export async function getEscrowStats(): Promise<EscrowStats | null> {
  try {
    return await rpcCall<EscrowStats>('escrow_getStats', [])
  } catch (error) {
    console.error('Error fetching escrow stats:', error)
    return null
  }
}

export async function checkOrderExpiration(orderId: string): Promise<boolean> {
  try {
    return await rpcCall<boolean>('escrow_checkOrderExpiration', [orderId])
  } catch (error) {
    console.error('Error checking order expiration:', error)
    return false
  }
}

async function signAndSendEscrowTransaction(
  privateKeyHex: string,
  publicKeyHex: string,
  fromAddress: string,
  txData: Uint8Array,
  value: bigint = 0n,
): Promise<{ txHash: string; from: string }> {
  return signAndSendTransaction({
    privateKeyHex,
    publicKeyHex,
    fromAddress,
    toAddress: ESCROW_STATE_ADDR,
    txData,
    value,
  })
}

// Transactions

export async function createFiatOrder(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  amount: bigint,
  fiatPrice: bigint,
  fiatCurrency: string,
  expirationDays: number,
  proposedArbitrator?: string,
  minBuyerReputation?: number,
): Promise<{ txHash: string; from: string }> {
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + expirationDays * 86400)
  const currencyBytes = new TextEncoder().encode(fiatCurrency)
  const arbBytes = proposedArbitrator
    ? writeAddress(proposedArbitrator)
    : new Uint8Array(20)

  const parts: Uint8Array[] = [
    writeUint8(TX_TYPE.CREATE_FIAT_ORDER),
    writeBigInt(fiatPrice),
    writeUint64(expiresAt),
    arbBytes,
    writeUint16(currencyBytes.length),
    currencyBytes,
  ]

  if (minBuyerReputation !== undefined) {
    parts.push(writeUint64(BigInt(minBuyerReputation)))
  }

  const data = concatBytes(...parts)
  return signAndSendEscrowTransaction(privateKey, publicKey, fromAddress, data, amount)
}

export async function createConditionOrder(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  amount: bigint,
  conditionHash: string,
  conditionDescription: string,
  expirationDays: number,
  proposedArbitrator?: string,
  minBuyerReputation?: number,
): Promise<{ txHash: string; from: string }> {
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + expirationDays * 86400)
  const descBytes = new TextEncoder().encode(conditionDescription)
  const arbBytes = proposedArbitrator
    ? writeAddress(proposedArbitrator)
    : new Uint8Array(20)

  const parts: Uint8Array[] = [
    writeUint8(TX_TYPE.CREATE_CONDITION_ORDER),
    writeEntityId(conditionHash),
    writeUint64(expiresAt),
    arbBytes,
    writeUint16(descBytes.length),
    descBytes,
  ]

  if (minBuyerReputation !== undefined) {
    parts.push(writeUint64(BigInt(minBuyerReputation)))
  }

  const data = concatBytes(...parts)
  return signAndSendEscrowTransaction(privateKey, publicKey, fromAddress, data, amount)
}

export async function createBuyFiatOrder(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  desiredAmount: bigint,
  fiatPrice: bigint,
  fiatCurrency: string,
  expirationDays: number,
  proposedArbitrator?: string,
  minSellerReputation?: number,
): Promise<{ txHash: string; from: string }> {
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + expirationDays * 86400)
  const currencyBytes = new TextEncoder().encode(fiatCurrency)
  const arbBytes = proposedArbitrator
    ? writeAddress(proposedArbitrator)
    : new Uint8Array(20)

  const parts: Uint8Array[] = [
    writeUint8(TX_TYPE.CREATE_BUY_FIAT_ORDER),
    writeBigInt(desiredAmount),
    writeBigInt(fiatPrice),
    writeUint64(expiresAt),
    arbBytes,
    writeUint16(currencyBytes.length),
    currencyBytes,
  ]

  if (minSellerReputation !== undefined && minSellerReputation > 0) {
    parts.push(writeUint64(BigInt(minSellerReputation)))
  }

  const data = concatBytes(...parts)
  return signAndSendEscrowTransaction(privateKey, publicKey, fromAddress, data)
}

export async function createBuyConditionOrder(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  desiredAmount: bigint,
  conditionHash: string,
  conditionDescription: string,
  expirationDays: number,
  proposedArbitrator?: string,
  minSellerReputation?: number,
): Promise<{ txHash: string; from: string }> {
  const expiresAt = BigInt(Math.floor(Date.now() / 1000) + expirationDays * 86400)
  const descBytes = new TextEncoder().encode(conditionDescription)
  const arbBytes = proposedArbitrator
    ? writeAddress(proposedArbitrator)
    : new Uint8Array(20)

  const parts: Uint8Array[] = [
    writeUint8(TX_TYPE.CREATE_BUY_CONDITION_ORDER),
    writeBigInt(desiredAmount),
    writeEntityId(conditionHash),
    writeUint64(expiresAt),
    arbBytes,
    writeUint16(descBytes.length),
    descBytes,
  ]

  if (minSellerReputation !== undefined && minSellerReputation > 0) {
    parts.push(writeUint64(BigInt(minSellerReputation)))
  }

  const data = concatBytes(...parts)
  return signAndSendEscrowTransaction(privateKey, publicKey, fromAddress, data)
}

export async function acceptEscrowOrder(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  orderId: string,
  acceptProposedArbitrator: boolean,
  depositValue: bigint = 0n,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.ACCEPT_ORDER),
    writeEntityId(orderId),
    writeUint8(acceptProposedArbitrator ? 1 : 0),
  )
  return signAndSendEscrowTransaction(privateKey, publicKey, fromAddress, data, depositValue)
}

export async function confirmPayment(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  orderId: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.CONFIRM_PAYMENT),
    writeEntityId(orderId),
  )
  return signAndSendEscrowTransaction(privateKey, publicKey, fromAddress, data)
}

export async function buyerConfirm(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  orderId: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.BUYER_CONFIRM),
    writeEntityId(orderId),
  )
  return signAndSendEscrowTransaction(privateKey, publicKey, fromAddress, data)
}

export async function cancelEscrowOrder(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  orderId: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.CANCEL_ORDER),
    writeEntityId(orderId),
  )
  return signAndSendEscrowTransaction(privateKey, publicKey, fromAddress, data)
}

export async function raiseDispute(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  orderId: string,
  reason: string,
): Promise<{ txHash: string; from: string }> {
  const reasonBytes = new TextEncoder().encode(reason)
  const data = concatBytes(
    writeUint8(TX_TYPE.RAISE_DISPUTE),
    writeEntityId(orderId),
    writeUint16(reasonBytes.length),
    reasonBytes,
  )
  return signAndSendEscrowTransaction(privateKey, publicKey, fromAddress, data)
}

export async function resolveDispute(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  disputeId: string,
  resolution: EscrowResolution,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.RESOLVE_DISPUTE),
    writeEntityId(disputeId),
    writeUint8(resolution),
  )
  return signAndSendEscrowTransaction(privateKey, publicKey, fromAddress, data)
}

// Helpers

export function formatOrderStatus(status: string | number): string {
  const key = String(status)
  const statusMap: Record<string, string> = {
    Open: translate('Open', { ns: 'markets' }),
    Accepted: translate('Accepted', { ns: 'markets' }),
    SellerConfirmed: translate('Seller Confirmed', { ns: 'markets' }),
    Completed: translate('Completed', { ns: 'markets' }),
    Cancelled: translate('Cancelled', { ns: 'markets' }),
    Disputed: translate('Disputed', { ns: 'markets' }),
    Expired: translate('Expired', { ns: 'markets' }),
  }
  return statusMap[key] || key
}

export function getStatusColor(status: string | number): string {
  const key = String(status)
  const colorMap: Record<string, string> = {
    Open: 'text-blue-500',
    Accepted: 'text-yellow-500',
    SellerConfirmed: 'text-orange-500',
    Completed: 'text-green-500',
    Cancelled: 'text-gray-500',
    Disputed: 'text-red-500',
    Expired: 'text-gray-400',
  }
  return colorMap[key] || 'text-gray-500'
}

export function calculateOrderFee(amount: bigint): bigint {
  return amount / 1000n
}

export function formatTimeRemaining(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = timestamp - now
  if (diff <= 0) return translate('Expired', { ns: 'markets' })
  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  const minutes = Math.floor((diff % 3600) / 60)
  if (days > 0) {
    return `${translate('duration.days', { count: days })} ${translate('duration.hours', { count: hours })}`
  }
  if (hours > 0) {
    return `${translate('duration.hours', { count: hours })} ${translate('duration.minutes', { count: minutes })}`
  }
  return translate('duration.minutes', { count: minutes })
}

export function weiToEther(wei: string): string {
  return formatBigIntAmount(wei, 18, 4)
}

export function etherToWei(ether: string): bigint {
  return parseDecimalToBigInt(ether, 18) ?? 0n
}

export function validateEscrowOrderParams(
  amount: bigint,
  expirationDays: number,
): { valid: boolean; error?: string } {
  if (amount <= 0n) {
    return { valid: false, error: translate('Amount must be greater than zero', { ns: 'markets' }) }
  }
  if (expirationDays < MIN_ORDER_EXPIRATION_DAYS)
    return {
      valid: false,
      error: translate('Expiration must be at least {{count}} day', {
        ns: 'markets',
        count: MIN_ORDER_EXPIRATION_DAYS,
      }),
    }
  if (expirationDays > MAX_ORDER_EXPIRATION_DAYS)
    return {
      valid: false,
      error: translate('Expiration must not exceed {{count}} days', {
        ns: 'markets',
        count: MAX_ORDER_EXPIRATION_DAYS,
      }),
    }
  return { valid: true }
}
