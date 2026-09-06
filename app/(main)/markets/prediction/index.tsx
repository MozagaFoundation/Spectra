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
  RefreshControl,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  BarChart3,
  TrendingUp,
  Clock,
  Briefcase,
} from 'lucide-react-native'
import { useWalletStore } from '@/store'
import {
  getPredictionPlatformStats,
  listPredictionMarkets,
  MARKET_CATEGORIES,
  getMarketStatusName,
  priceToPercent,
  PredictionMarketStatus,
} from '@/services/crypto/predictionService'
import type {
  PredictionMarketInfo,
  PredictionPlatformStats,
} from '@/services/crypto/predictionService'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { translate } from '@/lib/i18n'
import { formatBigIntAmount, formatLocalizedPercent } from '@/lib/amounts'
import { marketStaticRoute, predictionMarketRoute } from '@/lib/markets'

const ALL_CATEGORIES = ['all', ...MARKET_CATEGORIES]

function formatVolume(vol: string): string {
  try {
    const value = BigInt(vol)
    const exoBase = 10n ** 18n
    if (value >= 1_000_000n * exoBase) {
      const millionsTenth = (value * 10n) / (1_000_000n * exoBase)
      return `${formatBigIntAmount(millionsTenth, 1, 1)}M`
    }
    if (value >= 1_000n * exoBase) {
      const thousandsTenth = (value * 10n) / (1_000n * exoBase)
      return `${formatBigIntAmount(thousandsTenth, 1, 1)}K`
    }
    return formatBigIntAmount(value, 18, 2)
  } catch {
    return '0.00'
  }
}

