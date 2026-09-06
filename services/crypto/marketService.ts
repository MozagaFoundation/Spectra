/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { formatBigIntAmount, parseDecimalToBigInt } from '@/lib/amounts'
import { translate } from '@/lib/i18n'
import {
  concatBytes,
  isNativeAssetId,
  writeBigInt,
  writeEntityId,
  writeUint8,
} from './encoding'
import { rpcCall, signAndSendTransaction } from './shared'

// Constants

const MARKET_STATE_ADDR = '0x0000000000000000000000000000000000000006'

export const NATIVE_ASSET_ID = '0'
export const AMM_SWAP_FEE_BP = 15

export { isNativeAssetId } from './encoding'

const TX_TYPE = {
  PARTICIPATE_IN_SALE: 0xCB,
  CLAIM_SALE_TOKENS: 0xBA,
  CLAIM_SALE_REFUND: 0xBB,
  CLAIM_SALE_PROCEEDS: 0xBC,
  CREATE_LIMIT_ORDER: 0xCD,
  CANCEL_ORDER: 0xCE,
  EXECUTE_MATCH: 0xB2,
  CREATE_AMM_POOL: 0xCF,
  ADD_LIQUIDITY: 0xD0,
  REMOVE_LIQUIDITY: 0xB0,
  SWAP_AMM: 0xB1,
  CLAIM_LP_FEES: 0xBD,
} as const

// Enums

export enum DistributionMode {
  Refund = 0,
  Proportional = 1,
  FCFS = 2,
  Hybrid = 3,
}

export enum SaleStatus {
  Active = 0,
  Succeeded = 1,
  Failed = 2,
}

export enum OrderType {
  Buy = 0,
  Sell = 1,
}

export enum OrderStatus {
  Open = 0,
  PartiallyFilled = 1,
  Filled = 2,
  Cancelled = 3,
  Expired = 4,
}

// Types

export interface MarketInfo {
  marketId: string
  owner: string
  name: string
  description: string
  createdAt: number
  active: boolean
  freeEnrollment: boolean
  isSubmarket: boolean
  parentMarketId?: string
  enrolledAssets: number
  submarketCount: number
  accumulatedFees: string
  availableFees: string
}

export interface PrimarySaleInfo {
  saleId: string
  creator: string
  marketId: string
  assetId: string
  tokenAmount: string
  pricePerToken: string
  minFunding: string
  maxFunding: string
  startTime: number
  endTime: number
  distributionMode: number
  maxPerParticipant: string
  raisedAmount: string
  participantCount: number
  status: number
  createdAt: number
}

export interface ParticipationInfo {
  participant: string
  contribution: string
  allocation: string
  claimed: boolean
  effectiveStatus: number
}

export interface EffectiveSaleStatus {
  saleId: string
  effectiveStatus: number
  endTime: number
  minFunding: string
  raisedAmount: string
  minReached: boolean
  isEnded: boolean
}

export interface OrderInfo {
  orderId: string
  marketId: string
  assetId: string
  owner: string
  orderType: number
  price: string
  amount: string
  filledAmount: string
  createdAt: number
  status: number
}

export interface OrderBookInfo {
  marketId: string
  assetId: string
  buyOrders: OrderInfo[]
  sellOrders: OrderInfo[]
}

export interface AMMPoolInfo {
  poolId: string
  marketId: string
  asset0: string
  asset1: string
  reserve0: string
  reserve1: string
  totalLPTokens: string
  creator: string
  createdAt: number
  status: string
  spotPrice?: string
  swapCount?: number
  accumulatedFees0?: string
  accumulatedFees1?: string
}

export interface MarketStats {
  totalMarkets: number
  activeMarkets: number
  totalSales: number
  totalOrders: number
  totalPools: number
  protocolFees: string
}

export interface MarketPoolsPage {
  pools: AMMPoolInfo[]
  totalCount: number
  offset: number
  limit: number
  hasMore: boolean
}

export interface ActiveMarketsPage {
  markets: MarketInfo[]
  totalCount: number
  offset: number
  limit: number
  hasMore: boolean
}

export interface SwapQuoteInfo {
  amountOut: string
  fee: string
  priceImpact: number
  feeBreakdown?: {
    total: string
    marketOwnerFee: string
    protocolFee: string
    lpFee: string
  }
}

export interface SwapInfo {
  swapId: string
  poolId: string
  trader: string
  assetIn: string
  assetOut: string
  amountIn: string
  amountOut: string
  fee: string
  timestamp: number
}

