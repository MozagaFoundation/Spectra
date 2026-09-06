/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => {
  const createdWallet = {
    address: 'exo1created',
    publicKey: 'created-public-key',
  }
  const transparentWallet = {
    address: 'exo1transparent',
    publicKey: 'transparent-public-key',
    transparentMode: true,
  }
  const spectreWallet = {
    address: 'exo1spectre',
    publicKey: 'spectre-public-key',
    spectreMode: true,
  }
  const bundledWallets = [createdWallet, transparentWallet, spectreWallet]

  return {
    createdWallet,
    bundledWallets,
    nextPin: '123456',
    router: {
      back: vi.fn(),
      replace: vi.fn(),
    },
    haptics: {
      notificationAsync: vi.fn(async () => {}),
    },
    localAuthentication: {
      hasHardwareAsync: vi.fn(async () => false),
      isEnrolledAsync: vi.fn(async () => false),
    },
    pendingWallet: null as {
      mnemonic: string
      source: 'create' | 'import'
      wallet: typeof createdWallet
      wallets?: typeof bundledWallets
      contactProfileName?: string | null
    } | null,
    onboarding: {
      clearPendingWallet: vi.fn(),
      deferContactProfileName: vi.fn(),
    },
    walletStore: {
      _sessionDerivedKey: new Uint8Array([7, 8, 9]) as Uint8Array | null,
      createWallet: vi.fn(async () => {}),
    },
    authStore: {
      setAuthenticated: vi.fn(),
    },
    deriveDeterministicEXOWalletBundle: vi.fn(async () => ({
      rootWallet: createdWallet,
      transparentWallets: [transparentWallet],
      spectreWallet,
    })),
    biometrics: {
      clearBiometricUnlock: vi.fn(async () => {}),
      storeBiometricUnlockKey: vi.fn(async () => {}),
    },
  }
})

vi.mock('react-native', async () => await import('../../test/react-native'))

vi.mock('react-native-keyboard-controller', async () => {
  const { View } = await import('../../test/react-native')
  return { KeyboardAvoidingView: View }
})

vi.mock('expo-router', () => ({
  useRouter: () => mockState.router,
}))

vi.mock('lucide-react-native', () => ({
  CheckCircle: () => null,
  ChevronLeft: () => null,
  Fingerprint: () => null,
  Key: () => null,
  Lock: () => null,
  Shield: () => null,
}))

vi.mock('@/components/common/SpectraLogoMark', () => ({
  SpectraLogoMark: () => null,
}))

vi.mock('expo-haptics', () => ({
  NotificationFeedbackType: {
    Success: 'success',
    Error: 'error',
  },
  notificationAsync: mockState.haptics.notificationAsync,
}))

vi.mock('expo-local-authentication', () => mockState.localAuthentication)

vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('../../test/react-native')
  return { SafeAreaView: View }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/components/ui', async () => {
  const ReactActual = await import('react')
  return {
    Button: ({
      children,
      disabled,
      onPress,
    }: {
      children: React.ReactNode
      disabled?: boolean
      onPress?: () => void | Promise<void>
    }) => ReactActual.createElement(
      'Pressable',
      { disabled, onPress, testID: `button-${String(children)}` },
      ReactActual.createElement('Text', null, children),
    ),
  }
})

vi.mock('@/components/wallet', async () => {
  const ReactActual = await import('react')
  return {
    PinInput: ({
      error,
      label,
      onComplete,
    }: {
      error?: string
      label?: string
      onComplete: (pin: string) => void | Promise<void>
    }) => ReactActual.createElement(
      'Pressable',
      { onPress: () => onComplete(mockState.nextPin), testID: `pin-${label ?? 'default'}` },
      ReactActual.createElement('Text', null, error ?? label ?? 'PIN'),
    ),
  }
})

