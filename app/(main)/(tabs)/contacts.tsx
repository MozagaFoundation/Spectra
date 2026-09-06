/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { View, Text, TextInput, Pressable, Share, Alert } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useFocusEffect } from '@react-navigation/native'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import { Plus, Users, Search } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { Button } from '@/components/ui'
import { Avatar } from '@/components/common'
import { ListItemSkeleton } from '@/components/common/ListItemSkeleton'
import { SwipeableContactItem } from '@/components/common/SwipeableContactItem'
import { ShareContactBanner } from '@/components/chat/ShareContactBanner'
import { useChatStore } from '@/store/chatStore'
import { useWalletStore } from '@/store/walletStore'
import { normalizeAccountStorageScope } from '@/lib/accountScope'
import {
  buildContactChatRoute,
  classifyContactsDiscoveryQuery,
  excludeSavedDiscoveryMatches,
  filterAndDedupeContacts,
  getVisibleContacts,
  type ContactsDiscoveryMatch,
} from '@/lib/contactsScreen'
import { findableContactShareLink } from '@/lib/contactSharePayload'
import { formatAddress } from '@/lib/utils'
import { useThemeColors } from '@/lib/theme'
import { markListStartupMetric } from '@/lib/performanceMetrics'
import { shouldShowListSkeleton } from '@/lib/listReadiness'
import type { ChatContact } from '@/lib/types'
import { searchDiscoveryAliases } from '@/services/backend/ephemeralDiscovery'
import { addContactByAddress, deleteContact } from '@/services/chat'
import { fetchDiscoverableContactBundle } from '@/services/quantumChat'
import { readDiscoveryVisibility } from '@/services/chat/discoveryModeStorage'
import { translate } from '@/lib/i18n'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'

const SEARCH_DEBOUNCE_MS = 300

