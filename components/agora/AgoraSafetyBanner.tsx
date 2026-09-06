/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Pressable, Text, View } from 'react-native'
import { AlertTriangle, ChevronRight } from 'lucide-react-native'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'

export function AgoraSafetyBanner({ onPress }: { onPress: () => void }) {
  const colors = useThemeColors()
  const accent = colors.error

  return (
    <View className="px-4 pt-1 pb-1">
      <Pressable
        testID="agora-safety-banner"
        accessibilityRole="button"
        accessibilityLabel={translate('Public · not encrypted')}
        onPress={onPress}
        className="flex-row items-center rounded-2xl px-3 py-1.5 active:opacity-80"
        style={{
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: accent + '33',
        }}
      >
        <View
          className="w-7 h-7 rounded-full items-center justify-center"
          style={{ backgroundColor: accent + '18' }}
        >
          <AlertTriangle size={14} color={accent} />
        </View>
        <View className="flex-1 ml-2">
          <Text className="font-semibold text-sm" numberOfLines={1} style={{ color: accent }}>
            {translate('Public · not encrypted')}
          </Text>
          <Text className="text-[11px]" numberOfLines={1} style={{ color: colors.textSecondary }}>
            {translate('Tap to learn how to improve your privacy')}
          </Text>
        </View>
        <ChevronRight size={16} color={accent} />
      </Pressable>
    </View>
  )
}
