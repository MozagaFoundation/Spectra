/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { translate } from '@/lib/i18n'

export function shouldShowErrorDetails(): boolean {
  return __DEV__
}

export function getErrorDisplayMessage(error: unknown): string {
  if (shouldShowErrorDetails()) {
    if (error instanceof Error && error.message) {
      return error.message
    }
    if (typeof error === 'string' && error.trim().length > 0) {
      return error
    }
  }

  return translate('Something went wrong. Please try again.', { ns: 'errors' })
}
