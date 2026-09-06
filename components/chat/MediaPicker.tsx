/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
  Image,
  Camera,
  FileText,
  X,
  Music,
  Send,
  Hash,
  Download,
  ShieldCheck,
} from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { translate } from '@/lib/i18n'
import { Haptics, impactAsync as triggerImpact } from '@/lib/safeHaptics'
import { useThemeColors, type ThemeColors } from '@/lib/theme'
import type { MediaAttachment } from '@/lib/types'
import { hasMediaLibraryAccess, normalizeOutgoingMediaAttachment } from '@/services/media/outgoingAttachment'

interface MediaPickerProps {
  visible: boolean
  onClose: () => void
  onSelectMedia: (attachment: MediaAttachment) => void
  onSendCrypto?: () => void
  onReceiveCrypto?: () => void
  onHashtag?: () => void
}

interface PickerOption {
  id: string
  label: string
  icon: React.ReactNode
  tint: string
  onPress: () => Promise<void>
}

const AUDIO_TINT = '#f97316'

function OptionTile({ option, colors }: { option: PickerOption; colors: ThemeColors }) {
  return (
    <View className="w-1/4 items-center mb-5">
      <Pressable
        onPress={option.onPress}
        accessibilityRole="button"
        accessibilityLabel={option.label}
        className="active:opacity-70 mb-2"
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          backgroundColor: option.tint + '26',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: option.tint + '40',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {option.icon}
      </Pressable>
      <Text
        className="text-[11px] font-medium"
        numberOfLines={1}
        style={{ color: colors.textSecondary, maxWidth: 76 }}
      >
        {option.label}
      </Text>
    </View>
  )
}

function OptionSection({
  title,
  options,
  colors,
}: {
  title: string
  options: PickerOption[]
  colors: ThemeColors
}) {
  if (options.length === 0) return null
  return (
    <View className="px-5">
      <Text
        className="text-[10px] uppercase font-semibold tracking-widest mb-3"
        style={{ color: colors.textMuted }}
      >
        {title}
      </Text>
      <View className="flex-row flex-wrap">
        {options.map((option) => (
          <OptionTile key={option.id} option={option} colors={colors} />
        ))}
      </View>
    </View>
  )
}

function EncryptedFooter({ colors }: { colors: ThemeColors }) {
  const label = translate('End-to-end encrypted')
  return (
    <View className="items-center px-5 pt-1">
      <View
        className="flex-row items-center gap-2 rounded-full px-3 py-1.5"
        style={{
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        }}
      >
        <ShieldCheck size={12} color={colors.primary} />
        <Text
          className="text-[11px]"
          numberOfLines={1}
          style={{ color: colors.textSecondary }}
        >
          {label}
        </Text>
      </View>
    </View>
  )
}

async function selectOutgoingMedia(
  attachment: MediaAttachment,
  onSelectMedia: (attachment: MediaAttachment) => void,
  onClose: () => void,
): Promise<void> {
  const normalized = await normalizeOutgoingMediaAttachment(attachment)
  onSelectMedia(normalized)
  onClose()
}

