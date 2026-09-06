/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  router: {
    back: vi.fn(),
  },
  wallet: {
    displayName: 'Auditor',
    address: `EXO00${'11'.repeat(19)}`,
    spectreMode: false,
  },
  visibility: 'findable' as 'findable' | 'private',
  contactInvite: `spectra:contact-card:v1:scc1.${'a'.repeat(32)}:sccap1.${'A'.repeat(43)}:sccpc1.${'B'.repeat(43)}`,
  coordinator: {
    startOneTimeContactCardCreation: vi.fn(async () => {}),
    startPublicDiscoveryPublication: vi.fn(async () => {}),
    verifyRestoredOneTimeContactCard: vi.fn(async () => {}),
  },
  rent: {
    ensureActiveDiscoveryRent: vi.fn(async () => {}),
    unpublishActiveDiscovery: vi.fn(async () => {}),
  },
  storage: {
    readDiscoveryVisibility: vi.fn(async () => mockState.visibility),
    writeDiscoveryVisibility: vi.fn(async (_wallet: string, next: 'findable' | 'private') => {
      mockState.visibility = next
    }),
  },
  ephemeralDiscovery: {
    activeContactCard: null as null | { invite: string; expiresAt: number; walletAddress: string },
    activity: null as null | { activityId: string },
    lastFailure: null as null | { failure: string },
    publicDiscoveryLease: null as null | { expiresAt: number; scope?: { walletAddress?: string } },
  },
}))

vi.mock('react-native', async () => {
  return await import('../../../test/react-native')
})

vi.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => callback(),
}))

vi.mock('expo-router', () => ({
  useRouter: () => mockState.router,
}))

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return {
    ChevronLeft: TestIcon,
  }
})

vi.mock('@/components/common/ContactCardQrPreview', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../../test/react-native')
  return {
    ContactCardQrPreview: ({ invite }: { invite: string | null }) => (
      ReactActual.createElement(Text, { testID: 'contact-card-preview' }, invite ?? 'no-card')
    ),
  }
})

vi.mock('@/components/common/ContactCardShareActions', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../../test/react-native')
  return {
    ContactCardShareActions: ({
      invite,
      shareMessage,
    }: {
      invite: string | null
      shareMessage?: string | null
    }) => (
      ReactActual.createElement(Text, { testID: 'contact-card-actions' }, shareMessage || invite || 'no-card')
    ),
  }
})

vi.mock('@/components/ui', async () => {
  const { TestButton } = await import('../../../test/mainScreenMocks')
  return { Button: TestButton }
})

vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: { wallet: typeof mockState.wallet }) => unknown) => (
    selector({ wallet: mockState.wallet })
  ),
}))

vi.mock('@/store/ephemeralDiscoveryStore', () => ({
  isScopedActiveContactCard: (
    card: { expiresAt: number; walletAddress?: string } | null,
    walletAddress: string | null | undefined,
    now = Date.now(),
  ) => Boolean(
    card
    && walletAddress
    && card.expiresAt > now
    && String(card.walletAddress ?? walletAddress).toLowerCase() === walletAddress.toLowerCase()
  ),
  isScopedPublicDiscoveryLease: (
    lease: { expiresAt: number; scope?: { walletAddress?: string } } | null,
    walletAddress: string | null | undefined,
    now = Date.now(),
  ) => Boolean(
    lease
    && walletAddress
    && lease.expiresAt > now
    && String(lease.scope?.walletAddress ?? walletAddress).toLowerCase() === walletAddress.toLowerCase()
  ),
  useEphemeralDiscoveryStore: (
    selector: (state: typeof mockState.ephemeralDiscovery) => unknown,
  ) => selector(mockState.ephemeralDiscovery),
}))

vi.mock('@/services/chat/contactProfile', () => ({
  ensureOwnContactProfile: vi.fn(async () => ({
    version: 1,
    identityId: 'identity-a',
    revision: 1,
    displayName: 'Auditor',
    signature: '0xsignature',
  })),
}))

vi.mock('@/lib/i18n', async () => {
  const { createI18nMock } = await import('../../../test/mainScreenMocks')
  return createI18nMock()
})

vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../../test/mainScreenMocks')
  return createThemeMock()
})

vi.mock('@/services/quantumChat', () => ({
  getIdentity: () => ({ id: 'identity-a' }),
}))

vi.mock('@/services/chat/ephemeralDiscoveryCoordinator', () => mockState.coordinator)

vi.mock('@/services/chat/activeDiscoveryCoordinator', () => mockState.rent)

vi.mock('@/services/chat/discoveryModeStorage', () => mockState.storage)

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { useVdfBannerPreferenceStore } = await import('@/store/vdfBannerPreferenceStore')
const { default: QRCodeScreen } = await import('../../../app/(main)/profile/qr-code')

