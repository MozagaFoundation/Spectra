/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { View, Text, Pressable, Modal, Animated, Platform, StyleSheet } from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  Mic,
  MicOff,
  PhoneIncoming,
  PhoneOff,
  RotateCcw,
  Shield,
  Video,
  Volume2,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Haptics, impactAsync as triggerImpact, selectionAsync as triggerSelection } from '@/lib/safeHaptics'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'
import { hasLiveVideoTrack } from '../../lib/callMedia'
import { Avatar } from '@/components/common'
import type { CallType, CallState } from '@/lib/types'

let RTCView: any = null
try {
  RTCView = require('react-native-webrtc').RTCView
} catch (e) {
  RTCView = null
}

type MediaStream = any

function getMediaStreamUrl(stream?: MediaStream | null): string | null {
  try {
    return typeof stream?.toURL === 'function' ? stream.toURL() : null
  } catch {
    return null
  }
}

interface CallScreenProps {
  visible: boolean
  callType: CallType
  callState: CallState
  contactName: string
  contactAvatarUrl?: string | null
  isOutgoing: boolean
  durationMs: number
  onEndCall: () => void
  onToggleMute: () => void
  onToggleSpeaker: () => void
  onSwitchCamera: () => void
  onAnswerCall?: () => void
  onDeclineCall?: () => void
  onMinimize?: () => void
  isMuted: boolean
  isSpeakerOn: boolean
  canMinimize?: boolean
  localStream?: MediaStream | null
  remoteStream?: MediaStream | null
  remoteStreamVersion?: number
}

