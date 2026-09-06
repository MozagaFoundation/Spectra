/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'
import { findReusableStartChatContact, startChatRoute } from './startChatContact'
import type { ChatContact } from '@/lib/types'

const localWallet = 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const peerWallet = `EXO00${'a'.repeat(38)}`

function contact(overrides: Partial<ChatContact> = {}): ChatContact {
  return {
    identityId: 'identity-new',
    walletAddress: peerWallet,
    displayName: 'Peer',
    addedAt: 1,
    isSaved: true,
    isHidden: false,
    localWalletAddress: localWallet,
    ...overrides,
  }
}

describe('findReusableStartChatContact', () => {
  it('reuses a scoped contact by identity without requiring isSaved', () => {
    expect(findReusableStartChatContact(
      [contact({ isSaved: false })],
      { localWalletAddress: localWallet, identityId: 'identity-new' },
    )?.identityId).toBe('identity-new')
  })

  it('reuses a scoped contact by wallet address', () => {
    expect(findReusableStartChatContact(
      [contact()],
      { localWalletAddress: localWallet, walletAddress: peerWallet.toUpperCase() },
    )?.walletAddress).toBe(peerWallet)
  })

  it('does not reuse a hidden contact or a different account scope', () => {
    expect(findReusableStartChatContact(
      [contact({ isHidden: true })],
      { localWalletAddress: localWallet, identityId: 'identity-new' },
    )).toBeUndefined()
    expect(findReusableStartChatContact(
      [contact({ localWalletAddress: 'EXO00cccccccccccccccccccccccccccccccccccccc' })],
      { localWalletAddress: localWallet, identityId: 'identity-new' },
    )).toBeUndefined()
  })

  it('does not reuse a wallet match when the presented identity differs', () => {
    expect(findReusableStartChatContact(
      [contact({ identityId: 'identity-old' })],
      { localWalletAddress: localWallet, identityId: 'identity-new', walletAddress: peerWallet },
    )).toBeUndefined()
  })
})

describe('startChatRoute', () => {
  it('includes the local wallet query when present', () => {
    expect(startChatRoute('identity-new', localWallet)).toBe(
      `/(main)/chat/identity-new?local=${encodeURIComponent(localWallet)}`,
    )
    expect(startChatRoute(peerWallet)).toBe(`/(main)/chat/${peerWallet}`)
  })
})
