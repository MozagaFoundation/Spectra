/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Clock,
  User,
  Tag,
  ShoppingCart,
  Gift,
} from 'lucide-react-native'
import { useWalletStore, toast } from '@/store'
import { waitForTransaction } from '@/services/crypto'
import {
  getPredictionMarket,
  getPredictionOrderBook,
  getAllPositions,
  placeOrder,
  redeemWinnings,
  priceToPercent,
  getMarketStatusName,
  PredictionMarketStatus,
  PredictionOrderType,
  PRICE_PRECISION,
} from '@/services/crypto/predictionService'
import type {
  PredictionMarketInfo,
  OrderBookSnapshot,
  PositionInfo,
} from '@/services/crypto/predictionService'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { useThemeColors } from '@/lib/theme'
import { formatBigIntAmount, formatLocalizedNumber, formatLocalizedPercent, parseDecimalToBigInt } from '@/lib/amounts'
import { translate } from '@/lib/i18n'
import { formatMarketEXO, isValidMarketEntityId, truncateMarketAddress } from '@/lib/markets'

function formatCountdown(ts: number): string {
  const now = Date.now() / 1000
  const diff = ts - now
  if (diff <= 0) return translate('Closed')
  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (d > 0) return `${translate('duration.days', { count: d })} ${translate('duration.hours', { count: h })}`
  if (h > 0) return `${translate('duration.hours', { count: h })} ${translate('duration.minutes', { count: m })}`
  return translate('duration.minutes', { count: m })
}

