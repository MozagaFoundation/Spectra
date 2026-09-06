/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  mergeChatReconcileOptions,
  type ChatReconcileOptions,
} from './chatReconcileOptions'
import { ReconcileScheduler } from './reconcileScheduler'

describe('ReconcileScheduler', () => {
  it('serializes passes and preserves stronger work that arrives in flight', async () => {
    let releaseFirst!: () => void
    const runs: ChatReconcileOptions[] = []
    const run = vi.fn(async (options: ChatReconcileOptions) => {
      runs.push(options)
      if (runs.length === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve
        })
      }
    })
    const scheduler = new ReconcileScheduler({ merge: mergeChatReconcileOptions, run })

    const first = scheduler.request({ fullResync: false })
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    const second = scheduler.request({
      fullResync: true,
      reason: 'decryption_failure',
      suppressLocalNotifications: true,
    })
    const third = scheduler.request({
      restartRealtime: true,
      reason: 'foreground_resume',
      skipBundleHealth: true,
    })

    expect(second).toBe(first)
    expect(third).toBe(first)
    releaseFirst()
    await first

    expect(runs[0]).toMatchObject({ fullResync: false })
    expect(runs[1]).toMatchObject({
      fullResync: true,
      restartRealtime: true,
      reason: 'decryption_failure',
      suppressLocalNotifications: true,
      skipBundleHealth: false,
    })
    expect(scheduler.isRunning()).toBe(false)
  })

  it('drops queued work when the owning runtime is invalidated', async () => {
    let releaseFirst!: () => void
    const run = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
    })
    const scheduler = new ReconcileScheduler<ChatReconcileOptions>({
      merge: mergeChatReconcileOptions,
      run,
    })

    const active = scheduler.request({})
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1))
    scheduler.request({ fullResync: true })
    scheduler.clearPending()
    releaseFirst()
    await active

    expect(run).toHaveBeenCalledTimes(1)
  })
})
