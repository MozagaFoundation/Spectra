/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const storeState = vi.hoisted(() => ({
  isDarkMode: false,
  spectreEnabled: false,
  themePreviewActive: false,
}))

vi.mock('@/store/uiStore', () => ({
  useUIStore: (selector: (state: { isDarkMode: boolean }) => unknown) =>
    selector({ isDarkMode: storeState.isDarkMode }),
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: { enabled: boolean; themePreviewActive: boolean }) => unknown) =>
    selector({
      enabled: storeState.spectreEnabled,
      themePreviewActive: storeState.themePreviewActive,
    }),
}))

import {
  darkColors,
  lightColors,
  spectreColors,
  useIsSpectreThemeActive,
  useResolvedThemeVariant,
  useThemeColors,
} from './theme'

describe('theme', () => {
  beforeEach(() => {
    storeState.isDarkMode = false
    storeState.spectreEnabled = false
    storeState.themePreviewActive = false
  })

  it('resolves light and dark themes from the UI store', () => {
    expect(useResolvedThemeVariant()).toBe('light')
    expect(useThemeColors()).toBe(lightColors)

    storeState.isDarkMode = true
    expect(useResolvedThemeVariant()).toBe('dark')
    expect(useThemeColors()).toBe(darkColors)
  })

  it('lets enabled or preview Spectre state override light and dark modes', () => {
    storeState.themePreviewActive = true
    expect(useIsSpectreThemeActive()).toBe(true)
    expect(useResolvedThemeVariant()).toBe('spectre')
    expect(useThemeColors()).toBe(spectreColors)

    storeState.themePreviewActive = false
    storeState.spectreEnabled = true
    storeState.isDarkMode = true
    expect(useResolvedThemeVariant()).toBe('spectre')
    expect(useThemeColors()).toBe(spectreColors)
  })

  it('pins critical theme token invariants used by app shell surfaces', () => {
    expect(lightColors.background).toBe('transparent')
    expect(darkColors.background).toBe('transparent')
    expect(spectreColors.background).toBe('#000000')
    expect(lightColors.statusBarStyle).toBe('dark')
    expect(darkColors.statusBarStyle).toBe('light')
    expect(spectreColors.statusBarStyle).toBe('light')
  })
})
