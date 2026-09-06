/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Dimensions, Pressable, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { FlashList } from '@shopify/flash-list'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  LoaderCircle,
  Video,
} from 'lucide-react-native'
import { MediaLightbox } from '@/components/chat/MediaLightbox'
import { isImageMimeType, isPdfMimeType } from '@/components/chat/bubbles/attachmentUtils'
import {
  getSharedChatContent,
  type SharedAttachmentItem,
  type SharedLinkItem,
} from '@/lib/chatSharedContent'
import { translate } from '@/lib/i18n'
import { formatFileSize, formatRelativeTime } from '@/lib/utils'
import { isSafeExternalUrl } from '@/lib/externalLinks'
import { getAttachmentPreviewUri } from '@/lib/mediaPreview'
import { useThemeColors } from '@/lib/theme'
import { hydrateMessageAttachment } from '@/services/media/attachmentHydration'
import { openAttachmentExternally } from '@/services/media'
import { loadGroupMessages } from '@/services/chat'
import { useGroupChatStore } from '@/store'
import type { MediaAttachment } from '@/lib/types'
import { openExternalUrl } from '@/services/tor/externalLinkPolicy'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const GRID_GAP = 4
const GRID_PADDING = 12
const ITEM_SIZE = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * 2) / 3
const TABS = ['Media', 'Links', 'Docs'] as const
type SharedContentTab = (typeof TABS)[number]

type HydratableAttachment = MediaAttachment & {
  encryptionKey?: string
}

function EmptyState({ tab }: { tab: SharedContentTab }) {
  const colors = useThemeColors()
  const Icon = tab === 'Links' ? LinkIcon : tab === 'Docs' ? FileText : ImageIcon
  const label = tab === 'Links'
    ? translate('No links shared yet')
    : tab === 'Docs'
      ? translate('No documents shared yet')
      : translate('No media shared yet')

  return (
    <View className="flex-1 items-center justify-center px-8">
      <Icon size={42} color={`${colors.textMuted}66`} />
      <Text className="text-center mt-3" style={{ color: colors.textMuted }}>
        {label}
      </Text>
    </View>
  )
}

