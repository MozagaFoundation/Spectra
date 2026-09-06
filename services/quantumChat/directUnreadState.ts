/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import type { Message as StoredMessage } from '@spectra/core-crypto'
import { localChatStorage } from '@spectra/core-crypto/storage/local'
import {
  isSameAccountStorageScope,
  normalizeAccountStorageScope,
} from '@/lib/accountScope'
import { hasDisappearingMessageExpired } from '@/lib/disappearingMessages'
import { useChatStore } from '@/store/chatStore'
import { useWalletStore } from '@/store/walletStore'
import { isControlEnvelope, parseDirectEnvelope } from './envelopes'
import { classifyDirectMessageKind } from './messageKinds'

type DurableDirectMessage = StoredMessage & {
  deleted?: boolean
  localContentUnavailable?: boolean
  signatureVerified?: boolean
}

export type DirectUnreadReconcileOptions = {
  conversationId: string
  localIdentityId?: string | null
  localWalletAddress?: string | null
}

export type DirectUnreadReconcileResult = {
  applied: boolean
  unreadCount: number
}

export const DIRECT_UNREAD_PROJECTION_VERSION = 1
const DIRECT_UNREAD_RECOMPUTE_MESSAGE_LIMIT = 400

type ReconciliationRun = {
  latestOptions: DirectUnreadReconcileOptions
  rerunRequested: boolean
  promise: Promise<DirectUnreadReconcileResult>
}

const mutationQueues = new Map<string, Promise<void>>()
const reconciliationRuns = new Map<string, ReconciliationRun>()

function getMessageSenderId(message: DurableDirectMessage): string | undefined {
  return message.senderIdentityId || message.senderId
}

function mergeDuplicateMessage(
  current: DurableDirectMessage,
  incoming: DurableDirectMessage,
): DurableDirectMessage {
  return {
    ...current,
    ...incoming,
    content: typeof incoming.content === 'string' ? incoming.content : current.content,
    status: current.status === 'read' || incoming.status === 'read' ? 'read' : incoming.status,
    signatureVerified: current.signatureVerified === true || incoming.signatureVerified === true,
    deleted: current.deleted === true || incoming.deleted === true,
  }
}

function getCanonicalMessages(messages: StoredMessage[]): DurableDirectMessage[] {
  const byId = new Map<string, DurableDirectMessage>()
  for (const rawMessage of messages) {
    if (!rawMessage?.id) continue
    const message = rawMessage as DurableDirectMessage
    const current = byId.get(message.id)
    byId.set(message.id, current ? mergeDuplicateMessage(current, message) : message)
  }
  return [...byId.values()]
}

function getAuthorizedDeletionTargets(messages: DurableDirectMessage[]): Set<string> {
  const byId = new Map(messages.map((message) => [message.id, message]))
  const deletedIds = new Set<string>()

  for (const message of messages) {
    if (message.signatureVerified !== true || typeof message.content !== 'string') continue
    const envelope = parseDirectEnvelope(message.content)
    if (envelope.type !== 'deletion') continue

    const target = byId.get(envelope.deletionTarget)
    if (target && getMessageSenderId(target) === getMessageSenderId(message)) {
      deletedIds.add(target.id)
    }
  }

  return deletedIds
}

export function deriveDirectUnreadCount(
  rawMessages: StoredMessage[],
  localIdentityId?: string | null,
  now: number = Date.now(),
): number {
  if (!localIdentityId) return 0

  const messages = getCanonicalMessages(rawMessages)
  const deletedIds = getAuthorizedDeletionTargets(messages)

  return messages.filter((message) => {
    const senderId = getMessageSenderId(message)
    if (
      message.signatureVerified !== true
      || !senderId
      || senderId === localIdentityId
      || message.recipientIdentityId !== localIdentityId
      || message.status === 'read'
      || message.deleted === true
      || deletedIds.has(message.id)
      || hasDisappearingMessageExpired(message.disappearing, now)
    ) {
      return false
    }

    if (message.messageKind === 'hidden_control' || message.messageKind === 'call_invitation') {
      return false
    }
    if (message.messageKind === 'view_once') {
      return true
    }
    if (message.localContentUnavailable || typeof message.content !== 'string') {
      return false
    }
    if (classifyDirectMessageKind(message.content) === 'call_invitation') {
      return false
    }

    return !isControlEnvelope(parseDirectEnvelope(message.content))
  }).length
}

