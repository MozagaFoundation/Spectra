/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native'
import { ImagePlus, Mic, Send, X } from 'lucide-react-native'
import { AgoraVoiceCapture } from '@/components/agora/AgoraVoiceCapture'
import { translate } from '@/lib/i18n'
import type { ThemeColors } from '@/lib/theme'
import { AGORA_MAX_BODY } from '@/services/agora'
import type { AgoraPendingImage, AgoraPendingVoice } from '@/services/agora'

const TOOL_SIZE = 44
const TOOL_GAP = 8
const TOOLS_WIDTH = TOOL_SIZE * 2 + TOOL_GAP

export function AgoraComposer({
  draft,
  onChangeDraft,
  whisperMode,
  sending,
  canSend,
  pendingImage,
  colors,
  paddingBottom,
  onPickImage,
  onClearImage,
  onSend,
  onVoiceSend,
  focusToken,
}: {
  draft: string
  onChangeDraft: (value: string) => void
  whisperMode: boolean
  sending: boolean
  canSend: boolean
  pendingImage: AgoraPendingImage | null
  colors: ThemeColors
  paddingBottom: number
  onPickImage: () => void
  onClearImage: () => void
  onSend: () => void
  onVoiceSend: (voice: AgoraPendingVoice) => void
  focusToken?: number
}) {
  const [capturing, setCapturing] = useState(false)
  const [writing, setWriting] = useState(false)
  const toolsAnim = useRef(new Animated.Value(0)).current
  const inputRef = useRef<TextInput>(null)

  useEffect(() => {
    Animated.timing(toolsAnim, {
      toValue: writing ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start()
  }, [toolsAnim, writing])

  useEffect(() => {
    if (!focusToken) return
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [focusToken])

  const startVoice = () => {
    if (whisperMode || sending) return
    if (pendingImage) onClearImage()
    setCapturing(true)
  }

  return (
    <View
      className="border-t px-3 pt-3"
      style={{
        paddingBottom,
        backgroundColor: colors.backgroundSecondary,
        borderTopColor: whisperMode ? colors.gold : colors.border,
        borderTopWidth: whisperMode ? 2 : 1,
      }}
    >
      {pendingImage && !capturing ? (
        <View className="mb-2 flex-row items-center gap-2">
          <Image
            source={{ uri: pendingImage.uri }}
            className="h-16 w-16 rounded-xl"
            accessibilityIgnoresInvertColors
          />
          <Pressable
            onPress={onClearImage}
            className="rounded-full p-2"
            accessibilityRole="button"
            accessibilityLabel={translate('Remove image')}
            hitSlop={8}
          >
            <X size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
      <View className="flex-row items-end">
        {capturing ? (
          <AgoraVoiceCapture
            colors={colors}
            sending={sending}
            onCancel={() => setCapturing(false)}
            onReady={(voice) => {
              setCapturing(false)
              onVoiceSend(voice)
            }}
          />
        ) : (
          <>
            <Animated.View
              pointerEvents={writing ? 'none' : 'auto'}
              style={{
                width: toolsAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [TOOLS_WIDTH, 0],
                }),
                opacity: toolsAnim.interpolate({
                  inputRange: [0, 0.45, 1],
                  outputRange: [1, 0, 0],
                }),
                marginRight: toolsAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [TOOL_GAP, 0],
                }),
                overflow: 'hidden',
              }}
            >
              <View className="flex-row items-end" style={{ width: TOOLS_WIDTH, gap: TOOL_GAP }}>
                <Pressable
                  onPress={onPickImage}
                  disabled={whisperMode || sending}
                  className="h-11 w-11 items-center justify-center rounded-full"
                  accessibilityRole="button"
                  accessibilityLabel={translate('Add image')}
                  testID="agora-composer-image"
                  style={{
                    backgroundColor: colors.backgroundTertiary,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    opacity: whisperMode ? 0.4 : 1,
                  }}
                >
                  <ImagePlus size={20} color={colors.textTertiary} />
                </Pressable>
                <Pressable
                  onPress={startVoice}
                  disabled={whisperMode || sending}
                  className="h-11 w-11 items-center justify-center rounded-full"
                  accessibilityRole="button"
                  accessibilityLabel={translate('Record voice note')}
                  testID="agora-composer-mic"
                  style={{
                    backgroundColor: colors.backgroundTertiary,
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    opacity: whisperMode ? 0.4 : 1,
                  }}
                >
                  <Mic size={20} color={colors.textTertiary} />
                </Pressable>
              </View>
            </Animated.View>
            <View
              className="flex-1 flex-row items-end rounded-2xl"
              style={{
                backgroundColor: colors.backgroundTertiary,
                borderWidth: 1,
                borderColor: whisperMode ? colors.gold : colors.borderLight,
              }}
            >
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={onChangeDraft}
                onFocus={() => setWriting(true)}
                onBlur={() => setWriting(false)}
                placeholder={translate('Write a public line, or @Nick to whisper')}
                placeholderTextColor={whisperMode ? `${colors.gold}99` : colors.textMuted}
                multiline
                maxLength={AGORA_MAX_BODY}
                testID="agora-composer-input"
                className="flex-1 text-text text-base px-4 py-3 max-h-28 min-h-11"
                style={{ color: colors.text }}
              />
            </View>
            <Pressable
              onPress={onSend}
              disabled={!canSend}
              hitSlop={4}
              className="w-11 h-11 rounded-full items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={translate('Send')}
              accessibilityState={{ disabled: !canSend }}
              testID="agora-composer-send"
              style={{
                backgroundColor: whisperMode ? colors.gold : colors.primary,
                opacity: canSend ? 1 : 0.45,
                marginLeft: TOOL_GAP,
              }}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.textOnPrimary} />
              ) : (
                <Send size={20} color={colors.textOnPrimary} />
              )}
            </Pressable>
          </>
        )}
      </View>
      <Text
        className="text-center text-xs mt-2"
        style={{ color: whisperMode ? colors.gold : colors.textMuted }}
      >
        {whisperMode
          ? translate('Whisper · visible to you two and to Spectra’s servers')
          : translate('Public · not encrypted')}
      </Text>
    </View>
  )
}
