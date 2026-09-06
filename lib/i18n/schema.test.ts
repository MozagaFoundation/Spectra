/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { APP_NAMESPACES, createEmptyNamespaces } from './schema'

describe('i18n schema', () => {
  it('keeps app namespaces unique', () => {
    expect(new Set(APP_NAMESPACES).size).toBe(APP_NAMESPACES.length)
  })

  it('creates an empty translation object for every namespace', () => {
    const namespaces = createEmptyNamespaces()

    expect(Object.keys(namespaces).sort()).toEqual([...APP_NAMESPACES].sort())

    for (const namespace of APP_NAMESPACES) {
      expect(namespaces[namespace]).toEqual({})
    }
  })
})
