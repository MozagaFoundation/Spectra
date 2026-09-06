/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useState, useCallback, useMemo } from 'react'
import { 
  View, Text, Pressable, Modal, TextInput, 
  ScrollView, Alert, ActivityIndicator 
} from 'react-native'
import { X, Plus, Hash, Check, Trash2 } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useChatStore, useAuthStore } from '@/store'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { translate } from '@/lib/i18n'
import { Haptics, impactAsync as triggerImpact } from '@/lib/safeHaptics'
import { useThemeColors } from '@/lib/theme'
import { 
  createTag, deleteTag, addContactToTag, removeContactFromTag
} from '@/services/chat/tagService'
import type { UserTag } from '@/lib/types'

interface HashtagModalProps {
  visible: boolean
  onClose: () => void
  contactIdentityId: string
  contactWalletAddress?: string
  contactName: string
}

export function HashtagModal({ 
  visible, onClose, contactIdentityId, contactWalletAddress, contactName 
}: HashtagModalProps) {
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const [newTagName, setNewTagName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [showNewTagInput, setShowNewTagInput] = useState(false)
  
  const exoAddress = useAuthStore((state) => state.exoAddress)
  const tags = useChatStore((state) => state.tags)
  const contacts = useChatStore((state) => state.contacts)

  const canonicalContactWalletAddress = useMemo(() => (
    contactWalletAddress
    || contacts.find((contact) => contact.identityId === contactIdentityId)?.walletAddress
    || (contactIdentityId.startsWith('EXO') ? contactIdentityId : null)
  ), [contactIdentityId, contactWalletAddress, contacts])
  
  const contactTagIds = useMemo(() => {
    if (!canonicalContactWalletAddress) {
      return new Set<string>()
    }

    return new Set(
      tags
        .filter(t => t.contactWalletAddresses.includes(canonicalContactWalletAddress))
        .map(t => t.id)
    )
  }, [canonicalContactWalletAddress, tags])
  
  const myTags = useMemo(() => {
    return tags.filter(t => t.ownerWalletAddress === exoAddress)
  }, [tags, exoAddress])
  
  const handleCreateTag = useCallback(async () => {
    if (!exoAddress || !newTagName.trim()) return
    
    setIsCreating(true)
    triggerImpact(Haptics.ImpactFeedbackStyle.Light)
    
    const { tag, error } = await createTag(exoAddress, newTagName)
    
    if (error) {
      Alert.alert(translate('Error'), getErrorDisplayMessage(error))
    } else if (tag) {
      await addContactToTag(tag.id, canonicalContactWalletAddress || contactIdentityId)
      setNewTagName('')
      setShowNewTagInput(false)
    }
    
    setIsCreating(false)
  }, [canonicalContactWalletAddress, exoAddress, newTagName, contactIdentityId])
  
  const handleToggleTag = useCallback(async (tag: UserTag) => {
    triggerImpact(Haptics.ImpactFeedbackStyle.Light)
    
    const contactRef = canonicalContactWalletAddress || contactIdentityId
    const isInTag = !!canonicalContactWalletAddress && tag.contactWalletAddresses.includes(canonicalContactWalletAddress)
    
    if (isInTag) {
      const { error } = await removeContactFromTag(tag.id, contactRef)
      if (error) Alert.alert(translate('Error'), getErrorDisplayMessage(error))
    } else {
      const { error } = await addContactToTag(tag.id, contactRef)
      if (error) Alert.alert(translate('Error'), getErrorDisplayMessage(error))
    }
  }, [canonicalContactWalletAddress, contactIdentityId])
  
  const handleDeleteTag = useCallback(async (tag: UserTag) => {
    Alert.alert(
      translate('Delete Tag'),
      translate('Delete #{{tagName}}? This will remove the tag from all contacts.', { tagName: tag.tagName }),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate('Delete'),
          style: 'destructive',
          onPress: async () => {
            triggerImpact(Haptics.ImpactFeedbackStyle.Medium)
            const { error } = await deleteTag(tag.id)
            if (error) Alert.alert(translate('Error'), getErrorDisplayMessage(error))
          },
        },
      ]
    )
  }, [])
  
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable className="flex-1 bg-black/50" onPress={onClose}>
        <View className="flex-1" />
        
        <Pressable
          className="bg-surface rounded-t-3xl"
          style={{ paddingBottom: insets.bottom + 16, maxHeight: '70%' }}
          onPress={(e) => e.stopPropagation()}
        >
          <View className="items-center pt-3 pb-4">
            <View className="w-10 h-1 bg-border rounded-full" />
          </View>
          
          <View className="flex-row items-center justify-between px-4 pb-4">
            <View>
              <Text className="text-text text-lg font-semibold">#{translate('Tags')}</Text>
              <Text className="text-text-muted text-xs mt-0.5">
                {translate('Manage tags for {{contactName}}', { contactName })}
              </Text>
            </View>
            <Pressable onPress={onClose} className="p-2">
              <X size={20} color={colors.textTertiary} />
            </Pressable>
          </View>
          
          <ScrollView className="px-4" showsVerticalScrollIndicator={false}>
            {myTags.length > 0 && (
              <View className="mb-4">
                <Text className="text-text-muted text-xs uppercase tracking-wide mb-3">
                  {translate('Your Tags')}
                </Text>
                {myTags.map((tag) => {
                  const isActive = contactTagIds.has(tag.id)
                  return (
                    <View
                      key={tag.id}
                      className="flex-row items-center justify-between py-3 border-b border-border/50"
                    >
                      <Pressable
                        onPress={() => handleToggleTag(tag)}
                        className="flex-1 flex-row items-center gap-3"
                      >
                        <View 
                          className={`w-10 h-10 rounded-full items-center justify-center ${
                            isActive ? 'bg-primary' : 'bg-surface'
                          }`}
                          style={!isActive ? { borderWidth: 1, borderColor: colors.borderLight } : undefined}
                        >
                          {isActive ? (
                            <Check size={18} color={colors.textOnPrimary} />
                          ) : (
                            <Hash size={18} color={colors.textTertiary} />
                          )}
                        </View>
                        <View className="flex-1">
                          <Text className="text-text text-base font-medium">
                            #{tag.tagName}
                          </Text>
                          <Text className="text-text-muted text-xs">
                            {translate('{{count}} contact{{suffix}}', {
                              count: tag.contactWalletAddresses.length,
                              suffix: tag.contactWalletAddresses.length === 1 ? '' : 's',
                            })}
                          </Text>
                        </View>
                      </Pressable>
                      
                      <Pressable
                        onPress={() => handleDeleteTag(tag)}
                        className="p-2"
                        hitSlop={8}
                      >
                        <Trash2 size={16} color={colors.error} />
                      </Pressable>
                    </View>
                  )
                })}
              </View>
            )}
            
            {myTags.length === 0 && !showNewTagInput && (
              <View className="items-center py-8">
                <View className="w-16 h-16 rounded-full items-center justify-center mb-4" style={{ backgroundColor: colors.primary + '1A' }}>
                  <Hash size={28} color={colors.primary} />
                </View>
                <Text className="text-text-secondary text-center mb-2">
                  {translate('No tags yet')}
                </Text>
              </View>
            )}
            
            {showNewTagInput ? (
              <View className="mb-4">
                <Text className="text-text-muted text-xs uppercase tracking-wide mb-3">
                  {translate('New Tag')}
                </Text>
                <View className="flex-row items-center gap-2">
                  <View className="flex-1 flex-row items-center bg-background rounded-xl border border-border px-3">
                    <Hash size={16} color={colors.primary} />
                    <TextInput
                      value={newTagName}
                      onChangeText={(text) => setNewTagName(text.replace(/[^a-zA-Z0-9_]/g, ''))}
                      placeholder={translate('tagname')}
                      placeholderTextColor={colors.textMuted}
                      autoFocus
                      autoCapitalize="none"
                      maxLength={30}
                      className="flex-1 text-base py-3 px-2"
                      style={{ color: colors.text }}
                    />
                  </View>
                  
                  <Pressable
                    onPress={handleCreateTag}
                    disabled={!newTagName.trim() || isCreating}
                    className={`w-11 h-11 rounded-full items-center justify-center ${
                      newTagName.trim() ? 'bg-primary' : 'bg-surface'
                    }`}
                  >
                    {isCreating ? (
                      <ActivityIndicator size="small" color={colors.textOnPrimary} />
                    ) : (
                      <Check size={20} color={newTagName.trim() ? colors.textOnPrimary : colors.textMuted} />
                    )}
                  </Pressable>
                  
                  <Pressable
                    onPress={() => {
                      setShowNewTagInput(false)
                      setNewTagName('')
                    }}
                    className="w-11 h-11 rounded-full bg-surface items-center justify-center"
                  >
                    <X size={20} color={colors.textTertiary} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setShowNewTagInput(true)}
                className="flex-row items-center gap-3 py-3 mb-4"
              >
                <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: colors.primary + '33' }}>
                  <Plus size={20} color={colors.primary} />
                </View>
                <Text className="text-primary text-base font-medium">
                  {translate('Create new tag')}
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
