/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  alert: vi.fn(),
  keyboardDismiss: vi.fn(),
  router: {
    back: vi.fn(),
    push: vi.fn(),
  },
  wallet: {
    address: 'EXO001111111111111111111111111111111111111',
    privateKey: 'private-key',
    publicKey: 'public-key',
  },
  crypto: {
    getBalance: vi.fn(async () => '2.000000'),
    getDonationTransferQuote: vi.fn(({ amountUnits }: { amountUnits: bigint | null }) => (
      amountUnits
        ? {
          networkId: 'mozaga',
          treasuryAddress: 'EXO00ac5d503f066e4f0f9d19be88a050644c9657c5',
          amountUnits: amountUnits / 1000n,
          amount: '0.0015',
          symbol: 'EXO',
          decimals: 18,
          cappedByUsd: false,
        }
        : null
    )),
    isValidExoAddress: vi.fn((value: string) => value.startsWith('EXO00')),
    recordPendingCryptoTransaction: vi.fn(async () => undefined),
    sendEXOTransfer: vi.fn(async () => ({ txHash: '0xtx' })),
    waitForTransaction: vi.fn(async () => ({ status: 'confirmed' as const })),
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../../test/react-native')
  return {
    ...rn,
    Alert: { alert: mockState.alert },
    Keyboard: { ...rn.Keyboard, dismiss: mockState.keyboardDismiss },
  }
})

vi.mock('react-native-keyboard-controller', async () => {
  const { View } = await import('../../../test/react-native')
  return { KeyboardAvoidingView: View }
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return {
    AlertCircle: TestIcon,
    Check: TestIcon,
    ChevronLeft: TestIcon,
    Scan: TestIcon,
    Send: TestIcon,
  }
})

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
}))

vi.mock('@/store', () => ({
  useUIStore: (selector: (state: { preferredFiatCurrency: string }) => unknown) => selector({
    preferredFiatCurrency: 'USD',
  }),
  useWalletStore: () => ({ wallet: mockState.wallet }),
}))

vi.mock('@/hooks/useMarketPrices', () => ({
  useMarketPrices: () => ({ data: null }),
}))

vi.mock('@/services/backend/contributionRecipients', () => ({
  getContributionRecipients: vi.fn(async () => ({
    keyId: 'contrib-2026-06',
    version: 1,
    issuedAt: '2026-06-14T00:00:00Z',
    recipients: {
      mozaga: 'EXO00ac5d503f066e4f0f9d19be88a050644c9657c5',
      ethereum: '0x399eC6461bd7749Ee70Ed058C66DF11ca0975C40',
      bitcoin: 'bc1qutw4m2zafmm0qk5kuk8nuja3d7t7fehvzg5m5u',
      solana: '8LuyPqtzPKCPB2ziMGHHwZHjTjVNmUX84mVSzYqYYekG',
      tron: 'TJMCieDbHfu5g3Gb3xhyhgYiAHggt1hyND',
    },
  })),
}))

vi.mock('@/services/crypto', () => mockState.crypto)

vi.mock('@/components/ui', async () => {
  const { TestButton } = await import('../../../test/mainScreenMocks')
  return { Button: TestButton }
})

vi.mock('@/lib/i18n', async () => {
  const { createI18nMock } = await import('../../../test/mainScreenMocks')
  return createI18nMock()
})

vi.mock('@/lib/utils', () => ({
  formatAddress: (value: string) => value,
}))

vi.mock('@/lib/cryptoTheme', async () => {
  const { createCryptoThemeMock } = await import('../../../test/mainScreenMocks')
  return createCryptoThemeMock()
})

const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: SendEXOScreen } = await import('../../../app/(main)/crypto/send')

function textInputs(root: ReturnType<typeof render>['root']) {
  return root.findAll((node) => (node.type as unknown) === 'TextInput')
}

