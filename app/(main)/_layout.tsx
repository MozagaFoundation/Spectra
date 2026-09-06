/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView, Pressable, ActivityIndicator, AppState, InteractionManager, type LayoutChangeEvent } from 'react-native'
import { Redirect, Stack, usePathname, useRouter, type Href } from 'expo-router'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { useWalletStore } from '@/store/walletStore'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useGroupChatStore } from '@/store/groupChatStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useAccountReadinessStore } from '@/store/accountReadinessStore'
import { isScopedActiveContactCard, useEphemeralDiscoveryStore } from '@/store/ephemeralDiscoveryStore'
import { useVdfActivityStore } from '@/store/vdfActivityStore'
import { useVdfBannerPreferenceStore } from '@/store/vdfBannerPreferenceStore'
import {
  beginMailboxCatchupBanner,
  advanceMailboxCatchupBanner,
  completeMailboxCatchupBanner,
  resetMailboxCatchupBanner,
  useMailboxCatchupBannerStore,
} from '@/store/mailboxCatchupBannerStore'
import { startTor, stopTor } from '@/services/tor'
import { cancelSpectreActivation, disableSpectreMode } from '@/services/security/spectreMode'
import { useTorStore } from '@/services/tor/torStore'
import { TorReconnectGate } from '@/components/tor/TorReconnectGate'
import { AccountSwitchReadinessBanner } from '@/components/AccountSwitchReadinessBanner'
import {
  FullscreenCallHost,
  MinimizedCallBannerHost,
  PendingCallRecoveryBannerHost,
} from '@/components/chat/CallPresentationHost'
import { TorStatusBanner } from '@/components/tor/TorStatusBanner'
import { SpectreActivationModal } from '@/components/common/SpectreActivationModal'
import { SpectreBlockedRoute } from '@/components/common/SpectreBlockedRoute'
import { VdfProgressBanner } from '@/components/common/VdfProgressBanner'
import { MailboxCatchupBanner } from '@/components/chat/MailboxCatchupBanner'
import { ActiveContactCardBanner } from '@/components/common/ActiveContactCardBanner'
import { ContactCardShareModal } from '@/components/common/ContactCardShareModal'
import {
  canOpenTorBridges,
  getTopChromeAwareTopInset,
  shouldShowTorReconnectGate,
  TOR_BRIDGES_ROUTE,
} from '@/components/tor/torPresenceState'
import {
  BACKEND_BINDING_RETRY_COOLDOWN_MS,
  resetAuthCooldowns,
} from '@/services/backend/session'
import { getErrorDisplayMessage, shouldShowErrorDetails } from '@/lib/errorDisplay'
import { prepareAsyncStorageScope } from '@/services/storage'
import { setActiveGroupStorageScope } from '@/services/groupChat/storage'
import { resolveTopChromeHeight, TopChromeHeightProvider } from '@/contexts/TopChromeContext'
import { CallProvider, useCallPresentation } from '@/contexts'
import { useWalletIndexDelivery } from '@/hooks/useWalletIndexDelivery'
import {
  isSameAccountStorageScope,
} from '@/lib/accountScope'
import { normalizeContactProfileDisplayName } from '@spectra/core-crypto'
import { updateOwnContactProfile } from '@/services/chat/contactProfile'
import { abortActiveAccountRuntime, registerAccountRuntimeAbortListener } from '@/services/shared/accountRuntimeLifecycle'
import { useOnboardingStore } from '@/store/onboardingStore'
import {
  beginListStartupMetrics,
  markListStartupMetric,
} from '@/lib/performanceMetrics'
import { isSpectreBlockedRoute } from '@/lib/spectreRoutePolicy'
import { persistDevSessionLog } from '@/services/logging/devSessionLog'
import {
  getActiveDiscoveryModule,
  getBackendAuthModule,
  getChatServiceModule,
  getQuantumChatModule,
} from '@/services/chat/preloadRuntimeModules'

const CHAT_BOOTSTRAP_LOG_PREFIX = '[ChatBootstrap]'

function logChatBootstrap(event: string, details: Record<string, unknown>): void {
  persistDevSessionLog('ChatBootstrap', event, details)
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(CHAT_BOOTSTRAP_LOG_PREFIX, event, details)
  }
}

function scheduleActiveDiscoveryRent(): void {
  void getActiveDiscoveryModule()
    .then((module) => {
      void module.ensureActiveDiscoveryRent()
    })
    .catch(() => undefined)
}

type SharedStoragePreparation = {
  walletAddress: string
  allowLegacyMigration: boolean
  promise: Promise<void>
}

type SharedCachedHydration = {
  walletAddress: string
  promise: Promise<void>
}

let sharedStoragePreparation: SharedStoragePreparation | null = null
let sharedCachedHydration: SharedCachedHydration | null = null
let sharedInitializeWallet: string | null = null

function clearSharedChatBootstrap(walletAddress?: string | null): void {
  if (!walletAddress || sharedStoragePreparation?.walletAddress === walletAddress) {
    sharedStoragePreparation = null
  }
  if (!walletAddress || sharedCachedHydration?.walletAddress === walletAddress) {
    sharedCachedHydration = null
  }
  if (!walletAddress || sharedInitializeWallet === walletAddress) {
    sharedInitializeWallet = null
  }
}

export function resetChatBootstrapSharedState(): void {
  clearSharedChatBootstrap()
}

registerAccountRuntimeAbortListener(() => {
  clearSharedChatBootstrap()
})

