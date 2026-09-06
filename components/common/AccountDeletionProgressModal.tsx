/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native'
import {
  AlertTriangle,
  CheckCircle,
  Cloud,
  Database,
  HardDrive,
  KeyRound,
  RadioTower,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react-native'

import { SpectraBackdrop } from '@/components/common/SpectraBackdrop'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import {
  resumePendingAccountDeletion,
} from '@/services/accountLifecycle/permanentAccountDeletion'
import {
  type AccountDeletionPhase,
  useAccountDeletionStore,
} from '@/store/accountDeletionStore'

type VisiblePhase = Exclude<AccountDeletionPhase, 'error' | 'completed'>

interface StepDefinition {
  phase: VisiblePhase
  label: string
  icon: typeof KeyRound
}

const STEPS: StepDefinition[] = [
  { phase: 'preparing', label: 'Preparing secure deletion', icon: ShieldCheck },
  { phase: 'erasing_local', label: 'Erasing local keys and data', icon: KeyRound },
  { phase: 'submitting', label: 'Submitting the deletion request', icon: Cloud },
  { phase: 'postgres', label: 'Deleting account records', icon: Database },
  { phase: 'objects', label: 'Deleting encrypted objects', icon: HardDrive },
  { phase: 'relay', label: 'Deleting chat relay data', icon: RadioTower },
  { phase: 'finalizing', label: 'Finalizing secure cleanup', icon: Trash2 },
]

export function AccountDeletionProgressModal() {
  const colors = useThemeColors()
  const visible = useAccountDeletionStore((state) => state.visible)
  const phase = useAccountDeletionStore((state) => state.phase)
  const failedAtPhase = useAccountDeletionStore((state) => state.failedAtPhase)
  const error = useAccountDeletionStore((state) => state.error)
  const canRetry = useAccountDeletionStore((state) => state.canRetry)
  const retrying = useAccountDeletionStore((state) => state.retrying)
  const dismiss = useAccountDeletionStore((state) => state.dismiss)
  const isError = phase === 'error'
  const isComplete = phase === 'completed'
  const activePhase = isError ? failedAtPhase : phase
  const activeIndex = STEPS.findIndex((step) => step.phase === activePhase)

  useEffect(() => {
    if (!visible || !phase) return
    const announcement = isError
      ? translate('Account deletion needs attention', { ns: 'settings' })
      : isComplete
        ? translate('Account deletion completed', { ns: 'settings' })
        : translate(STEPS.find((step) => step.phase === phase)?.label ?? 'Deleting account', {
            ns: 'settings',
          })
    AccessibilityInfo.announceForAccessibility(announcement)
  }, [isComplete, isError, phase, visible])

  useEffect(() => {
    if (!visible || !isComplete) return
    const timer = setTimeout(dismiss, 1400)
    return () => clearTimeout(timer)
  }, [dismiss, isComplete, visible])

  const retry = async () => {
    if (retrying) return
    useAccountDeletionStore.getState().setRetrying(true)
    try {
      await resumePendingAccountDeletion()
    } catch {
      return
    } finally {
      useAccountDeletionStore.getState().setRetrying(false)
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={isError || isComplete ? dismiss : () => {}}
    >
      <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
        <SpectraBackdrop />
        <View
          style={{
            paddingTop: 60,
            paddingHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ width: 40 }} />
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>
            {translate('Deleting Account', { ns: 'settings' })}
          </Text>
          {isError || isComplete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={translate('Close', { ns: 'common' })}
              onPress={dismiss}
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={22} color={colors.textSecondary} />
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingVertical: 28 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isError
                ? colors.error + '20'
                : isComplete
                  ? colors.success + '20'
                  : colors.primary + '20',
            }}
          >
            {isError ? (
              <AlertTriangle size={36} color={colors.error} />
            ) : isComplete ? (
              <CheckCircle size={36} color={colors.success} />
            ) : (
              <ShieldCheck size={36} color={colors.primary} />
            )}
          </View>
          <Text
            style={{
              marginTop: 16,
              color: isError ? colors.error : colors.text,
              fontSize: 20,
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            {translate(
              isError
                ? 'Deletion needs attention'
                : isComplete
                  ? 'Account deleted'
                  : 'Secure deletion in progress',
              { ns: 'settings' },
            )}
          </Text>
          <Text
            style={{
              marginTop: 10,
              color: colors.textSecondary,
              fontSize: 14,
              lineHeight: 20,
              textAlign: 'center',
            }}
          >
            {translate(
              isError
                ? error ?? 'Cleanup could not be confirmed. You can retry safely.'
                : isComplete
                  ? 'Local data and the accepted backend cleanup have finished.'
                  : 'Keep Spectra open while each verified cleanup stage completes.',
              { ns: 'settings' },
            )}
          </Text>
        </View>

        <View style={{ paddingHorizontal: 24, flex: 1 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20 }}>
            {STEPS.map((step, index) => {
              const complete = isComplete || index < activeIndex
              const active = !isComplete && index === activeIndex
              const failed = isError && active
              const Icon = step.icon
              return (
                <View key={step.phase}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      paddingVertical: 8,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: complete
                          ? colors.success + '20'
                          : failed
                            ? colors.error + '20'
                            : active
                              ? colors.primary + '20'
                              : colors.background,
                      }}
                    >
                      {complete ? (
                        <CheckCircle size={18} color={colors.success} />
                      ) : failed ? (
                        <AlertTriangle size={18} color={colors.error} />
                      ) : active ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <Icon size={16} color={colors.textSecondary + '70'} />
                      )}
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        color: index > activeIndex && !isComplete
                          ? colors.textSecondary + '80'
                          : colors.text,
                        fontSize: 14,
                        fontWeight: active ? '600' : '400',
                      }}
                    >
                      {translate(step.label, { ns: 'settings' })}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        </View>

        <View style={{ paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' }}>
          {isError && canRetry ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={translate('Retry account deletion cleanup', { ns: 'settings' })}
              disabled={retrying}
              onPress={retry}
              style={{
                minWidth: 180,
                paddingVertical: 14,
                paddingHorizontal: 24,
                borderRadius: 14,
                alignItems: 'center',
                backgroundColor: colors.primary,
                opacity: retrying ? 0.6 : 1,
              }}
            >
              {retrying ? (
                <ActivityIndicator color={colors.textOnPrimary} />
              ) : (
                <Text style={{ color: colors.textOnPrimary, fontWeight: '700' }}>
                  {translate('Retry cleanup', { ns: 'settings' })}
                </Text>
              )}
            </Pressable>
          ) : !isComplete && !isError ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center' }}>
              {translate('This screen updates only when a cleanup stage is confirmed.', {
                ns: 'settings',
              })}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}
