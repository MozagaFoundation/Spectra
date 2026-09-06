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
  createFiatOrder: vi.fn(async () => ({ txHash: '0xtx' })),
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

vi.mock('@/services/crypto/escrowService', () => ({
  calculateOrderFee: (amount: bigint) => amount / 1000n,
  createBuyConditionOrder: vi.fn(async () => ({ txHash: '0xtx' })),
  createBuyFiatOrder: vi.fn(async () => ({ txHash: '0xtx' })),
  createConditionOrder: vi.fn(async () => ({ txHash: '0xtx' })),
  createFiatOrder: mockState.createFiatOrder,
  validateEscrowOrderParams: (amount: bigint, expirationDays: number) => (
    amount > 0n && expirationDays > 0
      ? { valid: true }
      : { valid: false, error: 'invalid' }
  ),
}))

vi.mock('@/services/crypto/contractHashes', () => ({
  hashTextToEntityId: () => `0x${'1'.repeat(64)}`,
}))

const ReactNative = await import('react-native')
const { fireEvent, render, screen } = await import('@testing-library/react-native')
const { default: CreateEscrowOrder } = await import('../../../../app/(main)/markets/escrow/create')

function nodeText(node: any): string {
  return (node.children || []).map((child: any) => (
    typeof child === 'string' ? child : nodeText(child)
  )).join('')
}

describe('CreateEscrowOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockState.wallet = null
  })

  it('shows a no-wallet state for escrow order creation', () => {
    render(<CreateEscrowOrder />)

    expect(screen.getByText('Connect wallet to create an escrow order')).toBeTruthy()
  })

  it('rejects zero fiat prices before creating an order', async () => {
    const alertSpy = vi.spyOn(ReactNative.Alert, 'alert')
    mockState.wallet = {
      address: 'EXO00aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      privateKey: 'private',
      publicKey: 'public',
    }

    const view = render(<CreateEscrowOrder />)
    await fireEvent.changeText(view.root.findByProps({ placeholder: '0.0' }), '1')
    await fireEvent.changeText(view.root.findByProps({ placeholder: '0.00' }), '0')

    const createButton = view.root.findAll((node) => (
      String(node.type) === 'Pressable' && nodeText(node) === 'Create Order'
    )).at(-1)!
    await fireEvent.press(createButton)

    expect(alertSpy).toHaveBeenCalledWith('Invalid', 'Fiat price must be greater than zero')
    expect(mockState.createFiatOrder).not.toHaveBeenCalled()
  })
})
