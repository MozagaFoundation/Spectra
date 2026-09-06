/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  Keyboard,
  ScrollView,
  Modal,
  FlatList,
  Image,
} from 'react-native'
import { KeyboardAvoidingView } from '@/components/ui/KeyboardAvoidingView'
import { KeyboardDoneAccessory } from '@/components/ui/KeyboardDoneAccessory'
import { useRouter } from 'expo-router'
import { ChevronLeft, ChevronDown, Send, AlertCircle, Check, Copy, ExternalLink } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUIStore, useWalletStore } from '@/store'
import { useSpectreStore } from '@/store/spectreStore'
import {
  getEthBalance,
  getEthNonce,
  getGasPrice,
  estimateGas,
  getDonationTransferQuote,
  sendEthTransfer,
  sendERC20Transfer,
  getAllTokenBalances,
  recordPendingCryptoTransaction,
  isValidEthAddress,
  formatEthAddress,
  type DonationTransferQuote,
} from '@/services/crypto'
import { Button } from '@/components/ui'
import { getStartBorderStyle, getStartPaddingStyle, isCurrentLanguageRtl } from '@/lib/i18n/direction'
import { translate } from '@/lib/i18n'
import { CRYPTO_BRAND_ACCENTS, useCryptoTheme } from '@/lib/cryptoTheme'
import { useMarketPrices } from '@/hooks/useMarketPrices'
import { getContributionRecipients, type VerifiedContributionRecipients } from '@/services/backend/contributionRecipients'
import { formatAssetFiatValue } from '@/services/crypto/fiatValuation'
import { formatBigIntAmount, parseDecimalToBigInt } from '@/lib/amounts'
import {
  canUseCryptoNetworkInSpectre,
  getSpectreCryptoRestrictionMessage,
  type SpectreCryptoNetworkId,
} from '@/lib/spectrePolicy'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { openExternalUrl } from '@/services/tor/externalLinkPolicy'

const ethLogo = process.env.NODE_ENV === 'test'
  ? 1
  : require('../../../assets/images/logos/eth-diamond-color.png')
const AMOUNT_KEYBOARD_ACCESSORY_ID = 'send-eth-amount-keyboard'

type SendState = 'input' | 'confirming' | 'sending' | 'success' | 'pending' | 'error'

const ETH_TRANSFER_GAS = BigInt(21000)
const ERC20_GAS_ESTIMATE_FALLBACK = BigInt(65000)
const ETH_MAX_SEND_BUFFER_WEI = parseDecimalToBigInt('0.0001', 18) ?? 0n

interface SelectedAsset {
  type: 'eth' | 'token'
  symbol: string
  name: string
  balance: string
  decimals: number
  logoColor: string
  contractAddress?: string
}

const ETH_ASSET: SelectedAsset = {
  type: 'eth',
  symbol: 'ETH',
  name: 'Ether',
  balance: '0.0',
  decimals: 18,
  logoColor: CRYPTO_BRAND_ACCENTS.ethereum,
}

