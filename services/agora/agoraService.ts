/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type {
  AgoraIdentityPublic,
  AgoraOccupant,
  AgoraPublicMessage,
  AgoraRoomSummary,
  AgoraWhisper,
} from '@/lib/types/agora'
import { AGORA_TERMS_VERSION } from './agoraPolicy'
import { agoraGet, agoraPost } from './agoraClient'

export function fetchAgoraSession(): Promise<{
  identity: AgoraIdentityPublic | null
  termsVersion: string
  acceptedTermsVersion: string | null
}> {
  return agoraGet('/v1/agora/session')
}

export function joinAgora(
  nick: string,
  locale: 'en' | 'es',
): Promise<{ identity: AgoraIdentityPublic }> {
  return agoraPost('/v1/agora/join', {
    nick,
    termsVersion: AGORA_TERMS_VERSION,
    recommendationsAck: true,
    locale,
  })
}

export function changeAgoraNick(nick: string): Promise<{ identity: AgoraIdentityPublic }> {
  return agoraPost('/v1/agora/nick', { nick })
}

export function changeAgoraLocale(locale: 'en' | 'es'): Promise<{ identity: AgoraIdentityPublic }> {
  return agoraPost('/v1/agora/locale', { locale })
}

export function listAgoraRooms(): Promise<{ rooms: AgoraRoomSummary[] }> {
  return agoraGet('/v1/agora/rooms')
}

const enterLocks = new Map<string, Promise<{ room: AgoraRoomSummary }>>()

export function enterAgoraRoom(roomId: string): Promise<{ room: AgoraRoomSummary }> {
  const existing = enterLocks.get(roomId)
  if (existing) return existing
  const request = agoraPost<{ room: AgoraRoomSummary }>('/v1/agora/presence/enter', { roomId })
    .finally(() => {
      if (enterLocks.get(roomId) === request) enterLocks.delete(roomId)
    })
  enterLocks.set(roomId, request)
  return request
}

export function heartbeatAgora(): Promise<{ ok: true; roomId: string }> {
  return agoraPost('/v1/agora/presence/heartbeat')
}

export function activityAgora(): Promise<{ ok: true; roomId: string }> {
  return agoraPost('/v1/agora/presence/activity')
}

export function backgroundAgora(): Promise<{ ok: true }> {
  return agoraPost('/v1/agora/presence/background')
}

export function leaveAgoraRoom(): Promise<{ ok: true }> {
  return agoraPost('/v1/agora/presence/leave')
}

export function listAgoraOccupants(roomId: string): Promise<{ occupants: AgoraOccupant[] }> {
  return agoraGet(`/v1/agora/occupants?roomId=${encodeURIComponent(roomId)}`)
}

export function listAgoraMessages(
  roomId: string,
  cursor?: { before?: number; after?: number; afterWhisper?: string },
): Promise<{ messages: AgoraPublicMessage[]; whispers: AgoraWhisper[] }> {
  const params = new URLSearchParams({ roomId })
  if (cursor?.before != null) params.set('before', String(cursor.before))
  if (cursor?.after != null) params.set('after', String(cursor.after))
  if (cursor?.afterWhisper) params.set('afterWhisper', cursor.afterWhisper)
  return agoraGet(`/v1/agora/messages?${params.toString()}`)
}

export function sendAgoraMessage(
  roomId: string,
  body: string,
): Promise<{ message?: AgoraPublicMessage; whisper?: AgoraWhisper }> {
  return agoraPost('/v1/agora/messages', { roomId, body })
}

export function sendAgoraWhisper(
  roomId: string,
  toNick: string,
  body: string,
): Promise<{ whisper: AgoraWhisper }> {
  return agoraPost('/v1/agora/whispers', { roomId, toNick, body })
}

export function createAgoraInvite(
  roomId: string,
  toIdentityId: string,
  contactInvite: string,
): Promise<{ inviteId: string; whisperId: string }> {
  return agoraPost('/v1/agora/invites', { roomId, toIdentityId, contactInvite })
}

export function redeemAgoraInvite(inviteId: string): Promise<{ contactInvite: string }> {
  return agoraPost('/v1/agora/invites/redeem', { inviteId })
}

export function blockAgoraIdentity(identityId: string): Promise<{ ok: true }> {
  return agoraPost('/v1/agora/block', { identityId })
}

export function reportAgoraIdentity(
  identityId: string,
  reason: 'harassment' | 'spam' | 'illegal' | 'other',
  roomId?: string,
  messageId?: string,
): Promise<{ ok: true }> {
  return agoraPost('/v1/agora/report', { identityId, reason, roomId, messageId })
}
