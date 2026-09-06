/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

import { SpectraBackendError } from './request'
import {
  retryVdfSubmissionAfterServerFloor,
  VDF_CHALLENGE_AGE_SLACK_MS,
  waitForVdfChallengeAge,
} from './vdfChallengeTiming'

describe('VDF challenge timing', () => {
  it('accepts a challenge whose minimum age has passed', async () => {
    await expect(waitForVdfChallengeAge(Date.now() - 1_000)).resolves.toBeUndefined()
  })

  it('rejects malformed challenge timing', async () => {
    await expect(waitForVdfChallengeAge(Number.NaN)).rejects.toThrow('Invalid VDF challenge timing')
  })

  it('observes cancellation while waiting', async () => {
    const controller = new AbortController()
    const waiting = waitForVdfChallengeAge(Date.now() + 10_000, controller.signal)
    controller.abort()

    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('reports a visible server-floor wait', async () => {
    const onWaiting = vi.fn()

    await waitForVdfChallengeAge(Date.now() + 5, undefined, onWaiting)

    expect(onWaiting).toHaveBeenCalledWith(expect.any(Number), false)
  })

  it('waits a short slack after the server floor without a visible wait', async () => {
    vi.useFakeTimers()
    const onWaiting = vi.fn()
    try {
      const pending = waitForVdfChallengeAge(Date.now(), undefined, onWaiting)
      await vi.advanceTimersByTimeAsync(VDF_CHALLENGE_AGE_SLACK_MS)
      await pending
      expect(onWaiting).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries one server-timed floor rejection', async () => {
    let attempts = 0
    const onWaiting = vi.fn()

    await expect(retryVdfSubmissionAfterServerFloor(async () => {
      attempts += 1
      if (attempts === 1) {
        throw new SpectraBackendError(409, 'vdf_too_early', 1)
      }
      return 'accepted'
    }, undefined, onWaiting)).resolves.toBe('accepted')

    expect(attempts).toBe(2)
    expect(onWaiting).toHaveBeenCalledWith(expect.any(Number), true)
  })
})
