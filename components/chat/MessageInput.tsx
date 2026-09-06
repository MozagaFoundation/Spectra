/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo, useImperativeHandle } from 'react'
import type { ReactNode } from 'react'
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native'
import { Image } from 'expo-image'
import { Send, Plus, Mic, X, FileText, Timer, Pencil } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { getDirectionalTextStyle, getLogicalRowDirection, getStartBorderStyle, isCurrentLanguageRtl } from '@/lib/i18n/direction'
import { translate } from '@/lib/i18n'
import { Haptics, impactAsync as triggerImpact } from '@/lib/safeHaptics'
import { useThemeColors } from '@/lib/theme'
import type { ChatSendOptions, MediaAttachment, ReplyReference } from '@/lib/types'
import { getViewOncePreviewLabel, inferViewOnceKindFromAttachment } from '@/lib/viewOnce'
import { startPerformanceSpan } from '@/lib/performanceMetrics'
import { cleanupEditedAttachments } from '@/services/media/editedImageCache'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import {
  isSpectrePolicyActive,
  SPECTRE_TEXT_ONLY_MESSAGE,
} from '@/lib/spectrePolicy'
import {
  evaluateChatSendPolicy,
  getChatSendAdmissionTitle,
} from '@/services/chat/sendAdmission'
import type { ChatSendAdmission } from '@/services/chat/sendAdmission'

const POST_SEND_AUTOCORRECT_GUARD_MS = 250
const MediaPicker = React.lazy(async () => ({
  default: (await import('./MediaPicker')).MediaPicker,
}))
const VoiceRecorder = React.lazy(async () => ({
  default: (await import('./VoiceRecorder')).VoiceRecorder,
}))
const ImageEditorModal = React.lazy(async () => ({
  default: (await import('@/components/media/ImageEditorModal')).ImageEditorModal,
}))
const PdfPreview = React.lazy(async () => ({
  default: (await import('react-native-pdf')).default,
}))

interface MessageInputProps {
  onSend: (
    message: string,
    attachments?: MediaAttachment[],
    options?: ChatSendOptions,
  ) => ChatSendAdmission | void
  disabled?: boolean
  allowViewOnce?: boolean
  onSendCrypto?: () => void
  onReceiveCrypto?: () => void
  onHashtag?: () => void
  replyTo?: ReplyReference | null
  onCancelReply?: () => void
  placeholder?: string
  footerText?: string
  textOnlyMode?: boolean
  accessory?: ReactNode
  onFocus?: () => void
  composerRef?: React.Ref<MessageInputHandle | null>
}

export type MessageInputHandle = {
  blur: () => void
}

function isImageMimeType(mimeType?: string | null): boolean {
  return typeof mimeType === 'string' && mimeType.toLowerCase().startsWith('image/')
}

function isPdfMimeType(mimeType?: string | null): boolean {
  return (mimeType || '').toLowerCase() === 'application/pdf'
}