export interface LPPositionInfo {
  poolId: string
  provider: string
  lpTokens: string
  sharePercent: number
  asset0Amount: string
  asset1Amount: string
}

async function signAndSendMarketTransaction(
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
    toAddress: MARKET_STATE_ADDR,
    txData,
    value,
  })
}

// RPC reads

export async function getMarket(marketId: string): Promise<MarketInfo | null> {
  try {
    return await rpcCall<MarketInfo>('market_getMarket', [marketId])
  } catch (error: any) {
    if (!error?.message?.includes('not found')) {
      console.error('Error fetching market:', error)
    }
    return null
  }
}

export async function getMarketStats(): Promise<MarketStats | null> {
  try {
    return await rpcCall<MarketStats>('market_getMarketStats', [])
  } catch (error) {
    console.error('Error fetching market stats:', error)
    return null
  }
}

export async function getActiveMarkets(
  offset: number = 0,
  limit: number = 100,
): Promise<ActiveMarketsPage> {
  try {
    const result = await rpcCall<ActiveMarketsPage>('market_getActiveMarkets', [offset, limit])
    return result || { markets: [], totalCount: 0, offset, limit, hasMore: false }
  } catch (error) {
    console.error('Error fetching active markets:', error)
    return { markets: [], totalCount: 0, offset, limit, hasMore: false }
  }
}

export async function getPrimarySale(saleId: string): Promise<PrimarySaleInfo | null> {
  try {
    return await rpcCall<PrimarySaleInfo>('market_getPrimarySale', [saleId])
  } catch (error: any) {
    if (!error?.message?.includes('not found')) {
      console.error('Error fetching primary sale:', error)
    }
    return null
  }
}

export async function getParticipation(
  saleId: string,
  participant: string,
): Promise<ParticipationInfo | null> {
  try {
    const currentTimestamp = Math.floor(Date.now() / 1000)
    return await rpcCall<ParticipationInfo>('market_getParticipation', [saleId, participant, currentTimestamp])
  } catch (error: any) {
    if (!error?.message?.includes('not found')) {
      console.error('Error fetching participation:', error)
    }
    return null
  }
}

export async function getEffectiveSaleStatus(saleId: string): Promise<EffectiveSaleStatus | null> {
  try {
    const currentTimestamp = Math.floor(Date.now() / 1000)
    return await rpcCall<EffectiveSaleStatus>('market_getEffectiveSaleStatus', [saleId, currentTimestamp])
  } catch (error) {
    console.error('Error fetching effective sale status:', error)
    return null
  }
}

export async function getOrderBook(
  marketId: string,
  assetId: string,
  limit: number = 50,
): Promise<OrderBookInfo | null> {
  try {
    return await rpcCall<OrderBookInfo>('market_getOrderBook', [marketId, assetId, limit])
  } catch (error) {
    console.error('Error fetching order book:', error)
    return null
  }
}

export async function getUserOrders(
  address: string,
  activeOnly: boolean = true,
  offset: number = 0,
  limit: number = 50,
): Promise<OrderInfo[]> {
  try {
    return (await rpcCall<OrderInfo[]>('market_getUserOrders', [address, activeOnly, offset, limit])) || []
  } catch (error) {
    console.error('Error fetching user orders:', error)
    return []
  }
}

export async function getAMMPool(poolId: string): Promise<AMMPoolInfo | null> {
  try {
    return await rpcCall<AMMPoolInfo>('market_getAMMPool', [poolId])
  } catch (error: any) {
    if (!error?.message?.includes('pool not found')) {
      console.error('Error fetching AMM pool:', error)
    }
    return null
  }
}

export async function getMarketPools(
  marketId: string,
  offset: number = 0,
  limit: number = 100,
): Promise<MarketPoolsPage> {
  try {
    const result = await rpcCall<MarketPoolsPage>('market_getMarketPools', [marketId, offset, limit])
    return result || { pools: [], totalCount: 0, offset, limit, hasMore: false }
  } catch (error) {
    console.error('Error fetching market pools:', error)
    return { pools: [], totalCount: 0, offset, limit, hasMore: false }
  }
}

