/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Modal, Pressable, Text, View } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { Image } from 'expo-image'
import Pdf from 'react-native-pdf'
import { Download, Check, Pencil, X } from 'lucide-react-native'
import { useThemeColors } from '@/lib/theme'
import { useDeviceInsets } from '@/hooks/useDeviceInsets'
import { recordChatDiagnostic } from '@/services/chat/chatDiagnostics'
import { translate } from '@/lib/i18n'
import {
  MediaExportError,
  saveImageToLibrary,
  shareAttachment,
} from '@/services/media'

function getUriScheme(uri: string | null | undefined): string | null {
  if (!uri) {
    return null
  }

  const match = uri.match(/^([a-z0-9+.-]+):/i)
  return match?.[1]?.toLowerCase() ?? 'unknown'
}

interface MediaLightboxProps {
  visible: boolean
  uri?: string | null
  mimeType?: string
  mediaType: 'image' | 'pdf'
  title?: string
  allowExport?: boolean
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk'
  onEdit?: () => void
  onClose: () => void
}

export function MediaLightbox({
  visible,
  uri,
  mimeType,
  mediaType,
  title,
  allowExport = true,
  cachePolicy,
  onEdit,
  onClose,
}: MediaLightboxProps) {
  const colors = useThemeColors()
  const insets = useDeviceInsets()
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [controlsVisible, setControlsVisible] = useState(true)
  const resolvedCachePolicy = cachePolicy ?? (uri?.startsWith('file:') ? 'disk' : 'memory-disk')

  const pdfSource = useMemo(() => {
    if (!uri || mediaType !== 'pdf') {
      return undefined
    }

    return { uri, cache: true }
  }, [mediaType, uri])

  React.useEffect(() => {
    if (!visible) {
      setPdfError(null)
      setSaveState('idle')
      return
    }

    setControlsVisible(true)
  }, [visible, uri])

  React.useEffect(() => {
    if (!visible) {
      return
    }

    recordChatDiagnostic('media', 'lightbox_opened', {
      mediaType,
      uriScheme: getUriScheme(uri),
      hasUri: Boolean(uri),
    })
  }, [mediaType, uri, visible])

  const handleSave = useCallback(async () => {
    if (!uri || saveState === 'saving') return

    setSaveState('saving')

    try {
      if (mediaType === 'image') {
        await saveImageToLibrary(uri, {
          defaultExtension: 'jpg',
          fileName: title,
          mimeType,
        })
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 2000)
      } else {
        await shareAttachment(uri, {
          defaultExtension: 'pdf',
          dialogTitle: title || translate('Export PDF'),
          fileName: title,
          mimeType: mimeType || 'application/pdf',
          UTI: 'com.adobe.pdf',
        })
        setSaveState('idle')
      }
    } catch (error) {
      if (error instanceof MediaExportError) {
        if (error.code === 'permission_denied') {
          Alert.alert(translate('Permission needed'), translate('Allow photo library access to save images.'))
        } else if (error.code === 'sharing_unavailable') {
          Alert.alert(translate('Unavailable'), translate('Sharing is not available on this device.'))
        } else {
          console.warn('Failed to save media:', error)
          Alert.alert(
            translate(mediaType === 'image' ? 'Save failed' : 'Export failed'),
            mediaType === 'image'
              ? translate('Could not save the file. Please try again.')
              : translate('Could not export the file. Please try again.'),
          )
        }
        setSaveState('idle')
        return
      }

      console.warn('Failed to save media:', error)
      Alert.alert(
        translate(mediaType === 'image' ? 'Save failed' : 'Export failed'),
        mediaType === 'image'
          ? translate('Could not save the file. Please try again.')
          : translate('Could not export the file. Please try again.'),
      )
      setSaveState('idle')
    }
  }, [uri, mediaType, mimeType, saveState, title])

  const SaveIcon = saveState === 'saved' ? Check : Download
  const shouldShowControls = mediaType === 'pdf' || controlsVisible

  const handleToggleControls = useCallback(() => {
    if (mediaType !== 'image') {
      return
    }

    setControlsVisible((current) => !current)
  }, [mediaType])

  const imageDismissGesture = useMemo(() => Gesture.Pan()
    .enabled(mediaType === 'image')
    .runOnJS(true)
    .activeOffsetY([-Number.MAX_SAFE_INTEGER, -25])
    .failOffsetX([-30, 30])
    .onEnd((event) => {
      const upward = -event.translationY
      const horizontal = Math.abs(event.translationX)
      const velocityUp = -event.velocityY
      const passedDistance = upward > 90 && upward > horizontal * 1.2
      const passedFling = upward > 40 && velocityUp > 800 && upward > horizontal
      if (passedDistance || passedFling) {
        onClose()
      }
    }), [mediaType, onClose])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="flex-1 bg-black/95">
        {shouldShowControls ? (
          <View
            className="absolute left-0 right-0 z-10 flex-row items-center justify-between px-4"
            style={{
              top: 0,
              paddingTop: insets.top + 8,
              paddingBottom: 10,
              backgroundColor: '#000000',
            }}
          >
            <View className="flex-1 pr-3">
              {title ? (
                <Text className="text-white text-sm font-medium" numberOfLines={1}>
                  {title}
                </Text>
              ) : null}
            </View>

            <View className="flex-row items-center gap-2">
              {uri && allowExport ? (
                <Pressable
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: saveState === 'saved' ? 'rgba(34,197,94,0.38)' : 'rgba(255,255,255,0.24)' }}
                  onPress={handleSave}
                  hitSlop={8}
                  disabled={saveState === 'saving'}
                  accessibilityLabel={translate(mediaType === 'image' ? 'Save image' : 'Export PDF')}
                >
                  {saveState === 'saving' ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <SaveIcon size={20} color={saveState === 'saved' ? '#22c55e' : 'white'} />
                  )}
                </Pressable>
              ) : null}
              {uri && mediaType === 'image' && onEdit ? (
                <Pressable
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: 'rgba(255,255,255,0.24)' }}
                  onPress={onEdit}
                  hitSlop={8}
                  accessibilityLabel={translate('Edit image')}
                >
                  <Pencil size={20} color="white" />
                </Pressable>
              ) : null}

              <Pressable
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.24)' }}
                onPress={onClose}
                hitSlop={8}
                accessibilityLabel={translate('Close media preview')}
              >
                <X size={20} color="white" />
              </Pressable>
            </View>
          </View>
        ) : null}

        {mediaType === 'image' ? (
          <GestureDetector gesture={imageDismissGesture}>
            <Pressable
              className="flex-1 items-center justify-center px-4 py-16"
              onPress={handleToggleControls}
              accessibilityLabel={translate('Toggle media controls')}
              accessibilityRole="button"
            >
            {uri ? (
              <Image
                source={{ uri }}
                style={{ width: '100%', height: '100%' }}
                contentFit="contain"
                cachePolicy={resolvedCachePolicy}
                transition={200}
                recyclingKey={`${uri}-lightbox`}
                onLoadStart={() => {
                  recordChatDiagnostic('media', 'lightbox_image_load_started', {
                    mediaType,
                    uriScheme: getUriScheme(uri),
                  })
                }}
                onLoad={() => {
                  recordChatDiagnostic('media', 'lightbox_image_load_succeeded', {
                    mediaType,
                    uriScheme: getUriScheme(uri),
                  })
                }}
                onError={() => {
                  recordChatDiagnostic('media', 'lightbox_image_load_failed', {
                    mediaType,
                    uriScheme: getUriScheme(uri),
                  })
                }}
              />
            ) : (
              <Text className="text-white/70 text-sm">{translate('Image unavailable')}</Text>
            )}
            </Pressable>
          </GestureDetector>
        ) : (
          <View
            className="flex-1 px-3"
            style={{ paddingTop: insets.top + 56, paddingBottom: insets.bottom + 12 }}
          >
            {uri && pdfSource && !pdfError ? (
              <Pdf
                source={pdfSource}
                style={{ flex: 1, width: '100%', backgroundColor: 'transparent' }}
                trustAllCerts={false}
                enableDoubleTapZoom
                renderActivityIndicator={() => (
                  <View className="flex-1 items-center justify-center">
                    <ActivityIndicator color={colors.primary} />
                  </View>
                )}
                onError={(error) => {
                  console.warn('Failed to load PDF preview:', error)
                  setPdfError(translate('File unavailable'))
                }}
              />
            ) : (
              <View className="flex-1 items-center justify-center px-8">
                <Text className="text-white/70 text-center text-sm">
                  {pdfError || translate('File unavailable')}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
      </GestureHandlerRootView>
    </Modal>
  )
}
