/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { Redirect, type Href } from 'expo-router'
import React from 'react'
import { View, Text, ActivityIndicator } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { useWalletStore } from '@/store/walletStore'
import { useUIStore } from '@/store/uiStore'
import { useThemeColors } from '@/lib/theme'

export default function Index() {
  const colors = useThemeColors()
  const { t } = useTranslation()
  const { isAuthenticated, isInitialized: authInitialized } = useAuthStore()
  const {
    hasWallet,
    isLoading: walletLoading,
    initializationError: walletInitializationError,
    isVaultUnlocked,
  } = useWalletStore()
  const languageChosen = useUIStore((s) => s.languageChosen)
  
  if (!authInitialized || walletLoading || walletInitializationError) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-text-secondary mt-4">{t('Loading...')}</Text>
      </View>
    )
  }
  
  if (!hasWallet) {
    if (!languageChosen) {
      return <Redirect href={'/(auth)/select-language' as Href} />
    }
    return <Redirect href={'/(auth)/welcome' as Href} />
  }
  
  if (hasWallet && (!isAuthenticated || !isVaultUnlocked)) {
    return <Redirect href={'/(auth)/unlock' as Href} />
  }
  
  return <Redirect href={'/(main)/(tabs)/chats' as Href} />
}
