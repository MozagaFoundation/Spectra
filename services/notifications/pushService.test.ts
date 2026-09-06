/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  clearnetEgressAllowed: true,
  clearnetCancellations: new Set<() => void | Promise<void>>(),
  notificationHandler: null as null | {
    handleNotification: (notification: { request: { content: { data?: Record<string, unknown> } } }) => Promise<Record<string, unknown>>
  },
  receivedListeners: [] as Array<(notification: { request: { content: { data?: Record<string, unknown> } } }) => void>,
  responseListeners: [] as Array<(response: { notification: { request: { content: { data?: Record<string, unknown> } } } }) => void>,
  pushTokenListeners: [] as Array<(token: { data: string; type: string }) => void>,
  appState: { currentState: 'active' },
  platform: { OS: 'ios' },
  notificationLocale: 'en' as 'en' | 'es',
  translateMessage: vi.fn((key: string) => `localized:${key}`),
  constants: {
    easConfig: { projectId: 'project-id' },
    expoConfig: null as null | { extra?: { eas?: { projectId?: string } } },
  },
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: vi.fn(async () => ({ data: 'ExpoPushToken[test]' })),
  setNotificationChannelAsync: vi.fn(async () => {}),
  scheduleNotificationAsync: vi.fn(async () => 'scheduled-id'),
  getPresentedNotificationsAsync: vi.fn(async () => [] as Array<{ request: { identifier: string; content: { data?: Record<string, unknown> } } }>),
  getLastNotificationResponseAsync: vi.fn(async () => null as null | { notification: { request: { identifier?: string; content: { data?: Record<string, unknown> } } } }),
  clearLastNotificationResponseAsync: vi.fn(async () => {}),
  dismissNotificationAsync: vi.fn(async () => {}),
  dismissAllNotificationsAsync: vi.fn(async () => {}),
  setBadgeCountAsync: vi.fn(async () => {}),
  updateNotificationRegistrationsForWallets: vi.fn(async () => ({ error: null })),
  deleteNotificationRegistrationsByScopeIds: vi.fn(async () => ({ error: null })),
  deleteNotificationRegistrationsByPushTokens: vi.fn(async () => ({ error: null })),
  deleteSupersededLegacyNotificationRegistrations: vi.fn(async () => ({ error: null })),
  deleteSupersededScopedNotificationRegistrations: vi.fn(async () => ({ error: null })),
  deleteLegacyNotificationTokensForWallets: vi.fn(async () => ({ error: null })),
  removeNotificationScopesForWallets: vi.fn(async () => {}),
  registerCallNotificationTask: vi.fn(async () => {}),
  unregisterCallNotificationTask: vi.fn(async () => {}),
  handleIncomingCallNotificationPayload: vi.fn(async () => true),
  isAuthorizedCallNotificationPayload: vi.fn(async () => true),
  enqueueMessagingPush: vi.fn(async () => true),
  reconcileQuantumChat: vi.fn(async () => {}),
  markWalletUnread: vi.fn(async () => {}),
  routerPush: vi.fn(),
  routerNavigate: vi.fn(),
  authState: { isAuthenticated: true, exoAddress: 'EXO_ROOT' },
  walletState: {
    isVaultUnlocked: true,
    wallet: { address: 'EXO_ROOT' } as { address: string } | null,
    wallets: [] as Array<{ address: string; displayName?: string; spectreMode?: boolean }>,
  },
  chatState: {
    activeConversationId: null as string | null,
    storageScope: 'EXO_ROOT',
    totalUnreadCount: 0,
    conversations: [] as Array<{
      id: string
      localWalletAddress?: string
      remoteIdentityId: string
      remoteWalletAddress?: string
      unreadCount: number
      createdAt: number
      updatedAt: number
    }>,
    contacts: [] as Array<{
      localWalletAddress?: string
      identityId: string
      walletAddress?: string
      displayName: string
      addedAt: number
    }>,
  },
  groupState: {
    groups: [] as Array<{ groupId: string; localWalletAddress?: string; unreadCount?: number }>,
  },
  walletTransferState: {
    totalUnreadCount: 0,
    refresh: vi.fn(async () => {}),
  },
}))

