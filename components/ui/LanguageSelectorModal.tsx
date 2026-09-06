/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View, Text, Pressable, Modal, FlatList } from 'react-native'
import { Check, X } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { useTranslation } from 'react-i18next'
import {
  getLocalizedLanguageName,
  normalizeAppLanguageCode,
  SUPPORTED_LANGUAGES,
} from '@/lib/i18n/languages'
import { useThemeColors } from '@/lib/theme'
import { SpectraBackdrop } from '@/components/common/SpectraBackdrop'
import { DEFAULT_LANGUAGE, type AppLanguage } from '@/lib/i18n/resources'

interface LanguageSelectorModalProps {
  visible: boolean
  onClose: () => void
  selectedLanguage: AppLanguage | null
  onSelect: (lang: AppLanguage) => void | Promise<void>
  title: string
}

export function LanguageSelectorModal({
  visible,
  onClose,
  selectedLanguage,
  onSelect,
  title,
}: LanguageSelectorModalProps) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { i18n } = useTranslation()
  const displayLanguage =
    normalizeAppLanguageCode(i18n.resolvedLanguage || i18n.language) ??
    selectedLanguage ??
    DEFAULT_LANGUAGE

  const handleSelect = async (lang: AppLanguage) => {
    onClose()
    await Haptics.selectionAsync().catch(() => {})
    try {
      await onSelect(lang)
    } catch (error) {
      console.error('Failed to change app language:', error)
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1" style={{ backgroundColor: colors.backgroundSecondary }}>
        <SpectraBackdrop />
        <View
          className="flex-row items-center justify-between px-4 pb-3 border-b border-border"
          style={{ paddingTop: Math.max(insets.top, 16) }}
        >
          <Pressable onPress={onClose} className="p-2 -ml-2">
            <X size={24} color={colors.text} />
          </Pressable>
          <Text className="text-lg font-bold" style={{ color: colors.text }}>
            {title}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          data={SUPPORTED_LANGUAGES}
          keyExtractor={(item) => item.code}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const isActive = selectedLanguage === item.code
            return (
              <Pressable
                onPress={() => handleSelect(item.code)}
                className="flex-row items-center justify-between p-4 rounded-2xl mb-2 active:opacity-80"
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: isActive ? 2 : 1,
                  borderColor: isActive ? colors.primary : colors.border,
                }}
              >
                <View className="flex-row items-center gap-4">
                  <Text style={{ fontSize: 28 }}>{item.flag}</Text>
                  <View>
                    <Text className="font-semibold text-base" style={{ color: colors.text }}>
                      {item.nativeName}
                    </Text>
                    <Text className="text-sm" style={{ color: colors.textSecondary }}>
                      {getLocalizedLanguageName(item.code, displayLanguage)}
                    </Text>
                  </View>
                </View>
                {isActive && (
                  <View
                    className="w-7 h-7 rounded-full items-center justify-center"
                    style={{ backgroundColor: colors.primary }}
                  >
                    <Check size={16} color={colors.textOnPrimary} />
                  </View>
                )}
              </Pressable>
            )
          }}
        />
      </View>
    </Modal>
  )
}
