/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { MarketPricesResponse } from '@/services/backend/marketClient'
import { getCurrentLocaleTag } from '@/lib/i18n'

const RATE_SCALE = 100_000_000n
const CENT_SCALE = 100n

export interface FiatValueInput {
  symbol: string
  balance: string
  decimals: number
  prices: MarketPricesResponse | null | undefined
  fiatCode?: string
}

function pow10(decimals: number): bigint | null {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 30) return null
  return 10n ** BigInt(decimals)
}

function parseScaledDecimal(value: string, scale: bigint): bigint | null {
  const normalized = value.trim()
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  const [whole, fraction = ''] = normalized.split('.')
  const scaleDigits = scale.toString().length - 1
  const paddedFraction = fraction.slice(0, scaleDigits).padEnd(scaleDigits, '0')
  return BigInt(whole || '0') * scale + BigInt(paddedFraction || '0')
}

function parseBalanceUnits(value: string, decimals: number): bigint | null {
  const scale = pow10(decimals)
  if (!scale) return null
  return parseScaledDecimal(value, scale)
}

function isUsableReference(expiresAt: string, source: string): boolean {
  if (source === 'manual' || expiresAt === 'infinity') return true
  const expires = parseReferenceTime(expiresAt)
  return Number.isFinite(expires) && expires > Date.now()
}

function parseReferenceTime(value: string): number {
  const parsed = Date.parse(value)
  if (Number.isFinite(parsed)) return parsed
  const normalized = value.trim().replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  return Date.parse(normalized)
}

export function formatFiatCents(cents: bigint, fiatCode: string): string | null {
  if (cents < 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) return null
  const value = Number(cents) / 100
  return new Intl.NumberFormat(getCurrentLocaleTag(), {
    style: 'currency',
    currency: fiatCode,
    maximumFractionDigits: value >= 1 ? 2 : 4,
  }).format(value)
}

export function calculateAssetFiatCents({
  symbol,
  balance,
  decimals,
  prices,
  fiatCode = 'USD',
}: FiatValueInput): bigint | null {
  if (!prices) return null
  const normalizedSymbol = symbol.trim().toUpperCase()
  const normalizedFiat = fiatCode.trim().toUpperCase() || 'USD'
  const asset = prices.assetPrices.find((entry) => (
    entry.symbol.trim().toUpperCase() === normalizedSymbol
    && isUsableReference(entry.expiresAt, entry.source)
  ))
  const fiat = prices.fiatRates.find((entry) => (
    entry.code.trim().toUpperCase() === normalizedFiat
    && isUsableReference(entry.expiresAt, entry.source)
  ))
  if (!asset || !fiat) return null

  const balanceUnits = parseBalanceUnits(balance, decimals)
  const assetRate = parseScaledDecimal(asset.usdRate, RATE_SCALE)
  const fiatRate = parseScaledDecimal(fiat.usdRate, RATE_SCALE)
  const unitScale = pow10(decimals)
  if (balanceUnits === null || assetRate === null || fiatRate === null || !unitScale) return null

  const numerator = balanceUnits * assetRate * fiatRate * CENT_SCALE
  const denominator = unitScale * RATE_SCALE * RATE_SCALE
  if (denominator <= 0n) return null
  return numerator / denominator
}

export function formatAssetFiatValue({
  symbol,
  balance,
  decimals,
  prices,
  fiatCode = 'USD',
}: FiatValueInput): string | null {
  const normalizedFiat = fiatCode.trim().toUpperCase() || 'USD'
  const cents = calculateAssetFiatCents({ symbol, balance, decimals, prices, fiatCode: normalizedFiat })
  if (cents === null) return null
  const formatted = formatFiatCents(cents, normalizedFiat)
  return formatted ? `~ ${formatted}` : null
}
