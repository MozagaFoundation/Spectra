/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState } from 'react'
import { View, Text, Pressable, ScrollView, Image, Alert, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Check, ChevronDown, Type, ImageIcon, Upload, X, Sun, Moon, Globe } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system'
import { useUIStore } from '@/store'
import { MESSAGE_FONT_SIZES, type MessageFontSize } from '@/lib/constants'
import { SUPPORTED_LANGUAGES } from '@/lib/i18n/languages'
import { PRESET_BACKGROUNDS } from '@/lib/chatBackgrounds'
import { translate } from '@/lib/i18n'
import { useIsSpectreThemeActive, useThemeColors } from '@/lib/theme'
import { LanguageSelectorModal } from '@/components/ui'
import {
  CHAT_BACKGROUND_DIRECTORY,
  ensureChatBackgroundDirectory,
} from '@/services/ui/chatBackgroundStorage'

const FONT_SIZE_OPTIONS: {
  value: MessageFontSize
  label: string
  description: string
  isDefault?: boolean
}[] = [
  { value: 'small', label: 'Small', description: '12pt' },
  { value: 'medium', label: 'Medium', description: '14pt' },
  { value: 'large', label: 'Large', description: '16pt', isDefault: true },
  { value: 'extra_large', label: 'Extra Large', description: '18pt' },
]

