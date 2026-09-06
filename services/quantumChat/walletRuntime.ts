/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { normalizeAccountStorageScope } from '@/lib/accountScope'
import { cancelPendingNativeCryptoJobs } from '@/services/storage/nativeCryptoJobs'

export class StaleWalletRuntimeError extends Error {
  constructor() {
    super('Wallet runtime is no longer active')
    this.name = 'StaleWalletRuntimeError'
  }
}

export class WalletRuntimeLease {
  readonly generation: number
  readonly walletScope: string
  private active = true
  private readonly abortController = new AbortController()
  private readonly tasks = new Set<Promise<unknown>>()

  constructor(generation: number, walletAddress: string) {
    const walletScope = normalizeAccountStorageScope(walletAddress)
    if (!walletScope) {
      throw new Error('Wallet runtime scope is required')
    }
    this.generation = generation
    this.walletScope = walletScope
  }

  invalidate(): void {
    if (!this.active) return
    this.active = false
    this.abortController.abort(new StaleWalletRuntimeError())
    cancelPendingNativeCryptoJobs()
  }

  get signal(): AbortSignal {
    return this.abortController.signal
  }

  isActive(): boolean {
    return this.active
  }

  assertActive(): void {
    if (!this.active) {
      throw new StaleWalletRuntimeError()
    }
  }

  track<T>(task: Promise<T>): Promise<T> {
    this.tasks.add(task)
    void task.finally(() => {
      this.tasks.delete(task)
    }).catch(() => undefined)
    return task
  }

  async waitForIdle(): Promise<void> {
    while (this.tasks.size > 0) {
      await Promise.allSettled([...this.tasks])
    }
  }
}

export class WalletRuntimeController {
  private generation = 0
  private active: WalletRuntimeLease | null = null
  private readonly retired = new Set<WalletRuntimeLease>()

  begin(walletAddress: string): WalletRuntimeLease {
    this.invalidate()
    const runtime = new WalletRuntimeLease(++this.generation, walletAddress)
    this.active = runtime
    return runtime
  }

  current(): WalletRuntimeLease | null {
    return this.active
  }

  isCurrent(runtime: WalletRuntimeLease): boolean {
    return this.active === runtime && runtime.isActive()
  }

  assertCurrent(runtime: WalletRuntimeLease): void {
    if (!this.isCurrent(runtime)) {
      throw new StaleWalletRuntimeError()
    }
  }

  invalidate(): void {
    if (!this.active) return
    const retired = this.active
    this.active = null
    retired.invalidate()
    this.retired.add(retired)
    void retired.waitForIdle().finally(() => {
      this.retired.delete(retired)
    })
  }

  async waitForIdle(): Promise<void> {
    while (this.retired.size > 0) {
      await Promise.allSettled([...this.retired].map((runtime) => runtime.waitForIdle()))
    }
  }
}
