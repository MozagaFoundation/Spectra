/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

const localeState = vi.hoisted(() => ({ current: 'en-US' }))

vi.mock('@/lib/i18n', () => ({
  getCurrentLocaleTag: () => localeState.current,
}))

import {
  formatBigIntAmount,
  formatLocalizedNumber,
  formatLocalizedPercent,
  parseDecimalToBigInt,
} from './amounts'

function getDecimalSeparator(locale: string = localeState.current): string {
  try {
    return (
      new Intl.NumberFormat(locale)
        .formatToParts(1.1)
        .find((part) => part.type === 'decimal')
        ?.value ?? '.'
    )
  } catch {
    return '.'
  }
}

function localizeAsciiDigits(value: string, locale: string): string {
  const formatter = new Intl.NumberFormat(locale, { useGrouping: false })
  return value.replace(/\d/g, (digit) => formatter.format(Number(digit)))
}

afterEach(() => {
  localeState.current = 'en-US'
})

describe('parseDecimalToBigInt', () => {
  it('parses whole and fractional decimal strings exactly', () => {
    expect(parseDecimalToBigInt('1.2345', 6)).toBe(1234500n)
    expect(parseDecimalToBigInt('1,2345', 6)).toBe(1234500n)
    expect(parseDecimalToBigInt('.5', 18)).toBe(500000000000000000n)
  })

  it('parses localized digit strings exactly', () => {
    expect(parseDecimalToBigInt('١٢٫٥', 1)).toBe(125n)
    expect(parseDecimalToBigInt('১২.৫', 1)).toBe(125n)
  })

  it('rejects inputs that would lose precision', () => {
    expect(parseDecimalToBigInt('0.0000001', 6)).toBeNull()
    expect(parseDecimalToBigInt('1.2.3', 18)).toBeNull()
  })

  it('rejects invalid signs, decimal settings, and oversized pasted input', () => {
    expect(parseDecimalToBigInt('-1', 18)).toBeNull()
    expect(parseDecimalToBigInt('1', -1)).toBeNull()
    expect(parseDecimalToBigInt('1', 256)).toBeNull()
    expect(parseDecimalToBigInt('1'.repeat(321), 18)).toBeNull()
  })
})

describe('formatBigIntAmount', () => {
  it('renders decimal values without using floating point math', () => {
    const separator = getDecimalSeparator()
    expect(formatBigIntAmount(1234500n, 6, 4)).toBe(`1${separator}2345`)
    expect(formatBigIntAmount('500000000000000000', 18, 6, true)).toBe(`0${separator}5`)
  })

  it('preserves sign when formatting negative balances', () => {
    expect(formatBigIntAmount(-1500000000000000000n, 18, 2)).toBe(`-1${getDecimalSeparator()}50`)
  })

  it('formats balances with localized digits when the locale uses them', () => {
    localeState.current = 'ar-SA'
    const separator = getDecimalSeparator('ar-SA')

    expect(formatBigIntAmount(1234500n, 6, 4)).toBe(
      `${localizeAsciiDigits('1', 'ar-SA')}${separator}${localizeAsciiDigits('2345', 'ar-SA')}`,
    )
  })

  it('returns zero for invalid decimal settings and oversized numeric strings', () => {
    expect(formatBigIntAmount(1n, -1)).toBe('0')
    expect(formatBigIntAmount(1n, 256)).toBe('0')
    expect(formatBigIntAmount('1'.repeat(321), 18)).toBe('0')
  })
})

describe('localized number formatting', () => {
  it('formats plain numbers without grouping by default', () => {
    expect(formatLocalizedNumber(1234.56, {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1,
    })).toBe('1234.6')
  })

  it('formats percent values from raw percent inputs', () => {
    expect(formatLocalizedPercent(12.34, 1)).toBe('12.3%')
    expect(formatLocalizedPercent(50, 0)).toBe('50%')
  })

  it('falls back when Intl rejects the current locale', () => {
    localeState.current = 'not a locale'

    expect(formatLocalizedNumber(12.5)).toBe('12.5')
    expect(formatLocalizedPercent(12.5, 1)).toBe('12.5%')
  })
})
