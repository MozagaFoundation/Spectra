/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ViewShot from 'react-native-view-shot'

import { ContactCardQrPreview } from '@/components/common/ContactCardQrPreview'
import { ContactCardShareActions } from '@/components/common/ContactCardShareActions'
import { useThemeColors } from '@/lib/theme'
import { isScopedActiveContactCard, useEphemeralDiscoveryStore } from '@/store/ephemeralDiscoveryStore'
import { useWalletStore } from '@/store/walletStore'

export function ContactCardShareModal() {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const { t } = useTranslation()
  const viewShotRef = useRef<ViewShot>(null)
  const activeContactCard = useEphemeralDiscoveryStore((state) => state.activeContactCard)
  const cardModalVisible = useEphemeralDiscoveryStore((state) => state.cardModalVisible)
  const clearExpired = useEphemeralDiscoveryStore((state) => state.clearExpired)
  const closeCardModal = useEphemeralDiscoveryStore((state) => state.closeCardModal)
  const displayName = useWalletStore((state) => state.wallet?.displayName ?? null)
  const walletAddress = useWalletStore((state) => state.wallet?.address ?? null)
  const [now, setNow] = useState(Date.now())
  const visibleCard = isScopedActiveContactCard(activeContactCard, walletAddress, now)
    ? activeContactCard
    : null

  useEffect(() => {
    if (!visibleCard) return
    const timeout = setTimeout(() => {
      const current = Date.now()
      setNow(current)
      clearExpired(current)
    }, Math.max(0, visibleCard.expiresAt - Date.now()))
    return () => clearTimeout(timeout)
  }, [visibleCard, clearExpired])

  const visible = Boolean(cardModalVisible && visibleCard)
  if (!visibleCard || !visible) return null

  return (
    <Modal
      transparent
      animationType="slide"
      visible
      statusBarTranslucent
      onRequestClose={closeCardModal}
    >
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable
          className="flex-1"
          accessibilityRole="button"
          accessibilityLabel={t('Close', { ns: 'common' })}
          onPress={closeCardModal}
        />
        <View
          accessibilityViewIsModal
          className="rounded-t-3xl overflow-hidden px-5 pt-5"
          style={{
            backgroundColor: colors.backgroundSecondary,
            paddingBottom: Math.max(insets.bottom, 20),
          }}
        >
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-1 mr-3">
              <Text className="text-xl font-bold text-text">
                {t('One-time contact card', { ns: 'profile' })}
              </Text>
              <Text className="text-sm text-text-muted mt-1">
                {t('Share this QR code before it expires.', { ns: 'profile' })}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Close', { ns: 'common' })}
              onPress={closeCardModal}
              className="p-2 -mr-2"
            >
              <X size={22} color={colors.text} />
            </Pressable>
          </View>

          <View className="items-center">
            <ContactCardQrPreview
              invite={visibleCard.invite}
              viewShotRef={viewShotRef}
              displayName={displayName}
              qrSize={180}
            />
            <ContactCardShareActions
              invite={visibleCard.invite}
              viewShotRef={viewShotRef}
            />
          </View>
        </View>
      </View>
    </Modal>
  )
}
