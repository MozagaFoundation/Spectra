/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockSecureStore = vi.hoisted(() => ({
  values: new Map<string, string>(),
  deleteItemAsync: vi.fn(async (key: string) => {
    mockSecureStore.values.delete(key)
  }),
  getItemAsync: vi.fn(async (key: string) => mockSecureStore.values.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockSecureStore.values.set(key, value)
  }),
}))

vi.mock('expo-secure-store', () => mockSecureStore)

const { SECURITY_CONFIG, VAULT_SECURITY_KEYS } = await import('@/lib/constants')
const {
  formatGuardedPinLockoutMessage,
  resetGuardedPinAttempts,
  verifyPinWithAttemptGuard,
} = await import('./pinAttemptGuard')

describe('pinAttemptGuard', () => {
  beforeEach(() => {
    mockSecureStore.values.clear()
    mockSecureStore.deleteItemAsync.mockClear()
    mockSecureStore.getItemAsync.mockClear()
    mockSecureStore.setItemAsync.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resets attempts after a valid PIN', async () => {
    mockSecureStore.values.set(VAULT_SECURITY_KEYS.PIN_ATTEMPTS, '3')

    await expect(verifyPinWithAttemptGuard('123456', async () => true))
      .resolves.toEqual({ status: 'valid' })

    expect(mockSecureStore.values.has(VAULT_SECURITY_KEYS.PIN_ATTEMPTS)).toBe(false)
  })

  it('increments failed attempts and locks at the shared auth threshold', async () => {
    mockSecureStore.values.set(
      VAULT_SECURITY_KEYS.PIN_ATTEMPTS,
      String(SECURITY_CONFIG.MAX_PIN_ATTEMPTS - 1),
    )

    const result = await verifyPinWithAttemptGuard('000000', async () => false)

    expect(result.status).toBe('locked')
    expect(mockSecureStore.values.get(VAULT_SECURITY_KEYS.PIN_LOCKOUT_UNTIL)).toBeTruthy()
  })

  it('does not call the verifier while a lockout is active', async () => {
    const lockoutUntil = Date.now() + 60_000
    const verifyPin = vi.fn(async () => true)
    mockSecureStore.values.set(VAULT_SECURITY_KEYS.PIN_LOCKOUT_UNTIL, String(lockoutUntil))

    await expect(verifyPinWithAttemptGuard('123456', verifyPin))
      .resolves.toEqual({ status: 'locked', lockoutUntil })

    expect(verifyPin).not.toHaveBeenCalled()
  })

  it('expires stale lockouts before evaluating the next PIN attempt', async () => {
    mockSecureStore.values.set(VAULT_SECURITY_KEYS.PIN_LOCKOUT_UNTIL, String(Date.now() - 1))
    mockSecureStore.values.set(VAULT_SECURITY_KEYS.PIN_ATTEMPTS, '1')

    await expect(verifyPinWithAttemptGuard('000000', async () => false))
      .resolves.toEqual({
        status: 'invalid',
        remainingAttempts: SECURITY_CONFIG.MAX_PIN_ATTEMPTS - 2,
      })

    expect(mockSecureStore.values.has(VAULT_SECURITY_KEYS.PIN_LOCKOUT_UNTIL)).toBe(false)
    expect(mockSecureStore.values.get(VAULT_SECURITY_KEYS.PIN_ATTEMPTS)).toBe('2')
  })

  it('returns wipe_required when fail-wipe policy reaches its configured limit', async () => {
    mockSecureStore.values.set(VAULT_SECURITY_KEYS.FAIL_WIPE_ENABLED, 'true')
    mockSecureStore.values.set(VAULT_SECURITY_KEYS.FAIL_WIPE_ATTEMPTS, '3')
    mockSecureStore.values.set(VAULT_SECURITY_KEYS.PIN_ATTEMPTS, '2')

    await expect(verifyPinWithAttemptGuard('000000', async () => false))
      .resolves.toEqual({ status: 'wipe_required' })
  })

  it('clears attempts and lockout together', async () => {
    mockSecureStore.values.set(VAULT_SECURITY_KEYS.PIN_ATTEMPTS, '2')
    mockSecureStore.values.set(VAULT_SECURITY_KEYS.PIN_LOCKOUT_UNTIL, '123')

    await resetGuardedPinAttempts()

    expect(mockSecureStore.values.has(VAULT_SECURITY_KEYS.PIN_ATTEMPTS)).toBe(false)
    expect(mockSecureStore.values.has(VAULT_SECURITY_KEYS.PIN_LOCKOUT_UNTIL)).toBe(false)
  })

  it('formats lockout durations with a minimum one minute count', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const translate = vi.fn((key: string, options?: Record<string, unknown>) => `${key}:${String(options?.count)}`)

    expect(formatGuardedPinLockoutMessage(Date.now() + 1, translate)).toBe('lockout.message:1')
    expect(translate).toHaveBeenCalledWith('lockout.message', { ns: 'auth', count: 1 })
  })
})
