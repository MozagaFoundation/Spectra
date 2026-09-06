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
  createCampaign,
  validateCampaignParams,
} from '@/services/crypto/campaignService'
import { parseDecimalToBigInt } from '@/lib/amounts'
import { hashTextToEntityId } from '@/services/crypto/contractHashes'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import {
  formatMarketEXO,
  isValidMarketEntityId,
  sanitizeMarketEntityIdInput,
} from '@/lib/markets'

function parseEXOInput(ota: string): bigint {
  return parseDecimalToBigInt(ota, 18) ?? 0n
}

const DURATION_PRESETS = [7, 14, 30, 60, 90]

export default function CreateCampaign() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { wallet } = useWalletStore()
  const colors = useThemeColors()

  const [marketId, setMarketId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [fundingGoal, setFundingGoal] = useState('')
  const [flexibleGoal, setFlexibleGoal] = useState('')
  const [durationDays, setDurationDays] = useState(30)
  const [maxPerContributor, setMaxPerContributor] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const titleBytes = new TextEncoder().encode(title)
  const titleBytesCount = titleBytes.length

  const handleCreate = () => {
    if (!wallet) return

    const goalWei = parseEXOInput(fundingGoal)
    const flexWei = parseEXOInput(flexibleGoal || '0')
    const sanitizedMarketId = sanitizeMarketEntityIdInput(marketId)
    const now = Math.floor(Date.now() / 1000)
    const startTime = now + 60
    const endTime = startTime + durationDays * 86400

    const validation = validateCampaignParams(title, goalWei, flexWei, startTime, endTime)
    if (!validation.valid) {
      Alert.alert(
        translate('Invalid', { ns: 'markets' }),
        validation.error || translate('Invalid parameters', { ns: 'markets' }),
      )
      return
    }

    if (!sanitizedMarketId) {
      Alert.alert(
        translate('Invalid', { ns: 'markets' }),
        translate('Market ID is required', { ns: 'markets' }),
      )
      return
    }

    if (!isValidMarketEntityId(sanitizedMarketId)) {
      Alert.alert(
        translate('Invalid', { ns: 'markets' }),
        translate('Enter a valid market ID', { ns: 'markets' }),
      )
      return
    }

    if (titleBytesCount > 32) {
      Alert.alert(
        translate('Invalid', { ns: 'markets' }),
        translate('Title must be 32 bytes or less', { ns: 'markets' }),
      )
      return
    }

    const descHash = hashTextToEntityId(description || 'No description')
    const maxPerWei = maxPerContributor ? parseEXOInput(maxPerContributor) : 0n

    Alert.alert(
      translate('Create Campaign', { ns: 'markets' }),
      translate('Create campaign "{{title}}" with a goal of {{goal}} EXO for {{count}} days?', {
        ns: 'markets',
        title,
        goal: formatMarketEXO(goalWei.toString(), 2),
        count: durationDays,
      }),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Create'),
          onPress: async () => {
            try {
              setIsSubmitting(true)
              toast.info(
                translate('Processing'),
                translate('Creating campaign...', { ns: 'markets' }),
              )

              const result = await createCampaign(
                wallet.privateKey, wallet.publicKey, wallet.address,
                sanitizedMarketId, title, descHash,
                goalWei, flexWei, startTime, endTime, maxPerWei,
              )

              toast.info(
                translate('Submitted'),
                translate('Waiting for confirmation...', { ns: 'markets' }),
              )
              const status = await waitForTransaction(result.txHash, 15, 2000)

              if (status.status === 'confirmed') {
                toast.success(
                  translate('Success'),
                  translate('Campaign created', { ns: 'markets' }),
                )
                router.back()
              } else if (status.status === 'failed') {
                toast.error(
                  translate('Failed'),
                  translate('Campaign creation failed', { ns: 'markets' }),
                )
              } else {
                toast.success(
                  translate('Submitted'),
                  translate('Campaign submitted, awaiting confirmation', { ns: 'markets' }),
                )
                router.back()
              }
            } catch (error: any) {
              console.error('Create campaign error:', error)
              toast.error(
                translate('Error'),
                getErrorDisplayMessage(error) || translate('Failed to create campaign', { ns: 'markets' }),
              )
            } finally {
              setIsSubmitting(false)
            }
          },
        },
      ],
    )
  }

  const goalWei = parseEXOInput(fundingGoal)
  const flexWei = parseEXOInput(flexibleGoal || '0')
  const maxPerWei = maxPerContributor ? parseEXOInput(maxPerContributor) : 0n

  if (!wallet) {
    return (
      <View className="flex-1 bg-background items-center justify-center px-6" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
        <Text className="text-text-muted text-base text-center" style={{ color: colors.textMuted }}>
          {translate('Connect wallet to create a campaign', { ns: 'markets' })}
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
            {translate('Create Campaign', { ns: 'markets' })}
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
              {translate('Market ID', { ns: 'markets' })}
            </Text>
            <TextInput
              className="bg-background rounded-xl p-3.5 text-text text-sm"
              style={{ backgroundColor: colors.backgroundSecondary, color: colors.text }}
              placeholder={translate('Enter market ID...', { ns: 'markets' })}
              placeholderTextColor={colors.textMuted}
              value={marketId}
              onChangeText={setMarketId}
              autoCapitalize="none"
            />
          </View>

          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-text-secondary text-sm font-medium" style={{ color: colors.textSecondary }}>
                {translate('Title', { ns: 'markets' })}
              </Text>
              <Text
                className="text-xs"
                style={{ color: titleBytesCount > 32 ? colors.error : colors.textMuted }}
              >
                {translate('{{count}}/32 bytes', { ns: 'markets', count: titleBytesCount })}
              </Text>
            </View>
            <TextInput
              className="bg-background rounded-xl p-3.5 text-text text-base font-semibold"
              style={{ backgroundColor: colors.backgroundSecondary, color: colors.text }}
              placeholder={translate('Campaign title...', { ns: 'markets' })}
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
              maxLength={32}
            />
          </View>

          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {translate('Description', { ns: 'markets' })}
              {' '}
              <Text className="text-text-muted" style={{ color: colors.textMuted }}>
                {translate('(hashed on-chain)', { ns: 'markets' })}
              </Text>
            </Text>
            <TextInput
              className="bg-background rounded-xl p-3.5 text-text text-sm"
              style={{ backgroundColor: colors.backgroundSecondary, color: colors.text, minHeight: 80, textAlignVertical: 'top' }}
              placeholder={translate('Describe your campaign...', { ns: 'markets' })}
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
            />
          </View>

          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {translate('Funding Goal (EXO)', { ns: 'markets' })}
            </Text>
            <TextInput
              className="bg-background rounded-xl p-3.5 text-text text-lg font-semibold"
              style={{ backgroundColor: colors.backgroundSecondary, color: colors.text }}
              placeholder="0.0"
              placeholderTextColor={colors.textMuted}
              value={fundingGoal}
              onChangeText={setFundingGoal}
              keyboardType="decimal-pad"
            />
          </View>

          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {translate('Flexible Goal (EXO)', { ns: 'markets' })}
              {' '}
              <Text className="text-text-muted" style={{ color: colors.textMuted }}>
                {translate('must be <= goal', { ns: 'markets' })}
              </Text>
            </Text>
            <TextInput
              className="bg-background rounded-xl p-3.5 text-text text-lg font-semibold"
              style={{ backgroundColor: colors.backgroundSecondary, color: colors.text }}
              placeholder="0.0"
              placeholderTextColor={colors.textMuted}
              value={flexibleGoal}
              onChangeText={setFlexibleGoal}
              keyboardType="decimal-pad"
            />
            {flexWei > goalWei && goalWei > 0n && (
              <Text className="text-xs mt-1" style={{ color: colors.error }}>
                {translate('Flexible goal exceeds funding goal', { ns: 'markets' })}
              </Text>
            )}
          </View>

          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {translate('Duration', { ns: 'markets' })}
            </Text>
            <View className="flex-row gap-2">
              {DURATION_PRESETS.map((days) => (
                <Pressable
                  key={days}
                  onPress={() => setDurationDays(days)}
                  className="flex-1 py-2.5 rounded-xl items-center"
                  style={{ backgroundColor: days === durationDays ? colors.primary : colors.backgroundSecondary }}
                >
                  <Text
                    className="font-semibold text-sm"
                    style={{ color: days === durationDays ? '#fff' : colors.textSecondary }}
                  >{translate('duration.days', { count: days })}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View className="bg-surface rounded-2xl p-4 mb-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-text-secondary text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {translate('Max Per Contributor (EXO)', { ns: 'markets' })}
              {' '}
              <Text className="text-text-muted" style={{ color: colors.textMuted }}>
                {translate('(0 = unlimited)', { ns: 'markets' })}
              </Text>
            </Text>
            <TextInput
              className="bg-background rounded-xl p-3.5 text-text text-lg font-semibold"
              style={{ backgroundColor: colors.backgroundSecondary, color: colors.text }}
              placeholder={translate('0 (unlimited)', { ns: 'markets' })}
              placeholderTextColor={colors.textMuted}
              value={maxPerContributor}
              onChangeText={setMaxPerContributor}
              keyboardType="decimal-pad"
            />
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
                {translate('Goal', { ns: 'markets' })}
              </Text>
              <Text className="text-text text-sm font-medium" style={{ color: colors.text }}>{formatMarketEXO(goalWei.toString(), 2)} EXO</Text>
            </View>
            {flexWei > 0n && (
              <View className="flex-row justify-between mb-2">
                <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
                  {translate('Flexible Goal', { ns: 'markets' })}
                </Text>
                <Text className="text-text text-sm font-medium" style={{ color: colors.text }}>{formatMarketEXO(flexWei.toString(), 2)} EXO</Text>
              </View>
            )}
            <View className="flex-row justify-between mb-2">
              <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
                {translate('Duration', { ns: 'markets' })}
              </Text>
              <Text className="text-text text-sm font-medium" style={{ color: colors.text }}>
                {translate('{{count}} days', { ns: 'markets', count: durationDays })}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-text-muted text-sm" style={{ color: colors.textMuted }}>
                {translate('Max/Contributor', { ns: 'markets' })}
              </Text>
              <Text className="text-text text-sm font-medium" style={{ color: colors.text }}>
                {maxPerWei > 0n
                  ? `${formatMarketEXO(maxPerWei.toString(), 2)} EXO`
                  : translate('Unlimited', { ns: 'markets' })}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={handleCreate}
            disabled={isSubmitting || goalWei <= 0n || !title.trim() || !marketId.trim()}
            className="bg-primary py-4 rounded-xl items-center active:opacity-80 mb-4"
            style={{ backgroundColor: colors.primary, opacity: isSubmitting || goalWei <= 0n || !title.trim() || !marketId.trim() ? 0.5 : 1 }}
          >
            {isSubmitting ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text className="text-onPrimary font-bold text-base">
                {translate('Create Campaign', { ns: 'markets' })}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}
