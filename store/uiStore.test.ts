/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockStorage = vi.hoisted(() => new Map<string, string>())
const mockSetAppLanguage = vi.hoisted(() => vi.fn(async () => undefined))
const mockTranslate = vi.hoisted(() => vi.fn((key: string) => `translated:${key}`))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      mockStorage.set(key, value)
    }),
  },
}))

vi.mock('@/lib/i18n', () => ({
  setAppLanguage: mockSetAppLanguage,
  translate: mockTranslate,
}))

vi.mock('@/lib/utils', () => ({
  generateId: vi.fn(() => 'toast-id'),
}))

describe('uiStore toasts', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    mockStorage.clear()
    mockSetAppLanguage.mockClear()
    mockTranslate.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores toast display strings without translating them again', async () => {
    const { useUIStore } = await import('./uiStore')

    useUIStore.getState().showToast({
      type: 'error',
      title: 'Translated error',
      message: 'Translated message',
    })

    expect(useUIStore.getState().toasts).toMatchObject([
      {
        id: 'toast-id',
        type: 'error',
        title: 'Translated error',
        message: 'Translated message',
      },
    ])
    expect(mockTranslate).not.toHaveBeenCalled()
  })

  it('keeps the exported toast helper on the same display-string contract', async () => {
    const { toast, useUIStore } = await import('./uiStore')

    toast.error('Translated title', 'Translated body')

    expect(useUIStore.getState().toasts[0]).toMatchObject({
      title: 'Translated title',
      message: 'Translated body',
    })
    expect(mockTranslate).not.toHaveBeenCalled()
  })

  it('persists the preferred fiat currency locally', async () => {
    const { STORAGE_KEYS } = await import('@/lib/constants')
    const { useUIStore } = await import('./uiStore')

    await useUIStore.getState().setPreferredFiatCurrency('eur')

    expect(useUIStore.getState().preferredFiatCurrency).toBe('EUR')
    expect(JSON.parse(mockStorage.get(STORAGE_KEYS.USER_SETTINGS) ?? '{}')).toMatchObject({
      preferredFiatCurrency: 'EUR',
    })
  })

  it('loads a saved fiat currency and defaults invalid values to USD', async () => {
    const { STORAGE_KEYS } = await import('@/lib/constants')
    mockStorage.set(STORAGE_KEYS.USER_SETTINGS, JSON.stringify({ preferredFiatCurrency: 'mxn' }))
    let imported = await import('./uiStore')

    await imported.useUIStore.getState().loadSettings()
    expect(imported.useUIStore.getState().preferredFiatCurrency).toBe('MXN')

    vi.resetModules()
    mockStorage.set(STORAGE_KEYS.USER_SETTINGS, JSON.stringify({ preferredFiatCurrency: 'USDT' }))
    imported = await import('./uiStore')

    await imported.useUIStore.getState().loadSettings()
    expect(imported.useUIStore.getState().preferredFiatCurrency).toBe('USD')
  })
})
