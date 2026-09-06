/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { VdfInput, VdfProgress } from '@spectra/privacy-protocol'
import type { SecureAccessFailure } from '@/lib/types'

export type VdfActivityAction = VdfInput['action']

export type VdfActivityPhase =
  | 'evaluating'
  | 'proving'
  | 'waiting_for_server'
  | 'submitting'
  | 'completed'
  | 'cancelled'
  | 'failed'

type VdfActivityTerminalEventType = 'completed' | 'cancelled' | 'failed'

export interface VdfActivityStep {
  completed: number
  total: number
}

export type VdfActivityEvent =
  | {
    type: 'started'
    activityId: string
    action: VdfActivityAction
    at: number
    canCancel: boolean
    cancel: (() => void) | null
    step?: VdfActivityStep
  }
  | {
    type: 'step'
    activityId: string
    completed: number
    total: number
    at: number
  }
  | {
    type: 'progress'
    activityId: string
    phase: Extract<VdfActivityPhase, 'evaluating' | 'proving'>
    completedIterations: number
    totalIterations: number
    at: number
  }
  | {
    type: 'waiting_for_server'
    activityId: string
    notBeforeAt: number
    retrying: boolean
    at: number
  }
  | {
    type: 'submitting'
    activityId: string
    at: number
  }
  | {
    type: 'completed' | 'cancelled'
    activityId: string
    at: number
  }
  | {
    type: 'failed'
    activityId: string
    at: number
    failure: SecureAccessFailure | null
  }

type VdfActivityListener = (event: VdfActivityEvent) => void

export interface VdfActivityHandle {
  progress: (progress: VdfProgress) => void
  setStep: (step: VdfActivityStep) => void
  waitForServer: (notBeforeAt: number, retrying?: boolean) => void
  submit: () => void
  complete: () => void
  cancel: () => void
  fail: (failure?: SecureAccessFailure) => void
}

export interface BeginVdfActivityOptions {
  action: VdfActivityAction
  cancel?: (() => void) | null
  canCancel?: boolean
  step?: VdfActivityStep
}

let nextActivityId = 0
const listeners = new Set<VdfActivityListener>()

export function isUsableVdfActivityStep(step: VdfActivityStep): boolean {
  return Number.isSafeInteger(step.completed)
    && Number.isSafeInteger(step.total)
    && step.total > 0
    && step.completed >= 0
    && step.completed <= step.total
}

function publish(event: VdfActivityEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event)
    } catch {
      // Activity observers must not interrupt a security operation.
    }
  })
}

export function subscribeToVdfActivity(listener: VdfActivityListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function beginVdfActivity(options: BeginVdfActivityOptions): VdfActivityHandle {
  const activityId = `vdfa1.${++nextActivityId}`
  let terminal = false

  publish({
    type: 'started',
    activityId,
    action: options.action,
    at: Date.now(),
    canCancel: Boolean(options.cancel && options.canCancel),
    cancel: options.cancel ?? null,
    ...(options.step && isUsableVdfActivityStep(options.step) ? { step: options.step } : {}),
  })

  const isActive = () => !terminal
  const finish = (
    type: VdfActivityTerminalEventType,
    failure: SecureAccessFailure | null = null,
  ) => {
    if (!isActive()) return
    terminal = true
    if (type === 'failed') {
      publish({ type, activityId, at: Date.now(), failure })
      return
    }
    publish({ type, activityId, at: Date.now() })
  }

  return {
    progress: (progress) => {
      if (!isActive()) return
      publish({
        type: 'progress',
        activityId,
        phase: progress.phase === 'evaluate' ? 'evaluating' : 'proving',
        completedIterations: progress.completedIterations,
        totalIterations: progress.totalIterations,
        at: Date.now(),
      })
    },
    setStep: (step) => {
      if (!isActive() || !isUsableVdfActivityStep(step)) return
      publish({
        type: 'step',
        activityId,
        completed: step.completed,
        total: step.total,
        at: Date.now(),
      })
    },
    waitForServer: (notBeforeAt, retrying = false) => {
      if (!isActive()) return
      publish({
        type: 'waiting_for_server',
        activityId,
        notBeforeAt,
        retrying,
        at: Date.now(),
      })
    },
    submit: () => {
      if (!isActive()) return
      publish({ type: 'submitting', activityId, at: Date.now() })
    },
    complete: () => finish('completed'),
    cancel: () => finish('cancelled'),
    fail: (failure) => finish('failed', failure ?? null),
  }
}
