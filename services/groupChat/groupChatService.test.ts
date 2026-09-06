/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GroupChatMember, GroupConversation } from '@/lib/types'
import type { GroupSenderKeyState } from './storage'

type QueryFilters = Record<string, unknown>

const mockState = vi.hoisted(() => {
  const group: GroupConversation = {
    id: 'group:group-1',
    type: 'group',
    groupId: 'group-1',
    title: 'Audit Group',
    remoteIdentityId: 'group-1',
    memberIds: ['current-user', 'member-user'],
    memberCount: 2,
    myRole: 'member',
    maxMembers: 50,
    revision: 2,
    distributionId: 'distribution-2',
    epoch: 2,
    protocolVersion: 2,
    rotationRequired: false,
    unreadCount: 0,
    createdAt: 1,
    updatedAt: 2,
  }

  const members: GroupChatMember[] = [
    {
      groupId: 'group-1',
      identityId: 'current-user',
      role: 'member',
      joinedEpoch: 1,
      joinedAt: 1,
      updatedAt: 1,
    },
    {
      groupId: 'group-1',
      identityId: 'member-user',
      role: 'owner',
      joinedEpoch: 1,
      joinedAt: 1,
      updatedAt: 1,
    },
  ]

  return {
    group,
    members,
    walletAddress: 'wallet-1',
    storeState: {
      groups: [group] as GroupConversation[],
      members: { 'group-1': members } as Record<string, GroupChatMember[]>,
      messages: {} as Record<string, unknown[]>,
      activeGroupId: null as string | null,
      setActiveGroup: vi.fn((groupId: string | null) => {
        mockState.storeState.activeGroupId = groupId
      }),
      addGroup: vi.fn((group: GroupConversation) => {
        mockState.storeState.groups = [
          ...mockState.storeState.groups.filter((entry) => entry.groupId !== group.groupId),
          group,
        ]
      }),
      updateGroup: vi.fn(),
      removeGroup: vi.fn(),
      setGroups: vi.fn((groups: GroupConversation[]) => {
        mockState.storeState.groups = groups
      }),
      setMembers: vi.fn((groupId: string, nextMembers: GroupChatMember[]) => {
        mockState.storeState.members[groupId] = nextMembers
      }),
      setMessages: vi.fn(),
      addMessage: vi.fn(),
      mergeMessages: vi.fn(),
      updateMessage: vi.fn(),
      removeMessage: vi.fn(),
      addReaction: vi.fn(),
      markRead: vi.fn(),
      setLoadingMessages: vi.fn(),
      setSyncingMessages: vi.fn(),
      reset: vi.fn(() => {
        mockState.storeState.groups = []
        mockState.storeState.members = {}
        mockState.storeState.messages = {}
        mockState.storeState.activeGroupId = null
      }),
    },
    senderKeyState: null as GroupSenderKeyState | null,
    sendDirectControlEnvelope: vi.fn(),
    prepareGroupStorageScope: vi.fn(),
    setActiveGroupStorageScope: vi.fn(),
    listStoredGroups: vi.fn(),
    getStoredGroup: vi.fn(),
    getStoredGroupMembers: vi.fn(),
    getStoredGroupMessages: vi.fn(),
    getStoredGroupMessagesPage: vi.fn(),
    getStoredGroupMessageIds: vi.fn(),
    getStoredGroupUnreadProjection: vi.fn(),
    getGroupSenderKeyState: vi.fn(),
    storeGroupSenderKeyState: vi.fn(),
    getGroupEpochKey: vi.fn(),
    storeGroupEpochKey: vi.fn(),
    clearGroupEpochSecrets: vi.fn(),
    beginLocalEpochDistribution: vi.fn(),
    executeLocalEpochDistribution: vi.fn(),
    storeGroup: vi.fn(),
    storeGroupMembers: vi.fn(),
    storeGroupMessage: vi.fn(),
    storePendingGroupCiphertext: vi.fn(),
    takePendingGroupCiphertexts: vi.fn(),
    clearStoredGroupMessages: vi.fn(),
    updateStoredGroupMessage: vi.fn(),
    removeStoredGroup: vi.fn(),
    deleteStoredGroupMessage: vi.fn(),
    setStoredGroupUnreadProjection: vi.fn(),
  }
})

class MockQueryBuilder {
  private readonly table: string
  private readonly selected: string
  private filters: QueryFilters = {}
  private inFilters: QueryFilters = {}

  constructor(table: string, selected = '*') {
    this.table = table
    this.selected = selected
  }

  select(columns: string): MockQueryBuilder {
    return new MockQueryBuilder(this.table, columns)
  }

  eq(column: string, value: unknown): MockQueryBuilder {
    this.filters[column] = value
    return this
  }

  in(column: string, values: unknown[]): MockQueryBuilder {
    this.inFilters[column] = values
    return this
  }

