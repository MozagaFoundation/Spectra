/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  activation: {
    activationError: null as string | null,
    activationFlow: null as string | null,
    activationPhase: null as string | null,
    enabled: false,
    failActivation: vi.fn(),
    isApplying: false,
    resetActivationProgress: vi.fn(),
    setThemePreviewActive: vi.fn(),
    spectreAccountMode: null as string | null,
    startActivation: vi.fn((flow: string, phase: string) => {
      mockState.activation.activationFlow = flow
      mockState.activation.activationPhase = phase
    }),
  },
  duress: {
    hasDuressPin: false,
    load: vi.fn(async () => ({ enabled: false, hasDuressPin: mockState.duress.hasDuressPin })),
    save: vi.fn(async () => {}),
  },
  haptics: {
    impactAsync: vi.fn(async () => {}),
    notificationAsync: vi.fn(async () => {}),
  },
  pinEntryValue: '111111',
  pinGuard: vi.fn(async () => ({ status: 'valid' })),
  onClose: vi.fn(),
  screenProtection: {
    acquire: vi.fn(async () => mockState.screenProtection.release),
    release: vi.fn(async () => {}),
  },
  spectre: {
    configureBundled: vi.fn(async () => {}),
    createExpendable: vi.fn(async () => ({
      wallet: { address: 'EXOEXPENDABLE', id: 'exp' },
    })),
    createPersistent: vi.fn(async () => ({
      mnemonic: 'generated words',
      wallet: { address: 'EXOPERSISTENT', id: 'persistent' },
    })),
    enable: vi.fn(async () => {}),
    ensureFromMnemonic: vi.fn(async () => {}),
    getRequirements: vi.fn(async () => ({ hasExistingWallet: false })),
    preIssue: vi.fn(async () => {}),
    registerPrepared: vi.fn(async () => {}),
  },
  wallet: {
    verifyPin: vi.fn(async () => true),
  },
  wipe: vi.fn(async () => {}),
}))

vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
  callback(0)
  return 1
})

vi.mock('react-native', async () => {
  return import('../../../test/react-native')
})

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return {
    AlertTriangle: TestIcon,
    CheckCheck: TestIcon,
    CheckCircle: TestIcon,
    ChevronLeft: TestIcon,
    RefreshCw: TestIcon,
    Shield: TestIcon,
    ShieldAlert: TestIcon,
    Zap: TestIcon,
  }
})

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Error: 'error', Success: 'success' },
  impactAsync: mockState.haptics.impactAsync,
  notificationAsync: mockState.haptics.notificationAsync,
}))

vi.mock('@/components/settings/PinEntryScreen', async () => {
  const { Text, View } = await import('../../../test/react-native')
  return {
    PinEntryScreen: ({
      children,
      description,
      heading,
      title,
    }: {
      children: React.ReactNode
      description: string
      heading: string
      title: string
    }) => (
      <View>
        <Text>{title}</Text>
        <Text>{heading}</Text>
        <Text>{description}</Text>
        {children}
      </View>
    ),
  }
})

vi.mock('@/components/ui', async () => {
  const { Pressable, Text, View } = await import('../../../test/react-native')
  return {
    Button: ({
      children,
      disabled,
      onPress,
    }: {
      children: React.ReactNode
      disabled?: boolean
      onPress?: () => void
    }) => (
      <Pressable disabled={disabled} onPress={disabled ? undefined : onPress}>
        <Text>{children}</Text>
      </Pressable>
    ),
    Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  }
})

vi.mock('@/components/wallet', async () => {
  const { Pressable, Text, View } = await import('../../../test/react-native')
  return {
    MnemonicDisplay: () => <View />,
    MnemonicInput: ({
      onMnemonicChange,
    }: {
      onMnemonicChange: (value: string, complete: boolean) => void
    }) => (
      <Pressable onPress={() => onMnemonicChange('valid recovery phrase', true)}>
        <Text>Complete recovery phrase</Text>
      </Pressable>
    ),
    PinInput: ({
      error,
      label,
      onComplete,
    }: {
      error?: string
      label?: string
      onComplete: (pin: string) => void
    }) => (
      <View>
        <Pressable onPress={() => onComplete(mockState.pinEntryValue)}>
          <Text>{label || 'PIN'}</Text>
        </Pressable>
        {error ? <Text>{error}</Text> : null}
      </View>
    ),
  }
})

