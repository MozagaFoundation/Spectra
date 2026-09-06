/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findPressableByText } from '@/test/chatComponentMocks'

const mockState = vi.hoisted(() => ({
  crypto: {
    isValidExoAddress: vi.fn(() => true),
    recordPendingCryptoTransaction: vi.fn(async () => undefined),
    sendEXOTransfer: vi.fn(async () => ({ txHash: '0xabc' })),
    waitForTransaction: vi.fn(async () => ({ status: 'confirmed' })),
  },
  portfolioBalances: {
    invalidateCryptoPortfolio: vi.fn(async () => undefined),
    loadEthereumPortfolioData: vi.fn(async () => ({ balance: '0', tokens: [] })),
    loadExternalPortfolioData: vi.fn(async () => ({ balances: {}, tokens: {} })),
    loadMozagaPortfolioData: vi.fn(async () => ({ balance: '1', assets: [] })),
    refetchCryptoPortfolio: vi.fn(async () => undefined),
  },
  haptics: {
    impactAsync: vi.fn(async () => undefined),
    notificationAsync: vi.fn(async () => undefined),
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
    NotificationFeedbackType: { Error: 'error', Success: 'success', Warning: 'warning' },
  },
  wallet: {
    wallet: {
      address: 'EXO_SENDER',
      privateKey: 'private-key',
      publicKey: 'public-key',
    },
  },
}))

vi.mock('react-native-keyboard-controller', async () => {
  const { View } = await import('../../test/react-native')
  return { KeyboardAvoidingView: View }
})

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn(async () => undefined) }))
vi.mock('expo-haptics', () => mockState.haptics)
vi.mock('lucide-react-native', async () => {
  const { TestChatIcon } = await import('../../test/chatComponentMocks')
  return {
    AlertCircle: TestChatIcon,
    ArrowUpRight: TestChatIcon,
    Check: TestChatIcon,
    ChevronDown: TestChatIcon,
    ChevronLeft: TestChatIcon,
    Coins: TestChatIcon,
    Copy: TestChatIcon,
    ExternalLink: TestChatIcon,
    Send: TestChatIcon,
    X: TestChatIcon,
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/i18n', async () => {
  const { translateForChatTest } = await import('../../test/chatComponentMocks')
  return { translate: translateForChatTest }
})

vi.mock('@/lib/cryptoTheme', async () => {
  const { chatTestColors } = await import('../../test/chatComponentMocks')
  return {
    CRYPTO_BRAND_ACCENTS: { mozaga: '#00ff99', ethereum: '#627eea' },
    useCryptoTheme: () => ({
      colors: chatTestColors,
      accent: () => '#00ff99',
      alpha: (color: string, opacity: number) => `${color}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`,
      assetClassAccent: () => '#00ff99',
      resolveExternalAccent: (color: string) => color,
    }),
  }
})

vi.mock('@/lib/cryptoIcons', () => ({
  CRYPTO_NETWORK_ICONS: { mozaga: 1, ethereum: 2 },
}))

vi.mock('@/lib/utils', () => ({
  formatAddress: (value: string) => value,
}))

vi.mock('@/lib/amounts', () => ({
  formatBigIntAmount: (value: bigint, decimals: number) => {
    const divisor = 10n ** BigInt(decimals)
    const whole = value / divisor
    const fraction = (value % divisor).toString().padStart(decimals, '0').replace(/0+$/, '')
    return fraction ? `${whole}.${fraction}` : `${whole}`
  },
  parseDecimalToBigInt: (value: string, decimals: number) => {
    if (!/^\d+(\.\d+)?$/.test(value)) return null
    const [whole, rawFraction = ''] = value.split('.')
    const fraction = rawFraction.padEnd(decimals, '0').slice(0, decimals)
    return BigInt(whole) * (10n ** BigInt(decimals)) + BigInt(fraction || '0')
  },
}))

vi.mock('@/store', () => ({
  useUIStore: (selector: (state: { preferredFiatCurrency: string }) => unknown) => selector({
    preferredFiatCurrency: 'USD',
  }),
  useWalletStore: () => mockState.wallet,
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: { enabled: boolean; spectreAccountMode: null }) => unknown) => selector({
    enabled: false,
    spectreAccountMode: null,
  }),
}))

vi.mock('@/services/crypto/portfolioBalances', () => mockState.portfolioBalances)

