/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useRef, useEffect, useCallback, useMemo } from 'react'
import { View, Text, ActivityIndicator, ImageBackground, Pressable } from 'react-native'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import type { FlashListRef } from '@shopify/flash-list'
import { LinearGradient } from 'expo-linear-gradient'
import { Shield } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { translate } from '@/lib/i18n'
import { useIsSpectreThemeActive, useThemeColors } from '@/lib/theme'
import { useUIStore } from '@/store/uiStore'
import { MessageBubble } from '@/components/chat/MessageBubble'
import { PRESET_MAP } from '@/lib/chatBackgrounds'
import { formatDate } from '@/lib/utils'
import { recordRenderMetric } from '@/lib/renderMetrics'
import type { ChatContact, ChatMessage, GroupChatMember, MediaAttachment, OneTimeRevealPayload, ReplyReference } from '@/lib/types'
import type { ChatListItem } from '@/hooks/chatScreen/useChatMessages'
import type { CryptoReceipt } from '@/services/crypto/receipts'
import type { CryptoPaymentRequest } from '@/services/shared/cryptoPaymentRequest'

const DateHeader = React.memo(function DateHeader({ date }: { date: string }) {
  useTranslation()

  return (
    <View className="items-center py-2">
      <View className="bg-surface px-3 py-1.5 rounded-full">
        <Text className="text-text-muted text-xs">
          {formatDate(new Date(date).getTime())}
        </Text>
      </View>
    </View>
  )
})

interface ChatMessageListProps {
  conversationKey: string
  listRef: React.RefObject<FlashListRef<ChatListItem> | null>
  data: ChatListItem[]
  extraData: unknown
  isLoading: boolean
  isSyncing: boolean
  isGroupChat: boolean
  hasOlderMessages: boolean
  isLoadingOlder: boolean
  onLoadOlder: () => void | Promise<void>
  contactName: string
  contactAvatarUrl: string | null | undefined
  contacts: Array<Pick<ChatContact, 'identityId' | 'avatarUrl'>>
  groupMembers: Array<Pick<GroupChatMember, 'identityId' | 'displayName'>>
  onNearBottomChange?: (isNearBottom: boolean) => void
  onScrollBeginDrag?: () => void
  onMessageLongPress?: (message: ChatMessage) => void
  onReplyPress?: (target: ReplyReference) => void
  onRevealViewOnce?: (message: ChatMessage) => Promise<OneTimeRevealPayload | null>
  onConsumeViewOnce?: (message: ChatMessage) => Promise<void>
  onRetryFailedMessage?: (message: ChatMessage) => Promise<void>
  onEditImageAttachment?: (message: ChatMessage, attachment: MediaAttachment) => Promise<void> | void
  onCryptoReceiptPress?: (receipt: CryptoReceipt) => void
  onCryptoPaymentRequestPress?: (message: ChatMessage, request: CryptoPaymentRequest) => void
}

interface MessageListRowProps {
  item: Extract<ChatListItem, { type: 'message' }>
  contactAvatarUrl: string | null | undefined
  contactAvatarUrlById: Map<string, string | null | undefined>
  contactName: string
  groupMemberNameById: Map<string, string | undefined>
  isGroupChat: boolean
  onConsumeViewOnce?: (message: ChatMessage) => Promise<void>
  onCryptoPaymentRequestPress?: (message: ChatMessage, request: CryptoPaymentRequest) => void
  onCryptoReceiptPress?: (receipt: CryptoReceipt) => void
  onEditImageAttachment?: (message: ChatMessage, attachment: MediaAttachment) => Promise<void> | void
  onMessageLongPress?: (message: ChatMessage) => void
  onReplyPress?: (target: ReplyReference) => void
  onRetryFailedMessage?: (message: ChatMessage) => Promise<void>
  onRevealViewOnce?: (message: ChatMessage) => Promise<OneTimeRevealPayload | null>
}

class MessageBubbleErrorBoundary extends React.Component<
  { children: React.ReactNode; messageId: string },
  { failedMessageId: string | null }
> {
  state: { failedMessageId: string | null } = { failedMessageId: null }

  static getDerivedStateFromError(_: Error) {
    return { failedMessageId: '__current__' }
  }

  componentDidCatch(error: Error) {
    console.warn('Failed to render chat message:', error)
  }

  componentDidUpdate(previousProps: { messageId: string }) {
    if (previousProps.messageId !== this.props.messageId && this.state.failedMessageId) {
      this.setState({ failedMessageId: null })
    }
  }

  render() {
    if (this.state.failedMessageId) {
      return (
        <View className="self-center max-w-[90%] px-3 py-2 rounded-full border border-border/40 bg-surface/70">
          <Text className="text-text-muted text-xs text-center">
            {translate('Message unavailable')}
          </Text>
        </View>
      )
    }

    return this.props.children
  }
}

