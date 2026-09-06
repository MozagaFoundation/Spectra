/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  getLocalizedLanguageName,
  getFallbackLocaleTag,
  isAppLanguage,
  isRtlLanguage,
  LANGUAGE_DEFINITIONS,
  normalizeAppLanguageCode,
  SUPPORTED_LANGUAGE_CODES,
  SUPPORTED_LANGUAGES,
} from './languages'
import { APP_LANGUAGES } from './resources'

describe('i18n languages', () => {
  it('keeps language definitions, supported codes, supported options, and resources in sync', () => {
    const definitionCodes = Object.keys(LANGUAGE_DEFINITIONS).sort()
    const resourceCodes = [...APP_LANGUAGES].sort()

    expect([...SUPPORTED_LANGUAGE_CODES].sort()).toEqual(definitionCodes)
    expect(resourceCodes).toEqual(definitionCodes)
    expect(SUPPORTED_LANGUAGES.map((language) => language.code).sort()).toEqual(definitionCodes)
  })

  it('normalizes supported locale tags and aliases', () => {
    expect(normalizeAppLanguageCode('EN_us')).toBe('en')
    expect(normalizeAppLanguageCode('es-MX')).toBe('es')
    expect(normalizeAppLanguageCode('zh_Hans_CN')).toBe('zh-Hans')
    expect(normalizeAppLanguageCode('ar-AE')).toBe('ar')
    expect(normalizeAppLanguageCode('unknown')).toBeNull()
    expect(normalizeAppLanguageCode(null)).toBeNull()
  })

  it('recognizes only supported app language codes', () => {
    expect(isAppLanguage('en')).toBe(true)
    expect(isAppLanguage('zh-Hans')).toBe(true)
    expect(isAppLanguage('zh-hans')).toBe(false)
    expect(isAppLanguage('')).toBe(false)
  })

  it('returns fallback locale tags from the language definitions', () => {
    for (const code of SUPPORTED_LANGUAGE_CODES) {
      expect(getFallbackLocaleTag(code)).toBe(LANGUAGE_DEFINITIONS[code].localeTag)
    }
  })

  it('limits RTL layout to the approved RTL language set', () => {
    const rtlLanguages = SUPPORTED_LANGUAGE_CODES.filter(isRtlLanguage).sort()

    expect(rtlLanguages).toEqual(['ar', 'ur'])
    expect(isRtlLanguage(null)).toBe(false)
  })

  it('provides localized display names for every selectable language', () => {
    for (const displayLanguage of SUPPORTED_LANGUAGE_CODES) {
      for (const language of SUPPORTED_LANGUAGE_CODES) {
        expect(getLocalizedLanguageName(language, displayLanguage), `${displayLanguage}:${language}`)
          .toBeTruthy()
      }
    }

    expect(getLocalizedLanguageName('zh-Hans', 'es')).toBe('chino simplificado')
    expect(getLocalizedLanguageName('es', 'zh-Hans')).toBe('西班牙语')
  })
})
