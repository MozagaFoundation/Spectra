/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useEffect } from 'react'
import { View, Text, ScrollView, Pressable, Alert } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Fingerprint, Clock, Lock, EyeOff, CameraOff, ChevronRight, ShieldAlert, Trash2, AlertTriangle, CheckCircle, CheckCheck } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as LocalAuthentication from 'expo-local-authentication'
import * as Haptics from 'expo-haptics'
import { Card } from '@/components/ui'
import { PinEntryScreen } from '@/components/settings/PinEntryScreen'
import { SettingRow } from '@/components/settings/SettingRow'
import { PinInput } from '@/components/wallet'
import { useWalletStore, useChatStore } from '@/store'
import { useSpectreStore } from '@/store/spectreStore'
import {
  clearBiometricUnlock,
  getBiometricUnlockState,
  storeBiometricUnlockKey,
} from '@/services/security/biometricUnlock'
import { setAppSwitcherPrivacyEnabled } from '@/services/security/appSwitcherPrivacy'
import {
  setDeliveryReceiptsEnabled as persistDeliveryReceiptsEnabled,
  setReadReceiptsEnabled as persistReadReceiptsEnabled,
} from '@/services/security/receiptPreferences'
import { useThemeColors } from '@/lib/theme'
import {
  setScreenshotProtectionEnabled,
} from '@/services/security/screenshotProtection'
import { logoutAndWipeAccount } from '@/services/accountLifecycle/accountTeardown'
import {
  clearDuressPin,
  loadDuressPinState,
  saveDuressPin,
  setDuressProtectionEnabled,
} from '@/services/security/duressPin'
import { setClearImageCacheOnLockEnabled } from '@/services/security/dataProtection'
import {
  readManagedSecurityPreferences,
  setManagedAutoLockEnabled,
  setManagedAutoLockTime,
  setManagedFailWipeAttempts,
  setManagedFailWipeEnabled,
} from '@/services/security/securityPreferences'
import {
  formatGuardedPinLockoutMessage,
  verifyPinWithAttemptGuard,
  type GuardedPinResult,
} from '@/services/security/pinAttemptGuard'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { translate } from '@/lib/i18n'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'

type PinInputMode =
  | 'biometric'
  | 'duress_auth'
  | 'duress_create'
  | 'duress_confirm'
  | null

