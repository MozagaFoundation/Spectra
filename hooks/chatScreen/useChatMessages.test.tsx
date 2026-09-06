/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react-native'
import { flushPromises, renderHook } from '@/test/hookTestHarness'
import { useChatMessages } from './useChatMessages'

(globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false

const MockContactIdentityChangeError = vi.hoisted(() => class extends Error {
  readonly replacement: unknown

  constructor(replacement: unknown) {
    super('Contact identity changed and must be verified before messaging')
    this.name = 'ContactIdentityChangeError'
    this.replacement = replacement
  }
})

const messageMocks = vi.hoisted(() => ({
  alert: vi.fn(),
  hapticImpact: vi.fn(async () => {}),
  hapticNotification: vi.fn(async () => {}),
  interactionsBlocked: false,
  deferredInteractionCallbacks: [] as Array<() => void>,
  appStateListeners: [] as Array<(state: string) => void>,
  chatState: {
    messages: [] as Array<Record<string, unknown>>,
    conversations: [] as Array<Record<string, unknown>>,
    contacts: [] as Array<Record<string, unknown>>,
    setActiveConversation: vi.fn(),
    warmDirectConversationIds: [] as string[],
    evictDirectConversationWindowsForPeer: vi.fn(),
    isInitialized: true,
    isLoadingMessages: false,
    isSyncingMessages: false,
    setLoadingMessages: vi.fn(),
  },
  groupState: {
    groups: [] as Array<Record<string, unknown>>,
    messages: {} as Record<string, Array<Record<string, unknown>>>,
    isLoadingMessages: false,
    isSyncingMessages: false,
    setActiveGroup: vi.fn(),
  },
  authState: { exoAddress: 'wallet-me' },
  walletState: { wallet: { address: 'wallet-me' } as { address: string } | null },
  bluetoothState: {
    status: 'ready',
    internetAvailable: true,
    config: { enabled: false },
  },
  spectreState: {
    enabled: false,
    spectreAccountMode: null as null | 'expendable' | 'standard',
  },
  conversation: {
    id: 'conv-1',
    remoteIdentityId: 'peer',
    remoteWalletAddress: 'wallet-peer',
    localWalletAddress: 'wallet-me',
    disappearingTimer: null,
  } as Record<string, unknown> | null,
  identity: { id: 'me' } as { id: string } | null,
  loadCachedMessagesForConversation: vi.fn(async () => [] as Array<any>),
  setDirectChatInteractionActive: vi.fn(),
  loadOlderMessages: vi.fn(async () => []),
  ensureConversationExists: vi.fn(async () => ({ error: null })),
  activateConversation: vi.fn(async () => ({ error: null, conversationId: 'conv-1', repaired: false })),
  acceptContactIdentityReplacement: vi.fn(async () => ({ success: true, identityId: 'identity-new' })),
  getPendingContactIdentityReplacement: vi.fn(async () => undefined as any),
  deactivateConversation: vi.fn(),
  markConversationAsRead: vi.fn(async () => {}),
  persistDirectMessageLocalOrder: vi.fn(async () => {}),
  scheduleDirectSendReadiness: vi.fn(),
  loadCachedGroupMessages: vi.fn(async () => [] as Array<any>),
  loadGroupMessages: vi.fn(async () => {}),
  loadOlderGroupMessages: vi.fn(async () => ({ messages: [] as Array<any>, hasMore: false })),
  markGroupAsRead: vi.fn(async () => {}),
  sendChatMessage: vi.fn(async () => ({ error: null })),
  sendGroupMessage: vi.fn(async () => ({ error: null })),
  sendReaction: vi.fn(async () => ({ error: null })),
  sendGroupReaction: vi.fn(async () => ({ error: null })),
  deleteMessageForAll: vi.fn(async () => ({ error: null })),
  deleteMessageLocally: vi.fn(async () => ({ error: null })),
  deleteGroupMessageForAll: vi.fn(async () => ({ error: null })),
  loadUserTags: vi.fn(async () => []),
  recordChatDiagnostic: vi.fn(),
}))

vi.mock('react-native', () => ({
  Alert: { alert: messageMocks.alert },
  AppState: {
    currentState: 'active',
    addEventListener: (_event: string, listener: (state: string) => void) => {
      messageMocks.appStateListeners.push(listener)
      return {
        remove: () => {
          messageMocks.appStateListeners = messageMocks.appStateListeners.filter(
            (entry) => entry !== listener,
          )
        },
      }
    },
  },
  InteractionManager: {
    runAfterInteractions: (callback: () => void) => {
      if (messageMocks.interactionsBlocked) {
        messageMocks.deferredInteractionCallbacks.push(callback)
      } else {
        callback()
      }
      return { cancel: vi.fn() }
    },
  },
  View: 'View',
}))

vi.mock('expo-haptics', () => ({
  impactAsync: messageMocks.hapticImpact,
  notificationAsync: messageMocks.hapticNotification,
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: { Success: 'success' },
}))

vi.mock('zustand/react/shallow', () => ({
  useShallow: <T,>(selector: T) => selector,
}))

vi.mock('@/store/chatStore', () => {
  const getMockChatState = () => {
    const messagesByConversationId = new Map<string, Array<Record<string, unknown>>>()
    for (const message of messageMocks.chatState.messages) {
      const conversationId = String(message.conversationId)
      messagesByConversationId.set(conversationId, [
        ...(messagesByConversationId.get(conversationId) || []),
        message,
      ])
    }
    return { ...messageMocks.chatState, _messagesByConversationId: messagesByConversationId }
  }
  const useChatStore = (
    selector: (state: ReturnType<typeof getMockChatState>) => unknown,
  ) => selector(getMockChatState())
  useChatStore.getState = getMockChatState
  return { useChatStore }
})

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof messageMocks.authState) => unknown) => selector(messageMocks.authState),
}))

