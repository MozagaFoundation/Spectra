/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { Eye, Image, Lock, Mic } from 'lucide-react-native'
import { MediaLightbox } from '../MediaLightbox'
import { ViewOnceTextViewer } from '../ViewOnceTextViewer'
import { ViewOnceVoiceNoteViewer } from '../ViewOnceVoiceNoteViewer'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'
import type { ChatMessage, MediaAttachment, OneTimeMessageKind, OneTimeRevealPayload } from '@/lib/types'
import { requiresOneTimeReveal } from '@/lib/viewOnce'
import { getTrustedMediaUri } from './attachmentUtils'

function getKindIcon(kind: OneTimeMessageKind, size: number, color: string) {
  switch (kind) {
    case 'image':
      return <Image size={size} color={color} />
    case 'voice_note':
      return <Mic size={size} color={color} />
    case 'text':
    default:
      return <Lock size={size} color={color} />
  }
}

function getInlineLabel(
  kind: OneTimeMessageKind,
  isOwn: boolean,
  genericLocked: boolean,
): string {
  if (isOwn) {
    switch (kind) {
      case 'image': return translate('One-time photo')
      case 'voice_note': return translate('One-time voice note')
      default: return translate('One-time message')
    }
  }

  if (genericLocked) {
    return translate('One-time message  ·  Tap to open')
  }

  switch (kind) {
    case 'image': return translate('Photo  ·  Tap to view')
    case 'voice_note': return translate('Voice note  ·  Tap to listen')
    default: return translate('Message  ·  Tap to read')
  }
}

interface ViewOnceMessageContentProps {
  message: ChatMessage
  isOwn: boolean
  onReveal?: (message: ChatMessage) => Promise<OneTimeRevealPayload | null>
  onPrepareAttachment?: (attachment: MediaAttachment) => Promise<MediaAttachment>
  onConsume?: (message: ChatMessage) => void | Promise<void>
}

