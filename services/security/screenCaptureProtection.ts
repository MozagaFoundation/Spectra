/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as ScreenCapture from 'expo-screen-capture'

export const SCREEN_CAPTURE_PROTECTION_KEY = 'spectra-screen-capture-protection'

let rootProtectionEnabled = false
let nativeProtectionApplied = false
let operationQueue: Promise<void> = Promise.resolve()
let sensitiveProtectionCount = 0
const sensitiveProtectionListeners = new Set<(enabled: boolean) => void>()

function shouldEnableNativeProtection(): boolean {
  return rootProtectionEnabled || sensitiveProtectionCount > 0
}

async function applyNativeProtectionState(): Promise<void> {
  const nextEnabled = shouldEnableNativeProtection()
  if (nextEnabled === nativeProtectionApplied) {
    return
  }

  if (nextEnabled) {
    await ScreenCapture.preventScreenCaptureAsync(SCREEN_CAPTURE_PROTECTION_KEY)
  } else {
    await ScreenCapture.allowScreenCaptureAsync(SCREEN_CAPTURE_PROTECTION_KEY)
  }
  nativeProtectionApplied = nextEnabled
}

function queueNativeProtectionTransition(): Promise<void> {
  operationQueue = operationQueue
    .catch(() => {})
    .then(applyNativeProtectionState)

  return operationQueue
}

export function setRootScreenCaptureProtectionEnabled(enabled: boolean): Promise<void> {
  rootProtectionEnabled = enabled

  return queueNativeProtectionTransition().catch((error) => {
    console.warn(
      enabled
        ? 'Failed to enable screenshot protection:'
        : 'Failed to disable screenshot protection:',
      error,
    )
  })
}

function notifySensitiveProtection(enabled: boolean): void {
  for (const listener of sensitiveProtectionListeners) {
    listener(enabled)
  }
}

export async function acquireSensitiveScreenProtection(): Promise<() => Promise<void>> {
  sensitiveProtectionCount += 1
  if (sensitiveProtectionCount === 1) {
    notifySensitiveProtection(true)
  }

  try {
    await queueNativeProtectionTransition()
  } catch (error) {
    sensitiveProtectionCount = Math.max(0, sensitiveProtectionCount - 1)
    if (sensitiveProtectionCount === 0) {
      notifySensitiveProtection(false)
    }
    console.warn('Failed to enable sensitive screen protection:', error)
    throw error
  }

  let released = false
  return async () => {
    if (released) return
    released = true
    sensitiveProtectionCount = Math.max(0, sensitiveProtectionCount - 1)
    if (sensitiveProtectionCount === 0) {
      notifySensitiveProtection(false)
    }

    try {
      await queueNativeProtectionTransition()
    } catch (error) {
      console.warn('Failed to disable sensitive screen protection:', error)
    }
  }
}

export function subscribeToSensitiveScreenProtection(
  listener: (enabled: boolean) => void,
): () => void {
  sensitiveProtectionListeners.add(listener)
  listener(sensitiveProtectionCount > 0)
  return () => sensitiveProtectionListeners.delete(listener)
}

export function __resetScreenCaptureProtectionForTests(): void {
  rootProtectionEnabled = false
  nativeProtectionApplied = false
  operationQueue = Promise.resolve()
  sensitiveProtectionCount = 0
  sensitiveProtectionListeners.clear()
}
