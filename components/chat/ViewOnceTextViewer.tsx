/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { X } from 'lucide-react-native'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { useDeviceInsets } from '@/hooks/useDeviceInsets'

interface ViewOnceTextViewerProps {
  visible: boolean
  text: string
  onClose: () => void
}

export function ViewOnceTextViewer({
  visible,
  text,
  onClose,
}: ViewOnceTextViewerProps) {
  const colors = useThemeColors()
  const insets = useDeviceInsets()

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/90">
        <View
          className="flex-row items-center justify-between px-4"
          style={{ paddingTop: insets.top + 12, paddingBottom: 12 }}
        >
          <Text className="text-white text-sm font-medium">{translate('One-time message')}</Text>
          <Pressable
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
            onPress={onClose}
          >
            <X size={20} color="white" />
          </Pressable>
        </View>

        <View className="flex-1 px-4 pb-6" style={{ paddingBottom: insets.bottom + 24 }}>
          <ScrollView
            className="flex-1 rounded-3xl"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingVertical: 24,
              backgroundColor: colors.surface,
            }}
          >
            <Text className="text-base leading-6" style={{ color: colors.text }}>
              {text}
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
