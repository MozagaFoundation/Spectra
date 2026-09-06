/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  getAllKeys: vi.fn(async () => ['exo_messages', 'call_sessions', 'unrelated']),
  multiRemove: vi.fn(async () => {}),
  getItemAsync: vi.fn(async (_key: string) => null as string | null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
  cleanupChat: vi.fn(),
  clearResolvedStorageUrl: vi.fn(),
  clearPendingWallet: vi.fn(),
  lockVault: vi.fn(),
  walletSetState: vi.fn(),
  adapterClear: vi.fn(async () => {}),
  adapterClearDecryptedMessageCache: vi.fn(async () => {}),
  setDecryptedMessagePersistenceEnabled: vi.fn(),
  clearAllGroupChatStorage: vi.fn(async () => {}),
  clearEditedImageCache: vi.fn(async () => {}),
  clearMediaExportCache: vi.fn(async () => {}),
  clearMediaCache: vi.fn(async () => {}),
  clearEncryptedAvatarCache: vi.fn(async () => {}),
  clearEncryptedAvatarMemoryCache: vi.fn(),
  clearTransientRenderCache: vi.fn(async () => {}),
  clearLocalCacheKeyMemory: vi.fn(),
  clearImageMemoryCache: vi.fn(async () => true),
  clearImageDiskCache: vi.fn(async () => true),
  clearCachedReceiptPreferences: vi.fn(),
  clearProfileCache: vi.fn(),
  clearCustomChatBackgrounds: vi.fn(async () => {}),
  clearPersistedBluetoothConfig: vi.fn(async () => {}),
  bluetoothReset: vi.fn(),
  clearTorRuntimeData: vi.fn(async () => {}),
  torReset: vi.fn(),
  deleteBackendAccount: vi.fn(async () => ({ postgresRowsDeleted: 1, relayRowsDeleted: 1, objectsDeleted: 1 })),
  authSession: null as null | { accessToken: string; refreshToken: string },
  walletAddresses: [] as string[],
  logout: vi.fn(async () => {}),
  clearSession: vi.fn(async () => {}),
  lockForVault: vi.fn(),
  spectreEnabled: false,
  clearInstallSentinel: vi.fn(async () => {}),
  clearPendingChatWakeupStorage: vi.fn(async () => {}),
  clearAllPendingCryptoTransactionStorage: vi.fn(async () => {}),
  deregisterPushTokensForWallets: vi.fn(async () => {}),
  chatReset: vi.fn(),
  clearToasts: vi.fn(),
  groupReset: vi.fn(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getAllKeys: mockState.getAllKeys,
    multiRemove: mockState.multiRemove,
  },
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: mockState.getItemAsync,
  setItemAsync: mockState.setItemAsync,
  deleteItemAsync: mockState.deleteItemAsync,
}))

vi.mock('expo-image', () => ({
  Image: {
    clearMemoryCache: mockState.clearImageMemoryCache,
    clearDiskCache: mockState.clearImageDiskCache,
  },
}))

vi.mock('@/services/chat', () => ({
  cleanupChat: mockState.cleanupChat,
}))

vi.mock('@/services/call/callSessionRegistry', () => ({
  CALL_SESSION_REGISTRY_KEY: 'call_sessions',
}))

vi.mock('@/services/groupChat/storage', () => ({
  clearAllGroupChatStorage: mockState.clearAllGroupChatStorage,
}))

vi.mock('@/services/media/exportService', () => ({
  clearMediaExportCache: mockState.clearMediaExportCache,
}))

vi.mock('@/services/media/editedImageCache', () => ({
  clearEditedImageCache: mockState.clearEditedImageCache,
}))

vi.mock('@/services/media/localMediaCache', () => ({
  clearMediaCache: mockState.clearMediaCache,
}))

vi.mock('@/services/media/avatarImageCache', () => ({
  clearEncryptedAvatarCache: mockState.clearEncryptedAvatarCache,
  clearEncryptedAvatarMemoryCache: mockState.clearEncryptedAvatarMemoryCache,
}))

vi.mock('@/services/media/transientRenderCache', () => ({
  clearTransientRenderCache: mockState.clearTransientRenderCache,
}))

