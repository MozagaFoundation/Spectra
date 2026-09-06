/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

type BundleRegistrationEntry = {
  identityId: string
  exists: true
  checkedAt: number
}

type InFlightBundleRegistration = {
  identityId: string
  promise: Promise<boolean>
}

type InFlightTransportReadiness = {
  promise: Promise<boolean>
}

export const BUNDLE_REGISTRATION_CACHE_TTL_MS = 2 * 60 * 1000

let lastBundleRegistration: BundleRegistrationEntry | null = null
let inFlightBundleRegistration: InFlightBundleRegistration | null = null
const inFlightTransportReadiness = new Map<string, InFlightTransportReadiness>()

export function getCachedBundleRegistration(
  identityId: string,
  now: number = Date.now(),
): boolean | null {
  if (
    lastBundleRegistration?.identityId === identityId
    && now - lastBundleRegistration.checkedAt < BUNDLE_REGISTRATION_CACHE_TTL_MS
  ) {
    return true
  }

  return null
}

export function rememberBundleRegistration(
  identityId: string,
  exists: boolean,
  now: number = Date.now(),
): void {
  if (exists) {
    lastBundleRegistration = { identityId, exists: true, checkedAt: now }
  } else if (lastBundleRegistration?.identityId === identityId) {
    lastBundleRegistration = null
  }
}

export function clearBundleRegistrationCache(identityId?: string): void {
  if (!identityId || lastBundleRegistration?.identityId === identityId) {
    lastBundleRegistration = null
  }
  if (!identityId || inFlightBundleRegistration?.identityId === identityId) {
    inFlightBundleRegistration = null
  }
}

export function runBundleRegistrationCheck(
  identityId: string,
  check: () => Promise<boolean>,
  options: { forceRefresh?: boolean } = {},
): Promise<boolean> {
  if (!options.forceRefresh && getCachedBundleRegistration(identityId)) {
    return Promise.resolve(true)
  }

  if (!options.forceRefresh && inFlightBundleRegistration?.identityId === identityId) {
    return inFlightBundleRegistration.promise
  }

  let promise: Promise<boolean>
  promise = check()
    .then((exists) => {
      rememberBundleRegistration(identityId, exists)
      return exists
    })
    .finally(() => {
      if (inFlightBundleRegistration?.promise === promise) {
        inFlightBundleRegistration = null
      }
    })

  inFlightBundleRegistration = { identityId, promise }
  return promise
}

export function runTransportReadinessCheck(
  generation: number,
  identityId: string,
  check: () => Promise<boolean>,
): Promise<boolean> {
  const key = `${generation}:${identityId}`
  const pending = inFlightTransportReadiness.get(key)
  if (pending) return pending.promise

  let promise: Promise<boolean>
  promise = check().finally(() => {
    if (inFlightTransportReadiness.get(key)?.promise === promise) {
      inFlightTransportReadiness.delete(key)
    }
  })
  inFlightTransportReadiness.set(key, { promise })
  return promise
}

export function clearTransportReadinessChecks(generation?: number): void {
  if (generation == null) {
    inFlightTransportReadiness.clear()
    return
  }
  const prefix = `${generation}:`
  for (const key of inFlightTransportReadiness.keys()) {
    if (key.startsWith(prefix)) inFlightTransportReadiness.delete(key)
  }
}
