/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  alerts: [] as Array<{
    buttons?: Array<{ onPress?: () => void | Promise<void>; text: string }>
    title: string
  }>,
  deleteAccountPermanently: vi.fn(async () => {}),
  hasVerifiedBackendAccess: vi.fn(() => true),
  notificationAsync: vi.fn(async () => {}),
  verifyPin: vi.fn(async () => true),
  verifyPinWithAttemptGuard: vi.fn(async () => ({ status: 'valid' as const })),
  wipeAllSensitiveData: vi.fn(async () => {}),
}))

vi.mock('react-native', async () => {
  const rn = await import('../../test/react-native')
  return {
    ...rn,
    Alert: {
      alert: (
        title: string,
        _message?: string,
        buttons?: Array<{ onPress?: () => void | Promise<void>; text: string }>,
      ) => state.alerts.push({ buttons, title }),
    },
  }
})

vi.mock('expo-haptics', () => ({
  notificationAsync: state.notificationAsync,
  NotificationFeedbackType: { Error: 'error', Success: 'success' },
}))

vi.mock('lucide-react-native', async () => {
  const { View } = await import('../../test/react-native')
  return { Trash2: View }
})

vi.mock('@/components/settings/PinEntryScreen', async () => {
  const { View } = await import('../../test/react-native')
  return {
    PinEntryScreen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  }
})

vi.mock('@/components/wallet', async () => {
  const { Pressable, Text } = await import('../../test/react-native')
  return {
    PinInput: ({ onComplete }: { onComplete: (pin: string) => Promise<void> }) => (
      <Pressable testID="complete-pin" onPress={() => onComplete('123456')}>
        <Text>Enter your current PIN</Text>
      </Pressable>
    ),
  }
})

vi.mock('@/lib/i18n', () => ({
  translate: (key: string) => key,
}))

vi.mock('@/lib/theme', () => ({
  useThemeColors: () => ({ error: '#f00' }),
}))

vi.mock('@/services/accountLifecycle/accountTeardown', () => ({
  wipeAllSensitiveData: state.wipeAllSensitiveData,
}))

vi.mock('@/services/accountLifecycle/permanentAccountDeletion', () => ({
  deleteAccountPermanently: state.deleteAccountPermanently,
}))

vi.mock('@/services/backend/session', () => ({
  hasVerifiedBackendAccess: state.hasVerifiedBackendAccess,
}))

vi.mock('@/services/security/pinAttemptGuard', () => ({
  formatGuardedPinLockoutMessage: vi.fn(() => 'locked'),
  verifyPinWithAttemptGuard: state.verifyPinWithAttemptGuard,
}))

vi.mock('@/store/accountDeletionStore', () => ({
  useAccountDeletionStore: {
    getState: () => ({ phase: 'completed' }),
  },
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: () => ({ verifyPin: state.verifyPin }),
}))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { AccountRemovalFlow } = await import('./AccountRemovalFlow')

function renderFlow() {
  return render(
    <AccountRemovalFlow>
      {({ requestAccountRemoval }) => (
        React.createElement(
          'Pressable',
          { onPress: requestAccountRemoval, testID: 'logout-trigger' },
          React.createElement('Text', null, 'Log Out'),
        )
      )}
    </AccountRemovalFlow>,
  )
}

async function requestAccountRemoval(view: ReturnType<typeof renderFlow>) {
  const trigger = view.root.findByProps({ testID: 'logout-trigger' })
  await act(async () => {
    await trigger.props.onPress()
  })
}

async function pressAlertButton(alertIndex: number, text: string) {
  const button = state.alerts[alertIndex]?.buttons?.find((candidate) => candidate.text === text)
  if (!button?.onPress) throw new Error(`Missing ${text} confirmation`)
  await act(async () => {
    await button.onPress?.()
  })
}

describe('AccountRemovalFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.alerts = []
    state.hasVerifiedBackendAccess.mockReturnValue(true)
    state.verifyPinWithAttemptGuard.mockResolvedValue({ status: 'valid' })
  })

  it('requires a verified backend session before showing destructive confirmations', async () => {
    state.hasVerifiedBackendAccess.mockReturnValue(false)
    const view = renderFlow()

    await requestAccountRemoval(view)

    expect(state.alerts).toHaveLength(1)
    expect(state.alerts[0]?.title).toBe('Cloud Session Required')
    expect(state.deleteAccountPermanently).not.toHaveBeenCalled()
    expect(view.queryByTestId('complete-pin')).toBeNull()
  })

  it('requires PIN and final confirmation before permanent deletion', async () => {
    const view = renderFlow()

    await requestAccountRemoval(view)
    await pressAlertButton(0, 'Continue')
    await fireEvent.press(screen.getByTestId('complete-pin'))

    expect(state.verifyPinWithAttemptGuard).toHaveBeenCalledWith('123456', state.verifyPin)
    expect(state.deleteAccountPermanently).not.toHaveBeenCalled()

    await pressAlertButton(1, 'Erase Everything')

    expect(state.deleteAccountPermanently).toHaveBeenCalledTimes(1)
  })

  it('rechecks the backend session before final deletion', async () => {
    const view = renderFlow()

    await requestAccountRemoval(view)
    await pressAlertButton(0, 'Continue')
    await fireEvent.press(screen.getByTestId('complete-pin'))
    state.hasVerifiedBackendAccess.mockReturnValue(false)
    await pressAlertButton(1, 'Erase Everything')

    expect(state.deleteAccountPermanently).not.toHaveBeenCalled()
    expect(state.alerts[2]?.title).toBe('Cloud Session Required')
  })
})
