/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
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
  Folder,
  Users,
  Clock,
  Target,
} from 'lucide-react-native'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { formatLocalizedPercent } from '@/lib/amounts'
import {
  campaignRoute,
  formatMarketEXO,
  getMarketStatusBackground,
  marketStaticRoute,
} from '@/lib/markets'
import {
  getActiveCampaigns,
  getCampaignStats,
  getCampaignStatusName,
  getCampaignStatusColor,
  getTimeRemaining,
  type CampaignListItem,
  type CampaignStats,
} from '@/services/crypto/campaignService'

export default function CampaignDashboard() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()

  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([])
  const [stats, setStats] = useState<CampaignStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [campaignsResult, statsResult] = await Promise.all([
        getActiveCampaigns(0, 50),
        getCampaignStats(),
      ])
      setCampaigns(campaignsResult)
      setStats(statsResult)
    } catch (error) {
      console.error('Error fetching campaigns:', error)
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

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-text-muted text-base mt-4">{translate('Loading campaigns...', { ns: 'markets' })}</Text>
      </View>
    )
  }

  const renderCampaign = ({ item }: { item: CampaignListItem }) => {
    const statusColor = getCampaignStatusColor(item.status)
    const statusBg = getMarketStatusBackground(statusColor)
    const percent = item.percentFunded ?? 0
    const progressWidth = Math.min(percent, 100)

    return (
      <Pressable
        onPress={() => router.push(campaignRoute(item.campaignId))}
        className="bg-surface rounded-2xl p-4 mb-3 active:opacity-80"
        style={{ backgroundColor: colors.surface }}
      >
        <View className="flex-row items-start justify-between mb-2">
          <Text className="text-text text-lg font-bold flex-1 mr-2" numberOfLines={2} style={{ color: colors.text }}>
            {item.title}
          </Text>
          <View className={`px-2 py-0.5 rounded-md ${statusBg}`}>
            <Text className={`text-xs font-medium ${statusColor}`}>
              {translate(getCampaignStatusName(item.status), { ns: 'markets' })}
            </Text>
          </View>
        </View>

        <View className="mb-3">
          <View className="flex-row justify-between mb-1.5">
            <Text className="text-text-secondary text-sm font-medium" style={{ color: colors.textSecondary }}>
              {formatMarketEXO(item.raisedAmount, 2)} / {formatMarketEXO(item.fundingGoal, 2)} EXO
            </Text>
            <Text className="text-primary text-sm font-bold" style={{ color: colors.primary }}>{formatLocalizedPercent(percent)}</Text>
          </View>
          <View className="h-2.5 bg-background rounded-full overflow-hidden" style={{ backgroundColor: colors.backgroundTertiary }}>
            <View
              className="h-full rounded-full"
              style={{ width: `${progressWidth}%`, backgroundColor: percent >= 100 ? colors.success : colors.primary }}
            />
          </View>
        </View>

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <View className="flex-row items-center gap-1">
              <Users size={13} color={colors.textMuted} />
              <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>{item.contributorCount}</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Clock size={13} color={colors.textMuted} />
              <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>{getTimeRemaining(item.endTime)}</Text>
            </View>
          </View>
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
            {translate('Campaigns', { ns: 'markets' })}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => router.push(marketStaticRoute('/(main)/markets/campaigns/my'))}
            className="h-10 px-3 rounded-xl bg-surface items-center justify-center flex-row gap-1.5 active:opacity-80"
            style={{ backgroundColor: colors.surface }}
          >
            <Folder size={16} color={colors.textTertiary} />
            <Text className="text-text-secondary text-sm font-medium" style={{ color: colors.textSecondary }}>
              {translate('My Campaigns', { ns: 'markets' })}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push(marketStaticRoute('/(main)/markets/campaigns/create'))}
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
            <Text className="text-text text-lg font-bold" style={{ color: colors.text }}>{stats.activeCampaigns}</Text>
          </View>
          <View className="flex-1 bg-surface rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>
              {translate('Succeeded', { ns: 'markets' })}
            </Text>
            <Text className="text-text text-lg font-bold" style={{ color: colors.text }}>{stats.succeededCount}</Text>
          </View>
          <View className="flex-1 bg-surface rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>
              {translate('Raised', { ns: 'markets' })}
            </Text>
            <Text className="text-text text-lg font-bold" numberOfLines={1} style={{ color: colors.text }}>{formatMarketEXO(stats.totalRaised, 0)}</Text>
          </View>
        </View>
      )}

      <FlatList
        data={campaigns}
        renderItem={renderCampaign}
        keyExtractor={item => item.campaignId}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          <View className="items-center justify-center py-16">
            <Target size={48} color={colors.textMuted} />
            <Text className="text-text-muted text-base mt-3" style={{ color: colors.textMuted }}>
              {translate('No active campaigns', { ns: 'markets' })}
            </Text>
            <Pressable
              onPress={() => router.push(marketStaticRoute('/(main)/markets/campaigns/create'))}
              className="mt-4 bg-primary px-6 py-3 rounded-xl active:opacity-80"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-onPrimary font-semibold">{translate('Create Campaign', { ns: 'markets' })}</Text>
            </Pressable>
          </View>
        }
      />
    </View>
  )
}
