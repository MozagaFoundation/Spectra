/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BundleServerRequestError } from '../server'

const localChatStorage: any = {
  updateMessageStatus: vi.fn(),
  getConversation: vi.fn(),
  updateConversation: vi.fn(),
  getMessage: vi.fn(),
  getDecryptedMessage: vi.fn(),
  getMessages: vi.fn(),
  getPublicKeyBundle: vi.fn(),
  storeMessage: vi.fn(),
  storeDecryptedMessage: vi.fn(),
  getRelaySenderBundleAttachState: vi.fn(async () => null),
  storeRelaySenderBundleAttachState: vi.fn(async () => undefined),
  commitOutboundMessage: vi.fn(async (commit: any) => {
    await localChatStorage.storeMessage(commit.message)
    await localChatStorage.updateConversation(
      commit.message.conversationId,
      commit.conversationUpdate,
    )
  }),
}

vi.mock('../storage/local', () => ({
  localChatStorage,
}))

vi.mock('../crypto/utils', () => ({
  generateUUID: vi.fn(() => 'uuid'),
  now: vi.fn(() => 1_717_171_717_000),
  createMessageHash: vi.fn(() => 'hash'),
  hash: vi.fn(() => new Uint8Array([1, 2, 3, 4])),
  stringToBytes: vi.fn((value: string) => new TextEncoder().encode(value)),
  bytesToBase64: vi.fn((bytes: Uint8Array) => Buffer.from(bytes).toString('base64')),
}))

vi.mock('./session', () => ({
  establishSessionAsInitiator: vi.fn(),
  getActiveSessionByRemoteIdentity: vi.fn(),
  prepareSessionMessage: vi.fn(),
  sessionNeedsReestablishment: vi.fn(() => false),
}))

vi.mock('../crypto/sealedEnvelope', () => ({
  isRelayDeliveryToken: vi.fn((value: unknown) => (
    typeof value === 'string' && value.startsWith('sdv1.')
  )),
  sealRelayEnvelope: vi.fn((params: any) => ({
    recipientMailboxToken: params.recipientMailboxToken ?? 'smbx1.default',
    deliveryToken: `sdv1.${'A'.repeat(43)}=`,
    deliveryClass: 'message',
    pushNotificationEnabled: true,
    sealedEnvelope: { type: 'message', version: 1 },
  })),
}))

