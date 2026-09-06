/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { ChatContact } from '@/lib/types'
import { matchesStrictAccountStorageScope } from '@/lib/accountScope'
import { parseDiscoveryAliasPrefix } from '@/lib/discoveryAlias'
import { getCurrentLocaleTag } from '@/lib/i18n'
import { isValidEXOAddress } from '@/lib/utils'

export type ContactsDiscoveryMatch = {
  alias?: string
  walletAddress: string
}

export type ContactsDiscoveryQuery =
  | { kind: 'none' }
  | { kind: 'alias'; query: string }
  | { kind: 'exo'; walletAddress: string }

function getContactSortLabel(contact: ChatContact): string {
  return (contact.displayName || contact.walletAddress || contact.identityId || '').trim()
}

export function sortContactsAlphabetically(contacts: ChatContact[]): ChatContact[] {
  const locale = getCurrentLocaleTag()
  return [...contacts].sort((a, b) => {
    const nameCompare = getContactSortLabel(a).localeCompare(getContactSortLabel(b), locale, {
      numeric: true,
      sensitivity: 'base',
    })
    if (nameCompare !== 0) return nameCompare

    const addressCompare = (a.walletAddress || a.identityId).localeCompare(
      b.walletAddress || b.identityId,
      locale,
      { numeric: true, sensitivity: 'base' },
    )
    if (addressCompare !== 0) return addressCompare

    return (b.addedAt ?? 0) - (a.addedAt ?? 0)
  })
}

export function getVisibleContacts(
  contacts: ChatContact[],
  localWalletAddress?: string | null,
): ChatContact[] {
  return contacts.filter((contact) =>
    contact.isSaved
    && !contact.isHidden
    && matchesStrictAccountStorageScope(contact.localWalletAddress, localWalletAddress)
  )
}

export function filterAndDedupeContacts(
  contacts: ChatContact[],
  query: string,
): ChatContact[] {
  const normalizedQuery = query.trim().toLowerCase()
  const base = normalizedQuery
    ? contacts.filter((contact) => (
        contact.displayName.toLowerCase().includes(normalizedQuery)
        || contact.identityId.toLowerCase().includes(normalizedQuery)
        || Boolean(contact.walletAddress?.toLowerCase().includes(normalizedQuery))
      ))
    : contacts

  const seenWallets = new Map<string, ChatContact>()
  const deduped: ChatContact[] = []
  for (const contact of base) {
    if (!contact.walletAddress) {
      deduped.push(contact)
      continue
    }

    const walletKey = `${contact.localWalletAddress || 'active'}:${contact.walletAddress}`
    const previous = seenWallets.get(walletKey)
    if (!previous) {
      seenWallets.set(walletKey, contact)
      deduped.push(contact)
    } else if ((contact.addedAt ?? 0) > (previous.addedAt ?? 0)) {
      deduped[deduped.indexOf(previous)] = contact
      seenWallets.set(walletKey, contact)
    }
  }

  return sortContactsAlphabetically(deduped)
}

export function classifyContactsDiscoveryQuery(query: string): ContactsDiscoveryQuery {
  const trimmed = query.trim()
  if (!trimmed) return { kind: 'none' }
  if (parseDiscoveryAliasPrefix(trimmed)) return { kind: 'alias', query: trimmed }
  if (isValidEXOAddress(trimmed)) return { kind: 'exo', walletAddress: trimmed }
  return { kind: 'none' }
}

export function excludeSavedDiscoveryMatches(
  matches: ContactsDiscoveryMatch[],
  savedContacts: Array<{ walletAddress?: string | null }>,
  ownWalletAddress?: string | null,
): ContactsDiscoveryMatch[] {
  const saved = new Set<string>()
  for (const contact of savedContacts) {
    if (contact.walletAddress) saved.add(contact.walletAddress.toLowerCase())
  }
  const own = ownWalletAddress?.toLowerCase() ?? null
  return matches.filter((match) => {
    const wallet = match.walletAddress.toLowerCase()
    if (own && wallet === own) return false
    return !saved.has(wallet)
  })
}

export function buildContactChatRoute(contact: ChatContact): string {
  const chatAddress = contact.walletAddress || contact.identityId
  const localQuery = contact.localWalletAddress ? `?local=${encodeURIComponent(contact.localWalletAddress)}` : ''
  return `/(main)/chat/${encodeURIComponent(chatAddress)}${localQuery}`
}

