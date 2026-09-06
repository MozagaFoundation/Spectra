/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

interface NativeAesJobModule {
  cancel?(jobId: string): void
  cancelAll?(): void
}

function getNativeAesJobModule(): NativeAesJobModule | null {
  try {
    const { NativeModules } = require('react-native') as {
      NativeModules?: { MediaCryptoModule?: NativeAesJobModule }
    }
    return NativeModules?.MediaCryptoModule ?? null
  } catch {
    return null
  }
}

export function isNativeCryptoCancellation(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : ''
  const message = error instanceof Error ? error.message : String(error ?? '')
  return code === 'ERR_CANCELLED' || /cancelled/i.test(message)
}

export function cancelPendingNativeCryptoJobs(): void {
  try {
    getNativeAesJobModule()?.cancelAll?.()
  } catch {
    // Native module is optional in tests and on web.
  }
}
