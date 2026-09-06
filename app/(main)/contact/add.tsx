/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { View, Text, Pressable, ScrollView } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { X, QrCode, UserPlus, CheckCircle, AlertCircle, ChevronRight, Share } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { Button, Input, Card } from '@/components/ui'
import { IdentityReplacementVerification } from '@/components/common/IdentityReplacementVerification'
import { useChatStore, useAuthStore } from '@/store'
import { useWalletStore } from '@/store/walletStore'
import {
  acceptContactIdentityReplacement,
  activateChatPersonaByAddress,
  addContactByAddress,
  addContactByInvite,
  type ContactIdentityReplacement,
} from '@/services/chat'
import { translate } from '@/lib/i18n'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { isSameAccountStorageScope, matchesAccountStorageScope } from '@/lib/accountScope'
import { formatAddress, isValidEXOAddress } from '@/lib/utils'
import { useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { parseContactShareTarget } from '@/lib/contactShareLink'
import { consumePendingContactShareAddress } from '@/lib/pendingContactShare'
import { parseDiscoveryAliasPrefix } from '@/lib/discoveryAlias'
import { searchDiscoveryAliases, type DiscoveryAliasMatch } from '@/services/backend/ephemeralDiscovery'

const ADD_CONTACT_LOG_PREFIX = '[AddContactUI]'
type ContactLookupMode = 'address' | 'invite'

function summarizeLookupValue(value: string | null | undefined, head: number = 10, tail: number = 6): string | null {
  if (!value) return null
  if (value.length <= head + tail) return value
  return `${value.slice(0, head)}...${value.slice(-tail)}`
}

function logAddContact(event: string, details?: Record<string, unknown>) {
  if (!__DEV__) return
  if (details) {
    console.log(ADD_CONTACT_LOG_PREFIX, event, details)
    return
  }
  console.log(ADD_CONTACT_LOG_PREFIX, event)
}

export default function AddContactScreen() {
  const router = useGuardedRouter()
  const { scannedInvite, local } = useLocalSearchParams<{ scannedInvite?: string; local?: string }>()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  
  const { contacts } = useChatStore()
  const { exoAddress, isAuthenticated } = useAuthStore()
  const wallets = useWalletStore((state) => state.wallets)
  const activeWallet = useWalletStore((state) => state.wallet)
  const isVaultUnlocked = useWalletStore((state) => state.isVaultUnlocked)
  
  const [contactAddress, setContactAddress] = useState('')
  const [lookupMode, setLookupMode] = useState<ContactLookupMode>('address')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [switchingWalletId, setSwitchingWalletId] = useState<string | null>(null)
  const [pendingIdentityReplacement, setPendingIdentityReplacement] =
    useState<ContactIdentityReplacement | null>(null)
  const [foundUser, setFoundUser] = useState<{
    identityId?: string
  } | null>(null)
  const [aliasMatches, setAliasMatches] = useState<DiscoveryAliasMatch[]>([])
  const [aliasSearching, setAliasSearching] = useState(false)
  const targetWallet = useMemo(
    () => local
      ? wallets.find((wallet) => isSameAccountStorageScope(wallet.address, local)) || activeWallet
      : activeWallet,
    [activeWallet, local, wallets],
  )
  const targetWalletAddress = targetWallet?.address || activeWallet?.address || exoAddress || ''
  const targetWalletName = targetWallet?.displayName || translate('EXO Account', { ns: 'contacts' })
  
  useEffect(() => {
    if (!isAuthenticated || !isVaultUnlocked) return

    const pendingShare = consumePendingContactShareAddress()
    const inviteParam = Array.isArray(scannedInvite) ? scannedInvite[0] : scannedInvite
    const rawInvite = inviteParam || pendingShare || ''

    if (__DEV__ && rawInvite) {
      logAddContact('search.prefill.scannedAddress', {
        addressPreview: summarizeLookupValue(rawInvite),
        rawLength: rawInvite.length,
      })
    }

    const target = rawInvite ? parseContactShareTarget(rawInvite) : null
    if (target?.kind === 'invite') {
      setContactAddress(rawInvite)
      setLookupMode('invite')
      setFoundUser(target.invite.kind === 'direct' ? { identityId: target.invite.identityId } : null)
    } else if (target?.kind === 'address') {
      setContactAddress(target.walletAddress)
      setLookupMode('address')
      setFoundUser(null)
    }
  }, [isAuthenticated, isVaultUnlocked, scannedInvite])

  useEffect(() => {
    if (!local || activeWallet?.address === local) {
      return
    }

    let cancelled = false
    setSwitchingWalletId(local)
    void activateChatPersonaByAddress(local).catch((switchError) => {
      if (!cancelled) {
        setError(getErrorDisplayMessage(switchError))
      }
    }).finally(() => {
      if (!cancelled) {
        setSwitchingWalletId(null)
      }
    })

    return () => {
      cancelled = true
    }
  }, [activeWallet?.address, local, wallets])
  
  const handleAddressChange = (text: string) => {
    const trimmedText = text.trim()
    const target = parseContactShareTarget(trimmedText)
    const invite = target?.kind === 'invite' ? target.invite : null
    const isDiscoverableAddress = target?.kind === 'address' || isValidEXOAddress(trimmedText)

    setContactAddress(target?.kind === 'address' ? target.walletAddress : text)
    setPendingIdentityReplacement(null)
    if (invite) {
      setLookupMode('invite')
    } else if (isDiscoverableAddress) {
      setLookupMode('address')
    }
    if (!trimmedText) {
      setFoundUser(null)
      setError(null)
      return
    }
    setFoundUser(invite?.kind === 'direct' ? { identityId: invite.identityId } : null)
    setError(
      invite || isDiscoverableAddress || trimmedText.startsWith('@')
        ? null
        : translate('Paste a valid secure contact invitation.', { ns: 'contacts' }),
    )
  }

  useEffect(() => {
    if (lookupMode !== 'address') {
      setAliasMatches([])
      setAliasSearching(false)
      return
    }
    const trimmed = contactAddress.trim()
    if (!parseDiscoveryAliasPrefix(trimmed)) {
      setAliasMatches([])
      setAliasSearching(false)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setAliasSearching(true)
      void searchDiscoveryAliases(trimmed, { signal: controller.signal })
        .then((matches) => {
          if (!controller.signal.aborted) setAliasMatches(matches)
        })
        .catch(() => {
          if (!controller.signal.aborted) setAliasMatches([])
        })
        .finally(() => {
          if (!controller.signal.aborted) setAliasSearching(false)
        })
    }, 300)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [contactAddress, lookupMode])

  const selectLookupMode = (mode: ContactLookupMode) => {
    setLookupMode(mode)
    setContactAddress('')
    setFoundUser(null)
    setAliasMatches([])
    setError(null)
    setPendingIdentityReplacement(null)
  }
  
  const handleAddContact = async () => {
    setError(null)
    
    if (switchingWalletId) {
      setError(translate('Please wait until the EXO account switch finishes.', { ns: 'contacts' }))
      return
    }

    if (!exoAddress) {
      setError(translate('You must be logged in to add contacts', { ns: 'contacts' }))
      return
    }
    
    const trimmedAddress = contactAddress.trim()
    const shareTarget = parseContactShareTarget(trimmedAddress)
    const invite = shareTarget?.kind === 'invite' ? shareTarget.invite : null
    const inviteIdentityId = invite?.kind === 'direct' ? invite.identityId : undefined
    const parsedAddress = shareTarget?.kind === 'address' ? shareTarget.walletAddress : trimmedAddress
    const isDiscoverableAddress = isValidEXOAddress(parsedAddress)
    const addStartedAt = Date.now()

    logAddContact('add.start', {
      addressPreview: summarizeLookupValue(trimmedAddress),
      addressLength: trimmedAddress.length,
      displayNameProvided: Boolean(displayName.trim()),
      foundIdentityId: summarizeLookupValue(foundUser?.identityId),
    })
    
    if (!trimmedAddress) {
      setError(translate('Paste a secure contact invitation or scan a contact QR code', { ns: 'contacts' }))
      return
    }
    
    if (!invite && !isDiscoverableAddress) {
      setError(
        trimmedAddress.startsWith('@')
          ? translate('Choose an alias from the results', { ns: 'contacts' })
          : translate('Invalid secure contact invitation', { ns: 'contacts' }),
      )
      return
    }
    
    const localWalletAddress = activeWallet?.address || exoAddress || undefined
    const existingContact = invite?.kind === 'direct'
      ? contacts.find(
          c => matchesAccountStorageScope(c.localWalletAddress, localWalletAddress)
            && c.publicKeyBundle?.identityId === invite.identityId,
        )
      : undefined
    const existingContactIdentityChanged = Boolean(
      existingContact
        && inviteIdentityId
        && (existingContact.identityId || existingContact.publicKeyBundle?.identityId)
          !== inviteIdentityId
    )
    
    if (existingContact?.isSaved && !existingContact.isHidden && !existingContactIdentityChanged) {
      setError(translate('This contact is already added', { ns: 'contacts' }))
      return
    }
    
    setIsLoading(true)
    
    try {
      const result = invite
        ? await addContactByInvite(invite, displayName.trim() || undefined)
        : await addContactByAddress(parsedAddress, displayName.trim() || undefined)

      logAddContact('add.result', {
        addressPreview: summarizeLookupValue(trimmedAddress),
        elapsedMs: Date.now() - addStartedAt,
        success: result.success,
        identityId: summarizeLookupValue(result.identityId),
        error: result.error ?? null,
      })
      
      if (!result.success) {
        if (result.identityReplacement) {
          setPendingIdentityReplacement(result.identityReplacement)
          setError(null)
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
          return
        }
        throw new Error(result.error || translate('Failed to add contact', { ns: 'contacts' }))
      }
      
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

      router.dismissAll()
      router.replace('/(main)/(tabs)/contacts')
    } catch (err) {
      console.error(`${ADD_CONTACT_LOG_PREFIX} add.exception`, {
        addressPreview: summarizeLookupValue(trimmedAddress),
        elapsedMs: Date.now() - addStartedAt,
        error: err instanceof Error ? err.message : String(err),
      })
      setError(getErrorDisplayMessage(err))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAcceptIdentityReplacement = async () => {
    if (!pendingIdentityReplacement) return

    setIsLoading(true)
    setError(null)
    try {
      const result = await acceptContactIdentityReplacement(
        pendingIdentityReplacement,
        displayName.trim() || pendingIdentityReplacement.displayName,
      )
      if (!result.success) {
        throw new Error(result.error || translate('Failed to replace contact identity', { ns: 'contacts' }))
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setPendingIdentityReplacement(null)
      router.dismissAll()
      router.replace('/(main)/(tabs)/contacts')
    } catch (err) {
      setError(getErrorDisplayMessage(err))
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setIsLoading(false)
    }
  }

  const shareTarget = useMemo(
    () => parseContactShareTarget(contactAddress.trim()),
    [contactAddress],
  )
  const parsedContactInvite = shareTarget?.kind === 'invite' ? shareTarget.invite : null
  const isDiscoverableAddress = shareTarget?.kind === 'address'
    || isValidEXOAddress(contactAddress.trim())
  
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top, backgroundColor: colors.background }}>
      <View className="flex-row justify-between items-center px-4 py-3">
        <Text className="text-xl font-bold text-text">
          {translate('Add Contact', { ns: 'contacts' })}
        </Text>
        <Pressable onPress={() => router.back()} className="p-2">
          <X size={24} color={colors.text} />
        </Pressable>
      </View>
      
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ gap: 20, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Card className="p-3 border border-border">
          <View className="flex-row gap-3">
            <UserPlus size={20} color={colors.primary} />
            <View className="flex-1">
              <Text className="text-text font-medium">
                {translate('Add Contact', { ns: 'contacts' })}
              </Text>
              <Text className="text-text-secondary text-sm mt-1">
                {lookupMode === 'address'
                  ? translate(
                    'Enter the Post-Quantum address of the person you want to add. They must have shared their address with you.',
                    { ns: 'contacts' },
                  )
                  : translate(
                    'Scan a contact QR code or paste the secure contact invitation shared by the person you want to add.',
                    { ns: 'contacts' },
                  )}
              </Text>
            </View>
          </View>
          <View className="flex-row gap-2 mt-3">
            <Pressable
              accessibilityRole="button"
              className="flex-1 rounded-xl px-3 py-2"
              onPress={() => selectLookupMode('address')}
              style={{
                backgroundColor: lookupMode === 'address' ? colors.primary + '1f' : colors.surface,
                borderWidth: 1,
                borderColor: lookupMode === 'address' ? colors.primary : colors.border,
              }}
              testID="contact-lookup-exo"
            >
              <Text
                className="text-center text-xs font-semibold"
                style={{ color: lookupMode === 'address' ? colors.primary : colors.textSecondary }}
              >
                {translate('EXO Account', { ns: 'contacts' })}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="flex-1 rounded-xl px-3 py-2"
              onPress={() => selectLookupMode('invite')}
              style={{
                backgroundColor: lookupMode === 'invite' ? colors.primary + '1f' : colors.surface,
                borderWidth: 1,
                borderColor: lookupMode === 'invite' ? colors.primary : colors.border,
              }}
              testID="contact-lookup-invitation"
            >
              <Text
                className="text-center text-xs font-semibold"
                style={{ color: lookupMode === 'invite' ? colors.primary : colors.textSecondary }}
              >
                {translate('Secure Contact Invitation', { ns: 'contacts' })}
              </Text>
            </Pressable>
          </View>
        </Card>
        
        <View>
          <Input
            label={translate(
              lookupMode === 'address' ? 'EXO Account' : 'Secure Contact Invitation',
              { ns: 'contacts' },
            )}
            placeholder={translate(
              lookupMode === 'address' ? 'EXO00... or @alias' : 'spectra:contact:v1:...',
              { ns: 'contacts' },
            )}
            value={contactAddress}
            onChangeText={handleAddressChange}
            autoCapitalize="none"
            autoCorrect={false}
            error={error || undefined}
            inputClassName="font-mono"
          />
          
          {aliasSearching ? (
            <Text className="text-text-muted text-xs mt-2 ml-1">
              {translate('Searching aliases…', { ns: 'contacts' })}
            </Text>
          ) : null}
          {aliasMatches.length > 0 ? (
            <View className="mt-3 gap-2">
              {aliasMatches.map((match) => (
                <Pressable
                  key={`${match.alias}:${match.walletAddress}`}
                  onPress={() => {
                    setContactAddress(match.walletAddress)
                    setLookupMode('address')
                    setFoundUser(null)
                    setAliasMatches([])
                    setError(null)
                  }}
                  className="rounded-xl px-3 py-3 active:opacity-70"
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                  testID="alias-search-result"
                >
                  <Text className="font-semibold" style={{ color: colors.text }} numberOfLines={1}>
                    {match.alias}
                  </Text>
                  <Text className="text-xs font-mono mt-0.5" style={{ color: colors.textMuted }}>
                    {formatAddress(match.walletAddress, 6)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {parsedContactInvite && (
            <View className="flex-row items-center gap-2 mt-2 ml-1">
              <CheckCircle size={14} color={colors.success} />
              <Text className="text-green-500 text-xs">
                {translate('Secure invitation ready', { ns: 'contacts' })}
              </Text>
            </View>
          )}

          {!foundUser && isValidEXOAddress(contactAddress.trim()) && (
            <View className="flex-row items-center gap-2 mt-2 ml-1">
              <CheckCircle size={14} color={colors.success} />
              <Text className="text-green-500 text-xs">
                {translate('Add by Post-Quantum Address', { ns: 'contacts' })}
              </Text>
            </View>
          )}
          
          {!parsedContactInvite && !isDiscoverableAddress && contactAddress.length > 0 && !error && !contactAddress.trim().startsWith('@') && (
            <View className="flex-row items-center gap-2 mt-2 ml-1">
              <AlertCircle size={14} color={colors.error} />
              <Text className="text-red-500 text-xs">
                {translate('Paste a valid secure contact invitation.', { ns: 'contacts' })}
              </Text>
            </View>
          )}

          {pendingIdentityReplacement ? (
            <View className="mt-3">
              <IdentityReplacementVerification
                replacement={pendingIdentityReplacement}
                loading={isLoading}
                onAccept={handleAcceptIdentityReplacement}
              />
            </View>
          ) : null}
        </View>
        
        <View>
          <Input
            label={translate('Display Name (Optional)', { ns: 'contacts' })}
            placeholder={translate('Enter a name for this contact', { ns: 'contacts' })}
            value={displayName}
            onChangeText={setDisplayName}
          />
          <Text className="text-text-muted text-xs mt-1 ml-1">
            {translate('This name is only visible to you', { ns: 'contacts' })}
          </Text>
        </View>

        <Card className="p-4 border border-border">
          <Text className="text-text font-medium mb-1">
            {translate('Adding to', { ns: 'contacts' })}
          </Text>
          <Text className="text-text-muted text-xs mb-3">
            {translate('This contact will be saved under this EXO account on this device.', { ns: 'contacts' })}
          </Text>
          <View
            className="flex-row items-center justify-between rounded-xl px-3 py-3"
            style={{
              backgroundColor: colors.primary + '1f',
              borderWidth: 1,
              borderColor: colors.primary,
            }}
          >
            <View className="flex-1">
              <Text className="text-text font-medium">
                {targetWalletName}
              </Text>
              {targetWalletAddress ? (
                <Text className="text-text-muted text-xs font-mono">
                  {formatAddress(targetWalletAddress, 8)}
                </Text>
              ) : null}
            </View>
            <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
              {switchingWalletId
                ? translate('Switching...', { ns: 'contacts' })
                : translate('Selected', { ns: 'contacts' })}
            </Text>
          </View>
        </Card>
        
        <Pressable
          className="bg-surface rounded-2xl p-4 active:opacity-70"
          onPress={() => {
            const localQuery = activeWallet?.address ? `?local=${encodeURIComponent(activeWallet.address)}` : ''
            router.push(`/(main)/contact/scan-qr${localQuery}`)
          }}
        >
          <View className="flex-row items-center gap-4">
            <View className="w-12 h-12 rounded-xl items-center justify-center" style={{ backgroundColor: colors.primary + '26' }}>
              <QrCode size={24} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-text font-medium">
                {translate('Scan QR Code', { ns: 'contacts' })}
              </Text>
              <Text className="text-text-muted text-sm">
                {translate('Scan a contact\'s QR to add them instantly', { ns: 'contacts' })}
              </Text>
            </View>
            <ChevronRight size={20} color={colors.textMuted} />
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          className="bg-surface rounded-2xl p-4 active:opacity-70"
          onPress={() => router.push('/(main)/profile/qr-code')}
          testID="share-contact-invitation"
        >
          <View className="flex-row items-center gap-4">
            <View className="w-12 h-12 rounded-xl items-center justify-center" style={{ backgroundColor: colors.primary + '26' }}>
              <Share size={24} color={colors.primary} />
            </View>
            <View className="flex-1">
              <Text className="text-text font-medium">
                {translate('Share My QR Code', { ns: 'profile' })}
              </Text>
              <Text className="text-text-muted text-sm">
                {translate('Share this QR code with others so they can add you as a contact', { ns: 'profile' })}
              </Text>
            </View>
            <ChevronRight size={20} color={colors.textMuted} />
          </View>
        </Pressable>
      </ScrollView>
      
      <View className="px-5 pb-4" style={{ paddingBottom: insets.bottom + 16 }}>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onPress={handleAddContact}
          disabled={isLoading || Boolean(switchingWalletId) || !contactAddress.trim() || Boolean(pendingIdentityReplacement)}
          loading={isLoading || Boolean(switchingWalletId)}
        >
          {switchingWalletId
            ? translate('Switching...', { ns: 'contacts' })
            : isLoading
            ? translate('Adding...', { ns: 'contacts' })
            : translate(
              isDiscoverableAddress ? 'Add by Post-Quantum Address' : 'Add Contact',
              { ns: 'contacts' },
            )}
        </Button>
      </View>
    </View>
  )
}
