/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it } from 'vitest'
import type { AgoraPublicMessage, AgoraRoomSummary } from '@/lib/types/agora'
import { useAgoraStore } from './agoraStore'

const room: AgoraRoomSummary = {
  id: 'ago1.avisos.1',
  topicId: 'avisos',
  instanceIndex: 1,
    title: 'Avisos',
    topicTitle: 'Avisos',
  topicLine: 'notices',
  icon: 'landmark',
  canonical: true,
  readOnly: true,
  occupancy: 1,
  maxOccupancy: 0,
  full: false,
  closingAt: null,
}

const message = (id: string, sequence: number): AgoraPublicMessage => ({
  id,
  kind: 'public',
  roomId: room.id,
  author: { identityId: 'id-1', nick: 'Perico', color: 'mint' },
  body: id,
  isAction: false,
  serverSequence: sequence,
  createdAt: '2026-09-04T18:00:00.000Z',
})

describe('agoraStore', () => {
  afterEach(() => {
    useAgoraStore.getState().reset()
  })

  it('does not notify when entering the same room snapshot', () => {
    const store = useAgoraStore.getState()
    store.setActiveRoom(room)
    const before = useAgoraStore.getState().activeRoom
    useAgoraStore.getState().setActiveRoom({ ...room })
    expect(useAgoraStore.getState().activeRoom).toBe(before)
  })

  it('ignores empty history pages', () => {
    useAgoraStore.getState().setTranscript([message('m1', 1)], [])
    const before = useAgoraStore.getState().messages
    useAgoraStore.getState().prependHistory([])
    expect(useAgoraStore.getState().messages).toBe(before)
  })

  it('stores a pending whisper nick until the salon consumes it', () => {
    useAgoraStore.getState().requestWhisper('Luna')
    expect(useAgoraStore.getState().pendingWhisperNick).toBe('Luna')
    useAgoraStore.getState().consumeWhisperRequest()
    expect(useAgoraStore.getState().pendingWhisperNick).toBeNull()
  })

  it('filters whispers to one nick and clears the filter when the room changes', () => {
    useAgoraStore.getState().setWhisperFilter('whispers', 'Luna')
    expect(useAgoraStore.getState().whisperFilterMode).toBe('whispers')
    expect(useAgoraStore.getState().whisperFilterNick).toBe('Luna')
    useAgoraStore.getState().setActiveRoom(room)
    useAgoraStore.getState().setWhisperFilter('public')
    expect(useAgoraStore.getState().whisperFilterNick).toBeNull()
    useAgoraStore.getState().setWhisperFilter('whispers', 'Luna')
    useAgoraStore.getState().setActiveRoom({ ...room, id: 'ago1.es_publico.1', occupancy: 2, full: false })
    expect(useAgoraStore.getState().whisperFilterMode).toBe('all')
    expect(useAgoraStore.getState().whisperFilterNick).toBeNull()
  })
})