function DonationPreview({ quote }: { quote: DonationTransferQuote }) {
  return (
    <View className="bg-surface rounded-xl p-3 mb-6">
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

export default function SendEthScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { wallet } = useWalletStore()
  const preferredFiatCurrency = useUIStore((state) => state.preferredFiatCurrency)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const spectreAccountMode = useSpectreStore((state) => state.spectreAccountMode)
  const { colors, accent, alpha, resolveExternalAccent } = useCryptoTheme()
  const { data: marketPrices } = useMarketPrices()
  const isRtl = isCurrentLanguageRtl()

  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset>(ETH_ASSET)
  const [availableAssets, setAvailableAssets] = useState<SelectedAsset[]>([ETH_ASSET])
  const [showAssetPicker, setShowAssetPicker] = useState(false)

  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [ethBalance, setEthBalance] = useState('0.0')
  const [, setGasPrice] = useState<bigint>(0n)
  const [gasFeeWei, setGasFeeWei] = useState<bigint>(0n)
  const [sendState, setSendState] = useState<SendState>('input')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [donationTxHash, setDonationTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [contributionRecipients, setContributionRecipients] = useState<VerifiedContributionRecipients | null>(null)

  const isToken = selectedAsset.type === 'token'
  const ethereumAccent = accent('ethereum')
  const selectedAssetAccent = resolveExternalAccent(selectedAsset.logoColor, 'ethereum')
  const amountUnits = parseDecimalToBigInt(amount, selectedAsset.decimals)
  const selectedAssetBalanceUnits = parseDecimalToBigInt(selectedAsset.balance, selectedAsset.decimals) ?? 0n
  const ethBalanceUnits = parseDecimalToBigInt(ethBalance, 18) ?? 0n
  const selectedAssetFiatLabel = formatAssetFiatValue({
    symbol: selectedAsset.symbol,
    balance: selectedAsset.balance,
    decimals: selectedAsset.decimals,
    prices: marketPrices,
    fiatCode: preferredFiatCurrency,
  })
  const donationQuote = getDonationTransferQuote({
    networkId: 'ethereum',
    symbol: selectedAsset.symbol,
    decimals: selectedAsset.decimals,
    amountUnits,
    prices: marketPrices,
    recipients: contributionRecipients?.recipients,
  })
  const spectrePolicyState = useMemo(() => ({
    enabled: spectreEnabled,
    accountMode: spectreAccountMode,
    walletIsSpectre: wallet?.spectreMode === true,
  }), [spectreAccountMode, spectreEnabled, wallet?.spectreMode])
  const ethereumAllowed = canUseCryptoNetworkInSpectre(spectrePolicyState, 'ethereum' as SpectreCryptoNetworkId)

  useEffect(() => {
    const fetchData = async () => {
      if (!wallet?.ethereumAddress) return
      try {
        const [bal, gp, tokens] = await Promise.all([
          getEthBalance(wallet.ethereumAddress),
          getGasPrice(),
          getAllTokenBalances(wallet.ethereumAddress),
        ])

        setEthBalance(bal)
        setGasPrice(gp)

        const fee = gp * ETH_TRANSFER_GAS
        setGasFeeWei(fee)

        const ethAsset: SelectedAsset = { ...ETH_ASSET, balance: bal }
        const tokenAssets: SelectedAsset[] = tokens.map((t) => ({
          type: 'token' as const,
          symbol: t.symbol,
          name: t.name,
          balance: t.balance,
          decimals: t.decimals,
          logoColor: t.logoColor,
          contractAddress: t.address,
        }))

        const all = [ethAsset, ...tokenAssets]
        setAvailableAssets(all)
        setSelectedAsset(ethAsset)
      } catch (err) {
        if (__DEV__) console.warn('Failed to fetch ETH data:', err)
      }
    }
    fetchData()
  }, [wallet?.ethereumAddress])

  useEffect(() => {
    let cancelled = false
    getContributionRecipients()
      .then((recipients) => {
        if (!cancelled) setContributionRecipients(recipients)
      })
      .catch((err) => {
        if (__DEV__) console.warn('Failed to load contribution recipients:', err)
        if (!cancelled) setContributionRecipients(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const updateGasFee = useCallback(async (asset: SelectedAsset): Promise<bigint> => {
    try {
      const gp = await getGasPrice()
      setGasPrice(gp)
      const gasLimit = asset.type === 'token' ? ERC20_GAS_ESTIMATE_FALLBACK : ETH_TRANSFER_GAS
      const fee = gp * gasLimit
      setGasFeeWei(fee)
      return fee
    } catch {
      return gasFeeWei
    }
  }, [gasFeeWei])

  const isValidAmount = useCallback(() => {
    if (!amountUnits || amountUnits <= 0n || !donationQuote) {
      return false
    }

    if (isToken) {
      return amountUnits + donationQuote.amountUnits <= selectedAssetBalanceUnits && ethBalanceUnits >= gasFeeWei * 2n
    }

    return amountUnits + donationQuote.amountUnits + (gasFeeWei * 2n) <= ethBalanceUnits
  }, [amountUnits, donationQuote, ethBalanceUnits, gasFeeWei, isToken, selectedAssetBalanceUnits])

  const canSend = useCallback(() => {
    return isValidEthAddress(recipient) && isValidAmount()
  }, [recipient, isValidAmount])

  const handleSelectAsset = (asset: SelectedAsset) => {
    setSelectedAsset(asset)
    setAmount('')
    setShowAssetPicker(false)
    updateGasFee(asset)
  }

  const handleSetMax = () => {
    if (isToken) {
      const maxUnits = (selectedAssetBalanceUnits * 1000n) / 1001n
      setAmount(formatBigIntAmount(maxUnits, selectedAsset.decimals, Math.min(selectedAsset.decimals, 8), true))
    } else {
      const reservedWei = (gasFeeWei * 2n) + ETH_MAX_SEND_BUFFER_WEI
      const maxAmountWei = ethBalanceUnits > reservedWei
        ? ((ethBalanceUnits - reservedWei) * 1000n) / 1001n
        : ethBalanceUnits > gasFeeWei * 2n
          ? ((ethBalanceUnits - (gasFeeWei * 2n)) * 1000n) / 1001n
          : 0n
      setAmount(formatBigIntAmount(maxAmountWei, 18, 6, true))
    }
  }

  const handleReview = async () => {
    if (!canSend()) {
      Alert.alert(
        translate('Invalid Input'),
        translate('Please check the recipient address and amount.'),
      )
      return
    }
    Keyboard.dismiss()

    if (isToken && wallet?.ethereumAddress && selectedAsset.contractAddress) {
      try {
        const gp = await getGasPrice()
        setGasPrice(gp)
        const padded = recipient.toLowerCase().replace('0x', '').padStart(64, '0')
        const amountBig = parseDecimalToBigInt(amount, selectedAsset.decimals)
        if (!amountBig || amountBig <= 0n) {
          throw new Error(translate('Invalid token amount'))
        }
        const amountHex = amountBig.toString(16).padStart(64, '0')
        const calldata = '0xa9059cbb' + padded + amountHex

        const estimated = await estimateGas({
          from: wallet.ethereumAddress,
          to: selectedAsset.contractAddress,
          data: calldata,
        })
        const gasWithBuffer = (estimated * 120n) / 100n
        const fee = gp * gasWithBuffer
        setGasFeeWei(fee)
        if (ethBalanceUnits < fee * 2n) {
          Alert.alert(
            translate('Insufficient ETH balance for gas'),
            translate('Add ETH before sending this token.'),
          )
          return
        }
      } catch {
        const fallbackFee = await updateGasFee(selectedAsset)
        if (ethBalanceUnits < fallbackFee * 2n) {
          Alert.alert(
            translate('Insufficient ETH balance for gas'),
            translate('Add ETH before sending this token.'),
          )
          return
        }
      }
    } else {
      const fee = await updateGasFee(selectedAsset)
      if (!amountUnits || !donationQuote || amountUnits + donationQuote.amountUnits + (fee * 2n) > ethBalanceUnits) {
        Alert.alert(
          translate('Insufficient balance', { ns: 'crypto' }),
          translate('Insufficient balance for amount, contribution, and network fees.', { ns: 'crypto' }),
        )
        return
      }
    }

    setSendState('confirming')
  }

  const handleConfirmSend = async () => {
    if (!wallet?.ethereumPrivateKey || !wallet.ethereumAddress) return
    const privateKey = wallet.ethereumPrivateKey
    const fromAddress = wallet.ethereumAddress

    setSendState('sending')
    setError(null)
    setTxHash(null)
    setDonationTxHash(null)

    try {
      let result: { txHash: string }
      let donationResult: { txHash: string }
      const normalizedAmount = amountUnits
        ? formatBigIntAmount(amountUnits, selectedAsset.decimals, selectedAsset.decimals, true)
        : amount
      if (!donationQuote) {
        throw new Error(translate('Contribution quote unavailable. Please refresh market prices and try again.', { ns: 'crypto' }))
      }
      const nonce = await getEthNonce(fromAddress)
      const recordMainTransfer = async (txHash: string) => {
        setTxHash(txHash)
        await recordPendingCryptoTransaction({
          network: 'ethereum',
          txHash,
          from: fromAddress,
          to: recipient,
          amount: normalizedAmount,
          symbol: selectedAsset.symbol,
          assetType: isToken ? 'token' : 'native',
          tokenIdentifier: selectedAsset.contractAddress,
        })
      }

      if (isToken && selectedAsset.contractAddress) {
        result = await sendERC20Transfer(
          privateKey,
          fromAddress,
          selectedAsset.contractAddress,
          recipient,
          normalizedAmount,
          selectedAsset.decimals,
          { nonce },
        )
        await recordMainTransfer(result.txHash)
        donationResult = await sendERC20Transfer(
          privateKey,
          fromAddress,
          selectedAsset.contractAddress,
          donationQuote.treasuryAddress,
          donationQuote.amount,
          selectedAsset.decimals,
          { nonce: nonce + 1n },
        )
      } else {
        result = await sendEthTransfer(
          privateKey,
          fromAddress,
          recipient,
          normalizedAmount,
          { nonce },
        )
        await recordMainTransfer(result.txHash)
        donationResult = await sendEthTransfer(
          privateKey,
          fromAddress,
          donationQuote.treasuryAddress,
          donationQuote.amount,
          { nonce: nonce + 1n },
        )
      }

      setDonationTxHash(donationResult.txHash)
      await recordPendingCryptoTransaction({
        network: 'ethereum',
        txHash: donationResult.txHash,
        from: fromAddress,
        to: donationQuote.treasuryAddress,
        amount: donationQuote.amount,
        symbol: selectedAsset.symbol,
        assetType: isToken ? 'token' : 'native',
        tokenIdentifier: selectedAsset.contractAddress,
      })
      setSendState('success')
    } catch (err) {
      if (__DEV__) console.error('ETH send error:', err)
      setError(getErrorDisplayMessage(err) || translate('Failed to send transaction'))
      setSendState('error')
    }
  }

  const [txHashCopied, setTxHashCopied] = useState(false)

  const handleClose = () => {
    Keyboard.dismiss()
    router.back()
  }
  const handleTryAgain = () => {
    setSendState('input')
    setError(null)
    setTxHash(null)
    setDonationTxHash(null)
  }

  const handleCopyTxHash = async () => {
    if (txHash) {
      await Clipboard.setStringAsync(txHash)
      setTxHashCopied(true)
      setTimeout(() => setTxHashCopied(false), 2000)
    }
  }

  const handleViewOnEtherscan = () => {
    if (txHash) {
      void openExternalUrl(`https://etherscan.io/tx/${txHash}`)
    }
  }

  const displaySymbol = selectedAsset.symbol

  if (!ethereumAllowed) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View className="flex-row items-center gap-3 px-5 pb-4">
          <Pressable
            onPress={handleClose}
            className="w-10 h-10 rounded-xl items-center justify-center active:opacity-70"
            style={{ backgroundColor: colors.surface }}
          >
            <ChevronLeft size={22} color={colors.text} />
          </Pressable>
          <Text className="flex-1 text-2xl font-bold text-text">{translate('Send ETH')}</Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <AlertCircle size={44} color={colors.error} />
          <Text className="text-text text-xl font-semibold mt-4 text-center">{translate('Unavailable in Spectre Mode')}</Text>
          <Text className="text-text-muted text-center mt-2">
            {translate(getSpectreCryptoRestrictionMessage(spectrePolicyState, 'ethereum') ?? 'This crypto network is unavailable in Spectre Mode.')}
          </Text>
        </View>
      </View>
    )
  }

  if (sendState === 'success') {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-5">
          <View className="w-20 h-20 rounded-full bg-success/20 items-center justify-center mb-6">
            <Check size={40} color={colors.success} />
          </View>
          <Text className="text-2xl font-bold text-text mb-2">{translate('Transaction Sent')}</Text>
          <Text className="text-text-muted text-center mb-6">
            {translate('{{amount}} {{symbol}} sent to {{recipient}}', {
              amount,
              symbol: displaySymbol,
              recipient: formatEthAddress(recipient, 6),
            })}
          </Text>
          {txHash && (
            <View className="w-full mb-6">
              <View className="bg-surface rounded-xl p-4 mb-3">
                <Text className="text-text-muted text-sm mb-1">{translate('Transaction Hash')}</Text>
                <Text className="text-text font-mono text-xs" selectable numberOfLines={2}>
                  {txHash}
                </Text>
              </View>
              <View className="flex-row gap-3">
                <Pressable
                  onPress={handleCopyTxHash}
                  className="flex-1 flex-row items-center justify-center gap-2 bg-surface border border-border py-3 rounded-xl active:bg-surface-hover"
                >
                  {txHashCopied ? (
                    <Check size={16} color={colors.success} />
                  ) : (
                    <Copy size={16} color={colors.text} />
                  )}
                  <Text className="text-text font-semibold text-sm">
                    {txHashCopied ? translate('Copied!') : translate('Copy Hash')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleViewOnEtherscan}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl active:opacity-80"
                  style={{ backgroundColor: ethereumAccent }}
                >
                  <ExternalLink size={16} color="white" />
                  <Text className="text-white font-semibold text-sm">{translate('Etherscan', { ns: 'crypto' })}</Text>
                </Pressable>
              </View>
            </View>
          )}
          {donationTxHash && (
            <View className="w-full mb-6">
              <View className="bg-surface rounded-xl p-4">
                <Text className="text-text-muted text-sm mb-1">{translate('Contribution Transaction Hash', { ns: 'crypto' })}</Text>
                <Text className="text-text font-mono text-xs" selectable numberOfLines={2}>
                  {donationTxHash}
                </Text>
              </View>
            </View>
          )}
          <Button variant="primary" size="lg" fullWidth onPress={handleClose}>
            {translate('Done')}
          </Button>
        </View>
      </View>
    )
  }

  if (sendState === 'pending') {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-5">
          <View className="w-20 h-20 rounded-full bg-warning/20 items-center justify-center mb-6">
            <AlertCircle size={40} color={colors.warning} />
          </View>
          <Text className="text-2xl font-bold text-text mb-2">{translate('Transaction Submitted')}</Text>
          <Text className="text-text-muted text-center mb-6">
            {translate('The transaction was broadcast but is not confirmed yet. Check the transaction hash before sending again.')}
          </Text>
          {txHash && (
            <View className="w-full mb-6">
              <View className="bg-surface rounded-xl p-4 mb-3">
                <Text className="text-text-muted text-sm mb-1">{translate('Transaction Hash')}</Text>
                <Text className="text-text font-mono text-xs" selectable numberOfLines={2}>
                  {txHash}
                </Text>
              </View>
            </View>
          )}
          <Button variant="primary" size="lg" fullWidth onPress={handleClose}>
            {translate('Done')}
          </Button>
        </View>
      </View>
    )
  }

  if (sendState === 'error') {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-5">
          <View className="w-20 h-20 rounded-full bg-error/20 items-center justify-center mb-6">
            <AlertCircle size={40} color={colors.error} />
          </View>
          <Text className="text-2xl font-bold text-text mb-2">{translate('Transaction Failed')}</Text>
          <Text className="text-text-muted text-center mb-6">
            {error || translate('Something went wrong. Please try again.')}
          </Text>
          <View className="w-full gap-3">
            <Button variant="primary" size="lg" fullWidth onPress={handleTryAgain}>
              {translate('Try Again')}
            </Button>
            <Button variant="secondary" size="lg" fullWidth onPress={handleClose}>
              {translate('Cancel')}
            </Button>
          </View>
        </View>
      </View>
    )
  }

  if (sendState === 'sending') {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-5">
          <ActivityIndicator size="large" color={ethereumAccent} />
          <Text className="text-xl font-semibold text-text mt-6 mb-2">{translate('Sending Transaction')}</Text>
          <Text className="text-text-muted text-center">
            {translate('Broadcasting to Ethereum Mainnet...')}
          </Text>
        </View>
      </View>
    )
  }

  if (sendState === 'confirming') {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View className="flex-row items-center px-4 py-3">
          <Pressable onPress={() => setSendState('input')} className="p-2 -ml-2">
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="flex-1 text-xl font-bold text-text text-center mr-10">
            {translate('Confirm Send')}
          </Text>
        </View>

        <View className="flex-1 px-5 pt-6">
          <View className="items-center mb-8">
            <View
              className="w-14 h-14 rounded-full items-center justify-center mb-3"
              style={{ backgroundColor: alpha(selectedAssetAccent, 0.12) }}
            >
              <Text style={{ color: selectedAssetAccent, fontSize: 22, fontWeight: '700' }}>
                {displaySymbol[0]}
              </Text>
            </View>
            <Text className="text-4xl font-bold text-text mb-1">
              {amount} {displaySymbol}
            </Text>
            <Text className="text-text-muted">{translate('Sending to')}</Text>
          </View>

          <View className="bg-surface rounded-2xl p-4 mb-6">
            <Text className="text-text-muted text-sm mb-2">{translate('Recipient Address')}</Text>
            <Text className="text-text font-mono text-sm" numberOfLines={2}>
              {recipient}
            </Text>
          </View>

          <View className="bg-surface rounded-2xl p-4 mb-6">
            <View className="flex-row justify-between mb-2">
              <Text className="text-text-muted">{translate('Amount')}</Text>
              <Text className="text-text">{amount} {displaySymbol}</Text>
            </View>
            {isToken && (
              <View className="flex-row justify-between mb-2">
                <Text className="text-text-muted">{translate('Token Contract')}</Text>
                <Text className="text-text font-mono text-xs">
                  {formatEthAddress(selectedAsset.contractAddress || '', 4)}
                </Text>
              </View>
            )}
            <View className="flex-row justify-between mb-2">
              <Text className="text-text-muted">{translate('Gas Fee (est.)')}</Text>
              <Text className="text-text">~{formatBigIntAmount(gasFeeWei * 2n, 18, 6, true)} ETH</Text>
            </View>
            {donationQuote && (
              <View className="flex-row justify-between mb-2">
                <Text className="text-text-muted">{translate('Contribution', { ns: 'crypto' })}</Text>
                <Text className="text-text">{donationQuote.amount} {displaySymbol}</Text>
              </View>
            )}
            {donationQuote && (
              <View className="mb-2">
                <Text className="text-text-muted text-xs">{translate('Contribution Treasury', { ns: 'crypto' })}</Text>
                <Text className="text-text font-mono text-xs" numberOfLines={2}>
                  {donationQuote.treasuryAddress}
                </Text>
              </View>
            )}
            {donationQuote && (
              <Text className="text-text-muted text-xs mb-2">
                {translate('A 0.1% contribution is included, capped at $10 equivalent.', { ns: 'crypto' })}
              </Text>
            )}
            <View className="h-px bg-border my-2" />
            {isToken ? (
              <>
                <View className="flex-row justify-between mb-1">
                  <Text className="text-text font-semibold">{translate('Send')}</Text>
                  <Text className="text-text font-semibold">{amount} {displaySymbol}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-text-muted text-sm">{translate('+ gas paid in')}</Text>
                  <Text className="text-text-muted text-sm">~{formatBigIntAmount(gasFeeWei * 2n, 18, 6, true)} ETH</Text>
                </View>
              </>
            ) : (
              <View className="flex-row justify-between">
                <Text className="text-text font-semibold">{translate('Total')}</Text>
                <Text className="text-text font-semibold">
                  ~{formatBigIntAmount((amountUnits ?? 0n) + (donationQuote?.amountUnits ?? 0n) + (gasFeeWei * 2n), 18, 6)} ETH
                </Text>
              </View>
            )}
          </View>

          <View
            className="border rounded-xl p-4 mb-6"
            style={{ backgroundColor: alpha(colors.warning, 0.1), borderColor: alpha(colors.warning, 0.3) }}
          >
            <View className="flex-row items-start gap-3">
              <AlertCircle size={20} color={colors.warning} />
              <Text className="text-sm flex-1" style={{ color: colors.warning }}>
                {translate('This is Ethereum Mainnet. Transactions use real ETH for gas and cannot be reversed once confirmed.')}
              </Text>
            </View>
          </View>

          <View className="gap-3 mt-auto mb-6">
            <Pressable
              onPress={handleConfirmSend}
              className="flex-row items-center justify-center gap-2 py-4 rounded-xl active:opacity-80"
              style={{ backgroundColor: ethereumAccent }}
            >
              <Text className="text-white font-semibold text-lg">{translate('Confirm & Send')}</Text>
            </Pressable>
            <Button variant="secondary" size="lg" fullWidth onPress={() => setSendState('input')}>
              {translate('Cancel')}
            </Button>
          </View>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}
    >
      <View className="flex-row items-center px-4 py-3">
        <Pressable accessibilityLabel={translate('Back')} onPress={handleClose} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-text text-center mr-10">
          {translate('Send')}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingTop: 20, paddingBottom: 30 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-6">
          <Text className="text-text font-medium mb-2">{translate('Asset')}</Text>
          <Pressable
            onPress={() => setShowAssetPicker(true)}
            className="bg-surface rounded-xl p-4 flex-row items-center active:bg-surface-hover"
          >
            <View
              className="w-10 h-10 rounded-full items-center justify-center mr-3"
              style={{ backgroundColor: alpha(selectedAssetAccent, 0.12) }}
            >
              <Text style={{ color: selectedAssetAccent, fontSize: 16, fontWeight: '700' }}>
                {displaySymbol[0]}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-text font-semibold">{displaySymbol}</Text>
              <Text className="text-text-muted text-xs">{selectedAsset.name}</Text>
            </View>
            <View className="items-end mr-2">
              <Text className="text-text text-sm">{selectedAsset.balance} {displaySymbol}</Text>
              {selectedAssetFiatLabel ? (
                <Text className="text-text-muted text-[10px] mt-0.5">{selectedAssetFiatLabel}</Text>
              ) : null}
            </View>
            <ChevronDown size={18} color={colors.textTertiary} />
          </Pressable>
        </View>

        {isToken && (
          <View
            className="rounded-xl p-3 mb-6 flex-row items-center gap-2"
            style={{ backgroundColor: alpha(ethereumAccent, 0.08) }}
          >
            <Image source={ethLogo} style={{ width: 14, height: 14, tintColor: ethereumAccent }} resizeMode="contain" />
            <Text className="text-text-muted text-xs flex-1">
              {translate('Gas paid in ETH. Balance: {{balance}} ETH', { balance: ethBalance })}
            </Text>
          </View>
        )}

        <View className="mb-6">
          <Text className="text-text font-medium mb-2">{translate('Recipient Address')}</Text>
          <View className="bg-surface rounded-xl flex-row items-center">
            <TextInput
              className="flex-1 text-text p-4 font-mono"
              placeholder="0x..."
              placeholderTextColor={colors.textMuted}
              value={recipient}
              onChangeText={setRecipient}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {recipient.length > 0 && !isValidEthAddress(recipient) && (
            <Text className="text-error text-sm mt-2">{translate('Invalid Ethereum address')}</Text>
          )}
        </View>

        <View className="mb-6">
          <Text className="text-text font-medium mb-2">{translate('Amount')}</Text>
          <View className="bg-surface rounded-xl flex-row items-center">
            <TextInput
              className="flex-1 text-text p-4 text-lg"
              placeholder="0.0"
              placeholderTextColor={colors.textMuted}
              value={amount}
              onChangeText={setAmount}
              inputAccessoryViewID={AMOUNT_KEYBOARD_ACCESSORY_ID}
              keyboardType="decimal-pad"
            />
            <View className="flex-row items-center gap-2 pr-4">
              <Pressable
                onPress={handleSetMax}
                className="px-3 py-1 rounded-lg"
                style={{ backgroundColor: alpha(selectedAssetAccent, 0.2) }}
              >
                <Text className="text-sm font-medium" style={{ color: selectedAssetAccent }}>
                  {translate('MAX')}
                </Text>
              </Pressable>
              <Text className="text-text-muted">{displaySymbol}</Text>
            </View>
          </View>
          {amountUnits !== null && amountUnits > 0n && !donationQuote && (
            <Text className="text-error text-sm mt-2">
              {translate('Contribution quote unavailable. Please refresh market prices and try again.', { ns: 'crypto' })}
            </Text>
          )}
          {amountUnits !== null && donationQuote && amountUnits + donationQuote.amountUnits > selectedAssetBalanceUnits && (
            <Text className="text-error text-sm mt-2">
              {translate('Insufficient {{symbol}} balance', { symbol: displaySymbol })}
            </Text>
          )}
          {!isToken && amountUnits !== null && donationQuote && amountUnits + donationQuote.amountUnits + (gasFeeWei * 2n) > ethBalanceUnits && (
            <Text className="text-error text-sm mt-2">
              {translate('Insufficient balance for amount, contribution, and network fees.', { ns: 'crypto' })}
            </Text>
          )}
          {isToken && gasFeeWei > 0n && ethBalanceUnits < gasFeeWei * 2n && (
            <Text className="text-error text-sm mt-2">{translate('Insufficient ETH balance for gas')}</Text>
          )}
        </View>

        {donationQuote && (
          <DonationPreview quote={donationQuote} />
        )}

        <View className="bg-surface rounded-xl p-3 mb-6">
          <View className="flex-row justify-between">
            <Text className="text-text-muted text-sm">{translate('Estimated Gas Fee')}</Text>
            <Text className="text-text text-sm">~{formatBigIntAmount(gasFeeWei * 2n, 18, 6, true)} ETH</Text>
          </View>
        </View>

        <Pressable
          onPress={handleReview}
          disabled={!canSend()}
          className="flex-row items-center justify-center gap-2 py-4 rounded-xl active:opacity-80"
          style={{ backgroundColor: canSend() ? ethereumAccent : alpha(ethereumAccent, 0.5) }}
        >
          <Send size={20} color="white" />
          <Text className="text-white font-semibold text-lg">{translate('Review Transaction')}</Text>
        </Pressable>
      </ScrollView>
      <KeyboardDoneAccessory nativeID={AMOUNT_KEYBOARD_ACCESSORY_ID} />

      <Modal
        visible={showAssetPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAssetPicker(false)}
      >
        <Pressable
          className="flex-1 bg-black/60"
          onPress={() => setShowAssetPicker(false)}
        />
        <View
          className="bg-background border-t border-border rounded-t-3xl"
          style={{ paddingBottom: insets.bottom + 16 }}
        >
          <View className="px-5 pt-5 pb-3">
            <View className="w-10 h-1 bg-border rounded-full self-center mb-4" />
            <Text className="text-text text-lg font-bold">{translate('Select Asset')}</Text>
          </View>
          <FlatList
            data={availableAssets}
            keyExtractor={(item) => item.contractAddress || 'eth'}
            style={{ maxHeight: 350 }}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            renderItem={({ item }) => {
              const itemAccent = resolveExternalAccent(item.logoColor, 'ethereum')
              const itemFiatLabel = formatAssetFiatValue({
                symbol: item.symbol,
                balance: item.balance,
                decimals: item.decimals,
                prices: marketPrices,
                fiatCode: preferredFiatCurrency,
              })
              const isSelected =
                item.type === selectedAsset.type &&
                item.contractAddress === selectedAsset.contractAddress
              return (
                <Pressable
                  onPress={() => handleSelectAsset(item)}
                  className="flex-row items-center py-4 active:opacity-70"
                  style={
                    isSelected
                      ? { ...getStartBorderStyle(itemAccent, 3, isRtl), ...getStartPaddingStyle(12, isRtl) }
                      : getStartPaddingStyle(15, isRtl)
                  }
                >
                  <View
                    className="w-10 h-10 rounded-full items-center justify-center mr-3"
                    style={{ backgroundColor: alpha(itemAccent, 0.12) }}
                  >
                    <Text style={{ color: itemAccent, fontSize: 16, fontWeight: '700' }}>
                      {item.symbol[0]}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-text font-semibold">{item.symbol}</Text>
                    <Text className="text-text-muted text-xs">{item.name}</Text>
                  </View>
                  <View className="items-end">
                    <View className="flex-row items-baseline gap-1">
                      <Text className="text-text text-sm font-medium">
                        {item.balance}
                      </Text>
                      <Text className="text-text-muted text-[10px] uppercase">{item.symbol}</Text>
                    </View>
                    {itemFiatLabel ? (
                      <Text className="text-text-muted text-[10px] mt-0.5">{itemFiatLabel}</Text>
                    ) : null}
                  </View>
                </Pressable>
              )
            }}
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: colors.border + '80' }} />
            )}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}
