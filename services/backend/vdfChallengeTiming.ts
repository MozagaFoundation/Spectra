/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md
 */

import { SpectraBackendError } from './request'

export const VDF_CHALLENGE_AGE_SLACK_MS = 250

function abortError(): Error {
  const error = new Error('VDF solving was cancelled')
  error.name = 'AbortError'
  return error
}

export async function waitForVdfChallengeAge(
  notBeforeAt: number,
  signal?: AbortSignal,
  onWaiting?: (notBeforeAt: number, retrying: boolean) => void,
): Promise<void> {
  if (!Number.isSafeInteger(notBeforeAt) || notBeforeAt <= 0) {
    throw new Error('Invalid VDF challenge timing')
  }
  const remainingFloorMs = notBeforeAt - Date.now()
  const waitMs = remainingFloorMs + VDF_CHALLENGE_AGE_SLACK_MS
  if (waitMs <= 0) return
  if (remainingFloorMs > 0) onWaiting?.(notBeforeAt, false)
  if (signal?.aborted) throw abortError()
  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(abortError())
    }
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, waitMs)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

export async function retryVdfSubmissionAfterServerFloor<T>(
  submit: () => Promise<T>,
  signal?: AbortSignal,
  onWaiting?: (notBeforeAt: number, retrying: boolean) => void,
): Promise<T> {
  try {
    return await submit()
  } catch (error) {
    if (
      !(error instanceof SpectraBackendError) ||
      error.code !== 'vdf_too_early' ||
      !error.retryAfterMs
    ) {
      throw error
    }
    const notBeforeAt = Date.now() + error.retryAfterMs
    onWaiting?.(notBeforeAt, true)
    await waitForVdfChallengeAge(notBeforeAt, signal)
    return await submit()
  }
}
