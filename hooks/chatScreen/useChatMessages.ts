/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { Alert, AppState, InteractionManager } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import type { FlashListRef } from '@shopify/flash-list'
import { useAuthStore } from '@/store/authStore'
import { useChatStore } from '@/store/chatStore'
import { useGroupChatStore } from '@/store/groupChatStore'
import { useBluetoothStore } from '@/store/bluetoothStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import { getErrorDisplayMessage } from '@/lib/errorDisplay'
import {
  isSameAccountStorageScope,
  matchesStrictAccountStorageScope,
} from '@/lib/accountScope'
import {
  sendMessage as sendChatMessage,
  DIRECT_CHAT_CACHE_PAGE_SIZE,
  loadCachedMessagesForConversation,
  setDirectChatInteractionActive,
  getConversation,
  deactivateConversation,
  markConversationAsRead,
  persistDirectMessageLocalOrder,
  scheduleDirectSendReadiness,
  resolveIdentityId,
  sendReaction,
  retryFailedMessage,
  consumeViewOnceMessage,
  revealViewOnceMessage,
  deleteMessageForAll,
  deleteMessageLocally,
} from '@/services/chat/chatService'
import {
  ContactIdentityChangeError,
  loadOlderMessages,
  getIdentity,
  acceptContactIdentityReplacement,
  getPendingContactIdentityReplacement,
} from '@/services/quantumChat'
import {
  deleteGroupMessageForAll,
  loadCachedGroupMessages,
  loadGroupMessages,
  loadOlderGroupMessages,
  markGroupAsRead,
  retryFailedGroupMessage,
  sendGroupMessage,
  sendGroupReaction,
} from '@/services/groupChat'
import type { ContactIdentityReplacement } from '@/services/quantumChat'
import { translate } from '@/lib/i18n'
import { Haptics, impactAsync as triggerImpact, notificationAsync as triggerNotification } from '@/lib/safeHaptics'
import { groupMessagesByDate } from '@/lib/utils'
import { cleanupEditedAttachments } from '@/services/media/editedImageCache'
import { startPerformanceSpan } from '@/lib/performanceMetrics'
import type {
  ChatMessage,
  ChatSendOptions,
  MediaAttachment,
  MessageSendProgress,
  ReplyReference,
} from '@/lib/types'
import { getChatMessagePreviewText, isLockedOneTimeMessage } from '@/lib/viewOnce'
import { recordChatDiagnostic } from '@/services/chat/chatDiagnostics'
import {
  ATTACHMENT_PIPELINE_EVENT_NAME,
  buildAttachmentPipelineFields,
  createAttachmentSendTrace,
} from '@spectra/core-crypto/client/attachmentDiagnostics'
import {
  isSpectrePolicyActive,
  SPECTRE_TEXT_ONLY_MESSAGE,
} from '@/lib/spectrePolicy'
import {
  evaluateChatSendPolicy,
  getChatSendAdmissionTitle,
  rejectChatSend,
} from '@/services/chat/sendAdmission'
import type { ChatSendAdmission } from '@/services/chat/sendAdmission'
import { nowRenderMs, recordRenderMetric } from '@/lib/renderMetrics'

export type ChatListItem =
  | { type: 'header'; date: string; key: string }
  | { type: 'message'; message: ChatMessage; isOwn: boolean; showAvatar: boolean; key: string }

export type DirectChatBootstrapStage = 'idle' | 'opening' | 'ready' | 'failed'

export type DirectChatBootstrapState = {
  stage: DirectChatBootstrapStage
  error: Error | null
  reason?: string
  repaired?: boolean
  identityReplacement?: ContactIdentityReplacement
}

function getVisibleMessageOrderKey(message: ChatMessage): string {
  return `${message.id}:${message.deleted ? 1 : 0}:${message.localOrderTimestamp ?? ''}:${message.serverSequence ?? ''}:${message.timestamp}`
}

function getLocalOrderPersistKey(message: ChatMessage): string {
  return `${message.id}:${message.timestamp}:${message.localOrderTimestamp ?? ''}:${message.serverSequence ?? ''}`
}

function sameStringList(previous: string[], next: string[]): boolean {
  if (previous.length !== next.length) return false
  for (let i = 0; i < next.length; i++) {
    if (previous[i] !== next[i]) return false
  }
  return true
}

function orderVisibleChatMessages(
  sourceMessages: ChatMessage[],
  previous: { messages: ChatMessage[] },
): { messages: ChatMessage[] } {
  const visibleMessages = sourceMessages.filter(isVisibleChatMessage)
  if (previous.messages.length === visibleMessages.length) {
    const byId = new Map(visibleMessages.map((message) => [message.id, message]))
    const remapped = previous.messages
      .map((message) => byId.get(message.id))
      .filter((message): message is ChatMessage => Boolean(message))
    if (remapped.length === visibleMessages.length) {
      let unchanged = true
      for (let i = 0; i < remapped.length; i++) {
        if (getVisibleMessageOrderKey(previous.messages[i]) !== getVisibleMessageOrderKey(remapped[i])) {
          unchanged = false
          break
        }
      }
      if (unchanged) {
        return { messages: remapped }
      }
    }
  }

  return {
    messages: visibleMessages.sort(compareMessagesForDisplay),
  }
}

const MESSAGE_PAGE_SIZE = 50
const CHAT_SEND_LOG_PREFIX = '[ChatSend]'
const EMPTY_CHAT_MESSAGES: ChatMessage[] = []
const EMPTY_CONVERSATION_IDS: string[] = []
const LOCAL_ORDER_PERSIST_DEBOUNCE_MS = 400

function showSendAdmissionAlert(admission: ChatSendAdmission): void {
  if (admission.accepted || admission.reason === 'empty' || admission.reason === 'chat_not_ready') {
    return
  }
  Alert.alert(
    translate(getChatSendAdmissionTitle(admission), { ns: 'chat' }),
    translate(admission.message, { ns: 'chat' }),
  )
}

