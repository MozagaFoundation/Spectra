/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { useOnboardingStore } from './onboardingStore'

const wallet = {
  id: 'wallet-1',
  address: 'exo1wallet',
  publicKey: 'public-key',
  privateKey: 'private-key',
  displayName: 'Wallet 1',
  createdAt: 1,
}

beforeEach(() => {
  useOnboardingStore.getState().clearPendingWallet()
  useOnboardingStore.getState().clearDeferredContactProfileName(wallet.address)
})

describe('onboardingStore', () => {
  it('keeps pending mnemonic payload only until it is explicitly cleared', () => {
    useOnboardingStore.getState().setPendingWallet({
      mnemonic: 'test test test test test test test test test test test junk',
      source: 'import',
      wallet,
    })

    expect(useOnboardingStore.getState().pendingWallet).toEqual({
      mnemonic: 'test test test test test test test test test test test junk',
      source: 'import',
      wallet,
    })

    useOnboardingStore.getState().clearPendingWallet()

    expect(useOnboardingStore.getState().pendingWallet).toBeNull()
  })

  it('keeps an optional contact name with the pending account setup', () => {
    useOnboardingStore.getState().setPendingWallet({
      mnemonic: 'test test test test test test test test test test test junk',
      source: 'create',
      wallet,
    })

    useOnboardingStore.getState().setPendingContactProfileName('Alice')

    expect(useOnboardingStore.getState().pendingWallet?.contactProfileName).toBe('Alice')
  })

  it('keeps a deferred profile name scoped to its newly created wallet', () => {
    useOnboardingStore.getState().setPendingWallet({
      mnemonic: 'test test test test test test test test test test test junk',
      source: 'create',
      wallet,
    })
    useOnboardingStore.getState().deferContactProfileName(wallet.address, 'Alice')
    useOnboardingStore.getState().clearPendingWallet()

    expect(useOnboardingStore.getState().deferredContactProfileName).toEqual({
      walletAddress: wallet.address,
      displayName: 'Alice',
    })

    useOnboardingStore.getState().clearDeferredContactProfileName('exo1other')
    expect(useOnboardingStore.getState().deferredContactProfileName).not.toBeNull()

    useOnboardingStore.getState().clearDeferredContactProfileName(wallet.address)
    expect(useOnboardingStore.getState().deferredContactProfileName).toBeNull()
  })
})
