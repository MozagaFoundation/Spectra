/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('useDeviceInsets', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns the physical insets captured at boot', async () => {
    vi.doMock('react-native-safe-area-context', () => ({
      initialWindowMetrics: {
        insets: { top: 11, bottom: 22, left: 3, right: 4 },
      },
    }))

    const { useDeviceInsets } = await import('./useDeviceInsets')

    expect(useDeviceInsets()).toEqual({ top: 11, bottom: 22, left: 3, right: 4 })
  })

  it('returns zero insets when boot metrics are unavailable', async () => {
    vi.doMock('react-native-safe-area-context', () => ({
      initialWindowMetrics: undefined,
    }))

    const { useDeviceInsets } = await import('./useDeviceInsets')

    expect(useDeviceInsets()).toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
  })
})
