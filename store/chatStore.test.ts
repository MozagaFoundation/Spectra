/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  spectreEnabled: false,
}))

vi.stubGlobal('__DEV__', false)

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockState.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockState.storage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      mockState.storage.delete(key)
    }),
    multiGet: vi.fn(async (keys: string[]) => keys.map((key) => [key, mockState.storage.get(key) ?? null])),
    multiSet: vi.fn(async (entries: [string, string][]) => {
      for (const [key, value] of entries) {
        mockState.storage.set(key, value)
      }
    }),
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const key of keys) {
        mockState.storage.delete(key)
      }
    }),
  },
}))

vi.mock('./spectreStore', () => ({
  useSpectreStore: {
    getState: () => ({
      enabled: mockState.spectreEnabled,
    }),
  },
}))

vi.mock('@/lib/utils', () => ({
  generateId: vi.fn(() => 'generated-id'),
}))

describe('useChatStore swipe preferences', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.storage.clear()
    mockState.spectreEnabled = false
  })

  it('migrates legacy swipe preferences into the active account scope', async () => {
    mockState.storage.set('exo_archived_conversations', JSON.stringify(['conversation-1']))
    mockState.storage.set('exo_pinned_conversations', JSON.stringify(['conversation-2']))

    const { useChatStore } = await import('./chatStore')
    const scope = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

    useChatStore.getState().setStorageScope(scope, { allowLegacyMigration: true })
    await useChatStore.getState().loadSwipePreferences()

    expect(useChatStore.getState().archivedConversationIds).toEqual(['conversation-1'])
    expect(useChatStore.getState().pinnedConversationIds).toEqual(['conversation-2'])
    expect(mockState.storage.has('exo_archived_conversations')).toBe(false)
    expect(mockState.storage.has('exo_pinned_conversations')).toBe(false)
    expect(
      mockState.storage.has(`exo_archived_conversations:${scope}`),
    ).toBe(true)
  })

  it('keeps scoped swipe preferences isolated and preserves them across resets', async () => {
    const { useChatStore } = await import('./chatStore')
    const scopeA = 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const scopeB = 'exo00cccccccccccccccccccccccccccccccccccccc'

    useChatStore.getState().setStorageScope(scopeA)
    useChatStore.getState().archiveConversation('conversation-a')
    await Promise.resolve()
    useChatStore.getState().reset()

    useChatStore.getState().setStorageScope(scopeA)
    await useChatStore.getState().loadSwipePreferences()
    expect(useChatStore.getState().archivedConversationIds).toEqual(['conversation-a'])

    useChatStore.getState().setStorageScope(scopeB)
    await useChatStore.getState().loadSwipePreferences()
    expect(useChatStore.getState().archivedConversationIds).toEqual([])
  })

  it('ignores corrupt scoped swipe preference payloads', async () => {
    const { useChatStore } = await import('./chatStore')
    const scope = 'exo00dddddddddddddddddddddddddddddddddddddd'

    mockState.storage.set(`exo_archived_conversations:${scope}`, '{')
    mockState.storage.set(`exo_pinned_conversations:${scope}`, JSON.stringify([123, 'conversation-1']))
    mockState.storage.set(`exo_manually_unread_conversations:${scope}`, JSON.stringify({ id: 'conversation-2' }))
    mockState.storage.set(`exo_muted_conversations:${scope}`, JSON.stringify(['conversation-3']))

    useChatStore.getState().setStorageScope(scope)
    await useChatStore.getState().loadSwipePreferences()

    expect(useChatStore.getState()).toEqual(expect.objectContaining({
      archivedConversationIds: [],
      pinnedConversationIds: ['conversation-1'],
      manuallyUnreadConversationIds: [],
      mutedConversationIds: ['conversation-3'],
    }))
  })
})

