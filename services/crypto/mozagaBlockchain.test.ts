/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  torAwareFetch: vi.fn(),
}))

vi.mock('@/services/tor/torFetch', () => ({
  torAwareFetch: mockState.torAwareFetch,
}))

vi.mock('@/lib/i18n', () => ({
  getCurrentLocaleTag: () => 'en-US',
  translate: (key: string, options?: { ns?: string }) => `${options?.ns ?? 'common'}:${key}`,
}))

vi.mock('./cryptoNetworkAdmission', () => ({
  assertCryptoNetworkAdmission: vi.fn(),
}))

describe('mozagaBlockchain asset symbol lookup', () => {
  beforeEach(() => {
    mockState.torAwareFetch.mockReset()
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
  })

  it('uses the canonical Mozaga mainnet chain ID', async () => {
    const { MOZAGA_MAINNET_CHAIN_ID } = await import('./mozagaBlockchain')

    expect(MOZAGA_MAINNET_CHAIN_ID).toBe(27_182_818n)
  })

  it('resolves an asset token id by symbol', async () => {
    mockState.torAwareFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ result: '0xassetid' }),
    })

    const { getAssetBySymbol } = await import('./mozagaBlockchain')

    await expect(getAssetBySymbol('usdt')).resolves.toBe('0xassetid')
    expect(mockState.torAwareFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"asset_getAssetsBySymbol"'),
    }))
    expect(mockState.torAwareFetch.mock.calls[0]?.[1]?.body).toContain('"USDT"')
  })

  it('returns null when a symbol is not issued on Mozaga', async () => {
    mockState.torAwareFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ error: { code: -32000, message: 'symbol not found' } }),
    })

    const { getAssetBySymbol } = await import('./mozagaBlockchain')

    await expect(getAssetBySymbol('missing')).resolves.toBeNull()
  })
})

describe('mozagaBlockchain amount parsing', () => {
  beforeEach(() => {
    mockState.torAwareFetch.mockReset()
    ;(globalThis as { __DEV__?: boolean }).__DEV__ = false
  })

  it('parses EXO amounts strictly without truncating precision', async () => {
    const { parseEXO } = await import('./mozagaBlockchain')

    expect(parseEXO('1.25')).toBe(1_250_000_000_000_000_000n)
    expect(parseEXO('١٫٥')).toBe(1_500_000_000_000_000_000n)
    expect(() => parseEXO('1.1234567890123456789')).toThrow('Invalid EXO amount')
    expect(() => parseEXO('0')).toThrow('Invalid EXO amount')
  })

  it('parses asset amounts with shared localized decimal rules', async () => {
    const { parseAssetAmount } = await import('./mozagaBlockchain')

    expect(parseAssetAmount('1,25', 6)).toBe('0x1312d0')
    expect(parseAssetAmount('١٫٢٥', 6)).toBe('0x1312d0')
    expect(() => parseAssetAmount('not-a-number', 6)).toThrow('Invalid asset amount')
    expect(() => parseAssetAmount('1.0000001', 6)).toThrow('Invalid asset amount')
    expect(() => parseAssetAmount('0', 6)).toThrow('Invalid asset amount')
  })

  it('rejects invalid asset transfer amounts before any RPC or signing work', async () => {
    const { transferAsset } = await import('./mozagaBlockchain')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(transferAsset(
      '00',
      '00',
      'EXO0000000000000000000000000000000000000000',
      'EXO0011111111111111111111111111111111111111',
      '0xasset',
      'abc',
      6,
    )).rejects.toThrow('Invalid asset amount')
    expect(mockState.torAwareFetch).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('mozagaBlockchain display helpers', () => {
  it('localizes asset class names and unknown fallbacks', async () => {
    const { getAssetClassName } = await import('./mozagaBlockchain')

    expect(getAssetClassName(0)).toBe('crypto:Utility')
    expect(getAssetClassName(1)).toBe('crypto:Equity')
    expect(getAssetClassName(2)).toBe('crypto:Debt')
    expect(getAssetClassName(999)).toBe('common:Unknown')
  })
})
