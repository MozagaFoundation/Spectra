/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * High-level chat API for encrypted conversations.
 *
 * Public calls accept wallet addresses or identity IDs, then resolve once before
 * calling QuantumChat. Structured message metadata is encrypted in content
 * envelopes alongside plain text.
 */

import {
  initializeQuantumChat,
  cleanupQuantumChat,
  waitForQuantumChatQuiescence,
  realignQuantumChatForActiveWallet,
  isQuantumChatInitialized,
  reconcileQuantumChat,
  getOrCreateConversation as getQuantumConversation,
  tryOpenLocalConversation as getLocalQuantumConversation,
  setActiveConversation as setQuantumActiveConversation,
  sendMessage as sendQuantumMessage,
  sendMediaMessage as sendQuantumMediaMessage,
  retryStoredFailedMessage as retryStoredQuantumMessage,
  loadCachedMessages as loadCachedQuantumMessages,
  DIRECT_CHAT_CACHE_PAGE_SIZE,
  loadCachedConversations as loadCachedQuantumConversations,
  hydrateLocalContacts as hydrateCachedQuantumContacts,
  addContactByAddress,
  assertContactIdentityTrusted,
  verifyContactBundle,
  getMyPublicKeyBundle,
  getSafetyNumber,
  getIdentity,
  getQuantumChatClient,
  getQueuedDeliveryState,
  getFailedDeliveryState,
  markLocalConversationAsRead as markQuantumLocalConversationAsRead,
  armDirectConversationMessagesOnLocalRead,
  consumeDirectViewOnceMessage as consumeQuantumDirectViewOnceMessage,
  revealDirectViewOnceMessage as revealQuantumDirectViewOnceMessage,
  setDirectConversationDisappearingTimer as setQuantumDirectConversationDisappearingTimer,
  prewarmDirectChatTransportAccess,
  setDirectChatInteractionActive as setQuantumDirectChatInteractionActive,
  ContactIdentityChangeError,
  type ContactIdentityReplacement,
  type OptimisticSendContext,
} from '../quantumChat'
import { InteractionManager } from 'react-native'
import { abortActiveAccountRuntime } from '@/services/shared/accountRuntimeLifecycle'
import { upsertAddressBookEntry, removeAddressBookEntry } from '../../lib/addressBook/addressBookState'
import { useChatStore } from '@/store/chatStore'
import { useWalletStore } from '@/store/walletStore'
import {
  deleteConversationMessages,
  deleteMessage as deleteBackendMessage,
} from '../backend/client'
import { syncGlobalBadge, dismissNotificationsForConversation } from '../notifications/pushService'
import type {
  ChatMessage,
  ChatContact,
  ChatSendOptions,
  Conversation,
  DisappearingMessageTimer,
  MediaAttachment,
  MessageSendProgress,
  OneTimeRevealPayload,
  ReplyReference,
} from '@/lib/types'
import {
  buildDirectDisappearingTimer,
  createMessageDisappearingState,
  isDisappearingTimerEnabled,
  normalizeDisappearingTimer,
} from '@/lib/disappearingMessages'
import { SPECTRE_DIRECT_DISAPPEARING_MS } from '@/lib/constants'
import { useSpectreStore } from '@/store/spectreStore'
import {
  createLockedOneTimeMessage,
  getViewOncePreviewLabel,
} from '@/lib/viewOnce'
import { buildDirectMessagePreview } from '../quantumChat/messagePresentation'
import { classifyDirectMessageKind } from '../quantumChat/messageKinds'
import {
  createDirectEnvelope,
  type DirectMessageContent,
} from '../shared/envelopeTypes'
import { recordChatLatency } from './chatLatency'
import { recordChatDiagnostic } from './chatDiagnostics'
import {
  matchesAccountStorageScope,
  matchesStrictAccountStorageScope,
  normalizeAccountStorageScope,
} from '@/lib/accountScope'
import { MAX_WARM_DIRECT_CONVERSATIONS } from '@/lib/chatMemory'
import { isConversationListVisible } from '@/lib/conversationVisibility'
import { getDirectConversationIds } from '@/lib/chatSharedContent'
import { useTorStore } from '../tor/torStore'
import { updateActiveAddressBookSnapshot } from '../storage/addressBookStorage'
import {
  ATTACHMENT_PIPELINE_EVENT_NAME,
  ATTACHMENT_PIPELINE_FAILURE_EVENT_NAME,
  buildAttachmentPipelineFailureFields,
  buildAttachmentPipelineFields,
  createAttachmentSendTrace,
  getAttachmentPipelineFailureDetails,
  type AttachmentSendTrace,
} from '@spectra/core-crypto/client/attachmentDiagnostics'
import {
  clearDirectConversationLocally,
  deleteDirectConversationLocally,
} from '../quantumChat/directConversationCleanup'
import {
  deleteDirectMessagesAndReconcile,
  reconcileDirectUnreadState,
} from '../quantumChat/directUnreadState'
import { canDeleteDirectMessageForEveryone } from '../quantumChat/directMessageAuthorization'
import { isRemoteChatServiceAvailable } from '../quantumChat/remoteChatAvailability'
import { localChatStorage } from '@spectra/core-crypto/storage/local'
import { evaluateChatSendPolicy } from './sendAdmission'

const CHAT_SERVICE_SEND_LOG_PREFIX = '[ChatServiceSend]'
const LOCAL_ORDER_PERSIST_CONCURRENCY = 8

export { DIRECT_CHAT_CACHE_PAGE_SIZE }
let optimisticMessageIdCounter = 0
let lastLocalOrderTimestamp = 0
let directChatPrewarmGeneration = 0
let directChatPrewarmAbortController: AbortController | null = null
let directChatInteractionActive = false

type ContactVerificationWarmup = {
  controller: AbortController
  promise: Promise<string>
  consumers: Set<symbol>
  sendWaiters: number
  settled: boolean
}

const contactVerificationWarmups = new Map<string, ContactVerificationWarmup>()

function getCurrentSpectrePolicyState() {
  const spectreState = useSpectreStore.getState()
  const wallet = useWalletStore.getState().wallet
  return {
    enabled: spectreState.enabled,
    accountMode: spectreState.spectreAccountMode,
    walletIsSpectre: wallet?.spectreMode === true,
  }
}

function yieldToChatUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

type ChatAccountContext = {
  localIdentityId?: string
  localWalletAddress?: string
  localDisplayName?: string
}

export type ConversationActivationReason =
  | 'invalid_address'
  | 'chat_not_initialized'
  | 'verification_failed'
  | 'conversation_unavailable'
  | 'repair_failed'

export type ConversationActivationResult = {
  conversationId: string | null
  identityId: string | null
  error: Error | null
  reason?: ConversationActivationReason
  repaired?: boolean
  identityReplacement?: ContactIdentityReplacement
}

export type DirectSendReadiness = {
  ready: boolean
  runtimeReady: boolean
  identityTrusted: boolean
  transportPrewarmed: boolean
  resolvedIdentityId: string | null
  error: Error | null
}

type ConversationActivationOptions = {
  repairOnFailure?: boolean
  signal?: AbortSignal
  onBackgroundVerificationFailure?: (result: ConversationActivationResult) => void
}

function getActiveChatAccountContext(): ChatAccountContext {
  const wallet = useWalletStore.getState().wallet
  const identity = getIdentity()

  return {
    localIdentityId: identity?.id,
    localWalletAddress: wallet?.address,
    localDisplayName: wallet?.displayName,
  }
}

function getContactVerificationWarmupKey(identityId: string): string {
  const context = getActiveChatAccountContext()
  return [
    normalizeAccountStorageScope(context.localWalletAddress) ?? 'no-wallet',
    context.localIdentityId ?? 'no-identity',
    identityId,
  ].join(':')
}

function getContactVerificationWarmup(identityId: string): ContactVerificationWarmup | null {
  return contactVerificationWarmups.get(getContactVerificationWarmupKey(identityId)) ?? null
}

function cancelUnusedContactVerification(warmup: ContactVerificationWarmup): void {
  if (!warmup.settled && warmup.consumers.size === 0 && warmup.sendWaiters === 0) {
    warmup.controller.abort()
  }
}

function cancelContactVerificationWarmups(): void {
  for (const warmup of contactVerificationWarmups.values()) {
    warmup.controller.abort()
  }
  contactVerificationWarmups.clear()
}

function matchesLocalAccount(
  conversation: Pick<Conversation, 'localWalletAddress' | 'localIdentityId'>,
  context: ChatAccountContext,
): boolean {
  if (context.localWalletAddress) {
    return matchesStrictAccountStorageScope(conversation.localWalletAddress, context.localWalletAddress)
  }

  if (context.localIdentityId) {
    return !conversation.localIdentityId || conversation.localIdentityId === context.localIdentityId
  }

  return true
}

