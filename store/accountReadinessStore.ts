/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'
import type { EXOWallet } from '@/lib/types'

interface AccountReadinessState {
  wallet: EXOWallet | null
  rootWallet: EXOWallet | null

  show: (wallet: EXOWallet, rootWallet: EXOWallet | null) => void
  dismiss: () => void
}

export const useAccountReadinessStore = create<AccountReadinessState>((set) => ({
  wallet: null,
  rootWallet: null,

  show: (wallet, rootWallet) => set({ wallet, rootWallet }),
  dismiss: () => set({ wallet: null, rootWallet: null }),
}))
