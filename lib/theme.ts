/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useSpectreStore } from '@/store/spectreStore'
import { useUIStore } from '@/store/uiStore'

const lightColors = {
  primary: '#5fc7a9',
  primaryDark: '#3fa48a',
  primaryLight: '#89ddc3',
  gold: '#a7da57',

  // Let the light wallpaper show through.
  background: 'transparent',
  backgroundSecondary: '#f5f5f5',
  backgroundTertiary: '#ececec',

  surface: '#ffffff',
  surfaceHover: '#f5f5f5',
  surfaceActive: '#ececec',

  border: '#dcdcdc',
  borderLight: '#ececec',

  text: '#0c0c0c',
  textSecondary: '#3a3a3a',
  textTertiary: '#5a5a5a',
  textMuted: '#7a7a7a',

  success: '#7ab84a',
  successLight: '#a7da57',
  warning: '#d9b94a',
  warningLight: '#e9d27a',
  error: '#ef4444',
  errorLight: '#f87171',
  info: '#5fbfa3',
  infoLight: '#89ddc3',

  messageSent: '#5fc7a9',
  messageReceived: '#f5f5f5',

  card: '#ffffff',
  overlay: 'rgba(12,12,12,0.3)',
  qrBackground: '#ffffff',
  qrForeground: '#0c0c0c',
  statusBarStyle: 'dark' as const,
  tabBarBadge: '#a7da57',
  textOnPrimary: '#0c0c0c',
}

const darkColors = {
  primary: '#a7da57',
  primaryDark: '#8bbe40',
  primaryLight: '#c2e87f',
  gold: '#89ddc3',

  // Let the dark wallpaper show through.
  background: 'transparent',
  backgroundSecondary: '#141414',
  backgroundTertiary: '#1d1d1d',

  surface: '#151515',
  surfaceHover: '#1d1d1d',
  surfaceActive: '#262626',

  border: '#2a2a2a',
  borderLight: '#3a3a3a',

  text: '#f5f5f5',
  textSecondary: '#d4d4d4',
  textTertiary: '#a3a3a3',
  textMuted: '#737373',

  success: '#a7da57',
  successLight: '#c2e87f',
  warning: '#e9d27a',
  warningLight: '#f3e3a4',
  error: '#ef4444',
  errorLight: '#f87171',
  info: '#89ddc3',
  infoLight: '#a8e7d2',

  messageSent: '#a7da57',
  messageReceived: '#1d1d1d',

  card: '#151515',
  overlay: 'rgba(12,12,12,0.7)',
  qrBackground: '#ffffff',
  qrForeground: '#0c0c0c',
  statusBarStyle: 'light' as const,
  tabBarBadge: '#a7da57',
  textOnPrimary: '#0c0c0c',
}

const spectreColors = {
  primary: '#8a8a8a',
  primaryDark: '#6f6f6f',
  primaryLight: '#b0b0b0',
  gold: '#9b9b9b',

  background: '#000000',
  backgroundSecondary: '#090909',
  backgroundTertiary: '#111111',

  surface: '#151515',
  surfaceHover: '#1d1d1d',
  surfaceActive: '#262626',

  border: '#303030',
  borderLight: '#454545',

  text: '#f5f5f5',
  textSecondary: '#d4d4d4',
  textTertiary: '#a3a3a3',
  textMuted: '#737373',

  success: '#b8b8b8',
  successLight: '#d6d6d6',
  warning: '#9f9f9f',
  warningLight: '#bdbdbd',
  error: '#8a8a8a',
  errorLight: '#b0b0b0',
  info: '#a3a3a3',
  infoLight: '#c2c2c2',

  messageSent: '#5c5c5c',
  messageReceived: '#171717',

  card: '#151515',
  overlay: 'rgba(0, 0, 0, 0.72)',
  qrBackground: '#ffffff',
  qrForeground: '#000000',
  statusBarStyle: 'light' as const,
  tabBarBadge: '#8a8a8a',
  textOnPrimary: '#ffffff',
}

export type ThemeColors = {
  [K in keyof typeof lightColors]: K extends 'statusBarStyle' ? 'light' | 'dark' : string
}

export type ThemeVariant = 'light' | 'dark' | 'spectre'

const themeColorsByVariant: Record<ThemeVariant, ThemeColors> = {
  light: lightColors,
  dark: darkColors,
  spectre: spectreColors,
}

function resolveThemeVariant(isDarkMode: boolean, spectreThemeActive: boolean): ThemeVariant {
  if (spectreThemeActive) {
    return 'spectre'
  }

  return isDarkMode ? 'dark' : 'light'
}

export function useIsSpectreThemeActive(): boolean {
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const themePreviewActive = useSpectreStore((state) => state.themePreviewActive)

  return spectreEnabled || themePreviewActive
}

export function useResolvedThemeVariant(): ThemeVariant {
  const isDarkMode = useUIStore((state) => state.isDarkMode)
  const spectreThemeActive = useIsSpectreThemeActive()

  return resolveThemeVariant(isDarkMode, spectreThemeActive)
}

export function useThemeColors(): ThemeColors {
  const themeVariant = useResolvedThemeVariant()
  return themeColorsByVariant[themeVariant]
}

export { lightColors, darkColors, spectreColors }
