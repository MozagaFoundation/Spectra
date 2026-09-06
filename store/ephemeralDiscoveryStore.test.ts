/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import {
  beginEphemeralDiscoveryActivity,
  resetEphemeralDiscoveryActivity,
  restoreActiveContactCard,
} from '@/services/shared/ephemeralDiscoveryActivity'
import {
  isScopedActiveContactCard,
  isScopedPublicDiscoveryLease,
  useEphemeralDiscoveryStore,
} from './ephemeralDiscoveryStore'

const scope = {
  walletAddress: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  identityId: 'identity-local',
}

describe('ephemeral discovery store', () => {
  beforeEach(() => {
    resetEphemeralDiscoveryActivity()
    useEphemeralDiscoveryStore.getState().reset()
  })

  it('keeps an active contact card in memory until it expires', () => {
    const activity = beginEphemeralDiscoveryActivity('contact_card', scope)
    const expiresAt = Date.now() + 60_000
    activity.contactCardReady({
      ...scope,
      cardId: `scc1.${'a'.repeat(32)}`,
      invite: 'spectra://contact-card/test',
      expiresAt,
    })

    expect(useEphemeralDiscoveryStore.getState().activeContactCard).toEqual(
      expect.objectContaining({ expiresAt }),
    )

    useEphemeralDiscoveryStore.getState().openCardModal()
    expect(useEphemeralDiscoveryStore.getState().cardModalVisible).toBe(true)

    useEphemeralDiscoveryStore.getState().clearExpired(expiresAt)
    expect(useEphemeralDiscoveryStore.getState().activeContactCard).toBeNull()
    expect(useEphemeralDiscoveryStore.getState().cardModalVisible).toBe(false)
  })

  it('ignores an invalidated operation that finishes late', () => {
    const activity = beginEphemeralDiscoveryActivity('contact_card', scope)
    resetEphemeralDiscoveryActivity()
    activity.contactCardReady({
      ...scope,
      cardId: `scc1.${'b'.repeat(32)}`,
      invite: 'spectra://contact-card/test',
      expiresAt: Date.now() + 60_000,
    })

    expect(useEphemeralDiscoveryStore.getState().activeContactCard).toBeNull()
  })

  it('hides an active card that belongs to another wallet', () => {
    const activity = beginEphemeralDiscoveryActivity('contact_card', scope)
    activity.contactCardReady({
      ...scope,
      cardId: `scc1.${'c'.repeat(32)}`,
      invite: 'spectra://contact-card/test',
      expiresAt: Date.now() + 60_000,
    })

    const card = useEphemeralDiscoveryStore.getState().activeContactCard
    expect(isScopedActiveContactCard(card, scope.walletAddress)).toBe(true)
    expect(isScopedActiveContactCard(card, 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBe(false)
    expect(isScopedActiveContactCard(card, null)).toBe(false)
  })

  it('hides a public discovery lease that belongs to another wallet', () => {
    const activity = beginEphemeralDiscoveryActivity('public_discovery', scope)
    activity.publicDiscoveryReady(Date.now() + 60_000)
    const lease = useEphemeralDiscoveryStore.getState().publicDiscoveryLease

    expect(isScopedPublicDiscoveryLease(lease, scope.walletAddress)).toBe(true)
    expect(isScopedPublicDiscoveryLease(lease, 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBe(false)
    expect(isScopedPublicDiscoveryLease(lease, null)).toBe(false)
  })

  it('records a coordinator-owned public discovery lease', () => {
    const expiresAt = Date.now() + 60_000
    useEphemeralDiscoveryStore.getState().setPublicDiscoveryLease({
      expiresAt,
      scope,
    })

    expect(useEphemeralDiscoveryStore.getState().publicDiscoveryLease).toEqual({
      expiresAt,
      scope,
    })

    useEphemeralDiscoveryStore.getState().setPublicDiscoveryLease(null)
    expect(useEphemeralDiscoveryStore.getState().publicDiscoveryLease).toBeNull()
  })

  it('restores a persisted contact card without a VDF activity', () => {
    restoreActiveContactCard({
      ...scope,
      cardId: `scc1.${'d'.repeat(32)}`,
      invite: 'spectra://contact-card/test',
      expiresAt: Date.now() + 60_000,
    })

    expect(useEphemeralDiscoveryStore.getState().activeContactCard).toEqual(
      expect.objectContaining({ identityId: scope.identityId }),
    )
    expect(useEphemeralDiscoveryStore.getState().activity).toBeNull()
  })
})
