/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaAttachment } from '@/lib/types'
import type { AddressBookSnapshot } from '@/lib/types'

const MockContactIdentityChangeError = vi.hoisted(() => class extends Error {
  readonly replacement?: {
    reason: 'identity_replacement_required'
    oldIdentityId: string
    newIdentityId: string
    walletAddress: string
    safetyNumber: {
      numeric: string
      qrData: string
      fingerprint: string
      fullHash: string
    }
    walletAuthorized: true
  }

  constructor(replacement?: {
    reason: 'identity_replacement_required'
    oldIdentityId: string
    newIdentityId: string
    walletAddress: string
    safetyNumber: {
      numeric: string
      qrData: string
      fingerprint: string
      fullHash: string
    }
    walletAuthorized: true
  }) {
    super('Contact identity changed and must be verified before messaging')
    this.replacement = replacement
  }
})

const quantumSendMessage = vi.fn()
const quantumSendMediaMessage = vi.fn()
const quantumRetryStoredFailedMessage = vi.fn()
const quantumVerifyContactBundle = vi.fn()
const quantumAssertContactIdentityTrusted = vi.fn()
const quantumPrewarmDirectChatTransportAccess = vi.fn()
const quantumGetOrCreateConversation = vi.fn()
const quantumTryOpenLocalConversation = vi.fn()
const quantumSetActiveConversation = vi.fn()
const quantumMarkLocalConversationAsRead = vi.fn()
const quantumAddContactByAddress = vi.fn()
const quantumConsumeDirectViewOnceMessage = vi.fn()
const quantumArmDirectConversationMessagesOnLocalRead = vi.fn(async () => {})
const quantumLoadCachedMessages = vi.fn()
const quantumInitializeChat = vi.fn(async () => true)
const quantumIsChatInitialized = vi.fn(() => true)
const quantumReconcileChat = vi.fn()
const safetyNumber = {
  numeric: '123451234512345123451234512345123451234512345123451234512345',
  qrData: 'spectra:safety:v1:test',
  fingerprint: '1234 5678',
  fullHash: 'a'.repeat(64),
}
const updateActiveAddressBookSnapshot = vi.fn()
const deleteSessionRecord = vi.fn(async () => {})
const clearDirectConversationLocally = vi.fn(async () => {})
const deleteDirectConversationLocally = vi.fn(async () => {})
const deleteBackendMessage = vi.fn(async () => {})
const dismissNotificationsForConversation = vi.fn(async () => {})
const reconcileDirectUnreadState = vi.fn(async () => ({ applied: true, unreadCount: 0 }))
const deleteDirectMessagesAndReconcile = vi.fn(async () => ({ applied: true, unreadCount: 0 }))
const localGetMessage = vi.fn()
const localGetDecryptedMessage = vi.fn()
const localStoreMessage = vi.fn(async () => {})
const localUpdateDecryptedMessage = vi.fn(async () => {})
const chatIdentity = { id: 'identity-me' }
let spectreModeEnabled = false
let activeWalletAddress: string | null = null
let remoteChatServiceAvailable = true

type MockStoreState = {
  isInitialized: boolean
  contacts: Array<{
    identityId: string
    localWalletAddress?: string
    walletAddress?: string
    displayName?: string
    addedAt?: number
    trustState?: string
    identityChanged?: boolean
    identityVerifiedAt?: number
    isSaved?: boolean
    isHidden?: boolean
  }>
  conversations: Array<{
    id: string
    type?: 'direct' | 'group'
    localWalletAddress?: string
    remoteIdentityId: string
    remoteWalletAddress?: string
    createdAt?: number
    updatedAt?: number
    hasVisibleActivity?: boolean
    disappearingTimer?: {
      durationMs: number
      trigger: 'after_send' | 'after_read'
      fallbackDurationMs?: number
    } | null
  }>
  setInitializing: ReturnType<typeof vi.fn>
  setInitialized: ReturnType<typeof vi.fn>
  setSyncingMessages: ReturnType<typeof vi.fn>
  setActiveConversation: ReturnType<typeof vi.fn>
  warmDirectConversation: ReturnType<typeof vi.fn>
  evictDirectConversationWindow: ReturnType<typeof vi.fn>
  evictDirectConversationWindowsForPeer: ReturnType<typeof vi.fn>
  addConversation: ReturnType<typeof vi.fn>
  addMessage: ReturnType<typeof vi.fn>
  updateConversation: ReturnType<typeof vi.fn>
  updateContact: ReturnType<typeof vi.fn>
  updateMessage: ReturnType<typeof vi.fn>
  addReaction: ReturnType<typeof vi.fn>
  messages: Array<{
    id: string
    conversationId: string
    senderId: string
  }>
}

let storeState: MockStoreState

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createEmptyAddressBookSnapshot(): AddressBookSnapshot {
  return {
    version: 1,
    ownerWalletAddress: 'EXO00owner0000000000000000000000000000000000',
    entries: [],
    tags: [],
  }
}

const reactNativeMocks = vi.hoisted(() => ({
  alert: vi.fn(),
  turboModuleGet: vi.fn(() => null),
  turboModuleGetEnforcing: vi.fn(() => ({})),
}))

vi.stubGlobal('__DEV__', false)

vi.mock('react-native', () => ({
  Alert: {
    alert: reactNativeMocks.alert,
  },
  NativeModules: {},
  Platform: {
    OS: 'ios',
    select: (options: Record<string, unknown>) => (
      options.ios ?? options.native ?? options.default ?? undefined
    ),
  },
  TurboModuleRegistry: {
    get: reactNativeMocks.turboModuleGet,
    getEnforcing: reactNativeMocks.turboModuleGetEnforcing,
  },
}))

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en' }],
}))

vi.mock('./ephemeralDiscoveryCoordinator', () => ({
  restorePersistedOneTimeContactCard: vi.fn(async () => {}),
}))

vi.mock('../quantumChat', () => ({
  ContactIdentityChangeError: MockContactIdentityChangeError,
  initializeQuantumChat: quantumInitializeChat,
  cleanupQuantumChat: vi.fn(),
  waitForQuantumChatQuiescence: vi.fn(async () => {}),
  realignQuantumChatForActiveWallet: vi.fn(async () => true),
  isQuantumChatInitialized: quantumIsChatInitialized,
  reconcileQuantumChat: quantumReconcileChat,
  getOrCreateConversation: quantumGetOrCreateConversation,
  tryOpenLocalConversation: quantumTryOpenLocalConversation,
  setActiveConversation: quantumSetActiveConversation,
  markLocalConversationAsRead: quantumMarkLocalConversationAsRead,
  sendMessage: quantumSendMessage,
  sendMediaMessage: quantumSendMediaMessage,
  retryStoredFailedMessage: quantumRetryStoredFailedMessage,
  armDirectConversationMessagesOnLocalRead: quantumArmDirectConversationMessagesOnLocalRead,
  consumeDirectViewOnceMessage: quantumConsumeDirectViewOnceMessage,
  DIRECT_CHAT_CACHE_PAGE_SIZE: 25,
  loadCachedMessages: quantumLoadCachedMessages,
  setDirectChatInteractionActive: vi.fn(),
  loadCachedConversations: vi.fn(),
  hydrateLocalContacts: vi.fn(),
  loadMessages: vi.fn(),
  addContactByAddress: quantumAddContactByAddress,
  assertContactIdentityTrusted: quantumAssertContactIdentityTrusted,
  verifyContactBundle: quantumVerifyContactBundle,
  prewarmDirectChatTransportAccess: quantumPrewarmDirectChatTransportAccess,
  getMyPublicKeyBundle: vi.fn(),
  getSafetyNumber: vi.fn(),
  getIdentity: vi.fn(() => chatIdentity),
  getQuantumChatClient: vi.fn(() => null),
  getQueuedDeliveryState: vi.fn(() => ({ deliveryStage: 'queued', deliveryHint: 'Queued' })),
  getFailedDeliveryState: vi.fn(() => ({ deliveryStage: 'failed', deliveryHint: 'Failed' })),
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: {
    getState: () => storeState,
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      wallet: activeWalletAddress ? { address: activeWalletAddress } : null,
    }),
  },
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: {
    getState: () => ({ enabled: spectreModeEnabled }),
  },
}))

