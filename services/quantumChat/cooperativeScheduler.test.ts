/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { InteractionManager } from 'react-native'

import { yieldToQuantumChatHost } from './cooperativeScheduler'

describe('cooperativeScheduler', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('lets realtime storage continue on the next turn without waiting for interactions', async () => {
    vi.useFakeTimers()
    const interactionSpy = vi.spyOn(InteractionManager, 'runAfterInteractions')

    const yieldPromise = yieldToQuantumChatHost('message_store', {
      priority: 'realtime',
    })
    await vi.advanceTimersByTimeAsync(0)
    await yieldPromise

    expect(interactionSpy).not.toHaveBeenCalled()
  })

  it('keeps background receive work behind active interactions', async () => {
    const interactionSpy = vi.spyOn(InteractionManager, 'runAfterInteractions')

    await yieldToQuantumChatHost('message_store', {
      priority: 'background',
    })

    expect(interactionSpy).toHaveBeenCalledTimes(1)
  })
})
