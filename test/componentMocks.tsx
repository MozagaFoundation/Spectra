/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Pressable, Text, View } from 'react-native'

export const componentTestColors = {
  background: '#000000',
  backgroundSecondary: '#050505',
  backgroundTertiary: '#101010',
  border: '#222222',
  error: '#ff4d4f',
  overlay: 'rgba(0,0,0,0.6)',
  primary: '#00ff99',
  primaryLight: '#66ffc2',
  success: '#20c997',
  surface: '#111111',
  surfaceHover: '#1a1a1a',
  text: '#ffffff',
  textMuted: '#999999',
  textOnPrimary: '#000000',
  textSecondary: '#cccccc',
  textTertiary: '#777777',
  warning: '#ffaa00',
}

export function translateForComponentTest(key: string, values?: Record<string, unknown>): string {
  if (!values) return key

  return Object.entries(values).reduce((result, [name, value]) => {
    if (name === 'ns') return result
    return result.replaceAll(`{{${name}}}`, String(value))
  }, key)
}

export function createThemeComponentMock() {
  return {
    useIsSpectreThemeActive: () => false,
    useResolvedThemeVariant: () => 'dark',
    useThemeColors: () => componentTestColors,
  }
}

export function createI18nComponentMock() {
  return {
    getCurrentLocaleTag: () => 'en-US',
    translate: translateForComponentTest,
  }
}

export function createDirectionComponentMock(isRtl = false) {
  return {
    getDirectionalTextStyle: () => (isRtl ? { writingDirection: 'rtl' } : {}),
    getLogicalRowDirection: () => (isRtl ? 'row-reverse' : 'row'),
    getStartBorderStyle: (color: string, width: number) => ({
      borderLeftColor: color,
      borderLeftWidth: width,
    }),
    getStartPaddingStyle: (padding: number) => ({ paddingLeft: padding }),
    useIsCurrentLanguageRtl: () => isRtl,
  }
}

export function createLucideIconMock(iconNames: string[]): Record<string, React.ComponentType<Record<string, unknown>>> {
  return Object.fromEntries(iconNames.map((name) => [name, () => null]))
}

export function TestAvatar({ name }: { name?: string }) {
  return (
    <View testID="avatar">
      <Text>{name || 'Avatar'}</Text>
    </View>
  )
}

export function TestButton({
  children,
  disabled,
  onPress,
}: {
  children: React.ReactNode
  disabled?: boolean
  onPress?: () => void | Promise<void>
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} testID={`button-${String(children)}`}>
      <Text>{children}</Text>
      <Text>{disabled ? 'disabled' : 'enabled'}</Text>
    </Pressable>
  )
}
