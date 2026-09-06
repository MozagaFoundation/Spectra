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
  wallet: null as null | {
    address: string
    privateKey: string
    publicKey: string
  },
  createCampaign: vi.fn(async () => ({ txHash: '0xtx' })),
}))

vi.mock('react-native', async () => await import('../../../../test/react-native'))

vi.mock('react-native-keyboard-controller', async () => {
  const { View } = await import('../../../../test/react-native')
  return { KeyboardAvoidingView: View }
})

vi.mock('expo-router', () => ({
  useRouter: () => mockState.router,
}))

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

vi.mock('lucide-react-native', async () => {
  const { TestIcon } = await import('../../../../test/mainAppMocks')
  return {
    ChevronLeft: TestIcon,
    Info: TestIcon,
  }
})

vi.mock('@/lib/theme', async () => {
  const { testColors } = await import('../../../../test/mainAppMocks')
  return { useThemeColors: () => testColors }
})

vi.mock('@/lib/i18n', async () => {
  const { translateForTest } = await import('../../../../test/mainAppMocks')
  return { translate: translateForTest }
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
  createCampaign: mockState.createCampaign,
  validateCampaignParams: (title: string, fundingGoal: bigint) => (
    title && fundingGoal > 0n
      ? { valid: true }
      : { valid: false, error: 'invalid' }
  ),
}))

vi.mock('@/services/crypto/contractHashes', () => ({
  hashTextToEntityId: () => `0x${'2'.repeat(64)}`,
}))

const ReactNative = await import('react-native')
const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: CreateCampaign } = await import('../../../../app/(main)/markets/campaigns/create')

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

describe('CreateCampaign', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.wallet = null
  })

  it('shows a no-wallet state for campaign creation', () => {
    render(<CreateCampaign />)

    expect(screen.getByText('Connect wallet to create a campaign')).toBeTruthy()
  })

  it('rejects malformed market IDs before campaign creation', async () => {
    const alertSpy = vi.spyOn(ReactNative.Alert, 'alert')
    mockState.wallet = {
      address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      privateKey: 'private',
      publicKey: 'public',
    }

    const view = render(<CreateCampaign />)
    await fireEvent.changeText(view.root.findByProps({ placeholder: 'Enter market ID...' }), 'bad/market')
    await fireEvent.changeText(view.root.findByProps({ placeholder: 'Campaign title...' }), 'Audited')
    await fireEvent.changeText(view.root.findAllByProps({ placeholder: '0.0' })[0], '10')

    const buttons = view.root.findAll((node) => (
      String(node.type) === 'Pressable' && nodeText(node) === 'Create Campaign'
    ))
    await fireEvent.press(buttons[buttons.length - 1])

    expect(alertSpy).toHaveBeenCalledWith('Invalid', 'Enter a valid market ID')
    expect(mockState.createCampaign).not.toHaveBeenCalled()
  })
})
