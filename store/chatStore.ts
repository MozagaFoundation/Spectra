/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'
import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'
import { useSpectreStore } from './spectreStore'
import { buildAccountScopedKey, normalizeAccountStorageScope } from '@/lib/accountScope'
import type { 
  Conversation, 
  ChatMessage, 
  ChatContact, 
  SecurityAlert,
  UserTag,
  MessageReaction,
} from '@/lib/types'
import { generateId } from '@/lib/utils'
import { STORAGE_KEYS } from '@/lib/constants'
import { isConversationListVisible } from '@/lib/conversationVisibility'
import { slimContactForUi } from '@/lib/addressBook/contactProjection'
import {
  MAX_WARM_DIRECT_CONVERSATIONS,
  WARM_DIRECT_CONVERSATION_MESSAGE_LIMIT,
} from '@/lib/chatMemory'

const SWIPE_PREFERENCE_KEYS = [
  STORAGE_KEYS.ARCHIVED_CONVERSATIONS,
  STORAGE_KEYS.PINNED_CONVERSATIONS,
  STORAGE_KEYS.MANUALLY_UNREAD_CONVERSATIONS,
  STORAGE_KEYS.MUTED_CONVERSATIONS,
] as const
const MAX_ACTIVE_CONVERSATION_MESSAGES = 2_000
const MAX_INACTIVE_CONVERSATION_MESSAGES = 50

function getSwipePreferenceStorageKey(baseKey: string, scope: string | null): string {
  return scope ? buildAccountScopedKey(baseKey, scope) : baseKey
}

function parseStoredIds(raw: string | null): string[] {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : []
  } catch {
    return []
  }
}

function buildScopedPreferencePairs(
  scope: string | null,
  values: Record<(typeof SWIPE_PREFERENCE_KEYS)[number], string[]>,
): Array<readonly [string, string]> {
  if (!scope) {
    return []
  }

  return SWIPE_PREFERENCE_KEYS.map((baseKey) => (
    [getSwipePreferenceStorageKey(baseKey, scope), JSON.stringify(values[baseKey])] as const
  ))
}

async function readScopedSwipePreferences(
  scope: string | null,
  allowLegacyMigration: boolean,
): Promise<Record<(typeof SWIPE_PREFERENCE_KEYS)[number], string[]>> {
  const scopedKeys = SWIPE_PREFERENCE_KEYS.map((baseKey) => getSwipePreferenceStorageKey(baseKey, scope))

  if (!scope) {
    const values = await getAppKeyValueStorage().multiGet(scopedKeys)
    return {
      [STORAGE_KEYS.ARCHIVED_CONVERSATIONS]: parseStoredIds(values[0]?.[1] ?? null),
      [STORAGE_KEYS.PINNED_CONVERSATIONS]: parseStoredIds(values[1]?.[1] ?? null),
      [STORAGE_KEYS.MANUALLY_UNREAD_CONVERSATIONS]: parseStoredIds(values[2]?.[1] ?? null),
      [STORAGE_KEYS.MUTED_CONVERSATIONS]: parseStoredIds(values[3]?.[1] ?? null),
    }
  }

  const pairs = await getAppKeyValueStorage().multiGet([
    ...scopedKeys,
    ...(allowLegacyMigration ? [...SWIPE_PREFERENCE_KEYS] : []),
  ])
  const valuesByKey = new Map(pairs)

  const resolved = {
    [STORAGE_KEYS.ARCHIVED_CONVERSATIONS]: parseStoredIds(valuesByKey.get(scopedKeys[0]) ?? null),
    [STORAGE_KEYS.PINNED_CONVERSATIONS]: parseStoredIds(valuesByKey.get(scopedKeys[1]) ?? null),
    [STORAGE_KEYS.MANUALLY_UNREAD_CONVERSATIONS]: parseStoredIds(valuesByKey.get(scopedKeys[2]) ?? null),
    [STORAGE_KEYS.MUTED_CONVERSATIONS]: parseStoredIds(valuesByKey.get(scopedKeys[3]) ?? null),
  }

  if (!allowLegacyMigration) {
    return resolved
  }

  const migrated = {
    [STORAGE_KEYS.ARCHIVED_CONVERSATIONS]: resolved[STORAGE_KEYS.ARCHIVED_CONVERSATIONS].length > 0
      ? resolved[STORAGE_KEYS.ARCHIVED_CONVERSATIONS]
      : parseStoredIds(valuesByKey.get(STORAGE_KEYS.ARCHIVED_CONVERSATIONS) ?? null),
    [STORAGE_KEYS.PINNED_CONVERSATIONS]: resolved[STORAGE_KEYS.PINNED_CONVERSATIONS].length > 0
      ? resolved[STORAGE_KEYS.PINNED_CONVERSATIONS]
      : parseStoredIds(valuesByKey.get(STORAGE_KEYS.PINNED_CONVERSATIONS) ?? null),
    [STORAGE_KEYS.MANUALLY_UNREAD_CONVERSATIONS]: resolved[STORAGE_KEYS.MANUALLY_UNREAD_CONVERSATIONS].length > 0
      ? resolved[STORAGE_KEYS.MANUALLY_UNREAD_CONVERSATIONS]
      : parseStoredIds(valuesByKey.get(STORAGE_KEYS.MANUALLY_UNREAD_CONVERSATIONS) ?? null),
    [STORAGE_KEYS.MUTED_CONVERSATIONS]: resolved[STORAGE_KEYS.MUTED_CONVERSATIONS].length > 0
      ? resolved[STORAGE_KEYS.MUTED_CONVERSATIONS]
      : parseStoredIds(valuesByKey.get(STORAGE_KEYS.MUTED_CONVERSATIONS) ?? null),
  }

  const scopedPairs = buildScopedPreferencePairs(scope, migrated)
  if (scopedPairs.length > 0) {
    await getAppKeyValueStorage().multiSet(scopedPairs as [string, string][])
  }

  const hadLegacyValues = SWIPE_PREFERENCE_KEYS.some((baseKey) => valuesByKey.get(baseKey) !== null)
  if (hadLegacyValues) {
    await getAppKeyValueStorage().multiRemove([...SWIPE_PREFERENCE_KEYS])
  }

  return migrated
}

function getScopedChatPreferenceKeys(scope: string): string[] {
  return SWIPE_PREFERENCE_KEYS.map((baseKey) => getSwipePreferenceStorageKey(baseKey, scope))
}

export async function clearScopedChatPreferences(scope: string): Promise<void> {
  await getAppKeyValueStorage().multiRemove(getScopedChatPreferenceKeys(scope))
}

export interface ChatPreferenceBackupSnapshot {
  schemaVersion: 1
  archivedConversationIds: string[]
  pinnedConversationIds: string[]
  manuallyUnreadConversationIds: string[]
  mutedConversationIds: string[]
}

export async function exportChatPreferenceBackupSnapshot(
  scope: string | null,
): Promise<ChatPreferenceBackupSnapshot> {
  const preferences = await readScopedSwipePreferences(scope, false)
  return {
    schemaVersion: 1,
    archivedConversationIds: preferences[STORAGE_KEYS.ARCHIVED_CONVERSATIONS],
    pinnedConversationIds: preferences[STORAGE_KEYS.PINNED_CONVERSATIONS],
    manuallyUnreadConversationIds: preferences[STORAGE_KEYS.MANUALLY_UNREAD_CONVERSATIONS],
    mutedConversationIds: preferences[STORAGE_KEYS.MUTED_CONVERSATIONS],
  }
}

export async function importChatPreferenceBackupSnapshot(
  scope: string | null,
  snapshot: ChatPreferenceBackupSnapshot,
  options: { replaceExisting?: boolean } = {},
): Promise<void> {
  if (snapshot.schemaVersion !== 1) {
    throw new Error('Unsupported chat preference backup schema')
  }

  const current = options.replaceExisting
    ? null
    : await exportChatPreferenceBackupSnapshot(scope)
  const mergeIds = (incoming: string[], existing: string[] = []) => [
    ...existing,
    ...incoming.filter((id) => !existing.includes(id)),
  ]
  const values = {
    [STORAGE_KEYS.ARCHIVED_CONVERSATIONS]: mergeIds(
      snapshot.archivedConversationIds,
      current?.archivedConversationIds,
    ),
    [STORAGE_KEYS.PINNED_CONVERSATIONS]: mergeIds(
      snapshot.pinnedConversationIds,
      current?.pinnedConversationIds,
    ),
    [STORAGE_KEYS.MANUALLY_UNREAD_CONVERSATIONS]: mergeIds(
      snapshot.manuallyUnreadConversationIds,
      current?.manuallyUnreadConversationIds,
    ),
    [STORAGE_KEYS.MUTED_CONVERSATIONS]: mergeIds(
      snapshot.mutedConversationIds,
      current?.mutedConversationIds,
    ),
  }
  const pairs = scope
    ? buildScopedPreferencePairs(scope, values)
    : SWIPE_PREFERENCE_KEYS.map((baseKey) => [baseKey, JSON.stringify(values[baseKey])] as const)
  await getAppKeyValueStorage().multiSet(pairs as [string, string][])
  useChatStore.setState({
    archivedConversationIds: values[STORAGE_KEYS.ARCHIVED_CONVERSATIONS],
    pinnedConversationIds: values[STORAGE_KEYS.PINNED_CONVERSATIONS],
    manuallyUnreadConversationIds: values[STORAGE_KEYS.MANUALLY_UNREAD_CONVERSATIONS],
    mutedConversationIds: values[STORAGE_KEYS.MUTED_CONVERSATIONS],
  })
}

