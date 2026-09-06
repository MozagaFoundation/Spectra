/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Landmark } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { AgoraPlazaShell } from '@/components/agora/AgoraPlazaShell'
import { Button } from '@/components/ui'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import {
  agoraAvisosRoomId,
  agoraErrorCode,
  agoraErrorMessage,
  agoraNickConflictsWithAlias,
  fetchAgoraSession,
  joinAgora,
  normalizeAgoraNick,
  resolveAgoraPlazaLocale,
  type AgoraPlazaLocale,
} from '@/services/agora'
import { storedDiscoveryAlias } from '@/lib/discoveryAlias'
import { getCurrentLanguage, translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { useAgoraStore } from '@/store/agoraStore'
import { useChatStore } from '@/store/chatStore'
import { useWalletStore } from '@/store/walletStore'

export default function AgoraLobbyScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const { t } = useTranslation()
  const identity = useAgoraStore((state) => state.identity)
  const setIdentity = useAgoraStore((state) => state.setIdentity)
  const setLoading = useAgoraStore((state) => state.setLoading)
  const reset = useAgoraStore((state) => state.reset)
  const walletAddress = useWalletStore((state) => state.wallet?.address ?? null)
  const contacts = useChatStore((state) => state.contacts)
  const [needsJoin, setNeedsJoin] = useState(false)
  const [nick, setNick] = useState('')
  const [ack, setAck] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [plazaLocale, setPlazaLocale] = useState<AgoraPlazaLocale>(() => (
    resolveAgoraPlazaLocale(getCurrentLanguage())
  ))

  const ownAlias = useMemo(() => {
    const self = contacts.find((contact) => contact.walletAddress === walletAddress)
    return storedDiscoveryAlias(self?.displayName) ?? null
  }, [contacts, walletAddress])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const session = await fetchAgoraSession()
      const termsOk = Boolean(
        session.identity && session.acceptedTermsVersion === session.termsVersion,
      )
      setIdentity(session.identity)
      if (session.identity) {
        setNick(session.identity.nick)
        if (session.identity.plazaLocale) setPlazaLocale(session.identity.plazaLocale)
      }
      setNeedsJoin(!termsOk)
      setBlocked(false)
      if (!termsOk) return
      setError(null)
    } catch (caught) {
      if (agoraErrorCode(caught) === 'agora_unavailable') {
        setError(agoraErrorMessage(caught))
        setNeedsJoin(false)
        setBlocked(true)
        return
      }
      if (useAgoraStore.getState().identity) return
      setError(agoraErrorMessage(caught))
    } finally {
      setSessionReady(true)
      setLoading(false)
    }
  }, [setIdentity, setLoading])

  const prevWallet = useRef(walletAddress)
  useEffect(() => {
    if (prevWallet.current === walletAddress) return
    prevWallet.current = walletAddress
    reset()
    void refresh()
  }, [refresh, reset, walletAddress])

  useFocusEffect(useCallback(() => {
    void refresh()
  }, [refresh]))

  const submitJoin = useCallback(async () => {
    const normalized = normalizeAgoraNick(nick)
    if (!normalized) {
      setError(translate('Choose a nick with 3–24 letters, numbers, or underscores.'))
      return
    }
    if (agoraNickConflictsWithAlias(normalized, ownAlias)) {
      setError(translate('Your plaza nick cannot match your discovery alias.'))
      return
    }
    if (!ack) {
      setError(translate('Please confirm the Agora recommendations.'))
      return
    }
    setJoining(true)
    setError(null)
    try {
      const joined = await joinAgora(normalized, plazaLocale)
      setIdentity(joined.identity)
      setNeedsJoin(false)
    } catch (caught) {
      setError(agoraErrorMessage(caught))
    } finally {
      setJoining(false)
    }
  }, [ack, nick, ownAlias, plazaLocale, setIdentity])

  if (!sessionReady) {
    return (
      <View className="flex-1 items-center justify-center" style={{ paddingTop: insets.top }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    )
  }

  if (!needsJoin && identity && !blocked) {
    return <AgoraPlazaShell roomId={agoraAvisosRoomId(identity.plazaLocale)} mode="home" />
  }

  return (
    <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
      <View className="px-5 pb-3">
        <View className="flex-row items-center gap-2">
          <Landmark size={22} color={colors.gold} />
          <Text className="text-text text-3xl font-semibold">{t('Agora', { ns: 'navigation' })}</Text>
        </View>
        <Text className="text-text-muted mt-1">
          {translate('Public square · not encrypted')}
        </Text>
      </View>

      {needsJoin ? (
        <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text className="text-text text-lg font-semibold mt-2">{translate('Join the plaza')}</Text>
          <Text className="text-text-muted mt-2 leading-5">
            {translate('Agora is public and unencrypted. Servers can read every line, whisper, nick, and occupancy record. Do not send secrets. Spectre wallets cannot use Agora.')}
          </Text>
          <Text className="text-text-muted mt-3 leading-5">
            {translate('Your plaza nick is not your discovery alias and not your EXO address.')}
          </Text>
          <Pressable onPress={() => setAck((value) => !value)} className="flex-row items-center gap-3 mt-4">
            <View
              className="h-5 w-5 rounded border"
              style={{
                borderColor: ack ? colors.gold : colors.border,
                backgroundColor: ack ? colors.gold : 'transparent',
              }}
            />
            <Text className="text-text flex-1">{translate('I understand Agora is not encrypted.')}</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/(main)/settings/legal-viewer', params: { doc: 'agora' } })}
            className="mt-3"
          >
            <Text style={{ color: colors.gold }}>{translate('Read Agora Terms')}</Text>
          </Pressable>
          <Text className="text-text font-medium mt-5">{translate('Plaza language')}</Text>
          <Text className="text-text-muted mt-1 text-xs">
            {translate('Agora rooms are only available in English and Spanish.')}
          </Text>
          <View className="flex-row gap-2 mt-3">
            {(['es', 'en'] as const).map((locale) => {
              const selected = plazaLocale === locale
              return (
                <Pressable
                  key={locale}
                  onPress={() => setPlazaLocale(locale)}
                  className="flex-1 rounded-xl px-3 py-3 items-center"
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: selected ? colors.gold : colors.border,
                  }}
                >
                  <Text className="text-text font-semibold">
                    {locale === 'es' ? 'Español' : 'English'}
                  </Text>
                </Pressable>
              )
            })}
          </View>
          <TextInput
            value={nick}
            onChangeText={setNick}
            placeholder={translate('Choose a plaza nick')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={24}
            className="mt-4 rounded-xl px-4 py-3 text-text"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          />
          {error ? <Text className="text-error mt-3">{translate(error)}</Text> : null}
          <Button className="mt-5" onPress={() => void submitJoin()} loading={joining} disabled={joining}>
            {translate('Enter Agora')}
          </Button>
        </ScrollView>
      ) : (
        <View className="flex-1 px-5">
          {error ? <Text className="text-error mt-6">{translate(error)}</Text> : null}
          <Button className="mt-5" onPress={() => void refresh()}>
            {translate('Retry')}
          </Button>
        </View>
      )}
    </View>
  )
}
