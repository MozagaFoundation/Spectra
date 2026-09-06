/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useEffect, useCallback } from 'react'
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
import { useRouter } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ChevronLeft,
  RefreshCw,
  ArrowUpDown,
  Droplets,
  AlertTriangle,
  BarChart3,
  HelpCircle,
} from 'lucide-react-native'
import Svg, { Circle, Defs, LinearGradient, Stop, Line, Path } from 'react-native-svg'
import { useWalletStore } from '@/store'
import { getBalance, getAssetInfo, waitForTransaction } from '@/services/crypto'
import {
  getAMMPool,
  getAllPools,
  getSwapQuote,
  getSwapHistory,
  swapAMM,
  formatWeiToEXO,
  isNativeAssetId,
  type AMMPoolInfo,
  type SwapQuoteInfo,
  type SwapInfo,
} from '@/services/crypto/ammPool'
import { toast } from '@/store'
import { useCryptoTheme } from '@/lib/cryptoTheme'
import { formatLocalizedNumber, parseDecimalToBigInt } from '@/lib/amounts'
import { getCurrentLocaleTag, translate } from '@/lib/i18n'
import { buildPriceHistory, truncatePoolId } from './poolUtils'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'

const CHART_HEIGHT = 170
const CHART_PAD_TOP = 14
const CHART_PAD_BOTTOM = 24
const CHART_PAD_LEFT = 2
const CHART_PAD_RIGHT = 16

