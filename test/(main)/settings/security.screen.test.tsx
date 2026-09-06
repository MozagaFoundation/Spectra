/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  alerts: [] as Array<{
    title: string
    message?: string
    buttons?: Array<{ text: string; onPress?: () => void }>
  }>,
  haptics: {
    impactAsync: vi.fn(async () => {}),
    notificationAsync: vi.fn(async () => {}),
  },
  pin: {
    verifyPinWithAttemptGuard: vi.fn(async () => ({ status: 'valid' })),
  },
  router: {
    back: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  },
  secureStore: {
    getItemAsync: vi.fn(async () => null),
    setItemAsync: vi.fn(async () => {}),
  },
  dataProtection: {
    getClearImageCacheOnLockEnabled: vi.fn(async () => false),
    getMessageCachePrivacyMode: vi.fn(async () => 'standard'),
    logoutAndWipeAccount: vi.fn(async () => {}),
    setClearImageCacheOnLockEnabled: vi.fn(async () => {}),
    setMessageCachePrivacyMode: vi.fn(async () => {}),
  },
  securityPreferences: {
    readManagedSecurityPreferences: vi.fn(async () => ({
      appSwitcherPrivacyEnabled: true,
      autoLockEnabled: true,
      autoLockTime: '5 minutes',
      clearImageCacheOnLockEnabled: false,
      deliveryReceiptsEnabled: true,
      failWipeAttempts: '10',
      failWipeEnabled: false,
      messageCachePrivacyMode: 'standard',
      readReceiptsEnabled: true,
      screenshotProtectionEnabled: true,
    })),
    setManagedAutoLockEnabled: vi.fn(async () => {}),
    setManagedAutoLockTime: vi.fn(async () => {}),
    setManagedFailWipeAttempts: vi.fn(async () => {}),
    setManagedFailWipeEnabled: vi.fn(async () => {}),
  },
  wallet: {
    _sessionDerivedKey: 'session-key',
    verifyPin: vi.fn(async () => true),
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../../test/react-native')
  return {
    ...rn,
    Alert: {
      alert: (title: string, message?: string, buttons?: Array<{ text: string; onPress?: () => void }>) => {
        mockState.alerts.push({ title, message, buttons })
      },
    },
  }
})

vi.mock('react-native-keyboard-controller', async () => {
  const { KeyboardAvoidingView } = await import('../../../test/react-native')
  return { KeyboardAvoidingView }
})

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({}),
}))

vi.mock('expo-local-authentication', () => ({
  AuthenticationType: { FACIAL_RECOGNITION: 1, FINGERPRINT: 2 },
  hasHardwareAsync: vi.fn(async () => false),
  isEnrolledAsync: vi.fn(async () => false),
  supportedAuthenticationTypesAsync: vi.fn(async () => []),
}))

vi.mock('expo-secure-store', () => mockState.secureStore)

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Error: 'error', Success: 'success' },
  impactAsync: mockState.haptics.impactAsync,
  notificationAsync: mockState.haptics.notificationAsync,
}))

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return {
    AlertTriangle: TestIcon,
    Bell: TestIcon,
    CameraOff: TestIcon,
    CheckCheck: TestIcon,
    CheckCircle: TestIcon,
    ChevronLeft: TestIcon,
    ChevronRight: TestIcon,
    Clock: TestIcon,
    EyeOff: TestIcon,
    Fingerprint: TestIcon,
    Lock: TestIcon,
    ShieldAlert: TestIcon,
    Trash2: TestIcon,
  }
})

vi.mock('@/components/ui', async () => {
  const { Text, Pressable, View } = await import('../../../test/react-native')
  return {
    Button: ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
      <Pressable onPress={onPress}>{children}</Pressable>
    ),
    Card: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  }
})

vi.mock('@/components/wallet', async () => {
  const { Pressable, Text, View } = await import('../../../test/react-native')
  return {
    MnemonicDisplay: () => <View />,
    MnemonicInput: () => <View />,
    PinInput: ({ onComplete, label }: { onComplete: (pin: string) => void; label?: string }) => (
      <Pressable onPress={() => onComplete('123456')}>
        <Text>{label || 'PIN'}</Text>
      </Pressable>
    ),
  }
})

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
}))

