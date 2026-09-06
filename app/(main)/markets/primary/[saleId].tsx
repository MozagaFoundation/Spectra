/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
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
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ArrowLeft,
  Clock,
  Users,
  Coins,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Rocket,
  Shield,
} from 'lucide-react-native'
import { useThemeColors } from '@/lib/theme'
import { formatLocalizedPercent } from '@/lib/amounts'
import { useWalletStore, toast } from '@/store'
import {
  getPrimarySale,
  getEffectiveSaleStatus,
  getParticipation,
  participateInSale,
  claimSaleTokens,
  claimSaleRefund,
  claimSaleProceeds,
  getDistributionModeName,
  getSaleStatusName,
  SaleStatus,
  formatWeiToEXO,
  parseEXOToWei,
} from '@/services/crypto/marketService'
import { getBalance, waitForTransaction } from '@/services/crypto'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { getCurrentLocaleTag, translate } from '@/lib/i18n'
import { isValidMarketEntityId, truncateMarketAddress } from '@/lib/markets'
import type {
  PrimarySaleInfo,
  EffectiveSaleStatus,
  ParticipationInfo,
} from '@/services/crypto/marketService'

function formatCountdown(endTime: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = endTime - now
  if (diff <= 0) return translate('Ended', { ns: 'markets' })
  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  const mins = Math.floor((diff % 3600) / 60)
  if (days > 0) {
    return [
      translate('duration.days', { count: days }),
      translate('duration.hours', { count: hours }),
      translate('duration.minutes', { count: mins }),
    ].join(' ')
  }
  if (hours > 0) {
    return [
      translate('duration.hours', { count: hours }),
      translate('duration.minutes', { count: mins }),
    ].join(' ')
  }
  return translate('duration.minutes', { count: mins })
}

