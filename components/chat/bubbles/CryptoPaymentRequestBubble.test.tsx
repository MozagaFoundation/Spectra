/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('expo-image', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../../test/react-native')
  return {
    Image: ({ source }: { source: unknown }) => (
      ReactActual.createElement(Text, null, `image:${String(source)}`)
    ),
  }
})

vi.mock('lucide-react-native', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../../test/react-native')
  const makeIcon = (name: string) => function Icon() {
    return ReactActual.createElement(Text, null, name)
  }
  return {
    AlertCircle: makeIcon('AlertCircle'),
    CheckCircle2: makeIcon('CheckCircle2'),
    Clock: makeIcon('Clock'),
    WalletCards: makeIcon('WalletCards'),
  }
})

vi.mock('@/lib/cryptoTheme', () => ({
  useCryptoTheme: () => ({
    colors: {
      error: '#ef4444',
      textOnPrimary: '#ffffff',
      warning: '#d9b94a',
    },
    accent: () => '#16a34a',
    alpha: (color: string) => color,
    resolveExternalAccent: () => '#009393',
  }),
}))

vi.mock('@/lib/cryptoIcons', () => ({
  CRYPTO_NETWORK_ICONS: {
    bitcoin: 1,
    ethereum: 2,
    exp: 3,
    mozaga: 4,
    solana: 5,
    tron: 6,
  },
}))

vi.mock('@/lib/tokenIcons', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../../test/react-native')
  return {
    USDT_TOKEN_COLOR: '#009393',
    isUsdtToken: (symbol?: string | null) => symbol?.trim().toUpperCase() === 'USDT',
    TokenLogo: ({ symbol }: { symbol: string }) => ReactActual.createElement(Text, null, `token-logo:${symbol}`),
  }
})

vi.mock('@/lib/i18n', () => ({
  translate: (key: string, params?: Record<string, string>) => (
    Object.entries(params || {}).reduce(
      (value, [param, replacement]) => value.replace(`{{${param}}}`, replacement),
      key,
    )
  ),
}))

vi.mock('@/lib/utils', () => ({
  formatTime: () => '12:00',
}))

const { fireEvent, render } = await import('@testing-library/react-native')
const { CryptoPaymentRequestBubble } = await import('./CryptoPaymentRequestBubble')

const baseRequest = {
  v: 2 as const,
  type: 'crypto_payment_request' as const,
  requestId: 'request-1',
  network: 'ethereum' as const,
  symbol: 'USDT',
  amount: '10',
  decimals: 6,
  recipientAddress: '0xreceiver',
  assetType: 'token' as const,
  createdAt: 1_700_000_000_000,
  state: 'open' as const,
}

describe('CryptoPaymentRequestBubble', () => {
  it('keeps paid inbound payment requests pressable', async () => {
    const onPress = vi.fn()
    const view = render(
      <CryptoPaymentRequestBubble
        request={{
          ...baseRequest,
          state: 'paid',
          settlement: {
            txHash: '0xabc123',
            status: 'confirmed',
            paidAt: 1_700_000_001_000,
          },
        }}
        isOwn={false}
        senderName="Alice"
        timestamp={1_700_000_000_000}
        onPress={onPress}
      />,
    )

    await fireEvent.press(view.root.findByType('Pressable' as any))

    expect(onPress).toHaveBeenCalledOnce()
    expect(view.getByText('Payment submitted')).toBeTruthy()
    expect(() => view.getByText('Pay request')).toThrow()
  })

  it('keeps own paid requests pressable', async () => {
    const onPress = vi.fn()
    const view = render(
      <CryptoPaymentRequestBubble
        request={{
          ...baseRequest,
          state: 'paid',
          settlement: {
            txHash: '0xabc123',
            status: 'confirmed',
            paidAt: 1_700_000_001_000,
          },
        }}
        isOwn
        timestamp={1_700_000_000_000}
        onPress={onPress}
      />,
    )

    const card = view.root.findByType('Pressable' as any)
    await fireEvent.press(card)

    expect(onPress).toHaveBeenCalledOnce()
    expect(card.props.className).toContain('w-full')
  })

  it('truncates long sender names and keeps the timestamp separate', () => {
    const longName = 'A very long public display name for an incoming payment request'
    const view = render(
      <CryptoPaymentRequestBubble
        request={baseRequest}
        isOwn={false}
        senderName={longName}
        timestamp={1_700_000_000_000}
        onPress={vi.fn()}
      />,
    )

    const heading = view.getByText(`${longName} requested`)

    expect(heading.props.numberOfLines).toBe(1)
    expect(heading.props.ellipsizeMode).toBe('tail')
    expect(view.getByText('12:00').props.numberOfLines).toBe(1)
  })
})
