/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import {
  BIOMETRIC_SECURE_STORE_OPTIONS,
  SCREENSHOT_PROTECTION_KEY,
  SECURE_STORE_OPTIONS,
  STORAGE_KEYS,
  VAULT_SECURITY_KEYS,
} from '@/lib/constants'
import { TOR_STORAGE_KEYS } from '@/services/tor/torConstants'
import { mapWithConcurrency } from '@/lib/utils'

const LEGACY_BIOMETRIC_SECURE_STORE_OPTIONS = {
  ...SECURE_STORE_OPTIONS,
  requireAuthentication: true,
} as const
const ACCESSIBILITY_HARDENING_MARKER = 'exo_sensitive_accessibility_hardened_v1'
const ACCESSIBILITY_HARDENING_CONCURRENCY = 4
const TOR_SECURE_STORE_KEYS = [
  TOR_STORAGE_KEYS.ENABLED,
  TOR_STORAGE_KEYS.BRIDGE_CONFIG,
  TOR_STORAGE_KEYS.BRIDGES,
  TOR_STORAGE_KEYS.BRIDGE_TYPE,
] as const

export const SENSITIVE_SECURE_STORE_KEYS = [
  STORAGE_KEYS.VAULT,
  STORAGE_KEYS.HAS_WALLET,
  STORAGE_KEYS.SESSION,
  STORAGE_KEYS.SPECTRE_MODE,
  STORAGE_KEYS.SPECTRE_SNAPSHOT,
  STORAGE_KEYS.SPECTRE_WALLET_ID,
  STORAGE_KEYS.SPECTRE_ACCOUNT_MODE,
  STORAGE_KEYS.PENDING_SPECTRE_REMOTE_ACTIVATION,
  STORAGE_KEYS.PENDING_SPECTRE_BLIND_TOKEN,
  STORAGE_KEYS.PENDING_ACCOUNT_DELETION,
  STORAGE_KEYS.ONE_TIME_CONTACT_CARD,
  STORAGE_KEYS.SPECTRE_ACCESS_STATE,
  'exo_tor_entitlement_state',
  STORAGE_KEYS.BIOMETRIC_ENABLED,
  VAULT_SECURITY_KEYS.PIN_HASH,
  VAULT_SECURITY_KEYS.PIN_SALT,
  VAULT_SECURITY_KEYS.PIN_KDF_ITERATIONS,
  VAULT_SECURITY_KEYS.DEVICE_SECRET,
  VAULT_SECURITY_KEYS.BIOMETRIC_PIN,
  VAULT_SECURITY_KEYS.DURESS_PIN,
  VAULT_SECURITY_KEYS.DURESS_PIN_HASH,
  VAULT_SECURITY_KEYS.DURESS_PIN_SALT,
  VAULT_SECURITY_KEYS.DURESS_PIN_KDF_ITERATIONS,
  VAULT_SECURITY_KEYS.DURESS_ENABLED,
  VAULT_SECURITY_KEYS.FAIL_WIPE_ENABLED,
  VAULT_SECURITY_KEYS.FAIL_WIPE_ATTEMPTS,
  VAULT_SECURITY_KEYS.PIN_ATTEMPTS,
  VAULT_SECURITY_KEYS.PIN_LOCKOUT_UNTIL,
  VAULT_SECURITY_KEYS.AUTO_LOCK,
  VAULT_SECURITY_KEYS.AUTO_LOCK_TIME,
  VAULT_SECURITY_KEYS.HIDE_CONTENT,
  VAULT_SECURITY_KEYS.DELIVERY_RECEIPTS,
  VAULT_SECURITY_KEYS.READ_RECEIPTS,
  VAULT_SECURITY_KEYS.CLEAR_IMAGE_CACHE_ON_LOCK,
  VAULT_SECURITY_KEYS.MESSAGE_CACHE_PRIVACY_MODE,
  VAULT_SECURITY_KEYS.LOCAL_MESSAGE_CONTENT_KEY,
  VAULT_SECURITY_KEYS.LOCAL_CACHE_ROOT_KEY,
  VAULT_SECURITY_KEYS.NOTIFICATION_SCOPE_REGISTRY,
  TOR_STORAGE_KEYS.ENABLED,
  TOR_STORAGE_KEYS.BRIDGE_CONFIG,
  TOR_STORAGE_KEYS.BRIDGES,
  TOR_STORAGE_KEYS.BRIDGE_TYPE,
  SCREENSHOT_PROTECTION_KEY,
] as const