vi.mock('@/services/security/screenshotProtection', () => ({
  getScreenshotProtectionEnabled: vi.fn(async () => true),
  setScreenshotProtectionEnabled: vi.fn(async () => {}),
}))

vi.mock('@/lib/constants', () => ({
  SECURE_STORE_OPTIONS: {},
  SPECTRE_AUTO_LOCK_TIME: 'Immediately',
  SPECTRE_DIRECT_DISAPPEARING_MS: 900000,
  SPECTRE_FAIL_WIPE_ATTEMPTS: 5,
  SPECTRE_GROUP_DISAPPEARING_MS: 3600000,
  VAULT_SECURITY_KEYS: {
    AUTO_LOCK: 'auto_lock',
    AUTO_LOCK_TIME: 'auto_lock_time',
    DELIVERY_RECEIPTS: 'delivery_receipts',
    DURESS_ENABLED: 'duress_enabled',
    FAIL_WIPE_ATTEMPTS: 'fail_wipe_attempts',
    FAIL_WIPE_ENABLED: 'fail_wipe_enabled',
    READ_RECEIPTS: 'read_receipts',
    CLEAR_IMAGE_CACHE_ON_LOCK: 'clear_image_cache_on_lock',
    MESSAGE_CACHE_PRIVACY_MODE: 'message_cache_privacy_mode',
  },
}))

vi.mock('@/lib/i18n', () => ({
  translate: (key: string, options?: { count?: number; time?: string }) => {
    if (options?.time) return `${key} ${options.time}`
    if (typeof options?.count === 'number') return key.replace('{{count}}', String(options.count))
    return key
  },
  getCurrentLocaleTag: () => 'en-US',
}))

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/services/security/biometricUnlock', () => ({
  clearBiometricUnlock: vi.fn(async () => {}),
  getBiometricUnlockState: vi.fn(async () => ({ configured: false })),
  storeBiometricUnlockKey: vi.fn(async () => {}),
}))

vi.mock('@/services/security/appSwitcherPrivacy', () => ({
  getAppSwitcherPrivacyEnabled: vi.fn(async () => true),
  setAppSwitcherPrivacyEnabled: vi.fn(async () => {}),
}))

vi.mock('@/services/security/receiptPreferences', () => ({
  getReceiptPreferences: vi.fn(async () => ({ deliveryReceiptsEnabled: true, readReceiptsEnabled: true })),
  setDeliveryReceiptsEnabled: vi.fn(async () => {}),
  setReadReceiptsEnabled: vi.fn(async () => {}),
}))

vi.mock('@/services/security/duressPin', () => ({
  clearDuressPin: vi.fn(async () => {}),
  loadDuressPinState: vi.fn(async () => ({ enabled: false, hasDuressPin: false })),
  saveDuressPin: vi.fn(async () => {}),
  setDuressProtectionEnabled: vi.fn(async () => {}),
}))

vi.mock('@/services/accountLifecycle/accountTeardown', () => ({
  logoutAndWipeAccount: mockState.dataProtection.logoutAndWipeAccount,
}))

vi.mock('@/services/security/dataProtection', () => ({
  getClearImageCacheOnLockEnabled: mockState.dataProtection.getClearImageCacheOnLockEnabled,
  getMessageCachePrivacyMode: mockState.dataProtection.getMessageCachePrivacyMode,
  setClearImageCacheOnLockEnabled: mockState.dataProtection.setClearImageCacheOnLockEnabled,
  setMessageCachePrivacyMode: mockState.dataProtection.setMessageCachePrivacyMode,
}))

vi.mock('@/services/security/securityPreferences', () => ({
  readManagedSecurityPreferences: mockState.securityPreferences.readManagedSecurityPreferences,
  setManagedAutoLockEnabled: mockState.securityPreferences.setManagedAutoLockEnabled,
  setManagedAutoLockTime: mockState.securityPreferences.setManagedAutoLockTime,
  setManagedFailWipeAttempts: mockState.securityPreferences.setManagedFailWipeAttempts,
  setManagedFailWipeEnabled: mockState.securityPreferences.setManagedFailWipeEnabled,
}))

vi.mock('@/services/security/pinAttemptGuard', () => ({
  formatGuardedPinLockoutMessage: vi.fn(() => 'locked'),
  verifyPinWithAttemptGuard: mockState.pin.verifyPinWithAttemptGuard,
}))

