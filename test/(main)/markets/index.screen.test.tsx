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
    push: vi.fn(),
  },
}))

vi.mock('react-native', async () => await import('../../../test/react-native'))

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
  const { TestIcon } = await import('../../../test/mainAppMocks')
  return {
    Activity: TestIcon,
    ChevronLeft: TestIcon,
    ChevronRight: TestIcon,
    Droplets: TestIcon,
    Flame: TestIcon,
    RefreshCw: TestIcon,
    Rocket: TestIcon,
    Shield: TestIcon,
    Sparkles: TestIcon,
    Target: TestIcon,
    TrendingUp: TestIcon,
  }
})

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
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
      colors: testColors,
    }),
  }
})

vi.mock('@/services/crypto/marketService', () => ({
  getActiveMarkets: vi.fn(async () => ({
    markets: [{
      active: true,
      createdAt: 1,
      description: 'Audited market',
      enrolledAssets: 2,
      freeEnrollment: false,
      marketId: '0xabc',
      name: 'Alpha Market',
      submarketCount: 1,
    }],
    totalCount: 1,
  })),
  getMarketStats: vi.fn(async () => ({
    activeMarkets: 1,
    protocolFees: '1000000000000000000',
    totalOrders: 2,
    totalPools: 3,
    totalSales: 4,
  })),
}))

vi.mock('@/services/crypto/campaignService', () => ({
  getActiveCampaigns: vi.fn(async () => [{
    campaignId: '0xdef',
    contributorCount: 5,
    endTime: Math.floor(Date.now() / 1000) + 86400,
    fundingGoal: '2000000000000000000',
    percentFunded: 50,
    raisedAmount: '1000000000000000000',
    title: 'Audit Campaign',
  }]),
}))

vi.mock('@/services/crypto/predictionService', () => ({
  PredictionMarketStatus: { Active: 1 },
  listPredictionMarkets: vi.fn(async () => [{
    closingTime: Math.floor(Date.now() / 1000) + 86400,
    marketId: '0x123',
    outcomeLabels: ['Yes', 'No'],
    outcomePrices: [5000, 5000],
    question: 'Will tests pass?',
    totalVolume: '3000000000000000000',
  }]),
  priceToPercent: (price: number) => price / 100,
}))

const { act, fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: MarketsHubScreen } = await import('../../../app/(main)/markets/index')

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

describe('MarketsHubScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders aggregated market data and routes dynamic IDs safely', async () => {
    const view = render(<MarketsHubScreen />)
    await act(async () => {})

    expect(screen.getByText('Markets')).toBeTruthy()
    expect(screen.getByText('Alpha Market')).toBeTruthy()
    expect(screen.getByText('Audit Campaign')).toBeTruthy()
    expect(screen.getByText('Will tests pass?')).toBeTruthy()

    const marketCard = view.root.findAll((node) => (
      String(node.type) === 'Pressable' && nodeText(node).includes('Alpha Market')
    ))[0]
    await fireEvent.press(marketCard)

    expect(mockState.router.push).toHaveBeenCalledWith({
      pathname: '/(main)/markets/primary/[saleId]',
      params: { saleId: '0xabc' },
    })
  })
})
