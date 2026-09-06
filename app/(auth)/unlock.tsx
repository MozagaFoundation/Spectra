/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useEffect, useRef } from 'react'
import { ActivityIndicator, Keyboard, Platform, ScrollView, StyleSheet, View, Text } from 'react-native'
import { KeyboardAvoidingView } from '@/components/ui/KeyboardAvoidingView'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { Fingerprint } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import * as LocalAuthentication from 'expo-local-authentication'
import * as SecureStore from 'expo-secure-store'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui'
import { SpectraLogoMark } from '@/components/common/SpectraLogoMark'
import { PinInput } from '@/components/wallet'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import {
  clearBiometricUnlock,
  getBiometricUnlockState,
  readBiometricUnlockKey,
  readLegacyBiometricUnlockSecret,
  storeBiometricUnlockKey,
} from '@/services/security/biometricUnlock'
import {
  SECURE_STORE_OPTIONS,
  SECURITY_CONFIG,
  VAULT_SECURITY_KEYS,
} from '@/lib/constants'
import { translate } from '@/lib/i18n'
import { peekPendingContactShareAddress } from '@/lib/pendingContactShare'
import { wipeAllSensitiveData } from '@/services/accountLifecycle/accountTeardown'
import { loadDuressPinState, verifyDuressPin } from '@/services/security/duressPin'
import { useThemeColors } from '@/lib/theme'
import {
  getPendingIncomingCallSession,
} from '@/services/call/callSessionRegistry'
import { consumePendingChatWakeupAfterUnlock } from '@/services/notifications/chatNotificationWakeup'
import { consumeLastNotificationResponse } from '@/services/notifications/pushService'
import { preloadChatRuntimeModules, getBackendAuthModule, getQuantumChatModule } from '@/services/chat/preloadRuntimeModules'

const FAIL_WIPE_ENABLED_KEY = VAULT_SECURITY_KEYS.FAIL_WIPE_ENABLED
const FAIL_WIPE_ATTEMPTS_KEY = VAULT_SECURITY_KEYS.FAIL_WIPE_ATTEMPTS
const PIN_ATTEMPTS_KEY = VAULT_SECURITY_KEYS.PIN_ATTEMPTS
const PIN_LOCKOUT_UNTIL_KEY = VAULT_SECURITY_KEYS.PIN_LOCKOUT_UNTIL

function recoverForegroundSessionAfterUnlock(): void {
  void (async () => {
    const [backendAuth, quantumChat] = await Promise.all([
      getBackendAuthModule(),
      getQuantumChatModule(),
    ])
    backendAuth.resetAuthCooldowns()
    const recovered = await backendAuth.recoverBoundSessionOnForeground(
      quantumChat.getIdentity()?.id,
    )
    quantumChat.syncBundleServerAccessToken()
    if (recovered) {
      quantumChat.catchUpMailboxForBoundSession()
    }
  })().catch((error) => {
    console.warn('[Unlock] Foreground session recovery failed:', error)
  })
}

function formatLockoutMessage(lockoutUntil: number): string {
  const remainingMs = Math.max(lockoutUntil - Date.now(), 0)
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  return translate('lockout.message', { ns: 'auth', count: remainingMinutes })
}

