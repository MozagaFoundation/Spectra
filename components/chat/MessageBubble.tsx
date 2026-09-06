/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Check, CheckCheck, Clock, Clock3, Shield, AlertCircle, X, LoaderCircle } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/common'
import { getDirectionalTextStyle, useIsCurrentLanguageRtl } from '@/lib/i18n/direction'
import { translate } from '@/lib/i18n'
import { formatTime, parseLinks } from '@/lib/utils'
import { useChatStore } from '@/store/chatStore'
import { useGroupChatStore } from '@/store/groupChatStore'
import { useUIStore } from '@/store/uiStore'
import { MESSAGE_FONT_SIZES } from '@/lib/constants'
import { isCallInvitation, parseCallInvitation } from '@/services/shared/callInvitationFormat'
import { parseCryptoPaymentRequest, type CryptoPaymentRequest } from '@/services/shared/cryptoPaymentRequest'
import { isCryptoReceipt, parseCryptoReceipt, type CryptoReceipt } from '@/services/crypto/receipts'
import { hydrateMessageAttachment } from '@/services/media/attachmentHydration'
import { useThemeColors } from '@/lib/theme'
import { formatDisappearingTimerDuration, getDisappearingMessageRemainingMs } from '@/lib/disappearingMessages'
import type { ChatMessage, MediaAttachment, OneTimeRevealPayload } from '@/lib/types'
import { isLockedOneTimeMessage } from '@/lib/viewOnce'
import { classifyDirectMessageKind } from '@/services/quantumChat/messageKinds'
import { BLE_DELIVERY_HINT_KEYS } from '@/services/quantumChat/bleDeliveryProjection'
import {
  CallInvitationBubble,
  CryptoPaymentRequestBubble,
  CryptoReceiptBubble,
  ReplyPreview,
  ReactionsBar,
  ViewOnceMessageContent,
  renderAttachment,
} from './bubbles'
import { recordRenderMetric } from '@/lib/renderMetrics'

type HydratableAttachment = MediaAttachment & {
  encryptionKey?: string
}

const TRANSLATABLE_DELIVERY_HINTS = new Set<string>([
  'Queued',
  'Relaying',
  'Sent',
  'Waiting for poll',
  'Delivered',
  'Read',
  'Failed',
  ...BLE_DELIVERY_HINT_KEYS,
])

function translateDeliveryHint(hint: string | undefined, fallback: string): string {
  const key = hint || fallback
  return TRANSLATABLE_DELIVERY_HINTS.has(key)
    ? translate(key, { ns: 'chat' })
    : key
}

let disappearingClockNow = Date.now()
let disappearingClockTimer: ReturnType<typeof setInterval> | null = null
const disappearingClockListeners = new Set<() => void>()
const noopSubscribe = () => () => {}

function subscribeDisappearingClock(listener: () => void): () => void {
  disappearingClockListeners.add(listener)
  if (!disappearingClockTimer) {
    disappearingClockNow = Date.now()
    disappearingClockTimer = setInterval(() => {
      disappearingClockNow = Date.now()
      for (const notify of disappearingClockListeners) {
        notify()
      }
    }, 1000)
  }

  return () => {
    disappearingClockListeners.delete(listener)
    if (disappearingClockListeners.size === 0 && disappearingClockTimer) {
      clearInterval(disappearingClockTimer)
      disappearingClockTimer = null
    }
  }
}

function getDisappearingClockSnapshot(): number {
  return disappearingClockNow
}

function useDisappearingClock(enabled: boolean): number {
  return useSyncExternalStore(
    enabled ? subscribeDisappearingClock : noopSubscribe,
    getDisappearingClockSnapshot,
    getDisappearingClockSnapshot,
  )
}

