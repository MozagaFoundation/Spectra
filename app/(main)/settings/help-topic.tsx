/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native'
import { Redirect, useRouter, useLocalSearchParams, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/ui'
import { useThemeColors } from '@/lib/theme'
import { VISIBLE_FAQ_DATA } from '@/lib/helpData'
import type { FAQItem } from '@/lib/helpData'
import { translate } from '@/lib/i18n'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

function AccordionItem({
  item,
  isOpen,
  onToggle,
  colors,
}: {
  item: FAQItem
  isOpen: boolean
  onToggle: () => void
  colors: ReturnType<typeof useThemeColors>
}) {
  const Chevron = isOpen ? ChevronUp : ChevronDown
  const question = translate(item.qKey, { ns: 'help' })
  const answer = translate(item.aKey, { ns: 'help' })

  return (
    <Pressable onPress={onToggle} className="py-4 active:opacity-70">
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <Text className="text-text font-medium leading-5">{question}</Text>
          {isOpen && (
            <Text className="text-text-secondary text-sm leading-5 mt-3">
              {answer}
            </Text>
          )}
        </View>
        <Chevron size={18} color={colors.textMuted} style={{ marginTop: 2 }} />
      </View>
    </Pressable>
  )
}

export default function HelpTopicScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  useTranslation()
  const { topicIndex } = useLocalSearchParams<{ topicIndex: string }>()
  const [openItems, setOpenItems] = useState<Set<number>>(new Set())

  const idx = Number(topicIndex)
  const section = VISIBLE_FAQ_DATA[idx]

  if (!section) {
    return <Redirect href={'/(main)/settings/help-center' as Href} />
  }
  const title = translate(section.titleKey, { ns: 'help' })

  const toggleItem = (itemIdx: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpenItems((prev) => {
      const next = new Set(prev)
      if (next.has(itemIdx)) next.delete(itemIdx)
      else next.add(itemIdx)
      return next
    })
  }

  return (
    <View className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      <View
        className="flex-row items-center px-4 py-3"
        style={{ paddingTop: insets.top }}
      >
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-text text-center mr-10">
          {title}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        <Card className="px-4">
          {section.items.map((item, i) => (
            <View key={i}>
              {i > 0 && <View className="border-t border-border" />}
              <AccordionItem
                item={item}
                isOpen={openItems.has(i)}
                onToggle={() => toggleItem(i)}
                colors={colors}
              />
            </View>
          ))}
        </Card>
      </ScrollView>
    </View>
  )
}
