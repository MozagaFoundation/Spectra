/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const CONTACT_INVITE_PREFIX = 'spectra:contact:v1:'
const CONTACT_CARD_PREFIX = 'spectra:contact-card:v1:'
const IDENTITY_ID_PATTERN = /^[^\s:\0]{8,256}$/
const MAILBOX_CAPABILITY_PATTERN = /^smbx[12]\.[^\s:]{8,250}$/
const CONTACT_CARD_ID_PATTERN = /^scc1\.[0-9a-f]{32}$/
const CONTACT_CARD_CAPABILITY_PATTERN = /^sccap1\.[A-Za-z0-9_-]{43}$/
const CONTACT_CARD_PROFILE_CAPABILITY_PATTERN = /^sccpc1\.[A-Za-z0-9_-]{43}$/

export interface DirectContactInvite {
  kind: 'direct'
  identityId: string
  mailboxCapability: string
}

export interface OneTimeContactCardInvite {
  kind: 'contact_card'
  cardId: string
  cardCapability: string
  profileCapability?: string
}

export type ContactInvite = DirectContactInvite | OneTimeContactCardInvite

function isValidInvite(invite: Pick<DirectContactInvite, 'identityId' | 'mailboxCapability'>): boolean {
  return IDENTITY_ID_PATTERN.test(invite.identityId)
    && MAILBOX_CAPABILITY_PATTERN.test(invite.mailboxCapability)
}

export function isDirectContactInvite(invite: ContactInvite): invite is DirectContactInvite {
  return invite.kind === 'direct'
}

export function isOneTimeContactCardInvite(
  invite: ContactInvite,
): invite is OneTimeContactCardInvite {
  return invite.kind === 'contact_card'
}

export function createContactInvite(invite: Omit<DirectContactInvite, 'kind'>): string {
  if (!isValidInvite(invite)) {
    throw new Error('Invalid contact invitation')
  }
  return `${CONTACT_INVITE_PREFIX}${encodeURIComponent(invite.identityId)}:${encodeURIComponent(
    invite.mailboxCapability,
  )}`
}

export function createOneTimeContactCardInvite(
  invite: Omit<OneTimeContactCardInvite, 'kind'>,
): string {
  if (
    !CONTACT_CARD_ID_PATTERN.test(invite.cardId) ||
    !CONTACT_CARD_CAPABILITY_PATTERN.test(invite.cardCapability) ||
    (invite.profileCapability !== undefined
      && !CONTACT_CARD_PROFILE_CAPABILITY_PATTERN.test(invite.profileCapability))
  ) {
    throw new Error('Invalid one-time contact card')
  }
  return `${CONTACT_CARD_PREFIX}${invite.cardId}:${invite.cardCapability}${
    invite.profileCapability ? `:${invite.profileCapability}` : ''
  }`
}

export function parseContactInvite(value: string): ContactInvite | null {
  const normalized = value.trim()
  const cardPrefixIndex = normalized.indexOf(CONTACT_CARD_PREFIX)
  const directPrefixIndex = normalized.indexOf(CONTACT_INVITE_PREFIX)
  const prefixIndex = [cardPrefixIndex, directPrefixIndex]
    .filter((index) => index >= 0)
    .reduce((first, index) => Math.min(first, index), Number.POSITIVE_INFINITY)
  const inviteValue = Number.isFinite(prefixIndex) ? normalized.slice(prefixIndex) : normalized

  if (inviteValue.startsWith(CONTACT_CARD_PREFIX)) {
    const encoded = inviteValue.slice(CONTACT_CARD_PREFIX.length)
    const parts = encoded.split(':')
    if (parts.length < 2 || parts.length > 3 || parts.some((part) => !part)) {
      return null
    }
    const invite = {
      kind: 'contact_card' as const,
      cardId: parts[0]!,
      cardCapability: parts[1]!,
      ...(parts[2] ? { profileCapability: parts[2] } : {}),
    }
    return CONTACT_CARD_ID_PATTERN.test(invite.cardId)
      && CONTACT_CARD_CAPABILITY_PATTERN.test(invite.cardCapability)
      && (
        invite.profileCapability === undefined
        || CONTACT_CARD_PROFILE_CAPABILITY_PATTERN.test(invite.profileCapability)
      )
      ? invite
      : null
  }
  if (!inviteValue.startsWith(CONTACT_INVITE_PREFIX)) return null

  const encoded = inviteValue.slice(CONTACT_INVITE_PREFIX.length)
  const separator = encoded.indexOf(':')
  if (separator < 1 || separator === encoded.length - 1 || encoded.indexOf(':', separator + 1) >= 0) {
    return null
  }

  try {
    const invite = {
      kind: 'direct' as const,
      identityId: decodeURIComponent(encoded.slice(0, separator)),
      mailboxCapability: decodeURIComponent(encoded.slice(separator + 1)),
    }
    return isValidInvite(invite) ? invite : null
  } catch {
    return null
  }
}
