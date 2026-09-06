/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { parseContactInvite, type ContactInvite } from './contactInvite'
import { isValidEXOAddress } from './utils'

const HTTPS_SHARE_PREFIXES = [
  'https://spectraprotocol.org/u/',
  'https://www.spectraprotocol.org/u/',
] as const
const SCHEME_SHARE_PREFIX = 'spectra://u/'
const WALLET_PATTERN = /EXO00[0-9a-f]{38}/i

export type ContactShareTarget =
  | { kind: 'address'; walletAddress: string }
  | { kind: 'invite'; invite: ContactInvite; raw: string }

export function normalizeExoAddress(value: string): string | null {
  const trimmed = value.trim()
  if (!isValidEXOAddress(trimmed)) return null
  return `EXO00${trimmed.slice(5).toLowerCase()}`
}

export function createContactShareHttpsLink(walletAddress: string): string {
  const normalized = normalizeExoAddress(walletAddress)
  if (!normalized) throw new Error('Invalid EXO address')
  return `${HTTPS_SHARE_PREFIXES[0]}${normalized}`
}

export function createContactShareUri(walletAddress: string): string {
  const normalized = normalizeExoAddress(walletAddress)
  if (!normalized) throw new Error('Invalid EXO address')
  return `${SCHEME_SHARE_PREFIX}${normalized}`
}

export function parseContactShareTarget(value: string): ContactShareTarget | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const invite = parseContactInvite(trimmed)
  if (invite) return { kind: 'invite', invite, raw: trimmed }

  const lowered = trimmed.toLowerCase()
  for (const prefix of HTTPS_SHARE_PREFIXES) {
    const httpsIndex = lowered.indexOf(prefix)
    if (httpsIndex < 0) continue
    const address = normalizeExoAddress(trimmed.slice(httpsIndex + prefix.length).split(/[/?#\s]/)[0] ?? '')
    if (address) return { kind: 'address', walletAddress: address }
  }

  const schemeIndex = trimmed.toLowerCase().indexOf(SCHEME_SHARE_PREFIX)
  if (schemeIndex >= 0) {
    const address = normalizeExoAddress(trimmed.slice(schemeIndex + SCHEME_SHARE_PREFIX.length).split(/[/?#\s]/)[0] ?? '')
    if (address) return { kind: 'address', walletAddress: address }
  }

  const direct = normalizeExoAddress(trimmed)
  if (direct) return { kind: 'address', walletAddress: direct }

  const embedded = trimmed.match(WALLET_PATTERN)
  if (!embedded) return null
  const address = normalizeExoAddress(embedded[0]!)
  return address ? { kind: 'address', walletAddress: address } : null
}