export default function AppearanceSettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  useTranslation()
  const spectreThemeActive = useIsSpectreThemeActive()
  const [isUploading, setIsUploading] = useState(false)
  const [langModalVisible, setLangModalVisible] = useState(false)
  
  const { messageFontSize, setMessageFontSize, chatBackground, setChatBackground, isDarkMode, setTheme, appLanguage, setAppLanguageChoice } = useUIStore()
  const currentLangOption = SUPPORTED_LANGUAGES.find((l) => l.code === appLanguage) ?? SUPPORTED_LANGUAGES[0]
  
  const handleFontSizeChange = async (size: MessageFontSize) => {
    await Haptics.selectionAsync()
    await setMessageFontSize(size)
  }

  const handleThemeChange = async (isDark: boolean) => {
    await Haptics.selectionAsync()
    await setTheme(isDark)
  }

  const handleSelectPreset = async (id: string) => {
    await Haptics.selectionAsync()
    await setChatBackground({ type: 'preset', id })
  }

  const handleSelectNone = async () => {
    await Haptics.selectionAsync()
    await setChatBackground({ type: 'none' })
  }

  const handlePickCustomImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(
        translate('Permission Required', { ns: 'settings' }),
        translate('Please allow access to your photo library to set a custom background.', {
          ns: 'settings',
        }),
      )
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    })

    if (result.canceled || !result.assets[0]) return

    setIsUploading(true)
    try {
      await ensureChatBackgroundDirectory()
      const asset = result.assets[0]
      const ext = (asset.mimeType || 'image/jpeg').split('/')[1] || 'jpg'
      const localPath = `${CHAT_BACKGROUND_DIRECTORY}custom_bg_${Date.now()}.${ext}`

      await FileSystem.copyAsync({ from: asset.uri, to: localPath })
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      await setChatBackground({ type: 'custom', uri: localPath })
    } catch {
      Alert.alert(
        translate('Error'),
        translate('Failed to save the image. Please try again.', { ns: 'settings' }),
      )
    } finally {
      setIsUploading(false)
    }
  }

  const handleRemoveCustom = async () => {
    if (chatBackground.type !== 'custom') return
    try {
      const info = await FileSystem.getInfoAsync(chatBackground.uri)
      if (info.exists) await FileSystem.deleteAsync(chatBackground.uri, { idempotent: true })
    } catch { /* best effort */ }
    await setChatBackground({ type: 'none' })
  }

  const renderPreview = () => {
    const previewMessages = (
      <View className="gap-3 p-4">
        <View className="self-start max-w-[80%]">
          <View className="bg-message-received px-4 py-3 rounded-2xl rounded-bl-md">
            <Text className="text-text" style={{ fontSize: MESSAGE_FONT_SIZES[messageFontSize] }}>
              {translate('Hello! How are you?', { ns: 'settings' })}
            </Text>
          </View>
        </View>
        <View className="self-end max-w-[80%]">
          <View className="bg-message-sent px-4 py-3 rounded-2xl rounded-br-md">
            <Text
              style={{
                color: colors.textOnPrimary,
                fontSize: MESSAGE_FONT_SIZES[messageFontSize],
              }}
            >
              {translate('I\'m doing great, thanks!', { ns: 'settings' })}
            </Text>
          </View>
        </View>
      </View>
    )

    if (spectreThemeActive) {
      return (
        <View className="bg-surface rounded-2xl overflow-hidden">
          {previewMessages}
        </View>
      )
    }

    if (chatBackground.type === 'preset') {
      const preset = PRESET_BACKGROUNDS.find(p => p.id === chatBackground.id)
      if (preset) {
        return (
          <LinearGradient
            colors={preset.colors}
            start={preset.start || { x: 0, y: 0 }}
            end={preset.end || { x: 1, y: 1 }}
            className="rounded-2xl overflow-hidden"
          >
            {previewMessages}
          </LinearGradient>
        )
      }
    }

    if (chatBackground.type === 'custom') {
      return (
        <View className="rounded-2xl overflow-hidden">
          <Image
            source={{ uri: chatBackground.uri }}
            className="absolute inset-0 w-full h-full"
            resizeMode="cover"
          />
          <View className="absolute inset-0 bg-black/30" />
          {previewMessages}
        </View>
      )
    }

    return (
      <View className="bg-surface rounded-2xl overflow-hidden">
        {previewMessages}
      </View>
    )
  }
  
  return (
    <View className="flex-1 bg-background">
      <View 
        className="flex-row items-center px-4 pb-3 border-b border-border"
        style={{ paddingTop: insets.top }}
      >
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="text-xl font-bold text-text ml-2">
          {translate('Appearance', { ns: 'settings' })}
        </Text>
      </View>
      
      <ScrollView className="flex-1 px-5 py-4" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="gap-3 mb-8">
          <View className="flex-row items-center gap-2 mb-2">
            {spectreThemeActive || isDarkMode ? (
              <Moon size={20} color={colors.primary} />
            ) : (
              <Sun size={20} color={colors.primary} />
            )}
            <Text className="text-text-secondary font-medium">
              {translate('Theme', { ns: 'settings' })}
            </Text>
          </View>

          {spectreThemeActive ? (
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <Text className="text-text font-medium">
                {translate('Spectre enforces monochrome dark', { ns: 'settings' })}
              </Text>
              <Text className="text-text-muted text-sm mt-1">
                {translate('Your saved light or dark preference is preserved and will return when Spectre Mode is turned off.', {
                  ns: 'settings',
                })}
              </Text>
            </View>
          ) : (
            <View className="bg-surface rounded-2xl overflow-hidden">
              <Pressable
                onPress={() => handleThemeChange(false)}
                className="flex-row items-center justify-between p-4 active:bg-surface-hover border-b border-border"
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center"
                    style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' }}
                  >
                    <Sun size={20} color="#475569" />
                  </View>
                  <View>
                    <Text className="text-text font-medium">
                      {translate('Light', { ns: 'settings' })}
                    </Text>
                    <Text className="text-text-muted text-sm">
                      {translate('Clean, bright interface', { ns: 'settings' })}
                    </Text>
                  </View>
                </View>
                {!isDarkMode && <Check size={20} color={colors.primary} />}
              </Pressable>
              <Pressable
                onPress={() => handleThemeChange(true)}
                className="flex-row items-center justify-between p-4 active:bg-surface-hover"
              >
                <View className="flex-row items-center gap-3">
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center"
                    style={{ backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a' }}
                  >
                    <Moon size={20} color="#a1a1aa" />
                  </View>
                  <View>
                    <Text className="text-text font-medium">
                      {translate('Dark', { ns: 'settings' })}
                    </Text>
                    <Text className="text-text-muted text-sm">
                      {translate('Easy on the eyes', { ns: 'settings' })}
                    </Text>
                  </View>
                </View>
                {isDarkMode && <Check size={20} color={colors.primary} />}
              </Pressable>
            </View>
          )}
        </View>

        <View className="gap-3 mb-8">
          <View className="flex-row items-center gap-2 mb-2">
            <Globe size={20} color={colors.primary} />
            <Text className="text-text-secondary font-medium">
              {translate('Language', { ns: 'settings' })}
            </Text>
          </View>

          <Pressable
            onPress={() => setLangModalVisible(true)}
            className="bg-surface rounded-2xl flex-row items-center justify-between p-4 active:bg-surface-hover"
          >
            <View className="flex-row items-center gap-3">
              <Text style={{ fontSize: 24 }}>{currentLangOption.flag}</Text>
              <View>
                <Text className="text-text font-medium">{currentLangOption.nativeName}</Text>
                <Text className="text-text-muted text-sm">
                  {translate('App display language', { ns: 'settings' })}
                </Text>
              </View>
            </View>
            <ChevronDown size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View className="gap-3 mb-8">
          <View className="flex-row items-center gap-2 mb-2">
            <Type size={20} color={colors.primary} />
            <Text className="text-text-secondary font-medium">
              {translate('Message Font Size', { ns: 'settings' })}
            </Text>
          </View>
          
          <View className="bg-surface rounded-2xl overflow-hidden">
            {FONT_SIZE_OPTIONS.map((option, index) => (
              <Pressable
                key={option.value}
                onPress={() => handleFontSizeChange(option.value)}
                className={`flex-row items-center justify-between p-4 active:bg-surface-hover ${
                  index < FONT_SIZE_OPTIONS.length - 1 ? 'border-b border-border' : ''
                }`}
              >
                <View className="flex-1">
                  <Text 
                    className="text-text font-medium"
                    style={{ fontSize: MESSAGE_FONT_SIZES[option.value] }}
                  >
                    {translate(option.label, { ns: 'settings' })}
                  </Text>
                  <Text className="text-text-muted text-sm">
                    {option.isDefault
                      ? `${translate(option.description, { ns: 'settings' })} (${translate('Default')})`
                      : translate(option.description, { ns: 'settings' })}
                  </Text>
                </View>
                {messageFontSize === option.value && (
                  <Check size={20} color={colors.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </View>

        <View className="gap-3 mb-8">
          <View className="flex-row items-center gap-2 mb-2">
            <ImageIcon size={20} color={colors.primary} />
            <Text className="text-text-secondary font-medium">
              {translate('Chat Background', { ns: 'settings' })}
            </Text>
          </View>

          {spectreThemeActive ? (
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <Text className="text-text font-medium">
                {translate('Chat backgrounds are hidden in Spectre', { ns: 'settings' })}
              </Text>
              <Text className="text-text-muted text-sm mt-1">
                {translate('Saved gradients and custom images remain on the device, but Spectre forces chat screens to stay monochrome until it is disabled.', {
                  ns: 'settings',
                })}
              </Text>
            </View>
          ) : (
            <>
              <Pressable
                onPress={handleSelectNone}
                className="bg-surface rounded-2xl p-4 flex-row items-center justify-between active:bg-surface-hover"
              >
                <View className="flex-row items-center gap-3">
                  <View className="w-12 h-12 rounded-xl bg-background border border-border items-center justify-center">
                    <X size={18} color={colors.textMuted} />
                  </View>
                  <Text className="text-text font-medium">
                    {translate('Default (None)', { ns: 'settings' })}
                  </Text>
                </View>
                {chatBackground.type === 'none' && <Check size={20} color={colors.primary} />}
              </Pressable>

              <Text className="text-text-muted text-sm mt-2">
                {translate('Gradients', { ns: 'settings' })}
              </Text>
              <View className="flex-row flex-wrap gap-3">
                {PRESET_BACKGROUNDS.map((preset) => {
                  const selected = chatBackground.type === 'preset' && chatBackground.id === preset.id
                  return (
                    <Pressable
                      key={preset.id}
                      onPress={() => handleSelectPreset(preset.id)}
                      className="items-center"
                      style={{ width: '22%' }}
                    >
                      <View
                        className="rounded-xl overflow-hidden border-2 w-full"
                        style={{
                          aspectRatio: 0.7,
                          borderColor: selected ? colors.primary : 'transparent',
                        }}
                      >
                        <LinearGradient
                          colors={preset.colors}
                          start={preset.start || { x: 0, y: 0 }}
                          end={preset.end || { x: 1, y: 1 }}
                          style={{ flex: 1 }}
                        />
                        {selected && (
                          <View className="absolute inset-0 items-center justify-center">
                            <View className="bg-primary rounded-full p-1">
                              <Check size={14} color={colors.textOnPrimary} />
                            </View>
                          </View>
                        )}
                      </View>
                      <Text className="text-text-muted text-xs mt-1">
                        {translate(preset.label, { ns: 'settings' })}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              <Text className="text-text-muted text-sm mt-4">
                {translate('Custom Image', { ns: 'settings' })}
              </Text>
              <View className="flex-row gap-3 items-center">
                <Pressable
                  onPress={handlePickCustomImage}
                  disabled={isUploading}
                  className="bg-surface rounded-xl overflow-hidden border-2 border-dashed border-border active:border-primary items-center justify-center"
                  style={{ width: 80, aspectRatio: 0.7 }}
                >
                  {isUploading ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Upload size={22} color={colors.textMuted} />
                  )}
                </Pressable>

                {chatBackground.type === 'custom' && (
                  <View className="flex-row items-center gap-3">
                    <View
                      className="rounded-xl overflow-hidden border-2 border-primary"
                      style={{ width: 80, aspectRatio: 0.7 }}
                    >
                      <Image
                        source={{ uri: chatBackground.uri }}
                        style={{ flex: 1 }}
                        resizeMode="cover"
                      />
                      <View className="absolute inset-0 items-center justify-center">
                        <View className="bg-primary rounded-full p-1">
                          <Check size={14} color={colors.textOnPrimary} />
                        </View>
                      </View>
                    </View>
                    <Pressable onPress={handleRemoveCustom} className="p-2">
                      <X size={18} color={colors.error} />
                    </Pressable>
                  </View>
                )}
              </View>
            </>
          )}
        </View>
          
        <View>
          <Text className="text-text-secondary font-medium mb-3">
            {translate('Preview', { ns: 'settings' })}
          </Text>
          {renderPreview()}
        </View>
      </ScrollView>

      <LanguageSelectorModal
        visible={langModalVisible}
        onClose={() => setLangModalVisible(false)}
        selectedLanguage={appLanguage}
        onSelect={(lang) => setAppLanguageChoice(lang)}
        title={translate('Language', { ns: 'settings' })}
      />
    </View>
  )
}
