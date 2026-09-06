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

vi.mock('react-native', async () => await import('../../../../test/react-native'))

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
    ArrowLeft: TestIcon,
    ChevronRight: TestIcon,
    Rocket: TestIcon,
    Search: TestIcon,
    TrendingUp: TestIcon,
  }
})

vi.mock('@/hooks/useGuardedRouter', () => ({
  useGuardedRouter: () => mockState.router,
}))

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

vi.mock('@/services/crypto/marketService', () => ({
  getActiveMarkets: vi.fn(async () => ({
    markets: [{
      active: true,
      createdAt: 1,
      description: 'Listed sale',
      enrolledAssets: 1,
      freeEnrollment: true,
      marketId: '0xabc',
      name: 'Primary Alpha',
      submarketCount: 1,
    }],
    totalCount: 1,
  })),
  getMarketStats: vi.fn(async () => ({
    activeMarkets: 1,
    totalSales: 1,
  })),
}))

const ReactNative = await import('react-native')
const { act, fireEvent, render } = await import('@testing-library/react-native')
const { default: PrimaryMarketScreen } = await import('../../../../app/(main)/markets/primary/index')

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

describe('PrimaryMarketScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects malformed sale lookup IDs and routes valid IDs as params', async () => {
    const alertSpy = vi.spyOn(ReactNative.Alert, 'alert')
    const view = render(<PrimaryMarketScreen />)
    await act(async () => {})

    const saleInput = view.root.findByProps({ placeholder: 'Enter sale ID...' })
    const viewButton = view.root.findAll((node) => (
      String(node.type) === 'Pressable' && nodeText(node) === 'View'
    ))[0]

    await fireEvent.changeText(saleInput, 'bad/sale')
    await fireEvent.press(viewButton)
    expect(alertSpy).toHaveBeenCalledWith('Invalid', 'Enter a valid sale ID')
    expect(mockState.router.push).not.toHaveBeenCalled()

    await fireEvent.changeText(saleInput, '0xabc')
    await fireEvent.press(viewButton)
    expect(mockState.router.push).toHaveBeenCalledWith({
      pathname: '/(main)/markets/primary/[saleId]',
      params: { saleId: '0xabc' },
    })
  })
})
