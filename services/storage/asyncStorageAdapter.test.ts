/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type StoredValue = string

const storageState = vi.hoisted(() => ({
  data: new Map<string, StoredValue>(),
  secureStore: new Map<string, string>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => storageState.data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      storageState.data.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      storageState.data.delete(key)
    }),
    getAllKeys: vi.fn(async () => Array.from(storageState.data.keys())),
    multiGet: vi.fn(async (keys: string[]) => keys.map((key) => [key, storageState.data.get(key) ?? null])),
    multiSet: vi.fn(async (entries: [string, string][]) => {
      for (const [key, value] of entries) {
        storageState.data.set(key, value)
      }
    }),
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const key of keys) {
        storageState.data.delete(key)
      }
    }),
  },
}))

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: vi.fn(async (length: number) => new Uint8Array(length).fill(7)),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => storageState.secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    storageState.secureStore.set(key, value)
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    storageState.secureStore.delete(key)
  }),
}))

vi.mock('@spectra/identity-vault', () => ({
  base64ToBytes: vi.fn((value: string) => Uint8Array.from(Buffer.from(value, 'base64'))),
  bytesToBase64: vi.fn((value: Uint8Array) => Buffer.from(value).toString('base64')),
  encrypt: vi.fn((data: string, key: Uint8Array, aad: Uint8Array) => ({
    ciphertext: Buffer.from(JSON.stringify({
      data,
      key: Buffer.from(key).toString('base64'),
      aad: Buffer.from(aad).toString('base64'),
    }), 'utf8').toString('base64'),
    iv: Buffer.from('iv').toString('base64'),
  })),
  decrypt: vi.fn((
    ciphertext: string,
    _iv: string,
    key: Uint8Array,
    aad: Uint8Array,
  ) => {
    const payload = JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf8')) as {
      data: string
      key: string
      aad: string
    }
    if (
      payload.key !== Buffer.from(key).toString('base64')
      || payload.aad !== Buffer.from(aad).toString('base64')
    ) {
      throw new Error('Authentication failed')
    }
    return payload.data
  }),
}))

vi.mock('@spectra/core-crypto', () => ({
  compareMessageStatus: vi.fn((left: string | undefined, right: string | undefined) => {
    const rank: Record<string, number> = { pending: 0, failed: 0, sending: 0, sent: 1, delivered: 2, read: 3 }
    return (rank[left ?? 'pending'] ?? 0) - (rank[right ?? 'pending'] ?? 0)
  }),
  completeRelayDeliveryOutbox: vi.fn((
    message: any,
    relayMessageId: string,
    relayDeliveryToken?: string,
  ) => {
    const completed = {
      ...message,
      relayMessageId,
      ...(relayDeliveryToken !== undefined ? { relayDeliveryToken } : {}),
    }
    delete completed.relayDeliveryOutbox
    return completed
  }),
  serializeSessionState: vi.fn((value: unknown) => value),
  deserializeSessionState: vi.fn((value: unknown) => value),
  hasPendingRelayDelivery: vi.fn((message: any, senderIdentityId: string) => (
    Boolean(
      message
      && message.senderIdentityId === senderIdentityId
      && !message.relayMessageId
      && message.relayDeliveryOutbox?.record?.deliveryToken,
    )
  )),
  shouldSyncOutboundStatus: vi.fn((message: any, senderIdentityId: string) => {
    if (!message || message.senderIdentityId !== senderIdentityId || !message.relayMessageId) return false
    if (message.status === 'sending' || message.status === 'sent') return true
    if (message.status !== 'delivered' || typeof message.deliveredAt !== 'number') return false
    return Date.now() - message.deliveredAt <= 10 * 60 * 1_000
  }),
}))

