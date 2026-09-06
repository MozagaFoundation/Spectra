/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', () => ({
  getCurrentLocaleTag: () => 'en-US',
  translate: (key: string) => key,
}))

import {
  bytesToHex,
  debounce,
  formatAddress,
  formatFileSize,
  groupMessagesByDate,
  hexToBytes,
  isValidEXOAddress,
  mapWithConcurrency,
  mapWithConcurrencySettled,
  parseLinks,
} from './utils'

afterEach(() => {
  vi.useRealTimers()
})

describe('utils', () => {
  it('validates and formats EXO addresses', () => {
    const valid = `EXO00${'a'.repeat(38)}`

    expect(isValidEXOAddress(valid)).toBe(true)
    expect(isValidEXOAddress(`EXO00${'g'.repeat(38)}`)).toBe(false)
    expect(formatAddress(valid, 4)).toBe(`EXO00${'a'.repeat(2)}...${'a'.repeat(4)}`)
    expect(formatAddress('short', 4)).toBe('short')
  })

  it('parses only explicit http and https links into link segments', () => {
    expect(parseLinks('hello https://spectra.app and http://example.test')).toEqual([
      { type: 'text', content: 'hello ' },
      { type: 'link', content: 'https://spectra.app' },
      { type: 'text', content: ' and ' },
      { type: 'link', content: 'http://example.test' },
    ])
    expect(parseLinks('javascript:alert(1)')).toEqual([
      { type: 'text', content: 'javascript:alert(1)' },
    ])
  })

  it('round-trips hex bytes and rejects malformed hex instead of coercing to zeros', () => {
    expect(bytesToHex(hexToBytes('0x00ff10'))).toBe('00ff10')
    expect([...hexToBytes('AA10')]).toEqual([170, 16])
    expect(hexToBytes('')).toEqual(new Uint8Array())
    expect(() => hexToBytes('abc')).toThrow('Invalid hex string length')
    expect(() => hexToBytes('zz')).toThrow('Invalid hex string')
  })

  it('formats file sizes defensively', () => {
    expect(formatFileSize(0)).toBe('0 fileSize.B')
    expect(formatFileSize(-1)).toBe('0 fileSize.B')
    expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe('0 fileSize.B')
    expect(formatFileSize(1536)).toBe('1.5 fileSize.KB')
    expect(formatFileSize(5 * 1024 ** 4)).toBe('5120 fileSize.GB')
  })

  it('groups messages by contiguous date buckets', () => {
    const jan1 = Date.UTC(2026, 0, 1, 12)
    const jan2 = Date.UTC(2026, 0, 2, 12)

    expect(groupMessagesByDate([
      { id: 'a', timestamp: jan1 },
      { id: 'b', timestamp: jan1 + 1 },
      { id: 'c', timestamp: jan2 },
    ])).toEqual([
      { date: new Date(jan1).toDateString(), messages: [{ id: 'a', timestamp: jan1 }, { id: 'b', timestamp: jan1 + 1 }] },
      { date: new Date(jan2).toDateString(), messages: [{ id: 'c', timestamp: jan2 }] },
    ])
  })

  it('maps with bounded concurrency while preserving result order', async () => {
    let active = 0
    let maxActive = 0

    const result = await mapWithConcurrency([3, 1, 2, 4], 2, async (item) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, item))
      active -= 1
      return item * 10
    })

    expect(result).toEqual([30, 10, 20, 40])
    expect(maxActive).toBeLessThanOrEqual(2)
    await expect(mapWithConcurrency([1], 0, async (item) => item)).rejects.toThrow(RangeError)
  })

  it('settles failed concurrent items through the fallback', async () => {
    const error = new Error('boom')

    await expect(mapWithConcurrencySettled(
      [1, 2, 3],
      2,
      async (item, index) => {
        if (item === 2) throw error
        return `${index}:${item}`
      },
      (_item, index, thrown) => `${index}:${(thrown as Error).message}`,
    )).resolves.toEqual(['0:1', '1:boom', '2:3'])

    await expect(mapWithConcurrencySettled([1], Number.NaN, async (item) => item, () => 0))
      .rejects.toThrow(RangeError)
  })

  it('debounces calls and keeps only the latest arguments', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced('first')
    debounced('second')
    vi.advanceTimersByTime(99)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('second')
  })
})
