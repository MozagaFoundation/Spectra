/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  AppState,
  Text,
  View,
} from 'react-native'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { useKeyboardState } from 'react-native-keyboard-controller'
import { AgoraComposer } from '@/components/agora/AgoraComposer'
import { AgoraPublicMessageRow } from '@/components/agora/AgoraPublicMessageRow'
import { AgoraWhisperCard } from '@/components/agora/AgoraWhisperCard'
import { AgoraWhisperFilterBar } from '@/components/agora/AgoraWhisperFilterBar'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { parseContactInvite } from '@/lib/contactInvite'
import { translate } from '@/lib/i18n'
import { useResolvedThemeVariant, useThemeColors } from '@/lib/theme'
import type { AgoraIdentityPublic, AgoraPublicMessage, AgoraTranscriptItem, AgoraWhisper } from '@/lib/types/agora'
import type { AgoraPendingImage, AgoraPendingVoice } from '@/services/agora'
import {
  AGORA_HEARTBEAT_MS,
  AGORA_IDLE_MS,
  AGORA_IDLE_WARN_MS,
  AGORA_POLL_MS,
  activityAgora,
  agoraContainsForbiddenLink,
  agoraErrorCode,
  agoraErrorMessage,
  applyAgoraWhisperNick,
  agoraWhisperIsRedeemable,
  agoraWhisperPartnerNick,
  backgroundAgora,
  enterAgoraRoom,
  filterAgoraTranscript,
  heartbeatAgora,
  isAgoraAvisosRoomId,
  isAgoraUnlimitedRoom,
  isAgoraWhisperComposerDraft,
  leaveAgoraRoom,
  listAgoraMessages,
  listAgoraOccupants,
  parseAgoraOutgoing,
  pickAgoraImage,
  redeemAgoraInvite,
  sendAgoraImage,
  sendAgoraMessage,
  sendAgoraVoice,
} from '@/services/agora'
import { useAgoraStore } from '@/store/agoraStore'

const ACTIVITY_GAP_MS = 4000

function mergeTranscript(
  messages: AgoraPublicMessage[],
  whispers: AgoraWhisper[],
): AgoraTranscriptItem[] {
  const items: Array<AgoraTranscriptItem & { at: string; id: string }> = [
    ...messages.map((message) => ({ type: 'public' as const, message, at: message.createdAt, id: message.id })),
    ...whispers.map((whisper) => ({ type: 'whisper' as const, whisper, at: whisper.createdAt, id: whisper.id })),
  ]
  items.sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id))
  return items
}

