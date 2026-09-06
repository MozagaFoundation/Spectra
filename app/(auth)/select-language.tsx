/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useCallback, useRef, useState } from 'react'
import { View, Text, Pressable, Dimensions } from 'react-native'
import { Image } from 'expo-image'
import { useRouter, type Href } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChevronDown } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated'
import { setAppLanguage } from '@/lib/i18n'
import {
  getLocalizedLanguageName,
  normalizeAppLanguageCode,
  SUPPORTED_LANGUAGES,
} from '@/lib/i18n/languages'
import { useIsSpectreThemeActive, useThemeColors } from '@/lib/theme'
import { useUIStore } from '@/store/uiStore'
import { DEFAULT_LANGUAGE, type AppLanguage } from '@/lib/i18n/resources'
import { LanguageSelectorModal } from '@/components/ui'

const GREETINGS = [
  { text: 'Welcome to Spectra', lang: 'English' },
  { text: 'Bienvenido a Spectra', lang: 'Español' },
  { text: 'Bienvenue sur Spectra', lang: 'Français' },
  { text: 'Willkommen bei Spectra', lang: 'Deutsch' },
  { text: 'Bem-vindo ao Spectra', lang: 'Português' },
  { text: 'Benvenuto su Spectra', lang: 'Italiano' },
  { text: 'Spectraへようこそ', lang: '日本語' },
  { text: '欢迎使用 Spectra', lang: '中文' },
  { text: 'Spectra에 오신 것을 환영합니다', lang: '한국어' },
  { text: 'مرحبًا بك في Spectra', lang: 'العربية' },
  { text: 'Spectra में आपका स्वागत है', lang: 'हिन्दी' },
  { text: 'Добро пожаловать в Spectra', lang: 'Русский' },
]

const CYCLE_DURATION = 2400
const FADE_DURATION = 600

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const LOGO_DARK = require('@/assets/images/spectra/isotipo-full-color.svg')
const LOGO_LIGHT = require('@/assets/images/spectra/isotipo-verde-1.svg')

export default function SelectLanguageScreen() {
  const router = useRouter()
  const colors = useThemeColors()
  const { t, i18n } = useTranslation(['auth', 'settings'])
  const setAppLanguageChoice = useUIStore((s) => s.setAppLanguageChoice)
  const isDarkMode = useUIStore((s) => s.isDarkMode)
  const spectreThemeActive = useIsSpectreThemeActive()
  const [selectedLang, setSelectedLang] = useState<AppLanguage | null>(null)
  const [modalVisible, setModalVisible] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const greetingOpacity = useSharedValue(1)
  const greetingTranslateY = useSharedValue(0)
  const cycleRunning = useRef(true)

  const selectedOption = SUPPORTED_LANGUAGES.find((l) => l.code === selectedLang)
  const displayLanguage =
    normalizeAppLanguageCode(i18n.resolvedLanguage || i18n.language) ??
    selectedLang ??
    DEFAULT_LANGUAGE

  const advanceGreeting = useCallback(() => {
    if (!cycleRunning.current) return
    setCurrentIndex((prev) => (prev + 1) % GREETINGS.length)
  }, [])

  useEffect(() => {
    cycleRunning.current = true

    const interval = setInterval(() => {
      if (!cycleRunning.current) return

      greetingOpacity.value = withSequence(
        withTiming(0, { duration: FADE_DURATION, easing: Easing.out(Easing.ease) }),
        withDelay(50, withTiming(1, { duration: FADE_DURATION, easing: Easing.in(Easing.ease) })),
      )
      greetingTranslateY.value = withSequence(
        withTiming(-20, { duration: FADE_DURATION, easing: Easing.out(Easing.ease) }),
        withTiming(20, { duration: 0 }),
        withDelay(50, withTiming(0, { duration: FADE_DURATION, easing: Easing.in(Easing.ease) })),
      )

      setTimeout(() => runOnJS(advanceGreeting)(), FADE_DURATION + 30)
    }, CYCLE_DURATION)

    return () => {
      cycleRunning.current = false
      clearInterval(interval)
    }
  }, [advanceGreeting, greetingOpacity, greetingTranslateY])

  const greetingAnimStyle = useAnimatedStyle(() => ({
    opacity: greetingOpacity.value,
    transform: [{ translateY: greetingTranslateY.value }],
  }))

  const handleLanguagePreviewSelect = async (lang: AppLanguage) => {
    setSelectedLang(lang)
    await setAppLanguage(lang)
  }

  const handleContinue = async () => {
    if (!selectedLang) return
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    await setAppLanguageChoice(selectedLang)
    router.replace('/(auth)/welcome' as Href)
  }

  const greeting = GREETINGS[currentIndex]
  const logoSource = isDarkMode || spectreThemeActive ? LOGO_DARK : LOGO_LIGHT

  return (
    <SafeAreaView className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      <View className="flex-1 px-6 justify-between">
        <View className="flex-1 items-center justify-center" style={{ minHeight: 320 }}>
          <Image
            source={logoSource}
            style={{ width: 88, height: 88 }}
            contentFit="contain"
          />

          <View style={{ height: 100, justifyContent: 'center', alignItems: 'center', marginTop: 32 }}>
            <Animated.View style={[{ alignItems: 'center' }, greetingAnimStyle]}>
              <Text
                className="font-bold text-center"
                style={{
                  color: colors.text,
                  fontSize: 28,
                  lineHeight: 34,
                  maxWidth: SCREEN_WIDTH - 64,
                }}
                numberOfLines={2}
              >
                {greeting.text}
              </Text>
            </Animated.View>
          </View>

          <Text
            className="text-center mt-6"
            style={{ color: colors.textSecondary, fontSize: 17 }}
          >
            {t('Select your language', { ns: 'auth' })}
          </Text>
        </View>

        <View className="mb-4">
          <Pressable
            onPress={() => setModalVisible(true)}
            className="flex-row items-center justify-between rounded-2xl p-5 active:opacity-80"
            style={{
              backgroundColor: colors.surface,
              borderWidth: selectedLang ? 2 : 1,
              borderColor: selectedLang ? colors.primary : colors.border,
            }}
          >
            {selectedOption ? (
              <View className="flex-row items-center gap-4">
                <Text style={{ fontSize: 28 }}>{selectedOption.flag}</Text>
                <View>
                  <Text className="font-semibold text-lg" style={{ color: colors.text }}>
                    {selectedOption.nativeName}
                  </Text>
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    {getLocalizedLanguageName(selectedOption.code, displayLanguage)}
                  </Text>
                </View>
              </View>
            ) : (
              <Text className="text-base" style={{ color: colors.textMuted }}>
                {t('Select your language', { ns: 'auth' })}
              </Text>
            )}
            <ChevronDown size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View className="pb-4">
          <Pressable
            onPress={handleContinue}
            disabled={!selectedLang}
            className="py-4 rounded-xl items-center active:opacity-80"
            style={{
              backgroundColor: selectedLang ? colors.primary : colors.surface,
              opacity: selectedLang ? 1 : 0.5,
            }}
          >
            <Text
              className="font-semibold text-lg"
              style={{ color: selectedLang ? colors.textOnPrimary : colors.textMuted }}
            >
              {t('Continue', { ns: 'auth' })}
            </Text>
          </Pressable>
        </View>
      </View>

      <LanguageSelectorModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        selectedLanguage={selectedLang}
        onSelect={handleLanguagePreviewSelect}
        title={t('Language', { ns: 'settings' })}
      />
    </SafeAreaView>
  )
}
