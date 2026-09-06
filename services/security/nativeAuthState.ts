/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

const NATIVE_AUTH_SETTLE_GRACE_MS = 1500

let activeNativeAuthCount = 0
let lastNativeAuthFinishedAt = 0

export function beginNativeAuthPrompt(): () => void {
  activeNativeAuthCount += 1
  let ended = false

  return () => {
    if (ended) {
      return
    }

    ended = true
    activeNativeAuthCount = Math.max(0, activeNativeAuthCount - 1)
    lastNativeAuthFinishedAt = Date.now()
  }
}

export function isNativeAuthPromptActive(): boolean {
  return activeNativeAuthCount > 0
}

export function shouldSuppressAppStateSecurityForNativeAuth(now: number = Date.now()): boolean {
  return activeNativeAuthCount > 0 || now - lastNativeAuthFinishedAt <= NATIVE_AUTH_SETTLE_GRACE_MS
}

export function __resetNativeAuthStateForTests(): void {
  activeNativeAuthCount = 0
  lastNativeAuthFinishedAt = 0
}
