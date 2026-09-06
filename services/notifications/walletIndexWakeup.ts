/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

type WalletIndexWakeupHandler = () => void

let handler: WalletIndexWakeupHandler | null = null

export function registerWalletIndexWakeupHandler(
  nextHandler: WalletIndexWakeupHandler,
): () => void {
  handler = nextHandler
  return () => {
    if (handler === nextHandler) handler = null
  }
}

export function requestWalletIndexWakeup(): void {
  handler?.()
}