vi.mock('@/services/storage/localCacheCrypto', () => ({
  clearLocalCacheKeyMemory: mockState.clearLocalCacheKeyMemory,
}))

vi.mock('@/services/security/receiptPreferences', () => ({
  clearCachedReceiptPreferences: mockState.clearCachedReceiptPreferences,
}))

vi.mock('@/services/storage/asyncStorageAdapter', () => ({
  getAsyncStorageAdapter: () => ({
    clear: mockState.adapterClear,
    clearDecryptedMessageCache: mockState.adapterClearDecryptedMessageCache,
  }),
  setDecryptedMessagePersistenceEnabled: mockState.setDecryptedMessagePersistenceEnabled,
}))

vi.mock('@/services/backend/client', () => ({
  clearProfileCache: mockState.clearProfileCache,
}))

vi.mock('@/services/backend/storage', () => ({
  clearResolvedStorageUrl: mockState.clearResolvedStorageUrl,
}))

vi.mock('@/services/tor/torService', () => ({
  clearTorRuntimeData: mockState.clearTorRuntimeData,
}))

vi.mock('@/services/tor/torStore', () => ({
  useTorStore: {
    getState: () => ({
      reset: mockState.torReset,
    }),
  },
}))

vi.mock('@/services/ui/chatBackgroundStorage', () => ({
  clearCustomChatBackgrounds: mockState.clearCustomChatBackgrounds,
}))

vi.mock('@/services/backend/account', () => ({
  deleteBackendAccount: mockState.deleteBackendAccount,
}))

vi.mock('./installLifecycle', () => ({
  clearInstallSentinel: mockState.clearInstallSentinel,
}))

vi.mock('@/services/notifications/chatNotificationWakeup', () => ({
  clearPendingChatWakeupStorage: mockState.clearPendingChatWakeupStorage,
}))

vi.mock('@/services/crypto/pendingTransactions', () => ({
  clearAllPendingCryptoTransactionStorage: mockState.clearAllPendingCryptoTransactionStorage,
}))

vi.mock('@/services/notifications/pushService', () => ({
  deregisterPushTokensForWallets: mockState.deregisterPushTokensForWallets,
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      logout: mockState.logout,
      clearSession: mockState.clearSession,
      lockForVault: mockState.lockForVault,
      session: mockState.authSession,
    }),
  },
}))

vi.mock('@/store/onboardingStore', () => ({
  useOnboardingStore: {
    getState: () => ({
      clearPendingWallet: mockState.clearPendingWallet,
    }),
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      lockVault: mockState.lockVault,
      wallet: mockState.walletAddresses.length > 0
        ? { address: mockState.walletAddresses[0] }
        : null,
      wallets: mockState.walletAddresses.map((address, index) => ({
        id: `wallet-${index}`,
        address,
      })),
    }),
    setState: mockState.walletSetState,
  },
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: {
    getState: () => ({
      enabled: mockState.spectreEnabled,
    }),
  },
}))

vi.mock('@/store/bluetoothStore', () => ({
  clearPersistedBluetoothConfig: mockState.clearPersistedBluetoothConfig,
  useBluetoothStore: {
    getState: () => ({
      reset: mockState.bluetoothReset,
    }),
  },
}))

vi.mock('@/store', () => ({
  useChatStore: {
    getState: () => ({
      reset: mockState.chatReset,
    }),
  },
  useUIStore: {
    getState: () => ({
      clearToasts: mockState.clearToasts,
    }),
  },
  useGroupChatStore: {
    getState: () => ({
      reset: mockState.groupReset,
    }),
  },
}))

