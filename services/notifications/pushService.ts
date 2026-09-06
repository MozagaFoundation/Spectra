/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { AppState, Platform } from 'react-native'
import { router, type Href } from 'expo-router'
import {
  deleteLegacyNotificationTokensForWallets,
  deleteNotificationRegistrationsByPushTokens,
  deleteNotificationRegistrationsByScopeIds,
  deleteSupersededLegacyNotificationRegistrations,
  deleteSupersededScopedNotificationRegistrations,
  type NotificationTokenRequestOptions,
  updateNotificationRegistrationsForWallets,
} from '../backend/client'
import { useAuthStore } from '@/store/authStore'
import { useWalletStore } from '@/store/walletStore'
import type { EXOWallet } from '@spectra/identity-vault'
import { isSameAccountStorageScope } from '@/lib/accountScope'
import { getCurrentLanguage } from '@/lib/i18n'
import { translateMessage } from '@/lib/i18n/messages'
import {
  buildPushNotificationRegistrations,
  buildPushRegistrationSignature,
} from './pushRegistration'
import { syncGlobalBadge } from './badgeSync'
import { getNotificationThreadKey, matchesNotificationThreadKey } from './notificationThreads'
import {
  isCallEndNotification,
  isCallLifecycleNotification,
  isIncomingCallNotification,
  isWalletIndexWakeupNotification,
  resolveNotificationRoute,
} from './notificationRouting'
import { isAuthorizedCallNotificationPayload } from './callNotificationAuthorization'
import {
  enqueueMessagingPush,
  normalizeMessagingPushPayload,
} from './notificationCoordinator'
import {
  getOrCreateNotificationScopeId,
  getNotificationScopesForWallets,
  removeNotificationScopesForWallets,
} from './notificationScope'
import {
  isClearnetEgressAllowed,
  registerClearnetOperation,
} from '@/services/tor/torEgressPolicy'
import { requestWalletIndexWakeup } from './walletIndexWakeup'
import { describeCallError, recordCallDiagnostic } from '../call/callDiagnostics'

let currentPushToken: string | null = null
let listenersRegistered = false
let notificationReceivedSubscription:
  | ReturnType<typeof Notifications.addNotificationReceivedListener>
  | null = null
let notificationResponseSubscription:
  | ReturnType<typeof Notifications.addNotificationResponseReceivedListener>
  | null = null
let pushTokenSubscription:
  | ReturnType<typeof Notifications.addPushTokenListener>
  | null = null
let lastRegisteredAddress: string | null = null
let lastRegisteredWalletSignature: string | null = null
const FOREGROUND_NOTIFICATION_DEBOUNCE_MS = 750
const PRIVATE_TRANSPORT_PUSH_CLEANUP_RETRY_DELAYS_MS = [1_000, 5_000, 15_000] as const

const pendingForegroundNotifications = new Map<string, {
  timer: ReturnType<typeof setTimeout>
  title: string
  body: string
  data?: Record<string, unknown>
}>()
const pendingPrivateTransportPushCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()

let callNotificationTaskModulePromise: Promise<typeof import('./callNotificationTask')> | null = null
const handledNotificationResponseKeys = new Set<string>()
const pendingNotificationResponseKeys = new Map<string, Promise<NotificationResponseOutcome>>()

type NotificationResponseOutcome = 'handled' | 'deferred' | 'ignored'
type NotificationResponseSource = 'listener' | 'startup' | 'post_unlock' | 'foreground'

function logPushRegistrationDiagnostic(event: string, details: Record<string, unknown>): void {
  if (Platform.OS === 'android' || (typeof __DEV__ !== 'undefined' && __DEV__)) {
    console.log('[PushNotifications]', event, details)
  }
}

function notificationTypeForLogs(data?: Record<string, unknown>): string | null {
  const type = data?.type
  return typeof type === 'string' ? type : null
}

type PushNotificationInitializationOptions = {
  forceSync?: boolean
  accessToken?: string | null
}

function getExpoProjectId(): string | undefined {
  const projectId = Constants.easConfig?.projectId
    ?? Constants.expoConfig?.extra?.eas?.projectId

  return typeof projectId === 'string' && projectId.length > 0 ? projectId : undefined
}

