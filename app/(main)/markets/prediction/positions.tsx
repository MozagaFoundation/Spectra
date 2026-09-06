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
  Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  ChevronLeft,
  Briefcase,
  TrendingUp,
  Trophy,
  Gift,
  BarChart3,
} from 'lucide-react-native'
import { useWalletStore, toast } from '@/store'
import { waitForTransaction } from '@/services/crypto'
import {
  listPredictionMarkets,
  getAllPositions,
  redeemWinnings,
  getMarketStatusName,
  PredictionMarketStatus,
} from '@/services/crypto/predictionService'
import type {
  PredictionMarketInfo,
  PositionInfo,
} from '@/services/crypto/predictionService'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { useThemeColors } from '@/lib/theme'
import { formatBigIntAmount } from '@/lib/amounts'
import { translate } from '@/lib/i18n'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { formatMarketEXO, marketStaticRoute, predictionMarketRoute } from '@/lib/markets'

interface MarketPositionGroup {
  market: PredictionMarketInfo
  positions: PositionInfo[]
}

export default function PositionsScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const { wallet } = useWalletStore()
  const colors = useThemeColors()

  const [groups, setGroups] = useState<MarketPositionGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [redeemingKey, setRedeemingKey] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!wallet?.address) {
      setIsLoading(false)
      return
    }
    try {
      setError(null)
      const activeMarkets = await listPredictionMarkets(undefined, undefined, 0, 100)
      const result: MarketPositionGroup[] = []

      await Promise.all(
        activeMarkets.map(async (market) => {
          const positions = await getAllPositions(market.marketId, wallet.address)
          if (positions.length > 0) {
            result.push({ market, positions })
          }
        }),
      )

      result.sort((a, b) => b.market.closingTime - a.market.closingTime)
      setGroups(result)
    } catch (error) {
      setError(getErrorDisplayMessage(error) || translate('Failed to load positions'))
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [wallet?.address])

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

  const handleRedeem = (marketId: string, outcomeIndex: number) => {
    if (!wallet) return
    Alert.alert(translate('Redeem Winnings'), translate('Claim your winnings for this position?'), [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Redeem'),
        onPress: async () => {
          const key = `${marketId}-${outcomeIndex}`
          try {
            setRedeemingKey(key)
            toast.info(translate('Processing'), translate('Signing redemption...'))
            const result = await redeemWinnings(
              wallet.privateKey, wallet.publicKey, wallet.address,
              marketId, outcomeIndex,
            )
            const status = await waitForTransaction(result.txHash, 15, 2000)
            if (status.status === 'confirmed') {
              toast.success(translate('Redeemed'), translate('Winnings claimed successfully'))
            } else {
              toast.success(translate('Submitted'), translate('Redemption submitted'))
            }
            await fetchData()
          } catch (error) {
            toast.error(
              translate('Error'),
              getErrorDisplayMessage(error) || translate('Failed to redeem'),
            )
          } finally {
            setRedeemingKey(null)
          }
        },
      },
    ])
  }

  const totalPositions = groups.reduce((sum, g) => sum + g.positions.length, 0)

  const portfolioValueWei = groups.reduce<bigint>((sum, group) => (
    sum + group.positions.reduce<bigint>((groupSum, position) => (
      groupSum + BigInt(position.currentValue)
    ), 0n)
  ), 0n)

  const totalPnlWei = groups.reduce<bigint>((sum, group) => (
    sum + group.positions.reduce<bigint>((groupSum, position) => (
      groupSum + BigInt(position.pnl)
    ), 0n)
  ), 0n)

  const wins = groups.reduce((sum, g) => {
    if (g.market.status !== PredictionMarketStatus.Resolved) return sum
    return g.positions.reduce((s, p) => {
      if (g.market.resolvedOutcome === p.outcomeIndex && BigInt(p.shares) > 0n) return s + 1
      return s
    }, sum)
  }, 0)

  if (!wallet) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <Briefcase size={40} color={colors.textMuted} />
        <Text className="text-text-muted text-base mt-3">{translate('Connect wallet to view positions')}</Text>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
      <View className="flex-row items-center px-4 py-3">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="text-xl font-bold text-text ml-2">{translate('My Positions')}</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {!isLoading && groups.length > 0 && (
          <View className="flex-row gap-2 mb-4">
            <View className="flex-1 bg-surface rounded-xl p-3 items-center">
              <Briefcase size={14} color="#a7da57" />
              <Text className="text-text text-base font-bold mt-1">{totalPositions}</Text>
              <Text className="text-text-muted text-[10px]">{translate('Positions')}</Text>
            </View>
            <View className="flex-1 bg-surface rounded-xl p-3 items-center">
              <TrendingUp size={14} color="#a7da57" />
              <Text className="text-text text-base font-bold mt-1">{formatBigIntAmount(portfolioValueWei, 18, 2)}</Text>
              <Text className="text-text-muted text-[10px]">{translate('Value (EXO)')}</Text>
            </View>
            <View className="flex-1 bg-surface rounded-xl p-3 items-center">
              <BarChart3 size={14} color={totalPnlWei >= 0n ? '#10b981' : '#ef4444'} />
              <Text className={`text-base font-bold mt-1 ${totalPnlWei >= 0n ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totalPnlWei >= 0n ? '+' : ''}{formatBigIntAmount(totalPnlWei, 18, 2)}
              </Text>
              <Text className="text-text-muted text-[10px]">{translate('P&L (EXO)')}</Text>
            </View>
            <View className="flex-1 bg-surface rounded-xl p-3 items-center">
              <Trophy size={14} color="#f59e0b" />
              <Text className="text-text text-base font-bold mt-1">{wins}</Text>
              <Text className="text-text-muted text-[10px]">{translate('Wins')}</Text>
            </View>
          </View>
        )}

        {isLoading ? (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-text-muted text-base mt-4">{translate('Loading positions...')}</Text>
          </View>
        ) : error ? (
          <View className="bg-surface rounded-2xl p-8 items-center">
            <Text className="text-rose-400 text-base font-semibold mb-2">{translate('Failed to Load')}</Text>
            <Text className="text-text-muted text-sm text-center mb-4">{error}</Text>
            <Pressable onPress={handleRefresh} className="px-6 py-2.5 rounded-xl bg-primary active:bg-primary-dark">
              <Text className="text-onPrimary font-semibold text-sm">{translate('Retry')}</Text>
            </Pressable>
          </View>
        ) : groups.length === 0 ? (
          <View className="bg-surface rounded-2xl p-8 items-center">
            <Briefcase size={40} color={colors.textMuted} />
            <Text className="text-text-muted text-base mt-3">{translate('No positions yet')}</Text>
            <Text className="text-text-muted text-sm mt-1">{translate('Trade on prediction markets to open positions')}</Text>
            <Pressable
              onPress={() => router.push(marketStaticRoute('/(main)/markets/prediction'))}
              className="mt-4 px-6 py-2.5 rounded-xl bg-primary active:bg-primary-dark"
            >
              <Text className="text-onPrimary font-semibold text-sm">{translate('Browse Markets')}</Text>
            </Pressable>
          </View>
        ) : (
          groups.map((group) => {
            const isResolved = group.market.status === PredictionMarketStatus.Resolved
            return (
              <Pressable
                key={group.market.marketId}
                onPress={() => router.push(predictionMarketRoute(group.market.marketId))}
                className="bg-surface rounded-2xl p-4 mb-3 active:opacity-80"
              >
                <View className="flex-row items-start justify-between mb-2">
                  <Text className="text-text text-sm font-bold flex-1 mr-3" numberOfLines={2}>
                    {group.market.question}
                  </Text>
                  <View className={`px-2 py-0.5 rounded-md ${
                    isResolved ? 'bg-blue-500/15' : 'bg-emerald-500/15'
                  }`}>
                    <Text className={`text-[10px] font-semibold ${
                      isResolved ? 'text-blue-400' : 'text-emerald-400'
                    }`}>
                      {getMarketStatusName(group.market.status)}
                    </Text>
                  </View>
                </View>

                {group.positions.map((pos, i) => {
                  const shares = formatMarketEXO(pos.shares, 4)
                  const cost = formatMarketEXO(pos.costBasis, 4)
                  const value = formatMarketEXO(pos.currentValue, 4)
                  const pnlWei = BigInt(pos.pnl)
                  const pnlColor = pnlWei >= 0n ? 'text-emerald-400' : 'text-rose-400'
                  const pnlPrefix = pnlWei >= 0n ? '+' : ''
                  const canRedeem = isResolved &&
                    group.market.resolvedOutcome === pos.outcomeIndex &&
                    BigInt(pos.shares) > 0n
                  const rKey = `${group.market.marketId}-${pos.outcomeIndex}`
                  const isThisRedeeming = redeemingKey === rKey

                  return (
                    <View key={i} className="bg-background/50 rounded-xl p-3 mb-2">
                      <View className="flex-row items-center justify-between mb-1.5">
                        <Text className="text-text text-xs font-semibold">
                          {group.market.outcomeLabels[pos.outcomeIndex] || translate('Outcome #{{index}}', { index: pos.outcomeIndex })}
                        </Text>
                        <Text className={`text-xs font-bold ${pnlColor}`}>
                          {pnlPrefix}{formatBigIntAmount(pos.pnl, 18, 4)} EXO
                        </Text>
                      </View>
                      <View className="flex-row gap-4">
                        <View>
                          <Text className="text-text-muted text-[10px]">{translate('Shares')}</Text>
                          <Text className="text-text text-xs font-medium">{shares}</Text>
                        </View>
                        <View>
                          <Text className="text-text-muted text-[10px]">{translate('Cost')}</Text>
                          <Text className="text-text text-xs font-medium">{cost}</Text>
                        </View>
                        <View>
                          <Text className="text-text-muted text-[10px]">{translate('Value')}</Text>
                          <Text className="text-text text-xs font-medium">{value}</Text>
                        </View>
                      </View>
                      {canRedeem && (
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation()
                            handleRedeem(group.market.marketId, pos.outcomeIndex)
                          }}
                          disabled={isThisRedeeming}
                          className="flex-row items-center justify-center gap-1.5 bg-emerald-500 py-2 rounded-lg mt-2 active:opacity-80"
                        >
                          {isThisRedeeming ? (
                            <ActivityIndicator size="small" color="white" />
                          ) : (
                            <Gift size={14} color="white" />
                          )}
                          <Text className="text-white text-xs font-semibold">
                            {isThisRedeeming ? translate('Redeeming...') : translate('Redeem Winnings')}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )
                })}
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}