vi.mock('@/lib/constants', () => ({
  SCREENSHOT_PROTECTION_KEY: 'screenshot_protection',
  SECURE_STORE_OPTIONS: { scope: 'default' },
  BIOMETRIC_SECURE_STORE_OPTIONS: { scope: 'biometric' },
  STORAGE_KEYS: {
    VAULT: 'vault',
    HAS_WALLET: 'has_wallet',
    SESSION: 'session',
    SPECTRE_MODE: 'spectre_mode',
    SPECTRE_SNAPSHOT: 'spectre_snapshot',
    SPECTRE_WALLET_ID: 'spectre_wallet_id',
    SPECTRE_ACCOUNT_MODE: 'spectre_account_mode',
    PENDING_SPECTRE_REMOTE_ACTIVATION: 'pending_spectre_remote_activation',
    PENDING_SPECTRE_BLIND_TOKEN: 'pending_spectre_blind_token',
    SPECTRE_ACCESS_STATE: 'spectre_access_state',
    BIOMETRIC_ENABLED: 'biometric_enabled',
  },
  VAULT_SECURITY_KEYS: {
    PIN_HASH: 'pin_hash',
    PIN_SALT: 'pin_salt',
    PIN_KDF_ITERATIONS: 'pin_kdf_iterations',
    DEVICE_SECRET: 'device_secret',
    BIOMETRIC_PIN: 'biometric_pin',
    DURESS_PIN: 'legacy_duress_pin',
    DURESS_PIN_HASH: 'duress_pin_hash',
    DURESS_PIN_SALT: 'duress_pin_salt',
    DURESS_PIN_KDF_ITERATIONS: 'duress_pin_kdf_iterations',
    DURESS_ENABLED: 'duress_enabled',
    FAIL_WIPE_ENABLED: 'fail_wipe_enabled',
    FAIL_WIPE_ATTEMPTS: 'fail_wipe_attempts',
    PIN_ATTEMPTS: 'pin_attempts',
    PIN_LOCKOUT_UNTIL: 'pin_lockout_until',
    AUTO_LOCK: 'auto_lock',
    AUTO_LOCK_TIME: 'auto_lock_time',
    HIDE_CONTENT: 'hide_content',
    DELIVERY_RECEIPTS: 'delivery_receipts',
    READ_RECEIPTS: 'read_receipts',
    CLEAR_IMAGE_CACHE_ON_LOCK: 'clear_image_cache_on_lock',
    MESSAGE_CACHE_PRIVACY_MODE: 'message_cache_privacy_mode',
    LOCAL_MESSAGE_CONTENT_KEY: 'local_message_content_key',
  },
}))

vi.mock('@/services/tor/torConstants', () => ({
  TOR_STORAGE_KEYS: {
    ENABLED: 'tor_enabled',
    BRIDGES: 'tor_bridges',
    BRIDGE_TYPE: 'tor_bridge_type',
  },
}))

import {
  clearStrictPrivacyCaches,
  getMessageCachePrivacyMode,
  initializeCachePrivacySettings,
  lockActiveSession,
  readAutoLockSettings,
  setMessageCachePrivacyMode,
} from './dataProtection'

