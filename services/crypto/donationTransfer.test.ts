/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import type { MarketPricesResponse } from '@/services/backend/marketClient'
import { parseDecimalToBigInt } from '@/lib/amounts'
import {
  getDonationTransferQuote,
  getDonationTreasuryAddress,
} from './donationTransfer'

const recipients = {
  mozaga: 'EXO00ac5d503f066e4f0f9d19be88a050644c9657c5',
  ethereum: '0x399eC6461bd7749Ee70Ed058C66DF11ca0975C40',
  bitcoin: 'bc1qutw4m2zafmm0qk5kuk8nuja3d7t7fehvzg5m5u',
  solana: '8LuyPqtzPKCPB2ziMGHHwZHjTjVNmUX84mVSzYqYYekG',
  tron: 'TJMCieDbHfu5g3Gb3xhyhgYiAHggt1hyND',
} as const

function prices(symbol: string, usdRate: string): MarketPricesResponse {
  return {
    baseFiat: 'USD',
    assetPrices: [{
      symbol,
      usdRate,
      source: 'test',
      fetchedAt: new Date(0).toISOString(),
      expiresAt: new Date(60_000).toISOString(),
    }],
    fiatRates: [],
  }
}

describe('donationTransfer', () => {
  it('calculates 0.1% in base units without floating point math', () => {
    const quote = getDonationTransferQuote({
      networkId: 'ethereum',
      symbol: 'ETH',
      decimals: 18,
      amountUnits: parseDecimalToBigInt('1.25', 18),
      prices: prices('ETH', '2000'),
      recipients,
    })

    expect(quote).toMatchObject({
      treasuryAddress: recipients.ethereum,
      amount: '0.00125',
      cappedByUsd: false,
    })
    expect(quote?.amountUnits).toBe(parseDecimalToBigInt('0.00125', 18))
  })

  it('caps donations at ten dollars equivalent', () => {
    const quote = getDonationTransferQuote({
      networkId: 'bitcoin',
      symbol: 'BTC',
      decimals: 8,
      amountUnits: parseDecimalToBigInt('10', 8),
      prices: prices('BTC', '50000'),
      recipients,
    })

    expect(quote).toMatchObject({
      treasuryAddress: recipients.bitcoin,
      amount: '0.0002',
      cappedByUsd: true,
    })
    expect(quote?.amountUnits).toBe(20_000n)
  })

  it('returns null when price data is unavailable', () => {
    expect(getDonationTransferQuote({
      networkId: 'mozaga',
      symbol: 'EXO',
      decimals: 18,
      amountUnits: parseDecimalToBigInt('100', 18),
      prices: null,
      recipients,
    })).toBeNull()
  })

  it('validates configured treasury addresses', () => {
    expect(getDonationTreasuryAddress('mozaga', recipients)).toBe(recipients.mozaga)
    expect(getDonationTreasuryAddress('tron', recipients)).toBe(recipients.tron)
  })
})
