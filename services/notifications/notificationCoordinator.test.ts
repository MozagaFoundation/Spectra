/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const ROOT_SCOPE = 'nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const SECONDARY_SCOPE = 'nsc1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const mockState = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  scopes: new Map<string, string>(),
  authState: {
    isAuthenticated: true,
    isCloudAuthVerified: true,
    isIdentityBound: true,
  },
  walletState: {
    isVaultUnlocked: true,
    wallet: { address: 'EXO_ROOT', spectreMode: false } as {
      address: string
      spectreMode?: boolean
    } | null,
  },
  markWalletUnread: vi.fn(async () => {}),
  initializeQuantumChat: vi.fn(async () => true),
  reconcileMessagingPushWakeup: vi.fn(async () => true),
  isQuantumChatInitialized: vi.fn(() => true),
  resolveNotificationScopeWallet: vi.fn(async (scopeId: string) =>
    mockState.scopes.get(scopeId) ?? null
  ),
  prefetchSealedMailbox: vi.fn(async () => true),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockState.storage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockState.storage.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      mockState.storage.delete(key)
    }),
  },
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

vi.mock('@/store/exoAccountNotificationStore', () => ({
  useExoAccountNotificationStore: {
    getState: () => ({
      markWalletUnread: mockState.markWalletUnread,
    }),
  },
}))

vi.mock('./notificationScope', () => ({
  resolveNotificationScopeWallet: mockState.resolveNotificationScopeWallet,
}))

vi.mock('./sealedMailboxPrefetch', () => ({
  prefetchSealedMailbox: mockState.prefetchSealedMailbox,
}))

vi.mock('./prefetchSession', () => ({
  clearPrefetchSession: vi.fn(async () => {}),
}))

vi.mock('@/services/storage/sealedPrefetchCache', () => ({
  clearSealedPrefetchRows: vi.fn(async () => {}),
}))

vi.mock('../quantumChat', () => ({
  initializeQuantumChat: mockState.initializeQuantumChat,
  reconcileMessagingPushWakeup: mockState.reconcileMessagingPushWakeup,
  isQuantumChatInitialized: () => mockState.isQuantumChatInitialized(),
}))

function push(scopeId: string, eventSuffix: string): Record<string, unknown> {
  return {
    notificationScopeId: scopeId,
    notificationEventId: `nev1.${eventSuffix.repeat(32)}`,
  }
}

async function importCoordinator() {
  vi.resetModules()
  return import('./notificationCoordinator')
}

