/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const MAX_ALIAS_CODE_POINTS = 80
const MAX_ALIAS_BYTES = 320
const MIN_ALIAS_BODY_CODE_POINTS = 2
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u
const BIDI_CONTROL_PATTERN = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u
const UNPAIRED_SURROGATE_PATTERN =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/u
const ALIAS_BODY_PATTERN =
  /^(?:[\p{L}\p{N}_.\-]|[\p{Extended_Pictographic}\uFE0F\u200D\u{1F3FB}-\u{1F3FF}])+$/u

export const DISCOVERY_ALIAS_SEARCH_LIMIT = 8
export const DISCOVERY_ALIAS_PREFIX_MIN_BODY = MIN_ALIAS_BODY_CODE_POINTS

export function canonicalDiscoveryAliasKey(value: string): string {
  return [...value.normalize('NFC')].map((character) => (
    character >= 'A' && character <= 'Z' ? character.toLowerCase() : character
  )).join('')
}

export function normalizeDiscoveryAlias(value?: string | null): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || UNPAIRED_SURROGATE_PATTERN.test(value)) {
    throw new Error('Invalid discovery alias')
  }
  const trimmed = value.trim().normalize('NFC')
  if (!trimmed) return undefined
  const withPrefix = trimmed.startsWith('@') ? trimmed : `@${trimmed}`
  const body = withPrefix.slice(1)
  const codePoints = [...withPrefix]
  if (
    !body
    || [...body].length < MIN_ALIAS_BODY_CODE_POINTS
    || codePoints.length > MAX_ALIAS_CODE_POINTS
    || new TextEncoder().encode(withPrefix).byteLength > MAX_ALIAS_BYTES
    || body.includes('@')
    || /\s/u.test(withPrefix)
    || CONTROL_CHARACTER_PATTERN.test(withPrefix)
    || BIDI_CONTROL_PATTERN.test(withPrefix)
    || !ALIAS_BODY_PATTERN.test(body)
  ) {
    throw new Error('Invalid discovery alias')
  }
  return withPrefix
}

export function discoveryAliasInputBody(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
}

export function parseDiscoveryAliasQuery(value: string): {
  canonicalKey: string
  exact: boolean
} | null {
  let alias: string
  try {
    alias = normalizeDiscoveryAlias(value) ?? ''
  } catch {
    return null
  }
  if (!alias) return null
  return {
    canonicalKey: canonicalDiscoveryAliasKey(alias),
    exact: true,
  }
}

export function storedDiscoveryAlias(value?: string | null): string {
  if (typeof value !== 'string' || !value.trim().startsWith('@')) return ''
  try {
    return normalizeDiscoveryAlias(value) ?? ''
  } catch {
    return ''
  }
}

export function parseDiscoveryAliasPrefix(value: string): string | null {
  if (typeof value !== 'string' || UNPAIRED_SURROGATE_PATTERN.test(value)) return null
  const trimmed = value.trim().normalize('NFC')
  if (!trimmed.startsWith('@')) return null
  const withPrefix = trimmed
  const body = withPrefix.slice(1)
  if (
    [...body].length < MIN_ALIAS_BODY_CODE_POINTS
    || [...withPrefix].length > MAX_ALIAS_CODE_POINTS
    || new TextEncoder().encode(withPrefix).byteLength > MAX_ALIAS_BYTES
    || body.includes('@')
    || /\s/u.test(withPrefix)
    || CONTROL_CHARACTER_PATTERN.test(withPrefix)
    || BIDI_CONTROL_PATTERN.test(withPrefix)
    || !ALIAS_BODY_PATTERN.test(body)
  ) {
    return null
  }
  return canonicalDiscoveryAliasKey(withPrefix)
}
