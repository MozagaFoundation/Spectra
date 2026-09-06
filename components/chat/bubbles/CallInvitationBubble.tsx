/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo } from 'react'
import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Shield, Phone, Video } from 'lucide-react-native'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'
import { formatTime } from '@/lib/utils'

export const CallInvitationBubble = memo(function CallInvitationBubble({
  isOwn,
  callType,
  timestamp,
}: {
  isOwn: boolean
  callType: 'voice' | 'video'
  timestamp: number
}) {
  useTranslation()
  const colors = useThemeColors()
  const isVideoCall = callType === 'video'
  const Icon = isVideoCall ? Video : Phone
  const callLabel = isOwn
    ? translate(isVideoCall ? 'Video call started' : 'Voice call started')
    : translate(isVideoCall ? 'Incoming video call' : 'Incoming voice call')
  
  return (
    <View className="items-center py-2">
      <View className="flex-row items-center gap-2 bg-surface px-4 py-2 rounded-full">
        <View className={`w-8 h-8 rounded-full items-center justify-center ${
          isVideoCall ? 'bg-primary/20' : 'bg-green-500/20'
        }`}>
          <Icon size={16} color={isVideoCall ? colors.primary : colors.success} />
        </View>
        <View>
          <Text className="text-text text-sm font-medium">
            {callLabel}
          </Text>
          <View className="flex-row items-center gap-1">
            <Shield size={10} color={colors.success} />
            <Text className="text-text-muted text-xs">
              {translate('End-to-end encrypted')} · {formatTime(timestamp)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
})
