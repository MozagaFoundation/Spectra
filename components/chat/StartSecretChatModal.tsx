/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Pressable, Text, TextInput, View } from 'react-native'
import { FlashList, type FlashListRef } from '@shopify/flash-list'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { AlertCircle, CheckCircle, MessageSquarePlus, QrCode, Search, UserPlus, X } from 'lucide-react-native'

import { Avatar } from '@/components/common'
import { IdentityReplacementVerification } from '@/components/common/IdentityReplacementVerification'
import { ShareContactBanner } from '@/components/chat/ShareContactBanner'
import { Button } from '@/components/ui'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useWalletStore } from '@/store/walletStore'
import {
  acceptContactIdentityReplacement,
  addContactByAddress,
  addContactByInvite,
  type ContactIdentityReplacement,
} from '@/services/chat'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { parseContactInvite, type ContactInvite } from '@/lib/contactInvite'
import { translate } from '@/lib/i18n'
import { Haptics, notificationAsync as triggerNotification } from '@/lib/safeHaptics'
import { sortContactsAlphabetically } from '@/lib/contactsScreen'
import { findReusableStartChatContact, startChatRoute } from '@/lib/startChatContact'
import { useThemeColors, type ThemeColors } from '@/lib/theme'
import { formatAddress, isValidEXOAddress } from '@/lib/utils'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import type { ChatContact } from '@/lib/types'

interface StartSecretChatModalProps {
  visible: boolean
  onClose: () => void
}

type ContactLookupMode = 'address' | 'invite'

function getContactKey(contact: ChatContact) {
  return `${contact.localWalletAddress || 'active'}:${contact.walletAddress || contact.identityId}`
}

const ContactPickerRow = memo(function ContactPickerRow({
  colors,
  contact,
  onPress,
  walletNameByAddress,
}: {
  colors: ThemeColors
  contact: ChatContact
  onPress: (contact: ChatContact) => void
  walletNameByAddress: ReadonlyMap<string, string>
}) {
  return (
    <Pressable
      accessibilityHint={translate('Start Secret Chat', { ns: 'chat' })}
      accessibilityLabel={contact.displayName}
      accessibilityRole="button"
      onPress={() => onPress(contact)}
      className="flex-row items-center gap-3 rounded-2xl p-3 mb-2 active:opacity-70"
      style={{ backgroundColor: colors.surface }}
      testID="contact-picker-row"
    >
      <Avatar
        name={contact.displayName}
        imageUrl={contact.avatarUrl}
        size="sm"
        showOnlineStatus
        isOnline={contact.isOnline}
      />
      <View className="flex-1">
        <Text className="font-medium" style={{ color: colors.text }} numberOfLines={1}>
          {contact.displayName}
        </Text>
        <Text className="text-xs font-mono mt-0.5" style={{ color: colors.textMuted }} numberOfLines={1}>
          {formatAddress(contact.walletAddress || contact.identityId, 6)}
        </Text>
        {contact.localWalletAddress ? (
          <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }} numberOfLines={1}>
            {translate('via {{account}}', {
              ns: 'contacts',
              account: walletNameByAddress.get(contact.localWalletAddress)
                || formatAddress(contact.localWalletAddress, 6),
            })}
          </Text>
        ) : null}
      </View>
    </Pressable>
  )
})