interface ChatState {
  isInitialized: boolean
  isInitializing: boolean
  conversationsReady: boolean
  contactsReady: boolean
  storageScope: string | null
  allowLegacyPreferenceMigration: boolean
  conversations: Conversation[]
  activeConversationId: string | null
  warmDirectConversationIds: string[]
  messages: ChatMessage[]
  isLoadingMessages: boolean
  isSyncingMessages: boolean
  contacts: ChatContact[]
  securityAlerts: SecurityAlert[]
  totalUnreadCount: number
  tags: UserTag[]
  
  archivedConversationIds: string[]
  pinnedConversationIds: string[]
  manuallyUnreadConversationIds: string[]
  mutedConversationIds: string[]
  
  // Skip redundant profile refreshes after init.
  _lastContactRefreshAt: number
  
  // Message IDs for O(1) dedup.
  _messageIdSet: Set<string>
  _messageById: Map<string, ChatMessage>
  _messagesByConversationId: Map<string, ChatMessage[]>
  _contactsByIdentityId: Map<string, ChatContact>
  _contactsByWalletAddress: Map<string, ChatContact>
  getMessageById: (id: string) => ChatMessage | undefined
  
  setInitialized: (initialized: boolean) => void
  setInitializing: (initializing: boolean) => void
  setConversationsReady: (ready: boolean) => void
  setContactsReady: (ready: boolean) => void
  setStorageScope: (scope: string | null, options?: { allowLegacyMigration?: boolean }) => void
  
  setConversations: (conversations: Conversation[]) => void
  addConversation: (conversation: Conversation) => void
  mergeConversations: (incoming: Conversation[]) => void
  updateConversation: (id: string, updates: Partial<Conversation>) => void
  batchUpdateConversations: (updates: Array<{ id: string; changes: Partial<Conversation> }>) => void
  setActiveConversation: (id: string | null) => void
  warmDirectConversation: (id: string) => void
  evictDirectConversationWindow: (id: string) => void
  evictDirectConversationWindowsForPeer: (peerId: string) => void
  
  setMessages: (messages: ChatMessage[], conversationId?: string) => void
  addMessage: (message: ChatMessage) => boolean
  replaceMessage: (oldId: string, newMessage: ChatMessage) => void
  mergeMessages: (loadedMessages: ChatMessage[], conversationId: string) => void
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void
  removeMessage: (id: string) => void
  removeMessages: (ids: string[]) => void
  addReaction: (messageId: string, reaction: MessageReaction) => void
  removeReaction: (messageId: string, emoji: string, senderId: string) => void
  setLoadingMessages: (loading: boolean) => void
  setSyncingMessages: (syncing: boolean) => void
  
  removeConversation: (id: string) => void
  
  archiveConversation: (id: string) => void
  unarchiveConversation: (id: string) => void
  togglePinConversation: (id: string) => void
  toggleManuallyUnread: (id: string) => void
  toggleMuteConversation: (id: string) => void
  clearConversationMessages: (conversationId: string) => void
  loadSwipePreferences: () => Promise<void>
  
  setContacts: (contacts: ChatContact[]) => void
  addContact: (contact: ChatContact) => void
  updateContact: (identityId: string, updates: Partial<ChatContact>) => void
  removeContact: (identityId: string) => void
  batchUpdateContacts: (updates: Array<{ identityId: string; changes: Partial<ChatContact> }>) => void
  
  addSecurityAlert: (alert: Omit<SecurityAlert, 'id' | 'timestamp'>) => void
  
  setTags: (tags: UserTag[]) => void
  
  reset: () => void
}

const initialState = {
  isInitialized: false,
  isInitializing: false,
  conversationsReady: false,
  contactsReady: false,
  storageScope: null as string | null,
  allowLegacyPreferenceMigration: false,
  conversations: [] as Conversation[],
  activeConversationId: null as string | null,
  warmDirectConversationIds: [] as string[],
  messages: [] as ChatMessage[],
  isLoadingMessages: false,
  isSyncingMessages: false,
  contacts: [] as ChatContact[],
  securityAlerts: [] as SecurityAlert[],
  totalUnreadCount: 0,
  tags: [] as UserTag[],
  archivedConversationIds: [] as string[],
  pinnedConversationIds: [] as string[],
  manuallyUnreadConversationIds: [] as string[],
  mutedConversationIds: [] as string[],
  _lastContactRefreshAt: 0,
  _messageIdSet: new Set<string>(),
  _messageById: new Map<string, ChatMessage>(),
  _messagesByConversationId: new Map<string, ChatMessage[]>(),
  _contactsByIdentityId: new Map<string, ChatContact>(),
  _contactsByWalletAddress: new Map<string, ChatContact>(),
}

function buildMessageIndexes(messages: ChatMessage[]): Pick<ChatState, '_messageIdSet' | '_messageById' | '_messagesByConversationId'> {
  const _messageIdSet = new Set<string>()
  const _messageById = new Map<string, ChatMessage>()
  const _messagesByConversationId = new Map<string, ChatMessage[]>()

  for (const message of messages) {
    _messageIdSet.add(message.id)
    _messageById.set(message.id, message)
    const conversationMessages = _messagesByConversationId.get(message.conversationId)
    if (conversationMessages) {
      conversationMessages.push(message)
    } else {
      _messagesByConversationId.set(message.conversationId, [message])
    }
  }

  return { _messageIdSet, _messageById, _messagesByConversationId }
}

function isChronologicalConversationWindow(messages: ChatMessage[]): boolean {
  for (let index = 1; index < messages.length; index += 1) {
    const previous = messages[index - 1].localOrderTimestamp ?? messages[index - 1].timestamp
    const next = messages[index].localOrderTimestamp ?? messages[index].timestamp
    if (next < previous) {
      return false
    }
  }
  return true
}

function boundConversationMessages(messages: ChatMessage[], limit: number): ChatMessage[] {
  if (messages.length <= limit) {
    return messages
  }

  if (isChronologicalConversationWindow(messages)) {
    return messages.slice(-limit)
  }

  return [...messages]
    .sort((left, right) => (
      (left.localOrderTimestamp ?? left.timestamp) - (right.localOrderTimestamp ?? right.timestamp)
    ))
    .slice(-limit)
}

function replaceConversationMessages(
  state: Pick<ChatState, 'messages' | '_messageIdSet' | '_messageById' | '_messagesByConversationId'>,
  conversationId: string,
  nextConversationMessages: ChatMessage[],
): Pick<ChatState, 'messages' | '_messageIdSet' | '_messageById' | '_messagesByConversationId'> {
  const previousConversationMessages = state._messagesByConversationId.get(conversationId) ?? []
  const messages = [
    ...state.messages.filter((message) => message.conversationId !== conversationId),
    ...nextConversationMessages,
  ]
  const _messageIdSet = new Set(state._messageIdSet)
  const _messageById = new Map(state._messageById)
  const _messagesByConversationId = new Map(state._messagesByConversationId)

  for (const message of previousConversationMessages) {
    _messageIdSet.delete(message.id)
    _messageById.delete(message.id)
  }
  for (const message of nextConversationMessages) {
    _messageIdSet.add(message.id)
    _messageById.set(message.id, message)
  }

  if (nextConversationMessages.length > 0) {
    _messagesByConversationId.set(conversationId, nextConversationMessages)
  } else {
    _messagesByConversationId.delete(conversationId)
  }

  return { messages, _messageIdSet, _messageById, _messagesByConversationId }
}

function retainMessageWindows(
  state: Pick<ChatState, 'conversations' | 'messages' | '_messagesByConversationId'>,
  activeConversationId: string | null,
  warmConversationIds: readonly string[],
): Pick<ChatState, 'messages' | '_messageIdSet' | '_messageById' | '_messagesByConversationId'> {
  const retainedConversationIds = new Set<string>()
  if (
    activeConversationId
    && (
      state._messagesByConversationId.has(activeConversationId)
      || state.conversations.some((conversation) => conversation.id === activeConversationId)
    )
  ) {
    retainedConversationIds.add(activeConversationId)
  }
  for (const conversationId of warmConversationIds) {
    if (state._messagesByConversationId.has(conversationId)) {
      retainedConversationIds.add(conversationId)
    }
  }

  if (retainedConversationIds.size === 0) {
    return {
      messages: [],
      ...buildMessageIndexes([]),
    }
  }

  const _messagesByConversationId = new Map<string, ChatMessage[]>()
  for (const conversationId of retainedConversationIds) {
    const messages = state._messagesByConversationId.get(conversationId)
    if (!messages?.length) continue
    _messagesByConversationId.set(
      conversationId,
      boundConversationMessages(
        messages,
        conversationId === activeConversationId
          ? MAX_ACTIVE_CONVERSATION_MESSAGES
          : WARM_DIRECT_CONVERSATION_MESSAGE_LIMIT,
      ),
    )
  }

  const messages = Array.from(_messagesByConversationId.values()).flat()
  return {
    messages,
    ...buildMessageIndexes(messages),
  }
}

