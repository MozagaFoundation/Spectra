/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => {
  const primaryWallet = {
    id: 'wallet-primary',
    address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    publicKey: 'primary-public-key',
    privateKey: 'primary-private-key',
    displayName: 'Primary',
    createdAt: 1,
  }

  const spectreWallet = {
    id: 'wallet-spectre',
    address: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    publicKey: 'spectre-public-key',
    privateKey: 'spectre-private-key',
    displayName: 'Spectre',
    spectreMode: true,
    createdAt: 2,
  }

  return {
  primaryWallet,
  spectreWallet,
  walletStore: {
    isVaultUnlocked: true,
    wallets: [primaryWallet, spectreWallet],
    activeWalletId: spectreWallet.id,
    wallet: spectreWallet as typeof primaryWallet | typeof spectreWallet | null,
    addWallet: vi.fn(async (wallet: typeof primaryWallet) => wallet),
    removeWallet: vi.fn(async () => {}),
    switchWallet: vi.fn((walletId: string) => {
      mockState.walletStore.activeWalletId = walletId
      mockState.walletStore.wallet = mockState.walletStore.wallets.find((wallet) => wallet.id === walletId) ?? null
    }),
  },
  spectreStore: {
    enabled: true,
    isApplying: false,
    activationFlow: null as 'enable' | 'disable' | null,
    activationPhase: null as string | null,
    activationError: null as string | null,
    activationStartedAt: null as number | null,
    activationFinishedAt: null as number | null,
    spectreWalletId: spectreWallet.id as string | null,
    spectreAccountMode: 'expendable' as 'mnemonic' | 'persistent_generated' | 'expendable' | null,
    startActivation: vi.fn((flow: 'enable' | 'disable', phase: string) => {
      mockState.spectreStore.isApplying = true
      mockState.spectreStore.activationFlow = flow
      mockState.spectreStore.activationPhase = phase
      mockState.spectreStore.activationError = null
      mockState.spectreStore.activationStartedAt = Date.now()
      mockState.spectreStore.activationFinishedAt = null
    }),
    setActivationPhase: vi.fn((phase: string) => {
      mockState.spectreStore.activationPhase = phase
    }),
    completeActivation: vi.fn(() => {
      mockState.spectreStore.isApplying = false
      mockState.spectreStore.activationPhase = 'completed'
      mockState.spectreStore.activationError = null
      mockState.spectreStore.activationFinishedAt = Date.now()
    }),
    failActivation: vi.fn((error: string) => {
      mockState.spectreStore.isApplying = false
      mockState.spectreStore.activationError = error
      mockState.spectreStore.activationFinishedAt = Date.now()
    }),
    resetActivationProgress: vi.fn(() => {
      mockState.spectreStore.isApplying = false
      mockState.spectreStore.activationFlow = null
      mockState.spectreStore.activationPhase = null
      mockState.spectreStore.activationError = null
      mockState.spectreStore.activationStartedAt = null
      mockState.spectreStore.activationFinishedAt = null
    }),
    setEnabled: vi.fn(async (value: boolean) => {
      mockState.spectreStore.enabled = value
    }),
    setSpectreWalletId: vi.fn(async (walletId: string | null) => {
      mockState.spectreStore.spectreWalletId = walletId
    }),
    setSpectreAccountMode: vi.fn(async (mode: 'mnemonic' | 'persistent_generated' | 'expendable' | null) => {
      mockState.spectreStore.spectreAccountMode = mode
    }),
    reset: vi.fn(async () => {
      mockState.spectreStore.enabled = false
      mockState.spectreStore.spectreWalletId = null
      mockState.spectreStore.spectreAccountMode = null
    }),
  },
  torStore: {
    enabled: true,
    status: 'connected',
    errorMessage: null as string | null,
    setEnabled: vi.fn(async (value: boolean) => {
      mockState.torStore.enabled = value
    }),
  },
  readPersistedSpectreSnapshot: vi.fn(async (): Promise<any> => ({
    version: 2 as const,
    capturedAt: 100,
    generation: '100:wallet-primary',
    primaryWalletId: primaryWallet.id,
    primaryWalletAddress: primaryWallet.address,
    torEnabled: false,
    deliveryReceiptsEnabled: true,
    readReceiptsEnabled: true,
    screenshotProtectionEnabled: true,
    appSwitcherPrivacyEnabled: true,
    autoLockEnabled: true,
    autoLockTime: '5 minutes',
    failWipeEnabled: false,
    failWipeAttempts: '10',
    duressProtectionEnabled: false,
    bluetoothEnabled: true,
    bluetoothOverrideEnabled: null as boolean | null,
    clearImageCacheOnLockEnabled: false,
    messageCachePrivacyMode: 'standard' as const,
  })),
  writePersistedSpectreSnapshot: vi.fn(async (_snapshot: unknown) => {}),
  setPersistedSpectreBluetoothOverride: vi.fn(async () => {}),
  clearAsyncStorageScope: vi.fn(async () => {}),
  clearGroupChatStorageScope: vi.fn(async () => {}),
  clearScopedChatPreferences: vi.fn(async () => {}),
  clearAddressBookSnapshot: vi.fn(async () => {}),
  clearMediaCacheScope: vi.fn(async () => {}),
  clearEncryptedAvatarCache: vi.fn(async () => {}),
  setDeliveryReceiptsEnabled: vi.fn(async () => {}),
  setReadReceiptsEnabled: vi.fn(async () => {}),
  setScreenshotProtectionEnabled: vi.fn(async () => {}),
  setAppSwitcherPrivacyEnabled: vi.fn(async () => {}),
  secureSetItemAsync: vi.fn(async () => {}),
  secureDeleteItemAsync: vi.fn(async () => {}),
  invalidateAuthCaches: vi.fn(),
  resetAuthCooldowns: vi.fn(),
  syncBundleServerAccessToken: vi.fn(),
  cleanupChat: vi.fn(),
  waitForChatQuiescence: vi.fn(async () => undefined),
  realignChatForActiveWallet: vi.fn(async () => {}),
  stopTor: vi.fn(async () => {}),
  startTor: vi.fn(async () => true),
  clearPendingSpectreBlindActivationToken: vi.fn(async () => {}),
  getPendingSpectreBlindActivationToken: vi.fn(async () => null),
  isSpectreWalletPendingRemoteActivation: vi.fn(async () => false),
  issueSpectreBlindActivationToken: vi.fn(async () => ({
    algorithm: 'rsa-fdh-v1' as const,
    domain: 'spectra.mobile.account-ticket.v1.spectre_ephemeral',
    keyId: 'test-blind-key',
    purpose: 'spectre_ephemeral' as const,
    walletAddress: spectreWallet.address,
    isEphemeral: true,
    nullifierHex: '11'.repeat(32),
    signatureHex: '22'.repeat(256),
    issuedAt: new Date().toISOString(),
    nextAvailableAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })),
  markSpectreWalletPendingRemoteActivation: vi.fn(async () => {}),
  redeemSpectreBlindActivationToken: vi.fn(async () => ({
    activatedWalletAddress: spectreWallet.address,
    isEphemeral: true,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    access: {
      walletAddress: spectreWallet.address,
      canRequestEphemeralToken: false,
      spectreTokenLastIssuedAt: null,
      spectreTokenAvailableAt: null,
      currentWalletIsSpectre: true,
      currentSpectreIsEphemeral: true,
      currentSpectreExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      refreshedAt: new Date().toISOString(),
    },
  })),
  closeSpectreAddress: vi.fn(async () => ({
    closed: true,
    walletAddress: spectreWallet.address,
    reason: 'closed' as const,
  })),
  bootstrapBackendCloudSession: vi.fn(async () => true),
  getCachedBackendAccessToken: vi.fn(() => 'verified-access-token'),
  clearCloudSession: vi.fn(async () => {}),
  setAuthenticated: vi.fn(),
  loadDuressPinState: vi.fn(async () => ({ enabled: false, hasDuressPin: true })),
  deregisterPushTokens: vi.fn(async () => {}),
  deregisterPushTokensForWallets: vi.fn(async () => {}),
  deactivateNotificationRuntime: vi.fn(async () => {}),
  schedulePrivateTransportPushTokenCleanup: vi.fn(async () => {}),
  suspendActiveWalletPushRegistration: vi.fn(async () => {}),
  clearStrictPrivacyCaches: vi.fn(async () => {}),
  getClearImageCacheOnLockEnabled: vi.fn(async () => false),
  getMessageCachePrivacyMode: vi.fn(async () => 'standard' as const),
  initializeCachePrivacySettings: vi.fn(async () => {}),
  setClearImageCacheOnLockEnabled: vi.fn(async () => {}),
  setMessageCachePrivacyMode: vi.fn(async () => {}),
  clearChatDiagnosticEvents: vi.fn(),
  disableChatDiagnosticRecording: vi.fn(),
  enableChatDiagnosticRecording: vi.fn(),
  clearChatLatencyEvents: vi.fn(),
  disableChatLatencyRecording: vi.fn(),
  enableChatLatencyRecording: vi.fn(),
  clearCallDiagnosticEvents: vi.fn(),
  clearCallLatencyEvents: vi.fn(),
  disableCallDiagnosticRecording: vi.fn(),
  enableCallDiagnosticRecording: vi.fn(),
  clearTorDiagnosticEvents: vi.fn(),
  clearTorLatencyEvents: vi.fn(),
  disableTorDiagnosticRecording: vi.fn(),
  enableTorDiagnosticRecording: vi.fn(),
  bleSetEnabled: vi.fn(async () => {}),
  bleUpdateConfig: vi.fn(),
  validateMnemonic: vi.fn(() => ({ valid: true })),
  importWalletFromMnemonic: vi.fn(async () => primaryWallet),
  deriveSpectreWallet: vi.fn(async () => spectreWallet),
  generateMnemonic: vi.fn(() => 'word '.repeat(23).trim() + ' last'),
}})

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void

  const promise = new Promise<T>((res) => {
    resolve = res
  })

  return { promise, resolve }
}

