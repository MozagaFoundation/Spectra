/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useIsSpectreThemeActive, useThemeColors } from '@/lib/theme'

type CryptoAccentName =
  | 'mozaga'
  | 'mozagaDark'
  | 'ethereum'
  | 'bitcoin'
  | 'solana'
  | 'tron'
  | 'staking'
  | 'markets'
  | 'positive'
  | 'negative'
  | 'reward'
  | 'protocol'
  | 'claim'
  | 'active'

const BRAND_ACCENTS: Record<CryptoAccentName, string> = {
  mozaga: '#015df0',
  mozagaDark: '#061033',
  ethereum: '#627EEA',
  bitcoin: '#F7931A',
  solana: '#14F195',
  tron: '#FF060A',
  staking: '#89ddc3',
  markets: '#0c0c0c',
  positive: '#a7da57',
  negative: '#f43f5e',
  reward: '#89ddc3',
  protocol: '#3b82f6',
  claim: '#e9d27a',
  active: '#015df0',
}

export const CRYPTO_BRAND_ACCENTS = BRAND_ACCENTS

function normalizeHex(color: string): string | null {
  if (!color.startsWith('#')) return null

  const hex = color.slice(1)
  if (!/^[0-9a-fA-F]+$/.test(hex)) return null

  if (hex.length === 3 || hex.length === 4) {
    return hex
      .slice(0, 3)
      .split('')
      .map((char) => char + char)
      .join('')
  }

  if (hex.length === 6 || hex.length === 8) {
    return hex.slice(0, 6)
  }

  return null
}

export function alpha(color: string, opacity: number): string {
  const hex = normalizeHex(color)
  if (!hex) return color

  const clampedOpacity = Math.max(0, Math.min(1, opacity))
  const red = parseInt(hex.slice(0, 2), 16)
  const green = parseInt(hex.slice(2, 4), 16)
  const blue = parseInt(hex.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${clampedOpacity})`
}

export function useCryptoTheme() {
  const colors = useThemeColors()
  const spectreThemeActive = useIsSpectreThemeActive()

  const accent = (name: CryptoAccentName): string => {
    if (!spectreThemeActive) {
      return BRAND_ACCENTS[name]
    }

    switch (name) {
      case 'mozaga':
      case 'ethereum':
      case 'bitcoin':
      case 'solana':
      case 'tron':
        return colors.primary
      case 'mozagaDark':
      case 'markets':
        return colors.primaryDark
      case 'staking':
      case 'claim':
        return colors.warning
      case 'positive':
      case 'active':
        return colors.success
      case 'negative':
        return colors.error
      case 'reward':
        return colors.info
      case 'protocol':
        return colors.textSecondary
    }
  }

  const resolveExternalAccent = (
    preferredColor: string | null | undefined,
    fallbackAccent: CryptoAccentName = 'mozaga'
  ): string => {
    if (spectreThemeActive || !preferredColor) {
      return accent(fallbackAccent)
    }

    return preferredColor
  }

  const assetClassAccent = (assetClass: number): string => {
    switch (assetClass) {
      case 0:
        return accent('mozaga')
      case 1:
        return accent('active')
      case 2:
        return accent('staking')
      case 3:
        return accent('mozagaDark')
      default:
        return colors.textTertiary
    }
  }

  const priceImpactAccent = (priceImpact: number): string => {
    if (priceImpact > 3) {
      return accent('negative')
    }

    if (priceImpact > 1) {
      return accent('claim')
    }

    return accent('positive')
  }

  return {
    colors,
    spectreThemeActive,
    accent,
    alpha,
    assetClassAccent,
    priceImpactAccent,
    resolveExternalAccent,
  }
}
