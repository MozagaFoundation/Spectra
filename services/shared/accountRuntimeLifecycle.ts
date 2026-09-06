/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

type AccountRuntimeListener = () => void

const abortListeners = new Set<AccountRuntimeListener>()
const resetListeners = new Set<AccountRuntimeListener>()

export function registerAccountRuntimeAbortListener(
  listener: AccountRuntimeListener,
): () => void {
  abortListeners.add(listener)
  return () => abortListeners.delete(listener)
}

export function registerAccountRuntimeResetListener(
  listener: AccountRuntimeListener,
): () => void {
  resetListeners.add(listener)
  return () => resetListeners.delete(listener)
}

export function abortActiveAccountRuntime(): void {
  notify(abortListeners)
}

export function resetActiveAccountRuntime(): void {
  abortActiveAccountRuntime()
  notify(resetListeners)
}

function notify(listeners: ReadonlySet<AccountRuntimeListener>): void {
  for (const listener of listeners) {
    try {
      listener()
    } catch {
      continue
    }
  }
}
