/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  cleanup: null as null | (() => void),
  clipboard: {
    setStringAsync: vi.fn(async () => {}),
  },
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  },
  params: {
    network: undefined as string | undefined,
  },
  portfolioBalances: {
    cryptoPortfolioWalletKey: vi.fn((wallet: { address?: string; ethereumAddress?: string } | null) => (
      wallet ? `${wallet.address || ''}|${wallet.ethereumAddress || ''}` : 'no-wallet'
    )),
    loadEthereumPortfolioData: vi.fn(async () => ({ balance: '0', tokens: [] })),
    loadExternalPortfolioData: vi.fn(async () => ({ balances: {}, tokens: {} })),
    loadMozagaPortfolioData: vi.fn(async () => ({ balance: '42', assets: [] })),
  },
  wallet: {
    wallet: null as null | { address: string; ethereumAddress?: string; spectreMode?: boolean },
  },
  spectre: {
    enabled: false,
    spectreAccountMode: null as null | 'mnemonic' | 'persistent_generated' | 'expendable',
  },
  walletIndexNotifications: {
    countsByChain: {} as Record<string, number>,
    markChainRead: vi.fn(async () => {}),
  },
  walletIndexActivation: {
    activateWalletIndex: vi.fn(async () => undefined),
  },
  contributionNotice: {
    seen: true,
    hasWalletContributionNotice: vi.fn(async () => mockState.contributionNotice.seen),
    acknowledgeWalletContributionNotice: vi.fn(async () => {
      mockState.contributionNotice.seen = true
    }),
  },
  history: {
    errorsByChain: {} as Record<string, string>,
    statusByChain: {} as Record<string, {
      is_registered: boolean
      is_sync_complete?: boolean
      latest_run_error: string | null
      latest_run_status: string | null
    }>,
    statusError: null as string | null,
    isLoadingStatus: false,
  },
}))

vi.mock('react-native', async () => await import('../../../test/react-native'))

vi.mock('@react-navigation/native', async () => {
  const ReactActual = await import('react')
  return {
    useIsFocused: () => true,
    useFocusEffect: (callback: () => void | (() => void)) => {
      ReactActual.useEffect(() => {
        mockState.cleanup = callback() || null
        return () => {
          mockState.cleanup?.()
          mockState.cleanup = null
        }
      }, [callback])
    },
  }
})

vi.mock('react-i18next', async () => {
  const { translateForTest } = await import('../../../test/mainAppMocks')
  return { useTranslation: () => ({ t: translateForTest }) }
})

vi.mock('react-native-safe-area-context', async () => {
  const { View } = await import('../../../test/react-native')
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }
})

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../test/mainAppMocks')
  return {
    Activity: TestIcon,
    ArrowDownLeft: TestIcon,
    ArrowUpRight: TestIcon,
    Bell: TestIcon,
    CircleDollarSign: TestIcon,
    Check: TestIcon,
    ChevronDown: TestIcon,
    ChevronLeft: TestIcon,
    ChevronRight: TestIcon,
    Clock: TestIcon,
    Copy: TestIcon,
    Droplets: TestIcon,
    ExternalLink: TestIcon,
    Globe: TestIcon,
    Layers: TestIcon,
    RefreshCw: TestIcon,
    Shield: TestIcon,
    Sparkles: TestIcon,
    X: TestIcon,
  }
})

vi.mock('expo-clipboard', () => mockState.clipboard)

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
}))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
}))

vi.mock('@/lib/i18n', async () => {
  const { translateForTest } = await import('../../../test/mainAppMocks')
  return { translate: translateForTest }
})

vi.mock('@/lib/cryptoTheme', async () => {
  const { testColors } = await import('../../../test/mainAppMocks')
  return {
    useCryptoTheme: () => ({
      accent: () => testColors.primary,
      alpha: (value: string) => value,
      assetClassAccent: () => testColors.primary,
      colors: testColors,
      resolveExternalAccent: () => testColors.primary,
    }),
  }
})

vi.mock('@/lib/cryptoIcons', () => ({
  CRYPTO_NETWORK_ICONS: {},
}))

vi.mock('@/lib/tokenIcons', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../../test/react-native')
  return {
    TokenLogo: ({ symbol }: { symbol: string }) => ReactActual.createElement(Text, null, symbol),
    USDT_TOKEN_COLOR: '#009393',
    isUsdtToken: (symbol?: string | null, name?: string | null) => (
      symbol?.trim().toUpperCase() === 'USDT' || name?.trim().toLowerCase() === 'tether usd'
    ),
  }
})

