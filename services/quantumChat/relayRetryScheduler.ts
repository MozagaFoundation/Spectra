/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export type RelayRetryOutcome = 'accepted' | 'retryable' | 'terminal' | 'deferred'

type RelayRetryTask = {
  run: () => Promise<RelayRetryOutcome>
  onExhausted: () => Promise<void> | void
}

export class RelayRetryScheduler {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly activeKeys = new Set<string>()
  private serial: Promise<void> = Promise.resolve()
  private generation = 0

  constructor(private readonly delaysMs: readonly number[]) {}

  schedule(key: string, task: RelayRetryTask, attempt = 0): void {
    if (
      attempt >= this.delaysMs.length
      || this.timers.has(key)
      || this.activeKeys.has(key)
    ) {
      return
    }

    const generation = this.generation
    const timer = setTimeout(() => {
      if (generation !== this.generation) return
      this.timers.delete(key)
      this.activeKeys.add(key)
      const run = this.serial.then(task.run)
      this.serial = run.then(() => undefined, () => undefined)
      void run.then(
        (outcome) => {
          if (generation !== this.generation) return undefined
          this.activeKeys.delete(key)
          if (outcome === 'retryable') {
            if (attempt + 1 < this.delaysMs.length) {
              this.schedule(key, task, attempt + 1)
            } else {
              void Promise.resolve(task.onExhausted()).catch(() => undefined)
            }
          }
          return undefined
        },
        () => {
          if (generation !== this.generation) return undefined
          this.activeKeys.delete(key)
          void Promise.resolve(task.onExhausted()).catch(() => undefined)
          return undefined
        },
      )
    }, this.delaysMs[attempt])
    this.timers.set(key, timer)
  }

  clear(): void {
    this.generation += 1
    for (const timer of this.timers.values()) {
      clearTimeout(timer)
    }
    this.timers.clear()
    this.activeKeys.clear()
  }
}
