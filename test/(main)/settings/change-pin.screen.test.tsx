/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  alert: vi.fn(),
  haptics: {
    impactAsync: vi.fn(async () => {}),
    notificationAsync: vi.fn(async () => {}),
  },
  nextPin: '123456',
  router: {
    back: vi.fn(),
    replace: vi.fn(),
  },
  wallet: {
    changePin: vi.fn(async () => true),
    verifyPin: vi.fn(async () => true),
  },
  pinGuard: {
    formatGuardedPinLockoutMessage: vi.fn(() => 'locked'),
    verifyPinWithAttemptGuard: vi.fn(async () => ({ status: 'valid' as const })),
  },
  logoutAndWipeAccount: vi.fn(async () => {}),
}))

vi.mock('react-native', async () => {
  const rn = await import('../../../test/react-native')
  return {
    ...rn,
    Alert: { alert: mockState.alert },
  }
})

vi.mock('react-native-keyboard-controller', async () => {
  const { View } = await import('../../../test/react-native')
  return { KeyboardAvoidingView: View }
})

vi.mock('expo-router', () => ({
  useRouter: () => mockState.router,
}))

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Medium: 'medium' },
  NotificationFeedbackType: { Error: 'error', Success: 'success' },
  impactAsync: mockState.haptics.impactAsync,
  notificationAsync: mockState.haptics.notificationAsync,
}))

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return {
    ChevronLeft: TestIcon,
    Lock: TestIcon,
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/components/wallet', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text, View } = await import('../../../test/react-native')
  return {
    PinInput: ({ error, onComplete }: { error?: string; onComplete: (pin: string) => void | Promise<void> }) => (
      ReactActual.createElement(View, null,
        ReactActual.createElement(Pressable, { onPress: () => onComplete(mockState.nextPin), testID: 'complete-pin' },
          ReactActual.createElement(Text, null, 'Complete PIN'),
        ),
        error ? ReactActual.createElement(Text, null, error) : null,
      )
    ),
  }
})

vi.mock('@/store', () => ({
  useWalletStore: () => mockState.wallet,
}))

vi.mock('@/lib/i18n', async () => {
  const { createI18nMock } = await import('../../../test/mainScreenMocks')
  return createI18nMock()
})

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/services/accountLifecycle/accountTeardown', () => ({
  logoutAndWipeAccount: mockState.logoutAndWipeAccount,
}))

vi.mock('@/services/security/pinAttemptGuard', () => mockState.pinGuard)

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: ChangePinScreen } = await import('../../../app/(main)/settings/change-pin')

describe('ChangePinScreen', () => {
  beforeEach(() => {
    mockState.alert.mockClear()
    mockState.nextPin = '123456'
    mockState.router.back.mockClear()
    mockState.router.replace.mockClear()
    mockState.wallet.changePin.mockResolvedValue(true)
    mockState.wallet.changePin.mockClear()
    mockState.pinGuard.verifyPinWithAttemptGuard.mockResolvedValue({ status: 'valid' })
    mockState.pinGuard.verifyPinWithAttemptGuard.mockClear()
    mockState.logoutAndWipeAccount.mockClear()
  })

  it('uses the shared PIN guard before accepting the current PIN', async () => {
    mockState.pinGuard.verifyPinWithAttemptGuard.mockResolvedValue({
      remainingAttempts: 4,
      status: 'invalid',
    } as any)
    render(<ChangePinScreen />)

    await fireEvent.press(screen.getByTestId('complete-pin'))

    expect(mockState.pinGuard.verifyPinWithAttemptGuard).toHaveBeenCalledWith('123456', mockState.wallet.verifyPin)
    expect(screen.getByText('lockout.remainingAttempts')).toBeTruthy()
    expect(mockState.wallet.changePin).not.toHaveBeenCalled()
  })

  it('wipes and routes to welcome when the shared guard requires fail-wipe', async () => {
    mockState.pinGuard.verifyPinWithAttemptGuard.mockResolvedValue({ status: 'wipe_required' } as any)
    render(<ChangePinScreen />)

    await fireEvent.press(screen.getByTestId('complete-pin'))

    expect(mockState.logoutAndWipeAccount).toHaveBeenCalled()
    expect(mockState.router.replace).toHaveBeenCalledWith('/(auth)/welcome')
  })

  it('changes PIN only after current, new, and confirm steps pass', async () => {
    render(<ChangePinScreen />)

    await fireEvent.press(screen.getByTestId('complete-pin'))
    mockState.nextPin = '654321'
    await fireEvent.press(screen.getByTestId('complete-pin'))
    await fireEvent.press(screen.getByTestId('complete-pin'))

    expect(mockState.wallet.changePin).toHaveBeenCalledWith('123456', '654321')
    expect(mockState.alert).toHaveBeenCalledWith(
      'Success',
      'Your PIN has been changed successfully.',
      expect.any(Array),
    )
  })
})