function beginSharedStoragePreparation(
  walletAddress: string,
  allowLegacyMigration: boolean,
): SharedStoragePreparation {
  if (
    sharedStoragePreparation
    && sharedStoragePreparation.walletAddress === walletAddress
    && sharedStoragePreparation.allowLegacyMigration === allowLegacyMigration
  ) {
    return sharedStoragePreparation
  }

  const promise = prepareAsyncStorageScope(walletAddress, {
    allowLegacyMigration,
  })
  sharedStoragePreparation = {
    walletAddress,
    allowLegacyMigration,
    promise,
  }
  void promise.catch(() => {
    if (sharedStoragePreparation?.promise === promise) {
      sharedStoragePreparation = null
    }
  })
  return sharedStoragePreparation
}

function beginSharedCachedHydration(
  walletAddress: string,
  load: () => Promise<unknown>,
): SharedCachedHydration {
  if (sharedCachedHydration?.walletAddress === walletAddress) {
    return sharedCachedHydration
  }

  const promise = Promise.resolve(load()).then(() => undefined)
  sharedCachedHydration = {
    walletAddress,
    promise,
  }
  void promise.catch(() => {
    if (sharedCachedHydration?.promise === promise) {
      sharedCachedHydration = null
    }
  })
  return sharedCachedHydration
}

function consumePendingMessagingAfterAdmission(): void {
  void import('@/services/notifications/notificationCoordinator')
    .then(({ consumePendingMessagingNotifications }) =>
      consumePendingMessagingNotifications('bootstrap')
    )
    .catch((error) => {
      console.warn('Failed to recover pending messaging after cloud admission:', error)
    })
}

function ErrorBoundaryFallback({
  title,
  error,
  onRetry,
}: {
  title: string
  error: Error
  onRetry: () => void
}) {
  const colors = useThemeColors()

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }}
    >
      <Text style={{ color: colors.error, fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>
        {title}
      </Text>
      <ScrollView style={{ maxHeight: 400, width: '100%' }}>
        <Text style={{ color: colors.warning, fontSize: 14, marginBottom: 8 }}>
          {getErrorDisplayMessage(error)}
        </Text>
        {shouldShowErrorDetails() ? (
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            {error.stack?.slice(0, 1500)}
          </Text>
        ) : null}
      </ScrollView>
      <Pressable
        onPress={onRetry}
        style={{
          marginTop: 20,
          backgroundColor: colors.primary,
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 12,
        }}
      >
        <Text style={{ color: colors.textOnPrimary, fontWeight: '600' }}>
          {translate('Retry')}
        </Text>
      </Pressable>
    </View>
  )
}

class MainErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorBoundaryFallback
          title={translate('Screen failed to load', { ns: 'navigation' })}
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
        />
      )
    }
    return this.props.children
  }
}

function MainStack() {
  const pathname = usePathname()
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const spectreApplying = useSpectreStore((state) => state.isApplying)
  const walletIsSpectre = useWalletStore((state) => state.wallet?.spectreMode === true)

  if (isSpectreBlockedRoute(pathname, { enabled: spectreEnabled, walletIsSpectre }, spectreApplying)) {
    return <SpectreBlockedRoute />
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerBackVisible: false,
        contentStyle: { backgroundColor: 'transparent' },
        animation: 'slide_from_right',
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen 
        name="chat/[address]" 
        options={{ animation: 'slide_from_right', freezeOnBlur: true, gestureEnabled: true }}
      />
      <Stack.Screen 
        name="contact/add" 
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="group/create"
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen name="group/[id]/info" />
      <Stack.Screen name="group/[id]/media" />
      <Stack.Screen
        name="agora/[roomId]"
        options={{ animation: 'slide_from_right', freezeOnBlur: true, gestureEnabled: true }}
      />
      <Stack.Screen name="contact/[address]" />
      <Stack.Screen name="contact/[address]/media" />
      <Stack.Screen name="contact/scan-qr" />
      <Stack.Screen name="profile/index" />
      <Stack.Screen name="profile/qr-code" />
      <Stack.Screen name="profile/edit" />
      <Stack.Screen name="settings/security" />
      <Stack.Screen name="settings/tor-bridges" />
      <Stack.Screen name="settings/contact-archive" />
      <Stack.Screen name="settings/about" />
      <Stack.Screen name="settings/appearance" />
      <Stack.Screen name="settings/change-pin" />
      <Stack.Screen name="settings/help-center" />
      <Stack.Screen name="settings/help-topic" />
      <Stack.Screen name="settings/report-issue" />
      <Stack.Screen name="settings/legal-viewer" />
      <Stack.Screen name="settings/vdf-calibration" />
      <Stack.Screen name="crypto/send" />
      <Stack.Screen name="crypto/send-eth" />
      <Stack.Screen name="crypto/send-native" />
      <Stack.Screen name="crypto/receive" />
      <Stack.Screen name="crypto/pools" />
      <Stack.Screen name="share/import" />
      <Stack.Screen name="markets/index" />
      <Stack.Screen name="markets/primary/index" />
      <Stack.Screen name="markets/primary/[saleId]" />
      <Stack.Screen name="markets/prediction/index" />
      <Stack.Screen name="markets/prediction/[marketId]" />
      <Stack.Screen name="markets/prediction/positions" />
      <Stack.Screen name="markets/escrow/index" />
      <Stack.Screen name="markets/escrow/[orderId]" />
      <Stack.Screen name="markets/escrow/create" options={{ presentation: 'modal' }} />
      <Stack.Screen name="markets/escrow/my-orders" />
      <Stack.Screen name="markets/campaigns/index" />
      <Stack.Screen name="markets/campaigns/[campaignId]" />
      <Stack.Screen name="markets/campaigns/create" options={{ presentation: 'modal' }} />
      <Stack.Screen name="markets/campaigns/my" />

      <Stack.Screen
        name="archived-chats"
        options={{ animation: 'slide_from_right' }}
      />
    </Stack>
  )
}

