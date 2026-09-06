/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance } from 'react-test-renderer'

const mockState = vi.hoisted(() => ({
  alert: vi.fn(),
  keyboardDismiss: vi.fn(),
  router: {
    back: vi.fn(),
  },
  wallet: {
    ethereumAddress: '0x1111111111111111111111111111111111111111',
    ethereumPrivateKey: 'eth-private-key',
  },
  crypto: {
    estimateGas: vi.fn(async () => 65_000n),
    formatEthAddress: (value: string) => value,
    getAllTokenBalances: vi.fn(async () => [] as Array<{
      address: string
      balance: string
      decimals: number
      logoColor: string
      name: string
      symbol: string
    }>),
    getDonationTransferQuote: vi.fn(({ amountUnits, symbol, decimals }: { amountUnits: bigint | null; symbol: string; decimals: number }) => (
      amountUnits
        ? {
          networkId: 'ethereum',
          treasuryAddress: '0x399eC6461bd7749Ee70Ed058C66DF11ca0975C40',
          amountUnits: amountUnits / 1000n,
          amount: symbol === 'TEST' ? '0.001' : '0.00125',
          symbol,
          decimals,
          cappedByUsd: false,
        }
        : null
    )),
    getEthBalance: vi.fn(async () => '2'),
    getEthNonce: vi.fn(async () => 7n),
    getGasPrice: vi.fn(async () => 1n),
    isValidEthAddress: vi.fn((value: string) => value.startsWith('0x') && value.length === 42),
    recordPendingCryptoTransaction: vi.fn(async () => undefined),
    sendERC20Transfer: vi.fn(async () => ({ txHash: '0x' + 'b'.repeat(64) })),
    sendEthTransfer: vi.fn(async () => ({ txHash: '0x' + 'a'.repeat(64) })),
    waitForEthTransaction: vi.fn(async () => ({ status: 'confirmed' as const })),
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../../test/react-native')
  return {
    ...rn,
    Alert: { alert: mockState.alert },
    Keyboard: { ...rn.Keyboard, dismiss: mockState.keyboardDismiss },
    Linking: { openURL: vi.fn() },
  }
})

vi.mock('react-native-keyboard-controller', async () => {
  const { View } = await import('../../../test/react-native')
  return { KeyboardAvoidingView: View }
})

vi.mock('expo-router', () => ({
  useRouter: () => mockState.router,
}))

vi.mock('expo-clipboard', () => ({
  setStringAsync: vi.fn(async () => {}),
}))

vi.mock('react-native-safe-area-context', async () => {
  const { createSafeAreaMock } = await import('../../../test/mainScreenMocks')
  return createSafeAreaMock()
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainScreenMocks')
  return {
    AlertCircle: TestIcon,
    Check: TestIcon,
    ChevronDown: TestIcon,
    ChevronLeft: TestIcon,
    Copy: TestIcon,
    ExternalLink: TestIcon,
    Send: TestIcon,
  }
})

vi.mock('../../../assets/images/logos/eth-diamond-color.png', () => 1)

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

vi.mock('@/lib/i18n/direction', () => ({
  getStartBorderStyle: () => ({}),
  getStartPaddingStyle: () => ({}),
  isCurrentLanguageRtl: () => false,
}))

vi.mock('@/lib/cryptoTheme', async () => {
  const { createCryptoThemeMock, testColors } = await import('../../../test/mainScreenMocks')
  return {
    ...createCryptoThemeMock(),
    CRYPTO_BRAND_ACCENTS: { ethereum: testColors.primary },
  }
})

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: SendEthScreen } = await import('../../../app/(main)/crypto/send-eth')

function textContent(node: ReactTestInstance): string {
  return node.children.map((child) => (
    typeof child === 'string' ? child : textContent(child)
  )).join('')
}

function getPressableByText(root: ReactTestInstance, text: string): ReactTestInstance {
  const match = root.findAll((node) => (
    typeof node.props.onPress === 'function' && textContent(node).includes(text)
  ))[0]
  if (!match) throw new Error(`Unable to find pressable ${text}`)
  return match
}

function textInputs(root: ReactTestInstance) {
  return root.findAll((node) => (node.type as unknown) === 'TextInput')
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('SendEthScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('__DEV__', false)
    mockState.alert.mockClear()
    mockState.keyboardDismiss.mockClear()
    mockState.router.back.mockClear()
    mockState.crypto.getEthBalance.mockResolvedValue('2')
    mockState.crypto.getAllTokenBalances.mockResolvedValue([])
    mockState.crypto.getGasPrice.mockResolvedValue(1n)
    mockState.crypto.estimateGas.mockResolvedValue(65_000n)
    mockState.crypto.sendEthTransfer.mockResolvedValue({ txHash: '0x' + 'a'.repeat(64) })
    mockState.crypto.sendERC20Transfer.mockResolvedValue({ txHash: '0x' + 'b'.repeat(64) })
    mockState.crypto.waitForEthTransaction.mockResolvedValue({ status: 'confirmed' })
    mockState.crypto.waitForEthTransaction.mockClear()
    mockState.crypto.recordPendingCryptoTransaction.mockClear()
    mockState.crypto.sendEthTransfer.mockClear()
    mockState.crypto.sendERC20Transfer.mockClear()
    mockState.crypto.getEthNonce.mockClear()
    mockState.crypto.getDonationTransferQuote.mockClear()
  })

  it('supports Done and drag dismissal and closes the keyboard before navigation', async () => {
    const view = render(<SendEthScreen />)
    await flushEffects()
    const [recipientInput, amountInput] = textInputs(view.root)
    const scrollView = view.root.findByType('RCTScrollView' as any)

    expect(amountInput.props.inputAccessoryViewID).toBe('send-eth-amount-keyboard')
    expect(scrollView.props.keyboardDismissMode).toBe('on-drag')
    expect(scrollView.props.keyboardShouldPersistTaps).toBe('handled')

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Back' }))

    expect(mockState.keyboardDismiss).toHaveBeenCalledOnce()
    expect(mockState.router.back).toHaveBeenCalledOnce()

    mockState.keyboardDismiss.mockClear()
    await fireEvent.changeText(recipientInput, '0x2222222222222222222222222222222222222222')
    await fireEvent.changeText(amountInput, '1')
    await fireEvent.press(getPressableByText(view.root, 'Review Transaction'))

    expect(mockState.keyboardDismiss).toHaveBeenCalledOnce()
  })

  it('normalizes localized ETH amounts before submitting the transfer', async () => {
    const view = render(<SendEthScreen />)
    await flushEffects()

    const [recipientInput, amountInput] = textInputs(view.root)
    await fireEvent.changeText(recipientInput, '0x2222222222222222222222222222222222222222')
    await fireEvent.changeText(amountInput, '1,25')
    await fireEvent.press(getPressableByText(view.root, 'Review Transaction'))
    await fireEvent.press(getPressableByText(view.root, 'Confirm & Send'))

    expect(mockState.crypto.sendEthTransfer).toHaveBeenCalledWith(
      'eth-private-key',
      mockState.wallet.ethereumAddress,
      '0x2222222222222222222222222222222222222222',
      '1.25',
      { nonce: 7n },
    )
    expect(mockState.crypto.sendEthTransfer).toHaveBeenCalledWith(
      'eth-private-key',
      mockState.wallet.ethereumAddress,
      '0x399eC6461bd7749Ee70Ed058C66DF11ca0975C40',
      '0.00125',
      { nonce: 8n },
    )
    expect(mockState.crypto.recordPendingCryptoTransaction).toHaveBeenCalledWith(expect.objectContaining({
      network: 'ethereum',
      txHash: '0x' + 'a'.repeat(64),
      amount: '1.25',
      symbol: 'ETH',
      assetType: 'native',
    }))
    expect(mockState.crypto.recordPendingCryptoTransaction).toHaveBeenCalledWith(expect.objectContaining({
      network: 'ethereum',
      to: '0x399eC6461bd7749Ee70Ed058C66DF11ca0975C40',
      amount: '0.00125',
      symbol: 'ETH',
      assetType: 'native',
    }))
  })

  it('renders broadcast transactions as sent immediately', async () => {
    mockState.crypto.waitForEthTransaction.mockResolvedValue({ status: 'pending' } as any)
    const view = render(<SendEthScreen />)
    await flushEffects()

    const [recipientInput, amountInput] = textInputs(view.root)
    await fireEvent.changeText(recipientInput, '0x2222222222222222222222222222222222222222')
    await fireEvent.changeText(amountInput, '1')
    await fireEvent.press(getPressableByText(view.root, 'Review Transaction'))
    await fireEvent.press(getPressableByText(view.root, 'Confirm & Send'))

    expect(screen.getByText('Transaction Sent')).toBeTruthy()
    expect(mockState.crypto.waitForEthTransaction).not.toHaveBeenCalled()
    expect(() => screen.getByText('Sent Successfully!')).toThrow()
  })

  it('blocks token review when the native ETH balance cannot cover gas', async () => {
    mockState.crypto.getEthBalance.mockResolvedValue('0')
    mockState.crypto.getAllTokenBalances.mockResolvedValue([{
      address: '0x3333333333333333333333333333333333333333',
      balance: '50',
      decimals: 6,
      logoColor: '#00ff99',
      name: 'Test Token',
      symbol: 'TEST',
    }])
    const view = render(<SendEthScreen />)
    await flushEffects()

    await fireEvent.press(getPressableByText(view.root, 'ETH'))
    await fireEvent.press(getPressableByText(view.root, 'TEST'))

    const [recipientInput, amountInput] = textInputs(view.root)
    await fireEvent.changeText(recipientInput, '0x2222222222222222222222222222222222222222')
    await fireEvent.changeText(amountInput, '1')
    await fireEvent.press(getPressableByText(view.root, 'Review Transaction'))

    expect(mockState.crypto.sendERC20Transfer).not.toHaveBeenCalled()
    expect(() => screen.getByText('Confirm Send')).toThrow()
  })
})
