/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { createContactInvite } from './contactInvite'
import {
  createContactShareHttpsLink,
  createContactShareUri,
  parseContactShareTarget,
} from './contactShareLink'

const address = `EXO00${'ab'.repeat(19)}`

describe('contact share links', () => {
  it('creates reusable EXO links without a second server row', () => {
    expect(createContactShareHttpsLink(address)).toBe(`https://spectraprotocol.org/u/${address}`)
    expect(createContactShareUri(address)).toBe(`spectra://u/${address}`)
  })

  it('parses HTTPS, scheme, and bare EXO addresses', () => {
    expect(parseContactShareTarget(`https://spectraprotocol.org/u/${address}`)).toEqual({
      kind: 'address',
      walletAddress: address,
    })
    expect(parseContactShareTarget(`https://www.spectraprotocol.org/u/${address}`)).toEqual({
      kind: 'address',
      walletAddress: address,
    })
    expect(parseContactShareTarget(`spectra://u/${address}`)).toEqual({
      kind: 'address',
      walletAddress: address,
    })
    expect(parseContactShareTarget(address.toUpperCase())).toEqual({
      kind: 'address',
      walletAddress: address,
    })
  })

  it('prefers a contact invitation over an embedded address', () => {
    const invite = createContactInvite({
      identityId: 'identity-alice',
      mailboxCapability: 'smbx1.abcdefghijklmnop',
    })

    expect(parseContactShareTarget(invite)).toEqual({
      kind: 'invite',
      invite: {
        kind: 'direct',
        identityId: 'identity-alice',
        mailboxCapability: 'smbx1.abcdefghijklmnop',
      },
      raw: invite,
    })
  })

  it('rejects malformed share targets', () => {
    expect(parseContactShareTarget('https://spectraprotocol.org/u/not-an-address')).toBeNull()
    expect(parseContactShareTarget('')).toBeNull()
    expect(() => createContactShareHttpsLink('exo1invalid')).toThrow('Invalid EXO address')
  })
})
