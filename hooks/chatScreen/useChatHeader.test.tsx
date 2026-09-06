/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from '@testing-library/react-native'
import { renderHook } from '@/test/hookTestHarness'
import { useChatHeader } from './useChatHeader'

const headerMocks = vi.hoisted(() => ({
  alert: vi.fn(),
  chatState: {
    contacts: [] as Array<{
      identityId: string
      walletAddress?: string
      localWalletAddress?: string
      displayName?: string
      avatarUrl?: string
      trustState?: string
    }>,
    conversations: [] as Array<{
      id: string
      remoteIdentityId?: string
      localWalletAddress?: string
      subtitle?: string
    }>,
    isInitialized: true,
    updateContact: vi.fn(),
  },
  authState: { exoAddress: 'wallet-me' },
  groupState: {
    groups: [] as Array<{ groupId: string; title?: string; avatarUrl?: string | null }>,
    members: {} as Record<string, Array<{ identityId: string; displayName?: string; walletAddress?: string }>>,
  },
  walletState: { wallet: { address: 'wallet-me' } as { address: string } | null },
  bluetoothState: {
    status: 'ready',
    internetAvailable: true,
    nearbyContacts: [] as Array<{ identityId: string }>,
    config: { enabled: false },
  },
  spectreState: { enabled: false },
  torState: { enabled: false },
  callState: null as string | null,
  callError: null as Error | null,
  startCall: vi.fn(async () => '[QCALL:a1:voice:key]'),
  identity: { id: 'me' } as { id: string } | null,
  conversation: {
    id: 'conv-1',
    remoteIdentityId: 'peer',
    remoteTorEnabled: false,
    localWalletAddress: 'wallet-me',
  } as { id: string; remoteIdentityId?: string; remoteTorEnabled?: boolean; localWalletAddress?: string } | null,
  unblockContact: vi.fn(async () => {}),
}))

vi.mock('react-native', () => ({
  Alert: { alert: headerMocks.alert },
  View: 'View',
}))

vi.mock('@/store', () => ({
  useChatStore: Object.assign(
    (selector: (state: typeof headerMocks.chatState) => unknown) => selector(headerMocks.chatState),
    { getState: () => headerMocks.chatState },
  ),
  useAuthStore: (selector: (state: typeof headerMocks.authState) => unknown) => selector(headerMocks.authState),
  useGroupChatStore: (selector: (state: typeof headerMocks.groupState) => unknown) => selector(headerMocks.groupState),
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: typeof headerMocks.walletState) => unknown) => selector(headerMocks.walletState),
}))

vi.mock('@/store/bluetoothStore', () => ({
  useBluetoothStore: (selector: (state: typeof headerMocks.bluetoothState) => unknown) => selector(headerMocks.bluetoothState),
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: typeof headerMocks.spectreState) => unknown) => selector(headerMocks.spectreState),
}))

vi.mock('@/services/tor/torStore', () => ({
  useTorStore: (selector: (state: typeof headerMocks.torState) => unknown) => selector(headerMocks.torState),
}))

vi.mock('@/contexts', () => ({
  useCall: () => ({
    callState: headerMocks.callState,
    error: headerMocks.callError,
    startCall: headerMocks.startCall,
  }),
}))

vi.mock('@/lib/accountScope', () => ({
  isSameAccountStorageScope: (a?: string | null, b?: string | null) => !a || !b || a === b,
  matchesAccountStorageScope: (a?: string | null, b?: string | null) => !a || !b || a === b,
}))

vi.mock('@/services/chat', () => ({
  getConversation: () => headerMocks.conversation,
  getIdentity: () => headerMocks.identity,
  resolveIdentityId: (value: string) => value,
  unblockContact: headerMocks.unblockContact,
}))

vi.mock('@/lib/i18n', () => ({
  translate: (key: string, values?: Record<string, unknown>) => (
    values?.title ? key.replace('{{title}}', String(values.title)) : key
  ),
}))

vi.mock('@/lib/utils', () => ({
  formatAddress: (value: string) => `formatted:${value}`,
}))

function renderHeader(overrides: Partial<Parameters<typeof useChatHeader>[0]> = {}) {
  return renderHook(() => useChatHeader({
    address: 'peer',
    localWalletAddress: 'wallet-me',
    isGroupChat: false,
    groupId: null,
    ...overrides,
  }))
}

