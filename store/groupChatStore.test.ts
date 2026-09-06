/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useGroupChatStore } from './groupChatStore'

beforeEach(() => {
  useGroupChatStore.getState().reset()
})

describe('groupChatStore', () => {
  it('upserts groups and clears active group-owned state on removal', () => {
    const store = useGroupChatStore.getState()

    store.addGroup({ groupId: 'group-1', name: 'Original', unreadCount: 3 } as any)
    store.addGroup({ groupId: 'group-1', name: 'Updated', unreadCount: 4 } as any)
    store.setActiveGroup('group-1')
    store.setMembers('group-1', [{ identityId: 'identity-1' }] as any[])
    store.setMessages('group-1', [{ id: 'message-1' }] as any[])

    expect(useGroupChatStore.getState().groups).toEqual([
      expect.objectContaining({ groupId: 'group-1', name: 'Updated', unreadCount: 4 }),
    ])

    store.removeGroup('group-1')

    expect(useGroupChatStore.getState().groups).toEqual([])
    expect(useGroupChatStore.getState().members).toEqual({})
    expect(useGroupChatStore.getState().messages).toEqual({})
    expect(useGroupChatStore.getState().activeGroupId).toBeNull()
  })

  it('deduplicates, merges, and sorts group messages by timestamp', () => {
    const store = useGroupChatStore.getState()

    store.addMessage('group-1', { id: 'message-2', timestamp: 20, content: 'newer' } as any)
    store.addMessage('group-1', { id: 'message-2', timestamp: 20, content: 'duplicate ignored' } as any)
    store.mergeMessages('group-1', [
      { id: 'message-1', timestamp: 10, content: 'older' },
      { id: 'message-2', timestamp: 20, content: 'merged newer' },
    ] as any[])

    expect(useGroupChatStore.getState().messages['group-1']).toEqual([
      expect.objectContaining({ id: 'message-1', content: 'older' }),
      expect.objectContaining({ id: 'message-2', content: 'merged newer' }),
    ])
  })

  it('deduplicates reactions and clears unread count on markRead', () => {
    const store = useGroupChatStore.getState()

    store.setGroups([{ groupId: 'group-1', unreadCount: 5 }] as any[])
    store.setMessages('group-1', [{ id: 'message-1', reactions: [] }] as any[])

    store.addReaction('group-1', 'message-1', { emoji: 'fire', senderId: 'identity-1' } as any)
    store.addReaction('group-1', 'message-1', { emoji: 'fire', senderId: 'identity-1' } as any)
    store.markRead('group-1')

    expect(useGroupChatStore.getState().messages['group-1'][0].reactions).toHaveLength(1)
    expect(useGroupChatStore.getState().groups).toEqual([
      expect.objectContaining({ groupId: 'group-1', unreadCount: 0 }),
    ])
  })
})
