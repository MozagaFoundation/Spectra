/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import {
  AlertTriangle,
  CheckCircle,
  Globe,
  Lock,
  RefreshCw,
  Shield,
  X,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'

import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { useTorStore, type TorStatus } from '@/services/tor'
import { SpectraBackdrop } from '@/components/common/SpectraBackdrop'
import {
  type SpectreActivationFlow,
  type SpectreActivationPhase,
  useSpectreStore,
} from '@/store/spectreStore'

type StepId =
  | 'snapshot'
  | 'tor'
  | 'privacy'
  | 'wallet'
  | 'storage'
  | 'cloud'
  | 'restore'
  | 'network'
  | 'finalize'

interface StepDefinition {
  id: StepId
  label: string
  phases: SpectreActivationPhase[]
}

interface Props {
  visible: boolean
  onClose: () => void
  onCancel?: () => Promise<void> | void
  onConfigureBridges?: () => void
}

export function SpectreActivationModal({
  visible,
  onClose,
  onCancel,
  onConfigureBridges,
}: Props) {
  const { i18n } = useTranslation()
  const colors = useThemeColors()
  const activationFlow = useSpectreStore((state) => state.activationFlow)
  const activationPhase = useSpectreStore((state) => state.activationPhase)
  const activationError = useSpectreStore((state) => state.activationError)
  const activationStartedAt = useSpectreStore((state) => state.activationStartedAt)
  const activationFinishedAt = useSpectreStore((state) => state.activationFinishedAt)
  const torStatus = useTorStore((state) => state.status)
  const torError = useTorStore((state) => state.errorMessage)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [isCanceling, setIsCanceling] = useState(false)

  const steps = useMemo(
    () => getStepsForFlow(activationFlow),
    [activationFlow, i18n.resolvedLanguage],
  )

  const isSuccess = activationPhase === 'completed' && !activationError
  const isError = Boolean(activationError)
  const canDismiss = isSuccess || isError
  const displayActivationError = activationError
    ? getErrorDisplayMessage(activationError)
    : null
  const displayTorError = torError ? getErrorDisplayMessage(torError) : null
  const currentStepIndex = useMemo(
    () => getCurrentStepIndex(steps, activationPhase, isSuccess),
    [activationPhase, isSuccess, steps],
  )
  const showBridgeHelp =
    activationFlow === 'enable' &&
    activationPhase === 'enable_tor' &&
    torStatus === 'error' &&
    Boolean(onConfigureBridges)
  const canCancel = activationFlow === 'enable' && !canDismiss && Boolean(onCancel)

  useEffect(() => {
    if (!visible) {
      setElapsedSeconds(0)
      return
    }

    const updateElapsed = () => {
      if (!activationStartedAt) {
        setElapsedSeconds(0)
        return
      }

      const endAt = activationFinishedAt ?? Date.now()
      setElapsedSeconds(Math.max(0, Math.floor((endAt - activationStartedAt) / 1000)))
    }

    updateElapsed()

    if (activationFinishedAt) {
      return
    }

    const timer = setInterval(updateElapsed, 1000)
    return () => clearInterval(timer)
  }, [activationFinishedAt, activationStartedAt, visible])

  useEffect(() => {
    if (!visible) {
      setIsCanceling(false)
    }
  }, [visible])

  useEffect(() => {
    if (!visible || !isSuccess) {
      return
    }

    const timer = setTimeout(() => {
      onClose()
    }, 1400)

    return () => clearTimeout(timer)
  }, [isSuccess, onClose, visible])

  if (!activationFlow || !steps.length) {
    return null
  }

  const title = getTitle(activationFlow, isSuccess, isError)
  const message = getMessage({
    activationFlow,
    activationPhase,
    activationError,
    torStatus,
    torError: displayTorError,
  })
  const handleCancel = async () => {
    if (!onCancel || isCanceling) {
      return
    }

    setIsCanceling(true)
    try {
      await onCancel()
    } finally {
      setIsCanceling(false)
    }
  }
  const isAndroid = Platform.OS === 'android'
  const heroIconSize = isAndroid ? 56 : 72
  const heroGlyphSize = isAndroid ? 28 : 36
  const stepIconSize = isAndroid ? 32 : 36

  const renderProgressContent = () => (
    <>
      <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: isAndroid ? 16 : 20 }}>
        {steps.map((step, index) => {
          const isComplete = isSuccess || index < currentStepIndex
          const isActive = !isSuccess && index === currentStepIndex
          const isFailed = isError && isActive
          const isPending = !isSuccess && index > currentStepIndex

          return (
            <View key={step.id}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: isAndroid ? 12 : 14,
                  paddingVertical: isAndroid ? 7 : 10,
                }}
              >
                <View
                  style={{
                    width: stepIconSize,
                    height: stepIconSize,
                    borderRadius: stepIconSize / 2,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isComplete
                      ? colors.success + '20'
                      : isFailed
                        ? colors.error + '20'
                        : isActive
                          ? colors.primary + '20'
                          : colors.background,
                  }}
                >
                  {isComplete ? (
                    <CheckCircle size={18} color={colors.success} />
                  ) : isFailed ? (
                    <AlertTriangle size={18} color={colors.error} />
                  ) : isActive ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <StepIcon stepId={step.id} color={colors.textSecondary + '60'} />
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: isAndroid ? 13 : 14,
                      fontWeight: isActive ? '600' : '400',
                      color: isPending ? colors.textSecondary + '80' : colors.text,
                      ...(isAndroid ? { lineHeight: 18, flexShrink: 1 } : {}),
                    }}
                  >
                    {step.label}
                  </Text>
                </View>
              </View>

              {index < steps.length - 1 ? (
                <View
                  style={{
                    width: 1,
                    height: isAndroid ? 5 : 8,
                    marginLeft: stepIconSize / 2,
                    backgroundColor: isComplete
                      ? colors.success + '40'
                      : colors.textSecondary + '20',
                  }}
                />
              ) : null}
            </View>
          )
        })}
      </View>

      {isError ? (
        <View
          style={{
            marginTop: isAndroid ? 12 : 16,
            backgroundColor: colors.surface,
            borderRadius: 16,
            padding: isAndroid ? 14 : 16,
            borderWidth: 1,
            borderColor: colors.error + '33',
          }}
        >
          <Text
            style={{
              fontSize: isAndroid ? 13 : 14,
              color: colors.error,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            {displayActivationError}
          </Text>
          {showBridgeHelp ? (
            <Pressable
              onPress={onConfigureBridges}
              style={{
                marginTop: 16,
                paddingHorizontal: 20,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: colors.error + '15',
                alignSelf: 'center',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.error }}>
                {translate('Configure Bridges', { ns: 'settings' })}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  )

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={canDismiss ? onClose : () => {}}
    >
      <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
        <SpectraBackdrop />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: isAndroid ? 36 : 60,
            paddingHorizontal: 20,
            paddingBottom: isAndroid ? 8 : 16,
          }}
        >
          <View style={{ width: 40 }} />
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>
            {title}
          </Text>
          {canDismiss || canCancel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={canDismiss ? translate('Close') : translate('Cancel Spectre Mode', { ns: 'settings' })}
              disabled={canCancel && isCanceling}
              onPress={canDismiss ? onClose : handleCancel}
              style={{
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: canCancel && isCanceling ? 0.6 : 1,
              }}
            >
              {canCancel && isCanceling ? (
                <ActivityIndicator size="small" color={colors.textSecondary} />
              ) : (
                <X size={22} color={colors.textSecondary} />
              )}
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        <View
          style={{
            alignItems: 'center',
            paddingVertical: isAndroid ? 12 : 24,
            paddingHorizontal: isAndroid ? 20 : 24,
          }}
        >
          <View
            style={{
              width: heroIconSize,
              height: heroIconSize,
              borderRadius: heroIconSize / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isError
                ? colors.error + '20'
                : isSuccess
                  ? colors.success + '20'
                  : colors.primary + '20',
            }}
          >
            {isError ? (
              <AlertTriangle size={heroGlyphSize} color={colors.error} />
            ) : isSuccess ? (
              <CheckCircle size={heroGlyphSize} color={colors.success} />
            ) : (
              <Shield size={heroGlyphSize} color={colors.primary} />
            )}
          </View>

          <Text
            style={{
              marginTop: isAndroid ? 12 : 16,
              fontSize: isAndroid ? 18 : 20,
              fontWeight: '700',
              color: isError ? colors.error : colors.text,
              textAlign: 'center',
            }}
          >
            {message.title}
          </Text>

          <Text
            style={{
              marginTop: isAndroid ? 8 : 10,
              fontSize: 14,
              lineHeight: 20,
              color: colors.textSecondary,
              textAlign: 'center',
            }}
          >
            {message.body}
          </Text>

          {visible && activationStartedAt ? (
            <Text
              style={{
                marginTop: isAndroid ? 8 : 12,
                fontSize: 13,
                fontWeight: isSuccess ? '600' : '400',
                color: isSuccess ? colors.success : colors.textSecondary,
              }}
            >
              {translate('{{count}}s elapsed', { count: elapsedSeconds, ns: 'settings' })}
            </Text>
          ) : null}
        </View>

        <View
          style={{
            paddingHorizontal: isAndroid ? 18 : 24,
            flex: 1,
            ...(isAndroid ? { minHeight: 0 } : {}),
          }}
        >
          {isAndroid ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 12 }}
              showsVerticalScrollIndicator={false}
            >
              {renderProgressContent()}
            </ScrollView>
          ) : (
            renderProgressContent()
          )}
        </View>

        <View
          style={{
            paddingHorizontal: isAndroid ? 18 : 24,
            paddingBottom: isAndroid ? 20 : 40,
            ...(isAndroid ? { paddingTop: 8 } : {}),
            alignItems: 'center',
          }}
        >
          {canDismiss ? (
            <Pressable onPress={onClose} style={{ paddingVertical: 14, paddingHorizontal: 24 }}>
              <Text style={{ fontSize: 14, color: colors.textSecondary }}>
                {translate(isSuccess ? 'Close now' : 'Dismiss', { ns: 'settings' })}
              </Text>
            </Pressable>
          ) : (
            <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center' }}>
              {translate('This screen updates automatically as each Spectre stage finishes.', {
                ns: 'settings',
              })}
            </Text>
          )}
        </View>
      </View>
    </Modal>
  )
}

