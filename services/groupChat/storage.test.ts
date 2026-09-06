/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type StoredValue = string

const mockState = vi.hoisted(() => ({
  asyncStorage: new Map<string, StoredValue>(),
  secureStore: new Map<string, StoredValue>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockState.asyncStorage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockState.asyncStorage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      mockState.asyncStorage.delete(key)
    }),
    getAllKeys: vi.fn(async () => Array.from(mockState.asyncStorage.keys())),
    multiGet: vi.fn(async (keys: string[]) => keys.map((key) => [key, mockState.asyncStorage.get(key) ?? null])),
    multiSet: vi.fn(async (entries: [string, string][]) => {
      for (const [key, value] of entries) {
        mockState.asyncStorage.set(key, value)
      }
    }),
    multiRemove: vi.fn(async (keys: string[]) => {
      for (const key of keys) {
        mockState.asyncStorage.delete(key)
      }
    }),
  },
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockState.secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockState.secureStore.set(key, value)
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    mockState.secureStore.delete(key)
  }),
}))

vi.mock('expo-crypto', () => ({
  getRandomBytesAsync: vi.fn(async (length: number) => new Uint8Array(length).fill(23)),
}))

vi.mock('@/lib/constants', () => ({
  SECURE_STORE_OPTIONS: {},
  VAULT_SECURITY_KEYS: {
    LOCAL_CACHE_ROOT_KEY: 'local_cache_root_key',
  },
}))