function getCallNotificationTaskModule(): Promise<typeof import('./callNotificationTask')> {
  if (!callNotificationTaskModulePromise) {
    callNotificationTaskModulePromise = import('./callNotificationTask')
  }

  return callNotificationTaskModulePromise
}

async function syncNotificationRegistrations(
  wallets: Array<Pick<EXOWallet, 'address' | 'displayName' | 'spectreMode'>>,
  pushToken: string | null,
  forceSync: boolean,
  options?: NotificationTokenRequestOptions,
): Promise<boolean> {
  if (!pushToken) {
    logPushRegistrationDiagnostic('sync_skipped_no_token', {
      platform: Platform.OS,
      walletCount: wallets.length,
    })
    return false
  }
  const notificationLocale = getCurrentLanguage()
  const scopedWallets = await Promise.all(wallets.map(async (wallet) => ({
    ...wallet,
    notificationScopeId: await getOrCreateNotificationScopeId(wallet.address),
  })))
  const registrations = buildPushNotificationRegistrations(
    scopedWallets,
    pushToken,
    notificationLocale,
    Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : null,
  )
  const registrationSignature = buildPushRegistrationSignature(registrations)
  const needsUpdate = forceSync
    || pushToken !== currentPushToken
    || registrationSignature !== lastRegisteredWalletSignature

  currentPushToken = pushToken
  lastRegisteredAddress = registrations[0]?.walletAddress ?? null

  if (!needsUpdate || registrations.length === 0) {
    logPushRegistrationDiagnostic('sync_skipped_current', {
      platform: Platform.OS,
      walletCount: wallets.length,
      registrationCount: registrations.length,
      needsUpdate,
      hasPushToken: Boolean(pushToken),
    })
    return registrations.length > 0
  }

  logPushRegistrationDiagnostic('sync_started', {
    platform: Platform.OS,
    walletCount: wallets.length,
    registrationCount: registrations.length,
    forceSync,
    hasPushToken: Boolean(pushToken),
  })

  const { error: pushTokenError } = options?.accessToken
    ? await updateNotificationRegistrationsForWallets(registrations, options)
    : await updateNotificationRegistrationsForWallets(registrations)
  if (pushTokenError) {
    console.warn('Failed to sync push tokens:', pushTokenError)
    logPushRegistrationDiagnostic('sync_failed', {
      platform: Platform.OS,
      error: pushTokenError.message,
    })
    return false
  } else {
    lastRegisteredWalletSignature = registrationSignature
    const { error: legacyCleanupError } = options?.accessToken
      ? await deleteSupersededLegacyNotificationRegistrations(
        registrations.map((registration) => registration.walletAddress),
        pushToken,
        options,
      )
      : await deleteSupersededLegacyNotificationRegistrations(
        registrations.map((registration) => registration.walletAddress),
        pushToken,
      )
    const { error: scopedCleanupError } = options?.accessToken
      ? await deleteSupersededScopedNotificationRegistrations(registrations, options)
      : await deleteSupersededScopedNotificationRegistrations(registrations)
    if (legacyCleanupError) {
      console.warn('Failed to clean superseded legacy push registrations:', legacyCleanupError)
    }
    if (scopedCleanupError) {
      console.warn('Failed to clean superseded scoped push registrations:', scopedCleanupError)
    }
    logPushRegistrationDiagnostic('sync_succeeded', {
      platform: Platform.OS,
      registrationCount: registrations.length,
    })
    return true
  }
}

function scheduleMessagingReconciliation(
  data: Record<string, unknown> | undefined,
  source: 'received' | 'response' | 'background',
): void {
  if (!isMessagingPushCandidate(data) || data?.localPreview === true) {
    return
  }

  void enqueueMessagingPush(data, source)
    .catch((error) => {
      console.warn('Failed to reconcile chat after push notification:', error)
    })
}

function isMessagingPushCandidate(data?: Record<string, unknown>): boolean {
  return Boolean(
    data
    && (
      data.type === 'sealed_direct_message'
      || 'notificationScopeId' in data
      || 'notificationEventId' in data
    )
  )
}

