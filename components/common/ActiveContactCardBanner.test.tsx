/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  clearExpired: vi.fn(),
  openCardModal: vi.fn(),
  state: {
    activeContactCard: {
      cardId: `scc1.${'a'.repeat(32)}`,
      invite: 'spectra://contact-card/test',
      expiresAt: Date.now() + 60_000,
      identityId: 'identity-local',
      walletAddress: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
  },
}))

vi.mock('react-native', async () => {
  return await import('../../test/react-native')
})
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (value: string, options?: { minutes?: number }) => (
      value.replace('{{minutes}}', String(options?.minutes ?? ''))
    ),
  }),
}))
vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../test/mainScreenMocks')
  return createSafeAreaMock()
})
vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../test/mainScreenMocks')
  return {
    ChevronRight: TestIcon,
    QrCode: TestIcon,
  }
})
vi.mock('@/lib/theme', async () => {
  const { createThemeMock } = await import('../../test/mainScreenMocks')
  return createThemeMock()
})
vi.mock('@/store/ephemeralDiscoveryStore', () => ({
  isScopedActiveContactCard: (
    card: typeof mocks.state.activeContactCard | null,
    walletAddress: string | null | undefined,
    now = Date.now(),
  ) => Boolean(
    card
    && walletAddress
    && card.expiresAt > now
    && card.walletAddress.toLowerCase() === walletAddress.toLowerCase()
  ),
  useEphemeralDiscoveryStore: (selector: (state: {
    activeContactCard: typeof mocks.state.activeContactCard
    clearExpired: typeof mocks.clearExpired
    openCardModal: typeof mocks.openCardModal
  }) => unknown) => selector({
    activeContactCard: mocks.state.activeContactCard,
    clearExpired: mocks.clearExpired,
    openCardModal: mocks.openCardModal,
  }),
}))
vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: { wallet: { address: string } }) => unknown) => selector({
    wallet: { address: mocks.state.activeContactCard.walletAddress },
  }),
}))

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { ActiveContactCardBanner } = await import('./ActiveContactCardBanner')

describe('ActiveContactCardBanner', () => {
  afterEach(() => {
    mocks.clearExpired.mockClear()
    mocks.openCardModal.mockClear()
  })

  it('opens the global card sheet from top chrome', async () => {
    render(<ActiveContactCardBanner />)

    await fireEvent.press(screen.getByTestId('active-contact-card-banner'))

    expect(mocks.openCardModal).toHaveBeenCalledTimes(1)
  })
})
