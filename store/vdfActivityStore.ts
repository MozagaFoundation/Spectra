/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'

import {
  subscribeToVdfActivity,
  type VdfActivityAction,
  type VdfActivityEvent,
  type VdfActivityPhase,
} from '@/services/shared/vdfActivity'
import { registerAccountRuntimeResetListener } from '@/services/shared/accountRuntimeLifecycle'
import type { SecureAccessFailure } from '@/lib/types'

export interface VdfActivitySnapshot {
  activityId: string
  action: VdfActivityAction
  phase: VdfActivityPhase
  startedAt: number
  updatedAt: number
  completedIterations: number
  totalIterations: number
  iterationsPerSecond: number | null
  notBeforeAt: number | null
  retrying: boolean
  canCancel: boolean
  isCancelling: boolean
  failure: SecureAccessFailure | null
  stepCompleted: number | null
  stepTotal: number | null
}

interface VdfActivityState {
  activity: VdfActivitySnapshot | null
  cancel: (() => void) | null

  applyEvent: (event: VdfActivityEvent) => void
  cancelActivity: () => void
  dismiss: () => void
  reset: () => void
}

type RateSample = Pick<VdfActivitySnapshot, 'updatedAt' | 'completedIterations' | 'iterationsPerSecond'>
const ignoredActivityIds = new Set<string>()
const PROGRESS_UI_INTERVAL_MS = 250

function isTerminal(phase: VdfActivityPhase): boolean {
  return phase === 'completed' || phase === 'cancelled' || phase === 'failed'
}

function calculateIterationsPerSecond(
  previous: RateSample,
  completedIterations: number,
  at: number,
): number | null {
  const elapsedMs = at - previous.updatedAt
  const completedDelta = completedIterations - previous.completedIterations
  if (elapsedMs < 100 || completedDelta <= 0) return previous.iterationsPerSecond

  const observed = (completedDelta * 1_000) / elapsedMs
  if (!Number.isFinite(observed) || observed <= 0) return previous.iterationsPerSecond
  if (previous.iterationsPerSecond === null) return observed
  return previous.iterationsPerSecond * 0.7 + observed * 0.3
}

function terminalActivity(
  activity: VdfActivitySnapshot,
  phase: Extract<VdfActivityPhase, 'completed' | 'cancelled' | 'failed'>,
  at: number,
  failure: SecureAccessFailure | null = null,
): VdfActivitySnapshot {
  return {
    ...activity,
    phase,
    updatedAt: at,
    canCancel: false,
    isCancelling: false,
    failure,
  }
}

export const useVdfActivityStore = create<VdfActivityState>((set, get) => ({
  activity: null,
  cancel: null,

  applyEvent: (event) => {
    if (event.type === 'started') {
      set({
        activity: {
          activityId: event.activityId,
          action: event.action,
          phase: 'evaluating',
          startedAt: event.at,
          updatedAt: event.at,
          completedIterations: 0,
          totalIterations: 0,
          iterationsPerSecond: null,
          notBeforeAt: null,
          retrying: false,
          canCancel: event.canCancel,
          isCancelling: false,
          failure: null,
          stepCompleted: event.step?.completed ?? null,
          stepTotal: event.step?.total ?? null,
        },
        cancel: event.cancel,
      })
      return
    }

    if (ignoredActivityIds.has(event.activityId)) {
      if (
        event.type === 'completed'
        || event.type === 'cancelled'
        || event.type === 'failed'
      ) {
        ignoredActivityIds.delete(event.activityId)
      }
      return
    }

    const { activity } = get()
    if (!activity || activity.activityId !== event.activityId) return

    if (event.type === 'step') {
      set({
        activity: {
          ...activity,
          stepCompleted: event.completed,
          stepTotal: event.total,
          updatedAt: event.at,
        },
      })
      return
    }

    if (event.type === 'progress') {
      if (
        activity.phase === event.phase
        && activity.completedIterations > 0
        && event.at - activity.updatedAt < PROGRESS_UI_INTERVAL_MS
        && event.completedIterations < event.totalIterations
      ) {
        return
      }
      set({
        activity: {
          ...activity,
          phase: event.phase,
          completedIterations: event.completedIterations,
          totalIterations: event.totalIterations,
          iterationsPerSecond: calculateIterationsPerSecond(
            activity,
            event.completedIterations,
            event.at,
          ),
          updatedAt: event.at,
          notBeforeAt: null,
          retrying: false,
          isCancelling: false,
        },
      })
      return
    }

    if (event.type === 'waiting_for_server') {
      set({
        activity: {
          ...activity,
          phase: 'waiting_for_server',
          updatedAt: event.at,
          notBeforeAt: event.notBeforeAt,
          retrying: event.retrying,
          isCancelling: false,
        },
      })
      return
    }

    if (event.type === 'submitting') {
      set({
        activity: {
          ...activity,
          phase: 'submitting',
          updatedAt: event.at,
          notBeforeAt: null,
          retrying: false,
          canCancel: false,
          isCancelling: false,
        },
        cancel: null,
      })
      return
    }

    set({
      activity: terminalActivity(
        activity,
        event.type,
        event.at,
        event.type === 'failed' ? event.failure : null,
      ),
      cancel: null,
    })
  },

  cancelActivity: () => {
    const { activity, cancel } = get()
    if (!activity?.canCancel || !cancel || isTerminal(activity.phase) || activity.isCancelling) {
      return
    }
    set({
      activity: {
        ...activity,
        isCancelling: true,
        canCancel: false,
      },
    })
    cancel()
  },

  dismiss: () => {
    const { activity } = get()
    if (!activity || !isTerminal(activity.phase)) return
    set({ activity: null, cancel: null })
  },

  reset: () => {
    const activityId = get().activity?.activityId
    if (activityId) ignoredActivityIds.add(activityId)
    set({ activity: null, cancel: null })
  },
}))

subscribeToVdfActivity((event) => {
  useVdfActivityStore.getState().applyEvent(event)
})

registerAccountRuntimeResetListener(() => {
  useVdfActivityStore.getState().reset()
})
