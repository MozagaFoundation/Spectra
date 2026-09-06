/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export type EphemeralDiscoveryOperation = 'contact_card' | 'public_discovery'
export type EphemeralDiscoveryFailure =
  | 'active_contact_card'
  | 'active_public_discovery'
  | 'request_failed'

export interface EphemeralDiscoveryScope {
  walletAddress: string
  identityId: string
}

export interface ActiveContactCard {
  cardId: string
  invite: string
  expiresAt: number
  walletAddress: string
  identityId: string
}

export type EphemeralDiscoveryEvent =
  | {
    type: 'started'
    activityId: string
    operation: EphemeralDiscoveryOperation
    scope: EphemeralDiscoveryScope
    at: number
  }
  | {
    type: 'contact_card_ready'
    activityId: string
    card: ActiveContactCard
    at: number
  }
  | {
    type: 'contact_card_restored'
    card: ActiveContactCard
    at: number
  }
  | {
    type: 'public_discovery_ready'
    activityId: string
    scope: EphemeralDiscoveryScope
    expiresAt: number
    at: number
  }
  | {
    type: 'failed'
    activityId: string
    operation: EphemeralDiscoveryOperation
    scope: EphemeralDiscoveryScope
    failure: EphemeralDiscoveryFailure
    at: number
  }
  | {
    type: 'cancelled'
    activityId: string
    operation: EphemeralDiscoveryOperation
    scope: EphemeralDiscoveryScope
    at: number
  }
  | {
    type: 'active_card_cleared'
    scope: EphemeralDiscoveryScope
    at: number
  }
  | {
    type: 'reset'
    at: number
  }

type EphemeralDiscoveryListener = (event: EphemeralDiscoveryEvent) => void

export interface EphemeralDiscoveryActivityHandle {
  activityId: string
  contactCardReady: (card: ActiveContactCard) => void
  publicDiscoveryReady: (expiresAt: number) => void
  fail: (failure?: EphemeralDiscoveryFailure) => void
  cancel: () => void
}

let nextActivityId = 0
const listeners = new Set<EphemeralDiscoveryListener>()

function publish(event: EphemeralDiscoveryEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event)
    } catch {
      // Observers must not interrupt discovery work.
    }
  })
}

export function subscribeToEphemeralDiscoveryActivity(
  listener: EphemeralDiscoveryListener,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function beginEphemeralDiscoveryActivity(
  operation: EphemeralDiscoveryOperation,
  scope: EphemeralDiscoveryScope,
): EphemeralDiscoveryActivityHandle {
  const activityId = `eda1.${++nextActivityId}`
  let terminal = false
  publish({ type: 'started', activityId, operation, scope, at: Date.now() })

  const finish = (event: EphemeralDiscoveryEvent) => {
    if (terminal) return
    terminal = true
    publish(event)
  }

  return {
    activityId,
    contactCardReady: (card) => finish({
      type: 'contact_card_ready',
      activityId,
      card,
      at: Date.now(),
    }),
    publicDiscoveryReady: (expiresAt) => finish({
      type: 'public_discovery_ready',
      activityId,
      scope,
      expiresAt,
      at: Date.now(),
    }),
    fail: (failure = 'request_failed') => finish({
      type: 'failed',
      activityId,
      operation,
      scope,
      failure,
      at: Date.now(),
    }),
    cancel: () => finish({
      type: 'cancelled',
      activityId,
      operation,
      scope,
      at: Date.now(),
    }),
  }
}

export function restoreActiveContactCard(card: ActiveContactCard): void {
  publish({ type: 'contact_card_restored', card, at: Date.now() })
}

export function clearActiveContactCard(scope: EphemeralDiscoveryScope): void {
  publish({ type: 'active_card_cleared', scope, at: Date.now() })
}

export function resetEphemeralDiscoveryActivity(): void {
  publish({ type: 'reset', at: Date.now() })
}
