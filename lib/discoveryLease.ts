/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export const ACTIVE_DISCOVERY_STEP_MS = 24 * 60 * 60 * 1000
export const ACTIVE_DISCOVERY_MAX_DAYS = 7
export const ACTIVE_DISCOVERY_MAX_MS = ACTIVE_DISCOVERY_MAX_DAYS * ACTIVE_DISCOVERY_STEP_MS

export function activeDiscoveryRentedDays(expiresAt: number | null | undefined, now = Date.now()): number {
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= now) return 0
  return Math.min(
    ACTIVE_DISCOVERY_MAX_DAYS,
    Math.max(0, Math.round((expiresAt - now) / ACTIVE_DISCOVERY_STEP_MS)),
  )
}

export function isActiveDiscoveryAtCap(expiresAt: number, now = Date.now()): boolean {
  return activeDiscoveryRentedDays(expiresAt, now) >= ACTIVE_DISCOVERY_MAX_DAYS
}

export function nextActiveDiscoveryExpiry(existingExpiresAt: number | null, now = Date.now()): number {
  const base = existingExpiresAt && existingExpiresAt > now ? existingExpiresAt : now
  return Math.min(base + ACTIVE_DISCOVERY_STEP_MS, now + ACTIVE_DISCOVERY_MAX_MS)
}
