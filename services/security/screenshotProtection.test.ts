/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  secureStore: new Map<string, string>(),
}))

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockState.secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockState.secureStore.set(key, value)
  }),
}))

vi.mock('@/lib/constants', () => ({
  SCREENSHOT_PROTECTION_KEY: 'screenshot_protection',
  SECURE_STORE_OPTIONS: {},
}))

describe('screenshotProtection', () => {
  beforeEach(() => {
    vi.resetModules()
    mockState.secureStore.clear()
  })

  it('defaults screenshot protection to enabled', async () => {
    const { getScreenshotProtectionEnabled } = await import('./screenshotProtection')

    await expect(getScreenshotProtectionEnabled()).resolves.toBe(true)
  })

  it('persists the preference and notifies subscribers', async () => {
    const {
      getScreenshotProtectionEnabled,
      setScreenshotProtectionEnabled,
      subscribeToScreenshotProtection,
    } = await import('./screenshotProtection')
    const listener = vi.fn()
    const unsubscribe = subscribeToScreenshotProtection(listener)

    await setScreenshotProtectionEnabled(false)

    expect(mockState.secureStore.get('screenshot_protection')).toBe('false')
    await expect(getScreenshotProtectionEnabled()).resolves.toBe(false)
    expect(listener).toHaveBeenCalledWith(false)

    unsubscribe()
    await setScreenshotProtectionEnabled(true)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
