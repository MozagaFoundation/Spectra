/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import type { AddressBookEntry, KnownPeer } from '../types'
import { projectContacts, slimContactForUi } from './contactProjection'

const ALICE = 'EXO00abcdefabcdefabcdefabcdefabcdefabcdefab'
const BOB = 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

function peer(overrides: Partial<KnownPeer>): KnownPeer {
  return {
    identityId: 'identity-default',
    addedAt: 1,
    ...overrides,
  }
}

function entry(overrides: Partial<AddressBookEntry>): AddressBookEntry {
  return {
    key: 'identity:identity-default',
    isSaved: false,
    isHidden: false,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('addressBook contact projection', () => {
  it('dedupes identities and prefers address-book metadata for local state', () => {
    const contacts = projectContacts([
      peer({
        identityId: 'identity-alice',
        walletAddress: ALICE,
        displayName: 'Remote Alice',
        sharedDisplayName: 'Shared Alice',
        addedAt: 30,
        publicKeyBundle: { identityId: 'identity-alice', version: 1 } as any,
        bundleVersion: 1,
        trustState: 'trusted',
        isOnline: true,
      }),
      peer({
        identityId: 'identity-alice',
        walletAddress: undefined,
        displayName: '',
        addedAt: 10,
        publicKeyBundle: { identityId: 'identity-alice', version: 2 } as any,
        bundleVersion: 2,
        lastSeenAt: 99,
      }),
    ], [
      entry({
        key: `wallet:${ALICE}`,
        walletAddress: ALICE,
        lastKnownIdentityId: 'identity-alice',
        displayName: 'Local Alice',
        isSaved: true,
        isHidden: true,
        trustState: 'changed',
        contactProfile: {
          version: 1,
          identityId: 'identity-alice',
          revision: 1,
          avatarDataUri: 'data:image/png;base64,AAAA',
          signature: '0xsignature',
        },
      }),
    ])

    expect(contacts).toEqual([
      expect.objectContaining({
        identityId: 'identity-alice',
        walletAddress: ALICE,
        displayName: 'Local Alice',
        sharedDisplayName: 'Shared Alice',
        addedAt: 10,
        bundleVersion: 2,
        trustState: 'changed',
        avatarUrl: 'data:image/png;base64,AAAA',
        isSaved: true,
        isHidden: true,
        isOnline: true,
        lastSeenAt: 99,
      }),
    ])
  })

  it('does not downgrade a runtime identity lock with stale address-book trust', () => {
    const contacts = projectContacts([
      peer({
        identityId: 'identity-alice',
        walletAddress: ALICE,
        trustState: 'changed',
      }),
    ], [
      entry({
        walletAddress: ALICE,
        lastKnownIdentityId: 'identity-alice',
        trustState: 'trusted',
      }),
    ])

    expect(contacts[0]?.trustState).toBe('changed')
  })

  it('uses shared profile names only when no local alias is saved', () => {
    const contacts = projectContacts([
      peer({
        identityId: 'identity-alice',
        walletAddress: ALICE,
        displayName: 'Remote Alice',
        sharedDisplayName: 'Shared Alice',
      }),
      peer({
        identityId: 'identity-bob',
        walletAddress: BOB,
        displayName: 'Remote Bob',
        sharedDisplayName: 'Shared Bob',
      }),
    ], [
      entry({
        key: `wallet:${BOB}`,
        walletAddress: BOB,
        lastKnownIdentityId: 'identity-bob',
        displayName: 'Local Bob',
        isSaved: true,
      }),
    ])

    expect(contacts.find((contact) => contact.identityId === 'identity-alice')?.displayName).toBe('Shared Alice')
    expect(contacts.find((contact) => contact.identityId === 'identity-bob')?.displayName).toBe('Local Bob')
  })

  it('does not let unsaved placeholder names override shared profile names', () => {
    const contacts = projectContacts([
      peer({
        identityId: 'identity-alice',
        walletAddress: ALICE,
        displayName: 'User identity',
        sharedDisplayName: 'Shared Alice',
      }),
    ], [
      entry({
        key: `wallet:${ALICE}`,
        walletAddress: ALICE,
        lastKnownIdentityId: 'identity-alice',
        displayName: 'User identity',
        isSaved: false,
      }),
    ])

    expect(contacts[0]?.displayName).toBe('Shared Alice')
  })

  it('does not let saved generated names override shared profile names', () => {
    const contacts = projectContacts([
      peer({
        identityId: 'identity-alice',
        walletAddress: ALICE,
        displayName: 'User identity',
        sharedDisplayName: 'Shared Alice',
      }),
    ], [
      entry({
        key: `wallet:${ALICE}`,
        walletAddress: ALICE,
        lastKnownIdentityId: 'identity-alice',
        displayName: 'User identity',
        isSaved: true,
      }),
    ])

    expect(contacts[0]?.displayName).toBe('Shared Alice')
    expect(contacts[0]?.isSaved).toBe(true)
  })

  it('dedupes wallet-address aliases using canonical wallet casing', () => {
    const contacts = projectContacts([
      peer({
        identityId: 'identity-old',
        walletAddress: ALICE,
        displayName: 'Old identity',
        addedAt: 10,
      }),
      peer({
        identityId: 'identity-new',
        walletAddress: ALICE.toUpperCase(),
        displayName: 'New identity',
        addedAt: 20,
      }),
    ], [])

    expect(contacts).toHaveLength(1)
    expect(contacts[0]).toEqual(expect.objectContaining({
      identityId: 'identity-new',
      walletAddress: ALICE,
      displayName: 'New identity',
    }))
  })

  it('falls back to wallet and identity-derived names and sorts by newest contacts first', () => {
    const contacts = projectContacts([
      peer({
        identityId: 'identity-alice-abcdef',
        walletAddress: ALICE,
        addedAt: 10,
      }),
      peer({
        identityId: 'identity-bob-abcdef',
        walletAddress: undefined,
        addedAt: 20,
      }),
      peer({
        identityId: 'identity-charlie-abcdef',
        walletAddress: BOB,
        displayName: 'Charlie',
        addedAt: 30,
      }),
    ], [])

    expect(contacts.map((contact) => contact.identityId)).toEqual([
      'identity-charlie-abcdef',
      'identity-bob-abcdef',
      'identity-alice-abcdef',
    ])
    expect(contacts.find((contact) => contact.identityId === 'identity-alice-abcdef')?.displayName).toBe(ALICE)
    expect(contacts.find((contact) => contact.identityId === 'identity-bob-abcdef')?.displayName).toBe('User identity')
  })

  it('drops one-time pre-keys from UI contact bundles', () => {
    expect(slimContactForUi({
      identityId: 'identity-alice',
      displayName: 'Alice',
      addedAt: 1,
      publicKeyBundle: {
        identityId: 'identity-alice',
        oneTimePreKeys: [{ id: 1 }],
      } as any,
    }).publicKeyBundle?.oneTimePreKeys).toEqual([])
  })
})