function matchesLocalContact(
  contact: Pick<ChatContact, 'localWalletAddress' | 'localIdentityId'>,
  context: ChatAccountContext,
): boolean {
  if (context.localWalletAddress) {
    return matchesStrictAccountStorageScope(contact.localWalletAddress, context.localWalletAddress)
  }

  if (context.localIdentityId) {
    return !contact.localIdentityId || contact.localIdentityId === context.localIdentityId
  }

  return true
}

function isDirectConversationPrewarmable(
  conversation: Conversation,
  contacts: ChatContact[],
  walletScope: string,
): boolean {
  if (
    conversation.type === 'group'
    || !conversation.id
    || !conversation.remoteIdentityId
    || conversation.remoteIdentityId === 'undefined'
    || conversation.remoteIdentityId === 'null'
    || conversation.remoteAccountState === 'deleted'
    || !isConversationListVisible(conversation)
    || !matchesStrictAccountStorageScope(conversation.localWalletAddress, walletScope)
  ) {
    return false
  }

  return !contacts.some((contact) => (
    matchesStrictAccountStorageScope(contact.localWalletAddress, walletScope)
    && (
      contact.identityId === conversation.remoteIdentityId
      || (
        Boolean(conversation.remoteWalletAddress)
        && contact.walletAddress === conversation.remoteWalletAddress
      )
    )
    && (
      contact.identityChanged
      || contact.trustState === 'changed'
      || contact.remoteAccountState === 'deleted'
    )
  ))
}

function getDirectConversationPrewarmKey(
  conversation: Conversation,
  contacts: ChatContact[],
  walletScope: string,
): string {
  const contact = contacts.find((entry) => (
    matchesStrictAccountStorageScope(entry.localWalletAddress, walletScope)
    && (
      entry.identityId === conversation.remoteIdentityId
      || (
        Boolean(conversation.remoteWalletAddress)
        && entry.walletAddress === conversation.remoteWalletAddress
      )
    )
  ))
  return `${walletScope}:${contact?.walletAddress || conversation.remoteWalletAddress || conversation.remoteIdentityId}`
}

function getDirectConversationRecency(conversation: Conversation): number {
  return conversation.lastMessage?.timestamp || conversation.createdAt
}

function createLocalMessageId(timestamp: number = Date.now()): string {
  optimisticMessageIdCounter = (optimisticMessageIdCounter + 1) % Number.MAX_SAFE_INTEGER
  return `local:${timestamp}:${optimisticMessageIdCounter.toString(36)}`
}

function createLocalOrderTimestamp(baseTimestamp: number = Date.now()): number {
  const nextTimestamp = Math.max(baseTimestamp, lastLocalOrderTimestamp + 1)
  lastLocalOrderTimestamp = nextTimestamp
  return nextTimestamp
}

function getFiniteMessageOrderTimestamp(message: Pick<ChatMessage, 'localOrderTimestamp' | 'timestamp'>): number {
  const timestamp = message.localOrderTimestamp ?? message.timestamp
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

function summarizeChatServiceSendValue(value?: string | null): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  if (value.length <= 96) {
    return value
  }

  return `${value.slice(0, 40)}...${value.slice(-32)}`
}

function describeChatServiceAttachments(attachments?: MediaAttachment[]): Array<Record<string, unknown>> {
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
    uri: summarizeChatServiceSendValue(attachment.uri),
  }))
}

function logChatServiceSend(event: string, details?: Record<string, unknown>): void {
  if (!__DEV__) {
    return
  }

  if (details) {
    console.log(`${CHAT_SERVICE_SEND_LOG_PREFIX} ${event}`, details)
    return
  }

  console.log(`${CHAT_SERVICE_SEND_LOG_PREFIX} ${event}`)
}

export interface SendMessageDiagnostics {
  attachmentTrace?: AttachmentSendTrace | null
}

function getOneTimeMetadata(options?: ChatSendOptions): ChatMessage['oneTime'] | undefined {
  const kind = options?.oneTime?.kind
  return kind ? createLockedOneTimeMessage(kind) : undefined
}

function getOptimisticAttachments(
  attachments: MediaAttachment[] | undefined,
  options?: ChatSendOptions,
): MediaAttachment[] | undefined {
  const isViewOnce = Boolean(options?.oneTime)
  return attachments?.map((attachment) => ({
    ...attachment,
    isEncrypted: false,
    isViewOnce,
  }))
}

function buildOutgoingContent(
  content: string,
  replyTo?: ReplyReference | null,
  disappearingTimer?: DisappearingMessageTimer | null,
  options?: ChatSendOptions,
): DirectMessageContent {
  const oneTimeKind = options?.oneTime?.kind
  if (oneTimeKind) {
    return createDirectEnvelope('view_once', {
      kind: oneTimeKind,
      body: content,
      ...(replyTo ? { replyTo } : {}),
      ...(disappearingTimer ? { disappearing: disappearingTimer } : {}),
    })
  }

  if (replyTo || disappearingTimer) {
    return createDirectEnvelope('text', {
      text: content,
      ...(replyTo ? { replyTo } : {}),
      ...(disappearingTimer ? { disappearing: disappearingTimer } : {}),
    })
  }

  return content
}

// Identity resolution

export function resolveIdentityId(
  addressOrId: string,
  accountContext: ChatAccountContext = getActiveChatAccountContext(),
): string {
  const { contacts } = useChatStore.getState()
  const contact = contacts.find(
    (c) => matchesLocalContact(c, accountContext)
      && (c.identityId === addressOrId || c.walletAddress === addressOrId)
  )
  return contact?.identityId || addressOrId
}

function addConversationNotificationKey(
  keys: Set<string>,
  localWalletAddress: string | undefined,
  value: string | null | undefined,
): void {
  if (!value) return

  keys.add(value)
  if (localWalletAddress) {
    keys.add(`local:${localWalletAddress}:${value}`)
  }
}

// Initialization

let chatInitPromise: Promise<void> | null = null

export async function initializeChat(): Promise<void> {
  if (isQuantumChatInitialized()) {
    useChatStore.getState().setInitialized(true)
    useChatStore.getState().setInitializing(false)
    return
  }

  if (chatInitPromise) return chatInitPromise
  
  const { setInitializing, setInitialized } = useChatStore.getState()
  setInitializing(true)
  
  chatInitPromise = (async () => {
    try {
      const success = await initializeQuantumChat()
      setInitialized(success)
      if (success) {
        void import('./ephemeralDiscoveryCoordinator')
          .then((mod) => mod.restorePersistedOneTimeContactCard())
          .catch(() => undefined)
      }
    } catch (error) {
      console.error('Failed to initialize chat:', error)
      setInitialized(false)
    } finally {
      setInitializing(false)
      chatInitPromise = null
    }
  })()
  
  return chatInitPromise
}

export async function reconcileChat(): Promise<void> {
  if (!isQuantumChatInitialized()) {
    await initializeChat()
  }

  if (!isQuantumChatInitialized()) {
    throw new Error('Chat not initialized')
  }

  await reconcileQuantumChat({
    fullResync: true,
    restartRealtime: true,
    reason: 'manual_recovery',
  })
}

export async function refreshChatList(): Promise<void> {
  if (!isQuantumChatInitialized()) {
    await initializeChat()
  }

  if (!isQuantumChatInitialized()) {
    throw new Error('Chat not initialized')
  }

  await reconcileQuantumChat({
    fullResync: false,
    restartRealtime: false,
    reason: 'manual_recovery',
  })

}

export function setDirectChatInteractionActive(active: boolean): void {
  directChatInteractionActive = active
  if (active) {
    cancelDirectChatPrewarm()
  }
  setQuantumDirectChatInteractionActive(active)
}

function cancelDirectChatPrewarm(): void {
  directChatPrewarmGeneration += 1
  directChatPrewarmAbortController?.abort()
  directChatPrewarmAbortController = null
}