export function MediaPicker({
  visible,
  onClose,
  onSelectMedia,
  onSendCrypto,
  onReceiveCrypto,
  onHashtag,
}: MediaPickerProps) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  useTranslation()

  const handleImageFromLibrary = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light)

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!hasMediaLibraryAccess(permission)) {
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: false,
    })

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      const attachment: MediaAttachment = {
        id: `media_${Date.now()}`,
        type: 'image',
        uri: asset.uri,
        source: 'gallery',
        fileName: asset.fileName || `image_${Date.now()}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
        fileSize: asset.fileSize || 0,
        width: asset.width,
        height: asset.height,
      }
      await selectOutgoingMedia(attachment, onSelectMedia, onClose)
    }
  }

  const handleCamera = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light)

    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
      videoMaxDuration: 60,
    })

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      const isVideo = asset.type === 'video'
      const attachment: MediaAttachment = {
        id: `media_${Date.now()}`,
        type: isVideo ? 'video' : 'image',
        uri: asset.uri,
        source: 'camera',
        fileName: asset.fileName || `${isVideo ? 'video' : 'image'}_${Date.now()}.${isVideo ? 'mp4' : 'jpg'}`,
        mimeType: asset.mimeType || (isVideo ? 'video/mp4' : 'image/jpeg'),
        fileSize: asset.fileSize || 0,
        width: asset.width,
        height: asset.height,
        durationMs: isVideo ? (asset.duration ? asset.duration * 1000 : undefined) : undefined,
      }
      await selectOutgoingMedia(attachment, onSelectMedia, onClose)
    }
  }

  const handleDocument = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light)

    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    })

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      const attachment: MediaAttachment = {
        id: `media_${Date.now()}`,
        type: 'document',
        uri: asset.uri,
        source: 'document',
        fileName: asset.name,
        mimeType: asset.mimeType || 'application/octet-stream',
        fileSize: asset.size || 0,
      }
      await selectOutgoingMedia(attachment, onSelectMedia, onClose)
    }
  }

  const handleAudio = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light)

    const result = await DocumentPicker.getDocumentAsync({
      type: 'audio/*',
      copyToCacheDirectory: true,
    })

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      const attachment: MediaAttachment = {
        id: `media_${Date.now()}`,
        type: 'audio',
        uri: asset.uri,
        source: 'audio_document',
        fileName: asset.name,
        mimeType: asset.mimeType || 'audio/mpeg',
        fileSize: asset.size || 0,
      }
      await selectOutgoingMedia(attachment, onSelectMedia, onClose)
    }
  }

  const handleSendCrypto = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light)
    onClose()
    onSendCrypto?.()
  }

  const handleReceiveCrypto = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light)
    onClose()
    onReceiveCrypto?.()
  }

  const handleHashtag = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light)
    onClose()
    onHashtag?.()
  }

  const mediaOptions: PickerOption[] = [
    {
      id: 'camera',
      label: translate('Camera', { ns: 'chat' }),
      icon: <Camera size={22} color={colors.error} />,
      tint: colors.error,
      onPress: handleCamera,
    },
    {
      id: 'gallery',
      label: translate('Gallery', { ns: 'chat' }),
      icon: <Image size={22} color={colors.primary} />,
      tint: colors.primary,
      onPress: handleImageFromLibrary,
    },
    {
      id: 'document',
      label: translate('Document'),
      icon: <FileText size={22} color={colors.info} />,
      tint: colors.info,
      onPress: handleDocument,
    },
    {
      id: 'audio',
      label: translate('Audio', { ns: 'chat' }),
      icon: <Music size={22} color={AUDIO_TINT} />,
      tint: AUDIO_TINT,
      onPress: handleAudio,
    },
  ]

  const cryptoOptions: PickerOption[] = []
  if (onSendCrypto) {
    cryptoOptions.push({
      id: 'send',
      label: translate('Send', { ns: 'chat' }),
      icon: <Send size={22} color={colors.success} />,
      tint: colors.success,
      onPress: handleSendCrypto,
    })
  }
  if (onReceiveCrypto) {
    cryptoOptions.push({
      id: 'receive',
      label: translate('Receive', { ns: 'chat' }),
      icon: <Download size={22} color={colors.info} />,
      tint: colors.info,
      onPress: handleReceiveCrypto,
    })
  }
  if (onHashtag) {
    cryptoOptions.push({
      id: 'hashtag',
      label: translate('#Tag', { ns: 'chat' }),
      icon: <Hash size={22} color={colors.primary} />,
      tint: colors.primary,
      onPress: handleHashtag,
    })
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: 'flex-end',
        }}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{
            backgroundColor: colors.backgroundSecondary,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          }}
        >
          <View
            className="self-center mt-3 mb-2 rounded-full"
            style={{ width: 40, height: 4, backgroundColor: colors.border }}
          />

          <View className="flex-row items-center justify-between px-5 pt-2 pb-5">
            <Text className="text-xl font-bold" style={{ color: colors.text }}>
              {translate('Share')}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={translate('Close')}
              className="rounded-full w-8 h-8 items-center justify-center"
              style={{ backgroundColor: colors.surface }}
            >
              <X size={16} color={colors.textTertiary} />
            </Pressable>
          </View>

          <OptionSection
            title={translate('Actions', { ns: 'chat' })}
            options={cryptoOptions}
            colors={colors}
          />

          <OptionSection
            title={translate('Media', { ns: 'chat' })}
            options={mediaOptions}
            colors={colors}
          />

          <EncryptedFooter colors={colors} />
        </Pressable>
      </Pressable>
    </Modal>
  )
}