vi.mock('expo-secure-store', () => ({
  setItemAsync: mockState.secureSetItemAsync,
  deleteItemAsync: mockState.secureDeleteItemAsync,
  getItemAsync: vi.fn(async () => null),
}))

vi.mock('@/services/bluetooth', () => ({
  updateConfig: mockState.bleUpdateConfig,
}))

vi.mock('@/lib/constants', () => ({
  SECURE_STORE_OPTIONS: {},
  SPECTRE_AUTO_LOCK_TIME: 'Immediately',
  SPECTRE_FAIL_WIPE_ATTEMPTS: 5,
  VAULT_SECURITY_KEYS: {
    AUTO_LOCK: 'auto_lock',
    AUTO_LOCK_TIME: 'auto_lock_time',
    FAIL_WIPE_ENABLED: 'fail_wipe_enabled',
    FAIL_WIPE_ATTEMPTS: 'fail_wipe_attempts',
  },
}))

vi.mock('@/services/groupChat/storage', () => ({
  clearGroupChatStorageScope: mockState.clearGroupChatStorageScope,
}))

vi.mock('@/services/backend/session', () => ({
  bootstrapBackendCloudSession: mockState.bootstrapBackendCloudSession,
  getCachedBackendAccessToken: mockState.getCachedBackendAccessToken,
  invalidateAuthCaches: mockState.invalidateAuthCaches,
  resetAuthCooldowns: mockState.resetAuthCooldowns,
}))

vi.mock('@/services/backend/spectreAccess', () => ({
  clearPendingSpectreBlindActivationToken: mockState.clearPendingSpectreBlindActivationToken,
  closeSpectreAddress: mockState.closeSpectreAddress,
  getPendingSpectreBlindActivationToken: mockState.getPendingSpectreBlindActivationToken,
  isSpectreWalletPendingRemoteActivation: mockState.isSpectreWalletPendingRemoteActivation,
  issueSpectreBlindActivationToken: mockState.issueSpectreBlindActivationToken,
  markSpectreWalletPendingRemoteActivation: mockState.markSpectreWalletPendingRemoteActivation,
  redeemSpectreBlindActivationToken: mockState.redeemSpectreBlindActivationToken,
}))

vi.mock('@/services/quantumChat', () => ({
  syncBundleServerAccessToken: mockState.syncBundleServerAccessToken,
}))

vi.mock('@/services/storage', () => ({
  clearAsyncStorageScope: mockState.clearAsyncStorageScope,
}))

vi.mock('@/services/storage/addressBookStorage', () => ({
  clearAddressBookSnapshot: mockState.clearAddressBookSnapshot,
}))

vi.mock('@/services/media/localMediaCache', () => ({
  clearMediaCacheScope: mockState.clearMediaCacheScope,
}))

vi.mock('@/services/media/avatarImageCache', () => ({
  clearEncryptedAvatarCache: mockState.clearEncryptedAvatarCache,
}))

vi.mock('@/services/tor', () => ({
  startTor: mockState.startTor,
  stopTor: mockState.stopTor,
  useTorStore: {
    getState: () => mockState.torStore,
  },
}))

vi.mock('@spectra/identity-vault', () => ({
  deriveSpectreWallet: mockState.deriveSpectreWallet,
  generateMnemonic: mockState.generateMnemonic,
  importWalletFromMnemonic: mockState.importWalletFromMnemonic,
  MnemonicValidationError: class MnemonicValidationError extends Error {
    readonly code: string
    readonly params: Record<string, string> | undefined

    constructor(code: string, params?: Record<string, string>) {
      super(code)
      this.code = code
      this.params = params
    }
  },
  validateMnemonic: mockState.validateMnemonic,
}))

