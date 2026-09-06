/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  accountReadiness: {
    wallet: null as any,
  },
  ephemeralDiscovery: {
    activeContactCard: null as null | { expiresAt: number; walletAddress?: string },
  },
  auth: {
    isAuthenticated: true,
    isCloudAuthVerified: true,
    isIdentityBound: true,
    isInitialized: true,
    session: null as null | { accessToken: string; expiresAt: number },
    secureAccess: {
      phase: 'idle' as string,
      failure: null as string | null,
      retryable: false,
    },
    setIdentityBound: vi.fn(),
    setSessionExpired: vi.fn(),
  },
  chat: {
    conversations: [] as Array<any>,
    isInitialized: false,
    isInitializing: false,
    loadCachedContactsList: vi.fn(async () => {}),
    loadCachedConversationsList: vi.fn(async () => {}),
    loadCachedGroupConversations: vi.fn(async () => []),
    prewarmRecentDirectMessages: vi.fn(async () => {}),
    cleanupChat: vi.fn(),
    waitForChatQuiescence: vi.fn(async () => undefined),
    initializeChat: vi.fn(async () => {}),
    reconcileChat: vi.fn(async () => {}),
    reset: vi.fn(),
    setStorageScope: vi.fn(),
  },
  group: {
    groups: [] as Array<any>,
    reset: vi.fn(),
  },
  pathname: '/(main)/(tabs)/chats',
  quantumChat: {
    getIdentity: vi.fn(() => ({ id: 'identity-local' })),
    isQuantumChatInitialized: vi.fn(() => true),
    waitForQuantumChatIdentity: vi.fn(async () => true),
    syncBundleServerAccessToken: vi.fn(),
    syncRealtimeSubscriptionForTransport: vi.fn(),
    pollForNewMessages: vi.fn(async () => ({ fullResyncCompleted: true })),
    catchUpMailboxForBoundSession: vi.fn(),
    whenInitialMailboxCatchupSettled: vi.fn(async () => {}),
  },
  activeDiscovery: {
    ensureActiveDiscoveryRent: vi.fn(async () => {}),
  },
  router: {
    navigate: vi.fn(),
    replace: vi.fn(),
  },
  security: {
    cancelSpectreActivation: vi.fn(async () => {}),
    disableSpectreMode: vi.fn(async () => {}),
  },
  spectre: {
    activationError: null as null | string,
    activationFlow: null as null | 'enable',
    activationPhase: null as null | string,
    activationStartedAt: null as null | number,
    completeActivation: vi.fn(),
    enabled: false,
    failActivation: vi.fn(),
    isApplying: false,
    resetActivationProgress: vi.fn(),
    setActivationPhase: vi.fn(),
  },
  storage: {
    prepareAsyncStorageScope: vi.fn(async () => {}),
    setActiveGroupStorageScope: vi.fn(),
    setAsyncStorageScope: vi.fn(),
  },
  backendAuth: {
    BACKEND_BINDING_RETRY_COOLDOWN_MS: 15_000,
    bindVerifiedBackendIdentity: vi.fn(async () => true),
    ensureVerifiedBackendAccess: vi.fn(async () => ({ accessToken: 'cloud' })),
    ensureVerifiedBackendAccessForIdentity: vi.fn(async () => ({
      accessToken: 'cloud',
      identityId: 'identity-local',
    })),
    recoverBoundSessionOnForeground: vi.fn(async () => ({
      accessToken: 'cloud',
      identityId: 'identity-local',
    })),
    repairBackendIdentityBinding: vi.fn(async () => ({
      accessToken: 'cloud',
      identityId: 'identity-local',
    })),
    resetAuthCooldowns: vi.fn(),
  },
  onboarding: {
    clearDeferredContactProfileName: vi.fn(),
    deferredContactProfileName: null as null | {
      walletAddress: string
      displayName: string
    },
  },
  contactProfile: {
    updateOwnContactProfile: vi.fn(async () => ({})),
  },
  accountRuntime: {
    abortListeners: [] as Array<() => void>,
    abortActiveAccountRuntime: vi.fn(() => {
      for (const listener of mockState.accountRuntime.abortListeners) {
        listener()
      }
    }),
    registerAccountRuntimeAbortListener: vi.fn((listener: () => void) => {
      mockState.accountRuntime.abortListeners.push(listener)
      return () => {
        mockState.accountRuntime.abortListeners = mockState.accountRuntime.abortListeners.filter(
          (entry) => entry !== listener,
        )
      }
    }),
    registerAccountRuntimeResetListener: vi.fn(() => () => undefined),
  },
  timers: {
    interactionTasks: [] as Array<{ cancel: () => void }>,
  },
  appStateListeners: [] as Array<(state: string) => void>,
  tor: {
    dismissPresenceGate: vi.fn(),
    enabled: false,
    presenceGateReason: null as null | 'startup' | 'foreground_resume',
    setEnabled: vi.fn(async (enabled: boolean) => {
      mockState.tor.enabled = enabled
    }),
    startTor: vi.fn(async () => {}),
    status: 'disconnected',
    stopTor: vi.fn(async () => {}),
  },
  wallet: {
    hasWallet: true,
    initializationError: false,
    isLoading: false,
    isVaultUnlocked: true,
    wallet: {
      address: 'EXO_ACTIVE',
      spectreMode: false,
    } as any,
    wallets: [] as any[],
  },
  walletIndexDelivery: {
    useWalletIndexDelivery: vi.fn(),
  },
}))

