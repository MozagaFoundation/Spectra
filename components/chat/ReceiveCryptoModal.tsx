/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AlertCircle, Check, ChevronDown, X } from 'lucide-react-native'
import { generateUUID } from '@spectra/core-crypto/crypto/utils'
import { translate } from '@/lib/i18n'
import { parseDecimalToBigInt } from '@/lib/amounts'
import { Haptics, impactAsync as triggerImpact, notificationAsync as triggerNotification } from '@/lib/safeHaptics'
import { formatAddress } from '@/lib/utils'
import { useCryptoTheme } from '@/lib/cryptoTheme'
import { CRYPTO_NETWORK_ICONS } from '@/lib/cryptoIcons'
import { TokenLogo } from '@/lib/tokenIcons'
import {
  CRYPTO_NETWORK_BY_ID,
  ETHEREUM_TOKENS,
  SOLANA_TOKENS,
  TRON_TOKENS,
  getAvailableNetworks,
  getWalletAddressForNetwork,
  type CryptoNetworkId,
} from '@/services/crypto'
import { createCryptoPaymentRequest } from '@/services/shared/cryptoPaymentRequest'
import { useWalletStore } from '@/store/walletStore'

const ETHEREUM_REQUESTABLE_SYMBOLS = new Set(['USDT'])

type RequestAsset = {
  network: CryptoNetworkId
  assetType: 'native' | 'token'
  symbol: string
  name: string
  decimals: number
  color: string
  tokenStandard?: string
  contractAddress?: string
  mintAddress?: string
}

interface ReceiveCryptoModalProps {
  visible: boolean
  onClose: () => void
  onCreate: (content: string) => void | Promise<void>
  requesterIdentityId?: string
  requesterName?: string
}

function getRequestAssets(network: CryptoNetworkId): RequestAsset[] {
  const config = CRYPTO_NETWORK_BY_ID[network]
  const nativeAsset: RequestAsset = {
    network,
    assetType: 'native',
    symbol: config.nativeSymbol,
    name: config.shortName,
    decimals: config.decimals,
    color: '',
  }

  if (network === 'ethereum') {
    return [
      nativeAsset,
      ...ETHEREUM_TOKENS
        .filter((token) => ETHEREUM_REQUESTABLE_SYMBOLS.has(token.symbol))
        .map((token) => ({
          network,
          assetType: 'token' as const,
          symbol: token.symbol,
          name: token.name,
          decimals: token.decimals,
          color: token.logoColor,
          tokenStandard: 'erc20',
          contractAddress: token.address,
        })),
    ]
  }
  if (network === 'solana') {
    return [
      nativeAsset,
      ...SOLANA_TOKENS.map((token) => ({
        network,
        assetType: 'token' as const,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        color: token.logoColor,
        tokenStandard: token.standard,
        mintAddress: token.mintAddress,
      })),
    ]
  }
  if (network === 'tron') {
    return [
      nativeAsset,
      ...TRON_TOKENS.map((token) => ({
        network,
        assetType: 'token' as const,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        color: token.logoColor,
        tokenStandard: token.standard,
        contractAddress: token.contractAddress,
      })),
    ]
  }

  return [nativeAsset]
}

