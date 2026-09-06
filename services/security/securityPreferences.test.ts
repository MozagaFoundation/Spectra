/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  secureStore: new Map<string, string>(),
  getReceiptPreferences: vi.fn(async () => ({
    deliveryReceiptsEnabled: true,
    readReceiptsEnabled: false,
  })),
  setDeliveryReceiptsEnabled: vi.fn(async () => {}),
  setReadReceiptsEnabled: vi.fn(async () => {}),
  getScreenshotProtectionEnabled: vi.fn(async () => true),
  setScreenshotProtectionEnabled: vi.fn(async () => {}),
  getAppSwitcherPrivacyEnabled: vi.fn(async () => false),
  setAppSwitcherPrivacyEnabled: vi.fn(async () => {}),
  getClearImageCacheOnLockEnabled: vi.fn(async () => true),
  setClearImageCacheOnLockEnabled: vi.fn(async () => {}),
  getMessageCachePrivacyMode: vi.fn(async () => 'clear_on_lock' as const),
  setMessageCachePrivacyMode: vi.fn(async () => {}),
  loadDuressPinState: vi.fn(async () => ({
    enabled: false,
    hasDuressPin: true,
  })),
  setDuressProtectionEnabled: vi.fn(async () => {}),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockState.secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockState.secureStore.set(key, value)
  }),
}))

vi.mock('@/lib/constants', () => ({
  SECURE_STORE_OPTIONS: {},
  SPECTRE_AUTO_LOCK_TIME: 'Immediately',
  SPECTRE_FAIL_WIPE_ATTEMPTS: 5,
  VAULT_SECURITY_KEYS: {
    AUTO_LOCK: 'auto_lock',
    AUTO_LOCK_TIME: 'auto_lock_time',
    FAIL_WIPE_ENABLED: 'fail_wipe_enabled',
    FAIL_WIPE_ATTEMPTS: 'fail_wipe_attempts',
  },
}))

vi.mock('./receiptPreferences', () => ({
  getReceiptPreferences: mockState.getReceiptPreferences,
  setDeliveryReceiptsEnabled: mockState.setDeliveryReceiptsEnabled,
  setReadReceiptsEnabled: mockState.setReadReceiptsEnabled,
}))

vi.mock('./screenshotProtection', () => ({
  getScreenshotProtectionEnabled: mockState.getScreenshotProtectionEnabled,
  setScreenshotProtectionEnabled: mockState.setScreenshotProtectionEnabled,
}))

vi.mock('./appSwitcherPrivacy', () => ({
  getAppSwitcherPrivacyEnabled: mockState.getAppSwitcherPrivacyEnabled,
  setAppSwitcherPrivacyEnabled: mockState.setAppSwitcherPrivacyEnabled,
}))

vi.mock('./dataProtection', () => ({
  getClearImageCacheOnLockEnabled: mockState.getClearImageCacheOnLockEnabled,
  getMessageCachePrivacyMode: mockState.getMessageCachePrivacyMode,
  setClearImageCacheOnLockEnabled: mockState.setClearImageCacheOnLockEnabled,
  setMessageCachePrivacyMode: mockState.setMessageCachePrivacyMode,
}))

vi.mock('./duressPin', () => ({
  loadDuressPinState: mockState.loadDuressPinState,
  setDuressProtectionEnabled: mockState.setDuressProtectionEnabled,
}))

