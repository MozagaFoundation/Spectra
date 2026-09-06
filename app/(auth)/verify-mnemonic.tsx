/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useMemo, useState } from 'react'
import type { Href } from 'expo-router'
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native'
import { ChevronLeft, Check, X, ShieldCheck } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { useOnboardingStore } from '@/store'
import { useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { OnboardingStepper } from './_components/OnboardingStepper'
import {
  areMnemonicAnswersCorrect,
  createMnemonicVerificationChallenge,
  splitMnemonicWords,
} from './mnemonicVerification'

export default function VerifyMnemonicScreen() {
  const router = useGuardedRouter()
  const colors = useThemeColors()
  const { t } = useTranslation('auth')
  const pendingWallet = useOnboardingStore((state) => state.pendingWallet)
  const activeMnemonic = pendingWallet?.mnemonic
  const activeAddress = pendingWallet?.wallet.address

  const words = useMemo(() => splitMnemonicWords(activeMnemonic), [activeMnemonic])

  const verificationChallenge = useMemo(
    () => createMnemonicVerificationChallenge(words),
    [words],
  )
  const verificationIndices = verificationChallenge.indices

  const [answers, setAnswers] = useState<(string | null)[]>([null, null, null])
  const [showResults, setShowResults] = useState(false)

  const wordOptions = verificationChallenge.options

  const handleSelectWord = (questionIndex: number, word: string) => {
    const newAnswers = [...answers]
    newAnswers[questionIndex] = word
    setAnswers(newAnswers)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const handleVerify = async () => {
    setShowResults(true)

    const allCorrect = areMnemonicAnswersCorrect(words, verificationIndices, answers)

    if (allCorrect) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setTimeout(() => {
        router.push('/(auth)/set-public-name' as Href)
      }, 1000)
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }

  const handleRetry = () => {
    setAnswers([null, null, null])
    setShowResults(false)
  }

  const canVerify = answers.every(a => a !== null)

  const isAllCorrect = showResults && areMnemonicAnswersCorrect(words, verificationIndices, answers)

  if (!activeMnemonic || !activeAddress) {
    router.replace('/(auth)/welcome' as Href)
    return null
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
        <OnboardingStepper currentStep={3} />

        <Text
          className="text-[26px] font-bold leading-[32px] mt-1"
          style={{ color: colors.text }}
        >
          {t('Verify Recovery Phrase')}
        </Text>
        <Text
          className="text-[15px] leading-[22px] mt-2"
          style={{ color: colors.textSecondary }}
        >
          {t(
            'Select the correct word for each position to confirm you\'ve saved your recovery phrase',
          )}
        </Text>

        <View className="gap-3 mt-6">
          {verificationIndices.map((wordIndex, questionIndex) => {
            const userAnswer = answers[questionIndex]
            const correctWord = words[wordIndex]
            const isCorrect = showResults && userAnswer === correctWord
            const isIncorrect = showResults && userAnswer !== correctWord
            const cardBorderColor = isCorrect
              ? colors.success
              : isIncorrect
                ? colors.error
                : colors.border

            return (
              <View
                key={questionIndex}
                className="rounded-2xl px-4 py-4"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: cardBorderColor,
                  borderWidth: showResults ? 1.5 : 1,
                }}
              >
                <View className="flex-row items-center justify-between mb-3">
                  <Text
                    className="text-[15px] font-bold"
                    style={{ color: colors.text }}
                  >
                    {t('Word #{{index}}', { index: wordIndex + 1 })}
                  </Text>

                  {showResults && (
                    isCorrect ? (
                      <Check size={18} color={colors.success} strokeWidth={3} />
                    ) : (
                      <X size={18} color={colors.error} strokeWidth={3} />
                    )
                  )}
                </View>

                <View className="flex-row flex-wrap gap-2">
                  {wordOptions[questionIndex].map((word) => {
                    const isSelected = userAnswer === word
                    const isThisCorrect = showResults && word === correctWord
                    const isThisWrong = showResults && isSelected && !isThisCorrect

                    let bgColor: string = 'transparent'
                    let borderColor: string = colors.borderLight
                    let textColor: string = colors.text

                    if (isThisCorrect) {
                      bgColor = `${colors.success}1F`
                      borderColor = colors.success
                      textColor = colors.success
                    } else if (isThisWrong) {
                      bgColor = `${colors.error}1F`
                      borderColor = colors.error
                      textColor = colors.error
                    } else if (isSelected) {
                      bgColor = colors.primary
                      borderColor = colors.primary
                      textColor = colors.textOnPrimary
                    }

                    return (
                      <Pressable
                        key={word}
                        onPress={() => !showResults && handleSelectWord(questionIndex, word)}
                        disabled={showResults}
                        className="px-4 py-2.5 rounded-xl active:opacity-80"
                        style={{
                          backgroundColor: bgColor,
                          borderColor,
                          borderWidth: 1,
                        }}
                      >
                        <Text
                          className="font-medium text-[14px] font-mono"
                          style={{ color: textColor }}
                        >
                          {word}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            )
          })}
        </View>

        {showResults && !isAllCorrect && (
          <View
            className="rounded-2xl px-4 py-4 mt-4 flex-row gap-3"
            style={{
              backgroundColor: `${colors.error}12`,
              borderLeftWidth: 3,
              borderLeftColor: colors.error,
            }}
          >
            <X size={20} color={colors.error} strokeWidth={2.5} />
            <Text
              className="flex-1 text-[13px] leading-[18px]"
              style={{ color: colors.textSecondary }}
            >
              {t('Some answers were incorrect. Please go back and review your recovery phrase.')}
            </Text>
          </View>
        )}

        {showResults && isAllCorrect && (
          <View
            className="rounded-2xl px-4 py-4 mt-4 flex-row gap-3 items-center"
            style={{
              backgroundColor: `${colors.success}12`,
              borderLeftWidth: 3,
              borderLeftColor: colors.success,
            }}
          >
            <ShieldCheck size={20} color={colors.success} />
            <View className="flex-1">
              <Text
                className="font-semibold text-[14px]"
                style={{ color: colors.success }}
              >
                {t('All correct! Redirecting...')}
              </Text>
            </View>
            <ActivityIndicator size="small" color={colors.success} />
          </View>
        )}
      </ScrollView>

      <View
        className="px-5 pt-3 pb-4 border-t gap-3"
        style={{ borderTopColor: colors.border }}
      >
        {!showResults ? (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            disabled={!canVerify}
            onPress={handleVerify}
          >
            {t('Verify')}
          </Button>
        ) : !isAllCorrect ? (
          <>
            <Button variant="primary" size="lg" fullWidth onPress={handleRetry}>
              {t('Retry')}
            </Button>
            <Button variant="ghost" size="lg" fullWidth onPress={() => router.back()}>
              {t('Go Back to Recovery Phrase')}
            </Button>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  )
}
