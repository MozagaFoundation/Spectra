/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo } from 'react'
import { Image, Pressable, View, Text } from 'react-native'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Clock, Shield, XCircle } from 'lucide-react-native'
import { useCryptoTheme } from '@/lib/cryptoTheme'
import { CRYPTO_NETWORK_ICONS } from '@/lib/cryptoIcons'
import { translate } from '@/lib/i18n'
import { TokenLogo, USDT_TOKEN_COLOR, isUsdtToken } from '@/lib/tokenIcons'
import { formatTime } from '@/lib/utils'
import { resolveCryptoReceiptNetwork } from '@/services/crypto/receipts'
import type { CryptoNetworkId } from '@/services/crypto'
import type { CryptoReceiptStatus } from '@/services/crypto'

const NATIVE_SYMBOL_BY_NETWORK: Record<CryptoNetworkId, string> = {
  mozaga: 'EXO',
  ethereum: 'ETH',
  bitcoin: 'BTC',
  solana: 'SOL',
  tron: 'TRX',
}

function isNativeReceiptAsset(symbol: string, networkId: CryptoNetworkId): boolean {
  return NATIVE_SYMBOL_BY_NETWORK[networkId] === symbol.trim().toUpperCase()
}

export const CryptoReceiptBubble = memo(function CryptoReceiptBubble({ 
  isOwn, 
  isVerified = isOwn,
  senderName,
  symbol, 
  amount, 
  txHash, 
  status = 'confirmed',
  chainId,
  recipientName,
  timestamp,
  onPress,
  onLongPress,
}: { 
  isOwn: boolean
  isVerified?: boolean
  senderName?: string
  symbol: string
  amount: string
  txHash: string
  status?: CryptoReceiptStatus
  chainId?: string
  recipientName?: string
  timestamp: number
  onPress?: () => void
  onLongPress?: () => void
}) {
  useTranslation()
  const { colors, accent, alpha, resolveExternalAccent } = useCryptoTheme()
  const isFailed = status === 'failed'
  const isPending = status === 'pending'
  const receiptAccent = isFailed ? colors.error : isPending ? colors.warning : accent('positive')
  const receiptAccentSoft = alpha(receiptAccent, 0.82)
  const onAccentText = colors.textOnPrimary
  const mutedOnAccent = alpha(onAccentText, 0.78)
  const truncatedHash = txHash.length > 16
    ? `${txHash.slice(0, 8)}...${txHash.slice(-8)}`
    : txHash
  const normalizedSymbol = symbol.trim().toUpperCase()
  const tokenAccent = isUsdtToken(normalizedSymbol) ? USDT_TOKEN_COLOR : resolveExternalAccent(undefined, 'mozaga')
  const directionLabel = (() => {
    if (isFailed) return translate('Transfer failed')
    if (isPending) return translate('Transfer pending')
    if (recipientName) {
      return isOwn
        ? translate('You sent to {{recipientName}}', { recipientName })
        : translate('{{senderName}} sent a payment message to {{recipientName}}', {
            senderName: senderName || translate('Transfer'),
            recipientName,
          })
    }
    return isOwn
      ? translate('You sent')
      : translate('{{senderName}} sent a payment message', {
          senderName: senderName || translate('Transfer'),
        })
  })()
  const footerLabel = isVerified
    ? isFailed
      ? translate('Failed on-chain')
      : isPending
        ? translate('Pending confirmation')
        : translate('Created on this device')
    : translate('Unverified payment message')
  const FooterIcon = isFailed ? XCircle : isPending ? Clock : isVerified ? Shield : AlertCircle
  const resolvedNetworkId = resolveCryptoReceiptNetwork({ chainId, symbol })
  const nativeNetworkId = isNativeReceiptAsset(symbol, resolvedNetworkId) ? resolvedNetworkId : null

  return (
    <View className={`w-full flex-row ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={300}
        className={`w-full rounded-2xl overflow-hidden active:opacity-85 ${
          isOwn ? 'rounded-br-md' : 'rounded-bl-md'
        }`}
      >
        <View className="px-4 pt-3 pb-2" style={{ backgroundColor: receiptAccent }}>
          <View className="flex-row items-center gap-2 mb-1">
            <View className="w-7 h-7 rounded-full items-center justify-center" style={{ backgroundColor: alpha(onAccentText, 0.18) }}>
              {nativeNetworkId ? (
                <Image
                  source={CRYPTO_NETWORK_ICONS[nativeNetworkId]}
                  resizeMode="contain"
                  style={{ width: 22, height: 22 }}
                />
              ) : (
                <TokenLogo
                  symbol={normalizedSymbol || 'TX'}
                  name={isUsdtToken(normalizedSymbol) ? 'Tether USD' : undefined}
                  color={tokenAccent}
                  backgroundColor={alpha(tokenAccent, 0.16)}
                  size={28}
                />
              )}
            </View>
            <Text
              className="text-sm font-medium flex-1"
              style={{ color: mutedOnAccent, minWidth: 0 }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {directionLabel}
            </Text>
          </View>
          <Text className="text-2xl font-bold" style={{ color: onAccentText }}>
            {amount} {symbol}
          </Text>
        </View>
        <View className="px-4 py-2.5" style={{ backgroundColor: receiptAccentSoft }}>
          <View className="flex-row items-center justify-between">
            <Text className="text-xs" style={{ color: mutedOnAccent }}>{translate('Tx Hash')}</Text>
            <Text className="font-mono text-xs" style={{ color: onAccentText }}>{truncatedHash}</Text>
          </View>
        </View>
        <View className="px-4 pb-2.5 flex-row items-center gap-1.5" style={{ backgroundColor: receiptAccentSoft }}>
          <FooterIcon size={10} color={mutedOnAccent} />
          <Text
            className="text-xs flex-1"
            style={{ color: alpha(onAccentText, 0.65), minWidth: 0 }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {footerLabel}
          </Text>
          <Text
            className="text-xs"
            style={{ color: alpha(onAccentText, 0.65), flexShrink: 0 }}
            numberOfLines={1}
          >
            {formatTime(timestamp)}
          </Text>
        </View>
      </Pressable>
    </View>
  )
})
