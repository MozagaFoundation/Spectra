/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View, Text, ActivityIndicator, Pressable } from 'react-native'
import { useTorStore, type TorStatus } from '@/services/tor'
import { translate } from '@/lib/i18n'

const STATUS_COLORS: Record<TorStatus, string> = {
  disconnected: '#6b7280',
  connecting: '#f59e0b',
  connected: '#10b981',
  error: '#ef4444',
}

interface TorStatusBadgeProps {
  onPress?: () => void
}

export function TorStatusBadge({ onPress }: TorStatusBadgeProps) {
  const status = useTorStore((s) => s.status)
  const enabled = useTorStore((s) => s.enabled)

  if (!enabled) return null

  const dotColor = STATUS_COLORS[status]
  const label =
    status === 'disconnected'
      ? translate('Off')
      : status === 'connecting'
        ? translate('Connecting to Tor', { ns: 'tor' })
        : status === 'connected'
          ? translate('Connected to Tor', { ns: 'tor' })
          : translate('Tor connection failed', { ns: 'tor' })

  const content = (
    <View
      className="flex-row items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{ backgroundColor: dotColor + '1A' }}
    >
      {status === 'connecting' ? (
        <ActivityIndicator size={8} color={dotColor} />
      ) : (
        <View className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
      )}
      <Text numberOfLines={1} className="text-xs font-medium" style={{ color: dotColor }}>
        {label}
      </Text>
    </View>
  )

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:opacity-70">
        {content}
      </Pressable>
    )
  }

  return content
}
