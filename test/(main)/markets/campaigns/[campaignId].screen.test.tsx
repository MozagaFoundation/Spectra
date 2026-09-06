/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  params: {
    campaignId: '0xabc',
  },
  router: {
    back: vi.fn(),
  },
  wallet: {
    address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    privateKey: 'private',
    publicKey: 'public',
  },
  contributeToCampaign: vi.fn(async () => ({ txHash: '0xtx' })),
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
    ArrowDownCircle: TestIcon,
    CheckCircle2: TestIcon,
    ChevronLeft: TestIcon,
    Clock: TestIcon,
    Hash: TestIcon,
    Target: TestIcon,
    Users: TestIcon,
    XCircle: TestIcon,
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
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
  useWalletStore: () => ({ wallet: mockState.wallet }),
}))

vi.mock('@/services/crypto', () => ({
  waitForTransaction: vi.fn(async () => ({ status: 'confirmed' })),
}))

vi.mock('@/services/crypto/campaignService', () => ({
  CampaignStatus: { Active: 0, Succeeded: 1, Failed: 2 },
  calculatePercentFunded: () => 10,
  canContribute: vi.fn(async () => ({
    canContribute: false,
    reason: 'Cap reached',
    remainingAllowance: '500000000000000000',
  })),
  canFinalize: vi.fn(async () => ({ canFinalize: false })),
  claimCampaignRefund: vi.fn(async () => ({ txHash: '0xtx' })),
  contributeToCampaign: mockState.contributeToCampaign,
  finalizeCampaign: vi.fn(async () => ({ txHash: '0xtx' })),
  getCampaign: vi.fn(async () => ({
    campaignId: '0xabc',
    contributorCount: 1,
    creator: 'EXO00bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    endTime: Math.floor(Date.now() / 1000) + 86400,
    flexibleGoal: '0',
    fundingGoal: '10000000000000000000',
    raisedAmount: '1000000000000000000',
    startTime: 1,
    status: 0,
    title: 'Audited campaign',
  })),
  getCampaignContributors: vi.fn(async () => []),
  getCampaignStatusColor: () => 'text-blue-500',
  getCampaignStatusName: () => 'Active',
  getTimeRemaining: () => '1d left',
  hasCampaignEnded: () => false,
}))

const ReactNative = await import('react-native')
const { act, fireEvent, render } = await import('@testing-library/react-native')
const { default: CampaignDetail } = await import('../../../../app/(main)/markets/campaigns/[campaignId]')

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

describe('CampaignDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks ineligible contributions before signing', async () => {
    const alertSpy = vi.spyOn(ReactNative.Alert, 'alert')
    const view = render(<CampaignDetail />)
    await act(async () => {})

    await fireEvent.changeText(view.root.findByProps({ placeholder: '0.0' }), '1')
    const sendButton = view.root.findAll((node) => (
      String(node.type) === 'Pressable' && nodeText(node).includes('Send')
    ))[0]
    await fireEvent.press(sendButton)

    expect(alertSpy).toHaveBeenCalledWith('Cannot contribute', 'Cap reached')
    expect(mockState.contributeToCampaign).not.toHaveBeenCalled()
  })
})
