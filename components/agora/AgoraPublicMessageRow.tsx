/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Text, View } from 'react-native'
import { Image } from 'expo-image'
import { AgoraNick } from '@/components/agora/AgoraNick'
import { AgoraVoicePlayer } from '@/components/agora/AgoraVoicePlayer'
import { translate } from '@/lib/i18n'
import type { ThemeColors } from '@/lib/theme'
import type { AgoraIdentityPublic, AgoraPublicMessage } from '@/lib/types/agora'

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function AgoraPublicMessageRow({
  message,
  isOwn,
  dark,
  colors,
  onNickPress,
  onNickLongPress,
}: {
  message: AgoraPublicMessage
  isOwn: boolean
  dark: boolean
  colors: ThemeColors
  onNickPress: (person: AgoraIdentityPublic) => void
  onNickLongPress?: (person: AgoraIdentityPublic) => void
}) {
  if (message.isAction) {
    return (
      <View className="px-4 py-1">
        <Text className="text-text-muted italic text-center">
          {formatTime(message.createdAt)} *{' '}
          <AgoraNick
            person={message.author}
            dark={dark}
            onPress={onNickPress}
            onLongPress={onNickLongPress}
          />
          {' '}{message.body}
        </Text>
      </View>
    )
  }

  return (
    <View
      testID={isOwn ? 'agora-message-own' : 'agora-message-other'}
      className={`px-4 py-1 ${isOwn ? 'items-end' : 'items-start'}`}
    >
      <View className={`max-w-[85%] ${isOwn ? 'items-end' : 'items-start'}`} style={{ minWidth: 0 }}>
        <View
          className={`px-4 py-3 rounded-2xl ${
            isOwn ? 'bg-message-sent rounded-br-md' : 'bg-message-received rounded-bl-md'
          }`}
          style={{ minWidth: 0, maxWidth: '100%' }}
        >
          {isOwn ? null : (
            <AgoraNick
              person={message.author}
              dark={dark}
              compact
              onPress={onNickPress}
              onLongPress={onNickLongPress}
            />
          )}
          {message.body ? (
            <Text
              className="leading-5"
              style={{ color: isOwn ? colors.textOnPrimary : colors.text }}
            >
              {message.body}
            </Text>
          ) : null}
          {message.mediaKind === 'image' && message.mediaUrl ? (
            <Image
              source={{ uri: message.mediaUrl }}
              className="rounded-2xl"
              style={{
                width: 168,
                height: 168,
                marginTop: message.body ? 8 : 0,
              }}
              contentFit="cover"
              accessibilityLabel={message.body || translate('Plaza image')}
            />
          ) : null}
          {message.mediaKind === 'voice' && message.mediaUrl ? (
            <View style={{ marginTop: message.body ? 8 : 0 }}>
              <AgoraVoicePlayer
                uri={message.mediaUrl}
                durationMs={message.mediaDurationMs}
                waveform={message.mediaWaveform}
                colors={colors}
                isOwn={isOwn}
              />
            </View>
          ) : null}
          <View className={`flex-row items-center mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
            <Text
              className="text-xs"
              style={{ color: isOwn ? `${colors.textOnPrimary}99` : colors.textMuted }}
            >
              {formatTime(message.createdAt)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}
