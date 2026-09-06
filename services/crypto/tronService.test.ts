/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  tronProxyCall: vi.fn(),
}))

vi.mock('@/lib/i18n', () => ({
  getCurrentLocaleTag: () => 'en-US',
}))

vi.mock('@/services/backend/rpcProxy', () => ({
  tronProxyCall: mockState.tronProxyCall,
}))

vi.mock('./cryptoNetworkAdmission', () => ({
  assertCryptoNetworkAdmission: vi.fn(),
}))

import {
  buildTrc20BalanceOfParameter,
  buildTrc20TransferParameter,
  getTronBalance,
  parseTrx,
  waitForTronTransaction,
} from './tronService'

const TRON_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const TRON_GENESIS_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'

describe('tronService TRC-20 ABI helpers', () => {
  beforeEach(() => {
    mockState.tronProxyCall.mockReset()
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
  })

  it('encodes balanceOf address parameters as 32-byte ABI words without the Tron prefix', () => {
    const parameter = buildTrc20BalanceOfParameter(TRON_USDT_CONTRACT)

    expect(parameter).toHaveLength(64)
    expect(parameter).toMatch(/^0{24}[0-9a-f]{40}$/)
  })

  it('encodes transfer address and uint256 amount parameters', () => {
    const parameter = buildTrc20TransferParameter(TRON_GENESIS_ADDRESS, 123_456n)

    expect(parameter).toHaveLength(128)
    expect(parameter.slice(0, 64)).toMatch(/^0{24}[0-9a-f]{40}$/)
    expect(parameter.slice(64)).toBe('0'.repeat(59) + '1e240')
  })

  it('validates TRX amounts and transaction hashes before polling', async () => {
    expect(parseTrx('1.5')).toBe(1_500_000n)
    expect(parseTrx('١٫٥')).toBe(1_500_000n)
    expect(() => parseTrx('0')).toThrow('Invalid TRX amount')
    expect(() => parseTrx('0.0000001')).toThrow('Invalid TRX amount')

    await expect(waitForTronTransaction('not-a-tron-hash')).rejects.toThrow('Invalid Tron transaction hash')
    expect(mockState.tronProxyCall).not.toHaveBeenCalled()
  })

  it('surfaces Tron RPC transport errors through the public balance path', async () => {
    mockState.tronProxyCall.mockRejectedValueOnce(new Error('RPC proxy request failed'))

    await expect(getTronBalance(TRON_GENESIS_ADDRESS)).rejects.toThrow('RPC proxy request failed')
  })
})
