/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { Image } from 'expo-image'
import {
  Ban,
  Bell,
  BellOff,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Eraser,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Shield,
  Share2,
  Trash2,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react-native'
import { Avatar } from '@/components/common'
import { IdentityReplacementVerification } from '@/components/common/IdentityReplacementVerification'
import { Button, Card, Input } from '@/components/ui'
import {
  DIRECT_DISAPPEARING_TIMER_PRESETS_MS,
  buildDirectDisappearingTimer,
  formatDisappearingTimerDuration,
  getDisappearingTimerDescription,
  isDisappearingTimerEnabled,
} from '@/lib/disappearingMessages'
import { getCurrentLocaleTag, translate } from '@/lib/i18n'
import {
  getDirectConversationIds,
  getDirectConversationSharedContentSummary,
  type SharedAttachmentItem,
} from '@/lib/chatSharedContent'
import { isSameAccountStorageScope, matchesAccountStorageScope } from '@/lib/accountScope'
import { formatAddress } from '@/lib/utils'
import { getAttachmentPreviewUri } from '@/lib/mediaPreview'
import { useThemeColors } from '@/lib/theme'
import { useGuardedRouter } from '@/hooks/useGuardedRouter'
import {
  acceptContactIdentityReplacement,
  addContactByAddress,
  getGroupRouteParam,
  type ContactIdentityReplacement,
} from '@/services/chat'
import {
  blockContact,
  clearConversationChat,
  deleteContact,
  loadCachedMessagesForConversation,
  renameContact,
  setConversationDisappearingTimer,
  unblockContact,
} from '@/services/chat/chatService'
import { useChatStore, useGroupChatStore } from '@/store'
import { useWalletStore } from '@/store/walletStore'
import type { Conversation, GroupConversation } from '@/lib/types'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'

function Section({ children }: { children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      {children}
    </Card>
  )
}

function SectionRow({
  icon,
  title,
  subtitle,
  value,
  danger,
  onPress,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: React.ReactNode
  value?: string
  danger?: boolean
  onPress?: () => void
}) {
  const colors = useThemeColors()
  const content = (
    <View className="flex-row items-center px-4 py-3.5 gap-3">
      <View className="w-8 items-center">
        {icon}
      </View>
      <View className="flex-1">
        <Text className="text-base" style={{ color: danger ? colors.error : colors.text }}>
          {title}
        </Text>
        {typeof subtitle === 'string' ? (
          <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : subtitle ? (
          <View className="mt-0.5">
            {subtitle}
          </View>
        ) : null}
      </View>
      {value ? (
        <Text className="text-sm" style={{ color: colors.textMuted }} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {onPress ? <ChevronRight size={18} color={colors.textTertiary} /> : null}
    </View>
  )

  if (!onPress) {
    return content
  }

  return (
    <Pressable onPress={onPress} className="active:opacity-70">
      {content}
    </Pressable>
  )
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode
  label: string
  onPress: () => void
}) {
  const colors = useThemeColors()
  return (
    <Pressable onPress={onPress} className="items-center gap-2 active:opacity-75">
      <View className="w-14 h-14 rounded-full items-center justify-center" style={{ backgroundColor: colors.primary }}>
        {icon}
      </View>
      <Text className="text-sm" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
    </Pressable>
  )
}

function SharedMediaPreview({
  items,
  totalCount,
  onPress,
}: {
  items: SharedAttachmentItem[]
  totalCount: number
  onPress: () => void
}) {
  const colors = useThemeColors()
  const previewItems = items.slice(0, 3)

  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text className="text-base font-medium" style={{ color: colors.text }}>
          {translate('Media, links and docs')}
        </Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-sm" style={{ color: colors.textMuted }}>
            {totalCount}
          </Text>
          <ChevronRight size={18} color={colors.textTertiary} />
        </View>
      </View>

      {previewItems.length > 0 ? (
        <View className="flex-row gap-2 px-4 pb-4">
          {previewItems.map((item) => {
            const uri = getAttachmentPreviewUri(item.attachment)
            const isVideo = item.attachment.type === 'video' || item.attachment.mimeType?.startsWith('video/')
            return (
              <View
                key={item.key}
                className="h-24 flex-1 rounded-xl overflow-hidden items-center justify-center"
                style={{ backgroundColor: colors.surfaceHover }}
              >
                {uri ? (
                  <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <ImageIcon size={22} color={colors.textMuted} />
                )}
                {isVideo ? (
                  <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}>
                    <Video size={22} color="white" />
                  </View>
                ) : null}
              </View>
            )
          })}
        </View>
      ) : (
        <View className="px-4 pb-4">
          <Text className="text-sm" style={{ color: colors.textMuted }}>
            {totalCount > 0
              ? translate('Tap to view shared links and documents')
              : translate('No media shared yet')}
          </Text>
        </View>
      )}
    </Pressable>
  )
}

export default function ContactDetailScreen() {
  const router = useGuardedRouter()
  const insets = useSafeAreaInsets()
  const { address, local } = useLocalSearchParams<{ address: string; local?: string }>()
  const colors = useThemeColors()
  const activeWalletAddress = useWalletStore((state) => state.wallet?.address ?? null)
  const wallets = useWalletStore((state) => state.wallets)
  const localWalletAddress = local || activeWalletAddress || undefined
  const normalWalletCount = wallets.filter((wallet) => wallet.spectreMode !== true).length
  const localDisplayName = localWalletAddress
    ? wallets.find((wallet) => isSameAccountStorageScope(wallet.address, localWalletAddress))?.displayName || formatAddress(localWalletAddress, 6)
    : null

  const contacts = useChatStore((state) => state.contacts)
  const conversations = useChatStore((state) => state.conversations)
  const messages = useChatStore((state) => state.messages)
  const mutedConversationIds = useChatStore((state) => state.mutedConversationIds)
  const toggleMuteConversation = useChatStore((state) => state.toggleMuteConversation)
  const groupConversations = useGroupChatStore((state) => state.groups)
  const groupMembersById = useGroupChatStore((state) => state.members)

  const contact = contacts.find(
    c => matchesAccountStorageScope(c.localWalletAddress, localWalletAddress)
      && (c.identityId === address || c.walletAddress === address)
  )
  const [copied, setCopied] = useState(false)
  const [isEditingAlias, setIsEditingAlias] = useState(false)
  const [aliasInput, setAliasInput] = useState(contact?.displayName || '')
  const [isSavingAlias, setIsSavingAlias] = useState(false)
  const [isAddingContact, setIsAddingContact] = useState(false)
  const [pendingIdentityReplacement, setPendingIdentityReplacement] =
    useState<ContactIdentityReplacement | null>(null)
  const [newContactName, setNewContactName] = useState('')
  const isBlocked = contact?.trustState === 'blocked'
  const chatAddress = contact?.identityId || address
  const displayAddress = contact?.walletAddress || address

  const conversation: Conversation | null = useMemo(() => {
    if (!chatAddress && !displayAddress) return null
    return conversations.find((candidate) =>
      candidate.type !== 'group'
      && matchesAccountStorageScope(candidate.localWalletAddress, localWalletAddress)
      && (
        candidate.remoteIdentityId === chatAddress
        || candidate.remoteIdentityId === displayAddress
        || candidate.remoteWalletAddress === chatAddress
        || candidate.remoteWalletAddress === displayAddress
      )
    ) ?? null
  }, [chatAddress, conversations, displayAddress, localWalletAddress])

  const conversationIds = useMemo(
    () => getDirectConversationIds(chatAddress, conversation, conversations),
    [chatAddress, conversation, conversations],
  )
  const deferredMessages = useDeferredValue(messages)
  const sharedContentSummary = useMemo(
    () => getDirectConversationSharedContentSummary(deferredMessages, conversationIds),
    [deferredMessages, conversationIds],
  )
  const sharedItemCount = sharedContentSummary.totalCount
  const sharedAttachmentPreviewItems = sharedContentSummary.attachmentPreviews
  const isMuted = Boolean(conversation?.id && mutedConversationIds.includes(conversation.id))
  const disappearingTimerLabel = isDisappearingTimerEnabled(conversation?.disappearingTimer)
    ? getDisappearingTimerDescription(conversation?.disappearingTimer)
    : translate('disappearing.off')

  const groupsInCommon = useMemo(() => {
    const identityId = contact?.identityId || address
    if (!identityId) return [] as GroupConversation[]

    return groupConversations.filter((group) => {
      if (group.memberIds?.includes(identityId)) return true
      return (groupMembersById[group.groupId] || []).some((member) => member.identityId === identityId)
    })
  }, [address, contact?.identityId, groupConversations, groupMembersById])

  useEffect(() => {
    setAliasInput(contact?.displayName || '')
  }, [contact?.displayName])

  useEffect(() => {
    if (!chatAddress || !contact) return
    loadCachedMessagesForConversation(chatAddress).catch(() => {})
  }, [chatAddress, contact])

  const handleCopyAddress = useCallback(async () => {
    if (!displayAddress) return
    await Clipboard.setStringAsync(displayAddress)
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [displayAddress])

  const handleStartChat = useCallback(() => {
    if (!chatAddress) return
    const localQuery = localWalletAddress ? `?local=${encodeURIComponent(localWalletAddress)}` : ''
    router.push(`/(main)/chat/${chatAddress}${localQuery}`)
  }, [chatAddress, localWalletAddress, router])

  const handleOpenSharedMedia = useCallback(() => {
    if (!chatAddress) return
    const localQuery = localWalletAddress ? `?local=${encodeURIComponent(localWalletAddress)}` : ''
    router.push(`/(main)/contact/${chatAddress}/media${localQuery}`)
  }, [chatAddress, localWalletAddress, router])

  const handleShareContact = useCallback(async () => {
    if (!contact || !displayAddress) return
    await Share.share({
      title: contact.displayName,
      message: `${contact.displayName}\n${displayAddress}`,
    })
  }, [contact, displayAddress])

  const handleToggleMute = useCallback(() => {
    if (!conversation?.id) return
    toggleMuteConversation(conversation.id)
  }, [conversation?.id, toggleMuteConversation])

  const handleDisappearingMessages = useCallback(() => {
    if (!chatAddress) return

    Alert.alert(
      translate('Disappearing messages', { ns: 'chat' }),
      translate('Choose how long messages remain visible after they are read.'),
      [
        {
          text: translate('disappearing.off'),
          onPress: async () => {
            const result = await setConversationDisappearingTimer(chatAddress, null)
            if (result.error) Alert.alert(translate('Could not update timer'), getErrorDisplayMessage(result.error))
          },
        },
        ...DIRECT_DISAPPEARING_TIMER_PRESETS_MS.map((durationMs) => ({
          text: formatDisappearingTimerDuration(durationMs),
          onPress: async () => {
            const result = await setConversationDisappearingTimer(
              chatAddress,
              buildDirectDisappearingTimer(durationMs),
            )
            if (result.error) Alert.alert(translate('Could not update timer'), getErrorDisplayMessage(result.error))
          },
        })),
        { text: translate('Cancel'), style: 'cancel' as const },
      ],
    )
  }, [chatAddress])

  const handleClearConversation = useCallback(() => {
    if (!conversation?.id) return
    Alert.alert(translate('Clear Chat'), translate('This will remove all messages in this chat. This cannot be undone.'), [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Clear'),
        style: 'destructive',
        onPress: async () => {
          const result = await clearConversationChat(conversation.id)
          if (result.error) Alert.alert(translate('Could not clear chat'), getErrorDisplayMessage(result.error))
        },
      },
    ])
  }, [conversation?.id])

  const handleDeleteContact = useCallback(() => {
    if (!contact) return
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
          onPress: async () => {
            const result = await deleteContact(contact.identityId)

            if (result.error) {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
              Alert.alert(translate('Delete Failed'), getErrorDisplayMessage(result.error))
              return
            }

            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
            router.replace('/(main)/(tabs)/contacts')
          },
        },
      ],
    )
  }, [contact, router])

  const handleBlockContact = useCallback(() => {
    if (!contact) return
    Alert.alert(
      translate(isBlocked ? 'Unblock Contact' : 'Block Contact'),
      isBlocked
        ? translate('Unblock {{displayName}}? They will be able to send you messages again.', {
            displayName: contact.displayName,
          })
        : translate('Block {{displayName}}? You will no longer receive messages from them.', {
            displayName: contact.displayName,
          }),
      [
        { text: translate('Cancel'), style: 'cancel' },
        {
          text: translate(isBlocked ? 'Unblock' : 'Block'),
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            if (isBlocked) {
              await unblockContact(contact.identityId)
            } else {
              await blockContact(contact.identityId)
            }
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          },
        },
      ],
    )
  }, [contact, isBlocked])

  const handleSaveAlias = useCallback(async () => {
    if (!contact) return

    const newAlias = aliasInput.trim()
    if (!newAlias) {
      Alert.alert(translate('Invalid Name'), translate('Please enter a valid display name.'))
      return
    }

    setIsSavingAlias(true)
    try {
      const { error } = await renameContact(contact.identityId, newAlias)
      if (error) throw error
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setIsEditingAlias(false)
    } catch (error) {
      console.error('Failed to save alias:', error)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(translate('Save Failed'), translate('Could not save the alias. Please try again.'))
    } finally {
      setIsSavingAlias(false)
    }
  }, [aliasInput, contact])

  const handleAddContact = useCallback(async () => {
    if (!address) return

    const displayName = newContactName.trim()
    if (!displayName) {
      Alert.alert(translate('Name Required'), translate('Please enter a name for this contact.'))
      return
    }

    setIsAddingContact(true)
    try {
      const result = await addContactByAddress(address, displayName)
      if (!result.success) {
        if (result.identityReplacement) {
          setPendingIdentityReplacement(result.identityReplacement)
          return
        }
        throw new Error(result.error || translate('Failed to add contact'))
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.replace('/(main)/(tabs)/contacts')
    } catch (error) {
      console.error('Failed to add contact:', error)
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(
        translate('Add Failed'),
        getErrorDisplayMessage(error),
      )
    } finally {
      setIsAddingContact(false)
    }
  }, [address, newContactName, router])

  const handleSaveKnownContact = useCallback(async () => {
    if (!contact || isAddingContact) return
    setIsAddingContact(true)
    try {
      const result = await addContactByAddress(contact.identityId, contact.displayName)
      if (!result.success) {
        throw new Error(result.error || translate('Failed to add contact'))
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(
        translate('Add Failed'),
        getErrorDisplayMessage(error),
      )
    } finally {
      setIsAddingContact(false)
    }
  }, [contact, isAddingContact])

  const handleAcceptIdentityReplacement = useCallback(async () => {
    if (!pendingIdentityReplacement) return

    const displayName = newContactName.trim() || pendingIdentityReplacement.displayName
    setIsAddingContact(true)
    try {
      const result = await acceptContactIdentityReplacement(pendingIdentityReplacement, displayName)
      if (!result.success || !result.identityId) {
        throw new Error(result.error || translate('Failed to replace contact identity', { ns: 'contacts' }))
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setPendingIdentityReplacement(null)
      const localQuery = localWalletAddress ? `?local=${encodeURIComponent(localWalletAddress)}` : ''
      router.replace(`/(main)/chat/${result.identityId}${localQuery}`)
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      Alert.alert(
        translate('Add Failed'),
        getErrorDisplayMessage(error),
      )
    } finally {
      setIsAddingContact(false)
    }
  }, [localWalletAddress, newContactName, pendingIdentityReplacement, router])

  if (!contact && address) {
    const displayName = newContactName || formatAddress(address, 6)
    const unknownDisplayAddress = address

    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <View className="flex-row items-center px-4 py-3" style={{ paddingTop: insets.top }}>
            <Pressable onPress={() => router.back()} className="p-2 -ml-2">
              <ChevronLeft size={24} color={colors.text} />
            </Pressable>
            <Text className="text-lg font-semibold ml-2" style={{ color: colors.text }}>
              {translate('Add Contact')}
            </Text>
          </View>

          <View className="items-center px-5 gap-4 mb-6">
            <Avatar name={displayName} size="xl" previewable />
            <Text className="text-sm font-mono" style={{ color: colors.textMuted }}>
              {formatAddress(unknownDisplayAddress, 8)}
            </Text>
            {normalWalletCount > 1 && localDisplayName ? (
              <Text className="text-xs" style={{ color: colors.primary }}>
                {translate('Sending as {{account}}', { account: localDisplayName })}
              </Text>
            ) : null}
          </View>

          <View className="px-5 gap-4">
            <View className="gap-2">
              <Input
                label={translate('Contact Name')}
                placeholder={translate('Enter a name for this contact')}
                value={newContactName}
                onChangeText={(value) => {
                  setNewContactName(value)
                  setPendingIdentityReplacement(null)
                }}
              />
              <Text className="text-xs ml-1" style={{ color: colors.textMuted }}>
                {translate('This name will only be visible to you')}
              </Text>
            </View>

            {pendingIdentityReplacement ? (
              <IdentityReplacementVerification
                replacement={pendingIdentityReplacement}
                loading={isAddingContact}
                onAccept={handleAcceptIdentityReplacement}
              />
            ) : null}

            <Button
              variant="primary"
              onPress={handleAddContact}
              disabled={isAddingContact || !newContactName.trim() || Boolean(pendingIdentityReplacement)}
              icon={isAddingContact ? <ActivityIndicator size="small" color="white" /> : <UserPlus size={18} color="white" />}
            >
              {isAddingContact ? translate('Adding...') : translate('Add to Contacts')}
            </Button>

            <Button
              variant="secondary"
              onPress={() => {
                const localQuery = localWalletAddress ? `?local=${encodeURIComponent(localWalletAddress)}` : ''
                router.push(`/(main)/chat/${unknownDisplayAddress}${localQuery}`)
              }}
              icon={<MessageSquare size={18} color={colors.text} />}
            >
              {translate('Message Without Adding')}
            </Button>
          </View>
        </ScrollView>
      </View>
    )
  }

  if (!contact || !address) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.background }}>
        <Text style={{ color: colors.textSecondary }}>{translate('Contact not found')}</Text>
      </View>
    )
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
        <View className="flex-row items-center justify-between px-4 py-3" style={{ paddingTop: insets.top }}>
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ChevronLeft size={26} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => setIsEditingAlias(true)} className="px-2 py-1">
            <Text className="text-base" style={{ color: colors.text }}>
              {translate('Edit')}
            </Text>
          </Pressable>
        </View>

        <View className="items-center px-5 pb-5">
          <Avatar name={contact.displayName} imageUrl={contact.avatarUrl} size="xl" previewable />

          <View className="items-center gap-1 mt-4">
            {isEditingAlias ? (
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={aliasInput}
                  onChangeText={setAliasInput}
                  placeholder={translate('Enter alias')}
                  placeholderTextColor={colors.textTertiary}
                  className="text-2xl font-bold text-center min-w-[150px] border-b pb-1"
                  style={{ color: colors.text, borderColor: colors.primary }}
                  autoFocus
                  editable={!isSavingAlias}
                />
                {isSavingAlias ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <Pressable onPress={handleSaveAlias} className="p-2">
                      <Check size={20} color={colors.success} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        setIsEditingAlias(false)
                        setAliasInput(contact.displayName)
                      }}
                      className="p-2"
                    >
                      <X size={20} color={colors.error} />
                    </Pressable>
                  </>
                )}
              </View>
            ) : (
              <Text className="text-2xl font-bold text-center" style={{ color: colors.text }}>
                {contact.displayName}
              </Text>
            )}
            {displayAddress ? (
              <Text className="text-sm font-mono" style={{ color: colors.textMuted }}>
                {formatAddress(displayAddress, 8)}
              </Text>
            ) : null}
            {normalWalletCount > 1 && localDisplayName ? (
              <Text className="text-xs mt-1" style={{ color: colors.primary }}>
                {translate('via {{account}}', { account: localDisplayName })}
              </Text>
            ) : null}
          </View>

          <View className="flex-row justify-center gap-8 mt-6">
            <QuickAction
              icon={<MessageSquare size={24} color={colors.textOnPrimary} />}
              label={translate('Message')}
              onPress={handleStartChat}
            />
            <QuickAction
              icon={<Share2 size={24} color={colors.textOnPrimary} />}
              label={translate('Share')}
              onPress={handleShareContact}
            />
            <QuickAction
              icon={copied ? <Check size={24} color={colors.textOnPrimary} /> : <Copy size={24} color={colors.textOnPrimary} />}
              label={copied ? translate('Copied') : translate('Copy')}
              onPress={handleCopyAddress}
            />
          </View>
        </View>

        <View className="px-5 gap-4">
          {!contact.isSaved ? (
            <Section>
              <SectionRow
                icon={<UserPlus size={20} color={colors.primary} />}
                title={translate('Add to Contacts')}
                value={isAddingContact ? translate('Adding...') : undefined}
                onPress={handleSaveKnownContact}
              />
            </Section>
          ) : null}

          <Section>
            <SharedMediaPreview
              items={sharedAttachmentPreviewItems}
              totalCount={sharedItemCount}
              onPress={handleOpenSharedMedia}
            />
          </Section>

          <Section>
            <SectionRow
              icon={isMuted ? <BellOff size={20} color={colors.primary} /> : <Bell size={20} color={colors.textMuted} />}
              title={translate('Notifications')}
              value={isMuted ? translate('Muted') : translate('On')}
              onPress={handleToggleMute}
            />
            <View className="mx-4 h-px" style={{ backgroundColor: colors.border }} />
            <SectionRow
              icon={<Clock3 size={20} color={colors.textMuted} />}
              title={translate('Disappearing messages', { ns: 'chat' })}
              value={disappearingTimerLabel}
              onPress={handleDisappearingMessages}
            />
            <View className="mx-4 h-px" style={{ backgroundColor: colors.border }} />
            <SectionRow
              icon={<Shield size={20} color={isBlocked ? colors.error : contact.trustState === 'verified' ? colors.success : colors.primary} />}
              title={translate(isBlocked ? 'Blocked Contact' : contact.trustState === 'verified' ? 'Verified Contact' : 'Trusted Contact')}
              subtitle={translate(
                isBlocked
                  ? 'Messages from this contact are hidden'
                  : contact.trustState === 'verified'
                    ? 'Safety number verified'
                    : 'Trust established on first use',
              )}
            />
          </Section>

          {displayAddress ? (
            <Section>
              <SectionRow
                icon={<Copy size={20} color={colors.textMuted} />}
                title={translate('Post-Quantum Address')}
                subtitle={displayAddress}
                onPress={handleCopyAddress}
              />
            </Section>
          ) : null}

          {groupsInCommon.length > 0 ? (
            <Section>
              <View className="px-4 pt-3 pb-1">
                <Text className="text-base font-semibold" style={{ color: colors.text }}>
                  {translate('{{count}} groups in common', { count: groupsInCommon.length })}
                </Text>
              </View>
              {groupsInCommon.slice(0, 3).map((group, index) => (
                <React.Fragment key={group.groupId}>
                  {index > 0 ? <View className="mx-4 h-px" style={{ backgroundColor: colors.border }} /> : null}
                  <SectionRow
                    icon={<Users size={20} color={colors.primary} />}
                    title={group.title}
                    subtitle={translate('{{count}} member{{suffix}}', {
                      count: group.memberCount || 0,
                      suffix: (group.memberCount || 0) === 1 ? '' : 's',
                    })}
                    onPress={() => router.push(`/(main)/chat/${getGroupRouteParam(group.groupId)}`)}
                  />
                </React.Fragment>
              ))}
            </Section>
          ) : null}

          <Section>
            <SectionRow
              icon={<FileText size={20} color={colors.textMuted} />}
              title={translate('Added')}
              value={new Date(contact.addedAt).toLocaleDateString(getCurrentLocaleTag())}
            />
          </Section>

          <Section>
            <SectionRow
              icon={<Share2 size={20} color={colors.primary} />}
              title={translate('Share contact')}
              onPress={handleShareContact}
            />
            {conversation?.id ? (
              <>
                <View className="mx-4 h-px" style={{ backgroundColor: colors.border }} />
                <SectionRow
                  icon={<Eraser size={20} color={colors.error} />}
                  title={translate('Clear chat')}
                  danger
                  onPress={handleClearConversation}
                />
              </>
            ) : null}
          </Section>

          <Section>
            <SectionRow
              icon={<Ban size={20} color={isBlocked ? colors.primary : colors.error} />}
              title={translate(isBlocked ? 'Unblock Contact' : 'Block Contact')}
              danger={!isBlocked}
              onPress={handleBlockContact}
            />
            <View className="mx-4 h-px" style={{ backgroundColor: colors.border }} />
            <SectionRow
              icon={<Trash2 size={20} color={colors.error} />}
              title={translate('Delete Contact')}
              danger
              onPress={handleDeleteContact}
            />
          </Section>

          <Text className="text-xs text-center px-4" style={{ color: colors.textMuted }}>
            {displayAddress ? `${translate('Post-Quantum Address')}: ${formatAddress(displayAddress, 10)}` : ''}
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}
