/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronRight,
  Rocket,
  TrendingUp,
  Shield,
  Target,
  Droplets,
  RefreshCw,
  Activity,
  Flame,
  Sparkles,
} from 'lucide-react-native'
import { useCryptoTheme } from '@/lib/cryptoTheme'
import { translate } from '@/lib/i18n'
import {
  getActiveMarkets,
  getMarketStats,
  type MarketInfo,
  type MarketStats,
} from '@/services/crypto/marketService'
import {
  getActiveCampaigns,
  type CampaignListItem,
} from '@/services/crypto/campaignService'
import {
  listPredictionMarkets,
  PredictionMarketStatus,
  priceToPercent,
  type PredictionMarketInfo,
} from '@/services/crypto/predictionService'
import { formatBigIntAmount } from '@/lib/amounts'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { campaignRoute, marketStaticRoute, predictionMarketRoute, primarySaleRoute } from '@/lib/markets'

interface CategoryDef {
  id: string
  title: string
  subtitle: string
  icon: typeof Rocket
  route: '/(main)/markets/primary' | '/(main)/markets/prediction' | '/(main)/markets/escrow' | '/(main)/markets/campaigns' | '/(main)/crypto/pools'
  countResolver?: (data: MarketsAggregateData) => number | undefined
}

interface MarketsAggregateData {
  marketStats: MarketStats | null
  activeMarkets: MarketInfo[]
  campaigns: CampaignListItem[]
  predictionMarkets: PredictionMarketInfo[]
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'primary',
    title: 'Primary Market',
    subtitle: 'Token Sales',
    icon: Rocket,
    route: '/(main)/markets/primary',
    countResolver: (data) => data.marketStats?.totalSales,
  },
  {
    id: 'prediction',
    title: 'Prediction',
    subtitle: 'Bet on Outcomes',
    icon: TrendingUp,
    route: '/(main)/markets/prediction',
    countResolver: (data) => data.predictionMarkets.length,
  },
  {
    id: 'escrow',
    title: 'Escrow',
    subtitle: 'P2P Trading',
    icon: Shield,
    route: '/(main)/markets/escrow',
    countResolver: (data) => data.marketStats?.totalOrders,
  },
  {
    id: 'campaigns',
    title: 'Campaigns',
    subtitle: 'Crowdfunding',
    icon: Target,
    route: '/(main)/markets/campaigns',
    countResolver: (data) => data.campaigns.length,
  },
  {
    id: 'pools',
    title: 'AMM Pools',
    subtitle: 'Swap & Liquidity',
    icon: Droplets,
    route: '/(main)/crypto/pools',
    countResolver: (data) => data.marketStats?.totalPools,
  },
]

function formatCompactEXO(wei: string | bigint, decimals = 2): string {
  try {
    const value = typeof wei === 'bigint' ? wei : BigInt(wei || '0')
    const exoBase = 10n ** 18n
    if (value >= 1_000_000n * exoBase) {
      const scaled = (value * 100n) / (1_000_000n * exoBase)
      return `${(Number(scaled) / 100).toFixed(decimals)}M`
    }
    if (value >= 1_000n * exoBase) {
      const scaled = (value * 100n) / (1_000n * exoBase)
      return `${(Number(scaled) / 100).toFixed(decimals)}K`
    }
    return formatBigIntAmount(value, 18, decimals)
  } catch {
    return '0'
  }
}

