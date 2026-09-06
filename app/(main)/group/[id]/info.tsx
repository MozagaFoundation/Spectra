/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import {
  ArrowLeft,
  ChevronRight,
  Clock3,
  Crown,
  FileText,
  Image as ImageIcon,
  LogOut,
  MessageSquare,
  Shield,
  UserPlus,
  Users,
  Video,
} from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import { Avatar } from '@/components/common'
import { Button, Card } from '@/components/ui'
import { RecipientSelector } from '@/components/shared/RecipientSelector'
import {
  GROUP_DISAPPEARING_TIMER_PRESETS_MS,
  formatDisappearingTimerDuration,
  getDisappearingTimerDescription,
} from '@/lib/disappearingMessages'
import {
  getSharedChatContentSummary,
  type SharedAttachmentItem,
} from '@/lib/chatSharedContent'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { canManageGroupDisappearingTimer } from '@/lib/groupChatPermissions'
import { getCurrentLocaleTag, translate } from '@/lib/i18n'
import { getAttachmentPreviewUri } from '@/lib/mediaPreview'
import { useThemeColors } from '@/lib/theme'
import { useChatStore, useGroupChatStore } from '@/store'
import { formatAddress } from '@/lib/utils'
import {
  MAX_GROUP_CHAT_MEMBERS,
  addGroupMembers,
  getGroupRouteParam,
  leaveGroup,
  loadGroupMessages,
  updateGroupAvatar,
  updateGroupDisappearingTimer,
  uploadGroupAvatar,
} from '@/services/chat'
import type { ChatContact, GroupChatMember } from '@/lib/types'

const EMPTY: never[] = []

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

function roleLabel(role?: string): string {
  switch (role) {
    case 'owner':
      return translate('Owner')
    case 'admin':
      return translate('Admin')
    default:
      return translate('Member')
  }
}

function roleWeight(role?: string): number {
  switch (role) {
    case 'owner':
      return 0
    case 'admin':
      return 1
    default:
      return 2
  }
}

function getMemberDisplayName(member: GroupChatMember, contact?: ChatContact): string {
  return member.displayName || contact?.displayName || formatAddress(member.identityId, 6)
}

