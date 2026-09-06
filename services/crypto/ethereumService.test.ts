/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  rpcProxyCall: vi.fn(),
}))

vi.mock('@/services/backend/rpcProxy', () => ({
  rpcProxyCall: mockState.rpcProxyCall,
}))

vi.mock('@/lib/utils', () => ({
  bytesToHex: (bytes: Uint8Array) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join(''),
  hexToBytes: (hex: string) => {
    const clean = hex.replace(/^0x/i, '')
    return Uint8Array.from(clean.match(/.{1,2}/g)?.map((part) => parseInt(part, 16)) ?? [])
  },
}))

vi.mock('./cryptoNetworkAdmission', () => ({
  assertCryptoNetworkAdmission: vi.fn(),
}))

import {
  formatEth,
  getEvmNativeBalance,
  isValidEthAddress,
  parseEth,
  sendERC20Transfer,
  waitForEvmTransaction,
} from './ethereumService'

const PRIVATE_KEY = '01'.repeat(32)
const FROM = `0x${'11'.repeat(20)}`
const TO = `0x${'22'.repeat(20)}`
const TOKEN = `0x${'33'.repeat(20)}`

describe('ethereumService', () => {
  beforeEach(() => {
    mockState.rpcProxyCall.mockReset()
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
  })

  it('validates and formats Ethereum amounts without precision loss', () => {
    expect(parseEth('1.25')).toBe(1_250_000_000_000_000_000n)
    expect(formatEth('0x1158e460913d00000')).toBe('20.0')
    expect(() => parseEth('0')).toThrow('greater than zero')
    expect(() => parseEth('1.1234567890123456789')).toThrow('too many decimal places')
    expect(() => parseEth('١٫٢٥')).toThrow('Invalid ETH amount')
  })

  it('validates canonical EVM addresses', () => {
    expect(isValidEthAddress(FROM)).toBe(true)
    expect(isValidEthAddress('0x123')).toBe(false)
    expect(isValidEthAddress(`0x${'zz'.repeat(20)}`)).toBe(false)
  })

  it('routes Ethereum requests through the RPC proxy', async () => {
    mockState.rpcProxyCall.mockResolvedValueOnce('0xde0b6b3a7640000')

    await expect(getEvmNativeBalance('ethereum', FROM)).resolves.toBe('1.0')
    expect(mockState.rpcProxyCall).toHaveBeenCalledWith('ethereum', 'eth_getBalance', [FROM, 'latest'])
  })

  it('builds and broadcasts ERC-20 transfers only after strict token amount parsing', async () => {
    mockState.rpcProxyCall
      .mockResolvedValueOnce('0x2')
      .mockResolvedValueOnce({
        baseFeePerGas: ['0x3b9aca00', '0x3b9aca00'],
        reward: [['0x77359400']],
      })
      .mockResolvedValueOnce('0x5208')
      .mockResolvedValueOnce('0xsent')

    await expect(sendERC20Transfer(PRIVATE_KEY, FROM, TOKEN, TO, '1.25', 6)).resolves.toEqual({
      txHash: '0xsent',
    })

    expect(mockState.rpcProxyCall.mock.calls.map((call) => call[1])).toEqual([
      'eth_getTransactionCount',
      'eth_feeHistory',
      'eth_estimateGas',
      'eth_sendRawTransaction',
    ])
    expect(mockState.rpcProxyCall.mock.calls[2][2][0].data).toContain('a9059cbb')
    expect(mockState.rpcProxyCall.mock.calls[3][2][0]).toMatch(/^0x02[0-9a-f]+$/)

    mockState.rpcProxyCall.mockReset()
    mockState.rpcProxyCall
      .mockResolvedValueOnce('0x2')
      .mockResolvedValueOnce({
        baseFeePerGas: ['0x3b9aca00', '0x3b9aca00'],
        reward: [['0x77359400']],
      })

    await expect(sendERC20Transfer(PRIVATE_KEY, FROM, TOKEN, TO, '1.0000001', 6)).rejects.toThrow('too many decimal places')
    expect(mockState.rpcProxyCall).toHaveBeenCalledTimes(2)
  })

  it('rejects malformed transaction hashes before polling RPC', async () => {
    await expect(waitForEvmTransaction('ethereum', 'not-a-hash')).rejects.toThrow('Invalid transaction hash')
    expect(mockState.rpcProxyCall).not.toHaveBeenCalled()
  })
})
