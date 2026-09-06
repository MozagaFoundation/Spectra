/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { EXOWallet } from '@spectra/identity-vault'
import type { NotificationTokenRegistration } from '@/services/backend/client'
import type { AppLanguage } from '@/lib/i18n/resources'

export type PushRegistrationWallet = Pick<EXOWallet, 'address' | 'displayName' | 'spectreMode'> & {
  notificationScopeId?: string
}

const MAX_NOTIFICATION_LABEL_LENGTH = 80

function formatShortWalletAddress(address: string): string {
  const trimmed = address.trim()
  if (trimmed.length <= 12) {
    return trimmed
  }

  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`
}

export function buildWalletNotificationLabel(wallet: PushRegistrationWallet): string {
  const displayName = wallet.displayName?.trim()
  if (displayName) {
    return displayName.slice(0, MAX_NOTIFICATION_LABEL_LENGTH)
  }

  return `EXO ${formatShortWalletAddress(wallet.address)}`.slice(0, MAX_NOTIFICATION_LABEL_LENGTH)
}

export function buildPushNotificationRegistrations(
  wallets: PushRegistrationWallet[],
  pushToken: string | null,
  notificationLocale: AppLanguage,
  clientPlatform: 'ios' | 'android' | null = null,
): NotificationTokenRegistration[] {
  const registrations = new Map<string, NotificationTokenRegistration>()

  for (const wallet of wallets) {
    const walletAddress = wallet.address.trim()
    if (!walletAddress || wallet.spectreMode === true || !wallet.notificationScopeId) {
      continue
    }

    registrations.set(walletAddress, {
      walletAddress,
      notificationScopeId: wallet.notificationScopeId,
      pushToken,
      notificationLabel: buildWalletNotificationLabel(wallet),
      notificationLocale,
      protocolVersion: 2,
      clientPlatform,
    })
  }

  return [...registrations.values()]
}

export function buildPushRegistrationSignature(
  registrations: NotificationTokenRegistration[],
): string {
  return registrations
    .map((registration) =>
      `${registration.protocolVersion}:${registration.notificationScopeId}:${registration.walletAddress}:${registration.pushToken ?? ''}:${registration.notificationLabel ?? ''}:${registration.notificationLocale}:${registration.clientPlatform ?? ''}`,
    )
    .sort()
    .join('|')
}
