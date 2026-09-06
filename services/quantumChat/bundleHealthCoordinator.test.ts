/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BundleHealthCoordinator } from './bundleHealthCoordinator'

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('BundleHealthCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces concurrent checks for the same identity', async () => {
    const coordinator = new BundleHealthCoordinator({ ttlMs: 120_000 })
    const deferred = createDeferred<boolean>()
    const check = vi.fn(() => deferred.promise)

    const first = coordinator.run('identity-a', 'manual_recovery', check)
    const second = coordinator.run('identity-a', 'foreground_resume', check)

    expect(check).toHaveBeenCalledTimes(1)
    deferred.resolve(true)

    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(true)
  })

  it('uses a recent healthy result within the TTL', async () => {
    const coordinator = new BundleHealthCoordinator({ ttlMs: 120_000 })
    const check = vi.fn(async () => true)

    await expect(coordinator.run('identity-a', 'manual_recovery', check)).resolves.toBe(true)
    await expect(coordinator.run('identity-a', 'foreground_resume', check)).resolves.toBe(true)

    expect(check).toHaveBeenCalledTimes(1)
  })

  it('allows forced checks to bypass a recent healthy result', async () => {
    const coordinator = new BundleHealthCoordinator({ ttlMs: 120_000 })
    const check = vi.fn(async () => true)

    await coordinator.run('identity-a', 'manual_recovery', check)
    await coordinator.run('identity-a', 'decryption_failure', check, { bypassCache: true })

    expect(check).toHaveBeenCalledTimes(2)
  })

  it('does not cache unhealthy check results', async () => {
    const coordinator = new BundleHealthCoordinator({ ttlMs: 120_000 })
    const check = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    await expect(coordinator.run('identity-a', 'manual_recovery', check)).resolves.toBe(false)
    await expect(coordinator.run('identity-a', 'foreground_resume', check)).resolves.toBe(true)

    expect(check).toHaveBeenCalledTimes(2)
  })

  it('runs a new check after the TTL expires', async () => {
    const coordinator = new BundleHealthCoordinator({ ttlMs: 120_000 })
    const check = vi.fn(async () => true)

    await coordinator.run('identity-a', 'manual_recovery', check)
    vi.setSystemTime(121_001)
    await coordinator.run('identity-a', 'foreground_resume', check)

    expect(check).toHaveBeenCalledTimes(2)
  })
})
