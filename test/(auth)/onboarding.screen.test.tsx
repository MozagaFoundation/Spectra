/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => {
  const mnemonic = Array.from({ length: 24 }, (_, index) => `word${index + 1}`).join(' ')
  const wallet = {
    address: 'exo1onboarding',
    publicKey: 'onboarding-public-key',
  }
  const transparentWallets = [
    { address: 'exo1transparent1', publicKey: 'transparent-1-public-key', transparentMode: true },
    { address: 'exo1transparent2', publicKey: 'transparent-2-public-key', transparentMode: true },
  ]
  const spectreWallet = {
    address: 'exo1spectre',
    publicKey: 'spectre-public-key',
    spectreMode: true,
  }
  const wallets = [wallet, ...transparentWallets, spectreWallet]

  return {
    mnemonic,
    wallet,
    transparentWallets,
    spectreWallet,
    wallets,
    router: {
      back: vi.fn(),
      push: vi.fn(),
      replace: vi.fn(),
    },
    haptics: {
      notificationAsync: vi.fn(async () => {}),
    },
    pendingWallet: null as {
      mnemonic: string
      source: 'create' | 'import'
      wallet: typeof wallet
      wallets?: typeof wallets
      contactProfileName?: string | null
    } | null,
    setPendingWallet: vi.fn(),
    setPendingContactProfileName: vi.fn(),
    generateMnemonic: vi.fn(() => mnemonic),
    deriveDeterministicEXOWalletBundle: vi.fn(async () => ({
      rootWallet: wallet,
      transparentWallets,
      spectreWallet,
    })),
    validateMnemonic: vi.fn((): { valid: boolean; code?: string } => ({ valid: true })),
  }
})

vi.mock('react-native', async () => await import('../../test/react-native'))

vi.mock('react-native-keyboard-controller', async () => {
  const { ScrollView, View } = await import('../../test/react-native')
  return {
    KeyboardAvoidingView: View,
    KeyboardAwareScrollView: ScrollView,
  }
})

vi.mock('expo-router', async () => {
  const ReactActual = await import('react')
  return {
    Redirect: ({ href }: { href: string }) => (
      ReactActual.createElement('Text', { testID: 'redirect' }, href)
    ),
    usePathname: () => '/welcome',
    useRouter: () => mockState.router,
  }
})

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
}))

vi.mock('lucide-react-native', () => ({
  AlertTriangle: () => null,
  Check: () => null,
  ChevronLeft: () => null,
  Copy: () => null,
  Eye: () => null,
  EyeOff: () => null,
  KeyRound: () => null,
  ShieldAlert: () => null,
  ShieldCheck: () => null,
  UserRound: () => null,
  X: () => null,
}))

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'light',
  },
  NotificationFeedbackType: {
    Success: 'success',
    Error: 'error',
  },
  impactAsync: vi.fn(async () => {}),
  notificationAsync: mockState.haptics.notificationAsync,
}))

vi.mock('expo-clipboard', () => ({
  setStringAsync: vi.fn(async () => true),
  getStringAsync: vi.fn(async () => ''),
}))

vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('../../test/react-native')
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) => (
      typeof options?.count === 'number'
        ? key.replace('{{count}}', String(options.count))
        : key
    ),
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
    Card: ({ children }: { children: React.ReactNode }) => (
      ReactActual.createElement('View', null, children)
    ),
    Input: ({
      label,
      onChangeText,
      value,
    }: {
      label: string
      onChangeText?: (value: string) => void
      value?: string
    }) => ReactActual.createElement('TextInput', {
      onChangeText,
      testID: `input-${label}`,
      value,
    }),
  }
})

vi.mock('@/components/wallet', async () => {
  const ReactActual = await import('react')
  return {
    MnemonicDisplay: ({ mnemonic }: { mnemonic: string }) => (
      ReactActual.createElement('Text', { testID: 'mnemonic-display' }, mnemonic)
    ),
    MnemonicInput: ({
      error,
      onMnemonicChange,
    }: {
      error?: string
      onMnemonicChange: (mnemonic: string, complete: boolean) => void
    }) => ReactActual.createElement(
      'Pressable',
      {
        onPress: () => onMnemonicChange(mockState.mnemonic, true),
        testID: 'mnemonic-input',
      },
      ReactActual.createElement('Text', null, error ?? 'Mnemonic Input'),
    ),
  }
})

