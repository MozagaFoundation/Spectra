/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  appUpdate: {
    refreshAppUpdatePolicy: vi.fn(async () => null),
  },
  appState: {
    listener: null as null | ((state: string) => void),
    remove: vi.fn(),
  },
  auth: {
    exoAddress: 'EXO_ROOT',
    initializationError: false,
    initialize: vi.fn(async () => {}),
    isAuthenticated: true,
    isCloudAuthVerified: true,
  },
  chat: {
    activeConversationId: null as string | null,
    conversations: [] as Array<{
      id: string
      type?: string
      remoteScreenshotProtection?: boolean
    }>,
  },
  callActivity: {
    active: false,
  },
  dataProtection: {
    initializeCachePrivacySettings: vi.fn(async () => {}),
    lockActiveSession: vi.fn(async () => {}),
    readAutoLockSettings: vi.fn(async () => ({ enabled: true, timeoutMs: 1000 })),
  },
  installLifecycle: {
    reconcileSecureStoreForCurrentInstall: vi.fn(async () => ({ status: 'current_install' })),
  },
  pendingDeletion: {
    hasPending: false,
    hasPendingAccountDeletionOperation: vi.fn(async () => false),
    resumePendingAccountDeletionOnStartup: vi.fn(async () => {}),
  },
  interactionTasks: [] as Array<{ cancel: ReturnType<typeof vi.fn> }>,
  privacy: {
    enabled: true,
    getAppSwitcherPrivacyEnabled: vi.fn(async () => true),
    listener: null as null | ((enabled: boolean) => void),
    unsubscribe: vi.fn(),
  },
  push: {
    consumeLastCallNotificationResponse: vi.fn(async () => 'ignored'),
    deregisterPushTokensForWallets: vi.fn(async () => {}),
    initializeNotificationResponseHandling: vi.fn(),
    initializePushNotificationsForWallets: vi.fn(async () => {}),
    schedulePrivateTransportPushTokenCleanup: vi.fn(async () => {}),
  },
  registration: {
    synchronizeActiveWalletPushRegistration: vi.fn(async () => true),
  },
  notificationCoordinator: {
    consumePendingMessagingNotifications: vi.fn(async () => false),
  },
  keyboardProvider: {
    lastProps: null as null | { preload?: boolean },
  },
  screenCapture: {
    sensitiveListener: null as null | ((enabled: boolean) => void),
    sensitiveUnsubscribe: vi.fn(),
    setRootScreenCaptureProtectionEnabled: vi.fn(async () => {}),
  },
  screenshot: {
    enabled: true,
    getScreenshotProtectionEnabled: vi.fn(async () => true),
    listener: null as null | ((enabled: boolean) => void),
    unsubscribe: vi.fn(),
  },
  spectre: {
    enabled: false,
    initialize: vi.fn(async () => {}),
    isApplying: false,
    isLoaded: true,
  },
  spectreRuntime: {
    initializeSpectreRuntime: vi.fn(),
  },
  spectreMode: {
    reconcileSpectreModeOnStartup: vi.fn(async () => {}),
  },
  tor: {
    enabled: false,
    initialized: true,
    initialize: vi.fn(async () => {}),
    requestPresenceGate: vi.fn(),
    status: 'disconnected',
  },
  spectreAccess: {
    initializeSpectreAccessState: vi.fn(async () => {}),
  },
  torService: {
    ensureTorReady: vi.fn(async (): Promise<boolean> => true),
    stopTor: vi.fn(async () => {}),
  },
  ui: {
    appLanguage: null as null | 'es',
    isDarkMode: false,
    loadSettings: vi.fn(async () => {}),
  },
  wallet: {
    initializationError: false,
    initialize: vi.fn(async () => {}),
    isVaultUnlocked: true,
    wallet: { address: 'EXO_ROOT', id: 'root', spectreMode: false },
    wallets: [
      { address: 'EXO_ROOT', id: 'root', spectreMode: false },
      { address: 'EXO_SPECTRE', id: 'spectre', spectreMode: true },
    ],
  },
}))

vi.mock('../global.css', () => ({}))

