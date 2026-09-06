/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'
import type {
  AgoraIdentityPublic,
  AgoraOccupant,
  AgoraPublicMessage,
  AgoraRoomSummary,
  AgoraWhisper,
} from '@/lib/types/agora'
import type { AgoraWhisperFilterMode } from '@/services/agora/agoraPolicy'

interface AgoraState {
  identity: AgoraIdentityPublic | null
  rooms: AgoraRoomSummary[]
  activeRoom: AgoraRoomSummary | null
  messages: AgoraPublicMessage[]
  whispers: AgoraWhisper[]
  occupants: AgoraOccupant[]
  pendingWhisperNick: string | null
  whisperFilterMode: AgoraWhisperFilterMode
  whisperFilterNick: string | null
  loading: boolean
  setIdentity: (identity: AgoraIdentityPublic | null) => void
  setRooms: (rooms: AgoraRoomSummary[]) => void
  setActiveRoom: (room: AgoraRoomSummary | null) => void
  setTranscript: (messages: AgoraPublicMessage[], whispers: AgoraWhisper[]) => void
  prependHistory: (messages: AgoraPublicMessage[]) => void
  appendPublic: (message: AgoraPublicMessage) => void
  appendWhisper: (whisper: AgoraWhisper) => void
  appendPoll: (messages: AgoraPublicMessage[], whispers: AgoraWhisper[]) => void
  setOccupants: (occupants: AgoraOccupant[]) => void
  requestWhisper: (nick: string) => void
  consumeWhisperRequest: () => void
  setWhisperFilter: (mode: AgoraWhisperFilterMode, nick?: string | null) => void
  setLoading: (loading: boolean) => void
  reset: () => void
}

const empty = {
  identity: null as AgoraIdentityPublic | null,
  rooms: [] as AgoraRoomSummary[],
  activeRoom: null as AgoraRoomSummary | null,
  messages: [] as AgoraPublicMessage[],
  whispers: [] as AgoraWhisper[],
  occupants: [] as AgoraOccupant[],
  pendingWhisperNick: null as string | null,
  whisperFilterMode: 'all' as AgoraWhisperFilterMode,
  whisperFilterNick: null as string | null,
  loading: false,
}

const TRANSCRIPT_CAP = 4100

function capMessages(messages: AgoraPublicMessage[]): AgoraPublicMessage[] {
  return messages.length > TRANSCRIPT_CAP ? messages.slice(messages.length - 4000) : messages
}

export const useAgoraStore = create<AgoraState>((set) => ({
  ...empty,
  setIdentity: (identity) => set({ identity }),
  setRooms: (rooms) => set({ rooms }),
  setActiveRoom: (activeRoom) => set((state) => {
    const sameSnapshot = state.activeRoom?.id === activeRoom?.id
      && state.activeRoom?.occupancy === activeRoom?.occupancy
      && state.activeRoom?.full === activeRoom?.full
    if (sameSnapshot) return state
    const roomChanged = state.activeRoom?.id !== activeRoom?.id
    return {
      activeRoom,
      ...(roomChanged
        ? { whisperFilterMode: 'all' as const, whisperFilterNick: null }
        : {}),
    }
  }),
  setTranscript: (messages, whispers) => set({ messages, whispers }),
  prependHistory: (older) => set((state) => {
    if (older.length === 0) return state
    const seen = new Set(state.messages.map((message) => message.id))
    const unique = older.filter((message) => !seen.has(message.id))
    if (unique.length === 0) return state
    return { messages: [...unique, ...state.messages] }
  }),
  appendPublic: (message) => set((state) => (
    state.messages.some((row) => row.id === message.id)
      ? state
      : { messages: capMessages([...state.messages, message]) }
  )),
  appendWhisper: (whisper) => set((state) => (
    state.whispers.some((row) => row.id === whisper.id)
      ? state
      : { whispers: [...state.whispers, whisper] }
  )),
  appendPoll: (messages, whispers) => set((state) => {
    const seenMessages = new Set(state.messages.map((message) => message.id))
    const seenWhispers = new Set(state.whispers.map((whisper) => whisper.id))
    const nextMessages = [
      ...state.messages,
      ...messages.filter((message) => !seenMessages.has(message.id)),
    ]
    const nextWhispers = [
      ...state.whispers,
      ...whispers.filter((whisper) => !seenWhispers.has(whisper.id)),
    ]
    if (
      nextMessages.length === state.messages.length &&
      nextWhispers.length === state.whispers.length
    ) {
      return state
    }
    return {
      messages: capMessages(nextMessages),
      whispers: nextWhispers,
    }
  }),
  setOccupants: (occupants) => set({ occupants }),
  requestWhisper: (nick) => set({ pendingWhisperNick: nick }),
  consumeWhisperRequest: () => set({ pendingWhisperNick: null }),
  setWhisperFilter: (mode, nick = null) => set({
    whisperFilterMode: nick ? 'whispers' : mode,
    whisperFilterNick: nick,
  }),
  setLoading: (loading) => set({ loading }),
  reset: () => set(empty),
}))
