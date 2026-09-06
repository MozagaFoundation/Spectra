/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { AlertTriangle, CheckCircle2, Globe, Shield, XCircle } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'
import { useTorStore } from '@/services/tor/torStore'
import { useSpectreStore } from '@/store/spectreStore'
import { getTorPresenceCopy } from './torPresenceState'
import type { TorPresenceTone } from './torPresenceState'

interface TorStatusBannerProps {
  onDisconnect?: () => void
  disconnecting?: boolean
}

function BannerIcon({ tone, color }: { tone: TorPresenceTone; color: string }) {
  if (tone === 'connected') {
    return <CheckCircle2 size={18} color={color} />
  }

  if (tone === 'error') {
    return <AlertTriangle size={18} color={color} />
  }

  return <Shield size={18} color={color} />
}

export function TorStatusBanner({ onDisconnect, disconnecting = false }: TorStatusBannerProps) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const enabled = useTorStore((state) => state.enabled)
  const status = useTorStore((state) => state.status)
  const exitCountry = useTorStore((state) => state.exitCountry)
  const errorMessage = useTorStore((state) => state.errorMessage)
  const lastHealthError = useTorStore((state) => state.lastHealthError)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const isDisconnectDisabled = disconnecting || !onDisconnect

  if (!enabled) {
    return null
  }

  const copy = getTorPresenceCopy(
    {
      status,
      exitCountry,
      errorMessage,
      lastHealthError,
    },
    'banner',
  )

  const accentColor =
    copy.tone === 'connected'
      ? colors.success
      : copy.tone === 'error'
        ? colors.error
        : colors.warning
  const title = spectreEnabled && copy.tone === 'connected'
    ? translate('Connected to Spectre', { ns: 'tor' })
    : copy.title

  return (
    <View style={{ backgroundColor: 'transparent' }}>
      <View
        className="px-4"
        style={{ paddingTop: insets.top + 8, paddingBottom: 12 }}
      >
        <View
          className="flex-row items-center rounded-2xl px-4 py-3"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: accentColor + '33',
          }}
        >
          <View
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: accentColor + '18' }}
          >
            {copy.tone === 'connecting' ? (
              <ActivityIndicator size="small" color={accentColor} />
            ) : (
              <BannerIcon tone={copy.tone} color={accentColor} />
            )}
          </View>

          <View className="flex-1 ml-3">
            <Text className="font-semibold" style={{ color: colors.text }}>
              {title}
            </Text>
            <View className="flex-row items-center mt-0.5">
              <Globe size={12} color={accentColor} />
              <Text className="text-xs ml-1" numberOfLines={1} style={{ color: accentColor }}>
                {copy.exitLabel}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityLabel={spectreEnabled ? translate('Cancel Spectre Mode') : translate('Disconnect from Tor', { ns: 'tor' })}
            accessibilityRole="button"
            disabled={isDisconnectDisabled}
            onPress={onDisconnect}
            className="w-9 h-9 rounded-full items-center justify-center ml-3 active:opacity-70"
            style={{ backgroundColor: colors.background }}
          >
            {disconnecting ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <XCircle size={20} color={colors.textSecondary} />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  )
}
