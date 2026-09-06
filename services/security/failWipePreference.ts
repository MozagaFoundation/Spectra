/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import { SECURE_STORE_OPTIONS, VAULT_SECURITY_KEYS } from '@/lib/constants'

const FAIL_WIPE_ENABLED_KEY = VAULT_SECURITY_KEYS.FAIL_WIPE_ENABLED
const FAIL_WIPE_ATTEMPTS_KEY = VAULT_SECURITY_KEYS.FAIL_WIPE_ATTEMPTS
const DEFAULT_FAIL_WIPE_ATTEMPTS = '10'

export interface FailWipePreference {
  enabled: boolean
  attempts: string
}

function parseAttempts(value: string | null, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export function parseFailWipeMaxAttempts(value: string | null): number {
  return parseAttempts(value, Number.parseInt(DEFAULT_FAIL_WIPE_ATTEMPTS, 10))
    || Number.parseInt(DEFAULT_FAIL_WIPE_ATTEMPTS, 10)
}

export async function readFailWipePreference(): Promise<FailWipePreference> {
  const [enabled, attempts] = await Promise.all([
    SecureStore.getItemAsync(FAIL_WIPE_ENABLED_KEY, SECURE_STORE_OPTIONS),
    SecureStore.getItemAsync(FAIL_WIPE_ATTEMPTS_KEY, SECURE_STORE_OPTIONS),
  ])

  return {
    enabled: enabled === 'true',
    attempts: attempts || DEFAULT_FAIL_WIPE_ATTEMPTS,
  }
}

export async function setFailWipeEnabled(enabled: boolean, attempts?: string): Promise<void> {
  await SecureStore.setItemAsync(FAIL_WIPE_ENABLED_KEY, String(enabled), SECURE_STORE_OPTIONS)
  if (enabled && attempts) {
    await setFailWipeAttempts(attempts)
  }
}

export async function setFailWipeAttempts(attempts: string): Promise<void> {
  await SecureStore.setItemAsync(FAIL_WIPE_ATTEMPTS_KEY, attempts, SECURE_STORE_OPTIONS)
}

export async function setFailWipePreference(preference: FailWipePreference): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(FAIL_WIPE_ENABLED_KEY, String(preference.enabled), SECURE_STORE_OPTIONS),
    setFailWipeAttempts(preference.attempts),
  ])
}