vi.mock('@/store/groupChatStore', () => ({
  useGroupChatStore: (selector: (state: typeof messageMocks.groupState) => unknown) => selector(messageMocks.groupState),
}))

vi.mock('@/store/bluetoothStore', () => ({
  useBluetoothStore: (selector: (state: typeof messageMocks.bluetoothState) => unknown) => selector(messageMocks.bluetoothState),
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: typeof messageMocks.spectreState) => unknown) => selector(messageMocks.spectreState),
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: typeof messageMocks.walletState) => unknown) => selector(messageMocks.walletState),
}))

vi.mock('@/services/chat/chatService', () => ({
  sendMessage: messageMocks.sendChatMessage,
  DIRECT_CHAT_CACHE_PAGE_SIZE: 25,
  loadCachedMessagesForConversation: messageMocks.loadCachedMessagesForConversation,
  setDirectChatInteractionActive: messageMocks.setDirectChatInteractionActive,
  getConversation: () => messageMocks.conversation,
  ensureConversationExists: messageMocks.ensureConversationExists,
  activateConversation: messageMocks.activateConversation,
  deactivateConversation: messageMocks.deactivateConversation,
  markConversationAsRead: messageMocks.markConversationAsRead,
  persistDirectMessageLocalOrder: messageMocks.persistDirectMessageLocalOrder,
  scheduleDirectSendReadiness: vi.fn(),
  resolveIdentityId: (value: string) => value,
  sendReaction: messageMocks.sendReaction,
  consumeViewOnceMessage: vi.fn(async () => ({ error: null })),
  revealViewOnceMessage: vi.fn(async () => ({ error: null })),
  deleteMessageForAll: messageMocks.deleteMessageForAll,
  deleteMessageLocally: messageMocks.deleteMessageLocally,
}))

vi.mock('@/services/groupChat', () => ({
  loadCachedGroupMessages: messageMocks.loadCachedGroupMessages,
  loadGroupMessages: messageMocks.loadGroupMessages,
  loadOlderGroupMessages: messageMocks.loadOlderGroupMessages,
  markGroupAsRead: messageMocks.markGroupAsRead,
  sendGroupMessage: messageMocks.sendGroupMessage,
  sendGroupReaction: messageMocks.sendGroupReaction,
  deleteGroupMessageForAll: messageMocks.deleteGroupMessageForAll,
}))

vi.mock('@/services/quantumChat', () => ({
  ContactIdentityChangeError: MockContactIdentityChangeError,
  loadOlderMessages: messageMocks.loadOlderMessages,
  acceptContactIdentityReplacement: messageMocks.acceptContactIdentityReplacement,
  getPendingContactIdentityReplacement: messageMocks.getPendingContactIdentityReplacement,
  getIdentity: () => messageMocks.identity,
}))

