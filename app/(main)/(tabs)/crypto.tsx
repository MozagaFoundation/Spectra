/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Image,
  Modal,
  Alert,
} from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useFocusEffect, useIsFocused } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Copy,
  Check,
  Droplets,
  Shield,
  Globe,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Bell,
  CircleDollarSign,
  Sparkles,
  X,
} from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import { useUIStore } from '@/store/uiStore'
import { useWalletStore } from '@/store/walletStore'
import { useSpectreStore } from '@/store/spectreStore'
import { formatEthAddress, type TokenBalance } from '@/services/crypto/ethereumService'
import { getAssetClassName } from '@/services/crypto/mozagaBlockchain'
import {
  getMozagaExplorerTxUrl,
  getMozagaExplorerAddressUrl,
  getEthExplorerTxUrl,
  getEthExplorerAddressUrl,
  getBitcoinExplorerAddressUrl,
  getBitcoinExplorerTxUrl,
  getSolanaExplorerAddressUrl,
  getSolanaExplorerTxUrl,
  getTronExplorerAddressUrl,
  getTronExplorerTxUrl,
  type TxHistoryItem,
} from '@/services/crypto/transactionHistory'
import {
  getWalletAddressForNetwork,
  CRYPTO_NETWORK_BY_ID,
  type CryptoNetworkConfig,
  type CryptoNetworkId,
} from '@/services/crypto/chainRegistry'
import type { NetworkTokenBalance } from '@/services/crypto/tokenRegistry'
import { translate } from '@/lib/i18n'
import { formatAddress } from '@/lib/utils'
import { useCryptoTheme } from '@/lib/cryptoTheme'
import { CRYPTO_NETWORK_ICONS } from '@/lib/cryptoIcons'
import { TokenLogo } from '@/lib/tokenIcons'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { useCryptoPortfolio } from '@/hooks/useCryptoPortfolio'
import { openExternalUrl } from '@/services/tor/externalLinkPolicy'
import { useMarketPrices } from '@/hooks/useMarketPrices'
import { calculateAssetFiatCents, formatAssetFiatValue, formatFiatCents } from '@/services/crypto/fiatValuation'
import { useWalletTransferNotificationStore } from '@/store/walletTransferNotificationStore'
import { syncGlobalBadge } from '@/services/notifications/badgeSync'
import { WalletContributionNoticeModal } from '@/components/wallet/WalletContributionNoticeModal'
import {
  canUseCryptoNetworkInSpectre,
  getSpectreCryptoRestrictionMessage,
  isSpectrePolicyActive,
  type SpectreCryptoNetworkId,
} from '@/lib/spectrePolicy'
import {
  acknowledgeWalletContributionNotice,
  hasWalletContributionNotice,
} from '@/services/crypto/walletContributionNotice'

interface SelectedTokenRow {
  key: string
  symbol: string
  name: string
  balance: string
  decimals: number
  logoColor?: string | null
}

const FIAT_CURRENCY_DISPLAY: Record<string, { nameKey: string; symbol: string }> = {
  AUD: { nameKey: 'Australian Dollar', symbol: 'A$' },
  BRL: { nameKey: 'Brazilian Real', symbol: 'R$' },
  CAD: { nameKey: 'Canadian Dollar', symbol: 'C$' },
  EUR: { nameKey: 'Euro', symbol: '€' },
  GBP: { nameKey: 'British Pound', symbol: '£' },
  IDR: { nameKey: 'Indonesian Rupiah', symbol: 'Rp' },
  INR: { nameKey: 'Indian Rupee', symbol: '₹' },
  MXN: { nameKey: 'Mexican Peso', symbol: 'MX$' },
  PHP: { nameKey: 'Philippine Peso', symbol: '₱' },
  USD: { nameKey: 'US Dollar', symbol: '$' },
  VES: { nameKey: 'Venezuelan Bolívar', symbol: 'Bs' },
}

function getFiatCurrencyDisplay(code: string): { name: string; symbol: string } {
  const normalizedCode = code.trim().toUpperCase()
  const display = FIAT_CURRENCY_DISPLAY[normalizedCode]
  return {
    name: display ? translate(display.nameKey) : normalizedCode,
    symbol: display?.symbol ?? normalizedCode,
  }
}

function parseNetworkParam(value?: string | string[]): CryptoNetworkId | null {
  const rawValue = Array.isArray(value) ? value[0] : value
  return rawValue && rawValue in CRYPTO_NETWORK_BY_ID ? rawValue as CryptoNetworkId : null
}

function getTransactionTokenSymbol(tx: TxHistoryItem): string | null {
  if (tx.category !== 'token_transfer') return null

  const typeNameMatch = tx.typeName.match(/^(.+)\s+Transfer$/)
  if (typeNameMatch?.[1]) return typeNameMatch[1].trim()

  const valueMatch = tx.value.trim().match(/\s([A-Za-z0-9]+)$/)
  return valueMatch?.[1] ?? null
}

function formatTransactionAmount(tx: TxHistoryItem, nativeSymbol: string, tokenSymbol: string | null): string {
  if (!tokenSymbol) return `${tx.value} ${nativeSymbol}`

  const valueAlreadyIncludesToken = tx.value
    .trim()
    .toUpperCase()
    .endsWith(` ${tokenSymbol.toUpperCase()}`)

  return valueAlreadyIncludesToken ? tx.value : `${tx.value} ${tokenSymbol}`
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp || !Number.isFinite(timestamp)) return ''
  const millis = timestamp < 1e12 ? timestamp * 1000 : timestamp
  const diffSeconds = Math.max(0, Math.floor((Date.now() - millis) / 1000))
  if (diffSeconds < 60) return translate('Just now')
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return translate('{{count}}m ago', { count: diffMinutes })
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return translate('{{count}}h ago', { count: diffHours })
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return translate('{{count}}d ago', { count: diffDays })
  const diffWeeks = Math.floor(diffDays / 7)
  if (diffWeeks < 5) return translate('{{count}}w ago', { count: diffWeeks })
  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths < 12) return translate('{{count}}mo ago', { count: diffMonths })
  const diffYears = Math.floor(diffDays / 365)
  return translate('{{count}}y ago', { count: diffYears })
}