function scheduleWalletIndexWakeup(): void {
  const isAuthenticated = useAuthStore.getState().isAuthenticated
  const isVaultUnlocked = useWalletStore.getState().isVaultUnlocked
  if (!isAuthenticated || !isVaultUnlocked) {
    return
  }
  requestWalletIndexWakeup()
}

function notificationResponseKey(response: Notifications.NotificationResponse): string {
  const identifier = response.notification.request.identifier
  if (identifier) {
    return identifier
  }
  const data = response.notification.request.content.data as Record<string, unknown> | undefined
  return JSON.stringify(data ?? {})
}

function routeNotificationResponse(route: string): void {
  if (route.startsWith('/(auth)/unlock')) {
    router.push(route as Href)
    return
  }
  router.navigate(route as Href)
}

async function processNotificationResponse(
  response: Notifications.NotificationResponse,
  source: NotificationResponseSource,
  suppressCallRoute: boolean,
): Promise<NotificationResponseOutcome> {
  const data = response.notification.request.content.data as Record<string, unknown> | undefined
  const isAuthenticated = useAuthStore.getState().isAuthenticated
  const isVaultUnlocked = useWalletStore.getState().isVaultUnlocked
  logPushRegistrationDiagnostic('response_received', {
    platform: Platform.OS,
    type: notificationTypeForLogs(data),
    isAuthenticated,
    isVaultUnlocked,
  })

  if (isCallLifecycleNotification(data)) {
    let authorized = false
    try {
      authorized = await isAuthorizedCallNotificationPayload(data)
    } catch (error) {
      recordCallDiagnostic('recovery', 'notification_response_authorization_deferred', {
        source,
        vaultUnlocked: isVaultUnlocked,
        error: describeCallError(error),
      })
      return 'deferred'
    }

    if (!authorized) {
      recordCallDiagnostic('recovery', 'notification_response_authorization_deferred', {
        source,
        vaultUnlocked: isVaultUnlocked,
      })
      return 'deferred'
    }

    try {
      const { handleIncomingCallNotificationPayload } = await getCallNotificationTaskModule()
      const handled = await handleIncomingCallNotificationPayload(data)
      if (!handled) {
        recordCallDiagnostic('recovery', 'notification_response_rejected_after_authorization', {
          source,
        })
        return 'ignored'
      }
      if (isIncomingCallNotification(data)) {
        scheduleMessagingReconciliation(data, 'response')
      }
    } catch (error) {
      recordCallDiagnostic('recovery', 'notification_response_processing_failed', {
        source,
        error: describeCallError(error),
      })
      console.warn('Failed to handle notification response payload:', error)
      return 'deferred'
    }

    recordCallDiagnostic('recovery', 'notification_response_authorized', {
      source,
    })
    const route = resolveNotificationRoute(
      data,
      useAuthStore.getState().isAuthenticated,
      useWalletStore.getState().isVaultUnlocked,
    )
    if (route && !suppressCallRoute) {
      routeNotificationResponse(route)
    }
    return 'handled'
  }

  if (isMessagingPushCandidate(data)) {
    scheduleMessagingReconciliation(data, 'response')
    return 'handled'
  }

  if (isWalletIndexWakeupNotification(data)) {
    scheduleWalletIndexWakeup()
  }

  const route = resolveNotificationRoute(data, isAuthenticated, isVaultUnlocked)
  if (route) {
    routeNotificationResponse(route)
  }
  return 'handled'
}

async function clearLastCallNotificationResponse(
  response: Notifications.NotificationResponse,
): Promise<void> {
  try {
    const latest = await Notifications.getLastNotificationResponseAsync()
    if (
      latest
      && notificationResponseKey(latest) === notificationResponseKey(response)
    ) {
      await Notifications.clearLastNotificationResponseAsync()
    }
  } catch (error) {
    console.warn('Failed to clear handled call notification response:', error)
  }
}

