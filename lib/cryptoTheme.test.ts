/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const themeState = vi.hoisted(() => ({
  spectreThemeActive: false,
  colors: {
    primary: '#111111',
    primaryDark: '#222222',
    warning: '#333333',
    success: '#444444',
    error: '#555555',
    info: '#666666',
    textSecondary: '#777777',
    textTertiary: '#888888',
  },
}))

vi.mock('@/lib/theme', () => ({
  useIsSpectreThemeActive: () => themeState.spectreThemeActive,
  useThemeColors: () => themeState.colors,
}))

import { CRYPTO_BRAND_ACCENTS, alpha, useCryptoTheme } from './cryptoTheme'

describe('cryptoTheme', () => {
  beforeEach(() => {
    themeState.spectreThemeActive = false
  })

  it('converts supported hex colors to clamped rgba values', () => {
    expect(alpha('#abc', 0.5)).toBe('rgba(170, 187, 204, 0.5)')
    expect(alpha('#abcd', 2)).toBe('rgba(170, 187, 204, 1)')
    expect(alpha('#AABBCCDD', -1)).toBe('rgba(170, 187, 204, 0)')
    expect(alpha('rgb(1, 2, 3)', 0.5)).toBe('rgb(1, 2, 3)')
    expect(alpha('#zzzzzz', 0.5)).toBe('#zzzzzz')
  })

  it('uses brand accents when Spectre theme is inactive', () => {
    const cryptoTheme = useCryptoTheme()

    expect(cryptoTheme.spectreThemeActive).toBe(false)
    expect(cryptoTheme.accent('bitcoin')).toBe(CRYPTO_BRAND_ACCENTS.bitcoin)
    expect(cryptoTheme.assetClassAccent(2)).toBe(CRYPTO_BRAND_ACCENTS.staking)
    expect(cryptoTheme.priceImpactAccent(4)).toBe(CRYPTO_BRAND_ACCENTS.negative)
    expect(cryptoTheme.resolveExternalAccent('#123456', 'ethereum')).toBe('#123456')
  })

  it('maps accents to neutral theme tokens when Spectre theme is active', () => {
    themeState.spectreThemeActive = true
    const cryptoTheme = useCryptoTheme()

    expect(cryptoTheme.spectreThemeActive).toBe(true)
    expect(cryptoTheme.accent('ethereum')).toBe(themeState.colors.primary)
    expect(cryptoTheme.accent('markets')).toBe(themeState.colors.primaryDark)
    expect(cryptoTheme.accent('claim')).toBe(themeState.colors.warning)
    expect(cryptoTheme.accent('positive')).toBe(themeState.colors.success)
    expect(cryptoTheme.accent('reward')).toBe(themeState.colors.info)
    expect(cryptoTheme.resolveExternalAccent('#123456', 'ethereum')).toBe(themeState.colors.primary)
    expect(cryptoTheme.assetClassAccent(99)).toBe(themeState.colors.textTertiary)
  })
})
