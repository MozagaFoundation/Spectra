/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { BLEPeerRegistry } from '../peerRegistry'

describe('BLEPeerRegistry', () => {
  it('exposes only authenticated known contacts', () => {
    const registry = new BLEPeerRegistry()
    registry.setKnownContacts([{ identityId: 'alice', displayName: 'Alice' }])

    expect(registry.authenticated({
      deviceId: 'unknown-device',
      identityId: 'mallory',
      knownContact: true,
      now: 1,
    })).toBe(false)
    expect(registry.authenticated({
      deviceId: 'alice-device',
      identityId: 'alice',
      knownContact: true,
      rssi: -40,
      now: 1,
    })).toBe(true)

    expect(registry.listNearby(2)).toEqual([{
      deviceId: 'alice-device',
      identityId: 'alice',
      displayName: 'Alice',
      rssi: -40,
      lastSeenAt: 1,
    }])
  })

  it('expires stale peers and removes contacts that are no longer trusted', () => {
    const registry = new BLEPeerRegistry()
    registry.setKnownContacts([{ identityId: 'alice', displayName: 'Alice' }])
    registry.authenticated({
      deviceId: 'alice-device',
      identityId: 'alice',
      knownContact: true,
      now: 1,
    })

    expect(registry.listNearby(200_000)).toEqual([])
    expect(registry.drainExpiredDeviceIds()).toEqual(['alice-device'])
    expect(registry.drainExpiredDeviceIds()).toEqual([])

    registry.authenticated({
      deviceId: 'alice-device',
      identityId: 'alice',
      knownContact: true,
      now: 300_000,
    })
    registry.setKnownContacts([])
    expect(registry.listNearby(300_001)).toEqual([])
  })

  it('preserves trusted contact bindings across a radio restart', () => {
    const registry = new BLEPeerRegistry()
    registry.setKnownContacts([{ identityId: 'alice', displayName: 'Alice' }])
    expect(registry.authenticated({
      deviceId: 'old-device',
      identityId: 'alice',
      knownContact: true,
    })).toBe(true)

    registry.clearPeers()

    expect(registry.listNearby()).toEqual([])
    expect(registry.authenticated({
      deviceId: 'new-device',
      identityId: 'alice',
      knownContact: true,
    })).toBe(true)
  })

  it('caps authenticated peer state under adversarial churn', () => {
    const registry = new BLEPeerRegistry()
    registry.setKnownContacts(Array.from({ length: 40 }, (_, index) => ({
      identityId: `identity-${index}`,
      displayName: `Contact ${index}`,
    })))

    for (let index = 0; index < 40; index += 1) {
      registry.authenticated({
        deviceId: `device-${index}`,
        identityId: `identity-${index}`,
        knownContact: true,
        now: index,
      })
    }

    expect(registry.listNearby(40)).toHaveLength(32)
    expect(registry.getDevice('identity-0')).toBeNull()
    expect(registry.getDevice('identity-39')).toBe('device-39')
  })
})
