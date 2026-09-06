/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { formatBigIntAmount, parseDecimalToBigInt } from '@/lib/amounts'
import type { CryptoNetworkId } from './chainRegistry'

export type TokenStandard = 'erc20' | 'trc20' | 'spl' | 'mozaga-asset'

export interface SupportedToken {
  network: CryptoNetworkId
  standard: TokenStandard
  symbol: string
  name: string
  decimals: number
  logoColor: string
  contractAddress?: string
  mintAddress?: string
  assetSymbol?: string
}

export interface NetworkTokenBalance extends SupportedToken {
  identifier: string
  balance: string
  balanceRaw: string
  tokenId?: string
}

export const TRON_TOKENS: SupportedToken[] = [
  {
    network: 'tron',
    standard: 'trc20',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoColor: '#26A17B',
    contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  },
]

export const SOLANA_TOKENS: SupportedToken[] = [
  {
    network: 'solana',
    standard: 'spl',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    logoColor: '#26A17B',
    mintAddress: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  },
]

export const MOZAGA_KNOWN_ASSET_SYMBOLS = ['USDT']

export function formatNetworkTokenAmount(raw: bigint | string, decimals: number): string {
  return formatBigIntAmount(raw, decimals, Math.min(decimals, 6), true)
}

export function parseNetworkTokenAmount(amount: string, decimals: number): bigint {
  const parsed = parseDecimalToBigInt(amount, decimals)
  if (!parsed || parsed <= 0n) {
    throw new Error('Invalid token amount')
  }
  return parsed
}