vi.mock('@/lib/constants', () => ({
  BITCOIN_EXPLORER_URL: 'https://btc.example',
  BITCOIN_RPC_URL: '',
  EXPLORER_URL: 'https://scan.mozaga.org',
  ETH_EXPLORER_URL: 'https://etherscan.io',
  ETH_RPC_URL: null,
  SOLANA_EXPLORER_URL: 'https://solana.example',
  SOLANA_RPC_URL: '',
  TRON_EXPLORER_URL: 'https://tron.example',
  TRON_RPC_URL: '',
}))

vi.mock('@/store', () => ({
  useUIStore: (selector: (state: { preferredFiatCurrency: string; setPreferredFiatCurrency: (code: string) => void }) => unknown) => selector({
    preferredFiatCurrency: 'USD',
    setPreferredFiatCurrency: vi.fn(),
  }),
  useWalletStore: () => mockState.wallet,
}))

vi.mock('@/store/uiStore', () => ({
  useUIStore: (selector: (state: { preferredFiatCurrency: string; setPreferredFiatCurrency: (code: string) => void }) => unknown) => selector({
    preferredFiatCurrency: 'USD',
    setPreferredFiatCurrency: vi.fn(),
  }),
}))

vi.mock('@/store/walletStore', () => ({
  useWalletStore: (selector: (state: typeof mockState.wallet) => unknown) => selector(mockState.wallet),
}))

vi.mock('@/store/spectreStore', () => ({
  useSpectreStore: (selector: (state: typeof mockState.spectre) => unknown) => selector(mockState.spectre),
}))

vi.mock('@/store/walletTransferNotificationStore', () => ({
  useWalletTransferNotificationStore: (
    selector: (state: typeof mockState.walletIndexNotifications) => unknown,
  ) => selector(mockState.walletIndexNotifications),
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: { isCloudAuthVerified: boolean; session: { accessToken: string } }) => unknown) => selector({
    isCloudAuthVerified: true,
    session: { accessToken: 'test-token' },
  }),
}))

vi.mock('@/services/notifications/badgeSync', () => ({
  syncGlobalBadge: vi.fn(async () => {}),
}))

vi.mock('@/services/wallet/walletIndexActivation', () => mockState.walletIndexActivation)

vi.mock('@/services/crypto/portfolioBalances', () => ({
  DEFAULT_ETH_PORTFOLIO_DATA: { balance: '0.0', tokens: [] },
  DEFAULT_EXTERNAL_PORTFOLIO_DATA: { balances: {}, tokens: {} },
  DEFAULT_MOZAGA_PORTFOLIO_DATA: { balance: '0.0', assets: [] },
  cryptoPortfolioWalletKey: mockState.portfolioBalances.cryptoPortfolioWalletKey,
  loadEthereumPortfolioData: mockState.portfolioBalances.loadEthereumPortfolioData,
  loadExternalPortfolioData: mockState.portfolioBalances.loadExternalPortfolioData,
  loadMozagaPortfolioData: mockState.portfolioBalances.loadMozagaPortfolioData,
}))

