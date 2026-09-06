/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { translate } from '@/lib/i18n'
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

const PREDICTION_STATE_ADDR = '0xB777777777777777777777777777777777777777'

export const PRICE_PRECISION = 10000

export enum MarketType { Binary = 0, Multiple = 1, Scalar = 2 }

export enum PredictionMarketStatus {
  Pending = 0, Active = 1, Halted = 2, Closed = 3,
  Resolving = 4, Disputed = 5, Resolved = 6, Cancelled = 7, Invalid = 8,
}

export enum PredictionOrderType { Buy = 0, Sell = 1 }

export enum PredictionOrderStatus {
  Open = 0, Partial = 1, Filled = 2, Cancelled = 3, Expired = 4,
}

export const MARKET_CATEGORIES = ['politics', 'crypto', 'sports', 'finance', 'science', 'entertainment', 'other']

export interface PredictionMarketInfo {
  marketId: string; creator: string; arbitrator: string; question: string;
  description: string; category: string; tags: string[]; marketType: MarketType;
  status: PredictionMarketStatus; outcomeCount: number; outcomeLabels: string[];
  outcomePrices: string[]; createdAt: number; closingTime: number;
  totalVolume: string; pendingPool: string; resolvedOutcome?: number;
  scalarLow?: string; scalarHigh?: string;
}

export interface PredictionOrderInfo {
  orderId: string; marketId: string; trader: string; outcomeIndex: number;
  orderType: PredictionOrderType; status: PredictionOrderStatus; price: number;
  amount: string; filledAmount: string; remainingAmount: string;
  createdAt: number; expiresAt: number;
}

export interface PositionInfo {
  marketId: string; trader: string; outcomeIndex: number;
  shares: string; costBasis: string; currentValue: string; pnl: string;
}

export interface OrderBookEntry { price: number; amount: string }

export interface OrderBookSnapshot {
  marketId: string; outcomeIndex: number;
  bids: OrderBookEntry[]; asks: OrderBookEntry[];
  bestBid: number; bestAsk: number; spread: number;
  lastPrice: number; midPrice: number;
}

export interface PredictionPlatformStats {
  totalMarkets: number; activeMarkets: number;
  totalVolume: string; totalTrades: number;
}

export interface PredictionUserStats {
  address: string; totalTrades: number; totalVolume: string; winCount: number;
}

export interface Resolution {
  marketId: string; proposer: string; proposedOutcome: number;
  proposedAt: number; evidenceHash: string;
}

export interface Dispute {
  marketId: string; disputer: string; proposedOutcome: number;
  disputedAt: number; bond: string; evidenceHash: string; status: number;
}

export interface PredictionFeeInfo {
  marketId: string; protocolFeeBps: number; creatorFeeBps: number;
  totalFeeBps: number;
}

const TX_TYPE = {
  CREATE_MARKET: 0x90,
  PLACE_ORDER: 0x95,
  CANCEL_ORDER: 0x96,
  PROPOSE_RESOLUTION: 0x97,
  DISPUTE_RESOLUTION: 0x98,
  FINALIZE_RESOLUTION: 0x9A,
  REDEEM_WINNINGS: 0x9B,
  EXECUTE_MATCH: 0x9C,
  EXECUTE_CROSS_OUTCOME_MATCH: 0x9D,
} as const

function writeString(s: string): Uint8Array {
  const encoded = new TextEncoder().encode(s)
  const buf = new Uint8Array(2 + encoded.length)
  new DataView(buf.buffer).setUint16(0, encoded.length, false)
  buf.set(encoded, 2)
  return buf
}

async function signAndSendPredictionTransaction(
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
    toAddress: PREDICTION_STATE_ADDR,
    txData,
    value,
  })
}

// RPC reads

export async function getPredictionMarket(marketId: string): Promise<PredictionMarketInfo | null> {
  try {
    return await rpcCall<PredictionMarketInfo>('prediction_getMarket', [marketId])
  } catch (error: any) {
    if (!error?.message?.includes('not found')) {
      console.error('Error fetching prediction market:', error)
    }
    return null
  }
}

export async function listPredictionMarkets(
  status?: PredictionMarketStatus,
  category?: string,
  offset: number = 0,
  limit: number = 50,
): Promise<PredictionMarketInfo[]> {
  try {
    const params: any[] = [status ?? null, category ?? null, offset, limit]
    return (await rpcCall<PredictionMarketInfo[]>('prediction_listMarkets', params)) || []
  } catch (error) {
    console.error('Error listing prediction markets:', error)
    return []
  }
}