function getStepsForFlow(flow: SpectreActivationFlow | null): StepDefinition[] {
  if (flow === 'disable') {
    return [
      {
        id: 'snapshot',
        label: translate('Loading your Spectre setup', { ns: 'settings' }),
        phases: ['read_snapshot'],
      },
      {
        id: 'restore',
        label: translate('Restoring privacy protections', { ns: 'settings' }),
        phases: ['restore_settings'],
      },
      {
        id: 'wallet',
        label: translate('Switching back to your main wallet', { ns: 'settings' }),
        phases: ['activate_wallet'],
      },
      {
        id: 'network',
        label: translate('Restoring network and cleanup', { ns: 'settings' }),
        phases: ['disable_tor', 'cleanup_expendable_wallet', 'reset_state'],
      },
      {
        id: 'finalize',
        label: translate('Finalizing Spectre shutdown', { ns: 'settings' }),
        phases: ['finalize_state'],
      },
    ]
  }

  if (flow === 'enable') {
    return [
      {
        id: 'snapshot',
        label: translate('Preparing your Spectre setup', { ns: 'settings' }),
        phases: ['prepare_account', 'capture_snapshot', 'persist_snapshot'],
      },
      {
        id: 'tor',
        label: translate('Connecting to Tor', { ns: 'tor' }),
        phases: ['enable_tor'],
      },
      {
        id: 'privacy',
        label: translate('Applying Spectre protections', { ns: 'settings' }),
        phases: ['apply_local_privacy'],
      },
      {
        id: 'cloud',
        label: translate('Verifying private access', { ns: 'settings' }),
        phases: ['verify_cloud'],
      },
      {
        id: 'wallet',
        label: translate('Switching to your Spectre identity', { ns: 'settings' }),
        phases: ['activate_wallet', 'finalize_state'],
      },
      {
        id: 'storage',
        label: translate('Preparing your private workspace', { ns: 'settings' }),
        phases: ['prepare_storage', 'cached_conversations', 'initialize_chat'],
      },
    ]
  }

  return []
}

