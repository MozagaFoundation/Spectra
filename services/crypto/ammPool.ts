/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

// AMM pool RPC helpers with local EXO signing.

import { formatBigIntAmount, parseDecimalToBigInt } from '@/lib/amounts'
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

/** Native EXO asset ID. */
export const NATIVE_ASSET_ID = '0'

const TX_TYPE = {
  SWAP_AMM: 0xB1,
} as const

export const AMM_SWAP_FEE_BP = 15

export { isNativeAssetId } from './encoding'

// Types

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

// Pool discovery

/** Get all active market pools. */
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

/** Get paginated pools for a market. */
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

// Pool queries

/** Get an AMM pool by hash ID. */
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

/** Get a swap quote. */
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

/** Get pool swap history. */
export async function getSwapHistory(poolId: string, limit: number = 50): Promise<SwapInfo[]> {
  try {
    return (await rpcCall<SwapInfo[]>('market_getSwapHistory', [poolId, limit])) || []
  } catch (error) {
    console.error('Error fetching swap history:', error)
    return []
  }
}

/** Get market stats. */
export async function getMarketStats(): Promise<MarketStats | null> {
  try {
    return await rpcCall<MarketStats>('market_getMarketStats', [])
  } catch (error) {
    console.error('Error fetching market stats:', error)
    return null
  }
}

// Entity ID helpers

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

// Swap transaction

/** Execute an AMM swap. Payload: tx type, pool ID, asset in, amount in, minimum out. */
export async function swapAMM(
  privateKey: string,
  publicKey: string,
  fromAddress: string,
  poolId: string,
  assetIn: string,
  amountIn: bigint,
  minAmountOut: bigint,
): Promise<{ txHash: string; from: string }> {
  try {
    const data = concatBytes(
      writeUint8(TX_TYPE.SWAP_AMM),
      writeEntityId(poolId),
      writeEntityId(assetIn),
      writeBigInt(amountIn),
      writeBigInt(minAmountOut),
    )

    const value = isNativeAssetId(assetIn) ? amountIn : 0n

    return await signAndSendMarketTransaction(privateKey, publicKey, fromAddress, data, value)
  } catch (error) {
    console.error('Error executing swap:', error)
    throw error
  }
}

// Utilities

export function formatWeiToEXO(wei: string, decimals: number = 4): string {
  return formatBigIntAmount(wei, 18, decimals)
}

export function parseEXOToWei(exo: string): bigint {
  return parseDecimalToBigInt(exo, 18) ?? 0n
}
