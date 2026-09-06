/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', () => ({
  getCurrentLocaleTag: () => 'en-US',
}))

import {
  SOLANA_TOKENS,
  TRON_TOKENS,
  formatNetworkTokenAmount,
  parseNetworkTokenAmount,
} from './tokenRegistry'

describe('tokenRegistry', () => {
  it('registers USDT on Tron and Solana with 6 decimals', () => {
    expect(TRON_TOKENS[0]).toMatchObject({
      network: 'tron',
      standard: 'trc20',
      symbol: 'USDT',
      decimals: 6,
    })
    expect(SOLANA_TOKENS[0]).toMatchObject({
      network: 'solana',
      standard: 'spl',
      symbol: 'USDT',
      decimals: 6,
    })
  })

  it('formats and parses token units consistently', () => {
    expect(formatNetworkTokenAmount(123_456_700n, 6)).toBe('123.4567')
    expect(parseNetworkTokenAmount('123.4567', 6)).toBe(123_456_700n)
    expect(() => parseNetworkTokenAmount('0', 6)).toThrow('Invalid token amount')
  })
})