vi.mock('../backend/client', () => ({
  deleteConversationMessages: vi.fn(async () => {}),
  deleteMessage: deleteBackendMessage,
}))

vi.mock('../storage/addressBookStorage', () => ({
  updateActiveAddressBookSnapshot,
}))

vi.mock('../media/localMediaCache', () => ({
  deleteConversationMedia: vi.fn(async () => {}),
}))

vi.mock('../notifications/pushService', () => ({
  syncGlobalBadge: vi.fn(async () => {}),
  dismissNotificationsForConversation,
}))

vi.mock('../quantumChat/directConversationCleanup', () => ({
  clearDirectConversationLocally,
  deleteDirectConversationLocally,
}))

vi.mock('../quantumChat/directUnreadState', () => ({
  deleteDirectMessagesAndReconcile,
  reconcileDirectUnreadState,
}))

vi.mock('@spectra/core-crypto/storage/local', () => ({
  localChatStorage: {
    deleteSessionRecord,
    deleteMessage: vi.fn(async () => {}),
    deleteDecryptedMessage: vi.fn(async () => {}),
    getMessage: localGetMessage,
    getDecryptedMessage: localGetDecryptedMessage,
    storeMessage: localStoreMessage,
    updateDecryptedMessage: localUpdateDecryptedMessage,
  },
}))

vi.mock('../tor/torStore', () => ({
  useTorStore: {
    getState: () => ({ enabled: true }),
  },
}))

vi.mock('../quantumChat/remoteChatAvailability', () => ({
  isRemoteChatServiceAvailable: () => remoteChatServiceAvailable,
}))

