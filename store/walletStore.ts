/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'
import { InteractionManager } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import {
  STORAGE_KEYS,
  SECURE_STORE_OPTIONS,
  VAULT_SECURITY_KEYS,
} from '@/lib/constants'
import { useAuthStore } from './authStore'
import { 
  base64ToBytes,
  bytesToBase64,
  createPinDeviceVaultKeySlot,
  createRecoveryPassphraseVaultKeySlot,
  CURRENT_VAULT_ENCRYPTION_VERSION,
  CURRENT_PBKDF2_ITERATIONS,
  decryptVaultWithVaultKey,
  encryptVaultWithKey,
  encryptVaultWithVaultKey,
  decryptVaultWithKey,
  generateDeviceSecret,
  generateVaultKey,
  getVaultKeySlot,
  isVaultV3,
  LEGACY_PBKDF2_ITERATIONS,
  unwrapVaultKeyWithPinDeviceSlot,
  unwrapVaultKeyWithRecoveryPassphraseSlot,
  verifyPinAndGetKeyAsync,
  verifyPinAsync,
  type EncryptedVault,
  type EXOWallet,
  type VaultKeySlot,
  type VaultContents,
} from '@spectra/identity-vault'
import { clearIdentityCache } from '@/lib/identity'
import { translate } from '@/lib/i18n'
import {
  finalizeAccountStorageAfterUnlock,
  stageLegacyAccountStorageForUnlock,
} from '@/services/security/accountStorageRecovery'
import { clearBiometricUnlock, storeBiometricUnlockKey } from '@/services/security/biometricUnlock'

const VAULT_KEY = STORAGE_KEYS.VAULT
const PIN_HASH_KEY = VAULT_SECURITY_KEYS.PIN_HASH
const PIN_SALT_KEY = VAULT_SECURITY_KEYS.PIN_SALT
const PIN_KDF_ITERATIONS_KEY = VAULT_SECURITY_KEYS.PIN_KDF_ITERATIONS
const DEVICE_SECRET_KEY = VAULT_SECURITY_KEYS.DEVICE_SECRET
const WALLET_INIT_RETRY_DELAYS_MS = [0, 150, 350, 750]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function detectStoredWalletPresence(): Promise<boolean> {
  const presence = await stageLegacyAccountStorageForUnlock()
  return presence.hasWallet
}

async function finalizeAccountStorageAfterSuccessfulUnlock(): Promise<void> {
  await finalizeAccountStorageAfterUnlock().catch((error) => {
    console.warn('Failed to finalize account storage after unlock:', error)
  })
}

function scheduleUnlockSideEffects(task: () => Promise<void>): void {
  InteractionManager.runAfterInteractions(() => {
    void task().catch((error) => {
      console.warn('Failed to finish unlock side effects:', error)
    })
  })
}

function parseStoredKdfIterations(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : LEGACY_PBKDF2_ITERATIONS
}

async function getOrCreateDeviceSecret(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_SECRET_KEY, SECURE_STORE_OPTIONS)
  if (existing) {
    return existing
  }

  const next = generateDeviceSecret()
  await SecureStore.setItemAsync(DEVICE_SECRET_KEY, next, SECURE_STORE_OPTIONS)
  return next
}

async function clearLegacyPinMetadata(): Promise<void> {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(PIN_HASH_KEY, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(PIN_SALT_KEY, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(PIN_KDF_ITERATIONS_KEY, SECURE_STORE_OPTIONS),
  ])
}

async function createEncryptedVaultEnvelope(
  pin: string,
  contents: VaultContents,
): Promise<{ vaultKey: Uint8Array; keySlots: VaultKeySlot[]; encryptedVault: EncryptedVault }> {
  const vaultKey = generateVaultKey()
  const deviceSecret = await getOrCreateDeviceSecret()
  const pinSlot = await createPinDeviceVaultKeySlot(pin, deviceSecret, vaultKey, {
    iterations: CURRENT_PBKDF2_ITERATIONS,
  })

  return {
    vaultKey,
    keySlots: [pinSlot],
    encryptedVault: encryptVaultWithVaultKey(contents, vaultKey, [pinSlot]),
  }
}

async function migrateVaultToCurrentEnvelope(
  pin: string,
  contents: VaultContents,
): Promise<{ vaultKey: Uint8Array; keySlots: VaultKeySlot[] } | null> {
  try {
    const { vaultKey, keySlots, encryptedVault } = await createEncryptedVaultEnvelope(pin, contents)
    await SecureStore.setItemAsync(VAULT_KEY, JSON.stringify(encryptedVault), SECURE_STORE_OPTIONS)
    await clearLegacyPinMetadata()

    const biometricEnabled = await SecureStore.getItemAsync(
      STORAGE_KEYS.BIOMETRIC_ENABLED,
      SECURE_STORE_OPTIONS
    )

    if (biometricEnabled === 'true') {
      try {
        await storeBiometricUnlockKey(vaultKey, translate('Authenticate to refresh biometric unlock'))
      } catch (error) {
        console.warn('Failed to refresh biometric unlock secret after vault migration:', error)
        await clearBiometricUnlock()
      }
    }

    return { vaultKey, keySlots }
  } catch (error) {
    console.warn('Failed to migrate vault after successful unlock:', error)
    return null
  }
}