const MessageListRow = React.memo(function MessageListRow({
  item,
  contactAvatarUrl,
  contactAvatarUrlById,
  contactName,
  groupMemberNameById,
  isGroupChat,
  onConsumeViewOnce,
  onCryptoPaymentRequestPress,
  onCryptoReceiptPress,
  onEditImageAttachment,
  onMessageLongPress,
  onReplyPress,
  onRetryFailedMessage,
  onRevealViewOnce,
}: MessageListRowProps) {
  const renderCountRef = useRef(0)
  renderCountRef.current += 1
  useEffect(() => {
    recordRenderMetric('chat_screen', 'message_row_render', {
      renders: renderCountRef.current,
      isGroupChat,
      isOwn: item.isOwn,
      hasAttachments: Boolean(item.message.attachments?.length),
      status: item.message.status || null,
    })
  })

  return (
    <View className="py-1.5">
      <MessageBubbleErrorBoundary messageId={item.message.id}>
        <MessageBubble
          message={item.message}
          isOwn={item.isOwn}
          showAvatar={item.showAvatar}
          contactName={contactName}
          contactAvatarUrl={contactAvatarUrl}
          senderName={isGroupChat ? (item.message.senderName || groupMemberNameById.get(item.message.senderId) || contactName) : undefined}
          senderAvatarUrl={isGroupChat ? contactAvatarUrlById.get(item.message.senderId) : undefined}
          onLongPress={onMessageLongPress}
          onReplyPress={onReplyPress}
          onRevealViewOnce={onRevealViewOnce}
          onConsumeViewOnce={onConsumeViewOnce}
          onRetryFailedMessage={onRetryFailedMessage}
          onEditImageAttachment={onEditImageAttachment}
          onCryptoReceiptPress={onCryptoReceiptPress}
          onCryptoPaymentRequestPress={onCryptoPaymentRequestPress}
        />
      </MessageBubbleErrorBoundary>
    </View>
  )
})