export default function GroupInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()

  const group = useGroupChatStore((state) => state.groups.find((entry) => entry.groupId === id))
  const members = useGroupChatStore((state) => state.members[id || ''] ?? EMPTY)
  const groupMessages = useGroupChatStore((state) => state.messages[id || ''] ?? EMPTY)
  const contacts = useChatStore((state) => state.contacts)
  const [isLeaving, setIsLeaving] = useState(false)
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)
  const [isUpdatingTimer, setIsUpdatingTimer] = useState(false)
  const [isAddingMembers, setIsAddingMembers] = useState(false)
  const [showAddMembers, setShowAddMembers] = useState(false)
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const canEditPhoto = group?.myRole === 'owner' || group?.myRole === 'admin'
  const canEditTimer = canManageGroupDisappearingTimer(group?.myRole)
  const canManageMembers = group?.myRole === 'owner' || group?.myRole === 'admin'
  const memberCount = members.length || group?.memberCount || 0
  const maxMemberCount = group?.maxMembers || MAX_GROUP_CHAT_MEMBERS
  const availableMemberSlots = Math.max(0, maxMemberCount - memberCount)
  const deferredGroupMessages = useDeferredValue(groupMessages)
  const sharedContentSummary = useMemo(
    () => getSharedChatContentSummary(deferredGroupMessages),
    [deferredGroupMessages],
  )

  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const roleDiff = roleWeight(a.role) - roleWeight(b.role)
      if (roleDiff !== 0) return roleDiff

      return (a.displayName || a.walletAddress || a.identityId).localeCompare(
        b.displayName || b.walletAddress || b.identityId,
        getCurrentLocaleTag(),
      )
    })
  }, [members])

  const currentMemberIds = useMemo(
    () => new Set(
      members.length > 0
        ? members.map((member) => member.identityId)
        : group?.memberIds ?? [],
    ),
    [group?.memberIds, members],
  )
  const addableContacts = useMemo(
    () => contacts.filter((contact) =>
      Boolean(contact.identityId)
      && contact.trustState !== 'blocked'
      && !currentMemberIds.has(contact.identityId)
    ),
    [contacts, currentMemberIds],
  )
  const selectionLimitMessage = translate('{{selected}}/{{max}} members selected', {
    selected: selectedMemberIds.length,
    max: availableMemberSlots,
  })

  useEffect(() => {
    if (!id) return
    loadGroupMessages(id).catch((error) => {
      console.warn('Failed to load group messages for profile:', error)
    })
  }, [id])

  const handleOpenChat = useCallback(() => {
    if (!id) return
    router.push(`/(main)/chat/${getGroupRouteParam(id)}` as Href)
  }, [id, router])

  const handleOpenSharedMedia = useCallback(() => {
    if (!id) return
    router.push(`/(main)/group/${id}/media` as Href)
  }, [id, router])

  const handleOpenAddMembers = useCallback(() => {
    if (!canManageMembers) return
    if (availableMemberSlots <= 0) {
      Alert.alert(
        translate('Group limit reached'),
        translate('Encrypted groups support up to {{count}} members total.', {
          count: maxMemberCount,
        }),
      )
      return
    }
    setSelectedMemberIds([])
    setShowAddMembers(true)
  }, [availableMemberSlots, canManageMembers, maxMemberCount])

  const handleAddMembers = useCallback(async () => {
    if (!id || !canManageMembers || selectedMemberIds.length === 0 || isAddingMembers) return

    setIsAddingMembers(true)
    try {
      await addGroupMembers(id, selectedMemberIds)
      setSelectedMemberIds([])
      setShowAddMembers(false)
    } catch (error) {
      Alert.alert(translate('Could not add members'), getErrorDisplayMessage(error))
    } finally {
      setIsAddingMembers(false)
    }
  }, [canManageMembers, id, isAddingMembers, selectedMemberIds])

  const handleMemberPress = useCallback((member: GroupChatMember) => {
    const address = member.identityId || member.walletAddress
    if (!address) return
    router.push(`/(main)/contact/${address}` as Href)
  }, [router])

  const handleLeave = useCallback(() => {
    if (!id || isLeaving) return

    Alert.alert(translate('Leave Group'), translate('You will stop receiving messages from this group.'), [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Leave'),
        style: 'destructive',
        onPress: async () => {
          try {
            setIsLeaving(true)
            await leaveGroup(id)
            router.dismissAll()
            router.replace('/(main)/(tabs)/chats' as Href)
          } catch (error) {
            Alert.alert(translate('Could not leave group'), getErrorDisplayMessage(error))
          } finally {
            setIsLeaving(false)
          }
        },
      },
    ])
  }, [id, isLeaving, router])

  const handlePickImage = useCallback(async () => {
    if (!id || !canEditPhoto || isUploadingPhoto) return

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert(
        translate('Permission Required'),
        translate('Please allow access to your photo library to change the group photo.'),
      )
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    setIsUploadingPhoto(true)
    try {
      const uploadResult = await uploadGroupAvatar(
        id,
        asset.uri,
        asset.mimeType || 'image/jpeg',
        asset.fileName || group?.title || translate('group-photo')
      )
      if (uploadResult.error || !uploadResult.url) {
        throw uploadResult.error || new Error(translate('Upload failed'))
      }

      const updateResult = await updateGroupAvatar(id, uploadResult.url)
      if (updateResult.error) {
        throw updateResult.error
      }
    } catch (error) {
      Alert.alert(
        translate('Upload Failed'),
        getErrorDisplayMessage(error) || translate('Could not update the group photo.'),
      )
    } finally {
      setIsUploadingPhoto(false)
    }
  }, [canEditPhoto, group?.title, id, isUploadingPhoto])

  const handleUpdateTimer = useCallback(async (durationMs: number | null) => {
    if (!id || !canEditTimer || isUpdatingTimer) return
    try {
      setIsUpdatingTimer(true)
      const result = await updateGroupDisappearingTimer(id, durationMs)
      if (result.error) {
        throw result.error
      }
    } catch (error) {
      Alert.alert(translate('Could not update timer'), getErrorDisplayMessage(error))
    } finally {
      setIsUpdatingTimer(false)
    }
  }, [canEditTimer, id, isUpdatingTimer])

  if (!group || !id) {
    return (
      <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: colors.background }}>
        <Text className="text-lg font-semibold mb-2" style={{ color: colors.text }}>
          {translate('Group not found')}
        </Text>
        <Text className="text-sm text-center mb-6" style={{ color: colors.textMuted }}>
          {translate('This group may have been removed or is no longer available on this device.')}
        </Text>
        <Button variant="secondary" onPress={() => router.back()}>
          {translate('Go Back')}
        </Button>
      </View>
    )
  }

  if (showAddMembers && group && id) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background, paddingTop: insets.top }}>
        <View className="flex-row items-center gap-3 px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Pressable
            onPress={() => {
              setSelectedMemberIds([])
              setShowAddMembers(false)
            }}
            hitSlop={12}
          >
            <ArrowLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="text-lg font-bold flex-1" style={{ color: colors.text }}>
            {translate('Add Members')}
          </Text>
          <Text className="text-xs font-medium" style={{ color: colors.textMuted }}>
            {selectionLimitMessage}
          </Text>
        </View>
        <RecipientSelector
          contacts={addableContacts}
          selectedIds={selectedMemberIds}
          onSelectionChange={setSelectedMemberIds}
          onDone={handleAddMembers}
          selectionLimit={availableMemberSlots}
          selectionLimitMessage={selectionLimitMessage}
          doneLoading={isAddingMembers}
          doneDisabled={isAddingMembers}
          doneLabel={
            isAddingMembers
              ? translate('Adding...')
              : translate('Add {{count}}', { count: selectedMemberIds.length })
          }
        />
      </View>
    )
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
        <View className="flex-row items-center justify-between px-4 py-3" style={{ paddingTop: insets.top }}>
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <ArrowLeft size={26} color={colors.text} />
          </Pressable>
          {canEditPhoto ? (
            <Pressable onPress={handlePickImage} disabled={isUploadingPhoto} className="px-2 py-1">
              <Text className="text-base" style={{ color: colors.text }}>
                {isUploadingPhoto ? translate('Uploading...') : translate('Edit')}
              </Text>
            </Pressable>
          ) : (
            <View className="w-12" />
          )}
        </View>

        <View className="items-center px-5 pb-5">
          <Pressable onPress={canEditPhoto ? handlePickImage : undefined} disabled={!canEditPhoto || isUploadingPhoto}>
            <View className="items-center">
              <Avatar name={group.title} imageUrl={group.avatarUrl} size="xl" previewable />
              {isUploadingPhoto ? (
                <View className="mt-3">
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : null}
            </View>
          </Pressable>

          <View className="items-center gap-1 mt-4">
            <Text className="text-2xl font-bold text-center" style={{ color: colors.text }}>
              {group.title}
            </Text>
            {group.subtitle ? (
              <Text className="text-sm text-center" style={{ color: colors.textSecondary }}>
                {group.subtitle}
              </Text>
            ) : null}
            <Text className="text-sm" style={{ color: colors.textMuted }}>
              {translate('{{count}} member{{suffix}}', {
                count: memberCount,
                suffix: memberCount === 1 ? '' : 's',
              })}
            </Text>
          </View>

          <View className="flex-row justify-center gap-8 mt-6">
            <QuickAction
              icon={<MessageSquare size={24} color={colors.textOnPrimary} />}
              label={translate('Message')}
              onPress={handleOpenChat}
            />
            <QuickAction
              icon={<ImageIcon size={24} color={colors.textOnPrimary} />}
              label={translate('Media')}
              onPress={handleOpenSharedMedia}
            />
            {canManageMembers ? (
              <QuickAction
                icon={<UserPlus size={24} color={colors.textOnPrimary} />}
                label={translate('Add')}
                onPress={handleOpenAddMembers}
              />
            ) : null}
          </View>
        </View>

        <View className="px-5 gap-4">
          <Section>
            <SharedMediaPreview
              items={sharedContentSummary.attachmentPreviews}
              totalCount={sharedContentSummary.totalCount}
              onPress={handleOpenSharedMedia}
            />
          </Section>

          <Section>
            <SectionRow
              icon={<Users size={20} color={colors.primary} />}
              title={translate('Members')}
              subtitle={translate('{{count}} people in this group', { count: memberCount })}
              value={`${memberCount}/${maxMemberCount}`}
            />
            {canManageMembers ? (
              <>
                <View className="mx-4 h-px" style={{ backgroundColor: colors.border }} />
                <SectionRow
                  icon={<UserPlus size={20} color={availableMemberSlots > 0 ? colors.primary : colors.textMuted} />}
                  title={translate('Add user')}
                  subtitle={
                    availableMemberSlots > 0
                      ? translate('{{count}} slots available', { count: availableMemberSlots })
                      : translate('Group limit reached')
                  }
                  onPress={handleOpenAddMembers}
                />
              </>
            ) : null}
          </Section>

          <Section>
            <SectionRow
              icon={<Clock3 size={20} color={colors.primary} />}
              title={translate('Disappearing messages')}
              subtitle={canEditTimer
                ? translate('New group messages disappear based on send time.')
                : translate('Only group owners and admins can change disappearing messages.')}
              value={getDisappearingTimerDescription(group.disappearingTimer)}
            />
            <View className="px-4 pb-4">
              <View className="flex-row flex-wrap gap-2">
                <Pressable
                  onPress={() => handleUpdateTimer(null)}
                  disabled={!canEditTimer || isUpdatingTimer}
                  className="px-3 py-2 rounded-full"
                  style={{
                    backgroundColor: !group.disappearingTimer ? colors.primary + '22' : colors.background,
                    borderWidth: 1,
                    borderColor: !group.disappearingTimer ? colors.primary : colors.border,
                    opacity: !canEditTimer && !isUpdatingTimer ? 0.6 : 1,
                  }}
                >
                  <Text style={{ color: !group.disappearingTimer ? colors.primary : colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                    {translate('Off')}
                  </Text>
                </Pressable>
                {GROUP_DISAPPEARING_TIMER_PRESETS_MS.map((durationMs) => {
                  const selected = group.disappearingTimer?.durationMs === durationMs
                  return (
                    <Pressable
                      key={durationMs}
                      onPress={() => handleUpdateTimer(durationMs)}
                      disabled={!canEditTimer || isUpdatingTimer}
                      className="px-3 py-2 rounded-full"
                      style={{
                        backgroundColor: selected ? colors.primary + '22' : colors.background,
                        borderWidth: 1,
                        borderColor: selected ? colors.primary : colors.border,
                        opacity: !canEditTimer && !isUpdatingTimer ? 0.6 : 1,
                      }}
                    >
                      <Text style={{ color: selected ? colors.primary : colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                        {formatDisappearingTimerDuration(durationMs)}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          </Section>

          <Section>
            <View className="px-4 pt-3 pb-1">
              <Text className="text-base font-semibold" style={{ color: colors.text }}>
                {translate('Group members')}
              </Text>
            </View>
            {sortedMembers.map((member, index) => {
              const contact = contacts.find((entry) => entry.identityId === member.identityId)
              const displayName = getMemberDisplayName(member, contact)
              const badgeIcon = member.role === 'owner' ? (
                <Crown size={14} color={colors.warning} />
              ) : member.role === 'admin' ? (
                <Shield size={14} color={colors.primary} />
              ) : null

              return (
                <React.Fragment key={`${member.groupId}-${member.identityId}`}>
                  {index > 0 ? <View className="mx-4 h-px" style={{ backgroundColor: colors.border }} /> : null}
                  <Pressable
                    onPress={() => handleMemberPress(member)}
                    className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
                  >
                    <Avatar name={displayName} imageUrl={contact?.avatarUrl} size="md" />
                    <View className="flex-1">
                      <Text className="font-medium" style={{ color: colors.text }}>
                        {displayName}
                      </Text>
                      <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                        {member.walletAddress ? formatAddress(member.walletAddress, 6) : formatAddress(member.identityId, 6)}
                      </Text>
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      {badgeIcon}
                      <Text className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                        {roleLabel(member.role)}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={colors.textTertiary} />
                  </Pressable>
                </React.Fragment>
              )
            })}
          </Section>

          <Section>
            <SectionRow
              icon={<FileText size={20} color={colors.textMuted} />}
              title={translate('Created')}
              value={new Date(group.createdAt).toLocaleDateString(getCurrentLocaleTag())}
            />
          </Section>

          <Section>
            <Pressable onPress={handleLeave} disabled={isLeaving} className="active:opacity-70">
              <View className="flex-row items-center px-4 py-3.5 gap-3">
                <View className="w-8 items-center">
                  {isLeaving ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <LogOut size={20} color={colors.error} />
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-base" style={{ color: colors.error }}>
                    {translate('Leave Group')}
                  </Text>
                  <Text className="text-xs mt-0.5" style={{ color: colors.textMuted }}>
                    {translate('You will stop receiving messages from this group.')}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.textTertiary} />
              </View>
            </Pressable>
          </Section>
        </View>
      </ScrollView>
    </View>
  )
}
