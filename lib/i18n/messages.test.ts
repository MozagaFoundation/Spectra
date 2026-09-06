/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const i18nextState = vi.hoisted(() => ({
  language: 'en',
  resolvedLanguage: 'en' as string | undefined,
}))

vi.mock('i18next', () => ({
  default: i18nextState,
}))

vi.mock('./resources', () => ({
  DEFAULT_LANGUAGE: 'en',
  resources: {
    en: {
      common: {
        Greeting: 'Hello {{name}}',
        EnglishOnly: 'English fallback',
      },
      errors: {
        Failure: 'Failed after {{count}} attempts',
      },
    },
    es: {
      common: {
        Greeting: 'Hola {{name}}',
      },
      errors: {},
    },
  },
}))

import { translateMessage } from './messages'

describe('translateMessage', () => {
  beforeEach(() => {
    i18nextState.language = 'en'
    i18nextState.resolvedLanguage = 'en'
  })

  it('translates from the resolved language and interpolates tokens', () => {
    i18nextState.resolvedLanguage = 'es'

    expect(translateMessage('Greeting', { name: 'Ana' })).toBe('Hola Ana')
  })

  it('falls back to English when the current language is missing a key', () => {
    i18nextState.resolvedLanguage = 'es'

    expect(translateMessage('EnglishOnly')).toBe('English fallback')
  })

  it('uses the requested namespace', () => {
    expect(translateMessage('Failure', { ns: 'errors', count: 3 })).toBe('Failed after 3 attempts')
  })

  it('returns the key and preserves missing placeholders when no translation or value exists', () => {
    expect(translateMessage('MissingKey')).toBe('MissingKey')
    expect(translateMessage('Greeting')).toBe('Hello {{name}}')
  })
})
