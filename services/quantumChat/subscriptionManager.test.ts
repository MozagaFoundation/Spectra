/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  activeChannel: undefined as any,
  channelHandlers: [] as Array<{
    filter: { event: string; table?: string; filter?: string }
    callback: (payload?: any) => void
  }>,
  subscribeCallback: undefined as ((status: string) => void) | undefined,
  backendChannel: vi.fn(),
  removeChannel: vi.fn(),
  isBackendConfigured: vi.fn(() => true),
  isSpectraBackendConfigured: vi.fn(() => true),
  subscribeBackendRealtime: vi.fn(),
  hasBoundBackendAccessForIdentity: vi.fn(() => true),
  ensureBoundBackendAccessForIdentity: vi.fn(async () => true),
  getCachedBackendAccessToken: vi.fn(() => 'access-token'),
  recordChatDiagnostic: vi.fn(),
  clearnetEgressAllowed: true,
  mailboxScopes: [] as Array<{
    localIdentityId: string
    remoteIdentityId: string
    scopeId: string
    scopeSecret: string
    epoch: number
    status: 'pending' | 'active' | 'retired'
    initiatedByLocal?: boolean
    createdAt: number
    updatedAt: number
    registeredAt?: number
    acknowledgedAt?: number
    registrationVersion?: number
  }>,
  getMailboxScopes: vi.fn(async (_identityId?: string) => [] as any[]),
  storeMailboxScope: vi.fn(async (_scope: any) => {}),
  registeredMailboxTokens: [] as string[],
  listRegisteredMailboxTokens: vi.fn(async (_identityId?: string) => [] as string[]),
  registerMailboxScope: vi.fn(async (_mailboxToken: string) => {}),
  statusSyncMessages: [] as Array<{ createdAt: number; relayDeliveryToken?: string }>,
  getMessagesNeedingStatusSync: vi.fn(async (_identityId?: string) => [] as any[]),
  torState: { enabled: false },
  spectreState: { enabled: false },
  authState: { session: null as { expiresAt: number } | null },
  appState: 'active',
  interactionsBlocked: false,
  interactionCallbacks: [] as Array<() => void>,
  chatState: {
    contacts: [] as Array<{ identityId: string; lastSeenAt?: number; isOnline?: boolean }>,
    batchUpdateContacts: vi.fn(),
  },
}))

vi.stubGlobal('__DEV__', false)

vi.mock('react-native', () => ({
  AppState: {
    get currentState() {
      return testState.appState
    },
  },
  InteractionManager: {
    runAfterInteractions: (callback: () => void) => {
      let cancelled = false
      const run = () => {
        if (!cancelled) callback()
      }
      if (testState.interactionsBlocked) {
        testState.interactionCallbacks.push(run)
      } else {
        run()
      }
      return {
        cancel: () => {
          cancelled = true
        },
      }
    },
  },
}))

vi.mock('../backend/client', () => ({
  backend: {
    channel: testState.backendChannel,
    removeChannel: testState.removeChannel,
  },
  isBackendConfigured: testState.isBackendConfigured,
}))

vi.mock('../backend/session', () => ({
  hasBoundBackendAccessForIdentity: testState.hasBoundBackendAccessForIdentity,
  ensureBoundBackendAccessForIdentity: testState.ensureBoundBackendAccessForIdentity,
  getCachedBackendAccessToken: testState.getCachedBackendAccessToken,
}))

vi.mock('@/services/backend/client', () => ({
  isSpectraBackendConfigured: testState.isSpectraBackendConfigured,
}))

vi.mock('@/services/backend/realtime', () => ({
  subscribeBackendRealtime: testState.subscribeBackendRealtime,
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: {
    getState: () => testState.chatState,
  },
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => testState.authState,
  },
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: {
    getState: () => testState.spectreState,
  },
}))

vi.mock('../tor/torStore', () => ({
  useTorStore: {
    getState: () => testState.torState,
  },
}))

vi.mock('../tor/torConstants', () => ({
  TOR_CHAT_POLL_INTERVAL_MS: 2_345,
  TOR_OUTBOUND_STATUS_SYNC_TIMER_MS: 30_000,
}))

vi.mock('../tor/torEgressPolicy', () => ({
  isClearnetEgressAllowed: () => testState.clearnetEgressAllowed,
}))

vi.mock('../chat/chatDiagnostics', () => ({
  recordChatDiagnostic: testState.recordChatDiagnostic,
  recordCatchupTiming: vi.fn(),
  recordChatOperationalCounter: vi.fn(),
}))

vi.mock('@spectra/core-crypto', () => ({
  deriveRecipientMailboxToken: () => 'mailbox-token',
  deriveScopedRecipientMailboxToken: ({ scopeId, epoch }: { scopeId: string; epoch?: number }) => `scoped-mailbox-${scopeId}-${epoch ?? 0}`,
  MAILBOX_SCOPE_REGISTRATION_VERSION: 1,
  listRealtimeMailboxTokens: async ({
    localScopeMode = 'preferred',
    registeredMailboxMode = 'none',
    registerScope,
  }: {
    localScopeMode?: 'preferred' | 'all'
    registeredMailboxMode?: 'none' | 'all'
    registerScope?: (scope: any) => Promise<any>
  }) => {
    const tokens = []
    const localScopes = (await testState.getMailboxScopes('identity-me'))
      .filter((scope) => (
        scope.status === 'active'
        || (scope.status === 'pending' && scope.initiatedByLocal === true)
      ))
    const selectedLocalScopes = localScopeMode === 'all'
      ? localScopes
      : Array.from(new Map(localScopes.map((scope) => [scope.remoteIdentityId, scope])).values())
    for (const scope of selectedLocalScopes) {
      const activeScope = !scope.registeredAt && registerScope
        ? await registerScope({ ...scope, acknowledgedAt: scope.acknowledgedAt ?? Date.now() })
        : scope
      tokens.push({
        token: `scoped-mailbox-${activeScope.scopeId}-${activeScope.epoch ?? 0}`,
        source: 'local_scope',
      })
    }
    const registeredTokens = registeredMailboxMode === 'none'
      ? []
      : await testState.listRegisteredMailboxTokens('identity-me')
    for (const token of registeredTokens) {
      tokens.push({ token, source: 'server_registry' })
    }
    return tokens
  },
  localChatStorage: {
    getMailboxScopes: testState.getMailboxScopes,
    storeMailboxScope: testState.storeMailboxScope,
    getMessagesNeedingStatusSync: testState.getMessagesNeedingStatusSync,
  },
}))

import * as S from './_state'
import {
  getMessagePollIntervalMs,
  clearBackgroundWorkSkipStats,
  disposeSubscriptionManager,
  getBackgroundWorkSkipStats,
  initSubscriptionManager,
  requestOutboundStatusSync,
  setChatInteractionActive,
  beginMailboxCatchupBurst,
  requestPostSendCatchup,
  startMessagePolling,
  whenInitialMailboxCatchupSettled,
  isInitialMailboxCatchupSettled,
  startRealtimeLivenessMonitor,
  startRealtimeSubscription,
  startSessionRefreshTimer,
  stopMessagePolling,
  stopRealtimeLivenessMonitor,
  stopRealtimeSubscription,
  stopSessionRefreshTimer,
  syncRealtimeSubscriptionForTransport,
  refreshRealtimeMailboxSubscriptions,
  trackOutboundReceiptToken,
} from './subscriptionManager'
import { useMailboxCatchupBannerStore } from '@/store/mailboxCatchupBannerStore'

function createChannel(state: string = 'joined') {
  const channel = {
    state,
    topic: undefined as string | undefined,
    subscribeCallback: undefined as ((status: string) => void) | undefined,
    on: vi.fn((_kind, filter, callback) => {
      testState.channelHandlers.push({ filter, callback })
      return channel
    }),
    subscribe: vi.fn((callback) => {
      testState.subscribeCallback = callback
      channel.subscribeCallback = callback
      return channel
    }),
    close: vi.fn(() => {
      testState.removeChannel(channel)
    }),
  }
  return channel
}