async function handleNotificationResponse(
  response: Notifications.NotificationResponse,
  source: NotificationResponseSource,
  suppressCallRoute = false,
): Promise<NotificationResponseOutcome> {
  const data = response.notification.request.content.data as Record<string, unknown> | undefined
  if (!isCallLifecycleNotification(data) && normalizeMessagingPushPayload(data)) {
    return processNotificationResponse(response, source, false)
  }

  const key = notificationResponseKey(response)
  if (handledNotificationResponseKeys.has(key)) {
    logPushRegistrationDiagnostic('response_skipped_duplicate', {
      platform: Platform.OS,
    })
    return 'ignored'
  }

  const pending = pendingNotificationResponseKeys.get(key)
  if (pending) {
    return pending
  }

  const processing = processNotificationResponse(response, source, suppressCallRoute)
  pendingNotificationResponseKeys.set(key, processing)
  try {
    const outcome = await processing
    if (outcome === 'deferred') {
      return outcome
    }

    handledNotificationResponseKeys.add(key)
    if (outcome === 'handled' && isCallLifecycleNotification(data)) {
      await clearLastCallNotificationResponse(response)
    }
    return outcome
  } finally {
    pendingNotificationResponseKeys.delete(key)
  }
}

export async function consumeLastNotificationResponse(
  source: Exclude<NotificationResponseSource, 'listener'> = 'startup',
  options: { suppressCallRoute?: boolean } = {},
): Promise<NotificationResponseOutcome> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync()
    if (!response) {
      return 'ignored'
    }
    return await handleNotificationResponse(response, source, options.suppressCallRoute === true)
  } catch (error) {
    console.warn('Failed to consume last notification response:', error)
    return 'deferred'
  }
}

export async function consumeLastCallNotificationResponse(
  source: Extract<NotificationResponseSource, 'foreground'> = 'foreground',
): Promise<NotificationResponseOutcome> {
  try {
    const response = await Notifications.getLastNotificationResponseAsync()
    const data = response?.notification.request.content.data as Record<string, unknown> | undefined
    if (!response || !isCallLifecycleNotification(data)) {
      return 'ignored'
    }
    return await handleNotificationResponse(response, source)
  } catch (error) {
    console.warn('Failed to retry last call notification response:', error)
    return 'deferred'
  }
}

export function initializeNotificationResponseHandling(): void {
  if (notificationResponseSubscription) {
    return
  }

  notificationResponseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      void handleNotificationResponse(response, 'listener').catch((error) => {
        console.warn('Failed to handle notification response:', error)
      })
    })
  void consumeLastNotificationResponse()
}

async function scheduleImmediateNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: 'default',
    },
    trigger: null,
  })
}

export { scheduleGlobalBadgeSync, syncGlobalBadge } from './badgeSync'

function cancelPendingThreadNotification(threadKey: string): void {
  const pending = pendingForegroundNotifications.get(threadKey)
  if (!pending) return

  clearTimeout(pending.timer)
  pendingForegroundNotifications.delete(threadKey)
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined
    const isLocalPreview = data?.localPreview === true
    const isIncomingCall = isIncomingCallNotification(data)
    const isCallEnd = isCallEndNotification(data)
    const isCallNotification = isCallLifecycleNotification(data)
    const threadKey = getNotificationThreadKey(data)
    const isActiveApp = AppState.currentState === 'active'

    if (isCallNotification && !await isAuthorizedCallNotificationPayload(data)) {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
        priority: Notifications.AndroidNotificationPriority.LOW,
      }
    }

    if (isCallEnd || (isIncomingCall && isActiveApp)) {
      return {
        shouldShowAlert: false,
        shouldPlaySound: isIncomingCall && isActiveApp,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      }
    }

    if (isActiveApp && !isCallNotification && !isLocalPreview) {
      return {
        shouldShowAlert: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
        priority: Notifications.AndroidNotificationPriority.LOW,
      }
    }

    if (isActiveApp && threadKey) {
      try {
        const { useChatStore } = await import('@/store/chatStore')
        const activeId = useChatStore.getState().activeConversationId
        if (activeId && matchesNotificationThreadKey(activeId, data)) {
          return {
            shouldShowAlert: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
            shouldShowBanner: false,
            shouldShowList: false,
            priority: Notifications.AndroidNotificationPriority.LOW,
          }
        }
      } catch { /* show if store is unavailable */ }
    }

    return {
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    }
  },
})