function formatCount(n: number | undefined | null): string {
  if (n === undefined || n === null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function formatTimeLeft(endTime: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = endTime - now
  if (diff <= 0) return translate('Ended', { ns: 'markets' })
  if (diff < 3600) return translate('{{count}}m left', { ns: 'markets', count: Math.floor(diff / 60) })
  if (diff < 86400) return translate('{{count}}h left', { ns: 'markets', count: Math.floor(diff / 3600) })
  return translate('{{count}}d left', { ns: 'markets', count: Math.floor(diff / 86400) })
}

export default function MarketsHubScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const { colors, accent, alpha } = useCryptoTheme()
  useTranslation('markets')
  const accentColor = accent('mozaga')

  const [data, setData] = useState<MarketsAggregateData>({
    marketStats: null,
    activeMarkets: [],
    campaigns: [],
    predictionMarkets: [],
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchAll = useCallback(async () => {
    const [statsResult, marketsResult, campaignsResult, predictionResult] = await Promise.allSettled([
      getMarketStats(),
      getActiveMarkets(0, 6),
      getActiveCampaigns(0, 6),
      listPredictionMarkets(PredictionMarketStatus.Active, undefined, 0, 6),
    ])

    setData({
      marketStats: statsResult.status === 'fulfilled' ? statsResult.value : null,
      activeMarkets: marketsResult.status === 'fulfilled' ? (marketsResult.value?.markets ?? []) : [],
      campaigns: campaignsResult.status === 'fulfilled' ? campaignsResult.value : [],
      predictionMarkets: predictionResult.status === 'fulfilled' ? predictionResult.value : [],
    })
    setIsLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      fetchAll()
    }, [fetchAll]),
  )

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await fetchAll()
    setIsRefreshing(false)
  }

  const heroStats = useMemo(() => {
    return [
      { icon: Activity, label: translate('Active', { ns: 'markets' }), value: formatCount(data.marketStats?.activeMarkets) },
      { icon: Rocket, label: translate('Sales', { ns: 'markets' }), value: formatCount(data.marketStats?.totalSales) },
      { icon: Droplets, label: translate('Pools', { ns: 'markets' }), value: formatCount(data.marketStats?.totalPools) },
    ]
  }, [data.marketStats])

  const protocolFees = data.marketStats?.protocolFees ?? '0'

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 px-5 pb-3">
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 rounded-xl items-center justify-center active:opacity-70"
          style={{ backgroundColor: colors.surface }}
        >
          <ChevronLeft size={22} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-2xl font-bold text-text">{translate('Markets', { ns: 'markets' })}</Text>
          <Text className="text-text-muted text-xs mt-0.5">
            {translate('Trade, predict, fund and provide liquidity', { ns: 'markets' })}
          </Text>
        </View>
        <Pressable
          onPress={handleRefresh}
          disabled={isRefreshing}
          className="w-10 h-10 rounded-xl items-center justify-center active:opacity-70"
          style={{ backgroundColor: colors.surface }}
        >
          {isRefreshing ? (
            <ActivityIndicator size="small" color={accentColor} />
          ) : (
            <RefreshCw size={18} color={colors.text} />
          )}
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={accentColor}
          />
        }
      >
        <View className="px-5 pt-2">
          <View
            className="rounded-3xl p-5 border overflow-hidden"
            style={{
              backgroundColor: alpha(accentColor, 0.12),
              borderColor: alpha(accentColor, 0.28),
            }}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <View
                className="w-7 h-7 rounded-lg items-center justify-center"
                style={{ backgroundColor: alpha(accentColor, 0.25) }}
              >
                <Sparkles size={14} color={accentColor} />
              </View>
              <Text className="text-text-muted text-xs uppercase tracking-wide">
                {translate('Mozaga Markets', { ns: 'markets' })}
              </Text>
            </View>
            <Text className="text-text text-3xl font-bold">
              {formatCompactEXO(protocolFees)} EXO
            </Text>
            <Text className="text-text-muted text-xs mt-1">
              {translate('Protocol fees collected', { ns: 'markets' })}
            </Text>

            <View
              className="flex-row mt-5 gap-2"
            >
              {heroStats.map((stat) => {
                const Icon = stat.icon
                return (
                  <View
                    key={stat.label}
                    className="flex-1 rounded-2xl p-3"
                    style={{ backgroundColor: alpha(accentColor, 0.18) }}
                  >
                    <View className="flex-row items-center gap-1.5 mb-1">
                      <Icon size={12} color={accentColor} />
                      <Text className="text-text-muted text-[10px] uppercase">
                        {stat.label}
                      </Text>
                    </View>
                    <Text className="text-text text-lg font-bold">{stat.value}</Text>
                  </View>
                )
              })}
            </View>
          </View>
        </View>

        {data.activeMarkets.length > 0 && (
          <SectionCarousel
            title={translate('Trending Markets', { ns: 'markets' })}
            icon={Flame}
            accentColor={accentColor}
            colors={colors}
            alpha={alpha}
            onSeeAll={() => router.push(marketStaticRoute('/(main)/markets/primary'))}
          >
            {data.activeMarkets.slice(0, 6).map((market) => (
              <MarketPreviewCard
                key={market.marketId}
                market={market}
                accentColor={accentColor}
                colors={colors}
                alpha={alpha}
                onPress={() => router.push(primarySaleRoute(market.marketId))}
              />
            ))}
          </SectionCarousel>
        )}

        {data.campaigns.length > 0 && (
          <SectionCarousel
            title={translate('Live Campaigns', { ns: 'markets' })}
            icon={Target}
            accentColor={accentColor}
            colors={colors}
            alpha={alpha}
            onSeeAll={() => router.push(marketStaticRoute('/(main)/markets/campaigns'))}
          >
            {data.campaigns.slice(0, 6).map((campaign) => (
              <CampaignPreviewCard
                key={campaign.campaignId}
                campaign={campaign}
                accentColor={accentColor}
                colors={colors}
                alpha={alpha}
                onPress={() => router.push(campaignRoute(campaign.campaignId))}
              />
            ))}
          </SectionCarousel>
        )}

        {data.predictionMarkets.length > 0 && (
          <SectionCarousel
            title={translate('Hot Predictions', { ns: 'markets' })}
            icon={TrendingUp}
            accentColor={accentColor}
            colors={colors}
            alpha={alpha}
            onSeeAll={() => router.push(marketStaticRoute('/(main)/markets/prediction'))}
          >
            {data.predictionMarkets.slice(0, 6).map((market) => (
              <PredictionPreviewCard
                key={market.marketId}
                market={market}
                accentColor={accentColor}
                colors={colors}
                alpha={alpha}
                onPress={() => router.push(predictionMarketRoute(market.marketId))}
              />
            ))}
          </SectionCarousel>
        )}

        <View className="px-5 mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-text-muted text-xs uppercase tracking-wide">
              {translate('Explore', { ns: 'markets' })}
            </Text>
          </View>
          <View
            className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            {CATEGORIES.map((cat, index) => {
              const Icon = cat.icon
              const count = cat.countResolver?.(data)
              const isLast = index === CATEGORIES.length - 1
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => router.push(marketStaticRoute(cat.route))}
                  className="flex-row items-center gap-3 px-4 py-4 active:opacity-70"
                  style={!isLast ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined}
                >
                  <View
                    className="w-11 h-11 rounded-xl items-center justify-center"
                    style={{ backgroundColor: alpha(accentColor, 0.18) }}
                  >
                    <Icon size={20} color={accentColor} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-text font-semibold text-base">
                      {translate(cat.title, { ns: 'markets' })}
                    </Text>
                    <Text className="text-text-muted text-xs mt-0.5">
                      {translate(cat.subtitle, { ns: 'markets' })}
                    </Text>
                  </View>
                  {count !== undefined && (
                    <View
                      className="px-2.5 py-1 rounded-lg"
                      style={{ backgroundColor: alpha(accentColor, 0.16) }}
                    >
                      <Text className="text-xs font-semibold" style={{ color: accentColor }}>
                        {formatCount(count)}
                      </Text>
                    </View>
                  )}
                  <ChevronRight size={18} color={colors.textTertiary} />
                </Pressable>
              )
            })}
          </View>
        </View>

        {isLoading
          && !data.marketStats
          && data.activeMarkets.length === 0
          && data.campaigns.length === 0
          && data.predictionMarkets.length === 0 && (
            <View className="items-center py-10">
              <ActivityIndicator size="small" color={accentColor} />
              <Text className="text-text-muted text-sm mt-3">
                {translate('Loading markets...', { ns: 'markets' })}
              </Text>
            </View>
          )}
      </ScrollView>
    </View>
  )
}

