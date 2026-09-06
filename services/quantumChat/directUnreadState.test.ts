/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const storage = {
  conversation: null as any,
  messages: [] as any[],
  getConversation: vi.fn(async () => storage.conversation),
  getConversations: vi.fn(async () => storage.conversation ? [storage.conversation] : []),
  getMessage: vi.fn(async (id: string) => (
    storage.messages.find((message) => message.id === id) ?? null
  )),
  getMessages: vi.fn(async () => storage.messages),
  rekeyConversation: vi.fn(async (_sourceId: string, targetId: string) => {
    storage.messages = storage.messages.map((message) => ({
      ...message,
      conversationId: targetId,
    }))
  }),
  storeConversation: vi.fn(async (conversation: any) => {
    storage.conversation = conversation
  }),
  updateMessageStatus: vi.fn(async (
    id: string,
    status: string,
    options?: { relayReadReceiptEligible?: boolean },
  ) => {
    storage.messages = storage.messages.map((message) =>
      message.id === id
        ? {
            ...message,
            status,
            ...(status === 'read'
              && message.status !== 'read'
              && message.relayReadReceiptEligible === undefined
              && options?.relayReadReceiptEligible !== undefined
              ? { relayReadReceiptEligible: options.relayReadReceiptEligible }
              : {}),
          }
        : message
    )
  }),
  updateConversation: vi.fn(async (_id: string, updates: Record<string, unknown>) => {
    storage.conversation = { ...storage.conversation, ...updates }
  }),
  deleteMessage: vi.fn(async (id: string) => {
    storage.messages = storage.messages.filter((message) => message.id !== id)
  }),
  deleteDecryptedMessage: vi.fn(async () => {}),
}

const chatState = {
  conversations: [] as any[],
  updateConversation: vi.fn((id: string, updates: Record<string, unknown>) => {
    chatState.conversations = chatState.conversations.map((conversation) =>
      conversation.id === id ? { ...conversation, ...updates } : conversation
    )
  }),
}

let activeWalletAddress = 'exo1local'

vi.mock('@spectra/core-crypto/storage/local', () => ({
  localChatStorage: storage,
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: {
    getState: () => chatState,
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      wallet: { address: activeWalletAddress },
    }),
  },
}))

function createMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderId: 'remote-identity',
    senderIdentityId: 'remote-identity',
    recipientIdentityId: 'local-identity',
    signatureVerified: true,
    status: 'delivered',
    content: 'hello',
    createdAt: 1,
    ...overrides,
  } as any
}

