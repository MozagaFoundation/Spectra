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
  Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ChevronLeft,
  Folder,
  Users,
  Clock,
  ArrowDownCircle,
  Target,
} from 'lucide-react-native'
import { useWalletStore, toast } from '@/store'
import { useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { formatLocalizedPercent } from '@/lib/amounts'
import {
  campaignRoute,
  formatMarketEXO,
  getMarketStatusBackground,
  marketStaticRoute,
} from '@/lib/markets'
import { waitForTransaction } from '@/services/crypto'
import {
  getUserContributions,
  getUserCreatedCampaigns,
  getRefundableCampaigns,
  claimCampaignRefund,
  getCampaignStatusName,
  getCampaignStatusColor,
  getTimeRemaining,
  type CampaignListItem,
  type UserContribution,
  type RefundableCampaign,
} from '@/services/crypto/campaignService'
import { translate } from '@/lib/i18n'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'

type TabKey = 'contributions' | 'created'

export default function MyCampaigns() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const { wallet } = useWalletStore()
  const colors = useThemeColors()

  const [tab, setTab] = useState<TabKey>('contributions')
  const [contributions, setContributions] = useState<UserContribution[]>([])
  const [created, setCreated] = useState<CampaignListItem[]>([])
  const [refundable, setRefundable] = useState<RefundableCampaign[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!wallet?.address) {
      setContributions([])
      setCreated([])
      setRefundable([])
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }
    try {
      const [contribs, createdCampaigns, refunds] = await Promise.all([
        getUserContributions(wallet.address, '', 0, 50),
        getUserCreatedCampaigns(wallet.address, '', 0, 50),
        getRefundableCampaigns(wallet.address, ''),
      ])
      setContributions(contribs)
      setCreated(createdCampaigns)
      setRefundable(refunds)
    } catch (error) {
      console.error('Error fetching my campaigns:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [wallet?.address])

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

  const handleClaimRefund = (campaign: RefundableCampaign) => {
    if (!wallet) return
    Alert.alert(translate('Claim Refund'), translate('Claim refund of {{amount}} EXO from "{{campaignTitle}}"?', {
      amount: formatMarketEXO(campaign.amount, 2),
      campaignTitle: campaign.campaignTitle,
    }), [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Claim'),
        onPress: async () => {
          try {
            setClaimingId(campaign.campaignId)
            toast.info(translate('Processing'), translate('Claiming refund...'))
            const { txHash } = await claimCampaignRefund(
              wallet.privateKey, wallet.publicKey, wallet.address, campaign.campaignId
            )
            toast.info(translate('Submitted'), translate('Waiting for confirmation...'))
            const status = await waitForTransaction(txHash, 15, 2000)
            if (status.status === 'confirmed') {
              toast.success(translate('Success'), translate('Refund claimed'))
            } else if (status.status === 'failed') {
              toast.error(translate('Failed'), translate('Refund claim failed'))
            } else {
              toast.success(translate('Submitted'), translate('Refund submitted'))
            }
            await fetchData()
          } catch (error: any) {
            console.error('Claim refund error:', error)
            toast.error(translate('Error'), getErrorDisplayMessage(error) || translate('Failed to claim refund'))
          } finally {
            setClaimingId(null)
          }
        },
      },
    ])
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-text-muted text-base mt-4">{translate('Loading your campaigns...')}</Text>
      </View>
    )
  }

  if (!wallet) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <Folder size={40} color={colors.textMuted} />
        <Text className="text-text-muted text-base mt-3 text-center" style={{ color: colors.textMuted }}>
          {translate('Connect wallet to view your campaigns', { ns: 'markets' })}
        </Text>
      </View>
    )
  }

  const renderContribution = ({ item }: { item: UserContribution }) => {
    const statusColor = getCampaignStatusColor(item.status)
    const statusBg = getMarketStatusBackground(statusColor)

    return (
      <Pressable
        onPress={() => router.push(campaignRoute(item.campaignId))}
        className="bg-surface rounded-2xl p-4 mb-3 active:opacity-80"
        style={{ backgroundColor: colors.surface }}
      >
        <View className="flex-row items-start justify-between mb-2">
          <Text className="text-text text-base font-bold flex-1 mr-2" numberOfLines={1} style={{ color: colors.text }}>
            {item.campaignTitle}
          </Text>
          <View className={`px-2 py-0.5 rounded-md ${statusBg}`}>
            <Text className={`text-xs font-medium ${statusColor}`}>{getCampaignStatusName(item.status)}</Text>
          </View>
        </View>
        <View className="flex-row items-center justify-between">
          <Text className="text-primary text-lg font-bold" style={{ color: colors.primary }}>{formatMarketEXO(item.amount, 2)} EXO</Text>
          <View className="flex-row items-center gap-1">
            <Clock size={12} color={colors.textMuted} />
            <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>{getTimeRemaining(item.endTime)}</Text>
          </View>
        </View>
        {item.refunded && (
          <View className="mt-2 bg-green-500/10 rounded-lg px-2.5 py-1 self-start">
            <Text className="text-green-400 text-xs font-medium">{translate('Refunded')}</Text>
          </View>
        )}
      </Pressable>
    )
  }

  const renderCreated = ({ item }: { item: CampaignListItem }) => {
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
          <Text className="text-text text-base font-bold flex-1 mr-2" numberOfLines={1} style={{ color: colors.text }}>
            {item.title}
          </Text>
          <View className={`px-2 py-0.5 rounded-md ${statusBg}`}>
            <Text className={`text-xs font-medium ${statusColor}`}>{getCampaignStatusName(item.status)}</Text>
          </View>
        </View>

        <View className="mb-2">
          <View className="flex-row justify-between mb-1">
            <Text className="text-text-secondary text-sm" style={{ color: colors.textSecondary }}>
              {formatMarketEXO(item.raisedAmount, 2)} / {formatMarketEXO(item.fundingGoal, 2)} EXO
            </Text>
            <Text className="text-primary text-sm font-bold" style={{ color: colors.primary }}>{formatLocalizedPercent(percent)}</Text>
          </View>
          <View className="h-2 bg-background rounded-full overflow-hidden" style={{ backgroundColor: colors.backgroundTertiary }}>
            <View
              className="h-full rounded-full"
              style={{ width: `${progressWidth}%`, backgroundColor: percent >= 100 ? colors.success : colors.primary }}
            />
          </View>
        </View>

        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1">
            <Users size={12} color={colors.textMuted} />
            <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>{item.contributorCount}</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Clock size={12} color={colors.textMuted} />
            <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>{getTimeRemaining(item.endTime)}</Text>
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
          {translate('My Campaigns')}
        </Text>
      </View>

      <View className="px-4 mb-3">
        <View className="flex-row bg-surface rounded-xl p-1" style={{ backgroundColor: colors.surface }}>
          <Pressable
            onPress={() => setTab('contributions')}
            className="flex-1 py-2.5 rounded-lg items-center"
            style={tab === 'contributions' ? { backgroundColor: colors.primary } : undefined}
          >
            <Text
              className="font-semibold text-sm"
              style={{ color: tab === 'contributions' ? colors.textOnPrimary : colors.textMuted }}
            >{translate('My Contributions')}</Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('created')}
            className="flex-1 py-2.5 rounded-lg items-center"
            style={tab === 'created' ? { backgroundColor: colors.primary } : undefined}
          >
            <Text
              className="font-semibold text-sm"
              style={{ color: tab === 'created' ? colors.textOnPrimary : colors.textMuted }}
            >{translate('Created by Me')}</Text>
          </Pressable>
        </View>
      </View>

      {tab === 'contributions' && refundable.length > 0 && (
        <View className="px-4 mb-3">
          <View className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-4" style={{ borderColor: colors.warning + '33' }}>
            <View className="flex-row items-center gap-2 mb-2">
              <ArrowDownCircle size={18} color={colors.warning} />
              <Text className="text-sm font-semibold" style={{ color: colors.warning }}>{translate('Refunds Available')}</Text>
            </View>
            {refundable.map(r => (
              <View key={r.campaignId} className="flex-row items-center justify-between py-2">
                <View className="flex-1 mr-3">
                  <Text className="text-text text-sm font-medium" numberOfLines={1} style={{ color: colors.text }}>{r.campaignTitle}</Text>
                  <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>{formatMarketEXO(r.amount, 2)} EXO</Text>
                </View>
                <Pressable
                  onPress={() => handleClaimRefund(r)}
                  disabled={claimingId === r.campaignId}
                  className="px-4 py-2 rounded-xl active:opacity-80"
                  style={{ backgroundColor: colors.warning, opacity: claimingId === r.campaignId ? 0.5 : 1 }}
                >
                  {claimingId === r.campaignId ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <Text className="text-white text-xs font-bold">{translate('Claim')}</Text>
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      )}

      {tab === 'contributions' ? (
        <FlatList
          data={contributions}
          renderItem={renderContribution}
          keyExtractor={item => item.campaignId}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View className="items-center justify-center py-16">
              <Target size={48} color={colors.textMuted} />
              <Text className="text-text-muted text-base mt-3" style={{ color: colors.textMuted }}>
                {translate('No contributions yet')}
              </Text>
              <Text className="text-text-muted text-sm mt-1" style={{ color: colors.textMuted }}>
                {translate('Campaigns you contribute to will appear here')}
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={created}
          renderItem={renderCreated}
          keyExtractor={item => item.campaignId}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View className="items-center justify-center py-16">
              <Folder size={48} color={colors.textMuted} />
              <Text className="text-text-muted text-base mt-3" style={{ color: colors.textMuted }}>
                {translate('No campaigns created')}
              </Text>
              <Pressable
                onPress={() => router.push(marketStaticRoute('/(main)/markets/campaigns/create'))}
                className="mt-4 bg-primary px-6 py-3 rounded-xl active:opacity-80"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-onPrimary font-semibold">{translate('Create Campaign')}</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </View>
  )
}
