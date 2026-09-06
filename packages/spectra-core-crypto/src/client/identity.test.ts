/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  contactBundleAlreadyStored,
  shouldPersistContactBundle,
} from './identity'

const stored = {
  identityId: 'remote',
  identityKey: 'ik',
  dilithiumKey: 'dk',
  mlkemIdentityKey: 'mk',
  version: 2,
  bundleSignature: 'sig',
  oneTimePreKeys: [{ id: 1 }, { id: 2 }],
} as any

describe('contact bundle persist guards', () => {
  it('skips an unchanged stored bundle', () => {
    expect(contactBundleAlreadyStored(stored, { ...stored, oneTimePreKeys: [] })).toBe(true)
    expect(shouldPersistContactBundle(stored, { ...stored })).toBe(false)
  })

  it('does not replace a full stored bundle with an OPK-stripped copy', () => {
    expect(shouldPersistContactBundle(stored, {
      ...stored,
      oneTimePreKeys: [],
    })).toBe(false)
  })

  it('persists a newer signed bundle even when fewer OPKs remain', () => {
    expect(shouldPersistContactBundle(stored, {
      ...stored,
      version: 3,
      bundleSignature: 'new-sig',
      oneTimePreKeys: [{ id: 1 }],
    })).toBe(true)
  })

  it('persists identity-key changes', () => {
    expect(shouldPersistContactBundle(stored, {
      ...stored,
      identityKey: 'new-ik',
      oneTimePreKeys: [],
    })).toBe(true)
  })
})
