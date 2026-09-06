/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearBundleRegistrationCache,
  clearTransportReadinessChecks,
  getCachedBundleRegistration,
  rememberBundleRegistration,
  runBundleRegistrationCheck,
  runTransportReadinessCheck,
} from './readinessCache'

describe('quantum chat readiness cache', () => {
  beforeEach(() => {
    clearBundleRegistrationCache()
    clearTransportReadinessChecks()
  })

  it('caches only recent positive bundle registration results', () => {
    rememberBundleRegistration('identity-1', true, 1_000)

    expect(getCachedBundleRegistration('identity-1', 2_000)).toBe(true)
    expect(getCachedBundleRegistration('identity-2', 2_000)).toBeNull()
    expect(getCachedBundleRegistration('identity-1', 130_001)).toBeNull()

    rememberBundleRegistration('identity-1', false, 2_000)
    expect(getCachedBundleRegistration('identity-1', 2_001)).toBeNull()
  })

  it('coalesces in-flight checks for the same identity', async () => {
    let resolveCheck!: (value: boolean) => void
    const check = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveCheck = resolve
    }))

    const first = runBundleRegistrationCheck('identity-1', check)
    const second = runBundleRegistrationCheck('identity-1', check)

    expect(check).toHaveBeenCalledTimes(1)
    resolveCheck(true)
    await expect(Promise.all([first, second])).resolves.toEqual([true, true])

    await expect(runBundleRegistrationCheck('identity-1', check)).resolves.toBe(true)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('coalesces transport readiness only within one runtime generation', async () => {
    let resolveFirst!: (value: boolean) => void
    const firstCheck = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveFirst = resolve
    }))
    const secondCheck = vi.fn(async () => true)

    const first = runTransportReadinessCheck(1, 'identity-1', firstCheck)
    const duplicate = runTransportReadinessCheck(1, 'identity-1', firstCheck)
    const nextGeneration = runTransportReadinessCheck(2, 'identity-1', secondCheck)

    expect(firstCheck).toHaveBeenCalledTimes(1)
    await expect(nextGeneration).resolves.toBe(true)
    resolveFirst(true)
    await expect(Promise.all([first, duplicate])).resolves.toEqual([true, true])
  })
})