const runtimeModules = vi.hoisted(() => {
  let chatServiceGate: Promise<void> | null = null
  let releaseChatServiceGate: (() => void) | null = null
  const chatServiceModule = () => ({
    cleanupChat: mockState.chat.cleanupChat,
    waitForChatQuiescence: mockState.chat.waitForChatQuiescence,
    initializeChat: mockState.chat.initializeChat,
    loadCachedContactsList: mockState.chat.loadCachedContactsList,
    loadCachedConversationsList: mockState.chat.loadCachedConversationsList,
    loadCachedGroupConversations: mockState.chat.loadCachedGroupConversations,
    prewarmRecentDirectMessages: mockState.chat.prewarmRecentDirectMessages,
    reconcileChat: mockState.chat.reconcileChat,
  })

  return {
    holdChatService() {
      chatServiceGate = new Promise<void>((resolve) => {
        releaseChatServiceGate = resolve
      })
    },
    releaseChatService() {
      releaseChatServiceGate?.()
      chatServiceGate = null
      releaseChatServiceGate = null
    },
    async getChatServiceModule() {
      if (chatServiceGate) {
        await chatServiceGate
      }
      return chatServiceModule()
    },
    getBackendAuthModule: async () => mockState.backendAuth,
    getQuantumChatModule: async () => mockState.quantumChat,
    getActiveDiscoveryModule: async () => mockState.activeDiscovery,
    preloadChatRuntimeModules: vi.fn(),
  }
})

vi.mock('react-native', async () => {
  const rn = await import('../../test/react-native')
  return {
    ...rn,
    AppState: {
      currentState: 'active',
      addEventListener: (_event: string, listener: (state: string) => void) => {
        mockState.appStateListeners.push(listener)
        return {
          remove: () => {
            mockState.appStateListeners = mockState.appStateListeners.filter(
              (entry) => entry !== listener,
            )
          },
        }
      },
    },
    InteractionManager: {
      runAfterInteractions: (callback: () => void) => {
        callback()
        const task = { cancel: vi.fn() }
        mockState.timers.interactionTasks.push(task)
        return task
      },
    },
  }
})

vi.mock('expo-router', async () => {
  const ReactActual = await import('react')
  const { Text, View } = await import('../../test/react-native')
  const Stack = ({ children, screenOptions }: { children: React.ReactNode; screenOptions?: Record<string, unknown> }) => (
    ReactActual.createElement(View, { screenOptions, testID: 'main-stack' }, children)
  )
  Stack.Screen = ({ name, options }: { name: string; options?: Record<string, unknown> }) => (
    ReactActual.createElement(Text, { options, testID: `stack-screen-${name}` }, name)
  )

  return {
    Redirect: ({ href }: { href: string }) => (
      ReactActual.createElement(Text, { testID: 'redirect' }, href)
    ),
    Stack,
    usePathname: () => mockState.pathname,
    useRouter: () => mockState.router,
  }
})

vi.mock('react-native-safe-area-context', async () => {
  const ReactActual = await import('react')
  return {
    SafeAreaInsetsContext: ReactActual.createContext({ bottom: 0, left: 0, right: 0, top: 0 }),
    useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 10 }),
  }
})

vi.mock('@/contexts', async () => {
  const ReactActual = await import('react')
  return {
    CallProvider: ({ children }: { children: React.ReactNode }) => (
      ReactActual.createElement(ReactActual.Fragment, null, children)
    ),
    useCallPresentation: () => ({
      showMinimizedBanner: false,
      pendingCallRecoveryPhase: null,
      callState: null,
    }),
  }
})

vi.mock('@/contexts/TopChromeContext', async () => {
  const ReactActual = await import('react')
  return {
    TopChromeHeightProvider: ({ children }: { children: React.ReactNode }) => (
      ReactActual.createElement(ReactActual.Fragment, null, children)
    ),
  }
})

vi.mock('@/hooks/useWalletIndexDelivery', () => ({
  useWalletIndexDelivery: mockState.walletIndexDelivery.useWalletIndexDelivery,
}))

vi.mock('@/components/AccountSwitchReadinessBanner', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../test/react-native')
  return {
    AccountSwitchReadinessBanner: () => ReactActual.createElement(Text, { testID: 'account-readiness-banner' }, 'account-readiness'),
  }
})

vi.mock('@/components/chat/CallPresentationHost', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../test/react-native')
  return {
    FullscreenCallHost: () => ReactActual.createElement(Text, { testID: 'fullscreen-call' }, 'fullscreen'),
    MinimizedCallBannerHost: () => ReactActual.createElement(Text, { testID: 'minimized-call' }, 'minimized'),
    PendingCallRecoveryBannerHost: () => ReactActual.createElement(Text, { testID: 'pending-call-recovery' }, 'pending'),
  }
})

vi.mock('@/components/common/SpectreActivationModal', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text } = await import('../../test/react-native')
  return {
    SpectreActivationModal: ({ onClose, visible }: { onClose: () => void; visible: boolean }) => visible
      ? ReactActual.createElement(Pressable, { onPress: onClose, testID: 'spectre-modal' }, ReactActual.createElement(Text, null, 'spectre-modal'))
      : null,
  }
})

vi.mock('@/components/common/VdfProgressBanner', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../test/react-native')
  return {
    VdfProgressBanner: ({ includeTopInset }: { includeTopInset?: boolean }) => (
      ReactActual.createElement(
        Text,
        { testID: 'vdf-progress-banner', includeTopInset: String(includeTopInset) },
        'vdf-progress',
      )
    ),
  }
})

vi.mock('@/components/chat/MailboxCatchupBanner', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../test/react-native')
  return {
    MailboxCatchupBanner: ({ includeTopInset }: { includeTopInset?: boolean }) => (
      ReactActual.createElement(
        Text,
        { testID: 'mailbox-catchup-banner', includeTopInset: String(includeTopInset) },
        'mailbox-catchup',
      )
    ),
  }
})

vi.mock('@/components/common/ActiveContactCardBanner', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../test/react-native')
  return {
    ActiveContactCardBanner: () => (
      ReactActual.createElement(Text, { testID: 'active-contact-card-banner' }, 'contact-card')
    ),
  }
})

vi.mock('@/components/common/ContactCardShareModal', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../test/react-native')
  return {
    ContactCardShareModal: () => (
      ReactActual.createElement(Text, { testID: 'contact-card-share-modal' }, 'contact-card-modal')
    ),
  }
})