function StatusBadge({ status }: { status: number }) {
  const label = getSaleStatusName(status)
  let bgClass = 'bg-blue-500/15'
  let textClass = 'text-blue-400'
  let Icon = Rocket

  if (status === SaleStatus.Succeeded) {
    bgClass = 'bg-emerald-500/15'
    textClass = 'text-emerald-400'
    Icon = CheckCircle
  } else if (status === SaleStatus.Failed) {
    bgClass = 'bg-rose-500/15'
    textClass = 'text-rose-400'
    Icon = XCircle
  }

  const iconColor = status === SaleStatus.Succeeded
    ? '#10b981'
    : status === SaleStatus.Failed
    ? '#f43f5e'
    : '#3b82f6'

  return (
    <View className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg ${bgClass}`}>
      <Icon size={14} color={iconColor} />
      <Text className={`text-xs font-semibold ${textClass}`}>{label}</Text>
    </View>
  )
}

function ProgressBar({ raised, max, colors }: { raised: string; max: string; colors: ReturnType<typeof useThemeColors> }) {
  const raisedBig = BigInt(raised || '0')
  const maxBig = BigInt(max || '1')
  const pct = maxBig > 0n ? Number((raisedBig * 10000n) / maxBig) / 100 : 0
  const clampedPct = Math.min(pct, 100)

  return (
    <View>
      <View className="flex-row justify-between mb-1.5">
        <Text className="text-text-muted text-xs">{translate('Raised', { ns: 'markets' })}</Text>
        <Text className="text-text text-xs font-medium">
          {formatWeiToEXO(raised, 4)} / {formatWeiToEXO(max, 4)} EXO
        </Text>
      </View>
      <View className="h-3 bg-background/50 rounded-full overflow-hidden">
        <View
          className="h-full rounded-full"
          style={{
            width: `${clampedPct}%`,
            backgroundColor: clampedPct >= 100 ? '#10b981' : colors.primary,
          }}
        />
      </View>
      <Text className="text-text-muted text-[10px] mt-1 text-right">{formatLocalizedPercent(pct)}</Text>
    </View>
  )
}

export default function SaleDetailScreen() {
  const router = useRouter()
  const { saleId } = useLocalSearchParams<{ saleId: string }>()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const { wallet } = useWalletStore()

  const [sale, setSale] = useState<PrimarySaleInfo | null>(null)
  const [effectiveStatus, setEffectiveStatus] = useState<EffectiveSaleStatus | null>(null)
  const [participation, setParticipation] = useState<ParticipationInfo | null>(null)
  const [balance, setBalance] = useState('0')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [amount, setAmount] = useState('')
  const [showParticipate, setShowParticipate] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [countdown, setCountdown] = useState('')

  const fetchData = useCallback(async () => {
    if (!saleId) return
    setError(null)
    if (!isValidMarketEntityId(saleId)) {
      setError(translate('Invalid sale ID', { ns: 'markets' }))
      setSale(null)
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }
    try {
      const [saleInfo, statusInfo] = await Promise.all([
        getPrimarySale(saleId),
        getEffectiveSaleStatus(saleId),
      ])

      if (!saleInfo) {
        setError(translate('Sale not found', { ns: 'markets' }))
        setSale(null)
        return
      }

      setSale(saleInfo)
      setEffectiveStatus(statusInfo)

      if (wallet?.address) {
        const [part, bal] = await Promise.all([
          getParticipation(saleId, wallet.address),
          getBalance(wallet.address),
        ])
        setParticipation(part)
        setBalance(bal)
      }
    } catch (error) {
      console.error('Error fetching sale data:', error)
      setError(getErrorDisplayMessage(error) || translate('Failed to load sale', { ns: 'markets' }))
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [saleId, wallet?.address])

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true)
      fetchData()
    }, [fetchData])
  )

  useEffect(() => {
    if (!sale?.endTime) return
    const tick = () => setCountdown(formatCountdown(sale.endTime))
    tick()
    countdownRef.current = setInterval(tick, 30000)
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  }, [sale?.endTime])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await fetchData()
  }

  const displayStatus = effectiveStatus?.effectiveStatus ?? sale?.status ?? 0
  const isActive = displayStatus === SaleStatus.Active
  const isSucceeded = displayStatus === SaleStatus.Succeeded
  const isFailed = displayStatus === SaleStatus.Failed
  const isCreator = wallet?.address && sale?.creator &&
    wallet.address.toLowerCase() === sale.creator.toLowerCase()
  const hasClaimed = participation?.claimed === true

  const handleParticipate = () => {
    if (!wallet || !sale) return
    if (!saleId || !isValidMarketEntityId(saleId)) {
      toast.error(translate('Invalid sale ID', { ns: 'markets' }))
      return
    }
    const amtWei = parseEXOToWei(amount)
    if (amtWei <= 0n) {
      toast.error(translate('Invalid amount', { ns: 'markets' }))
      return
    }
    const maxPerParticipant = BigInt(sale.maxPerParticipant || '0')
    if (maxPerParticipant > 0n && amtWei > maxPerParticipant) {
      toast.error(
        translate('Exceeds max per participant', { ns: 'markets' }),
        translate('Max: {{amount}} EXO', {
          ns: 'markets',
          amount: formatWeiToEXO(sale.maxPerParticipant, 4),
        }),
      )
      return
    }

    Alert.alert(
      translate('Confirm Participation', { ns: 'markets' }),
      translate('Contribute {{amount}} EXO to this sale?', { ns: 'markets', amount }),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Confirm', { ns: 'markets' }),
          onPress: async () => {
            try {
              setIsProcessing(true)
              toast.info(
                translate('Processing', { ns: 'markets' }),
                translate('Signing transaction...', { ns: 'markets' }),
              )
              const result = await participateInSale(
                wallet.privateKey,
                wallet.publicKey,
                wallet.address,
                saleId!,
                amtWei,
              )
              toast.info(
                translate('Processing', { ns: 'markets' }),
                translate('Waiting for confirmation...', { ns: 'markets' }),
              )
              const txStatus = await waitForTransaction(result.txHash, 15, 2000)
              if (txStatus.status === 'confirmed') {
                toast.success(
                  translate('Success', { ns: 'markets' }),
                  translate('Contributed {{amount}} EXO', { ns: 'markets', amount }),
                )
              } else if (txStatus.status === 'failed') {
                toast.error(
                  translate('Failed', { ns: 'markets' }),
                  translate('Transaction failed', { ns: 'markets' }),
                )
              } else {
                toast.success(
                  translate('Submitted', { ns: 'markets' }),
                  translate('Transaction pending...', { ns: 'markets' }),
                )
              }
              setAmount('')
              setShowParticipate(false)
              await fetchData()
            } catch (error) {
              console.error('Participate error:', error)
              toast.error(
                translate('Error'),
                getErrorDisplayMessage(error) || translate('Failed to participate', { ns: 'markets' }),
              )
            } finally {
              setIsProcessing(false)
            }
          },
        },
      ],
    )
  }

  const handleClaim = (action: 'tokens' | 'refund' | 'proceeds') => {
    if (!wallet || !saleId) return
    if (!isValidMarketEntityId(saleId)) {
      toast.error(translate('Invalid sale ID', { ns: 'markets' }))
      return
    }

    const labels = {
      tokens: {
        title: translate('Claim Tokens', { ns: 'markets' }),
        desc: translate('Claim your allocated tokens from this sale?', { ns: 'markets' }),
      },
      refund: {
        title: translate('Claim Refund', { ns: 'markets' }),
        desc: translate('Claim your refund from this failed sale?', { ns: 'markets' }),
      },
      proceeds: {
        title: translate('Claim Proceeds', { ns: 'markets' }),
        desc: translate('Claim sale proceeds as the creator?', { ns: 'markets' }),
      },
    }

    const fns = {
      tokens: claimSaleTokens,
      refund: claimSaleRefund,
      proceeds: claimSaleProceeds,
    }

    Alert.alert(labels[action].title, labels[action].desc, [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Confirm', { ns: 'markets' }),
        onPress: async () => {
          try {
            setIsProcessing(true)
            toast.info(
              translate('Processing', { ns: 'markets' }),
              translate('Signing transaction...', { ns: 'markets' }),
            )
            const result = await fns[action](
              wallet.privateKey,
              wallet.publicKey,
              wallet.address,
              saleId,
            )
            toast.info(
              translate('Processing', { ns: 'markets' }),
              translate('Waiting for confirmation...', { ns: 'markets' }),
            )
            const txStatus = await waitForTransaction(result.txHash, 15, 2000)
            if (txStatus.status === 'confirmed') {
              toast.success(
                translate('Success', { ns: 'markets' }),
                translate('{{title}} completed', { ns: 'markets', title: labels[action].title }),
              )
            } else if (txStatus.status === 'failed') {
              toast.error(
                translate('Failed', { ns: 'markets' }),
                translate('Transaction failed', { ns: 'markets' }),
              )
            } else {
              toast.success(
                translate('Submitted', { ns: 'markets' }),
                translate('Transaction pending...', { ns: 'markets' }),
              )
            }
            await fetchData()
          } catch (error) {
            console.error(`${action} error:`, error)
            const fallbackMessage = action === 'tokens'
              ? translate('Failed to claim tokens', { ns: 'markets' })
              : action === 'refund'
                ? translate('Failed to claim refund', { ns: 'markets' })
                : translate('Failed to claim proceeds', { ns: 'markets' })
            toast.error(translate('Error'), getErrorDisplayMessage(error) || fallbackMessage)
          } finally {
            setIsProcessing(false)
          }
        },
      },
    ])
  }

  if (isLoading) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center"
        style={{ paddingTop: insets.top, backgroundColor: colors.background }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-text-muted text-base mt-4">
          {translate('Loading sale...', { ns: 'markets' })}
        </Text>
      </View>
    )
  }

  if (error || !sale) {
    return (
      <View
        className="flex-1 bg-background"
        style={{ paddingTop: insets.top, backgroundColor: colors.background }}
      >
        <View className="flex-row items-center px-4 py-3">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ArrowLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="text-xl font-bold text-text ml-2">
            {translate('Sale Detail', { ns: 'markets' })}
          </Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <AlertTriangle size={48} color={colors.error} />
          <Text className="text-text text-lg font-semibold mt-4">
            {error || translate('Sale not found', { ns: 'markets' })}
          </Text>
          <Text className="text-text-muted text-sm mt-2 text-center">
            {translate('The sale ID may be incorrect or the sale may not exist yet.', { ns: 'markets' })}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-6 bg-primary px-6 py-3 rounded-xl active:bg-primary-dark"
          >
            <Text className="text-onPrimary font-semibold">{translate('Go Back')}</Text>
          </Pressable>
        </View>
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
            {translate('Sale Detail', { ns: 'markets' })}
          </Text>
        </View>
        <StatusBadge status={displayStatus} />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
        }
      >
        <View className="bg-surface rounded-2xl p-4 mb-4">
          <ProgressBar raised={sale.raisedAmount} max={sale.maxFunding} colors={colors} />
        </View>

        <View className="flex-row gap-3 mb-4">
          <View className="flex-1 bg-surface rounded-2xl p-4 items-center">
            <Clock size={20} color={colors.textTertiary} />
            <Text className="text-text font-bold text-base mt-2">{countdown || '—'}</Text>
            <Text className="text-text-muted text-[10px] mt-0.5">
              {translate('Time Left', { ns: 'markets' })}
            </Text>
          </View>
          <View className="flex-1 bg-surface rounded-2xl p-4 items-center">
            <Users size={20} color={colors.textTertiary} />
            <Text className="text-text font-bold text-base mt-2">{sale.participantCount}</Text>
            <Text className="text-text-muted text-[10px] mt-0.5">
              {translate('Participants', { ns: 'markets' })}
            </Text>
          </View>
          <View className="flex-1 bg-surface rounded-2xl p-4 items-center">
            <Coins size={20} color={colors.textTertiary} />
            <Text className="text-text font-bold text-base mt-2" numberOfLines={1}>
              {formatWeiToEXO(sale.pricePerToken, 2)}
            </Text>
            <Text className="text-text-muted text-[10px] mt-0.5">
              {translate('Price/Token', { ns: 'markets' })}
            </Text>
          </View>
        </View>

        <View className="bg-surface rounded-2xl p-4 mb-4">
          <Text className="text-text font-semibold text-base mb-3">
            {translate('Details', { ns: 'markets' })}
          </Text>

          <View className="gap-3">
            <DetailRow
              label={translate('Token Amount', { ns: 'markets' })}
              value={translate('{{amount}} tokens', {
                ns: 'markets',
                amount: formatWeiToEXO(sale.tokenAmount, 4),
              })}
            />
            <DetailRow
              label={translate('Min Funding', { ns: 'markets' })}
              value={`${formatWeiToEXO(sale.minFunding, 4)} EXO`}
            />
            <DetailRow
              label={translate('Max Funding', { ns: 'markets' })}
              value={`${formatWeiToEXO(sale.maxFunding, 4)} EXO`}
            />
            {BigInt(sale.maxPerParticipant || '0') > 0n && (
              <DetailRow
                label={translate('Max per Participant', { ns: 'markets' })}
                value={`${formatWeiToEXO(sale.maxPerParticipant, 4)} EXO`}
              />
            )}
            <DetailRow
              label={translate('Distribution', { ns: 'markets' })}
              value={getDistributionModeName(sale.distributionMode)}
            />
            <DetailRow
              label={translate('Start', { ns: 'markets' })}
              value={new Date(sale.startTime * 1000).toLocaleString(getCurrentLocaleTag())}
            />
            <DetailRow
              label={translate('End', { ns: 'markets' })}
              value={new Date(sale.endTime * 1000).toLocaleString(getCurrentLocaleTag())}
            />
            <DetailRow label={translate('Creator', { ns: 'markets' })} value={truncateMarketAddress(sale.creator, 8, 6)} />
            <DetailRow label={translate('Market ID', { ns: 'markets' })} value={truncateMarketAddress(sale.marketId, 8, 6)} />
            <DetailRow label={translate('Asset ID', { ns: 'markets' })} value={truncateMarketAddress(sale.assetId, 8, 6)} />
          </View>
        </View>

        {participation && (
          <View className="bg-surface rounded-2xl p-4 mb-4">
            <View className="flex-row items-center gap-2 mb-3">
              <Shield size={18} color={colors.primary} />
              <Text className="text-text font-semibold text-base">
                {translate('Your Participation', { ns: 'markets' })}
              </Text>
            </View>
            <View className="gap-3">
              <DetailRow
                label={translate('Contribution', { ns: 'markets' })}
                value={`${formatWeiToEXO(participation.contribution, 4)} EXO`}
              />
              <DetailRow
                label={translate('Allocation', { ns: 'markets' })}
                value={translate('{{amount}} tokens', {
                  ns: 'markets',
                  amount: formatWeiToEXO(participation.allocation, 4),
                })}
              />
              <DetailRow
                label={translate('Status', { ns: 'markets' })}
                value={participation.claimed
                  ? translate('Claimed', { ns: 'markets' })
                  : translate('Pending', { ns: 'markets' })}
                valueColor={participation.claimed ? colors.success : colors.warning}
              />
            </View>
          </View>
        )}

        {wallet && (
          <View className="bg-surface rounded-2xl p-4 mb-4">
            {isActive && (
              <>
                {showParticipate ? (
                  <View>
                    <View className="flex-row items-center justify-between mb-3">
                      <Text className="text-text font-semibold text-base">
                        {translate('Participate', { ns: 'markets' })}
                      </Text>
                      <Pressable onPress={() => setShowParticipate(false)}>
                        <Text className="text-text-muted text-sm">{translate('Cancel')}</Text>
                      </Pressable>
                    </View>

                    <View className="bg-background/50 rounded-xl p-3 mb-3">
                      <Text className="text-text-muted text-xs mb-1">
                        {translate('Balance:')}
                        {' '}
                        <Text className="text-text font-medium">{balance} EXO</Text>
                      </Text>
                      <View className="flex-row items-center">
                        <TextInput
                          className="flex-1 text-text text-xl font-semibold"
                          placeholder="0.0"
                          placeholderTextColor={colors.textMuted}
                          value={amount}
                          onChangeText={setAmount}
                          keyboardType="decimal-pad"
                        />
                        <View className="px-3 py-1.5 rounded-lg" style={{ backgroundColor: colors.primary + '26' }}>
                          <Text className="text-primary font-semibold text-sm">EXO</Text>
                        </View>
                      </View>
                    </View>

                    <Pressable
                      onPress={handleParticipate}
                      disabled={isProcessing || parseEXOToWei(amount) <= 0n}
                      className="flex-row items-center justify-center gap-2 bg-primary py-3.5 rounded-xl active:bg-primary-dark disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <ActivityIndicator size="small" color={colors.textOnPrimary} />
                      ) : (
                        <Rocket size={18} color={colors.textOnPrimary} />
                      )}
                      <Text className="text-onPrimary font-semibold text-base">
                        {isProcessing
                          ? translate('Processing...', { ns: 'markets' })
                          : translate('Confirm Participation', { ns: 'markets' })}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setShowParticipate(true)}
                    className="flex-row items-center justify-center gap-2 bg-primary py-3.5 rounded-xl active:bg-primary-dark"
                  >
                    <Rocket size={18} color={colors.textOnPrimary} />
                    <Text className="text-onPrimary font-semibold text-base">
                      {translate('Participate', { ns: 'markets' })}
                    </Text>
                  </Pressable>
                )}
              </>
            )}

            {isSucceeded && participation && !hasClaimed && (
              <Pressable
                onPress={() => handleClaim('tokens')}
                disabled={isProcessing}
                className="flex-row items-center justify-center gap-2 bg-emerald-600 py-3.5 rounded-xl active:opacity-80 disabled:opacity-50"
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <CheckCircle size={18} color="white" />
                )}
                <Text className="text-white font-semibold text-base">
                  {isProcessing
                    ? translate('Processing...', { ns: 'markets' })
                    : translate('Claim Tokens', { ns: 'markets' })}
                </Text>
              </Pressable>
            )}

            {isFailed && participation && !hasClaimed && (
              <Pressable
                onPress={() => handleClaim('refund')}
                disabled={isProcessing}
                className="flex-row items-center justify-center gap-2 py-3.5 rounded-xl active:opacity-80 disabled:opacity-50"
                style={{ backgroundColor: colors.warning }}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <AlertTriangle size={18} color="white" />
                )}
                <Text className="text-white font-semibold text-base">
                  {isProcessing
                    ? translate('Processing...', { ns: 'markets' })
                    : translate('Claim Refund', { ns: 'markets' })}
                </Text>
              </Pressable>
            )}

            {isSucceeded && isCreator && (
              <Pressable
                onPress={() => handleClaim('proceeds')}
                disabled={isProcessing}
                className="flex-row items-center justify-center gap-2 bg-primary py-3.5 rounded-xl active:bg-primary-dark disabled:opacity-50 mt-3"
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color={colors.textOnPrimary} />
                ) : (
                  <Coins size={18} color={colors.textOnPrimary} />
                )}
                <Text className="text-onPrimary font-semibold text-base">
                  {isProcessing
                    ? translate('Processing...', { ns: 'markets' })
                    : translate('Claim Proceeds', { ns: 'markets' })}
                </Text>
              </Pressable>
            )}

            {hasClaimed && !isActive && (
              <View className="bg-emerald-500/10 rounded-xl p-4 items-center">
                <CheckCircle size={24} color="#10b981" />
                <Text className="text-emerald-400 font-semibold text-sm mt-2">
                  {translate('Already Claimed', { ns: 'markets' })}
                </Text>
              </View>
            )}

            {!isActive && !participation && !isCreator && (
              <View className="bg-background/50 rounded-xl p-4 items-center">
                <Text className="text-text-muted text-sm">
                  {isSucceeded
                    ? translate('This sale has ended successfully.', { ns: 'markets' })
                    : translate('This sale has ended.', { ns: 'markets' })}
                </Text>
              </View>
            )}
          </View>
        )}

        {!wallet && (
          <View className="bg-surface rounded-2xl p-6 items-center">
            <Text className="text-text-muted text-sm text-center">
              {translate('Connect a wallet to participate in this sale.', { ns: 'markets' })}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function DetailRow({
  label,
  value,
  valueColor,
}: {
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-text-muted text-sm">{label}</Text>
      <Text className="text-text text-sm font-medium" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </Text>
    </View>
  )
}
