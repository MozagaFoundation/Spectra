/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { AlertCircle, LoaderCircle } from 'lucide-react-native'
import { AudioPlayer } from '../AudioPlayer'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import type { MediaAttachment } from '@/lib/types'
import { getTrustedMediaUri } from './attachmentUtils'
import { nowRenderMs, recordRenderMetric } from '@/lib/renderMetrics'

export const VoiceNoteAttachment = memo(function VoiceNoteAttachment({
  attachment,
  isOwn,
  onPrepareAttachment,
}: {
  attachment: MediaAttachment
  isOwn: boolean
  onPrepareAttachment?: () => Promise<MediaAttachment>
}) {
  const colors = useThemeColors()
  const renderCountRef = React.useRef(0)
  renderCountRef.current += 1
  const [isPreparing, setIsPreparing] = React.useState(false)
  const [prepareFailed, setPrepareFailed] = React.useState(false)
  const [preparedAttachment, setPreparedAttachment] = React.useState<MediaAttachment | null>(null)
  const activeAttachment = preparedAttachment?.id === attachment.id ? preparedAttachment : attachment
  const trustedUri = getTrustedMediaUri(activeAttachment.uri)
  const isEncryptedPending = !attachment.uri && attachment.isEncrypted

  React.useEffect(() => {
    recordRenderMetric('media', 'voice_note_attachment_render', {
      renders: renderCountRef.current,
      fileSize: attachment.fileSize ?? null,
      durationMs: activeAttachment.durationMs ?? null,
      hasTrustedUri: Boolean(trustedUri),
      isEncryptedPending,
      isPreparing,
      prepareFailed,
    })
  })

  React.useEffect(() => {
    setPreparedAttachment(null)
    setPrepareFailed(false)
  }, [attachment.id, attachment.uri])

  const handlePrepareVoiceNote = React.useCallback(async () => {
    if (!onPrepareAttachment || isPreparing) {
      return
    }

    try {
      const startedAt = nowRenderMs()
      recordRenderMetric('media', 'voice_note_prepare_requested', {
        fileSize: attachment.fileSize ?? null,
        durationMs: attachment.durationMs ?? null,
      })
      setIsPreparing(true)
      setPrepareFailed(false)
      const prepared = await onPrepareAttachment()
      if (!getTrustedMediaUri(prepared.uri)) {
        throw new Error('Prepared voice note did not resolve to a trusted URI')
      }
      setPreparedAttachment(prepared)
      recordRenderMetric('media', 'voice_note_prepare_succeeded', {
        elapsedMs: Number((nowRenderMs() - startedAt).toFixed(2)),
        fileSize: attachment.fileSize ?? null,
        durationMs: prepared.durationMs ?? null,
      })
    } catch {
      setPrepareFailed(true)
      recordRenderMetric('media', 'voice_note_prepare_failed', {
        fileSize: attachment.fileSize ?? null,
        durationMs: attachment.durationMs ?? null,
      })
      Alert.alert(translate('Unable to load voice note'), translate('This voice note could not be loaded right now.'))
    } finally {
      setIsPreparing(false)
    }
  }, [attachment.durationMs, attachment.fileSize, isPreparing, onPrepareAttachment])

  if (!trustedUri) {
    if (isEncryptedPending || isPreparing) {
      const label = isPreparing
        ? translate('Preparing voice note...')
        : prepareFailed
          ? translate('Tap to retry')
          : onPrepareAttachment
            ? translate('Tap to load voice note')
            : translate('Loading voice note...')

      const placeholder = (
        <View className="min-w-[200px] flex-row items-center gap-2 py-1">
          <LoaderCircle size={18} color={isOwn ? 'rgba(255,255,255,0.7)' : colors.primary} />
          <Text className={`text-xs ${isOwn ? 'text-white/70' : 'text-text-muted'}`}>
            {label}
          </Text>
        </View>
      )

      if (onPrepareAttachment) {
        return (
          <Pressable onPress={() => void handlePrepareVoiceNote()}>
            {placeholder}
          </Pressable>
        )
      }

      return placeholder
    }

    return (
      <View className="min-w-[200px] flex-row items-center gap-2 py-1">
        <AlertCircle size={18} color={colors.textTertiary} />
        <Text className={`text-xs ${isOwn ? 'text-white/70' : 'text-text-muted'}`}>
          {translate('Voice note unavailable')}
        </Text>
      </View>
    )
  }

  return (
    <View className="min-w-[200px]">
      <AudioPlayer
        uri={trustedUri}
        durationMs={activeAttachment.durationMs}
        waveform={activeAttachment.waveform}
        isOwn={isOwn}
      />
    </View>
  )
})