describe('notificationCoordinator', () => {
  beforeEach(() => {
    mockState.storage.clear()
    mockState.scopes.clear()
    mockState.scopes.set(ROOT_SCOPE, 'EXO_ROOT')
    mockState.scopes.set(SECONDARY_SCOPE, 'EXO_SECONDARY')
    mockState.authState.isAuthenticated = true
    mockState.authState.isCloudAuthVerified = true
    mockState.authState.isIdentityBound = true
    mockState.walletState.isVaultUnlocked = true
    mockState.walletState.wallet = { address: 'EXO_ROOT', spectreMode: false }
    vi.clearAllMocks()
    mockState.initializeQuantumChat.mockResolvedValue(true)
    mockState.reconcileMessagingPushWakeup.mockResolvedValue(true)
    mockState.isQuantumChatInitialized.mockReturnValue(true)
    mockState.resolveNotificationScopeWallet.mockImplementation(async (scopeId: string) =>
      mockState.scopes.get(scopeId) ?? null
    )
    mockState.prefetchSealedMailbox.mockResolvedValue(true)
  })

  it('rejects malformed payloads and retains unresolved scopes for recovery', async () => {
    const coordinator = await importCoordinator()
    const unknownScope = 'nsc1.cccccccccccccccccccccccccccccccc'

    await expect(coordinator.enqueueMessagingPush({
      type: 'sealed_direct_message',
      notificationScopeId: 'EXO_ROOT',
      notificationEventId: `nev1.${'1'.repeat(32)}`,
    }, 'received')).resolves.toBe(false)
    await expect(coordinator.enqueueMessagingPush(
      push(unknownScope, '2'),
      'received',
    )).resolves.toBe(true)
    await expect(coordinator.enqueueMessagingPush(
      push(unknownScope, '2'),
      'background',
    )).resolves.toBe(false)

    expect(mockState.reconcileMessagingPushWakeup).not.toHaveBeenCalled()
    expect(mockState.markWalletUnread).not.toHaveBeenCalled()

    mockState.scopes.set(unknownScope, 'EXO_ROOT')
    await expect(coordinator.consumePendingMessagingNotifications('bootstrap')).resolves.toBe(true)
    expect(mockState.reconcileMessagingPushWakeup).toHaveBeenCalledTimes(1)
  })

  it('persists an opaque wakeup before SecureStore-backed scope resolution', async () => {
    const coordinator = await importCoordinator()
    const payload = push(ROOT_SCOPE, 'f')
    mockState.resolveNotificationScopeWallet.mockRejectedValueOnce(
      new Error('SecureStore is unavailable while device is locked'),
    )

    await expect(coordinator.enqueueMessagingPush(payload, 'background')).resolves.toBe(true)

    const pending = JSON.parse(
      mockState.storage.get('spectra:pending_messaging_notification:v2') ?? '[]',
    )
    expect(pending).toEqual([
      expect.objectContaining({
        notificationScopeId: ROOT_SCOPE,
        notificationEventId: payload.notificationEventId,
        source: 'background',
      }),
    ])
    expect(mockState.reconcileMessagingPushWakeup).not.toHaveBeenCalled()
  })

  it('waits for verified identity binding before reconciling a wakeup', async () => {
    mockState.authState.isIdentityBound = false
    const coordinator = await importCoordinator()
    const payload = push(ROOT_SCOPE, 'e')

    await expect(coordinator.enqueueMessagingPush(payload, 'background')).resolves.toBe(true)
    expect(mockState.reconcileMessagingPushWakeup).not.toHaveBeenCalled()

    mockState.authState.isIdentityBound = true
    await expect(coordinator.consumePendingMessagingNotifications('bootstrap')).resolves.toBe(true)
    expect(mockState.reconcileMessagingPushWakeup).toHaveBeenCalledTimes(1)
  })

  it('full-resyncs only the active wallet for a legacy type-only wakeup', async () => {
    const coordinator = await importCoordinator()

    await expect(coordinator.enqueueMessagingPush({
      type: 'sealed_direct_message',
    }, 'received')).resolves.toBe(true)

    expect(mockState.reconcileMessagingPushWakeup).toHaveBeenCalledTimes(1)
    expect(mockState.markWalletUnread).not.toHaveBeenCalled()
    await expect(coordinator.hasPendingMessagingNotifications()).resolves.toBe(false)
  })

  it('defers a legacy wakeup until an active non-Spectre wallet is unlocked', async () => {
    mockState.walletState.isVaultUnlocked = false
    const coordinator = await importCoordinator()

    await expect(coordinator.enqueueMessagingPush({
      type: 'sealed_direct_message',
    }, 'background')).resolves.toBe(true)
    expect(mockState.reconcileMessagingPushWakeup).not.toHaveBeenCalled()
    expect(mockState.markWalletUnread).not.toHaveBeenCalled()
    await expect(coordinator.hasPendingMessagingNotifications()).resolves.toBe(true)

    mockState.walletState.isVaultUnlocked = true
    await expect(coordinator.consumePendingMessagingNotifications('bootstrap')).resolves.toBe(true)
    expect(mockState.reconcileMessagingPushWakeup).toHaveBeenCalledTimes(1)
    await expect(coordinator.hasPendingMessagingNotifications()).resolves.toBe(false)
  })

  it('marks an inactive known scope and defers decryption until activation', async () => {
    const coordinator = await importCoordinator()

    await expect(coordinator.enqueueMessagingPush(
      push(SECONDARY_SCOPE, '3'),
      'background',
    )).resolves.toBe(true)

    expect(mockState.markWalletUnread).toHaveBeenCalledWith('EXO_SECONDARY')
    expect(mockState.reconcileMessagingPushWakeup).not.toHaveBeenCalled()

    mockState.walletState.wallet = { address: 'EXO_SECONDARY', spectreMode: false }
    await expect(
      coordinator.consumePendingMessagingNotifications('persona_activation'),
    ).resolves.toBe(true)
    expect(mockState.reconcileMessagingPushWakeup).toHaveBeenCalledTimes(1)
  })

  it('prefetches sealed rows when a background wakeup cannot decrypt yet', async () => {
    mockState.walletState.isVaultUnlocked = false
    const coordinator = await importCoordinator()

    await expect(coordinator.enqueueMessagingPush(
      push(ROOT_SCOPE, 'c'),
      'background',
    )).resolves.toBe(true)

    expect(mockState.reconcileMessagingPushWakeup).not.toHaveBeenCalled()
    expect(mockState.prefetchSealedMailbox).toHaveBeenCalledWith('EXO_ROOT')
  })

  it('deduplicates the same event across ingress sources', async () => {
    const coordinator = await importCoordinator()
    const payload = push(ROOT_SCOPE, '4')

    await expect(coordinator.enqueueMessagingPush(payload, 'received')).resolves.toBe(true)
    await expect(coordinator.enqueueMessagingPush(payload, 'response')).resolves.toBe(false)

    expect(mockState.reconcileMessagingPushWakeup).toHaveBeenCalledTimes(1)
  })

  it('coalesces a burst of active-wallet wakeups into one pass', async () => {
    const coordinator = await importCoordinator()

    await Promise.all([
      coordinator.enqueueMessagingPush(push(ROOT_SCOPE, '7'), 'received'),
      coordinator.enqueueMessagingPush(push(ROOT_SCOPE, '8'), 'response'),
    ])

    expect(mockState.reconcileMessagingPushWakeup).toHaveBeenCalledTimes(1)
  })

  it('runs a final merged pass when a push arrives during reconciliation', async () => {
    let finishFirst: () => void = () => {}
    mockState.reconcileMessagingPushWakeup.mockImplementationOnce(() =>
      new Promise<boolean>((resolve) => {
        finishFirst = () => resolve(true)
      })
    )
    const coordinator = await importCoordinator()

    const first = coordinator.enqueueMessagingPush(push(ROOT_SCOPE, '5'), 'received')
    while (mockState.reconcileMessagingPushWakeup.mock.calls.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    const second = coordinator.enqueueMessagingPush(push(ROOT_SCOPE, '6'), 'background')
    await new Promise((resolve) => setTimeout(resolve, 0))
    finishFirst()

    await Promise.all([first, second])
    expect(mockState.reconcileMessagingPushWakeup).toHaveBeenCalledTimes(2)
    await expect(coordinator.hasPendingMessagingNotifications()).resolves.toBe(false)
  })

  it('retains a wakeup until a bound full relay resync completes', async () => {
    mockState.reconcileMessagingPushWakeup.mockResolvedValueOnce(false)
    const coordinator = await importCoordinator()
    const payload = push(ROOT_SCOPE, '9')

    await expect(coordinator.enqueueMessagingPush(payload, 'background')).resolves.toBe(true)
    await expect(coordinator.hasPendingMessagingNotifications()).resolves.toBe(true)

    mockState.reconcileMessagingPushWakeup.mockResolvedValueOnce(true)
    await expect(coordinator.consumePendingMessagingNotifications('bootstrap')).resolves.toBe(true)
    await expect(coordinator.hasPendingMessagingNotifications()).resolves.toBe(false)
  })

  it('does not start mailbox catch-up on unlock before chat runtime exists', async () => {
    mockState.isQuantumChatInitialized.mockReturnValue(false)
    const coordinator = await importCoordinator()
    const payload = push(ROOT_SCOPE, 'a')

    await expect(coordinator.enqueueMessagingPush(payload, 'response')).resolves.toBe(true)
    await expect(coordinator.consumePendingMessagingNotifications('unlock')).resolves.toBe(true)
    expect(mockState.reconcileMessagingPushWakeup).not.toHaveBeenCalled()
    await expect(coordinator.hasPendingMessagingNotifications()).resolves.toBe(true)

    mockState.isQuantumChatInitialized.mockReturnValue(true)
    await expect(coordinator.consumePendingMessagingNotifications('bootstrap')).resolves.toBe(true)
    expect(mockState.reconcileMessagingPushWakeup).toHaveBeenCalledTimes(1)
  })
})
