/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo, useCallback, useMemo, useState } from 'react'
import { View, Text, TextInput, Pressable, FlatList } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Search, Check, X, Users } from 'lucide-react-native'
import { Avatar } from '@/components/common'
import { Button } from '@/components/ui'
import { translate } from '@/lib/i18n'
import { formatAddress } from '@/lib/utils'
import { useThemeColors } from '@/lib/theme'
import { sortContactsAlphabetically } from '@/lib/contactsScreen'
import type { ChatContact } from '@/lib/types'

interface RecipientSelectorProps {
  contacts: ChatContact[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  onDone: () => void
  selectionLimit?: number | null
  selectionLimitMessage?: string | null
  doneLoading?: boolean
  doneDisabled?: boolean
  doneLabel?: string
}

export const RecipientSelector = memo(function RecipientSelector({
  contacts,
  selectedIds,
  onSelectionChange,
  onDone,
  selectionLimit = null,
  selectionLimitMessage = null,
  doneLoading = false,
  doneDisabled = false,
  doneLabel,
}: RecipientSelectorProps) {
  const colors = useThemeColors()
  useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const contactsByIdentityId = useMemo(
    () => new Map(contacts.map((contact) => [contact.identityId, contact])),
    [contacts],
  )
  const selectedContacts = useMemo(
    () =>
      selectedIds
        .map((id) => contactsByIdentityId.get(id))
        .filter((contact): contact is ChatContact => Boolean(contact)),
    [contactsByIdentityId, selectedIds],
  )
  const selectionLimitReached = selectionLimit !== null && selectedIds.length >= selectionLimit

  const filteredContacts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase()
    const base = !normalizedQuery
      ? contacts
      : contacts.filter(
          (contact) =>
            contact.displayName.toLowerCase().includes(normalizedQuery) ||
            contact.identityId.toLowerCase().includes(normalizedQuery) ||
            (contact.walletAddress && contact.walletAddress.toLowerCase().includes(normalizedQuery)),
        )

    return sortContactsAlphabetically(base)
  }, [contacts, searchQuery])

  const toggleContact = useCallback(
    (identityId: string) => {
      if (selectedIdSet.has(identityId)) {
        onSelectionChange(selectedIds.filter((id) => id !== identityId))
        return
      }

      if (!selectionLimitReached) {
        onSelectionChange([...selectedIds, identityId])
      }
    },
    [onSelectionChange, selectedIdSet, selectedIds, selectionLimitReached],
  )

  const renderContact = useCallback(
    ({ item }: { item: ChatContact }) => {
      const isSelected = selectedIdSet.has(item.identityId)
      const isDisabled = !isSelected && selectionLimitReached
      return (
        <Pressable
          onPress={() => toggleContact(item.identityId)}
          disabled={isDisabled}
          className="flex-row items-center gap-3 px-4 py-3 active:bg-surface-hover"
          style={{ opacity: isDisabled ? 0.45 : 1 }}
        >
          <Avatar name={item.displayName} imageUrl={item.avatarUrl} size="md" />
          <View className="flex-1">
            <Text className="font-medium" style={{ color: colors.text }}>
              {item.displayName}
            </Text>
            {item.walletAddress && (
              <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                {formatAddress(item.walletAddress, 6)}
              </Text>
            )}
          </View>
          <View
            className="w-6 h-6 rounded-full items-center justify-center"
            style={{
              backgroundColor: isSelected ? colors.primary : 'transparent',
              borderWidth: isSelected ? 0 : 2,
              borderColor: colors.border,
            }}
          >
            {isSelected && <Check size={14} color="white" />}
          </View>
        </Pressable>
      )
    },
    [colors, selectedIdSet, selectionLimitReached, toggleContact],
  )

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center gap-2 mb-3">
          <Users size={16} color={colors.primary} />
          <Text className="font-semibold" style={{ color: colors.text }}>
            {translate('{{count}} selected{{suffix}}', {
              count: selectedIds.length,
              suffix: selectedIds.length === 1 ? '' : 's',
            })}
          </Text>
        </View>
        {selectionLimitMessage ? (
          <Text
            className="text-xs mb-3"
            style={{ color: selectionLimitReached ? colors.warning : colors.textMuted }}
          >
            {selectionLimitMessage}
          </Text>
        ) : null}

        {selectedContacts.length > 0 && (
          <View className="flex-row flex-wrap gap-2 mb-3">
            {selectedContacts.map((contact) => (
              <Pressable
                key={contact.identityId}
                onPress={() => toggleContact(contact.identityId)}
                className="flex-row items-center gap-1.5 px-2.5 py-1.5 rounded-full"
                style={{ backgroundColor: colors.primary + '20' }}
              >
                <Text className="text-xs font-medium" style={{ color: colors.primary }}>
                  {contact.displayName}
                </Text>
                <X size={12} color={colors.primary} />
              </Pressable>
            ))}
          </View>
        )}

        <View className="flex-row items-center rounded-xl px-3 gap-2" style={{ backgroundColor: colors.surface }}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            className="flex-1 py-2.5 text-sm"
            style={{ color: colors.text }}
            placeholder={translate('Search contacts...')}
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <FlatList
        data={filteredContacts}
        renderItem={renderContact}
        keyExtractor={(item) => item.identityId}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text style={{ color: colors.textMuted }}>{translate('No contacts found')}</Text>
          </View>
        }
      />

      <View className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-3" style={{ backgroundColor: colors.backgroundSecondary }}>
        <Button
          variant="primary"
          fullWidth
          onPress={onDone}
          loading={doneLoading}
          disabled={selectedIds.length === 0 || doneDisabled}
        >
          {doneLabel ?? translate('Done ({{count}})', { count: selectedIds.length })}
        </Button>
      </View>
    </View>
  )
})
