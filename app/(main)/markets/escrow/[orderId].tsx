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
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Star,
} from 'lucide-react-native'
import { useWalletStore, toast } from '@/store'
import { useThemeColors } from '@/lib/theme'
import { getCurrentLocaleTag, translate } from '@/lib/i18n'
import {
  formatMarketEXO,
  getMarketStatusBackground,
  isValidMarketEntityId,
  truncateMarketAddress,
} from '@/lib/markets'
import { waitForTransaction } from '@/services/crypto'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import {
  getEscrowOrder,
  getReputation,
  acceptEscrowOrder,
  confirmPayment,
  buyerConfirm,
  cancelEscrowOrder,
  raiseDispute,
  formatOrderStatus,
  getStatusColor,
  formatTimeRemaining,
  calculateOrderFee,
  type EscrowOrder,
  type ReputationInfo,
} from '@/services/crypto/escrowService'

function formatTimestamp(ts: number): string {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString(getCurrentLocaleTag())
}

const STEPS = ['Open', 'Accepted', 'Seller Confirmed', 'Completed']
const STEP_MAP: Record<string, number> = {
  Open: 0,
  Accepted: 1,
  SellerConfirmed: 2,
  Completed: 3,
  Cancelled: -1,
  Disputed: -2,
  Expired: -3,
}

