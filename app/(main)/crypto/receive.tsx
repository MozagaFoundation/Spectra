/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, Share as RNShare, Image, Modal } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { ChevronLeft, Copy, Share, Check, ChevronDown } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import * as Sharing from 'expo-sharing'
import ViewShot from 'react-native-view-shot'
import QRCode from 'react-native-qrcode-svg'
import { useWalletStore } from '@/store'
import { useSpectreStore } from '@/store/spectreStore'
import { Button, Card } from '@/components/ui'
import { translate } from '@/lib/i18n'
import { useCryptoTheme } from '@/lib/cryptoTheme'
import { CRYPTO_NETWORK_ICONS } from '@/lib/cryptoIcons'
import {
  CRYPTO_NETWORK_BY_ID,
  getAvailableNetworks,
  getWalletAddressForNetwork,
  type CryptoNetworkId,
} from '@/services/crypto'
import {
  canUseCryptoNetworkInSpectre,
  getSpectreCryptoRestrictionMessage,
  type SpectreCryptoNetworkId,
} from '@/lib/spectrePolicy'

function parseNetworkParam(value?: string): CryptoNetworkId {
  return value && value in CRYPTO_NETWORK_BY_ID ? value as CryptoNetworkId : 'mozaga'
}

export default function ReceiveScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { network: networkParam } = useLocalSearchParams<{ network?: string }>()
  const { wallet } = useWalletStore()
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const spectreAccountMode = useSpectreStore((state) => state.spectreAccountMode)
  const { colors, accent, alpha } = useCryptoTheme()

  const viewShotRef = useRef<ViewShot>(null)
  const [selectedNetwork, setSelectedNetwork] = useState<CryptoNetworkId>(parseNetworkParam(networkParam))
  const [copied, setCopied] = useState(false)
  const [showNetworkSelector, setShowNetworkSelector] = useState(false)

  const spectrePolicyState = useMemo(() => ({
    enabled: spectreEnabled,
    accountMode: spectreAccountMode,
    walletIsSpectre: wallet?.spectreMode === true,
  }), [spectreAccountMode, spectreEnabled, wallet?.spectreMode])
  const availableNetworks = getAvailableNetworks(wallet)
    .filter((network) => canUseCryptoNetworkInSpectre(spectrePolicyState, network.id as SpectreCryptoNetworkId))
  const selectedNetworkConfig = CRYPTO_NETWORK_BY_ID[selectedNetwork] || CRYPTO_NETWORK_BY_ID.mozaga
  const displayAddress = wallet ? getWalletAddressForNetwork(wallet, selectedNetwork) : undefined
  const accentColor = accent(selectedNetworkConfig.accentName)
  const selectedNetworkAllowed = canUseCryptoNetworkInSpectre(spectrePolicyState, selectedNetwork as SpectreCryptoNetworkId)

  const handleCopy = async () => {
    if (displayAddress) {
      await Clipboard.setStringAsync(displayAddress)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleShare = async () => {
    if (!displayAddress) return
    try {
      const uri = await viewShotRef.current?.capture?.()
      if (uri) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: translate('Share {{network}} Address', { network: selectedNetworkConfig.shortName }),
        })
        return
      }
    } catch {}
    const message = translate('Send {{symbol}} to my {{network}} address:\n{{address}}', {
      symbol: selectedNetworkConfig.nativeSymbol,
      network: selectedNetworkConfig.shortName,
      address: displayAddress,
    })
    const title = translate('My {{network}} Address', { network: selectedNetworkConfig.shortName })
    try {
      await RNShare.share({ message, title })
    } catch (error) {
      if (__DEV__) console.error('Share error:', error)
    }
  }

  if (!wallet) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-text text-lg">{translate('No wallet found')}</Text>
      </View>
    )
  }

  if (!selectedNetworkAllowed) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center gap-3 px-5 pb-4">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-xl items-center justify-center active:opacity-70"
            style={{ backgroundColor: colors.surface }}
          >
            <ChevronLeft size={22} color={colors.text} />
          </Pressable>
          <Text className="flex-1 text-2xl font-bold text-text">{translate('Receive')}</Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-text text-xl font-semibold text-center">{translate('Unavailable in Spectre Mode')}</Text>
          <Text className="text-text-muted text-center mt-2">
            {translate(getSpectreCryptoRestrictionMessage(spectrePolicyState, selectedNetwork as SpectreCryptoNetworkId) ?? 'This crypto network is unavailable in Spectre Mode.')}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 px-5 pb-4">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-xl items-center justify-center active:opacity-70"
          style={{ backgroundColor: colors.surface }}
        >
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-2xl font-bold text-text">{translate('Receive')}</Text>
      </View>

      <View className="flex-1 px-5 items-center gap-5 pt-2">
        {availableNetworks.length > 1 && (
          <Pressable
            onPress={() => setShowNetworkSelector(true)}
            className="flex-row items-center gap-3 rounded-2xl p-4 w-full max-w-sm active:opacity-80 border"
            style={{
              backgroundColor: alpha(accentColor, 0.08),
              borderColor: alpha(accentColor, 0.2),
            }}
          >
            <Image source={CRYPTO_NETWORK_ICONS[selectedNetwork]} style={{ width: 28, height: 28 }} resizeMode="contain" />
            <View className="flex-1">
              <Text className="text-text-muted text-xs">{translate('Blockchain')}</Text>
              <Text className="text-text font-semibold">{translate(selectedNetworkConfig.name)}</Text>
            </View>
            <ChevronDown size={20} color={colors.textTertiary} />
          </Pressable>
        )}

        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }}>
          <View className="items-center gap-4 bg-background p-5">
            <View className="items-center gap-3">
              <View
                className="w-16 h-16 rounded-2xl items-center justify-center"
                style={{ backgroundColor: alpha(accentColor, 0.2) }}
              >
                <Image
                  source={CRYPTO_NETWORK_ICONS[selectedNetwork]}
                  style={{ width: 32, height: 32 }}
                  resizeMode="contain"
                />
              </View>
              <Text className="text-lg font-semibold text-text">
                {translate('{{network}} Wallet', { network: selectedNetworkConfig.shortName })}
              </Text>
            </View>

            <Card className="p-6 w-full max-w-sm">
              <View className="items-center gap-4">
                <View className="bg-white p-4 rounded-xl">
                  <QRCode
                    value={displayAddress || ''}
                    size={200}
                    backgroundColor="white"
                    color={colors.qrForeground}
                  />
                </View>

                <View className="items-center gap-2 w-full">
                  <Text className="text-text-muted text-sm">
                    {translate('Your {{network}} Address', { network: selectedNetworkConfig.shortName })}
                  </Text>
                  <View className="bg-background rounded-xl p-3 w-full">
                    <Text
                      className="text-text font-mono text-xs text-center"
                      selectable
                    >
                      {displayAddress}
                    </Text>
                  </View>
                </View>
              </View>
            </Card>
          </View>
        </ViewShot>

        <View className="flex-row gap-3 w-full max-w-sm">
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onPress={handleCopy}
            icon={copied ? <Check size={18} color={colors.success} /> : <Copy size={18} color={colors.text} />}
          >
            {copied ? translate('Copied!', { ns: 'crypto' }) : translate('Copy', { ns: 'crypto' })}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onPress={handleShare}
            icon={<Share size={18} color={colors.text} />}
          >
            {translate('Share', { ns: 'crypto' })}
          </Button>
        </View>

        <View className="bg-surface rounded-xl p-4 w-full max-w-sm">
          <Text className="text-text-muted text-sm text-center leading-5">
            {translate(
              'Share this QR code or address to receive {{symbol}} on {{network}}. Only send assets for this network to this address.',
              { symbol: selectedNetworkConfig.nativeSymbol, network: selectedNetworkConfig.shortName },
            )}
          </Text>
        </View>

        <View className="flex-row items-center gap-2 px-4 py-2 rounded-full" style={{ backgroundColor: alpha(accentColor, 0.1) }}>
          <View className="w-2 h-2 rounded-full bg-success" />
          <Text className="text-sm font-medium" style={{ color: accentColor }}>
            {translate(selectedNetworkConfig.name)}
          </Text>
        </View>
      </View>
      <Modal
        visible={showNetworkSelector}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNetworkSelector(false)}
      >
        <Pressable
          className="flex-1 justify-end"
          style={{ backgroundColor: colors.overlay }}
          onPress={() => setShowNetworkSelector(false)}
        >
          <Pressable
            className="rounded-t-3xl p-5 border-t border-border"
            style={{ backgroundColor: colors.backgroundSecondary }}
            onPress={(event) => event.stopPropagation()}
          >
            <Text className="text-text text-lg font-bold mb-4">{translate('Select Blockchain')}</Text>
            <View className="gap-2">
              {availableNetworks.map((network) => {
                const active = selectedNetwork === network.id
                const color = accent(network.accentName)
                return (
                  <Pressable
                    key={network.id}
                    onPress={() => {
                      setSelectedNetwork(network.id)
                      setCopied(false)
                      setShowNetworkSelector(false)
                    }}
                    className="flex-row items-center gap-3 rounded-2xl p-4"
                    style={{
                      backgroundColor: active ? alpha(color, 0.18) : colors.surface,
                      borderWidth: 1,
                      borderColor: active ? alpha(color, 0.35) : colors.border,
                    }}
                  >
                    <Image source={CRYPTO_NETWORK_ICONS[network.id]} style={{ width: 30, height: 30 }} resizeMode="contain" />
                    <View className="flex-1">
                  <Text className="text-text font-semibold">{translate(network.name)}</Text>
                      <Text className="text-text-muted text-xs">{network.nativeSymbol}</Text>
                    </View>
                    {active && <Check size={18} color={color} />}
                  </Pressable>
                )
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}