function getCurrentStepIndex(
  steps: StepDefinition[],
  phase: SpectreActivationPhase | null,
  isSuccess: boolean,
): number {
  if (isSuccess) {
    return steps.length
  }

  if (!phase) {
    return 0
  }

  if (phase === 'rollback') {
    return Math.max(0, steps.length - 1)
  }

  const index = steps.findIndex((step) => step.phases.includes(phase))
  return index >= 0 ? index : 0
}

function getTitle(flow: SpectreActivationFlow, isSuccess: boolean, isError: boolean): string {
  if (isError) {
    return translate(flow === 'enable' ? 'Spectre setup failed' : 'Spectre shutdown failed', {
      ns: 'settings',
    })
  }

  if (isSuccess) {
    return translate(flow === 'enable' ? 'Spectre is ready' : 'Spectre is off', {
      ns: 'settings',
    })
  }

  return translate(flow === 'enable' ? 'Enabling Spectre Mode' : 'Disabling Spectre Mode', {
    ns: 'settings',
  })
}

function getMessage({
  activationFlow,
  activationPhase,
  activationError,
  torStatus,
  torError,
}: {
  activationFlow: SpectreActivationFlow
  activationPhase: SpectreActivationPhase | null
  activationError: string | null
  torStatus: TorStatus
  torError: string | null
}): { title: string; body: string } {
  if (activationError) {
    if (activationPhase === 'enable_tor' && torStatus === 'error') {
      return {
        title: translate('Tor could not connect', { ns: 'settings' }),
        body:
          torError ||
          translate('Spectre cannot finish until Tor is connected. Try bridges or a different network.', {
            ns: 'settings',
          }),
      }
    }

    if (activationPhase === 'rollback') {
      return {
        title: translate('Changes were rolled back', { ns: 'settings' }),
        body: translate('EXO stopped the Spectre flow and restored the previous safe state where it could.', {
          ns: 'settings',
        }),
      }
    }

    return {
      title: translate('Spectre needs your attention', { ns: 'settings' }),
      body: translate('Review the failed step below before trying again.', {
        ns: 'settings',
      }),
    }
  }

  if (activationPhase === 'completed') {
    return activationFlow === 'enable'
      ? {
          title: translate('Spectre protections are active', { ns: 'settings' }),
          body: translate('Your Spectre wallet and Tor tunnel are ready. Chats and contacts can finish refreshing in the background.', {
            ns: 'settings',
          }),
        }
      : {
          title: translate('Your main wallet is restored', { ns: 'settings' }),
          body: translate('EXO has finished switching back from Spectre Mode.', {
            ns: 'settings',
          }),
        }
  }

  if (activationPhase === 'enable_tor') {
    return {
      title: translate('Connecting your private route', { ns: 'settings' }),
      body: translate('Tor must be online before Spectre can switch identities and continue.', {
        ns: 'settings',
      }),
    }
  }

  if (activationPhase === 'prepare_account') {
    return {
      title: translate('Getting Spectre ready', { ns: 'settings' }),
      body: translate('EXO is validating your Spectre account and required protections before the private handoff starts.', {
        ns: 'settings',
      }),
    }
  }

  if (activationPhase === 'prepare_storage' || activationPhase === 'cached_conversations') {
    return {
      title: translate('Preparing your private workspace', { ns: 'settings' }),
      body: translate('Your Spectre wallet is active. EXO is switching storage scope and loading local data for this private profile.', {
        ns: 'settings',
      }),
    }
  }

  if (activationPhase === 'initialize_chat') {
    return {
      title: translate('Finishing the private handoff', { ns: 'settings' }),
      body: translate('EXO can continue refreshing chats in the background once Spectre is ready.', {
        ns: 'settings',
      }),
    }
  }

  if (activationPhase === 'verify_cloud') {
    return {
      title: translate('Checking private access', { ns: 'settings' }),
      body: translate('EXO is verifying the wallet session it uses for private network services.', {
        ns: 'settings',
      }),
    }
  }

  return activationFlow === 'enable'
    ? {
        title: translate('Applying Spectre protections', { ns: 'settings' }),
        body: translate('Keep this screen open while EXO applies the privacy changes needed for Spectre Mode.', {
          ns: 'settings',
        }),
      }
    : {
        title: translate('Restoring your main profile', { ns: 'settings' }),
        body: translate('Keep this screen open while EXO restores your regular wallet and security settings.', {
          ns: 'settings',
        }),
      }
}

function StepIcon({ stepId, color }: { stepId: StepId; color: string }) {
  switch (stepId) {
    case 'snapshot':
      return <Shield size={16} color={color} />
    case 'tor':
      return <Globe size={16} color={color} />
    case 'privacy':
      return <Lock size={16} color={color} />
    case 'wallet':
      return <RefreshCw size={16} color={color} />
    case 'storage':
      return <Shield size={16} color={color} />
    case 'cloud':
      return <Globe size={16} color={color} />
    case 'restore':
      return <Lock size={16} color={color} />
    case 'network':
      return <RefreshCw size={16} color={color} />
    case 'finalize':
      return <CheckCircle size={16} color={color} />
  }
}
