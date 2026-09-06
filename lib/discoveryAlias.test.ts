/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  canonicalDiscoveryAliasKey,
  discoveryAliasInputBody,
  normalizeDiscoveryAlias,
  parseDiscoveryAliasPrefix,
  parseDiscoveryAliasQuery,
  storedDiscoveryAlias,
} from './discoveryAlias'

describe('discovery aliases', () => {
  it('normalizes optional unicode and emoji handles', () => {
    expect(normalizeDiscoveryAlias('@alice')).toBe('@alice')
    expect(normalizeDiscoveryAlias('alice.garcia')).toBe('@alice.garcia')
    expect(normalizeDiscoveryAlias('@alice🌟')).toBe('@alice🌟')
    expect(normalizeDiscoveryAlias('@曼努埃尔')).toBe('@曼努埃尔')
    expect(normalizeDiscoveryAlias('  @Alice  ')).toBe('@Alice')
    expect(normalizeDiscoveryAlias('')).toBeUndefined()
    expect(normalizeDiscoveryAlias(null)).toBeUndefined()
  })

  it('lowercases only ASCII letters in the lookup key', () => {
    expect(canonicalDiscoveryAliasKey('@Alice🌟')).toBe('@alice🌟')
    expect(canonicalDiscoveryAliasKey('@曼努埃尔')).toBe('@曼努埃尔')
  })

  it('rejects spaces, extra @, controls, and short bodies', () => {
    expect(() => normalizeDiscoveryAlias('@a')).toThrow('Invalid discovery alias')
    expect(() => normalizeDiscoveryAlias('@alice garcia')).toThrow('Invalid discovery alias')
    expect(() => normalizeDiscoveryAlias('@alice@bob')).toThrow('Invalid discovery alias')
    expect(() => normalizeDiscoveryAlias('@ali\nce')).toThrow('Invalid discovery alias')
  })

  it('parses prefix search and exact queries', () => {
    expect(parseDiscoveryAliasPrefix('@al')).toBe('@al')
    expect(parseDiscoveryAliasPrefix('@Al')).toBe('@al')
    expect(parseDiscoveryAliasPrefix('@a')).toBeNull()
    expect(parseDiscoveryAliasPrefix('alice')).toBeNull()
    expect(parseDiscoveryAliasQuery('@Alice🌟')).toEqual({
      canonicalKey: '@alice🌟',
      exact: true,
    })
  })

  it('keeps valid aliases and ignores freeform names', () => {
    expect(storedDiscoveryAlias('@Alice')).toBe('@Alice')
    expect(storedDiscoveryAlias('Alice')).toBe('')
    expect(storedDiscoveryAlias('Alice Smith')).toBe('')
    expect(storedDiscoveryAlias(null)).toBe('')
  })

  it('strips a leading @ for the input body', () => {
    expect(discoveryAliasInputBody('@alice')).toBe('alice')
    expect(discoveryAliasInputBody('alice')).toBe('alice')
    expect(discoveryAliasInputBody('')).toBe('')
  })
})