export default function CryptoScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const { network: networkParam } = useLocalSearchParams<{ network?: string }>()
  const wallet = useWalletStore((state) => state.wallet)
  const { colors, accent, alpha, assetClassAccent, resolveExternalAccent } = useCryptoTheme()
  const { t } = useTranslation(['common', 'navigation'])
  const requestedNetwork = parseNetworkParam(networkParam)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const spectreAccountMode = useSpectreStore((state) => state.spectreAccountMode)
  const markWalletTransferNetworkRead = useWalletTransferNotificationStore((state) => state.markChainRead)
  const walletTransferCountsByChain = useWalletTransferNotificationStore((state) => state.countsByChain)
  const spectrePolicyState = useMemo(() => ({
    enabled: spectreEnabled,
    accountMode: spectreAccountMode,
    walletIsSpectre: wallet?.spectreMode === true,
  }), [spectreAccountMode, spectreEnabled, wallet?.spectreMode])
  const preferredFiatCurrency = useUIStore((state) => state.preferredFiatCurrency)
  const setPreferredFiatCurrency = useUIStore((state) => state.setPreferredFiatCurrency)
  const spectreCryptoRestricted = isSpectrePolicyActive(spectrePolicyState)
  const [overviewNetwork, setOverviewNetwork] = useState<CryptoNetworkId | null>(null)
  const [activatingNetwork, setActivatingNetwork] = useState<CryptoNetworkId | null>(null)

  const [selectedNetwork, setSelectedNetwork] = useState<CryptoNetworkId>(() => (
    requestedNetwork && wallet && getWalletAddressForNetwork(wallet, requestedNetwork)
      ? requestedNetwork
      : 'mozaga'
  ))
  const [copied, setCopied] = useState(false)
  const [showNetworkSelector, setShowNetworkSelector] = useState(false)
  const [showFiatSelector, setShowFiatSelector] = useState(false)
  const [showContributionNotice, setShowContributionNotice] = useState(false)
  const isFocused = useIsFocused()
  const {
    availableNetworks,
    balance,
    ethBalance,
    tokens,
    networkBalances,
    networkTokens,
    nativeAssets,
    portfolioRows,
    recentActivity,
    mozagaTxs,
    ethTxs,
    networkTxs,
    historyErrorsByChain,
    historyStatusByChain,
    historyStatusError,
    isLoading,
    isLoadingEth,
    isLoadingExternalBalances,
    isLoadingExternalTokens,
    isLoadingAssets,
    isLoadingTxs,
    isLoadingHistoryStatus,
    isRefreshing,
    isFetchingTxs,
    refreshAll,
  } = useCryptoPortfolio(spectreCryptoRestricted ? null : wallet)
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
  const availableFiatCodes = useMemo(() => {
    const rateCodes = marketPrices?.fiatRates
      .map((rate) => rate.code.trim().toUpperCase())
      .filter((code) => /^[A-Z]{3}$/.test(code)) ?? []
    return Array.from(new Set([...Object.keys(FIAT_CURRENCY_DISPLAY), ...rateCodes])).sort()
  }, [marketPrices])
  const isNetworkAllowedInSpectre = useCallback((network: CryptoNetworkId) => (
    canUseCryptoNetworkInSpectre(spectrePolicyState, network as SpectreCryptoNetworkId)
  ), [spectrePolicyState])

  const visibleAvailableNetworks = useMemo(
    () => availableNetworks.filter((network) => isNetworkAllowedInSpectre(network.id)),
    [availableNetworks, isNetworkAllowedInSpectre],
  )
  const visiblePortfolioRows = useMemo(
    () => portfolioRows.filter((row) => isNetworkAllowedInSpectre(row.id)),
    [isNetworkAllowedInSpectre, portfolioRows],
  )
  const portfolioTotalFiatLabel = useMemo(() => {
    if (!marketPrices) return null
    const values: Array<{ symbol: string; balance: string; decimals: number }> = [
      ...visiblePortfolioRows
        .map((row) => ({
          symbol: row.nativeSymbol,
          balance: row.balance,
          decimals: CRYPTO_NETWORK_BY_ID[row.id].decimals,
        })),
      ...nativeAssets.map((asset) => ({
        symbol: asset.symbol,
        balance: asset.balanceFormatted,
        decimals: asset.decimals,
      })),
      ...tokens.map((token) => ({
        symbol: token.symbol,
        balance: token.balance,
        decimals: token.decimals,
      })),
      ...Object.values(networkTokens).flat().map((token) => ({
        symbol: token.symbol,
        balance: token.balance,
        decimals: token.decimals,
      })),
    ]
    let total = 0n
    let hasValue = false
    for (const value of values) {
      const cents = calculateAssetFiatCents({
        ...value,
        prices: marketPrices,
        fiatCode: preferredFiatCurrency,
      })
      if (cents !== null) {
        total += cents
        hasValue = true
      }
    }
    const formatted = hasValue ? formatFiatCents(total, preferredFiatCurrency) : null
    return formatted ? `~ ${formatted}` : null
  }, [marketPrices, nativeAssets, networkTokens, preferredFiatCurrency, tokens, visiblePortfolioRows])
  const detailNetwork = requestedNetwork ?? overviewNetwork
  const selectedNetworkConfig: CryptoNetworkConfig = CRYPTO_NETWORK_BY_ID[selectedNetwork] || CRYPTO_NETWORK_BY_ID.mozaga
  const selectedAddress = wallet ? getWalletAddressForNetwork(wallet, selectedNetwork) : undefined
  const isMozaga = selectedNetwork === 'mozaga'
  const mozagaAccent = accent('mozaga')
  const marketsAccent = accent('markets')
  const sentAccent = accent('negative')
  const receivedAccent = accent('positive')
  const accentColor = accent(selectedNetworkConfig.accentName)
  const safeExplorerUrl = (buildUrl: () => string): string | null => {
    try {
      return buildUrl()
    } catch {
      return null
    }
  }
  const getExplorerAddressUrl = (network: CryptoNetworkId, address: string): string | null => {
    switch (network) {
      case 'mozaga': return safeExplorerUrl(() => getMozagaExplorerAddressUrl(address))
      case 'ethereum': return getEthExplorerAddressUrl(address)
      case 'bitcoin': return getBitcoinExplorerAddressUrl(address)
      case 'solana': return getSolanaExplorerAddressUrl(address)
      case 'tron': return getTronExplorerAddressUrl(address)
    }
  }
  const getExplorerTxUrl = (network: CryptoNetworkId, hash: string): string | null => {
    switch (network) {
      case 'mozaga': return safeExplorerUrl(() => getMozagaExplorerTxUrl(hash))
      case 'ethereum': return getEthExplorerTxUrl(hash)
      case 'bitcoin': return getBitcoinExplorerTxUrl(hash)
      case 'solana': return getSolanaExplorerTxUrl(hash)
      case 'tron': return getTronExplorerTxUrl(hash)
    }
  }

  const handleRefresh = refreshAll

  const handleActivateWalletIndex = useCallback(async (network: CryptoNetworkId) => {
    if (!wallet || activatingNetwork || !isNetworkAllowedInSpectre(network)) return
    setActivatingNetwork(network)
    try {
      const { activateWalletIndex } = await import('@/services/wallet/walletIndexActivation')
      await activateWalletIndex(wallet, network)
      await refreshAll()
    } catch (error) {
      Alert.alert(
        translate('Wallet indexing'),
        error instanceof Error ? error.message : translate('Could not activate wallet indexing'),
      )
    } finally {
      setActivatingNetwork(null)
    }
  }, [activatingNetwork, isNetworkAllowedInSpectre, refreshAll, wallet])

  const handleCopy = async () => {
    const addr = wallet ? getWalletAddressForNetwork(wallet, selectedNetwork) : undefined
    if (addr) {
      await Clipboard.setStringAsync(addr)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSwitchNetwork = (network: CryptoNetworkId) => {
    if (!wallet || !getWalletAddressForNetwork(wallet, network)) return
    if (!isNetworkAllowedInSpectre(network)) return
    setSelectedNetwork(network)
    setCopied(false)
    setShowNetworkSelector(false)
  }

  const handleOpenNetwork = (network: CryptoNetworkId) => {
    if (!wallet || !getWalletAddressForNetwork(wallet, network)) return
    if (!isNetworkAllowedInSpectre(network)) return
    setSelectedNetwork(network)
    setOverviewNetwork(network)
    setCopied(false)
    setShowNetworkSelector(false)
  }

  const handleBackToOverview = () => {
    setOverviewNetwork(null)
    setCopied(false)
    setShowNetworkSelector(false)
  }

  const handleSelectFiatCurrency = (code: string) => {
    setShowFiatSelector(false)
    void setPreferredFiatCurrency(code)
  }

  useEffect(() => {
    if (!detailNetwork || !wallet || !getWalletAddressForNetwork(wallet, detailNetwork)) {
      return
    }
    if (!isNetworkAllowedInSpectre(detailNetwork)) {
      setOverviewNetwork(null)
      return
    }

    setSelectedNetwork(detailNetwork)
    setCopied(false)
    setShowNetworkSelector(false)
  }, [detailNetwork, isNetworkAllowedInSpectre, wallet])

  useFocusEffect(
    useCallback(() => {
      if (!detailNetwork || !wallet || !getWalletAddressForNetwork(wallet, selectedNetwork) || !isNetworkAllowedInSpectre(selectedNetwork)) {
        return
      }

      void markWalletTransferNetworkRead(selectedNetwork)
        .then(() => syncGlobalBadge())
        .catch((error) => {
          if (__DEV__) console.warn('[WalletNotifications] Failed to clear network badge:', error)
        })
    }, [detailNetwork, isNetworkAllowedInSpectre, markWalletTransferNetworkRead, selectedNetwork, wallet]),
  )

  useFocusEffect(
    useCallback(() => {
      if (!wallet) {
        setShowContributionNotice(false)
        return
      }

      let cancelled = false
      void hasWalletContributionNotice()
        .then((seen) => {
          if (!cancelled) setShowContributionNotice(!seen)
        })
        .catch((error) => {
          if (__DEV__) console.warn('[Wallets] Failed to load contribution notice:', error)
        })

      return () => {
        cancelled = true
      }
    }, [wallet]),
  )

  const handleAcknowledgeContributionNotice = useCallback(async () => {
    try {
      await acknowledgeWalletContributionNotice()
      setShowContributionNotice(false)
    } catch (error) {
      if (__DEV__) console.warn('[Wallets] Failed to persist contribution notice:', error)
    }
  }, [])

  const contributionNoticeModal = (
    <WalletContributionNoticeModal
      visible={Boolean(wallet) && isFocused && showContributionNotice}
      onAcknowledge={handleAcknowledgeContributionNotice}
    />
  )

  if (!wallet) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-text text-lg">{translate('No wallet found')}</Text>
      </View>
    )
  }

  if (detailNetwork && !isNetworkAllowedInSpectre(detailNetwork)) {
    const restrictionMessage = getSpectreCryptoRestrictionMessage(
      spectrePolicyState,
      detailNetwork as SpectreCryptoNetworkId,
    )
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
          <Text className="flex-1 text-2xl font-bold text-text">{translate('Unavailable')}</Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Shield size={40} color={accent('mozaga')} />
          <Text className="text-text text-xl font-semibold mt-4 text-center">{translate('Spectre Mode')}</Text>
          <Text className="text-text-muted text-center mt-2">
            {translate(restrictionMessage ?? 'This crypto network is unavailable in Spectre Mode.')}
          </Text>
        </View>
        {contributionNoticeModal}
      </View>
    )
  }

  const currentBalance = selectedNetwork === 'mozaga'
    ? balance
    : selectedNetwork === 'ethereum'
      ? ethBalance
      : networkBalances[selectedNetwork] || '0.0'
  const currentSymbol = selectedNetworkConfig.nativeSymbol
  const currentLoading = selectedNetwork === 'mozaga'
    ? isLoading
    : selectedNetwork === 'ethereum'
      ? isLoadingEth
      : isLoadingExternalBalances
  const selectedTokenRows: SelectedTokenRow[] = selectedNetwork === 'ethereum'
    ? tokens.map((token: TokenBalance) => ({
      key: token.address,
      symbol: token.symbol,
      name: token.name,
      balance: token.balance,
      decimals: token.decimals,
      logoColor: token.logoColor,
    }))
    : (networkTokens[selectedNetwork] || []).map((token: NetworkTokenBalance) => ({
      key: token.identifier,
      symbol: token.symbol,
      name: token.name,
      balance: token.balance,
      decimals: token.decimals,
      logoColor: token.logoColor,
    }))
  const showsTokenSection = selectedNetwork === 'ethereum' || selectedNetwork === 'solana' || selectedNetwork === 'tron'
  const tokenSectionLoading = selectedNetwork === 'ethereum' ? isLoadingEth : isLoadingExternalTokens
  const tokenSectionSubtitle = selectedNetwork === 'ethereum'
    ? translate('ERC-20 Tokens')
    : selectedNetwork === 'solana'
      ? translate('SPL Tokens')
      : translate('TRC-20 Tokens')
  const displayAddr = selectedAddress
    ? selectedNetwork === 'mozaga'
      ? formatAddress(selectedAddress, 8)
      : formatEthAddress(selectedAddress, 6)
    : translate('Unavailable')
  const currentFiatLabel = formatFiatValue(currentSymbol, currentBalance, selectedNetworkConfig.decimals)

  if (!detailNetwork) {
    const overviewRecentTxs = recentActivity
      .filter((tx) => isNetworkAllowedInSpectre(tx.network))
      .slice(0, 5)
    const totalUnreadTransfers = Object.values(walletTransferCountsByChain)
      .reduce((sum, count) => sum + (count || 0), 0)
    const indexedNetworks = visiblePortfolioRows.length
    const overviewLoading = isLoading || isLoadingEth || isLoadingExternalBalances

    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={mozagaAccent}
            />
          }
        >
          <View className="flex-row justify-between items-end mb-5 mt-1">
            <View className="flex-1 pr-3">
              <Text
                className="text-[11px] font-semibold uppercase mb-1"
                style={{ color: alpha(mozagaAccent, 0.85), letterSpacing: 1.4 }}
              >
                {translate('Spectra')}
              </Text>
              <Text className="text-3xl font-bold text-text" style={{ letterSpacing: -0.5 }}>
                {t('Wallets', { ns: 'navigation' })}
              </Text>
              <Text className="text-text-muted text-sm mt-1">
                {translate('Select a cryptocurrency')}
              </Text>
            </View>
            <Pressable
              onPress={handleRefresh}
              className="w-11 h-11 rounded-2xl items-center justify-center active:opacity-70"
              style={{
                backgroundColor: alpha(mozagaAccent, 0.10),
                borderWidth: 1,
                borderColor: alpha(mozagaAccent, 0.22),
              }}
            >
              <RefreshCw size={18} color={mozagaAccent} />
            </Pressable>
          </View>

          <View
            className="rounded-3xl p-5 mb-4 overflow-hidden"
            style={{
              backgroundColor: alpha(mozagaAccent, 0.10),
              borderWidth: 1,
              borderColor: alpha(mozagaAccent, 0.22),
            }}
          >
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: -60,
                right: -40,
                width: 200,
                height: 200,
                borderRadius: 200,
                backgroundColor: alpha(mozagaAccent, 0.18),
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                bottom: -80,
                left: -40,
                width: 180,
                height: 180,
                borderRadius: 180,
                backgroundColor: alpha(mozagaAccent, 0.10),
              }}
            />
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <View className="flex-row items-center gap-1.5 mb-2">
                  <Sparkles size={12} color={mozagaAccent} />
                  <Text
                    className="text-[10px] font-semibold uppercase"
                    style={{ color: mozagaAccent, letterSpacing: 1.5 }}
                  >
                    {translate('Portfolio')}
                  </Text>
                </View>
                <View className="flex-row items-baseline gap-2">
                  <Text className="text-5xl font-bold text-text" style={{ letterSpacing: -1.5 }}>
                    {indexedNetworks}
                  </Text>
                  <Text className="text-text-secondary text-base font-medium">
                    {translate(indexedNetworks === 1 ? 'chain' : 'chains')}
                  </Text>
                </View>
                <Text className="text-text-muted text-xs mt-1.5">
                  {translate('Privately indexed by Spectra')}
                </Text>
              </View>
              <View
                className="w-14 h-14 rounded-2xl items-center justify-center"
                style={{
                  backgroundColor: alpha(mozagaAccent, 0.18),
                  borderWidth: 1,
                  borderColor: alpha(mozagaAccent, 0.28),
                }}
              >
                <Layers size={26} color={mozagaAccent} />
              </View>
            </View>

            <View
              className="flex-row mt-5 rounded-2xl overflow-hidden"
              style={{
                backgroundColor: alpha(mozagaAccent, 0.08),
                borderWidth: 1,
                borderColor: alpha(mozagaAccent, 0.16),
              }}
            >
              <View className="flex-1 p-3.5">
                <View className="flex-row items-center gap-1.5 mb-1.5">
                  <Bell size={12} color={mozagaAccent} />
                  <Text
                    className="text-[10px] font-semibold uppercase"
                    style={{ color: colors.textTertiary, letterSpacing: 1 }}
                  >
                    {translate('Unread')}
                  </Text>
                </View>
                <Text className="text-text font-bold text-2xl" style={{ letterSpacing: -0.5 }}>
                  {totalUnreadTransfers}
                </Text>
                <Text className="text-text-muted text-[11px] mt-0.5">
                  {totalUnreadTransfers === 1
                    ? translate('new transfer')
                    : translate('new transfers')}
                </Text>
              </View>
              <View style={{ width: 1, backgroundColor: alpha(mozagaAccent, 0.16) }} />
              <Pressable
                onPress={() => setShowFiatSelector(true)}
                className="flex-1 p-3.5 active:opacity-70"
              >
                <View className="flex-row items-center gap-1.5 mb-1.5">
                  <CircleDollarSign size={12} color={mozagaAccent} />
                  <Text
                    className="text-[10px] font-semibold uppercase"
                    style={{ color: colors.textTertiary, letterSpacing: 1 }}
                  >
                    {preferredFiatCurrency}
                  </Text>
                  <ChevronDown size={12} color={colors.textTertiary} />
                </View>
                <Text className="text-text font-bold text-xl" numberOfLines={1} style={{ letterSpacing: -0.5 }}>
                  {portfolioTotalFiatLabel ?? translate('Unavailable')}
                </Text>
                <Text className="text-text-muted text-[11px] mt-0.5">
                  {translate('total balance')}
                </Text>
              </Pressable>
            </View>
          </View>

          <Modal
            visible={showFiatSelector}
            transparent
            animationType="slide"
            onRequestClose={() => setShowFiatSelector(false)}
          >
            <Pressable
              className="flex-1 justify-end"
              style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
              onPress={() => setShowFiatSelector(false)}
            >
              <Pressable
                className="rounded-t-[32px] overflow-hidden"
                style={{
                  backgroundColor: colors.surface,
                  borderTopWidth: 1,
                  borderTopColor: alpha(mozagaAccent, 0.18),
                  paddingBottom: insets.bottom + 16,
                  maxHeight: '85%',
                }}
                onPress={(event) => event.stopPropagation()}
              >
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: -80,
                    right: -40,
                    width: 220,
                    height: 220,
                    borderRadius: 220,
                    backgroundColor: alpha(mozagaAccent, 0.10),
                  }}
                />
                <View className="items-center pt-3 pb-1">
                  <View
                    style={{
                      width: 40,
                      height: 4,
                      borderRadius: 2,
                      backgroundColor: alpha(colors.text, 0.18),
                    }}
                  />
                </View>
                <View className="flex-row items-start justify-between px-5 pt-3 pb-4">
                  <View className="flex-1 pr-4">
                    <View className="flex-row items-center gap-2 mb-1.5">
                      <CircleDollarSign size={14} color={mozagaAccent} />
                      <Text
                        className="text-[10px] font-semibold uppercase"
                        style={{ color: mozagaAccent, letterSpacing: 1.4 }}
                      >
                        {translate('Portfolio')}
                      </Text>
                    </View>
                    <Text className="text-text text-2xl font-bold" style={{ letterSpacing: -0.5 }}>
                      {translate('Display currency')}
                    </Text>
                    <Text className="text-text-muted text-sm mt-1.5">
                      {translate('Choose the currency used for balance estimates.')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setShowFiatSelector(false)}
                    accessibilityLabel={translate('Close')}
                    className="w-10 h-10 rounded-full items-center justify-center active:opacity-70"
                    style={{
                      backgroundColor: alpha(colors.text, 0.08),
                      borderWidth: 1,
                      borderColor: alpha(colors.border, 0.6),
                    }}
                  >
                    <X size={18} color={colors.text} />
                  </Pressable>
                </View>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
                  bounces
                >
                  <View className="gap-2">
                    {availableFiatCodes.map((code) => {
                      const selected = code === preferredFiatCurrency
                      const currency = getFiatCurrencyDisplay(code)
                      return (
                        <Pressable
                          key={code}
                          onPress={() => handleSelectFiatCurrency(code)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          className="flex-row items-center rounded-2xl px-3.5 py-3 active:opacity-80"
                          style={{
                            backgroundColor: selected ? alpha(mozagaAccent, 0.14) : alpha(colors.text, 0.04),
                            borderWidth: 1,
                            borderColor: selected ? alpha(mozagaAccent, 0.45) : alpha(colors.border, 0.5),
                          }}
                        >
                          <View
                            className="w-11 h-11 rounded-2xl items-center justify-center mr-3.5"
                            style={{
                              backgroundColor: selected ? alpha(mozagaAccent, 0.22) : alpha(colors.text, 0.06),
                              borderWidth: 1,
                              borderColor: selected ? alpha(mozagaAccent, 0.35) : alpha(colors.border, 0.6),
                            }}
                          >
                            <Text
                              className="font-bold"
                              numberOfLines={1}
                              style={{
                                color: selected ? mozagaAccent : colors.text,
                                fontSize: 15,
                                letterSpacing: -0.3,
                              }}
                            >
                              {currency.symbol}
                            </Text>
                          </View>
                          <View className="flex-1 pr-2">
                            <View className="flex-row items-center gap-2">
                              <Text className="text-text text-base font-bold" style={{ letterSpacing: -0.2 }}>
                                {code}
                              </Text>
                              <View
                                className="rounded-full px-1.5 py-0.5"
                                style={{ backgroundColor: alpha(colors.text, 0.08) }}
                              >
                                <Text
                                  className="text-[10px] font-semibold"
                                  style={{ color: colors.textSecondary, letterSpacing: 0.4 }}
                                >
                                  {currency.symbol}
                                </Text>
                              </View>
                            </View>
                            <Text className="text-text-muted text-[13px] mt-0.5">{currency.name}</Text>
                          </View>
                          <View
                            className="w-7 h-7 rounded-full items-center justify-center"
                            style={{
                              backgroundColor: selected ? mozagaAccent : 'transparent',
                              borderWidth: selected ? 0 : 1.5,
                              borderColor: alpha(colors.border, 0.7),
                            }}
                          >
                            {selected && <Check size={16} color={colors.surface} strokeWidth={3} />}
                          </View>
                        </Pressable>
                      )
                    })}
                  </View>
                </ScrollView>
              </Pressable>
            </Pressable>
          </Modal>

          <View
            className="bg-surface rounded-3xl mb-4 overflow-hidden"
            style={{ borderWidth: 1, borderColor: colors.border }}
          >
            <View
              className="flex-row items-center justify-between px-5 pt-5 pb-3"
              style={{ borderBottomWidth: 1, borderBottomColor: alpha(colors.border, 0.6) }}
            >
              <View>
                <Text
                  className="text-text font-bold text-base"
                  style={{ letterSpacing: -0.3 }}
                >
                  {translate('Cryptocurrencies')}
                </Text>
                <Text className="text-text-muted text-[11px] mt-0.5">
                  {translate('Tap a wallet to view balance and history')}
                </Text>
              </View>
              {overviewLoading && (
                <ActivityIndicator size="small" color={mozagaAccent} />
              )}
            </View>

            {visiblePortfolioRows.length === 0 ? (
              <View className="items-center py-10 px-5">
                <Text className="text-text-muted text-sm">
                  {spectreCryptoRestricted
                    ? translate(getSpectreCryptoRestrictionMessage(spectrePolicyState, 'mozaga') ?? 'No wallets available')
                    : translate('No wallets available')}
                </Text>
              </View>
            ) : (
              <View>
                {visiblePortfolioRows.map((row, index) => {
                  const rowNetwork = CRYPTO_NETWORK_BY_ID[row.id]
                  const rowAccent = accent(rowNetwork.accentName)
                  const unreadCount = walletTransferCountsByChain[row.id] || 0
                  const indexActive = historyStatusByChain[row.id]?.is_registered === true
                  const indexActivating = activatingNetwork === row.id
                  const tokenSubtitle = row.tokenCount > 0
                    ? translate('{{count}} tokens', { count: row.tokenCount })
                    : translate('Native wallet')
                  const isLastRow = index === visiblePortfolioRows.length - 1
                  const fiatLabel = formatFiatValue(row.nativeSymbol, row.balance, rowNetwork.decimals)

                  return (
                    <Pressable
                      key={row.id}
                      onPress={() => handleOpenNetwork(row.id)}
                      className="flex-row items-center px-5 py-4 active:bg-surface-hover"
                      style={
                        isLastRow
                          ? undefined
                          : { borderBottomWidth: 1, borderBottomColor: alpha(colors.border, 0.5) }
                      }
                    >
                      <View
                        className="w-11 h-11 rounded-2xl items-center justify-center mr-3.5"
                        style={{
                          backgroundColor: alpha(rowAccent, 0.12),
                          borderWidth: 1,
                          borderColor: alpha(rowAccent, 0.20),
                        }}
                      >
                        <Image
                          source={CRYPTO_NETWORK_ICONS[row.id]}
                          style={{ width: 26, height: 26 }}
                          resizeMode="contain"
                        />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-2">
                          <Text
                            className="text-text font-semibold text-base"
                            style={{ letterSpacing: -0.2 }}
                          >
                            {translate(row.shortName)}
                          </Text>
                          {unreadCount > 0 && (
                            <View
                              className="min-w-[18px] h-[18px] rounded-full items-center justify-center px-1.5"
                              style={{ backgroundColor: rowAccent }}
                            >
                              <Text className="text-white text-[10px] font-bold">
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text className="text-text-muted text-[11px] mt-0.5">
                          {translate(row.name)} · {tokenSubtitle}
                        </Text>
                      </View>
                      <View className="items-end mr-2">
                        <View className="flex-row items-baseline gap-1">
                          <Text
                            className="text-text font-semibold text-base"
                            style={{ letterSpacing: -0.2 }}
                          >
                            {row.balance}
                          </Text>
                          <Text
                            className="text-text-muted text-[10px] font-semibold uppercase"
                            style={{ letterSpacing: 0.6 }}
                          >
                            {row.nativeSymbol}
                          </Text>
                        </View>
                        {fiatLabel ? (
                          <Text className="text-text-muted text-[10px] mt-0.5">
                            {fiatLabel}
                          </Text>
                        ) : null}
                      </View>
                      {indexActive ? (
                        <View
                          className="rounded-full px-2 py-1 mr-2"
                          style={{ backgroundColor: alpha(colors.success, 0.12) }}
                        >
                          <Text className="text-[10px] font-semibold" style={{ color: colors.success }}>
                            {translate('Active')}
                          </Text>
                        </View>
                      ) : (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={translate('Activate wallet indexing for {{network}}', {
                            network: row.shortName,
                          })}
                          disabled={indexActivating}
                          onPress={(event) => {
                            event.stopPropagation?.()
                            void handleActivateWalletIndex(row.id)
                          }}
                          className="rounded-full px-3 py-1.5 mr-2 active:opacity-70"
                          style={{
                            backgroundColor: alpha(rowAccent, 0.14),
                            opacity: indexActivating ? 0.6 : 1,
                          }}
                        >
                          {indexActivating ? (
                            <ActivityIndicator size="small" color={rowAccent} />
                          ) : (
                            <Text className="text-[11px] font-semibold" style={{ color: rowAccent }}>
                              {translate('Activate')}
                            </Text>
                          )}
                        </Pressable>
                      )}
                      <ChevronRight size={16} color={colors.textTertiary} />
                    </Pressable>
                  )
                })}
              </View>
            )}
          </View>

          <View
            className="bg-surface rounded-3xl overflow-hidden"
            style={{ borderWidth: 1, borderColor: colors.border }}
          >
            <View
              className="flex-row items-center justify-between px-5 pt-5 pb-3"
              style={{ borderBottomWidth: 1, borderBottomColor: alpha(colors.border, 0.6) }}
            >
              <View className="flex-row items-center gap-2">
                <Text
                  className="text-text font-bold text-base"
                  style={{ letterSpacing: -0.3 }}
                >
                  {translate('Recent Transactions')}
                </Text>
                {(isLoadingTxs || isFetchingTxs) && (
                  <ActivityIndicator size="small" color={mozagaAccent} />
                )}
              </View>
              {overviewRecentTxs.length > 0 && (
                <View
                  className="rounded-full px-2.5 py-1"
                  style={{ backgroundColor: alpha(mozagaAccent, 0.12) }}
                >
                  <Text
                    className="text-[10px] font-bold uppercase"
                    style={{ color: mozagaAccent, letterSpacing: 0.8 }}
                  >
                    {translate('{{count}} entries', { count: overviewRecentTxs.length })}
                  </Text>
                </View>
              )}
            </View>

            {overviewRecentTxs.length === 0 ? (
              <View className="items-center px-6 py-10">
                <View
                  className="w-16 h-16 rounded-3xl items-center justify-center mb-4"
                  style={{
                    backgroundColor: alpha(mozagaAccent, 0.10),
                    borderWidth: 1,
                    borderColor: alpha(mozagaAccent, 0.20),
                  }}
                >
                  <Clock size={26} color={mozagaAccent} />
                </View>
                <Text
                  className="text-text font-semibold text-sm"
                  style={{ letterSpacing: -0.2 }}
                >
                  {translate('No transactions yet')}
                </Text>
                <Text className="text-text-muted text-xs mt-1.5 text-center">
                  {translate('Your activity across every chain will appear here')}
                </Text>
              </View>
            ) : (
              <View>
                {overviewRecentTxs.map((tx, index) => {
                  const txNetwork = CRYPTO_NETWORK_BY_ID[tx.network] ? tx.network : 'mozaga'
                  const txNetworkConfig = CRYPTO_NETWORK_BY_ID[txNetwork]
                  const isSent = tx.direction === 'sent'
                  const isSelf = tx.direction === 'self'
                  const tokenSymbol = getTransactionTokenSymbol(tx)
                  const txAmount = formatTransactionAmount(tx, txNetworkConfig.nativeSymbol, tokenSymbol)
                  const networkAccent = accent(txNetworkConfig.accentName)
                  const directionAccent = isSelf ? networkAccent : isSent ? sentAccent : receivedAccent
                  const amountColor = isSelf ? colors.textSecondary : isSent ? colors.error : colors.success
                  const isLastTx = index === overviewRecentTxs.length - 1
                  const relativeTime = formatRelativeTime(tx.timestamp)
                  const txUrl = tx.hash ? getExplorerTxUrl(txNetwork, tx.hash) : null

                  return (
                    <Pressable
                      key={`${tx.network}:${tx.hash || index}`}
                      disabled={!txUrl}
                      onPress={() => txUrl && openExternalUrl(txUrl)}
                      className="flex-row items-center px-5 py-4 active:opacity-70"
                      style={
                        isLastTx
                          ? undefined
                          : { borderBottomWidth: 1, borderBottomColor: alpha(colors.border, 0.5) }
                      }
                    >
                      <View
                        className="w-10 h-10 rounded-2xl items-center justify-center mr-3"
                        style={{
                          backgroundColor: alpha(directionAccent, 0.14),
                          borderWidth: 1,
                          borderColor: alpha(directionAccent, 0.20),
                        }}
                      >
                        {isSelf ? (
                          <RefreshCw size={16} color={directionAccent} />
                        ) : isSent ? (
                          <ArrowUpRight size={16} color={directionAccent} />
                        ) : (
                          <ArrowDownLeft size={16} color={directionAccent} />
                        )}
                      </View>
                      <View className="flex-1 pr-3">
                        <View className="flex-row items-center gap-1.5 flex-wrap">
                          <Text
                            className="text-text font-semibold text-sm"
                            style={{ letterSpacing: -0.1 }}
                          >
                            {translate(isSelf ? 'Self transfer' : isSent ? 'Sent' : 'Received')}
                          </Text>
                          <View
                            className="rounded-md px-1.5 py-0.5"
                            style={{ backgroundColor: alpha(networkAccent, 0.14) }}
                          >
                            <Text
                              className="text-[9px] font-bold uppercase"
                              style={{ color: networkAccent, letterSpacing: 0.8 }}
                            >
                              {translate(txNetworkConfig.shortName)}
                            </Text>
                          </View>
                        </View>
                        <Text className="text-text-muted text-[11px] mt-1">
                          {relativeTime || translate('Pending')}
                        </Text>
                      </View>
                      <Text
                        className="font-bold text-sm"
                        style={{ color: amountColor, letterSpacing: -0.2 }}
                        numberOfLines={1}
                      >
                        {isSelf ? '' : isSent ? '−' : '+'}{txAmount}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            )}
          </View>
        </ScrollView>
        {contributionNoticeModal}
      </View>
    )
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={accentColor}
          />
        }
      >
        <View className="flex-row justify-between items-center mb-5">
          <View className="flex-row items-center gap-3 flex-1">
            {overviewNetwork && !requestedNetwork && (
              <Pressable
                onPress={handleBackToOverview}
                accessibilityRole="button"
                accessibilityLabel={translate('Back to all wallets')}
                hitSlop={10}
                className="w-10 h-10 rounded-2xl items-center justify-center active:opacity-70"
                style={{
                  backgroundColor: alpha(accentColor, 0.12),
                  borderWidth: 1,
                  borderColor: alpha(accentColor, 0.24),
                }}
              >
                <ChevronLeft size={22} color={accentColor} />
              </Pressable>
            )}
            <View className="flex-1">
              <Text
                className="text-2xl font-bold text-text"
                style={{ letterSpacing: -0.5 }}
                numberOfLines={1}
              >
                {t('Wallets', { ns: 'navigation' })}
              </Text>
              {overviewNetwork && !requestedNetwork && (
                <Text className="text-text-muted text-[11px] mt-0.5" numberOfLines={1}>
                  {translate(selectedNetworkConfig.name)}
                </Text>
              )}
            </View>
          </View>
          <Pressable
            onPress={handleRefresh}
            accessibilityRole="button"
            accessibilityLabel={translate('Refresh')}
            hitSlop={10}
            className="w-10 h-10 rounded-2xl items-center justify-center active:bg-surface-hover"
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <RefreshCw size={18} color={colors.textTertiary} />
          </Pressable>
        </View>

        {visibleAvailableNetworks.length > 1 && (
          <Pressable
            onPress={() => setShowNetworkSelector(true)}
            className="flex-row items-center gap-3 bg-surface rounded-2xl p-4 mb-5 active:bg-surface-hover"
          >
            <Image source={CRYPTO_NETWORK_ICONS[selectedNetwork]} style={{ width: 28, height: 28 }} resizeMode="contain" />
            <View className="flex-1">
              <Text className="text-text-muted text-xs">{translate('Blockchain')}</Text>
              <Text className="text-text font-semibold text-base">{translate(selectedNetworkConfig.name)}</Text>
            </View>
            <ChevronDown size={20} color={colors.textTertiary} />
          </Pressable>
        )}

        <View
          className="rounded-3xl p-6 mb-4 border"
          style={{
            backgroundColor: alpha(accentColor, 0.08),
            borderColor: alpha(accentColor, 0.2),
          }}
        >
          <View className="flex-row items-center gap-3 mb-4">
            <View
              className="w-12 h-12 rounded-2xl items-center justify-center"
              style={{ backgroundColor: alpha(accentColor, 0.2) }}
            >
              <Image
                source={CRYPTO_NETWORK_ICONS[selectedNetwork]}
                style={{ width: 24, height: 24 }}
                resizeMode="contain"
              />
            </View>
            <View className="flex-1">
              <Text className="text-text-muted text-sm">
                {translate('{{network}} Wallet', { network: selectedNetworkConfig.shortName })}
              </Text>
              <Pressable
                onPress={handleCopy}
                className="flex-row items-center gap-2"
              >
                <Text className="text-text font-mono text-sm">{displayAddr}</Text>
                {copied ? (
                  <Check size={14} color={colors.success} />
                ) : (
                  <Copy size={14} color={colors.textTertiary} />
                )}
              </Pressable>
            </View>
          </View>

          <View className="items-center py-4">
            {currentLoading ? (
              <ActivityIndicator size="large" color={accentColor} />
            ) : (
              <>
                <View className="flex-row items-baseline justify-center gap-2 mb-1">
                  <Text className="text-4xl font-bold text-text">{currentBalance}</Text>
                  <Text className="text-text-muted text-lg font-semibold uppercase">{currentSymbol}</Text>
                </View>
                {currentFiatLabel ? (
                  <Text className="text-text-muted text-sm mt-1">{currentFiatLabel}</Text>
                ) : null}
              </>
            )}
          </View>

          <View className="flex-row gap-3 mt-4">
            <Pressable
              onPress={() =>
                router.push(
                  selectedNetwork === 'mozaga'
                    ? '/(main)/crypto/send'
                    : selectedNetwork === 'ethereum'
                      ? '/(main)/crypto/send-eth'
                      : {
                        pathname: '/(main)/crypto/send-native',
                        params: { network: selectedNetwork },
                      }
                )
              }
              className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl active:opacity-80"
              style={{ backgroundColor: accentColor }}
            >
              <ArrowUpRight size={20} color="white" />
              <Text className="text-white font-semibold">{translate('Send')}</Text>
            </Pressable>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/(main)/crypto/receive',
                  params: { network: selectedNetwork },
                })
              }
              className="flex-1 flex-row items-center justify-center gap-2 bg-surface border border-border py-3 rounded-xl active:bg-surface-hover"
            >
              <ArrowDownLeft size={20} color={colors.text} />
              <Text className="text-text font-semibold">{translate('Receive')}</Text>
            </Pressable>
          </View>

          {isMozaga && (
            <View className="flex-row mt-3">
              <Pressable
                disabled
                accessibilityState={{ disabled: true }}
                className="flex-1 flex-row items-center justify-center gap-2 py-3 rounded-xl"
                style={{ backgroundColor: alpha(marketsAccent, 0.28) }}
              >
                <Droplets size={20} color={colors.textTertiary} />
                <Text className="text-text-muted font-semibold">{translate('Markets')}</Text>
              </Pressable>
            </View>
          )}
        </View>

        {showsTokenSection && (
          <View
            className="rounded-3xl p-4 mb-4 border"
            style={{
              backgroundColor: alpha(accentColor, 0.06),
              borderColor: alpha(accentColor, 0.16),
            }}
          >
            <View className="mb-4">
              <Text className="text-text font-semibold text-base">{translate('Tokens')}</Text>
              <Text className="text-text-muted text-xs mt-1">{tokenSectionSubtitle}</Text>
            </View>
            {tokenSectionLoading ? (
              <View className="py-6 items-center">
                <ActivityIndicator size="small" color={accentColor} />
              </View>
            ) : selectedTokenRows.length === 0 ? (
              <View className="py-5 items-center">
                <Text className="text-text-muted text-sm">{translate('No tokens found')}</Text>
              </View>
            ) : (
              <View className="gap-3">
                {selectedTokenRows.map((token) => {
                  const tokenColor = resolveExternalAccent(token.logoColor, selectedNetworkConfig.accentName)
                  const fiatLabel = formatFiatValue(token.symbol, token.balance, token.decimals)
                  return (
                    <View
                      key={token.key}
                      className="flex-row items-center rounded-2xl p-3 border"
                      style={{
                        backgroundColor: alpha(tokenColor, 0.07),
                        borderColor: alpha(tokenColor, 0.16),
                      }}
                    >
                      <View className="mr-3">
                        <TokenLogo
                          symbol={token.symbol}
                          name={token.name}
                          color={tokenColor}
                          backgroundColor={alpha(tokenColor, 0.14)}
                          size={42}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="text-text font-medium text-sm">{token.name}</Text>
                        <Text className="text-text-muted text-xs">{token.symbol}</Text>
                      </View>
                      <View className="items-end">
                        <View className="flex-row items-baseline gap-1">
                          <Text className="text-text font-semibold text-sm">{token.balance}</Text>
                          <Text className="text-text-muted text-xs uppercase">{token.symbol}</Text>
                        </View>
                        {fiatLabel ? (
                          <Text className="text-text-muted text-[10px] mt-0.5">{fiatLabel}</Text>
                        ) : null}
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
          </View>
        )}

        {isMozaga && (
          <View className="bg-surface rounded-2xl p-4 mb-4">
            <Text className="text-text font-semibold text-base mb-1">{translate('Native Assets')}</Text>
            <Text className="text-text-muted text-xs mb-3">{translate('Tokens on Mozaga')}</Text>
            {isLoadingAssets ? (
              <View className="py-6 items-center">
                <ActivityIndicator size="small" color={mozagaAccent} />
              </View>
            ) : nativeAssets.length === 0 ? (
              <View className="py-5 items-center">
                <Text className="text-text-muted text-sm">{translate('No native assets found')}</Text>
              </View>
            ) : (
              nativeAssets.map((asset, index) => {
                const color = assetClassAccent(asset.assetClass)
                const fiatLabel = formatFiatValue(asset.symbol, asset.balanceFormatted, asset.decimals)
                return (
                  <View
                    key={asset.tokenId}
                    className="flex-row items-center py-3"
                    style={
                      index < nativeAssets.length - 1
                        ? { borderBottomWidth: 1, borderBottomColor: colors.border + '80' }
                        : undefined
                    }
                  >
                    <View className="mr-3">
                      <TokenLogo
                        symbol={asset.symbol}
                        name={asset.name}
                        color={color}
                        backgroundColor={alpha(color, 0.12)}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className="text-text font-medium text-sm">{asset.name}</Text>
                      <Text className="text-text-muted text-xs">
                        {asset.symbol} · {translate(getAssetClassName(asset.assetClass))}
                      </Text>
                    </View>
                    <View className="items-end">
                      <View className="flex-row items-baseline gap-1">
                        <Text className="text-text font-semibold text-sm">{asset.balanceFormatted}</Text>
                        <Text className="text-text-muted text-xs uppercase">{asset.symbol}</Text>
                      </View>
                      {fiatLabel ? (
                        <Text className="text-text-muted text-[10px] mt-0.5">{fiatLabel}</Text>
                      ) : null}
                    </View>
                  </View>
                )
              })
            )}
          </View>
        )}

        <View className="bg-surface rounded-2xl p-4 mb-4">
          <View className="flex-row justify-between items-center mb-4">
            <View className="flex-row items-center gap-2">
              <Text className="text-text font-semibold text-base">{translate('Recent Transactions')}</Text>
              {(isLoadingTxs || isFetchingTxs) && (
                <ActivityIndicator size="small" color={accentColor} />
              )}
            </View>
            {(() => {
              const currentTxs = selectedNetwork === 'ethereum'
                ? ethTxs
                : selectedNetwork === 'mozaga'
                  ? mozagaTxs
                  : networkTxs[selectedNetwork] ?? []
              const addr = getWalletAddressForNetwork(wallet, selectedNetwork)
              if (currentTxs.length > 0 && addr) {
                const url = getExplorerAddressUrl(selectedNetwork, addr)
                if (!url) return null
                return (
                  <Pressable
                    onPress={() => openExternalUrl(url)}
                    className="flex-row items-center gap-1 active:opacity-70"
                  >
                    <Text style={{ color: accentColor }} className="text-sm font-medium">{translate('View All')}</Text>
                    <ExternalLink size={12} color={accentColor} />
                  </Pressable>
                )
              }
              return null
            })()}
          </View>

          {(() => {
            const currentTxs = selectedNetwork === 'ethereum'
              ? ethTxs
              : selectedNetwork === 'mozaga'
                ? mozagaTxs
                : networkTxs[selectedNetwork] ?? []
            const symbol = selectedNetworkConfig.nativeSymbol
            const historyStatus = historyStatusByChain[selectedNetwork]
            const indexerReportedError = (
              historyStatus?.latest_run_status === 'failed'
              || historyStatus?.latest_run_status === 'completed_with_errors'
            )
              ? historyStatus.latest_run_error
              : null
            const historyError = historyErrorsByChain[selectedNetwork] || historyStatusError || indexerReportedError
            const isHistoryUnregistered = historyStatus && !historyStatus.is_registered
            const isHistorySyncing = (
              isLoadingHistoryStatus
              || historyStatus?.latest_run_status === 'running'
              || historyStatus?.is_sync_complete === false
              || (!historyStatus && !historyError)
            )
            const emptyHistoryTitle = historyError
              ? translate('Unable to load transaction history')
              : isHistoryUnregistered
                ? translate('Wallet indexing is inactive')
              : isHistorySyncing
                ? translate('Transaction history is syncing')
                : translate('No transactions indexed for this wallet yet')
            const emptyHistorySubtitle = historyError
              ? translate('Pull to refresh or try again shortly')
              : isHistoryUnregistered
                ? translate('Activate indexing to save new activity on this device')
              : isHistorySyncing
                ? translate('Your private wallet index is catching up')
                : translate('New indexed transfers will appear here automatically')

            if (isLoadingTxs && currentTxs.length === 0) {
              return (
                <View className="items-center py-8">
                  <ActivityIndicator size="small" color={accentColor} />
                  <Text className="text-text-muted text-sm mt-2">{translate('Loading transactions...')}</Text>
                </View>
              )
            }

            if (currentTxs.length === 0) {
              return (
                <View className="items-center py-8">
                  <View className="w-14 h-14 rounded-full items-center justify-center mb-3"
                    style={{ backgroundColor: alpha(accentColor, 0.08) }}>
                    <Clock size={24} color={historyError ? colors.error : accentColor} />
                  </View>
                  <Text className="text-text-muted text-sm">{emptyHistoryTitle}</Text>
                  <Text className="text-text-muted text-xs mt-1">
                    {emptyHistorySubtitle}
                  </Text>
                </View>
              )
            }

            return (
              <View className="gap-2">
                {currentTxs.map((tx, index) => {
                  const isSent = tx.direction === 'sent'
                  const isSelf = tx.direction === 'self'
                  const txUrl = tx.hash ? getExplorerTxUrl(selectedNetwork, tx.hash) : null
                  const tokenSymbol = getTransactionTokenSymbol(tx)
                  const txAmount = formatTransactionAmount(tx, symbol, tokenSymbol)
                  const txAccent = isSelf ? accentColor : isSent ? sentAccent : receivedAccent
                  const statusLabel = tx.status === 'pending'
                    ? translate('Pending')
                    : tx.status === 'failed'
                      ? translate('Failed')
                      : tx.blockNumber
                        ? translate('Block {{blockNumber}}', { blockNumber: tx.blockNumber })
                        : translate('Confirmed')

                  return (
                    <Pressable
                      key={tx.hash || index}
                      disabled={!txUrl}
                      onPress={() => txUrl && openExternalUrl(txUrl)}
                      className="rounded-xl p-3 active:opacity-70"
                      style={{ backgroundColor: colors.background + 'cc' }}
                    >
                      <View className="flex-row items-center gap-3">
                        <View
                          className="w-10 h-10 rounded-full items-center justify-center"
                          style={{
                            backgroundColor: alpha(txAccent, 0.12),
                          }}
                        >
                          {tokenSymbol ? (
                            <TokenLogo
                              symbol={tokenSymbol}
                              color={txAccent}
                              backgroundColor={alpha(txAccent, 0.12)}
                              size={40}
                            />
                          ) : isSelf ? (
                            <RefreshCw size={18} color={accentColor} />
                          ) : isSent ? (
                            <ArrowUpRight size={18} color={colors.error} />
                          ) : (
                            <ArrowDownLeft size={18} color={colors.success} />
                          )}
                        </View>

                        <View className="flex-1">
                          <View className="flex-row items-center gap-1">
                            <Text className="text-text font-medium text-sm">
                              {translate(isSelf ? 'Self Transfer' : isSent ? 'Sent' : 'Received')}
                            </Text>
                            {tx.typeName && tx.typeName !== 'Transfer' && (
                              <Text className="text-text-muted text-xs">({tx.typeName})</Text>
                            )}
                          </View>
                          <Text className="text-text-muted text-xs font-mono">
                            {isSelf
                              ? formatAddress(tx.from, 6)
                              : isSent
                              ? translate('To {{address}}', { address: formatAddress(tx.to, 6) })
                              : translate('From {{address}}', { address: formatAddress(tx.from, 6) })}
                          </Text>
                        </View>

                        <View className="items-end">
                          <Text
                            className="font-semibold text-sm"
                            style={{
                              color: isSelf ? accentColor : isSent ? colors.error : colors.success,
                            }}
                          >
                            {isSelf ? '' : isSent ? '-' : '+'}{txAmount}
                          </Text>
                          <Text className="text-text-muted text-xs">{statusLabel}</Text>
                        </View>
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            )
          })()}
        </View>

        <View className="bg-surface rounded-2xl p-4">
          <View className="flex-row items-center gap-3 mb-3">
            <View
              className="w-10 h-10 rounded-xl items-center justify-center"
              style={{ backgroundColor: alpha(accentColor, 0.15) }}
            >
              <Globe size={20} color={accentColor} />
            </View>
            <View className="flex-1">
              <Text className="text-text font-medium">
                {translate(selectedNetworkConfig.name)}
              </Text>
              <Text className="text-text-muted text-sm">
                {translate('Chain {{chainId}}', { chainId: selectedNetworkConfig.chainIdLabel })}
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <View className="w-2 h-2 rounded-full bg-success" />
              <Text className="text-success text-xs font-medium">{translate('Connected')}</Text>
            </View>
          </View>

          <View className="rounded-xl p-3" style={{ backgroundColor: colors.background + 'cc' }}>
            {!isMozaga ? (
              <>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-text-muted text-sm">{translate('Account Type')}</Text>
                  <Text className="text-text text-sm">{translate(selectedNetworkConfig.accountType)}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-text-muted text-sm">{translate('Derivation')}</Text>
                  <Text className="text-text text-sm font-mono">{translate(selectedNetworkConfig.derivationLabel)}</Text>
                </View>
              </>
            ) : (
              <>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-text-muted text-sm">{translate('Account Type')}</Text>
                  <Text className="text-text text-sm">{translate('Post-quantum')}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-text-muted text-sm">{translate('Signature')}</Text>
                  <Text className="text-text text-sm">ML-DSA-65 (FIPS 204)</Text>
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>
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
              {visibleAvailableNetworks.map((network) => {
                const active = selectedNetwork === network.id
                const color = accent(network.accentName)
                return (
                  <Pressable
                    key={network.id}
                    onPress={() => handleSwitchNetwork(network.id)}
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
      {contributionNoticeModal}
    </View>
  )
}
