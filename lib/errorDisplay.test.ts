/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/i18n', () => ({
  translate: (key: string, options?: { ns?: string }) => `${options?.ns ?? 'default'}:${key}`,
}))

import { getErrorDisplayMessage, shouldShowErrorDetails } from './errorDisplay'

describe('errorDisplay', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows raw error details in development', () => {
    vi.stubGlobal('__DEV__', true)

    expect(shouldShowErrorDetails()).toBe(true)
    expect(getErrorDisplayMessage(new Error('secret debug detail'))).toBe('secret debug detail')
    expect(getErrorDisplayMessage('string debug detail')).toBe('string debug detail')
  })

  it('hides raw error details outside development', () => {
    vi.stubGlobal('__DEV__', false)

    expect(shouldShowErrorDetails()).toBe(false)
    expect(getErrorDisplayMessage(new Error('database stack detail')))
      .toBe('errors:Something went wrong. Please try again.')
    expect(getErrorDisplayMessage('server detail'))
      .toBe('errors:Something went wrong. Please try again.')
  })
})
