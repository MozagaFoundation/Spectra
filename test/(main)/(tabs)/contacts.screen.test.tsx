/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import {
  buildContactChatRoute,
  classifyContactsDiscoveryQuery,
  excludeSavedDiscoveryMatches,
  filterAndDedupeContacts,
  getVisibleContacts,
} from '@/lib/contactsScreen'
import type { ChatContact } from '@/lib/types'

const scopedWallet = 'EXO0011111111111111111111111111111111111111'
const contactWallet = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const otherWallet = 'EXO00cccccccccccccccccccccccccccccccccccccc'

function contact(overrides: Partial<ChatContact>): ChatContact {
  return {
    addedAt: 1,
    displayName: 'Alice',
    identityId: 'identity-alice',
    isHidden: false,
    isSaved: true,
    walletAddress: contactWallet,
    ...overrides,
  } as ChatContact
}

describe('ContactsScreen data contracts', () => {
  it('shows only saved visible contacts', () => {
    const result = getVisibleContacts([
      contact({ displayName: 'Saved' }),
      contact({ displayName: 'Hidden', isHidden: true }),
      contact({ displayName: 'Unsaved', isSaved: false }),
    ])

    expect(result.map((entry) => entry.displayName)).toEqual(['Saved'])
  })

  it('shows contacts only for the active local wallet when scoped', () => {
    const result = getVisibleContacts([
      contact({ displayName: 'Active', localWalletAddress: scopedWallet }),
      contact({
        displayName: 'Other',
        localWalletAddress: 'EXO0022222222222222222222222222222222222222',
      }),
      contact({ displayName: 'Legacy' }),
    ], scopedWallet)

    expect(result.map((entry) => entry.displayName)).toEqual(['Active'])
  })

  it('filters case-insensitively and dedupes scoped wallet matches by newest contact', () => {
    const older = contact({
      addedAt: 1,
      displayName: 'Older Alice',
      localWalletAddress: scopedWallet,
    })
    const newer = contact({
      addedAt: 2,
      displayName: 'Alice',
      localWalletAddress: scopedWallet,
    })
    const otherScope = contact({
      addedAt: 3,
      displayName: 'Alice Work',
      localWalletAddress: 'EXO0022222222222222222222222222222222222222',
    })

    const result = filterAndDedupeContacts([older, newer, otherScope], 'alice')

    expect(result).toEqual([newer, otherScope])
  })

  it('orders filtered contacts alphabetically after deduping', () => {
    const result = filterAndDedupeContacts([
      contact({ displayName: 'Charlie', identityId: 'identity-charlie', walletAddress: 'EXO00cccccccccccccccccccccccccccccccccccc' }),
      contact({ displayName: 'alice', identityId: 'identity-alice', walletAddress: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
      contact({ displayName: 'Bob', identityId: 'identity-bob', walletAddress: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }),
    ], '')

    expect(result.map((entry) => entry.displayName)).toEqual(['alice', 'Bob', 'Charlie'])
  })

  it('builds chat routes with wallet address priority and local scope', () => {
    expect(buildContactChatRoute(contact({
      identityId: 'identity-alice',
      localWalletAddress: scopedWallet,
      walletAddress: contactWallet,
    }))).toBe(`/(main)/chat/${contactWallet}?local=${scopedWallet}`)

    expect(buildContactChatRoute(contact({
      identityId: 'identity-only',
      walletAddress: undefined,
    }))).toBe('/(main)/chat/identity-only')
  })

  it('encodes dynamic chat route segments separately from the local query', () => {
    expect(buildContactChatRoute(contact({
      identityId: 'identity/with?query#fragment',
      localWalletAddress: 'EXO/local+wallet',
      walletAddress: undefined,
    }))).toBe('/(main)/chat/identity%2Fwith%3Fquery%23fragment?local=EXO%2Flocal%2Bwallet')
  })
})

describe('ContactsScreen discovery query split', () => {
  it('classifies alias prefixes and EXO addresses without treating names as discovery', () => {
    expect(classifyContactsDiscoveryQuery('Alice')).toEqual({ kind: 'none' })
    expect(classifyContactsDiscoveryQuery('@a')).toEqual({ kind: 'none' })
    expect(classifyContactsDiscoveryQuery('@alice')).toEqual({ kind: 'alias', query: '@alice' })
    expect(classifyContactsDiscoveryQuery(contactWallet)).toEqual({
      kind: 'exo',
      walletAddress: contactWallet,
    })
  })

  it('drops saved and own wallets from discovery rows', () => {
    const result = excludeSavedDiscoveryMatches(
      [
        { alias: '@alice', walletAddress: contactWallet },
        { alias: '@bob', walletAddress: scopedWallet },
        { alias: '@cara', walletAddress: otherWallet },
      ],
      [contact({})],
      scopedWallet,
    )
    expect(result).toEqual([
      { alias: '@cara', walletAddress: otherWallet },
    ])
  })

  it('does not treat hidden contacts as saved for discovery', () => {
    const visible = getVisibleContacts([contact({ isHidden: true })])
    expect(excludeSavedDiscoveryMatches(
      [{ alias: '@alice', walletAddress: contactWallet }],
      visible,
      scopedWallet,
    )).toEqual([
      { alias: '@alice', walletAddress: contactWallet },
    ])
  })
})