  gt(column: string, value: unknown): MockQueryBuilder {
    this.filters[column] = value
    return this
  }

  or(): MockQueryBuilder {
    return this
  }

  order(): MockQueryBuilder {
    return this
  }

  limit(): MockQueryBuilder {
    return this
  }

  insert(): Promise<{ error: { message: string } | null }> {
    if (this.table === 'chat_groups' || this.table === 'chat_group_members' || this.table === 'chat_group_messages') {
      throw new Error(`${this.table} writes must use dedicated group APIs`)
    }
    return Promise.resolve({ error: null })
  }

  then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.resolve()).then(onfulfilled, onrejected)
  }

  private resolve(): { data: unknown[]; error: null } {
    if (this.table === 'chat_group_members') {
      if (this.selected.includes('chat_groups')) {
        return {
          data: [{
            group_id: mockState.group.groupId,
            role: mockState.group.myRole,
            chat_groups: {
              id: mockState.group.groupId,
              title: mockState.group.title,
              description: null,
              avatar_url: null,
              created_by_identity_id: 'current-user',
              created_by_wallet_address: 'wallet-1',
              revision: mockState.group.revision,
              distribution_id: mockState.group.distributionId,
              key_version: 2,
              epoch: 2,
              protocol_version: 2,
              _rotation_required: false,
              _pending_transition_id: null,
              member_count: mockState.members.length,
              max_members: mockState.group.maxMembers,
              disappearing_timer_ms: null,
              disappearing_timer_updated_at: null,
              disappearing_timer_updated_by: null,
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:01.000Z',
            },
          }],
          error: null,
        }
      }

      return {
        data: mockState.members
          .filter((member) => !this.filters.group_id || member.groupId === this.filters.group_id)
          .map((member) => ({
            group_id: member.groupId,
            user_identity_id: member.identityId,
            wallet_address: null,
            display_name: member.identityId,
            role: member.role,
            is_active: true,
            joined_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
          })),
        error: null,
      }
    }

    if (this.table === 'chat_group_messages') {
      return { data: [], error: null }
    }

    return { data: [], error: null }
  }
}

vi.mock('react-native', () => ({
  AppState: {
    currentState: 'active',
  },
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => options.ios ?? options.default,
  },
}))

vi.mock('expo-file-system/legacy', () => ({
  getInfoAsync: vi.fn(async () => ({ exists: false })),
}))

vi.mock('expo-file-system', () => ({
  File: class MockFile {},
}))

vi.mock('expo-modules-core', () => ({
  Platform: {
    OS: 'ios',
  },
  requireNativeModule: (name: string) => (
    (globalThis as unknown as { expo?: { modules?: Record<string, unknown> } }).expo?.modules?.[name] ?? {}
  ),
}))

vi.mock('@/lib/i18n', () => ({
  getCurrentLocaleTag: () => 'en-US',
  translate: (key: string) => key,
}))

vi.mock('@/lib/utils', () => ({
  mapWithConcurrency: async <T, R>(
    items: T[],
    _limit: number,
    mapper: (item: T, index: number) => Promise<R>,
  ) => Promise.all(items.map((item, index) => mapper(item, index))),
  mapWithConcurrencySettled: async <T, R>(
    items: T[],
    _limit: number,
    mapper: (item: T, index: number) => Promise<R>,
  ) => Promise.all(items.map((item, index) => mapper(item, index))),
}))

vi.mock('@/services/backend/client', () => ({
  isBackendConfigured: () => true,
  isSpectraBackendConfigured: () => true,
  registerBackendIdentityRecovery: vi.fn(),
  getBackendAuthHeaders: vi.fn(),
  backend: {
    from: (table: string) => new MockQueryBuilder(table),
    storage: {
      from: () => ({
        createSignedUrl: vi.fn(),
        remove: vi.fn(),
      }),
    },
  },
}))

vi.mock('@/services/backend/data', () => ({
  backendData: {
    call: vi.fn(async () => ({ data: {}, error: null })),
    table: (table: string) => new MockQueryBuilder(table),
  },
}))

vi.mock('@/services/backend/storage', () => ({
  createStorageRef: vi.fn((bucket: string, path: string) => `backend://${bucket}/${path}`),
}))

vi.mock('@/services/tor/torUpload', () => ({
  torSafeUpload: vi.fn(),
}))

vi.mock('@/services/tor/torStore', () => ({
  useTorStore: {
    getState: () => ({ enabled: false }),
  },
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: {
    getState: () => ({ contacts: [] }),
  },
}))

vi.mock('@/store/groupChatStore', () => ({
  useGroupChatStore: {
    getState: () => mockState.storeState,
  },
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: {
    getState: () => ({ enabled: false }),
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({ wallet: { address: mockState.walletAddress, spectreMode: false } }),
  },
}))

