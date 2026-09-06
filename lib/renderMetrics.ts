/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

type RenderMetricValue = string | number | boolean | null | undefined

export function nowRenderMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

export function recordRenderMetric(
  scope: string,
  name: string,
  fields: Record<string, RenderMetricValue>,
): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return
  if (
    typeof process === 'undefined'
    || process.env?.NODE_ENV === 'test'
    || process.env?.EXPO_PUBLIC_RENDER_METRICS !== 'true'
  ) return
  console.log(`[RenderMetric] ${scope}:${name}`, fields)
}
