/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  nextPin: '123456',
  router: {
    replace: vi.fn(),
  },
  params: {
    pendingCall: undefined as string | string[] | undefined,
  },
  haptics: {
    notificationAsync: vi.fn(async () => {}),
  },
  localAuthentication: {
    hasHardwareAsync: vi.fn(async () => true),
    isEnrolledAsync: vi.fn(async () => true),
  },
  secureStore: {
    values: new Map<string, string>(),
    getItemAsync: vi.fn(async (key: string) => mockState.secureStore.values.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      mockState.secureStore.values.set(key, value)
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      mockState.secureStore.values.delete(key)
    }),
  },
  wallet: {
    address: 'exo1wallet',
    publicKey: 'wallet-public-key',
  },
  walletState: {
    wallet: null as { address: string; publicKey: string } | null,
    _sessionDerivedKey: new Uint8Array([1, 2, 3]) as Uint8Array | null,
    unlockVault: vi.fn(async () => true),
    unlockVaultWithBiometricKey: vi.fn(async () => true),
  },
  auth: {
    setAuthenticated: vi.fn(),
  },
  chat: {
    reset: vi.fn(),
  },
  spectre: {
    enabled: false,
  },
  consumePendingChatWakeupAfterUnlock: vi.fn(async () => false),
  consumeLastNotificationResponse: vi.fn(async () => 'ignored'),
  preloadChatRuntimeModules: vi.fn(),
  backendAuth: {
    resetAuthCooldowns: vi.fn(),
    recoverBoundSessionOnForeground: vi.fn(async () => ({ accessToken: 'cloud' })),
  },
  quantumChat: {
    getIdentity: vi.fn(() => ({ id: 'identity-local' })),
    syncBundleServerAccessToken: vi.fn(),
    catchUpMailboxForBoundSession: vi.fn(),
  },
  pendingIncomingCall: null as null | { callSessionId: string; receivedAt: number },
  peekPendingContactShareAddress: vi.fn(() => null as string | null),
  biometrics: {
    clearBiometricUnlock: vi.fn(async () => {}),
    getBiometricUnlockState: vi.fn(async () => ({ configured: false, enabled: false })),
    readBiometricUnlockKey: vi.fn(async () => null as string | null),
    readLegacyBiometricUnlockSecret: vi.fn(async () => null as string | null),
    storeBiometricUnlockKey: vi.fn(async () => {}),
  },
  wipeAllSensitiveData: vi.fn(async () => {}),
  duress: {
    loadDuressPinState: vi.fn(async () => ({ enabled: false, hasDuressPin: false })),
    verifyDuressPin: vi.fn(async () => false),
  },
}))

vi.mock('react-native', async () => await import('../../test/react-native'))

vi.mock('react-native-keyboard-controller', async () => {
  const { View } = await import('../../test/react-native')
  return { KeyboardAvoidingView: View }
})

vi.mock('expo-router', () => ({
  useRouter: () => mockState.router,
  useLocalSearchParams: () => mockState.params,
}))

vi.mock('lucide-react-native', () => ({
  Fingerprint: () => null,
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
vi.mock('expo-secure-store', () => mockState.secureStore)

vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('../../test/react-native')
  return { SafeAreaView: View }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) => (
      values?.count !== undefined ? `${key}:${values.count}` : key
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
  }
})

vi.mock('@/components/wallet', async () => {
  const ReactActual = await import('react')
  return {
    PinInput: ({
      disabled,
      error,
      onComplete,
    }: {
      disabled?: boolean
      error?: string
      onComplete: (pin: string) => void | Promise<void>
    }) => ReactActual.createElement(
      'Pressable',
      { disabled, onPress: () => onComplete(mockState.nextPin), testID: 'pin-input' },
      ReactActual.createElement('Text', null, error ?? 'PIN'),
    ),
  }
})

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof mockState.auth) => unknown) => selector(mockState.auth),
}))

vi.mock('@/store/chatStore', () => ({
  useChatStore: (selector: (state: typeof mockState.chat) => unknown) => selector(mockState.chat),
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: typeof mockState.spectre) => unknown) => selector(mockState.spectre),
}))