vi.mock('@/lib/errorDisplay', () => ({
  getErrorDisplayMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}))

vi.mock('@/lib/i18n', () => ({
  getCurrentLocaleTag: () => 'en-US',
  translate: (key: string, options?: { count?: number }) => (
    typeof options?.count === 'number'
      ? key.replace('{{count}}', String(options.count))
      : key
  ),
}))

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/services/accountLifecycle/accountTeardown', () => ({
  logoutAndWipeAccount: mockState.wipe,
}))

vi.mock('@/services/security/duressPin', () => ({
  loadDuressPinState: mockState.duress.load,
  saveDuressPin: mockState.duress.save,
}))

vi.mock('@/services/security/pinAttemptGuard', () => ({
  formatGuardedPinLockoutMessage: () => 'locked',
  verifyPinWithAttemptGuard: mockState.pinGuard,
}))

vi.mock('@/services/security/screenCaptureProtection', () => ({
  acquireSensitiveScreenProtection: mockState.screenProtection.acquire,
}))

vi.mock('@/services/security/spectreMode', () => ({
  configureBundledSpectreWallet: mockState.spectre.configureBundled,
  createExpendableSpectreWallet: mockState.spectre.createExpendable,
  createPersistentGeneratedSpectreWallet: mockState.spectre.createPersistent,
  enableSpectreMode: mockState.spectre.enable,
  ensureSpectreWalletFromMnemonic: mockState.spectre.ensureFromMnemonic,
  getSpectreSetupRequirements: mockState.spectre.getRequirements,
  preIssueExpendableSpectreActivationToken: mockState.spectre.preIssue,
  registerPreparedSpectreWallet: mockState.spectre.registerPrepared,
}))

vi.mock('@/store', () => ({
  useWalletStore: (
    selector: (state: typeof mockState.wallet) => unknown,
  ) => selector(mockState.wallet),
}))

vi.mock('@/store/spectreStore', () => {
  const useSpectreStore = Object.assign(
    (selector: (state: typeof mockState.activation) => unknown) => selector(mockState.activation),
    { getState: () => mockState.activation },
  )
  return { useSpectreStore }
})

const { act, fireEvent, render } = await import('@testing-library/react-native')
const { SpectreSetupFlow } = await import('@/components/settings/SpectreSetupFlow')

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

function pressableByText(root: any, text: string) {
  const match = root.findAll((node: any) => (
    node.type === 'Pressable'
    && typeof node.props.onPress === 'function'
    && nodeText(node).includes(text)
  ))[0]
  if (!match) throw new Error(`Missing pressable ${text}`)
  return match
}

