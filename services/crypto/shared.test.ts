/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  torAwareFetch: vi.fn(),
  dilithiumSign: vi.fn(() => new Uint8Array([0xaa, 0xbb])),
  getNonce: vi.fn(async () => 7n),
  getChainId: vi.fn(async () => 27_182_818n),
}))

vi.mock('@/services/tor/torFetch', () => ({
  torAwareFetch: mockState.torAwareFetch,
}))

vi.mock('@spectra/identity-vault', () => ({
  Dilithium: {
    init: vi.fn(async () => ({ sign: mockState.dilithiumSign })),
  },
  hexToBytes: (hex: string) => {
    const clean = hex.replace(/^0x/i, '')
    return Uint8Array.from(clean.match(/.{1,2}/g)?.map((part) => parseInt(part, 16)) ?? [])
  },
}))

vi.mock('./mozagaBlockchain', () => ({
  getNonce: mockState.getNonce,
  getChainId: mockState.getChainId,
  MIN_GAS_EXO: 216_500n,
  MIN_GAS_PRICE: 1_000_000_000n,
  RPC_URL: 'https://mozaga.example',
}))

vi.mock('./cryptoNetworkAdmission', () => ({
  assertCryptoNetworkAdmission: vi.fn(),
}))

describe('shared crypto transaction utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
  })

  it('calculates gas from zero and non-zero payload bytes', async () => {
    const { calculateGas } = await import('./shared')

    expect(calculateGas(new Uint8Array([0x00, 0x01, 0xff]))).toBe(216_536n)
  })

  it('sends JSON-RPC requests through torAwareFetch and surfaces RPC errors', async () => {
    mockState.torAwareFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: '0x1' }),
    })

    const { rpcCall } = await import('./shared')

    await expect(rpcCall('eth_blockNumber')).resolves.toBe('0x1')
    expect(mockState.torAwareFetch).toHaveBeenCalledWith('https://mozaga.example', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }))
    expect(JSON.parse(mockState.torAwareFetch.mock.calls[0][1].body)).toMatchObject({
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
    })

    mockState.torAwareFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { code: -32000, message: 'boom' } }),
    })

    await expect(rpcCall('eth_blockNumber')).rejects.toThrow('boom')
  })

  it('signs transaction hashes locally and broadcasts encoded raw transactions', async () => {
    mockState.torAwareFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: '0xtxhash' }),
    })

    const { signAndSendTransaction } = await import('./shared')

    await expect(signAndSendTransaction({
      privateKeyHex: '0a0b',
      publicKeyHex: '0c0d',
      fromAddress: 'EXO0000000000000000000000000000000000000000',
      toAddress: 'EXO0011111111111111111111111111111111111111',
      txData: new Uint8Array([0x70, 0x01]),
      value: 5n,
    })).resolves.toEqual({
      txHash: '0xtxhash',
      from: 'EXO0000000000000000000000000000000000000000',
    })

    expect(mockState.getNonce).toHaveBeenCalledWith(
      'EXO0000000000000000000000000000000000000000',
      'mozaga',
    )
    expect(mockState.getChainId).toHaveBeenCalledWith('mozaga')
    expect(mockState.dilithiumSign).toHaveBeenCalled()
    const body = JSON.parse(mockState.torAwareFetch.mock.calls[0][1].body)
    expect(body.method).toBe('eth_sendRawTransaction')
    expect(body.params[0]).toMatch(/^0x[0-9a-f]+$/)
  })
})