export default function ContactsScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const { t, i18n } = useTranslation('contacts')
  
  const contacts = useChatStore((state) => state.contacts)
  const contactsReady = useChatStore((state) => state.contactsReady)
  const walletAddress = useWalletStore((state) => state.wallet?.address ?? null)
  const spectreMode = useWalletStore((state) => state.wallet?.spectreMode === true)
  const wallets = useWalletStore((state) => state.wallets)
  const normalWalletCount = wallets.filter((wallet) => wallet.spectreMode !== true).length
  const walletNameByAddress = useMemo(() => {
    const names = new Map<string, string>()
    for (const wallet of wallets) {
      names.set(
        normalizeAccountStorageScope(wallet.address) || wallet.address,
        wallet.displayName || t('EXO Account'),
      )
    }
    return names
  }, [t, wallets])
  const visibleContacts = useMemo(
    () => getVisibleContacts(contacts, walletAddress),
    [contacts, walletAddress],
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [discoveryMatches, setDiscoveryMatches] = useState<ContactsDiscoveryMatch[]>([])
  const [discoverySearching, setDiscoverySearching] = useState(false)
  const [addingAddress, setAddingAddress] = useState<string | null>(null)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visibleContactsRef = useRef(visibleContacts)
  const addingAddressRef = useRef<string | null>(null)
  visibleContactsRef.current = visibleContacts
  const discoveryQuery = useMemo(
    () => classifyContactsDiscoveryQuery(debouncedQuery),
    [debouncedQuery],
  )
  const visibleDiscovery = useMemo(
    () => excludeSavedDiscoveryMatches(discoveryMatches, visibleContacts, walletAddress),
    [discoveryMatches, visibleContacts, walletAddress],
  )
  
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text)
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      setDebouncedQuery(text)
    }, SEARCH_DEBOUNCE_MS)
  }, [])

  useEffect(() => () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
  }, [])

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      if (!walletAddress || spectreMode) {
        setShareLink(null)
        return
      }
      void readDiscoveryVisibility(walletAddress)
        .then((visibility) => {
          if (!cancelled) {
            setShareLink(findableContactShareLink(walletAddress, spectreMode, visibility))
          }
        })
        .catch(() => {
          if (!cancelled) setShareLink(null)
        })
      return () => {
        cancelled = true
      }
    }, [spectreMode, walletAddress]),
  )

  useEffect(() => {
    if (discoveryQuery.kind === 'none') {
      setDiscoveryMatches([])
      setDiscoverySearching(false)
      setDiscoveryError(null)
      return
    }
    if (discoveryQuery.kind === 'exo') {
      const target = discoveryQuery.walletAddress.toLowerCase()
      const alreadySaved = visibleContactsRef.current.some(
        (contact) => contact.walletAddress?.toLowerCase() === target,
      )
      if (alreadySaved || walletAddress?.toLowerCase() === target) {
        setDiscoveryMatches([])
        setDiscoverySearching(false)
        setDiscoveryError(null)
        return
      }
    }
    const controller = new AbortController()
    setDiscoverySearching(true)
    setDiscoveryError(null)
    const load = async () => {
      try {
        if (discoveryQuery.kind === 'alias') {
          const matches = await searchDiscoveryAliases(discoveryQuery.query, { signal: controller.signal })
          if (controller.signal.aborted) return
          setDiscoveryMatches(matches)
          return
        }
        const bundle = await fetchDiscoverableContactBundle(
          discoveryQuery.walletAddress,
          controller.signal,
        )
        if (controller.signal.aborted) return
        setDiscoveryMatches(bundle ? [{ walletAddress: discoveryQuery.walletAddress }] : [])
      } catch {
        if (!controller.signal.aborted) {
          setDiscoveryMatches([])
        }
      } finally {
        if (!controller.signal.aborted) setDiscoverySearching(false)
      }
    }
    void load()
    return () => {
      controller.abort()
    }
  }, [discoveryQuery, walletAddress])
  
  const filteredContacts = useMemo(() => {
    return filterAndDedupeContacts(visibleContacts, debouncedQuery)
  }, [visibleContacts, debouncedQuery])
  const showEmptySaved = visibleContacts.length === 0 && !debouncedQuery.trim()
  
  const handleAddContact = useCallback(() => {
    router.push('/(main)/contact/add' as Parameters<typeof router.push>[0])
  }, [router])

  const handleShareSpectraLink = useCallback(() => {
    if (!shareLink) return
    void Share.share({
      message: t("I'm on Spectra. Add me: {{link}}", { link: shareLink }),
    }).catch(() => undefined)
  }, [shareLink, t])

  const handleAddDiscovered = useCallback(async (match: ContactsDiscoveryMatch) => {
    if (addingAddressRef.current) return
    addingAddressRef.current = match.walletAddress
    setDiscoveryError(null)
    setAddingAddress(match.walletAddress)
    try {
      const result = await addContactByAddress(match.walletAddress, match.alias)
      if (result.identityReplacement) {
        setDiscoveryError(t('Chat identity changed'))
        return
      }
      if (!result.success) {
        setDiscoveryError(t('Failed to add contact'))
      }
    } catch {
      setDiscoveryError(t('Failed to add contact'))
    } finally {
      addingAddressRef.current = null
      setAddingAddress(null)
    }
  }, [t])
  
  const handleContactPress = useCallback((contact: ChatContact) => {
    router.push(buildContactChatRoute(contact) as Parameters<typeof router.push>[0])
  }, [router])

  const handleDeleteContact = useCallback((contact: ChatContact) => {
    Alert.alert(
      translate('Delete Contact'),
      translate(
        'This removes {{displayName}} from this device, including the chat and its encryption session. They are not notified. This cannot be undone.',
        { displayName: contact.displayName },
      ),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Delete'),
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const result = await deleteContact(contact.identityId)
              if (result.error) {
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
                Alert.alert(translate('Delete Failed'), getErrorDisplayMessage(result.error))
                return
              }
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
            })()
          },
        },
      ],
    )
  }, [])

  const renderContact = useCallback(({ item }: { item: ChatContact }) => (
    <View className="mb-2 overflow-hidden rounded-2xl">
      <SwipeableContactItem
        contactId={item.identityId}
        onDelete={() => handleDeleteContact(item)}
      >
        <Pressable
          onPress={() => handleContactPress(item)}
          className="bg-surface p-3 active:bg-surface-hover"
        >
          <View className="flex-row items-center gap-3">
            <Avatar
              name={item.displayName}
              imageUrl={item.avatarUrl}
              size="md"
              showOnlineStatus
              isOnline={item.isOnline}
            />
            <View className="flex-1">
              <Text className="text-text font-medium mb-1">
                {item.displayName}
              </Text>
              <Text className="text-text-muted text-sm font-mono">
                {formatAddress(item.walletAddress || item.identityId, 6)}
              </Text>
              {normalWalletCount > 1 && item.localWalletAddress ? (
                <Text className="text-text-muted text-xs mt-1">
                  {t('via {{account}}', {
                    account: walletNameByAddress.get(
                      normalizeAccountStorageScope(item.localWalletAddress) || item.localWalletAddress,
                    ) || formatAddress(item.localWalletAddress, 6),
                  })}
                </Text>
              ) : null}
            </View>
            {item.trustState === 'verified' && (
              <View className="bg-success/20 px-2 py-1 rounded">
                <Text className="text-success text-xs font-medium">{t('Verified')}</Text>
              </View>
            )}
          </View>
        </Pressable>
      </SwipeableContactItem>
    </View>
  ), [handleContactPress, handleDeleteContact, normalWalletCount, t, walletNameByAddress])
  
  const keyExtractor = useCallback(
    (item: ChatContact) => `${item.localWalletAddress || 'active'}:${item.walletAddress || item.identityId}`,
    [],
  )
  const handleListLoad = useCallback(() => {
    markListStartupMetric('contacts_first_paint', {
      count: filteredContacts.length,
      routeClass: 'contacts',
    })
  }, [filteredContacts.length])
  const discoveryFooter = useMemo(() => {
    if (discoveryQuery.kind === 'none' && !discoverySearching) return null
    return (
      <View className="pt-2 pb-4">
        {discoverySearching ? (
          <Text className="text-text-muted text-xs mb-3">
            {discoveryQuery.kind === 'exo' ? t('Looking up user...') : t('Searching aliases…')}
          </Text>
        ) : null}
        {visibleDiscovery.length > 0 ? (
          <View className="gap-2">
            <Text className="text-text-muted text-xs font-semibold mb-1">
              {t('Found on Spectra')}
            </Text>
            {visibleDiscovery.map((match) => (
              <View
                key={match.walletAddress}
                className="bg-surface rounded-2xl p-3 flex-row items-center gap-3"
              >
                <View className="flex-1 min-w-0">
                  <Text className="text-text font-medium" numberOfLines={1}>
                    {match.alias || formatAddress(match.walletAddress, 6)}
                  </Text>
                  <Text className="text-text-muted text-sm font-mono mt-1">
                    {formatAddress(match.walletAddress, 6)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Add')}
                  disabled={Boolean(addingAddress)}
                  onPress={() => { void handleAddDiscovered(match) }}
                  className="bg-primary px-3 py-2 rounded-xl"
                >
                  <Text className="text-onPrimary font-semibold">{t('Add')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {discoveryError ? (
          <Text className="text-error text-xs mt-2">{discoveryError}</Text>
        ) : null}
      </View>
    )
  }, [
    addingAddress,
    discoveryError,
    discoveryQuery.kind,
    discoverySearching,
    handleAddDiscovered,
    t,
    visibleDiscovery,
  ])
  
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="px-5 pb-3 gap-4">
        <View className="flex-row justify-between items-center">
          <Text className="text-2xl font-bold text-text">{t('Contacts')}</Text>
          <Pressable
            onPress={handleAddContact}
            className="flex-row items-center bg-primary px-3 py-2 rounded-xl gap-1"
          >
            <Plus size={18} color={colors.textOnPrimary} />
            <Text className="text-onPrimary font-semibold">{t('Add')}</Text>
          </Pressable>
        </View>
        
        <View className="flex-row bg-surface rounded-xl px-3 items-center gap-2">
          <Search size={18} color={colors.textMuted} />
          <TextInput
            className="flex-1 py-3 text-text"
            placeholder={t('Search or filter contacts')}
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>
      
      {shouldShowListSkeleton(contactsReady, visibleContacts.length > 0) ? (
        <ListItemSkeleton />
      ) : showEmptySaved ? (
        <View className="flex-1 items-center justify-center px-5">
          <View className="w-20 h-20 rounded-3xl items-center justify-center mb-5"
            style={{ backgroundColor: colors.primary + '1a' }}>
            <Users size={36} color={colors.primary} />
          </View>
          <Text className="text-text-secondary text-lg text-center mb-2">
            {t('No contacts yet')}
          </Text>
          <Text className="text-text-muted text-center mb-5 max-w-[260px]">
            {t('Add contacts by their Post-Quantum address to start secure conversations')}
          </Text>
          <View className="items-center gap-3">
            <Button variant="primary" onPress={handleAddContact}>
              {t('Add Contact')}
            </Button>
            {shareLink ? (
              <Button variant="secondary" onPress={handleShareSpectraLink}>
                {t('Share my Spectra link')}
              </Button>
            ) : null}
          </View>
        </View>
      ) : (
        <FlashList
          data={filteredContacts}
          renderItem={renderContact}
          keyExtractor={keyExtractor}
          extraData={i18n.resolvedLanguage}
          contentContainerStyle={{ padding: 16 }}
          onLoad={handleListLoad}
          ListEmptyComponent={
            visibleDiscovery.length > 0 || discoverySearching ? null : (
              <View className="items-center py-8">
                <Text className="text-text-secondary text-center">
                  {t('No matching contacts')}
                </Text>
              </View>
            )
          }
          ListFooterComponent={discoveryFooter}
        />
      )}
      <ShareContactBanner variant="tabStrip" />
    </View>
  )
}
