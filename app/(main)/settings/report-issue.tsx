/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useMemo, useState, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { KeyboardAvoidingView } from '@/components/ui/KeyboardAvoidingView'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronDown,
  Bug,
  Lightbulb,
  ShieldAlert,
  HelpCircle,
  CheckCircle,
  Info,
  ImagePlus,
  X,
} from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { Card } from '@/components/ui'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { useAuthStore } from '@/store'
import { getRuntimeAppVersion } from '@/lib/appMetadata'
import {
  attachSupportImages,
  submitSupportTicket,
  uploadSupportImage,
  collectDeviceInfo,
} from '@/services/backend/support'
import type { SupportTicket } from '@/services/backend/support'

const CATEGORIES: {
  value: SupportTicket['category']
  label: string
  icon: React.ComponentType<{ size: number; color: string }>
}[] = [
  { value: 'bug', label: 'Bug Report', icon: Bug },
  { value: 'feature_request', label: 'Feature Request', icon: Lightbulb },
  { value: 'security_concern', label: 'Security Concern', icon: ShieldAlert },
  { value: 'other', label: 'Other', icon: HelpCircle },
]

const MIN_DESCRIPTION_LENGTH = 10
const MAX_DESCRIPTION_LENGTH = 2000
const MAX_IMAGES = 3

interface SelectedImage {
  uri: string
  mimeType: string
}

