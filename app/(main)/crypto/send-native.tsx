/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { KeyboardAvoidingView } from '@/components/ui/KeyboardAvoidingView'
import { KeyboardDoneAccessory } from '@/components/ui/KeyboardDoneAccessory'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AlertCircle, ChevronLeft, ChevronDown, Check, Copy, ExternalLink, Send } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '@/components/ui'
import { useUIStore, useWalletStore } from '@/store'
import { useSpectreStore } from '@/store/spectreStore'
import { formatBigIntAmount, parseDecimalToBigInt } from '@/lib/amounts'
import { translate } from '@/lib/i18n'
import { useCryptoTheme } from '@/lib/cryptoTheme'
import { useMarketPrices } from '@/hooks/useMarketPrices'
import { getContributionRecipients, type VerifiedContributionRecipients } from '@/services/backend/contributionRecipients'
import { formatAssetFiatValue } from '@/services/crypto/fiatValuation'
import {
  CRYPTO_NETWORK_BY_ID,
  getBitcoinExplorerTxUrl,
  getEthExplorerTxUrl,
  getEthNonce,
  getNativeFeeForNetwork,
  getDonationTransferQuote,
  getSolanaExplorerTxUrl,
  getTronExplorerTxUrl,
  getAllSolanaTokenBalances,
  getAllTronTokenBalances,
  getWalletAddressForNetwork,
  getWalletPrivateKeyForNetwork,
  isValidAddressForNetwork,
  loadNativeBalanceForNetwork,
  recordPendingCryptoTransaction,
  sendSplTokenTransfer,
  sendTrc20Transfer,
  sendNativeTransferForNetwork,
  type CryptoNetworkId,
  type DonationNetworkId,
  type DonationTransferQuote,
  type NetworkTokenBalance,
} from '@/services/crypto'
import {
  canUseCryptoNetworkInSpectre,
  getSpectreCryptoRestrictionMessage,
  type SpectreCryptoNetworkId,
} from '@/lib/spectrePolicy'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { openExternalUrl } from '@/services/tor/externalLinkPolicy'

const AMOUNT_KEYBOARD_ACCESSORY_ID = 'send-native-amount-keyboard'

type SendState = 'input' | 'confirming' | 'sending' | 'success' | 'pending' | 'error'

interface SendAsset {
  type: 'native' | 'token'
  symbol: string
  name: string
  balance: string
  decimals: number
  color: string
  contractAddress?: string
  mintAddress?: string
}

const DEFAULT_NETWORK: CryptoNetworkId = 'ethereum'

function DonationPreview({ quote }: { quote: DonationTransferQuote }) {
  return (
    <View className="bg-surface rounded-xl p-3">
      <View className="flex-row justify-between mb-1">
        <Text className="text-text-muted text-sm">{translate('Contribution', { ns: 'crypto' })}</Text>
        <Text className="text-text text-sm">{quote.amount} {quote.symbol}</Text>
      </View>
      <Text className="text-text-muted text-xs">
        {translate('A 0.1% contribution is included, capped at $10 equivalent.', { ns: 'crypto' })}
      </Text>
    </View>
  )
}

function parseNetworkParam(value?: string): CryptoNetworkId {
  return value && value in CRYPTO_NETWORK_BY_ID && value !== 'mozaga'
    ? value as CryptoNetworkId
    : DEFAULT_NETWORK
}

function getExplorerTxUrl(network: CryptoNetworkId, txHash: string): string {
  switch (network) {
    case 'ethereum': return getEthExplorerTxUrl(txHash)
    case 'bitcoin': return getBitcoinExplorerTxUrl(txHash)
    case 'solana': return getSolanaExplorerTxUrl(txHash)
    case 'tron': return getTronExplorerTxUrl(txHash)
    case 'mozaga': return ''
  }
}

