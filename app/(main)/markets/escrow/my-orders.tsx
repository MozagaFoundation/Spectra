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
  ShieldCheck,
  Clock,
  Hash,
  User,
} from 'lucide-react-native'
import { useWalletStore } from '@/store'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import {
  escrowOrderRoute,
  formatMarketEXO,
  getMarketStatusBackground,
  truncateMarketAddress,
} from '@/lib/markets'
import {
  listEscrowOrders,
  formatOrderStatus,
  getStatusColor,
  formatTimeRemaining,
  type EscrowOrder,
} from '@/services/crypto/escrowService'

type RoleFilter = 'all' | 'seller' | 'buyer'
type StatusFilter = 'all' | 'active' | 'completed' | 'cancelled'
type SideFilter = 'all' | 'sell' | 'buy'

const ROLE_FILTERS: { key: RoleFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'seller', label: 'As Seller' },
  { key: 'buyer', label: 'As Buyer' },
]

const SIDE_FILTERS: { key: SideFilter; label: string }[] = [
  { key: 'all', label: 'All Sides' },
  { key: 'sell', label: 'Sell' },
  { key: 'buy', label: 'Buy' },
]

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
]

export default function MyEscrowOrders() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const { wallet } = useWalletStore()
  const colors = useThemeColors()

  const [orders, setOrders] = useState<EscrowOrder[]>([])
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sideFilter, setSideFilter] = useState<SideFilter>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    if (!wallet?.address) {
      setOrders([])
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }
    try {
      const statusMap: Record<StatusFilter, string | undefined> = {
        all: undefined,
        active: undefined,
        completed: 'Completed',
        cancelled: 'Cancelled',
      }
      const result = await listEscrowOrders(statusMap[statusFilter], wallet.address, 50, 0)

      let filtered = result
      if (statusFilter === 'active') {
        filtered = filtered.filter(o => ['Open', 'Accepted', 'SellerConfirmed'].includes(String(o.status)))
      }
      if (roleFilter === 'seller') filtered = filtered.filter(o => o.seller?.toLowerCase() === wallet.address.toLowerCase())
      if (roleFilter === 'buyer') filtered = filtered.filter(o => o.buyer?.toLowerCase() === wallet.address.toLowerCase())
      if (sideFilter === 'sell') filtered = filtered.filter(o => o.side === 'Sell' || !o.side)
      if (sideFilter === 'buy') filtered = filtered.filter(o => o.side === 'Buy')

      setOrders(filtered)
    } catch (error) {
      console.error('Error fetching my orders:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [wallet?.address, roleFilter, statusFilter, sideFilter])

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

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-text-muted text-base mt-4">
          {translate('Loading your orders...', { ns: 'markets' })}
        </Text>
      </View>
    )
  }

  if (!wallet) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <ShieldCheck size={40} color={colors.textMuted} />
        <Text className="text-text-muted text-base mt-3 text-center" style={{ color: colors.textMuted }}>
          {translate('Connect wallet to view your escrow orders', { ns: 'markets' })}
        </Text>
      </View>
    )
  }

  const renderOrder = ({ item }: { item: EscrowOrder }) => {
    const isFiat = item.orderType === 'Fiat'
    const isBuyOrder = item.side === 'Buy'
    const statusColor = getStatusColor(item.status)
    const statusBg = getMarketStatusBackground(statusColor)
    const isSeller = wallet?.address?.toLowerCase() === item.seller?.toLowerCase()

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
          <View className="flex-row items-center gap-1.5">
            <User size={12} color={isSeller ? colors.info : colors.success} />
            <Text className="text-xs font-medium" style={{ color: isSeller ? colors.info : colors.success }}>
              {translate(isSeller ? 'Seller' : 'Buyer', { ns: 'markets' })}
            </Text>
          </View>
        </View>

        <Text className="text-text text-xl font-bold mb-1" style={{ color: colors.text }}>{formatMarketEXO(item.amount)} EXO</Text>

        {isFiat && item.fiatPrice ? (
          <Text className="text-text-secondary text-sm mb-2" style={{ color: colors.textSecondary }}>
            {formatMarketEXO(item.fiatPrice, 2)} {item.fiatCurrency || 'USD'}
          </Text>
        ) : item.conditionDescription ? (
          <Text className="text-text-secondary text-sm mb-2" numberOfLines={1} style={{ color: colors.textSecondary }}>
            {item.conditionDescription}
          </Text>
        ) : null}

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            <Hash size={12} color={colors.textMuted} />
            <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>
              {truncateMarketAddress(isSeller ? (item.buyer || translate('Awaiting buyer', { ns: 'markets' })) : item.seller)}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Clock size={12} color={colors.textTertiary} />
            <Text className="text-text-tertiary text-xs" style={{ color: colors.textTertiary }}>
              {formatTimeRemaining(item.expiresAt)}
            </Text>
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
      <View className="flex-row items-center px-4 py-3">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="text-xl font-bold text-text ml-2" style={{ color: colors.text }}>
          {translate('My Orders', { ns: 'markets' })}
        </Text>
      </View>

      <View className="px-4 mb-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
          {ROLE_FILTERS.map(f => (
            <Pressable
              key={f.key}
              onPress={() => setRoleFilter(f.key)}
              className={`px-4 py-2 rounded-xl`}
              style={{ backgroundColor: roleFilter === f.key ? colors.primary : colors.surface }}
            >
              <Text
                className="text-sm font-medium"
                style={{ color: roleFilter === f.key ? '#fff' : colors.textSecondary }}
              >{translate(f.label, { ns: 'markets' })}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View className="px-4 mb-2">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
          {STATUS_FILTERS.map(f => (
            <Pressable
              key={f.key}
              onPress={() => setStatusFilter(f.key)}
              className="px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: statusFilter === f.key ? colors.primary + '33' : colors.backgroundSecondary }}
            >
              <Text
                className="text-xs font-medium"
                style={{ color: statusFilter === f.key ? colors.primary : colors.textMuted }}
              >{translate(f.label, { ns: 'markets' })}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View className="px-4 mb-3">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
          {SIDE_FILTERS.map(f => (
            <Pressable
              key={f.key}
              onPress={() => setSideFilter(f.key)}
              className="px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: sideFilter === f.key ? (f.key === 'sell' ? 'rgba(225,29,72,0.2)' : f.key === 'buy' ? 'rgba(14,165,233,0.2)' : colors.primary + '33') : colors.backgroundSecondary }}
            >
              <Text
                className="text-xs font-medium"
                style={{ color: sideFilter === f.key ? (f.key === 'sell' ? '#fb7185' : f.key === 'buy' ? '#38bdf8' : colors.primary) : colors.textMuted }}
              >{translate(f.label, { ns: 'markets' })}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

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
              {translate('No orders found', { ns: 'markets' })}
            </Text>
            <Text className="text-text-muted text-sm mt-1" style={{ color: colors.textMuted }}>
              {translate('Your escrow orders will appear here', { ns: 'markets' })}
            </Text>
          </View>
        }
      />
    </View>
  )
}
