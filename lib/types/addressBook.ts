/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { PublicKeyBundle, SignedContactProfile } from '@spectra/core-crypto'
import type { TrustState } from './messaging'
import type { UserTag } from './tags'

export interface KnownPeer {
  localIdentityId?: string
  localWalletAddress?: string
  identityId: string
  walletAddress?: string
  displayName?: string
  sharedDisplayName?: string
  publicKeyBundle?: PublicKeyBundle
  addedAt: number
  bundleVersion?: number
  identityVerifiedAt?: number
  trustState?: TrustState
  identityChanged?: boolean
  lastSeenAt?: number
  isOnline?: boolean
  contactProfile?: SignedContactProfile
  lastSharedProfileRevision?: number
}

export interface AddressBookEntry {
  key: string
  walletAddress?: string
  lastKnownIdentityId?: string
  displayName?: string
  isSaved: boolean
  isHidden: boolean
  trustState?: TrustState
  contactProfile?: SignedContactProfile
  lastSharedProfileRevision?: number
  lastSharedProfileSignature?: string
  bundleVersion?: number
  identityVerifiedAt?: number
  createdAt: number
  updatedAt: number
}

export interface AddressBookSnapshot {
  version: number
  ownerWalletAddress: string
  entries: AddressBookEntry[]
  tags: UserTag[]
}

export interface EncryptedAddressBookSnapshot {
  version: number
  data: string
  iv: string
  updatedAt: number
}