export const StartSecretChatModal = memo(function StartSecretChatModal({
  visible,
  onClose,
}: StartSecretChatModalProps) {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  useTranslation()

  const contacts = useChatStore((state) => state.contacts)
  const exoAddress = useAuthStore((state) => state.exoAddress)
  const activeWallet = useWalletStore((state) => state.wallet)
  const wallets = useWalletStore((state) => state.wallets)

  const [address, setAddress] = useState('')
  const [lookupMode, setLookupMode] = useState<ContactLookupMode>('address')
  const [contactQuery, setContactQuery] = useState('')
  const [foundUser, setFoundUser] = useState<{
    identityId: string
    invite: ContactInvite
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [pendingIdentityReplacement, setPendingIdentityReplacement] =
    useState<ContactIdentityReplacement | null>(null)
  const contactListRef = useRef<FlashListRef<ChatContact>>(null)
  const contactSearchOffsetRef = useRef(0)
  const startRequestIdRef = useRef(0)

  const localWalletAddress = activeWallet?.address || exoAddress || undefined
  const activeAccountName = activeWallet?.displayName || translate('EXO Account', { ns: 'contacts' })

  const walletNameByAddress = useMemo(() => {
    const names = new Map<string, string>()
    for (const wallet of wallets) {
      names.set(wallet.address, wallet.displayName || translate('EXO Account', { ns: 'contacts' }))
    }
    return names
  }, [wallets])

  const visibleContacts = useMemo(() => {
    const query = contactQuery.trim().toLowerCase()
    const seen = new Map<string, ChatContact>()
    for (const contact of contacts) {
      if (!contact.isSaved || contact.isHidden) {
        continue
      }

      const key = getContactKey(contact)
      const existing = seen.get(key)
      if (!existing || (contact.addedAt ?? 0) > (existing.addedAt ?? 0)) {
        seen.set(key, contact)
      }
    }

    const deduped = [...seen.values()]
    if (!query) {
      return sortContactsAlphabetically(deduped)
    }

    return sortContactsAlphabetically(deduped.filter((contact) =>
      contact.displayName.toLowerCase().includes(query)
      || contact.identityId.toLowerCase().includes(query)
      || Boolean(contact.walletAddress?.toLowerCase().includes(query))
    ))
  }, [contactQuery, contacts])
  const contactPickerData = useMemo<ChatContact[]>(
    () => visible ? visibleContacts : [],
    [visible, visibleContacts],
  )

  const closeAndReset = useCallback(() => {
    startRequestIdRef.current += 1
    onClose()
    setAddress('')
    setLookupMode('address')
    setContactQuery('')
    setFoundUser(null)
    setError(null)
    setIsStarting(false)
    setPendingIdentityReplacement(null)
  }, [onClose])

  const openChat = useCallback((chatAddress: string, local?: string) => {
    closeAndReset()
    router.push(startChatRoute(chatAddress, local))
  }, [closeAndReset, router])

  const handleAddressChange = useCallback((nextAddress: string) => {
    setAddress(nextAddress)
    setPendingIdentityReplacement(null)
    const invite = parseContactInvite(nextAddress.trim())
    const isDiscoverableAddress = isValidEXOAddress(nextAddress.trim())
    if (invite) {
      setLookupMode('invite')
    } else if (isDiscoverableAddress) {
      setLookupMode('address')
    }
    if (!nextAddress.trim()) {
      setFoundUser(null)
      setError(null)
      return
    }
    if (!invite && !isDiscoverableAddress) {
      setFoundUser(null)
      setError(translate('Paste a secure contact invitation or scan its QR code.', { ns: 'contacts' }))
      return
    }
    if (!invite) {
      setFoundUser(null)
      setError(null)
      return
    }
    setFoundUser(invite.kind === 'direct' ? { identityId: invite.identityId, invite } : null)
    setError(null)
  }, [])

  const selectLookupMode = useCallback((mode: ContactLookupMode) => {
    setLookupMode(mode)
    setAddress('')
    setFoundUser(null)
    setError(null)
    setPendingIdentityReplacement(null)
  }, [])

  const findExistingContact = useCallback((identityId?: string, walletAddress?: string) => (
    findReusableStartChatContact(contacts, {
      localWalletAddress,
      identityId,
      walletAddress,
    })
  ), [contacts, localWalletAddress])

  const handleStartWithAddress = useCallback(async () => {
    const trimmedAddress = address.trim()
    const contactInvite = parseContactInvite(trimmedAddress)
    const contactIdentityId = contactInvite?.kind === 'direct'
      ? contactInvite.identityId
      : undefined
    const isDiscoverableAddress = isValidEXOAddress(trimmedAddress)
    const normalizedWalletAddress = isDiscoverableAddress
      ? `EXO00${trimmedAddress.slice(5).toLowerCase()}`
      : null
    setError(null)

    if (!contactInvite && !normalizedWalletAddress) {
      setError(translate('Paste a secure contact invitation or scan its QR code.', { ns: 'contacts' }))
      return
    }

    if (
      contactIdentityId === exoAddress ||
      contactIdentityId === activeWallet?.address ||
      normalizedWalletAddress === activeWallet?.address
    ) {
      setError(translate('You cannot add yourself as a contact', { ns: 'contacts' }))
      return
    }

    const existingContact = findExistingContact(
      contactIdentityId,
      normalizedWalletAddress || undefined,
    )
    if (existingContact) {
      const chatAddress = existingContact.walletAddress || existingContact.identityId
      openChat(chatAddress, existingContact.localWalletAddress || localWalletAddress)
      return
    }

    const requestId = startRequestIdRef.current + 1
    startRequestIdRef.current = requestId
    setIsStarting(true)
    try {
      const result = contactInvite
        ? await addContactByInvite(contactInvite)
        : await addContactByAddress(normalizedWalletAddress!)
      if (requestId !== startRequestIdRef.current) return
      if (!result.success || !result.identityId) {
        if (result.identityReplacement) {
          setPendingIdentityReplacement(result.identityReplacement)
          setError(null)
          return
        }
        const fallbackContact = findExistingContact(
          result.identityId || contactIdentityId,
          normalizedWalletAddress || undefined,
        )
        if (fallbackContact) {
          const chatAddress = fallbackContact.walletAddress || fallbackContact.identityId
          openChat(chatAddress, fallbackContact.localWalletAddress || localWalletAddress)
          return
        }
        throw new Error(result.error || translate('Failed to add contact', { ns: 'contacts' }))
      }

      triggerNotification(Haptics.NotificationFeedbackType.Success)
      openChat(result.identityId, localWalletAddress)
    } catch (startError) {
      if (requestId !== startRequestIdRef.current) return
      const fallbackContact = findExistingContact(
        contactIdentityId,
        normalizedWalletAddress || undefined,
      )
      if (fallbackContact) {
        const chatAddress = fallbackContact.walletAddress || fallbackContact.identityId
        openChat(chatAddress, fallbackContact.localWalletAddress || localWalletAddress)
        return
      }
      triggerNotification(Haptics.NotificationFeedbackType.Error)
      setError(getErrorDisplayMessage(startError))
    } finally {
      if (requestId === startRequestIdRef.current) {
        setIsStarting(false)
      }
    }
  }, [activeWallet?.address, address, exoAddress, findExistingContact, localWalletAddress, openChat])

  const handleAcceptIdentityReplacement = useCallback(async () => {
    if (!pendingIdentityReplacement) return

    const requestId = startRequestIdRef.current + 1
    startRequestIdRef.current = requestId
    setIsStarting(true)
    setError(null)
    try {
      const result = await acceptContactIdentityReplacement(pendingIdentityReplacement)
      if (requestId !== startRequestIdRef.current) return
      if (!result.success || !result.identityId) {
        throw new Error(result.error || translate('Failed to replace contact identity', { ns: 'contacts' }))
      }
      triggerNotification(Haptics.NotificationFeedbackType.Success)
      openChat(result.identityId, localWalletAddress)
    } catch (acceptError) {
      if (requestId !== startRequestIdRef.current) return
      triggerNotification(Haptics.NotificationFeedbackType.Error)
      setError(getErrorDisplayMessage(acceptError))
    } finally {
      if (requestId === startRequestIdRef.current) {
        setIsStarting(false)
      }
    }
  }, [localWalletAddress, openChat, pendingIdentityReplacement])

  const handleScanQr = useCallback(() => {
    closeAndReset()
    router.push({
      pathname: '/(main)/contact/scan-qr',
      params: {
        intent: 'start-chat',
        ...(localWalletAddress ? { local: localWalletAddress } : {}),
      },
    })
  }, [closeAndReset, localWalletAddress, router])

  const handleContactPress = useCallback((contact: ChatContact) => {
    const chatAddress = contact.walletAddress || contact.identityId
    openChat(chatAddress, contact.localWalletAddress || localWalletAddress)
  }, [localWalletAddress, openChat])

  useEffect(() => {
    if (!visible || !contactQuery.trim()) return
    contactListRef.current?.scrollToOffset({
      offset: contactSearchOffsetRef.current,
      animated: false,
    })
  }, [contactQuery, visible])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={closeAndReset}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: colors.overlay }} onPress={closeAndReset}>
        <Pressable
          className="rounded-t-3xl"
          testID="start-secret-chat-sheet"
          style={{
            height: '88%',
            paddingBottom: insets.bottom + 16,
            backgroundColor: colors.backgroundSecondary,
          }}
          onPress={() => {}}
        >
          <View className="items-center pt-3 pb-2">
            <View className="w-10 h-1 rounded-full" style={{ backgroundColor: colors.border }} />
          </View>

          <View className="flex-row items-center px-5 pb-4 gap-3">
            <View className="flex-1">
              <Text className="text-lg font-bold" style={{ color: colors.text }}>
                {translate('Start Secret Chat', { ns: 'chat' })}
              </Text>
              <Text className="text-sm mt-0.5" style={{ color: colors.textMuted }}>
                {translate('Choose a contact or use a secure invitation', { ns: 'chat' })}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={translate('Close')}
              accessibilityRole="button"
              onPress={closeAndReset}
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.surface }}
              hitSlop={8}
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          {localWalletAddress ? (
            <View className="mx-5 mb-4">
              <View
                className="flex-row items-center justify-center gap-2 rounded-xl px-3 py-2.5"
                style={{ backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '20' }}
              >
                <Text className="text-xs font-medium" style={{ color: colors.primary }}>
                  {translate('Starting from {{account}}', {
                    ns: 'chat',
                    account: activeAccountName,
                  })}
                </Text>
              </View>
            </View>
          ) : null}

          <FlashList
            ref={contactListRef}
            data={contactPickerData}
            keyExtractor={getContactKey}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
            keyboardShouldPersistTaps="handled"
            maintainVisibleContentPosition={{ disabled: true }}
            showsVerticalScrollIndicator={false}
            style={{ flex: 1, minHeight: 0 }}
            ListHeaderComponent={(
              <View className="gap-4 pb-4">
                <View
                  className="rounded-2xl p-4"
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                >
                <View className="flex-row items-center gap-3 mb-3">
                  <View
                    className="w-10 h-10 rounded-xl items-center justify-center"
                    style={{ backgroundColor: colors.primary + '18' }}
                  >
                    <UserPlus size={20} color={colors.primary} />
                  </View>
                  <View className="flex-1">
                    <Text className="font-semibold" style={{ color: colors.text }}>
                      {translate(
                        lookupMode === 'address' ? 'Add by Post-Quantum Address' : 'Add by invitation',
                        { ns: lookupMode === 'address' ? 'contacts' : 'chat' },
                      )}
                    </Text>
                    <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                      {lookupMode === 'address'
                        ? translate(
                          'Enter the Post-Quantum address of the person you want to add. They must have shared their address with you.',
                          { ns: 'contacts' },
                        )
                        : translate('Paste a secure invitation or scan its QR code', { ns: 'chat' })}
                    </Text>
                  </View>
                </View>

                <View className="flex-row gap-2 mb-3">
                  <Pressable
                    accessibilityRole="button"
                    className="flex-1 rounded-xl px-3 py-2"
                    onPress={() => selectLookupMode('address')}
                    style={{
                      backgroundColor: lookupMode === 'address' ? colors.primary + '1f' : colors.backgroundTertiary,
                      borderWidth: 1,
                      borderColor: lookupMode === 'address' ? colors.primary : colors.border,
                    }}
                    testID="start-chat-lookup-exo"
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
                      backgroundColor: lookupMode === 'invite' ? colors.primary + '1f' : colors.backgroundTertiary,
                      borderWidth: 1,
                      borderColor: lookupMode === 'invite' ? colors.primary : colors.border,
                    }}
                    testID="start-chat-lookup-invitation"
                  >
                    <Text
                      className="text-center text-xs font-semibold"
                      style={{ color: lookupMode === 'invite' ? colors.primary : colors.textSecondary }}
                    >
                      {translate('Secure Contact Invitation', { ns: 'contacts' })}
                    </Text>
                  </Pressable>
                </View>

                <View className="flex-row rounded-xl px-3 items-center gap-2" style={{ backgroundColor: colors.backgroundTertiary }}>
                  <Search size={16} color={colors.textMuted} />
                  <TextInput
                    className="flex-1 py-3 text-text font-mono"
                    placeholder={translate(
                      lookupMode === 'address' ? 'EXO00...' : 'spectra:contact:v1:...',
                      { ns: 'contacts' },
                    )}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={address}
                    onChangeText={handleAddressChange}
                  />
                </View>

                {foundUser ? (
                  <View className="flex-row items-center gap-2 mt-2 ml-1">
                    <CheckCircle size={14} color={colors.success} />
                    <Text className="text-xs" style={{ color: colors.success }}>
                      {translate('Secure invitation ready', { ns: 'contacts' })}
                    </Text>
                  </View>
                ) : isValidEXOAddress(address.trim()) ? (
                  <View className="flex-row items-center gap-2 mt-2 ml-1">
                    <CheckCircle size={14} color={colors.success} />
                    <Text className="text-xs" style={{ color: colors.success }}>
                      {translate('Add by Post-Quantum Address', { ns: 'contacts' })}
                    </Text>
                  </View>
                ) : error ? (
                  <View className="flex-row items-center gap-2 mt-2 ml-1">
                    <AlertCircle size={14} color={colors.error} />
                    <Text className="flex-1 text-xs" style={{ color: colors.error }}>
                      {error}
                    </Text>
                  </View>
                ) : null}

                {pendingIdentityReplacement ? (
                  <View className="mt-3">
                    <IdentityReplacementVerification
                      replacement={pendingIdentityReplacement}
                      loading={isStarting}
                      onAccept={handleAcceptIdentityReplacement}
                    />
                  </View>
                ) : null}

                <Button
                  variant="primary"
                  fullWidth
                  className="mt-3"
                  loading={isStarting}
                  disabled={isStarting || !address.trim() || Boolean(pendingIdentityReplacement)}
                  onPress={handleStartWithAddress}
                >
                  {translate(
                    isValidEXOAddress(address.trim()) ? 'Add by Post-Quantum Address' : 'Start Chat',
                    { ns: 'contacts' },
                  )}
                </Button>
              </View>

              <Pressable
                accessibilityLabel={translate('Scan QR Code', { ns: 'contacts' })}
                accessibilityRole="button"
                className="flex-row items-center gap-4 p-4 rounded-2xl active:opacity-70"
                style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                onPress={handleScanQr}
              >
                <View
                  className="w-12 h-12 rounded-2xl items-center justify-center"
                  style={{ backgroundColor: colors.primary + '18' }}
                >
                  <QrCode size={22} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-[15px]" style={{ color: colors.text }}>
                    {translate('Scan QR Code', { ns: 'contacts' })}
                  </Text>
                  <Text className="text-[13px] mt-1" style={{ color: colors.textMuted }}>
                    {translate('Scan, add, and start a private chat', { ns: 'chat' })}
                  </Text>
                </View>
              </Pressable>

              <View onLayout={(event) => { contactSearchOffsetRef.current = event.nativeEvent.layout.y }}>
                <View className="flex-row items-center gap-2 mb-3">
                  <MessageSquarePlus size={18} color={colors.primary} />
                  <Text className="font-semibold" style={{ color: colors.text }}>
                    {translate('Select from contacts', { ns: 'chat' })}
                  </Text>
                </View>

                <View className="flex-row rounded-xl px-3 items-center gap-2 mb-3" style={{ backgroundColor: colors.surface }}>
                  <Search size={16} color={colors.textMuted} />
                  <TextInput
                    className="flex-1 py-3 text-text"
                    placeholder={translate('Search contacts...', { ns: 'contacts' })}
                    placeholderTextColor={colors.textMuted}
                    value={contactQuery}
                    onChangeText={setContactQuery}
                  />
                </View>
              </View>
            </View>
            )}
            ListEmptyComponent={(
              <View className="items-center py-6 rounded-2xl" style={{ backgroundColor: colors.surface }}>
                <Text className="font-medium" style={{ color: colors.textSecondary }}>
                  {translate('No saved contacts yet', { ns: 'chat' })}
                </Text>
                <Text className="text-xs mt-1 text-center px-8" style={{ color: colors.textMuted }}>
                  {translate('Paste a secure invitation or scan its QR code to start.', { ns: 'chat' })}
                </Text>
              </View>
            )}
            renderItem={({ item }) => (
              <ContactPickerRow
                colors={colors}
                contact={item}
                onPress={handleContactPress}
                walletNameByAddress={walletNameByAddress}
              />
            )}
          />

          <ShareContactBanner className="mb-0" />
        </Pressable>
      </Pressable>
    </Modal>
  )
})
