/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { ChevronLeft, Menu, Users } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AgoraLegalNoticeModal } from '@/components/agora/AgoraLegalNoticeModal'
import { AgoraRoomDrawer } from '@/components/agora/AgoraRoomDrawer'
import { AgoraSafetyBanner } from '@/components/agora/AgoraSafetyBanner'
import { AgoraSalon } from '@/components/agora/AgoraSalon'
import { agoraOccupancyLabel } from '@/components/agora/agoraRoomGroups'
import { createAgoraPrivateInvite } from '@/components/agora/createPrivateInvite'
import { Button } from '@/components/ui'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import {
  agoraColorValue,
  agoraErrorMessage,
  agoraNickConflictsWithAlias,
  blockAgoraIdentity,
  changeAgoraLocale,
  changeAgoraNick,
  isAgoraUnlimitedRoom,
  listAgoraRooms,
  normalizeAgoraNick,
  reportAgoraIdentity,
  type AgoraPlazaLocale,
} from '@/services/agora'
import { storedDiscoveryAlias } from '@/lib/discoveryAlias'
import { translate } from '@/lib/i18n'
import { useResolvedThemeVariant, useThemeColors } from '@/lib/theme'
import type { AgoraOccupant, AgoraRoomSummary } from '@/lib/types/agora'
import { useAgoraStore } from '@/store/agoraStore'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useWalletStore } from '@/store/walletStore'