export async function getPredictionOrderBook(
  marketId: string,
  outcomeIndex: number,
): Promise<OrderBookSnapshot | null> {
  try {
    return await rpcCall<OrderBookSnapshot>('prediction_getOrderBook', [marketId, outcomeIndex])
  } catch (error) {
    console.error('Error fetching order book:', error)
    return null
  }
}

export async function getDetailedOrderBook(
  marketId: string,
  outcomeIndex: number,
): Promise<OrderBookSnapshot | null> {
  try {
    return await rpcCall<OrderBookSnapshot>('prediction_getDetailedOrderBook', [marketId, outcomeIndex])
  } catch (error) {
    console.error('Error fetching detailed order book:', error)
    return null
  }
}

export async function getPredictionOrder(orderId: string): Promise<PredictionOrderInfo | null> {
  try {
    return await rpcCall<PredictionOrderInfo>('prediction_getOrder', [orderId])
  } catch (error: any) {
    if (!error?.message?.includes('not found')) {
      console.error('Error fetching prediction order:', error)
    }
    return null
  }
}

export async function getPosition(
  marketId: string,
  trader: string,
  outcomeIndex: number,
): Promise<PositionInfo | null> {
  try {
    return await rpcCall<PositionInfo>('prediction_getPosition', [marketId, trader, outcomeIndex])
  } catch (error) {
    console.error('Error fetching position:', error)
    return null
  }
}

export async function getAllPositions(
  marketId: string,
  trader: string,
): Promise<PositionInfo[]> {
  try {
    return (await rpcCall<PositionInfo[]>('prediction_getAllPositions', [marketId, trader])) || []
  } catch (error) {
    console.error('Error fetching all positions:', error)
    return []
  }
}

export async function getResolution(marketId: string): Promise<Resolution | null> {
  try {
    return await rpcCall<Resolution>('prediction_getResolution', [marketId])
  } catch (error) {
    console.error('Error fetching resolution:', error)
    return null
  }
}

export async function getDispute(marketId: string): Promise<Dispute | null> {
  try {
    return await rpcCall<Dispute>('prediction_getDispute', [marketId])
  } catch (error) {
    console.error('Error fetching dispute:', error)
    return null
  }
}

export async function getPredictionPlatformStats(): Promise<PredictionPlatformStats | null> {
  try {
    return await rpcCall<PredictionPlatformStats>('prediction_getPlatformStats', [])
  } catch (error) {
    console.error('Error fetching platform stats:', error)
    return null
  }
}

export async function getPredictionUserStats(address: string): Promise<PredictionUserStats | null> {
  try {
    return await rpcCall<PredictionUserStats>('prediction_getUserStats', [address])
  } catch (error) {
    console.error('Error fetching user stats:', error)
    return null
  }
}

export async function getPredictionPrices(marketId: string): Promise<string[] | null> {
  try {
    return await rpcCall<string[]>('prediction_getPrices', [marketId])
  } catch (error) {
    console.error('Error fetching prediction prices:', error)
    return null
  }
}

export async function getPredictionFeeInfo(marketId: string): Promise<PredictionFeeInfo | null> {
  try {
    return await rpcCall<PredictionFeeInfo>('prediction_getFeeInfo', [marketId])
  } catch (error) {
    console.error('Error fetching fee info:', error)
    return null
  }
}

// Transactions

export async function createPredictionMarket(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  question: string,
  description: string,
  category: string,
  marketType: MarketType,
  outcomeCount: number,
  outcomeLabels: string[],
  closingTime: bigint,
  arbitrator: string,
  protocolFeeBps: number,
  creatorFeeBps: number,
  tags: string[],
): Promise<{ txHash: string; from: string }> {
  const labelParts = outcomeLabels.map(l => writeString(l))
  const tagParts = tags.map(t => writeString(t))

  const data = concatBytes(
    writeUint8(TX_TYPE.CREATE_MARKET),
    writeString(question),
    writeString(description),
    writeString(category),
    writeUint8(marketType),
    writeUint8(outcomeCount),
    ...labelParts,
    writeUint64(closingTime),
    writeAddress(arbitrator),
    writeUint16(protocolFeeBps),
    writeUint16(creatorFeeBps),
    writeUint8(tags.length),
    ...tagParts,
  )

  return await signAndSendPredictionTransaction(privateKey, publicKey, fromAddress, data)
}

