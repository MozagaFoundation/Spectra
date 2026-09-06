/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export const TOR_CLEARNET_EGRESS_BLOCKED_ERROR =
  'Clearnet network access is blocked while Tor mode is enabled.'

type ClearnetCancellation = () => void | Promise<void>

const activeClearnetOperations = new Set<ClearnetCancellation>()
let clearnetEgressAllowed = false

export function isClearnetEgressAllowed(): boolean {
  return clearnetEgressAllowed
}

export function assertClearnetEgressAllowed(): void {
  if (!clearnetEgressAllowed) {
    throw new Error(TOR_CLEARNET_EGRESS_BLOCKED_ERROR)
  }
}

export function registerClearnetOperation(
  cancel: ClearnetCancellation,
): () => void {
  if (!clearnetEgressAllowed) {
    void Promise.resolve(cancel()).catch(() => undefined)
    throw new Error(TOR_CLEARNET_EGRESS_BLOCKED_ERROR)
  }

  activeClearnetOperations.add(cancel)
  return () => {
    activeClearnetOperations.delete(cancel)
  }
}

export async function setClearnetEgressAllowed(allowed: boolean): Promise<void> {
  clearnetEgressAllowed = allowed
  if (allowed || activeClearnetOperations.size === 0) {
    return
  }

  const cancellations = [...activeClearnetOperations]
  activeClearnetOperations.clear()
  await Promise.allSettled(cancellations.map((cancel) => Promise.resolve(cancel())))
}
