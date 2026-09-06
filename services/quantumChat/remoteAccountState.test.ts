/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  wallet: { address: 'EXO00owner0000000000000000000000000000000000' } as { address: string } | null,
  contacts: [] as Array<Record<string, unknown>>,
  conversations: [] as Array<Record<string, unknown>>,
  batchUpdateContacts: vi.fn(),
  batchUpdateConversations: vi.fn(),
}))

vi.mock('@/lib/accountScope', () => ({
  isSameAccountStorageScope: (left?: string, right?: string) => left === right,
  matchesStrictAccountStorageScope: (left?: string, right?: string) => left === right,
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => ({ wallet: state.wallet }),
  },
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: {
    getState: () => ({
      contacts: state.contacts,
      conversations: state.conversations,
      batchUpdateContacts: state.batchUpdateContacts,
      batchUpdateConversations: state.batchUpdateConversations,
    }),
  },
}))

const {
  clearRemoteAccountUnavailableAfterMessage,
  hasRemoteAccountUnavailableMarker,
  isAuthenticatedRemoteAvailabilityCorroboration,
  isAvailabilityCorroboratingOutboundMessageKind,
  isRecipientUnavailableRelayFailure,
  markRemoteAccountUnavailable,
} = await import('./remoteAccountState')

describe('remote account state', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-02T19:00:00.000Z'))
    state.wallet = { address: 'EXO00owner0000000000000000000000000000000000' }
    state.contacts = []
    state.conversations = []
    state.batchUpdateContacts.mockReset()
    state.batchUpdateConversations.mockReset()
  })

  it('marks only active-account conversations after a terminal unavailable-recipient failure', () => {
    state.contacts = [{
      identityId: 'identity-recipient',
      localWalletAddress: state.wallet!.address,
    }]
    state.conversations = [
      {
        id: 'active-conversation',
        remoteIdentityId: 'identity-recipient',
        localWalletAddress: state.wallet!.address,
      },
      {
        id: 'other-account-conversation',
        remoteIdentityId: 'identity-recipient',
        localWalletAddress: 'EXO00other0000000000000000000000000000000000',
      },
    ]

    markRemoteAccountUnavailable('identity-recipient')

    expect(state.batchUpdateContacts).toHaveBeenCalledWith([{
      identityId: 'identity-recipient',
      changes: {
        remoteAccountState: 'deleted',
        remoteAccountStateUpdatedAt: Date.now(),
      },
    }])
    expect(state.batchUpdateConversations).toHaveBeenCalledWith([{
      id: 'active-conversation',
      changes: {
        remoteAccountState: 'deleted',
        remoteAccountStateUpdatedAt: Date.now(),
      },
    }])
  })

  it('clears every active-scope marker for a wallet after a corroborating message', () => {
    const remoteWalletAddress = 'EXO00recipient00000000000000000000000000000000'
    state.contacts = [
      {
        identityId: 'identity-recipient-old',
        walletAddress: remoteWalletAddress,
        localWalletAddress: state.wallet!.address,
        remoteAccountState: 'deleted',
      },
      {
        identityId: 'identity-recipient-new',
        walletAddress: remoteWalletAddress,
        localWalletAddress: state.wallet!.address,
        remoteAccountState: 'deleted',
      },
      {
        identityId: 'identity-other-account',
        walletAddress: remoteWalletAddress,
        localWalletAddress: 'EXO00other0000000000000000000000000000000000',
        remoteAccountState: 'deleted',
      },
    ]
    state.conversations = [
      {
        id: 'old-conversation',
        remoteIdentityId: 'identity-recipient-old',
        remoteWalletAddress,
        localWalletAddress: state.wallet!.address,
        remoteAccountState: 'deleted',
      },
      {
        id: 'new-conversation',
        remoteIdentityId: 'identity-recipient-new',
        remoteWalletAddress,
        localWalletAddress: state.wallet!.address,
        remoteAccountState: 'deleted',
      },
      {
        id: 'other-account-conversation',
        remoteIdentityId: 'identity-other-account',
        remoteWalletAddress,
        localWalletAddress: 'EXO00other0000000000000000000000000000000000',
        remoteAccountState: 'deleted',
      },
    ]

    clearRemoteAccountUnavailableAfterMessage(
      'identity-recipient-new',
      remoteWalletAddress,
    )

    expect(state.batchUpdateContacts).toHaveBeenCalledWith([
      {
        identityId: 'identity-recipient-old',
        changes: {
          remoteAccountState: undefined,
          remoteAccountStateUpdatedAt: Date.now(),
        },
      },
      {
        identityId: 'identity-recipient-new',
        changes: {
          remoteAccountState: undefined,
          remoteAccountStateUpdatedAt: Date.now(),
        },
      },
    ])
    expect(state.batchUpdateConversations).toHaveBeenCalledWith([
      {
        id: 'old-conversation',
        changes: {
          remoteAccountState: undefined,
          remoteAccountStateUpdatedAt: Date.now(),
        },
      },
      {
        id: 'new-conversation',
        changes: {
          remoteAccountState: undefined,
          remoteAccountStateUpdatedAt: Date.now(),
        },
      },
    ])
  })

  it('clears only the exact identity without a verified wallet address', () => {
    const remoteWalletAddress = 'EXO00recipient00000000000000000000000000000000'
    state.contacts = [
      {
        identityId: 'identity-recipient-old',
        walletAddress: remoteWalletAddress,
        localWalletAddress: state.wallet!.address,
        remoteAccountState: 'deleted',
      },
      {
        identityId: 'identity-recipient-new',
        walletAddress: remoteWalletAddress,
        localWalletAddress: state.wallet!.address,
        remoteAccountState: 'deleted',
      },
    ]

    clearRemoteAccountUnavailableAfterMessage('identity-recipient-new')

    expect(state.batchUpdateContacts).toHaveBeenCalledWith([{
      identityId: 'identity-recipient-new',
      changes: {
        remoteAccountState: undefined,
        remoteAccountStateUpdatedAt: Date.now(),
      },
    }])
  })

  it('clears a marked conversation identified by an authenticated inbound message', () => {
    state.conversations = [{
      id: 'retired-conversation',
      remoteIdentityId: 'identity-recipient-old',
      localWalletAddress: state.wallet!.address,
      remoteAccountState: 'deleted',
    }]

    clearRemoteAccountUnavailableAfterMessage(
      'identity-recipient-new',
      'EXO00recipient00000000000000000000000000000000',
      state.wallet!.address,
      'retired-conversation',
    )

    expect(state.batchUpdateConversations).toHaveBeenCalledWith([{
      id: 'retired-conversation',
      changes: {
        remoteAccountState: undefined,
        remoteAccountStateUpdatedAt: Date.now(),
      },
    }])
  })

  it('does not clear another account after an asynchronous scope change', () => {
    state.contacts = [{
      identityId: 'identity-recipient',
      localWalletAddress: state.wallet!.address,
      remoteAccountState: 'deleted',
    }]

    clearRemoteAccountUnavailableAfterMessage(
      'identity-recipient',
      undefined,
      'EXO00other0000000000000000000000000000000000',
    )

    expect(state.batchUpdateContacts).not.toHaveBeenCalled()
    expect(state.batchUpdateConversations).not.toHaveBeenCalled()
  })

  it('accepts only the structured terminal recipient-unavailable failure', () => {
    expect(isRecipientUnavailableRelayFailure({
      relayFailureReason: 'recipient_unavailable',
      relayStatusCode: 410,
      relayTransient: false,
    })).toBe(true)
    expect(isRecipientUnavailableRelayFailure({
      relayFailureReason: 'recipient_unavailable',
      relayStatusCode: 410,
      relayTransient: true,
    })).toBe(false)
    expect(isRecipientUnavailableRelayFailure({
      relayFailureReason: 'rejected',
      relayStatusCode: 410,
      relayTransient: false,
    })).toBe(false)
  })

  it('does not treat hidden controls as availability corroboration', () => {
    expect(isAvailabilityCorroboratingOutboundMessageKind('text')).toBe(true)
    expect(isAvailabilityCorroboratingOutboundMessageKind('view_once')).toBe(true)
    expect(isAvailabilityCorroboratingOutboundMessageKind('call_invitation')).toBe(true)
    expect(isAvailabilityCorroboratingOutboundMessageKind('hidden_control')).toBe(false)
    expect(isAvailabilityCorroboratingOutboundMessageKind(undefined)).toBe(false)
  })

  it('requires an authenticated, non-local direct message to corroborate recovery', () => {
    const base = {
      signatureVerified: true,
      senderIdentityId: 'identity-recipient',
      localIdentityId: 'identity-owner',
      senderBlocked: false,
      lockedViewOnce: false,
    }

    expect(isAuthenticatedRemoteAvailabilityCorroboration(base)).toBe(true)
    expect(isAuthenticatedRemoteAvailabilityCorroboration({
      ...base,
      signatureVerified: false,
    })).toBe(false)
    expect(isAuthenticatedRemoteAvailabilityCorroboration({
      ...base,
      senderIdentityId: 'identity-owner',
    })).toBe(false)
    expect(isAuthenticatedRemoteAvailabilityCorroboration({
      ...base,
      senderBlocked: true,
    })).toBe(false)
    expect(isAuthenticatedRemoteAvailabilityCorroboration({
      ...base,
      lockedViewOnce: true,
    })).toBe(false)
  })

  it('checks only the active account before resolving inbound recovery', () => {
    state.contacts = [{
      identityId: 'identity-other-account',
      localWalletAddress: 'EXO00other0000000000000000000000000000000000',
      remoteAccountState: 'deleted',
    }]
    expect(hasRemoteAccountUnavailableMarker()).toBe(false)

    state.conversations = [{
      id: 'active-conversation',
      remoteIdentityId: 'identity-recipient',
      localWalletAddress: state.wallet!.address,
      remoteAccountState: 'deleted',
    }]
    expect(hasRemoteAccountUnavailableMarker()).toBe(true)
  })
})
