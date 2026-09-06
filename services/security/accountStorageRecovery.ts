/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import {
  BIOMETRIC_SECURE_STORE_OPTIONS,
  SECURE_STORE_OPTIONS,
  STORAGE_KEYS,
  VAULT_SECURITY_KEYS,
} from '@/lib/constants'
import { SENSITIVE_SECURE_STORE_KEYS } from './persistedSensitiveData'

type SecureStoreOptions = Parameters<typeof SecureStore.getItemAsync>[1]

export type AccountStorageNamespaceId =
  | 'current'
  | 'legacy-com-mozaga-exo'
  | 'legacy-com-otauris-exo'

type AccountStorageNamespace = {
  id: AccountStorageNamespaceId
  options: SecureStoreOptions
  biometricOptions: SecureStoreOptions
  legacy: boolean
}

const CURRENT_NAMESPACE: AccountStorageNamespace = {
  id: 'current',
  options: SECURE_STORE_OPTIONS,
  biometricOptions: BIOMETRIC_SECURE_STORE_OPTIONS,
  legacy: false,
}

const LEGACY_NAMESPACES: AccountStorageNamespace[] = [
  {
    id: 'legacy-com-mozaga-exo',
    options: { keychainService: 'com.mozaga.exo' },
    biometricOptions: { keychainService: 'com.mozaga.exo.biometric', requireAuthentication: true },
    legacy: true,
  },
  {
    id: 'legacy-com-otauris-exo',
    options: { keychainService: 'com.otauris.exo' },
    biometricOptions: { keychainService: 'com.otauris.exo.biometric', requireAuthentication: true },
    legacy: true,
  },
]

const WALLET_MARKER_KEYS = [
  STORAGE_KEYS.HAS_WALLET,
  STORAGE_KEYS.VAULT,
  VAULT_SECURITY_KEYS.PIN_HASH,
] as const
const RECOVERY_SOURCE_KEY = 'spectra_account_recovery_source_v1'

const RECOVERY_STAGE_KEYS = [
  STORAGE_KEYS.VAULT,
  STORAGE_KEYS.HAS_WALLET,
  VAULT_SECURITY_KEYS.PIN_HASH,
  VAULT_SECURITY_KEYS.PIN_SALT,
  VAULT_SECURITY_KEYS.PIN_KDF_ITERATIONS,
  VAULT_SECURITY_KEYS.DEVICE_SECRET,
  VAULT_SECURITY_KEYS.DURESS_PIN,
  VAULT_SECURITY_KEYS.DURESS_PIN_HASH,
  VAULT_SECURITY_KEYS.DURESS_PIN_SALT,
  VAULT_SECURITY_KEYS.DURESS_PIN_KDF_ITERATIONS,
  VAULT_SECURITY_KEYS.DURESS_ENABLED,
  VAULT_SECURITY_KEYS.FAIL_WIPE_ENABLED,
  VAULT_SECURITY_KEYS.FAIL_WIPE_ATTEMPTS,
  VAULT_SECURITY_KEYS.PIN_ATTEMPTS,
  VAULT_SECURITY_KEYS.PIN_LOCKOUT_UNTIL,
] as const
const RECOVERY_STAGE_KEY_SET = new Set<string>(RECOVERY_STAGE_KEYS)
const RECOVERY_POST_UNLOCK_COPY_KEYS = SENSITIVE_SECURE_STORE_KEYS.filter((key) => (
  !RECOVERY_STAGE_KEY_SET.has(key)
  && key !== VAULT_SECURITY_KEYS.BIOMETRIC_PIN
  && key !== STORAGE_KEYS.BIOMETRIC_ENABLED
))

export type AccountStoragePresence = {
  hasWallet: boolean
  currentHasWallet: boolean
  hasConflict: boolean
  legacyNamespaceIds: AccountStorageNamespaceId[]
  preferredNamespaceId: AccountStorageNamespaceId | null
}

async function namespaceHasAnyKey(
  namespace: AccountStorageNamespace,
  keys: readonly string[],
): Promise<boolean> {
  const values = await Promise.all(keys.map((key) => (
    SecureStore.getItemAsync(key, namespace.options)
  )))

  return values.some((value) => value != null)
}

async function namespaceHasWallet(namespace: AccountStorageNamespace): Promise<boolean> {
  return namespaceHasAnyKey(namespace, WALLET_MARKER_KEYS)
}