vi.mock('@/store', () => ({
  useOnboardingStore: (selector: (state: {
    pendingWallet: typeof mockState.pendingWallet
    setPendingWallet: typeof mockState.setPendingWallet
    setPendingContactProfileName: typeof mockState.setPendingContactProfileName
  }) => unknown) => selector({
    pendingWallet: mockState.pendingWallet,
    setPendingWallet: mockState.setPendingWallet,
    setPendingContactProfileName: mockState.setPendingContactProfileName,
  }),
}))

vi.mock('@spectra/identity-vault', () => ({
  DETERMINISTIC_EXO_WALLET_BUNDLE_SIZE: 7,
  deriveDeterministicEXOWalletBundle: mockState.deriveDeterministicEXOWalletBundle,
  generateMnemonic: mockState.generateMnemonic,
  validateMnemonic: mockState.validateMnemonic,
}))

vi.mock('@/lib/theme', () => ({
  useThemeColors: () => ({
    background: '#000000',
    border: '#222222',
    borderLight: '#333333',
    error: '#ff0000',
    primary: '#00ff99',
    success: '#00ff99',
    surface: '#111111',
    text: '#ffffff',
    textMuted: '#999999',
    textOnPrimary: '#000000',
    textSecondary: '#cccccc',
    textTertiary: '#aaaaaa',
    warning: '#ffaa00',
  }),
}))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: BackupMnemonicScreen } = await import('../../app/(auth)/backup-mnemonic')
const { default: CreateWalletScreen } = await import('../../app/(auth)/create-wallet')
const { default: ImportWalletScreen } = await import('../../app/(auth)/import-wallet')
const { default: SetPublicNameScreen } = await import('../../app/(auth)/set-public-name')