describe('useChatHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    headerMocks.chatState.contacts = [{
      identityId: 'peer',
      walletAddress: 'wallet-peer',
      localWalletAddress: 'wallet-me',
      displayName: 'Peer',
    }]
    headerMocks.chatState.conversations = [headerMocks.conversation!]
    headerMocks.groupState.groups = [{ groupId: 'group-1', title: 'Group' }]
    headerMocks.groupState.members = {
      'group-1': [
        { identityId: 'me', walletAddress: 'wallet-me' },
        { identityId: 'peer', displayName: 'Peer', walletAddress: 'wallet-peer' },
      ],
    }
    headerMocks.walletState.wallet = { address: 'wallet-me' }
    headerMocks.bluetoothState.status = 'ready'
    headerMocks.bluetoothState.internetAvailable = true
    headerMocks.bluetoothState.nearbyContacts = []
    headerMocks.bluetoothState.config = { enabled: false }
    headerMocks.spectreState.enabled = false
    headerMocks.torState.enabled = false
    headerMocks.callState = null
    headerMocks.callError = null
    headerMocks.identity = { id: 'me' }
    headerMocks.conversation = {
      id: 'conv-1',
      remoteIdentityId: 'peer',
      remoteTorEnabled: false,
      localWalletAddress: 'wallet-me',
    }
    headerMocks.startCall.mockResolvedValue('[QCALL:a1:voice:key]')
  })

  it('starts direct calls with resolved identity, conversation, and contact metadata', async () => {
    const harness = renderHeader()

    await act(async () => {
      await harness.result.handleStartCall('video')
    })

    expect(headerMocks.startCall).toHaveBeenCalledWith(
      'me',
      'peer',
      'conv-1',
      'video',
      'Peer',
      undefined,
    )
    expect(headerMocks.alert).not.toHaveBeenCalled()
  })

  it('blocks calls in group chats', async () => {
    const group = renderHeader({ isGroupChat: true, groupId: 'group-1' })
    await act(async () => {
      await group.result.handleStartCall('voice')
    })

    expect(headerMocks.startCall).not.toHaveBeenCalled()
    expect(headerMocks.alert).toHaveBeenCalledWith('Calls unavailable', 'Calls are only supported in direct chats.')
    expect(headerMocks.alert).toHaveBeenCalledOnce()
  })

  it('does not block calls based on a cached peer Tor flag', async () => {
    headerMocks.conversation = { ...headerMocks.conversation!, remoteTorEnabled: true }
    const harness = renderHeader()
    await act(async () => {
      await harness.result.handleStartCall('voice')
    })

    expect(headerMocks.startCall).toHaveBeenCalledOnce()
    expect(headerMocks.alert).not.toHaveBeenCalled()
  })

  it('blocks calls when Bluetooth mesh is the active transport', async () => {
    headerMocks.bluetoothState.config = { enabled: true }
    headerMocks.bluetoothState.internetAvailable = false
    const harness = renderHeader()
    await act(async () => {
      await harness.result.handleStartCall('voice')
    })

    expect(headerMocks.startCall).not.toHaveBeenCalled()
    expect(headerMocks.alert).toHaveBeenCalledWith(
      'Calls Unavailable in Bluetooth Mesh',
      expect.stringContaining('Bluetooth mesh'),
    )
  })

  it('matches authenticated nearby presence through the canonical contact identity', () => {
    headerMocks.bluetoothState.config = { enabled: true }
    headerMocks.bluetoothState.nearbyContacts = [{ identityId: 'peer' }]

    const harness = renderHeader({ address: 'wallet-peer' })

    expect(harness.result.isPeerNearby).toBe(true)
    expect(harness.result.bleRoute).toBe('ble-nearby')
  })

  it('does not duplicate an outgoing failure alert when the context exposes the same call error', async () => {
    const error = new Error('media denied')
    headerMocks.startCall.mockRejectedValue(error)
    const harness = renderHeader()

    await act(async () => {
      await harness.result.handleStartCall('voice')
    })
    headerMocks.callError = error
    harness.rerender()

    expect(headerMocks.alert).toHaveBeenCalledTimes(1)
    expect(headerMocks.alert).toHaveBeenCalledWith('Call Failed', 'media denied')
  })

  it('unblocks direct contacts without a profile lookup', async () => {
    const harness = renderHeader()

    await act(async () => {
      await harness.result.handleUnblock()
    })

    expect(headerMocks.unblockContact).toHaveBeenCalledWith('peer')
  })

  it('uses the locally stored avatar for the active contact', () => {
    headerMocks.chatState.contacts = [
      {
        identityId: 'alice',
        localWalletAddress: 'wallet-me',
        displayName: 'Alice',
        avatarUrl: 'alice-stored.png',
      },
      {
        identityId: 'bob',
        localWalletAddress: 'wallet-me',
        displayName: 'Bob',
        avatarUrl: 'bob-stored.png',
      },
    ]
    let address = 'alice'
    const harness = renderHook(() => useChatHeader({
      address,
      localWalletAddress: 'wallet-me',
      isGroupChat: false,
      groupId: null,
    }))

    expect(harness.result.contactAvatarUrl).toBe('alice-stored.png')

    address = 'bob'
    harness.rerender()
    expect(harness.result.contactAvatarUrl).toBe('bob-stored.png')
  })
})
