/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RelayRetryScheduler } from './relayRetryScheduler'

describe('RelayRetryScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('serializes relay retries across messages', async () => {
    const scheduler = new RelayRetryScheduler([100])
    let releaseFirst!: () => void
    const firstRun = vi.fn(() => new Promise<'accepted'>((resolve) => {
      releaseFirst = () => resolve('accepted')
    }))
    const secondRun = vi.fn(async () => 'accepted' as const)

    scheduler.schedule('first', { run: firstRun, onExhausted: vi.fn() })
    scheduler.schedule('second', { run: secondRun, onExhausted: vi.fn() })
    await vi.advanceTimersByTimeAsync(100)

    expect(firstRun).toHaveBeenCalledTimes(1)
    expect(secondRun).not.toHaveBeenCalled()

    releaseFirst()
    await vi.waitFor(() => expect(secondRun).toHaveBeenCalledTimes(1))
  })

  it('backs off transient failures and marks exhaustion once', async () => {
    const scheduler = new RelayRetryScheduler([100, 200])
    const run = vi.fn(async () => 'retryable' as const)
    const onExhausted = vi.fn(async () => {})

    scheduler.schedule('message', { run, onExhausted })
    await vi.advanceTimersByTimeAsync(100)
    expect(run).toHaveBeenCalledTimes(1)
    expect(onExhausted).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(200)
    await vi.waitFor(() => expect(onExhausted).toHaveBeenCalledTimes(1))
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('cancels pending retries on runtime cleanup', async () => {
    const scheduler = new RelayRetryScheduler([100])
    const run = vi.fn(async () => 'accepted' as const)

    scheduler.schedule('message', { run, onExhausted: vi.fn() })
    scheduler.clear()
    await vi.advanceTimersByTimeAsync(100)

    expect(run).not.toHaveBeenCalled()
  })
})
