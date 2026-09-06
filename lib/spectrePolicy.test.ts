/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  canReceiveMediaInSpectre,
  canUseCryptoNetworkInSpectre,
  getSpectreChatRestrictionMessage,
  getSpectreCryptoRestrictionMessage,
  isCryptoReceiptContent,
  SPECTRE_TRANSFER_MESSAGE,
} from './spectrePolicy'

describe('spectrePolicy', () => {
  it('allows regular accounts to use all crypto networks', () => {
    expect(canUseCryptoNetworkInSpectre({ enabled: false }, 'ethereum')).toBe(true)
    expect(canUseCryptoNetworkInSpectre({ enabled: false }, 'mozaga')).toBe(true)
  })

  it('blocks all crypto networks for active Spectre accounts', () => {
    const state = { enabled: true, accountMode: 'mnemonic' as const }

    expect(canUseCryptoNetworkInSpectre(state, 'ethereum')).toBe(false)
    expect(canUseCryptoNetworkInSpectre(state, 'mozaga')).toBe(false)
    expect(getSpectreCryptoRestrictionMessage(state, 'ethereum')).toContain('Crypto features')
  })

  it('blocks media, crypto receipts, and tag fanout in Spectre chat', () => {
    const state = { enabled: true }

    expect(getSpectreChatRestrictionMessage(state, { hasAttachments: true })).toContain('plain encrypted text')
    expect(getSpectreChatRestrictionMessage(state, { hasSpecialDelivery: true })).toContain('plain encrypted text')
    expect(getSpectreChatRestrictionMessage(state, { content: '[CRYPTO_TX_V2:mozaga:EXO:1:abc]' })).toContain('Transfers')
    expect(getSpectreChatRestrictionMessage(state, { hasTags: true })).toContain('Tags')
    expect(getSpectreChatRestrictionMessage(state, { content: 'hello #team' })).toContain('Tags')
    expect(getSpectreChatRestrictionMessage(state, { content: 'plain text' })).toBeNull()
  })

  it('blocks received media while Spectre policy is active', () => {
    expect(canReceiveMediaInSpectre({ enabled: false })).toBe(true)
    expect(canReceiveMediaInSpectre({ enabled: true })).toBe(false)
    expect(canReceiveMediaInSpectre({ enabled: false, walletIsSpectre: true })).toBe(false)
  })

  it('recognizes supported crypto receipt markers', () => {
    expect(isCryptoReceiptContent('[CRYPTO_TX:EXO:1:abc]')).toBe(true)
    expect(isCryptoReceiptContent('[CRYPTO_TX_V2:mozaga:EXO:1:abc]')).toBe(true)
    expect(isCryptoReceiptContent('[CRYPTO_TX_V3:mozaga:EXO:1:abc:confirmed]')).toBe(true)
    expect(isCryptoReceiptContent('hello')).toBe(false)
  })

  it('blocks crypto payment request payloads in Spectre chat', () => {
    expect(getSpectreChatRestrictionMessage(
      { enabled: true },
      { content: JSON.stringify({ v: 2, type: 'crypto_payment_request', requestId: 'request-1' }) },
    )).toBe(SPECTRE_TRANSFER_MESSAGE)
  })
})
