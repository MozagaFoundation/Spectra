/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

let chatState: {
  conversations: Array<{ id: string; localWalletAddress?: string; remoteIdentityId: string; remoteWalletAddress?: string; unreadCount: number; createdAt: number; updatedAt: number }>
  contacts: Array<{ localWalletAddress?: string; identityId: string; walletAddress?: string; displayName: string; addedAt: number }>
} = {
  conversations: [],
  contacts: [],
}

let groupState: {
  groups: Array<{ groupId: string }>
} = {
  groups: [],
}

let walletState: {
  isVaultUnlocked: boolean
  wallets: Array<{ address: string; spectreMode?: boolean }>
} = {
  isVaultUnlocked: false,
  wallets: [],
}

vi.mock('@/store/chatStore', () => ({
  useChatStore: {
    getState: () => chatState,
  },
}))

vi.mock('@/store/groupChatStore', () => ({
  useGroupChatStore: {
    getState: () => groupState,
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: {
    getState: () => walletState,
  },
}))

import {
  isCallEndNotification,
  isCallLifecycleNotification,
  isIncomingCallNotification,
  resolveNotificationRoute,
} from './notificationRouting'

function seedKnownRoutes() {
  chatState = {
    conversations: [{
      id: 'conversation-2',
      localWalletAddress: 'exo1work',
      remoteIdentityId: 'identity-3',
      remoteWalletAddress: 'exo1abc',
      unreadCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }],
    contacts: [{
      localWalletAddress: 'exo1work',
      identityId: 'identity-3',
      walletAddress: 'exo1abc',
      displayName: 'Identity 3',
      addedAt: Date.now(),
    }],
  }
  groupState = {
    groups: [{
      groupId: 'team-room',
    }],
  }
  walletState = {
    isVaultUnlocked: true,
    wallets: [{
      address: 'exo1work',
    }],
  }
}

beforeEach(() => {
  chatState = { conversations: [], contacts: [] }
  groupState = { groups: [] }
  walletState = { isVaultUnlocked: false, wallets: [] }
})

describe('call notification classification', () => {
  it('detects incoming call notifications', () => {
    expect(isIncomingCallNotification({
      type: 'call',
      callSessionId: 'session-1',
      callType: 'voice',
    })).toBe(true)
    expect(isCallLifecycleNotification({
      type: 'call',
      callSessionId: 'session-1',
      callType: 'voice',
    })).toBe(true)
  })

  it('detects call end notifications separately', () => {
    expect(isCallEndNotification({
      type: 'call_end',
      callSessionId: 'session-2',
    })).toBe(true)
    expect(isCallLifecycleNotification({
      type: 'call_end',
      callSessionId: 'session-2',
    })).toBe(true)
  })

  it('does not classify chat notifications as calls', () => {
    expect(isCallLifecycleNotification({
      conversationId: 'conversation-1',
      remoteIdentityId: 'identity-1',
    })).toBe(false)
  })
})

describe('resolveNotificationRoute', () => {
  it('routes incoming calls to the pending-call recovery surface when the vault is unlocked', () => {
    seedKnownRoutes()
    expect(resolveNotificationRoute({
      type: 'call',
      callSessionId: 'session-3',
      remoteIdentityId: 'identity-3',
    }, true, true)).toBe('/(main)/(tabs)/chats?pendingCall=1')
  })

  it('routes incoming calls to unlock with pending-call context when the app is locked', () => {
    seedKnownRoutes()
    expect(resolveNotificationRoute({
      type: 'call',
      callSessionId: 'session-4',
      groupId: 'team-room',
    }, true, false)).toBe('/(auth)/unlock?pendingCall=1')
  })

  it('routes direct message notifications into the related chat', () => {
    seedKnownRoutes()
    expect(resolveNotificationRoute({
      conversationId: 'conversation-2',
      remoteWalletAddress: 'exo1abc',
    }, true, true)).toBe('/(main)/chat/exo1abc')
  })

  it('preserves local account context when routing direct notifications', () => {
    seedKnownRoutes()
    expect(resolveNotificationRoute({
      conversationId: 'conversation-2',
      remoteWalletAddress: 'exo1abc',
      localWalletAddress: 'exo1work',
    }, true, true)).toBe('/(main)/chat/exo1abc?local=exo1work')
  })

  it('encodes path and query segments from known notification targets', () => {
    chatState = {
      conversations: [{
        id: 'conversation-special',
        localWalletAddress: 'exo/work wallet',
        remoteIdentityId: 'identity/with?query#hash',
        remoteWalletAddress: 'exo/abc?tab=1#frag',
        unreadCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
      contacts: [],
    }
    groupState = {
      groups: [{ groupId: 'team/room?x=1#frag' }],
    }
    walletState = {
      isVaultUnlocked: true,
      wallets: [{ address: 'exo/work wallet' }],
    }

    expect(resolveNotificationRoute({
      conversationId: 'conversation-special',
      remoteWalletAddress: 'exo/abc?tab=1#frag',
      localWalletAddress: 'exo/work wallet',
    }, true, true)).toBe('/(main)/chat/exo%2Fabc%3Ftab%3D1%23frag?local=exo%2Fwork%20wallet')
    expect(resolveNotificationRoute({
      type: 'call',
      callSessionId: 'call-special',
      groupId: 'team/room?x=1#frag',
    }, true, true)).toBe('/(main)/(tabs)/chats?pendingCall=1')
  })

  it('does not match an active-store conversation from a different local account', () => {
    seedKnownRoutes()
    walletState = {
      isVaultUnlocked: false,
      wallets: [],
    }

    expect(resolveNotificationRoute({
      conversationId: 'conversation-2',
      remoteWalletAddress: 'exo1abc',
      localWalletAddress: 'exo1friends',
    }, true, true)).toBeNull()
  })

  it('routes inactive local account notifications when the wallet exists in the unlocked vault', () => {
    chatState = { conversations: [], contacts: [] }
    walletState = {
      isVaultUnlocked: true,
      wallets: [
        { address: 'exo1work' },
        { address: 'exo1spectre', spectreMode: true },
      ],
    }

    expect(resolveNotificationRoute({
      conversationId: 'conversation-new',
      remoteIdentityId: 'identity-new',
      localWalletAddress: 'exo1work',
    }, true, true)).toBe('/(main)/chat/identity-new?local=exo1work')
  })

  it('does not route inactive local account notifications to Spectre wallets', () => {
    chatState = { conversations: [], contacts: [] }
    walletState = {
      isVaultUnlocked: true,
      wallets: [{ address: 'exo1spectre', spectreMode: true }],
    }

    expect(resolveNotificationRoute({
      conversationId: 'conversation-new',
      remoteIdentityId: 'identity-new',
      localWalletAddress: 'exo1spectre',
    }, true, true)).toBeNull()
  })

  it('does not route call end notifications', () => {
    expect(resolveNotificationRoute({
      type: 'call_end',
      callSessionId: 'session-5',
      remoteIdentityId: 'identity-5',
    }, true, true)).toBeNull()
  })

  it('routes wallet index wakeups to Wallets without trusting event metadata', () => {
    expect(resolveNotificationRoute({
      type: 'wallet_index_wakeup',
      chain: 'ethereum',
      txHash: '0xprivacy-sensitive',
    }, true, true)).toBe('/(main)/(tabs)/crypto')
    expect(resolveNotificationRoute({
      type: 'wallet_index_wakeup',
    }, true, false)).toBe('/(auth)/unlock')
  })

  it('does not route group message payloads that lack a conversation and remote target', () => {
    seedKnownRoutes()
    expect(resolveNotificationRoute({
      groupId: 'team-room',
    }, true, true)).toBeNull()
  })

  it('drops unknown chat routes instead of trusting notification payloads', () => {
    expect(resolveNotificationRoute({
      conversationId: 'conversation-x',
      remoteIdentityId: 'identity-x',
    }, true, true)).toBeNull()
  })
})
