/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useRef, useEffect } from 'react'
import { View, Text, Pressable, Animated, Platform, StyleSheet, Alert } from 'react-native'
import { Send, Trash2 } from 'lucide-react-native'
import { Audio } from 'expo-av'
import * as FileSystem from 'expo-file-system/legacy'
import { Haptics, impactAsync as triggerImpact } from '@/lib/safeHaptics'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'
import type { MediaAttachment } from '@/lib/types'
import { normalizeOutgoingMediaAttachment } from '@/services/media/outgoingAttachment'

interface VoiceRecorderProps {
  onSend: (attachment: MediaAttachment) => void
  onCancel: () => void
}

const MAX_WAVEFORM_SAMPLES = 50
const SILENCE_METERING_DB = -60
const PEAK_METERING_DB = 0
const UI_STATUS_UPDATE_INTERVAL_MS = 250
const DISPLAY_DURATION_UPDATE_INTERVAL_MS = 250

function showVoiceNoteRetryAlert(): void {
  Alert.alert(
    translate('Unable to send'),
    translate('Please try again.'),
  )
}

function normalizeMetering(metering?: number): number {
  if (typeof metering !== 'number' || !Number.isFinite(metering)) {
    return 0.08
  }

  const normalized = (metering - SILENCE_METERING_DB) / (PEAK_METERING_DB - SILENCE_METERING_DB)
  return Math.min(1, Math.max(0.05, normalized))
}

