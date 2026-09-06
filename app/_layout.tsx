/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import '../global.css'

import React, { useEffect, useRef, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import { Stack } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppState, InteractionManager, Text, View } from 'react-native'
import { useColorScheme, vars } from 'nativewind'
import { I18nextProvider, useTranslation } from 'react-i18next'

import { SpectraBackdrop } from '@/components/common/SpectraBackdrop'
import { AccountDeletionProgressModal } from '@/components/common/AccountDeletionProgressModal'
import { AppUpdateGate } from '@/components/common/AppUpdateGate'

import i18n from '@/lib/i18n'
import { patchReactNativeAlerts } from '@/lib/i18n/native'
import { startEventLoopLatencyMonitor } from '@/lib/performanceMetrics'
import { clearPendingContactShareAddress } from '@/lib/pendingContactShare'
import { darkColors, lightColors, spectreColors, type ThemeColors, useIsSpectreThemeActive, useThemeColors } from '@/lib/theme'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import { useUIStore } from '@/store/uiStore'
import { useVdfBannerPreferenceStore } from '@/store/vdfBannerPreferenceStore'
import { useTorStore } from '@/services/tor/torStore'
import { TOR_CONFIG } from '@/services/tor/torConstants'
import { initializeSpectreRuntime } from '@/services/security/spectreRuntime'
import { reconcileSpectreModeOnStartup } from '@/services/security/spectreMode'
import { initializeSpectreAccessState } from '@/services/backend/spectreAccess'
import { refreshAppUpdatePolicy } from '@/services/backend/appUpdatePolicy'
import {
  getAppSwitcherPrivacyEnabled,
  subscribeToAppSwitcherPrivacy,
} from '@/services/security/appSwitcherPrivacy'
import {
  setRootScreenCaptureProtectionEnabled,
  subscribeToSensitiveScreenProtection,
} from '@/services/security/screenCaptureProtection'
import {
  getScreenshotProtectionEnabled,
  subscribeToScreenshotProtection,
} from '@/services/security/screenshotProtection'
import { shouldSuppressAppStateSecurityForNativeAuth } from '@/services/security/nativeAuthState'
import { peekAutoLockSettings } from '@/services/security/autoLockPreference'
import { hasActiveCallActivity } from '@/services/call/callActivityGate'
import { registerAccountRuntimeResetListener } from '@/services/shared/accountRuntimeLifecycle'

registerAccountRuntimeResetListener(clearPendingContactShareAddress)

let torServiceModulePromise: Promise<typeof import('@/services/tor/torService')> | null = null
let pushServiceModulePromise: Promise<typeof import('@/services/notifications/pushService')> | null = null
let notificationRegistrationModulePromise:
  | Promise<typeof import('@/services/notifications/registrationCoordinator')>
  | null = null
let dataProtectionModulePromise: Promise<typeof import('@/services/security/dataProtection')> | null = null
let installLifecycleModulePromise: Promise<typeof import('@/services/security/installLifecycle')> | null = null

function getTorServiceModule() {
  if (!torServiceModulePromise) {
    torServiceModulePromise = import('@/services/tor/torService')
  }

  return torServiceModulePromise
}

function getPushServiceModule() {
  if (!pushServiceModulePromise) {
    pushServiceModulePromise = import('@/services/notifications/pushService')
  }

  return pushServiceModulePromise
}

function getNotificationRegistrationModule() {
  if (!notificationRegistrationModulePromise) {
    notificationRegistrationModulePromise = import(
      '@/services/notifications/registrationCoordinator'
    )
  }

  return notificationRegistrationModulePromise
}

function getDataProtectionModule() {
  if (!dataProtectionModulePromise) {
    dataProtectionModulePromise = import('@/services/security/dataProtection')
  }

  return dataProtectionModulePromise
}

function getInstallLifecycleModule() {
  if (!installLifecycleModulePromise) {
    installLifecycleModulePromise = import('@/services/security/installLifecycle')
  }

  return installLifecycleModulePromise
}

async function ensurePersistedTorTransport(reason: 'startup' | 'foreground_resume'): Promise<void> {
  if (!useTorStore.getState().enabled) return
  if (__DEV__) console.log('[TOR] Tor was previously enabled — ensuring transport readiness')
  try {
    const { ensureTorReady } = await getTorServiceModule()
    const ready = await ensureTorReady({ reason })
    const torState = useTorStore.getState()
    if (!ready && torState.enabled && torState.status === 'error') {
      torState.requestPresenceGate(reason)
    }
  } catch (error) {
    console.warn('[TOR] Auto-start failed:', error)
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      gcTime: 1000 * 60 * 30,
    },
  },
})

