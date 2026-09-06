/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Image,
} from 'react-native'
import { KeyboardAvoidingView } from '@/components/ui/KeyboardAvoidingView'
import { useTranslation } from 'react-i18next'
import {
  X,
  Send,
  Check,
  AlertCircle,
  ChevronLeft,
  Coins,
  ArrowUpRight,
  Copy,
  ExternalLink,
  ChevronDown,
} from 'lucide-react-native'
import { useQueryClient } from '@tanstack/react-query'
import * as Clipboard from 'expo-clipboard'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUIStore, useWalletStore } from '@/store'
import { useSpectreStore } from '@/store/spectreStore'
import { CRYPTO_BRAND_ACCENTS, useCryptoTheme } from '@/lib/cryptoTheme'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { translate } from '@/lib/i18n'
import { Haptics, impactAsync as triggerImpact, notificationAsync as triggerNotification } from '@/lib/safeHaptics'
import {
  sendEXOTransfer,
  transferAsset,
  isValidExoAddress,
  getGasPrice,
  getEthNonce,
  estimateGas,
  sendEthTransfer,
  sendERC20Transfer,
  DONATION_RATE_DENOMINATOR,
  getDonationTransferQuote,
  recordPendingCryptoTransaction,
  isValidEthAddress,
  formatEthAddress,
  getMozagaExplorerTxUrl,
  getEthExplorerTxUrl,
  getBitcoinExplorerTxUrl,
  getSolanaExplorerTxUrl,
  getTronExplorerTxUrl,
  CRYPTO_NETWORK_BY_ID,
  getAvailableNetworks,
  getWalletAddressForNetwork,
  getWalletPrivateKeyForNetwork,
  isValidAddressForNetwork,
  sendSplTokenTransfer,
  sendTrc20Transfer,
  sendNativeTransferForNetwork,
  isEvmNetwork,
  type NetworkTokenBalance,
  type UserAsset,
  type TokenBalance,
  type CryptoNetworkId,
  type CryptoReceiptStatus,
  type DonationNetworkId,
  type DonationTransferQuote,
} from '@/services/crypto'
import {
  invalidateCryptoPortfolio,
  loadEthereumPortfolioData,
  loadExternalPortfolioData,
  loadMozagaPortfolioData,
  refetchCryptoPortfolio,
} from '@/services/crypto/portfolioBalances'
import { openExternalUrl } from '@/services/tor/externalLinkPolicy'
import { formatAddress } from '@/lib/utils'
import { formatBigIntAmount, parseDecimalToBigInt } from '@/lib/amounts'
import { CRYPTO_NETWORK_ICONS } from '@/lib/cryptoIcons'
import { canSendTransfersInSpectre, SPECTRE_TRANSFER_MESSAGE } from '@/lib/spectrePolicy'
import { useMarketPrices } from '@/hooks/useMarketPrices'
import { getContributionRecipients, type VerifiedContributionRecipients } from '@/services/backend/contributionRecipients'
import { formatAssetFiatValue } from '@/services/crypto/fiatValuation'
import type { CryptoPaymentRequest } from '@/services/shared/cryptoPaymentRequest'

type Network = CryptoNetworkId
type SendState = 'select' | 'amount' | 'confirming' | 'sending' | 'success' | 'pending' | 'error'

const EXO_NETWORK_FEE_WEI = parseDecimalToBigInt('0.000216', 18) ?? 0n
const ETH_MAX_SEND_BUFFER_WEI = parseDecimalToBigInt('0.0001', 18) ?? 0n

function ContributionPreview({ quote, colors }: { quote: DonationTransferQuote; colors: ReturnType<typeof useCryptoTheme>['colors'] }) {
  return (
    <View className="rounded-xl p-3 mb-5" style={{ backgroundColor: colors.surface + 'CC' }}>
      <View className="flex-row justify-between mb-1">
        <Text className="text-sm" style={{ color: colors.textMuted }}>{translate('Contribution', { ns: 'crypto' })}</Text>
        <Text className="text-sm font-semibold" style={{ color: colors.text }}>{quote.amount} {quote.symbol}</Text>
      </View>
      <Text className="text-xs" style={{ color: colors.textMuted }}>
        {translate('A 0.1% contribution is included, capped at $10 equivalent.', { ns: 'crypto' })}
      </Text>
    </View>
  )
}

