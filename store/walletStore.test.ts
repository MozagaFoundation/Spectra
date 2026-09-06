/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockSecureStoreOptions = { keychainService?: string; requireAuthentication?: boolean } | undefined

function secureStoreKey(key: string, options?: MockSecureStoreOptions): string {
  const service = options?.keychainService ?? 'default'
  const auth = options?.requireAuthentication ? 'auth' : 'plain'
  return `${service}:${auth}:${key}`
}

function isCurrentSecureStore(options?: MockSecureStoreOptions): boolean {
  return !options || options.keychainService === 'org.spectramozaga.exo'
}

const mockState = vi.hoisted(() => ({
  secureStore: new Map<string, string>(),
  clearIdentityCache: vi.fn(),
  clearCloudSession: vi.fn(async () => {}),
  invalidateAuthCaches: vi.fn(),
  encryptVaultWithKey: vi.fn((contents: unknown) => ({ contents })),
  encryptVaultWithVaultKey: vi.fn((contents: unknown, _key: Uint8Array, keySlots: unknown[]) => ({
    data: 'v3-encrypted-vault',
    iv: 'v3-iv',
    salt: '',
    version: 4,
    keySlots,
    contents,
  })),
  pinSlot: {
    id: 'pin-device',
    type: 'pin_device',
    version: 1,
    kdf: 'pbkdf2_sha256',
    salt: 'slot-salt',
    iterations: 1000,
    iv: 'slot-iv',
    wrappedKey: 'wrapped-key',
    createdAt: 1,
  },
  recoverySlot: {
    id: 'recovery',
    type: 'recovery_passphrase',
    version: 1,
    kdf: 'pbkdf2_sha256',
    salt: 'recovery-salt',
    iterations: 1000,
    iv: 'recovery-iv',
    wrappedKey: 'wrapped-recovery-key',
    createdAt: 1,
  },
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string, options?: MockSecureStoreOptions) => (
    mockState.secureStore.get(secureStoreKey(key, options)) ?? mockState.secureStore.get(key) ?? null
  )),
  setItemAsync: vi.fn(async (key: string, value: string, options?: MockSecureStoreOptions) => {
    mockState.secureStore.set(secureStoreKey(key, options), value)
    if (isCurrentSecureStore(options)) {
      mockState.secureStore.set(key, value)
    }
  }),
  deleteItemAsync: vi.fn(async (key: string, options?: MockSecureStoreOptions) => {
    mockState.secureStore.delete(secureStoreKey(key, options))
    if (isCurrentSecureStore(options)) {
      mockState.secureStore.delete(key)
    }
  }),
}))