function selectMessagesForConversationIds(
  state: ReturnType<typeof useChatStore.getState>,
  conversationIds: string[],
): ChatMessage[] {
  if (conversationIds.length === 0) return EMPTY_CHAT_MESSAGES

  const messagesByConversationId = state._messagesByConversationId
  if (messagesByConversationId instanceof Map) {
    if (conversationIds.length === 1) {
      return messagesByConversationId.get(conversationIds[0]) ?? EMPTY_CHAT_MESSAGES
    }

    return conversationIds.flatMap((conversationId) =>
      messagesByConversationId.get(conversationId) ?? EMPTY_CHAT_MESSAGES
    )
  }

  const conversationIdSet = new Set(conversationIds)
  return state.messages.filter((message) => conversationIdSet.has(message.conversationId))
}

function isVisibleChatMessage(message: ChatMessage): boolean {
  return !message.deleted
}

function getMessageOrderTimestamp(message: ChatMessage): number {
  return message.localOrderTimestamp ?? message.timestamp
}

function isOwnDirectMessage(message: ChatMessage): boolean {
  return Boolean(message.localIdentityId && message.senderId === message.localIdentityId)
}

function compareMessagesForDisplay(a: ChatMessage, b: ChatMessage): number {
  if (!isOwnDirectMessage(a) && !isOwnDirectMessage(b) && a.serverSequence && b.serverSequence) {
    const sequenceDelta = a.serverSequence - b.serverSequence
    if (sequenceDelta !== 0) return sequenceDelta
  }

  const orderDelta = getMessageOrderTimestamp(a) - getMessageOrderTimestamp(b)
  if (orderDelta !== 0) return orderDelta

  const sequenceDelta = (a.serverSequence ?? 0) - (b.serverSequence ?? 0)
  if (sequenceDelta !== 0) return sequenceDelta

  const timestampDelta = a.timestamp - b.timestamp
  if (timestampDelta !== 0) return timestampDelta

  return a.id.localeCompare(b.id)
}

function summarizeChatSendValue(value?: string | null): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  if (value.length <= 96) {
    return value
  }

  return `${value.slice(0, 40)}...${value.slice(-32)}`
}

function describeChatSendAttachments(attachments?: MediaAttachment[]): Array<Record<string, unknown>> {
  if (!attachments?.length) {
    return []
  }

  return attachments.map((attachment) => ({
    id: attachment.id,
    type: attachment.type,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    width: attachment.width,
    height: attachment.height,
    durationMs: attachment.durationMs,
    uri: summarizeChatSendValue(attachment.uri),
  }))
}

function logChatSend(event: string, details?: Record<string, unknown>): void {
  if (!__DEV__) {
    return
  }

  if (details) {
    console.log(`${CHAT_SEND_LOG_PREFIX} ${event}`, details)
    return
  }

  console.log(`${CHAT_SEND_LOG_PREFIX} ${event}`)
}

interface UseChatMessagesParams {
  address: string | undefined
  localWalletAddress?: string
  directConversationId?: string
  isFocused?: boolean
  isGroup: boolean
  groupId: string | null
  contactName: string
  contactWalletAddress: string | undefined
  onDirectIdentityReplacementAccepted?: (identityId: string) => void
}

