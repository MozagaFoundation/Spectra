/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { bytesToHex } from '@/lib/utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  rpcProxyCall: vi.fn(),
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
  buildSplTransferCheckedData,
  getSolanaBalance,
  isValidSolanaAddress,
  parseSol,
  parseSplTokenAccountsResponse,
  waitForSolanaTransaction,
} from './solanaService'

describe('solanaService SPL helpers', () => {
  beforeEach(() => {
    mockState.rpcProxyCall.mockReset()
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
  })

  it('parses jsonParsed token account balances', () => {
    const accounts = parseSplTokenAccountsResponse({
      value: [
        {
          pubkey: 'source-token-account',
          account: {
            data: {
              parsed: {
                info: {
                  tokenAmount: {
                    amount: '1234567',
                    decimals: 6,
                  },
                },
              },
            },
          },
        },
        {
          pubkey: 'empty-token-account',
          account: {
            data: {
              parsed: {
                info: {
                  tokenAmount: {
                    amount: '0',
                    decimals: 6,
                  },
                },
              },
            },
          },
        },
      ],
    })

    expect(accounts).toEqual([
      { pubkey: 'source-token-account', amount: 1_234_567n, decimals: 6 },
      { pubkey: 'empty-token-account', amount: 0n, decimals: 6 },
    ])
  })

  it('builds SPL transferChecked instruction data', () => {
    const data = buildSplTransferCheckedData(1_234_567n, 6)

    expect(bytesToHex(data)).toBe('0c87d612000000000006')
  })

  it('validates SOL amounts and signatures before network work', async () => {
    expect(parseSol('1.5')).toBe(1_500_000_000n)
    expect(parseSol('١٫٥')).toBe(1_500_000_000n)
    expect(() => parseSol('0')).toThrow('Invalid SOL amount')
    expect(() => parseSol('0.0000000001')).toThrow('Invalid SOL amount')

    await expect(waitForSolanaTransaction('bad signature')).rejects.toThrow('Invalid Solana transaction signature')
    expect(mockState.rpcProxyCall).not.toHaveBeenCalled()
  })

  it('surfaces Solana RPC errors through the public balance path', async () => {
    const validAddress = '11111111111111111111111111111111'
    expect(isValidSolanaAddress(validAddress)).toBe(true)
    mockState.rpcProxyCall.mockRejectedValueOnce(new Error('boom'))

    await expect(getSolanaBalance(validAddress)).rejects.toThrow('Solana request failed')
  })
})