function ChatBootstrap() {
  const wallet = useWalletStore((state) => state.wallet)
  const wallets = useWalletStore((state) => state.wallets)
  const walletAddress = useWalletStore((state) => state.wallet?.address ?? null)
  const walletIsSpectre = useWalletStore((state) => state.wallet?.spectreMode === true)
  const spectreActivationFlow = useSpectreStore((state) => state.activationFlow)
  const spectreActivationStartedAt = useSpectreStore((state) => state.activationStartedAt)
  const isInitialized = useChatStore((state) => state.isInitialized)
  const isInitializing = useChatStore((state) => state.isInitializing)
  const setChatStorageScope = useChatStore((state) => state.setStorageScope)
  const resetChatStore = useChatStore((state) => state.reset)
  const resetGroupChatStore = useGroupChatStore((state) => state.reset)
  const cloudSession = useAuthStore((state) => state.session)
  const isCloudAuthVerified = useAuthStore((state) => state.isCloudAuthVerified)
  const isIdentityBound = useAuthStore((state) => state.isIdentityBound)
  const secureAccess = useAuthStore((state) => state.secureAccess)
  const torEnabled = useTorStore((state) => state.enabled)
  const torStatus = useTorStore((state) => state.status)
  const previousWalletAddressRef = useRef<string | null>(null)
  const visibleStateWalletAddressRef = useRef<string | null>(null)
  const bootstrapGenerationRef = useRef(0)
  const reconciledRuntimeKeyRef = useRef<string | null>(null)
  const spectreBackgroundChatStartedAtRef = useRef<number | null>(null)
  const bindingRetryScopeRef = useRef<string | null>(null)

  useWalletIndexDelivery(isInitialized && isIdentityBound ? wallet : null)

  useEffect(() => {
    if (spectreActivationFlow !== 'enable') {
      spectreBackgroundChatStartedAtRef.current = null
    }
  }, [spectreActivationFlow])

  useLayoutEffect(() => {
    const previousVisibleWalletAddress = visibleStateWalletAddressRef.current
    if (
      previousVisibleWalletAddress
      && previousVisibleWalletAddress !== walletAddress
    ) {
      resetChatStore()
      resetGroupChatStore()
      resetMailboxCatchupBanner()
    }

    visibleStateWalletAddressRef.current = walletAddress
  }, [resetChatStore, resetGroupChatStore, walletAddress])

  useEffect(() => {
    let cancelled = false
    let deferredSpectreChatTask: { cancel: () => void } | null = null
    let deferredDirectPrewarmTask: { cancel: () => void } | null = null
    let cloudBootstrapAbortController: AbortController | null = null
    let directPrewarmAbortController: AbortController | null = null
    const bootstrapGeneration = ++bootstrapGenerationRef.current
    const chatStateAtBootstrap = useChatStore.getState()
    const wasInitialized = chatStateAtBootstrap.isInitialized
    const wasInitializing = chatStateAtBootstrap.isInitializing
    const hasCloudSession = Boolean(useAuthStore.getState().session?.accessToken)
    const shouldTrackSpectreActivation = walletIsSpectre && spectreActivationFlow === 'enable'
    const previousWalletAddress = previousWalletAddressRef.current
    const bootstrapStartedAt = Date.now()
    if (walletAddress && previousWalletAddress !== walletAddress) {
      beginListStartupMetrics()
    }
    const runtimeReconcileKey = `${walletAddress}:${torStatus}`
    if (!wasInitialized || torStatus !== 'connected') {
      reconciledRuntimeKeyRef.current = null
    }
    const logBootstrapStage = (event: string, details: Record<string, unknown> = {}) => {
      logChatBootstrap(event, {
        totalMs: Date.now() - bootstrapStartedAt,
        ...details,
      })
    }
    const isActiveWallet = () =>
      useWalletStore.getState().wallet?.address === walletAddress
    const isCurrentEffect = () =>
      !cancelled
      && bootstrapGenerationRef.current === bootstrapGeneration
      && isActiveWallet()
    const getSpectreActivationState = () => useSpectreStore.getState()
    const canUpdateSpectreActivation = () => {
      const spectreState = getSpectreActivationState()
      return (
        shouldTrackSpectreActivation &&
        !cancelled &&
        spectreState.activationFlow === 'enable' &&
        spectreState.activationPhase !== 'completed' &&
        !spectreState.activationError
      )
    }
    const setSpectreActivationPhase = (phase: 'prepare_storage' | 'cached_conversations' | 'initialize_chat' | 'verify_cloud') => {
      if (!canUpdateSpectreActivation()) {
        return
      }

      getSpectreActivationState().setActivationPhase(phase)
    }
    const completeSpectreActivation = () => {
      if (!canUpdateSpectreActivation()) {
        return
      }

      getSpectreActivationState().completeActivation()
    }
    const failSpectreActivation = (fallbackMessage: string, error?: unknown) => {
      if (!shouldTrackSpectreActivation || cancelled) {
        return
      }

      const spectreState = getSpectreActivationState()
      if (spectreState.activationFlow !== 'enable' || spectreState.activationPhase === 'completed') {
        return
      }

      spectreState.failActivation(error instanceof Error ? error.message : fallbackMessage)
    }
    const scheduleSpectreBackgroundChatBootstrap = (chatService: Awaited<ReturnType<typeof getChatServiceModule>>) => {
      if (!shouldTrackSpectreActivation || cancelled || !spectreActivationStartedAt) {
        return
      }

      if (spectreBackgroundChatStartedAtRef.current === spectreActivationStartedAt) {
        return
      }

      if (wasInitializing) {
        return
      }

      spectreBackgroundChatStartedAtRef.current = spectreActivationStartedAt
      logBootstrapStage('chat.deferred', {
        reason: !wasInitialized && !wasInitializing ? 'background_initialize' : 'background_reconcile',
      })

      deferredSpectreChatTask = InteractionManager.runAfterInteractions(() => {
        if (cancelled) {
          return
        }

        if (!wasInitialized && !wasInitializing) {
          const chatInitStartedAt = Date.now()
          void chatService.initializeChat()
            .then(() => {
              if (cancelled) {
                return
              }

              logBootstrapStage('chat.ready', {
                phaseMs: Date.now() - chatInitStartedAt,
                background: true,
              })
              markListStartupMetric('runtime_ready')
              reconciledRuntimeKeyRef.current = runtimeReconcileKey
            })
            .catch((error) => {
              console.warn('Failed to bootstrap chat in background:', error)
              logBootstrapStage('chat.failed', {
                background: true,
                error: error instanceof Error ? error.message : String(error),
              })
            })
          return
        }

        if (!wasInitialized || torStatus !== 'connected') {
          return
        }

        const reconcileStartedAt = Date.now()
        void chatService.reconcileChat()
          .then(() => {
            if (cancelled) {
              return
            }

            logBootstrapStage('chat.reconciled', {
              phaseMs: Date.now() - reconcileStartedAt,
              background: true,
            })
          })
          .catch((error) => {
            console.warn('Failed to reconcile chat after Spectre activation:', error)
            logBootstrapStage('chat.failed', {
              background: true,
              error: error instanceof Error ? error.message : String(error),
            })
          })
      })
    }

    logBootstrapStage('bootstrap.started', {
      walletChanged: Boolean(previousWalletAddress && previousWalletAddress !== walletAddress),
      isInitialized: wasInitialized,
      isInitializing: wasInitializing,
      torEnabled,
      torStatus,
      hasCloudSession,
      isCloudAuthVerified: useAuthStore.getState().isCloudAuthVerified,
    })

    if (!walletAddress) {
      resetMailboxCatchupBanner()
      clearSharedChatBootstrap()
      reconciledRuntimeKeyRef.current = null
      if (previousWalletAddress || wasInitialized || wasInitializing) {
        void getChatServiceModule().then(async ({ cleanupChat, waitForChatQuiescence }) => {
          cleanupChat()
          await waitForChatQuiescence()
        })
      }
      previousWalletAddressRef.current = null
      return () => {
        cancelled = true
      }
    }

    previousWalletAddressRef.current = walletAddress
    if (!wasInitialized) {
      beginMailboxCatchupBanner()
    }

    void (async () => {
      const modulesStartedAt = Date.now()
      const storageScopeStartedAt = Date.now()
      const allowLegacyMigration = walletIsSpectre !== true
      const walletChanged = Boolean(previousWalletAddress && previousWalletAddress !== walletAddress)
      const modulesPromise = Promise.all([
        getBackendAuthModule(),
        getChatServiceModule(),
      ])

      if (!walletChanged) {
        setActiveGroupStorageScope(walletAddress)
        setChatStorageScope(walletAddress, {
          allowLegacyMigration,
        })
        if (isCurrentEffect()) {
          setSpectreActivationPhase('prepare_storage')
        }
        beginSharedStoragePreparation(walletAddress, allowLegacyMigration)
      }

      const [
        { ensureVerifiedBackendAccessForIdentity },
        chatService,
      ] = await modulesPromise

      logBootstrapStage('modules.ready', {
        phaseMs: Date.now() - modulesStartedAt,
      })

      if (!isActiveWallet()) {
        return
      }

      if (walletChanged) {
        chatService.cleanupChat()
        await chatService.waitForChatQuiescence()
        if (!isActiveWallet()) {
          return
        }
        clearSharedChatBootstrap(previousWalletAddress)
        resetChatStore()
        resetGroupChatStore()
        setActiveGroupStorageScope(walletAddress)
        setChatStorageScope(walletAddress, {
          allowLegacyMigration,
        })
        if (isCurrentEffect()) {
          setSpectreActivationPhase('prepare_storage')
        }
        beginSharedStoragePreparation(walletAddress, allowLegacyMigration)
      }

      await beginSharedStoragePreparation(walletAddress, allowLegacyMigration).promise

      logBootstrapStage('storage_scope.ready', {
        phaseMs: Date.now() - storageScopeStartedAt,
      })
      markListStartupMetric('storage_scope_ready')

      if (!isActiveWallet()) {
        return
      }

      const cachedLoadStartedAt = Date.now()
      const cachedHydration = beginSharedCachedHydration(walletAddress, () => Promise.all([
        chatService.loadCachedContactsList(),
        chatService.loadCachedConversationsList(),
        chatService.loadCachedGroupConversations(walletAddress, {
          allowLegacyMigration,
        }),
      ]))
      const prewarmController = new AbortController()
      directPrewarmAbortController = prewarmController
      const finishCachedHydration = () => {
        if (!isActiveWallet() || !isCurrentEffect()) {
          return
        }
        setSpectreActivationPhase('cached_conversations')
        logBootstrapStage('cached_conversations.ready', {
          phaseMs: Date.now() - cachedLoadStartedAt,
        })
        advanceMailboxCatchupBanner('loading_local')
        deferredDirectPrewarmTask = InteractionManager.runAfterInteractions(() => {
          if (!isActiveWallet() || prewarmController.signal.aborted) {
            return
          }
          void chatService.prewarmRecentDirectMessages({
            signal: prewarmController.signal,
          }).catch((error) => {
            if (!prewarmController.signal.aborted) {
              console.warn('Failed to prewarm recent direct chats:', error)
            }
          })
        })
      }
      const startSharedInitialize = () => {
        if (sharedInitializeWallet === walletAddress) {
          return
        }
        const chatRuntime = useChatStore.getState()
        if (chatRuntime.isInitialized || chatRuntime.isInitializing) {
          return
        }
        sharedInitializeWallet = walletAddress
        const chatInitStartedAt = Date.now()
        if (isCurrentEffect()) {
          setSpectreActivationPhase('initialize_chat')
        }
        void chatService.initializeChat()
          .then(() => {
            if (!isActiveWallet()) {
              return
            }
            logBootstrapStage('chat.ready', {
              phaseMs: Date.now() - chatInitStartedAt,
            })
            markListStartupMetric('runtime_ready')
            reconciledRuntimeKeyRef.current = runtimeReconcileKey
          })
          .catch((error) => {
            if (sharedInitializeWallet === walletAddress) {
              sharedInitializeWallet = null
            }
            console.warn('Failed to bootstrap chat:', error)
            failSpectreActivation('Failed to prepare secure chats', error)
          })
      }

      if (shouldTrackSpectreActivation) {
        await cachedHydration.promise
        finishCachedHydration()
        if (isCurrentEffect()) {
          setSpectreActivationPhase('verify_cloud')
        }
      } else {
        void cachedHydration.promise.then(finishCachedHydration)
        if (!wasInitialized && !wasInitializing) {
          startSharedInitialize()
        } else if (
          wasInitialized
          && torEnabled
          && torStatus === 'connected'
          && reconciledRuntimeKeyRef.current !== runtimeReconcileKey
        ) {
          const reconcileStartedAt = Date.now()
          reconciledRuntimeKeyRef.current = runtimeReconcileKey
          if (isCurrentEffect()) {
            setSpectreActivationPhase('initialize_chat')
          }
          void chatService.reconcileChat()
            .then(() => {
              if (!isCurrentEffect()) {
                return
              }
              logBootstrapStage('chat.reconciled', {
                phaseMs: Date.now() - reconcileStartedAt,
              })
            })
            .catch((error) => {
              if (reconciledRuntimeKeyRef.current === runtimeReconcileKey) {
                reconciledRuntimeKeyRef.current = null
              }
              console.warn('Failed to reconcile chat after Tor connected:', error)
              failSpectreActivation('Failed to prepare secure chats', error)
            })
        }
      }

      const runCloudBootstrap = async () => {
        if (!isCurrentEffect()) {
          return
        }

        logBootstrapStage('cloud_bootstrap.start')

        if (torEnabled && torStatus !== 'connected') {
          if (shouldTrackSpectreActivation) {
            logBootstrapStage('tor.recovering', {
              status: torStatus,
            })
            const torReady = await startTor().catch((error) => {
              console.warn('Failed to recover Tor before finishing Spectre activation:', error)
              return false
            })
            const currentTorState = useTorStore.getState()
            if (!isCurrentEffect()) {
              return
            }
            if (!torReady || currentTorState.status !== 'connected') {
              failSpectreActivation('Tor must be connected before Spectre can finish enabling')
              return
            }
          } else {
            return
          }
        }

        const quantumChat = await getQuantumChatModule()
        if (!isActiveWallet()) {
          return
        }
        const chatRuntime = useChatStore.getState()
        if (!quantumChat.isQuantumChatInitialized() && !chatRuntime.isInitializing) {
          startSharedInitialize()
        }
        const identityReady = await quantumChat.waitForQuantumChatIdentity()
        if (!isCurrentEffect()) {
          return
        }
        if (!identityReady) {
          logBootstrapStage('cloud_access.deferred', {
            reason: 'identity_unavailable',
          })
          completeMailboxCatchupBanner('empty')
          failSpectreActivation('Failed to prepare secure chats')
          return
        }

        const identity = quantumChat.getIdentity()
        if (!identity?.id) {
          logBootstrapStage('cloud_access.deferred', {
            reason: 'identity_unavailable',
          })
          completeMailboxCatchupBanner('empty')
          failSpectreActivation('Failed to prepare secure chats')
          return
        }

        const deferredProfile = useOnboardingStore.getState().deferredContactProfileName
        if (deferredProfile) {
          const activeWalletAddress = useWalletStore.getState().wallet?.address
          if (!isSameAccountStorageScope(deferredProfile.walletAddress, activeWalletAddress)) {
            useOnboardingStore.getState().clearDeferredContactProfileName(
              deferredProfile.walletAddress,
            )
          } else {
            try {
              await updateOwnContactProfile(identity.id, {
                displayName: normalizeContactProfileDisplayName(deferredProfile.displayName),
              })
              useOnboardingStore.getState().clearDeferredContactProfileName(
                deferredProfile.walletAddress,
              )
            } catch {
              logBootstrapStage('profile.deferred_failed')
            }
          }
        }
        if (!isCurrentEffect()) {
          return
        }

        const cloudAccessStartedAt = Date.now()
        const controller = new AbortController()
        cloudBootstrapAbortController = controller
        ensureVerifiedBackendAccessForIdentity(identity.id, { signal: controller.signal })
          .then((identitySession) => {
            if (!isCurrentEffect()) {
              return
            }

            if (!identitySession) {
              logBootstrapStage('cloud_access.deferred', {
                phaseMs: Date.now() - cloudAccessStartedAt,
                reason: 'identity_session_unavailable',
              })
              completeMailboxCatchupBanner('empty')
              failSpectreActivation('Failed to verify private cloud access')
              return
            }

            quantumChat.catchUpMailboxForBoundSession()
            scheduleActiveDiscoveryRent()
            consumePendingMessagingAfterAdmission()
            logBootstrapStage('cloud_access.ready', {
              phaseMs: Date.now() - cloudAccessStartedAt,
              hasCloudSession: true,
            })
            advanceMailboxCatchupBanner('connecting')

            if (shouldTrackSpectreActivation) {
              completeSpectreActivation()
              scheduleSpectreBackgroundChatBootstrap(chatService)
            }
          })
          .catch((error) => {
            console.warn('Failed to bootstrap verified cloud access:', error)
            completeMailboxCatchupBanner('empty')
            failSpectreActivation('Failed to verify private cloud access', error)
          })
          .finally(() => {
            if (cloudBootstrapAbortController === controller) {
              cloudBootstrapAbortController = null
            }
          })
      }

      void runCloudBootstrap()
    })().catch((error) => {
      if (isActiveWallet()) {
        console.warn('Failed to bootstrap chat runtime:', error)
        failSpectreActivation('Failed to prepare secure chats', error)
      }
    })

    return () => {
      cancelled = true
      cloudBootstrapAbortController?.abort()
      directPrewarmAbortController?.abort()
      deferredSpectreChatTask?.cancel()
      deferredDirectPrewarmTask?.cancel()
    }
  }, [
    walletAddress,
    walletIsSpectre,
    spectreActivationFlow,
    spectreActivationStartedAt,
    torEnabled,
    torStatus,
    setChatStorageScope,
  ])

  // Refresh the session before expiry.
  useEffect(() => {
    const session = cloudSession
    if (!walletAddress || !session?.expiresAt) {
      return
    }

    const refreshCloudSession = async () => {
      try {
        const [backendAuth, quantumChat] = await Promise.all([
          getBackendAuthModule(),
          getQuantumChatModule(),
        ])
        const identity = quantumChat.getIdentity()
        const refreshed = identity?.id
          ? await backendAuth.ensureVerifiedBackendAccessForIdentity(identity.id)
          : await backendAuth.ensureVerifiedBackendAccess()
        if (!refreshed) {
          useAuthStore.getState().setSessionExpired(true)
          return
        }

        if (identity?.id && refreshed.identityId) {
          useAuthStore.getState().setIdentityBound(refreshed.identityId === identity.id)
        }
        quantumChat.syncBundleServerAccessToken()
        useAuthStore.getState().setSessionExpired(false)
      } catch {
        useAuthStore.getState().setSessionExpired(true)
      }
    }

    const REFRESH_BUFFER_MS = 5 * 60 * 1000
    const msUntilRefresh = session.expiresAt - Date.now() - REFRESH_BUFFER_MS
    if (msUntilRefresh <= 0) {
      void refreshCloudSession()
      return
    }

    const timer = setTimeout(() => {
      void refreshCloudSession()
    }, msUntilRefresh)

    return () => clearTimeout(timer)
  }, [walletAddress, cloudSession?.expiresAt])

  useEffect(() => {
    if (!walletAddress) {
      return
    }

    let appState = AppState.currentState
    const subscription = AppState.addEventListener('change', (nextState) => {
      const resumed =
        (appState === 'background' || appState === 'inactive')
        && nextState === 'active'
      appState = nextState
      if (!resumed) {
        return
      }

      void (async () => {
        const [backendAuth, quantumChat, chatService] = await Promise.all([
          getBackendAuthModule(),
          getQuantumChatModule(),
          getChatServiceModule(),
        ])
        const vaultReady =
          useAuthStore.getState().isAuthenticated
          && useWalletStore.getState().isVaultUnlocked
        await chatService.loadCachedConversationsList()
        if (!vaultReady) {
          return
        }
        const identity = quantumChat.getIdentity()
        const recovered = await backendAuth.recoverBoundSessionOnForeground(identity?.id)
        quantumChat.syncBundleServerAccessToken()
        const { enabled, status } = useTorStore.getState()
        if (recovered && (!enabled || status === 'connected')) {
          quantumChat.catchUpMailboxForBoundSession()
          scheduleActiveDiscoveryRent()
        }
      })().catch((error) => {
        console.warn('[ChatBootstrap] Foreground session recovery failed:', error)
      })
    })

    return () => subscription.remove()
  }, [walletAddress])

  // Repair missing wallet identity bindings.
  useEffect(() => {
    if (!walletAddress || !isInitialized || !isCloudAuthVerified || isIdentityBound) {
      return
    }

    let cancelled = false

    void (async () => {
      const [{ getIdentity, isQuantumChatInitialized, catchUpMailboxForBoundSession }, { bindVerifiedBackendIdentity }] = await Promise.all([
        getQuantumChatModule(),
        getBackendAuthModule(),
      ])

      if (cancelled || !isQuantumChatInitialized()) {
        return
      }

      const identity = getIdentity()
      if (!identity?.id) {
        return
      }

      const bound = await bindVerifiedBackendIdentity(identity.id)
      if (!cancelled) {
        useAuthStore.getState().setIdentityBound(bound)
        if (!bound) {
          console.warn('[ChatBootstrap] Identity binding failed — messaging may be restricted')
        } else {
          catchUpMailboxForBoundSession()
          scheduleActiveDiscoveryRent()
          consumePendingMessagingAfterAdmission()
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    walletAddress,
    isInitialized,
    isCloudAuthVerified,
    isIdentityBound,
    cloudSession?.accessToken,
    cloudSession?.identityId,
  ])

  // Retry transient identity admission once after cooldown.
  useEffect(() => {
    if (
      !walletAddress
      || !isInitialized
      || isIdentityBound
      || (torEnabled && torStatus !== 'connected')
    ) {
      bindingRetryScopeRef.current = null
      return
    }

    if (secureAccess.phase === 'binding') {
      return
    }

    const isTransientFailure = secureAccess.failure === 'connectivity'
      || secureAccess.failure === 'temporary_backend'
      || secureAccess.failure === 'challenge_expired'
    if (
      secureAccess.phase !== 'failed'
      || !secureAccess.retryable
      || !isTransientFailure
    ) {
      bindingRetryScopeRef.current = null
      return
    }

    const retryScope = [
      walletAddress,
      torEnabled ? torStatus : 'clearnet',
      cloudSession?.identityId ?? '',
      cloudSession?.expiresAt ?? '',
      secureAccess.failure,
    ].join(':')
    if (bindingRetryScopeRef.current === retryScope) {
      return
    }
    bindingRetryScopeRef.current = retryScope

    let cancelled = false
    const abortController = new AbortController()
    const timer = setTimeout(() => {
      void (async () => {
        const [
          { getIdentity, isQuantumChatInitialized, catchUpMailboxForBoundSession },
          { repairBackendIdentityBinding },
        ] = await Promise.all([
          getQuantumChatModule(),
          getBackendAuthModule(),
        ])
        if (cancelled || !isQuantumChatInitialized()) {
          return
        }

        const identity = getIdentity()
        if (!identity?.id) {
          return
        }

        const repaired = await repairBackendIdentityBinding(identity.id, {
          signal: abortController.signal,
        })
        if (cancelled || repaired?.identityId !== identity.id) {
          return
        }

        catchUpMailboxForBoundSession()
        scheduleActiveDiscoveryRent()
        consumePendingMessagingAfterAdmission()
      })().catch(() => {
        if (!cancelled) {
          console.warn('[ChatBootstrap] Transient identity recovery failed')
        }
      })
    }, BACKEND_BINDING_RETRY_COOLDOWN_MS)

    return () => {
      cancelled = true
      abortController.abort()
      clearTimeout(timer)
    }
  }, [
    cloudSession?.expiresAt,
    cloudSession?.identityId,
    isIdentityBound,
    isInitialized,
    secureAccess.failure,
    secureAccess.phase,
    secureAccess.retryable,
    torEnabled,
    torStatus,
    walletAddress,
  ])

  return null
}

function TopChrome({
  liveBanners,
  onHeightChange,
  children,
}: {
  liveBanners: boolean
  onHeightChange: (height: number) => void
  children: React.ReactNode
}) {
  const call = useCallPresentation()
  const liveChromeVisible = liveBanners
    || call.showMinimizedBanner
    || Boolean(call.pendingCallRecoveryPhase && !call.callState)

  useLayoutEffect(() => {
    if (!liveChromeVisible) {
      onHeightChange(0)
    }
  }, [liveChromeVisible, onHeightChange])

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    onHeightChange(resolveTopChromeHeight(event.nativeEvent.layout.height, liveChromeVisible))
  }, [liveChromeVisible, onHeightChange])

  return (
    <View collapsable={false} onLayout={handleLayout}>
      {children}
    </View>
  )
}

export default function MainLayout() {
  const pathname = usePathname()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const authInitialized = useAuthStore((state) => state.isInitialized)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const walletLoading = useWalletStore((state) => state.isLoading)
  const hasWallet = useWalletStore((state) => state.hasWallet)
  const walletInitializationError = useWalletStore((state) => state.initializationError)
  const isVaultUnlocked = useWalletStore((state) => state.isVaultUnlocked)
  const walletAddress = useWalletStore((state) => state.wallet?.address ?? null)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const spectreApplying = useSpectreStore((state) => state.isApplying)
  const spectreActivationFlow = useSpectreStore((state) => state.activationFlow)
  const resetSpectreActivationProgress = useSpectreStore((state) => state.resetActivationProgress)
  const torEnabled = useTorStore((state) => state.enabled)
  const torStatus = useTorStore((state) => state.status)
  const torPresenceGateReason = useTorStore((state) => state.presenceGateReason)
  const setTorEnabled = useTorStore((state) => state.setEnabled)
  const dismissPresenceGate = useTorStore((state) => state.dismissPresenceGate)
  const resetVdfActivity = useVdfActivityStore((state) => state.reset)
  const activeContactCard = useEphemeralDiscoveryStore((state) => state.activeContactCard)
  const [isTorDisconnecting, setIsTorDisconnecting] = useState(false)
  const [isTorBridgeNavigationPending, setIsTorBridgeNavigationPending] = useState(false)
  const [topChromeHeight, setTopChromeHeight] = useState(0)
  const torBridgeNavigationPendingRef = useRef(false)
  const torBridgeNavigationResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showTorBanner = torEnabled
  const showAccountReadinessBanner = useAccountReadinessStore((state) => state.wallet !== null)
  const vdfActivityLive = useVdfActivityStore((state) => state.activity !== null)
  const vdfBannerVisible = useVdfBannerPreferenceStore((state) => state.visible)
  const showVdfBanner = vdfActivityLive && vdfBannerVisible
  const showMailboxCatchupBanner = useMailboxCatchupBannerStore((state) => state.phase !== null)
  const showContactCardBanner = isScopedActiveContactCard(activeContactCard, walletAddress)
    && !showVdfBanner
  const liveTopChrome = showTorBanner
    || showMailboxCatchupBanner
    || showVdfBanner
    || showContactCardBanner
    || showAccountReadinessBanner
  const showTopChrome = liveTopChrome || topChromeHeight > 0
  const spectreInitialActivationOwnsTor = spectreActivationFlow === 'enable' && spectreApplying
  const showTorGate = !spectreInitialActivationOwnsTor && shouldShowTorReconnectGate({
    enabled: torEnabled,
    status: torStatus,
    presenceGateReason: torPresenceGateReason,
  })
  const bannerAwareInsets = useMemo(
    () => ({
      ...insets,
      top: getTopChromeAwareTopInset(insets.top, showTopChrome),
    }),
    [insets, showTopChrome],
  )

  const handleTopChromeHeightChange = useCallback((nextHeight: number) => {
    setTopChromeHeight((currentHeight) => (
      Math.abs(currentHeight - nextHeight) < 1 ? currentHeight : nextHeight
    ))
  }, [])

  const clearTorBridgeNavigationResetTimeout = useCallback(() => {
    if (torBridgeNavigationResetTimeoutRef.current) {
      clearTimeout(torBridgeNavigationResetTimeoutRef.current)
      torBridgeNavigationResetTimeoutRef.current = null
    }
  }, [])

  const clearTorBridgeNavigationPending = useCallback(() => {
    clearTorBridgeNavigationResetTimeout()
    torBridgeNavigationPendingRef.current = false
    setIsTorBridgeNavigationPending(false)
  }, [clearTorBridgeNavigationResetTimeout])

  const navigateToTorBridges = useCallback(() => {
    if (!canOpenTorBridges(pathname, torBridgeNavigationPendingRef.current)) {
      return
    }

    torBridgeNavigationPendingRef.current = true
    setIsTorBridgeNavigationPending(true)
    clearTorBridgeNavigationResetTimeout()
    torBridgeNavigationResetTimeoutRef.current = setTimeout(() => {
      torBridgeNavigationPendingRef.current = false
      setIsTorBridgeNavigationPending(false)
      torBridgeNavigationResetTimeoutRef.current = null
    }, 1200)
    router.navigate(TOR_BRIDGES_ROUTE as Href)
  }, [clearTorBridgeNavigationResetTimeout, pathname, router])

  const handleDisconnectTor = useCallback(() => {
    if (isTorDisconnecting) {
      return
    }

    setIsTorDisconnecting(true)
    void (async () => {
      try {
        if (spectreEnabled) {
          dismissPresenceGate()
          await disableSpectreMode()
          return
        }

        await setTorEnabled(false)
        try {
          await stopTor()
        } catch (error) {
          console.warn('Failed to stop Tor while disconnecting from reconnect gate:', error)
        }

        resetAuthCooldowns()
        const { syncBundleServerAccessToken } = await getQuantumChatModule()
        syncBundleServerAccessToken()
        dismissPresenceGate()
      } catch (error) {
        console.warn('Failed to disconnect Tor from reconnect gate:', error)
      } finally {
        setIsTorDisconnecting(false)
      }
    })()
  }, [dismissPresenceGate, isTorDisconnecting, setTorEnabled, spectreEnabled])

  useEffect(() => {
    clearTorBridgeNavigationPending()
  }, [clearTorBridgeNavigationPending, pathname])

  useEffect(() => () => {
    abortActiveAccountRuntime()
    resetVdfActivity()
    resetMailboxCatchupBanner()
  }, [resetVdfActivity, walletAddress])

  useEffect(() => {
    return () => {
      clearTorBridgeNavigationResetTimeout()
    }
  }, [clearTorBridgeNavigationResetTimeout])

  useEffect(() => {
    if (!torEnabled || torStatus === 'connected') {
      dismissPresenceGate()
    }
  }, [dismissPresenceGate, torEnabled, torStatus])

  if (!authInitialized || walletLoading || walletInitializationError) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!hasWallet) {
    return <Redirect href={'/(auth)/welcome' as Href} />
  }

  if (!isAuthenticated || !isVaultUnlocked) {
    return <Redirect href={'/(auth)/unlock' as Href} />
  }

  return (
    <CallProvider>
      <MainErrorBoundary>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <ChatBootstrap />
          <TopChrome liveBanners={liveTopChrome} onHeightChange={handleTopChromeHeightChange}>
            {showTorBanner ? (
              <TorStatusBanner
                onDisconnect={handleDisconnectTor}
                disconnecting={isTorDisconnecting}
              />
            ) : null}
            <MailboxCatchupBanner includeTopInset={!showTorBanner} />
            <VdfProgressBanner includeTopInset={!showTorBanner && !showMailboxCatchupBanner} />
            {showContactCardBanner ? (
              <ActiveContactCardBanner includeTopInset={!showTorBanner && !showMailboxCatchupBanner && !showVdfBanner} />
            ) : null}
            <AccountSwitchReadinessBanner
              includeTopInset={!showTorBanner && !showMailboxCatchupBanner && !showVdfBanner && !showContactCardBanner}
            />
            <PendingCallRecoveryBannerHost
              includeTopInset={
                !showTorBanner
                && !showMailboxCatchupBanner
                && !showVdfBanner
                && !showContactCardBanner
                && !showAccountReadinessBanner
              }
            />
            <MinimizedCallBannerHost
              includeTopInset={
                !showTorBanner
                && !showMailboxCatchupBanner
                && !showVdfBanner
                && !showContactCardBanner
                && !showAccountReadinessBanner
              }
            />
          </TopChrome>
          <TopChromeHeightProvider value={topChromeHeight}>
            <SafeAreaInsetsContext.Provider value={bannerAwareInsets}>
              <View style={{ flex: 1 }}>
                <MainStack />
              </View>
            </SafeAreaInsetsContext.Provider>
          </TopChromeHeightProvider>
          <ContactCardShareModal />
          <TorReconnectGate
            visible={showTorGate}
            onRetry={() => {
              void startTor().catch((error) => {
                console.warn('Failed to retry Tor from reconnect gate:', error)
              })
            }}
            onConfigureBridges={navigateToTorBridges}
            onDisconnectTor={handleDisconnectTor}
            onDismissError={spectreEnabled ? undefined : dismissPresenceGate}
            disconnecting={isTorDisconnecting}
            disconnectLabel={spectreEnabled ? translate('Cancel Spectre Mode') : undefined}
            disconnectingLabel={spectreEnabled ? translate('Canceling Spectre Mode...') : undefined}
          />
          <SpectreActivationModal
            visible={spectreActivationFlow !== null}
            onClose={resetSpectreActivationProgress}
            onCancel={cancelSpectreActivation}
            onConfigureBridges={navigateToTorBridges}
          />
          <FullscreenCallHost />
        </View>
      </MainErrorBoundary>
    </CallProvider>
  )
}
