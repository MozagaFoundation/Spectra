/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { shouldShowListSkeleton } from './listReadiness'

describe('shouldShowListSkeleton', () => {
  it('prevents a false empty state until hydration completes', () => {
    expect(shouldShowListSkeleton(false, false)).toBe(true)
    expect(shouldShowListSkeleton(false, true)).toBe(false)
    expect(shouldShowListSkeleton(true, false)).toBe(false)
  })
})