export default function GroupSharedMediaScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const { id } = useLocalSearchParams<{ id: string }>()
  const groupMessages = useGroupChatStore((state) => state.messages[id || ''] ?? [])
  const updateGroupMessage = useGroupChatStore((state) => state.updateMessage)
  const [activeTab, setActiveTab] = useState<SharedContentTab>('Media')
  const [preparingKey, setPreparingKey] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{
    uri: string
    mediaType: 'image' | 'pdf'
    mimeType?: string
    title?: string
  } | null>(null)

  const sharedContent = useMemo(() => getSharedChatContent(groupMessages), [groupMessages])

  useEffect(() => {
    if (!id) return
    loadGroupMessages(id).catch((error) => {
      console.warn('Failed to load group messages for shared media:', error)
    })
  }, [id])

  const replaceAttachment = useCallback((messageId: string, preparedAttachment: MediaAttachment) => {
    if (!id) return
    const currentMessage = useGroupChatStore.getState().messages[id]?.find((message) => message.id === messageId)
    const currentAttachments = currentMessage?.attachments ?? []
    updateGroupMessage(id, messageId, {
      attachments: currentAttachments.map((candidate) =>
        candidate.id === preparedAttachment.id ? preparedAttachment : candidate
      ),
    })
  }, [id, updateGroupMessage])

  const prepareAttachment = useCallback(async (item: SharedAttachmentItem): Promise<MediaAttachment> => {
    if (!item.attachment.isEncrypted || item.attachment.uri) {
      return item.attachment
    }

    setPreparingKey(item.key)
    try {
      const prepared = await hydrateMessageAttachment(
        item.messageId,
        item.conversationId,
        item.attachment as HydratableAttachment,
        {
          source: 'groupSharedMedia.prepareAttachment',
          messageId: item.messageId,
          conversationId: item.conversationId,
        },
      )
      replaceAttachment(item.messageId, prepared)
      return prepared
    } catch (error) {
      console.warn('Failed to prepare group shared attachment:', error)
      Alert.alert(translate('File unavailable'), translate('This file is not available on this device yet.'))
      throw error
    } finally {
      setPreparingKey(null)
    }
  }, [replaceAttachment])

  const openAttachment = useCallback(async (item: SharedAttachmentItem) => {
    let attachment = item.attachment
    if (attachment.isEncrypted && !attachment.uri) {
      try {
        attachment = await prepareAttachment(item)
      } catch {
        return
      }
    }

    if (!attachment.uri) {
      Alert.alert(translate('File unavailable'), translate('This file is not available on this device yet.'))
      return
    }

    if (isImageMimeType(attachment.mimeType) || attachment.type === 'image') {
      setLightbox({
        uri: attachment.uri,
        mediaType: 'image',
        mimeType: attachment.mimeType,
        title: attachment.fileName,
      })
      return
    }

    if (isPdfMimeType(attachment.mimeType)) {
      setLightbox({
        uri: attachment.uri,
        mediaType: 'pdf',
        mimeType: attachment.mimeType,
        title: attachment.fileName,
      })
      return
    }

    const opened = await openAttachmentExternally(attachment)
    if (!opened) {
      Alert.alert(translate('Unable to open file'), translate('No app is available to open this file.'))
    }
  }, [prepareAttachment])

  const openLink = useCallback((item: SharedLinkItem) => {
    if (!isSafeExternalUrl(item.url)) {
      Alert.alert(translate('Unable to open link'), item.url)
      return
    }

    openExternalUrl(item.url).catch(() => {
      Alert.alert(translate('Unable to open link'), item.url)
    })
  }, [])

  const renderMediaItem = useCallback(({ item }: { item: SharedAttachmentItem }) => {
    const uri = getAttachmentPreviewUri(item.attachment)
    const isVideo = item.attachment.type === 'video' || item.attachment.mimeType?.startsWith('video/')
    const isPreparing = preparingKey === item.key

    return (
      <Pressable
        onPress={() => openAttachment(item)}
        className="items-center justify-center overflow-hidden"
        style={{
          width: ITEM_SIZE,
          height: ITEM_SIZE,
          margin: GRID_GAP / 2,
          backgroundColor: colors.surface,
        }}
      >
        {uri ? (
          <Image source={{ uri }} style={{ width: ITEM_SIZE, height: ITEM_SIZE }} contentFit="cover" />
        ) : (
          <ImageIcon size={26} color={colors.textMuted} />
        )}
        {isVideo ? (
          <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}>
            <Video size={26} color="white" />
          </View>
        ) : null}
        {isPreparing ? (
          <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}>
            <LoaderCircle size={24} color="white" />
          </View>
        ) : null}
      </Pressable>
    )
  }, [colors.surface, colors.textMuted, openAttachment, preparingKey])

  const renderDocItem = useCallback(({ item }: { item: SharedAttachmentItem }) => {
    const isPreparing = preparingKey === item.key
    return (
      <Pressable onPress={() => openAttachment(item)} className="flex-row items-center gap-3 px-4 py-3 active:opacity-70">
        <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: colors.surface }}>
          {isPreparing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <FileText size={22} color={colors.primary} />
          )}
        </View>
        <View className="flex-1">
          <Text className="text-base" style={{ color: colors.text }} numberOfLines={1}>
            {item.attachment.fileName || translate('Document')}
          </Text>
          <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
            {formatFileSize(item.attachment.fileSize)} · {formatRelativeTime(item.createdAt)}
          </Text>
        </View>
        <ExternalLink size={18} color={colors.textTertiary} />
      </Pressable>
    )
  }, [colors, openAttachment, preparingKey])

  const renderLinkItem = useCallback(({ item }: { item: SharedLinkItem }) => (
    <Pressable onPress={() => openLink(item)} className="flex-row items-center gap-3 px-4 py-3 active:opacity-70">
      <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: colors.surface }}>
        <LinkIcon size={22} color={colors.primary} />
      </View>
      <View className="flex-1">
        <Text className="text-base" style={{ color: colors.text }} numberOfLines={1}>
          {item.url.replace(/^https?:\/\//i, '')}
        </Text>
        <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
          {formatRelativeTime(item.createdAt)}
        </Text>
      </View>
      <ExternalLink size={18} color={colors.textTertiary} />
    </Pressable>
  ), [colors, openLink])

  const hasItems = activeTab === 'Media'
    ? sharedContent.media.length > 0
    : activeTab === 'Links'
      ? sharedContent.links.length > 0
      : sharedContent.docs.length > 0

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background, paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="text-lg font-bold flex-1" style={{ color: colors.text }}>
          {translate('Media, links and docs')}
        </Text>
      </View>

      <View className="flex-row mx-4 my-3 rounded-xl overflow-hidden" style={{ backgroundColor: colors.surface }}>
        {TABS.map((tab) => {
          const selected = activeTab === tab
          const count = tab === 'Media'
            ? sharedContent.media.length
            : tab === 'Links'
              ? sharedContent.links.length
              : sharedContent.docs.length
          return (
            <Pressable
              key={tab}
              onPress={() => setActiveTab(tab)}
              className="flex-1 py-2 items-center"
              style={{ backgroundColor: selected ? colors.primary : 'transparent' }}
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: selected ? colors.textOnPrimary : colors.textSecondary }}
              >
                {translate(tab)} {count > 0 ? count : ''}
              </Text>
            </Pressable>
          )
        })}
      </View>

      {!hasItems ? (
        <EmptyState tab={activeTab} />
      ) : activeTab === 'Media' ? (
        <FlashList
          data={sharedContent.media}
          renderItem={renderMediaItem}
          keyExtractor={(item) => item.key}
          numColumns={3}
          contentContainerStyle={{ padding: GRID_PADDING }}
        />
      ) : activeTab === 'Links' ? (
        <FlashList
          data={sharedContent.links}
          renderItem={renderLinkItem}
          keyExtractor={(item) => item.key}
        />
      ) : (
        <FlashList
          data={sharedContent.docs}
          renderItem={renderDocItem}
          keyExtractor={(item) => item.key}
        />
      )}

      <MediaLightbox
        visible={Boolean(lightbox)}
        uri={lightbox?.uri}
        mediaType={lightbox?.mediaType || 'image'}
        mimeType={lightbox?.mimeType}
        title={lightbox?.title}
        onClose={() => setLightbox(null)}
      />
    </View>
  )
}
