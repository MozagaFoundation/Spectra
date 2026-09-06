/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { View, Text, TextInput, Pressable, Alert, ActivityIndicator, Keyboard, ScrollView } from 'react-native'
import { KeyboardAvoidingView } from '@/components/ui/KeyboardAvoidingView'
import { KeyboardDoneAccessory } from '@/components/ui/KeyboardDoneAccessory'
import { ChevronLeft, Send, Scan, AlertCircle, Check } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useUIStore, useWalletStore } from '@/store'
import { useSpectreStore } from '@/store/spectreStore'
import {
  getBalance,
  getDonationTransferQuote,
  recordPendingCryptoTransaction,
  sendEXOTransfer,
  isValidExoAddress,
  type DonationTransferQuote,
} from '@/services/crypto'
import { Button } from '@/components/ui'
import { translate } from '@/lib/i18n'
import { formatAddress } from '@/lib/utils'
import { useCryptoTheme } from '@/lib/cryptoTheme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { useMarketPrices } from '@/hooks/useMarketPrices'
import { getContributionRecipients, type VerifiedContributionRecipients } from '@/services/backend/contributionRecipients'
import { formatAssetFiatValue } from '@/services/crypto/fiatValuation'
import { formatBigIntAmount, parseDecimalToBigInt } from '@/lib/amounts'
import {
  canUseCryptoNetworkInSpectre,
  getSpectreCryptoRestrictionMessage,
  type SpectreCryptoNetworkId,
} from '@/lib/spectrePolicy'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'

const AMOUNT_KEYBOARD_ACCESSORY_ID = 'send-exo-amount-keyboard'

type SendState = 'input' | 'confirming' | 'sending' | 'success' | 'pending' | 'error'

const EXO_NETWORK_FEE_WEI = parseDecimalToBigInt('0.000216', 18) ?? 0n
const EXO_TOTAL_NETWORK_FEE_WEI = EXO_NETWORK_FEE_WEI * 2n

function DonationPreview({ quote }: { quote: DonationTransferQuote }) {
  return (
    <View className="bg-surface rounded-xl p-3 mb-6">
      <View className="flex-row justify-between mb-1">
        <Text className="text-text-muted text-sm">{translate('Contribution', { ns: 'crypto' })}</Text>
        <Text className="text-text text-sm">{quote.amount} {quote.symbol}</Text>
      </View>
      <Text className="text-text-muted text-xs">
        {translate('A 0.1% contribution is included, capped at $10 equivalent.', { ns: 'crypto' })}
      </Text>
    </View>
  )
}

