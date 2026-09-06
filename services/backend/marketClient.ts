/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { backendRequest } from './request'

export interface MarketAssetPriceRow {
  symbol: string
  usdRate: string
  source: string
  fetchedAt: string
  expiresAt: string
}

export interface MarketFiatRateRow {
  code: string
  usdRate: string
  source: string
  fetchedAt: string
  expiresAt: string
}

export interface MarketPricesResponse {
  assetPrices: MarketAssetPriceRow[]
  fiatRates: MarketFiatRateRow[]
  baseFiat: string
}

export async function getMarketPrices(): Promise<{ data: MarketPricesResponse | null; error: Error | null }> {
  try {
    const data = await backendRequest<MarketPricesResponse>('/v1/market/prices', { method: 'GET' })
    return { data, error: null }
  } catch (error) {
    return { data: null, error: error as Error }
  }
}