describe('chatService Tor resilience', () => {
  beforeEach(() => {
    vi.resetModules()
    spectreModeEnabled = false
    activeWalletAddress = null
    remoteChatServiceAvailable = true
    quantumInitializeChat.mockReset()
    quantumInitializeChat.mockResolvedValue(true)
    quantumIsChatInitialized.mockReset()
    quantumIsChatInitialized.mockReturnValue(true)
    quantumReconcileChat.mockReset()
    quantumReconcileChat.mockResolvedValue(undefined)
    quantumSendMessage.mockReset()
    quantumSendMediaMessage.mockReset()
    quantumVerifyContactBundle.mockReset()
    quantumVerifyContactBundle.mockResolvedValue('verified-1')
    quantumAssertContactIdentityTrusted.mockReset()
    quantumPrewarmDirectChatTransportAccess.mockReset()
    quantumPrewarmDirectChatTransportAccess.mockResolvedValue(true)
    quantumGetOrCreateConversation.mockReset()
    quantumGetOrCreateConversation.mockResolvedValue(null)
    quantumTryOpenLocalConversation.mockReset()
    quantumTryOpenLocalConversation.mockResolvedValue(null)
    quantumSetActiveConversation.mockReset()
    quantumMarkLocalConversationAsRead.mockReset()
    quantumMarkLocalConversationAsRead.mockResolvedValue(true)
    quantumAddContactByAddress.mockReset()
    quantumAddContactByAddress.mockResolvedValue({ success: true, identityId: 'verified-1' })
    quantumConsumeDirectViewOnceMessage.mockReset()
    quantumArmDirectConversationMessagesOnLocalRead.mockReset()
    quantumArmDirectConversationMessagesOnLocalRead.mockResolvedValue(undefined)
    quantumLoadCachedMessages.mockReset()
    quantumLoadCachedMessages.mockResolvedValue([])
    reactNativeMocks.alert.mockReset()
    reactNativeMocks.turboModuleGet.mockReset()
    reactNativeMocks.turboModuleGet.mockReturnValue(null)
    reactNativeMocks.turboModuleGetEnforcing.mockReset()
    reactNativeMocks.turboModuleGetEnforcing.mockReturnValue({})
    updateActiveAddressBookSnapshot.mockReset()
    deleteSessionRecord.mockReset()
    deleteSessionRecord.mockResolvedValue(undefined)
    clearDirectConversationLocally.mockReset()
    deleteDirectConversationLocally.mockReset()
    deleteBackendMessage.mockReset()
    dismissNotificationsForConversation.mockReset()
    reconcileDirectUnreadState.mockReset()
    reconcileDirectUnreadState.mockResolvedValue({ applied: true, unreadCount: 0 })
    deleteDirectMessagesAndReconcile.mockReset()
    deleteDirectMessagesAndReconcile.mockResolvedValue({ applied: true, unreadCount: 0 })
    localGetMessage.mockReset()
    localGetDecryptedMessage.mockReset()
    localStoreMessage.mockReset()
    localStoreMessage.mockResolvedValue(undefined)
    localUpdateDecryptedMessage.mockReset()
    localUpdateDecryptedMessage.mockResolvedValue(undefined)
    updateActiveAddressBookSnapshot.mockImplementation(
      async (updater: (snapshot: AddressBookSnapshot) => AddressBookSnapshot) => (
        updater(createEmptyAddressBookSnapshot())
      ),
    )
    storeState = {
      isInitialized: false,
      contacts: [],
      conversations: [],
      setInitializing: vi.fn(),
      setInitialized: vi.fn(),
      setSyncingMessages: vi.fn(),
      setActiveConversation: vi.fn(),
      warmDirectConversation: vi.fn(),
      evictDirectConversationWindow: vi.fn(),
      evictDirectConversationWindowsForPeer: vi.fn(),
      addConversation: vi.fn(),
      addMessage: vi.fn(),
      updateConversation: vi.fn(),
      updateContact: vi.fn(),
      removeContact: vi.fn(),
      updateMessage: vi.fn(),
      addReaction: vi.fn(),
      messages: [],
    }
  })

  it('uses a lightweight reconcile flow for list refresh', async () => {
    const { refreshChatList } = await import('./chatService')

    await expect(refreshChatList()).resolves.toBeUndefined()
    expect(quantumReconcileChat).toHaveBeenCalledWith({
      fullResync: false,
      restartRealtime: false,
      reason: 'manual_recovery',
    })
  })

  it('prewarms recent scoped direct pages without attachment or repair work', async () => {
    activeWalletAddress = 'EXO00owner0000000000000000000000000000000000'
    storeState.conversations = [
      {
        id: 'conversation-old',
        remoteIdentityId: 'remote-old',
        localWalletAddress: activeWalletAddress,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'conversation-recent',
        remoteIdentityId: 'remote-recent',
        localWalletAddress: activeWalletAddress,
        createdAt: 3,
        updatedAt: 3,
      },
      {
        id: 'conversation-group',
        type: 'group',
        remoteIdentityId: 'group-identity',
        localWalletAddress: activeWalletAddress,
        createdAt: 1,
        updatedAt: 4,
      },
      {
        id: 'conversation-other-scope',
        remoteIdentityId: 'remote-other',
        localWalletAddress: 'EXO00other0000000000000000000000000000000000',
        createdAt: 1,
        updatedAt: 5,
      },
      {
        id: 'conversation-identity-changed',
        remoteIdentityId: 'remote-changed',
        localWalletAddress: activeWalletAddress,
        createdAt: 1,
        updatedAt: 6,
      },
    ]
    storeState.contacts = [{
      identityId: 'remote-changed',
      localWalletAddress: activeWalletAddress,
      identityChanged: true,
    }]
    quantumLoadCachedMessages.mockImplementation(async (_identityId, options) => [{
      id: `message-${options?.conversationId}`,
      conversationId: options?.conversationId,
      senderId: 'remote',
    }])
    const { prewarmRecentDirectMessages } = await import('./chatService')

    await prewarmRecentDirectMessages()

    expect(quantumLoadCachedMessages).toHaveBeenNthCalledWith(
      1,
      'remote-recent',
      expect.objectContaining({
        conversationId: 'conversation-recent',
        limit: 25,
        resolveAttachments: false,
        scheduleDerivedWork: false,
      }),
    )
    expect(quantumLoadCachedMessages).toHaveBeenNthCalledWith(
      2,
      'remote-old',
      expect.objectContaining({
        conversationId: 'conversation-old',
        limit: 25,
        resolveAttachments: false,
        scheduleDerivedWork: false,
      }),
    )
    expect(quantumLoadCachedMessages).toHaveBeenCalledTimes(2)
    expect(quantumLoadCachedMessages).not.toHaveBeenCalledWith(
      'remote-changed',
      expect.anything(),
    )
    expect(storeState.warmDirectConversation).toHaveBeenCalledWith('conversation-recent')
    expect(storeState.warmDirectConversation).toHaveBeenCalledWith('conversation-old')
  })

  it('evicts the in-memory window after clearing a direct conversation', async () => {
    const { clearConversationChat } = await import('./chatService')

    await expect(clearConversationChat('conversation-clear')).resolves.toEqual({ error: null })

    expect(clearDirectConversationLocally).toHaveBeenCalledWith('conversation-clear')
    expect(storeState.evictDirectConversationWindow).toHaveBeenCalledWith('conversation-clear')
  })

  it('deduplicates prewarm candidates and skips invisible conversations', async () => {
    activeWalletAddress = 'EXO00owner0000000000000000000000000000000000'
    storeState.conversations = [
      {
        id: 'conversation-stale',
        remoteIdentityId: 'remote-stale',
        remoteWalletAddress: 'wallet-shared',
        localWalletAddress: activeWalletAddress,
        createdAt: 1,
      },
      {
        id: 'conversation-canonical',
        remoteIdentityId: 'remote-current',
        remoteWalletAddress: 'wallet-shared',
        localWalletAddress: activeWalletAddress,
        createdAt: 2,
      },
      {
        id: 'conversation-hidden',
        remoteIdentityId: 'remote-hidden',
        localWalletAddress: activeWalletAddress,
        createdAt: 3,
        hasVisibleActivity: false,
      },
    ]
    quantumLoadCachedMessages.mockResolvedValue([{
      id: 'message-canonical',
      conversationId: 'conversation-canonical',
      senderId: 'remote-current',
    }])
    const { prewarmRecentDirectMessages } = await import('./chatService')

    await prewarmRecentDirectMessages()

    expect(quantumLoadCachedMessages).toHaveBeenCalledWith(
      'remote-current',
      expect.objectContaining({ conversationId: 'conversation-canonical' }),
    )
    expect(quantumLoadCachedMessages).toHaveBeenCalledTimes(1)
  })

  it('stops prewarming when the user opens a direct chat', async () => {
    activeWalletAddress = 'EXO00owner0000000000000000000000000000000000'
    storeState.conversations = [{
      id: 'conversation-interrupt',
      remoteIdentityId: 'remote-interrupt',
      localWalletAddress: activeWalletAddress,
      createdAt: 1,
      updatedAt: 1,
    }]
    const deferred = createDeferred<Array<any>>()
    quantumLoadCachedMessages.mockReturnValue(deferred.promise)
    const {
      prewarmRecentDirectMessages,
      setDirectChatInteractionActive,
    } = await import('./chatService')

    const prewarm = prewarmRecentDirectMessages()
    await Promise.resolve()
    setDirectChatInteractionActive(true)
    deferred.resolve([{
      id: 'message-interrupt',
      conversationId: 'conversation-interrupt',
      senderId: 'remote-interrupt',
    }])
    await prewarm
    setDirectChatInteractionActive(false)

    expect(storeState.warmDirectConversation).not.toHaveBeenCalled()
  })

  it('persists only messages whose local display order needs repair', async () => {
    localGetMessage.mockImplementation(async (id: string) => ({ id, timestamp: 2 }))
    localGetDecryptedMessage.mockImplementation(async (id: string) => ({ id, timestamp: 2 }))
    const { persistDirectMessageLocalOrder } = await import('./chatService')

    await persistDirectMessageLocalOrder([
      { id: 'ordered-1', timestamp: 1, localOrderTimestamp: 1 },
      { id: 'ordered-2', timestamp: 2, localOrderTimestamp: 2 },
      { id: 'repair-3', timestamp: 2 },
      { id: 'ordered-4', timestamp: 4, localOrderTimestamp: 4 },
    ])

    expect(localGetMessage).toHaveBeenCalledTimes(1)
    expect(localGetMessage).toHaveBeenCalledWith('repair-3')
    expect(localStoreMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'repair-3', localOrderTimestamp: 3 }),
    )
    expect(localUpdateDecryptedMessage).toHaveBeenCalledWith(
      'repair-3',
      { localOrderTimestamp: 3 },
    )
  })

  it('returns the bounded cached page from QuantumChat', async () => {
    const cachedMessages = [{
      id: 'message-1',
      conversationId: 'conversation-1',
      senderId: 'identity-them',
      senderName: 'Them',
      content: 'cached',
      timestamp: 123,
      status: 'delivered',
    }]
    quantumLoadCachedMessages.mockResolvedValue(cachedMessages)

    const { loadCachedMessagesForConversation } = await import('./chatService')

    await expect(loadCachedMessagesForConversation('identity-them')).resolves.toBe(cachedMessages)
    expect(quantumLoadCachedMessages).toHaveBeenCalledWith('identity-them')
  })

  it('passes a routed conversation hint through to the local cache loader', async () => {
    const { loadCachedMessagesForConversation } = await import('./chatService')

    await loadCachedMessagesForConversation('identity-them', {
      conversationId: 'conversation-1',
    })

    expect(quantumLoadCachedMessages).toHaveBeenCalledWith('identity-them', {
      conversationId: 'conversation-1',
    })
  })

  it('skips cached storage for invalid conversation addresses', async () => {
    const { loadCachedMessagesForConversation } = await import('./chatService')

    await expect(loadCachedMessagesForConversation('undefined')).resolves.toEqual([])
    expect(quantumLoadCachedMessages).not.toHaveBeenCalled()
  })

  it('returns an error instead of throwing when contact verification fails during send', async () => {
    quantumVerifyContactBundle.mockRejectedValue(new Error('Contact verification unavailable'))

    const { sendMessage } = await import('./chatService')
    const result = await sendMessage('exo1-me', 'exo1-them', 'hello')

    expect(result.message).toBeNull()
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toContain('Contact verification unavailable')
    expect(storeState.addMessage).toHaveBeenCalledTimes(1)
    const provisionalMessage = storeState.addMessage.mock.calls[0]?.[0]
    expect(storeState.updateMessage).toHaveBeenCalledWith(
      provisionalMessage.id,
      expect.objectContaining({ status: 'failed', deliveryStage: 'failed' }),
    )
    expect(quantumSendMessage).not.toHaveBeenCalled()
  })

  it('sends hidden control payloads without creating visible optimistic messages', async () => {
    quantumVerifyContactBundle.mockResolvedValue('verified-1')
    quantumSendMessage.mockResolvedValue({ success: true })
    const paymentUpdate = JSON.stringify({
      v: 2,
      type: 'crypto_payment_request_update',
      requestId: 'request-1',
      network: 'tron',
      symbol: 'TRX',
      amount: '1',
      txHash: '5125c5bb8506d120',
      status: 'pending',
      paidAt: 1778646807344,
    })

    const { sendMessage } = await import('./chatService')
    const result = await sendMessage('exo1-me', 'exo1-them', paymentUpdate)

    expect(result).toEqual({ message: null, error: null })
    expect(storeState.addMessage).not.toHaveBeenCalled()
    expect(storeState.updateConversation).not.toHaveBeenCalled()
    expect(quantumSendMessage).toHaveBeenCalledWith('verified-1', paymentUpdate)
  })

  it('returns a structured error when preparing a conversation while contact verification fails', async () => {
    quantumVerifyContactBundle.mockRejectedValue(new Error('Contact verification unavailable'))
    quantumTryOpenLocalConversation.mockRejectedValue(new Error('Contact has not been added yet'))

    const { ensureConversationExists } = await import('./chatService')
    const result = await ensureConversationExists('exo1-them')

    expect(result.conversationId).toBeNull()
    expect(result.error?.message).toContain('Contact verification unavailable')
    expect(result.reason).toBe('verification_failed')
  })

  it('returns structured success and marks the quantum conversation active', async () => {
    storeState.contacts = [{
      identityId: 'verified-1',
      walletAddress: 'exo1-them',
    }]
    const handle = { getId: vi.fn(() => 'conversation-1') }
    quantumTryOpenLocalConversation.mockResolvedValue(handle)

    const { activateConversation } = await import('./chatService')
    const result = await activateConversation('exo1-them')

    expect(result).toEqual({
      conversationId: 'conversation-1',
      identityId: 'verified-1',
      error: null,
    })
    expect(quantumSetActiveConversation).toHaveBeenCalledWith(handle)
  })

  it('prewarms bound transport access without delaying local activation', async () => {
    const prewarm = createDeferred<boolean>()
    quantumPrewarmDirectChatTransportAccess.mockReturnValue(prewarm.promise)
    storeState.contacts = [{
      identityId: 'verified-1',
      walletAddress: 'exo1-them',
    }]
    quantumTryOpenLocalConversation.mockResolvedValue({
      getId: () => 'conversation-local',
    })

    const { activateConversation } = await import('./chatService')
    await expect(activateConversation('exo1-them')).resolves.toEqual(
      expect.objectContaining({ conversationId: 'conversation-local' }),
    )

    expect(quantumPrewarmDirectChatTransportAccess).toHaveBeenCalledTimes(1)
    prewarm.resolve(true)
  })

  it('refreshes wallet identity mapping in the background on activation', async () => {
    storeState.contacts = [{
      identityId: 'verified-1',
      walletAddress: 'exo1-them',
      identityVerifiedAt: Date.now(),
    }]
    quantumTryOpenLocalConversation.mockResolvedValue({
      getId: () => 'conversation-local',
    })

    const { activateConversation } = await import('./chatService')
    await activateConversation('exo1-them')

    expect(quantumVerifyContactBundle).toHaveBeenCalledWith(
      'verified-1',
      expect.objectContaining({ forceRemoteVerification: true }),
    )
  })

  it('does not create a session merely to activate a trusted chat', async () => {
    storeState.contacts = [{
      identityId: 'verified-1',
      walletAddress: 'exo1-them',
    }]
    quantumTryOpenLocalConversation.mockResolvedValue(null)

    const { activateConversation } = await import('./chatService')
    const result = await activateConversation('exo1-them')

    expect(result).toEqual({
      conversationId: 'pending_verified-1',
      identityId: 'verified-1',
      error: null,
    })
    expect(quantumGetOrCreateConversation).not.toHaveBeenCalled()
    expect(storeState.setActiveConversation).toHaveBeenCalledWith('pending_verified-1')
  })

  it('activates a cached trusted conversation offline without directory work', async () => {
    remoteChatServiceAvailable = false
    storeState.contacts = [{
      identityId: 'verified-1',
      walletAddress: 'exo1-them',
    }]
    const handle = { getId: vi.fn(() => 'conversation-local') }
    quantumTryOpenLocalConversation.mockResolvedValue(handle)

    const { activateConversation } = await import('./chatService')
    const result = await activateConversation('exo1-them')

    expect(result).toEqual({
      conversationId: 'conversation-local',
      identityId: 'verified-1',
      error: null,
    })
    expect(quantumVerifyContactBundle).not.toHaveBeenCalled()
    expect(quantumAddContactByAddress).not.toHaveBeenCalled()
    expect(deleteSessionRecord).not.toHaveBeenCalled()
    expect(quantumSetActiveConversation).toHaveBeenCalledWith(handle)
    expect(quantumPrewarmDirectChatTransportAccess).not.toHaveBeenCalled()
  })

  it('does not commit a conversation after its activation scope is cancelled', async () => {
    const pendingHandle = createDeferred<{ getId: () => string }>()
    quantumTryOpenLocalConversation.mockReturnValue(pendingHandle.promise)
    const controller = new AbortController()

    const { activateConversation } = await import('./chatService')
    const activation = activateConversation('exo1-them', {
      signal: controller.signal,
    })
    controller.abort()
    pendingHandle.resolve({ getId: () => 'stale-conversation' })
    await activation

    expect(quantumSetActiveConversation).not.toHaveBeenCalled()
    expect(quantumVerifyContactBundle).not.toHaveBeenCalled()
  })

  it('surfaces a background identity replacement after local activation', async () => {
    const replacement = {
      reason: 'identity_replacement_required' as const,
      oldIdentityId: 'verified-1',
      newIdentityId: 'verified-2',
      walletAddress: 'exo1-them',
      safetyNumber,
      walletAuthorized: true as const,
    }
    const verification = createDeferred<string>()
    const onBackgroundVerificationFailure = vi.fn()
    quantumTryOpenLocalConversation.mockResolvedValue({
      getId: () => 'conversation-local',
    })
    quantumVerifyContactBundle.mockReturnValue(verification.promise)
    quantumAddContactByAddress.mockResolvedValue({
      success: false,
      error: 'Verify the safety number first',
      identityReplacement: replacement,
    })

    const { activateConversation } = await import('./chatService')
    await activateConversation('exo1-them', { onBackgroundVerificationFailure })
    verification.reject(new MockContactIdentityChangeError())
    await vi.waitFor(() => expect(onBackgroundVerificationFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'verification_failed',
        identityReplacement: replacement,
      }),
    ))
  })

  it('reuses the activation verification for a send started during warmup', async () => {
    const verification = createDeferred<string>()
    storeState.contacts = [{
      identityId: 'verified-1',
      walletAddress: 'exo1-them',
    }]
    quantumTryOpenLocalConversation.mockResolvedValue({
      getId: () => 'conversation-local',
    })
    quantumVerifyContactBundle.mockReturnValue(verification.promise)
    quantumSendMessage.mockResolvedValue({
      success: true,
      message: { id: 'message-1' },
    })

    const { activateConversation, sendMessage } = await import('./chatService')
    await activateConversation('exo1-them')
    const send = sendMessage('exo1-me', 'exo1-them', 'hello')
    await Promise.resolve()

    expect(quantumVerifyContactBundle).toHaveBeenCalledTimes(1)
    expect(quantumSendMessage).not.toHaveBeenCalled()

    verification.resolve('verified-1')
    await send

    expect(quantumAssertContactIdentityTrusted).toHaveBeenCalledWith('verified-1')
    expect(quantumVerifyContactBundle).toHaveBeenCalledTimes(1)
    expect(quantumSendMessage).toHaveBeenCalledWith(
      'verified-1',
      'hello',
      expect.objectContaining({ messageId: expect.stringMatching(/^local:/) }),
    )
  })

  it('reuses activation verification for a reaction during warmup', async () => {
    const verification = createDeferred<string>()
    storeState.contacts = [{
      identityId: 'verified-1',
      walletAddress: 'exo1-them',
    }]
    quantumTryOpenLocalConversation.mockResolvedValue({
      getId: () => 'conversation-local',
    })
    quantumVerifyContactBundle.mockReturnValue(verification.promise)
    quantumSendMessage.mockResolvedValue({
      success: true,
      message: { id: 'reaction-1' },
    })

    const { activateConversation, sendReaction } = await import('./chatService')
    await activateConversation('exo1-them')
    const reaction = sendReaction('exo1-them', 'message-1', '👍')
    await Promise.resolve()

    expect(quantumVerifyContactBundle).toHaveBeenCalledTimes(1)
    expect(quantumSendMessage).not.toHaveBeenCalled()

    verification.resolve('verified-1')
    await reaction

    expect(quantumVerifyContactBundle).toHaveBeenCalledTimes(1)
    expect(quantumSendMessage).toHaveBeenCalledWith(
      'verified-1',
      expect.objectContaining({
        type: 'reaction',
        reaction: { targetMessageId: 'message-1', emoji: '👍' },
      }),
    )
  })

  it('cancels a shared verification only after every activation scope ends', async () => {
    const verification = createDeferred<string>()
    let requestSignal: AbortSignal | undefined
    storeState.contacts = [{
      identityId: 'verified-1',
      walletAddress: 'exo1-them',
    }]
    quantumTryOpenLocalConversation.mockResolvedValue({
      getId: () => 'conversation-local',
    })
    quantumVerifyContactBundle.mockImplementation((
      _identityId: string,
      options: { signal?: AbortSignal },
    ) => {
      requestSignal = options.signal
      return verification.promise
    })
    const firstScope = new AbortController()
    const secondScope = new AbortController()

    const { activateConversation } = await import('./chatService')
    await activateConversation('exo1-them', { signal: firstScope.signal })
    await activateConversation('exo1-them', { signal: secondScope.signal })

    expect(quantumVerifyContactBundle).toHaveBeenCalledTimes(1)
    firstScope.abort()
    expect(requestSignal?.aborted).toBe(false)

    secondScope.abort()
    await vi.waitFor(() => expect(requestSignal?.aborted).toBe(true))
  })

  it('cancels readiness warmups when the chat runtime is cleaned up', async () => {
    const verification = createDeferred<string>()
    let requestSignal: AbortSignal | undefined
    storeState.contacts = [{
      identityId: 'verified-1',
      walletAddress: 'exo1-them',
    }]
    quantumTryOpenLocalConversation.mockResolvedValue({
      getId: () => 'conversation-local',
    })
    quantumVerifyContactBundle.mockImplementation((
      _identityId: string,
      options: { signal?: AbortSignal },
    ) => {
      requestSignal = options.signal
      return verification.promise
    })

    const { activateConversation, cleanupChat } = await import('./chatService')
    await activateConversation('exo1-them')
    cleanupChat()

    expect(storeState.setInitialized).toHaveBeenCalledWith(false)
    expect(storeState.setInitializing).toHaveBeenCalledWith(false)
    await vi.waitFor(() => expect(requestSignal?.aborted).toBe(true))
  })

  it('blocks a warmed send when local trust changes before encryption', async () => {
    const verification = createDeferred<string>()
    storeState.contacts = [{
      identityId: 'verified-1',
      walletAddress: 'exo1-them',
    }]
    quantumTryOpenLocalConversation.mockResolvedValue({
      getId: () => 'conversation-local',
    })
    quantumVerifyContactBundle.mockReturnValue(verification.promise)
    quantumAssertContactIdentityTrusted.mockImplementationOnce(() => {
      throw new MockContactIdentityChangeError()
    })

    const { activateConversation, sendMessage } = await import('./chatService')
    await activateConversation('exo1-them')
    const send = sendMessage('exo1-me', 'exo1-them', 'hello')
    verification.resolve('verified-1')
    const result = await send

    expect(result.error).toBeInstanceOf(MockContactIdentityChangeError)
    expect(quantumSendMessage).not.toHaveBeenCalled()
  })

  it('repairs a broken local activation with one directory lookup', async () => {
    const repairedHandle = { getId: vi.fn(() => 'conversation-repaired') }
    quantumTryOpenLocalConversation
      .mockRejectedValueOnce(new Error('broken local conversation'))
      .mockResolvedValueOnce(repairedHandle)

    const { activateConversation } = await import('./chatService')
    const result = await activateConversation('exo1-them')

    expect(result.conversationId).toBe('conversation-repaired')
    expect(result.error).toBeNull()
    expect(result.repaired).toBe(true)
    expect(deleteSessionRecord).toHaveBeenCalledWith('verified-1')
    expect(quantumVerifyContactBundle).not.toHaveBeenCalled()
    expect(quantumAddContactByAddress).toHaveBeenCalledWith(
      'exo1-them',
      undefined,
      {
        signal: expect.any(AbortSignal),
        onCommitStart: expect.any(Function),
      },
    )
    expect(quantumSetActiveConversation).toHaveBeenCalledWith(repairedHandle)
  })

  it('fast-fails an already changed identity before remote repair', async () => {
    const identityReplacement = {
      reason: 'identity_replacement_required' as const,
      oldIdentityId: 'verified-1',
      newIdentityId: 'verified-2',
      walletAddress: 'exo1-them',
      safetyNumber,
      walletAuthorized: true as const,
    }
    storeState.contacts = [{
      identityId: 'verified-1',
      walletAddress: 'exo1-them',
    }]
    quantumTryOpenLocalConversation.mockRejectedValue(new Error('broken local conversation'))
    quantumAssertContactIdentityTrusted.mockImplementation(() => {
      throw new MockContactIdentityChangeError(identityReplacement)
    })

    const { activateConversation } = await import('./chatService')
    const result = await activateConversation('exo1-them')

    expect(result).toEqual(expect.objectContaining({
      conversationId: null,
      identityId: 'verified-1',
      reason: 'verification_failed',
      identityReplacement,
    }))
    expect(quantumVerifyContactBundle).not.toHaveBeenCalled()
    expect(quantumAddContactByAddress).not.toHaveBeenCalled()
    expect(deleteSessionRecord).not.toHaveBeenCalled()
  })

  it('finishes a local repair commit atomically after remote cancellation ends', async () => {
    const controller = new AbortController()
    const repairedHandle = { getId: vi.fn(() => 'conversation-repaired') }
    quantumTryOpenLocalConversation
      .mockRejectedValueOnce(new Error('broken local conversation'))
      .mockResolvedValueOnce(repairedHandle)
    quantumAddContactByAddress.mockImplementationOnce(async (...args: unknown[]) => {
      const options = args[2] as { onCommitStart: () => void }
      options.onCommitStart()
      controller.abort()
      return { success: true, identityId: 'verified-1' }
    })

    const { activateConversation } = await import('./chatService')
    const result = await activateConversation('exo1-them', {
      repairOnFailure: true,
      signal: controller.signal,
    })

    expect(result.conversationId).toBe('conversation-repaired')
    expect(deleteSessionRecord).toHaveBeenCalledWith('verified-1')
    expect(quantumSetActiveConversation).not.toHaveBeenCalled()
  })

  it('surfaces a visible activation failure when repair cannot recover the chat', async () => {
    quantumVerifyContactBundle.mockResolvedValue('verified-1')
    quantumTryOpenLocalConversation.mockRejectedValue(new Error('broken conversation'))
    quantumAddContactByAddress.mockResolvedValue({
      success: false,
      error: 'bundle unavailable',
    })

    const { activateConversation } = await import('./chatService')
    const result = await activateConversation('exo1-them')

    expect(result.conversationId).toBeNull()
    expect(result.error?.message).toContain('bundle unavailable')
    expect(result.reason).toBe('repair_failed')
    expect(quantumSetActiveConversation).not.toHaveBeenCalled()
  })

  it('surfaces contact identity replacement when repairing an existing direct chat', async () => {
    const identityReplacement = {
      reason: 'identity_replacement_required' as const,
      oldIdentityId: 'identity-old',
      newIdentityId: 'identity-new',
      walletAddress: 'exo1-them',
      safetyNumber,
      walletAuthorized: true,
    }
    quantumVerifyContactBundle.mockResolvedValue('identity-new')
    quantumTryOpenLocalConversation.mockRejectedValue(new Error('broken conversation'))
    quantumAddContactByAddress.mockResolvedValue({
      success: false,
      error: 'Verify the safety number first',
      identityReplacement,
    })

    const { activateConversation } = await import('./chatService')
    const result = await activateConversation('exo1-them')

    expect(result.conversationId).toBeNull()
    expect(result.reason).toBe('repair_failed')
    expect(result.identityReplacement).toBe(identityReplacement)
    expect(result.error?.message).toContain('Verify the safety number first')
    expect(quantumSetActiveConversation).not.toHaveBeenCalled()
  })

  it('inserts a provisional sender bubble before contact verification resolves', async () => {
    const verification = createDeferred<string>()
    quantumVerifyContactBundle.mockReturnValue(verification.promise)
    quantumSendMessage.mockResolvedValue({
      success: true,
      message: {
        id: 'server-1',
      },
    })

    const { sendMessage } = await import('./chatService')
    const sendPromise = sendMessage('exo1-me', 'exo1-them', 'hello over tor')

    await Promise.resolve()

    expect(storeState.addConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pending_exo1-them', remoteIdentityId: 'exo1-them' }),
    )
    expect(storeState.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^local:/),
        conversationId: 'pending_exo1-them',
        senderId: chatIdentity.id,
        content: 'hello over tor',
        status: 'sending',
        deliveryStage: 'queued',
      }),
    )
    expect(quantumSendMessage).not.toHaveBeenCalled()

    verification.resolve('verified-1')
    await sendPromise

    const provisionalMessage = storeState.addMessage.mock.calls[0]?.[0]
    expect(storeState.updateConversation).toHaveBeenCalledWith(
      'pending_exo1-them',
      expect.objectContaining({ remoteIdentityId: 'verified-1' }),
    )
    expect(quantumSendMessage).toHaveBeenCalledWith(
      'verified-1',
      'hello over tor',
      expect.objectContaining({
        messageId: provisionalMessage.id,
        conversationId: 'pending_exo1-them',
        sendStartedAt: provisionalMessage.timestamp,
      }),
    )
  })

  it('uses unique provisional message ids even when sends share a timestamp', async () => {
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(1_717_171_717_000)
    quantumVerifyContactBundle.mockResolvedValue('verified-1')
    quantumSendMessage.mockResolvedValue({ success: true, message: { id: 'server-1' } })

    try {
      const { sendMessage } = await import('./chatService')

      await Promise.all([
        sendMessage('exo1-me', 'exo1-them', 'first'),
        sendMessage('exo1-me', 'exo1-them', 'second'),
      ])
    } finally {
      dateNow.mockRestore()
    }

    const provisionalIds = storeState.addMessage.mock.calls.map(([message]) => message.id)
    expect(provisionalIds).toHaveLength(2)
    expect(new Set(provisionalIds).size).toBe(2)
    expect(provisionalIds).toEqual([
      expect.stringMatching(/^local:1717171717000:/),
      expect.stringMatching(/^local:1717171717000:/),
    ])
  })

  it('dispatches rapid sends while preserving tap order for the ratchet layer', async () => {
    const firstRelay = createDeferred<{ success: boolean; message: { id: string } }>()
    const secondRelay = createDeferred<{ success: boolean; message: { id: string } }>()
    quantumVerifyContactBundle.mockResolvedValue('verified-1')
    quantumSendMessage
      .mockReturnValueOnce(firstRelay.promise)
      .mockReturnValueOnce(secondRelay.promise)

    const { sendMessage } = await import('./chatService')

    const firstSend = sendMessage('exo1-me', 'exo1-them', 'first')
    const secondSend = sendMessage('exo1-me', 'exo1-them', 'second')

    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(quantumSendMessage).toHaveBeenCalledTimes(2)
    expect(quantumSendMessage.mock.calls[0]?.[1]).toBe('first')
    expect(quantumSendMessage.mock.calls[1]?.[1]).toBe('second')

    firstRelay.resolve({ success: true, message: { id: 'server-1' } })
    secondRelay.resolve({ success: true, message: { id: 'server-2' } })
    await expect(Promise.all([firstSend, secondSend])).resolves.toEqual([
      { message: { id: 'server-1' }, error: null },
      { message: { id: 'server-2' }, error: null },
    ])
  })

  it('marks the provisional bubble failed when the lower send path throws after verification', async () => {
    quantumVerifyContactBundle.mockResolvedValue('verified-1')
    quantumSendMessage.mockRejectedValue(new Error('Relay unavailable'))

    const { sendMessage } = await import('./chatService')
    const result = await sendMessage('exo1-me', 'exo1-them', 'hello over tor')

    expect(result.message).toBeNull()
    expect(result.error?.message).toContain('Relay unavailable')

    const provisionalMessage = storeState.addMessage.mock.calls[0]?.[0]
    expect(quantumSendMessage).toHaveBeenCalledWith(
      'verified-1',
      'hello over tor',
      expect.objectContaining({ messageId: provisionalMessage.id }),
    )
    expect(storeState.updateMessage).toHaveBeenCalledWith(
      provisionalMessage.id,
      expect.objectContaining({ status: 'failed', deliveryStage: 'failed' }),
    )
  })

  it('marks the visible bubble failed when the lower send path returns a failure result', async () => {
    quantumVerifyContactBundle.mockResolvedValue('verified-1')
    quantumSendMessage.mockResolvedValue({
      success: false,
      error: 'Relay rejected message',
    })

    const { sendMessage } = await import('./chatService')
    const result = await sendMessage('exo1-me', 'exo1-them', 'hello over tor')

    expect(result.message).toBeNull()
    expect(result.error?.message).toContain('Relay rejected message')

    const provisionalMessage = storeState.addMessage.mock.calls[0]?.[0]
    expect(storeState.updateMessage).toHaveBeenCalledWith(
      provisionalMessage.id,
      expect.objectContaining({ status: 'failed', deliveryStage: 'failed', relayed: false }),
    )
  })

  it('wraps one-time text sends in a view-once envelope', async () => {
    quantumVerifyContactBundle.mockResolvedValue('verified-1')
    quantumSendMessage.mockResolvedValue({
      success: true,
      message: {
        id: 'server-view-once-text',
      },
    })

    const { sendMessage } = await import('./chatService')
    await sendMessage(
      'exo1-me',
      'exo1-them',
      'secret text',
      undefined,
      undefined,
      undefined,
      undefined,
      { oneTime: { kind: 'text' } },
    )

    expect(quantumSendMessage).toHaveBeenCalledWith(
      'verified-1',
      expect.objectContaining({
        v: 2,
        type: 'view_once',
        kind: 'text',
        body: 'secret text',
      }),
      expect.objectContaining({
        oneTime: expect.objectContaining({ kind: 'text', state: 'locked' }),
      }),
    )
  })

  it('snapshots the active disappearing timer into outgoing direct sends', async () => {
    storeState.conversations = [{
      id: 'conv-1',
      remoteIdentityId: 'exo1-them',
      disappearingTimer: {
        durationMs: 10_000,
        trigger: 'after_read',
        fallbackDurationMs: 60 * 60 * 1000,
      },
    }]
    quantumVerifyContactBundle.mockResolvedValue('verified-1')
    quantumSendMessage.mockResolvedValue({
      success: true,
      message: {
        id: 'server-disappearing',
      },
    })

    const { sendMessage } = await import('./chatService')
    await sendMessage('exo1-me', 'exo1-them', 'hello with timer')

    expect(storeState.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        disappearing: expect.objectContaining({
          durationMs: 10_000,
          trigger: 'after_read',
          fallbackExpiresAt: expect.any(Number),
        }),
      }),
    )
    expect(quantumSendMessage).toHaveBeenCalledWith(
      'verified-1',
      expect.objectContaining({
        disappearing: {
          durationMs: 10_000,
          trigger: 'after_read',
          fallbackDurationMs: 60 * 60 * 1000,
        },
      }),
      expect.objectContaining({
        disappearingTimer: expect.objectContaining({
          durationMs: 10_000,
          trigger: 'after_read',
        }),
      }),
    )
  })

  it('does not replace transparent direct timers when Spectre Mode is inactive', async () => {
    storeState.conversations = [{
      id: 'conv-transparent',
      remoteIdentityId: 'exo1-them',
      disappearingTimer: {
        durationMs: 60 * 60 * 1000,
        trigger: 'after_read',
        fallbackDurationMs: 60 * 60 * 1000,
      },
    }]
    quantumVerifyContactBundle.mockResolvedValue('verified-1')
    quantumSendMessage.mockResolvedValue({ success: true })

    const { sendMessage } = await import('./chatService')
    await sendMessage('exo1-me', 'exo1-them', 'transparent timer')

    expect(quantumSendMessage).toHaveBeenCalledWith(
      'verified-1',
      expect.objectContaining({
        disappearing: {
          durationMs: 60 * 60 * 1000,
          trigger: 'after_read',
          fallbackDurationMs: 60 * 60 * 1000,
        },
      }),
      expect.objectContaining({
        disappearingTimer: expect.objectContaining({
          durationMs: 60 * 60 * 1000,
          trigger: 'after_read',
        }),
      }),
    )
  })

  it('uses the Spectre 15 minute default only while Spectre Mode is active', async () => {
    spectreModeEnabled = true
    storeState.conversations = [{
      id: 'conv-spectre',
      remoteIdentityId: 'exo1-them',
      disappearingTimer: null,
    }]
    quantumVerifyContactBundle.mockResolvedValue('verified-1')
    quantumSendMessage.mockResolvedValue({ success: true })

    const { sendMessage } = await import('./chatService')
    await sendMessage('exo1-me', 'exo1-them', 'spectre timer')

    const [verifiedId, payload, options] = quantumSendMessage.mock.calls[0]
    expect(verifiedId).toBe('verified-1')
    expect(payload).toEqual(expect.objectContaining({
      disappearing: expect.objectContaining({
        durationMs: 15 * 60 * 1000,
        trigger: 'after_read',
        fallbackDurationMs: 60 * 60 * 1000,
      }),
    }))
    expect(options).toEqual(expect.objectContaining({
      disappearingTimer: expect.objectContaining({
        durationMs: 15 * 60 * 1000,
        trigger: 'after_read',
      }),
    }))
  })

  it('applies the same early optimistic behavior to attachment sends', async () => {
    const verification = createDeferred<string>()
    quantumVerifyContactBundle.mockReturnValue(verification.promise)
    quantumSendMediaMessage.mockResolvedValue({
      success: true,
      message: {
        id: 'media-1',
      },
    })
    const attachments: MediaAttachment[] = [{
      id: 'attachment-1',
      type: 'image',
      uri: 'file:///photo.jpg',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 42,
      isEncrypted: false,
    }]

    const { sendMessage } = await import('./chatService')
    const sendPromise = sendMessage('exo1-me', 'exo1-them', '', attachments)

    await Promise.resolve()

    expect(storeState.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'pending_exo1-them',
        attachments: [expect.objectContaining({ ...attachments[0], isViewOnce: false })],
        status: 'sending',
        deliveryStage: 'queued',
      }),
    )
    expect(quantumSendMediaMessage).not.toHaveBeenCalled()

    verification.resolve('verified-1')
    await sendPromise

    const provisionalMessage = storeState.addMessage.mock.calls[0]?.[0]
    expect(quantumSendMediaMessage).toHaveBeenCalledWith(
      'verified-1',
      '',
      attachments,
      undefined,
      expect.objectContaining({
        messageId: provisionalMessage.id,
        conversationId: 'pending_exo1-them',
        sendStartedAt: expect.any(Number),
        attachmentSendId: expect.stringMatching(/^attach:/),
      }),
    )
  })

  it('threads one-time attachment state through optimistic media sends', async () => {
    quantumVerifyContactBundle.mockResolvedValue('verified-1')
    quantumSendMediaMessage.mockResolvedValue({
      success: true,
      message: {
        id: 'media-view-once-1',
      },
    })
    const attachments: MediaAttachment[] = [{
      id: 'attachment-image-1',
      type: 'image',
      uri: 'file:///photo.jpg',
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 42,
      isEncrypted: false,
    }]

    const { sendMessage } = await import('./chatService')
    await sendMessage(
      'exo1-me',
      'exo1-them',
      '',
      attachments,
      undefined,
      undefined,
      undefined,
      { oneTime: { kind: 'image' } },
    )

    expect(storeState.addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        oneTime: expect.objectContaining({ kind: 'image', state: 'locked' }),
        attachments: [expect.objectContaining({ isViewOnce: true })],
      }),
    )
    expect(quantumSendMediaMessage).toHaveBeenCalledWith(
      'verified-1',
      '',
      attachments,
      undefined,
      expect.objectContaining({
        oneTime: expect.objectContaining({ kind: 'image', state: 'locked' }),
      }),
    )
  })

  it('refuses to send delete-for-everyone for messages not authored by the local identity', async () => {
    storeState.messages = [{
      id: 'message-peer',
      conversationId: 'conversation-1',
      senderId: 'identity-peer',
    }]

    const { deleteMessageForAll } = await import('./chatService')
    const result = await deleteMessageForAll('exo1-them', 'message-peer')

    expect(result.error?.message).toContain('Only the original sender')
    expect(quantumVerifyContactBundle).not.toHaveBeenCalled()
    expect(quantumSendMessage).not.toHaveBeenCalled()
    expect(deleteBackendMessage).not.toHaveBeenCalled()
  })

  it('sends delete-for-everyone only for locally authored direct messages', async () => {
    storeState.messages = [{
      id: 'message-own',
      conversationId: 'conversation-1',
      senderId: chatIdentity.id,
    }]
    quantumVerifyContactBundle.mockResolvedValue('verified-1')
    quantumSendMessage.mockResolvedValue({ success: true })

    const { deleteMessageForAll } = await import('./chatService')
    const result = await deleteMessageForAll('exo1-them', 'message-own')

    expect(result.error).toBeNull()
    expect(quantumSendMessage).toHaveBeenCalledWith(
      'verified-1',
      expect.objectContaining({
        v: 2,
        type: 'deletion',
        deletionTarget: 'message-own',
      }),
    )
    expect(storeState.updateMessage).toHaveBeenCalledWith('message-own', {
      deleted: true,
      content: '',
    })
    expect(deleteBackendMessage).toHaveBeenCalledWith('message-own')
  })

  it('clears unread state when marking by canonical conversation id', async () => {
    storeState.conversations = [{
      id: 'conversation-1',
      localWalletAddress: 'EXO_LOCAL',
      remoteIdentityId: 'identity-peer',
      remoteWalletAddress: 'EXO_REMOTE',
      disappearingTimer: null,
    }]
    storeState.messages = [{
      id: 'message-peer',
      conversationId: 'conversation-1',
      senderId: 'identity-peer',
    }]

    const { markConversationAsRead } = await import('./chatService')
    await markConversationAsRead('conversation-1')

    expect(quantumMarkLocalConversationAsRead).toHaveBeenCalledWith(
      'conversation-1',
      'identity-peer',
    )
    expect(quantumGetOrCreateConversation).not.toHaveBeenCalled()
    expect(storeState.updateMessage).toHaveBeenCalledWith('message-peer', {
      status: 'read',
      deliveryStage: 'read',
      deliveryHint: 'Read',
    })
    expect(reconcileDirectUnreadState).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      localIdentityId: 'identity-me',
      localWalletAddress: 'EXO_LOCAL',
    })
    expect(dismissNotificationsForConversation).toHaveBeenCalledWith('conversation-1')
    expect(dismissNotificationsForConversation).toHaveBeenCalledWith('identity-peer')
    expect(dismissNotificationsForConversation).toHaveBeenCalledWith('EXO_REMOTE')
    expect(dismissNotificationsForConversation).toHaveBeenCalledWith('local:EXO_LOCAL:conversation-1')
  })
})

