/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  auth: {
    exoAddress: 'EXO001111111111111111111111111111111111111',
    isCloudAuthVerified: true,
    isIdentityBound: false,
    isSessionExpired: true,
    session: null as { expiresAt: number } | null,
    secureAccess: {
      phase: 'idle' as string,
      failure: null as string | null,
      retryable: false,
    },
    setIdentityBound: vi.fn(),
    setSessionExpired: vi.fn(),
  },
  haptics: {
    notificationAsync: vi.fn(async () => {}),
  },
  router: {
    back: vi.fn(),
    push: vi.fn(),
  },
  wallet: {
    createdAt: 0,
    displayName: 'Auditor',
  },
  backend: {
    ensureVerifiedBackendAccess: vi.fn(async () => true),
    ensureVerifiedBackendAccessForIdentity: vi.fn(async () => ({
      identityId: 'identity-id',
    })),
    repairBackendIdentityBinding: vi.fn(async () => ({
      identityId: 'identity-id',
    })),
  },
  quantum: {
    getIdentity: vi.fn(() => ({ id: 'identity-id' })),
    syncBundleServerAccessToken: vi.fn(),
  },
  contactProfile: {
    ensureOwnContactProfile: vi.fn(async () => ({
      version: 1,
      identityId: 'identity-id',
      revision: 1,
      signature: '0xsignature',
    })),
    updateOwnContactProfile: vi.fn(async (
      identityId: string,
      profile: { displayName?: string; avatarDataUri?: string | null },
    ) => ({
      version: 1,
      identityId,
      revision: 2,
      ...profile,
      signature: '0xsignature',
    })),
  },
}))

vi.mock('react-native', async () => await import('../../../test/react-native'))

vi.mock('@react-navigation/native', async () => {
  const ReactActual = await import('react')
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      ReactActual.useEffect(() => callback(), [])
    },
  }
})

vi.mock('expo-clipboard', () => ({
  setStringAsync: vi.fn(async () => {}),
}))

vi.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Error: 'error', Success: 'success' },
  notificationAsync: mockState.haptics.notificationAsync,
}))

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return {
    Check: TestIcon,
    ChevronLeft: TestIcon,
    Copy: TestIcon,
    Edit3: TestIcon,
    Link2: TestIcon,
    QrCode: TestIcon,
    RefreshCw: TestIcon,
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
}))

vi.mock('@/components/common', async () => {
  const { TestAvatar } = await import('../../../test/mainScreenMocks')
  return { Avatar: TestAvatar }
})

vi.mock('@/components/common/AliasInput', async () => {
  const actual = await vi.importActual<typeof import('@/components/common/AliasInput')>(
    '@/components/common/AliasInput',
  )
  const { MockInput } = await import('../../../test/mainScreenMocks')
  return {
    ...actual,
    AliasInput: MockInput,
  }
})

vi.mock('@/components/ui', async () => {
  const { MockInput, TestButton, TestCard } = await import('../../../test/mainScreenMocks')
  return { Button: TestButton, Card: TestCard, Input: MockInput }
})

vi.mock('@/store', () => ({
  useAuthStore: Object.assign(
    (selector?: (state: typeof mockState.auth) => unknown) => (
      selector ? selector(mockState.auth) : mockState.auth
    ),
    { getState: () => mockState.auth },
  ),
  useWalletStore: () => ({ wallet: mockState.wallet }),
}))

vi.mock('@/lib/i18n', () => ({
  getCurrentLocaleTag: () => 'en-US',
  translate: (key: string) => key,
}))

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/services/backend/session', () => ({
  ensureVerifiedBackendAccess: mockState.backend.ensureVerifiedBackendAccess,
  ensureVerifiedBackendAccessForIdentity: mockState.backend.ensureVerifiedBackendAccessForIdentity,
  repairBackendIdentityBinding: mockState.backend.repairBackendIdentityBinding,
}))

vi.mock('@/services/chat/contactProfile', () => mockState.contactProfile)

vi.mock('@/services/quantumChat', () => mockState.quantum)

vi.mock('@/services/chat/discoveryAliasPublish', () => ({
  syncLiveDiscoveryAlias: vi.fn(async () => {}),
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: { enabled: boolean }) => unknown) => selector({ enabled: false }),
}))

