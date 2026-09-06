/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AddressBookSnapshot, ChatContact, UserTag } from '@/lib/types'

const OWNER = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const ALICE = 'EXO00abcdefabcdefabcdefabcdefabcdefabcdefab'
const BOB = 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const testState = vi.hoisted(() => ({
  snapshot: {
    version: 1,
    ownerWalletAddress: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    entries: [],
    tags: [],
  } as AddressBookSnapshot,
  contacts: [] as ChatContact[],
  tags: [] as UserTag[],
  setTags: vi.fn(),
  loadActiveAddressBookSnapshot: vi.fn(),
  updateActiveAddressBookSnapshot: vi.fn(),
}))

vi.mock('expo-local-authentication', () => ({
  hasHardwareAsync: vi.fn(async () => false),
  isEnrolledAsync: vi.fn(async () => false),
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      contacts: testState.contacts,
      tags: testState.tags,
      setTags: testState.setTags,
    }),
  },
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: {
    getState: () => ({
      enabled: false,
      spectreAccountMode: 'off',
    }),
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({
      wallet: { spectreMode: false },
    }),
  },
}))

vi.mock('@/services/storage/addressBookStorage', () => ({
  loadActiveAddressBookSnapshot: testState.loadActiveAddressBookSnapshot,
  updateActiveAddressBookSnapshot: testState.updateActiveAddressBookSnapshot,
}))

function tag(overrides: Partial<UserTag> = {}): UserTag {
  return {
    id: 'tag-friends',
    ownerWalletAddress: OWNER,
    tagName: 'friends',
    createdAt: 1,
    contactWalletAddresses: [],
    ...overrides,
  }
}

function resetSnapshot(nextTags: UserTag[] = [tag()]): void {
  testState.snapshot = {
    version: 1,
    ownerWalletAddress: OWNER,
    entries: [],
    tags: nextTags,
  }
  testState.tags = nextTags
}

describe('tagService address-book integration', () => {
  beforeEach(() => {
    resetSnapshot()
    testState.contacts = []
    testState.setTags.mockClear()
    testState.loadActiveAddressBookSnapshot.mockReset()
    testState.updateActiveAddressBookSnapshot.mockReset()

    testState.loadActiveAddressBookSnapshot.mockImplementation(async () => testState.snapshot)
    testState.updateActiveAddressBookSnapshot.mockImplementation(async (
      updater: (snapshot: AddressBookSnapshot) => AddressBookSnapshot | Promise<AddressBookSnapshot>,
    ) => {
      testState.snapshot = await updater(testState.snapshot)
      testState.tags = testState.snapshot.tags
      return testState.snapshot
    })
  })

  it('loads and creates tags using canonical owner wallet addresses', async () => {
    resetSnapshot([
      tag({ ownerWalletAddress: OWNER.toLowerCase(), tagName: 'friends' }),
      tag({ id: 'tag-other', ownerWalletAddress: BOB, tagName: 'work' }),
    ])

    const { createTag, loadUserTags } = await import('./tagService')

    await loadUserTags(OWNER)
    expect(testState.setTags).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'tag-friends' }),
    ])

    const duplicate = await createTag(OWNER, '#Friends')
    expect(duplicate.error?.message).toBe('Tag already exists')

    testState.tags = []
    resetSnapshot([])
    const created = await createTag(OWNER.toLowerCase(), ' Family ')
    expect(created.error).toBeNull()
    expect(created.tag).toEqual(expect.objectContaining({
      ownerWalletAddress: OWNER,
      tagName: 'family',
    }))
    expect(testState.snapshot.tags).toEqual([
      expect.objectContaining({
        ownerWalletAddress: OWNER,
        tagName: 'family',
      }),
    ])
  })

  it('adds and removes contacts by store identity with canonical wallet membership', async () => {
    testState.contacts = [{
      identityId: 'identity-alice',
      walletAddress: ALICE.toUpperCase(),
      displayName: 'Alice',
      addedAt: 1,
    }]

    const { addContactToTag, removeContactFromTag } = await import('./tagService')

    await expect(addContactToTag('tag-friends', 'identity-alice')).resolves.toEqual({ error: null })
    await expect(addContactToTag('tag-friends', ALICE.toUpperCase())).resolves.toEqual({ error: null })
    expect(testState.snapshot.tags[0].contactWalletAddresses).toEqual([ALICE])

    await expect(removeContactFromTag('tag-friends', ALICE.toUpperCase())).resolves.toEqual({ error: null })
    expect(testState.snapshot.tags[0].contactWalletAddresses).toEqual([])
  })

  it('requires a locally known contact wallet address', async () => {
    const { addContactToTag } = await import('./tagService')

    await expect(addContactToTag('tag-friends', 'identity-bob')).resolves.toEqual({
      error: expect.objectContaining({
        message: 'Contact wallet address is required to tag a canonical contact',
      }),
    })
    expect(testState.snapshot.tags[0].contactWalletAddresses).toEqual([])
  })
})
