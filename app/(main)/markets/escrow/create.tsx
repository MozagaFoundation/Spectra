/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { KeyboardAvoidingView } from '@/components/ui/KeyboardAvoidingView'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChevronLeft, Info } from 'lucide-react-native'
import { useWalletStore, toast } from '@/store'
import { useThemeColors } from '@/lib/theme'
import { translate } from '@/lib/i18n'
import { waitForTransaction } from '@/services/crypto'
import {
  createFiatOrder,
  createConditionOrder,
  createBuyFiatOrder,
  createBuyConditionOrder,
  validateEscrowOrderParams,
  calculateOrderFee,
} from '@/services/crypto/escrowService'
import { parseDecimalToBigInt } from '@/lib/amounts'
import { hashTextToEntityId } from '@/services/crypto/contractHashes'
import { formatMarketEXO } from '@/lib/markets'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'

function parseEXOInput(ota: string): bigint {
  return parseDecimalToBigInt(ota, 18) ?? 0n
}

type OrderSide = 'sell' | 'buy'
type OrderType = 'fiat' | 'condition'
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'BRL', 'INR', 'AUD', 'CAD', 'CHF']
const EXPIRY_PRESETS = [3, 7, 14, 30]
const REP_PRESETS = [0, 10, 50, 100]