describe('useChatStore message merging', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.storage.clear()
    mockState.spectreEnabled = false
  })

  it('does not regress delivered messages to a one-check delivery stage', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().addMessage({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'me',
      content: 'hello',
      timestamp: 1,
      status: 'delivered',
      deliveryStage: 'delivered',
      deliveryHint: 'Delivered',
    })

    useChatStore.getState().mergeMessages([
      {
        id: 'message-1',
        conversationId: 'conversation-1',
        senderId: 'me',
        content: 'hello',
        timestamp: 1,
        status: 'sent',
        deliveryStage: 'awaiting_recipient',
        deliveryHint: 'Waiting for poll',
      },
    ], 'conversation-1')

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'message-1',
        status: 'delivered',
        deliveryStage: 'delivered',
        deliveryHint: 'Delivered',
      }),
    ])
  })

  it('keeps read messages read when loaded rows are less advanced', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().addMessage({
      id: 'message-2',
      conversationId: 'conversation-1',
      senderId: 'me',
      content: 'hello again',
      timestamp: 2,
      status: 'read',
      deliveryStage: 'read',
      deliveryHint: 'Read',
    })

    useChatStore.getState().mergeMessages([
      {
        id: 'message-2',
        conversationId: 'conversation-1',
        senderId: 'me',
        content: 'hello again',
        timestamp: 2,
        status: 'delivered',
        deliveryStage: 'delivered',
        deliveryHint: 'Delivered',
      },
    ], 'conversation-1')

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'message-2',
        status: 'read',
        deliveryStage: 'read',
        deliveryHint: 'Read',
      }),
    ])
  })

  it('normalizes local own messages that are missing delivery metadata', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().addMessage({
      id: 'message-missing-status',
      conversationId: 'conversation-1',
      senderId: 'identity-me',
      localIdentityId: 'identity-me',
      content: 'hello',
      timestamp: 3,
    })

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'message-missing-status',
        status: 'sent',
        deliveryStage: 'relayed',
        deliveryHint: 'Sent',
      }),
    ])
  })

  it('reports whether a message was newly inserted', async () => {
    const { useChatStore } = await import('./chatStore')
    const message = {
      id: 'message-dedup',
      conversationId: 'conversation-1',
      senderId: 'peer',
      content: 'hello once',
      timestamp: 2,
      status: 'delivered' as const,
      isOwn: false,
    }

    expect(useChatStore.getState().addMessage(message)).toBe(true)
    expect(useChatStore.getState().addMessage(message)).toBe(false)
    expect(useChatStore.getState().messages.filter((entry) => entry.id === message.id)).toHaveLength(1)
  })

  it('keeps failed outgoing messages failed when storage still says sent', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().addMessage({
      id: 'message-failed',
      conversationId: 'conversation-1',
      senderId: 'me',
      content: 'retry me',
      timestamp: 3,
      status: 'failed',
      deliveryStage: 'failed',
      deliveryHint: 'Failed',
    })

    useChatStore.getState().mergeMessages([
      {
        id: 'message-failed',
        conversationId: 'conversation-1',
        senderId: 'me',
        content: 'retry me',
        timestamp: 3,
        status: 'sent',
        deliveryStage: 'relayed',
        deliveryHint: 'Sent',
      },
    ], 'conversation-1')

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'message-failed',
        status: 'failed',
        deliveryStage: 'failed',
        deliveryHint: 'Failed',
      }),
    ])
  })

  it('allows delivered storage rows to supersede failed local rows', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().addMessage({
      id: 'message-delivered',
      conversationId: 'conversation-1',
      senderId: 'me',
      content: 'eventually delivered',
      timestamp: 4,
      status: 'failed',
      deliveryStage: 'failed',
      deliveryHint: 'Failed',
    })

    useChatStore.getState().mergeMessages([
      {
        id: 'message-delivered',
        conversationId: 'conversation-1',
        senderId: 'me',
        content: 'eventually delivered',
        timestamp: 4,
        status: 'delivered',
        deliveryStage: 'delivered',
        deliveryHint: 'Delivered',
      },
    ], 'conversation-1')

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'message-delivered',
        status: 'delivered',
        deliveryStage: 'delivered',
        deliveryHint: 'Delivered',
      }),
    ])
  })

  it('does not let transient updates regress delivered or read status', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().addMessage({
      id: 'message-received',
      conversationId: 'conversation-1',
      senderId: 'me',
      content: 'already received',
      timestamp: 5,
      status: 'delivered',
      deliveryStage: 'delivered',
      deliveryHint: 'Delivered',
    })

    useChatStore.getState().updateMessage('message-received', {
      status: 'sent',
      deliveryStage: 'relayed',
      deliveryHint: 'Sent',
    })

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'message-received',
        status: 'delivered',
        deliveryStage: 'delivered',
        deliveryHint: 'Delivered',
      }),
    ])
  })

  it('does not publish redundant message status updates', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().addMessage({
      id: 'message-stable-delivered',
      conversationId: 'conversation-1',
      senderId: 'me',
      content: 'already delivered',
      timestamp: 5,
      status: 'delivered',
      deliveryStage: 'delivered',
      deliveryHint: 'Delivered',
    })
    const previousState = useChatStore.getState()
    const notify = vi.fn()
    const unsubscribe = useChatStore.subscribe(notify)

    useChatStore.getState().updateMessage('message-stable-delivered', {
      status: 'delivered',
      deliveryStage: 'delivered',
      deliveryHint: 'Delivered',
    })

    expect(useChatStore.getState()).toBe(previousState)
    expect(notify).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('keeps a large converged status batch out of the store notification path', async () => {
    const { useChatStore } = await import('./chatStore')
    const messages = Array.from({ length: 250 }, (_, index) => ({
      id: `message-converged-${index}`,
      conversationId: 'conversation-large',
      senderId: 'me',
      content: `message ${index}`,
      timestamp: index,
      status: 'delivered' as const,
      deliveryStage: 'delivered' as const,
      deliveryHint: 'Delivered',
    }))

    useChatStore.getState().setMessages(messages, 'conversation-large')
    const previousState = useChatStore.getState()
    const notify = vi.fn()
    const unsubscribe = useChatStore.subscribe(notify)

    for (const message of messages) {
      useChatStore.getState().updateMessage(message.id, {
        status: 'delivered',
        deliveryStage: 'delivered',
        deliveryHint: 'Delivered',
      })
    }

    expect(useChatStore.getState()).toBe(previousState)
    expect(notify).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('bounds a warm history window after leaving a conversation', async () => {
    const { useChatStore } = await import('./chatStore')
    const messages = Array.from({ length: 75 }, (_, index) => ({
      id: `bounded-${index}`,
      conversationId: 'conversation-bounded',
      senderId: 'remote',
      content: `message ${index}`,
      timestamp: index,
      status: 'delivered' as const,
    }))

    useChatStore.getState().setMessages(messages, 'conversation-bounded')
    expect(useChatStore.getState().messages).toHaveLength(50)
    expect(useChatStore.getState().getMessageById('bounded-0')).toBeUndefined()
    expect(useChatStore.getState().getMessageById('bounded-74')).toBeDefined()

    useChatStore.getState().setActiveConversation('conversation-bounded')
    useChatStore.getState().setMessages(messages, 'conversation-bounded')
    expect(useChatStore.getState().messages).toHaveLength(75)

    useChatStore.getState().setActiveConversation(null)
    expect(useChatStore.getState().messages).toHaveLength(25)
    expect(useChatStore.getState().getMessageById('bounded-0')).toBeUndefined()
    expect(useChatStore.getState().getMessageById('bounded-74')).toBeDefined()

    useChatStore.getState().addMessage({
      id: 'bounded-new',
      conversationId: 'conversation-bounded',
      senderId: 'remote',
      content: 'new',
      timestamp: 100,
      status: 'delivered',
    })
    expect(useChatStore.getState()._messagesByConversationId.get('conversation-bounded')).toHaveLength(25)
  })

  it('retains recent message windows while switching chats', async () => {
    const { useChatStore } = await import('./chatStore')
    const makeMessages = (conversationId: string) => Array.from({ length: 50 }, (_, index) => ({
      id: `${conversationId}-${index}`,
      conversationId,
      senderId: 'remote',
      content: `message ${index}`,
      timestamp: index,
      status: 'delivered' as const,
    }))

    useChatStore.getState().setMessages(makeMessages('conversation-a'), 'conversation-a')
    useChatStore.getState().setMessages(makeMessages('conversation-b'), 'conversation-b')
    useChatStore.getState().setMessages(makeMessages('conversation-c'), 'conversation-c')

    useChatStore.getState().setActiveConversation('conversation-a')
    expect(useChatStore.getState()._messagesByConversationId.has('conversation-a')).toBe(true)
    expect(useChatStore.getState()._messagesByConversationId.has('conversation-b')).toBe(false)
    expect(useChatStore.getState()._messagesByConversationId.has('conversation-c')).toBe(false)

    useChatStore.getState().setMessages(makeMessages('conversation-c'), 'conversation-c')
    useChatStore.getState().setActiveConversation('conversation-c')
    expect(useChatStore.getState()._messagesByConversationId.has('conversation-a')).toBe(true)
    expect(useChatStore.getState()._messagesByConversationId.has('conversation-c')).toBe(true)

    useChatStore.getState().setActiveConversation(null)
    expect(useChatStore.getState()._messagesByConversationId.has('conversation-a')).toBe(true)
    expect(useChatStore.getState()._messagesByConversationId.has('conversation-c')).toBe(true)
  })

  it('keeps only the 20 most recent direct message windows', async () => {
    const { useChatStore } = await import('./chatStore')
    const scope = 'exo00cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd'
    const makeMessages = (conversationId: string) => Array.from({ length: 30 }, (_, index) => ({
      id: `${conversationId}-${index}`,
      conversationId,
      senderId: 'remote',
      content: `message ${index}`,
      timestamp: index,
      status: 'delivered' as const,
    }))

    useChatStore.getState().setStorageScope(scope)
    useChatStore.getState().setConversations(
      Array.from({ length: 21 }, (_, index) => ({
        id: `conversation-${index}`,
        remoteIdentityId: `remote-${index}`,
        localWalletAddress: scope,
        createdAt: index,
        unreadCount: 0,
      })),
    )
    for (let index = 0; index < 21; index += 1) {
      const conversationId = `conversation-${index}`
      useChatStore.getState().setActiveConversation(conversationId)
      useChatStore.getState().setMessages(makeMessages(conversationId), conversationId)
    }

    const state = useChatStore.getState()
    expect(state.warmDirectConversationIds).toHaveLength(20)
    expect(state.warmDirectConversationIds).not.toContain('conversation-0')
    expect(state._messagesByConversationId.has('conversation-0')).toBe(false)
    expect(state._messagesByConversationId.get('conversation-1')).toHaveLength(25)
    expect(state._messagesByConversationId.get('conversation-20')).toHaveLength(30)

    state.setActiveConversation(null)
    expect(useChatStore.getState()._messagesByConversationId.get('conversation-20')).toHaveLength(25)
  })

  it('clears direct message windows when the account scope changes', async () => {
    const { useChatStore } = await import('./chatStore')
    const scopeA = 'exo00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    const scopeB = 'exo00ffffffffffffffffffffffffffffffffffffff'
    useChatStore.getState().setStorageScope(scopeA)
    useChatStore.getState().setConversations([{
      id: 'conversation-scoped',
      remoteIdentityId: 'remote-scoped',
      localWalletAddress: scopeA,
      createdAt: 1,
      unreadCount: 0,
    }])
    useChatStore.getState().setMessages([{
      id: 'message-scoped',
      conversationId: 'conversation-scoped',
      senderId: 'remote-scoped',
      content: 'scoped',
      timestamp: 1,
      status: 'delivered',
    }], 'conversation-scoped')
    useChatStore.getState().setActiveConversation('conversation-scoped')

    useChatStore.getState().setStorageScope(scopeB)

    expect(useChatStore.getState()).toEqual(expect.objectContaining({
      activeConversationId: null,
      warmDirectConversationIds: [],
      messages: [],
    }))
    expect(useChatStore.getState()._messagesByConversationId.size).toBe(0)
  })

  it('evicts only in-memory windows when a direct peer identity changes', async () => {
    const { useChatStore } = await import('./chatStore')
    const scope = 'exo00ababababababababababababababababababab'
    useChatStore.getState().setStorageScope(scope)
    useChatStore.getState().setConversations([{
      id: 'conversation-peer',
      remoteIdentityId: 'peer-old',
      remoteWalletAddress: 'exo00peer000000000000000000000000000000000',
      localWalletAddress: scope,
      createdAt: 1,
      unreadCount: 0,
    }])
    useChatStore.getState().setMessages([{
      id: 'message-peer',
      conversationId: 'conversation-peer',
      senderId: 'peer-old',
      content: 'cached',
      timestamp: 1,
      status: 'delivered',
    }], 'conversation-peer')
    useChatStore.getState().setActiveConversation('conversation-peer')

    useChatStore.getState().evictDirectConversationWindowsForPeer('peer-old')

    expect(useChatStore.getState().conversations).toHaveLength(1)
    expect(useChatStore.getState()).toEqual(expect.objectContaining({
      activeConversationId: null,
      warmDirectConversationIds: [],
      messages: [],
    }))
  })

  it('does not publish an unchanged conversation preview', async () => {
    const { useChatStore } = await import('./chatStore')
    const lastMessage = {
      content: 'same preview',
      timestamp: 5,
      isOwn: true,
    }

    useChatStore.getState().addConversation({
      id: 'conversation-stable',
      remoteIdentityId: 'remote-stable',
      createdAt: 1,
      unreadCount: 0,
      lastMessage,
      hasVisibleActivity: true,
    })
    const previousState = useChatStore.getState()
    const notify = vi.fn()
    const unsubscribe = useChatStore.subscribe(notify)

    useChatStore.getState().updateConversation('conversation-stable', {
      lastMessage: { ...lastMessage },
    })

    expect(useChatStore.getState()).toBe(previousState)
    expect(notify).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('preserves advanced status while replacing an optimistic message', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().addMessage({
      id: 'optimistic-message',
      conversationId: 'conversation-1',
      senderId: 'me',
      content: 'burst message',
      timestamp: 5,
      status: 'sending',
      deliveryStage: 'relaying',
      deliveryHint: 'Relaying',
    })
    useChatStore.getState().addMessage({
      id: 'persisted-message',
      conversationId: 'conversation-1',
      senderId: 'me',
      content: 'burst message',
      timestamp: 5,
      status: 'delivered',
      deliveryStage: 'delivered',
      deliveryHint: 'Delivered',
    })

    useChatStore.getState().replaceMessage('optimistic-message', {
      id: 'persisted-message',
      conversationId: 'conversation-1',
      senderId: 'me',
      content: 'burst message',
      timestamp: 5,
      status: 'sent',
      deliveryStage: 'relayed',
      deliveryHint: 'Sent',
    })

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'persisted-message',
        status: 'delivered',
        deliveryStage: 'delivered',
        deliveryHint: 'Delivered',
      }),
    ])
  })

  it('allows retrying a failed message', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().addMessage({
      id: 'message-retry',
      conversationId: 'conversation-1',
      senderId: 'me',
      content: 'retry',
      timestamp: 6,
      status: 'failed',
      deliveryStage: 'failed',
      deliveryHint: 'Failed',
    })

    useChatStore.getState().updateMessage('message-retry', {
      status: 'sending',
      deliveryStage: 'relaying',
      deliveryHint: 'Relaying',
    })

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'message-retry',
        status: 'sending',
        deliveryStage: 'relaying',
        deliveryHint: 'Relaying',
      }),
    ])
  })

  it('batch-removes cleared messages and resets an empty conversation preview', async () => {
    const { useChatStore } = await import('./chatStore')
    useChatStore.getState().addConversation({
      id: 'conversation-1',
      remoteIdentityId: 'remote-1',
      createdAt: 1,
      unreadCount: 0,
      lastMessage: {
        content: 'old preview',
        timestamp: 1,
        isOwn: false,
      },
    })
    useChatStore.getState().addMessage({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'remote-1',
      content: 'old preview',
      timestamp: 1,
    })

    useChatStore.getState().removeMessages(['message-1'])

    expect(useChatStore.getState().messages).toEqual([])
    expect(useChatStore.getState().conversations[0].lastMessage).toBeUndefined()
  })
})