export const ViewOnceMessageContent = memo(function ViewOnceMessageContent({
  message,
  isOwn,
  onReveal,
  onPrepareAttachment,
  onConsume,
}: ViewOnceMessageContentProps) {
  const colors = useThemeColors()
  const [isPreparing, setIsPreparing] = React.useState(false)
  const [imageViewerOpen, setImageViewerOpen] = React.useState(false)
  const [textViewerOpen, setTextViewerOpen] = React.useState(false)
  const [voiceViewerOpen, setVoiceViewerOpen] = React.useState(false)
  const [revealedPayload, setRevealedPayload] = React.useState<OneTimeRevealPayload | null>(null)
  const [resolvedAttachment, setResolvedAttachment] = React.useState<MediaAttachment | null>(message.attachments?.[0] ?? null)

  const genericLocked = requiresOneTimeReveal(message) && !revealedPayload
  const kind = revealedPayload?.kind ?? message.oneTime?.kind ?? 'text'
  const sourceAttachment = revealedPayload?.attachments?.[0] ?? message.attachments?.[0] ?? null
  const trustedResolvedUri = getTrustedMediaUri(resolvedAttachment?.uri)
  const trustedVoiceAttachment = trustedResolvedUri && resolvedAttachment
    ? { attachment: resolvedAttachment, uri: trustedResolvedUri as string }
    : null

  React.useEffect(() => {
    if (sourceAttachment?.uri) {
      setResolvedAttachment(sourceAttachment)
    }
  }, [sourceAttachment])

  const consumeOnce = React.useCallback(() => {
    if (isOwn) {
      return
    }

    void Promise.resolve(onConsume?.(message)).catch(() => {})
  }, [isOwn, message, onConsume])

  const handleCloseImage = React.useCallback(() => {
    setImageViewerOpen(false)
    consumeOnce()
  }, [consumeOnce])

  const handleCloseText = React.useCallback(() => {
    setTextViewerOpen(false)
    consumeOnce()
  }, [consumeOnce])

  const handleCloseVoice = React.useCallback(() => {
    setVoiceViewerOpen(false)
    consumeOnce()
  }, [consumeOnce])

  const prepareAttachment = React.useCallback(async (
    attachment?: MediaAttachment | null,
  ): Promise<MediaAttachment | null> => {
    const targetAttachment = attachment ?? resolvedAttachment ?? sourceAttachment
    if (!targetAttachment) {
      return null
    }
    if (targetAttachment.uri) {
      const trustedUri = getTrustedMediaUri(targetAttachment.uri)
      if (!trustedUri) {
        Alert.alert(translate('Unable to open message'), translate('This one-time attachment is not available right now.'))
        return null
      }
      const trustedAttachment = { ...targetAttachment, uri: trustedUri }
      setResolvedAttachment(trustedAttachment)
      return trustedAttachment
    }

    if (!onPrepareAttachment || isPreparing) {
      return null
    }

    try {
      setIsPreparing(true)
      const prepared = await onPrepareAttachment(targetAttachment)
      const trustedUri = getTrustedMediaUri(prepared.uri)
      if (!trustedUri) {
        throw new Error('Prepared one-time attachment did not resolve to a trusted URI')
      }
      const trustedAttachment = { ...prepared, uri: trustedUri }
      setResolvedAttachment(trustedAttachment)
      return trustedAttachment
    } catch (error) {
      Alert.alert(translate('Unable to open message'), translate('This one-time attachment is not available right now.'))
      return null
    } finally {
      setIsPreparing(false)
    }
  }, [isPreparing, onPrepareAttachment, resolvedAttachment, sourceAttachment])

  const handleOpen = React.useCallback(async () => {
    if (isOwn || isPreparing) {
      return
    }

    let payload = revealedPayload
    if (!payload && onReveal) {
      setIsPreparing(true)
      try {
        payload = await onReveal(message)
        if (!payload) {
          return
        }
        setRevealedPayload(payload)
      } finally {
        setIsPreparing(false)
      }
    }

    const openKind = payload?.kind ?? kind
    if (openKind === 'text') {
      setTextViewerOpen(true)
      return
    }

    const prepared = await prepareAttachment(payload?.attachments?.[0])
    if (!prepared?.uri) {
      return
    }

    if (openKind === 'image') {
      setImageViewerOpen(true)
      return
    }

    setVoiceViewerOpen(true)
  }, [isOwn, isPreparing, revealedPayload, onReveal, message, kind, prepareAttachment])

  const canOpen = !isOwn
  const iconColor = isOwn ? 'rgba(255,255,255,0.7)' : colors.primary
  const labelColor = isOwn ? 'white' : colors.primary

  const inlineRow = (
    <View className="flex-row items-center gap-1.5 py-0.5">
      {isPreparing ? (
        <ActivityIndicator size={14} color={iconColor} />
      ) : (
        getKindIcon(kind, 14, iconColor)
      )}
      <Text style={{ color: labelColor, fontSize: 14, lineHeight: 20 }}>
        {isPreparing ? translate('Opening...') : getInlineLabel(kind, isOwn, genericLocked)}
      </Text>
      {canOpen && !isPreparing && (
        <Eye size={12} color={iconColor} style={{ marginLeft: 2, opacity: 0.6 }} />
      )}
    </View>
  )

  return (
    <>
      {canOpen ? (
        <Pressable onPress={() => void handleOpen()}>
          {inlineRow}
        </Pressable>
      ) : (
        inlineRow
      )}

      <MediaLightbox
        visible={imageViewerOpen}
        uri={trustedResolvedUri}
        mimeType={resolvedAttachment?.mimeType}
        mediaType="image"
        title={resolvedAttachment?.fileName}
        allowExport={false}
        onClose={handleCloseImage}
      />

      <ViewOnceTextViewer
        visible={textViewerOpen}
        text={revealedPayload?.content ?? message.content}
        onClose={handleCloseText}
      />

      {trustedVoiceAttachment ? (
        <ViewOnceVoiceNoteViewer
          visible={voiceViewerOpen}
          uri={trustedVoiceAttachment.uri}
          durationMs={trustedVoiceAttachment.attachment.durationMs}
          waveform={trustedVoiceAttachment.attachment.waveform}
          onClose={handleCloseVoice}
        />
      ) : null}
    </>
  )
})