export async function hasPersistedSensitiveSecureStoreData(): Promise<boolean> {
  const values = await Promise.all(
    SENSITIVE_SECURE_STORE_KEYS.map((key) =>
      SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS)
    )
  )

  return values.some((value) => value != null)
}

export async function hardenSensitiveSecureStoreAccessibility(): Promise<void> {
  if (await SecureStore.getItemAsync(ACCESSIBILITY_HARDENING_MARKER, SECURE_STORE_OPTIONS) === 'true') {
    return
  }
  const keys = SENSITIVE_SECURE_STORE_KEYS.filter(
    (key) => key !== VAULT_SECURITY_KEYS.BIOMETRIC_PIN,
  )
  const failures = (await mapWithConcurrency(
    keys,
    ACCESSIBILITY_HARDENING_CONCURRENCY,
    async (key): Promise<unknown | null> => {
      try {
        const value = await SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS)
        if (value != null) {
          await SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS)
        }
        return null
      } catch (error) {
        return error
      }
    }
  )).filter((error) => error !== null)
  if (failures.length > 0) {
    throw new Error(`Failed to harden ${failures.length} sensitive SecureStore entries`)
  }
  await SecureStore.setItemAsync(ACCESSIBILITY_HARDENING_MARKER, 'true', SECURE_STORE_OPTIONS)
}

export async function clearPersistedSensitiveSecureStoreData(
  options: {
    preserveTorSettings?: boolean
    preserveAccountDeletion?: boolean
  } = {},
): Promise<void> {
  const keys = SENSITIVE_SECURE_STORE_KEYS.filter((key) => {
    if (
      options.preserveTorSettings
      && TOR_SECURE_STORE_KEYS.includes(key as typeof TOR_SECURE_STORE_KEYS[number])
    ) {
      return false
    }
    return !(options.preserveAccountDeletion && key === STORAGE_KEYS.PENDING_ACCOUNT_DELETION)
  })
  const deleteResults = await Promise.allSettled(
    keys.map((key) =>
      SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS)
    )
  )

  await Promise.allSettled([
    SecureStore.deleteItemAsync(ACCESSIBILITY_HARDENING_MARKER, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(VAULT_SECURITY_KEYS.BIOMETRIC_PIN, BIOMETRIC_SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(VAULT_SECURITY_KEYS.BIOMETRIC_PIN, LEGACY_BIOMETRIC_SECURE_STORE_OPTIONS),
  ])

  const failures = deleteResults.filter((result): result is PromiseRejectedResult =>
    result.status === 'rejected'
  )
  if (failures.length > 0) {
    throw new Error(`Failed to delete ${failures.length} sensitive SecureStore entries`)
  }
}

export async function hasPendingAccountDeletionOperation(): Promise<boolean> {
  return (
    await SecureStore.getItemAsync(
      STORAGE_KEYS.PENDING_ACCOUNT_DELETION,
      SECURE_STORE_OPTIONS,
    )
  ) != null
}

export async function clearPersistedTorSecureStoreData(): Promise<void> {
  const results = await Promise.allSettled(
    TOR_SECURE_STORE_KEYS.map((key) => SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS)),
  )
  const failures = results.filter((result): result is PromiseRejectedResult =>
    result.status === 'rejected'
  )
  if (failures.length > 0) {
    throw new Error(`Failed to delete ${failures.length} Tor SecureStore entries`)
  }
}