vi.mock('@/services/tor/torEgressPolicy', () => ({
  isClearnetEgressAllowed: () => mockState.clearnetEgressAllowed,
  registerClearnetOperation: (cancel: () => void | Promise<void>) => {
    if (!mockState.clearnetEgressAllowed) {
      void cancel()
      throw new Error('Clearnet network access is blocked while Tor mode is enabled.')
    }
    mockState.clearnetCancellations.add(cancel)
    return () => mockState.clearnetCancellations.delete(cancel)
  },
}))

vi.mock('expo-notifications', () => ({
  AndroidImportance: { MAX: 'max' },
  AndroidNotificationPriority: { HIGH: 'high', LOW: 'low' },
  AndroidNotificationVisibility: { PRIVATE: 'private' },
  setNotificationHandler: vi.fn((handler) => {
    mockState.notificationHandler = handler
  }),
  getPermissionsAsync: mockState.getPermissionsAsync,
  requestPermissionsAsync: mockState.requestPermissionsAsync,
  getExpoPushTokenAsync: mockState.getExpoPushTokenAsync,
  setNotificationChannelAsync: mockState.setNotificationChannelAsync,
  scheduleNotificationAsync: mockState.scheduleNotificationAsync,
  addNotificationReceivedListener: vi.fn((listener) => {
    mockState.receivedListeners.push(listener)
    return { remove: vi.fn() }
  }),
  addNotificationResponseReceivedListener: vi.fn((listener) => {
    mockState.responseListeners.push(listener)
    return { remove: vi.fn() }
  }),
  addPushTokenListener: vi.fn((listener) => {
    mockState.pushTokenListeners.push(listener)
    return { remove: vi.fn() }
  }),
  getPresentedNotificationsAsync: mockState.getPresentedNotificationsAsync,
  getLastNotificationResponseAsync: mockState.getLastNotificationResponseAsync,
  clearLastNotificationResponseAsync: mockState.clearLastNotificationResponseAsync,
  dismissNotificationAsync: mockState.dismissNotificationAsync,
  dismissAllNotificationsAsync: mockState.dismissAllNotificationsAsync,
  setBadgeCountAsync: mockState.setBadgeCountAsync,
}))

vi.mock('expo-constants', () => ({
  default: mockState.constants,
}))

vi.mock('@/lib/i18n', () => ({
  getCurrentLanguage: () => mockState.notificationLocale,
}))

vi.mock('@/lib/i18n/messages', () => ({
  translateMessage: mockState.translateMessage,
}))

vi.mock('react-native', () => ({
  AppState: mockState.appState,
  Platform: mockState.platform,
}))

vi.mock('expo-router', () => ({
  router: {
    push: mockState.routerPush,
    navigate: mockState.routerNavigate,
  },
}))

vi.mock('../backend/client', () => ({
  deleteNotificationRegistrationsByScopeIds: mockState.deleteNotificationRegistrationsByScopeIds,
  deleteNotificationRegistrationsByPushTokens: mockState.deleteNotificationRegistrationsByPushTokens,
  deleteSupersededLegacyNotificationRegistrations: mockState.deleteSupersededLegacyNotificationRegistrations,
  deleteSupersededScopedNotificationRegistrations: mockState.deleteSupersededScopedNotificationRegistrations,
  deleteLegacyNotificationTokensForWallets: mockState.deleteLegacyNotificationTokensForWallets,
  updateNotificationRegistrationsForWallets: mockState.updateNotificationRegistrationsForWallets,
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => mockState.authState,
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => mockState.walletState,
  },
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: {
    getState: () => mockState.chatState,
  },
}))

vi.mock('@/store/groupChatStore', () => ({
  useGroupChatStore: {
    getState: () => mockState.groupState,
  },
}))

vi.mock('@/store/walletTransferNotificationStore', () => ({
  useWalletTransferNotificationStore: {
    getState: () => mockState.walletTransferState,
  },
}))

vi.mock('@/store/exoAccountNotificationStore', () => ({
  useExoAccountNotificationStore: {
    getState: () => ({
      markWalletUnread: mockState.markWalletUnread,
    }),
  },
}))

