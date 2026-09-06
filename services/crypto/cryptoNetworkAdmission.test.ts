/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  spectre: {
    enabled: false,
    isApplying: false,
    spectreAccountMode: null as 'mnemonic' | 'persistent_generated' | 'expendable' | null,
  },
  wallet: {
    wallet: null as { spectreMode?: boolean } | null,
  },
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: {
    getState: () => state.spectre,
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => state.wallet,
  },
}))

import {
  assertCryptoNetworkAdmission,
  getCryptoNetworkAdmissionError,
} from './cryptoNetworkAdmission'

describe('crypto network admission', () => {
  beforeEach(() => {
    state.spectre.enabled = false
    state.spectre.isApplying = false
    state.spectre.spectreAccountMode = null
    state.wallet.wallet = null
  })

  it('blocks all crypto network operations when a Spectre wallet is active', () => {
    state.wallet.wallet = { spectreMode: true }

    expect(getCryptoNetworkAdmissionError('ethereum')?.message).toBe(
      'Crypto features are unavailable while Spectre Mode is active.',
    )
    expect(assertCryptoNetworkAdmission.bind(null, 'ethereum')).toThrow(
      'Crypto features are unavailable while Spectre Mode is active.',
    )
    expect(assertCryptoNetworkAdmission.bind(null, 'mozaga')).toThrow(
      'Crypto features are unavailable while Spectre Mode is active.',
    )
  })

  it('blocks network operations while Spectre Mode is transitioning', () => {
    state.spectre.isApplying = true

    expect(assertCryptoNetworkAdmission.bind(null, 'ethereum')).toThrow(
      'Crypto features are unavailable while Spectre Mode is active.',
    )
  })

  it('keeps ordinary wallets admitted', () => {
    expect(getCryptoNetworkAdmissionError('ethereum')).toBeNull()
    expect(assertCryptoNetworkAdmission.bind(null, 'ethereum')).not.toThrow()
  })
})
