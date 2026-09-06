/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'
import { calculateAssetFiatCents, formatAssetFiatValue, formatFiatCents } from './fiatValuation'
import type { MarketPricesResponse } from '@/services/backend/marketClient'

vi.mock('@/lib/i18n', () => ({
  getCurrentLocaleTag: () => 'en-US',
}))

const future = new Date(Date.now() + 60_000).toISOString()
const past = new Date(Date.now() - 60_000).toISOString()

function prices(overrides: Partial<MarketPricesResponse> = {}): MarketPricesResponse {
  return {
    assetPrices: [{ symbol: 'ETH', usdRate: '3000', source: 'coingecko', fetchedAt: future, expiresAt: future }],
    fiatRates: [
      { code: 'USD', usdRate: '1', source: 'manual', fetchedAt: future, expiresAt: 'infinity' },
      { code: 'EUR', usdRate: '0.9', source: 'forex', fetchedAt: future, expiresAt: future },
    ],
    baseFiat: 'USD',
    ...overrides,
  }
}

describe('formatAssetFiatValue', () => {
  it('formats local asset balances without sending holdings to the backend', () => {
    expect(formatAssetFiatValue({
      symbol: 'ETH',
      balance: '2',
      decimals: 18,
      prices: prices(),
    })).toBe('~ $6,000.00')
  })

  it('converts through cached fiat rates', () => {
    expect(formatAssetFiatValue({
      symbol: 'ETH',
      balance: '1',
      decimals: 18,
      fiatCode: 'EUR',
      prices: prices(),
    })).toBe('~ €2,700.00')
  })

  it('returns integer cents for local portfolio totals', () => {
    const first = calculateAssetFiatCents({
      symbol: 'ETH',
      balance: '1.5',
      decimals: 18,
      fiatCode: 'EUR',
      prices: prices(),
    })
    const second = calculateAssetFiatCents({
      symbol: 'ETH',
      balance: '0.5',
      decimals: 18,
      fiatCode: 'EUR',
      prices: prices(),
    })

    expect(first).toBe(405000n)
    expect(second).toBe(135000n)
    expect(formatFiatCents(first! + second!, 'EUR')).toBe('€5,400.00')
  })

  it('omits stale market references', () => {
    expect(formatAssetFiatValue({
      symbol: 'ETH',
      balance: '1',
      decimals: 18,
      prices: prices({
        assetPrices: [{ symbol: 'ETH', usdRate: '3000', source: 'coingecko', fetchedAt: past, expiresAt: past }],
      }),
    })).toBeNull()
  })

  it('accepts Postgres timestamp text returned by older market endpoints', () => {
    expect(formatAssetFiatValue({
      symbol: 'ETH',
      balance: '1',
      decimals: 18,
      prices: prices({
        assetPrices: [{ symbol: 'ETH', usdRate: '3000', source: 'coingecko', fetchedAt: future, expiresAt: '2999-05-26 11:38:28.030288+00' }],
      }),
    })).toBe('~ $3,000.00')
  })
})