vi.mock('@/lib/constants', () => ({
  SCREENSHOT_PROTECTION_KEY: 'screenshot_protection',
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
  SECURE_STORE_OPTIONS: { keychainService: 'org.spectramozaga.exo' },
  BIOMETRIC_SECURE_STORE_OPTIONS: {
    keychainService: 'org.spectramozaga.exo.biometric',
    requireAuthentication: true,
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

vi.mock('./authStore', () => ({
  useAuthStore: {
    getState: () => ({
      isAuthenticated: false,
      clearCloudSession: mockState.clearCloudSession,
    }),
  },
}))

vi.mock('@/services/backend/session', () => ({
  invalidateAuthCaches: mockState.invalidateAuthCaches,
}))

vi.mock('@spectra/identity-vault', () => ({
  base64ToBytes: vi.fn(() => new Uint8Array([1])),
  bytesToBase64: vi.fn(() => 'encoded'),
  CURRENT_VAULT_ENCRYPTION_VERSION: 4,
  CURRENT_PBKDF2_ITERATIONS: 1000,
  LEGACY_PBKDF2_ITERATIONS: 1000,
  createPinDeviceVaultKeySlot: vi.fn(async () => mockState.pinSlot),
  createRecoveryPassphraseVaultKeySlot: vi.fn(async () => mockState.recoverySlot),
  decryptVaultWithVaultKey: vi.fn(),
  encryptVaultWithKey: mockState.encryptVaultWithKey,
  encryptVaultWithVaultKey: mockState.encryptVaultWithVaultKey,
  generateDeviceSecret: vi.fn(() => 'generated-device-secret'),
  generateVaultKey: vi.fn(() => new Uint8Array([9, 9, 9])),
  getVaultKeySlot: vi.fn((vault, type) => vault.keySlots?.find((slot: { type: unknown }) => slot.type === type) ?? null),
  isVaultV3: vi.fn((vault) => vault.version >= 3 && Array.isArray(vault.keySlots)),
  decryptVaultWithKey: vi.fn(),
  unwrapVaultKeyWithPinDeviceSlot: vi.fn(async () => new Uint8Array([9, 9, 9])),
  unwrapVaultKeyWithRecoveryPassphraseSlot: vi.fn(async () => new Uint8Array([9, 9, 9])),
  verifyPinAndGetKeyAsync: vi.fn(),
  verifyPinAsync: vi.fn(),
}))

vi.mock('@/lib/identity', () => ({
  clearIdentityCache: mockState.clearIdentityCache,
}))

vi.mock('@/lib/i18n', () => ({
  translate: vi.fn((value: string) => value),
}))

vi.mock('@/services/security/biometricUnlock', () => ({
  clearBiometricUnlock: vi.fn(async () => {}),
  storeBiometricUnlockKey: vi.fn(async () => {}),
}))

describe('useWalletStore.removeWallet', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockState.secureStore.clear()
    mockState.clearIdentityCache.mockClear()
    mockState.encryptVaultWithKey.mockClear()
    mockState.encryptVaultWithVaultKey.mockClear()
  })

  it('removes a non-active wallet and persists the updated vault', async () => {
    const { useWalletStore } = await import('./walletStore')

    useWalletStore.setState({
      wallets: [
        { id: 'wallet-a', address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', publicKey: 'pub-a', privateKey: 'priv-a', displayName: 'Wallet A', createdAt: 1 },
        { id: 'wallet-b', address: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', publicKey: 'pub-b', privateKey: 'priv-b', displayName: 'Wallet B', spectreMode: true, createdAt: 2 },
      ],
      activeWalletId: 'wallet-a',
      wallet: { id: 'wallet-a', address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', publicKey: 'pub-a', privateKey: 'priv-a', displayName: 'Wallet A', createdAt: 1 },
      _sessionDerivedKey: new Uint8Array([1]),
      _sessionSalt: 'salt',
      _sessionKdfIterations: 1000,
      _addressBookKeys: {
        'wallet-a': 'key-a',
        'wallet-b': 'key-b',
      },
    })

    await useWalletStore.getState().removeWallet('wallet-b')

    expect(useWalletStore.getState().wallets.map((wallet) => wallet.id)).toEqual(['wallet-a'])
    expect(useWalletStore.getState().activeWalletId).toBe('wallet-a')
    expect(useWalletStore.getState()._addressBookKeys).toEqual({
      'wallet-a': 'key-a',
    })
    expect(mockState.encryptVaultWithKey).toHaveBeenCalledWith(
      expect.objectContaining({
        wallets: [
          expect.objectContaining({ id: 'wallet-a' }),
        ],
        activeWalletId: 'wallet-a',
        addressBookKeys: {
          'wallet-a': 'key-a',
        },
      }),
      expect.any(Uint8Array),
      'salt',
      1000,
    )
  })

  it('switches to the fallback wallet when removing the active wallet', async () => {
    const { useWalletStore } = await import('./walletStore')

    useWalletStore.setState({
      wallets: [
        { id: 'wallet-a', address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', publicKey: 'pub-a', privateKey: 'priv-a', displayName: 'Wallet A', createdAt: 1 },
        { id: 'wallet-b', address: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', publicKey: 'pub-b', privateKey: 'priv-b', displayName: 'Wallet B', spectreMode: true, createdAt: 2 },
      ],
      activeWalletId: 'wallet-a',
      wallet: { id: 'wallet-a', address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', publicKey: 'pub-a', privateKey: 'priv-a', displayName: 'Wallet A', createdAt: 1 },
      _sessionDerivedKey: new Uint8Array([1]),
      _sessionSalt: 'salt',
      _sessionKdfIterations: 1000,
      _addressBookKeys: {
        'wallet-a': 'key-a',
        'wallet-b': 'key-b',
      },
    })

    await useWalletStore.getState().removeWallet('wallet-a', {
      fallbackWalletId: 'wallet-b',
    })

    expect(useWalletStore.getState().wallet?.id).toBe('wallet-b')
    expect(useWalletStore.getState().activeWalletId).toBe('wallet-b')
    expect(mockState.clearIdentityCache).toHaveBeenCalled()
    expect(mockState.clearCloudSession).toHaveBeenCalled()
    expect(mockState.invalidateAuthCaches).toHaveBeenCalled()
  })
})

describe('normalizeWalletChainAccounts', () => {
  it('hydrates the EVM chain account from legacy Ethereum wallet fields', async () => {
    const { normalizeWalletChainAccounts } = await import('./walletStore')

    const result = normalizeWalletChainAccounts({
      id: 'wallet-a',
      address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      publicKey: 'pub-a',
      privateKey: 'priv-a',
      ethereumAddress: '0x0000000000000000000000000000000000000001',
      ethereumPublicKey: '0xpub',
      ethereumPrivateKey: '0xpriv',
      createdAt: 1,
    })

    expect(result.changed).toBe(true)
    expect(result.wallet.chainAccounts?.evm).toEqual({
      address: '0x0000000000000000000000000000000000000001',
      publicKey: '0xpub',
      privateKey: '0xpriv',
      derivationPath: "m/44'/60'/0'/0/0",
    })
  })
})

describe('useWalletStore active wallet persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockState.secureStore.clear()
    mockState.clearIdentityCache.mockClear()
    mockState.encryptVaultWithKey.mockClear()
    mockState.encryptVaultWithVaultKey.mockClear()
  })

  it('awaits switch persistence before callers can lock the in-memory vault', async () => {
    const { useWalletStore } = await import('./walletStore')

    useWalletStore.setState({
      wallets: [
        { id: 'wallet-a', address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', publicKey: 'pub-a', privateKey: 'priv-a', displayName: 'Wallet A', createdAt: 1 },
        { id: 'wallet-b', address: 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', publicKey: 'pub-b', privateKey: 'priv-b', displayName: 'Wallet B', createdAt: 2 },
      ],
      activeWalletId: 'wallet-a',
      wallet: { id: 'wallet-a', address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', publicKey: 'pub-a', privateKey: 'priv-a', displayName: 'Wallet A', createdAt: 1 },
      _sessionDerivedKey: new Uint8Array([1]),
      _sessionSalt: 'salt',
      _sessionKdfIterations: 1000,
      _addressBookKeys: {
        'wallet-a': 'key-a',
        'wallet-b': 'key-b',
      },
    })

    await useWalletStore.getState().switchWallet('wallet-b')
    useWalletStore.getState().lockVault()

    expect(JSON.parse(mockState.secureStore.get('vault') || '{}')).toEqual({
      contents: expect.objectContaining({
        activeWalletId: 'wallet-b',
        wallets: [
          expect.objectContaining({ id: 'wallet-a' }),
          expect.objectContaining({ id: 'wallet-b' }),
        ],
      }),
    })
  })

  it('updates an active wallet from the wallet list when the active pointer is stale', async () => {
    const { useWalletStore } = await import('./walletStore')

    useWalletStore.setState({
      wallets: [
        { id: 'wallet-a', address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', publicKey: 'pub-a', privateKey: 'priv-a', displayName: 'Wallet A', createdAt: 1 },
      ],
      activeWalletId: 'wallet-a',
      wallet: null,
      _sessionDerivedKey: new Uint8Array([1]),
      _sessionSalt: 'salt',
      _sessionKdfIterations: 1000,
    })

    await useWalletStore.getState().updateWallet('wallet-a', { displayName: 'Renamed Wallet' })

    expect(useWalletStore.getState().wallet).toEqual(expect.objectContaining({
      id: 'wallet-a',
      displayName: 'Renamed Wallet',
    }))
    expect(mockState.encryptVaultWithKey).toHaveBeenCalledWith(
      expect.objectContaining({
        wallets: [
          expect.objectContaining({ id: 'wallet-a', displayName: 'Renamed Wallet' }),
        ],
      }),
      expect.any(Uint8Array),
      'salt',
      1000,
    )
  })
})

describe('useWalletStore.addWallet', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.secureStore.clear()
    mockState.clearIdentityCache.mockClear()
    mockState.encryptVaultWithKey.mockClear()
    mockState.encryptVaultWithVaultKey.mockClear()
  })

  it('stores transparent EXO accounts without root issuer metadata', async () => {
    const { useWalletStore } = await import('./walletStore')

    useWalletStore.setState({
      wallets: [
        { id: 'wallet-a', address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', publicKey: 'pub-a', privateKey: 'priv-a', displayName: 'Wallet A', createdAt: 1 },
      ],
      activeWalletId: 'wallet-a',
      wallet: { id: 'wallet-a', address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', publicKey: 'pub-a', privateKey: 'priv-a', displayName: 'Wallet A', createdAt: 1 },
      _sessionDerivedKey: new Uint8Array([1]),
      _sessionSalt: 'salt',
      _sessionKdfIterations: 1000,
      _addressBookKeys: {
        'wallet-a': 'key-a',
      },
    })

    const savedWallet = await useWalletStore.getState().addWallet({
      id: 'transparent',
      address: 'exo00cccccccccccccccccccccccccccccccccccccc',
      publicKey: 'pub-transparent',
      privateKey: 'priv-transparent',
      displayName: 'Transparent',
      transparentMode: true,
      createdAt: 2,
    })

    expect(savedWallet).toMatchObject({
      id: 'transparent',
      transparentMode: true,
    })
    expect(savedWallet).not.toHaveProperty('issuerWalletAddress')
  })
})

describe('useWalletStore account storage recovery', () => {
  const legacyOptions = { keychainService: 'com.mozaga.exo' }
  const olderLegacyOptions = { keychainService: 'com.otauris.exo' }
  const legacyVault = {
    data: 'legacy-vault',
    iv: 'legacy-iv',
    salt: '',
    version: 4,
    keySlots: [mockState.pinSlot],
  }
  const contents = {
    wallets: [
      {
        id: 'wallet-a',
        address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        publicKey: 'pub-a',
        privateKey: 'priv-a',
        createdAt: 1,
      },
    ],
    activeWalletId: 'wallet-a',
    version: 3,
    addressBookKeys: {
      'wallet-a': 'address-book-key',
    },
  }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockState.secureStore.clear()
    mockState.clearIdentityCache.mockClear()
    mockState.encryptVaultWithKey.mockClear()
    mockState.encryptVaultWithVaultKey.mockClear()
  })

  it('detects a legacy-only wallet and stages encrypted data for unlock', async () => {
    const { useWalletStore } = await import('./walletStore')
    const legacyVaultValue = JSON.stringify(legacyVault)

    mockState.secureStore.set(secureStoreKey('vault', legacyOptions), legacyVaultValue)
    mockState.secureStore.set(secureStoreKey('device_secret', legacyOptions), 'legacy-device-secret')
    mockState.secureStore.set(secureStoreKey('biometric_enabled', legacyOptions), 'true')
    mockState.secureStore.set(secureStoreKey('session', legacyOptions), 'legacy-session')

    await useWalletStore.getState().initialize()

    expect(useWalletStore.getState().hasWallet).toBe(true)
    expect(mockState.secureStore.get('vault')).toBe(legacyVaultValue)
    expect(mockState.secureStore.get('device_secret')).toBe('legacy-device-secret')
    expect(mockState.secureStore.get('biometric_enabled')).toBe('false')
    expect(mockState.secureStore.get('session')).toBeUndefined()
    expect(mockState.secureStore.get('spectra_account_recovery_source_v1')).toBe('legacy-com-mozaga-exo')
  })

  it('blocks new wallet creation when only legacy wallet markers exist', async () => {
    const { useWalletStore } = await import('./walletStore')
    mockState.secureStore.set(secureStoreKey('vault', legacyOptions), JSON.stringify(legacyVault))

    await expect(
      useWalletStore.getState().createWallet(contents.wallets[0], '123456')
    ).rejects.toThrow('An account already exists on this device')
  })

  it('clears all legacy namespaces after a successful recovered unlock', async () => {
    const identityVault = await import('@spectra/identity-vault')
    const { useWalletStore } = await import('./walletStore')
    const legacyVaultValue = JSON.stringify(legacyVault)
    const olderLegacyVaultValue = JSON.stringify({ ...legacyVault, data: 'older-legacy-vault' })

    mockState.secureStore.set(secureStoreKey('vault', legacyOptions), legacyVaultValue)
    mockState.secureStore.set(secureStoreKey('device_secret', legacyOptions), 'legacy-device-secret')
    mockState.secureStore.set(secureStoreKey('session', legacyOptions), 'legacy-session')
    mockState.secureStore.set(secureStoreKey('vault', olderLegacyOptions), olderLegacyVaultValue)
    mockState.secureStore.set(secureStoreKey('device_secret', olderLegacyOptions), 'older-legacy-device-secret')
    vi.mocked(identityVault.decryptVaultWithVaultKey).mockReturnValue(contents)

    await useWalletStore.getState().initialize()
    await expect(useWalletStore.getState().unlockVault('123456')).resolves.toBe(true)
    await vi.waitFor(() => {
      expect(mockState.secureStore.get(secureStoreKey('vault', legacyOptions))).toBeUndefined()
    })

    expect(useWalletStore.getState().wallet?.id).toBe('wallet-a')
    expect(mockState.secureStore.get('vault')).toBe(legacyVaultValue)
    expect(mockState.secureStore.get('session')).toBe('legacy-session')
    expect(mockState.secureStore.get(secureStoreKey('vault', legacyOptions))).toBeUndefined()
    expect(mockState.secureStore.get(secureStoreKey('device_secret', legacyOptions))).toBeUndefined()
    expect(mockState.secureStore.get(secureStoreKey('vault', olderLegacyOptions))).toBeUndefined()
    expect(mockState.secureStore.get(secureStoreKey('device_secret', olderLegacyOptions))).toBeUndefined()
    expect(mockState.secureStore.get('spectra_account_recovery_source_v1')).toBeUndefined()
  })

  it('prefers current storage and deletes legacy copies after current unlock succeeds', async () => {
    const identityVault = await import('@spectra/identity-vault')
    const { useWalletStore } = await import('./walletStore')
    const currentVault = { ...legacyVault, data: 'current-vault' }
    const currentVaultValue = JSON.stringify(currentVault)
    const legacyVaultValue = JSON.stringify(legacyVault)

    mockState.secureStore.set('vault', currentVaultValue)
    mockState.secureStore.set('device_secret', 'current-device-secret')
    mockState.secureStore.set(secureStoreKey('vault', legacyOptions), legacyVaultValue)
    mockState.secureStore.set(secureStoreKey('device_secret', legacyOptions), 'legacy-device-secret')
    mockState.secureStore.set(secureStoreKey('session', legacyOptions), 'legacy-session')
    vi.mocked(identityVault.decryptVaultWithVaultKey).mockReturnValue(contents)

    await useWalletStore.getState().initialize()

    expect(useWalletStore.getState().hasWallet).toBe(true)
    expect(mockState.secureStore.get('vault')).toBe(currentVaultValue)
    expect(mockState.secureStore.get(secureStoreKey('vault', legacyOptions))).toBe(legacyVaultValue)
    expect(mockState.secureStore.get('spectra_account_recovery_source_v1')).toBeUndefined()

    await expect(useWalletStore.getState().unlockVault('123456')).resolves.toBe(true)
    await vi.waitFor(() => {
      expect(mockState.secureStore.get(secureStoreKey('vault', legacyOptions))).toBeUndefined()
    })

    expect(identityVault.decryptVaultWithVaultKey).toHaveBeenCalledWith(
      currentVault,
      new Uint8Array([9, 9, 9]),
    )
    expect(mockState.secureStore.get('vault')).toBe(currentVaultValue)
    expect(mockState.secureStore.get('device_secret')).toBe('current-device-secret')
    expect(mockState.secureStore.get('session')).toBeUndefined()
    expect(mockState.secureStore.get(secureStoreKey('vault', legacyOptions))).toBeUndefined()
    expect(mockState.secureStore.get(secureStoreKey('device_secret', legacyOptions))).toBeUndefined()
    expect(mockState.secureStore.get(secureStoreKey('session', legacyOptions))).toBeUndefined()
  })

  it('keeps legacy copies when current unlock fails', async () => {
    const identityVault = await import('@spectra/identity-vault')
    const { useWalletStore } = await import('./walletStore')
    const currentVaultValue = JSON.stringify({ ...legacyVault, data: 'current-vault' })
    const legacyVaultValue = JSON.stringify(legacyVault)

    mockState.secureStore.set('vault', currentVaultValue)
    mockState.secureStore.set('device_secret', 'current-device-secret')
    mockState.secureStore.set(secureStoreKey('vault', legacyOptions), legacyVaultValue)
    mockState.secureStore.set(secureStoreKey('device_secret', legacyOptions), 'legacy-device-secret')
    vi.mocked(identityVault.unwrapVaultKeyWithPinDeviceSlot).mockResolvedValueOnce(null as unknown as Uint8Array)

    await useWalletStore.getState().initialize()
    await expect(useWalletStore.getState().unlockVault('bad-pin')).resolves.toBe(false)

    expect(mockState.secureStore.get(secureStoreKey('vault', legacyOptions))).toBe(legacyVaultValue)
    expect(mockState.secureStore.get(secureStoreKey('device_secret', legacyOptions))).toBe('legacy-device-secret')
  })
})

describe('useWalletStore.unlockVault migration compatibility', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockState.secureStore.clear()
    mockState.clearIdentityCache.mockClear()
    mockState.encryptVaultWithKey.mockClear()
    mockState.encryptVaultWithVaultKey.mockClear()
  })

  it('migrates legacy raw PBKDF2 PIN verifier material to a current key-slot vault after unlock', async () => {
    const identityVault = await import('@spectra/identity-vault')
    const { useWalletStore } = await import('./walletStore')
    const legacyKey = new Uint8Array([1, 2, 3])
    const vaultKey = new Uint8Array([9, 9, 9])
    const contents = {
      wallets: [
        {
          id: 'wallet-a',
          address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          publicKey: 'pub-a',
          privateKey: 'priv-a',
          createdAt: 1,
        },
      ],
      activeWalletId: 'wallet-a',
      version: 3,
      addressBookKeys: {
        'wallet-a': 'address-book-key',
      },
    }

    mockState.secureStore.set('pin_hash', 'legacy-hash')
    mockState.secureStore.set('pin_salt', 'legacy-salt')
    mockState.secureStore.set('pin_kdf_iterations', '1000')
    mockState.secureStore.set('vault', JSON.stringify({ data: 'encrypted-vault' }))
    vi.mocked(identityVault.verifyPinAndGetKeyAsync).mockResolvedValue({
      valid: true,
      key: legacyKey,
      hashFormat: 'raw_pbkdf2',
    })
    vi.mocked(identityVault.decryptVaultWithKey).mockReturnValue(contents)

    await expect(useWalletStore.getState().unlockVault('123456')).resolves.toBe(true)

    expect(identityVault.decryptVaultWithKey).toHaveBeenCalledWith(
      { data: 'encrypted-vault' },
      legacyKey,
    )
    expect(identityVault.createPinDeviceVaultKeySlot).toHaveBeenCalledWith(
      '123456',
      'generated-device-secret',
      vaultKey,
      { iterations: 1000 },
    )
    expect(mockState.secureStore.get('pin_hash')).toBeUndefined()
    expect(mockState.secureStore.get('pin_salt')).toBeUndefined()
    expect(mockState.secureStore.get('pin_kdf_iterations')).toBeUndefined()
    expect(mockState.secureStore.get('device_secret')).toBe('generated-device-secret')
    expect(useWalletStore.getState()._sessionDerivedKey).toEqual(vaultKey)
    expect(useWalletStore.getState()._sessionKeySlots).toEqual([mockState.pinSlot])
  })

  it('migrates current-format legacy vaults to current envelopes instead of keeping PIN-derived encryption', async () => {
    const identityVault = await import('@spectra/identity-vault')
    const { useWalletStore } = await import('./walletStore')
    const key = new Uint8Array([1, 2, 3])
    const contents = {
      wallets: [
        {
          id: 'wallet-a',
          address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          publicKey: 'pub-a',
          privateKey: 'priv-a',
          createdAt: 1,
        },
      ],
      activeWalletId: 'wallet-a',
      version: 3,
      addressBookKeys: {
        'wallet-a': 'address-book-key',
      },
    }

    mockState.secureStore.set('pin_hash', 'current-hash')
    mockState.secureStore.set('pin_salt', 'current-salt')
    mockState.secureStore.set('pin_kdf_iterations', '1000')
    mockState.secureStore.set('vault', JSON.stringify({ data: 'encrypted-vault' }))
    vi.mocked(identityVault.verifyPinAndGetKeyAsync).mockResolvedValue({
      valid: true,
      key,
      hashFormat: 'sha256_key',
    })
    vi.mocked(identityVault.decryptVaultWithKey).mockReturnValue(contents)

    await expect(useWalletStore.getState().unlockVault('123456')).resolves.toBe(true)

    expect(identityVault.createPinDeviceVaultKeySlot).toHaveBeenCalled()
    expect(mockState.encryptVaultWithVaultKey).toHaveBeenCalled()
    expect(mockState.encryptVaultWithKey).not.toHaveBeenCalled()
    expect(useWalletStore.getState()._sessionDerivedKey).toEqual(new Uint8Array([9, 9, 9]))
    expect(useWalletStore.getState()._sessionKeySlots).toEqual([mockState.pinSlot])
  })
})

describe('useWalletStore key-slot vault hardening flows', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockState.secureStore.clear()
    mockState.clearIdentityCache.mockClear()
    mockState.encryptVaultWithKey.mockClear()
    mockState.encryptVaultWithVaultKey.mockClear()
  })

  const contents = {
    wallets: [
      {
        id: 'wallet-a',
        address: 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        publicKey: 'pub-a',
        privateKey: 'priv-a',
        createdAt: 1,
      },
    ],
    activeWalletId: 'wallet-a',
    version: 3,
    addressBookKeys: {
      'wallet-a': 'address-book-key',
    },
  }

  it('creates new wallets as v3 envelopes without persisted PIN verifier material', async () => {
    const identityVault = await import('@spectra/identity-vault')
    const { useWalletStore } = await import('./walletStore')
    const wallet = contents.wallets[0]

    await useWalletStore.getState().createWallet(wallet, '123456')

    expect(identityVault.createPinDeviceVaultKeySlot).toHaveBeenCalledWith(
      '123456',
      'generated-device-secret',
      new Uint8Array([9, 9, 9]),
      { iterations: 1000 },
    )
    expect(mockState.secureStore.get('vault')).toContain('"version":4')
    expect(mockState.secureStore.get('device_secret')).toBe('generated-device-secret')
    expect(mockState.secureStore.get('pin_hash')).toBeUndefined()
    expect(mockState.secureStore.get('pin_salt')).toBeUndefined()
    expect(useWalletStore.getState()._sessionKeySlots).toEqual([mockState.pinSlot])
  })

  it('unlocks v3 vaults with PIN plus device secret and refreshes the envelope', async () => {
    const identityVault = await import('@spectra/identity-vault')
    const { useWalletStore } = await import('./walletStore')
    const encryptedVault = {
      data: 'v3-encrypted-vault',
      iv: 'v3-iv',
      salt: '',
      version: 3,
      keySlots: [mockState.pinSlot],
    }

    mockState.secureStore.set('vault', JSON.stringify(encryptedVault))
    mockState.secureStore.set('device_secret', 'device-secret')
    vi.mocked(identityVault.decryptVaultWithVaultKey).mockReturnValue(contents)

    await expect(useWalletStore.getState().unlockVault('123456')).resolves.toBe(true)

    expect(identityVault.unwrapVaultKeyWithPinDeviceSlot).toHaveBeenCalledWith(
      '123456',
      'device-secret',
      mockState.pinSlot,
    )
    expect(identityVault.verifyPinAndGetKeyAsync).not.toHaveBeenCalled()
    expect(mockState.encryptVaultWithVaultKey).toHaveBeenCalledWith(
      contents,
      new Uint8Array([9, 9, 9]),
      [mockState.pinSlot],
    )
    expect(useWalletStore.getState().wallet?.id).toBe('wallet-a')
  })

  it('purges retired EXP account state before persisting an unlocked vault', async () => {
    const identityVault = await import('@spectra/identity-vault')
    const { useWalletStore } = await import('./walletStore')
    const encryptedVault = {
      data: 'v3-encrypted-vault',
      iv: 'v3-iv',
      salt: '',
      version: 4,
      keySlots: [mockState.pinSlot],
    }
    const legacyContents = {
      ...contents,
      wallets: [{
        ...contents.wallets[0],
        expAccount: {
          address: 'EXP01legacy',
          notes: [{ commitment: 'legacy-note' }],
          publicKey: 'legacy-public-key',
          viewKey: 'legacy-view-key',
        },
      }],
    }

    mockState.secureStore.set('vault', JSON.stringify(encryptedVault))
    mockState.secureStore.set('device_secret', 'device-secret')
    vi.mocked(identityVault.decryptVaultWithVaultKey).mockReturnValue(legacyContents)

    await expect(useWalletStore.getState().unlockVault('123456')).resolves.toBe(true)

    const persistedContents = mockState.encryptVaultWithVaultKey.mock.calls.at(-1)?.[0] as typeof contents | undefined
    expect(useWalletStore.getState().wallet).not.toHaveProperty('expAccount')
    expect(persistedContents?.wallets[0]).not.toHaveProperty('expAccount')
  })

  it('rotates only the PIN slot when changing a v3 PIN', async () => {
    const identityVault = await import('@spectra/identity-vault')
    const { useWalletStore } = await import('./walletStore')
    const encryptedVault = {
      data: 'v3-encrypted-vault',
      iv: 'v3-iv',
      salt: '',
      version: 3,
      keySlots: [mockState.pinSlot, mockState.recoverySlot],
    }

    mockState.secureStore.set('vault', JSON.stringify(encryptedVault))
    mockState.secureStore.set('device_secret', 'device-secret')
    vi.mocked(identityVault.decryptVaultWithVaultKey).mockReturnValue(contents)

    await expect(useWalletStore.getState().changePin('123456', '654321')).resolves.toBe(true)

    expect(identityVault.createPinDeviceVaultKeySlot).toHaveBeenCalledWith(
      '654321',
      'device-secret',
      new Uint8Array([9, 9, 9]),
      { iterations: 1000 },
    )
    expect(identityVault.decryptVaultWithKey).not.toHaveBeenCalled()
    expect(mockState.encryptVaultWithVaultKey).toHaveBeenCalledWith(
      contents,
      new Uint8Array([9, 9, 9]),
      [mockState.recoverySlot, mockState.pinSlot],
    )
  })

  it('adds recovery passphrase slots to existing v3 vaults', async () => {
    const identityVault = await import('@spectra/identity-vault')
    const { useWalletStore } = await import('./walletStore')
    const encryptedVault = {
      data: 'v3-encrypted-vault',
      iv: 'v3-iv',
      salt: '',
      version: 3,
      keySlots: [mockState.pinSlot],
    }

    mockState.secureStore.set('vault', JSON.stringify(encryptedVault))
    mockState.secureStore.set('device_secret', 'device-secret')
    vi.mocked(identityVault.decryptVaultWithVaultKey).mockReturnValue(contents)

    await expect(
      useWalletStore.getState().addRecoveryPassphrase('123456', 'correct horse battery staple')
    ).resolves.toBe(true)

    expect(identityVault.createRecoveryPassphraseVaultKeySlot).toHaveBeenCalledWith(
      'correct horse battery staple',
      new Uint8Array([9, 9, 9]),
      { iterations: 1000 },
    )
    expect(useWalletStore.getState()._sessionKeySlots).toEqual([
      mockState.pinSlot,
      mockState.recoverySlot,
    ])
  })

  it('unlocks with a recovery passphrase and recreates the local PIN device slot', async () => {
    const identityVault = await import('@spectra/identity-vault')
    const { useWalletStore } = await import('./walletStore')
    const encryptedVault = {
      data: 'v3-encrypted-vault',
      iv: 'v3-iv',
      salt: '',
      version: 3,
      keySlots: [mockState.recoverySlot],
    }

    mockState.secureStore.set('vault', JSON.stringify(encryptedVault))
    vi.mocked(identityVault.decryptVaultWithVaultKey).mockReturnValue(contents)

    await expect(
      useWalletStore.getState().unlockVaultWithRecoveryPassphrase(
        'correct horse battery staple',
        '123456',
      )
    ).resolves.toBe(true)

    expect(identityVault.unwrapVaultKeyWithRecoveryPassphraseSlot).toHaveBeenCalledWith(
      'correct horse battery staple',
      mockState.recoverySlot,
    )
    expect(mockState.secureStore.get('device_secret')).toBe('generated-device-secret')
    expect(useWalletStore.getState().isVaultUnlocked).toBe(true)
    expect(useWalletStore.getState()._sessionKeySlots).toEqual([
      mockState.recoverySlot,
      mockState.pinSlot,
    ])
  })

  it('uses biometric stored vault keys directly for v3 vaults', async () => {
    const identityVault = await import('@spectra/identity-vault')
    const { useWalletStore } = await import('./walletStore')
    const encryptedVault = {
      data: 'v3-encrypted-vault',
      iv: 'v3-iv',
      salt: '',
      version: 3,
      keySlots: [mockState.pinSlot],
    }

    mockState.secureStore.set('vault', JSON.stringify(encryptedVault))
    vi.mocked(identityVault.decryptVaultWithVaultKey).mockReturnValue(contents)

    await expect(useWalletStore.getState().unlockVaultWithBiometricKey('encoded-key')).resolves.toBe(true)

    expect(identityVault.decryptVaultWithVaultKey).toHaveBeenCalledWith(
      encryptedVault,
      new Uint8Array([1]),
    )
    expect(useWalletStore.getState()._sessionKeySlots).toEqual([mockState.pinSlot])
  })
})
