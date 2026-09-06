/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  secureStore: new Map<string, string>(),
}))

function scopedKey(key: string, options?: { scope?: string }) {
  return `${key}:${options?.scope ?? 'default'}`
}

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string, options?: { scope?: string }) => (
    mockState.secureStore.get(scopedKey(key, options)) ?? null
  )),
  setItemAsync: vi.fn(async (key: string, value: string, options?: { scope?: string }) => {
    mockState.secureStore.set(scopedKey(key, options), value)
  }),
}))

vi.mock('@/lib/constants', () => ({
  SECURE_STORE_OPTIONS: { scope: 'default' },
  VAULT_SECURITY_KEYS: {
    HIDE_CONTENT: 'hide_content',
  },
}))

describe('appSwitcherPrivacy', () => {
  beforeEach(() => {
    mockState.secureStore.clear()
    vi.resetModules()
  })

  it('defaults to enabled when no preference has been saved', async () => {
    const { getAppSwitcherPrivacyEnabled } = await import('./appSwitcherPrivacy')

    await expect(getAppSwitcherPrivacyEnabled()).resolves.toBe(true)
  })

  it('persists changes and notifies subscribers immediately', async () => {
    const {
      getAppSwitcherPrivacyEnabled,
      setAppSwitcherPrivacyEnabled,
      subscribeToAppSwitcherPrivacy,
    } = await import('./appSwitcherPrivacy')

    const listener = vi.fn()
    const unsubscribe = subscribeToAppSwitcherPrivacy(listener)

    await setAppSwitcherPrivacyEnabled(false)

    expect(listener).toHaveBeenCalledWith(false)
    await expect(getAppSwitcherPrivacyEnabled()).resolves.toBe(false)

    unsubscribe()
  })

  it('does not notify unsubscribed listeners after later changes', async () => {
    const {
      setAppSwitcherPrivacyEnabled,
      subscribeToAppSwitcherPrivacy,
    } = await import('./appSwitcherPrivacy')

    const listener = vi.fn()
    const unsubscribe = subscribeToAppSwitcherPrivacy(listener)
    unsubscribe()

    await setAppSwitcherPrivacyEnabled(false)

    expect(listener).not.toHaveBeenCalledWith(false)
  })
})
