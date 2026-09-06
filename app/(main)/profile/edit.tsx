/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useEffect } from 'react'
import { View, Text, Pressable, Alert, ActivityIndicator } from 'react-native'
import { useRouter, type Href } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Camera } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import * as ImagePicker from 'expo-image-picker'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { Avatar } from '@/components/common'
import { Input } from '@/components/ui'
import { useWalletStore } from '@/store'
import { useSpectreStore } from '@/store/spectreStore'
import { translate } from '@/lib/i18n'
import { getIdentity } from '@/services/quantumChat'
import { normalizeOutgoingFileUri } from '@/services/media/outgoingAttachment'
import {
  ensureOwnContactProfile,
  updateOwnContactProfile,
} from '@/services/chat/contactProfile'
import { MAX_CONTACT_PROFILE_AVATAR_BYTES } from '@spectra/core-crypto'
import { useThemeColors } from '@/lib/theme'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'

function hasPhotoLibraryAccess(permission: ImagePicker.MediaLibraryPermissionResponse): boolean {
  return permission.status === 'granted' || permission.accessPrivileges === 'limited'
}

export default function EditProfileScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  useTranslation()
  
  const { wallet, updateWallet } = useWalletStore()
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  
  const [displayName, setDisplayName] = useState(wallet?.displayName || '')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  
  useEffect(() => {
    if (spectreEnabled) {
      router.replace('/(main)/profile' as Href)
      return
    }

    let cancelled = false
    const loadProfile = async () => {
      const identity = getIdentity()
      if (!identity) return
      const profile = await ensureOwnContactProfile(identity.id)
      if (!cancelled) setAvatarUrl(profile.avatarDataUri ?? null)
    }
    void loadProfile().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [router, spectreEnabled])

  const handlePickImage = async () => {
    if (spectreEnabled) {
      Alert.alert(
        translate('Spectre Mode', { ns: 'settings' }),
        translate('Profile photos cannot be changed while Spectre Mode is active.', { ns: 'profile' }),
      )
      return
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    
    if (!hasPhotoLibraryAccess(permission)) {
      Alert.alert(
        translate('Permission Required'),
        translate('Please allow access to your photo library to change your profile photo.')
      )
      return
    }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0]
      setIsUploadingPhoto(true)
      try {
        const identityId = getIdentity()?.id
        if (!identityId) throw new Error('Chat identity is not available')
        const prepared = await normalizeOutgoingFileUri({
          id: `avatar_${Date.now()}`,
          uri: asset.uri,
          fileName: asset.fileName || `avatar_${Date.now()}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
          fileSize: asset.fileSize,
        })
        let normalized = await manipulateAsync(prepared.uri, [{ resize: { width: 256, height: 256 } }], {
          base64: true,
          compress: 0.7,
          format: SaveFormat.JPEG,
        })
        if (
          !normalized.base64
          || Math.ceil(normalized.base64.length * 0.75) > MAX_CONTACT_PROFILE_AVATAR_BYTES
        ) {
          normalized = await manipulateAsync(prepared.uri, [{ resize: { width: 160, height: 160 } }], {
            base64: true,
            compress: 0.55,
            format: SaveFormat.JPEG,
          })
        }
        if (
          !normalized.base64
          || Math.ceil(normalized.base64.length * 0.75) > MAX_CONTACT_PROFILE_AVATAR_BYTES
        ) {
          throw new Error('Profile photo is too large')
        }
        const nextAvatarUrl = `data:image/jpeg;base64,${normalized.base64}`
        const profile = await updateOwnContactProfile(identityId, {
          avatarDataUri: nextAvatarUrl,
        })
        setAvatarUrl(profile.avatarDataUri ?? null)
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } catch (error) {
        if (__DEV__) console.error('Failed to save profile photo:', error)
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        Alert.alert(translate('Save Failed'), getErrorDisplayMessage(error))
      } finally {
        setIsUploadingPhoto(false)
      }
    }
  }
  
  const persistDisplayName = async () => {
    if (!wallet || spectreEnabled) return
    if (isSaving) return
    if (displayName === (wallet.displayName || '')) return
    
    setIsSaving(true)
    
    try {
      await updateWallet(wallet.id, { displayName: displayName.trim() || 'EXO User' })
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (error) {
      if (__DEV__) console.error('Failed to save profile:', error)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(translate('Save Failed'), translate('Could not save your profile. Please try again.'))
    } finally {
      setIsSaving(false)
    }
  }
  
  return (
    <View className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      <View 
        className="flex-row items-center justify-between px-4 pb-3"
        style={{ paddingTop: insets.top }}
      >
        <Pressable onPress={() => router.back()} className="p-2 -ml-2">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text className="text-xl font-bold text-text">
          {translate('Edit Profile', { ns: 'profile' })}
        </Text>
        <View className="w-10" />
      </View>
      
      <View className="px-5 gap-6">
        <View className="items-center gap-3">
          <Pressable onPress={handlePickImage} disabled={spectreEnabled || isUploadingPhoto}>
            <View className="relative">
              <Avatar
                name={displayName || wallet?.displayName || translate('User', { ns: 'profile' })}
                imageUrl={spectreEnabled ? null : avatarUrl}
                size="xl"
              />
              <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary items-center justify-center border-2 border-background">
                {isUploadingPhoto ? (
                  <ActivityIndicator size="small" color={colors.textOnPrimary} />
                ) : (
                  <Camera size={16} color={colors.textOnPrimary} />
                )}
              </View>
            </View>
          </Pressable>
          <Pressable onPress={handlePickImage} disabled={spectreEnabled || isUploadingPhoto}>
            <Text className="text-primary text-sm">
              {spectreEnabled
                ? translate('Photo disabled in Spectre Mode', { ns: 'profile' })
                : isUploadingPhoto
                ? translate('Uploading...', { ns: 'profile' })
                : translate('Change Photo', { ns: 'profile' })}
            </Text>
          </Pressable>
        </View>
        
        <View className="gap-2">
          <Input
            label={translate('Account Label', { ns: 'profile' })}
            placeholder={translate('Name this account', { ns: 'profile' })}
            value={displayName}
            onChangeText={spectreEnabled ? undefined : setDisplayName}
            onBlur={persistDisplayName}
            editable={!spectreEnabled}
          />
          <Text className="text-text-muted text-xs ml-1">
            {translate('This is a local label to help you identify this account. It is not your public chat name.', {
              ns: 'profile',
            })}
          </Text>
        </View>

      </View>
    </View>
  )
}
