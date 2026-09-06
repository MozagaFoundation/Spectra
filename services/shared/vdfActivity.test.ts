/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it } from 'vitest'

import {
  beginVdfActivity,
  subscribeToVdfActivity,
  type VdfActivityEvent,
} from './vdfActivity'

describe('VDF activity lifecycle', () => {
  let unsubscribe: (() => void) | null = null

  afterEach(() => {
    unsubscribe?.()
    unsubscribe = null
  })

  it('reports progress and terminal completion without sensitive proof material', () => {
    const events: VdfActivityEvent[] = []
    unsubscribe = subscribeToVdfActivity((event) => events.push(event))
    const activity = beginVdfActivity({ action: 'wallet_admission' })

    activity.progress({
      phase: 'evaluate',
      completedIterations: 12,
      totalIterations: 40,
    })
    activity.waitForServer(Date.now() + 15_000)
    activity.submit()
    activity.complete()

    expect(events.map((event) => event.type)).toEqual([
      'started',
      'progress',
      'waiting_for_server',
      'submitting',
      'completed',
    ])
    expect(events[0]).toMatchObject({
      action: 'wallet_admission',
      canCancel: false,
    })
    expect(events[1]).toMatchObject({
      phase: 'evaluating',
      completedIterations: 12,
      totalIterations: 40,
    })
    expect(JSON.stringify(events)).not.toContain('vdfProof')
    expect(JSON.stringify(events)).not.toContain('walletAddress')
  })

  it('stops publishing after cancellation', () => {
    const events: VdfActivityEvent[] = []
    unsubscribe = subscribeToVdfActivity((event) => events.push(event))
    const activity = beginVdfActivity({ action: 'contact_card' })

    activity.cancel()
    activity.progress({
      phase: 'prove',
      completedIterations: 20,
      totalIterations: 40,
    })

    expect(events.map((event) => event.type)).toEqual(['started', 'cancelled'])
  })

  it('publishes only a redacted failure category', () => {
    const events: VdfActivityEvent[] = []
    unsubscribe = subscribeToVdfActivity((event) => events.push(event))
    const activity = beginVdfActivity({ action: 'wallet_admission' })

    activity.fail('temporary_backend')

    expect(events.at(-1)).toEqual(expect.objectContaining({
      type: 'failed',
      failure: 'temporary_backend',
    }))
    expect(JSON.stringify(events)).not.toContain('challengeId')
    expect(JSON.stringify(events)).not.toContain('walletAddress')
  })

  it('publishes rent step counts without resetting the activity', () => {
    const events: VdfActivityEvent[] = []
    unsubscribe = subscribeToVdfActivity((event) => events.push(event))
    const activity = beginVdfActivity({ action: 'extend_public_discovery' })

    activity.setStep({ completed: 0, total: 7 })
    activity.setStep({ completed: 6, total: 7 })
    activity.complete()

    expect(events.map((event) => event.type)).toEqual([
      'started',
      'step',
      'step',
      'completed',
    ])
    expect(events[2]).toMatchObject({
      type: 'step',
      completed: 6,
      total: 7,
    })
  })
})