describe('auth onboarding screens', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.pendingWallet = {
      mnemonic: mockState.mnemonic,
      source: 'create',
      wallet: mockState.wallet,
      wallets: mockState.wallets,
    }
    mockState.generateMnemonic.mockReturnValue(mockState.mnemonic)
    mockState.deriveDeterministicEXOWalletBundle.mockResolvedValue({
      rootWallet: mockState.wallet,
      transparentWallets: mockState.transparentWallets,
      spectreWallet: mockState.spectreWallet,
    })
    mockState.validateMnemonic.mockReturnValue({ valid: true })
  })

  it('create-wallet keeps the mnemonic in onboarding state only after user continuation', async () => {
    mockState.pendingWallet = null

    render(<CreateWalletScreen />)
    // Flush the waitForNextFrame timer plus the awaited bundle derivation
    // promise so the continue button mounts after key generation completes.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(mockState.generateMnemonic).toHaveBeenCalled()
    expect(mockState.deriveDeterministicEXOWalletBundle).toHaveBeenCalledWith(mockState.mnemonic)
    expect(mockState.setPendingWallet).not.toHaveBeenCalled()

    await fireEvent.press(screen.getByTestId('button-Continue to Backup'))

    expect(mockState.setPendingWallet).toHaveBeenCalledWith({
      mnemonic: mockState.mnemonic,
      source: 'create',
      wallet: mockState.wallet,
      wallets: mockState.wallets,
    })
    expect(mockState.router.push).toHaveBeenCalledWith('/(auth)/backup-mnemonic')
  })

  it('import-wallet refuses invalid mnemonics before deriving a wallet', async () => {
    mockState.pendingWallet = null
    mockState.validateMnemonic.mockReturnValue({
      valid: false,
      code: 'mnemonic_invalid_checksum',
    })

    render(<ImportWalletScreen />)
    await fireEvent.press(screen.getByTestId('mnemonic-input'))
    await fireEvent.press(screen.getByTestId('button-Import Account'))

    expect(mockState.deriveDeterministicEXOWalletBundle).not.toHaveBeenCalled()
    expect(mockState.setPendingWallet).not.toHaveBeenCalled()
    expect(screen.getAllByText('Invalid mnemonic checksum').length).toBeGreaterThan(0)
  })

  it('import-wallet stores a validated pending wallet and moves to PIN setup', async () => {
    mockState.pendingWallet = null

    render(<ImportWalletScreen />)
    await fireEvent.press(screen.getByTestId('mnemonic-input'))
    await fireEvent.press(screen.getByTestId('button-Import Account'))

    expect(mockState.deriveDeterministicEXOWalletBundle).toHaveBeenCalledWith(
      mockState.mnemonic,
      expect.objectContaining({
        onProgress: expect.any(Function),
        yieldToEventLoop: expect.any(Function),
      }),
    )
    expect(mockState.setPendingWallet).toHaveBeenCalledWith({
      mnemonic: mockState.mnemonic,
      source: 'import',
      wallet: mockState.wallet,
      wallets: mockState.wallets,
    })
    expect(mockState.router.push).toHaveBeenCalledWith('/(auth)/set-pin')
  })

  it('backup-mnemonic blocks direct access when onboarding state is missing', () => {
    mockState.pendingWallet = null

    render(<BackupMnemonicScreen />)

    expect(screen.getByTestId('redirect').props.children).toBe('/(auth)/welcome')
  })

  it('backup-mnemonic requires reveal before continuing to verification', async () => {
    render(<BackupMnemonicScreen />)

    await fireEvent.press(screen.getByTestId('button-Reveal Recovery Phrase'))
    expect(screen.getByTestId('mnemonic-display').props.children).toBe(mockState.mnemonic)

    await fireEvent.press(screen.getByTestId("button-I've Saved It - Continue"))
    expect(mockState.router.push).toHaveBeenCalledWith('/(auth)/verify-mnemonic')
  })

  it('stores an optional contact profile name before continuing to PIN setup', async () => {
    const view = render(<SetPublicNameScreen />)

    await act(async () => {
      fireEvent.changeText(view.getByTestId('input-Contact profile name'), 'Public Alice')
    })
    await act(async () => {
      fireEvent.press(view.getByTestId('button-Continue'))
    })

    expect(mockState.setPendingContactProfileName).toHaveBeenCalledWith('Public Alice')
    expect(mockState.router.push).toHaveBeenCalledWith('/(auth)/set-pin')
  })

  it('allows contact profile setup to be skipped', async () => {
    const view = render(<SetPublicNameScreen />)

    await act(async () => {
      fireEvent.press(view.getByTestId('button-Skip for Now'))
    })

    expect(mockState.setPendingContactProfileName).toHaveBeenCalledWith(null)
    expect(mockState.router.push).toHaveBeenCalledWith('/(auth)/set-pin')
  })

  it('accepts exactly 80 Unicode contact profile characters', async () => {
    const name = '😀'.repeat(80)
    const view = render(<SetPublicNameScreen />)

    await act(async () => {
      fireEvent.changeText(view.getByTestId('input-Contact profile name'), name)
    })
    expect(view.getByText('80/80')).toBeTruthy()
    expect(view.getByTestId('button-Continue').props.disabled).toBe(false)
    await act(async () => {
      fireEvent.press(view.getByTestId('button-Continue'))
    })

    expect(mockState.setPendingContactProfileName).toHaveBeenCalledWith(name)
    expect(mockState.router.push).toHaveBeenCalledWith('/(auth)/set-pin')
  })

  it('blocks over-limit and unsafe contact profile names before PIN setup', async () => {
    const view = render(<SetPublicNameScreen />)

    await act(async () => {
      fireEvent.changeText(view.getByTestId('input-Contact profile name'), 'a'.repeat(81))
    })
    expect(view.getByText('81/80')).toBeTruthy()
    expect(view.getByTestId('button-Continue').props.disabled).toBe(true)
    await act(async () => {
      fireEvent.press(view.getByTestId('button-Continue'))
    })
    await act(async () => {
      fireEvent.changeText(view.getByTestId('input-Contact profile name'), 'Alice\u202EAdmin')
    })
    await act(async () => {
      fireEvent.press(view.getByTestId('button-Continue'))
    })

    expect(mockState.setPendingContactProfileName).not.toHaveBeenCalled()
    expect(mockState.router.push).not.toHaveBeenCalled()
  })
})
