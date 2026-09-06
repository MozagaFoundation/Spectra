/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 */

import { describe, expect, it } from 'vitest'

import { canShareOwnContactProfileWith } from './contactProfilePolicy'

describe('canShareOwnContactProfileWith', () => {
  it('requires an established, eligible contact', () => {
    expect(canShareOwnContactProfileWith(undefined)).toBe(false)
    expect(canShareOwnContactProfileWith({ trustState: 'unknown' })).toBe(false)
    expect(canShareOwnContactProfileWith({ trustState: 'blocked' })).toBe(false)
    expect(canShareOwnContactProfileWith({ trustState: 'changed' })).toBe(false)
    expect(canShareOwnContactProfileWith({ identityChanged: true })).toBe(false)
    expect(canShareOwnContactProfileWith({ trustState: 'trusted' })).toBe(true)
  })

  it('requires an explicitly saved contact before answering a profile request', () => {
    expect(canShareOwnContactProfileWith(
      { trustState: 'trusted', isSaved: false },
      { requireSavedContact: true },
    )).toBe(false)
    expect(canShareOwnContactProfileWith(
      { trustState: 'verified', isSaved: true },
      { requireSavedContact: true },
    )).toBe(true)
  })
})