export async function getAllPools(): Promise<AMMPoolInfo[]> {
  try {
    const activeResult = await rpcCall<{ markets: any[] }>('market_getActiveMarkets', [0, 100])
    if (!activeResult?.markets || activeResult.markets.length === 0) {
      return []
    }

    const poolResults = await Promise.all(
      activeResult.markets.map((m: any) =>
        getMarketPools(String(m.marketId), 0, 100)
      )
    )

    const allPools: AMMPoolInfo[] = []
    for (const result of poolResults) {
      if (result.pools && result.pools.length > 0) {
        allPools.push(...result.pools)
      }
    }
    return allPools
  } catch (error) {
    console.error('Error fetching all pools:', error)
    return []
  }
}

export async function getSwapQuote(
  poolId: string,
  assetIn: string,
  amountIn: string,
): Promise<SwapQuoteInfo | null> {
  try {
    return await rpcCall<SwapQuoteInfo>('market_getSwapQuote', [poolId, assetIn, amountIn])
  } catch (error) {
    console.error('Error fetching swap quote:', error)
    return null
  }
}

export async function getSwapHistory(poolId: string, limit: number = 50): Promise<SwapInfo[]> {
  try {
    return (await rpcCall<SwapInfo[]>('market_getSwapHistory', [poolId, limit])) || []
  } catch (error) {
    console.error('Error fetching swap history:', error)
    return []
  }
}

export async function getLPPosition(
  poolId: string,
  provider: string,
): Promise<LPPositionInfo | null> {
  try {
    return await rpcCall<LPPositionInfo>('market_getLPPosition', [poolId, provider])
  } catch (error: any) {
    if (!error?.message?.includes('not found')) {
      console.error('Error fetching LP position:', error)
    }
    return null
  }
}

export async function getMarketAssets(
  marketId: string,
  offset: number = 0,
  limit: number = 100,
): Promise<any> {
  try {
    return await rpcCall<any>('market_getEnrolledAssets', [marketId, offset, limit])
  } catch (error) {
    console.error('Error fetching market assets:', error)
    return null
  }
}

// Transactions

export async function participateInSale(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  saleId: string,
  amount: bigint,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.PARTICIPATE_IN_SALE),
    writeEntityId(saleId),
  )
  return signAndSendMarketTransaction(privateKey, publicKey, fromAddress, data, amount)
}

export async function claimSaleTokens(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  saleId: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.CLAIM_SALE_TOKENS),
    writeEntityId(saleId),
  )
  return signAndSendMarketTransaction(privateKey, publicKey, fromAddress, data, 0n)
}

export async function claimSaleRefund(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  saleId: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.CLAIM_SALE_REFUND),
    writeEntityId(saleId),
  )
  return signAndSendMarketTransaction(privateKey, publicKey, fromAddress, data, 0n)
}

export async function claimSaleProceeds(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  saleId: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.CLAIM_SALE_PROCEEDS),
    writeEntityId(saleId),
  )
  return signAndSendMarketTransaction(privateKey, publicKey, fromAddress, data, 0n)
}

export async function createLimitOrder(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  marketId: string,
  assetId: string,
  orderType: number,
  price: bigint,
  amount: bigint,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.CREATE_LIMIT_ORDER),
    writeEntityId(marketId),
    writeEntityId(assetId),
    writeUint8(orderType),
    writeBigInt(price),
    writeBigInt(amount),
  )
  return signAndSendMarketTransaction(privateKey, publicKey, fromAddress, data, 0n)
}

export async function cancelLimitOrder(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  orderId: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.CANCEL_ORDER),
    writeEntityId(orderId),
  )
  return signAndSendMarketTransaction(privateKey, publicKey, fromAddress, data, 0n)
}

export async function executeMatch(
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
  return signAndSendMarketTransaction(privateKey, publicKey, fromAddress, data, 0n)
}

export async function swapAMM(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  poolId: string,
  assetIn: string,
  amountIn: bigint,
  minAmountOut: bigint,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.SWAP_AMM),
    writeEntityId(poolId),
    writeEntityId(assetIn),
    writeBigInt(amountIn),
    writeBigInt(minAmountOut),
  )
  const value = isNativeAssetId(assetIn) ? amountIn : 0n
  return signAndSendMarketTransaction(privateKey, publicKey, fromAddress, data, value)
}

export async function createAMMPool(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  marketId: string,
  asset0: string,
  asset1: string,
  reserve0: bigint,
  reserve1: bigint,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.CREATE_AMM_POOL),
    writeEntityId(marketId),
    writeEntityId(asset0),
    writeEntityId(asset1),
    writeBigInt(reserve0),
    writeBigInt(reserve1),
  )
  let value = 0n
  if (isNativeAssetId(asset0)) value += reserve0
  if (isNativeAssetId(asset1)) value += reserve1
  return signAndSendMarketTransaction(privateKey, publicKey, fromAddress, data, value)
}