export async function initializePushNotificationsForWallets(
  wallets: Array<Pick<EXOWallet, 'address' | 'displayName' | 'spectreMode'>>,
  options: PushNotificationInitializationOptions = {},
): Promise<boolean> {
  if (!isClearnetEgressAllowed()) return false
  const candidateWallets = wallets.filter(
    (wallet) => wallet.address.trim().length > 0 && wallet.spectreMode !== true,
  )
  if (candidateWallets.length === 0) return false

  try {
    const { registerCallNotificationTask } = await getCallNotificationTaskModule()
    await registerCallNotificationTask().catch((error) => {
      console.warn('Failed to register call notification task:', error)
    })

    const token = await registerForPushNotifications()
    const synchronized = await syncNotificationRegistrations(
      candidateWallets,
      token,
      options.forceSync === true,
      { accessToken: options.accessToken },
    )

    if (!listenersRegistered) {
      setupNotificationListeners()
      listenersRegistered = true
    }
    return synchronized
  } catch (error) {
    console.warn('Failed to initialize push notifications:', error)
    return false
  }
}

export interface NotificationCleanupSnapshot {
  walletAddresses: string[]
  notificationScopeIds: string[]
  pushTokens: string[]
}

export async function captureNotificationCleanupSnapshot(
  walletAddresses: string[],
): Promise<NotificationCleanupSnapshot> {
  const addresses = normalizeWalletAddresses(walletAddresses)
  const scopes = await getNotificationScopesForWallets(addresses)
  return {
    walletAddresses: addresses,
    notificationScopeIds: scopes.map((entry) => entry.notificationScopeId),
    pushTokens: currentPushToken ? [currentPushToken] : [],
  }
}

export async function revokeNotificationCleanupSnapshot(
  snapshot: NotificationCleanupSnapshot,
  options: NotificationTokenRequestOptions,
): Promise<void> {
  if (!options.accessToken) {
    throw new Error('Notification cleanup requires backend auth')
  }
  const results = await Promise.all([
    deleteNotificationRegistrationsByScopeIds(snapshot.notificationScopeIds, options),
    deleteNotificationRegistrationsByPushTokens(snapshot.pushTokens, options),
    deleteLegacyNotificationTokensForWallets(snapshot.walletAddresses, options),
  ])
  const failure = results.find((result) => result.error)?.error
  if (failure) {
    throw failure
  }
}

export async function deactivateNotificationRuntime(): Promise<void> {
  for (const pending of pendingForegroundNotifications.values()) {
    clearTimeout(pending.timer)
  }
  pendingForegroundNotifications.clear()
  for (const timer of pendingPrivateTransportPushCleanupTimers.values()) {
    clearTimeout(timer)
  }
  pendingPrivateTransportPushCleanupTimers.clear()
  handledNotificationResponseKeys.clear()

  notificationReceivedSubscription?.remove()
  notificationReceivedSubscription = null
  notificationResponseSubscription?.remove()
  notificationResponseSubscription = null
  pushTokenSubscription?.remove()
  pushTokenSubscription = null
  listenersRegistered = false

  const { unregisterCallNotificationTask } = await getCallNotificationTaskModule()
  const { clearPrefetchSession } = await import('./prefetchSession')
  const { clearSealedPrefetchRows } = await import('@/services/storage/sealedPrefetchCache')
  await Promise.allSettled([
    unregisterCallNotificationTask(),
    Notifications.dismissAllNotificationsAsync(),
    Notifications.setBadgeCountAsync(0),
    clearPrefetchSession(),
    clearSealedPrefetchRows(),
  ])

  currentPushToken = null
  lastRegisteredAddress = null
  lastRegisteredWalletSignature = null
}

