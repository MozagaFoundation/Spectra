/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import { deriveKeyAndHashAsync, verifyPinAsync } from '@spectra/identity-vault'
import { SECURE_STORE_OPTIONS, VAULT_SECURITY_KEYS } from '@/lib/constants'

const LEGACY_DURESS_PIN_KEY = VAULT_SECURITY_KEYS.DURESS_PIN
const DURESS_PIN_HASH_KEY = VAULT_SECURITY_KEYS.DURESS_PIN_HASH
const DURESS_PIN_SALT_KEY = VAULT_SECURITY_KEYS.DURESS_PIN_SALT
const DURESS_PIN_KDF_ITERATIONS_KEY = VAULT_SECURITY_KEYS.DURESS_PIN_KDF_ITERATIONS
const DURESS_ENABLED_KEY = VAULT_SECURITY_KEYS.DURESS_ENABLED
const LEGACY_DURESS_PIN_ITERATIONS = 100000

function parseDuressIterations(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : LEGACY_DURESS_PIN_ITERATIONS
}

async function migrateLegacyDuressPinIfNeeded(): Promise<void> {
  const [legacyPin, storedHash, storedSalt, storedIterations] = await Promise.all([
    SecureStore.getItemAsync(LEGACY_DURESS_PIN_KEY, SECURE_STORE_OPTIONS),
    SecureStore.getItemAsync(DURESS_PIN_HASH_KEY, SECURE_STORE_OPTIONS),
    SecureStore.getItemAsync(DURESS_PIN_SALT_KEY, SECURE_STORE_OPTIONS),
    SecureStore.getItemAsync(DURESS_PIN_KDF_ITERATIONS_KEY, SECURE_STORE_OPTIONS),
  ])

  if (storedHash && storedSalt && storedIterations) {
    return
  }

  if (storedHash && storedSalt && !storedIterations) {
    await SecureStore.setItemAsync(
      DURESS_PIN_KDF_ITERATIONS_KEY,
      String(LEGACY_DURESS_PIN_ITERATIONS),
      SECURE_STORE_OPTIONS
    )
  }

  if (!legacyPin) {
    return
  }

  const { pinHash, salt, iterations } = await deriveKeyAndHashAsync(legacyPin)
  await SecureStore.setItemAsync(DURESS_PIN_HASH_KEY, pinHash, SECURE_STORE_OPTIONS)
  await SecureStore.setItemAsync(DURESS_PIN_SALT_KEY, salt, SECURE_STORE_OPTIONS)
  await SecureStore.setItemAsync(
    DURESS_PIN_KDF_ITERATIONS_KEY,
    String(iterations),
    SECURE_STORE_OPTIONS
  )
  await SecureStore.setItemAsync(DURESS_ENABLED_KEY, 'true', SECURE_STORE_OPTIONS)
  await SecureStore.deleteItemAsync(LEGACY_DURESS_PIN_KEY, SECURE_STORE_OPTIONS)
}

export async function loadDuressPinState(): Promise<{
  enabled: boolean
  hasDuressPin: boolean
}> {
  await migrateLegacyDuressPinIfNeeded()

  const [enabledValue, storedHash, storedSalt] = await Promise.all([
    SecureStore.getItemAsync(DURESS_ENABLED_KEY, SECURE_STORE_OPTIONS),
    SecureStore.getItemAsync(DURESS_PIN_HASH_KEY, SECURE_STORE_OPTIONS),
    SecureStore.getItemAsync(DURESS_PIN_SALT_KEY, SECURE_STORE_OPTIONS),
  ])

  return {
    enabled: enabledValue === 'true' && Boolean(storedHash && storedSalt),
    hasDuressPin: Boolean(storedHash && storedSalt),
  }
}

export async function saveDuressPin(pin: string): Promise<void> {
  const { pinHash, salt, iterations } = await deriveKeyAndHashAsync(pin)

  await SecureStore.setItemAsync(DURESS_PIN_HASH_KEY, pinHash, SECURE_STORE_OPTIONS)
  await SecureStore.setItemAsync(DURESS_PIN_SALT_KEY, salt, SECURE_STORE_OPTIONS)
  await SecureStore.setItemAsync(
    DURESS_PIN_KDF_ITERATIONS_KEY,
    String(iterations),
    SECURE_STORE_OPTIONS
  )
  await SecureStore.setItemAsync(DURESS_ENABLED_KEY, 'true', SECURE_STORE_OPTIONS)
  await SecureStore.deleteItemAsync(LEGACY_DURESS_PIN_KEY, SECURE_STORE_OPTIONS)
}

export async function setDuressProtectionEnabled(enabled: boolean): Promise<void> {
  if (!enabled) {
    await SecureStore.deleteItemAsync(DURESS_ENABLED_KEY, SECURE_STORE_OPTIONS)
    return
  }

  const { hasDuressPin } = await loadDuressPinState()
  if (!hasDuressPin) {
    throw new Error('Duress PIN is not configured')
  }

  await SecureStore.setItemAsync(DURESS_ENABLED_KEY, 'true', SECURE_STORE_OPTIONS)
}

export async function clearDuressPin(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(LEGACY_DURESS_PIN_KEY, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(DURESS_PIN_HASH_KEY, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(DURESS_PIN_SALT_KEY, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(DURESS_PIN_KDF_ITERATIONS_KEY, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(DURESS_ENABLED_KEY, SECURE_STORE_OPTIONS),
  ])
}

export async function verifyDuressPin(pin: string): Promise<boolean> {
  await migrateLegacyDuressPinIfNeeded()

  const [enabledValue, storedHash, storedSalt, storedIterationsValue] = await Promise.all([
    SecureStore.getItemAsync(DURESS_ENABLED_KEY, SECURE_STORE_OPTIONS),
    SecureStore.getItemAsync(DURESS_PIN_HASH_KEY, SECURE_STORE_OPTIONS),
    SecureStore.getItemAsync(DURESS_PIN_SALT_KEY, SECURE_STORE_OPTIONS),
    SecureStore.getItemAsync(DURESS_PIN_KDF_ITERATIONS_KEY, SECURE_STORE_OPTIONS),
  ])

  if (enabledValue !== 'true' || !storedHash || !storedSalt) {
    return false
  }

  return verifyPinAsync(pin, storedHash, storedSalt, parseDuressIterations(storedIterationsValue))
}