async function fillValidTransaction(root: ReturnType<typeof render>['root'], amount: string) {
  const [recipientInput, amountInput] = textInputs(root)
  await fireEvent.changeText(recipientInput, 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
  await fireEvent.changeText(amountInput, amount)
}

describe('SendEXOScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('__DEV__', false)
    mockState.alert.mockClear()
    mockState.keyboardDismiss.mockClear()
    mockState.router.back.mockClear()
    mockState.router.push.mockClear()
    mockState.crypto.getBalance.mockResolvedValue('2.000000')
    mockState.crypto.sendEXOTransfer.mockResolvedValue({ txHash: '0xtx' })
    mockState.crypto.waitForTransaction.mockResolvedValue({ status: 'confirmed' })
    mockState.crypto.waitForTransaction.mockClear()
    mockState.crypto.recordPendingCryptoTransaction.mockClear()
    mockState.crypto.sendEXOTransfer.mockClear()
    mockState.crypto.getDonationTransferQuote.mockClear()
  })

  it('supports Done and drag dismissal and closes the keyboard before navigation', async () => {
    const view = render(<SendEXOScreen />)
    const amountInput = textInputs(view.root)[1]
    const scrollView = view.root.findByType('RCTScrollView' as any)

    expect(amountInput.props.inputAccessoryViewID).toBe('send-exo-amount-keyboard')
    expect(scrollView.props.keyboardDismissMode).toBe('on-drag')
    expect(scrollView.props.keyboardShouldPersistTaps).toBe('handled')

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Back' }))

    expect(mockState.keyboardDismiss).toHaveBeenCalledOnce()
    expect(mockState.router.back).toHaveBeenCalledOnce()

    mockState.keyboardDismiss.mockClear()
    await fillValidTransaction(view.root, '1')
    await fireEvent.press(screen.getByTestId('button-Review Transaction'))

    expect(mockState.keyboardDismiss).toHaveBeenCalledOnce()
  })

  it('normalizes localized decimal input before sending to the crypto service', async () => {
    const view = render(<SendEXOScreen />)
    await fillValidTransaction(view.root, '1,5')

    await fireEvent.press(screen.getByTestId('button-Review Transaction'))
    await fireEvent.press(screen.getByTestId('button-Confirm & Send'))

    expect(mockState.crypto.sendEXOTransfer).toHaveBeenCalledWith(
      'private-key',
      'public-key',
      mockState.wallet.address,
      'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '1.5',
    )
    expect(mockState.crypto.sendEXOTransfer).toHaveBeenCalledWith(
      'private-key',
      'public-key',
      mockState.wallet.address,
      'EXO00ac5d503f066e4f0f9d19be88a050644c9657c5',
      '0.0015',
    )
    expect(mockState.crypto.recordPendingCryptoTransaction).toHaveBeenCalledWith(expect.objectContaining({
      network: 'mozaga',
      txHash: '0xtx',
      amount: '1.5',
      symbol: 'EXO',
      assetType: 'native',
    }))
    expect(mockState.crypto.recordPendingCryptoTransaction).toHaveBeenCalledWith(expect.objectContaining({
      network: 'mozaga',
      to: 'EXO00ac5d503f066e4f0f9d19be88a050644c9657c5',
      amount: '0.0015',
      symbol: 'EXO',
      assetType: 'native',
    }))
    expect(screen.getByText('Transaction Sent')).toBeTruthy()
  })

  it('shows sent status immediately after broadcast', async () => {
    mockState.crypto.waitForTransaction.mockResolvedValue({ status: 'pending' } as any)
    const view = render(<SendEXOScreen />)
    await fillValidTransaction(view.root, '1')

    await fireEvent.press(screen.getByTestId('button-Review Transaction'))
    await fireEvent.press(screen.getByTestId('button-Confirm & Send'))

    expect(screen.getByText('Transaction Sent')).toBeTruthy()
    expect(mockState.crypto.waitForTransaction).not.toHaveBeenCalled()
    expect(() => screen.getByText('Sent Successfully!')).toThrow()
  })
})