describe('ConversationHandle read propagation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localChatStorage.updateMessageStatus.mockResolvedValue(undefined)
    localChatStorage.getConversation.mockResolvedValue({ unreadCount: 2 })
    localChatStorage.updateConversation.mockResolvedValue(undefined)
  })

  it('marks relay rows read instead of sending control receipts', async () => {
    const { ConversationHandle } = await import('./conversationHandle')

    const markRelayMessageRead = vi.fn(async () => true)
    const handle = new ConversationHandle(
      {
        on: vi.fn(() => () => {}),
        areReadReceiptsEnabled: vi.fn(() => true),
        markRelayMessageRead,
      } as any,
      {
        id: 'conversation-1',
      } as any,
      'session-1',
      { id: 'local-identity' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )

    localChatStorage.getMessages.mockResolvedValue([
      {
        id: 'message-1',
        senderIdentityId: 'remote-identity',
        relayMessageId: 'relay-1',
        content: 'hello',
        status: 'delivered',
        createdAt: 1,
      },
      {
        id: 'message-2',
        senderIdentityId: 'remote-identity',
        relayMessageId: 'relay-2',
        content: '[QCALL:offer]',
        status: 'delivered',
        createdAt: 2,
      },
      {
        id: 'message-3',
        senderIdentityId: 'remote-identity',
        status: 'delivered',
        createdAt: 3,
      },
      {
        id: 'message-4',
        senderIdentityId: 'remote-identity',
        relayMessageId: 'relay-4',
        messageKind: 'view_once',
        oneTime: { state: 'locked', requiresReveal: true },
        status: 'delivered',
        createdAt: 4,
      },
      {
        id: 'message-5',
        senderIdentityId: 'remote-identity',
        relayMessageId: 'relay-5',
        content: 'already read',
        status: 'read',
        createdAt: 5,
        relayReadReceiptEligible: true,
      },
      {
        id: 'message-6',
        senderIdentityId: 'remote-identity',
        relayMessageId: 'relay-6',
        messageKind: 'hidden_control',
        status: 'delivered',
        createdAt: 6,
      },
    ])

    await handle.markAllAsRead()

    expect(markRelayMessageRead).toHaveBeenCalledTimes(2)
    expect(markRelayMessageRead).toHaveBeenCalledWith('relay-1')
    expect(markRelayMessageRead).toHaveBeenCalledWith('relay-5')
    expect(localChatStorage.updateMessageStatus).toHaveBeenCalledTimes(5)
    expect(localChatStorage.updateMessageStatus).toHaveBeenCalledWith(
      'message-6',
      'read',
      { relayReadReceiptEligible: false },
    )
    expect(localChatStorage.updateConversation).toHaveBeenCalledWith('conversation-1', {
      unreadProjectionDirty: true,
    })
    expect(localChatStorage.updateConversation.mock.invocationCallOrder[0]).toBeLessThan(
      localChatStorage.updateMessageStatus.mock.invocationCallOrder[0],
    )
  })

  it('enqueues every durable read receipt without starving older messages', async () => {
    const { ConversationHandle } = await import('./conversationHandle')
    const markRelayMessageRead = vi.fn(async () => true)
    const handle = new ConversationHandle(
      {
        on: vi.fn(() => () => {}),
        areReadReceiptsEnabled: vi.fn(() => true),
        markRelayMessageRead,
      } as any,
      { id: 'conversation-1' } as any,
      'session-1',
      { id: 'local-identity' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )
    localChatStorage.getMessages.mockResolvedValue(
      Array.from({ length: 30 }, (_, index) => ({
        id: `message-${index}`,
        senderIdentityId: 'remote-identity',
        relayMessageId: `relay-${index}`,
        content: 'already read',
        status: 'read',
        createdAt: index,
        relayReadReceiptEligible: true,
      })),
    )

    await handle.markAllAsRead()

    expect(markRelayMessageRead).toHaveBeenCalledTimes(30)
    expect(markRelayMessageRead).toHaveBeenCalledWith('relay-0')
    expect(markRelayMessageRead).toHaveBeenCalledWith('relay-29')
    expect(localChatStorage.updateMessageStatus).not.toHaveBeenCalled()
  })

  it('does not disclose private or legacy historical reads after receipts are enabled', async () => {
    const { ConversationHandle } = await import('./conversationHandle')
    const markRelayMessageRead = vi.fn(async () => true)
    const handle = new ConversationHandle(
      {
        on: vi.fn(() => () => {}),
        areReadReceiptsEnabled: vi.fn(() => true),
        markRelayMessageRead,
      } as any,
      { id: 'conversation-1' } as any,
      'session-1',
      { id: 'local-identity' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )
    localChatStorage.getMessages.mockResolvedValue([
      {
        id: 'private-read',
        senderIdentityId: 'remote-identity',
        relayMessageId: 'relay-private',
        content: 'private',
        status: 'read',
        createdAt: 1,
        relayReadReceiptEligible: false,
      },
      {
        id: 'legacy-read',
        senderIdentityId: 'remote-identity',
        relayMessageId: 'relay-legacy',
        content: 'legacy',
        status: 'read',
        createdAt: 2,
      },
      {
        id: 'new-read',
        senderIdentityId: 'remote-identity',
        relayMessageId: 'relay-new',
        content: 'new',
        status: 'delivered',
        createdAt: 3,
      },
    ])

    await handle.markAllAsRead()

    expect(markRelayMessageRead).toHaveBeenCalledTimes(1)
    expect(markRelayMessageRead).toHaveBeenCalledWith('relay-new')
    expect(localChatStorage.updateMessageStatus).toHaveBeenCalledWith(
      'new-read',
      'read',
      { relayReadReceiptEligible: true },
    )
  })

  it('records local-only reads as ineligible for later replay', async () => {
    const { ConversationHandle } = await import('./conversationHandle')
    const markRelayMessageRead = vi.fn(async () => true)
    const handle = new ConversationHandle(
      {
        on: vi.fn(() => () => {}),
        areReadReceiptsEnabled: vi.fn(() => true),
        markRelayMessageRead,
      } as any,
      { id: 'conversation-1' } as any,
      'session-1',
      { id: 'local-identity' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )
    localChatStorage.getMessages.mockResolvedValue([{
      id: 'local-only',
      senderIdentityId: 'remote-identity',
      relayMessageId: 'relay-local-only',
      content: 'private',
      status: 'delivered',
      createdAt: 1,
    }])

    await handle.markAllAsRead(false)

    expect(markRelayMessageRead).not.toHaveBeenCalled()
    expect(localChatStorage.updateMessageStatus).toHaveBeenCalledWith(
      'local-only',
      'read',
      { relayReadReceiptEligible: false },
    )
  })

  it('records reads as private while read receipts are disabled', async () => {
    const { ConversationHandle } = await import('./conversationHandle')
    const markRelayMessageRead = vi.fn(async () => true)
    const handle = new ConversationHandle(
      {
        on: vi.fn(() => () => {}),
        areReadReceiptsEnabled: vi.fn(() => false),
        markRelayMessageRead,
      } as any,
      { id: 'conversation-1' } as any,
      'session-1',
      { id: 'local-identity' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )
    localChatStorage.getMessages.mockResolvedValue([{
      id: 'disabled-receipts',
      senderIdentityId: 'remote-identity',
      relayMessageId: 'relay-disabled',
      content: 'private',
      status: 'delivered',
      createdAt: 1,
    }])

    await handle.markAllAsRead()

    expect(markRelayMessageRead).not.toHaveBeenCalled()
    expect(localChatStorage.updateMessageStatus).toHaveBeenCalledWith(
      'disabled-receipts',
      'read',
      { relayReadReceiptEligible: false },
    )
  })
})

describe('ConversationHandle view-once storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localChatStorage.getConversation.mockResolvedValue({
      outgoingSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.storeMessage.mockResolvedValue(undefined)
    localChatStorage.storeDecryptedMessage.mockResolvedValue(undefined)
    localChatStorage.updateConversation.mockResolvedValue(undefined)
  })

  it('stores sealed placeholders for outgoing view-once messages', async () => {
    const { ConversationHandle } = await import('./conversationHandle')
    const sessionModule = await import('./session')

    ;(sessionModule.getActiveSessionByRemoteIdentity as any).mockResolvedValue({ id: 'session-1' })
    ;(sessionModule.prepareSessionMessage as any).mockReturnValue({
      ciphertext: 'ciphertext',
      tag: 'tag',
      nonce: 'nonce',
      signature: 'signature',
      version: 1,
      metadata: {
        messageId: 'message-1',
      },
    })

    const client = {
      on: vi.fn(() => () => {}),
      emit: vi.fn(),
    }

    const handle = new ConversationHandle(
      client as any,
      {
        id: 'conversation-2',
      } as any,
      'session-2',
      { id: 'local-identity', dilithiumPrivateKey: 'dilithium-private' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )

    await handle.sendMessage(
      JSON.stringify({ v: 2, type: 'view_once', kind: 'text', body: 'secret' }),
      {
        messageKind: 'view_once',
        localOrderTimestamp: 1_717_171_717_001,
        disappearing: {
          durationMs: 60_000,
          trigger: 'after_send',
          armedAt: 1_717_171_717_000,
          expiresAt: 1_717_171_777_000,
          expiresFrom: 'after_send',
        },
      },
    )

    expect(localChatStorage.storeMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: undefined,
      messageKind: 'view_once',
      oneTime: expect.objectContaining({
        state: 'locked',
        requiresReveal: true,
      }),
      localOrderTimestamp: 1_717_171_717_001,
      disappearing: expect.objectContaining({ expiresAt: 1_717_171_777_000 }),
    }))
    expect(localChatStorage.storeDecryptedMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: '',
      messageKind: 'view_once',
      oneTime: expect.objectContaining({
        state: 'locked',
        requiresReveal: true,
      }),
      localOrderTimestamp: 1_717_171_717_001,
      disappearing: expect.objectContaining({ expiresAt: 1_717_171_777_000 }),
    }))
    expect(localChatStorage.updateConversation).toHaveBeenCalledWith(
      'conversation-2',
      expect.objectContaining({
        lastMessage: expect.objectContaining({
          content: 'One-time message',
        }),
      }),
    )
  })

  it('stores hidden controls without replacing the visible conversation preview', async () => {
    const { ConversationHandle } = await import('./conversationHandle')
    const sessionModule = await import('./session')
    ;(sessionModule.getActiveSessionByRemoteIdentity as any).mockResolvedValue({ id: 'session-1' })
    ;(sessionModule.prepareSessionMessage as any).mockReturnValue({
      ciphertext: 'ciphertext',
      tag: 'tag',
      nonce: 'nonce',
      signature: 'signature',
      version: 1,
      metadata: { messageId: 'message-hidden' },
    })
    const handle = new ConversationHandle(
      { on: vi.fn(() => () => {}), emit: vi.fn() } as any,
      { id: 'conversation-2' } as any,
      'session-2',
      { id: 'local-identity', dilithiumPrivateKey: 'dilithium-private' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )

    await handle.sendMessage(
      JSON.stringify({ capability: 'A'.repeat(100), v: 2, type: 'ble_route_capability' }),
      { messageKind: 'hidden_control' },
    )

    expect(localChatStorage.storeMessage).toHaveBeenCalledWith(expect.objectContaining({
      messageKind: 'hidden_control',
    }))
    expect(localChatStorage.updateConversation).toHaveBeenCalledWith(
      'conversation-2',
      { outgoingSequenceNumber: 1 },
    )
  })
})

