/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { KeyboardAvoidingView } from '@/components/ui/KeyboardAvoidingView'
import { useThemeColors } from '@/lib/theme'

interface PinEntryScreenProps {
  title: string
  onBack: () => void
  icon: React.ReactNode
  iconBackgroundColor: string
  heading: string
  description: string
  descriptionClassName?: string
  children: React.ReactNode
}

export function PinEntryScreen({
  title,
  onBack,
  icon,
  iconBackgroundColor,
  heading,
  description,
  descriptionClassName = 'text-text-secondary text-center mb-8',
  children,
}: PinEntryScreenProps) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()

  return (
    <View className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View
          className="flex-row items-center px-4 py-3"
          style={{ paddingTop: insets.top }}
        >
          <Pressable onPress={onBack} className="p-2 -ml-2">
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="flex-1 text-xl font-bold text-text text-center mr-8">
            {title}
          </Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="flex-1 items-center justify-center px-5 py-6">
            <View
              className="w-16 h-16 rounded-2xl items-center justify-center mb-5"
              style={{ backgroundColor: iconBackgroundColor }}
            >
              {icon}
            </View>
            <Text className="text-xl font-bold text-text text-center mb-2">
              {heading}
            </Text>
            <Text className={descriptionClassName}>{description}</Text>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
