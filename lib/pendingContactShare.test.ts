/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, describe, expect, it } from 'vitest'

import {
  clearPendingContactShareAddress,
  consumePendingContactShareAddress,
  peekPendingContactShareAddress,
  rememberPendingContactShareAddress,
} from './pendingContactShare'

const address = `EXO00${'ab'.repeat(19)}`

describe('pendingContactShare', () => {
  afterEach(() => {
    clearPendingContactShareAddress()
  })

  it('stores a normalized EXO address until it is consumed', () => {
    rememberPendingContactShareAddress(`  ${address.toUpperCase()}  `)
    expect(peekPendingContactShareAddress()).toBe(address)
    expect(consumePendingContactShareAddress()).toBe(address)
    expect(peekPendingContactShareAddress()).toBeNull()
    expect(consumePendingContactShareAddress()).toBeNull()
  })

  it('rejects values that are not reusable EXO share addresses', () => {
    rememberPendingContactShareAddress(address)
    rememberPendingContactShareAddress('https://spectraprotocol.org/u/not-an-address')
    expect(peekPendingContactShareAddress()).toBeNull()
    expect(consumePendingContactShareAddress()).toBeNull()
  })
})