export default function SendNativeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { network: networkParam } = useLocalSearchParams<{ network?: string }>()
  const networkId = parseNetworkParam(networkParam)
  const network = CRYPTO_NETWORK_BY_ID[networkId]
  const { wallet } = useWalletStore()
  const preferredFiatCurrency = useUIStore((state) => state.preferredFiatCurrency)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const spectreAccountMode = useSpectreStore((state) => state.spectreAccountMode)
  const { colors, accent, alpha, resolveExternalAccent } = useCryptoTheme()
  const { data: marketPrices } = useMarketPrices()
  const accentColor = accent(network.accentName)
  const address = wallet ? getWalletAddressForNetwork(wallet, networkId) : undefined

  const [assets, setAssets] = useState<SendAsset[]>([])
  const [selectedAsset, setSelectedAsset] = useState<SendAsset | null>(null)
  const [showAssetPicker, setShowAssetPicker] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [balance, setBalance] = useState('0')
  const [feeUnits, setFeeUnits] = useState<bigint>(0n)
  const [sendState, setSendState] = useState<SendState>('input')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [donationTxHash, setDonationTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [contributionRecipients, setContributionRecipients] = useState<VerifiedContributionRecipients | null>(null)

  const activeAsset = selectedAsset || assets[0]
  const activeDecimals = activeAsset?.decimals ?? network.decimals
  const activeSymbol = activeAsset?.symbol ?? network.nativeSymbol
  const activeBalance = activeAsset?.balance ?? balance
  const activeFiatLabel = formatAssetFiatValue({
    symbol: activeSymbol,
    balance: activeBalance,
    decimals: activeDecimals,
    prices: marketPrices,
    fiatCode: preferredFiatCurrency,
  })
  const activeAccent = activeAsset ? resolveExternalAccent(activeAsset.color, network.accentName) : accentColor
  const isToken = activeAsset?.type === 'token'
  const amountUnits = parseDecimalToBigInt(amount, activeDecimals)
  const balanceUnits = parseDecimalToBigInt(activeBalance, activeDecimals) ?? 0n
  const nativeBalanceUnits = parseDecimalToBigInt(balance, network.decimals) ?? 0n
  const donationQuote = getDonationTransferQuote({
    networkId: networkId as DonationNetworkId,
    symbol: activeSymbol,
    decimals: activeDecimals,
    amountUnits,
    prices: marketPrices,
    recipients: contributionRecipients?.recipients,
  })
  const feeDisplay = isToken
    ? translate('Paid in {{symbol}}', { symbol: network.nativeSymbol })
    : feeUnits > 0n
    ? `${formatBigIntAmount(feeUnits, network.decimals, 6, true)} ${network.nativeSymbol}`
    : translate('Calculated by network')
  const spectrePolicyState = useMemo(() => ({
    enabled: spectreEnabled,
    accountMode: spectreAccountMode,
    walletIsSpectre: wallet?.spectreMode === true,
  }), [spectreAccountMode, spectreEnabled, wallet?.spectreMode])
  const networkAllowed = canUseCryptoNetworkInSpectre(spectrePolicyState, networkId as SpectreCryptoNetworkId)

  useEffect(() => {
    const load = async () => {
      if (!address) return
      try {
        const [nextBalance, nextFee] = await Promise.all([
          loadNativeBalanceForNetwork(networkId, address).catch((err) => {
            if (__DEV__) console.error('Failed to fetch native balance:', err)
            return '0'
          }),
          getNativeFeeForNetwork(networkId).catch(() => 0n),
        ])
        const tokenBalances = await (
          networkId === 'solana'
            ? getAllSolanaTokenBalances(address)
            : networkId === 'tron'
              ? getAllTronTokenBalances(address)
              : Promise.resolve([] as NetworkTokenBalance[])
        ).catch((err) => {
          if (__DEV__) console.error('Failed to fetch token balances:', err)
          return [] as NetworkTokenBalance[]
        })
        setBalance(nextBalance)
        setFeeUnits(nextFee)
        const nativeAsset: SendAsset = {
          type: 'native',
          symbol: network.nativeSymbol,
          name: network.shortName,
          balance: nextBalance,
          decimals: network.decimals,
          color: accentColor,
        }
        const tokenAssets = tokenBalances.map((token): SendAsset => ({
          type: 'token',
          symbol: token.symbol,
          name: token.name,
          balance: token.balance,
          decimals: token.decimals,
          color: token.logoColor,
          contractAddress: token.contractAddress,
          mintAddress: token.mintAddress,
        }))
        const nextAssets = [nativeAsset, ...tokenAssets]
        setAssets(nextAssets)
        setSelectedAsset(nativeAsset)
      } catch (err) {
        if (__DEV__) console.error('Failed to fetch native chain data:', err)
      }
    }
    load()
  }, [accentColor, address, network.decimals, network.nativeSymbol, network.shortName, networkId])

  useEffect(() => {
    let cancelled = false
    getContributionRecipients()
      .then((recipients) => {
        if (!cancelled) setContributionRecipients(recipients)
      })
      .catch((err) => {
        if (__DEV__) console.error('Failed to load contribution recipients:', err)
        if (!cancelled) setContributionRecipients(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isValidAmount = useCallback(() => {
    if (!amountUnits || amountUnits <= 0n || !donationQuote) return false
    if (isToken) {
      const hasNativeGas = feeUnits > 0n
        ? nativeBalanceUnits >= feeUnits * 2n
        : nativeBalanceUnits > 0n
      return amountUnits + donationQuote.amountUnits <= balanceUnits && hasNativeGas
    }
    if (feeUnits > 0n) return amountUnits + donationQuote.amountUnits + (feeUnits * 2n) <= balanceUnits
    return amountUnits + donationQuote.amountUnits <= balanceUnits
  }, [amountUnits, balanceUnits, donationQuote, feeUnits, isToken, nativeBalanceUnits])

  const canSend = useCallback(() => (
    isValidAddressForNetwork(networkId, recipient) && isValidAmount()
  ), [isValidAmount, networkId, recipient])

  const handleSetMax = () => {
    if (isToken) {
      const maxUnits = (balanceUnits * 1000n) / 1001n
      setAmount(formatBigIntAmount(maxUnits, activeDecimals, Math.min(activeDecimals, 8), true))
      return
    }
    const totalFeeUnits = feeUnits * 2n
    const spendableUnits = feeUnits > 0n && balanceUnits > totalFeeUnits
      ? balanceUnits - totalFeeUnits
      : balanceUnits
    setAmount(formatBigIntAmount((spendableUnits * 1000n) / 1001n, network.decimals, Math.min(network.decimals, 8), true))
  }

  const handleReview = () => {
    if (!canSend()) {
      Alert.alert(
        translate('Invalid Input'),
        translate('Please check the recipient address and amount.'),
      )
      return
    }
    Keyboard.dismiss()
    setSendState('confirming')
  }

  const handleClose = () => {
    Keyboard.dismiss()
    router.back()
  }

  const handleConfirmSend = async () => {
    if (!wallet || !activeAsset || !address) return
    setSendState('sending')
    setError(null)
    setTxHash(null)
    setDonationTxHash(null)
    try {
      let result: { txHash: string }
      let donationResult: { txHash: string } | null = null
      const normalizedAmount = amountUnits
        ? formatBigIntAmount(amountUnits, activeDecimals, activeDecimals, true)
        : amount
      if (!donationQuote) {
        throw new Error(translate('Contribution quote unavailable. Please refresh market prices and try again.', { ns: 'crypto' }))
      }
      const recordTransfer = async (txHash: string, to: string, transferAmount: string) => {
        await recordPendingCryptoTransaction({
          network: networkId,
          txHash,
          from: address,
          to,
          amount: transferAmount,
          symbol: activeSymbol,
          assetType: activeAsset.type,
          tokenIdentifier: activeAsset.contractAddress ?? activeAsset.mintAddress,
        })
      }
      if (activeAsset.type === 'token' && networkId === 'tron' && activeAsset.contractAddress) {
        const privateKey = getWalletPrivateKeyForNetwork(wallet, networkId)
        if (!privateKey) throw new Error(translate('Tron private key is not available'))
        result = await sendTrc20Transfer(
          privateKey,
          address,
          activeAsset.contractAddress,
          recipient,
          normalizedAmount,
          activeAsset.decimals,
        )
        setTxHash(result.txHash)
        await recordTransfer(result.txHash, recipient, normalizedAmount)
        donationResult = await sendTrc20Transfer(
          privateKey,
          address,
          activeAsset.contractAddress,
          donationQuote.treasuryAddress,
          donationQuote.amount,
          activeAsset.decimals,
        )
      } else if (activeAsset.type === 'token' && networkId === 'solana' && activeAsset.mintAddress) {
        const privateKey = getWalletPrivateKeyForNetwork(wallet, networkId)
        if (!privateKey) throw new Error(translate('Solana private key is not available'))
        result = await sendSplTokenTransfer(
          privateKey,
          address,
          activeAsset.mintAddress,
          recipient,
          normalizedAmount,
          activeAsset.decimals,
        )
        setTxHash(result.txHash)
        await recordTransfer(result.txHash, recipient, normalizedAmount)
        donationResult = await sendSplTokenTransfer(
          privateKey,
          address,
          activeAsset.mintAddress,
          donationQuote.treasuryAddress,
          donationQuote.amount,
          activeAsset.decimals,
        )
      } else if (networkId === 'bitcoin') {
        result = await sendNativeTransferForNetwork(networkId, wallet, recipient, normalizedAmount, {
          donation: {
            to: donationQuote.treasuryAddress,
            amount: donationQuote.amount,
          },
        })
        donationResult = result
      } else if (networkId === 'ethereum') {
        const nonce = await getEthNonce(address)
        result = await sendNativeTransferForNetwork(networkId, wallet, recipient, normalizedAmount, { nonce })
        setTxHash(result.txHash)
        await recordTransfer(result.txHash, recipient, normalizedAmount)
        donationResult = await sendNativeTransferForNetwork(networkId, wallet, donationQuote.treasuryAddress, donationQuote.amount, {
          nonce: nonce + 1n,
        })
      } else {
        result = await sendNativeTransferForNetwork(networkId, wallet, recipient, normalizedAmount)
        setTxHash(result.txHash)
        await recordTransfer(result.txHash, recipient, normalizedAmount)
        donationResult = await sendNativeTransferForNetwork(networkId, wallet, donationQuote.treasuryAddress, donationQuote.amount)
      }
      if (networkId === 'bitcoin') {
        setTxHash(result.txHash)
        setDonationTxHash(result.txHash)
        await recordTransfer(result.txHash, recipient, normalizedAmount)
      } else if (donationResult) {
        setDonationTxHash(donationResult.txHash)
        await recordTransfer(donationResult.txHash, donationQuote.treasuryAddress, donationQuote.amount)
      }
      setSendState('success')
    } catch (err) {
      if (__DEV__) console.warn('Native send error:', err)
      setError(getErrorDisplayMessage(err) || translate('Failed to send transaction'))
      setSendState('error')
    }
  }

  const handleCopyTx = async () => {
    if (!txHash) return
    await Clipboard.setStringAsync(txHash)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!wallet || !address) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6">
        <Text className="text-text text-lg text-center">{translate('This wallet does not have an account for {{network}}.', { network: network.shortName })}</Text>
      </View>
    )
  }

  if (!networkAllowed) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center px-4 py-3 border-b border-border">
          <Pressable accessibilityLabel={translate('Back')} onPress={handleClose} className="p-2 -ml-2">
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="flex-1 text-xl font-bold text-text text-center mr-10">
            {translate('Unavailable')}
          </Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <AlertCircle size={44} color={colors.error} />
          <Text className="text-text text-xl font-semibold mt-4 text-center">{translate('Unavailable in Spectre Mode')}</Text>
          <Text className="text-text-muted text-center mt-2">
            {translate(getSpectreCryptoRestrictionMessage(spectrePolicyState, networkId as SpectreCryptoNetworkId) ?? 'This crypto network is unavailable in Spectre Mode.')}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-3 border-b border-border">
        <Pressable accessibilityLabel={translate('Back')} onPress={handleClose} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-text text-center mr-10">
          {translate('Send {{symbol}}', { symbol: activeSymbol })}
        </Text>
      </View>

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 30 }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {sendState === 'input' && (
            <View className="gap-5">
              <View className="rounded-2xl p-4 border" style={{ backgroundColor: alpha(activeAccent, 0.08), borderColor: alpha(activeAccent, 0.2) }}>
                <Text className="text-text-muted text-sm">{translate('Available')}</Text>
                <Text className="text-text text-3xl font-bold mt-1">{activeBalance} {activeSymbol}</Text>
                {activeFiatLabel ? (
                  <Text className="text-text-muted text-sm mt-1">{activeFiatLabel}</Text>
                ) : null}
                <Text className="text-text-muted text-xs mt-2">{activeAsset?.name || network.name}</Text>
              </View>

              {assets.length > 1 && (
                <View>
                  <Text className="text-text font-medium mb-2">{translate('Asset')}</Text>
                  <Pressable
                    onPress={() => setShowAssetPicker((value) => !value)}
                    className="bg-surface border border-border rounded-xl px-4 py-3 flex-row items-center"
                  >
                    <View className="flex-1">
                      <Text className="text-text font-semibold">{activeAsset?.name}</Text>
                      <Text className="text-text-muted text-xs">{activeSymbol}</Text>
                    </View>
                    <View className="items-end mr-2">
                      <View className="flex-row items-baseline gap-1">
                        <Text className="text-text font-semibold">{activeBalance}</Text>
                        <Text className="text-text-muted text-[10px] uppercase">{activeSymbol}</Text>
                      </View>
                      {activeFiatLabel ? (
                        <Text className="text-text-muted text-[10px] mt-0.5">{activeFiatLabel}</Text>
                      ) : null}
                    </View>
                    <ChevronDown size={18} color={colors.textTertiary} />
                  </Pressable>
                  {showAssetPicker && (
                    <View className="gap-2 mt-2">
                      {assets.map((asset) => {
                        const assetColor = resolveExternalAccent(asset.color, network.accentName)
                        const assetFiatLabel = formatAssetFiatValue({
                          symbol: asset.symbol,
                          balance: asset.balance,
                          decimals: asset.decimals,
                          prices: marketPrices,
                          fiatCode: preferredFiatCurrency,
                        })
                        return (
                          <Pressable
                            key={`${asset.type}:${asset.contractAddress || asset.mintAddress || asset.symbol}`}
                            onPress={() => {
                              setSelectedAsset(asset)
                              setAmount('')
                              setShowAssetPicker(false)
                            }}
                            className="bg-surface rounded-xl px-4 py-3 flex-row items-center"
                            style={{ borderWidth: 1, borderColor: alpha(assetColor, 0.25) }}
                          >
                            <View className="flex-1">
                              <Text className="text-text font-semibold">{asset.name}</Text>
                              <Text className="text-text-muted text-xs">{asset.symbol}</Text>
                            </View>
                            <View className="items-end">
                              <View className="flex-row items-baseline gap-1">
                                <Text className="text-text font-semibold">{asset.balance}</Text>
                                <Text className="text-text-muted text-[10px] uppercase">{asset.symbol}</Text>
                              </View>
                              {assetFiatLabel ? (
                                <Text className="text-text-muted text-[10px] mt-0.5">{assetFiatLabel}</Text>
                              ) : null}
                            </View>
                          </Pressable>
                        )
                      })}
                    </View>
                  )}
                </View>
              )}

              <View>
                <Text className="text-text font-medium mb-2">{translate('Recipient Address')}</Text>
                <TextInput
                  value={recipient}
                  onChangeText={setRecipient}
                  placeholder={translate('{{network}} address', { network: network.shortName })}
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="bg-surface border border-border rounded-xl px-4 py-3 text-text font-mono"
                />
              </View>

              <View>
                <View className="flex-row justify-between items-center mb-2">
                  <Text className="text-text font-medium">{translate('Amount')}</Text>
                  <Pressable onPress={handleSetMax}>
                    <Text className="font-semibold" style={{ color: activeAccent }}>{translate('Max')}</Text>
                  </Pressable>
                </View>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0.0"
                  placeholderTextColor={colors.textTertiary}
                  inputAccessoryViewID={AMOUNT_KEYBOARD_ACCESSORY_ID}
                  keyboardType="decimal-pad"
                  className="bg-surface border border-border rounded-xl px-4 py-3 text-text text-xl"
                />
                <Text className="text-text-muted text-xs mt-2">
                  {translate('Estimated fee')}: {feeDisplay}
                </Text>
                {amountUnits !== null && amountUnits > 0n && !donationQuote ? (
                  <Text className="text-error text-sm mt-2">
                    {translate('Contribution quote unavailable. Please refresh market prices and try again.', { ns: 'crypto' })}
                  </Text>
                ) : null}
                {amountUnits !== null && donationQuote && (
                  isToken
                    ? amountUnits + donationQuote.amountUnits > balanceUnits
                    : amountUnits + donationQuote.amountUnits + (feeUnits * 2n) > balanceUnits
                ) ? (
                  <Text className="text-error text-sm mt-2">
                    {translate('Insufficient balance for amount, contribution, and network fees.', { ns: 'crypto' })}
                  </Text>
                ) : null}
              </View>

              {donationQuote ? (
                <DonationPreview quote={donationQuote} />
              ) : null}

              <Button
                variant="primary"
                size="lg"
                accentColor={activeAccent}
                onPress={handleReview}
                disabled={!canSend()}
                icon={<Send size={18} color="white" />}
              >
                {translate('Review Send')}
              </Button>
            </View>
          )}

          {sendState === 'confirming' && (
            <View className="gap-5">
              <View className="bg-surface rounded-2xl p-5">
                <Text className="text-text text-xl font-bold mb-4">{translate('Confirm Transaction')}</Text>
                <Text className="text-text-muted">{translate('Network')}</Text>
                <Text className="text-text font-semibold mb-3">{translate(network.name)}</Text>
                <Text className="text-text-muted">{translate('To')}</Text>
                <Text className="text-text font-mono text-xs mb-3">{recipient}</Text>
                <Text className="text-text-muted">{translate('Amount')}</Text>
                <Text className="text-text text-2xl font-bold">{amount} {activeSymbol}</Text>
                {donationQuote ? (
                  <>
                    <Text className="text-text-muted mt-3">{translate('Contribution', { ns: 'crypto' })}</Text>
                    <Text className="text-text font-semibold">{donationQuote.amount} {activeSymbol}</Text>
                    <Text className="text-text-muted text-xs mt-1">
                      {translate('A 0.1% contribution is included, capped at $10 equivalent.', { ns: 'crypto' })}
                    </Text>
                    <Text className="text-text-muted text-xs mt-3">{translate('Contribution Treasury', { ns: 'crypto' })}</Text>
                    <Text className="text-text font-mono text-xs">{donationQuote.treasuryAddress}</Text>
                  </>
                ) : null}
                <View className="h-px bg-border my-3" />
                <View className="flex-row justify-between">
                  <Text className="text-text font-semibold">{translate('Total')}</Text>
                  <Text className="text-text font-semibold">
                    {formatBigIntAmount((amountUnits ?? 0n) + (donationQuote?.amountUnits ?? 0n) + (isToken ? 0n : feeUnits * 2n), activeDecimals, Math.min(activeDecimals, 8), true)} {activeSymbol}
                  </Text>
                </View>
              </View>
              <Button variant="primary" size="lg" accentColor={activeAccent} onPress={handleConfirmSend}>
                {translate('Confirm & Send')}
              </Button>
              <Button variant="secondary" size="lg" onPress={() => setSendState('input')}>
                {translate('Back')}
              </Button>
            </View>
          )}

          {sendState === 'sending' && (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color={activeAccent} />
              <Text className="text-text mt-4">{translate('Sending transaction...')}</Text>
            </View>
          )}

          {sendState === 'success' && txHash && (
            <View className="flex-1 items-center justify-center gap-5">
              <View className="w-20 h-20 rounded-full items-center justify-center" style={{ backgroundColor: alpha(activeAccent, 0.18) }}>
                <Check size={40} color={activeAccent} />
              </View>
              <Text className="text-text text-2xl font-bold">{translate('Transaction Sent')}</Text>
              <Text className="text-text-muted text-center">{amount} {activeSymbol}</Text>
              {donationTxHash ? (
                <Text className="text-text-muted text-center">
                  {translate('Contribution included', { ns: 'crypto' })}
                </Text>
              ) : null}
              <View className="bg-surface rounded-xl p-3 w-full">
                <Text className="text-text-muted text-xs mb-1">{translate('Transaction Hash')}</Text>
                <Text className="text-text font-mono text-xs" numberOfLines={2}>{txHash}</Text>
                {donationTxHash && donationTxHash !== txHash ? (
                  <>
                    <Text className="text-text-muted text-xs mt-3 mb-1">{translate('Contribution Transaction Hash', { ns: 'crypto' })}</Text>
                    <Text className="text-text font-mono text-xs" numberOfLines={2}>{donationTxHash}</Text>
                  </>
                ) : null}
              </View>
              <View className="flex-row gap-3">
                <Button variant="secondary" onPress={handleCopyTx} icon={copied ? <Check size={16} color={activeAccent} /> : <Copy size={16} color={colors.text} />}>
                  {copied ? translate('Copied') : translate('Copy TX')}
                </Button>
                <Button variant="secondary" onPress={() => openExternalUrl(getExplorerTxUrl(networkId, txHash))} icon={<ExternalLink size={16} color={colors.text} />}>
                  {translate('Explorer')}
                </Button>
              </View>
              <Button variant="primary" size="lg" accentColor={activeAccent} onPress={handleClose}>
                {translate('Done')}
              </Button>
            </View>
          )}

          {sendState === 'pending' && txHash && (
            <View className="flex-1 items-center justify-center gap-5">
              <View className="w-20 h-20 rounded-full items-center justify-center" style={{ backgroundColor: alpha(activeAccent, 0.18) }}>
                <AlertCircle size={40} color={activeAccent} />
              </View>
              <Text className="text-text text-2xl font-bold">{translate('Transaction Submitted')}</Text>
              <Text className="text-text-muted text-center">
                {translate('The transaction was broadcast but is not confirmed yet. Check the transaction hash before sending again.')}
              </Text>
              <Text className="text-text-muted text-center">{amount} {activeSymbol}</Text>
              <View className="flex-row gap-3">
                <Button variant="secondary" onPress={handleCopyTx} icon={copied ? <Check size={16} color={activeAccent} /> : <Copy size={16} color={colors.text} />}>
                  {copied ? translate('Copied') : translate('Copy TX')}
                </Button>
                <Button variant="secondary" onPress={() => openExternalUrl(getExplorerTxUrl(networkId, txHash))} icon={<ExternalLink size={16} color={colors.text} />}>
                  {translate('Explorer')}
                </Button>
              </View>
              <Button variant="primary" size="lg" accentColor={activeAccent} onPress={handleClose}>
                {translate('Done')}
              </Button>
            </View>
          )}

          {sendState === 'error' && (
            <View className="flex-1 items-center justify-center gap-5">
              <Text className="text-error text-xl font-bold">{translate('Transaction Failed')}</Text>
              <Text className="text-text-muted text-center">{error}</Text>
              <Button
                variant="primary"
                size="lg"
                accentColor={activeAccent}
                onPress={() => {
                  setTxHash(null)
                  setDonationTxHash(null)
                  setSendState('input')
                }}
              >
                {translate('Try Again')}
              </Button>
            </View>
          )}
        </ScrollView>
        <KeyboardDoneAccessory nativeID={AMOUNT_KEYBOARD_ACCESSORY_ID} />
      </KeyboardAvoidingView>
    </View>
  )
}