export async function prewarmRecentDirectMessages(
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  const walletAddress = useWalletStore.getState().wallet?.address
  const walletScope = normalizeAccountStorageScope(walletAddress)
  if (!walletScope || options.signal?.aborted || directChatInteractionActive) {
    return
  }

  cancelDirectChatPrewarm()
  const controller = new AbortController()
  directChatPrewarmAbortController = controller
  const abortFromCaller = () => controller.abort()
  options.signal?.addEventListener('abort', abortFromCaller, { once: true })
  const generation = ++directChatPrewarmGeneration
  const isCurrent = () => (
    !controller.signal.aborted
    && directChatPrewarmGeneration === generation
    && !directChatInteractionActive
    && normalizeAccountStorageScope(useWalletStore.getState().wallet?.address) === walletScope
  )
  const initialState = useChatStore.getState()
  const canonicalCandidates = new Map<string, Conversation>()
  for (const conversation of initialState.conversations) {
    if (!isDirectConversationPrewarmable(
      conversation,
      initialState.contacts,
      walletScope,
    )) {
      continue
    }
    const key = getDirectConversationPrewarmKey(
      conversation,
      initialState.contacts,
      walletScope,
    )
    const existing = canonicalCandidates.get(key)
    if (!existing || getDirectConversationRecency(conversation) > getDirectConversationRecency(existing)) {
      canonicalCandidates.set(key, conversation)
    }
  }
  const candidates = [...canonicalCandidates.values()]
    .sort((left, right) => (
      getDirectConversationRecency(right) - getDirectConversationRecency(left)
    ))
    .slice(0, MAX_WARM_DIRECT_CONVERSATIONS)

  try {
    let warmedConversationCount = 0
    for (const candidate of candidates) {
      if (!isCurrent()) {
        return
      }

      const messages = await loadCachedQuantumMessages(candidate.remoteIdentityId, {
        conversationId: candidate.id,
        limit: DIRECT_CHAT_CACHE_PAGE_SIZE,
        signal: controller.signal,
        resolveAttachments: false,
        scheduleDerivedWork: false,
      })
      if (!isCurrent()) {
        return
      }

      const currentState = useChatStore.getState()
      const currentConversation = currentState.conversations.find((conversation) => (
        conversation.id === candidate.id
        && conversation.remoteIdentityId === candidate.remoteIdentityId
      ))
      if (
        currentConversation
        && isDirectConversationPrewarmable(
          currentConversation,
          currentState.contacts,
          walletScope,
        )
        && messages.length > 0
      ) {
        currentState.warmDirectConversation(candidate.id)
        warmedConversationCount += 1
      } else if (currentConversation) {
        currentState.evictDirectConversationWindowsForPeer(candidate.remoteIdentityId)
      }

      await yieldToChatUi()
    }

    if (isCurrent()) {
      recordChatDiagnostic('performance', 'direct_chat_prewarm_completed', {
        warmedConversationCount,
        candidateCount: candidates.length,
      })
    }
  } finally {
    options.signal?.removeEventListener('abort', abortFromCaller)
    if (directChatPrewarmAbortController === controller) {
      directChatPrewarmAbortController = null
    }
  }
}

export function cleanupChat(): void {
  abortActiveAccountRuntime()
  chatInitPromise = null
  directChatInteractionActive = false
  cancelDirectChatPrewarm()
  useChatStore.getState().setInitialized(false)
  useChatStore.getState().setInitializing(false)
  useChatStore.getState().setSyncingMessages(false)
  cancelContactVerificationWarmups()
  cleanupQuantumChat()
}

export async function waitForChatQuiescence(): Promise<void> {
  await waitForQuantumChatQuiescence()
}

export async function realignChatForActiveWallet(): Promise<void> {
  chatInitPromise = null
  directChatInteractionActive = false
  cancelDirectChatPrewarm()
  useChatStore.getState().setSyncingMessages(false)
  cancelContactVerificationWarmups()
  const { setInitializing, setInitialized } = useChatStore.getState()
  setInitializing(true)

  try {
    const success = await realignQuantumChatForActiveWallet()
    setInitialized(success)
  } finally {
    setInitializing(false)
  }
}

// Conversations

export function getConversation(
  remoteAddress: string,
  accountContext: ChatAccountContext = getActiveChatAccountContext(),
): Conversation {
  const { conversations, contacts } = useChatStore.getState()
  const resolvedId = resolveIdentityId(remoteAddress, accountContext)

  const contact = contacts.find(
    c => matchesLocalContact(c, accountContext)
      && (c.identityId === resolvedId || c.walletAddress === remoteAddress)
  )
  const walletAddr = contact?.walletAddress

  let existing = conversations.find(
    (c) => matchesLocalAccount(c, accountContext)
      && (
        c.remoteIdentityId === resolvedId
        || (walletAddr && c.remoteWalletAddress === walletAddr)
      )
  )

  if (!existing && resolvedId !== remoteAddress) {
    existing = conversations.find(
      (c) => matchesLocalAccount(c, accountContext)
        && (
          c.remoteIdentityId === remoteAddress
          || c.remoteWalletAddress === remoteAddress
        )
    )
  }
  
  if (existing) {
    return existing
  }
  
  return {
    id: `pending_${resolvedId}`,
    localIdentityId: accountContext.localIdentityId,
    localWalletAddress: accountContext.localWalletAddress,
    localDisplayName: accountContext.localDisplayName,
    remoteIdentityId: resolvedId,
    remoteWalletAddress: walletAddr,
    createdAt: Date.now(),
    unreadCount: 0,
  }
}

function invalidConversationResult(reason: ConversationActivationReason, message: string): ConversationActivationResult {
  return {
    conversationId: null,
    identityId: null,
    error: new Error(message),
    reason,
  }
}

