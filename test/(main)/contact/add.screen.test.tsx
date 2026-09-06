/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  validAddress: `EXO00${'c'.repeat(38)}`,
  auth: { exoAddress: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', isAuthenticated: true },
  chat: { contacts: [] as Array<any> },
  haptics: { notificationAsync: vi.fn(async () => {}) },
  params: {} as { local?: string; scannedInvite?: string },
  pendingShare: null as string | null,
  router: { back: vi.fn(), dismissAll: vi.fn(), push: vi.fn(), replace: vi.fn() },
  services: {
    acceptContactIdentityReplacement: vi.fn(async () => ({ identityId: 'identity-new', success: true })),
    activateChatPersonaByAddress: vi.fn(async () => {}),
    addContactByAddress: vi.fn(async () => ({ identityId: 'identity-new', success: true })),
    addContactByInvite: vi.fn(async () => ({ identityId: 'identity-new', success: true })),
  },
  walletState: {
    wallet: { address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', displayName: 'Root' },
    wallets: [
      { address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', displayName: 'Root' },
      { address: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', displayName: 'Work' },
    ],
    isVaultUnlocked: true,
  },
}))

const validAddress = mockState.validAddress
const contactInvite = 'spectra:contact:v1:identity-new:smbx1.abcdefghijklmnop'
const contactCardInvite = `spectra:contact-card:v1:scc1.${'a'.repeat(32)}:sccap1.${'A'.repeat(43)}`
const safetyNumber = {
  numeric: '123451234512345123451234512345123451234512345123451234512345',
  qrData: 'spectra:safety:v1:test',
  fingerprint: '1234 5678',
  fullHash: 'a'.repeat(64),
}

vi.mock('react-native', async () => await import('../../../test/react-native'))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
}))

vi.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Error: 'error', Success: 'success', Warning: 'warning' },
  notificationAsync: mockState.haptics.notificationAsync,
}))

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainAppMocks')
  return {
    AlertCircle: TestIcon,
    CheckCircle: TestIcon,
    ChevronRight: TestIcon,
    QrCode: TestIcon,
    Share: TestIcon,
    UserPlus: TestIcon,
    X: TestIcon,
  }
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
  return { translate: translateForTest }
})

vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../../test/mainAppMocks')
  return { useThemeColors: () => testColors }
})

vi.mock('@/lib/accountScope', () => ({
  isSameAccountStorageScope: (a?: string, b?: string) => a?.toLowerCase() === b?.toLowerCase(),
  matchesAccountStorageScope: (a?: string, b?: string) => (a || b) ? a?.toLowerCase() === b?.toLowerCase() : true,
}))

vi.mock('@/lib/pendingContactShare', () => ({
  consumePendingContactShareAddress: () => {
    const next = mockState.pendingShare
    mockState.pendingShare = null
    return next
  },
}))

vi.mock('@/lib/utils', () => ({
  debounce: (fn: (...args: Array<any>) => unknown) => fn,
  formatAddress: (value: string) => value,
  isValidEXOAddress: (value: string) => /^EXO00[0-9a-f]{38}$/i.test(value),
}))

vi.mock('@/services/chat', () => mockState.services)

vi.mock('@/store', () => ({
  useAuthStore: () => mockState.auth,
  useChatStore: () => mockState.chat,
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: typeof mockState.walletState) => unknown) => selector(mockState.walletState),
}))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: AddContactScreen } = await import('../../../app/(main)/contact/add')

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

function findPressableByText(root: any, text: string) {
  return root.findAll((node: any) => node.type === 'Pressable' && nodeText(node).includes(text))[0]
}