export default function EscrowOrderDetail() {
  const router = useRouter()
  const { orderId } = useLocalSearchParams<{ orderId: string }>()
  const insets = useSafeAreaInsets()
  const { wallet } = useWalletStore()
  const colors = useThemeColors()

  const [order, setOrder] = useState<EscrowOrder | null>(null)
  const [sellerRep, setSellerRep] = useState<ReputationInfo | null>(null)
  const [buyerRep, setBuyerRep] = useState<ReputationInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDisputeInput, setShowDisputeInput] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')

  const fetchData = useCallback(async () => {
    if (!orderId) return
    if (!isValidMarketEntityId(orderId)) {
      setOrder(null)
      setIsLoading(false)
      setIsRefreshing(false)
      return
    }
    try {
      const o = await getEscrowOrder(orderId)
      setOrder(o)
      if (o) {
        const [sRep, bRep] = await Promise.all([
          o.seller ? getReputation(o.seller) : null,
          o.buyer ? getReputation(o.buyer) : null,
        ])
        setSellerRep(sRep)
        setBuyerRep(bRep)
      }
    } catch (error) {
      console.error('Error fetching order:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [orderId])

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

  const execTransaction = async (
    label: string,
    fn: () => Promise<{ txHash: string }>,
  ) => {
    if (!wallet) return
    if (!orderId || !isValidMarketEntityId(orderId)) {
      toast.error(translate('Invalid order ID', { ns: 'markets' }))
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

  const handleAccept = () => {
    if (!wallet || !order) return
    const orderAmount = BigInt(order.amount)
    const isBuy = order.side === 'Buy'
    const depositAmount = isBuy ? orderAmount + calculateOrderFee(orderAmount) : 0n
    const confirmMsg = isBuy
      ? translate('Accept this buy order and deposit {{amount}} EXO (amount + 0.1% fee)?', {
          ns: 'markets',
          amount: formatMarketEXO(depositAmount.toString()),
        })
      : translate('Accept this sell order for {{amount}} EXO?', {
          ns: 'markets',
          amount: formatMarketEXO(order.amount),
        })
    Alert.alert(translate('Accept Order', { ns: 'markets' }), confirmMsg, [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: isBuy
          ? translate('Accept & Deposit', { ns: 'markets' })
          : translate('Accept', { ns: 'markets' }),
        onPress: () => execTransaction(translate('Accept Order', { ns: 'markets' }), () =>
          acceptEscrowOrder(wallet.privateKey, wallet.publicKey, wallet.address, order.orderId, !!order.proposedArbitrator, depositAmount)
        ),
      },
    ])
  }

  const handleConfirmPayment = () => {
    if (!wallet || !order) return
    Alert.alert(
      translate('Confirm Payment', { ns: 'markets' }),
      translate('Confirm that you have sent the payment?', { ns: 'markets' }),
      [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Confirm'),
        onPress: () => execTransaction(translate('Confirm Payment', { ns: 'markets' }), () =>
          confirmPayment(wallet.privateKey, wallet.publicKey, wallet.address, order.orderId)
        ),
      },
    ])
  }

  const handleBuyerConfirm = () => {
    if (!wallet || !order) return
    Alert.alert(
      translate('Confirm & Release', { ns: 'markets' }),
      translate('Confirm receipt and release funds to the seller?', { ns: 'markets' }),
      [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Confirm & Release', { ns: 'markets' }),
        onPress: () => execTransaction(translate('Buyer Confirm', { ns: 'markets' }), () =>
          buyerConfirm(wallet.privateKey, wallet.publicKey, wallet.address, order.orderId)
        ),
      },
    ])
  }

  const handleCancel = () => {
    if (!wallet || !order) return
    Alert.alert(translate('Cancel Order', { ns: 'markets' }), translate('Are you sure you want to cancel this order?', {
      ns: 'markets',
    }), [
      { text: translate('No', { ns: 'markets' }), style: 'cancel' },
      {
        text: translate('Cancel Order', { ns: 'markets' }),
        style: 'destructive',
        onPress: () => execTransaction(translate('Cancel Order', { ns: 'markets' }), () =>
          cancelEscrowOrder(wallet.privateKey, wallet.publicKey, wallet.address, order.orderId)
        ),
      },
    ])
  }

  const handleRaiseDispute = () => {
    if (!wallet || !order || !disputeReason.trim()) return
    Alert.alert(translate('Raise Dispute', { ns: 'markets' }), translate('Raise a dispute with reason:\n"{{reason}}"?', {
      ns: 'markets',
      reason: disputeReason,
    }), [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Raise Dispute', { ns: 'markets' }),
        style: 'destructive',
        onPress: () => {
          execTransaction(translate('Raise Dispute', { ns: 'markets' }), () =>
            raiseDispute(wallet.privateKey, wallet.publicKey, wallet.address, order.orderId, disputeReason)
          )
          setShowDisputeInput(false)
          setDisputeReason('')
        },
      },
    ])
  }

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="text-text-muted text-base mt-4">
          {translate('Loading order...', { ns: 'markets' })}
        </Text>
      </View>
    )
  }

  if (!order) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <XCircle size={48} color={colors.textMuted} />
        <Text className="text-text-muted text-base mt-3">
          {translate('Order not found', { ns: 'markets' })}
        </Text>
        <Pressable onPress={() => router.back()} className="mt-4 bg-primary px-6 py-3 rounded-xl" style={{ backgroundColor: colors.primary }}>
          <Text className="text-onPrimary font-semibold">{translate('Go Back')}</Text>
        </Pressable>
      </View>
    )
  }

  const status = String(order.status)
  const statusColor = getStatusColor(status)
  const statusBg = getMarketStatusBackground(statusColor)
  const isFiat = order.orderType === 'Fiat'
  const isSellOrder = order.side === 'Sell' || !order.side
  const isBuyOrder = order.side === 'Buy'
  const isSeller = wallet?.address?.toLowerCase() === order.seller?.toLowerCase()
  const isBuyer = wallet?.address?.toLowerCase() === order.buyer?.toLowerCase()
  const isCreator = isSellOrder ? isSeller : isBuyer
  const activeStep = STEP_MAP[status] ?? -1

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
      <View className="flex-row items-center px-4 py-3">
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="text-xl font-bold text-text ml-2" style={{ color: colors.text }}>
          {translate('Order Detail', { ns: 'markets' })}
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2">
              <View className={`px-3 py-1.5 rounded-lg ${statusBg}`}>
                <Text className={`text-sm font-bold ${statusColor}`}>{formatOrderStatus(status)}</Text>
              </View>
              <View className="px-2.5 py-1 rounded-lg" style={{ backgroundColor: isBuyOrder ? 'rgba(14,165,233,0.15)' : 'rgba(225,29,72,0.15)' }}>
                <Text className="text-xs font-bold" style={{ color: isBuyOrder ? '#38bdf8' : '#fb7185' }}>
                  {isBuyOrder
                    ? translate('Buy Order', { ns: 'markets' })
                    : translate('Sell Order', { ns: 'markets' })}
                </Text>
              </View>
            </View>
            <View className={`px-2.5 py-1 rounded-lg ${isFiat ? 'bg-emerald-500/15' : 'bg-cyan-500/15'}`}>
              <Text className={`text-xs font-semibold ${isFiat ? 'text-emerald-400' : 'text-cyan-400'}`}>
                {isFiat
                  ? translate('Fiat', { ns: 'markets' })
                  : translate('Condition', { ns: 'markets' })}
              </Text>
            </View>
          </View>

          <Text className="text-text text-3xl font-bold mb-1" style={{ color: colors.text }}>{formatMarketEXO(order.amount)} EXO</Text>

          {isFiat && order.fiatPrice && (
            <Text className="text-text-secondary text-base mb-3" style={{ color: colors.textSecondary }}>
              {formatMarketEXO(order.fiatPrice, 2)} {order.fiatCurrency || 'USD'}
            </Text>
          )}
          {!isFiat && order.conditionDescription && (
            <View className="mb-3">
              <Text className="text-text-secondary text-base" style={{ color: colors.textSecondary }}>{order.conditionDescription}</Text>
              {order.conditionHash && (
                <Text className="text-text-muted text-xs mt-1" style={{ color: colors.textMuted }}>
                  {translate('Hash: {{hash}}', { ns: 'markets', hash: truncateMarketAddress(order.conditionHash) })}
                </Text>
              )}
            </View>
          )}

          <View className="border-t border-border pt-3 mt-1" style={{ borderColor: colors.border }}>
            {order.seller ? (
              <View className="flex-row justify-between mb-2">
                <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
                  {translate('Seller', { ns: 'markets' })}
                </Text>
                <Text className="text-text text-sm font-medium" style={{ color: colors.text }}>
                  {truncateMarketAddress(order.seller)}
                  {isSeller ? translate(' (You)', { ns: 'markets' }) : ''}
                </Text>
              </View>
            ) : (
              <View className="flex-row justify-between mb-2">
                <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
                  {translate('Seller', { ns: 'markets' })}
                </Text>
                <Text className="text-text-tertiary text-sm italic" style={{ color: colors.textTertiary }}>
                  {translate('Awaiting seller', { ns: 'markets' })}
                </Text>
              </View>
            )}
            {order.buyer ? (
              <View className="flex-row justify-between mb-2">
                <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
                  {translate('Buyer', { ns: 'markets' })}
                </Text>
                <Text className="text-text text-sm font-medium" style={{ color: colors.text }}>
                  {truncateMarketAddress(order.buyer)}
                  {isBuyer ? translate(' (You)', { ns: 'markets' }) : ''}
                </Text>
              </View>
            ) : (
              <View className="flex-row justify-between mb-2">
                <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
                  {translate('Buyer', { ns: 'markets' })}
                </Text>
                <Text className="text-text-tertiary text-sm italic" style={{ color: colors.textTertiary }}>
                  {translate('Awaiting buyer', { ns: 'markets' })}
                </Text>
              </View>
            )}
            <View className="flex-row justify-between mb-2">
              <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
                {translate('Created', { ns: 'markets' })}
              </Text>
              <Text className="text-text text-sm" style={{ color: colors.text }}>{formatTimestamp(order.createdAt)}</Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
                {translate('Expires', { ns: 'markets' })}
              </Text>
              <View className="flex-row items-center gap-1">
                <Clock size={12} color={colors.textTertiary} />
                <Text className="text-text text-sm" style={{ color: colors.text }}>{formatTimeRemaining(order.expiresAt)}</Text>
              </View>
            </View>
            {order.arbitrator && (
              <View className="flex-row justify-between">
                <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
                  {translate('Arbitrator', { ns: 'markets' })}
                </Text>
                <Text className="text-text text-sm font-medium" style={{ color: colors.text }}>{truncateMarketAddress(order.arbitrator)}</Text>
              </View>
            )}
          </View>
        </View>

        {activeStep >= 0 && (
          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-3" style={{ color: colors.textSecondary }}>
              {translate('Progress', { ns: 'markets' })}
            </Text>
            <View className="flex-row justify-between">
              {STEPS.map((step, i) => {
                const isActive = i <= activeStep
                const isCurrent = i === activeStep
                return (
                  <View key={step} className="items-center flex-1">
                    <View
                      className={`w-7 h-7 rounded-full items-center justify-center ${
                        isCurrent ? 'bg-primary' : isActive ? 'bg-primary/40' : 'bg-background'
                      }`}
                      style={{
                        backgroundColor: isCurrent ? colors.primary : isActive ? colors.primary + '66' : colors.backgroundTertiary,
                      }}
                    >
                      {isActive ? (
                        <CheckCircle2 size={14} color={colors.textOnPrimary} />
                      ) : (
                        <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>{i + 1}</Text>
                      )}
                    </View>
                    <Text
                      className={`text-center mt-1 ${isCurrent ? 'text-primary font-semibold' : 'text-text-muted'}`}
                      style={{ color: isCurrent ? colors.primary : colors.textMuted, fontSize: 9, lineHeight: 11, height: 22 }}
                      numberOfLines={2}
                    >
                      {translate(step, { ns: 'markets' })}
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}

        {(sellerRep || buyerRep) && (
          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-3" style={{ color: colors.textSecondary }}>
              {translate('Reputation', { ns: 'markets' })}
            </Text>
            <View className="flex-row gap-3">
              {sellerRep && (
                <View className="flex-1 bg-background rounded-xl p-3" style={{ backgroundColor: colors.backgroundSecondary }}>
                  <View className="flex-row items-center gap-1.5 mb-1">
                    <User size={12} color={colors.textTertiary} />
                    <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>
                      {translate('Seller', { ns: 'markets' })}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Star size={14} color={colors.warning} />
                    <Text className="text-text text-lg font-bold" style={{ color: colors.text }}>{sellerRep.score}</Text>
                  </View>
                  <Text className="text-text-muted text-xs mt-0.5" style={{ color: colors.textMuted }}>
                    {translate('{{successful}}/{{total}} trades', {
                      ns: 'markets',
                      successful: sellerRep.successfulTrades,
                      total: sellerRep.totalTrades,
                    })}
                  </Text>
                </View>
              )}
              {buyerRep && (
                <View className="flex-1 bg-background rounded-xl p-3" style={{ backgroundColor: colors.backgroundSecondary }}>
                  <View className="flex-row items-center gap-1.5 mb-1">
                    <User size={12} color={colors.textTertiary} />
                    <Text className="text-text-muted text-xs" style={{ color: colors.textMuted }}>
                      {translate('Buyer', { ns: 'markets' })}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <Star size={14} color={colors.warning} />
                    <Text className="text-text text-lg font-bold" style={{ color: colors.text }}>{buyerRep.score}</Text>
                  </View>
                  <Text className="text-text-muted text-xs mt-0.5" style={{ color: colors.textMuted }}>
                    {translate('{{successful}}/{{total}} trades', {
                      ns: 'markets',
                      successful: buyerRep.successfulTrades,
                      total: buyerRep.totalTrades,
                    })}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        <View className="gap-2 mb-4">
          {status === 'Open' && !isCreator && wallet && (
            <Pressable
              onPress={handleAccept}
              disabled={isSubmitting}
              className="bg-primary py-3.5 rounded-xl items-center active:opacity-80"
              style={{ backgroundColor: colors.primary, opacity: isSubmitting ? 0.5 : 1 }}
            >
              {isSubmitting ? <ActivityIndicator color={colors.textOnPrimary} /> : (
                <Text className="text-onPrimary font-semibold text-base">
                  {isBuyOrder
                    ? translate('Accept & Deposit', { ns: 'markets' })
                    : translate('Accept Order', { ns: 'markets' })}
                </Text>
              )}
            </Pressable>
          )}

          {status === 'Accepted' && isSeller && (
            <Pressable
              onPress={handleConfirmPayment}
              disabled={isSubmitting}
              className="bg-primary py-3.5 rounded-xl items-center active:opacity-80"
              style={{ backgroundColor: colors.primary, opacity: isSubmitting ? 0.5 : 1 }}
            >
              {isSubmitting ? <ActivityIndicator color={colors.textOnPrimary} /> : (
                <Text className="text-onPrimary font-semibold text-base">
                  {translate('Confirm Payment', { ns: 'markets' })}
                </Text>
              )}
            </Pressable>
          )}

          {status === 'SellerConfirmed' && isBuyer && (
            <Pressable
              onPress={handleBuyerConfirm}
              disabled={isSubmitting}
              className="py-3.5 rounded-xl items-center active:opacity-80"
              style={{ backgroundColor: colors.success, opacity: isSubmitting ? 0.5 : 1 }}
            >
              {isSubmitting ? <ActivityIndicator color="white" /> : (
                <Text className="text-white font-semibold text-base">
                  {translate('Confirm & Release', { ns: 'markets' })}
                </Text>
              )}
            </Pressable>
          )}

          {(status === 'Open' || status === 'Accepted') && isCreator && (
            <Pressable
              onPress={handleCancel}
              disabled={isSubmitting}
              className="py-3.5 rounded-xl items-center border active:opacity-80"
              style={{ borderColor: colors.error, opacity: isSubmitting ? 0.5 : 1 }}
            >
              <Text className="font-semibold text-base" style={{ color: colors.error }}>
                {translate('Cancel Order', { ns: 'markets' })}
              </Text>
            </Pressable>
          )}

          {(status === 'Accepted' || status === 'SellerConfirmed') && (isBuyer || isSeller) && (
            <View>
              {!showDisputeInput ? (
                <Pressable
                  onPress={() => setShowDisputeInput(true)}
                  disabled={isSubmitting}
                  className="py-3.5 rounded-xl items-center flex-row justify-center gap-2 border active:opacity-80"
                  style={{ borderColor: colors.warning, opacity: isSubmitting ? 0.5 : 1 }}
                >
                  <AlertTriangle size={18} color={colors.warning} />
                  <Text className="font-semibold text-base" style={{ color: colors.warning }}>
                    {translate('Raise Dispute', { ns: 'markets' })}
                  </Text>
                </Pressable>
              ) : (
                <View className="bg-surface rounded-2xl p-4" style={{ backgroundColor: colors.surface }}>
                  <Text className="text-text-secondary text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                    {translate('Dispute Reason', { ns: 'markets' })}
                  </Text>
                  <TextInput
                    className="bg-background rounded-xl p-3 text-text text-sm mb-3"
                    style={{ backgroundColor: colors.backgroundSecondary, color: colors.text, minHeight: 80, textAlignVertical: 'top' }}
                    placeholder={translate('Describe the issue...', { ns: 'markets' })}
                    placeholderTextColor={colors.textMuted}
                    value={disputeReason}
                    onChangeText={setDisputeReason}
                    multiline
                  />
                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => { setShowDisputeInput(false); setDisputeReason('') }}
                      className="flex-1 py-3 rounded-xl items-center border active:opacity-80"
                      style={{ borderColor: colors.border }}
                    >
                      <Text className="text-text-secondary font-medium" style={{ color: colors.textSecondary }}>
                        {translate('Cancel')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleRaiseDispute}
                      disabled={isSubmitting || !disputeReason.trim()}
                      className="flex-1 py-3 rounded-xl items-center active:opacity-80"
                      style={{ backgroundColor: colors.warning, opacity: isSubmitting || !disputeReason.trim() ? 0.5 : 1 }}
                    >
                      {isSubmitting ? <ActivityIndicator color="white" /> : (
                        <Text className="text-white font-semibold">
                          {translate('Submit Dispute', { ns: 'markets' })}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )
}