function buildThemeVars(colors: ThemeColors) {
  return vars({
    '--color-primary': colors.primary,
    '--color-primary-dark': colors.primaryDark,
    '--color-primary-light': colors.primaryLight,
    '--color-gold': colors.gold,
    '--color-background': colors.background,
    '--color-background-secondary': colors.backgroundSecondary,
    '--color-background-tertiary': colors.backgroundTertiary,
    '--color-surface': colors.surface,
    '--color-surface-hover': colors.surfaceHover,
    '--color-surface-active': colors.surfaceActive,
    '--color-border': colors.border,
    '--color-border-light': colors.borderLight,
    '--color-text': colors.text,
    '--color-text-secondary': colors.textSecondary,
    '--color-text-tertiary': colors.textTertiary,
    '--color-text-muted': colors.textMuted,
    '--color-success': colors.success,
    '--color-success-light': colors.successLight,
    '--color-warning': colors.warning,
    '--color-warning-light': colors.warningLight,
    '--color-error': colors.error,
    '--color-error-light': colors.errorLight,
    '--color-info': colors.info,
    '--color-info-light': colors.infoLight,
    '--color-message-sent': colors.messageSent,
    '--color-message-received': colors.messageReceived,
    '--color-text-on-primary': colors.textOnPrimary,
  })
}

const lightThemeVars = buildThemeVars(lightColors)
const darkThemeVars = buildThemeVars(darkColors)
const spectreThemeVars = buildThemeVars(spectreColors)

