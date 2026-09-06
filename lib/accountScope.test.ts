/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  buildAccountScopedKey,
  buildAccountScopedPrefix,
  isAccountStorageScope,
  isSameAccountStorageScope,
  matchesAccountStorageScope,
  matchesStrictAccountStorageScope,
  normalizeAccountStorageScope,
} from './accountScope'

const mixedCaseScope = ' EXO00AaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa '
const normalizedScope = 'exo00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

describe('account storage scope helpers', () => {
  it('normalizes wallet addresses for storage comparisons', () => {
    expect(normalizeAccountStorageScope(mixedCaseScope)).toBe(normalizedScope)
    expect(normalizeAccountStorageScope('   ')).toBeNull()
    expect(normalizeAccountStorageScope(null)).toBeNull()
  })

  it('compares scopes after trimming and lowercasing', () => {
    expect(isSameAccountStorageScope(mixedCaseScope, normalizedScope)).toBe(true)
    expect(isSameAccountStorageScope(normalizedScope, 'exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBe(false)
    expect(isSameAccountStorageScope(null, normalizedScope)).toBe(false)
  })

  it('documents legacy wildcard matching for unscoped records', () => {
    expect(matchesAccountStorageScope(normalizedScope, undefined)).toBe(true)
    expect(matchesAccountStorageScope(undefined, normalizedScope)).toBe(true)
    expect(matchesAccountStorageScope(null, normalizedScope)).toBe(true)
    expect(matchesAccountStorageScope('exo00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', normalizedScope)).toBe(false)
  })

  it('requires explicit account ownership for strict UI matching', () => {
    expect(matchesStrictAccountStorageScope(undefined, normalizedScope)).toBe(false)
    expect(matchesStrictAccountStorageScope(mixedCaseScope, normalizedScope)).toBe(true)
  })

  it('recognizes normalized storage scope suffixes used in scoped storage keys', () => {
    expect(isAccountStorageScope(normalizedScope)).toBe(true)
    expect(isAccountStorageScope(normalizedScope.slice(0, -1))).toBe(false)
    expect(isAccountStorageScope(`EXO00${'a'.repeat(38)}`)).toBe(false)
  })

  it('builds scoped storage key prefixes and keys from normalized scopes', () => {
    expect(buildAccountScopedPrefix('exo_chat_', mixedCaseScope)).toBe(`exo_chat_${normalizedScope}_`)
    expect(buildAccountScopedKey('exo_session', mixedCaseScope)).toBe(`exo_session:${normalizedScope}`)
    expect(() => buildAccountScopedKey('exo_session', '   ')).toThrow('Account storage scope is required')
  })
})
