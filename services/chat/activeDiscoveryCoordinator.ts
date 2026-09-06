/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  ACTIVE_DISCOVERY_MAX_DAYS,
  activeDiscoveryRentedDays,
  isActiveDiscoveryAtCap,
} from '@/lib/discoveryLease'
import { SpectraBackendError } from '@/services/backend/request'
import {
  extendActiveDiscoveryLease,
  fetchOwnDiscoveryLease,
  unpublishPublicDiscovery,
} from '@/services/backend/ephemeralDiscovery'
import { getQuantumChatClient } from '@/services/quantumChat'
import {
  registerAccountRuntimeAbortListener,
  registerAccountRuntimeResetListener,
} from '@/services/shared/accountRuntimeLifecycle'
import { beginVdfActivity, type VdfActivityHandle } from '@/services/shared/vdfActivity'
import { useWalletStore } from '@/store/walletStore'
import { useEphemeralDiscoveryStore } from '@/store/ephemeralDiscoveryStore'
import { useVdfActivityStore } from '@/store/vdfActivityStore'
import { readDiscoveryVisibility } from './discoveryModeStorage'
import { discoveryAliasLeaseFields } from './discoveryAliasPublish'

type ChatClient = NonNullable<ReturnType<typeof getQuantumChatClient>>

const RENT_EXTEND_ATTEMPTS = 3
const RENT_RETRY_BASE_MS = 250
const RENT_RETRY_MAX_MS = 5_000

let generation = 0
let inFlight: AbortController | null = null

function rentAbortError(): Error {
  const error = new Error('VDF solving was cancelled')
  error.name = 'AbortError'
  return error
}

function currentClient(): {
  client: ChatClient
  identityId: string
  walletAddress: string
  spectreMode: boolean
} | null {
  const client = getQuantumChatClient()
  const identity = client?.getIdentity()
  const wallet = useWalletStore.getState().wallet
  if (!client || !identity?.id || !wallet?.address) return null
  return {
    client,
    identityId: identity.id,
    walletAddress: wallet.address,
    spectreMode: wallet.spectreMode === true,
  }
}

function rememberLease(walletAddress: string, identityId: string, expiresAt: number): void {
  useEphemeralDiscoveryStore.getState().setPublicDiscoveryLease({
    expiresAt,
    scope: { walletAddress, identityId },
  })
}

function publishRentStep(activity: VdfActivityHandle, expiresAt: number | null | undefined): void {
  activity.setStep({
    completed: activeDiscoveryRentedDays(expiresAt),
    total: ACTIVE_DISCOVERY_MAX_DAYS,
  })
}

function settleRentActivity(
  activity: VdfActivityHandle | undefined,
  status: 'completed' | 'cancelled' | 'failed',
): void {
  if (!activity) return
  if (status === 'completed') activity.complete()
  else if (status === 'cancelled') activity.cancel()
  else activity.fail()
}

function nativeVdfErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  return typeof error.code === 'string' ? error.code : null
}

function isRetryableRentError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return false
  const nativeCode = nativeVdfErrorCode(error)
  if (nativeCode === 'ERR_VDF_UNAVAILABLE' || nativeCode === 'ERR_VDF_CANCELLED') return false
  if (error instanceof SpectraBackendError) {
    if (error.code === 'public_discovery_at_cap' || error.code === 'public_discovery_active') {
      return false
    }
    if (error.code === 'invalid_vdf_proof') return false
    if (error.status === 401 || error.status === 403) return false
    if (
      error.code === 'vdf_too_early'
      || error.code === 'vdf_challenge_expired'
      || error.code === 'rate_limited'
      || error.code === 'database_unavailable'
    ) {
      return true
    }
    return error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500
  }
  return error instanceof Error
}

