/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  rpcProxyCall: vi.fn(),
}))

vi.mock('@/lib/constants', () => ({
  STORAGE_KEYS: {
    VAULT: 'exo_vault',
  },
}))

vi.mock('@/lib/i18n', () => ({
  getCurrentLocaleTag: () => 'en-US',
}))

vi.mock('@/services/backend/rpcProxy', () => ({
  rpcProxyCall: mockState.rpcProxyCall,
}))

vi.mock('./cryptoNetworkAdmission', () => ({
  assertCryptoNetworkAdmission: vi.fn(),
}))

import {
  formatBitcoin,
  getBitcoinBalance,
  isValidBitcoinAddress,
  parseBitcoin,
  waitForBitcoinTransaction,
} from './bitcoinService'

const ADDRESS = 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu'

describe('bitcoinService', () => {
  beforeEach(() => {
    mockState.rpcProxyCall.mockReset()
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
  })

  it('validates native SegWit addresses and BTC amounts', () => {
    expect(isValidBitcoinAddress(ADDRESS)).toBe(true)
    expect(isValidBitcoinAddress('1BoatSLRHtKNngkdXEeobR76b53LETtpyT')).toBe(false)
    expect(parseBitcoin('0.00000546')).toBe(546n)
    expect(formatBitcoin(12_345_678n)).toBe('0.12345678')
    expect(() => parseBitcoin('0')).toThrow('Invalid BTC amount')
    expect(() => parseBitcoin('0.000000001')).toThrow('Invalid BTC amount')
  })

  it('queries UTXOs through the backend RPC proxy and formats the confirmed balance', async () => {
    mockState.rpcProxyCall.mockResolvedValueOnce({
      success: true,
      unspents: [
        { txid: 'a'.repeat(64), vout: 0, amount: '0.1' },
        { txid: 'b'.repeat(64), vout: 1, amount: '0.02' },
        { txid: 'not-a-txid', vout: 2, amount: '1' },
      ],
    })

    await expect(getBitcoinBalance(ADDRESS)).resolves.toBe('0.12')
    expect(mockState.rpcProxyCall).toHaveBeenCalledWith('bitcoin', 'scantxoutset', [
      'start',
      [`addr(${ADDRESS})`],
    ])
  })

  it('rejects malformed transaction hashes before polling', async () => {
    await expect(waitForBitcoinTransaction('0xnotbitcoin')).rejects.toThrow('Invalid Bitcoin transaction hash')
    expect(mockState.rpcProxyCall).not.toHaveBeenCalled()
  })
})