async function runSerializedMutation<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = mutationQueues.get(key) ?? Promise.resolve()
  const run = previous.catch(() => undefined).then(operation)
  const tail = run.then(() => undefined, () => undefined)
  mutationQueues.set(key, tail)

  try {
    return await run
  } finally {
    if (mutationQueues.get(key) === tail) {
      mutationQueues.delete(key)
    }
  }
}

async function waitForQueuedMutations(key: string): Promise<void> {
  while (true) {
    const pending = mutationQueues.get(key)
    if (!pending) return
    await pending
    if (mutationQueues.get(key) === pending) return
  }
}

function isWalletContextCurrent(localWalletAddress: string): boolean {
  return isSameAccountStorageScope(
    useWalletStore.getState().wallet?.address,
    localWalletAddress,
  )
}

function getReconciliationQueueKey(
  localWalletAddress: string,
  conversationId: string,
): string {
  return `${normalizeAccountStorageScope(localWalletAddress) ?? localWalletAddress}:${conversationId}`
}

function projectUnreadCountToStore(options: {
  conversationId: string
  localIdentityId: string
  localWalletAddress: string
  unreadCount: number
}): void {
  const store = useChatStore.getState()
  const projectedConversation = store.conversations.find((candidate) =>
    candidate.id === options.conversationId
    && candidate.localIdentityId === options.localIdentityId
    && isSameAccountStorageScope(candidate.localWalletAddress, options.localWalletAddress)
  )
  if (projectedConversation?.unreadCount !== options.unreadCount) {
    store.updateConversation(options.conversationId, { unreadCount: options.unreadCount })
  }
}

async function reconcileDirectUnreadStateInternal(
  options: DirectUnreadReconcileOptions,
  forceRecompute: boolean = false,
): Promise<DirectUnreadReconcileResult> {
  const { conversationId, localIdentityId, localWalletAddress } = options
  if (!conversationId || !localIdentityId || !localWalletAddress) {
    return { applied: false, unreadCount: 0 }
  }

  if (!isWalletContextCurrent(localWalletAddress)) {
    return { applied: false, unreadCount: 0 }
  }

  const conversation = await localChatStorage.getConversation(conversationId)
  if (
    !conversation
    || conversation.localIdentityId !== localIdentityId
    || !isWalletContextCurrent(localWalletAddress)
  ) {
    return { applied: false, unreadCount: 0 }
  }

  if (
    !forceRecompute
    && conversation.unreadProjectionVersion === DIRECT_UNREAD_PROJECTION_VERSION
    && conversation.unreadProjectionDirty === false
  ) {
    const unreadCount = Math.max(0, Math.trunc(conversation.unreadCount || 0))
    projectUnreadCountToStore({
      conversationId,
      localIdentityId,
      localWalletAddress,
      unreadCount,
    })
    return { applied: true, unreadCount }
  }

  const messages = await localChatStorage.getMessages(conversationId, {
    limit: DIRECT_UNREAD_RECOMPUTE_MESSAGE_LIMIT,
  })
  if (!isWalletContextCurrent(localWalletAddress)) {
    return { applied: false, unreadCount: 0 }
  }

  const unreadCount = deriveDirectUnreadCount(messages, localIdentityId)
  await localChatStorage.updateConversation(conversationId, {
    unreadCount,
    unreadProjectionVersion: DIRECT_UNREAD_PROJECTION_VERSION,
    unreadProjectionDirty: false,
  })

  if (!isWalletContextCurrent(localWalletAddress)) {
    return { applied: false, unreadCount }
  }

  projectUnreadCountToStore({
    conversationId,
    localIdentityId,
    localWalletAddress,
    unreadCount,
  })

  return { applied: true, unreadCount }
}