export async function deregisterPushTokens(
  exoAddress: string,
  options?: NotificationTokenRequestOptions,
): Promise<void> {
  if (!exoAddress) {
    return
  }

  try {
    const scopes = await getNotificationScopesForWallets([exoAddress])
    const [{ error: scopedError }, { error: legacyError }] = await Promise.all([
      deleteNotificationRegistrationsByScopeIds(
        scopes.map((entry) => entry.notificationScopeId),
        options,
      ),
      deleteLegacyNotificationTokensForWallets([exoAddress], options),
    ])
    if (scopedError || legacyError) {
      throw scopedError ?? legacyError
    }
    if (lastRegisteredAddress === exoAddress) {
      lastRegisteredAddress = null
    }
    currentPushToken = null
    lastRegisteredWalletSignature = null
    await removeNotificationScopesForWallets([exoAddress])
  } catch (error) {
    console.warn('Failed to deregister push tokens:', error)
    throw error
  }
}

function normalizeWalletAddresses(exoAddresses: string[]): string[] {
  return [...new Set(
    exoAddresses
      .map((exoAddress) => exoAddress.trim())
      .filter((exoAddress) => exoAddress.length > 0),
  )]
}

export async function deregisterPushTokensForWallets(
  exoAddresses: string[],
  options?: NotificationTokenRequestOptions,
): Promise<void> {
  const uniqueAddresses = normalizeWalletAddresses(exoAddresses)

  if (uniqueAddresses.length === 0) {
    return
  }

  try {
    const scopes = await getNotificationScopesForWallets(uniqueAddresses)
    const [{ error: scopedError }, { error: legacyError }] = await Promise.all([
      deleteNotificationRegistrationsByScopeIds(
        scopes.map((entry) => entry.notificationScopeId),
        options,
      ),
      deleteLegacyNotificationTokensForWallets(uniqueAddresses, options),
    ])
    if (scopedError || legacyError) {
      throw scopedError ?? legacyError
    }

    if (lastRegisteredAddress && uniqueAddresses.includes(lastRegisteredAddress)) {
      lastRegisteredAddress = null
    }
    currentPushToken = null
    lastRegisteredWalletSignature = null
    await removeNotificationScopesForWallets(uniqueAddresses)
  } catch (error) {
    console.warn('Failed to deregister push tokens in batch:', error)
    throw error
  }
}

export async function schedulePrivateTransportPushTokenCleanup(
  exoAddresses: string[],
  options?: NotificationTokenRequestOptions,
): Promise<void> {
  const uniqueAddresses = normalizeWalletAddresses(exoAddresses)
  if (uniqueAddresses.length === 0) {
    return
  }
  const scopes = await getNotificationScopesForWallets(uniqueAddresses)
  const pushTokens = currentPushToken ? [currentPushToken] : []

  const cleanupKey = uniqueAddresses.join('|')
  const existingTimer = pendingPrivateTransportPushCleanupTimers.get(cleanupKey)
  if (existingTimer) {
    clearTimeout(existingTimer)
    pendingPrivateTransportPushCleanupTimers.delete(cleanupKey)
  }

  const cleanupRemoteRegistrations = async (
    addresses: string[],
    notificationScopeIds: string[],
  ): Promise<void> => {
    const [{ error: scopedError }, { error: tokenError }, { error: legacyError }] = await Promise.all([
      deleteNotificationRegistrationsByScopeIds(notificationScopeIds, options),
      deleteNotificationRegistrationsByPushTokens(pushTokens, options),
      deleteLegacyNotificationTokensForWallets(addresses, options),
    ])
    if (scopedError || tokenError || legacyError) {
      throw scopedError ?? tokenError ?? legacyError
    }
  }

  const finalizeCleanup = async (): Promise<void> => {
    if (lastRegisteredAddress && uniqueAddresses.includes(lastRegisteredAddress)) {
      lastRegisteredAddress = null
    }
    currentPushToken = null
    lastRegisteredWalletSignature = null
    await removeNotificationScopesForWallets(uniqueAddresses)
  }

  const runAttempt = async (attempt: number): Promise<void> => {
    try {
      await cleanupRemoteRegistrations(
        uniqueAddresses,
        scopes.map((entry) => entry.notificationScopeId),
      )
      await finalizeCleanup()
    } catch (error) {
      const delayMs = PRIVATE_TRANSPORT_PUSH_CLEANUP_RETRY_DELAYS_MS[attempt]
      if (delayMs === undefined) {
        console.warn('Failed to clear private-transport push tokens after retries:', error)
        throw error
      }

      const fallbackResults = await Promise.allSettled(
        uniqueAddresses.map((exoAddress) => cleanupRemoteRegistrations(
          [exoAddress],
          scopes
            .filter((entry) => isSameAccountStorageScope(entry.walletAddress, exoAddress))
            .map((entry) => entry.notificationScopeId),
        )),
      )
      if (fallbackResults.every((result) => result.status === 'fulfilled')) {
        await finalizeCleanup()
        return
      }

      const retryPromise = new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          pendingPrivateTransportPushCleanupTimers.delete(cleanupKey)
          resolve()
        }, delayMs)
        pendingPrivateTransportPushCleanupTimers.set(cleanupKey, timer)
      })
      await retryPromise
      return runAttempt(attempt + 1)
    }
  }

  await runAttempt(0)
}