interface SectionProps {
  title: string
  icon: typeof Rocket
  accentColor: string
  colors: ReturnType<typeof useCryptoTheme>['colors']
  alpha: ReturnType<typeof useCryptoTheme>['alpha']
  children: React.ReactNode
  onSeeAll: () => void
}

function SectionCarousel({ title, icon: Icon, accentColor, alpha, children, onSeeAll }: SectionProps) {
  return (
    <View className="mt-6">
      <View className="flex-row items-center justify-between px-5 mb-3">
        <View className="flex-row items-center gap-2">
          <View
            className="w-6 h-6 rounded-md items-center justify-center"
            style={{ backgroundColor: alpha(accentColor, 0.18) }}
          >
            <Icon size={12} color={accentColor} />
          </View>
          <Text className="text-text font-semibold text-base">{title}</Text>
        </View>
        <Pressable onPress={onSeeAll} className="flex-row items-center gap-0.5 active:opacity-70">
          <Text className="text-xs font-semibold" style={{ color: accentColor }}>
            {translate('See all', { ns: 'markets' })}
          </Text>
          <ChevronRight size={14} color={accentColor} />
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
      >
        {children}
      </ScrollView>
    </View>
  )
}

interface MarketPreviewProps {
  market: MarketInfo
  accentColor: string
  colors: ReturnType<typeof useCryptoTheme>['colors']
  alpha: ReturnType<typeof useCryptoTheme>['alpha']
  onPress: () => void
}

