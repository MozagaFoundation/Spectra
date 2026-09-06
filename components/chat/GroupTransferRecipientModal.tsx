/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { memo, useEffect, useMemo, useState } from 'react'
import { Modal, View, Text, Pressable, TextInput, FlatList } from 'react-native'
import { X, Search, ArrowRight } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Avatar } from '@/components/common'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { formatAddress } from '@/lib/utils'

export interface GroupTransferRecipient {
  identityId: string
  name: string
  walletAddress: string
  avatarUrl?: string | null
}

interface GroupTransferRecipientModalProps {
  visible: boolean
  recipients: GroupTransferRecipient[]
  onClose: () => void
  onSelect: (recipient: GroupTransferRecipient) => void
}

export const GroupTransferRecipientModal = memo(function GroupTransferRecipientModal({
  visible,
  recipients,
  onClose,
  onSelect,
}: GroupTransferRecipientModalProps) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!visible) {
      setQuery('')
    }
  }, [visible])

  const filteredRecipients = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return recipients
    return recipients.filter((recipient) =>
      recipient.name.toLowerCase().includes(trimmed)
      || recipient.identityId.toLowerCase().includes(trimmed)
      || recipient.walletAddress.toLowerCase().includes(trimmed)
    )
  }, [query, recipients])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: colors.overlay }}>
        <View
          className="rounded-t-3xl"
          style={{ minHeight: '62%', maxHeight: '84%', paddingBottom: insets.bottom + 16, backgroundColor: colors.backgroundSecondary }}
        >
          <View className="items-center pt-3 pb-2">
            <View className="w-10 h-1 rounded-full" style={{ backgroundColor: colors.border }} />
          </View>

          <View className="flex-row items-center justify-between px-4 pb-3">
            <View className="w-10" />
            <Text className="text-lg font-bold" style={{ color: colors.text }}>
              {translate('Choose Recipient')}
            </Text>
            <Pressable onPress={onClose} className="w-10 h-10 items-center justify-center">
              <X size={18} color={colors.textTertiary} />
            </Pressable>
          </View>

          <View className="px-4 pb-3">
            <View className="flex-row items-center rounded-xl px-3 gap-2" style={{ backgroundColor: colors.surface }}>
              <Search size={16} color={colors.textMuted} />
              <TextInput
                className="flex-1 py-3"
                style={{ color: colors.text }}
                placeholder={translate('Search group members...')}
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={setQuery}
              />
            </View>
          </View>

          <FlatList
            data={filteredRecipients}
            keyExtractor={(item) => item.identityId}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onSelect(item)}
                className="flex-row items-center gap-3 px-4 py-3 active:opacity-80"
              >
                <Avatar name={item.name} imageUrl={item.avatarUrl} size="md" previewable />
                <View className="flex-1">
                  <Text className="font-medium" style={{ color: colors.text }}>
                    {item.name}
                  </Text>
                  <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                    {formatAddress(item.walletAddress, 6)}
                  </Text>
                </View>
                <ArrowRight size={16} color={colors.textTertiary} />
              </Pressable>
            )}
            ListEmptyComponent={
              <View className="items-center justify-center py-16 px-6">
                <Text className="text-sm text-center" style={{ color: colors.textMuted }}>
                  {translate('No eligible recipients found in this group.')}
                </Text>
              </View>
            }
            contentContainerStyle={{ paddingBottom: 12 }}
          />
        </View>
      </View>
    </Modal>
  )
})
