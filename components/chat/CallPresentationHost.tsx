/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Shield } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { translate } from '@/lib/i18n'
import { useCallPresentation } from '@/contexts'
import { useThemeColors } from '@/lib/theme'
import { CallScreen } from './CallScreen'
import { MinimizedCallBanner } from './MinimizedCallBanner'

export function FullscreenCallHost() {
  const call = useCallPresentation()
  useTranslation()

  if (!call.showFullScreenCall || !call.callState) {
    return null
  }

  return (
    <CallScreen
      visible
      callType={call.callType}
      callState={call.callState}
      contactName={call.contactName || translate('Secure call')}
      contactAvatarUrl={call.contactAvatarUrl}
      isOutgoing={!call.isIncoming}
      durationMs={call.durationMs}
      onEndCall={call.endCall}
      onToggleMute={call.toggleMute}
      onToggleSpeaker={call.toggleSpeaker}
      onSwitchCamera={call.switchCamera}
      onAnswerCall={call.answerCall}
      onDeclineCall={call.declineCall}
      onMinimize={call.minimizeCallUi}
      isMuted={call.isMuted}
      isSpeakerOn={call.isSpeakerOn}
      canMinimize={call.canMinimize}
      localStream={call.localStream}
      remoteStream={call.remoteStream}
      remoteStreamVersion={call.remoteStreamVersion}
    />
  )
}

export function MinimizedCallBannerHost({
  includeTopInset = true,
}: {
  includeTopInset?: boolean
}) {
  const call = useCallPresentation()
  useTranslation()

  if (!call.showMinimizedBanner || !call.callState) {
    return null
  }

  return (
    <MinimizedCallBanner
      visible
      includeTopInset={includeTopInset}
      callType={call.callType}
      callState={call.callState}
      contactName={call.contactName || translate('Secure call')}
      contactAvatarUrl={call.contactAvatarUrl}
      durationMs={call.durationMs}
      isMuted={call.isMuted}
      onPress={call.expandCallUi}
      onEndCall={() => {
        void call.endCall()
      }}
    />
  )
}

function getRecoveryText(phase: NonNullable<ReturnType<typeof useCallPresentation>['pendingCallRecoveryPhase']>): string {
  switch (phase) {
    case 'chat':
      return translate('Connecting encrypted chat...')
    case 'invitation':
      return translate('Recovering secure call...')
  }
}

export function PendingCallRecoveryBannerHost({
  includeTopInset = true,
}: {
  includeTopInset?: boolean
}) {
  const call = useCallPresentation()
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  useTranslation()

  if (!call.pendingCallRecoveryPhase || call.callState) {
    return null
  }

  return (
    <View
      style={{
        backgroundColor: 'transparent',
        paddingTop: includeTopInset ? insets.top + 8 : 0,
        paddingBottom: 12,
      }}
    >
      <View className="px-4">
        <View
          className="flex-row items-center rounded-2xl px-4 py-3"
          style={{
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          }}
        >
          <View
            className="w-10 h-10 rounded-full items-center justify-center mr-3"
            style={{ backgroundColor: colors.backgroundSecondary }}
          >
            <Shield size={18} color={colors.success} />
          </View>
          <View className="flex-1">
            <Text className="font-semibold" style={{ color: colors.text }}>
              {translate('Secure call waiting')}
            </Text>
            <Text className="text-xs mt-1" style={{ color: colors.textSecondary }}>
              {getRecoveryText(call.pendingCallRecoveryPhase)}
            </Text>
          </View>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      </View>
    </View>
  )
}