async function registerForPushNotifications(): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus
  logPushRegistrationDiagnostic('permission_status', {
    platform: Platform.OS,
    existingStatus,
  })

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
    logPushRegistrationDiagnostic('permission_requested', {
      platform: Platform.OS,
      finalStatus,
    })
  }

  if (finalStatus !== 'granted') {
    console.warn('Push notification permission not granted')
    logPushRegistrationDiagnostic('permission_denied', {
      platform: Platform.OS,
      finalStatus,
    })
    return null
  }
  if (!isClearnetEgressAllowed()) {
    return null
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: translateMessage('Default'),
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#a7da57',
    })

    await Notifications.setNotificationChannelAsync('messages', {
      name: translateMessage('Messages'),
      description: translateMessage('New message notifications'),
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#a7da57',
      sound: 'default',
    })

    await Notifications.setNotificationChannelAsync('calls', {
      name: translateMessage('Calls'),
      description: translateMessage('Secure call notifications'),
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 250, 400],
      lightColor: '#22c55e',
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    })

    await Notifications.setNotificationChannelAsync('transfers', {
      name: translateMessage('Transfers'),
      description: translateMessage('Wallet transfer notifications'),
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#a7da57',
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    })
    logPushRegistrationDiagnostic('android_channels_ready', {
      platform: Platform.OS,
      channels: ['default', 'messages', 'calls', 'transfers'],
    })
  }

  try {
    if (!isClearnetEgressAllowed()) {
      return null
    }
    const projectId = getExpoProjectId()
    let tokenRequest: ReturnType<typeof Notifications.getExpoPushTokenAsync> | null = null
    const unregister = registerClearnetOperation(async () => {
      await tokenRequest?.catch(() => undefined)
    })
    tokenRequest = Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
    const tokenData = await tokenRequest.finally(unregister)
    if (!isClearnetEgressAllowed()) {
      return null
    }
    logPushRegistrationDiagnostic('token_ready', {
      platform: Platform.OS,
      hasProjectId: Boolean(projectId),
      hasToken: Boolean(tokenData.data),
      permissionStatus: finalStatus,
    })
    return tokenData.data
  } catch (error) {
    console.warn('Failed to get Expo push token:', error)
    logPushRegistrationDiagnostic('token_failed', {
      platform: Platform.OS,
      hasProjectId: Boolean(getExpoProjectId()),
      permissionStatus: finalStatus,
    })
    return null
  }
}

async function ingestRotatedDevicePushToken(
  devicePushToken: Notifications.DevicePushToken,
): Promise<void> {
  if (!isClearnetEgressAllowed()) return
  const wallet = useWalletStore.getState().wallet
  if (!wallet?.address || wallet.spectreMode === true) return

  try {
    const projectId = getExpoProjectId()
    let tokenRequest: ReturnType<typeof Notifications.getExpoPushTokenAsync> | null = null
    const unregister = registerClearnetOperation(async () => {
      await tokenRequest?.catch(() => undefined)
    })
    tokenRequest = Notifications.getExpoPushTokenAsync({
      ...(projectId ? { projectId } : {}),
      devicePushToken,
    })
    const tokenData = await tokenRequest.finally(unregister)
    if (!isClearnetEgressAllowed() || !tokenData.data) return
    await syncNotificationRegistrations(
      [{
        address: wallet.address,
        displayName: wallet.displayName,
        spectreMode: wallet.spectreMode,
      }],
      tokenData.data,
      true,
    )
  } catch (error) {
    console.warn('Failed to sync rotated push token:', error)
  }
}