vi.mock('@/components/common/SpectreBlockedRoute', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../test/react-native')
  return {
    SpectreBlockedRoute: () => ReactActual.createElement(
      Text,
      { testID: 'spectre-blocked-route' },
      'spectre-blocked-route',
    ),
  }
})

vi.mock('@/components/tor/TorReconnectGate', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text, View } = await import('../../test/react-native')
  return {
    TorReconnectGate: ({
      onConfigureBridges,
      onDisconnectTor,
      onDismissError,
      onRetry,
      disconnectLabel,
      visible,
    }: {
      onConfigureBridges: () => void
      onDisconnectTor: () => void
      onDismissError?: () => void
      onRetry: () => void
      disconnectLabel?: string
      visible: boolean
    }) => visible ? (
      ReactActual.createElement(
        View,
        { testID: 'tor-gate' },
        ReactActual.createElement(Pressable, { onPress: onRetry, testID: 'tor-retry' }, ReactActual.createElement(Text, null, 'retry')),
        ReactActual.createElement(Pressable, { onPress: onConfigureBridges, testID: 'tor-configure' }, ReactActual.createElement(Text, null, 'configure')),
        ReactActual.createElement(Pressable, { onPress: onDisconnectTor, testID: 'tor-disconnect' }, ReactActual.createElement(Text, null, disconnectLabel ?? 'disconnect')),
        onDismissError
          ? ReactActual.createElement(Pressable, { onPress: onDismissError, testID: 'tor-dismiss' }, ReactActual.createElement(Text, null, 'dismiss'))
          : null,
      )
    ) : null,
  }
})

vi.mock('@/components/tor/TorStatusBanner', async () => {
  const ReactActual = await import('react')
  const { Pressable, Text } = await import('../../test/react-native')
  return {
    TorStatusBanner: ({
      disconnecting,
      onDisconnect,
    }: {
      disconnecting?: boolean
      onDisconnect: () => void
    }) => (
      ReactActual.createElement(
        Pressable,
        { disabled: disconnecting, onPress: onDisconnect, testID: 'tor-banner-disconnect' },
        ReactActual.createElement(Text, null, 'tor-banner'),
      )
    ),
  }
})

vi.mock('@/components/tor/torPresenceState', () => ({
  TOR_BRIDGES_ROUTE: '/(main)/settings/tor-bridges',
  canOpenTorBridges: (pathname: string, navigationPending: boolean) => !navigationPending && pathname !== '/(main)/settings/tor-bridges',
  getTopChromeAwareTopInset: (topInset: number, topChromeVisible: boolean) => (topChromeVisible ? 0 : topInset),
  shouldShowTorReconnectGate: ({ enabled, presenceGateReason, status }: { enabled: boolean; presenceGateReason: string | null; status: string }) => (
    enabled && presenceGateReason !== null && status === 'error'
  ),
}))

vi.mock('@/lib/errorDisplay', () => ({
  getErrorDisplayMessage: (error: Error) => error.message,
  shouldShowErrorDetails: () => false,
}))

vi.mock('@/lib/i18n', async () => {
  const { translateForTest } = await import('../../test/mainAppMocks')
  return { translate: translateForTest }
})

vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../test/mainAppMocks')
  return { useThemeColors: () => testColors }
})

vi.mock('@/services/tor', () => ({
  startTor: mockState.tor.startTor,
  stopTor: mockState.tor.stopTor,
}))

vi.mock('@/services/security/spectreMode', () => ({
  cancelSpectreActivation: mockState.security.cancelSpectreActivation,
  disableSpectreMode: mockState.security.disableSpectreMode,
}))

vi.mock('@/services/tor/torStore', () => {
  const useTorStore = (selector: (state: typeof mockState.tor) => unknown) => selector(mockState.tor)
  useTorStore.getState = () => mockState.tor
  return { useTorStore }
})

vi.mock('@/services/backend/session', () => mockState.backendAuth)

vi.mock('@/services/quantumChat', () => mockState.quantumChat)

vi.mock('@/services/chat/contactProfile', () => ({
  updateOwnContactProfile: mockState.contactProfile.updateOwnContactProfile,
}))

vi.mock('@/services/shared/accountRuntimeLifecycle', () => (
  mockState.accountRuntime
))

vi.mock('@spectra/core-crypto', () => ({
  normalizeContactProfileDisplayName: (value: string) => value.trim(),
}))

vi.mock('@/services/chat', () => ({
  cleanupChat: mockState.chat.cleanupChat,
  waitForChatQuiescence: mockState.chat.waitForChatQuiescence,
  initializeChat: mockState.chat.initializeChat,
  loadCachedContactsList: mockState.chat.loadCachedContactsList,
  loadCachedConversationsList: mockState.chat.loadCachedConversationsList,
  loadCachedGroupConversations: mockState.chat.loadCachedGroupConversations,
  prewarmRecentDirectMessages: mockState.chat.prewarmRecentDirectMessages,
  reconcileChat: mockState.chat.reconcileChat,
}))

vi.mock('@/services/chat/preloadRuntimeModules', () => ({
  getChatServiceModule: runtimeModules.getChatServiceModule,
  getBackendAuthModule: runtimeModules.getBackendAuthModule,
  getQuantumChatModule: runtimeModules.getQuantumChatModule,
  getActiveDiscoveryModule: runtimeModules.getActiveDiscoveryModule,
  preloadChatRuntimeModules: runtimeModules.preloadChatRuntimeModules,
}))

vi.mock('@/services/storage', () => ({
  prepareAsyncStorageScope: mockState.storage.prepareAsyncStorageScope,
  setAsyncStorageScope: mockState.storage.setAsyncStorageScope,
}))

vi.mock('@/services/groupChat/storage', () => ({
  setActiveGroupStorageScope: mockState.storage.setActiveGroupStorageScope,
}))

vi.mock('@/store/authStore', () => {
  const useAuthStore = (selector: (state: typeof mockState.auth) => unknown) => selector(mockState.auth)
  useAuthStore.getState = () => mockState.auth
  return { useAuthStore }
})

