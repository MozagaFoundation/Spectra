/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { X } from 'lucide-react-native'
import { translate } from '@/lib/i18n'
import { AudioPlayer } from './AudioPlayer'
import { useDeviceInsets } from '@/hooks/useDeviceInsets'

interface ViewOnceVoiceNoteViewerProps {
  visible: boolean
  uri: string
  durationMs?: number
  waveform?: number[]
  onClose: () => void
}

export function ViewOnceVoiceNoteViewer({
  visible,
  uri,
  durationMs,
  waveform,
  onClose,
}: ViewOnceVoiceNoteViewerProps) {
  const insets = useDeviceInsets()

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/90">
        <View
          className="flex-row items-center justify-between px-4"
          style={{ paddingTop: insets.top + 12, paddingBottom: 12 }}
        >
          <Text className="text-white text-sm font-medium">{translate('One-time voice note')}</Text>
          <Pressable
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
            onPress={onClose}
          >
            <X size={20} color="white" />
          </Pressable>
        </View>

        <View className="flex-1 items-center justify-center px-4" style={{ paddingBottom: insets.bottom + 24 }}>
          <View className="w-full rounded-3xl bg-surface px-5 py-6">
            <AudioPlayer
              uri={uri}
              durationMs={durationMs}
              waveform={waveform}
              autoPlay
            />
          </View>
        </View>
      </View>
    </Modal>
  )
}
