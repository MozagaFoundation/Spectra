/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  ACTIVE_DISCOVERY_MAX_MS,
  ACTIVE_DISCOVERY_STEP_MS,
  activeDiscoveryRentedDays,
  isActiveDiscoveryAtCap,
  nextActiveDiscoveryExpiry,
} from './discoveryLease'

describe('active discovery lease math', () => {
  it('adds one day without exceeding seven days remaining', () => {
    const now = 1_800_000_000_000
    expect(nextActiveDiscoveryExpiry(null, now)).toBe(now + ACTIVE_DISCOVERY_STEP_MS)
    expect(nextActiveDiscoveryExpiry(now + ACTIVE_DISCOVERY_MAX_MS, now)).toBe(now + ACTIVE_DISCOVERY_MAX_MS)
  })

  it('treats a rounded seven-day remaining lease as capped', () => {
    const now = 1_800_000_000_000
    expect(isActiveDiscoveryAtCap(now + ACTIVE_DISCOVERY_MAX_MS, now)).toBe(true)
    expect(isActiveDiscoveryAtCap(now + 6.5 * ACTIVE_DISCOVERY_STEP_MS, now)).toBe(true)
    expect(isActiveDiscoveryAtCap(now + 6.4 * ACTIVE_DISCOVERY_STEP_MS, now)).toBe(false)
    expect(isActiveDiscoveryAtCap(now + ACTIVE_DISCOVERY_STEP_MS, now)).toBe(false)
  })

  it('counts rented days toward the seven-day cap', () => {
    const now = 1_800_000_000_000
    expect(activeDiscoveryRentedDays(null, now)).toBe(0)
    expect(activeDiscoveryRentedDays(now + ACTIVE_DISCOVERY_STEP_MS, now)).toBe(1)
    expect(activeDiscoveryRentedDays(now + 6 * ACTIVE_DISCOVERY_STEP_MS, now)).toBe(6)
    expect(activeDiscoveryRentedDays(now + 6.4 * ACTIVE_DISCOVERY_STEP_MS, now)).toBe(6)
    expect(activeDiscoveryRentedDays(now + 6.5 * ACTIVE_DISCOVERY_STEP_MS, now)).toBe(7)
    expect(activeDiscoveryRentedDays(now + ACTIVE_DISCOVERY_MAX_MS, now)).toBe(7)
  })
})
