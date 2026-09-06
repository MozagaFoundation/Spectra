/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  auth: {
    isAuthenticated: false,
    isInitialized: true,
  },
  ui: {
    languageChosen: true,
  },
  wallet: {
    hasWallet: false,
    initializationError: false,
    isLoading: false,
    isVaultUnlocked: false,
  },
}))

vi.mock('react-native', async () => await import('../test/react-native'))

vi.mock('expo-router', async () => {
  const ReactActual = await import('react')
  return {
    Redirect: ({ href }: { href: string }) => (
      ReactActual.createElement('Text', { testID: 'redirect' }, href)
    ),
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../test/mainAppMocks')
  return { useThemeColors: () => testColors }
})

vi.mock('@/store/authStore', () => ({
  useAuthStore: () => mockState.auth,
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: () => mockState.wallet,
}))

vi.mock('@/store/uiStore', () => ({
  useUIStore: (selector: (state: typeof mockState.ui) => unknown) => selector(mockState.ui),
}))

const { render, screen } = await import('@testing-library/react-native')
const { default: Index } = await import('../app/index')

describe('Index route guard', () => {
  beforeEach(() => {
    mockState.auth = {
      isAuthenticated: false,
      isInitialized: true,
    }
    mockState.ui = {
      languageChosen: true,
    }
    mockState.wallet = {
      hasWallet: false,
      initializationError: false,
      isLoading: false,
      isVaultUnlocked: false,
    }
  })

  it('keeps users on a loading state until auth and wallet state are ready', () => {
    mockState.auth.isInitialized = false

    render(<Index />)

    expect(screen.getAllByText('Loading...').length).toBeGreaterThan(0)
  })

  it('routes first-run users to language selection before welcome', () => {
    mockState.ui.languageChosen = false

    render(<Index />)

    expect(screen.getByTestId('redirect').props.children).toBe('/(auth)/select-language')
  })

  it('routes users without a wallet to welcome after language selection', () => {
    render(<Index />)

    expect(screen.getByTestId('redirect').props.children).toBe('/(auth)/welcome')
  })

  it('routes locked or unauthenticated wallet owners to unlock', () => {
    mockState.wallet.hasWallet = true
    mockState.auth.isAuthenticated = true
    mockState.wallet.isVaultUnlocked = false

    render(<Index />)

    expect(screen.getByTestId('redirect').props.children).toBe('/(auth)/unlock')
  })

  it('routes authenticated unlocked wallets to the main chat tab', () => {
    mockState.wallet.hasWallet = true
    mockState.auth.isAuthenticated = true
    mockState.wallet.isVaultUnlocked = true

    render(<Index />)

    expect(screen.getByTestId('redirect').props.children).toBe('/(main)/(tabs)/chats')
  })
})
