/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { createContactShareHttpsLink } from './contactShareLink'
import { normalizeDiscoveryAlias } from './discoveryAlias'

export function findableContactShareLink(
  walletAddress: string | undefined,
  spectreMode: boolean,
  visibility: 'findable' | 'private',
): string | null {
  if (!walletAddress || spectreMode || visibility !== 'findable') return null
  try {
    return createContactShareHttpsLink(walletAddress)
  } catch {
    return null
  }
}

export function contactShareQrPayload(
  findableLink: string | null,
  contactInvite: string | null,
): string | null {
  return findableLink || contactInvite
}

export function contactShareDisplayHandle(displayName?: string | null): string | null {
  if (!displayName?.trim().startsWith('@')) return null
  try {
    return normalizeDiscoveryAlias(displayName) ?? null
  } catch {
    return null
  }
}
