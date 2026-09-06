/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo } from 'react'
import { View, Text, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { getDirectionalTextStyle, getStartBorderStyle, useIsCurrentLanguageRtl } from '@/lib/i18n/direction'
import { useThemeColors } from '@/lib/theme'
import type { ChatMessage } from '@/lib/types'

export const ReplyPreview = memo(function ReplyPreview({ 
  replyTo, 
  isOwn,
  onPress,
}: { 
  replyTo: NonNullable<ChatMessage['replyTo']>
  isOwn: boolean 
  onPress?: () => void
}) {
  useTranslation()
  const isRtl = useIsCurrentLanguageRtl()
  const colors = useThemeColors()
  const content = (
    <View
      className={`rounded-lg px-3 py-2 mb-2 ${isOwn ? 'bg-white/10' : 'bg-primary/10'}`}
      style={getStartBorderStyle(isOwn ? 'rgba(255,255,255,0.3)' : colors.primary, 2, isRtl)}
    >
      <Text
        className={`text-xs font-semibold mb-0.5 ${isOwn ? 'text-white/70' : 'text-primary-light'}`}
        style={getDirectionalTextStyle(isRtl)}
        numberOfLines={1}
      >
        {replyTo.senderName}
      </Text>
      <Text
        className={`text-xs ${isOwn ? 'text-white/50' : 'text-text-muted'}`}
        style={getDirectionalTextStyle(isRtl)}
        numberOfLines={2}
      >
        {replyTo.previewText}
      </Text>
    </View>
  )

  if (!onPress) {
    return content
  }

  return (
    <Pressable onPress={onPress}>
      {content}
    </Pressable>
  )
})
