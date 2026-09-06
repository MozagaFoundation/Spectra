/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo } from 'react'
import { View, Text, Pressable, Modal, StyleSheet, useWindowDimensions } from 'react-native'
import { Reply, Copy, RotateCcw, Trash2 } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import { useTranslation } from 'react-i18next'
import { getDirectionalTextStyle, getStartMarginStyle, useIsCurrentLanguageRtl } from '@/lib/i18n/direction'
import { Haptics, impactAsync as triggerImpact, notificationAsync as triggerNotification } from '@/lib/safeHaptics'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'
import type { ChatMessage } from '@/lib/types'
import { getChatMessagePreviewText } from '@/lib/viewOnce'

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

interface MessageActionMenuProps {
  visible: boolean
  message: ChatMessage | null
  isOwn: boolean
  onClose: () => void
  onReaction: (emoji: string) => void
  onReply: () => void
  onDelete: () => void
  onRetry?: () => void
}

export const MessageActionMenu = memo(function MessageActionMenu({
  visible,
  message,
  isOwn,
  onClose,
  onReaction,
  onReply,
  onDelete,
  onRetry,
}: MessageActionMenuProps) {
  useTranslation()
  const colors = useThemeColors()
  const isRtl = useIsCurrentLanguageRtl()
  const { width: screenWidth } = useWindowDimensions()
  if (!message) return null

  const handleCopy = async () => {
    if (message.content && !message.oneTime) {
      await Clipboard.setStringAsync(message.content)
      triggerNotification(Haptics.NotificationFeedbackType.Success)
    }
    onClose()
  }

  const handleReaction = async (emoji: string) => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light)
    onReaction(emoji)
    onClose()
  }

  const handleReply = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light)
    onReply()
    onClose()
  }

  const handleDelete = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Medium)
    onDelete()
    onClose()
  }

  const handleRetry = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Medium)
    onRetry?.()
    onClose()
  }

  const previewSource = getChatMessagePreviewText(message)
  const previewText = previewSource.length > 100
    ? previewSource.slice(0, 100) + '…'
    : previewSource
  const canCopy = !message.oneTime
  const canRetry = isOwn && message.status === 'failed' && Boolean(onRetry)

  const menuWidth = Math.min(screenWidth - 48, 300)

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={[styles.contentWrapper, { width: menuWidth }]}>
          {previewText.length > 0 && (
            <View style={[
              styles.previewBubble,
              isOwn
                ? [styles.previewOwn, { backgroundColor: colors.messageSent }]
                : [styles.previewOther, { backgroundColor: colors.messageReceived }],
            ]}>
              <Text
                style={[
                  styles.previewText,
                  { color: isOwn ? '#ffffff' : colors.text },
                  getDirectionalTextStyle(isRtl),
                ]}
                numberOfLines={2}
              >
                {previewText}
              </Text>
            </View>
          )}

          <View style={[styles.reactionBar, { backgroundColor: colors.surface }]}>
            {QUICK_REACTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => handleReaction(emoji)}
                style={styles.reactionButton}
              >
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.actionSheet, { backgroundColor: colors.surface }]}>
            <Pressable
              onPress={handleReply}
              style={[styles.actionRow, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}
            >
              <Text
                style={[styles.actionLabel, { color: colors.text }, getDirectionalTextStyle(isRtl)]}
              >
                {translate('Reply')}
              </Text>
              <Reply size={20} color={colors.textSecondary} />
            </Pressable>
            {(canCopy || isOwn) && (
              <View
                style={[
                  styles.separator,
                  { backgroundColor: colors.borderLight },
                  getStartMarginStyle(18, isRtl),
                ]}
              />
            )}

            {canCopy && (
              <Pressable
                onPress={handleCopy}
                style={[styles.actionRow, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}
              >
                <Text
                  style={[styles.actionLabel, { color: colors.text }, getDirectionalTextStyle(isRtl)]}
                >
                  {translate('Copy')}
                </Text>
                <Copy size={20} color={colors.textSecondary} />
              </Pressable>
            )}
            {canRetry && (
              <Pressable
                onPress={handleRetry}
                style={[styles.actionRow, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}
              >
                <Text
                  style={[styles.actionLabel, { color: colors.text }, getDirectionalTextStyle(isRtl)]}
                >
                  {translate('Retry')}
                </Text>
                <RotateCcw size={20} color={colors.textSecondary} />
              </Pressable>
            )}
            {(canCopy || canRetry) && isOwn && (
              <View
                style={[
                  styles.separator,
                  { backgroundColor: colors.borderLight },
                  getStartMarginStyle(18, isRtl),
                ]}
              />
            )}

            {isOwn && (
              <Pressable
                onPress={handleDelete}
                style={[styles.actionRow, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}
              >
                <Text
                  style={[styles.deleteLabel, { color: colors.error }, getDirectionalTextStyle(isRtl)]}
                >
                  {translate('Delete')}
                </Text>
                <Trash2 size={20} color={colors.error} />
              </Pressable>
            )}
          </View>
        </View>
      </Pressable>
    </Modal>
  )
})

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentWrapper: {
    alignItems: 'stretch',
    gap: 10,
  },

  previewBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  previewOwn: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  previewOther: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  previewText: {
    fontSize: 15,
    lineHeight: 20,
  },

  reactionBar: {
    flexDirection: 'row',
    borderRadius: 28,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  reactionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionEmoji: {
    fontSize: 24,
  },

  actionSheet: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    height: 48,
  },
  actionLabel: {
    fontSize: 16,
    flex: 1,
  },
  deleteLabel: {
    fontSize: 16,
    flex: 1,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
})
