/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useAccountReadinessStore } from './accountReadinessStore'

const wallet = {
  id: 'wallet-1',
  address: 'exo1wallet',
  publicKey: 'public-key',
  privateKey: 'private-key',
  displayName: 'Wallet 1',
  createdAt: 1,
}

const rootWallet = {
  id: 'wallet-root',
  address: 'exo1root',
  publicKey: 'root-public-key',
  privateKey: 'root-private-key',
  displayName: 'Root Wallet',
  createdAt: 1,
}

beforeEach(() => {
  useAccountReadinessStore.getState().dismiss()
})

describe('accountReadinessStore', () => {
  it('shows and dismisses the account readiness banner payload', () => {
    useAccountReadinessStore.getState().show(wallet, rootWallet)

    expect(useAccountReadinessStore.getState()).toEqual(expect.objectContaining({
      wallet,
      rootWallet,
    }))

    useAccountReadinessStore.getState().dismiss()

    expect(useAccountReadinessStore.getState()).toEqual(expect.objectContaining({
      wallet: null,
      rootWallet: null,
    }))
  })
})
