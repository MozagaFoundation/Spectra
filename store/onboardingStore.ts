/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'

import type { EXOWallet } from '@/lib/types'

interface PendingWalletPayload {
  mnemonic: string
  source: 'create' | 'import'
  wallet: EXOWallet
  wallets?: EXOWallet[]
  contactProfileName?: string | null
}

interface DeferredContactProfileName {
  walletAddress: string
  displayName: string
}

interface OnboardingState {
  pendingWallet: PendingWalletPayload | null
  deferredContactProfileName: DeferredContactProfileName | null
  setPendingWallet: (payload: PendingWalletPayload) => void
  setPendingContactProfileName: (contactProfileName: string | null) => void
  deferContactProfileName: (walletAddress: string, displayName: string) => void
  clearDeferredContactProfileName: (walletAddress: string) => void
  clearPendingWallet: () => void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  pendingWallet: null,
  deferredContactProfileName: null,

  setPendingWallet: (payload) => {
    set({ pendingWallet: payload, deferredContactProfileName: null })
  },

  setPendingContactProfileName: (contactProfileName) => {
    set((state) => state.pendingWallet
      ? { pendingWallet: { ...state.pendingWallet, contactProfileName } }
      : state)
  },

  deferContactProfileName: (walletAddress, displayName) => {
    set({ deferredContactProfileName: { walletAddress, displayName } })
  },

  clearDeferredContactProfileName: (walletAddress) => {
    set((state) => (
      state.deferredContactProfileName?.walletAddress === walletAddress
        ? { deferredContactProfileName: null }
        : state
    ))
  },

  clearPendingWallet: () => {
    set({ pendingWallet: null })
  },
}))
