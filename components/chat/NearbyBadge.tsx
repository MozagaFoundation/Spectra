/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View, Text } from 'react-native'
import { Bluetooth } from 'lucide-react-native'
import { translate } from '@/lib/i18n'

interface NearbyBadgeProps {
  size?: 'small' | 'medium'
  showLabel?: boolean
}

export function NearbyBadge({ size = 'small', showLabel = true }: NearbyBadgeProps) {
  const iconSize = size === 'small' ? 10 : 14
  const fontSize = size === 'small' ? 9 : 11
  const paddingH = size === 'small' ? 6 : 8
  const paddingV = size === 'small' ? 2 : 4

  return (
    <View
      className="flex-row items-center gap-1 rounded-full"
      style={{
        backgroundColor: '#22c55e' + '25',
        paddingHorizontal: paddingH,
        paddingVertical: paddingV,
      }}
    >
      <Bluetooth size={iconSize} color="#22c55e" />
      {showLabel && (
        <Text
          style={{
            fontSize,
            fontWeight: '600',
            color: '#22c55e',
          }}
        >
          {translate('Nearby', { ns: 'chat' })}
        </Text>
      )}
    </View>
  )
}