function retryDelayMs(error: unknown, attempt: number): number {
  if (error instanceof SpectraBackendError && error.retryAfterMs) {
    return Math.min(Math.max(error.retryAfterMs, 0), RENT_RETRY_MAX_MS)
  }
  return Math.min(RENT_RETRY_BASE_MS * attempt, RENT_RETRY_MAX_MS)
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) {
    if (signal.aborted) return Promise.reject(rentAbortError())
    return Promise.resolve()
  }
  if (signal.aborted) return Promise.reject(rentAbortError())
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(rentAbortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function extendRentDay(
  identityId: string,
  walletAddress: string,
  bundle: Parameters<typeof extendActiveDiscoveryLease>[2],
  activity: VdfActivityHandle,
  aliasFields: Awaited<ReturnType<typeof discoveryAliasLeaseFields>>,
  signal: AbortSignal,
): Promise<{ expiresAt: number }> {
  let lastError: unknown
  for (let attempt = 0; attempt < RENT_EXTEND_ATTEMPTS; attempt++) {
    if (signal.aborted) throw rentAbortError()
    try {
      return await extendActiveDiscoveryLease(
        identityId,
        walletAddress,
        bundle,
        {
          activity,
          holdActivity: true,
          signal,
        },
        aliasFields,
      )
    } catch (error) {
      lastError = error
      if (!isRetryableRentError(error) || attempt === RENT_EXTEND_ATTEMPTS - 1) throw error
      await delay(retryDelayMs(error, attempt), signal)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not extend discovery')
}

export function abortActiveDiscoveryRent(): void {
  generation += 1
  inFlight?.abort()
}

export function invalidateActiveDiscoveryRent(): void {
  abortActiveDiscoveryRent()
  inFlight = null
}

export async function unpublishActiveDiscovery(): Promise<void> {
  invalidateActiveDiscoveryRent()
  useVdfActivityStore.getState().reset()
  await unpublishPublicDiscovery()
  useEphemeralDiscoveryStore.getState().setPublicDiscoveryLease(null)
}

export async function ensureActiveDiscoveryRent(): Promise<void> {
  if (inFlight) return
  const current = currentClient()
  if (!current || current.spectreMode) return

  const started = generation
  const controller = new AbortController()
  inFlight = controller
  let rentActivity: VdfActivityHandle | undefined
  let knownExpiresAt: number | undefined
  try {
    const visibility = await readDiscoveryVisibility(current.walletAddress)
    if (started !== generation || controller.signal.aborted) return
    if (visibility !== 'findable') return
    const aliasFields = await discoveryAliasLeaseFields()
    if (started !== generation || controller.signal.aborted) return

    while (started === generation && !controller.signal.aborted) {
      const scope = currentClient()
      if (!scope || scope.walletAddress !== current.walletAddress || scope.identityId !== current.identityId) {
        settleRentActivity(rentActivity, 'cancelled')
        return
      }
      const lease = await fetchOwnDiscoveryLease({ signal: controller.signal })
      if (started !== generation || controller.signal.aborted) {
        settleRentActivity(rentActivity, 'cancelled')
        return
      }
      if (lease.exists && lease.discoveryMode === 'active' && typeof lease.expiresAt === 'number') {
        knownExpiresAt = lease.expiresAt
        rememberLease(scope.walletAddress, scope.identityId, lease.expiresAt)
        if (isActiveDiscoveryAtCap(lease.expiresAt)) {
          if (rentActivity) publishRentStep(rentActivity, lease.expiresAt)
          settleRentActivity(rentActivity, 'completed')
          return
        }
      }
      const bundle = await scope.client.getPublicKeyBundle()
      if (!bundle || bundle.identityId !== scope.identityId) {
        settleRentActivity(rentActivity, 'cancelled')
        return
      }
      rentActivity ??= beginVdfActivity({ action: 'extend_public_discovery' })
      publishRentStep(rentActivity, knownExpiresAt)
      const result = await extendRentDay(
        scope.identityId,
        scope.walletAddress,
        bundle,
        rentActivity,
        aliasFields,
        controller.signal,
      )
      if (started !== generation || controller.signal.aborted) {
        settleRentActivity(rentActivity, 'cancelled')
        return
      }
      knownExpiresAt = result.expiresAt
      rememberLease(scope.walletAddress, scope.identityId, result.expiresAt)
      publishRentStep(rentActivity, result.expiresAt)
      if (isActiveDiscoveryAtCap(result.expiresAt)) {
        settleRentActivity(rentActivity, 'completed')
        return
      }
    }
    settleRentActivity(rentActivity, 'cancelled')
  } catch (error) {
    if (
      error instanceof SpectraBackendError
      && (error.code === 'public_discovery_at_cap' || error.code === 'public_discovery_active')
    ) {
      settleRentActivity(rentActivity, 'completed')
      return
    }
    if (error instanceof Error && error.name === 'AbortError') {
      settleRentActivity(rentActivity, 'cancelled')
      return
    }
    settleRentActivity(rentActivity, 'failed')
  } finally {
    if (inFlight === controller) inFlight = null
  }
}

registerAccountRuntimeAbortListener(abortActiveDiscoveryRent)
registerAccountRuntimeResetListener(invalidateActiveDiscoveryRent)