vi.mock('react-native', async () => {
  const ReactActual = await import('react')
  const rn = await import('../test/react-native')
  const Text = ({ children, ...props }: { children?: React.ReactNode }) => (
    ReactActual.createElement('Text', props, children)
  )

  return {
    ...rn,
    Text,
    AppState: {
      addEventListener: (_event: string, listener: (state: string) => void) => {
        mockState.appState.listener = listener
        return { remove: mockState.appState.remove }
      },
    },
    InteractionManager: {
      runAfterInteractions: (callback: () => void) => {
        callback()
        const task = { cancel: vi.fn() }
        mockState.interactionTasks.push(task)
        return task
      },
    },
  }
})

vi.mock('expo-router', async () => {
  const ReactActual = await import('react')
  const { Text, View } = await import('../test/react-native')
  const Stack = ({ children, screenOptions }: { children: React.ReactNode; screenOptions?: Record<string, unknown> }) => (
    ReactActual.createElement(View, { screenOptions, testID: 'root-stack' }, children)
  )
  Stack.Screen = ({ name }: { name: string }) => (
    ReactActual.createElement(Text, { testID: `root-stack-screen-${name}` }, name)
  )
  return { Stack }
})

vi.mock('expo-status-bar', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../test/react-native')
  return { StatusBar: () => ReactActual.createElement(Text, { testID: 'status-bar' }, 'status-bar') }
})

vi.mock('react-native-gesture-handler', async () => {
  const { View } = await import('../test/react-native')
  return { GestureHandlerRootView: View }
})

vi.mock('react-native-keyboard-controller', async () => {
  const ReactActual = await import('react')
  return {
    KeyboardProvider: ({
      children,
      preload,
    }: {
      children: React.ReactNode
      preload?: boolean
    }) => {
      mockState.keyboardProvider.lastProps = { preload }
      return ReactActual.createElement(ReactActual.Fragment, null, children)
    },
  }
})

vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('../test/react-native')
  return { SafeAreaProvider: View }
})

vi.mock('@tanstack/react-query', async () => {
  const ReactActual = await import('react')
  return {
    focusManager: { setFocused: vi.fn() },
    QueryClient: class {
      constructor(_options: unknown) {}
    },
    QueryClientProvider: ({ children }: { children: React.ReactNode }) => (
      ReactActual.createElement(ReactActual.Fragment, null, children)
    ),
  }
})

vi.mock('nativewind', () => ({
  useColorScheme: () => ({ setColorScheme: vi.fn() }),
  vars: (values: Record<string, string>) => values,
}))

vi.mock('react-i18next', async () => {
  const ReactActual = await import('react')
  return {
    I18nextProvider: ({ children }: { children: React.ReactNode }) => (
      ReactActual.createElement(ReactActual.Fragment, null, children)
    ),
    useTranslation: () => ({ t: (key: string) => key }),
  }
})

vi.mock('@/components/common/SpectraBackdrop', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../test/react-native')
  return { SpectraBackdrop: () => ReactActual.createElement(Text, { testID: 'spectra-backdrop' }, 'backdrop') }
})
vi.mock('@/components/common/AccountDeletionProgressModal', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../test/react-native')
  return {
    AccountDeletionProgressModal: () => ReactActual.createElement(
      Text,
      { testID: 'account-deletion-progress' },
      'account-deletion-progress',
    ),
  }
})
vi.mock('@/components/common/AppUpdateGate', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../test/react-native')
  return {
    AppUpdateGate: () => ReactActual.createElement(
      Text,
      { testID: 'app-update-gate' },
      'app-update-gate',
    ),
  }
})

vi.mock('@/lib/i18n', () => ({ default: {} }))

vi.mock('@/lib/i18n/native', () => ({
  patchReactNativeAlerts: vi.fn(),
}))

const colors = {
  background: '#000',
  backgroundSecondary: '#111',
  backgroundTertiary: '#222',
  border: '#333',
  borderLight: '#444',
  error: '#f00',
  errorLight: '#fee',
  gold: '#fc0',
  info: '#09f',
  infoLight: '#def',
  messageReceived: '#222',
  messageSent: '#084',
  primary: '#0f9',
  primaryDark: '#0a6',
  primaryLight: '#9fc',
  statusBarStyle: 'light',
  success: '#0c6',
  successLight: '#dfd',
  surface: '#111',
  surfaceActive: '#333',
  surfaceHover: '#222',
  text: '#fff',
  textMuted: '#999',
  textOnPrimary: '#000',
  textSecondary: '#ccc',
  textTertiary: '#aaa',
  warning: '#fa0',
  warningLight: '#fed',
}

