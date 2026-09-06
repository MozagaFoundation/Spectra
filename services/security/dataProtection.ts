/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { Image as ExpoImage } from 'expo-image'

import { cleanupChat } from '@/services/chat'
import { clearEditedImageCache } from '@/services/media/editedImageCache'
import { clearMediaExportCache } from '@/services/media/exportService'
import { clearMediaCache } from '@/services/media/localMediaCache'
import {
  clearEncryptedAvatarCache,
  clearEncryptedAvatarMemoryCache,
} from '@/services/media/avatarImageCache'
import { clearTransientRenderCache } from '@/services/media/transientRenderCache'
import { readAutoLockPreference } from './autoLockPreference'
import {
  getClearImageCacheOnLockEnabled,
  getMessageCachePrivacyMode,
  setClearImageCacheOnLockEnabled,
  setStoredMessageCachePrivacyMode,
  type MessageCachePrivacyMode,
} from './cachePrivacyPreference'
import {
  getAsyncStorageAdapter,
  setDecryptedMessagePersistenceEnabled,
} from '@/services/storage/asyncStorageAdapter'
import { clearLocalCacheKeyMemory } from '@/services/storage/localCacheCrypto'
import { clearResolvedStorageUrl } from '@/services/backend/storage'
import { useAuthStore } from '@/store/authStore'
import { useOnboardingStore } from '@/store/onboardingStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import { hardenSensitiveSecureStoreAccessibility } from './persistedSensitiveData'

export type { MessageCachePrivacyMode } from './cachePrivacyPreference'

export async function clearVisualMediaCache(): Promise<void> {
  await Promise.allSettled([
    ExpoImage.clearMemoryCache(),
    ExpoImage.clearDiskCache(),
    clearEncryptedAvatarCache(),
    clearMediaCache(),
    clearEditedImageCache(),
  ])
}

export async function clearStrictPrivacyCaches(): Promise<void> {
  await Promise.allSettled([
    getAsyncStorageAdapter().clearDecryptedMessageCache({ allScopes: true, force: true }),
    clearVisualMediaCache(),
    clearMediaExportCache(),
  ])
}

export async function readAutoLockSettings(): Promise<{ enabled: boolean; timeoutMs: number }> {
  const preference = await readAutoLockPreference()
  return {
    enabled: preference.enabled,
    timeoutMs: preference.timeoutMs,
  }
}

export { getClearImageCacheOnLockEnabled, getMessageCachePrivacyMode, setClearImageCacheOnLockEnabled }

export async function setMessageCachePrivacyMode(_mode: MessageCachePrivacyMode): Promise<void> {
  setDecryptedMessagePersistenceEnabled(false)
  await getAsyncStorageAdapter().clearDecryptedMessageCache({ allScopes: true, force: true })
  await setStoredMessageCachePrivacyMode('strict')
}

export async function initializeCachePrivacySettings(): Promise<void> {
  await hardenSensitiveSecureStoreAccessibility()
  await getMessageCachePrivacyMode()
  setDecryptedMessagePersistenceEnabled(false)
  const cleanupTasks: Promise<unknown>[] = [
    clearTransientRenderCache(),
  ]
  if (
    useSpectreStore.getState().enabled
    || useWalletStore.getState().wallet?.spectreMode === true
  ) {
    cleanupTasks.push(clearEncryptedAvatarCache())
  }
  await Promise.all(cleanupTasks)
  void getAsyncStorageAdapter()
    .clearDecryptedMessageCache({ allScopes: true })
    .catch((error) => {
      if (__DEV__) {
        console.warn('[DataProtection] Failed to clear decrypted message caches during initialization:', error)
      }
    })
}

export async function lockActiveSession(): Promise<void> {
  const activeWallet = useWalletStore.getState().wallet
  const spectreEnabled = useSpectreStore.getState().enabled
  useWalletStore.getState().lockVault()
  useAuthStore.getState().lockForVault()

  const clearImageCacheOnLock = await getClearImageCacheOnLockEnabled().catch(() => false)

  await Promise.allSettled([
    clearImageCacheOnLock || activeWallet?.spectreMode === true || spectreEnabled
      ? clearVisualMediaCache()
      : Promise.resolve(),
    getAsyncStorageAdapter().clearDecryptedMessageCache(),
  ])

  cleanupChat()
  await clearTransientRenderCache().catch(() => undefined)
  clearEncryptedAvatarMemoryCache()
  clearLocalCacheKeyMemory()
  clearResolvedStorageUrl()
  useOnboardingStore.getState().clearPendingWallet()
}