export const ChatMessageList = React.memo(function ChatMessageList({
  conversationKey,
  listRef,
  data,
  extraData,
  isLoading,
  isSyncing,
  isGroupChat,
  hasOlderMessages,
  isLoadingOlder,
  onLoadOlder,
  contactName,
  contactAvatarUrl,
  contacts,
  groupMembers,
  onNearBottomChange,
  onScrollBeginDrag,
  onMessageLongPress,
  onReplyPress,
  onRevealViewOnce,
  onConsumeViewOnce,
  onRetryFailedMessage,
  onEditImageAttachment,
  onCryptoReceiptPress,
  onCryptoPaymentRequestPress,
}: ChatMessageListProps) {
  useTranslation()
  const colors = useThemeColors()
  const spectreThemeActive = useIsSpectreThemeActive()
  const chatBackground = useUIStore((s) => s.chatBackground)
  const renderCountRef = useRef(0)
  renderCountRef.current += 1
  useEffect(() => {
    recordRenderMetric('chat_screen', 'message_list_render', {
      renders: renderCountRef.current,
      items: data.length,
      isLoading,
      isSyncing,
      isGroupChat,
    })
  }, [data.length, isGroupChat, isLoading, isSyncing])
  const groupMemberNameById = useMemo(
    () => new Map(groupMembers.map((member) => [member.identityId, member.displayName])),
    [groupMembers],
  )
  const contactAvatarUrlById = useMemo(
    () => new Map(contacts.map((entry) => [entry.identityId, entry.avatarUrl])),
    [contacts],
  )

  const renderItem = useCallback(({ item }: { item: ChatListItem }) => {
    if (item.type === 'header') {
      return <DateHeader date={item.date} />
    }
    return (
      <MessageListRow
        item={item}
        contactAvatarUrl={contactAvatarUrl}
        contactAvatarUrlById={contactAvatarUrlById}
        contactName={contactName}
        groupMemberNameById={groupMemberNameById}
        isGroupChat={isGroupChat}
        onConsumeViewOnce={onConsumeViewOnce}
        onCryptoPaymentRequestPress={onCryptoPaymentRequestPress}
        onCryptoReceiptPress={onCryptoReceiptPress}
        onEditImageAttachment={onEditImageAttachment}
        onMessageLongPress={onMessageLongPress}
        onReplyPress={onReplyPress}
        onRetryFailedMessage={onRetryFailedMessage}
        onRevealViewOnce={onRevealViewOnce}
      />
    )
  }, [contactName, contactAvatarUrl, contactAvatarUrlById, groupMemberNameById, onConsumeViewOnce, onCryptoPaymentRequestPress, onCryptoReceiptPress, onEditImageAttachment, onMessageLongPress, onReplyPress, onRetryFailedMessage, onRevealViewOnce, isGroupChat])

  const getItemType = useCallback((item: ChatListItem) => item.type, [])
  const keyExtractor = useCallback((item: ChatListItem) => item.key, [])
  const handleLoadOlderPress = useCallback(() => {
    void onLoadOlder()
  }, [onLoadOlder])
  const isNearBottomRef = useRef(true)
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y
    const isNearBottom = distanceFromBottom <= 160
    if (isNearBottom === isNearBottomRef.current) {
      return
    }
    isNearBottomRef.current = isNearBottom
    onNearBottomChange?.(isNearBottom)
  }, [onNearBottomChange])
  useEffect(() => {
    isNearBottomRef.current = true
    onNearBottomChange?.(true)
  }, [conversationKey, onNearBottomChange])
  const hasMessages = data.length > 0
  const hasCompletedInitialScrollRef = useRef(false)
  const initialScrollConversationKeyRef = useRef(conversationKey)
  if (initialScrollConversationKeyRef.current !== conversationKey) {
    initialScrollConversationKeyRef.current = conversationKey
    hasCompletedInitialScrollRef.current = false
    isNearBottomRef.current = true
  }
  const handleListLoad = useCallback(() => {
    if (hasCompletedInitialScrollRef.current || data.length === 0) return
    hasCompletedInitialScrollRef.current = true
    listRef.current?.scrollToEnd({ animated: false })
  }, [data.length, listRef])
  const latestMessageItem = useMemo(() => {
    for (let index = data.length - 1; index >= 0; index -= 1) {
      const item = data[index]
      if (item.type === 'message') return item
    }
    return undefined
  }, [data])
  const latestMessageVersion = latestMessageItem
    ? `${latestMessageItem.message.id}:${latestMessageItem.message.content?.length ?? 0}`
    : null
  const latestMessageIsOwn = latestMessageItem?.isOwn === true
  const loadOlderControl = hasOlderMessages ? (
    <View className="items-center py-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={translate('Load more', { ns: 'chat' })}
        disabled={isLoadingOlder}
        onPress={handleLoadOlderPress}
        className="min-w-[120px] flex-row items-center justify-center rounded-full px-4 py-2"
        style={{
          backgroundColor: colors.primary + '1A',
          opacity: isLoadingOlder ? 0.7 : 1,
        }}
      >
        {isLoadingOlder ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text style={{ color: colors.primary }} className="text-sm font-medium">
            {translate('Load more', { ns: 'chat' })}
          </Text>
        )}
      </Pressable>
    </View>
  ) : null
  const previousLatestMessageRef = useRef<{
    conversationKey: string
    version: string | null
  }>({ conversationKey, version: latestMessageVersion })
  useEffect(() => {
    const previous = previousLatestMessageRef.current
    previousLatestMessageRef.current = {
      conversationKey,
      version: latestMessageVersion,
    }
    if (
      previous.conversationKey !== conversationKey
      || !previous.version
      || !latestMessageVersion
      || previous.version === latestMessageVersion
    ) {
      return
    }
    const timer = setTimeout(() => {
      if (latestMessageIsOwn || isNearBottomRef.current) {
        listRef.current?.scrollToEnd({ animated: latestMessageIsOwn })
      }
    }, 150)
    return () => clearTimeout(timer)
  }, [conversationKey, latestMessageIsOwn, latestMessageVersion, listRef])

  const messagesContent = (
    <>
      {isLoading && !hasMessages ? (
        <View className="flex-1 items-center justify-center py-20">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="text-text-muted mt-4">{translate('Loading messages...')}</Text>
        </View>
      ) : !hasMessages ? (
        <View className="flex-1 items-center justify-center py-20">
          <View
            className="w-16 h-16 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: colors.primary + '1A' }}
          >
            <Shield size={28} color={colors.primary} />
          </View>
          <Text className="text-text-secondary text-center mb-2">
            {translate('Conversation started')}
          </Text>
          <Text className="text-text-muted text-sm text-center max-w-[260px]">
            {translate('End-to-end encrypted')}
          </Text>
        </View>
      ) : (
        <>
          <FlashList
            key={conversationKey}
            ref={listRef}
            data={data}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            extraData={extraData}
            ListHeaderComponent={loadOlderControl}
            maintainVisibleContentPosition={{ startRenderingFromBottom: true }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
            onLoad={handleListLoad}
            onScroll={handleScroll}
            onScrollBeginDrag={onScrollBeginDrag}
            scrollEventThrottle={16}
          />
        </>
      )}
    </>
  )

  if (!spectreThemeActive && chatBackground.type === 'preset') {
    const preset = PRESET_MAP.get(chatBackground.id)
    if (preset) {
      return (
        <LinearGradient
          colors={preset.colors}
          start={preset.start || { x: 0, y: 0 }}
          end={preset.end || { x: 1, y: 1 }}
          style={{ flex: 1 }}
        >
          {messagesContent}
        </LinearGradient>
      )
    }
  }

  if (!spectreThemeActive && chatBackground.type === 'custom') {
    return (
      <ImageBackground
        source={{ uri: chatBackground.uri }}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}>
          {messagesContent}
        </View>
      </ImageBackground>
    )
  }

  return <View className="flex-1">{messagesContent}</View>
})
