/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useRef, useState } from 'react'
import { Alert, Animated, Platform, Pressable, Text, View } from 'react-native'
import { Send, Trash2 } from 'lucide-react-native'
import { Audio } from 'expo-av'
import { translate } from '@/lib/i18n'
import type { ThemeColors } from '@/lib/theme'
import {
  AGORA_MAX_VOICE_BYTES,
  AGORA_MAX_VOICE_MS,
  readAgoraFileBytes,
  type AgoraPendingVoice,
} from '@/services/agora'
import {
  AGORA_MAX_WAVEFORM_SAMPLES,
  clipAgoraWaveform,
  normalizeAgoraMetering,
} from '@/components/agora/agoraVoiceWaveform'

const MIN_SEND_MS = 400
const TICK_MS = 100

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function AgoraVoiceCapture({
  colors,
  sending,
  onCancel,
  onReady,
}: {
  colors: ThemeColors
  sending: boolean
  onCancel: () => void
  onReady: (voice: AgoraPendingVoice) => void
}) {
  const isAndroid = Platform.OS === 'android'
  const [durationMs, setDurationMs] = useState(0)
  const [waveform, setWaveform] = useState<number[]>([])
  const recordingRef = useRef<Audio.Recording | null>(null)
  const uriRef = useRef<string | null>(null)
  const durationRef = useRef(0)
  const waveformRef = useRef<number[]>([])
  const startedAtRef = useRef<number | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stoppingRef = useRef(false)
  const cancelledRef = useRef(false)
  const pulseAnim = useRef(new Animated.Value(1)).current

  const syncDuration = (reported?: number) => {
    const elapsed = startedAtRef.current ? Date.now() - startedAtRef.current : 0
    const next = Math.min(AGORA_MAX_VOICE_MS, Math.max(durationRef.current, reported ?? 0, elapsed))
    durationRef.current = next
    setDurationMs(next)
    return next
  }

  const stopTick = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }

  const startTick = () => {
    stopTick()
    startedAtRef.current = Date.now()
    tickRef.current = setInterval(() => {
      const next = syncDuration()
      if (next >= AGORA_MAX_VOICE_MS) {
        void finishRecording()
      }
    }, 200)
  }

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    )
    pulse.start()
    return () => pulse.stop()
  }, [pulseAnim])

  useEffect(() => {
    cancelledRef.current = false
    void startRecording()
    return () => {
      cancelledRef.current = true
      stopTick()
      const recording = recordingRef.current
      recordingRef.current = null
      if (recording) {
        void recording.stopAndUnloadAsync().catch(() => undefined)
      }
      void Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      }).catch(() => undefined)
    }
  }, [])

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync()
      if (!permission.granted) {
        Alert.alert(translate('Agora'), translate('Microphone access is needed to send a voice note.'))
        onCancel()
        return
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      })
      const { recording } = await Audio.Recording.createAsync(
        {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
          isMeteringEnabled: true,
        },
        (status) => {
          syncDuration(status.durationMillis)
          const nextWaveform = [
            ...waveformRef.current.slice(-(AGORA_MAX_WAVEFORM_SAMPLES - 1)),
            normalizeAgoraMetering(status.metering),
          ]
          waveformRef.current = nextWaveform
          setWaveform(nextWaveform)
        },
        TICK_MS,
      )
      if (cancelledRef.current) {
        await recording.stopAndUnloadAsync().catch(() => undefined)
        return
      }
      recordingRef.current = recording
      startTick()
    } catch {
      Alert.alert(translate('Agora'), translate('That voice note could not be sent.'))
      onCancel()
    }
  }

  const finishRecording = async (): Promise<string | null> => {
    if (uriRef.current) return uriRef.current
    const recording = recordingRef.current
    if (!recording || stoppingRef.current) return uriRef.current
    stoppingRef.current = true
    recordingRef.current = null
    stopTick()
    try {
      const status = await recording.stopAndUnloadAsync()
      syncDuration(status.durationMillis)
      if (typeof status.metering === 'number') {
        waveformRef.current = [
          ...waveformRef.current.slice(-(AGORA_MAX_WAVEFORM_SAMPLES - 1)),
          normalizeAgoraMetering(status.metering),
        ]
        setWaveform(waveformRef.current)
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
      })
      const uri = recording.getURI()
      uriRef.current = uri
      return uri
    } catch {
      return null
    } finally {
      stoppingRef.current = false
    }
  }

  const handleCancel = () => {
    cancelledRef.current = true
    stopTick()
    const recording = recordingRef.current
    recordingRef.current = null
    if (recording) {
      void recording.stopAndUnloadAsync().catch(() => undefined)
    }
    onCancel()
  }

  const handleSend = async () => {
    if (durationRef.current < MIN_SEND_MS && !(startedAtRef.current && Date.now() - startedAtRef.current >= MIN_SEND_MS)) {
      return
    }
    const uri = await finishRecording()
    if (!uri) {
      Alert.alert(translate('Agora'), translate('That voice note could not be sent.'))
      onCancel()
      return
    }
    try {
      const duration = Math.max(1, syncDuration())
      if (duration < MIN_SEND_MS) {
        Alert.alert(translate('Agora'), translate('That voice note is too short.'))
        onCancel()
        return
      }
      const bytes = await readAgoraFileBytes(uri)
      if (bytes.byteLength <= 0) {
        Alert.alert(translate('Agora'), translate('That voice note could not be sent.'))
        onCancel()
        return
      }
      if (bytes.byteLength > AGORA_MAX_VOICE_BYTES) {
        Alert.alert(translate('Agora'), translate('Voice notes must be 2 MB or smaller.'))
        onCancel()
        return
      }
      onReady({
        uri,
        mimeType: 'audio/m4a',
        fileSize: bytes.byteLength,
        durationMs: duration,
        waveform: clipAgoraWaveform(waveformRef.current),
      })
    } catch {
      Alert.alert(translate('Agora'), translate('That voice note could not be sent.'))
      onCancel()
    }
  }

  const canSend = !sending && durationMs >= MIN_SEND_MS
  const displayedWaveform = waveform.slice(isAndroid ? -22 : -40)
  const waveformMaxHeight = isAndroid ? 24 : 32

  return (
    <View
      className="flex-1 flex-row items-center rounded-2xl"
      style={{
        backgroundColor: colors.backgroundTertiary,
        borderWidth: 1,
        borderColor: colors.borderLight,
        gap: isAndroid ? 8 : 12,
        paddingHorizontal: isAndroid ? 10 : 12,
        paddingVertical: isAndroid ? 8 : 10,
      }}
    >
      <Pressable
        onPress={handleCancel}
        disabled={sending}
        accessibilityRole="button"
        accessibilityLabel={translate('Cancel voice note')}
        testID="agora-composer-voice-cancel"
        className="items-center justify-center"
        hitSlop={8}
      >
        <Trash2 size={20} color={colors.error} />
      </Pressable>
      <View
        className="flex-1 flex-row items-center gap-0.5 overflow-hidden"
        style={{ height: isAndroid ? 32 : 40, minWidth: 0 }}
      >
        {displayedWaveform.map((value, index) => (
          <View
            key={index}
            className="rounded-full"
            style={{
              width: isAndroid ? 3 : 4,
              height: Math.max(4, value * waveformMaxHeight),
              backgroundColor: colors.primary,
            }}
          />
        ))}
      </View>
      <View className="flex-row items-center" style={{ gap: isAndroid ? 6 : 8, flexShrink: 0 }}>
        <Animated.View
          style={{
            transform: [{ scale: pulseAnim }],
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: colors.error,
          }}
        />
        <Text className="font-mono text-sm" style={{ color: colors.text, minWidth: isAndroid ? 42 : 50 }}>
          {formatDuration(durationMs)}
        </Text>
      </View>
      <Pressable
        onPress={() => void handleSend()}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel={translate('Send')}
        accessibilityState={{ disabled: !canSend }}
        testID="agora-composer-voice-send"
        className="items-center justify-center rounded-full"
        style={{
          width: isAndroid ? 40 : 44,
          height: isAndroid ? 40 : 44,
          backgroundColor: colors.primary,
          opacity: canSend ? 1 : 0.45,
        }}
      >
        <Send size={20} color={colors.textOnPrimary} />
      </Pressable>
    </View>
  )
}
