/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { AMMPoolInfo, SwapInfo } from '@/services/crypto/ammPool'

export interface PricePoint { time: number; price: number }

export function buildPriceHistory(pool: AMMPoolInfo, swaps: SwapInfo[]): { points: PricePoint[]; priceChange: number } {
  const reserve0 = Number(BigInt(pool.reserve0)) / 1e18
  const reserve1 = Number(BigInt(pool.reserve1)) / 1e18
  const currentPrice = reserve1 > 0 ? reserve0 / reserve1 : 0
  if (swaps.length === 0) return { points: [{ time: Date.now() / 1000, price: currentPrice }], priceChange: 0 }

  const asset0Id = pool.asset0
  let sim0 = reserve0
  let sim1 = reserve1
  const pts: PricePoint[] = [{ time: Date.now() / 1000, price: currentPrice }]

  for (const swap of swaps) {
    const amtIn = Number(BigInt(swap.amountIn)) / 1e18
    const amtOut = Number(BigInt(swap.amountOut)) / 1e18
    if (amtIn <= 0 || amtOut <= 0) continue

    if (swap.assetIn === asset0Id) {
      sim0 -= amtIn; sim1 += amtOut
    } else {
      sim0 += amtOut; sim1 -= amtIn
    }
    if (sim0 > 0 && sim1 > 0) {
      const p = sim0 / sim1
      if (p > 0 && isFinite(p)) pts.push({ time: swap.timestamp, price: p })
    }
  }

  pts.reverse()
  const first = pts[0]?.price || currentPrice
  const last = pts[pts.length - 1]?.price || currentPrice
  const change = first > 0 ? ((last - first) / first) * 100 : 0
  return { points: pts, priceChange: change }
}

export function truncatePoolId(poolId: string): string {
  if (!poolId) return '?'
  const clean = poolId.replace(/^(0x|EXO|EXI)/i, '')
  if (clean.length <= 8) return clean
  return clean.slice(0, 4) + '...' + clean.slice(-4)
}