function formatCanonicalAmount(value: bigint, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0) return value.toString()
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = value % base
  if (decimals === 0 || fraction === 0n) return whole.toString()
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${whole.toString()}.${fractionText}`
}

interface SelectedAsset {
  network: Network
  type: 'native' | 'token'
  tokenId?: string
  contractAddress?: string
  mintAddress?: string
  symbol: string
  name: string
  balance: string
  balanceFormatted: string
  decimals: number
  color: string
}

interface SendCryptoModalProps {
  visible: boolean
  onClose: () => void
  recipientAddress: string
  recipientName?: string
  paymentRequest?: CryptoPaymentRequest | null
  onTransactionSent?: (
    symbol: string,
    amount: string,
    txHash: string,
    chainId?: CryptoNetworkId,
    status?: CryptoReceiptStatus,
  ) => void | Promise<void>
}

function isGenericSelfLabel(value?: string): boolean {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'you' || normalized === 't\u00fa' || normalized === 'tu'
}

function areSelectedAssetsEqual(left: SelectedAsset | null, right: SelectedAsset): boolean {
  return Boolean(left)
    && left!.network === right.network
    && left!.type === right.type
    && left!.tokenId === right.tokenId
    && left!.contractAddress === right.contractAddress
    && left!.mintAddress === right.mintAddress
    && left!.symbol === right.symbol
    && left!.name === right.name
    && left!.balance === right.balance
    && left!.balanceFormatted === right.balanceFormatted
    && left!.decimals === right.decimals
    && left!.color === right.color
}

export function SendCryptoModal({
  visible,
  onClose,
  recipientAddress,
  recipientName,
  paymentRequest,
  onTransactionSent,
}: SendCryptoModalProps) {
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const { wallet } = useWalletStore()
  const preferredFiatCurrency = useUIStore((state) => state.preferredFiatCurrency)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const spectreAccountMode = useSpectreStore((state) => state.spectreAccountMode)
  const { colors, accent, alpha, assetClassAccent, resolveExternalAccent } = useCryptoTheme()
  useTranslation()

  const [network, setNetwork] = useState<Network>('mozaga')
  const [sendState, setSendState] = useState<SendState>('select')
  const [selectedAsset, setSelectedAsset] = useState<SelectedAsset | null>(null)
  const [amount, setAmount] = useState('')
  const [ethRecipient, setEthRecipient] = useState('')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [donationTxHash, setDonationTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showNetworkSelector, setShowNetworkSelector] = useState(false)
  const [contributionRecipients, setContributionRecipients] = useState<VerifiedContributionRecipients | null>(null)

  const [exoBalance, setExoBalance] = useState('0.0000')
  const [nativeAssets, setNativeAssets] = useState<UserAsset[]>([])
  const [isLoadingExo, setIsLoadingExo] = useState(true)

  const [ethBalance, setEthBalance] = useState('0.0')
  const [ethTokens, setEthTokens] = useState<TokenBalance[]>([])
  const [isLoadingEth, setIsLoadingEth] = useState(true)
  const [gasFeeWei, setGasFeeWei] = useState<bigint>(0n)
  const [externalBalances, setExternalBalances] = useState<Partial<Record<CryptoNetworkId, string>>>({})
  const [externalTokens, setExternalTokens] = useState<Partial<Record<CryptoNetworkId, NetworkTokenBalance[]>>>({})
  const [isLoadingExternal, setIsLoadingExternal] = useState(false)
  const { data: marketPrices } = useMarketPrices()
  const formatFiatValue = useCallback((symbol: string, value: string, decimals: number) => (
    formatAssetFiatValue({
      symbol,
      balance: value,
      decimals,
      prices: marketPrices,
      fiatCode: preferredFiatCurrency,
    })
  ), [marketPrices, preferredFiatCurrency])

  const isEthereum = network === 'ethereum'
  const isMozaga = network === 'mozaga'
  const networkConfig = CRYPTO_NETWORK_BY_ID[network]
  const mozagaAccent = accent('mozaga')
  const ethereumAccent = accent('ethereum')
  const networkAccent = accent(networkConfig.accentName)
  const selectedAssetAccent = selectedAsset
    ? resolveExternalAccent(selectedAsset.color, CRYPTO_NETWORK_BY_ID[selectedAsset.network]?.accentName || 'mozaga')
    : networkAccent
  const renderBalanceBlock = useCallback((value: string, symbol: string, decimals: number, large = false) => {
    const fiatLabel = formatFiatValue(symbol, value, decimals)
    return (
      <View className="items-end">
        <View className="flex-row items-baseline gap-1">
          <Text className={large ? 'font-bold text-base' : 'font-bold'} style={{ color: colors.text }}>{value}</Text>
          <Text className="text-xs uppercase" style={{ color: colors.textMuted }}>{symbol}</Text>
        </View>
        {fiatLabel ? (
          <Text className="text-[10px] mt-0.5" style={{ color: colors.textMuted }}>{fiatLabel}</Text>
        ) : null}
      </View>
    )
  }, [colors.text, colors.textMuted, formatFiatValue])
  const gasFeeDisplay = formatBigIntAmount(gasFeeWei, 18, 6, true)
  const selectedAmountUnits = selectedAsset
    ? parseDecimalToBigInt(amount, selectedAsset.decimals)
    : null
  const selectedBalanceUnits = selectedAsset
    ? parseDecimalToBigInt(selectedAsset.balanceFormatted, selectedAsset.decimals) ?? 0n
    : 0n
  const ethBalanceUnits = parseDecimalToBigInt(ethBalance, 18) ?? 0n
  const donationQuote = selectedAsset
    ? getDonationTransferQuote({
        networkId: selectedAsset.network as DonationNetworkId,
        symbol: selectedAsset.symbol,
        decimals: selectedAsset.decimals,
        amountUnits: selectedAmountUnits,
        prices: marketPrices,
        recipients: contributionRecipients?.recipients,
      })
    : null
  const spectrePolicyState = useMemo(() => ({
    enabled: spectreEnabled,
    accountMode: spectreAccountMode,
    walletIsSpectre: wallet?.spectreMode === true,
  }), [spectreAccountMode, spectreEnabled, wallet?.spectreMode])
  const transfersAllowed = canSendTransfersInSpectre(spectrePolicyState)
  const paymentRequestMode = Boolean(paymentRequest)
  const effectiveRecipientAddress = paymentRequest?.recipientAddress || recipientAddress
  const displayRecipientName = recipientName && !isGenericSelfLabel(recipientName)
    ? recipientName
    : undefined

  useEffect(() => {
    if (visible && wallet?.address && transfersAllowed) {
      loadMozagaData()
      loadEthereumData()
      loadExternalData()
    }
  }, [transfersAllowed, visible, wallet?.address])

  useEffect(() => {
    if (!visible) {
      setSendState('select')
      setSelectedAsset(null)
      setAmount('')
      setEthRecipient('')
      setTxHash(null)
      setDonationTxHash(null)
      setError(null)
      setNetwork('mozaga')
      setShowNetworkSelector(false)
    }
  }, [visible])

  useEffect(() => {
    if (!visible) return
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
  }, [visible])

  useEffect(() => {
    if (!visible || !paymentRequest) return
    setNetwork(paymentRequest.network)
    setSelectedAsset(null)
    setAmount(paymentRequest.amount)
    setEthRecipient(paymentRequest.network === 'mozaga' ? '' : paymentRequest.recipientAddress)
    setTxHash(null)
    setDonationTxHash(null)
    setError(null)
    setSendState('select')
  }, [paymentRequest?.requestId, visible])

  const loadMozagaData = async () => {
    if (!wallet?.address) return
    setIsLoadingExo(true)
    try {
      const data = await loadMozagaPortfolioData(wallet)
      setExoBalance(data.balance)
      setNativeAssets(data.assets)
    } catch (err) {
      if (__DEV__) console.error('Error loading EXO balances:', err)
    } finally {
      setIsLoadingExo(false)
    }
  }

  const loadEthereumData = async () => {
    if (!wallet?.ethereumAddress) {
      setIsLoadingEth(false)
      return
    }
    setIsLoadingEth(true)
    try {
      const [data, gp] = await Promise.all([
        loadEthereumPortfolioData(wallet),
        getGasPrice(),
      ])
      setEthBalance(data.balance)
      setGasFeeWei(gp * 21000n)
      setEthTokens(data.tokens)
    } catch (err) {
      if (__DEV__) console.error('Error loading ETH balances:', err)
    } finally {
      setIsLoadingEth(false)
    }
  }

  const loadExternalData = async () => {
    if (!wallet) return
    setIsLoadingExternal(true)
    try {
      const data = await loadExternalPortfolioData(wallet)
      setExternalBalances(data.balances)
      setExternalTokens(data.tokens)
    } catch (err) {
      if (__DEV__) console.error('Error loading external balances:', err)
    } finally {
      setIsLoadingExternal(false)
    }
  }

  const resolvePaymentRequestAsset = useCallback((): SelectedAsset | null => {
    if (!paymentRequest) return null

    if (paymentRequest.assetType === 'native') {
      if (paymentRequest.network === 'mozaga') {
        return {
          network: 'mozaga',
          type: 'native',
          symbol: 'EXO',
          name: 'Mozaga',
          balance: exoBalance,
          balanceFormatted: exoBalance,
          decimals: 18,
          color: CRYPTO_BRAND_ACCENTS.mozaga,
        }
      }
      if (paymentRequest.network === 'ethereum') {
        return {
          network: 'ethereum',
          type: 'native',
          symbol: 'ETH',
          name: 'Ether',
          balance: ethBalance,
          balanceFormatted: ethBalance,
          decimals: 18,
          color: CRYPTO_BRAND_ACCENTS.ethereum,
        }
      }
      const config = CRYPTO_NETWORK_BY_ID[paymentRequest.network]
      return {
        network: paymentRequest.network,
        type: 'native',
        symbol: config.nativeSymbol,
        name: config.shortName,
        balance: externalBalances[paymentRequest.network] || '0',
        balanceFormatted: externalBalances[paymentRequest.network] || '0',
        decimals: config.decimals,
        color: CRYPTO_BRAND_ACCENTS[config.accentName],
      }
    }

    if (paymentRequest.network === 'mozaga') {
      const asset = nativeAssets.find((entry) =>
        (paymentRequest.tokenId && entry.tokenId === paymentRequest.tokenId)
        || entry.symbol.toUpperCase() === paymentRequest.symbol
      )
      return asset
        ? {
            network: 'mozaga',
            type: 'token',
            tokenId: asset.tokenId,
            symbol: asset.symbol,
            name: asset.name,
            balance: asset.balance,
            balanceFormatted: asset.balanceFormatted,
            decimals: asset.decimals,
            color: assetClassAccent(asset.assetClass),
          }
        : null
    }

    if (paymentRequest.network === 'ethereum') {
      const token = ethTokens.find((entry) =>
        (paymentRequest.contractAddress && entry.address.toLowerCase() === paymentRequest.contractAddress.toLowerCase())
        || entry.symbol.toUpperCase() === paymentRequest.symbol
      )
      return token
        ? {
            network: 'ethereum',
            type: 'token',
            contractAddress: token.address,
            symbol: token.symbol,
            name: token.name,
            balance: token.balance,
            balanceFormatted: token.balance,
            decimals: token.decimals,
            color: token.logoColor,
          }
        : null
    }

    const token = (externalTokens[paymentRequest.network] || []).find((entry) =>
      (paymentRequest.contractAddress && entry.contractAddress === paymentRequest.contractAddress)
      || (paymentRequest.mintAddress && entry.mintAddress === paymentRequest.mintAddress)
      || entry.symbol.toUpperCase() === paymentRequest.symbol
    )
    return token
      ? {
          network: paymentRequest.network,
          type: 'token',
          symbol: token.symbol,
          name: token.name,
          balance: token.balanceRaw,
          balanceFormatted: token.balance,
          decimals: token.decimals,
          color: token.logoColor,
          contractAddress: token.contractAddress,
          mintAddress: token.mintAddress,
        }
      : null
  }, [
    assetClassAccent,
    ethBalance,
    ethTokens,
    exoBalance,
    externalBalances,
    externalTokens,
    nativeAssets,
    paymentRequest,
  ])

  useEffect(() => {
    if (!visible || !paymentRequest || !transfersAllowed) return

    const requestedNetworkLoading = paymentRequest.network === 'mozaga'
      ? isLoadingExo
      : paymentRequest.network === 'ethereum'
        ? isLoadingEth
        : isLoadingExternal
    if (requestedNetworkLoading) return

    const asset = resolvePaymentRequestAsset()
    if (!asset) {
      setError(translate('Requested asset is not available in this wallet'))
      setSendState('error')
      return
    }

    setNetwork((current) => current === asset.network ? current : asset.network)
    setSelectedAsset((current) => areSelectedAssetsEqual(current, asset) ? current : asset)
    setAmount((current) => current === paymentRequest.amount ? current : paymentRequest.amount)
    const nextRecipient = asset.network === 'mozaga' ? '' : paymentRequest.recipientAddress
    setEthRecipient((current) => current === nextRecipient ? current : nextRecipient)
    if (asset.network === 'ethereum') {
      void (async () => {
        try {
          const gp = await getGasPrice()
          if (asset.type === 'token' && asset.contractAddress && wallet?.ethereumAddress) {
            const padded = paymentRequest.recipientAddress.toLowerCase().replace('0x', '').padStart(64, '0')
            const amountBig = parseDecimalToBigInt(paymentRequest.amount, asset.decimals)
            if (!amountBig || amountBig <= 0n) return
            const amountHex = amountBig.toString(16).padStart(64, '0')
            const calldata = '0xa9059cbb' + padded + amountHex
            const estimated = await estimateGas({
              from: wallet.ethereumAddress,
              to: asset.contractAddress,
              data: calldata,
            })
            setGasFeeWei(gp * ((estimated * 120n) / 100n))
          } else {
            setGasFeeWei(gp * 21000n)
          }
        } catch {}
      })()
    }
    setSendState((current) =>
      current === 'select' || current === 'amount' || current === 'confirming'
        ? 'confirming'
        : current
    )
  }, [
    isLoadingEth,
    isLoadingExo,
    isLoadingExternal,
    paymentRequest,
    resolvePaymentRequestAsset,
    transfersAllowed,
    visible,
    wallet?.ethereumAddress,
  ])

  const syncPortfolioAfterSend = async () => {
    if (!wallet) return
    await invalidateCryptoPortfolio(queryClient, wallet)
    await refetchCryptoPortfolio(queryClient, wallet)
    await Promise.allSettled([
      loadMozagaData(),
      loadEthereumData(),
      loadExternalData(),
    ])
  }

  const handleSelectAsset = async (asset: SelectedAsset) => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light)
    setSelectedAsset(asset)
    setSendState('amount')
  }

  const handleSetMax = () => {
    if (!selectedAsset) return
    const contributionDenominator = DONATION_RATE_DENOMINATOR + 1n
    if (selectedAsset.network === 'mozaga' && selectedAsset.type === 'native' && selectedAsset.symbol === 'EXO') {
      const feeReserve = EXO_NETWORK_FEE_WEI * 2n
      const maxAmountWei = selectedBalanceUnits > feeReserve
        ? ((selectedBalanceUnits - feeReserve) * DONATION_RATE_DENOMINATOR) / contributionDenominator
        : 0n
      setAmount(formatBigIntAmount(maxAmountWei, 18, 6, true))
    } else if (selectedAsset.network === 'ethereum' && selectedAsset.type === 'native') {
      const reservedWei = (gasFeeWei * 2n) + ETH_MAX_SEND_BUFFER_WEI
      const maxAmountWei = ethBalanceUnits > reservedWei
        ? ((ethBalanceUnits - reservedWei) * DONATION_RATE_DENOMINATOR) / contributionDenominator
        : ethBalanceUnits > gasFeeWei * 2n
          ? ((ethBalanceUnits - (gasFeeWei * 2n)) * DONATION_RATE_DENOMINATOR) / contributionDenominator
          : 0n
      setAmount(formatBigIntAmount(maxAmountWei, 18, 6, true))
    } else {
      const maxAmountUnits = (selectedBalanceUnits * DONATION_RATE_DENOMINATOR) / contributionDenominator
      setAmount(formatBigIntAmount(maxAmountUnits, selectedAsset.decimals, Math.min(selectedAsset.decimals, 8), true))
    }
  }

  const isValidAmount = useCallback(() => {
    if (!selectedAsset || !selectedAmountUnits || selectedAmountUnits <= 0n) return false
    if (!donationQuote) return false

    if (selectedAsset.network === 'mozaga' && selectedAsset.type === 'native' && selectedAsset.symbol === 'EXO') {
      return selectedAmountUnits + donationQuote.amountUnits + (EXO_NETWORK_FEE_WEI * 2n) <= selectedBalanceUnits
    }

    if (selectedAsset.network === 'ethereum' && selectedAsset.type === 'native') {
      return selectedAmountUnits + donationQuote.amountUnits + (gasFeeWei * 2n) <= ethBalanceUnits
    }

    if (selectedAsset.network === 'ethereum' && selectedAsset.type === 'token') {
      return selectedAmountUnits + donationQuote.amountUnits <= selectedBalanceUnits && ethBalanceUnits >= gasFeeWei * 2n
    }

    return selectedAmountUnits + donationQuote.amountUnits <= selectedBalanceUnits
  }, [donationQuote, ethBalanceUnits, gasFeeWei, selectedAmountUnits, selectedAsset, selectedBalanceUnits])

  const canReview = useCallback(() => {
    if (!isValidAmount()) return false
    if (!isMozaga && !isValidAddressForNetwork(network, ethRecipient)) return false
    return true
  }, [ethRecipient, isMozaga, isValidAmount, network])

  const handleReview = async () => {
    if (!canReview()) return

    if (isEthereum && selectedAsset) {
      try {
        const gp = await getGasPrice()
        if (selectedAsset.type === 'token' && selectedAsset.contractAddress && wallet?.ethereumAddress) {
          const padded = ethRecipient.toLowerCase().replace('0x', '').padStart(64, '0')
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
          const fee = gp * ((estimated * 120n) / 100n)
          setGasFeeWei(fee)
        } else {
          setGasFeeWei(gp * 21000n)
        }
      } catch {}
    }
    setSendState('confirming')
  }

  const handleObservedSend = async (
    symbol: string,
    normalizedAmount: string,
    resultHash: string,
    chainId: CryptoNetworkId,
    status: CryptoReceiptStatus,
  ) => {
    triggerNotification(
      status === 'failed'
        ? Haptics.NotificationFeedbackType.Error
        : Haptics.NotificationFeedbackType.Success,
    )
    if (status === 'failed') {
      setError(translate('Transaction failed on-chain'))
      setSendState('error')
    } else {
      setSendState('success')
    }
    await onTransactionSent?.(symbol, normalizedAmount, resultHash, chainId, status)
    if (paymentRequestMode && status !== 'failed') {
      onClose()
    }
    void syncPortfolioAfterSend().catch((syncError) => {
      if (__DEV__) console.warn('Error syncing crypto portfolio after send:', syncError)
    })
  }

  const handleConfirmSend = async () => {
    if (!wallet || !selectedAsset) return

    triggerImpact(Haptics.ImpactFeedbackStyle.Medium)
    setSendState('sending')
    setError(null)
    setDonationTxHash(null)

    try {
      let resultHash: string
      if (!selectedAmountUnits || selectedAmountUnits <= 0n) {
        throw new Error(translate('Invalid amount'))
      }
      if (!donationQuote) {
        throw new Error(translate('Contribution quote unavailable. Please refresh market prices and try again.', { ns: 'crypto' }))
      }
      const normalizedAmount = formatCanonicalAmount(selectedAmountUnits, selectedAsset.decimals)
      const recordTransfer = async (txHash: string, from: string, to: string, transferAmount: string) => {
        await recordPendingCryptoTransaction({
          network: selectedAsset.network,
          txHash,
          from,
          to,
          amount: transferAmount,
          symbol: selectedAsset.symbol,
          assetType: selectedAsset.type,
          tokenIdentifier: selectedAsset.tokenId ?? selectedAsset.contractAddress ?? selectedAsset.mintAddress,
        })
      }

      if (selectedAsset.network === 'mozaga') {
        if (!isValidExoAddress(effectiveRecipientAddress)) {
          throw new Error(translate('Invalid Mozaga recipient address'))
        }
        if (selectedAsset.type === 'native' && selectedAsset.symbol === 'EXO') {
          const r = await sendEXOTransfer(
            wallet.privateKey, wallet.publicKey, wallet.address, effectiveRecipientAddress, normalizedAmount,
          )
          resultHash = r.txHash
          setTxHash(resultHash)
          await recordTransfer(resultHash, wallet.address, effectiveRecipientAddress, normalizedAmount)
          const contribution = await sendEXOTransfer(
            wallet.privateKey, wallet.publicKey, wallet.address, donationQuote.treasuryAddress, donationQuote.amount,
          )
          setDonationTxHash(contribution.txHash)
          await recordTransfer(contribution.txHash, wallet.address, donationQuote.treasuryAddress, donationQuote.amount)
        } else {
          const r = await transferAsset(
            wallet.privateKey, wallet.publicKey, wallet.address, effectiveRecipientAddress,
            selectedAsset.tokenId!, normalizedAmount, selectedAsset.decimals,
          )
          resultHash = r.txHash
          setTxHash(resultHash)
          await recordTransfer(resultHash, wallet.address, effectiveRecipientAddress, normalizedAmount)
          const contribution = await transferAsset(
            wallet.privateKey, wallet.publicKey, wallet.address, donationQuote.treasuryAddress,
            selectedAsset.tokenId!, donationQuote.amount, selectedAsset.decimals,
          )
          setDonationTxHash(contribution.txHash)
          await recordTransfer(contribution.txHash, wallet.address, donationQuote.treasuryAddress, donationQuote.amount)
        }
        await handleObservedSend(selectedAsset.symbol, normalizedAmount, resultHash, selectedAsset.network, 'pending')
      } else if (selectedAsset.network === 'ethereum') {
        if (!wallet.ethereumPrivateKey || !wallet.ethereumAddress) {
          throw new Error(translate('Ethereum wallet not available'))
        }
        if (!isValidEthAddress(ethRecipient)) {
          throw new Error(translate('Invalid Ethereum recipient address'))
        }
        const nonce = await getEthNonce(wallet.ethereumAddress)
        if (selectedAsset.type === 'token' && selectedAsset.contractAddress) {
          const r = await sendERC20Transfer(
            wallet.ethereumPrivateKey, wallet.ethereumAddress,
            selectedAsset.contractAddress, ethRecipient,
            normalizedAmount, selectedAsset.decimals, { nonce },
          )
          resultHash = r.txHash
          setTxHash(resultHash)
          await recordTransfer(resultHash, wallet.ethereumAddress, ethRecipient, normalizedAmount)
          const contribution = await sendERC20Transfer(
            wallet.ethereumPrivateKey, wallet.ethereumAddress,
            selectedAsset.contractAddress, donationQuote.treasuryAddress,
            donationQuote.amount, selectedAsset.decimals, { nonce: nonce + 1n },
          )
          setDonationTxHash(contribution.txHash)
          await recordTransfer(contribution.txHash, wallet.ethereumAddress, donationQuote.treasuryAddress, donationQuote.amount)
        } else {
          const r = await sendEthTransfer(
            wallet.ethereumPrivateKey, wallet.ethereumAddress, ethRecipient, normalizedAmount, { nonce },
          )
          resultHash = r.txHash
          setTxHash(resultHash)
          await recordTransfer(resultHash, wallet.ethereumAddress, ethRecipient, normalizedAmount)
          const contribution = await sendEthTransfer(
            wallet.ethereumPrivateKey, wallet.ethereumAddress, donationQuote.treasuryAddress, donationQuote.amount, { nonce: nonce + 1n },
          )
          setDonationTxHash(contribution.txHash)
          await recordTransfer(contribution.txHash, wallet.ethereumAddress, donationQuote.treasuryAddress, donationQuote.amount)
        }
        await handleObservedSend(selectedAsset.symbol, normalizedAmount, resultHash, selectedAsset.network, 'pending')
      } else {
        if (!isValidAddressForNetwork(selectedAsset.network, ethRecipient)) {
          throw new Error(translate('Invalid recipient address'))
        }
        const from = getWalletAddressForNetwork(wallet, selectedAsset.network) || ''
        let r: { txHash: string }
        if (selectedAsset.type === 'token' && selectedAsset.network === 'tron' && selectedAsset.contractAddress) {
          const privateKey = getWalletPrivateKeyForNetwork(wallet, selectedAsset.network)
          if (!from || !privateKey) throw new Error(translate('Tron wallet not available'))
          r = await sendTrc20Transfer(
            privateKey,
            from,
            selectedAsset.contractAddress,
            ethRecipient,
            normalizedAmount,
            selectedAsset.decimals,
          )
          resultHash = r.txHash
          setTxHash(resultHash)
          await recordTransfer(resultHash, from, ethRecipient, normalizedAmount)
          const contribution = await sendTrc20Transfer(
            privateKey,
            from,
            selectedAsset.contractAddress,
            donationQuote.treasuryAddress,
            donationQuote.amount,
            selectedAsset.decimals,
          )
          setDonationTxHash(contribution.txHash)
          await recordTransfer(contribution.txHash, from, donationQuote.treasuryAddress, donationQuote.amount)
        } else if (selectedAsset.type === 'token' && selectedAsset.network === 'solana' && selectedAsset.mintAddress) {
          const privateKey = getWalletPrivateKeyForNetwork(wallet, selectedAsset.network)
          if (!from || !privateKey) throw new Error(translate('Solana wallet not available'))
          r = await sendSplTokenTransfer(
            privateKey,
            from,
            selectedAsset.mintAddress,
            ethRecipient,
            normalizedAmount,
            selectedAsset.decimals,
          )
          resultHash = r.txHash
          setTxHash(resultHash)
          await recordTransfer(resultHash, from, ethRecipient, normalizedAmount)
          const contribution = await sendSplTokenTransfer(
            privateKey,
            from,
            selectedAsset.mintAddress,
            donationQuote.treasuryAddress,
            donationQuote.amount,
            selectedAsset.decimals,
          )
          setDonationTxHash(contribution.txHash)
          await recordTransfer(contribution.txHash, from, donationQuote.treasuryAddress, donationQuote.amount)
        } else if (selectedAsset.network === 'bitcoin') {
          r = await sendNativeTransferForNetwork(selectedAsset.network, wallet, ethRecipient, normalizedAmount, {
            donation: {
              to: donationQuote.treasuryAddress,
              amount: donationQuote.amount,
            },
          })
          resultHash = r.txHash
          setTxHash(resultHash)
          setDonationTxHash(resultHash)
          await recordTransfer(resultHash, from, ethRecipient, normalizedAmount)
          await recordTransfer(resultHash, from, donationQuote.treasuryAddress, donationQuote.amount)
        } else {
          r = await sendNativeTransferForNetwork(selectedAsset.network, wallet, ethRecipient, normalizedAmount)
          resultHash = r.txHash
          setTxHash(resultHash)
          await recordTransfer(resultHash, from, ethRecipient, normalizedAmount)
          const contribution = await sendNativeTransferForNetwork(selectedAsset.network, wallet, donationQuote.treasuryAddress, donationQuote.amount)
          setDonationTxHash(contribution.txHash)
          await recordTransfer(contribution.txHash, from, donationQuote.treasuryAddress, donationQuote.amount)
        }
        await handleObservedSend(selectedAsset.symbol, normalizedAmount, resultHash, selectedAsset.network, 'pending')
      }
    } catch (err) {
      if (__DEV__) console.error('Send error:', err)
      triggerNotification(Haptics.NotificationFeedbackType.Error)
      setError(getErrorDisplayMessage(err) || translate('Failed to send transaction'))
      setSendState('error')
    }
  }

  const handleBack = () => {
    if (paymentRequestMode && sendState === 'confirming') {
      onClose()
      return
    }
    if (sendState === 'amount') {
      setSelectedAsset(null)
      setAmount('')
      setSendState('select')
    } else if (sendState === 'confirming') {
      setSendState('amount')
    }
  }

  const getTitle = () => {
    if (paymentRequestMode && sendState === 'confirming') return translate('Confirm Payment')
    switch (sendState) {
      case 'select': return translate('Send Crypto')
      case 'amount': return translate('Enter Amount')
      case 'confirming': return translate('Confirm')
      case 'sending': return translate('Sending...')
      case 'success': return translate('Transaction Sent')
      case 'pending': return translate('Submitted')
      case 'error': return translate('Failed')
    }
  }

  const showBackButton = !paymentRequestMode && (sendState === 'amount' || sendState === 'confirming')
  const showCloseButton = sendState === 'select' || sendState === 'success' || sendState === 'pending' || sendState === 'error'
  const getExplorerTxUrl = (hash: string): string | null => {
    try {
      switch (selectedAsset?.network || network) {
        case 'mozaga': return getMozagaExplorerTxUrl(hash)
        case 'ethereum': return getEthExplorerTxUrl(hash)
        case 'bitcoin': return getBitcoinExplorerTxUrl(hash)
        case 'solana': return getSolanaExplorerTxUrl(hash)
        case 'tron': return getTronExplorerTxUrl(hash)
      }
    } catch {
      return null
    }
    return null
  }

  const renderSelectState = () => {
    const isLoading = isMozaga ? isLoadingExo : isEthereum ? isLoadingEth : isLoadingExternal
    const selectableNetworks = getAvailableNetworks(wallet)

    return (
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        {selectableNetworks.length > 1 && (
          <View className="mb-5">
            <Pressable
              onPress={() => setShowNetworkSelector((value) => !value)}
              className="flex-row items-center gap-3 rounded-2xl p-4 active:opacity-80"
              style={{ backgroundColor: colors.surface }}
            >
              <Image source={CRYPTO_NETWORK_ICONS[network]} style={{ width: 28, height: 28 }} resizeMode="contain" />
              <View className="flex-1">
                <Text className="text-xs" style={{ color: colors.textMuted }}>{translate('Blockchain')}</Text>
                <Text className="font-semibold text-base" style={{ color: colors.text }}>{networkConfig.name}</Text>
              </View>
              <ChevronDown size={20} color={colors.textMuted} />
            </Pressable>
            {showNetworkSelector && (
              <View className="gap-2 mt-2">
                {selectableNetworks.map((entry) => {
                  const active = network === entry.id
                  const color = accent(entry.accentName)
                  return (
                    <Pressable
                      key={entry.id}
                      onPress={() => {
                        setNetwork(entry.id)
                        setShowNetworkSelector(false)
                      }}
                      className="flex-row items-center gap-3 rounded-2xl p-4"
                      style={{ backgroundColor: active ? alpha(color, 0.12) : colors.surface + 'CC' }}
                    >
                      <Image source={CRYPTO_NETWORK_ICONS[entry.id]} style={{ width: 28, height: 28 }} resizeMode="contain" />
                      <View className="flex-1">
                        <Text className="font-semibold" style={{ color: colors.text }}>{entry.name}</Text>
                        <Text className="text-xs" style={{ color: colors.textMuted }}>{entry.nativeSymbol}</Text>
                      </View>
                      {active && <Check size={18} color={color} />}
                    </Pressable>
                  )
                })}
              </View>
            )}
          </View>
        )}
        {selectableNetworks.length <= 1 && (
          <View className="flex-row items-center gap-3 rounded-2xl p-4 mb-5" style={{ backgroundColor: colors.surface }}>
            <Image source={CRYPTO_NETWORK_ICONS[network]} style={{ width: 28, height: 28 }} resizeMode="contain" />
            <View className="flex-1">
              <Text className="text-xs" style={{ color: colors.textMuted }}>{translate('Blockchain')}</Text>
              <Text className="font-semibold text-base" style={{ color: colors.text }}>{networkConfig.name}</Text>
            </View>
          </View>
        )}

        <View className="rounded-2xl p-4 mb-5" style={{ backgroundColor: colors.surface + 'CC' }}>
          <Text className="text-xs uppercase tracking-wider mb-1" style={{ color: colors.textMuted }}>
            {translate('Sending to')}
          </Text>
          <Text className="font-semibold text-base" style={{ color: colors.text }}>
            {displayRecipientName || formatAddress(effectiveRecipientAddress, 8)}
          </Text>
          {isMozaga && (
            <Text className="font-mono text-xs mt-1" style={{ color: colors.textMuted }} numberOfLines={1}>
              {effectiveRecipientAddress}
            </Text>
          )}
          {!isMozaga && (
            <Text className="text-xs mt-2" style={{ color: colors.textMuted }}>
              {translate("You'll enter the {{network}} address in the next step", { network: networkConfig.shortName })}
            </Text>
          )}
        </View>

        {isLoading ? (
          <View className="py-12 items-center">
            <ActivityIndicator size="large" color={networkAccent} />
            <Text className="mt-4 text-sm" style={{ color: colors.textMuted }}>
              {translate('Loading balances...')}
            </Text>
          </View>
        ) : isMozaga ? (
          <>
            <Text className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>
              {translate('Native Currency')}
            </Text>
            <Pressable onPress={() => handleSelectAsset({
              network: 'mozaga', type: 'native', symbol: 'EXO', name: 'Mozaga',
              balance: exoBalance, balanceFormatted: exoBalance, decimals: 18, color: CRYPTO_BRAND_ACCENTS.mozaga,
            })} className="rounded-2xl p-4 mb-5 active:opacity-80" style={{ backgroundColor: alpha(mozagaAccent, 0.08), borderWidth: 1, borderColor: alpha(mozagaAccent, 0.15) }}>
              <View className="flex-row items-center gap-3">
                <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: alpha(mozagaAccent, 0.15) }}>
                  <Image source={CRYPTO_NETWORK_ICONS.mozaga} style={{ width: 24, height: 24 }} resizeMode="contain" />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-base" style={{ color: colors.text }}>{translate('Mozaga', { ns: 'crypto' })}</Text>
                  <Text className="text-xs" style={{ color: colors.textMuted }}>EXO</Text>
                </View>
                {renderBalanceBlock(exoBalance, 'EXO', 18, true)}
                <ArrowUpRight size={16} color={colors.textMuted} />
              </View>
            </Pressable>

            {nativeAssets.length > 0 && (
              <>
                <Text className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>
                  {translate('Native Assets')}
                </Text>
                <View className="gap-3 mb-5">
                  {nativeAssets.map((asset) => {
                    const clr = assetClassAccent(asset.assetClass)
                    return (
                      <Pressable
                        key={asset.tokenId}
                        onPress={() => handleSelectAsset({
                          network: 'mozaga', type: 'token', tokenId: asset.tokenId,
                          symbol: asset.symbol, name: asset.name,
                          balance: asset.balance, balanceFormatted: asset.balanceFormatted,
                          decimals: asset.decimals, color: clr,
                        })}
                        className="rounded-2xl p-4 active:opacity-80"
                        style={{ backgroundColor: alpha(clr, 0.05), borderWidth: 1, borderColor: alpha(clr, 0.12) }}
                      >
                        <View className="flex-row items-center gap-3">
                          <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: alpha(clr, 0.15) }}>
                            <Text style={{ color: clr, fontSize: 16, fontWeight: '800' }}>{asset.symbol[0]}</Text>
                          </View>
                          <View className="flex-1">
                            <Text className="font-semibold" style={{ color: colors.text }}>{asset.name}</Text>
                            <Text className="text-xs" style={{ color: colors.textMuted }}>{asset.symbol}</Text>
                          </View>
                          {renderBalanceBlock(asset.balanceFormatted, asset.symbol, asset.decimals)}
                          <ArrowUpRight size={16} color={colors.textMuted} />
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
              </>
            )}

            {nativeAssets.length === 0 && (
              <View className="rounded-2xl p-6 items-center" style={{ backgroundColor: colors.surface + '80' }}>
                <Coins size={28} color={colors.border} />
                <Text className="mt-3 text-sm text-center" style={{ color: colors.textMuted }}>
                  {translate('No native assets in this account')}
                </Text>
              </View>
            )}
          </>
        ) : !isEthereum ? (
          <>
            <Text className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>
              {translate('Native Currency')}
            </Text>
            <Pressable onPress={() => handleSelectAsset({
              network,
              type: 'native',
              symbol: networkConfig.nativeSymbol,
              name: networkConfig.shortName,
              balance: externalBalances[network] || '0',
              balanceFormatted: externalBalances[network] || '0',
              decimals: networkConfig.decimals,
              color: CRYPTO_BRAND_ACCENTS[networkConfig.accentName],
            })} className="rounded-2xl p-4 mb-5 active:opacity-80" style={{ backgroundColor: alpha(networkAccent, 0.08), borderWidth: 1, borderColor: alpha(networkAccent, 0.15) }}>
              <View className="flex-row items-center gap-3">
                <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: alpha(networkAccent, 0.15) }}>
                  <Image source={CRYPTO_NETWORK_ICONS[network]} style={{ width: 24, height: 24 }} resizeMode="contain" />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-base" style={{ color: colors.text }}>{networkConfig.shortName}</Text>
                  <Text className="text-xs" style={{ color: colors.textMuted }}>{networkConfig.nativeSymbol}</Text>
                </View>
                {renderBalanceBlock(externalBalances[network] || '0', networkConfig.nativeSymbol, networkConfig.decimals, true)}
                <ArrowUpRight size={16} color={colors.textMuted} />
              </View>
            </Pressable>

            {(externalTokens[network] || []).length > 0 && (
              <>
                <Text className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>
                  {network === 'solana' ? translate('SPL Tokens') : translate('TRC-20 Tokens')}
                </Text>
                <View className="gap-3 mb-5">
                  {(externalTokens[network] || []).map((token) => {
                    const tokenAccent = resolveExternalAccent(token.logoColor, networkConfig.accentName)
                    return (
                      <Pressable
                        key={token.identifier}
                        onPress={() => handleSelectAsset({
                          network,
                          type: 'token',
                          symbol: token.symbol,
                          name: token.name,
                          balance: token.balanceRaw,
                          balanceFormatted: token.balance,
                          decimals: token.decimals,
                          color: token.logoColor,
                          contractAddress: token.contractAddress,
                          mintAddress: token.mintAddress,
                        })}
                        className="rounded-2xl p-4 active:opacity-80"
                        style={{ backgroundColor: alpha(tokenAccent, 0.05), borderWidth: 1, borderColor: alpha(tokenAccent, 0.12) }}
                      >
                        <View className="flex-row items-center gap-3">
                          <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: alpha(tokenAccent, 0.15) }}>
                            <Text style={{ color: tokenAccent, fontSize: 16, fontWeight: '800' }}>{token.symbol[0]}</Text>
                          </View>
                          <View className="flex-1">
                            <Text className="font-semibold" style={{ color: colors.text }}>{token.name}</Text>
                            <Text className="text-xs" style={{ color: colors.textMuted }}>{token.symbol}</Text>
                          </View>
                          {renderBalanceBlock(token.balance, token.symbol, token.decimals)}
                          <ArrowUpRight size={16} color={colors.textMuted} />
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
              </>
            )}
          </>
        ) : (
          <>
            <Text className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>
              {translate('Native Currency')}
            </Text>
            <Pressable onPress={() => handleSelectAsset({
              network: 'ethereum', type: 'native', symbol: 'ETH', name: 'Ether',
              balance: ethBalance, balanceFormatted: ethBalance, decimals: 18, color: CRYPTO_BRAND_ACCENTS.ethereum,
            })} className="rounded-2xl p-4 mb-5 active:opacity-80" style={{ backgroundColor: alpha(ethereumAccent, 0.08), borderWidth: 1, borderColor: alpha(ethereumAccent, 0.15) }}>
              <View className="flex-row items-center gap-3">
                <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: alpha(ethereumAccent, 0.15) }}>
                  <Image source={CRYPTO_NETWORK_ICONS.ethereum} style={{ width: 24, height: 24 }} resizeMode="contain" />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-base" style={{ color: colors.text }}>{translate('Ether', { ns: 'crypto' })}</Text>
                  <Text className="text-xs" style={{ color: colors.textMuted }}>ETH</Text>
                </View>
                {renderBalanceBlock(ethBalance, 'ETH', 18, true)}
                <ArrowUpRight size={16} color={colors.textMuted} />
              </View>
            </Pressable>

            {ethTokens.length > 0 && (
              <>
                <Text className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textMuted }}>
                  {translate('ERC-20 Tokens')}
                </Text>
                <View className="gap-3 mb-5">
                  {ethTokens.map((token) => {
                    const tokenAccent = resolveExternalAccent(token.logoColor, 'ethereum')
                    return (
                      <Pressable
                        key={token.address}
                        onPress={() => handleSelectAsset({
                          network: 'ethereum', type: 'token', contractAddress: token.address,
                          symbol: token.symbol, name: token.name,
                          balance: token.balance, balanceFormatted: token.balance,
                          decimals: token.decimals, color: token.logoColor,
                        })}
                        className="rounded-2xl p-4 active:opacity-80"
                        style={{ backgroundColor: alpha(tokenAccent, 0.05), borderWidth: 1, borderColor: alpha(tokenAccent, 0.12) }}
                      >
                        <View className="flex-row items-center gap-3">
                          <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: alpha(tokenAccent, 0.15) }}>
                            <Text style={{ color: tokenAccent, fontSize: 16, fontWeight: '800' }}>{token.symbol[0]}</Text>
                          </View>
                          <View className="flex-1">
                            <Text className="font-semibold" style={{ color: colors.text }}>{token.name}</Text>
                            <Text className="text-xs" style={{ color: colors.textMuted }}>{token.symbol}</Text>
                          </View>
                          {renderBalanceBlock(token.balance, token.symbol, token.decimals)}
                          <ArrowUpRight size={16} color={colors.textMuted} />
                        </View>
                      </Pressable>
                    )
                  })}
                </View>
              </>
            )}

            {ethTokens.length === 0 && (
              <View className="rounded-2xl p-6 items-center" style={{ backgroundColor: colors.surface + '80' }}>
                <Coins size={28} color={colors.border} />
                <Text className="mt-3 text-sm text-center" style={{ color: colors.textMuted }}>
                  {translate('No ERC-20 tokens found')}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    )
  }

  const renderAmountState = () => (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <ScrollView className="flex-1 px-5 pt-4" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View className="rounded-2xl p-4 mb-5" style={{ backgroundColor: alpha(selectedAssetAccent, 0.05), borderWidth: 1, borderColor: alpha(selectedAssetAccent, 0.12) }}>
          <View className="flex-row items-center gap-3">
            <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: alpha(selectedAssetAccent, 0.15) }}>
              <Text style={{ color: selectedAssetAccent, fontSize: 16, fontWeight: '800' }}>{selectedAsset!.symbol[0]}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-semibold" style={{ color: colors.text }}>{selectedAsset!.name}</Text>
              <Text className="text-xs" style={{ color: colors.textMuted }}>
                {translate('Balance: {{balance}} {{symbol}}', {
                  balance: selectedAsset!.balanceFormatted,
                  symbol: selectedAsset!.symbol,
                })}
              </Text>
              {(() => {
                const fiatLabel = formatFiatValue(selectedAsset!.symbol, selectedAsset!.balanceFormatted, selectedAsset!.decimals)
                return fiatLabel ? (
                  <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>{fiatLabel}</Text>
                ) : null
              })()}
            </View>
          </View>
        </View>

        {!isMozaga && (
          <View className="mb-5">
            <Text className="font-medium mb-2 text-sm" style={{ color: colors.text }}>
              {translate('Recipient {{network}} Address', { network: networkConfig.shortName })}
            </Text>
            <View className="rounded-xl flex-row items-center" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
              <TextInput
                className="flex-1 p-4 font-mono text-sm"
                style={{ color: colors.text }}
                placeholder={isEvmNetwork(network) ? '0x...' : translate('{{network}} address', { network: networkConfig.shortName })}
                placeholderTextColor={colors.textMuted}
                value={ethRecipient}
                onChangeText={setEthRecipient}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            {ethRecipient.length > 0 && !isValidAddressForNetwork(network, ethRecipient) && (
              <Text className="text-xs mt-2" style={{ color: colors.error }}>
                {translate('Invalid {{network}} address', { network: networkConfig.shortName })}
              </Text>
            )}
          </View>
        )}

        <View className="mb-5">
          <Text className="font-medium mb-2 text-sm" style={{ color: colors.text }}>{translate('Amount')}</Text>
          <View className="rounded-xl flex-row items-center" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <TextInput
              className="flex-1 p-4 text-xl font-semibold"
              style={{ color: colors.text }}
              placeholder="0.0"
              placeholderTextColor={colors.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              autoFocus={isMozaga}
            />
            <View className="flex-row items-center gap-2 pr-4">
              <Pressable onPress={handleSetMax} className="px-3 py-1.5 rounded-lg" style={{ backgroundColor: alpha(networkAccent, 0.15) }}>
                <Text className="text-xs font-bold" style={{ color: networkAccent }}>{translate('MAX')}</Text>
              </Pressable>
              <Text className="font-semibold text-sm" style={{ color: colors.textMuted }}>{selectedAsset!.symbol}</Text>
            </View>
          </View>
          {selectedAmountUnits !== null && selectedAmountUnits > selectedBalanceUnits && (
            <Text className="text-xs mt-2" style={{ color: colors.error }}>{translate('Insufficient balance')}</Text>
          )}
          {selectedAmountUnits !== null && selectedAmountUnits > 0n && !donationQuote && (
            <Text className="text-xs mt-2" style={{ color: colors.error }}>
              {translate('Contribution quote unavailable. Please refresh market prices and try again.', { ns: 'crypto' })}
            </Text>
          )}
          {selectedAsset?.network === 'mozaga' && selectedAsset.symbol === 'EXO' && selectedAmountUnits !== null && donationQuote && selectedAmountUnits + donationQuote.amountUnits + (EXO_NETWORK_FEE_WEI * 2n) > selectedBalanceUnits && (
            <Text className="text-xs mt-2" style={{ color: colors.error }}>
              {translate('Insufficient balance for amount, contribution, and network fees.', { ns: 'crypto' })}
            </Text>
          )}
          {selectedAsset?.network === 'ethereum' && selectedAsset.type === 'native' && selectedAmountUnits !== null && donationQuote && selectedAmountUnits + donationQuote.amountUnits + (gasFeeWei * 2n) > ethBalanceUnits && (
            <Text className="text-xs mt-2" style={{ color: colors.error }}>
              {translate('Insufficient balance for amount, contribution, and network fees.', { ns: 'crypto' })}
            </Text>
          )}
          {selectedAsset?.network === 'ethereum' && selectedAsset.type === 'token' && gasFeeWei > 0n && ethBalanceUnits < gasFeeWei * 2n && (
            <Text className="text-xs mt-2" style={{ color: colors.error }}>
              {translate('Insufficient balance for amount, contribution, and network fees.', { ns: 'crypto' })}
            </Text>
          )}
        </View>

        {donationQuote ? (
          <ContributionPreview quote={donationQuote} colors={colors} />
        ) : null}

        <View className="rounded-xl p-4 mb-5" style={{ backgroundColor: colors.surface + 'CC' }}>
          <Text className="text-xs mb-1" style={{ color: colors.textMuted }}>{translate('Sending to')}</Text>
          <Text className="font-medium text-sm" style={{ color: colors.text }}>
            {!isMozaga
              ? (ethRecipient ? formatEthAddress(ethRecipient, 8) : translate('Enter address above'))
              : (displayRecipientName || formatAddress(effectiveRecipientAddress, 10))}
          </Text>
        </View>

        {isEvmNetwork(network) && (
          <View className="rounded-xl p-3 mb-5 flex-row items-center gap-2" style={{ backgroundColor: colors.surface + '80' }}>
            <Image source={CRYPTO_NETWORK_ICONS[network]} style={{ width: 14, height: 14 }} resizeMode="contain" />
            <Text className="text-xs flex-1" style={{ color: colors.textMuted }}>
              {translate('Est. gas: {{amount}} {{symbol}}', { amount: gasFeeDisplay, symbol: networkConfig.nativeSymbol })}
            </Text>
          </View>
        )}

        <Pressable
          onPress={handleReview}
          disabled={!canReview()}
          className="w-full rounded-xl py-4 items-center mt-2 mb-6"
          style={{ backgroundColor: canReview() ? networkAccent : alpha(networkAccent, 0.2) }}
        >
          <Text className="text-white font-semibold text-base">{translate('Review Transaction')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  )

  const renderConfirmState = () => (
    <ScrollView className="flex-1 px-5 pt-4" showsVerticalScrollIndicator={false}>
      <View className="items-center mb-6 pt-2">
        <View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: alpha(selectedAssetAccent, 0.15) }}>
          <Text style={{ color: selectedAssetAccent, fontSize: 22, fontWeight: '800' }}>{selectedAsset!.symbol[0]}</Text>
        </View>
        <Text className="text-3xl font-bold" style={{ color: colors.text }}>
          {amount} {selectedAsset!.symbol}
        </Text>
        <Text className="mt-1" style={{ color: colors.textMuted }}>
          {translate(CRYPTO_NETWORK_BY_ID[selectedAsset!.network]?.name || 'Mozaga Mainnet')}
        </Text>
      </View>

      <View className="rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface + 'CC' }}>
        <DetailRow label={translate('Amount')} value={`${amount} ${selectedAsset!.symbol}`} colors={colors} />
        <DetailRow
          label={translate('Recipient')}
          value={!isMozaga ? formatEthAddress(ethRecipient, 10) : (displayRecipientName || formatAddress(effectiveRecipientAddress, 10))}
          mono
          colors={colors}
        />
        {donationQuote ? (
          <>
            <DetailRow label={translate('Contribution', { ns: 'crypto' })} value={`${donationQuote.amount} ${donationQuote.symbol}`} colors={colors} />
            <DetailRow label={translate('Contribution Treasury', { ns: 'crypto' })} value={formatAddress(donationQuote.treasuryAddress, 10)} mono colors={colors} />
          </>
        ) : null}
        {isEvmNetwork(selectedAsset!.network) && (
          <DetailRow label={translate('Gas Fee (est.)')} value={`~${formatBigIntAmount(gasFeeWei * 2n, 18, 6, true)} ETH`} colors={colors} />
        )}
        {selectedAsset!.network === 'mozaga' && selectedAsset!.symbol === 'EXO' && (
          <DetailRow label={translate('Network Fee')} value="~0.000432 EXO" colors={colors} />
        )}
        <View className="h-px my-3" style={{ backgroundColor: colors.border }} />
        {selectedAsset!.network === 'ethereum' && selectedAsset!.type === 'token' ? (
          <>
            <DetailRow label={translate('Send')} value={`${amount} ${selectedAsset!.symbol}`} bold colors={colors} />
            <DetailRow label={translate('+ gas in')} value={`~${formatBigIntAmount(gasFeeWei * 2n, 18, 6, true)} ETH`} muted colors={colors} />
          </>
        ) : (
          <DetailRow
            label={translate('Total')}
            value={
              selectedAsset!.network === 'mozaga' && selectedAsset!.symbol === 'EXO'
                ? `${formatBigIntAmount((selectedAmountUnits ?? 0n) + (donationQuote?.amountUnits ?? 0n) + (EXO_NETWORK_FEE_WEI * 2n), 18, 6)} EXO`
                : isEvmNetwork(selectedAsset!.network)
                  ? `~${formatBigIntAmount((selectedAmountUnits ?? 0n) + (donationQuote?.amountUnits ?? 0n) + (gasFeeWei * 2n), selectedAsset!.decimals, 6)} ${selectedAsset!.symbol}`
                  : `${formatBigIntAmount((selectedAmountUnits ?? 0n) + (donationQuote?.amountUnits ?? 0n), selectedAsset!.decimals, Math.min(selectedAsset!.decimals, 8), true)} ${selectedAsset!.symbol}`
            }
            bold
            colors={colors}
          />
        )}
      </View>

      <View className="rounded-xl p-4 mb-6" style={{ backgroundColor: colors.warning + '14', borderWidth: 1, borderColor: colors.warning + '33' }}>
        <View className="flex-row items-start gap-3">
          <AlertCircle size={18} color={colors.warning} />
          <Text className="text-sm flex-1" style={{ color: colors.warning }}>
            {translate('Verify the recipient. Transactions cannot be reversed once confirmed.')}
          </Text>
        </View>
      </View>

      <View className="gap-3 mb-8">
        <Pressable
          onPress={handleConfirmSend}
          className="w-full flex-row items-center justify-center gap-2 rounded-xl py-4"
          style={{ backgroundColor: networkAccent }}
        >
          <Send size={18} color="white" />
          <Text className="text-white font-semibold text-base">{translate('Confirm & Send')}</Text>
        </Pressable>
        <Pressable
          onPress={handleBack}
          className="w-full rounded-xl py-4 items-center"
          style={{ backgroundColor: colors.surface }}
        >
          <Text className="font-semibold text-base" style={{ color: colors.text }}>{translate('Cancel')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  )

  const renderSendingState = () => (
    <View className="flex-1 items-center justify-center px-6">
      <ActivityIndicator size="large" color={networkAccent} />
      <Text className="text-xl font-semibold mt-6 mb-2" style={{ color: colors.text }}>
        {translate('Sending Transaction')}
      </Text>
      <Text className="text-center text-sm" style={{ color: colors.textMuted }}>
        {translate('Broadcasting to {{network}}...', {
          network: translate(CRYPTO_NETWORK_BY_ID[selectedAsset?.network || network]?.name || 'Mozaga Mainnet'),
        })}
      </Text>
    </View>
  )

  const [txHashCopied, setTxHashCopied] = useState(false)

  const handleCopyTxHash = async () => {
    if (!txHash) return
    await Clipboard.setStringAsync(txHash)
    setTxHashCopied(true)
    setTimeout(() => setTxHashCopied(false), 2000)
  }

  const handleViewExplorer = () => {
    if (!txHash) return
    const url = getExplorerTxUrl(txHash)
    if (url) {
      void openExternalUrl(url).catch((error) => {
        if (__DEV__) console.warn('Failed to open transaction explorer:', error)
      })
    }
  }

  const renderSuccessState = () => {
    const explorerTxUrl = txHash ? getExplorerTxUrl(txHash) : null
    return (
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-20 h-20 rounded-full items-center justify-center mb-5" style={{ backgroundColor: colors.success + '26' }}>
          <Check size={40} color={colors.success} />
        </View>
        <Text className="text-2xl font-bold mb-2" style={{ color: colors.text }}>{translate('Transaction Sent')}</Text>
        <Text className="text-center mb-5" style={{ color: colors.textMuted }}>
          {translate('{{amount}} {{symbol}} sent', {
            amount,
            symbol: selectedAsset?.symbol ?? '',
          })}
        </Text>
        {txHash && (
          <View className="w-full mb-6">
            <View className="rounded-xl p-4 mb-3" style={{ backgroundColor: colors.surface + 'CC' }}>
              <Text className="text-xs mb-1" style={{ color: colors.textMuted }}>{translate('Transaction Hash')}</Text>
              <Text className="font-mono text-xs" style={{ color: colors.text }} numberOfLines={2} selectable>
                {txHash}
              </Text>
            </View>
            {donationTxHash && donationTxHash !== txHash ? (
              <View className="rounded-xl p-4 mb-3" style={{ backgroundColor: colors.surface + 'CC' }}>
                <Text className="text-xs mb-1" style={{ color: colors.textMuted }}>{translate('Contribution Transaction Hash', { ns: 'crypto' })}</Text>
                <Text className="font-mono text-xs" style={{ color: colors.text }} numberOfLines={2} selectable>
                  {donationTxHash}
                </Text>
              </View>
            ) : null}
            <View className="flex-row gap-3">
              <Pressable
                onPress={handleCopyTxHash}
                className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl active:opacity-80"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                {txHashCopied ? (
                  <Check size={15} color={colors.success} />
                ) : (
                  <Copy size={15} color={colors.text} />
                )}
                <Text className="font-semibold text-sm" style={{ color: colors.text }}>
                  {txHashCopied ? translate('Copied!') : translate('Copy Hash')}
                </Text>
              </Pressable>
              {explorerTxUrl ? (
                <Pressable
                  onPress={handleViewExplorer}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl active:opacity-80"
                  style={{ backgroundColor: networkAccent }}
                >
                  <ExternalLink size={15} color="white" />
                  <Text className="text-white font-semibold text-sm">
                    {translate(selectedAsset?.network === 'ethereum' ? 'Etherscan' : 'Explorer')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
        <Pressable onPress={onClose} className="w-full rounded-xl py-4 items-center" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <Text className="font-semibold text-base" style={{ color: colors.text }}>{translate('Done')}</Text>
        </Pressable>
      </View>
    )
  }

  const renderPendingState = () => {
    const explorerTxUrl = txHash ? getExplorerTxUrl(txHash) : null
    return (
      <View className="flex-1 items-center justify-center px-6">
        <View className="w-20 h-20 rounded-full items-center justify-center mb-5" style={{ backgroundColor: colors.success + '26' }}>
          <Check size={40} color={colors.success} />
        </View>
        <Text className="text-2xl font-bold mb-2" style={{ color: colors.text }}>{translate('Transaction Submitted')}</Text>
        <Text className="text-center mb-5" style={{ color: colors.textMuted }}>
          {translate('The transaction was broadcast but is not confirmed yet. Check the transaction hash before sending again.')}
        </Text>
        {txHash && (
          <View className="w-full mb-6">
            <View className="rounded-xl p-4 mb-3" style={{ backgroundColor: colors.surface + 'CC' }}>
              <Text className="text-xs mb-1" style={{ color: colors.textMuted }}>{translate('Transaction Hash')}</Text>
              <Text className="font-mono text-xs" style={{ color: colors.text }} numberOfLines={2} selectable>
                {txHash}
              </Text>
            </View>
            {donationTxHash && donationTxHash !== txHash ? (
              <View className="rounded-xl p-4 mb-3" style={{ backgroundColor: colors.surface + 'CC' }}>
                <Text className="text-xs mb-1" style={{ color: colors.textMuted }}>{translate('Contribution Transaction Hash', { ns: 'crypto' })}</Text>
                <Text className="font-mono text-xs" style={{ color: colors.text }} numberOfLines={2} selectable>
                  {donationTxHash}
                </Text>
              </View>
            ) : null}
            <View className="flex-row gap-3">
              <Pressable
                onPress={handleCopyTxHash}
                className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl active:opacity-80"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
              >
                {txHashCopied ? (
                  <Check size={15} color={colors.success} />
                ) : (
                  <Copy size={15} color={colors.text} />
                )}
                <Text className="font-semibold text-sm" style={{ color: colors.text }}>
                  {txHashCopied ? translate('Copied!') : translate('Copy Hash')}
                </Text>
              </Pressable>
              {explorerTxUrl ? (
                <Pressable
                  onPress={handleViewExplorer}
                  className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl active:opacity-80"
                  style={{ backgroundColor: networkAccent }}
                >
                  <ExternalLink size={15} color="white" />
                  <Text className="text-white font-semibold text-sm">
                    {translate(selectedAsset?.network === 'ethereum' ? 'Etherscan' : 'Explorer')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
        <Pressable onPress={onClose} className="w-full rounded-xl py-4 items-center" style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
          <Text className="font-semibold text-base" style={{ color: colors.text }}>{translate('Done')}</Text>
        </Pressable>
      </View>
    )
  }

  const renderErrorState = () => (
    <View className="flex-1 items-center justify-center px-6">
      <View className="w-20 h-20 rounded-full items-center justify-center mb-5" style={{ backgroundColor: colors.error + '26' }}>
        <AlertCircle size={40} color={colors.error} />
      </View>
      <Text className="text-2xl font-bold mb-2" style={{ color: colors.text }}>{translate('Transaction Failed')}</Text>
      <Text className="text-center mb-6 text-sm" style={{ color: colors.textMuted }}>
        {error || translate('Something went wrong. Please try again.')}
      </Text>
      <View className="w-full gap-3">
        <Pressable onPress={() => { setSendState('amount'); setError(null) }} className="w-full rounded-xl py-4 items-center" style={{ backgroundColor: networkAccent }}>
          <Text className="text-white font-semibold text-base">{translate('Try Again')}</Text>
        </Pressable>
        <Pressable onPress={onClose} className="w-full rounded-xl py-4 items-center" style={{ backgroundColor: colors.surface }}>
          <Text className="font-semibold text-base" style={{ color: colors.text }}>{translate('Cancel')}</Text>
        </Pressable>
      </View>
    </View>
  )

  const renderContent = () => {
    if (!transfersAllowed) {
      return (
        <View className="flex-1 items-center justify-center px-6">
          <AlertCircle size={44} color={colors.error} />
          <Text className="text-xl font-semibold mt-4 text-center" style={{ color: colors.text }}>
            {translate('Spectre Mode')}
          </Text>
          <Text className="text-center mt-2" style={{ color: colors.textMuted }}>
            {translate(SPECTRE_TRANSFER_MESSAGE)}
          </Text>
          <Pressable
            onPress={onClose}
            className="w-full rounded-xl py-4 items-center mt-6"
            style={{ backgroundColor: colors.surface }}
          >
            <Text className="font-semibold text-base" style={{ color: colors.text }}>{translate('Close')}</Text>
          </Pressable>
        </View>
      )
    }

    switch (sendState) {
      case 'select': return renderSelectState()
      case 'amount': return renderAmountState()
      case 'confirming': return renderConfirmState()
      case 'sending': return renderSendingState()
      case 'success': return renderSuccessState()
      case 'pending': return renderPendingState()
      case 'error': return renderErrorState()
    }
  }

  const screenHeight = Dimensions.get('window').height
  const modalHeight = sendState === 'select' ? screenHeight * 0.85 : screenHeight * 0.75

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: colors.overlay }}>
        <View
          className="rounded-t-3xl overflow-hidden"
          style={{ height: modalHeight, paddingBottom: insets.bottom + 16, backgroundColor: colors.backgroundSecondary }}
        >
          <View className="items-center pt-3 pb-2">
            <View className="w-10 h-1 rounded-full" style={{ backgroundColor: colors.border }} />
          </View>

          <View className="flex-row items-center justify-between px-4 pb-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.surface }}>
            {showBackButton ? (
              <Pressable onPress={handleBack} className="w-10 h-10 items-center justify-center -ml-1">
                <ChevronLeft size={22} color={colors.text} />
              </Pressable>
            ) : (
              <View className="w-10" />
            )}
            <Text className="text-lg font-bold" style={{ color: colors.text }}>{getTitle()}</Text>
            {showCloseButton ? (
              <Pressable onPress={onClose} className="w-10 h-10 items-center justify-center -mr-1">
                <X size={18} color={colors.textTertiary} />
              </Pressable>
            ) : (
              <View className="w-10" />
            )}
          </View>

          {renderContent()}
        </View>
      </View>
    </Modal>
  )
}

function DetailRow({ label, value, mono, bold, muted, colors }: {
  label: string; value: string; mono?: boolean; bold?: boolean; muted?: boolean; colors: ReturnType<typeof import('@/lib/theme').useThemeColors>
}) {
  return (
    <View className="flex-row justify-between items-center py-1.5">
      <Text className="text-sm" style={{ color: muted ? colors.textMuted : colors.textTertiary }}>
        {label}
      </Text>
      <Text
        className={`text-sm ${mono ? 'font-mono' : ''} ${bold ? 'font-bold' : 'font-medium'}`}
        style={{ color: muted ? colors.textMuted : colors.text }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  )
}