interface MessageBubbleProps {
  message: ChatMessage
  isOwn: boolean
  showAvatar?: boolean
  contactName: string
  contactAvatarUrl?: string | null
  senderName?: string
  senderAvatarUrl?: string | null
  onLongPress?: (message: ChatMessage) => void
  onReplyPress?: (replyTo: NonNullable<ChatMessage['replyTo']>) => void
  onRevealViewOnce?: (message: ChatMessage) => Promise<OneTimeRevealPayload | null>
  onConsumeViewOnce?: (message: ChatMessage) => void | Promise<void>
  onRetryFailedMessage?: (message: ChatMessage) => void
  onEditImageAttachment?: (message: ChatMessage, attachment: MediaAttachment) => void | Promise<void>
  onCryptoReceiptPress?: (receipt: CryptoReceipt) => void
  onCryptoPaymentRequestPress?: (message: ChatMessage, request: CryptoPaymentRequest) => void
}

function isSameMessageForRender(left: ChatMessage, right: ChatMessage): boolean {
  return left === right || (
    left.id === right.id
    && left.content === right.content
    && left.timestamp === right.timestamp
    && left.status === right.status
    && left.deliveryStage === right.deliveryStage
    && left.deliveryHint === right.deliveryHint
    && left.deleted === right.deleted
    && left.senderId === right.senderId
    && left.senderName === right.senderName
    && left.senderAvatarUrl === right.senderAvatarUrl
    && left.oneTime === right.oneTime
    && left.disappearing === right.disappearing
    && left.replyTo === right.replyTo
    && left.attachments === right.attachments
    && left.reactions === right.reactions
    && left.signatureVerified === right.signatureVerified
    && left.provenance === right.provenance
    && left.systemEvent === right.systemEvent
  )
}

function areMessageBubblePropsEqual(
  previous: MessageBubbleProps,
  next: MessageBubbleProps,
): boolean {
  const equal = isSameMessageForRender(previous.message, next.message)
    && previous.isOwn === next.isOwn
    && previous.showAvatar === next.showAvatar
    && previous.contactName === next.contactName
    && previous.contactAvatarUrl === next.contactAvatarUrl
    && previous.senderName === next.senderName
    && previous.senderAvatarUrl === next.senderAvatarUrl
    && previous.onLongPress === next.onLongPress
    && previous.onReplyPress === next.onReplyPress
    && previous.onRevealViewOnce === next.onRevealViewOnce
    && previous.onConsumeViewOnce === next.onConsumeViewOnce
    && previous.onRetryFailedMessage === next.onRetryFailedMessage
    && previous.onEditImageAttachment === next.onEditImageAttachment
    && previous.onCryptoReceiptPress === next.onCryptoReceiptPress
    && previous.onCryptoPaymentRequestPress === next.onCryptoPaymentRequestPress

  if (equal) {
    recordRenderMetric('chat_screen', 'message_bubble_render_skipped', {
      hasAttachments: Boolean(next.message.attachments?.length),
      hasReactions: Boolean(next.message.reactions?.length),
      status: next.message.status || null,
    })
  }
  return equal
}

