/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { View, Text, TextInput, Pressable, RefreshControl, Modal, Alert } from 'react-native'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { useTranslation } from 'react-i18next'
import { Plus, MessageSquare, Search, Archive, ChevronRight, Lock, ShieldCheck, X, AlertTriangle } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '@/components/ui'
import { ConversationItem } from '@/components/chat/ConversationItem'
import { ListItemSkeleton } from '@/components/common/ListItemSkeleton'
import { SwipeableConversationItem } from '@/components/chat/SwipeableConversationItem'
import { ChatOptionsModal } from '@/components/chat/ChatOptionsModal'
import { StartSecretChatModal } from '@/components/chat/StartSecretChatModal'
import { ShareContactBanner } from '@/components/chat/ShareContactBanner'
import { useChatStore } from '@/store/chatStore'
import { useGroupChatStore } from '@/store/groupChatStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import { useBluetoothStore } from '@/store/bluetoothStore'
import { useUIStore } from '@/store/uiStore'
import { useShallow } from 'zustand/react/shallow'
import {
  deleteConversation,
  deleteConversationForBoth,
  clearConversationChat,
  blockContact,
  unblockContact,
  isContactBlocked,
} from '@/services/chat/chatService'
import { clearGroupChatLocally, getGroupRouteParam, leaveGroup } from '@/services/groupChat'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { matchesStrictAccountStorageScope } from '@/lib/accountScope'
import { isConversationListVisible } from '@/lib/conversationVisibility'
import type { Conversation, GroupConversation } from '@/lib/types'
import { usePrivateChatsRefresh } from '@/hooks/chatsScreen/useChatsRefresh'
import { nowRenderMs, recordRenderMetric } from '@/lib/renderMetrics'
import { markListStartupMetric } from '@/lib/performanceMetrics'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { shouldShowListSkeleton } from '@/lib/listReadiness'
import {
  describeBLEDiagnosticCause,
  describeBLEDiagnosticStopStage,
  describeBLEHandshakeProgressLabel,
  isBLESessionDiagnosticFailure,
} from '@/services/bluetooth/diagnostics'

const SEARCH_DEBOUNCE_MS = 300

function conversationListRowEquals(a: Conversation, b: Conversation): boolean {
  return a.id === b.id
    && a.createdAt === b.createdAt
    && a.displayName === b.displayName
    && a.avatarUrl === b.avatarUrl
    && a.remoteAccountState === b.remoteAccountState
    && a.lastMessage?.timestamp === b.lastMessage?.timestamp
    && a.lastMessage?.content?.length === b.lastMessage?.content?.length
    && (a.unreadCount ?? 0) === (b.unreadCount ?? 0)
    && Boolean(a.hasVisibleActivity) === Boolean(b.hasVisibleActivity)
}

function groupConversationListRowEquals(a: GroupConversation, b: GroupConversation): boolean {
  return a.id === b.id
    && a.createdAt === b.createdAt
    && a.title === b.title
    && a.subtitle === b.subtitle
    && a.avatarUrl === b.avatarUrl
    && a.lastMessage?.timestamp === b.lastMessage?.timestamp
    && a.lastMessage?.content?.length === b.lastMessage?.content?.length
    && (a.unreadCount ?? 0) === (b.unreadCount ?? 0)
}

function sameListRows<T>(
  previous: T[],
  next: T[],
  equals: (left: T, right: T) => boolean,
): boolean {
  if (previous.length !== next.length) return false
  for (let i = 0; i < next.length; i++) {
    if (previous[i] !== next[i] && !equals(previous[i], next[i])) return false
  }
  return true
}

