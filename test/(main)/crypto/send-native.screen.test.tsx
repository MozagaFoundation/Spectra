/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactTestInstance } from 'react-test-renderer'

const mockState = vi.hoisted(() => ({
  keyboardDismiss: vi.fn(),
  params: { network: 'ethereum' as string | undefined },
  router: {
    back: vi.fn(),
  },
  wallet: {
    ethereumAddress: '0x1111111111111111111111111111111111111111',
    ethereumPrivateKey: 'eth-private',
    solanaAddress: 'solana-address',
    solanaPrivateKey: 'solana-private',
  },
  crypto: {
    CRYPTO_NETWORK_BY_ID: {
      ethereum: { id: 'ethereum', name: 'Ethereum', shortName: 'Ethereum', nativeSymbol: 'ETH', decimals: 18, accentName: 'ethereum' },
      bitcoin: { id: 'bitcoin', name: 'Bitcoin', shortName: 'Bitcoin', nativeSymbol: 'BTC', decimals: 8, accentName: 'bitcoin' },
      solana: { id: 'solana', name: 'Solana', shortName: 'Solana', nativeSymbol: 'SOL', decimals: 9, accentName: 'solana' },
      tron: { id: 'tron', name: 'Tron', shortName: 'Tron', nativeSymbol: 'TRX', decimals: 6, accentName: 'tron' },
      mozaga: { id: 'mozaga', name: 'Mozaga', shortName: 'Mozaga', nativeSymbol: 'EXO', decimals: 18, accentName: 'mozaga' },
    },
    getAllSolanaTokenBalances: vi.fn(async () => [] as any[]),
    getAllTronTokenBalances: vi.fn(async () => [] as any[]),
    getBitcoinExplorerTxUrl: (tx: string) => `btc:${tx}`,
    getEthExplorerTxUrl: (tx: string) => `eth:${tx}`,
    getDonationTransferQuote: vi.fn(({ amountUnits, networkId, symbol, decimals }: {
      amountUnits: bigint | null
      networkId: string
      symbol: string
      decimals: number
    }) => (
      amountUnits
        ? {
          networkId,
          treasuryAddress: networkId === 'solana'
            ? 'solana-donation-address'
            : '0x399eC6461bd7749Ee70Ed058C66DF11ca0975C40',
          amountUnits: amountUnits / 1000n,
          amount: symbol === 'SPL' ? '0.001' : '0.001',
          symbol,
          decimals,
          cappedByUsd: false,
        }
        : null
    )),
    getNativeBalanceForNetwork: vi.fn(async () => '2'),
    getNativeFeeForNetwork: vi.fn(async () => 1n),
    getEthNonce: vi.fn(async () => 11n),
    getSolanaExplorerTxUrl: (tx: string) => `sol:${tx}`,
    getTronExplorerTxUrl: (tx: string) => `tron:${tx}`,
    loadNativeBalanceForNetwork: vi.fn(async () => '2'),
    getWalletAddressForNetwork: vi.fn((wallet: { ethereumAddress: string; solanaAddress: string }, network: string) => (
      network === 'solana' ? wallet.solanaAddress : wallet.ethereumAddress
    )),
    getWalletPrivateKeyForNetwork: vi.fn((wallet: { ethereumPrivateKey: string; solanaPrivateKey: string }, network: string) => (
      network === 'solana' ? wallet.solanaPrivateKey : wallet.ethereumPrivateKey
    )),
    isValidAddressForNetwork: vi.fn(() => true),
    recordPendingCryptoTransaction: vi.fn(async () => undefined),
    sendNativeTransferForNetwork: vi.fn(async () => ({ txHash: '0xnative' })),
    sendSplTokenTransfer: vi.fn(async () => ({ txHash: '0xspl' })),
    sendTrc20Transfer: vi.fn(async () => ({ txHash: '0xtrc' })),
    waitForNativeTransaction: vi.fn(async () => ({ status: 'confirmed' as const })),
  },
}))

vi.mock('react-native', async () => {
  const rn = await import('../../../test/react-native')
  return {
    ...rn,
    Alert: { alert: vi.fn() },
    Keyboard: { ...rn.Keyboard, dismiss: mockState.keyboardDismiss },
    Linking: { openURL: vi.fn() },
  }
})

vi.mock('react-native-keyboard-controller', async () => {
  const { View } = await import('../../../test/react-native')
  return { KeyboardAvoidingView: View }
})

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
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

vi.mock('@/components/ui', async () => {
  const { TestButton } = await import('../../../test/mainScreenMocks')
  return { Button: TestButton }
})

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

vi.mock('@/lib/i18n', async () => {
  const { createI18nMock } = await import('../../../test/mainScreenMocks')
  return createI18nMock()
})

