/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  getEnglishBip39PrefixSuggestions,
  normalizeMnemonicPhrase,
} from './mnemonic'

describe('mnemonic helpers', () => {
  it('normalizes phrase casing, Unicode, and whitespace', () => {
    expect(normalizeMnemonicPhrase('  ABANDON \n Ability  ')).toBe('abandon ability')
  })

  it('returns bounded English BIP39 suggestions in wordlist order', () => {
    expect(getEnglishBip39PrefixSuggestions(' AB ', 4)).toEqual([
      'abandon',
      'ability',
      'able',
      'about',
    ])
  })

  it('returns exact matches and rejects empty or multi-word prefixes', () => {
    expect(getEnglishBip39PrefixSuggestions('zoo')).toEqual(['zoo'])
    expect(getEnglishBip39PrefixSuggestions('')).toEqual([])
    expect(getEnglishBip39PrefixSuggestions('ab out')).toEqual([])
    expect(getEnglishBip39PrefixSuggestions('ab', 0)).toEqual([])
  })
})
