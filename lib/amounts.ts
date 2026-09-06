/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { getCurrentLocaleTag } from '@/lib/i18n'

const ASCII_DECIMAL_INPUT_REGEX = /^(?:\d+[.]?\d*|[.]\d+)$/
const MAX_DECIMAL_INPUT_LENGTH = 320
const MAX_DECIMAL_PLACES = 255
const LOCALIZED_DIGIT_MAP: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
  '०': '0',
  '१': '1',
  '२': '2',
  '३': '3',
  '४': '4',
  '५': '5',
  '६': '6',
  '७': '7',
  '८': '8',
  '९': '9',
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
  '０': '0',
  '１': '1',
  '２': '2',
  '３': '3',
  '４': '4',
  '５': '5',
  '６': '6',
  '７': '7',
  '８': '8',
  '９': '9',
}
const DECIMAL_SEPARATORS = new Set(['.', ',', '٫', '．'])
const LOCALIZED_DIGIT_CACHE = new Map<string, string[]>()

function normalizeLocalizedNumericInput(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  let normalized = ''
  let hasDecimalSeparator = false

  for (const char of trimmed) {
    const resolved = LOCALIZED_DIGIT_MAP[char] ?? char

    if (resolved >= '0' && resolved <= '9') {
      normalized += resolved
      continue
    }

    if (DECIMAL_SEPARATORS.has(resolved)) {
      if (hasDecimalSeparator) {
        return null
      }

      normalized += '.'
      hasDecimalSeparator = true
      continue
    }

    return null
  }

  return normalized
}

function getLocalizedDigits(localeTag: string): string[] {
  const cached = LOCALIZED_DIGIT_CACHE.get(localeTag)
  if (cached) {
    return cached
  }

  const digits = Array.from({ length: 10 }, (_, digit) =>
    new Intl.NumberFormat(localeTag, { useGrouping: false }).format(digit),
  )

  LOCALIZED_DIGIT_CACHE.set(localeTag, digits)
  return digits
}

function localizeDigits(value: string): string {
  try {
    const digits = getLocalizedDigits(getCurrentLocaleTag())
    return value.replace(/\d/g, (digit) => digits[Number(digit)] ?? digit)
  } catch {
    return value
  }
}

function getLocaleDecimalSeparator(): string {
  try {
    return (
      new Intl.NumberFormat(getCurrentLocaleTag())
        .formatToParts(1.1)
        .find((part) => part.type === 'decimal')
        ?.value ?? '.'
    )
  } catch {
    return '.'
  }
}

export function formatLocalizedNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
): string {
  try {
    return new Intl.NumberFormat(getCurrentLocaleTag(), {
      useGrouping: false,
      ...options,
    }).format(value)
  } catch {
    return String(value)
  }
}

export function formatLocalizedPercent(
  value: number,
  fractionDigits: number = 1,
): string {
  try {
    return new Intl.NumberFormat(getCurrentLocaleTag(), {
      style: 'percent',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value / 100)
  } catch {
    return `${value.toFixed(fractionDigits)}%`
  }
}

export function parseDecimalToBigInt(value: string, decimals: number): bigint | null {
  if (
    !Number.isInteger(decimals)
    || decimals < 0
    || decimals > MAX_DECIMAL_PLACES
    || value.length > MAX_DECIMAL_INPUT_LENGTH
  ) return null

  const normalized = normalizeLocalizedNumericInput(value)
  if (!normalized || !ASCII_DECIMAL_INPUT_REGEX.test(normalized)) {
    return null
  }

  const [wholePartRaw, fractionPartRaw = ''] = normalized.startsWith('.')
    ? ['0', normalized.slice(1)]
    : normalized.split('.')

  if (fractionPartRaw.length > decimals) {
    return null
  }

  try {
    const wholePart = wholePartRaw === '' ? '0' : wholePartRaw
    const fractionPart = fractionPartRaw.padEnd(decimals, '0')
    const unitsPerWhole = 10n ** BigInt(decimals)
    const wholeUnits = BigInt(wholePart) * unitsPerWhole
    const fractionUnits = fractionPart ? BigInt(fractionPart) : 0n
    return wholeUnits + fractionUnits
  } catch {
    return null
  }
}

export function formatBigIntAmount(
  value: bigint | string,
  decimals: number,
  fractionDigits: number = Math.min(decimals, 6),
  trimTrailingZeros: boolean = false,
): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMAL_PLACES) return '0'
  if (typeof value === 'string' && value.length > MAX_DECIMAL_INPUT_LENGTH) return '0'

  try {
    const bigintValue = typeof value === 'string' ? BigInt(value) : value
    const sign = bigintValue < 0n ? '-' : ''
    const absoluteValue = bigintValue < 0n ? -bigintValue : bigintValue
    const base = 10n ** BigInt(decimals)
    const whole = absoluteValue / base
    const remainder = absoluteValue % base

    if (fractionDigits <= 0) {
      return localizeDigits(`${sign}${whole.toString()}`)
    }

    const fixedFractionDigits = Math.min(fractionDigits, decimals)
    const fraction = remainder
      .toString()
      .padStart(decimals, '0')
      .slice(0, fixedFractionDigits)

    const renderedFraction = trimTrailingZeros
      ? fraction.replace(/0+$/, '')
      : fraction

    const localizedWhole = localizeDigits(whole.toString())
    const localizedFraction = localizeDigits(renderedFraction)

    return localizedFraction
      ? `${sign}${localizedWhole}${getLocaleDecimalSeparator()}${localizedFraction}`
      : `${sign}${localizedWhole}`
  } catch {
    return '0'
  }
}
