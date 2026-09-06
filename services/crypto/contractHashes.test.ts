/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { hashTextToEntityId } from './contractHashes'

describe('hashTextToEntityId', () => {
  it('returns a 32-byte hex digest', () => {
    const digest = hashTextToEntityId('campaign description')
    expect(digest).toMatch(/^0x[a-f0-9]{64}$/)
  })

  it('does not collide on strings that only differ after the old truncation boundary', () => {
    const sharedPrefix = 'x'.repeat(32)
    const digestA = hashTextToEntityId(`${sharedPrefix}a`)
    const digestB = hashTextToEntityId(`${sharedPrefix}b`)

    expect(digestA).not.toBe(digestB)
  })
})