export function AgoraSalon({
  roomId,
  mode,
  onUnavailable,
  onPersonLongPress,
}: {
  roomId: string
  mode: 'home' | 'talk'
  onUnavailable: () => void
  onPersonLongPress?: (person: AgoraIdentityPublic) => void
}) {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const keyboardHeight = useKeyboardState((state) => (state.isVisible ? state.height : 0))
  const colors = useThemeColors()
  const dark = useResolvedThemeVariant() !== 'light'
  const identity = useAgoraStore((state) => state.identity)
  const activeRoom = useAgoraStore((state) => state.activeRoom)
  const messages = useAgoraStore((state) => state.messages)
  const whispers = useAgoraStore((state) => state.whispers)
  const setActiveRoom = useAgoraStore((state) => state.setActiveRoom)
  const setTranscript = useAgoraStore((state) => state.setTranscript)
  const prependHistory = useAgoraStore((state) => state.prependHistory)
  const appendPublic = useAgoraStore((state) => state.appendPublic)
  const appendWhisper = useAgoraStore((state) => state.appendWhisper)
  const appendPoll = useAgoraStore((state) => state.appendPoll)
  const setOccupants = useAgoraStore((state) => state.setOccupants)
  const pendingWhisperNick = useAgoraStore((state) => state.pendingWhisperNick)
  const consumeWhisperRequest = useAgoraStore((state) => state.consumeWhisperRequest)
  const whisperFilterMode = useAgoraStore((state) => state.whisperFilterMode)
  const whisperFilterNick = useAgoraStore((state) => state.whisperFilterNick)
  const setWhisperFilter = useAgoraStore((state) => state.setWhisperFilter)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [pendingImage, setPendingImage] = useState<AgoraPendingImage | null>(null)
  const [focusToken, setFocusToken] = useState(0)
  const listRef = useRef<FlashListRef<AgoraTranscriptItem>>(null)
  const pollInFlight = useRef(false)
  const mounted = useRef(true)
  const lastActivity = useRef(Date.now())
  const lastActivityPing = useRef(0)
  const idleWarned = useRef(false)
  const nearBottom = useRef(true)
  const historyDone = useRef(false)
  const primed = useRef(false)
  const afterSeq = useRef(0)
  const afterWhisper = useRef(new Date(0).toISOString())
  const occupantsTick = useRef(0)
  const historyBusy = useRef(false)
  const userScrolled = useRef(false)
  const onUnavailableRef = useRef(onUnavailable)
  onUnavailableRef.current = onUnavailable
  const parsed = useMemo(
    () => parseAgoraOutgoing(draft, identity?.nick ?? ''),
    [draft, identity?.nick],
  )
  const whisperMode = isAgoraWhisperComposerDraft(draft, identity?.nick ?? '')
  const canSend = (Boolean(draft.trim()) || pendingImage !== null) && !sending
  const transcript = useMemo(
    () => filterAgoraTranscript(
      mergeTranscript(messages, whispers),
      whisperFilterMode,
      whisperFilterNick,
    ),
    [messages, whisperFilterMode, whisperFilterNick, whispers],
  )
  const unlimited = activeRoom ? isAgoraUnlimitedRoom(activeRoom) : mode === 'home'
  const boardIsReadOnly = mode === 'home' || isAgoraAvisosRoomId(roomId) || activeRoom?.readOnly === true
  const showComposer = Boolean(activeRoom) && !boardIsReadOnly
  const skipIdleKick = mode === 'home' || unlimited
  const skipIdleKickRef = useRef(skipIdleKick)
  skipIdleKickRef.current = skipIdleKick

  const markActivity = useCallback((ping: boolean) => {
    lastActivity.current = Date.now()
    idleWarned.current = false
    if (!ping) return
    const now = Date.now()
    if (now - lastActivityPing.current < ACTIVITY_GAP_MS) return
    lastActivityPing.current = now
    void activityAgora().catch(() => undefined)
  }, [])

  const beginWhisper = useCallback((nick: string) => {
    if (boardIsReadOnly) return
    if (!nick || nick.toLowerCase() === (identity?.nick ?? '').toLowerCase()) return
    setDraft((current) => applyAgoraWhisperNick(current, nick))
    setFocusToken((value) => value + 1)
    markActivity(true)
  }, [boardIsReadOnly, identity?.nick, markActivity])

  const handleNickPress = useCallback((person: AgoraIdentityPublic) => {
    beginWhisper(person.nick)
  }, [beginWhisper])

  const handleNickLongPress = useCallback((person: AgoraIdentityPublic) => {
    if (!onPersonLongPress || person.identityId === identity?.identityId) return
    onPersonLongPress(person)
  }, [identity?.identityId, onPersonLongPress])

  const filterWhispersWith = useCallback((nick: string) => {
    if (!nick || nick.toLowerCase() === (identity?.nick ?? '').toLowerCase()) return
    setWhisperFilter('whispers', nick)
    beginWhisper(nick)
  }, [beginWhisper, identity?.nick, setWhisperFilter])

  useEffect(() => {
    if (!pendingWhisperNick) return
    beginWhisper(pendingWhisperNick)
    consumeWhisperRequest()
  }, [beginWhisper, consumeWhisperRequest, pendingWhisperNick])

  const refreshTranscript = useCallback(async (targetRoomId: string, incremental: boolean) => {
    if (pollInFlight.current) return
    pollInFlight.current = true
    try {
      const page = incremental && primed.current
        ? await listAgoraMessages(targetRoomId, {
            after: afterSeq.current,
            afterWhisper: afterWhisper.current,
          })
        : await listAgoraMessages(targetRoomId)
      if (!mounted.current) return
      if (!incremental || !primed.current) {
        setTranscript(page.messages, page.whispers)
        primed.current = true
      } else if (page.messages.length || page.whispers.length) {
        appendPoll(page.messages, page.whispers)
      }
      for (const message of page.messages) {
        if (message.serverSequence > afterSeq.current) afterSeq.current = message.serverSequence
      }
      for (const whisper of page.whispers) {
        if (whisper.createdAt > afterWhisper.current) afterWhisper.current = whisper.createdAt
      }
      if (afterWhisper.current === new Date(0).toISOString()) {
        afterWhisper.current = new Date().toISOString()
      }
      if (mode === 'talk' && !unlimited) {
        occupantsTick.current += 1
        if (occupantsTick.current % 4 === 1) {
          const people = await listAgoraOccupants(targetRoomId)
          if (mounted.current) setOccupants(people.occupants)
        }
      }
      if ((page.messages.length > 0 || page.whispers.length > 0) && nearBottom.current) {
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }))
      }
    } catch (error) {
      const code = agoraErrorCode(error)
      if (code === 'agora_unavailable') {
        onUnavailableRef.current()
        return
      }
      if (code === 'not_in_room') {
        if (mode === 'home') {
          primed.current = false
          await enterAgoraRoom(targetRoomId).then((entered) => {
            if (mounted.current) setActiveRoom(entered.room)
          }).catch(() => onUnavailableRef.current())
          return
        }
        onUnavailableRef.current()
      }
    } finally {
      pollInFlight.current = false
    }
  }, [appendPoll, mode, setActiveRoom, setOccupants, setTranscript, unlimited])

  const refreshTranscriptRef = useRef(refreshTranscript)
  refreshTranscriptRef.current = refreshTranscript

  useEffect(() => {
    mounted.current = true
    primed.current = false
    afterSeq.current = 0
    afterWhisper.current = new Date(0).toISOString()
    historyDone.current = false
    historyBusy.current = false
    userScrolled.current = false
    occupantsTick.current = 0
    lastActivity.current = Date.now()
    let cancelled = false
    void (async () => {
      try {
        const entered = await enterAgoraRoom(roomId)
        if (cancelled) return
        setActiveRoom(entered.room)
        const actualId = entered.room.id
        if (actualId !== roomId && mode === 'talk') {
          router.replace(`/(main)/agora/${encodeURIComponent(actualId)}`)
          return
        }
        await refreshTranscriptRef.current(actualId, false)
      } catch (error) {
        if (cancelled) return
        Alert.alert(translate('Agora'), translate(agoraErrorMessage(error)))
        onUnavailableRef.current()
      }
    })()
    const poll = setInterval(() => {
      if (AppState.currentState !== 'active' || !mounted.current) return
      const target = useAgoraStore.getState().activeRoom?.id ?? roomId
      void refreshTranscriptRef.current(target, true)
    }, AGORA_POLL_MS)
    const beat = setInterval(() => {
      if (AppState.currentState !== 'active') return
      void heartbeatAgora().catch(() => undefined)
    }, AGORA_HEARTBEAT_MS)
    const idle = setInterval(() => {
      if (skipIdleKickRef.current) return
      const quiet = Date.now() - lastActivity.current
      if (quiet >= AGORA_IDLE_MS) {
        void leaveAgoraRoom().catch(() => undefined)
        onUnavailableRef.current()
        return
      }
      if (quiet >= AGORA_IDLE_WARN_MS && !idleWarned.current) {
        idleWarned.current = true
        Alert.alert(translate('Still there?'), translate('You will leave this room after 15 minutes of idle time.'))
      }
    }, 15_000)
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        void backgroundAgora().catch(() => undefined)
        return
      }
      void heartbeatAgora().catch(() => undefined)
    })
    return () => {
      cancelled = true
      mounted.current = false
      clearInterval(poll)
      clearInterval(beat)
      clearInterval(idle)
      sub.remove()
      if (mode === 'talk') {
        setOccupants([])
        setActiveRoom(null)
        setTranscript([], [])
        void leaveAgoraRoom().catch(() => undefined)
      }
    }
  }, [mode, roomId, router, setActiveRoom, setOccupants, setTranscript])

  const loadOlder = useCallback(async () => {
    if (!userScrolled.current || historyBusy.current || historyDone.current) return
    const room = useAgoraStore.getState().activeRoom
    const current = useAgoraStore.getState().messages
    const oldest = current[0]?.serverSequence
    if (!room || current.length === 0 || !oldest) return
    historyBusy.current = true
    setLoadingHistory(true)
    try {
      const page = await listAgoraMessages(room.id, { before: oldest })
      if (page.messages.length === 0) historyDone.current = true
      prependHistory(page.messages)
    } catch {
      // Keep the visible transcript if history pagination fails.
    } finally {
      historyBusy.current = false
      setLoadingHistory(false)
    }
  }, [prependHistory])

  const send = useCallback(async () => {
    if (!activeRoom || sending || activeRoom.readOnly) return
    if (pendingImage) {
      if (whisperMode) {
        Alert.alert(translate('Agora'), translate('Images cannot be whispered.'))
        return
      }
      if (draft.trim() && agoraContainsForbiddenLink(draft)) {
        Alert.alert(translate('Agora'), translate('Links are not allowed in Agora.'))
        return
      }
      setSending(true)
      markActivity(true)
      try {
        const result = await sendAgoraImage(activeRoom.id, pendingImage, draft)
        appendPublic(result.message)
        if (result.message.serverSequence > afterSeq.current) afterSeq.current = result.message.serverSequence
        setDraft('')
        setPendingImage(null)
        nearBottom.current = true
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))
      } catch (error) {
        Alert.alert(translate('Agora'), translate(agoraErrorMessage(error)))
      } finally {
        setSending(false)
      }
      return
    }
    const outgoing = parseAgoraOutgoing(draft, identity?.nick ?? '')
    if ('error' in outgoing) {
      const key = outgoing.error === 'link'
        ? 'Links are not allowed in Agora.'
        : outgoing.error === 'too_long'
          ? 'That line is too long.'
          : outgoing.error === 'self_whisper'
            ? 'You cannot whisper yourself.'
            : 'Write something first.'
      Alert.alert(translate('Agora'), translate(key))
      return
    }
    setSending(true)
    markActivity(true)
    try {
      const result = await sendAgoraMessage(activeRoom.id, draft)
      if (result.message) {
        appendPublic(result.message)
        if (result.message.serverSequence > afterSeq.current) afterSeq.current = result.message.serverSequence
      }
      if (result.whisper) {
        appendWhisper(result.whisper)
        if (result.whisper.createdAt > afterWhisper.current) afterWhisper.current = result.whisper.createdAt
        const partner = agoraWhisperPartnerNick(result.whisper, identity?.nick ?? '')
        if (whisperFilterMode === 'public' || whisperFilterNick) {
          setWhisperFilter('whispers', partner)
          setDraft(applyAgoraWhisperNick('', partner))
        } else {
          setDraft('')
        }
      } else {
        setDraft('')
      }
      nearBottom.current = true
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))
    } catch (error) {
      Alert.alert(translate('Agora'), translate(agoraErrorMessage(error)))
    } finally {
      setSending(false)
    }
  }, [
    activeRoom,
    appendPublic,
    appendWhisper,
    draft,
    identity?.nick,
    markActivity,
    pendingImage,
    sending,
    whisperFilterMode,
    whisperFilterNick,
    setWhisperFilter,
    whisperMode,
  ])

  const chooseImage = useCallback(async () => {
    if (whisperMode) {
      Alert.alert(translate('Agora'), translate('Images cannot be whispered.'))
      return
    }
    const picked = await pickAgoraImage()
    if (picked === 'too_large') {
      Alert.alert(translate('Agora'), translate('Images must be 6 MB or smaller.'))
      return
    }
    if (picked) setPendingImage(picked)
  }, [whisperMode])

  const sendVoice = useCallback(async (voice: AgoraPendingVoice) => {
    if (!activeRoom || sending || activeRoom.readOnly) return
    if (whisperMode) {
      Alert.alert(translate('Agora'), translate('Voice notes cannot be whispered.'))
      return
    }
    if (draft.trim() && agoraContainsForbiddenLink(draft)) {
      Alert.alert(translate('Agora'), translate('Links are not allowed in Agora.'))
      return
    }
    setSending(true)
    markActivity(true)
    try {
      const caption = !('error' in parsed) && parsed.kind === 'public' ? draft : ''
      const result = await sendAgoraVoice(activeRoom.id, voice, caption)
      appendPublic(result.message)
      if (result.message.serverSequence > afterSeq.current) afterSeq.current = result.message.serverSequence
      setDraft('')
      setPendingImage(null)
      nearBottom.current = true
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }))
    } catch (error) {
      Alert.alert(translate('Agora'), translate(agoraErrorMessage(error)))
    } finally {
      setSending(false)
    }
  }, [activeRoom, appendPublic, draft, markActivity, parsed, sending, whisperMode])

  const redeemInvite = useCallback((whisper: AgoraWhisper) => {
    if (!agoraWhisperIsRedeemable(whisper, identity?.identityId)) return
    Alert.alert(
      translate('Private chat invite'),
      translate('Redeeming opens Spectra’s encrypted contact flow. The invite record is still readable by Spectra until it expires.'),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Redeem'),
          onPress: () => {
            void redeemAgoraInvite(whisper.inviteId!).then((result) => {
              if (!parseContactInvite(result.contactInvite)) {
                throw new Error('That invite is not valid.')
              }
              router.push({
                pathname: '/(main)/contact/add',
                params: { scannedInvite: result.contactInvite },
              })
            }).catch((error) => {
              Alert.alert(translate('Agora'), translate(agoraErrorMessage(error)))
            })
          },
        },
      ],
    )
  }, [identity?.identityId, router])

  const renderItem = useCallback(({ item }: { item: AgoraTranscriptItem }) => {
    if (item.type === 'whisper') {
      return (
        <AgoraWhisperCard
          whisper={item.whisper}
          ownIdentityId={identity?.identityId}
          ownNick={identity?.nick ?? ''}
          dark={dark}
          colors={colors}
          onNickPress={handleNickPress}
          onNickLongPress={handleNickLongPress}
          onRedeem={redeemInvite}
          onFilterPartner={filterWhispersWith}
        />
      )
    }
    return (
      <AgoraPublicMessageRow
        message={item.message}
        isOwn={item.message.author.identityId === identity?.identityId}
        dark={dark}
        colors={colors}
        onNickPress={handleNickPress}
        onNickLongPress={handleNickLongPress}
      />
    )
  }, [
    colors,
    dark,
    filterWhispersWith,
    handleNickLongPress,
    handleNickPress,
    identity?.identityId,
    identity?.nick,
    redeemInvite,
  ])

  return (
    <View className="flex-1" style={{ paddingBottom: keyboardHeight }}>
      {showComposer ? (
        <AgoraWhisperFilterBar
          mode={whisperFilterMode}
          onChange={(next) => setWhisperFilter(next)}
        />
      ) : null}
      <FlashList
        ref={listRef}
        data={transcript}
        renderItem={renderItem}
        keyExtractor={(item) => item.type === 'public' ? item.message.id : item.whisper.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={
          transcript.length === 0
            ? { flexGrow: 1, justifyContent: 'center' }
            : { flexGrow: 1, justifyContent: 'flex-end', paddingVertical: 8 }
        }
        onScrollBeginDrag={() => {
          userScrolled.current = true
          markActivity(false)
        }}
        onStartReached={() => {
          void loadOlder()
        }}
        onStartReachedThreshold={0.05}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
          nearBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80
        }}
        scrollEventThrottle={16}
        ListHeaderComponent={loadingHistory ? <ActivityIndicator color={colors.primary} className="my-2" /> : null}
        ListEmptyComponent={
          <Text className="text-text-muted text-center px-6">
            {whisperFilterNick
              ? translate('No whispers with {{nick}} yet.', { nick: whisperFilterNick })
              : whisperFilterMode === 'whispers'
                ? translate('No whispers yet.')
                : translate('The plaza is quiet.')}
          </Text>
        }
      />

      {boardIsReadOnly ? (
        <Text
          className="text-text-muted text-center py-3"
          style={{ paddingBottom: (mode === 'talk' ? insets.bottom : 0) + 8 }}
        >
          {translate('This board is read-only.')}
        </Text>
      ) : showComposer ? (
        <AgoraComposer
          draft={draft}
          onChangeDraft={(value) => {
            setDraft(value)
            markActivity(true)
          }}
          whisperMode={whisperMode}
          sending={sending}
          canSend={canSend}
          pendingImage={pendingImage}
          colors={colors}
          paddingBottom={keyboardHeight > 0 ? 8 : (mode === 'talk' ? insets.bottom : 0) + 8}
          onPickImage={() => void chooseImage()}
          onClearImage={() => setPendingImage(null)}
          onSend={() => void send()}
          onVoiceSend={(voice) => void sendVoice(voice)}
          focusToken={focusToken}
        />
      ) : null}
    </View>
  )
}
