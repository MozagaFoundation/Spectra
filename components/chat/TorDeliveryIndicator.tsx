/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react-native'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'
import { TOR_CHAT_POLL_INTERVAL_MS } from '@/services/tor/torConstants'

interface TorDeliveryIndicatorProps {
  compact?: boolean
  isGroupChat?: boolean
}

export function TorDeliveryIndicator({
  compact = false,
  isGroupChat = false,
}: TorDeliveryIndicatorProps) {
  const colors = useThemeColors()
  useTranslation()
  const pollSeconds = Math.max(1, Math.round(TOR_CHAT_POLL_INTERVAL_MS / 1000))
  const accent = colors.warning

  if (compact) {
    return (
      <View
        className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
        style={{ backgroundColor: accent + '20' }}
      >
        <Clock size={10} color={accent} />
        <Text style={{ fontSize: 10, fontWeight: '600', color: accent }}>
          {translate('Tor polling every {{pollSeconds}}s', { pollSeconds })}
        </Text>
      </View>
    )
  }

  return (
    <View
      className="mb-2 flex-row items-start gap-2 rounded-xl border px-3 py-2"
      style={{
        borderColor: accent + '33',
        backgroundColor: accent + '12',
      }}
    >
      <Clock size={16} color={accent} />
      <View className="flex-1">
        <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>
          {translate('Tor polling mode')}
        </Text>
        <Text className="text-text-muted text-xs">
          {isGroupChat
            ? translate(
                'This chat checks for new group messages every {{pollSeconds}}s while it is open. Delivery can lag by one polling cycle.',
                { pollSeconds },
              )
            : translate(
                'This chat checks for new messages every {{pollSeconds}}s. Sent bubbles may stay on "Waiting for poll" until the recipient checks in.',
                { pollSeconds },
              )}
        </Text>
      </View>
    </View>
  )
}
