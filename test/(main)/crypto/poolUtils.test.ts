/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

import type { AMMPoolInfo, SwapInfo } from '@/services/crypto/ammPool'
import { buildPriceHistory, truncatePoolId } from '../../../app/(main)/crypto/poolUtils'

const EXO = 10n ** 18n

function pool(overrides: Partial<AMMPoolInfo> = {}): AMMPoolInfo {
  return {
    asset0: 'EXO',
    asset1: 'TOKEN',
    reserve0: (100n * EXO).toString(),
    reserve1: (50n * EXO).toString(),
    ...overrides,
  } as AMMPoolInfo
}

describe('pool screen helpers', () => {
  it('uses the current reserve ratio when there is no swap history', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    const history = buildPriceHistory(pool(), [])

    expect(history.points).toEqual([{ time: Date.now() / 1000, price: 2 }])
    expect(history.priceChange).toBe(0)

    vi.useRealTimers()
  })

  it('reconstructs price history from swaps for chart and impact review', () => {
    const swaps = [
      {
        amountIn: (10n * EXO).toString(),
        amountOut: (4n * EXO).toString(),
        assetIn: 'EXO',
        timestamp: 1,
      },
      {
        amountIn: (2n * EXO).toString(),
        amountOut: (5n * EXO).toString(),
        assetIn: 'TOKEN',
        timestamp: 2,
      },
    ] as SwapInfo[]

    const history = buildPriceHistory(pool(), swaps)

    expect(history.points).toHaveLength(3)
    expect(history.points[0].time).toBe(2)
    expect(history.points[2].price).toBe(2)
    expect(Number.isFinite(history.priceChange)).toBe(true)
  })

  it('truncates verbose pool ids while preserving short labels', () => {
    expect(truncatePoolId('')).toBe('?')
    expect(truncatePoolId('EXO1234')).toBe('1234')
    expect(truncatePoolId('0x1234567890abcdef')).toBe('1234...cdef')
  })
})