describe('useChatStore conversation merging', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.storage.clear()
  })

  it('keeps hidden-control-only conversations out of unread totals until visible activity', async () => {
    const { useChatStore } = await import('./chatStore')
    useChatStore.getState().addConversation({
      id: 'conversation-control',
      remoteIdentityId: 'remote-control',
      createdAt: 1,
      unreadCount: 7,
      hasVisibleActivity: false,
    })

    expect(useChatStore.getState().totalUnreadCount).toBe(0)
    useChatStore.getState().updateConversation('conversation-control', {
      lastMessage: { content: 'hello', timestamp: 2, isOwn: false },
    })

    expect(useChatStore.getState().conversations[0].hasVisibleActivity).toBe(true)
    expect(useChatStore.getState().totalUnreadCount).toBe(7)
  })

  it('merges persisted remote privacy signal fields into existing conversations', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().addConversation({
      id: 'conversation-1',
      remoteIdentityId: 'remote-1',
      createdAt: 1,
      unreadCount: 0,
    })

    useChatStore.getState().mergeConversations([
      {
        id: 'conversation-1',
        remoteIdentityId: 'remote-1',
        createdAt: 1,
        unreadCount: 0,
        remoteScreenshotProtection: true,
        remoteScreenshotProtectionUpdatedAt: 123,
        remoteTorEnabled: true,
        remoteTorUpdatedAt: 456,
      },
    ])

    expect(useChatStore.getState().conversations).toEqual([
      expect.objectContaining({
        id: 'conversation-1',
        remoteScreenshotProtection: true,
        remoteScreenshotProtectionUpdatedAt: 123,
        remoteTorEnabled: true,
        remoteTorUpdatedAt: 456,
      }),
    ])
  })

  it('keeps same remote wallet separate across local EXO accounts', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().mergeConversations([
      {
        id: 'conversation-work',
        localWalletAddress: 'exo1work',
        remoteIdentityId: 'remote-1',
        remoteWalletAddress: 'exo1alex',
        createdAt: 1,
        unreadCount: 0,
      },
      {
        id: 'conversation-friends',
        localWalletAddress: 'exo1friends',
        remoteIdentityId: 'remote-1',
        remoteWalletAddress: 'exo1alex',
        createdAt: 2,
        unreadCount: 0,
      },
    ])

    expect(useChatStore.getState().conversations).toEqual([
      expect.objectContaining({ id: 'conversation-work', localWalletAddress: 'exo1work' }),
      expect.objectContaining({ id: 'conversation-friends', localWalletAddress: 'exo1friends' }),
    ])
  })

  it('does not collapse same-wallet conversations added under different active local accounts', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().setStorageScope('exo1work')
    useChatStore.getState().addConversation({
      id: 'conversation-work',
      remoteIdentityId: 'remote-work',
      remoteWalletAddress: 'exo1alex',
      createdAt: 1,
      unreadCount: 0,
    })

    useChatStore.getState().setStorageScope('exo1friends')
    useChatStore.getState().addConversation({
      id: 'conversation-friends',
      remoteIdentityId: 'remote-friends',
      remoteWalletAddress: 'exo1alex',
      createdAt: 2,
      unreadCount: 0,
    })

    expect(useChatStore.getState().conversations).toEqual([
      expect.objectContaining({ id: 'conversation-work', localWalletAddress: 'exo1work' }),
      expect.objectContaining({ id: 'conversation-friends', localWalletAddress: 'exo1friends' }),
    ])
  })

  it('keeps a just-sent message visible when a pending conversation is rekeyed', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().addConversation({
      id: 'pending_remote-1',
      localWalletAddress: 'exo1work',
      remoteIdentityId: 'remote-1',
      createdAt: 1,
      unreadCount: 0,
    })
    useChatStore.getState().addMessage({
      id: 'message-local',
      conversationId: 'pending_remote-1',
      senderId: 'identity-me',
      localWalletAddress: 'exo1work',
      content: 'hello',
      timestamp: 2,
      status: 'sending',
    })

    const movedMessage = {
      ...useChatStore.getState().messages[0],
      conversationId: 'conversation-real',
    }
    useChatStore.getState().removeConversation('pending_remote-1')
    useChatStore.getState().mergeMessages([movedMessage], 'conversation-real')

    expect(useChatStore.getState().messages).toEqual([
      expect.objectContaining({
        id: 'message-local',
        conversationId: 'conversation-real',
        content: 'hello',
      }),
    ])
  })

  it('migrates swipe preferences when a conversation is rekeyed by merge', async () => {
    mockState.spectreEnabled = true
    const { useChatStore } = await import('./chatStore')
    const scope = 'exo1work'

    useChatStore.getState().setStorageScope(scope)
    useChatStore.getState().addConversation({
      id: 'pending_remote-1',
      localWalletAddress: scope,
      remoteIdentityId: 'remote-1',
      createdAt: 1,
      unreadCount: 0,
    })
    useChatStore.getState().archiveConversation('pending_remote-1')
    useChatStore.getState().togglePinConversation('pending_remote-1')
    useChatStore.getState().toggleManuallyUnread('pending_remote-1')
    useChatStore.getState().toggleMuteConversation('pending_remote-1')

    useChatStore.getState().mergeConversations([
      {
        id: 'conversation-real',
        localWalletAddress: scope,
        remoteIdentityId: 'remote-1',
        remoteWalletAddress: 'exo1remote',
        createdAt: 2,
        unreadCount: 0,
      },
    ])
    await Promise.resolve()

    expect(useChatStore.getState()).toEqual(expect.objectContaining({
      archivedConversationIds: ['conversation-real'],
      pinnedConversationIds: ['conversation-real'],
      manuallyUnreadConversationIds: ['conversation-real'],
      mutedConversationIds: ['conversation-real'],
    }))
    expect(JSON.parse(mockState.storage.get(`exo_archived_conversations:${scope}`) || '[]')).toEqual(['conversation-real'])
    expect(JSON.parse(mockState.storage.get(`exo_pinned_conversations:${scope}`) || '[]')).toEqual(['conversation-real'])
    expect(JSON.parse(mockState.storage.get(`exo_manually_unread_conversations:${scope}`) || '[]')).toEqual(['conversation-real'])
    expect(JSON.parse(mockState.storage.get(`exo_muted_conversations:${scope}`) || '[]')).toEqual(['conversation-real'])
  })

  it('uses the incoming canonical unread projection when merging', async () => {
    const { useChatStore } = await import('./chatStore')
    const scope = 'exo1work'

    useChatStore.getState().setStorageScope(scope)
    useChatStore.getState().addConversation({
      id: 'pending_remote-1',
      localWalletAddress: scope,
      remoteIdentityId: 'remote-1',
      remoteWalletAddress: 'exo1remote',
      createdAt: 1,
      updatedAt: 1,
      unreadCount: 5,
    })
    useChatStore.getState().mergeConversations([{
      id: 'conversation-real',
      localWalletAddress: scope,
      remoteIdentityId: 'remote-1',
      remoteWalletAddress: 'exo1remote',
      createdAt: 1,
      updatedAt: 2,
      unreadCount: 1,
    }])

    expect(useChatStore.getState().conversations).toContainEqual(
      expect.objectContaining({ id: 'conversation-real', unreadCount: 1 }),
    )
    expect(useChatStore.getState().totalUnreadCount).toBe(1)
  })

  it('does not restore a stale deletion marker after availability clears it', async () => {
    const { useChatStore } = await import('./chatStore')
    const scope = 'exo1work'

    useChatStore.getState().setStorageScope(scope)
    useChatStore.getState().addConversation({
      id: 'conversation-remote-1',
      localWalletAddress: scope,
      remoteIdentityId: 'remote-1',
      createdAt: 1,
      updatedAt: 1,
      unreadCount: 0,
      remoteAccountState: 'deleted',
      remoteAccountStateUpdatedAt: 100,
    })
    useChatStore.getState().updateConversation('conversation-remote-1', {
      remoteAccountState: undefined,
      remoteAccountStateUpdatedAt: 200,
    })
    useChatStore.getState().mergeConversations([{
      id: 'conversation-remote-1',
      localWalletAddress: scope,
      remoteIdentityId: 'remote-1',
      createdAt: 1,
      updatedAt: 1,
      unreadCount: 0,
      remoteAccountState: 'deleted',
      remoteAccountStateUpdatedAt: 100,
    }])

    expect(useChatStore.getState().conversations).toContainEqual(
      expect.objectContaining({
        id: 'conversation-remote-1',
        remoteAccountState: undefined,
        remoteAccountStateUpdatedAt: 200,
      }),
    )
  })

  it('keeps a deletion marker through a wallet-authorized identity rotation', async () => {
    const { useChatStore } = await import('./chatStore')
    const scope = 'exo1work'
    const remoteWalletAddress = 'exo1remote'

    useChatStore.getState().setStorageScope(scope)
    useChatStore.getState().addContact({
      identityId: 'remote-old',
      walletAddress: remoteWalletAddress,
      localWalletAddress: scope,
      displayName: 'Remote',
      addedAt: 1,
      remoteAccountState: 'deleted',
      remoteAccountStateUpdatedAt: 100,
    })
    useChatStore.getState().addConversation({
      id: 'conversation-remote',
      localWalletAddress: scope,
      remoteIdentityId: 'remote-old',
      remoteWalletAddress,
      createdAt: 1,
      updatedAt: 1,
      unreadCount: 0,
      remoteAccountState: 'deleted',
      remoteAccountStateUpdatedAt: 100,
    })

    useChatStore.getState().addContact({
      identityId: 'remote-new',
      walletAddress: remoteWalletAddress,
      localWalletAddress: scope,
      displayName: 'Remote',
      addedAt: 1,
    })
    useChatStore.getState().addConversation({
      id: 'conversation-remote-new',
      localWalletAddress: scope,
      remoteIdentityId: 'remote-new',
      remoteWalletAddress,
      createdAt: 2,
      updatedAt: 2,
      unreadCount: 0,
    })

    expect(useChatStore.getState().contacts).toContainEqual(expect.objectContaining({
      identityId: 'remote-new',
      remoteAccountState: 'deleted',
      remoteAccountStateUpdatedAt: 100,
    }))
    expect(useChatStore.getState().conversations).toContainEqual(expect.objectContaining({
      remoteIdentityId: 'remote-new',
      remoteAccountState: 'deleted',
      remoteAccountStateUpdatedAt: 100,
    }))
  })

  it('does not double-count duplicate projections in the aggregate', async () => {
    const { useChatStore } = await import('./chatStore')
    const scope = 'exo1work'

    useChatStore.getState().setStorageScope(scope)
    useChatStore.getState().setConversations([
      {
        id: 'conversation-old',
        localWalletAddress: scope,
        remoteIdentityId: 'remote-old',
        remoteWalletAddress: 'exo1remote',
        createdAt: 1,
        updatedAt: 1,
        unreadCount: 4,
      },
      {
        id: 'conversation-canonical',
        localWalletAddress: scope,
        remoteIdentityId: 'remote-new',
        remoteWalletAddress: 'exo1remote',
        createdAt: 1,
        updatedAt: 2,
        unreadCount: 1,
      },
    ])

    expect(useChatStore.getState().totalUnreadCount).toBe(1)
  })
})

