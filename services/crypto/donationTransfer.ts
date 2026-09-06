/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { MarketPricesResponse } from '@/services/backend/marketClient'
import { formatBigIntAmount } from '@/lib/amounts'
import type { CryptoNetworkId } from './chainRegistry'
import { isValidAddressForNetwork } from './nativeChainService'

export type DonationNetworkId = CryptoNetworkId

export interface DonationTransferQuote {
  networkId: DonationNetworkId
  treasuryAddress: string
  amountUnits: bigint
  amount: string
  symbol: string
  decimals: number
  cappedByUsd: boolean
}

interface DonationTransferQuoteParams {
  networkId: DonationNetworkId
  symbol: string
  decimals: number
  amountUnits: bigint | null
  prices: MarketPricesResponse | null | undefined
  recipients: Partial<Record<DonationNetworkId, string>> | null | undefined
}

export const DONATION_RATE_DENOMINATOR = 1000n
const DONATION_USD_CAP = 10n
const USD_RATE_SCALE = 1_000_000_000_000n

export function getDonationTreasuryAddress(
  networkId: DonationNetworkId,
  recipients: Partial<Record<DonationNetworkId, string>> | null | undefined,
): string | null {
  const address = recipients?.[networkId]?.trim()
  if (!address) return null
  return isValidAddressForNetwork(networkId, address) ? address : null
}

export function getDonationTransferQuote(params: DonationTransferQuoteParams): DonationTransferQuote | null {
  if (!params.amountUnits || params.amountUnits <= 0n) return null

  const treasuryAddress = getDonationTreasuryAddress(params.networkId, params.recipients)
  if (!treasuryAddress) return null

  const rate = getAssetUsdRate(params.prices, params.symbol)
  if (!rate || rate <= 0n) return null

  const rateDonationUnits = params.amountUnits / DONATION_RATE_DENOMINATOR
  if (rateDonationUnits <= 0n) return null

  const capUnits = (DONATION_USD_CAP * USD_RATE_SCALE * 10n ** BigInt(params.decimals)) / rate
  if (capUnits <= 0n) return null

  const amountUnits = rateDonationUnits <= capUnits ? rateDonationUnits : capUnits
  return {
    networkId: params.networkId,
    treasuryAddress,
    amountUnits,
    amount: formatBigIntAmount(amountUnits, params.decimals, params.decimals, true),
    symbol: params.symbol,
    decimals: params.decimals,
    cappedByUsd: amountUnits === capUnits && capUnits < rateDonationUnits,
  }
}

function getAssetUsdRate(prices: MarketPricesResponse | null | undefined, symbol: string): bigint | null {
  const normalizedSymbol = symbol.trim().toUpperCase()
  const rate = prices?.assetPrices.find((price) => price.symbol.trim().toUpperCase() === normalizedSymbol)
  return rate ? parseScaledDecimal(rate.usdRate, USD_RATE_SCALE) : null
}

function parseScaledDecimal(value: string, scale: bigint): bigint | null {
  const trimmed = value.trim()
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(trimmed)) return null

  const [wholePart, fractionPart = ''] = trimmed.split('.')
  const scaleDigits = scale.toString().length - 1
  const fraction = fractionPart.slice(0, scaleDigits).padEnd(scaleDigits, '0')
  try {
    return BigInt(wholePart) * scale + BigInt(fraction || '0')
  } catch {
    return null
  }
}
