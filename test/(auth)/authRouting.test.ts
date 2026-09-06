/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { describe, expect, it } from 'vitest'

import { getAuthRouteDecision } from '../../app/(auth)/authRouting'

const readyState = {
  authInitialized: true,
  walletLoading: false,
  hasWallet: false,
  isAuthenticated: false,
  isVaultUnlocked: false,
  languageChosen: true,
  activeRoute: 'welcome',
}

describe('getAuthRouteDecision', () => {
  it('holds the auth stack while auth or wallet state is still loading', () => {
    expect(getAuthRouteDecision({
      ...readyState,
      authInitialized: false,
    })).toEqual({ kind: 'loading' })

    expect(getAuthRouteDecision({
      ...readyState,
      walletLoading: true,
    })).toEqual({ kind: 'loading' })
  })

  it('keeps first-run users inside onboarding routes', () => {
    expect(getAuthRouteDecision({
      ...readyState,
      activeRoute: 'welcome',
    })).toEqual({ kind: 'stack' })
  })

  it('redirects stray unlock visits without a wallet back to onboarding', () => {
    expect(getAuthRouteDecision({
      ...readyState,
      languageChosen: false,
      activeRoute: 'unlock',
    })).toEqual({ kind: 'redirect', href: '/(auth)/select-language' })

    expect(getAuthRouteDecision({
      ...readyState,
      languageChosen: true,
      activeRoute: 'unlock',
    })).toEqual({ kind: 'redirect', href: '/(auth)/welcome' })
  })

  it('sends locked wallets to unlock and unlocked wallets to main', () => {
    expect(getAuthRouteDecision({
      ...readyState,
      hasWallet: true,
      activeRoute: 'welcome',
    })).toEqual({ kind: 'redirect', href: '/(auth)/unlock' })

    expect(getAuthRouteDecision({
      ...readyState,
      hasWallet: true,
      activeRoute: 'unlock',
    })).toEqual({ kind: 'stack' })

    expect(getAuthRouteDecision({
      ...readyState,
      hasWallet: true,
      isAuthenticated: true,
      isVaultUnlocked: true,
      activeRoute: 'unlock',
    })).toEqual({ kind: 'redirect', href: '/(main)/(tabs)/chats' })
  })

  it('resumes Add Contact after unlock when a share address is pending', () => {
    const address = `EXO00${'ab'.repeat(19)}`
    expect(getAuthRouteDecision({
      ...readyState,
      hasWallet: true,
      isAuthenticated: true,
      isVaultUnlocked: true,
      activeRoute: 'unlock',
      pendingContactShare: `  ${address.toUpperCase()}  `,
    })).toEqual({
      kind: 'redirect',
      href: `/(main)/contact/add?scannedInvite=${encodeURIComponent(address)}`,
    })
  })

  it('ignores pending share values that are not EXO addresses', () => {
    expect(getAuthRouteDecision({
      ...readyState,
      hasWallet: true,
      isAuthenticated: true,
      isVaultUnlocked: true,
      activeRoute: 'unlock',
      pendingContactShare: '/(main)/settings',
    })).toEqual({ kind: 'redirect', href: '/(main)/(tabs)/chats' })
  })
})
