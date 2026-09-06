/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Pressable, Switch, Text, View } from 'react-native'
import { ChevronRight } from 'lucide-react-native'

import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'

interface SettingRowProps {
  icon: React.ComponentType<{ size: number; color: string }>
  title: string
  subtitle?: string
  subtitleOptions?: Record<string, unknown>
  value?: boolean
  onValueChange?: (value: boolean) => void
  onPress?: () => void
  rightText?: string
  disabled?: boolean
  danger?: boolean
}

export function SettingRow({
  icon: Icon,
  title,
  subtitle,
  subtitleOptions,
  value,
  onValueChange,
  onPress,
  rightText,
  disabled,
  danger,
}: SettingRowProps) {
  const colors = useThemeColors()
  const translatedTitle = translate(title, { ns: 'settings' })
  const translatedSubtitle = subtitle
    ? translate(subtitle, { ns: 'settings', ...(subtitleOptions ?? {}) })
    : undefined
  const translatedRightText = rightText
    ? translate(rightText, { ns: 'settings' })
    : undefined

  const content = (
    <View className={`flex-row items-center gap-4 py-1 ${disabled ? 'opacity-50' : ''}`}>
      <View
        className="w-10 h-10 rounded-xl items-center justify-center"
        style={{ backgroundColor: (danger ? colors.error : colors.primary) + '26' }}
      >
        <Icon size={20} color={danger ? colors.error : colors.primary} />
      </View>
      <View className="flex-1">
        <Text className={`font-medium ${danger ? 'text-error' : 'text-text'}`}>
          {translatedTitle}
        </Text>
        {translatedSubtitle ? (
          <Text className="text-text-muted text-sm">{translatedSubtitle}</Text>
        ) : null}
      </View>
      {onValueChange !== undefined && value !== undefined ? (
        <Switch
          value={value}
          onValueChange={disabled ? undefined : onValueChange}
          trackColor={{ false: colors.borderLight, true: danger ? colors.error : colors.primary }}
          thumbColor="white"
          disabled={disabled}
        />
      ) : null}
      {translatedRightText ? (
        <View className="flex-row items-center gap-1">
          <Text className="text-primary font-medium">{translatedRightText}</Text>
          <ChevronRight size={16} color={colors.textMuted} />
        </View>
      ) : null}
      {onPress && !rightText && !onValueChange ? (
        <ChevronRight size={20} color={colors.textMuted} />
      ) : null}
    </View>
  )

  if (onPress && !disabled) {
    return (
      <Pressable onPress={onPress} className="active:opacity-70">
        {content}
      </Pressable>
    )
  }

  return content
}