vi.mock('@/services/chat/aliasAutocompleteStorage', () => ({
  readAliasAutocomplete: vi.fn(async () => true),
  writeAliasAutocomplete: vi.fn(async () => {}),
}))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: ProfileScreen } = await import('../../../app/(main)/profile/index')

async function flushEffects() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockState.auth.isIdentityBound = false
    mockState.auth.isSessionExpired = true
    mockState.auth.session = null
    mockState.auth.secureAccess = {
      phase: 'idle',
      failure: null,
      retryable: false,
    }
    mockState.auth.setIdentityBound.mockClear()
    mockState.auth.setSessionExpired.mockClear()
    mockState.backend.ensureVerifiedBackendAccess.mockResolvedValue(true)
    mockState.backend.ensureVerifiedBackendAccess.mockClear()
    mockState.backend.ensureVerifiedBackendAccessForIdentity.mockResolvedValue({
      identityId: 'identity-id',
    })
    mockState.backend.ensureVerifiedBackendAccessForIdentity.mockClear()
    mockState.backend.repairBackendIdentityBinding.mockResolvedValue({
      identityId: 'identity-id',
    })
    mockState.backend.repairBackendIdentityBinding.mockClear()
    mockState.contactProfile.ensureOwnContactProfile.mockClear()
    mockState.contactProfile.updateOwnContactProfile.mockClear()
  })

  it('does not expose a manual chat-bundle recovery action', async () => {
    render(<ProfileScreen />)
    await flushEffects()

    expect(() => screen.getByText('Publish Chat Bundle')).toThrow()
    expect(screen.getAllByText('Refresh Auth').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Link Identity').length).toBeGreaterThan(0)
  })

  it('shows admission work as pending instead of an expired server session', async () => {
    mockState.auth.secureAccess = {
      phase: 'admitting',
      failure: null,
      retryable: false,
    }

    render(<ProfileScreen />)
    await flushEffects()

    expect(screen.getByText('Activating secure online access')).toBeTruthy()
    expect(() => screen.getByText('Server session expired — features may not work')).toThrow()
  })

  it('runs profile repair actions through their service boundaries', async () => {
    render(<ProfileScreen />)
    await flushEffects()

    await fireEvent.press(screen.getByTestId('button-Refresh Auth'))
    await fireEvent.press(screen.getByTestId('button-Link Identity'))

    expect(mockState.backend.ensureVerifiedBackendAccessForIdentity)
      .toHaveBeenCalledWith('identity-id')
    expect(mockState.quantum.syncBundleServerAccessToken).toHaveBeenCalled()
    expect(mockState.backend.repairBackendIdentityBinding).toHaveBeenCalledWith('identity-id')
    expect(mockState.auth.setIdentityBound).toHaveBeenCalledWith(true)
  })

  it('does not show recovery actions when an imported account is chat-ready', async () => {
    mockState.auth.isIdentityBound = true
    mockState.auth.isSessionExpired = false
    mockState.auth.session = { expiresAt: Date.now() + 120_000 }

    render(<ProfileScreen />)
    await flushEffects()

    expect(screen.getByText('Server session active')).toBeTruthy()
    expect(screen.getByText('Identity linked to server')).toBeTruthy()
    expect(() => screen.getByText('Publish Chat Bundle')).toThrow()
    expect(() => screen.getByText('Refresh Auth')).toThrow()
    expect(() => screen.getByText('Link Identity')).toThrow()
  })

  it('saves a contact profile alias locally', async () => {
    render(<ProfileScreen />)
    await flushEffects()

    await fireEvent.changeText(screen.getByTestId('input-Alias'), 'UpdatedAuditor')
    await fireEvent.press(screen.getByTestId('button-Save alias'))

    expect(mockState.contactProfile.updateOwnContactProfile).toHaveBeenCalledWith('identity-id', {
      displayName: '@UpdatedAuditor',
      avatarDataUri: null,
    })
  })

  it('rejects an over-limit contact profile alias before saving', async () => {
    render(<ProfileScreen />)
    await flushEffects()

    await fireEvent.changeText(screen.getByTestId('input-Alias'), 'a'.repeat(81))
    await fireEvent.press(screen.getByTestId('button-Save alias'))

    expect(mockState.contactProfile.updateOwnContactProfile).not.toHaveBeenCalled()
  })
})