function formatPrice(price: number): string {
  if (price >= 1000) {
    return formatLocalizedNumber(price, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }
  if (price >= 1) {
    return formatLocalizedNumber(price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  if (price >= 0.01) {
    return formatLocalizedNumber(price, { minimumFractionDigits: 4, maximumFractionDigits: 4 })
  }
  return formatLocalizedNumber(price, { minimumFractionDigits: 6, maximumFractionDigits: 6 })
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleTimeString(getCurrentLocaleTag(), {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function PriceChart({ pool, swaps, asset0Symbol }: { pool: AMMPoolInfo; swaps: SwapInfo[]; asset0Symbol: string }) {
  const { colors, accent, alpha } = useCryptoTheme()
  const [chartWidth, setChartWidth] = useState(0)
  const { points, priceChange } = buildPriceHistory(pool, swaps)
  const isPositive = priceChange >= 0
  const color = isPositive ? accent('positive') : accent('negative')

  if (points.length < 2) {
    return (
      <View className="h-36 bg-background/50 rounded-xl items-center justify-center">
        <BarChart3 size={28} color={colors.textMuted} />
        <Text className="text-text-muted text-sm mt-2">{translate('Not enough data for chart')}</Text>
        {points.length === 1 && (
          <Text className="text-text text-sm mt-1 font-semibold">{formatPrice(points[0].price)} {asset0Symbol}</Text>
        )}
      </View>
    )
  }

  const prices = points.map(p => p.price)
  const maxPrice = Math.max(...prices)
  const minPrice = Math.min(...prices)
  const midPrice = (maxPrice + minPrice) / 2
  const range = maxPrice - minPrice || 1
  const drawW = Math.max(0, chartWidth - CHART_PAD_LEFT - CHART_PAD_RIGHT)
  const drawH = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM

  const mapped = chartWidth > 0 ? points.map((p, i) => ({
    x: CHART_PAD_LEFT + (i / (points.length - 1)) * drawW,
    y: CHART_PAD_TOP + drawH - ((p.price - minPrice) / range) * drawH,
  })) : []

  const linePath = mapped.length > 0 ? `M ${mapped.map(p => `${p.x},${p.y}`).join(' L ')}` : ''
  const baseline = CHART_PAD_TOP + drawH
  const fillPath = mapped.length > 0
    ? `${linePath} L ${mapped[mapped.length - 1].x},${baseline} L ${mapped[0].x},${baseline} Z`
    : ''

  const timeLabels: { x: number; label: string }[] = []
  if (chartWidth > 0 && points.length >= 2) {
    const count = Math.min(4, points.length)
    for (let i = 0; i < count; i++) {
      const idx = Math.round((i / (count - 1)) * (points.length - 1))
      timeLabels.push({
        x: CHART_PAD_LEFT + (idx / (points.length - 1)) * drawW,
        label: formatTime(points[idx].time),
      })
    }
  }

  const gridYs = [
    { y: CHART_PAD_TOP, label: formatPrice(maxPrice) },
    { y: CHART_PAD_TOP + drawH / 2, label: formatPrice(midPrice) },
    { y: baseline, label: formatPrice(minPrice) },
  ]

  const lastPoint = mapped.length > 0 ? mapped[mapped.length - 1] : null
  const currentPrice = points[points.length - 1].price

  return (
    <View>
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-text-secondary text-sm font-medium">
          {translate('Price ({{asset0Symbol}})', { asset0Symbol })}
        </Text>
        <View className="flex-row items-center gap-1.5">
          <Text className="text-text text-sm font-bold">{formatPrice(currentPrice)}</Text>
          <View className="px-1.5 py-0.5 rounded-md" style={{ backgroundColor: alpha(color, 0.15) }}>
            <Text className="text-[10px] font-semibold" style={{ color }}>
              {`${isPositive ? '+' : ''}${formatLocalizedNumber(priceChange, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}%`}
            </Text>
          </View>
        </View>
      </View>

      <View className="flex-row">
        <View className="justify-between pr-1" style={{ height: CHART_HEIGHT - CHART_PAD_BOTTOM, width: 48, paddingTop: CHART_PAD_TOP - 6 }}>
          <Text className="text-text-muted text-[10px] text-right">{formatPrice(maxPrice)}</Text>
          <Text className="text-text-muted text-[10px] text-right">{formatPrice(midPrice)}</Text>
          <Text className="text-text-muted text-[10px] text-right">{formatPrice(minPrice)}</Text>
        </View>

        <View
          style={{ flex: 1, height: CHART_HEIGHT, overflow: 'hidden' }}
          onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
        >
          {chartWidth > 0 && (
            <Svg width={chartWidth} height={CHART_HEIGHT}>
              <Defs>
                <LinearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <Stop offset="100%" stopColor={color} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              {gridYs.map((g, i) => (
                <Line
                  key={i}
                  x1={CHART_PAD_LEFT}
                  y1={g.y}
                  x2={chartWidth - CHART_PAD_RIGHT}
                  y2={g.y}
                  stroke={colors.border}
                  strokeWidth={1}
                  strokeDasharray={i === 1 ? '4,4' : undefined}
                />
              ))}

              {fillPath ? <Path d={fillPath} fill="url(#priceGrad)" /> : null}

              {linePath ? (
                <Path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              ) : null}

              {lastPoint && (
                <>
                  <Circle cx={lastPoint.x} cy={lastPoint.y} r={5} fill={color} opacity={0.3} />
                  <Circle cx={lastPoint.x} cy={lastPoint.y} r={3} fill={color} />
                </>
              )}
            </Svg>
          )}

          {chartWidth > 0 && (
            <View className="flex-row absolute bottom-0 left-0 right-0" style={{ height: CHART_PAD_BOTTOM - 4 }}>
              {timeLabels.map((t, i) => (
                <Text
                  key={i}
                  className="text-text-muted text-[9px] absolute"
                  style={{ left: t.x - 14, top: 2 }}
                >
                  {t.label}
                </Text>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  )
}

export default function PoolsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { wallet } = useWalletStore()
  const { colors, accent, alpha, priceImpactAccent } = useCryptoTheme()

  const [availablePools, setAvailablePools] = useState<AMMPoolInfo[]>([])
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null)
  const [pool, setPool] = useState<AMMPoolInfo | null>(null)
  const [swapHistory, setSwapHistory] = useState<SwapInfo[]>([])

  const [asset0Symbol, setAsset0Symbol] = useState('EXO')
  const [asset1Symbol, setAsset1Symbol] = useState('Token')
  const [userBalance, setUserBalance] = useState('0.0000')

  const [swapDirection, setSwapDirection] = useState<'buy' | 'sell'>('buy')
  const [inputAmount, setInputAmount] = useState('')
  const [quote, setQuote] = useState<SwapQuoteInfo | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSwapping, setIsSwapping] = useState(false)
  const inputAmountWei = parseDecimalToBigInt(inputAmount, 18) ?? 0n

  const discoverPools = useCallback(async () => {
    try {
      const pools = await getAllPools()
      setAvailablePools(pools)

      if (pools.length === 0) {
        setSelectedPoolId(null)
        setPool(null)
        setSwapHistory([])
        setIsLoading(false)
        setIsRefreshing(false)
        return null
      }

      const hasSelectedPool = selectedPoolId
        ? pools.some((candidate) => candidate.poolId === selectedPoolId)
        : false
      if (hasSelectedPool && selectedPoolId) {
        return selectedPoolId
      }

      const fallbackPoolId = pools[0].poolId
      setSelectedPoolId(fallbackPoolId)
      return fallbackPoolId
    } catch (error) {
      console.error('Pool discovery error:', error)
      setIsLoading(false)
      setIsRefreshing(false)
      return selectedPoolId
    }
  }, [selectedPoolId])

  const fetchPoolData = useCallback(async (poolId: string | null) => {
    if (!wallet?.address || !poolId) {
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }

    try {
      const poolInfo = await getAMMPool(poolId)

      if (poolInfo) {
        setPool(poolInfo)

        const a0 = String(poolInfo.asset0)
        const a1 = String(poolInfo.asset1)
        const [asset0Info, asset1Info, history, bal] = await Promise.all([
          isNativeAssetId(a0) ? Promise.resolve(null) : getAssetInfo(a0),
          isNativeAssetId(a1) ? Promise.resolve(null) : getAssetInfo(a1),
          getSwapHistory(poolId, 30),
          getBalance(wallet.address),
        ])

        setAsset0Symbol(
          isNativeAssetId(a0)
            ? 'EXO'
            : asset0Info?.symbol || `Asset#${truncatePoolId(a0)}`,
        )
        setAsset1Symbol(
          isNativeAssetId(a1)
            ? 'EXO'
            : asset1Info?.symbol || `Asset#${truncatePoolId(a1)}`,
        )
        setSwapHistory(history)
        setUserBalance(bal)
      } else {
        setPool(null)
        setSwapHistory([])
      }
    } catch (error) {
      console.error('Error fetching pool data:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [wallet?.address])

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true)

      const refreshPools = async (poolId: string | null) => {
        if (poolId) {
          await Promise.all([
            discoverPools(),
            fetchPoolData(poolId),
          ])
          return
        }

        await discoverPools()
      }

      void refreshPools(selectedPoolId)

      const interval = setInterval(() => {
        void refreshPools(selectedPoolId)
      }, 30000)
      return () => clearInterval(interval)
    }, [discoverPools, fetchPoolData, selectedPoolId])
  )

  useEffect(() => {
    if (selectedPoolId) {
      setIsLoading(true)
      setInputAmount('')
      setQuote(null)
      void fetchPoolData(selectedPoolId)
    }
  }, [fetchPoolData, selectedPoolId])

  useEffect(() => {
    if (inputAmountWei <= 0n || !pool || !selectedPoolId) {
      setQuote(null)
      return
    }
    const timer = setTimeout(async () => {
      const assetIn = swapDirection === 'buy' ? pool.asset0 : pool.asset1
      const q = await getSwapQuote(selectedPoolId, assetIn, inputAmountWei.toString())
      setQuote(q)
    }, 300)
    return () => clearTimeout(timer)
  }, [inputAmountWei, swapDirection, pool, selectedPoolId])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    if (selectedPoolId) {
      await Promise.all([
        discoverPools(),
        fetchPoolData(selectedPoolId),
      ])
      return
    }

    await discoverPools()
  }

  const handleFlipDirection = () => {
    setSwapDirection(d => d === 'buy' ? 'sell' : 'buy')
    setInputAmount('')
    setQuote(null)
  }

  const handleSwap = async () => {
    if (!wallet || !pool || !quote || !selectedPoolId) return

    if (inputAmountWei <= 0n) {
      toast.error(translate('Invalid amount'))
      return
    }

    const assetIn = swapDirection === 'buy' ? pool.asset0 : pool.asset1
    const fromSymbol = swapDirection === 'buy' ? asset0Symbol : asset1Symbol
    const toSymbol = swapDirection === 'buy' ? asset1Symbol : asset0Symbol
    const amountInWei = inputAmountWei
    const minOut = (BigInt(quote.amountOut) * 99n) / 100n
    const outputFormatted = formatWeiToEXO(quote.amountOut, 4)

    const priceImpact = quote.priceImpact || 0
    const impactWarning = priceImpact > 3
      ? translate('\n\nWarning: Price impact is {{priceImpact}}%!', {
          priceImpact: formatLocalizedNumber(priceImpact, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }),
        })
      : ''

    Alert.alert(
      translate('Confirm Swap'),
      translate('Swap {{inputAmount}} {{fromSymbol}} for ~{{outputFormatted}} {{toSymbol}}?\n\nFee: 0.15%{{impactWarning}}', {
        inputAmount,
        fromSymbol,
        outputFormatted,
        toSymbol,
        impactWarning,
      }),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Swap'),
          onPress: async () => {
            try {
              setIsSwapping(true)
              toast.info(translate('Processing'), translate('Signing swap transaction...'))

              const result = await swapAMM(
                wallet.privateKey,
                wallet.publicKey,
                wallet.address,
                selectedPoolId,
                assetIn,
                amountInWei,
                minOut,
              )

              toast.info(translate('Processing'), translate('Waiting for confirmation...'))
              const status = await waitForTransaction(result.txHash, 15, 2000)

              if (status.status === 'confirmed') {
                toast.success(
                  translate('Success'),
                  translate('Swapped {{inputAmount}} {{fromSymbol}} for {{outputFormatted}} {{toSymbol}}', {
                    inputAmount,
                    fromSymbol,
                    outputFormatted,
                    toSymbol,
                  }),
                )
              } else if (status.status === 'failed') {
                toast.error(translate('Failed'), translate('Swap failed. Please try again.'))
              } else {
                toast.success(translate('Submitted'), translate('Swap submitted, awaiting confirmation...'))
              }

              setInputAmount('')
              setQuote(null)
              await fetchPoolData(selectedPoolId)
            } catch (error: any) {
              console.error('Swap error:', error)
              toast.error(translate('Error'), getErrorDisplayMessage(error) || translate('Failed to execute swap'))
            } finally {
              setIsSwapping(false)
            }
          },
        },
      ],
    )
  }

  if (!wallet) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ backgroundColor: colors.background }}>
        <Text className="text-text text-lg">{translate('No wallet found')}</Text>
      </View>
    )
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-text-muted text-base mt-4">{translate('Loading pool data...')}</Text>
      </View>
    )
  }

  const fromSymbol = swapDirection === 'buy' ? asset0Symbol : asset1Symbol
  const toSymbol = swapDirection === 'buy' ? asset1Symbol : asset0Symbol
  const priceImpact = quote?.priceImpact || 0
  const activeAccent = accent('active')
  const toAssetAccent = accent('protocol')
  const priceImpactColor = priceImpactAccent(priceImpact)
  const warningAccent = accent('negative')

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="text-xl font-bold text-text">{translate('Markets')}</Text>
          <Pressable
            onPress={() => Alert.alert(
              translate('How Markets Work'),
              translate('• Constant Product (x × y = k)\nPrices are set automatically by the ratio of reserves. Larger trades have more price impact.\n\n• Low Fee: 0.15%\nEach swap has a 0.15% fee split between liquidity providers (60%), market owner (20%), and protocol (20%).\n\n• Slippage Protection\nSwaps include a minimum output amount. If the price moves too much, the transaction reverts to protect you.'),
            )}
            className="p-1"
          >
            <HelpCircle size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
        <Pressable
          onPress={handleRefresh}
          className="w-10 h-10 rounded-xl bg-surface items-center justify-center active:bg-surface-hover"
        >
          <RefreshCw size={18} color={colors.textTertiary} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        <View className="bg-surface rounded-2xl p-4 mb-4">
          <Text className="text-text-muted text-sm mb-2">{translate('Select Pool')}</Text>
          {availablePools.length === 0 ? (
            <View className="py-3 items-center">
              <Text className="text-text-muted text-sm">{translate('No pools found on this network')}</Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
              <View className="flex-row gap-2">
                {availablePools.map((p) => {
                  const isSelected = selectedPoolId === p.poolId
                  return (
                    <Pressable
                      key={p.poolId}
                      onPress={() => setSelectedPoolId(p.poolId)}
                      className={`px-4 py-2.5 rounded-xl items-center ${isSelected ? 'bg-primary' : 'bg-background/50'}`}
                    >
                      <Text className={`font-semibold text-xs ${isSelected ? 'text-onPrimary' : 'text-text-muted'}`}>
                        {truncatePoolId(p.poolId)}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </ScrollView>
          )}
        </View>

        {!pool ? (
          <View className="bg-surface rounded-2xl p-6 items-center">
            <Droplets size={40} color={colors.textMuted} />
            <Text className="text-text-muted text-base mt-3">{translate('No pool found')}</Text>
            <Text className="text-text-muted text-sm mt-1">{translate('Select a pool above or check back later')}</Text>
          </View>
        ) : (
          <>
            <View className="bg-surface rounded-2xl p-4 mb-4">
              <View className="flex-row items-center gap-2 mb-3">
                <Droplets size={18} color={colors.primary} />
                <Text className="text-text text-lg font-bold">
                  {asset0Symbol} / {asset1Symbol}
                </Text>
                <View className="px-2 py-0.5 rounded-md ml-auto" style={{ backgroundColor: alpha(activeAccent, 0.15) }}>
                  <Text className="text-xs font-medium" style={{ color: activeAccent }}>{translate('Active')}</Text>
                </View>
              </View>

              <View className="flex-row gap-2 mb-2">
                <View className="flex-1 bg-background/50 rounded-xl p-3">
                  <Text className="text-text-muted text-xs mb-0.5">
                    {translate('{{assetSymbol}} Reserve', { assetSymbol: asset0Symbol })}
                  </Text>
                  <Text className="text-text text-base font-bold" numberOfLines={1}>
                    {formatWeiToEXO(pool.reserve0, 2)}
                  </Text>
                </View>
                <View className="flex-1 bg-background/50 rounded-xl p-3">
                  <Text className="text-text-muted text-xs mb-0.5">
                    {translate('{{assetSymbol}} Reserve', { assetSymbol: asset1Symbol })}
                  </Text>
                  <Text className="text-text text-base font-bold" numberOfLines={1}>
                    {formatWeiToEXO(pool.reserve1, 2)}
                  </Text>
                </View>
              </View>

              <View className="flex-row gap-2">
                <View className="flex-1 bg-background/50 rounded-xl p-3">
                  <Text className="text-text-muted text-xs mb-0.5">{translate('Swaps')}</Text>
                  <Text className="text-text text-base font-bold">{pool.swapCount || 0}</Text>
                </View>
                <View className="flex-1 bg-background/50 rounded-xl p-3">
                  <Text className="text-text-muted text-xs mb-0.5">{translate('Fee')}</Text>
                  <Text className="text-text text-base font-bold">0.15%</Text>
                </View>
              </View>
            </View>

            <View className="bg-surface rounded-2xl p-4 mb-4">
              <PriceChart pool={pool} swaps={swapHistory} asset0Symbol={asset0Symbol} />
            </View>

            <View className="bg-surface rounded-2xl p-4 mb-4">
              <View className="flex-row items-center gap-2 mb-4">
                <ArrowUpDown size={20} color={colors.primary} />
                <Text className="text-text text-lg font-bold">{translate('Swap')}</Text>
              </View>

              <View className="mb-3">
                <Text className="text-text-muted text-sm">
                  {translate('Balance:')} <Text className="text-text font-medium">{userBalance} EXO</Text>
                </Text>
              </View>

              <View className="bg-background/50 rounded-xl p-3 mb-2">
                <Text className="text-text-muted text-xs mb-1.5">{translate('You Pay')}</Text>
                <View className="flex-row items-center">
                  <TextInput
                    className="flex-1 text-text text-xl font-semibold"
                    placeholder="0.0"
                    placeholderTextColor={colors.textMuted}
                    value={inputAmount}
                    onChangeText={setInputAmount}
                    keyboardType="decimal-pad"
                  />
                  <View className="px-3 py-1.5 rounded-lg" style={{ backgroundColor: colors.primary + '26' }}>
                    <Text className="text-primary font-semibold text-sm">{fromSymbol}</Text>
                  </View>
                </View>
              </View>

              <View className="items-center -my-1 z-10">
                <Pressable
                  onPress={handleFlipDirection}
                  className="w-9 h-9 rounded-full bg-primary items-center justify-center"
                >
                  <ArrowUpDown size={16} color={colors.textOnPrimary} />
                </Pressable>
              </View>

              <View className="bg-background/50 rounded-xl p-3 mt-2 mb-3">
                <Text className="text-text-muted text-xs mb-1.5">{translate('You Receive')}</Text>
                <View className="flex-row items-center">
                  <Text className="flex-1 text-text text-xl font-semibold">
                    {quote ? formatWeiToEXO(quote.amountOut, 4) : '0.0'}
                  </Text>
                    <View className="px-3 py-1.5 rounded-lg" style={{ backgroundColor: alpha(toAssetAccent, 0.15) }}>
                      <Text className="font-semibold text-sm" style={{ color: toAssetAccent }}>{toSymbol}</Text>
                    </View>
                </View>
              </View>

              {quote && (
                <View className="bg-background/50 rounded-xl p-3 mb-3">
                  <View className="flex-row justify-between mb-1.5">
                    <Text className="text-text-muted text-xs">{translate('Fee (0.15%)')}</Text>
                    <Text className="text-text text-xs">{formatWeiToEXO(quote.fee, 6)} {fromSymbol}</Text>
                  </View>
                  <View className="flex-row justify-between mb-1.5">
                    <Text className="text-text-muted text-xs">{translate('Price Impact')}</Text>
                    <Text className="text-xs font-medium" style={{ color: priceImpactColor }}>
                      {formatLocalizedNumber(priceImpact, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}%
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-text-muted text-xs">{translate('Min. Received (1% slippage)')}</Text>
                    <Text className="text-text text-xs">
                      {formatWeiToEXO(((BigInt(quote.amountOut) * 99n) / 100n).toString(), 4)} {toSymbol}
                    </Text>
                  </View>
                </View>
              )}

              {priceImpact > 3 && (
                <View className="border rounded-xl p-3 mb-3" style={{ backgroundColor: alpha(warningAccent, 0.1), borderColor: alpha(warningAccent, 0.2) }}>
                  <View className="flex-row items-start gap-2">
                    <AlertTriangle size={16} color={warningAccent} style={{ marginTop: 1 }} />
                    <Text className="text-xs flex-1" style={{ color: warningAccent }}>
                      {translate('High price impact ({{priceImpact}}%). Consider reducing your trade size.', {
                        priceImpact: formatLocalizedNumber(priceImpact, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }),
                      })}
                    </Text>
                  </View>
                </View>
              )}

              <Pressable
                onPress={handleSwap}
                disabled={isSwapping || !quote || inputAmountWei <= 0n}
                className="flex-row items-center justify-center gap-2 bg-primary py-3.5 rounded-xl active:bg-primary-dark disabled:opacity-50"
              >
                {isSwapping ? (
                  <ActivityIndicator size="small" color={colors.textOnPrimary} />
                ) : (
                  <ArrowUpDown size={20} color={colors.textOnPrimary} />
                )}
                <Text className="text-onPrimary font-semibold text-base">
                  {isSwapping
                    ? translate('Swapping...')
                    : translate('Swap {{fromSymbol}} → {{toSymbol}}', { fromSymbol, toSymbol })}
                </Text>
              </Pressable>
            </View>

          </>
        )}
      </ScrollView>
    </View>
  )
}