export async function addLiquidity(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  poolId: string,
  amount0: bigint,
  amount1: bigint,
  asset0: string,
  asset1: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.ADD_LIQUIDITY),
    writeEntityId(poolId),
    writeBigInt(amount0),
    writeBigInt(amount1),
  )
  let value = 0n
  if (isNativeAssetId(asset0)) value += amount0
  if (isNativeAssetId(asset1)) value += amount1
  return signAndSendMarketTransaction(privateKey, publicKey, fromAddress, data, value)
}

export async function removeLiquidity(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  poolId: string,
  lpTokens: bigint,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.REMOVE_LIQUIDITY),
    writeEntityId(poolId),
    writeBigInt(lpTokens),
  )
  return signAndSendMarketTransaction(privateKey, publicKey, fromAddress, data, 0n)
}

export async function claimLPFees(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  poolId: string,
): Promise<{ txHash: string; from: string }> {
  const data = concatBytes(
    writeUint8(TX_TYPE.CLAIM_LP_FEES),
    writeEntityId(poolId),
  )
  return signAndSendMarketTransaction(privateKey, publicKey, fromAddress, data, 0n)
}

// Client calculations

export function calculateSwapOutput(
  reserveIn: string,
  reserveOut: string,
  amountIn: string,
): string {
  try {
    const resIn = BigInt(reserveIn)
    const resOut = BigInt(reserveOut)
    const amtIn = BigInt(amountIn)
    const amountInWithFee = (amtIn * BigInt(10000 - AMM_SWAP_FEE_BP)) / BigInt(10000)
    const amountOut = (amountInWithFee * resOut) / (resIn + amountInWithFee)
    return amountOut.toString()
  } catch {
    return '0'
  }
}

export function calculatePriceImpact(
  reserveIn: string,
  reserveOut: string,
  amountIn: string,
): number {
  try {
    const resIn = BigInt(reserveIn)
    const resOut = BigInt(reserveOut)
    const amtIn = BigInt(amountIn)
    const currentPrice = Number(resOut) / Number(resIn)
    const newReserveIn = resIn + amtIn
    const amountOut = calculateSwapOutput(reserveIn, reserveOut, amountIn)
    const newReserveOut = resOut - BigInt(amountOut)
    const newPrice = Number(newReserveOut) / Number(newReserveIn)
    return Math.abs((newPrice - currentPrice) / currentPrice) * 100
  } catch {
    return 0
  }
}

// Utilities

export function formatWeiToEXO(wei: string, decimals: number = 4): string {
  return formatBigIntAmount(wei, 18, decimals)
}

export function parseEXOToWei(exo: string): bigint {
  return parseDecimalToBigInt(exo, 18) ?? 0n
}

export function getDistributionModeName(mode: number): string {
  switch (mode) {
    case DistributionMode.Refund: return translate('Refund', { ns: 'markets' })
    case DistributionMode.Proportional: return translate('Proportional', { ns: 'markets' })
    case DistributionMode.FCFS: return translate('First Come First Served', { ns: 'markets' })
    case DistributionMode.Hybrid: return translate('Hybrid', { ns: 'markets' })
    default: return translate('Unknown')
  }
}

export function getSaleStatusName(status: number): string {
  switch (status) {
    case SaleStatus.Active: return translate('Active', { ns: 'markets' })
    case SaleStatus.Succeeded: return translate('Succeeded', { ns: 'markets' })
    case SaleStatus.Failed: return translate('Failed', { ns: 'markets' })
    default: return translate('Unknown')
  }
}

export function getOrderTypeName(type: number): string {
  switch (type) {
    case OrderType.Buy: return translate('Buy', { ns: 'markets' })
    case OrderType.Sell: return translate('Sell', { ns: 'markets' })
    default: return translate('Unknown')
  }
}

export function getOrderStatusName(status: number): string {
  switch (status) {
    case OrderStatus.Open: return translate('Open', { ns: 'markets' })
    case OrderStatus.PartiallyFilled: return translate('Partially Filled', { ns: 'markets' })
    case OrderStatus.Filled: return translate('Filled', { ns: 'markets' })
    case OrderStatus.Cancelled: return translate('Cancelled', { ns: 'markets' })
    case OrderStatus.Expired: return translate('Expired', { ns: 'markets' })
    default: return translate('Unknown')
  }
}
