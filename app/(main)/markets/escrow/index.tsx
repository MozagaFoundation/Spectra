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
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ChevronLeft,
  Plus,
  ClipboardList,
  ShieldCheck,
  Hash,
  Clock,
} from 'lucide-react-native'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import {
  escrowOrderRoute,
  formatMarketEXO,
  getMarketStatusBackground,
  marketStaticRoute,
  truncateMarketAddress,
} from '@/lib/markets'
import {
  listEscrowOrders,
  getEscrowStats,
  formatOrderStatus,
  getStatusColor,
  formatTimeRemaining,
  type EscrowOrder,
  type EscrowStats,
} from '@/services/crypto/escrowService'

type FilterOption = 'all' | 'open' | 'fiat' | 'condition'
type SideFilter = 'all' | 'sell' | 'buy'
const FILTERS: { key: FilterOption; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'fiat', label: 'Fiat' },
  { key: 'condition', label: 'Condition' },
]
const SIDE_FILTERS: { key: SideFilter; label: string }[] = [
  { key: 'all', label: 'All Sides' },
  { key: 'sell', label: 'Sell' },
  { key: 'buy', label: 'Buy' },
]

export default function EscrowMarketplace() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()

  const [allOrders, setAllOrders] = useState<EscrowOrder[]>([])
  const [orders, setOrders] = useState<EscrowOrder[]>([])
  const [stats, setStats] = useState<EscrowStats | null>(null)
  const [filter, setFilter] = useState<FilterOption>('all')
  const [sideFilter, setSideFilter] = useState<SideFilter>('all')
  const [currencyFilter, setCurrencyFilter] = useState<string>('all')
  const [currencies, setCurrencies] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const applyFilters = useCallback((source: EscrowOrder[], type: FilterOption, currency: string, side: SideFilter) => {
    let filtered = source
    if (type === 'fiat') filtered = filtered.filter(o => o.orderType === 'Fiat')
    if (type === 'condition') filtered = filtered.filter(o => o.orderType === 'Condition')
    if (side === 'sell') filtered = filtered.filter(o => o.side === 'Sell' || !o.side)
    if (side === 'buy') filtered = filtered.filter(o => o.side === 'Buy')
    if (currency !== 'all') filtered = filtered.filter(o => (o.fiatCurrency || 'EXO') === currency)
    return filtered
  }, [])

  const fetchData = useCallback(async () => {
    try {
      const statusParam = filter === 'open' ? 'Open' : undefined
      const [ordersResult, statsResult] = await Promise.all([
        listEscrowOrders(statusParam, undefined, 50, 0),
        getEscrowStats(),
      ])

      const uniqueCurrencies = [...new Set(ordersResult.map(o => o.fiatCurrency || 'EXO'))].sort()
      setCurrencies(uniqueCurrencies)
      setAllOrders(ordersResult)
      setOrders(applyFilters(ordersResult, filter, currencyFilter, sideFilter))
      setStats(statsResult)
    } catch (error) {
      console.error('Error fetching escrow data:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [filter, currencyFilter, sideFilter, applyFilters])

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true)
      fetchData()
    }, [fetchData])
  )

  const handleCurrencyChange = useCallback((currency: string) => {
    setCurrencyFilter(currency)
    setOrders(applyFilters(allOrders, filter, currency, sideFilter))
  }, [allOrders, filter, sideFilter, applyFilters])

  const handleSideChange = useCallback((side: SideFilter) => {
    setSideFilter(side)
    setOrders(applyFilters(allOrders, filter, currencyFilter, side))
  }, [allOrders, filter, currencyFilter, applyFilters])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await fetchData()
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-text-muted text-base mt-4">
          {translate('Loading escrow orders...', { ns: 'markets' })}
        </Text>
      </View>
    )
  }

  const renderOrder = ({ item }: { item: EscrowOrder }) => {
    const isFiat = item.orderType === 'Fiat'
    const isBuyOrder = item.side === 'Buy'
    const statusColor = getStatusColor(item.status)
    const statusBg = getMarketStatusBackground(statusColor)

    return (
      <Pressable
        onPress={() => router.push(escrowOrderRoute(item.orderId))}
        className="bg-surface rounded-2xl p-4 mb-3 active:opacity-80"
        style={{ backgroundColor: colors.surface }}
      >
        <View className="flex-row items-center justify-between mb-2.5">
          <View className="flex-row items-center gap-2">
            <View className="px-2.5 py-1 rounded-lg" style={{ backgroundColor: isBuyOrder ? 'rgba(14,165,233,0.15)' : 'rgba(225,29,72,0.15)' }}>
              <Text className="text-xs font-bold" style={{ color: isBuyOrder ? '#38bdf8' : '#fb7185' }}>
                {translate(isBuyOrder ? 'Buy' : 'Sell', { ns: 'markets' })}
              </Text>
            </View>
            <View className={`px-2.5 py-1 rounded-lg ${isFiat ? 'bg-emerald-500/15' : 'bg-cyan-500/15'}`}>
              <Text className={`text-xs font-semibold ${isFiat ? 'text-emerald-400' : 'text-cyan-400'}`}>
                {translate(isFiat ? 'Fiat' : 'Condition', { ns: 'markets' })}
              </Text>
            </View>
            <View className={`px-2 py-0.5 rounded-md ${statusBg}`}>
              <Text className={`text-xs font-medium ${statusColor}`}>
                {translate(formatOrderStatus(item.status), { ns: 'markets' })}
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-1">
            <Clock size={12} color={colors.textTertiary} />
            <Text className="text-text-tertiary text-xs">{formatTimeRemaining(item.expiresAt)}</Text>
          </View>
        </View>

        <Text className="text-text text-xl font-bold mb-1">{formatMarketEXO(item.amount)} EXO</Text>

        {isFiat && item.fiatPrice ? (
          <Text className="text-text-secondary text-sm mb-2">
            {formatMarketEXO(item.fiatPrice, 2)} {item.fiatCurrency || 'USD'}
          </Text>
        ) : item.conditionDescription ? (
          <Text className="text-text-secondary text-sm mb-2" numberOfLines={1}>
            {item.conditionDescription}
          </Text>
        ) : null}

        <View className="flex-row items-center gap-1.5">
          <Hash size={12} color={colors.textMuted} />
          <Text className="text-text-muted text-xs">{truncateMarketAddress(item.seller)}</Text>
        </View>
      </Pressable>
    )
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="text-xl font-bold text-text" style={{ color: colors.text }}>
            {translate('Escrow', { ns: 'markets' })}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => router.push(marketStaticRoute('/(main)/markets/escrow/my-orders'))}
            className="h-10 px-3 rounded-xl bg-surface items-center justify-center flex-row gap-1.5 active:opacity-80"
            style={{ backgroundColor: colors.surface }}
          >
            <ClipboardList size={16} color={colors.textTertiary} />
            <Text className="text-text-secondary text-sm font-medium" style={{ color: colors.textSecondary }}>
              {translate('My Orders', { ns: 'markets' })}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(marketStaticRoute('/(main)/markets/escrow/create'))}
            className="w-10 h-10 rounded-xl bg-primary items-center justify-center active:opacity-80"
            style={{ backgroundColor: colors.primary }}
          >
            <Plus size={20} color={colors.textOnPrimary} />
          </Pressable>
        </View>
      </View>

      {stats && (
        <View className="flex-row gap-2 px-4 mb-3">
          <View className="flex-1 bg-surface rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>
              {translate('Active', { ns: 'markets' })}
            </Text>
            <Text className="text-text text-lg font-bold" style={{ color: colors.text }}>{stats.activeOrders}</Text>
          </View>
          <View className="flex-1 bg-surface rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>
              {translate('Total', { ns: 'markets' })}
            </Text>
            <Text className="text-text text-lg font-bold" style={{ color: colors.text }}>{stats.totalOrders}</Text>
          </View>
          <View className="flex-1 bg-surface rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>
              {translate('Arbitrators', { ns: 'markets' })}
            </Text>
            <Text className="text-text text-lg font-bold" style={{ color: colors.text }}>{stats.arbitratorCount}</Text>
          </View>
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        className="mb-2"
        style={{ flexGrow: 0 }}
      >
        {FILTERS.map(f => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl ${filter === f.key ? 'bg-primary' : 'bg-surface'}`}
            style={{ backgroundColor: filter === f.key ? colors.primary : colors.surface }}
          >
            <Text
              className={`text-sm font-medium ${filter === f.key ? 'text-onPrimary' : 'text-text-secondary'}`}
              style={{ color: filter === f.key ? colors.textOnPrimary : colors.textSecondary }}
            >
              {translate(f.label, { ns: 'markets' })}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        className="mb-2"
        style={{ flexGrow: 0 }}
      >
        {SIDE_FILTERS.map(f => (
          <Pressable
            key={f.key}
            onPress={() => handleSideChange(f.key)}
            className="px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: sideFilter === f.key ? (f.key === 'sell' ? 'rgba(225,29,72,0.2)' : f.key === 'buy' ? 'rgba(14,165,233,0.2)' : colors.primary + '33') : colors.surface }}
          >
            <Text
              className="text-xs font-medium"
              style={{ color: sideFilter === f.key ? (f.key === 'sell' ? '#fb7185' : f.key === 'buy' ? '#38bdf8' : colors.primary) : colors.textTertiary }}
            >
              {translate(f.label, { ns: 'markets' })}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {currencies.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          className="mb-3"
          style={{ flexGrow: 0 }}
        >
          <Pressable
            onPress={() => handleCurrencyChange('all')}
            className={`px-3 py-1.5 rounded-lg ${currencyFilter === 'all' ? 'bg-primary/20' : 'bg-surface'}`}
            style={{ backgroundColor: currencyFilter === 'all' ? colors.primary + '33' : colors.surface }}
          >
            <Text
              className={`text-xs font-medium ${currencyFilter === 'all' ? 'text-primary' : 'text-text-tertiary'}`}
              style={{ color: currencyFilter === 'all' ? colors.primary : colors.textTertiary }}
            >
              {translate('All currencies', { ns: 'markets' })}
            </Text>
          </Pressable>
          {currencies.map(c => (
            <Pressable
              key={c}
              onPress={() => handleCurrencyChange(c)}
              className={`px-3 py-1.5 rounded-lg ${currencyFilter === c ? 'bg-primary/20' : 'bg-surface'}`}
              style={{ backgroundColor: currencyFilter === c ? colors.primary + '33' : colors.surface }}
            >
              <Text
                className={`text-xs font-medium ${currencyFilter === c ? 'text-primary' : 'text-text-tertiary'}`}
                style={{ color: currencyFilter === c ? colors.primary : colors.textTertiary }}
              >
                {c}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={orders}
        renderItem={renderOrder}
        keyExtractor={item => item.orderId}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View className="items-center justify-center py-16">
            <ShieldCheck size={48} color={colors.textMuted} />
            <Text className="text-text-muted text-base mt-3" style={{ color: colors.textMuted }}>
              {translate('No escrow orders found', { ns: 'markets' })}
            </Text>
            <Pressable
              onPress={() => router.push(marketStaticRoute('/(main)/markets/escrow/create'))}
              className="mt-4 bg-primary px-6 py-3 rounded-xl active:opacity-80"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-onPrimary font-semibold">{translate('Create Order', { ns: 'markets' })}</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  )
}
