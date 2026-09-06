/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import {
  SPECTRE_AUTO_LOCK_TIME,
  SPECTRE_FAIL_WIPE_ATTEMPTS,
} from '@/lib/constants'
import {
  readAutoLockPreference,
  setAutoLockEnabled,
  setAutoLockTime,
} from './autoLockPreference'
import {
  getAppSwitcherPrivacyEnabled,
  setAppSwitcherPrivacyEnabled,
} from './appSwitcherPrivacy'
import {
  getClearImageCacheOnLockEnabled,
  getMessageCachePrivacyMode,
  setClearImageCacheOnLockEnabled,
  setMessageCachePrivacyMode,
} from './dataProtection'
import {
  readFailWipePreference,
  setFailWipeAttempts,
  setFailWipeEnabled,
  setFailWipePreference,
} from './failWipePreference'
import {
  getReceiptPreferences,
  setDeliveryReceiptsEnabled,
  setReadReceiptsEnabled,
} from './receiptPreferences'
import {
  loadDuressPinState,
  setDuressProtectionEnabled,
} from './duressPin'
import {
  getScreenshotProtectionEnabled,
  setScreenshotProtectionEnabled,
} from './screenshotProtection'
import type { SpectreSnapshot } from '@/store/spectreStore'

export type ManagedSecurityPreferences = Pick<
  SpectreSnapshot,
  | 'deliveryReceiptsEnabled'
  | 'readReceiptsEnabled'
  | 'screenshotProtectionEnabled'
  | 'appSwitcherPrivacyEnabled'
  | 'autoLockEnabled'
  | 'autoLockTime'
  | 'failWipeEnabled'
  | 'failWipeAttempts'
  | 'duressProtectionEnabled'
  | 'clearImageCacheOnLockEnabled'
  | 'messageCachePrivacyMode'
>

export async function readManagedSecurityPreferences(): Promise<ManagedSecurityPreferences> {
  const [
    receiptPreferences,
    screenshotProtectionEnabled,
    appSwitcherPrivacyEnabled,
    autoLockPreference,
    failWipePreference,
    duressPinState,
    clearImageCacheOnLockEnabled,
    messageCachePrivacyMode,
  ] = await Promise.all([
    getReceiptPreferences(),
    getScreenshotProtectionEnabled(),
    getAppSwitcherPrivacyEnabled(),
    readAutoLockPreference(),
    readFailWipePreference(),
    loadDuressPinState(),
    getClearImageCacheOnLockEnabled(),
    getMessageCachePrivacyMode(),
  ])

  return {
    deliveryReceiptsEnabled: receiptPreferences.deliveryReceiptsEnabled,
    readReceiptsEnabled: receiptPreferences.readReceiptsEnabled,
    screenshotProtectionEnabled,
    appSwitcherPrivacyEnabled,
    autoLockEnabled: autoLockPreference.enabled,
    autoLockTime: autoLockPreference.autoLockTime,
    failWipeEnabled: failWipePreference.enabled,
    failWipeAttempts: failWipePreference.attempts,
    duressProtectionEnabled: duressPinState.enabled,
    clearImageCacheOnLockEnabled,
    messageCachePrivacyMode,
  }
}

export async function applySpectreSecurityPreferences(): Promise<void> {
  await Promise.all([
    setDeliveryReceiptsEnabled(false),
    setReadReceiptsEnabled(false),
    setScreenshotProtectionEnabled(true),
    setAppSwitcherPrivacyEnabled(true),
    setAutoLockEnabled(true),
    setAutoLockTime(SPECTRE_AUTO_LOCK_TIME),
    setFailWipePreference({
      enabled: true,
      attempts: String(SPECTRE_FAIL_WIPE_ATTEMPTS),
    }),
    setDuressProtectionEnabled(true),
    setClearImageCacheOnLockEnabled(true),
    setMessageCachePrivacyMode('strict'),
  ])
}

export async function setManagedAutoLockEnabled(enabled: boolean): Promise<void> {
  await setAutoLockEnabled(enabled)
}

export async function setManagedAutoLockTime(autoLockTime: string): Promise<void> {
  await setAutoLockTime(autoLockTime)
}

export async function setManagedFailWipeEnabled(
  enabled: boolean,
  attempts?: string,
): Promise<void> {
  await setFailWipeEnabled(enabled, attempts)
}

export async function setManagedFailWipeAttempts(attempts: string): Promise<void> {
  await setFailWipeAttempts(attempts)
}

export async function restoreManagedSecurityPreferences(
  preferences: ManagedSecurityPreferences,
): Promise<void> {
  await Promise.all([
    setDeliveryReceiptsEnabled(preferences.deliveryReceiptsEnabled),
    setReadReceiptsEnabled(preferences.readReceiptsEnabled),
    setScreenshotProtectionEnabled(preferences.screenshotProtectionEnabled),
    setAppSwitcherPrivacyEnabled(preferences.appSwitcherPrivacyEnabled),
    setAutoLockEnabled(preferences.autoLockEnabled),
    setAutoLockTime(preferences.autoLockTime),
    setFailWipePreference({
      enabled: preferences.failWipeEnabled,
      attempts: preferences.failWipeAttempts,
    }),
    setDuressProtectionEnabled(preferences.duressProtectionEnabled),
  ])
}

export async function restoreManagedCachePreferences(
  preferences: Pick<ManagedSecurityPreferences, 'clearImageCacheOnLockEnabled' | 'messageCachePrivacyMode'>,
): Promise<void> {
  await Promise.all([
    setClearImageCacheOnLockEnabled(preferences.clearImageCacheOnLockEnabled),
    setMessageCachePrivacyMode(preferences.messageCachePrivacyMode),
  ])
}
