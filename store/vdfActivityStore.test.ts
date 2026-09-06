/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { beginVdfActivity } from '@/services/shared/vdfActivity'
import { useVdfActivityStore } from './vdfActivityStore'

describe('VDF activity store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T16:00:00.000Z'))
    useVdfActivityStore.getState().reset()
  })

  afterEach(() => {
    useVdfActivityStore.getState().reset()
    vi.useRealTimers()
  })

  it('derives progress and a smoothed iteration rate', () => {
    const activity = beginVdfActivity({ action: 'wallet_admission' })

    vi.advanceTimersByTime(250)
    activity.progress({
      phase: 'evaluate',
      completedIterations: 100,
      totalIterations: 400,
    })

    expect(useVdfActivityStore.getState().activity).toMatchObject({
      phase: 'evaluating',
      completedIterations: 100,
      totalIterations: 400,
      iterationsPerSecond: 400,
    })

    vi.advanceTimersByTime(250)
    activity.progress({
      phase: 'prove',
      completedIterations: 200,
      totalIterations: 400,
    })

    expect(useVdfActivityStore.getState().activity).toMatchObject({
      phase: 'proving',
      iterationsPerSecond: 400,
    })
  })

  it('throttles progress updates to keep the UI thread from thrashing', () => {
    const activity = beginVdfActivity({ action: 'wallet_admission' })

    activity.progress({
      phase: 'evaluate',
      completedIterations: 10,
      totalIterations: 400,
    })
    expect(useVdfActivityStore.getState().activity?.completedIterations).toBe(10)

    vi.advanceTimersByTime(100)
    activity.progress({
      phase: 'evaluate',
      completedIterations: 20,
      totalIterations: 400,
    })
    expect(useVdfActivityStore.getState().activity?.completedIterations).toBe(10)

    vi.advanceTimersByTime(150)
    activity.progress({
      phase: 'evaluate',
      completedIterations: 30,
      totalIterations: 400,
    })
    expect(useVdfActivityStore.getState().activity?.completedIterations).toBe(30)
  })

  it('supports user cancellation only when a caller supplied one', () => {
    const cancel = vi.fn()
    const activity = beginVdfActivity({
      action: 'contact_card',
      cancel,
      canCancel: true,
    })

    useVdfActivityStore.getState().cancelActivity()

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(useVdfActivityStore.getState().activity).toMatchObject({
      canCancel: false,
      isCancelling: true,
    })

    activity.cancel()

    expect(useVdfActivityStore.getState().activity).toMatchObject({
      phase: 'cancelled',
      isCancelling: false,
    })
  })

  it('drops updates from an activity reset during an account transition', () => {
    const activity = beginVdfActivity({ action: 'public_discovery' })

    useVdfActivityStore.getState().reset()
    activity.fail()

    expect(useVdfActivityStore.getState().activity).toBeNull()
  })

  it('keeps discovery rent day counts on the same activity', () => {
    const activity = beginVdfActivity({ action: 'extend_public_discovery' })
    activity.setStep({ completed: 6, total: 7 })

    expect(useVdfActivityStore.getState().activity).toMatchObject({
      action: 'extend_public_discovery',
      stepCompleted: 6,
      stepTotal: 7,
    })
  })
})
