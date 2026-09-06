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
  XCircle,
  Users,
  Clock,
  Target,
  CheckCircle2,
  ArrowDownCircle,
  Hash,
} from 'lucide-react-native'
import { useWalletStore, toast } from '@/store'
import { useThemeColors } from '@/lib/theme'
import { getCurrentLocaleTag, translate } from '@/lib/i18n'
import { waitForTransaction } from '@/services/crypto'
import {
  getCampaign,
  getCampaignContributors,
  canContribute,
  canFinalize,
  contributeToCampaign,
  finalizeCampaign,
  claimCampaignRefund,
  getCampaignStatusName,
  getCampaignStatusColor,
  getTimeRemaining,
  hasCampaignEnded,
  calculatePercentFunded,
  CampaignStatus,
  type CampaignInfo,
  type ContributorInfo,
  type CanContributeResponse,
  type CanFinalizeResponse,
} from '@/services/crypto/campaignService'
import { formatLocalizedPercent, parseDecimalToBigInt } from '@/lib/amounts'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import {
  formatMarketEXO,
  getMarketStatusBackground,
  isValidMarketEntityId,
  truncateMarketAddress,
} from '@/lib/markets'

function parseEXOInput(ota: string): bigint {
  return parseDecimalToBigInt(ota, 18) ?? 0n
}

function formatTimestamp(ts: number): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString(getCurrentLocaleTag())
}

