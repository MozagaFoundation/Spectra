/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import { SECURE_STORE_OPTIONS, VAULT_SECURITY_KEYS } from '@/lib/constants'

const AUTO_LOCK_KEY = VAULT_SECURITY_KEYS.AUTO_LOCK
const AUTO_LOCK_TIME_KEY = VAULT_SECURITY_KEYS.AUTO_LOCK_TIME
const DEFAULT_AUTO_LOCK_TIME = '5 minutes'

let cachedAutoLock: { enabled: boolean; timeoutMs: number } | null = null

function cacheAutoLock(enabled: boolean, autoLockTime: string): void {
  cachedAutoLock = {
    enabled,
    timeoutMs: parseAutoLockDuration(autoLockTime),
  }
}

export function peekAutoLockSettings(): { enabled: boolean; timeoutMs: number } | null {
  return cachedAutoLock
}

function parseAutoLockDuration(value: string): number {
  switch (value) {
    case 'Immediately':
      return 0
    case '1 minute':
      return 60_000
    case '5 minutes':
      return 5 * 60_000
    case '15 minutes':
      return 15 * 60_000
    case '1 hour':
      return 60 * 60_000
    default:
      return 5 * 60_000
  }
}

export async function readAutoLockPreference(): Promise<{
  enabled: boolean
  autoLockTime: string
  timeoutMs: number
}> {
  const [enabled, autoLockTime] = await Promise.all([
    SecureStore.getItemAsync(AUTO_LOCK_KEY, SECURE_STORE_OPTIONS),
    SecureStore.getItemAsync(AUTO_LOCK_TIME_KEY, SECURE_STORE_OPTIONS),
  ])
  const effectiveAutoLockTime = autoLockTime || DEFAULT_AUTO_LOCK_TIME
  const parsedEnabled = enabled !== 'false'
  cacheAutoLock(parsedEnabled, effectiveAutoLockTime)

  return {
    enabled: parsedEnabled,
    autoLockTime: effectiveAutoLockTime,
    timeoutMs: parseAutoLockDuration(effectiveAutoLockTime),
  }
}

export async function setAutoLockEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(AUTO_LOCK_KEY, String(enabled), SECURE_STORE_OPTIONS)
  cachedAutoLock = {
    enabled,
    timeoutMs: cachedAutoLock?.timeoutMs ?? parseAutoLockDuration(DEFAULT_AUTO_LOCK_TIME),
  }
}

export async function setAutoLockTime(autoLockTime: string): Promise<void> {
  await SecureStore.setItemAsync(AUTO_LOCK_TIME_KEY, autoLockTime, SECURE_STORE_OPTIONS)
  cachedAutoLock = {
    enabled: cachedAutoLock?.enabled ?? true,
    timeoutMs: parseAutoLockDuration(autoLockTime),
  }
}
