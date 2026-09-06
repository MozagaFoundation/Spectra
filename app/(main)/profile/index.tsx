/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useCallback } from 'react'
import { View, Text, ScrollView, Pressable, ActivityIndicator, Alert, Switch } from 'react-native'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Edit3, QrCode, Copy, Check, Link2, RefreshCw } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { Button, Card } from '@/components/ui'
import { Avatar } from '@/components/common'
import { AliasInput, aliasFieldValue, validateAliasField } from '@/components/common/AliasInput'
import { useAuthStore, useWalletStore } from '@/store'
import { getCurrentLocaleTag, translate } from '@/lib/i18n'
import {
  ensureVerifiedBackendAccess,
  ensureVerifiedBackendAccessForIdentity,
  repairBackendIdentityBinding,
} from '@/services/backend/session'
import {
  ensureOwnContactProfile,
  updateOwnContactProfile,
} from '@/services/chat/contactProfile'
import {
  getIdentity,
  syncBundleServerAccessToken,
} from '@/services/quantumChat'
import { normalizeDiscoveryAlias, storedDiscoveryAlias } from '@/lib/discoveryAlias'
import { useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { useSpectreStore } from '@/store/spectreStore'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { syncLiveDiscoveryAlias } from '@/services/chat/discoveryAliasPublish'
import {
  readAliasAutocomplete,
  writeAliasAutocomplete,
} from '@/services/chat/aliasAutocompleteStorage'
import type { SecureAccessFailure } from '@/lib/types'

type IdentityBindingStatus = 'checking' | 'bound' | 'unbound' | 'binding' | 'error'
type SessionStatus = 'active' | 'expired' | 'refreshing' | 'establishing'

function getSecureAccessMessage(
  failure: SecureAccessFailure | null,
): string {
  if (failure === 'identity_binding') {
    return translate('Could not link identity. Please try again.', { ns: 'profile' })
  }
  if (failure === 'connectivity') {
    return translate('Could not refresh session. Check your connection.', { ns: 'profile' })
  }
  if (failure === 'cancelled') {
    return translate('VDF work was cancelled', { ns: 'settings' })
  }
  if (failure === 'native_unavailable') {
    return translate('Native Rebuild Required', { ns: 'tor' })
  }
  if (failure === 'deletion_cleanup_pending') {
    return translate('Backend cleanup is still running. You can retry this status check safely.', {
      ns: 'settings',
    })
  }
  return translate('This proof could not be completed. Check your connection and try again.', {
    ns: 'settings',
  })
}

function getProfileNameValidationMessage(value: string): string | null {
  return validateAliasField(value)
}

export default function ProfileScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  useTranslation()
  
  const { exoAddress } = useAuthStore()
  const { wallet } = useWalletStore()
  const spectreEnabled = useSpectreStore((state) => state.enabled)
  
  const isIdentityBound = useAuthStore((state) => state.isIdentityBound)
  const isSessionExpired = useAuthStore((state) => state.isSessionExpired)
  const cloudSession = useAuthStore((state) => state.session)
  const secureAccess = useAuthStore((state) => state.secureAccess)

  const [copied, setCopied] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [identityBindingStatus, setIdentityBindingStatus] = useState<IdentityBindingStatus>('checking')
  const [identityBindingError, setIdentityBindingError] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('active')
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [contactDisplayName, setContactDisplayName] = useState('')
  const [sharedDisplayName, setSharedDisplayName] = useState('')
  const [originalSharedDisplayName, setOriginalSharedDisplayName] = useState('')
  const [isSavingSharedName, setIsSavingSharedName] = useState(false)
  const [aliasAutocomplete, setAliasAutocomplete] = useState(true)
  const [savingAutocomplete, setSavingAutocomplete] = useState(false)

  const sharedNameValidationError = getProfileNameValidationMessage(sharedDisplayName)
  
  useFocusEffect(
    useCallback(() => {
      let cancelled = false

      const load = async () => {
        if (!exoAddress) return
        const localIdentityId = getIdentity()?.id ?? null
        const profileLoad = !spectreEnabled && localIdentityId
          ? ensureOwnContactProfile(localIdentityId).catch(() => null)
          : Promise.resolve(null)
        const profile = await profileLoad
        if (cancelled) return

        const nextAvatarUrl = spectreEnabled ? null : (profile?.avatarDataUri || null)
        setAvatarUrl(nextAvatarUrl)
        const nextContactDisplayName = profile?.displayName || ''
        const nextAlias = storedDiscoveryAlias(nextContactDisplayName)
        setContactDisplayName(nextContactDisplayName)
        setSharedDisplayName(nextAlias)
        setOriginalSharedDisplayName(nextAlias)
        if (wallet?.address) {
          const autocomplete = await readAliasAutocomplete(wallet.address)
          if (!cancelled) setAliasAutocomplete(autocomplete)
        }

        if (isIdentityBound) {
          setIdentityBindingStatus('bound')
        } else if (secureAccess.phase === 'binding') {
          setIdentityBindingStatus('binding')
        } else if (secureAccess.failure === 'identity_binding') {
          setIdentityBindingStatus('error')
          setIdentityBindingError(getSecureAccessMessage(secureAccess.failure))
        } else {
          setIdentityBindingStatus('unbound')
        }

        const sessionExpiredNow = isSessionExpired
          || !cloudSession
          || (cloudSession.expiresAt - Date.now() <= 60_000)
        if (secureAccess.phase === 'admitting') {
          setSessionStatus('establishing')
        } else {
          setSessionStatus(sessionExpiredNow ? 'expired' : 'active')
        }
        if (secureAccess.phase === 'failed' && sessionExpiredNow) {
          setSessionError(getSecureAccessMessage(secureAccess.failure))
        }
      }

      void load()

      return () => {
        cancelled = true
      }
    }, [
      exoAddress,
      isIdentityBound,
      isSessionExpired,
      cloudSession,
      secureAccess,
      spectreEnabled,
      wallet?.address,
    ])
  )

  const handleLinkIdentity = async () => {
    setIdentityBindingStatus('binding')
    setIdentityBindingError(null)
    try {
      const identity = getIdentity()
      if (!identity?.id) {
        setIdentityBindingError(
          translate('Chat identity not available. Please restart the app.', { ns: 'profile' }),
        )
        setIdentityBindingStatus('error')
        return
      }
      const repairedSession = await repairBackendIdentityBinding(identity.id)
      const bound = repairedSession?.identityId === identity.id
      if (bound) {
        syncBundleServerAccessToken()
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        useAuthStore.getState().setIdentityBound(true)
        setIdentityBindingStatus('bound')
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        setIdentityBindingError(
          getSecureAccessMessage(useAuthStore.getState().secureAccess.failure),
        )
        setIdentityBindingStatus('error')
      }
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setIdentityBindingError(getErrorDisplayMessage(error))
      setIdentityBindingStatus('error')
    }
  }

  const handleRefreshSession = async () => {
    setSessionStatus('refreshing')
    setSessionError(null)
    try {
      const identity = getIdentity()
      const refreshed = identity?.id
        ? await ensureVerifiedBackendAccessForIdentity(identity.id)
        : await ensureVerifiedBackendAccess()
      if (refreshed) {
        if (identity?.id) {
          const bound = refreshed.identityId === identity.id
          useAuthStore.getState().setIdentityBound(bound)
          if (!bound) {
            setIdentityBindingError(
              translate('Could not link identity. Please try again.', { ns: 'profile' }),
            )
            setIdentityBindingStatus('error')
          }
        }
        syncBundleServerAccessToken()
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        useAuthStore.getState().setSessionExpired(false)
        setSessionStatus('active')
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
        setSessionError(
          getSecureAccessMessage(useAuthStore.getState().secureAccess.failure),
        )
        setSessionStatus('expired')
      }
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setSessionError(getSecureAccessMessage(secureAccess.failure))
      setSessionStatus('expired')
    }
  }

  const handleCopyAddress = async () => {
    if (exoAddress) {
      await Clipboard.setStringAsync(exoAddress)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSaveSharedName = async () => {
    if (spectreEnabled) {
      Alert.alert(
        translate('Spectre Mode', { ns: 'settings' }),
        translate('Contact profile data cannot be edited while Spectre Mode is active.', { ns: 'profile' }),
      )
      return
    }

    setIsSavingSharedName(true)
    try {
      const identity = getIdentity()
      if (!identity) throw new Error('Chat identity is not available')
      const displayName = aliasFieldValue(sharedDisplayName)
        ? normalizeDiscoveryAlias(aliasFieldValue(sharedDisplayName))
        : undefined
      const profile = await updateOwnContactProfile(identity.id, {
        displayName,
        avatarDataUri: avatarUrl,
      })
      const nextName = profile.displayName || ''
      const nextAlias = storedDiscoveryAlias(nextName)
      setContactDisplayName(nextName)
      setSharedDisplayName(nextAlias)
      await syncLiveDiscoveryAlias()
      setOriginalSharedDisplayName(nextAlias)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(
        translate('Save Failed'),
        getErrorDisplayMessage(error),
      )
    } finally {
      setIsSavingSharedName(false)
    }
  }

  const sharedNameChanged = sharedDisplayName !== originalSharedDisplayName
  
  return (
    <View className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
      <ScrollView className="flex-1">
        <View
          className="flex-row justify-between items-center px-4 py-3"
          style={{ paddingTop: insets.top }}
        >
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft size={24} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={spectreEnabled ? undefined : () => router.push('/(main)/profile/edit')}
            disabled={spectreEnabled}
            className="p-2"
          >
            <Edit3 size={20} color={spectreEnabled ? colors.textMuted : colors.text} />
          </Pressable>
        </View>
        
        <View className="items-center px-5 gap-4 mb-6">
          <Avatar
            name={contactDisplayName || wallet?.displayName || translate('User', { ns: 'profile' })}
            imageUrl={spectreEnabled ? null : avatarUrl}
            size="xl"
            previewable
          />
          <View className="items-center gap-1">
            <Text className="text-2xl font-bold text-text">
              {contactDisplayName || wallet?.displayName || translate('Post-Quantum Account', { ns: 'profile' })}
            </Text>
            <Text className="text-text-muted text-sm">
              {translate('Member since {{date}}', {
                ns: 'profile',
                date: new Date(wallet?.createdAt || Date.now()).toLocaleDateString(getCurrentLocaleTag()),
              })}
            </Text>
          </View>
        </View>
        
        <View className="px-5 gap-4">
          <Pressable
            onPress={() => router.push('/(main)/profile/qr-code')}
            className="bg-surface rounded-2xl p-4 active:bg-surface-hover"
          >
            <View className="flex-row items-center gap-4">
              <View className="w-12 h-12 rounded-xl items-center justify-center" style={{ backgroundColor: colors.primary + '26' }}>
                <QrCode size={24} color={colors.primary} />
              </View>
              <View className="flex-1">
                <Text className="text-text font-medium">
                  {translate('Share My QR Code', { ns: 'profile' })}
                </Text>
                <Text className="text-text-muted text-sm">
                  {translate('Let others scan to add you', { ns: 'profile' })}
                </Text>
              </View>
            </View>
          </Pressable>
          
          <View className="gap-2">
            <Text className="text-text font-medium">
              {translate('Post-Quantum Address', { ns: 'contacts' })}
            </Text>
            <Card className="p-4">
              <View className="gap-3">
                <Text className="text-text font-mono text-sm" numberOfLines={2}>
                  {exoAddress}
                </Text>
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={handleCopyAddress}
                  icon={copied ? <Check size={16} color={colors.success} /> : <Copy size={16} color={colors.text} />}
                >
                  {copied ? translate('Copied') : translate('Copy Address')}
                </Button>
              </View>
            </Card>
          </View>

          {!spectreEnabled ? (
          <Card className="p-4">
            <View className="gap-3">
              <View className="gap-2">
                <AliasInput
                  label={translate('Alias', { ns: 'profile' })}
                  value={sharedDisplayName}
                  onChangeText={setSharedDisplayName}
                  error={sharedNameValidationError}
                />
                <Text
                  className="text-xs leading-4 text-right"
                  style={{
                    color: sharedNameValidationError ? colors.error : colors.textMuted,
                  }}
                >
                  {translate('{{count}}/80', {
                    count: [...sharedDisplayName].length,
                    ns: 'profile',
                  })}
                </Text>
                <Text className="text-text-muted text-xs leading-4">
                  {translate('Optional. People can search this alias while you are Findable. It is also shared with people who add you.', {
                    ns: 'profile',
                  })}
                </Text>
              </View>

              <View className="flex-row items-center rounded-xl px-3 py-3" style={{ backgroundColor: colors.surface }}>
                <View className="flex-1 mr-3">
                  <Text className="text-text font-medium">
                    {translate('Show me in alias suggestions', { ns: 'profile' })}
                  </Text>
                  <Text className="text-text-muted text-xs mt-0.5">
                    {translate('If this is off, people still find you by typing your exact alias.', {
                      ns: 'profile',
                    })}
                  </Text>
                </View>
                <Switch
                  testID="alias-autocomplete"
                  value={aliasAutocomplete}
                  disabled={savingAutocomplete}
                  onValueChange={(next) => {
                    if (!wallet?.address) return
                    setAliasAutocomplete(next)
                    setSavingAutocomplete(true)
                    void writeAliasAutocomplete(wallet.address, next)
                      .then(() => {
                        setSavingAutocomplete(false)
                        return syncLiveDiscoveryAlias()
                      })
                      .catch(() => {
                        setAliasAutocomplete(!next)
                        void writeAliasAutocomplete(wallet.address, !next).catch(() => undefined)
                        setSavingAutocomplete(false)
                      })
                  }}
                  trackColor={{ false: colors.borderLight, true: colors.primary }}
                  thumbColor="white"
                />
              </View>

              <Button
                variant="secondary"
                size="sm"
                onPress={handleSaveSharedName}
                disabled={
                  !sharedNameChanged
                  || isSavingSharedName
                  || sharedNameValidationError !== null
                }
                loading={isSavingSharedName}
              >
                {translate('Save alias', { ns: 'profile' })}
              </Button>
            </View>
          </Card>
          ) : null}
          
          <Card className="p-4 border border-border">
            <View className="gap-2">
              <Text className="text-text font-medium">
                {translate('Security Status', { ns: 'profile' })}
              </Text>
              <View className="flex-row items-center gap-2">
                <View className="w-2 h-2 rounded-full bg-success" />
                <Text className="text-text-secondary text-sm">
                  {translate('Post-quantum identity keys ready')}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <View className="w-2 h-2 rounded-full bg-success" />
                <Text className="text-text-secondary text-sm">
                  {translate('End-to-end encryption available for supported chats')}
                </Text>
              </View>

              {sessionStatus === 'active' && (
                <View className="flex-row items-center gap-2">
                  <View className="w-2 h-2 rounded-full bg-success" />
                  <Text className="text-text-secondary text-sm">
                    {translate('Server session active', { ns: 'profile' })}
                  </Text>
                </View>
              )}
              {sessionStatus === 'expired' && (
                <View className="gap-2 mt-1">
                  <View className="flex-row items-center gap-2">
                    <View className="w-2 h-2 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                    <Text className="text-text-secondary text-sm">
                      {secureAccess.phase === 'failed'
                        ? translate('Secure access needs attention', { ns: 'settings' })
                        : translate('Server session expired — features may not work', {
                          ns: 'profile',
                        })}
                    </Text>
                  </View>
                  {sessionError && (
                    <Text className="text-red-400 text-xs">{sessionError}</Text>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onPress={handleRefreshSession}
                    icon={<RefreshCw size={16} color="white" />}
                  >
                    Refresh Auth
                  </Button>
                </View>
              )}
              {sessionStatus === 'establishing' && (
                <View className="gap-2 mt-1">
                  <Button variant="secondary" size="sm" loading disabled>
                    {translate('Activating secure online access', { ns: 'settings' })}
                  </Button>
                </View>
              )}
              {sessionStatus === 'refreshing' && (
                <View className="gap-2 mt-1">
                  <Button variant="secondary" size="sm" loading disabled>
                    Refreshing session...
                  </Button>
                </View>
              )}

              {identityBindingStatus === 'checking' && (
                <View className="flex-row items-center gap-2">
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text className="text-text-muted text-sm">
                    {translate('Checking identity link...', { ns: 'profile' })}
                  </Text>
                </View>
              )}
              {identityBindingStatus === 'bound' && (
                <View className="flex-row items-center gap-2">
                  <View className="w-2 h-2 rounded-full bg-success" />
                  <Text className="text-text-secondary text-sm">
                    {translate('Identity linked to server', { ns: 'profile' })}
                  </Text>
                </View>
              )}
              {(identityBindingStatus === 'unbound' || identityBindingStatus === 'error') && (
                <View className="gap-2 mt-1">
                  <View className="flex-row items-center gap-2">
                    <View className="w-2 h-2 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                    <Text className="text-text-secondary text-sm">
                      {translate('Identity not linked — messaging is disabled', {
                        ns: 'profile',
                      })}
                    </Text>
                  </View>
                  {identityBindingError && (
                    <Text className="text-red-400 text-xs">{identityBindingError}</Text>
                  )}
                  <Button
                    variant="primary"
                    size="sm"
                    onPress={handleLinkIdentity}
                    icon={<Link2 size={16} color="white" />}
                  >
                    Link Identity
                  </Button>
                </View>
              )}
              {identityBindingStatus === 'binding' && (
                <View className="gap-2 mt-1">
                  <Button variant="secondary" size="sm" loading disabled>
                    Linking identity...
                  </Button>
                </View>
              )}
            </View>
          </Card>
        </View>
      </ScrollView>
    </View>
  )
}