vi.mock('@/lib/i18n', () => ({
  translate: (key: string) => key,
}))

vi.mock('@/lib/utils', () => ({
  formatAddress: (value: string) => `formatted:${value}`,
  groupMessagesByDate: (messages: Array<Record<string, unknown>>) => [{ date: 'Today', messages }],
}))

vi.mock('@/services/chat/tagService', () => ({
  loadUserTags: messageMocks.loadUserTags,
}))

vi.mock('@/services/media/editedImageCache', () => ({
  cleanupEditedAttachments: vi.fn(async () => {}),
}))

vi.mock('@/lib/accountScope', () => ({
  isSameAccountStorageScope: (a?: string | null, b?: string | null) => !a || !b || a === b,
  matchesStrictAccountStorageScope: (a?: string | null, b?: string | null) => a === b,
}))

vi.mock('@/lib/errorDisplay', () => ({
  getErrorDisplayMessage: (error: Error) => error.message,
}))

vi.mock('@/lib/viewOnce', () => ({
  getChatMessagePreviewText: (message: { content?: string }) => message.content || '',
  isLockedOneTimeMessage: () => false,
}))

vi.mock('@/services/chat/chatDiagnostics', () => ({
  recordChatDiagnostic: messageMocks.recordChatDiagnostic,
}))

vi.mock('@spectra/core-crypto/client/attachmentDiagnostics', () => ({
  ATTACHMENT_PIPELINE_EVENT_NAME: 'attachment_pipeline',
  buildAttachmentPipelineFields: (_stage: string, fields: Record<string, unknown>) => fields,
  createAttachmentSendTrace: () => ({ attachmentSendId: 'trace-1', sendStartedAt: 1 }),
}))

function createMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'message-1',
    conversationId: 'conv-1',
    senderId: 'peer',
    content: 'hello',
    timestamp: 1,
    status: 'sent',
    ...overrides,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

function renderMessages(overrides: Partial<Parameters<typeof useChatMessages>[0]> = {}) {
  return renderHook(() => useChatMessages({
    address: 'peer',
    localWalletAddress: 'wallet-me',
    isGroup: false,
    groupId: null,
    contactName: 'Peer',
    contactWalletAddress: 'wallet-peer',
    ...overrides,
  }))
}

