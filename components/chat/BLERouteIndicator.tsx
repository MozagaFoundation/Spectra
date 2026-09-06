/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View, Text } from 'react-native'
import { Bluetooth, WifiOff } from 'lucide-react-native'
import { translate } from '@/lib/i18n'
import type { TransportRoute } from '@/services/bluetooth/types'

interface BLERouteIndicatorProps {
  route: TransportRoute
  internetAvailable: boolean
}

export function BLERouteIndicator({ route, internetAvailable }: BLERouteIndicatorProps) {
  if (route === 'internet') return null

  const isFallback = !internetAvailable
  const color = isFallback ? '#f59e0b' : '#22c55e'

  return (
    <View
      className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
      style={{ backgroundColor: color + '20' }}
    >
      {isFallback ? (
        <WifiOff size={10} color={color} />
      ) : (
        <Bluetooth size={10} color={color} />
      )}
      <Text style={{ fontSize: 10, fontWeight: '600', color }}>
        {isFallback ? translate('Offline via Bluetooth') : translate('Sending via Bluetooth')}
      </Text>
    </View>
  )
}
