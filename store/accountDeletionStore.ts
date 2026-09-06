/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'

export type AccountDeletionPhase =
  | 'preparing'
  | 'erasing_local'
  | 'submitting'
  | 'postgres'
  | 'objects'
  | 'relay'
  | 'finalizing'
  | 'completed'
  | 'error'

interface AccountDeletionState {
  visible: boolean
  phase: AccountDeletionPhase | null
  failedAtPhase: Exclude<AccountDeletionPhase, 'error'> | null
  error: string | null
  canRetry: boolean
  retrying: boolean
  startedAt: number | null
  finishedAt: number | null

  start: () => void
  advance: (phase: Exclude<AccountDeletionPhase, 'error'>) => void
  fail: (message: string, canRetry?: boolean) => void
  setRetrying: (retrying: boolean) => void
  dismiss: () => void
  reset: () => void
}

const initialState = {
  visible: false,
  phase: null,
  failedAtPhase: null,
  error: null,
  canRetry: false,
  retrying: false,
  startedAt: null,
  finishedAt: null,
}

export const useAccountDeletionStore = create<AccountDeletionState>((set, get) => ({
  ...initialState,

  start: () => set({
    visible: true,
    phase: 'preparing',
    failedAtPhase: null,
    error: null,
    canRetry: false,
    retrying: false,
    startedAt: Date.now(),
    finishedAt: null,
  }),
  advance: (phase) => set({
    visible: true,
    phase,
    failedAtPhase: null,
    error: null,
    canRetry: false,
    retrying: false,
    finishedAt: phase === 'completed' ? Date.now() : null,
  }),
  fail: (error, canRetry = true) => set((state) => ({
    visible: true,
    phase: 'error',
    failedAtPhase: state.phase && state.phase !== 'error' ? state.phase : state.failedAtPhase,
    error,
    canRetry,
    retrying: false,
    finishedAt: Date.now(),
  })),
  setRetrying: (retrying) => set({ retrying }),
  dismiss: () => {
    const phase = get().phase
    if (phase === 'completed' || phase === 'error') {
      set({ visible: false })
    }
  },
  reset: () => set(initialState),
}))
