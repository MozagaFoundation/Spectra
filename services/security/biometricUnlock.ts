/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'
import * as LocalAuthentication from 'expo-local-authentication'

import { bytesToBase64 } from '@spectra/identity-vault'
import {
  BIOMETRIC_SECURE_STORE_OPTIONS,
  SECURE_STORE_OPTIONS,
  STORAGE_KEYS,
  VAULT_SECURITY_KEYS,
} from '@/lib/constants'
import { beginNativeAuthPrompt } from './nativeAuthState'

const BIOMETRIC_PIN_KEY = VAULT_SECURITY_KEYS.BIOMETRIC_PIN
const LEGACY_BIOMETRIC_SECURE_STORE_OPTIONS = {
  ...SECURE_STORE_OPTIONS,
  requireAuthentication: true,
} as const

export async function getBiometricUnlockState(): Promise<{
  configured: boolean
  enabled: boolean
}> {
  const enabledValue = await SecureStore.getItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED, SECURE_STORE_OPTIONS)

  return {
    configured: enabledValue === 'true',
    enabled: enabledValue === 'true',
  }
}

export async function readBiometricUnlockKey(authenticationPrompt: string): Promise<string | null> {
  const endNativeAuth = beginNativeAuthPrompt()
  try {
    return await SecureStore.getItemAsync(BIOMETRIC_PIN_KEY, {
      ...BIOMETRIC_SECURE_STORE_OPTIONS,
      authenticationPrompt,
    })
  } finally {
    endNativeAuth()
  }
}

export async function storeBiometricUnlockKey(
  key: Uint8Array,
  authenticationPrompt: string
): Promise<void> {
  const endNativeAuth = beginNativeAuthPrompt()
  try {
    await SecureStore.setItemAsync(
      BIOMETRIC_PIN_KEY,
      bytesToBase64(key),
      {
        ...BIOMETRIC_SECURE_STORE_OPTIONS,
        authenticationPrompt,
      }
    )
  } finally {
    endNativeAuth()
  }

  await Promise.all([
    SecureStore.setItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED, 'true', SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(BIOMETRIC_PIN_KEY, LEGACY_BIOMETRIC_SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(BIOMETRIC_PIN_KEY, SECURE_STORE_OPTIONS),
  ])
}

export async function readLegacyBiometricUnlockSecret(authenticationPrompt: string): Promise<string | null> {
  const endNativeAuth = beginNativeAuthPrompt()
  let authentication: Awaited<ReturnType<typeof LocalAuthentication.authenticateAsync>>
  try {
    authentication = await LocalAuthentication.authenticateAsync({
      promptMessage: authenticationPrompt,
    })
  } finally {
    endNativeAuth()
  }

  if (!authentication.success) {
    return null
  }

  return SecureStore.getItemAsync(BIOMETRIC_PIN_KEY, SECURE_STORE_OPTIONS)
}

export async function clearBiometricUnlock(): Promise<void> {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(BIOMETRIC_PIN_KEY, BIOMETRIC_SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(BIOMETRIC_PIN_KEY, LEGACY_BIOMETRIC_SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(BIOMETRIC_PIN_KEY, SECURE_STORE_OPTIONS),
    SecureStore.setItemAsync(STORAGE_KEYS.BIOMETRIC_ENABLED, 'false', SECURE_STORE_OPTIONS),
  ])
}