describe('chatService contact lifecycle', () => {
  beforeEach(() => {
    storeState.contacts = [{
      identityId: 'identity-them',
      walletAddress: 'EXO00friend00000000000000000000000000000000',
      displayName: 'Friend',
      addedAt: 123,
      trustState: 'trusted',
      isSaved: true,
      isHidden: false,
    }]
    storeState.updateContact.mockClear()
    updateActiveAddressBookSnapshot.mockClear()
    updateActiveAddressBookSnapshot.mockImplementation(
      async (updater: (snapshot: AddressBookSnapshot) => AddressBookSnapshot) => (
        updater(createEmptyAddressBookSnapshot())
      ),
    )
  })

  it('deletes a contact, its local chat, and the device session', async () => {
    activeWalletAddress = 'EXO00owner0000000000000000000000000000000000'
    storeState.conversations = [{
      id: 'conversation-them',
      type: 'direct',
      localWalletAddress: activeWalletAddress,
      remoteIdentityId: 'identity-them',
      remoteWalletAddress: 'EXO00friend00000000000000000000000000000000',
    }]
    const { deleteContact } = await import('./chatService')
    const result = await deleteContact('identity-them')

    expect(result.error).toBeNull()
    expect(deleteDirectConversationLocally).toHaveBeenCalledWith('conversation-them', {
      client: null,
    })
    expect(updateActiveAddressBookSnapshot).toHaveBeenCalledTimes(1)
    expect(storeState.removeContact).toHaveBeenCalledWith('identity-them')
    expect(storeState.updateContact).not.toHaveBeenCalled()
  })

  it('persists alias updates in local encrypted metadata', async () => {
    const { renameContact } = await import('./chatService')
    const result = await renameContact('identity-them', 'Best Friend')

    expect(result.error).toBeNull()
    expect(updateActiveAddressBookSnapshot).toHaveBeenCalledTimes(1)
    expect(storeState.updateContact).toHaveBeenCalledWith('identity-them', {
      displayName: 'Best Friend',
      isSaved: true,
    })
  })
})