export function ReceiveCryptoModal({
  visible,
  onClose,
  onCreate,
  requesterIdentityId,
  requesterName,
}: ReceiveCryptoModalProps) {
  const insets = useSafeAreaInsets()
  const { wallet } = useWalletStore()
  const { colors, accent, alpha, resolveExternalAccent } = useCryptoTheme()
  const [network, setNetwork] = useState<CryptoNetworkId>('mozaga')
  const [showNetworkSelector, setShowNetworkSelector] = useState(false)
  const [selectedAsset, setSelectedAsset] = useState<RequestAsset | null>(null)
  const [amount, setAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) {
      setNetwork('mozaga')
      setShowNetworkSelector(false)
      setSelectedAsset(null)
      setAmount('')
      setIsSubmitting(false)
      setError(null)
    }
  }, [visible])

  const availableNetworks = useMemo(() => getAvailableNetworks(wallet), [wallet])
  const requestAssets = useMemo(() => getRequestAssets(network), [network])
  const recipientAddress = wallet ? getWalletAddressForNetwork(wallet, network) : undefined
  const parsedAmount = selectedAsset ? parseDecimalToBigInt(amount, selectedAsset.decimals) : null
  const canCreate = Boolean(
    selectedAsset && recipientAddress && parsedAmount && parsedAmount > 0n && !isSubmitting,
  )
  const networkConfig = CRYPTO_NETWORK_BY_ID[network]
  const networkAccent = accent(networkConfig.accentName)
  const hasMultipleNetworks = availableNetworks.length > 1

  useEffect(() => {
    if (visible && !selectedAsset && requestAssets.length > 0) {
      setSelectedAsset(requestAssets[0])
    }
  }, [visible, requestAssets, selectedAsset])

  const handleCreate = async () => {
    if (!selectedAsset || !recipientAddress || !canCreate) return

    triggerImpact(Haptics.ImpactFeedbackStyle.Medium)
    setIsSubmitting(true)
    setError(null)

    try {
      const content = createCryptoPaymentRequest({
        requestId: generateUUID(),
        requesterIdentityId,
        requesterName,
        network: selectedAsset.network,
        symbol: selectedAsset.symbol,
        amount: amount.trim(),
        decimals: selectedAsset.decimals,
        recipientAddress,
        assetType: selectedAsset.assetType,
        contractAddress: selectedAsset.contractAddress,
        mintAddress: selectedAsset.mintAddress,
        tokenStandard: selectedAsset.tokenStandard,
        createdAt: Date.now(),
      })
      await onCreate(content)
      triggerNotification(Haptics.NotificationFeedbackType.Success)
      onClose()
    } catch (createError) {
      triggerNotification(Haptics.NotificationFeedbackType.Error)
      setError(
        createError instanceof Error
          ? createError.message
          : translate('Failed to create request'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const screenHeight = Dimensions.get('window').height
  const sheetHeight = screenHeight * 0.88

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1 justify-end" style={{ backgroundColor: colors.overlay }}>
        <View
          className="rounded-t-3xl overflow-hidden"
          style={{ height: sheetHeight, backgroundColor: colors.backgroundSecondary }}
        >
          <View className="items-center pt-3 pb-2">
            <View
              className="w-10 h-1 rounded-full"
              style={{ backgroundColor: colors.border }}
            />
          </View>

          <View
            className="flex-row items-center justify-between px-4 pb-3"
            style={{ borderBottomWidth: 1, borderBottomColor: colors.surface }}
          >
            <View style={{ width: 40 }} />
            <View className="items-center">
              <Text className="text-lg font-bold" style={{ color: colors.text }}>
                {translate('Receive Crypto')}
              </Text>
              <Text className="text-[11px] mt-0.5" style={{ color: colors.textMuted }}>
                {translate('Request a payment in this chat')}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              className="w-10 h-10 items-center justify-center -mr-1"
              accessibilityRole="button"
              accessibilityLabel={translate('Close')}
            >
              <X size={18} color={colors.textTertiary} />
            </Pressable>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={20}
            style={{ flex: 1 }}
          >
            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {hasMultipleNetworks ? (
                <>
                  <Pressable
                    onPress={() => setShowNetworkSelector((value) => !value)}
                    className="flex-row items-center gap-3 rounded-2xl p-4 active:opacity-80"
                    style={{
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Image
                      source={CRYPTO_NETWORK_ICONS[network]}
                      style={{ width: 28, height: 28 }}
                      contentFit="contain"
                    />
                    <View className="flex-1">
                      <Text className="text-xs" style={{ color: colors.textMuted }}>
                        {translate('Blockchain')}
                      </Text>
                      <Text className="font-semibold text-base" style={{ color: colors.text }}>
                        {networkConfig.name}
                      </Text>
                    </View>
                    <ChevronDown size={20} color={colors.textMuted} />
                  </Pressable>
                  {showNetworkSelector ? (
                    <View className="gap-2 mt-2 mb-5">
                      {availableNetworks.map((entry) => {
                        const active = network === entry.id
                        const color = accent(entry.accentName)
                        return (
                          <Pressable
                            key={entry.id}
                            onPress={() => {
                              setNetwork(entry.id)
                              setSelectedAsset(null)
                              setShowNetworkSelector(false)
                            }}
                            className="flex-row items-center gap-3 rounded-2xl p-4 active:opacity-80"
                            style={{
                              backgroundColor: active
                                ? alpha(color, 0.14)
                                : colors.surface + 'CC',
                              borderWidth: 1,
                              borderColor: active ? alpha(color, 0.4) : 'transparent',
                            }}
                          >
                            <Image
                              source={CRYPTO_NETWORK_ICONS[entry.id]}
                              style={{ width: 28, height: 28 }}
                              contentFit="contain"
                            />
                            <View className="flex-1">
                              <Text className="font-semibold" style={{ color: colors.text }}>
                                {entry.name}
                              </Text>
                              <Text className="text-xs" style={{ color: colors.textMuted }}>
                                {entry.nativeSymbol}
                              </Text>
                            </View>
                            {active ? <Check size={18} color={color} /> : null}
                          </Pressable>
                        )
                      })}
                    </View>
                  ) : null}
                  {!showNetworkSelector ? <View className="h-5" /> : null}
                </>
              ) : (
                <View
                  className="flex-row items-center gap-3 rounded-2xl p-4 mb-5"
                  style={{
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <Image
                    source={CRYPTO_NETWORK_ICONS[network]}
                    style={{ width: 28, height: 28 }}
                    contentFit="contain"
                  />
                  <View className="flex-1">
                    <Text className="text-xs" style={{ color: colors.textMuted }}>
                      {translate('Blockchain')}
                    </Text>
                    <Text className="font-semibold text-base" style={{ color: colors.text }}>
                      {networkConfig.name}
                    </Text>
                  </View>
                </View>
              )}

              <View
                className="rounded-2xl p-4 mb-5"
                style={{
                  backgroundColor: alpha(networkAccent, 0.08),
                  borderWidth: 1,
                  borderColor: alpha(networkAccent, 0.18),
                }}
              >
                <Text
                  className="text-[11px] uppercase tracking-wider mb-1"
                  style={{ color: colors.textMuted }}
                >
                  {translate('Receive address')}
                </Text>
                {recipientAddress ? (
                  <>
                    <Text
                      className="font-semibold text-base"
                      style={{ color: colors.text }}
                      numberOfLines={1}
                    >
                      {formatAddress(recipientAddress, 10)}
                    </Text>
                    <Text
                      className="font-mono text-[11px] mt-1"
                      style={{ color: colors.textMuted }}
                      numberOfLines={1}
                      selectable
                    >
                      {recipientAddress}
                    </Text>
                  </>
                ) : (
                  <Text className="text-sm" style={{ color: colors.error }}>
                    {translate('No address for this network')}
                  </Text>
                )}
              </View>

              <Text
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: colors.textMuted }}
              >
                {translate('Asset')}
              </Text>
              <View className="gap-3 mb-5">
                {requestAssets.map((asset) => {
                  const active =
                    selectedAsset?.symbol === asset.symbol &&
                    selectedAsset?.assetType === asset.assetType
                  const assetAccent = resolveExternalAccent(
                    asset.color || null,
                    networkConfig.accentName,
                  )
                  return (
                    <Pressable
                      key={`${asset.assetType}:${asset.symbol}:${asset.contractAddress || asset.mintAddress || 'native'}`}
                      onPress={() => setSelectedAsset(asset)}
                      className="rounded-2xl p-4 active:opacity-80"
                      style={{
                        backgroundColor: active
                          ? alpha(assetAccent, 0.14)
                          : colors.surface + 'CC',
                        borderWidth: 1,
                        borderColor: active ? alpha(assetAccent, 0.4) : colors.border,
                      }}
                    >
                      <View className="flex-row items-center gap-3">
                        {asset.assetType === 'native' ? (
                          <View
                            className="w-11 h-11 rounded-full items-center justify-center"
                            style={{ backgroundColor: alpha(assetAccent, 0.18) }}
                          >
                            <Image
                              source={CRYPTO_NETWORK_ICONS[asset.network]}
                              style={{ width: 28, height: 28 }}
                              contentFit="contain"
                            />
                          </View>
                        ) : (
                          <TokenLogo
                            symbol={asset.symbol}
                            name={asset.name}
                            color={assetAccent}
                            backgroundColor={alpha(assetAccent, 0.18)}
                            size={44}
                          />
                        )}
                        <View className="flex-1">
                          <Text className="font-semibold" style={{ color: colors.text }}>
                            {asset.name}
                          </Text>
                          <Text className="text-xs" style={{ color: colors.textMuted }}>
                            {asset.symbol}
                          </Text>
                        </View>
                        {active ? <Check size={18} color={assetAccent} /> : null}
                      </View>
                    </Pressable>
                  )
                })}
              </View>

              <Text
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: colors.textMuted }}
              >
                {translate('Amount')}
              </Text>
              <View
                className="rounded-2xl flex-row items-center"
                style={{
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <TextInput
                  className="flex-1 p-4 text-2xl font-bold"
                  style={{ color: colors.text }}
                  placeholder="0.0"
                  placeholderTextColor={colors.textMuted}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                />
                <Text
                  className="font-semibold text-sm pr-4"
                  style={{ color: colors.textMuted }}
                >
                  {selectedAsset?.symbol || networkConfig.nativeSymbol}
                </Text>
              </View>
              {amount.length > 0 && (!parsedAmount || parsedAmount <= 0n) ? (
                <Text className="text-xs mt-2" style={{ color: colors.error }}>
                  {translate('Enter a valid amount')}
                </Text>
              ) : null}

              {error ? (
                <View
                  className="rounded-2xl p-3 mt-4 flex-row items-start gap-2"
                  style={{
                    backgroundColor: alpha(colors.error, 0.1),
                    borderWidth: 1,
                    borderColor: alpha(colors.error, 0.3),
                  }}
                >
                  <AlertCircle size={16} color={colors.error} />
                  <Text className="text-sm flex-1" style={{ color: colors.error }}>
                    {error}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            <View
              className="px-5 pt-3"
              style={{
                paddingBottom: Math.max(insets.bottom, 12) + 4,
                borderTopWidth: 1,
                borderTopColor: colors.surface,
              }}
            >
              <Pressable
                onPress={handleCreate}
                disabled={!canCreate}
                className="rounded-2xl py-4 items-center justify-center active:opacity-90"
                style={{
                  backgroundColor: canCreate ? networkAccent : colors.surface,
                  borderWidth: canCreate ? 0 : 1,
                  borderColor: colors.border,
                }}
                accessibilityRole="button"
                accessibilityLabel={translate('Post request')}
                accessibilityState={{ disabled: !canCreate }}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <Text
                    className="font-bold text-base"
                    style={{ color: canCreate ? colors.textOnPrimary : colors.textMuted }}
                  >
                    {translate('Post request')}
                  </Text>
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </View>
    </Modal>
  )
}
