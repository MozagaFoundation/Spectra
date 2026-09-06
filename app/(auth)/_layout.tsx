/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { Redirect, Stack, useSegments, type Href } from 'expo-router'
import React from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useThemeColors } from '@/lib/theme'
import { useAuthStore } from '@/store/authStore'
import { useWalletStore } from '@/store/walletStore'
import { useUIStore } from '@/store/uiStore'
import { peekPendingContactShareAddress } from '@/lib/pendingContactShare'
import { getAuthRouteDecision } from './authRouting'

export default function AuthLayout() {
  const colors = useThemeColors()
  const segments = useSegments() as string[]
  const authInitialized = useAuthStore((state) => state.isInitialized)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const walletLoading = useWalletStore((state) => state.isLoading)
  const hasWallet = useWalletStore((state) => state.hasWallet)
  const isVaultUnlocked = useWalletStore((state) => state.isVaultUnlocked)
  const languageChosen = useUIStore((state) => state.languageChosen)
  const activeRoute = segments[segments.length - 1]
  const routeDecision = getAuthRouteDecision({
    authInitialized,
    walletLoading,
    hasWallet,
    isAuthenticated,
    isVaultUnlocked,
    languageChosen,
    activeRoute,
    pendingContactShare: peekPendingContactShareAddress(),
  })

  if (routeDecision.kind === 'loading') {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (routeDecision.kind === 'redirect') {
    return <Redirect href={routeDecision.href as Href} />
  }
  
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerBackVisible: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="select-language" />
      <Stack.Screen name="welcome" />
      <Stack.Screen name="create-wallet" />
      <Stack.Screen name="backup-mnemonic" />
      <Stack.Screen name="verify-mnemonic" />
      <Stack.Screen name="set-public-name" />
      <Stack.Screen name="import-wallet" />
      <Stack.Screen name="set-pin" />
      <Stack.Screen
        name="unlock"
        options={{
          animation: 'fade',
          gestureEnabled: false,
          headerBackVisible: false,
          headerShown: false,
        }}
      />
    </Stack>
  )
}