describe('direct unread reconciliation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activeWalletAddress = 'exo1local'
    storage.conversation = {
      id: 'conversation-1',
      localIdentityId: 'local-identity',
      remoteIdentityId: 'remote-identity',
      unreadCount: 7,
    }
    storage.messages = []
    chatState.conversations = [{
      id: 'conversation-1',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
      remoteIdentityId: 'remote-identity',
      unreadCount: 7,
    }]
  })

  it('never counts own outbound messages as unread', async () => {
    const { deriveDirectUnreadCount } = await import('./directUnreadState')

    expect(deriveDirectUnreadCount([
      createMessage({
        senderId: 'local-identity',
        senderIdentityId: 'local-identity',
        recipientIdentityId: 'remote-identity',
      }),
    ], 'local-identity')).toBe(0)
  })

  it('repairs a stale unread badge after three outbound messages and restart', async () => {
    storage.conversation.unreadCount = 3
    storage.messages = Array.from({ length: 3 }, (_, index) => createMessage({
      id: `outbound-${index}`,
      senderId: 'local-identity',
      senderIdentityId: 'local-identity',
      recipientIdentityId: 'remote-identity',
      status: 'sent',
    }))
    const { reconcileDirectUnreadState } = await import('./directUnreadState')

    await expect(reconcileDirectUnreadState({
      conversationId: 'conversation-1',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
    })).resolves.toEqual({ applied: true, unreadCount: 0 })

    expect(storage.conversation.unreadCount).toBe(0)
    expect(chatState.conversations[0].unreadCount).toBe(0)
  })

  it('keeps active foreground incoming messages zero after durable read', async () => {
    storage.messages = [createMessage()]
    const { markDirectMessageReadAndReconcile } = await import('./directUnreadState')

    await expect(markDirectMessageReadAndReconcile({
      messageId: 'message-1',
      conversationId: 'conversation-1',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
    })).resolves.toEqual({ applied: true, unreadCount: 0 })

    expect(storage.updateMessageStatus).toHaveBeenCalledWith('message-1', 'read')
    expect(storage.updateConversation).toHaveBeenNthCalledWith(1, 'conversation-1', {
      unreadProjectionDirty: true,
    })
    expect(storage.updateConversation.mock.invocationCallOrder[0]).toBeLessThan(
      storage.updateMessageStatus.mock.invocationCallOrder[0],
    )
    expect(storage.conversation.unreadCount).toBe(0)
    expect(storage.conversation.unreadProjectionDirty).toBe(false)
    expect(chatState.conversations[0].unreadCount).toBe(0)
  })

  it('preserves first-read receipt privacy during duplicate reconciliation', async () => {
    storage.messages = [createMessage()]
    const { markDirectMessageReadAndReconcile } = await import('./directUnreadState')
    const baseOptions = {
      messageId: 'message-1',
      conversationId: 'conversation-1',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
    }

    await markDirectMessageReadAndReconcile({
      ...baseOptions,
      relayReadReceiptEligible: false,
    })
    await markDirectMessageReadAndReconcile({
      ...baseOptions,
      relayReadReceiptEligible: true,
    })

    expect(storage.messages[0]).toEqual(expect.objectContaining({
      status: 'read',
      relayReadReceiptEligible: false,
    }))
  })

  it('does not count control or call envelopes', async () => {
    const { deriveDirectUnreadCount } = await import('./directUnreadState')
    const messages = [
      createMessage({
        id: 'reaction',
        content: JSON.stringify({
          v: 2,
          type: 'reaction',
          reaction: { targetMessageId: 'message-1', emoji: '👍' },
        }),
      }),
      createMessage({
        id: 'timer',
        content: JSON.stringify({ v: 2, type: 'disappearing_timer', timer: null, updatedAt: 1 }),
      }),
      createMessage({ id: 'call', content: '[QCALL:abc-123:voice:YWJjZA==]' }),
      createMessage({ id: 'hidden', messageKind: 'hidden_control', content: '' }),
    ]

    expect(deriveDirectUnreadCount(messages, 'local-identity')).toBe(0)
  })

  it('removes an authorized deleted message from unread state', async () => {
    const { deriveDirectUnreadCount } = await import('./directUnreadState')
    const target = createMessage({ id: 'target-message' })
    const deletion = createMessage({
      id: 'delete-control',
      content: JSON.stringify({
        v: 2,
        type: 'deletion',
        deletionTarget: 'target-message',
      }),
    })

    expect(deriveDirectUnreadCount([target, deletion], 'local-identity')).toBe(0)
  })

  it('deduplicates replayed messages without incrementing', async () => {
    const { deriveDirectUnreadCount } = await import('./directUnreadState')

    expect(deriveDirectUnreadCount([
      createMessage(),
      createMessage(),
    ], 'local-identity')).toBe(1)
  })

  it('derives a large durable inbox without quadratic work', async () => {
    const { deriveDirectUnreadCount } = await import('./directUnreadState')
    const messages = Array.from({ length: 10_000 }, (_, index) => createMessage({
      id: `message-${index}`,
      createdAt: index,
    }))
    const startedAt = Date.now()

    expect(deriveDirectUnreadCount(messages, 'local-identity')).toBe(10_000)
    expect(Date.now() - startedAt).toBeLessThan(1_000)
  })

  it('fails closed for unverified, deleted, expired, or unavailable content', async () => {
    const { deriveDirectUnreadCount } = await import('./directUnreadState')
    const messages = [
      createMessage({ id: 'visible' }),
      createMessage({ id: 'unverified', signatureVerified: false }),
      createMessage({ id: 'deleted', deleted: true }),
      createMessage({
        id: 'expired',
        disappearing: { durationMs: 10, trigger: 'after_send', expiresAt: 50 },
      }),
      createMessage({
        id: 'unavailable',
        content: undefined,
        localContentUnavailable: true,
      }),
    ]

    expect(deriveDirectUnreadCount(messages, 'local-identity', 100)).toBe(1)
    expect(deriveDirectUnreadCount(messages, null, 100)).toBe(0)
  })

  it('excludes locked deferred view-once placeholders until verified', async () => {
    const { deriveDirectUnreadCount } = await import('./directUnreadState')

    expect(deriveDirectUnreadCount([
      createMessage({
        content: undefined,
        localContentUnavailable: true,
        messageKind: 'view_once',
        oneTime: { state: 'locked', requiresReveal: true },
        signatureVerified: false,
      }),
    ], 'local-identity')).toBe(0)
  })

  it('repairs a legacy projection once and trusts the persisted result', async () => {
    const {
      DIRECT_UNREAD_PROJECTION_VERSION,
      reconcileDirectUnreadState,
    } = await import('./directUnreadState')

    await reconcileDirectUnreadState({
      conversationId: 'conversation-1',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
    })
    await reconcileDirectUnreadState({
      conversationId: 'conversation-1',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
    })

    expect(storage.getMessages).toHaveBeenCalledTimes(1)
    expect(storage.getMessages).toHaveBeenCalledWith('conversation-1', { limit: 400 })
    expect(storage.updateConversation).toHaveBeenCalledTimes(1)
    expect(storage.updateConversation).toHaveBeenCalledWith('conversation-1', {
      unreadCount: 0,
      unreadProjectionVersion: DIRECT_UNREAD_PROJECTION_VERSION,
      unreadProjectionDirty: false,
    })
    expect(chatState.updateConversation).toHaveBeenCalledWith('conversation-1', { unreadCount: 0 })
  })

  it('uses a clean current projection without loading messages', async () => {
    const {
      DIRECT_UNREAD_PROJECTION_VERSION,
      reconcileDirectUnreadState,
    } = await import('./directUnreadState')
    storage.conversation = {
      ...storage.conversation,
      unreadCount: 3,
      unreadProjectionVersion: DIRECT_UNREAD_PROJECTION_VERSION,
      unreadProjectionDirty: false,
    }

    await expect(reconcileDirectUnreadState({
      conversationId: 'conversation-1',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
    })).resolves.toEqual({ applied: true, unreadCount: 3 })

    expect(storage.getMessages).not.toHaveBeenCalled()
    expect(storage.updateConversation).not.toHaveBeenCalled()
    expect(chatState.updateConversation).toHaveBeenCalledWith('conversation-1', { unreadCount: 3 })
  })

  it('repairs and clears a dirty current projection', async () => {
    const {
      DIRECT_UNREAD_PROJECTION_VERSION,
      reconcileDirectUnreadState,
    } = await import('./directUnreadState')
    storage.conversation = {
      ...storage.conversation,
      unreadProjectionVersion: DIRECT_UNREAD_PROJECTION_VERSION,
      unreadProjectionDirty: true,
    }
    storage.messages = [createMessage()]

    await reconcileDirectUnreadState({
      conversationId: 'conversation-1',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
    })

    expect(storage.getMessages).toHaveBeenCalledTimes(1)
    expect(storage.conversation).toEqual(expect.objectContaining({
      unreadCount: 1,
      unreadProjectionVersion: DIRECT_UNREAD_PROJECTION_VERSION,
      unreadProjectionDirty: false,
    }))
  })

  it('marks the projection dirty before deleting durable messages', async () => {
    const { deleteDirectMessagesAndReconcile } = await import('./directUnreadState')
    storage.messages = [createMessage()]

    await deleteDirectMessagesAndReconcile({
      conversationId: 'conversation-1',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
      messageIds: ['message-1'],
    })

    expect(storage.updateConversation).toHaveBeenNthCalledWith(1, 'conversation-1', {
      unreadProjectionDirty: true,
    })
    expect(storage.updateConversation.mock.invocationCallOrder[0]).toBeLessThan(
      storage.deleteMessage.mock.invocationCallOrder[0],
    )
    expect(storage.conversation).toEqual(expect.objectContaining({
      unreadCount: 0,
      unreadProjectionDirty: false,
    }))
  })

  it('keeps a concurrently received message unread while clearing captured messages', async () => {
    storage.messages = [createMessage({ id: 'captured-message' })]
    storage.deleteMessage.mockImplementationOnce(async (id: string) => {
      storage.messages = storage.messages.filter((message) => message.id !== id)
      storage.messages.push(createMessage({ id: 'concurrent-message', createdAt: 2 }))
    })
    const { clearDirectMessagesAndReconcile } = await import('./directUnreadState')

    const result = await clearDirectMessagesAndReconcile({
      conversationId: 'conversation-1',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
    })

    expect(result.deletedMessageIds).toEqual(['captured-message'])
    expect(result.unreadCount).toBe(1)
    expect(storage.messages.map((message) => message.id)).toEqual(['concurrent-message'])
  })

  it('clears the durable preview when no messages remain', async () => {
    storage.messages = [createMessage({ id: 'captured-message' })]
    const { clearDirectMessagesAndReconcile } = await import('./directUnreadState')

    await clearDirectMessagesAndReconcile({
      conversationId: 'conversation-1',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
    })

    expect(storage.updateConversation).toHaveBeenCalledWith('conversation-1', {
      lastMessage: undefined,
      unreadProjectionDirty: true,
    })
  })

  it('coalesces a reconciliation burst into the active pass and one rerun', async () => {
    const {
      DIRECT_UNREAD_PROJECTION_VERSION,
      reconcileDirectUnreadState,
    } = await import('./directUnreadState')
    storage.conversation = {
      ...storage.conversation,
      unreadProjectionVersion: DIRECT_UNREAD_PROJECTION_VERSION,
      unreadProjectionDirty: true,
    }
    storage.messages = [createMessage()]
    let releaseMessages!: (messages: any[]) => void
    storage.getMessages.mockImplementationOnce(() =>
      new Promise<any[]>((resolve) => {
        releaseMessages = resolve
      })
    )

    const active = reconcileDirectUnreadState({
      conversationId: 'conversation-1',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
    })
    await vi.waitFor(() => expect(storage.getMessages).toHaveBeenCalledTimes(1))
    const burst = Array.from({ length: 8 }, () => reconcileDirectUnreadState({
      conversationId: 'conversation-1',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
    }))
    releaseMessages(storage.messages)

    await Promise.all([active, ...burst])

    expect(storage.getConversation).toHaveBeenCalledTimes(2)
    expect(storage.getMessages).toHaveBeenCalledTimes(2)
    expect(storage.updateConversation).toHaveBeenCalledTimes(2)
  })

  it('projects only the canonical target after rekey', async () => {
    storage.conversation = {
      ...storage.conversation,
      id: 'conversation-canonical',
      unreadCount: 9,
    }
    storage.messages = [
      createMessage({ id: 'moved-message', conversationId: 'conversation-canonical' }),
      createMessage({ id: 'existing-message', conversationId: 'conversation-canonical', status: 'read' }),
    ]
    chatState.conversations = [
      {
        id: 'conversation-source',
        localIdentityId: 'local-identity',
        localWalletAddress: 'exo1local',
        remoteIdentityId: 'remote-identity',
        unreadCount: 9,
      },
      {
        id: 'conversation-canonical',
        localIdentityId: 'local-identity',
        localWalletAddress: 'exo1local',
        remoteIdentityId: 'remote-identity',
        unreadCount: 9,
      },
    ]
    const { reconcileDirectUnreadState } = await import('./directUnreadState')

    await reconcileDirectUnreadState({
      conversationId: 'conversation-canonical',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
    })

    expect(chatState.conversations).toEqual([
      expect.objectContaining({ id: 'conversation-source', unreadCount: 9 }),
      expect.objectContaining({ id: 'conversation-canonical', unreadCount: 1 }),
    ])
  })

  it('migrates the legacy identity-keyed message bucket before recounting', async () => {
    storage.messages = [createMessage({ conversationId: 'remote-identity' })]
    const { migrateLegacyDirectMessageBucket } = await import('./directUnreadState')

    await expect(migrateLegacyDirectMessageBucket({
      conversationId: 'conversation-1',
      remoteIdentityId: 'remote-identity',
      localIdentityId: 'local-identity',
      localWalletAddress: 'exo1local',
    })).resolves.toBe(true)

    expect(storage.rekeyConversation).toHaveBeenCalledWith(
      'remote-identity',
      'conversation-1',
    )
    expect(storage.storeConversation).toHaveBeenCalledWith(expect.objectContaining({
      id: 'conversation-1',
      unreadProjectionDirty: true,
    }))
  })
})