export function VoiceRecorder({ onSend, onCancel }: VoiceRecorderProps) {
  const colors = useThemeColors()
  const isAndroid = Platform.OS === 'android'
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [recordingUri, setRecordingUri] = useState<string | null>(null)
  const [waveform, setWaveform] = useState<number[]>([])
  
  const recordingRef = useRef<Audio.Recording | null>(null)
  const recordingDurationRef = useRef(0)
  const recordingStartedAtRef = useRef<number | null>(null)
  const displayDurationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const waveformRef = useRef<number[]>([])
  const lastUiStatusUpdateRef = useRef(0)
  const pulseAnim = useRef(new Animated.Value(1)).current

  const stopDisplayDurationTimer = () => {
    if (displayDurationTimerRef.current) {
      clearInterval(displayDurationTimerRef.current)
      displayDurationTimerRef.current = null
    }
  }

  const startDisplayDurationTimer = () => {
    stopDisplayDurationTimer()
    const startedAt = Date.now()
    recordingStartedAtRef.current = startedAt
    displayDurationTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt
      const nextDuration = Math.max(recordingDurationRef.current, elapsed)
      recordingDurationRef.current = nextDuration
      setRecordingDuration(nextDuration)
    }, DISPLAY_DURATION_UPDATE_INTERVAL_MS)
  }
  
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      )
      pulse.start()
      return () => pulse.stop()
    }
  }, [isRecording])
  
  useEffect(() => {
    startRecording()
    
    return () => {
      stopDisplayDurationTimer()
      stopRecording()
    }
  }, [])

  const handleRecordingStatusUpdate = (status: {
    durationMillis?: number
    metering?: number
  }, options: { forceUiUpdate?: boolean } = {}) => {
    const nextDuration = Math.max(status.durationMillis ?? 0, recordingDurationRef.current)
    const nextWaveform = [
      ...waveformRef.current.slice(-(MAX_WAVEFORM_SAMPLES - 1)),
      normalizeMetering(status.metering),
    ]

    recordingDurationRef.current = nextDuration
    waveformRef.current = nextWaveform
    const now = Date.now()
    if (!options.forceUiUpdate && now - lastUiStatusUpdateRef.current < UI_STATUS_UPDATE_INTERVAL_MS) {
      return
    }
    lastUiStatusUpdateRef.current = now
    setRecordingDuration(nextDuration)
    setWaveform(nextWaveform)
  }
  
  const startRecording = async () => {
    try {
      triggerImpact(Haptics.ImpactFeedbackStyle.Medium)
      
      const permission = await Audio.requestPermissionsAsync()
      if (!permission.granted) {
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
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        handleRecordingStatusUpdate,
        100,
      )
      
      recordingRef.current = recording
      setIsRecording(true)
      recordingDurationRef.current = 0
      recordingStartedAtRef.current = null
      waveformRef.current = []
      lastUiStatusUpdateRef.current = 0
      setRecordingDuration(0)
      setWaveform([])
      startDisplayDurationTimer()
      
    } catch {
      console.warn('[VoiceRecorder] start failed')
      showVoiceNoteRetryAlert()
      onCancel()
    }
  }
  
  const stopRecording = async (): Promise<string | null> => {
    const recording = recordingRef.current
    if (!recording) return null
    
    try {
      setIsRecording(false)
      stopDisplayDurationTimer()
      
      const finalStatus = await recording.stopAndUnloadAsync()
      handleRecordingStatusUpdate(finalStatus, { forceUiUpdate: true })
      const uri = recording.getURI()
      recordingRef.current = null
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      })
      
      setRecordingUri(uri)
      return uri
    } catch {
      console.warn('[VoiceRecorder] stop failed')
      return null
    }
  }
  
  const handleSend = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Medium)
    
    const uri = recordingUri || await stopRecording()
    if (!uri) {
      showVoiceNoteRetryAlert()
      onCancel()
      return
    }
    
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri)
      
      const attachment: MediaAttachment = {
        id: `voice_${Date.now()}`,
        type: 'voice_note',
        uri,
        fileName: `voice_note_${Date.now()}.m4a`,
        mimeType: 'audio/m4a',
        fileSize: fileInfo.exists ? fileInfo.size : 0,
        durationMs: recordingDurationRef.current,
        waveform: waveformRef.current.slice(-MAX_WAVEFORM_SAMPLES),
      }
      
      onSend(await normalizeOutgoingMediaAttachment(attachment))
    } catch {
      console.warn('[VoiceRecorder] preparation failed')
      showVoiceNoteRetryAlert()
      onCancel()
    }
  }
  
  const handleCancel = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light)
    
    if (recordingRef.current) {
      try {
        stopDisplayDurationTimer()
        await recordingRef.current.stopAndUnloadAsync()
        recordingRef.current = null
      } catch {}
    }
    
    if (recordingUri) {
      try {
        await FileSystem.deleteAsync(recordingUri, { idempotent: true })
      } catch {}
    }
    
    onCancel()
  }
  
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const displayedWaveform = waveform.slice(isAndroid ? -22 : -40)
  const waveformMaxHeight = isAndroid ? 24 : 32
  
  return (
    <View
      className="flex-row items-center bg-surface rounded-2xl"
      style={[styles.container, isAndroid ? styles.androidContainer : styles.iosContainer]}
    >
      <Pressable
        onPress={handleCancel}
        className={isAndroid ? 'p-1.5' : 'p-2'}
        accessibilityLabel={translate('Cancel voice note', { ns: 'chat' })}
      >
        <Trash2 size={20} color={colors.error} />
      </Pressable>
      
      <View
        className="flex-row items-center gap-0.5"
        style={[styles.waveform, isAndroid ? styles.androidWaveform : styles.iosWaveform]}
      >
        {displayedWaveform.map((value, index) => (
          <View
            key={index}
            className="w-1 bg-primary rounded-full"
            style={[
              isAndroid ? styles.androidWaveformBar : null,
              { height: Math.max(4, value * waveformMaxHeight) },
            ]}
          />
        ))}
      </View>
      
      <View
        className="flex-row items-center"
        style={isAndroid ? styles.androidTimer : styles.iosTimer}
      >
        <Animated.View
          style={{ transform: [{ scale: pulseAnim }] }}
          className="w-3 h-3 rounded-full bg-red-500"
        />
        <Text
          className="text-text font-mono text-sm"
          style={isAndroid ? styles.androidTimerText : styles.iosTimerText}
        >
          {formatDuration(recordingDuration)}
        </Text>
      </View>
      
      <Pressable
        onPress={handleSend}
        className={`${isAndroid ? 'w-10 h-10' : 'w-11 h-11'} rounded-full bg-primary items-center justify-center`}
        accessibilityLabel={translate('Send voice note', { ns: 'chat' })}
      >
        <Send size={20} color={colors.textOnPrimary} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexShrink: 1,
  },
  androidContainer: {
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  iosContainer: {
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  waveform: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  androidWaveform: {
    height: 32,
    maxWidth: 124,
  },
  iosWaveform: {
    height: 40,
  },
  androidTimer: {
    gap: 6,
    flexShrink: 0,
    justifyContent: 'flex-end',
    minWidth: 64,
  },
  iosTimer: {
    gap: 8,
    flexShrink: 0,
  },
  androidTimerText: {
    minWidth: 42,
  },
  androidWaveformBar: {
    width: 3,
  },
  iosTimerText: {
    minWidth: 50,
  },
})
