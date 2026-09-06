/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Href } from 'expo-router'
import { ActivityIndicator, View, Text, Pressable } from 'react-native'
import { Image } from 'expo-image'
import { Shield, Key, Lock } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'

import { useUIStore } from '@/store/uiStore'
import { useIsSpectreThemeActive } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'

const FONT = {
  titleSemibold: 'Poppins-SemiBold',
  bodyRegular: 'GolosText-Regular',
  bodyMedium: 'GolosText-Medium',
} as const

const DARK_PALETTE = {
  surface: 'rgba(20,20,20,0.78)',
  surfaceBorder: 'rgba(167,218,87,0.20)',
  iconTile: 'rgba(167,218,87,0.14)',
  iconColor: '#a7da57',
  primary: '#a7da57',
  primaryLabel: '#0c0c0c',
  secondary: '#89ddc3',
  secondaryFill: 'rgba(137,221,195,0.10)',
  secondaryLabel: '#89ddc3',
  textPrimary: '#f5f5f5',
  textSecondary: '#d4d4d4',
  textMuted: '#a3a3a3',
} as const

const LIGHT_PALETTE = {
  surface: 'rgba(255,255,255,0.82)',
  surfaceBorder: 'rgba(95,199,169,0.32)',
  iconTile: 'rgba(95,199,169,0.18)',
  iconColor: '#3fa48a',
  primary: '#5fc7a9',
  primaryLabel: '#0c0c0c',
  secondary: '#3fa48a',
  secondaryFill: 'rgba(95,199,169,0.12)',
  secondaryLabel: '#3fa48a',
  textPrimary: '#0c0c0c',
  textSecondary: '#2a2a2a',
  textMuted: '#5a5a5a',
} as const

const LOGO_DARK = require('@/assets/images/spectra/imagotipo-full-color.png')
const LOGO_LIGHT = require('@/assets/images/spectra/imagotipo-verde-2.png')

export default function WelcomeScreen() {
  const router = useGuardedRouter()
  const { t } = useTranslation('auth')
  const isDarkMode = useUIStore((state) => state.isDarkMode)
  const spectreThemeActive = useIsSpectreThemeActive()
  const [pendingAction, setPendingAction] = useState<'create' | 'import' | null>(null)
  const pendingActionRef = useRef(false)
  const useDarkPalette = isDarkMode || spectreThemeActive

  const palette = useDarkPalette ? DARK_PALETTE : LIGHT_PALETTE
  const logoSource = useDarkPalette ? LOGO_DARK : LOGO_LIGHT

  const features = [
    {
      icon: Shield,
      title: t('Post-quantum', { ns: 'common' }),
      description: t('ML-DSA-65 post-quantum signatures', { ns: 'common' }),
    },
    {
      icon: Key,
      title: t('Self-Sovereign'),
      description: t('You own your keys, you own your identity'),
    },
    {
      icon: Lock,
      title: t('End-to-End Encrypted'),
      description: t('Supported direct messages are end-to-end encrypted.', { ns: 'common' }),
    },
  ]

  const styles = useMemo(() => makeStyles(palette), [palette])
  const isNavigationPending = pendingAction !== null

  useEffect(() => {
    if (!isNavigationPending) return

    const timeout = setTimeout(() => {
      pendingActionRef.current = false
      setPendingAction(null)
    }, 2000)
    return () => clearTimeout(timeout)
  }, [isNavigationPending])

  const navigateToAuthRoute = useCallback((action: 'create' | 'import', href: Href) => {
    if (pendingActionRef.current) return

    pendingActionRef.current = true
    setPendingAction(action)
    router.push(href)
  }, [router])

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, paddingHorizontal: 22, justifyContent: 'space-between' }}>
          <View style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 8 }}>
            <Image
              source={logoSource}
              style={{ width: 240, height: 100, marginBottom: 22 }}
              contentFit="contain"
            />
            <Text style={styles.tagline}>
              {t('Hybrid post-quantum messaging', { ns: 'common' })}
            </Text>
          </View>

          <View style={{ gap: 12 }}>
            {features.map((feature, index) => (
              <View key={index} style={styles.featureCard}>
                <View style={styles.featureIconTile}>
                  <feature.icon size={22} color={palette.iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureDescription}>{feature.description}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={{ gap: 14, paddingBottom: 4 }}>
            <Pressable
              onPress={() => navigateToAuthRoute('create', '/(auth)/create-wallet' as Href)}
              disabled={isNavigationPending}
              android_ripple={{ color: 'rgba(0,0,0,0.12)' }}
              style={[styles.primaryButton, isNavigationPending && styles.disabledButton]}
            >
              <View style={styles.buttonContent}>
                {pendingAction === 'create' ? (
                  <ActivityIndicator size="small" color={palette.primaryLabel} />
                ) : null}
                <Text style={styles.primaryButtonLabel}>{t('Create New Account')}</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={() => navigateToAuthRoute('import', '/(auth)/import-wallet' as Href)}
              disabled={isNavigationPending}
              android_ripple={{ color: 'rgba(95,199,169,0.18)' }}
              style={[styles.secondaryButton, isNavigationPending && styles.disabledButton]}
            >
              <View style={styles.buttonContent}>
                {pendingAction === 'import' ? (
                  <ActivityIndicator size="small" color={palette.secondaryLabel} />
                ) : null}
                <Text style={styles.secondaryButtonLabel}>{t('Import Existing Account')}</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  )
}

type Palette = typeof DARK_PALETTE | typeof LIGHT_PALETTE

function makeStyles(palette: Palette) {
  return {
    tagline: {
      fontFamily: FONT.bodyMedium,
      color: palette.textSecondary,
      fontSize: 16,
      lineHeight: 22,
      textAlign: 'center' as const,
      maxWidth: 300,
    },
    featureCard: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 14,
      padding: 16,
      borderRadius: 18,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.surfaceBorder,
    },
    featureIconTile: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: palette.iconTile,
    },
    featureTitle: {
      fontFamily: FONT.titleSemibold,
      color: palette.textPrimary,
      fontSize: 16,
      lineHeight: 20,
      marginBottom: 2,
    },
    featureDescription: {
      fontFamily: FONT.bodyRegular,
      color: palette.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    primaryButton: {
      backgroundColor: palette.primary,
      paddingVertical: 18,
      borderRadius: 18,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    buttonContent: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 8,
    },
    disabledButton: {
      opacity: 0.55,
    },
    primaryButtonLabel: {
      fontFamily: FONT.titleSemibold,
      color: palette.primaryLabel,
      fontSize: 17,
      letterSpacing: 0.2,
    },
    secondaryButton: {
      backgroundColor: palette.secondaryFill,
      paddingVertical: 17,
      borderRadius: 18,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 1.5,
      borderColor: palette.secondary,
    },
    secondaryButtonLabel: {
      fontFamily: FONT.titleSemibold,
      color: palette.secondaryLabel,
      fontSize: 17,
      letterSpacing: 0.2,
    },
  }
}
