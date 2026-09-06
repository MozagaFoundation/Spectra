/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import {
  SECURE_STORE_OPTIONS,
  SECURITY_CONFIG,
  VAULT_SECURITY_KEYS,
} from '@/lib/constants'
import {
  parseFailWipeMaxAttempts,
  readFailWipePreference,
} from './failWipePreference'

const PIN_ATTEMPTS_KEY = VAULT_SECURITY_KEYS.PIN_ATTEMPTS
const PIN_LOCKOUT_UNTIL_KEY = VAULT_SECURITY_KEYS.PIN_LOCKOUT_UNTIL

export type GuardedPinResult =
  | { status: 'valid' }
  | { status: 'invalid'; remainingAttempts: number }
  | { status: 'locked'; lockoutUntil: number }
  | { status: 'wipe_required' }

export function formatGuardedPinLockoutMessage(
  lockoutUntil: number,
  translate: (key: string, options?: Record<string, unknown>) => string,
): string {
  const remainingMs = Math.max(lockoutUntil - Date.now(), 0)
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  return translate('lockout.message', { ns: 'auth', count: remainingMinutes })
}

function parseStoredNumber(value: string | null, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

async function getPinAttemptPolicy(): Promise<{
  attempts: number
  failWipeEnabled: boolean
  failWipeMax: number
  lockoutUntil: number | null
}> {
  const [
    savedAttempts,
    failWipePreference,
    savedLockoutUntil,
  ] = await Promise.all([
    SecureStore.getItemAsync(PIN_ATTEMPTS_KEY, SECURE_STORE_OPTIONS),
    readFailWipePreference(),
    SecureStore.getItemAsync(PIN_LOCKOUT_UNTIL_KEY, SECURE_STORE_OPTIONS),
  ])

  const parsedLockoutUntil = savedLockoutUntil
    ? parseStoredNumber(savedLockoutUntil, 0)
    : 0

  return {
    attempts: parseStoredNumber(savedAttempts, 0),
    failWipeEnabled: failWipePreference.enabled,
    failWipeMax: parseFailWipeMaxAttempts(failWipePreference.attempts),
    lockoutUntil: parsedLockoutUntil > 0 ? parsedLockoutUntil : null,
  }
}

export async function resetGuardedPinAttempts(): Promise<void> {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(PIN_ATTEMPTS_KEY, SECURE_STORE_OPTIONS),
    SecureStore.deleteItemAsync(PIN_LOCKOUT_UNTIL_KEY, SECURE_STORE_OPTIONS),
  ])
}

export async function verifyPinWithAttemptGuard(
  pin: string,
  verifyPin: (pin: string) => Promise<boolean>,
): Promise<GuardedPinResult> {
  const policy = await getPinAttemptPolicy()

  if (policy.lockoutUntil && policy.lockoutUntil > Date.now()) {
    return { status: 'locked', lockoutUntil: policy.lockoutUntil }
  }

  if (policy.lockoutUntil && policy.lockoutUntil <= Date.now()) {
    await SecureStore.deleteItemAsync(PIN_LOCKOUT_UNTIL_KEY, SECURE_STORE_OPTIONS)
  }

  const valid = await verifyPin(pin)
  if (valid) {
    await resetGuardedPinAttempts()
    return { status: 'valid' }
  }

  const nextAttempts = policy.attempts + 1
  await SecureStore.setItemAsync(PIN_ATTEMPTS_KEY, String(nextAttempts), SECURE_STORE_OPTIONS)

  if (policy.failWipeEnabled && nextAttempts >= policy.failWipeMax) {
    return { status: 'wipe_required' }
  }

  if (nextAttempts >= SECURITY_CONFIG.MAX_PIN_ATTEMPTS) {
    const lockoutUntil = Date.now() + SECURITY_CONFIG.LOCKOUT_DURATION
    await SecureStore.setItemAsync(
      PIN_LOCKOUT_UNTIL_KEY,
      String(lockoutUntil),
      SECURE_STORE_OPTIONS,
    )
    return { status: 'locked', lockoutUntil }
  }

  return {
    status: 'invalid',
    remainingAttempts: SECURITY_CONFIG.MAX_PIN_ATTEMPTS - nextAttempts,
  }
}
