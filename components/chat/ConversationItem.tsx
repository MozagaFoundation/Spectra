/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Users, Pin, BellOff, Skull } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/common'
import { translate } from '@/lib/i18n'
import { formatRelativeTime, formatAddress } from '@/lib/utils'
import type { ChatContact, Conversation } from '@/lib/types'
import { useThemeColors } from '@/lib/theme'
import { isHiddenConversationPreview } from '@/lib/chatHiddenPreview'
import { NearbyBadge } from './NearbyBadge'

interface ConversationItemProps {
  conversation: Conversation
  onPress: () => void
  contact?: Pick<ChatContact, 'displayName' | 'avatarUrl' | 'isOnline' | 'remoteAccountState'> | null
  isNearby?: boolean
  isPinned?: boolean
  isMuted?: boolean
  isManuallyUnread?: boolean
}

export const ConversationItem = memo(function ConversationItem({
  conversation,
  onPress,
  contact,
  isNearby,
  isPinned,
  isMuted,
  isManuallyUnread,
}: ConversationItemProps) {
  useTranslation()
  const colors = useThemeColors()
  const isGroup = conversation.type === 'group'
  const remoteAccountDeleted = !isGroup && (
    conversation.remoteAccountState === 'deleted'
    || contact?.remoteAccountState === 'deleted'
  )
  const displayName = isGroup
    ? conversation.title || translate('Group chat')
    : (contact?.displayName || conversation.displayName || (
        conversation.remoteWalletAddress
          ? formatAddress(conversation.remoteWalletAddress, 6)
          : conversation.remoteIdentityId
            ? formatAddress(conversation.remoteIdentityId, 6)
            : translate('Unknown')
      ))
  
  const rawPreview = isHiddenConversationPreview(conversation.lastMessage?.content)
    ? translate('No messages yet', { ns: 'chat' })
    : conversation.lastMessage?.content || translate('No messages yet', { ns: 'chat' })
  const lastMessagePreview = rawPreview.includes('[QMEDIA:')
    ? rawPreview.replace(/\[QMEDIA:[^\]]*\]/g, '').trim() || translate('Attachment')
    : rawPreview
  const lastMessageTime = conversation.lastMessage?.timestamp
    ? formatRelativeTime(conversation.lastMessage.timestamp)
    : ''

  const showUnreadBadge = conversation.unreadCount > 0 || isManuallyUnread
  
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 p-3 rounded-xl active:bg-surface-hover"
    >
      <Avatar
        name={displayName}
        imageUrl={remoteAccountDeleted
          ? undefined
          : isGroup ? conversation.avatarUrl : (contact?.avatarUrl || conversation.avatarUrl)}
        size="md"
        showOnlineStatus={!remoteAccountDeleted}
        isOnline={isGroup ? false : contact?.isOnline}
        previewable={!remoteAccountDeleted}
        symbol={remoteAccountDeleted ? <Skull size={22} color={colors.textOnPrimary} /> : undefined}
      />
      
      <View className="flex-1 gap-1" style={{ minWidth: 0 }}>
        <View className="flex-row justify-between items-center gap-2">
          <View className="flex-row items-center gap-1.5 flex-1" style={{ minWidth: 0 }}>
            <Text
              className="font-medium flex-1"
              style={{ color: colors.text, minWidth: 0 }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {displayName}
            </Text>
            {!isGroup && conversation.localDisplayName && (
              <View
                className="px-1.5 py-0.5 rounded-md"
                style={{ backgroundColor: colors.primary + '14', flexShrink: 1, maxWidth: '40%' }}
              >
                <Text
                  style={{ color: colors.primary, fontSize: 9, fontWeight: '700' }}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {conversation.localDisplayName}
                </Text>
              </View>
            )}
            {isGroup && (
              <View
                className="px-1.5 py-0.5 rounded-md flex-row items-center gap-0.5"
                style={{ backgroundColor: colors.primary + '14' }}
              >
                <Users size={10} color={colors.primary} />
                <Text style={{ color: colors.primary, fontSize: 9, fontWeight: '700' }}>
                  {conversation.memberCount || 0}
                </Text>
              </View>
            )}
            {!isGroup && isNearby && (
              <NearbyBadge size="small" showLabel />
            )}
            {remoteAccountDeleted && (
              <View
                className="px-1.5 py-0.5 rounded-md"
                style={{ backgroundColor: colors.error + '14', flexShrink: 1 }}
              >
                <Text style={{ color: colors.error, fontSize: 9, fontWeight: '700' }}>
                  {translate('Account deleted', { ns: 'settings' })}
                </Text>
              </View>
            )}
          </View>
          <View className="flex-row items-center gap-1.5" style={{ flexShrink: 0 }}>
            {isPinned && (
              <Pin size={12} color={colors.textMuted} />
            )}
            {lastMessageTime && (
              <Text className="text-text-muted text-xs" numberOfLines={1}>{lastMessageTime}</Text>
            )}
            {isMuted && (
              <BellOff size={14} color={colors.textMuted} />
            )}
          </View>
        </View>
        
        <View className="flex-row justify-between items-center gap-2">
          <Text className="text-text-secondary text-sm flex-1" numberOfLines={1}>
            {lastMessagePreview}
          </Text>
          
          {showUnreadBadge && (
            <View
              className="min-w-[20px] h-5 rounded-full items-center justify-center px-1.5"
              style={{ backgroundColor: colors.primary }}
            >
              {conversation.unreadCount > 0 ? (
                <Text className="text-white text-xs font-semibold">
                  {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                </Text>
              ) : (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.textOnPrimary,
                  }}
                />
              )}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  )
})
