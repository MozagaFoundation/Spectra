/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { type RefObject } from 'react'
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import QRCode from 'react-native-qrcode-svg'
import ViewShot from 'react-native-view-shot'

import { Avatar } from '@/components/common/Avatar'
import { Card } from '@/components/ui'
import { useThemeColors } from '@/lib/theme'

interface ContactCardQrPreviewProps {
  invite: string | null
  viewShotRef: RefObject<ViewShot | null>
  avatarUrl?: string | null
  displayName?: string | null
  qrSize?: number
}

export function ContactCardQrPreview({
  invite,
  viewShotRef,
  avatarUrl = null,
  displayName = null,
  qrSize = 200,
}: ContactCardQrPreviewProps) {
  const colors = useThemeColors()
  const { t } = useTranslation()
  const name = displayName || t('Post-Quantum Account', { ns: 'profile' })

  return (
    <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
      <View className="items-center gap-4 p-5" style={{ backgroundColor: colors.surface }}>
        <View className="items-center gap-3">
          <Avatar
            name={displayName || t('User', { ns: 'profile' })}
            imageUrl={avatarUrl}
            size="xl"
          />
          <Text className="text-xl font-semibold text-text">{name}</Text>
        </View>

        <Card className="p-6" style={{ backgroundColor: colors.card }}>
          <View className="items-center">
            <View className="p-4 rounded-xl" style={{ backgroundColor: colors.qrBackground }}>
              {invite ? (
                <QRCode
                  value={invite}
                  size={qrSize}
                  backgroundColor={colors.qrBackground}
                  color={colors.qrForeground}
                />
              ) : (
                <Text className="text-text-muted text-center">
                  {t('Your QR code appears after you create a card or become findable.', { ns: 'profile' })}
                </Text>
              )}
            </View>
          </View>
        </Card>
      </View>
    </ViewShot>
  )
}