vi.mock('@/services/crypto', () => ({
  CRYPTO_NETWORK_BY_ID: {
    ethereum: { accentName: 'ethereum', id: 'ethereum', name: 'Ethereum', nativeSymbol: 'ETH', shortName: 'Ethereum' },
    mozaga: { accentName: 'mozaga', id: 'mozaga', name: 'Mozaga', nativeSymbol: 'EXO', shortName: 'Mozaga' },
  },
  formatEthAddress: (value: string) => value,
  getAllSolanaTokenBalances: vi.fn(async () => []),
  getAllTokenBalances: vi.fn(async () => []),
  getAllTronTokenBalances: vi.fn(async () => []),
  getAvailableNetworks: (wallet?: { address: string; ethereumAddress?: string } | null) => [
    { accentName: 'mozaga', id: 'mozaga', name: 'Mozaga', nativeSymbol: 'EXO', shortName: 'Mozaga' },
    ...(wallet?.ethereumAddress
      ? [{ accentName: 'ethereum', id: 'ethereum', name: 'Ethereum', nativeSymbol: 'ETH', shortName: 'Ethereum' }]
      : []),
  ],
  getAssetClassName: () => 'Asset',
  getBalance: vi.fn(async () => '42'),
  getBitcoinExplorerAddressUrl: (address: string) => `https://btc.example/address/${address}`,
  getBitcoinExplorerTxUrl: (hash: string) => `https://btc.example/tx/${hash}`,
  getEthBalance: vi.fn(async () => '0'),
  getEthExplorerAddressUrl: (address: string) => `https://etherscan.io/address/${address}`,
  getEthExplorerTxUrl: (hash: string) => `https://etherscan.io/tx/${hash}`,
  getMozagaExplorerAddressUrl: (address: string) => `https://scan.mozaga.org/address/${address}`,
  getMozagaExplorerTxUrl: (hash: string) => `https://scan.mozaga.org/tx/${hash}`,
  getNativeBalanceForNetwork: vi.fn(async () => '42'),
  getSolanaExplorerAddressUrl: (address: string) => `https://solana.example/address/${address}`,
  getSolanaExplorerTxUrl: (hash: string) => `https://solana.example/tx/${hash}`,
  getTronExplorerAddressUrl: (address: string) => `https://tron.example/address/${address}`,
  getTronExplorerTxUrl: (hash: string) => `https://tron.example/tx/${hash}`,
  getUserAssets: vi.fn(async () => []),
  getWalletAddressForNetwork: (wallet: { address: string; ethereumAddress?: string }, network: string) => (
    network === 'mozaga' ? wallet.address : network === 'ethereum' ? wallet.ethereumAddress : undefined
  ),
}))

vi.mock('@/services/crypto/ethereumService', () => ({
  formatEthAddress: (value: string) => value,
}))

vi.mock('@/services/crypto/mozagaBlockchain', () => ({
  getAssetClassName: () => 'Asset',
}))

vi.mock('@/services/crypto/transactionHistory', () => ({
  getBitcoinExplorerAddressUrl: (address: string) => `https://btc.example/address/${address}`,
  getBitcoinExplorerTxUrl: (hash: string) => `https://btc.example/tx/${hash}`,
  getEthExplorerAddressUrl: (address: string) => `https://etherscan.io/address/${address}`,
  getEthExplorerTxUrl: (hash: string) => `https://etherscan.io/tx/${hash}`,
  getMozagaExplorerAddressUrl: (address: string) => `https://scan.mozaga.org/address/${address}`,
  getMozagaExplorerTxUrl: (hash: string) => `https://scan.mozaga.org/tx/${hash}`,
  getSolanaExplorerAddressUrl: (address: string) => `https://solana.example/address/${address}`,
  getSolanaExplorerTxUrl: (hash: string) => `https://solana.example/tx/${hash}`,
  getTronExplorerAddressUrl: (address: string) => `https://tron.example/address/${address}`,
  getTronExplorerTxUrl: (hash: string) => `https://tron.example/tx/${hash}`,
}))

vi.mock('@/services/crypto/chainRegistry', () => ({
  CRYPTO_NETWORK_BY_ID: {
    ethereum: { accentName: 'ethereum', id: 'ethereum', name: 'Ethereum', nativeSymbol: 'ETH', shortName: 'Ethereum' },
    mozaga: { accentName: 'mozaga', id: 'mozaga', name: 'Mozaga', nativeSymbol: 'EXO', shortName: 'Mozaga' },
  },
  getWalletAddressForNetwork: (
    wallet: { address: string; ethereumAddress?: string },
    network: string,
  ) => (
    network === 'mozaga'
      ? wallet.address
      : network === 'ethereum'
        ? wallet.ethereumAddress
        : undefined
  ),
}))

