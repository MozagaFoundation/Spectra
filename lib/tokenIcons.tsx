/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React from 'react'
import { Image, Text, View } from 'react-native'
import { translate } from '@/lib/i18n'

export const USDT_TOKEN_COLOR = '#009393'
// Official Tether logo.
const USDT_LOGO = require('@/assets/images/logos/tether-usdt-logo.png')

interface TokenLogoProps {
  symbol: string
  name?: string
  color: string
  backgroundColor: string
  size?: number
}

export function isUsdtToken(symbol?: string | null, name?: string | null): boolean {
  const normalizedSymbol = symbol?.trim().toUpperCase()
  const normalizedName = name?.trim().toLowerCase()
  return normalizedSymbol === 'USDT' || normalizedName === 'tether usd'
}

export function TokenLogo({
  symbol,
  name,
  color,
  backgroundColor,
  size = 40,
}: TokenLogoProps) {
  const normalizedSymbol = symbol.trim().toUpperCase()
  const firstLetter = normalizedSymbol[0] || '?'

  if (isUsdtToken(normalizedSymbol, name)) {
    return (
      <View
        accessibilityLabel={translate('USDT logo', { ns: 'crypto' })}
        className="items-center justify-center"
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: USDT_TOKEN_COLOR,
          shadowColor: USDT_TOKEN_COLOR,
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
          elevation: 3,
          overflow: 'hidden',
        }}
      >
        <Image
          source={USDT_LOGO}
          resizeMode="contain"
          style={{ width: size, height: size, borderRadius: size / 2 }}
        />
      </View>
    )
  }

  return (
    <View
      accessibilityLabel={translate('{{symbol}} logo', {
        ns: 'crypto',
        symbol: normalizedSymbol || 'Token',
      })}
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor,
      }}
    >
      <Text style={{ color, fontSize: size * 0.4, fontWeight: '800' }}>
        {firstLetter}
      </Text>
    </View>
  )
}