vi.mock('@/store', () => {
  const useWalletStore = (selector: (state: typeof mockState.walletStore) => unknown) => (
    selector(mockState.walletStore)
  )
  useWalletStore.getState = () => mockState.walletStore

  const useAuthStore = (selector: (state: typeof mockState.authStore) => unknown) => (
    selector(mockState.authStore)
  )

  const useOnboardingStore = (selector: (state: {
    pendingWallet: typeof mockState.pendingWallet
    clearPendingWallet: typeof mockState.onboarding.clearPendingWallet
    deferContactProfileName: typeof mockState.onboarding.deferContactProfileName
  }) => unknown) => selector({
    pendingWallet: mockState.pendingWallet,
    clearPendingWallet: mockState.onboarding.clearPendingWallet,
    deferContactProfileName: mockState.onboarding.deferContactProfileName,
  })

  return {
    useAuthStore,
    useOnboardingStore,
    useWalletStore,
  }
})

vi.mock('@spectra/identity-vault', () => ({
  deriveDeterministicEXOWalletBundle: mockState.deriveDeterministicEXOWalletBundle,
}))

vi.mock('@/services/security/biometricUnlock', () => mockState.biometrics)

vi.mock('@/lib/theme', () => ({
  useThemeColors: () => ({
    background: '#000000',
    error: '#ff0000',
    primary: '#00ff99',
    success: '#00ff99',
    text: '#ffffff',
  }),
}))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { Platform, StyleSheet } = await import('react-native')
const { default: SetPinScreen } = await import('../../app/(auth)/set-pin')