vi.mock('./callNotificationTask', () => ({
  registerCallNotificationTask: mockState.registerCallNotificationTask,
  unregisterCallNotificationTask: mockState.unregisterCallNotificationTask,
  handleIncomingCallNotificationPayload: mockState.handleIncomingCallNotificationPayload,
}))

vi.mock('./callNotificationAuthorization', () => ({
  isAuthorizedCallNotificationPayload: mockState.isAuthorizedCallNotificationPayload,
}))

vi.mock('./notificationCoordinator', () => ({
  enqueueMessagingPush: mockState.enqueueMessagingPush,
  normalizeMessagingPushPayload: (data?: Record<string, unknown>) =>
    typeof data?.notificationScopeId === 'string'
      && typeof data.notificationEventId === 'string'
      ? data
      : null,
}))

vi.mock('./prefetchSession', () => ({
  clearPrefetchSession: vi.fn(async () => {}),
}))

vi.mock('@/services/storage/sealedPrefetchCache', () => ({
  clearSealedPrefetchRows: vi.fn(async () => {}),
}))

vi.mock('./notificationScope', () => ({
  getOrCreateNotificationScopeId: vi.fn(async (walletAddress: string) =>
    walletAddress === 'EXO_ROOT'
      ? 'nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      : 'nsc1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  ),
  getStoredNotificationScopes: vi.fn(async () => []),
  getNotificationScopesForWallets: vi.fn(async (walletAddresses: string[]) =>
    walletAddresses.includes('EXO_ROOT')
      ? [{
        notificationScopeId: 'nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        walletAddress: 'EXO_ROOT',
      }]
      : []
  ),
  removeNotificationScopesForWallets: mockState.removeNotificationScopesForWallets,
}))

vi.mock('../quantumChat', () => ({
  reconcileQuantumChat: mockState.reconcileQuantumChat,
}))

function notification(data?: Record<string, unknown>, identifier?: string) {
  return { request: { identifier, content: { data } } }
}

function response(data?: Record<string, unknown>, identifier?: string) {
  return { notification: notification(data, identifier) }
}

async function importPushService() {
  vi.resetModules()
  return import('./pushService')
}