describe('AsyncStorageAdapter relay linkage', () => {
  beforeEach(() => {
    vi.resetModules()
    storageState.data.clear()
    storageState.secureStore.clear()
  })

  it('links relay ids and filters messages needing status sync', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    await prepareAsyncStorageScope('exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

    await adapter.storeMessage({
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'sender-1',
      senderIdentityId: 'sender-1',
      recipientIdentityId: 'recipient-1',
      relayDeliveryToken: 'delivery-1',
      relayDeliveryOutbox: {
        record: {
          recipientMailboxToken: 'smbx1.recipient',
          deliveryToken: 'delivery-1',
          deliveryClass: 'message',
          sealedEnvelope: {
            version: 1,
            type: 'message',
            senderEphemeralKey: 'ephemeral',
            mlkemCiphertext: 'kem',
            ciphertext: 'ciphertext',
            nonce: 'nonce',
            tag: 'tag',
          },
        },
        attemptCount: 1,
        createdAt: 1,
        lastAttemptAt: 1,
      },
      status: 'sent',
      createdAt: 1,
    })
    expect(
      storageState.data.get(
        'qc_exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa_message_message-1',
      ),
    ).not.toContain('delivery-1')
    await expect(adapter.getPendingRelayDeliveries('sender-1')).resolves.toEqual([
      expect.objectContaining({ id: 'message-1' }),
    ])
    const linkedMessage = await adapter.linkRelayMessage('message-1', 'relay-1', 'delivery-1')
    expect(linkedMessage).not.toHaveProperty('relayDeliveryOutbox')
    await expect(adapter.getPendingRelayDeliveries('sender-1')).resolves.toEqual([])

    await adapter.storeMessage({
      id: 'message-2',
      conversationId: 'conversation-1',
      senderIdentityId: 'sender-1',
      recipientIdentityId: 'recipient-1',
      relayMessageId: 'relay-2',
      status: 'delivered',
      deliveredAt: Date.now(),
      createdAt: 2,
    })
    await adapter.storeMessage({
      id: 'message-stable',
      conversationId: 'conversation-1',
      senderIdentityId: 'sender-1',
      recipientIdentityId: 'recipient-1',
      relayMessageId: 'relay-stable',
      status: 'delivered',
      deliveredAt: Date.now() - 11 * 60 * 1_000,
      createdAt: 3,
    })
    await adapter.storeMessage({
      id: 'message-sending',
      conversationId: 'conversation-1',
      senderIdentityId: 'sender-1',
      recipientIdentityId: 'recipient-1',
      relayMessageId: 'relay-sending',
      status: 'sending',
      createdAt: 4,
    })
    await adapter.storeMessage({
      id: 'message-3',
      conversationId: 'conversation-2',
      senderIdentityId: 'sender-2',
      recipientIdentityId: 'recipient-1',
      relayMessageId: 'relay-3',
      status: 'sent',
      createdAt: 3,
    })

    await expect(adapter.getMessageByRelayId('relay-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'message-1',
        relayMessageId: 'relay-1',
        relayDeliveryToken: 'delivery-1',
      }),
    )

    await expect(adapter.getMessagesNeedingStatusSync('sender-1')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'message-1',
          relayMessageId: 'relay-1',
          relayDeliveryToken: 'delivery-1',
        }),
        expect.objectContaining({ id: 'message-2', relayMessageId: 'relay-2' }),
        expect.objectContaining({ id: 'message-sending', relayMessageId: 'relay-sending' }),
      ]),
    )
    await expect(adapter.getMessagesNeedingStatusSync('sender-1')).resolves.not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'message-stable', relayMessageId: 'relay-stable' }),
      ]),
    )

    await adapter.deleteConversationMessages('conversation-1')
    await expect(adapter.getMessageByRelayId('relay-1')).resolves.toBeNull()
    await expect(adapter.getMessageByRelayId('relay-2')).resolves.toBeNull()
  })

  it('replays a sealed outbound commit journal after a partial batch write', async () => {
    const scope = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const adapter = new AsyncStorageAdapter()
    await prepareAsyncStorageScope(scope)
    await adapter.storeConversation({
      id: 'conversation-commit',
      localIdentityId: 'sender-commit',
      remoteIdentityId: 'recipient-commit',
      outgoingSequenceNumber: 0,
      createdAt: 1,
      updatedAt: 1,
    })

    vi.mocked(AsyncStorage.multiSet).mockImplementationOnce(async (entries) => {
      storageState.data.set(entries[0][0], entries[0][1])
      throw new Error('simulated partial batch')
    })

    await expect(adapter.commitOutboundMessage({
      session: {
        id: 'session-commit',
        localIdentityId: 'sender-commit',
        remoteIdentityId: 'recipient-commit',
        state: { rootKey: 'advanced-session-secret' },
      } as any,
      message: {
        id: 'message-commit',
        conversationId: 'conversation-commit',
        senderId: 'sender-commit',
        senderIdentityId: 'sender-commit',
        recipientIdentityId: 'recipient-commit',
        encryptedData: {
          metadata: { messageId: 'message-commit' },
        },
        relayDeliveryToken: 'outbound-delivery-capability',
        relayDeliveryOutbox: {
          record: {
            recipientMailboxToken: 'smbx1.recipient',
            deliveryToken: 'outbound-delivery-capability',
            deliveryClass: 'message',
            sealedEnvelope: {
              version: 1,
              type: 'message',
              senderEphemeralKey: 'ephemeral',
              mlkemCiphertext: 'kem',
              ciphertext: 'ciphertext',
              nonce: 'nonce',
              tag: 'tag',
            },
          },
          attemptCount: 1,
          createdAt: 2,
          lastAttemptAt: 2,
        },
        status: 'sent',
        createdAt: 2,
      } as any,
      conversationUpdate: {
        outgoingSequenceNumber: 1,
      },
    })).rejects.toThrow('simulated partial batch')

    const walKey = `qc_${scope}_outbound_commit_wal`
    expect(storageState.data.get(walKey)).not.toContain('advanced-session-secret')
    expect(storageState.data.get(walKey)).not.toContain('outbound-delivery-capability')

    await prepareAsyncStorageScope(scope)

    await expect(adapter.getSession('session-commit')).resolves.toEqual(
      expect.objectContaining({
        state: expect.objectContaining({ rootKey: 'advanced-session-secret' }),
      }),
    )
    await expect(adapter.getMessage('message-commit')).resolves.toEqual(
      expect.objectContaining({
        relayDeliveryOutbox: expect.objectContaining({
          record: expect.objectContaining({
            deliveryToken: 'outbound-delivery-capability',
          }),
        }),
      }),
    )
    await expect(adapter.getConversation('conversation-commit')).resolves.toEqual(
      expect.objectContaining({ outgoingSequenceNumber: 1 }),
    )
    expect(storageState.data.has(walKey)).toBe(false)
  })

  it('keeps message status monotonic when stale receipts arrive', async () => {
    const { AsyncStorageAdapter } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()

    await adapter.storeMessage({
      id: 'message-read',
      conversationId: 'conversation-1',
      senderIdentityId: 'sender-1',
      recipientIdentityId: 'recipient-1',
      status: 'read',
      readAt: Date.now(),
      createdAt: 1,
    })

    await adapter.updateMessageStatus('message-read', 'delivered')
    await expect(adapter.getMessage('message-read')).resolves.toEqual(
      expect.objectContaining({ status: 'read' }),
    )
  })

  it('repairs stale status sync indexes after burst writes', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const adapter = new AsyncStorageAdapter()
    await prepareAsyncStorageScope('exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

    await adapter.storeConversation({
      id: 'conversation-burst',
      localIdentityId: 'sender-1',
      remoteIdentityId: 'recipient-1',
      outgoingSequenceNumber: 0,
      createdAt: 1,
      updatedAt: 1,
    })

    for (let index = 0; index < 10; index++) {
      await adapter.storeMessage({
        id: `burst-${index}`,
        conversationId: 'conversation-burst',
        senderIdentityId: 'sender-1',
        recipientIdentityId: 'recipient-1',
        relayMessageId: `relay-${index}`,
        relayDeliveryToken: `delivery-${index}`,
        status: index === 0 ? 'delivered' : 'sent',
        ...(index === 0 ? { deliveredAt: Date.now() } : {}),
        createdAt: index,
      })
    }

    for (const key of Array.from(storageState.data.keys())) {
      if (key.startsWith('qc_status_sync_marker_sender-1_')) {
        storageState.data.delete(key)
      }
    }
    storageState.data.set('qc_status_sync_index_sender-1', JSON.stringify(['burst-0']))

    vi.mocked(AsyncStorage.getAllKeys).mockClear()
    const firstPass = await adapter.getMessagesNeedingStatusSync('sender-1')
    expect(AsyncStorage.getAllKeys).not.toHaveBeenCalled()
    expect(firstPass).toHaveLength(10)
    expect(firstPass).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'burst-9', relayDeliveryToken: 'delivery-9' }),
    ]))

    storageState.data.set('qc_status_sync_index_sender-1', JSON.stringify([]))
    storageState.data.delete('qc_status_sync_index_version_sender-1')
    await expect(adapter.getMessagesNeedingStatusSync('sender-1')).resolves.toHaveLength(10)
  })

  it('uses the repaired status index without scanning storage keys after restart', async () => {
    const {
      AsyncStorageAdapter,
      prepareAsyncStorageScope,
      setAsyncStorageScope,
    } = await import('./asyncStorageAdapter')
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const scope = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const adapter = new AsyncStorageAdapter()
    await prepareAsyncStorageScope(scope)

    await adapter.storeMessage({
      id: 'status-index-message',
      conversationId: 'conversation-status-index',
      senderIdentityId: 'sender-1',
      recipientIdentityId: 'recipient-1',
      relayMessageId: 'relay-status-index',
      relayDeliveryToken: 'delivery-status-index',
      status: 'sent',
      createdAt: 1,
    })
    await adapter.getMessagesNeedingStatusSync('sender-1')

    setAsyncStorageScope(null)
    await prepareAsyncStorageScope(scope)
    vi.mocked(AsyncStorage.getAllKeys).mockClear()

    await expect(adapter.getMessagesNeedingStatusSync('sender-1')).resolves.toEqual([
      expect.objectContaining({ id: 'status-index-message' }),
    ])
    expect(AsyncStorage.getAllKeys).not.toHaveBeenCalled()
  })

  it('serializes concurrent message and index mutations without losing data', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    await prepareAsyncStorageScope('exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

    await Promise.all(Array.from({ length: 40 }, (_, index) => adapter.storeMessage({
      id: `concurrent-${index}`,
      conversationId: 'conversation-concurrent',
      senderIdentityId: 'sender-1',
      recipientIdentityId: 'recipient-1',
      status: 'sent',
      createdAt: index + 1,
    })))

    const messages = await adapter.getMessages('conversation-concurrent')
    expect(messages).toHaveLength(40)
    expect(messages.map((message) => message.id)).toEqual(
      expect.arrayContaining(['concurrent-0', 'concurrent-39']),
    )
  })

  it('serializes concurrent decrypted message indexes without losing data', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    await prepareAsyncStorageScope('exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

    await Promise.all(Array.from({ length: 40 }, (_, index) => adapter.storeDecryptedMessage({
      id: `decrypted-concurrent-${index}`,
      conversationId: 'conversation-decrypted-concurrent',
      senderId: 'sender-1',
      status: 'delivered',
      timestamp: index + 1,
      content: `message ${index}`,
    })))

    const messages = await adapter.getDecryptedMessages('conversation-decrypted-concurrent')
    expect(messages).toHaveLength(40)
    expect(messages.map((message) => message.id)).toEqual(
      expect.arrayContaining(['decrypted-concurrent-0', 'decrypted-concurrent-39']),
    )
  })

  it('keeps concurrent status updates monotonic', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    await prepareAsyncStorageScope('exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
    await adapter.storeMessage({
      id: 'message-concurrent-status',
      conversationId: 'conversation-concurrent-status',
      senderIdentityId: 'sender-1',
      recipientIdentityId: 'recipient-1',
      status: 'sent',
      createdAt: 1,
    })

    await Promise.all([
      adapter.updateMessageStatus('message-concurrent-status', 'read'),
      adapter.updateMessageStatus('message-concurrent-status', 'delivered'),
    ])

    await expect(adapter.getMessage('message-concurrent-status')).resolves.toEqual(
      expect.objectContaining({ status: 'read' }),
    )
  })

  it('does not clear volatile chat state when preparing the active scope again', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    const scope = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    await prepareAsyncStorageScope(scope)
    await adapter.storeDecryptedMessage({
      id: 'volatile-message',
      conversationId: 'volatile-conversation',
      senderId: 'sender-1',
      status: 'delivered',
      timestamp: 1,
      content: 'cached',
    })

    await prepareAsyncStorageScope(scope)

    await expect(adapter.getDecryptedMessage('volatile-message')).resolves.toEqual(
      expect.objectContaining({ content: 'cached' }),
    )
  })

  it('keeps decrypted message cache in sync when status changes', async () => {
    const { AsyncStorageAdapter } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()

    await adapter.storeMessage({
      id: 'message-status-1',
      conversationId: 'conversation-status-1',
      senderIdentityId: 'sender-1',
      recipientIdentityId: 'recipient-1',
      status: 'sent',
      createdAt: 1,
    })
    await adapter.storeDecryptedMessage({
      id: 'message-status-1',
      conversationId: 'conversation-status-1',
      senderId: 'sender-1',
      status: 'sent',
      timestamp: 1,
      content: 'hello',
    })

    await adapter.updateMessageStatus('message-status-1', 'delivered')
    await expect(adapter.getDecryptedMessages('conversation-status-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'message-status-1',
        status: 'delivered',
      }),
    ])

    await adapter.updateMessageStatus('message-status-1', 'read', {
      relayReadReceiptEligible: false,
    })
    await adapter.updateMessageStatus('message-status-1', 'read', {
      relayReadReceiptEligible: true,
    })
    await expect(adapter.getDecryptedMessages('conversation-status-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'message-status-1',
        status: 'read',
      }),
    ])
    await expect(adapter.getMessage('message-status-1')).resolves.toEqual(
      expect.objectContaining({ relayReadReceiptEligible: false }),
    )
  })

  it('seals durable message content while hydrating it for in-memory reads', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    const scope = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    await prepareAsyncStorageScope(scope)

    await adapter.storeMessage({
      id: 'sealed-message-1',
      conversationId: 'conversation-sealed',
      senderIdentityId: 'sender-1',
      recipientIdentityId: 'recipient-1',
      status: 'delivered',
      createdAt: 1,
      content: 'persist me encrypted',
      replyTo: { messageId: 'reply-1', content: 'quoted secret' },
    })

    const raw = storageState.data.get(`qc_${scope}_message_sealed-message-1`)
    expect(raw).toBeTruthy()
    expect(raw).not.toContain('persist me encrypted')
    expect(raw).not.toContain('quoted secret')
    expect(JSON.parse(raw!).localContentCipher).toEqual(expect.objectContaining({
      algorithm: 'AES-256-GCM',
    }))

    await expect(adapter.getMessage('sealed-message-1')).resolves.toEqual(
      expect.objectContaining({ content: 'persist me encrypted' }),
    )
    await expect(adapter.getMessages('conversation-sealed')).resolves.toEqual([
      expect.objectContaining({ content: 'persist me encrypted' }),
    ])
  })

  it('seals private messaging state and mailbox capabilities at rest', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    const scope = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    await prepareAsyncStorageScope(scope)

    await adapter.storeIdentity({
      id: 'identity-local',
      blockchainAddress: scope,
      identityPrivateKey: 'identity-private-material',
    })
    await adapter.storeSession({
      id: 'session-1',
      remoteIdentityId: 'identity-remote',
      state: { rootKey: 'ratchet-root-secret' },
    })
    await adapter.storeSessionRecord({
      remoteIdentityId: 'identity-remote',
      deviceRecords: new Map([['device-1', { sessionId: 'session-1' }]]),
      sessions: new Map([['device-1', 'session-1']]),
    })
    await adapter.storePrivateKeyBundle('identity-local', {
      signedPreKeyPrivate: 'signed-prekey-private',
      oneTimePreKeyPrivates: new Map([[1, 'one-time-private']]),
      mlkemOneTimePreKeyPrivates: new Map([[2, 'mlkem-private']]),
    })
    await adapter.storeMailboxScope({
      localIdentityId: 'identity-local',
      remoteIdentityId: 'identity-remote',
      scopeId: 'mailbox-scope-1',
      scopeSecret: 'mailbox-scope-secret',
      epoch: 1,
      status: 'active',
      createdAt: 1,
      updatedAt: 2,
    })

    const rawSecrets = [
      storageState.data.get(`qc_${scope}_identity_identity-local`),
      storageState.data.get(`qc_${scope}_session_session-1`),
      storageState.data.get(`qc_${scope}_session_record_identity-remote`),
      storageState.data.get(`qc_${scope}_private_bundle_identity-local`),
      storageState.data.get(
        `qc_${scope}_mailbox_scope_identity-local_identity-remote_mailbox-scope-1`,
      ),
    ]
    for (const raw of rawSecrets) {
      expect(raw).toBeTruthy()
      expect(JSON.parse(raw!)).toEqual(expect.objectContaining({
        __chatSecretCipher: true,
        v: 1,
      }))
    }
    expect(rawSecrets.join('')).not.toContain('identity-private-material')
    expect(rawSecrets.join('')).not.toContain('ratchet-root-secret')
    expect(rawSecrets.join('')).not.toContain('signed-prekey-private')
    expect(rawSecrets.join('')).not.toContain('mailbox-scope-secret')

    await expect(adapter.getIdentity('identity-local')).resolves.toEqual(
      expect.objectContaining({ identityPrivateKey: 'identity-private-material' }),
    )
    await expect(adapter.getSession('session-1')).resolves.toEqual(
      expect.objectContaining({ state: { rootKey: 'ratchet-root-secret' } }),
    )
    const sessionRecord = await adapter.getSessionRecord('identity-remote')
    expect(sessionRecord.deviceRecords).toBeInstanceOf(Map)
    expect(sessionRecord.sessions).toBeInstanceOf(Map)
    const privateBundle = await adapter.getPrivateKeyBundle('identity-local')
    expect(privateBundle.oneTimePreKeyPrivates.get(1)).toBe('one-time-private')
    expect(privateBundle.mlkemOneTimePreKeyPrivates.get(2)).toBe('mlkem-private')
    await expect(adapter.getMailboxScopes('identity-local')).resolves.toEqual([
      expect.objectContaining({ scopeSecret: 'mailbox-scope-secret' }),
    ])
  })

  it('migrates legacy plaintext messaging secrets before completing scope setup', async () => {
    const scope = 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    storageState.data.set(
      `qc_${scope}_identity_identity-legacy`,
      JSON.stringify({
        id: 'identity-legacy',
        blockchainAddress: scope,
        identityPrivateKey: 'legacy-identity-private',
      }),
    )
    storageState.data.set(
      `qc_${scope}_private_bundle_identity-legacy`,
      JSON.stringify({
        signedPreKeyPrivate: 'legacy-signed-prekey',
        oneTimePreKeyPrivates: [[1, 'legacy-one-time-private']],
        mlkemOneTimePreKeyPrivates: [[2, 'legacy-mlkem-private']],
      }),
    )

    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    await prepareAsyncStorageScope(scope)

    const rawIdentity = storageState.data.get(`qc_${scope}_identity_identity-legacy`)
    const rawBundle = storageState.data.get(`qc_${scope}_private_bundle_identity-legacy`)
    expect(rawIdentity).not.toContain('legacy-identity-private')
    expect(rawBundle).not.toContain('legacy-signed-prekey')
    expect(JSON.parse(rawIdentity!).__chatSecretCipher).toBe(true)
    expect(JSON.parse(rawBundle!).__chatSecretCipher).toBe(true)
    expect(storageState.data.get(`qc__chat_secrets_sealed_v1_${scope}`)).toBe('true')
    await expect(adapter.getIdentity('identity-legacy')).resolves.toEqual(
      expect.objectContaining({ identityPrivateKey: 'legacy-identity-private' }),
    )
    await expect(adapter.getPrivateKeyBundle('identity-legacy')).resolves.toEqual(
      expect.objectContaining({ signedPreKeyPrivate: 'legacy-signed-prekey' }),
    )
  })

  it('rejects plaintext secret records after migration completes', async () => {
    const { prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const scope = 'exo00cccccccccccccccccccccccccccccccccccccc'
    await prepareAsyncStorageScope(scope)
    storageState.data.delete(`qc__chat_secrets_sealed_v1_${scope}`)
    storageState.data.set(
      `qc_${scope}_identity_identity-downgraded`,
      JSON.stringify({
        id: 'identity-downgraded',
        identityPrivateKey: 'injected-plaintext-key',
      }),
    )
    vi.resetModules()
    const {
      AsyncStorageAdapter: ReloadedAdapter,
      setAsyncStorageScope,
    } = await import('./asyncStorageAdapter')
    setAsyncStorageScope(scope)
    const reloadedAdapter = new ReloadedAdapter()

    await expect(reloadedAdapter.getIdentity('identity-downgraded')).rejects.toThrow(
      'Unsealed chat secret record rejected',
    )
  })

  it('rejects secret ciphertext copied between wallet scopes', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    const firstScope = 'exo00dddddddddddddddddddddddddddddddddddddd'
    const secondScope = 'exo00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    await prepareAsyncStorageScope(firstScope)
    await adapter.storeIdentity({
      id: 'identity-swapped',
      identityPrivateKey: 'wallet-bound-private-key',
    })
    const firstCipher = storageState.data.get(
      `qc_${firstScope}_identity_identity-swapped`,
    )

    await prepareAsyncStorageScope(secondScope)
    storageState.data.set(
      `qc_${secondScope}_identity_identity-swapped`,
      firstCipher!,
    )

    await expect(adapter.getIdentity('identity-swapped')).rejects.toThrow(
      'Authentication failed',
    )
  })

  it('rejects secret ciphertext moved to another record key', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    const scope = 'exo00dddddddddddddddddddddddddddddddddddddd'
    await prepareAsyncStorageScope(scope)
    await adapter.storeIdentity({
      id: 'identity-original',
      identityPrivateKey: 'record-bound-private-key',
    })
    storageState.data.set(
      `qc_${scope}_identity_identity-replaced`,
      storageState.data.get(`qc_${scope}_identity_identity-original`)!,
    )

    await expect(adapter.getIdentity('identity-replaced')).rejects.toThrow(
      'Authentication failed',
    )
  })

  it('seals outbox delivery capabilities and migrates existing message records', async () => {
    const scope = 'exo00ffffffffffffffffffffffffffffffffffffff'
    const {
      AsyncStorageAdapter,
      prepareAsyncStorageScope,
    } = await import('./asyncStorageAdapter')
    const {
      buildLocalCacheAad,
      sealLocalCacheText,
    } = await import('./localCacheCrypto')
    const legacyMessage = {
      id: 'message-with-delivery-capability',
      conversationId: 'conversation-1',
      senderId: 'identity-local',
      senderIdentityId: 'identity-local',
      recipientIdentityId: 'identity-remote',
      relayMessageId: 'relay-1',
      relayDeliveryOutbox: {
        record: {
          recipientMailboxToken: 'smbx1.recipient',
          deliveryToken: 'sender-outbox-capability',
          deliveryClass: 'message',
          sealedEnvelope: {
            version: 1,
            type: 'message',
            senderEphemeralKey: 'ephemeral',
            mlkemCiphertext: 'kem',
            ciphertext: 'ciphertext',
            nonce: 'nonce',
            tag: 'tag',
          },
        },
        attemptCount: 1,
        createdAt: 1,
        lastAttemptAt: 1,
      },
      status: 'sent',
      createdAt: 1,
    }
    const legacyCipher = await sealLocalCacheText(
      scope,
      'direct',
      JSON.stringify({ content: 'encrypted message content' }),
      buildLocalCacheAad([
        'spectra',
        'direct-message-payload',
        'v2',
        scope,
        legacyMessage.id,
        legacyMessage.conversationId,
        legacyMessage.senderId,
      ]),
    )
    storageState.data.set(
      `qc_${scope}_message_${legacyMessage.id}`,
      JSON.stringify({
        ...legacyMessage,
        localContentCipher: {
          ...legacyCipher,
          v: 2,
        },
      }),
    )

    const adapter = new AsyncStorageAdapter()
    await prepareAsyncStorageScope(scope)

    const raw = storageState.data.get(`qc_${scope}_message_${legacyMessage.id}`)
    expect(raw).not.toContain('sender-outbox-capability')
    await expect(adapter.getMessage(legacyMessage.id)).resolves.toEqual(
      expect.objectContaining({
        content: 'encrypted message content',
        relayDeliveryOutbox: expect.objectContaining({
          record: expect.objectContaining({
            deliveryToken: 'sender-outbox-capability',
          }),
        }),
      }),
    )
  })

  it('seals rebuilt conversation previews at rest', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    const scope = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    await prepareAsyncStorageScope(scope)

    await adapter.storeConversation({
      id: 'conversation-preview',
      localIdentityId: 'identity-local',
      createdAt: 1,
      updatedAt: 2,
      lastMessage: {
        content: 'private rebuilt preview',
        timestamp: 2,
        senderId: 'identity-remote',
      },
    })

    const raw = storageState.data.get(`qc_${scope}_conversation_conversation-preview`)
    expect(raw).toBeTruthy()
    expect(raw).not.toContain('private rebuilt preview')
    expect(JSON.parse(raw!).localPreviewCipher).toEqual(expect.objectContaining({
      algorithm: 'AES-256-GCM',
    }))
    await expect(adapter.getConversation('conversation-preview')).resolves.toEqual(
      expect.objectContaining({
        lastMessage: expect.objectContaining({ content: 'private rebuilt preview' }),
      }),
    )
  })

  it('seals attachment metadata even when a message has no text field', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    const scope = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    await prepareAsyncStorageScope(scope)

    await adapter.storeMessage({
      id: 'attachment-only',
      conversationId: 'conversation-sealed',
      senderIdentityId: 'sender-1',
      recipientIdentityId: 'recipient-1',
      status: 'delivered',
      createdAt: 1,
      attachments: [{ id: 'private-attachment', fileName: 'secret.pdf' }],
    } as unknown as Parameters<typeof adapter.storeMessage>[0])

    const raw = storageState.data.get(`qc_${scope}_message_attachment-only`)
    expect(raw).toBeTruthy()
    expect(raw).not.toContain('secret.pdf')
    expect(JSON.parse(raw!).localContentCipher).toBeTruthy()
    await expect(adapter.getMessage('attachment-only')).resolves.toEqual(
      expect.objectContaining({
        attachments: [expect.objectContaining({ fileName: 'secret.pdf' })],
      }),
    )
  })

  it('updates individual decrypted messages in place', async () => {
    const { AsyncStorageAdapter } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()

    await adapter.storeDecryptedMessage({
      id: 'view-once-1',
      conversationId: 'conversation-view-once',
      senderId: 'sender-1',
      status: 'delivered',
      timestamp: 1,
      content: 'secret',
    })

    await adapter.updateDecryptedMessage('view-once-1', {
      content: 'Opened once',
    })

    await expect(adapter.getDecryptedMessage('view-once-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'view-once-1',
        content: 'Opened once',
      }),
    )
  })

  it('uses local order timestamps for decrypted message paging', async () => {
    const { AsyncStorageAdapter } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()

    await adapter.storeDecryptedMessage({
      id: 'message-a',
      conversationId: 'conversation-order',
      senderId: 'sender-1',
      timestamp: 1,
      content: 'a',
    })
    await adapter.storeDecryptedMessage({
      id: 'message-b',
      conversationId: 'conversation-order',
      senderId: 'sender-1',
      timestamp: 100,
      content: 'b',
    })
    await adapter.storeDecryptedMessage({
      id: 'message-c',
      conversationId: 'conversation-order',
      senderId: 'sender-1',
      timestamp: 2,
      content: 'c',
    })

    await adapter.updateDecryptedMessage('message-b', { localOrderTimestamp: 1.5 })

    await expect(adapter.getDecryptedMessages('conversation-order', { limit: 2 })).resolves.toEqual([
      expect.objectContaining({ id: 'message-c' }),
      expect.objectContaining({ id: 'message-b', localOrderTimestamp: 1.5 }),
    ])
  })

  it('keeps decrypted messages memory-only when persistence is disabled', async () => {
    const {
      AsyncStorageAdapter,
      setDecryptedMessagePersistenceEnabled,
    } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()

    setDecryptedMessagePersistenceEnabled(false)

    await adapter.storeDecryptedMessage({
      id: 'strict-message-1',
      conversationId: 'conversation-strict',
      senderId: 'sender-1',
      status: 'delivered',
      timestamp: 1,
      content: 'do not persist',
    })

    expect([...storageState.data.keys()].filter((key) => key.includes('decrypted'))).toEqual([])
    await expect(adapter.getDecryptedMessage('strict-message-1')).resolves.toEqual(
      expect.objectContaining({ content: 'do not persist' }),
    )
    await expect(adapter.getDecryptedMessages('conversation-strict')).resolves.toEqual([
      expect.objectContaining({ id: 'strict-message-1' }),
    ])
  })

  it('clears only decrypted message cache entries for the active scope', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    const scopeA = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const scopeB = 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

    await prepareAsyncStorageScope(scopeA)
    await adapter.storeMessage({
      id: 'encrypted-a',
      conversationId: 'conversation-a',
      senderIdentityId: 'sender-1',
      recipientIdentityId: 'recipient-1',
      status: 'sent',
      createdAt: 1,
    })
    await adapter.storeDecryptedMessage({
      id: 'decrypted-a',
      conversationId: 'conversation-a',
      senderId: 'sender-1',
      status: 'delivered',
      timestamp: 1,
      content: 'clear me',
    })

    await prepareAsyncStorageScope(scopeB)
    await adapter.storeDecryptedMessage({
      id: 'decrypted-b',
      conversationId: 'conversation-b',
      senderId: 'sender-1',
      status: 'delivered',
      timestamp: 1,
      content: 'keep me',
    })

    await prepareAsyncStorageScope(scopeA)
    await adapter.clearDecryptedMessageCache()

    expect(storageState.data.has(`qc_${scopeA}_message_encrypted-a`)).toBe(true)
    expect(storageState.data.has(`qc_${scopeA}_decrypted_decrypted-a`)).toBe(false)
    expect(storageState.data.has(`qc_${scopeA}_decrypted_index_conversation-a`)).toBe(false)
    expect(storageState.data.has(`qc_${scopeB}_decrypted_decrypted-b`)).toBe(false)
  })

  it('purges unscoped legacy plaintext when clearing decrypted caches', async () => {
    storageState.data.set(
      'qc_message_legacy-plaintext',
      JSON.stringify({
        id: 'legacy-plaintext',
        conversationId: 'conversation-legacy',
        senderIdentityId: 'sender-1',
        recipientIdentityId: 'recipient-1',
        status: 'delivered',
        createdAt: 1,
        content: 'legacy plaintext',
      }),
    )
    storageState.data.set('qc_message_index_conversation-legacy', JSON.stringify(['legacy-plaintext']))

    const { AsyncStorageAdapter } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    await adapter.clearDecryptedMessageCache()

    expect(storageState.data.has('qc_message_legacy-plaintext')).toBe(false)
  })

  it('can clear decrypted message cache entries across every scope', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    const scopeA = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const scopeB = 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

    await prepareAsyncStorageScope(scopeA)
    await adapter.storeDecryptedMessage({
      id: 'decrypted-a',
      conversationId: 'conversation-a',
      senderId: 'sender-1',
      status: 'delivered',
      timestamp: 1,
      content: 'clear a',
    })

    await prepareAsyncStorageScope(scopeB)
    await adapter.storeDecryptedMessage({
      id: 'decrypted-b',
      conversationId: 'conversation-b',
      senderId: 'sender-1',
      status: 'delivered',
      timestamp: 1,
      content: 'clear b',
    })

    storageState.data.set('qc_decrypted_legacy', JSON.stringify({ id: 'legacy' }))
    storageState.data.set('qc_decrypted_index_legacy-conversation', JSON.stringify(['legacy']))
    storageState.data.set(`qc_${scopeA}_message_encrypted-a`, JSON.stringify({ id: 'encrypted-a' }))

    await adapter.clearDecryptedMessageCache({ allScopes: true })

    expect([...storageState.data.keys()].filter((key) => key.includes('decrypted'))).toEqual([])
    expect(storageState.data.has(`qc_${scopeA}_message_encrypted-a`)).toBe(true)
  })

  it('deletes individual encrypted and decrypted messages from indexes', async () => {
    const { AsyncStorageAdapter } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()

    await adapter.storeMessage({
      id: 'delete-message-1',
      conversationId: 'conversation-delete',
      senderIdentityId: 'sender-1',
      recipientIdentityId: 'recipient-1',
      relayMessageId: 'delete-relay-1',
      status: 'sent',
      createdAt: 1,
    })
    await adapter.storeDecryptedMessage({
      id: 'delete-message-1',
      conversationId: 'conversation-delete',
      senderId: 'sender-1',
      status: 'sent',
      timestamp: 1,
      content: 'remove me',
    })

    await adapter.deleteMessage('delete-message-1')
    await adapter.deleteDecryptedMessage('delete-message-1')

    await expect(adapter.getMessage('delete-message-1')).resolves.toBeNull()
    await expect(adapter.getMessageByRelayId('delete-relay-1')).resolves.toBeNull()
    await expect(adapter.getMessages('conversation-delete')).resolves.toEqual([])
    await expect(adapter.getDecryptedMessage('delete-message-1')).resolves.toBeNull()
    await expect(adapter.getDecryptedMessages('conversation-delete')).resolves.toEqual([])
  })

  it('does not scan storage keys when a relay index is missing', async () => {
    storageState.data.set(
      'qc_message_legacy-message',
      JSON.stringify({
        id: 'legacy-message',
        conversationId: 'conversation-legacy',
        senderIdentityId: 'sender-legacy',
        recipientIdentityId: 'recipient-legacy',
        relayMessageId: 'legacy-relay',
        status: 'sent',
        createdAt: 1,
      }),
    )
    storageState.data.set(
      'qc_message_index_conversation-legacy',
      JSON.stringify(['legacy-message']),
    )

    const { AsyncStorageAdapter } = await import('./asyncStorageAdapter')
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const adapter = new AsyncStorageAdapter()
    vi.mocked(AsyncStorage.getAllKeys).mockClear()

    await expect(adapter.getMessageByRelayId('legacy-relay')).resolves.toBeNull()
    expect(AsyncStorage.getAllKeys).not.toHaveBeenCalled()
  })

  it('persists retry-request records across adapter instances', async () => {
    const { AsyncStorageAdapter } = await import('./asyncStorageAdapter')

    const adapterA = new AsyncStorageAdapter()
    await adapterA.storeRetryRequestRecord({
      key: 'sender-1:message-1',
      messageId: 'message-1',
      senderIdentityId: 'sender-1',
      relayMessageId: 'relay-1',
      attemptCount: 1,
      lastSeenAt: 1_000,
      lastAttemptAt: 1_000,
      lastRequestedAt: 1_000,
      status: 'pending',
    })

    const adapterB = new AsyncStorageAdapter()

    await expect(adapterB.getRetryRequestRecord('sender-1:message-1')).resolves.toEqual(
      expect.objectContaining({
        relayMessageId: 'relay-1',
        status: 'pending',
      }),
    )
    await expect(adapterB.getRetryRequestRecordByRelayId('relay-1')).resolves.toEqual(
      expect.objectContaining({
        key: 'sender-1:message-1',
      }),
    )
  })

  it('cleans up stale retry-request records and their relay lookup keys', async () => {
    const { AsyncStorageAdapter } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(10_000)

    await adapter.storeRetryRequestRecord({
      key: 'sender-1:stale-message',
      messageId: 'stale-message',
      senderIdentityId: 'sender-1',
      relayMessageId: 'stale-relay',
      attemptCount: 1,
      lastSeenAt: 1_000,
      lastAttemptAt: 1_000,
      lastRequestedAt: 1_000,
      status: 'pending',
    })
    await adapter.storeRetryRequestRecord({
      key: 'sender-1:fresh-message',
      messageId: 'fresh-message',
      senderIdentityId: 'sender-1',
      relayMessageId: 'fresh-relay',
      attemptCount: 1,
      lastSeenAt: 9_500,
      lastAttemptAt: 9_500,
      lastRequestedAt: 9_500,
      status: 'pending',
    })

    await expect(adapter.cleanupRetryRequestRecords(2_000)).resolves.toBe(1)
    await expect(adapter.getRetryRequestRecord('sender-1:stale-message')).resolves.toBeNull()
    await expect(adapter.getRetryRequestRecordByRelayId('stale-relay')).resolves.toBeNull()
    await expect(adapter.getRetryRequestRecord('sender-1:fresh-message')).resolves.toEqual(
      expect.objectContaining({
        relayMessageId: 'fresh-relay',
      }),
    )

    nowSpy.mockRestore()
  })

  it('keeps multiple mailbox scopes for one peer so old scoped mailboxes remain fetchable', async () => {
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    await prepareAsyncStorageScope('exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')

    await adapter.storeMailboxScope({
      localIdentityId: 'identity-local',
      remoteIdentityId: 'identity-remote',
      scopeId: 'scope-old',
      scopeSecret: 'old-secret',
      epoch: 0,
      status: 'active',
      initiatedByLocal: true,
      createdAt: 1,
      updatedAt: 1,
      registeredAt: 2,
      acknowledgedAt: 3,
    })
    await adapter.storeMailboxScope({
      localIdentityId: 'identity-local',
      remoteIdentityId: 'identity-remote',
      scopeId: 'scope-new',
      scopeSecret: 'new-secret',
      epoch: 0,
      status: 'active',
      initiatedByLocal: true,
      createdAt: 4,
      updatedAt: 4,
      registeredAt: 5,
      acknowledgedAt: 6,
    })

    await expect(adapter.getMailboxScopes('identity-local')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scopeId: 'scope-old' }),
        expect.objectContaining({ scopeId: 'scope-new' }),
      ]),
    )
    await expect(adapter.getMailboxScope('identity-local', 'identity-remote')).resolves.toEqual(
      expect.objectContaining({ scopeId: 'scope-new' }),
    )
  })

  it('isolates scoped data by wallet address', async () => {
    const scopeA = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const scopeB = 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()

    await prepareAsyncStorageScope(scopeA)
    await adapter.storeConversation({
      id: 'conversation-a',
      localIdentityId: 'identity-a',
      createdAt: 1,
      updatedAt: 1,
    })

    await prepareAsyncStorageScope(scopeB)
    expect(await adapter.getConversation('conversation-a')).toBeNull()

    await adapter.storeConversation({
      id: 'conversation-b',
      localIdentityId: 'identity-b',
      createdAt: 2,
      updatedAt: 2,
    })

    await prepareAsyncStorageScope(scopeA)
    await expect(adapter.getConversation('conversation-a')).resolves.toEqual(
      expect.objectContaining({ id: 'conversation-a' }),
    )
    await expect(adapter.getConversation('conversation-b')).resolves.toBeNull()
  })

  it('serializes concurrent conversation index and patch writes', async () => {
    const scope = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    await prepareAsyncStorageScope(scope)

    await Promise.all([
      adapter.storeConversation({
        id: 'conversation-a',
        localIdentityId: 'identity-local',
        remoteIdentityId: 'identity-a',
        unreadCount: 0,
        createdAt: 1,
        updatedAt: 1,
      }),
      adapter.storeConversation({
        id: 'conversation-b',
        localIdentityId: 'identity-local',
        remoteIdentityId: 'identity-b',
        unreadCount: 0,
        createdAt: 2,
        updatedAt: 2,
      }),
    ])
    await Promise.all([
      adapter.updateConversation('conversation-a', { remoteTorEnabled: true }),
      adapter.updateConversation('conversation-a', { remoteScreenshotProtection: true }),
    ])

    await expect(adapter.getConversations('identity-local')).resolves.toHaveLength(2)
    await expect(adapter.getConversationByParticipants('identity-local', 'identity-b'))
      .resolves.toEqual(expect.objectContaining({ id: 'conversation-b' }))
    await expect(adapter.getConversation('conversation-a')).resolves.toEqual(expect.objectContaining({
      remoteTorEnabled: true,
      remoteScreenshotProtection: true,
    }))
  })

  it('pins an in-flight conversation update to its entry wallet scope', async () => {
    const scopeA = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const scopeB = 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const {
      AsyncStorageAdapter,
      clearStorageCache,
      prepareAsyncStorageScope,
      setAsyncStorageScope,
    } = await import('./asyncStorageAdapter')
    const asyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const adapter = new AsyncStorageAdapter()

    await prepareAsyncStorageScope(scopeA)
    await adapter.storeConversation({
      id: 'conversation-shared',
      localIdentityId: 'identity-a',
      createdAt: 1,
      updatedAt: 1,
      lastMessage: { content: 'wallet A old', timestamp: 1, senderId: 'remote-a' },
    })
    await prepareAsyncStorageScope(scopeB)
    await adapter.storeConversation({
      id: 'conversation-shared',
      localIdentityId: 'identity-b',
      localWalletAddress: scopeB,
      createdAt: 1,
      updatedAt: 1,
      lastMessage: { content: 'wallet B', timestamp: 1, senderId: 'remote-b' },
    })

    setAsyncStorageScope(scopeA)
    clearStorageCache()
    const targetKey = `qc_${scopeA}_conversation_conversation-shared`
    const getItem = vi.mocked(asyncStorage.getItem)
    let releaseRead: (() => void) | undefined
    let signalReadStarted: (() => void) | undefined
    const readStarted = new Promise<void>((resolve) => {
      signalReadStarted = resolve
    })
    let delayed = false
    getItem.mockImplementation((key: string) => {
      if (key === targetKey && !delayed) {
        delayed = true
        signalReadStarted?.()
        return new Promise<string | null>((resolve) => {
          releaseRead = () => resolve(storageState.data.get(key) ?? null)
        })
      }
      return Promise.resolve(storageState.data.get(key) ?? null)
    })

    try {
      const update = adapter.updateConversation('conversation-shared', {
        lastMessage: { content: 'wallet A new', timestamp: 2, senderId: 'remote-a' },
      })
      await readStarted
      setAsyncStorageScope(scopeB)
      releaseRead?.()
      await update
    } finally {
      getItem.mockImplementation(async (key: string) => storageState.data.get(key) ?? null)
    }

    expect(storageState.data.get(targetKey)).not.toContain('wallet A new')
    expect(
      storageState.data.get(`qc_${scopeB}_conversation_conversation-shared`),
    ).not.toContain('wallet A new')
    expect(storageState.data.has(`qc_${scopeB}_conversation_index_identity-a`)).toBe(false)
    setAsyncStorageScope(scopeA)
    await expect(adapter.getConversation('conversation-shared')).resolves.toEqual(
      expect.objectContaining({
        localIdentityId: 'identity-a',
        lastMessage: expect.objectContaining({ content: 'wallet A new' }),
      }),
    )
    setAsyncStorageScope(scopeB)
    await expect(adapter.getConversation('conversation-shared')).resolves.toEqual(
      expect.objectContaining({
        localIdentityId: 'identity-b',
        lastMessage: expect.objectContaining({ content: 'wallet B' }),
      }),
    )
  })

  it('pins an in-flight message update to its entry wallet scope', async () => {
    const scopeA = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const scopeB = 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const {
      AsyncStorageAdapter,
      clearStorageCache,
      prepareAsyncStorageScope,
      setAsyncStorageScope,
    } = await import('./asyncStorageAdapter')
    const asyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const adapter = new AsyncStorageAdapter()
    const message = {
      id: 'message-shared',
      conversationId: 'conversation-shared',
      senderIdentityId: 'sender-1',
      recipientIdentityId: 'recipient-1',
      status: 'sent',
      createdAt: 1,
    }

    await prepareAsyncStorageScope(scopeA)
    await adapter.storeMessage(message)
    await prepareAsyncStorageScope(scopeB)
    await adapter.storeMessage(message)

    setAsyncStorageScope(scopeA)
    clearStorageCache()
    const targetKey = `qc_${scopeA}_message_message-shared`
    const getItem = vi.mocked(asyncStorage.getItem)
    let releaseRead: (() => void) | undefined
    let signalReadStarted: (() => void) | undefined
    const readStarted = new Promise<void>((resolve) => {
      signalReadStarted = resolve
    })
    let delayed = false
    getItem.mockImplementation((key: string) => {
      if (key === targetKey && !delayed) {
        delayed = true
        signalReadStarted?.()
        return new Promise<string | null>((resolve) => {
          releaseRead = () => resolve(storageState.data.get(key) ?? null)
        })
      }
      return Promise.resolve(storageState.data.get(key) ?? null)
    })

    try {
      const update = adapter.updateMessageStatus('message-shared', 'read')
      await readStarted
      setAsyncStorageScope(scopeB)
      releaseRead?.()
      await update
    } finally {
      getItem.mockImplementation(async (key: string) => storageState.data.get(key) ?? null)
    }

    setAsyncStorageScope(scopeA)
    await expect(adapter.getMessage('message-shared')).resolves.toEqual(
      expect.objectContaining({ status: 'read' }),
    )
    setAsyncStorageScope(scopeB)
    await expect(adapter.getMessage('message-shared')).resolves.toEqual(
      expect.objectContaining({ status: 'sent' }),
    )
  })

  it('migrates legacy unscoped data into the primary account scope', async () => {
    const scope = 'exo00cccccccccccccccccccccccccccccccccccccc'
    storageState.data.set(
      'qc_conversation_legacy-conversation',
      JSON.stringify({
        id: 'legacy-conversation',
        localIdentityId: 'identity-legacy',
        createdAt: 1,
        updatedAt: 1,
      }),
    )
    storageState.data.set(
      'qc_conversation_index_identity-legacy',
      JSON.stringify(['legacy-conversation']),
    )

    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    await prepareAsyncStorageScope(scope, { allowLegacyMigration: true })

    expect(storageState.data.has('qc_conversation_legacy-conversation')).toBe(false)
    expect(storageState.data.has('qc_conversation_index_identity-legacy')).toBe(false)
    expect(
      storageState.data.has(`qc_${scope}_conversation_legacy-conversation`),
    ).toBe(true)

    await expect(adapter.getConversation('legacy-conversation')).resolves.toEqual(
      expect.objectContaining({ id: 'legacy-conversation' }),
    )
  })

  it('marks legacy migration as complete and does not duplicate scoped data', async () => {
    const scope = 'exo00cccccccccccccccccccccccccccccccccccccc'
    storageState.data.set(
      'qc_conversation_existing',
      JSON.stringify({
        id: 'legacy-existing',
        localIdentityId: 'identity-legacy',
        createdAt: 1,
        updatedAt: 1,
      }),
    )
    storageState.data.set(
      `qc_${scope}_conversation_existing`,
      JSON.stringify({
        id: 'scoped-existing',
        localIdentityId: 'identity-scoped',
        createdAt: 2,
        updatedAt: 2,
      }),
    )

    const { AsyncStorageAdapter, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()

    await prepareAsyncStorageScope(scope, { allowLegacyMigration: true })
    await prepareAsyncStorageScope(scope, { allowLegacyMigration: true })

    expect(storageState.data.get(`qc__legacy_scope_migrated_${scope}`)).toBe('true')
    expect(storageState.data.has('qc_conversation_existing')).toBe(false)
    await expect(adapter.getConversation('existing')).resolves.toEqual(
      expect.objectContaining({ id: 'scoped-existing' }),
    )
  })

  it('does not scan global keys after the content-sealing marker survives restart', async () => {
    const scope = 'exo00dddddddddddddddddddddddddddddddddddddd'
    const firstModule = await import('./asyncStorageAdapter')
    await firstModule.prepareAsyncStorageScope(scope)
    expect(storageState.data.get(`qc__content_sealed_v4_${scope}`)).toBe('true')

    vi.resetModules()
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    vi.mocked(AsyncStorage.getAllKeys).mockClear()
    const restartedModule = await import('./asyncStorageAdapter')
    await restartedModule.prepareAsyncStorageScope(scope)

    expect(AsyncStorage.getAllKeys).not.toHaveBeenCalled()
  })

  it('clears schema metadata and scoped quantum storage during full wipe', async () => {
    const { AsyncStorageAdapter, ensureMigrations, prepareAsyncStorageScope } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()
    const scope = 'exo00ffffffffffffffffffffffffffffffffffffff'

    storageState.data.set('unrelated', 'keep')
    await ensureMigrations()
    await prepareAsyncStorageScope(scope)
    await adapter.storeConversation({
      id: 'conversation-wipe',
      localIdentityId: 'identity-wipe',
      createdAt: 1,
      updatedAt: 1,
    })

    expect(storageState.data.get('qc__schema_version')).toBe('5')
    await adapter.clear()

    expect([...storageState.data.keys()].filter((key) => key.startsWith('qc_'))).toEqual([])
    expect(storageState.secureStore.has(`exo_chat_secrets_sealed_v1_${scope}`)).toBe(false)
    expect(storageState.data.get('unrelated')).toBe('keep')
    await expect(adapter.getConversation('conversation-wipe')).resolves.toBeNull()
  })

  it('clears only the requested account scope', async () => {
    const scopeA = 'exo00dddddddddddddddddddddddddddddddddddddd'
    const scopeB = 'exo00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    const {
      AsyncStorageAdapter,
      clearAsyncStorageScope,
      prepareAsyncStorageScope,
    } = await import('./asyncStorageAdapter')
    const adapter = new AsyncStorageAdapter()

    await prepareAsyncStorageScope(scopeA)
    await adapter.storeConversation({
      id: 'conversation-a',
      localIdentityId: 'identity-a',
      createdAt: 1,
      updatedAt: 1,
    })

    await prepareAsyncStorageScope(scopeB)
    await adapter.storeConversation({
      id: 'conversation-b',
      localIdentityId: 'identity-b',
      createdAt: 2,
      updatedAt: 2,
    })

    await clearAsyncStorageScope(scopeA)
    expect(storageState.secureStore.has(`exo_chat_secrets_sealed_v1_${scopeA}`)).toBe(false)
    expect(storageState.secureStore.get(`exo_chat_secrets_sealed_v1_${scopeB}`)).toBe('true')

    await prepareAsyncStorageScope(scopeA)
    await expect(adapter.getConversation('conversation-a')).resolves.toBeNull()

    await prepareAsyncStorageScope(scopeB)
    await expect(adapter.getConversation('conversation-b')).resolves.toEqual(
      expect.objectContaining({ id: 'conversation-b' }),
    )
  })
})
