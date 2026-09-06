/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useQuery } from '@tanstack/react-query'
import { getMarketPrices, type MarketPricesResponse } from '@/services/backend/marketClient'

const MARKET_PRICE_STALE_MS = 12 * 60 * 60 * 1000

export function useMarketPrices() {
  return useQuery<MarketPricesResponse | null>({
    queryKey: ['marketPrices'],
    staleTime: MARKET_PRICE_STALE_MS,
    gcTime: MARKET_PRICE_STALE_MS * 2,
    queryFn: async () => {
      const { data, error } = await getMarketPrices()
      if (error) throw error
      return data
    },
  })
}
