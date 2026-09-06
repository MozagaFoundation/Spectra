/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type I18nMock = {
  isInitialized: boolean
  resolvedLanguage: string | undefined
  addResourceBundle?: ReturnType<typeof vi.fn>
  use: ReturnType<typeof vi.fn>
  t: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  changeLanguage: ReturnType<typeof vi.fn>
  init: ReturnType<typeof vi.fn>
}

const i18nState = vi.hoisted(() => {
  let releaseInit: (() => void) | null = null
  const instance = {
    isInitialized: false,
    resolvedLanguage: undefined as string | undefined,
    addResourceBundle: undefined as ReturnType<typeof vi.fn> | undefined,
    use: vi.fn(),
    t: vi.fn((key: string) => key),
    on: vi.fn(),
    changeLanguage: vi.fn(async (language: string) => {
      instance.resolvedLanguage = language
    }),
    init: vi.fn(async (options: { lng: string }) => {
      await new Promise<void>((resolve) => {
        releaseInit = resolve
      })
      instance.isInitialized = true
      instance.resolvedLanguage = options.lng
      instance.addResourceBundle = vi.fn()
    }),
  } satisfies I18nMock

  instance.use.mockReturnValue(instance)

  return {
    instance,
    releaseInit: () => {
      releaseInit?.()
      releaseInit = null
    },
  }
})

vi.mock('i18next', () => ({
  default: i18nState.instance,
}))

vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'es-MX', languageCode: 'es' }],
}))

vi.mock('./resources', () => ({
  APP_NAMESPACES: ['common'] as const,
  DEFAULT_LANGUAGE: 'en',
  resources: {
    en: { common: { Hello: 'Hello' } },
  },
  loadLanguageResources: vi.fn(async (language: string) => ({
    common: { Hello: language === 'en' ? 'Hello' : language },
  })),
}))

describe('i18n boot', () => {
  beforeEach(() => {
    vi.resetModules()
    i18nState.instance.isInitialized = false
    i18nState.instance.resolvedLanguage = undefined
    i18nState.instance.addResourceBundle = undefined
    i18nState.instance.init.mockClear()
    i18nState.instance.changeLanguage.mockClear()
    i18nState.instance.use.mockClear()
    i18nState.instance.on.mockClear()
  })

  afterEach(() => {
    i18nState.releaseInit()
  })

  it('does not call addResourceBundle before i18next init on a non-English device', async () => {
    const { setAppLanguage } = await import('./index')

    await vi.waitFor(() => {
      expect(i18nState.instance.init).toHaveBeenCalledTimes(1)
    })
    expect(i18nState.instance.addResourceBundle).toBeUndefined()

    const pendingSwitch = setAppLanguage('fr')
    expect(i18nState.instance.addResourceBundle).toBeUndefined()

    i18nState.releaseInit()
    await pendingSwitch

    expect(i18nState.instance.addResourceBundle).toEqual(expect.any(Function))
    expect(i18nState.instance.addResourceBundle).toHaveBeenCalledWith(
      'fr',
      'common',
      { Hello: 'fr' },
      true,
      true,
    )
    expect(i18nState.instance.changeLanguage).toHaveBeenCalledWith('fr')
  })
})