vi.mock('@/lib/theme', () => ({
  darkColors: colors,
  lightColors: colors,
  spectreColors: colors,
  useIsSpectreThemeActive: () => mockState.spectre.enabled,
  useThemeColors: () => colors,
}))

vi.mock('@/store/authStore', () => {
  const useAuthStore = (selector: (state: typeof mockState.auth) => unknown) => selector(mockState.auth)
  useAuthStore.getState = () => mockState.auth
  return { useAuthStore }
})

vi.mock('@/store/chatStore', () => {
  const useChatStore = (selector: (state: typeof mockState.chat) => unknown) => selector(mockState.chat)
  useChatStore.getState = () => mockState.chat
  return { useChatStore }
})

vi.mock('@/store/spectreStore', () => {
  const useSpectreStore = (selector: (state: typeof mockState.spectre) => unknown) => selector(mockState.spectre)
  useSpectreStore.getState = () => mockState.spectre
  return { useSpectreStore }
})

vi.mock('@/store/walletStore', () => {
  const useWalletStore = (selector: (state: typeof mockState.wallet) => unknown) => selector(mockState.wallet)
  useWalletStore.getState = () => mockState.wallet
  return { useWalletStore }
})

vi.mock('@/store/uiStore', () => {
  const useUIStore = (selector: (state: typeof mockState.ui) => unknown) => selector(mockState.ui)
  useUIStore.getState = () => mockState.ui
  return { useUIStore }
})

vi.mock('@/services/tor/torStore', () => {
  const useTorStore = (selector?: (state: typeof mockState.tor) => unknown) => (
    selector ? selector(mockState.tor) : mockState.tor
  )
  useTorStore.getState = () => mockState.tor
  return { useTorStore }
})

vi.mock('@/services/tor/torConstants', () => ({
  TOR_CONFIG: { BACKGROUND_GRACE_PERIOD_MS: 3_600_000 },
}))

vi.mock('@/services/security/spectreRuntime', () => mockState.spectreRuntime)
vi.mock('@/services/security/spectreMode', () => mockState.spectreMode)

vi.mock('@/services/backend/spectreAccess', () => mockState.spectreAccess)
vi.mock('@/services/backend/appUpdatePolicy', () => mockState.appUpdate)

vi.mock('@/services/security/appSwitcherPrivacy', () => ({
  getAppSwitcherPrivacyEnabled: mockState.privacy.getAppSwitcherPrivacyEnabled,
  subscribeToAppSwitcherPrivacy: (listener: (enabled: boolean) => void) => {
    mockState.privacy.listener = listener
    return mockState.privacy.unsubscribe
  },
}))

vi.mock('@/services/security/screenCaptureProtection', () => ({
  setRootScreenCaptureProtectionEnabled: mockState.screenCapture.setRootScreenCaptureProtectionEnabled,
  subscribeToSensitiveScreenProtection: (listener: (enabled: boolean) => void) => {
    mockState.screenCapture.sensitiveListener = listener
    listener(false)
    return mockState.screenCapture.sensitiveUnsubscribe
  },
}))

vi.mock('@/services/security/screenshotProtection', () => ({
  getScreenshotProtectionEnabled: mockState.screenshot.getScreenshotProtectionEnabled,
  subscribeToScreenshotProtection: (listener: (enabled: boolean) => void) => {
    mockState.screenshot.listener = listener
    return mockState.screenshot.unsubscribe
  },
}))

vi.mock('@/services/tor/torService', () => mockState.torService)

vi.mock('@/services/notifications/pushService', () => mockState.push)
vi.mock('@/services/notifications/registrationCoordinator', () => mockState.registration)
vi.mock('@/services/notifications/notificationCoordinator', () => mockState.notificationCoordinator)

vi.mock('@/services/security/dataProtection', () => mockState.dataProtection)
vi.mock('@/services/call/callActivityGate', () => ({
  hasActiveCallActivity: () => mockState.callActivity.active,
}))

vi.mock('@/services/security/installLifecycle', () => mockState.installLifecycle)
vi.mock('@/services/security/persistedSensitiveData', () => ({
  hasPendingAccountDeletionOperation:
    mockState.pendingDeletion.hasPendingAccountDeletionOperation,
}))
vi.mock('@/services/accountLifecycle/permanentAccountDeletion', () => ({
  resumePendingAccountDeletionOnStartup:
    mockState.pendingDeletion.resumePendingAccountDeletionOnStartup,
}))