describe('SpectreSetupFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.activation.activationError = null
    mockState.activation.activationFlow = null
    mockState.activation.activationPhase = null
    mockState.activation.enabled = false
    mockState.activation.isApplying = false
    mockState.activation.spectreAccountMode = null
    mockState.duress.hasDuressPin = false
    mockState.pinEntryValue = '111111'
    mockState.pinGuard.mockResolvedValue({ status: 'valid' })
    mockState.spectre.getRequirements.mockResolvedValue({ hasExistingWallet: false })
  })

  it('renders an opaque setup screen while preparation is pending', async () => {
    let finishPreparation!: (value: { hasExistingWallet: boolean }) => void
    mockState.spectre.getRequirements.mockImplementationOnce(() => (
      new Promise((resolve) => {
        finishPreparation = resolve
      })
    ))

    const view = render(<SpectreSetupFlow onClose={mockState.onClose} />)

    expect(view.getByTestId('spectre-setup-flow').props.style).toEqual(
      expect.objectContaining({ backgroundColor: expect.any(String) }),
    )
    expect(view.getByTestId('spectre-setup-flow').props.style.backgroundColor)
      .not.toBe('transparent')
    expect(view.getByText('Finish Spectre Mode Setup')).toBeTruthy()
    expect(mockState.screenProtection.acquire).not.toHaveBeenCalled()

    finishPreparation({ hasExistingWallet: false })
    await act(async () => {})
    expect(view.getByText('Use recovery phrase')).toBeTruthy()
  })

  it('requires primary-PIN verification and rejects a matching duress PIN', async () => {
    const view = render(<SpectreSetupFlow onClose={mockState.onClose} />)
    await act(async () => {})

    await fireEvent.press(pressableByText(view.root, 'Set Duress PIN'))
    await act(async () => {})
    await fireEvent.press(pressableByText(view.root, 'Enter your current PIN'))

    await fireEvent.press(pressableByText(view.root, 'Enter a 6-digit duress PIN'))
    expect(view.getByText('Duress PIN must be different from your real PIN')).toBeTruthy()
    expect(mockState.duress.save).not.toHaveBeenCalled()

    mockState.pinEntryValue = '222222'
    await fireEvent.press(pressableByText(view.root, 'Enter a 6-digit duress PIN'))
    await fireEvent.press(pressableByText(view.root, 'Re-enter duress PIN'))

    expect(mockState.pinGuard).toHaveBeenCalledWith('111111', mockState.wallet.verifyPin)
    expect(mockState.duress.save).toHaveBeenCalledWith('222222')
  })

  it('does not advance duress setup after a guarded PIN failure', async () => {
    mockState.pinGuard.mockResolvedValue({
      remainingAttempts: 2,
      status: 'invalid',
    } as any)
    const view = render(<SpectreSetupFlow onClose={mockState.onClose} />)
    await act(async () => {})

    await fireEvent.press(pressableByText(view.root, 'Set Duress PIN'))
    await act(async () => {})
    await fireEvent.press(pressableByText(view.root, 'Enter your current PIN'))

    expect(view.getByText('lockout.remainingAttempts')).toBeTruthy()
    expect(mockState.duress.save).not.toHaveBeenCalled()
  })

  it('activates Spectre from a completed recovery phrase and returns to Settings', async () => {
    mockState.duress.hasDuressPin = true
    const view = render(<SpectreSetupFlow onClose={mockState.onClose} />)
    await act(async () => {})

    await fireEvent.press(pressableByText(view.root, 'Use recovery phrase'))
    await act(async () => {})
    await fireEvent.press(pressableByText(view.root, 'Complete recovery phrase'))
    await fireEvent.press(pressableByText(view.root, 'Enable Spectre Mode'))
    await act(async () => {})

    expect(mockState.activation.startActivation).toHaveBeenCalledWith('enable', 'prepare_account')
    expect(mockState.screenProtection.acquire).toHaveBeenCalled()
    expect(mockState.spectre.ensureFromMnemonic).toHaveBeenCalledWith('valid recovery phrase')
    expect(mockState.spectre.enable).toHaveBeenCalled()
    expect(mockState.onClose).toHaveBeenCalled()
  })

  it('defers expendable token issuance until final activation confirmation', async () => {
    mockState.duress.hasDuressPin = true
    const view = render(<SpectreSetupFlow onClose={mockState.onClose} />)
    await act(async () => {})

    await fireEvent.press(pressableByText(view.root, 'Expendable'))
    await act(async () => {})
    expect(mockState.spectre.createExpendable).toHaveBeenCalled()
    expect(mockState.spectre.preIssue).not.toHaveBeenCalled()

    await fireEvent.press(pressableByText(view.root, 'Enable Spectre Mode'))
    await act(async () => {})

    expect(mockState.spectre.preIssue).toHaveBeenCalledWith({
      address: 'EXOEXPENDABLE',
      id: 'exp',
    })
    expect(mockState.spectre.registerPrepared).toHaveBeenCalledWith(
      { address: 'EXOEXPENDABLE', id: 'exp' },
      'expendable',
    )
    expect(mockState.spectre.enable).toHaveBeenCalled()
  })

  it('does not expose cancellable activation state during token preparation', async () => {
    let finishIssuance!: () => void
    mockState.duress.hasDuressPin = true
    mockState.spectre.preIssue.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishIssuance = resolve
    }))
    const view = render(<SpectreSetupFlow onClose={mockState.onClose} />)
    await act(async () => {})
    await fireEvent.press(pressableByText(view.root, 'Expendable'))
    await act(async () => {})

    await fireEvent.press(pressableByText(view.root, 'Enable Spectre Mode'))
    await act(async () => {})
    expect(mockState.spectre.preIssue).toHaveBeenCalled()
    expect(mockState.activation.startActivation).not.toHaveBeenCalled()
    expect(view.getByText('Reserving private activation')).toBeTruthy()
    expect(mockState.onClose).not.toHaveBeenCalled()

    finishIssuance()
    await act(async () => {})
    expect(mockState.activation.startActivation).toHaveBeenCalledWith('enable', 'prepare_account')
    expect(mockState.onClose).toHaveBeenCalled()
  })

  it('hands off to the global activation modal before managed activation finishes', async () => {
    let finishActivation!: () => void
    mockState.duress.hasDuressPin = true
    mockState.spectre.enable.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishActivation = resolve
    }))
    const view = render(<SpectreSetupFlow onClose={mockState.onClose} />)
    await act(async () => {})

    await fireEvent.press(pressableByText(view.root, 'Use recovery phrase'))
    await act(async () => {})
    await fireEvent.press(pressableByText(view.root, 'Complete recovery phrase'))
    await fireEvent.press(pressableByText(view.root, 'Enable Spectre Mode'))
    await act(async () => {})

    expect(mockState.activation.startActivation).toHaveBeenCalledWith('enable', 'prepare_account')
    expect(mockState.onClose).toHaveBeenCalledTimes(1)
    expect(mockState.spectre.enable).toHaveBeenCalled()

    finishActivation()
    await act(async () => {})
  })

  it('closes setup when Spectre is already active', async () => {
    mockState.activation.enabled = true
    render(<SpectreSetupFlow onClose={mockState.onClose} />)
    await act(async () => {})

    expect(mockState.onClose).toHaveBeenCalled()
    expect(mockState.spectre.getRequirements).not.toHaveBeenCalled()
    expect(mockState.screenProtection.acquire).not.toHaveBeenCalled()
  })

  it('shows setup before native protection and fails closed before mnemonic entry', async () => {
    mockState.screenProtection.acquire.mockRejectedValueOnce(new Error('native protection unavailable'))
    const view = render(<SpectreSetupFlow onClose={mockState.onClose} />)
    await act(async () => {})

    expect(view.getByText('Finish Spectre Mode Setup')).toBeTruthy()
    expect(mockState.screenProtection.acquire).not.toHaveBeenCalled()
    await fireEvent.press(pressableByText(view.root, 'Use recovery phrase'))
    await act(async () => {})

    expect(view.getByText('native protection unavailable')).toBeTruthy()
    expect(() => view.getByText('Complete recovery phrase')).toThrow()
  })

  it('releases preview and sensitive protection when setup closes', async () => {
    const view = render(<SpectreSetupFlow onClose={mockState.onClose} />)
    await act(async () => {})
    await fireEvent.press(pressableByText(view.root, 'Use recovery phrase'))
    await act(async () => {})

    expect(mockState.screenProtection.acquire).toHaveBeenCalledTimes(1)
    await act(async () => {
      view.unmount()
    })

    expect(mockState.screenProtection.release).toHaveBeenCalledTimes(1)
    expect(mockState.activation.setThemePreviewActive).toHaveBeenLastCalledWith(false)
  })

})