function ThemeSynchronizer({ privacyScreenVisible }: { privacyScreenVisible: boolean }) {
  const isDarkMode = useUIStore((state) => state.isDarkMode)
  const spectreThemeActive = useIsSpectreThemeActive()
  const { setColorScheme } = useColorScheme()
  const colors = useThemeColors()
  const { t } = useTranslation('navigation')
  const themeVars = spectreThemeActive ? spectreThemeVars : isDarkMode ? darkThemeVars : lightThemeVars
  const colorScheme = spectreThemeActive || isDarkMode ? 'dark' : 'light'

  useEffect(() => {
    setColorScheme(colorScheme)
  }, [colorScheme, setColorScheme])

  return (
    <View style={[{ flex: 1 }, themeVars]}>
      <SpectraBackdrop />
      <StatusBar style={colors.statusBarStyle} />
      <Stack
        screenOptions={{
          headerShown: false,
          headerBackVisible: false,
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(main)" />
      </Stack>
      <AccountDeletionProgressModal />
      <AppUpdateGate />
      {privacyScreenVisible && (
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
          style={{ backgroundColor: '#0c0c0c' }}
        >
          <View
            className="px-6 py-4 rounded-3xl border"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <Text className="text-text font-semibold text-base text-center">
              {t('Spectra Locked')}
            </Text>
            <Text className="text-text-secondary text-sm text-center mt-1">
              {t('Content hidden in app switcher')}
            </Text>
          </View>
        </View>
      )}
    </View>
  )
}

export default function RootLayout() {
  const initRef = useRef(false)
  const lastBackgroundedAtRef = useRef<number | null>(null)
  const privacyEnabledRef = useRef(true)
  const privacyPreferenceEnabledRef = useRef(true)
  const sensitivePrivacyEnabledRef = useRef(false)
  const privacyHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const torBackgroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [privacyScreenVisible, setPrivacyScreenVisible] = useState(false)
  const [globalScreenshotProtectionEnabled, setGlobalScreenshotProtectionEnabled] = useState(true)
  const remoteScreenshotProtectionEnabled = useChatStore((state) => {
    const activeConversationId = state.activeConversationId
    if (!activeConversationId) return false
    const activeConversation = state.conversations.find(
      (conversation) => conversation.id === activeConversationId,
    )
    return Boolean(
      activeConversation
      && activeConversation.type !== 'group'
      && activeConversation.remoteScreenshotProtection,
    )
  })

  useEffect(() => {
    patchReactNativeAlerts()
  }, [])

  useEffect(() => {
    let cancelled = false
    void getPushServiceModule()
      .then(({ initializeNotificationResponseHandling }) => {
        if (!cancelled) {
          initializeNotificationResponseHandling()
        }
      })
      .catch((error) => {
        console.warn('Notification response initialization failed:', error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void import('@/services/storage/retiredFeatureCleanup')
        .then(({ purgeRetiredFeatureStorage }) => purgeRetiredFeatureStorage())
        .catch(() => undefined)
    })
    return () => task.cancel()
  }, [])

  useEffect(() => startEventLoopLatencyMonitor(), [])

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    const runInitializer = async (
      label: string,
      initializer: () => Promise<void>,
    ): Promise<void> => {
      try {
        await initializer()
      } catch (error) {
        console.warn(`${label} init error:`, error)
      }
    }

    async function prepare() {
      await runInitializer('Install lifecycle', async () => {
        const { reconcileSecureStoreForCurrentInstall } = await getInstallLifecycleModule()
        await reconcileSecureStoreForCurrentInstall()
      })
      const pendingDeletionModule = await import(
        '@/services/security/persistedSensitiveData'
      )
      if (await pendingDeletionModule.hasPendingAccountDeletionOperation()) {
        await runInitializer('TOR', () => useTorStore.getState().initialize())
        await ensurePersistedTorTransport('startup')
        await runInitializer('Account deletion recovery', async () => {
          const { resumePendingAccountDeletionOnStartup } = await import(
            '@/services/accountLifecycle/permanentAccountDeletion'
          )
          await resumePendingAccountDeletionOnStartup()
        })
        if (await pendingDeletionModule.hasPendingAccountDeletionOperation()) {
          return
        }
      }
      await Promise.all([
        runInitializer('Spectre', () => useSpectreStore.getState().initialize()),
        runInitializer('Spectre access', initializeSpectreAccessState),
        runInitializer('Auth', () => useAuthStore.getState().initialize()),
        runInitializer('Wallet', () => useWalletStore.getState().initialize()),
        runInitializer('UI', () => useUIStore.getState().loadSettings()),
        runInitializer('VDF banner preference', () => useVdfBannerPreferenceStore.getState().hydrate()),
        runInitializer('TOR', () => useTorStore.getState().initialize()),
      ])
      await runInitializer('Cache privacy', async () => {
        const { initializeCachePrivacySettings } = await getDataProtectionModule()
        await initializeCachePrivacySettings()
      })

      try { initializeSpectreRuntime() }
      catch (e) { console.warn('Spectre runtime init error:', e) }

      await runInitializer('Spectre recovery', reconcileSpectreModeOnStartup)
      await runInitializer('Pending messaging', async () => {
        const { consumePendingMessagingNotifications } = await import(
          '@/services/notifications/notificationCoordinator'
        )
        await consumePendingMessagingNotifications('bootstrap')
      })

      void refreshAppUpdatePolicy().catch(() => undefined)
    }

    prepare()
  }, [])

  useEffect(() => {
    let isMounted = true

    const clearHideTimer = () => {
      if (privacyHideTimeoutRef.current) {
        clearTimeout(privacyHideTimeoutRef.current)
        privacyHideTimeoutRef.current = null
      }
    }

    const syncEffectivePrivacy = () => {
      const enabled =
        privacyPreferenceEnabledRef.current || sensitivePrivacyEnabledRef.current
      privacyEnabledRef.current = enabled
      if (!enabled) {
        clearHideTimer()
        setPrivacyScreenVisible(false)
      }
    }

    void getAppSwitcherPrivacyEnabled()
      .then((enabled) => {
        if (!isMounted) return
        privacyPreferenceEnabledRef.current = enabled
        syncEffectivePrivacy()
      })
      .catch((error) => {
        console.warn('Failed to load app switcher privacy preference:', error)
      })

    const unsubscribePreference = subscribeToAppSwitcherPrivacy((enabled) => {
      privacyPreferenceEnabledRef.current = enabled
      syncEffectivePrivacy()
    })
    const unsubscribeSensitive = subscribeToSensitiveScreenProtection((enabled) => {
      sensitivePrivacyEnabledRef.current = enabled
      syncEffectivePrivacy()
    })

    return () => {
      isMounted = false
      clearHideTimer()
      unsubscribePreference()
      unsubscribeSensitive()
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    void getScreenshotProtectionEnabled()
      .then((enabled) => {
        if (!isMounted) return
        setGlobalScreenshotProtectionEnabled(enabled)
      })
      .catch((error) => {
        console.warn('Failed to load screenshot protection preference:', error)
      })

    const unsubscribe = subscribeToScreenshotProtection((enabled) => {
      setGlobalScreenshotProtectionEnabled(enabled)
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    void setRootScreenCaptureProtectionEnabled(
      globalScreenshotProtectionEnabled || remoteScreenshotProtectionEnabled,
    )
  }, [globalScreenshotProtectionEnabled, remoteScreenshotProtectionEnabled])

  useEffect(() => {
    return () => {
      void setRootScreenCaptureProtectionEnabled(false)
    }
  }, [])

  const exoAddress = useAuthStore((s) => s.exoAddress)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isVaultUnlocked = useWalletStore((s) => s.isVaultUnlocked)
  const activePushWallet = useWalletStore((s) => s.wallet)
  const appLanguage = useUIStore((s) => s.appLanguage)
  const spectreLoaded = useSpectreStore((s) => s.isLoaded)
  const spectreEnabled = useSpectreStore((s) => s.enabled)
  const spectreApplying = useSpectreStore((s) => s.isApplying)
  const torEnabled = useTorStore((s) => s.enabled)
  const torInitialized = useTorStore((s) => s.initialized)

  useEffect(() => {
    if (!isAuthenticated || !isVaultUnlocked) {
      return
    }

    let cancelled = false
    void getPushServiceModule()
      .then(({ consumeLastCallNotificationResponse }) => {
        if (!cancelled) {
          return consumeLastCallNotificationResponse()
        }
        return undefined
      })
      .catch((error) => {
        console.warn('Authenticated notification response retry failed:', error)
      })

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, isVaultUnlocked])

  useEffect(() => {
    if (!isVaultUnlocked || !torEnabled || !torInitialized) {
      return
    }

    void ensurePersistedTorTransport('startup')
  }, [isVaultUnlocked, torEnabled, torInitialized])

  useEffect(() => {
    if (!spectreLoaded || !torInitialized || !exoAddress || spectreApplying || !isVaultUnlocked) {
      return
    }

    const activePushWalletAddress = activePushWallet?.spectreMode === true
      ? null
      : activePushWallet?.address

    const task = InteractionManager.runAfterInteractions(() => {
      if (spectreEnabled || torEnabled) {
        if (!activePushWalletAddress) return
        getPushServiceModule()
          .then(({ schedulePrivateTransportPushTokenCleanup }) =>
            schedulePrivateTransportPushTokenCleanup([activePushWalletAddress])
          )
          .catch((e) => {
            console.warn('Push deregistration error:', e)
          })
        return
      }

      getNotificationRegistrationModule()
        .then(async ({ synchronizeActiveWalletPushRegistration }) => {
          await synchronizeActiveWalletPushRegistration()
          const { consumePendingMessagingNotifications } = await import(
            '@/services/notifications/notificationCoordinator'
          )
          await consumePendingMessagingNotifications('bootstrap')
        })
        .catch((e) => {
          console.warn('Push re-registration error:', e)
        })
    })

    return () => {
      task.cancel()
    }
  }, [
    activePushWallet?.address,
    activePushWallet?.displayName,
    activePushWallet?.spectreMode,
    appLanguage,
    exoAddress,
    isVaultUnlocked,
    spectreApplying,
    spectreEnabled,
    spectreLoaded,
    torEnabled,
    torInitialized,
  ])

  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active')
    const subscription = AppState.addEventListener('change', (nextState) => {
      focusManager.setFocused(nextState === 'active')
      if (privacyHideTimeoutRef.current) {
        clearTimeout(privacyHideTimeoutRef.current)
        privacyHideTimeoutRef.current = null
      }

      const nativeAuthTransition = shouldSuppressAppStateSecurityForNativeAuth()

      if (nextState === 'background' || nextState === 'inactive') {
        if (nextState === 'inactive' && nativeAuthTransition) {
          return
        }

        if (privacyEnabledRef.current) {
          setPrivacyScreenVisible(true)
        }
        lastBackgroundedAtRef.current = Date.now()
        void getDataProtectionModule()
          .then(({ readAutoLockSettings }) => readAutoLockSettings())
          .catch(() => undefined)

        if (nextState === 'background') {
          const torState = useTorStore.getState()
          const spectreState = useSpectreStore.getState()
          if (!spectreState.enabled && torState.enabled && torState.status === 'connected') {
            if (torBackgroundTimerRef.current) {
              clearTimeout(torBackgroundTimerRef.current)
            }
            torBackgroundTimerRef.current = setTimeout(() => {
              torBackgroundTimerRef.current = null
              const currentTorState = useTorStore.getState()
              if (currentTorState.enabled && currentTorState.status === 'connected') {
                if (__DEV__) console.log('[TOR] App backgrounded for grace period — pausing Tor daemon')
                void getTorServiceModule()
                  .then(({ stopTor }) => stopTor())
                  .catch(() => {})
              }
            }, TOR_CONFIG.BACKGROUND_GRACE_PERIOD_MS)
          }
        }

        return
      }

      if (nextState !== 'active') {
        return
      }

      if (nativeAuthTransition) {
        lastBackgroundedAtRef.current = null
        setPrivacyScreenVisible(false)
        return
      }

      if (torBackgroundTimerRef.current) {
        clearTimeout(torBackgroundTimerRef.current)
        torBackgroundTimerRef.current = null
        if (__DEV__) console.log('[TOR] App foregrounded within grace period — keeping Tor alive')
      }

      if (privacyEnabledRef.current) {
        privacyHideTimeoutRef.current = setTimeout(() => {
          setPrivacyScreenVisible(false)
          privacyHideTimeoutRef.current = null
        }, 250)
      } else {
        setPrivacyScreenVisible(false)
      }

      const authState = useAuthStore.getState()
      const walletState = useWalletStore.getState()
      if (authState.initializationError) {
        authState.initialize().catch((error) => {
          console.warn('Auth re-init error:', error)
        })
      }
      if (walletState.initializationError) {
        walletState.initialize().catch((error) => {
          console.warn('Wallet re-init error:', error)
        })
      }

      const lastBackgroundedAt = lastBackgroundedAtRef.current
      lastBackgroundedAtRef.current = null

      if (lastBackgroundedAt && authState.isAuthenticated && walletState.isVaultUnlocked) {
        void getPushServiceModule()
          .then(({ consumeLastCallNotificationResponse }) =>
            consumeLastCallNotificationResponse()
          )
          .catch((error) => {
            console.warn('Foreground notification response retry failed:', error)
          })
        void getNotificationRegistrationModule()
          .then(({ synchronizeActiveWalletPushRegistration }) =>
            synchronizeActiveWalletPushRegistration()
          )
          .catch((error) => {
            console.warn('Foreground push token refresh failed:', error)
          })
      }

      const torState = useTorStore.getState()
      const spectreState = useSpectreStore.getState()
      if (torState.enabled) {
        if (__DEV__) console.log('[TOR] App foregrounded — validating Tor transport')
        void getTorServiceModule()
          .then(async ({ ensureTorReady }) => {
            const ready = await ensureTorReady({
              reason: 'foreground_resume',
            })
            const currentTorState = useTorStore.getState()
            const currentSpectreState = useSpectreStore.getState()
            if (!ready && !currentSpectreState.enabled && currentTorState.enabled && currentTorState.status === 'error') {
              currentTorState.requestPresenceGate('foreground_resume')
            }
          })
          .catch((e) => console.warn('[TOR] Resume failed:', e))
      }
      void refreshAppUpdatePolicy().catch(() => undefined)

      if (!lastBackgroundedAt) {
        return
      }

      const { isVaultUnlocked } = useWalletStore.getState()
      if (!isVaultUnlocked || !authState.isAuthenticated) {
        return
      }

      const cachedAutoLock = peekAutoLockSettings()
      const lockIfDue = (
        enabled: boolean,
        timeoutMs: number,
        lockActiveSession: () => Promise<void>,
      ) => {
        if (!enabled) return
        if (hasActiveCallActivity()) return
        if (timeoutMs === 0 || Date.now() - lastBackgroundedAt >= timeoutMs) {
          return lockActiveSession()
        }
      }

      if (cachedAutoLock) {
        void getDataProtectionModule()
          .then(({ lockActiveSession }) => lockIfDue(
            cachedAutoLock.enabled,
            cachedAutoLock.timeoutMs,
            lockActiveSession,
          ))
          .catch((error) => {
            console.warn('Auto-lock check failed:', error)
          })
        return
      }

      void getDataProtectionModule()
        .then(({ readAutoLockSettings, lockActiveSession }) =>
          readAutoLockSettings().then(({ enabled, timeoutMs }) =>
            lockIfDue(enabled, timeoutMs, lockActiveSession)
          )
        )
        .catch((error) => {
          console.warn('Auto-lock check failed:', error)
        })
    })

    return () => {
      subscription.remove()
    }
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider preload={false}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <I18nextProvider i18n={i18n}>
              <ThemeSynchronizer privacyScreenVisible={privacyScreenVisible} />
            </I18nextProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  )
}
