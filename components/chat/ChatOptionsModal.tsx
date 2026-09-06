/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo, useEffect, useMemo, useState } from 'react'
import { Modal, View, Text, Pressable } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  X,
  BellOff,
  Bell,
  Eraser,
  Trash2,
  Ban,
  ChevronLeft,
  Clock3,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '@/components/common'
import { translate } from '@/lib/i18n'
import { useChatStore } from '@/store'
import { formatDisappearingTimerDuration } from '@/lib/disappearingMessages'
import { formatAddress } from '@/lib/utils'
import { useThemeColors } from '@/lib/theme'
import type { Conversation } from '@/lib/types'

interface ChatOptionsModalProps {
  visible: boolean
  conversation: Conversation | null
  isMuted: boolean
  isBlocked: boolean
  onClose: () => void
  onMute: () => void
  onClearChat: () => void
  onDeleteChat: () => void
  onBlock: () => void
  disappearingTimerLabel?: string
  disappearingTimerPresets?: readonly number[]
  onSelectDisappearingTimer?: (durationMs: number | null) => void
}

interface OptionRowProps {
  icon: React.ReactNode
  label: string
  description?: string
  destructive?: boolean
  onPress: () => void
  colors: ReturnType<typeof useThemeColors>
}

function OptionRow({ icon, label, description, destructive, onPress, colors }: OptionRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between px-5 py-4 active:opacity-60"
    >
      <View className="flex-1 pr-3">
        <Text
          className="text-base"
          style={{ color: destructive ? colors.error : colors.text }}
        >
          {label}
        </Text>
        {description ? (
          <Text className="text-xs mt-1" style={{ color: colors.textMuted }}>
            {description}
          </Text>
        ) : null}
      </View>
      {icon}
    </Pressable>
  )
}

export const ChatOptionsModal = memo(function ChatOptionsModal({
  visible,
  conversation,
  isMuted,
  isBlocked,
  onClose,
  onMute,
  onClearChat,
  onDeleteChat,
  onBlock,
  disappearingTimerLabel,
  disappearingTimerPresets,
  onSelectDisappearingTimer,
}: ChatOptionsModalProps) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  useTranslation()
  const contacts = useChatStore((state) => state.contacts)
  const [showTimerPicker, setShowTimerPicker] = useState(false)

  useEffect(() => {
    if (!visible) {
      setShowTimerPicker(false)
    }
  }, [visible])

  const { displayName, avatarUrl } = useMemo(() => {
    if (!conversation) return { displayName: '', avatarUrl: undefined as string | undefined }

    const isGroup = conversation.type === 'group'
    const contact = contacts.find(
      (c) =>
        c.identityId === conversation.remoteIdentityId ||
        c.walletAddress === conversation.remoteIdentityId ||
        (conversation.remoteWalletAddress &&
          c.walletAddress === conversation.remoteWalletAddress),
    )

    const name = isGroup
      ? conversation.title || translate('Group chat')
      : contact?.displayName ||
        (conversation.remoteWalletAddress
          ? formatAddress(conversation.remoteWalletAddress, 6)
          : conversation.remoteIdentityId
            ? formatAddress(conversation.remoteIdentityId, 6)
            : translate('Unknown'))

    const avatar = isGroup
      ? conversation.avatarUrl
      : contact?.avatarUrl

    return { displayName: name, avatarUrl: avatar }
  }, [conversation, contacts])

  if (!conversation) return null

  const isGroup = conversation.type === 'group'
  const showDisappearingTimer = Boolean(onSelectDisappearingTimer) && !isGroup
  const timerPresets = disappearingTimerPresets || []

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-end"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onPress={onClose}
      >
        <Pressable
          className="rounded-t-3xl"
          style={{
            paddingBottom: insets.bottom + 16,
            backgroundColor: colors.backgroundSecondary,
          }}
          onPress={() => {}}
        >
          <View className="items-center pt-3 pb-2">
            <View
              className="w-10 h-1 rounded-full"
              style={{ backgroundColor: colors.border }}
            />
          </View>

          <View className="flex-row items-center px-5 pb-4 gap-3">
            {showTimerPicker ? (
              <Pressable
                onPress={() => setShowTimerPicker(false)}
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.surface }}
                hitSlop={8}
              >
                <ChevronLeft size={18} color={colors.text} />
              </Pressable>
            ) : (
              <Avatar
                name={displayName}
                imageUrl={avatarUrl}
                size="md"
                previewable
              />
            )}
            <Text
              className="flex-1 text-lg font-semibold"
              style={{ color: colors.text }}
              numberOfLines={1}
            >
              {showTimerPicker ? translate('Disappearing messages', { ns: 'chat' }) : displayName}
            </Text>
            <Pressable
              onPress={onClose}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.surface }}
              hitSlop={8}
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          <View className="mx-5 h-px" style={{ backgroundColor: colors.border }} />

          <View className="pt-1">
            {showTimerPicker ? (
              <>
                <OptionRow
                  icon={<Clock3 size={20} color={colors.textMuted} />}
                  label={translate('disappearing.off')}
                  onPress={() => {
                    onSelectDisappearingTimer?.(null)
                    onClose()
                  }}
                  colors={colors}
                />
                {timerPresets.map((durationMs) => (
                  <OptionRow
                    key={durationMs}
                    icon={<Clock3 size={20} color={colors.textMuted} />}
                    label={formatDisappearingTimerDuration(durationMs)}
                    onPress={() => {
                      onSelectDisappearingTimer?.(durationMs)
                      onClose()
                    }}
                    colors={colors}
                  />
                ))}
              </>
            ) : (
              <>
                {showDisappearingTimer ? (
                  <OptionRow
                    icon={<Clock3 size={20} color={colors.textMuted} />}
                    label={translate('Disappearing messages', { ns: 'chat' })}
                    description={disappearingTimerLabel || translate('disappearing.off')}
                    onPress={() => setShowTimerPicker(true)}
                    colors={colors}
                  />
                ) : null}

                <OptionRow
                  icon={
                    isMuted ? (
                      <Bell size={20} color={colors.textMuted} />
                    ) : (
                      <BellOff size={20} color={colors.textMuted} />
                    )
                  }
                  label={isMuted ? translate('Unmute', { ns: 'chat' }) : translate('Mute', { ns: 'chat' })}
                  onPress={onMute}
                  colors={colors}
                />

                <OptionRow
                  icon={<Eraser size={20} color={colors.textMuted} />}
                  label={translate('Clear chat', { ns: 'chat' })}
                  onPress={onClearChat}
                  colors={colors}
                />

                <OptionRow
                  icon={<Trash2 size={20} color={colors.error} />}
                  label={
                    isGroup
                      ? translate('Delete chat', { ns: 'chat' })
                      : translate('Delete chat...', { ns: 'chat' })
                  }
                  destructive
                  onPress={onDeleteChat}
                  colors={colors}
                />

                {!isGroup && (
                  <OptionRow
                    icon={<Ban size={20} color={colors.error} />}
                    label={translate('{{action}} {{name}}', {
                      ns: 'chat',
                      action: isBlocked
                        ? translate('Unblock', { ns: 'chat' })
                        : translate('Block', { ns: 'chat' }),
                      name: displayName,
                    })}
                    destructive
                    onPress={onBlock}
                    colors={colors}
                  />
                )}
              </>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
})
