/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Linking, View, Text, Pressable, StyleSheet } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { X, FlashlightOff, Flashlight } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Button } from '@/components/ui'
import { translate } from '@/lib/i18n'
import { isSameAccountStorageScope } from '@/lib/accountScope'
import { useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useWalletStore } from '@/store/walletStore'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import type { ContactInvite } from '@/lib/contactInvite'
import { parseContactShareTarget } from '@/lib/contactShareLink'
import { findReusableStartChatContact, startChatRoute } from '@/lib/startChatContact'
import {
  acceptContactIdentityReplacement,
  activateChatPersonaByAddress,
  addContactByAddress,
  addContactByInvite,
  type ContactIdentityReplacement,
} from '@/services/chat'

export default function ScanQRScreen() {
  const router = useGuardedRouter()
  const { local, intent } = useLocalSearchParams<{ local?: string; intent?: 'add-contact' | 'start-chat' }>()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const activeWallet = useWalletStore((state) => state.wallet)
  const exoAddress = useAuthStore((state) => state.exoAddress)
  
  const [permission, requestPermission] = useCameraPermissions()
  const [scanned, setScanned] = useState(false)
  const [isStartingChat, setIsStartingChat] = useState(false)
  const [torch, setTorch] = useState(false)
  const cancelledRef = useRef(false)
  const scannedRef = useRef(false)
  const navigatedRef = useRef(false)

  useEffect(() => () => {
    cancelledRef.current = true
  }, [])

  const isActive = useCallback(() => !cancelledRef.current && !navigatedRef.current, [])

  const resetScan = useCallback(() => {
    scannedRef.current = false
    setScanned(false)
  }, [])

  const openStartedChat = useCallback(async (address: string, localWalletAddress?: string) => {
    if (!isActive()) return
    navigatedRef.current = true
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    if (cancelledRef.current) return
    router.replace(startChatRoute(address, localWalletAddress))
  }, [isActive, router])

  const findExistingStartChatContact = useCallback((
    identityId?: string,
    walletAddress?: string,
  ) => {
    const targetLocalWalletAddress = local || activeWallet?.address || exoAddress || undefined
    return findReusableStartChatContact(useChatStore.getState().contacts, {
      localWalletAddress: targetLocalWalletAddress,
      identityId,
      walletAddress,
    })
  }, [activeWallet?.address, exoAddress, local])

  const routeToAddContact = async (scannedInvite: string) => {
    if (!isActive()) return
    navigatedRef.current = true
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    if (cancelledRef.current) return
    router.replace({
      pathname: '/(main)/contact/add',
      params: { scannedInvite, ...(local ? { local } : {}) },
    })
  }

  const routeToStartedChat = async (invite: ContactInvite) => {
    const targetLocalWalletAddress = local || activeWallet?.address || exoAddress || undefined
    const existingContact = invite.kind === 'direct'
      ? findExistingStartChatContact(invite.identityId)
      : undefined

    if (existingContact) {
      await openStartedChat(
        existingContact.walletAddress || existingContact.identityId,
        existingContact.localWalletAddress || targetLocalWalletAddress,
      )
      return
    }

    setIsStartingChat(true)
    try {
      if (!isActive()) return
      if (targetLocalWalletAddress && !isSameAccountStorageScope(activeWallet?.address, targetLocalWalletAddress)) {
        await activateChatPersonaByAddress(targetLocalWalletAddress)
      }
      if (!isActive()) return

      const result = await addContactByInvite(invite)
      if (!isActive()) return
      if (!result.success || !result.identityId) {
        if (result.identityReplacement) {
          promptIdentityReplacement(result.identityReplacement, targetLocalWalletAddress)
          return
        }
        const fallbackContact = findExistingStartChatContact(
          result.identityId || (invite.kind === 'direct' ? invite.identityId : undefined),
        )
        if (fallbackContact) {
          await openStartedChat(
            fallbackContact.walletAddress || fallbackContact.identityId,
            fallbackContact.localWalletAddress || targetLocalWalletAddress,
          )
          return
        }
        throw new Error(result.error || translate('Failed to add contact', { ns: 'contacts' }))
      }

      await openStartedChat(result.identityId, targetLocalWalletAddress)
    } catch (error) {
      if (!isActive()) return
      const fallbackContact = findExistingStartChatContact(
        invite.kind === 'direct' ? invite.identityId : undefined,
      )
      if (fallbackContact) {
        await openStartedChat(
          fallbackContact.walletAddress || fallbackContact.identityId,
          fallbackContact.localWalletAddress || targetLocalWalletAddress,
        )
        return
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      if (!isActive()) return
      Alert.alert(
        translate('Unable to start chat', { ns: 'chat' }),
        getErrorDisplayMessage(error),
      )
      resetScan()
    } finally {
      if (!cancelledRef.current) {
        setIsStartingChat(false)
      }
    }
  }

  const routeToStartedChatFromAddress = async (walletAddress: string) => {
    const targetLocalWalletAddress = local || activeWallet?.address || exoAddress || undefined
    const existingContact = findExistingStartChatContact(undefined, walletAddress)
    if (existingContact) {
      await openStartedChat(
        existingContact.walletAddress || existingContact.identityId,
        existingContact.localWalletAddress || targetLocalWalletAddress,
      )
      return
    }

    setIsStartingChat(true)
    try {
      if (!isActive()) return
      if (targetLocalWalletAddress && !isSameAccountStorageScope(activeWallet?.address, targetLocalWalletAddress)) {
        await activateChatPersonaByAddress(targetLocalWalletAddress)
      }
      if (!isActive()) return
      const result = await addContactByAddress(walletAddress)
      if (!isActive()) return
      if (!result.success || !result.identityId) {
        if (result.identityReplacement) {
          promptIdentityReplacement(result.identityReplacement, targetLocalWalletAddress)
          return
        }
        const fallbackContact = findExistingStartChatContact(result.identityId, walletAddress)
        if (fallbackContact) {
          await openStartedChat(
            fallbackContact.walletAddress || fallbackContact.identityId,
            fallbackContact.localWalletAddress || targetLocalWalletAddress,
          )
          return
        }
        throw new Error(result.error || translate('Failed to add contact', { ns: 'contacts' }))
      }
      await openStartedChat(result.identityId, targetLocalWalletAddress)
    } catch (error) {
      if (!isActive()) return
      const fallbackContact = findExistingStartChatContact(undefined, walletAddress)
      if (fallbackContact) {
        await openStartedChat(
          fallbackContact.walletAddress || fallbackContact.identityId,
          fallbackContact.localWalletAddress || targetLocalWalletAddress,
        )
        return
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      if (!isActive()) return
      Alert.alert(
        translate('Unable to start chat', { ns: 'chat' }),
        getErrorDisplayMessage(error),
      )
      resetScan()
    } finally {
      if (!cancelledRef.current) {
        setIsStartingChat(false)
      }
    }
  }

  function promptIdentityReplacement(
    replacement: ContactIdentityReplacement,
    targetLocalWalletAddress?: string,
  ) {
    if (!isActive()) return
    Alert.alert(
      translate('Chat identity changed', { ns: 'contacts' }),
      `${translate(
        'This wallet is valid, but it now advertises a new chat identity. This can happen after account import or recovery.',
        { ns: 'contacts' },
      )}\n\n${translate(
        'Compare the safety number out of band before replacing the saved contact identity.',
        { ns: 'contacts' },
      )}\n\n${replacement.safetyNumber.numeric.match(/.{1,5}/g)?.join(' ') || replacement.safetyNumber.numeric}`,
      [
        {
          text: translate('Cancel'),
          style: 'cancel',
          onPress: () => {
            if (isActive()) resetScan()
          },
        },
        {
          text: translate('Replace after verification', { ns: 'contacts' }),
          onPress: async () => {
            if (!isActive()) return
            setIsStartingChat(true)
            try {
              const result = await acceptContactIdentityReplacement(replacement)
              if (!isActive()) return
              if (!result.success || !result.identityId) {
                throw new Error(result.error || translate('Failed to replace contact identity', { ns: 'contacts' }))
              }
              await openStartedChat(result.identityId, targetLocalWalletAddress)
            } catch (error) {
              if (!isActive()) return
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
              if (!isActive()) return
              Alert.alert(
                translate('Unable to start chat', { ns: 'chat' }),
                getErrorDisplayMessage(error),
              )
              resetScan()
            } finally {
              if (!cancelledRef.current) {
                setIsStartingChat(false)
              }
            }
          },
        },
      ],
    )
  }
  
  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scannedRef.current) return
    scannedRef.current = true
    setScanned(true)

    const target = parseContactShareTarget(data)
    if (!target) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      if (!isActive()) return
      Alert.alert(
        translate('Invalid contact invitation', { ns: 'contacts' }),
        translate('Scan a Spectra QR code or EXO address shared by the person you want to add.', {
          ns: 'contacts',
        }),
      )
      resetScan()
      return
    }

    if (target.kind === 'address') {
      if (intent === 'start-chat') {
        await routeToStartedChatFromAddress(target.walletAddress)
      } else {
        await routeToAddContact(target.walletAddress)
      }
      return
    }

    if (intent === 'start-chat') {
      await routeToStartedChat(target.invite)
    } else {
      await routeToAddContact(target.raw)
    }
  }
  
  if (!permission) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-text">
          {translate('Requesting camera permission...', { ns: 'contacts' })}
        </Text>
      </View>
    )
  }
  
  if (!permission.granted) {
    const canAskAgain = permission.canAskAgain !== false
    return (
      <View className="flex-1 bg-background px-5" style={{ paddingTop: insets.top }}>
        <View className="flex-row justify-between items-center py-3">
          <Text className="text-xl font-bold text-text">
            {translate('Scan QR Code', { ns: 'contacts' })}
          </Text>
          {canAskAgain ? (
            <View className="p-2 w-10" />
          ) : (
            <Pressable onPress={() => router.back()} className="p-2">
              <X size={24} color={colors.text} />
            </Pressable>
          )}
        </View>
        
        <View className="flex-1 items-center justify-center gap-5">
          <Text className="text-text-secondary text-center">
            {canAskAgain
              ? translate('Camera permission is required to scan QR codes', { ns: 'contacts' })
              : translate('Camera access is required to scan QR codes. Enable it in Settings.', {
                  ns: 'contacts',
                })}
          </Text>
          {canAskAgain ? (
            <Button variant="primary" onPress={requestPermission}>
              {translate('Continue', { ns: 'auth' })}
            </Button>
          ) : (
            <Button variant="primary" onPress={() => void Linking.openSettings()}>
              {translate('Open Settings')}
            </Button>
          )}
        </View>
      </View>
    )
  }
  
  return (
    <View className="flex-1 bg-black">
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />
      
      <View className="flex-1">
        <View 
          className="flex-row justify-between items-center px-5 py-3"
          style={{ paddingTop: insets.top }}
        >
          <Pressable 
            onPress={() => router.back()} 
            className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
          >
            <X size={24} color="white" />
          </Pressable>
          
          <Text className="text-white font-semibold text-lg">
            {translate('Scan QR Code', { ns: 'contacts' })}
          </Text>
          
          <Pressable 
            onPress={() => setTorch(!torch)} 
            className="w-10 h-10 rounded-full bg-black/50 items-center justify-center"
          >
            {torch ? (
              <Flashlight size={20} color={colors.warning} />
            ) : (
              <FlashlightOff size={20} color="white" />
            )}
          </Pressable>
        </View>
        
        <View className="flex-1 items-center justify-center">
          <View className="w-64 h-64 relative">
            <View className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-primary rounded-tl-lg" />
            <View className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-primary rounded-tr-lg" />
            <View className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-primary rounded-bl-lg" />
            <View className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-primary rounded-br-lg" />
          </View>
        </View>
        
        <View className="px-5 pb-10 items-center" style={{ paddingBottom: insets.bottom + 20 }}>
          <View className="bg-black/50 px-5 py-3 rounded-xl">
            <Text className="text-white text-center">
              {isStartingChat
                ? translate('Starting chat...', { ns: 'chat' })
                : translate('Point your camera at an EXO QR code', { ns: 'contacts' })}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}
