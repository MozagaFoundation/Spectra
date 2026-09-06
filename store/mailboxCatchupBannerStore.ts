/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'

import { registerAccountRuntimeResetListener } from '@/services/shared/accountRuntimeLifecycle'

export type MailboxCatchupBannerPhase =
  | 'preparing'
  | 'loading_local'
  | 'connecting'
  | 'checking_mailbox'
  | 'decrypting'
  | 'caught_up'

const PHASE_RANK: Record<MailboxCatchupBannerPhase, number> = {
  preparing: 1,
  loading_local: 2,
  connecting: 3,
  checking_mailbox: 4,
  decrypting: 5,
  caught_up: 6,
}

interface MailboxCatchupBannerState {
  sessionId: number | null
  phase: MailboxCatchupBannerPhase | null
  startedAt: number | null

  begin: () => void
  advance: (phase: MailboxCatchupBannerPhase) => void
  complete: (reason: 'messages' | 'empty') => void
  dismiss: () => void
  reset: () => void
}

let nextSessionId = 1

export const useMailboxCatchupBannerStore = create<MailboxCatchupBannerState>((set, get) => ({
  sessionId: null,
  phase: null,
  startedAt: null,

  begin: () => {
    if (get().phase) return
    set({
      sessionId: nextSessionId,
      phase: 'preparing',
      startedAt: Date.now(),
    })
    nextSessionId += 1
  },

  advance: (phase) => {
    const current = get().phase
    if (!current || current === 'caught_up') return
    if (PHASE_RANK[phase] <= PHASE_RANK[current]) return
    set({ phase })
  },

  complete: (reason) => {
    const current = get().phase
    if (!current) return
    if (reason === 'messages') {
      set({ sessionId: null, phase: null, startedAt: null })
      return
    }
    if (current === 'caught_up') return
    set({ phase: 'caught_up' })
  },

  dismiss: () => {
    if (get().phase !== 'caught_up') return
    set({ sessionId: null, phase: null, startedAt: null })
  },

  reset: () => {
    set({ sessionId: null, phase: null, startedAt: null })
  },
}))

export function beginMailboxCatchupBanner(): void {
  useMailboxCatchupBannerStore.getState().begin()
}

export function advanceMailboxCatchupBanner(phase: MailboxCatchupBannerPhase): void {
  useMailboxCatchupBannerStore.getState().advance(phase)
}

export function completeMailboxCatchupBanner(reason: 'messages' | 'empty'): void {
  useMailboxCatchupBannerStore.getState().complete(reason)
}

export function resetMailboxCatchupBanner(): void {
  useMailboxCatchupBannerStore.getState().reset()
}

registerAccountRuntimeResetListener(() => {
  useMailboxCatchupBannerStore.getState().reset()
})
