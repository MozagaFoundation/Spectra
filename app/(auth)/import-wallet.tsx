/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useRef, useState } from 'react'
import type { Href } from 'expo-router'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller'
import { ChevronLeft, ShieldAlert, KeyRound } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { MnemonicInput } from '@/components/wallet'
import {
  DETERMINISTIC_EXO_WALLET_BUNDLE_SIZE,
  deriveDeterministicEXOWalletBundle,
  validateMnemonic,
} from '@spectra/identity-vault'
import { useOnboardingStore } from '@/store'
import { useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { getMnemonicValidationDisplayMessage } from '@/lib/mnemonicValidation'
import { getSafeAuthErrorMessage } from './authErrors'

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve())
      return
    }
    setTimeout(resolve, 0)
  })
}

async function waitForPaint(): Promise<void> {
  await waitForNextFrame()
  await waitForNextFrame()
}

export default function ImportWalletScreen() {
  const router = useGuardedRouter()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation('auth')
  const setPendingWallet = useOnboardingStore((state) => state.setPendingWallet)

  const [mnemonic, setMnemonic] = useState('')
  const [isComplete, setIsComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({
    completed: 0,
    total: DETERMINISTIC_EXO_WALLET_BUNDLE_SIZE,
  })
  const importInFlightRef = useRef(false)

  const handleMnemonicChange = (value: string, complete: boolean) => {
    setMnemonic(value)
    setIsComplete(complete)
    setError(null)
  }

  const handleImport = async () => {
    if (importInFlightRef.current) return

    importInFlightRef.current = true
    let navigationStarted = false
    setError(null)

    try {
      const validation = validateMnemonic(mnemonic)
      if (!validation.valid) {
        setError(getMnemonicValidationDisplayMessage(validation, t))
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        return
      }

      setImportProgress({
        completed: 0,
        total: DETERMINISTIC_EXO_WALLET_BUNDLE_SIZE,
      })
      setIsImporting(true)
      await waitForPaint()

      const bundle = await deriveDeterministicEXOWalletBundle(mnemonic, {
        onProgress: ({ completed, total }) => {
          setImportProgress({ completed, total })
        },
        yieldToEventLoop: waitForPaint,
      })
      const wallets = [
        bundle.rootWallet,
        ...bundle.transparentWallets,
        bundle.spectreWallet,
      ]
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

      setPendingWallet({
        mnemonic,
        source: 'import',
        wallet: bundle.rootWallet,
        wallets,
      })

      router.push('/(auth)/set-pin' as Href)
      navigationStarted = true
    } catch (err) {
      setError(getSafeAuthErrorMessage(err, t('Failed to import account')))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      importInFlightRef.current = false
      if (!navigationStarted) {
        setIsImporting(false)
      }
    }
  }

  if (isImporting) {
    return (
      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
        testID="import-progress-screen"
      >
        <View className="flex-1 items-center justify-center px-8">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            className="text-xl font-bold mt-6 text-center"
            style={{ color: colors.text }}
          >
            {t('Importing Account')}
          </Text>
          <Text
            className="text-sm mt-2 text-center"
            style={{ color: colors.textSecondary }}
          >
            {importProgress.completed === 0
              ? t('Preparing account...')
              : t('Deriving wallets...')}
          </Text>
          <View
            accessibilityLabel={t('Account import progress')}
            accessibilityRole="progressbar"
            accessibilityValue={{
              min: 0,
              max: importProgress.total,
              now: importProgress.completed,
            }}
            className="mt-4"
            testID="import-progress"
          >
            <Text className="font-mono text-sm" style={{ color: colors.textMuted }}>
              {importProgress.completed} / {importProgress.total}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="flex-row items-center px-5 pt-1 pb-2">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 112,
        }}
        bottomOffset={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
          <View className="flex-row items-center gap-3 mt-2 mb-4">
            <View
              className="w-12 h-12 rounded-2xl items-center justify-center"
              style={{ backgroundColor: `${colors.primary}1F` }}
            >
              <KeyRound size={22} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text
                className="text-[26px] font-bold leading-[32px]"
                style={{ color: colors.text }}
              >
                {t('Import Account')}
              </Text>
            </View>
          </View>
          <Text
            className="text-[15px] leading-[22px]"
            style={{ color: colors.textSecondary }}
          >
            {t('Enter your 12- or 24-word recovery phrase to restore your account')}
          </Text>

          <View
            className="rounded-2xl px-4 py-4 mt-6 flex-row gap-3"
            style={{
              backgroundColor: `${colors.warning}14`,
              borderLeftWidth: 3,
              borderLeftColor: colors.warning,
            }}
          >
            <ShieldAlert size={20} color={colors.warning} />
            <View className="flex-1 gap-1.5">
              <Text
                className="font-semibold text-[14px]"
                style={{ color: colors.warning }}
              >
                {t('Security Notice')}
              </Text>
              <Text
                className="text-[13px] leading-[18px]"
                style={{ color: colors.textSecondary }}
              >
                {t(
                  'Only import your recovery phrase on a trusted device. Make sure no one is watching your screen and never share your phrase with anyone.',
                )}
              </Text>
            </View>
          </View>

          <View className="mt-6">
            <MnemonicInput
              onMnemonicChange={handleMnemonicChange}
              error={error || undefined}
              embeddedScroll={false}
            />
          </View>
      </KeyboardAwareScrollView>

      <View
        className="px-5 pt-3 pb-4 border-t"
        style={{ borderTopColor: colors.border }}
      >
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!isComplete}
          onPress={handleImport}
        >
          {t('Import Account')}
        </Button>
      </View>
    </SafeAreaView>
  )
}
