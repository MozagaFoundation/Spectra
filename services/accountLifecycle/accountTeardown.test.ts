/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  events: [] as string[],
  secureStoreFailure: false,
  captureFailure: false,
  deactivationFailure: false,
  session: {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  } as { accessToken: string; refreshToken: string } | null,
  reset: vi.fn(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getAllKeys: vi.fn(async () => []),
    multiRemove: vi.fn(async () => undefined),
  },
}))
vi.mock('@/services/backend/account', () => ({
  deleteBackendAccount: vi.fn(async () => mockState.events.push('backend_account')),
}))
vi.mock('@/services/backend/auth', () => ({
  revokeBackendSession: vi.fn(async () => mockState.events.push('session_revoked')),
}))
vi.mock('@/services/backend/client', () => ({ clearProfileCache: vi.fn() }))
vi.mock('@/services/backend/session', () => ({ invalidateAuthCaches: vi.fn() }))
vi.mock('@/services/backend/storage', () => ({ clearResolvedStorageUrl: vi.fn() }))
vi.mock('@/services/chat', () => ({
  cleanupChat: vi.fn(() => mockState.events.push('chat_deactivated')),
  waitForChatQuiescence: vi.fn(async () => mockState.events.push('chat_idle')),
}))
vi.mock('@/services/groupChat/storage', () => ({ clearAllGroupChatStorage: vi.fn(async () => {}) }))
vi.mock('@/services/media/avatarImageCache', () => ({ clearEncryptedAvatarMemoryCache: vi.fn() }))
vi.mock('@/services/media/exportService', () => ({ clearMediaExportCache: vi.fn(async () => {}) }))
vi.mock('@/services/notifications/pushService', () => ({
  captureNotificationCleanupSnapshot: vi.fn(async () => {
    if (mockState.captureFailure) throw new Error('scope registry unavailable')
    return {
      walletAddresses: ['EXO_ROOT'],
      notificationScopeIds: ['nsc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      pushTokens: ['ExpoPushToken[test]'],
    }
  }),
  deactivateNotificationRuntime: vi.fn(async () => {
    mockState.events.push('notifications_deactivated')
    if (mockState.deactivationFailure) throw new Error('notification shutdown failed')
  }),
  revokeNotificationCleanupSnapshot: vi.fn(async (_snapshot, options) => {
    mockState.events.push(`notification_revoked:${options.accessToken}`)
  }),
}))
vi.mock('@/services/notifications/registrationCoordinator', () => ({
  invalidateActiveWalletPushRegistration: vi.fn(),
}))
vi.mock('@/services/security/receiptPreferences', () => ({ clearCachedReceiptPreferences: vi.fn() }))
vi.mock('@/services/security/persistedSensitiveData', () => ({
  clearPersistedSensitiveSecureStoreData: vi.fn(async () => {
    mockState.events.push('secure_keys_erased')
    if (mockState.secureStoreFailure) throw new Error('key erase failed')
  }),
  clearPersistedTorSecureStoreData: vi.fn(async () => {}),
}))
vi.mock('@/services/security/accountStorageRecovery', () => ({
  clearLegacyAccountStorage: vi.fn(async () => mockState.events.push('legacy_keys_erased')),
}))
vi.mock('@/services/security/dataProtection', () => ({ clearVisualMediaCache: vi.fn(async () => {}) }))
vi.mock('@/services/storage/asyncStorageAdapter', () => ({
  getAsyncStorageAdapter: () => ({ clear: vi.fn(async () => {}) }),
}))
vi.mock('@/services/storage/localCacheCrypto', () => ({
  clearLocalCacheKeyMemory: vi.fn(() => mockState.events.push('memory_keys_erased')),
}))
vi.mock('@/services/ui/chatBackgroundStorage', () => ({ clearCustomChatBackgrounds: vi.fn(async () => {}) }))
vi.mock('@/store/bluetoothStore', () => ({
  clearPersistedBluetoothConfig: vi.fn(async () => {}),
  useBluetoothStore: { getState: () => ({ reset: mockState.reset }) },
}))
vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      session: mockState.session,
      clearSession: vi.fn(async () => {
        mockState.events.push('local_session_erased')
        mockState.session = null
      }),
    }),
  },
}))
vi.mock('@/store/onboardingStore', () => ({
  useOnboardingStore: { getState: () => ({ clearPendingWallet: vi.fn() }) },
}))
vi.mock('@/services/tor/torStore', () => ({
  useTorStore: { getState: () => ({ reset: mockState.reset }) },
}))
vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      wallet: { address: 'EXO_ROOT' },
      wallets: [{ address: 'EXO_ROOT' }],
      lockVault: vi.fn(() => mockState.events.push('vault_locked')),
    }),
    setState: vi.fn(),
  },
}))
vi.mock('@/services/call/callSessionRegistry', () => ({ CALL_SESSION_REGISTRY_KEY: 'calls' }))
vi.mock('@/services/security/installLifecycle', () => ({ clearInstallSentinel: vi.fn(async () => {}) }))
vi.mock('@/services/notifications/chatNotificationWakeup', () => ({
  clearPendingChatWakeupStorage: vi.fn(async () => {}),
}))
vi.mock('@/services/crypto/pendingTransactions', () => ({
  clearAllPendingCryptoTransactionStorage: vi.fn(async () => {}),
}))
vi.mock('@/services/tor/torService', () => ({ clearTorRuntimeData: vi.fn(async () => {}) }))
vi.mock('@/store', () => ({
  useChatStore: { getState: () => ({ reset: mockState.reset }) },
  useUIStore: { getState: () => ({ clearToasts: mockState.reset }) },
  useGroupChatStore: { getState: () => ({ reset: mockState.reset }) },
}))

const teardown = await import('./accountTeardown')

describe('accountTeardown', () => {
  beforeEach(() => {
    mockState.events.length = 0
    mockState.secureStoreFailure = false
    mockState.captureFailure = false
    mockState.deactivationFailure = false
    mockState.session = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    }
    vi.clearAllMocks()
  })

  it('erases local key material before remote notification and session cleanup', async () => {
    await teardown.logoutAndWipeAccount()

    const remoteIndex = mockState.events.findIndex((event) => event.startsWith('notification_revoked'))
    expect(remoteIndex).toBeGreaterThan(mockState.events.indexOf('secure_keys_erased'))
    expect(remoteIndex).toBeGreaterThan(mockState.events.indexOf('legacy_keys_erased'))
    expect(mockState.events).toContain('notification_revoked:access-token')
    expect(mockState.events.indexOf('session_revoked')).toBeGreaterThan(remoteIndex)
  })

  it('continues remote revocation but reports failed local key erasure', async () => {
    mockState.secureStoreFailure = true

    await expect(teardown.logoutAndWipeAccount()).rejects.toThrow('Failed to erase 1 local key stores')
    expect(mockState.events).toContain('notification_revoked:access-token')
  })

  it('cannot be blocked by notification snapshot or runtime shutdown failure', async () => {
    mockState.captureFailure = true
    mockState.deactivationFailure = true

    await teardown.logoutAndWipeAccount()

    expect(mockState.events).toContain('secure_keys_erased')
    expect(mockState.events).toContain('legacy_keys_erased')
    expect(mockState.events).toContain('notification_revoked:access-token')
  })
})
