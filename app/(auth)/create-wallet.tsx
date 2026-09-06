/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { Href } from 'expo-router'
import {
  View,
  Text,
  ActivityIndicator,
  InteractionManager,
  Pressable,
  ScrollView,
} from 'react-native'
import {
  ChevronLeft,
  AlertTriangle,
  Copy,
  Check,
  ShieldAlert,
} from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { deriveDeterministicEXOWalletBundle, generateMnemonic } from '@spectra/identity-vault'
import { useOnboardingStore } from '@/store'
import type { EXOWallet } from '@/lib/types'
import { useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { OnboardingStepper } from './_components/OnboardingStepper'
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

export default function CreateWalletScreen() {
  const router = useGuardedRouter()
  const colors = useThemeColors()
  const { t } = useTranslation('auth')
  const setPendingWallet = useOnboardingStore((state) => state.setPendingWallet)
  const [isGenerating, setIsGenerating] = useState(true)
  const [isContinuing, setIsContinuing] = useState(false)
  const [walletInfo, setWalletInfo] = useState<{ address: string; mnemonic: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addressCopied, setAddressCopied] = useState(false)

  const fullWallet = useRef<EXOWallet | null>(null)
  const bundledWallets = useRef<EXOWallet[] | null>(null)
  const generationInFlightRef = useRef(false)
  const continueInFlightRef = useRef(false)
  const copyResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Pinning `t` via a ref keeps generateWallet stable across locale changes so
  // we never re-trigger key generation just because the translator instance
  // updated mid-flight.
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])

  const generateWallet = useCallback(async () => {
    if (generationInFlightRef.current) return

    generationInFlightRef.current = true
    fullWallet.current = null
    bundledWallets.current = null
    setIsGenerating(true)
    setWalletInfo(null)
    setError(null)

    try {
      await waitForNextFrame()
      const mnemonic = generateMnemonic()
      const bundle = await deriveDeterministicEXOWalletBundle(mnemonic)
      fullWallet.current = bundle.rootWallet
      bundledWallets.current = [
        bundle.rootWallet,
        ...bundle.transparentWallets,
        bundle.spectreWallet,
      ]
      setWalletInfo({ address: bundle.rootWallet.address, mnemonic })
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (err) {
      setError(getSafeAuthErrorMessage(err, tRef.current('Failed to generate account')))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      generationInFlightRef.current = false
      setIsGenerating(false)
    }
  }, [])

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void generateWallet()
    })
    return () => task.cancel()
  }, [generateWallet])

  useEffect(() => () => {
    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current)
    }
  }, [])

  const handleCopyAddress = useCallback(async () => {
    if (!walletInfo) return
    await Clipboard.setStringAsync(walletInfo.address)
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setAddressCopied(true)
    if (copyResetTimeoutRef.current) {
      clearTimeout(copyResetTimeoutRef.current)
    }
    copyResetTimeoutRef.current = setTimeout(() => setAddressCopied(false), 2000)
  }, [walletInfo])

  const handleContinue = useCallback(() => {
    if (continueInFlightRef.current) return

    if (walletInfo && fullWallet.current && bundledWallets.current) {
      continueInFlightRef.current = true
      setIsContinuing(true)
      setPendingWallet({
        mnemonic: walletInfo.mnemonic,
        source: 'create',
        wallet: fullWallet.current,
        wallets: bundledWallets.current,
      })
      router.push('/(auth)/backup-mnemonic' as Href)
    }
  }, [router, setPendingWallet, walletInfo])

  useEffect(() => {
    if (!isContinuing) return

    const timeout = setTimeout(() => {
      continueInFlightRef.current = false
      setIsContinuing(false)
    }, 2000)
    return () => clearTimeout(timeout)
  }, [isContinuing])

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="flex-row items-center px-5 pt-1 pb-2">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
      </View>

      {isGenerating ? (
        <View className="flex-1 items-center justify-center px-6 gap-4">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            className="text-[20px] font-bold text-center"
            style={{ color: colors.text }}
          >
            {t('Creating your post-quantum identity...', { ns: 'common' })}
          </Text>
          <Text
            className="text-[14px] text-center max-w-[280px]"
            style={{ color: colors.textSecondary }}
          >
            {t('Generating secure keys...')}
          </Text>
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-6 gap-4">
          <View
            className="w-20 h-20 rounded-full items-center justify-center"
            style={{ backgroundColor: `${colors.error}1F` }}
          >
            <AlertTriangle size={40} color={colors.error} />
          </View>
          <Text
            className="text-[20px] font-bold text-center"
            style={{ color: colors.text }}
          >
            {t('Failed to create account')}
          </Text>
          <Text
            className="text-[14px] text-center max-w-[280px]"
            style={{ color: colors.textSecondary }}
          >
            {error}
          </Text>
          <View className="w-full max-w-[280px] mt-2">
            <Button variant="primary" size="lg" fullWidth onPress={generateWallet}>
              {t('Retry')}
            </Button>
          </View>
        </View>
      ) : walletInfo ? (
        <>
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            <OnboardingStepper currentStep={1} />

            <Text
              className="text-[26px] font-bold leading-[32px] mt-1"
              style={{ color: colors.text }}
            >
              {t('Create New Account')}
            </Text>
            <Text
              className="text-[15px] leading-[22px] mt-2"
              style={{ color: colors.textSecondary }}
            >
              {t('Creating your post-quantum identity...', { ns: 'common' })}
            </Text>

            <View
              className="rounded-2xl px-4 py-4 mt-6 border"
              style={{ backgroundColor: colors.surface, borderColor: colors.border }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text
                  className="text-[11px] font-bold tracking-[1.2px] uppercase"
                  style={{ color: colors.textTertiary }}
                >
                  {t('Your Post-Quantum Account')}
                </Text>
                <Pressable
                  onPress={handleCopyAddress}
                  className="flex-row items-center gap-1.5 active:opacity-60"
                  hitSlop={8}
                >
                  {addressCopied ? (
                    <>
                      <Check size={14} color={colors.success} />
                      <Text
                        className="text-[12px] font-semibold"
                        style={{ color: colors.success }}
                      >
                        {t('Copied!')}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Copy size={14} color={colors.primary} />
                      <Text
                        className="text-[12px] font-semibold"
                        style={{ color: colors.primary }}
                      >
                        {t('Copy')}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
              <Text
                className="text-[13px] font-mono leading-[18px]"
                style={{ color: colors.text }}
                numberOfLines={2}
              >
                {walletInfo.address}
              </Text>
            </View>

            <View
              className="rounded-2xl px-4 py-4 mt-4 flex-row gap-3"
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
                  {t('Important')}
                </Text>
                <Text
                  className="text-[13px] leading-[18px]"
                  style={{ color: colors.textSecondary }}
                >
                  {t(
                    'In the next step, you will be shown your 24-word recovery phrase. Write it down and store it safely. This is the ONLY way to recover your account if you lose access to this device.',
                  )}
                </Text>
              </View>
            </View>
          </ScrollView>

          <View
            className="px-5 pt-3 pb-4 border-t"
            style={{ borderTopColor: colors.border }}
          >
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleContinue}
              loading={isContinuing}
              disabled={isContinuing}
            >
              {t('Continue to Backup')}
            </Button>
          </View>
        </>
      ) : null}
    </SafeAreaView>
  )
}