export default function CampaignDetail() {
  const router = useRouter()
  const { campaignId } = useLocalSearchParams<{ campaignId: string }>()
  const insets = useSafeAreaInsets()
  const { wallet } = useWalletStore()
  const colors = useThemeColors()

  const [campaign, setCampaign] = useState<CampaignInfo | null>(null)
  const [contributors, setContributors] = useState<ContributorInfo[]>([])
  const [contributeCheck, setContributeCheck] = useState<CanContributeResponse | null>(null)
  const [finalizeCheck, setFinalizeCheck] = useState<CanFinalizeResponse | null>(null)
  const [contributeAmount, setContributeAmount] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    if (!campaignId) return
    if (!isValidMarketEntityId(campaignId)) {
      setCampaign(null)
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }
    try {
      const c = await getCampaign(campaignId)
      setCampaign(c)

      if (c) {
        const contribs = await getCampaignContributors(campaignId, 0, 50)
        setContributors(contribs)

        if (wallet?.address && c.status === CampaignStatus.Active) {
          const check = await canContribute(campaignId, wallet.address, '1000000000000000000')
          setContributeCheck(check)
        }

        if (hasCampaignEnded(c.endTime)) {
          const fCheck = await canFinalize(campaignId)
          setFinalizeCheck(fCheck)
        }
      }
    } catch (error) {
      console.error('Error fetching campaign:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [campaignId, wallet?.address])

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

  const execTransaction = async (label: string, fn: () => Promise<{ txHash: string }>) => {
    if (!wallet) return
    if (!campaignId || !isValidMarketEntityId(campaignId)) {
      toast.error(translate('Invalid campaign ID', { ns: 'markets' }))
      return
    }
    try {
      setIsSubmitting(true)
      toast.info(
        translate('Processing'),
        translate('{{label}}...', { ns: 'markets', label }),
      )
      const { txHash } = await fn()
      toast.info(
        translate('Submitted'),
        translate('Waiting for confirmation...', { ns: 'markets' }),
      )
      const status = await waitForTransaction(txHash, 15, 2000)
      if (status.status === 'confirmed') {
        toast.success(
          translate('Success'),
          translate('{{label}} confirmed', { ns: 'markets', label }),
        )
      } else if (status.status === 'failed') {
        toast.error(
          translate('Failed'),
          translate('{{label}} failed', { ns: 'markets', label }),
        )
      } else {
        toast.success(
          translate('Submitted'),
          translate('Transaction submitted', { ns: 'markets' }),
        )
      }
      await fetchData()
    } catch (error: any) {
      console.error(`${label} error:`, error)
      toast.error(
        translate('Error'),
        getErrorDisplayMessage(error) || translate('{{label}} failed', { ns: 'markets', label }),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleContribute = () => {
    if (!wallet || !campaign) return
    const amountWei = parseEXOInput(contributeAmount)
    if (amountWei <= 0n) {
      Alert.alert(
        translate('Invalid', { ns: 'markets' }),
        translate('Enter a valid amount', { ns: 'markets' }),
      )
      return
    }
    if (contributeCheck && !contributeCheck.canContribute) {
      Alert.alert(
        translate('Cannot contribute', { ns: 'markets' }),
        contributeCheck.reason || translate('You are not eligible to contribute', { ns: 'markets' }),
      )
      return
    }
    if (contributeCheck?.remainingAllowance && amountWei > BigInt(contributeCheck.remainingAllowance)) {
      Alert.alert(
        translate('Invalid', { ns: 'markets' }),
        translate('Amount exceeds remaining allowance', { ns: 'markets' }),
      )
      return
    }

    Alert.alert(
      translate('Contribute', { ns: 'markets' }),
      translate('Contribute {{amount}} EXO to "{{title}}"?', {
        ns: 'markets',
        amount: contributeAmount,
        title: campaign.title,
      }),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Contribute', { ns: 'markets' }),
          onPress: () => {
            execTransaction(translate('Contribution', { ns: 'markets' }), () =>
              contributeToCampaign(wallet.privateKey, wallet.publicKey, wallet.address, campaign.campaignId, amountWei)
            )
            setContributeAmount('')
          },
        },
      ],
    )
  }

  const handleFinalize = () => {
    if (!wallet || !campaign) return
    Alert.alert(translate('Finalize Campaign', { ns: 'markets' }), translate('Finalize campaign "{{title}}"?', {
      ns: 'markets',
      title: campaign.title,
    }), [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Finalize', { ns: 'markets' }),
        onPress: () => execTransaction(translate('Finalize Campaign', { ns: 'markets' }), () =>
          finalizeCampaign(wallet.privateKey, wallet.publicKey, wallet.address, campaign.campaignId)
        ),
      },
    ])
  }

  const handleClaimRefund = () => {
    if (!wallet || !campaign) return
    Alert.alert(translate('Claim Refund', { ns: 'markets' }), translate('Claim your refund from "{{title}}"?', {
      ns: 'markets',
      title: campaign.title,
    }), [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Claim', { ns: 'markets' }),
        onPress: () => execTransaction(translate('Claim Refund', { ns: 'markets' }), () =>
          claimCampaignRefund(wallet.privateKey, wallet.publicKey, wallet.address, campaign.campaignId)
        ),
      },
    ])
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-text-muted text-base mt-4">
          {translate('Loading campaign...', { ns: 'markets' })}
        </Text>
      </View>
    )
  }

  if (!campaign) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <XCircle size={48} color={colors.textMuted} />
        <Text className="text-text-muted text-base mt-3">
          {translate('Campaign not found', { ns: 'markets' })}
        </Text>
        <Pressable onPress={() => router.back()} className="mt-4 bg-primary px-6 py-3 rounded-xl" style={{ backgroundColor: colors.primary }}>
          <Text className="text-onPrimary font-semibold">{translate('Go Back')}</Text>
        </Pressable>
      </View>
    )
  }

  const statusColor = getCampaignStatusColor(campaign.status)
  const statusBg = getMarketStatusBackground(statusColor)
  const percent = calculatePercentFunded(campaign.raisedAmount, campaign.fundingGoal)
  const progressWidth = Math.min(percent, 100)
  const contributeAmountWei = parseEXOInput(contributeAmount)
  const isActive = campaign.status === CampaignStatus.Active
  const ended = hasCampaignEnded(campaign.endTime)
  const isFailed = campaign.status === CampaignStatus.Failed

  const userContribution = wallet ? contributors.find(
    c => c.contributor?.toLowerCase() === wallet.address?.toLowerCase()
  ) : null
  const canRefund = isFailed && userContribution && !userContribution.refunded

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
      <View className="flex-row items-center px-4 py-3">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="text-xl font-bold text-text ml-2 flex-1" numberOfLines={1} style={{ color: colors.text }}>
          {translate('Campaign', { ns: 'markets' })}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
          <View className="flex-row items-start justify-between mb-2">
            <Text className="text-text text-2xl font-bold flex-1 mr-3" style={{ color: colors.text }}>{campaign.title}</Text>
            <View className={`px-3 py-1.5 rounded-lg ${statusBg}`}>
              <Text className={`text-sm font-bold ${statusColor}`}>{getCampaignStatusName(campaign.status)}</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Hash size={12} color={colors.textMuted} />
            <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>{truncateMarketAddress(campaign.creator)}</Text>
          </View>
        </View>

        <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
          <View className="flex-row justify-between mb-2">
            <Text className="text-text-secondary text-sm font-medium" style={{ color: colors.textSecondary }}>
              {translate('Funding Progress', { ns: 'markets' })}
            </Text>
            <Text className="text-primary text-lg font-bold" style={{ color: colors.primary }}>{formatLocalizedPercent(percent)}</Text>
          </View>

          <View className="h-3 bg-background rounded-full overflow-hidden mb-3" style={{ backgroundColor: colors.backgroundTertiary }}>
            <View
              className="h-full rounded-full"
              style={{ width: `${progressWidth}%`, backgroundColor: percent >= 100 ? colors.success : colors.primary }}
            />
          </View>

          <View className="flex-row gap-2 mb-3">
            <View className="flex-1 bg-background rounded-xl p-3" style={{ backgroundColor: colors.backgroundSecondary }}>
              <Text className="text-text-muted text-xs mb-0.5" style={{ color: colors.textMuted }}>
                {translate('Raised', { ns: 'markets' })}
              </Text>
              <Text className="text-text text-base font-bold" style={{ color: colors.text }}>{formatMarketEXO(campaign.raisedAmount, 2)} EXO</Text>
            </View>
            <View className="flex-1 bg-background rounded-xl p-3" style={{ backgroundColor: colors.backgroundSecondary }}>
              <Text className="text-text-muted text-xs mb-0.5" style={{ color: colors.textMuted }}>
                {translate('Goal', { ns: 'markets' })}
              </Text>
              <Text className="text-text text-base font-bold" style={{ color: colors.text }}>{formatMarketEXO(campaign.fundingGoal, 2)} EXO</Text>
            </View>
          </View>

          {campaign.flexibleGoal && BigInt(campaign.flexibleGoal) > 0n && (
            <View className="flex-row items-center gap-1.5 mb-3 bg-background rounded-xl p-3" style={{ backgroundColor: colors.backgroundSecondary }}>
              <Target size={14} color={colors.info} />
              <Text className="text-text-secondary text-sm" style={{ color: colors.textSecondary }}>
                {translate('Flexible goal: {{amount}} EXO', {
                  ns: 'markets',
                  amount: formatMarketEXO(campaign.flexibleGoal, 2),
                })}
              </Text>
            </View>
          )}

          <View className="flex-row gap-2">
            <View className="flex-1 bg-background rounded-xl p-3 flex-row items-center gap-2" style={{ backgroundColor: colors.backgroundSecondary }}>
              <Users size={16} color={colors.textTertiary} />
              <View>
                <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>
                  {translate('Contributors', { ns: 'markets' })}
                </Text>
                <Text className="text-text text-base font-bold" style={{ color: colors.text }}>{campaign.contributorCount}</Text>
              </View>
            </View>
            <View className="flex-1 bg-background rounded-xl p-3 flex-row items-center gap-2" style={{ backgroundColor: colors.backgroundSecondary }}>
              <Clock size={16} color={colors.textTertiary} />
              <View>
                <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>
                  {translate('Remaining', { ns: 'markets' })}
                </Text>
                <Text className="text-text text-base font-bold" style={{ color: colors.text }}>{getTimeRemaining(campaign.endTime)}</Text>
              </View>
            </View>
          </View>
        </View>

        <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
          <Text className="text-text-secondary text-sm font-medium mb-3" style={{ color: colors.textSecondary }}>
            {translate('Timeline', { ns: 'markets' })}
          </Text>
          <View className="flex-row justify-between mb-2">
            <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
              {translate('Start', { ns: 'markets' })}
            </Text>
            <Text className="text-text text-sm" style={{ color: colors.text }}>{formatTimestamp(campaign.startTime)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
              {translate('End', { ns: 'markets' })}
            </Text>
            <Text className="text-text text-sm" style={{ color: colors.text }}>{formatTimestamp(campaign.endTime)}</Text>
          </View>
        </View>

        {isActive && !ended && wallet && (
          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-3" style={{ color: colors.textSecondary }}>
              {translate('Contribute', { ns: 'markets' })}
            </Text>

            {contributeCheck && !contributeCheck.canContribute && (
              <View className="bg-red-500/10 rounded-xl p-3 mb-3">
                <Text className="text-red-400 text-sm">{contributeCheck.reason}</Text>
              </View>
            )}

            {contributeCheck?.remainingAllowance && (
              <Text className="text-text-muted text-xs mb-2" style={{ color: colors.textMuted }}>
                {translate('Max remaining: {{amount}} EXO', {
                  ns: 'markets',
                  amount: formatMarketEXO(contributeCheck.remainingAllowance, 2),
                })}
              </Text>
            )}

            <View className="flex-row gap-2">
              <TextInput
                className="flex-1 bg-background rounded-xl p-3.5 text-text text-lg font-semibold"
                style={{ backgroundColor: colors.backgroundSecondary, color: colors.text }}
                placeholder="0.0"
                placeholderTextColor={colors.textMuted}
                value={contributeAmount}
                onChangeText={setContributeAmount}
                keyboardType="decimal-pad"
              />
              <Pressable
                onPress={handleContribute}
                disabled={isSubmitting || contributeAmountWei <= 0n}
                className="bg-primary px-5 rounded-xl items-center justify-center active:opacity-80"
                style={{ backgroundColor: colors.primary, opacity: isSubmitting || contributeAmountWei <= 0n ? 0.5 : 1 }}
              >
                {isSubmitting ? <ActivityIndicator color={colors.textOnPrimary} size="small" /> : (
                  <Text className="text-onPrimary font-bold text-sm">
                    {translate('Send', { ns: 'markets' })}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        <View className="gap-2 mb-4">
          {ended && finalizeCheck?.canFinalize && wallet && (
            <Pressable
              onPress={handleFinalize}
              disabled={isSubmitting}
              className="bg-primary py-3.5 rounded-xl items-center flex-row justify-center gap-2 active:opacity-80"
              style={{ backgroundColor: colors.primary, opacity: isSubmitting ? 0.5 : 1 }}
            >
              {isSubmitting ? <ActivityIndicator color={colors.textOnPrimary} /> : (
                <>
                  <CheckCircle2 size={18} color={colors.textOnPrimary} />
                  <Text className="text-onPrimary font-semibold text-base">
                    {translate('Finalize Campaign', { ns: 'markets' })}
                  </Text>
                </>
              )}
            </Pressable>
          )}

          {canRefund && wallet && (
            <Pressable
              onPress={handleClaimRefund}
              disabled={isSubmitting}
              className="py-3.5 rounded-xl items-center flex-row justify-center gap-2 active:opacity-80"
              style={{ backgroundColor: colors.warning, opacity: isSubmitting ? 0.5 : 1 }}
            >
              {isSubmitting ? <ActivityIndicator color="white" /> : (
                <>
                  <ArrowDownCircle size={18} color="white" />
                  <Text className="text-white font-semibold text-base">
                    {translate('Claim Refund', { ns: 'markets' })}
                  </Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        {contributors.length > 0 && (
          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-3" style={{ color: colors.textSecondary }}>
              {translate('Top Contributors ({{count}})', {
                ns: 'markets',
                count: contributors.length,
              })}
            </Text>
            {contributors.slice(0, 20).map((c, i) => (
              <View
                key={`${c.contributor}-${i}`}
                className={`flex-row items-center justify-between py-2.5 ${i > 0 ? 'border-t border-border' : ''}`}
                style={i > 0 ? { borderColor: colors.border } : undefined}
              >
                <View className="flex-row items-center gap-2">
                  <View
                    className="w-6 h-6 rounded-full items-center justify-center"
                    style={{ backgroundColor: i < 3 ? colors.primary + '33' : colors.backgroundTertiary }}
                  >
                    <Text className="text-xs font-bold" style={{ color: i < 3 ? colors.primary : colors.textMuted }}>{i + 1}</Text>
                  </View>
                  <Text className="text-text text-sm" style={{ color: colors.text }}>{truncateMarketAddress(c.contributor)}</Text>
                </View>
                <Text className="text-text font-medium text-sm" style={{ color: colors.text }}>{formatMarketEXO(c.amount, 2)} EXO</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}