function formatClosingTime(ts: number): string {
  const now = Date.now() / 1000
  const diff = ts - now
  if (diff <= 0) return translate('Closed', { ns: 'markets' })
  if (diff < 3600) {
    return translate('{{duration}} left', {
      ns: 'markets',
      duration: translate('duration.minutes', { count: Math.floor(diff / 60) }),
    })
  }
  if (diff < 86400) {
    return translate('{{duration}} left', {
      ns: 'markets',
      duration: translate('duration.hours', { count: Math.floor(diff / 3600) }),
    })
  }
  return translate('{{duration}} left', {
    ns: 'markets',
    duration: translate('duration.days', { count: Math.floor(diff / 86400) }),
  })
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

function OutcomeBars({ market }: { market: PredictionMarketInfo }) {
  const isBinary = market.outcomeLabels.length === 2

  if (isBinary) {
    const yesPrice = Number(market.outcomePrices[0] || 0)
    const noPrice = Number(market.outcomePrices[1] || 0)
    const yesPct = priceToPercent(yesPrice)
    const noPct = priceToPercent(noPrice)

    return (
      <View className="mt-2.5">
        <View className="flex-row items-center gap-2 mb-1.5">
          <View className="flex-1">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-emerald-400 text-xs font-semibold">{market.outcomeLabels[0]}</Text>
              <Text className="text-emerald-400 text-xs font-bold">{formatLocalizedPercent(yesPct)}</Text>
            </View>
            <View className="h-2.5 bg-emerald-500/10 rounded-full overflow-hidden">
              <View
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${Math.max(2, yesPct)}%` }}
              />
            </View>
          </View>
        </View>
        <View className="flex-row items-center gap-2">
          <View className="flex-1">
            <View className="flex-row items-center justify-between mb-1">
              <Text className="text-rose-400 text-xs font-semibold">{market.outcomeLabels[1]}</Text>
              <Text className="text-rose-400 text-xs font-bold">{formatLocalizedPercent(noPct)}</Text>
            </View>
            <View className="h-2.5 bg-rose-500/10 rounded-full overflow-hidden">
              <View
                className="h-full bg-rose-500 rounded-full"
                style={{ width: `${Math.max(2, noPct)}%` }}
              />
            </View>
          </View>
        </View>
      </View>
    )
  }

  return (
    <View className="mt-2.5 gap-1.5">
      {market.outcomeLabels.map((label, i) => {
        const price = Number(market.outcomePrices[i] || 0)
        const pct = priceToPercent(price)
        return (
          <View key={i}>
            <View className="flex-row items-center justify-between mb-0.5">
              <Text className="text-text-secondary text-xs font-medium" numberOfLines={1}>{label}</Text>
              <Text className="text-text text-xs font-bold">{formatLocalizedPercent(pct)}</Text>
            </View>
            <View className="h-2 bg-cyan-500/10 rounded-full overflow-hidden">
              <View
                className="h-full bg-cyan-500 rounded-full"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </View>
          </View>
        )
      })}
    </View>
  )
}

function MarketCard({ market, onPress }: { market: PredictionMarketInfo; onPress: () => void }) {
  const statusStyle = STATUS_COLORS[market.status] || STATUS_COLORS[PredictionMarketStatus.Pending]

  return (
    <Pressable onPress={onPress} className="bg-surface rounded-2xl p-4 mb-3 active:opacity-80">
      <View className="flex-row items-start justify-between mb-1.5">
        <Text className="text-text text-base font-bold flex-1 mr-3" numberOfLines={2}>
          {market.question}
        </Text>
        <View className={`${statusStyle.bg} px-2 py-0.5 rounded-md`}>
          <Text className={`${statusStyle.text} text-[10px] font-semibold`}>
            {getMarketStatusName(market.status)}
          </Text>
        </View>
      </View>

      <View className="flex-row items-center gap-2 mb-1">
        <View className="bg-cyan-500/15 px-2 py-0.5 rounded-md">
          <Text className="text-cyan-400 text-[10px] font-medium capitalize">
            {translate(market.category, { ns: 'markets' })}
          </Text>
        </View>
      </View>

      <OutcomeBars market={market} />

      <View className="flex-row items-center justify-between mt-3 pt-2.5 border-t border-border/30">
        <View className="flex-row items-center gap-1">
          <BarChart3 size={12} color="#a7da57" />
          <Text className="text-text-muted text-xs">{formatVolume(market.totalVolume)} EXO</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Clock size={12} color="#94a3b8" />
          <Text className="text-text-muted text-xs">{formatClosingTime(market.closingTime)}</Text>
        </View>
      </View>
    </Pressable>
  )
}

function SkeletonCard() {
  return (
    <View className="bg-surface rounded-2xl p-4 mb-3">
      <View className="h-5 bg-background/60 rounded-lg w-4/5 mb-2" />
      <View className="h-3 bg-background/60 rounded-lg w-1/2 mb-3" />
      <View className="h-2.5 bg-background/40 rounded-full w-full mb-2" />
      <View className="h-2.5 bg-background/40 rounded-full w-full mb-3" />
      <View className="flex-row justify-between">
        <View className="h-3 bg-background/40 rounded-lg w-20" />
        <View className="h-3 bg-background/40 rounded-lg w-16" />
      </View>
    </View>
  )
}

export default function PredictionMarketsScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const { wallet } = useWalletStore()
  const colors = useThemeColors()
  useTranslation('markets')

  const [stats, setStats] = useState<PredictionPlatformStats | null>(null)
  const [markets, setMarkets] = useState<PredictionMarketInfo[]>([])
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const [platformStats, marketList] = await Promise.all([
        getPredictionPlatformStats(),
        listPredictionMarkets(
          PredictionMarketStatus.Active,
          selectedCategory === 'all' ? undefined : selectedCategory,
          0,
          50,
        ),
      ])
      setStats(platformStats)
      setMarkets(marketList)
    } catch (error) {
      setError(getErrorDisplayMessage(error))
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [selectedCategory])

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

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat)
    setIsLoading(true)
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="text-xl font-bold text-text">
            {translate('Prediction Markets', { ns: 'markets' })}
          </Text>
        </View>
        {wallet && (
          <Pressable
            onPress={() => router.push(marketStaticRoute('/(main)/markets/prediction/positions'))}
            className="flex-row items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-500/15 active:bg-cyan-500/25"
          >
            <Briefcase size={14} color="#a7da57" />
            <Text className="text-cyan-400 text-xs font-semibold">
              {translate('My Positions', { ns: 'markets' })}
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {stats && (
          <View className="flex-row gap-2 mb-4">
            <View className="flex-1 bg-surface rounded-xl p-3 items-center">
              <TrendingUp size={16} color="#a7da57" />
              <Text className="text-text text-base font-bold mt-1">{stats.activeMarkets}</Text>
              <Text className="text-text-muted text-[10px]">
                {translate('Active', { ns: 'markets' })}
              </Text>
            </View>
            <View className="flex-1 bg-surface rounded-xl p-3 items-center">
              <BarChart3 size={16} color="#a7da57" />
              <Text className="text-text text-base font-bold mt-1">{formatVolume(stats.totalVolume)}</Text>
              <Text className="text-text-muted text-[10px]">
                {translate('Volume', { ns: 'markets' })}
              </Text>
            </View>
            <View className="flex-1 bg-surface rounded-xl p-3 items-center">
              <Clock size={16} color="#a7da57" />
              <Text className="text-text text-base font-bold mt-1">{stats.totalTrades}</Text>
              <Text className="text-text-muted text-[10px]">
                {translate('Trades', { ns: 'markets' })}
              </Text>
            </View>
          </View>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-4"
          contentContainerStyle={{ gap: 8 }}
        >
          {ALL_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat
            return (
              <Pressable
                key={cat}
                onPress={() => handleCategoryChange(cat)}
                className={`px-4 py-2 rounded-xl ${isSelected ? 'bg-primary' : 'bg-surface'}`}
              >
                <Text className={`text-xs font-semibold capitalize ${isSelected ? 'text-onPrimary' : 'text-text-muted'}`}>
                  {translate(cat, { ns: 'markets' })}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <View className="bg-surface rounded-2xl p-8 items-center">
            <Text className="text-rose-400 text-base font-semibold mb-2">
              {translate('Failed to Load', { ns: 'markets' })}
            </Text>
            <Text className="text-text-muted text-sm text-center mb-4">{error}</Text>
            <Pressable onPress={handleRefresh} className="px-6 py-2.5 rounded-xl bg-primary active:bg-primary-dark">
              <Text className="text-onPrimary font-semibold text-sm">{translate('Retry')}</Text>
            </Pressable>
          </View>
        ) : markets.length === 0 ? (
          <View className="bg-surface rounded-2xl p-8 items-center">
            <BarChart3 size={40} color={colors.textMuted} />
            <Text className="text-text-muted text-base mt-3">
              {translate('No markets found', { ns: 'markets' })}
            </Text>
            <Text className="text-text-muted text-sm mt-1">
              {selectedCategory !== 'all'
                ? translate('No active markets in "{{category}}"', {
                    ns: 'markets',
                    category: translate(selectedCategory, { ns: 'markets' }),
                  })
                : translate('No active prediction markets yet', { ns: 'markets' })}
            </Text>
          </View>
        ) : (
          markets.map((market) => (
            <MarketCard
              key={market.marketId}
              market={market}
              onPress={() => router.push(predictionMarketRoute(market.marketId))}
            />
          ))
        )}
      </ScrollView>
    </View>
  )
}
