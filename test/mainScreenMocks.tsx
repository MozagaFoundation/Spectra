/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Text, TextInput, View } from 'react-native'

import {
  TestAvatar,
  TestButton,
  TestCard,
  TestIcon,
  testColors,
  translateForTest,
} from './mainAppMocks'

export {
  TestAvatar,
  TestButton,
  TestCard,
  TestIcon,
  testColors,
  translateForTest,
}

export function createSafeAreaMock() {
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  }
}

export function createCryptoThemeMock() {
  return {
    useCryptoTheme: () => ({
      colors: {
        ...testColors,
        overlay: 'rgba(0,0,0,0.6)',
        qrBackground: '#ffffff',
        qrForeground: '#000000',
      },
      accent: () => testColors.primary,
      alpha: (color: string) => `${color}33`,
      priceImpactAccent: (impact: number) => impact > 3 ? testColors.warning : testColors.success,
      resolveExternalAccent: (color: string) => color || testColors.primary,
    }),
  }
}

export function createThemeMock() {
  return {
    useIsSpectreThemeActive: () => false,
    useResolvedThemeVariant: () => 'dark',
    useThemeColors: () => ({
      ...testColors,
      backgroundSecondary: testColors.backgroundSecondary,
      borderLight: testColors.border,
      messageReceived: testColors.surface,
      messageSent: testColors.primary,
      overlay: 'rgba(0,0,0,0.6)',
      qrBackground: '#ffffff',
      qrForeground: '#000000',
      gold: testColors.primary,
      backgroundTertiary: testColors.surface,
      textOnPrimary: testColors.textOnPrimary,
    }),
  }
}

export function createI18nMock() {
  return {
    getCurrentLocaleTag: () => 'en-US',
    translate: translateForTest,
  }
}

export function MockInput({
  label,
  onChangeText,
  placeholder,
  value,
}: {
  label?: string
  onChangeText?: (value: string) => void
  placeholder?: string
  value?: string
}) {
  return (
    <View>
      {label ? <Text>{label}</Text> : null}
      <TextInput
        onChangeText={onChangeText}
        placeholder={placeholder}
        testID={label ? `input-${label}` : 'input'}
        value={value}
      />
    </View>
  )
}