function PrivateChatsTab({ onStartSecretChat }: { onStartSecretChat: () => void }) {
  useTranslation()
  const router = useGuardedRouter()
  const colors = useThemeColors()
  const appLanguage = useUIStore((state) => state.appLanguage)
  const {
    conversations,
    conversationsReady,
    archivedIds,
    pinnedIds,
    manuallyUnreadIds,
    mutedIds,
    archiveConversation,
    togglePinConversation,
    toggleManuallyUnread,
    toggleMuteConversation,
    loadSwipePreferences,
    contactsByIdentityId,
    contactsByWalletAddress,
    contactCount,
  } = useChatStore(useShallow((state) => ({
    conversations: state.conversations,
    conversationsReady: state.conversationsReady,
    archivedIds: state.archivedConversationIds,
    pinnedIds: state.pinnedConversationIds,
    manuallyUnreadIds: state.manuallyUnreadConversationIds,
    mutedIds: state.mutedConversationIds,
    archiveConversation: state.archiveConversation,
    togglePinConversation: state.togglePinConversation,
    toggleManuallyUnread: state.toggleManuallyUnread,
    toggleMuteConversation: state.toggleMuteConversation,
    loadSwipePreferences: state.loadSwipePreferences,
    contactsByIdentityId: state._contactsByIdentityId,
    contactsByWalletAddress: state._contactsByWalletAddress,
    contactCount: state.contacts.length,
  })))
  const groupConversations = useGroupChatStore((state) => state.groups)
  const {
    nearbyContacts,
    bluetoothStatus,
    bluetoothEnabled,
    bluetoothDiagnostics,
  } = useBluetoothStore(useShallow((state) => ({
    nearbyContacts: state.nearbyContacts,
    bluetoothStatus: state.status,
    bluetoothEnabled: state.config.enabled,
    bluetoothDiagnostics: state.diagnostics,
  })))
  const bluetoothFailure = bluetoothDiagnostics.lastFailure
  const bluetoothCause = bluetoothFailure ? describeBLEDiagnosticCause(bluetoothDiagnostics) : ''
  const bluetoothStopStage = bluetoothFailure
    ? describeBLEDiagnosticStopStage(bluetoothDiagnostics.furthestStage)
    : ''
  const bluetoothNoiseProgress = bluetoothFailure
    ? describeBLEHandshakeProgressLabel(bluetoothDiagnostics.handshakeProgress)
    : ''

  const [moreModalConversationId, setMoreModalConversationId] = useState<string | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const conversationListRef = useRef<FlashListRef<Conversation | GroupConversation>>(null)
  const walletAddress = useWalletStore((state) => state.wallet?.address ?? null)

  useEffect(() => {
    loadSwipePreferences()
  }, [loadSwipePreferences, walletAddress])

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => setDebouncedQuery(text), SEARCH_DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    conversationListRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [debouncedQuery])
  const { isRefreshing, handleRefresh } = usePrivateChatsRefresh()

  const archivedSet = useMemo(() => new Set(archivedIds), [archivedIds])
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds])
  const unreadSet = useMemo(() => new Set(manuallyUnreadIds), [manuallyUnreadIds])
  const mutedSet = useMemo(() => new Set(mutedIds), [mutedIds])
  const scopedGroupConversations = useMemo(
    () => groupConversations.filter((conv) =>
      matchesStrictAccountStorageScope(conv.localWalletAddress, walletAddress)
    ),
    [groupConversations, walletAddress],
  )
  const nearbyIdentityIds = useMemo(
    () => new Set(
      bluetoothEnabled
      && !['disabled', 'error', 'permission_denied', 'bluetooth_off'].includes(bluetoothStatus)
        ? nearbyContacts.map((contact) => contact.identityId)
        : [],
    ),
    [bluetoothEnabled, bluetoothStatus, nearbyContacts],
  )

  const archivedCount = useMemo(() => {
    return conversations
      .filter((c) => matchesStrictAccountStorageScope(c.localWalletAddress, walletAddress))
      .filter(isConversationListVisible)
      .filter((c) => archivedSet.has(c.id)).length
      + scopedGroupConversations.filter((c) => archivedSet.has(c.id)).length
  }, [conversations, scopedGroupConversations, archivedSet, walletAddress])

  const sortedConversationsRef = useRef<Array<Conversation | GroupConversation>>([])
  const conversationListCacheRef = useRef<{
    walletAddress: string | null
    debouncedQuery: string
    contactCount: number
    archivedIds: string[]
    pinnedIds: string[]
    conversations: Conversation[]
    groups: GroupConversation[]
    contactsByIdentityId: typeof contactsByIdentityId
    contactsByWalletAddress: typeof contactsByWalletAddress
  } | null>(null)
  const sortedConversations = useMemo(() => {
    const findScopedContact = (conv: Conversation) => {
      const byIdentity = contactsByIdentityId.get(conv.remoteIdentityId)
      const byWallet = conv.remoteWalletAddress
        ? contactsByWalletAddress.get(conv.remoteWalletAddress)
        : undefined
      if (byIdentity && matchesStrictAccountStorageScope(byIdentity.localWalletAddress, walletAddress)) {
        return byIdentity
      }
      if (byWallet && matchesStrictAccountStorageScope(byWallet.localWalletAddress, walletAddress)) {
        return byWallet
      }
      return undefined
    }
    const startedAt = nowRenderMs()
    const previous = conversationListCacheRef.current
    if (
      previous
      && previous.walletAddress === walletAddress
      && previous.debouncedQuery === debouncedQuery
      && previous.contactCount === contactCount
      && previous.archivedIds === archivedIds
      && previous.pinnedIds === pinnedIds
      && previous.contactsByIdentityId === contactsByIdentityId
      && previous.contactsByWalletAddress === contactsByWalletAddress
      && sameListRows(previous.conversations, conversations, conversationListRowEquals)
      && sameListRows(previous.groups, scopedGroupConversations, groupConversationListRowEquals)
    ) {
      return sortedConversationsRef.current
    }

    const directConversations = conversations.filter(
      (conv) =>
        conv.remoteIdentityId
        && conv.remoteIdentityId !== 'undefined'
        && conv.remoteIdentityId !== 'null'
        && isConversationListVisible(conv)
        && matchesStrictAccountStorageScope(conv.localWalletAddress, walletAddress)
    )

    const canonicalDirects = new Map<string, Conversation>()
    for (const conv of directConversations) {
      const contact = findScopedContact(conv)
      const localKey = conv.localWalletAddress || walletAddress || 'active'
      const canonicalKey = `${localKey}:${contact?.walletAddress || conv.remoteWalletAddress || conv.remoteIdentityId}`
      const existing = canonicalDirects.get(canonicalKey)
      if (!existing) {
        canonicalDirects.set(canonicalKey, conv)
        continue
      }

      const existingTime = existing.lastMessage?.timestamp || existing.createdAt
      const currentTime = conv.lastMessage?.timestamp || conv.createdAt
      if (currentTime > existingTime) {
        canonicalDirects.set(canonicalKey, conv)
      }
    }
    const dedupedDirects = [...canonicalDirects.values()]

    let filtered: Array<Conversation | GroupConversation> = [...dedupedDirects, ...scopedGroupConversations]
      .filter((conv) => !archivedSet.has(conv.id))

    if (debouncedQuery) {
      const lowerQuery = debouncedQuery.toLowerCase()
      filtered = filtered.filter((conv) => {
        if (conv.type === 'group') {
          return (conv.title || '').toLowerCase().includes(lowerQuery)
            || (conv.subtitle || '').toLowerCase().includes(lowerQuery)
        }
        const contact = findScopedContact(conv)
        if (contact?.displayName.toLowerCase().includes(lowerQuery)) return true
        if (conv.remoteWalletAddress?.toLowerCase().includes(lowerQuery)) return true
        return conv.remoteIdentityId.toLowerCase().includes(lowerQuery)
      })
    }

    const sorted = [...filtered].sort((a, b) => {
      const aPinned = pinnedSet.has(a.id) ? 1 : 0
      const bPinned = pinnedSet.has(b.id) ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      const aTime = a.lastMessage?.timestamp || a.createdAt
      const bTime = b.lastMessage?.timestamp || b.createdAt
      return bTime - aTime
    })
    recordRenderMetric('chats', 'derive_private_conversations', {
      elapsedMs: Number((nowRenderMs() - startedAt).toFixed(2)),
      conversations: conversations.length,
      directConversations: directConversations.length,
      groups: scopedGroupConversations.length,
      visible: sorted.length,
      legacyContactScansAvoided: directConversations.length * Math.max(contactCount, 1),
    })
    conversationListCacheRef.current = {
      walletAddress,
      debouncedQuery,
      contactCount,
      archivedIds,
      pinnedIds,
      conversations,
      groups: scopedGroupConversations,
      contactsByIdentityId,
      contactsByWalletAddress,
    }
    sortedConversationsRef.current = sorted
    return sorted
  }, [conversations, scopedGroupConversations, contactsByIdentityId, contactsByWalletAddress, debouncedQuery, archivedSet, pinnedSet, archivedIds, pinnedIds, walletAddress, contactCount])

  const handleNewChat = useCallback(() => {
    onStartSecretChat()
  }, [onStartSecretChat])

  const handleConversationPress = useCallback((conversation: Conversation | GroupConversation) => {
    if (unreadSet.has(conversation.id)) {
      toggleManuallyUnread(conversation.id)
    }
    if (conversation.type === 'group' && conversation.groupId) {
      router.push(`/(main)/chat/${getGroupRouteParam(conversation.groupId)}`)
      return
    }
    const local = conversation.localWalletAddress || walletAddress
    const localQuery = local ? `&local=${encodeURIComponent(local)}` : ''
    router.push(
      `/(main)/chat/${conversation.remoteIdentityId}?conversation=${encodeURIComponent(conversation.id)}${localQuery}`,
    )
  }, [router, unreadSet, toggleManuallyUnread, walletAddress])

  const handleMore = useCallback((conversationId: string) => {
    setMoreModalConversationId(conversationId)
  }, [])

  const moreModalConversation = useMemo(() => {
    if (!moreModalConversationId) return null
    return [...conversations, ...groupConversations].find(
      (c) => c.id === moreModalConversationId,
    ) ?? null
  }, [moreModalConversationId, conversations, groupConversations])

  const moreModalIsMuted = moreModalConversationId
    ? mutedSet.has(moreModalConversationId)
    : false

  const moreModalIsBlocked = useMemo(() => {
    if (!moreModalConversation?.remoteIdentityId) return false
    return isContactBlocked(moreModalConversation.remoteIdentityId)
  }, [moreModalConversation])

  const closeMoreModal = useCallback(() => {
    setMoreModalConversationId(null)
  }, [])

  const handleModalMute = useCallback(() => {
    if (!moreModalConversationId) return
    toggleMuteConversation(moreModalConversationId)
    closeMoreModal()
  }, [moreModalConversationId, toggleMuteConversation, closeMoreModal])

  const handleModalClearChat = useCallback(() => {
    if (!moreModalConversationId) return
    const conversation = moreModalConversation
    closeMoreModal()
    if (!conversation) return

    Alert.alert(
      translate('Clear Chat'),
      translate('This will remove all messages in this chat. This cannot be undone.'),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Clear'),
          style: 'destructive',
          onPress: async () => {
            const result = conversation.type === 'group' && conversation.groupId
              ? await clearGroupChatLocally(conversation.groupId)
              : await clearConversationChat(conversation.id)
            if (result.error) {
              Alert.alert(translate('Could not clear chat'), getErrorDisplayMessage(result.error))
            }
          },
        },
      ],
    )
  }, [moreModalConversationId, moreModalConversation, closeMoreModal])

  const handleModalDeleteChat = useCallback(() => {
    if (!moreModalConversationId) return
    const conversation = moreModalConversation
    closeMoreModal()
    if (!conversation) return

    if (conversation.type !== 'group') {
      Alert.alert(
        translate('Delete Chat'),
        translate('Choose whether to remove this conversation only from this device or for both participants.'),
        [
          { text: translate('Cancel'), style: 'cancel' },
          {
            text: translate('Delete for me'),
            style: 'destructive',
            onPress: async () => {
              const { error } = await deleteConversation(conversation.id)
              if (error) console.warn('Failed to delete conversation:', error)
            },
          },
          {
            text: translate('Delete for both'),
            style: 'destructive',
            onPress: async () => {
              const { error } = await deleteConversationForBoth(
                conversation.id,
                conversation.remoteIdentityId,
              )
              if (error) console.warn('Failed to delete conversation for both:', error)
            },
          },
        ],
      )
      return
    }

    if (conversation.type === 'group') {
      Alert.alert(
        translate('Leave Group'),
        translate('You will stop receiving messages from this group.'),
        [
          { text: translate('Cancel'), style: 'cancel' },
          {
            text: translate('Leave'),
            style: 'destructive',
            onPress: async () => {
              if (!conversation.groupId) return
              try {
                await leaveGroup(conversation.groupId)
              } catch (error) {
                Alert.alert(translate('Could not leave group'), (error as Error).message)
              }
            },
          },
        ],
      )
      return
    }

    Alert.alert(
      translate('Delete Chat'),
      translate('This will permanently delete this conversation. This cannot be undone.'),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Delete'),
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteConversation(moreModalConversationId)
            if (error) Alert.alert(translate('Could not delete chat'), getErrorDisplayMessage(error))
          },
        },
      ],
    )
  }, [moreModalConversationId, moreModalConversation, closeMoreModal])

  const handleModalBlock = useCallback(() => {
    if (!moreModalConversation?.remoteIdentityId) return
    const identityId = moreModalConversation.remoteIdentityId
    const blocked = isContactBlocked(identityId)
    closeMoreModal()
    Alert.alert(
      translate(blocked ? 'Unblock Contact' : 'Block Contact'),
      blocked
        ? translate('They will be able to send you messages again.')
        : translate('You will no longer receive messages from this contact.'),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate(blocked ? 'Unblock' : 'Block'),
          style: blocked ? 'default' : 'destructive',
          onPress: () => {
            if (blocked) {
              unblockContact(identityId)
            } else {
              blockContact(identityId)
            }
          },
        },
      ],
    )
  }, [moreModalConversation, closeMoreModal])

  const handleArchive = useCallback((id: string) => {
    archiveConversation(id)
  }, [archiveConversation])

  const handlePin = useCallback((id: string) => {
    togglePinConversation(id)
  }, [togglePinConversation])

  const handleToggleUnread = useCallback((id: string) => {
    toggleManuallyUnread(id)
  }, [toggleManuallyUnread])

  const getConversationContact = useCallback((conversation: Conversation | GroupConversation) => {
    if (conversation.type === 'group') return null
    const byIdentity = contactsByIdentityId.get(conversation.remoteIdentityId)
    if (byIdentity && matchesStrictAccountStorageScope(byIdentity.localWalletAddress, walletAddress)) {
      return byIdentity
    }
    const byRemoteIdentityWallet = contactsByWalletAddress.get(conversation.remoteIdentityId)
    if (
      byRemoteIdentityWallet
      && matchesStrictAccountStorageScope(byRemoteIdentityWallet.localWalletAddress, walletAddress)
    ) {
      return byRemoteIdentityWallet
    }
    const byWallet = conversation.remoteWalletAddress
      ? contactsByWalletAddress.get(conversation.remoteWalletAddress)
      : undefined
    if (byWallet && matchesStrictAccountStorageScope(byWallet.localWalletAddress, walletAddress)) {
      return byWallet
    }
    return null
  }, [contactsByIdentityId, contactsByWalletAddress, walletAddress])

  const renderConversation = useCallback(({ item }: { item: Conversation | GroupConversation }) => {
    const contact = getConversationContact(item)
    const isNearby = item.type !== 'group'
      && nearbyIdentityIds.has(contact?.identityId || item.remoteIdentityId)
    return (
      <SwipeableConversationItem
        conversationId={item.id}
        isPinned={pinnedSet.has(item.id)}
        isManuallyUnread={unreadSet.has(item.id)}
        onArchive={handleArchive}
        onPin={handlePin}
        onToggleUnread={handleToggleUnread}
        onMore={handleMore}
      >
        <ConversationItem
          conversation={item}
          onPress={() => handleConversationPress(item)}
          contact={contact}
          isNearby={isNearby}
          isPinned={pinnedSet.has(item.id)}
          isMuted={mutedSet.has(item.id)}
          isManuallyUnread={unreadSet.has(item.id)}
        />
      </SwipeableConversationItem>
    )
  }, [getConversationContact, handleConversationPress, handleArchive, handlePin, handleToggleUnread, handleMore, nearbyIdentityIds, pinnedSet, unreadSet, mutedSet])

  const ListHeader = useMemo(() => {
    if (archivedCount === 0) return null
    return (
      <Pressable
        onPress={() => router.push('/(main)/archived-chats')}
        className="flex-row items-center gap-3 px-3 py-3 mb-1"
      >
        <View
          className="w-10 h-10 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.surface }}
        >
          <Archive size={18} color={colors.textMuted} />
        </View>
        <Text className="flex-1 font-medium" style={{ color: colors.text }}>
          {translate('Archived', { ns: 'chat' })}
        </Text>
        <Text className="text-sm mr-1" style={{ color: colors.textMuted }}>
          {archivedCount}
        </Text>
        <ChevronRight size={16} color={colors.textMuted} />
      </Pressable>
    )
  }, [archivedCount, colors, router])

  const hasCachedConversationData = conversations.some((conversation) =>
    matchesStrictAccountStorageScope(conversation.localWalletAddress, walletAddress)
  ) || scopedGroupConversations.length > 0 || archivedCount > 0
  const handleListLoad = useCallback(() => {
    markListStartupMetric('chats_first_paint', {
      count: sortedConversations.length,
      routeClass: 'chats',
    })
  }, [sortedConversations.length])

  return (
    <View className="flex-1">
      <View className="px-5 pb-3">
        <View className="flex-row bg-surface rounded-xl px-3 items-center gap-2">
          <Search size={18} color={colors.textMuted} />
          <TextInput
            className="flex-1 py-3 text-text"
            placeholder={translate('Search conversations...', { ns: 'chat' })}
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={handleSearchChange}
          />
        </View>
      </View>

      {bluetoothEnabled && nearbyContacts.length === 0 && isBLESessionDiagnosticFailure(bluetoothFailure) ? (
        <View
          testID="bluetooth-session-failure-banner"
          className="mx-5 mb-3 rounded-xl border px-3 py-2 flex-row items-start gap-2"
          style={{
            borderColor: `${colors.error}55`,
            backgroundColor: `${colors.error}0D`,
          }}
        >
          <AlertTriangle size={14} color={colors.error} style={{ marginTop: 1 }} />
          <View className="flex-1">
            <Text style={{ color: colors.error, fontSize: 12, fontWeight: '700' }}>
              {translate('Nearby Bluetooth session is down.')}
            </Text>
            <Text className="text-text-muted text-xs mt-0.5">
              {translate(bluetoothCause)}
            </Text>
            {bluetoothStopStage ? (
              <Text className="text-text-muted text-xs mt-0.5">
                {translate(bluetoothStopStage)}
                {' '}
                {translate(bluetoothNoiseProgress)}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {shouldShowListSkeleton(conversationsReady, hasCachedConversationData) ? (
        <ListItemSkeleton />
      ) : sortedConversations.length === 0 && archivedCount === 0 ? (
        <View className="flex-1 items-center justify-center py-20 px-5">
          <View
            className="w-20 h-20 rounded-3xl items-center justify-center mb-5"
            style={{ backgroundColor: colors.primary + '1a' }}
          >
            <MessageSquare size={36} color={colors.primary} />
          </View>
          <Text className="text-text-secondary text-lg text-center mb-2">
            {translate('No conversations yet', { ns: 'chat' })}
          </Text>
          <Text className="text-text-muted text-center mb-5 max-w-[260px]">
            {translate('Start a new chat by adding a contact with their Post-Quantum address', {
              ns: 'chat',
            })}
          </Text>
          <Button variant="primary" onPress={handleNewChat}>
            {translate('Start New Chat', { ns: 'chat' })}
          </Button>
        </View>
      ) : (
        <FlashList
          ref={conversationListRef}
          data={sortedConversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item.id}
          extraData={{
            appLanguage,
            contactsByIdentityId,
            nearbyIdentityIds,
            pinnedSet,
            unreadSet,
            mutedSet,
          }}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          maintainVisibleContentPosition={{ disabled: true }}
          ListHeaderComponent={ListHeader}
          onLoad={handleListLoad}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
        />
      )}

      <ChatOptionsModal
        visible={moreModalConversationId !== null}
        conversation={moreModalConversation}
        isMuted={moreModalIsMuted}
        isBlocked={moreModalIsBlocked}
        onClose={closeMoreModal}
        onMute={handleModalMute}
        onClearChat={handleModalClearChat}
        onDeleteChat={handleModalDeleteChat}
        onBlock={handleModalBlock}
      />
    </View>
  )
}

export default function ChatsScreen() {
  useTranslation()
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const activeWallet = useWalletStore((state) => state.wallet)
  const normalWalletCount = useWalletStore((state) => (
    spectreEnabled ? 0 : state.wallets.filter((wallet) => wallet.spectreMode !== true).length
  ))
  const [showNewConvoModal, setShowNewConvoModal] = useState(false)
  const [showStartSecretChatModal, setShowStartSecretChatModal] = useState(false)

  const handleOpenStartSecretChat = useCallback(() => {
    setShowNewConvoModal(false)
    setShowStartSecretChatModal(true)
  }, [])

  const handleNewPress = useCallback(() => {
    setShowNewConvoModal(true)
  }, [])

  const newButtonLabel = translate('New')

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pb-3 gap-3">
        <View className="flex-row justify-between items-center">
          <Text className="text-2xl font-bold text-text">
            {translate('Chats', { ns: 'navigation' })}
          </Text>
          <Pressable
            onPress={handleNewPress}
            className="flex-row items-center bg-primary px-3 py-2 rounded-xl gap-1"
          >
            <Plus size={18} color={colors.textOnPrimary} />
            <Text className="font-semibold" style={{ color: colors.textOnPrimary }}>
              {newButtonLabel}
            </Text>
          </Pressable>
        </View>
      </View>

      <PrivateChatsTab onStartSecretChat={handleOpenStartSecretChat} />

      <ShareContactBanner variant="tabStrip" />

      <Modal
        visible={showNewConvoModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNewConvoModal(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: colors.overlay }}
          onPress={() => setShowNewConvoModal(false)}
        >
          <Pressable
            className="rounded-t-3xl"
            style={{ paddingBottom: insets.bottom + 16, backgroundColor: colors.backgroundSecondary }}
            onPress={() => {}}
          >
            <View className="items-center pt-3 pb-2">
              <View className="w-10 h-1 rounded-full" style={{ backgroundColor: colors.border }} />
            </View>

            <View className="flex-row items-center px-5 pb-4 gap-3">
              <View className="flex-1">
                <Text className="text-lg font-bold" style={{ color: colors.text }}>
                  {translate('Create a New Conversation', { ns: 'chat' })}
                </Text>
                <Text className="text-sm mt-0.5" style={{ color: colors.textMuted }}>
                  {translate('Select a conversation type', { ns: 'chat' })}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowNewConvoModal(false)}
                className="w-8 h-8 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.surface }}
                hitSlop={8}
              >
                <X size={16} color={colors.textMuted} />
              </Pressable>
            </View>

            {normalWalletCount > 1 && activeWallet ? (
              <View className="mx-5 mb-4">
                <View
                  className="flex-row items-center justify-center gap-2 rounded-xl px-3 py-2.5"
                  style={{ backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '20' }}
                >
                  <View
                    className="w-5 h-5 rounded-full items-center justify-center"
                    style={{ backgroundColor: colors.primary + '30' }}
                  >
                    <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '700' }}>
                      {(activeWallet.displayName || 'E')[0].toUpperCase()}
                    </Text>
                  </View>
                  <Text className="text-xs font-medium" style={{ color: colors.primary }}>
                    {translate('Sending as {{account}}', {
                      ns: 'chat',
                      account: activeWallet.displayName || translate('EXO Account'),
                    })}
                  </Text>
                </View>
              </View>
            ) : null}

            <View className="mx-5 h-px" style={{ backgroundColor: colors.border }} />

            <View className="px-5 pt-4 gap-3">
              <Pressable
                className="flex-row items-center gap-4 p-4 rounded-2xl active:opacity-70"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                onPress={() => {
                  handleOpenStartSecretChat()
                }}
              >
                <View
                  className="w-12 h-12 rounded-2xl items-center justify-center"
                  style={{ backgroundColor: colors.primary + '18' }}
                >
                  <Lock size={22} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-[15px]" style={{ color: colors.text }}>
                    {translate('Private Message', { ns: 'chat' })}
                  </Text>
                  <Text className="text-[13px] mt-1" style={{ color: colors.textMuted }}>
                    {translate('End-to-end encrypted')}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                className="flex-row items-center gap-4 p-4 rounded-2xl active:opacity-70"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                onPress={() => {
                  setShowNewConvoModal(false)
                  router.push('/(main)/group/create')
                }}
              >
                <View
                  className="w-12 h-12 rounded-2xl items-center justify-center"
                  style={{ backgroundColor: colors.primary + '18' }}
                >
                  <ShieldCheck size={22} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-[15px]" style={{ color: colors.text }}>
                    {translate('Secure Group', { ns: 'chat' })}
                  </Text>
                  <Text className="text-[13px] mt-1" style={{ color: colors.textMuted }}>
                    {translate('Encrypted Group Communication', { ns: 'chat' })}
                  </Text>
                </View>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <StartSecretChatModal
        visible={showStartSecretChatModal}
        onClose={() => setShowStartSecretChatModal(false)}
      />
    </View>
  )
}