describe('securityPreferences', () => {
  beforeEach(() => {
    mockState.secureStore.clear()
    mockState.secureStore.set('auto_lock', 'false')
    mockState.secureStore.set('auto_lock_time', '15 minutes')
    mockState.secureStore.set('fail_wipe_enabled', 'true')
    mockState.secureStore.set('fail_wipe_attempts', '7')
    mockState.getReceiptPreferences.mockClear()
    mockState.setDeliveryReceiptsEnabled.mockClear()
    mockState.setReadReceiptsEnabled.mockClear()
    mockState.getScreenshotProtectionEnabled.mockClear()
    mockState.setScreenshotProtectionEnabled.mockClear()
    mockState.getAppSwitcherPrivacyEnabled.mockClear()
    mockState.setAppSwitcherPrivacyEnabled.mockClear()
    mockState.getClearImageCacheOnLockEnabled.mockClear()
    mockState.setClearImageCacheOnLockEnabled.mockClear()
    mockState.getMessageCachePrivacyMode.mockClear()
    mockState.setMessageCachePrivacyMode.mockClear()
    mockState.loadDuressPinState.mockClear()
    mockState.setDuressProtectionEnabled.mockClear()
  })

  it('reads managed security preferences from their owning stores', async () => {
    const { readManagedSecurityPreferences } = await import('./securityPreferences')

    await expect(readManagedSecurityPreferences()).resolves.toEqual({
      deliveryReceiptsEnabled: true,
      readReceiptsEnabled: false,
      screenshotProtectionEnabled: true,
      appSwitcherPrivacyEnabled: false,
      autoLockEnabled: false,
      autoLockTime: '15 minutes',
      failWipeEnabled: true,
      failWipeAttempts: '7',
      duressProtectionEnabled: false,
      clearImageCacheOnLockEnabled: true,
      messageCachePrivacyMode: 'clear_on_lock',
    })
  })

  it('applies the Spectre security policy through one facade', async () => {
    const { applySpectreSecurityPreferences } = await import('./securityPreferences')

    await applySpectreSecurityPreferences()

    expect(mockState.setDeliveryReceiptsEnabled).toHaveBeenCalledWith(false)
    expect(mockState.setReadReceiptsEnabled).toHaveBeenCalledWith(false)
    expect(mockState.setScreenshotProtectionEnabled).toHaveBeenCalledWith(true)
    expect(mockState.setAppSwitcherPrivacyEnabled).toHaveBeenCalledWith(true)
    expect(mockState.setDuressProtectionEnabled).toHaveBeenCalledWith(true)
    expect(mockState.setClearImageCacheOnLockEnabled).toHaveBeenCalledWith(true)
    expect(mockState.setMessageCachePrivacyMode).toHaveBeenCalledWith('strict')
    expect(mockState.secureStore.get('auto_lock')).toBe('true')
    expect(mockState.secureStore.get('auto_lock_time')).toBe('Immediately')
    expect(mockState.secureStore.get('fail_wipe_attempts')).toBe('5')
  })

  it('writes local vault preferences through the facade', async () => {
    const {
      setManagedAutoLockEnabled,
      setManagedAutoLockTime,
      setManagedFailWipeAttempts,
      setManagedFailWipeEnabled,
    } = await import('./securityPreferences')

    await setManagedAutoLockEnabled(true)
    await setManagedAutoLockTime('1 minute')
    await setManagedFailWipeEnabled(true, '3')
    await setManagedFailWipeAttempts('10')

    expect(mockState.secureStore.get('auto_lock')).toBe('true')
    expect(mockState.secureStore.get('auto_lock_time')).toBe('1 minute')
    expect(mockState.secureStore.get('fail_wipe_enabled')).toBe('true')
    expect(mockState.secureStore.get('fail_wipe_attempts')).toBe('10')
  })

  it('restores security and cache preferences separately', async () => {
    const {
      restoreManagedCachePreferences,
      restoreManagedSecurityPreferences,
    } = await import('./securityPreferences')
    const preferences = {
      deliveryReceiptsEnabled: true,
      readReceiptsEnabled: true,
      screenshotProtectionEnabled: false,
      appSwitcherPrivacyEnabled: true,
      autoLockEnabled: true,
      autoLockTime: '5 minutes',
      failWipeEnabled: false,
      failWipeAttempts: '10',
      duressProtectionEnabled: false,
      clearImageCacheOnLockEnabled: false,
      messageCachePrivacyMode: 'standard' as const,
    }

    await restoreManagedSecurityPreferences(preferences)
    await restoreManagedCachePreferences(preferences)

    expect(mockState.setDeliveryReceiptsEnabled).toHaveBeenCalledWith(true)
    expect(mockState.setReadReceiptsEnabled).toHaveBeenCalledWith(true)
    expect(mockState.setScreenshotProtectionEnabled).toHaveBeenCalledWith(false)
    expect(mockState.setAppSwitcherPrivacyEnabled).toHaveBeenCalledWith(true)
    expect(mockState.secureStore.get('auto_lock')).toBe('true')
    expect(mockState.secureStore.get('fail_wipe_enabled')).toBe('false')
    expect(mockState.setDuressProtectionEnabled).toHaveBeenCalledWith(false)
    expect(mockState.setClearImageCacheOnLockEnabled).toHaveBeenCalledWith(false)
    expect(mockState.setMessageCachePrivacyMode).toHaveBeenCalledWith('standard')
  })
})
