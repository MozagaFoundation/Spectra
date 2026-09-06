/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { formatBigIntAmount } from './amounts'
import { normalizeEntityIdHex } from '@/services/crypto/encoding'
import type { Href } from 'expo-router'

type MarketHref<TPath extends string, TParams extends Record<string, string>> = Href & {
  pathname: TPath
  params: TParams
}

const MARKET_STATUS_BG: Record<string, string> = {
  'text-blue-500': 'bg-blue-500/15',
  'text-yellow-500': 'bg-yellow-500/15',
  'text-orange-500': 'bg-orange-500/15',
  'text-green-500': 'bg-green-500/15',
  'text-gray-500': 'bg-gray-500/15',
  'text-red-500': 'bg-red-500/15',
  'text-gray-400': 'bg-gray-400/15',
}

export function getMarketStatusBackground(textColorClass: string): string {
  return MARKET_STATUS_BG[textColorClass] || 'bg-gray-500/15'
}

export function formatMarketEXO(wei: string | bigint, decimals = 4): string {
  return formatBigIntAmount(wei, 18, decimals)
}

export function truncateMarketAddress(value: string, leading = 6, trailing = 4): string {
  if (!value) return '—'
  if (value.length <= leading + trailing + 2) return value
  return `${value.slice(0, leading)}...${value.slice(-trailing)}`
}

export function sanitizeMarketEntityIdInput(value: string): string {
  return value.trim()
}

export function isValidMarketEntityId(value: string): boolean {
  try {
    const normalized = normalizeEntityIdHex(sanitizeMarketEntityIdInput(value))
    return !/^0+$/.test(normalized)
  } catch {
    return false
  }
}

export function primarySaleRoute(saleId: string) {
  return {
    pathname: '/(main)/markets/primary/[saleId]',
    params: { saleId },
  } as unknown as MarketHref<'/(main)/markets/primary/[saleId]', { saleId: string }>
}

export function predictionMarketRoute(marketId: string) {
  return {
    pathname: '/(main)/markets/prediction/[marketId]',
    params: { marketId },
  } as unknown as MarketHref<'/(main)/markets/prediction/[marketId]', { marketId: string }>
}

export function escrowOrderRoute(orderId: string) {
  return {
    pathname: '/(main)/markets/escrow/[orderId]',
    params: { orderId },
  } as unknown as MarketHref<'/(main)/markets/escrow/[orderId]', { orderId: string }>
}

export function campaignRoute(campaignId: string) {
  return {
    pathname: '/(main)/markets/campaigns/[campaignId]',
    params: { campaignId },
  } as unknown as MarketHref<'/(main)/markets/campaigns/[campaignId]', { campaignId: string }>
}

export function marketStaticRoute(pathname: string): Href {
  return pathname as unknown as Href
}