vi.mock('@/services/chat/chatDiagnostics', () => ({
  clearChatDiagnosticEvents: mockState.clearChatDiagnosticEvents,
  disableChatDiagnosticRecording: mockState.disableChatDiagnosticRecording,
  enableChatDiagnosticRecording: mockState.enableChatDiagnosticRecording,
}))

vi.mock('@/services/chat/chatLatency', () => ({
  clearChatLatencyEvents: mockState.clearChatLatencyEvents,
  disableChatLatencyRecording: mockState.disableChatLatencyRecording,
  enableChatLatencyRecording: mockState.enableChatLatencyRecording,
}))

vi.mock('@/services/chat/chatService', () => ({
  cleanupChat: mockState.cleanupChat,
  realignChatForActiveWallet: mockState.realignChatForActiveWallet,
  waitForChatQuiescence: mockState.waitForChatQuiescence,
}))

vi.mock('@/services/call/callDiagnostics', () => ({
  clearCallDiagnosticEvents: mockState.clearCallDiagnosticEvents,
  clearCallLatencyEvents: mockState.clearCallLatencyEvents,
  disableCallDiagnosticRecording: mockState.disableCallDiagnosticRecording,
  enableCallDiagnosticRecording: mockState.enableCallDiagnosticRecording,
}))

vi.mock('@/services/tor/torDiagnostics', () => ({
  clearTorDiagnosticEvents: mockState.clearTorDiagnosticEvents,
  clearTorLatencyEvents: mockState.clearTorLatencyEvents,
  disableTorDiagnosticRecording: mockState.disableTorDiagnosticRecording,
  enableTorDiagnosticRecording: mockState.enableTorDiagnosticRecording,
}))

vi.mock('./appSwitcherPrivacy', () => ({
  getAppSwitcherPrivacyEnabled: vi.fn(async () => true),
  setAppSwitcherPrivacyEnabled: mockState.setAppSwitcherPrivacyEnabled,
}))

vi.mock('./receiptPreferences', () => ({
  getReceiptPreferences: vi.fn(async () => ({
    deliveryReceiptsEnabled: true,
    readReceiptsEnabled: true,
  })),
  setDeliveryReceiptsEnabled: mockState.setDeliveryReceiptsEnabled,
  setReadReceiptsEnabled: mockState.setReadReceiptsEnabled,
}))

vi.mock('./duressPin', () => ({
  loadDuressPinState: mockState.loadDuressPinState,
  setDuressProtectionEnabled: vi.fn(async () => {}),
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({
      clearCloudSession: mockState.clearCloudSession,
      setAuthenticated: mockState.setAuthenticated,
    }),
  },
}))

vi.mock('@/store/bluetoothStore', () => ({
  useBluetoothStore: {
    getState: () => ({
      config: {
        enabled: true,
      },
      setEnabled: mockState.bleSetEnabled,
    }),
  },
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: {
    getState: () => mockState.spectreStore,
  },
  readPersistedSpectreSnapshot: mockState.readPersistedSpectreSnapshot,
  setPersistedSpectreBluetoothOverride: mockState.setPersistedSpectreBluetoothOverride,
  writePersistedSpectreSnapshot: mockState.writePersistedSpectreSnapshot,
}))

vi.mock('@/store/chatStore', () => ({
  clearScopedChatPreferences: mockState.clearScopedChatPreferences,
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => mockState.walletStore,
  },
}))

vi.mock('./screenshotProtection', () => ({
  getScreenshotProtectionEnabled: vi.fn(async () => true),
  setScreenshotProtectionEnabled: mockState.setScreenshotProtectionEnabled,
}))

vi.mock('@/services/notifications/pushService', () => ({
  deregisterPushTokens: mockState.deregisterPushTokens,
  deregisterPushTokensForWallets: mockState.deregisterPushTokensForWallets,
  deactivateNotificationRuntime: mockState.deactivateNotificationRuntime,
  schedulePrivateTransportPushTokenCleanup: mockState.schedulePrivateTransportPushTokenCleanup,
}))

vi.mock('@/services/notifications/registrationCoordinator', () => ({
  suspendActiveWalletPushRegistration: mockState.suspendActiveWalletPushRegistration,
}))

vi.mock('./dataProtection', () => ({
  clearStrictPrivacyCaches: mockState.clearStrictPrivacyCaches,
  getClearImageCacheOnLockEnabled: mockState.getClearImageCacheOnLockEnabled,
  getMessageCachePrivacyMode: mockState.getMessageCachePrivacyMode,
  initializeCachePrivacySettings: mockState.initializeCachePrivacySettings,
  setClearImageCacheOnLockEnabled: mockState.setClearImageCacheOnLockEnabled,
  setMessageCachePrivacyMode: mockState.setMessageCachePrivacyMode,
}))

