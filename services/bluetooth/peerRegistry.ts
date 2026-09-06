/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const MAX_AUTHENTICATED_PEERS = 32
const PEER_TTL_MS = 2 * 60 * 1000

export interface BLEKnownContact {
  identityId: string
  displayName: string | null
}

export interface NearbyContact {
  identityId: string
  displayName: string | null
  rssi: number
  lastSeenAt: number
  deviceId: string
}

interface AuthenticatedPeer extends NearbyContact {
  knownContact: boolean
}

export class BLEPeerRegistry {
  private readonly knownContacts = new Map<string, BLEKnownContact>()
  private readonly peersByDevice = new Map<string, AuthenticatedPeer>()
  private readonly expiredDeviceIds = new Set<string>()

  setKnownContacts(contacts: BLEKnownContact[]): void {
    this.knownContacts.clear()
    for (const contact of contacts) {
      if (contact.identityId.trim()) {
        this.knownContacts.set(contact.identityId, {
          identityId: contact.identityId,
          displayName: contact.displayName,
        })
      }
    }
    for (const [deviceId, peer] of this.peersByDevice) {
      const known = this.knownContacts.get(peer.identityId)
      if (!known) {
        this.peersByDevice.delete(deviceId)
        continue
      }
      peer.knownContact = true
      peer.displayName = known.displayName
    }
  }

  authenticated(options: {
    deviceId: string
    identityId: string
    knownContact: boolean
    rssi?: number
    now?: number
  }): boolean {
    const contact = this.knownContacts.get(options.identityId)
    if (!options.knownContact || !contact) return false
    this.expiredDeviceIds.delete(options.deviceId)
    if (
      !this.peersByDevice.has(options.deviceId)
      && this.peersByDevice.size >= MAX_AUTHENTICATED_PEERS
    ) {
      this.removeOldest()
    }
    this.peersByDevice.set(options.deviceId, {
      deviceId: options.deviceId,
      identityId: options.identityId,
      displayName: contact.displayName,
      knownContact: true,
      rssi: options.rssi ?? 0,
      lastSeenAt: options.now ?? Date.now(),
    })
    return true
  }

  seen(deviceId: string, rssi?: number, now: number = Date.now()): void {
    const peer = this.peersByDevice.get(deviceId)
    if (!peer) return
    peer.lastSeenAt = now
    if (typeof rssi === 'number') peer.rssi = rssi
  }

  disconnected(deviceId: string): void {
    this.peersByDevice.delete(deviceId)
    this.expiredDeviceIds.delete(deviceId)
  }

  getDevice(identityId: string): string | null {
    for (const peer of this.peersByDevice.values()) {
      if (peer.identityId === identityId) return peer.deviceId
    }
    return null
  }

  getIdentity(deviceId: string): string | null {
    return this.peersByDevice.get(deviceId)?.identityId ?? null
  }

  listNearby(now: number = Date.now()): NearbyContact[] {
    this.cleanup(now)
    return [...this.peersByDevice.values()]
      .filter((peer) => peer.knownContact)
      .map(({ knownContact: _, ...contact }) => contact)
      .sort((left, right) => right.lastSeenAt - left.lastSeenAt)
  }

  cleanup(now: number = Date.now()): void {
    for (const [deviceId, peer] of this.peersByDevice) {
      if (now - peer.lastSeenAt > PEER_TTL_MS) {
        this.peersByDevice.delete(deviceId)
        this.expiredDeviceIds.add(deviceId)
      }
    }
  }

  drainExpiredDeviceIds(): string[] {
    const deviceIds = [...this.expiredDeviceIds]
    this.expiredDeviceIds.clear()
    return deviceIds
  }

  clearPeers(): void {
    this.peersByDevice.clear()
    this.expiredDeviceIds.clear()
  }

  reset(): void {
    this.knownContacts.clear()
    this.clearPeers()
  }

  private removeOldest(): void {
    let oldest: AuthenticatedPeer | null = null
    for (const peer of this.peersByDevice.values()) {
      if (!oldest || peer.lastSeenAt < oldest.lastSeenAt) oldest = peer
    }
    if (oldest) this.peersByDevice.delete(oldest.deviceId)
  }
}
