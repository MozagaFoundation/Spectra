/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

function shouldShowRawAuthErrors(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__
}

export function getSafeAuthErrorMessage(error: unknown, fallbackMessage: string): string {
  if (shouldShowRawAuthErrors() && error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}
