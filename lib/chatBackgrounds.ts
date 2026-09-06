/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

export interface PresetBackground {
  id: string
  label: string
  colors: [string, string, ...string[]]
  start?: { x: number; y: number }
  end?: { x: number; y: number }
}

export const PRESET_BACKGROUNDS: PresetBackground[] = [
  { id: 'spectra', label: 'Spectra', colors: ['#0c0c0c', '#141414', '#1d1d1d'] },
  { id: 'spectra-cyan', label: 'Spectra Cyan', colors: ['#0c0c0c', '#16271f', '#2c5546', '#89ddc3'] },
  { id: 'spectra-green', label: 'Spectra Green', colors: ['#0c0c0c', '#1f2710', '#3e5223', '#a7da57'] },
  { id: 'midnight', label: 'Midnight', colors: ['#0f0c29', '#302b63', '#24243e'] },
  { id: 'ocean', label: 'Ocean', colors: ['#0c0c0c', '#1a3a5c', '#1e4d6e'] },
  { id: 'aurora', label: 'Aurora', colors: ['#0c0c0c', '#1b2838', '#134e5e', '#71b280'] },
  { id: 'cosmos', label: 'Cosmos', colors: ['#200122', '#6f0000'] },
  { id: 'forest', label: 'Forest', colors: ['#0a1a0a', '#1a3a1a', '#2d5a2d'] },
  { id: 'slate', label: 'Slate', colors: ['#1c1c2e', '#2d2d44', '#3e3e5a'] },
]

export const PRESET_MAP = new Map(PRESET_BACKGROUNDS.map(p => [p.id, p]))
