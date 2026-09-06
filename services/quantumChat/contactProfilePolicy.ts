/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import type { ChatContact } from '@/lib/types'

export function canShareOwnContactProfileWith(
  contact: Pick<ChatContact, 'trustState' | 'identityChanged' | 'isSaved'> | undefined,
  options: { requireSavedContact?: boolean } = {},
): boolean {
  if (!contact) return false
  return (!options.requireSavedContact || contact.isSaved === true)
    && (contact.trustState === 'trusted' || contact.trustState === 'verified')
    && !contact.identityChanged
}
