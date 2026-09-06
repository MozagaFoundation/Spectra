/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'

import { isSameAccountStorageScope } from '@/lib/accountScope'
import {
  clearActiveContactCard,
  subscribeToEphemeralDiscoveryActivity,
  type ActiveContactCard,
  type EphemeralDiscoveryEvent,
  type EphemeralDiscoveryFailure,
  type EphemeralDiscoveryOperation,
  type EphemeralDiscoveryScope,
} from '@/services/shared/ephemeralDiscoveryActivity'

export interface EphemeralDiscoveryActivitySnapshot {
  activityId: string
  operation: EphemeralDiscoveryOperation
  scope: EphemeralDiscoveryScope
  startedAt: number
}

export interface PublicDiscoveryLeaseSnapshot {
  expiresAt: number
  scope: EphemeralDiscoveryScope
}

export interface EphemeralDiscoveryFailureSnapshot {
  operation: EphemeralDiscoveryOperation
  failure: EphemeralDiscoveryFailure
  scope: EphemeralDiscoveryScope
}

interface EphemeralDiscoveryState {
  activity: EphemeralDiscoveryActivitySnapshot | null
  activeContactCard: ActiveContactCard | null
  publicDiscoveryLease: PublicDiscoveryLeaseSnapshot | null
  lastFailure: EphemeralDiscoveryFailureSnapshot | null
  cardModalVisible: boolean

  applyEvent: (event: EphemeralDiscoveryEvent) => void
  setPublicDiscoveryLease: (lease: PublicDiscoveryLeaseSnapshot | null) => void
  openCardModal: () => void
  closeCardModal: () => void
  clearExpired: (now?: number) => void
  reset: () => void
}

const ignoredActivityIds = new Set<string>()

function sameScope(left: EphemeralDiscoveryScope, right: EphemeralDiscoveryScope): boolean {
  return left.identityId === right.identityId
    && isSameAccountStorageScope(left.walletAddress, right.walletAddress)
}

function isTerminal(event: EphemeralDiscoveryEvent): boolean {
  return event.type === 'contact_card_ready'
    || event.type === 'public_discovery_ready'
    || event.type === 'failed'
    || event.type === 'cancelled'
}

export function isScopedActiveContactCard(
  card: ActiveContactCard | null | undefined,
  walletAddress: string | null | undefined,
  now = Date.now(),
): card is ActiveContactCard {
  return Boolean(
    card
    && walletAddress
    && card.expiresAt > now
    && isSameAccountStorageScope(card.walletAddress, walletAddress)
  )
}

export function isScopedPublicDiscoveryLease(
  lease: PublicDiscoveryLeaseSnapshot | null | undefined,
  walletAddress: string | null | undefined,
  now = Date.now(),
): lease is PublicDiscoveryLeaseSnapshot {
  return Boolean(
    lease
    && walletAddress
    && lease.expiresAt > now
    && isSameAccountStorageScope(lease.scope.walletAddress, walletAddress)
  )
}

export const useEphemeralDiscoveryStore = create<EphemeralDiscoveryState>((set, get) => ({
  activity: null,
  activeContactCard: null,
  publicDiscoveryLease: null,
  lastFailure: null,
  cardModalVisible: false,

  applyEvent: (event) => {
    if (event.type === 'reset') {
      const activityId = get().activity?.activityId
      if (activityId) ignoredActivityIds.add(activityId)
      set({
        activity: null,
        activeContactCard: null,
        publicDiscoveryLease: null,
        lastFailure: null,
        cardModalVisible: false,
      })
      return
    }

    if (event.type === 'active_card_cleared') {
      const activeContactCard = get().activeContactCard
      if (activeContactCard && sameScope(activeContactCard, event.scope)) {
        set({ activeContactCard: null, cardModalVisible: false })
      }
      return
    }

    if (event.type === 'contact_card_restored') {
      if (event.card.expiresAt <= Date.now()) return
      set({
        activeContactCard: event.card,
        lastFailure: null,
      })
      return
    }

    if (event.type === 'started') {
      set({
        activity: {
          activityId: event.activityId,
          operation: event.operation,
          scope: event.scope,
          startedAt: event.at,
        },
        lastFailure: null,
      })
      return
    }

    if (ignoredActivityIds.has(event.activityId)) {
      if (isTerminal(event)) ignoredActivityIds.delete(event.activityId)
      return
    }

    const { activity } = get()
    if (!activity || activity.activityId !== event.activityId) return

    if (event.type === 'contact_card_ready') {
      if (
        activity.operation !== 'contact_card'
        || !sameScope(activity.scope, event.card)
      ) {
        return
      }
      set({
        activity: null,
        activeContactCard: event.card,
        lastFailure: null,
      })
      return
    }

    if (event.type === 'public_discovery_ready') {
      if (
        activity.operation !== 'public_discovery'
        || !sameScope(activity.scope, event.scope)
      ) {
        return
      }
      set({
        activity: null,
        publicDiscoveryLease: {
          expiresAt: event.expiresAt,
          scope: event.scope,
        },
        lastFailure: null,
      })
      return
    }

    if (event.type === 'failed') {
      if (
        activity.operation !== event.operation
        || !sameScope(activity.scope, event.scope)
      ) {
        return
      }
      set({
        activity: null,
        lastFailure: {
          operation: event.operation,
          failure: event.failure,
          scope: event.scope,
        },
      })
      return
    }

    if (event.type === 'cancelled') {
      if (
        activity.operation !== event.operation
        || !sameScope(activity.scope, event.scope)
      ) {
        return
      }
      set({ activity: null })
    }
  },

  setPublicDiscoveryLease: (lease) => {
    set({
      publicDiscoveryLease: lease && lease.expiresAt > Date.now() ? lease : null,
    })
  },

  openCardModal: () => {
    const activeContactCard = get().activeContactCard
    if (activeContactCard && activeContactCard.expiresAt > Date.now()) {
      set({ cardModalVisible: true })
    }
  },

  closeCardModal: () => set({ cardModalVisible: false }),

  clearExpired: (now = Date.now()) => {
    const { activeContactCard, publicDiscoveryLease } = get()
    const expiredCard = activeContactCard && activeContactCard.expiresAt <= now
      ? activeContactCard
      : null
    const clearPublicLease = Boolean(
      publicDiscoveryLease && publicDiscoveryLease.expiresAt <= now,
    )
    if (!expiredCard && !clearPublicLease) return
    if (clearPublicLease) set({ publicDiscoveryLease: null })
    if (expiredCard) clearActiveContactCard(expiredCard)
  },

  reset: () => {
    const activityId = get().activity?.activityId
    if (activityId) ignoredActivityIds.add(activityId)
    set({
      activity: null,
      activeContactCard: null,
      publicDiscoveryLease: null,
      lastFailure: null,
      cardModalVisible: false,
    })
  },
}))

subscribeToEphemeralDiscoveryActivity((event) => {
  useEphemeralDiscoveryStore.getState().applyEvent(event)
})