describe('chatService bilateral conversation delete', () => {
  beforeEach(() => {
    quantumVerifyContactBundle.mockResolvedValue('verified-1')
    quantumSendMessage.mockResolvedValue({ success: true })
    deleteDirectConversationLocally.mockClear()
  })

  it('sends a hidden conversation-delete envelope and deletes local state', async () => {
    const { deleteConversationForBoth } = await import('./chatService')
    const result = await deleteConversationForBoth('conversation-1', 'exo1-them')

    expect(result.error).toBeNull()
    expect(quantumSendMessage).toHaveBeenCalledWith(
      'verified-1',
      expect.objectContaining({
        v: 2,
        type: 'conversation_delete',
      }),
    )
    expect(quantumSendMessage).toHaveBeenCalledWith(
      'verified-1',
      expect.objectContaining({
        targetIdentityId: 'verified-1',
      }),
    )
    expect(deleteDirectConversationLocally).toHaveBeenCalledWith('conversation-1', {
      client: null,
    })
  })

  it('does not delete local history when the control message send fails', async () => {
    quantumSendMessage.mockResolvedValue({ success: false, error: 'relay unavailable' })

    const { deleteConversationForBoth } = await import('./chatService')
    const result = await deleteConversationForBoth('conversation-2', 'exo1-them')

    expect(result.error?.message).toContain('relay unavailable')
    expect(deleteDirectConversationLocally).not.toHaveBeenCalled()
  })
})
