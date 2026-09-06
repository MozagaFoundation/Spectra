/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { AlertTriangle, CheckCircle2, Globe, RefreshCw, Shield } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'
import { useTorStore } from '@/services/tor/torStore'
import { SpectraBackdrop } from '@/components/common/SpectraBackdrop'
import { getTorPresenceCopy } from './torPresenceState'
import type { TorPresenceTone } from './torPresenceState'

interface TorReconnectGateProps {
  visible: boolean
  onRetry?: () => void
  onConfigureBridges?: () => void
  onDisconnectTor?: () => void
  onDismissError?: () => void
  disconnecting?: boolean
  disconnectLabel?: string
  disconnectingLabel?: string
}

function GateIcon({ tone, color }: { tone: TorPresenceTone; color: string }) {
  if (tone === 'connected') {
    return <CheckCircle2 size={32} color={color} />
  }

  if (tone === 'error') {
    return <AlertTriangle size={32} color={color} />
  }

  return <Shield size={32} color={color} />
}

function StatusRow({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: color + '12' }}>
      <Text className="text-xs font-medium uppercase tracking-wide" style={{ color }}>
        {label}
      </Text>
      <Text className="text-sm mt-1" style={{ color }}>
        {value}
      </Text>
    </View>
  )
}

export function TorReconnectGate({
  visible,
  onRetry,
  onConfigureBridges,
  onDisconnectTor,
  onDismissError,
  disconnecting = false,
  disconnectLabel,
  disconnectingLabel,
}: TorReconnectGateProps) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const status = useTorStore((state) => state.status)
  const exitCountry = useTorStore((state) => state.exitCountry)
  const errorMessage = useTorStore((state) => state.errorMessage)
  const lastHealthError = useTorStore((state) => state.lastHealthError)

  if (!visible) {
    return null
  }

  const copy = getTorPresenceCopy(
    {
      status,
      exitCountry,
      errorMessage,
      lastHealthError,
    },
    'gate',
  )
  const accentColor =
    copy.tone === 'connected'
      ? colors.success
      : copy.tone === 'error'
        ? colors.error
        : colors.warning
  const statusLabel =
    status === 'error'
      ? translate('Reconnect required')
      : status === 'disconnected'
        ? translate('Restarting Tor daemon')
        : translate('Building encrypted circuit')
  const destructiveActionLabel = disconnecting
    ? (disconnectingLabel ?? translate('Disconnecting Tor...'))
    : (disconnectLabel ?? translate('Disconnect from Tor'))

  return (
    <View
      className="absolute inset-0 z-40"
      style={{ backgroundColor: colors.backgroundSecondary }}
    >
      <SpectraBackdrop />
      <View
        className="flex-1 px-6"
        style={{
          paddingTop: insets.top + 28,
          paddingBottom: insets.bottom + 24,
          justifyContent: 'center',
        }}
      >
        <View
          className="rounded-3xl px-6 py-7"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View className="items-center">
            <View
              className="w-20 h-20 rounded-full items-center justify-center"
              style={{ backgroundColor: accentColor + '18' }}
            >
              {copy.tone === 'connecting' ? (
                <ActivityIndicator size="large" color={accentColor} />
              ) : (
                <GateIcon tone={copy.tone} color={accentColor} />
              )}
            </View>

            <Text className="text-xl font-semibold mt-5" style={{ color: colors.text }}>
              {copy.title}
            </Text>
            <Text
              className="text-sm text-center mt-2"
              style={{ color: colors.textSecondary, lineHeight: 20 }}
            >
              {copy.detail}
            </Text>
          </View>

          <View className="mt-6 gap-3">
            <StatusRow label={translate('Status')} value={statusLabel} color={accentColor} />
            <StatusRow label={translate('Exit node')} value={copy.exitLabel} color={colors.textSecondary} />
          </View>

          {status === 'error' ? (
            <View className="mt-6 gap-3">
              {onRetry ? (
                <Pressable
                  onPress={onRetry}
                  disabled={disconnecting}
                  className="rounded-2xl px-4 py-3 items-center justify-center flex-row"
                  style={{ backgroundColor: colors.primary }}
                >
                  <RefreshCw size={16} color={colors.textOnPrimary} />
                  <Text className="text-sm font-semibold ml-2" style={{ color: colors.textOnPrimary }}>
                    {translate('Retry Tor connection')}
                  </Text>
                </Pressable>
              ) : null}

              {onConfigureBridges ? (
                <Pressable
                  onPress={onConfigureBridges}
                  disabled={disconnecting}
                  className="rounded-2xl px-4 py-3 items-center justify-center"
                  style={{ backgroundColor: colors.backgroundSecondary }}
                >
                  <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                    {translate('Configure bridges')}
                  </Text>
                </Pressable>
              ) : null}

              {onDisconnectTor ? (
                <Pressable
                  onPress={onDisconnectTor}
                  disabled={disconnecting}
                  className="rounded-2xl px-4 py-3 items-center justify-center"
                  style={{ backgroundColor: colors.error + '15' }}
                >
                  <Text className="text-sm font-semibold" style={{ color: colors.error }}>
                    {destructiveActionLabel}
                  </Text>
                </Pressable>
              ) : null}

              {onDismissError ? (
                <Pressable
                  onPress={onDismissError}
                  disabled={disconnecting}
                  className="items-center justify-center py-2"
                >
                  <Text className="text-sm" style={{ color: colors.textSecondary }}>
                    {translate('Continue to app')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <View className="mt-6 gap-3">
              <View className="flex-row items-center justify-center">
                <Globe size={14} color={accentColor} />
                <Text className="text-sm ml-2" style={{ color: colors.textSecondary }}>
                  {translate('Waiting for Tor to finish reconnecting.')}
                </Text>
              </View>

              {onDisconnectTor ? (
                <Pressable
                  onPress={onDisconnectTor}
                  disabled={disconnecting}
                  className="rounded-2xl px-4 py-3 items-center justify-center"
                  style={{ backgroundColor: colors.error + '15' }}
                >
                  <Text className="text-sm font-semibold" style={{ color: colors.error }}>
                    {destructiveActionLabel}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </View>
  )
}
