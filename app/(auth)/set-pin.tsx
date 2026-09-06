/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useEffect, useRef } from 'react'
import { Keyboard, Platform, ScrollView, StyleSheet, View, Text, Pressable } from 'react-native'
import { KeyboardAvoidingView } from '@/components/ui/KeyboardAvoidingView'
import { useRouter, type Href } from 'expo-router'
import { ChevronLeft, Lock, Fingerprint, Shield, Key, CheckCircle } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import * as LocalAuthentication from 'expo-local-authentication'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { SpectraLogoMark } from '@/components/common/SpectraLogoMark'
import { PinInput } from '@/components/wallet'
import { useWalletStore, useAuthStore, useOnboardingStore } from '@/store'
import { deriveDeterministicEXOWalletBundle } from '@spectra/identity-vault'
import { clearBiometricUnlock, storeBiometricUnlockKey } from '@/services/security/biometricUnlock'
import type { EXOWallet } from '@/lib/types'
import { useThemeColors } from '@/lib/theme'
import { getSafeAuthErrorMessage } from './authErrors'

type Step = 'create' | 'confirm' | 'biometric'
type SetupStep = 'wallet' | 'encrypting' | 'saving' | 'done'

function SetupProgress({ currentStep, steps }: { currentStep: SetupStep; steps: SetupStep[] }) {
  const colors = useThemeColors()
  const { t } = useTranslation('auth')
  const stepIndex = steps.indexOf(currentStep)
  
  const stepLabels: Record<SetupStep, string> = {
    wallet: t('Preparing account...'),
    encrypting: t('Encrypting with PIN...'),
    saving: t('Securing data...'),
    done: t('Complete!'),
  }
  
  const stepIcons: Record<SetupStep, React.ReactNode> = {
    wallet: <Key size={20} color={colors.primary} />,
    encrypting: <Shield size={20} color={colors.primary} />,
    saving: <Lock size={20} color={colors.primary} />,
    done: <CheckCircle size={20} color={colors.success} />,
  }
  
  return (
    <View className="w-full max-w-[280px]">
      {steps.map((step, index) => {
        const isActive = index === stepIndex
        const isComplete = index < stepIndex
        const isPending = index > stepIndex
        
        return (
          <View key={step} className="flex-row items-center gap-3 mb-4">
            <View className={`w-10 h-10 rounded-full items-center justify-center ${
              isComplete ? 'bg-success/20' : isActive ? 'bg-primary/20' : 'bg-surface'
            }`}>
              {isComplete ? (
                <CheckCircle size={20} color={colors.success} />
              ) : (
                stepIcons[step]
              )}
            </View>
            <Text className={`flex-1 ${
              isActive ? 'text-text font-semibold' : isPending ? 'text-text-muted' : 'text-text-secondary'
            }`}>
              {stepLabels[step]}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

export default function SetPinScreen() {
  const router = useRouter()
  const colors = useThemeColors()
  const { t } = useTranslation('auth')
  const isAndroid = Platform.OS === 'android'
  const androidScrollRef = useRef<ScrollView>(null)
  const pendingWallet = useOnboardingStore((state) => state.pendingWallet)
  const clearPendingWallet = useOnboardingStore((state) => state.clearPendingWallet)
  const deferContactProfileName = useOnboardingStore((state) => state.deferContactProfileName)
  
  const createWallet = useWalletStore((state) => state.createWallet)
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated)
  
  const [step, setStep] = useState<Step>('create')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [setupStep, setSetupStep] = useState<SetupStep>('wallet')
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  const activeMnemonic = pendingWallet?.mnemonic
  const activeAddress = pendingWallet?.wallet.address
  const pendingContactProfileName = pendingWallet?.contactProfileName ?? null
  
  const cachedWallet = useRef<EXOWallet | null>(
    pendingWallet?.wallet ?? null
  )
  const cachedWallets = useRef<EXOWallet[] | null>(
    pendingWallet?.wallets ?? null
  )
  const setupDoneRef = useRef(false)
  
  useEffect(() => {
    checkBiometrics()
  }, [])

  useEffect(() => {
    if (!isAndroid) return undefined

    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true)
      requestAnimationFrame(() => {
        androidScrollRef.current?.scrollToEnd?.({ animated: true })
      })
    })
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false)
    })

    return () => {
      showSubscription.remove()
      hideSubscription.remove()
    }
  }, [isAndroid])

  useEffect(() => {
    if (!cachedWallet.current && pendingWallet?.wallet) {
      cachedWallet.current = pendingWallet.wallet
    }
    if (!cachedWallets.current && pendingWallet?.wallets) {
      cachedWallets.current = pendingWallet.wallets
    }
  }, [pendingWallet])
  
  const checkBiometrics = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync()
    const enrolled = await LocalAuthentication.isEnrolledAsync()
    setBiometricAvailable(compatible && enrolled)
  }
  
  const handlePinCreate = (newPin: string) => {
    setPin(newPin)
    setStep('confirm')
    setError(null)
  }
  
  const handlePinConfirm = async (confirmPin: string) => {
    if (confirmPin !== pin) {
      setError(t('PINs do not match'))
      return
    }
    
    if (biometricAvailable) {
      setStep('biometric')
    } else {
      await finishSetup(false)
    }
  }
  
  const finishSetup = async (enableBiometric: boolean) => {
    if (!activeMnemonic) return
    
    setIsLoading(true)
    setError(null)
    let navigationStarted = false
    
    try {
      let wallet: EXOWallet
      let wallets: EXOWallet[]
      
      setSetupStep('wallet')
      if (cachedWallet.current && cachedWallets.current) {
        wallet = cachedWallet.current
        wallets = cachedWallets.current
      } else {
        const bundle = await deriveDeterministicEXOWalletBundle(activeMnemonic)
        wallet = bundle.rootWallet
        wallets = [
          bundle.rootWallet,
          ...bundle.transparentWallets,
          bundle.spectreWallet,
        ]
        cachedWallet.current = wallet
        cachedWallets.current = wallets
      }
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      setSetupStep('encrypting')
      await new Promise(resolve => setTimeout(resolve, 50))
      await createWallet(wallets, pin)
      
      setSetupStep('saving')
      if (enableBiometric) {
        const biometricKey = useWalletStore.getState()._sessionDerivedKey
        if (!biometricKey) {
          throw new Error(t('Biometric key unavailable'))
        }
        try {
          await storeBiometricUnlockKey(biometricKey, t('Enable Biometric Unlock'))
        } catch (biometricError) {
          console.warn('Biometric enrollment skipped during account setup:', biometricError)
          await clearBiometricUnlock()
        }
      } else {
        await clearBiometricUnlock()
      }

      if (pendingContactProfileName) {
        deferContactProfileName(wallet.address, pendingContactProfileName)
      }
      setAuthenticated(wallet.address, wallet.publicKey)
      setupDoneRef.current = true

      setSetupStep('done')
      await new Promise(resolve => setTimeout(resolve, 300))

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.replace('/(main)/(tabs)/chats' as Href)
      navigationStarted = true
      clearPendingWallet()
    } catch (err) {
      setError(getSafeAuthErrorMessage(err, t('Failed to create account')))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      if (!navigationStarted) {
        setIsLoading(false)
      }
    }
  }
  
  const handleEnableBiometric = async () => {
    await finishSetup(true)
  }
  
  if (!setupDoneRef.current && (!activeMnemonic || !activeAddress)) {
    router.replace('/(auth)/welcome' as Href)
    return null
  }
  
  const screenContent = (
    <>
          <View className="flex-row items-center">
            {step !== 'biometric' && (
              <Pressable
                onPress={() => {
                  if (step === 'confirm') {
                    setStep('create')
                    setError(null)
                  } else {
                    router.back()
                  }
                }}
                className="p-2 -ml-2"
              >
                <ChevronLeft size={24} color={colors.text} />
              </Pressable>
            )}
          </View>
          
          <View className={isAndroid ? 'items-center justify-center pb-6' : 'flex-1 items-center justify-center pb-10'}>
            {step === 'create' && !isLoading && (
              <>
                <View className={isAndroid ? 'mb-3' : 'mb-6'}>
                  <SpectraLogoMark size={isAndroid && keyboardVisible ? 72 : 88} />
                </View>
                
                <Text className="text-2xl font-bold text-text text-center mb-2">
                  {t('Create Your PIN')}
                </Text>
                <Text
                  className={isAndroid && keyboardVisible ? 'text-text-secondary text-center mb-4' : isAndroid ? 'text-text-secondary text-center mb-6' : 'text-text-secondary text-center mb-10'}
                  style={isAndroid ? styles.androidSubtitle : undefined}
                >
                  {t('This PIN will be used to unlock your account')}
                </Text>
                
                <PinInput onComplete={handlePinCreate} label={t('Enter a 6-digit PIN')} />
              </>
            )}
            
            {step === 'confirm' && !isLoading && (
              <>
                <View className={isAndroid ? 'mb-3' : 'mb-6'}>
                  <SpectraLogoMark size={isAndroid && keyboardVisible ? 72 : 88} />
                </View>
                
                <Text className="text-2xl font-bold text-text text-center mb-2">
                  {t('Confirm Your PIN')}
                </Text>
                <Text
                  className={isAndroid && keyboardVisible ? 'text-text-secondary text-center mb-4' : isAndroid ? 'text-text-secondary text-center mb-6' : 'text-text-secondary text-center mb-10'}
                  style={isAndroid ? styles.androidSubtitle : undefined}
                >
                  {t('Enter the same PIN again to confirm')}
                </Text>
                
                <PinInput
                  onComplete={handlePinConfirm}
                  error={error || undefined}
                  label={t('Re-enter your PIN')}
                />
              </>
            )}
            
            {step === 'biometric' && !isLoading && (
              <>
                <View
                  className="w-20 h-20 rounded-2xl items-center justify-center mb-6"
                  style={{ backgroundColor: colors.primary + '26' }}
                >
                  <Fingerprint size={40} color={colors.primary} />
                </View>
                
                <Text className="text-2xl font-bold text-text text-center mb-2">
                  {t('Enable Biometric Unlock')}
                </Text>
                <Text className="text-text-secondary text-center mb-10 max-w-[280px]">
                  {t('Use Face ID or fingerprint for quick and secure access to your account')}
                </Text>
                
                <View className="w-full gap-3 px-5">
                  <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    onPress={handleEnableBiometric}
                    disabled={isLoading}
                  >
                    {t('Enable Biometric')}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="lg"
                    fullWidth
                    onPress={() => finishSetup(false)}
                    disabled={isLoading}
                  >
                    {t('Skip for Now')}
                  </Button>
                </View>
              </>
            )}
            
            {isLoading && (
              <>
                <View
                  className="w-20 h-20 rounded-2xl items-center justify-center mb-6"
                  style={{ backgroundColor: colors.primary + '26' }}
                >
                  <Shield size={40} color={colors.primary} />
                </View>
                
                <Text className="text-2xl font-bold text-text text-center mb-2">
                  {t('Securing Your Account')}
                </Text>
                <Text className="text-text-secondary text-center mb-10 max-w-[280px]">
                  {t('Securing your encrypted vault...', { ns: 'common' })}
                </Text>
                
                <SetupProgress 
                  currentStep={setupStep} 
                  steps={['wallet', 'encrypting', 'saving', 'done']}
                />
              </>
            )}
          </View>
    </>
  )

  return (
    <SafeAreaView className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {isAndroid ? (
          <ScrollView
            ref={androidScrollRef}
            contentContainerStyle={[
              styles.androidScrollContent,
              keyboardVisible ? styles.androidScrollContentKeyboard : null,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="px-5">
              {screenContent}
            </View>
          </ScrollView>
        ) : (
          <View className="flex-1 px-5">
            {screenContent}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  androidScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 28,
    paddingTop: 16,
  },
  androidScrollContentKeyboard: {
    justifyContent: 'flex-start',
    paddingBottom: 180,
    paddingTop: 34,
  },
  androidSubtitle: {
    alignSelf: 'stretch',
    lineHeight: 22,
  },
})
