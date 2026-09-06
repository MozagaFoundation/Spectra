/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  accountReadiness: {
    show: vi.fn(),
  },
  alerts: [] as Array<{ buttons?: Array<{ onPress?: () => void | Promise<void>; text: string }> }>,
  auth: {
    exoAddress: 'EXO0011111111111111111111111111111111111111',
  },
  dataProtection: {
    lockActiveSession: vi.fn(async () => {}),
  },
  accountRemoval: {
    request: vi.fn(),
  },
  exoNotifications: {
    hydrate: vi.fn(async () => {}),
    unreadWalletAddresses: ['EXO0022222222222222222222222222222222222222'],
  },
  router: {
    push: vi.fn(),
    replace: vi.fn(),
  },
  spectre: { enabled: false },
  contactProfile: {
    ensureOwnContactProfile: vi.fn(async () => ({ avatarDataUri: null })),
  },
  quantumChat: {
    getIdentity: vi.fn(() => ({ id: 'identity-id' })),
  },
  walletState: {
    activeWalletId: 'root',
    wallet: {
      address: 'EXO0011111111111111111111111111111111111111',
      displayName: 'Root',
      id: 'root',
    },
    wallets: [
      {
        address: 'EXO0011111111111111111111111111111111111111',
        displayName: 'Root',
        id: 'root',
      },
      {
        address: 'EXO0022222222222222222222222222222222222222',
        displayName: 'Work',
        id: 'work',
        transparentMode: true,
      },
    ],
  },
  activateChatPersona: vi.fn(async () => {}),
}))

vi.mock('react-native', async () => {
  const rn = await import('../../../test/react-native')
  return {
    ...rn,
    Alert: {
      alert: (title: string, message?: string, buttons?: Array<{ onPress?: () => void | Promise<void>; text: string }>) => {
        mockState.alerts.push({ buttons })
      },
    },
  }
})

vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '2.3.4' } },
}))

vi.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => callback(),
}))

vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('../../../test/react-native')
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainAppMocks')
  return {
    CheckCircle: TestIcon,
    ChevronDown: TestIcon,
    ChevronRight: TestIcon,
    ChevronUp: TestIcon,
    Archive: TestIcon,
    Crown: TestIcon,
    HelpCircle: TestIcon,
    Key: TestIcon,
    LogOut: TestIcon,
    Palette: TestIcon,
    QrCode: TestIcon,
    Shield: TestIcon,
    Trash2: TestIcon,
  }
})

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
}))

vi.mock('@/components/common', async () => {
  const { TestAvatar } = await import('../../../test/mainAppMocks')
  return { Avatar: TestAvatar }
})

vi.mock('@/components/settings/PrivacyConnectivitySettings', async () => {
  const { Pressable, Text } = await import('../../../test/react-native')
  return {
    PrivacyConnectivitySettings: ({
      onOpenSpectreSetup,
    }: {
      onOpenSpectreSetup: () => void
    }) => (
      <Pressable onPress={onOpenSpectreSetup}>
        <Text>Network Privacy</Text>
      </Pressable>
    ),
  }
})

vi.mock('@/components/settings/SpectreSetupFlow', async () => {
  const { Pressable, Text, View } = await import('../../../test/react-native')
  return {
    SpectreSetupFlow: ({ onClose }: { onClose: () => void }) => (
      <View testID="spectre-setup-flow">
        <Text>Finish Spectre Mode Setup</Text>
        <Pressable onPress={onClose}>
          <Text>Close Spectre Setup</Text>
        </Pressable>
      </View>
    ),
  }
})

vi.mock('@/components/settings/AccountRemovalFlow', () => ({
  AccountRemovalFlow: ({
    children,
  }: {
    children: (controls: { requestAccountRemoval: () => void; isDeleting: boolean }) => React.ReactNode
  }) => children({
    requestAccountRemoval: mockState.accountRemoval.request,
    isDeleting: false,
  }),
}))

vi.mock('@/lib/i18n', async () => {
  const { translateForTest } = await import('../../../test/mainAppMocks')
  return { translate: translateForTest }
})

vi.mock('@/lib/appMetadata', () => ({
  getRuntimeAppVersion: () => '2.3.4',
}))

vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../../test/mainAppMocks')
  return { useThemeColors: () => testColors }
})

vi.mock('@/lib/utils', () => ({
  formatAddress: (value: string) => value,
}))

vi.mock('@/services/chat/contactProfile', () => ({
  ensureOwnContactProfile: mockState.contactProfile.ensureOwnContactProfile,
}))

