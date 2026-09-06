/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Shield, Phone, Ban, Users, EllipsisVertical, Clock3, Skull } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '@/lib/theme'
import { Avatar } from '@/components/common'
import { TorDeliveryIndicator } from '@/components/chat'
import { BLERouteIndicator } from '@/components/chat/BLERouteIndicator'
import { NearbyBadge } from '@/components/chat/NearbyBadge'
import { translate } from '@/lib/i18n'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import type { TransportRoute } from '@/services/bluetooth/types'

interface ChatHeaderProps {
  address: string | undefined
  isGroupChat: boolean
  groupId: string | null
  contactName: string
  contactAvatarUrl: string | null | undefined
  isBlocked: boolean
  remoteAccountDeleted?: boolean
  contactIsOnline: boolean | undefined
  bleRoute: TransportRoute
  isPeerNearby: boolean
  internetAvailable: boolean
  torEnabled: boolean
  peerTorCallAlert: { title: string; message: string; reason: string } | null
  groupMemberCount: number
  disappearingTimerLabel?: string
  localDisplayName?: string
  localWalletAddress?: string
  onOpenOptions?: () => void
  onOpenCallOptions?: () => void
}

export const ChatHeader = React.memo(function ChatHeader({
  address,
  isGroupChat,
  groupId,
  contactName,
  contactAvatarUrl,
  isBlocked,
  remoteAccountDeleted = false,
  contactIsOnline,
  bleRoute,
  isPeerNearby,
  internetAvailable,
  torEnabled,
  peerTorCallAlert,
  groupMemberCount,
  disappearingTimerLabel,
  localDisplayName,
  localWalletAddress,
  onOpenOptions,
  onOpenCallOptions,
}: ChatHeaderProps) {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  useTranslation()
  const titlePressHandler = isGroupChat && groupId
    ? () => router.push(`/(main)/group/${groupId}/info`)
    : address
      ? () => {
          const localQuery = localWalletAddress ? `?local=${encodeURIComponent(localWalletAddress)}` : ''
          router.push(`/(main)/contact/${address}${localQuery}`)
        }
      : undefined

  return (
    <View
      className="flex-row items-center gap-3 px-3 pb-3 border-b border-border"
      style={{ paddingTop: insets.top }}
    >
      <Pressable testID="chat-header-back" onPress={() => router.back()} className="p-2">
        <ChevronLeft size={24} color={colors.text} />
      </Pressable>

      <Pressable
        testID="chat-header-title"
        className="flex-1 flex-row items-center gap-3"
        style={{ minWidth: 0 }}
        onPress={titlePressHandler}
        disabled={!titlePressHandler}
      >
        <Avatar
          name={contactName}
          imageUrl={remoteAccountDeleted ? undefined : contactAvatarUrl}
          size="md"
          showOnlineStatus={!remoteAccountDeleted}
          isOnline={isGroupChat ? false : contactIsOnline}
          previewable={!remoteAccountDeleted}
          symbol={remoteAccountDeleted ? <Skull size={22} color={colors.textOnPrimary} /> : undefined}
        />
        <View className="flex-1" style={{ minWidth: 0 }}>
          <View className="flex-row items-center gap-1.5" style={{ minWidth: 0 }}>
            <Text
              className="font-semibold flex-1"
              style={{ color: colors.text, minWidth: 0 }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {contactName}
            </Text>
            {isPeerNearby && <NearbyBadge />}
          </View>
          <View className="flex-row items-center gap-1">
            {isBlocked ? (
              <>
                <Ban size={12} color={colors.error} />
                <Text className="text-error text-xs">{translate('Blocked')}</Text>
              </>
            ) : remoteAccountDeleted ? (
              <>
                <Skull size={12} color={colors.error} />
                <Text className="text-error text-xs">{translate('Account deleted', { ns: 'settings' })}</Text>
              </>
            ) : isGroupChat ? (
              <>
                <Users size={12} color={colors.primary} />
                <Text className="text-text-muted text-xs">
                  {translate('{{count}} member{{suffix}}', {
                    count: groupMemberCount,
                    suffix: groupMemberCount === 1 ? '' : 's',
                  })}
                </Text>
                {torEnabled ? (
                  <TorDeliveryIndicator compact isGroupChat />
                ) : null}
              </>
            ) : disappearingTimerLabel ? (
              <>
                <Clock3 size={12} color={colors.primary} />
                <Text className="text-text-muted text-xs" numberOfLines={1}>
                  {disappearingTimerLabel}
                </Text>
              </>
            ) : localDisplayName ? (
              <>
                <Shield size={12} color={colors.success} />
                <Text className="text-text-muted text-xs" numberOfLines={1}>
                  {translate('via {{account}}', { account: localDisplayName })}
                </Text>
              </>
            ) : bleRoute !== 'internet' ? (
              <BLERouteIndicator route={bleRoute} internetAvailable={internetAvailable} />
            ) : torEnabled ? (
              <TorDeliveryIndicator compact />
            ) : (
              <>
                <Shield size={12} color={colors.success} />
                <Text className="text-text-muted text-xs">{translate('End-to-end encrypted')}</Text>
              </>
            )}
          </View>
        </View>
      </Pressable>

      {!isBlocked && (
        <>
          {!isGroupChat && onOpenOptions ? (
            <Pressable testID="chat-header-chat-options" onPress={onOpenOptions} className="p-2">
              <EllipsisVertical size={20} color={colors.text} />
            </Pressable>
          ) : null}
          {!isGroupChat && !remoteAccountDeleted && onOpenCallOptions ? (
            <Pressable
              testID="chat-header-call-options"
              onPress={onOpenCallOptions}
              disabled={Boolean(peerTorCallAlert)}
              className={`p-2 ${peerTorCallAlert ? 'opacity-40' : ''}`}
            >
              <Phone size={20} color={peerTorCallAlert ? colors.textTertiary : colors.text} />
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  )
})
