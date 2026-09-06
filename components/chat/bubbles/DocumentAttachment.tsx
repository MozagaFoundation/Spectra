/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo } from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import { FileText, Download, LoaderCircle } from 'lucide-react-native'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'
import { formatFileSize } from '@/lib/utils'
import type { MediaAttachment } from '@/lib/types'
import { openAttachmentExternally } from '@/services/media'
import { nowRenderMs, recordRenderMetric } from '@/lib/renderMetrics'

export const DocumentAttachment = memo(function DocumentAttachment({
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
  const isEncryptedPending = !attachment.uri && attachment.isEncrypted

  React.useEffect(() => {
    recordRenderMetric('media', 'document_attachment_render', {
      renders: renderCountRef.current,
      attachmentType: attachment.type,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize ?? null,
      hasUri: Boolean(attachment.uri),
      isEncryptedPending,
      isPreparing,
    })
  })

  const handlePress = React.useCallback(async () => {
    if (isPreparing) {
      return
    }

    let resolvedAttachment = attachment

    if (isEncryptedPending) {
      if (!onPrepareAttachment) {
        Alert.alert(translate('File unavailable'), translate('This document is not available on this device yet.'))
        return
      }

      try {
        const startedAt = nowRenderMs()
        recordRenderMetric('media', 'document_prepare_requested', {
          attachmentType: attachment.type,
          mimeType: attachment.mimeType,
          fileSize: attachment.fileSize ?? null,
        })
        setIsPreparing(true)
        resolvedAttachment = await onPrepareAttachment()
        recordRenderMetric('media', 'document_prepare_succeeded', {
          elapsedMs: Number((nowRenderMs() - startedAt).toFixed(2)),
          attachmentType: attachment.type,
          mimeType: attachment.mimeType,
          fileSize: attachment.fileSize ?? null,
          hasUri: Boolean(resolvedAttachment.uri),
        })
      } catch (error) {
        recordRenderMetric('media', 'document_prepare_failed', {
          attachmentType: attachment.type,
          mimeType: attachment.mimeType,
          fileSize: attachment.fileSize ?? null,
        })
        console.warn('Failed to decrypt document attachment:', error)
        Alert.alert(translate('Unable to decrypt file'), translate('This document could not be decrypted right now.'))
        return
      } finally {
        setIsPreparing(false)
      }
    }

    if (!resolvedAttachment.uri) {
      Alert.alert(translate('File unavailable'), translate('This document is not available on this device yet.'))
      return
    }

    const opened = await openAttachmentExternally(resolvedAttachment)
    if (!opened) {
      Alert.alert(translate('Unable to open file'), translate('No app is available to open this file.'))
    }
  }, [attachment, isEncryptedPending, isPreparing, onPrepareAttachment])

  return (
    <Pressable className="flex-row items-center gap-3 py-1" onPress={handlePress}>
      <View className={`w-10 h-10 rounded-lg items-center justify-center ${
        isOwn ? 'bg-white/20' : 'bg-primary/20'
      }`}>
        <FileText size={20} color={isOwn ? 'white' : colors.primary} />
      </View>
      <View className="flex-1">
        <Text className={`text-sm font-medium ${isOwn ? 'text-white' : 'text-text'}`} numberOfLines={1}>
          {attachment.fileName}
        </Text>
        <Text className={`text-xs ${isOwn ? 'text-white/60' : 'text-text-muted'}`}>
          {isPreparing
            ? translate('Decrypting document...')
            : isEncryptedPending
              ? translate('Tap to decrypt')
              : formatFileSize(attachment.fileSize)}
        </Text>
      </View>
      {isPreparing ? (
        <LoaderCircle size={18} color={isOwn ? 'rgba(255,255,255,0.7)' : colors.primary} />
      ) : (
        <Download size={18} color={isOwn ? 'rgba(255,255,255,0.6)' : colors.textTertiary} />
      )}
    </Pressable>
  )
})