export async function placeOrder(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  marketId: string,
  outcomeIndex: number,
  orderType: PredictionOrderType,
  price: number,
  amount: bigint,
  expiresAt: bigint,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.PLACE_ORDER),
    writeEntityId(marketId),
    writeUint8(outcomeIndex),
    writeUint8(orderType),
    writeUint16(price),
    writeBigInt(amount),
    writeUint64(expiresAt),
  )

  const value = orderType === PredictionOrderType.Buy ? amount : 0n

  return await signAndSendPredictionTransaction(privateKey, publicKey, fromAddress, data, value)
}

export async function cancelPredictionOrder(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  orderId: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.CANCEL_ORDER),
    writeEntityId(orderId),
  )

  return await signAndSendPredictionTransaction(privateKey, publicKey, fromAddress, data)
}

export async function proposeResolution(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  marketId: string,
  outcomeIndex: number,
  evidenceHash: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.PROPOSE_RESOLUTION),
    writeEntityId(marketId),
    writeUint8(outcomeIndex),
    writeEntityId(evidenceHash),
  )

  return await signAndSendPredictionTransaction(privateKey, publicKey, fromAddress, data)
}

export async function disputeResolution(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  marketId: string,
  outcomeIndex: number,
  evidenceHash: string,
  bond: bigint,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.DISPUTE_RESOLUTION),
    writeEntityId(marketId),
    writeUint8(outcomeIndex),
    writeEntityId(evidenceHash),
  )

  return await signAndSendPredictionTransaction(privateKey, publicKey, fromAddress, data, bond)
}

export async function finalizeResolution(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  marketId: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.FINALIZE_RESOLUTION),
    writeEntityId(marketId),
  )

  return await signAndSendPredictionTransaction(privateKey, publicKey, fromAddress, data)
}

export async function redeemWinnings(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  marketId: string,
  outcomeIndex: number,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.REDEEM_WINNINGS),
    writeEntityId(marketId),
    writeUint8(outcomeIndex),
  )

  return await signAndSendPredictionTransaction(privateKey, publicKey, fromAddress, data)
}

export async function executePredictionMatch(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  buyOrderId: string,
  sellOrderId: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.EXECUTE_MATCH),
    writeEntityId(buyOrderId),
    writeEntityId(sellOrderId),
  )

  return await signAndSendPredictionTransaction(privateKey, publicKey, fromAddress, data)
}

export async function executeCrossOutcomeMatch(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  buyOrderId1: string,
  buyOrderId2: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.EXECUTE_CROSS_OUTCOME_MATCH),
    writeEntityId(buyOrderId1),
    writeEntityId(buyOrderId2),
  )

  return await signAndSendPredictionTransaction(privateKey, publicKey, fromAddress, data)
}

// Helpers

export function getMarketStatusName(status: PredictionMarketStatus): string {
  switch (status) {
    case PredictionMarketStatus.Pending: return translate('Pending', { ns: 'markets' })
    case PredictionMarketStatus.Active: return translate('Active', { ns: 'markets' })
    case PredictionMarketStatus.Halted: return translate('Halted', { ns: 'markets' })
    case PredictionMarketStatus.Closed: return translate('Closed', { ns: 'markets' })
    case PredictionMarketStatus.Resolving: return translate('Resolving', { ns: 'markets' })
    case PredictionMarketStatus.Disputed: return translate('Disputed', { ns: 'markets' })
    case PredictionMarketStatus.Resolved: return translate('Resolved', { ns: 'markets' })
    case PredictionMarketStatus.Cancelled: return translate('Cancelled', { ns: 'markets' })
    case PredictionMarketStatus.Invalid: return translate('Invalid', { ns: 'markets' })
    default: return translate('Unknown')
  }
}

export function getMarketTypeName(type: MarketType): string {
  switch (type) {
    case MarketType.Binary: return translate('Binary', { ns: 'markets' })
    case MarketType.Multiple: return translate('Multiple', { ns: 'markets' })
    case MarketType.Scalar: return translate('Scalar', { ns: 'markets' })
    default: return translate('Unknown')
  }
}

export function priceToPercent(price: number): number {
  return (price / PRICE_PRECISION) * 100
}

export function percentToPrice(percent: number): number {
  return (percent / 100) * PRICE_PRECISION
}
