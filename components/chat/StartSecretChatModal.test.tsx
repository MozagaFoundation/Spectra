/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  auth: { exoAddress: 'EXO00owner000000000000000000000000000000000' },
  chat: { contacts: [] as Array<any> },
  flashList: {
    dataLength: 0,
    scrollToOffset: vi.fn(),
  },
  haptics: { notificationAsync: vi.fn() },
  router: { push: vi.fn() },
  services: {
    acceptContactIdentityReplacement: vi.fn(async () => ({ identityId: 'identity-new', success: true })),
    addContactByAddress: vi.fn(async () => ({ identityId: 'identity-new', success: true })),
    addContactByInvite: vi.fn(async () => ({ identityId: 'identity-new', success: true })),
  },
  walletState: {
    wallet: { address: 'EXO00owner000000000000000000000000000000000', displayName: 'Root' },
    wallets: [{ address: 'EXO00owner000000000000000000000000000000000', displayName: 'Root' }],
  },
}))

vi.mock('react-native', async () => await import('../../test/react-native'))

vi.mock('@shopify/flash-list', async () => {
  const ReactActual = await import('react')
  const { View } = await import('../../test/react-native')
  return {
    FlashList: ReactActual.forwardRef(({
      data = [],
      keyExtractor,
      ListEmptyComponent,
      ListHeaderComponent,
      renderItem,
      ...props
    }: {
      data?: Array<any>
      keyExtractor?: (item: any, index: number) => string
      ListEmptyComponent?: React.ComponentType | React.ReactElement | null
      ListHeaderComponent?: React.ComponentType | React.ReactElement | null
      renderItem?: (params: { item: any; index: number }) => React.ReactNode
      [key: string]: any
    }, ref) => {
      mockState.flashList.dataLength = data.length
      ReactActual.useImperativeHandle(ref, () => ({
        scrollToOffset: mockState.flashList.scrollToOffset,
      }))
      return ReactActual.createElement(
        View,
        { ...props, testID: 'contact-picker-list' },
        ReactActual.isValidElement(ListHeaderComponent)
          ? ListHeaderComponent
          : ListHeaderComponent
            ? ReactActual.createElement(ListHeaderComponent)
            : null,
        data.length === 0
          ? ReactActual.isValidElement(ListEmptyComponent)
            ? ListEmptyComponent
            : ListEmptyComponent
              ? ReactActual.createElement(ListEmptyComponent)
              : null
          : null,
        data.slice(0, 12).map((item: any, index: number) => ReactActual.createElement(
          View,
          { key: keyExtractor?.(item, index) ?? String(index) },
          renderItem?.({ item, index }),
        )),
      )
    }),
  }
})

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { resolvedLanguage: 'en' }, t: (key: string) => key }),
}))

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../test/mainAppMocks')
  return {
    AlertCircle: TestIcon,
    CheckCircle: TestIcon,
    MessageSquarePlus: TestIcon,
    QrCode: TestIcon,
    Search: TestIcon,
    UserPlus: TestIcon,
    X: TestIcon,
  }
})

vi.mock('@/components/common', async () => {
  const { TestAvatar } = await import('../../test/mainAppMocks')
  return { Avatar: TestAvatar }
})

vi.mock('@/components/ui', async () => {
  const { TestButton } = await import('../../test/mainAppMocks')
  return { Button: TestButton }
})

vi.mock('@/components/chat/ShareContactBanner', () => ({
  ShareContactBanner: () => null,
}))

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
}))

vi.mock('@/lib/i18n', async () => {
  const { translateForTest } = await import('../../test/mainAppMocks')
  return { translate: translateForTest }
})

vi.mock('@/lib/accountScope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/accountScope')>()
  return {
    ...actual,
    matchesAccountStorageScope: (a?: string, b?: string) => (a || b) ? a?.toLowerCase() === b?.toLowerCase() : true,
  }
})

vi.mock('@/lib/contactsScreen', () => ({
  sortContactsAlphabetically: (contacts: Array<any>) => contacts,
}))

vi.mock('@/lib/safeHaptics', () => ({
  Haptics: { NotificationFeedbackType: { Error: 'error', Success: 'success' } },
  notificationAsync: mockState.haptics.notificationAsync,
}))

vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../test/mainAppMocks')
  return { useThemeColors: () => testColors }
})

vi.mock('@/lib/utils', () => ({
  debounce: (fn: (...args: Array<any>) => unknown) => fn,
  formatAddress: (value: string) => value,
  isValidEXOAddress: (value: string) => /^EXO00[0-9a-f]{38}$/i.test(value),
}))