async function unwrapVaultKeyWithPin(pin: string, encryptedVault: EncryptedVault): Promise<Uint8Array | null> {
  const slot = getVaultKeySlot(encryptedVault, 'pin_device')
  if (!slot) {
    return null
  }

  const deviceSecret = await SecureStore.getItemAsync(DEVICE_SECRET_KEY, SECURE_STORE_OPTIONS)
  if (!deviceSecret) {
    return null
  }

  return unwrapVaultKeyWithPinDeviceSlot(pin, deviceSecret, slot)
}

function generateAddressBookKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytesToBase64(bytes)
}

function ensureAddressBookKeys(contents: VaultContents): {
  contents: VaultContents
  keys: Record<string, string>
  changed: boolean
} {
  const keys = { ...(contents.addressBookKeys || {}) }
  let changed = !contents.addressBookKeys

  for (const wallet of contents.wallets) {
    if (!keys[wallet.id]) {
      keys[wallet.id] = generateAddressBookKey()
      changed = true
    }
  }

  if (!changed) {
    return {
      contents,
      keys,
      changed: false,
    }
  }

  return {
    contents: {
      ...contents,
      version: Math.max(contents.version, 2),
      addressBookKeys: keys,
    },
    keys,
    changed: true,
  }
}

function stripRetiredWalletFields(wallet: EXOWallet): { wallet: EXOWallet; changed: boolean } {
  if (!Object.prototype.hasOwnProperty.call(wallet, 'expAccount')) {
    return { wallet, changed: false }
  }

  const { expAccount: _removed, ...nextWallet } = wallet as EXOWallet & { expAccount?: unknown }
  return { wallet: nextWallet, changed: true }
}

export function normalizeWalletChainAccounts(wallet: EXOWallet): { wallet: EXOWallet; changed: boolean } {
  if (!wallet.ethereumAddress || !wallet.ethereumPublicKey || !wallet.ethereumPrivateKey) {
    return { wallet, changed: false }
  }

  if (wallet.chainAccounts?.evm) {
    return { wallet, changed: false }
  }

  return {
    wallet: {
      ...wallet,
      chainAccounts: {
        ...(wallet.chainAccounts || {}),
        evm: {
          address: wallet.ethereumAddress,
          publicKey: wallet.ethereumPublicKey,
          privateKey: wallet.ethereumPrivateKey,
          derivationPath: "m/44'/60'/0'/0/0",
        },
      },
    },
    changed: true,
  }
}

function normalizeVaultContents(contents: VaultContents): {
  contents: VaultContents
  keys: Record<string, string>
  changed: boolean
} {
  const addressBookResult = ensureAddressBookKeys(contents)
  let changed = addressBookResult.changed

  const wallets = addressBookResult.contents.wallets.map((wallet) => {
    const retiredFieldResult = stripRetiredWalletFields(wallet)
    const normalized = normalizeWalletChainAccounts(retiredFieldResult.wallet)
    if (retiredFieldResult.changed || normalized.changed) {
      changed = true
    }
    return normalized.wallet
  })

  return {
    contents: {
      ...addressBookResult.contents,
      version: changed ? Math.max(addressBookResult.contents.version, 3) : addressBookResult.contents.version,
      wallets,
    },
    keys: addressBookResult.keys,
    changed,
  }
}

interface WalletState {
  isVaultUnlocked: boolean
  isLoading: boolean
  hasWallet: boolean
  initializationError: boolean
  wallet: EXOWallet | null
  wallets: EXOWallet[]
  activeWalletId: string | null
  
  // Memory-only session state.
  _sessionDerivedKey: Uint8Array | null
  _sessionSalt: string | null
  _sessionKdfIterations: number | null
  _sessionKeySlots: VaultKeySlot[] | null
  _addressBookKeys: Record<string, string>
  