describe('ConversationHandle send ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localChatStorage.storeMessage.mockResolvedValue(undefined)
    localChatStorage.storeDecryptedMessage.mockResolvedValue(undefined)
  })

  it('serializes concurrent sends so outgoing sequence numbers advance', async () => {
    const { ConversationHandle } = await import('./conversationHandle')
    const sessionModule = await import('./session')
    let outgoingSequenceNumber = 0
    const encryptedSequenceNumbers: number[] = []

    localChatStorage.getConversation.mockImplementation(async () => ({
      outgoingSequenceNumber,
      unreadCount: 0,
    }))
    localChatStorage.updateConversation.mockImplementation(async (
      _conversationId: string,
      updates: { outgoingSequenceNumber?: number },
    ) => {
      if (typeof updates.outgoingSequenceNumber === 'number') {
        outgoingSequenceNumber = updates.outgoingSequenceNumber
      }
    })
    ;(sessionModule.getActiveSessionByRemoteIdentity as any).mockResolvedValue({ id: 'session-1' })
    ;(sessionModule.prepareSessionMessage as any).mockImplementation((
      _session: unknown,
      _content: string,
      _privateKey: string,
      sequenceNumber: number,
    ) => {
      encryptedSequenceNumbers.push(sequenceNumber)
      return {
        ciphertext: `ciphertext-${sequenceNumber}`,
        tag: 'tag',
        nonce: 'nonce',
        signature: 'signature',
        version: 1,
        metadata: {
          messageId: `message-${sequenceNumber}`,
        },
      }
    })

    const handle = new ConversationHandle(
      { on: vi.fn(() => () => {}), emit: vi.fn() } as any,
      {
        id: 'conversation-queued',
      } as any,
      'session-1',
      { id: 'local-identity', dilithiumPrivateKey: 'dilithium-private' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )

    await Promise.all([
      handle.sendMessage('first'),
      handle.sendMessage('second'),
    ])

    expect(encryptedSequenceNumbers).toEqual([0, 1])
    expect(outgoingSequenceNumber).toBe(2)
  })

  it('does not advance the ratchet before the prior outbound commit is durable', async () => {
    const { ConversationHandle } = await import('./conversationHandle')
    const sessionModule = await import('./session')
    const encryptedSequenceNumbers: number[] = []
    let releaseFirstStore: (() => void) | undefined

    localChatStorage.getConversation.mockResolvedValue({
      outgoingSequenceNumber: 0,
      unreadCount: 0,
    })
    localChatStorage.updateConversation.mockResolvedValue(undefined)
    localChatStorage.storeDecryptedMessage.mockResolvedValue(undefined)
    localChatStorage.storeMessage.mockImplementation(async (message: { id: string }) => {
      if (message.id === 'message-0') {
        await new Promise<void>((resolve) => {
          releaseFirstStore = resolve
        })
      }
    })
    ;(sessionModule.getActiveSessionByRemoteIdentity as any).mockResolvedValue({ id: 'session-1' })
    ;(sessionModule.prepareSessionMessage as any).mockImplementation((
      _session: unknown,
      _content: string,
      _privateKey: string,
      sequenceNumber: number,
    ) => {
      encryptedSequenceNumbers.push(sequenceNumber)
      return {
        ciphertext: `ciphertext-${sequenceNumber}`,
        tag: 'tag',
        nonce: 'nonce',
        signature: 'signature',
        version: 1,
        metadata: {
          messageId: `message-${sequenceNumber}`,
        },
      }
    })

    const handle = new ConversationHandle(
      { on: vi.fn(() => () => {}), emit: vi.fn() } as any,
      {
        id: 'conversation-storage',
      } as any,
      'session-1',
      { id: 'local-identity', dilithiumPrivateKey: 'dilithium-private' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )

    const first = handle.sendMessage('first')
    await vi.waitFor(() => {
      expect(releaseFirstStore).toBeDefined()
    })

    const second = handle.sendMessage('second')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(encryptedSequenceNumbers).toEqual([0])

    releaseFirstStore?.()
    await Promise.all([first, second])
    expect(encryptedSequenceNumbers).toEqual([0, 1])
  })

  it('reloads the durable sequence after an outbound commit failure', async () => {
    const { ConversationHandle } = await import('./conversationHandle')
    const sessionModule = await import('./session')
    const encryptedSequenceNumbers: number[] = []
    let outgoingSequenceNumber = 0
    localChatStorage.getConversation.mockImplementation(async () => ({
      outgoingSequenceNumber,
      unreadCount: 0,
    }))
    localChatStorage.updateConversation.mockImplementation(async (
      _conversationId: string,
      updates: { outgoingSequenceNumber?: number },
    ) => {
      if (typeof updates.outgoingSequenceNumber === 'number') {
        outgoingSequenceNumber = updates.outgoingSequenceNumber
      }
    })
    localChatStorage.commitOutboundMessage.mockRejectedValueOnce(
      new Error('commit interrupted'),
    )
    ;(sessionModule.getActiveSessionByRemoteIdentity as any).mockResolvedValue({
      id: 'session-1',
    })
    ;(sessionModule.prepareSessionMessage as any).mockImplementation((
      _session: unknown,
      _content: string,
      _privateKey: string,
      sequenceNumber: number,
    ) => {
      encryptedSequenceNumbers.push(sequenceNumber)
      return {
        ciphertext: `ciphertext-${sequenceNumber}`,
        tag: 'tag',
        nonce: 'nonce',
        signature: 'signature',
        version: 1,
        metadata: { messageId: `message-retry-${encryptedSequenceNumbers.length}` },
      }
    })
    const handle = new ConversationHandle(
      { on: vi.fn(() => () => {}), emit: vi.fn() } as any,
      { id: 'conversation-retry' } as any,
      'session-1',
      { id: 'local-identity', dilithiumPrivateKey: 'dilithium-private' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )

    await expect(handle.sendMessage('first')).rejects.toThrow('commit interrupted')
    await expect(handle.sendMessage('second')).resolves.toBeDefined()

    expect(encryptedSequenceNumbers).toEqual([0, 0])
    expect(outgoingSequenceNumber).toBe(1)
  })
})

describe('ConversationHandle relay outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an explicit relay failure outcome when sealed relay is unavailable', async () => {
    const { ConversationHandle } = await import('./conversationHandle')

    const relaySpanEnd = vi.fn()
    const linkLocalMessageToRelay = vi.fn(async () => {})
    const client = {
      on: vi.fn(() => () => {}),
      recordDiagnostic: vi.fn(),
      startSpan: vi.fn(() => ({ end: relaySpanEnd })),
      getBundleServer: vi.fn(() => ({
        isAvailable: () => true,
      })),
      getPublicKeyBundle: vi.fn(async () => null),
      linkLocalMessageToRelay,
      isTorEnabled: vi.fn(() => false),
    }

    const handle = new ConversationHandle(
      client as any,
      {
        id: 'conversation-2',
      } as any,
      'session-2',
      { id: 'local-identity' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )

    ;(handle as any).prepareAndPersistMessage = vi.fn(async (
      _content: string,
      _options: unknown,
      transform?: (prepared: any) => Promise<any>,
    ) => {
      const prepared = {
        decrypted: { id: 'message-1' },
        encrypted: { metadata: { messageId: 'message-1' } },
        message: { id: 'message-1' },
        conversationUpdate: {},
      }
      return transform ? transform(prepared) : prepared
    })

    const result = await handle.sendMessageViaRelay('hello', {
      attachmentTrace: {
        attachmentSendId: 'attach:1',
        sendStartedAt: 123,
        attachmentCount: 1,
      },
    })

    expect(result).toEqual({
      decrypted: { id: 'message-1' },
      encrypted: { metadata: { messageId: 'message-1' } },
      relayAccepted: false,
      relayError: 'Sealed relay is required for direct messages',
      relayFailureReason: undefined,
      relayStatusCode: undefined,
      relayTransient: undefined,
    })
    expect(linkLocalMessageToRelay).not.toHaveBeenCalled()
    expect(relaySpanEnd).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'message-1',
        relayed: false,
        error: true,
      }),
    )
    expect(client.recordDiagnostic).toHaveBeenCalledWith(
      'send',
      'attachment_pipeline',
      expect.objectContaining({
        stage: 'relay_accept_failed',
        attachmentSendId: 'attach:1',
        attachmentCount: 1,
        messageId: 'message-1',
        failureReason: 'Sealed relay is required for direct messages',
      }),
    )
  })

  it('commits ratchet, message, and outbox before starting relay I/O', async () => {
    const { ConversationHandle } = await import('./conversationHandle')
    const sessionModule = await import('./session')
    const sendSealedMessage = vi.fn(async () => ({
      id: 'relay-committed',
      serverSequence: 10,
      recipientMailboxToken: 'smbx1.default',
      deliveryClass: 'message',
      sealedEnvelope: { type: 'message', version: 1 },
      status: 'pending',
      createdAt: 1,
      expiresAt: 2,
    }))
    let releaseCommit: (() => void) | undefined
    localChatStorage.getConversation.mockResolvedValue({
      outgoingSequenceNumber: 0,
    })
    localChatStorage.getPublicKeyBundle.mockResolvedValue(null)
    localChatStorage.commitOutboundMessage.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseCommit = resolve
      })
    })
    ;(sessionModule.getActiveSessionByRemoteIdentity as any).mockResolvedValue({
      id: 'session-committed',
      state: {},
    })
    ;(sessionModule.prepareSessionMessage as any).mockReturnValue({
      ciphertext: 'ciphertext',
      tag: 'tag',
      nonce: 'nonce',
      signature: 'signature',
      version: 1,
      metadata: { messageId: 'message-committed' },
    })
    const client = {
      on: vi.fn(() => () => {}),
      emit: vi.fn(),
      getTrackedIdentity: vi.fn(() => null),
      recordDiagnostic: vi.fn(),
      startSpan: vi.fn(() => ({ end: vi.fn() })),
      getBundleServer: vi.fn(() => ({
        isAvailable: () => true,
        sendSealedMessage,
      })),
      getPublicKeyBundle: vi.fn(async () => null),
      getScopedMailboxTokenForRecipient: vi.fn(async () => undefined),
      linkLocalMessageToRelay: vi.fn(async () => {}),
      isTorEnabled: vi.fn(() => false),
    }
    const handle = new ConversationHandle(
      client as any,
      { id: 'conversation-committed' } as any,
      'session-committed',
      {
        id: 'local-identity',
        dilithiumPrivateKey: 'dilithium-private',
      } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )

    const send = handle.sendMessageViaRelay('committed')
    await vi.waitFor(() => {
      expect(localChatStorage.commitOutboundMessage).toHaveBeenCalledOnce()
    })
    expect(sendSealedMessage).not.toHaveBeenCalled()
    expect(localChatStorage.commitOutboundMessage).toHaveBeenCalledWith({
      session: expect.objectContaining({ id: 'session-committed' }),
      message: expect.objectContaining({
        id: 'message-committed',
        relayDeliveryOutbox: expect.objectContaining({
          attemptCount: 1,
        }),
      }),
      conversationUpdate: expect.objectContaining({
        outgoingSequenceNumber: 1,
      }),
    })

    releaseCommit?.()
    await expect(send).resolves.toEqual(expect.objectContaining({
      relayAccepted: true,
    }))
    expect(sendSealedMessage).toHaveBeenCalledOnce()
  })

  it('addresses sealed relay records to the registered scoped mailbox token when available', async () => {
    const { ConversationHandle } = await import('./conversationHandle')
    const { sealRelayEnvelope } = await import('../crypto/sealedEnvelope')

    const sendSealedMessage = vi.fn(async () => ({
      id: 'relay-scoped',
      serverSequence: 12,
      recipientMailboxToken: 'smbx2.registered-recipient-token',
      deliveryClass: 'message',
      sealedEnvelope: { type: 'message', version: 1 },
      status: 'pending',
      createdAt: 1,
      expiresAt: 2,
    }))
    const client = {
      on: vi.fn(() => () => {}),
      recordDiagnostic: vi.fn(),
      startSpan: vi.fn(() => ({ end: vi.fn() })),
      getBundleServer: vi.fn(() => ({
        isAvailable: () => true,
        sendSealedMessage,
      })),
      getPublicKeyBundle: vi.fn(async () => ({
        identityId: 'local-identity',
        identityKey: 'local-identity-key',
        mlkemIdentityKey: 'local-mlkem-key',
        dilithiumKey: 'local-dilithium-key',
        signedPreKey: {},
        oneTimePreKeys: [],
        version: 1,
        timestamp: 1,
      })),
      getScopedMailboxTokenForRecipient: vi.fn(async () => 'smbx2.registered-recipient-token'),
      stageLocalMessageRelayDelivery: vi.fn(async (_messageId: string, record: unknown) => record),
      linkLocalMessageToRelay: vi.fn(async () => {}),
      isTorEnabled: vi.fn(() => false),
    }

    localChatStorage.getPublicKeyBundle.mockResolvedValue({
      identityId: 'remote-identity',
      identityKey: 'remote-identity-key',
      mlkemIdentityKey: 'remote-mlkem-key',
      dilithiumKey: 'remote-dilithium-key',
      signedPreKey: {},
      oneTimePreKeys: [],
      version: 1,
      timestamp: 1,
    })

    const handle = new ConversationHandle(
      client as any,
      { id: 'conversation-scoped' } as any,
      'session-scoped',
      { id: 'local-identity' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )
    ;(handle as any).prepareAndPersistMessage = vi.fn(async (
      _content: string,
      _options: unknown,
      transform?: (prepared: any) => Promise<any>,
    ) => {
      const prepared = {
        decrypted: { id: 'message-scoped' },
        encrypted: { metadata: { messageId: 'message-scoped' } },
        message: {
          id: 'message-scoped',
          conversationId: 'conversation-scoped',
          senderId: 'local-identity',
          senderIdentityId: 'local-identity',
          recipientIdentityId: 'remote-identity',
          encryptedData: { metadata: { messageId: 'message-scoped' } },
          status: 'sent',
          createdAt: 1,
        },
        conversationUpdate: {},
      }
      const persistable = transform ? await transform(prepared) : prepared
      await localChatStorage.storeMessage(persistable.message)
      return persistable
    })

    const result = await handle.sendMessageViaRelay('hello scoped')

    expect(result.relayAccepted, result.relayError).toBe(true)
    expect(client.getScopedMailboxTokenForRecipient).toHaveBeenCalledWith(
      expect.objectContaining({ identityId: 'remote-identity' }),
    )
    expect(sealRelayEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientMailboxToken: 'smbx2.registered-recipient-token',
      }),
    )
    expect(sendSealedMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientMailboxToken: 'smbx2.registered-recipient-token',
      }),
    )
    expect(client.linkLocalMessageToRelay).toHaveBeenCalledWith(
      'message-scoped',
      'relay-scoped',
      `sdv1.${'A'.repeat(43)}=`,
    )
    expect(localChatStorage.storeMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: 'message-scoped',
      relayDeliveryToken: `sdv1.${'A'.repeat(43)}=`,
      relayDeliveryOutbox: expect.objectContaining({
        attemptCount: 1,
        record: expect.objectContaining({
          deliveryToken: `sdv1.${'A'.repeat(43)}=`,
        }),
      }),
    }))
    expect(client.stageLocalMessageRelayDelivery).not.toHaveBeenCalled()
    expect(result.relayed).toEqual(expect.objectContaining({
      deliveryToken: `sdv1.${'A'.repeat(43)}=`,
    }))
    expect(client.recordDiagnostic).toHaveBeenCalledWith(
      'send',
      'relay_send_success',
      expect.objectContaining({ scopedMailbox: true }),
    )
  })

  it('reuses the stored sealed outbox record when retrying a failed relay message', async () => {
    const { ConversationHandle } = await import('./conversationHandle')

    const sendSealedMessage = vi.fn(async () => ({
      id: 'relay-retry',
      serverSequence: 14,
      recipientMailboxToken: 'smbx1.default',
      deliveryClass: 'message',
      sealedEnvelope: { type: 'message', version: 1 },
      status: 'pending',
      createdAt: 1,
      expiresAt: 2,
    }))
    const client = {
      on: vi.fn(() => () => {}),
      getBundleServer: vi.fn(() => ({
        isAvailable: () => true,
        sendSealedMessage,
      })),
      getPublicKeyBundle: vi.fn(async () => null),
      getScopedMailboxTokenForRecipient: vi.fn(async () => undefined),
      stageLocalMessageRelayDelivery: vi.fn(async (_messageId: string, record: unknown) => record),
      linkLocalMessageToRelay: vi.fn(async () => {}),
    }

    const outboxRecord = {
      recipientMailboxToken: 'smbx2.original-recipient-token',
      deliveryToken: 'delivery-token',
      deliveryClass: 'message',
      pushNotificationEnabled: true,
      sealedEnvelope: { type: 'message', version: 1 },
    }
    localChatStorage.getMessage.mockResolvedValue({
      id: 'message-retry',
      conversationId: 'conversation-retry',
      senderId: 'local-identity',
      senderIdentityId: 'local-identity',
      recipientIdentityId: 'remote-identity',
      encryptedData: { metadata: { messageId: 'message-retry' } },
      relayDeliveryToken: 'delivery-token',
      relayDeliveryOutbox: {
        record: outboxRecord,
        attemptCount: 1,
        createdAt: 100,
        lastAttemptAt: 100,
      },
      content: 'hello',
      status: 'failed',
      createdAt: 1_717_171_717_000,
    })
    localChatStorage.getDecryptedMessage.mockResolvedValue({
      id: 'message-retry',
      conversationId: 'conversation-retry',
      senderId: 'local-identity',
      content: 'hello',
      timestamp: 1_717_171_717_000,
      signatureVerified: true,
      status: 'failed',
    })
    localChatStorage.updateMessageStatus.mockResolvedValue(undefined)
    localChatStorage.getPublicKeyBundle.mockResolvedValue(null)

    const handle = new ConversationHandle(
      client as any,
      { id: 'conversation-retry' } as any,
      'session-retry',
      { id: 'local-identity' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )

    await handle.resendMessageViaRelay('message-retry')

    expect(client.linkLocalMessageToRelay).toHaveBeenCalledWith(
      'message-retry',
      'relay-retry',
      'delivery-token',
    )
    const { sealRelayEnvelope } = await import('../crypto/sealedEnvelope')
    expect(sealRelayEnvelope).not.toHaveBeenCalled()
    expect(sendSealedMessage).toHaveBeenCalledWith(outboxRecord)
  })

  it('keeps a transient relay retry pending for idempotent recovery', async () => {
    const { ConversationHandle } = await import('./conversationHandle')
    const outboxRecord = {
      recipientMailboxToken: 'smbx2.original-recipient-token',
      deliveryToken: `sdv1.${'A'.repeat(43)}=`,
      deliveryClass: 'message',
      pushNotificationEnabled: true,
      sealedEnvelope: { type: 'message', version: 1 },
    }
    const sendSealedMessage = vi.fn(async () => {
      throw new BundleServerRequestError('Backend bundle request timed out', {
        reason: 'timeout',
      })
    })
    const client = {
      on: vi.fn(() => () => {}),
      getBundleServer: vi.fn(() => ({
        isAvailable: () => true,
        sendSealedMessage,
      })),
      stageLocalMessageRelayDelivery: vi.fn(async (_messageId: string, record: unknown) => record),
      linkLocalMessageToRelay: vi.fn(async () => {}),
    }
    localChatStorage.getMessage.mockResolvedValue({
      id: 'message-transient',
      conversationId: 'conversation-retry',
      senderId: 'local-identity',
      senderIdentityId: 'local-identity',
      recipientIdentityId: 'remote-identity',
      encryptedData: { metadata: { messageId: 'message-transient' } },
      relayDeliveryToken: outboxRecord.deliveryToken,
      relayDeliveryOutbox: {
        record: outboxRecord,
        attemptCount: 1,
        createdAt: 100,
        lastAttemptAt: 100,
      },
      status: 'sending',
      createdAt: 1_717_171_717_000,
    })
    localChatStorage.getDecryptedMessage.mockResolvedValue(null)
    localChatStorage.updateMessageStatus.mockResolvedValue(undefined)
    const handle = new ConversationHandle(
      client as any,
      { id: 'conversation-retry' } as any,
      'session-retry',
      { id: 'local-identity' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )

    const result = await handle.resendMessageViaRelay('message-transient')

    expect(result).toEqual(expect.objectContaining({
      relayAccepted: false,
      relayTransient: true,
      relayFailureReason: 'timeout',
    }))
    expect(localChatStorage.updateMessageStatus).toHaveBeenLastCalledWith(
      'message-transient',
      'sending',
    )
    expect(localChatStorage.updateMessageStatus).not.toHaveBeenCalledWith(
      'message-transient',
      'failed',
    )
    expect(client.linkLocalMessageToRelay).not.toHaveBeenCalled()
  })

  it('preserves an unavailable-recipient relay failure for product handling', async () => {
    const { ConversationHandle } = await import('./conversationHandle')
    const outboxRecord = {
      recipientMailboxToken: 'smbx2.original-recipient-token',
      deliveryToken: `sdv1.${'A'.repeat(43)}=`,
      deliveryClass: 'message',
      pushNotificationEnabled: true,
      sealedEnvelope: { type: 'message', version: 1 },
    }
    const sendSealedMessage = vi.fn(async () => {
      throw new BundleServerRequestError('recipient_unavailable', {
        reason: 'recipient_unavailable',
        statusCode: 410,
      })
    })
    const client = {
      on: vi.fn(() => () => {}),
      getBundleServer: vi.fn(() => ({
        isAvailable: () => true,
        sendSealedMessage,
      })),
      stageLocalMessageRelayDelivery: vi.fn(async (_messageId: string, record: unknown) => record),
      linkLocalMessageToRelay: vi.fn(async () => {}),
    }
    localChatStorage.getMessage.mockResolvedValue({
      id: 'message-unavailable',
      conversationId: 'conversation-retry',
      senderId: 'local-identity',
      senderIdentityId: 'local-identity',
      recipientIdentityId: 'remote-identity',
      encryptedData: { metadata: { messageId: 'message-unavailable' } },
      relayDeliveryToken: outboxRecord.deliveryToken,
      relayDeliveryOutbox: {
        record: outboxRecord,
        attemptCount: 1,
        createdAt: 100,
        lastAttemptAt: 100,
      },
      status: 'sending',
      createdAt: 1_717_171_717_000,
    })
    localChatStorage.getDecryptedMessage.mockResolvedValue(null)
    localChatStorage.updateMessageStatus.mockResolvedValue(undefined)
    const handle = new ConversationHandle(
      client as any,
      { id: 'conversation-retry' } as any,
      'session-retry',
      { id: 'local-identity' } as any,
      {} as any,
      { id: 'remote-identity' } as any,
    )

    await expect(handle.resendMessageViaRelay('message-unavailable')).resolves.toEqual(
      expect.objectContaining({
        relayAccepted: false,
        relayFailureReason: 'recipient_unavailable',
        relayStatusCode: 410,
        relayTransient: false,
      }),
    )
    expect(localChatStorage.updateMessageStatus).toHaveBeenLastCalledWith(
      'message-unavailable',
      'failed',
    )
  })
})