async function ensureChatRuntimeReady(): Promise<Error | null> {
  try {
    if (!isQuantumChatInitialized()) {
      await initializeChat()
    }

    return isQuantumChatInitialized()
      ? null
      : new Error('Chat not initialized')
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

async function resolveVerifiedIdentity(
  remoteAddress: string,
  signal?: AbortSignal,
): Promise<string> {
  const resolvedId = resolveIdentityId(remoteAddress)
  return withRemoteDirectoryDeadline(
    (requestSignal, beginCommit) => verifyContactBundle(resolvedId, {
      signal: requestSignal,
      onCommitStart: beginCommit,
    }),
    'Contact verification timed out',
    signal,
  )
}

async function resolveVerifiedIdentityForSend(remoteAddress: string): Promise<string> {
  const resolvedId = resolveIdentityId(remoteAddress)
  const warmup = getContactVerificationWarmup(resolvedId)
  if (warmup) {
    warmup.sendWaiters += 1
    try {
      const identityId = await warmup.promise
      assertContactIdentityTrusted(identityId)
      return identityId
    } finally {
      warmup.sendWaiters = Math.max(0, warmup.sendWaiters - 1)
      cancelUnusedContactVerification(warmup)
    }
  }

  return resolveVerifiedIdentity(remoteAddress)
}

export async function prepareDirectSendReadiness(
  remoteAddress: string,
): Promise<DirectSendReadiness> {
  if (!isQuantumChatInitialized()) {
    return {
      ready: false,
      runtimeReady: false,
      identityTrusted: false,
      transportPrewarmed: false,
      resolvedIdentityId: null,
      error: new Error('Chat not initialized'),
    }
  }

  const resolvedIdentityId = resolveIdentityId(remoteAddress)
  let transportPrewarmed = false
  const transportWarmup = isRemoteChatServiceAvailable()
    ? prewarmDirectChatTransportAccess()
      .then((ready) => {
        transportPrewarmed = ready
        return ready
      })
      .catch(() => false)
    : Promise.resolve(false)
  try {
    const [verifiedIdentityId] = await Promise.all([
      resolveVerifiedIdentityForSend(resolvedIdentityId),
      transportWarmup,
    ])
    assertContactIdentityTrusted(verifiedIdentityId)
    return {
      ready: true,
      runtimeReady: true,
      identityTrusted: true,
      transportPrewarmed,
      resolvedIdentityId: verifiedIdentityId,
      error: null,
    }
  } catch (error) {
    return {
      ready: false,
      runtimeReady: true,
      identityTrusted: false,
      transportPrewarmed,
      resolvedIdentityId,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

export function scheduleDirectSendReadiness(remoteAddress: string): void {
  if (!remoteAddress) return
  InteractionManager.runAfterInteractions(() => {
    void prepareDirectSendReadiness(remoteAddress).catch(() => undefined)
  })
}

const REMOTE_DIRECTORY_DEADLINE_MS = 15_000

async function withRemoteDirectoryDeadline<T>(
  operation: (
    signal: AbortSignal,
    beginCommit: () => void,
  ) => Promise<T>,
  timeoutMessage: string,
  callerSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null
  let commitStarted = false
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      if (commitStarted) return
      controller.abort()
      reject(new Error(timeoutMessage))
    }, REMOTE_DIRECTORY_DEADLINE_MS)
  })
  let rejectCallerCancellation!: (error: Error) => void
  const callerCancellation = new Promise<never>((_, reject) => {
    rejectCallerCancellation = reject
  })
  const abortFromCaller = () => {
    if (commitStarted) return
    controller.abort()
    const error = new Error('Chat activation cancelled')
    error.name = 'AbortError'
    rejectCallerCancellation(error)
  }
  if (callerSignal) {
    if (callerSignal.aborted) {
      abortFromCaller()
    } else {
      callerSignal.addEventListener('abort', abortFromCaller, { once: true })
    }
  }
  const beginCommit = () => {
    if (controller.signal.aborted) {
      const error = new Error('Chat activation cancelled')
      error.name = 'AbortError'
      throw error
    }
    commitStarted = true
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    callerSignal?.removeEventListener('abort', abortFromCaller)
  }
  try {
    return await Promise.race([
      operation(controller.signal, beginCommit),
      deadline,
      callerCancellation,
    ])
  } finally {
    if (timer) clearTimeout(timer)
    callerSignal?.removeEventListener('abort', abortFromCaller)
  }
}

async function repairDirectConversationActivation(
  remoteAddress: string,
  identityId: string,
  signal?: AbortSignal,
): Promise<{
  repaired: boolean
  identityId: string
  error: Error | null
  identityReplacement?: ContactIdentityReplacement
}> {
  const store = useChatStore.getState()
  const contact = store.contacts.find(
    (entry) => entry.identityId === identityId
      || entry.walletAddress === remoteAddress
      || entry.identityId === remoteAddress
  )
  const repairTarget = contact?.walletAddress || remoteAddress || identityId

  try {
    const addResult = await withRemoteDirectoryDeadline(
      (requestSignal, beginCommit) => addContactByAddress(
        repairTarget,
        contact?.displayName,
        {
          signal: requestSignal,
          onCommitStart: beginCommit,
        },
      ),
      'Contact key refresh timed out',
      signal,
    )
    if (!addResult.success) {
      return {
        repaired: false,
        identityId,
        error: new Error(addResult.error || 'Could not refresh contact keys'),
        identityReplacement: addResult.identityReplacement,
      }
    }

    const repairedIdentityId = addResult.identityId || identityId
    await localChatStorage.deleteSessionRecord(repairedIdentityId).catch((error) => {
      console.warn('Failed to clear direct chat session record during repair:', error)
    })

    return {
      repaired: true,
      identityId: repairedIdentityId,
      error: null,
    }
  } catch (error) {
    return {
      repaired: false,
      identityId,
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

type QuantumConversationHandle = NonNullable<
  Awaited<ReturnType<typeof getQuantumConversation>>
>

type PreparedConversationActivation = ConversationActivationResult & {
  handle: QuantumConversationHandle | null
  backgroundVerificationIdentityId?: string
}

function preparedActivationFailure(
  identityId: string | null,
  error: Error,
  reason: ConversationActivationReason,
  options?: {
    repaired?: boolean
    identityReplacement?: ContactIdentityReplacement
  },
): PreparedConversationActivation {
  return {
    conversationId: null,
    identityId,
    error,
    reason,
    handle: null,
    ...options,
  }
}

function preparedActivationSuccess(
  handle: QuantumConversationHandle,
  identityId: string,
  repaired?: boolean,
): PreparedConversationActivation {
  return {
    conversationId: handle.getId(),
    identityId,
    error: null,
    handle,
    ...(repaired ? { repaired: true } : {}),
  }
}

function preparedActivationWithoutSession(
  identityId: string,
  repaired?: boolean,
): PreparedConversationActivation {
  return {
    conversationId: getConversation(identityId).id,
    identityId,
    error: null,
    handle: null,
    ...(repaired ? { repaired: true } : {}),
  }
}

async function handleBackgroundContactVerificationFailure(
  error: unknown,
  identityId: string,
  options: ConversationActivationOptions,
): Promise<void> {
  recordChatDiagnostic('activation', 'background_contact_verification_failed', {
    remoteTransportAvailable: true,
  })
  if (
    error instanceof ContactIdentityChangeError
    && !options.signal?.aborted
  ) {
    options.onBackgroundVerificationFailure?.({
      conversationId: null,
      identityId,
      error,
      reason: 'verification_failed',
      identityReplacement: error.replacement,
    })
    if (!error.replacement && options.onBackgroundVerificationFailure) {
      const repair = await repairDirectConversationActivation(
        identityId,
        identityId,
        options.signal,
      )
      if (repair.identityReplacement && !options.signal?.aborted) {
        options.onBackgroundVerificationFailure({
          conversationId: null,
          identityId,
          error: repair.error || error,
          reason: 'verification_failed',
          identityReplacement: repair.identityReplacement,
        })
      }
    }
  }
}

function verifyContactInBackground(
  identityId: string,
  options: ConversationActivationOptions,
): void {
  if (!isRemoteChatServiceAvailable() || options.signal?.aborted) return

  const key = getContactVerificationWarmupKey(identityId)
  let warmup = contactVerificationWarmups.get(key)
  if (!warmup) {
    const controller = new AbortController()
    const verification = withRemoteDirectoryDeadline(
      (requestSignal, beginCommit) => verifyContactBundle(identityId, {
        signal: requestSignal,
        onCommitStart: beginCommit,
        forceRemoteVerification: true,
      }),
      'Contact verification timed out',
      controller.signal,
    )
    warmup = {
      controller,
      promise: verification,
      consumers: new Set(),
      sendWaiters: 0,
      settled: false,
    }
    contactVerificationWarmups.set(key, warmup)
    const trackedWarmup = warmup
    void verification
      .then(() => undefined, () => undefined)
      .finally(() => {
        trackedWarmup.settled = true
        if (contactVerificationWarmups.get(key) === trackedWarmup) {
          contactVerificationWarmups.delete(key)
        }
      })
  }

  const consumer = Symbol(identityId)
  warmup.consumers.add(consumer)
  let released = false
  const release = () => {
    if (released) return
    released = true
    options.signal?.removeEventListener('abort', release)
    warmup.consumers.delete(consumer)
    cancelUnusedContactVerification(warmup)
  }
  options.signal?.addEventListener('abort', release, { once: true })

  void warmup.promise
    .catch((error) => handleBackgroundContactVerificationFailure(error, identityId, options))
    .catch(() => undefined)
    .finally(release)
}

async function prepareConversationActivation(
  remoteAddress: string,
  options: ConversationActivationOptions = {},
): Promise<PreparedConversationActivation> {
  if (!remoteAddress || remoteAddress === 'undefined' || remoteAddress === 'null') {
    return {
      ...invalidConversationResult('invalid_address', 'Invalid conversation address'),
      handle: null,
    }
  }

  const initError = await ensureChatRuntimeReady()
  if (initError) {
    return preparedActivationFailure(null, initError, 'chat_not_initialized')
  }

  if (isRemoteChatServiceAvailable()) {
    void prewarmDirectChatTransportAccess().catch(() => undefined)
  }

  const localIdentityId = resolveIdentityId(remoteAddress)
  let localError: Error | null = null

  try {
    const handle = await getLocalQuantumConversation(localIdentityId)
    if (handle) {
      return {
        ...preparedActivationSuccess(handle, localIdentityId),
        backgroundVerificationIdentityId: localIdentityId,
      }
    }
    return {
      ...preparedActivationWithoutSession(localIdentityId),
      backgroundVerificationIdentityId: localIdentityId,
    }
  } catch (error) {
    localError = error instanceof Error ? error : new Error(String(error))
  }

  if (!isRemoteChatServiceAvailable()) {
    return preparedActivationFailure(
      localIdentityId,
      localError || new Error('Conversation keys are unavailable while offline'),
      'conversation_unavailable',
    )
  }

  if (options.repairOnFailure) {
    try {
      assertContactIdentityTrusted(localIdentityId)
    } catch (error) {
      const trustError = error instanceof Error ? error : new Error(String(error))
      return preparedActivationFailure(
        localIdentityId,
        trustError,
        'verification_failed',
        trustError instanceof ContactIdentityChangeError
          ? { identityReplacement: trustError.replacement }
          : undefined,
      )
    }

    const repair = await repairDirectConversationActivation(
      remoteAddress,
      localIdentityId,
      options.signal,
    )
    if (!repair.repaired) {
      return preparedActivationFailure(
        localIdentityId,
        repair.error || localError || new Error('Could not repair conversation'),
        'repair_failed',
        { identityReplacement: repair.identityReplacement },
      )
    }

    try {
      const retryHandle = await getLocalQuantumConversation(repair.identityId)
      if (retryHandle) {
        return preparedActivationSuccess(retryHandle, repair.identityId, true)
      }
      return preparedActivationWithoutSession(repair.identityId, true)
    } catch (error) {
      return preparedActivationFailure(
        repair.identityId,
        error instanceof Error ? error : new Error(String(error)),
        'repair_failed',
        { repaired: true },
      )
    }
  }

  let verifiedId: string
  try {
    verifiedId = await resolveVerifiedIdentity(remoteAddress, options.signal)
  } catch (error) {
    return preparedActivationFailure(
      localIdentityId,
      error instanceof Error ? error : new Error(String(error)),
      'verification_failed',
    )
  }

  let verifiedConversationError: Error | null = null
  try {
    const handle = await getLocalQuantumConversation(verifiedId)
    if (handle) {
      return preparedActivationSuccess(handle, verifiedId)
    }
    return preparedActivationWithoutSession(verifiedId)
  } catch (error) {
    verifiedConversationError = error instanceof Error ? error : new Error(String(error))
  }

  return preparedActivationFailure(
    verifiedId,
    verifiedConversationError || localError || new Error('Conversation could not be prepared'),
    'conversation_unavailable',
  )
}

function activationResultWithoutHandle(
  prepared: PreparedConversationActivation,
): ConversationActivationResult {
  const {
    handle: _,
    backgroundVerificationIdentityId: __,
    ...result
  } = prepared
  return result
}

export async function ensureConversationExists(
  remoteAddress: string,
  options: ConversationActivationOptions = {},
): Promise<ConversationActivationResult> {
  const prepared = await prepareConversationActivation(remoteAddress, options)
  if (prepared.backgroundVerificationIdentityId && !options.signal?.aborted) {
    verifyContactInBackground(prepared.backgroundVerificationIdentityId, options)
  }
  return activationResultWithoutHandle(prepared)
}

export async function activateConversation(
  remoteAddress: string,
  options: ConversationActivationOptions = { repairOnFailure: true },
): Promise<ConversationActivationResult> {
  const prepared = await prepareConversationActivation(remoteAddress, options)
  if (prepared.handle && !options.signal?.aborted) {
    setQuantumActiveConversation(prepared.handle)
  } else if (prepared.conversationId && !options.signal?.aborted) {
    setQuantumActiveConversation(null)
    useChatStore.getState().setActiveConversation(prepared.conversationId)
  }
  if (prepared.backgroundVerificationIdentityId && !options.signal?.aborted) {
    verifyContactInBackground(prepared.backgroundVerificationIdentityId, options)
  }

  return activationResultWithoutHandle(prepared)
}

export function deactivateConversation(): void {
  setQuantumActiveConversation(null)
}

// Messages

function createOptimisticSendContext(
  senderAddress: string,
  recipientAddress: string,
  content: string,
  attachments?: MediaAttachment[],
  replyTo?: ReplyReference | null,
  attachmentTrace?: AttachmentSendTrace | null,
  options?: ChatSendOptions,
  retryMessage?: ChatMessage | null,
): OptimisticSendContext {
  const sendStartedAt = attachmentTrace?.sendStartedAt ?? Date.now()
  const store = useChatStore.getState()
  const accountContext = getActiveChatAccountContext()
  const retryConversation = retryMessage?.conversationId
    ? store.conversations.find((entry) => entry.id === retryMessage.conversationId)
    : undefined
  const conversation = retryConversation ?? getConversation(recipientAddress, accountContext)
  const senderId = getIdentity()?.id || senderAddress
  const timestamp = retryMessage?.timestamp ?? sendStartedAt
  const localOrderTimestamp = retryMessage?.localOrderTimestamp ?? createLocalOrderTimestamp(timestamp)
  const messageId = retryMessage?.id ?? createLocalMessageId(timestamp)
  const optimisticAttachments = retryMessage?.attachments ?? getOptimisticAttachments(attachments, options)
  const oneTime = retryMessage?.oneTime ?? getOneTimeMetadata(options)
  const spectreDefaultDisappearingTimer =
    useSpectreStore.getState().enabled && !isDisappearingTimerEnabled(conversation.disappearingTimer)
      ? buildDirectDisappearingTimer(SPECTRE_DIRECT_DISAPPEARING_MS, {
          updatedAt: timestamp,
          updatedBy: senderId,
        })
      : null
  const effectiveConversation = spectreDefaultDisappearingTimer
    ? { ...conversation, disappearingTimer: spectreDefaultDisappearingTimer }
    : conversation
  const disappearingTimer = normalizeDisappearingTimer(
    effectiveConversation.disappearingTimer ?? null,
  )
  const disappearing = retryMessage?.disappearing
    ?? createMessageDisappearingState(disappearingTimer, {
      sentAt: timestamp,
      applyFallback: disappearingTimer?.trigger === 'after_read',
    })
  const preview = oneTime
    ? getViewOncePreviewLabel(oneTime.kind)
    : buildDirectMessagePreview(content, optimisticAttachments, { isOwn: true }).preview

  if (
    effectiveConversation.id.startsWith('pending_')
    && !store.conversations.some((entry) => entry.id === effectiveConversation.id)
  ) {
    store.addConversation(effectiveConversation)
  } else if (spectreDefaultDisappearingTimer) {
    store.updateConversation(effectiveConversation.id, {
      disappearingTimer: spectreDefaultDisappearingTimer,
    })
  }

  const optimisticMessage: ChatMessage = {
    id: messageId,
    conversationId: effectiveConversation.id,
    senderId,
    localIdentityId: accountContext.localIdentityId,
    localWalletAddress: accountContext.localWalletAddress,
    content,
    timestamp,
    localOrderTimestamp,
    status: 'sending',
    ...getQueuedDeliveryState(),
    signatureVerified: true,
    attachments: optimisticAttachments,
    replyTo: replyTo || undefined,
    oneTime,
    disappearing,
    deleted: false,
  }

  if (retryMessage) {
    const exists = store.messages.some((entry) => entry.id === messageId)
    if (exists) {
      store.updateMessage(messageId, optimisticMessage)
    } else {
      store.addMessage(optimisticMessage)
    }
  } else {
    store.addMessage(optimisticMessage)
  }

  store.updateConversation(effectiveConversation.id, {
    lastMessage: {
      content: preview,
      timestamp,
      isOwn: true,
    },
  })

  recordChatLatency('send', 'tap_to_optimistic_bubble', Date.now() - sendStartedAt, {
    remoteIdentityId: conversation.remoteIdentityId,
    hasAttachments: Boolean(optimisticAttachments?.length),
    torEnabled: useTorStore.getState().enabled,
  })

  return {
    messageId,
    conversationId: effectiveConversation.id,
    timestamp,
    localOrderTimestamp,
    sendStartedAt,
    attachmentSendId: attachmentTrace?.attachmentSendId ?? null,
    replyTo: replyTo || undefined,
    oneTime,
    disappearing,
    disappearingTimer,
  }
}

function alignOptimisticConversationIdentity(
  optimistic: OptimisticSendContext,
  verifiedIdentityId: string,
): void {
  if (!optimistic.conversationId.startsWith('pending_')) {
    return
  }

  useChatStore.getState().updateConversation(optimistic.conversationId, {
    remoteIdentityId: verifiedIdentityId,
  })
}

function markOptimisticSendFailed(optimistic: OptimisticSendContext): void {
  useChatStore.getState().updateMessage(optimistic.messageId, {
    status: 'failed',
    ...getFailedDeliveryState(),
  })
}

export async function persistDirectMessageLocalOrder(
  messages: Array<Pick<ChatMessage, 'id' | 'timestamp' | 'localOrderTimestamp'>>,
): Promise<void> {
  let previousOrderTimestamp = 0
  const corrections = messages.flatMap((message) => {
    const timestamp = Math.max(
      getFiniteMessageOrderTimestamp(message),
      previousOrderTimestamp + 1,
    )
    previousOrderTimestamp = timestamp
    return message.localOrderTimestamp === timestamp
      ? []
      : [{ id: message.id, localOrderTimestamp: timestamp }]
  })

  for (let index = 0; index < corrections.length; index += LOCAL_ORDER_PERSIST_CONCURRENCY) {
    await Promise.allSettled(
      corrections
        .slice(index, index + LOCAL_ORDER_PERSIST_CONCURRENCY)
        .map(async ({ id, localOrderTimestamp }) => {
      const [encryptedMessage, decryptedMessage] = await Promise.all([
        localChatStorage.getMessage(id).catch(() => null),
        localChatStorage.getDecryptedMessage(id).catch(() => null),
      ])

      await Promise.allSettled([
        encryptedMessage && encryptedMessage.localOrderTimestamp !== localOrderTimestamp
          ? localChatStorage.storeMessage({ ...encryptedMessage, localOrderTimestamp })
          : Promise.resolve(),
        decryptedMessage && decryptedMessage.localOrderTimestamp !== localOrderTimestamp
          ? localChatStorage.updateDecryptedMessage(id, { localOrderTimestamp })
          : Promise.resolve(),
      ])
        }),
    )
  }
}

function isHiddenControlSend(
  content: string,
  attachments?: MediaAttachment[],
  replyTo?: ReplyReference | null,
  options?: ChatSendOptions,
): boolean {
  return !attachments?.length
    && !replyTo
    && !options?.oneTime
    && classifyDirectMessageKind(content) === 'hidden_control'
}

export async function sendMessage(
  senderAddress: string,
  recipientAddress: string,
  content: string,
  attachments?: MediaAttachment[],
  onProgress?: (progress: MessageSendProgress) => void,
  replyTo?: ReplyReference | null,
  diagnostics?: SendMessageDiagnostics,
  options?: ChatSendOptions,
  retryMessage?: ChatMessage | null,
): Promise<{ message: ChatMessage | null; error: Error | null }> {
  const admission = evaluateChatSendPolicy({
    content,
    attachments,
    options,
    spectrePolicyState: getCurrentSpectrePolicyState(),
  })
  if (!admission.accepted) {
    return { message: null, error: new Error(admission.message) }
  }
  content = admission.content
  attachments = admission.attachments
  options = admission.options

  const attachmentTrace = attachments?.length
    ? diagnostics?.attachmentTrace ?? createAttachmentSendTrace()
    : null
  const sendLogContext = {
    senderAddress: summarizeChatServiceSendValue(senderAddress),
    recipientAddress: summarizeChatServiceSendValue(recipientAddress),
    contentLength: content.length,
    attachmentCount: attachments?.length ?? 0,
    attachmentSendId: attachmentTrace?.attachmentSendId ?? null,
    attachments: describeChatServiceAttachments(attachments),
    replyToMessageId: replyTo?.messageId ?? null,
  }
  logChatServiceSend('send_message_start', sendLogContext)

  if (attachmentTrace && attachments?.length) {
    recordChatDiagnostic(
      'send',
      ATTACHMENT_PIPELINE_EVENT_NAME,
      buildAttachmentPipelineFields(
        'send_started',
        {
          attachmentSendId: attachmentTrace.attachmentSendId,
          sendStartedAt: attachmentTrace.sendStartedAt,
          attachmentCount: attachments.length,
        },
        {
          source: 'chatService.sendMessage',
          contentLength: content.length,
          replyToMessageId: replyTo?.messageId ?? undefined,
        },
      ),
    )
  }

  if (isHiddenControlSend(content, attachments, replyTo, options)) {
    const initializationError = await ensureChatRuntimeReady()
    if (initializationError) {
      return { message: null, error: initializationError }
    }

    try {
      const readiness = await prepareDirectSendReadiness(recipientAddress)
      if (!readiness.ready || !readiness.resolvedIdentityId) {
        throw readiness.error ?? new Error('Chat is not ready to send')
      }
      const resolvedId = resolveIdentityId(recipientAddress)
      const verifiedId = readiness.resolvedIdentityId
      logChatServiceSend('send_message_control_identity_resolved', {
        ...sendLogContext,
        resolvedId: summarizeChatServiceSendValue(resolvedId),
        verifiedId: summarizeChatServiceSendValue(verifiedId),
      })

      const result = await sendQuantumMessage(verifiedId, content)
      if (result.success) {
        logChatServiceSend('send_message_control_success', {
          ...sendLogContext,
          verifiedId: summarizeChatServiceSendValue(verifiedId),
        })
        return { message: result.message ?? null, error: null }
      }

      console.warn(`${CHAT_SERVICE_SEND_LOG_PREFIX} send_message_control_failed`, {
        ...sendLogContext,
        verifiedId: summarizeChatServiceSendValue(verifiedId),
        error: result.error ?? 'Failed to send control message',
      })
      return { message: null, error: new Error(result.error || 'Failed to send control message') }
    } catch (error) {
      console.error(`${CHAT_SERVICE_SEND_LOG_PREFIX} send_message_control_failed`, {
        ...sendLogContext,
        error: error instanceof Error ? error.message : String(error),
      })
      return { message: null, error: error as Error }
    }
  }

  const optimistic = createOptimisticSendContext(
    senderAddress,
    recipientAddress,
    content,
    attachments,
    replyTo,
    attachmentTrace,
    options,
    retryMessage,
  )

  const initializationPromise = ensureChatRuntimeReady()
  const readinessPromise = initializationPromise.then((initializationError) => (
    initializationError ? null : prepareDirectSendReadiness(recipientAddress)
  ))
  void readinessPromise.catch(() => {})
  await yieldToChatUi()
  const initializationError = await initializationPromise
  if (initializationError) {
    console.warn(`${CHAT_SERVICE_SEND_LOG_PREFIX} send_message_chat_not_initialized`, sendLogContext)
    if (attachmentTrace && attachments?.length) {
      recordChatDiagnostic(
        'send',
        ATTACHMENT_PIPELINE_FAILURE_EVENT_NAME,
        buildAttachmentPipelineFailureFields(
          {
            attachmentSendId: attachmentTrace.attachmentSendId,
            sendStartedAt: attachmentTrace.sendStartedAt,
            attachmentCount: attachments.length,
            conversationId: optimistic.conversationId,
            optimisticMessageId: optimistic.messageId,
          },
          {
            failureStage: 'chat_not_initialized',
            lastSuccessfulStage: 'send_started',
            error: initializationError.message,
          },
        ),
      )
    }
    markOptimisticSendFailed(optimistic)
    return { message: null, error: initializationError }
  }

  return (async () => {
    try {
    const readiness = await readinessPromise
    if (!readiness || !readiness.ready || !readiness.resolvedIdentityId) {
      throw readiness?.error ?? new Error('Chat is not ready to send')
    }
    const resolvedId = resolveIdentityId(recipientAddress)
    const verifiedId = readiness.resolvedIdentityId
    logChatServiceSend('send_message_identity_resolved', {
      ...sendLogContext,
      resolvedId: summarizeChatServiceSendValue(resolvedId),
      verifiedId: summarizeChatServiceSendValue(verifiedId),
    })
    alignOptimisticConversationIdentity(optimistic, verifiedId)

    if (attachments && attachments.length > 0) {
      logChatServiceSend('send_message_media_path_dispatch', {
        ...sendLogContext,
        verifiedId: summarizeChatServiceSendValue(verifiedId),
      })
      const result = await sendQuantumMediaMessage(
        verifiedId,
        content,
        attachments,
        onProgress,
        optimistic,
      )
      
      if (result.success && result.message) {
        logChatServiceSend('send_message_media_path_success', {
          ...sendLogContext,
          verifiedId: summarizeChatServiceSendValue(verifiedId),
          messageId: result.message.id,
        })
        if (replyTo) {
          useChatStore.getState().updateMessage(result.message.id, { replyTo })
        }
        return { message: result.message, error: null }
      }
      console.warn(`${CHAT_SERVICE_SEND_LOG_PREFIX} send_message_media_path_failed`, {
        ...sendLogContext,
        verifiedId: summarizeChatServiceSendValue(verifiedId),
        error: result.error ?? 'Failed to send media message',
      })
      useChatStore.getState().updateMessage(result.message?.id ?? optimistic.messageId, {
        status: 'failed',
        relayed: false,
        ...getFailedDeliveryState(),
      })
      return { message: null, error: new Error(result.error || 'Failed to send media message') }
    }
    
    const messageContent = buildOutgoingContent(
      content,
      replyTo,
      optimistic.disappearingTimer ?? null,
      options,
    )
    
    const result = await sendQuantumMessage(verifiedId, messageContent, optimistic)
    
    if (result.success && result.message) {
      logChatServiceSend('send_message_text_path_success', {
        ...sendLogContext,
        verifiedId: summarizeChatServiceSendValue(verifiedId),
        messageId: result.message.id,
      })
      if (replyTo) {
        useChatStore.getState().updateMessage(result.message.id, { replyTo })
      }
      return { message: result.message, error: null }
    }
    console.warn(`${CHAT_SERVICE_SEND_LOG_PREFIX} send_message_text_path_failed`, {
      ...sendLogContext,
      verifiedId: summarizeChatServiceSendValue(verifiedId),
      error: result.error ?? 'Failed to send message',
    })
    useChatStore.getState().updateMessage(result.message?.id ?? optimistic.messageId, {
      status: 'failed',
      relayed: false,
      ...getFailedDeliveryState(),
    })
    return { message: null, error: new Error(result.error || 'Failed to send message') }
  } catch (error) {
    console.error(`${CHAT_SERVICE_SEND_LOG_PREFIX} send_message_failed`, {
      ...sendLogContext,
      error: error instanceof Error ? error.message : String(error),
    })
    if (attachmentTrace && attachments?.length) {
      const failureDetails = getAttachmentPipelineFailureDetails(error)
      recordChatDiagnostic(
        'send',
        ATTACHMENT_PIPELINE_FAILURE_EVENT_NAME,
        buildAttachmentPipelineFailureFields(
          {
            attachmentSendId: attachmentTrace.attachmentSendId,
            sendStartedAt: attachmentTrace.sendStartedAt,
            attachmentCount: attachments.length,
            conversationId: optimistic.conversationId,
            optimisticMessageId: optimistic.messageId,
          },
          {
            failureStage: failureDetails?.failureStage ?? 'send_started',
            lastSuccessfulStage: failureDetails?.lastSuccessfulStage ?? 'send_started',
            statusCode: failureDetails?.statusCode ?? undefined,
            failureReason: failureDetails?.failureReason ?? undefined,
            transient: failureDetails?.transient ?? undefined,
            error: error instanceof Error ? error.message : String(error),
          },
        ),
      )
    }
    console.error('Failed to send message:', error)
    markOptimisticSendFailed(optimistic)
    return { message: null, error: error as Error }
    }
  })()
}

export async function retryFailedMessage(
  senderAddress: string,
  recipientAddress: string,
  failedMessage: ChatMessage,
): Promise<{ message: ChatMessage | null; error: Error | null }> {
  if (failedMessage.status !== 'failed') {
    return { message: null, error: new Error('Only failed messages can be retried') }
  }

  const retryOptions: ChatSendOptions | undefined = failedMessage.oneTime?.kind
    ? { oneTime: { kind: failedMessage.oneTime.kind } }
    : undefined
  const admission = evaluateChatSendPolicy({
    content: failedMessage.content,
    attachments: failedMessage.attachments,
    options: retryOptions,
    spectrePolicyState: getCurrentSpectrePolicyState(),
  })
  if (!admission.accepted) {
    return { message: null, error: new Error(admission.message) }
  }

  if (!isQuantumChatInitialized()) {
    await initializeChat()
    if (!isQuantumChatInitialized()) {
      return { message: null, error: new Error('Chat not initialized') }
    }
  }

  try {
    const resolvedId = resolveIdentityId(recipientAddress)
    const verifiedId = await resolveVerifiedIdentityForSend(resolvedId)
    const storedRetry = await retryStoredQuantumMessage(verifiedId, failedMessage)
    if (storedRetry.retriedStored) {
      return {
        message: storedRetry.success ? (storedRetry.message ?? failedMessage) : null,
        error: storedRetry.success ? null : new Error(storedRetry.error || 'Failed to retry message'),
      }
    }
  } catch (error) {
    return { message: null, error: error as Error }
  }

  return sendMessage(
    senderAddress,
    recipientAddress,
    failedMessage.content,
    failedMessage.attachments,
    undefined,
    failedMessage.replyTo ?? null,
    undefined,
    retryOptions,
    failedMessage,
  )
}

export async function loadCachedMessagesForConversation(
  remoteAddress: string,
  options: Parameters<typeof loadCachedQuantumMessages>[1] = {},
): Promise<ChatMessage[]> {
  if (!remoteAddress || remoteAddress === 'undefined' || remoteAddress === 'null') {
    return []
  }

  const resolvedId = resolveIdentityId(remoteAddress)
  const hasOptions = Boolean(
    options.conversationId
    || options.limit
    || options.signal
    || options.resolveAttachments !== undefined
    || options.scheduleDerivedWork !== undefined,
  )
  return hasOptions
    ? loadCachedQuantumMessages(resolvedId, options)
    : loadCachedQuantumMessages(resolvedId)
}

export async function loadCachedConversationsList(): Promise<void> {
  await loadCachedQuantumConversations()
}

export async function loadCachedContactsList(): Promise<void> {
  await hydrateCachedQuantumContacts()
}

// Reactions

export async function sendReaction(
  recipientAddress: string,
  targetMessageId: string,
  emoji: string
): Promise<{ error: Error | null }> {
  if (!isQuantumChatInitialized()) {
    await initializeChat()
    if (!isQuantumChatInitialized()) {
      return { error: new Error('Chat not initialized') }
    }
  }

  try {
    const resolvedId = resolveIdentityId(recipientAddress)
    const verifiedId = await resolveVerifiedIdentityForSend(resolvedId)
    const identity = getIdentity()

    const result = await sendQuantumMessage(
      verifiedId,
      createDirectEnvelope('reaction', {
        reaction: { targetMessageId, emoji },
      }),
    )

    if (result.success && identity) {
      useChatStore.getState().addReaction(targetMessageId, {
        emoji,
        senderId: identity.id,
        timestamp: Date.now(),
      })
    }

    return { error: result.success ? null : new Error(result.error || 'Failed to send reaction') }
  } catch (error) {
    return { error: error as Error }
  }
}

// Message deletion

export async function deleteMessageForAll(
  recipientAddress: string,
  targetMessageId: string
): Promise<{ error: Error | null }> {
  if (!isQuantumChatInitialized()) {
    await initializeChat()
    if (!isQuantumChatInitialized()) {
      return { error: new Error('Chat not initialized') }
    }
  }

  try {
    const identity = getIdentity()
    const canDelete = canDeleteDirectMessageForEveryone(
      targetMessageId,
      identity?.id,
      useChatStore.getState().messages,
    )
    if (!canDelete) {
      return { error: new Error('Only the original sender can delete this message for everyone') }
    }

    const resolvedId = resolveIdentityId(recipientAddress)
    const verifiedId = await resolveVerifiedIdentityForSend(resolvedId)

    const result = await sendQuantumMessage(
      verifiedId,
      createDirectEnvelope('deletion', {
        deletionTarget: targetMessageId,
      }),
    )

    if (result.success) {
      useChatStore.getState().updateMessage(targetMessageId, { deleted: true, content: '' })
      await deleteBackendMessage(targetMessageId).catch(() => {})
    }

    return { error: result.success ? null : new Error(result.error || 'Failed to send deletion') }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function consumeViewOnceMessage(
  recipientAddress: string,
  message: ChatMessage,
): Promise<{ error: Error | null }> {
  if (!message.oneTime || message.oneTime.state === 'consumed') {
    return { error: null }
  }

  if (!isQuantumChatInitialized()) {
    await initializeChat()
    if (!isQuantumChatInitialized()) {
      return { error: new Error('Chat not initialized') }
    }
  }

  try {
    const resolvedId = resolveIdentityId(recipientAddress)
    const verifiedId = await resolveVerifiedIdentityForSend(resolvedId)
    const result = await consumeQuantumDirectViewOnceMessage(message, verifiedId)
    return {
      error: result.success ? null : new Error(result.error || 'Failed to consume one-time message'),
    }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function revealViewOnceMessage(
  message: ChatMessage,
): Promise<{ payload: OneTimeRevealPayload | null; error: Error | null }> {
  if (!message.oneTime || message.oneTime.state === 'consumed') {
    return { payload: null, error: null }
  }

  if (!isQuantumChatInitialized()) {
    await initializeChat()
    if (!isQuantumChatInitialized()) {
      return { payload: null, error: new Error('Chat not initialized') }
    }
  }

  try {
    const result = await revealQuantumDirectViewOnceMessage(message)
    return {
      payload: result.success ? (result.payload ?? null) : null,
      error: result.success ? null : new Error(result.error || 'Failed to reveal one-time message'),
    }
  } catch (error) {
    return { payload: null, error: error as Error }
  }
}

export function deleteMessageLocally(messageId: string): void {
  const store = useChatStore.getState()
  const message = store.messages.find((candidate) => candidate.id === messageId)
  if (!message) return

  store.updateMessage(messageId, { deleted: true, content: '' })
  const conversation = store.conversations.find((candidate) => candidate.id === message.conversationId)
  const localIdentityId = conversation?.localIdentityId ?? getIdentity()?.id
  const localWalletAddress = conversation?.localWalletAddress ?? useWalletStore.getState().wallet?.address

  void deleteDirectMessagesAndReconcile({
    conversationId: message.conversationId,
    localIdentityId,
    localWalletAddress,
    messageIds: [messageId],
  }).catch((error) => {
    console.warn('Failed to persist local direct-message deletion:', error)
  })
}

// Conversation deletion

export async function clearConversationChat(conversationId: string): Promise<{ error: Error | null }> {
  try {
    cancelDirectChatPrewarm()
    await clearDirectConversationLocally(conversationId)
    useChatStore.getState().evictDirectConversationWindow(conversationId)
    await deleteConversationMessages(conversationId).catch(() => {})
    syncGlobalBadge().catch(() => {})

    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function deleteConversation(conversationId: string): Promise<{ error: Error | null }> {
  try {
    cancelDirectChatPrewarm()
    await deleteDirectConversationLocally(conversationId, {
      client: getQuantumChatClient(),
    })
    useChatStore.getState().evictDirectConversationWindow(conversationId)
    await deleteConversationMessages(conversationId).catch(() => {})
    syncGlobalBadge().catch(() => {})

    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function deleteConversationForBoth(
  conversationId: string,
  recipientAddress: string,
): Promise<{ error: Error | null }> {
  if (!isQuantumChatInitialized()) {
    await initializeChat()
    if (!isQuantumChatInitialized()) {
      return { error: new Error('Chat not initialized') }
    }
  }

  try {
    const resolvedId = resolveIdentityId(recipientAddress)
    const verifiedId = await resolveVerifiedIdentityForSend(resolvedId)
    const result = await sendQuantumMessage(
      verifiedId,
      createDirectEnvelope('conversation_delete', {
        targetIdentityId: verifiedId,
        issuedAt: Date.now(),
      }),
    )

    if (!result.success) {
      return { error: new Error(result.error || 'Failed to send conversation deletion') }
    }

    await deleteDirectConversationLocally(conversationId, {
      client: getQuantumChatClient(),
    })
    cancelDirectChatPrewarm()
    useChatStore.getState().evictDirectConversationWindow(conversationId)
    syncGlobalBadge().catch(() => {})

    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

// Contact management

function findContactByReference(contactRef: string): ChatContact | undefined {
  const { contacts } = useChatStore.getState()
  return contacts.find(
    (contact) => contact.identityId === contactRef || contact.walletAddress === contactRef,
  )
}

function directConversationIdsForContact(contact: ChatContact): string[] {
  const { conversations } = useChatStore.getState()
  const localWalletAddress = contact.localWalletAddress || useWalletStore.getState().wallet?.address
  const scoped = conversations.filter((candidate) => (
    candidate.type !== 'group'
    && matchesAccountStorageScope(candidate.localWalletAddress, localWalletAddress)
  ))
  const ids = getDirectConversationIds(contact.identityId, null, scoped)
  if (contact.walletAddress && contact.walletAddress !== contact.identityId) {
    for (const id of getDirectConversationIds(contact.walletAddress, null, scoped)) {
      ids.add(id)
    }
  }
  return [...ids]
}

async function persistLocalContactState(
  contact: ChatContact,
  updates: Partial<ChatContact>,
): Promise<void> {
  const nextContact: ChatContact = {
    ...contact,
    ...updates,
  }

  await updateActiveAddressBookSnapshot((snapshot) => upsertAddressBookEntry(snapshot, {
    walletAddress: nextContact.walletAddress,
    identityId: nextContact.identityId,
    displayName: nextContact.displayName,
    isSaved: nextContact.isSaved ?? false,
    isHidden: nextContact.isHidden ?? false,
    trustState: nextContact.trustState,
    createdAt: nextContact.addedAt,
    updatedAt: Date.now(),
  }))

  useChatStore.getState().updateContact(contact.identityId, updates)
}

export async function deleteContact(contactIdentityId: string): Promise<{ error: Error | null }> {
  try {
    const existingContact = findContactByReference(contactIdentityId)
    if (!existingContact) {
      return { error: new Error('Contact not found') }
    }

    for (const conversationId of directConversationIdsForContact(existingContact)) {
      const result = await deleteConversation(conversationId)
      if (result.error) return result
    }

    await updateActiveAddressBookSnapshot((snapshot) => removeAddressBookEntry(snapshot, {
      walletAddress: existingContact.walletAddress,
      identityId: existingContact.identityId,
    }))
    useChatStore.getState().removeContact(existingContact.identityId)
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function renameContact(
  contactIdentityId: string,
  displayName: string,
): Promise<{ error: Error | null }> {
  try {
    const existingContact = findContactByReference(contactIdentityId)
    if (!existingContact) {
      return { error: new Error('Contact not found') }
    }

    const normalizedDisplayName = displayName.trim()
    if (!normalizedDisplayName) {
      return { error: new Error('Display name cannot be empty') }
    }

    await persistLocalContactState(existingContact, {
      displayName: normalizedDisplayName,
      isSaved: true,
    })
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

// Read receipts

export async function markConversationAsRead(
  remoteAddress: string
): Promise<void> {
  if (!isQuantumChatInitialized()) return

  const resolvedId = resolveIdentityId(remoteAddress)
  const accountContext = getActiveChatAccountContext()
  const { conversations } = useChatStore.getState()
  const conv = conversations.find(
    (c) => matchesLocalAccount(c, accountContext)
      && (
        c.id === remoteAddress
        || c.id === resolvedId
        || c.remoteIdentityId === resolvedId
        || c.remoteIdentityId === remoteAddress
        || c.remoteWalletAddress === remoteAddress
      )
  )
  const quantumConversationId = conv?.remoteIdentityId || resolvedId
  let durableReadApplied = false

  if (conv) {
    try {
      durableReadApplied = await markQuantumLocalConversationAsRead(
        conv.id,
        quantumConversationId,
      )
    } catch (error) {
      console.warn('Failed to mark conversation as read:', error)
    }
  }

  if (conv) {
    const localIdentityId = getIdentity()?.id
    const { messages, updateMessage } = useChatStore.getState()
    if (durableReadApplied) {
      for (const message of messages) {
        if (
          message.conversationId === conv.id &&
          message.status !== 'read' &&
          message.senderId !== localIdentityId
        ) {
          updateMessage(message.id, {
            status: 'read',
            deliveryStage: 'read',
            deliveryHint: 'Read',
          })
        }
      }

      await armDirectConversationMessagesOnLocalRead(conv.id, localIdentityId)
    }
    await reconcileDirectUnreadState({
      conversationId: conv.id,
      localIdentityId,
      localWalletAddress: conv.localWalletAddress ?? useWalletStore.getState().wallet?.address,
    })

    // Update badge and stale notifications.
    syncGlobalBadge().catch(() => {})
    const notificationKeys = new Set<string>()
    addConversationNotificationKey(notificationKeys, conv.localWalletAddress, conv.id)
    addConversationNotificationKey(notificationKeys, conv.localWalletAddress, conv.remoteIdentityId)
    addConversationNotificationKey(notificationKeys, conv.localWalletAddress, conv.remoteWalletAddress)
    addConversationNotificationKey(notificationKeys, conv.localWalletAddress, resolvedId)
    addConversationNotificationKey(notificationKeys, conv.localWalletAddress, remoteAddress)
    for (const key of notificationKeys) {
      dismissNotificationsForConversation(key).catch(() => {})
    }
  }
}

export async function setConversationDisappearingTimer(
  remoteAddress: string,
  timer: DisappearingMessageTimer | null,
): Promise<{ error: Error | null }> {
  if (!isQuantumChatInitialized()) {
    return { error: new Error('Chat is not initialized') }
  }

  const resolvedId = resolveIdentityId(remoteAddress)
  const normalizedTimer = normalizeDisappearingTimer(timer ?? null)

  try {
    const applied = await setQuantumDirectConversationDisappearingTimer(resolvedId, normalizedTimer)
    if (!applied) {
      return { error: new Error('Failed to update disappearing timer') }
    }
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

// Blocking

export async function blockContact(contactIdentityId: string): Promise<{ error: Error | null }> {
  try {
    const existingContact = findContactByReference(contactIdentityId)
    if (!existingContact) {
      return { error: new Error('Contact not found') }
    }

    await persistLocalContactState(existingContact, { trustState: 'blocked' })
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export async function unblockContact(contactIdentityId: string): Promise<{ error: Error | null }> {
  try {
    const existingContact = findContactByReference(contactIdentityId)
    if (!existingContact) {
      return { error: new Error('Contact not found') }
    }

    await persistLocalContactState(existingContact, { trustState: 'trusted' })
    return { error: null }
  } catch (error) {
    return { error: error as Error }
  }
}

export function isContactBlocked(contactIdentityId: string): boolean {
  const { contacts } = useChatStore.getState()
  const contact = contacts.find((c) => c.identityId === contactIdentityId)
  return contact?.trustState === 'blocked'
}

// Utilities

export function getMessagesForConversation(conversationId: string): ChatMessage[] {
  const { messages } = useChatStore.getState()
  return messages.filter((m) => m.conversationId === conversationId)
}

export { getMyPublicKeyBundle, getSafetyNumber, getIdentity }