export default function SecuritySettingsScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  useTranslation()
  const { verifyPin } = useWalletStore()
  const sessionDerivedKey = useWalletStore((state) => state._sessionDerivedKey)
  const colors = useThemeColors()
  
  const [biometricStatus, setBiometricStatus] = useState<'loading' | 'available' | 'no_hardware' | 'not_enrolled'>('loading')
  const [biometricType, setBiometricType] = useState<string>('Biometric')
  const [biometricEnabled, setBiometricEnabled] = useState(false)
  const [autoLockEnabled, setAutoLockEnabled] = useState(true)
  const [autoLockTime, setAutoLockTime] = useState('5 minutes')
  const [hideContent, setHideContent] = useState(true)
  const [screenshotProtection, setScreenshotProtection] = useState(true)
  const [deliveryReceiptsEnabled, setDeliveryReceiptsEnabledState] = useState(true)
  const [readReceiptsEnabled, setReadReceiptsEnabledState] = useState(true)
  const [clearImageCacheOnLock, setClearImageCacheOnLockState] = useState(false)
  
  const [pinInputMode, setPinInputMode] = useState<PinInputMode>(null)
  const [pinError, setPinError] = useState<string | null>(null)
  const [pendingDuressPin, setPendingDuressPin] = useState<string | null>(null)
  const [authenticatedPrimaryPinForDuress, setAuthenticatedPrimaryPinForDuress] = useState<string | null>(null)
  
  const [duressEnabled, setDuressEnabled] = useState(false)
  const [hasDuressPin, setHasDuressPin] = useState(false)
  
  const [failWipeEnabled, setFailWipeEnabled] = useState(false)
  const [failWipeAttempts, setFailWipeAttempts] = useState('10')
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const spectreApplying = useSpectreStore((state) => state.isApplying)
  const spectreSettingsLocked = spectreEnabled || spectreApplying

  const handleGuardedPinFailure = async (result: Exclude<GuardedPinResult, { status: 'valid' }>) => {
    if (result.status === 'wipe_required') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      await logoutAndWipeAccount({
        purgeBackendAccount: true,
      })
      return
    }

    if (result.status === 'locked') {
      setPinError(formatGuardedPinLockoutMessage(result.lockoutUntil, translate))
    } else {
      setPinError(translate('lockout.remainingAttempts', { ns: 'auth', count: result.remainingAttempts }))
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  }
  
  useEffect(() => {
    loadSettings()
    checkBiometrics()
  }, [])
  
  const loadSettings = async () => {
    const [
      managedSecurityPreferences,
      duressState,
    ] = await Promise.all([
      readManagedSecurityPreferences(),
      loadDuressPinState(),
    ])
    setAutoLockEnabled(managedSecurityPreferences.autoLockEnabled)
    setAutoLockTime(managedSecurityPreferences.autoLockTime)
    setHideContent(managedSecurityPreferences.appSwitcherPrivacyEnabled)
    setScreenshotProtection(managedSecurityPreferences.screenshotProtectionEnabled)
    setDeliveryReceiptsEnabledState(managedSecurityPreferences.deliveryReceiptsEnabled)
    setReadReceiptsEnabledState(managedSecurityPreferences.readReceiptsEnabled)
    setClearImageCacheOnLockState(managedSecurityPreferences.clearImageCacheOnLockEnabled)
    
    setHasDuressPin(duressState.hasDuressPin)
    setDuressEnabled(duressState.enabled)
    setFailWipeEnabled(managedSecurityPreferences.failWipeEnabled)
    setFailWipeAttempts(managedSecurityPreferences.failWipeAttempts)
  }
  
  const checkBiometrics = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync()
      
      if (!compatible) {
        setBiometricStatus('no_hardware')
        return
      }
      
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync()
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType('Face ID')
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType('Fingerprint')
      } else {
        setBiometricType('Biometric')
      }
      
      const enrolled = await LocalAuthentication.isEnrolledAsync()
      if (!enrolled) {
        setBiometricStatus('not_enrolled')
        return
      }
      
      const biometricState = await getBiometricUnlockState()
      setBiometricEnabled(biometricState.configured)
      
      setBiometricStatus('available')
    } catch (error) {
      if (__DEV__) console.log('Biometric check error:', error)
      setBiometricStatus('no_hardware')
    }
  }
  
  const handleBiometricToggle = async (enabled: boolean) => {
    if (enabled) {
      setPinInputMode('biometric')
      setPinError(null)
    } else {
      await clearBiometricUnlock()
      setBiometricEnabled(false)
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
  }
  
  const handlePinForBiometric = async (pin: string) => {
    setPinError(null)
    
    const result = await verifyPinWithAttemptGuard(pin, verifyPin)
    if (result.status !== 'valid') {
      await handleGuardedPinFailure(result)
      return
    }
    
    try {
      if (!sessionDerivedKey) {
        throw new Error(translate('Vault key unavailable', { ns: 'settings' }))
      }

      await storeBiometricUnlockKey(
        sessionDerivedKey,
        translate('Enable {{biometricType}} unlock', { ns: 'settings', biometricType }),
      )
      setBiometricEnabled(true)
      setPinInputMode(null)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (err) {
      await clearBiometricUnlock()
      setBiometricEnabled(false)
      setPinInputMode(null)
    }
  }
  
  const handleSetDuressPin = () => {
    setPinInputMode('duress_auth')
    setPinError(null)
    setPendingDuressPin(null)
    setAuthenticatedPrimaryPinForDuress(null)
  }

  const handleDuressAuth = async (pin: string) => {
    setPinError(null)

    const result = await verifyPinWithAttemptGuard(pin, verifyPin)
    if (result.status !== 'valid') {
      await handleGuardedPinFailure(result)
      return
    }

    setAuthenticatedPrimaryPinForDuress(pin)
    setPinInputMode('duress_create')
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }
  
  const handleDuressCreate = async (pin: string) => {
    setPinError(null)
    
    if (pin === authenticatedPrimaryPinForDuress) {
      setPinError(translate('Duress PIN must be different from your real PIN', { ns: 'settings' }))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }
    
    setPendingDuressPin(pin)
    setPinInputMode('duress_confirm')
    setPinError(null)
  }
  
  const handleDuressConfirm = async (pin: string) => {
    if (pin !== pendingDuressPin) {
      setPinError(translate('PINs do not match', { ns: 'settings' }))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }
    
    await saveDuressPin(pin)
    setDuressEnabled(true)
    setHasDuressPin(true)
    setPinInputMode(null)
    setPendingDuressPin(null)
    setAuthenticatedPrimaryPinForDuress(null)
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }
  
  const handleDuressToggle = async (enabled: boolean) => {
    if (enabled && !hasDuressPin) {
      handleSetDuressPin()
      return
    }

    if (!enabled) {
      await clearDuressPin()
      setDuressEnabled(false)
      setHasDuressPin(false)
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      return
    }

    await setDuressProtectionEnabled(true)
    setDuressEnabled(true)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }
  
  const handleRemoveDuressPin = () => {
    Alert.alert(
      translate('Remove Duress PIN', { ns: 'settings' }),
      translate('Are you sure you want to remove the duress PIN?', { ns: 'settings' }),
      [
        { text: translate('Cancel', { ns: 'common' }), style: 'cancel' },
        {
          text: translate('Remove', { ns: 'common' }),
          style: 'destructive',
          onPress: async () => {
            await clearDuressPin()
            setDuressEnabled(false)
            setHasDuressPin(false)
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
          },
        },
      ]
    )
  }
  
  const handleFailWipeToggle = async (enabled: boolean) => {
    setFailWipeEnabled(enabled)
    await setManagedFailWipeEnabled(enabled, failWipeAttempts)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }
  
  const handleFailWipeAttemptsChange = () => {
    const setAttempts = async (value: string) => {
      setFailWipeAttempts(value)
      await setManagedFailWipeAttempts(value)
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
    
    Alert.alert(
      translate('Failed Attempts Limit', { ns: 'settings' }),
      translate('Erase all data after this many failed PIN attempts', { ns: 'settings' }),
      [
        { text: translate('{{count}} attempts', { ns: 'settings', count: 3 }), onPress: () => setAttempts('3') },
        { text: translate('{{count}} attempts', { ns: 'settings', count: 5 }), onPress: () => setAttempts('5') },
        { text: translate('{{count}} attempts', { ns: 'settings', count: 10 }), onPress: () => setAttempts('10') },
        { text: translate('{{count}} attempts', { ns: 'settings', count: 15 }), onPress: () => setAttempts('15') },
        { text: translate('{{count}} attempts', { ns: 'settings', count: 20 }), onPress: () => setAttempts('20') },
        { text: translate('Cancel', { ns: 'common' }), style: 'cancel' },
      ]
    )
  }
  
  const handleChangePin = () => {
    router.push('/(main)/settings/change-pin')
  }
  
  const handleAutoLockTime = () => {
    const setTime = async (time: string) => {
      setAutoLockTime(time)
      await setManagedAutoLockTime(time)
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
    
    Alert.alert(
      translate('Auto-Lock Time', { ns: 'settings' }),
      translate('Choose when to automatically lock the app', { ns: 'settings' }),
      [
        { text: translate('Immediately', { ns: 'settings' }), onPress: () => setTime('Immediately') },
        { text: translate('1 minute', { ns: 'settings' }), onPress: () => setTime('1 minute') },
        { text: translate('5 minutes', { ns: 'settings' }), onPress: () => setTime('5 minutes') },
        { text: translate('15 minutes', { ns: 'settings' }), onPress: () => setTime('15 minutes') },
        { text: translate('1 hour', { ns: 'settings' }), onPress: () => setTime('1 hour') },
        { text: translate('Cancel', { ns: 'common' }), style: 'cancel' },
      ]
    )
  }
  
  const handleAutoLockToggle = async (enabled: boolean) => {
    setAutoLockEnabled(enabled)
    await setManagedAutoLockEnabled(enabled)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }
  
  const handleHideContentToggle = async (enabled: boolean) => {
    setHideContent(enabled)
    await setAppSwitcherPrivacyEnabled(enabled)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const handleClearImageCacheOnLockToggle = async (enabled: boolean) => {
    try {
      await setClearImageCacheOnLockEnabled(enabled)
      setClearImageCacheOnLockState(enabled)
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(
        translate('Could not update cache privacy', { ns: 'settings' }),
        getErrorDisplayMessage(error),
      )
    }
  }

  const handleDeliveryReceiptsToggle = async (enabled: boolean) => {
    setDeliveryReceiptsEnabledState(enabled)
    await persistDeliveryReceiptsEnabled(enabled)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const handleReadReceiptsToggle = async (enabled: boolean) => {
    setReadReceiptsEnabledState(enabled)
    await persistReadReceiptsEnabled(enabled)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const handleScreenshotProtectionToggle = async (enabled: boolean) => {
    setScreenshotProtection(enabled)
    await setScreenshotProtectionEnabled(enabled)
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)

    // Sync the preference with active direct chats.
    const { conversations } = useChatStore.getState()
    const recipientIdentityIds = conversations
      .filter((conv) => conv.remoteIdentityId && !conv.type)
      .map((conv) => conv.remoteIdentityId)
    import('@/services/quantumChat').then(({ syncScreenshotProtectionStateForRecipients }) => {
      syncScreenshotProtectionStateForRecipients(
        recipientIdentityIds,
        enabled,
        'security_settings',
      ).catch(() => {})
    }).catch(() => {})
  }
  
  if (pinInputMode === 'biometric') {
    return (
      <PinEntryScreen
        title={translate('Enter PIN', { ns: 'settings' })}
        onBack={() => setPinInputMode(null)}
        icon={<Fingerprint size={32} color={colors.primary} />}
        iconBackgroundColor={colors.primary + '26'}
        heading={translate('Enable {{biometricType}}', { ns: 'settings', biometricType })}
        description={translate('Enter your PIN to enable {{biometricType}} unlock', {
          ns: 'settings',
          biometricType,
        })}
      >
        <PinInput
          key="biometric-pin"
          onComplete={handlePinForBiometric}
          error={pinError || undefined}
        />
      </PinEntryScreen>
    )
  }

  if (pinInputMode === 'duress_auth') {
    return (
      <PinEntryScreen
        title={translate('Enter PIN', { ns: 'settings' })}
        onBack={() => {
          setPinInputMode(null)
          setAuthenticatedPrimaryPinForDuress(null)
        }}
        icon={<ShieldAlert size={32} color={colors.error} />}
        iconBackgroundColor={colors.error + '26'}
        heading={translate('Verify Primary PIN', { ns: 'settings' })}
        description={translate('Enter your current PIN before creating a duress PIN', {
          ns: 'settings',
        })}
      >
        <PinInput
          key="duress-auth-pin"
          onComplete={handleDuressAuth}
          error={pinError || undefined}
          label={translate('Enter your current PIN', { ns: 'settings' })}
        />
      </PinEntryScreen>
    )
  }
  
  if (pinInputMode === 'duress_create') {
    return (
      <PinEntryScreen
        title={translate('Set Duress PIN', { ns: 'settings' })}
        onBack={() => {
          setPinInputMode(null)
          setAuthenticatedPrimaryPinForDuress(null)
        }}
        icon={<ShieldAlert size={32} color={colors.error} />}
        iconBackgroundColor={colors.error + '26'}
        heading={translate('Create Duress PIN', { ns: 'settings' })}
        description={translate('This PIN will erase all messages and log you out when entered at the unlock screen', {
          ns: 'settings',
        })}
        descriptionClassName="text-text-secondary text-center mb-8 max-w-[280px]"
      >
        <PinInput
          key="duress-create-pin"
          onComplete={handleDuressCreate}
          error={pinError || undefined}
          label={translate('Enter a 6-digit duress PIN', { ns: 'settings' })}
        />
      </PinEntryScreen>
    )
  }
  
  if (pinInputMode === 'duress_confirm') {
    return (
      <PinEntryScreen
        title={translate('Confirm Duress PIN', { ns: 'settings' })}
        onBack={() => { setPinInputMode('duress_create'); setPendingDuressPin(null) }}
        icon={<ShieldAlert size={32} color={colors.error} />}
        iconBackgroundColor={colors.error + '26'}
        heading={translate('Confirm Duress PIN', { ns: 'settings' })}
        description={translate('Re-enter the duress PIN to confirm', { ns: 'settings' })}
      >
        <PinInput
          key="duress-confirm-pin"
          onComplete={handleDuressConfirm}
          error={pinError || undefined}
          label={translate('Re-enter duress PIN', { ns: 'settings' })}
        />
      </PinEntryScreen>
    )
  }

  return (
    <View className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      <ScrollView 
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View
          className="flex-row items-center px-4 py-3"
          style={{ paddingTop: insets.top }}
        >
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="flex-1 text-xl font-bold text-text text-center mr-8">
            {translate('Security', { ns: 'settings' })}
          </Text>
        </View>
        
        <View className="px-5 gap-6">
          <View className="gap-3">
            <Text className="text-text-secondary text-sm font-medium ml-1">
              {translate('Authentication', { ns: 'settings' })}
            </Text>
            <Card className="p-4 gap-4">
              <SettingRow
                icon={Lock}
                title="Change PIN"
                subtitle="Update your 6-digit PIN"
                onPress={handleChangePin}
              />
              
              <View className="border-t border-border pt-4">
                {biometricStatus === 'loading' && (
                  <SettingRow
                    icon={Fingerprint}
                    title="Biometric Unlock"
                    subtitle="Checking availability..."
                    value={false}
                    onValueChange={() => {}}
                    disabled
                  />
                )}
                
                {biometricStatus === 'available' && (
                  <SettingRow
                    icon={Fingerprint}
                    title={biometricType}
                    subtitle={spectreEnabled
                      ? translate('{{biometricType}} unlock is disabled by Spectre Mode', {
                          ns: 'settings',
                          biometricType,
                        })
                      : translate('Unlock with {{biometricType}}', {
                          ns: 'settings',
                          biometricType,
                        })}
                    value={spectreEnabled ? false : biometricEnabled}
                    onValueChange={handleBiometricToggle}
                    disabled={spectreSettingsLocked}
                  />
                )}
                
                {biometricStatus === 'not_enrolled' && (
                  <SettingRow
                    icon={Fingerprint}
                    title={biometricType}
                    subtitle={translate('Unlock with {{biometricType}}', {
                      ns: 'settings',
                      biometricType,
                    })}
                    value={false}
                    onValueChange={() => {
                      if (spectreSettingsLocked) {
                        return
                      }
                      Alert.alert(
                        translate('{{biometricType}} Not Set Up', {
                          ns: 'settings',
                          biometricType,
                        }),
                        translate('Please set up {{biometricType}} in your device Settings app first, then return here to enable it.', {
                          ns: 'settings',
                          biometricType,
                        }),
                        [{ text: translate('OK', { ns: 'settings' }) }]
                      )
                    }}
                    disabled={spectreSettingsLocked}
                  />
                )}
                
                {biometricStatus === 'no_hardware' && (
                  <SettingRow
                    icon={Fingerprint}
                    title="Biometric Unlock"
                    subtitle="Not supported on this device"
                    value={false}
                    onValueChange={() => {}}
                    disabled
                  />
                )}
              </View>
            </Card>
          </View>
          
          <View className="gap-3">
            <Text className="text-text-secondary text-sm font-medium ml-1">
              {translate('Duress Protection', { ns: 'settings' })}
            </Text>
            <Card className="p-4 gap-4">
              <SettingRow
                icon={ShieldAlert}
                title="Duress PIN"
                subtitle={spectreEnabled ? 'Required by Spectre Mode' : 'Erases backend and device data'}
                value={duressEnabled}
                onValueChange={handleDuressToggle}
                disabled={spectreSettingsLocked}
                danger
              />
              
              {duressEnabled && hasDuressPin && (
                <View className="border-t border-border pt-4 gap-4">
                  <SettingRow
                    icon={Lock}
                    title="Change Duress PIN"
                    subtitle="Set a new duress PIN"
                    onPress={handleSetDuressPin}
                    danger
                  />
                  {!spectreSettingsLocked && (
                    <SettingRow
                      icon={Trash2}
                      title="Remove Duress PIN"
                      subtitle="Disable duress protection"
                      onPress={handleRemoveDuressPin}
                      danger
                    />
                  )}
                </View>
              )}
            </Card>
            
            <Card className="p-3 border border-warning">
              <View className="flex-row gap-3">
                <AlertTriangle size={16} color={colors.warning} />
                <Text className="text-text-secondary text-xs flex-1 leading-4">
                  {translate('Entering the duress PIN will attempt to delete backend account data, wipe this device, and immediately sign you out.', {
                    ns: 'settings',
                  })}
                </Text>
              </View>
            </Card>
          </View>
          
          <View className="gap-3">
            <Text className="text-text-secondary text-sm font-medium ml-1">
              {translate('Data Protection', { ns: 'settings' })}
            </Text>
            <Card className="p-4 gap-4">
              <SettingRow
                icon={Trash2}
                title="Erase After Failed Attempts"
                subtitle={spectreEnabled ? 'Managed by Spectre Mode' : 'Automatically erase data after multiple incorrect PIN tries'}
                value={failWipeEnabled}
                onValueChange={handleFailWipeToggle}
                disabled={spectreSettingsLocked}
                danger
              />
              
              {failWipeEnabled && (
                <View className="border-t border-border pt-4">
                  <Pressable 
                    onPress={spectreSettingsLocked ? undefined : handleFailWipeAttemptsChange}
                    className={`flex-row items-center justify-between ${spectreSettingsLocked ? 'opacity-50' : 'active:opacity-70'}`}
                    disabled={spectreSettingsLocked}
                  >
                    <Text className="text-text">{translate('Erase after', { ns: 'settings' })}</Text>
                    <View className="flex-row items-center gap-1">
                      <Text className="text-error font-medium">
                        {translate('{{count}} attempts', { ns: 'settings', count: Number.parseInt(failWipeAttempts, 10) })}
                      </Text>
                      <ChevronRight size={16} color={colors.textMuted} />
                    </View>
                  </Pressable>
                </View>
              )}
            </Card>
            
            <Card className="p-3 border border-error">
              <View className="flex-row gap-3">
                <AlertTriangle size={16} color={colors.error} />
                <Text className="text-text-secondary text-xs flex-1 leading-4">
                  {translate('All data will be permanently deleted once the attempt limit is reached. This cannot be undone.', {
                    ns: 'settings',
                  })}
                </Text>
              </View>
            </Card>
          </View>
          
          <View className="gap-3">
            <Text className="text-text-secondary text-sm font-medium ml-1">
              {translate('Auto-Lock', { ns: 'settings' })}
            </Text>
            <Card className="p-4 gap-4">
              <SettingRow
                icon={Clock}
                title="Auto-Lock"
                subtitle={spectreEnabled ? 'Managed by Spectre Mode' : 'Lock when inactive'}
                value={autoLockEnabled}
                onValueChange={handleAutoLockToggle}
                disabled={spectreSettingsLocked}
              />
              
              {autoLockEnabled && (
                <View className="border-t border-border pt-4">
                  <Pressable 
                    onPress={spectreSettingsLocked ? undefined : handleAutoLockTime}
                    className={`flex-row items-center justify-between ${spectreSettingsLocked ? 'opacity-50' : 'active:opacity-70'}`}
                    disabled={spectreSettingsLocked}
                  >
                    <Text className="text-text">{translate('Lock after', { ns: 'settings' })}</Text>
                    <View className="flex-row items-center gap-1">
                      <Text className="text-primary font-medium">
                        {translate(autoLockTime, { ns: 'settings' })}
                      </Text>
                      <ChevronRight size={16} color={colors.textMuted} />
                    </View>
                  </Pressable>
                </View>
              )}
            </Card>
          </View>
          
          <View className="gap-3">
            <Text className="text-text-secondary text-sm font-medium ml-1">
              {translate('Privacy', { ns: 'settings' })}
            </Text>
            <Card className="p-4 gap-4">
              <SettingRow
                icon={CheckCircle}
                title="Delivery Receipts"
                subtitle={spectreEnabled ? 'Managed by Spectre Mode' : 'Send delivery receipts when you receive messages.'}
                value={deliveryReceiptsEnabled}
                onValueChange={handleDeliveryReceiptsToggle}
                disabled={spectreSettingsLocked}
              />
              <View className="border-t border-border pt-4">
                <SettingRow
                  icon={CheckCheck}
                  title="Read Receipts"
                  subtitle={spectreEnabled ? 'Managed by Spectre Mode' : 'Send read receipts when you open messages.'}
                  value={readReceiptsEnabled}
                  onValueChange={handleReadReceiptsToggle}
                  disabled={spectreSettingsLocked}
                />
              </View>
              <View className="border-t border-border pt-4">
              <SettingRow
                icon={CameraOff}
                title="Screenshot Protection"
                subtitle={spectreEnabled ? 'Managed by Spectre Mode' : 'Prevent screenshots and screen recordings on both ends'}
                value={screenshotProtection}
                onValueChange={handleScreenshotProtectionToggle}
                disabled={spectreSettingsLocked}
              />
              </View>
              <View className="border-t border-border pt-4">
                <SettingRow
                  icon={EyeOff}
                  title="App Switcher Privacy"
                  subtitle={spectreEnabled ? 'Managed by Spectre Mode' : 'Hide content when the app is backgrounded'}
                  value={hideContent}
                  onValueChange={handleHideContentToggle}
                  disabled={spectreSettingsLocked}
                />
              </View>
              <View className="border-t border-border pt-4">
                <SettingRow
                  icon={CameraOff}
                  title="Clear Visual Media on Lock"
                  subtitle={spectreEnabled ? 'Always cleared by Spectre Mode' : 'Clear avatar and media preview caches when the app locks.'}
                  value={spectreEnabled ? true : clearImageCacheOnLock}
                  onValueChange={handleClearImageCacheOnLockToggle}
                  disabled={spectreSettingsLocked}
                />
              </View>
            </Card>
          </View>
          
          <Card className="p-4 border border-border">
            <Text className="text-text-secondary text-sm leading-5">
              {translate('Your account is secured using industry-standard encryption. Private keys remain on your device and are stored with platform secure storage.', {
                ns: 'settings',
              })}
            </Text>
          </Card>
        </View>
      </ScrollView>
    </View>
  )
}
