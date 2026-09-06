/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { MicOff, Phone, PhoneOff, Shield, Video } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '@/components/common'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'
import type { CallState, CallType } from '@/lib/types'

interface MinimizedCallBannerProps {
  visible: boolean
  includeTopInset?: boolean
  callType: CallType
  callState: CallState
  contactName: string
  contactAvatarUrl?: string | null
  durationMs: number
  isMuted: boolean
  onPress: () => void
  onEndCall: () => void
}

function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

function getStatusText(callState: CallState, durationMs: number): string {
  switch (callState) {
    case 'initiating':
      return translate('Starting secure call')
    case 'ringing':
      return translate('Ringing')
    case 'connecting':
      return translate('Connecting')
    case 'connected':
      return formatDuration(durationMs)
    case 'reconnecting':
      return translate('Reconnecting')
    case 'ended':
      return translate('Call ended')
    case 'failed':
      return translate('Call failed')
    default:
      return translate('Call')
  }
}

export function MinimizedCallBanner({
  visible,
  includeTopInset = true,
  callType,
  callState,
  contactName,
  contactAvatarUrl,
  durationMs,
  isMuted,
  onPress,
  onEndCall,
}: MinimizedCallBannerProps) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  useTranslation()

  if (!visible) {
    return null
  }

  const statusText = getStatusText(callState, durationMs)

  return (
    <View
      style={{
        backgroundColor: 'transparent',
        paddingTop: includeTopInset ? insets.top + 8 : 0,
        paddingBottom: 12,
      }}
    >
      <View className="px-4">
        <View
          className="flex-row items-center rounded-2xl px-3 py-3"
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          }}
        >
          <Pressable onPress={onPress} className="flex-1 flex-row items-center">
            <Avatar
              name={contactName}
              imageUrl={contactAvatarUrl}
              size="md"
              previewable
            />

            <View className="flex-1 ml-3">
              <Text
                className="font-semibold"
                numberOfLines={1}
                style={{ color: colors.text }}
              >
                {contactName}
              </Text>

              <View className="flex-row items-center gap-2 mt-1">
                <Shield size={12} color={colors.success} />
                <Text
                  className="text-xs"
                  numberOfLines={1}
                  style={{ color: colors.textSecondary }}
                >
                  {statusText}
                </Text>
                {isMuted ? <MicOff size={12} color={colors.warning} /> : null}
              </View>
            </View>

            <View
              className="flex-row items-center gap-1 rounded-full px-2.5 py-1 mr-3"
              style={{ backgroundColor: colors.backgroundSecondary }}
            >
              {callType === 'video' ? (
                <Video size={12} color={colors.primary} />
              ) : (
                <Phone size={12} color={colors.primary} />
              )}
              <Text className="text-xs font-medium" style={{ color: colors.primary }}>
                {translate(callType === 'video' ? 'Video' : 'Voice')}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={onEndCall}
            className="w-11 h-11 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.error }}
          >
            <PhoneOff size={18} color="white" />
          </Pressable>
        </View>
      </View>
    </View>
  )
}
