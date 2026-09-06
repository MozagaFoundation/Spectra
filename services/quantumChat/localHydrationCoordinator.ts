/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { normalizeAccountStorageScope } from '@/lib/accountScope'

export interface LocalHydrationPhases {
  walletScope: string
  baseReady: Promise<void>
  repairPromise: Promise<void>
  fullLocalReady: Promise<void>
}

interface LocalHydrationWork {
  loadBase: (signal: AbortSignal) => Promise<void>
  repair: (signal: AbortSignal) => Promise<void>
  isProjectionReady: () => boolean
}

interface LocalHydrationEntry extends LocalHydrationPhases {
  baseSettled: boolean
  controller: AbortController
}

export class LocalHydrationCoordinator {
  private current: LocalHydrationEntry | null = null
  private readonly retired = new Set<Promise<void>>()

  ensure(walletAddress: string, work: LocalHydrationWork): LocalHydrationPhases {
    const walletScope = normalizeAccountStorageScope(walletAddress)
    if (!walletScope) {
      throw new Error('Local hydration wallet scope is required')
    }

    const existing = this.current
    if (
      existing?.walletScope === walletScope
      && (!existing.baseSettled || work.isProjectionReady())
    ) {
      return existing
    }

    this.retireCurrent()
    const entry = {} as LocalHydrationEntry
    const controller = new AbortController()
    const baseReady = work.loadBase(controller.signal).finally(() => {
      entry.baseSettled = true
    })
    const repairPromise = baseReady.then(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (!controller.signal.aborted) {
        await work.repair(controller.signal)
      }
    })
    Object.assign(entry, {
      walletScope,
      baseReady,
      repairPromise,
      fullLocalReady: repairPromise,
      baseSettled: false,
      controller,
    })
    this.current = entry
    void repairPromise.catch(() => undefined)
    return entry
  }

  clear(): void {
    this.retireCurrent()
  }

  async waitForIdle(): Promise<void> {
    while (this.retired.size > 0) {
      await Promise.allSettled([...this.retired])
    }
  }

  private retireCurrent(): void {
    if (!this.current) {
      return
    }
    const retired = this.current
    this.current = null
    retired.controller.abort()
    const task = retired.fullLocalReady.catch(() => undefined)
    this.retired.add(task)
    void task.finally(() => {
      this.retired.delete(task)
    })
  }
}