describe('AddContactScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.chat.contacts = []
    mockState.params = {}
    mockState.pendingShare = null
    mockState.walletState.wallet = mockState.walletState.wallets[0]
    mockState.walletState.isVaultUnlocked = true
    mockState.auth.isAuthenticated = true
  })

  it('prefills a scanned invitation, switches to the requested local wallet, and saves contact', async () => {
    mockState.params = {
      local: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      scannedInvite: contactInvite,
    }
    const view = render(<AddContactScreen />)
    await act(async () => {})

    expect(mockState.services.activateChatPersonaByAddress).toHaveBeenCalledWith(
      'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    )
    await fireEvent.press(findPressableByText(view.root, 'Add Contact'))

    expect(mockState.services.addContactByInvite).toHaveBeenCalledWith({
      kind: 'direct',
      identityId: 'identity-new',
      mailboxCapability: 'smbx1.abcdefghijklmnop',
    }, undefined)
    expect(mockState.router.dismissAll).toHaveBeenCalled()
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/contacts')
  })

  it('blocks duplicate contacts in the same account scope', async () => {
    mockState.chat.contacts = [{
      isHidden: false,
      isSaved: true,
      localWalletAddress: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      publicKeyBundle: { identityId: 'identity-new' },
      walletAddress: validAddress,
    }]
    const view = render(<AddContactScreen />)

    await fireEvent.changeText(screen.getByTestId('input-EXO Account'), contactInvite)
    await act(async () => {})
    await fireEvent.press(findPressableByText(view.root, 'Add Contact'))

    expect(mockState.services.addContactByInvite).not.toHaveBeenCalled()
    expect(screen.getAllByText('This contact is already added').length).toBeGreaterThan(0)
  })

  it('recognizes a one-time contact card as a valid invitation', async () => {
    const view = render(<AddContactScreen />)

    await fireEvent.press(screen.getByTestId('contact-lookup-invitation'))
    await fireEvent.changeText(
      screen.getByTestId('input-Secure Contact Invitation'),
      contactCardInvite,
    )
    await act(async () => {})

    expect(screen.getByText('Secure invitation ready')).toBeTruthy()
    expect(() => screen.getByText('Paste a valid secure contact invitation.')).toThrow()

    await fireEvent.press(findPressableByText(view.root, 'Add Contact'))

    expect(mockState.services.addContactByInvite).toHaveBeenCalledWith({
      kind: 'contact_card',
      cardId: `scc1.${'a'.repeat(32)}`,
      cardCapability: `sccap1.${'A'.repeat(43)}`,
    }, undefined)
  })

  it('adds an opted-in contact by Post-Quantum Address', async () => {
    const view = render(<AddContactScreen />)

    await fireEvent.changeText(screen.getByTestId('input-EXO Account'), validAddress)
    await act(async () => {})
    await fireEvent.press(findPressableByText(view.root, 'Add by Post-Quantum Address'))

    expect(mockState.services.addContactByAddress).toHaveBeenCalledWith(validAddress, undefined)
    expect(mockState.services.addContactByInvite).not.toHaveBeenCalled()
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/contacts')
  })

  it('routes a stale Post-Quantum Address contact through explicit replacement', async () => {
    mockState.chat.contacts = [{
      identityId: 'identity-old',
      isHidden: false,
      isSaved: true,
      localWalletAddress: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      publicKeyBundle: { identityId: 'identity-old' },
      walletAddress: validAddress,
    }]
    mockState.services.addContactByAddress.mockResolvedValueOnce({
      success: false,
      identityId: 'identity-new',
      identityReplacement: {
        reason: 'identity_replacement_required',
        oldIdentityId: 'identity-old',
        newIdentityId: 'identity-new',
        walletAddress: validAddress,
        safetyNumber,
        walletAuthorized: true,
      },
    } as any)
    const view = render(<AddContactScreen />)

    await fireEvent.changeText(screen.getByTestId('input-EXO Account'), validAddress)
    await act(async () => {})
    await fireEvent.press(findPressableByText(view.root, 'Add by Post-Quantum Address'))

    expect(mockState.services.addContactByAddress).toHaveBeenCalledWith(validAddress, undefined)
    expect(screen.getByText('12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345')).toBeTruthy()
    expect(() => screen.getByText('This contact is already added')).toThrow()
  })

  it('shows an explicit verification flow for wallet-authorized identity replacement', async () => {
    mockState.chat.contacts = [{
      identityId: 'identity-old',
      isHidden: false,
      isSaved: true,
      localWalletAddress: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      publicKeyBundle: { identityId: 'identity-old' },
      walletAddress: validAddress,
    }]
    mockState.services.addContactByInvite.mockResolvedValueOnce({
      success: false,
      error: 'This wallet now advertises a new chat identity. Verify the safety number before trusting or migrating it.',
      identityId: 'identity-new',
      identityReplacement: {
        reason: 'identity_replacement_required',
        oldIdentityId: 'identity-old',
        newIdentityId: 'identity-new',
        walletAddress: validAddress,
        safetyNumber,
        displayName: 'JP2',
        walletAuthorized: true,
      },
    } as any)
    const view = render(<AddContactScreen />)

    await fireEvent.changeText(screen.getByTestId('input-EXO Account'), contactInvite)
    await act(async () => {})
    await fireEvent.press(findPressableByText(view.root, 'Add Contact'))

    expect(screen.getByText('Chat identity changed')).toBeTruthy()
    expect(screen.getByText('Wallet authorization verified')).toBeTruthy()
    expect(screen.getByText('12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345')).toBeTruthy()
    expect(mockState.router.replace).not.toHaveBeenCalled()

    await fireEvent.press(findPressableByText(view.root, 'Replace after verification'))

    expect(mockState.services.acceptContactIdentityReplacement).toHaveBeenCalledWith(
      expect.objectContaining({
        oldIdentityId: 'identity-old',
        newIdentityId: 'identity-new',
        walletAddress: validAddress,
      }),
      'JP2',
    )
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/contacts')
  })

  it('prefills a pending share address when the unlock screen consumed the route params', async () => {
    mockState.pendingShare = validAddress
    render(<AddContactScreen />)
    await act(async () => {})

    expect(screen.getByTestId('input-EXO Account').props.value).toBe(validAddress)
  })

  it('does not consume a pending share while the vault is locked', async () => {
    mockState.walletState.isVaultUnlocked = false
    mockState.pendingShare = validAddress
    render(<AddContactScreen />)
    await act(async () => {})

    expect(screen.getByTestId('input-EXO Account').props.value).toBe('')
    expect(mockState.pendingShare).toBe(validAddress)
  })

  it('makes EXO lookup explicit and links to invitation sharing', async () => {
    render(<AddContactScreen />)

    expect(screen.getByTestId('input-EXO Account')).toBeTruthy()

    await fireEvent.press(screen.getByTestId('contact-lookup-invitation'))
    expect(screen.getByTestId('input-Secure Contact Invitation')).toBeTruthy()

    await fireEvent.press(screen.getByTestId('share-contact-invitation'))
    expect(mockState.router.push).toHaveBeenCalledWith('/(main)/profile/qr-code')
  })
})

