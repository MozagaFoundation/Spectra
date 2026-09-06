/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export interface AgoraIdentityPublic {
  identityId: string
  nick: string
  color: string
  plazaLocale?: 'en' | 'es'
}

export interface AgoraRoomSummary {
  id: string
  topicId: string
  instanceIndex: number
  title: string
  topicTitle: string
  topicLine: string
  icon: string
  canonical: boolean
  readOnly: boolean
  occupancy: number
  maxOccupancy: number
  full: boolean
  closingAt: string | null
  youAreHere?: boolean
}

export interface AgoraPublicMessage {
  id: string
  kind: 'public'
  roomId: string
  author: AgoraIdentityPublic
  body: string
  isAction: boolean
  mediaKind?: 'image' | 'voice' | null
  mediaUrl?: string | null
  mediaDurationMs?: number | null
  mediaWaveform?: number[] | null
  serverSequence: number
  createdAt: string
}

export interface AgoraWhisper {
  id: string
  kind: string
  roomId: string
  from: AgoraIdentityPublic
  to: AgoraIdentityPublic
  body: string
  inviteId?: string | null
  createdAt: string
  serverVisible: true
}

export interface AgoraOccupant {
  identityId: string
  nick: string
  color: string
  idleSeconds: number
  isSelf: boolean
}

export type AgoraTranscriptItem =
  | { type: 'public'; message: AgoraPublicMessage }
  | { type: 'whisper'; whisper: AgoraWhisper }