describe('spectreMode', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockState.walletStore.isVaultUnlocked = true
    mockState.walletStore.wallets = [mockState.primaryWallet, mockState.spectreWallet]
    mockState.walletStore.activeWalletId = mockState.spectreWallet.id
    mockState.walletStore.wallet = mockState.spectreWallet
    mockState.walletStore.addWallet.mockClear()
    mockState.walletStore.addWallet.mockImplementation(async (wallet) => wallet)
    mockState.walletStore.removeWallet.mockClear()
    mockState.walletStore.switchWallet.mockClear()
    mockState.spectreStore.enabled = true
    mockState.spectreStore.activationFlow = null
    mockState.spectreStore.activationPhase = null
    mockState.spectreStore.activationError = null
    mockState.spectreStore.activationStartedAt = null
    mockState.spectreStore.activationFinishedAt = null
    mockState.spectreStore.spectreWalletId = mockState.spectreWallet.id
    mockState.spectreStore.spectreAccountMode = 'expendable'
    mockState.spectreStore.startActivation.mockClear()
    mockState.spectreStore.setActivationPhase.mockClear()
    mockState.spectreStore.completeActivation.mockClear()
    mockState.spectreStore.failActivation.mockClear()
    mockState.spectreStore.resetActivationProgress.mockClear()
    mockState.spectreStore.setEnabled.mockClear()
    mockState.spectreStore.setSpectreWalletId.mockClear()
    mockState.spectreStore.setSpectreAccountMode.mockClear()
    mockState.spectreStore.reset.mockClear()
    mockState.torStore.enabled = true
    mockState.torStore.status = 'connected'
    mockState.torStore.setEnabled.mockClear()
    mockState.readPersistedSpectreSnapshot.mockClear()
    mockState.writePersistedSpectreSnapshot.mockClear()
    mockState.setPersistedSpectreBluetoothOverride.mockClear()
    mockState.clearAsyncStorageScope.mockClear()
    mockState.clearGroupChatStorageScope.mockClear()
    mockState.clearScopedChatPreferences.mockClear()
    mockState.clearAddressBookSnapshot.mockClear()
    mockState.clearMediaCacheScope.mockClear()
    mockState.clearEncryptedAvatarCache.mockClear()
    mockState.setDeliveryReceiptsEnabled.mockClear()
    mockState.setReadReceiptsEnabled.mockClear()
    mockState.setScreenshotProtectionEnabled.mockClear()
    mockState.setAppSwitcherPrivacyEnabled.mockClear()
    mockState.secureSetItemAsync.mockClear()
    mockState.invalidateAuthCaches.mockClear()
    mockState.resetAuthCooldowns.mockClear()
    mockState.syncBundleServerAccessToken.mockClear()
    mockState.cleanupChat.mockClear()
    mockState.waitForChatQuiescence.mockClear()
    mockState.realignChatForActiveWallet.mockClear()
    mockState.stopTor.mockClear()
    mockState.startTor.mockClear()
    mockState.clearPendingSpectreBlindActivationToken.mockClear()
    mockState.closeSpectreAddress.mockClear()
    mockState.getPendingSpectreBlindActivationToken.mockClear()
    mockState.isSpectreWalletPendingRemoteActivation.mockClear()
    mockState.issueSpectreBlindActivationToken.mockClear()
    mockState.issueSpectreBlindActivationToken.mockImplementation(async () => ({
      algorithm: 'rsa-fdh-v1' as const,
      domain: 'spectra.mobile.account-ticket.v1.spectre_ephemeral',
      keyId: 'test-blind-key',
      purpose: 'spectre_ephemeral' as const,
      walletAddress: mockState.spectreWallet.address,
      isEphemeral: true,
      nullifierHex: '11'.repeat(32),
      signatureHex: '22'.repeat(256),
      issuedAt: new Date().toISOString(),
      nextAvailableAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }))
    mockState.markSpectreWalletPendingRemoteActivation.mockClear()
    mockState.redeemSpectreBlindActivationToken.mockClear()
    mockState.redeemSpectreBlindActivationToken.mockImplementation(async () => ({
      activatedWalletAddress: mockState.spectreWallet.address,
      isEphemeral: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      access: {
        walletAddress: mockState.spectreWallet.address,
        canRequestEphemeralToken: false,
        spectreTokenLastIssuedAt: null,
        spectreTokenAvailableAt: null,
        currentWalletIsSpectre: true,
        currentSpectreIsEphemeral: true,
        currentSpectreExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        refreshedAt: new Date().toISOString(),
      },
    }))
    mockState.bootstrapBackendCloudSession.mockClear()
    mockState.bootstrapBackendCloudSession.mockResolvedValue(true)
    mockState.getCachedBackendAccessToken.mockClear()
    mockState.getCachedBackendAccessToken.mockReturnValue('verified-access-token')
    mockState.clearCloudSession.mockClear()
    mockState.setAuthenticated.mockClear()
    mockState.loadDuressPinState.mockClear()
    mockState.deregisterPushTokens.mockClear()
    mockState.deregisterPushTokensForWallets.mockClear()
    mockState.deactivateNotificationRuntime.mockClear()
    mockState.schedulePrivateTransportPushTokenCleanup.mockClear()
    mockState.suspendActiveWalletPushRegistration.mockClear()
    mockState.clearStrictPrivacyCaches.mockClear()
    mockState.getClearImageCacheOnLockEnabled.mockClear()
    mockState.getMessageCachePrivacyMode.mockClear()
    mockState.initializeCachePrivacySettings.mockClear()
    mockState.setClearImageCacheOnLockEnabled.mockClear()
    mockState.setMessageCachePrivacyMode.mockClear()
    mockState.validateMnemonic.mockClear()
    mockState.importWalletFromMnemonic.mockClear()
    mockState.deriveSpectreWallet.mockClear()
    mockState.deriveSpectreWallet.mockResolvedValue(mockState.spectreWallet)
    mockState.generateMnemonic.mockClear()
    mockState.generateMnemonic.mockReturnValue('word '.repeat(23).trim() + ' last')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registers a prepared Spectre wallet and persists its mode', async () => {
    const preparedWallet = {
      id: 'wallet-generated',
      address: 'exo00cccccccccccccccccccccccccccccccccccccc',
      publicKey: 'generated-public-key',
      privateKey: 'generated-private-key',
      displayName: 'Spectre Generated',
      spectreMode: true,
      createdAt: 3,
    }
    mockState.walletStore.wallets = [mockState.primaryWallet]
    mockState.walletStore.addWallet.mockResolvedValue(preparedWallet)

    const { registerPreparedSpectreWallet } = await import('./spectreMode')
    await expect(
      registerPreparedSpectreWallet(preparedWallet, 'persistent_generated'),
    ).resolves.toEqual(preparedWallet)

    expect(mockState.walletStore.addWallet).toHaveBeenCalledWith(preparedWallet)
    expect(mockState.spectreStore.setSpectreWalletId).toHaveBeenCalledWith('wallet-generated')
    expect(mockState.spectreStore.setSpectreAccountMode).toHaveBeenCalledWith('persistent_generated')
    expect(mockState.markSpectreWalletPendingRemoteActivation).not.toHaveBeenCalled()
  })

  it('allows an expendable Spectre wallet alongside an existing persistent Spectre wallet', async () => {
    const expendableWallet = {
      id: 'wallet-expendable',
      address: 'exo00dddddddddddddddddddddddddddddddddddddd',
      publicKey: 'expendable-public-key',
      privateKey: 'expendable-private-key',
      displayName: 'Spectre Expendable',
      spectreMode: true,
      createdAt: 4,
    }
    mockState.spectreStore.spectreAccountMode = 'persistent_generated'
    mockState.walletStore.wallets = [mockState.primaryWallet, mockState.spectreWallet]
    mockState.walletStore.addWallet.mockResolvedValue(expendableWallet)

    const { createExpendableSpectreWallet, registerPreparedSpectreWallet } = await import('./spectreMode')
    mockState.deriveSpectreWallet.mockResolvedValueOnce(expendableWallet)

    await expect(createExpendableSpectreWallet()).resolves.toEqual({
      wallet: expendableWallet,
      mnemonic: 'word '.repeat(23).trim() + ' last',
    })
    await expect(
      registerPreparedSpectreWallet(expendableWallet, 'expendable'),
    ).resolves.toEqual(expendableWallet)

    expect(mockState.walletStore.addWallet).toHaveBeenCalledWith(expendableWallet)
    expect(mockState.spectreStore.setSpectreWalletId).toHaveBeenCalledWith('wallet-expendable')
    expect(mockState.spectreStore.setSpectreAccountMode).toHaveBeenCalledWith('expendable')
    expect(mockState.markSpectreWalletPendingRemoteActivation).toHaveBeenCalledWith(expendableWallet.address)
  })

  it('rejects expendable setup when the prepared wallet is the root wallet', async () => {
    const rootAsSpectreWallet = {
      ...mockState.primaryWallet,
      spectreMode: true,
    }
    mockState.walletStore.wallets = [mockState.primaryWallet]
    mockState.deriveSpectreWallet.mockResolvedValueOnce(rootAsSpectreWallet)

    const { createExpendableSpectreWallet } = await import('./spectreMode')

    await expect(createExpendableSpectreWallet())
      .rejects.toThrow('A root wallet cannot also be used as a Spectre account')
  })

  it('rejects expendable registration if wallet insertion resolves to the root wallet', async () => {
    const expendableWallet = {
      id: 'wallet-expendable',
      address: 'exo00dddddddddddddddddddddddddddddddddddddd',
      publicKey: 'expendable-public-key',
      privateKey: 'expendable-private-key',
      displayName: 'Spectre Expendable',
      spectreMode: true,
      createdAt: 4,
    }
    mockState.walletStore.wallets = [mockState.primaryWallet]
    mockState.walletStore.addWallet.mockResolvedValueOnce(mockState.primaryWallet)

    const { registerPreparedSpectreWallet } = await import('./spectreMode')

    await expect(registerPreparedSpectreWallet(expendableWallet, 'expendable'))
      .rejects.toThrow('A root wallet cannot also be used as a Spectre account')
    expect(mockState.spectreStore.setSpectreWalletId).not.toHaveBeenCalled()
  })

  it('clears stale root-wallet expendable activation before issuing a fresh token', async () => {
    mockState.walletStore.activeWalletId = mockState.primaryWallet.id
    mockState.walletStore.wallet = mockState.primaryWallet

    const { preIssueExpendableSpectreActivationToken } = await import('./spectreMode')
    await preIssueExpendableSpectreActivationToken(mockState.spectreWallet)

    expect(mockState.clearPendingSpectreBlindActivationToken).toHaveBeenCalledWith({
      walletAddress: mockState.primaryWallet.address,
      isEphemeral: true,
    })
    expect(mockState.issueSpectreBlindActivationToken).toHaveBeenCalledWith(
      mockState.spectreWallet.address,
      {
        bootstrapIfNeeded: true,
        rootWalletAddress: mockState.primaryWallet.address,
      },
    )
  })

  it('clears stale expendable activation tokens for all root wallets', async () => {
    const secondaryRootWallet = {
      id: 'wallet-secondary-root',
      address: 'exo00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      publicKey: 'secondary-public-key',
      privateKey: 'secondary-private-key',
      displayName: 'Secondary',
      createdAt: 5,
    }
    mockState.walletStore.wallets = [
      mockState.primaryWallet,
      secondaryRootWallet,
      mockState.spectreWallet,
    ]

    const { preIssueExpendableSpectreActivationToken } = await import('./spectreMode')
    await preIssueExpendableSpectreActivationToken(mockState.spectreWallet)

    expect(mockState.clearPendingSpectreBlindActivationToken).toHaveBeenCalledWith({
      walletAddress: mockState.primaryWallet.address,
      isEphemeral: true,
    })
    expect(mockState.clearPendingSpectreBlindActivationToken).toHaveBeenCalledWith({
      walletAddress: secondaryRootWallet.address,
      isEphemeral: true,
    })
    expect(mockState.clearPendingSpectreBlindActivationToken).toHaveBeenCalledTimes(2)
  })

  it('starts local privacy hardening before Tor finishes connecting', async () => {
    mockState.spectreStore.enabled = false
    mockState.torStore.enabled = false
    mockState.torStore.status = 'disconnected'
    mockState.isSpectreWalletPendingRemoteActivation.mockResolvedValueOnce(true)
    mockState.getPendingSpectreBlindActivationToken.mockResolvedValueOnce({
      algorithm: 'rsa-fdh-v1',
      domain: 'spectra.mobile.account-ticket.v1.spectre_ephemeral',
      keyId: 'spectre-ephemeral-test',
      purpose: 'spectre_ephemeral',
      walletAddress: mockState.spectreWallet.address,
      isEphemeral: true,
      nullifierHex: 'ab'.repeat(32),
      signatureHex: 'cd'.repeat(256),
      issuedAt: new Date().toISOString(),
      nextAvailableAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    } as never)
    const startTorDeferred = createDeferred<boolean>()
    mockState.startTor.mockImplementation(() => startTorDeferred.promise)

    const { enableSpectreMode } = await import('./spectreMode')
    const enablePromise = enableSpectreMode()

    await vi.waitFor(() => {
      expect(mockState.startTor).toHaveBeenCalledTimes(1)
    })

    expect(mockState.setDeliveryReceiptsEnabled).toHaveBeenCalledWith(false)
    expect(mockState.setReadReceiptsEnabled).toHaveBeenCalledWith(false)
    expect(mockState.setScreenshotProtectionEnabled).toHaveBeenCalledWith(true)
    expect(mockState.setAppSwitcherPrivacyEnabled).toHaveBeenCalledWith(true)
    expect(mockState.setMessageCachePrivacyMode).toHaveBeenCalledWith('strict')
    expect(mockState.clearStrictPrivacyCaches).toHaveBeenCalled()
    expect(mockState.issueSpectreBlindActivationToken).not.toHaveBeenCalled()
    expect(mockState.walletStore.switchWallet).not.toHaveBeenCalledWith(mockState.spectreWallet.id)

    startTorDeferred.resolve(true)
    await enablePromise

    expect(mockState.issueSpectreBlindActivationToken).not.toHaveBeenCalled()
    expect(mockState.redeemSpectreBlindActivationToken).toHaveBeenCalledWith(
      expect.objectContaining({ walletAddress: mockState.spectreWallet.address }),
      expect.objectContaining({
        bootstrapIfNeeded: false,
      }),
    )
    expect(mockState.startTor.mock.invocationCallOrder[0]).toBeLessThan(
      mockState.walletStore.switchWallet.mock.invocationCallOrder[0],
    )
    expect(mockState.walletStore.switchWallet.mock.invocationCallOrder[0]).toBeLessThan(
      mockState.bootstrapBackendCloudSession.mock.invocationCallOrder[0],
    )
    expect(mockState.bootstrapBackendCloudSession.mock.invocationCallOrder[0]).toBeLessThan(
      mockState.redeemSpectreBlindActivationToken.mock.invocationCallOrder[0],
    )
    expect(mockState.realignChatForActiveWallet).toHaveBeenCalled()
  })

  it('does not redeem an expendable token until the Spectre wallet has backend access', async () => {
    mockState.spectreStore.enabled = false
    mockState.isSpectreWalletPendingRemoteActivation.mockResolvedValueOnce(true)
    mockState.getPendingSpectreBlindActivationToken.mockResolvedValueOnce({
      algorithm: 'rsa-fdh-v1',
      domain: 'spectra.mobile.account-ticket.v1.spectre_ephemeral',
      keyId: 'spectre-ephemeral-test',
      purpose: 'spectre_ephemeral',
      walletAddress: mockState.spectreWallet.address,
      isEphemeral: true,
      nullifierHex: 'ab'.repeat(32),
      signatureHex: 'cd'.repeat(256),
      issuedAt: new Date().toISOString(),
      nextAvailableAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    } as never)
    mockState.bootstrapBackendCloudSession.mockResolvedValueOnce(false)

    const { enableSpectreMode } = await import('./spectreMode')

    await expect(enableSpectreMode())
      .rejects.toThrow('Verify the expendable Spectre account before activation')
    expect(mockState.redeemSpectreBlindActivationToken).not.toHaveBeenCalled()
    expect(mockState.clearPendingSpectreBlindActivationToken).toHaveBeenCalledWith({
      walletAddress: mockState.spectreWallet.address,
      purpose: 'spectre_ephemeral',
      isEphemeral: true,
    })
  })

  it('removes a failed expendable wallet so retry uses a fresh address', async () => {
    mockState.spectreStore.enabled = false
    mockState.isSpectreWalletPendingRemoteActivation.mockResolvedValueOnce(true)
    mockState.getPendingSpectreBlindActivationToken.mockResolvedValueOnce({
      algorithm: 'rsa-fdh-v1',
      domain: 'spectra.mobile.account-ticket.v1.spectre_ephemeral',
      keyId: 'spectre-ephemeral-test',
      purpose: 'spectre_ephemeral',
      walletAddress: mockState.spectreWallet.address,
      isEphemeral: true,
      nullifierHex: 'ab'.repeat(32),
      signatureHex: 'cd'.repeat(256),
      issuedAt: new Date().toISOString(),
      nextAvailableAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    } as never)
    mockState.redeemSpectreBlindActivationToken.mockRejectedValueOnce(
      new Error('A root wallet cannot also be used as a Spectre account'),
    )

    const { enableSpectreMode } = await import('./spectreMode')

    await expect(enableSpectreMode())
      .rejects.toThrow('A root wallet cannot also be used as a Spectre account')
    expect(mockState.walletStore.switchWallet).toHaveBeenCalledWith(mockState.primaryWallet.id)
    expect(mockState.clearAsyncStorageScope).toHaveBeenCalledWith(mockState.spectreWallet.address)
    expect(mockState.clearGroupChatStorageScope).toHaveBeenCalledWith(mockState.spectreWallet.address)
    expect(mockState.clearScopedChatPreferences).toHaveBeenCalledWith(mockState.spectreWallet.address)
    expect(mockState.clearAddressBookSnapshot).toHaveBeenCalledWith(mockState.spectreWallet.address)
    expect(mockState.clearMediaCacheScope).toHaveBeenCalledWith(mockState.spectreWallet.address)
    expect(mockState.clearEncryptedAvatarCache).toHaveBeenCalled()
    expect(mockState.walletStore.removeWallet).toHaveBeenCalledWith(mockState.spectreWallet.id, {
      fallbackWalletId: mockState.primaryWallet.id,
    })
    expect(mockState.spectreStore.setSpectreWalletId).toHaveBeenCalledWith(null)
    expect(mockState.spectreStore.setSpectreAccountMode).toHaveBeenCalledWith(null)
  })

  it('requires previous-persona push cleanup before completing Spectre activation', async () => {
    mockState.spectreStore.enabled = false
    const secondaryPrimaryWallet = {
      ...mockState.primaryWallet,
      id: 'wallet-primary-secondary',
      address: 'exo00cccccccccccccccccccccccccccccccccccccc',
    }
    mockState.walletStore.wallets = [
      mockState.primaryWallet,
      secondaryPrimaryWallet,
      mockState.spectreWallet,
    ]
    const pushCleanupDeferred = createDeferred<void>()
    mockState.schedulePrivateTransportPushTokenCleanup.mockImplementationOnce(
      () => pushCleanupDeferred.promise,
    )

    const { enableSpectreMode } = await import('./spectreMode')

    let completed = false
    const enablePromise = enableSpectreMode().then(() => {
      completed = true
    })

    await vi.waitFor(() => {
      expect(mockState.schedulePrivateTransportPushTokenCleanup).toHaveBeenCalled()
    })

    expect(completed).toBe(false)
    expect(mockState.spectreStore.setEnabled).not.toHaveBeenCalledWith(true)
    expect(mockState.suspendActiveWalletPushRegistration).toHaveBeenCalledTimes(1)
    expect(mockState.schedulePrivateTransportPushTokenCleanup).toHaveBeenCalledWith(
      [
        mockState.primaryWallet.address,
        secondaryPrimaryWallet.address,
      ],
      { accessToken: 'verified-access-token' },
    )

    pushCleanupDeferred.resolve()
    await enablePromise

    expect(completed).toBe(true)
    expect(mockState.deactivateNotificationRuntime).toHaveBeenCalledTimes(1)
  })

  it('fails closed when previous-persona push cleanup cannot be confirmed', async () => {
    mockState.spectreStore.enabled = false
    mockState.spectreStore.spectreAccountMode = 'mnemonic'
    mockState.walletStore.wallet = mockState.primaryWallet
    mockState.walletStore.activeWalletId = mockState.primaryWallet.id
    mockState.schedulePrivateTransportPushTokenCleanup.mockRejectedValueOnce(
      new Error('push cleanup unavailable'),
    )

    const { enableSpectreMode } = await import('./spectreMode')

    await expect(enableSpectreMode()).rejects.toThrow('push cleanup unavailable')

    expect(mockState.walletStore.switchWallet).not.toHaveBeenCalledWith(mockState.spectreWallet.id)
    expect(mockState.spectreStore.setEnabled).toHaveBeenCalledWith(true)
  })

  it('reuses an activation that already started from the UI', async () => {
    mockState.spectreStore.enabled = false
    mockState.torStore.enabled = false
    mockState.torStore.status = 'disconnected'
    mockState.spectreStore.isApplying = true
    mockState.spectreStore.activationFlow = 'enable'
    mockState.spectreStore.activationPhase = 'prepare_account'

    const { enableSpectreMode } = await import('./spectreMode')
    await enableSpectreMode()

    expect(mockState.spectreStore.startActivation).not.toHaveBeenCalled()
    expect(mockState.spectreStore.setActivationPhase).toHaveBeenCalledWith('capture_snapshot')
  })

  it('lets the active enable transition perform cancellation rollback exactly once', async () => {
    mockState.spectreStore.enabled = false
    mockState.spectreStore.spectreAccountMode = 'mnemonic'
    mockState.torStore.enabled = false
    mockState.torStore.status = 'disconnected'
    const startTorDeferred = createDeferred<boolean>()
    mockState.startTor.mockImplementationOnce(() => startTorDeferred.promise)

    const {
      cancelSpectreActivation,
      enableSpectreMode,
    } = await import('./spectreMode')
    const enablePromise = enableSpectreMode()
    await vi.waitFor(() => {
      expect(mockState.startTor).toHaveBeenCalled()
    })

    let cancellationCompleted = false
    const cancelPromise = cancelSpectreActivation().then(() => {
      cancellationCompleted = true
    })
    await Promise.resolve()
    expect(cancellationCompleted).toBe(false)

    startTorDeferred.resolve(true)
    await expect(enablePromise).rejects.toThrow('Spectre Mode activation was canceled')
    await cancelPromise

    expect(mockState.writePersistedSpectreSnapshot.mock.calls.filter(
      ([snapshot]) => snapshot === null,
    )).toHaveLength(1)
    expect(mockState.walletStore.switchWallet).toHaveBeenCalledWith(mockState.primaryWallet.id)
  })

  it('does not replace an active Spectre recovery snapshot on repeated enable', async () => {
    mockState.spectreStore.enabled = true

    const { enableSpectreMode } = await import('./spectreMode')
    await enableSpectreMode()

    expect(mockState.writePersistedSpectreSnapshot).not.toHaveBeenCalled()
    expect(mockState.walletStore.switchWallet).not.toHaveBeenCalled()
  })

  it('cleans up expendable Spectre data when disabling the mode', async () => {
    const { disableSpectreMode } = await import('./spectreMode')

    await disableSpectreMode()

    expect(mockState.walletStore.switchWallet).toHaveBeenCalledWith(mockState.primaryWallet.id)
    expect(mockState.clearAsyncStorageScope).toHaveBeenCalledWith(mockState.spectreWallet.address)
    expect(mockState.clearGroupChatStorageScope).toHaveBeenCalledWith(mockState.spectreWallet.address)
    expect(mockState.clearScopedChatPreferences).toHaveBeenCalledWith(mockState.spectreWallet.address)
    expect(mockState.clearAddressBookSnapshot).toHaveBeenCalledWith(mockState.spectreWallet.address)
    expect(mockState.walletStore.removeWallet).toHaveBeenCalledWith(mockState.spectreWallet.id, {
      fallbackWalletId: mockState.primaryWallet.id,
    })
    expect(mockState.closeSpectreAddress).toHaveBeenCalledWith({
      bootstrapIfNeeded: true,
    })
    expect(mockState.spectreStore.setEnabled).toHaveBeenCalledWith(false)
    expect(mockState.writePersistedSpectreSnapshot).toHaveBeenCalledWith(null)
    expect(mockState.spectreStore.setSpectreWalletId).toHaveBeenCalledWith(null)
    expect(mockState.spectreStore.setSpectreAccountMode).toHaveBeenCalledWith(null)
    expect(mockState.realignChatForActiveWallet).toHaveBeenCalled()
  })

  it('retains the snapshot and reapplies hardened defaults when restore fails', async () => {
    mockState.setReadReceiptsEnabled.mockRejectedValueOnce(new Error('secure store unavailable'))

    const { disableSpectreMode } = await import('./spectreMode')

    await expect(disableSpectreMode()).rejects.toThrow('secure store unavailable')
    expect(mockState.writePersistedSpectreSnapshot).not.toHaveBeenCalledWith(null)
    expect(mockState.spectreStore.setEnabled).toHaveBeenCalledWith(false)
    expect(mockState.spectreStore.setEnabled).toHaveBeenCalledWith(true)
    expect(mockState.setMessageCachePrivacyMode).toHaveBeenCalledWith('strict')
  })

  it('rejects a Bluetooth override queued after Spectre shutdown starts', async () => {
    const snapshot = await mockState.readPersistedSpectreSnapshot()
    mockState.readPersistedSpectreSnapshot.mockClear()
    const snapshotDeferred = createDeferred<typeof snapshot>()
    mockState.readPersistedSpectreSnapshot.mockImplementationOnce(() => snapshotDeferred.promise)

    const {
      disableSpectreMode,
      setSpectreBluetoothExitOverride,
    } = await import('./spectreMode')
    const disablePromise = disableSpectreMode()
    await vi.waitFor(() => {
      expect(mockState.readPersistedSpectreSnapshot).toHaveBeenCalled()
    })
    const overridePromise = setSpectreBluetoothExitOverride(true)
    const overrideExpectation = expect(overridePromise).rejects.toThrow(
      'Spectre Mode settings are transitioning',
    )

    snapshotDeferred.resolve(snapshot)
    await disablePromise
    await overrideExpectation
    expect(mockState.setPersistedSpectreBluetoothOverride).not.toHaveBeenCalled()
  })

  it('never falls back to an unrelated primary wallet during restore', async () => {
    const snapshot = await mockState.readPersistedSpectreSnapshot()
    mockState.readPersistedSpectreSnapshot.mockClear()
    mockState.readPersistedSpectreSnapshot.mockResolvedValueOnce({
      ...snapshot,
      primaryWalletId: 'missing-wallet',
      primaryWalletAddress: 'EXOMISSING',
    })

    const { disableSpectreMode } = await import('./spectreMode')

    await expect(disableSpectreMode()).rejects.toThrow(
      'The primary wallet saved before Spectre Mode is unavailable',
    )
    expect(mockState.walletStore.switchWallet).not.toHaveBeenCalledWith(mockState.primaryWallet.id)
    expect(mockState.writePersistedSpectreSnapshot).not.toHaveBeenCalledWith(null)
  })

  it('finishes an orphaned rollback during startup', async () => {
    mockState.spectreStore.enabled = false
    mockState.spectreStore.spectreAccountMode = 'mnemonic'

    const { reconcileSpectreModeOnStartup } = await import('./spectreMode')
    await reconcileSpectreModeOnStartup()

    expect(mockState.walletStore.switchWallet).toHaveBeenCalledWith(mockState.primaryWallet.id)
    expect(mockState.spectreStore.setEnabled).toHaveBeenCalledWith(false)
    expect(mockState.writePersistedSpectreSnapshot).toHaveBeenCalledWith(null)
    expect(mockState.spectreStore.completeActivation).toHaveBeenCalled()
  })

  it('keeps an active startup session hardened and honors its Bluetooth override', async () => {
    const snapshot = await mockState.readPersistedSpectreSnapshot()
    mockState.readPersistedSpectreSnapshot.mockClear()
    mockState.readPersistedSpectreSnapshot.mockResolvedValueOnce({
      ...snapshot,
      bluetoothOverrideEnabled: true,
    })

    const { reconcileSpectreModeOnStartup } = await import('./spectreMode')
    await reconcileSpectreModeOnStartup()

    expect(mockState.setMessageCachePrivacyMode).toHaveBeenCalledWith('strict')
    expect(mockState.bleSetEnabled).toHaveBeenCalledWith(false)
    expect(mockState.bleSetEnabled).toHaveBeenCalledWith(true)
    expect(mockState.writePersistedSpectreSnapshot).not.toHaveBeenCalled()
  })

  it('rolls back an enabled startup session whose Spectre wallet is gone', async () => {
    mockState.walletStore.wallets = [mockState.primaryWallet]
    mockState.spectreStore.spectreAccountMode = 'mnemonic'

    const { reconcileSpectreModeOnStartup } = await import('./spectreMode')
    await reconcileSpectreModeOnStartup()

    expect(mockState.walletStore.switchWallet).toHaveBeenCalledWith(mockState.primaryWallet.id)
    expect(mockState.spectreStore.setEnabled).toHaveBeenCalledWith(false)
    expect(mockState.writePersistedSpectreSnapshot).toHaveBeenCalledWith(null)
    expect(mockState.spectreStore.failActivation).not.toHaveBeenCalled()
  })

  it('stays fail-closed when an enabled startup session has no valid snapshot', async () => {
    mockState.readPersistedSpectreSnapshot.mockResolvedValueOnce(null)

    const { reconcileSpectreModeOnStartup } = await import('./spectreMode')
    await reconcileSpectreModeOnStartup()

    expect(mockState.spectreStore.startActivation).toHaveBeenCalledWith('disable', 'rollback')
    expect(mockState.spectreStore.setEnabled).toHaveBeenCalledWith(true)
    expect(mockState.setMessageCachePrivacyMode).toHaveBeenCalledWith('strict')
    expect(mockState.spectreStore.failActivation).toHaveBeenCalledWith(
      'Spectre Mode recovery snapshot is missing or invalid',
    )
    expect(mockState.writePersistedSpectreSnapshot).not.toHaveBeenCalledWith(null)
  })

  it('stays fail-closed when startup cannot read the recovery snapshot', async () => {
    mockState.readPersistedSpectreSnapshot.mockRejectedValueOnce(
      new Error('secure store unavailable'),
    )

    const { reconcileSpectreModeOnStartup } = await import('./spectreMode')
    await expect(reconcileSpectreModeOnStartup()).rejects.toThrow('secure store unavailable')

    expect(mockState.spectreStore.startActivation).toHaveBeenCalledWith('disable', 'rollback')
    expect(mockState.spectreStore.setEnabled).toHaveBeenCalledWith(true)
    expect(mockState.setMessageCachePrivacyMode).toHaveBeenCalledWith('strict')
  })

  it('does not regress the modal phase while deferred disable cleanup is still running', async () => {
    const closeDeferred = createDeferred<{
      closed: boolean
      walletAddress: string
      reason: 'closed'
    }>()
    mockState.closeSpectreAddress.mockImplementationOnce(() => closeDeferred.promise)

    const { disableSpectreMode } = await import('./spectreMode')

    let completed = false
    await disableSpectreMode().then(() => {
      completed = true
    })

    expect(completed).toBe(true)
    expect(mockState.closeSpectreAddress).toHaveBeenCalledWith({
      bootstrapIfNeeded: true,
    })
    expect(mockState.spectreStore.completeActivation).toHaveBeenCalled()

    const completionOrder = mockState.spectreStore.completeActivation.mock.invocationCallOrder[0]
    expect(mockState.spectreStore.setActivationPhase.mock.invocationCallOrder.every(
      (order) => order < completionOrder,
    )).toBe(true)

    closeDeferred.resolve({
      closed: true,
      walletAddress: mockState.spectreWallet.address,
      reason: 'closed',
    })
    await Promise.resolve()
  })

  it('continues local expendable cleanup when the remote Spectre close fails', async () => {
    mockState.closeSpectreAddress.mockRejectedValueOnce(new Error('network down'))

    const { disableSpectreMode } = await import('./spectreMode')
    await disableSpectreMode()

    expect(mockState.walletStore.removeWallet).toHaveBeenCalledWith(mockState.spectreWallet.id, {
      fallbackWalletId: mockState.primaryWallet.id,
    })
  })

  it('toggles diagnostic recording during Spectre runtime initialization', async () => {
    const { initializeSpectreRuntime } = await import('./spectreMode')

    mockState.spectreStore.enabled = true
    initializeSpectreRuntime()

    expect(mockState.clearChatDiagnosticEvents).toHaveBeenCalled()
    expect(mockState.disableChatDiagnosticRecording).toHaveBeenCalled()
    expect(mockState.disableTorDiagnosticRecording).toHaveBeenCalled()

    mockState.clearChatDiagnosticEvents.mockClear()
    mockState.disableChatDiagnosticRecording.mockClear()
    mockState.enableChatDiagnosticRecording.mockClear()
    mockState.enableTorDiagnosticRecording.mockClear()

    mockState.spectreStore.enabled = false
    initializeSpectreRuntime()

    expect(mockState.clearChatDiagnosticEvents).not.toHaveBeenCalled()
    expect(mockState.enableChatDiagnosticRecording).toHaveBeenCalled()
    expect(mockState.enableTorDiagnosticRecording).toHaveBeenCalled()
  })

  it('reports setup requirements from the current wallet and duress state', async () => {
    mockState.loadDuressPinState.mockResolvedValueOnce({ enabled: false, hasDuressPin: false })

    const { getSpectreSetupRequirements } = await import('./spectreMode')

    await expect(getSpectreSetupRequirements()).resolves.toEqual({
      needsMnemonic: false,
      needsDuressPin: true,
      hasExistingWallet: true,
      existingAccountMode: 'expendable',
    })
  })

  it('propagates mnemonic validation codes and interpolation parameters', async () => {
    mockState.validateMnemonic.mockReturnValueOnce({
      valid: false,
      code: 'mnemonic_invalid_word',
      params: { word: 'not-a-word' },
    } as never)

    const { ensureSpectreWalletFromMnemonic } = await import('./spectreMode')

    await expect(ensureSpectreWalletFromMnemonic('not-a-word')).rejects.toMatchObject({
      message: 'mnemonic_invalid_word',
      code: 'mnemonic_invalid_word',
      params: { word: 'not-a-word' },
    })
  })

  it('rejects mnemonic setup when the phrase does not match the primary wallet', async () => {
    mockState.importWalletFromMnemonic.mockResolvedValueOnce({
      ...mockState.primaryWallet,
      address: 'exo00differentdifferentdifferentdifferent',
    })

    const { ensureSpectreWalletFromMnemonic } = await import('./spectreMode')

    mockState.walletStore.wallets = [mockState.primaryWallet]
    await expect(ensureSpectreWalletFromMnemonic('word '.repeat(23).trim() + ' last'))
      .rejects.toThrow('Recovery phrase does not match this device wallet')
  })

  it('force-disables expired Spectre mode as a best-effort operation', async () => {
    mockState.walletStore.isVaultUnlocked = false
    mockState.spectreStore.enabled = true
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { forceDisableExpiredSpectreMode } = await import('./spectreMode')
    await forceDisableExpiredSpectreMode()

    expect(warnSpy).toHaveBeenCalledWith(
      '[Spectre] Failed to disable expired Spectre Mode cleanly:',
      expect.any(Error),
    )
  })
})
