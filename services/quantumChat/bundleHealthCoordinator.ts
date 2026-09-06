/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export type BundleHealthReason =
  | 'initialization'
  | 'decryption_failure'
  | 'manual_recovery'
  | 'foreground_resume'

type BundleHealthRun = (reason: BundleHealthReason) => Promise<boolean>

interface BundleHealthCoordinatorOptions {
  ttlMs: number
}

interface BundleHealthRequestOptions {
  bypassCache?: boolean
}

type InFlightBundleHealth = {
  identityId: string
  promise: Promise<boolean>
}

export class BundleHealthCoordinator {
  private readonly ttlMs: number
  private inFlight: InFlightBundleHealth | null = null
  private lastHealthyIdentityId: string | null = null
  private lastHealthyAt = 0

  constructor(options: BundleHealthCoordinatorOptions) {
    this.ttlMs = options.ttlMs
  }

  hasRecentHealthyResult(identityId: string, now: number = Date.now()): boolean {
    return (
      this.lastHealthyIdentityId === identityId
      && this.lastHealthyAt > 0
      && now - this.lastHealthyAt < this.ttlMs
    )
  }

  run(
    identityId: string,
    reason: BundleHealthReason,
    check: BundleHealthRun,
    options: BundleHealthRequestOptions = {},
  ): Promise<boolean> {
    if (!options.bypassCache && this.hasRecentHealthyResult(identityId)) {
      return Promise.resolve(true)
    }

    if (this.inFlight?.identityId === identityId) {
      return this.inFlight.promise
    }

    let promise: Promise<boolean>
    promise = check(reason)
      .then((healthy) => {
        if (healthy) {
          this.lastHealthyIdentityId = identityId
          this.lastHealthyAt = Date.now()
        }
        return healthy
      })
      .finally(() => {
        if (this.inFlight?.promise === promise) {
          this.inFlight = null
        }
      })

    this.inFlight = { identityId, promise }
    return promise
  }

  reset(): void {
    this.inFlight = null
    this.lastHealthyIdentityId = null
    this.lastHealthyAt = 0
  }
}
