/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'
import type { AgoraRoomSummary } from '@/lib/types/agora'
import { agoraOccupancyLabel, agoraTopicEmoji, groupAgoraRooms } from '@/components/agora/agoraRoomGroups'

vi.mock('@/lib/i18n', () => ({
  translate: (key: string, options?: { count?: number }) => {
    if (key === '{{count}} watching') return `${options?.count ?? 0} watching`
    if (key === '{{count}} rooms') return `${options?.count ?? 0} rooms`
    return key
  },
}))

function room(overrides: Partial<AgoraRoomSummary>): AgoraRoomSummary {
  return {
    id: 'ago1.general.1',
    topicId: 'general',
    instanceIndex: 1,
    title: 'Público 1',
    topicTitle: 'Público',
    topicLine: 'hola',
    icon: 'messages',
    canonical: true,
    readOnly: false,
    occupancy: 3,
    maxOccupancy: 80,
    full: false,
    closingAt: null,
    ...overrides,
  }
}

describe('agoraRoomGroups', () => {
  it('nests overflow instances under the canonical topic', () => {
    const grouped = groupAgoraRooms([
      room({ id: 'ago1.general.2', instanceIndex: 2, title: 'Público 2', canonical: false }),
      room({ id: 'ago1.general.1', instanceIndex: 1 }),
      room({ id: 'ago1.avisos.1', topicId: 'avisos', title: 'Avisos', topicTitle: 'Avisos', readOnly: true, maxOccupancy: 0 }),
    ])
    expect(grouped).toHaveLength(2)
    const general = grouped.find((group) => group.topicId === 'general')
    expect(general?.title).toBe('Público')
    expect(general?.icon).toBe('messages')
    expect(general?.rooms.map((entry) => entry.id)).toEqual(['ago1.general.1', 'ago1.general.2'])
  })

  it('maps topic icons to emojis', () => {
    expect(agoraTopicEmoji('heart')).toBe('💛')
    expect(agoraTopicEmoji('music')).toBe('🎵')
    expect(agoraTopicEmoji('unknown')).toBe('💬')
  })

  it('labels unlimited boards as watching counts', () => {
    expect(agoraOccupancyLabel(room({ readOnly: true, maxOccupancy: 0, occupancy: 12 }))).toBe('12 watching')
    expect(agoraOccupancyLabel(room({ occupancy: 4, maxOccupancy: 80 }))).toBe('4/80')
  })
})
