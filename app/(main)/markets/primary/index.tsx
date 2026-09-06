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
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, ChevronRight, Search, Rocket, TrendingUp } from 'lucide-react-native'
import { useThemeColors } from '@/lib/theme'
import { getCurrentLocaleTag, translate } from '@/lib/i18n'
import { getActiveMarkets, getMarketStats } from '@/services/crypto/marketService'
import type { MarketInfo, MarketStats, ActiveMarketsPage } from '@/services/crypto/marketService'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { isValidMarketEntityId, primarySaleRoute, sanitizeMarketEntityIdInput } from '@/lib/markets'

function truncateId(id: string): string {
  if (!id) return '?'
  const clean = id.replace(/^(0x|EXO|EXI)/i, '')
  if (clean.length <= 10) return clean
  return clean.slice(0, 6) + '...' + clean.slice(-4)
}

export default function PrimaryMarketScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()

  const [stats, setStats] = useState<MarketStats | null>(null)
  const [marketsPage, setMarketsPage] = useState<ActiveMarketsPage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [saleIdInput, setSaleIdInput] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const [statsResult, marketsResult] = await Promise.all([
        getMarketStats(),
        getActiveMarkets(0, 50),
      ])
      setStats(statsResult)
      setMarketsPage(marketsResult)
    } catch (error) {
      console.error('Error fetching primary market data:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true)
      fetchData()
    }, [fetchData])
  )

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await fetchData()
  }

  const handleViewSale = () => {
    const trimmed = sanitizeMarketEntityIdInput(saleIdInput)
    if (!trimmed) return
    if (!isValidMarketEntityId(trimmed)) {
      Alert.alert(
        translate('Invalid', { ns: 'markets' }),
        translate('Enter a valid sale ID', { ns: 'markets' }),
      )
      return
    }
    router.push(primarySaleRoute(trimmed))
  }

  const markets = marketsPage?.markets || []
  const filteredMarkets = searchQuery.trim()
    ? markets.filter(
        (m) =>
          m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.marketId.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : markets

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top, backgroundColor: colors.background }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-text-muted text-base mt-4">
          {translate('Loading markets...', { ns: 'markets' })}
        </Text>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ArrowLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="text-xl font-bold text-text">
            {translate('Primary Market', { ns: 'markets' })}
          </Text>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        {stats && (
          <View className="flex-row gap-3 mb-4">
            <View className="flex-1 bg-surface rounded-2xl p-4">
              <View className="flex-row items-center gap-2 mb-2">
                <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: colors.primary + '20' }}>
                  <TrendingUp size={16} color={colors.primary} />
                </View>
              </View>
              <Text className="text-text text-2xl font-bold">{stats.activeMarkets}</Text>
              <Text className="text-text-muted text-xs mt-0.5">
                {translate('Active Markets', { ns: 'markets' })}
              </Text>
            </View>
            <View className="flex-1 bg-surface rounded-2xl p-4">
              <View className="flex-row items-center gap-2 mb-2">
                <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: colors.info + '20' }}>
                  <Rocket size={16} color={colors.info} />
                </View>
              </View>
              <Text className="text-text text-2xl font-bold">{stats.totalSales}</Text>
              <Text className="text-text-muted text-xs mt-0.5">
                {translate('Total Sales', { ns: 'markets' })}
              </Text>
            </View>
          </View>
        )}

        <View className="bg-surface rounded-2xl p-4 mb-4">
          <Text className="text-text font-semibold text-sm mb-2">
            {translate('Look Up Sale', { ns: 'markets' })}
          </Text>
          <View className="flex-row gap-2">
            <View className="flex-1 flex-row items-center bg-background/50 rounded-xl px-3">
              <Search size={16} color={colors.textMuted} />
              <TextInput
                className="flex-1 text-text text-sm py-3 pl-2"
                placeholder={translate('Enter sale ID...', { ns: 'markets' })}
                placeholderTextColor={colors.textMuted}
                value={saleIdInput}
                onChangeText={setSaleIdInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <Pressable
              onPress={handleViewSale}
              disabled={!saleIdInput.trim()}
              className="bg-primary px-5 rounded-xl items-center justify-center active:bg-primary-dark disabled:opacity-40"
            >
              <Text className="text-onPrimary font-semibold text-sm">
                {translate('View', { ns: 'markets' })}
              </Text>
            </Pressable>
          </View>
        </View>

        <View className="mb-4">
          <View className="flex-row items-center bg-surface rounded-xl px-3 mb-1">
            <Search size={16} color={colors.textMuted} />
            <TextInput
              className="flex-1 text-text text-sm py-3 pl-2"
              placeholder={translate('Search markets...', { ns: 'markets' })}
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-text font-semibold text-base">
            {translate('Active Markets', { ns: 'markets' })}
          </Text>
          <Text className="text-text-muted text-xs">
            {translate('{{count}} of {{total}}', {
              ns: 'markets',
              count: filteredMarkets.length,
              total: marketsPage?.totalCount ?? 0,
            })}
          </Text>
        </View>

        {filteredMarkets.length === 0 ? (
          <View className="bg-surface rounded-2xl p-8 items-center">
            <Rocket size={40} color={colors.textMuted} />
            <Text className="text-text-muted text-base mt-3">
              {translate('No markets found', { ns: 'markets' })}
            </Text>
            <Text className="text-text-muted text-sm mt-1 text-center">
              {searchQuery
                ? translate('Try a different search term', { ns: 'markets' })
                : translate('Check back later for active markets', { ns: 'markets' })}
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {filteredMarkets.map((market) => (
              <MarketCard key={market.marketId} market={market} colors={colors} router={router} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function MarketCard({
  market,
  colors,
  router,
}: {
  market: MarketInfo
  colors: ReturnType<typeof useThemeColors>
  router: ReturnType<typeof useGuardedRouter>
}) {
  return (
    <Pressable
      onPress={() => router.push(primarySaleRoute(market.marketId))}
      className="bg-surface rounded-2xl p-4 active:bg-surface-hover"
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 mr-3">
          <Text className="text-text font-bold text-base" numberOfLines={1}>
            {market.name || translate('Unnamed Market', { ns: 'markets' })}
          </Text>
          {market.description ? (
            <Text className="text-text-muted text-sm mt-1" numberOfLines={2}>
              {market.description}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-1">
          {market.active ? (
            <View className="bg-emerald-500/15 px-2 py-1 rounded-md">
              <Text className="text-emerald-400 text-xs font-semibold">
                {translate('Active', { ns: 'markets' })}
              </Text>
            </View>
          ) : (
            <View className="bg-rose-500/15 px-2 py-1 rounded-md">
              <Text className="text-rose-400 text-xs font-semibold">
                {translate('Inactive', { ns: 'markets' })}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View className="flex-row gap-2 mb-3">
        <View className="bg-background/50 rounded-xl px-3 py-2">
          <Text className="text-text-muted text-[10px]">{translate('ID', { ns: 'markets' })}</Text>
          <Text className="text-text text-xs font-medium">{truncateId(market.marketId)}</Text>
        </View>
        <View className="bg-background/50 rounded-xl px-3 py-2">
          <Text className="text-text-muted text-[10px]">
            {translate('Assets', { ns: 'markets' })}
          </Text>
          <Text className="text-text text-xs font-medium">{market.enrolledAssets}</Text>
        </View>
        <View className="bg-background/50 rounded-xl px-3 py-2">
          <Text className="text-text-muted text-[10px]">
            {translate('Submarkets', { ns: 'markets' })}
          </Text>
          <Text className="text-text text-xs font-medium">{market.submarketCount}</Text>
        </View>
        {market.freeEnrollment && (
          <View className="bg-primary/10 rounded-xl px-3 py-2">
            <Text className="text-text-muted text-[10px]">
              {translate('Enrollment', { ns: 'markets' })}
            </Text>
            <Text className="text-primary text-xs font-medium">
              {translate('Free', { ns: 'markets' })}
            </Text>
          </View>
        )}
      </View>

      <View className="flex-row items-center justify-between">
        <Text className="text-text-muted text-xs">
          {translate('Created {{date}}', {
            ns: 'markets',
            date: new Date(market.createdAt * 1000).toLocaleDateString(getCurrentLocaleTag()),
          })}
        </Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-primary text-xs font-semibold">
            {translate('View Sales', { ns: 'markets' })}
          </Text>
          <ChevronRight size={14} color={colors.primary} />
        </View>
      </View>
    </Pressable>
  )
}