vi.mock('@/lib/cryptoTheme', async () => {
  const { createCryptoThemeMock } = await import('../../../test/mainScreenMocks')
  return createCryptoThemeMock()
})

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: SendNativeScreen } = await import('../../../app/(main)/crypto/send-native')

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

describe('SendNativeScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('__DEV__', false)
    mockState.keyboardDismiss.mockClear()
    mockState.params = { network: 'ethereum' }
    mockState.router.back.mockClear()
    mockState.crypto.getNativeBalanceForNetwork.mockResolvedValue('2')
    mockState.crypto.loadNativeBalanceForNetwork.mockResolvedValue('2')
    mockState.crypto.getNativeFeeForNetwork.mockResolvedValue(1n)
    mockState.crypto.getAllSolanaTokenBalances.mockResolvedValue([])
    mockState.crypto.waitForNativeTransaction.mockResolvedValue({ status: 'confirmed' })
    mockState.crypto.waitForNativeTransaction.mockClear()
    mockState.crypto.recordPendingCryptoTransaction.mockClear()
    mockState.crypto.sendNativeTransferForNetwork.mockClear()
    mockState.crypto.sendSplTokenTransfer.mockClear()
    mockState.crypto.getDonationTransferQuote.mockClear()
    mockState.crypto.getEthNonce.mockClear()
  })

  it('supports Done and drag dismissal and closes the keyboard before navigation', async () => {
    const view = render(<SendNativeScreen />)
    await flushEffects()
    const [recipientInput, amountInput] = textInputs(view.root)
    const scrollView = view.root.findByType('RCTScrollView' as any)

    expect(amountInput.props.inputAccessoryViewID).toBe('send-native-amount-keyboard')
    expect(scrollView.props.keyboardDismissMode).toBe('on-drag')
    expect(scrollView.props.keyboardShouldPersistTaps).toBe('handled')

    await fireEvent.press(view.root.findByProps({ accessibilityLabel: 'Back' }))

    expect(mockState.keyboardDismiss).toHaveBeenCalledOnce()
    expect(mockState.router.back).toHaveBeenCalledOnce()

    mockState.keyboardDismiss.mockClear()
    await fireEvent.changeText(recipientInput, '0x2222222222222222222222222222222222222222')
    await fireEvent.changeText(amountInput, '1')
    await fireEvent.press(screen.getByTestId('button-Review Send'))

    expect(mockState.keyboardDismiss).toHaveBeenCalledOnce()
  })

  it('renders broadcast native transactions as sent immediately', async () => {
    mockState.crypto.waitForNativeTransaction.mockResolvedValue({ status: 'pending' } as any)
    const view = render(<SendNativeScreen />)
    await flushEffects()

    const [recipientInput, amountInput] = textInputs(view.root)
    await fireEvent.changeText(recipientInput, '0x2222222222222222222222222222222222222222')
    await fireEvent.changeText(amountInput, '1')
    await fireEvent.press(screen.getByTestId('button-Review Send'))
    await fireEvent.press(screen.getByTestId('button-Confirm & Send'))

    expect(screen.getByText('Transaction Sent')).toBeTruthy()
    expect(mockState.crypto.recordPendingCryptoTransaction).toHaveBeenCalledWith(expect.objectContaining({
      network: 'ethereum',
      txHash: '0xnative',
      amount: '1',
      symbol: 'ETH',
      assetType: 'native',
    }))
    expect(mockState.crypto.waitForNativeTransaction).not.toHaveBeenCalled()
    expect(() => screen.getByText('Sent Successfully!')).toThrow()
  })

  it('requires enough native gas before enabling token sends', async () => {
    mockState.params = { network: 'solana' }
    mockState.crypto.getNativeBalanceForNetwork.mockResolvedValue('0')
    mockState.crypto.loadNativeBalanceForNetwork.mockResolvedValue('0')
    mockState.crypto.getNativeFeeForNetwork.mockResolvedValue(5000n)
    mockState.crypto.getAllSolanaTokenBalances.mockResolvedValue([{
      balance: '10',
      decimals: 6,
      logoColor: '#00ff99',
      mintAddress: 'mint-address',
      name: 'Solana Token',
      symbol: 'SPL',
    }] as any)
    const view = render(<SendNativeScreen />)
    await flushEffects()

    await fireEvent.press(getPressableByText(view.root, 'Solana'))
    await fireEvent.press(getPressableByText(view.root, 'SPL'))

    const [recipientInput, amountInput] = textInputs(view.root)
    await fireEvent.changeText(recipientInput, 'solana-recipient')
    await fireEvent.changeText(amountInput, '1')
    await fireEvent.press(screen.getByTestId('button-Review Send'))

    expect(mockState.crypto.sendSplTokenTransfer).not.toHaveBeenCalled()
    expect(() => screen.getByText('Confirm Transaction')).toThrow()
  })
})