export default function SendEXOScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const { colors, accent, alpha } = useCryptoTheme()
  const { data: marketPrices } = useMarketPrices()
  const accentColor = accent('mozaga')
  
  const { wallet } = useWalletStore()
  const preferredFiatCurrency = useUIStore((state) => state.preferredFiatCurrency)
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  const spectreAccountMode = useSpectreStore((state) => state.spectreAccountMode)
  const spectrePolicyState = useMemo(() => ({
    enabled: spectreEnabled,
    accountMode: spectreAccountMode,
    walletIsSpectre: wallet?.spectreMode === true,
  }), [spectreAccountMode, spectreEnabled, wallet?.spectreMode])
  const mozagaAllowed = canUseCryptoNetworkInSpectre(spectrePolicyState, 'mozaga' as SpectreCryptoNetworkId)
  
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [balance, setBalance] = useState('0.0000')
  const [sendState, setSendState] = useState<SendState>('input')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [donationTxHash, setDonationTxHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [contributionRecipients, setContributionRecipients] = useState<VerifiedContributionRecipients | null>(null)
  
  useEffect(() => {
    const fetchBalance = async () => {
      if (wallet?.address) {
        const bal = await getBalance(wallet.address)
        setBalance(bal)
      }
    }
    fetchBalance()
  }, [wallet?.address])

  useEffect(() => {
    let cancelled = false
    getContributionRecipients()
      .then((recipients) => {
        if (!cancelled) setContributionRecipients(recipients)
      })
      .catch((err) => {
        if (__DEV__) console.warn('Failed to load contribution recipients:', err)
        if (!cancelled) setContributionRecipients(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const amountWei = parseDecimalToBigInt(amount, 18)
  const balanceWei = parseDecimalToBigInt(balance, 18) ?? 0n
  const balanceFiatLabel = formatAssetFiatValue({
    symbol: 'EXO',
    balance,
    decimals: 18,
    prices: marketPrices,
    fiatCode: preferredFiatCurrency,
  })
  const donationQuote = getDonationTransferQuote({
    networkId: 'mozaga',
    symbol: 'EXO',
    decimals: 18,
    amountUnits: amountWei,
    prices: marketPrices,
    recipients: contributionRecipients?.recipients,
  })
  const networkFeeLabel = formatBigIntAmount(EXO_TOTAL_NETWORK_FEE_WEI, 18, 6)
  
  const isValidAmount = useCallback(() => {
    if (!amountWei || amountWei <= 0n || !donationQuote) return false
    return amountWei + donationQuote.amountUnits + EXO_TOTAL_NETWORK_FEE_WEI <= balanceWei
  }, [amountWei, balanceWei, donationQuote])
  
  const canSend = useCallback(() => {
    return isValidExoAddress(recipient) && isValidAmount()
  }, [recipient, isValidAmount])
  
  const handleSetMax = () => {
    const totalFeeWei = EXO_TOTAL_NETWORK_FEE_WEI
    const maxAmountWei = balanceWei > totalFeeWei
      ? ((balanceWei - totalFeeWei) * 1000n) / 1001n
      : 0n
    setAmount(formatBigIntAmount(maxAmountWei, 18, 6, true))
  }
  
  const handleReview = () => {
    if (!canSend()) {
      Alert.alert(
        translate('Invalid Input'),
        translate('Please check the recipient address and amount.'),
      )
      return
    }
    Keyboard.dismiss()
    setSendState('confirming')
  }
  
  const handleConfirmSend = async () => {
    if (!wallet) return
    
    setSendState('sending')
    setError(null)
    setTxHash(null)
    setDonationTxHash(null)
    
    try {
      const normalizedAmount = amountWei
        ? formatBigIntAmount(amountWei, 18, 18, true)
        : amount
      if (!donationQuote) {
        throw new Error(translate('Contribution quote unavailable. Please refresh market prices and try again.', { ns: 'crypto' }))
      }
      const result = await sendEXOTransfer(
        wallet.privateKey,
        wallet.publicKey,
        wallet.address,
        recipient,
        normalizedAmount
      )
      
      setTxHash(result.txHash)
      await recordPendingCryptoTransaction({
        network: 'mozaga',
        txHash: result.txHash,
        from: wallet.address,
        to: recipient,
        amount: normalizedAmount,
        symbol: 'EXO',
        assetType: 'native',
      })
      const donationResult = await sendEXOTransfer(
        wallet.privateKey,
        wallet.publicKey,
        wallet.address,
        donationQuote.treasuryAddress,
        donationQuote.amount,
      )
      setDonationTxHash(donationResult.txHash)
      await recordPendingCryptoTransaction({
        network: 'mozaga',
        txHash: donationResult.txHash,
        from: wallet.address,
        to: donationQuote.treasuryAddress,
        amount: donationQuote.amount,
        symbol: 'EXO',
        assetType: 'native',
      })
      setSendState('success')
    } catch (err) {
      if (__DEV__) console.warn('Send error:', err)
      setError(getErrorDisplayMessage(err) || translate('Failed to send transaction'))
      setSendState('error')
    }
  }
  
  const handleClose = () => {
    Keyboard.dismiss()
    router.back()
  }
  
  const handleTryAgain = () => {
    setSendState('input')
    setError(null)
    setTxHash(null)
    setDonationTxHash(null)
  }

  if (!mozagaAllowed) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View className="flex-row items-center gap-3 px-5 pb-4">
          <Pressable
            onPress={handleClose}
            className="w-10 h-10 rounded-xl items-center justify-center active:opacity-70"
            style={{ backgroundColor: colors.surface }}
          >
            <ChevronLeft size={22} color={colors.text} />
          </Pressable>
          <Text className="flex-1 text-2xl font-bold text-text">{translate('Send EXO')}</Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <AlertCircle size={44} color={colors.error} />
          <Text className="text-text text-xl font-semibold mt-4 text-center">{translate('Unavailable in Spectre Mode')}</Text>
          <Text className="text-text-muted text-center mt-2">
            {translate(getSpectreCryptoRestrictionMessage(spectrePolicyState, 'mozaga') ?? 'This crypto network is unavailable in Spectre Mode.')}
          </Text>
        </View>
      </View>
    )
  }
  
  if (sendState === 'success') {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-5">
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-6"
            style={{ backgroundColor: alpha(accentColor, 0.18) }}
          >
            <Check size={40} color={accentColor} />
          </View>
          <Text className="text-2xl font-bold text-text mb-2">{translate('Transaction Sent')}</Text>
          <Text className="text-text-muted text-center mb-6">
            {translate('{{amount}} EXO sent to {{recipient}}', {
              amount,
              recipient: formatAddress(recipient, 8),
            })}
          </Text>
          {txHash && (
            <View className="bg-surface rounded-xl p-4 w-full mb-6">
              <Text className="text-text-muted text-sm mb-1">{translate('Transaction Hash')}</Text>
              <Text className="text-text font-mono text-xs" numberOfLines={2}>
                {txHash}
              </Text>
            </View>
          )}
          {donationTxHash && (
            <View className="bg-surface rounded-xl p-4 w-full mb-6">
              <Text className="text-text-muted text-sm mb-1">{translate('Contribution Transaction Hash', { ns: 'crypto' })}</Text>
              <Text className="text-text font-mono text-xs" numberOfLines={2}>
                {donationTxHash}
              </Text>
            </View>
          )}
          <Button variant="primary" size="lg" fullWidth accentColor={accentColor} onPress={handleClose}>
            {translate('Done')}
          </Button>
        </View>
      </View>
    )
  }

  if (sendState === 'pending') {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-5">
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-6"
            style={{ backgroundColor: alpha(accentColor, 0.18) }}
          >
            <AlertCircle size={40} color={accentColor} />
          </View>
          <Text className="text-2xl font-bold text-text mb-2">{translate('Transaction Submitted')}</Text>
          <Text className="text-text-muted text-center mb-6">
            {translate('The transaction was broadcast but is not confirmed yet. Check the transaction hash before sending again.')}
          </Text>
          {txHash && (
            <View className="bg-surface rounded-xl p-4 w-full mb-6">
              <Text className="text-text-muted text-sm mb-1">{translate('Transaction Hash')}</Text>
              <Text className="text-text font-mono text-xs" numberOfLines={2}>
                {txHash}
              </Text>
            </View>
          )}
          <Button variant="primary" size="lg" fullWidth accentColor={accentColor} onPress={handleClose}>
            {translate('Done')}
          </Button>
        </View>
      </View>
    )
  }
  
  if (sendState === 'error') {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-5">
          <View className="w-20 h-20 rounded-full bg-error/20 items-center justify-center mb-6">
            <AlertCircle size={40} color={colors.error} />
          </View>
          <Text className="text-2xl font-bold text-text mb-2">{translate('Transaction Failed')}</Text>
          <Text className="text-text-muted text-center mb-6">
            {error || translate('Something went wrong. Please try again.')}
          </Text>
          <View className="w-full gap-3">
            <Button variant="primary" size="lg" fullWidth accentColor={accentColor} onPress={handleTryAgain}>
              {translate('Try Again')}
            </Button>
            <Button variant="secondary" size="lg" fullWidth onPress={handleClose}>
              {translate('Cancel')}
            </Button>
          </View>
        </View>
      </View>
    )
  }
  
  if (sendState === 'sending') {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-5">
          <ActivityIndicator size="large" color={accentColor} />
          <Text className="text-xl font-semibold text-text mt-6 mb-2">{translate('Sending Transaction')}</Text>
          <Text className="text-text-muted text-center">
            {translate('Please wait while your transaction is being processed...')}
          </Text>
        </View>
      </View>
    )
  }
  
  if (sendState === 'confirming') {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <View className="flex-row items-center px-4 py-3">
          <Pressable onPress={() => setSendState('input')} className="p-2 -ml-2">
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="flex-1 text-xl font-bold text-text text-center mr-10">
            {translate('Confirm Send')}
          </Text>
        </View>
        
        <View className="flex-1 px-5 pt-6">
          <View className="items-center mb-8">
            <Text className="text-4xl font-bold text-text mb-1">{amount} EXO</Text>
            <Text className="text-text-muted">{translate('Sending to')}</Text>
          </View>
          
          <View className="bg-surface rounded-2xl p-4 mb-6">
            <Text className="text-text-muted text-sm mb-2">{translate('Recipient Address')}</Text>
            <Text className="text-text font-mono text-sm" numberOfLines={2}>
              {recipient}
            </Text>
          </View>
          
          <View className="bg-surface rounded-2xl p-4 mb-6">
            <View className="flex-row justify-between mb-2">
              <Text className="text-text-muted">{translate('Amount')}</Text>
              <Text className="text-text">{amount} EXO</Text>
            </View>
            <View className="flex-row justify-between mb-2">
              <Text className="text-text-muted">{translate('Network Fee')}</Text>
              <Text className="text-text">
                {translate('~{{fee}} {{symbol}}', {
                  ns: 'crypto',
                  fee: networkFeeLabel,
                  symbol: 'EXO',
                })}
              </Text>
            </View>
            {donationQuote && (
              <View className="flex-row justify-between mb-2">
                <Text className="text-text-muted">{translate('Contribution', { ns: 'crypto' })}</Text>
                <Text className="text-text">{donationQuote.amount} EXO</Text>
              </View>
            )}
            {donationQuote && (
              <View className="mb-2">
                <Text className="text-text-muted text-xs">{translate('Contribution Treasury', { ns: 'crypto' })}</Text>
                <Text className="text-text font-mono text-xs" numberOfLines={2}>
                  {donationQuote.treasuryAddress}
                </Text>
              </View>
            )}
            {donationQuote && (
              <Text className="text-text-muted text-xs mb-2">
                {translate('A 0.1% contribution is included, capped at $10 equivalent.', { ns: 'crypto' })}
              </Text>
            )}
            <View className="h-px bg-border my-2" />
            <View className="flex-row justify-between">
              <Text className="text-text font-semibold">{translate('Total')}</Text>
              <Text className="text-text font-semibold">
                {formatBigIntAmount((amountWei ?? 0n) + (donationQuote?.amountUnits ?? 0n) + EXO_TOTAL_NETWORK_FEE_WEI, 18, 6)} EXO
              </Text>
            </View>
          </View>
          
          <View className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-6">
            <View className="flex-row items-start gap-3">
              <AlertCircle size={20} color={colors.warning} />
              <Text className="text-warning text-sm flex-1">
                {translate('Please verify the recipient address. Transactions cannot be reversed once confirmed.')}
              </Text>
            </View>
          </View>
          
          <View className="gap-3 mt-auto mb-6">
            <Button variant="primary" size="lg" fullWidth accentColor={accentColor} onPress={handleConfirmSend}>
              {translate('Confirm & Send')}
            </Button>
            <Button variant="secondary" size="lg" fullWidth onPress={() => setSendState('input')}>
              {translate('Cancel')}
            </Button>
          </View>
        </View>
      </View>
    )
  }
  
  return (
    <KeyboardAvoidingView 
      behavior="padding"
      style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}
    >
      <View className="flex-row items-center px-4 py-3">
        <Pressable accessibilityLabel={translate('Back')} onPress={handleClose} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-text text-center mr-10">
          {translate('Send EXO')}
        </Text>
      </View>
      
      <ScrollView 
        className="flex-1 px-5"
        contentContainerStyle={{ paddingTop: 20, paddingBottom: 30 }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          className="rounded-2xl p-4 mb-6 border"
          style={{
            backgroundColor: alpha(accentColor, 0.08),
            borderColor: alpha(accentColor, 0.2),
          }}
        >
          <Text className="text-text-muted text-sm mb-1">{translate('Available Balance')}</Text>
          <Text className="text-text text-2xl font-bold">{balance} EXO</Text>
          {balanceFiatLabel ? (
            <Text className="text-text-muted text-sm mt-1">{balanceFiatLabel}</Text>
          ) : null}
        </View>
        
        <View className="mb-6">
          <Text className="text-text font-medium mb-2">{translate('Recipient Address')}</Text>
          <View className="bg-surface rounded-xl flex-row items-center">
            <TextInput
              className="flex-1 text-text p-4 font-mono"
              placeholder="EXO00..."
              placeholderTextColor={colors.textMuted}
              value={recipient}
              onChangeText={setRecipient}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable 
              onPress={() => router.push('/(main)/contact/scan-qr')}
              className="p-4"
            >
              <Scan size={20} color={colors.textTertiary} />
            </Pressable>
          </View>
          {recipient.length > 0 && !isValidExoAddress(recipient) && (
            <Text className="text-error text-sm mt-2">{translate('Invalid EXO address')}</Text>
          )}
        </View>
        
        <View className="mb-6">
          <Text className="text-text font-medium mb-2">{translate('Amount')}</Text>
          <View className="bg-surface rounded-xl flex-row items-center">
            <TextInput
              className="flex-1 text-text p-4 text-lg"
              placeholder="0.0"
              placeholderTextColor={colors.textMuted}
              value={amount}
              onChangeText={setAmount}
              inputAccessoryViewID={AMOUNT_KEYBOARD_ACCESSORY_ID}
              keyboardType="decimal-pad"
            />
            <View className="flex-row items-center gap-2 pr-4">
              <Pressable
                onPress={handleSetMax}
                className="px-3 py-1 rounded-lg"
                style={{ backgroundColor: alpha(accentColor, 0.18) }}
              >
                <Text className="text-sm font-semibold" style={{ color: accentColor }}>
                  {translate('MAX')}
                </Text>
              </Pressable>
              <Text className="text-text-muted">EXO</Text>
            </View>
          </View>
          {amountWei !== null && amountWei > 0n && !donationQuote && (
            <Text className="text-error text-sm mt-2">
              {translate('Contribution quote unavailable. Please refresh market prices and try again.', { ns: 'crypto' })}
            </Text>
          )}
          {amountWei !== null && donationQuote && amountWei + donationQuote.amountUnits + EXO_TOTAL_NETWORK_FEE_WEI > balanceWei && (
            <Text className="text-error text-sm mt-2">
              {translate('Insufficient balance for amount, contribution, and network fees.', { ns: 'crypto' })}
            </Text>
          )}
        </View>
        
        {donationQuote && (
          <DonationPreview quote={donationQuote} />
        )}
        
        <Button
          variant="primary"
          size="lg"
          fullWidth
          accentColor={accentColor}
          disabled={!canSend()}
          onPress={handleReview}
          icon={<Send size={20} color="white" />}
        >
          {translate('Review Transaction')}
        </Button>
      </ScrollView>
      <KeyboardDoneAccessory nativeID={AMOUNT_KEYBOARD_ACCESSORY_ID} />
    </KeyboardAvoidingView>
  )
}
