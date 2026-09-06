/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  activeWallet: { address: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
  auth: { exoAddress: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
  cameraPermission: { canAskAgain: true, granted: true } as {
    canAskAgain: boolean
    granted: boolean
  },
  chat: { contacts: [] as Array<any> },
  haptics: { notificationAsync: vi.fn(async () => {}) },
  openSettings: vi.fn(async () => {}),
  params: {} as { intent?: 'add-contact' | 'start-chat'; local?: string },
  requestPermission: vi.fn(async () => ({ canAskAgain: true, granted: true })),
  router: { back: vi.fn(), replace: vi.fn() },
  scanData: '',
  services: {
    acceptContactIdentityReplacement: vi.fn(async () => ({ identityId: 'identity-new', success: true })),
    activateChatPersonaByAddress: vi.fn(async () => {}),
    addContactByInvite: vi.fn(async () => ({ identityId: 'identity-new', success: true })),
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../../test/react-native')
  return {
    ...rn,
    Alert: { alert: vi.fn() },
    Linking: {
      ...rn.Linking,
      openSettings: mockState.openSettings,
    },
  }
})

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
}))

vi.mock('expo-camera', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text } = await import('../../../test/react-native')
  return {
    CameraView: ({ onBarcodeScanned }: { onBarcodeScanned?: (event: { data: string }) => void }) => (
      ReactActual.createElement(
        Pressable,
        { onPress: () => onBarcodeScanned?.({ data: mockState.scanData }), testID: 'camera-view' },
        ReactActual.createElement(Text, null, 'CameraView'),
      )
    ),
    useCameraPermissions: () => [mockState.cameraPermission, mockState.requestPermission],
  }
})

vi.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Error: 'error', Success: 'success' },
  notificationAsync: mockState.haptics.notificationAsync,
}))

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainAppMocks')
  return { Flashlight: TestIcon, FlashlightOff: TestIcon, X: TestIcon }
})

vi.mock('@/components/ui', async () => {
  const { TestButton } = await import('../../../test/mainAppMocks')
  return { Button: TestButton }
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

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof mockState.auth) => unknown) => selector(mockState.auth),
}))

vi.mock('@/store/chatStore', () => {
  const useChatStore = Object.assign(
    (selector: (state: typeof mockState.chat) => unknown) => selector(mockState.chat),
    { getState: () => mockState.chat },
  )
  return { useChatStore }
})

vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: { wallet: typeof mockState.activeWallet }) => unknown) => selector({ wallet: mockState.activeWallet }),
}))

vi.mock('@/services/chat', () => mockState.services)

const { Alert } = await import('react-native')
const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: ScanQRScreen } = await import('../../../app/(main)/contact/scan-qr')

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((finish, fail) => {
    resolve = finish
    reject = fail
  })
  return { promise, resolve, reject }
}

const validAddress = `EXO00${'a'.repeat(38)}`
const contactInvite = 'spectra:contact:v1:identity-new:smbx1.abcdefghijklmnop'
const contactCardInvite = `spectra:contact-card:v1:scc1.${'a'.repeat(32)}:sccap1.${'A'.repeat(43)}`
const safetyNumber = {
  numeric: '123451234512345123451234512345123451234512345123451234512345',
  qrData: 'spectra:safety:v1:test',
  fingerprint: '1234 5678',
  fullHash: 'a'.repeat(64),
}