vi.mock('./storage', () => ({
  prepareGroupStorageScope: mockState.prepareGroupStorageScope,
  setActiveGroupStorageScope: mockState.setActiveGroupStorageScope,
  listStoredGroups: mockState.listStoredGroups,
  getStoredGroup: mockState.getStoredGroup,
  getStoredGroupMembers: mockState.getStoredGroupMembers,
  getStoredGroupMessages: mockState.getStoredGroupMessages,
  getStoredGroupMessagesPage: mockState.getStoredGroupMessagesPage,
  getStoredGroupMessageIds: mockState.getStoredGroupMessageIds,
  getStoredGroupUnreadProjection: mockState.getStoredGroupUnreadProjection,
  getGroupSenderKeyState: mockState.getGroupSenderKeyState,
  storeGroupSenderKeyState: mockState.storeGroupSenderKeyState,
  storeGroup: mockState.storeGroup,
  storeGroupMembers: mockState.storeGroupMembers,
  storeGroupMessage: mockState.storeGroupMessage,
  storePendingGroupCiphertext: mockState.storePendingGroupCiphertext,
  takePendingGroupCiphertexts: mockState.takePendingGroupCiphertexts,
  clearStoredGroupMessages: mockState.clearStoredGroupMessages,
  updateStoredGroupMessage: mockState.updateStoredGroupMessage,
  removeStoredGroup: mockState.removeStoredGroup,
  deleteStoredGroupMessage: mockState.deleteStoredGroupMessage,
  setStoredGroupUnreadProjection: mockState.setStoredGroupUnreadProjection,
  clearGroupSenderKeyState: vi.fn(),
}))

vi.mock('./epochKeyringStorage', () => ({
  getGroupEpochKey: mockState.getGroupEpochKey,
  storeGroupEpochKey: mockState.storeGroupEpochKey,
  clearGroupEpochSecrets: mockState.clearGroupEpochSecrets,
}))

vi.mock('./epochTransition', () => ({
  configureGroupEpochTransitions: vi.fn(),
  resumePendingGroupEpochTransitions: vi.fn(async () => undefined),
  beginLocalEpochDistribution: mockState.beginLocalEpochDistribution,
  executeLocalEpochDistribution: mockState.executeLocalEpochDistribution,
}))

vi.mock('@/services/media/localMediaCache', () => ({
  cacheMediaFromFile: vi.fn(),
  deleteCachedMediaForMessage: vi.fn(),
  deleteConversationMedia: vi.fn(async () => undefined),
  initializeMediaCache: vi.fn(),
}))

vi.mock('@/services/media/attachmentHydration', () => ({
  hydrateMessageAttachments: vi.fn(),
  shouldAutoHydrateAttachment: vi.fn(() => false),
}))

vi.mock('@/services/media/mediaService', () => ({
  uploadEncryptedMedia: vi.fn(),
}))

vi.mock('@/services/notifications/pushService', () => ({
  scheduleGlobalBadgeSync: vi.fn(),
  sendLocalNotification: vi.fn(),
}))

vi.mock('@spectra/core-crypto', () => ({
  base64ToBytes: vi.fn(() => new Uint8Array(32).fill(1)),
  bytesToBase64: vi.fn(() => 'generated-key'),
  decryptMessage: vi.fn(() => JSON.stringify({ v: 1, type: 'text', text: 'hello' })),
  dilithiumSignAsync: vi.fn(),
  dilithiumVerifyAsync: vi.fn(async () => true),
  encryptMessage: vi.fn(),
  generateRandomBytes: vi.fn(() => new Uint8Array(32).fill(1)),
  generateUUID: vi.fn(() => 'generated-id'),
  loadIdentityByAddress: vi.fn(),
  sha256Hash: vi.fn(() => 'a'.repeat(64)),
  localChatStorage: {
    getPublicKeyBundle: vi.fn(async () => ({ dilithiumKey: 'pub-key' })),
  },
}))

function createDistributionEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    v: 2,
    type: 'group_sender_key_distribution',
    groupId: 'group-1',
    recipientIdentityId: 'current-user',
    distributionId: 'distribution-2',
    keyVersion: 2,
    rotationRevision: 2,
    keyBase64: 'distributed-key',
    ...overrides,
  } as Parameters<typeof import('./groupChatService').processDirectGroupControlEnvelope>[0]
}

function createRequestEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    v: 2,
    type: 'group_sender_key_request',
    groupId: 'group-1',
    requesterId: 'member-user',
    ...overrides,
  } as Parameters<typeof import('./groupChatService').processDirectGroupControlEnvelope>[0]
}

async function initializeService(
  service: typeof import('./groupChatService'),
): Promise<void> {
  await service.initializeGroupChat({
    identityId: 'current-user',
    walletAddress: 'wallet-1',
    sendDirectControlEnvelope: mockState.sendDirectControlEnvelope,
  })
}

