/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View, Text, Pressable, Modal } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Phone, Video, X, Shield } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Haptics, impactAsync as triggerImpact } from '@/lib/safeHaptics'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'
import type { CallType } from '@/lib/types'

interface CallOptionsMenuProps {
  visible: boolean
  onClose: () => void
  onStartCall: (type: CallType) => void
  contactName: string
  disabled?: boolean
  disabledReason?: string
}

export function CallOptionsMenu({
  visible,
  onClose,
  onStartCall,
  contactName,
  disabled = false,
  disabledReason,
}: CallOptionsMenuProps) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  useTranslation()

  const handleVoiceCall = async () => {
    if (disabled) return
    triggerImpact(Haptics.ImpactFeedbackStyle.Medium)
    onStartCall('voice')
    onClose()
  }

  const handleVideoCall = async () => {
    if (disabled) return
    triggerImpact(Haptics.ImpactFeedbackStyle.Medium)
    onStartCall('video')
    onClose()
  }

  return (
    <Modal
      testID="call-options-menu"
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 bg-black/50"
        onPress={onClose}
      >
        <View className="flex-1" />
        
        <View
          className="bg-surface rounded-t-3xl"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <View className="items-center pt-3 pb-4">
            <View className="w-10 h-1 bg-border rounded-full" />
          </View>
          
          <View className="flex-row items-center justify-between px-4 pb-4">
            <View>
              <Text className="text-text text-lg font-semibold">
                {translate('Call {{contactName}}', { contactName })}
              </Text>
              <View className="flex-row items-center gap-1 mt-1">
                <Shield size={12} color={colors.success} />
                <Text className="text-text-muted text-xs">{translate('End-to-end encrypted call')}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} className="p-2">
              <X size={20} color={colors.textTertiary} />
            </Pressable>
          </View>
          
          <View className="px-4 gap-3">
            <Pressable
              testID="call-options-voice"
              onPress={handleVoiceCall}
              disabled={disabled}
              className={`flex-row items-center gap-4 bg-background rounded-xl p-4 ${disabled ? 'opacity-50' : ''}`}
            >
              <View className="w-12 h-12 rounded-full bg-green-500 items-center justify-center">
                <Phone size={24} color="white" />
              </View>
              <View className="flex-1">
                <Text className="text-text font-semibold">{translate('Voice Call')}</Text>
                <Text className="text-text-muted text-sm">{translate('Encrypted audio call')}</Text>
              </View>
            </Pressable>
            
            <Pressable
              testID="call-options-video"
              onPress={handleVideoCall}
              disabled={disabled}
              className={`flex-row items-center gap-4 bg-background rounded-xl p-4 ${disabled ? 'opacity-50' : ''}`}
            >
              <View className="w-12 h-12 rounded-full bg-primary items-center justify-center">
                <Video size={24} color={colors.textOnPrimary} />
              </View>
              <View className="flex-1">
                <Text className="text-text font-semibold">{translate('Video Call')}</Text>
                <Text className="text-text-muted text-sm">{translate('Encrypted video call')}</Text>
              </View>
            </Pressable>
          </View>
          
          <View className="items-center pt-6 pb-2">
            <Text className="text-text-muted text-xs text-center max-w-[280px]">
              {disabledReason || translate('Calls use end-to-end encrypted signaling and media transport.')}
            </Text>
          </View>
        </View>
      </Pressable>
    </Modal>
  )
}
