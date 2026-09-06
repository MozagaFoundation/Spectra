/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  tokenLogo: vi.fn(),
}))

vi.mock('lucide-react-native', async () => {
  const ReactActual = await import('react')
  const { Text } = await import('../../../test/react-native')
  const makeIcon = (name: string) => function Icon() {
    return ReactActual.createElement(Text, null, name)
  }
  return {
    AlertCircle: makeIcon('AlertCircle'),
    Clock: makeIcon('Clock'),
    Shield: makeIcon('Shield'),
    XCircle: makeIcon('XCircle'),
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@/lib/cryptoTheme', () => ({
  useCryptoTheme: () => ({
    colors: {
      error: '#ef4444',
      textOnPrimary: '#ffffff',
      warning: '#d9b94a',
    },
    accent: () => '#16a34a',
    alpha: (color: string, _opacity: number) => color,
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
    isUsdtToken: (symbol?: string | null, name?: string | null) => (
      symbol?.trim().toUpperCase() === 'USDT' || name?.trim().toLowerCase() === 'tether usd'
    ),
    TokenLogo: (props: { symbol: string; name?: string }) => {
      mockState.tokenLogo(props)
      return ReactActual.createElement(Text, null, `token-logo:${props.symbol}:${props.name || ''}`)
    },
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

const { render } = await import('@testing-library/react-native')
const { CryptoReceiptBubble } = await import('./CryptoReceiptBubble')

describe('CryptoReceiptBubble', () => {
  it('labels inbound receipt-shaped messages as unverified payment messages', () => {
    const view = render(
      <CryptoReceiptBubble
        isOwn={false}
        isVerified={false}
        senderName="Alice"
        symbol="USDT"
        amount="10"
        txHash="0xabc123"
        chainId="ethereum"
        recipientName="Bob"
        timestamp={1_700_000_000_000}
      />,
    )

    expect(view.getByText('Alice sent a payment message to Bob')).toBeTruthy()
    expect(view.getByText('Unverified payment message')).toBeTruthy()
    expect(view.getByText('12:00')).toBeTruthy()
    expect(view.getByText('AlertCircle')).toBeTruthy()
    expect(view.getAllByText('token-logo:USDT:Tether USD').length).toBeGreaterThan(0)
    expect(() => view.getByText(/Encrypted/)).toThrow()
  })

  it('labels locally-created receipt cards separately from inbound claims', () => {
    const view = render(
      <CryptoReceiptBubble
        isOwn
        isVerified
        symbol="EXO"
        amount="1.5"
        txHash="0xabc123"
        timestamp={1_700_000_000_000}
      />,
    )

    expect(view.getByText('You sent')).toBeTruthy()
    expect(view.getByText('Created on this device')).toBeTruthy()
    expect(view.getByText('12:00')).toBeTruthy()
    expect(view.getByText('Shield')).toBeTruthy()
    expect(view.root.findByType('Pressable' as any).props.className).toContain('w-full')
  })

  it('renders failed receipts as failed payment messages', () => {
    const view = render(
      <CryptoReceiptBubble
        isOwn
        isVerified
        symbol="EXO"
        amount="1.5"
        txHash="0xabc123"
        status="failed"
        timestamp={1_700_000_000_000}
      />,
    )

    expect(view.getByText('Transfer failed')).toBeTruthy()
    expect(view.getByText('Failed on-chain')).toBeTruthy()
    expect(view.getByText('12:00')).toBeTruthy()
    expect(view.getByText('XCircle')).toBeTruthy()
  })

  it('truncates long participant names and keeps the timestamp separate', () => {
    const senderName = 'A very long public display name for the payment sender'
    const recipientName = 'A very long public display name for the payment recipient'
    const view = render(
      <CryptoReceiptBubble
        isOwn={false}
        isVerified={false}
        senderName={senderName}
        recipientName={recipientName}
        symbol="USDT"
        amount="10"
        txHash="0xabc123"
        chainId="ethereum"
        timestamp={1_700_000_000_000}
      />,
    )

    const direction = view.getByText(`${senderName} sent a payment message to ${recipientName}`)

    expect(direction.props.numberOfLines).toBe(1)
    expect(direction.props.ellipsizeMode).toBe('tail')
    expect(view.getByText('12:00').props.numberOfLines).toBe(1)
  })
})