  initialize: () => Promise<void>
  createWallet: (wallet: EXOWallet | EXOWallet[], pin: string) => Promise<void>
  importWallet: (wallet: EXOWallet | EXOWallet[], pin: string) => Promise<void>
  addWallet: (wallet: EXOWallet, options?: { makeActive?: boolean }) => Promise<EXOWallet>
  removeWallet: (walletId: string, options?: { fallbackWalletId?: string }) => Promise<void>
  unlockVault: (pin: string) => Promise<boolean>
  unlockVaultWithBiometricKey: (storedKey: string) => Promise<boolean>
  addRecoveryPassphrase: (currentPin: string, passphrase: string) => Promise<boolean>
  unlockVaultWithRecoveryPassphrase: (passphrase: string, newPin: string) => Promise<boolean>
  lockVault: () => void
  getActiveWallet: () => EXOWallet | null
  getActiveAddressBookKey: () => Uint8Array | null
  switchWallet: (walletId: string) => Promise<void>
  updateWallet: (walletId: string, updates: Partial<EXOWallet>) => Promise<void>
  changePin: (currentPin: string, newPin: string) => Promise<boolean>
  verifyPin: (pin: string) => Promise<boolean>
  _persistVault: () => Promise<void>
}

export const useWalletStore = create<WalletState>((set, get) => ({
  isVaultUnlocked: false,
  isLoading: true,
  hasWallet: false,
  initializationError: false,
  wallet: null,
  wallets: [],
  activeWalletId: null,
  _sessionDerivedKey: null,
  _sessionSalt: null,
  _sessionKdfIterations: null,
  _sessionKeySlots: null,
  _addressBookKeys: {},

  initialize: async () => {
    let lastError: unknown = null

    try {
      for (const delayMs of WALLET_INIT_RETRY_DELAYS_MS) {
        if (delayMs > 0) {
          await sleep(delayMs)
        }

        try {
          const hasWallet = await detectStoredWalletPresence()
          set({
            isLoading: false,
            hasWallet,
            initializationError: false,
          })
          return
        } catch (error) {
          lastError = error
        }
      }
    } catch (error) {
      lastError = error
    }

    console.error('Failed to initialize wallet store:', lastError)
    set((state) => ({
      isLoading: false,
      hasWallet: useAuthStore.getState().isAuthenticated || state.hasWallet,
      initializationError: true,
    }))
  },

  createWallet: async (wallet: EXOWallet | EXOWallet[], pin: string) => {
    const hasExistingWallet = get().hasWallet || await detectStoredWalletPresence()
    if (hasExistingWallet) {
      throw new Error('An account already exists on this device. Unlock it or wipe local data before creating a new one.')
    }

    const wallets = Array.isArray(wallet) ? wallet : [wallet]
    if (wallets.length === 0) {
      throw new Error('No wallet provided')
    }

    const activeWallet = wallets[0]
    const addressBookKeys = wallets.reduce<Record<string, string>>((keys, entry) => {
      keys[entry.id] = generateAddressBookKey()
      return keys
    }, {})

    const contents: VaultContents = {
      wallets,
      activeWalletId: activeWallet.id,
      version: 3,
      addressBookKeys,
    }
    const { vaultKey, keySlots, encryptedVault } = await createEncryptedVaultEnvelope(pin, contents)
    
    await SecureStore.setItemAsync(VAULT_KEY, JSON.stringify(encryptedVault), SECURE_STORE_OPTIONS)
    await Promise.allSettled([
      SecureStore.setItemAsync(STORAGE_KEYS.HAS_WALLET, 'true', SECURE_STORE_OPTIONS),
      SecureStore.deleteItemAsync(VAULT_SECURITY_KEYS.PIN_ATTEMPTS, SECURE_STORE_OPTIONS),
      SecureStore.deleteItemAsync(VAULT_SECURITY_KEYS.PIN_LOCKOUT_UNTIL, SECURE_STORE_OPTIONS),
      clearLegacyPinMetadata(),
      clearBiometricUnlock(),
    ])
    clearIdentityCache()
    
    set({
      isVaultUnlocked: true,
      hasWallet: true,
      initializationError: false,
      wallet: activeWallet,
      wallets,
      activeWalletId: activeWallet.id,
      _sessionDerivedKey: vaultKey,
      _sessionSalt: null,
      _sessionKdfIterations: null,
      _sessionKeySlots: keySlots,
      _addressBookKeys: addressBookKeys,
    })
  },

  importWallet: async (wallet: EXOWallet | EXOWallet[], pin: string) => {
    await get().createWallet(wallet, pin)
  },

  addWallet: async (wallet: EXOWallet, options?: { makeActive?: boolean }) => {
    const {
      wallets,
      activeWalletId,
      wallet: activeWallet,
      _sessionDerivedKey,
      _addressBookKeys,
    } = get()

    if (!_sessionDerivedKey) {
      throw new Error('Vault not unlocked')
    }

    const existingWallet = wallets.find((entry) => (
      entry.id === wallet.id || entry.address === wallet.address
    ))

    if (existingWallet) {
      if (options?.makeActive && existingWallet.id !== activeWalletId) {
        clearIdentityCache()
        set({
          activeWalletId: existingWallet.id,
          wallet: existingWallet,
        })
        await get()._persistVault()
      }

      return existingWallet
    }

    const nextAddressBookKeys = {
      ..._addressBookKeys,
      [wallet.id]: _addressBookKeys[wallet.id] || generateAddressBookKey(),
    }
    const nextWallets = [...wallets, wallet]
    const nextActiveWalletId = options?.makeActive ? wallet.id : (activeWalletId || wallet.id)
    const nextActiveWallet = options?.makeActive
      ? wallet
      : (activeWallet || wallets.find((entry) => entry.id === nextActiveWalletId) || wallet)

    if (options?.makeActive || !activeWallet) {
      clearIdentityCache()
    }
    set({
      wallets: nextWallets,
      activeWalletId: nextActiveWalletId,
      wallet: nextActiveWallet,
      _addressBookKeys: nextAddressBookKeys,
    })

    await get()._persistVault()
    return wallet
  },

  removeWallet: async (walletId: string, options?: { fallbackWalletId?: string }) => {
    const {
      wallets,
      activeWalletId,
      wallet: activeWallet,
      _sessionDerivedKey,
      _addressBookKeys,
    } = get()

    if (!_sessionDerivedKey) {
      throw new Error('Vault not unlocked')
    }

    const walletToRemove = wallets.find((entry) => entry.id === walletId)
    if (!walletToRemove) {
      throw new Error('Wallet not found')
    }

    if (wallets.length <= 1) {
      throw new Error('Cannot remove the last wallet from the vault')
    }

    const nextWallets = wallets.filter((entry) => entry.id !== walletId)
    const nextAddressBookKeys = { ..._addressBookKeys }
    delete nextAddressBookKeys[walletId]

    let nextActiveWalletId = activeWalletId
    let nextActiveWallet = activeWallet

    if (activeWalletId === walletId || activeWallet?.id === walletId) {
      const fallbackWallet = options?.fallbackWalletId
        ? nextWallets.find((entry) => entry.id === options.fallbackWalletId)
        : nextWallets[0]

      if (!fallbackWallet) {
        throw new Error('Fallback wallet not found')
      }

      nextActiveWalletId = fallbackWallet.id
      nextActiveWallet = fallbackWallet
      clearIdentityCache()
      await useAuthStore.getState().clearCloudSession()
      const { invalidateAuthCaches } = await import('@/services/backend/session')
      invalidateAuthCaches()
    }

    set({
      wallets: nextWallets,
      activeWalletId: nextActiveWalletId,
      wallet: nextActiveWallet || null,
      _addressBookKeys: nextAddressBookKeys,
    })

    await get()._persistVault()
  },

  verifyPin: async (pin: string): Promise<boolean> => {
    try {
      const vaultStr = await SecureStore.getItemAsync(VAULT_KEY, SECURE_STORE_OPTIONS)
      if (vaultStr) {
        const encryptedVault: EncryptedVault = JSON.parse(vaultStr)
        if (isVaultV3(encryptedVault)) {
          const vaultKey = await unwrapVaultKeyWithPin(pin, encryptedVault)
          if (!vaultKey) {
            return false
          }
          decryptVaultWithVaultKey<VaultContents>(encryptedVault, vaultKey)
          return true
        }
      }

      const [storedHash, storedSalt, storedIterationsValue] = await Promise.all([
        SecureStore.getItemAsync(PIN_HASH_KEY, SECURE_STORE_OPTIONS),
        SecureStore.getItemAsync(PIN_SALT_KEY, SECURE_STORE_OPTIONS),
        SecureStore.getItemAsync(PIN_KDF_ITERATIONS_KEY, SECURE_STORE_OPTIONS),
      ])

      if (!storedHash || !storedSalt) {
        return false
      }

      const storedIterations = parseStoredKdfIterations(storedIterationsValue)
      
      return verifyPinAsync(pin, storedHash, storedSalt, storedIterations)
    } catch (error) {
      console.error('Failed to verify PIN:', error)
      return false
    }
  },

  unlockVault: async (pin: string): Promise<boolean> => {
    try {
      const unlockStartedAt = Date.now()
      const vaultStr = await SecureStore.getItemAsync(VAULT_KEY, SECURE_STORE_OPTIONS)
      if (!vaultStr) {
        return false
      }

      const encryptedVault: EncryptedVault = JSON.parse(vaultStr)

      if (isVaultV3(encryptedVault)) {
        const vaultKey = await unwrapVaultKeyWithPin(pin, encryptedVault)
        if (!vaultKey) {
          return false
        }

        const contents = decryptVaultWithVaultKey<VaultContents>(encryptedVault, vaultKey)
        const normalizedContents = normalizeVaultContents(contents)
        const activeWallet = normalizedContents.contents.wallets.find(
          (wallet) => wallet.id === normalizedContents.contents.activeWalletId,
        ) || normalizedContents.contents.wallets[0]

        const shouldRefreshVault = normalizedContents.changed
          || encryptedVault.version < CURRENT_VAULT_ENCRYPTION_VERSION

        set({
          isVaultUnlocked: true,
          hasWallet: true,
          initializationError: false,
          wallets: normalizedContents.contents.wallets,
          activeWalletId: normalizedContents.contents.activeWalletId,
          wallet: activeWallet || null,
          _sessionDerivedKey: vaultKey,
          _sessionSalt: null,
          _sessionKdfIterations: null,
          _sessionKeySlots: encryptedVault.keySlots || [],
          _addressBookKeys: normalizedContents.keys,
        })
        scheduleUnlockSideEffects(async () => {
          if (shouldRefreshVault) {
            const refreshedVault = encryptVaultWithVaultKey(
              normalizedContents.contents,
              vaultKey,
              encryptedVault.keySlots || [],
            )
            await SecureStore.setItemAsync(VAULT_KEY, JSON.stringify(refreshedVault), SECURE_STORE_OPTIONS)
          }
          await finalizeAccountStorageAfterSuccessfulUnlock()
        })

        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          console.log('[Unlock] Vault unlock timings', {
            totalElapsedMs: Date.now() - unlockStartedAt,
            vaultVersion: encryptedVault.version,
            migrated: encryptedVault.version < CURRENT_VAULT_ENCRYPTION_VERSION,
          })
        }

        return true
      }

      const [storedHash, storedSalt, storedIterationsValue] = await Promise.all([
        SecureStore.getItemAsync(PIN_HASH_KEY, SECURE_STORE_OPTIONS),
        SecureStore.getItemAsync(PIN_SALT_KEY, SECURE_STORE_OPTIONS),
        SecureStore.getItemAsync(PIN_KDF_ITERATIONS_KEY, SECURE_STORE_OPTIONS),
      ])
      
      if (!storedHash || !storedSalt) {
        return false
      }

      const storedIterations = parseStoredKdfIterations(storedIterationsValue)
      const verifyStartedAt = Date.now()
      
      const { valid, key, hashFormat } = await verifyPinAndGetKeyAsync(
        pin,
        storedHash,
        storedSalt,
        storedIterations
      )
      if (!valid || !key) {
        return false
      }

      const contents = decryptVaultWithKey<VaultContents>(encryptedVault, key)
      const normalizedContents = normalizeVaultContents(contents)
      const upgradeStartedAt = Date.now()
      const migratedSecurity = await migrateVaultToCurrentEnvelope(pin, normalizedContents.contents)
      const activeKey = migratedSecurity?.vaultKey ?? key
      const activeKeySlots = migratedSecurity?.keySlots ?? null

      if (!migratedSecurity && normalizedContents.changed) {
        scheduleUnlockSideEffects(async () => {
          const refreshedVault = encryptVaultWithKey(
            normalizedContents.contents,
            key,
            storedSalt,
            storedIterations,
          )
          await SecureStore.setItemAsync(VAULT_KEY, JSON.stringify(refreshedVault), SECURE_STORE_OPTIONS)
          await finalizeAccountStorageAfterSuccessfulUnlock()
        })
      } else {
        scheduleUnlockSideEffects(finalizeAccountStorageAfterSuccessfulUnlock)
      }

      const activeWallet = normalizedContents.contents.wallets.find(
        (wallet) => wallet.id === normalizedContents.contents.activeWalletId,
      ) || normalizedContents.contents.wallets[0]
      
      set({
        isVaultUnlocked: true,
        hasWallet: true,
        initializationError: false,
        wallets: normalizedContents.contents.wallets,
        activeWalletId: normalizedContents.contents.activeWalletId,
        wallet: activeWallet || null,
        _sessionDerivedKey: activeKey,
        _sessionSalt: migratedSecurity ? null : storedSalt,
        _sessionKdfIterations: migratedSecurity ? null : storedIterations,
        _sessionKeySlots: activeKeySlots,
        _addressBookKeys: normalizedContents.keys,
      })

      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        const totalElapsedMs = Date.now() - unlockStartedAt
        const verifyElapsedMs = verifyStartedAt - unlockStartedAt
        const kdfElapsedMs = upgradeStartedAt - verifyStartedAt
        const upgradeElapsedMs = Date.now() - upgradeStartedAt
        console.log('[Unlock] Vault unlock timings', {
          totalElapsedMs,
          metadataLoadMs: verifyElapsedMs,
          verifyAndDecryptMs: kdfElapsedMs,
          migrationMs: upgradeElapsedMs,
          storedIterations,
          hashFormat,
          migrated: Boolean(migratedSecurity),
        })
      }
      
      return true
    } catch (error) {
      console.error('Failed to unlock vault:', error)
      return false
    }
  },

  unlockVaultWithBiometricKey: async (storedKey: string): Promise<boolean> => {
    try {
      const [vaultStr, storedSalt, storedIterationsValue] = await Promise.all([
        SecureStore.getItemAsync(VAULT_KEY, SECURE_STORE_OPTIONS),
        SecureStore.getItemAsync(PIN_SALT_KEY, SECURE_STORE_OPTIONS),
        SecureStore.getItemAsync(PIN_KDF_ITERATIONS_KEY, SECURE_STORE_OPTIONS),
      ])

      if (!vaultStr) {
        return false
      }

      const encryptedVault: EncryptedVault = JSON.parse(vaultStr)
      const key = base64ToBytes(storedKey)
      if (!isVaultV3(encryptedVault) && !storedSalt) {
        return false
      }
      const contents = isVaultV3(encryptedVault)
        ? decryptVaultWithVaultKey<VaultContents>(encryptedVault, key)
        : decryptVaultWithKey<VaultContents>(encryptedVault, key)
      const normalizedContents = normalizeVaultContents(contents)
      const activeWallet = normalizedContents.contents.wallets.find(
        (wallet) => wallet.id === normalizedContents.contents.activeWalletId,
      ) || normalizedContents.contents.wallets[0]

      const shouldRefreshVault = normalizedContents.changed || (
        isVaultV3(encryptedVault)
        && encryptedVault.version < CURRENT_VAULT_ENCRYPTION_VERSION
      )

      set({
        isVaultUnlocked: true,
        hasWallet: true,
        initializationError: false,
        wallets: normalizedContents.contents.wallets,
        activeWalletId: normalizedContents.contents.activeWalletId,
        wallet: activeWallet || null,
        _sessionDerivedKey: key,
        _sessionSalt: isVaultV3(encryptedVault) ? null : storedSalt,
        _sessionKdfIterations: isVaultV3(encryptedVault) ? null : parseStoredKdfIterations(storedIterationsValue),
        _sessionKeySlots: isVaultV3(encryptedVault) ? encryptedVault.keySlots || [] : null,
        _addressBookKeys: normalizedContents.keys,
      })
      scheduleUnlockSideEffects(async () => {
        if (shouldRefreshVault) {
          const refreshedVault = isVaultV3(encryptedVault)
            ? encryptVaultWithVaultKey(
              normalizedContents.contents,
              key,
              encryptedVault.keySlots || [],
            )
            : encryptVaultWithKey(
              normalizedContents.contents,
              key,
              storedSalt || '',
              parseStoredKdfIterations(storedIterationsValue),
            )
          await SecureStore.setItemAsync(VAULT_KEY, JSON.stringify(refreshedVault), SECURE_STORE_OPTIONS)
        }
        await finalizeAccountStorageAfterSuccessfulUnlock()
      })

      return true
    } catch (error) {
      console.error('Failed to unlock vault with biometric key:', error)
      return false
    }
  },

  addRecoveryPassphrase: async (currentPin: string, passphrase: string): Promise<boolean> => {
    try {
      const vaultStr = await SecureStore.getItemAsync(VAULT_KEY, SECURE_STORE_OPTIONS)
      if (!vaultStr) {
        return false
      }

      const encryptedVault: EncryptedVault = JSON.parse(vaultStr)
      if (!isVaultV3(encryptedVault)) {
        const unlocked = await get().unlockVault(currentPin)
        if (!unlocked) {
          return false
        }
        const migratedVaultStr = await SecureStore.getItemAsync(VAULT_KEY, SECURE_STORE_OPTIONS)
        if (!migratedVaultStr) {
          return false
        }
        const migratedVault: EncryptedVault = JSON.parse(migratedVaultStr)
        if (!isVaultV3(migratedVault)) {
          return false
        }
        return get().addRecoveryPassphrase(currentPin, passphrase)
      }

      const vaultKey = await unwrapVaultKeyWithPin(currentPin, encryptedVault)
      if (!vaultKey) {
        return false
      }

      const contents = decryptVaultWithVaultKey<VaultContents>(encryptedVault, vaultKey)
      const normalizedContents = normalizeVaultContents(contents)
      const recoverySlot = await createRecoveryPassphraseVaultKeySlot(passphrase, vaultKey, {
        iterations: CURRENT_PBKDF2_ITERATIONS,
      })
      const nextKeySlots = [
        ...(encryptedVault.keySlots || []).filter((slot) => slot.type !== 'recovery_passphrase'),
        recoverySlot,
      ]
      const nextVault = encryptVaultWithVaultKey(
        normalizedContents.contents,
        vaultKey,
        nextKeySlots,
      )

      await SecureStore.setItemAsync(VAULT_KEY, JSON.stringify(nextVault), SECURE_STORE_OPTIONS)
      set({
        _sessionDerivedKey: vaultKey,
        _sessionSalt: null,
        _sessionKdfIterations: null,
        _sessionKeySlots: nextKeySlots,
        _addressBookKeys: normalizedContents.keys,
      })

      return true
    } catch (error) {
      console.error('Failed to add recovery passphrase:', error)
      return false
    }
  },

  unlockVaultWithRecoveryPassphrase: async (passphrase: string, newPin: string): Promise<boolean> => {
    try {
      const vaultStr = await SecureStore.getItemAsync(VAULT_KEY, SECURE_STORE_OPTIONS)
      if (!vaultStr) {
        return false
      }

      const encryptedVault: EncryptedVault = JSON.parse(vaultStr)
      if (!isVaultV3(encryptedVault)) {
        return false
      }

      const recoverySlot = getVaultKeySlot(encryptedVault, 'recovery_passphrase')
      if (!recoverySlot) {
        return false
      }

      const vaultKey = await unwrapVaultKeyWithRecoveryPassphraseSlot(passphrase, recoverySlot)
      const contents = decryptVaultWithVaultKey<VaultContents>(encryptedVault, vaultKey)
      const normalizedContents = normalizeVaultContents(contents)
      const deviceSecret = await getOrCreateDeviceSecret()
      const pinSlot = await createPinDeviceVaultKeySlot(newPin, deviceSecret, vaultKey, {
        iterations: CURRENT_PBKDF2_ITERATIONS,
      })
      const nextKeySlots = [
        ...(encryptedVault.keySlots || []).filter((slot) => slot.type !== 'pin_device'),
        pinSlot,
      ]
      const nextVault = encryptVaultWithVaultKey(
        normalizedContents.contents,
        vaultKey,
        nextKeySlots,
      )
      const activeWallet = normalizedContents.contents.wallets.find(
        (wallet) => wallet.id === normalizedContents.contents.activeWalletId,
      ) || normalizedContents.contents.wallets[0]

      await SecureStore.setItemAsync(VAULT_KEY, JSON.stringify(nextVault), SECURE_STORE_OPTIONS)
      await clearLegacyPinMetadata()
      set({
        isVaultUnlocked: true,
        hasWallet: true,
        initializationError: false,
        wallets: normalizedContents.contents.wallets,
        activeWalletId: normalizedContents.contents.activeWalletId,
        wallet: activeWallet || null,
        _sessionDerivedKey: vaultKey,
        _sessionSalt: null,
        _sessionKdfIterations: null,
        _sessionKeySlots: nextKeySlots,
        _addressBookKeys: normalizedContents.keys,
      })
      scheduleUnlockSideEffects(finalizeAccountStorageAfterSuccessfulUnlock)

      return true
    } catch (error) {
      console.error('Failed to unlock vault with recovery passphrase:', error)
      return false
    }
  },

  lockVault: () => {
    clearIdentityCache()
    set({
      isVaultUnlocked: false,
      initializationError: false,
      wallet: null,
      wallets: [],
      activeWalletId: null,
      _sessionDerivedKey: null,
      _sessionSalt: null,
      _sessionKdfIterations: null,
      _sessionKeySlots: null,
      _addressBookKeys: {},
    })
  },

  getActiveWallet: () => {
    const { wallets, activeWalletId } = get()
    return wallets.find(w => w.id === activeWalletId) || wallets[0] || null
  },

  getActiveAddressBookKey: () => {
    const { activeWalletId, wallet, _addressBookKeys } = get()
    const walletId = activeWalletId || wallet?.id
    if (!walletId) {
      return null
    }

    const encoded = _addressBookKeys[walletId]
    return encoded ? base64ToBytes(encoded) : null
  },

  switchWallet: async (walletId: string) => {
    const { wallet: previousWallet, wallets, _sessionDerivedKey } = get()
    const wallet = wallets.find(w => w.id === walletId)
    
    if (wallet && _sessionDerivedKey) {
      clearIdentityCache()
      if (previousWallet?.address !== wallet.address) {
        await useAuthStore.getState().clearCloudSession()
        const { invalidateAuthCaches } = await import('@/services/backend/session')
        invalidateAuthCaches()
      }
      set({
        activeWalletId: walletId,
        wallet,
      })
      
      await get()._persistVault()
    }
  },

  updateWallet: async (walletId: string, updates: Partial<EXOWallet>) => {
    const { wallets, activeWalletId, _sessionDerivedKey } = get()
    
    if (!_sessionDerivedKey) {
      throw new Error('Vault not unlocked')
    }
    
    const updatedWallets = wallets.map(w => 
      w.id === walletId ? { ...w, ...updates } : w
    )
    
    const updatedWallet = walletId === activeWalletId
      ? updatedWallets.find(w => w.id === walletId) || null
      : get().wallet
    
    set({
      wallets: updatedWallets,
      wallet: updatedWallet,
    })
    
    await get()._persistVault()
  },

  changePin: async (currentPin: string, newPin: string): Promise<boolean> => {
    try {
      const vaultStr = await SecureStore.getItemAsync(VAULT_KEY, SECURE_STORE_OPTIONS)
      if (!vaultStr) {
        return false
      }

      const encryptedVault: EncryptedVault = JSON.parse(vaultStr)

      if (isVaultV3(encryptedVault)) {
        const vaultKey = await unwrapVaultKeyWithPin(currentPin, encryptedVault)
        if (!vaultKey) {
          return false
        }

        const contents = decryptVaultWithVaultKey<VaultContents>(encryptedVault, vaultKey)
        const normalizedContents = normalizeVaultContents(contents)
        const deviceSecret = await getOrCreateDeviceSecret()
        const nextPinSlot = await createPinDeviceVaultKeySlot(newPin, deviceSecret, vaultKey, {
          iterations: CURRENT_PBKDF2_ITERATIONS,
        })
        const nextKeySlots = [
          ...(encryptedVault.keySlots || []).filter((slot) => slot.type !== 'pin_device'),
          nextPinSlot,
        ]
        const nextVault = encryptVaultWithVaultKey(
          normalizedContents.contents,
          vaultKey,
          nextKeySlots,
        )

        await SecureStore.setItemAsync(VAULT_KEY, JSON.stringify(nextVault), SECURE_STORE_OPTIONS)
        await clearLegacyPinMetadata()

        const biometricEnabled = await SecureStore.getItemAsync(
          STORAGE_KEYS.BIOMETRIC_ENABLED,
          SECURE_STORE_OPTIONS
        )
        if (biometricEnabled === 'true') {
          try {
            await storeBiometricUnlockKey(vaultKey, translate('Authenticate to refresh biometric unlock'))
          } catch (error) {
            console.warn('Failed to refresh biometric unlock secret after PIN change:', error)
            await clearBiometricUnlock()
          }
        }

        set({
          _sessionDerivedKey: vaultKey,
          _sessionSalt: null,
          _sessionKdfIterations: null,
          _sessionKeySlots: nextKeySlots,
          _addressBookKeys: normalizedContents.keys,
        })

        return true
      }

      const [storedHash, storedSalt, storedIterationsValue] = await Promise.all([
        SecureStore.getItemAsync(PIN_HASH_KEY, SECURE_STORE_OPTIONS),
        SecureStore.getItemAsync(PIN_SALT_KEY, SECURE_STORE_OPTIONS),
        SecureStore.getItemAsync(PIN_KDF_ITERATIONS_KEY, SECURE_STORE_OPTIONS),
      ])
      
      if (!storedHash || !storedSalt) {
        return false
      }

      const storedIterations = parseStoredKdfIterations(storedIterationsValue)
      
      const { valid, key } = await verifyPinAndGetKeyAsync(
        currentPin,
        storedHash,
        storedSalt,
        storedIterations
      )
      if (!valid || !key) {
        return false
      }

      const contents = decryptVaultWithKey<VaultContents>(encryptedVault, key)
      const normalizedContents = normalizeVaultContents(contents)

      const migratedSecurity = await migrateVaultToCurrentEnvelope(newPin, normalizedContents.contents)
      if (!migratedSecurity) {
        return false
      }

      const biometricEnabled = await SecureStore.getItemAsync(
        STORAGE_KEYS.BIOMETRIC_ENABLED,
        SECURE_STORE_OPTIONS
      )
      if (biometricEnabled === 'true') {
        try {
          await storeBiometricUnlockKey(migratedSecurity.vaultKey, translate('Authenticate to refresh biometric unlock'))
        } catch (error) {
          console.warn('Failed to refresh biometric unlock secret after PIN change:', error)
          await clearBiometricUnlock()
        }
      }

      set({
        _sessionDerivedKey: migratedSecurity.vaultKey,
        _sessionSalt: null,
        _sessionKdfIterations: null,
        _sessionKeySlots: migratedSecurity.keySlots,
        _addressBookKeys: normalizedContents.keys,
      })
      
      return true
    } catch (error) {
      console.error('Failed to change PIN:', error)
      return false
    }
  },

  _persistVault: async () => {
    const {
      wallets,
      activeWalletId,
      _sessionDerivedKey,
      _sessionSalt,
      _sessionKdfIterations,
      _sessionKeySlots,
      _addressBookKeys,
    } = get()
    
    if (!_sessionDerivedKey) {
      console.error('Cannot persist vault: no cached key')
      return
    }
    
    const contents: VaultContents = {
      wallets,
      activeWalletId,
      version: 3,
      addressBookKeys: _addressBookKeys,
    }

    const encryptedVault = _sessionKeySlots
      ? encryptVaultWithVaultKey(contents, _sessionDerivedKey, _sessionKeySlots)
      : encryptVaultWithKey(
        contents,
        _sessionDerivedKey,
        _sessionSalt || '',
        _sessionKdfIterations || CURRENT_PBKDF2_ITERATIONS,
      )
    await SecureStore.setItemAsync(VAULT_KEY, JSON.stringify(encryptedVault), SECURE_STORE_OPTIONS)
  },
}))
