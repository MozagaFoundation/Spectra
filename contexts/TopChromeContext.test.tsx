/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderHook } from '@/test/hookTestHarness'
import { TopChromeHeightProvider, resolveTopChromeHeight, useTopChromeHeight } from './TopChromeContext'

describe('TopChromeContext', () => {
  it('returns the default height outside the provider', () => {
    const harness = renderHook(() => useTopChromeHeight())

    expect(harness.result).toBe(0)
  })

  it('propagates the measured top chrome height', () => {
    const harness = renderHook(() => useTopChromeHeight(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <TopChromeHeightProvider value={42}>{children}</TopChromeHeightProvider>
      ),
    })

    expect(harness.result).toBe(42)
  })

  it('keeps measured height only while top chrome is live', () => {
    expect(resolveTopChromeHeight(128, true)).toBe(128)
    expect(resolveTopChromeHeight(128, false)).toBe(0)
    expect(resolveTopChromeHeight(0, true)).toBe(0)
  })
})