function resetSharedState(): void {
  if (S.pollInterval) clearInterval(S.pollInterval)
  if (S.outboundStatusSyncInterval) clearInterval(S.outboundStatusSyncInterval)
  if (S.onlineStatusInterval) clearInterval(S.onlineStatusInterval)
  if (S.sessionRefreshTimer) clearInterval(S.sessionRefreshTimer)
  if (S.realtimeChannel) testState.removeChannel(S.realtimeChannel)
  S.setPollInterval(null)
  S.setOutboundStatusSyncInterval(null)
  S.setOnlineStatusInterval(null)
  S.setSessionRefreshTimer(null)
  S.setRealtimeChannel(null)
  S.setActivePollIntervalMs(null)
  S.setChatIdentity(null)
  S.setChatClient(null)
  S.setBundleServer(null)
}

function getHandler(table: string, event: string) {
  const handler = testState.channelHandlers.find((entry) => (
    entry.filter.table === table && entry.filter.event === event
  ))
  if (!handler) {
    throw new Error(`Missing handler for ${table}:${event}`)
  }
  return handler.callback
}

describe('subscriptionManager', () => {
  const callbacks = {
    pollForNewMessages: vi.fn(async (): Promise<void | {
      lastServerSequence: number
      fullResyncCompleted?: boolean
      directMessageCount?: number
      mailboxTokens?: string[]
      mailboxSequences?: Map<string, number>
    }> => {}),
    mergePendingMessagePoll: vi.fn(() => false),
    processControlMessagesNow: vi.fn(async () => {}),
    pollForNewGroupMessages: vi.fn(async () => {}),
    syncGroupConversations: vi.fn(async () => {}),
    syncOutboundRelayStatuses: vi.fn(async () => {}),
    applyOutboundRelayStatus: vi.fn(async () => {}),
    reconcileQuantumChat: vi.fn(async () => {}),
    syncBundleServerAccessToken: vi.fn(),
  }

  async function settleRealtimeStartup(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0)
    callbacks.pollForNewMessages.mockClear()
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    resetSharedState()
    stopRealtimeLivenessMonitor()
    stopRealtimeSubscription()
    testState.channelHandlers = []
    testState.subscribeCallback = undefined
    testState.activeChannel = undefined
    testState.backendChannel.mockImplementation((topic: string) => {
      const channel = createChannel()
      channel.topic = topic
      if (!testState.activeChannel) {
        testState.activeChannel = channel
      }
      return channel
    })
    testState.subscribeBackendRealtime.mockImplementation((request: any) => {
      const event = String(request.topic).startsWith('sealed_receipt:')
        ? 'sealed_receipt_update'
        : 'sealed_message_insert'
      const channel = testState.backendChannel(request.topic, { config: { private: false } })
      channel.on('broadcast', { event }, (payload: any) => {
        request.onEvent?.({
          event,
          topic: request.topic,
          payload: payload?.payload ?? payload,
        })
      })
      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          request.onSubscribed?.(request.topic)
        } else {
          request.onError?.(new Error(status))
        }
      })
      request.onSubscribed?.(request.topic)
      if (!testState.activeChannel) {
        testState.activeChannel = channel
      }
      return channel
    })
    testState.isBackendConfigured.mockReturnValue(true)
    testState.isSpectraBackendConfigured.mockReturnValue(true)
    testState.getCachedBackendAccessToken.mockReturnValue('access-token')
    testState.hasBoundBackendAccessForIdentity.mockReturnValue(true)
    testState.ensureBoundBackendAccessForIdentity.mockResolvedValue(true)
    testState.torState.enabled = false
    testState.spectreState.enabled = false
    testState.clearnetEgressAllowed = true
    testState.authState.session = null
    testState.appState = 'active'
    testState.interactionsBlocked = false
    testState.interactionCallbacks = []
    testState.chatState.contacts = []
    testState.mailboxScopes = []
    testState.getMailboxScopes.mockImplementation(async () => testState.mailboxScopes)
    testState.storeMailboxScope.mockImplementation(async () => {})
    testState.registeredMailboxTokens = []
    testState.listRegisteredMailboxTokens.mockImplementation(async () => testState.registeredMailboxTokens)
    testState.registerMailboxScope.mockResolvedValue(undefined)
    testState.statusSyncMessages = []
    testState.getMessagesNeedingStatusSync.mockImplementation(async () => testState.statusSyncMessages)
    callbacks.mergePendingMessagePoll.mockReturnValue(false)
    S.setBundleServer({
      listRegisteredMailboxTokens: testState.listRegisteredMailboxTokens,
      registerMailboxScope: testState.registerMailboxScope,
    } as any)
    clearBackgroundWorkSkipStats()
    useMailboxCatchupBannerStore.getState().reset()
    initSubscriptionManager(callbacks)
  })

  afterEach(() => {
    disposeSubscriptionManager()
    stopRealtimeLivenessMonitor()
    stopRealtimeSubscription()
    stopMessagePolling()
    stopSessionRefreshTimer()
    resetSharedState()
    vi.clearAllTimers()
    clearBackgroundWorkSkipStats()
    useMailboxCatchupBannerStore.getState().reset()
    vi.useRealTimers()
  })

  it('selects polling intervals for realtime, Tor, and Spectre modes', () => {
    expect(getMessagePollIntervalMs()).toBe(S.DEFAULT_MESSAGE_POLL_INTERVAL)

    S.setRealtimeChannel({ close: vi.fn() } as any)
    expect(getMessagePollIntervalMs()).toBe(5_000)

    testState.spectreState.enabled = true
    expect(getMessagePollIntervalMs()).toBe(S.DEFAULT_MESSAGE_POLL_INTERVAL)

    testState.torState.enabled = true
    expect(getMessagePollIntervalMs()).toBe(2_345)
  })

  it('starts mailbox catch-up immediately without waiting for idle interactions', async () => {
    testState.interactionsBlocked = true
    startMessagePolling()
    await Promise.resolve()

    expect(callbacks.reconcileQuantumChat).toHaveBeenCalledWith({
      fullResync: true,
      reason: 'initialization',
    })
    expect(testState.interactionCallbacks).toHaveLength(0)
  })

  it('settles the initial mailbox catch-up gate after the first reconcile', async () => {
    useMailboxCatchupBannerStore.getState().begin()
    expect(isInitialMailboxCatchupSettled()).toBe(false)
    startMessagePolling()
    expect(isInitialMailboxCatchupSettled()).toBe(false)
    await Promise.resolve()
    await callbacks.reconcileQuantumChat.mock.results[0]?.value
    await expect(whenInitialMailboxCatchupSettled()).resolves.toBeUndefined()
    expect(isInitialMailboxCatchupSettled()).toBe(true)
    expect(useMailboxCatchupBannerStore.getState().phase).toBe('caught_up')
  })

  it('settles the initial mailbox catch-up gate if reconcile hangs past the wait cap', async () => {
    useMailboxCatchupBannerStore.getState().begin()
    callbacks.reconcileQuantumChat.mockImplementationOnce(() => new Promise(() => {}))
    startMessagePolling()
    const ready = whenInitialMailboxCatchupSettled()
    await vi.advanceTimersByTimeAsync(15_000)
    await expect(ready).resolves.toBeUndefined()
    expect(useMailboxCatchupBannerStore.getState().phase).toBe('caught_up')
  })

  it('releases initial mailbox catch-up waiters when the subscription manager is disposed', async () => {
    const ready = whenInitialMailboxCatchupSettled()
    disposeSubscriptionManager()
    await expect(ready).resolves.toBeUndefined()
  })

  it('starts scheduled mailbox polls without waiting for idle interactions', async () => {
    testState.interactionsBlocked = true
    startMessagePolling()
    callbacks.reconcileQuantumChat.mockClear()
    callbacks.pollForNewMessages.mockClear()

    await vi.advanceTimersByTimeAsync(S.DEFAULT_MESSAGE_POLL_INTERVAL)
    expect(callbacks.pollForNewMessages).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(24)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'scheduled',
        fullResync: true,
      }),
    )
  })

  it('keeps fullResync scheduled polls until a transport catch-up completes', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    callbacks.pollForNewMessages.mockResolvedValue({
      lastServerSequence: 0,
      fullResyncCompleted: false,
      directMessageCount: 0,
    })

    startMessagePolling()
    callbacks.pollForNewMessages.mockClear()

    await vi.advanceTimersByTimeAsync(1_000)
    await vi.advanceTimersByTimeAsync(24)
    await Promise.resolve()

    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'scheduled',
        fullResync: true,
      }),
    )
    expect(getMessagePollIntervalMs()).toBe(1_000)

    callbacks.pollForNewMessages.mockClear()
    await vi.advanceTimersByTimeAsync(1_000)
    await vi.advanceTimersByTimeAsync(24)
    await Promise.resolve()

    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'scheduled',
        fullResync: true,
      }),
    )
    expect(getMessagePollIntervalMs()).toBe(1_000)
  })

  it('stretches realtime backup polls only after a completed mailbox catch-up', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    callbacks.pollForNewMessages
      .mockResolvedValueOnce({
        lastServerSequence: 8,
        fullResyncCompleted: true,
        directMessageCount: 0,
      })
      .mockResolvedValue({
        lastServerSequence: 8,
        fullResyncCompleted: false,
        directMessageCount: 0,
      })

    startMessagePolling()
    expect(getMessagePollIntervalMs()).toBe(1_000)
    callbacks.pollForNewMessages.mockClear()

    await vi.advanceTimersByTimeAsync(1_000)
    await vi.advanceTimersByTimeAsync(24)
    await Promise.resolve()
    await Promise.resolve()

    expect(getMessagePollIntervalMs()).toBe(15_000)

    await vi.advanceTimersByTimeAsync(15_000)
    await vi.advanceTimersByTimeAsync(24)
    await Promise.resolve()
    await Promise.resolve()

    expect(callbacks.pollForNewMessages).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ fullResync: true }),
    )
    expect(getMessagePollIntervalMs()).toBe(30_000)
  })

  it('does not tighten backup polls when a chat is open', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    callbacks.pollForNewMessages.mockResolvedValue({
      lastServerSequence: 8,
      fullResyncCompleted: true,
      directMessageCount: 0,
    })
    startMessagePolling()
    callbacks.pollForNewMessages.mockClear()

    await vi.advanceTimersByTimeAsync(1_000)
    await vi.advanceTimersByTimeAsync(24)
    await Promise.resolve()
    await Promise.resolve()

    expect(getMessagePollIntervalMs()).toBe(15_000)
    callbacks.pollForNewMessages.mockClear()

    setChatInteractionActive(true)

    expect(getMessagePollIntervalMs()).toBe(15_000)
    expect(callbacks.pollForNewMessages).not.toHaveBeenCalled()
  })

  it('re-enters the catch-up burst after a long background', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    callbacks.pollForNewMessages.mockResolvedValue({
      lastServerSequence: 8,
      fullResyncCompleted: true,
      directMessageCount: 0,
    })
    startMessagePolling()
    callbacks.pollForNewMessages.mockClear()

    await vi.advanceTimersByTimeAsync(1_000)
    await vi.advanceTimersByTimeAsync(24)
    await Promise.resolve()
    await Promise.resolve()
    expect(getMessagePollIntervalMs()).toBe(15_000)

    beginMailboxCatchupBurst()

    expect(getMessagePollIntervalMs()).toBe(1_000)
  })

  it('fetches receipts immediately after send when Tor is enabled', async () => {
    testState.torState.enabled = true
    S.setChatIdentity({ id: 'identity-me' } as any)
    requestPostSendCatchup()

    await vi.advanceTimersByTimeAsync(24)
    await Promise.resolve()
    await Promise.resolve()

    expect(callbacks.pollForNewMessages).not.toHaveBeenCalled()
    expect(callbacks.processControlMessagesNow).toHaveBeenCalledTimes(1)
  })

  it('does not force a catch-up poll on clearnet send', async () => {
    requestPostSendCatchup()
    await vi.advanceTimersByTimeAsync(24)

    expect(callbacks.pollForNewMessages).not.toHaveBeenCalled()
    expect(callbacks.processControlMessagesNow).not.toHaveBeenCalled()
  })

  it('does not chain timer-driven polls queued behind an in-flight fetch', async () => {
    testState.torState.enabled = true
    S.setChatIdentity({ id: 'identity-me' } as any)
    let releasePoll!: (result: {
      lastServerSequence: number
      directMessageCount: number
    }) => void
    callbacks.pollForNewMessages.mockImplementationOnce(() => new Promise((resolve) => {
      releasePoll = resolve
    }))

    startMessagePolling()
    await Promise.resolve()
    await callbacks.reconcileQuantumChat.mock.results[0]?.value

    await vi.advanceTimersByTimeAsync(2_345)
    await vi.advanceTimersByTimeAsync(24)
    await Promise.resolve()
    await Promise.resolve()
    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2_345)
    await vi.advanceTimersByTimeAsync(2_345)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)
    expect(callbacks.mergePendingMessagePoll).not.toHaveBeenCalled()

    releasePoll({ lastServerSequence: 10, directMessageCount: 0 })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)

    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'performance',
      'message_poll_queue_satisfied',
      expect.objectContaining({
        lastServerSequence: 10,
      }),
    )
  })

  it('caps the unlock catch-up burst when mailbox catch-up never completes', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    callbacks.pollForNewMessages.mockResolvedValue({
      lastServerSequence: 0,
      fullResyncCompleted: false,
      directMessageCount: 0,
    })
    startRealtimeSubscription()
    await settleRealtimeStartup()
    startMessagePolling()
    callbacks.pollForNewMessages.mockClear()

    for (let i = 0; i < 10; i += 1) {
      await vi.advanceTimersByTimeAsync(1_000)
      await vi.advanceTimersByTimeAsync(24)
      await Promise.resolve()
      await Promise.resolve()
    }

    expect(getMessagePollIntervalMs()).toBe(5_000)
  })

  it('runs outbound receipt status sync on a steady interval', async () => {
    startMessagePolling()

    await vi.advanceTimersByTimeAsync(S.DEFAULT_MESSAGE_POLL_INTERVAL)

    expect(callbacks.syncOutboundRelayStatuses).toHaveBeenCalledTimes(1)
    expect(callbacks.syncOutboundRelayStatuses).toHaveBeenCalledWith({ force: false })
  })

  it('defers interval status sync until the active chat is no longer interactive', async () => {
    setChatInteractionActive(true)
    requestOutboundStatusSync('interval', { skipBackground: true })

    expect(callbacks.syncOutboundRelayStatuses).not.toHaveBeenCalled()

    setChatInteractionActive(false)
    await vi.advanceTimersByTimeAsync(500)
    await vi.waitFor(() => {
      expect(callbacks.syncOutboundRelayStatuses).toHaveBeenCalledWith({ force: false })
    })
  })

  it('waits for the chat-exit interaction before running deferred status sync', async () => {
    setChatInteractionActive(true)
    requestOutboundStatusSync('interval', { skipBackground: true })
    testState.interactionsBlocked = true

    setChatInteractionActive(false)

    expect(callbacks.syncOutboundRelayStatuses).not.toHaveBeenCalled()
    expect(testState.interactionCallbacks).toHaveLength(1)

    const [completeChatExit] = testState.interactionCallbacks
    testState.interactionsBlocked = false
    completeChatExit()
    await vi.advanceTimersByTimeAsync(499)

    expect(callbacks.syncOutboundRelayStatuses).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => {
      expect(callbacks.syncOutboundRelayStatuses).toHaveBeenCalledWith({ force: false })
    })
  })

  it('cancels deferred status sync when another chat opens', async () => {
    setChatInteractionActive(true)
    requestOutboundStatusSync('interval', { skipBackground: true })

    setChatInteractionActive(false)
    setChatInteractionActive(true)
    await vi.advanceTimersByTimeAsync(500)

    expect(callbacks.syncOutboundRelayStatuses).not.toHaveBeenCalled()
  })

  it('keeps forced status recovery available while a chat is interactive', () => {
    setChatInteractionActive(true)
    requestOutboundStatusSync('receipt_recovery', { force: true })

    expect(callbacks.syncOutboundRelayStatuses).toHaveBeenCalledWith({ force: true })
  })

  it('coalesces queued status syncs and preserves a forced recovery request', async () => {
    let releaseFirstSync!: () => void
    callbacks.syncOutboundRelayStatuses
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        releaseFirstSync = resolve
      }))
      .mockResolvedValue(undefined)

    requestOutboundStatusSync('first')
    requestOutboundStatusSync('routine')
    requestOutboundStatusSync('recovery', { force: true })

    expect(callbacks.syncOutboundRelayStatuses).toHaveBeenCalledTimes(1)
    expect(callbacks.syncOutboundRelayStatuses).toHaveBeenNthCalledWith(1, { force: false })

    releaseFirstSync()
    await vi.waitFor(() => {
      expect(callbacks.syncOutboundRelayStatuses).toHaveBeenCalledTimes(2)
    })
    expect(callbacks.syncOutboundRelayStatuses).toHaveBeenNthCalledWith(2, { force: true })
  })

  it('keeps a retired poll from draining work queued by a new lifecycle', async () => {
    let releaseRetiredPoll!: () => void
    callbacks.pollForNewMessages.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseRetiredPoll = resolve
    }))

    startMessagePolling()
    await vi.advanceTimersByTimeAsync(S.DEFAULT_MESSAGE_POLL_INTERVAL)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)

    stopMessagePolling()
    disposeSubscriptionManager()

    let releaseActivePoll!: () => void
    const activePoll = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        releaseActivePoll = resolve
      }))
      .mockResolvedValue(undefined)
    const nextCallbacks = {
      ...callbacks,
      pollForNewMessages: activePoll,
    }
    initSubscriptionManager(nextCallbacks)
    startMessagePolling()
    await vi.advanceTimersByTimeAsync(S.DEFAULT_MESSAGE_POLL_INTERVAL)
    await vi.advanceTimersByTimeAsync(S.DEFAULT_MESSAGE_POLL_INTERVAL)
    expect(activePoll).toHaveBeenCalledTimes(1)

    releaseRetiredPoll()
    await Promise.resolve()
    expect(activePoll).toHaveBeenCalledTimes(1)

    releaseActivePoll()
    await vi.waitFor(() => {
      expect(activePoll).toHaveBeenCalledTimes(2)
    })
  })

  it('queues overlapping scheduled Tor polls and drains them when the in-flight poll finishes', async () => {
    testState.torState.enabled = true
    let releasePoll!: () => void
    callbacks.pollForNewMessages
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        releasePoll = resolve
      }))
      .mockResolvedValue(undefined)

    startMessagePolling()
    await vi.advanceTimersByTimeAsync(2_345)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2_345)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'performance',
      'message_poll_queued',
      expect.objectContaining({ source: 'scheduled' }),
    )

    releasePoll()
    await vi.waitFor(() => {
      expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(2)
    })
  })

  it('retries realtime startup from scheduled polls after identity binding is ready', async () => {
    testState.hasBoundBackendAccessForIdentity.mockReturnValue(false)

    startMessagePolling()

    expect(testState.backendChannel).not.toHaveBeenCalled()

    S.setChatIdentity({ id: 'identity-me' } as any)
    testState.hasBoundBackendAccessForIdentity.mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(S.DEFAULT_MESSAGE_POLL_INTERVAL)

    expect(testState.backendChannel).toHaveBeenCalledWith(
      'sealed_mailbox:mailbox-token',
      expect.objectContaining({ config: expect.objectContaining({ private: false }) }),
    )
    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(2)
    expect(S.activePollIntervalMs).toBe(1_000)
  })

  it('records why realtime startup is deferred', () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    testState.hasBoundBackendAccessForIdentity.mockReturnValue(false)

    startRealtimeSubscription()

    expect(testState.backendChannel).not.toHaveBeenCalled()
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'transport',
      'realtime_subscription_deferred',
      expect.objectContaining({ reason: 'identity_unbound' }),
    )
  })

  it('skips interval-driven work while backgrounded', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    testState.appState = 'background'
    testState.torState.enabled = true

    startMessagePolling()
    startRealtimeLivenessMonitor()
    await vi.advanceTimersByTimeAsync(S.DEFAULT_MESSAGE_POLL_INTERVAL)
    await vi.advanceTimersByTimeAsync(45_000)

    expect(callbacks.pollForNewMessages).not.toHaveBeenCalled()
    expect(callbacks.syncOutboundRelayStatuses).not.toHaveBeenCalled()
    expect(getBackgroundWorkSkipStats()).toEqual(expect.objectContaining({
      scheduled_message_poll: expect.any(Number),
      outbound_status_sync: expect.any(Number),
      realtime_liveness: expect.any(Number),
    }))
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'performance',
      'background_work_skipped',
      expect.objectContaining({ work: 'scheduled_message_poll' }),
    )
  })

  it('skips websocket realtime when Tor or Spectre routes are active', () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    testState.torState.enabled = true

    startRealtimeSubscription()

    expect(testState.backendChannel).not.toHaveBeenCalled()
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'transport',
      'message_transport_route',
      expect.objectContaining({ route: 'tor_http_polling' }),
    )

    vi.clearAllMocks()
    testState.torState.enabled = false
    testState.spectreState.enabled = true

    startRealtimeSubscription()

    expect(testState.backendChannel).not.toHaveBeenCalled()
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'transport',
      'message_transport_route',
      expect.objectContaining({ route: 'spectre_http_polling' }),
    )
  })

  it('does not start realtime while the clearnet boundary is closed', () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    testState.clearnetEgressAllowed = false

    startRealtimeSubscription()

    expect(testState.subscribeBackendRealtime).not.toHaveBeenCalled()
    expect(S.realtimeChannel).toBeNull()
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'transport',
      'message_transport_route',
      expect.objectContaining({ route: 'clearnet_egress_blocked' }),
    )
  })

  it('syncs realtime subscriptions when transport privacy modes change', () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    const firstChannel = S.realtimeChannel

    testState.torState.enabled = true
    syncRealtimeSubscriptionForTransport()

    expect(testState.removeChannel).toHaveBeenCalledWith(firstChannel)
    expect(S.realtimeChannel).toBeNull()
    expect(S.activePollIntervalMs).toBe(2_345)

    testState.torState.enabled = false
    testState.spectreState.enabled = true
    syncRealtimeSubscriptionForTransport()

    expect(S.realtimeChannel).toBeNull()
    expect(S.activePollIntervalMs).toBe(S.DEFAULT_MESSAGE_POLL_INTERVAL)

    testState.spectreState.enabled = false
    syncRealtimeSubscriptionForTransport()

    expect(testState.backendChannel).toHaveBeenLastCalledWith(
      'sealed_mailbox:mailbox-token',
      expect.objectContaining({ config: expect.objectContaining({ private: false }) }),
    )
    expect(S.realtimeChannel).not.toBeNull()
    expect(S.activePollIntervalMs).toBe(5_000)
  })

  it('wires realtime message and group callbacks to polling handlers', async () => {
    const chatIdentity = { id: 'identity-me' } as any
    S.setChatIdentity(chatIdentity)
    S.setChatClient({} as any)

    startRealtimeSubscription()
    await settleRealtimeStartup()

    expect(testState.backendChannel).toHaveBeenCalledWith(
      'sealed_mailbox:mailbox-token',
      expect.objectContaining({ config: expect.objectContaining({ private: false }) }),
    )
    const sealedHandler = testState.channelHandlers.find((entry) => (
      entry.filter.event === 'sealed_message_insert'
    ))

    sealedHandler?.callback({ payload: { server_sequence: 10 } })
    await vi.advanceTimersByTimeAsync(50)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)

    expect(() => getHandler('chat_group_members', '*')).toThrow()
  })

  it('bounds realtime receive deferral during active interactions', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    S.setChatClient({} as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    testState.interactionsBlocked = true

    const sealedHandler = testState.channelHandlers.find((entry) => (
      entry.filter.event === 'sealed_message_insert'
    ))
    sealedHandler?.callback({
      payload: {
        server_sequence: 10,
        delivery_class: 'message',
      },
    })
    await vi.advanceTimersByTimeAsync(20)

    expect(callbacks.pollForNewMessages).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(23)
    expect(callbacks.pollForNewMessages).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'websocket',
        latestServerSequence: 10,
        realtimeRequestedAt: expect.any(Number),
      }),
    )
  })

  it('uses a distinct subscriber id for every connection attempt', () => {
    S.setChatIdentity({ id: 'identity-me' } as any)

    startRealtimeSubscription()
    const firstSubscriberId = testState.subscribeBackendRealtime.mock.calls[0][0].subscriberId
    stopRealtimeSubscription()
    startRealtimeSubscription()
    const secondSubscriberId = testState.subscribeBackendRealtime.mock.calls[1][0].subscriberId

    expect(firstSubscriberId).not.toBe(secondSubscriberId)
    expect(firstSubscriberId).toMatch(/^chat-primary-/)
    expect(secondSubscriberId).toMatch(/^chat-primary-/)
    expect(firstSubscriberId).toMatch(/^[^\s:\0]{1,128}$/)
    expect(secondSubscriberId).toMatch(/^[^\s:\0]{1,128}$/)
    expect(firstSubscriberId).not.toContain('identity-me')
    expect(secondSubscriberId).not.toContain('identity-me')
  })

  it('restores pending receipt channels after primary realtime recovery', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    testState.statusSyncMessages = [
      { createdAt: 2, relayDeliveryToken: 'delivery-token-new' },
      { createdAt: 1, relayDeliveryToken: 'delivery-token-old' },
      { createdAt: 3 },
    ]

    startRealtimeSubscription()

    await vi.waitFor(() => {
      expect(testState.subscribeBackendRealtime).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'sealed_receipt:delivery-token-new' }),
      )
      expect(testState.subscribeBackendRealtime).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'sealed_receipt:delivery-token-old' }),
      )
    })
    expect(testState.getMessagesNeedingStatusSync).toHaveBeenCalledWith('identity-me')
  })

  it('waits for the primary acknowledgement before opening scoped channels', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    testState.mailboxScopes = [{
      localIdentityId: 'identity-me',
      remoteIdentityId: 'identity-them',
      scopeId: 'scope-waiting',
      scopeSecret: 'secret',
      epoch: 1,
      status: 'active',
      initiatedByLocal: true,
      createdAt: 1,
      updatedAt: 1,
      registeredAt: 1,
      acknowledgedAt: 1,
      registrationVersion: 1,
    }]
    testState.subscribeBackendRealtime.mockImplementationOnce((request: any) => {
      const channel = createChannel()
      channel.topic = request.topic
      return channel
    })

    startRealtimeSubscription()
    await Promise.resolve()
    expect(testState.subscribeBackendRealtime).toHaveBeenCalledTimes(1)

    const primaryRequest = testState.subscribeBackendRealtime.mock.calls[0][0]
    primaryRequest.onSubscribed?.(primaryRequest.topic)
    await vi.waitFor(() => {
      expect(testState.subscribeBackendRealtime).toHaveBeenCalledTimes(2)
    })
    expect(testState.subscribeBackendRealtime.mock.calls[1][0].topic)
      .toBe('sealed_mailbox:scoped-mailbox-scope-waiting-1')
  })

  it('waits for scoped acknowledgements before running subscription catch-up', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    testState.mailboxScopes = [{
      localIdentityId: 'identity-me',
      remoteIdentityId: 'remote-delayed',
      scopeId: 'delayed-ack',
      scopeSecret: 'scope-secret',
      epoch: 0,
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    }]
    let scopedRequest: any
    testState.subscribeBackendRealtime.mockImplementation((request: any) => {
      const channel = createChannel()
      channel.topic = request.topic
      if (request.topic === 'sealed_mailbox:mailbox-token') {
        request.onSubscribed?.(request.topic)
      } else {
        scopedRequest = request
      }
      return channel
    })

    startRealtimeSubscription()
    await vi.waitFor(() => {
      expect(scopedRequest?.topic).toBe('sealed_mailbox:scoped-mailbox-delayed-ack-0')
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'subscription_catchup' }),
    )
    callbacks.pollForNewMessages.mockClear()

    scopedRequest.onSubscribed?.(scopedRequest.topic)
    await vi.advanceTimersByTimeAsync(0)

    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'subscription_catchup' }),
    )
  })

  it('runs catch-up for acknowledged scoped channels without waiting for others', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    testState.mailboxScopes = [
      {
        localIdentityId: 'identity-me',
        remoteIdentityId: 'remote-ready',
        scopeId: 'ready',
        scopeSecret: 'scope-secret',
        epoch: 0,
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        localIdentityId: 'identity-me',
        remoteIdentityId: 'remote-pending',
        scopeId: 'pending',
        scopeSecret: 'scope-secret',
        epoch: 0,
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    const scopedRequests: any[] = []
    testState.subscribeBackendRealtime.mockImplementation((request: any) => {
      const channel = createChannel()
      channel.topic = request.topic
      if (request.topic === 'sealed_mailbox:mailbox-token') {
        request.onSubscribed?.(request.topic)
      } else {
        scopedRequests.push(request)
      }
      return channel
    })

    startRealtimeSubscription()
    await vi.waitFor(() => {
      expect(scopedRequests).toHaveLength(2)
    })
    await vi.advanceTimersByTimeAsync(0)
    callbacks.pollForNewMessages.mockClear()

    scopedRequests[0].onSubscribed?.(scopedRequests[0].topic)
    await vi.advanceTimersByTimeAsync(0)

    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'subscription_catchup' }),
    )
  })

  it('recycles an unconfirmed scoped channel after scheduled delivery', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    testState.mailboxScopes = [{
      localIdentityId: 'identity-me',
      remoteIdentityId: 'remote-unconfirmed',
      scopeId: 'unconfirmed',
      scopeSecret: 'scope-secret',
      epoch: 0,
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    }]
    let firstScopedChannel: ReturnType<typeof createChannel> | undefined
    testState.subscribeBackendRealtime.mockImplementation((request: any) => {
      const channel = createChannel()
      channel.topic = request.topic
      if (request.topic === 'sealed_mailbox:mailbox-token') {
        request.onSubscribed?.(request.topic)
      } else if (!firstScopedChannel) {
        firstScopedChannel = channel
      }
      return channel
    })
    startRealtimeSubscription()
    await vi.waitFor(() => {
      expect(firstScopedChannel).toBeDefined()
    })
    await vi.advanceTimersByTimeAsync(0)
    callbacks.pollForNewMessages.mockClear()
    callbacks.pollForNewMessages.mockResolvedValueOnce({
      lastServerSequence: 91,
      directMessageCount: 1,
      mailboxTokens: ['scoped-mailbox-unconfirmed-0'],
      mailboxSequences: new Map([['scoped-mailbox-unconfirmed-0', 91]]),
    })
    startMessagePolling()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(testState.removeChannel).toHaveBeenCalledWith(firstScopedChannel)
    expect(testState.subscribeBackendRealtime.mock.calls.filter(
      (call) => call[0].topic === 'sealed_mailbox:scoped-mailbox-unconfirmed-0',
    )).toHaveLength(2)
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'transport',
      'scoped_mailbox_realtime_recycled',
      expect.objectContaining({
        reason: 'scheduled_delivery_unconfirmed',
        previousStatus: 'CONNECTING',
        restarted: true,
      }),
    )
  })

  it('routes realtime control inserts to control processing', async () => {
    const chatIdentity = { id: 'identity-me' } as any
    S.setChatIdentity(chatIdentity)
    S.setChatClient({} as any)

    startRealtimeSubscription()
    await settleRealtimeStartup()
    const sealedHandler = testState.channelHandlers.find((entry) => (
      entry.filter.event === 'sealed_message_insert'
    ))

    sealedHandler?.callback({ payload: { server_sequence: 10, delivery_class: 'control' } })
    await vi.advanceTimersByTimeAsync(50)

    expect(callbacks.processControlMessagesNow).toHaveBeenCalledTimes(1)
    expect(callbacks.pollForNewMessages).not.toHaveBeenCalled()
  })

  it('processes control messages for legacy realtime inserts without delivery class', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    S.setChatClient({} as any)

    startRealtimeSubscription()
    await settleRealtimeStartup()
    const sealedHandler = testState.channelHandlers.find((entry) => (
      entry.filter.event === 'sealed_message_insert'
    ))

    sealedHandler?.callback({ payload: { server_sequence: 10 } })
    await vi.advanceTimersByTimeAsync(50)

    expect(callbacks.processControlMessagesNow).toHaveBeenCalledTimes(1)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'websocket', latestServerSequence: 10 }),
    )
  })

  it('serializes legacy control processing before the matching message poll', async () => {
    let releaseControl!: () => void
    callbacks.processControlMessagesNow.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseControl = resolve
    }))
    S.setChatIdentity({ id: 'identity-me' } as any)
    S.setChatClient({} as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    const sealedHandler = testState.channelHandlers.find((entry) => (
      entry.filter.event === 'sealed_message_insert'
    ))

    sealedHandler?.callback({ payload: { server_sequence: 10 } })
    await vi.advanceTimersByTimeAsync(50)

    expect(callbacks.processControlMessagesNow).toHaveBeenCalledTimes(1)
    expect(callbacks.pollForNewMessages).not.toHaveBeenCalled()

    releaseControl()
    await vi.waitFor(() => {
      expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'websocket', latestServerSequence: 10 }),
      )
    })
  })

  it('subscribes active scoped mailbox tokens to realtime broadcasts', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    S.setChatClient({} as any)
    testState.mailboxScopes = [
      {
        localIdentityId: 'identity-me',
        remoteIdentityId: 'remote-1',
        scopeId: 'scope-active',
        scopeSecret: 'scope-secret',
        epoch: 2,
        status: 'active',
        createdAt: 1,
        updatedAt: 1,
      },
      {
        localIdentityId: 'identity-me',
        remoteIdentityId: 'remote-2',
        scopeId: 'scope-retired',
        scopeSecret: 'scope-secret',
        epoch: 0,
        status: 'retired',
        createdAt: 1,
        updatedAt: 1,
      },
    ]

    startRealtimeSubscription()
    await Promise.resolve()

    expect(testState.getMailboxScopes).toHaveBeenCalledWith('identity-me')
    expect(testState.backendChannel).toHaveBeenCalledWith(
      'sealed_mailbox:mailbox-token',
      expect.objectContaining({ config: expect.objectContaining({ private: false }) }),
    )
    await vi.waitFor(() => {
      expect(testState.backendChannel).toHaveBeenCalledWith(
        'sealed_mailbox:scoped-mailbox-scope-active-2',
        expect.objectContaining({ config: expect.objectContaining({ private: false }) }),
      )
    })
    expect(testState.registerMailboxScope).toHaveBeenCalledWith('scoped-mailbox-scope-active-2')
    expect(testState.storeMailboxScope).toHaveBeenCalledWith(expect.objectContaining({
      scopeId: 'scope-active',
      registeredAt: expect.any(Number),
      registrationVersion: 1,
    }))
    expect(testState.backendChannel).not.toHaveBeenCalledWith(
      'sealed_mailbox:scoped-mailbox-scope-retired-0',
      expect.anything(),
    )
    await vi.advanceTimersByTimeAsync(50)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'subscription_catchup', latestServerSequence: undefined }),
    )
    callbacks.pollForNewMessages.mockClear()

    const sealedHandlers = testState.channelHandlers.filter((entry) => entry.filter.event === 'sealed_message_insert')
    sealedHandlers.at(-1)?.callback({ payload: { server_sequence: 11 } })
    await vi.advanceTimersByTimeAsync(50)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'websocket', latestServerSequence: 11 }),
    )

    const scopedChannel = testState.backendChannel.mock.results
      .map((result) => result.value)
      .find((channel) => channel.topic === 'sealed_mailbox:scoped-mailbox-scope-active-2')
    stopRealtimeSubscription()
    expect(testState.removeChannel).toHaveBeenCalledWith(scopedChannel)
  })

  it('retries a failed scoped channel without recycling the primary channel', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    testState.mailboxScopes = [{
      localIdentityId: 'identity-me',
      remoteIdentityId: 'remote-retry',
      scopeId: 'retry',
      scopeSecret: 'scope-secret',
      epoch: 0,
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    }]

    startRealtimeSubscription()
    await vi.waitFor(() => {
        expect(testState.subscribeBackendRealtime).toHaveBeenCalledWith(
          expect.objectContaining({ topic: 'sealed_mailbox:scoped-mailbox-retry-0' }),
        )
    })
    const primaryChannel = S.realtimeChannel
    const scopedRequest = testState.subscribeBackendRealtime.mock.calls
      .map((call) => call[0])
      .find((request) => request.topic === 'sealed_mailbox:scoped-mailbox-retry-0')
    testState.removeChannel.mockClear()

    scopedRequest.onError(new Error('scoped failed'))

    expect(S.realtimeChannel).toBe(primaryChannel)
    expect(testState.removeChannel).not.toHaveBeenCalledWith(primaryChannel)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(testState.subscribeBackendRealtime.mock.calls.filter(
      (call) => call[0].topic === 'sealed_mailbox:scoped-mailbox-retry-0',
    )).toHaveLength(2)
  })

  it('does not subscribe extra server-registry mailbox tokens', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    testState.registeredMailboxTokens = ['mailbox-token', 'smbx2.secondary']

    startRealtimeSubscription()
    await settleRealtimeStartup()

    expect(testState.subscribeBackendRealtime.mock.calls.filter(
      (call) => call[0].topic === 'sealed_mailbox:mailbox-token',
    )).toHaveLength(1)
    expect(testState.subscribeBackendRealtime).not.toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'sealed_mailbox:smbx2.secondary' }),
    )
  })

  it('does not subscribe server-registered mailbox tokens when local scope state is empty', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    S.setChatClient({} as any)
    S.setBundleServer({
      listRegisteredMailboxTokens: testState.listRegisteredMailboxTokens,
    } as any)
    testState.registeredMailboxTokens = ['smbx1.legacy', 'smbx2.recovered']

    startRealtimeSubscription()
    await settleRealtimeStartup()

    expect(testState.listRegisteredMailboxTokens).not.toHaveBeenCalled()
    expect(testState.backendChannel).not.toHaveBeenCalledWith(
      'sealed_mailbox:smbx1.legacy',
      expect.anything(),
    )
    expect(testState.backendChannel).not.toHaveBeenCalledWith(
      'sealed_mailbox:smbx2.recovered',
      expect.anything(),
    )
  })

  it('refreshes scoped mailbox realtime subscriptions after startup', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    S.setChatClient({} as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()

    expect(testState.backendChannel).not.toHaveBeenCalledWith(
      'sealed_mailbox:scoped-mailbox-scope-late-0',
      expect.anything(),
    )

    testState.mailboxScopes = [{
      localIdentityId: 'identity-me',
      remoteIdentityId: 'remote-late',
      scopeId: 'scope-late',
      scopeSecret: 'scope-secret',
      epoch: 0,
      status: 'active',
      createdAt: 1,
      updatedAt: 2,
    }]
    await refreshRealtimeMailboxSubscriptions()
    await vi.advanceTimersByTimeAsync(0)

    expect(testState.backendChannel).toHaveBeenCalledWith(
      'sealed_mailbox:scoped-mailbox-scope-late-0',
      expect.objectContaining({ config: expect.objectContaining({ private: false }) }),
    )
    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'subscription_catchup' }),
    )
    callbacks.pollForNewMessages.mockClear()
    const sealedHandlers = testState.channelHandlers.filter((entry) => entry.filter.event === 'sealed_message_insert')
    sealedHandlers.at(-1)?.callback({ payload: { server_sequence: 13 } })
    await vi.advanceTimersByTimeAsync(50)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'websocket', latestServerSequence: 13 }),
    )
  })

  it('debounces realtime message bursts into one receive poll', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()

    const sealedHandler = testState.channelHandlers.find((entry) => (
      entry.filter.event === 'sealed_message_insert'
    ))

    sealedHandler?.callback({ payload: { server_sequence: 21 } })
    await vi.advanceTimersByTimeAsync(10)
    sealedHandler?.callback({ payload: { server_sequence: 22 } })

    expect(callbacks.pollForNewMessages).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(20)

    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'websocket',
        latestServerSequence: 22,
      }),
    )
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'performance',
      'message_poll_request_complete',
      expect.objectContaining({
        source: 'websocket',
        wakeupCount: 2,
        latestServerSequence: 22,
      }),
    )
  })

  it('starts a coalesced realtime poll before a continuous burst can delay it', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()

    const sealedHandler = testState.channelHandlers.find((entry) => (
      entry.filter.event === 'sealed_message_insert'
    ))

    for (let sequence = 30; sequence <= 41; sequence += 1) {
      sealedHandler?.callback({ payload: { server_sequence: sequence } })
      await vi.advanceTimersByTimeAsync(10)
    }

    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'websocket',
        latestServerSequence: 41,
      }),
    )
  })

  it('retries a websocket wakeup until its sequence becomes fetch-visible', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    callbacks.pollForNewMessages
      .mockResolvedValueOnce({
        lastServerSequence: 100,
        directMessageCount: 0,
        mailboxSequences: new Map([['mailbox-token', 9]]),
      })
      .mockResolvedValueOnce({
        lastServerSequence: 100,
        directMessageCount: 1,
        mailboxSequences: new Map([['mailbox-token', 10]]),
      })
    const sealedHandler = testState.channelHandlers.find((entry) => (
      entry.filter.event === 'sealed_message_insert'
    ))

    sealedHandler?.callback({
      payload: { server_sequence: 10, delivery_class: 'message' },
    })
    await vi.advanceTimersByTimeAsync(50)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(139)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(2)
    expect(callbacks.pollForNewMessages).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: 'websocket', latestServerSequence: 10 }),
    )
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'transport',
      'realtime_visibility_retry_scheduled',
      expect.objectContaining({ attempt: 1, latestServerSequence: 10 }),
    )
  })

  it('retries a websocket wakeup queued behind an active scheduled poll', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    let resolveScheduled!: (result: {
      lastServerSequence: number
      mailboxSequences: Map<string, number>
    }) => void
    callbacks.pollForNewMessages
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveScheduled = resolve
      }))
      .mockResolvedValueOnce({
        lastServerSequence: 100,
        mailboxSequences: new Map([['mailbox-token', 9]]),
      })
      .mockResolvedValueOnce({
        lastServerSequence: 100,
        mailboxSequences: new Map([['mailbox-token', 10]]),
      })
    startMessagePolling()
    await vi.advanceTimersByTimeAsync(1_000)
    const sealedHandler = testState.channelHandlers.find((entry) => (
      entry.filter.event === 'sealed_message_insert'
    ))

    sealedHandler?.callback({
      payload: { server_sequence: 10, delivery_class: 'message' },
    })
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'performance',
      'message_poll_websocket_event',
      expect.objectContaining({ coalesced: true, latestServerSequence: 10 }),
    )
    resolveScheduled({
      lastServerSequence: 100,
      mailboxSequences: new Map([['mailbox-token', 9]]),
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(200)

    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(3)
    expect(callbacks.pollForNewMessages).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: 'websocket', latestServerSequence: 10 }),
    )
  })

  it('does not trust an invalid websocket sequence as a fast-path cursor', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    const sealedHandler = testState.channelHandlers.find((entry) => (
      entry.filter.event === 'sealed_message_insert'
    ))

    sealedHandler?.callback({
      payload: { server_sequence: 10.5, delivery_class: 'message' },
    })
    await vi.advanceTimersByTimeAsync(0)

    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'subscription_catchup',
        latestServerSequence: undefined,
      }),
    )
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'transport',
      'realtime_message_wakeup_invalid',
      expect.objectContaining({ hasServerSequence: true }),
    )
  })

  it('skips queued realtime polls already covered by the active poll', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    let resolveFirstPoll: ((result: { lastServerSequence: number }) => void) | undefined
    callbacks.pollForNewMessages.mockImplementationOnce(() => new Promise<{ lastServerSequence: number }>((resolve) => {
      resolveFirstPoll = resolve
    }))
    callbacks.mergePendingMessagePoll.mockReturnValue(true)

    const sealedHandler = testState.channelHandlers.find((entry) => (
      entry.filter.event === 'sealed_message_insert'
    ))

    sealedHandler?.callback({ payload: { server_sequence: 31 } })
    await vi.advanceTimersByTimeAsync(50)
    sealedHandler?.callback({ payload: { server_sequence: 32 } })
    await vi.advanceTimersByTimeAsync(50)

    expect(callbacks.mergePendingMessagePoll).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'queued',
        latestServerSequence: 32,
        realtimeRequestedAt: expect.any(Number),
      }),
    )
    resolveFirstPoll?.({ lastServerSequence: 32 })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)

    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'performance',
      'message_poll_queue_satisfied',
      expect.objectContaining({
        queuedCount: 1,
        latestServerSequence: 32,
        lastServerSequence: 32,
      }),
    )
  })

  it('drains realtime events queued behind an active poll immediately', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    let resolveFirstPoll: (() => void) | undefined
    callbacks.pollForNewMessages.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveFirstPoll = resolve
    }))

    const sealedHandler = testState.channelHandlers.find((entry) => (
      entry.filter.event === 'sealed_message_insert'
    ))

    sealedHandler?.callback({ payload: { server_sequence: 31 } })
    await vi.advanceTimersByTimeAsync(50)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)

    sealedHandler?.callback({ payload: { server_sequence: 32 } })
    await vi.advanceTimersByTimeAsync(50)
    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(1)

    resolveFirstPoll?.()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)

    expect(callbacks.pollForNewMessages).toHaveBeenCalledTimes(2)
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'performance',
      'message_poll_queue_drained',
      expect.objectContaining({
        queuedCount: 1,
        latestServerSequence: 32,
      }),
    )
  })

  it('subscribes to outbound sealed receipt token channels', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    S.setChatClient({} as any)

    startRealtimeSubscription()
    trackOutboundReceiptToken('delivery-token-1')

    expect(testState.backendChannel).toHaveBeenCalledWith(
      'sealed_receipt:delivery-token-1',
      expect.objectContaining({ config: expect.objectContaining({ private: false }) }),
    )
    const receiptHandler = testState.channelHandlers.find((entry) => (
      entry.filter.event === 'sealed_receipt_update'
    ))
    receiptHandler?.callback({ payload: { message_id: 'relay-message-1', status: 'delivered' } })
    expect(callbacks.syncOutboundRelayStatuses).not.toHaveBeenCalled()
    expect(callbacks.applyOutboundRelayStatus).toHaveBeenCalledWith('relay-message-1', 'delivered')

    receiptHandler?.callback({ payload: { message_id: 'relay-message-1', status: 'read' } })
    expect(callbacks.applyOutboundRelayStatus).toHaveBeenCalledWith('relay-message-1', 'read')
    expect(callbacks.syncOutboundRelayStatuses).not.toHaveBeenCalled()
    expect(testState.removeChannel).toHaveBeenCalled()
  })

  it('bounds outbound receipt subscriptions and falls back to status sync', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    S.setChatClient({} as any)

    startRealtimeSubscription()
    for (let index = 0; index < 30; index += 1) {
      trackOutboundReceiptToken(`delivery-token-${index}`)
    }
    await Promise.resolve()

    const receiptRequests = testState.subscribeBackendRealtime.mock.calls
      .map(([request]) => request)
      .filter((request) => request.topic.startsWith('sealed_receipt:'))
    expect(receiptRequests).toHaveLength(24)
    expect(callbacks.syncOutboundRelayStatuses).toHaveBeenCalledWith({ force: true })
  })

  it('forces one fallback sync for an invalid realtime receipt payload', () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    S.setRealtimeChannel({ close: vi.fn() } as any)

    trackOutboundReceiptToken('delivery-token-invalid')

    const receiptHandler = testState.channelHandlers.find((entry) => (
      entry.filter.event === 'sealed_receipt_update'
    ))
    receiptHandler?.callback({ payload: { status: 'delivered' } })

    expect(callbacks.applyOutboundRelayStatus).not.toHaveBeenCalled()
    expect(callbacks.syncOutboundRelayStatuses).toHaveBeenCalledTimes(1)
    expect(callbacks.syncOutboundRelayStatuses).toHaveBeenCalledWith({ force: true })
  })

  it('recovers realtime subscriptions after terminal channel statuses', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()

    testState.activeChannel?.subscribeCallback?.('CLOSED')
    expect(testState.removeChannel).toHaveBeenCalledWith(testState.activeChannel)

    await vi.advanceTimersByTimeAsync(5_000)

    expect(callbacks.reconcileQuantumChat).toHaveBeenCalledWith({
      fullResync: true,
      restartRealtime: true,
      reason: 'manual_recovery',
    })
  })

  it('polls immediately when the primary realtime socket drops', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    callbacks.pollForNewMessages.mockClear()

    testState.activeChannel?.subscribeCallback?.('CLOSED')
    await vi.advanceTimersByTimeAsync(24)

    expect(callbacks.pollForNewMessages).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'subscription_catchup' }),
    )
  })

  it('does not recover realtime channels while Spectre polling is active', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()

    testState.activeChannel?.subscribeCallback?.('CLOSED')
    testState.spectreState.enabled = true
    await vi.advanceTimersByTimeAsync(5_000)

    expect(callbacks.reconcileQuantumChat).not.toHaveBeenCalled()
  })

  it('recovers realtime when a scheduled poll receives direct messages', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    const firstChannel = S.realtimeChannel
    callbacks.pollForNewMessages.mockResolvedValueOnce({
      lastServerSequence: 41,
      directMessageCount: 1,
    })

    startMessagePolling()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(testState.removeChannel).toHaveBeenCalledWith(firstChannel)
    expect(S.realtimeChannel).toBeNull()
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'transport',
      'realtime_missed_event_recovery',
      expect.objectContaining({
        directMessageCount: 1,
        lastServerSequence: 41,
      }),
    )

    await vi.advanceTimersByTimeAsync(750)

    expect(callbacks.reconcileQuantumChat).toHaveBeenCalledWith({
      fullResync: true,
      restartRealtime: true,
      reason: 'manual_recovery',
    })
  })

  it('restarts unconfirmed realtime channels during scheduled polls', async () => {
    testState.subscribeBackendRealtime.mockImplementationOnce((request: any) => {
      const channel = testState.backendChannel(request.topic, { config: { private: false } })
      return channel
    })
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    const firstChannel = S.realtimeChannel
    callbacks.pollForNewMessages.mockResolvedValueOnce({
      lastServerSequence: 43,
      directMessageCount: 0,
    })

    startMessagePolling()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(testState.removeChannel).toHaveBeenCalledWith(firstChannel)
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'transport',
      'realtime_unconfirmed_channel_recovery',
      expect.objectContaining({
        lastServerSequence: 43,
      }),
    )
    expect(testState.subscribeBackendRealtime).toHaveBeenCalledTimes(2)
  })

  it('subscribes observed legacy mailbox tokens after scheduled delivery', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    const firstChannel = S.realtimeChannel
    callbacks.pollForNewMessages.mockResolvedValueOnce({
      lastServerSequence: 42,
      directMessageCount: 1,
      mailboxTokens: ['smbx1.observed'],
    })

    startMessagePolling()
    callbacks.reconcileQuantumChat.mockClear()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(testState.backendChannel).toHaveBeenCalledWith(
      'sealed_mailbox:smbx1.observed',
      expect.objectContaining({ config: expect.objectContaining({ private: false }) }),
    )
    expect(testState.removeChannel).not.toHaveBeenCalledWith(firstChannel)
    expect(callbacks.reconcileQuantumChat).not.toHaveBeenCalled()
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'transport',
      'realtime_observed_mailbox_subscriptions',
      expect.objectContaining({
        directMessageCount: 1,
        subscribedCount: 1,
      }),
    )
  })

  it('recovers only the historical mailbox that missed scheduled delivery', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    testState.mailboxScopes = [{
      localIdentityId: 'identity-me',
      remoteIdentityId: 'remote-stale',
      scopeId: 'stale',
      scopeSecret: 'scope-secret',
      epoch: 0,
      status: 'active',
      createdAt: 1,
      updatedAt: 1,
    }]
    startRealtimeSubscription()
    await vi.waitFor(() => {
      expect(testState.subscribeBackendRealtime.mock.calls.filter(
        (call) => call[0].topic === 'sealed_mailbox:scoped-mailbox-stale-0',
      )).toHaveLength(1)
    })
    await settleRealtimeStartup()
    const primaryChannel = S.realtimeChannel
    const originalScopedChannel = testState.backendChannel.mock.results
      .map((result) => result.value)
      .find((channel) => channel.topic === 'sealed_mailbox:scoped-mailbox-stale-0')
    testState.removeChannel.mockClear()
    callbacks.pollForNewMessages.mockResolvedValueOnce({
      lastServerSequence: 51,
      directMessageCount: 1,
      mailboxTokens: ['scoped-mailbox-stale-0'],
    })

    startMessagePolling()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(S.realtimeChannel).toBe(primaryChannel)
    expect(testState.removeChannel).toHaveBeenCalledWith(originalScopedChannel)
    expect(testState.removeChannel).not.toHaveBeenCalledWith(primaryChannel)
    expect(testState.subscribeBackendRealtime.mock.calls.filter(
      (call) => call[0].topic === 'sealed_mailbox:scoped-mailbox-stale-0',
    )).toHaveLength(2)
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'transport',
      'scoped_mailbox_realtime_recovery',
      expect.objectContaining({ recoveredScopedCount: 1 }),
    )

    await vi.advanceTimersByTimeAsync(0)
    callbacks.pollForNewMessages.mockResolvedValueOnce({
      lastServerSequence: 52,
      directMessageCount: 1,
      mailboxTokens: ['scoped-mailbox-stale-0'],
    })
    await vi.advanceTimersByTimeAsync(1_000)

    expect(testState.subscribeBackendRealtime.mock.calls.filter(
      (call) => call[0].topic === 'sealed_mailbox:scoped-mailbox-stale-0',
    )).toHaveLength(2)
    expect(S.realtimeChannel).toBe(primaryChannel)
  })

  it('refreshes expiring sessions and syncs bundle server access', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    testState.authState.session = { expiresAt: Date.now() + 4 * 60 * 1_000 }

    startSessionRefreshTimer()
    await vi.advanceTimersByTimeAsync(S.SESSION_REFRESH_CHECK_INTERVAL_MS)

    expect(testState.ensureBoundBackendAccessForIdentity).toHaveBeenCalledWith('identity-me')
    expect(callbacks.syncBundleServerAccessToken).toHaveBeenCalled()
  })

  it('reopens realtime subscriptions after access token rotation', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    startRealtimeSubscription()
    await settleRealtimeStartup()
    const firstChannel = S.realtimeChannel
    testState.getCachedBackendAccessToken.mockReturnValue('rotated-access-token')
    testState.authState.session = { expiresAt: Date.now() + 4 * 60 * 1_000 }

    startSessionRefreshTimer()
    await vi.advanceTimersByTimeAsync(S.SESSION_REFRESH_CHECK_INTERVAL_MS)

    expect(testState.removeChannel).toHaveBeenCalledWith(firstChannel)
    expect(testState.subscribeBackendRealtime).toHaveBeenCalledTimes(2)
    expect(testState.subscribeBackendRealtime).toHaveBeenLastCalledWith(
      expect.objectContaining({ accessToken: 'rotated-access-token' }),
    )
    expect(testState.recordChatDiagnostic).toHaveBeenCalledWith(
      'transport',
      'realtime_access_token_rotated',
      {},
    )
  })

  it('recycles unhealthy realtime channels during liveness checks', async () => {
    S.setChatIdentity({ id: 'identity-me' } as any)
    S.setRealtimeChannel(null)

    startRealtimeLivenessMonitor()
    await vi.advanceTimersByTimeAsync(45_000)

    expect(testState.subscribeBackendRealtime).toHaveBeenCalled()
  })
})