function touchWarmDirectConversation(
  ids: readonly string[],
  conversationId: string,
): string[] {
  return [
    conversationId,
    ...ids.filter((id) => id !== conversationId),
  ].slice(0, MAX_WARM_DIRECT_CONVERSATIONS)
}

function hasSameConversationIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function shouldWarmDirectConversation(
  state: Pick<ChatState, 'conversations' | 'storageScope'>,
  conversationId: string,
): boolean {
  const conversation = state.conversations.find((entry) => entry.id === conversationId)
  return Boolean(
    conversation
    && conversation.type !== 'group'
    && getConversationLocalWallet(conversation, state.storageScope) === state.storageScope,
  )
}

function getWarmDirectConversationIdsForMessage(
  state: Pick<ChatState, 'conversations' | 'storageScope' | 'warmDirectConversationIds'>,
  conversationId: string,
): string[] {
  return shouldWarmDirectConversation(state, conversationId)
    ? touchWarmDirectConversation(state.warmDirectConversationIds, conversationId)
    : state.warmDirectConversationIds
}

function getMessageWindowLimit(
  activeConversationId: string | null,
  warmConversationIds: readonly string[],
  conversationId: string,
): number {
  if (conversationId === activeConversationId) {
    return MAX_ACTIVE_CONVERSATION_MESSAGES
  }

  return warmConversationIds.includes(conversationId)
    ? WARM_DIRECT_CONVERSATION_MESSAGE_LIMIT
    : MAX_INACTIVE_CONVERSATION_MESSAGES
}

function boundMessagesForMemory(
  messages: ChatMessage[],
  activeConversationId: string | null,
  warmConversationIds: readonly string[],
): ChatMessage[] {
  const byConversation = new Map<string, ChatMessage[]>()
  for (const message of messages) {
    const existing = byConversation.get(message.conversationId)
    if (existing) {
      existing.push(message)
    } else {
      byConversation.set(message.conversationId, [message])
    }
  }

  return Array.from(byConversation.entries()).flatMap(([conversationId, conversationMessages]) => {
    const limit = getMessageWindowLimit(
      activeConversationId,
      warmConversationIds,
      conversationId,
    )
    return boundConversationMessages(conversationMessages, limit)
  })
}

function buildContactIndexes(
  contacts: ChatContact[],
  preferredScope: string | null = null,
): Pick<ChatState, '_contactsByIdentityId' | '_contactsByWalletAddress'> {
  const _contactsByIdentityId = new Map<string, ChatContact>()
  const _contactsByWalletAddress = new Map<string, ChatContact>()
  const shouldReplace = (existing: ChatContact | undefined, next: ChatContact) => (
    !existing
    || (
      Boolean(preferredScope)
      && !contactMatchesActiveScope(existing, preferredScope)
      && contactMatchesActiveScope(next, preferredScope)
    )
  )

  for (const contact of contacts) {
    if (contact.identityId && shouldReplace(_contactsByIdentityId.get(contact.identityId), contact)) {
      _contactsByIdentityId.set(contact.identityId, contact)
    }
    if (contact.walletAddress && shouldReplace(_contactsByWalletAddress.get(contact.walletAddress), contact)) {
      _contactsByWalletAddress.set(contact.walletAddress, contact)
    }
  }

  return { _contactsByIdentityId, _contactsByWalletAddress }
}

function addMessageToConversationIndex(
  index: Map<string, ChatMessage[]>,
  message: ChatMessage,
): Map<string, ChatMessage[]> {
  const next = new Map(index)
  const existing = next.get(message.conversationId) ?? []
  next.set(message.conversationId, [...existing, message])
  return next
}

function updateMessageInConversationIndex(
  index: Map<string, ChatMessage[]>,
  previous: ChatMessage,
  updated: ChatMessage,
): Map<string, ChatMessage[]> {
  if (previous.conversationId !== updated.conversationId) {
    return buildMessageIndexes(
      Array.from(index.values())
        .flat()
        .map((message) => (message.id === previous.id ? updated : message)),
    )._messagesByConversationId
  }

  const next = new Map(index)
  const messages = next.get(updated.conversationId)
  if (!messages) {
    next.set(updated.conversationId, [updated])
    return next
  }
  next.set(updated.conversationId, messages.map((message) => (
    message.id === previous.id ? updated : message
  )))
  return next
}

function removeMessageFromConversationIndex(
  index: Map<string, ChatMessage[]>,
  message: ChatMessage,
): Map<string, ChatMessage[]> {
  const next = new Map(index)
  const messages = next.get(message.conversationId)
  if (!messages) return next

  const filtered = messages.filter((candidate) => candidate.id !== message.id)
  if (filtered.length === 0) {
    next.delete(message.conversationId)
  } else {
    next.set(message.conversationId, filtered)
  }
  return next
}

function getLocalWalletScope(value: string | null | undefined, fallbackScope: string | null): string | undefined {
  return normalizeAccountStorageScope(value || fallbackScope) || undefined
}

function getConversationLocalWallet(conversation: Conversation, fallbackScope: string | null): string | undefined {
  return getLocalWalletScope(conversation.localWalletAddress, fallbackScope)
}

function getContactLocalWallet(contact: ChatContact, fallbackScope: string | null): string | undefined {
  return getLocalWalletScope(contact.localWalletAddress, fallbackScope)
}

function buildScopedKey(localWalletAddress: string | undefined, value: string): string {
  return `${localWalletAddress || 'legacy'}:${value}`
}

function normalizeUnreadCount(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value ?? 0)) : 0
}

function mergeRemoteAccountState(
  existing: Conversation,
  incoming: Conversation,
): Pick<Conversation, 'remoteAccountState' | 'remoteAccountStateUpdatedAt'> {
  if (
    existing.remoteWalletAddress
    && incoming.remoteWalletAddress
    && existing.remoteWalletAddress.toLowerCase() !== incoming.remoteWalletAddress.toLowerCase()
  ) {
    return {
      remoteAccountState: incoming.remoteAccountState,
      remoteAccountStateUpdatedAt: incoming.remoteAccountStateUpdatedAt,
    }
  }

  const existingUpdatedAt = Number.isSafeInteger(existing.remoteAccountStateUpdatedAt)
    ? existing.remoteAccountStateUpdatedAt!
    : 0
  const incomingUpdatedAt = Number.isSafeInteger(incoming.remoteAccountStateUpdatedAt)
    ? incoming.remoteAccountStateUpdatedAt!
    : 0
  const latest = incomingUpdatedAt > existingUpdatedAt ? incoming : existing

  return {
    remoteAccountState: latest.remoteAccountState,
    remoteAccountStateUpdatedAt: latest.remoteAccountStateUpdatedAt,
  }
}

function getUnreadProjectionKey(conversation: Conversation, fallbackScope: string | null): string {
  const localWalletAddress = getConversationLocalWallet(conversation, fallbackScope)
  const remoteKey = conversation.remoteWalletAddress
    ? `wallet:${conversation.remoteWalletAddress}`
    : conversation.remoteIdentityId
      ? `identity:${conversation.remoteIdentityId}`
      : `conversation:${conversation.id}`
  return buildScopedKey(localWalletAddress, remoteKey)
}

function calculateTotalUnreadCount(
  conversations: Conversation[],
  fallbackScope: string | null,
): number {
  const canonical = new Map<string, Conversation>()
  for (const conversation of conversations) {
    if (!isConversationListVisible(conversation)) continue
    const key = getUnreadProjectionKey(conversation, fallbackScope)
    const current = canonical.get(key)
    if (
      !current
      || (conversation.updatedAt ?? conversation.createdAt) >= (current.updatedAt ?? current.createdAt)
    ) {
      canonical.set(key, conversation)
    }
  }
  return [...canonical.values()].reduce(
    (sum, conversation) => sum + normalizeUnreadCount(conversation.unreadCount),
    0,
  )
}

function replaceConversationPreferenceId(ids: string[], oldId: string, newId: string): string[] {
  if (!ids.includes(oldId)) {
    return ids
  }

  const next = ids
    .map((id) => (id === oldId ? newId : id))
    .filter((id, index, values) => values.indexOf(id) === index)
  return next
}

function contactMatchesActiveScope(
  contact: ChatContact,
  storageScope: string | null,
): boolean {
  if (!storageScope) {
    return true
  }

  return getContactLocalWallet(contact, storageScope) === storageScope
}

