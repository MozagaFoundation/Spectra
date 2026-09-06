/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const EXO_ADDRESS = /^EXO00[0-9a-f]{38}$/i

let pendingWalletAddress: string | null = null

export function normalizeContactShareWalletAddress(value: string): string | null {
  const trimmed = value.trim()
  return EXO_ADDRESS.test(trimmed)
    ? `EXO00${trimmed.slice(5).toLowerCase()}`
    : null
}

export function rememberPendingContactShareAddress(value: string): void {
  pendingWalletAddress = normalizeContactShareWalletAddress(value)
}

export function peekPendingContactShareAddress(): string | null {
  return pendingWalletAddress
}

export function consumePendingContactShareAddress(): string | null {
  const next = pendingWalletAddress
  pendingWalletAddress = null
  return next
}

export function clearPendingContactShareAddress(): void {
  pendingWalletAddress = null
}
