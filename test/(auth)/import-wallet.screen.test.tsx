/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  guardedRouter: { back: vi.fn(), push: vi.fn() },
  onboarding: { setPendingWallet: vi.fn() },
  deriveBundle: vi.fn(),
  notificationAsync: vi.fn(async () => undefined),
  validateMnemonic: vi.fn(),
}))

vi.mock('react-native', async () => await import('../../test/react-native'))
vi.mock('react-native-keyboard-controller', async () => {
  const { ScrollView } = await import('../../test/react-native')
  return { KeyboardAwareScrollView: ScrollView }
})
vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('../../test/react-native')
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ bottom: 20, left: 0, right: 0, top: 0 }),
  }
})
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { word?: string }) => (
      options?.word ? key.replace('{{word}}', options.word) : key
    ),
  }),
}))
vi.mock('@/lib/i18n', () => ({
  translate: (key: string, options?: { word?: string }) => (
    options?.word ? key.replace('{{word}}', options.word) : key
  ),
}))
vi.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Error: 'error', Success: 'success' },
  notificationAsync: mockState.notificationAsync,
}))
vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../test/mainAppMocks')
  return { ChevronLeft: TestIcon, KeyRound: TestIcon, ShieldAlert: TestIcon }
})
vi.mock('@/components/ui', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text } = await import('../../test/react-native')
  return {
    Button: ({
      children,
      disabled,
      onPress,
    }: {
      children: React.ReactNode
      disabled?: boolean
      onPress?: () => void | Promise<void>
    }) => (
      ReactActual.createElement(
        Pressable,
        { disabled, onPress, testID: 'import-button' },
        ReactActual.createElement(Text, null, children),
      )
    ),
  }
})
vi.mock('@/components/wallet', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text } = await import('../../test/react-native')
  return {
    MnemonicInput: ({
      embeddedScroll,
      error,
      onMnemonicChange,
    }: {
      embeddedScroll?: boolean
      error?: string
      onMnemonicChange: (value: string, complete: boolean) => void
    }) => (
      ReactActual.createElement(
        Pressable,
        {
          embeddedScroll,
          onPress: () => onMnemonicChange('valid mnemonic', true),
          testID: 'mnemonic-input',
        },
        ReactActual.createElement(Text, null, 'MnemonicInput'),
        error ? ReactActual.createElement(Text, null, error) : null,
      )
    ),
  }
})
vi.mock('@spectra/identity-vault', () => ({
  DETERMINISTIC_EXO_WALLET_BUNDLE_SIZE: 7,
  deriveDeterministicEXOWalletBundle: mockState.deriveBundle,
  validateMnemonic: mockState.validateMnemonic,
}))
vi.mock('@/store', () => ({
  useOnboardingStore: (selector: (state: typeof mockState.onboarding) => unknown) => selector(mockState.onboarding),
}))
vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../test/mainAppMocks')
  return { useThemeColors: () => testColors }
})
vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.guardedRouter,
}))
vi.mock('../../app/(auth)/authErrors', () => ({
  getSafeAuthErrorMessage: (_error: unknown, fallback: string) => fallback,
}))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: ImportWalletScreen } = await import('../../app/(auth)/import-wallet')

const bundle = {
  rootWallet: { address: 'EXO00root' },
  transparentWallets: [
    { address: 'EXO001' },
    { address: 'EXO002' },
    { address: 'EXO003' },
    { address: 'EXO004' },
    { address: 'EXO005' },
  ],
  spectreWallet: { address: 'EXO00spectre' },
}

describe('ImportWalletScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.validateMnemonic.mockReturnValue({ valid: true })
    mockState.deriveBundle.mockResolvedValue(bundle)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lets the full screen own recovery phrase scrolling', () => {
    const view = render(<ImportWalletScreen />)

    expect(screen.getByTestId('mnemonic-input').props.embeddedScroll).toBe(false)
    const scrollViews = view.root.findAll((node) => String(node.type) === 'RCTScrollView')
    expect(scrollViews).toHaveLength(1)
    expect(scrollViews[0].props.bottomOffset).toBe(16)
    expect(scrollViews[0].props.keyboardShouldPersistTaps).toBe('handled')
  })

  it('maps mnemonic validation codes through auth translations', async () => {
    mockState.validateMnemonic.mockReturnValue({
      valid: false,
      code: 'mnemonic_invalid_word',
      params: { word: 'not-a-word' },
    })
    render(<ImportWalletScreen />)

    await fireEvent.press(screen.getByTestId('mnemonic-input'))
    await fireEvent.press(screen.getByTestId('import-button'))

    expect(screen.getByText('Invalid word: "not-a-word"')).toBeTruthy()
    expect(mockState.deriveBundle).not.toHaveBeenCalled()
  })

  it('paints full-screen progress before derivation and ignores duplicate presses', async () => {
    const frames: FrameRequestCallback[] = []
    let resolveBundle!: (value: typeof bundle) => void
    mockState.deriveBundle.mockImplementation((
      _mnemonic: string,
      options?: {
        onProgress?: (progress: {
          completed: number
          total: number
          stage: string
        }) => void
      },
    ) => {
      options?.onProgress?.({ completed: 1, total: 7, stage: 'root' })
      return new Promise((resolve) => {
        resolveBundle = resolve
      })
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })

    render(<ImportWalletScreen />)
    await fireEvent.press(screen.getByTestId('mnemonic-input'))
    const importButton = screen.getByTestId('import-button')
    const handleImport = importButton.props.onPress
    let importPromise!: Promise<void>

    act(() => {
      importPromise = handleImport()
    })

    expect(screen.getByTestId('import-progress-screen')).toBeTruthy()
    expect(screen.getByTestId('import-progress').props.accessibilityValue).toEqual({
      min: 0,
      max: 7,
      now: 0,
    })
    expect(mockState.deriveBundle).not.toHaveBeenCalled()

    await act(async () => {
      frames.shift()?.(0)
      await Promise.resolve()
    })

    expect(mockState.deriveBundle).not.toHaveBeenCalled()

    await act(async () => {
      frames.shift()?.(0)
      await Promise.resolve()
    })

    expect(mockState.deriveBundle).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('import-progress').props.accessibilityValue.now).toBe(1)

    await act(async () => {
      await handleImport()
    })
    expect(mockState.deriveBundle).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveBundle(bundle)
      await importPromise
    })

    expect(mockState.onboarding.setPendingWallet).toHaveBeenCalledTimes(1)
    expect(mockState.onboarding.setPendingWallet).toHaveBeenCalledWith({
      mnemonic: 'valid mnemonic',
      source: 'import',
      wallet: bundle.rootWallet,
      wallets: [
        bundle.rootWallet,
        ...bundle.transparentWallets,
        bundle.spectreWallet,
      ],
    })
    expect(mockState.guardedRouter.push).toHaveBeenCalledTimes(1)
  })

  it('passes progress and async-yield callbacks into deterministic derivation', async () => {
    render(<ImportWalletScreen />)
    await fireEvent.press(screen.getByTestId('mnemonic-input'))
    await fireEvent.press(screen.getByTestId('import-button'))

    expect(mockState.deriveBundle).toHaveBeenCalledTimes(1)
    expect(mockState.deriveBundle.mock.calls[0][1]).toEqual({
      onProgress: expect.any(Function),
      yieldToEventLoop: expect.any(Function),
    })
  })
})
