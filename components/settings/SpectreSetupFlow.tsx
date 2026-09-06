/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import {
  AlertTriangle,
  CheckCheck,
  CheckCircle,
  ChevronLeft,
  RefreshCw,
  Shield,
  ShieldAlert,
  Zap,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'

import { PinEntryScreen } from '@/components/settings/PinEntryScreen'
import { Button, Card } from '@/components/ui'
import { MnemonicDisplay, MnemonicInput, PinInput } from '@/components/wallet'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { translate } from '@/lib/i18n'
import {
  getMnemonicValidationDisplayMessage,
  isMnemonicValidationError,
} from '@/lib/mnemonicValidation'
import { useThemeColors } from '@/lib/theme'
import type { EXOWallet } from '@/lib/types'
import { logoutAndWipeAccount } from '@/services/accountLifecycle/accountTeardown'
import { loadDuressPinState, saveDuressPin } from '@/services/security/duressPin'
import {
  formatGuardedPinLockoutMessage,
  verifyPinWithAttemptGuard,
  type GuardedPinResult,
} from '@/services/security/pinAttemptGuard'
import { acquireSensitiveScreenProtection } from '@/services/security/screenCaptureProtection'
import {
  configureBundledSpectreWallet,
  createExpendableSpectreWallet,
  createPersistentGeneratedSpectreWallet,
  enableSpectreMode,
  ensureSpectreWalletFromMnemonic,
  getSpectreSetupRequirements,
  preIssueExpendableSpectreActivationToken,
  registerPreparedSpectreWallet,
} from '@/services/security/spectreMode'
import { useWalletStore } from '@/store'
import { useSpectreStore } from '@/store/spectreStore'

type PinMode = 'duress_auth' | 'duress_create' | 'duress_confirm' | null
type SetupMode = 'mnemonic' | 'persistent_generated' | 'expendable' | null
type ActivationPreparationStage =
  | 'prepare_account'
  | 'reserve_activation'
  | 'register_account'
  | null

interface SpectreSetupFlowProps {
  onClose: () => void
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

export function SpectreSetupFlow({ onClose }: SpectreSetupFlowProps) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const verifyPin = useWalletStore((state) => state.verifyPin)
  const enabled = useSpectreStore((state) => state.enabled)
  const applying = useSpectreStore((state) => state.isApplying)
  const accountMode = useSpectreStore((state) => state.spectreAccountMode)
  const startActivation = useSpectreStore((state) => state.startActivation)
  const resetActivationProgress = useSpectreStore((state) => state.resetActivationProgress)
  const setThemePreviewActive = useSpectreStore((state) => state.setThemePreviewActive)

  const [loading, setLoading] = useState(true)
  const [setupReady, setSetupReady] = useState(false)
  const [pinMode, setPinMode] = useState<PinMode>(null)
  const [pinError, setPinError] = useState<string | null>(null)
  const [pendingDuressPin, setPendingDuressPin] = useState<string | null>(null)
  const [authenticatedPrimaryPin, setAuthenticatedPrimaryPin] = useState<string | null>(null)
  const [hasDuressPin, setHasDuressPin] = useState(false)
  const [setupMode, setSetupMode] = useState<SetupMode>(null)
  const [hasExistingWallet, setHasExistingWallet] = useState(false)
  const [useExistingWallet, setUseExistingWallet] = useState(false)
  const [mnemonic, setMnemonic] = useState('')
  const [mnemonicComplete, setMnemonicComplete] = useState(false)
  const [preparedWallet, setPreparedWallet] = useState<EXOWallet | null>(null)
  const [generatedMnemonic, setGeneratedMnemonic] = useState('')
  const [generatingAccount, setGeneratingAccount] = useState(false)
  const [preparingActivation, setPreparingActivation] = useState(false)
  const [activationPreparationStage, setActivationPreparationStage] =
    useState<ActivationPreparationStage>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [sensitiveProtectionReady, setSensitiveProtectionReady] = useState(false)
  const [sensitiveProtectionError, setSensitiveProtectionError] = useState<string | null>(null)
  const mountedRef = useRef(true)
  const initialAccountModeRef = useRef(accountMode)
  const initiallyUnavailableRef = useRef(enabled || applying)

  const selectedMnemonicMode = setupMode === 'mnemonic'
  const selectedGeneratedMode = setupMode === 'persistent_generated'
  const selectedExpendableMode = setupMode === 'expendable'
  const sensitiveContentRequested = Boolean(
    pinMode
    || (selectedMnemonicMode && !hasExistingWallet)
    || (
      selectedGeneratedMode
      && !hasExistingWallet
      && generatedMnemonic
      && !generatingAccount
    ),
  )
  useEffect(() => {
    let cancelled = false

    const prepare = async () => {
      if (initiallyUnavailableRef.current) {
        setLoading(false)
        onClose()
        return
      }

      try {
        const [duressState, requirements] = await Promise.all([
          loadDuressPinState(),
          getSpectreSetupRequirements(),
        ])
        if (cancelled) return
        const existingMode =
          requirements.existingAccountMode
          ?? initialAccountModeRef.current
          ?? 'mnemonic'
        setHasDuressPin(duressState.hasDuressPin)
        setSetupMode(requirements.hasExistingWallet ? existingMode : null)
        setHasExistingWallet(requirements.hasExistingWallet)
        setUseExistingWallet(requirements.hasExistingWallet)
        setSetupReady(true)
        setThemePreviewActive(true)
      } catch (error) {
        if (!cancelled) {
          setSetupError(getErrorDisplayMessage(error))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void prepare()
    return () => {
      cancelled = true
      mountedRef.current = false
      setThemePreviewActive(false)
    }
  }, [onClose, setThemePreviewActive])

  useEffect(() => {
    if (!sensitiveContentRequested) {
      setSensitiveProtectionReady(false)
      setSensitiveProtectionError(null)
      return
    }

    let cancelled = false
    let releaseProtection: (() => Promise<void>) | null = null
    setSensitiveProtectionReady(false)
    setSensitiveProtectionError(null)

    void acquireSensitiveScreenProtection()
      .then(async (release) => {
        if (cancelled) {
          await release()
          return
        }
        releaseProtection = release
        setSensitiveProtectionReady(true)
      })
      .catch((error) => {
        if (!cancelled) {
          setSensitiveProtectionError(getErrorDisplayMessage(error))
        }
      })

    return () => {
      cancelled = true
      if (releaseProtection) void releaseProtection()
    }
  }, [sensitiveContentRequested])

  const handleGuardedPinFailure = async (
    result: Exclude<GuardedPinResult, { status: 'valid' }>,
  ) => {
    if (result.status === 'wipe_required') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      await logoutAndWipeAccount({
        purgeBackendAccount: true,
      })
      return
    }

    setPinError(
      result.status === 'locked'
        ? formatGuardedPinLockoutMessage(result.lockoutUntil, translate)
        : translate('lockout.remainingAttempts', {
            ns: 'auth',
            count: result.remainingAttempts,
          }),
    )
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  }

  const closePinFlow = () => {
    setPinMode(null)
    setAuthenticatedPrimaryPin(null)
    setPendingDuressPin(null)
    setPinError(null)
  }

  const beginDuressSetup = () => {
    setPinError(null)
    setPendingDuressPin(null)
    setAuthenticatedPrimaryPin(null)
    setPinMode('duress_auth')
  }

  const handleDuressAuth = async (pin: string) => {
    setPinError(null)
    const result = await verifyPinWithAttemptGuard(pin, verifyPin)
    if (result.status !== 'valid') {
      await handleGuardedPinFailure(result)
      return
    }

    setAuthenticatedPrimaryPin(pin)
    setPinMode('duress_create')
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }

  const handleDuressCreate = async (pin: string) => {
    setPinError(null)
    if (pin === authenticatedPrimaryPin) {
      setPinError(translate('Duress PIN must be different from your real PIN', { ns: 'settings' }))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    setPendingDuressPin(pin)
    setPinMode('duress_confirm')
  }

  const handleDuressConfirm = async (pin: string) => {
    if (pin !== pendingDuressPin) {
      setPinError(translate('PINs do not match', { ns: 'settings' }))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    await saveDuressPin(pin)
    setHasDuressPin(true)
    closePinFlow()
    setSetupError(null)
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  }

  const selectSetupMode = async (mode: Exclude<SetupMode, null>) => {
    setSetupMode(mode)
    setUseExistingWallet(false)
    setMnemonic('')
    setMnemonicComplete(false)
    setPreparedWallet(null)
    setGeneratedMnemonic('')
    setSetupError(null)

    if (mode !== 'persistent_generated' && mode !== 'expendable') return

    setGeneratingAccount(true)
    try {
      await waitForNextFrame()
      const prepared = mode === 'persistent_generated'
        ? await createPersistentGeneratedSpectreWallet()
        : await createExpendableSpectreWallet()
      if (!mountedRef.current) return
      setPreparedWallet(prepared.wallet)
      setGeneratedMnemonic(mode === 'persistent_generated' ? prepared.mnemonic : '')
    } catch (error) {
      setSetupError(getErrorDisplayMessage(error))
    } finally {
      setGeneratingAccount(false)
    }
  }

  const selectExistingWallet = () => {
    setUseExistingWallet(true)
    setSetupMode(accountMode ?? 'mnemonic')
    setSetupError(null)
    setMnemonic('')
    setMnemonicComplete(false)
    setPreparedWallet(null)
    setGeneratedMnemonic('')
  }

  const enableSpectre = async () => {
    if (preparingActivation || applying) return

    setSetupError(null)
    setPreparingActivation(true)
    setActivationPreparationStage('prepare_account')
    let activationStarted = false

    try {
      await waitForNextFrame()
      if (useExistingWallet) {
        const existingWallet = await configureBundledSpectreWallet()
        if (useSpectreStore.getState().spectreAccountMode === 'expendable') {
          setActivationPreparationStage('reserve_activation')
          await preIssueExpendableSpectreActivationToken(existingWallet)
        }
      } else if (setupMode === 'mnemonic') {
        await ensureSpectreWalletFromMnemonic(mnemonic)
      } else if (setupMode === 'persistent_generated') {
        if (!preparedWallet) {
          throw new Error(translate('Generate a Spectre account before continuing.', { ns: 'settings' }))
        }
        setActivationPreparationStage('register_account')
        await registerPreparedSpectreWallet(preparedWallet, 'persistent_generated')
      } else if (setupMode === 'expendable') {
        if (!preparedWallet) {
          throw new Error(translate('Prepare an expendable Spectre account before continuing.', { ns: 'settings' }))
        }
        setActivationPreparationStage('reserve_activation')
        await preIssueExpendableSpectreActivationToken(preparedWallet)
        setActivationPreparationStage('register_account')
        await registerPreparedSpectreWallet(preparedWallet, 'expendable')
      } else {
        throw new Error(translate('Choose how to create your Spectre account.', { ns: 'settings' }))
      }

      startActivation('enable', 'prepare_account')
      activationStarted = true
      onClose()
      await enableSpectreMode()
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (error) {
      const message = isMnemonicValidationError(error)
        ? getMnemonicValidationDisplayMessage(
            error,
            (key, options) => translate(key, { ns: 'auth', ...options }),
          )
        : getErrorDisplayMessage(error)
      const activationState = useSpectreStore.getState()
      if (!activationStarted) {
        setActivationPreparationStage(null)
        setSetupError(message)
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        return
      }
      const failedBeforeManagedHandoff =
        activationState.activationFlow === 'enable'
        && activationState.activationPhase === 'prepare_account'
        && !activationState.activationError

      if (failedBeforeManagedHandoff) {
        resetActivationProgress()
        setSetupError(message)
      } else if (
        activationState.activationFlow === 'enable'
        && !activationState.activationError
      ) {
        activationState.failActivation(message)
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      if (mountedRef.current) {
        setPreparingActivation(false)
        setActivationPreparationStage(null)
      }
    }
  }

  const renderActivationPreparation = () => {
    const steps: Array<{
      id: Exclude<ActivationPreparationStage, null>
      label: string
    }> = [
      {
        id: 'prepare_account',
        label: translate('Preparing your Spectre account', { ns: 'settings' }),
      },
      {
        id: 'reserve_activation',
        label: translate('Reserving private activation', { ns: 'settings' }),
      },
      {
        id: 'register_account',
        label: translate('Registering the private account', { ns: 'settings' }),
      },
    ]
    const currentIndex = Math.max(
      0,
      steps.findIndex((step) => step.id === activationPreparationStage),
    )

    return (
      <View
        className="flex-1 bg-background"
        style={{ backgroundColor: colors.background, paddingTop: insets.top }}
        testID="spectre-activation-preparation"
      >
        <View className="flex-1 justify-center px-6 gap-6">
          <View className="items-center gap-3">
            <View
              className="w-16 h-16 rounded-2xl items-center justify-center"
              style={{ backgroundColor: colors.primary + '20' }}
            >
              <Shield size={30} color={colors.primary} />
            </View>
            <Text className="text-2xl font-bold text-text text-center">
              {translate('Preparing Spectre Mode', { ns: 'settings' })}
            </Text>
            <Text className="text-text-secondary text-center">
              {translate('Keep this screen open while EXO prepares the secure activation handoff.', {
                ns: 'settings',
              })}
            </Text>
          </View>

          <Card className="p-4 gap-4">
            {steps.map((step, index) => {
              const completed = index < currentIndex
              const current = index === currentIndex
              return (
                <View key={step.id} className="flex-row items-center gap-3">
                  {completed ? (
                    <CheckCircle size={20} color={colors.success} />
                  ) : current ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <View
                      className="w-5 h-5 rounded-full border"
                      style={{ borderColor: colors.border }}
                    />
                  )}
                  <Text
                    className="flex-1 text-sm"
                    style={{
                      color: current || completed ? colors.text : colors.textMuted,
                      fontWeight: current ? '600' : '400',
                    }}
                  >
                    {step.label}
                  </Text>
                </View>
              )
            })}
          </Card>
        </View>
      </View>
    )
  }

  const renderSensitiveProtectionGate = () => (
    <View
      className="flex-1 items-center justify-center px-5"
      style={{ backgroundColor: colors.background }}
    >
      {sensitiveProtectionError ? (
        <Card className="p-4 border border-error w-full gap-4">
          <Text className="text-text font-medium">
            {translate('Failed to prepare Spectre Mode', { ns: 'settings' })}
          </Text>
          <Text className="text-error text-sm">{sensitiveProtectionError}</Text>
          <Button variant="secondary" fullWidth onPress={closePinFlow}>
            {translate('Back', { ns: 'common' })}
          </Button>
        </Card>
      ) : (
        <View className="w-full gap-4 items-center">
          <ActivityIndicator color={colors.primary} />
          <Button variant="secondary" fullWidth onPress={closePinFlow}>
            {translate('Back', { ns: 'common' })}
          </Button>
        </View>
      )}
    </View>
  )

  if (pinMode && !sensitiveProtectionReady) {
    return renderSensitiveProtectionGate()
  }

  if (pinMode === 'duress_auth') {
    return (
      <PinEntryScreen
        title={translate('Enter PIN', { ns: 'settings' })}
        onBack={closePinFlow}
        icon={<ShieldAlert size={32} color={colors.error} />}
        iconBackgroundColor={colors.error + '26'}
        heading={translate('Verify Primary PIN', { ns: 'settings' })}
        description={translate('Enter your current PIN before creating a duress PIN', {
          ns: 'settings',
        })}
      >
        <PinInput
          key="spectre-duress-auth-pin"
          onComplete={handleDuressAuth}
          error={pinError || undefined}
          label={translate('Enter your current PIN', { ns: 'settings' })}
        />
      </PinEntryScreen>
    )
  }

  if (pinMode === 'duress_create') {
    return (
      <PinEntryScreen
        title={translate('Set Duress PIN', { ns: 'settings' })}
        onBack={closePinFlow}
        icon={<ShieldAlert size={32} color={colors.error} />}
        iconBackgroundColor={colors.error + '26'}
        heading={translate('Create Duress PIN', { ns: 'settings' })}
        description={translate('This PIN will erase all messages and log you out when entered at the unlock screen', {
          ns: 'settings',
        })}
      >
        <PinInput
          key="spectre-duress-create-pin"
          onComplete={handleDuressCreate}
          error={pinError || undefined}
          label={translate('Enter a 6-digit duress PIN', { ns: 'settings' })}
        />
      </PinEntryScreen>
    )
  }

  if (pinMode === 'duress_confirm') {
    return (
      <PinEntryScreen
        title={translate('Confirm Duress PIN', { ns: 'settings' })}
        onBack={() => {
          setPinMode('duress_create')
          setPendingDuressPin(null)
        }}
        icon={<ShieldAlert size={32} color={colors.error} />}
        iconBackgroundColor={colors.error + '26'}
        heading={translate('Confirm Duress PIN', { ns: 'settings' })}
        description={translate('Re-enter the duress PIN to confirm', { ns: 'settings' })}
      >
        <PinInput
          key="spectre-duress-confirm-pin"
          onComplete={handleDuressConfirm}
          error={pinError || undefined}
          label={translate('Re-enter duress PIN', { ns: 'settings' })}
        />
      </PinEntryScreen>
    )
  }

  if (activationPreparationStage) {
    return renderActivationPreparation()
  }

  const setupBusy = applying || generatingAccount || preparingActivation
  const canEnable = hasDuressPin && (
    (hasExistingWallet && useExistingWallet)
    || (selectedMnemonicMode && mnemonicComplete)
    || (selectedGeneratedMode && Boolean(preparedWallet && generatedMnemonic))
    || (selectedExpendableMode && Boolean(preparedWallet))
  ) && !generatingAccount

  return (
    <View
      className="flex-1 bg-background"
      style={{ backgroundColor: colors.background }}
      testID="spectre-setup-flow"
    >
      <View className="flex-row items-center px-4 py-3" style={{ paddingTop: insets.top }}>
        <Pressable
          onPress={setupBusy ? undefined : onClose}
          className="p-2 -ml-2"
          disabled={setupBusy}
        >
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-text text-center mr-8">
          {translate('Spectre Setup', { ns: 'settings' })}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-5 gap-5">
          <View className="items-center px-2 pt-2">
            <View
              className="w-16 h-16 rounded-2xl items-center justify-center mb-4"
              style={{ backgroundColor: colors.primary + '20' }}
            >
              <Shield size={30} color={colors.primary} />
            </View>
            <Text className="text-2xl font-bold text-text text-center mb-2">
              {translate('Finish Spectre Mode Setup', { ns: 'settings' })}
            </Text>
            <Text className="text-text-secondary text-center">
              {translate('Spectre uses a separate EXO identity, forces stronger device protections, routes supported Spectra network requests through Tor, and disables higher-risk features while active.', {
                ns: 'settings',
              })}
            </Text>
          </View>

          {loading ? (
            <Card className="p-6 items-center">
              <ActivityIndicator color={colors.primary} />
            </Card>
          ) : !setupReady ? (
            <Card className="p-4 border border-error">
              <View className="flex-row gap-3">
                <AlertTriangle size={18} color={colors.error} />
                <View className="flex-1">
                  <Text className="text-text font-medium">
                    {translate('Failed to prepare Spectre Mode', { ns: 'settings' })}
                  </Text>
                  <Text className="text-error text-sm mt-1">
                    {setupError}
                  </Text>
                </View>
              </View>
            </Card>
          ) : (
            <>
              <Card className="p-4 gap-4">
                <View className="flex-row items-start gap-3">
                  {hasDuressPin ? (
                    <CheckCircle size={18} color={colors.success} />
                  ) : (
                    <AlertTriangle size={18} color={colors.warning} />
                  )}
                  <View className="flex-1">
                    <Text className="text-text font-medium">
                      {translate('Duress PIN', { ns: 'settings' })}
                    </Text>
                    <Text className="text-text-secondary text-sm">
                      {hasDuressPin
                        ? translate('Configured and ready. Spectre will force it on.', { ns: 'settings' })
                        : translate('Required before Spectre can be enabled.', { ns: 'settings' })}
                    </Text>
                  </View>
                </View>
              </Card>

              {!hasDuressPin ? (
                <Card className="p-4 gap-4 border border-warning">
                  <View className="flex-row gap-3">
                    <ShieldAlert size={18} color={colors.warning} />
                    <View className="flex-1">
                      <Text className="text-text font-medium">
                        {translate('Create a Duress PIN', { ns: 'settings' })}
                      </Text>
                      <Text className="text-text-secondary text-sm mt-1">
                        {translate('If you unlock with this PIN, the app wipes chats and signs out immediately.', {
                          ns: 'settings',
                        })}
                      </Text>
                    </View>
                  </View>
                  <Button variant="secondary" fullWidth onPress={beginDuressSetup}>
                    {translate('Set Duress PIN', { ns: 'settings' })}
                  </Button>
                </Card>
              ) : null}

              {hasExistingWallet ? (
                <Card className="p-4 gap-3">
                  <View>
                    <Text className="text-text font-medium">
                      {translate('Choose Spectre account type', { ns: 'settings' })}
                    </Text>
                    <Text className="text-text-secondary text-sm mt-1">
                      {translate('Use the saved Spectre account or create a fresh expendable account for this session.', {
                        ns: 'settings',
                      })}
                    </Text>
                  </View>
                  <Pressable
                    className={`rounded-2xl border p-4 ${useExistingWallet ? 'border-primary' : 'border-border'}`}
                    disabled={setupBusy}
                    onPress={selectExistingWallet}
                  >
                    <View className="flex-row gap-3">
                      <CheckCircle size={18} color={useExistingWallet ? colors.primary : colors.success} />
                      <View className="flex-1">
                        <Text className="text-text font-medium">
                          {translate('Existing Spectre account', { ns: 'settings' })}
                        </Text>
                        <Text className="text-text-secondary text-sm mt-1">
                          {translate('Saved on this device and ready to use.', { ns: 'settings' })}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  <Pressable
                    className={`rounded-2xl border p-4 ${selectedExpendableMode && !useExistingWallet ? 'border-primary' : 'border-border'}`}
                    disabled={setupBusy}
                    onPress={() => void selectSetupMode('expendable')}
                  >
                    <View className="flex-row items-start gap-3">
                      <Zap size={18} color={selectedExpendableMode && !useExistingWallet ? colors.primary : colors.textMuted} />
                      <View className="flex-1">
                        <Text className="text-text font-medium">
                          {translate('Expendable', { ns: 'settings' })}
                        </Text>
                        <Text className="text-text-secondary text-sm mt-1">
                          {translate('Create a temporary Spectre account and erase its local data when you exit Spectre.', {
                            ns: 'settings',
                          })}
                        </Text>
                        <Text className="text-text-muted text-xs mt-1.5">
                          {translate('One anonymous activation token can be requested every 24 hours.', {
                            ns: 'settings',
                          })}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                </Card>
              ) : (
                <Card className="p-4 gap-3">
                  <View>
                    <Text className="text-text font-medium">
                      {translate('Choose Spectre account type', { ns: 'settings' })}
                    </Text>
                    <Text className="text-text-secondary text-sm mt-1">
                      {translate('Choose how to create the separate Spectre wallet for this device.', { ns: 'settings' })}
                    </Text>
                  </View>
                  <Pressable
                    className={`rounded-2xl border p-4 ${selectedMnemonicMode ? 'border-primary' : 'border-border'}`}
                    disabled={setupBusy}
                    onPress={() => void selectSetupMode('mnemonic')}
                  >
                    <View className="flex-row items-start gap-3">
                      <CheckCheck size={18} color={selectedMnemonicMode ? colors.primary : colors.textMuted} />
                      <View className="flex-1">
                        <Text className="text-text font-medium">
                          {translate('Use recovery phrase', { ns: 'settings' })}
                        </Text>
                        <Text className="text-text-secondary text-sm mt-1">
                          {translate('Verify your primary wallet by entering the 24-word recovery phrase.', {
                            ns: 'settings',
                          })}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                  <Pressable
                    className={`rounded-2xl border p-4 ${selectedGeneratedMode ? 'border-primary' : 'border-border'}`}
                    disabled={setupBusy}
                    onPress={() => void selectSetupMode('persistent_generated')}
                  >
                    <View className="flex-row items-start gap-3">
                      <RefreshCw size={18} color={selectedGeneratedMode ? colors.primary : colors.textMuted} />
                      <View className="flex-1">
                        <Text className="text-text font-medium">
                          {translate('New account', { ns: 'settings' })}
                        </Text>
                        <Text className="text-text-secondary text-sm mt-1">
                          {translate('Generate a fresh Spectre account and show the recovery phrase once.', {
                            ns: 'settings',
                          })}
                        </Text>
                      </View>
                      {generatingAccount && selectedGeneratedMode ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : null}
                    </View>
                  </Pressable>
                  <Pressable
                    className={`rounded-2xl border p-4 ${selectedExpendableMode ? 'border-primary' : 'border-border'}`}
                    disabled={setupBusy}
                    onPress={() => void selectSetupMode('expendable')}
                  >
                    <View className="flex-row items-start gap-3">
                      <Zap size={18} color={selectedExpendableMode ? colors.primary : colors.textMuted} />
                      <View className="flex-1">
                        <Text className="text-text font-medium">
                          {translate('Expendable', { ns: 'settings' })}
                        </Text>
                        <Text className="text-text-secondary text-sm mt-1">
                          {translate('Create a temporary Spectre account and erase its local data when you exit Spectre.', {
                            ns: 'settings',
                          })}
                        </Text>
                        <Text className="text-text-muted text-xs mt-1.5">
                          {translate('One anonymous activation token can be requested every 24 hours.', {
                            ns: 'settings',
                          })}
                        </Text>
                      </View>
                      {generatingAccount && selectedExpendableMode ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : null}
                    </View>
                  </Pressable>
                </Card>
              )}

              {selectedMnemonicMode && !hasExistingWallet ? (
                <Card className="p-4 gap-4">
                  <View className="flex-row gap-3">
                    <AlertTriangle size={18} color={colors.warning} />
                    <View className="flex-1">
                      <Text className="text-text font-medium">
                        {translate('Recovery Phrase Check', { ns: 'settings' })}
                      </Text>
                      <Text className="text-text-secondary text-sm mt-1">
                        {translate('Enter the recovery phrase for your current primary wallet to derive the Spectre address.', {
                          ns: 'settings',
                        })}
                      </Text>
                    </View>
                  </View>
                  {sensitiveProtectionReady ? (
                    <MnemonicInput
                      onMnemonicChange={(value, complete) => {
                        setMnemonic(value)
                        setMnemonicComplete(complete)
                        setSetupError(null)
                      }}
                      error={setupError || undefined}
                    />
                  ) : sensitiveProtectionError ? (
                    <Text className="text-error text-sm">{sensitiveProtectionError}</Text>
                  ) : (
                    <ActivityIndicator color={colors.primary} />
                  )}
                </Card>
              ) : null}

              {selectedGeneratedMode && !hasExistingWallet && generatedMnemonic && !generatingAccount ? (
                <Card className="p-4 gap-4">
                  <View className="flex-row gap-3">
                    <AlertTriangle size={18} color={colors.warning} />
                    <View className="flex-1">
                      <Text className="text-text font-medium">
                        {translate('Generated Spectre recovery phrase', { ns: 'settings' })}
                      </Text>
                      <Text className="text-text-secondary text-sm mt-1">
                        {translate('Save this 24-word recovery phrase now. For safety, it is only shown during this setup flow.', {
                          ns: 'settings',
                        })}
                      </Text>
                    </View>
                  </View>
                  {sensitiveProtectionReady ? (
                    <MnemonicDisplay mnemonic={generatedMnemonic} />
                  ) : sensitiveProtectionError ? (
                    <Text className="text-error text-sm">{sensitiveProtectionError}</Text>
                  ) : (
                    <ActivityIndicator color={colors.primary} />
                  )}
                </Card>
              ) : null}

              {selectedExpendableMode && !useExistingWallet ? (
                <Card className="p-4 gap-3">
                  <View className="flex-row gap-3">
                    <AlertTriangle size={18} color={colors.warning} />
                    <View className="flex-1">
                      <Text className="text-text font-medium">
                        {translate('Expendable account behavior', { ns: 'settings' })}
                      </Text>
                      <Text className="text-text-secondary text-sm mt-1">
                        {translate('A fresh expendable Spectre wallet and blinded activation token are prepared now. Redemption waits until Tor is connected.', {
                          ns: 'settings',
                        })}
                      </Text>
                    </View>
                    {generatingAccount ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : preparedWallet ? (
                      <CheckCircle size={18} color={colors.primary} />
                    ) : null}
                  </View>
                </Card>
              ) : null}

              {setupError ? (
                <Card className="p-3 border border-error">
                  <View className="flex-row gap-3">
                    <AlertTriangle size={16} color={colors.error} />
                    <Text className="text-error text-xs flex-1 leading-4">{setupError}</Text>
                  </View>
                </Card>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      <View className="px-5 pb-4 pt-3 gap-3">
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          disabled={setupBusy}
          onPress={onClose}
        >
          {translate('Cancel', { ns: 'common' })}
        </Button>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={setupBusy}
          disabled={
            !setupReady
            || !canEnable
            || loading
            || setupBusy
            || (sensitiveContentRequested && !sensitiveProtectionReady)
          }
          onPress={() => void enableSpectre()}
        >
          {translate('Enable Spectre Mode', { ns: 'settings' })}
        </Button>
      </View>
    </View>
  )
}