function MarketPreviewCard({ market, accentColor, colors, alpha, onPress }: MarketPreviewProps) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl p-4 border active:opacity-80"
      style={{
        width: 240,
        backgroundColor: colors.surface,
        borderColor: colors.border,
      }}
    >
      <View className="flex-row items-center gap-2 mb-3">
        <View
          className="w-8 h-8 rounded-lg items-center justify-center"
          style={{ backgroundColor: alpha(accentColor, 0.18) }}
        >
          <Rocket size={14} color={accentColor} />
        </View>
        <View
          className="px-2 py-0.5 rounded-md"
          style={{ backgroundColor: market.active ? alpha(accentColor, 0.18) : alpha(colors.textMuted, 0.18) }}
        >
          <Text
            className="text-[10px] font-semibold"
            style={{ color: market.active ? accentColor : colors.textMuted }}
          >
            {market.active
              ? translate('Active', { ns: 'markets' })
              : translate('Inactive', { ns: 'markets' })}
          </Text>
        </View>
      </View>
      <Text className="text-text font-bold text-base" numberOfLines={1}>
        {market.name || translate('Unnamed Market', { ns: 'markets' })}
      </Text>
      <Text className="text-text-muted text-xs mt-1" numberOfLines={2}>
        {market.description || translate('No description', { ns: 'markets' })}
      </Text>
      <View className="flex-row items-center gap-3 mt-4">
        <PreviewMetric label={translate('Assets', { ns: 'markets' })} value={String(market.enrolledAssets)} />
        <PreviewMetric label={translate('Submarkets', { ns: 'markets' })} value={String(market.submarketCount)} />
      </View>
    </Pressable>
  )
}

interface CampaignPreviewProps {
  campaign: CampaignListItem
  accentColor: string
  colors: ReturnType<typeof useCryptoTheme>['colors']
  alpha: ReturnType<typeof useCryptoTheme>['alpha']
  onPress: () => void
}

