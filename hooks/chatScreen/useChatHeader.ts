/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useMemo, useEffect, useCallback, useRef } from 'react'
import { Alert } from 'react-native'
import { useChatStore, useAuthStore, useGroupChatStore } from '@/store'
import { useWalletStore } from '@/store/walletStore'
import { useBluetoothStore } from '@/store/bluetoothStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useTorStore } from '@/services/tor/torStore'
import { useCall } from '@/contexts'
import { isSameAccountStorageScope, matchesAccountStorageScope } from '@/lib/accountScope'
import {
  getConversation,
  getIdentity,
  resolveIdentityId,
  unblockContact,
} from '@/services/chat'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import { translate } from '@/lib/i18n'
import { formatAddress } from '@/lib/utils'
import type { CallType } from '@/lib/types'
import type { GroupTransferRecipient } from '@/components/chat/GroupTransferRecipientModal'

interface UseChatHeaderParams {
  address: string | undefined
  localWalletAddress?: string
  isGroupChat: boolean
  groupId: string | null
}

export function useChatHeader({
  address,
  localWalletAddress,
  isGroupChat,
  groupId,
}: UseChatHeaderParams) {
  const contacts = useChatStore((s) => s.contacts)
  const isChatInitialized = useChatStore((s) => s.isInitialized)
  const exoAddress = useAuthStore((s) => s.exoAddress)
  const activeWalletAddress = useWalletStore((s) => s.wallet?.address ?? null)
  const groupConversations = useGroupChatStore((s) => s.groups)
  const groupMembersById = useGroupChatStore((s) => s.members)
  const spectreEnabled = useSpectreStore((s) => s.enabled)
  const torEnabled = useTorStore((s) => s.enabled)
  const bleStatus = useBluetoothStore((s) => s.status)
  const internetAvailable = useBluetoothStore((s) => s.internetAvailable)
  const nearbyContacts = useBluetoothStore((s) => s.nearbyContacts)
  const bleConfig = useBluetoothStore((s) => s.config)

  const directRoutePersonaReady = !localWalletAddress || isSameAccountStorageScope(activeWalletAddress, localWalletAddress)
  const directLocalWalletAddress = localWalletAddress || activeWalletAddress || exoAddress || undefined

  const myIdentityId = useMemo(() => getIdentity()?.id || null, [isChatInitialized, activeWalletAddress, exoAddress])

  const contact = useMemo(
    () => contacts.find(
      c => matchesAccountStorageScope(c.localWalletAddress, directLocalWalletAddress)
        && (c.identityId === address || c.walletAddress === address),
    ),
    [contacts, address, directLocalWalletAddress],
  )

  const groupConversation = useMemo(
    () => (groupId ? groupConversations.find((g) => g.groupId === groupId) || null : null),
    [groupConversations, groupId],
  )

  const groupMembers = useMemo(
    () => (groupId ? groupMembersById[groupId] || [] : []),
    [groupId, groupMembersById],
  )

  const contactName = isGroupChat
    ? (groupConversation?.title || translate('Group chat'))
    : (contact?.displayName || formatAddress(address || '', 6))

  const isBlocked = !isGroupChat && contact?.trustState === 'blocked'

  const bluetoothMeshOperational = bleConfig.enabled
    && !['disabled', 'error', 'permission_denied', 'bluetooth_off'].includes(bleStatus)
  const isBluetoothMeshMode = !isGroupChat && bluetoothMeshOperational && !internetAvailable
  const targetIdentityId = contact?.identityId || address
  const isPeerNearby = Boolean(
    !isGroupChat
    && bluetoothMeshOperational
    && targetIdentityId
    && nearbyContacts.some((nearby) => nearby.identityId === targetIdentityId),
  )

  const bleRoute = useMemo(() => {
    if (!bluetoothMeshOperational || isGroupChat) {
      return 'internet' as const
    }
    if (!internetAvailable) {
      return 'ble' as const
    }
    return isPeerNearby ? ('ble-nearby' as const) : ('internet' as const)
  }, [bluetoothMeshOperational, internetAvailable, isGroupChat, isPeerNearby])

  const contactAvatarUrl = isGroupChat
    ? (groupConversation?.avatarUrl || null)
    : contact?.avatarUrl

  const conversation = useMemo(() => {
    if (isGroupChat) {
      return groupConversation
    }
    if (!directLocalWalletAddress || !address || !directRoutePersonaReady) return null
    return getConversation(address, {
      localIdentityId: myIdentityId ?? undefined,
      localWalletAddress: directLocalWalletAddress,
    })
  }, [address, directLocalWalletAddress, directRoutePersonaReady, groupConversation, isGroupChat, myIdentityId])
  const remoteAccountDeleted = !isGroupChat && (
    contact?.remoteAccountState === 'deleted'
    || conversation?.remoteAccountState === 'deleted'
  )

  const peerTorCallAlert = useMemo(() => {
    if (spectreEnabled) {
      return {
        title: translate('Calls Disabled in Spectre Mode'),
        message: translate('Voice and video calls are disabled while Spectre Mode is active.'),
        reason: translate('Calls are disabled in Spectre Mode.'),
      }
    }

    if (isBluetoothMeshMode) {
      return {
        title: translate('Calls Unavailable in Bluetooth Mesh'),
        message: translate('Voice and video calls are unavailable while Bluetooth mesh is the active transport. Reconnect to the internet to start a call.'),
        reason: translate('Calls are unavailable in Bluetooth mesh mode.'),
      }
    }

    return null
  }, [isBluetoothMeshMode, spectreEnabled])

  const groupTransferRecipients = useMemo<GroupTransferRecipient[]>(
    () => groupMembers
      .filter((member) => member.identityId !== myIdentityId && Boolean(member.walletAddress))
      .map((member) => {
        const contactEntry = contacts.find((entry) => entry.identityId === member.identityId)
        return {
          identityId: member.identityId,
          name: member.displayName || contactEntry?.displayName || formatAddress(member.identityId, 6),
          walletAddress: member.walletAddress!,
          avatarUrl: contactEntry?.avatarUrl,
        }
      }),
    [contacts, groupMembers, myIdentityId],
  )

  const { callState, error: callError, startCall } = useCall()
  const lastHandledStartCallErrorMessageRef = useRef<string | null>(null)

  const handleStartCall = useCallback(async (type: CallType) => {
    const identity = getIdentity()
    const remoteIdentityId = conversation?.remoteIdentityId || contact?.identityId || resolveIdentityId(address || '')

    if (isGroupChat) {
      Alert.alert(translate('Calls unavailable'), translate('Calls are only supported in direct chats.'))
      return
    }

    if (remoteAccountDeleted) {
      Alert.alert(translate('Calls unavailable'), translate('Account deleted', { ns: 'settings' }))
      return
    }

    if (peerTorCallAlert) {
      Alert.alert(peerTorCallAlert.title, peerTorCallAlert.message)
      return
    }

    if (callState) {
      Alert.alert(translate('Call already active'), translate('Finish the current call before starting another one.'))
      return
    }

    if (!identity || !remoteIdentityId || !conversation?.id) {
      Alert.alert(translate('Error'), translate('Unable to start call. Please try again.'))
      return
    }

    try {
      await startCall(
        identity.id,
        remoteIdentityId,
        conversation.id,
        type,
        contactName,
        contactAvatarUrl,
      )
    } catch (error) {
      lastHandledStartCallErrorMessageRef.current =
        error instanceof Error ? error.message : String(error)
      Alert.alert(translate('Call Failed'), getErrorDisplayMessage(error))
    }
  }, [address, callState, contact?.identityId, contactAvatarUrl, contactName, conversation?.id, conversation?.remoteIdentityId, isGroupChat, peerTorCallAlert, remoteAccountDeleted, startCall])

  useEffect(() => {
    if (!callError) return
    if (lastHandledStartCallErrorMessageRef.current === callError.message) {
      lastHandledStartCallErrorMessageRef.current = null
      return
    }
    Alert.alert(translate('Call Error'), getErrorDisplayMessage(callError))
  }, [callError])

  const handleUnblock = useCallback(async () => {
    if (!address) return
    await unblockContact(address)
  }, [address])

  return {
    contact,
    contacts,
    contactName,
    contactAvatarUrl,
    isBlocked,
    remoteAccountDeleted,
    bleRoute,
    isPeerNearby,
    internetAvailable,
    isBluetoothMeshMode,
    conversation,
    groupConversation,
    groupMembers,
    exoAddress: directLocalWalletAddress,
    torEnabled,
    peerTorCallAlert,
    groupTransferRecipients,
    handleStartCall,
    handleUnblock,
  }
}