vi.mock('@/services/chat', () => mockState.services)

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof mockState.auth) => unknown) => selector(mockState.auth),
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: (selector: (state: typeof mockState.chat) => unknown) => selector(mockState.chat),
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: typeof mockState.walletState) => unknown) => selector(mockState.walletState),
}))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { StartSecretChatModal } = await import('./StartSecretChatModal')

const validAddress = `EXO00${'c'.repeat(38)}`
const contactInvite = 'spectra:contact:v1:identity-new:smbx1.abcdefghijklmnop'
const contactCardInvite = `spectra:contact-card:v1:scc1.${'a'.repeat(32)}:sccap1.${'A'.repeat(43)}`
const safetyNumber = {
  numeric: '123451234512345123451234512345123451234512345123451234512345',
  qrData: 'spectra:safety:v1:test',
  fingerprint: '1234 5678',
  fullHash: 'a'.repeat(64),
}

function findTextInputByPlaceholder(root: any, placeholder: string) {
  return root.findAll((node: any) => node.type === 'TextInput' && node.props.placeholder === placeholder)[0]
}

describe('StartSecretChatModal identity replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.chat.contacts = []
    mockState.flashList.dataLength = 0
    mockState.services.addContactByAddress.mockResolvedValue({ identityId: 'identity-new', success: true })
    mockState.services.addContactByInvite.mockResolvedValue({ identityId: 'identity-new', success: true })
    mockState.services.acceptContactIdentityReplacement.mockResolvedValue({ identityId: 'identity-new', success: true })
  })

  it('requires explicit verification before replacing a saved wallet contact and opening chat', async () => {
    mockState.chat.contacts = [{
      identityId: 'identity-old',
      isHidden: false,
      isSaved: true,
      localWalletAddress: 'EXO00owner000000000000000000000000000000000',
      walletAddress: validAddress,
    }]
    mockState.services.addContactByInvite.mockResolvedValueOnce({
      success: false,
      identityId: 'identity-new',
      identityReplacement: {
        reason: 'identity_replacement_required',
        oldIdentityId: 'identity-old',
        newIdentityId: 'identity-new',
        walletAddress: validAddress,
        safetyNumber,
        displayName: 'alice',
        walletAuthorized: true,
      },
    } as any)
    const view = render(<StartSecretChatModal visible onClose={vi.fn()} />)

    await fireEvent.changeText(
      findTextInputByPlaceholder(view.root, 'EXO00...'),
      contactInvite,
    )
    await act(async () => {})
    await fireEvent.press(screen.getByTestId('button-Start Chat'))

    expect(screen.getByText('Chat identity changed')).toBeTruthy()
    expect(screen.getByText('Wallet authorization verified')).toBeTruthy()
    expect(screen.getByText('12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345')).toBeTruthy()
    expect(mockState.router.push).not.toHaveBeenCalled()
    expect(mockState.services.addContactByInvite).toHaveBeenCalledWith({
      kind: 'direct',
      identityId: 'identity-new',
      mailboxCapability: 'smbx1.abcdefghijklmnop',
    })

    await fireEvent.press(screen.getByTestId('button-Replace after verification'))

    expect(mockState.services.acceptContactIdentityReplacement).toHaveBeenCalledWith(
      expect.objectContaining({
        oldIdentityId: 'identity-old',
        newIdentityId: 'identity-new',
        walletAddress: validAddress,
      }),
    )
    expect(mockState.router.push).toHaveBeenCalledWith(
      '/(main)/chat/identity-new?local=EXO00owner000000000000000000000000000000000',
    )
  })

  it('starts a chat with an opted-in Post-Quantum Address', async () => {
    const view = render(<StartSecretChatModal visible onClose={vi.fn()} />)

    await fireEvent.changeText(
      findTextInputByPlaceholder(view.root, 'EXO00...'),
      validAddress,
    )
    await act(async () => {})
    await fireEvent.press(screen.getByTestId('button-Add by Post-Quantum Address'))

    expect(mockState.services.addContactByAddress).toHaveBeenCalledWith(validAddress)
    expect(mockState.services.addContactByInvite).not.toHaveBeenCalled()
    expect(mockState.router.push).toHaveBeenCalledWith(
      `/(main)/chat/identity-new?local=EXO00owner000000000000000000000000000000000`,
    )
  })

  it('opens an existing Post-Quantum Address contact without directory lookup', async () => {
    mockState.chat.contacts = [{
      identityId: 'identity-saved',
      isHidden: false,
      isSaved: true,
      localWalletAddress: 'EXO00owner000000000000000000000000000000000',
      walletAddress: validAddress,
    }]
    const view = render(<StartSecretChatModal visible onClose={vi.fn()} />)

    await fireEvent.changeText(
      findTextInputByPlaceholder(view.root, 'EXO00...'),
      validAddress,
    )
    await act(async () => {})
    await fireEvent.press(screen.getByTestId('button-Add by Post-Quantum Address'))

    expect(mockState.services.addContactByAddress).not.toHaveBeenCalled()
    expect(mockState.router.push).toHaveBeenCalledWith(
      `/(main)/chat/${validAddress}?local=EXO00owner000000000000000000000000000000000`,
    )
  })

  it('starts a chat after saving a one-time contact card', async () => {
    const view = render(<StartSecretChatModal visible onClose={vi.fn()} />)

    await fireEvent.changeText(
      findTextInputByPlaceholder(view.root, 'EXO00...'),
      contactCardInvite,
    )
    await act(async () => {})
    await fireEvent.press(screen.getByTestId('button-Start Chat'))

    expect(mockState.services.addContactByInvite).toHaveBeenCalledWith({
      kind: 'contact_card',
      cardId: `scc1.${'a'.repeat(32)}`,
      cardCapability: `sccap1.${'A'.repeat(43)}`,
    })
    expect(mockState.router.push).toHaveBeenCalledWith(
      '/(main)/chat/identity-new?local=EXO00owner000000000000000000000000000000000',
    )
    expect(() => screen.getByText('Failed to add contact')).toThrow()
  })

  it('keeps every start-chat action visible inside a bounded list viewport', () => {
    render(<StartSecretChatModal visible onClose={vi.fn()} />)

    expect(screen.getByText('Add by Post-Quantum Address')).toBeTruthy()
    expect(screen.getByText('Scan QR Code')).toBeTruthy()
    expect(screen.getByText('Select from contacts')).toBeTruthy()
    expect(screen.getByText('No saved contacts yet')).toBeTruthy()
    expect(screen.getByTestId('start-secret-chat-sheet').props.style).toEqual(expect.objectContaining({
      height: '88%',
    }))
    expect(screen.getByTestId('contact-picker-list').props.style).toEqual({
      flex: 1,
      minHeight: 0,
    })
  })

  it('opens a selected contact in its saved local wallet scope', async () => {
    mockState.chat.contacts = [{
      displayName: 'Scoped contact',
      identityId: 'identity-scoped',
      isHidden: false,
      isOnline: false,
      isSaved: true,
      localWalletAddress: 'EXO00local000000000000000000000000000000000',
      walletAddress: validAddress,
    }]
    render(<StartSecretChatModal visible onClose={vi.fn()} />)

    await fireEvent.press(screen.getByTestId('contact-picker-row'))

    expect(mockState.router.push).toHaveBeenCalledWith(
      `/(main)/chat/${validAddress}?local=EXO00local000000000000000000000000000000000`,
    )
  })

  it('lets people switch from EXO lookup to a secure invitation', async () => {
    const view = render(<StartSecretChatModal visible onClose={vi.fn()} />)

    expect(findTextInputByPlaceholder(view.root, 'EXO00...')).toBeTruthy()

    await fireEvent.press(screen.getByTestId('start-chat-lookup-invitation'))
    expect(findTextInputByPlaceholder(view.root, 'spectra:contact:v1:...')).toBeTruthy()
  })

  it('virtualizes large contact sets and mounts no rows while closed', () => {
    mockState.chat.contacts = Array.from({ length: 1_000 }, (_, index) => ({
      displayName: `Contact ${index}`,
      identityId: `identity-${index}`,
      isHidden: false,
      isOnline: false,
      isSaved: true,
      localWalletAddress: 'EXO00owner000000000000000000000000000000000',
      walletAddress: `EXO00${index.toString(16).padStart(38, '0')}`,
    }))

    const open = render(<StartSecretChatModal visible onClose={vi.fn()} />)
    const mountedRows = open.root.findAll((node) => node.props.testID === 'contact-picker-row')

    expect(mockState.flashList.dataLength).toBe(1_000)
    expect(mountedRows.length).toBeGreaterThan(0)
    expect(mountedRows.length).toBeLessThanOrEqual(12)
    expect(screen.getByText('Add by Post-Quantum Address')).toBeTruthy()
    expect(screen.getByText('Scan QR Code')).toBeTruthy()
    open.unmount()

    const closed = render(<StartSecretChatModal visible={false} onClose={vi.fn()} />)

    expect(mockState.flashList.dataLength).toBe(0)
    expect(closed.root.findAll((node) => node.props.testID === 'contact-picker-row')).toHaveLength(0)
  })
})