export const MessageInput = React.memo(function MessageInput({
  onSend, 
  disabled = false,
  allowViewOnce = true,
  onSendCrypto,
  onReceiveCrypto,
  onHashtag,
  replyTo,
  onCancelReply,
  placeholder,
  footerText,
  textOnlyMode = false,
  accessory,
  onFocus,
  composerRef,
}: MessageInputProps) {
  const colors = useThemeColors()
  const isRtl = isCurrentLanguageRtl()
  const { t } = useTranslation('chat')
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const spectreAccountMode = useSpectreStore((state) => state.spectreAccountMode)
  const walletIsSpectre = useWalletStore((state) => state.wallet?.spectreMode === true)
  const [message, setMessage] = useState('')
  const [showMediaPicker, setShowMediaPicker] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [pendingAttachment, setPendingAttachment] = useState<MediaAttachment | null>(null)
  const [editingAttachment, setEditingAttachment] = useState<MediaAttachment | null>(null)
  const [viewOnceEnabled, setViewOnceEnabled] = useState(false)
  const inputRef = useRef<TextInput>(null)
  useImperativeHandle(composerRef, () => ({
    blur: () => {
      inputRef.current?.blur()
    },
  }), [])
  const inputCommitSpanRef = useRef<ReturnType<typeof startPerformanceSpan> | null>(null)
  const postSendAutocorrectGuardRef = useRef(false)
  const postSendAutocorrectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sendSubmissionRef = useRef(false)
  
  const hasText = message.trim().length > 0
  const hasAttachment = pendingAttachment !== null
  const showSend = hasText || hasAttachment
  const canSend = showSend && !disabled
  const isPendingImage = pendingAttachment ? pendingAttachment.type === 'image' || isImageMimeType(pendingAttachment.mimeType) : false
  const isPendingPdf = pendingAttachment ? isPdfMimeType(pendingAttachment.mimeType) : false
  const pendingViewOnceKind = pendingAttachment ? inferViewOnceKindFromAttachment(pendingAttachment) : null
  const spectrePolicyState = useMemo(() => ({
    enabled: spectreEnabled,
    accountMode: spectreAccountMode,
    walletIsSpectre,
  }), [spectreAccountMode, spectreEnabled, walletIsSpectre])
  const spectreTextOnlyMode = isSpectrePolicyActive(spectrePolicyState)
  const mediaDisabled = disabled || textOnlyMode || spectreTextOnlyMode
  const resolvedPlaceholder = translate(placeholder ?? 'Type a message...', { ns: 'chat' })
  const resolvedFooterText = textOnlyMode
    ? translate('Bluetooth mesh: text messages only', { ns: 'chat' })
    : footerText
      ? translate(footerText, { ns: 'chat' })
      : translate('End-to-end encrypted')
  const composerContainerStyle = {
    backgroundColor: colors.backgroundSecondary,
    borderTopColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -6 },
    elevation: 14,
  }
  
  const showTextOnlyModeAlert = useCallback(() => {
    if (spectreTextOnlyMode) {
      Alert.alert(
        t('Spectre Mode'),
        t(SPECTRE_TEXT_ONLY_MESSAGE),
      )
      return
    }

    Alert.alert(
      t('Bluetooth mesh supports text only'),
      t('Images, files, audio, and voice notes are disabled while Bluetooth mesh is carrying messages. Send a text message or reconnect to the internet to share media.'),
    )
  }, [spectreTextOnlyMode, t])

  const showAdmissionAlert = useCallback((admission: ChatSendAdmission) => {
    if (admission.accepted || admission.reason === 'empty') return
    Alert.alert(t(getChatSendAdmissionTitle(admission)), t(admission.message))
  }, [t])

  const releasePostSendAutocorrectGuard = useCallback(() => {
    postSendAutocorrectGuardRef.current = false
    if (postSendAutocorrectTimerRef.current) {
      clearTimeout(postSendAutocorrectTimerRef.current)
      postSendAutocorrectTimerRef.current = null
    }
  }, [])

  const clearComposerAfterSend = useCallback(() => {
    postSendAutocorrectGuardRef.current = true
    if (postSendAutocorrectTimerRef.current) {
      clearTimeout(postSendAutocorrectTimerRef.current)
    }
    postSendAutocorrectTimerRef.current = setTimeout(() => {
      postSendAutocorrectGuardRef.current = false
      postSendAutocorrectTimerRef.current = null
    }, POST_SEND_AUTOCORRECT_GUARD_MS)
    inputRef.current?.clear()
    setMessage('')
  }, [])

  const handleMessageChange = useCallback((nextMessage: string) => {
    if (postSendAutocorrectGuardRef.current && nextMessage.length > 0) {
      inputRef.current?.clear()
      setMessage('')
      return
    }
    inputCommitSpanRef.current = startPerformanceSpan('composer', 'input_to_commit')
    setMessage(nextMessage)
  }, [])

  useLayoutEffect(() => {
    inputCommitSpanRef.current?.({ count: 1 })
    inputCommitSpanRef.current = null
  }, [message])

  useEffect(() => releasePostSendAutocorrectGuard, [releasePostSendAutocorrectGuard])

  useEffect(() => {
    if (!message && !pendingAttachment) {
      sendSubmissionRef.current = false
    }
  }, [message, pendingAttachment])

  useEffect(() => {
    if (!textOnlyMode && !spectreTextOnlyMode) return
    void cleanupEditedAttachments(pendingAttachment ? [pendingAttachment] : undefined)
    setPendingAttachment(null)
    setEditingAttachment(null)
    setIsRecording(false)
    setViewOnceEnabled(false)
  }, [pendingAttachment, spectreTextOnlyMode, textOnlyMode])

  const handleSend = useCallback(() => {
    if (!canSend || sendSubmissionRef.current) return

    const attachments = pendingAttachment ? [pendingAttachment] : undefined
    const sendOptions = allowViewOnce && viewOnceEnabled
      ? {
          oneTime: {
            kind: pendingViewOnceKind ?? 'text',
          },
        }
      : undefined

    const admission = evaluateChatSendPolicy({
      content: message,
      attachments,
      options: sendOptions,
      spectrePolicyState,
      textOnlyMode,
      allowViewOnce,
    })
    if (!admission.accepted) {
      showAdmissionAlert(admission)
      return
    }

    const draft = {
      message,
      attachment: pendingAttachment,
      viewOnceEnabled,
    }
    sendSubmissionRef.current = true
    clearComposerAfterSend()
    setPendingAttachment(null)
    setViewOnceEnabled(false)

    let sendResult: ChatSendAdmission | void
    try {
      sendResult = onSend(admission.content, admission.attachments, admission.options)
    } catch (error) {
      console.error('[MessageInput] Send failed before queueing:', error)
      releasePostSendAutocorrectGuard()
      setMessage(draft.message)
      setPendingAttachment(draft.attachment)
      setViewOnceEnabled(draft.viewOnceEnabled)
      sendSubmissionRef.current = false
      return
    }

    if (sendResult?.accepted === false) {
      releasePostSendAutocorrectGuard()
      setMessage(draft.message)
      setPendingAttachment(draft.attachment)
      setViewOnceEnabled(draft.viewOnceEnabled)
      sendSubmissionRef.current = false
      return
    }

    triggerImpact(Haptics.ImpactFeedbackStyle.Medium)
  }, [allowViewOnce, canSend, clearComposerAfterSend, message, pendingAttachment, onSend, pendingViewOnceKind, releasePostSendAutocorrectGuard, showAdmissionAlert, spectrePolicyState, textOnlyMode, viewOnceEnabled])
  
  const handleSelectMedia = useCallback((attachment: MediaAttachment) => {
    if (textOnlyMode || spectreTextOnlyMode) {
      showTextOnlyModeAlert()
      return
    }
    if (allowViewOnce && viewOnceEnabled && !inferViewOnceKindFromAttachment(attachment)) {
      Alert.alert(
        t('One-time messages'),
        t('Only photos can be sent in one-time mode from the media picker.'),
      )
      return
    }
    setPendingAttachment(attachment)
  }, [allowViewOnce, showTextOnlyModeAlert, spectreTextOnlyMode, t, textOnlyMode, viewOnceEnabled])
  
  const handleVoiceNoteSend = useCallback((attachment: MediaAttachment) => {
    setIsRecording(false)
    if (textOnlyMode || spectreTextOnlyMode) {
      showTextOnlyModeAlert()
      return
    }
    const sendOptions = allowViewOnce && viewOnceEnabled ? { oneTime: { kind: 'voice_note' as const } } : undefined
    const admission = evaluateChatSendPolicy({
      content: '',
      attachments: [attachment],
      options: sendOptions,
      spectrePolicyState,
      textOnlyMode,
      allowViewOnce,
    })
    if (!admission.accepted) {
      showAdmissionAlert(admission)
      return
    }
    let sendResult: ChatSendAdmission | void
    try {
      sendResult = onSend(admission.content, admission.attachments, admission.options)
    } catch (error) {
      console.error('[MessageInput] Voice note send failed before queueing:', error)
      return
    }
    if (sendResult?.accepted === false) return
    setViewOnceEnabled(false)
  }, [allowViewOnce, onSend, showAdmissionAlert, showTextOnlyModeAlert, spectrePolicyState, spectreTextOnlyMode, textOnlyMode, viewOnceEnabled])
  
  const handleVoiceNoteCancel = useCallback(() => {
    setIsRecording(false)
  }, [])
  
  const handleMicPress = useCallback(async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Medium)
    if (textOnlyMode || spectreTextOnlyMode) {
      showTextOnlyModeAlert()
      return
    }
    setIsRecording(true)
  }, [showTextOnlyModeAlert, spectreTextOnlyMode, textOnlyMode])
  
  const handleRemoveAttachment = useCallback(() => {
    void cleanupEditedAttachments(pendingAttachment ? [pendingAttachment] : undefined)
    setPendingAttachment(null)
  }, [pendingAttachment])

  const handleEditPendingAttachment = useCallback(() => {
    if (!pendingAttachment || !isPendingImage) return
    setEditingAttachment(pendingAttachment)
  }, [isPendingImage, pendingAttachment])

  const handleCancelImageEditor = useCallback(() => {
    setEditingAttachment(null)
  }, [])

  const handleUseOriginalImage = useCallback((attachment: MediaAttachment) => {
    setPendingAttachment(attachment)
    setEditingAttachment(null)
  }, [])

  const handleSaveEditedImage = useCallback((attachment: MediaAttachment) => {
    setPendingAttachment(attachment)
    setEditingAttachment(null)
  }, [])
  
  const openMediaPicker = useCallback(() => {
    if (textOnlyMode || spectreTextOnlyMode) {
      showTextOnlyModeAlert()
      return
    }
    setShowMediaPicker(true)
  }, [showTextOnlyModeAlert, spectreTextOnlyMode, textOnlyMode])
  
  const closeMediaPicker = useCallback(() => {
    setShowMediaPicker(false)
  }, [])

  const toggleViewOnce = useCallback(() => {
    setViewOnceEnabled((prev) => !prev)
  }, [])

  if (isRecording) {
    return (
      <View className="border-t px-3 py-3" style={composerContainerStyle}>
        <React.Suspense fallback={<ActivityIndicator size="small" color={colors.primary} />}>
          <VoiceRecorder
            onSend={handleVoiceNoteSend}
            onCancel={handleVoiceNoteCancel}
          />
        </React.Suspense>
        <View className="items-center pt-2">
          <Text className="text-text-muted text-xs">
            {translate('End-to-end encrypted')}
          </Text>
        </View>
      </View>
    )
  }
  
  return (
    <View className="border-t px-3 pt-3 pb-2" style={composerContainerStyle}>
      {accessory}
      {replyTo && (
        <View
          className="flex-row items-center gap-2 mb-2 rounded-xl p-3"
          style={{
            backgroundColor: colors.surface,
            flexDirection: getLogicalRowDirection(isRtl),
            borderWidth: 1,
            borderColor: colors.border,
            ...getStartBorderStyle(colors.primary, 2, isRtl),
          }}
        >
          <View className="flex-1">
            <Text
              className="text-primary-light text-xs font-semibold"
              style={getDirectionalTextStyle(isRtl)}
              numberOfLines={1}
            >
              {replyTo.senderName}
            </Text>
            <Text className="text-text-muted text-xs" style={getDirectionalTextStyle(isRtl)} numberOfLines={1}>
              {replyTo.previewText}
            </Text>
          </View>
          <Pressable onPress={onCancelReply} className="p-1" accessibilityLabel={t('Cancel reply')}>
            <X size={16} color={colors.textTertiary} />
          </Pressable>
        </View>
      )}

      {pendingAttachment && (
        <View
          className="flex-row items-center gap-3 mb-2 rounded-xl p-2"
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
        >
          {viewOnceEnabled ? (
            <View className="w-12 h-12 rounded-lg bg-primary/15 items-center justify-center">
              <Timer size={18} color={colors.primary} />
            </View>
          ) : isPendingImage ? (
            <Image
              source={{ uri: pendingAttachment.uri }}
              style={{ width: 56, height: 56, borderRadius: 10 }}
              contentFit="cover"
              cachePolicy="memory"
            />
          ) : isPendingPdf ? (
            <View
              className="rounded-lg overflow-hidden"
              style={{ width: 48, height: 64, backgroundColor: colors.backgroundSecondary }}
            >
              <React.Suspense fallback={<ActivityIndicator size="small" color={colors.primary} />}>
                <PdfPreview
                  source={{ uri: pendingAttachment.uri, cache: true }}
                  page={1}
                  singlePage
                  trustAllCerts={false}
                  style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                  renderActivityIndicator={() => (
                    <View className="flex-1 items-center justify-center">
                      <ActivityIndicator size="small" color={colors.primary} />
                    </View>
                  )}
                />
              </React.Suspense>
            </View>
          ) : (
            <View className="w-12 h-12 rounded-lg bg-primary/20 items-center justify-center">
              <FileText size={20} color={colors.primary} />
            </View>
          )}
          <View className="flex-1">
            <Text className="text-text text-sm" numberOfLines={1}>
              {viewOnceEnabled
                ? getViewOncePreviewLabel(pendingViewOnceKind ?? 'image')
                : pendingAttachment.fileName}
            </Text>
            <Text className="text-text-muted text-xs">
              {viewOnceEnabled
                ? t('No preview will be shown after sending')
                : isPendingImage
                  ? t('image preview')
                  : isPendingPdf
                    ? t('pdf preview')
                    : translate(pendingAttachment.type)}
            </Text>
          </View>
          <Pressable onPress={handleRemoveAttachment} className="p-2" accessibilityLabel={t('Remove attachment')}>
            <X size={18} color={colors.textTertiary} />
          </Pressable>
          {isPendingImage && !viewOnceEnabled ? (
            <Pressable onPress={handleEditPendingAttachment} className="p-2" accessibilityLabel={t('Edit image')}>
              <Pencil size={18} color={colors.textTertiary} />
            </Pressable>
          ) : null}
        </View>
      )}

      <View className="flex-row items-end gap-2">
        <Pressable 
          onPress={openMediaPicker} 
          className="p-2"
          disabled={mediaDisabled}
          accessibilityLabel={t('Add attachment')}
        >
          <Plus size={24} color={mediaDisabled ? colors.borderLight : colors.textTertiary} />
        </Pressable>
        
        <View
          className="flex-1 flex-row items-end rounded-2xl pr-2"
          style={{
            backgroundColor: colors.backgroundTertiary,
            borderWidth: 1,
            borderColor: viewOnceEnabled ? colors.primary : colors.borderLight,
          }}
        >
          <TextInput
            ref={inputRef}
            value={message}
            onChangeText={handleMessageChange}
            onKeyPress={releasePostSendAutocorrectGuard}
            placeholder={viewOnceEnabled ? t('One-time message…') : resolvedPlaceholder}
            placeholderTextColor={viewOnceEnabled ? colors.primary + '80' : colors.textMuted}
            multiline
            maxLength={10000}
            editable={!disabled}
            className="flex-1 text-text text-base px-4 py-3 max-h-28 min-h-11"
            style={getDirectionalTextStyle(isRtl)}
            onFocus={onFocus}
          />

          {allowViewOnce && !spectreTextOnlyMode && (
            <Pressable
              className="p-2 mb-0.5"
              onPress={toggleViewOnce}
              disabled={disabled}
              accessibilityLabel={t('Toggle one-time message')}
            >
              <Timer
                size={20}
                color={viewOnceEnabled ? colors.primary : (disabled ? colors.borderLight : colors.textMuted)}
              />
            </Pressable>
          )}
        </View>
        
        <View className="w-11 h-11">
          <Pressable
            onPress={handleSend}
            disabled={!canSend}
            className="w-11 h-11 rounded-full bg-primary items-center justify-center"
            accessibilityLabel={t('Send message')}
            accessibilityState={{ disabled: !canSend }}
            accessibilityElementsHidden={!showSend}
            importantForAccessibility={showSend ? 'auto' : 'no-hide-descendants'}
            pointerEvents={showSend ? 'auto' : 'none'}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              opacity: showSend ? (canSend ? 1 : 0.55) : 0,
            }}
          >
            <Send size={20} color={colors.textOnPrimary} />
          </Pressable>
          <Pressable
            onPress={handleMicPress}
            disabled={mediaDisabled}
            className="w-11 h-11 rounded-full items-center justify-center"
            accessibilityLabel={t('Record voice note')}
            accessibilityElementsHidden={showSend}
            importantForAccessibility={showSend ? 'no-hide-descendants' : 'auto'}
            pointerEvents={showSend ? 'none' : 'auto'}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: colors.backgroundTertiary,
              borderWidth: 1,
              borderColor: colors.borderLight,
              opacity: showSend ? 0 : 1,
            }}
          >
            <Mic size={20} color={mediaDisabled ? colors.borderLight : colors.textTertiary} />
          </Pressable>
        </View>
      </View>
      
      <View className="items-center pt-2">
        <Text className="text-text-muted text-xs">
          {resolvedFooterText}
        </Text>
      </View>
      
      {showMediaPicker ? (
        <React.Suspense fallback={null}>
          <MediaPicker
            visible
            onClose={closeMediaPicker}
            onSelectMedia={handleSelectMedia}
            onSendCrypto={spectreTextOnlyMode ? undefined : onSendCrypto}
            onReceiveCrypto={spectreTextOnlyMode ? undefined : onReceiveCrypto}
            onHashtag={spectreTextOnlyMode ? undefined : onHashtag}
          />
        </React.Suspense>
      ) : null}

      {editingAttachment ? (
        <React.Suspense fallback={null}>
          <ImageEditorModal
            visible
            attachment={editingAttachment}
            onCancel={handleCancelImageEditor}
            onUseOriginal={handleUseOriginalImage}
            onSave={handleSaveEditedImage}
          />
        </React.Suspense>
      ) : null}

    </View>
  )
})
