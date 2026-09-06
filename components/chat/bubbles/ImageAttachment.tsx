/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo } from 'react'
import { View, Text, Pressable, Alert, useWindowDimensions } from 'react-native'
import { Image } from 'expo-image'
import { AlertCircle, LoaderCircle } from 'lucide-react-native'
import { MediaLightbox } from '../MediaLightbox'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'
import type { MediaAttachment } from '@/lib/types'
import { getTrustedMediaUri, saveImageToGallery, shareAttachment } from './attachmentUtils'
import { recordChatDiagnostic } from '@/services/chat/chatDiagnostics'
import { nowRenderMs, recordRenderMetric } from '@/lib/renderMetrics'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'

function resolveImageCachePolicy(uri: string | null, ephemeral: boolean): 'memory' | 'memory-disk' {
  if (!uri || ephemeral || uri.startsWith('data:') || uri.startsWith('blob:')) {
    return 'memory'
  }
  return uri.startsWith('file:') ? 'memory-disk' : 'memory'
}

function getUriScheme(uri: string | null): string | null {
  if (!uri) {
    return null
  }

  const match = uri.match(/^([a-z0-9+.-]+):/i)
  return match?.[1]?.toLowerCase() ?? 'unknown'
}

function categorizePrepareError(error: unknown): 'availability' | 'decode' | 'metadata' | 'transport' | 'unknown' {
  const message = (error instanceof Error ? getErrorDisplayMessage(error) : String(error)).toLowerCase()

  if (message.includes('encryption key')) {
    return 'metadata'
  }

  if (
    message.includes('already downloaded')
    || message.includes('no longer available')
    || message.includes('media not found')
  ) {
    return 'availability'
  }

  if (
    message.includes('decrypt')
    || message.includes('encrypted blob')
    || message.includes('blob parse')
    || message.includes('candidate')
    || message.includes('tor media response')
    || message.includes('integrity')
    || message.includes('hash mismatch')
    || message.includes('size mismatch')
    || message.includes('local uri')
  ) {
    return 'decode'
  }

  if (
    message.includes('timed out')
    || message.includes('tor')
    || message.includes('http ')
    || message.includes('request failed')
    || message.includes('download url')
  ) {
    return 'transport'
  }

  return 'unknown'
}

