/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'
import { LocalHydrationCoordinator } from './localHydrationCoordinator'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe('LocalHydrationCoordinator', () => {
  it('shares base and repair work for the active wallet', async () => {
    const coordinator = new LocalHydrationCoordinator()
    const base = deferred()
    const loadBase = vi.fn(() => base.promise)
    const repair = vi.fn(async () => {})
    const work = {
      isProjectionReady: () => false,
      loadBase,
      repair,
    }

    const first = coordinator.ensure('EXO00owner', work)
    const second = coordinator.ensure('exo00owner', work)

    expect(second).toBe(first)
    expect(loadBase).toHaveBeenCalledTimes(1)

    base.resolve()
    await first.fullLocalReady
    expect(repair).toHaveBeenCalledTimes(1)
  })

  it('aborts retired wallet work before starting the next scope', async () => {
    const coordinator = new LocalHydrationCoordinator()
    const oldBase = deferred()
    const oldSignals: AbortSignal[] = []

    coordinator.ensure('EXO00old', {
      isProjectionReady: () => false,
      loadBase: async (signal) => {
        oldSignals.push(signal)
        await oldBase.promise
      },
      repair: async () => {},
    })
    const next = coordinator.ensure('EXO00next', {
      isProjectionReady: () => false,
      loadBase: async () => {},
      repair: async () => {},
    })

    expect(oldSignals[0]?.aborted).toBe(true)
    await next.fullLocalReady
    oldBase.resolve()
    await coordinator.waitForIdle()
  })
})
