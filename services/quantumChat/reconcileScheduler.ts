/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

type ReconcileSchedulerOptions<T> = {
  merge: (current: T | null, incoming: T) => T
  run: (options: T) => Promise<void>
}

export class ReconcileScheduler<T> {
  private pending: T | null = null
  private drainPromise: Promise<void> | null = null

  constructor(private readonly options: ReconcileSchedulerOptions<T>) {}

  request(options: T): Promise<void> {
    this.pending = this.options.merge(this.pending, options)
    if (!this.drainPromise) {
      this.drainPromise = this.drain().finally(() => {
        this.drainPromise = null
      })
    }
    return this.drainPromise
  }

  clearPending(): void {
    this.pending = null
  }

  isRunning(): boolean {
    return this.drainPromise !== null
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const options = this.pending
      this.pending = null
      await this.options.run(options)
    }
  }
}
