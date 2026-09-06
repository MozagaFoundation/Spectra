/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useState } from 'react'
import { AppState, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ChevronRight, QrCode } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useThemeColors } from '@/lib/theme'
import { isScopedActiveContactCard, useEphemeralDiscoveryStore } from '@/store/ephemeralDiscoveryStore'
import { useWalletStore } from '@/store/walletStore'

interface ActiveContactCardBannerProps {
  includeTopInset?: boolean
}

export function ActiveContactCardBanner({
  includeTopInset = true,
}: ActiveContactCardBannerProps) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const { t } = useTranslation()
  const activeContactCard = useEphemeralDiscoveryStore((state) => state.activeContactCard)
  const walletAddress = useWalletStore((state) => state.wallet?.address ?? null)
  const clearExpired = useEphemeralDiscoveryStore((state) => state.clearExpired)
  const openCardModal = useEphemeralDiscoveryStore((state) => state.openCardModal)
  const [now, setNow] = useState(Date.now())
  const visibleCard = isScopedActiveContactCard(activeContactCard, walletAddress, now)
    ? activeContactCard
    : null

  useEffect(() => {
    if (!visibleCard) return

    let timeout: ReturnType<typeof setTimeout> | null = null
    const update = () => {
      if (timeout) clearTimeout(timeout)
      timeout = null
      const current = Date.now()
      if (visibleCard.expiresAt <= current) {
        clearExpired(current)
        return
      }
      setNow(current)
      timeout = setTimeout(update, Math.min(60_000, visibleCard.expiresAt - current))
    }
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') update()
    })
    update()

    return () => {
      if (timeout) clearTimeout(timeout)
      appStateSubscription.remove()
    }
  }, [visibleCard, clearExpired])

  if (!visibleCard) return null

  const minutesRemaining = Math.max(1, Math.ceil((visibleCard.expiresAt - now) / 60_000))
  return (
    <View style={{ backgroundColor: 'transparent' }}>
      <View
        className="px-4"
        style={{
          paddingTop: includeTopInset ? insets.top + 8 : 0,
          paddingBottom: 12,
        }}
      >
        <Pressable
          testID="active-contact-card-banner"
          accessibilityRole="button"
          accessibilityLabel={t('Open one-time contact card', { ns: 'profile' })}
          onPress={openCardModal}
          className="rounded-2xl px-4 py-3 flex-row items-center active:opacity-80"
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: `${colors.primary}33`,
          }}
        >
          <View
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: `${colors.primary}18` }}
          >
            <QrCode size={18} color={colors.primary} />
          </View>
          <View className="flex-1 ml-3">
            <Text className="font-semibold" numberOfLines={1} style={{ color: colors.text }}>
              {t('One-time contact card ready', { ns: 'profile' })}
            </Text>
            <Text className="text-xs mt-0.5" numberOfLines={1} style={{ color: colors.primary }}>
              {t('Expires in {{minutes}} min', { ns: 'profile', minutes: minutesRemaining })}
            </Text>
          </View>
          <ChevronRight size={20} color={colors.textSecondary} />
        </Pressable>
      </View>
    </View>
  )
}
