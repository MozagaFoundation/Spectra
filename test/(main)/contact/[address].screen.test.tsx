/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  chat: {
    contacts: [] as Array<any>,
    conversations: [] as Array<any>,
    messages: [] as Array<any>,
    mutedConversationIds: [] as string[],
    toggleMuteConversation: vi.fn(),
    updateContact: vi.fn(),
  },
  group: {
    groups: [] as Array<any>,
    members: {} as Record<string, Array<any>>,
  },
  params: {
    address: 'identity-unknown',
    local: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  },
  router: { back: vi.fn(), push: vi.fn(), replace: vi.fn() },
  services: {
    acceptContactIdentityReplacement: vi.fn(async () => ({ identityId: 'identity-new', success: true })),
    addContactByAddress: vi.fn(async () => ({ identityId: 'identity-unknown', success: true })),
  },
  walletState: {
    wallet: { address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', displayName: 'Root' },
    wallets: [{ address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', displayName: 'Root' }],
  },
}))

const safetyNumber = {
  numeric: '123451234512345123451234512345123451234512345123451234512345',
  qrData: 'spectra:safety:v1:test',
  fingerprint: '1234 5678',
  fullHash: 'a'.repeat(64),
}

vi.mock('react-native', async () => {
  const rn = await import('../../../test/react-native')
  return { ...rn, Alert: { alert: vi.fn() }, Share: { share: vi.fn() } }
})

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
}))

vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn(async () => {}) }))
vi.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Error: 'error', Success: 'success' },
  notificationAsync: vi.fn(async () => {}),
}))
vi.mock('expo-image', async () => {
  const { Image } = await import('../../../test/react-native')
  return { Image }
})

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainAppMocks')
  return {
    AlertCircle: TestIcon,
    Ban: TestIcon,
    Bell: TestIcon,
    BellOff: TestIcon,
    Check: TestIcon,
    CheckCircle: TestIcon,
    ChevronLeft: TestIcon,
    ChevronRight: TestIcon,
    Clock3: TestIcon,
    Copy: TestIcon,
    Eraser: TestIcon,
    FileText: TestIcon,
    Image: TestIcon,
    MessageSquare: TestIcon,
    Share2: TestIcon,
    Shield: TestIcon,
    Trash2: TestIcon,
    UserPlus: TestIcon,
    Users: TestIcon,
    Video: TestIcon,
    X: TestIcon,
  }
})

vi.mock('@/components/common', async () => {
  const { TestAvatar } = await import('../../../test/mainAppMocks')
  return { Avatar: TestAvatar }
})

vi.mock('@/components/ui', async () => {
  const { TestButton, TestCard, TestInput } = await import('../../../test/mainAppMocks')
  return { Button: TestButton, Card: TestCard, Input: TestInput }
})

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
}))

vi.mock('@/lib/i18n', async () => {
  const { translateForTest } = await import('../../../test/mainAppMocks')
  return { getCurrentLocaleTag: () => 'en-US', translate: translateForTest }
})

vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../../test/mainAppMocks')
  return { useThemeColors: () => testColors }
})

vi.mock('@/lib/utils', () => ({ formatAddress: (value: string) => value }))
vi.mock('@/lib/accountScope', () => ({
  isSameAccountStorageScope: (a?: string, b?: string) => a?.toLowerCase() === b?.toLowerCase(),
  matchesAccountStorageScope: (a?: string, b?: string) => (a || b) ? a?.toLowerCase() === b?.toLowerCase() : true,
}))
vi.mock('@/lib/chatSharedContent', () => ({
  getDirectConversationIds: () => [],
  getDirectConversationSharedContentSummary: () => ({ attachmentPreviews: [], totalCount: 0 }),
}))

vi.mock('@/services/chat', () => ({
  acceptContactIdentityReplacement: mockState.services.acceptContactIdentityReplacement,
  addContactByAddress: mockState.services.addContactByAddress,
  getGroupRouteParam: (id: string) => `group:${id}`,
}))

vi.mock('@/services/quantumChat', () => ({
  getIdentity: () => ({ id: 'identity-me' }),
}))

vi.mock('@/services/chat/chatService', () => ({
  blockContact: vi.fn(),
  clearConversationChat: vi.fn(),
  deleteContact: vi.fn(),
  loadCachedMessagesForConversation: vi.fn(async () => {}),
  renameContact: vi.fn(),
  setConversationDisappearingTimer: vi.fn(),
  unblockContact: vi.fn(),
}))

vi.mock('@/store', () => ({
  useChatStore: (selector: (state: typeof mockState.chat) => unknown) => selector(mockState.chat),
  useGroupChatStore: (selector: (state: typeof mockState.group) => unknown) => selector(mockState.group),
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: typeof mockState.walletState) => unknown) => selector(mockState.walletState),
}))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: ContactDetailScreen } = await import('../../../app/(main)/contact/[address]')

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

function findPressableByText(root: any, text: string) {
  return root.findAll((node: any) => node.type === 'Pressable' && nodeText(node).includes(text))[0]
}

describe('ContactDetailScreen unknown contact flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.chat.contacts = []
    mockState.params.address = 'identity-unknown'
    mockState.params.local = 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    mockState.services.addContactByAddress.mockResolvedValue({ identityId: 'identity-unknown', success: true })
    mockState.services.acceptContactIdentityReplacement.mockResolvedValue({ identityId: 'identity-new', success: true })
  })

  it('uses the invitation address and local scope when messaging without adding', async () => {
    const view = render(<ContactDetailScreen />)
    await act(async () => {})

    expect(screen.getAllByText('identity-unknown').length).toBeGreaterThan(0)

    await fireEvent.press(findPressableByText(view.root, 'Message Without Adding'))

    expect(mockState.router.push).toHaveBeenCalledWith(
      '/(main)/chat/identity-unknown?local=EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    )
  })

  it('requires explicit verification before replacing identity while adding from contact details', async () => {
    mockState.services.addContactByAddress.mockResolvedValueOnce({
      success: false,
      identityId: 'identity-new',
      identityReplacement: {
        reason: 'identity_replacement_required',
        oldIdentityId: 'identity-old',
        newIdentityId: 'identity-new',
        walletAddress: 'identity-unknown',
        safetyNumber,
        displayName: 'alice',
        walletAuthorized: true,
      },
    } as any)
    const view = render(<ContactDetailScreen />)
    await act(async () => {})

    await fireEvent.changeText(screen.getByTestId('input-Contact Name'), 'alice')
    await fireEvent.press(findPressableByText(view.root, 'Add to Contacts'))

    expect(screen.getByText('Chat identity changed')).toBeTruthy()
    expect(screen.getByText('Wallet authorization verified')).toBeTruthy()
    expect(screen.getByText('12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345')).toBeTruthy()
    expect(mockState.router.replace).not.toHaveBeenCalled()

    await fireEvent.press(findPressableByText(view.root, 'Replace after verification'))

    expect(mockState.services.acceptContactIdentityReplacement).toHaveBeenCalledWith(
      expect.objectContaining({
        oldIdentityId: 'identity-old',
        newIdentityId: 'identity-new',
        walletAddress: 'identity-unknown',
      }),
      'alice',
    )
    expect(mockState.router.replace).toHaveBeenCalledWith(
      '/(main)/chat/identity-new?local=EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    )
  })

})

