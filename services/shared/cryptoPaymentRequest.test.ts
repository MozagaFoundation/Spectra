/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  applyCryptoPaymentRequestUpdateToContent,
  createCryptoPaymentRequest,
  createCryptoPaymentRequestUpdate,
  parseCryptoPaymentRequest,
  parseCryptoPaymentRequestUpdate,
} from './cryptoPaymentRequest'

describe('crypto payment request wire format', () => {
  it('round-trips a validated payment request', () => {
    const content = createCryptoPaymentRequest({
      requestId: 'request-1',
      requesterIdentityId: 'identity-alice',
      requesterName: 'Alice',
      network: 'ethereum',
      symbol: 'usdt',
      amount: '12.34',
      decimals: 6,
      recipientAddress: '0x1111111111111111111111111111111111111111',
      assetType: 'token',
      contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      tokenStandard: 'erc20',
      createdAt: 123,
    })

    expect(parseCryptoPaymentRequest(content)).toMatchObject({
      requestId: 'request-1',
      network: 'ethereum',
      symbol: 'USDT',
      amount: '12.34',
      state: 'open',
    })
  })

  it('applies a matching paid update and rejects mismatches', () => {
    const request = createCryptoPaymentRequest({
      requestId: 'request-2',
      network: 'mozaga',
      symbol: 'EXO',
      amount: '1.5',
      decimals: 18,
      recipientAddress: 'EXO_RECEIVER',
      assetType: 'native',
      createdAt: 123,
    })
    const update = parseCryptoPaymentRequestUpdate(createCryptoPaymentRequestUpdate({
      requestId: 'request-2',
      requestMessageId: 'message-1',
      network: 'mozaga',
      symbol: 'EXO',
      amount: '1.5',
      txHash: 'abc123',
      status: 'pending',
      paidAt: 456,
    }))

    expect(update).not.toBeNull()
    const updated = applyCryptoPaymentRequestUpdateToContent(request, update!)
    expect(parseCryptoPaymentRequest(updated!)).toMatchObject({
      state: 'paid',
      settlement: {
        txHash: 'abc123',
        status: 'pending',
      },
    })

    expect(applyCryptoPaymentRequestUpdateToContent(request, { ...update!, amount: '2' })).toBeNull()
  })

  it('rejects malformed or unsafe requests', () => {
    expect(parseCryptoPaymentRequest('not json')).toBeNull()
    expect(() => createCryptoPaymentRequest({
      requestId: 'request-3',
      network: 'bitcoin',
      symbol: 'BTC',
      amount: '0',
      decimals: 8,
      recipientAddress: 'bc1receiver',
      assetType: 'native',
      createdAt: 123,
    })).toThrow('Invalid crypto payment request')
  })
})
