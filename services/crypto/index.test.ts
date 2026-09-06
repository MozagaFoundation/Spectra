/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  createChainCryptoReceiptMessage,
  isCryptoReceipt,
  parseCryptoReceipt,
  resolveCryptoReceiptNetwork,
} from './receipts'

describe('crypto receipt message format', () => {
  it('round-trips chain-aware receipts with encoded recipient metadata', () => {
    const message = createChainCryptoReceiptMessage(
      'mozaga',
      'USDT',
      '12.34',
      '0xabc123',
      'alice:identity',
      'Alice / Treasury',
    )

    expect(isCryptoReceipt(message)).toBe(true)
    expect(parseCryptoReceipt(message)).toEqual({
      chainId: 'mozaga',
      symbol: 'USDT',
      amount: '12.34',
      txHash: '0xabc123',
      recipientIdentityId: 'alice:identity',
      recipientName: 'Alice / Treasury',
    })
  })

  it('round-trips failed status receipts without breaking V2 receipts', () => {
    const message = createChainCryptoReceiptMessage(
      'ethereum',
      'ETH',
      '0.25',
      '0xabc123',
      undefined,
      undefined,
      'failed',
    )

    expect(message).toBe('[CRYPTO_TX_V3:ethereum:ETH:0.25:0xabc123:failed]')
    expect(isCryptoReceipt(message)).toBe(true)
    expect(parseCryptoReceipt(message)).toEqual({
      chainId: 'ethereum',
      symbol: 'ETH',
      amount: '0.25',
      txHash: '0xabc123',
      status: 'failed',
      recipientIdentityId: undefined,
      recipientName: undefined,
    })
  })

  it('keeps parsing legacy V1 receipts for stored chat history', () => {
    expect(parseCryptoReceipt('[CRYPTO_TX:EXO:1.5:0xdeadbeef]')).toEqual({
      symbol: 'EXO',
      amount: '1.5',
      txHash: '0xdeadbeef',
      recipientIdentityId: undefined,
      recipientName: undefined,
    })
  })

  it('rejects ambiguous or malformed receipt strings', () => {
    const malformed = [
      '[CRYPTO_TX_V2:mozaga:spoof:EXO:1:0xabc]',
      '[CRYPTO_TX_V2:mozaga:EXO:1.2.3:0xabc]',
      '[CRYPTO_TX_V2:mozaga:EXO:0:0xabc]',
      '[CRYPTO_TX_V2:mozaga:EXO:-1:0xabc]',
      'prefix [CRYPTO_TX_V2:mozaga:EXO:1:0xabc]',
    ]

    for (const content of malformed) {
      expect(isCryptoReceipt(content)).toBe(false)
      expect(parseCryptoReceipt(content)).toBeNull()
    }
  })

  it('does not create legacy or delimiter-ambiguous receipt messages', () => {
    expect(() => createChainCryptoReceiptMessage('', 'EXO', '1', '0xabc')).toThrow('Invalid crypto receipt chain id')
    expect(() => createChainCryptoReceiptMessage('mozaga:spoof', 'EXO', '1', '0xabc')).toThrow('Invalid crypto receipt chain id')
  })

  it('does not export the legacy V1 receipt creator', async () => {
    const cryptoModule = await import('./receipts')

    expect('createCryptoReceiptMessage' in cryptoModule).toBe(false)
  })

  it('resolves receipt wallet networks from V2 chains and legacy symbols', () => {
    expect(resolveCryptoReceiptNetwork({ chainId: 'ethereum', symbol: 'USDT' })).toBe('ethereum')
    expect(resolveCryptoReceiptNetwork({ symbol: 'BTC' })).toBe('bitcoin')
    expect(resolveCryptoReceiptNetwork({ symbol: 'USDT' })).toBe('mozaga')
  })
})
