/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { isSameAccountStorageScope, matchesAccountStorageScope } from '@/lib/accountScope'
import type { ChatContact } from '@/lib/types'

export interface StartChatContactQuery {
  localWalletAddress?: string | null
  identityId?: string | null
  walletAddress?: string | null
}

function normalizeReference(value?: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function contactIdentityId(contact: ChatContact): string | undefined {
  return contact.identityId || contact.publicKeyBundle?.identityId || undefined
}

function matchesPeerReference(
  contact: ChatContact,
  identityId?: string,
  walletAddress?: string,
): boolean {
  if (identityId) {
    if (
      contact.identityId === identityId
      || contact.publicKeyBundle?.identityId === identityId
      || contact.walletAddress === identityId
    ) {
      return true
    }
  }

  if (walletAddress) {
    if (isSameAccountStorageScope(contact.walletAddress, walletAddress)) return true
    if (contact.identityId === walletAddress) return true
  }

  return false
}

export function findReusableStartChatContact(
  contacts: readonly ChatContact[],
  query: StartChatContactQuery,
): ChatContact | undefined {
  const identityId = normalizeReference(query.identityId)
  const walletAddress = normalizeReference(query.walletAddress)
  if (!identityId && !walletAddress) return undefined

  return contacts.find((contact) => {
    if (contact.isHidden) return false
    if (!matchesAccountStorageScope(contact.localWalletAddress, query.localWalletAddress)) {
      return false
    }

    const knownIdentity = contactIdentityId(contact)
    if (identityId && knownIdentity && knownIdentity !== identityId) {
      return false
    }

    return matchesPeerReference(contact, identityId, walletAddress)
  })
}

export function startChatRoute(address: string, localWalletAddress?: string | null): string {
  const localQuery = localWalletAddress ? `?local=${encodeURIComponent(localWalletAddress)}` : ''
  return `/(main)/chat/${address}${localQuery}`
}
