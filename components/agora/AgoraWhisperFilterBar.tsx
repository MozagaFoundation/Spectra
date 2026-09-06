/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import type { AgoraWhisperFilterMode } from '@/services/agora'

function Chip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string
  active: boolean
  onPress: () => void
  testID: string
}) {
  const colors = useThemeColors()
  const accent = colors.gold
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      className="rounded-full px-3 py-1.5 mr-2"
      style={{
        backgroundColor: active ? accent + '22' : colors.surface,
        borderWidth: 1,
        borderColor: active ? accent : colors.border,
      }}
    >
      <Text
        style={{
          color: active ? accent : colors.textSecondary,
          fontWeight: active ? '600' : '500',
          fontSize: 13,
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

export function AgoraWhisperFilterBar({
  mode,
  onChange,
}: {
  mode: AgoraWhisperFilterMode
  onChange: (mode: AgoraWhisperFilterMode) => void
}) {
  return (
    <View testID="agora-whisper-filter" className="pb-2">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Chip
          testID="agora-whisper-filter-all"
          label={translate('All lines')}
          active={mode === 'all'}
          onPress={() => onChange('all')}
        />
        <Chip
          testID="agora-whisper-filter-public"
          label={translate('Public lines')}
          active={mode === 'public'}
          onPress={() => onChange('public')}
        />
        <Chip
          testID="agora-whisper-filter-whispers"
          label={translate('Whisper threads')}
          active={mode === 'whispers'}
          onPress={() => onChange('whispers')}
        />
      </ScrollView>
    </View>
  )
}
