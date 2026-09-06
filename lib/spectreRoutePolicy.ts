/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { isSpectrePolicyActive, type SpectrePolicyState } from './spectrePolicy'

const SPECTRE_BLOCKED_ROUTE_ROOTS = new Set(['accounts', 'crypto', 'markets', 'agora'])

export function isSpectreBlockedRoute(
  pathname: string,
  state: SpectrePolicyState,
  isApplying = false,
): boolean {
  if (!isApplying && !isSpectrePolicyActive(state)) {
    return false
  }

  const root = pathname.split('/').find((segment) => segment && !segment.startsWith('('))
  return root !== undefined && SPECTRE_BLOCKED_ROUTE_ROOTS.has(root)
}