const STATUS_RANK: Record<NonNullable<ChatMessage['status']>, number> = {
  sending: 0,
  sent: 1,
  failed: 1.5,
  delivered: 2,
  read: 3,
}

function getStatusRank(status: ChatMessage['status']): number {
  return status ? (STATUS_RANK[status] ?? 1) : 1
}

function getCanonicalDeliveryState(
  status: ChatMessage['status'],
): Pick<ChatMessage, 'deliveryStage' | 'deliveryHint'> | null {
  switch (status) {
    case 'sending':
      return { deliveryStage: 'relaying', deliveryHint: 'Relaying' }
    case 'delivered':
      return { deliveryStage: 'delivered', deliveryHint: 'Delivered' }
    case 'read':
      return { deliveryStage: 'read', deliveryHint: 'Read' }
    case 'failed':
      return { deliveryStage: 'failed', deliveryHint: 'Failed' }
    default:
      return null
  }
}

function getSentDeliveryState(
  loaded: ChatMessage,
  existing?: ChatMessage,
): Pick<ChatMessage, 'deliveryStage' | 'deliveryHint'> {
  const candidates = [loaded, existing].filter(Boolean) as ChatMessage[]
  const candidate = candidates.find((message) =>
    message.deliveryStage === 'awaiting_recipient' || message.deliveryStage === 'relayed'
  )

  return {
    deliveryStage: candidate?.deliveryStage ?? 'relayed',
    deliveryHint: candidate?.deliveryHint ?? (candidate?.deliveryStage === 'awaiting_recipient' ? 'Waiting for poll' : 'Sent'),
  }
}

function isLocalOwnMessage(message: ChatMessage): boolean {
  return Boolean(message.localIdentityId && message.senderId === message.localIdentityId)
}

function normalizeMessageDeliveryState(message: ChatMessage): ChatMessage {
  const status = message.status ?? (isLocalOwnMessage(message) ? 'sent' : undefined)
  const deliveryState = status === 'sent'
    ? getSentDeliveryState(message)
    : getCanonicalDeliveryState(status)
  const shouldUseCanonicalDeliveryState = Boolean(status && status !== 'sent' && deliveryState)

  if (
    status === message.status
    && (!deliveryState || (
      message.deliveryStage === deliveryState.deliveryStage
      && message.deliveryHint === deliveryState.deliveryHint
    ))
  ) {
    return message
  }

  return {
    ...message,
    status,
    deliveryStage: shouldUseCanonicalDeliveryState
      ? deliveryState?.deliveryStage
      : message.deliveryStage ?? deliveryState?.deliveryStage,
    deliveryHint: shouldUseCanonicalDeliveryState
      ? deliveryState?.deliveryHint
      : message.deliveryHint ?? deliveryState?.deliveryHint,
  }
}

function mergeMessageStatus(
  previousStatus: ChatMessage['status'],
  incomingStatus: ChatMessage['status'],
): ChatMessage['status'] {
  if (!incomingStatus) return previousStatus
  if (!previousStatus) return incomingStatus
  if (previousStatus === 'failed' && incomingStatus === 'sending') return incomingStatus
  if (incomingStatus === 'failed' && previousStatus !== 'sending') return previousStatus
  return getStatusRank(incomingStatus) < getStatusRank(previousStatus)
    ? previousStatus
    : incomingStatus
}

function persistSwipePreference(key: string, ids: string[], scope: string | null) {
  getAppKeyValueStorage().setItem(getSwipePreferenceStorageKey(key, scope), JSON.stringify(ids)).catch((e) =>
    console.warn('Failed to persist swipe preference:', e)
  )
}

function syncMutedToServer(mutedIds: string[]) {
  if (useSpectreStore.getState().enabled) {
    return
  }

  import('@/lib/identity').then(({ getCachedIdentityId }) => {
    const identityId = getCachedIdentityId()
    if (!identityId) return
    import('@/services/backend/client').then(({ updateMutedConversations }) => {
      updateMutedConversations(identityId, mutedIds).catch((e) =>
        console.warn('Failed to sync muted conversations to server:', e)
      )
    })
  })
}