function setupNotificationListeners(): void {
  if (!pushTokenSubscription) {
    pushTokenSubscription = Notifications.addPushTokenListener((devicePushToken) => {
      void ingestRotatedDevicePushToken(devicePushToken)
    })
  }

  if (!notificationReceivedSubscription) {
    notificationReceivedSubscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as Record<string, unknown> | undefined
      logPushRegistrationDiagnostic('notification_received', {
        platform: Platform.OS,
        type: notificationTypeForLogs(data),
        appState: AppState.currentState,
      })
      if (isCallLifecycleNotification(data)) {
        void getCallNotificationTaskModule()
          .then(async ({ handleIncomingCallNotificationPayload }) => {
            const handled = await handleIncomingCallNotificationPayload(data)
            if (handled && isIncomingCallNotification(data)) {
              scheduleMessagingReconciliation(data, 'received')
            }
          })
          .catch((error) => {
            console.warn('Failed to handle incoming call notification payload:', error)
          })
        return
      }

      if (isMessagingPushCandidate(data)) {
        scheduleMessagingReconciliation(data, 'received')
      }

      if (isWalletIndexWakeupNotification(data)) {
        scheduleWalletIndexWakeup()
      }
    })
  }

  initializeNotificationResponseHandling()
}

export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const threadKey = getNotificationThreadKey(data)
  const payload = data ? { ...data, localPreview: true } : { localPreview: true }

  if (!threadKey) {
    await scheduleImmediateNotification(title, body, payload)
    return
  }

  cancelPendingThreadNotification(threadKey)
  const timer = setTimeout(() => {
    const pending = pendingForegroundNotifications.get(threadKey)
    if (!pending) return

    pendingForegroundNotifications.delete(threadKey)
    dismissNotificationsForConversation(threadKey)
      .catch(() => {})
      .finally(() => {
        scheduleImmediateNotification(
          pending.title,
          pending.body,
          pending.data ? { ...pending.data, localPreview: true } : { localPreview: true },
        ).catch(() => {})
      })
  }, FOREGROUND_NOTIFICATION_DEBOUNCE_MS)

  pendingForegroundNotifications.set(threadKey, {
    timer,
    title,
    body,
    data,
  })
}

export async function dismissCallNotifications(callSessionId: string): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync()
    for (const notification of presented) {
      const data = notification.request.content.data as Record<string, unknown> | undefined
      if (
        data?.callSessionId === callSessionId
        && (data?.type === 'call' || data?.type === 'call_end')
      ) {
        await Notifications.dismissNotificationAsync(notification.request.identifier)
      }
    }
  } catch (error) {
    console.warn('Failed to dismiss call notifications:', error)
  }
}

export async function dismissNotificationsForConversation(conversationId: string): Promise<void> {
  for (const [threadKey, pending] of pendingForegroundNotifications.entries()) {
    if (threadKey === conversationId || matchesNotificationThreadKey(conversationId, pending.data)) {
      clearTimeout(pending.timer)
      pendingForegroundNotifications.delete(threadKey)
    }
  }

  try {
    const presented = await Notifications.getPresentedNotificationsAsync()
    for (const notification of presented) {
      const data = notification.request.content.data as Record<string, unknown> | undefined
      if (matchesNotificationThreadKey(conversationId, data)) {
        await Notifications.dismissNotificationAsync(notification.request.identifier)
      }
    }
  } catch (error) {
    console.warn('Failed to dismiss notifications for conversation:', error)
  }
}

export function getCurrentPushToken(): string | null {
  return currentPushToken
}