describe('group chat scoped storage', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.asyncStorage.clear()
    mockState.secureStore.clear()
  })

  it('migrates legacy group storage into the primary account scope', async () => {
    const scope = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    mockState.asyncStorage.set('qc_group_group_index', JSON.stringify(['group-1']))
    mockState.asyncStorage.set('qc_group_group_group-1', JSON.stringify({
      id: 'group:group-1',
      type: 'group',
      groupId: 'group-1',
      title: 'Legacy Group',
      remoteIdentityId: 'identity-1',
      memberIds: ['identity-1'],
      memberCount: 1,
      myRole: 'owner',
      maxMembers: 50,
      revision: 1,
      distributionId: 'distribution-1',
      unreadCount: 0,
      createdAt: 1,
      updatedAt: 1,
    }))
    mockState.secureStore.set('qc_group_sender_key_group-1', JSON.stringify({
      groupId: 'group-1',
      distributionId: 'distribution-1',
      keyBase64: 'sender-key',
      keyVersion: 1,
      sharedWith: ['identity-1'],
      rotationRevision: 1,
      updatedBy: 'identity-1',
      updatedAt: 1,
    }))

    const {
      getGroupSenderKeyState,
      listStoredGroups,
      prepareGroupStorageScope,
    } = await import('./storage')

    await prepareGroupStorageScope(scope, { allowLegacyMigration: true })

    expect(mockState.asyncStorage.has('qc_group_group_index')).toBe(false)
    expect(mockState.asyncStorage.has('qc_group_group_group-1')).toBe(false)
    expect(
      mockState.asyncStorage.has(`qc_group_${scope}_group_index`),
    ).toBe(true)
    expect(mockState.asyncStorage.get(`qc_group_${scope}_group_group-1`)).not.toContain('Legacy Group')
    expect(
      mockState.secureStore.has(`qc_group_${scope}_sender_key_group-1`),
    ).toBe(true)

    await expect(listStoredGroups()).resolves.toEqual([
      expect.objectContaining({ groupId: 'group-1', title: 'Legacy Group' }),
    ])
    await expect(getGroupSenderKeyState('group-1')).resolves.toEqual(
      expect.objectContaining({ distributionId: 'distribution-1' }),
    )
  })

  it('clears only the requested group storage scope', async () => {
    const scopeA = 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const scopeB = 'exo00cccccccccccccccccccccccccccccccccccccc'
    const {
      clearGroupChatStorageScope,
      listStoredGroups,
      prepareGroupStorageScope,
      storeGroup,
      storeGroupSenderKeyState,
    } = await import('./storage')

    await prepareGroupStorageScope(scopeA)
    await storeGroup({
      id: 'group:group-a',
      type: 'group',
      groupId: 'group-a',
      title: 'Group A',
      remoteIdentityId: 'identity-a',
      memberIds: ['identity-a'],
      memberCount: 1,
      myRole: 'owner',
      maxMembers: 50,
      revision: 1,
      distributionId: 'distribution-a',
      epoch: 1,
      protocolVersion: 2,
      rotationRequired: false,
      unreadCount: 0,
      createdAt: 1,
      updatedAt: 1,
    })
    await storeGroupSenderKeyState({
      groupId: 'group-a',
      distributionId: 'distribution-a',
      keyBase64: 'sender-key-a',
      keyVersion: 1,
      sharedWith: ['identity-a'],
      rotationRevision: 1,
      updatedBy: 'identity-a',
      updatedAt: 1,
    })

    await prepareGroupStorageScope(scopeB)
    await storeGroup({
      id: 'group:group-b',
      type: 'group',
      groupId: 'group-b',
      title: 'Group B',
      remoteIdentityId: 'identity-b',
      memberIds: ['identity-b'],
      memberCount: 1,
      myRole: 'owner',
      maxMembers: 50,
      revision: 1,
      distributionId: 'distribution-b',
      epoch: 1,
      protocolVersion: 2,
      rotationRequired: false,
      unreadCount: 0,
      createdAt: 2,
      updatedAt: 2,
    })

    await clearGroupChatStorageScope(scopeA)

    await prepareGroupStorageScope(scopeA)
    await expect(listStoredGroups()).resolves.toEqual([])

    await prepareGroupStorageScope(scopeB)
    await expect(listStoredGroups()).resolves.toEqual([
      expect.objectContaining({ groupId: 'group-b' }),
    ])
    expect(mockState.secureStore.has(`qc_group_${scopeA}_sender_key_group-a`)).toBe(false)
  })

  it('seals unread projections and migrates legacy plaintext records', async () => {
    const scope = 'exo00ffffffffffffffffffffffffffffffffffffff'
    const key = `qc_group_${scope}_unread_projection_group-1`
    mockState.asyncStorage.set(key, JSON.stringify({
      version: 1,
      unreadMessageIds: ['legacy-message'],
    }))
    const {
      getStoredGroupUnreadProjection,
      prepareGroupStorageScope,
      setStoredGroupUnreadProjection,
    } = await import('./storage')

    await prepareGroupStorageScope(scope)
    await expect(getStoredGroupUnreadProjection('group-1')).resolves.toEqual({
      version: 1,
      unreadMessageIds: ['legacy-message'],
    })
    expect(mockState.asyncStorage.get(key)).not.toContain('legacy-message')

    await setStoredGroupUnreadProjection('group-1', {
      version: 1,
      unreadMessageIds: ['current-message'],
    })
    expect(mockState.asyncStorage.get(key)).not.toContain('current-message')
    await expect(getStoredGroupUnreadProjection('group-1')).resolves.toEqual({
      version: 1,
      unreadMessageIds: ['current-message'],
    })
  })

  it('keeps explicit cache reads bound to their requested scope', async () => {
    const scopeA = 'exo00dddddddddddddddddddddddddddddddddddddd'
    const scopeB = 'exo00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    mockState.asyncStorage.set(`qc_group_${scopeA}_group_index`, JSON.stringify(['group-a']))
    mockState.asyncStorage.set(`qc_group_${scopeA}_group_group-a`, JSON.stringify({
      id: 'group:group-a',
      type: 'group',
      groupId: 'group-a',
      title: 'Group A',
      remoteIdentityId: 'identity-a',
      memberIds: ['identity-a'],
      memberCount: 1,
      myRole: 'owner',
      maxMembers: 50,
      revision: 1,
      distributionId: 'distribution-a',
      unreadCount: 0,
      createdAt: 1,
    }))
    mockState.asyncStorage.set(`qc_group_${scopeA}_message_index_group-a`, JSON.stringify(['message-a']))
    mockState.asyncStorage.set(`qc_group_${scopeA}_message_group-a_message-a`, JSON.stringify({
      id: 'message-a',
      conversationId: 'group:group-a',
      groupId: 'group-a',
      senderId: 'identity-a',
      content: 'cached',
      timestamp: 1,
      status: 'delivered',
    }))

    const {
      getStoredGroupMessages,
      listStoredGroups,
      prepareGroupStorageScope,
    } = await import('./storage')
    await prepareGroupStorageScope(scopeA)
    await prepareGroupStorageScope(scopeB)
    expect(
      mockState.asyncStorage.get(`qc_group_${scopeA}_message_group-a_message-a`),
    ).not.toContain('cached')

    await expect(listStoredGroups(scopeA)).resolves.toEqual([
      expect.objectContaining({ groupId: 'group-a' }),
    ])
    await expect(getStoredGroupMessages('group-a', 50, scopeA)).resolves.toEqual([
      expect.objectContaining({ id: 'message-a' }),
    ])
  })

  it('loads bounded group history pages from a message cursor', async () => {
    const scope = 'exo00ababababababababababababababababababab'
    const {
      getStoredGroupMessagesPage,
      prepareGroupStorageScope,
      storeGroupMessage,
    } = await import('./storage')

    await prepareGroupStorageScope(scope)
    for (let index = 1; index <= 6; index += 1) {
      await storeGroupMessage('group-1', {
        id: `message-${index}`,
        conversationId: 'group:group-1',
        groupId: 'group-1',
        senderId: 'identity-1',
        content: `Message ${index}`,
        timestamp: index,
        status: 'delivered',
      })
    }

    await expect(getStoredGroupMessagesPage('group-1', { limit: 2 })).resolves.toEqual({
      messages: [
        expect.objectContaining({ id: 'message-5' }),
        expect.objectContaining({ id: 'message-6' }),
      ],
      hasMore: true,
      nextCursor: 'message-5',
    })
    await expect(getStoredGroupMessagesPage('group-1', {
      beforeMessageId: 'message-5',
      limit: 2,
    })).resolves.toEqual({
      messages: [
        expect.objectContaining({ id: 'message-3' }),
        expect.objectContaining({ id: 'message-4' }),
      ],
      hasMore: true,
      nextCursor: 'message-3',
    })
  })

  it('preserves the group message index across concurrent writes', async () => {
    const scope = 'exo00cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd'
    const {
      getStoredGroupMessages,
      prepareGroupStorageScope,
      storeGroupMessage,
    } = await import('./storage')

    await prepareGroupStorageScope(scope)
    await Promise.all(
      Array.from({ length: 6 }, (_, index) => storeGroupMessage('group-1', {
        id: `concurrent-${index + 1}`,
        conversationId: 'group:group-1',
        groupId: 'group-1',
        senderId: 'identity-1',
        content: `Concurrent ${index + 1}`,
        timestamp: index + 1,
        status: 'delivered',
      })),
    )

    await expect(getStoredGroupMessages('group-1', 10)).resolves.toEqual(
      Array.from({ length: 6 }, (_, index) => (
        expect.objectContaining({ id: `concurrent-${index + 1}` })
      )),
    )
  })

  it('stores a page of group messages with a single index write', async () => {
    const scope = 'exo00efefefefefefefefefefefefefefefefefefef'
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default
    const {
      getStoredGroupMessageIds,
      getStoredGroupMessages,
      prepareGroupStorageScope,
      storeGroupMessages,
    } = await import('./storage')

    await prepareGroupStorageScope(scope)
    vi.mocked(AsyncStorage.multiSet).mockClear()
    vi.mocked(AsyncStorage.setItem).mockClear()

    await storeGroupMessages('group-1', Array.from({ length: 3 }, (_, index) => ({
      id: `batch-${index + 1}`,
      conversationId: 'group:group-1',
      groupId: 'group-1',
      senderId: 'identity-1',
      content: `Batch ${index + 1}`,
      timestamp: index + 1,
      status: 'delivered' as const,
    })))

    expect(AsyncStorage.multiSet).toHaveBeenCalled()
    await expect(getStoredGroupMessageIds('group-1')).resolves.toEqual([
      'batch-1',
      'batch-2',
      'batch-3',
    ])
    await expect(getStoredGroupMessages('group-1', 10)).resolves.toEqual([
      expect.objectContaining({ id: 'batch-1' }),
      expect.objectContaining({ id: 'batch-2' }),
      expect.objectContaining({ id: 'batch-3' }),
    ])
  })

  it('stores bounded pending group ciphertext and clears it on take', async () => {
    const scope = 'exo00fffffffffffffffffffffffffffffffffffffe'
    const {
      prepareGroupStorageScope,
      storePendingGroupCiphertext,
      takePendingGroupCiphertexts,
    } = await import('./storage')

    await prepareGroupStorageScope(scope)

    await storePendingGroupCiphertext({
      id: 'msg-1',
      groupId: 'group-1',
      senderIdentityId: 'member',
      distributionId: 'distribution-1',
      keyVersion: 1,
      groupRevision: 1,
      contentType: 'text',
      ciphertext: 'ct',
      nonce: 'nonce',
      tag: 'tag',
      signature: 'sig',
      createdAt: '2026-01-01T00:00:00.000Z',
      receivedAt: Date.now(),
    })

    await expect(takePendingGroupCiphertexts('group-1')).resolves.toEqual([
      expect.objectContaining({ id: 'msg-1', groupId: 'group-1' }),
    ])
    await expect(takePendingGroupCiphertexts('group-1')).resolves.toEqual([])
  })
})
