/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', () => ({
  translate: (key: string, options?: { ns?: string }) => `${options?.ns ?? 'common'}:${key}`,
}))

describe('marketService display helpers', () => {
  it('localizes unknown sale and distribution fallback labels', async () => {
    const { getDistributionModeName, getSaleStatusName } = await import('./marketService')

    expect(getDistributionModeName(999)).toBe('common:Unknown')
    expect(getSaleStatusName(999)).toBe('common:Unknown')
  })
})
