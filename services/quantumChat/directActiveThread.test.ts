/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { isActiveDirectThread } from './directActiveThread'

const localConversationContext = {
  localIdentityId: 'identity-me',
  localWalletAddress: 'EXO_LOCAL',
}

const conversations = [{
  id: 'conversation-1',
  localIdentityId: 'identity-me',
  localWalletAddress: 'EXO_LOCAL',
  remoteIdentityId: 'identity-peer',
  remoteWalletAddress: 'EXO_REMOTE',
}]

describe('isActiveDirectThread', () => {
  it('matches an incoming message by canonical conversation id', () => {
    expect(isActiveDirectThread({
      activeConversationId: 'conversation-1',
      conversations,
      localConversationContext,
      conversationId: 'conversation-1',
      senderIdentityId: 'identity-peer',
    })).toBe(true)
  })

  it('matches a provisional route identity before the handle activates', () => {
    expect(isActiveDirectThread({
      activeConversationId: 'identity-peer',
      conversations,
      localConversationContext,
      conversationId: 'conversation-1',
      senderIdentityId: 'identity-peer',
    })).toBe(true)
  })

  it('matches a provisional wallet route through the scoped conversation record', () => {
    expect(isActiveDirectThread({
      activeConversationId: 'EXO_REMOTE',
      conversations,
      localConversationContext,
      conversationId: 'conversation-1',
      senderIdentityId: 'identity-peer',
    })).toBe(true)
  })

  it('matches scoped notification-style direct thread keys', () => {
    expect(isActiveDirectThread({
      activeConversationId: 'local:EXO_LOCAL:identity-peer',
      conversations,
      localConversationContext,
      conversationId: 'conversation-1',
      senderIdentityId: 'identity-peer',
    })).toBe(true)
  })

  it('does not match another local wallet with the same remote identity', () => {
    expect(isActiveDirectThread({
      activeConversationId: 'local:EXO_OTHER:identity-peer',
      conversations,
      localConversationContext,
      conversationId: 'conversation-1',
      senderIdentityId: 'identity-peer',
    })).toBe(false)
  })
})