describe('groupChatService direct group control envelopes', () => {
  let service: typeof import('./groupChatService')

  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('__DEV__', false)
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    mockState.members = [
      {
        groupId: 'group-1',
        identityId: 'current-user',
        role: 'member',
        joinedEpoch: 1,
        joinedAt: 1,
        updatedAt: 1,
      },
      {
        groupId: 'group-1',
        identityId: 'member-user',
        role: 'owner',
        joinedEpoch: 1,
        joinedAt: 1,
        updatedAt: 1,
      },
    ]
    mockState.walletAddress = 'wallet-1'
    mockState.storeState.groups = [mockState.group]
    mockState.storeState.members = { 'group-1': mockState.members }
    mockState.senderKeyState = {
      groupId: 'group-1',
      distributionId: 'distribution-2',
      keyBase64: 'current-key',
      keyVersion: 2,
      sharedWith: ['current-user', 'member-user'],
      rotationRevision: 2,
      updatedBy: 'current-user',
      updatedAt: 1,
    }

    for (const value of Object.values(mockState)) {
      if (typeof value === 'function' && 'mockReset' in value) {
        value.mockReset()
      }
    }

    mockState.prepareGroupStorageScope.mockResolvedValue(undefined)
    mockState.listStoredGroups.mockResolvedValue([mockState.group])
    mockState.getStoredGroup.mockImplementation(async (groupId: string) => (
      mockState.storeState.groups.find((group) => group.groupId === groupId) ?? null
    ))
    mockState.getStoredGroupMembers.mockResolvedValue(mockState.members)
    mockState.getStoredGroupMessages.mockResolvedValue([])
    mockState.getStoredGroupMessageIds.mockResolvedValue([])
    mockState.getStoredGroupMessagesPage.mockResolvedValue({
      messages: [],
      hasMore: false,
      nextCursor: null,
    })
    mockState.getStoredGroupUnreadProjection.mockResolvedValue(null)
    mockState.getGroupSenderKeyState.mockImplementation(async () => mockState.senderKeyState)
    mockState.storeGroupSenderKeyState.mockImplementation(async (keyState: GroupSenderKeyState) => {
      mockState.senderKeyState = keyState
    })
    mockState.getGroupEpochKey.mockImplementation(async () => (
      mockState.senderKeyState
        ? {
            schemaVersion: 1,
            groupId: mockState.senderKeyState.groupId,
            epoch: mockState.senderKeyState.rotationRevision,
            distributionId: mockState.senderKeyState.distributionId,
            keyBase64: mockState.senderKeyState.keyBase64,
            createdAt: mockState.senderKeyState.updatedAt,
          }
        : null
    ))
    mockState.storeGroupEpochKey.mockImplementation(async (entry) => {
      mockState.senderKeyState = {
        groupId: entry.groupId,
        distributionId: entry.distributionId,
        keyBase64: entry.keyBase64,
        keyVersion: entry.epoch,
        sharedWith: ['current-user'],
        rotationRevision: entry.epoch,
        updatedBy: 'member-user',
        updatedAt: entry.createdAt,
      }
    })
    mockState.clearGroupEpochSecrets.mockResolvedValue(undefined)
    mockState.storePendingGroupCiphertext.mockResolvedValue(undefined)
    mockState.takePendingGroupCiphertexts.mockResolvedValue([])
    mockState.beginLocalEpochDistribution.mockImplementation(async (params) => ({
      schemaVersion: 1,
      transitionId: 'transition-1',
      groupId: params.groupId,
      epoch: params.epoch,
      distributionId: params.epoch === 1 ? 'generated-id' : 'distribution-3',
      keyBase64: 'generated-key',
      rosterHash: 'a'.repeat(64),
      recipientIdentityIds: params.recipientIdentityIds.filter((id: string) => id !== 'current-user'),
      deliveredIdentityIds: [],
      removedIdentityIds: params.removedIdentityIds ?? [],
      title: params.title,
      description: params.description ?? null,
      members: params.members,
      createdAtIso: params.createdAtIso,
      createdAt: 1,
      updatedAt: 1,
    }))
    mockState.executeLocalEpochDistribution.mockImplementation(async (pending, buildEnvelope) => {
      for (const identityId of pending.recipientIdentityIds) {
        await mockState.sendDirectControlEnvelope(identityId, buildEnvelope(identityId, pending, true))
      }
      for (const identityId of pending.removedIdentityIds ?? []) {
        await mockState.sendDirectControlEnvelope(identityId, buildEnvelope(identityId, pending, false))
      }
      return pending
    })
    mockState.storeGroup.mockResolvedValue(undefined)
    mockState.storeGroupMembers.mockResolvedValue(undefined)
    mockState.setStoredGroupUnreadProjection.mockResolvedValue(undefined)
    mockState.clearStoredGroupMessages.mockResolvedValue(undefined)
    mockState.sendDirectControlEnvelope.mockResolvedValue(undefined)

    service = await import('./groupChatService')
    await initializeService(service)
  })

  afterEach(() => {
    service?.cleanupGroupChat()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('hydrates wallet-scoped group rows without initializing members or network sync', async () => {
    mockState.prepareGroupStorageScope.mockClear()
    mockState.listStoredGroups.mockClear()
    mockState.storeState.setGroups.mockClear()
    mockState.getStoredGroupMembers.mockClear()
    mockState.setActiveGroupStorageScope.mockClear()

    const groups = await service.loadCachedGroupConversations('wallet-1', {
      allowLegacyMigration: true,
    })

    expect(mockState.prepareGroupStorageScope).toHaveBeenCalledWith('wallet-1', {
      allowLegacyMigration: true,
      activate: false,
    })
    expect(mockState.listStoredGroups).toHaveBeenCalledWith('wallet-1')
    expect(groups).toEqual([
      expect.objectContaining({
        groupId: 'group-1',
        localWalletAddress: 'wallet-1',
      }),
    ])
    expect(mockState.storeState.setGroups).toHaveBeenCalledWith(groups)
    expect(mockState.getStoredGroupMembers).not.toHaveBeenCalled()
    expect(mockState.setActiveGroupStorageScope).not.toHaveBeenCalled()
  })

  it('does not publish cached group rows after the active wallet changes', async () => {
    mockState.storeState.setGroups.mockClear()
    mockState.walletAddress = 'wallet-2'

    await expect(service.loadCachedGroupConversations('wallet-1')).resolves.toEqual([])
    expect(mockState.storeState.setGroups).not.toHaveBeenCalled()
  })

  it('does not reactivate group storage for a stale wallet initialization', async () => {
    service.cleanupGroupChat()
    mockState.prepareGroupStorageScope.mockClear()
    mockState.setActiveGroupStorageScope.mockClear()
    mockState.walletAddress = 'wallet-2'

    await initializeService(service)

    expect(mockState.prepareGroupStorageScope).not.toHaveBeenCalled()
    expect(mockState.setActiveGroupStorageScope).not.toHaveBeenCalled()
  })

  it('loads wallet-scoped group messages before runtime configuration', async () => {
    const cachedMessage = {
      id: 'cached-message',
      conversationId: 'group-1',
      senderId: 'member-user',
      senderName: 'Member',
      content: 'cached',
      timestamp: 10,
      status: 'delivered',
    }
    service.cleanupGroupChat()
    mockState.storeState.setMessages.mockClear()
    mockState.getStoredGroupMessages.mockResolvedValue([cachedMessage])

    await expect(service.loadCachedGroupMessages('group-1', 'wallet-1')).resolves.toEqual([
      cachedMessage,
    ])
    expect(mockState.getStoredGroupMessages).toHaveBeenCalledWith('group-1', 50, 'wallet-1')
    expect(mockState.storeState.setMessages).toHaveBeenCalledWith('group-1', [cachedMessage])
  })

  it('loads older group messages from a bounded storage cursor', async () => {
    const olderMessages = Array.from({ length: 50 }, (_, index) => (
      {
        id: `message-${index + 1}`,
        conversationId: 'group:group-1',
        groupId: 'group-1',
        senderId: 'member-user',
        content: 'older',
        timestamp: index + 1,
        status: 'delivered',
      }
    ))
    mockState.getStoredGroupMessagesPage.mockResolvedValue({
      messages: olderMessages,
      hasMore: true,
      nextCursor: 'message-1',
    })

    await expect(
      service.loadOlderGroupMessages('group-1', 'message-50', 50),
    ).resolves.toEqual({
      messages: olderMessages,
      hasMore: true,
    })
    expect(mockState.getStoredGroupMessagesPage).toHaveBeenCalledWith('group-1', {
      beforeMessageId: 'message-50',
      limit: 50,
    })
    expect(mockState.storeState.mergeMessages).toHaveBeenCalledWith('group-1', olderMessages)
  })

  it('ignores sender-key distributions from direct senders outside the group', async () => {
    const handled = await service.processDirectGroupControlEnvelope(
      createDistributionEnvelope(),
      'outsider-user',
    )

    expect(handled).toBe(true)
    expect(mockState.storeGroupEpochKey).not.toHaveBeenCalledWith(
      expect.objectContaining({ keyBase64: 'distributed-key' }),
    )
  })

  it('ignores sender-key distributions that do not match current group metadata', async () => {
    mockState.senderKeyState = null

    const handled = await service.processDirectGroupControlEnvelope(
      createDistributionEnvelope({ distributionId: 'old-distribution' }),
      'member-user',
    )

    expect(handled).toBe(true)
    expect(mockState.storeGroupEpochKey).not.toHaveBeenCalledWith(
      expect.objectContaining({ distributionId: 'old-distribution' }),
    )
  })

  it('ignores sender-key distributions addressed to another identity', async () => {
    mockState.senderKeyState = null

    const handled = await service.processDirectGroupControlEnvelope(
      createDistributionEnvelope({ recipientIdentityId: 'different-user' }),
      'member-user',
    )

    expect(handled).toBe(true)
    expect(mockState.storeGroupEpochKey).not.toHaveBeenCalled()
  })

  it('stores a matching sender-key distribution from an active member when no key is present', async () => {
    mockState.senderKeyState = null

    const handled = await service.processDirectGroupControlEnvelope(
      createDistributionEnvelope(),
      'member-user',
    )

    expect(handled).toBe(true)
    expect(mockState.storeGroupEpochKey).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        distributionId: 'distribution-2',
        keyBase64: 'distributed-key',
        epoch: 2,
      }),
    )
  })

  it('persists a group from an invitation snapshot when it is not local yet', async () => {
    mockState.storeState.groups = []
    mockState.getStoredGroup.mockResolvedValue(null)
    mockState.senderKeyState = null
    mockState.getGroupEpochKey.mockResolvedValue(null)

    const handled = await service.processDirectGroupControlEnvelope(
      {
        v: 2,
        type: 'group_sender_key_distribution',
        groupId: 'group-new',
        recipientIdentityId: 'current-user',
        distributionId: 'distribution-1',
        keyVersion: 1,
        rotationRevision: 1,
        keyBase64: 'distributed-key',
        title: 'Weekend',
        createdAt: '2026-01-01T00:00:00.000Z',
        members: [
          { identityId: 'member-user', role: 'owner', joinedEpoch: 1 },
          { identityId: 'current-user', role: 'member', joinedEpoch: 1 },
        ],
      },
      'member-user',
    )

    expect(handled).toBe(true)
    expect(mockState.storeGroup).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'group-new', title: 'Weekend' }),
    )
    expect(mockState.storeGroupEpochKey).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-new',
        distributionId: 'distribution-1',
      }),
    )
  })

  it('ignores invitation snapshots whose sender is not listed as owner or admin', async () => {
    mockState.storeState.groups = []
    mockState.senderKeyState = null
    mockState.storeGroup.mockClear()

    const handled = await service.processDirectGroupControlEnvelope(
      {
        v: 2,
        type: 'group_sender_key_distribution',
        groupId: 'group-new',
        recipientIdentityId: 'current-user',
        distributionId: 'distribution-1',
        keyVersion: 1,
        rotationRevision: 1,
        keyBase64: 'distributed-key',
        title: 'Weekend',
        createdAt: '2026-01-01T00:00:00.000Z',
        members: [
          { identityId: 'member-user', role: 'member', joinedEpoch: 1 },
          { identityId: 'current-user', role: 'member', joinedEpoch: 1 },
        ],
      },
      'member-user',
    )

    expect(handled).toBe(true)
    expect(mockState.storeGroup).not.toHaveBeenCalled()
  })

  it('buffers group ciphertext until the invitation snapshot arrives', async () => {
    mockState.storeState.groups = []
    mockState.senderKeyState = null
    const pending: unknown[] = []
    mockState.storePendingGroupCiphertext.mockImplementation(async (row) => {
      pending.push(row)
    })
    mockState.takePendingGroupCiphertexts.mockImplementation(async () => {
      const rows = [...pending]
      pending.length = 0
      return rows
    })

    await service.processDirectGroupControlEnvelope(
      {
        v: 2,
        type: 'group_ciphertext',
        groupId: 'group-new',
        recipientIdentityId: 'current-user',
        payload: {
          id: 'msg-1',
          senderIdentityId: 'member-user',
          distributionId: 'distribution-1',
          keyVersion: 1,
          groupRevision: 1,
          contentType: 'text',
          ciphertext: 'ciphertext',
          nonce: 'nonce',
          tag: 'tag',
          signature: 'signature',
          createdAt: '2026-01-01T00:00:01.000Z',
        },
      },
      'member-user',
    )

    expect(mockState.storePendingGroupCiphertext).toHaveBeenCalled()
    expect(mockState.storeState.addMessage).not.toHaveBeenCalled()

    await service.processDirectGroupControlEnvelope(
      {
        v: 2,
        type: 'group_sender_key_distribution',
        groupId: 'group-new',
        recipientIdentityId: 'current-user',
        distributionId: 'distribution-1',
        keyVersion: 1,
        rotationRevision: 1,
        keyBase64: 'distributed-key',
        title: 'Weekend',
        createdAt: '2026-01-01T00:00:00.000Z',
        members: [
          { identityId: 'member-user', role: 'owner', joinedEpoch: 1 },
          { identityId: 'current-user', role: 'member', joinedEpoch: 1 },
        ],
      },
      'member-user',
    )

    expect(mockState.storeState.addMessage).toHaveBeenCalledWith(
      'group-new',
      expect.objectContaining({ id: 'msg-1', content: 'hello' }),
    )
  })

  it('removes a local group when an admin sends a wipe envelope', async () => {
    const handled = await service.processDirectGroupControlEnvelope(
      {
        v: 2,
        type: 'group_sender_key_distribution',
        groupId: 'group-1',
        recipientIdentityId: 'current-user',
        distributionId: 'distribution-3',
        keyVersion: 3,
        rotationRevision: 3,
        title: 'Audit Group',
        createdAt: '2026-01-01T00:00:00.000Z',
        members: [],
      },
      'member-user',
    )

    expect(handled).toBe(true)
    expect(mockState.removeStoredGroup).toHaveBeenCalledWith('group-1')
    expect(mockState.clearGroupEpochSecrets).toHaveBeenCalledWith('group-1')
    expect(mockState.storeState.removeGroup).toHaveBeenCalledWith('group-1')
  })

  it('does not overwrite an existing current sender key with conflicting material', async () => {
    const handled = await service.processDirectGroupControlEnvelope(
      createDistributionEnvelope({ keyBase64: 'conflicting-key' }),
      'member-user',
    )

    expect(handled).toBe(true)
    expect(mockState.storeGroupEpochKey).not.toHaveBeenCalledWith(
      expect.objectContaining({ keyBase64: 'conflicting-key' }),
    )
  })

  it('ignores sender-key requests that spoof another requester', async () => {
    const handled = await service.processDirectGroupControlEnvelope(
      createRequestEnvelope({ requesterId: 'current-user' }),
      'member-user',
    )

    expect(handled).toBe(true)
    expect(mockState.sendDirectControlEnvelope).not.toHaveBeenCalled()
  })

  it('does not disclose epoch keys through legacy sender-key requests', async () => {
    const handled = await service.processDirectGroupControlEnvelope(
      createRequestEnvelope(),
      'member-user',
    )

    expect(handled).toBe(true)
    expect(mockState.sendDirectControlEnvelope).not.toHaveBeenCalled()
  })

  it('ignores inbound group_tor_state after decrypt', async () => {
    const handled = await service.processDirectGroupControlEnvelope(
      {
        v: 2,
        type: 'group_tor_state',
        groupId: 'group-1',
        enabled: true,
        updatedAt: 10,
      },
      'member-user',
    )

    expect(handled).toBe(true)
  })

  it('creates a retryable optimistic row for text-only group sends', async () => {
    const crypto = await import('@spectra/core-crypto')
    vi.mocked(crypto.loadIdentityByAddress).mockResolvedValue({
      identity: { id: 'current-user', dilithiumPrivateKey: 'private-key' },
    } as any)
    vi.mocked(crypto.encryptMessage).mockReturnValue({
      ciphertext: 'ciphertext',
      nonce: 'nonce',
      tag: 'tag',
    } as any)

    const result = await service.sendGroupMessage('group-1', 'hello group')

    expect(result.error).toBeNull()
    expect(mockState.storeState.addMessage).toHaveBeenCalledWith(
      'group-1',
      expect.objectContaining({
        id: 'local:generated-id',
        content: 'hello group',
        status: 'sending',
      }),
    )
    expect(mockState.storeState.removeMessage).toHaveBeenCalledWith('group-1', 'local:generated-id')
    expect(mockState.storeState.addMessage).toHaveBeenCalledWith(
      'group-1',
      expect.objectContaining({
        id: 'generated-id',
        content: 'hello group',
        status: 'sent',
      }),
    )
  })

  it('uploads group attachments with the group media scope', async () => {
    const crypto = await import('@spectra/core-crypto')
    const mediaService = await import('@/services/media/mediaService')
    vi.mocked(crypto.loadIdentityByAddress).mockResolvedValue({
      identity: { id: 'current-user', dilithiumPrivateKey: 'private-key' },
    } as any)
    vi.mocked(crypto.encryptMessage).mockReturnValue({
      ciphertext: 'ciphertext',
      nonce: 'nonce',
      tag: 'tag',
    } as any)
    vi.mocked(mediaService.uploadEncryptedMedia).mockResolvedValue({
      id: 'media-1',
      storagePath: 'current-user/group-1/media-1.enc',
      downloadUrl: '',
      encryptedMetadata: {
        ciphertext: 'meta',
        nonce: 'nonce',
        tag: 'tag',
      },
      mediaType: 'image',
      encryptedSize: 100,
      contentHash: 'hash',
      isChunked: false,
      encryptionKey: 'media-key',
      performance: {
        source: 'js',
        hashSource: 'js',
        encryptSource: 'js',
        fileReadMs: 0,
        hashMs: 0,
        encryptMs: 0,
        blobBuildMs: 0,
        tempWriteMs: 0,
        authHeadersMs: 0,
        uploadMs: 0,
        metadataInsertMs: 0,
        totalMs: 0,
        sourceBytes: 4,
        uploadBytes: 100,
        isChunked: false,
      },
    })
    const onProgress = vi.fn()

    const result = await service.sendGroupMessage('group-1', '', null, [{
      id: 'local-photo',
      type: 'image',
      uri: 'file:///photo.jpg',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 4,
    }], onProgress)

    expect(result.error).toBeNull()
    expect(onProgress).toHaveBeenCalledWith({
      stage: 'attachment_upload',
      percentage: 0,
      completed: 1,
      total: 1,
    })
    expect(onProgress).toHaveBeenCalledWith({ stage: 'sending_message', percentage: 85 })
    expect(onProgress).toHaveBeenCalledWith({ stage: 'caching_locally', percentage: 95 })
    expect(onProgress).toHaveBeenCalledWith({ stage: 'complete', percentage: 100 })
    expect(mediaService.uploadEncryptedMedia).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'local-photo' }),
      'current-user',
      'group-1',
      'group:group-1',
      expect.any(Function),
    )
    expect(mockState.sendDirectControlEnvelope).toHaveBeenCalledWith(
      'member-user',
      expect.stringContaining('"type":"group_ciphertext"'),
    )
    expect(crypto.encryptMessage).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.stringContaining('[QMEDIA:media-1:media-key:image:photo.jpg:image%2Fjpeg:4:0:0:0:]'),
      expect.any(Uint8Array),
    )
  })

  it('creates groups locally and invites members over sealed control envelopes', async () => {
    const group = await service.createEncryptedGroup({
      title: 'Team',
      memberIdentityIds: ['member-user'],
    })

    expect(group.groupId).toBe('generated-id')
    expect(group.protocolVersion).toBe(2)
    expect(mockState.sendDirectControlEnvelope).toHaveBeenCalled()
    const envelope = JSON.parse(mockState.sendDirectControlEnvelope.mock.calls[0][1])
    expect(envelope.type).toBe('group_sender_key_distribution')
    expect(envelope.title).toBe('Team')
    expect(envelope.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ identityId: 'current-user', role: 'owner' }),
      expect.objectContaining({ identityId: 'member-user', role: 'member' }),
    ]))
    expect(mockState.storeGroup).toHaveBeenCalled()
  })

  it('rotates epoch keys locally when adding members', async () => {
    mockState.storeState.groups = [{ ...mockState.group, myRole: 'owner' }]

    await service.addGroupMembers('group-1', ['candidate-user'])

    expect(mockState.beginLocalEpochDistribution).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        epoch: 3,
        recipientIdentityIds: expect.arrayContaining(['current-user', 'member-user', 'candidate-user']),
      }),
    )
  })

  it('rotates epoch keys locally when removing members', async () => {
    mockState.storeState.groups = [{ ...mockState.group, myRole: 'owner' }]

    await service.removeGroupMember('group-1', 'member-user')

    expect(mockState.beginLocalEpochDistribution).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        removedIdentityIds: ['member-user'],
      }),
    )
  })

  it('wipes local epoch secrets after notifying remaining members of a leave', async () => {
    const mediaCache = await import('@/services/media/localMediaCache')
    vi.mocked(mediaCache.deleteConversationMedia).mockResolvedValue(undefined)

    await service.leaveGroup('group-1')

    expect(mockState.beginLocalEpochDistribution).toHaveBeenCalled()
    expect(mockState.clearGroupEpochSecrets).toHaveBeenCalledWith('group-1')
  })

  it('clears local group messages without leaving the group', async () => {
    const mediaCache = await import('@/services/media/localMediaCache')
    vi.mocked(mediaCache.deleteConversationMedia).mockResolvedValue(undefined)
    mockState.storeState.groups = [{
      ...mockState.group,
      lastMessage: { content: 'old', timestamp: 10, isOwn: false },
      unreadCount: 3,
    }]
    mockState.storeState.messages = {
      'group-1': [{ id: 'message-1', conversationId: 'group:group-1' }],
    }

    const result = await service.clearGroupChatLocally('group-1')

    expect(result.error).toBeNull()
    expect(mockState.clearStoredGroupMessages).toHaveBeenCalledWith('group-1')
    expect(mediaCache.deleteConversationMedia).toHaveBeenCalledWith('group:group-1')
    expect(mockState.storeState.setMessages).toHaveBeenCalledWith('group-1', [])
    expect(mockState.storeGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'group-1',
        lastMessage: undefined,
        unreadCount: 0,
      }),
    )
    expect(mockState.storeState.updateGroup).toHaveBeenCalledWith(
      'group-1',
      expect.objectContaining({
        lastMessage: undefined,
        unreadCount: 0,
      }),
    )
    expect(mockState.storeState.removeGroup).not.toHaveBeenCalled()
  })
})