vi.mock('@/store/walletStore', () => {
  const useWalletStore = (selector?: (state: typeof mockState.walletState) => unknown) => (
    selector ? selector(mockState.walletState) : mockState.walletState
  )
  useWalletStore.getState = () => mockState.walletState
  return { useWalletStore }
})

vi.mock('@/services/notifications/chatNotificationWakeup', () => ({
  consumePendingChatWakeupAfterUnlock: mockState.consumePendingChatWakeupAfterUnlock,
}))

vi.mock('@/services/notifications/pushService', () => ({
  consumeLastNotificationResponse: mockState.consumeLastNotificationResponse,
}))

vi.mock('@/services/chat/preloadRuntimeModules', () => ({
  preloadChatRuntimeModules: mockState.preloadChatRuntimeModules,
  getBackendAuthModule: async () => mockState.backendAuth,
  getQuantumChatModule: async () => mockState.quantumChat,
}))

vi.mock('@/services/call/callSessionRegistry', () => ({
  getPendingIncomingCallSession: vi.fn(async () => mockState.pendingIncomingCall),
}))

vi.mock('@/lib/pendingContactShare', () => ({
  peekPendingContactShareAddress: mockState.peekPendingContactShareAddress,
}))

vi.mock('@/services/security/biometricUnlock', () => mockState.biometrics)

vi.mock('@/lib/constants', () => ({
  SECURE_STORE_OPTIONS: {},
  SECURITY_CONFIG: {
    MAX_PIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 300_000,
  },
  VAULT_SECURITY_KEYS: {
    FAIL_WIPE_ENABLED: 'fail_wipe_enabled',
    FAIL_WIPE_ATTEMPTS: 'fail_wipe_attempts',
    PIN_ATTEMPTS: 'pin_attempts',
    PIN_LOCKOUT_UNTIL: 'pin_lockout_until',
  },
}))

vi.mock('@/lib/i18n', () => ({
  translate: (key: string, values?: { count?: number }) => (
    values?.count !== undefined ? `${key}:${values.count}` : key
  ),
}))

vi.mock('@/services/accountLifecycle/accountTeardown', () => ({
  wipeAllSensitiveData: mockState.wipeAllSensitiveData,
}))

vi.mock('@/services/security/duressPin', () => mockState.duress)

vi.mock('@/lib/theme', () => ({
  useThemeColors: () => ({
    background: '#000000',
    primary: '#00ff99',
  }),
}))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { Platform, StyleSheet } = await import('react-native')
const { default: UnlockScreen } = await import('../../app/(auth)/unlock')

async function renderUnlockScreen() {
  const view = render(<UnlockScreen />)
  await act(async () => {})
  return view
}

