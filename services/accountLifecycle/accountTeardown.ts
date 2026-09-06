/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'

import { deleteBackendAccount } from '@/services/backend/account'
import { revokeBackendSession } from '@/services/backend/auth'
import { invalidateAuthCaches } from '@/services/backend/session'
import { clearResolvedStorageUrl } from '@/services/backend/storage'
import { cleanupChat, waitForChatQuiescence } from '@/services/chat'
import { clearAllGroupChatStorage } from '@/services/groupChat/storage'
import { clearMediaExportCache } from '@/services/media/exportService'
import {
  captureNotificationCleanupSnapshot,
  deactivateNotificationRuntime,
  revokeNotificationCleanupSnapshot,
  type NotificationCleanupSnapshot,
} from '@/services/notifications/pushService'
import { invalidateActiveWalletPushRegistration } from '@/services/notifications/registrationCoordinator'
import { clearCachedReceiptPreferences } from '@/services/security/receiptPreferences'
import { resetActiveAccountRuntime } from '@/services/shared/accountRuntimeLifecycle'
import {
  clearPersistedSensitiveSecureStoreData,
  clearPersistedTorSecureStoreData,
} from '@/services/security/persistedSensitiveData'
import { clearLegacyAccountStorage } from '@/services/security/accountStorageRecovery'
import { clearVisualMediaCache } from '@/services/security/dataProtection'
import {
  getAsyncStorageAdapter,
} from '@/services/storage/asyncStorageAdapter'
import { clearBleMeshState } from '@/services/storage/bleMeshStorage'
import { clearLocalCacheKeyMemory } from '@/services/storage/localCacheCrypto'
import { clearWalletIndexState } from '@/services/storage/walletIndexStorage'
import { clearCustomChatBackgrounds } from '@/services/ui/chatBackgroundStorage'
import { clearPersistedBluetoothConfig, useBluetoothStore } from '@/store/bluetoothStore'
import { useAuthStore } from '@/store/authStore'
import { useOnboardingStore } from '@/store/onboardingStore'
import { useTorStore } from '@/services/tor/torStore'
import { useWalletStore } from '@/store/walletStore'
import { CALL_SESSION_REGISTRY_KEY } from '@/services/call/callSessionRegistry'

const SENSITIVE_ASYNC_STORAGE_PREFIXES = ['exo_']
const REMOTE_CLEANUP_TIMEOUT_MS = 3_500

export interface AccountTeardownOptions {
  purgeBackendAccount?: boolean
}

export interface AccountTeardownSnapshot {
  accessToken: string | null
  refreshToken: string | null
  notificationCleanup: NotificationCleanupSnapshot
}

interface LocalAccountErasureOptions {
  preserveTorRuntime?: boolean
  preserveAccountDeletion?: boolean
}

function collectWalletAddresses(): string[] {
  const { wallet, wallets } = useWalletStore.getState()
  const addresses = new Set<string>()
  for (const entry of wallets) {
    if (entry.address?.trim()) {
      addresses.add(entry.address.trim())
    }
  }
  if (wallet?.address?.trim()) {
    addresses.add(wallet.address.trim())
  }
  return [...addresses]
}

export async function captureAccountTeardownSnapshot(): Promise<AccountTeardownSnapshot> {
  const session = useAuthStore.getState().session
  const walletAddresses = collectWalletAddresses()
  const notificationCleanup = await captureNotificationCleanupSnapshot(walletAddresses)
    .catch(() => ({
      walletAddresses,
      notificationScopeIds: [],
      pushTokens: [],
    }))
  return {
    accessToken: session?.accessToken ?? null,
    refreshToken: session?.refreshToken ?? null,
    notificationCleanup,
  }
}

async function clearSensitiveAsyncStorage(): Promise<void> {
  const keys = await getAppKeyValueStorage().getAllKeys()
  const sensitiveKeys = keys.filter(
    (key) =>
      key === CALL_SESSION_REGISTRY_KEY
      || SENSITIVE_ASYNC_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix)),
  )
  if (sensitiveKeys.length > 0) {
    await getAppKeyValueStorage().multiRemove(sensitiveKeys)
  }
}

async function clearResidualAsyncStorage(): Promise<void> {
  const { clearInstallSentinel } = await import('@/services/security/installLifecycle')
  const { clearPendingChatWakeupStorage } = await import(
    '@/services/notifications/chatNotificationWakeup'
  )
  const { clearAllPendingCryptoTransactionStorage } = await import(
    '@/services/crypto/pendingTransactions'
  )
  await Promise.allSettled([
    clearInstallSentinel(),
    clearPendingChatWakeupStorage(),
    clearAllPendingCryptoTransactionStorage(),
  ])
}