vi.mock('@/services/quantumChat', () => ({
  getIdentity: mockState.quantumChat.getIdentity,
}))

vi.mock('@/services/security/dataProtection', () => ({
  lockActiveSession: mockState.dataProtection.lockActiveSession,
}))

vi.mock('@/services/chat', () => ({
  activateChatPersona: mockState.activateChatPersona,
}))

vi.mock('@/services/chat/personaSwitch', () => ({
  activateChatPersona: mockState.activateChatPersona,
}))

vi.mock('@/services/wallet', () => ({
  getRootExoWallet: (wallets: Array<any>) => wallets.find((wallet) => !wallet.transparentMode) ?? null,
}))

vi.mock('@/services/wallet/transparentAccounts', () => ({
  getRootExoWallet: (wallets: Array<any>) => wallets.find((wallet) => !wallet.transparentMode) ?? null,
}))

vi.mock('@/store', () => ({
  useAccountReadinessStore: (selector: (state: typeof mockState.accountReadiness) => unknown) => selector(mockState.accountReadiness),
  useAuthStore: (selector: (state: typeof mockState.auth) => unknown) => selector(mockState.auth),
  useExoAccountNotificationStore: (selector: (state: typeof mockState.exoNotifications) => unknown) => selector(mockState.exoNotifications),
  useWalletStore: (selector: (state: typeof mockState.walletState) => unknown) => selector(mockState.walletState),
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: typeof mockState.spectre) => unknown) => selector(mockState.spectre),
}))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: SettingsScreen } = await import('../../../app/(main)/(tabs)/settings')

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

function findPressableByText(root: any, text: string) {
  return root.findAll((node: any) => (
    node.type === 'Pressable' && nodeText(node).includes(text)
  ))[0]
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.alerts = []
    mockState.spectre.enabled = false
    mockState.walletState.activeWalletId = 'root'
    mockState.walletState.wallet = mockState.walletState.wallets[0]
  })

  it('shows the runtime app version and the EXO accounts section when not in Spectre Mode', async () => {
    const view = render(<SettingsScreen />)
    await act(async () => {})

    expect(screen.getByText('Version 2.3.4')).toBeTruthy()
    expect(screen.getByText('EXO Accounts')).toBeTruthy()
    expect(screen.getByText('Network Privacy')).toBeTruthy()
    expect(nodeText(view.root).indexOf('Security Settings'))
      .toBeLessThan(nodeText(view.root).indexOf('Network Privacy'))
  })

  it('hides EXO accounts while Spectre Mode is active', async () => {
    mockState.spectre.enabled = true
    render(<SettingsScreen />)
    await act(async () => {})

    expect(() => screen.getByText('EXO Accounts')).toThrow()
    expect(() => screen.getByText('Work')).toThrow()
  })

  it('shows Spectre setup in the Settings screen without navigation', async () => {
    const view = render(<SettingsScreen />)
    await act(async () => {})

    await fireEvent.press(findPressableByText(view.root, 'Network Privacy'))

    expect(screen.getByText('Finish Spectre Mode Setup')).toBeTruthy()
    expect(mockState.router.push).not.toHaveBeenCalledWith('/(main)/settings/spectre-setup')

    await fireEvent.press(findPressableByText(view.root, 'Close Spectre Setup'))
    expect(screen.getByText('Network Privacy')).toBeTruthy()
  })

  it('reveals other EXO accounts from the dropdown before switching', async () => {
    const view = render(<SettingsScreen />)
    await act(async () => {})

    expect(findPressableByText(view.root, 'Work')).toBeUndefined()

    await fireEvent.press(findPressableByText(view.root, 'Show other accounts'))
    await fireEvent.press(findPressableByText(view.root, 'Work'))

    expect(mockState.activateChatPersona).toHaveBeenCalledWith('work', { verifyCloudBinding: false })
    expect(mockState.accountReadiness.show).toHaveBeenCalled()
  })

  it('routes logout through the unified account removal flow', async () => {
    const view = render(<SettingsScreen />)

    await fireEvent.press(findPressableByText(view.root, 'Lock Account'))
    await mockState.alerts[0].buttons?.[1].onPress?.()
    expect(mockState.dataProtection.lockActiveSession).toHaveBeenCalled()
    expect(mockState.router.replace).toHaveBeenCalledWith('/(auth)/unlock')

    await fireEvent.press(findPressableByText(view.root, 'Log Out'))
    expect(mockState.accountRemoval.request).toHaveBeenCalledTimes(1)
  })
})