describe('useChatStore scoped contact mutations', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.storage.clear()
    mockState.spectreEnabled = false
  })

  it('updates and removes contacts only within the active local wallet scope', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().setContacts([
      {
        identityId: 'remote-1',
        walletAddress: 'exo1remote',
        localWalletAddress: 'exo1work',
        displayName: 'Work Contact',
      },
      {
        identityId: 'remote-1',
        walletAddress: 'exo1remote',
        localWalletAddress: 'exo1friends',
        displayName: 'Friend Contact',
      },
    ] as any[])

    useChatStore.getState().setStorageScope('exo1work')
    useChatStore.getState().updateContact('remote-1', { isOnline: true })
    useChatStore.getState().batchUpdateContacts([
      { identityId: 'remote-1', changes: { avatarUrl: 'work-avatar.png' } },
    ])

    const workContact = useChatStore.getState().contacts.find(
      (contact) => contact.localWalletAddress === 'exo1work',
    )
    const friendContact = useChatStore.getState().contacts.find(
      (contact) => contact.localWalletAddress === 'exo1friends',
    )

    expect(workContact).toEqual(expect.objectContaining({
      identityId: 'remote-1',
      isOnline: true,
      avatarUrl: 'work-avatar.png',
    }))
    expect(friendContact?.isOnline).toBeUndefined()
    expect(friendContact?.avatarUrl).toBeUndefined()
    expect(useChatStore.getState()._contactsByIdentityId.get('remote-1')).toEqual(workContact)
    expect(useChatStore.getState()._contactsByWalletAddress.get('exo1remote')).toEqual(workContact)

    useChatStore.getState().removeContact('remote-1')

    expect(useChatStore.getState().contacts).toEqual([
      expect.objectContaining({
        identityId: 'remote-1',
        localWalletAddress: 'exo1friends',
      }),
    ])
    expect(useChatStore.getState()._contactsByIdentityId.get('remote-1')).toEqual(
      expect.objectContaining({ localWalletAddress: 'exo1friends' }),
    )
  })
})

