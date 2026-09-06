/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const ACCOUNT_SCOPE_PREFIX = 'exo00'

export function normalizeAccountStorageScope(walletAddress?: string | null): string | null {
  if (!walletAddress) {
    return null
  }

  const normalized = walletAddress.trim().toLowerCase()
  return normalized.length > 0 ? normalized : null
}

export function isSameAccountStorageScope(
  left?: string | null,
  right?: string | null,
): boolean {
  const normalizedLeft = normalizeAccountStorageScope(left)
  const normalizedRight = normalizeAccountStorageScope(right)

  return Boolean(
    normalizedLeft
      && normalizedRight
      && normalizedLeft === normalizedRight,
  )
}

export function matchesAccountStorageScope(
  value?: string | null,
  scope?: string | null,
): boolean {
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (!normalizedScope) {
    return true
  }

  const normalizedValue = normalizeAccountStorageScope(value)
  return !normalizedValue || normalizedValue === normalizedScope
}

export function matchesStrictAccountStorageScope(
  value?: string | null,
  scope?: string | null,
): boolean {
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (!normalizedScope) {
    return true
  }

  return normalizeAccountStorageScope(value) === normalizedScope
}

export function isAccountStorageScope(value?: string | null): value is string {
  if (!value) {
    return false
  }

  return value.startsWith(ACCOUNT_SCOPE_PREFIX) && value.length === 43
}

export function buildAccountScopedPrefix(prefix: string, scope: string): string {
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (!normalizedScope) {
    throw new Error('Account storage scope is required')
  }

  return `${prefix}${normalizedScope}_`
}

export function buildAccountScopedKey(key: string, scope: string): string {
  const normalizedScope = normalizeAccountStorageScope(scope)
  if (!normalizedScope) {
    throw new Error('Account storage scope is required')
  }

  return `${key}:${normalizedScope}`
}
