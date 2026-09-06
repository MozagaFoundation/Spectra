/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Pause, Play } from 'lucide-react-native'
import { Audio } from 'expo-av'
import { translate } from '@/lib/i18n'
import type { ThemeColors } from '@/lib/theme'
import {
  AGORA_FALLBACK_WAVEFORM,
  AGORA_PLAYBACK_WAVEFORM_BARS,
  downsampleAgoraWaveform,
} from '@/components/agora/agoraVoiceWaveform'

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function AgoraVoicePlayer({
  uri,
  durationMs,
  waveform,
  colors,
  isOwn = false,
}: {
  uri: string
  durationMs?: number | null
  waveform?: number[] | null
  colors: ThemeColors
  isOwn?: boolean
}) {
  const accent = isOwn ? colors.textOnPrimary : colors.primary
  const accentMuted = `${accent}55`
  const surface = `${accent}1f`
  const border = `${accent}3d`
  const durationColor = isOwn ? `${colors.textOnPrimary}cc` : colors.textSecondary
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(durationMs ?? 0)
  const soundRef = useRef<Audio.Sound | null>(null)

  useEffect(() => {
    return () => {
      const sound = soundRef.current
      soundRef.current = null
      if (sound) void sound.unloadAsync().catch(() => undefined)
    }
  }, [uri])

  const load = async (): Promise<Audio.Sound | null> => {
    if (soundRef.current) return soundRef.current
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    })
    const { sound, status } = await Audio.Sound.createAsync(
      { uri },
      { shouldPlay: false, progressUpdateIntervalMillis: 250 },
      (next) => {
        if (!next.isLoaded) return
        setPlaying(next.isPlaying)
        setPosition(next.positionMillis ?? 0)
        if (next.durationMillis) setDuration(next.durationMillis)
        if (next.didJustFinish) {
          setPlaying(false)
          setPosition(0)
        }
      },
    )
    soundRef.current = sound
    if (status.isLoaded && status.durationMillis) setDuration(status.durationMillis)
    return sound
  }

  const toggle = async () => {
    try {
      const sound = await load()
      if (!sound) return
      const status = await sound.getStatusAsync()
      if (!status.isLoaded) return
      if (status.isPlaying) {
        await sound.pauseAsync()
        return
      }
      if (status.durationMillis && status.positionMillis >= status.durationMillis) {
        await sound.setPositionAsync(0)
      }
      await sound.playAsync()
    } catch {
      setPlaying(false)
    }
  }

  const progress = duration > 0 ? position / duration : 0
  const waveformBars = useMemo(
    () => waveform && waveform.length > 0
      ? downsampleAgoraWaveform(waveform, AGORA_PLAYBACK_WAVEFORM_BARS)
      : AGORA_FALLBACK_WAVEFORM,
    [waveform],
  )

  return (
    <View
      className="rounded-3xl px-3 py-2.5"
      style={{
        backgroundColor: surface,
        borderWidth: 1,
        borderColor: border,
        maxWidth: 252,
        minWidth: 196,
      }}
      accessibilityLabel={translate('Plaza voice note')}
    >
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => void toggle()}
          accessibilityRole="button"
          accessibilityLabel={translate(playing ? 'Pause voice note' : 'Play voice note')}
          testID="agora-voice-play"
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: `${accent}33` }}
        >
          {playing ? (
            <Pause size={18} color={accent} />
          ) : (
            <Play size={18} color={accent} style={{ marginLeft: 2 }} />
          )}
        </Pressable>
        <View className="h-8 flex-1 flex-row items-center gap-0.5 overflow-hidden">
          {waveformBars.map((value, index) => {
            const played = index / waveformBars.length < progress
            return (
              <View
                key={index}
                className="w-1 rounded-full"
                style={{
                  height: Math.max(4, value * 24),
                  backgroundColor: played ? accent : accentMuted,
                }}
              />
            )
          })}
        </View>
        <Text className="font-mono text-xs" style={{ color: durationColor }}>
          {formatDuration(playing ? position : duration)}
        </Text>
      </View>
    </View>
  )
}