describe('ConversationHandle relay sender bundle attach', () => {
  function createLocalBundle(overrides: Record<string, unknown> = {}) {
    return {
      identityId: 'local-identity',
      identityKey: 'local-identity-key',
      mlkemIdentityKey: 'local-mlkem-key',
      dilithiumKey: 'local-dilithium-key',
      signedPreKey: {
        id: 1,
        signature: 'spk-sig',
        x25519PublicKey: 'spk-x',
        mlkemPublicKey: 'spk-m',
        timestamp: 1_717_171_700_000,
      },
      oneTimePreKeys: [{ id: 99, x25519PublicKey: 'opk-x', mlkemPublicKey: 'opk-m' }],
      version: 1,
      timestamp: 1_717_171_700_000,
      ...overrides,
    }
  }

  async function sendWithBundle(
    handle: any,
    encrypted: Record<string, unknown> = { metadata: { messageId: 'message-attach' } },
  ) {
    handle.prepareAndPersistMessage = vi.fn(async (
      _content: string,
      _options: unknown,
      transform?: (prepared: any) => Promise<any>,
    ) => {
      const prepared = {
        decrypted: { id: 'message-attach' },
        encrypted,
        message: {
          id: 'message-attach',
          conversationId: 'conversation-attach',
          senderId: 'local-identity',
          senderIdentityId: 'local-identity',
          recipientIdentityId: 'remote-identity',
          encryptedData: encrypted,
          status: 'sent',
          createdAt: 1,
        },
        conversationUpdate: {},
      }
      const persistable = transform ? await transform(prepared) : prepared
      await localChatStorage.storeMessage(persistable.message)
      return persistable
    })
    return handle.sendMessageViaRelay('hello')
  }

  async function createAttachHandle(getPublicKeyBundle = vi.fn(async () => createLocalBundle())) {
    const { ConversationHandle } = await import('./conversationHandle')
    const client = {
      on: vi.fn(() => () => {}),
      recordDiagnostic: vi.fn(),
      startSpan: vi.fn(() => ({ end: vi.fn() })),
      getBundleServer: vi.fn(() => ({
        isAvailable: () => true,
        sendSealedMessage: vi.fn(async () => ({
          id: 'relay-attach',
          serverSequence: 1,
          recipientMailboxToken: 'smbx1.default',
          deliveryClass: 'message',
          sealedEnvelope: { type: 'message', version: 1 },
          status: 'pending',
          createdAt: 1,
          expiresAt: 2,
        })),
      })),
      getPublicKeyBundle,
      getScopedMailboxTokenForRecipient: vi.fn(async () => undefined),
      stageLocalMessageRelayDelivery: vi.fn(async (_messageId: string, record: unknown) => record),
      linkLocalMessageToRelay: vi.fn(async () => {}),
      isTorEnabled: vi.fn(() => false),
    }
    return {
      getPublicKeyBundle,
      handle: new ConversationHandle(
        client as any,
        { id: 'conversation-attach' } as any,
        'session-attach',
        { id: 'local-identity' } as any,
        {} as any,
        { id: 'remote-identity' } as any,
      ),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localChatStorage.getRelaySenderBundleAttachState.mockResolvedValue(null)
    localChatStorage.storeRelaySenderBundleAttachState.mockResolvedValue(undefined)
    localChatStorage.getPublicKeyBundle.mockResolvedValue(null)
    localChatStorage.storeMessage.mockResolvedValue(undefined)
  })

  it('attaches a compact sender bundle on first contact', async () => {
    const { sealRelayEnvelope } = await import('../crypto/sealedEnvelope')
    const { handle } = await createAttachHandle()
    await sendWithBundle(handle)

    expect(sealRelayEnvelope).toHaveBeenCalledWith(expect.objectContaining({
      senderBundle: expect.objectContaining({
        identityId: 'local-identity',
        oneTimePreKeys: [],
      }),
    }))
    expect(localChatStorage.storeRelaySenderBundleAttachState).toHaveBeenCalledWith(
      'local-identity',
      'remote-identity',
      expect.objectContaining({
        fingerprint: expect.any(String),
        attachedAt: 1_717_171_717_000,
      }),
    )
  })

  it('omits the sender bundle on an established follow-up', async () => {
    const { sealRelayEnvelope } = await import('../crypto/sealedEnvelope')
    const { handle } = await createAttachHandle()

    await sendWithBundle(handle)
    const stored = localChatStorage.storeRelaySenderBundleAttachState.mock.calls[0][2]
    localChatStorage.getRelaySenderBundleAttachState.mockResolvedValue(stored)
    vi.mocked(sealRelayEnvelope).mockClear()
    localChatStorage.storeRelaySenderBundleAttachState.mockClear()

    await sendWithBundle(handle, { metadata: { messageId: 'message-follow-up' } })

    expect(sealRelayEnvelope).toHaveBeenCalledWith(expect.objectContaining({
      senderBundle: undefined,
    }))
    expect(localChatStorage.storeRelaySenderBundleAttachState).not.toHaveBeenCalled()
  })

  it('reattaches the sender bundle for an X3DH introduce', async () => {
    const { sealRelayEnvelope } = await import('../crypto/sealedEnvelope')
    localChatStorage.getRelaySenderBundleAttachState.mockResolvedValue({
      fingerprint: 'stale-fingerprint',
      attachedAt: 1_717_171_717_000,
    })
    const { handle } = await createAttachHandle()

    await sendWithBundle(handle, {
      metadata: { messageId: 'message-x3dh' },
      x3dhData: { identityKey: 'ik' },
    })

    expect(sealRelayEnvelope).toHaveBeenCalledWith(expect.objectContaining({
      senderBundle: expect.objectContaining({ identityId: 'local-identity' }),
    }))
  })

  it('reattaches the sender bundle after signed pre-key rotation', async () => {
    const { sealRelayEnvelope } = await import('../crypto/sealedEnvelope')
    const getPublicKeyBundle = vi.fn(async () => createLocalBundle())
    const { handle } = await createAttachHandle(getPublicKeyBundle)

    await sendWithBundle(handle)
    const stored = localChatStorage.storeRelaySenderBundleAttachState.mock.calls[0][2]
    localChatStorage.getRelaySenderBundleAttachState.mockResolvedValue(stored)
    getPublicKeyBundle.mockResolvedValue(createLocalBundle({
      signedPreKey: {
        id: 2,
        signature: 'spk-sig-2',
        x25519PublicKey: 'spk-x-2',
        mlkemPublicKey: 'spk-m-2',
        timestamp: 1_717_171_800_000,
      },
    }))
    vi.mocked(sealRelayEnvelope).mockClear()

    await sendWithBundle(handle, { metadata: { messageId: 'message-rotated' } })

    expect(sealRelayEnvelope).toHaveBeenCalledWith(expect.objectContaining({
      senderBundle: expect.objectContaining({
        signedPreKey: expect.objectContaining({ id: 2 }),
        oneTimePreKeys: [],
      }),
    }))
  })

  it('reattaches the sender bundle after the last attach goes stale', async () => {
    const { sealRelayEnvelope } = await import('../crypto/sealedEnvelope')
    const { RELAY_SENDER_BUNDLE_REATTACH_AFTER_MS } = await import('./transportBundle')
    const { handle } = await createAttachHandle()

    await sendWithBundle(handle)
    const stored = localChatStorage.storeRelaySenderBundleAttachState.mock.calls[0][2]
    localChatStorage.getRelaySenderBundleAttachState.mockResolvedValue({
      ...stored,
      attachedAt: stored.attachedAt - RELAY_SENDER_BUNDLE_REATTACH_AFTER_MS,
    })
    vi.mocked(sealRelayEnvelope).mockClear()

    await sendWithBundle(handle, { metadata: { messageId: 'message-stale' } })

    expect(sealRelayEnvelope).toHaveBeenCalledWith(expect.objectContaining({
      senderBundle: expect.objectContaining({ identityId: 'local-identity' }),
    }))
  })
})