export const ImageAttachment = memo(function ImageAttachment({
  attachment,
  isOwn,
  onPrepareAttachment,
  onEditImageAttachment,
}: {
  attachment: MediaAttachment
  isOwn: boolean
  onPrepareAttachment?: () => Promise<MediaAttachment>
  onEditImageAttachment?: () => void | Promise<void>
}) {
  const colors = useThemeColors()
  const renderCountRef = React.useRef(0)
  renderCountRef.current += 1
  const [error, setError] = React.useState(false)
  const [viewerOpen, setViewerOpen] = React.useState(false)
  const [isPreparing, setIsPreparing] = React.useState(false)
  const [prepareFailed, setPrepareFailed] = React.useState(false)
  const isEncryptedPending = !attachment.uri && attachment.isEncrypted
  const trustedUri = getTrustedMediaUri(attachment.uri)
  const imageCachePolicy = resolveImageCachePolicy(trustedUri, attachment.isViewOnce === true)
  const { width: windowWidth } = useWindowDimensions()
  const { displayHeight, displayWidth } = React.useMemo(() => {
    const maxWidth = Math.min(280, Math.max(220, windowWidth * 0.72))
    const maxHeight = 380
    const width = attachment.width || maxWidth
    const height = attachment.height || maxHeight
    const aspectRatio = width / height
    let nextDisplayWidth = maxWidth
    let nextDisplayHeight = nextDisplayWidth / aspectRatio

    if (nextDisplayHeight > maxHeight) {
      nextDisplayHeight = maxHeight
      nextDisplayWidth = nextDisplayHeight * aspectRatio
    }

    return {
      displayHeight: nextDisplayHeight,
      displayWidth: nextDisplayWidth,
    }
  }, [attachment.height, attachment.width, windowWidth])

  React.useEffect(() => {
    recordRenderMetric('media', 'image_attachment_render', {
      renders: renderCountRef.current,
      hasTrustedUri: Boolean(trustedUri),
      isEncryptedPending,
      isPreparing,
      prepareFailed,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
    })
  })

  React.useEffect(() => {
    if (trustedUri) {
      setError(false)
      setPrepareFailed(false)
    }
  }, [trustedUri])

  const handleEditImage = React.useCallback(() => {
    if (!onEditImageAttachment) return
    setViewerOpen(false)
    void Promise.resolve(onEditImageAttachment()).catch((error) => {
      console.warn('[ImageAttachment] Failed to open image editor:', error)
      Alert.alert(translate('Unable to edit image'), translate('This image could not be edited right now.'))
    })
  }, [onEditImageAttachment])

  const handleLongPressImage = React.useCallback(() => {
    if (!trustedUri) return
    Alert.alert(
      attachment.fileName || translate('Image'),
      undefined,
      [
        ...(onEditImageAttachment
          ? [{ text: translate('Edit and resend'), onPress: handleEditImage }]
          : []),
        { text: translate('Save to Gallery'), onPress: () => saveImageToGallery(trustedUri) },
        { text: translate('Share'), onPress: () => shareAttachment(trustedUri, attachment.fileName, attachment.mimeType) },
        { text: translate('Cancel'), style: 'cancel' },
      ],
    )
  }, [trustedUri, attachment.fileName, attachment.mimeType, handleEditImage, onEditImageAttachment])

  const handlePrepareImage = React.useCallback(async () => {
    if (!onPrepareAttachment || isPreparing) {
      return
    }

    setPrepareFailed(false)
    const startedAt = nowRenderMs()
    recordRenderMetric('media', 'image_prepare_requested', {
      hasTrustedUri: Boolean(trustedUri),
      viewerOpen,
      fileSize: attachment.fileSize ?? null,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
    })
    recordChatDiagnostic('media', 'image_prepare_started', {
      attachmentId: attachment.id,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      viewerOpen,
    })

    try {
      setIsPreparing(true)
      const prepared = await onPrepareAttachment()
      if (!prepared.uri) {
        throw new Error('Prepared image did not resolve to a local URI')
      }
      setError(false)

      recordChatDiagnostic('media', 'image_prepare_succeeded', {
        attachmentId: attachment.id,
        mimeType: attachment.mimeType,
        resolvedUriScheme: getUriScheme(prepared.uri),
      })
      recordRenderMetric('media', 'image_prepare_succeeded', {
        elapsedMs: Number((nowRenderMs() - startedAt).toFixed(2)),
        fileSize: attachment.fileSize ?? null,
        resolvedUriScheme: getUriScheme(prepared.uri),
      })
    } catch (prepareError) {
      setPrepareFailed(true)
      recordChatDiagnostic('media', 'image_prepare_failed', {
        attachmentId: attachment.id,
        mimeType: attachment.mimeType,
        failureCategory: categorizePrepareError(prepareError),
        error:
          prepareError instanceof Error ? prepareError.message : String(prepareError),
      })
      recordRenderMetric('media', 'image_prepare_failed', {
        elapsedMs: Number((nowRenderMs() - startedAt).toFixed(2)),
        failureCategory: categorizePrepareError(prepareError),
      })
      Alert.alert(translate('Unable to load image'), translate('This image could not be loaded right now.'))
    } finally {
      setIsPreparing(false)
    }
  }, [
    attachment.fileSize,
    attachment.height,
    attachment.id,
    attachment.mimeType,
    attachment.width,
    isPreparing,
    onPrepareAttachment,
    trustedUri,
    viewerOpen,
  ])

  const handleOpenViewer = React.useCallback(() => {
    if (!trustedUri) {
      void handlePrepareImage()
      return
    }

    recordChatDiagnostic('media', 'image_viewer_opened', {
      attachmentId: attachment.id,
      mimeType: attachment.mimeType,
      uriScheme: getUriScheme(trustedUri),
      fileSize: attachment.fileSize,
      width: attachment.width,
      height: attachment.height,
    })
    recordRenderMetric('media', 'image_viewer_opened', {
      hasTrustedUri: true,
      fileSize: attachment.fileSize ?? null,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
    })
    setViewerOpen(true)
  }, [
    attachment.fileSize,
    attachment.height,
    attachment.id,
    attachment.mimeType,
    attachment.width,
    handlePrepareImage,
    trustedUri,
  ])
  
  if (error || (!trustedUri && !isEncryptedPending && !isPreparing)) {
    return (
      <View 
        className="rounded-xl overflow-hidden mb-2 bg-surface-elevated items-center justify-center"
        style={{ width: displayWidth, height: displayHeight }}
      >
        <AlertCircle size={24} color={colors.textTertiary} />
        <Text className="text-text-muted text-xs mt-1">{translate('Image unavailable')}</Text>
      </View>
    )
  }

  if (!trustedUri && (isEncryptedPending || isPreparing)) {
    const loadingLabel = isPreparing
      ? translate('Preparing image...')
      : prepareFailed
        ? translate('Tap to retry')
        : onPrepareAttachment
          ? translate('Tap to load image')
          : translate('Loading image...')

    const placeholder = (
      <View
        className="rounded-xl overflow-hidden mb-2 items-center justify-center gap-2"
        style={{
          width: displayWidth,
          height: displayHeight,
          backgroundColor: isOwn ? 'rgba(255,255,255,0.16)' : colors.surface,
        }}
      >
        <LoaderCircle size={22} color={isOwn ? 'rgba(255,255,255,0.75)' : colors.primary} />
        <Text className={`text-xs ${isOwn ? 'text-white/70' : 'text-text-muted'}`}>
          {loadingLabel}
        </Text>
      </View>
    )

    if (onPrepareAttachment) {
      return (
        <Pressable onPress={() => void handlePrepareImage()}>
          {placeholder}
        </Pressable>
      )
    }

    return (
      placeholder
    )
  }

  return (
    <>
      <Pressable
        className="rounded-xl overflow-hidden mb-2"
        onPress={handleOpenViewer}
        onLongPress={handleLongPressImage}
        delayLongPress={300}
      >
        <Image
          source={{ uri: trustedUri! }}
          style={{ width: displayWidth, height: displayHeight }}
          contentFit="cover"
          onLoadStart={() => {
            recordChatDiagnostic('media', 'image_load_started', {
              attachmentId: attachment.id,
              mimeType: attachment.mimeType,
              uriScheme: getUriScheme(trustedUri),
              fileSize: attachment.fileSize,
            })
          }}
          onLoad={() => {
            recordChatDiagnostic('media', 'image_load_succeeded', {
              attachmentId: attachment.id,
              mimeType: attachment.mimeType,
              uriScheme: getUriScheme(trustedUri),
              width: attachment.width,
              height: attachment.height,
            })
          }}
          onError={() => {
            setError(true)
            if (onPrepareAttachment) {
              void handlePrepareImage()
            }
            recordChatDiagnostic('media', 'image_load_failed', {
              attachmentId: attachment.id,
              mimeType: attachment.mimeType,
              uriScheme: getUriScheme(trustedUri),
              fileSize: attachment.fileSize,
            })
          }}
          cachePolicy={imageCachePolicy}
          transition={200}
          recyclingKey={attachment.id}
        />
      </Pressable>

      <MediaLightbox
        visible={viewerOpen}
        uri={trustedUri}
        mimeType={attachment.mimeType}
        mediaType="image"
        title={attachment.fileName}
        cachePolicy={imageCachePolicy}
        onEdit={onEditImageAttachment ? handleEditImage : undefined}
        onClose={() => setViewerOpen(false)}
      />
    </>
  )
})
