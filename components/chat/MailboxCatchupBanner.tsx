/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect } from 'react'
import {
  AccessibilityInfo,
  ActivityIndicator,
  Text,
  View,
} from 'react-native'
import { CheckCircle2 } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import {
  type MailboxCatchupBannerPhase,
  useMailboxCatchupBannerStore,
} from '@/store/mailboxCatchupBannerStore'

interface MailboxCatchupBannerProps {
  includeTopInset?: boolean
}

const EMPTY_COMPLETE_DISMISS_MS = 800

function getPhaseDetail(phase: MailboxCatchupBannerPhase): string {
  switch (phase) {
    case 'preparing':
      return translate('Preparing secure chat', { ns: 'chat' })
    case 'loading_local':
      return translate('Loading your chats', { ns: 'chat' })
    case 'connecting':
      return translate('Connecting', { ns: 'chat' })
    case 'checking_mailbox':
      return translate('Checking the mailbox', { ns: 'chat' })
    case 'decrypting':
      return translate('Decrypting messages', { ns: 'chat' })
    case 'caught_up':
      return translate('You\'re up to date', { ns: 'chat' })
  }
}

export function MailboxCatchupBanner({ includeTopInset = true }: MailboxCatchupBannerProps) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const phase = useMailboxCatchupBannerStore((state) => state.phase)
  const dismiss = useMailboxCatchupBannerStore((state) => state.dismiss)
  const title = phase ? translate('Checking for new messages', { ns: 'chat' }) : null
  const detail = phase ? getPhaseDetail(phase) : null
  const caughtUp = phase === 'caught_up'
  const accentColor = caughtUp ? colors.success : colors.primary

  useEffect(() => {
    if (!caughtUp) return
    const timer = setTimeout(dismiss, EMPTY_COMPLETE_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [caughtUp, dismiss])

  useEffect(() => {
    if (!title || !detail) return
    AccessibilityInfo.announceForAccessibility(`${title}. ${detail}`)
  }, [phase, title, detail])

  if (!phase || !title || !detail) return null

  return (
    <View style={{ backgroundColor: 'transparent' }}>
      <View
        className="px-4"
        style={{
          paddingTop: includeTopInset ? insets.top + 8 : 0,
          paddingBottom: 12,
        }}
      >
        <View
          className="rounded-2xl px-4 py-3"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: accentColor + '33',
          }}
        >
          <View className="flex-row items-center">
            <View
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: accentColor + '18' }}
            >
              {caughtUp ? (
                <CheckCircle2 size={18} color={accentColor} />
              ) : (
                <ActivityIndicator size="small" color={accentColor} />
              )}
            </View>

            <View className="flex-1 ml-3">
              <Text
                className="font-semibold"
                numberOfLines={1}
                style={{ color: colors.text }}
              >
                {title}
              </Text>
              <Text
                className="text-xs mt-0.5"
                numberOfLines={2}
                style={{ color: accentColor }}
              >
                {detail}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
