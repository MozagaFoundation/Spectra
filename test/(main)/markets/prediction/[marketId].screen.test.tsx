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
  params: {
    marketId: '0xabc',
  },
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
  wallet: {
    address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    privateKey: 'private',
    publicKey: 'public',
  },
  placeOrder: vi.fn(async () => ({ txHash: '0xtx' })),
}))

vi.mock('react-native', async () => await import('../../../../test/react-native'))

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockState.params,
  useRouter: () => mockState.router,
}))

vi.mock('@react-navigation/native', async () => {
  const ReactActual = await import('react')
  return {
    useFocusEffect: (callback: () => void) => {
      ReactActual.useEffect(() => {
        callback()
      }, [callback])
    },
  }
})

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../../test/mainAppMocks')
  return {
    BarChart3: TestIcon,
    ChevronDown: TestIcon,
    ChevronLeft: TestIcon,
    ChevronUp: TestIcon,
    Clock: TestIcon,
    Gift: TestIcon,
    ShoppingCart: TestIcon,
    Tag: TestIcon,
    User: TestIcon,
  }
})

vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../../../test/mainAppMocks')
  return { useThemeColors: () => testColors }
})

vi.mock('@/lib/i18n', async () => {
  const { translateForTest } = await import('../../../../test/mainAppMocks')
  return {
    getCurrentLocaleTag: () => 'en-US',
    translate: translateForTest,
  }
})

vi.mock('@/store', () => ({
  toast: mockState.toast,
  useWalletStore: () => ({ wallet: mockState.wallet }),
}))

vi.mock('@/services/crypto', () => ({
  waitForTransaction: vi.fn(async () => ({ status: 'confirmed' })),
}))

vi.mock('@/services/crypto/predictionService', () => ({
  PRICE_PRECISION: 10000,
  PredictionMarketStatus: { Active: 1, Resolved: 2 },
  PredictionOrderType: { Buy: 0, Sell: 1 },
  getAllPositions: vi.fn(async () => []),
  getMarketStatusName: () => 'Active',
  getPredictionMarket: vi.fn(async () => ({
    category: 'politics',
    closingTime: Math.floor(Date.now() / 1000) + 86400,
    creator: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    description: 'Audited market',
    marketId: '0xabc',
    outcomeLabels: ['Yes', 'No'],
    outcomePrices: [5000, 5000],
    question: 'Will auditors approve?',
    resolvedOutcome: 0,
    status: 1,
    totalVolume: '1000000000000000000',
  })),
  getPredictionOrderBook: vi.fn(async () => ({
    asks: [],
    bestAsk: 0,
    bestBid: 0,
    bids: [],
    spread: 0,
  })),
  placeOrder: mockState.placeOrder,
  priceToPercent: (price: number) => price / 100,
  redeemWinnings: vi.fn(async () => ({ txHash: '0xtx' })),
}))

const { act, fireEvent, render } = await import('@testing-library/react-native')
const { default: MarketDetailScreen } = await import('../../../../app/(main)/markets/prediction/[marketId]')

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

describe('Prediction MarketDetailScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.params.marketId = '0xabc'
  })

  it('rejects malformed price input before placing an order', async () => {
    const view = render(<MarketDetailScreen />)
    await act(async () => {})

    const tradeToggle = view.root.findAll((node) => (
      String(node.type) === 'Pressable' && nodeText(node).includes('Trade')
    ))[0]
    await fireEvent.press(tradeToggle)
    await fireEvent.changeText(view.root.findByProps({ placeholder: 'e.g. 5000' }), '50abc')
    await fireEvent.changeText(view.root.findByProps({ placeholder: '0.0' }), '1')

    const buyButton = view.root.findAll((node) => (
      String(node.type) === 'Pressable' && nodeText(node).includes('Buy Yes')
    ))[0]
    await fireEvent.press(buyButton)

    expect(mockState.toast.error).toHaveBeenCalledWith('Invalid price', 'Price must be between 0 and 100%')
    expect(mockState.placeOrder).not.toHaveBeenCalled()
  })
})
