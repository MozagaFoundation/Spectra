/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import {
  createContactInvite,
  createOneTimeContactCardInvite,
  parseContactInvite,
} from './contactInvite'

describe('contact invitations', () => {
  it('round-trips an opaque mailbox capability', () => {
    const invite = {
      identityId: 'identity-alice-123',
      mailboxCapability: 'smbx1.abcdefghijklmnop',
    }

    expect(parseContactInvite(createContactInvite(invite))).toEqual({
      kind: 'direct',
      ...invite,
    })
  })

  it('accepts at most 256 characters in a mailbox capability', () => {
    const validInvite = {
      identityId: 'identity-alice-123',
      mailboxCapability: `smbx1.${'a'.repeat(250)}`,
    }

    expect(parseContactInvite(createContactInvite(validInvite))).toEqual({
      kind: 'direct',
      ...validInvite,
    })
    expect(() => createContactInvite({
      ...validInvite,
      mailboxCapability: `smbx1.${'a'.repeat(251)}`,
    })).toThrow('Invalid contact invitation')
  })

  it('round-trips a non-enumerable one-time contact card', () => {
    const invite = {
      cardId: `scc1.${'a'.repeat(32)}`,
      cardCapability: `sccap1.${'A'.repeat(43)}`,
      profileCapability: `sccpc1.${'B'.repeat(43)}`,
    }

    expect(parseContactInvite(createOneTimeContactCardInvite(invite))).toEqual({
      kind: 'contact_card',
      ...invite,
    })
  })

  it('accepts legacy cards without a profile capability', () => {
    expect(parseContactInvite(
      `spectra:contact-card:v1:scc1.${'a'.repeat(32)}:sccap1.${'A'.repeat(43)}`,
    )).toEqual({
      kind: 'contact_card',
      cardId: `scc1.${'a'.repeat(32)}`,
      cardCapability: `sccap1.${'A'.repeat(43)}`,
    })
  })

  it('accepts a valid invitation copied from a labeled share message', () => {
    const invite = {
      cardId: `scc1.${'a'.repeat(32)}`,
      cardCapability: `sccap1.${'A'.repeat(43)}`,
      profileCapability: `sccpc1.${'B'.repeat(43)}`,
    }

    expect(parseContactInvite(
      `My Post-Quantum Address: ${createOneTimeContactCardInvite(invite)}`,
    )).toEqual({
      kind: 'contact_card',
      ...invite,
    })
  })

  it('rejects malformed or incomplete values', () => {
    expect(parseContactInvite('EXO00123456789012345678901234567890123456')).toBeNull()
    expect(parseContactInvite('spectra:contact:v1:identity-alice-123:invalid')).toBeNull()
    expect(() => createContactInvite({
      identityId: 'bad identity',
      mailboxCapability: 'smbx1.abcdefghijklmnop',
    })).toThrow('Invalid contact invitation')
  })
})