export async function reconcileDirectUnreadState(
  options: DirectUnreadReconcileOptions,
): Promise<DirectUnreadReconcileResult> {
  const { conversationId, localWalletAddress } = options
  if (!conversationId || !localWalletAddress) {
    return { applied: false, unreadCount: 0 }
  }

  const key = getReconciliationQueueKey(localWalletAddress, conversationId)
  const activeRun = reconciliationRuns.get(key)
  if (activeRun) {
    activeRun.latestOptions = options
    activeRun.rerunRequested = true
    return activeRun.promise
  }

  const run: ReconciliationRun = {
    latestOptions: options,
    rerunRequested: false,
    promise: Promise.resolve({ applied: false, unreadCount: 0 }),
  }
  reconciliationRuns.set(key, run)
  run.promise = (async () => {
    try {
      let result: DirectUnreadReconcileResult = { applied: false, unreadCount: 0 }
      let forceRecompute = false
      while (true) {
        run.rerunRequested = false
        await waitForQueuedMutations(key)
        result = await reconcileDirectUnreadStateInternal(run.latestOptions, forceRecompute)
        if (!run.rerunRequested) {
          if (reconciliationRuns.get(key) === run) {
            reconciliationRuns.delete(key)
          }
          return result
        }
        forceRecompute = true
      }
    } catch (error) {
      if (reconciliationRuns.get(key) === run) {
        reconciliationRuns.delete(key)
      }
      throw error
    }
  })()
  return run.promise
}

export async function markDirectUnreadProjectionDirty(
  options: DirectUnreadReconcileOptions,
): Promise<boolean> {
  const { conversationId, localIdentityId, localWalletAddress } = options
  if (!conversationId || !localIdentityId || !localWalletAddress) {
    return false
  }

  const key = getReconciliationQueueKey(localWalletAddress, conversationId)
  return runSerializedMutation(key, async () => {
    if (!isWalletContextCurrent(localWalletAddress)) return false
    const conversation = await localChatStorage.getConversation(conversationId)
    if (conversation?.localIdentityId !== localIdentityId) return false
    await localChatStorage.updateConversation(conversationId, {
      unreadProjectionDirty: true,
    })
    return true
  })
}

export async function markDirectMessageReadAndReconcile(
  options: DirectUnreadReconcileOptions & {
    messageId: string
    relayReadReceiptEligible?: boolean
  },
): Promise<DirectUnreadReconcileResult> {
  const { conversationId, localIdentityId, localWalletAddress, messageId } = options
  if (!conversationId || !localIdentityId || !localWalletAddress || !messageId) {
    return { applied: false, unreadCount: 0 }
  }

  await runSerializedMutation(
    getReconciliationQueueKey(localWalletAddress, conversationId),
    async () => {
      if (!isWalletContextCurrent(localWalletAddress)) {
        return
      }
      const conversation = await localChatStorage.getConversation(conversationId)
      if (conversation?.localIdentityId !== localIdentityId) return
      await localChatStorage.updateConversation(conversationId, {
        unreadProjectionDirty: true,
      })
      if (options.relayReadReceiptEligible === undefined) {
        await localChatStorage.updateMessageStatus(messageId, 'read')
      } else {
        await localChatStorage.updateMessageStatus(messageId, 'read', {
          relayReadReceiptEligible: options.relayReadReceiptEligible,
        })
      }
    },
  )
  return reconcileDirectUnreadState(options)
}

export async function deleteDirectMessagesAndReconcile(
  options: DirectUnreadReconcileOptions & { messageIds: string[] },
): Promise<DirectUnreadReconcileResult> {
  const { conversationId, localIdentityId, localWalletAddress } = options
  const messageIds = [...new Set(options.messageIds.filter(Boolean))]
  if (!conversationId || !localIdentityId || !localWalletAddress || messageIds.length === 0) {
    return { applied: false, unreadCount: 0 }
  }

  await runSerializedMutation(
    getReconciliationQueueKey(localWalletAddress, conversationId),
    async () => {
      if (!isWalletContextCurrent(localWalletAddress)) return
      const conversation = await localChatStorage.getConversation(conversationId)
      if (conversation?.localIdentityId !== localIdentityId) return
      await localChatStorage.updateConversation(conversationId, {
        unreadProjectionDirty: true,
      })
      await Promise.all(messageIds.flatMap((messageId) => [
        localChatStorage.deleteMessage(messageId),
        localChatStorage.deleteDecryptedMessage(messageId),
      ]))
    },
  )
  return reconcileDirectUnreadState(options)
}

