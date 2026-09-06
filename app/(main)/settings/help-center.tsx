/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  User,
  Shield,
  MessageCircle,
  Globe,
  Bluetooth,
  Phone,
  Wallet,
  Store,
  Palette,
  Contact,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Card } from '@/components/ui'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { VISIBLE_FAQ_DATA } from '@/lib/helpData'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

const TOPIC_ICONS: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  account: User,
  security: Shield,
  messaging: MessageCircle,
  calls: Phone,
  contacts: Contact,
  crypto: Wallet,
  markets: Store,
  tor: Globe,
  spectre: Shield,
  payments: Wallet,
  bluetooth: Bluetooth,
  appearance: Palette,
}

export default function HelpCenterScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const { i18n } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())

  const isSearching = searchQuery.trim().length > 0

  const searchResults = useMemo(() => {
    if (!isSearching) return []
    const query = searchQuery.toLowerCase()
    const results: { section: string; q: string; a: string }[] = []
    for (const section of VISIBLE_FAQ_DATA) {
      const sectionTitle = translate(section.titleKey, { ns: 'help' })
      for (const item of section.items) {
        const q = translate(item.qKey, { ns: 'help' })
        const a = translate(item.aKey, { ns: 'help' })
        if (q.toLowerCase().includes(query) || a.toLowerCase().includes(query)) {
          results.push({ section: sectionTitle, q, a })
        }
      }
    }
    return results
  }, [searchQuery, isSearching, i18n.resolvedLanguage])

  const toggleItem = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpenItems((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
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
          {translate('Help Center')}
        </Text>
      </View>

      <View className="px-5 mb-4">
        <View
          className="flex-row items-center rounded-xl px-3 py-2 gap-2"
          style={{ backgroundColor: colors.surface }}
        >
          <Search size={18} color={colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={translate('Search Help Center')}
            placeholderTextColor={colors.textMuted}
            className="flex-1 text-text py-1"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')} className="p-1">
              <X size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!isSearching ? (
          <>
            <Text className="text-text-secondary text-sm font-medium ml-1 mb-3">
              {translate('Help Topics')}
            </Text>
            <Card className="overflow-hidden">
              {VISIBLE_FAQ_DATA.map((section, idx) => {
                const Icon = TOPIC_ICONS[section.id] ?? MessageCircle
                const sectionTitle = translate(section.titleKey, { ns: 'help' })
                return (
                  <Pressable
                    key={section.id}
                    onPress={() =>
                      router.push({
                        pathname: '/(main)/settings/help-topic',
                        params: { topicIndex: String(idx) },
                      })
                    }
                    className="active:opacity-70"
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      paddingHorizontal: 16,
                      paddingVertical: 16,
                      borderTopWidth: idx > 0 ? 1 : 0,
                      borderTopColor: colors.border,
                    }}
                  >
                    <View
                      className="w-9 h-9 rounded-full items-center justify-center"
                      style={{ backgroundColor: colors.primary + '20' }}
                    >
                      <Icon size={18} color={colors.primary} />
                    </View>
                    <Text className="flex-1 text-text font-medium">{sectionTitle}</Text>
                    <ChevronRight size={18} color={colors.textMuted} />
                  </Pressable>
                )
              })}
            </Card>
          </>
        ) : (
          <>
            {searchResults.length === 0 ? (
              <View className="items-center py-12">
                <Text className="text-text-muted text-base">{translate('No results found')}</Text>
                <Text className="text-text-muted text-sm mt-1">
                  {translate('Try a different search term')}
                </Text>
              </View>
            ) : (
              searchResults.map((item, idx) => {
                const key = `search-${idx}`
                const isOpen = openItems.has(key)
                const Chevron = isOpen ? ChevronUp : ChevronDown
                return (
                  <View key={key}>
                    {idx > 0 && <View className="border-t border-border mx-1" />}
                    <Pressable
                      onPress={() => toggleItem(key)}
                      className="py-4 active:opacity-70"
                    >
                      <View className="flex-row items-start gap-3">
                        <View className="flex-1">
                          <Text className="text-text-muted text-xs mb-1">
                            {item.section}
                          </Text>
                          <Text className="text-text font-medium leading-5">
                            {item.q}
                          </Text>
                          {isOpen && (
                            <Text className="text-text-secondary text-sm leading-5 mt-2">
                              {item.a}
                            </Text>
                          )}
                        </View>
                        <Chevron
                          size={18}
                          color={colors.textMuted}
                          style={{ marginTop: 16 }}
                        />
                      </View>
                    </Pressable>
                  </View>
                )
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}