describe('useChatMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    messageMocks.chatState.evictDirectConversationWindowsForPeer.mockReset()
    messageMocks.interactionsBlocked = false
    messageMocks.deferredInteractionCallbacks = []
    messageMocks.appStateListeners = []
    messageMocks.chatState.messages = [createMessage()]
    messageMocks.chatState.warmDirectConversationIds = []
    messageMocks.chatState.conversations = [{
      id: 'conv-1',
      remoteIdentityId: 'peer',
      remoteWalletAddress: 'wallet-peer',
      localWalletAddress: 'wallet-me',
      lastMessage: { timestamp: 1 },
    }]
    messageMocks.chatState.contacts = [{
      identityId: 'peer',
      walletAddress: 'wallet-peer',
      localWalletAddress: 'wallet-me',
      displayName: 'Peer',
    }]
    messageMocks.chatState.isInitialized = true
    messageMocks.groupState.groups = [{ groupId: 'group-1', title: 'Group', lastMessage: { timestamp: 1 } }]
    messageMocks.groupState.messages = {
      'group-1': [createMessage({ id: 'group-message-1', conversationId: 'group-1' })],
    }
    messageMocks.authState.exoAddress = 'wallet-me'
    messageMocks.walletState.wallet = { address: 'wallet-me' }
    messageMocks.bluetoothState.status = 'ready'
    messageMocks.bluetoothState.internetAvailable = true
    messageMocks.bluetoothState.config = { enabled: false }
    messageMocks.conversation = {
      id: 'conv-1',
      remoteIdentityId: 'peer',
      remoteWalletAddress: 'wallet-peer',
      localWalletAddress: 'wallet-me',
      disappearingTimer: null,
    }
    messageMocks.identity = { id: 'me' }
    messageMocks.loadCachedMessagesForConversation.mockResolvedValue([])
    messageMocks.loadCachedGroupMessages.mockResolvedValue([])
    messageMocks.ensureConversationExists.mockResolvedValue({ error: null })
    messageMocks.activateConversation.mockResolvedValue({ error: null, conversationId: 'conv-1', repaired: false })
    messageMocks.acceptContactIdentityReplacement.mockResolvedValue({ success: true, identityId: 'identity-new' })
    messageMocks.getPendingContactIdentityReplacement.mockResolvedValue(undefined)
    messageMocks.sendChatMessage.mockResolvedValue({ error: null })
    messageMocks.sendGroupMessage.mockResolvedValue({ error: null })
  })

  it('sends direct messages', async () => {
    const harness = renderMessages()

    await act(async () => {
      await flushPromises()
      await flushPromises()
    })
    expect(harness.result.directChatBootstrap.stage).toBe('ready')

    await act(async () => {
      await harness.result.handleSend('hello')
    })

    expect(messageMocks.sendChatMessage).toHaveBeenCalledWith(
      'wallet-me',
      'peer',
      'hello',
      undefined,
      undefined,
      null,
      undefined,
      undefined,
    )
  })

  it('shows a replacement verification after sending discovers a new identity', async () => {
    const replacement = {
      reason: 'identity_replacement_required' as const,
      oldIdentityId: 'peer',
      newIdentityId: 'peer-new',
      walletAddress: 'wallet-peer',
      safetyNumber: {
        numeric: '123451234512345123451234512345123451234512345123451234512345',
        qrData: 'spectra:safety:v1:test',
        fingerprint: '1234 5678',
        fullHash: 'a'.repeat(64),
      },
      walletAuthorized: true as const,
    }
    messageMocks.sendChatMessage.mockResolvedValueOnce({
      error: new MockContactIdentityChangeError(replacement),
    } as any)
    const harness = renderMessages()
    await act(async () => {
      await flushPromises()
      await flushPromises()
    })

    await act(async () => {
      const admission = harness.result.handleSend('hello')
      if (!admission.accepted) {
        throw new Error('Expected direct send admission')
      }
      await admission.completion
      await flushPromises()
    })

    expect(harness.result.directChatBootstrap).toEqual(expect.objectContaining({
      stage: 'failed',
      reason: 'verification_failed',
      identityReplacement: replacement,
    }))
    expect(messageMocks.deactivateConversation).toHaveBeenCalled()
    expect(messageMocks.alert).not.toHaveBeenCalled()
  })

  it('loads pending replacement verification when opening a direct chat', async () => {
    const replacement = {
      reason: 'identity_replacement_required' as const,
      oldIdentityId: 'peer',
      newIdentityId: 'peer-new',
      walletAddress: 'wallet-peer',
      safetyNumber: {
        numeric: '123451234512345123451234512345123451234512345123451234512345',
        qrData: 'spectra:safety:v1:test',
        fingerprint: '1234 5678',
        fullHash: 'a'.repeat(64),
      },
      walletAuthorized: true as const,
    }
    messageMocks.chatState.contacts = [{
      identityId: 'peer',
      walletAddress: 'wallet-peer',
      localWalletAddress: 'wallet-me',
      displayName: 'Peer',
    }]
    messageMocks.getPendingContactIdentityReplacement.mockResolvedValue(replacement)
    const onDirectIdentityReplacementAccepted = vi.fn()

    const harness = renderMessages({ onDirectIdentityReplacementAccepted })
    await act(async () => {
      await flushPromises()
      await flushPromises()
      await flushPromises()
    })

    expect(messageMocks.getPendingContactIdentityReplacement).toHaveBeenCalledWith(
      'peer',
      'wallet-peer',
    )
    expect(harness.result.directChatBootstrap).toEqual(expect.objectContaining({
      stage: 'failed',
      reason: 'verification_failed',
      identityReplacement: replacement,
    }))

    await act(async () => {
      await harness.result.handleAcceptDirectIdentityReplacement()
    })

    expect(onDirectIdentityReplacementAccepted).toHaveBeenCalledWith('identity-new')
  })

  it('loads pending replacement verification after an inbound identity lock', async () => {
    const replacement = {
      reason: 'identity_replacement_required' as const,
      oldIdentityId: 'peer',
      newIdentityId: 'peer-new',
      walletAddress: 'wallet-peer',
      safetyNumber: {
        numeric: '123451234512345123451234512345123451234512345123451234512345',
        qrData: 'spectra:safety:v1:test',
        fingerprint: '1234 5678',
        fullHash: 'a'.repeat(64),
      },
      walletAuthorized: true as const,
    }
    messageMocks.getPendingContactIdentityReplacement
      .mockResolvedValueOnce(undefined as any)
      .mockResolvedValueOnce(replacement)
    const harness = renderMessages()
    await act(async () => {
      await flushPromises()
    })

    messageMocks.chatState.contacts = [{
      identityId: 'peer',
      walletAddress: 'wallet-peer',
      localWalletAddress: 'wallet-me',
      displayName: 'Peer',
      identityChanged: true,
      trustState: 'changed',
    }]
    await act(async () => {
      harness.rerender()
      await flushPromises()
      await flushPromises()
    })

    expect(harness.result.directChatBootstrap).toEqual(expect.objectContaining({
      stage: 'failed',
      reason: 'verification_failed',
      identityReplacement: replacement,
    }))
  })

  it('opens a direct chat without directory activation', async () => {
    messageMocks.interactionsBlocked = true

    const harness = renderMessages()
    await act(async () => {
      await flushPromises()
      await flushPromises()
    })

    expect(harness.result.directChatBootstrap.stage).toBe('ready')
    expect(messageMocks.activateConversation).not.toHaveBeenCalled()
  })

  it('renders a validated routed thread while encrypted history loads', async () => {
    const cachedMessages = createDeferred<Array<any>>()
    messageMocks.conversation = null
    messageMocks.loadCachedMessagesForConversation.mockReturnValue(cachedMessages.promise)

    const harness = renderMessages({ directConversationId: 'conv-1' })
    await act(async () => {
      await flushPromises()
    })

    expect(messageMocks.chatState.setActiveConversation).toHaveBeenCalledWith('conv-1')
    expect(messageMocks.loadCachedMessagesForConversation).toHaveBeenCalledWith('peer', {
      conversationId: 'conv-1',
    })
    expect(harness.result.flatListData).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'message-1', type: 'message' }),
    ]))
    expect(harness.result.directHistoryReady).toBe(false)

    await act(async () => {
      cachedMessages.resolve([createMessage()])
      await flushPromises()
    })

    expect(harness.result.directHistoryReady).toBe(true)
  })

  it('renders a warm snapshot without rehydrating encrypted cache', async () => {
    messageMocks.conversation = null
    messageMocks.chatState.warmDirectConversationIds = ['conv-1']

    const harness = renderMessages({ directConversationId: 'conv-1' })
    await act(async () => {
      await flushPromises()
    })

    expect(harness.result.directHistoryReady).toBe(true)
    expect(harness.result.flatListData).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'message-1', type: 'message' }),
    ]))
    expect(messageMocks.loadCachedMessagesForConversation).not.toHaveBeenCalled()
  })

  it('loads deleted-chat history locally without directory activation', async () => {
    messageMocks.chatState.conversations = [{
      ...messageMocks.chatState.conversations[0],
      remoteAccountState: 'deleted',
    }]
    messageMocks.chatState.contacts = [{
      ...messageMocks.chatState.contacts[0],
      remoteAccountState: 'deleted',
    }]

    const harness = renderMessages()
    await act(async () => {
      await flushPromises()
    })

    expect(harness.result.directChatBootstrap.stage).toBe('ready')
    expect(messageMocks.loadCachedMessagesForConversation).toHaveBeenCalledWith('peer')
    expect(messageMocks.activateConversation).not.toHaveBeenCalled()
  })

  it('does not use a routed thread that belongs to another peer', async () => {
    messageMocks.conversation = null
    messageMocks.chatState.conversations = [{
      id: 'conv-other',
      remoteIdentityId: 'other-peer',
      remoteWalletAddress: 'wallet-other',
      localWalletAddress: 'wallet-me',
    }]
    messageMocks.chatState.messages = [
      createMessage({ conversationId: 'conv-other', senderId: 'other-peer' }),
    ]

    const harness = renderMessages({ directConversationId: 'conv-other' })
    await act(async () => {
      await flushPromises()
    })

    expect(messageMocks.loadCachedMessagesForConversation).toHaveBeenCalledWith('peer')
    expect(harness.result.flatListData).toEqual([])
  })

  it('routes group sends to the group service', async () => {
    const groupHarness = renderMessages({ isGroup: true, groupId: 'group-1' })
    await act(async () => {
      await groupHarness.result.handleSend('group hello')
    })

    expect(messageMocks.sendGroupMessage).toHaveBeenCalledWith('group-1', 'group hello', null, undefined, undefined)
  })

  it('loads cached group history before the chat runtime is ready and retries after initialization', async () => {
    messageMocks.chatState.isInitialized = false
    const harness = renderMessages({ isGroup: true, groupId: 'group-1' })
    await act(async () => {
      await flushPromises()
    })

    expect(messageMocks.loadCachedGroupMessages).toHaveBeenCalledWith('group-1', 'wallet-me')
    expect(messageMocks.loadGroupMessages).not.toHaveBeenCalled()

    messageMocks.chatState.isInitialized = true
    harness.rerender()
    await act(async () => {
      await flushPromises()
    })

    expect(messageMocks.loadGroupMessages).toHaveBeenCalledWith('group-1')
  })

  it('reloads cached direct history after background if the window is empty', async () => {
    messageMocks.chatState.messages = []

    renderMessages({ directConversationId: 'conv-1' })
    await act(async () => {
      await flushPromises()
    })
    messageMocks.loadCachedMessagesForConversation.mockClear()

    await act(async () => {
      for (const listener of messageMocks.appStateListeners) {
        listener('background')
      }
    })
    await act(async () => {
      for (const listener of messageMocks.appStateListeners) {
        listener('active')
      }
    })
    await act(async () => {
      await flushPromises()
    })

    expect(messageMocks.loadCachedMessagesForConversation).toHaveBeenCalledWith('peer', {
      conversationId: 'conv-1',
    })
  })

  it('does not reload cached direct history after background when messages are still in memory', async () => {
    renderMessages({ directConversationId: 'conv-1' })
    await act(async () => {
      await flushPromises()
    })
    messageMocks.loadCachedMessagesForConversation.mockClear()

    await act(async () => {
      for (const listener of messageMocks.appStateListeners) {
        listener('background')
      }
    })
    await act(async () => {
      for (const listener of messageMocks.appStateListeners) {
        listener('active')
      }
    })

    expect(messageMocks.loadCachedMessagesForConversation).not.toHaveBeenCalled()
  })

  it('does not activate or derive a blurred chat screen', async () => {
    const harness = renderMessages({ isFocused: false })
    await act(async () => {
      await flushPromises()
    })

    expect(harness.result.allMessages).toEqual([])
    expect(messageMocks.loadCachedMessagesForConversation).not.toHaveBeenCalled()
    expect(messageMocks.activateConversation).not.toHaveBeenCalled()
  })

  it('blocks attachments while Bluetooth mesh is the active direct-chat transport', async () => {
    messageMocks.bluetoothState.config = { enabled: true }
    messageMocks.bluetoothState.internetAvailable = false
    const harness = renderMessages()

    await act(async () => {
      await harness.result.handleSend('media', [{ id: 'a1', type: 'image', uri: 'file://image.jpg' } as never])
    })

    expect(messageMocks.alert).toHaveBeenCalledWith(
      'Bluetooth mesh supports text only',
      expect.stringContaining('Bluetooth mesh'),
    )
    expect(messageMocks.sendChatMessage).not.toHaveBeenCalled()
  })

  it('marks same-length incoming message updates as read', async () => {
    const harness = renderMessages()
    await flushPromises()
    messageMocks.markConversationAsRead.mockClear()

    messageMocks.chatState.messages = [
      createMessage({ id: 'message-1', status: 'delivered', timestamp: 2 }),
    ]
    harness.rerender()

    expect(messageMocks.markConversationAsRead).toHaveBeenCalledWith('peer')
  })

  it('selects cached messages without remote conversation verification', async () => {
    const cachedMessage = createMessage({
      conversationId: 'persisted-conversation',
      id: 'cached-message',
    })
    messageMocks.chatState.messages = []
    messageMocks.chatState.conversations = []
    messageMocks.conversation = {
      id: 'pending_peer',
      remoteIdentityId: 'peer',
      remoteWalletAddress: 'wallet-peer',
      localWalletAddress: 'wallet-me',
      disappearingTimer: null,
    }
    messageMocks.loadCachedMessagesForConversation.mockImplementation(async () => {
      messageMocks.chatState.messages = [cachedMessage]
      return [cachedMessage]
    })

    const harness = renderMessages()
    await act(async () => {
      await flushPromises()
    })

    expect(harness.result.allMessages.map((message) => message.id)).toEqual(['cached-message'])
    expect(harness.result.directChatBootstrap.stage).toBe('ready')
    expect(messageMocks.activateConversation).not.toHaveBeenCalled()
    await act(async () => {
      await harness.result.handleSend('send after local render')
    })
    expect(messageMocks.sendChatMessage).toHaveBeenCalled()
  })

  it('does not wait for cached history before enabling a local conversation', async () => {
    const cachedMessages = createDeferred<Array<Record<string, unknown>>>()
    messageMocks.loadCachedMessagesForConversation.mockReturnValue(cachedMessages.promise)

    const harness = renderMessages()
    await act(async () => {
      await flushPromises()
    })

    expect(harness.result.directChatBootstrap.stage).toBe('ready')
    expect(messageMocks.activateConversation).not.toHaveBeenCalled()

    cachedMessages.resolve([])
    await act(async () => {
      await flushPromises()
      await flushPromises()
    })

    expect(harness.result.directChatBootstrap.stage).toBe('ready')
  })

  it('uses persisted local order timestamps for direct chat display order', async () => {
    messageMocks.chatState.messages = [
      createMessage({ id: 'message-a', timestamp: 1, localOrderTimestamp: 1 }),
      createMessage({ id: 'message-d', timestamp: 4, localOrderTimestamp: 4 }),
      createMessage({ id: 'message-e', timestamp: 5, localOrderTimestamp: 5 }),
      createMessage({ id: 'message-b', timestamp: 2, localOrderTimestamp: 2 }),
      createMessage({ id: 'message-c', timestamp: 3, localOrderTimestamp: 3 }),
    ]

    const harness = renderMessages()
    await act(async () => {
      await flushPromises()
    })

    expect(harness.result.allMessages.map((message) => message.id)).toEqual([
      'message-a',
      'message-b',
      'message-c',
      'message-d',
      'message-e',
    ])
  })

  it('renders the newest 50 messages and expands history only on request', async () => {
    messageMocks.chatState.messages = Array.from({ length: 75 }, (_, index) => createMessage({
      id: `message-${index + 1}`,
      timestamp: index + 1,
      localOrderTimestamp: index + 1,
    }))
    const harness = renderMessages()
    await act(async () => {
      await flushPromises()
    })

    expect(harness.result.flatListData
      .filter((item) => item.type === 'message')
      .map((item) => item.message.id)).toEqual(
      Array.from({ length: 50 }, (_, index) => `message-${index + 26}`),
    )
    expect(harness.result.hasOlderMessages).toBe(true)

    await act(async () => {
      await harness.result.handleLoadOlder()
    })

    expect(messageMocks.loadOlderMessages).not.toHaveBeenCalled()
    expect(harness.result.flatListData.filter((item) => item.type === 'message')).toHaveLength(75)
  })

  it('loads older group history from the oldest message id cursor', async () => {
    const cachedMessages = Array.from({ length: 50 }, (_, index) => createMessage({
      id: `group-message-${index + 51}`,
      conversationId: 'group:group-1',
      groupId: 'group-1',
      timestamp: index + 51,
      localOrderTimestamp: index + 51,
    }))
    messageMocks.groupState.messages = {
      'group-1': cachedMessages,
    }
    messageMocks.loadCachedGroupMessages.mockResolvedValueOnce(cachedMessages)
    messageMocks.loadOlderGroupMessages.mockResolvedValueOnce({
      messages: [createMessage({
        id: 'group-message-50',
        conversationId: 'group:group-1',
        groupId: 'group-1',
        timestamp: 50,
      })],
      hasMore: false,
    })
    const harness = renderMessages({
      address: 'group-group-1',
      isGroup: true,
      groupId: 'group-1',
    })
    await act(async () => {
      await flushPromises()
    })

    await act(async () => {
      await harness.result.handleLoadOlder()
    })

    expect(messageMocks.loadOlderGroupMessages).toHaveBeenCalledWith(
      'group-1',
      'group-message-51',
      50,
    )
    expect(harness.result.hasOlderMessages).toBe(false)
  })

  it('reuses unchanged list rows when one message status changes', async () => {
    const firstMessage = createMessage({ id: 'message-a', timestamp: 1 })
    const secondMessage = createMessage({ id: 'message-b', timestamp: 2 })
    messageMocks.chatState.messages = [firstMessage, secondMessage]
    const harness = renderMessages()
    await act(async () => {
      await flushPromises()
      await flushPromises()
    })
    const initialRows = harness.result.flatListData.filter((item) => item.type === 'message')

    messageMocks.chatState.messages = [
      firstMessage,
      { ...secondMessage, status: 'delivered' },
    ]
    await act(async () => {
      harness.rerender()
    })
    const updatedRows = harness.result.flatListData.filter((item) => item.type === 'message')

    expect(updatedRows[0]).toBe(initialRows[0])
    expect(updatedRows[1]).not.toBe(initialRows[1])
  })

  it('omits deleted direct and group messages from the rendered list data', () => {
    messageMocks.chatState.messages = [
      createMessage({ id: 'visible-direct', timestamp: 1 }),
      createMessage({ id: 'deleted-direct', deleted: true, timestamp: 2 }),
    ]
    const directHarness = renderMessages()

    expect(directHarness.result.flatListData.filter((item) => item.type === 'message').map((item) => item.message.id)).toEqual([
      'visible-direct',
    ])

    messageMocks.groupState.messages = {
      'group-1': [
        createMessage({ id: 'visible-group', conversationId: 'group-1', timestamp: 1 }),
        createMessage({ id: 'deleted-group', conversationId: 'group-1', deleted: true, timestamp: 2 }),
      ],
    }
    const groupHarness = renderMessages({ isGroup: true, groupId: 'group-1' })

    expect(groupHarness.result.flatListData.filter((item) => item.type === 'message').map((item) => item.message.id)).toEqual([
      'visible-group',
    ])
  })

  it('does not offer direct delete-for-everyone for messages authored by the peer', async () => {
    const harness = renderMessages()
    await flushPromises()

    await act(async () => {
      harness.result.handleMessageLongPress(createMessage({ id: 'message-peer', senderId: 'peer' }) as never)
    })
    await act(async () => {
      harness.result.handleDelete()
    })

    const buttons = messageMocks.alert.mock.calls.at(-1)?.[2] as Array<{ text: string }>
    expect(buttons.map((button) => button.text)).toEqual(['Cancel', 'Delete for me'])
  })

  it('does not activate a persisted identity-changed contact', async () => {
    messageMocks.chatState.contacts = [{
      ...messageMocks.chatState.contacts[0],
      trustState: 'changed',
      identityChanged: true,
    }]
    messageMocks.chatState.evictDirectConversationWindowsForPeer.mockImplementation(() => {
      messageMocks.chatState.messages = []
      messageMocks.chatState.warmDirectConversationIds = []
    })

    const harness = renderMessages({ directConversationId: 'conv-1' })
    await act(async () => {
      await flushPromises()
    })

    expect(harness.result.directChatBootstrap.stage).toBe('failed')
    expect(messageMocks.activateConversation).not.toHaveBeenCalled()
    expect(messageMocks.loadCachedMessagesForConversation).not.toHaveBeenCalled()
    expect(messageMocks.chatState.evictDirectConversationWindowsForPeer).toHaveBeenCalledWith('peer')
    expect(harness.result.flatListData).toEqual([])
  })

  it('offers direct delete-for-everyone for messages authored by the local identity', async () => {
    const harness = renderMessages()
    await flushPromises()

    await act(async () => {
      harness.result.handleMessageLongPress(createMessage({ id: 'message-own', senderId: 'me' }) as never)
    })
    await act(async () => {
      harness.result.handleDelete()
    })

    const buttons = messageMocks.alert.mock.calls.at(-1)?.[2] as Array<{ text: string }>
    expect(buttons.map((button) => button.text)).toContain('Delete for everyone')
  })
})