async function clearTorRuntimeData(): Promise<void> {
  const { clearTorRuntimeData: clearRuntime } = await import('@/services/tor/torService')
  await clearRuntime()
}

export async function eraseLocalAccountData(
  options: LocalAccountErasureOptions = {},
): Promise<PromiseRejectedResult[]> {
  resetActiveAccountRuntime()
  invalidateActiveWalletPushRegistration()
  await Promise.allSettled([
    deactivateNotificationRuntime(),
    Promise.resolve().then(async () => {
      cleanupChat()
      await waitForChatQuiescence()
    }),
  ])

  for (const operation of [
    clearLocalCacheKeyMemory,
    clearResolvedStorageUrl,
    clearCachedReceiptPreferences,
    () => useOnboardingStore.getState().clearPendingWallet(),
    () => useWalletStore.getState().lockVault(),
    () => useWalletStore.setState({
      hasWallet: false,
      isLoading: false,
      initializationError: false,
    }),
  ]) {
    try {
      operation()
    } catch {
      continue
    }
  }
  await useAuthStore.getState().clearSession().catch(() => undefined)

  const keyErasure = await Promise.allSettled([
    clearPersistedSensitiveSecureStoreData({
      preserveTorSettings: options.preserveTorRuntime,
      preserveAccountDeletion: options.preserveAccountDeletion,
    }),
    clearLegacyAccountStorage(),
  ])

  await Promise.allSettled([
    clearSensitiveAsyncStorage(),
    clearResidualAsyncStorage(),
    getAsyncStorageAdapter().clear(),
    clearAllGroupChatStorage(),
    clearMediaExportCache(),
    clearVisualMediaCache(),
    clearCustomChatBackgrounds(),
    clearBleMeshState(),
    clearWalletIndexState(),
    clearPersistedBluetoothConfig(),
    ...(options.preserveTorRuntime ? [] : [clearTorRuntimeData()]),
  ])

  useBluetoothStore.getState().reset()
  if (!options.preserveTorRuntime) {
    useTorStore.getState().reset()
  }

  const { useChatStore, useUIStore, useGroupChatStore } = await import('@/store')
  useChatStore.getState().reset()
  useUIStore.getState().clearToasts()
  useGroupChatStore.getState().reset()

  return keyErasure.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
}

export async function clearPreservedTorRuntime(): Promise<void> {
  const results = await Promise.allSettled([
    clearTorRuntimeData(),
    clearPersistedTorSecureStoreData(),
  ])
  useTorStore.getState().reset()
  const failures = results.filter((result): result is PromiseRejectedResult =>
    result.status === 'rejected'
  )
  if (failures.length > 0) {
    throw new Error(`Failed to clear ${failures.length} Tor data stores`)
  }
}

async function runRemoteCleanup(
  snapshot: AccountTeardownSnapshot,
  options: AccountTeardownOptions,
): Promise<void> {
  if (options.purgeBackendAccount && snapshot.accessToken) {
    await withTimeout(
      deleteBackendAccount({ accessToken: snapshot.accessToken }),
      REMOTE_CLEANUP_TIMEOUT_MS,
    )
    return
  }

  await revokeNotificationCleanupSnapshot(snapshot.notificationCleanup, {
    accessToken: snapshot.accessToken,
  }).catch((error) => {
    console.warn('[AccountTeardown] Notification deregistration failed:', error)
  })

  if (snapshot.refreshToken) {
    await withTimeout(
      revokeBackendSession(snapshot.refreshToken),
      REMOTE_CLEANUP_TIMEOUT_MS,
    ).catch((error) => {
      console.warn('[AccountTeardown] Backend session revocation failed:', error)
    })
  }
}

export async function wipeAllSensitiveData(
  options: AccountTeardownOptions = {},
): Promise<void> {
  const snapshot = await captureAccountTeardownSnapshot()
  invalidateAuthCaches()
  const keyErasureFailures = await eraseLocalAccountData()
  await runRemoteCleanup(snapshot, options)
  if (keyErasureFailures.length > 0) {
    throw new Error(`Failed to erase ${keyErasureFailures.length} local key stores`)
  }
}

export async function logoutAndWipeAccount(
  options: AccountTeardownOptions = {},
): Promise<void> {
  await wipeAllSensitiveData(options)
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('operation_timeout')), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}