vi.mock('@/hooks/useMarketPrices', () => ({
  useMarketPrices: () => ({
    data: {
      baseFiat: 'USD',
      assetPrices: [{ symbol: 'EXO', usdRate: '0.01', source: 'test', fetchedAt: '2026-06-14T00:00:00Z', expiresAt: '2026-06-15T00:00:00Z' }],
      fiatRates: [],
    },
  }),
}))

vi.mock('@/services/backend/contributionRecipients', () => ({
  getContributionRecipients: vi.fn(async () => ({
    keyId: 'contrib-2026-06',
    version: 1,
    issuedAt: '2026-06-14T00:00:00Z',
    recipients: {
      mozaga: 'EXO_TREASURY',
      ethereum: '0x399eC6461bd7749Ee70Ed058C66DF11ca0975C40',
      bitcoin: 'bc1qutw4m2zafmm0qk5kuk8nuja3d7t7fehvzg5m5u',
      solana: '8LuyPqtzPKCPB2ziMGHHwZHjTjVNmUX84mVSzYqYYekG',
      tron: 'TJMCieDbHfu5g3Gb3xhyhgYiAHggt1hyND',
    },
  })),
}))

vi.mock('@/services/crypto', () => ({
  DONATION_RATE_DENOMINATOR: 1000n,
  CRYPTO_NETWORK_BY_ID: {
    mozaga: { id: 'mozaga', name: 'Mozaga Mainnet', shortName: 'Mozaga', nativeSymbol: 'EXO', decimals: 18, accentName: 'mozaga' },
    ethereum: { id: 'ethereum', name: 'Ethereum', shortName: 'Ethereum', nativeSymbol: 'ETH', decimals: 18, accentName: 'ethereum' },
  },
  estimateGas: vi.fn(async () => 21000n),
  formatEthAddress: (value: string) => value,
  getAllSolanaTokenBalances: vi.fn(async () => []),
  getAllTokenBalances: vi.fn(async () => []),
  getAllTronTokenBalances: vi.fn(async () => []),
  getAvailableNetworks: () => [{ id: 'mozaga', name: 'Mozaga Mainnet', shortName: 'Mozaga', nativeSymbol: 'EXO', decimals: 18, accentName: 'mozaga' }],
  getBalance: vi.fn(async () => '1'),
  getBitcoinExplorerTxUrl: (hash: string) => `https://btc.example/${hash}`,
  getEthBalance: vi.fn(async () => '0'),
  getEthExplorerTxUrl: (hash: string) => `https://eth.example/${hash}`,
  getGasPrice: vi.fn(async () => 1n),
  getDonationTransferQuote: vi.fn(({ amountUnits, symbol, decimals }) => (
    amountUnits && amountUnits > 0n
      ? {
          networkId: 'mozaga',
          treasuryAddress: 'EXO_TREASURY',
          amountUnits: amountUnits / 1000n,
          amount: '0.0001',
          symbol,
          decimals,
          cappedByUsd: false,
        }
      : null
  )),
  getEthNonce: vi.fn(async () => 1n),
  getMozagaExplorerTxUrl: (hash: string) => `https://mozaga.example/${hash}`,
  getNativeBalanceForNetwork: vi.fn(async () => '0'),
  getSolanaExplorerTxUrl: (hash: string) => `https://solana.example/${hash}`,
  getTronExplorerTxUrl: (hash: string) => `https://tron.example/${hash}`,
  getUserAssets: vi.fn(async () => []),
  getWalletAddressForNetwork: vi.fn(() => null),
  getWalletPrivateKeyForNetwork: vi.fn(() => null),
  isEvmNetwork: () => false,
  isValidAddressForNetwork: vi.fn(() => true),
  isValidEthAddress: vi.fn(() => true),
  isValidExoAddress: mockState.crypto.isValidExoAddress,
  recordPendingCryptoTransaction: mockState.crypto.recordPendingCryptoTransaction,
  sendERC20Transfer: vi.fn(),
  sendEXOTransfer: mockState.crypto.sendEXOTransfer,
  sendEthTransfer: vi.fn(),
  sendNativeTransferForNetwork: vi.fn(),
  sendSplTokenTransfer: vi.fn(),
  sendTrc20Transfer: vi.fn(),
  transferAsset: vi.fn(),
  waitForEthTransaction: vi.fn(),
  waitForNativeTransaction: vi.fn(),
  waitForTransaction: mockState.crypto.waitForTransaction,
}))