describe('dataProtection', () => {
  beforeEach(() => {
    mockState.getAllKeys.mockClear()
    mockState.multiRemove.mockClear()
    mockState.getItemAsync.mockReset()
    mockState.getItemAsync.mockResolvedValue(null)
    mockState.setItemAsync.mockClear()
    mockState.deleteItemAsync.mockClear()
    mockState.cleanupChat.mockClear()
    mockState.clearResolvedStorageUrl.mockClear()
    mockState.clearPendingWallet.mockClear()
    mockState.lockVault.mockClear()
    mockState.walletSetState.mockClear()
    mockState.clearSession.mockClear()
    mockState.lockForVault.mockClear()
    mockState.adapterClear.mockClear()
    mockState.adapterClearDecryptedMessageCache.mockClear()
    mockState.setDecryptedMessagePersistenceEnabled.mockClear()
    mockState.clearAllGroupChatStorage.mockClear()
    mockState.clearEditedImageCache.mockClear()
    mockState.clearMediaExportCache.mockClear()
    mockState.clearMediaCache.mockClear()
    mockState.clearEncryptedAvatarCache.mockClear()
    mockState.clearEncryptedAvatarMemoryCache.mockClear()
    mockState.clearTransientRenderCache.mockClear()
    mockState.clearLocalCacheKeyMemory.mockClear()
    mockState.clearImageMemoryCache.mockClear()
    mockState.clearImageDiskCache.mockClear()
    mockState.clearCachedReceiptPreferences.mockClear()
    mockState.clearProfileCache.mockClear()
    mockState.clearCustomChatBackgrounds.mockClear()
    mockState.clearPersistedBluetoothConfig.mockClear()
    mockState.bluetoothReset.mockClear()
    mockState.clearTorRuntimeData.mockClear()
    mockState.torReset.mockClear()
    mockState.deleteBackendAccount.mockClear()
    mockState.deleteBackendAccount.mockResolvedValue({ postgresRowsDeleted: 1, relayRowsDeleted: 1, objectsDeleted: 1 })
    mockState.authSession = null
    mockState.walletAddresses = []
    mockState.logout.mockClear()
    mockState.clearSession.mockClear()
    mockState.clearInstallSentinel.mockClear()
    mockState.clearPendingChatWakeupStorage.mockClear()
    mockState.clearAllPendingCryptoTransactionStorage.mockClear()
    mockState.deregisterPushTokensForWallets.mockClear()
    mockState.spectreEnabled = false
    mockState.chatReset.mockClear()
    mockState.clearToasts.mockClear()
    mockState.groupReset.mockClear()
  })

  it.each([
    ['Immediately', 0],
    ['1 minute', 60_000],
    ['5 minutes', 5 * 60_000],
    ['15 minutes', 15 * 60_000],
    ['1 hour', 60 * 60_000],
    ['unexpected', 5 * 60_000],
    [null, 5 * 60_000],
  ])('reads auto-lock timeout %s as %dms', async (storedTimeout, timeoutMs) => {
    mockState.getItemAsync.mockImplementation(async (key: string) => {
      if (key === 'auto_lock') return 'true'
      if (key === 'auto_lock_time') return storedTimeout
      return null
    })

    await expect(readAutoLockSettings()).resolves.toEqual({
      enabled: true,
      timeoutMs,
    })
  })

  it('caches auto-lock settings for synchronous resume checks', async () => {
    mockState.getItemAsync.mockImplementation(async (key: string) => {
      if (key === 'auto_lock') return 'true'
      if (key === 'auto_lock_time') return '1 minute'
      return null
    })

    await readAutoLockSettings()
    const { peekAutoLockSettings } = await import('./autoLockPreference')
    expect(peekAutoLockSettings()).toEqual({ enabled: true, timeoutMs: 60_000 })
  })

  it('locks the active session without erasing wallet existence', async () => {
    await lockActiveSession()

    expect(mockState.cleanupChat).toHaveBeenCalled()
    expect(mockState.clearResolvedStorageUrl).toHaveBeenCalled()
    expect(mockState.clearPendingWallet).toHaveBeenCalled()
    expect(mockState.lockVault).toHaveBeenCalled()
    expect(mockState.lockForVault).toHaveBeenCalled()
    expect(mockState.clearSession).not.toHaveBeenCalled()
    expect(mockState.logout).not.toHaveBeenCalled()
    expect(mockState.walletSetState).not.toHaveBeenCalled()
    expect(mockState.clearPersistedBluetoothConfig).not.toHaveBeenCalled()
    expect(mockState.clearTorRuntimeData).not.toHaveBeenCalled()
    expect(mockState.clearMediaCache).not.toHaveBeenCalled()
    expect(mockState.clearImageDiskCache).not.toHaveBeenCalled()
    expect(mockState.adapterClearDecryptedMessageCache).toHaveBeenCalled()
    expect(mockState.clearTransientRenderCache).toHaveBeenCalled()
    expect(mockState.clearLocalCacheKeyMemory).toHaveBeenCalled()
  })

  it('locks the vault before tearing down chat', async () => {
    const order: string[] = []
    mockState.lockVault.mockImplementation(() => {
      order.push('vault')
    })
    mockState.lockForVault.mockImplementation(() => {
      order.push('auth')
    })
    mockState.cleanupChat.mockImplementation(() => {
      order.push('chat')
    })

    await lockActiveSession()

    expect(order.slice(0, 3)).toEqual(['vault', 'auth', 'chat'])
  })

  it('clears visual media and decrypted message caches on lock when opted in', async () => {
    mockState.getItemAsync.mockImplementation(async (key: string) => {
      if (key === 'clear_image_cache_on_lock') return 'true'
      if (key === 'message_cache_privacy_mode') return 'clear_on_lock'
      return null
    })

    await lockActiveSession()

    expect(mockState.clearMediaCache).toHaveBeenCalled()
    expect(mockState.clearEditedImageCache).toHaveBeenCalled()
    expect(mockState.clearImageMemoryCache).toHaveBeenCalled()
    expect(mockState.clearImageDiskCache).toHaveBeenCalled()
    expect(mockState.adapterClearDecryptedMessageCache).toHaveBeenCalled()
  })

  it('always clears visual media on lock while Spectre is enabled', async () => {
    mockState.spectreEnabled = true

    await lockActiveSession()

    expect(mockState.clearMediaCache).toHaveBeenCalled()
    expect(mockState.clearEditedImageCache).toHaveBeenCalled()
    expect(mockState.clearImageMemoryCache).toHaveBeenCalled()
    expect(mockState.clearImageDiskCache).toHaveBeenCalled()
  })

  it('applies strict message-cache privacy immediately', async () => {
    await setMessageCachePrivacyMode('strict')

    expect(mockState.setItemAsync).toHaveBeenCalledWith(
      'message_cache_privacy_mode',
      'strict',
      { scope: 'default' },
    )
    expect(mockState.setDecryptedMessagePersistenceEnabled).toHaveBeenCalledWith(false)
    expect(mockState.adapterClearDecryptedMessageCache).toHaveBeenCalledWith({ allScopes: true, force: true })
  })

  it('keeps plaintext message persistence disabled while Spectre is active', async () => {
    mockState.spectreEnabled = true

    await setMessageCachePrivacyMode('standard')

    expect(mockState.setItemAsync).toHaveBeenCalledWith(
      'message_cache_privacy_mode',
      'strict',
      { scope: 'default' },
    )
    expect(mockState.setDecryptedMessagePersistenceEnabled).toHaveBeenCalledWith(false)
    expect(mockState.adapterClearDecryptedMessageCache).toHaveBeenCalledWith({ allScopes: true, force: true })
  })

  it('upgrades invalid message-cache privacy values to strict', async () => {
    mockState.getItemAsync.mockResolvedValue('unknown-mode')

    await expect(getMessageCachePrivacyMode()).resolves.toBe('strict')
  })

  it('initializes strict message-cache policy and clears leftover plaintext caches', async () => {
    mockState.getItemAsync.mockResolvedValue('strict')

    await initializeCachePrivacySettings()

    expect(mockState.setDecryptedMessagePersistenceEnabled).toHaveBeenCalledWith(false)
    expect(mockState.adapterClearDecryptedMessageCache).toHaveBeenCalledWith({ allScopes: true })
  })

  it('treats Spectre runtime as strict regardless of stored cache preference', async () => {
    mockState.spectreEnabled = true
    mockState.getItemAsync.mockResolvedValue('standard')

    await initializeCachePrivacySettings()

    expect(mockState.setDecryptedMessagePersistenceEnabled).toHaveBeenCalledWith(false)
    expect(mockState.adapterClearDecryptedMessageCache).toHaveBeenCalledWith({ allScopes: true })
    expect(mockState.clearEncryptedAvatarCache).toHaveBeenCalled()
  })

  it('clears every cache class covered by strict privacy mode', async () => {
    await clearStrictPrivacyCaches()

    expect(mockState.adapterClearDecryptedMessageCache).toHaveBeenCalledWith({ allScopes: true, force: true })
    expect(mockState.clearMediaCache).toHaveBeenCalled()
    expect(mockState.clearEditedImageCache).toHaveBeenCalled()
    expect(mockState.clearMediaExportCache).toHaveBeenCalled()
    expect(mockState.clearImageMemoryCache).toHaveBeenCalled()
    expect(mockState.clearImageDiskCache).toHaveBeenCalled()
    expect(mockState.clearEncryptedAvatarCache).toHaveBeenCalled()
  })

})
