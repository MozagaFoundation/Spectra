/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useEffect, memo, useRef, useCallback, type ReactNode } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Image } from 'expo-image'
import { cn } from '@/lib/utils'
import { MediaLightbox } from '@/components/chat/MediaLightbox'
import { useIsSpectreThemeActive, useThemeColors } from '@/lib/theme'
import { resolveStorageUrl } from '@/services/backend/storage'
import {
  clearEncryptedAvatarCache,
  loadEncryptedAvatar,
} from '@/services/media/avatarImageCache'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import { useTorStore } from '@/services/tor/torStore'

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

interface AvatarProps {
  name: string
  imageUrl?: string | null
  size?: AvatarSize
  showOnlineStatus?: boolean
  isOnline?: boolean
  className?: string
  accentColor?: string
  previewable?: boolean
  symbol?: ReactNode
}

type ResolvedAvatarImage = {
  sourceKey: string
  uri: string
}

function isLocalAvatarDataUri(value: string | null | undefined): value is string {
  return typeof value === 'string'
    && /^data:image\/(?:jpeg|png|webp);base64,/u.test(value)
}

const sizeStyles: Record<AvatarSize, string> = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
  xl: 'w-24 h-24',
}

const imageSizeStyles: Record<AvatarSize, { width: number; height: number }> = {
  sm: { width: 32, height: 32 },
  md: { width: 48, height: 48 },
  lg: { width: 64, height: 64 },
  xl: { width: 96, height: 96 },
}

const textSizeStyles: Record<AvatarSize, string> = {
  sm: 'text-xs',
  md: 'text-base',
  lg: 'text-xl',
  xl: 'text-3xl',
}

const statusSizeStyles: Record<AvatarSize, string> = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
  xl: 'w-5 h-5',
}

const DEFAULT_AVATAR_COLORS = ['#a7da57', '#89ddc3', '#8bbe40', '#5fbfa3', '#e9d27a', '#a8e7d2']
const SPECTRE_AVATAR_COLORS = ['#1a1a1a', '#242424', '#2f2f2f', '#3a3a3a', '#454545', '#525252']

function getInitials(name: string): string {
  if (!name.trim()) return '?'
  return name
    .split(' ')
    .filter(w => w.length > 0)
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'
}

export const Avatar = memo(function Avatar({
  name,
  imageUrl,
  size = 'md',
  showOnlineStatus = false,
  isOnline = false,
  className,
  accentColor,
  previewable = false,
  symbol,
}: AvatarProps) {
  const colors = useThemeColors()
  const spectreThemeActive = useIsSpectreThemeActive()
  const [imageError, setImageError] = useState(false)
  const [resolvedImage, setResolvedImage] = useState<ResolvedAvatarImage | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const imageRequestIdRef = useRef(0)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const torEnabled = useTorStore((state) => state.enabled)
  const walletAddress = useWalletStore((state) => state.wallet?.address ?? null)
  const spectreWalletActive = useWalletStore((state) => state.wallet?.spectreMode === true)
  const hideAvatar = spectreEnabled || spectreWalletActive
  const imageSourceKey = `${walletAddress || ''}:${imageUrl || ''}`
  const localImageUrl = !hideAvatar && isLocalAvatarDataUri(imageUrl) ? imageUrl : null
  const resolvedImageUrl = localImageUrl
    || (resolvedImage?.sourceKey === imageSourceKey ? resolvedImage.uri : null)
  
  useEffect(() => {
    const requestId = ++imageRequestIdRef.current
    setImageError(false)

    if (symbol || !imageUrl || !walletAddress || hideAvatar) {
      setResolvedImage(null)
      if (hideAvatar) {
        void clearEncryptedAvatarCache().catch(() => undefined)
      }
      return
    }

    setResolvedImage(null)
    if (isLocalAvatarDataUri(imageUrl)) {
      return
    }

    const loadImageUrl = async () => {
      try {
        const encryptedAvatar = await loadEncryptedAvatar(
          walletAddress,
          imageUrl,
          () => resolveStorageUrl(imageUrl),
        )
        if (imageRequestIdRef.current === requestId && encryptedAvatar) {
          setImageError(false)
          setResolvedImage({ sourceKey: imageSourceKey, uri: encryptedAvatar })
        } else if (imageRequestIdRef.current === requestId) {
          setImageError(true)
        }
      } catch {
        if (imageRequestIdRef.current === requestId) {
          setImageError(true)
          setResolvedImage(null)
        }
      }
    }

    void loadImageUrl()

    return () => {
      if (imageRequestIdRef.current === requestId) {
        imageRequestIdRef.current++
      }
    }
  }, [hideAvatar, imageSourceKey, imageUrl, symbol, torEnabled, walletAddress])

  const handleImageError = useCallback(() => {
    setImageError(true)
  }, [])
  
  const safeName = name || '?'
  const avatarPalette = spectreThemeActive ? SPECTRE_AVATAR_COLORS : DEFAULT_AVATAR_COLORS
  const colorIndex = safeName.charCodeAt(0) % avatarPalette.length
  const fallbackBackgroundColor = spectreThemeActive ? avatarPalette[colorIndex] : (accentColor || avatarPalette[colorIndex])
  const fallbackTextColor = spectreThemeActive ? colors.text : colors.textOnPrimary
  
  const previewUri = !symbol && resolvedImageUrl && !imageError ? resolvedImageUrl : null
  const showImage = Boolean(previewUri)
  const shouldEnablePreview = previewable && Boolean(previewUri)

  const avatarContent = (
    <View className={cn('relative', className)}>
      {showImage ? (
        <Image
          key={previewUri!}
          source={{ uri: previewUri! }}
          style={[imageSizeStyles[size], { borderRadius: 999 }]}
          onError={handleImageError}
          cachePolicy="memory"
          transition={200}
          recyclingKey={imageSourceKey}
        />
      ) : (
        <View
          className={cn(
            'rounded-full items-center justify-center',
            sizeStyles[size]
          )}
          style={{ backgroundColor: fallbackBackgroundColor }}
        >
          {symbol || (
            <Text
              className={cn('font-semibold', textSizeStyles[size])}
              style={{ color: fallbackTextColor }}
            >
              {getInitials(safeName)}
            </Text>
          )}
        </View>
      )}
      
      {showOnlineStatus && (
        <View
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2',
            statusSizeStyles[size],
          )}
          style={{
            backgroundColor: isOnline ? colors.success : colors.textMuted,
            borderColor: colors.backgroundSecondary,
            shadowColor: '#000',
            shadowOpacity: 0.35,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 3,
          }}
        />
      )}
    </View>
  )

  if (!shouldEnablePreview) {
    return avatarContent
  }

  return (
    <>
      <Pressable
        onPress={(event) => {
          event.stopPropagation()
          setViewerOpen(true)
        }}
        hitSlop={4}
        accessibilityRole="imagebutton"
      >
        {avatarContent}
      </Pressable>

      <MediaLightbox
        visible={viewerOpen}
        uri={previewUri}
        mediaType="image"
        title={safeName}
        cachePolicy="memory"
        onClose={() => setViewerOpen(false)}
      />
    </>
  )
})