describe('QRCodeScreen', () => {
  beforeEach(() => {
    mockState.visibility = 'findable'
    mockState.wallet.spectreMode = false
    mockState.coordinator.startOneTimeContactCardCreation.mockClear()
    mockState.coordinator.startPublicDiscoveryPublication.mockClear()
    mockState.coordinator.verifyRestoredOneTimeContactCard.mockClear()
    mockState.rent.ensureActiveDiscoveryRent.mockClear()
    mockState.rent.unpublishActiveDiscovery.mockClear()
    mockState.storage.writeDiscoveryVisibility.mockClear()
    mockState.ephemeralDiscovery.activeContactCard = null
    mockState.ephemeralDiscovery.activity = null
    mockState.ephemeralDiscovery.lastFailure = null
    mockState.ephemeralDiscovery.publicDiscoveryLease = null
    useVdfBannerPreferenceStore.setState({ visible: false, hydrated: true })
  })

  it('verifies a restored contact card when the QR screen is focused', async () => {
    render(<QRCodeScreen />)
    await act(async () => {})

    expect(mockState.coordinator.verifyRestoredOneTimeContactCard).toHaveBeenCalled()
    expect(mockState.rent.ensureActiveDiscoveryRent).toHaveBeenCalled()
  })

  it('shows a reusable EXO link in Findable mode', async () => {
    render(<QRCodeScreen />)
    await act(async () => {})

    const link = `https://spectraprotocol.org/u/${mockState.wallet.address}`
    expect(screen.getByTestId('contact-card-preview').props.children).toBe(link)
    expect(screen.getByTestId('contact-card-actions').props.children).toContain(link)
    expect(screen.queryByTestId('button-Publish for 5 minutes')).toBeNull()
  })

  it('delegates one-time card creation to the persistent coordinator', async () => {
    render(<QRCodeScreen />)

    await act(async () => {})
    await fireEvent.press(screen.getByTestId('button-Create one-time contact card'))

    expect(mockState.coordinator.startOneTimeContactCardCreation).toHaveBeenCalledTimes(1)
  })

  it('uses the memory-only active card for the QR presentation in Private mode', async () => {
    mockState.visibility = 'private'
    mockState.ephemeralDiscovery.activeContactCard = {
      invite: mockState.contactInvite,
      expiresAt: Date.now() + 60_000,
      walletAddress: mockState.wallet.address,
    }

    render(<QRCodeScreen />)
    await act(async () => {})

    expect(screen.getByTestId('contact-card-preview').props.children).toBe(mockState.contactInvite)
    expect(screen.getByTestId('contact-card-actions').props.children).toBe(mockState.contactInvite)
  })

  it('unpublishes immediately when switching to Private', async () => {
    render(<QRCodeScreen />)
    await act(async () => {})
    await fireEvent.press(screen.getByTestId('discovery-visibility-private'))
    await act(async () => {})

    expect(mockState.storage.writeDiscoveryVisibility).toHaveBeenCalledWith(
      mockState.wallet.address,
      'private',
    )
    expect(mockState.rent.unpublishActiveDiscovery).toHaveBeenCalledTimes(1)
  })

  it('starts rent when switching from Private to Findable', async () => {
    mockState.visibility = 'private'
    render(<QRCodeScreen />)
    await act(async () => {})
    mockState.rent.ensureActiveDiscoveryRent.mockClear()

    await fireEvent.press(screen.getByTestId('discovery-visibility-findable'))
    await act(async () => {})

    expect(mockState.storage.writeDiscoveryVisibility).toHaveBeenCalledWith(
      mockState.wallet.address,
      'findable',
    )
    expect(mockState.rent.ensureActiveDiscoveryRent).toHaveBeenCalled()
  })

  it('delegates public discovery publication to the persistent coordinator', async () => {
    mockState.visibility = 'private'
    render(<QRCodeScreen />)
    await act(async () => {})
    await fireEvent.press(screen.getByTestId('button-Publish for 5 minutes'))

    expect(mockState.coordinator.startPublicDiscoveryPublication).toHaveBeenCalledTimes(1)
  })

  it('does not start a second public discovery while a scoped lease is live', async () => {
    mockState.visibility = 'private'
    mockState.ephemeralDiscovery.publicDiscoveryLease = {
      expiresAt: Date.now() + 60_000,
      scope: { walletAddress: mockState.wallet.address },
    }

    render(<QRCodeScreen />)
    await act(async () => {})
    await fireEvent.press(screen.getByTestId('button-Publish for 5 minutes'))

    expect(mockState.coordinator.startPublicDiscoveryPublication).not.toHaveBeenCalled()
  })

  it('keeps VDF banner visibility off until the QR toggle is turned on', async () => {
    render(<QRCodeScreen />)
    await act(async () => {})

    const toggle = screen.getByTestId('vdf-banner-visibility')
    expect(toggle.props.value).toBe(false)
    expect(screen.getByText('Show VDF progress')).toBeTruthy()

    await act(async () => {
      toggle.props.onValueChange(true)
    })

    expect(useVdfBannerPreferenceStore.getState().visible).toBe(true)
  })
})
