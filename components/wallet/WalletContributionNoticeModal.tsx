/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState } from 'react'
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native'
import { HeartHandshake } from 'lucide-react-native'

import { SpectraBackdrop } from '@/components/common/SpectraBackdrop'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'

interface Props {
  visible: boolean
  onAcknowledge: () => void | Promise<void>
}

export function WalletContributionNoticeModal({ visible, onAcknowledge }: Props) {
  const colors = useThemeColors()
  const [acknowledging, setAcknowledging] = useState(false)

  const handleAcknowledge = async () => {
    if (acknowledging) return
    setAcknowledging(true)
    try {
      await onAcknowledge()
    } catch (error) {
      if (__DEV__) console.warn('[Wallets] Contribution notice acknowledge failed:', error)
    } finally {
      setAcknowledging(false)
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={false}
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View
        accessibilityViewIsModal
        style={{
          flex: 1,
          justifyContent: 'center',
          paddingHorizontal: 24,
          backgroundColor: colors.backgroundSecondary,
        }}
      >
        <SpectraBackdrop />
        <View
          style={{
            alignItems: 'center',
            borderRadius: 20,
            backgroundColor: colors.surface,
            padding: 24,
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primary + '20',
            }}
          >
            <HeartHandshake size={36} color={colors.primary} />
          </View>
          <Text
            style={{
              marginTop: 18,
              color: colors.text,
              fontSize: 21,
              fontWeight: '700',
              textAlign: 'center',
            }}
          >
            {translate('Wallet contribution notice', { ns: 'crypto' })}
          </Text>
          <Text
            style={{
              marginTop: 10,
              color: colors.textSecondary,
              fontSize: 14,
              lineHeight: 20,
              textAlign: 'center',
            }}
          >
            {translate(
              'Outbound transactions include an extra 0.1% contribution, capped at $10 USD per transaction. This helps maintain servers and upgrade infrastructure or software. If you do not agree with this donation, do not use Wallets.',
              { ns: 'crypto' },
            )}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={translate('I understand', { ns: 'common' })}
            disabled={acknowledging}
            onPress={() => {
              void handleAcknowledge()
            }}
            style={{
              marginTop: 24,
              minWidth: 190,
              alignItems: 'center',
              borderRadius: 14,
              backgroundColor: colors.primary,
              paddingHorizontal: 24,
              paddingVertical: 14,
              opacity: acknowledging ? 0.65 : 1,
            }}
          >
            {acknowledging ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={{ color: colors.textOnPrimary, fontWeight: '700' }}>
                {translate('I understand', { ns: 'common' })}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}
