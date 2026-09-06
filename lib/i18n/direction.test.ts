/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('./index', () => ({
  getCurrentLanguage: () => 'en',
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { resolvedLanguage: 'en' } }),
}))

import {
  getDirectionalTextStyle,
  getLogicalRowDirection,
  getStartBorderStyle,
  getStartMarginStyle,
  getStartPaddingStyle,
  getWritingDirection,
} from './direction'

describe('i18n direction helpers', () => {
  it('returns LTR writing styles', () => {
    expect(getWritingDirection(false)).toBe('ltr')
    expect(getDirectionalTextStyle(false)).toEqual({
      textAlign: 'left',
      writingDirection: 'ltr',
    })
  })

  it('returns RTL writing styles', () => {
    expect(getWritingDirection(true)).toBe('rtl')
    expect(getDirectionalTextStyle(true)).toEqual({
      textAlign: 'right',
      writingDirection: 'rtl',
    })
  })

  it('maps logical start spacing and border styles by direction', () => {
    expect(getStartBorderStyle('#fff', 2, false)).toEqual({
      borderLeftColor: '#fff',
      borderLeftWidth: 2,
    })
    expect(getStartBorderStyle('#fff', 2, true)).toEqual({
      borderRightColor: '#fff',
      borderRightWidth: 2,
    })
    expect(getStartPaddingStyle(12, false)).toEqual({ paddingLeft: 12 })
    expect(getStartPaddingStyle(12, true)).toEqual({ paddingRight: 12 })
    expect(getStartMarginStyle(8, false)).toEqual({ marginLeft: 8 })
    expect(getStartMarginStyle(8, true)).toEqual({ marginRight: 8 })
  })

  it('maps logical row direction by direction', () => {
    expect(getLogicalRowDirection(false)).toBe('row')
    expect(getLogicalRowDirection(true)).toBe('row-reverse')
  })
})