vi.mock('@/hooks/useCryptoPortfolio', async () => {
  const ReactActual = await import('react')
  return {
    useCryptoPortfolio: (wallet: { address: string; ethereumAddress?: string } | null) => {
      ReactActual.useEffect(() => {
        if (!wallet?.address) return
        void mockState.portfolioBalances.loadMozagaPortfolioData()
        if (wallet.ethereumAddress) void mockState.portfolioBalances.loadEthereumPortfolioData()
      }, [wallet?.address, wallet?.ethereumAddress])

      const availableNetworks = wallet
        ? [
            { accentName: 'mozaga', id: 'mozaga', name: 'Mozaga', nativeSymbol: 'EXO', shortName: 'Mozaga' },
            ...(wallet.ethereumAddress
              ? [{ accentName: 'ethereum', id: 'ethereum', name: 'Ethereum', nativeSymbol: 'ETH', shortName: 'Ethereum' }]
              : []),
          ]
        : []

      return {
        availableNetworks,
        balance: wallet?.address ? '42' : '0',
        ethBalance: wallet?.ethereumAddress ? '0' : '0',
        tokens: [],
        networkBalances: {},
        networkTokens: {},
        nativeAssets: [],
        portfolioRows: availableNetworks.map((network) => ({
          id: network.id,
          name: network.name,
          shortName: network.shortName,
          nativeSymbol: network.nativeSymbol,
          balance: network.id === 'mozaga' ? '42' : '0',
          tokenCount: 0,
          recentTxCount: 0,
        })),
        recentActivity: [],
        mozagaTxs: [],
        ethTxs: [],
        networkTxs: {},
        historyErrorsByChain: mockState.history.errorsByChain,
        historyStatusByChain: mockState.history.statusByChain,
        historyStatusError: mockState.history.statusError,
        isLoading: false,
        isLoadingEth: false,
        isLoadingExternalBalances: false,
        isLoadingExternalTokens: false,
        isLoadingAssets: false,
        isLoadingTxs: false,
        isLoadingHistoryStatus: mockState.history.isLoadingStatus,
        isRefreshing: false,
        isFetchingTxs: false,
        refreshAll: vi.fn(async () => {}),
      }
    },
  }
})

vi.mock('@/hooks/useMarketPrices', () => ({
  useMarketPrices: () => ({ data: null }),
}))

vi.mock('@/services/crypto/walletContributionNotice', () => ({
  hasWalletContributionNotice: () => mockState.contributionNotice.hasWalletContributionNotice(),
  acknowledgeWalletContributionNotice: () => mockState.contributionNotice.acknowledgeWalletContributionNotice(),
}))

vi.mock('@/components/wallet/WalletContributionNoticeModal', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../../test/react-native')
  return {
    WalletContributionNoticeModal: ({ visible }: { visible: boolean }) => (
      visible ? ReactActual.createElement(Text, null, 'Wallet contribution notice') : null
    ),
  }
})

const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: CryptoScreen } = await import('../../../app/(main)/(tabs)/crypto')
const portfolioBalances = await import('@/services/crypto/portfolioBalances')

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

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
    </QueryClientProvider>
  )
}

