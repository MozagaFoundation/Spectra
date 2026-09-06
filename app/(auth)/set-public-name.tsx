/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState } from 'react'
import { Keyboard, Pressable, ScrollView, Text, View } from 'react-native'
import { Redirect, type Href } from 'expo-router'
import { ChevronLeft, UserRound } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { AliasInput, aliasFieldValue, validateAliasField } from '@/components/common/AliasInput'
import { useOnboardingStore } from '@/store'
import { useThemeColors } from '@/lib/theme'
import { normalizeDiscoveryAlias } from '@/lib/discoveryAlias'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { OnboardingStepper } from './_components/OnboardingStepper'

export default function SetPublicNameScreen() {
  const router = useGuardedRouter()
  const colors = useThemeColors()
  const { t } = useTranslation('auth')
  const pendingWallet = useOnboardingStore((state) => state.pendingWallet)
  const setPendingContactProfileName = useOnboardingStore(
    (state) => state.setPendingContactProfileName,
  )
  const [contactProfileName, setContactProfileName] = useState(
    pendingWallet?.contactProfileName || '',
  )
  const [validationError, setValidationError] = useState<string | null>(null)

  const getValidationMessage = (value: string | null): string | null => {
    return validateAliasField(value ?? '')
  }

  if (!pendingWallet) {
    return <Redirect href={'/(auth)/welcome' as Href} />
  }
  if (pendingWallet.source !== 'create') {
    return <Redirect href={'/(auth)/set-pin' as Href} />
  }

  const continueToPin = (name: string | null) => {
    const nextValidationError = getValidationMessage(name)
    if (nextValidationError) {
      setValidationError(nextValidationError)
      return
    }
    let normalizedName: string | null
    try {
      normalizedName = name ? normalizeDiscoveryAlias(aliasFieldValue(name)) ?? null : null
    } catch {
      setValidationError(getValidationMessage(name) ?? t('Alias is invalid.'))
      return
    }

    Keyboard.dismiss()
    setPendingContactProfileName(normalizedName)
    router.push('/(auth)/set-pin' as Href)
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="flex-row items-center px-5 pt-1 pb-2">
        <Pressable
          accessibilityLabel={t('Go back')}
          onPress={() => router.back()}
          className="p-2 -ml-2"
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <OnboardingStepper currentStep={4} totalSteps={4} />

        <View
          className="w-16 h-16 rounded-2xl items-center justify-center mt-2"
          style={{ backgroundColor: `${colors.primary}1F` }}
        >
          <UserRound size={30} color={colors.primary} />
        </View>

        <Text
          className="text-[26px] font-bold leading-[32px] mt-5"
          style={{ color: colors.text }}
        >
          {t('Choose an Alias')}
        </Text>
        <Text
          className="text-[15px] leading-[22px] mt-2"
          style={{ color: colors.textSecondary }}
        >
          {t('Optional. People can search this alias while you are Findable. You can skip it and still be found by your EXO address.')}
        </Text>

        <View className="mt-7 gap-2">
          <AliasInput
            label={t('Alias')}
            value={contactProfileName}
            onChangeText={(value) => {
              setContactProfileName(value)
              setValidationError(getValidationMessage(value))
            }}
            error={validationError}
            returnKeyType="done"
            onSubmitEditing={() => continueToPin(contactProfileName)}
          />
          <Text className="text-[12px] leading-[17px]" style={{ color: colors.textMuted }}>
            {t('Your alias is not included in your recovery phrase. Spectre Mode cannot use aliases.')}
          </Text>
          <Text
            className="text-[12px] leading-[17px] text-right"
            style={{ color: validationError ? colors.error : colors.textMuted }}
          >
            {t('{{count}}/80', { count: [...contactProfileName].length })}
          </Text>
        </View>
      </ScrollView>

      <View className="px-5 pt-3 pb-4 border-t gap-2" style={{ borderTopColor: colors.border }}>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onPress={() => continueToPin(contactProfileName)}
          disabled={validationError !== null}
        >
          {t('Continue')}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          fullWidth
          onPress={() => continueToPin(null)}
        >
          {t('Skip for Now')}
        </Button>
      </View>
    </SafeAreaView>
  )
}
