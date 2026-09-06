/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  deriveApplicationBadgeCount,
  deriveTabBadgeCounts,
} from './badgeDomains'

describe('badge domain formulas', () => {
  it('keeps chat and wallet tab domains separate while combining them for the OS badge', () => {
    const domains = {
      direct: 2,
      group: 3,
      walletTransfer: 7,
    }

    expect(deriveTabBadgeCounts(domains)).toEqual({
      chats: 5,
      wallets: 7,
    })
    expect(deriveApplicationBadgeCount(domains)).toBe(12)
  })

  it('normalizes invalid domain values independently', () => {
    expect(deriveTabBadgeCounts({
      direct: -2,
      group: Number.NaN,
      walletTransfer: Number.POSITIVE_INFINITY,
    })).toEqual({
      chats: 0,
      wallets: 0,
    })
  })
})