export function CallScreen({
  visible,
  callType,
  callState,
  contactName,
  contactAvatarUrl,
  isOutgoing,
  durationMs,
  onEndCall,
  onToggleMute,
  onToggleSpeaker,
  onSwitchCamera,
  onAnswerCall,
  onDeclineCall,
  onMinimize,
  isMuted,
  isSpeakerOn,
  canMinimize = false,
  localStream,
  remoteStream,
  remoteStreamVersion = 0,
}: CallScreenProps) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  useTranslation()
  const pulseAnim = useRef(new Animated.Value(1)).current
  
  useEffect(() => {
    if (callState === 'ringing' || callState === 'connecting' || callState === 'initiating') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      )
      pulse.start()
      return () => pulse.stop()
    }
  }, [callState])
  
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }
  
  const getStatusText = (): string => {
    switch (callState) {
      case 'initiating':
        return translate('Initiating secure call...')
      case 'ringing':
        return translate(isOutgoing ? 'Ringing...' : 'Incoming call')
      case 'connecting':
        return translate('Connecting...')
      case 'connected':
        return formatDuration(durationMs)
      case 'reconnecting':
        return translate('Reconnecting...')
      case 'ended':
        return translate('Call ended')
      case 'failed':
        return translate('Call failed')
      default:
        return ''
    }
  }
  
  const handleEndCall = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Heavy)
    void onEndCall()
  }
  
  const handleAnswerCall = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Medium)
    void onAnswerCall?.()
  }
  
  const handleDeclineCall = async () => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Heavy)
    void onDeclineCall?.()
  }

  const handleMinimize = useCallback(async () => {
    if (!canMinimize || !onMinimize) {
      return
    }

    triggerSelection()
    void onMinimize()
  }, [canMinimize, onMinimize])

  const callMinimizeGesture = useMemo(() => Gesture.Pan()
    .enabled(Platform.OS !== 'android' && Boolean(canMinimize && onMinimize))
    .runOnJS(true)
    .activeOffsetX([30, Number.MAX_SAFE_INTEGER])
    .failOffsetY([-25, 25])
    .onEnd((event) => {
      const horizontal = event.translationX
      const vertical = Math.abs(event.translationY)
      const velocity = event.velocityX
      const passedDistance = horizontal > 90 && horizontal > vertical * 1.35
      const passedFling = horizontal > 50 && velocity > 700 && horizontal > vertical
      if (!passedDistance && !passedFling) {
        return
      }

      void handleMinimize()
    }), [canMinimize, handleMinimize, onMinimize])
  
  const isCallActive = callState === 'connected' || callState === 'connecting' || callState === 'reconnecting' || (callState === 'initiating' && isOutgoing) || (callState === 'ringing' && isOutgoing)
  const isIncomingRinging = callState === 'ringing' && !isOutgoing
  const hasLocalVideo = hasLiveVideoTrack(localStream)
  const hasRemoteVideo = hasLiveVideoTrack(remoteStream)
  const primaryVideoStream = hasRemoteVideo ? remoteStream : localStream
  const primaryVideoStreamUrl = getMediaStreamUrl(primaryVideoStream)
  const localStreamUrl = getMediaStreamUrl(localStream)
  const showVideoViews = RTCView && callType === 'video' && !isIncomingRinging && Boolean(primaryVideoStreamUrl)
  const showSwitchCamera = hasLocalVideo && !isIncomingRinging
  const showLocalPreview = hasRemoteVideo && hasLocalVideo
  const remoteVideoViewKey = `remote-${remoteStreamVersion}-${hasRemoteVideo ? 'live' : 'pending'}`
  
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <GestureDetector gesture={callMinimizeGesture}>
      <View 
        className="flex-1"
        style={{ backgroundColor: '#0a0a1a', paddingTop: insets.top, paddingBottom: insets.bottom }}
      >
        <View className="items-center pt-8 px-6">
          {canMinimize && onMinimize ? (
            <Pressable
              onPress={handleMinimize}
              accessibilityLabel={translate('Minimize call')}
              className="absolute left-0 top-2 w-11 h-11 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
            >
              <ChevronLeft size={22} color="white" />
            </Pressable>
          ) : null}
          <View className="flex-row items-center gap-1.5 mb-2">
            <Shield size={14} color={colors.success} />
            <Text className="text-sm font-medium" style={{ color: colors.success }}>
              {translate('End-to-end encrypted')}
            </Text>
          </View>
          <Text className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {translate(callType === 'video' ? 'Video Call' : 'Voice Call')}
          </Text>
        </View>
        
        <View className="flex-1 items-center justify-center">
          {showVideoViews ? (
            <View style={StyleSheet.absoluteFill}>
              {primaryVideoStreamUrl ? (
                <RTCView
                  key={remoteVideoViewKey}
                  streamURL={primaryVideoStreamUrl}
                  style={StyleSheet.absoluteFill}
                  objectFit="cover"
                  mirror={!hasRemoteVideo}
                />
              ) : null}
              
              {localStreamUrl && showLocalPreview && (
                <View 
                  className="absolute rounded-xl overflow-hidden border-2 border-white/30"
                  style={{
                    top: insets.top + 80,
                    right: 16,
                    width: 100,
                    height: 140,
                  }}
                >
                  <RTCView
                    streamURL={localStreamUrl}
                    style={StyleSheet.absoluteFill}
                    objectFit="cover"
                    mirror={true}
                    zOrder={1}
                  />
                </View>
              )}
              
              <View 
                className="absolute left-0 right-0 items-center"
                style={{ top: insets.top + 80 }}
              >
                <Text className="text-white text-xl font-semibold text-shadow">
                  {contactName}
                </Text>
                <Text className="text-white/80 text-base mt-1">
                  {getStatusText()}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Avatar
                  name={contactName}
                  imageUrl={contactAvatarUrl}
                  size="xl"
                  previewable
                />
              </Animated.View>
              
              <Text className="text-2xl font-semibold mt-6" style={{ color: 'white' }}>
                {contactName}
              </Text>
              
              <Text className="text-lg mt-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {getStatusText()}
              </Text>
            </>
          )}
        </View>
        
        <View className="pb-8">
          {isCallActive && (
            <View className="flex-row justify-center gap-5 mb-8">
              <View className="items-center">
                <Pressable
                  onPress={onToggleMute}
                  accessibilityLabel={translate(isMuted ? 'Unmute' : 'Mute')}
                  className="w-16 h-16 rounded-full items-center justify-center mb-1.5"
                  style={{ backgroundColor: isMuted ? 'white' : 'rgba(255,255,255,0.12)' }}
                >
                  {isMuted ? (
                    <MicOff size={26} color="#0a0a1a" />
                  ) : (
                    <Mic size={26} color="white" />
                  )}
                </Pressable>
                <Text className="text-xs" style={{ color: isMuted ? 'white' : 'rgba(255,255,255,0.6)' }}>
                  {translate(isMuted ? 'Unmute' : 'Mute')}
                </Text>
              </View>

              <View className="items-center">
                <Pressable
                  onPress={onToggleSpeaker}
                  accessibilityLabel={translate('Speaker')}
                  className="w-16 h-16 rounded-full items-center justify-center mb-1.5"
                  style={{ backgroundColor: isSpeakerOn ? 'white' : 'rgba(255,255,255,0.12)' }}
                >
                  <Volume2 size={26} color={isSpeakerOn ? '#0a0a1a' : 'white'} />
                </Pressable>
                <Text className="text-xs" style={{ color: isSpeakerOn ? 'white' : 'rgba(255,255,255,0.6)' }}>
                  {translate('Speaker')}
                </Text>
              </View>

              {showSwitchCamera && (
                <View className="items-center">
                  <Pressable
                    onPress={onSwitchCamera}
                    accessibilityLabel={translate('Flip')}
                    className="w-16 h-16 rounded-full items-center justify-center mb-1.5"
                    style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
                  >
                    <RotateCcw size={26} color="white" />
                  </Pressable>
                  <Text className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {translate('Flip')}
                  </Text>
                </View>
              )}
            </View>
          )}

          <View className="flex-row justify-center gap-12">
            {isIncomingRinging ? (
              <>
                <View className="items-center">
                  <Pressable
                    onPress={handleDeclineCall}
                    accessibilityLabel={translate('Decline')}
                    className="w-16 h-16 rounded-full bg-red-500 items-center justify-center mb-2"
                  >
                    <PhoneOff size={28} color="white" />
                  </Pressable>
                  <Text className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{translate('Decline')}</Text>
                </View>

                <View className="items-center">
                  <Pressable
                    onPress={handleAnswerCall}
                    accessibilityLabel={translate('Answer')}
                    className="w-16 h-16 rounded-full bg-green-500 items-center justify-center mb-2"
                  >
                    {callType === 'video' ? (
                      <Video size={28} color="white" />
                    ) : (
                      <PhoneIncoming size={28} color="white" />
                    )}
                  </Pressable>
                  <Text className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>{translate('Answer')}</Text>
                </View>
              </>
            ) : (
              <View className="items-center">
                <Pressable
                  onPress={handleEndCall}
                  accessibilityLabel={translate('End')}
                  className="w-16 h-16 rounded-full bg-red-500 items-center justify-center mb-2"
                >
                  <PhoneOff size={28} color="white" />
                </Pressable>
                <Text className="text-red-400 text-xs">{translate('End')}</Text>
              </View>
            )}
          </View>
        </View>
      </View>
      </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  )
}