export const MessageBubble = memo(function MessageBubble({ 
  message, 
  isOwn, 
  showAvatar = false, 
  contactName,
  contactAvatarUrl,
  senderName,
  senderAvatarUrl,
  onLongPress,
  onReplyPress,
  onRevealViewOnce,
  onConsumeViewOnce,
  onRetryFailedMessage,
  onEditImageAttachment,
  onCryptoReceiptPress,
  onCryptoPaymentRequestPress,
}: MessageBubbleProps) {
  useTranslation()
  const renderCountRef = useRef(0)
  renderCountRef.current += 1
  const colors = useThemeColors()
  const isRtl = useIsCurrentLanguageRtl()
  const messageFontSize = useUIStore((state) => state.messageFontSize)
  const updateDirectMessage = useChatStore((state) => state.updateMessage)
  const updateGroupMessage = useGroupChatStore((state) => state.updateMessage)
  const fontSize = MESSAGE_FONT_SIZES[messageFontSize]
  const ownTextColor = colors.textOnPrimary
  const ownMetaColor = `${colors.textOnPrimary}99`
  const ownMetaMutedColor = `${colors.textOnPrimary}80`
  const ownDividerColor = `${colors.textOnPrimary}66`
  const ownReceiptColor = '#166534'

  const handlePrepareAttachment = React.useCallback(async (attachment: MediaAttachment) => {
    const preparedAttachment = await hydrateMessageAttachment(
      message.id,
      message.conversationId,
      attachment as HydratableAttachment,
      {
        source:
          message.conversationType === 'group'
            ? 'messageBubble.prepareGroupAttachment'
            : 'messageBubble.prepareDirectAttachment',
        messageId: message.id,
        conversationId: message.conversationId,
      },
    )

    if (message.conversationType === 'group' && message.groupId) {
      const currentMessage = useGroupChatStore
        .getState()
        .messages[message.groupId]
        ?.find((candidate) => candidate.id === message.id)
      const currentAttachments = currentMessage?.attachments ?? message.attachments ?? []
      updateGroupMessage(
        message.groupId,
        message.id,
        {
          attachments: currentAttachments.map((candidate) =>
            candidate.id === preparedAttachment.id ? preparedAttachment : candidate
          ),
        }
      )
      return preparedAttachment
    }

    const chatState = useChatStore.getState()
    const currentMessage = chatState.getMessageById?.(message.id)
      ?? chatState.messages?.find((candidate) => candidate.id === message.id)
    const currentAttachments = currentMessage?.attachments ?? message.attachments ?? []
    updateDirectMessage(message.id, {
      attachments: currentAttachments.map((candidate) =>
        candidate.id === preparedAttachment.id ? preparedAttachment : candidate
      ),
    })

    return preparedAttachment
  }, [
    message.attachments,
    message.conversationId,
    message.conversationType,
    message.groupId,
    message.id,
    updateDirectMessage,
    updateGroupMessage,
  ])

  const handlePrepareViewOnceAttachment = React.useCallback(async (attachment: MediaAttachment) => {
    return hydrateMessageAttachment(
      message.id,
      message.conversationId,
      attachment as HydratableAttachment,
      {
        source:
          message.conversationType === 'group'
            ? 'messageBubble.prepareGroupViewOnceAttachment'
            : 'messageBubble.prepareDirectViewOnceAttachment',
        messageId: message.id,
        conversationId: message.conversationId,
      },
    )
  }, [
    message.conversationId,
    message.conversationType,
    message.id,
  ])

  const handleEditImageAttachment = React.useCallback(async (attachment: MediaAttachment) => {
    if (!onEditImageAttachment || message.oneTime || attachment.isViewOnce) {
      return
    }

    const preparedAttachment = attachment.isEncrypted && !attachment.uri
      ? await handlePrepareAttachment(attachment)
      : attachment

    await onEditImageAttachment(message, preparedAttachment)
  }, [handlePrepareAttachment, message, onEditImageAttachment])

  const links = useMemo(() => parseLinks((message.content || '').trim()), [message.content])
  const parsedContent = useMemo(() => {
    const content = message.content || ''
    const isCallContent = isCallInvitation(content)
    const isReceiptContent = isCryptoReceipt(content)
    return {
      callInvitation: isCallContent ? parseCallInvitation(content) : null,
      cryptoPaymentRequest: parseCryptoPaymentRequest(content),
      cryptoReceipt: isReceiptContent ? parseCryptoReceipt(content) : null,
      isHiddenControlPayload: classifyDirectMessageKind(content) === 'hidden_control',
    }
  }, [message.content])

  const hasAttachments = message.attachments && message.attachments.length > 0
  const hasTextContent = (message.content || '').trim().length > 0
  const hasReactions = message.reactions && message.reactions.length > 0
  const hasLockedViewOnce = isLockedOneTimeMessage(message)
  const canEditMessageImages = !message.oneTime && !message.disappearing
  const trustIndicator = message.signatureVerified === true ? 'verified_peer' : 'unverified_peer'
  const isHiddenControlPayload = parsedContent.isHiddenControlPayload
  
  const callInvitation = parsedContent.callInvitation
  const cryptoPaymentRequest = parsedContent.cryptoPaymentRequest
  const cryptoReceipt = parsedContent.cryptoReceipt

  const bubbleSenderName = senderName || message.senderName || contactName
  const bubbleSenderAvatar = senderAvatarUrl || message.senderAvatarUrl || contactAvatarUrl
  const showSenderLabel = !isOwn && Boolean(senderName || message.senderName)

  const handleLongPress = React.useCallback(() => {
    onLongPress?.(message)
  }, [message, onLongPress])

  const nowTick = useDisappearingClock(Boolean(
    message.disappearing?.expiresAt || message.disappearing?.fallbackExpiresAt,
  ))

  const disappearingMeta = useMemo(() => {
    const disappearing = message.disappearing
    if (!disappearing) {
      return null
    }

    if (disappearing.trigger === 'after_read' && !disappearing.expiresAt) {
      return {
        label: isOwn
          ? translate('Waiting for read', { ns: 'chat' })
          : translate('After read', { ns: 'chat' }),
        color: isOwn ? ownMetaColor : colors.primary,
      }
    }

    const remainingMs = getDisappearingMessageRemainingMs(disappearing, nowTick)
    if (remainingMs == null) {
      return null
    }

    return {
      label: formatDisappearingTimerDuration(remainingMs),
      color: isOwn ? ownMetaColor : colors.primary,
    }
  }, [colors.primary, isOwn, message.disappearing, nowTick, ownMetaColor])

  useEffect(() => {
    recordRenderMetric('chat_screen', 'message_bubble_render', {
      renders: renderCountRef.current,
      isOwn,
      hasAttachments: Boolean(hasAttachments),
      attachmentCount: message.attachments?.length || 0,
      reactionCount: message.reactions?.length || 0,
      contentLength: message.content?.length || 0,
      status: message.status || null,
    })
  })

  const deliveryMeta = (() => {
    if (!isOwn) return null

    const stage = message.deliveryStage
      || (message.status === 'read'
        ? 'read'
        : message.status === 'delivered'
          ? 'delivered'
          : message.status === 'failed'
            ? 'failed'
            : message.status === 'sent'
              ? 'relayed'
            : message.status === 'sending'
              ? 'relaying'
              : 'relayed')

    if (!stage) return null

    switch (stage) {
      case 'queued':
        return {
          label: translateDeliveryHint(message.deliveryHint, 'Queued'),
          textColor: ownMetaColor,
          icon: <Clock size={12} color={ownMetaMutedColor} />,
        }
      case 'relaying':
        return {
          label: translateDeliveryHint(message.deliveryHint, 'Relaying'),
          textColor: ownMetaColor,
          icon: <LoaderCircle size={12} color={ownMetaColor} />,
        }
      case 'relayed':
        return {
          label: translateDeliveryHint(message.deliveryHint, 'Sent'),
          textColor: ownMetaColor,
          icon: <Check size={14} color={ownMetaColor} />,
        }
      case 'awaiting_recipient':
        return {
          label: translateDeliveryHint(message.deliveryHint, 'Waiting for poll'),
          textColor: ownMetaColor,
          icon: <Check size={14} color={ownMetaColor} />,
        }
      case 'delivered':
        return {
          label: translateDeliveryHint(message.deliveryHint, 'Delivered'),
          textColor: ownMetaColor,
          icon: <CheckCheck size={14} color={ownMetaColor} />,
        }
      case 'read':
        return {
          label: translateDeliveryHint(message.deliveryHint, 'Read'),
          textColor: ownReceiptColor,
          icon: <CheckCheck size={14} color={ownReceiptColor} />,
        }
      case 'failed':
        return {
          label: translateDeliveryHint(message.deliveryHint, 'Failed'),
          textColor: colors.error,
          icon: <X size={14} color={colors.error} />,
        }
      default:
        return null
    }
  })()

  const renderStatus = React.useCallback(() => deliveryMeta?.icon || null, [deliveryMeta])
  const canRetryFailedMessage = isOwn && message.status === 'failed' && Boolean(onRetryFailedMessage)
  const shouldShowDeliveryStatus = Boolean(isOwn && deliveryMeta?.icon)

  const handlePress = React.useCallback(() => {
    if (canRetryFailedMessage) {
      onRetryFailedMessage?.(message)
    }
  }, [canRetryFailedMessage, message, onRetryFailedMessage])

  const attachmentNodes = useMemo(() => (
    message.attachments?.map((attachment) => renderAttachment(
      attachment,
      isOwn,
      attachment.isEncrypted
        ? () => handlePrepareAttachment(attachment)
        : undefined,
      canEditMessageImages && onEditImageAttachment && !attachment.isViewOnce
        ? () => handleEditImageAttachment(attachment)
        : undefined,
    )) ?? null
  ), [
    canEditMessageImages,
    handleEditImageAttachment,
    handlePrepareAttachment,
    isOwn,
    message.attachments,
    onEditImageAttachment,
  ])

  if (isHiddenControlPayload || message.deleted) {
    return null
  }

  if (callInvitation) {
    return (
      <CallInvitationBubble
        isOwn={isOwn}
        callType={callInvitation.callType}
        timestamp={message.timestamp}
      />
    )
  }

  if (cryptoPaymentRequest) {
    return (
      <View className={`w-[85%] ${isOwn ? 'self-end items-end' : 'self-start items-start'}`}>
        {showSenderLabel && (
          <Text className="text-xs font-semibold mb-1 px-1" style={{ color: colors.primary }}>
            {bubbleSenderName}
          </Text>
        )}
        <CryptoPaymentRequestBubble
          request={cryptoPaymentRequest}
          isOwn={isOwn}
          senderName={bubbleSenderName}
          timestamp={message.timestamp}
          onPress={onCryptoPaymentRequestPress && (cryptoPaymentRequest.state === 'paid' || !isOwn)
            ? () => onCryptoPaymentRequestPress(message, cryptoPaymentRequest)
            : undefined}
          onLongPress={onLongPress ? handleLongPress : undefined}
        />
      </View>
    )
  }

  if (cryptoReceipt) {
    return (
      <View className={`w-[85%] ${isOwn ? 'self-end items-end' : 'self-start items-start'}`}>
        {showSenderLabel && (
          <Text className="text-xs font-semibold mb-1 px-1" style={{ color: colors.primary }}>
            {bubbleSenderName}
          </Text>
        )}
        <CryptoReceiptBubble
          isOwn={isOwn}
          isVerified={isOwn}
          senderName={bubbleSenderName}
          symbol={cryptoReceipt.symbol}
          amount={cryptoReceipt.amount}
          txHash={cryptoReceipt.txHash}
          status={cryptoReceipt.status}
          chainId={cryptoReceipt.chainId}
          recipientName={cryptoReceipt.recipientName}
          timestamp={message.timestamp}
          onPress={onCryptoReceiptPress ? () => onCryptoReceiptPress(cryptoReceipt) : undefined}
          onLongPress={onLongPress ? handleLongPress : undefined}
        />
      </View>
    )
  }

  if (message.systemEvent === 'screenshot_taken') {
    const notice = isOwn
      ? translate('You took a screenshot', { ns: 'chat' })
      : translate('{{name}} took a screenshot', {
          ns: 'chat',
          name: bubbleSenderName,
        })

    return (
      <View className="self-center max-w-[90%] px-3 py-2 rounded-full border border-border/40 bg-surface/70">
        <Text className="text-text-muted text-xs text-center">
          {notice} · {formatTime(message.timestamp)}
        </Text>
      </View>
    )
  }
  
  return (
    <View className={`flex-row items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
      {!isOwn && (
        <View style={{ opacity: showAvatar ? 1 : 0 }}>
          <Avatar
            name={bubbleSenderName}
            imageUrl={bubbleSenderAvatar}
            size="sm"
            previewable={showAvatar}
          />
        </View>
      )}
      
      <View
        className={`max-w-[85%] ${isOwn ? 'items-end' : 'items-start'}`}
        style={{ minWidth: 0 }}
      >
        <Pressable
          onPress={canRetryFailedMessage ? handlePress : undefined}
          onLongPress={handleLongPress}
          delayLongPress={300}
          className={`px-4 py-3 rounded-2xl ${
            isOwn
              ? 'bg-message-sent rounded-br-md'
              : 'bg-message-received rounded-bl-md'
          }`}
          style={{ minWidth: 0, maxWidth: '100%' }}
        >
          {showSenderLabel && (
            <Text
              className="text-xs font-semibold mb-1"
              style={{ color: colors.primary, flexShrink: 1, ...getDirectionalTextStyle(isRtl) }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {bubbleSenderName}
            </Text>
          )}
          {message.replyTo && (
            <ReplyPreview
              replyTo={message.replyTo}
              isOwn={isOwn}
              onPress={onReplyPress ? () => onReplyPress(message.replyTo!) : undefined}
            />
          )}

          {hasLockedViewOnce ? (
            <ViewOnceMessageContent
              message={message}
              isOwn={isOwn}
              onReveal={onRevealViewOnce}
              onPrepareAttachment={handlePrepareViewOnceAttachment}
              onConsume={onConsumeViewOnce}
            />
          ) : (
            <>
              {hasAttachments && (
                <View className={hasTextContent ? 'mb-2' : ''}>
                  {attachmentNodes}
                </View>
              )}
              
              {hasTextContent && (
                <Text
                  className="leading-5"
                  style={{
                    color: isOwn ? ownTextColor : colors.text,
                    fontSize,
                    ...getDirectionalTextStyle(isRtl),
                  }}
                >
                  {links.map((part, index) => (
                    part.type === 'link' ? (
                      <Text key={index} className="text-primary-light underline">
                        {part.content}
                      </Text>
                    ) : (
                      part.content
                    )
                  ))}
                </Text>
              )}
            </>
          )}

          <View className={`flex-row items-center gap-1.5 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            {trustIndicator === 'verified_peer' ? (
              <Shield size={10} color={colors.success + '99'} />
            ) : (
              <AlertCircle size={10} color={colors.warning + '99'} />
            )}
            
            <Text
              className="text-xs"
              style={{ color: isOwn ? ownMetaColor : colors.textMuted, ...getDirectionalTextStyle(isRtl) }}
            >
              {formatTime(message.timestamp)}
            </Text>

            {disappearingMeta ? (
              <>
                <Text
                  className="text-xs"
                  style={{ color: isOwn ? ownDividerColor : colors.textMuted }}
                >
                  ·
                </Text>
                <Clock3 size={10} color={disappearingMeta.color} />
                <Text
                  className="text-xs"
                  style={{ color: disappearingMeta.color, ...getDirectionalTextStyle(isRtl) }}
                >
                  {disappearingMeta.label}
                </Text>
              </>
            ) : null}

            {isOwn && shouldShowDeliveryStatus ? (
              <>
                <Text className="text-xs" style={{ color: ownDividerColor }}>·</Text>
                <View
                  className="flex-row items-center"
                  accessibilityLabel={deliveryMeta?.label}
                >
                  {renderStatus()}
                </View>
              </>
            ) : null}

            {isOwn ? null : renderStatus()}
          </View>
        </Pressable>

        {hasReactions && (
          <ReactionsBar reactions={message.reactions!} isOwn={isOwn} />
        )}
      </View>
    </View>
  )
}, areMessageBubblePropsEqual)
