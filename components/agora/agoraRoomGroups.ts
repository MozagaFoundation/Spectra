/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { AgoraRoomSummary } from '@/lib/types/agora'
import { translate } from '@/lib/i18n'
import { isAgoraUnlimitedRoom } from '@/services/agora'

export function groupAgoraRooms(rooms: AgoraRoomSummary[]) {
  const groups = new Map<string, AgoraRoomSummary[]>()
  for (const room of rooms) {
    const list = groups.get(room.topicId) ?? []
    list.push(room)
    groups.set(room.topicId, list)
  }
  return [...groups.values()].map((list) => {
    const sorted = [...list].sort((left, right) => left.instanceIndex - right.instanceIndex)
    const primary = sorted[0]!
    return {
      topicId: primary.topicId,
      title: primary.topicTitle || primary.title,
      topicLine: primary.topicLine,
      icon: primary.icon,
      rooms: sorted,
    }
  })
}

const TOPIC_EMOJI: Record<string, string> = {
  landmark: '🏛️',
  messages: '💬',
  heart: '💛',
  smile: '😄',
  music: '🎵',
  film: '🎬',
  trophy: '🏆',
  cpu: '💻',
  gamepad: '🎮',
  moon: '🌙',
  sparkles: '✨',
}

export function agoraTopicEmoji(icon: string): string {
  return TOPIC_EMOJI[icon] ?? '💬'
}

export function agoraOccupancyLabel(room: AgoraRoomSummary): string {
  if (isAgoraUnlimitedRoom(room)) {
    return translate('{{count}} watching', { count: room.occupancy })
  }
  return `${room.occupancy}/${room.maxOccupancy}`
}

export function agoraRoomCountLabel(count: number): string {
  return translate('{{count}} rooms', { count })
}

export function agoraClosingLabel(closingAt: string | null, now: number): string | null {
  if (!closingAt) return null
  const remaining = Math.max(0, new Date(closingAt).getTime() - now)
  if (remaining <= 0) return translate('Closing')
  const minutes = Math.floor(remaining / 60_000)
  const seconds = Math.floor((remaining % 60_000) / 1000)
  return `${translate('Closing')} ${minutes}:${String(seconds).padStart(2, '0')}`
}