vi.mock('@/services/backend/session', () => ({ resetAuthCooldowns: vi.fn() }))
vi.mock('@/services/quantumChat', () => ({
  getIdentity: vi.fn(() => ({ id: 'identity-1' })),
  syncBundleServerAccessToken: vi.fn(),
}))

vi.mock('@/store', () => ({
  useAuthStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = { isCloudAuthVerified: false, session: { accessToken: 'access-token' } }
    return selector ? selector(state) : state
  },
  useChatStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = { conversations: [], isInitializing: false, isSyncingMessages: false }
    return selector ? selector(state) : state
  },
  useWalletStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = mockState.wallet
    return selector ? selector(state) : state
  },
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    activationError: null,
    activationFlow: null,
    activationPhase: null,
    enabled: false,
    failActivation: vi.fn(),
    isApplying: false,
    isLoaded: true,
    resetActivationProgress: vi.fn(),
    setThemePreviewActive: vi.fn(),
    spectreAccountMode: null,
    spectreWalletId: null,
    startActivation: vi.fn(),
  }),
}))

const { act, fireEvent, render } = await import('@testing-library/react-native')
const { default: SecuritySettingsScreen } = await import('../../../app/(main)/settings/security')

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

function switchForSetting(root: any, title: string) {
  const container = root.findAll((node: any) => (
    nodeText(node).includes(title) &&
    node.findAll((child: any) => child.type === 'RCTSwitch').length > 0
  )).sort((a: any, b: any) => nodeText(a).length - nodeText(b).length)[0]
  const switchNode = container.findAll((node: any) => node.type === 'RCTSwitch')[0]
  if (!switchNode) throw new Error(`Missing switch for ${title}`)
  return switchNode
}

function pressableByText(root: any, text: string) {
  const match = root.findAll((node: any) => (
    node.type === 'Pressable' &&
    typeof node.props.onPress === 'function' &&
    nodeText(node).includes(text)
  ))[0]
  if (!match) throw new Error(`Missing pressable ${text}`)
  return match
}

describe('SecuritySettingsScreen notification names', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.alerts = []
    mockState.securityPreferences.readManagedSecurityPreferences.mockResolvedValue({
      appSwitcherPrivacyEnabled: true,
      autoLockEnabled: true,
      autoLockTime: '5 minutes',
      clearImageCacheOnLockEnabled: false,
      deliveryReceiptsEnabled: true,
      failWipeAttempts: '10',
      failWipeEnabled: false,
      messageCachePrivacyMode: 'standard',
      readReceiptsEnabled: true,
      screenshotProtectionEnabled: true,
    })
    mockState.dataProtection.getClearImageCacheOnLockEnabled.mockResolvedValue(false)
    mockState.dataProtection.getMessageCachePrivacyMode.mockResolvedValue('standard')
  })

  it('persists the visual media cache lock preference', async () => {
    const view = render(<SecuritySettingsScreen />)
    await act(async () => {})

    await act(async () => {
      switchForSetting(view.root, 'Clear Visual Media on Lock').props.onValueChange(true)
    })

    expect(mockState.dataProtection.setClearImageCacheOnLockEnabled).toHaveBeenCalledWith(true)
  })

  it('does not expose insecure plaintext message-cache modes', async () => {
    const view = render(<SecuritySettingsScreen />)
    await act(async () => {})

    expect(() => pressableByText(view.root, 'Decrypted Message Cache')).toThrow()
    expect(mockState.dataProtection.setMessageCachePrivacyMode).not.toHaveBeenCalled()
  })

  it('does not expose a separate account deletion control', async () => {
    const view = render(<SecuritySettingsScreen />)
    await act(async () => {})

    expect(() => pressableByText(view.root, 'Delete Account')).toThrow()
  })

  it('keeps connectivity controls out of the device security screen', async () => {
    const view = render(<SecuritySettingsScreen />)
    await act(async () => {})

    for (const title of [
      'Spectre Mode',
      'Tor Connection',
      'Tor Bridges',
      'Bluetooth Mesh Messaging',
    ]) {
      expect(view.root.findAll((node: any) => nodeText(node) === title)).toHaveLength(0)
    }
  })

})
