/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  clipboard: vi.fn(async () => {}),
  haptics: vi.fn(async () => {}),
  params: { network: 'mozaga' as string | undefined },
  router: {
    back: vi.fn(),
  },
  wallet: {
    address: 'EXO001111111111111111111111111111111111111',
    ethereumAddress: '0x1111111111111111111111111111111111111111',
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../../test/react-native')
  return {
    ...rn,
    Share: { share: vi.fn(async () => {}) },
  }
})

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
  useRouter: () => mockState.router,
}))

vi.mock('expo-clipboard', () => ({
  setStringAsync: mockState.clipboard,
}))

vi.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success' },
  notificationAsync: mockState.haptics,
}))

vi.mock('expo-sharing', () => ({
  shareAsync: vi.fn(async () => {}),
}))

vi.mock('react-native-view-shot', async () => {
  const ReactActual = await import('react')
  const { View } = await import('../../../test/react-native')
  return {
    default: ReactActual.forwardRef(({ children }: { children: React.ReactNode }, ref) => {
      ReactActual.useImperativeHandle(ref, () => ({ capture: async () => null }))
      return ReactActual.createElement(View, null, children)
    }),
  }
})

vi.mock('react-native-qrcode-svg', async () => {
  const { View } = await import('../../../test/react-native')
  return { default: View }
})

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return {
    Check: TestIcon,
    ChevronDown: TestIcon,
    ChevronLeft: TestIcon,
    Copy: TestIcon,
    Share: TestIcon,
  }
})

vi.mock('@/store', () => ({
  useWalletStore: () => ({ wallet: mockState.wallet }),
}))

vi.mock('@/components/ui', async () => {
  const { TestButton, TestCard } = await import('../../../test/mainScreenMocks')
  return { Button: TestButton, Card: TestCard }
})

vi.mock('@/lib/i18n', async () => {
  const { createI18nMock } = await import('../../../test/mainScreenMocks')
  return createI18nMock()
})

vi.mock('@/lib/cryptoTheme', async () => {
  const { createCryptoThemeMock } = await import('../../../test/mainScreenMocks')
  return createCryptoThemeMock()
})

vi.mock('@/lib/cryptoIcons', () => ({
  CRYPTO_NETWORK_ICONS: {
    ethereum: 1,
    mozaga: 1,
  },
}))

vi.mock('@/services/crypto', () => ({
  CRYPTO_NETWORK_BY_ID: {
    ethereum: { id: 'ethereum', name: 'Ethereum', shortName: 'Ethereum', nativeSymbol: 'ETH', accentName: 'ethereum' },
    mozaga: { id: 'mozaga', name: 'Mozaga', shortName: 'Mozaga', nativeSymbol: 'EXO', accentName: 'mozaga' },
  },
  getAvailableNetworks: () => [
    { id: 'mozaga', name: 'Mozaga', shortName: 'Mozaga', nativeSymbol: 'EXO', accentName: 'mozaga' },
    { id: 'ethereum', name: 'Ethereum', shortName: 'Ethereum', nativeSymbol: 'ETH', accentName: 'ethereum' },
  ],
  getWalletAddressForNetwork: (wallet: typeof mockState.wallet, network: string) => (
    network === 'ethereum' ? wallet.ethereumAddress : wallet.address
  ),
}))

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: ReceiveScreen } = await import('../../../app/(main)/crypto/receive')

describe('ReceiveScreen', () => {
  beforeEach(() => {
    mockState.clipboard.mockClear()
    mockState.haptics.mockClear()
    mockState.params = { network: 'mozaga' }
  })

  it('copies the selected network receive address', async () => {
    render(<ReceiveScreen />)

    expect(screen.getAllByText(mockState.wallet.address).length).toBeGreaterThan(0)
    await fireEvent.press(screen.getByTestId('button-Copy'))

    expect(mockState.clipboard).toHaveBeenCalledWith(mockState.wallet.address)
    expect(mockState.haptics).toHaveBeenCalledWith('success')
  })

  it('defaults unknown network params to the Mozaga receive address', () => {
    mockState.params = { network: 'unknown' }

    render(<ReceiveScreen />)

    expect(screen.getAllByText(mockState.wallet.address).length).toBeGreaterThan(0)
  })
})
