/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo } from 'react'
import { Image } from 'expo-image'
import { Pressable, Text, View } from 'react-native'
import { AlertCircle, CheckCircle2, Clock, WalletCards } from 'lucide-react-native'
import { translate } from '@/lib/i18n'
import { formatTime } from '@/lib/utils'
import { useCryptoTheme } from '@/lib/cryptoTheme'
import { CRYPTO_NETWORK_ICONS } from '@/lib/cryptoIcons'
import { TokenLogo, USDT_TOKEN_COLOR, isUsdtToken } from '@/lib/tokenIcons'
import type { CryptoPaymentRequest } from '@/services/shared/cryptoPaymentRequest'

export const CryptoPaymentRequestBubble = memo(function CryptoPaymentRequestBubble({
  request,
  isOwn,
  senderName,
  timestamp,
  onPress,
  onLongPress,
}: {
  request: CryptoPaymentRequest
  isOwn: boolean
  senderName?: string
  timestamp: number
  onPress?: () => void
  onLongPress?: () => void
}) {
  const { colors, accent, alpha, resolveExternalAccent } = useCryptoTheme()
  const paid = request.state === 'paid'
  const pending = request.settlement?.status === 'pending'
  const failed = request.settlement?.status === 'failed'
  const requestAccent = failed
    ? colors.error
    : paid
      ? accent('positive')
      : pending
        ? colors.warning
        : accent('mozaga')
  const softAccent = alpha(requestAccent, 0.82)
  const onAccentText = colors.textOnPrimary
  const mutedOnAccent = alpha(onAccentText, 0.78)
  const normalizedSymbol = request.symbol.trim().toUpperCase()
  const tokenAccent = isUsdtToken(normalizedSymbol)
    ? USDT_TOKEN_COLOR
    : resolveExternalAccent(undefined, 'mozaga')
  const StatusIcon = failed ? AlertCircle : pending ? Clock : paid ? CheckCircle2 : WalletCards
  const canPay = Boolean(onPress && !isOwn && !paid)

  const heading = paid
    ? failed
      ? translate('Payment failed')
      : translate('Payment submitted')
    : isOwn
      ? translate('You requested')
      : translate('{{senderName}} requested', {
          senderName: senderName || translate('Payment'),
        })

  const footer = paid && request.settlement
    ? request.settlement.payerName
      ? translate('Paid by {{payerName}}', { payerName: request.settlement.payerName })
      : translate('Payment message received')
    : translate('Tap to review and pay')

  return (
    <View className={`w-full flex-row ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={300}
        accessibilityRole="button"
        className={`w-full rounded-2xl overflow-hidden active:opacity-85 ${
          isOwn ? 'rounded-br-md' : 'rounded-bl-md'
        }`}
      >
        <View className="px-4 pt-3 pb-2" style={{ backgroundColor: requestAccent }}>
          <View className="flex-row items-center gap-2 mb-1">
            <View
              className="w-7 h-7 rounded-full items-center justify-center"
              style={{ backgroundColor: alpha(onAccentText, 0.18) }}
            >
              {request.assetType === 'native' ? (
                <Image
                  source={CRYPTO_NETWORK_ICONS[request.network]}
                  contentFit="contain"
                  style={{ width: 22, height: 22 }}
                />
              ) : (
                <TokenLogo
                  symbol={normalizedSymbol || 'PAY'}
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
              {heading}
            </Text>
          </View>
          <Text className="text-2xl font-bold" style={{ color: onAccentText }}>
            {request.amount} {request.symbol}
          </Text>
        </View>

        {request.settlement?.txHash ? (
          <View className="px-4 py-2.5" style={{ backgroundColor: softAccent }}>
            <View className="flex-row items-center justify-between gap-4">
              <Text className="text-xs" style={{ color: mutedOnAccent }}>
                {translate('Tx Hash')}
              </Text>
              <Text
                className="font-mono text-xs"
                style={{ color: onAccentText }}
                numberOfLines={1}
              >
                {request.settlement.txHash.length > 16
                  ? `${request.settlement.txHash.slice(0, 8)}...${request.settlement.txHash.slice(-8)}`
                  : request.settlement.txHash}
              </Text>
            </View>
          </View>
        ) : null}

        <View className="px-4 pb-3 pt-2.5 gap-2" style={{ backgroundColor: softAccent }}>
          <View className="flex-row items-center gap-1.5">
            <StatusIcon size={12} color={mutedOnAccent} />
            <Text
              className="text-xs flex-1"
              style={{ color: alpha(onAccentText, 0.68), minWidth: 0 }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {footer}
            </Text>
            <Text
              className="text-xs"
              style={{ color: alpha(onAccentText, 0.68), flexShrink: 0 }}
              numberOfLines={1}
            >
              {formatTime(timestamp)}
            </Text>
          </View>
          {canPay ? (
            <View
              className="rounded-xl py-2 items-center"
              style={{ backgroundColor: alpha(onAccentText, 0.18) }}
            >
              <Text className="text-sm font-bold" style={{ color: onAccentText }}>
                {translate('Pay request')}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </View>
  )
})
