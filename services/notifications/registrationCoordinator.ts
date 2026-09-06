/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { isSameAccountStorageScope } from '@/lib/accountScope'
import { ensureVerifiedBackendAccess } from '@/services/backend/session'
import { mobileLogDebug, mobileLogWarn } from '@/services/logging/mobileLogger'
import { useAuthStore } from '@/store/authStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import {
  captureNotificationCleanupSnapshot,
  deactivateNotificationRuntime,
  initializePushNotificationsForWallets,
  revokeNotificationCleanupSnapshot,
  type NotificationCleanupSnapshot,
} from './pushService'
import { getOrCreateNotificationScopeId, removeNotificationScopesForWallets } from './notificationScope'

const AUTH_RETRY_DELAYS_MS = [0, 1_000, 5_000] as const
const REVOCATION_RETRY_DELAYS_MS = [1_000, 5_000, 15_000] as const
const REVOCATION_TIMEOUT_MS = 3_500

let registrationGeneration = 0
let inFlightRegistration: {
  walletAddress: string
  generation: number
  promise: Promise<boolean>
} | null = null

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function revokeWithTimeout(
  snapshot: NotificationCleanupSnapshot,
  accessToken: string,
): Promise<void> {
  await Promise.race([
    revokeNotificationCleanupSnapshot(snapshot, { accessToken }),
    delay(REVOCATION_TIMEOUT_MS).then(() => {
      throw new Error('Notification revocation timed out')
    }),
  ])
}

function isCurrentRegistration(walletAddress: string, generation: number): boolean {
  const activeWallet = useWalletStore.getState().wallet
  const spectreState = useSpectreStore.getState()
  return generation === registrationGeneration
    && !spectreState.enabled
    && !spectreState.isApplying
    && Boolean(activeWallet?.address)
    && isSameAccountStorageScope(activeWallet?.address, walletAddress)
}

async function runActiveWalletRegistration(
  walletAddress: string,
  generation: number,
): Promise<boolean> {
  for (const retryDelay of AUTH_RETRY_DELAYS_MS) {
    if (retryDelay > 0) {
      await delay(retryDelay)
    }
    if (!isCurrentRegistration(walletAddress, generation)) {
      return false
    }

    const session = await ensureVerifiedBackendAccess()
    const activeWallet = useWalletStore.getState().wallet
    if (
      !session
      || !activeWallet
      || activeWallet.spectreMode === true
      || !isSameAccountStorageScope(session.exoAddress, walletAddress)
      || !isCurrentRegistration(walletAddress, generation)
    ) {
      continue
    }

    const synchronized = await initializePushNotificationsForWallets(
      [{
        address: activeWallet.address,
        displayName: activeWallet.displayName,
        spectreMode: activeWallet.spectreMode,
      }],
      {
        forceSync: true,
        accessToken: session.accessToken,
      },
    )
    if (synchronized && isCurrentRegistration(walletAddress, generation)) {
      const { publishPrefetchSession } = await import('./prefetchSession')
      await publishPrefetchSession({
        walletAddress,
        notificationScopeId: await getOrCreateNotificationScopeId(walletAddress),
      }).catch(() => {})
      mobileLogDebug('PushRegistration', 'active_wallet_registered')
      return true
    }
  }

  if (isCurrentRegistration(walletAddress, generation)) {
    mobileLogWarn('PushRegistration', 'active_wallet_registration_failed')
  }
  return false
}

export function invalidateActiveWalletPushRegistration(): void {
  registrationGeneration += 1
  inFlightRegistration = null
}

export async function suspendActiveWalletPushRegistration(): Promise<void> {
  const registration = inFlightRegistration?.promise
  invalidateActiveWalletPushRegistration()
  await registration?.catch(() => {})
}

export function synchronizeActiveWalletPushRegistration(): Promise<boolean> {
  const activeWallet = useWalletStore.getState().wallet
  const spectreState = useSpectreStore.getState()
  if (
    !activeWallet?.address
    || activeWallet.spectreMode === true
    || spectreState.enabled
    || spectreState.isApplying
  ) {
    return Promise.resolve(false)
  }

  const generation = registrationGeneration
  if (
    inFlightRegistration
    && inFlightRegistration.generation === generation
    && isSameAccountStorageScope(inFlightRegistration.walletAddress, activeWallet.address)
  ) {
    return inFlightRegistration.promise
  }

  const walletAddress = activeWallet.address
  const promise = runActiveWalletRegistration(walletAddress, generation)
    .finally(() => {
      if (
        inFlightRegistration?.generation === generation
        && isSameAccountStorageScope(inFlightRegistration.walletAddress, walletAddress)
      ) {
        inFlightRegistration = null
      }
    })
  inFlightRegistration = { walletAddress, generation, promise }
  return promise
}

async function retryRevocation(
  snapshot: NotificationCleanupSnapshot,
  accessToken: string,
): Promise<void> {
  for (const retryDelay of REVOCATION_RETRY_DELAYS_MS) {
    await delay(retryDelay)
    try {
      await revokeWithTimeout(snapshot, accessToken)
      return
    } catch {
      // Retry with the captured account authority.
    }
  }
  mobileLogWarn('PushRegistration', 'previous_wallet_revocation_failed')
}

export async function prepareActiveWalletPushHandoff(): Promise<void> {
  const walletAddress = useWalletStore.getState().wallet?.address
  const session = useAuthStore.getState().session
  invalidateActiveWalletPushRegistration()
  if (!walletAddress) {
    await deactivateNotificationRuntime()
    return
  }

  const capturedSnapshot = await captureNotificationCleanupSnapshot([walletAddress])
    .catch(() => ({
      walletAddresses: [walletAddress],
      notificationScopeIds: [],
      pushTokens: [],
    }))
  const snapshot = {
    ...capturedSnapshot,
    pushTokens: [],
  }
  await Promise.allSettled([
    deactivateNotificationRuntime(),
    removeNotificationScopesForWallets([walletAddress]),
  ])

  if (!session?.accessToken || !isSameAccountStorageScope(session.exoAddress, walletAddress)) {
    return
  }
  try {
    await revokeWithTimeout(snapshot, session.accessToken)
  } catch {
    void retryRevocation(snapshot, session.accessToken)
  }
}