describe('SetPinScreen onboarding setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.nextPin = '123456'
    mockState.pendingWallet = {
      mnemonic: Array.from({ length: 24 }, (_, index) => `word${index + 1}`).join(' '),
      source: 'create',
      wallet: mockState.createdWallet,
      wallets: mockState.bundledWallets,
    }
    mockState.localAuthentication.hasHardwareAsync.mockResolvedValue(false)
    mockState.localAuthentication.isEnrolledAsync.mockResolvedValue(false)
    ;(Platform as { OS: string }).OS = 'ios'
    mockState.walletStore._sessionDerivedKey = new Uint8Array([7, 8, 9])
  })

  it('redirects to welcome when no pending wallet exists', () => {
    mockState.pendingWallet = null

    render(<SetPinScreen />)

    expect(mockState.router.replace).toHaveBeenCalledWith('/(auth)/welcome')
  })

  it('requires matching PIN confirmation before wallet creation', async () => {
    render(<SetPinScreen />)

    await fireEvent.press(screen.getByTestId('pin-Enter a 6-digit PIN'))
    mockState.nextPin = '111111'
    await fireEvent.press(screen.getByTestId('pin-Re-enter your PIN'))

    expect(screen.getAllByText('PINs do not match').length).toBeGreaterThan(0)
    expect(mockState.walletStore.createWallet).not.toHaveBeenCalled()
  })

  it('uses a scrollable Android layout so confirmation copy stays visible above the keyboard', async () => {
    ;(Platform as { OS: string }).OS = 'android'

    const view = render(<SetPinScreen />)
    await fireEvent.press(screen.getByTestId('pin-Enter a 6-digit PIN'))
    const scrollViews = view.root.findAll((node) => String(node.type) === 'RCTScrollView')
    const keyboardAvoidingViews = view.root.findAll((node) => node.props.behavior === 'padding')

    expect(scrollViews).toHaveLength(1)
    expect(keyboardAvoidingViews.length).toBeGreaterThanOrEqual(1)
    expect(StyleSheet.flatten(scrollViews[0].props.contentContainerStyle)).toMatchObject({
      flexGrow: 1,
      justifyContent: 'center',
      paddingBottom: 28,
    })
    expect(scrollViews[0].props.keyboardShouldPersistTaps).toBe('handled')
    expect(screen.getByText('Enter the same PIN again to confirm')).toBeTruthy()
    expect(screen.getByTestId('pin-Re-enter your PIN')).toBeTruthy()
  })

  it('creates the wallet without registering it remotely', async () => {

    render(<SetPinScreen />)
    await fireEvent.press(screen.getByTestId('pin-Enter a 6-digit PIN'))
    await fireEvent.press(screen.getByTestId('pin-Re-enter your PIN'))

    expect(mockState.walletStore.createWallet).toHaveBeenCalledWith(mockState.bundledWallets, '123456')
    expect(mockState.biometrics.clearBiometricUnlock).toHaveBeenCalled()
    expect(mockState.authStore.setAuthenticated).toHaveBeenCalledWith('exo1created', 'created-public-key')
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/chats')
    expect(mockState.onboarding.clearPendingWallet).toHaveBeenCalled()
  })

  it('defers imported-wallet chat initialization to the scoped app bootstrap', async () => {
    mockState.pendingWallet = {
      mnemonic: Array.from({ length: 24 }, (_, index) => `word${index + 1}`).join(' '),
      source: 'import',
      wallet: mockState.createdWallet,
      wallets: mockState.bundledWallets,
    }

    render(<SetPinScreen />)
    await fireEvent.press(screen.getByTestId('pin-Enter a 6-digit PIN'))
    await fireEvent.press(screen.getByTestId('pin-Re-enter your PIN'))

    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/chats')
    expect(mockState.onboarding.clearPendingWallet).toHaveBeenCalled()
  })

  it('does not write a contact profile during wallet import', async () => {
    mockState.pendingWallet = {
      mnemonic: Array.from({ length: 24 }, (_, index) => `word${index + 1}`).join(' '),
      source: 'import',
      wallet: mockState.createdWallet,
      wallets: mockState.bundledWallets,
    }
    render(<SetPinScreen />)
    await fireEvent.press(screen.getByTestId('pin-Enter a 6-digit PIN'))
    await fireEvent.press(screen.getByTestId('pin-Re-enter your PIN'))

    expect(mockState.onboarding.deferContactProfileName).not.toHaveBeenCalled()
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/chats')
  })

  it('defers a chosen contact profile name until scoped chat bootstrap', async () => {
    mockState.pendingWallet = {
      mnemonic: Array.from({ length: 24 }, (_, index) => `word${index + 1}`).join(' '),
      source: 'create',
      wallet: mockState.createdWallet,
      wallets: mockState.bundledWallets,
      contactProfileName: ' Public Alice ',
    }

    render(<SetPinScreen />)
    await fireEvent.press(screen.getByTestId('pin-Enter a 6-digit PIN'))
    await fireEvent.press(screen.getByTestId('pin-Re-enter your PIN'))

    expect(mockState.authStore.setAuthenticated).toHaveBeenCalled()
    expect(mockState.onboarding.deferContactProfileName).toHaveBeenCalledWith(
      'exo1created',
      ' Public Alice ',
    )
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/chats')
    expect(mockState.onboarding.clearPendingWallet).toHaveBeenCalled()
  })

  it('stores the session biometric key only when the user opts into biometrics', async () => {
    mockState.localAuthentication.hasHardwareAsync.mockResolvedValue(true)
    mockState.localAuthentication.isEnrolledAsync.mockResolvedValue(true)

    render(<SetPinScreen />)
    await act(async () => {})
    await fireEvent.press(screen.getByTestId('pin-Enter a 6-digit PIN'))
    await fireEvent.press(screen.getByTestId('pin-Re-enter your PIN'))
    await fireEvent.press(screen.getByTestId('button-Enable Biometric'))

    expect(mockState.biometrics.storeBiometricUnlockKey)
      .toHaveBeenCalledWith(new Uint8Array([7, 8, 9]), 'Enable Biometric Unlock')
    expect(mockState.biometrics.clearBiometricUnlock).not.toHaveBeenCalled()
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/chats')
  })
})