describe('CryptoScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.cleanup = null
    mockState.params.network = undefined
    mockState.portfolioBalances.loadMozagaPortfolioData.mockResolvedValue({ balance: '42', assets: [] })
    mockState.portfolioBalances.loadEthereumPortfolioData.mockResolvedValue({ balance: '0', tokens: [] })
    mockState.portfolioBalances.loadExternalPortfolioData.mockResolvedValue({ balances: {}, tokens: {} })
    mockState.wallet.wallet = null
    mockState.spectre.enabled = false
    mockState.spectre.spectreAccountMode = null
    mockState.history.errorsByChain = {}
    mockState.history.statusByChain = {}
    mockState.history.statusError = null
    mockState.history.isLoadingStatus = false
    mockState.walletIndexActivation.activateWalletIndex.mockClear()
    mockState.contributionNotice.seen = true
    mockState.contributionNotice.hasWalletContributionNotice.mockClear()
    mockState.contributionNotice.acknowledgeWalletContributionNotice.mockClear()
  })

  it('renders a no-wallet state without starting wallet work', () => {
    renderWithQueryClient(<CryptoScreen />)

    expect(screen.getAllByText('No wallet found').length).toBeGreaterThan(0)
    expect(portfolioBalances.loadMozagaPortfolioData).not.toHaveBeenCalled()
  })

  it('copies the selected wallet address after loading cached portfolio data', async () => {
    mockState.params.network = 'mozaga'
    mockState.wallet.wallet = { address: 'EXO0011111111111111111111111111111111111111' }

    const view = renderWithQueryClient(<CryptoScreen />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(portfolioBalances.loadMozagaPortfolioData).toHaveBeenCalledTimes(1)

    const addressButton = view.root.findAll((node) => (
      String(node.type) === 'Pressable' && nodeText(node).includes('EXO00111')
    ))[0]

    await fireEvent.press(addressButton)

    expect(mockState.clipboard.setStringAsync).toHaveBeenCalledWith('EXO0011111111111111111111111111111111111111')
  })

  it('shows an overview first and opens a selected cryptocurrency page', async () => {
    mockState.wallet.wallet = {
      address: 'EXO0011111111111111111111111111111111111111',
      ethereumAddress: '0xabc123',
    }

    const view = renderWithQueryClient(<CryptoScreen />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Select a cryptocurrency')).toBeTruthy()
    const ethereumRow = view.root.findAll((node) => (
      String(node.type) === 'Pressable' && nodeText(node).includes('Ethereum')
    ))[0]

    await fireEvent.press(ethereumRow)

    expect(screen.getByText('Ethereum Wallet')).toBeTruthy()
    expect(screen.getByText('0xabc123')).toBeTruthy()
  })

  it('activates an individual blockchain only after its button is pressed', async () => {
    const wallet = {
      address: 'EXO0011111111111111111111111111111111111111',
      ethereumAddress: '0xabc123',
    }
    mockState.wallet.wallet = wallet

    const view = renderWithQueryClient(<CryptoScreen />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const activateButton = view.root.findAll((node) => (
      node.props.accessibilityRole === 'button' &&
      nodeText(node).includes('Activate')
    ))[0]
    await fireEvent.press(activateButton)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockState.walletIndexActivation.activateWalletIndex).toHaveBeenCalledWith(wallet, 'mozaga')
  })

  it('selects the wallet network requested by route params', async () => {
    mockState.params.network = 'ethereum'
    mockState.wallet.wallet = {
      address: 'EXO0011111111111111111111111111111111111111',
      ethereumAddress: '0xabc123',
    }

    renderWithQueryClient(<CryptoScreen />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Ethereum Wallet')).toBeTruthy()
    expect(screen.getByText('0xabc123')).toBeTruthy()
  })

  it('shows the private index sync state for an empty Mozaga history', async () => {
    mockState.params.network = 'mozaga'
    mockState.wallet.wallet = { address: 'EXO0011111111111111111111111111111111111111' }
    mockState.history.statusByChain = {
      mozaga: {
        is_registered: true,
        latest_run_error: null,
        latest_run_status: 'running',
      },
    }

    renderWithQueryClient(<CryptoScreen />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Transaction history is syncing')).toBeTruthy()
  })

  it('keeps Mozaga history syncing while the Explorer replays', async () => {
    mockState.params.network = 'mozaga'
    mockState.wallet.wallet = { address: 'EXO0011111111111111111111111111111111111111' }
    mockState.history.statusByChain = {
      mozaga: {
        is_registered: true,
        is_sync_complete: false,
        latest_run_error: null,
        latest_run_status: 'completed',
      },
    }

    renderWithQueryClient(<CryptoScreen />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Transaction history is syncing')).toBeTruthy()
  })

  it('does not allow the Mozaga Markets action to be pressed', async () => {
    mockState.params.network = 'mozaga'
    mockState.wallet.wallet = { address: 'EXO0011111111111111111111111111111111111111' }

    const view = renderWithQueryClient(<CryptoScreen />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const marketsButton = view.root.findAll((node) => (
      String(node.type) === 'Pressable' && nodeText(node).includes('Markets')
    ))[0]

    expect(marketsButton.props.disabled).toBe(true)
    await fireEvent.press(marketsButton)

    expect(mockState.router.push).not.toHaveBeenCalledWith('/(main)/markets')
  })

  it('does not load crypto data while Spectre Mode is active', async () => {
    mockState.spectre.enabled = true
    mockState.spectre.spectreAccountMode = 'persistent_generated'
    mockState.wallet.wallet = {
      address: 'EXO00spectrespectrespectrespectrespectre0000',
      spectreMode: true,
    }

    renderWithQueryClient(<CryptoScreen />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(portfolioBalances.loadMozagaPortfolioData).not.toHaveBeenCalled()
    expect(screen.getByText('Crypto features are unavailable while Spectre Mode is active.')).toBeTruthy()
  })

  it('shows the contribution notice the first time Wallets is opened', async () => {
    mockState.contributionNotice.seen = false
    mockState.wallet.wallet = {
      address: 'EXO0011111111111111111111111111111111111111',
      ethereumAddress: '0xabc123',
    }

    renderWithQueryClient(<CryptoScreen />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Wallet contribution notice')).toBeTruthy()
  })

  it('does not show the contribution notice after it has been acknowledged', async () => {
    mockState.wallet.wallet = {
      address: 'EXO0011111111111111111111111111111111111111',
      ethereumAddress: '0xabc123',
    }

    renderWithQueryClient(<CryptoScreen />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(() => screen.getByText('Wallet contribution notice')).toThrow()
  })
})