const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
const { act, fireEvent, render } = await import('@testing-library/react-native')
const { SendCryptoModal } = await import('./SendCryptoModal')

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
      },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  )
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('SendCryptoModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.crypto.isValidExoAddress.mockReturnValue(true)
    mockState.crypto.recordPendingCryptoTransaction.mockResolvedValue(undefined)
    let exoSendCount = 0
    mockState.crypto.sendEXOTransfer.mockImplementation(async () => ({
      txHash: exoSendCount++ === 0 ? '0xabc' : '0xcontribution',
    }))
    mockState.crypto.waitForTransaction.mockResolvedValue({ status: 'confirmed' })
    mockState.portfolioBalances.loadMozagaPortfolioData.mockResolvedValue({ balance: '1', assets: [] })
    mockState.portfolioBalances.loadEthereumPortfolioData.mockResolvedValue({ balance: '0', tokens: [] })
    mockState.portfolioBalances.loadExternalPortfolioData.mockResolvedValue({ balances: {}, tokens: {} })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('shows the payment request payee instead of a persisted self label', async () => {
    const view = renderWithQueryClient(
      <SendCryptoModal
        visible
        onClose={vi.fn()}
        recipientAddress="EXO_CHAT_PEER"
        recipientName="manuel"
        paymentRequest={{
          v: 2,
          type: 'crypto_payment_request',
          requestId: 'request-1',
          requesterName: 'You',
          network: 'mozaga',
          symbol: 'EXO',
          amount: '0.1',
          decimals: 18,
          recipientAddress: 'EXO_RECIPIENT',
          assetType: 'native',
          createdAt: 1,
          state: 'open',
        }}
      />,
    )
    await flushEffects()

    expect(view.getByText('Confirm Payment')).toBeTruthy()
    expect(view.getByText('manuel')).toBeTruthy()
    expect(() => view.getByText('You')).toThrow()
  })

  it('closes payment request sends after the transaction is broadcast', async () => {
    const onClose = vi.fn()
    const onTransactionSent = vi.fn()
    const view = renderWithQueryClient(
      <SendCryptoModal
        visible
        onClose={onClose}
        recipientAddress="EXO_CHAT_PEER"
        recipientName="manuel"
        paymentRequest={{
          v: 2,
          type: 'crypto_payment_request',
          requestId: 'request-1',
          requesterName: 'manuel',
          network: 'mozaga',
          symbol: 'EXO',
          amount: '0.1',
          decimals: 18,
          recipientAddress: 'EXO_RECIPIENT',
          assetType: 'native',
          createdAt: 1,
          state: 'open',
        }}
        onTransactionSent={onTransactionSent}
      />,
    )
    await flushEffects()

    await fireEvent.press(findPressableByText(view.root, 'Confirm & Send'))
    await flushEffects()

    expect(onTransactionSent).toHaveBeenCalledWith('EXO', '0.1', '0xabc', 'mozaga', 'pending')
    expect(onClose).toHaveBeenCalled()
  })

  it('prevents review when amount exceeds available balance plus network fee', async () => {
    const view = renderWithQueryClient(
      <SendCryptoModal
        visible
        onClose={vi.fn()}
        recipientAddress="EXO_RECIPIENT"
      />,
    )
    await flushEffects()

    await fireEvent.press(findPressableByText(view.root, 'EXO'))
    await fireEvent.changeText(view.root.findByType('TextInput' as any), '2')

    expect(view.getByText('Insufficient balance')).toBeTruthy()
    expect(view.getByText('Insufficient balance for amount, contribution, and network fees.')).toBeTruthy()

    await fireEvent.press(findPressableByText(view.root, 'Review Transaction'))

    expect(view.getByText('Enter Amount')).toBeTruthy()
  })

  it('validates the Mozaga recipient again before signing', async () => {
    mockState.crypto.isValidExoAddress.mockReturnValue(false)
    const view = renderWithQueryClient(
      <SendCryptoModal
        visible
        onClose={vi.fn()}
        recipientAddress="BAD_RECIPIENT"
      />,
    )
    await flushEffects()

    await fireEvent.press(findPressableByText(view.root, 'EXO'))
    await fireEvent.changeText(view.root.findByType('TextInput' as any), '0.1')
    mockState.crypto.isValidExoAddress.mockReturnValue(false)
    await fireEvent.press(findPressableByText(view.root, 'Review Transaction'))
    await fireEvent.press(findPressableByText(view.root, 'Confirm & Send'))

    expect(mockState.crypto.sendEXOTransfer).not.toHaveBeenCalled()
    expect(view.getByText('Transaction Failed')).toBeTruthy()
    expect(view.getByText('Invalid Mozaga recipient address')).toBeTruthy()
  })

  it('syncs shared wallet balances after a successful chat send', async () => {
    const onTransactionSent = vi.fn()
    const view = renderWithQueryClient(
      <SendCryptoModal
        visible
        onClose={vi.fn()}
        recipientAddress="EXO_RECIPIENT"
        onTransactionSent={onTransactionSent}
      />,
    )
    await flushEffects()

    await fireEvent.press(findPressableByText(view.root, 'EXO'))
    await fireEvent.changeText(view.root.findByType('TextInput' as any), '0.1')
    await fireEvent.press(findPressableByText(view.root, 'Review Transaction'))
    await fireEvent.press(findPressableByText(view.root, 'Confirm & Send'))

    await flushEffects()

    expect(onTransactionSent).toHaveBeenCalledWith('EXO', '0.1', '0xabc', 'mozaga', 'pending')
    expect(mockState.crypto.sendEXOTransfer).toHaveBeenCalledTimes(2)
    expect(mockState.crypto.recordPendingCryptoTransaction).toHaveBeenCalledWith(expect.objectContaining({
      network: 'mozaga',
      txHash: '0xabc',
      amount: '0.1',
      symbol: 'EXO',
      assetType: 'native',
    }))
    expect(mockState.crypto.recordPendingCryptoTransaction).toHaveBeenCalledWith(expect.objectContaining({
      network: 'mozaga',
      txHash: '0xcontribution',
      to: 'EXO_TREASURY',
      amount: '0.0001',
      symbol: 'EXO',
      assetType: 'native',
    }))
    expect(mockState.portfolioBalances.invalidateCryptoPortfolio).toHaveBeenCalledWith(
      expect.any(QueryClient),
      mockState.wallet.wallet,
    )
    expect(mockState.portfolioBalances.refetchCryptoPortfolio).toHaveBeenCalledWith(
      expect.any(QueryClient),
      mockState.wallet.wallet,
    )
    expect(mockState.portfolioBalances.loadMozagaPortfolioData).toHaveBeenCalledTimes(2)
  })

  it('renders broadcast chat sends as sent while emitting a pending receipt', async () => {
    mockState.crypto.waitForTransaction.mockResolvedValueOnce({ status: 'pending' })
    const onTransactionSent = vi.fn()
    const view = renderWithQueryClient(
      <SendCryptoModal
        visible
        onClose={vi.fn()}
        recipientAddress="EXO_RECIPIENT"
        onTransactionSent={onTransactionSent}
      />,
    )
    await flushEffects()

    await fireEvent.press(findPressableByText(view.root, 'EXO'))
    await fireEvent.changeText(view.root.findByType('TextInput' as any), '0.1')
    await fireEvent.press(findPressableByText(view.root, 'Review Transaction'))
    await fireEvent.press(findPressableByText(view.root, 'Confirm & Send'))

    await flushEffects()

    expect(onTransactionSent).toHaveBeenCalledWith('EXO', '0.1', '0xabc', 'mozaga', 'pending')
    expect(view.getAllByText('Transaction Sent').length).toBeGreaterThan(0)
    expect(() => view.getByText('Sent Successfully!')).toThrow()
  })

  it('does not wait for on-chain failure after broadcasting', async () => {
    mockState.crypto.waitForTransaction.mockResolvedValueOnce({ status: 'failed' })
    const onTransactionSent = vi.fn()
    const view = renderWithQueryClient(
      <SendCryptoModal
        visible
        onClose={vi.fn()}
        recipientAddress="EXO_RECIPIENT"
        onTransactionSent={onTransactionSent}
      />,
    )
    await flushEffects()

    await fireEvent.press(findPressableByText(view.root, 'EXO'))
    await fireEvent.changeText(view.root.findByType('TextInput' as any), '0.1')
    await fireEvent.press(findPressableByText(view.root, 'Review Transaction'))
    await fireEvent.press(findPressableByText(view.root, 'Confirm & Send'))

    await flushEffects()

    expect(onTransactionSent).toHaveBeenCalledWith('EXO', '0.1', '0xabc', 'mozaga', 'pending')
    expect(view.getAllByText('Transaction Sent').length).toBeGreaterThan(0)
    expect(() => view.getByText('Transaction Failed')).toThrow()
  })
})
