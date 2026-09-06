/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const EXO_ADDRESS_PATTERN = /^exo00([0-9a-f]{38})$/i
const CANONICAL_EXO_ADDRESS_PATTERN = /^EXO00[0-9a-f]{38}$/

export function normalizeAddressBookWalletAddress(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined

  const match = EXO_ADDRESS_PATTERN.exec(trimmed)
  if (match) {
    return `EXO00${match[1].toLowerCase()}`
  }

  return trimmed
}

export function looksLikeWalletAddress(value?: string | null): boolean {
  const normalized = normalizeAddressBookWalletAddress(value)
  return normalized ? CANONICAL_EXO_ADDRESS_PATTERN.test(normalized) : false
}
