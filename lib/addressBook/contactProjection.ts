/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { AddressBookEntry, ChatContact, KnownPeer } from '../types'
import { findAddressBookEntry, mergeTrustState } from './addressBookState'
import { normalizeAddressBookWalletAddress } from './contactKeys'

function dedupeKnownPeers(peers: KnownPeer[]): KnownPeer[] {
  const byIdentity = new Map<string, KnownPeer>()
  const byWallet = new Map<string, KnownPeer>()

  for (const peer of peers) {
    if (!peer.identityId) {
      continue
    }

    const existingByIdentity = byIdentity.get(peer.identityId)
    if (!existingByIdentity) {
      byIdentity.set(peer.identityId, peer)
    } else {
      byIdentity.set(peer.identityId, {
        ...existingByIdentity,
        ...peer,
        displayName: peer.displayName || existingByIdentity.displayName,
        sharedDisplayName: peer.sharedDisplayName || existingByIdentity.sharedDisplayName,
        walletAddress: peer.walletAddress || existingByIdentity.walletAddress,
        publicKeyBundle: peer.publicKeyBundle || existingByIdentity.publicKeyBundle,
        bundleVersion: peer.bundleVersion ?? existingByIdentity.bundleVersion,
        identityVerifiedAt: Math.max(
          peer.identityVerifiedAt ?? 0,
          existingByIdentity.identityVerifiedAt ?? 0,
        ) || undefined,
        trustState: mergeTrustState(existingByIdentity.trustState, peer.trustState),
        lastSeenAt: peer.lastSeenAt ?? existingByIdentity.lastSeenAt,
        isOnline: peer.isOnline ?? existingByIdentity.isOnline,
        addedAt: Math.min(peer.addedAt, existingByIdentity.addedAt),
      })
    }
  }

  for (const peer of byIdentity.values()) {
    const walletAddress = normalizeAddressBookWalletAddress(peer.walletAddress)
    if (!walletAddress) {
      continue
    }

    const existingByWallet = byWallet.get(walletAddress)
    if (!existingByWallet || peer.addedAt >= existingByWallet.addedAt) {
      byWallet.set(walletAddress, {
        ...peer,
        walletAddress,
      })
    }
  }

  const deduped: KnownPeer[] = []
  const walletPeerIds = new Set([...byWallet.values()].map((peer) => peer.identityId))
  for (const peer of byIdentity.values()) {
    if (!peer.walletAddress || walletPeerIds.has(peer.identityId)) {
      deduped.push(peer)
    }
  }

  return deduped
}

export function isCustomContactAlias(
  displayName: string | undefined,
  identityId: string,
  walletAddress?: string,
): boolean {
  const trimmed = displayName?.trim()
  if (!trimmed) {
    return false
  }

  const identityPrefix = identityId.slice(0, 8)
  return trimmed !== `User ${identityPrefix}`
    && trimmed !== `${identityPrefix}...`
    && trimmed !== walletAddress
}

function buildContactDisplayName(peer: KnownPeer, entry?: AddressBookEntry): string {
  const localAlias = entry?.isSaved && isCustomContactAlias(
    entry.displayName,
    peer.identityId,
    entry.walletAddress || peer.walletAddress,
  ) ? entry.displayName : undefined
  return (
    localAlias
    || entry?.contactProfile?.displayName
    || peer.sharedDisplayName
    || peer.displayName
    || peer.walletAddress
    || `User ${peer.identityId.slice(0, 8)}`
  )
}

function slimPublicKeyBundle<T extends { oneTimePreKeys?: unknown[] }>(
  bundle: T | undefined,
): T | undefined {
  if (!bundle?.oneTimePreKeys?.length) return bundle
  return { ...bundle, oneTimePreKeys: [] }
}

export function slimContactForUi(contact: ChatContact): ChatContact {
  const publicKeyBundle = slimPublicKeyBundle(contact.publicKeyBundle)
  if (publicKeyBundle === contact.publicKeyBundle) return contact
  return { ...contact, publicKeyBundle }
}

export function projectContacts(
  peers: KnownPeer[],
  entries: AddressBookEntry[],
): ChatContact[] {
  return dedupeKnownPeers(peers)
    .map((peer) => {
      const walletAddress = normalizeAddressBookWalletAddress(peer.walletAddress)
      const entry = findAddressBookEntry(entries, {
        walletAddress,
        identityId: peer.identityId,
      })

      return {
        identityId: peer.identityId,
        walletAddress: walletAddress || entry?.walletAddress,
        displayName: buildContactDisplayName(peer, entry),
        sharedDisplayName: entry?.contactProfile?.displayName || peer.sharedDisplayName,
        publicKeyBundle: peer.publicKeyBundle,
        addedAt: peer.addedAt,
        bundleVersion: peer.bundleVersion ?? entry?.bundleVersion,
        identityVerifiedAt: peer.identityVerifiedAt ?? entry?.identityVerifiedAt,
        trustState: mergeTrustState(entry?.trustState, peer.trustState) ?? 'trusted',
        identityChanged: peer.identityChanged,
        lastSeenAt: peer.lastSeenAt,
        isOnline: peer.isOnline,
        avatarUrl: entry?.contactProfile?.avatarDataUri,
        isSaved: entry?.isSaved ?? false,
        isHidden: entry?.isHidden ?? false,
      }
    })
    .sort((a, b) => b.addedAt - a.addedAt)
}
