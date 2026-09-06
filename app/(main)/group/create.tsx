/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, Pressable, ScrollView, Alert } from 'react-native'
import { KeyboardAvoidingView } from '@/components/ui/KeyboardAvoidingView'
import { useRouter, type Href } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ArrowLeft, Users, Shield } from 'lucide-react-native'
import { Button } from '@/components/ui'
import { RecipientSelector } from '@/components/shared/RecipientSelector'
import { translate } from '@/lib/i18n'
import { useThemeColors } from '@/lib/theme'
import { useChatStore } from '@/store'
import { createEncryptedGroup, getGroupRouteParam, MAX_GROUP_CHAT_MEMBERS } from '@/services/groupChat'

export default function CreateGroupScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colors = useThemeColors()
  const contacts = useChatStore((state) => state.contacts)

  const [step, setStep] = useState<'details' | 'members'>('details')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([])
  const [isCreating, setIsCreating] = useState(false)
  const creationInFlightRef = useRef(false)

  const maxSelectableMembers = MAX_GROUP_CHAT_MEMBERS - 1
  const helperText = useMemo(
    () =>
      translate('{{selected}}/{{max}} members selected', {
        selected: selectedMemberIds.length,
        max: maxSelectableMembers,
      }),
    [selectedMemberIds, maxSelectableMembers]
  )

  const handleSelectionChange = useCallback((ids: string[]) => {
    if (ids.length > maxSelectableMembers) {
      Alert.alert(
        translate('Group limit reached'),
        translate('Encrypted groups support up to {{count}} members total.', {
          count: MAX_GROUP_CHAT_MEMBERS,
        }),
      )
      return
    }
    setSelectedMemberIds(ids)
  }, [maxSelectableMembers])

  const handleCreate = useCallback(async () => {
    if (creationInFlightRef.current) return

    if (!title.trim()) {
      Alert.alert(translate('Missing title'), translate('Enter a group name to continue.'))
      return
    }
    if (selectedMemberIds.length === 0) {
      setStep('members')
      return
    }

    creationInFlightRef.current = true
    setIsCreating(true)
    try {
      const group = await createEncryptedGroup({
        title: title.trim(),
        description: description.trim() || undefined,
        memberIdentityIds: selectedMemberIds,
      })

      router.replace(`/(main)/chat/${getGroupRouteParam(group.groupId)}` as Href)
    } catch (error) {
      Alert.alert(translate('Could not create group'), (error as Error).message)
    } finally {
      creationInFlightRef.current = false
      setIsCreating(false)
    }
  }, [title, description, selectedMemberIds, router])

  if (step === 'members') {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background, paddingTop: insets.top }}>
        <View className="flex-row items-center gap-3 px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Pressable onPress={() => setStep('details')} hitSlop={12}>
            <ArrowLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="text-lg font-bold flex-1" style={{ color: colors.text }}>
            {translate('Add Members')}
          </Text>
          <Text className="text-xs font-medium" style={{ color: colors.textMuted }}>
            {helperText}
          </Text>
        </View>
        <RecipientSelector
          contacts={contacts}
          selectedIds={selectedMemberIds}
          onSelectionChange={handleSelectionChange}
          onDone={handleCreate}
          doneLoading={isCreating}
          doneDisabled={isCreating}
          doneLabel={
            isCreating
              ? translate('Create Encrypted Group ({{count}} members)', {
                count: selectedMemberIds.length + 1,
              })
              : undefined
          }
        />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center gap-3 px-4 py-3">
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft size={24} color={colors.text} />
          </Pressable>
          <Text className="text-xl font-bold flex-1" style={{ color: colors.text }}>
            {translate('New Encrypted Group')}
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="gap-5 pt-4">
          <View className="rounded-2xl p-4" style={{ backgroundColor: colors.primary + '12' }}>
            <View className="flex-row items-center gap-3 mb-2">
              <Shield size={18} color={colors.primary} />
              <Text className="font-semibold" style={{ color: colors.text }}>
                {translate('Encrypted group sender keys')}
              </Text>
            </View>
            <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
              {translate(
                'Group keys are distributed through your existing encrypted direct sessions. Removing a member rotates the active group key automatically.',
              )}
            </Text>
          </View>

          <View>
            <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {translate('Group Name *')}
            </Text>
            <TextInput
              className="rounded-xl px-4 py-3.5 text-base"
              style={{ backgroundColor: colors.surface, color: colors.text }}
              placeholder={translate('Enter group name')}
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />
          </View>

          <View>
            <Text className="text-sm font-medium mb-2" style={{ color: colors.textSecondary }}>
              {translate('Description')}
            </Text>
            <TextInput
              className="rounded-xl px-4 py-3.5 text-base"
              style={{ backgroundColor: colors.surface, color: colors.text, minHeight: 84 }}
              placeholder={translate('Optional group description')}
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={240}
            />
          </View>

          <View className="rounded-xl p-4" style={{ backgroundColor: colors.surface }}>
            <View className="flex-row items-center gap-3 mb-2">
              <Users size={18} color={colors.primary} />
              <Text className="font-medium" style={{ color: colors.text }}>
                {translate('Members')}
              </Text>
            </View>
            <Text className="text-xs mb-3" style={{ color: colors.textMuted }}>
              {translate(
                'Add between 1 and {{max}} contacts now. The full group, including you, is capped at {{count}} members.',
                {
                  max: maxSelectableMembers,
                  count: MAX_GROUP_CHAT_MEMBERS,
                },
              )}
            </Text>
            {selectedMemberIds.length > 0 && (
              <Text className="text-sm font-medium mb-2" style={{ color: colors.primary }}>
                {helperText}
              </Text>
            )}
            <Button variant="secondary" onPress={() => setStep('members')}>
              {selectedMemberIds.length > 0 ? translate('Edit Members') : translate('Select Members')}
            </Button>
          </View>
        </View>
      </ScrollView>

      <View className="px-5 pb-4" style={{ paddingBottom: insets.bottom + 16 }}>
        <Button
          variant="primary"
          fullWidth
          onPress={() => {
            if (selectedMemberIds.length === 0) {
              setStep('members')
              return
            }
            handleCreate()
          }}
          loading={isCreating}
          disabled={!title.trim() || isCreating}
        >
          {selectedMemberIds.length === 0
            ? translate('Next: Select Members')
            : translate('Create Encrypted Group ({{count}} members)', {
                count: selectedMemberIds.length + 1,
              })}
        </Button>
      </View>
    </KeyboardAvoidingView>
  )
}
