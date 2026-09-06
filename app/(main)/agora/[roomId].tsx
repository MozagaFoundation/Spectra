/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { useLocalSearchParams } from 'expo-router'
import { AgoraPlazaShell } from '@/components/agora/AgoraPlazaShell'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'

export default function AgoraRoomScreen() {
  const { roomId: rawRoomId } = useLocalSearchParams<{ roomId: string }>()
  const roomId = Array.isArray(rawRoomId) ? rawRoomId[0] : rawRoomId
  const router = useGuardedRouter()
  if (!roomId) return null
  return (
    <AgoraPlazaShell
      roomId={roomId}
      mode="talk"
      onBack={() => router.back()}
    />
  )
}
