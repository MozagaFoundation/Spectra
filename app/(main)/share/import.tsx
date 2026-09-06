/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, ChevronLeft, FileText, Lock, Send, X } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { ForwardConversationModal, type ForwardConversationTarget } from '@/components/chat/ForwardConversationModal'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { formatAddress } from '@/lib/utils'
import { matchesAccountStorageScope } from '@/lib/accountScope'
import { useAuthStore, useChatStore, useGroupChatStore, useWalletStore } from '@/store'
import { getGroupRouteParam, sendGroupMessage, sendMessage as sendChatMessage } from '@/services/chat'
import {
  cleanupPendingShareImport,
  cleanupStaleShareImports,
  loadPendingShareImport,
  type PendingShareImport,
} from '@/services/media/shareImport'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function getSingleParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

function buildAttachmentSummary(pending: PendingShareImport): string {
  if (pending.attachments.length === 0) {
    return translate('Text or link')
  }

  const names = pending.attachments.slice(0, 3).map((attachment) => attachment.fileName)
  const suffix = pending.attachments.length > names.length
    ? translate(' +{{count}} more', { count: pending.attachments.length - names.length })
    : ''
  return `${names.join(', ')}${suffix}`
}

export default function ShareImportScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const { manifest } = useLocalSearchParams<{ manifest?: string | string[] }>()
  const manifestUri = getSingleParam(manifest)

  const conversations = useChatStore((state) => state.conversations)
  const contacts = useChatStore((state) => state.contacts)
  const groups = useGroupChatStore((state) => state.groups)
  const activeWalletAddress = useWalletStore((state) => state.wallet?.address ?? null)
  const exoAddress = useAuthStore((state) => state.exoAddress)

  const [pendingImport, setPendingImport] = useState<PendingShareImport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [targetPickerVisible, setTargetPickerVisible] = useState(false)

  const senderAddress = activeWalletAddress || exoAddress || undefined
  const directLocalWalletAddress = activeWalletAddress || exoAddress || undefined

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!manifestUri) {
        setError(translate('Shared content is missing. Please share it again.'))
        setLoading(false)
        return
      }

      try {
        await cleanupStaleShareImports(manifestUri, { excludeManifestUri: manifestUri }).catch(() => undefined)
        const loaded = await loadPendingShareImport(manifestUri)
        if (!cancelled) {
          setPendingImport(loaded)
          setError(null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorDisplayMessage(toError(loadError)))
        }
        await cleanupPendingShareImport({ manifestUri }).catch(() => undefined)
        await cleanupStaleShareImports(manifestUri).catch(() => undefined)
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [manifestUri])

  const targets = useMemo<ForwardConversationTarget[]>(() => {
    const seenDirectKeys = new Set<string>()
    const directTargets = conversations
      .filter((conversation) =>
        conversation.type !== 'group'
        && Boolean(conversation.remoteIdentityId)
        && conversation.remoteIdentityId !== 'undefined'
        && conversation.remoteIdentityId !== 'null'
        && matchesAccountStorageScope(conversation.localWalletAddress, directLocalWalletAddress),
      )
      .reduce<ForwardConversationTarget[]>((acc, conversation) => {
        const localKey = conversation.localWalletAddress || directLocalWalletAddress || 'active'
        const dedupeKey = `${localKey}:${conversation.remoteWalletAddress || conversation.remoteIdentityId}`
        if (seenDirectKeys.has(dedupeKey)) return acc
        seenDirectKeys.add(dedupeKey)

        const contact = contacts.find(
          (entry) => entry.identityId === conversation.remoteIdentityId
            || (conversation.remoteWalletAddress && entry.walletAddress === conversation.remoteWalletAddress),
        )
        acc.push({
          id: `direct:${conversation.remoteIdentityId}`,
          type: 'direct',
          title: contact?.displayName || formatAddress(conversation.remoteWalletAddress || conversation.remoteIdentityId, 6),
          subtitle: formatAddress(conversation.remoteWalletAddress || conversation.remoteIdentityId, 6),
          avatarUrl: contact?.avatarUrl,
          routeAddress: conversation.remoteIdentityId,
          localWalletAddress: conversation.localWalletAddress,
        })
        return acc
      }, [])

    const groupTargets = groups
      .filter((group) => Boolean(group.groupId))
      .map<ForwardConversationTarget>((group) => ({
        id: `group:${group.groupId}`,
        type: 'group',
        title: group.title || translate('Group chat'),
        subtitle: group.subtitle || translate('{{count}} member{{suffix}}', {
          count: group.memberCount || 0,
          suffix: (group.memberCount || 0) === 1 ? '' : 's',
        }),
        avatarUrl: group.avatarUrl,
        groupId: group.groupId,
        routeAddress: getGroupRouteParam(group.groupId),
      }))

    return [...directTargets, ...groupTargets].sort((a, b) => a.title.localeCompare(b.title))
  }, [contacts, conversations, directLocalWalletAddress, groups])

  const discardAndLeave = useCallback(async () => {
    const currentImport = pendingImport
    setPendingImport(null)
    if (currentImport) {
      await cleanupPendingShareImport(currentImport).catch(() => undefined)
    }
    router.replace('/(main)/(tabs)/chats' as Href)
  }, [pendingImport, router])

  const handleSelectTarget = useCallback(async (target: ForwardConversationTarget) => {
    if (!pendingImport || sending) return
    if (!senderAddress && target.type === 'direct') {
      Alert.alert(translate('Unable to send'), translate('Your wallet is not available right now.'))
      return
    }

    setSending(true)
    setTargetPickerVisible(false)

    try {
      const content = pendingImport.content
      const attachments = pendingImport.attachments.length > 0 ? pendingImport.attachments : undefined
      const result = target.type === 'group' && target.groupId
        ? await sendGroupMessage(target.groupId, content, undefined, attachments)
        : target.routeAddress && senderAddress
          ? await sendChatMessage(senderAddress, target.routeAddress, content, attachments)
          : { error: new Error(translate('Invalid conversation target')) }

      if (result.error) {
        Alert.alert(translate('Send failed'), getErrorDisplayMessage(result.error))
        return
      }

      await cleanupPendingShareImport(pendingImport)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

      if (target.routeAddress) {
        const localQuery = target.localWalletAddress ? `?local=${encodeURIComponent(target.localWalletAddress)}` : ''
        router.replace(`/(main)/chat/${target.routeAddress}${localQuery}` as Href)
      } else {
        router.replace('/(main)/(tabs)/chats' as Href)
      }
    } catch (sendError) {
      Alert.alert(translate('Send failed'), getErrorDisplayMessage(toError(sendError)))
    } finally {
      setSending(false)
    }
  }, [pendingImport, router, senderAddress, sending])

  const summary = pendingImport ? buildAttachmentSummary(pendingImport) : ''
  const contentPreview = pendingImport?.content ? pendingImport.content.slice(0, 240) : null

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background, paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 px-5 pb-4">
        <Pressable
          onPress={discardAndLeave}
          className="w-10 h-10 rounded-xl items-center justify-center active:opacity-70"
          style={{ backgroundColor: colors.surface }}
        >
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-2xl font-bold" style={{ color: colors.text }}>
          {translate('Share to Spectra')}
        </Text>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View className="rounded-2xl p-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
          <View className="flex-row items-center gap-3">
            <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: `${colors.primary}22` }}>
              <Lock size={20} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="font-semibold" style={{ color: colors.text }}>
                {translate('Private handoff')}
              </Text>
              <Text className="text-sm mt-1" style={{ color: colors.textMuted }}>
                {translate('Recipients are shown only inside Spectra. iOS sees only the Spectra app destination.')}
              </Text>
            </View>
          </View>
        </View>

        <View className="mt-5 rounded-2xl p-5 border" style={{ backgroundColor: colors.backgroundSecondary, borderColor: colors.border }}>
          {loading ? (
            <View className="items-center py-8">
              <ActivityIndicator color={colors.primary} />
              <Text className="mt-3 text-sm" style={{ color: colors.textMuted }}>
                {translate('Loading shared content...')}
              </Text>
            </View>
          ) : error ? (
            <View className="items-center py-8">
              <X size={28} color={colors.error} />
              <Text className="mt-3 text-center font-semibold" style={{ color: colors.text }}>
                {translate('Could not import shared content')}
              </Text>
              <Text className="mt-2 text-center text-sm" style={{ color: colors.textMuted }}>
                {error}
              </Text>
            </View>
          ) : pendingImport ? (
            <View>
              <View className="flex-row items-center gap-3">
                <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: colors.surface }}>
                  <FileText size={20} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold" style={{ color: colors.text }}>
                    {summary}
                  </Text>
                  <Text className="text-xs mt-1" style={{ color: colors.textMuted }}>
                    {translate('{{count}} attachment', {
                      count: pendingImport.attachments.length,
                    })}
                  </Text>
                </View>
                <Check size={18} color={colors.success} />
              </View>

              {contentPreview ? (
                <View className="mt-4 rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
                  <Text className="text-sm" style={{ color: colors.text }} numberOfLines={5}>
                    {contentPreview}
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={() => setTargetPickerVisible(true)}
                disabled={sending || targets.length === 0}
                className="mt-5 rounded-xl flex-row items-center justify-center gap-2 py-4 active:opacity-80"
                style={{ backgroundColor: targets.length === 0 ? colors.border : colors.primary }}
              >
                {sending ? <ActivityIndicator color={colors.textOnPrimary} /> : <Send size={18} color={colors.textOnPrimary} />}
                <Text className="font-semibold" style={{ color: colors.textOnPrimary }}>
                  {sending ? translate('Sending...') : translate('Choose Recipient')}
                </Text>
              </Pressable>

              {targets.length === 0 ? (
                <Text className="mt-3 text-center text-sm" style={{ color: colors.textMuted }}>
                  {translate('No Spectra chats are available for sharing yet.')}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={discardAndLeave}
          disabled={sending}
          className="mt-4 rounded-xl py-3 items-center active:opacity-80"
          style={{ backgroundColor: colors.surface }}
        >
          <Text className="font-semibold" style={{ color: colors.text }}>
            {translate('Cancel')}
          </Text>
        </Pressable>
      </ScrollView>

      <ForwardConversationModal
        visible={targetPickerVisible}
        targets={targets}
        onClose={() => setTargetPickerVisible(false)}
        onSelect={handleSelectTarget}
      />
    </View>
  )
}