export function AgoraPlazaShell({
  roomId,
  mode,
  onBack,
}: {
  roomId: string
  mode: 'home' | 'talk'
  onBack?: () => void
}) {
  const router = useGuardedRouter()
  const focused = useIsFocused()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const dark = useResolvedThemeVariant() !== 'light'
  const identity = useAgoraStore((state) => state.identity)
  const rooms = useAgoraStore((state) => state.rooms)
  const activeRoom = useAgoraStore((state) => state.activeRoom)
  const occupants = useAgoraStore((state) => state.occupants)
  const setRooms = useAgoraStore((state) => state.setRooms)
  const setOccupants = useAgoraStore((state) => state.setOccupants)
  const setIdentity = useAgoraStore((state) => state.setIdentity)
  const identityId = useAuthStore((state) => state.session?.identityId ?? null)
  const walletAddress = useWalletStore((state) => state.wallet?.address ?? null)
  const contacts = useChatStore((state) => state.contacts)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [legalOpen, setLegalOpen] = useState(false)
  const [nickSheet, setNickSheet] = useState(false)
  const [nextNick, setNextNick] = useState('')
  const [peopleOpen, setPeopleOpen] = useState(false)
  const ownAlias = storedDiscoveryAlias(
    contacts.find((contact) => contact.walletAddress === walletAddress)?.displayName,
  )
  const title = activeRoom?.title ?? (mode === 'home' ? (identity?.plazaLocale === 'en' ? 'Notices' : 'Avisos') : '')
  const occupancy = activeRoom ? agoraOccupancyLabel(activeRoom) : ''
  const showPeople = mode === 'talk' && activeRoom !== null && !isAgoraUnlimitedRoom(activeRoom)
  const handleUnavailable = useCallback(() => {
    if (mode === 'talk') onBack?.()
  }, [mode, onBack])

  const refreshRooms = useCallback(async () => {
    setDrawerLoading(true)
    try {
      const listed = await listAgoraRooms()
      setRooms(listed.rooms)
    } catch {
      // Occupancy in the drawer can stay stale if this snapshot fails.
    } finally {
      setDrawerLoading(false)
    }
  }, [setRooms])

  useEffect(() => {
    if (!drawerOpen) return
    void refreshRooms()
  }, [drawerOpen, refreshRooms])

  const selectRoom = useCallback((room: AgoraRoomSummary) => {
    setDrawerOpen(false)
    if (room.id === roomId) return
    if (isAgoraUnlimitedRoom(room)) {
      if (mode === 'talk') onBack?.()
      return
    }
    const path = `/(main)/agora/${encodeURIComponent(room.id)}`
    if (mode === 'talk') router.replace(path)
    else router.push(path)
  }, [mode, onBack, roomId, router])

  const submitLocale = useCallback(async (locale: AgoraPlazaLocale) => {
    if ((identity?.plazaLocale ?? 'es') === locale) return
    try {
      const result = await changeAgoraLocale(locale)
      setIdentity(result.identity)
      setDrawerOpen(false)
      const listed = await listAgoraRooms()
      setRooms(listed.rooms)
      if (mode === 'talk') router.replace('/(main)/(tabs)/agora')
    } catch (caught) {
      Alert.alert(translate('Agora'), translate(agoraErrorMessage(caught)))
    }
  }, [identity?.plazaLocale, mode, router, setIdentity, setRooms])

  const submitNick = useCallback(async () => {
    const normalized = normalizeAgoraNick(nextNick)
    if (!normalized) {
      Alert.alert(translate('Agora'), translate('Choose a nick with 3–24 letters, numbers, or underscores.'))
      return
    }
    if (agoraNickConflictsWithAlias(normalized, ownAlias)) {
      Alert.alert(translate('Agora'), translate('Your plaza nick cannot match your discovery alias.'))
      return
    }
    try {
      const result = await changeAgoraNick(normalized)
      setIdentity(result.identity)
      setNickSheet(false)
      setNextNick('')
    } catch (caught) {
      Alert.alert(translate('Agora'), translate(agoraErrorMessage(caught)))
    }
  }, [nextNick, ownAlias, setIdentity])

  const invitePerson = useCallback((occupant: AgoraOccupant) => {
    if (!activeRoom || !identityId || !walletAddress || occupant.isSelf) return
    Alert.alert(
      translate('Invite to private chat'),
      translate('This sends an unencrypted private-chat invite. Spectra can read the invite record.'),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Send invite'),
          onPress: () => {
            void createAgoraPrivateInvite({
              roomId: activeRoom.id,
              toIdentityId: occupant.identityId,
              identityId,
              walletAddress,
            }).then(() => {
              Alert.alert(translate('Agora'), translate('Invite sent as a whisper.'))
            }).catch((error) => {
              Alert.alert(translate('Agora'), translate(agoraErrorMessage(error)))
            })
          },
        },
      ],
    )
  }, [activeRoom, identityId, walletAddress])

  const moderate = useCallback((occupant: AgoraOccupant) => {
    if (occupant.isSelf) return
    Alert.alert(occupant.nick, undefined, [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Show whispers'),
        onPress: () => {
          useAgoraStore.getState().setWhisperFilter('whispers', occupant.nick)
          useAgoraStore.getState().requestWhisper(occupant.nick)
          setPeopleOpen(false)
        },
      },
      {
        text: translate('Invite to private chat'),
        onPress: () => invitePerson(occupant),
      },
      {
        text: translate('Block'),
        style: 'destructive',
        onPress: () => {
          void blockAgoraIdentity(occupant.identityId).then(() => {
            setOccupants(occupants.filter((row) => row.identityId !== occupant.identityId))
          }).catch((error) => Alert.alert(translate('Agora'), translate(agoraErrorMessage(error))))
        },
      },
      {
        text: translate('Report'),
        style: 'destructive',
        onPress: () => {
          void reportAgoraIdentity(occupant.identityId, 'harassment', activeRoom?.id).then(() => {
            setOccupants(occupants.filter((row) => row.identityId !== occupant.identityId))
          }).catch((error) => Alert.alert(translate('Agora'), translate(agoraErrorMessage(error))))
        },
      },
    ])
  }, [activeRoom?.id, invitePerson, occupants, setOccupants])

  return (
    <View className="flex-1" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-1 px-2 pb-2" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            className="p-2"
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={translate('Back')}
          >
            <ChevronLeft size={22} color={colors.text} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => setDrawerOpen(true)}
          className="p-2"
          hitSlop={8}
          testID="agora-menu"
          accessibilityRole="button"
          accessibilityLabel={translate('Open room menu')}
        >
          <Menu size={22} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-text font-semibold" numberOfLines={1}>
            {title}
            {occupancy ? `  ${occupancy}` : ''}
          </Text>
          {mode === 'home' ? (
            <Text className="text-text-muted text-xs">{translate('Public square · not encrypted')}</Text>
          ) : null}
        </View>
        {showPeople ? (
          <Pressable onPress={() => setPeopleOpen(true)} className="p-2" accessibilityRole="button">
            <Users size={20} color={colors.text} />
          </Pressable>
        ) : null}
        {identity ? (
          <Pressable
            testID="agora-nick"
            onPress={() => {
              setNextNick(identity.nick)
              setNickSheet(true)
            }}
            className="rounded-full px-3 py-1.5 mr-1"
            style={{ backgroundColor: `${agoraColorValue(identity.color, dark)}22` }}
          >
            <Text style={{ color: agoraColorValue(identity.color, dark) }} className="font-semibold">
              {identity.nick}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <AgoraSafetyBanner onPress={() => setLegalOpen(true)} />

      {focused ? (
        <AgoraSalon
          roomId={roomId}
          mode={mode}
          onUnavailable={handleUnavailable}
          onPersonLongPress={(person) => moderate({
            identityId: person.identityId,
            nick: person.nick,
            color: person.color,
            idleSeconds: 0,
            isSelf: false,
          })}
        />
      ) : (
        <View className="flex-1" />
      )}

      <AgoraRoomDrawer
        visible={drawerOpen}
        rooms={rooms}
        loading={drawerLoading}
        activeRoomId={activeRoom?.id ?? roomId}
        plazaLocale={identity?.plazaLocale === 'en' ? 'en' : 'es'}
        onClose={() => setDrawerOpen(false)}
        onSelectRoom={selectRoom}
        onOpenLegal={() => {
          setDrawerOpen(false)
          setLegalOpen(true)
        }}
        onChangeLocale={(locale) => void submitLocale(locale)}
      />
      <AgoraLegalNoticeModal visible={legalOpen} onClose={() => setLegalOpen(false)} />

      <Modal visible={nickSheet} animationType="slide" transparent onRequestClose={() => setNickSheet(false)}>
        <Pressable className="flex-1 justify-end" style={{ backgroundColor: colors.overlay }} onPress={() => setNickSheet(false)}>
          <Pressable className="rounded-t-3xl px-5 pb-10 pt-5" style={{ backgroundColor: colors.surface }} onPress={() => undefined}>
            <Text className="text-text text-lg font-semibold">{translate('Change plaza nick')}</Text>
            <Text className="text-text-muted mt-1">{translate('Once every 24 hours. Old nicks stay reserved for 3 days.')}</Text>
            <TextInput
              value={nextNick}
              onChangeText={setNextNick}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
              className="mt-4 rounded-xl px-4 py-3 text-text"
              style={{ backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border }}
            />
            <Button className="mt-4" onPress={() => void submitNick()}>{translate('Save nick')}</Button>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={peopleOpen} animationType="slide" transparent onRequestClose={() => setPeopleOpen(false)}>
        <Pressable className="flex-1 justify-end" style={{ backgroundColor: colors.overlay }} onPress={() => setPeopleOpen(false)}>
          <Pressable className="max-h-[70%] rounded-t-3xl px-5 pt-5" style={{ backgroundColor: colors.surface }} onPress={() => undefined}>
            <Text className="text-text text-lg font-semibold mb-3">{translate('In this room')}</Text>
            <ScrollView>
              {occupants.map((item) => (
                <Pressable
                  key={item.identityId}
                  onPress={() => {
                    if (item.isSelf) return
                    useAgoraStore.getState().requestWhisper(item.nick)
                    setPeopleOpen(false)
                  }}
                  onLongPress={() => moderate(item)}
                  delayLongPress={320}
                  className="py-3 flex-row items-center justify-between"
                  accessibilityRole="button"
                  accessibilityLabel={
                    item.isSelf
                      ? `${item.nick} (${translate('you')})`
                      : translate('Whisper {{nick}}', { nick: item.nick })
                  }
                >
                  <Text style={{ color: agoraColorValue(item.color, dark), fontWeight: '600' }}>
                    {item.nick}{item.isSelf ? ` (${translate('you')})` : ''}
                  </Text>
                  <Text className="text-text-muted text-xs">
                    {item.idleSeconds > 60 ? `${Math.floor(item.idleSeconds / 60)}m` : ''}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={{ height: insets.bottom + 12 }} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}
