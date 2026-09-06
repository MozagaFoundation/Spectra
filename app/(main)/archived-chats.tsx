/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useCallback, useMemo } from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import type { Href } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ConversationItem } from '@/components/chat/ConversationItem'
import { SwipeableConversationItem } from '@/components/chat/SwipeableConversationItem'
import { ChatOptionsModal } from '@/components/chat/ChatOptionsModal'
import { useChatStore, useGroupChatStore, useWalletStore } from '@/store'
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
import type { Conversation, GroupConversation } from '@/lib/types'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { isConversationListVisible } from '@/lib/conversationVisibility'

export default function ArchivedChatsScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const { i18n } = useTranslation()

  const conversations = useChatStore((s) => s.conversations)
  const groupConversations = useGroupChatStore((s) => s.groups)
  const walletAddress = useWalletStore((s) => s.wallet?.address ?? null)
  const archivedIds = useChatStore((s) => s.archivedConversationIds)
  const pinnedIds = useChatStore((s) => s.pinnedConversationIds)
  const manuallyUnreadIds = useChatStore((s) => s.manuallyUnreadConversationIds)
  const mutedIds = useChatStore((s) => s.mutedConversationIds)
  const unarchiveConversation = useChatStore((s) => s.unarchiveConversation)
  const togglePinConversation = useChatStore((s) => s.togglePinConversation)
  const toggleManuallyUnread = useChatStore((s) => s.toggleManuallyUnread)
  const toggleMuteConversation = useChatStore((s) => s.toggleMuteConversation)

  const [moreModalConversationId, setMoreModalConversationId] = useState<string | null>(null)

  const archivedSet = useMemo(() => new Set(archivedIds), [archivedIds])
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds])
  const unreadSet = useMemo(() => new Set(manuallyUnreadIds), [manuallyUnreadIds])
  const mutedSet = useMemo(() => new Set(mutedIds), [mutedIds])

  const archivedConversations = useMemo(() => {
    const all: Array<Conversation | GroupConversation> = [
      ...conversations.filter((c) => archivedSet.has(c.id) && isConversationListVisible(c)),
      ...groupConversations.filter((c) => archivedSet.has(c.id)),
    ]
    return all.sort((a, b) => {
      const aTime = a.lastMessage?.timestamp || a.createdAt
      const bTime = b.lastMessage?.timestamp || b.createdAt
      return bTime - aTime
    })
  }, [conversations, groupConversations, archivedSet])

  const handleConversationPress = useCallback((conversation: Conversation | GroupConversation) => {
    if (unreadSet.has(conversation.id)) {
      toggleManuallyUnread(conversation.id)
    }
    if (conversation.type === 'group' && conversation.groupId) {
      router.push(`/(main)/chat/${getGroupRouteParam(conversation.groupId)}` as Href)
      return
    }
    const local = conversation.localWalletAddress || walletAddress
    const localQuery = local ? `?local=${encodeURIComponent(local)}` : ''
    router.push(`/(main)/chat/${conversation.remoteIdentityId}${localQuery}` as Href)
  }, [router, unreadSet, toggleManuallyUnread, walletAddress])

  const handleUnarchive = useCallback((id: string) => {
    unarchiveConversation(id)
  }, [unarchiveConversation])

  const handlePin = useCallback((id: string) => {
    togglePinConversation(id)
  }, [togglePinConversation])

  const handleToggleUnread = useCallback((id: string) => {
    toggleManuallyUnread(id)
  }, [toggleManuallyUnread])

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

  const renderItem = useCallback(({ item }: { item: Conversation | GroupConversation }) => (
    <SwipeableConversationItem
      conversationId={item.id}
      isPinned={pinnedSet.has(item.id)}
      isManuallyUnread={unreadSet.has(item.id)}
      isArchived
      onArchive={() => {}}
      onUnarchive={handleUnarchive}
      onPin={handlePin}
      onToggleUnread={handleToggleUnread}
      onMore={handleMore}
    >
      <ConversationItem
        conversation={item}
        onPress={() => handleConversationPress(item)}
        isPinned={pinnedSet.has(item.id)}
        isMuted={mutedSet.has(item.id)}
        isManuallyUnread={unreadSet.has(item.id)}
      />
    </SwipeableConversationItem>
  ), [handleConversationPress, handleUnarchive, handlePin, handleToggleUnread, handleMore, pinnedSet, unreadSet, mutedSet])

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pb-3 gap-3">
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <ArrowLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="text-2xl font-bold" style={{ color: colors.text }}>
            {translate('Archived', { ns: 'chat' })}
          </Text>
        </View>
      </View>

      {archivedConversations.length === 0 ? (
        <View className="flex-1 items-center justify-center py-20 px-5">
          <Text className="text-lg" style={{ color: colors.textSecondary }}>
            {translate('No archived chats')}
          </Text>
          <Text className="text-center mt-2" style={{ color: colors.textMuted }}>
            {translate('Swipe left on a chat and tap Archive to move it here')}
          </Text>
        </View>
      ) : (
        <FlashList
          data={archivedConversations}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          extraData={i18n.resolvedLanguage}
          contentContainerStyle={{ paddingHorizontal: 16 }}
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