export default function UnlockScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ pendingCall?: string | string[] }>()
  const colors = useThemeColors()
  const { t } = useTranslation('auth')
  const isAndroid = Platform.OS === 'android'
  const androidScrollRef = useRef<ScrollView>(null)
  
  const { unlockVault, unlockVaultWithBiometricKey } = useWalletStore()
  const setAuthenticated = useAuthStore((state) => state.setAuthenticated)
  const chatReset = useChatStore((state) => state.reset)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  
  const [error, setError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null)
  const [biometricAvailable, setBiometricAvailable] = useState(false)
  const [isUnlocking, setIsUnlocking] = useState(false)
  const [hasPendingCallUnlock, setHasPendingCallUnlock] = useState(
    params.pendingCall === '1' || (Array.isArray(params.pendingCall) && params.pendingCall[0] === '1'),
  )
  
  const [duressEnabled, setDuressEnabled] = useState(false)
  const [failWipeEnabled, setFailWipeEnabled] = useState(false)
  const [failWipeMax, setFailWipeMax] = useState(10)
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  const completeUnlock = async () => {
    const { wallet } = useWalletStore.getState()
    if (!wallet) {
      return
    }

    setAuthenticated(wallet.address, wallet.publicKey)
    recoverForegroundSessionAfterUnlock()
    await consumeLastNotificationResponse('post_unlock', { suppressCallRoute: true })
    const pendingCall = await getPendingIncomingCallSession().catch(() => null)
    if (pendingCall) {
      router.replace('/(main)/(tabs)/chats?pendingCall=1' as Href)
    } else {
      const pendingShare = peekPendingContactShareAddress()
      router.replace(
        (pendingShare
          ? `/(main)/contact/add?scannedInvite=${encodeURIComponent(pendingShare)}`
          : '/(main)/(tabs)/chats') as Href,
      )
    }
    void consumePendingChatWakeupAfterUnlock().catch((chatWakeupError) => {
      console.warn('Pending chat wakeup failed after unlock:', chatWakeupError)
    })
  }
  
  useEffect(() => {
    loadSecuritySettings()
    checkBiometric()
  }, [spectreEnabled])

  useEffect(() => {
    preloadChatRuntimeModules()
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
    let cancelled = false
    void getPendingIncomingCallSession()
      .then((pendingIncomingCall) => {
        if (!cancelled) {
          setHasPendingCallUnlock(Boolean(pendingIncomingCall))
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [params.pendingCall])
  
  const loadSecuritySettings = async () => {
    const [
      duressState,
      savedFailWipeEnabled,
      savedFailWipeAttempts,
      savedAttempts,
      savedLockoutUntil,
    ] = await Promise.all([
      loadDuressPinState(),
      SecureStore.getItemAsync(FAIL_WIPE_ENABLED_KEY, SECURE_STORE_OPTIONS),
      SecureStore.getItemAsync(FAIL_WIPE_ATTEMPTS_KEY, SECURE_STORE_OPTIONS),
      SecureStore.getItemAsync(PIN_ATTEMPTS_KEY, SECURE_STORE_OPTIONS),
      SecureStore.getItemAsync(PIN_LOCKOUT_UNTIL_KEY, SECURE_STORE_OPTIONS),
    ])
    
    setDuressEnabled(duressState.enabled)
    if (savedFailWipeEnabled === 'true') setFailWipeEnabled(true)
    if (savedFailWipeAttempts) setFailWipeMax(parseInt(savedFailWipeAttempts, 10) || 10)
    if (savedAttempts) setAttempts(parseInt(savedAttempts, 10) || 0)

    const parsedLockoutUntil = savedLockoutUntil ? parseInt(savedLockoutUntil, 10) : 0
    if (parsedLockoutUntil > Date.now()) {
      setLockoutUntil(parsedLockoutUntil)
      setError(formatLockoutMessage(parsedLockoutUntil))
    } else if (savedLockoutUntil) {
      await SecureStore.deleteItemAsync(PIN_LOCKOUT_UNTIL_KEY, SECURE_STORE_OPTIONS)
    }
  }
  
  const performEmergencyWipe = async () => {
    try {
      chatReset()
      await wipeAllSensitiveData({
        purgeBackendAccount: true,
      })
    } catch (err) {
      console.error('Emergency wipe failed:', err)
      router.replace('/(auth)/welcome' as Href)
    }
  }
  
  const checkBiometric = async () => {
    try {
      if (spectreEnabled) {
        setBiometricAvailable(false)
        return
      }

      const [compatible, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ])

      if (!compatible || !enrolled) {
        setBiometricAvailable(false)
        return
      }

      const biometricState = await getBiometricUnlockState()
      setBiometricAvailable(biometricState.configured)
    } catch (error) {
      console.warn('Biometric availability check failed:', error)
      setBiometricAvailable(false)
    }
  }

  const resetPinThrottleState = async () => {
    setAttempts(0)
    setLockoutUntil(null)

    await Promise.allSettled([
      SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY, SECURE_STORE_OPTIONS),
      SecureStore.deleteItemAsync(PIN_LOCKOUT_UNTIL_KEY, SECURE_STORE_OPTIONS),
    ])
  }
  
  const tryBiometricUnlock = async () => {
    if (isUnlocking || spectreEnabled) return
    
    try {
      setError(null)
      setIsUnlocking(true)

      const biometricSecret = await readBiometricUnlockKey(t('Unlock Spectra'))

      if (biometricSecret) {
        const success = await unlockVaultWithBiometricKey(biometricSecret)
        if (success) {
          await resetPinThrottleState()
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          await completeUnlock()
          return
        }

        await clearBiometricUnlock()
        setBiometricAvailable(false)
        setError(t('Biometric unlock needs to be set up again. Please enter your PIN.'))
        return
      }

      // Migrate biometric unlock from the legacy keychain.
      const legacyStoredValue = await readLegacyBiometricUnlockSecret(
        t('Authenticate to upgrade biometric unlock')
      )
      if (legacyStoredValue) {
        const unlockedWithLegacyBiometricKey = await unlockVaultWithBiometricKey(legacyStoredValue)
        if (unlockedWithLegacyBiometricKey) {
          const biometricKey = useWalletStore.getState()._sessionDerivedKey
          if (biometricKey) {
            try {
              await storeBiometricUnlockKey(
                biometricKey,
                t('Authenticate to finish biometric unlock upgrade')
              )
            } catch (migrationError) {
              console.warn('Biometric unlock migration failed:', migrationError)
            }
          }

          await resetPinThrottleState()
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          await completeUnlock()
          return
        }

        const unlockedWithLegacyPin = await unlockVault(legacyStoredValue)
        if (unlockedWithLegacyPin) {
          const biometricKey = useWalletStore.getState()._sessionDerivedKey
          if (biometricKey) {
            try {
              await storeBiometricUnlockKey(
                biometricKey,
                t('Authenticate to enable secure biometric unlock')
              )
            } catch (migrationError) {
              console.warn('Legacy biometric secret migration failed:', migrationError)
              await clearBiometricUnlock()
            }
          }

          await resetPinThrottleState()
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          await completeUnlock()
          return
        }

        await clearBiometricUnlock()
        setBiometricAvailable(false)
        setError(t('Biometric unlock needs to be set up again. Please enter your PIN.'))
        return
      }

      const biometricState = await getBiometricUnlockState()
      if (!biometricState.configured) {
        setBiometricAvailable(false)
      }
      setError(t('Biometric unlock was not completed. Please enter your PIN.'))
    } catch (err) {
      const message = err instanceof Error ? err.message.toLowerCase() : ''
      if (message.includes('cancel')) {
        setError(t('Biometric unlock was cancelled. Please enter your PIN.'))
      } else {
        setError(t('Biometric authentication failed. Please enter your PIN.'))
      }
    } finally {
      setIsUnlocking(false)
    }
  }
  
  const handlePinComplete = async (pin: string) => {
    if (isUnlocking) return

    if (lockoutUntil && lockoutUntil > Date.now()) {
      try {
        if (duressEnabled && await verifyDuressPin(pin)) {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          await performEmergencyWipe()
          return
        }
      } catch (error) {
        console.warn('Duress verification failed during lockout:', error)
      }
    
      setError(formatLockoutMessage(lockoutUntil))
      return
    }

    if (lockoutUntil && lockoutUntil <= Date.now()) {
      setLockoutUntil(null)
      await SecureStore.deleteItemAsync(PIN_LOCKOUT_UNTIL_KEY, SECURE_STORE_OPTIONS)
    }

    setError(null)
    setIsUnlocking(true)
    
    try {
      const success = await unlockVault(pin)
      
      if (success) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        await resetPinThrottleState()
        await completeUnlock()
      } else if (duressEnabled && await verifyDuressPin(pin)) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        await performEmergencyWipe()
      } else {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        await SecureStore.setItemAsync(PIN_ATTEMPTS_KEY, String(newAttempts), SECURE_STORE_OPTIONS)
        
        if (failWipeEnabled && newAttempts >= failWipeMax) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          await performEmergencyWipe()
          return
        }

        if (newAttempts >= SECURITY_CONFIG.MAX_PIN_ATTEMPTS) {
          const nextLockoutUntil = Date.now() + SECURITY_CONFIG.LOCKOUT_DURATION
          setLockoutUntil(nextLockoutUntil)
          await SecureStore.setItemAsync(
            PIN_LOCKOUT_UNTIL_KEY,
            String(nextLockoutUntil),
            SECURE_STORE_OPTIONS
          )
          setError(formatLockoutMessage(nextLockoutUntil))
        } else {
          const remaining = SECURITY_CONFIG.MAX_PIN_ATTEMPTS - newAttempts
          setError(t('lockout.remainingAttempts', { count: remaining }))
        }
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      }
    } finally {
      setIsUnlocking(false)
    }
  }
  
  const pinContent = (
    <>
      <View className={isAndroid ? 'mb-3' : 'mb-6'}>
          <SpectraLogoMark size={isAndroid && keyboardVisible ? 72 : 88} />
        </View>
        
        <Text className="text-xl font-bold text-text text-center mb-2">
          {t('Welcome to Spectra')}
        </Text>
        <Text
          className={isAndroid && keyboardVisible ? 'text-text-secondary text-center mb-5' : 'text-text-secondary text-center mb-8'}
          style={isAndroid ? styles.androidSubtitle : undefined}
        >
          {hasPendingCallUnlock
            ? t('Unlock Spectra to connect your secure call')
            : t('Enter your PIN to unlock')}
        </Text>
        
        <PinInput 
          onComplete={handlePinComplete} 
          error={error || undefined}
          disabled={isUnlocking}
        />

        {isUnlocking && (
          <View className="mt-5 items-center">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text className="text-text-secondary text-sm mt-2">
              {t('Unlocking securely...')}
            </Text>
          </View>
        )}
        
        {biometricAvailable && (
          <Button
            variant="ghost"
            size="lg"
            className="mt-6"
            onPress={tryBiometricUnlock}
            disabled={isUnlocking}
            icon={<Fingerprint size={24} color={colors.primary} />}
          >
            {t('Use Biometric')}
          </Button>
        )}
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
            <View className="px-5 items-center">
              {pinContent}
            </View>
          </ScrollView>
        ) : (
          <View className="flex-1 px-5 items-center justify-center">
            {pinContent}
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
    paddingTop: 28,
  },
  androidScrollContentKeyboard: {
    justifyContent: 'flex-start',
    paddingBottom: 180,
    paddingTop: 42,
  },
  androidSubtitle: {
    alignSelf: 'stretch',
    lineHeight: 22,
  },
})