vi.mock('@/store/walletStore', () => {
  const useWalletStore = (selector: (state: typeof mockState.wallet) => unknown) => selector(mockState.wallet)
  useWalletStore.getState = () => mockState.wallet
  return { useWalletStore }
})

vi.mock('@/store/chatStore', () => {
  const useChatStore = (selector: (state: typeof mockState.chat) => unknown) => selector(mockState.chat)
  useChatStore.getState = () => mockState.chat
  return { useChatStore }
})

vi.mock('@/store/groupChatStore', () => ({
  useGroupChatStore: (selector: (state: typeof mockState.group) => unknown) => selector(mockState.group),
}))

vi.mock('@/store/spectreStore', () => {
  const useSpectreStore = (selector: (state: typeof mockState.spectre) => unknown) => selector(mockState.spectre)
  useSpectreStore.getState = () => mockState.spectre
  return { useSpectreStore }
})

vi.mock('@/store/accountReadinessStore', () => ({
  useAccountReadinessStore: (selector: (state: typeof mockState.accountReadiness) => unknown) => selector(mockState.accountReadiness),
}))

vi.mock('@/store/ephemeralDiscoveryStore', () => ({
  isScopedActiveContactCard: (
    card: { expiresAt: number; walletAddress?: string } | null,
    walletAddress: string | null | undefined,
    now = Date.now(),
  ) => Boolean(
    card
    && walletAddress
    && card.expiresAt > now
    && String(card.walletAddress ?? walletAddress).toLowerCase() === walletAddress.toLowerCase()
  ),
  useEphemeralDiscoveryStore: (selector: (state: typeof mockState.ephemeralDiscovery) => unknown) => (
    selector(mockState.ephemeralDiscovery)
  ),
}))

vi.mock('@/store/onboardingStore', () => {
  const useOnboardingStore = (selector: (state: typeof mockState.onboarding) => unknown) => (
    selector(mockState.onboarding)
  )
  useOnboardingStore.getState = () => mockState.onboarding
  return { useOnboardingStore }
})

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const {
  default: MainLayout,
  resetChatBootstrapSharedState,
} = await import('../../app/(main)/_layout')
const { useMailboxCatchupBannerStore } = await import('@/store/mailboxCatchupBannerStore')
const { useVdfActivityStore } = await import('@/store/vdfActivityStore')
const { useVdfBannerPreferenceStore } = await import('@/store/vdfBannerPreferenceStore')
const { beginVdfActivity } = await import('@/services/shared/vdfActivity')

async function flushEffects() {
  await act(async () => {})
}

