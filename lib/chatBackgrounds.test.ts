/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { PRESET_BACKGROUNDS, PRESET_MAP } from './chatBackgrounds'

describe('chat background presets', () => {
  it('uses unique stable preset ids', () => {
    const ids = PRESET_BACKGROUNDS.map((preset) => preset.id)

    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('spectra')
  })

  it('defines valid gradient color arrays for every preset', () => {
    for (const preset of PRESET_BACKGROUNDS) {
      expect(preset.label.length).toBeGreaterThan(0)
      expect(preset.colors.length).toBeGreaterThanOrEqual(2)
      for (const color of preset.colors) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i)
      }
    }
  })

  it('keeps PRESET_MAP in sync with the preset array', () => {
    expect(PRESET_MAP.size).toBe(PRESET_BACKGROUNDS.length)
    for (const preset of PRESET_BACKGROUNDS) {
      expect(PRESET_MAP.get(preset.id)).toBe(preset)
    }
  })
})
