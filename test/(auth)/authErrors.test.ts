/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { getSafeAuthErrorMessage } from '../../app/(auth)/authErrors'

describe('getSafeAuthErrorMessage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses sanitized production copy instead of raw runtime messages', () => {
    vi.stubGlobal('__DEV__', false)

    expect(getSafeAuthErrorMessage(
      new Error('seed phrase leaked through crypto backend'),
      'Failed to create account',
    )).toBe('Failed to create account')
  })

  it('keeps raw error messages available in development diagnostics', () => {
    vi.stubGlobal('__DEV__', true)

    expect(getSafeAuthErrorMessage(
      new Error('mocked development failure'),
      'Failed to create account',
    )).toBe('mocked development failure')
  })

  it('falls back for non-Error throws', () => {
    vi.stubGlobal('__DEV__', true)

    expect(getSafeAuthErrorMessage('bad failure', 'Failed to unlock')).toBe('Failed to unlock')
  })
})
