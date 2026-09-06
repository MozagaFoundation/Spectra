/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState } from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import { KeyboardAvoidingView } from '@/components/ui/KeyboardAvoidingView'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Lock } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PinInput } from '@/components/wallet'
import { useWalletStore } from '@/store'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { logoutAndWipeAccount } from '@/services/accountLifecycle/accountTeardown'
import {
  formatGuardedPinLockoutMessage,
  verifyPinWithAttemptGuard,
  type GuardedPinResult,
} from '@/services/security/pinAttemptGuard'

type Step = 'current' | 'new' | 'confirm'

export default function ChangePinScreen() {
  const router = useRouter()
  const { verifyPin, changePin } = useWalletStore()
  const colors = useThemeColors()
  useTranslation()
  
  const [step, setStep] = useState<Step>('current')
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleGuardedPinFailure = async (result: Exclude<GuardedPinResult, { status: 'valid' }>) => {
    if (result.status === 'wipe_required') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      await logoutAndWipeAccount()
      router.replace('/(auth)/welcome' as Href)
      return
    }

    if (result.status === 'locked') {
      setError(formatGuardedPinLockoutMessage(result.lockoutUntil, translate))
    } else {
      setError(translate('lockout.remainingAttempts', { ns: 'auth', count: result.remainingAttempts }))
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  }

  const handleCurrentPinComplete = async (pin: string) => {
    setError(null)
    
    try {
      const result = await verifyPinWithAttemptGuard(pin, verifyPin)
      
      if (result.status !== 'valid') {
        await handleGuardedPinFailure(result)
        return
      }
      
      setCurrentPin(pin)
      setStep('new')
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } catch (err) {
      setError(translate('Failed to verify PIN', { ns: 'settings' }))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }
  
  const handleNewPinComplete = async (pin: string) => {
    if (pin === currentPin) {
      setError(translate('New PIN must be different from current PIN', { ns: 'settings' }))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }
    setNewPin(pin)
    setStep('confirm')
    setError(null)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }
  
  const handleConfirmPinComplete = async (pin: string) => {
    if (pin !== newPin) {
      setError(translate('PINs do not match', { ns: 'settings' }))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }
    setError(null)
    
    try {
      const success = await changePin(currentPin, newPin)
      
      if (success) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        Alert.alert(translate('Success', { ns: 'common' }), translate('Your PIN has been changed successfully.', { ns: 'settings' }), [
          { text: translate('OK', { ns: 'settings' }), onPress: () => router.back() }
        ])
      } else {
        setError(translate('Failed to change PIN', { ns: 'settings' }))
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      }
    } catch (err) {
      setError(translate('Failed to change PIN', { ns: 'settings' }))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    }
  }
  
  const getTitle = () => {
    switch (step) {
      case 'current': return translate('Enter Current PIN', { ns: 'settings' })
      case 'new': return translate('Enter New PIN', { ns: 'settings' })
      case 'confirm': return translate('Confirm New PIN', { ns: 'settings' })
    }
  }
  
  const getSubtitle = () => {
    switch (step) {
      case 'current': return translate('Verify your identity to change PIN', { ns: 'settings' })
      case 'new': return translate('Choose a new 6-digit PIN', { ns: 'settings' })
      case 'confirm': return translate('Re-enter your new PIN to confirm', { ns: 'settings' })
    }
  }
  
  const handleBack = () => {
    if (step === 'current') {
      router.back()
    } else if (step === 'new') {
      setStep('current')
      setError(null)
    } else {
      setStep('new')
      setError(null)
    }
  }
  
  return (
    <SafeAreaView className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View className="flex-1 px-5">
          <View className="flex-row items-center">
            <Pressable onPress={handleBack} className="p-2 -ml-2">
              <ChevronLeft size={24} color={colors.text} />
            </Pressable>
          </View>
          
          <View className="flex-row gap-2 mt-4 mb-8 px-10">
            <View className={`flex-1 h-1 rounded-full ${step === 'current' || step === 'new' || step === 'confirm' ? 'bg-primary' : 'bg-border'}`} />
            <View className={`flex-1 h-1 rounded-full ${step === 'new' || step === 'confirm' ? 'bg-primary' : 'bg-border'}`} />
            <View className={`flex-1 h-1 rounded-full ${step === 'confirm' ? 'bg-primary' : 'bg-border'}`} />
          </View>
          
          <View className="flex-1 items-center justify-center pb-10">
            <View className="w-20 h-20 rounded-2xl items-center justify-center mb-6" style={{ backgroundColor: colors.primary + '26' }}>
              <Lock size={40} color={colors.primary} />
            </View>
            
            <Text className="text-2xl font-bold text-text text-center mb-2">
              {getTitle()}
            </Text>
            <Text className="text-text-secondary text-center mb-10">
              {getSubtitle()}
            </Text>
            
            {step === 'current' && (
              <PinInput 
                onComplete={handleCurrentPinComplete} 
                error={error || undefined}
              />
            )}
            
            {step === 'new' && (
              <PinInput 
                onComplete={handleNewPinComplete} 
                error={error || undefined}
              />
            )}
            
            {step === 'confirm' && (
              <PinInput 
                onComplete={handleConfirmPinComplete} 
                error={error || undefined}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
