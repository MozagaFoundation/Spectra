/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native'
import { X, CheckCircle, Shield, Globe, Lock, Wifi, AlertTriangle } from 'lucide-react-native'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { translate } from '@/lib/i18n'
import { useTorStore } from '@/services/tor'
import { useThemeColors } from '@/lib/theme'
import { SpectraBackdrop } from '@/components/common/SpectraBackdrop'

const STEPS = [
  { id: 'daemon', labelKey: 'Starting Tor daemon' },
  { id: 'guard', labelKey: 'Connecting to guard relay' },
  { id: 'middle', labelKey: 'Building circuit through middle relay' },
  { id: 'exit', labelKey: 'Establishing exit relay' },
  { id: 'verify', labelKey: 'Verifying encrypted tunnel' },
] as const

type StepId = (typeof STEPS)[number]['id']
const STEP_IDS = STEPS.map((step) => step.id)

const STEP_TIMING_MS: Record<StepId, number> = {
  daemon: 3000,
  guard: 8000,
  middle: 16000,
  exit: 28000,
  verify: 45000,
}

interface Props {
  visible: boolean
  onClose: () => void
  onConfigureBridges?: () => void
}

export function TorConnectionModal({ visible, onClose, onConfigureBridges }: Props) {
  const colors = useThemeColors()
  const status = useTorStore((s) => s.status)
  const errorMessage = useTorStore((s) => s.errorMessage)

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (!visible) {
      setCurrentStepIndex(0)
      setElapsedSeconds(0)
      return
    }

    const startTime = Date.now()

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime
      setElapsedSeconds(Math.floor(elapsed / 1000))

      let newIndex = 0
      for (let i = STEP_IDS.length - 1; i >= 0; i--) {
        if (elapsed >= STEP_TIMING_MS[STEP_IDS[i]]) {
          newIndex = Math.min(i + 1, STEP_IDS.length - 1)
          break
        }
      }
      setCurrentStepIndex(newIndex)
    }, 500)

    return () => clearInterval(timer)
  }, [visible])

  useEffect(() => {
    if (status === 'connected' && visible) {
      setCurrentStepIndex(STEPS.length)
      const id = setTimeout(() => onClose(), 1500)
      return () => clearTimeout(id)
    }
  }, [onClose, status, visible])

  const isError = status === 'error'
  const isConnected = status === 'connected'

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: colors.backgroundSecondary }}>
        <SpectraBackdrop />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16 }}>
          <View style={{ width: 40 }} />
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>
            {isError
              ? translate('Tor connection failed', { ns: 'tor' })
              : isConnected
                ? translate('Connected to Tor', { ns: 'tor' })
                : translate('Connecting to Tor', { ns: 'tor' })}
          </Text>
          <Pressable onPress={onClose} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <X size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
          <View style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isError
              ? colors.error + '20'
              : isConnected
                ? colors.success + '20'
                : colors.primary + '20',
          }}>
            {isError ? (
              <AlertTriangle size={36} color={colors.error} />
            ) : isConnected ? (
              <CheckCircle size={36} color={colors.success} />
            ) : (
              <Shield size={36} color={colors.primary} />
            )}
          </View>

          {!isError && !isConnected && (
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 12 }}>
              {translate('{{count}}s elapsed - this may take 30-240 seconds with bridges', {
                count: elapsedSeconds,
                ns: 'settings',
              })}
            </Text>
          )}
          {isConnected && (
            <Text style={{ fontSize: 13, color: colors.success, marginTop: 12, fontWeight: '600' }}>
              {translate('3-hop encrypted tunnel active', { ns: 'settings' })}
            </Text>
          )}
        </View>

        <View style={{ paddingHorizontal: 24, flex: 1 }}>
          {!isError ? (
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20 }}>
              {STEPS.map((step, index) => {
                const isComplete = isConnected || index < currentStepIndex
                const isActive = !isConnected && index === currentStepIndex
                const isPending = !isConnected && index > currentStepIndex

                return (
                  <View key={step.id}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 }}>
                      <View style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isComplete
                          ? colors.success + '20'
                          : isActive
                            ? colors.primary + '20'
                            : colors.background,
                      }}>
                        {isComplete ? (
                          <CheckCircle size={18} color={colors.success} />
                        ) : isActive ? (
                          <ActivityIndicator size="small" color={colors.primary} />
                        ) : (
                          <StepIcon stepId={step.id} color={colors.textSecondary + '60'} />
                        )}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{
                          fontSize: 14,
                          fontWeight: isActive ? '600' : '400',
                          color: isPending ? colors.textSecondary + '80' : colors.text,
                        }}>
                          {translate(step.labelKey, { ns: 'settings' })}
                        </Text>
                      </View>
                    </View>

                    {index < STEPS.length - 1 && (
                      <View style={{
                        width: 1,
                        height: 8,
                        marginLeft: 18,
                        backgroundColor: isComplete ? colors.success + '40' : colors.textSecondary + '20',
                      }} />
                    )}
                  </View>
                )
              })}
            </View>
          ) : (
            <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: colors.error, textAlign: 'center', marginBottom: 8 }}>
                {errorMessage
                  ? getErrorDisplayMessage(errorMessage)
                  : translate('Connection failed')}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 }}>
                {translate('Try configuring bridges if you are in a censored region, or check your network connection.', {
                  ns: 'settings',
                })}
              </Text>
              {onConfigureBridges && (
                <Pressable
                  onPress={() => {
                    onClose()
                    onConfigureBridges()
                  }}
                  style={{
                    marginTop: 20,
                    paddingHorizontal: 20,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: colors.error + '15',
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.error }}>
                    {translate('Configure Bridges', { ns: 'settings' })}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>

        <View style={{ paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' }}>
          {!isError && !isConnected && (
            <Pressable onPress={onClose} style={{ paddingVertical: 14, paddingHorizontal: 24 }}>
              <Text style={{ fontSize: 14, color: colors.textSecondary }}>{translate('Cancel')}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  )
}

function StepIcon({ stepId, color }: { stepId: StepId; color: string }) {
  switch (stepId) {
    case 'daemon': return <Shield size={16} color={color} />
    case 'guard': return <Lock size={16} color={color} />
    case 'middle': return <Globe size={16} color={color} />
    case 'exit': return <Wifi size={16} color={color} />
    case 'verify': return <CheckCircle size={16} color={color} />
  }
}