async function getWalletNamespaces(): Promise<{
  currentHasWallet: boolean
  legacyNamespaces: AccountStorageNamespace[]
}> {
  const [currentHasWallet, ...legacyResults] = await Promise.all([
    namespaceHasWallet(CURRENT_NAMESPACE),
    ...LEGACY_NAMESPACES.map((namespace) => namespaceHasWallet(namespace)),
  ])

  return {
    currentHasWallet,
    legacyNamespaces: LEGACY_NAMESPACES.filter((_, index) => legacyResults[index]),
  }
}

export async function detectAccountStoragePresence(): Promise<AccountStoragePresence> {
  const { currentHasWallet, legacyNamespaces } = await getWalletNamespaces()
  const hasWallet = currentHasWallet || legacyNamespaces.length > 0

  return {
    hasWallet,
    currentHasWallet,
    hasConflict: currentHasWallet && legacyNamespaces.length > 0,
    legacyNamespaceIds: legacyNamespaces.map((namespace) => namespace.id),
    preferredNamespaceId: currentHasWallet
      ? CURRENT_NAMESPACE.id
      : legacyNamespaces[0]?.id ?? null,
  }
}

export async function hasAnyAccountStorageWallet(): Promise<boolean> {
  return (await detectAccountStoragePresence()).hasWallet
}

async function copyKeysToCurrent(
  source: AccountStorageNamespace,
  keys: readonly string[],
): Promise<void> {
  const entries = await Promise.all(keys.map(async (key) => ({
    key,
    value: await SecureStore.getItemAsync(key, source.options),
  })))

  await Promise.all(entries
    .filter((entry): entry is { key: string; value: string } => entry.value != null)
    .map((entry) => SecureStore.setItemAsync(entry.key, entry.value, CURRENT_NAMESPACE.options)))
}

async function stageNamespaceForUnlock(source: AccountStorageNamespace): Promise<void> {
  await copyKeysToCurrent(source, RECOVERY_STAGE_KEYS)
  await Promise.all([
    SecureStore.setItemAsync(STORAGE_KEYS.HAS_WALLET, 'true', CURRENT_NAMESPACE.options),
    SecureStore.setItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED, 'false', CURRENT_NAMESPACE.options),
  ])
}

export async function stageLegacyAccountStorageForUnlock(): Promise<AccountStoragePresence> {
  const { currentHasWallet, legacyNamespaces } = await getWalletNamespaces()
  if (currentHasWallet || legacyNamespaces.length === 0) {
    return detectAccountStoragePresence()
  }

  await stageNamespaceForUnlock(legacyNamespaces[0])
  await SecureStore.setItemAsync(RECOVERY_SOURCE_KEY, legacyNamespaces[0].id, CURRENT_NAMESPACE.options)
  return detectAccountStoragePresence()
}

async function clearNamespace(namespace: AccountStorageNamespace): Promise<void> {
  await Promise.allSettled([
    ...SENSITIVE_SECURE_STORE_KEYS.map((key) => (
      SecureStore.deleteItemAsync(key, namespace.options)
    )),
    SecureStore.deleteItemAsync(VAULT_SECURITY_KEYS.BIOMETRIC_PIN, namespace.biometricOptions),
  ])
}

export async function clearLegacyAccountStorage(): Promise<void> {
  await Promise.all(LEGACY_NAMESPACES.map((namespace) => clearNamespace(namespace)))
  await SecureStore.deleteItemAsync(RECOVERY_SOURCE_KEY, CURRENT_NAMESPACE.options)
}

export async function finalizeAccountStorageAfterUnlock(): Promise<void> {
  const stagedNamespaceId = await SecureStore.getItemAsync(RECOVERY_SOURCE_KEY, CURRENT_NAMESPACE.options)
  const stagedNamespace = LEGACY_NAMESPACES.find((namespace) => namespace.id === stagedNamespaceId)

  if (stagedNamespace) {
    await copyKeysToCurrent(stagedNamespace, RECOVERY_POST_UNLOCK_COPY_KEYS)
  }

  await Promise.all(LEGACY_NAMESPACES.map((namespace) => clearNamespace(namespace)))
  await SecureStore.deleteItemAsync(RECOVERY_SOURCE_KEY, CURRENT_NAMESPACE.options)
}