describe('MainLayout route guard and bootstrap decisions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('__DEV__', false)
    runtimeModules.releaseChatService()
    resetChatBootstrapSharedState()
    mockState.accountReadiness.wallet = null
    mockState.ephemeralDiscovery.activeContactCard = null
    mockState.auth = {
      isAuthenticated: true,
      isCloudAuthVerified: true,
      isIdentityBound: true,
      isInitialized: true,
      session: null,
      secureAccess: {
        phase: 'idle',
        failure: null,
        retryable: false,
      },
      setIdentityBound: mockState.auth.setIdentityBound,
      setSessionExpired: mockState.auth.setSessionExpired,
    }
    mockState.chat.conversations = []
    mockState.chat.isInitialized = false
    mockState.chat.isInitializing = false
    useMailboxCatchupBannerStore.getState().reset()
    useVdfActivityStore.getState().reset()
    useVdfBannerPreferenceStore.setState({ visible: false, hydrated: true })
    mockState.group.groups = []
    mockState.pathname = '/(main)/(tabs)/chats'
    mockState.spectre.activationError = null
    mockState.spectre.activationFlow = null
    mockState.spectre.activationPhase = null
    mockState.spectre.activationStartedAt = null
    mockState.spectre.enabled = false
    mockState.spectre.isApplying = false
    mockState.timers.interactionTasks = []
    mockState.appStateListeners = []
    mockState.tor.enabled = false
    mockState.tor.presenceGateReason = null
    mockState.tor.status = 'disconnected'
    mockState.wallet = {
      hasWallet: true,
      initializationError: false,
      isLoading: false,
      isVaultUnlocked: true,
      wallet: {
        address: 'EXO_ACTIVE',
        spectreMode: false,
      },
      wallets: [],
    }
    mockState.backendAuth.ensureVerifiedBackendAccess.mockResolvedValue({ accessToken: 'cloud' })
    mockState.backendAuth.ensureVerifiedBackendAccessForIdentity.mockResolvedValue({
      accessToken: 'cloud',
      identityId: 'identity-local',
    })
    mockState.backendAuth.bindVerifiedBackendIdentity.mockResolvedValue(true)
    mockState.backendAuth.recoverBoundSessionOnForeground.mockResolvedValue({
      accessToken: 'cloud',
      identityId: 'identity-local',
    })
    mockState.chat.initializeChat.mockImplementation(async () => {})
    mockState.chat.loadCachedContactsList.mockImplementation(async () => {})
    mockState.chat.loadCachedConversationsList.mockImplementation(async () => {})
    mockState.chat.loadCachedGroupConversations.mockImplementation(async () => [])
    mockState.quantumChat.isQuantumChatInitialized.mockReturnValue(true)
    mockState.quantumChat.waitForQuantumChatIdentity.mockResolvedValue(true)
    mockState.quantumChat.getIdentity.mockReturnValue({ id: 'identity-local' })
    mockState.quantumChat.whenInitialMailboxCatchupSettled.mockResolvedValue(undefined)
    mockState.onboarding.deferredContactProfileName = null
  })

  it('shows loading before stores are ready and redirects unauthenticated states', () => {
    mockState.auth.isInitialized = false
    const view = render(<MainLayout />)
    expect(view.root.findAll((node: { type: unknown }) => node.type === 'ActivityIndicator').length)
      .toBeGreaterThan(0)
  })

  it('redirects missing wallets and locked sessions before mounting the main stack', () => {
    mockState.wallet.hasWallet = false
    render(<MainLayout />)
    expect(screen.getByTestId('redirect').props.children).toBe('/(auth)/welcome')

    mockState.wallet.hasWallet = true
    mockState.wallet.isVaultUnlocked = false
    render(<MainLayout />)
    expect(screen.getByTestId('redirect').props.children).toBe('/(auth)/unlock')
  })

  it('registers audited main stack screens for unlocked wallets', async () => {
    render(<MainLayout />)
    await flushEffects()

    expect(screen.getByTestId('stack-screen-(tabs)')).toBeTruthy()
    expect(screen.getByTestId('stack-screen-archived-chats')).toBeTruthy()
    expect(screen.getByTestId('stack-screen-settings/tor-bridges')).toBeTruthy()
    expect(screen.getByTestId('vdf-progress-banner')).toBeTruthy()
    expect(screen.getByTestId('mailbox-catchup-banner')).toBeTruthy()
    expect(screen.getByTestId('contact-card-share-modal')).toBeTruthy()
    expect(screen.getByTestId('main-stack').props.screenOptions).toEqual(
      expect.objectContaining({ gestureEnabled: false }),
    )
    expect(screen.getByTestId('stack-screen-chat/[address]').props.options).toEqual(
      expect.objectContaining({ gestureEnabled: true }),
    )
  })

  it('begins mailbox catch-up chrome on cold chat bootstrap', async () => {
    render(<MainLayout />)
    await flushEffects()

    expect(useMailboxCatchupBannerStore.getState().phase).toBeTruthy()
    expect(screen.getByTestId('mailbox-catchup-banner').props.includeTopInset).toBe('true')
  })

  it('does not begin mailbox catch-up chrome on a warm chat session', async () => {
    mockState.chat.isInitialized = true
    render(<MainLayout />)
    await flushEffects()

    expect(useMailboxCatchupBannerStore.getState().phase).toBeNull()
  })

  it('folds mailbox catch-up inset under the Tor banner', async () => {
    mockState.tor.enabled = true
    render(<MainLayout />)
    await flushEffects()

    expect(screen.getByTestId('mailbox-catchup-banner').props.includeTopInset).toBe('false')
    expect(screen.getByTestId('vdf-progress-banner').props.includeTopInset).toBe('false')
  })

  it('mounts the persistent one-time card banner in top chrome', () => {
    mockState.ephemeralDiscovery.activeContactCard = {
      expiresAt: Date.now() + 60_000,
      walletAddress: 'EXO_ACTIVE',
    }

    render(<MainLayout />)

    expect(screen.getByTestId('active-contact-card-banner')).toBeTruthy()
  })

  it('keeps the contact card banner when VDF work is hidden', () => {
    mockState.ephemeralDiscovery.activeContactCard = {
      expiresAt: Date.now() + 60_000,
      walletAddress: 'EXO_ACTIVE',
    }
    beginVdfActivity({ action: 'claim_session_opk' })

    render(<MainLayout />)

    expect(screen.getByTestId('active-contact-card-banner')).toBeTruthy()
  })

  it('hides the contact card banner while a visible VDF banner is live', () => {
    useVdfBannerPreferenceStore.setState({ visible: true, hydrated: true })
    mockState.ephemeralDiscovery.activeContactCard = {
      expiresAt: Date.now() + 60_000,
      walletAddress: 'EXO_ACTIVE',
    }
    beginVdfActivity({ action: 'claim_session_opk' })

    render(<MainLayout />)

    expect(screen.queryByTestId('active-contact-card-banner')).toBeNull()
  })

  it('blocks wallet and crypto routes while Spectre Mode is active', () => {
    mockState.pathname = '/(main)/crypto/send'
    mockState.spectre.enabled = true

    render(<MainLayout />)

    expect(screen.getByTestId('spectre-blocked-route')).toBeTruthy()
    expect(screen.queryByTestId('main-stack')).toBeNull()
  })

  it('disconnects from the Tor banner and keeps bridge setup in the reconnect gate', async () => {
    mockState.tor.enabled = true
    mockState.tor.presenceGateReason = 'startup'
    mockState.tor.status = 'error'

    render(<MainLayout />)
    await fireEvent.press(screen.getByTestId('tor-configure'))
    await fireEvent.press(screen.getByTestId('tor-retry'))
    await fireEvent.press(screen.getByTestId('tor-banner-disconnect'))
    await flushEffects()

    expect(mockState.router.navigate).toHaveBeenCalledWith('/(main)/settings/tor-bridges')
    expect(mockState.tor.startTor).toHaveBeenCalled()
    expect(mockState.tor.setEnabled).toHaveBeenCalledWith(false)
    expect(mockState.tor.stopTor).toHaveBeenCalled()
    expect(mockState.backendAuth.resetAuthCooldowns).toHaveBeenCalled()
    expect(mockState.quantumChat.syncBundleServerAccessToken).toHaveBeenCalled()
    expect(mockState.tor.dismissPresenceGate).toHaveBeenCalled()
  })

  it('cancels Spectre Mode from the Tor banner when Spectre owns the active route', async () => {
    mockState.spectre.enabled = true
    mockState.tor.enabled = true
    mockState.tor.status = 'connected'

    render(<MainLayout />)

    await fireEvent.press(screen.getByTestId('tor-banner-disconnect'))
    await flushEffects()

    expect(mockState.tor.dismissPresenceGate).toHaveBeenCalled()
    expect(mockState.security.disableSpectreMode).toHaveBeenCalledTimes(1)
    expect(mockState.tor.setEnabled).not.toHaveBeenCalledWith(false)
    expect(mockState.tor.stopTor).not.toHaveBeenCalled()
  })

  it('cancels Spectre Mode from the Tor reconnect gate when Spectre owns a failed Tor route', async () => {
    mockState.spectre.enabled = true
    mockState.tor.enabled = true
    mockState.tor.presenceGateReason = 'foreground_resume'
    mockState.tor.status = 'error'

    render(<MainLayout />)

    expect(screen.getByText('Cancel Spectre Mode')).toBeTruthy()
    expect(screen.queryByTestId('tor-dismiss')).toBeNull()

    await fireEvent.press(screen.getByTestId('tor-disconnect'))
    await flushEffects()

    expect(mockState.tor.dismissPresenceGate).toHaveBeenCalled()
    expect(mockState.security.disableSpectreMode).toHaveBeenCalledTimes(1)
    expect(mockState.tor.setEnabled).not.toHaveBeenCalledWith(false)
    expect(mockState.tor.stopTor).not.toHaveBeenCalled()
  })

  it('renders chats with the Tor banner instead of blocking routine Tor startup', async () => {
    mockState.tor.enabled = true
    mockState.tor.presenceGateReason = 'startup'
    mockState.tor.status = 'connecting'

    render(<MainLayout />)
    await flushEffects()

    expect(screen.getByTestId('stack-screen-(tabs)')).toBeTruthy()
    expect(screen.getByTestId('tor-banner-disconnect')).toBeTruthy()
    expect(screen.queryByTestId('tor-gate')).toBeNull()
    expect(mockState.chat.loadCachedContactsList).toHaveBeenCalled()
    expect(mockState.chat.loadCachedConversationsList).toHaveBeenCalled()
    expect(mockState.chat.loadCachedGroupConversations).toHaveBeenCalledWith('EXO_ACTIVE', {
      allowLegacyMigration: true,
    })
  })

  it('lets Spectre activation own the initial Tor connection surface', () => {
    mockState.spectre.activationFlow = 'enable'
    mockState.spectre.isApplying = true
    mockState.tor.enabled = true
    mockState.tor.presenceGateReason = 'startup'
    mockState.tor.status = 'connecting'

    render(<MainLayout />)

    expect(screen.queryByTestId('tor-gate')).toBeNull()
  })

  it('prepares wallet-scoped chat storage', async () => {
    const view = render(<MainLayout />)
    await flushEffects()

    expect(mockState.storage.setAsyncStorageScope).not.toHaveBeenCalled()
    expect(mockState.storage.setActiveGroupStorageScope).toHaveBeenCalledWith('EXO_ACTIVE')
    expect(mockState.chat.setStorageScope).toHaveBeenCalledWith('EXO_ACTIVE', { allowLegacyMigration: true })
    expect(mockState.storage.prepareAsyncStorageScope).toHaveBeenCalledWith('EXO_ACTIVE', { allowLegacyMigration: true })
    expect(mockState.chat.loadCachedContactsList).toHaveBeenCalled()
    expect(mockState.chat.loadCachedConversationsList).toHaveBeenCalled()
    expect(mockState.chat.loadCachedGroupConversations).toHaveBeenCalledWith('EXO_ACTIVE', {
      allowLegacyMigration: true,
    })
    expect(mockState.chat.prewarmRecentDirectMessages).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
    })
    expect(mockState.chat.initializeChat).toHaveBeenCalled()

    mockState.chat.isInitialized = true
    view.update(<MainLayout />)
    await flushEffects()

    expect(mockState.chat.loadCachedContactsList).toHaveBeenCalledTimes(1)
    expect(mockState.chat.loadCachedConversationsList).toHaveBeenCalledTimes(1)
    expect(mockState.chat.loadCachedGroupConversations).toHaveBeenCalledTimes(1)
    expect(mockState.chat.initializeChat).toHaveBeenCalledTimes(1)
  })

  it('prepares storage while chat modules are still loading', async () => {
    runtimeModules.holdChatService()
    render(<MainLayout />)
    await flushEffects()

    expect(mockState.storage.prepareAsyncStorageScope).toHaveBeenCalledWith('EXO_ACTIVE', {
      allowLegacyMigration: true,
    })
    expect(mockState.chat.initializeChat).not.toHaveBeenCalled()

    runtimeModules.releaseChatService()
    await flushEffects()

    expect(mockState.chat.initializeChat).toHaveBeenCalledTimes(1)
  })

  it('starts local chat init without waiting for cached conversation lists', async () => {
    let releaseCachedList!: () => void
    mockState.chat.loadCachedConversationsList.mockImplementation(
      () => new Promise<void>((resolve) => {
        releaseCachedList = resolve
      }),
    )

    render(<MainLayout />)
    await flushEffects()

    expect(mockState.chat.initializeChat).toHaveBeenCalledTimes(1)
    expect(mockState.chat.loadCachedConversationsList).toHaveBeenCalledTimes(1)

    releaseCachedList()
    await flushEffects()
    expect(mockState.chat.prewarmRecentDirectMessages).toHaveBeenCalled()
  })

  it('keeps initializing after a same-wallet remount before modules are ready', async () => {
    runtimeModules.holdChatService()
    const view = render(<MainLayout />)
    await flushEffects()
    view.unmount()

    render(<MainLayout />)
    runtimeModules.releaseChatService()
    await flushEffects()
    await flushEffects()

    expect(mockState.chat.initializeChat).toHaveBeenCalledTimes(1)
    expect(mockState.chat.loadCachedContactsList).toHaveBeenCalledTimes(1)
    expect(mockState.chat.loadCachedConversationsList).toHaveBeenCalledTimes(1)
  })

  it('re-initializes chat after auto-lock teardown of the same wallet', async () => {
    const view = render(<MainLayout />)
    await flushEffects()
    expect(mockState.chat.initializeChat).toHaveBeenCalledTimes(1)
    expect(mockState.chat.loadCachedConversationsList).toHaveBeenCalledTimes(1)

    mockState.chat.isInitialized = false
    mockState.chat.isInitializing = false
    mockState.quantumChat.isQuantumChatInitialized.mockReturnValue(false)
    mockState.accountRuntime.abortActiveAccountRuntime()
    view.unmount()

    render(<MainLayout />)
    await flushEffects()

    expect(mockState.chat.initializeChat).toHaveBeenCalledTimes(2)
    expect(mockState.chat.loadCachedConversationsList).toHaveBeenCalledTimes(2)
  })

  it('does not leave the mailbox banner hanging when identity is not ready', async () => {
    mockState.quantumChat.isQuantumChatInitialized.mockReturnValue(false)
    mockState.quantumChat.waitForQuantumChatIdentity.mockResolvedValue(false)
    mockState.quantumChat.getIdentity.mockReturnValue(null)

    render(<MainLayout />)
    await flushEffects()

    expect(useMailboxCatchupBannerStore.getState().phase).toBe('caught_up')
    expect(mockState.backendAuth.ensureVerifiedBackendAccessForIdentity).not.toHaveBeenCalled()
  })

  it('initializes the local persona before identity-scoped cloud admission', async () => {
    mockState.quantumChat.isQuantumChatInitialized.mockReturnValue(false)
    mockState.quantumChat.waitForQuantumChatIdentity.mockImplementation(async () => {
      mockState.quantumChat.isQuantumChatInitialized.mockReturnValue(true)
      return true
    })
    mockState.chat.initializeChat.mockImplementation(async () => {
      mockState.quantumChat.isQuantumChatInitialized.mockReturnValue(true)
    })

    render(<MainLayout />)
    await flushEffects()

    expect(mockState.chat.initializeChat).toHaveBeenCalled()
    expect(mockState.backendAuth.ensureVerifiedBackendAccessForIdentity)
      .toHaveBeenCalledWith('identity-local', expect.objectContaining({
        signal: expect.any(AbortSignal),
      }))
    expect(mockState.chat.initializeChat.mock.invocationCallOrder[0])
      .toBeLessThan(
        mockState.backendAuth.ensureVerifiedBackendAccessForIdentity.mock.invocationCallOrder[0],
      )
  })

  it('starts mailbox catch-up after identity-scoped cloud admission', async () => {
    render(<MainLayout />)
    await flushEffects()

    expect(mockState.backendAuth.ensureVerifiedBackendAccessForIdentity).toHaveBeenCalled()
    expect(mockState.quantumChat.catchUpMailboxForBoundSession).toHaveBeenCalled()
    expect(mockState.activeDiscovery.ensureActiveDiscoveryRent).toHaveBeenCalled()
    expect(
      mockState.backendAuth.ensureVerifiedBackendAccessForIdentity.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mockState.quantumChat.catchUpMailboxForBoundSession.mock.invocationCallOrder[0],
    )
  })

  it('does not restart cloud admission when verification state changes', async () => {
    let releaseAdmission!: () => void
    mockState.auth.isCloudAuthVerified = false
    mockState.auth.isIdentityBound = false
    mockState.backendAuth.ensureVerifiedBackendAccessForIdentity.mockImplementationOnce(
      () => new Promise((resolve) => {
        releaseAdmission = () => resolve({
          accessToken: 'cloud',
          identityId: 'identity-local',
        })
      }),
    )

    const view = render(<MainLayout />)
    await flushEffects()
    expect(mockState.backendAuth.ensureVerifiedBackendAccessForIdentity).toHaveBeenCalledTimes(1)

    mockState.auth.isCloudAuthVerified = true
    view.update(<MainLayout />)
    await flushEffects()
    expect(mockState.backendAuth.ensureVerifiedBackendAccessForIdentity).toHaveBeenCalledTimes(1)

    await act(async () => {
      releaseAdmission()
    })
  })

  it('recovers the bound cloud session when returning from background', async () => {
    render(<MainLayout />)
    await flushEffects()
    mockState.backendAuth.recoverBoundSessionOnForeground.mockClear()
    mockState.quantumChat.syncBundleServerAccessToken.mockClear()
    mockState.chat.loadCachedConversationsList.mockClear()
    mockState.quantumChat.catchUpMailboxForBoundSession.mockClear()

    await act(async () => {
      for (const listener of mockState.appStateListeners) {
        listener('background')
      }
    })
    await act(async () => {
      for (const listener of mockState.appStateListeners) {
        listener('active')
      }
    })
    await flushEffects()

    expect(mockState.backendAuth.recoverBoundSessionOnForeground).toHaveBeenCalledWith('identity-local')
    expect(mockState.quantumChat.syncBundleServerAccessToken).toHaveBeenCalled()
    expect(mockState.chat.loadCachedConversationsList).toHaveBeenCalled()
    expect(mockState.quantumChat.catchUpMailboxForBoundSession).toHaveBeenCalled()
  })

  it('hydrates local chats on resume even when the cloud session is not yet fresh', async () => {
    mockState.backendAuth.recoverBoundSessionOnForeground.mockResolvedValue(null)
    render(<MainLayout />)
    await flushEffects()
    mockState.backendAuth.recoverBoundSessionOnForeground.mockClear()
    mockState.quantumChat.syncBundleServerAccessToken.mockClear()
    mockState.chat.loadCachedConversationsList.mockClear()
    mockState.quantumChat.catchUpMailboxForBoundSession.mockClear()

    await act(async () => {
      for (const listener of mockState.appStateListeners) {
        listener('background')
      }
    })
    await act(async () => {
      for (const listener of mockState.appStateListeners) {
        listener('active')
      }
    })
    await flushEffects()

    expect(mockState.backendAuth.recoverBoundSessionOnForeground).toHaveBeenCalledWith('identity-local')
    expect(mockState.quantumChat.syncBundleServerAccessToken).toHaveBeenCalled()
    expect(mockState.chat.loadCachedConversationsList).toHaveBeenCalled()
    expect(mockState.quantumChat.catchUpMailboxForBoundSession).not.toHaveBeenCalled()
  })

  it('skips cloud recover on resume if the vault locks before modules resolve', async () => {
    render(<MainLayout />)
    await flushEffects()
    runtimeModules.holdChatService()
    mockState.backendAuth.recoverBoundSessionOnForeground.mockClear()
    mockState.quantumChat.syncBundleServerAccessToken.mockClear()
    mockState.chat.loadCachedConversationsList.mockClear()
    mockState.quantumChat.catchUpMailboxForBoundSession.mockClear()

    await act(async () => {
      for (const listener of mockState.appStateListeners) {
        listener('background')
      }
    })
    await act(async () => {
      for (const listener of mockState.appStateListeners) {
        listener('active')
      }
    })

    mockState.auth.isAuthenticated = false
    mockState.wallet.isVaultUnlocked = false

    await act(async () => {
      runtimeModules.releaseChatService()
    })
    await flushEffects()

    expect(mockState.backendAuth.recoverBoundSessionOnForeground).not.toHaveBeenCalled()
    expect(mockState.quantumChat.syncBundleServerAccessToken).not.toHaveBeenCalled()
    expect(mockState.chat.loadCachedConversationsList).toHaveBeenCalled()
    expect(mockState.quantumChat.catchUpMailboxForBoundSession).not.toHaveBeenCalled()
  })

  it('retries a transient identity admission once without blocking the UI', async () => {
    vi.useFakeTimers()
    mockState.auth.isCloudAuthVerified = true
    mockState.auth.isIdentityBound = false
    mockState.auth.secureAccess = {
      phase: 'failed',
      failure: 'connectivity',
      retryable: true,
    }
    mockState.chat.isInitialized = true

    render(<MainLayout />)
    await flushEffects()
    expect(mockState.backendAuth.repairBackendIdentityBinding).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(15_000)
      await Promise.resolve()
    })

    expect(mockState.backendAuth.repairBackendIdentityBinding)
      .toHaveBeenCalledWith('identity-local', expect.objectContaining({
        signal: expect.any(AbortSignal),
      }))
    vi.useRealTimers()
  })

  it('starts delivery synchronization only after the chat identity is bound', async () => {
    const wallet = {
      id: 'wallet-root',
      address: 'EXO0000000000000000000000000000000000000000',
      publicKey: 'root-public-key',
      privateKey: 'root-private-key',
      createdAt: 1,
      chainAccounts: {
        evm: { address: '0x15f578E08913bB0a14DB194738239617f2D0BE5B' },
        solana: { address: '4JnfqFEcPqew6Gyfu6n3bhf5AhLaAnNNC9gyC47HsXjj' },
        tron: { address: 'TNtFoT2roKXX94FF3VZWEqqUeh1rXenajD' },
        bitcoin: { address: 'bc1qygny0chayhq3gw68ccd0m22dh0c8w594d5fntt' },
      },
    }
    mockState.auth.isCloudAuthVerified = false
    mockState.auth.isIdentityBound = false
    mockState.auth.session = null
    mockState.chat.isInitialized = false
    mockState.wallet.wallet = wallet
    mockState.wallet.wallets = [wallet, {
      ...wallet,
      id: 'spectre-wallet',
      address: 'EXO1111111111111111111111111111111111111111',
      spectreMode: true,
      chainAccounts: {
        evm: { address: '0x9999999999999999999999999999999999999999' },
      },
    }]

    const view = render(<MainLayout />)
    await flushEffects()
    await flushEffects()

    expect(mockState.walletIndexDelivery.useWalletIndexDelivery).toHaveBeenCalledWith(
      null,
    )

    mockState.auth.isIdentityBound = true
    mockState.chat.isInitialized = true
    view.update(<MainLayout />)
    await flushEffects()

    expect(mockState.walletIndexDelivery.useWalletIndexDelivery).toHaveBeenLastCalledWith(
      mockState.wallet.wallet,
    )
  })

  it('applies the deferred contact name after scoped chat initialization', async () => {
    mockState.onboarding.deferredContactProfileName = {
      walletAddress: 'EXO_ACTIVE',
      displayName: ' Public Alice ',
    }

    render(<MainLayout />)
    await flushEffects()

    expect(mockState.contactProfile.updateOwnContactProfile).toHaveBeenCalledWith(
      'identity-local',
      { displayName: 'Public Alice' },
    )
    expect(mockState.onboarding.clearDeferredContactProfileName)
      .toHaveBeenCalledWith('EXO_ACTIVE')
    expect(mockState.storage.prepareAsyncStorageScope.mock.invocationCallOrder[0])
      .toBeLessThan(mockState.contactProfile.updateOwnContactProfile.mock.invocationCallOrder[0])
  })

  it('clears visible chat state before applying a new wallet scope', async () => {
    const view = render(<MainLayout />)
    await flushEffects()
    vi.clearAllMocks()

    mockState.wallet.wallet = {
      address: 'EXO_NEXT',
      spectreMode: false,
    }

    view.update(<MainLayout />)
    await flushEffects()

    expect(mockState.chat.reset).toHaveBeenCalled()
    expect(mockState.group.reset).toHaveBeenCalled()
    expect(mockState.storage.setAsyncStorageScope).not.toHaveBeenCalled()
    expect(mockState.chat.waitForChatQuiescence).toHaveBeenCalled()
    expect(mockState.chat.setStorageScope).toHaveBeenCalledWith('EXO_NEXT', { allowLegacyMigration: true })
    expect(mockState.chat.reset.mock.invocationCallOrder[0])
      .toBeLessThan(mockState.chat.setStorageScope.mock.invocationCallOrder[0])
  })

  it('fails Spectre activation instead of finishing while Tor is enabled but disconnected', async () => {
    mockState.spectre.activationFlow = 'enable'
    mockState.spectre.activationStartedAt = 123
    mockState.wallet.wallet = {
      address: 'EXO_SPECTRE',
      spectreMode: true,
    }
    mockState.tor.enabled = true
    mockState.tor.status = 'disconnected'

    render(<MainLayout />)
    await flushEffects()

    expect(mockState.spectre.setActivationPhase).toHaveBeenCalledWith('prepare_storage')
    expect(mockState.spectre.setActivationPhase).toHaveBeenCalledWith('cached_conversations')
    expect(mockState.spectre.setActivationPhase).toHaveBeenCalledWith('verify_cloud')
    expect(mockState.spectre.failActivation)
      .toHaveBeenCalledWith('Tor must be connected before Spectre can finish enabling')
  })
})