export function useChatMessages({
  address,
  localWalletAddress,
  directConversationId,
  isFocused = true,
  isGroup,
  groupId,
  contactName,
  contactWalletAddress,
  onDirectIdentityReplacementAccepted,
}: UseChatMessagesParams) {
  const listRef = useRef<FlashListRef<ChatListItem>>(null)

  const conversations = useChatStore((s) => s.conversations)
  const contacts = useChatStore((s) => s.contacts)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const evictDirectConversationWindowsForPeer = useChatStore(
    (s) => s.evictDirectConversationWindowsForPeer,
  )
  const isChatInitialized = useChatStore((s) => s.isInitialized)
  const isSyncingMessages = useChatStore((s) => s.isSyncingMessages)
  const groupConversation = useGroupChatStore((s) => (
    groupId ? s.groups.find((group) => group.groupId === groupId) || null : null
  ))
  const groupMessages = useGroupChatStore(useShallow((s) => (
    isFocused && groupId ? s.messages[groupId] ?? EMPTY_CHAT_MESSAGES : EMPTY_CHAT_MESSAGES
  )))
  const isLoadingGroupMessages = useGroupChatStore((s) => s.isLoadingMessages)
  const isSyncingGroupMessages = useGroupChatStore((s) => s.isSyncingMessages)
  const setActiveGroup = useGroupChatStore((s) => s.setActiveGroup)
  const exoAddress = useAuthStore((s) => s.exoAddress)
  const activeWalletAddress = useWalletStore((s) => s.wallet?.address ?? null)
  const activeWalletIsSpectre = useWalletStore((s) => s.wallet?.spectreMode === true)
  const spectreEnabled = useSpectreStore((s) => s.enabled)
  const spectreAccountMode = useSpectreStore((s) => s.spectreAccountMode)
  const bleStatus = useBluetoothStore((s) => s.status)
  const bleInternetAvailable = useBluetoothStore((s) => s.internetAvailable)
  const bleConfig = useBluetoothStore((s) => s.config)

  const directRoutePersonaReady = !localWalletAddress || isSameAccountStorageScope(activeWalletAddress, localWalletAddress)
  const directLocalWalletAddress = localWalletAddress || activeWalletAddress || exoAddress || undefined
  const directSenderAddress = activeWalletAddress || exoAddress
  const groupLocalWalletAddress = groupConversation?.localWalletAddress || activeWalletAddress || exoAddress
  const groupRuntimeReady = isGroup && isChatInitialized
  const directConversationScopeKey = `${directLocalWalletAddress?.toLowerCase() || 'none'}:${address?.toLowerCase() || 'none'}:${directConversationId?.toLowerCase() || 'none'}`
  const [cachedDirectSelection, setCachedDirectSelection] = useState<{
    scopeKey: string
    conversationIds: string[]
  }>({
    scopeKey: '',
    conversationIds: EMPTY_CONVERSATION_IDS,
  })
  const cachedDirectConversationIds = cachedDirectSelection.scopeKey === directConversationScopeKey
    ? cachedDirectSelection.conversationIds
    : EMPTY_CONVERSATION_IDS
  const spectrePolicyState = useMemo(() => ({
    enabled: spectreEnabled,
    accountMode: spectreAccountMode,
    walletIsSpectre: activeWalletIsSpectre,
  }), [activeWalletIsSpectre, spectreAccountMode, spectreEnabled])
  const spectreTextOnlyMode = isSpectrePolicyActive(spectrePolicyState)

  const myIdentityId = useMemo(() => getIdentity()?.id || null, [isChatInitialized, activeWalletAddress, exoAddress])

  const isBluetoothMeshTextOnlyMode = useMemo(() => {
    const bluetoothMeshOperational = bleConfig.enabled
      && !['disabled', 'error', 'permission_denied', 'bluetooth_off'].includes(bleStatus)
    return !isGroup && bluetoothMeshOperational && !bleInternetAvailable
  }, [bleConfig.enabled, bleInternetAvailable, bleStatus, isGroup])

  const directConversationHint = useMemo(() => {
    if (
      isGroup
      || !directConversationId
      || !address
      || !directLocalWalletAddress
      || !directRoutePersonaReady
    ) {
      return null
    }

    return conversations.find((candidate) => (
      candidate.id === directConversationId
      && matchesStrictAccountStorageScope(candidate.localWalletAddress, directLocalWalletAddress)
      && (
        candidate.remoteIdentityId === address
        || candidate.remoteWalletAddress === address
      )
    )) ?? null
  }, [
    address,
    conversations,
    directConversationId,
    directLocalWalletAddress,
    directRoutePersonaReady,
    isGroup,
  ])
  const directConversationHintId = directConversationHint?.id

  const conversation = useMemo(() => {
    if (isGroup) return groupConversation
    if (!address || !directRoutePersonaReady) return null
    return getConversation(address, {
      localIdentityId: myIdentityId ?? undefined,
      localWalletAddress: directLocalWalletAddress,
    }) ?? directConversationHint
  }, [
    address,
    directConversationHint,
    directLocalWalletAddress,
    directRoutePersonaReady,
    groupConversation,
    isGroup,
    myIdentityId,
  ])

  const directContactRequiresVerification = useMemo(() => {
    if (!address || isGroup) return false
    return contacts.some((contact) => {
      const matchesRoute = contact.identityId === address
        || contact.walletAddress === address
        || contact.identityId === conversation?.remoteIdentityId
        || contact.walletAddress === conversation?.remoteWalletAddress
        || contact.walletAddress === contactWalletAddress
      const matchesScope = !contact.localWalletAddress
        || !directLocalWalletAddress
        || isSameAccountStorageScope(contact.localWalletAddress, directLocalWalletAddress)
      return matchesRoute
        && matchesScope
        && (contact.identityChanged || contact.trustState === 'changed')
    })
  }, [
    address,
    contactWalletAddress,
    contacts,
    conversation?.remoteIdentityId,
    conversation?.remoteWalletAddress,
    directLocalWalletAddress,
    isGroup,
  ])
  const directContactRequiresVerificationRef = useRef(directContactRequiresVerification)
  directContactRequiresVerificationRef.current = directContactRequiresVerification
  const directAccountDeleted = useMemo(() => {
    if (!address || isGroup) return false
    if (
      conversation?.remoteAccountState === 'deleted'
      || directConversationHint?.remoteAccountState === 'deleted'
    ) {
      return true
    }

    return contacts.some((contact) => {
      const matchesRoute = contact.identityId === address
        || contact.walletAddress === address
        || contact.identityId === conversation?.remoteIdentityId
        || contact.walletAddress === conversation?.remoteWalletAddress
        || contact.walletAddress === contactWalletAddress
      const matchesScope = !contact.localWalletAddress
        || !directLocalWalletAddress
        || isSameAccountStorageScope(contact.localWalletAddress, directLocalWalletAddress)
      return matchesRoute && matchesScope && contact.remoteAccountState === 'deleted'
    })
  }, [
    address,
    contactWalletAddress,
    contacts,
    conversation?.remoteAccountState,
    conversation?.remoteIdentityId,
    conversation?.remoteWalletAddress,
    directConversationHint?.remoteAccountState,
    directLocalWalletAddress,
    isGroup,
  ])
  const directAccountDeletedRef = useRef(directAccountDeleted)
  directAccountDeletedRef.current = directAccountDeleted

  const directConversationIds = useMemo(() => {
    if (isGroup || (!conversation && !directConversationHint)) return []

    const relevantConvIds = new Set<string>()
    if (conversation) {
      relevantConvIds.add(conversation.id)
    }
    if (directConversationHint) {
      relevantConvIds.add(directConversationHint.id)
    }
    for (const conversationId of cachedDirectConversationIds) {
      relevantConvIds.add(conversationId)
    }
    const walletAddr = conversation?.remoteWalletAddress ?? directConversationHint?.remoteWalletAddress
    const localWallet = conversation?.localWalletAddress
      || directConversationHint?.localWalletAddress
      || directLocalWalletAddress
    const remoteIdentityId = conversation?.remoteIdentityId ?? directConversationHint?.remoteIdentityId

    for (const c of conversations) {
      if (
        matchesStrictAccountStorageScope(c.localWalletAddress, localWallet) && (
          c.remoteIdentityId === remoteIdentityId ||
          c.remoteIdentityId === address ||
          (walletAddr && c.remoteWalletAddress === walletAddr) ||
          c.remoteWalletAddress === address
        )
      ) {
        relevantConvIds.add(c.id)
      }
    }

    return Array.from(relevantConvIds)
  }, [
    address,
    cachedDirectConversationIds,
    conversation,
    conversations,
    directConversationHint,
    directLocalWalletAddress,
    isGroup,
  ])

  const directMessages = useChatStore(useShallow((state) => {
    if (!isFocused) return EMPTY_CHAT_MESSAGES
    return selectMessagesForConversationIds(state, directConversationIds)
  }))

  const visibleOrderRef = useRef<{ messages: ChatMessage[] }>({
    messages: [],
  })
  const messages = useMemo(() => {
    const startedAt = nowRenderMs()
    if (!conversation) {
      visibleOrderRef.current = { messages: [] }
      return []
    }

    const sourceMessages = isGroup && groupId ? groupMessages : directMessages
    const next = orderVisibleChatMessages(sourceMessages, visibleOrderRef.current)
    visibleOrderRef.current = next

    recordRenderMetric('chat_screen', 'derive_visible_messages', {
      elapsedMs: Number((nowRenderMs() - startedAt).toFixed(2)),
      sourceMessages: isGroup ? groupMessages.length : directMessages.length,
      visibleMessages: next.messages.length,
      conversationCount: directConversationIds.length,
      isGroup,
    })
    return next.messages
  }, [conversation, directConversationIds.length, directMessages, groupId, groupMessages, isGroup])

  const [renderedMessageLimit, setRenderedMessageLimit] = useState(MESSAGE_PAGE_SIZE)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const isLoadingOlderRef = useRef(false)
  const renderedMessages = useMemo(
    () => messages.slice(-renderedMessageLimit),
    [messages, renderedMessageLimit],
  )
  const canLoadOlderMessages = (
    messages.length > renderedMessageLimit || hasOlderMessages
  )

  const persistedLocalOrderKeysRef = useRef<string[]>([])
  useEffect(() => {
    if (isGroup || messages.length === 0) {
      persistedLocalOrderKeysRef.current = []
      return
    }

    const persistKeys = messages.map(getLocalOrderPersistKey)
    if (sameStringList(persistedLocalOrderKeysRef.current, persistKeys)) {
      return
    }

    let cancelled = false
    let interactionTask: { cancel: () => void } | null = null
    const timer = setTimeout(() => {
      interactionTask = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return
        void persistDirectMessageLocalOrder(messages).then(() => {
          if (!cancelled) {
            persistedLocalOrderKeysRef.current = persistKeys
          }
        }).catch(() => {
          recordChatDiagnostic('storage', 'local_order_repair_failed', {
            messageCount: messages.length,
          })
        })
      })
    }, LOCAL_ORDER_PERSIST_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
      interactionTask?.cancel()
    }
  }, [isGroup, messages])

  const flatListItemCacheRef = useRef(new Map<string, ChatListItem>())
  const flatListData = useMemo<ChatListItem[]>(() => {
    if (renderedMessages.length === 0) {
      flatListItemCacheRef.current.clear()
      return []
    }
    const startedAt = nowRenderMs()

    const groups = groupMessagesByDate(renderedMessages)
    const items: ChatListItem[] = []
    const previousItems = flatListItemCacheRef.current
    const nextItems = new Map<string, ChatListItem>()

    for (const group of groups) {
      const headerKey = `header-${group.date}`
      const previousHeader = previousItems.get(headerKey)
      const header = previousHeader?.type === 'header' && previousHeader.date === group.date
        ? previousHeader
        : { type: 'header' as const, date: group.date, key: headerKey }
      items.push(header)
      nextItems.set(headerKey, header)

      for (let i = 0; i < group.messages.length; i++) {
        const message = group.messages[i]
        const isOwn = message.senderId === myIdentityId
        const showAvatar = !isOwn && (
          i === 0 || group.messages[i - 1]?.senderId === myIdentityId
        )
        const previousItem = previousItems.get(message.id)
        const item = previousItem?.type === 'message'
          && previousItem.message === message
          && previousItem.isOwn === isOwn
          && previousItem.showAvatar === showAvatar
          ? previousItem
          : { type: 'message' as const, message, isOwn, showAvatar, key: message.id }
        items.push(item)
        nextItems.set(message.id, item)
      }
    }
    flatListItemCacheRef.current = nextItems

    recordRenderMetric('chat_screen', 'derive_flat_list_items', {
      elapsedMs: Number((nowRenderMs() - startedAt).toFixed(2)),
      messages: renderedMessages.length,
      dateGroups: groups.length,
      items: items.length,
    })
    return items
  }, [renderedMessages, myIdentityId])

  const messageIndexById = useMemo(() => {
    const indexMap = new Map<string, number>()
    flatListData.forEach((item, index) => {
      if (item.type === 'message') {
        indexMap.set(item.message.id, index)
      }
    })
    return indexMap
  }, [flatListData])

  const unreadDirectMessageIdsKey = useMemo(() => {
    if (!address || isGroup || messages.length === 0) return ''
    return messages
      .filter((msg) => msg.senderId !== myIdentityId && msg.status !== 'read')
      .map((msg) => `${msg.id}:${msg.status || 'unknown'}`)
      .join('\u0000')
  }, [address, isGroup, messages, myIdentityId])

  const latestGroupIncomingMessageId = useMemo(() => {
    if (!groupId || !isGroup || messages.length === 0) return null
    const lastMsg = messages[messages.length - 1]
    return lastMsg.senderId !== myIdentityId ? lastMsg.id : null
  }, [groupId, isGroup, messages, myIdentityId])

  const [isLoadingDirectMessages, setIsLoadingDirectMessages] = useState(false)
  const [directHistoryReady, setDirectHistoryReady] = useState(false)
  const isLoading = isGroup ? isLoadingGroupMessages : isLoadingDirectMessages
  const isSyncing = isGroup ? isSyncingGroupMessages : isSyncingMessages

  const [directChatBootstrap, setDirectChatBootstrap] = useState<DirectChatBootstrapState>({
    stage: 'idle',
    error: null,
  })
  const [directChatRetryNonce, setDirectChatRetryNonce] = useState(0)

  useEffect(() => {
    if (!directContactRequiresVerification) return
    for (const peerId of new Set([
      address,
      conversation?.remoteIdentityId,
      conversation?.remoteWalletAddress,
    ])) {
      if (peerId) {
        evictDirectConversationWindowsForPeer(peerId)
      }
    }
    deactivateConversation()
    setDirectChatBootstrap((current) => (
      current.stage === 'failed' && current.reason === 'verification_failed'
        ? current
        : {
            stage: 'failed',
            error: new Error('Contact identity changed and must be verified before messaging'),
            reason: 'verification_failed',
          }
    ))
  }, [
    address,
    contactWalletAddress,
    conversation?.remoteIdentityId,
    conversation?.remoteWalletAddress,
    directContactRequiresVerification,
    evictDirectConversationWindowsForPeer,
  ])

  useEffect(() => {
    if (!address || isGroup) return
    const replacementIdentityId = conversation?.remoteIdentityId ?? address
    let cancelled = false
    void getPendingContactIdentityReplacement(
      replacementIdentityId,
      conversation?.remoteWalletAddress ?? contactWalletAddress,
    ).then((replacement) => {
      if (cancelled || !replacement) return
      for (const peerId of new Set([
        address,
        conversation?.remoteIdentityId,
        conversation?.remoteWalletAddress,
      ])) {
        if (peerId) {
          evictDirectConversationWindowsForPeer(peerId)
        }
      }
      deactivateConversation()
      setDirectChatBootstrap((current) => {
        if (
          current.stage === 'failed'
          && current.reason === 'verification_failed'
          && current.identityReplacement?.safetyNumber.fullHash === replacement.safetyNumber.fullHash
        ) {
          return current
        }
        return {
          stage: 'failed',
          error: new Error('Contact identity changed and must be verified before messaging'),
          reason: 'verification_failed',
          repaired: current.repaired,
          identityReplacement: replacement,
        }
      })
    }).catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [
    address,
    contactWalletAddress,
    conversation?.remoteIdentityId,
    conversation?.remoteWalletAddress,
    directContactRequiresVerification,
    evictDirectConversationWindowsForPeer,
    isGroup,
  ])

  const handleRetryDirectChat = useCallback(() => {
    setDirectChatBootstrap({ stage: 'opening', error: null })
    setDirectChatRetryNonce((nonce) => nonce + 1)
  }, [])

  const handleAcceptDirectIdentityReplacement = useCallback(async () => {
    const replacement = directChatBootstrap.identityReplacement
    if (!replacement) {
      handleRetryDirectChat()
      return
    }

    setDirectChatBootstrap({ stage: 'opening', error: null })

    try {
      const result = await acceptContactIdentityReplacement(replacement, contactName)
      if (!result.success || !result.identityId) {
        throw new Error(result.error || translate('Failed to replace contact identity', { ns: 'contacts' }))
      }

      await triggerNotification(Haptics.NotificationFeedbackType.Success)
      if (onDirectIdentityReplacementAccepted) {
        onDirectIdentityReplacementAccepted(result.identityId)
        return
      }
      setDirectChatRetryNonce((nonce) => nonce + 1)
    } catch (error) {
      await triggerNotification(Haptics.NotificationFeedbackType.Error)
      const nextError = error instanceof Error ? error : new Error(String(error))
      setDirectChatBootstrap({
        stage: 'failed',
        error: nextError,
        reason: directChatBootstrap.reason,
        repaired: directChatBootstrap.repaired,
        identityReplacement: replacement,
      })
      Alert.alert(
        translate('Failed to replace contact identity', { ns: 'contacts' }),
        getErrorDisplayMessage(nextError),
      )
    }
  }, [
    contactName,
    directChatBootstrap.identityReplacement,
    directChatBootstrap.reason,
    directChatBootstrap.repaired,
    handleRetryDirectChat,
    onDirectIdentityReplacementAccepted,
  ])

  const [replyTo, setReplyTo] = useState<ReplyReference | null>(null)

  const handleCancelReply = useCallback(() => {
    setReplyTo(null)
  }, [])

  const [uploadProgress, setUploadProgress] = useState<MessageSendProgress | null>(null)

  const [actionMenuVisible, setActionMenuVisible] = useState(false)
  const [actionMenuMessage, setActionMenuMessage] = useState<ChatMessage | null>(null)
  const [actionMenuIsOwn, setActionMenuIsOwn] = useState(false)

  const handleMessageLongPress = useCallback((message: ChatMessage) => {
    const isOwn = message.senderId === myIdentityId
    setActionMenuMessage(message)
    setActionMenuIsOwn(isOwn)
    setActionMenuVisible(true)
  }, [myIdentityId])

  const handleCloseActionMenu = useCallback(() => {
    setActionMenuVisible(false)
    setActionMenuMessage(null)
  }, [])

  const handleReaction = useCallback(async (emoji: string) => {
    if (!actionMenuMessage) return
    if (isGroup && groupId) {
      await sendGroupReaction(groupId, actionMenuMessage.id, emoji)
      return
    }
    if (!address) return
    await sendReaction(address, actionMenuMessage.id, emoji)
  }, [actionMenuMessage, address, groupId, isGroup])

  const handleReply = useCallback(() => {
    if (!actionMenuMessage) return
    const isOwn = actionMenuMessage.senderId === myIdentityId
    setReplyTo({
      messageId: actionMenuMessage.id,
      previewText: getChatMessagePreviewText(actionMenuMessage).slice(0, 100),
      senderName: isOwn ? translate('You') : (actionMenuMessage.senderName || contactName),
      senderId: actionMenuMessage.senderId,
    })
  }, [actionMenuMessage, myIdentityId, contactName])

  const handleDelete = useCallback(() => {
    if (!actionMenuMessage) return
    const isOwn = actionMenuMessage.senderId === myIdentityId

    const options: Array<{ text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }> = [
      { text: translate('Cancel'), style: 'cancel' },
      {
        text: translate('Delete for me'),
        onPress: () => deleteMessageLocally(actionMenuMessage.id),
      },
    ]

    if (isGroup || isOwn) {
      options.push({
        text: translate('Delete for everyone'),
        style: 'destructive',
        onPress: () => {
          if (isGroup && groupId) {
            deleteGroupMessageForAll(groupId, actionMenuMessage.id)
            return
          }
          if (address) {
            deleteMessageForAll(address, actionMenuMessage.id)
          }
        },
      })
    }

    Alert.alert(
      translate('Delete Message'),
      translate('How would you like to delete this message?'),
      options,
    )
  }, [actionMenuMessage, address, groupId, isGroup, myIdentityId])

  const handleRetryFailedMessage = useCallback(async (message: ChatMessage) => {
    if (message.status !== 'failed') return
    triggerImpact(Haptics.ImpactFeedbackStyle.Medium)

    if (isGroup && groupId) {
      const { error } = await retryFailedGroupMessage(groupId, message)
      if (error) {
        Alert.alert(translate('Retry failed'), getErrorDisplayMessage(error))
      }
      return
    }

    if (!address || !directSenderAddress || !directRoutePersonaReady) {
      Alert.alert(
        translate('Unable to retry'),
        translate('This secure chat is not ready yet. Please try again in a moment.'),
      )
      return
    }

    const { error } = await retryFailedMessage(directSenderAddress, address, message)
    if (error) {
      Alert.alert(translate('Retry failed'), getErrorDisplayMessage(error))
    }
  }, [address, directRoutePersonaReady, directSenderAddress, groupId, isGroup])

  const handleReplyPreviewPress = useCallback((target: ReplyReference) => {
    const itemIndex = messageIndexById.get(target.messageId)
    if (itemIndex === undefined) {
      Alert.alert(
        translate('Original message unavailable'),
        translate('That message is not loaded in this chat yet.'),
      )
      return
    }

    listRef.current?.scrollToIndex({
      index: itemIndex,
      animated: true,
      viewPosition: 0.5,
    })
  }, [messageIndexById])

  const handleConsumeViewOnce = useCallback(async (message: ChatMessage) => {
    if (isGroup || !address || !isLockedOneTimeMessage(message)) {
      return
    }

    const { error } = await consumeViewOnceMessage(address, message)
    if (error) {
      console.error(`${CHAT_SEND_LOG_PREFIX} handle_consume_view_once_failed`, {
        address: summarizeChatSendValue(address),
        messageId: message.id,
        error: error.message,
      })
      Alert.alert(translate('Unable to update message'), getErrorDisplayMessage(error))
    }
  }, [address, isGroup])

  const handleRevealViewOnce = useCallback(async (message: ChatMessage) => {
    if (isGroup || !isLockedOneTimeMessage(message)) {
      return null
    }

    const { payload, error } = await revealViewOnceMessage(message)
    if (error) {
      console.error(`${CHAT_SEND_LOG_PREFIX} handle_reveal_view_once_failed`, {
        address: summarizeChatSendValue(address),
        messageId: message.id,
        error: error.message,
      })
      Alert.alert(translate('Unable to open message'), getErrorDisplayMessage(error))
      return null
    }

    return payload
  }, [address, isGroup])

  const [editingImageAttachment, setEditingImageAttachment] = useState<MediaAttachment | null>(null)

  useEffect(() => {
    isLoadingOlderRef.current = false
    setIsLoadingOlder(false)
    setRenderedMessageLimit(MESSAGE_PAGE_SIZE)
    setHasOlderMessages(false)
    setIsLoadingDirectMessages(false)
    setDirectHistoryReady(false)
  }, [address, directConversationScopeKey, groupId, isGroup])

  useEffect(() => {
    if (!isFocused) {
      return
    }

    if (isGroup && groupId) {
      let cancelled = false
      setDirectChatBootstrap({ stage: 'idle', error: null })

      const setupGroup = async () => {
        setActiveGroup(groupId)
        const cachedMessages = await loadCachedGroupMessages(groupId, groupLocalWalletAddress)
        if (cancelled) return
        setHasOlderMessages(cachedMessages.length >= MESSAGE_PAGE_SIZE)
        if (groupRuntimeReady) {
          await loadGroupMessages(groupId)
        }
        if (!cancelled) markGroupAsRead(groupId).catch(() => {})
      }

      setupGroup().catch((error) => {
        console.warn('Failed to load group chat:', error)
      })

      return () => {
        cancelled = true
        setActiveGroup(null)
      }
    }

    if (address && directRoutePersonaReady) {
      let cancelled = false
      const requiresVerification = directContactRequiresVerificationRef.current
      const accountDeleted = directAccountDeletedRef.current
      const warmSnapshot = directConversationHintId
        ? useChatStore.getState()._messagesByConversationId.get(directConversationHintId) || []
        : []
      const warmSnapshotAvailable = Boolean(
        !requiresVerification
        && directConversationHintId
        && useChatStore.getState().warmDirectConversationIds.includes(directConversationHintId)
        && warmSnapshot.length,
      )
      setDirectChatInteractionActive(true)
      recordChatDiagnostic('performance', 'direct_chat_open_started', {
        hasConversationHint: Boolean(directConversationHintId),
        requiresVerification,
        accountDeleted,
        warmSnapshotAvailable,
      })
      const endChatOpenSpan = startPerformanceSpan('chat_open', 'mount_to_ready')
      const endCachedChatOpenSpan = startPerformanceSpan('chat_open', 'mount_to_cached')

      if (directConversationHintId) {
        setActiveConversation(directConversationHintId)
        setCachedDirectSelection({
          scopeKey: directConversationScopeKey,
          conversationIds: [directConversationHintId],
        })
      }
      setDirectHistoryReady(warmSnapshotAvailable)

      setDirectChatBootstrap(
        (current) => current.identityReplacement
          ? {
              ...current,
              stage: 'failed',
              error: new Error('Contact identity changed and must be verified before messaging'),
              reason: 'verification_failed',
            }
          : requiresVerification
            ? {
              stage: 'failed',
              error: new Error('Contact identity changed and must be verified before messaging'),
              reason: 'verification_failed',
            }
            : { stage: 'ready', error: null },
      )

      if (!requiresVerification && !accountDeleted && address) {
        scheduleDirectSendReadiness(address)
      }

      const setup = async () => {
        setIsLoadingDirectMessages(!warmSnapshotAvailable)

        try {
          let cachedMessages: ChatMessage[] = warmSnapshotAvailable ? warmSnapshot : []
          const cachedMessagesTask = (
            requiresVerification
              ? Promise.resolve([])
              : warmSnapshotAvailable
                ? Promise.resolve(warmSnapshot)
                : (
                  directConversationHintId
                    ? loadCachedMessagesForConversation(address, {
                        conversationId: directConversationHintId,
                      })
                    : loadCachedMessagesForConversation(address)
                )
          )
            .then((messages) => {
              if (cancelled) return
              cachedMessages = messages
              setHasOlderMessages(messages.length >= DIRECT_CHAT_CACHE_PAGE_SIZE)
              setCachedDirectSelection({
                scopeKey: directConversationScopeKey,
                conversationIds: Array.from(new Set([
                  ...(directConversationHintId ? [directConversationHintId] : []),
                  ...messages.map((message) => message.conversationId).filter(Boolean),
                ])),
              })
              recordChatDiagnostic('performance', 'direct_chat_history_ready', {
                hasConversationHint: Boolean(directConversationHintId),
                messageCount: messages.length,
              })
              endCachedChatOpenSpan({
                count: messages.length,
                routeClass: 'direct_chat',
              })
            })
            .catch((error) => {
              if (!cancelled) {
                console.warn('Failed to load cached direct chat:', error)
                endCachedChatOpenSpan({ routeClass: 'direct_chat' })
              }
            })
            .finally(() => {
              if (!cancelled) {
                setIsLoadingDirectMessages(false)
                setDirectHistoryReady(true)
              }
            })

          void cachedMessagesTask
          endChatOpenSpan({
            count: cachedMessages.length,
            routeClass: 'direct_chat',
          })
        } catch (error) {
          console.warn('Failed to load direct chat:', error)
          if (!cancelled) {
            setDirectChatBootstrap({
              stage: 'failed',
              error: error instanceof Error ? error : new Error(String(error)),
            })
            endChatOpenSpan({ routeClass: 'direct_chat' })
            endCachedChatOpenSpan({ routeClass: 'direct_chat' })
          }
        }
      }

      void setup()

      return () => {
        cancelled = true
        setIsLoadingDirectMessages(false)
        setDirectChatInteractionActive(false)
        setActiveConversation(null)
        deactivateConversation()
      }
    }

    return () => {
      setDirectChatBootstrap({ stage: 'idle', error: null })
      setActiveConversation(null)
      deactivateConversation()
    }
  }, [
    address,
    directChatRetryNonce,
    directAccountDeleted,
    directContactRequiresVerification,
    directConversationHintId,
    directConversationScopeKey,
    directRoutePersonaReady,
    directSenderAddress,
    groupId,
    groupLocalWalletAddress,
    groupRuntimeReady,
    isFocused,
    isGroup,
    evictDirectConversationWindowsForPeer,
    setActiveConversation,
    setActiveGroup,
  ])

  useEffect(() => {
    if (!isFocused) {
      return
    }

    let appState = AppState.currentState
    const subscription = AppState.addEventListener('change', (nextState) => {
      const resumed =
        (appState === 'background' || appState === 'inactive')
        && nextState === 'active'
      appState = nextState
      if (!resumed) {
        return
      }

      if (isGroup && groupId) {
        const existing = useGroupChatStore.getState().messages[groupId]
        if (existing && existing.length > 0) {
          return
        }
        void loadCachedGroupMessages(groupId, groupLocalWalletAddress).catch(() => {})
        return
      }

      if (!address || isGroup) {
        return
      }

      const cachedWindow = directConversationHintId
        ? useChatStore.getState()._messagesByConversationId.get(directConversationHintId)
        : undefined
      if (cachedWindow && cachedWindow.length > 0) {
        return
      }

      void (
        directConversationHintId
          ? loadCachedMessagesForConversation(address, { conversationId: directConversationHintId })
          : loadCachedMessagesForConversation(address)
      ).catch(() => {})
    })

    return () => subscription.remove()
  }, [address, directConversationHintId, groupId, groupLocalWalletAddress, isFocused, isGroup])

  useEffect(() => {
    if (!isFocused) return
    if (groupId && isGroup && latestGroupIncomingMessageId) {
      markGroupAsRead(groupId)
      return
    }

    if (address && !isGroup && unreadDirectMessageIdsKey) {
      markConversationAsRead(address)
    }
  }, [address, groupId, isFocused, isGroup, latestGroupIncomingMessageId, unreadDirectMessageIdsKey])

  const handleLoadOlder = useCallback(async () => {
    if (isLoadingOlderRef.current) return
    if (messages.length === 0) return

    if (messages.length > renderedMessageLimit) {
      setRenderedMessageLimit((current) => Math.min(
        messages.length,
        current + MESSAGE_PAGE_SIZE,
      ))
      return
    }

    if (!hasOlderMessages) return

    isLoadingOlderRef.current = true
    setIsLoadingOlder(true)
    try {
      const oldestMessage = messages[0]

      let loaded: ChatMessage[]
      let hasMore = true
      if (isGroup && groupId) {
        const page = await loadOlderGroupMessages(groupId, oldestMessage.id, MESSAGE_PAGE_SIZE)
        loaded = page.messages
        hasMore = page.hasMore
      } else if (address) {
        const resolvedId = resolveIdentityId(address)
        loaded = await loadOlderMessages(resolvedId, oldestMessage.timestamp, MESSAGE_PAGE_SIZE)
        hasMore = loaded.length >= MESSAGE_PAGE_SIZE
      } else {
        loaded = []
        hasMore = false
      }

      if (loaded.length > 0) {
        setRenderedMessageLimit((current) => current + MESSAGE_PAGE_SIZE)
      }
      setHasOlderMessages(hasMore)
    } catch (error) {
      console.warn('Failed to load older messages:', error)
    } finally {
      isLoadingOlderRef.current = false
      setIsLoadingOlder(false)
    }
  }, [address, groupId, hasOlderMessages, isGroup, messages, renderedMessageLimit])

  const performAcceptedSend = useCallback(async (
    content: string,
    attachments?: MediaAttachment[],
    options?: ChatSendOptions,
  ): Promise<void> => {
    if (!address) return

    const attachmentTrace = attachments?.length ? createAttachmentSendTrace() : null
    const sendLogContext = {
      address: summarizeChatSendValue(address),
      exoAddress: summarizeChatSendValue(directSenderAddress),
      groupId: summarizeChatSendValue(groupId),
      isGroup,
      contentLength: content.length,
      attachmentCount: attachments?.length ?? 0,
      attachmentSendId: attachmentTrace?.attachmentSendId ?? null,
      attachments: describeChatSendAttachments(attachments),
      replyToMessageId: replyTo?.messageId ?? null,
      oneTimeKind: options?.oneTime?.kind ?? null,
    }
    logChatSend('handle_send_start', sendLogContext)

    if (attachmentTrace && attachments?.length) {
      recordChatDiagnostic(
        'send',
        ATTACHMENT_PIPELINE_EVENT_NAME,
        buildAttachmentPipelineFields(
          'picker_selected',
          {
            attachmentSendId: attachmentTrace.attachmentSendId,
            sendStartedAt: attachmentTrace.sendStartedAt,
            attachmentCount: attachments.length,
          },
          {
            source: 'useChatMessages.handleSend',
            contentLength: content.length,
            replyToMessageId: replyTo?.messageId ?? undefined,
          },
        ),
      )
    }

    if (isGroup && groupId) {
      const { error } = await sendGroupMessage(
        groupId,
        content,
        replyTo,
        attachments,
        attachments && attachments.length > 0 ? setUploadProgress : undefined,
      )
      setUploadProgress(null)

      if (error) {
        console.error(`${CHAT_SEND_LOG_PREFIX} handle_send_group_failed`, {
          ...sendLogContext,
          error: error.message,
        })
        console.error('Failed to send group message:', error)
        Alert.alert(translate('Failed to send'), getErrorDisplayMessage(error))
      } else {
        logChatSend('handle_send_group_success', sendLogContext)
      }
      return
    }

    if (
      !directSenderAddress
      || !directRoutePersonaReady
      || directChatBootstrap.stage !== 'ready'
    ) return

    const { error } = await sendChatMessage(
      directSenderAddress,
      address,
      content,
      attachments,
      attachments && attachments.length > 0 ? setUploadProgress : undefined,
      replyTo,
      attachmentTrace ? { attachmentTrace } : undefined,
      options,
    )

    setUploadProgress(null)

    if (error) {
      if (error instanceof ContactIdentityChangeError && error.replacement) {
        deactivateConversation()
        setDirectChatBootstrap({
          stage: 'failed',
          error,
          reason: 'verification_failed',
          identityReplacement: error.replacement,
        })
        return
      }
      console.error(`${CHAT_SEND_LOG_PREFIX} handle_send_direct_failed`, {
        ...sendLogContext,
        error: error.message,
      })
      console.error('Failed to send message:', error)
      Alert.alert(translate('Failed to send'), getErrorDisplayMessage(error))
      return
    }
    logChatSend('handle_send_direct_success', sendLogContext)
  }, [address, directChatBootstrap.stage, directRoutePersonaReady, directSenderAddress, groupId, isGroup, replyTo])

  const handleSend = useCallback((
    content: string,
    attachments?: MediaAttachment[],
    options?: ChatSendOptions,
  ): ChatSendAdmission => {
    const admission = evaluateChatSendPolicy({
      content,
      attachments,
      options,
      spectrePolicyState,
      textOnlyMode: isBluetoothMeshTextOnlyMode,
      allowViewOnce: !isGroup,
    })
    if (!admission.accepted) {
      showSendAdmissionAlert(admission)
      return admission
    }

    if (!address) {
      return rejectChatSend(
        'chat_not_ready',
        translate('This secure chat is not ready yet. Please try again in a moment.'),
      )
    }

    if (isGroup && !groupId) {
      return rejectChatSend(
        'chat_not_ready',
        translate('This secure chat is not ready yet. Please try again in a moment.'),
      )
    }

    if (
      !isGroup
      && (
        !directSenderAddress
        || !directRoutePersonaReady
        || directChatBootstrap.stage !== 'ready'
      )
    ) {
      return rejectChatSend(
        'chat_not_ready',
        translate('This secure chat is not ready yet. Please try again in a moment.'),
      )
    }

    const completion = performAcceptedSend(
      admission.content,
      admission.attachments,
      admission.options,
    ).catch((error) => {
      setUploadProgress(null)
      const sendError = error instanceof Error ? error : new Error(String(error))
      console.error(`${CHAT_SEND_LOG_PREFIX} handle_send_unexpected_failure`, {
        error: sendError.message,
      })
      Alert.alert(translate('Failed to send'), getErrorDisplayMessage(sendError))
    })
    setReplyTo(null)

    return { ...admission, completion }
  }, [
    address,
    directChatBootstrap.stage,
    directRoutePersonaReady,
    directSenderAddress,
    groupId,
    isBluetoothMeshTextOnlyMode,
    isGroup,
    performAcceptedSend,
    spectrePolicyState,
  ])

  const handleEditImageAttachment = useCallback(async (
    message: ChatMessage,
    attachment: MediaAttachment,
  ) => {
    if (message.oneTime || message.disappearing || attachment.isViewOnce) {
      return
    }

    if (spectreTextOnlyMode) {
      Alert.alert(
        translate('Spectre Mode'),
        translate(SPECTRE_TEXT_ONLY_MESSAGE),
      )
      return
    }

    if (isBluetoothMeshTextOnlyMode) {
      Alert.alert(
        translate('Bluetooth mesh supports text only', { ns: 'chat' }),
        translate('Images, files, audio, and voice notes are disabled while Bluetooth mesh is carrying messages. Send a text message or reconnect to the internet to share media.', { ns: 'chat' }),
      )
      return
    }

    if (!attachment.uri) {
      Alert.alert(translate('Unable to edit image'), translate('Load this image before editing it.'))
      return
    }

    triggerImpact(Haptics.ImpactFeedbackStyle.Light)
    setEditingImageAttachment({
      ...attachment,
      type: 'image',
      isEncrypted: false,
      isViewOnce: false,
    })
  }, [isBluetoothMeshTextOnlyMode, spectreTextOnlyMode])

  const handleCancelImageEdit = useCallback(() => {
    setEditingImageAttachment(null)
  }, [])

  const handleSaveEditedImageAttachment = useCallback(async (attachment: MediaAttachment) => {
    setEditingImageAttachment(null)
    try {
      const admission = handleSend('', [attachment])
      if (admission.accepted) {
        await admission.completion
      }
    } finally {
      await cleanupEditedAttachments([attachment])
    }
  }, [handleSend])

  return {
    flatListData,
    allMessages: messages,
    isLoading,
    isSyncing,
    directHistoryReady,
    hasOlderMessages: canLoadOlderMessages,
    isLoadingOlder,
    handleLoadOlder,
    handleSend,
    uploadProgress,
    replyTo,
    setReplyTo,
    handleCancelReply,
    actionMenuVisible,
    actionMenuMessage,
    actionMenuIsOwn,
    handleMessageLongPress,
    handleCloseActionMenu,
    handleReaction,
    handleReply,
    handleDelete,
    handleRetryFailedMessage,
    handleReplyPreviewPress,
    handleRevealViewOnce,
    handleConsumeViewOnce,
    editingImageAttachment,
    handleEditImageAttachment,
    handleCancelImageEdit,
    handleSaveEditedImageAttachment,
    directChatBootstrap,
    handleRetryDirectChat,
    handleAcceptDirectIdentityReplacement,
    listRef,
  }
}
