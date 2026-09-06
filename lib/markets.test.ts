/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('./i18n', () => ({
  getCurrentLocaleTag: () => 'en-US',
}))

import {
  campaignRoute,
  escrowOrderRoute,
  formatMarketEXO,
  getMarketStatusBackground,
  isValidMarketEntityId,
  marketStaticRoute,
  predictionMarketRoute,
  primarySaleRoute,
  sanitizeMarketEntityIdInput,
  truncateMarketAddress,
} from './markets'

describe('market helpers', () => {
  it('validates entity IDs before market transactions use them', () => {
    expect(sanitizeMarketEntityIdInput(' 0xabc ')).toBe('0xabc')
    expect(isValidMarketEntityId('0xabc')).toBe(true)
    expect(isValidMarketEntityId('EXOabc')).toBe(true)
    expect(isValidMarketEntityId('0')).toBe(false)
    expect(isValidMarketEntityId('')).toBe(false)
    expect(isValidMarketEntityId('campaign/../bad')).toBe(false)
    expect(isValidMarketEntityId('0x' + '0'.repeat(65))).toBe(false)
    expect(isValidMarketEntityId('0x' + '0'.repeat(63) + '1')).toBe(true)
  })

  it('builds object routes for dynamic market IDs', () => {
    expect(primarySaleRoute('0xabc')).toEqual({
      pathname: '/(main)/markets/primary/[saleId]',
      params: { saleId: '0xabc' },
    })
    expect(predictionMarketRoute('0xdef').params.marketId).toBe('0xdef')
    expect(escrowOrderRoute('0x123').params.orderId).toBe('0x123')
    expect(campaignRoute('0x456').params.campaignId).toBe('0x456')
    expect(marketStaticRoute('/(main)/markets/primary')).toBe('/(main)/markets/primary')
  })

  it('centralizes repeated markets display helpers', () => {
    expect(formatMarketEXO(1_000_000_000_000_000_000n, 2)).toBe('1.00')
    expect(formatMarketEXO('not-a-number', 2)).toBe('0')
    expect(truncateMarketAddress('EXO001234567890abcdef')).toBe('EXO001...cdef')
    expect(truncateMarketAddress('')).toBe('—')
    expect(truncateMarketAddress('short')).toBe('short')
    expect(getMarketStatusBackground('text-green-500')).toBe('bg-green-500/15')
    expect(getMarketStatusBackground('text-red-500')).toBe('bg-red-500/15')
    expect(getMarketStatusBackground('unknown')).toBe('bg-gray-500/15')
  })
})