export default function ReportIssueScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  useTranslation()
  const { exoAddress } = useAuthStore()
  const descriptionRef = useRef<TextInput>(null)
  const appVersion = getRuntimeAppVersion()

  const [category, setCategory] = useState<SupportTicket['category'] | null>(null)
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false)
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<SelectedImage[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const deviceInfo = useMemo(() => collectDeviceInfo(), [])
  const descriptionTrimmed = description.trim()
  const canSubmit =
    category !== null &&
    descriptionTrimmed.length >= MIN_DESCRIPTION_LENGTH &&
    !submitting

  const selectedCategory = CATEGORIES.find((c) => c.value === category)

  const handlePickImage = async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert(translate('Limit Reached'), translate('You can attach up to {{count}} images.', { count: MAX_IMAGES }))
      return
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(
        translate('Permission Required'),
        translate('Please allow access to your photo library to attach screenshots.'),
      )
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.7,
    })

    if (!result.canceled && result.assets.length > 0) {
      const newImages = result.assets
        .slice(0, MAX_IMAGES - images.length)
        .map((asset) => ({
          uri: asset.uri,
          mimeType: asset.mimeType || 'image/jpeg',
        }))
      setImages((prev) => [...prev, ...newImages].slice(0, MAX_IMAGES))
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
  }

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  const handleSubmit = async () => {
    if (!canSubmit || !exoAddress) return

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setSubmitting(true)

    try {
      const { data: ticket, error: ticketError } = await submitSupportTicket(
        exoAddress,
        category!,
        descriptionTrimmed,
        [],
      )
      if (ticketError || !ticket) {
        throw ticketError
          ?? new Error(translate('Could not submit your report. Please try again later.'))
      }

      const uploadedUrls: string[] = []
      for (const img of images) {
        const { url, error } = await uploadSupportImage(ticket.id, img.uri, img.mimeType)
        if (error || !url) throw error ?? new Error(translate('Upload returned no URL'))
        uploadedUrls.push(url)
      }

      if (uploadedUrls.length > 0) {
        const { error } = await attachSupportImages(ticket.id, uploadedUrls)
        if (error) throw error
      }

      setSubmitting(false)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setSubmitted(true)
      setTimeout(() => router.back(), 2000)
    } catch {
      setSubmitting(false)
      Alert.alert(translate('Submission Failed'), translate('Could not submit your report. Please try again later.'), [
        { text: translate('OK') },
      ])
    }
  }

  if (submitted) {
    return (
      <View
        className="flex-1 bg-background items-center justify-center px-8"
        style={{ backgroundColor: colors.background }}
      >
        <View
          className="w-16 h-16 rounded-full items-center justify-center mb-5"
          style={{ backgroundColor: colors.success + '20' }}
        >
          <CheckCircle size={32} color={colors.success} />
        </View>
        <Text className="text-text text-xl font-bold text-center mb-2">{translate('Thank You')}</Text>
        <Text className="text-text-secondary text-center leading-5">
          {translate('Your report has been submitted.')}
        </Text>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      <View
        className="flex-row items-center px-4 py-3"
        style={{ paddingTop: insets.top }}
      >
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-text text-center mr-10">
          {translate('Report an Issue')}
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-5">
            <Text className="text-text-secondary text-sm font-medium ml-1 mb-2">{translate('Category')}</Text>
            <Pressable
              onPress={() => setCategoryPickerOpen((p) => !p)}
              className="active:opacity-70"
            >
              <Card className="p-4">
                <View className="flex-row items-center justify-between">
                  {selectedCategory ? (
                    <View className="flex-row items-center gap-3">
                      <selectedCategory.icon size={20} color={colors.primary} />
                      <Text className="text-text font-medium">{translate(selectedCategory.label)}</Text>
                    </View>
                  ) : (
                    <Text className="text-text-muted">{translate('Select a category')}</Text>
                  )}
                  <ChevronDown
                    size={18}
                    color={colors.textMuted}
                    style={{
                      transform: [{ rotate: categoryPickerOpen ? '180deg' : '0deg' }],
                    }}
                  />
                </View>
              </Card>
            </Pressable>

            {categoryPickerOpen && (
              <Card className="mt-2 overflow-hidden">
                {CATEGORIES.map((cat, idx) => {
                  const Icon = cat.icon
                  const isSelected = category === cat.value
                  return (
                    <Pressable
                      key={cat.value}
                      onPress={() => {
                        setCategory(cat.value)
                        setCategoryPickerOpen(false)
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                      }}
                      className="active:opacity-70"
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        backgroundColor: isSelected ? colors.primary + '12' : 'transparent',
                        borderTopWidth: idx > 0 ? 1 : 0,
                        borderTopColor: colors.border,
                      }}
                    >
                      <Icon size={18} color={isSelected ? colors.primary : colors.textMuted} />
                      <Text
                        style={{
                          color: isSelected ? colors.primary : colors.text,
                          fontWeight: isSelected ? '600' : '400',
                        }}
                      >
                        {translate(cat.label)}
                      </Text>
                    </Pressable>
                  )
                })}
              </Card>
            )}
          </View>

          <View className="mb-5">
            <Text className="text-text-secondary text-sm font-medium ml-1 mb-2">{translate('Description')}</Text>
            <Card className="p-4">
              <TextInput
                ref={descriptionRef}
                value={description}
                onChangeText={(text) => setDescription(text.slice(0, MAX_DESCRIPTION_LENGTH))}
                placeholder={translate('Describe the issue in detail...')}
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                className="text-text"
                style={{ minHeight: 120, lineHeight: 20 }}
                autoCorrect
              />
              <Text className="text-text-muted text-xs text-right mt-2">
                {descriptionTrimmed.length}/{MAX_DESCRIPTION_LENGTH}
              </Text>
            </Card>
            {descriptionTrimmed.length > 0 && descriptionTrimmed.length < MIN_DESCRIPTION_LENGTH && (
              <Text className="text-error text-xs ml-1 mt-1">
                {translate('Please provide at least {{count}} characters', { count: MIN_DESCRIPTION_LENGTH })}
              </Text>
            )}
          </View>

          <View className="mb-5">
            <Text className="text-text-secondary text-sm font-medium ml-1 mb-2">
              {translate('Screenshots')}{' '}
              <Text className="text-text-muted font-normal">
                {translate('(optional, up to {{count}})', { count: MAX_IMAGES })}
              </Text>
            </Text>

            <View className="flex-row gap-3 flex-wrap">
              {images.map((img, idx) => (
                <View
                  key={img.uri}
                  className="rounded-xl overflow-hidden"
                  style={{ width: 96, height: 96 }}
                >
                  <Image
                    source={{ uri: img.uri }}
                    style={{ width: 96, height: 96 }}
                    contentFit="cover"
                  />
                  <Pressable
                    onPress={() => handleRemoveImage(idx)}
                    className="absolute top-1 right-1 rounded-full items-center justify-center"
                    style={{
                      width: 24,
                      height: 24,
                      backgroundColor: 'rgba(0,0,0,0.6)',
                    }}
                  >
                    <X size={14} color="#fff" />
                  </Pressable>
                </View>
              ))}

              {images.length < MAX_IMAGES && (
                <Pressable
                  onPress={handlePickImage}
                  className="rounded-xl items-center justify-center active:opacity-70"
                  style={{
                    width: 96,
                    height: 96,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderStyle: 'dashed',
                  }}
                >
                  <ImagePlus size={24} color={colors.textMuted} />
                  <Text className="text-text-muted text-xs mt-1">{translate('Add')}</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View className="mb-6">
            <Text className="text-text-secondary text-sm font-medium ml-1 mb-2">
              {translate('Device Information')}
            </Text>
            <Card className="p-4 gap-2">
              <View className="flex-row items-center gap-2 mb-1">
                <Info size={14} color={colors.textMuted} />
                <Text className="text-text-muted text-xs">
                  {translate('Automatically attached to your report')}
                </Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-text-secondary text-sm">{translate('App Version')}</Text>
                <Text className="text-text text-sm font-mono">{appVersion}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-text-secondary text-sm">{translate('Operating System')}</Text>
                <Text className="text-text text-sm font-mono">{deviceInfo.os}</Text>
              </View>
              <View className="flex-row justify-between">
                <Text className="text-text-secondary text-sm">{translate('Device')}</Text>
                <Text className="text-text text-sm font-mono">{deviceInfo.device_model}</Text>
              </View>
            </Card>
          </View>

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit}
            className="rounded-xl py-4 items-center active:opacity-80"
            style={{
              backgroundColor: canSubmit ? colors.primary : colors.primary + '40',
            }}
          >
            {submitting ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
                  {images.length > 0 ? translate('Uploading...') : translate('Submitting...')}
                </Text>
              </View>
            ) : (
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
                {translate('Submit Report')}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