describe('ScanQRScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.cameraPermission = { canAskAgain: true, granted: true }
    mockState.chat.contacts = []
    mockState.params = {}
    mockState.scanData = contactInvite
    mockState.services.addContactByInvite.mockResolvedValue({ identityId: 'identity-new', success: true })
    mockState.services.acceptContactIdentityReplacement.mockResolvedValue({ identityId: 'identity-new', success: true })
  })

  it('routes invitation scans into the add-contact flow with local scope', async () => {
    mockState.params = { local: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
    render(<ScanQRScreen />)

    await fireEvent.press(screen.getByTestId('camera-view'))

    expect(mockState.router.replace).toHaveBeenCalledWith({
      pathname: '/(main)/contact/add',
      params: {
        local: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        scannedInvite: contactInvite,
      },
    })
  })

  it('uses existing scoped contacts for start-chat scans without auto-adding', async () => {
    mockState.params = { intent: 'start-chat', local: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
    mockState.chat.contacts = [{
      identityId: 'identity-new',
      isHidden: false,
      isSaved: true,
      localWalletAddress: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      walletAddress: validAddress,
    }]
    render(<ScanQRScreen />)

    await fireEvent.press(screen.getByTestId('camera-view'))

    expect(mockState.services.addContactByInvite).not.toHaveBeenCalled()
    expect(mockState.router.replace).toHaveBeenCalledWith(
      `/(main)/chat/${validAddress}?local=EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`,
    )
  })

  it('starts a chat after adding a scanned one-time contact card', async () => {
    mockState.params = { intent: 'start-chat', local: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
    mockState.scanData = contactCardInvite
    render(<ScanQRScreen />)

    await fireEvent.press(screen.getByTestId('camera-view'))

    expect(mockState.services.addContactByInvite).toHaveBeenCalledWith({
      kind: 'contact_card',
      cardId: `scc1.${'a'.repeat(32)}`,
      cardCapability: `sccap1.${'A'.repeat(43)}`,
    })
    expect(mockState.router.replace).toHaveBeenCalledWith(
      '/(main)/chat/identity-new?local=EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    )
  })

  it('requires explicit verification before replacing identity on start-chat scans', async () => {
    mockState.params = { intent: 'start-chat', local: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
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
    render(<ScanQRScreen />)

    await fireEvent.press(screen.getByTestId('camera-view'))

    expect(Alert.alert).toHaveBeenCalledWith(
      'Chat identity changed',
      expect.stringContaining('12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345 12345'),
      expect.any(Array),
    )
    expect(mockState.router.replace).not.toHaveBeenCalled()

    const buttons = vi.mocked(Alert.alert).mock.calls[0][2] as Array<{ text: string; onPress?: () => void | Promise<void> }>
    await act(async () => {
      await buttons[1].onPress?.()
    })

    expect(mockState.services.acceptContactIdentityReplacement).toHaveBeenCalledWith(
      expect.objectContaining({
        oldIdentityId: 'identity-old',
        newIdentityId: 'identity-new',
        walletAddress: validAddress,
      }),
    )
    expect(mockState.router.replace).toHaveBeenCalledWith(
      '/(main)/chat/identity-new?local=EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    )
  })

  it('reuses an unsaved existing contact for start-chat scans', async () => {
    mockState.params = { intent: 'start-chat', local: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
    mockState.chat.contacts = [{
      identityId: 'identity-new',
      isHidden: false,
      isSaved: false,
      localWalletAddress: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      walletAddress: validAddress,
    }]
    render(<ScanQRScreen />)

    await fireEvent.press(screen.getByTestId('camera-view'))

    expect(mockState.services.addContactByInvite).not.toHaveBeenCalled()
    expect(Alert.alert).not.toHaveBeenCalled()
    expect(mockState.router.replace).toHaveBeenCalledWith(
      `/(main)/chat/${validAddress}?local=EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`,
    )
  })

  it('opens an existing local chat when adding the scanned invite fails', async () => {
    mockState.params = { intent: 'start-chat', local: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
    mockState.services.addContactByInvite.mockImplementationOnce(async () => {
      mockState.chat.contacts = [{
        identityId: 'identity-new',
        isHidden: false,
        isSaved: false,
        localWalletAddress: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        walletAddress: validAddress,
      }]
      return { success: false, error: 'Contact key refresh timed out' }
    })
    render(<ScanQRScreen />)

    await fireEvent.press(screen.getByTestId('camera-view'))

    expect(Alert.alert).not.toHaveBeenCalled()
    expect(mockState.router.replace).toHaveBeenCalledWith(
      `/(main)/chat/${validAddress}?local=EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`,
    )
  })

  it('does not alert after leaving the scanner while start-chat add is in flight', async () => {
    mockState.params = { intent: 'start-chat', local: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
    const pendingAdd = createDeferred<{ identityId: string; success: boolean }>()
    mockState.services.addContactByInvite.mockReturnValueOnce(pendingAdd.promise)
    const view = render(<ScanQRScreen />)
    const camera = screen.getByTestId('camera-view')
    await act(() => {
      void camera.props.onPress?.({ nativeEvent: {} })
    })
    view.unmount()

    await act(async () => {
      pendingAdd.reject(new Error('Contact key refresh timed out'))
    })

    expect(Alert.alert).not.toHaveBeenCalled()
    expect(mockState.router.replace).not.toHaveBeenCalled()
  })

  it('still reports a start-chat failure when no local conversation exists', async () => {
    mockState.params = { intent: 'start-chat', local: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
    mockState.scanData = contactCardInvite
    mockState.services.addContactByInvite.mockResolvedValueOnce({
      success: false,
      error: 'This one-time contact card is unavailable or already used',
    })
    render(<ScanQRScreen />)

    await fireEvent.press(screen.getByTestId('camera-view'))

    expect(Alert.alert).toHaveBeenCalledWith(
      'Unable to start chat',
      expect.any(String),
    )
    expect(mockState.router.replace).not.toHaveBeenCalled()
  })

  it('asks for camera permission with Continue and no way to delay the system prompt', async () => {
    mockState.cameraPermission = { canAskAgain: true, granted: false }
    render(<ScanQRScreen />)

    expect(screen.getByText('Camera permission is required to scan QR codes')).toBeTruthy()
    expect(screen.queryByTestId('button-Go Back')).toBeNull()
    expect(screen.queryByTestId('button-Grant Permission')).toBeNull()
    expect(screen.queryByTestId('camera-view')).toBeNull()

    await fireEvent.press(screen.getByTestId('button-Continue'))

    expect(mockState.requestPermission).toHaveBeenCalledTimes(1)
    expect(mockState.router.back).not.toHaveBeenCalled()
    expect(mockState.openSettings).not.toHaveBeenCalled()
  })

  it('opens Settings after camera permission is denied and cannot be asked again', async () => {
    mockState.cameraPermission = { canAskAgain: false, granted: false }
    render(<ScanQRScreen />)

    expect(screen.getByText('Camera access is required to scan QR codes. Enable it in Settings.')).toBeTruthy()
    expect(screen.queryByTestId('button-Continue')).toBeNull()
    expect(screen.queryByTestId('button-Grant Permission')).toBeNull()
    expect(screen.queryByTestId('camera-view')).toBeNull()

    await fireEvent.press(screen.getByTestId('button-Open Settings'))

    expect(mockState.openSettings).toHaveBeenCalledTimes(1)
    expect(mockState.requestPermission).not.toHaveBeenCalled()
  })
})