const { act, render, screen } = await import('@testing-library/react-native')
const { default: RootLayout } = await import('../app/_layout')

async function flushEffects() {
  await act(async () => {})
}

describe('RootLayout lifecycle hardening', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.stubGlobal('__DEV__', false)
    mockState.appState.listener = null
    mockState.appUpdate.refreshAppUpdatePolicy.mockClear()
    mockState.auth.exoAddress = 'EXO_ROOT'
    mockState.auth.initializationError = false
    mockState.auth.isAuthenticated = true
    mockState.auth.isCloudAuthVerified = true
    mockState.chat.activeConversationId = null
    mockState.chat.conversations = []
    mockState.callActivity.active = false
    mockState.dataProtection.initializeCachePrivacySettings.mockClear()
    mockState.dataProtection.readAutoLockSettings.mockResolvedValue({ enabled: true, timeoutMs: 1000 })
    mockState.installLifecycle.reconcileSecureStoreForCurrentInstall.mockClear()
    mockState.pendingDeletion.hasPending = false
    mockState.pendingDeletion.hasPendingAccountDeletionOperation.mockReset()
    mockState.pendingDeletion.hasPendingAccountDeletionOperation.mockImplementation(
      async () => mockState.pendingDeletion.hasPending,
    )
    mockState.pendingDeletion.resumePendingAccountDeletionOnStartup.mockClear()
    mockState.interactionTasks = []
    mockState.privacy.enabled = true
    mockState.privacy.getAppSwitcherPrivacyEnabled.mockResolvedValue(true)
    mockState.privacy.listener = null
    mockState.screenCapture.sensitiveListener = null
    mockState.keyboardProvider.lastProps = null
    mockState.screenshot.enabled = true
    mockState.screenshot.getScreenshotProtectionEnabled.mockResolvedValue(true)
    mockState.screenshot.listener = null
    mockState.spectre.enabled = false
    mockState.spectre.isApplying = false
    mockState.spectre.isLoaded = true
    mockState.tor.enabled = false
    mockState.tor.initialized = true
    mockState.tor.status = 'disconnected'
    mockState.ui.appLanguage = null
    mockState.ui.isDarkMode = false
    mockState.wallet.initializationError = false
    mockState.wallet.isVaultUnlocked = true
    mockState.wallet.wallet = { address: 'EXO_ROOT', id: 'root', spectreMode: false }
  })

  it('renders the root stack without requiring missing bundled font assets', () => {
    const view = render(<RootLayout />)

    expect(view.root.findAll((node) => node.props.testID === 'root-stack-screen-index').length)
      .toBeGreaterThan(0)
    expect(mockState.keyboardProvider.lastProps).toEqual({ preload: false })
  })

  it('renders the root stack and runs startup initializers', async () => {
    mockState.tor.enabled = true
    mockState.tor.status = 'connected'

    const view = render(<RootLayout />)
    await flushEffects()

    expect(view.root.findAll((node) => node.props.testID === 'root-stack-screen-index').length)
      .toBeGreaterThan(0)
    expect(view.root.findAll((node) => node.props.testID === 'root-stack-screen-(auth)').length)
      .toBeGreaterThan(0)
    expect(view.root.findAll((node) => node.props.testID === 'root-stack-screen-(main)').length)
      .toBeGreaterThan(0)
    expect(mockState.spectre.initialize).toHaveBeenCalled()
    expect(mockState.installLifecycle.reconcileSecureStoreForCurrentInstall).toHaveBeenCalled()
    expect(mockState.spectreAccess.initializeSpectreAccessState).toHaveBeenCalled()
    expect(mockState.spectreRuntime.initializeSpectreRuntime).toHaveBeenCalled()
    expect(mockState.spectreMode.reconcileSpectreModeOnStartup).toHaveBeenCalled()
    expect(mockState.auth.initialize).toHaveBeenCalled()
    expect(mockState.wallet.initialize).toHaveBeenCalled()
    expect(mockState.ui.loadSettings).toHaveBeenCalled()
    expect(mockState.tor.initialize).toHaveBeenCalled()
    expect(mockState.push.initializeNotificationResponseHandling).toHaveBeenCalled()
    expect(mockState.torService.ensureTorReady).toHaveBeenCalledWith({
      reason: 'startup',
    })
    expect(mockState.tor.requestPresenceGate).not.toHaveBeenCalled()
    expect(mockState.appUpdate.refreshAppUpdatePolicy).toHaveBeenCalled()
  })

  it('blocks account runtime startup while deletion recovery remains pending', async () => {
    mockState.pendingDeletion.hasPending = true
    mockState.tor.enabled = true
    mockState.tor.status = 'connected'

    render(<RootLayout />)
    await flushEffects()

    expect(mockState.pendingDeletion.resumePendingAccountDeletionOnStartup).toHaveBeenCalled()
    expect(mockState.tor.initialize).toHaveBeenCalled()
    expect(mockState.torService.ensureTorReady).toHaveBeenCalled()
    expect(mockState.auth.initialize).not.toHaveBeenCalled()
    expect(mockState.wallet.initialize).not.toHaveBeenCalled()
    expect(mockState.notificationCoordinator.consumePendingMessagingNotifications)
      .not.toHaveBeenCalled()
  })

  it('applies screenshot protection preferences and removes root protection on unmount', async () => {
    mockState.screenshot.getScreenshotProtectionEnabled.mockResolvedValue(false)

    const view = render(<RootLayout />)
    await flushEffects()
    view.unmount()

    expect(mockState.screenCapture.setRootScreenCaptureProtectionEnabled)
      .toHaveBeenCalledWith(true)
    expect(mockState.screenCapture.setRootScreenCaptureProtectionEnabled)
      .toHaveBeenCalledWith(false)
  })

  it('applies root screenshot protection when the active peer requires it', async () => {
    mockState.screenshot.getScreenshotProtectionEnabled.mockResolvedValue(false)
    mockState.chat.activeConversationId = 'conversation-1'
    mockState.chat.conversations = [{
      id: 'conversation-1',
      remoteScreenshotProtection: true,
    }]

    render(<RootLayout />)
    await flushEffects()

    expect(mockState.screenCapture.setRootScreenCaptureProtectionEnabled)
      .toHaveBeenCalledWith(true)
  })

  it('shows app switcher privacy while inactive and hides it after foreground grace', async () => {
    vi.useFakeTimers()
    render(<RootLayout />)
    await flushEffects()

    await act(async () => {
      mockState.appState.listener?.('inactive')
    })
    expect(screen.getByText('Spectra Locked')).toBeTruthy()

    await act(async () => {
      mockState.appState.listener?.('active')
      vi.advanceTimersByTime(250)
    })
    expect(() => screen.getByText('Spectra Locked')).toThrow()
    vi.useRealTimers()
  })

  it('forces app switcher privacy while a sensitive screen is active', async () => {
    mockState.privacy.getAppSwitcherPrivacyEnabled.mockResolvedValue(false)
    render(<RootLayout />)
    await flushEffects()

    await act(async () => {
      mockState.screenCapture.sensitiveListener?.(true)
      mockState.appState.listener?.('inactive')
    })

    expect(screen.getByText('Spectra Locked')).toBeTruthy()
  })

  it('cancels pending Tor shutdown on foreground within the one-hour grace period and stops after it expires', async () => {
    vi.useFakeTimers()
    mockState.tor.enabled = true
    mockState.tor.status = 'connected'

    render(<RootLayout />)
    await flushEffects()
    mockState.torService.ensureTorReady.mockClear()
    mockState.tor.requestPresenceGate.mockClear()

    await act(async () => {
      mockState.appState.listener?.('background')
      vi.advanceTimersByTime(3_599_999)
      mockState.appState.listener?.('active')
    })
    expect(mockState.torService.stopTor).not.toHaveBeenCalled()
    expect(mockState.torService.ensureTorReady).toHaveBeenCalledWith({
      reason: 'foreground_resume',
    })
    expect(mockState.tor.requestPresenceGate).not.toHaveBeenCalled()

    await act(async () => {
      mockState.appState.listener?.('background')
      vi.advanceTimersByTime(3_600_000)
    })
    expect(mockState.torService.stopTor).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('opens the Tor recovery gate only after foreground validation reaches an error state', async () => {
    mockState.tor.enabled = true
    mockState.tor.status = 'connected'

    render(<RootLayout />)
    await flushEffects()
    mockState.torService.ensureTorReady.mockClear()
    mockState.tor.requestPresenceGate.mockClear()
    mockState.torService.ensureTorReady.mockImplementationOnce(async () => {
      mockState.tor.status = 'error'
      return false
    })

    await act(async () => {
      mockState.appState.listener?.('background')
      mockState.appState.listener?.('active')
    })
    await flushEffects()

    expect(mockState.torService.ensureTorReady).toHaveBeenCalledWith({
      reason: 'foreground_resume',
    })
    expect(mockState.tor.requestPresenceGate).toHaveBeenCalledWith('foreground_resume')
  })

  it('retries a retained call response after foregrounding an unlocked vault', async () => {
    render(<RootLayout />)
    await flushEffects()
    mockState.push.consumeLastCallNotificationResponse.mockClear()
    mockState.registration.synchronizeActiveWalletPushRegistration.mockClear()

    await act(async () => {
      mockState.appState.listener?.('background')
      mockState.appState.listener?.('active')
    })
    await flushEffects()

    expect(mockState.push.consumeLastCallNotificationResponse).toHaveBeenCalledOnce()
    expect(mockState.registration.synchronizeActiveWalletPushRegistration).toHaveBeenCalledOnce()
  })

  it('retries a retained call response when authentication and the vault become ready', async () => {
    mockState.auth.isAuthenticated = false
    mockState.wallet.isVaultUnlocked = false
    const view = render(<RootLayout />)
    await flushEffects()

    expect(mockState.push.consumeLastCallNotificationResponse).not.toHaveBeenCalled()

    mockState.auth.isAuthenticated = true
    mockState.wallet.isVaultUnlocked = true
    view.unmount()
    render(<RootLayout />)
    await flushEffects()

    expect(mockState.push.consumeLastCallNotificationResponse).toHaveBeenCalledOnce()
  })

  it('registers or deregisters push tokens based on Spectre state', async () => {
    const view = render(<RootLayout />)
    await flushEffects()

    expect(mockState.registration.synchronizeActiveWalletPushRegistration).toHaveBeenCalledOnce()

    mockState.spectre.enabled = true
    view.update(<RootLayout />)
    await flushEffects()

    expect(mockState.push.schedulePrivateTransportPushTokenCleanup).toHaveBeenCalledWith([
      'EXO_ROOT',
    ])

    mockState.push.schedulePrivateTransportPushTokenCleanup.mockClear()
    mockState.spectre.enabled = false
    mockState.tor.enabled = true
    view.update(<RootLayout />)
    await flushEffects()

    expect(mockState.push.schedulePrivateTransportPushTokenCleanup).toHaveBeenCalledWith([
      'EXO_ROOT',
    ])
  })

  it('refreshes push registration when the selected app language changes', async () => {
    const view = render(<RootLayout />)
    await flushEffects()

    expect(mockState.registration.synchronizeActiveWalletPushRegistration).toHaveBeenCalledTimes(1)

    mockState.ui.appLanguage = 'es'
    view.update(<RootLayout />)
    await flushEffects()

    expect(mockState.registration.synchronizeActiveWalletPushRegistration).toHaveBeenCalledTimes(2)
  })

  it('does not initialize push infrastructure before Tor preferences hydrate', async () => {
    mockState.tor.initialized = false
    const view = render(<RootLayout />)
    await flushEffects()

    expect(mockState.registration.synchronizeActiveWalletPushRegistration).not.toHaveBeenCalled()

    mockState.tor.initialized = true
    view.update(<RootLayout />)
    await flushEffects()

    expect(mockState.registration.synchronizeActiveWalletPushRegistration).toHaveBeenCalledOnce()
  })

  it('locks the active session after the auto-lock deadline', async () => {
    vi.useFakeTimers()

    render(<RootLayout />)
    await flushEffects()

    await act(async () => {
      mockState.appState.listener?.('background')
      vi.advanceTimersByTime(1500)
      mockState.appState.listener?.('active')
    })
    await flushEffects()

    expect(mockState.dataProtection.lockActiveSession).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('keeps an active call unlocked after the auto-lock deadline', async () => {
    vi.useFakeTimers()
    mockState.callActivity.active = true

    render(<RootLayout />)
    await flushEffects()

    await act(async () => {
      mockState.appState.listener?.('background')
      vi.advanceTimersByTime(1500)
      mockState.appState.listener?.('active')
    })
    await flushEffects()

    expect(mockState.dataProtection.lockActiveSession).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
