/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo } from 'react'
import { View, Text, Pressable, Alert } from 'react-native'
import { FileText, LoaderCircle } from 'lucide-react-native'
import { MediaLightbox } from '../MediaLightbox'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'
import { formatFileSize } from '@/lib/utils'
import type { MediaAttachment } from '@/lib/types'
import { getTrustedMediaUri } from './attachmentUtils'
import { nowRenderMs, recordRenderMetric } from '@/lib/renderMetrics'

export const PdfPreviewAttachment = memo(function PdfPreviewAttachment({
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
  const [viewerOpen, setViewerOpen] = React.useState(false)
  const [isPreparing, setIsPreparing] = React.useState(false)
  const trustedAttachmentUri = getTrustedMediaUri(attachment.uri)
  const [viewerUri, setViewerUri] = React.useState<string | null>(trustedAttachmentUri)
  const isEncryptedPending = !attachment.uri && attachment.isEncrypted

  React.useEffect(() => {
    recordRenderMetric('media', 'pdf_attachment_render', {
      renders: renderCountRef.current,
      fileSize: attachment.fileSize ?? null,
      hasViewerUri: Boolean(viewerUri),
      isEncryptedPending,
      isPreparing,
      viewerOpen,
    })
  })

  React.useEffect(() => {
    const trustedUri = getTrustedMediaUri(attachment.uri)
    setViewerUri(trustedUri)
  }, [attachment.uri])

  const handlePress = React.useCallback(async () => {
    if (isPreparing) {
      return
    }

    let resolvedAttachment = attachment

    if (isEncryptedPending) {
      if (!onPrepareAttachment) {
        Alert.alert(translate('File unavailable'), translate('This PDF is not available on this device yet.'))
        return
      }

      try {
        const startedAt = nowRenderMs()
        recordRenderMetric('media', 'pdf_prepare_requested', {
          fileSize: attachment.fileSize ?? null,
        })
        setIsPreparing(true)
        resolvedAttachment = await onPrepareAttachment()
        recordRenderMetric('media', 'pdf_prepare_succeeded', {
          elapsedMs: Number((nowRenderMs() - startedAt).toFixed(2)),
          fileSize: attachment.fileSize ?? null,
          hasUri: Boolean(resolvedAttachment.uri),
        })
      } catch (error) {
        recordRenderMetric('media', 'pdf_prepare_failed', {
          fileSize: attachment.fileSize ?? null,
        })
        console.warn('Failed to decrypt PDF attachment:', error)
        Alert.alert(translate('Unable to decrypt file'), translate('This PDF could not be decrypted right now.'))
        return
      } finally {
        setIsPreparing(false)
      }
    }

    if (!resolvedAttachment.uri) {
      Alert.alert(translate('File unavailable'), translate('This PDF is not available on this device yet.'))
      return
    }

    const trustedUri = getTrustedMediaUri(resolvedAttachment.uri)
    if (!trustedUri) {
      Alert.alert(translate('File unavailable'), translate('This PDF is not available on this device yet.'))
      return
    }

    setViewerUri(trustedUri)
    recordRenderMetric('media', 'pdf_viewer_opened', {
      fileSize: attachment.fileSize ?? null,
      wasEncryptedPending: isEncryptedPending,
    })
    setViewerOpen(true)
  }, [attachment, isEncryptedPending, isPreparing, onPrepareAttachment])

  const metaText = isPreparing
    ? translate('Decrypting PDF...')
    : isEncryptedPending
      ? translate('Tap to decrypt')
      : `${formatFileSize(attachment.fileSize)} · PDF`

  return (
    <>
      <Pressable className="rounded-xl overflow-hidden mb-1" style={{ width: 240 }} onPress={handlePress}>
        <View
          className="h-72 items-center justify-center overflow-hidden"
          style={{ backgroundColor: isOwn ? 'rgba(255,255,255,0.08)' : colors.surface }}
        >
          <View className="items-center justify-center gap-3 flex-1 px-6">
            <View
              className="w-16 h-16 rounded-2xl items-center justify-center"
              style={{ backgroundColor: '#E5393520' }}
            >
              {isPreparing ? (
                <LoaderCircle size={28} color={isOwn ? 'rgba(255,255,255,0.8)' : colors.primary} />
              ) : (
                <FileText size={28} color="#E53935" />
              )}
            </View>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#E53935', letterSpacing: 1 }}>PDF</Text>
            <Text
              className={`text-xs text-center ${isOwn ? 'text-white/60' : 'text-text-muted'}`}
            >
              {isPreparing
                ? translate('Preparing secure preview...')
                : isEncryptedPending
                  ? translate('Tap to decrypt')
                  : translate('Tap to preview')}
            </Text>
          </View>
        </View>

        <View className="px-3 py-2" style={{ backgroundColor: isOwn ? 'rgba(255,255,255,0.08)' : colors.surface + '80' }}>
          <Text className={`text-sm font-medium ${isOwn ? 'text-white' : 'text-text'}`} numberOfLines={1}>
            {attachment.fileName}
          </Text>
          <Text className={`text-xs mt-0.5 ${isOwn ? 'text-white/50' : 'text-text-muted'}`}>
            {metaText}
          </Text>
        </View>
      </Pressable>

      <MediaLightbox
        visible={viewerOpen}
        uri={viewerUri}
        mimeType={attachment.mimeType}
        mediaType="pdf"
        title={attachment.fileName}
        onClose={() => setViewerOpen(false)}
      />
    </>
  )
})