const STATUS_COLORS: Record<number, { bg: string; text: string }> = {
  [PredictionMarketStatus.Active]: { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  [PredictionMarketStatus.Resolved]: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  [PredictionMarketStatus.Closed]: { bg: 'bg-zinc-500/15', text: 'text-zinc-400' },
  [PredictionMarketStatus.Pending]: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
  [PredictionMarketStatus.Halted]: { bg: 'bg-rose-500/15', text: 'text-rose-400' },
  [PredictionMarketStatus.Resolving]: { bg: 'bg-cyan-500/15', text: 'text-cyan-400' },
  [PredictionMarketStatus.Disputed]: { bg: 'bg-orange-500/15', text: 'text-orange-400' },
  [PredictionMarketStatus.Cancelled]: { bg: 'bg-zinc-500/15', text: 'text-zinc-400' },
  [PredictionMarketStatus.Invalid]: { bg: 'bg-zinc-500/15', text: 'text-zinc-400' },
}

const EXPIRATION_OPTIONS = [
  { count: 1, translationKey: 'duration.hours', seconds: 3600 },
  { count: 4, translationKey: 'duration.hours', seconds: 14400 },
  { count: 24, translationKey: 'duration.hours', seconds: 86400 },
  { count: 7, translationKey: 'duration.days', seconds: 604800 },
]

export default function MarketDetailScreen() {
  const router = useRouter()
  const { marketId } = useLocalSearchParams<{ marketId: string }>()
  const insets = useSafeAreaInsets()
  const { wallet } = useWalletStore()
  const colors = useThemeColors()

  const [market, setMarket] = useState<PredictionMarketInfo | null>(null)
  const [orderBook, setOrderBook] = useState<OrderBookSnapshot | null>(null)
  const [positions, setPositions] = useState<PositionInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [selectedOutcome, setSelectedOutcome] = useState(0)
  const [showDescription, setShowDescription] = useState(false)
  const [showTradeForm, setShowTradeForm] = useState(false)
  const [orderType, setOrderType] = useState<PredictionOrderType>(PredictionOrderType.Buy)
  const [priceInput, setPriceInput] = useState('')
  const [amountInput, setAmountInput] = useState('')
  const [expirationIdx, setExpirationIdx] = useState(2)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRedeeming, setIsRedeeming] = useState(false)

  const fetchData = useCallback(async () => {
    if (!marketId) return
    try {
      setError(null)
      if (!isValidMarketEntityId(marketId)) {
        setError(translate('Invalid market ID'))
        setMarket(null)
        return
      }
      const marketInfo = await getPredictionMarket(marketId)
      if (!marketInfo) {
        setError(translate('Market not found'))
        return
      }
      setMarket(marketInfo)

      const obPromise = getPredictionOrderBook(marketId, selectedOutcome)
      const posPromise = wallet?.address
        ? getAllPositions(marketId, wallet.address)
        : Promise.resolve([])

      const [ob, pos] = await Promise.all([obPromise, posPromise])
      setOrderBook(ob)
      setPositions(pos)
    } catch (error) {
      setError(getErrorDisplayMessage(error) || translate('Failed to load market'))
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [marketId, selectedOutcome, wallet?.address])

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true)
      fetchData()
    }, [fetchData]),
  )

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await fetchData()
  }

  const handleOutcomeSelect = async (idx: number) => {
    setSelectedOutcome(idx)
    if (marketId) {
      const ob = await getPredictionOrderBook(marketId, idx)
      setOrderBook(ob)
    }
  }

  const handlePlaceOrder = () => {
    if (!wallet || !market || !marketId) return
    if (!isValidMarketEntityId(marketId)) {
      toast.error(translate('Invalid market ID'))
      return
    }
    if (!/^\d+$/.test(priceInput.trim())) {
      toast.error(translate('Invalid price'), translate('Price must be between 0 and 100%'))
      return
    }
    const price = parseInt(priceInput)
    if (!price || price <= 0 || price >= PRICE_PRECISION) {
      toast.error(translate('Invalid price'), translate('Price must be between 0 and 100%'))
      return
    }
    const amountWei = parseDecimalToBigInt(amountInput, 18)
    if (!amountWei || amountWei <= 0n) {
      toast.error(translate('Invalid amount'), translate('Enter a valid EXO amount'))
      return
    }
    const expiration = EXPIRATION_OPTIONS[expirationIdx]
    const expiryLabel = translate(expiration.translationKey, { count: expiration.count })
    const expiry = BigInt(Math.floor(Date.now() / 1000) + expiration.seconds)
    const typeLabel = translate(orderType === PredictionOrderType.Buy ? 'Buy' : 'Sell')
    const outcomeLabel = market.outcomeLabels[selectedOutcome] || translate('Outcome #{{index}}', { index: selectedOutcome })

    Alert.alert(
      translate('Confirm Order'),
      translate('{{typeLabel}} {{amount}} EXO of "{{outcomeLabel}}" at {{pricePercent}}%?\n\nExpires: {{expiryLabel}}', {
        typeLabel,
        amount: amountInput,
        outcomeLabel,
        pricePercent: formatLocalizedNumber(priceToPercent(price), {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }),
        expiryLabel,
      }),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Place Order'),
          onPress: async () => {
            try {
              setIsSubmitting(true)
              toast.info(translate('Processing'), translate('Signing order...'))
              const result = await placeOrder(
                wallet.privateKey, wallet.publicKey, wallet.address,
                marketId, selectedOutcome, orderType, price, amountWei, expiry,
              )
              toast.info(translate('Submitted'), translate('Waiting for confirmation...'))
              const status = await waitForTransaction(result.txHash, 15, 2000)
              if (status.status === 'confirmed') {
                toast.success(
                  translate('Order Placed'),
                  translate('{{typeLabel}} order confirmed', { typeLabel }),
                )
              } else if (status.status === 'failed') {
                toast.error(translate('Failed'), translate('Order transaction failed'))
              } else {
                toast.success(translate('Submitted'), translate('Order submitted, awaiting confirmation...'))
              }
              setPriceInput('')
              setAmountInput('')
              await fetchData()
            } catch (error) {
              toast.error(
                translate('Error'),
                getErrorDisplayMessage(error) || translate('Failed to place order'),
              )
            } finally {
              setIsSubmitting(false)
            }
          },
        },
      ],
    )
  }

  const handleRedeem = (outcomeIndex: number) => {
    if (!wallet || !marketId) return
    if (!isValidMarketEntityId(marketId)) {
      toast.error(translate('Invalid market ID'))
      return
    }
    Alert.alert(translate('Redeem Winnings'), translate('Claim your winnings for this position?'), [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Redeem'),
        onPress: async () => {
          try {
            setIsRedeeming(true)
            toast.info(translate('Processing'), translate('Signing redemption...'))
            const result = await redeemWinnings(
              wallet.privateKey, wallet.publicKey, wallet.address,
              marketId, outcomeIndex,
            )
            const status = await waitForTransaction(result.txHash, 15, 2000)
            if (status.status === 'confirmed') {
              toast.success(translate('Redeemed'), translate('Winnings claimed successfully'))
            } else {
              toast.success(translate('Submitted'), translate('Redemption submitted'))
            }
            await fetchData()
          } catch (error) {
            toast.error(
              translate('Error'),
              getErrorDisplayMessage(error) || translate('Failed to redeem'),
            )
          } finally {
            setIsRedeeming(false)
          }
        },
      },
    ])
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-text-muted text-base mt-4">{translate('Loading market...')}</Text>
      </View>
    )
  }

  if (error || !market) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View className="flex-row items-center px-4 py-3">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="text-xl font-bold text-text ml-2">{translate('Market')}</Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-rose-400 text-base font-semibold mb-2">
            {error || translate('Market not found')}
          </Text>
          <Pressable onPress={handleRefresh} className="px-6 py-2.5 rounded-xl bg-primary mt-2">
            <Text className="text-onPrimary font-semibold text-sm">{translate('Retry')}</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const statusStyle = STATUS_COLORS[market.status] || STATUS_COLORS[PredictionMarketStatus.Pending]
  const isResolved = market.status === PredictionMarketStatus.Resolved
  const canTrade = market.status === PredictionMarketStatus.Active
  const tradeAmountWei = parseDecimalToBigInt(amountInput, 18) ?? 0n

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
      <View className="flex-row items-center px-4 py-3">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="text-lg font-bold text-text ml-2 flex-1" numberOfLines={1}>
          {market.question}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        <View className="bg-surface rounded-2xl p-4 mb-3">
          <Text className="text-text text-base font-bold mb-2">{market.question}</Text>

          {market.description ? (
            <Pressable onPress={() => setShowDescription(!showDescription)} className="mb-2">
              <Text className="text-text-secondary text-sm" numberOfLines={showDescription ? undefined : 2}>
                {market.description}
              </Text>
              <View className="flex-row items-center mt-1">
                <Text className="text-cyan-400 text-xs font-medium mr-1">
                  {translate(showDescription ? 'Show less' : 'Show more')}
                </Text>
                {showDescription
                  ? <ChevronUp size={12} color="#a7da57" />
                  : <ChevronDown size={12} color="#a7da57" />
                }
              </View>
            </Pressable>
          ) : null}

          <View className="flex-row flex-wrap gap-2 mb-3">
            <View className={`${statusStyle.bg} px-2 py-0.5 rounded-md`}>
              <Text className={`${statusStyle.text} text-[10px] font-semibold`}>
                {getMarketStatusName(market.status)}
              </Text>
            </View>
            <View className="bg-cyan-500/15 px-2 py-0.5 rounded-md">
              <Text className="text-cyan-400 text-[10px] font-medium capitalize">{market.category}</Text>
            </View>
          </View>

          <View className="flex-row gap-2">
            <View className="flex-1 bg-background/50 rounded-xl p-2.5">
              <View className="flex-row items-center gap-1 mb-0.5">
                <User size={10} color={colors.textMuted} />
                  <Text className="text-text-muted text-[10px]">{translate('Creator')}</Text>
              </View>
              <Text className="text-text text-xs font-medium">{truncateMarketAddress(market.creator)}</Text>
            </View>
            <View className="flex-1 bg-background/50 rounded-xl p-2.5">
              <View className="flex-row items-center gap-1 mb-0.5">
                <Clock size={10} color={colors.textMuted} />
                  <Text className="text-text-muted text-[10px]">{translate('Closes')}</Text>
              </View>
              <Text className="text-text text-xs font-medium">{formatCountdown(market.closingTime)}</Text>
            </View>
            <View className="flex-1 bg-background/50 rounded-xl p-2.5">
              <View className="flex-row items-center gap-1 mb-0.5">
                <BarChart3 size={10} color={colors.textMuted} />
                  <Text className="text-text-muted text-[10px]">{translate('Volume')}</Text>
              </View>
              <Text className="text-text text-xs font-medium">{formatMarketEXO(market.totalVolume, 2)}</Text>
            </View>
          </View>
        </View>

        <View className="bg-surface rounded-2xl p-4 mb-3">
          <Text className="text-text text-sm font-bold mb-3">{translate('Outcomes')}</Text>
          {market.outcomeLabels.map((label, i) => {
            const price = Number(market.outcomePrices[i] || 0)
            const pct = priceToPercent(price)
            const isSelected = selectedOutcome === i
            const isBinaryYes = market.outcomeLabels.length === 2 && i === 0
            const isBinaryNo = market.outcomeLabels.length === 2 && i === 1
            const barColor = isBinaryYes ? 'bg-emerald-500' : isBinaryNo ? 'bg-rose-500' : 'bg-cyan-500'
            const barBg = isBinaryYes ? 'bg-emerald-500/10' : isBinaryNo ? 'bg-rose-500/10' : 'bg-cyan-500/10'
            const textColor = isBinaryYes ? 'text-emerald-400' : isBinaryNo ? 'text-rose-400' : 'text-cyan-400'

            return (
              <Pressable
                key={i}
                onPress={() => handleOutcomeSelect(i)}
                className={`p-3 rounded-xl mb-2 border ${isSelected ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-transparent bg-background/50'}`}
              >
                <View className="flex-row items-center justify-between mb-1.5">
                  <Text className={`text-sm font-semibold ${isSelected ? 'text-text' : 'text-text-secondary'}`}>{label}</Text>
                  <Text className={`text-sm font-bold ${textColor}`}>{formatLocalizedPercent(pct)}</Text>
                </View>
                <View className={`h-3 ${barBg} rounded-full overflow-hidden`}>
                  <View className={`h-full ${barColor} rounded-full`} style={{ width: `${Math.max(2, pct)}%` }} />
                </View>
                {isResolved && market.resolvedOutcome === i && (
                  <View className="mt-1.5 bg-emerald-500/15 self-start px-2 py-0.5 rounded-md">
                    <Text className="text-emerald-400 text-[10px] font-bold">{translate('WINNER')}</Text>
                  </View>
                )}
              </Pressable>
            )
          })}
        </View>

        {orderBook && (
          <View className="bg-surface rounded-2xl p-4 mb-3">
            <Text className="text-text text-sm font-bold mb-1">
              {translate('Order Book')} {'\u2014'} {market.outcomeLabels[selectedOutcome]}
            </Text>
            <View className="flex-row gap-2 mb-3">
              <View className="bg-background/50 rounded-lg px-2 py-1">
                <Text className="text-text-muted text-[10px]">{translate('Best Bid')}</Text>
                <Text className="text-emerald-400 text-xs font-bold">
                  {orderBook.bestBid > 0 ? formatLocalizedPercent(priceToPercent(orderBook.bestBid)) : '—'}
                </Text>
              </View>
              <View className="bg-background/50 rounded-lg px-2 py-1">
                <Text className="text-text-muted text-[10px]">{translate('Best Ask')}</Text>
                <Text className="text-rose-400 text-xs font-bold">
                  {orderBook.bestAsk > 0 ? formatLocalizedPercent(priceToPercent(orderBook.bestAsk)) : '—'}
                </Text>
              </View>
              <View className="bg-background/50 rounded-lg px-2 py-1">
                <Text className="text-text-muted text-[10px]">{translate('Spread')}</Text>
                <Text className="text-text text-xs font-bold">
                  {orderBook.spread > 0 ? formatLocalizedPercent(priceToPercent(orderBook.spread)) : '—'}
                </Text>
              </View>
            </View>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="text-emerald-400 text-xs font-semibold mb-1.5">{translate('Bids')}</Text>
                {orderBook.bids.length === 0 ? (
                  <Text className="text-text-muted text-xs">{translate('No bids')}</Text>
                ) : (
                  orderBook.bids.slice(0, 5).map((bid, i) => (
                    <View key={i} className="flex-row justify-between mb-1">
                      <Text className="text-emerald-400 text-xs">{formatLocalizedPercent(priceToPercent(bid.price))}</Text>
                      <Text className="text-text-muted text-xs">{formatMarketEXO(bid.amount, 2)}</Text>
                    </View>
                  ))
                )}
              </View>
              <View className="w-px bg-border/30" />
              <View className="flex-1">
                <Text className="text-rose-400 text-xs font-semibold mb-1.5">{translate('Asks')}</Text>
                {orderBook.asks.length === 0 ? (
                  <Text className="text-text-muted text-xs">{translate('No asks')}</Text>
                ) : (
                  orderBook.asks.slice(0, 5).map((ask, i) => (
                    <View key={i} className="flex-row justify-between mb-1">
                      <Text className="text-rose-400 text-xs">{formatLocalizedPercent(priceToPercent(ask.price))}</Text>
                      <Text className="text-text-muted text-xs">{formatMarketEXO(ask.amount, 2)}</Text>
                    </View>
                  ))
                )}
              </View>
            </View>
          </View>
        )}

        {canTrade && wallet && (
          <View className="bg-surface rounded-2xl mb-3 overflow-hidden">
            <Pressable
              onPress={() => setShowTradeForm(!showTradeForm)}
              className="flex-row items-center justify-between p-4"
            >
              <View className="flex-row items-center gap-2">
                <ShoppingCart size={18} color="#a7da57" />
                <Text className="text-text text-sm font-bold">{translate('Trade')}</Text>
              </View>
              {showTradeForm
                ? <ChevronUp size={18} color={colors.textMuted} />
                : <ChevronDown size={18} color={colors.textMuted} />
              }
            </Pressable>

            {showTradeForm && (
              <View className="px-4 pb-4">
                <View className="flex-row bg-background/50 rounded-xl p-1 mb-3">
                  <Pressable
                    onPress={() => setOrderType(PredictionOrderType.Buy)}
                    className={`flex-1 py-2 rounded-lg items-center ${orderType === PredictionOrderType.Buy ? 'bg-emerald-500' : ''}`}
                  >
                    <Text className={`text-sm font-semibold ${orderType === PredictionOrderType.Buy ? 'text-white' : 'text-text-muted'}`}>
                      {translate('Buy')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setOrderType(PredictionOrderType.Sell)}
                    className={`flex-1 py-2 rounded-lg items-center ${orderType === PredictionOrderType.Sell ? 'bg-rose-500' : ''}`}
                  >
                    <Text className={`text-sm font-semibold ${orderType === PredictionOrderType.Sell ? 'text-white' : 'text-text-muted'}`}>
                      {translate('Sell')}
                    </Text>
                  </Pressable>
                </View>

                <View className="bg-background/50 rounded-xl p-3 mb-2">
                  <Text className="text-text-muted text-xs mb-1">{translate('Outcome')}</Text>
                  <Text className="text-text text-sm font-semibold">
                    {market.outcomeLabels[selectedOutcome]}
                  </Text>
                </View>

                <View className="bg-background/50 rounded-xl p-3 mb-2">
                  <Text className="text-text-muted text-xs mb-1">{translate('Price (basis points → %)')}</Text>
                  <View className="flex-row items-center">
                    <TextInput
                      className="flex-1 text-text text-lg font-semibold"
                      placeholder={translate('e.g. 5000', { ns: 'markets' })}
                      placeholderTextColor={colors.textMuted}
                      value={priceInput}
                      onChangeText={setPriceInput}
                      keyboardType="number-pad"
                    />
                    <Text className="text-cyan-400 text-sm font-medium ml-2">
                      {priceInput ? formatLocalizedPercent(priceToPercent(parseInt(priceInput) || 0)) : '—'}
                    </Text>
                  </View>
                </View>

                <View className="bg-background/50 rounded-xl p-3 mb-3">
                  <Text className="text-text-muted text-xs mb-1">{translate('Amount (EXO)')}</Text>
                  <TextInput
                    className="text-text text-lg font-semibold"
                    placeholder="0.0"
                    placeholderTextColor={colors.textMuted}
                    value={amountInput}
                    onChangeText={setAmountInput}
                    keyboardType="decimal-pad"
                  />
                </View>

                <View className="mb-3">
                  <Text className="text-text-muted text-xs mb-1.5">{translate('Expiration')}</Text>
                  <View className="flex-row gap-2">
                    {EXPIRATION_OPTIONS.map((opt, i) => (
                      <Pressable
                        key={opt.seconds}
                        onPress={() => setExpirationIdx(i)}
                        className={`flex-1 py-2 rounded-lg items-center ${expirationIdx === i ? 'bg-primary' : 'bg-background/50'}`}
                      >
                        <Text className={`text-xs font-semibold ${expirationIdx === i ? 'text-onPrimary' : 'text-text-muted'}`}>
                          {translate(opt.translationKey, { count: opt.count })}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <Pressable
                  onPress={handlePlaceOrder}
                  disabled={isSubmitting || !priceInput || tradeAmountWei <= 0n}
                  className={`flex-row items-center justify-center gap-2 py-3.5 rounded-xl active:opacity-80 ${
                    orderType === PredictionOrderType.Buy ? 'bg-emerald-500' : 'bg-rose-500'
                  } disabled:opacity-50`}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <ShoppingCart size={18} color="white" />
                  )}
                  <Text className="text-white font-semibold text-sm">
                    {isSubmitting
                      ? translate('Placing Order...')
                      : `${translate(orderType === PredictionOrderType.Buy ? 'Buy' : 'Sell')} ${market.outcomeLabels[selectedOutcome]}`
                    }
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {wallet && positions.length > 0 && (
          <View className="bg-surface rounded-2xl p-4 mb-3">
            <Text className="text-text text-sm font-bold mb-3">{translate('My Positions')}</Text>
            {positions.map((pos, i) => {
              const shares = formatMarketEXO(pos.shares, 4)
              const cost = formatMarketEXO(pos.costBasis, 4)
              const value = formatMarketEXO(pos.currentValue, 4)
              const pnlWei = BigInt(pos.pnl)
              const pnlColor = pnlWei >= 0n ? 'text-emerald-400' : 'text-rose-400'
              const pnlPrefix = pnlWei >= 0n ? '+' : ''
              const canRedeem = isResolved && market.resolvedOutcome === pos.outcomeIndex && BigInt(pos.shares) > 0n

              return (
                <View key={i} className="bg-background/50 rounded-xl p-3 mb-2">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-text text-sm font-semibold">
                      {market.outcomeLabels[pos.outcomeIndex] || translate('Outcome #{{index}}', { index: pos.outcomeIndex })}
                    </Text>
                    <Text className={`text-sm font-bold ${pnlColor}`}>
                      {pnlPrefix}{formatBigIntAmount(pos.pnl, 18, 4)} EXO
                    </Text>
                  </View>
                  <View className="flex-row gap-3">
                    <View>
                      <Text className="text-text-muted text-[10px]">{translate('Shares')}</Text>
                      <Text className="text-text text-xs font-medium">{shares}</Text>
                    </View>
                    <View>
                      <Text className="text-text-muted text-[10px]">{translate('Cost')}</Text>
                      <Text className="text-text text-xs font-medium">{cost} EXO</Text>
                    </View>
                    <View>
                      <Text className="text-text-muted text-[10px]">{translate('Value')}</Text>
                      <Text className="text-text text-xs font-medium">{value} EXO</Text>
                    </View>
                  </View>
                  {canRedeem && (
                    <Pressable
                      onPress={() => handleRedeem(pos.outcomeIndex)}
                      disabled={isRedeeming}
                      className="flex-row items-center justify-center gap-1.5 bg-emerald-500 py-2 rounded-lg mt-2 active:opacity-80"
                    >
                      {isRedeeming ? (
                        <ActivityIndicator size="small" color="white" />
                      ) : (
                        <Gift size={14} color="white" />
                      )}
                      <Text className="text-white text-xs font-semibold">
                        {isRedeeming ? translate('Redeeming...') : translate('Redeem Winnings')}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )
            })}
          </View>
        )}

        {wallet && positions.length === 0 && !isLoading && (
          <View className="bg-surface rounded-2xl p-6 items-center mb-3">
            <Tag size={28} color={colors.textMuted} />
            <Text className="text-text-muted text-sm mt-2">{translate('No positions in this market')}</Text>
          </View>
        )}

        {!wallet && (
          <View className="bg-surface rounded-2xl p-6 items-center mb-3">
            <Text className="text-text-muted text-sm">{translate('Connect wallet to trade and view positions')}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}
