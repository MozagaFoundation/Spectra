/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressBookSnapshot } from '../types'
import {
  addWalletToLocalTag,
  createEmptyAddressBookSnapshot,
  createLocalTag,
  findAddressBookEntry,
  normalizeAddressBookSnapshot,
  removeAddressBookEntry,
  removeWalletFromLocalTag,
  upsertAddressBookEntry,
  upsertAddressBookEntries,
  upsertLocalTag,
} from './addressBookState'

const OWNER = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const ALICE = 'EXO00abcdefabcdefabcdefabcdefabcdefabcdefab'
const BOB = 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

function snapshot(entries: AddressBookSnapshot['entries'] = []): AddressBookSnapshot {
  return {
    version: 1,
    ownerWalletAddress: OWNER,
    entries,
    tags: [],
  }
}

describe('addressBook state', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates an empty schema-versioned snapshot', () => {
    expect(createEmptyAddressBookSnapshot(OWNER)).toEqual({
      version: 1,
      ownerWalletAddress: OWNER,
      entries: [],
      tags: [],
    })
  })

  it('normalizes legacy duplicate entries into one canonical contact record', () => {
    const normalized = normalizeAddressBookSnapshot({
      version: 1,
      ownerWalletAddress: OWNER,
      entries: [
        {
          key: 'identity:identity-alice',
          walletAddress: ALICE.toUpperCase(),
          lastKnownIdentityId: 'identity-alice',
          displayName: 'Old Alice',
          isSaved: false,
          isHidden: true,
          trustState: 'changed',
          createdAt: 20,
          updatedAt: 20,
        },
        {
          key: `wallet:${ALICE}`,
          walletAddress: ALICE,
          lastKnownIdentityId: 'identity-alice',
          displayName: '  New Alice  ',
          isSaved: true,
          isHidden: false,
          trustState: 'trusted',
          createdAt: 10,
          updatedAt: 30,
        },
      ],
      tags: [
        {
          id: 'tag-friends',
          ownerWalletAddress: OWNER,
          tagName: '#Friends',
          createdAt: Number.NaN,
          contactWalletAddresses: [ALICE.toUpperCase(), ALICE, ''],
        },
      ],
    }, OWNER)

    expect(normalized.entries).toEqual([
      {
        key: `wallet:${ALICE}`,
        walletAddress: ALICE,
        lastKnownIdentityId: 'identity-alice',
        displayName: 'New Alice',
        isSaved: true,
        isHidden: true,
        trustState: 'changed',
        bundleVersion: undefined,
        identityVerifiedAt: undefined,
        createdAt: 10,
        updatedAt: 30,
      },
    ])
    expect(normalized.tags).toEqual([
      {
        id: 'tag-friends',
        ownerWalletAddress: OWNER,
        tagName: 'friends',
        createdAt: Date.now(),
        contactWalletAddresses: [ALICE],
      },
    ])
  })

  it('finds entries by canonical wallet key, identity key, or stored fields', () => {
    const entries = normalizeAddressBookSnapshot(snapshot([
      {
        key: `wallet:${ALICE}`,
        walletAddress: ALICE,
        lastKnownIdentityId: 'identity-alice',
        isSaved: true,
        isHidden: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ]), OWNER).entries

    expect(findAddressBookEntry(entries, { walletAddress: ALICE.toUpperCase() })?.lastKnownIdentityId).toBe('identity-alice')
    expect(findAddressBookEntry(entries, { identityId: ' identity-alice ' })?.walletAddress).toBe(ALICE)
    expect(findAddressBookEntry(entries, { walletAddress: BOB })).toBeUndefined()
  })

  it('upserts across wallet and identity duplicates without keeping stale records', () => {
    const current = snapshot([
      {
        key: 'identity:identity-alice',
        lastKnownIdentityId: 'identity-alice',
        displayName: 'Alice Before',
        isSaved: false,
        isHidden: true,
        trustState: 'changed',
        createdAt: 50,
        updatedAt: 60,
      },
      {
        key: `wallet:${ALICE}`,
        walletAddress: ALICE,
        displayName: 'Wallet Alias',
        isSaved: true,
        isHidden: false,
        trustState: 'trusted',
        createdAt: 40,
        updatedAt: 55,
      },
    ])

    const next = upsertAddressBookEntry(current, {
      walletAddress: ALICE.toUpperCase(),
      identityId: 'identity-alice',
      displayName: 'Alice After',
      isSaved: true,
      updatedAt: 100,
    })

    expect(next.entries).toHaveLength(1)
    expect(next.entries[0]).toEqual({
      key: `wallet:${ALICE}`,
      walletAddress: ALICE,
      lastKnownIdentityId: 'identity-alice',
      displayName: 'Alice After',
      isSaved: true,
      isHidden: true,
      trustState: 'changed',
      bundleVersion: undefined,
      identityVerifiedAt: undefined,
      createdAt: 40,
      updatedAt: 100,
    })
  })

  it('allows explicit updates to restore hidden contacts', () => {
    const next = upsertAddressBookEntry(snapshot([
      {
        key: `wallet:${ALICE}`,
        walletAddress: ALICE,
        lastKnownIdentityId: 'identity-alice',
        displayName: 'Alice',
        isSaved: true,
        isHidden: true,
        trustState: 'changed',
        createdAt: 1,
        updatedAt: 2,
      },
    ]), {
      identityId: 'identity-alice',
      isSaved: true,
      isHidden: false,
      updatedAt: 3,
    })

    expect(next.entries[0]).toEqual(expect.objectContaining({
      key: `wallet:${ALICE}`,
      walletAddress: ALICE,
      isSaved: true,
      isHidden: false,
      trustState: 'changed',
      updatedAt: 3,
    }))
  })

  it('drops legacy deletion markers during normalization', () => {
    const normalized = normalizeAddressBookSnapshot({
      ...snapshot([{
        key: `wallet:${ALICE}`,
        walletAddress: ALICE,
        lastKnownIdentityId: 'identity-alice',
        isSaved: true,
        isHidden: false,
        remoteAccountState: 'deleted',
        remoteAccountStateUpdatedAt: 100,
        createdAt: 1,
        updatedAt: 100,
      } as any]),
    }, OWNER)

    expect(normalized.entries[0]).not.toHaveProperty('remoteAccountState')
    expect(normalized.entries[0]).not.toHaveProperty('remoteAccountStateUpdatedAt')
  })

  it('applies large contact batches without duplicate wallet or identity entries', () => {
    const updates = Array.from({ length: 1_000 }, (_, index) => ({
      walletAddress: `EXO00${index.toString(16).padStart(40, '0')}`,
      identityId: `identity-${index}`,
      displayName: `Contact ${index}`,
      isSaved: true,
      updatedAt: index + 1,
    }))
    const next = upsertAddressBookEntries(snapshot(), [
      ...updates,
      {
        walletAddress: updates[500].walletAddress,
        identityId: updates[500].identityId,
        displayName: 'Updated Contact',
        isSaved: true,
        updatedAt: 2_000,
      },
    ])

    expect(next.entries).toHaveLength(1_000)
    expect(findAddressBookEntry(next.entries, { identityId: 'identity-500' }))
      .toEqual(expect.objectContaining({ displayName: 'Updated Contact' }))
  })

  it('keeps tag wallet membership canonical and idempotent', () => {
    const tag = createLocalTag(OWNER.toLowerCase(), '#Friends')
    let current = upsertLocalTag(createEmptyAddressBookSnapshot(OWNER), tag)

    current = addWalletToLocalTag(current, tag.id, ALICE.toUpperCase())
    current = addWalletToLocalTag(current, tag.id, ALICE)
    current = addWalletToLocalTag(current, tag.id, BOB)
    expect(current.tags[0].contactWalletAddresses).toEqual([ALICE, BOB])

    current = removeWalletFromLocalTag(current, tag.id, ALICE.toUpperCase())
    expect(current.tags[0].contactWalletAddresses).toEqual([BOB])
  })

  it('removes a contact entry and its tag membership', () => {
    const tag = createLocalTag(OWNER, 'friends')
    let current = upsertAddressBookEntry(createEmptyAddressBookSnapshot(OWNER), {
      walletAddress: ALICE,
      identityId: 'identity-alice',
      displayName: 'Alice',
      isSaved: true,
    })
    current = upsertLocalTag(current, tag)
    current = addWalletToLocalTag(current, tag.id, ALICE)

    current = removeAddressBookEntry(current, { identityId: 'identity-alice' })
    expect(current.entries).toEqual([])
    expect(current.tags[0].contactWalletAddresses).toEqual([])
  })
})
