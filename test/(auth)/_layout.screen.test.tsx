/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  segments: ['(auth)', 'welcome'],
  auth: {
    isInitialized: true,
    isAuthenticated: false,
  },
  wallet: {
    isLoading: false,
    hasWallet: false,
    isVaultUnlocked: false,
  },
  ui: {
    languageChosen: true,
  },
}))

vi.mock('react-native', async () => await import('../../test/react-native'))

vi.mock('expo-router', async () => {
  const ReactActual = await import('react')
  const Stack = ({ children }: { children: React.ReactNode }) => (
    ReactActual.createElement(ReactActual.Fragment, null, children)
  )
  Stack.Screen = ({ name }: { name: string }) => (
    ReactActual.createElement('Text', { testID: `stack-screen-${name}` }, name)
  )

  return {
    Redirect: ({ href }: { href: string }) => (
      ReactActual.createElement('Text', { testID: 'redirect' }, href)
    ),
    Stack,
    useSegments: () => mockState.segments,
  }
})

vi.mock('@/lib/theme', () => ({
  useThemeColors: () => ({
    primary: '#00ff99',
  }),
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: typeof mockState.auth) => unknown) => selector(mockState.auth),
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: typeof mockState.wallet) => unknown) => selector(mockState.wallet),
}))

vi.mock('@/store/uiStore', () => ({
  useUIStore: (selector: (state: typeof mockState.ui) => unknown) => selector(mockState.ui),
}))

const { render, screen } = await import('@testing-library/react-native')
const { default: AuthLayout } = await import('../../app/(auth)/_layout')

describe('AuthLayout route guard', () => {
  beforeEach(() => {
    mockState.segments = ['(auth)', 'welcome']
    mockState.auth = {
      isInitialized: true,
      isAuthenticated: false,
    }
    mockState.wallet = {
      isLoading: false,
      hasWallet: false,
      isVaultUnlocked: false,
    }
    mockState.ui = {
      languageChosen: true,
    }
  })

  it('renders the onboarding auth stack for first-run users', () => {
    render(<AuthLayout />)

    expect(screen.getByTestId('stack-screen-welcome')).toBeTruthy()
    expect(screen.getByTestId('stack-screen-unlock')).toBeTruthy()
  })

  it('redirects locked wallet owners to unlock before any onboarding screen', () => {
    mockState.wallet.hasWallet = true

    render(<AuthLayout />)

    expect(screen.getByTestId('redirect').props.children).toBe('/(auth)/unlock')
  })

  it('redirects fully unlocked wallets to the main chat route', () => {
    mockState.wallet.hasWallet = true
    mockState.wallet.isVaultUnlocked = true
    mockState.auth.isAuthenticated = true
    mockState.segments = ['(auth)', 'unlock']

    render(<AuthLayout />)

    expect(screen.getByTestId('redirect').props.children).toBe('/(main)/(tabs)/chats')
  })

  it('sends direct unlock visits without a wallet through language selection first', () => {
    mockState.segments = ['(auth)', 'unlock']
    mockState.ui.languageChosen = false

    render(<AuthLayout />)

    expect(screen.getByTestId('redirect').props.children).toBe('/(auth)/select-language')
  })
})