export const useChatStore = create<ChatState>((set, get) => ({
  ...initialState,

  getMessageById: (id) => get()._messageById.get(id),

  setInitialized: (initialized) => set({ isInitialized: initialized }),
  setInitializing: (initializing) => set({ isInitializing: initializing }),
  setConversationsReady: (ready) => set({ conversationsReady: ready }),
  setContactsReady: (ready) => set({ contactsReady: ready }),
  setStorageScope: (scope, options) => {
    const normalizedScope = normalizeAccountStorageScope(scope)
    const current = get()
    const contacts = current.contacts
    const scopeChanged = current.storageScope !== normalizedScope
    set({
      storageScope: normalizedScope,
      allowLegacyPreferenceMigration: options?.allowLegacyMigration === true,
      ...(scopeChanged ? {
        conversationsReady: false,
        contactsReady: false,
        activeConversationId: null,
        warmDirectConversationIds: [],
        messages: [],
        isLoadingMessages: false,
        isSyncingMessages: false,
        _messageIdSet: new Set<string>(),
        _messageById: new Map<string, ChatMessage>(),
        _messagesByConversationId: new Map<string, ChatMessage[]>(),
      } : {}),
      archivedConversationIds: [],
      pinnedConversationIds: [],
      manuallyUnreadConversationIds: [],
      mutedConversationIds: [],
      ...buildContactIndexes(contacts, normalizedScope),
    })
  },

  setConversations: (conversations) => {
    const state = get()
    const storageScope = state.storageScope
    const scopedConversations = conversations.map((conversation) => ({
      ...conversation,
      localWalletAddress: getConversationLocalWallet(conversation, storageScope) || conversation.localWalletAddress,
      hasVisibleActivity: conversation.lastMessage ? true : conversation.hasVisibleActivity,
    }))
    const totalUnreadCount = calculateTotalUnreadCount(scopedConversations, storageScope)
    const availableConversationIds = new Set(scopedConversations.map((conversation) => conversation.id))
    const warmDirectConversationIds = state.warmDirectConversationIds.filter(
      (id) => availableConversationIds.has(id),
    )
    const activeConversationId = state.activeConversationId
      && availableConversationIds.has(state.activeConversationId)
      ? state.activeConversationId
      : null
    set({
      conversations: scopedConversations,
      totalUnreadCount,
      activeConversationId,
      warmDirectConversationIds,
      ...retainMessageWindows(
        { ...state, conversations: scopedConversations },
        activeConversationId,
        warmDirectConversationIds,
      ),
    })
  },

  addConversation: (conversation) => {
    set((state) => {
      if (!conversation.remoteIdentityId || conversation.remoteIdentityId === 'undefined' || conversation.remoteIdentityId === 'null') {
        return state
      }

      const localWalletAddress = getConversationLocalWallet(conversation, state.storageScope)
      const walletAddr = conversation.remoteWalletAddress
      const newContact = state.contacts.find(
        c => c.identityId === conversation.remoteIdentityId
          && getContactLocalWallet(c, state.storageScope) === localWalletAddress
      )
      const effectiveWallet = walletAddr || newContact?.walletAddress

      // Merge by wallet first to survive identity rotation.
      if (effectiveWallet) {
        const existingIdx = state.conversations.findIndex(
          c => c.remoteWalletAddress === effectiveWallet
            && getConversationLocalWallet(c, state.storageScope) === localWalletAddress
        )
        if (existingIdx !== -1) {
          const existing = state.conversations[existingIdx]
          const conversations = [...state.conversations]
          conversations[existingIdx] = {
            ...existing,
            localIdentityId: conversation.localIdentityId || existing.localIdentityId,
            localWalletAddress: localWalletAddress || existing.localWalletAddress,
            localDisplayName: conversation.localDisplayName || existing.localDisplayName,
            remoteIdentityId: conversation.remoteIdentityId,
            remoteWalletAddress: effectiveWallet,
            remoteScreenshotProtection: conversation.remoteScreenshotProtection ?? existing.remoteScreenshotProtection,
            remoteScreenshotProtectionUpdatedAt: conversation.remoteScreenshotProtectionUpdatedAt ?? existing.remoteScreenshotProtectionUpdatedAt,
            remoteTorEnabled: conversation.remoteTorEnabled ?? existing.remoteTorEnabled,
            remoteTorUpdatedAt: conversation.remoteTorUpdatedAt ?? existing.remoteTorUpdatedAt,
            ...mergeRemoteAccountState(existing, conversation),
            unreadCount: normalizeUnreadCount(conversation.unreadCount),
            hasVisibleActivity: conversation.lastMessage
              ? true
              : conversation.hasVisibleActivity ?? existing.hasVisibleActivity,
            ...(conversation.lastMessage ? { lastMessage: conversation.lastMessage } : {}),
          }
          return {
            conversations,
            totalUnreadCount: calculateTotalUnreadCount(conversations, state.storageScope),
          }
        }
      }

      // Fall back to id or scoped identity matches.
      const duplicateIdx = state.conversations.findIndex(
        (c) => c.id === conversation.id
          || (
            c.remoteIdentityId === conversation.remoteIdentityId
            && getConversationLocalWallet(c, state.storageScope) === localWalletAddress
          )
      )
      if (duplicateIdx !== -1) {
        const conversations = [...state.conversations]
        const existing = conversations[duplicateIdx]
        conversations[duplicateIdx] = {
          ...existing,
          ...conversation,
          id: existing.id,
          localWalletAddress: localWalletAddress || conversation.localWalletAddress,
          ...mergeRemoteAccountState(existing, conversation),
          unreadCount: normalizeUnreadCount(conversation.unreadCount),
          hasVisibleActivity: conversation.lastMessage
            ? true
            : conversation.hasVisibleActivity ?? existing.hasVisibleActivity,
        }
        return {
          conversations,
          totalUnreadCount: calculateTotalUnreadCount(conversations, state.storageScope),
        }
      }

      // Fill missing wallet matches from contacts.
      if (effectiveWallet) {
        const sameWalletContact = state.contacts.find(
          c => c.identityId !== conversation.remoteIdentityId
            && c.walletAddress === effectiveWallet
            && getContactLocalWallet(c, state.storageScope) === localWalletAddress
        )
        if (sameWalletContact) {
          const existingConvIdx = state.conversations.findIndex(
            c => c.remoteIdentityId === sameWalletContact.identityId
              && getConversationLocalWallet(c, state.storageScope) === localWalletAddress
          )
          if (existingConvIdx !== -1) {
            const conversations = [...state.conversations]
            conversations[existingConvIdx] = {
              ...conversations[existingConvIdx],
              localWalletAddress: localWalletAddress || conversations[existingConvIdx].localWalletAddress,
              remoteIdentityId: conversation.remoteIdentityId,
              remoteWalletAddress: effectiveWallet,
              ...mergeRemoteAccountState(conversations[existingConvIdx], conversation),
              unreadCount: normalizeUnreadCount(conversation.unreadCount),
            }
            return {
              conversations,
              totalUnreadCount: calculateTotalUnreadCount(conversations, state.storageScope),
            }
          }
        }
      }

      const conversations = [...state.conversations, {
        ...conversation,
        unreadCount: normalizeUnreadCount(conversation.unreadCount),
        localWalletAddress: localWalletAddress || conversation.localWalletAddress,
        remoteWalletAddress: effectiveWallet || conversation.remoteWalletAddress,
        hasVisibleActivity: conversation.lastMessage ? true : conversation.hasVisibleActivity,
      }]
      return {
        conversations,
        totalUnreadCount: calculateTotalUnreadCount(conversations, state.storageScope),
      }
    })
  },

  mergeConversations: (incoming) => {
    if (__DEV__) console.log(`[ChatStore] mergeConversations: ${incoming.length} incoming`)
    set((state) => {
      const byId = new Map(state.conversations.map(c => [c.id, c]))
      const byRemoteId = new Map(
        state.conversations.map(c => [
          buildScopedKey(getConversationLocalWallet(c, state.storageScope), c.remoteIdentityId),
          c,
        ])
      )
      const byWallet = new Map<string, Conversation>()
      for (const c of state.conversations) {
        const localWalletAddress = getConversationLocalWallet(c, state.storageScope)
        if (c.remoteWalletAddress) {
          byWallet.set(buildScopedKey(localWalletAddress, c.remoteWalletAddress), c)
        }
      }

      const result = [...state.conversations]
      const resultById = new Map(result.map((c, i) => [c.id, i]))
      let archivedConversationIds = state.archivedConversationIds
      let pinnedConversationIds = state.pinnedConversationIds
      let manuallyUnreadConversationIds = state.manuallyUnreadConversationIds
      let mutedConversationIds = state.mutedConversationIds

      for (const conv of incoming) {
        if (!conv.remoteIdentityId || conv.remoteIdentityId === 'undefined' || conv.remoteIdentityId === 'null') {
          continue
        }

        const localWalletAddress = getConversationLocalWallet(conv, state.storageScope)
        const walletAddr = conv.remoteWalletAddress
        const newContact = state.contacts.find(
          c => c.identityId === conv.remoteIdentityId
            && getContactLocalWallet(c, state.storageScope) === localWalletAddress
        )
        const effectiveWallet = walletAddr || newContact?.walletAddress

        const existingByWallet = effectiveWallet
          ? byWallet.get(buildScopedKey(localWalletAddress, effectiveWallet))
          : undefined
        const existing = byId.get(conv.id)
          || byRemoteId.get(buildScopedKey(localWalletAddress, conv.remoteIdentityId))
          || existingByWallet

        if (existing) {
          const idx = resultById.get(existing.id)
          if (idx !== undefined) {
            const merged = {
              ...existing,
              localIdentityId: conv.localIdentityId || existing.localIdentityId,
              localWalletAddress: localWalletAddress || existing.localWalletAddress,
              localDisplayName: conv.localDisplayName || existing.localDisplayName,
              remoteIdentityId: conv.remoteIdentityId,
              remoteWalletAddress: effectiveWallet || existing.remoteWalletAddress,
              remoteScreenshotProtection: conv.remoteScreenshotProtection ?? existing.remoteScreenshotProtection,
              remoteScreenshotProtectionUpdatedAt: conv.remoteScreenshotProtectionUpdatedAt ?? existing.remoteScreenshotProtectionUpdatedAt,
              remoteTorEnabled: conv.remoteTorEnabled ?? existing.remoteTorEnabled,
              remoteTorUpdatedAt: conv.remoteTorUpdatedAt ?? existing.remoteTorUpdatedAt,
              ...mergeRemoteAccountState(existing, conv),
              unreadCount: normalizeUnreadCount(conv.unreadCount),
              hasVisibleActivity: conv.lastMessage
                ? true
                : conv.hasVisibleActivity ?? existing.hasVisibleActivity,
              ...(conv.lastMessage ? { lastMessage: conv.lastMessage } : {}),
              ...(conv.displayName ? { displayName: conv.displayName } : {}),
            }
            if (existing.id !== conv.id) {
              archivedConversationIds = replaceConversationPreferenceId(archivedConversationIds, existing.id, conv.id)
              pinnedConversationIds = replaceConversationPreferenceId(pinnedConversationIds, existing.id, conv.id)
              manuallyUnreadConversationIds = replaceConversationPreferenceId(manuallyUnreadConversationIds, existing.id, conv.id)
              mutedConversationIds = replaceConversationPreferenceId(mutedConversationIds, existing.id, conv.id)
              merged.id = conv.id
              resultById.delete(existing.id)
              resultById.set(conv.id, idx)
              byId.delete(existing.id)
            }
            result[idx] = merged
            byId.set(merged.id, merged)
            byRemoteId.set(buildScopedKey(localWalletAddress, merged.remoteIdentityId), merged)
            if (merged.remoteWalletAddress) {
              byWallet.set(buildScopedKey(localWalletAddress, merged.remoteWalletAddress), merged)
            }
          }
        } else {
          const newConv = {
            ...conv,
            unreadCount: normalizeUnreadCount(conv.unreadCount),
            localWalletAddress: localWalletAddress || conv.localWalletAddress,
            remoteWalletAddress: effectiveWallet || conv.remoteWalletAddress,
            hasVisibleActivity: conv.lastMessage ? true : conv.hasVisibleActivity,
          }
          resultById.set(newConv.id, result.length)
          result.push(newConv)
          byId.set(newConv.id, newConv)
          byRemoteId.set(buildScopedKey(localWalletAddress, newConv.remoteIdentityId), newConv)
          if (newConv.remoteWalletAddress) {
            byWallet.set(buildScopedKey(localWalletAddress, newConv.remoteWalletAddress), newConv)
          }
        }
      }

      const totalUnreadCount = calculateTotalUnreadCount(result, state.storageScope)
      if (archivedConversationIds !== state.archivedConversationIds) {
        persistSwipePreference(STORAGE_KEYS.ARCHIVED_CONVERSATIONS, archivedConversationIds, state.storageScope)
      }
      if (pinnedConversationIds !== state.pinnedConversationIds) {
        persistSwipePreference(STORAGE_KEYS.PINNED_CONVERSATIONS, pinnedConversationIds, state.storageScope)
      }
      if (manuallyUnreadConversationIds !== state.manuallyUnreadConversationIds) {
        persistSwipePreference(STORAGE_KEYS.MANUALLY_UNREAD_CONVERSATIONS, manuallyUnreadConversationIds, state.storageScope)
      }
      if (mutedConversationIds !== state.mutedConversationIds) {
        persistSwipePreference(STORAGE_KEYS.MUTED_CONVERSATIONS, mutedConversationIds, state.storageScope)
        syncMutedToServer(mutedConversationIds)
      }
      return {
        conversations: result,
        totalUnreadCount,
        archivedConversationIds,
        pinnedConversationIds,
        manuallyUnreadConversationIds,
        mutedConversationIds,
      }
    })
  },

  updateConversation: (id, updates) => {
    set((state) => {
      const conversationIndex = state.conversations.findIndex((conversation) => conversation.id === id)
      if (conversationIndex === -1) return state

      const previousConversation = state.conversations[conversationIndex]
      const lastMessage = updates.lastMessage
        && previousConversation.lastMessage
        && updates.lastMessage.content === previousConversation.lastMessage.content
        && updates.lastMessage.timestamp === previousConversation.lastMessage.timestamp
        && updates.lastMessage.isOwn === previousConversation.lastMessage.isOwn
        ? previousConversation.lastMessage
        : updates.lastMessage
      const updatedConversation = {
        ...previousConversation,
        ...updates,
        ...(lastMessage ? { lastMessage } : {}),
        hasVisibleActivity: updates.lastMessage
          ? true
          : updates.hasVisibleActivity ?? previousConversation.hasVisibleActivity,
      }
      const unchanged = Object.keys(updatedConversation).length === Object.keys(previousConversation).length
        && Object.entries(updatedConversation).every(([key, value]) => (
          previousConversation[key as keyof Conversation] === value
        ))
      if (unchanged) return state

      const conversations = state.conversations.slice()
      conversations[conversationIndex] = updatedConversation
      const totalUnreadCount = calculateTotalUnreadCount(conversations, state.storageScope)
      return { conversations, totalUnreadCount }
    })
  },

  batchUpdateConversations: (updates) => {
    if (__DEV__) console.log(`[ChatStore] batchUpdateConversations: ${updates.length} updates`)
    set((state) => {
      const updateMap = new Map(updates.map(u => [u.id, u.changes]))
      const conversations = state.conversations.map((conv) => {
        const changes = updateMap.get(conv.id)
        return changes
          ? {
              ...conv,
              ...changes,
              hasVisibleActivity: changes.lastMessage ? true : changes.hasVisibleActivity ?? conv.hasVisibleActivity,
            }
          : conv
      })
      const totalUnreadCount = calculateTotalUnreadCount(conversations, state.storageScope)
      return { conversations, totalUnreadCount }
    })
  },

  removeConversation: (id) => {
    set((state) => {
      const conversations = state.conversations.filter((c) => c.id !== id)
      const messages = state.messages.filter((m) => m.conversationId !== id)
      const totalUnreadCount = calculateTotalUnreadCount(conversations, state.storageScope)
      const archivedConversationIds = state.archivedConversationIds.filter((i) => i !== id)
      const pinnedConversationIds = state.pinnedConversationIds.filter((i) => i !== id)
      const manuallyUnreadConversationIds = state.manuallyUnreadConversationIds.filter((i) => i !== id)
      const mutedConversationIds = state.mutedConversationIds.filter((i) => i !== id)
      const warmDirectConversationIds = state.warmDirectConversationIds.filter((i) => i !== id)
      persistSwipePreference(STORAGE_KEYS.ARCHIVED_CONVERSATIONS, archivedConversationIds, state.storageScope)
      persistSwipePreference(STORAGE_KEYS.PINNED_CONVERSATIONS, pinnedConversationIds, state.storageScope)
      persistSwipePreference(STORAGE_KEYS.MANUALLY_UNREAD_CONVERSATIONS, manuallyUnreadConversationIds, state.storageScope)
      persistSwipePreference(STORAGE_KEYS.MUTED_CONVERSATIONS, mutedConversationIds, state.storageScope)
      return {
        conversations, messages, ...buildMessageIndexes(messages), totalUnreadCount,
        archivedConversationIds, pinnedConversationIds, manuallyUnreadConversationIds, mutedConversationIds,
        warmDirectConversationIds,
        activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
      }
    })
  },

  setActiveConversation: (id) => set((state) => {
    const warmDirectConversationIds = id
      ? touchWarmDirectConversation(state.warmDirectConversationIds, id)
      : state.warmDirectConversationIds
    if (
      state.activeConversationId === id
      && hasSameConversationIds(state.warmDirectConversationIds, warmDirectConversationIds)
    ) {
      return state
    }
    return {
      activeConversationId: id,
      warmDirectConversationIds,
      ...retainMessageWindows(state, id, warmDirectConversationIds),
    }
  }),

  warmDirectConversation: (id) => set((state) => {
    if (!shouldWarmDirectConversation(state, id) || !state._messagesByConversationId.has(id)) {
      return state
    }

    const warmDirectConversationIds = touchWarmDirectConversation(
      state.warmDirectConversationIds,
      id,
    )
    if (
      hasSameConversationIds(state.warmDirectConversationIds, warmDirectConversationIds)
    ) {
      return state
    }

    return {
      warmDirectConversationIds,
      ...retainMessageWindows(
        state,
        state.activeConversationId,
        warmDirectConversationIds,
      ),
    }
  }),

  evictDirectConversationWindow: (id) => set((state) => {
    const messages = state.messages.filter((message) => message.conversationId !== id)
    const warmDirectConversationIds = state.warmDirectConversationIds.filter(
      (conversationId) => conversationId !== id,
    )
    if (
      messages.length === state.messages.length
      && warmDirectConversationIds.length === state.warmDirectConversationIds.length
      && state.activeConversationId !== id
    ) {
      return state
    }

    return {
      messages,
      ...buildMessageIndexes(messages),
      warmDirectConversationIds,
      activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
    }
  }),

  evictDirectConversationWindowsForPeer: (peerId) => set((state) => {
    const conversationIds = new Set(
      state.conversations
        .filter((conversation) => (
          conversation.type !== 'group'
          && getConversationLocalWallet(conversation, state.storageScope) === state.storageScope
          && (
            conversation.remoteIdentityId === peerId
            || conversation.remoteWalletAddress === peerId
          )
        ))
        .map((conversation) => conversation.id),
    )
    if (conversationIds.size === 0) {
      return state
    }

    const messages = state.messages.filter(
      (message) => !conversationIds.has(message.conversationId),
    )
    const warmDirectConversationIds = state.warmDirectConversationIds.filter(
      (conversationId) => !conversationIds.has(conversationId),
    )
    return {
      messages,
      ...buildMessageIndexes(messages),
      warmDirectConversationIds,
      activeConversationId: state.activeConversationId && conversationIds.has(state.activeConversationId)
        ? null
        : state.activeConversationId,
    }
  }),

  setMessages: (messages, conversationId) => {
    set((state) => {
      if (conversationId) {
        const warmDirectConversationIds = getWarmDirectConversationIdsForMessage(
          state,
          conversationId,
        )
        const limit = getMessageWindowLimit(
          state.activeConversationId,
          warmDirectConversationIds,
          conversationId,
        )
        const normalizedMessages = boundConversationMessages(
          messages.map(normalizeMessageDeliveryState),
          limit,
        )
        const next = replaceConversationMessages(state, conversationId, normalizedMessages)
        if (hasSameConversationIds(state.warmDirectConversationIds, warmDirectConversationIds)) {
          return next
        }
        return {
          warmDirectConversationIds,
          ...retainMessageWindows(
            { ...state, ...next },
            state.activeConversationId,
            warmDirectConversationIds,
          ),
        }
      }
      const normalizedMessages = boundMessagesForMemory(
        messages.map(normalizeMessageDeliveryState),
        state.activeConversationId,
        state.warmDirectConversationIds,
      )
      return { messages: normalizedMessages, ...buildMessageIndexes(normalizedMessages) }
    })
  },

  addMessage: (message) => {
    let inserted = false
    set((state) => {
      const normalizedMessage = normalizeMessageDeliveryState(message)
      if (state._messageIdSet.has(normalizedMessage.id)) {
        return state
      }
      const conversationMessages = state._messagesByConversationId.get(normalizedMessage.conversationId) ?? []
      const warmDirectConversationIds = getWarmDirectConversationIdsForMessage(
        state,
        normalizedMessage.conversationId,
      )
      const warmWindowChanged = !hasSameConversationIds(
        state.warmDirectConversationIds,
        warmDirectConversationIds,
      )
      const limit = getMessageWindowLimit(
        state.activeConversationId,
        warmDirectConversationIds,
        normalizedMessage.conversationId,
      )
      if (conversationMessages.length >= limit) {
        const boundedMessages = boundConversationMessages(
          [...conversationMessages, normalizedMessage],
          limit,
        )
        inserted = boundedMessages.some((entry) => entry.id === normalizedMessage.id)
        if (!inserted) {
          return state
        }
        const next = replaceConversationMessages(
          state,
          normalizedMessage.conversationId,
          boundedMessages,
        )
        return warmWindowChanged
          ? {
              warmDirectConversationIds,
              ...retainMessageWindows(
                { ...state, ...next },
                state.activeConversationId,
                warmDirectConversationIds,
              ),
            }
          : next
      }
      inserted = true
      const newIdSet = new Set(state._messageIdSet)
      newIdSet.add(normalizedMessage.id)
      const newMessageById = new Map(state._messageById)
      newMessageById.set(normalizedMessage.id, normalizedMessage)
      const next = {
        messages: [...state.messages, normalizedMessage],
        _messageIdSet: newIdSet,
        _messageById: newMessageById,
        _messagesByConversationId: addMessageToConversationIndex(
          state._messagesByConversationId,
          normalizedMessage,
        ),
      }
      return warmWindowChanged
        ? {
            warmDirectConversationIds,
            ...retainMessageWindows(
              { ...state, ...next },
              state.activeConversationId,
              warmDirectConversationIds,
            ),
          }
        : next
    })
    return inserted
  },

  replaceMessage: (oldId, newMessage) => {
    set((state) => {
      const previousMessage = state._messageById.get(oldId)
      const existingMessage = state._messageById.get(newMessage.id)
      const existingStatus = mergeMessageStatus(previousMessage?.status, existingMessage?.status)
      const status = mergeMessageStatus(existingStatus, newMessage.status)
      const normalizedNewMessage = normalizeMessageDeliveryState({
        ...newMessage,
        localOrderTimestamp: newMessage.localOrderTimestamp ?? previousMessage?.localOrderTimestamp,
        status,
      })
      const newIdSet = new Set(state._messageIdSet)
      newIdSet.delete(oldId)
      if (newIdSet.has(normalizedNewMessage.id)) {
        const messages = state.messages
          .filter(msg => msg.id !== oldId)
          .map(msg => msg.id === normalizedNewMessage.id
            ? normalizeMessageDeliveryState({ ...msg, ...normalizedNewMessage })
            : msg
          )
        return {
          messages,
          ...buildMessageIndexes(messages),
        }
      }
      newIdSet.add(normalizedNewMessage.id)
      const messages = state.messages.map(msg =>
        msg.id === oldId ? normalizedNewMessage : msg
      )
      const newMessageById = new Map(state._messageById)
      newMessageById.delete(oldId)
      newMessageById.set(normalizedNewMessage.id, normalizedNewMessage)
      return {
        messages,
        _messageIdSet: newIdSet,
        _messageById: newMessageById,
        _messagesByConversationId: previousMessage
          ? updateMessageInConversationIndex(
              state._messagesByConversationId,
              previousMessage,
              normalizedNewMessage,
            )
          : buildMessageIndexes(messages)._messagesByConversationId,
      }
    })
  },

  // Merge loaded messages without dropping unsynced local state.
  mergeMessages: (loadedMessages, conversationId) => {
    set((state) => {
      const existingForConv = state._messagesByConversationId.get(conversationId) ?? []

      const existingById = new Map(existingForConv.map(m => [m.id, m]))

      const loadedById = new Set(loadedMessages.map(m => m.id))

      const reconciledLoaded = loadedMessages.map(loaded => {
        const existing = existingById.get(loaded.id)
        if (!existing) return normalizeMessageDeliveryState(loaded)

        // Keep the more advanced delivery status.
        const existingRank = getStatusRank(existing.status)
        const loadedRank = getStatusRank(loaded.status)
        const status = existingRank > loadedRank ? existing.status : loaded.status
        const deliveryState = status === 'sent'
          ? getSentDeliveryState(loaded, existing)
          : getCanonicalDeliveryState(status) ?? {
              deliveryStage: loaded.deliveryStage || existing.deliveryStage,
              deliveryHint: loaded.deliveryHint || existing.deliveryHint,
            }

        // Keep hydrated attachment URIs once available.
        let attachments = loaded.attachments
        if (existing.attachments && loaded.attachments) {
          const existingAttachById = new Map(
            existing.attachments.map(a => [a.id, a])
          )
          attachments = loaded.attachments.map(la => {
            const ea = existingAttachById.get(la.id)
            if (ea?.uri && !la.uri) return { ...la, uri: ea.uri, isEncrypted: false }
            return la
          })
        } else if (existing.attachments && !loaded.attachments) {
          attachments = existing.attachments
        }

        return normalizeMessageDeliveryState({
          ...loaded,
          status,
          deliveryStage: deliveryState.deliveryStage,
          deliveryHint: deliveryState.deliveryHint,
          attachments,
          reactions: loaded.reactions || existing.reactions,
          localOrderTimestamp: loaded.localOrderTimestamp ?? existing.localOrderTimestamp,
        })
      })

      // Keep store-only messages absent from the loaded set.
      const keptFromStore = existingForConv
        .filter(m => !loadedById.has(m.id))
        .map(normalizeMessageDeliveryState)

      const warmDirectConversationIds = getWarmDirectConversationIdsForMessage(
        state,
        conversationId,
      )
      const limit = getMessageWindowLimit(
        state.activeConversationId,
        warmDirectConversationIds,
        conversationId,
      )
      const mergedConversationMessages = boundConversationMessages(
        [...reconciledLoaded, ...keptFromStore],
        limit,
      )
      const next = replaceConversationMessages(state, conversationId, mergedConversationMessages)
      if (hasSameConversationIds(state.warmDirectConversationIds, warmDirectConversationIds)) {
        return next
      }
      return {
        warmDirectConversationIds,
        ...retainMessageWindows(
          { ...state, ...next },
          state.activeConversationId,
          warmDirectConversationIds,
        ),
      }
    })
  },

  updateMessage: (id, updates) => {
    set((state) => {
      const messageIndex = state.messages.findIndex((msg) => msg.id === id)
      if (messageIndex === -1) return state

      const messages = state.messages.slice()
      const previousMessage = messages[messageIndex]
      const status = mergeMessageStatus(previousMessage.status, updates.status)
      const preservedDeliveryState = status === previousMessage.status && updates.status !== status
        ? {
            deliveryStage: previousMessage.deliveryStage,
            deliveryHint: previousMessage.deliveryHint,
          }
        : {}
      const updatedMessage = normalizeMessageDeliveryState({
        ...messages[messageIndex],
        ...updates,
        ...preservedDeliveryState,
        status,
      })
      const unchanged = Object.keys(updatedMessage).length === Object.keys(previousMessage).length
        && Object.entries(updatedMessage).every(([key, value]) => (
          previousMessage[key as keyof ChatMessage] === value
        ))
      if (unchanged) return state

      messages[messageIndex] = updatedMessage
      if (updatedMessage.id !== id) {
        return { messages, ...buildMessageIndexes(messages) }
      }
      const newMessageById = new Map(state._messageById)
      newMessageById.set(id, updatedMessage)
      return {
        messages,
        _messageById: newMessageById,
        _messagesByConversationId: updateMessageInConversationIndex(
          state._messagesByConversationId,
          previousMessage,
          updatedMessage,
        ),
      }
    })
  },

  removeMessage: (id) => {
    set((state) => {
      const existingMessage = state._messageById.get(id)
      const messages = state.messages.filter((msg) => msg.id !== id)
      if (!existingMessage) {
        return { messages, ...buildMessageIndexes(messages) }
      }
      const newIdSet = new Set(state._messageIdSet)
      newIdSet.delete(id)
      const newMessageById = new Map(state._messageById)
      newMessageById.delete(id)
      return {
        messages,
        _messageIdSet: newIdSet,
        _messageById: newMessageById,
        _messagesByConversationId: removeMessageFromConversationIndex(
          state._messagesByConversationId,
          existingMessage,
        ),
      }
    })
  },

  removeMessages: (ids) => {
    const removedIds = new Set(ids)
    if (removedIds.size === 0) return
    set((state) => {
      const affectedConversationIds = new Set(
        state.messages
          .filter((message) => removedIds.has(message.id))
          .map((message) => message.conversationId),
      )
      const messages = state.messages.filter((message) => !removedIds.has(message.id))
      const remainingConversationIds = new Set(messages.map((message) => message.conversationId))
      const conversations = state.conversations.map((conversation) => (
        affectedConversationIds.has(conversation.id)
        && !remainingConversationIds.has(conversation.id)
          ? { ...conversation, lastMessage: undefined }
          : conversation
      ))
      return { messages, conversations, ...buildMessageIndexes(messages) }
    })
  },

  addReaction: (messageId, reaction) => {
    set((state) => {
      const messageIndex = state.messages.findIndex((msg) => msg.id === messageId)
      if (messageIndex === -1) return state

      const message = state.messages[messageIndex]
      const existing = message.reactions || []
      const alreadyReacted = existing.some(
        (r) => r.emoji === reaction.emoji && r.senderId === reaction.senderId
      )
      if (alreadyReacted) return state

      const messages = state.messages.slice()
      const updatedMessage = { ...message, reactions: [...existing, reaction] }
      messages[messageIndex] = updatedMessage
      const newMessageById = new Map(state._messageById)
      newMessageById.set(messageId, updatedMessage)
      return {
        messages,
        _messageById: newMessageById,
        _messagesByConversationId: updateMessageInConversationIndex(
          state._messagesByConversationId,
          message,
          updatedMessage,
        ),
      }
    })
  },

  removeReaction: (messageId, emoji, senderId) => {
    set((state) => {
      const messageIndex = state.messages.findIndex((msg) => msg.id === messageId)
      if (messageIndex === -1) return state

      const message = state.messages[messageIndex]
      const existing = message.reactions || []
      const reactions = existing.filter(
        (r) => !(r.emoji === emoji && r.senderId === senderId)
      )
      if (reactions.length === existing.length) return state

      const messages = state.messages.slice()
      const updatedMessage = { ...message, reactions }
      messages[messageIndex] = updatedMessage
      const newMessageById = new Map(state._messageById)
      newMessageById.set(messageId, updatedMessage)
      return {
        messages,
        _messageById: newMessageById,
        _messagesByConversationId: updateMessageInConversationIndex(
          state._messagesByConversationId,
          message,
          updatedMessage,
        ),
      }
    })
  },

  setLoadingMessages: (loading) => set({ isLoadingMessages: loading }),
  setSyncingMessages: (syncing) => set({ isSyncingMessages: syncing }),

  archiveConversation: (id) => {
    set((state) => {
      if (state.archivedConversationIds.includes(id)) return state
      const archivedConversationIds = [...state.archivedConversationIds, id]
      persistSwipePreference(STORAGE_KEYS.ARCHIVED_CONVERSATIONS, archivedConversationIds, state.storageScope)
      return { archivedConversationIds }
    })
  },

  unarchiveConversation: (id) => {
    set((state) => {
      const archivedConversationIds = state.archivedConversationIds.filter((i) => i !== id)
      persistSwipePreference(STORAGE_KEYS.ARCHIVED_CONVERSATIONS, archivedConversationIds, state.storageScope)
      return { archivedConversationIds }
    })
  },

  togglePinConversation: (id) => {
    set((state) => {
      const isPinned = state.pinnedConversationIds.includes(id)
      const pinnedConversationIds = isPinned
        ? state.pinnedConversationIds.filter((i) => i !== id)
        : [...state.pinnedConversationIds, id]
      persistSwipePreference(STORAGE_KEYS.PINNED_CONVERSATIONS, pinnedConversationIds, state.storageScope)
      return { pinnedConversationIds }
    })
  },

  toggleManuallyUnread: (id) => {
    set((state) => {
      const isMarked = state.manuallyUnreadConversationIds.includes(id)
      const manuallyUnreadConversationIds = isMarked
        ? state.manuallyUnreadConversationIds.filter((i) => i !== id)
        : [...state.manuallyUnreadConversationIds, id]
      persistSwipePreference(STORAGE_KEYS.MANUALLY_UNREAD_CONVERSATIONS, manuallyUnreadConversationIds, state.storageScope)
      return { manuallyUnreadConversationIds }
    })
  },

  toggleMuteConversation: (id) => {
    set((state) => {
      const isMuted = state.mutedConversationIds.includes(id)
      const mutedConversationIds = isMuted
        ? state.mutedConversationIds.filter((i) => i !== id)
        : [...state.mutedConversationIds, id]
      persistSwipePreference(STORAGE_KEYS.MUTED_CONVERSATIONS, mutedConversationIds, state.storageScope)
      syncMutedToServer(mutedConversationIds)
      return { mutedConversationIds }
    })
  },

  clearConversationMessages: (conversationId) => {
    set((state) => {
      const messages = state.messages.filter((m) => m.conversationId !== conversationId)
      const conversations = state.conversations.map((c) =>
        c.id === conversationId
          ? { ...c, lastMessage: undefined, unreadCount: 0 }
          : c
      )
      const totalUnreadCount = calculateTotalUnreadCount(conversations, state.storageScope)
      return {
        messages,
        ...buildMessageIndexes(messages),
        conversations,
        totalUnreadCount,
        warmDirectConversationIds: state.warmDirectConversationIds.filter(
          (id) => id !== conversationId,
        ),
      }
    })
  },

  loadSwipePreferences: async () => {
    try {
      const { storageScope, allowLegacyPreferenceMigration } = get()
      const preferences = await readScopedSwipePreferences(
        storageScope,
        allowLegacyPreferenceMigration,
      )
      set({
        archivedConversationIds: preferences[STORAGE_KEYS.ARCHIVED_CONVERSATIONS],
        pinnedConversationIds: preferences[STORAGE_KEYS.PINNED_CONVERSATIONS],
        manuallyUnreadConversationIds: preferences[STORAGE_KEYS.MANUALLY_UNREAD_CONVERSATIONS],
        mutedConversationIds: preferences[STORAGE_KEYS.MUTED_CONVERSATIONS],
      })
    } catch (e) {
      console.warn('Failed to load swipe preferences:', e)
    }
  },

  setContacts: (contacts) => {
    const storageScope = get().storageScope
    const currentContacts = get().contacts
    const scopedContacts = contacts.map((contact) => {
      const localWalletAddress = getContactLocalWallet(contact, storageScope) || contact.localWalletAddress
      const existing = currentContacts.find((candidate) => (
        candidate.identityId === contact.identityId
        && getContactLocalWallet(candidate, storageScope) === localWalletAddress
      ))
      return slimContactForUi({
        ...contact,
        ...(existing?.remoteAccountState === 'deleted'
          ? {
              remoteAccountState: 'deleted' as const,
              remoteAccountStateUpdatedAt: existing.remoteAccountStateUpdatedAt,
            }
          : {}),
        localWalletAddress,
      })
    })
    set({
      contacts: scopedContacts,
      ...buildContactIndexes(scopedContacts, storageScope),
    })
  },

  addContact: (contact) => {
    set((state) => {
      const localWalletAddress = getContactLocalWallet(contact, state.storageScope)
      const nextContact = slimContactForUi({
        ...contact,
        localWalletAddress: localWalletAddress || contact.localWalletAddress,
      })
      const exists = state.contacts.some(
        (c) => c.identityId === contact.identityId
          && getContactLocalWallet(c, state.storageScope) === localWalletAddress
      )
      if (exists) {
        const contacts = state.contacts.map((c) =>
          c.identityId === contact.identityId
            && getContactLocalWallet(c, state.storageScope) === localWalletAddress
            ? nextContact
            : c
        )
        return {
          contacts,
          ...buildContactIndexes(contacts, state.storageScope),
        }
      }

      // Replace stale identity contacts after reinstall.
      if (contact.walletAddress) {
        const staleIdx = state.contacts.findIndex(
          c => normalizeAccountStorageScope(c.walletAddress) === normalizeAccountStorageScope(contact.walletAddress)
            && c.identityId !== contact.identityId
            && getContactLocalWallet(c, state.storageScope) === localWalletAddress
        )
        if (staleIdx !== -1) {
          const updated = [...state.contacts]
          const staleContact = updated[staleIdx]
          updated[staleIdx] = {
            ...nextContact,
            ...(staleContact.remoteAccountState === 'deleted'
              ? {
                  remoteAccountState: 'deleted' as const,
                  remoteAccountStateUpdatedAt: staleContact.remoteAccountStateUpdatedAt,
                }
              : {}),
          }
          return { contacts: updated, ...buildContactIndexes(updated, state.storageScope) }
        }
      }

      const contacts = [...state.contacts, nextContact]
      return {
        contacts,
        ...buildContactIndexes(contacts, state.storageScope),
      }
    })
  },

  updateContact: (identityId, updates) => {
    set((state) => {
      const contacts = state.contacts.map((contact) =>
        contact.identityId === identityId && contactMatchesActiveScope(contact, state.storageScope)
          ? slimContactForUi({ ...contact, ...updates })
          : contact
      )
      return { contacts, ...buildContactIndexes(contacts, state.storageScope) }
    })
  },

  removeContact: (identityId) => {
    set((state) => {
      const contacts = state.contacts.filter(
        (contact) => contact.identityId !== identityId || !contactMatchesActiveScope(contact, state.storageScope)
      )
      return { contacts, ...buildContactIndexes(contacts, state.storageScope) }
    })
  },

  batchUpdateContacts: (updates) => {
    set((state) => {
      const updateMap = new Map(updates.map(u => [u.identityId, u.changes]))
      const contacts = state.contacts.map((contact) => {
        const changes = updateMap.get(contact.identityId)
        return changes && contactMatchesActiveScope(contact, state.storageScope)
          ? slimContactForUi({ ...contact, ...changes })
          : contact
      })
      return {
        contacts,
        ...buildContactIndexes(contacts, state.storageScope),
      }
    })
  },

  addSecurityAlert: (alert) => {
    const newAlert: SecurityAlert = {
      ...alert,
      id: generateId(),
      timestamp: Date.now(),
    }
    set((state) => ({
      securityAlerts: [...state.securityAlerts, newAlert],
    }))
  },

  setTags: (tags) => set({ tags }),

  reset: () => {
    set({
      ...initialState,
      _messageIdSet: new Set(),
      _messageById: new Map(),
      _messagesByConversationId: new Map(),
      _contactsByIdentityId: new Map(),
      _contactsByWalletAddress: new Map(),
      _lastContactRefreshAt: 0,
    })
  },
}))
