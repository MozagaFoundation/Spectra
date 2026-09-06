/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { normalizeContactShareWalletAddress } from '@/lib/pendingContactShare'

export type AuthRouteDecision =
  | { kind: 'loading' }
  | { kind: 'stack' }
  | { kind: 'redirect'; href: string }

interface AuthRouteState {
  authInitialized: boolean
  walletLoading: boolean
  hasWallet: boolean
  isAuthenticated: boolean
  isVaultUnlocked: boolean
  languageChosen: boolean
  activeRoute?: string
  pendingContactShare?: string | null
}

function addContactShareHref(walletAddress: string): string {
  return `/(main)/contact/add?scannedInvite=${encodeURIComponent(walletAddress)}`
}

export function getAuthRouteDecision({
  authInitialized,
  walletLoading,
  hasWallet,
  isAuthenticated,
  isVaultUnlocked,
  languageChosen,
  activeRoute,
  pendingContactShare,
}: AuthRouteState): AuthRouteDecision {
  if (!authInitialized || walletLoading) {
    return { kind: 'loading' }
  }

  const isUnlockRoute = activeRoute === 'unlock'

  if (hasWallet) {
    if (isAuthenticated && isVaultUnlocked) {
      const shareAddress = pendingContactShare
        ? normalizeContactShareWalletAddress(pendingContactShare)
        : null
      return {
        kind: 'redirect',
        href: shareAddress ? addContactShareHref(shareAddress) : '/(main)/(tabs)/chats',
      }
    }

    if (!isUnlockRoute) {
      return { kind: 'redirect', href: '/(auth)/unlock' }
    }
  } else if (isUnlockRoute) {
    return {
      kind: 'redirect',
      href: languageChosen ? '/(auth)/welcome' : '/(auth)/select-language',
    }
  }

  return { kind: 'stack' }
}
