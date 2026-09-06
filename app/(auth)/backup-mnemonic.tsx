/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState } from 'react'
import { View, Text, ScrollView, Pressable } from 'react-native'
import { Redirect, type Href } from 'expo-router'
import { ChevronLeft, Eye, EyeOff, AlertTriangle, ShieldAlert } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { MnemonicDisplay } from '@/components/wallet'
import { useOnboardingStore } from '@/store'
import { useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { OnboardingStepper } from './_components/OnboardingStepper'

export default function BackupMnemonicScreen() {
  const router = useGuardedRouter()
  const colors = useThemeColors()
  const { t } = useTranslation('auth')
  const pendingWallet = useOnboardingStore((state) => state.pendingWallet)

  const [isRevealed, setIsRevealed] = useState(false)
  const activeMnemonic = pendingWallet?.mnemonic
  const activeAddress = pendingWallet?.wallet.address

  const handleRevealAndContinue = () => {
    if (!isRevealed) {
      setIsRevealed(true)
      return
    }

    router.push('/(auth)/verify-mnemonic' as Href)
  }

  if (!activeMnemonic || !activeAddress) {
    return <Redirect href={'/(auth)/welcome' as Href} />
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="flex-row items-center px-5 pt-1 pb-2">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <OnboardingStepper currentStep={2} />

        <Text
          className="text-[26px] font-bold leading-[32px] mt-1"
          style={{ color: colors.text }}
        >
          {t('Backup Recovery Phrase')}
        </Text>
        <Text
          className="text-[15px] leading-[22px] mt-2"
          style={{ color: colors.textSecondary }}
        >
          {t('Write down these 24 words in order and store them safely')}
        </Text>

        <View
          className="rounded-2xl px-4 py-4 mt-6 flex-row gap-3"
          style={{
            backgroundColor: `${colors.error}12`,
            borderLeftWidth: 3,
            borderLeftColor: colors.error,
          }}
        >
          <ShieldAlert size={20} color={colors.error} />
          <View className="flex-1 gap-1.5">
            <Text
              className="font-semibold text-[14px]"
              style={{ color: colors.error }}
            >
              {t('Never share your recovery phrase')}
            </Text>
            <Text
              className="text-[13px] leading-[18px]"
              style={{ color: colors.textSecondary }}
            >
              {t(
                'Anyone with these words can access your account and all your messages. Spectra support will NEVER ask for your recovery phrase.',
              )}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center justify-between mt-6 mb-3">
          <Text
            className="text-[15px] font-semibold"
            style={{ color: colors.text }}
          >
            {t('Your Recovery Phrase')}
          </Text>
          {isRevealed && (
            <View className="flex-row items-center gap-3">
              <Text
                className="text-[11px]"
                style={{ color: colors.textMuted }}
              >
                {t('Copy disabled for security')}
              </Text>
              <Pressable
                onPress={() => setIsRevealed(false)}
                className="flex-row items-center gap-1.5 active:opacity-60"
                hitSlop={8}
              >
                <EyeOff size={15} color={colors.textSecondary} />
                <Text
                  className="text-[12px] font-medium"
                  style={{ color: colors.textSecondary }}
                >
                  {t('Hide')}
                </Text>
              </Pressable>
            </View>
          )}
        </View>

        {isRevealed ? (
          <MnemonicDisplay mnemonic={activeMnemonic} />
        ) : (
          <Pressable
            onPress={() => setIsRevealed(true)}
            className="rounded-2xl px-5 py-8 items-center justify-center border border-dashed active:opacity-80"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.borderLight,
            }}
          >
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: `${colors.primary}1F` }}
            >
              <Eye size={24} color={colors.primary} />
            </View>
            <Text
              className="text-[15px] font-semibold"
              style={{ color: colors.text }}
            >
              {t('Tap to reveal your recovery phrase')}
            </Text>
            <Text
              className="text-[12px] text-center mt-1 max-w-[260px] leading-[16px]"
              style={{ color: colors.textSecondary }}
            >
              {t('Make sure no one is watching your screen')}
            </Text>
          </Pressable>
        )}

        {isRevealed && (
          <View
            className="rounded-xl px-3 py-3 mt-3 flex-row gap-2.5"
            style={{ backgroundColor: `${colors.warning}14` }}
          >
            <AlertTriangle size={16} color={colors.warning} />
            <Text
              className="flex-1 text-[12px] leading-[16px]"
              style={{ color: colors.textSecondary }}
            >
              {t(
                'Make sure you\'ve written down all 24 words in the correct order. You\'ll need to verify them in the next step.',
              )}
            </Text>
          </View>
        )}
      </ScrollView>

      <View
        className="px-5 pt-3 pb-4 border-t"
        style={{ borderTopColor: colors.border }}
      >
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onPress={handleRevealAndContinue}
        >
          {isRevealed ? t("I've Saved It - Continue") : t('Reveal Recovery Phrase')}
        </Button>
      </View>
    </SafeAreaView>
  )
}
