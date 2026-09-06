/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useRef } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable'
import Reanimated, {
  type SharedValue,
  useAnimatedStyle,
  interpolate,
} from 'react-native-reanimated'
import {
  MoreHorizontal,
  Archive,
  MessageCircle,
  Pin,
  ArchiveRestore,
} from 'lucide-react-native'
import { translate } from '@/lib/i18n'

const ACTION_WIDTH = 75

interface SwipeableConversationItemProps {
  children: React.ReactNode
  conversationId: string
  isPinned: boolean
  isManuallyUnread: boolean
  isArchived?: boolean
  onArchive: (id: string) => void
  onUnarchive?: (id: string) => void
  onPin: (id: string) => void
  onToggleUnread: (id: string) => void
  onMore: (id: string) => void
  disabled?: boolean
}

function RightActionButton({
  drag,
  color,
  icon,
  label,
  onPress,
}: {
  drag: SharedValue<number>
  color: string
  icon: React.ReactNode
  label: string
  onPress: () => void
}) {
  const animStyle = useAnimatedStyle(() => ({
    transform: [{
      translateX: interpolate(
        drag.value,
        [-ACTION_WIDTH * 2, 0],
        [0, ACTION_WIDTH * 2],
        'clamp',
      ),
    }],
  }))

  return (
    <Reanimated.View style={[styles.actionButton, animStyle]}>
      <Pressable onPress={onPress} style={[styles.actionPressable, { backgroundColor: color }]}>
        {icon}
        <Text style={styles.actionLabel}>{label}</Text>
      </Pressable>
    </Reanimated.View>
  )
}

function LeftActionButton({
  drag,
  color,
  icon,
  label,
  onPress,
}: {
  drag: SharedValue<number>
  color: string
  icon: React.ReactNode
  label: string
  onPress: () => void
}) {
  const animStyle = useAnimatedStyle(() => ({
    transform: [{
      translateX: interpolate(
        drag.value,
        [0, ACTION_WIDTH * 2],
        [-ACTION_WIDTH * 2, 0],
        'clamp',
      ),
    }],
  }))

  return (
    <Reanimated.View style={[styles.actionButton, animStyle]}>
      <Pressable onPress={onPress} style={[styles.actionPressable, { backgroundColor: color }]}>
        {icon}
        <Text style={styles.actionLabel}>{label}</Text>
      </Pressable>
    </Reanimated.View>
  )
}

function RightActions({
  drag,
  isArchived,
  onMore,
  onArchive,
  onUnarchive,
}: {
  drag: SharedValue<number>
  isArchived?: boolean
  onMore: () => void
  onArchive: () => void
  onUnarchive?: () => void
}) {
  const showUnarchive = isArchived && onUnarchive
  return (
    <View style={styles.rightActionsContainer}>
      <RightActionButton
        drag={drag}
        color="#6e6e6e"
        icon={<MoreHorizontal size={22} color="#fff" />}
        label={translate('More')}
        onPress={onMore}
      />
      <RightActionButton
        drag={drag}
        color="#25D366"
        icon={showUnarchive
          ? <ArchiveRestore size={22} color="#fff" />
          : <Archive size={22} color="#fff" />
        }
        label={showUnarchive ? translate('Unarchive', { ns: 'chat' }) : translate('Archive', { ns: 'chat' })}
        onPress={showUnarchive ? onUnarchive! : onArchive}
      />
    </View>
  )
}

function LeftActions({
  drag,
  isPinned,
  isManuallyUnread,
  onToggleUnread,
  onPin,
}: {
  drag: SharedValue<number>
  isPinned: boolean
  isManuallyUnread: boolean
  onToggleUnread: () => void
  onPin: () => void
}) {
  return (
    <View style={styles.leftActionsContainer}>
      <LeftActionButton
        drag={drag}
        color="#007AFF"
        icon={<MessageCircle size={22} color="#fff" />}
        label={isManuallyUnread ? translate('Read', { ns: 'chat' }) : translate('Unread', { ns: 'chat' })}
        onPress={onToggleUnread}
      />
      <LeftActionButton
        drag={drag}
        color="#FF9500"
        icon={<Pin size={22} color="#fff" />}
        label={isPinned ? translate('Unpin', { ns: 'chat' }) : translate('Pin', { ns: 'chat' })}
        onPress={onPin}
      />
    </View>
  )
}

export const SwipeableConversationItem = React.memo(function SwipeableConversationItem({
  children,
  conversationId,
  isPinned,
  isManuallyUnread,
  isArchived,
  onArchive,
  onUnarchive,
  onPin,
  onToggleUnread,
  onMore,
  disabled,
}: SwipeableConversationItemProps) {
  const swipeableRef = useRef<SwipeableMethods>(null)
  useTranslation()

  const close = useCallback(() => {
    swipeableRef.current?.close()
  }, [])

  const handleMore = useCallback(() => {
    close()
    onMore(conversationId)
  }, [close, conversationId, onMore])

  const handleArchive = useCallback(() => {
    close()
    onArchive(conversationId)
  }, [close, conversationId, onArchive])

  const handleUnarchive = useCallback(() => {
    close()
    onUnarchive?.(conversationId)
  }, [close, conversationId, onUnarchive])

  const handlePin = useCallback(() => {
    close()
    onPin(conversationId)
  }, [close, conversationId, onPin])

  const handleToggleUnread = useCallback(() => {
    close()
    onToggleUnread(conversationId)
  }, [close, conversationId, onToggleUnread])

  const renderRightActions = useCallback(
    (_prog: SharedValue<number>, drag: SharedValue<number>) => (
      <RightActions
        drag={drag}
        isArchived={isArchived}
        onMore={handleMore}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
      />
    ),
    [isArchived, handleMore, handleArchive, handleUnarchive],
  )

  const renderLeftActions = useCallback(
    (_prog: SharedValue<number>, drag: SharedValue<number>) => (
      <LeftActions
        drag={drag}
        isPinned={isPinned}
        isManuallyUnread={isManuallyUnread}
        onToggleUnread={handleToggleUnread}
        onPin={handlePin}
      />
    ),
    [isPinned, isManuallyUnread, handleToggleUnread, handlePin],
  )

  if (disabled) {
    return <>{children}</>
  }

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      friction={2}
      rightThreshold={40}
      leftThreshold={40}
      overshootRight={false}
      overshootLeft={false}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
    >
      {children}
    </ReanimatedSwipeable>
  )
})

const styles = StyleSheet.create({
  rightActionsContainer: {
    flexDirection: 'row',
    width: ACTION_WIDTH * 2,
  },
  leftActionsContainer: {
    flexDirection: 'row',
    width: ACTION_WIDTH * 2,
  },
  actionButton: {
    width: ACTION_WIDTH,
  },
  actionPressable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
})
