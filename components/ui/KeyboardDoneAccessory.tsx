/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { InputAccessoryView, Keyboard, Platform, Pressable, Text, View } from 'react-native'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'

interface KeyboardDoneAccessoryProps {
  nativeID: string
}

export function KeyboardDoneAccessory({ nativeID }: KeyboardDoneAccessoryProps) {
  const colors = useThemeColors()

  if (Platform.OS !== 'ios') return null

  return (
    <InputAccessoryView nativeID={nativeID}>
      <View
        className="flex-row justify-end px-4 py-2"
        style={{
          backgroundColor: colors.backgroundSecondary,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        }}
      >
        <Pressable
          accessibilityLabel={translate('Done')}
          accessibilityRole="button"
          className="px-3 py-1.5 rounded-lg active:bg-surface-hover"
          hitSlop={8}
          onPress={Keyboard.dismiss}
        >
          <Text className="text-primary font-semibold">{translate('Done')}</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  )
}