describe('useChatStore cached hydration readiness', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.storage.clear()
    mockState.spectreEnabled = false
  })

  it('keeps cached conversations ready while full initialization continues', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().setConversationsReady(true)
    useChatStore.getState().setContactsReady(true)
    useChatStore.getState().setInitializing(true)

    expect(useChatStore.getState()).toEqual(expect.objectContaining({
      conversationsReady: true,
      contactsReady: true,
      isInitializing: true,
    }))
  })

  it('resets local projection readiness only when the wallet scope changes', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().setStorageScope('exo1work')
    useChatStore.getState().setConversationsReady(true)
    useChatStore.getState().setContactsReady(true)
    useChatStore.getState().setStorageScope('exo1work')

    expect(useChatStore.getState()).toEqual(expect.objectContaining({
      conversationsReady: true,
      contactsReady: true,
    }))

    useChatStore.getState().setStorageScope('exo1friends')

    expect(useChatStore.getState()).toEqual(expect.objectContaining({
      conversationsReady: false,
      contactsReady: false,
    }))
  })

  it('does not count local contact hydration as a server profile refresh', async () => {
    const { useChatStore } = await import('./chatStore')
    useChatStore.setState({ _lastContactRefreshAt: 123 })

    useChatStore.getState().setContacts([{
      identityId: 'remote-1',
      walletAddress: 'exo1remote',
      localWalletAddress: 'exo1work',
      displayName: 'Contact',
    }] as any[])

    expect(useChatStore.getState()._lastContactRefreshAt).toBe(123)
  })

  it('does not keep one-time pre-keys in UI contact state', async () => {
    const { useChatStore } = await import('./chatStore')

    useChatStore.getState().addContact({
      identityId: 'remote-1',
      displayName: 'Contact',
      addedAt: 1,
      publicKeyBundle: {
        identityId: 'remote-1',
        identityKey: 'ik',
        oneTimePreKeys: [{ id: 1 }, { id: 2 }],
      },
    } as any)

    expect(useChatStore.getState().contacts[0]?.publicKeyBundle?.oneTimePreKeys).toEqual([])
  })
})