export default function CreateEscrowOrder() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { wallet } = useWalletStore()
  const colors = useThemeColors()

  const [orderSide, setOrderSide] = useState<OrderSide>('sell')
  const [orderType, setOrderType] = useState<OrderType>('fiat')
  const [amount, setAmount] = useState('')
  const [fiatPrice, setFiatPrice] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const [conditionDesc, setConditionDesc] = useState('')
  const [expiryDays, setExpiryDays] = useState(7)
  const [arbitratorAddress, setArbitratorAddress] = useState('')
  const [minReputation, setMinReputation] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const amountWei = parseEXOInput(amount)
  const fee = amountWei > 0n ? calculateOrderFee(amountWei) : 0n
  const total = amountWei + fee

  const handleCreate = () => {
    if (!wallet) return

    const validation = validateEscrowOrderParams(amountWei, expiryDays)
    if (!validation.valid) {
      Alert.alert(
        translate('Invalid', { ns: 'markets' }),
        validation.error || translate('Invalid parameters', { ns: 'markets' }),
      )
      return
    }

    if (orderType === 'fiat' && !fiatPrice) {
      Alert.alert(
        translate('Invalid', { ns: 'markets' }),
        translate('Please enter a fiat price', { ns: 'markets' }),
      )
      return
    }
    const fiatPriceWei = orderType === 'fiat' ? parseEXOInput(fiatPrice) : 0n
    if (orderType === 'fiat' && fiatPriceWei <= 0n) {
      Alert.alert(
        translate('Invalid', { ns: 'markets' }),
        translate('Fiat price must be greater than zero', { ns: 'markets' }),
      )
      return
    }

    if (orderType === 'condition' && !conditionDesc.trim()) {
      Alert.alert(
        translate('Invalid', { ns: 'markets' }),
        translate('Please enter a condition description', { ns: 'markets' }),
      )
      return
    }

    const isBuy = orderSide === 'buy'
    const confirmMessage = isBuy
      ? translate('Create a buy {{orderType}} listing for {{amount}} EXO?\n\nNo deposit required — a seller will deposit when accepting.', {
          ns: 'markets',
          orderType: translate(orderType === 'fiat' ? 'Fiat' : 'Condition', { ns: 'markets' }).toLowerCase(),
          amount: formatMarketEXO(amountWei.toString()),
        })
      : translate('Create a sell {{orderType}} order for {{amount}} EXO?\n\nTotal deposit: {{total}} EXO (incl. 0.1% fee)', {
          ns: 'markets',
          orderType: translate(orderType === 'fiat' ? 'Fiat' : 'Condition', { ns: 'markets' }).toLowerCase(),
          amount: formatMarketEXO(amountWei.toString()),
          total: formatMarketEXO(total.toString()),
        })
    Alert.alert(
      translate('Create Escrow Order', { ns: 'markets' }),
      confirmMessage,
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Create'),
          onPress: async () => {
            try {
              setIsSubmitting(true)
              toast.info(
                translate('Processing'),
                translate('Creating escrow order...', { ns: 'markets' }),
              )

              let result: { txHash: string }
              if (orderType === 'fiat') {
                result = isBuy
                  ? await createBuyFiatOrder(
                      wallet.privateKey, wallet.publicKey, wallet.address,
                      amountWei, fiatPriceWei, currency, expiryDays,
                      arbitratorAddress || undefined,
                      minReputation > 0 ? minReputation : undefined,
                    )
                  : await createFiatOrder(
                      wallet.privateKey, wallet.publicKey, wallet.address,
                      amountWei, fiatPriceWei, currency, expiryDays,
                      arbitratorAddress || undefined,
                      minReputation > 0 ? minReputation : undefined,
                    )
              } else {
                const descHash = hashTextToEntityId(conditionDesc)
                result = isBuy
                  ? await createBuyConditionOrder(
                      wallet.privateKey, wallet.publicKey, wallet.address,
                      amountWei, descHash, conditionDesc, expiryDays,
                      arbitratorAddress || undefined,
                      minReputation > 0 ? minReputation : undefined,
                    )
                  : await createConditionOrder(
                      wallet.privateKey, wallet.publicKey, wallet.address,
                      amountWei, descHash, conditionDesc, expiryDays,
                      arbitratorAddress || undefined,
                      minReputation > 0 ? minReputation : undefined,
                    )
              }

              toast.info(
                translate('Submitted'),
                translate('Waiting for confirmation...', { ns: 'markets' }),
              )
              const status = await waitForTransaction(result.txHash, 15, 2000)

              if (status.status === 'confirmed') {
                toast.success(
                  translate('Success'),
                  translate('Escrow order created', { ns: 'markets' }),
                )
                router.back()
              } else if (status.status === 'failed') {
                toast.error(
                  translate('Failed'),
                  translate('Order creation failed', { ns: 'markets' }),
                )
              } else {
                toast.success(
                  translate('Submitted'),
                  translate('Order submitted, awaiting confirmation', { ns: 'markets' }),
                )
                router.back()
              }
            } catch (error: any) {
              console.error('Create order error:', error)
              toast.error(
                translate('Error'),
                getErrorDisplayMessage(error) || translate('Failed to create order', { ns: 'markets' }),
              )
            } finally {
              setIsSubmitting(false)
            }
          },
        },
      ],
    )
  }

  if (!wallet) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <Text className="text-text-muted text-base text-center" style={{ color: colors.textMuted }}>
          {translate('Connect wallet to create an escrow order', { ns: 'markets' })}
        </Text>
        <Pressable onPress={() => router.back()} className="mt-4 bg-primary px-6 py-3 rounded-xl" style={{ backgroundColor: colors.primary }}>
          <Text className="text-onPrimary font-semibold">{translate('Go Back')}</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View className="flex-row items-center px-4 py-3">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="text-xl font-bold text-text ml-2" style={{ color: colors.text }}>
            {translate('Create {{side}} Order', {
              ns: 'markets',
              side: translate(orderSide === 'buy' ? 'Buy' : 'Sell', { ns: 'markets' }),
            })}
          </Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {translate('Order Side', { ns: 'markets' })}
            </Text>
            <View className="flex-row bg-background rounded-xl p-1" style={{ backgroundColor: colors.backgroundSecondary }}>
              <Pressable
                onPress={() => setOrderSide('sell')}
                className={`flex-1 py-2.5 rounded-lg items-center ${orderSide === 'sell' ? '' : ''}`}
                style={orderSide === 'sell' ? { backgroundColor: '#e11d48' } : undefined}
              >
                <Text className="font-semibold text-sm"
                  style={{ color: orderSide === 'sell' ? '#fff' : colors.textMuted }}>
                  {translate('Sell', { ns: 'markets' })}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setOrderSide('buy')}
                className={`flex-1 py-2.5 rounded-lg items-center`}
                style={orderSide === 'buy' ? { backgroundColor: '#0ea5e9' } : undefined}
              >
                <Text className="font-semibold text-sm"
                  style={{ color: orderSide === 'buy' ? '#fff' : colors.textMuted }}>
                  {translate('Buy', { ns: 'markets' })}
                </Text>
              </Pressable>
            </View>
            {orderSide === 'buy' && (
              <Text className="text-xs mt-2" style={{ color: colors.textTertiary }}>
                {translate('You want to buy crypto — no deposit required. A seller will deposit when accepting.', {
                  ns: 'markets',
                })}
              </Text>
            )}
          </View>

          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {translate('Order Type', { ns: 'markets' })}
            </Text>
            <View className="flex-row bg-background rounded-xl p-1" style={{ backgroundColor: colors.backgroundSecondary }}>
              <Pressable
                onPress={() => setOrderType('fiat')}
                className={`flex-1 py-2.5 rounded-lg items-center ${orderType === 'fiat' ? 'bg-primary' : ''}`}
                style={orderType === 'fiat' ? { backgroundColor: colors.primary } : undefined}
              >
                <Text className={`font-semibold text-sm ${orderType === 'fiat' ? 'text-onPrimary' : 'text-text-muted'}`}
                  style={{ color: orderType === 'fiat' ? colors.textOnPrimary : colors.textMuted }}>
                  {translate('Fiat', { ns: 'markets' })}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setOrderType('condition')}
                className={`flex-1 py-2.5 rounded-lg items-center ${orderType === 'condition' ? 'bg-primary' : ''}`}
                style={orderType === 'condition' ? { backgroundColor: colors.primary } : undefined}
              >
                <Text className={`font-semibold text-sm ${orderType === 'condition' ? 'text-onPrimary' : 'text-text-muted'}`}
                  style={{ color: orderType === 'condition' ? colors.textOnPrimary : colors.textMuted }}>
                  {translate('Condition', { ns: 'markets' })}
                </Text>
              </Pressable>
            </View>
          </View>

          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {translate('Amount (EXO)', { ns: 'markets' })}
            </Text>
            <TextInput
              className="bg-background rounded-xl p-3.5 text-text text-lg font-semibold"
              style={{ backgroundColor: colors.backgroundSecondary, color: colors.text }}
              placeholder="0.0"
              placeholderTextColor={colors.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
            />
          </View>

          {orderType === 'fiat' ? (
            <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
              <Text className="text-text-secondary text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                {translate('Fiat Price', { ns: 'markets' })}
              </Text>
              <View className="flex-row gap-2 mb-3">
                <TextInput
                  className="flex-1 bg-background rounded-xl p-3.5 text-text text-lg font-semibold"
                  style={{ backgroundColor: colors.backgroundSecondary, color: colors.text }}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  value={fiatPrice}
                  onChangeText={setFiatPrice}
                  keyboardType="decimal-pad"
                />
                <Pressable
                  onPress={() => setShowCurrencyPicker(!showCurrencyPicker)}
                  className="bg-background rounded-xl px-4 items-center justify-center"
                  style={{ backgroundColor: colors.backgroundSecondary }}
                >
                  <Text className="text-primary font-bold text-base" style={{ color: colors.primary }}>{currency}</Text>
                </Pressable>
              </View>
              {showCurrencyPicker && (
                <View className="flex-row flex-wrap gap-2">
                  {CURRENCIES.map(c => (
                    <Pressable
                      key={c}
                      onPress={() => { setCurrency(c); setShowCurrencyPicker(false) }}
                      className={`px-3 py-2 rounded-lg ${c === currency ? 'bg-primary' : 'bg-background'}`}
                      style={{ backgroundColor: c === currency ? colors.primary : colors.backgroundSecondary }}
                    >
                      <Text
                        className={`text-sm font-medium ${c === currency ? 'text-onPrimary' : 'text-text-secondary'}`}
                        style={{ color: c === currency ? colors.textOnPrimary : colors.textSecondary }}
                      >{c}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
              <Text className="text-text-secondary text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
                {translate('Condition Description', { ns: 'markets' })}
              </Text>
              <TextInput
                className="bg-background rounded-xl p-3.5 text-text text-sm"
                style={{ backgroundColor: colors.backgroundSecondary, color: colors.text, minHeight: 80, textAlignVertical: 'top' }}
                placeholder={translate('Describe the condition for release...', { ns: 'markets' })}
                placeholderTextColor={colors.textMuted}
                value={conditionDesc}
                onChangeText={setConditionDesc}
                multiline
              />
            </View>
          )}

          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {translate('Expiration (days)', { ns: 'markets' })}
            </Text>
            <View className="flex-row gap-2">
              {EXPIRY_PRESETS.map(d => (
                <Pressable
                  key={d}
                  onPress={() => setExpiryDays(d)}
                  className={`flex-1 py-2.5 rounded-xl items-center ${d === expiryDays ? 'bg-primary' : 'bg-background'}`}
                  style={{ backgroundColor: d === expiryDays ? colors.primary : colors.backgroundSecondary }}
                >
                  <Text
                    className={`font-semibold text-sm ${d === expiryDays ? 'text-onPrimary' : 'text-text-secondary'}`}
                    style={{ color: d === expiryDays ? colors.textOnPrimary : colors.textSecondary }}
                  >{d}d</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {translate('Arbitrator Address', { ns: 'markets' })}
              {' '}
              <Text className="text-text-muted" style={{ color: colors.textMuted }}>
                {translate('(optional)', { ns: 'markets' })}
              </Text>
            </Text>
            <TextInput
              className="bg-background rounded-xl p-3.5 text-text text-sm"
              style={{ backgroundColor: colors.backgroundSecondary, color: colors.text }}
              placeholder="EXO00..."
              placeholderTextColor={colors.textMuted}
              value={arbitratorAddress}
              onChangeText={setArbitratorAddress}
              autoCapitalize="none"
            />
          </View>

          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {translate('Min {{role}} Reputation', {
                ns: 'markets',
                role: translate(orderSide === 'buy' ? 'Seller' : 'Buyer', { ns: 'markets' }),
              })}
              {' '}
              <Text className="text-text-muted" style={{ color: colors.textMuted }}>
                {translate('(optional)', { ns: 'markets' })}
              </Text>
            </Text>
            <View className="flex-row gap-2">
              {REP_PRESETS.map(r => (
                <Pressable
                  key={r}
                  onPress={() => setMinReputation(r)}
                  className={`flex-1 py-2.5 rounded-xl items-center ${r === minReputation ? 'bg-primary' : 'bg-background'}`}
                  style={{ backgroundColor: r === minReputation ? colors.primary : colors.backgroundSecondary }}
                >
                  <Text
                    className={`font-semibold text-sm ${r === minReputation ? 'text-onPrimary' : 'text-text-secondary'}`}
                    style={{ color: r === minReputation ? colors.textOnPrimary : colors.textSecondary }}
                  >{r === 0 ? translate('Any', { ns: 'markets' }) : r.toString()}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <View className="flex-row items-center gap-1.5 mb-3">
              <Info size={14} color={colors.textTertiary} />
              <Text className="text-text-secondary text-sm font-medium" style={{ color: colors.textSecondary }}>
                {translate('Summary', { ns: 'markets' })}
              </Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
                {orderSide === 'buy'
                  ? translate('Desired Amount', { ns: 'markets' })
                  : translate('Amount', { ns: 'markets' })}
              </Text>
              <Text className="text-text text-sm font-medium" style={{ color: colors.text }}>{formatMarketEXO(amountWei.toString())} EXO</Text>
            </View>
            {orderSide === 'sell' ? (
              <>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
                    {translate('Fee (0.1%)', { ns: 'markets' })}
                  </Text>
                  <Text className="text-text text-sm font-medium" style={{ color: colors.text }}>{formatMarketEXO(fee.toString(), 6)} EXO</Text>
                </View>
                <View className="border-t border-border pt-2 mt-1" style={{ borderColor: colors.border }}>
                  <View className="flex-row justify-between">
                    <Text className="text-text font-semibold text-sm" style={{ color: colors.text }}>
                      {translate('Total Deposit', { ns: 'markets' })}
                    </Text>
                    <Text className="text-primary font-bold text-base" style={{ color: colors.primary }}>{formatMarketEXO(total.toString())} EXO</Text>
                  </View>
                </View>
              </>
            ) : (
              <>
                <View className="flex-row justify-between mb-2">
                  <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
                    {translate('Your Deposit', { ns: 'markets' })}
                  </Text>
                  <Text className="text-sm font-medium" style={{ color: colors.success }}>
                    {translate('None', { ns: 'markets' })}
                  </Text>
                </View>
                <View className="border-t border-border pt-2 mt-1" style={{ borderColor: colors.border }}>
                  <View className="flex-row justify-between">
                    <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
                      {translate('Seller Fee (0.1%)', { ns: 'markets' })}
                    </Text>
                    <Text className="text-text-secondary text-sm" style={{ color: colors.textSecondary }}>
                      {translate('Paid by seller on acceptance', { ns: 'markets' })}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>

          <Pressable
            onPress={handleCreate}
            disabled={isSubmitting || amountWei <= 0n}
            className="bg-primary py-4 rounded-xl items-center active:opacity-80 mb-4"
            style={{ backgroundColor: colors.primary, opacity: isSubmitting || amountWei <= 0n ? 0.5 : 1 }}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text className="text-onPrimary font-bold text-base">
                {translate('Create Order', { ns: 'markets' })}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}
