/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  looksLikeWalletAddress,
  normalizeAddressBookWalletAddress,
} from './contactKeys'

const WALLET = 'EXO00abcdefabcdefabcdefabcdefabcdefabcdefab'

describe('addressBook contact keys', () => {
  it('canonicalizes valid EXO addresses for stable local keys', () => {
    expect(normalizeAddressBookWalletAddress(`  ${WALLET.toUpperCase()}  `)).toBe(WALLET)
    expect(normalizeAddressBookWalletAddress(WALLET.toLowerCase())).toBe(WALLET)
  })

  it('trims non-wallet values without classifying them as wallets', () => {
    expect(normalizeAddressBookWalletAddress('  identity-alice  ')).toBe('identity-alice')
    expect(looksLikeWalletAddress('identity-alice')).toBe(false)
    expect(looksLikeWalletAddress('0xabcdef')).toBe(false)
  })

  it('accepts only complete EXO wallet addresses', () => {
    expect(looksLikeWalletAddress(` ${WALLET} `)).toBe(true)
    expect(looksLikeWalletAddress('EXO00abcdef')).toBe(false)
    expect(looksLikeWalletAddress(null)).toBe(false)
  })
})