describe('UnlockScreen security flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.nextPin = '123456'
    mockState.params.pendingCall = undefined
    mockState.secureStore.values.clear()
    mockState.walletState.wallet = mockState.wallet
    mockState.walletState._sessionDerivedKey = new Uint8Array([1, 2, 3])
    mockState.walletState.unlockVault.mockResolvedValue(true)
    mockState.walletState.unlockVaultWithBiometricKey.mockResolvedValue(true)
    mockState.spectre.enabled = false
    ;(Platform as { OS: string }).OS = 'ios'
    mockState.biometrics.getBiometricUnlockState.mockResolvedValue({ configured: false, enabled: false })
    mockState.biometrics.readBiometricUnlockKey.mockResolvedValue(null)
    mockState.biometrics.readLegacyBiometricUnlockSecret.mockResolvedValue(null)
    mockState.duress.loadDuressPinState.mockResolvedValue({ enabled: false, hasDuressPin: false })
    mockState.duress.verifyDuressPin.mockResolvedValue(false)
    mockState.backendAuth.recoverBoundSessionOnForeground.mockResolvedValue({ accessToken: 'cloud' })
    mockState.consumePendingChatWakeupAfterUnlock.mockResolvedValue(false)
    mockState.consumeLastNotificationResponse.mockResolvedValue('ignored')
    mockState.pendingIncomingCall = null
    mockState.peekPendingContactShareAddress.mockReturnValue(null)
  })

  it('unlocks with the correct PIN without automatic cloud registration', async () => {
    await renderUnlockScreen()

    await fireEvent.press(screen.getByTestId('pin-input'))

    expect(mockState.walletState.unlockVault).toHaveBeenCalledWith('123456')
    expect(mockState.auth.setAuthenticated).toHaveBeenCalledWith('exo1wallet', 'wallet-public-key')
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/chats')
    expect(mockState.preloadChatRuntimeModules).toHaveBeenCalled()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(mockState.backendAuth.resetAuthCooldowns).toHaveBeenCalled()
    expect(mockState.backendAuth.recoverBoundSessionOnForeground).toHaveBeenCalledWith('identity-local')
    expect(mockState.quantumChat.syncBundleServerAccessToken).toHaveBeenCalled()
    expect(mockState.quantumChat.catchUpMailboxForBoundSession).toHaveBeenCalled()
    expect(mockState.consumePendingChatWakeupAfterUnlock).toHaveBeenCalled()
    expect(mockState.secureStore.deleteItemAsync).toHaveBeenCalledWith('pin_attempts', {})
    expect(mockState.secureStore.deleteItemAsync).toHaveBeenCalledWith('pin_lockout_until', {})
  })

  it('does not wait for session recovery before navigating after unlock', async () => {
    mockState.backendAuth.recoverBoundSessionOnForeground.mockImplementation(
      () => new Promise(() => {}),
    )

    await renderUnlockScreen()
    await fireEvent.press(screen.getByTestId('pin-input'))

    expect(mockState.auth.setAuthenticated).toHaveBeenCalledWith('exo1wallet', 'wallet-public-key')
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/chats')
  })

  it('uses a scrollable Android layout so PIN copy stays visible above the keyboard', async () => {
    ;(Platform as { OS: string }).OS = 'android'

    const view = await renderUnlockScreen()
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
    expect(screen.getByText('Enter your PIN to unlock')).toBeTruthy()
  })

  it('keeps pending native call context after PIN unlock', async () => {
    mockState.params.pendingCall = '1'
    mockState.pendingIncomingCall = { callSessionId: 'session-1234', receivedAt: Date.now() }

    await renderUnlockScreen()

    expect(screen.getByText('Unlock Spectra to connect your secure call')).toBeTruthy()

    await fireEvent.press(screen.getByTestId('pin-input'))

    expect(mockState.walletState.unlockVault).toHaveBeenCalledWith('123456')
    expect(mockState.auth.setAuthenticated).toHaveBeenCalledWith('exo1wallet', 'wallet-public-key')
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/chats?pendingCall=1')
  })

  it('opens Add Contact after PIN unlock when a share address is pending', async () => {
    const address = `EXO00${'ab'.repeat(19)}`
    mockState.peekPendingContactShareAddress.mockReturnValue(address)

    await renderUnlockScreen()
    await fireEvent.press(screen.getByTestId('pin-input'))

    expect(mockState.router.replace).toHaveBeenCalledWith(
      `/(main)/contact/add?scannedInvite=${encodeURIComponent(address)}`,
    )
  })

  it('keeps an incoming call ahead of a pending contact share after unlock', async () => {
    mockState.pendingIncomingCall = { callSessionId: 'session-1234', receivedAt: Date.now() }
    mockState.peekPendingContactShareAddress.mockReturnValue(`EXO00${'ab'.repeat(19)}`)

    await renderUnlockScreen()
    await fireEvent.press(screen.getByTestId('pin-input'))

    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/chats?pendingCall=1')
    expect(mockState.peekPendingContactShareAddress).not.toHaveBeenCalled()
  })

  it('consumes a retained notification response before deciding the post-unlock route', async () => {
    mockState.consumeLastNotificationResponse.mockImplementationOnce(async () => {
      mockState.pendingIncomingCall = { callSessionId: 'session-from-response', receivedAt: Date.now() }
      return 'handled'
    })

    await renderUnlockScreen()
    await fireEvent.press(screen.getByTestId('pin-input'))

    expect(mockState.consumeLastNotificationResponse).toHaveBeenCalledWith(
      'post_unlock',
      { suppressCallRoute: true },
    )
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/chats?pendingCall=1')
  })

  it('persists failed PIN attempts and starts lockout at the configured threshold', async () => {
    mockState.secureStore.values.set('pin_attempts', '4')
    mockState.walletState.unlockVault.mockResolvedValue(false)

    await renderUnlockScreen()
    await fireEvent.press(screen.getByTestId('pin-input'))

    expect(mockState.secureStore.setItemAsync).toHaveBeenCalledWith('pin_attempts', '5', {})
    expect(mockState.secureStore.setItemAsync).toHaveBeenCalledWith(
      'pin_lockout_until',
      expect.any(String),
      {},
    )
  })

  it('allows a duress PIN to wipe sensitive data even during lockout', async () => {
    mockState.secureStore.values.set('pin_lockout_until', String(Date.now() + 300_000))
    mockState.duress.loadDuressPinState.mockResolvedValue({ enabled: true, hasDuressPin: true })
    mockState.duress.verifyDuressPin.mockResolvedValue(true)

    await renderUnlockScreen()
    await fireEvent.press(screen.getByTestId('pin-input'))

    expect(mockState.wipeAllSensitiveData).toHaveBeenCalledWith({
      purgeBackendAccount: true,
    })
    expect(mockState.chat.reset).toHaveBeenCalled()
    expect(mockState.router.replace).not.toHaveBeenCalledWith('/(auth)/welcome')
  })

  it('unlocks with the current biometric key without touching legacy migration', async () => {
    mockState.biometrics.getBiometricUnlockState.mockResolvedValue({ configured: true, enabled: true })
    mockState.biometrics.readBiometricUnlockKey.mockResolvedValue('protected-biometric-key')

    await renderUnlockScreen()
    await fireEvent.press(screen.getByTestId('button-Use Biometric'))

    expect(mockState.walletState.unlockVaultWithBiometricKey)
      .toHaveBeenCalledWith('protected-biometric-key')
    expect(mockState.biometrics.readLegacyBiometricUnlockSecret).not.toHaveBeenCalled()
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/chats')
  })

  it('migrates legacy biometric material only through the hardened legacy reader', async () => {
    mockState.biometrics.getBiometricUnlockState.mockResolvedValue({ configured: true, enabled: true })
    mockState.biometrics.readBiometricUnlockKey.mockResolvedValue(null)
    mockState.biometrics.readLegacyBiometricUnlockSecret.mockResolvedValue('legacy-biometric-key')

    await renderUnlockScreen()
    await fireEvent.press(screen.getByTestId('button-Use Biometric'))

    expect(mockState.biometrics.readLegacyBiometricUnlockSecret)
      .toHaveBeenCalledWith('Authenticate to upgrade biometric unlock')
    expect(mockState.walletState.unlockVaultWithBiometricKey)
      .toHaveBeenCalledWith('legacy-biometric-key')
    expect(mockState.biometrics.storeBiometricUnlockKey)
      .toHaveBeenCalledWith(new Uint8Array([1, 2, 3]), 'Authenticate to finish biometric unlock upgrade')
    expect(mockState.router.replace).toHaveBeenCalledWith('/(main)/(tabs)/chats')
  })

  it('hides biometric unlock while Spectre Mode is active without clearing its configuration', async () => {
    mockState.spectre.enabled = true
    mockState.biometrics.getBiometricUnlockState.mockResolvedValue({ configured: true, enabled: true })

    await renderUnlockScreen()

    expect(screen.queryByTestId('button-Use Biometric')).toBeNull()
    expect(mockState.biometrics.clearBiometricUnlock).not.toHaveBeenCalled()
    expect(mockState.biometrics.readBiometricUnlockKey).not.toHaveBeenCalled()
  })
})
