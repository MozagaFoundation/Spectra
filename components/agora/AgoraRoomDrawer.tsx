/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { ChevronDown, Landmark } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AgoraOccupancyRing } from '@/components/agora/AgoraOccupancyRing'
import {
  agoraClosingLabel,
  agoraOccupancyLabel,
  agoraRoomCountLabel,
  agoraTopicEmoji,
  groupAgoraRooms,
} from '@/components/agora/agoraRoomGroups'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import type { AgoraRoomSummary } from '@/lib/types/agora'
import { isAgoraUnlimitedRoom } from '@/services/agora'

const DRAWER_WIDTH = Math.min(320, Math.round(Dimensions.get('window').width * 0.84))

export function AgoraRoomDrawer({
  visible,
  rooms,
  loading,
  activeRoomId,
  plazaLocale,
  onClose,
  onSelectRoom,
  onOpenLegal,
  onChangeLocale,
}: {
  visible: boolean
  rooms: AgoraRoomSummary[]
  loading: boolean
  activeRoomId: string | null
  plazaLocale: 'en' | 'es'
  onClose: () => void
  onSelectRoom: (room: AgoraRoomSummary) => void
  onOpenLegal: () => void
  onChangeLocale: (locale: 'en' | 'es') => void
}) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const slide = useRef(new Animated.Value(0)).current
  const [now, setNow] = useState(Date.now())
  const [rendered, setRendered] = useState(visible)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [localeOpen, setLocaleOpen] = useState(false)

  useEffect(() => {
    if (visible) setRendered(true)
    else setLocaleOpen(false)
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setRendered(false)
    })
  }, [slide, visible])

  useEffect(() => {
    if (!visible) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [visible])

  const avisos = rooms.find((room) => isAgoraUnlimitedRoom(room))
  const grouped = useMemo(
    () => groupAgoraRooms(rooms.filter((room) => !isAgoraUnlimitedRoom(room))),
    [rooms],
  )

  useEffect(() => {
    const active = rooms.find((room) => room.id === activeRoomId)
    if (!active || isAgoraUnlimitedRoom(active)) return
    setExpanded((current) => (
      current[active.topicId] ? current : { ...current, [active.topicId]: true }
    ))
  }, [activeRoomId, rooms])

  if (!rendered) return null

  return (
    <View className="absolute inset-0 z-20" pointerEvents={visible ? 'auto' : 'none'}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={translate('Close room menu')}
        onPress={onClose}
        className="absolute inset-0"
        style={{ backgroundColor: colors.overlay, opacity: visible ? 1 : 0 }}
      />
      <Animated.View
        style={{
          position: 'absolute',
          top: insets.top + 8,
          bottom: 16,
          left: 10,
          width: DRAWER_WIDTH - 10,
          backgroundColor: colors.backgroundSecondary,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: colors.border,
          paddingTop: 16,
          paddingBottom: 12,
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOpacity: 0.45,
          shadowRadius: 18,
          shadowOffset: { width: 4, height: 0 },
          elevation: 24,
          transform: [{
            translateX: slide.interpolate({
              inputRange: [0, 1],
              outputRange: [-(DRAWER_WIDTH + 10), 0],
            }),
          }],
        }}
      >
        <View className="px-5 pb-4">
          <View className="flex-row items-center gap-2">
            <Landmark size={18} color={colors.gold} />
            <Text className="text-text text-xl font-semibold">{translate('Rooms')}</Text>
          </View>
          <Text className="text-text-muted mt-1 text-xs">
            {translate('Public square · not encrypted')}
          </Text>
        </View>
        <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 16 }}>
          {loading && rooms.length === 0 ? (
            <ActivityIndicator color={colors.primary} className="mt-8" />
          ) : null}
          {avisos ? (
            <Pressable
              onPress={() => onSelectRoom(avisos)}
              className="mb-4 rounded-2xl p-4"
              style={{
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: activeRoomId === avisos.id ? colors.gold : colors.border,
              }}
            >
              <Text className="text-text text-lg font-semibold">
                {agoraTopicEmoji(avisos.icon)} {avisos.title}
              </Text>
              <Text className="text-text-muted mt-1">{avisos.topicLine}</Text>
              <Text className="text-text-tertiary mt-2 text-xs">
                {agoraOccupancyLabel(avisos)} · {translate('Read only')}
              </Text>
            </Pressable>
          ) : null}
          {grouped.map((group) => {
            const open = Boolean(expanded[group.topicId])
            const selected = group.rooms.some((room) => room.id === activeRoomId)
            return (
              <View key={group.topicId} className="mb-3">
                <Pressable
                  onPress={() => setExpanded((current) => ({
                    ...current,
                    [group.topicId]: !current[group.topicId],
                  }))}
                  className="rounded-2xl p-3.5 active:opacity-80"
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: selected ? colors.primary : colors.border,
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                >
                  <View className="flex-row items-start gap-3">
                    <View className="flex-1">
                      <Text className="text-text font-semibold">
                        {agoraTopicEmoji(group.icon)} {group.title}
                      </Text>
                      <Text className="text-text-muted mt-0.5 text-xs">{group.topicLine}</Text>
                    </View>
                    <View className="flex-row items-center gap-1.5 pt-0.5">
                      <Text className="text-text-tertiary text-xs">
                        {agoraRoomCountLabel(group.rooms.length)}
                      </Text>
                      <ChevronDown
                        size={18}
                        color={colors.textMuted}
                        style={{ transform: [{ rotate: open ? '0deg' : '-90deg' }] }}
                      />
                    </View>
                  </View>
                </Pressable>
                {open ? group.rooms.map((room) => (
                  <Pressable
                    key={room.id}
                    onPress={() => onSelectRoom(room)}
                    className="mt-1 ml-4 rounded-xl px-3 py-1.5"
                    style={{
                      backgroundColor: colors.backgroundTertiary,
                      borderWidth: 1,
                      borderColor: activeRoomId === room.id ? colors.primary : colors.border,
                    }}
                  >
                    <View className="flex-row items-center gap-2">
                      <AgoraOccupancyRing
                        occupancy={room.occupancy}
                        max={room.maxOccupancy}
                        closing={Boolean(room.closingAt)}
                        size={16}
                      />
                      <Text className="text-text font-medium flex-1" numberOfLines={1}>
                        {room.title}
                        {room.youAreHere ? ` · ${translate('You are here')}` : ''}
                      </Text>
                      <Text className="text-text-muted text-xs">
                        {agoraOccupancyLabel(room)}
                        {agoraClosingLabel(room.closingAt, now)
                          ? ` · ${agoraClosingLabel(room.closingAt, now)}`
                          : ''}
                      </Text>
                    </View>
                  </Pressable>
                )) : null}
              </View>
            )
          })}

          <Text className="text-text font-medium mt-3 mb-2 px-1">{translate('Plaza languages')}</Text>
          <Pressable
            testID="agora-locale-dropdown"
            onPress={() => setLocaleOpen((value) => !value)}
            className="rounded-2xl px-3.5 py-3.5 active:opacity-80"
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: localeOpen ? colors.gold : colors.border,
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: localeOpen }}
            accessibilityLabel={translate('Plaza languages')}
          >
            <View className="flex-row items-center">
              <Text className="text-text font-semibold flex-1">
                {plazaLocale === 'es' ? 'Español' : 'English'}
              </Text>
              <ChevronDown
                size={18}
                color={colors.textMuted}
                style={{ transform: [{ rotate: localeOpen ? '0deg' : '-90deg' }] }}
              />
            </View>
          </Pressable>
          {localeOpen ? (['es', 'en'] as const).map((locale) => {
            const selected = plazaLocale === locale
            return (
              <Pressable
                key={locale}
                testID={`agora-locale-${locale}`}
                onPress={() => {
                  setLocaleOpen(false)
                  onChangeLocale(locale)
                }}
                className="mt-1 ml-4 rounded-xl px-3 py-2.5"
                style={{
                  backgroundColor: colors.backgroundTertiary,
                  borderWidth: 1,
                  borderColor: selected ? colors.gold : colors.border,
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text className="text-text font-medium">
                  {locale === 'es' ? 'Español' : 'English'}
                </Text>
              </Pressable>
            )
          }) : null}

          <Pressable
            onPress={onOpenLegal}
            className="mt-4 rounded-xl px-3 py-3"
            style={{ backgroundColor: colors.surface }}
          >
            <Text className="text-text font-medium">{translate('Recommendations & Terms')}</Text>
            <Text className="text-text-muted mt-0.5 text-xs">{translate('Review the Agora notice')}</Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </View>
  )
}