function CampaignPreviewCard({ campaign, accentColor, colors, alpha, onPress }: CampaignPreviewProps) {
  const percent = clampPercent(campaign.percentFunded ?? 0)
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl p-4 border active:opacity-80"
      style={{
        width: 260,
        backgroundColor: colors.surface,
        borderColor: colors.border,
      }}
    >
      <View className="flex-row items-center gap-2 mb-3">
        <View
          className="w-8 h-8 rounded-lg items-center justify-center"
          style={{ backgroundColor: alpha(accentColor, 0.18) }}
        >
          <Target size={14} color={accentColor} />
        </View>
        <Text className="text-text-muted text-[10px] uppercase">
          {formatTimeLeft(campaign.endTime)}
        </Text>
      </View>
      <Text className="text-text font-bold text-base" numberOfLines={1}>
        {campaign.title || translate('Untitled campaign', { ns: 'markets' })}
      </Text>
      <View className="flex-row items-baseline gap-1 mt-2">
        <Text className="text-text font-semibold text-base">
          {formatCompactEXO(campaign.raisedAmount)} EXO
        </Text>
        <Text className="text-text-muted text-xs">
          {translate('of', { ns: 'markets' })} {formatCompactEXO(campaign.fundingGoal)}
        </Text>
      </View>
      <View className="h-1.5 rounded-full mt-3 overflow-hidden" style={{ backgroundColor: alpha(accentColor, 0.15) }}>
        <View
          className="h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: accentColor }}
        />
      </View>
      <View className="flex-row items-center justify-between mt-2">
        <Text className="text-text-muted text-xs">
          {translate('{{count}} backers', { ns: 'markets', count: campaign.contributorCount })}
        </Text>
        <Text className="text-xs font-semibold" style={{ color: accentColor }}>
          {percent.toFixed(0)}%
        </Text>
      </View>
    </Pressable>
  )
}

interface PredictionPreviewProps {
  market: PredictionMarketInfo
  accentColor: string
  colors: ReturnType<typeof useCryptoTheme>['colors']
  alpha: ReturnType<typeof useCryptoTheme>['alpha']
  onPress: () => void
}

function PredictionPreviewCard({ market, accentColor, colors, alpha, onPress }: PredictionPreviewProps) {
  const yesPriceRaw = market.outcomePrices?.[0]
  const yesPercent = yesPriceRaw ? priceToPercent(Number(yesPriceRaw)) : null
  const yesLabel = market.outcomeLabels?.[0] ?? translate('Yes', { ns: 'markets' })
  const noLabel = market.outcomeLabels?.[1] ?? translate('No', { ns: 'markets' })
  const yesValue = yesPercent !== null ? Math.round(yesPercent) : null
  const noValue = yesValue !== null ? 100 - yesValue : null

  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl p-4 border active:opacity-80"
      style={{
        width: 260,
        backgroundColor: colors.surface,
        borderColor: colors.border,
      }}
    >
      <View className="flex-row items-center gap-2 mb-3">
        <View
          className="w-8 h-8 rounded-lg items-center justify-center"
          style={{ backgroundColor: alpha(accentColor, 0.18) }}
        >
          <TrendingUp size={14} color={accentColor} />
        </View>
        <Text className="text-text-muted text-[10px] uppercase">
          {formatTimeLeft(market.closingTime)}
        </Text>
      </View>
      <Text className="text-text font-semibold text-sm" numberOfLines={2}>
        {market.question}
      </Text>
      {yesValue !== null ? (
        <View className="flex-row gap-2 mt-3">
          <View
            className="flex-1 rounded-xl p-2"
            style={{ backgroundColor: alpha(accentColor, 0.16) }}
          >
            <Text className="text-text-muted text-[10px] uppercase">{yesLabel}</Text>
            <Text className="text-text font-bold text-base mt-0.5" style={{ color: accentColor }}>
              {yesValue}%
            </Text>
          </View>
          <View
            className="flex-1 rounded-xl p-2"
            style={{ backgroundColor: alpha(colors.textMuted, 0.12) }}
          >
            <Text className="text-text-muted text-[10px] uppercase">{noLabel}</Text>
            <Text className="text-text font-bold text-base mt-0.5">{noValue}%</Text>
          </View>
        </View>
      ) : (
        <Text className="text-text-muted text-xs mt-3">
          {translate('No order activity yet', { ns: 'markets' })}
        </Text>
      )}
      <View className="flex-row items-center gap-2 mt-3">
        <Activity size={11} color={colors.textMuted} />
        <Text className="text-text-muted text-xs">
          {translate('Vol', { ns: 'markets' })} {formatCompactEXO(market.totalVolume)} EXO
        </Text>
      </View>
    </Pressable>
  )
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-text-muted text-[10px] uppercase">{label}</Text>
      <Text className="text-text text-sm font-semibold mt-0.5">{value}</Text>
    </View>
  )
}