export async function clearDirectMessagesAndReconcile(
  options: DirectUnreadReconcileOptions & { additionalMessageIds?: string[] },
): Promise<DirectUnreadReconcileResult & { deletedMessageIds: string[] }> {
  const { conversationId, localIdentityId, localWalletAddress } = options
  if (!conversationId || !localIdentityId || !localWalletAddress) {
    return { applied: false, unreadCount: 0, deletedMessageIds: [] }
  }

  let deletedMessageIds: string[] = []
  await runSerializedMutation(
    getReconciliationQueueKey(localWalletAddress, conversationId),
    async () => {
      if (!isWalletContextCurrent(localWalletAddress)) return
      const conversation = await localChatStorage.getConversation(conversationId)
      if (conversation?.localIdentityId !== localIdentityId) return

      const storedMessages = await localChatStorage.getMessages(conversationId)
      deletedMessageIds = [...new Set([
        ...storedMessages.map((message) => message.id).filter(Boolean),
        ...(options.additionalMessageIds ?? []).filter(Boolean),
      ])]
      await localChatStorage.updateConversation(conversationId, {
        unreadProjectionDirty: true,
      })
      await Promise.all(deletedMessageIds.flatMap((messageId) => [
        localChatStorage.deleteMessage(messageId),
        localChatStorage.deleteDecryptedMessage(messageId),
      ]))
      if ((await localChatStorage.getMessages(conversationId)).length === 0) {
        await localChatStorage.updateConversation(conversationId, {
          lastMessage: undefined,
          unreadProjectionDirty: true,
        })
      }
    },
  )
  return {
    ...await reconcileDirectUnreadState(options),
    deletedMessageIds,
  }
}

export async function migrateLegacyDirectMessageBucket(options: {
  conversationId: string
  remoteIdentityId?: string | null
  localIdentityId?: string | null
  localWalletAddress?: string | null
}): Promise<boolean> {
  const {
    conversationId,
    remoteIdentityId,
    localIdentityId,
    localWalletAddress,
  } = options
  if (
    !conversationId
    || !remoteIdentityId
    || conversationId === remoteIdentityId
    || !localIdentityId
    || !localWalletAddress
  ) {
    return false
  }

  const key = getReconciliationQueueKey(localWalletAddress, conversationId)
  return runSerializedMutation(key, async () => {
    if (!isWalletContextCurrent(localWalletAddress)) return false
    const legacyMessages = await localChatStorage.getMessages(remoteIdentityId)
    if (legacyMessages.length === 0) return false

    const targetConversation = await localChatStorage.getConversation(conversationId)
    if (targetConversation?.localIdentityId !== localIdentityId) return false

    await localChatStorage.rekeyConversation(remoteIdentityId, conversationId)
    await localChatStorage.storeConversation({
      ...targetConversation,
      id: conversationId,
      unreadProjectionDirty: true,
    })
    return true
  })
}

export async function reconcileAllDirectUnreadStates(options: {
  localIdentityId?: string | null
  localWalletAddress?: string | null
}): Promise<void> {
  const { localIdentityId, localWalletAddress } = options
  if (!localIdentityId || !localWalletAddress || !isWalletContextCurrent(localWalletAddress)) {
    return
  }

  const conversations = await localChatStorage.getConversations(localIdentityId)
  const concurrency = 4
  for (let index = 0; index < conversations.length; index += concurrency) {
    if (!isWalletContextCurrent(localWalletAddress)) return
    await Promise.all(conversations.slice(index, index + concurrency).map((conversation) =>
      reconcileDirectUnreadState({
        conversationId: conversation.id,
        localIdentityId,
        localWalletAddress,
      })
    ))
  }
}
