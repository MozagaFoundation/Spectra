/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Play, Pause } from 'lucide-react-native'
import { Audio } from 'expo-av'
import { Haptics, impactAsync as triggerImpact } from '@/lib/safeHaptics'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'

interface AudioPlayerProps {
  uri: string
  durationMs?: number
  waveform?: number[]
  isOwn?: boolean
  autoPlay?: boolean
}

const EMPTY_WAVEFORM: number[] = []
const FALLBACK_WAVEFORM_BAR_COUNT = 30
const MAX_WAVEFORM_BAR_COUNT = 30
const FALLBACK_WAVEFORM = Array.from({ length: FALLBACK_WAVEFORM_BAR_COUNT }, (_, index) => (
  index % 2 === 0 ? 0.28 : 0.16
))

function normalizeWaveformValue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.16
  }

  return Math.min(1, Math.max(0.05, value))
}

function downsampleWaveform(values: number[], maxCount: number): number[] {
  if (values.length <= maxCount) {
    return values.map(normalizeWaveformValue)
  }

  return Array.from({ length: maxCount }, (_, index) => {
    const start = Math.floor((index * values.length) / maxCount)
    const end = Math.max(start + 1, Math.floor(((index + 1) * values.length) / maxCount))
    const chunk = values.slice(start, end)
    return normalizeWaveformValue(chunk.reduce((sum, value) => sum + value, 0) / chunk.length)
  })
}

export function AudioPlayer({ uri, durationMs, waveform = EMPTY_WAVEFORM, isOwn = false, autoPlay = false }: AudioPlayerProps) {
  const colors = useThemeColors()
  const [isPlaying, setIsPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(durationMs || 0)
  
  const soundRef = useRef<Audio.Sound | null>(null)
  const autoPlayRequestedRef = useRef(false)
  
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync()
      }
    }
  }, [])
  
  const loadSound = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      })
      const { sound, status } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false },
        onPlaybackStatusUpdate
      )
      soundRef.current = sound
      
      if (status.isLoaded && status.durationMillis) {
        setDuration(status.durationMillis)
      }
      
      return sound
    } catch (error) {
      console.error('Failed to load audio:', error)
      return null
    }
  }
  
  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis || 0)
      setIsPlaying(status.isPlaying)
      
      if (status.didJustFinish) {
        setPosition(0)
        setIsPlaying(false)
      }
    }
  }
  
  const handlePlayPause = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light)
    
    try {
      let sound = soundRef.current
      
      if (!sound) {
        sound = await loadSound()
        if (!sound) return
      }
      
      const status = await sound.getStatusAsync()
      
      if (status.isLoaded) {
        if (status.isPlaying) {
          await sound.pauseAsync()
        } else {
          if (status.positionMillis === status.durationMillis) {
            await sound.setPositionAsync(0)
          }
          await sound.playAsync()
        }
      }
    } catch (error) {
      console.error('Failed to play/pause:', error)
    }
  }

  useEffect(() => {
    autoPlayRequestedRef.current = false
  }, [autoPlay, uri])

  useEffect(() => {
    if (!autoPlay || autoPlayRequestedRef.current) {
      return
    }

    autoPlayRequestedRef.current = true
    void handlePlayPause()
  }, [autoPlay, uri])
  
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }
  
  const progress = duration > 0 ? position / duration : 0
  
  const waveformBars = useMemo(
    () => waveform.length > 0
      ? downsampleWaveform(waveform, MAX_WAVEFORM_BAR_COUNT)
      : FALLBACK_WAVEFORM,
    [waveform],
  )
  
  return (
    <View className="flex-row items-center gap-3 py-1">
      <Pressable
        onPress={handlePlayPause}
        accessibilityLabel={translate(isPlaying ? 'Pause voice note' : 'Play voice note', { ns: 'chat' })}
        className={`w-10 h-10 rounded-full items-center justify-center ${
          isOwn ? 'bg-white/20' : 'bg-primary/20'
        }`}
      >
        {isPlaying ? (
          <Pause size={18} color={isOwn ? 'white' : colors.primary} />
        ) : (
          <Play size={18} color={isOwn ? 'white' : colors.primary} style={{ marginLeft: 2 }} />
        )}
      </Pressable>
      
      <View className="flex-1 flex-row items-center h-8 gap-0.5 overflow-hidden">
        {waveformBars.map((value, index) => {
          const isPlayed = index / waveformBars.length < progress
          return (
            <View
              key={index}
              className={`w-1 rounded-full ${
                isPlayed 
                  ? (isOwn ? 'bg-white' : 'bg-primary') 
                  : (isOwn ? 'bg-white/30' : 'bg-primary/30')
              }`}
              style={{ height: Math.max(4, value * 24) }}
            />
          )
        })}
      </View>
      
      <Text className={`text-xs font-mono ${isOwn ? 'text-white/70' : 'text-text-muted'}`}>
        {isPlaying ? formatDuration(position) : formatDuration(duration)}
      </Text>
    </View>
  )
}
