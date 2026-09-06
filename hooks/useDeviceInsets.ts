/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { initialWindowMetrics } from 'react-native-safe-area-context'

const FALLBACK = { top: 0, bottom: 0, left: 0, right: 0 }

/** Returns boot-time safe area insets. */
export function useDeviceInsets() {
  return initialWindowMetrics?.insets ?? FALLBACK
}
