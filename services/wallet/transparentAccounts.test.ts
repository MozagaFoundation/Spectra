/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import type { EXOWallet } from '@spectra/identity-vault'

import { getRootExoWallet } from './transparentAccounts'

function wallet(overrides: Partial<EXOWallet> & { id: string; address: string }): EXOWallet {
  const { id, address, ...rest } = overrides
  return {
    id,
    address,
    publicKey: `${id}-public`,
    privateKey: `${id}-private`,
    createdAt: Date.now(),
    ...rest,
  }
}

const rootWallet = wallet({
  id: 'root',
  address: 'EXO_ROOT',
  displayName: 'Root',
})

const transparentWallet = wallet({
  id: 'transparent',
  address: 'EXO_TRANSPARENT',
  displayName: 'Transparent',
  transparentMode: true,
})

const spectreWallet = wallet({
  id: 'spectre',
  address: 'EXO_SPECTRE',
  displayName: 'Spectre',
  spectreMode: true,
})

describe('getRootExoWallet', () => {
  it('returns null when no normal wallets exist', () => {
    expect(getRootExoWallet([])).toBeNull()
    expect(getRootExoWallet([spectreWallet])).toBeNull()
  })

  it('prefers the first non-transparent normal wallet', () => {
    expect(getRootExoWallet([transparentWallet, rootWallet])).toBe(rootWallet)
  })

  it('falls back to the first transparent normal wallet', () => {
    expect(getRootExoWallet([spectreWallet, transparentWallet])).toBe(transparentWallet)
  })

  it('documents first-in-array behavior when multiple roots are possible', () => {
    const firstRoot = wallet({ id: 'first-root', address: 'EXO_FIRST_ROOT' })
    const secondRoot = wallet({ id: 'second-root', address: 'EXO_SECOND_ROOT' })
    const firstChild = wallet({
      id: 'first-child',
      address: 'EXO_FIRST_CHILD',
      transparentMode: true,
    })

    expect(getRootExoWallet([secondRoot, firstChild, firstRoot])).toBe(secondRoot)
  })
})