describe('pushService audit behavior', () => {
  beforeEach(() => {
    mockState.clearnetEgressAllowed = true
    mockState.clearnetCancellations.clear()
    mockState.notificationHandler = null
    mockState.receivedListeners = []
    mockState.responseListeners = []
    mockState.pushTokenListeners = []
    mockState.appState.currentState = 'active'
    mockState.platform.OS = 'ios'
    mockState.notificationLocale = 'en'
    mockState.translateMessage.mockImplementation((key: string) => `localized:${key}`)
    mockState.constants.easConfig = { projectId: 'project-id' }
    mockState.constants.expoConfig = null
    mockState.authState.isAuthenticated = true
    mockState.walletState.isVaultUnlocked = true
    mockState.walletState.wallet = { address: 'EXO_ROOT' }
    mockState.walletState.wallets = []
    mockState.chatState.activeConversationId = null
    mockState.chatState.totalUnreadCount = 0
    mockState.chatState.conversations = []
    mockState.chatState.contacts = []
    mockState.groupState.groups = []
    mockState.walletTransferState.totalUnreadCount = 0
    vi.clearAllMocks()
    mockState.getPermissionsAsync.mockResolvedValue({ status: 'granted' })
    mockState.requestPermissionsAsync.mockResolvedValue({ status: 'granted' })
    mockState.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExpoPushToken[test]' })
    mockState.getPresentedNotificationsAsync.mockResolvedValue([])
    mockState.getLastNotificationResponseAsync.mockResolvedValue(null)
    mockState.clearLastNotificationResponseAsync.mockResolvedValue(undefined)
    mockState.updateNotificationRegistrationsForWallets.mockResolvedValue({ error: null })
    mockState.deleteNotificationRegistrationsByScopeIds.mockResolvedValue({ error: null })
    mockState.deleteNotificationRegistrationsByPushTokens.mockResolvedValue({ error: null })
    mockState.deleteSupersededLegacyNotificationRegistrations.mockResolvedValue({ error: null })
    mockState.deleteSupersededScopedNotificationRegistrations.mockResolvedValue({ error: null })
    mockState.deleteLegacyNotificationTokensForWallets.mockResolvedValue({ error: null })
    mockState.enqueueMessagingPush.mockResolvedValue(true)
    mockState.isAuthorizedCallNotificationPayload.mockResolvedValue(true)
    mockState.handleIncomingCallNotificationPayload.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('registers non-Spectre wallets once for a stable token signature', async () => {
    const service = await importPushService()

    await service.initializePushNotificationsForWallets([
      { address: 'EXO_ROOT', displayName: 'Root' },
      { address: 'EXO_SECONDARY', displayName: 'Secondary' },
      { address: 'EXO_SPECTRE', displayName: 'Spectre', spectreMode: true },
    ])
    await service.initializePushNotificationsForWallets([
      { address: 'EXO_ROOT', displayName: 'Root' },
      { address: 'EXO_SECONDARY', displayName: 'Secondary' },
      { address: 'EXO_SPECTRE', displayName: 'Spectre', spectreMode: true },
    ])

    expect(mockState.registerCallNotificationTask).toHaveBeenCalledTimes(2)
    expect(mockState.updateNotificationRegistrationsForWallets).toHaveBeenCalledTimes(1)
    expect(mockState.updateNotificationRegistrationsForWallets).toHaveBeenCalledWith([
      {
        walletAddress: 'EXO_ROOT',
        notificationScopeId: 'nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        pushToken: 'ExpoPushToken[test]',
        notificationLabel: 'Root',
        notificationLocale: 'en',
        protocolVersion: 2,
        clientPlatform: 'ios',
      },
      {
        walletAddress: 'EXO_SECONDARY',
        notificationScopeId: 'nsc1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        pushToken: 'ExpoPushToken[test]',
        notificationLabel: 'Secondary',
        notificationLocale: 'en',
        protocolVersion: 2,
        clientPlatform: 'ios',
      },
    ])
    expect(mockState.deleteSupersededLegacyNotificationRegistrations).toHaveBeenCalledWith(
      ['EXO_ROOT', 'EXO_SECONDARY'],
      'ExpoPushToken[test]',
    )
    expect(mockState.receivedListeners).toHaveLength(1)
    expect(mockState.responseListeners).toHaveLength(1)
    expect(mockState.pushTokenListeners).toHaveLength(1)
    expect(service.getCurrentPushToken()).toBe('ExpoPushToken[test]')
  })

  it('uploads a rotated Expo token without refetching the native device token', async () => {
    const service = await importPushService()
    await service.initializePushNotificationsForWallets([
      { address: 'EXO_ROOT', displayName: 'Root' },
    ])
    mockState.updateNotificationRegistrationsForWallets.mockClear()
    mockState.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExpoPushToken[rotated]' })

    mockState.pushTokenListeners[0]?.({ data: 'native-token', type: 'ios' })

    await vi.waitFor(() => {
      expect(mockState.updateNotificationRegistrationsForWallets).toHaveBeenCalledWith([
        expect.objectContaining({
          walletAddress: 'EXO_ROOT',
          pushToken: 'ExpoPushToken[rotated]',
        }),
      ])
    })
    expect(mockState.getExpoPushTokenAsync).toHaveBeenLastCalledWith({
      projectId: 'project-id',
      devicePushToken: { data: 'native-token', type: 'ios' },
    })
  })

  it('registers the response listener before push-token initialization', async () => {
    const service = await importPushService()

    service.initializeNotificationResponseHandling()

    expect(mockState.responseListeners).toHaveLength(1)
    expect(mockState.getPermissionsAsync).not.toHaveBeenCalled()
    expect(mockState.getExpoPushTokenAsync).not.toHaveBeenCalled()
  })

  it('does not contact push infrastructure when clearnet egress is blocked', async () => {
    mockState.clearnetEgressAllowed = false
    const service = await importPushService()

    await service.initializePushNotificationsForWallets([
      { address: 'EXO_ROOT', displayName: 'Root' },
    ])

    expect(mockState.getPermissionsAsync).not.toHaveBeenCalled()
    expect(mockState.getExpoPushTokenAsync).not.toHaveBeenCalled()
    expect(mockState.updateNotificationRegistrationsForWallets).not.toHaveBeenCalled()
  })

  it('discards a push token that resolves while the clearnet boundary closes', async () => {
    const tokenRequest = {
      resolve: null as ((value: { data: string }) => void) | null,
    }
    mockState.getExpoPushTokenAsync.mockReturnValue(new Promise((resolve) => {
      tokenRequest.resolve = resolve
    }))
    const service = await importPushService()

    const initialization = service.initializePushNotificationsForWallets([
      { address: 'EXO_ROOT', displayName: 'Root' },
    ])
    await vi.waitFor(() => {
      expect(mockState.getExpoPushTokenAsync).toHaveBeenCalledTimes(1)
    })

    mockState.clearnetEgressAllowed = false
    const cancellations = Promise.all(
      [...mockState.clearnetCancellations].map((cancel) => cancel()),
    )
    tokenRequest.resolve?.({ data: 'ExpoPushToken[late]' })
    await cancellations
    await initialization

    expect(mockState.updateNotificationRegistrationsForWallets).not.toHaveBeenCalled()
    expect(service.getCurrentPushToken()).toBeNull()
  })

  it('forces an authenticated push token resync when the binding becomes ready', async () => {
    const service = await importPushService()
    const wallets = [{ address: 'EXO_ROOT', displayName: 'Root' }]

    await service.initializePushNotificationsForWallets(wallets)
    await service.initializePushNotificationsForWallets(wallets, {
      forceSync: true,
      accessToken: 'access-token',
    })

    expect(mockState.updateNotificationRegistrationsForWallets).toHaveBeenCalledTimes(2)
    expect(mockState.updateNotificationRegistrationsForWallets).toHaveBeenLastCalledWith(
      [{
        walletAddress: 'EXO_ROOT',
        notificationScopeId: 'nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        pushToken: 'ExpoPushToken[test]',
        notificationLabel: 'Root',
        notificationLocale: 'en',
        protocolVersion: 2,
        clientPlatform: 'ios',
      }],
      { accessToken: 'access-token' },
    )
  })

  it('resyncs registrations when the selected app language changes', async () => {
    const service = await importPushService()
    const wallets = [{ address: 'EXO_ROOT', displayName: 'Root' }]

    await service.initializePushNotificationsForWallets(wallets)
    mockState.notificationLocale = 'es'
    await service.initializePushNotificationsForWallets(wallets)

    expect(mockState.updateNotificationRegistrationsForWallets).toHaveBeenCalledTimes(2)
    expect(mockState.updateNotificationRegistrationsForWallets).toHaveBeenLastCalledWith([
      expect.objectContaining({
        notificationLocale: 'es',
      }),
    ])
  })

  it('creates all Android notification channels used by backend pushes', async () => {
    mockState.platform.OS = 'android'
    const service = await importPushService()

    await service.initializePushNotificationsForWallets([{ address: 'EXO_ROOT' }])

    expect(mockState.setNotificationChannelAsync).toHaveBeenCalledWith('default', expect.objectContaining({
      name: 'localized:Default',
      importance: 'max',
    }))
    expect(mockState.setNotificationChannelAsync).toHaveBeenCalledWith('messages', expect.objectContaining({
      name: 'localized:Messages',
      description: 'localized:New message notifications',
      importance: 'max',
      sound: 'default',
    }))
    expect(mockState.setNotificationChannelAsync).toHaveBeenCalledWith('calls', expect.objectContaining({
      name: 'localized:Calls',
      description: 'localized:Secure call notifications',
      importance: 'max',
      sound: 'default',
    }))
    expect(mockState.setNotificationChannelAsync).toHaveBeenCalledWith('transfers', expect.objectContaining({
      name: 'localized:Transfers',
      description: 'localized:Wallet transfer notifications',
      importance: 'max',
      sound: 'default',
    }))
  })

  it('clears the cached device token after push deregistration', async () => {
    const service = await importPushService()

    await service.initializePushNotificationsForWallets([{ address: 'EXO_ROOT' }])
    expect(service.getCurrentPushToken()).toBe('ExpoPushToken[test]')

    await service.deregisterPushTokensForWallets([' EXO_ROOT ', 'EXO_ROOT'])

    expect(mockState.deleteNotificationRegistrationsByScopeIds).toHaveBeenCalledWith(
      ['nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      undefined,
    )
    expect(mockState.deleteLegacyNotificationTokensForWallets).toHaveBeenCalledWith(
      ['EXO_ROOT'],
      undefined,
    )
    expect(service.getCurrentPushToken()).toBeNull()
  })

  it('captures cleanup authority before deactivating the notification runtime', async () => {
    const service = await importPushService()
    await service.initializePushNotificationsForWallets([{ address: 'EXO_ROOT' }])

    await expect(service.captureNotificationCleanupSnapshot(['EXO_ROOT'])).resolves.toEqual({
      walletAddresses: ['EXO_ROOT'],
      notificationScopeIds: ['nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      pushTokens: ['ExpoPushToken[test]'],
    })

    await service.deactivateNotificationRuntime()

    expect(mockState.unregisterCallNotificationTask).toHaveBeenCalled()
    expect(mockState.dismissAllNotificationsAsync).toHaveBeenCalled()
    expect(mockState.setBadgeCountAsync).toHaveBeenCalledWith(0)
    expect(service.getCurrentPushToken()).toBeNull()
  })

  it('revokes scoped, token-bound, and legacy registrations with explicit auth', async () => {
    const service = await importPushService()
    const snapshot = {
      walletAddresses: ['EXO_ROOT'],
      notificationScopeIds: ['nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      pushTokens: ['ExpoPushToken[test]'],
    }

    await service.revokeNotificationCleanupSnapshot(snapshot, { accessToken: 'access-token' })

    expect(mockState.deleteNotificationRegistrationsByScopeIds).toHaveBeenCalledWith(
      snapshot.notificationScopeIds,
      { accessToken: 'access-token' },
    )
    expect(mockState.deleteNotificationRegistrationsByPushTokens).toHaveBeenCalledWith(
      snapshot.pushTokens,
      { accessToken: 'access-token' },
    )
    expect(mockState.deleteLegacyNotificationTokensForWallets).toHaveBeenCalledWith(
      snapshot.walletAddresses,
      { accessToken: 'access-token' },
    )
  })

  it('keeps scope routing until Spectre remote cleanup succeeds', async () => {
    let releaseCleanup: (() => void) | undefined
    mockState.deleteNotificationRegistrationsByScopeIds.mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseCleanup = () => resolve({ error: null })
      }),
    )
    const service = await importPushService()

    const cleanup = service.schedulePrivateTransportPushTokenCleanup(['EXO_ROOT'])
    await Promise.resolve()

    expect(mockState.removeNotificationScopesForWallets).not.toHaveBeenCalled()
    releaseCleanup?.()
    await cleanup
    expect(mockState.removeNotificationScopesForWallets).toHaveBeenCalledWith(['EXO_ROOT'])
  })

  it('suppresses remote foreground chat banners but allows local previews', async () => {
    await importPushService()

    const remoteResult = await mockState.notificationHandler?.handleNotification(notification({
      conversationId: 'conv-1',
      remoteIdentityId: 'identity-1',
    }))
    expect(remoteResult?.shouldShowAlert).toBe(false)
    expect(remoteResult?.shouldPlaySound).toBe(false)

    const localPreviewResult = await mockState.notificationHandler?.handleNotification(notification({
      conversationId: 'conv-2',
      remoteIdentityId: 'identity-2',
      localPreview: true,
    }))
    expect(localPreviewResult?.shouldShowAlert).toBe(true)
    expect(localPreviewResult?.shouldPlaySound).toBe(true)
  })

  it('keeps foreground incoming call notifications audible without showing content', async () => {
    await importPushService()

    const result = await mockState.notificationHandler?.handleNotification(notification({
      type: 'call',
      callSessionId: 'call-1',
      callType: 'voice',
    }))

    expect(result?.shouldShowAlert).toBe(false)
    expect(result?.shouldShowBanner).toBe(false)
    expect(result?.shouldPlaySound).toBe(true)
  })

  it('routes only known notification targets on user response', async () => {
    const service = await importPushService()
    mockState.chatState.conversations = [{
      id: 'conversation-1',
      localWalletAddress: 'EXO_ROOT',
      remoteIdentityId: 'identity-1',
      remoteWalletAddress: 'EXO_REMOTE',
      unreadCount: 0,
      createdAt: 1,
      updatedAt: 1,
    }]

    await service.initializePushNotificationsForWallets([{ address: 'EXO_ROOT' }])
    mockState.responseListeners[0]?.(response({
      conversationId: 'conversation-1',
      localWalletAddress: 'EXO_ROOT',
      remoteWalletAddress: 'EXO_REMOTE',
    }))
    mockState.responseListeners[0]?.(response({
      conversationId: 'conversation-unknown',
      remoteWalletAddress: 'EXO_UNKNOWN',
    }))

    expect(mockState.routerNavigate).toHaveBeenCalledTimes(1)
    expect(mockState.routerNavigate).toHaveBeenCalledWith('/(main)/chat/EXO_REMOTE?local=EXO_ROOT')
  })

  it('routes incoming call responses through pending-call unlock after storing the payload', async () => {
    const service = await importPushService()
    mockState.authState.isAuthenticated = true
    mockState.walletState.isVaultUnlocked = false

    await service.initializePushNotificationsForWallets([{ address: 'EXO_ROOT' }])
    mockState.responseListeners[0]?.(response({
      type: 'call',
      callSessionId: 'call-1',
      callType: 'voice',
      notificationScopeId: `nsc1.${'a'.repeat(32)}`,
      notificationEventId: `nev1.${'b'.repeat(32)}`,
    }))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(mockState.handleIncomingCallNotificationPayload).toHaveBeenCalledWith(
      expect.objectContaining({ callSessionId: 'call-1' }),
    )
    expect(mockState.enqueueMessagingPush).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'call',
        callSessionId: 'call-1',
        notificationScopeId: `nsc1.${'a'.repeat(32)}`,
      }),
      'response',
    )
    expect(mockState.routerPush).toHaveBeenCalledWith('/(auth)/unlock?pendingCall=1')
    expect(mockState.routerNavigate).not.toHaveBeenCalled()
  })

  it('queues chat reconciliation after an authorized foreground call notification', async () => {
    const service = await importPushService()
    await service.initializePushNotificationsForWallets([{ address: 'EXO_ROOT' }])

    mockState.receivedListeners[0]?.(notification({
      type: 'call',
      callSessionId: 'call-foreground',
      callType: 'video',
      notificationScopeId: `nsc1.${'c'.repeat(32)}`,
      notificationEventId: `nev1.${'d'.repeat(32)}`,
    }))

    await vi.waitFor(() => {
      expect(mockState.handleIncomingCallNotificationPayload).toHaveBeenCalledWith(
        expect.objectContaining({ callSessionId: 'call-foreground' }),
      )
    })
    expect(mockState.enqueueMessagingPush).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'call',
        callSessionId: 'call-foreground',
        notificationScopeId: `nsc1.${'c'.repeat(32)}`,
      }),
      'received',
    )
  })

  it('retries a locked call response after the device foregrounds', async () => {
    const service = await importPushService()
    const lockedResponse = response({
      type: 'call',
      callSessionId: 'call-locked',
      callType: 'voice',
    }, 'call-locked-response')
    mockState.walletState.isVaultUnlocked = false
    mockState.isAuthorizedCallNotificationPayload.mockResolvedValue(false)

    await service.initializePushNotificationsForWallets([{ address: 'EXO_ROOT' }])
    mockState.responseListeners[0]?.(lockedResponse)
    await vi.waitFor(() => {
      expect(mockState.isAuthorizedCallNotificationPayload).toHaveBeenCalled()
    })

    expect(mockState.handleIncomingCallNotificationPayload).not.toHaveBeenCalled()
    expect(mockState.routerPush).not.toHaveBeenCalled()
    expect(mockState.routerNavigate).not.toHaveBeenCalled()

    mockState.walletState.isVaultUnlocked = true
    mockState.isAuthorizedCallNotificationPayload.mockResolvedValue(true)
    mockState.getLastNotificationResponseAsync.mockResolvedValue(lockedResponse)

    await expect(
      service.consumeLastCallNotificationResponse(),
    ).resolves.toBe('handled')

    expect(mockState.handleIncomingCallNotificationPayload).toHaveBeenCalledWith(
      expect.objectContaining({ callSessionId: 'call-locked' }),
    )
    expect(mockState.routerPush).not.toHaveBeenCalled()
    expect(mockState.routerNavigate).toHaveBeenCalledWith('/(main)/(tabs)/chats?pendingCall=1')
    expect(mockState.clearLastNotificationResponseAsync).toHaveBeenCalled()
  })

  it('handles the last notification response after Android cold start', async () => {
    mockState.platform.OS = 'android'
    mockState.chatState.conversations = [{
      id: 'conversation-1',
      localWalletAddress: 'EXO_ROOT',
      remoteIdentityId: 'identity-1',
      remoteWalletAddress: 'EXO_REMOTE',
      unreadCount: 0,
      createdAt: 1,
      updatedAt: 1,
    }]
    mockState.getLastNotificationResponseAsync.mockResolvedValue(response({
      conversationId: 'conversation-1',
      localWalletAddress: 'EXO_ROOT',
      remoteWalletAddress: 'EXO_REMOTE',
    }, 'last-response-1'))
    const service = await importPushService()

    await service.initializePushNotificationsForWallets([{ address: 'EXO_ROOT' }])
    await Promise.resolve()
    await Promise.resolve()

    expect(mockState.routerNavigate).toHaveBeenCalledWith('/(main)/chat/EXO_REMOTE?local=EXO_ROOT')
  })

  it('hands opaque sealed-message notifications to the coordinator', async () => {
    const service = await importPushService()
    mockState.walletState.wallets = [{ address: 'EXO_INACTIVE' }]
    mockState.chatState.conversations = [{
      id: 'conversation-1',
      localWalletAddress: 'EXO_ROOT',
      remoteIdentityId: 'identity-1',
      remoteWalletAddress: 'EXO_REMOTE',
      unreadCount: 0,
      createdAt: 1,
      updatedAt: 1,
    }]

    await service.initializePushNotificationsForWallets([{ address: 'EXO_ROOT' }])
    mockState.receivedListeners[0]?.(notification({
      notificationScopeId: 'nsc1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      notificationEventId: 'nev1.11111111111111111111111111111111',
    }))
    await Promise.resolve()
    await Promise.resolve()
    mockState.responseListeners[0]?.(response({
      notificationScopeId: 'nsc1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      notificationEventId: 'nev1.11111111111111111111111111111111',
    }))
    await Promise.resolve()
    await Promise.resolve()
    mockState.responseListeners[0]?.(response({
      type: 'sealed_direct_message',
      conversationId: 'conversation-1',
      localWalletAddress: 'EXO_ROOT',
      remoteWalletAddress: 'EXO_REMOTE',
    }))

    expect(mockState.enqueueMessagingPush).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationScopeId: 'nsc1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
      'received',
    )
    expect(mockState.routerNavigate).not.toHaveBeenCalled()
  })

  it('coalesces foreground local notifications by thread before scheduling', async () => {
    vi.useFakeTimers()
    const service = await importPushService()

    await service.sendLocalNotification('Alice', 'First', {
      conversationId: 'conversation-1',
      remoteIdentityId: 'identity-1',
    })
    await service.sendLocalNotification('Alice', 'Second', {
      conversationId: 'conversation-1',
      remoteIdentityId: 'identity-1',
    })

    expect(mockState.scheduleNotificationAsync).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(750)

    expect(mockState.scheduleNotificationAsync).toHaveBeenCalledTimes(1)
    expect(mockState.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Alice',
        body: 'Second',
        data: {
          conversationId: 'conversation-1',
          remoteIdentityId: 'identity-1',
          localPreview: true,
        },
        sound: 'default',
      },
      trigger: null,
    })
  })

  it('sums direct, group, and wallet transfer unread counts into the app badge', async () => {
    const service = await importPushService()
    mockState.chatState.totalUnreadCount = 2
    mockState.groupState.groups = [{ groupId: 'group-1', localWalletAddress: 'EXO_ROOT', unreadCount: 3 }]
    mockState.walletTransferState.totalUnreadCount = 7

    await service.syncGlobalBadge()

    expect(mockState.setBadgeCountAsync).toHaveBeenCalledWith(12)
  })
})
