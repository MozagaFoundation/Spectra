/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * End-to-end messaging service with hybrid post-quantum initial key establishment.
 */

import { initializeStorage, clearStorageCache } from '../storage'

try {
  initializeStorage()
} catch (e) {
  console.warn('Failed to initialize storage for QuantumChat:', e)
}

import {
  QuantumChat,
  ConversationHandle,
  compareMessageStatus,
  generateSafetyNumberFromBundlesAsync,
  BackendBundleServer,
  deriveRecipientMailboxToken,
  getActiveSessionByRemoteIdentity as getActiveSession,
  verifyPublicKeyBundleAsync,
  verifyPublicKeyBundleWalletAuthorizationAsync,
  STARTUP_PREKEY_COUNT,
} from '@spectra/core-crypto'
import { localChatStorage } from '@spectra/core-crypto/storage/local'
import type {
  ChatConfig,
  ChatIdentity,
  ContactCardProfileCapsule,
  HybridPreKey,
  PublicKeyBundle,
  BundleServer,
  DecryptedMessage,
  PendingMessageFetchResult,
  SafetyNumber,
  Session,
  Message as StoredMessage,
  StoredDisappearingMessageState,
  StoredDisappearingMessageTimer,
  TelemetryFieldValue,
} from '@spectra/core-crypto'

import {
  isBackendConfigured,
} from '../backend/client'
import { getAppVersionHeaders } from '../backend/appVersion'
import { recordAppUpdateRequiredResponse } from '../backend/request'
import {
  applyContactProfileSnapshot,
  clearOwnContactProfileMemoryCache,
  contactNeedsProfileSync,
  ensureOwnContactProfile,
  markContactProfileSynced,
} from '../chat/contactProfile'
import { canShareOwnContactProfileWith } from './contactProfilePolicy'
import {
  ensureBoundBackendAccessForIdentity,
  ensureBackendSession,
  getCachedBackendAccessToken,
  hasBoundBackendAccessForIdentity,
  rehydratePersistedBoundIdentityCache,
  repairBackendIdentityBinding,
  recoverBoundSessionOnForeground,
  resetAuthCooldowns,
} from '../backend/session'
import { claimSessionOpk } from '../backend/ephemeralDiscovery'
import { useChatStore } from '@/store/chatStore'
import { useAuthStore } from '@/store/authStore'
import { useSpectreStore } from '@/store/spectreStore'
import { useWalletStore } from '@/store/walletStore'
import {
  advanceMailboxCatchupBanner,
  beginMailboxCatchupBanner,
  completeMailboxCatchupBanner,
  resetMailboxCatchupBanner,
} from '@/store/mailboxCatchupBannerStore'
import {
  isSameAccountStorageScope,
  matchesAccountStorageScope,
  matchesStrictAccountStorageScope,
  normalizeAccountStorageScope,
} from '@/lib/accountScope'
import { WARM_DIRECT_CONVERSATION_MESSAGE_LIMIT } from '@/lib/chatMemory'
import { SPECTRA_API_URL } from '@/lib/constants'
import {
  canReceiveMediaInSpectre,
  isSpectrePolicyActive,
  SPECTRE_BLOCKED_MEDIA_SOURCE,
} from '@/lib/spectrePolicy'
import {
  createLockedOneTimeMessage,
  createLockedGenericOneTimeMessage,
  getConsumedOneTimeUpdates,
  getViewOncePreviewLabel,
  isLockedOneTimeMessage,
  VIEW_ONCE_CONSUMED_TEXT,
} from '@/lib/viewOnce'
import {
  armDisappearingMessageOnRead,
  createMessageDisappearingState,
  getDisappearingMessageExpiryTimestamp,
  hasDisappearingMessageExpired,
  isDisappearingTimerEnabled,
  normalizeDisappearingTimer,
} from '@/lib/disappearingMessages'
import type {
  ChatContact,
  ChatMessage,
  Conversation,
  DisappearingMessageState,
  DisappearingMessageTimer,
  MediaAttachment,
  MessageSendProgress,
  OneTimeRevealPayload,
} from '@/lib/types'
import { mapWithConcurrency } from '@/lib/utils'
import { markListStartupMetric } from '@/lib/performanceMetrics'
import {
  sendLocalNotification,
  syncGlobalBadge,
} from '../notifications/pushService'
import { synchronizeActiveWalletPushRegistration } from '../notifications/registrationCoordinator'
import { buildDirectLocalNotificationCopy } from '../notifications/notificationNamePrivacy'
import { getOrCreateNotificationScopeId } from '../notifications/notificationScope'
import {
  persistPrefetchCursor,
  publishPrefetchSession,
} from '../notifications/prefetchSession'
import { takeSealedPrefetchRows } from '../storage/sealedPrefetchCache'
import { AppState, InteractionManager } from 'react-native'
import { buildDirectMessagePreview } from './messagePresentation'
import {
  findLastHydratableConversationPreview,
  mapStoredConversationLastMessage,
  pickPreferredConversationLastMessage,
  resolveLocalConversationDisplayName,
} from './conversationHydration'
import {
  getCachedReceiptPreferences,
  getReceiptPreferences,
} from '@/services/security/receiptPreferences'
import { 
  cacheMediaFromFile, 
  deleteCachedMedia,
  deleteCachedMediaForMessage,
  resolveAttachmentUris,
} from '../media/localMediaCache'
import {
  clearAttachmentHydrationRuntime,
  hydrateMessageAttachments,
  shouldAutoHydrateAttachment,
} from '../media/attachmentHydration'
import { uploadEncryptedMedia } from '../media/mediaService'
import {
  prepareOutgoingMediaAttachment,
  releasePreparedOutgoingMediaAttachment,
  type PreparedOutgoingMediaAttachment,
} from '../media/outgoingAttachment'
import {
  recordMediaSendRelayOutcome,
  requestMediaSendAbandonmentForSend,
  scheduleMediaSendCleanup,
} from '../media/mediaSendOutbox'
import {
  buildQMediaReferences,
  parseMediaFromContent,
  type ParsedAttachment,
} from '../media/qmediaProtocol'
import * as FileSystem from 'expo-file-system/legacy'
import {
  cleanupGroupChat,
  initializeGroupChat,
  pollForNewGroupMessages,
  processDirectGroupControlEnvelope,
  syncGroupConversations,
} from '../groupChat/groupChatService'
import { torAwareFetch } from '../tor/torFetch'
import { useTorStore } from '../tor/torStore'
import { upsertAddressBookEntry } from '../../lib/addressBook/addressBookState'
import { updateActiveAddressBookSnapshot } from '../storage/addressBookStorage'
import { classifyDirectMessageKind } from './messageKinds'
import { isRemoteChatServiceAvailable } from './remoteChatAvailability'
import {
  clearRemoteAccountUnavailableAfterMessage,
  hasRemoteAccountUnavailableMarker,
  isAuthenticatedRemoteAvailabilityCorroboration,
  isAvailabilityCorroboratingOutboundMessageKind,
  isRecipientUnavailableRelayFailure,
  markRemoteAccountUnavailable,
} from './remoteAccountState'
import {
  parseDirectEnvelope,
  isControlEnvelope,
  SCREENSHOT_TAKEN_NOTICE_TEXT,
  type ParsedEnvelope,
} from './envelopes'
import {
  canDeleteDirectMessageForEveryone,
  isDirectSenderBlocked,
} from './directMessageAuthorization'
import {
  createDirectEnvelope,
  serializeDirectMessageContent,
  type DirectMessageContent,
} from '../shared/envelopeTypes'
import {
  applyCryptoPaymentRequestUpdateToContent,
  type CryptoPaymentRequestUpdate,
} from '../shared/cryptoPaymentRequest'
import { TOR_CONFIG, TOR_GROUP_POLL_INTERVAL_MS } from '../tor/torConstants'
import { recordChatLatency, startChatLatencySpan } from '../chat/chatLatency'
import {
  recordCatchupTiming,
  recordChatDiagnostic,
  recordChatOperationalCounter,
} from '../chat/chatDiagnostics'
import {
  ATTACHMENT_PIPELINE_EVENT_NAME,
  ATTACHMENT_PIPELINE_FAILURE_EVENT_NAME,
  buildAttachmentPipelineFailureFields,
  buildAttachmentPipelineFields,
  getAttachmentPipelineFailureDetails,
  type AttachmentPipelineTraceContext,
} from '@spectra/core-crypto/client/attachmentDiagnostics'
import {
  getBLETransportRoute,
  handleBLERouteCapability,
  initBLEEventBridge,
  shutdownBLEEventBridge,
  trySendViaBLE,
} from '../bluetooth/eventBridge'
import type { BLEOutboundDeliveryEvent } from '../bluetooth/types'

async function versionedBundleFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  for (const [name, value] of Object.entries(getAppVersionHeaders())) {
    headers.set(name, value)
  }

  const response = await torAwareFetch(input, { ...init, headers })
  if (response.status === 426) {
    void response.clone().text().then((body) => {
      recordAppUpdateRequiredResponse(response.status, body)
    }).catch(() => undefined)
  }
  return response
}

// Shared state

import * as S from './_state'
import {
  disposeSubscriptionManager,
  initSubscriptionManager,
  startRealtimeSubscription,
  stopRealtimeSubscription,
  getMessagePollIntervalMs,
  scheduleMessagePolling,
  startMessagePolling,
  stopMessagePolling,
  requestOutboundStatusSync,
  setChatInteractionActive,
  beginMailboxCatchupBurst,
  requestPostSendCatchup,
  trackOutboundReceiptToken,
  syncRealtimeSubscriptionForTransport,
  refreshRealtimeMailboxSubscriptions,
  scheduleRealtimeMailboxSubscriptionRefresh,
  whenInitialMailboxCatchupSettled,
  isInitialMailboxCatchupSettled,
} from './subscriptionManager'
import {
  hydrateLocalContactProjection,
  initContactManager,
  repairLocalContactProjection,
  refreshLocalContactProjection,
  syncContactsIntoChatClient,
  addContact as addContactFromBundle,
  getPendingContactIdentityReplacement as getPendingContactIdentityReplacementFromManager,
  lockConversationIdentityReplacement,
  addContactByInvite,
  addContactByAddress,
} from './contactManager'
export {
  hydrateLocalContactProjection,
  repairLocalContactProjection,
} from './contactManager'
import { LocalHydrationCoordinator, type LocalHydrationPhases } from './localHydrationCoordinator'
import { yieldToQuantumChatHost } from './cooperativeScheduler'
import {
  type HiddenControlSyncSource,
  syncDirectDisappearingTimerState,
  syncDirectHiddenControlState,
} from './hiddenControlSync'
import {
  applyStoredCryptoPaymentRequestSettlements,
  storeCryptoPaymentRequestSettlement,
} from './paymentRequestSettlements'
import { processMessageReceivedEvent } from './messageReceivedEvent'
import { createMessageDispatchQueue } from './messageDispatchQueue'
import { normalizeReplyReference } from './replyReference'
import {
  isIncomingDirectReadReceiptContentEligible,
  shouldSyncPersistedIncomingDirectReadReceipt,
} from './readReceiptPolicy'
import { applyIncomingDirectConversationDelete } from './directConversationCleanup'
import {
  groupPendingDirectMessagesByConversation,
  isRealtimeDirectPollFastPath,
  prioritizePendingDirectMessageGroups,
  shouldContinueDirectBurstPolling,
  shouldPollGroupsWithDirectCycle,
  type DirectMessagePollSource,
} from './directMessagePolling'
import {
  buildIncomingDirectChatMessage,
  buildLockedViewOnceChatMessage,
  getDirectSenderDisplayName,
  getIncomingDirectOrderTimestamp,
} from './directMessageProjection'
import {
  authorizeViewOnceConsumption,
  type ViewOnceConsumptionSource,
} from './viewOnceConsumption'
import { isActiveDirectThread } from './directActiveThread'
import {
  BundleHealthCoordinator,
  type BundleHealthReason,
} from './bundleHealthCoordinator'
import { ReconcileScheduler } from './reconcileScheduler'
import { RelayRetryScheduler, type RelayRetryOutcome } from './relayRetryScheduler'
import {
  mergeChatReconcileOptions,
  type ChatReconcileOptions,
} from './chatReconcileOptions'
import {
  evaluateForegroundMailboxCatchup,
  FOREGROUND_RECONCILE_DEBOUNCE_MS,
  isForegroundMailboxStale,
} from './foregroundMailboxCatchup'
import {
  resolveRelayFetchAfterSequence,
  shouldReplayMailboxFromZero,
} from './relayMailboxCursor'
import {
  StaleWalletRuntimeError,
  WalletRuntimeController,
  type WalletRuntimeLease,
} from './walletRuntime'
import {
  deleteDirectMessagesAndReconcile,
  DIRECT_UNREAD_PROJECTION_VERSION,
  markDirectMessageReadAndReconcile,
  markDirectUnreadProjectionDirty,
  migrateLegacyDirectMessageBucket,
  reconcileAllDirectUnreadStates,
  reconcileDirectUnreadState,
} from './directUnreadState'
import {
  clearBundleRegistrationCache,
  clearTransportReadinessChecks,
  getCachedBundleRegistration,
  rememberBundleRegistration,
  runBundleRegistrationCheck,
  runTransportReadinessCheck,
} from './readinessCache'
import { projectBLEOutboundDelivery } from './bleDeliveryProjection'

const DIRECT_EXPIRY_SWEEP_MIN_DELAY_MS = 1_000
const DIRECT_EXPIRY_SWEEP_IDLE_DELAY_MS = 5_000
const DIRECT_EXPIRY_SWEEP_MAX_DELAY_MS = 30_000
const DIRECT_EXPIRY_DELETE_CONCURRENCY = 4
const DIRECT_EXPIRY_SCAN_PAGE_SIZE = 40
const localHydrationCoordinator = new LocalHydrationCoordinator()

export {
  ContactIdentityChangeError,
  acceptContactIdentityReplacement,
  addContact,
  addContactByInvite,
  addContactByAddress,
  assertContactIdentityTrusted,
  getPendingContactIdentityReplacement,
  lockConversationIdentityReplacement,
  verifyContactBundle,
} from './contactManager'
export type { ContactIdentityReplacement } from './contactManager'

const {
  recentlyProcessedMessageIds,
  MAX_PROCESSED_IDS,
  decryptionFailureCounts,
  MAX_BURST_POLLS,
  IDENTITY_RESOLUTION_CACHE_TTL_MS,
  MAX_CONSECUTIVE_FAILURES,
  FAILURE_COUNT_RESET_MS,
  walletAddressByIdentityCache,
  verifiedContactBundleCache,
  eventUnsubscribers,
} = S

let chatClient = S.chatClient
let chatIdentity = S.chatIdentity
let activeConversationHandle = S.activeConversationHandle
let bundleServer = S.bundleServer
let authSessionUnsubscribe = S.authSessionUnsubscribe
let directExpirySweepTimer = S.directExpirySweepTimer
let directExpirySweepInFlight = false
let directExpirySweepActive = false
let lastLocalOrderTimestamp = 0
let initializationPromise = S.initializationPromise
let lastKnownAppState = S.lastKnownAppState
let lastForegroundReconcileRequestedAt = 0
let lastBackgroundedAt = 0
let foregroundReconcileInFlight = false
let pendingForegroundReconcile: {
  fullResync: boolean
  restartRealtime: boolean
  backgroundedMs: number
} | null = null
let identityReady = false
let identityReadyWaiters: Array<(ready: boolean) => void> = []
type CachedIdentityResolutionEntry = S.CachedIdentityResolutionEntry
const CLOUD_AUTH_LOG_PREFIX = '[CloudAuth]'
const BUNDLE_HEALTH_COALESCE_TTL_MS = 2 * 60 * 1000
const INCOMING_MESSAGE_DISPATCH_CONCURRENCY = 2
const INCOMING_MESSAGE_YIELD_EVERY = 8
const CATCHUP_DISPATCH_BATCH_SIZE = 8
const UNREAD_REPAIR_CONCURRENCY = 3
const CONVERSATION_REBUILD_YIELD_EVERY = 4
const OUTBOUND_STATUS_SYNC_FALLBACK_DELAY_MS = 1_500
const TOR_RELAY_RETRY_DELAYS_MS = [2_000, 10_000, 30_000] as const
let lastTokenAvailabilitySignature: string | null = null
let lastNotifiedBoundIdentityId: string | null = null
let localMessageIdCounter = 0
let outboundStatusSyncTimer: ReturnType<typeof setTimeout> | null = null
let outboundStatusSyncReason: string | null = null
const bundleHealthCoordinator = new BundleHealthCoordinator({
  ttlMs: BUNDLE_HEALTH_COALESCE_TTL_MS,
})
const walletRuntimeController = new WalletRuntimeController()

type QuantumChatRuntime = {
  lease: WalletRuntimeLease
  client: QuantumChat | null
  identity: ChatIdentity | null
  lastServerSequence: number
  pollPromise: Promise<MessagePollResult> | null
  pollStartedAt: number
  pollAbortController: AbortController | null
  activePollPriority: number
  queuedPollOptions: MessagePollOptions | null
  consecutiveBurstPolls: number
  lastGroupPollAt: number
  reconcileScheduler: ReconcileScheduler<ChatReconcileOptions>
  relayRetryScheduler: RelayRetryScheduler
}

let activeChatRuntime: QuantumChatRuntime | null = null

function isChatRuntimeCurrent(runtime: QuantumChatRuntime): boolean {
  return (
    activeChatRuntime === runtime
    && walletRuntimeController.isCurrent(runtime.lease)
    && matchesAccountStorageScope(
      useWalletStore.getState().wallet?.address,
      runtime.lease.walletScope,
    )
  )
}

function assertChatRuntimeCurrent(runtime: QuantumChatRuntime): void {
  if (!isChatRuntimeCurrent(runtime)) {
    throw new StaleWalletRuntimeError()
  }
}

async function restoreRelayMailboxCursor(runtime: QuantumChatRuntime): Promise<void> {
  const identityId = runtime.identity?.id
  if (!identityId) return
  try {
    const stored = await localChatStorage.getRelayMailboxCursor(identityId)
    if (Number.isSafeInteger(stored) && stored > 0) {
      runtime.lastServerSequence = Math.max(runtime.lastServerSequence, stored)
    }
  } catch {
    // Missing cursor stays at 0 and forces a from-zero catch-up.
  }
}

async function persistRelayMailboxCursor(runtime: QuantumChatRuntime): Promise<void> {
  const identityId = runtime.identity?.id
  if (identityId && Number.isSafeInteger(runtime.lastServerSequence) && runtime.lastServerSequence > 0) {
    try {
      await localChatStorage.storeRelayMailboxCursor(identityId, runtime.lastServerSequence)
    } catch {
      // Next start will from-zero catch-up if persist fails.
    }
  }
  const walletAddress = runtime.lease.walletScope
  if (!walletAddress) return
  try {
    const sequence = Number.isSafeInteger(runtime.lastServerSequence) && runtime.lastServerSequence > 0
      ? runtime.lastServerSequence
      : 0
    await persistPrefetchCursor(walletAddress, sequence)
    const notificationScopeId = await getOrCreateNotificationScopeId(walletAddress)
    await publishPrefetchSession({
      walletAddress,
      notificationScopeId,
      afterSequence: sequence,
    })
  } catch {
    // Prefetch cursor is advisory; decrypt still uses the relay cursor.
  }
}

function advanceRuntimeRelayCursor(runtime: QuantumChatRuntime, sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence <= runtime.lastServerSequence) return
  runtime.lastServerSequence = sequence
  void persistRelayMailboxCursor(runtime)
}

function createChatRuntime(walletAddress: string): QuantumChatRuntime {
  const lease = walletRuntimeController.begin(walletAddress)
  let runtime!: QuantumChatRuntime
  const reconcileScheduler = new ReconcileScheduler<ChatReconcileOptions>({
    merge: mergeChatReconcileOptions,
    run: (options) => runReconcilePass(runtime, options),
  })
  runtime = {
    lease,
    client: null,
    identity: null,
    lastServerSequence: 0,
    pollPromise: null,
    pollStartedAt: 0,
    pollAbortController: null,
    activePollPriority: 0,
    queuedPollOptions: null,
    consecutiveBurstPolls: 0,
    lastGroupPollAt: 0,
    reconcileScheduler,
    relayRetryScheduler: new RelayRetryScheduler(TOR_RELAY_RETRY_DELAYS_MS),
  }
  activeChatRuntime = runtime
  return runtime
}

function invalidateChatRuntime(): void {
  const runtime = activeChatRuntime
  activeChatRuntime = null
  runtime?.reconcileScheduler.clearPending()
  if (runtime) {
    runtime.relayRetryScheduler.clear()
    runtime.pollAbortController?.abort()
    clearTransportReadinessChecks(runtime.lease.generation)
    runtime.queuedPollOptions = null
    clearAttachmentHydrationRuntime(
      runtime.lease.walletScope,
      runtime.lease.generation,
    )
  }
  walletRuntimeController.invalidate()
}

function createLocalMessageId(timestamp: number = Date.now()): string {
  localMessageIdCounter = (localMessageIdCounter + 1) % Number.MAX_SAFE_INTEGER
  return `local:${timestamp}:${localMessageIdCounter.toString(36)}`
}

function getActiveLocalConversationContext(): Pick<Conversation, 'localIdentityId' | 'localWalletAddress' | 'localDisplayName'> {
  const wallet = useWalletStore.getState().wallet
  return {
    localIdentityId: chatIdentity?.id ?? undefined,
    localWalletAddress: wallet?.address,
    localDisplayName: wallet?.displayName,
  }
}

function matchesLocalConversationContext(
  conversation: Pick<Conversation, 'localIdentityId' | 'localWalletAddress'>,
  context: Pick<Conversation, 'localIdentityId' | 'localWalletAddress'>,
): boolean {
  if (context.localWalletAddress) {
    return matchesAccountStorageScope(conversation.localWalletAddress, context.localWalletAddress)
  }

  if (context.localIdentityId) {
    return !conversation.localIdentityId || conversation.localIdentityId === context.localIdentityId
  }

  return true
}

function buildLocalConversationKey(
  localWalletAddress: string | null | undefined,
  remoteValue: string,
): string {
  return `${localWalletAddress || 'legacy'}:${remoteValue}`
}

function setChatClientState(nextChatClient: QuantumChat | null): void {
  chatClient = nextChatClient
  S.setChatClient(nextChatClient)
}

function setChatIdentityState(nextChatIdentity: ChatIdentity | null): void {
  chatIdentity = nextChatIdentity
  S.setChatIdentity(nextChatIdentity)
}

function setActiveConversationHandleState(nextHandle: ConversationHandle | null): void {
  activeConversationHandle = nextHandle
  S.setActiveConversationHandle(nextHandle)
}

function setBundleServerState(nextBundleServer: S.RuntimeBundleServer | null): void {
  bundleServer = nextBundleServer
  S.setBundleServer(nextBundleServer)
}

function setAuthSessionUnsubscribeState(nextUnsubscribe: (() => void) | null): void {
  authSessionUnsubscribe = nextUnsubscribe
  S.setAuthSessionUnsubscribe(nextUnsubscribe)
}

function setInitializationPromiseState(nextPromise: Promise<boolean> | null): void {
  initializationPromise = nextPromise
  S.setInitializationPromise(nextPromise)
}

function setDirectExpirySweepTimerState(
  nextTimer: ReturnType<typeof setTimeout> | null,
): void {
  directExpirySweepTimer = nextTimer
  S.setDirectExpirySweepTimer(nextTimer)
}

function logTokenAvailability(details: Record<string, unknown>): void {
  if (!__DEV__) return
  const { expiresInMs: _expiresInMs, ...stableDetails } = details
  const signature = JSON.stringify(stableDetails)
  if (signature === lastTokenAvailabilitySignature) {
    return
  }
  lastTokenAvailabilitySignature = signature
  console.log(CLOUD_AUTH_LOG_PREFIX, 'getCurrentBackendSessionToken', details)
}

function describeDiagnosticError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getRelayTransportPath(kind: 'relay' | 'ble_mesh' = 'relay'): string {
  if (kind === 'relay') {
    return useTorStore.getState().enabled ? 'tor_relay' : 'direct_relay'
  }

  return kind
}

function isBleDirectRoute(route: Awaited<ReturnType<typeof getBLETransportRoute>>): boolean {
  return route?.route === 'ble' && route.bleAvailable
}

function recordServiceDiagnostic(
  scope: string,
  name: string,
  fields: Record<string, TelemetryFieldValue> = {},
): void {
  recordChatDiagnostic(scope, name, {
    torEnabled: useTorStore.getState().enabled,
    ...fields,
  })
}

function scheduleOutboundStatusSyncFallback(
  reason: string,
  delayMs: number = OUTBOUND_STATUS_SYNC_FALLBACK_DELAY_MS,
): void {
  if (reason.endsWith('_relay_accepted')) {
    requestPostSendCatchup()
  }

  if (!chatClient) {
    return
  }

  outboundStatusSyncReason = reason
  if (outboundStatusSyncTimer) {
    recordChatOperationalCounter('duplicate', 'outbound_status_sync_coalesced')
    recordServiceDiagnostic('send', 'outbound_status_sync_coalesced', {
      reason,
      delayMs,
      transportPath: getRelayTransportPath(),
    })
    return
  }

  recordServiceDiagnostic('send', 'outbound_status_sync_scheduled', {
    reason,
    delayMs,
    transportPath: getRelayTransportPath(),
  })

  outboundStatusSyncTimer = setTimeout(() => {
    const pendingReason = outboundStatusSyncReason ?? reason
    outboundStatusSyncTimer = null
    outboundStatusSyncReason = null
    requestOutboundStatusSync(pendingReason)
  }, delayMs)
}

function recordAttachmentPipelineStage(
  context: AttachmentPipelineTraceContext | null,
  stage: Parameters<typeof buildAttachmentPipelineFields>[0],
  extraFields: Record<string, TelemetryFieldValue> = {},
): void {
  if (!context?.attachmentSendId) {
    return
  }

  recordServiceDiagnostic(
    'send',
    ATTACHMENT_PIPELINE_EVENT_NAME,
    buildAttachmentPipelineFields(stage, context, extraFields),
  )
}

function recordAttachmentPipelineFailure(
  context: AttachmentPipelineTraceContext | null,
  failureFields: Parameters<typeof buildAttachmentPipelineFailureFields>[1],
): void {
  if (!context?.attachmentSendId) {
    return
  }

  recordServiceDiagnostic(
    'send',
    ATTACHMENT_PIPELINE_FAILURE_EVENT_NAME,
    buildAttachmentPipelineFailureFields(context, failureFields),
  )
}

function uniqueSortedIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((value): value is string => Boolean(value)))].sort()
}

function getCurrentBackendSessionToken(): string | null {
  const authState = useAuthStore.getState()
  const session = authState.session
  const expiresInMs = session?.expiresAt ? session.expiresAt - Date.now() : null
  const accessToken = getCachedBackendAccessToken()

  if (!accessToken) {
    logTokenAvailability({
      result: 'no_token',
      isCloudAuthVerified: authState.isCloudAuthVerified,
      hasSession: Boolean(session),
      expiresInMs,
    })
    return null
  }

  logTokenAvailability({
    result: 'verified_token',
    isCloudAuthVerified: authState.isCloudAuthVerified,
    hasSession: true,
    expiresInMs,
  })
  return accessToken
}

export function syncBundleServerAccessToken(): void {
  const accessToken = getCurrentBackendSessionToken()
  bundleServer?.setAccessToken(accessToken)
  chatClient?.setServerAccessToken(accessToken)
}

async function ensureBoundChatTransportAccess(
  runtime: QuantumChatRuntime,
  identityId: string,
): Promise<boolean> {
  assertChatRuntimeCurrent(runtime)
  return runTransportReadinessCheck(runtime.lease.generation, identityId, async () => {
    rehydratePersistedBoundIdentityCache(identityId)
    if (
      hasBoundBackendAccessForIdentity(identityId) &&
      getCurrentBackendSessionToken()
    ) {
      return true
    }

    try {
      await ensureBoundBackendAccessForIdentity(identityId)
    } catch {
      // Let the caller choose fallback behavior.
    }

    assertChatRuntimeCurrent(runtime)
    syncBundleServerAccessToken()
    return Boolean(
      hasBoundBackendAccessForIdentity(identityId) &&
      getCurrentBackendSessionToken(),
    )
  })
}

export async function prewarmDirectChatTransportAccess(): Promise<boolean> {
  const runtime = activeChatRuntime
  if (
    !runtime
    || !runtime.identity
    || !isChatRuntimeCurrent(runtime)
    || !isRemoteChatServiceAvailable()
  ) {
    return false
  }

  return runtime.lease.track(ensureBoundChatTransportAccess(runtime, runtime.identity.id))
}

function ensureBundleServerAuthSync(): void {
  if (authSessionUnsubscribe) {
    return
  }

  setAuthSessionUnsubscribeState(useAuthStore.subscribe((state, previousState) => {
    syncBundleServerAccessToken()

    const hasAccess = Boolean(
      state.isCloudAuthVerified
        && state.session
        && state.session.expiresAt > Date.now()
    )
    const hadAccess = Boolean(
      previousState.isCloudAuthVerified
        && previousState.session
        && previousState.session.expiresAt > Date.now()
    )
    const identityBindingBecameReady = Boolean(
      state.isIdentityBound &&
      (
        !previousState.isIdentityBound ||
        state.session?.identityId !== previousState.session?.identityId
      )
    )
    const boundIdentityId = (
      state.isIdentityBound
      && state.session?.identityId
      && hasBoundBackendAccessForIdentity(state.session.identityId)
    ) ? state.session.identityId : null
    const boundAccessBecameReady = Boolean(
      boundIdentityId && boundIdentityId !== lastNotifiedBoundIdentityId
    )
    lastNotifiedBoundIdentityId = boundIdentityId

    if (hasAccess && (!hadAccess || identityBindingBecameReady || boundAccessBecameReady)) {
      if (activeChatRuntime && isChatRuntimeCurrent(activeChatRuntime)) {
        scheduleMediaSendCleanup(activeChatRuntime.lease.walletScope)
      }
      if (!initializationPromise) {
        void loadConversations().catch(() => {})
      }

      catchUpMailboxForBoundSession()
      void ensureBundleHealth('manual_recovery').catch(() => {})
    } else if (!hasAccess && hadAccess) {
      stopRealtimeSubscription()
    } else if (
      hasAccess
      && state.session?.accessToken !== previousState.session?.accessToken
    ) {
      catchUpMailboxForBoundSession()
    }
  }))
}

function getEnvelopeBody(envelope: ParsedEnvelope): string {
  if (envelope.type === 'text') {
    return envelope.text
  }
  if (envelope.type === 'view_once') {
    return envelope.body
  }
  if (envelope.type === 'crypto_payment_request') {
    return JSON.stringify(envelope.request)
  }
  if (envelope.type === 'plain') {
    return envelope.text
  }
  if (envelope.type === 'screenshot_taken') {
    return SCREENSHOT_TAKEN_NOTICE_TEXT
  }
  return ''
}

async function updatePaymentRequestLastMessagePreview(
  conversationId: string,
  timestamp: number,
  content: string,
  senderId?: string,
): Promise<void> {
  const { preview } = buildDirectMessagePreview(content, undefined, {
    isOwn: Boolean(chatIdentity?.id && senderId === chatIdentity.id),
  })
  const store = useChatStore.getState()
  const conversation = store.conversations.find((entry) => entry.id === conversationId)
  if (conversation?.lastMessage?.timestamp === timestamp) {
    store.updateConversation(conversationId, {
      lastMessage: {
        content: preview,
        timestamp,
        isOwn: conversation.lastMessage.isOwn,
      },
    })
  }
  const storedConversation = await localChatStorage.getConversation(conversationId).catch(() => null)
  if (storedConversation?.lastMessage?.timestamp === timestamp) {
    await localChatStorage.updateConversation(conversationId, {
      lastMessage: {
        content: preview,
        timestamp,
        senderId: storedConversation.lastMessage.senderId,
      },
    }).catch(() => {})
  }
}

export async function applyCryptoPaymentRequestUpdate(
  update: CryptoPaymentRequestUpdate,
  options: { conversationId?: string } = {},
): Promise<boolean> {
  const store = useChatStore.getState()
  const inMemoryCandidateSets = update.requestMessageId
    ? [
        store.messages.filter((message) => message.id === update.requestMessageId),
        store.messages.filter((message) => message.id !== update.requestMessageId),
      ]
    : [store.messages]

  for (const candidates of inMemoryCandidateSets) {
    for (const message of candidates) {
      const nextContent = applyCryptoPaymentRequestUpdateToContent(message.content || '', update)
      if (!nextContent) continue

      await storeCryptoPaymentRequestSettlement(message.conversationId, update).catch((error) => {
        console.warn('[QuantumChat] Failed to persist payment request settlement:', error)
      })
      store.updateMessage(message.id, { content: nextContent })
      await localChatStorage.updateDecryptedMessage(message.id, { content: nextContent }).catch(() => {})
      await updatePaymentRequestLastMessagePreview(message.conversationId, message.timestamp, nextContent, message.senderId)
      return true
    }
  }

  if (!options.conversationId) return false

  const storedMessages = await localChatStorage.getDecryptedMessages(options.conversationId).catch(() => [])
  const storedCandidateSets = update.requestMessageId
    ? [
        storedMessages.filter((message) => message.id === update.requestMessageId),
        storedMessages.filter((message) => message.id !== update.requestMessageId),
      ]
    : [storedMessages]

  for (const candidates of storedCandidateSets) {
    for (const stored of candidates) {
      const nextContent = applyCryptoPaymentRequestUpdateToContent(stored.content || '', update)
      if (!nextContent) continue

      await storeCryptoPaymentRequestSettlement(options.conversationId, update).catch((error) => {
        console.warn('[QuantumChat] Failed to persist payment request settlement:', error)
      })
      await localChatStorage.updateDecryptedMessage(stored.id, { content: nextContent }).catch(() => {})
      await updatePaymentRequestLastMessagePreview(
        options.conversationId,
        (stored as { createdAt?: number; timestamp?: number }).createdAt ?? (stored as { timestamp?: number }).timestamp ?? Date.now(),
        nextContent,
        stored.senderId,
      )
      return true
    }
  }

  return false
}

function getEnvelopeReplyReference(
  envelope: ParsedEnvelope,
): ChatMessage['replyTo'] | undefined {
  if (envelope.type === 'text' || envelope.type === 'view_once') {
    return envelope.replyTo
  }
  return undefined
}

function getEnvelopeSystemEvent(envelope: ParsedEnvelope): ChatMessage['systemEvent'] | undefined {
  return envelope.type === 'screenshot_taken' ? 'screenshot_taken' : undefined
}

function getEnvelopeOneTimeState(
  envelope: ParsedEnvelope,
): ChatMessage['oneTime'] | undefined {
  if (envelope.type !== 'view_once') {
    return undefined
  }
  return createLockedOneTimeMessage(envelope.kind)
}

function getStoredOneTimeState(
  message: Pick<DecryptedMessage, 'messageKind' | 'oneTime'>,
): ChatMessage['oneTime'] | undefined {
  if (message.messageKind !== 'view_once' || !message.oneTime) {
    return undefined
  }

  if (message.oneTime.state === 'consumed') {
    return {
      kind: message.oneTime.kind ?? 'text',
      state: 'consumed',
      consumedAt: message.oneTime.consumedAt,
    }
  }

  if (message.oneTime.requiresReveal) {
    return createLockedGenericOneTimeMessage()
  }

  return createLockedOneTimeMessage(message.oneTime.kind ?? 'text')
}

function isStoredLockedViewOncePlaceholder(
  message: Pick<DecryptedMessage, 'messageKind' | 'oneTime'>,
): boolean {
  return Boolean(
    message.messageKind === 'view_once'
    && message.oneTime?.state === 'locked'
    && message.oneTime.requiresReveal,
  )
}

function annotateViewOnceAttachments(
  attachments: MediaAttachment[] | undefined,
  oneTime: ChatMessage['oneTime'] | undefined,
): MediaAttachment[] | undefined {
  if (!attachments?.length || !oneTime) {
    return attachments
  }

  return attachments.map((attachment) => ({
    ...attachment,
    isViewOnce: true,
  }))
}

function getCurrentSpectrePolicyState() {
  const spectreState = useSpectreStore.getState()
  const { wallet } = useWalletStore.getState()
  return {
    enabled: spectreState.enabled,
    accountMode: spectreState.spectreAccountMode,
    walletIsSpectre: wallet?.spectreMode === true,
  }
}

function shouldBlockIncomingMediaInSpectre(): boolean {
  const state = getCurrentSpectrePolicyState()
  return isSpectrePolicyActive(state) && !canReceiveMediaInSpectre(state)
}

function createSpectreBlockedMediaAttachments(
  attachments: MediaAttachment[] | undefined,
): MediaAttachment[] | undefined {
  if (!attachments?.length) {
    return attachments
  }

  return attachments.map((attachment) => ({
    ...attachment,
    uri: '',
    source: SPECTRE_BLOCKED_MEDIA_SOURCE,
    thumbnail: undefined,
    isEncrypted: false,
  }))
}

function mapDisappearingTimerToStored(
  timer?: DisappearingMessageTimer | null,
): StoredDisappearingMessageTimer | null | undefined {
  const normalized = normalizeDisappearingTimer(timer ?? null)
  if (!normalized) {
    return timer === null ? null : undefined
  }

  return {
    durationMs: normalized.durationMs,
    trigger: normalized.trigger,
    fallbackDurationMs: normalized.fallbackDurationMs,
    updatedAt: normalized.updatedAt,
    updatedBy: normalized.updatedBy,
  }
}

function mapStoredDisappearingTimer(
  timer?: StoredDisappearingMessageTimer | null,
): DisappearingMessageTimer | null {
  if (!timer) {
    return null
  }
  return normalizeDisappearingTimer(timer)
}

function getStoredRemoteSignalFields(raw: {
  remoteScreenshotProtection?: unknown
  remoteScreenshotProtectionUpdatedAt?: unknown
  remoteTorEnabled?: unknown
  remoteTorUpdatedAt?: unknown
}): Pick<
  Conversation,
  'remoteScreenshotProtection'
  | 'remoteScreenshotProtectionUpdatedAt'
  | 'remoteTorEnabled'
  | 'remoteTorUpdatedAt'
> {
  return {
    ...(typeof raw.remoteScreenshotProtection === 'boolean'
      ? { remoteScreenshotProtection: raw.remoteScreenshotProtection }
      : {}),
    ...(typeof raw.remoteScreenshotProtectionUpdatedAt === 'number'
      ? { remoteScreenshotProtectionUpdatedAt: raw.remoteScreenshotProtectionUpdatedAt }
      : {}),
    ...(typeof raw.remoteTorEnabled === 'boolean'
      ? { remoteTorEnabled: raw.remoteTorEnabled }
      : {}),
    ...(typeof raw.remoteTorUpdatedAt === 'number'
      ? { remoteTorUpdatedAt: raw.remoteTorUpdatedAt }
      : {}),
  }
}

function mapDisappearingStateToStored(
  state?: DisappearingMessageState,
): StoredDisappearingMessageState | undefined {
  if (!state || !isDisappearingTimerEnabled(state)) {
    return undefined
  }

  return {
    durationMs: state.durationMs,
    trigger: state.trigger,
    fallbackDurationMs: state.fallbackDurationMs,
    updatedAt: state.updatedAt,
    updatedBy: state.updatedBy,
    armedAt: state.armedAt,
    expiresAt: state.expiresAt,
    fallbackExpiresAt: state.fallbackExpiresAt,
    expiresFrom: state.expiresFrom,
  }
}

function mapStoredDisappearingState(
  state?: StoredDisappearingMessageState | null,
): DisappearingMessageState | undefined {
  if (!state) {
    return undefined
  }

  const normalized = normalizeDisappearingTimer(state)
  if (!normalized) {
    return undefined
  }

  return {
    ...normalized,
    armedAt: state.armedAt,
    expiresAt: state.expiresAt,
    fallbackExpiresAt: state.fallbackExpiresAt,
    expiresFrom: state.expiresFrom,
  }
}

function getEnvelopeDisappearingTimer(
  envelope: ParsedEnvelope,
): DisappearingMessageTimer | null {
  if (envelope.type === 'text' || envelope.type === 'view_once') {
    return normalizeDisappearingTimer(envelope.disappearing ?? null)
  }
  return null
}

function serializeDisappearingTimerForSync(
  timer?: DisappearingMessageTimer | null,
): string | null {
  const normalized = normalizeDisappearingTimer(timer ?? null)
  if (!normalized) {
    return null
  }

  return JSON.stringify({
    durationMs: normalized.durationMs,
    trigger: normalized.trigger,
    fallbackDurationMs: normalized.fallbackDurationMs ?? null,
  })
}

async function persistDirectConversationDisappearingTimer(
  conversationId: string,
  timer: DisappearingMessageTimer | null,
): Promise<void> {
  useChatStore.getState().updateConversation(conversationId, {
    disappearingTimer: timer,
  })

  await localChatStorage.updateConversation(conversationId, {
    disappearingTimer: mapDisappearingTimerToStored(timer),
  }).catch(() => {})
}

async function applyIncomingDirectDisappearingTimer(
  conversationId: string,
  remoteIdentityId: string,
  timer: DisappearingMessageTimer | null,
  updatedAt: number,
  updatedBy?: string,
): Promise<void> {
  const currentConversation = useChatStore
    .getState()
    .conversations
    .find((conversation) => conversation.id === conversationId || conversation.remoteIdentityId === remoteIdentityId)

  const currentUpdatedAt = currentConversation?.disappearingTimer?.updatedAt ?? 0
  if (currentUpdatedAt > updatedAt) {
    return
  }

  const nextTimer = timer
    ? {
        ...timer,
        updatedAt,
        updatedBy: updatedBy ?? timer.updatedBy,
      }
    : null

  await persistDirectConversationDisappearingTimer(
    currentConversation?.id ?? conversationId,
    nextTimer,
  )
}

async function persistDirectMessageDisappearingState(
  messageId: string,
  state: DisappearingMessageState | undefined,
): Promise<void> {
  const storedState = mapDisappearingStateToStored(state)

  const [encryptedMessage, decryptedMessage] = await Promise.all([
    localChatStorage.getMessage(messageId).catch(() => null),
    localChatStorage.getDecryptedMessage(messageId).catch(() => null),
  ])

  if (encryptedMessage) {
    await localChatStorage.storeMessage({
      ...encryptedMessage,
      ...(storedState ? { disappearing: storedState } : { disappearing: undefined }),
    }).catch(() => {})
  }

  if (decryptedMessage) {
    await localChatStorage.updateDecryptedMessage(messageId, {
      disappearing: storedState,
    }).catch(() => {})
  }
}

async function persistDirectMessageLocalOrderTimestamp(
  messageId: string,
  localOrderTimestamp: number,
): Promise<void> {
  const [encryptedMessage, decryptedMessage] = await Promise.all([
    localChatStorage.getMessage(messageId).catch(() => null),
    localChatStorage.getDecryptedMessage(messageId).catch(() => null),
  ])

  await Promise.allSettled([
    encryptedMessage
      ? localChatStorage.storeMessage({
          ...encryptedMessage,
          localOrderTimestamp,
        })
      : Promise.resolve(),
    decryptedMessage
      ? localChatStorage.updateDecryptedMessage(messageId, { localOrderTimestamp })
      : Promise.resolve(),
  ])
}

function createLocalOrderTimestamp(baseTimestamp: number = Date.now()): number {
  const nextTimestamp = Math.max(baseTimestamp, lastLocalOrderTimestamp + 1)
  lastLocalOrderTimestamp = nextTimestamp
  return nextTimestamp
}

function getStoredMessageOrderTimestamp(message: { localOrderTimestamp?: number; timestamp?: number; createdAt?: number }): number {
  return message.localOrderTimestamp ?? message.timestamp ?? message.createdAt ?? 0
}

function isOwnStoredDirectMessage(message: { localIdentityId?: string; senderId?: string }): boolean {
  return Boolean(message.localIdentityId && message.senderId === message.localIdentityId)
}

function compareStoredMessagesForDisplay(a: any, b: any): number {
  if (!isOwnStoredDirectMessage(a) && !isOwnStoredDirectMessage(b) && a.serverSequence && b.serverSequence) {
    const sequenceDelta = a.serverSequence - b.serverSequence
    if (sequenceDelta !== 0) return sequenceDelta
  }

  const orderDelta = getStoredMessageOrderTimestamp(a) - getStoredMessageOrderTimestamp(b)
  if (orderDelta !== 0) return orderDelta

  const sequenceDelta = (a.serverSequence ?? 0) - (b.serverSequence ?? 0)
  if (sequenceDelta !== 0) return sequenceDelta

  const timestampDelta = (a.timestamp ?? 0) - (b.timestamp ?? 0)
  if (timestampDelta !== 0) return timestampDelta

  return String(a.id ?? '').localeCompare(String(b.id ?? ''))
}

function createOutgoingDirectDisappearingState(
  timer: DisappearingMessageTimer | null,
  sentAt: number,
): DisappearingMessageState | undefined {
  if (!isDisappearingTimerEnabled(timer)) {
    return undefined
  }

  return createMessageDisappearingState(timer, {
    sentAt,
    applyFallback: timer.trigger === 'after_read',
  })
}

function createIncomingDirectDisappearingState(
  timer: DisappearingMessageTimer | null,
  sentAt: number,
): DisappearingMessageState | undefined {
  if (!isDisappearingTimerEnabled(timer)) {
    return undefined
  }

  const receiptPolicy = getCachedReceiptPreferences()
  const shouldUseSendFallback = timer.trigger === 'after_send'
    || (timer.trigger === 'after_read' && !receiptPolicy.readReceiptsEnabled)

  return createMessageDisappearingState(timer, {
    sentAt,
    startOnSend: shouldUseSendFallback,
    applyFallback: shouldUseSendFallback,
  })
}

async function armDirectMessageOnRead(
  messageId: string,
  readAt: number = Date.now(),
): Promise<void> {
  const store = useChatStore.getState()
  const inMemoryMessage = store.messages.find((message) => message.id === messageId)
  const currentState = inMemoryMessage?.disappearing
    ?? mapStoredDisappearingState((await localChatStorage.getDecryptedMessage(messageId).catch(() => null))?.disappearing)
    ?? mapStoredDisappearingState((await localChatStorage.getMessage(messageId).catch(() => null))?.disappearing)

  const nextState = armDisappearingMessageOnRead(currentState, readAt)
  if (!nextState) {
    return
  }

  if (inMemoryMessage) {
    store.updateMessage(messageId, {
      disappearing: nextState,
    })
  }

  await persistDirectMessageDisappearingState(messageId, nextState)
}

export async function armDirectConversationMessagesOnLocalRead(
  conversationId: string,
  localIdentityId?: string | null,
): Promise<void> {
  const readAt = Date.now()
  const store = useChatStore.getState()
  const inMemoryMessages = store.messages.filter((message) =>
    message.conversationId === conversationId
    && message.senderId !== localIdentityId
    && message.disappearing?.trigger === 'after_read'
    && !message.disappearing.expiresAt
  )

  for (const message of inMemoryMessages) {
    const nextState = armDisappearingMessageOnRead(message.disappearing, readAt)
    if (!nextState) {
      continue
    }
    store.updateMessage(message.id, {
      disappearing: nextState,
    })
  }

  await Promise.allSettled(
    inMemoryMessages.map((message) =>
      persistDirectMessageDisappearingState(
        message.id,
        armDisappearingMessageOnRead(message.disappearing, readAt),
      )
    )
  )

  const storedMessages = await localChatStorage.getDecryptedMessages(conversationId).catch(() => [])
  await Promise.allSettled(
    storedMessages
      .filter((message) => message.senderId !== localIdentityId)
      .map(async (message) => {
        const nextState = armDisappearingMessageOnRead(
          mapStoredDisappearingState(message.disappearing),
          readAt,
        )
        if (!nextState) {
          return
        }
        await persistDirectMessageDisappearingState(message.id, nextState)
      })
  )
}

async function markActiveIncomingDirectMessageRead(
  message: Pick<StoredMessage, 'id' | 'relayMessageId' | 'messageKind' | 'oneTime' | 'content'>,
  options: {
    conversationId: string
    localIdentityId?: string | null
    localWalletAddress?: string | null
    isCallInvite?: boolean
  },
): Promise<void> {
  const readReceiptsEnabled = getCachedReceiptPreferences().readReceiptsEnabled
  const relayReadReceiptEligible =
    readReceiptsEnabled
    && isIncomingDirectReadReceiptContentEligible(message, options)
  useChatStore.getState().updateMessage(message.id, {
    status: 'read',
    deliveryStage: 'read',
    deliveryHint: 'Read',
  })
  await armDirectMessageOnRead(message.id, Date.now()).catch(() => {})
  await markDirectMessageReadAndReconcile({
    messageId: message.id,
    conversationId: options.conversationId,
    localIdentityId: options.localIdentityId,
    localWalletAddress: options.localWalletAddress,
    relayReadReceiptEligible,
  })

  const storedMessage = await localChatStorage.getMessage(message.id).catch(() => null)
  if (
    !chatClient
    || !readReceiptsEnabled
    || !storedMessage
    || !shouldSyncPersistedIncomingDirectReadReceipt(storedMessage, options)
  ) {
    return
  }
  await chatClient.markRelayMessageRead(storedMessage.relayMessageId!)
}

async function markIncomingDirectMessageReadIfActive(
  message: Pick<StoredMessage, 'id' | 'relayMessageId' | 'messageKind' | 'oneTime' | 'content'>,
  options: {
    conversationId: string
    projectedConversationId?: string | null
    migratedConversationId?: string | null
    senderIdentityId: string
    senderWalletAddress?: string | null
    localConversationContext?: ReturnType<typeof getActiveLocalConversationContext>
    isCallInvite?: boolean
  },
): Promise<boolean> {
  if (AppState.currentState !== 'active') {
    return false
  }
  const localConversationContext = options.localConversationContext
    ?? getActiveLocalConversationContext()
  const { activeConversationId, conversations } = useChatStore.getState()
  if (!isActiveDirectThread({
    activeConversationId,
    conversations,
    localConversationContext,
    conversationId: options.conversationId,
    projectedConversationId: options.projectedConversationId,
    migratedConversationId: options.migratedConversationId,
    senderIdentityId: options.senderIdentityId,
    senderWalletAddress: options.senderWalletAddress,
  })) {
    return false
  }

  await markActiveIncomingDirectMessageRead(message, {
    conversationId: options.projectedConversationId ?? options.conversationId,
    localIdentityId: localConversationContext.localIdentityId,
    localWalletAddress: localConversationContext.localWalletAddress,
    isCallInvite: options.isCallInvite,
  })
  return true
}

function buildDirectConversationPreviewFromStoredMessage(
  message: DecryptedMessage & { senderIdentityId?: string; deleted?: boolean },
  localIdentityId?: string | null,
): Conversation['lastMessage'] | null {
  if (
    message.deleted
    || message.messageKind === 'hidden_control'
    || hasDisappearingMessageExpired(mapStoredDisappearingState(message.disappearing))
  ) {
    return null
  }
  const senderId = message.senderId ?? message.senderIdentityId

  if (isStoredLockedViewOncePlaceholder(message)) {
    return {
      content: getViewOncePreviewLabel(message.oneTime?.kind ?? 'text'),
      timestamp: message.timestamp,
      isOwn: senderId === localIdentityId,
    }
  }

  const envelope = parseDirectEnvelope(message.content)
  if (isControlEnvelope(envelope)) {
    return null
  }

  const preview = buildDirectMessagePreview(message.content, undefined, {
    isOwn: senderId === localIdentityId,
  }).preview

  if (!preview) {
    return null
  }

  return {
    content: preview,
    timestamp: message.timestamp,
    isOwn: senderId === localIdentityId,
  }
}

async function refreshDirectConversationAfterExpiry(
  conversationId: string,
  runtime: QuantumChatRuntime,
): Promise<void> {
  assertChatRuntimeCurrent(runtime)
  const storedConversation = await localChatStorage.getConversation(conversationId).catch(() => null)
  assertChatRuntimeCurrent(runtime)
  if (!storedConversation) {
    return
  }

  const localIdentityId = runtime.identity?.id ?? storedConversation.localIdentityId
  const storedMessages = await localChatStorage.getDecryptedMessages(conversationId).catch(() => [])
  assertChatRuntimeCurrent(runtime)
  const visibleMessages = storedMessages
    .filter((message) => !(message as { deleted?: boolean }).deleted)
    .filter((message) => !hasDisappearingMessageExpired(mapStoredDisappearingState(message.disappearing)))
    .sort(compareStoredMessagesForDisplay)

  let lastMessage: Conversation['lastMessage'] | undefined
  for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
    const preview = buildDirectConversationPreviewFromStoredMessage(visibleMessages[index], localIdentityId)
    if (preview) {
      lastMessage = preview
      break
    }
  }

  useChatStore.getState().updateConversation(conversationId, {
    lastMessage,
    updatedAt: lastMessage?.timestamp ?? storedConversation.updatedAt,
  })

  await localChatStorage.updateConversation(conversationId, {
    lastMessage: lastMessage
      ? {
          content: lastMessage.content,
          timestamp: lastMessage.timestamp,
          senderId: lastMessage.isOwn ? localIdentityId : storedConversation.remoteIdentityId,
        }
      : undefined,
    updatedAt: lastMessage?.timestamp ?? storedConversation.updatedAt,
  }).catch(() => {})
  assertChatRuntimeCurrent(runtime)

  await reconcileDirectUnreadState({
    conversationId,
    localIdentityId,
    localWalletAddress: runtime.lease.walletScope,
  })
  assertChatRuntimeCurrent(runtime)
}

async function sweepExpiredDirectMessages(runtime: QuantumChatRuntime): Promise<number | null> {
  await yieldToQuantumChatHost()
  assertChatRuntimeCurrent(runtime)
  if (!runtime.identity) {
    return null
  }
  const localIdentityId = runtime.identity.id
  const localWalletAddress = runtime.lease.walletScope

  const conversations = await localChatStorage.getConversations(localIdentityId).catch(() => [])
  assertChatRuntimeCurrent(runtime)
  if (conversations.length === 0) {
    return null
  }

  const touchedConversationIds = new Set<string>()
  const expiredMessageIdsByConversation = new Map<string, string[]>()
  let nextExpiryAt: number | null = null
  const now = Date.now()

  for (let conversationIndex = 0; conversationIndex < conversations.length; conversationIndex += 1) {
    const conversation = conversations[conversationIndex]
    let before: number | undefined
    while (true) {
      const messages = await localChatStorage.getDecryptedMessages(conversation.id, {
        limit: DIRECT_EXPIRY_SCAN_PAGE_SIZE,
        before,
      }).catch(() => [])
      assertChatRuntimeCurrent(runtime)
      if (messages.length === 0) break
      for (const message of messages) {
        const disappearing = mapStoredDisappearingState(message.disappearing)
        const expiresAt = getDisappearingMessageExpiryTimestamp(disappearing)
        if (expiresAt == null) {
          continue
        }

        if (hasDisappearingMessageExpired(disappearing, now)) {
          touchedConversationIds.add(conversation.id)
          const messageIds = expiredMessageIdsByConversation.get(conversation.id) ?? []
          messageIds.push(message.id)
          expiredMessageIdsByConversation.set(conversation.id, messageIds)
          useChatStore.getState().removeMessage(message.id)
          continue
        }

        nextExpiryAt = nextExpiryAt == null ? expiresAt : Math.min(nextExpiryAt, expiresAt)
      }
      const nextBefore = Math.min(
        ...messages.map((message) => Number(message.timestamp)),
      )
      if (
        messages.length < DIRECT_EXPIRY_SCAN_PAGE_SIZE
        || !Number.isFinite(nextBefore)
        || nextBefore === before
      ) {
        break
      }
      before = nextBefore
      await yieldToQuantumChatHost()
      assertChatRuntimeCurrent(runtime)
    }
    if (conversationIndex + 1 < conversations.length) {
      await yieldToQuantumChatHost()
      assertChatRuntimeCurrent(runtime)
    }
  }

  await mapWithConcurrency(
    [...expiredMessageIdsByConversation.entries()],
    DIRECT_EXPIRY_DELETE_CONCURRENCY,
    async ([conversationId, messageIds]) => {
      await deleteDirectMessagesAndReconcile({
        conversationId,
        localIdentityId,
        localWalletAddress,
        messageIds,
      })
      assertChatRuntimeCurrent(runtime)
      await Promise.allSettled(
        messageIds.map((messageId) => deleteCachedMediaForMessage(
          messageId,
          conversationId,
          runtime.lease.walletScope,
        )),
      )
      assertChatRuntimeCurrent(runtime)
    },
  )

  if (touchedConversationIds.size === 0) {
    return nextExpiryAt
  }

  await Promise.allSettled(
    [...touchedConversationIds].map((conversationId) =>
      refreshDirectConversationAfterExpiry(conversationId, runtime)
    )
  )
  assertChatRuntimeCurrent(runtime)
  syncGlobalBadge().catch(() => {})
  return nextExpiryAt
}

function getNextDirectExpirySweepDelayMs(nextExpiryAt: number | null): number {
  if (nextExpiryAt == null) {
    return DIRECT_EXPIRY_SWEEP_IDLE_DELAY_MS
  }

  return Math.min(
    Math.max(nextExpiryAt - Date.now(), DIRECT_EXPIRY_SWEEP_MIN_DELAY_MS),
    DIRECT_EXPIRY_SWEEP_MAX_DELAY_MS,
  )
}

function scheduleDirectExpirySweep(delayMs: number): void {
  if (directExpirySweepTimer) {
    clearTimeout(directExpirySweepTimer)
  }

  setDirectExpirySweepTimerState(setTimeout(() => {
    setDirectExpirySweepTimerState(null)
    if (directExpirySweepInFlight) {
      scheduleDirectExpirySweep(DIRECT_EXPIRY_SWEEP_MIN_DELAY_MS)
      return
    }

    const runtime = activeChatRuntime
    if (!runtime || !isChatRuntimeCurrent(runtime)) {
      return
    }
    directExpirySweepInFlight = true
    void runtime.lease.track(sweepExpiredDirectMessages(runtime))
      .then((nextExpiryAt) => {
        if (directExpirySweepActive && isChatRuntimeCurrent(runtime)) {
          scheduleDirectExpirySweep(getNextDirectExpirySweepDelayMs(nextExpiryAt))
        }
      })
      .catch((error) => {
        if (error instanceof StaleWalletRuntimeError) return
        console.warn('[QuantumChat] Failed to sweep expired direct messages:', error)
        if (directExpirySweepActive && isChatRuntimeCurrent(runtime)) {
          scheduleDirectExpirySweep(DIRECT_EXPIRY_SWEEP_IDLE_DELAY_MS)
        }
      })
      .finally(() => {
        directExpirySweepInFlight = false
      })
  }, delayMs))
}

function startDirectExpirySweep(): void {
  directExpirySweepActive = true
  if (directExpirySweepTimer || directExpirySweepInFlight) {
    return
  }

  scheduleDirectExpirySweep(DIRECT_EXPIRY_SWEEP_MIN_DELAY_MS)
}

function stopDirectExpirySweep(): void {
  directExpirySweepActive = false
  if (!directExpirySweepTimer) {
    return
  }
  clearTimeout(directExpirySweepTimer)
  setDirectExpirySweepTimerState(null)
}

function updateConversationByRemoteIdentity(
  remoteIdentityId: string,
  updates: Partial<Conversation>,
): void {
  const { conversations, updateConversation } = useChatStore.getState()
  const conversation = conversations.find((entry) => entry.remoteIdentityId === remoteIdentityId)

  if (conversation) {
    updateConversation(conversation.id, updates)
    void localChatStorage.updateConversation(conversation.id, updates as Partial<import('@spectra/core-crypto').Conversation>)
      .catch((error) => {
        if (__DEV__) {
          console.warn('[QuantumChat] Failed to persist remote control state:', error)
        }
      })
  }
}

function updateRemoteScreenshotProtection(
  remoteIdentityId: string,
  enabled: boolean,
  updatedAt: number,
): void {
  const conversation = useChatStore.getState().conversations.find(
    (entry) => entry.remoteIdentityId === remoteIdentityId,
  )
  const existingUpdatedAt = conversation?.remoteScreenshotProtectionUpdatedAt ?? 0
  if (updatedAt < existingUpdatedAt) {
    return
  }

  updateConversationByRemoteIdentity(remoteIdentityId, {
    remoteScreenshotProtection: enabled,
    remoteScreenshotProtectionUpdatedAt: updatedAt,
  })
}

function getCachedIdentityResolutionValue(
  cache: Map<string, CachedIdentityResolutionEntry>,
  key: string,
): string | null | undefined {
  const cached = cache.get(key)
  if (!cached) {
    return undefined
  }

  if (Date.now() - cached.checkedAt >= IDENTITY_RESOLUTION_CACHE_TTL_MS) {
    cache.delete(key)
    return undefined
  }

  return cached.value
}

function setCachedIdentityResolutionValue(
  cache: Map<string, CachedIdentityResolutionEntry>,
  key: string,
  value: string | null,
): void {
  cache.set(key, {
    value,
    checkedAt: Date.now(),
  })
}

function rememberResolvedWalletAddress(identityId: string, walletAddress: string): void {
  setCachedIdentityResolutionValue(walletAddressByIdentityCache, identityId, walletAddress)

  const store = useChatStore.getState()
  const existingContact = store.contacts.find((contact) => contact.identityId === identityId)
  if (existingContact && existingContact.walletAddress !== walletAddress) {
    store.updateContact(identityId, { walletAddress })
  }

  const existingConversation = store.conversations.find(
    (conversation) => conversation.remoteIdentityId === identityId
  )
  if (existingConversation && existingConversation.remoteWalletAddress !== walletAddress) {
    store.updateConversation(existingConversation.id, { remoteWalletAddress: walletAddress })
  }
}

async function resolveWalletAddressForIdentity(
  identityId: string,
  knownWalletAddress?: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (signal?.aborted) return null
  if (knownWalletAddress) {
    rememberResolvedWalletAddress(identityId, knownWalletAddress)
    return knownWalletAddress
  }

  const walletAddress = getCachedIdentityResolutionValue(
    walletAddressByIdentityCache,
    identityId,
  )

  if (walletAddress) {
    rememberResolvedWalletAddress(identityId, walletAddress)
  }

  return walletAddress ?? null
}

function clearIdentityResolutionCaches(): void {
  walletAddressByIdentityCache.clear()
  verifiedContactBundleCache.clear()
}

async function rekeyConversationArtifacts(
  sourceConversationId: string,
  targetConversationId: string,
): Promise<void> {
  if (!sourceConversationId || sourceConversationId === targetConversationId) {
    return
  }

  const store = useChatStore.getState()
  const hasSourceConversation = store.conversations.some((conversation) => conversation.id === sourceConversationId)
  const movedMessages = store.messages
    .filter((message) => message.conversationId === sourceConversationId)
    .map((message) => ({
      ...message,
      conversationId: targetConversationId,
    }))

  if (hasSourceConversation) {
    store.removeConversation(sourceConversationId)
  }

  if (movedMessages.length > 0) {
    store.mergeMessages(movedMessages, targetConversationId)
  }

  try {
    const localIdentityId = chatIdentity?.id
    const localWalletAddress = useWalletStore.getState().wallet?.address
    await Promise.all([
      markDirectUnreadProjectionDirty({
        conversationId: sourceConversationId,
        localIdentityId,
        localWalletAddress,
      }),
      markDirectUnreadProjectionDirty({
        conversationId: targetConversationId,
        localIdentityId,
        localWalletAddress,
      }),
    ])
    await localChatStorage.rekeyConversation(sourceConversationId, targetConversationId)
    await reconcileDirectUnreadState({
      conversationId: targetConversationId,
      localIdentityId,
      localWalletAddress,
    })
  } catch (error) {
    console.warn('[QuantumChat] Failed to rekey conversation artifacts:', error)
  }
}

// Initialization

export async function initializeQuantumChat(): Promise<boolean> {
  const { wallet } = useWalletStore.getState()
  
  if (!wallet) {
    if (__DEV__) console.log('QuantumChat: No wallet available')
    if (!identityReady) settleIdentityReady(false)
    return false
  }
  
  if (chatClient && activeChatRuntime && isChatRuntimeCurrent(activeChatRuntime)) {
    if (__DEV__) console.log('QuantumChat: Already initialized')
    settleIdentityReady(true)
    return true
  }
  
  if (initializationPromise) {
    const pendingInitialization = initializationPromise
    const pendingRuntime = activeChatRuntime
    if (
      pendingRuntime
      && matchesAccountStorageScope(pendingRuntime.lease.walletScope, wallet.address)
    ) {
      if (__DEV__) console.log('QuantumChat: Initialization already in progress, waiting...')
      return pendingInitialization
    }
    cleanupQuantumChat()
    await pendingInitialization.catch(() => false)
  } else if (chatClient || activeChatRuntime) {
    cleanupQuantumChat()
  }

  await walletRuntimeController.waitForIdle()
  if (!matchesAccountStorageScope(useWalletStore.getState().wallet?.address, wallet.address)) {
    if (!identityReady) settleIdentityReady(false)
    return false
  }
  if (
    initializationPromise
    && activeChatRuntime
    && matchesAccountStorageScope(activeChatRuntime.lease.walletScope, wallet.address)
  ) {
    return initializationPromise
  }
  if (chatClient && activeChatRuntime && isChatRuntimeCurrent(activeChatRuntime)) {
    settleIdentityReady(true)
    return true
  }

  const runtime = createChatRuntime(wallet.address)
  let task: Promise<boolean>
  task = (async () => {
    try {
      const initStartedAt = Date.now()
      recordCatchupTiming('init_begin', { t: initStartedAt })
      beginMailboxCatchupBanner()
      if (__DEV__) console.log('QuantumChat: Initializing...')

      initSubscriptionManager({
        pollForNewMessages,
        mergePendingMessagePoll: (options) => {
          if (!isChatRuntimeCurrent(runtime) || !runtime.pollPromise) return false
          runtime.queuedPollOptions = mergePollOptions(runtime.queuedPollOptions, options) || {}
          return true
        },
        processControlMessagesNow: () => runtime.lease.track((async () => {
          assertChatRuntimeCurrent(runtime)
          await runtime.client?.processControlMessagesNow()
          assertChatRuntimeCurrent(runtime)
        })()),
        pollForNewGroupMessages: () => runtime.lease.track((async () => {
          assertChatRuntimeCurrent(runtime)
          await pollForNewGroupMessages()
          assertChatRuntimeCurrent(runtime)
        })()),
        syncGroupConversations: (fullResync) => runtime.lease.track((async () => {
          assertChatRuntimeCurrent(runtime)
          await syncGroupConversations(fullResync)
          assertChatRuntimeCurrent(runtime)
        })()),
        syncOutboundRelayStatuses: (options) => runtime.lease.track((async () => {
          assertChatRuntimeCurrent(runtime)
          await runtime.client?.syncOutboundRelayStatuses(options)
          assertChatRuntimeCurrent(runtime)
        })()),
        applyOutboundRelayStatus: (relayMessageId, status) => runtime.lease.track((async () => {
          assertChatRuntimeCurrent(runtime)
          await runtime.client?.syncRelayedMessageStatus(relayMessageId, status)
          assertChatRuntimeCurrent(runtime)
        })()),
        reconcileQuantumChat: async (options) => {
          await reconcileQuantumChat(options as Parameters<typeof reconcileQuantumChat>[0])
        },
        syncBundleServerAccessToken,
        trackRuntimeTask: (runtimeTask) => runtime.lease.track(runtimeTask),
      })

      initContactManager({
        resolveWalletAddressForIdentity,
        fetchContactBundle,
        fetchDiscoverableContactBundle,
        fetchOneTimeContactCard,
        getCachedIdentityResolutionValue,
        rememberResolvedWalletAddress,
      })

      const torState = useTorStore.getState()
      const torPendingConnection = torState.enabled && torState.status !== 'connected'

      // Local initialization never starts cloud admission.
      const [initialBackendAccessToken] = await Promise.all([
        Promise.resolve(
          !torPendingConnection && SPECTRA_API_URL
            ? getCachedBackendAccessToken()
            : null,
        ),
        getReceiptPreferences().catch(() => getCachedReceiptPreferences()),
      ])
      assertChatRuntimeCurrent(runtime)
      
      const config: ChatConfig = {
        anonymous: false,
        identity: {
          address: wallet.address,
          publicKey: wallet.publicKey,
          privateKey: wallet.privateKey,
        },
        displayName: wallet.displayName || 'EXO User',
        preKeyCount: STARTUP_PREKEY_COUNT,
        security: {
          signedPreKeyRotationInterval: 2 * 24 * 60 * 60 * 1000, // 2 days
          maximumAllowedSignedPreKeyAge: 14 * 24 * 60 * 60 * 1000, // 14 days
          timestampTolerance: 2 * 60 * 1000, // 2 minutes
          maxUnansweredMessages: 100,
          enableHeaderEncryption: true,
        },
        server: undefined,
        minOPKCount: 20,
        autoPublishBundle: false,
        isTorEnabled: () => useTorStore.getState().enabled,
        isRemoteTransportAvailable: isRemoteChatServiceAvailable,
        prepareSessionOpkClaim: async ({ identityId, signal }) => {
          const requestorId = getIdentity()?.id
          if (!requestorId || requestorId === identityId) return null
          try {
            const result = await claimSessionOpk(identityId, requestorId, { signal })
            if (result.bundle.oneTimePreKeys.length > 0) return result.bundle
            return await localChatStorage.getPublicKeyBundle(identityId) ?? result.bundle
          } catch {
            return null
          }
        },
        getReceiptPolicy: getCachedReceiptPreferences,
        telemetry: {
          recordLatency: (scope, name, elapsedMs, fields) => {
            recordChatLatency(
              scope as Parameters<typeof recordChatLatency>[0],
              name,
              elapsedMs,
              fields as Parameters<typeof recordChatLatency>[3],
            )
          },
          startSpan: (scope, name, fields) =>
            startChatLatencySpan(
              scope as Parameters<typeof startChatLatencySpan>[0],
              name,
              fields as Parameters<typeof startChatLatencySpan>[2],
            ),
          recordDiagnostic: recordChatDiagnostic,
        },
        cooperativeScheduler: {
          yieldToHost: yieldToQuantumChatHost,
        },
      }
      
      // Local init only; no HTTP.
      const initializedChatClient = await QuantumChat.init(config)
      assertChatRuntimeCurrent(runtime)
      recordCatchupTiming('init_client_ready', {
        elapsedMs: Date.now() - initStartedAt,
      })
      const initializedIdentity = initializedChatClient.getIdentity()
      runtime.client = initializedChatClient
      runtime.identity = initializedIdentity
      await restoreRelayMailboxCursor(runtime)
      if (runtime.lastServerSequence > 0) {
        void persistRelayMailboxCursor(runtime)
      }
      setChatClientState(initializedChatClient)
      initializedChatClient.setServerAccessToken(initialBackendAccessToken)
      initializedChatClient.setServerTokenGetter(getCurrentBackendSessionToken)
      setChatIdentityState(initializedIdentity)
      scheduleMediaSendCleanup(runtime.lease.walletScope)
      if (!torPendingConnection && useTorStore.getState().enabled && initializedIdentity) {
        void runtime.lease.track(recoverPendingRelayDeliveries(runtime).catch((error) => {
          if (error instanceof StaleWalletRuntimeError) return
          recordServiceDiagnostic('send', 'service_retry_recovery_failed', {
            error: describeDiagnosticError(error),
          })
        }))
      }

      // Bundle discovery routes through Tor when connected.
      if (SPECTRA_API_URL) {
        const nextBundleServer = new BackendBundleServer(
          SPECTRA_API_URL,
          versionedBundleFetch,
          () => useTorStore.getState().enabled
            ? TOR_CONFIG.HTTP_TIMEOUT_MS
            : undefined,
        )
        nextBundleServer.setTokenGetter(getCurrentBackendSessionToken)
        nextBundleServer.setIdentityRecoveryHandler(async () => {
          const repaired = await repairBackendIdentityBinding(S.chatIdentity?.id)
          syncBundleServerAccessToken()
          return repaired?.accessToken ?? null
        })
        nextBundleServer.setAccessToken(initialBackendAccessToken)
        nextBundleServer.setTelemetry?.({
          recordLatency: (scope, name, elapsedMs, fields) => {
            recordChatLatency(
              scope as Parameters<typeof recordChatLatency>[0],
              name,
              elapsedMs,
              fields as Parameters<typeof recordChatLatency>[3],
            )
          },
          startSpan: (scope, name, fields) =>
            startChatLatencySpan(
              scope as Parameters<typeof startChatLatencySpan>[0],
              name,
              fields as Parameters<typeof startChatLatencySpan>[2],
            ),
          recordDiagnostic: recordChatDiagnostic,
        })
        setBundleServerState(nextBundleServer)
        initializedChatClient.setBundleServer(nextBundleServer)
        ensureBundleServerAuthSync()
      }
      
      if (__DEV__) console.log('QuantumChat: Initialized with identity:', initializedIdentity?.id)
      
      // Register listeners before loading data.
      setupEventListeners(runtime)

      const groupChatBootstrap = initializedIdentity && wallet.address
        ?         initializeGroupChat({
          identityId: initializedIdentity.id,
          walletAddress: wallet.address,
          allowLegacyMigration: wallet.spectreMode !== true,
          whenIdle: whenInitialMailboxCatchupSettled,
          sendDirectControlEnvelope: async (recipientIdentityId, envelope) => {
            const result = await sendMessage(recipientIdentityId, envelope)
            if (!result.success) {
              throw new Error(result.error || 'Failed to deliver group control message')
            }
          },
        }).catch((error) => {
          console.warn('[QuantumChat] Group chat bootstrap deferred:', error)
        })
        : Promise.resolve()

      const localHydration = ensureLocalChatHydration(wallet.address)
      await localHydration.baseReady
      assertChatRuntimeCurrent(runtime)
      recordCatchupTiming('init_hydration_ready', {
        elapsedMs: Date.now() - initStartedAt,
      })
      if (initializedIdentity?.id) {
        rehydratePersistedBoundIdentityCache(initializedIdentity.id)
      }
      const contactImport = syncContactsIntoChatClient(
        useChatStore.getState().contacts,
        wallet.address,
      )
      startMessagePolling()
      recordCatchupTiming('init_polling_started', {
        elapsedMs: Date.now() - initStartedAt,
      })
      advanceMailboxCatchupBanner('connecting')
      settleIdentityReady(true)
      assertChatRuntimeCurrent(runtime)
      const reuseHydration = Boolean(
        localConversationHydrationSnapshot
        && isSameAccountStorageScope(
          localConversationHydrationSnapshot.walletAddress,
          wallet.address,
        )
        && localConversationHydrationSnapshot.localIdentityId === initializedIdentity?.id
      )
      if (reuseHydration) {
        void runtime.lease.track((async () => {
          await whenInitialMailboxCatchupSettled()
          if (!isChatRuntimeCurrent(runtime)) return
          await loadConversations({ reuseLocalHydration: true })
        })().catch((error) => {
          if (error instanceof StaleWalletRuntimeError) return
          console.warn('[QuantumChat] Deferred conversation rematch failed:', error)
        }))
      } else {
        await loadConversations()
      }
      assertChatRuntimeCurrent(runtime)
      void runtime.lease.track(Promise.all([contactImport, groupChatBootstrap]).then(() => undefined))
      void runtime.lease.track((async () => {
        await whenInitialMailboxCatchupSettled()
        if (!isChatRuntimeCurrent(runtime)) return
        startDirectExpirySweep()
      })())

      if (!torPendingConnection) {
        void runtime.lease.track((async () => {
          await yieldToQuantumChatHost(undefined, { priority: 'background' })
          if (!isChatRuntimeCurrent(runtime)) return
          await ensureBundleHealth('initialization')
        })().catch((error) => {
          if (!isChatRuntimeCurrent(runtime)) return
          console.warn('[QuantumChat] Deferred bundle health check failed:', error)
        }))
      }

      // Resync push after bundle setup.
      void resyncActiveWalletPushRegistration('initialization')

      // Defer BLE until the first mailbox catch-up finishes.
      if (initializedIdentity) {
        void runtime.lease.track((async () => {
          await whenInitialMailboxCatchupSettled()
          if (!isChatRuntimeCurrent(runtime)) return
          recordCatchupTiming('deferred_ble_start', {
            elapsedMs: Date.now() - initStartedAt,
          })
          const myBundle = await initializedChatClient.getPublicKeyBundle()
          const identityWithKeys = await localChatStorage.getIdentity(initializedIdentity.id)
          assertChatRuntimeCurrent(runtime)
          if (!identityWithKeys?.dilithiumPrivateKey) {
            throw new Error('BLE identity signing key is unavailable')
          }
          const knownIdentities = useChatStore.getState().contacts
            .filter((contact) =>
              contact.publicKeyBundle
              && !contact.identityChanged
              && (contact.trustState === 'trusted' || contact.trustState === 'verified')
            )
            .map((contact) => ({
              identityId: contact.identityId,
              displayName: contact.displayName,
              bundle: contact.publicKeyBundle!,
            }))
          await initBLEEventBridge({
            walletScope: runtime.lease.walletScope,
            identityId: initializedIdentity.id,
            identityPrivateKey: identityWithKeys.dilithiumPrivateKey,
            displayName: wallet.displayName || 'EXO User',
            bundle: myBundle,
            knownIdentities,
            sendControl: async (remoteIdentityId, content) => {
              const result = await sendMessage(remoteIdentityId, content)
              return result.success
            },
            decryptMessage: async (_conversationId, encryptedData, senderIdentityId) => {
              if (!isChatRuntimeCurrent(runtime)) return null
              const handle = await getOrCreateConversation(senderIdentityId)
              if (!handle || !isChatRuntimeCurrent(runtime)) return null
              return initializedChatClient.receiveMessage(handle.getId(), encryptedData, senderIdentityId)
            },
            receiveBundle: handleBLEBundleReceived,
            onDeliveryEvent: (event) => reconcileBLEOutboundDelivery(event, runtime),
          })
        })().catch((error) => {
          if (error instanceof StaleWalletRuntimeError) return
          console.warn('[QuantumChat] BLE bootstrap failed:', error)
        }))
      }
      
      return true
    } catch (error) {
      if (error instanceof StaleWalletRuntimeError) {
        if (!identityReady) settleIdentityReady(false)
        return false
      }
      console.error('QuantumChat: Initialization failed:', error)
      if (isChatRuntimeCurrent(runtime)) {
        cleanupQuantumChat()
        resetMailboxCatchupBanner()
      } else if (!identityReady) {
        settleIdentityReady(false)
      }
      return false
    } finally {
      if (activeChatRuntime === runtime) {
        setInitializationPromiseState(null)
      }
    }
  })()
  setInitializationPromiseState(task)
  return runtime.lease.track(task)
}

export function cleanupQuantumChat(): void {
  invalidateChatRuntime()
  localHydrationCoordinator.clear()
  localConversationHydrationSnapshot = null
  disposeSubscriptionManager()
  stopMessagePolling()
  stopRealtimeSubscription()
  stopDirectExpirySweep()
  cleanupGroupChat()
  
  // Stop BLE without blocking cleanup.
  void shutdownBLEEventBridge().catch(() => {})
  
  eventUnsubscribers.forEach(unsub => unsub())
  eventUnsubscribers.length = 0

  if (outboundStatusSyncTimer) {
    clearTimeout(outboundStatusSyncTimer)
    outboundStatusSyncTimer = null
  }
  outboundStatusSyncReason = null

  authSessionUnsubscribe?.()
  setAuthSessionUnsubscribeState(null)
  
  setChatClientState(null)
  setChatIdentityState(null)
  setActiveConversationHandleState(null)
  setBundleServerState(null)
  realtimeMessageDispatchQueue.clear()
  lastLocalOrderTimestamp = 0
  bundleHealthCoordinator.reset()
  clearBundleRegistrationCache()
  setInitializationPromiseState(null)
  lastKnownAppState = AppState.currentState
  lastForegroundReconcileRequestedAt = 0
  lastBackgroundedAt = 0
  foregroundReconcileInFlight = false
  pendingForegroundReconcile = null
  lastNotifiedBoundIdentityId = null
  recentlyProcessedMessageIds.clear()
  storedMessageWorkGeneration += 1
  deferredStoredMessageWork.clear()
  clearIdentityResolutionCaches()
  clearOwnContactProfileMemoryCache()
  S.clearHiddenControlSyncState()
  settleIdentityReady(false)
  
  // Clear session-scoped storage cache.
  clearStorageCache()
  
  useChatStore.getState().reset()
}

export async function waitForQuantumChatQuiescence(): Promise<void> {
  await Promise.all([
    walletRuntimeController.waitForIdle(),
    localHydrationCoordinator.waitForIdle(),
  ])
}

export async function realignQuantumChatForActiveWallet(): Promise<boolean> {
  const pendingInitialization = initializationPromise
  if (pendingInitialization) {
    await pendingInitialization.catch(() => false)
  }

  const wallet = useWalletStore.getState().wallet
  if (!wallet) {
    cleanupQuantumChat()
    resetMailboxCatchupBanner()
    await waitForQuantumChatQuiescence()
    return false
  }

  if (
    chatClient
    && chatIdentity?.blockchainAddress
    && matchesAccountStorageScope(chatIdentity.blockchainAddress, wallet.address)
  ) {
    syncBundleServerAccessToken()
    void ensureBundleHealth('manual_recovery').catch((error) => {
      console.warn('[QuantumChat] Deferred bundle realignment failed:', error)
    })
    return true
  }

  cleanupQuantumChat()
  await waitForQuantumChatQuiescence()
  const initialized = await initializeQuantumChat()
  if (initialized) {
    void ensureBundleHealth('manual_recovery').catch((error) => {
      console.warn('[QuantumChat] Deferred bundle realignment failed:', error)
    })
  }
  return initialized
}

function settleIdentityReady(ready: boolean): void {
  identityReady = ready
  const waiters = identityReadyWaiters
  identityReadyWaiters = []
  for (const resolve of waiters) resolve(ready)
}

export function waitForQuantumChatIdentity(): Promise<boolean> {
  if (identityReady && chatIdentity?.id && chatClient) {
    return Promise.resolve(true)
  }

  const initializing = Boolean(initializationPromise)
    || useChatStore.getState().isInitializing
  if (!chatClient && !initializing) {
    return Promise.resolve(false)
  }

  return new Promise((resolve) => {
    if (identityReady && chatIdentity?.id && chatClient) {
      resolve(true)
      return
    }

    let settled = false
    const finish = (ready: boolean) => {
      if (settled) return
      settled = true
      resolve(ready)
    }

    let onReady: (ready: boolean) => void
    const timer = setTimeout(() => {
      identityReadyWaiters = identityReadyWaiters.filter((waiter) => waiter !== onReady)
      finish(false)
    }, 10_000)
    onReady = (ready: boolean) => {
      clearTimeout(timer)
      finish(ready)
    }
    identityReadyWaiters.push(onReady)
  })
}

export function isQuantumChatInitialized(): boolean {
  return chatClient !== null
}

export function getQuantumChatClient(): QuantumChat | null {
  return chatClient
}

export function getIdentity(): ChatIdentity | null {
  return chatIdentity
}

async function handleBLEBundleReceived(
  fromIdentityId: string,
  bundle: PublicKeyBundle,
): Promise<void> {
  if (!chatClient) {
    console.warn('[QuantumChat] Ignoring BLE bundle because chat is not initialized')
    return
  }

  if (bundle.identityId !== fromIdentityId) {
    console.warn('[QuantumChat] Ignoring BLE bundle with mismatched identity')
    return
  }

  const verification = await verifyPublicKeyBundleAsync(bundle)
  if (!verification.valid) {
    console.warn(`[QuantumChat] Ignoring invalid BLE bundle: ${verification.error}`)
    useChatStore.getState().addSecurityAlert({
      type: 'identity_key_changed',
      message: `Invalid BLE key bundle rejected for ${fromIdentityId.slice(0, 8)}...`,
      severity: 'medium',
      contactId: fromIdentityId,
      requiresAction: false,
    })
    return
  }

  const store = useChatStore.getState()
  const existing = store.contacts.find((c) => c.identityId === fromIdentityId)
  if (existing?.trustState === 'blocked') {
    console.warn(`[QuantumChat] Ignoring BLE bundle from blocked contact ${fromIdentityId.slice(0, 8)}...`)
    return
  }

  const result = await chatClient.addContact(bundle)
  const nextTrustState = result.identityChanged
    ? 'changed'
    : existing?.trustState ?? 'unknown'

  if (result.identityChanged) {
    store.addSecurityAlert({
      type: 'identity_key_changed',
      message: `Identity keys changed for BLE contact ${fromIdentityId.slice(0, 8)}...`,
      severity: 'high',
      contactId: fromIdentityId,
      requiresAction: true,
    })
  }

  if (existing) {
    store.updateContact(fromIdentityId, {
      publicKeyBundle: bundle,
      bundleVersion: bundle.version,
      trustState: nextTrustState,
      identityChanged: result.identityChanged,
    })
    return
  }

  store.addContact({
    identityId: fromIdentityId,
    displayName: fromIdentityId.slice(0, 8) + '...',
    publicKeyBundle: bundle,
    addedAt: Date.now(),
    bundleVersion: bundle.version,
    trustState: 'unknown',
    identityChanged: result.identityChanged,
    isSaved: false,
    isHidden: false,
  })
}

async function performBundleHealthCheck(reason: BundleHealthReason): Promise<boolean> {
  void reason
  return false
}

function hasRecentBundleHealth(identityId: string): boolean {
  return bundleHealthCoordinator.hasRecentHealthyResult(identityId)
}

export function getCachedBundleOnServer(): boolean | null {
  if (!chatIdentity?.id) return null
  if (hasRecentBundleHealth(chatIdentity.id)) {
    return true
  }
  return getCachedBundleRegistration(chatIdentity.id)
}

async function ensureBundleHealth(
  reason: BundleHealthReason,
  options?: { bypassCache?: boolean },
): Promise<boolean> {
  if (!chatIdentity) return false

  return bundleHealthCoordinator.run(
    chatIdentity.id,
    reason,
    performBundleHealthCheck,
    options,
  )
}

async function resyncActiveWalletPushRegistration(reason: string): Promise<void> {
  try {
    await synchronizeActiveWalletPushRegistration()
  } catch (error) {
    console.warn(`[QuantumChat] Failed to sync push token during ${reason}:`, error)
  }
}

function shouldUseFallbackGroupPolling(): boolean {
  return !useTorStore.getState().enabled && !S.realtimeChannel
}

function shouldPollGroupsThisCycle(runtime: QuantumChatRuntime, fullResync: boolean): boolean {
  if (shouldPollGroupsWithDirectCycle(fullResync, shouldUseFallbackGroupPolling())) {
    return true
  }
  if (!useTorStore.getState().enabled) return false
  if (fullResync) return true
  const nowMs = Date.now()
  if (nowMs - runtime.lastGroupPollAt < TOR_GROUP_POLL_INTERVAL_MS) {
    return false
  }
  runtime.lastGroupPollAt = nowMs
  return true
}

function shouldUseDirectBurstPolling(): boolean {
  return !useTorStore.getState().enabled && !S.realtimeChannel
}

function mergePollOptions(
  current: MessagePollOptions | null,
  incoming?: MessagePollOptions
): MessagePollOptions | null {
  if (!current && !incoming) return null
  const realtimeRequestedAt = [current?.realtimeRequestedAt, incoming?.realtimeRequestedAt]
    .filter((value): value is number => (
      typeof value === 'number' && Number.isFinite(value) && value > 0
    ))
  return {
    fullResync: Boolean(current?.fullResync || incoming?.fullResync),
    replayMailbox: Boolean(current?.replayMailbox || incoming?.replayMailbox),
    source: incoming?.source ?? current?.source,
    suppressLocalNotifications: Boolean(
      current?.suppressLocalNotifications || incoming?.suppressLocalNotifications,
    ),
    latestServerSequence: Math.max(
      current?.latestServerSequence ?? 0,
      incoming?.latestServerSequence ?? 0,
    ) || undefined,
    realtimeRequestedAt: realtimeRequestedAt.length > 0
      ? Math.min(...realtimeRequestedAt)
      : undefined,
  }
}

type MessagePollSource = DirectMessagePollSource

type MessagePollOptions = {
  fullResync?: boolean
  replayMailbox?: boolean
  source?: MessagePollSource
  suppressLocalNotifications?: boolean
  latestServerSequence?: number
  realtimeRequestedAt?: number
}

type MessagePollResult = {
  lastServerSequence: number
  fullResyncCompleted: boolean
  directMessageCount?: number
  mailboxTokens?: string[]
  mailboxSequences?: Map<string, number>
}

function getMessagePollPriority(options?: MessagePollOptions): number {
  if (options?.fullResync || options?.replayMailbox) return 3
  if (options?.source === 'websocket' || options?.source === 'subscription_catchup') return 2
  if (options?.source === 'queued') return 2
  return 1
}


export interface OptimisticSendContext {
  messageId: string
  conversationId: string
  timestamp: number
  localOrderTimestamp?: number
  sendStartedAt: number
  attachmentSendId?: string | null
  replyTo?: ChatMessage['replyTo']
  oneTime?: ChatMessage['oneTime']
  disappearing?: ChatMessage['disappearing']
  disappearingTimer?: Conversation['disappearingTimer']
}

export function getQueuedDeliveryState(hint: string = 'Queued'): Pick<ChatMessage, 'deliveryStage' | 'deliveryHint'> {
  return { deliveryStage: 'queued', deliveryHint: hint }
}

export function getRelayingDeliveryState(hint: string = 'Relaying'): Pick<ChatMessage, 'deliveryStage' | 'deliveryHint'> {
  return { deliveryStage: 'relaying', deliveryHint: hint }
}

export function getRelayedDeliveryState(): Pick<ChatMessage, 'deliveryStage' | 'deliveryHint'> {
  return useTorStore.getState().enabled
    ? { deliveryStage: 'awaiting_recipient', deliveryHint: 'Waiting for poll' }
    : { deliveryStage: 'relayed', deliveryHint: 'Sent' }
}

export function getFailedDeliveryState(hint: string = 'Failed'): Pick<ChatMessage, 'deliveryStage' | 'deliveryHint'> {
  return { deliveryStage: 'failed', deliveryHint: hint }
}

async function getPersistedOutgoingStatus(
  messageId: string,
  fallback: NonNullable<ChatMessage['status']>,
): Promise<NonNullable<ChatMessage['status']>> {
  const stored = await localChatStorage.getMessage(messageId).catch(() => null)
  const persisted = stored?.status
  return persisted && compareMessageStatus(persisted, fallback) > 0
    ? persisted
    : fallback
}

function reconcilePersistedOutgoingStatus(
  messageId: string,
  expectedIdentityId: string,
  fallback: NonNullable<ChatMessage['status']> = 'sent',
): void {
  void getPersistedOutgoingStatus(messageId, fallback).then((status) => {
    if (
      compareMessageStatus(status, fallback) <= 0
      || chatIdentity?.id !== expectedIdentityId
    ) {
      return
    }

    const store = useChatStore.getState()
    const message = store.getMessageById(messageId)
    if (!message || message.senderId !== expectedIdentityId) return
    store.updateMessage(messageId, {
      status,
      ...getPersistedDeliveryState(status, true),
    })
  })
}

type StoredRetryResult = {
  success: boolean
  retriedStored: boolean
  message?: ChatMessage
  error?: string
}

async function markPendingRelayRetryFailed(
  runtime: QuantumChatRuntime,
  messageId: string,
  remoteIdentityId: string,
  error: string,
): Promise<void> {
  if (!isChatRuntimeCurrent(runtime)) return
  await localChatStorage.updateMessageStatus(messageId, 'failed').catch(() => {})
  if (!isChatRuntimeCurrent(runtime)) return
  const message = useChatStore.getState().getMessageById(messageId)
  if (message && message.status !== 'delivered' && message.status !== 'read') {
    useChatStore.getState().updateMessage(messageId, {
      status: 'failed',
      relayed: false,
      ...getFailedDeliveryState(),
    })
  }
  recordServiceDiagnostic('send', 'service_retry_failed', {
    messageId,
    recipientIdentityId: remoteIdentityId,
    deliveryStage: 'failed',
    transportPath: getRelayTransportPath(),
    error,
  })
}

async function retryPendingRelayDelivery(
  runtime: QuantumChatRuntime,
  remoteIdentityId: string,
  messageId: string,
): Promise<RelayRetryOutcome> {
  if (!isChatRuntimeCurrent(runtime)) return 'deferred'
  const torState = useTorStore.getState()
  if (!torState.enabled || torState.status !== 'connected') return 'deferred'
  if (!runtime.client || !runtime.identity) return 'deferred'

  const storedMessage = await localChatStorage.getMessage(messageId).catch(() => null)
  assertChatRuntimeCurrent(runtime)
  if (!storedMessage?.relayDeliveryOutbox) return 'accepted'
  if (
    storedMessage.senderIdentityId !== runtime.identity.id
    || storedMessage.recipientIdentityId !== remoteIdentityId
  ) {
    await markPendingRelayRetryFailed(
      runtime,
      messageId,
      remoteIdentityId,
      'Stored relay retry ownership mismatch',
    )
    return 'terminal'
  }

  syncBundleServerAccessToken()
  if (!(await ensureBoundChatTransportAccess(runtime, runtime.identity.id))) {
    return 'retryable'
  }
  assertChatRuntimeCurrent(runtime)

  let handle = activeConversationHandle
  if (!handle || handle.getRemoteIdentity().id !== remoteIdentityId) {
    handle = await runtime.client.tryOpenLocalConversation(remoteIdentityId)
  }
  assertChatRuntimeCurrent(runtime)
  if (!handle) return 'retryable'

  useChatStore.getState().updateMessage(messageId, {
    status: 'sending',
    relayed: false,
    ...getRelayingDeliveryState('Retrying relay'),
  })
  const result = await handle.resendMessageViaRelay(messageId)
  assertChatRuntimeCurrent(runtime)
  const relayAccepted = Boolean(result.relayAccepted && result.relayed)
  if (!relayAccepted) {
    if (isRecipientUnavailableRelayFailure(result)) {
      markRemoteAccountUnavailable(remoteIdentityId)
    }
    const relayError = result.relayError ?? 'Message could not be relayed'
    if (result.relayTransient === true) {
      useChatStore.getState().updateMessage(messageId, {
        status: 'sending',
        relayed: false,
        ...getRelayingDeliveryState('Retry pending'),
      })
      recordServiceDiagnostic('send', 'service_retry_deferred', {
        messageId,
        conversationId: handle.getId(),
        recipientIdentityId: remoteIdentityId,
        deliveryStage: 'relaying',
        transportPath: getRelayTransportPath(),
        error: relayError,
      })
      return 'retryable'
    }
    await markPendingRelayRetryFailed(runtime, messageId, remoteIdentityId, relayError)
    return 'terminal'
  }

  void clearRemoteAccountUnavailableAfterAcceptedOutboundMessage(
    remoteIdentityId,
    storedMessage.messageKind,
  )
  const persistedStatus = await getPersistedOutgoingStatus(messageId, 'sent')
  assertChatRuntimeCurrent(runtime)
  useChatStore.getState().updateMessage(messageId, {
    status: persistedStatus,
    relayed: true,
    serverSequence: result.relayed?.serverSequence,
    ...getPersistedDeliveryState(persistedStatus, true),
  })
  reconcilePersistedOutgoingStatus(messageId, runtime.identity.id)
  recordServiceDiagnostic('send', 'service_retry_success', {
    messageId,
    conversationId: handle.getId(),
    recipientIdentityId: remoteIdentityId,
    deliveryStage: getPersistedDeliveryState(persistedStatus, true).deliveryStage,
    transportPath: getRelayTransportPath(),
    relayId: result.relayed?.id,
    serverSequence: result.relayed?.serverSequence,
  })
  trackOutboundReceiptToken((result.relayed as { deliveryToken?: string } | undefined)?.deliveryToken)
  scheduleOutboundStatusSyncFallback('direct_retry_relay_accepted')
  return 'accepted'
}

function schedulePendingRelayRetry(
  runtime: QuantumChatRuntime,
  remoteIdentityId: string,
  messageId: string,
): void {
  runtime.relayRetryScheduler.schedule(messageId, {
    run: () => runtime.lease.track(
      retryPendingRelayDelivery(runtime, remoteIdentityId, messageId),
    ),
    onExhausted: () => runtime.lease.track(markPendingRelayRetryFailed(
      runtime,
      messageId,
      remoteIdentityId,
      'Relay retry limit reached',
    )),
  })
}

async function recoverPendingRelayDeliveries(runtime: QuantumChatRuntime): Promise<void> {
  if (
    !isChatRuntimeCurrent(runtime)
    || !runtime.identity
    || !useTorStore.getState().enabled
    || useTorStore.getState().status !== 'connected'
  ) {
    return
  }

  const messages = await localChatStorage.getPendingRelayDeliveries(runtime.identity.id)
  assertChatRuntimeCurrent(runtime)
  for (const message of messages) {
    if (!message.recipientIdentityId) continue
    schedulePendingRelayRetry(runtime, message.recipientIdentityId, message.id)
  }
}

function getPersistedDeliveryState(
  status: ChatMessage['status'],
  isOwn: boolean,
): Partial<Pick<ChatMessage, 'deliveryStage' | 'deliveryHint'>> {
  if (!isOwn) return {}

  switch (status) {
    case 'read':
      return { deliveryStage: 'read', deliveryHint: 'Read' }
    case 'delivered':
      return { deliveryStage: 'delivered', deliveryHint: 'Delivered' }
    case 'failed':
      return getFailedDeliveryState()
    case 'sent':
      return getRelayedDeliveryState()
    case 'sending':
      return getRelayingDeliveryState()
    default:
      return {}
  }
}

async function reconcileBLEOutboundDelivery(
  event: BLEOutboundDeliveryEvent,
  runtime: QuantumChatRuntime,
): Promise<void> {
  if (!isChatRuntimeCurrent(runtime)) return
  const [storedMessage, decryptedMessage] = await Promise.all([
    localChatStorage.getMessage(event.localMessageId).catch(() => null),
    localChatStorage.getDecryptedMessage(event.localMessageId).catch(() => null),
  ])
  if (!isChatRuntimeCurrent(runtime) || !storedMessage) return

  const inMemoryMessage = useChatStore.getState().getMessageById(event.localMessageId)
  const currentStatus = (
    compareMessageStatus(inMemoryMessage?.status, storedMessage.status) > 0
      ? inMemoryMessage?.status
      : storedMessage.status
  )
  const projection = projectBLEOutboundDelivery(event, currentStatus)
  if (!projection) return

  if (projection.status === 'delivered') {
    await localChatStorage.updateMessageStatus(event.localMessageId, 'delivered')
  } else {
    await localChatStorage.storeMessage({
      ...storedMessage,
      status: projection.status,
    })
    if (!isChatRuntimeCurrent(runtime)) return
    if (decryptedMessage) {
      await localChatStorage.updateDecryptedMessage(event.localMessageId, {
        status: projection.status,
      }).catch(() => {})
    }
  }
  if (!isChatRuntimeCurrent(runtime)) return

  const latestMessage = useChatStore.getState().getMessageById(event.localMessageId)
  const latestProjection = projectBLEOutboundDelivery(event, latestMessage?.status ?? projection.status)
  if (!latestProjection) return
  useChatStore.getState().updateMessage(event.localMessageId, {
    ...latestProjection,
    relayed: false,
  })
  recordServiceDiagnostic('send', 'service_ble_delivery_reconciled', {
    messageId: event.localMessageId,
    deliveryStage: latestProjection.deliveryStage,
    transportPath: getRelayTransportPath('ble_mesh'),
    bleState: event.state,
    failureReason: event.failureReason,
    attempt: event.attempts,
    sequence: event.sequence,
  })
}

async function reconcileOptimisticConversation(
  optimistic: OptimisticSendContext | undefined,
  conversationId: string,
): Promise<void> {
  if (!optimistic?.conversationId || optimistic.conversationId === conversationId) {
    return
  }

  await rekeyConversationArtifacts(optimistic.conversationId, conversationId)
}

function upsertOptimisticMessage(message: ChatMessage): void {
  const store = useChatStore.getState()
  const exists = store.messages.some((entry) => entry.id === message.id)
  if (exists) {
    store.updateMessage(message.id, message)
    return
  }

  store.addMessage(message)
}

// Public key bundle

export async function getMyPublicKeyBundle(): Promise<PublicKeyBundle | null> {
  if (!chatClient) return null
  return chatClient.getPublicKeyBundle()
}

export async function reserveOneTimeContactCardPreKey(): Promise<{
  bundle: PublicKeyBundle
  cardOpk: HybridPreKey
} | null> {
  if (!chatClient) return null
  return chatClient.reserveOneTimeContactCardPreKey()
}

export async function releaseOneTimeContactCardPreKey(cardOpk: HybridPreKey): Promise<void> {
  await chatClient?.releaseOneTimeContactCardPreKey(cardOpk)
}

export async function checkBundleOnServer(options: { forceRefresh?: boolean } = {}): Promise<boolean> {
  if (!chatClient || !chatIdentity) return false

  const identityId = chatIdentity.id
  const activeClient = chatClient
  if (!options.forceRefresh && hasRecentBundleHealth(identityId)) {
    rememberBundleRegistration(identityId, true)
    return true
  }

  return runBundleRegistrationCheck(identityId, async () => {
    if (!getCurrentBackendSessionToken()) return false

    if (chatClient !== activeClient || chatIdentity?.id !== identityId) {
      return false
    }

    return activeClient.bundleExistsOnServer()
  }, options)
}

export async function ensureActiveChatIdentityReady(): Promise<{
  success: boolean
  sessionReady: boolean
  identityBound: boolean
  error?: string
}> {
  if (!chatClient || !chatIdentity) {
    return {
      success: false,
      sessionReady: false,
      identityBound: false,
      error: 'Chat not initialized',
    }
  }

  const identityId = chatIdentity.id
  const activeClient = chatClient
  try {
    const session = await ensureBoundBackendAccessForIdentity(identityId)
    if (chatClient !== activeClient || chatIdentity?.id !== identityId) {
      return {
        success: false,
        sessionReady: false,
        identityBound: false,
        error: 'Chat identity changed during verification',
      }
    }

    const sessionReady = Boolean(getCurrentBackendSessionToken())
    const identityBound = Boolean(
      sessionReady
        && session?.identityId === identityId
        && hasBoundBackendAccessForIdentity(identityId),
    )
    if (identityBound) {
      syncBundleServerAccessToken()
    }

    return {
      success: sessionReady && identityBound,
      sessionReady,
      identityBound,
    }
  } catch {
    return {
      success: false,
      sessionReady: Boolean(getCurrentBackendSessionToken()),
      identityBound: false,
      error: 'Could not verify chat identity',
    }
  }
}

async function runReconcilePass(
  runtime: QuantumChatRuntime,
  options: ChatReconcileOptions,
): Promise<void> {
  assertChatRuntimeCurrent(runtime)
  if (!runtime.client || !runtime.identity) return

  syncBundleServerAccessToken()

  if (options.restartRealtime) {
    stopRealtimeSubscription()
  }

  if (!getCurrentBackendSessionToken()) {
    const bound = await ensureBoundChatTransportAccess(runtime, runtime.identity.id)
    assertChatRuntimeCurrent(runtime)
    syncBundleServerAccessToken()
    if (!bound || !getCurrentBackendSessionToken()) {
      return
    }
  }

  if (!S.realtimeChannel && isBackendConfigured()) {
    startRealtimeSubscription()
  } else {
    await refreshRealtimeMailboxSubscriptions()
    assertChatRuntimeCurrent(runtime)
  }

  const groupPollNeeded = !options.fullResync && !shouldUseFallbackGroupPolling()
  await Promise.allSettled([
    pollForNewMessages({
      fullResync: options.fullResync,
      replayMailbox: shouldReplayMailboxFromZero(options),
      suppressLocalNotifications: options.suppressLocalNotifications,
    }),
    groupPollNeeded
      ? syncGroupConversations(false).then(() => {
        assertChatRuntimeCurrent(runtime)
        return pollForNewGroupMessages()
      })
      : Promise.resolve(),
  ])
  assertChatRuntimeCurrent(runtime)

  if (options.skipBundleHealth) return

  const reason = options.reason || 'manual_recovery'
  await ensureBundleHealth(reason, {
    bypassCache: reason === 'decryption_failure',
  })
  assertChatRuntimeCurrent(runtime)
}

export async function reconcileQuantumChat(
  options: ChatReconcileOptions = {},
): Promise<void> {
  const runtime = activeChatRuntime
  if (!runtime || !isChatRuntimeCurrent(runtime) || !runtime.client || !runtime.identity) return
  return runtime.lease.track(runtime.reconcileScheduler.request(options))
}

export async function fetchContactBundle(
  identityId: string,
  signal?: AbortSignal,
  inviteCapability?: string,
): Promise<PublicKeyBundle | null> {
  const client = chatClient
  if (!client) return null
  
  try {
    const cached = await client.getStoredContactBundle(identityId)
    if (signal?.aborted || chatClient !== client) return null
    if (cached) return cached
    if (!inviteCapability) return null
    // Fetch with atomic one-time prekey consumption.
    const bundle = await client.fetchContactBundleFromServer(
      identityId,
      signal,
      inviteCapability,
    )
    if (signal?.aborted || chatClient !== client) return null
    return bundle
  } catch (error) {
    console.error('Failed to fetch contact bundle:', error)
    return null
  }
}

export async function fetchDiscoverableContactBundle(
  walletAddress: string,
  signal?: AbortSignal,
): Promise<PublicKeyBundle | null> {
  const client = chatClient
  const identity = chatIdentity
  const server = S.bundleServer
  if (!client || !identity || !server?.fetchDiscoverableBundle) return null
  try {
    const result = await server.fetchDiscoverableBundle(walletAddress, identity.id, signal)
    if (signal?.aborted || chatClient !== client || chatIdentity?.id !== identity.id) return null
    return result.bundle ?? null
  } catch (error) {
    console.error('Failed to fetch discoverable contact bundle:', error)
    return null
  }
}

export async function fetchOneTimeContactCard(
  cardId: string,
  cardCapability: string,
  signal?: AbortSignal,
): Promise<{
  bundle: PublicKeyBundle
  profileCapsule?: ContactCardProfileCapsule
} | null> {
  const client = chatClient
  const server = S.bundleServer
  if (!client || !server?.fetchOneTimeContactCard) return null
  try {
    const result = await server.fetchOneTimeContactCard(
      cardId,
      cardCapability,
      signal,
    )
    if (signal?.aborted || chatClient !== client) return null
    return result.bundle
      ? {
          bundle: result.bundle,
          ...(result.profileCapsule ? { profileCapsule: result.profileCapsule } : {}),
        }
      : null
  } catch (error) {
    console.error('Failed to redeem one-time contact card:', error)
    return null
  }
}

// Contacts

// Conversations

const RETIRED_CONVERSATION_IDENTITIES = new Set(['kara-ai'])
const RETIRED_CONVERSATION_IDS = new Set(['kara-ai-conversation'])

type StoredConversationRecord = Awaited<
  ReturnType<typeof localChatStorage.getConversations>
>[number]

interface LocalConversationHydration {
  walletAddress: string
  localIdentityId: string
  rawConversations: StoredConversationRecord[]
  conversations: Conversation[]
}

let localConversationHydrationSnapshot: LocalConversationHydration | null = null

async function hydrateLocalConversationProjection(
  walletAddress: string,
  signal: AbortSignal,
): Promise<LocalConversationHydration | null> {
  const isCurrentWallet = () => !signal.aborted && isSameAccountStorageScope(
    useWalletStore.getState().wallet?.address,
    walletAddress,
  )

  try {
    const wallet = useWalletStore.getState().wallet
    const storedIdentity = await localChatStorage.getIdentityByAddress(walletAddress)
    if (!storedIdentity?.id || !isCurrentWallet()) return null

    const rawConversations = await localChatStorage.getConversations(storedIdentity.id)
    if (!isCurrentWallet()) return null
    const retiredConversations = rawConversations.filter((conversation) => (
      RETIRED_CONVERSATION_IDENTITIES.has(conversation.remoteIdentityId)
      || RETIRED_CONVERSATION_IDS.has(conversation.id)
    ))
    if (retiredConversations.length > 0) {
      await Promise.allSettled(
        retiredConversations.map((conversation) => localChatStorage.deleteConversation(conversation.id)),
      )
    }
    const activeConversations = rawConversations.filter((conversation) => !retiredConversations.includes(conversation))
    const { contacts } = useChatStore.getState()
    const batch: Conversation[] = activeConversations.map((conv) => {
      const raw = conv as any
      const storedLastMessage = mapStoredConversationLastMessage(
        conv.lastMessage,
        storedIdentity.id,
      )
      const walletAddr: string | undefined = raw.remoteWalletAddress
      const disappearingTimer = mapStoredDisappearingTimer(raw.disappearingTimer ?? null)
      const remoteSignalFields = getStoredRemoteSignalFields(raw)
      return {
        id: conv.id,
        localIdentityId: storedIdentity.id,
        localWalletAddress: walletAddress,
        localDisplayName: wallet?.displayName,
        remoteIdentityId: conv.remoteIdentityId,
        remoteWalletAddress: walletAddr,
        createdAt: conv.createdAt,
        unreadCount: Number.isFinite(conv.unreadCount) ? conv.unreadCount : 0,
        updatedAt: conv.updatedAt,
        hasVisibleActivity: raw.hasVisibleActivity ?? (storedLastMessage ? true : undefined),
        displayName: resolveLocalConversationDisplayName({
          remoteIdentityId: conv.remoteIdentityId,
          remoteWalletAddress: walletAddr,
          storedDisplayName: raw.displayName,
        }, contacts),
        ...remoteSignalFields,
        ...(disappearingTimer ? { disappearingTimer } : {}),
        ...(storedLastMessage ? { lastMessage: storedLastMessage } : {}),
      }
    })

    if (!isCurrentWallet()) return null
    const store = useChatStore.getState()
    store.mergeConversations(batch)
    store.setConversationsReady(true)
    markListStartupMetric('first_conversation_merge', { count: batch.length })
    markListStartupMetric('chats_list_ready', { count: batch.length })
    return {
      walletAddress,
      localIdentityId: storedIdentity.id,
      rawConversations: activeConversations,
      conversations: batch,
    }
  } catch (error) {
    if (__DEV__) console.warn('[QuantumChat] Failed to load cached conversations:', error)
    return null
  } finally {
    if (isCurrentWallet()) {
      useChatStore.getState().setConversationsReady(true)
      markListStartupMetric('chats_list_ready', { count: 0 })
    }
  }
}

async function repairLocalConversationProjection(
  hydration: LocalConversationHydration,
  signal: AbortSignal,
): Promise<void> {
  const {
    conversations,
    localIdentityId,
    rawConversations,
    walletAddress,
  } = hydration
  const isCurrentWallet = () => !signal.aborted && isSameAccountStorageScope(
    useWalletStore.getState().wallet?.address,
    walletAddress,
  )
  if (!isCurrentWallet()) return

  const unreadUpdates = await mapWithConcurrency(rawConversations, UNREAD_REPAIR_CONCURRENCY, async (conv) => {
    if (!isCurrentWallet()) {
      return null
    }
    if (
      conv.unreadProjectionVersion === DIRECT_UNREAD_PROJECTION_VERSION
      && conv.unreadProjectionDirty === false
    ) {
      return {
        id: conv.id,
        changes: { unreadCount: Math.max(0, Math.trunc(conv.unreadCount || 0)) },
      }
    }
    await yieldToQuantumChatHost()
    if (!isCurrentWallet()) {
      return null
    }
    await migrateLegacyDirectMessageBucket({
      conversationId: conv.id,
      remoteIdentityId: conv.remoteIdentityId,
      localIdentityId,
      localWalletAddress: walletAddress,
    })
    if (!isCurrentWallet()) {
      return null
    }
    const unreadProjection = await reconcileDirectUnreadState({
      conversationId: conv.id,
      localIdentityId,
      localWalletAddress: walletAddress,
    })
    return {
      id: conv.id,
      changes: { unreadCount: unreadProjection.unreadCount },
    }
  })
  if (!isCurrentWallet()) return
  useChatStore.getState().batchUpdateConversations(
    unreadUpdates.filter((update): update is NonNullable<typeof update> => update !== null),
  )

  const conversationsToLoadLastMessages = conversations.filter(
    (conversation) => !conversation.lastMessage && conversation.hasVisibleActivity !== false,
  )
  if (conversationsToLoadLastMessages.length > 0 && isCurrentWallet()) {
    await loadMissingLastMessages(
      conversationsToLoadLastMessages,
      localIdentityId,
      walletAddress,
    )
  }
}

function ensureLocalChatHydration(walletAddress: string): LocalHydrationPhases {
  let contactHydration: Awaited<ReturnType<typeof hydrateLocalContactProjection>> = null
  let conversationHydration: LocalConversationHydration | null = null

  return localHydrationCoordinator.ensure(walletAddress, {
    isProjectionReady: () => {
      const store = useChatStore.getState()
      return store.contactsReady && store.conversationsReady
    },
    loadBase: async (signal) => {
      await Promise.all([
        hydrateLocalContactProjection(walletAddress)
          .then((hydration) => {
            contactHydration = hydration
          })
          .catch((error) => {
            if (__DEV__) console.warn('[QuantumChat] Failed to load cached contacts:', error)
            if (
              !signal.aborted
              && isSameAccountStorageScope(useWalletStore.getState().wallet?.address, walletAddress)
            ) {
              useChatStore.getState().setContactsReady(true)
              markListStartupMetric('contacts_list_ready', { count: 0 })
            }
          }),
        hydrateLocalConversationProjection(walletAddress, signal)
          .then((hydration) => {
            conversationHydration = hydration
            if (hydration) {
              localConversationHydrationSnapshot = hydration
            }
          }),
      ])
    },
    repair: async (signal) => {
      if (signal.aborted) return
      await whenInitialMailboxCatchupSettled()
      if (signal.aborted) return
      await yieldToQuantumChatHost(undefined, { priority: 'background' })
      if (signal.aborted) return
      await Promise.allSettled([
        contactHydration
          ? repairLocalContactProjection(contactHydration, signal)
          : Promise.resolve(),
        conversationHydration
          ? repairLocalConversationProjection(conversationHydration, signal)
          : Promise.resolve(),
      ])
    },
  })
}

export async function loadCachedConversations(): Promise<void> {
  const walletAddress = useWalletStore.getState().wallet?.address
  if (!walletAddress) return
  await ensureLocalChatHydration(walletAddress).baseReady
}

export async function hydrateLocalContacts(): Promise<ChatContact[]> {
  const walletAddress = useWalletStore.getState().wallet?.address
  if (!walletAddress) return []
  await ensureLocalChatHydration(walletAddress).baseReady
  return useChatStore.getState().contacts.filter((contact) =>
    matchesAccountStorageScope(contact.localWalletAddress, walletAddress)
  )
}

async function loadConversations(
  options: { reuseLocalHydration?: boolean } = {},
): Promise<void> {
  if (!chatClient) return
  
  try {
    const wallet = useWalletStore.getState().wallet
    const reusableHydration = options.reuseLocalHydration
      && wallet?.address
      && localConversationHydrationSnapshot
      && isSameAccountStorageScope(
        localConversationHydrationSnapshot.walletAddress,
        wallet.address,
      )
      && localConversationHydrationSnapshot.localIdentityId === chatIdentity?.id
      ? localConversationHydrationSnapshot
      : null
    const libraryConversations = reusableHydration
      ? reusableHydration.rawConversations
      : await chatClient.getConversations()
    if (reusableHydration) {
      localConversationHydrationSnapshot = null
    }
    const { conversations: existingConversations } = useChatStore.getState()
    const myIdentityId = chatIdentity?.id ?? null
    const localConversationContext = {
      localIdentityId: myIdentityId ?? undefined,
      localWalletAddress: wallet?.address,
      localDisplayName: wallet?.displayName,
    }
    
    const scopedExistingConversations = existingConversations.filter((conversation) =>
      matchesLocalConversationContext(conversation, localConversationContext)
    )
    const existingById = new Map(scopedExistingConversations.map(c => [c.id, c]))
    const existingByRemoteId = new Map(scopedExistingConversations.map(c => [c.remoteIdentityId, c]))
    
    const { contacts } = useChatStore.getState()
    const contactByIdentity = new Map(contacts.map(c => [c.identityId, c]))

    const resolvedBatch: Conversation[] = []
    const conversationsToLoadLastMessages: Conversation[] = []
    const identityRemaps: Array<{ conversationId: string; canonicalRemoteId: string }> = []
    const artifactRekeys: Array<{ sourceId: string; targetId: string }> = []
    let processed = 0
    
    for (const conv of libraryConversations) {
      const unreadCount = existingById.get(conv.id)?.unreadCount
        ?? (Number.isFinite(conv.unreadCount) ? conv.unreadCount : 0)
      const resolvedRemote = resolveConversationIdentityLocally(conv.remoteIdentityId, contactByIdentity)
      const canonicalRemoteId = resolvedRemote.identityId
      const walletAddress = resolvedRemote.walletAddress
      const storedLastMessage = mapStoredConversationLastMessage(conv.lastMessage, myIdentityId)
      const storedDisappearingTimer = mapStoredDisappearingTimer((conv as { disappearingTimer?: StoredDisappearingMessageTimer | null }).disappearingTimer ?? null)
      const storedRemoteSignalFields = getStoredRemoteSignalFields(conv)

      if (canonicalRemoteId !== conv.remoteIdentityId) {
        identityRemaps.push({ conversationId: conv.id, canonicalRemoteId })
      }

      const existing = existingById.get(conv.id) || existingByRemoteId.get(canonicalRemoteId)

      const displayName = resolveLocalConversationDisplayName({
        remoteIdentityId: canonicalRemoteId,
        remoteWalletAddress: walletAddress,
      }, contacts)
      const preferredLastMessage = pickPreferredConversationLastMessage(existing?.lastMessage, storedLastMessage)
      
      if (existing) {
        let canonicalConversationId = existing.id
        if (existing.id !== conv.id) {
          artifactRekeys.push({ sourceId: existing.id, targetId: conv.id })
          canonicalConversationId = conv.id
        }
        const merged: Conversation = {
          ...existing,
          id: canonicalConversationId,
          ...localConversationContext,
          remoteIdentityId: canonicalRemoteId,
          remoteWalletAddress: walletAddress || existing.remoteWalletAddress,
          unreadCount,
          updatedAt: conv.updatedAt,
          hasVisibleActivity:
            (conv as { hasVisibleActivity?: boolean }).hasVisibleActivity
            ?? existing.hasVisibleActivity
            ?? (preferredLastMessage ? true : undefined),
          displayName: displayName || existing.displayName,
          disappearingTimer: storedDisappearingTimer ?? existing.disappearingTimer ?? null,
          remoteScreenshotProtection:
            storedRemoteSignalFields.remoteScreenshotProtection ?? existing.remoteScreenshotProtection,
          remoteScreenshotProtectionUpdatedAt:
            storedRemoteSignalFields.remoteScreenshotProtectionUpdatedAt ?? existing.remoteScreenshotProtectionUpdatedAt,
          remoteTorEnabled:
            storedRemoteSignalFields.remoteTorEnabled ?? existing.remoteTorEnabled,
          remoteTorUpdatedAt:
            storedRemoteSignalFields.remoteTorUpdatedAt ?? existing.remoteTorUpdatedAt,
          ...(preferredLastMessage ? { lastMessage: preferredLastMessage } : {}),
        }
        resolvedBatch.push(merged)
        if (!merged.lastMessage && merged.hasVisibleActivity !== false) {
          conversationsToLoadLastMessages.push(merged)
        }
      } else {
        const newConv: Conversation = {
          id: conv.id,
          ...localConversationContext,
          remoteIdentityId: canonicalRemoteId,
          remoteWalletAddress: walletAddress,
          createdAt: conv.createdAt,
          unreadCount,
          updatedAt: conv.updatedAt,
          hasVisibleActivity:
            (conv as { hasVisibleActivity?: boolean }).hasVisibleActivity
            ?? (storedLastMessage ? true : undefined),
          displayName,
          disappearingTimer: storedDisappearingTimer,
          ...storedRemoteSignalFields,
          ...(storedLastMessage ? { lastMessage: storedLastMessage } : {}),
        }
        resolvedBatch.push(newConv)
        if (!newConv.lastMessage && newConv.hasVisibleActivity !== false) {
          conversationsToLoadLastMessages.push(newConv)
        }
      }
      processed += 1
      if (processed % CONVERSATION_REBUILD_YIELD_EVERY === 0) {
        await yieldToQuantumChatHost('conversation_rebuild', { priority: 'realtime' })
      }
    }

    if (__DEV__) {
      const existingCount = resolvedBatch.filter(c => existingById.has(c.id) || existingByRemoteId.has(c.remoteIdentityId)).length
      console.log(
        `[ChatInit] loadConversations: ${libraryConversations.length} from local storage, ${existingConversations.length} already in store, ${resolvedBatch.length} resolved (${existingCount} updated, ${resolvedBatch.length - existingCount} new), ${conversationsToLoadLastMessages.length} need lastMessage hydration`
      )
    }

    useChatStore.getState().mergeConversations(resolvedBatch)
    useChatStore.getState().setConversationsReady(true)

    const expectedWalletAddress = wallet?.address
    const isLoadContextCurrent = () => !expectedWalletAddress || isSameAccountStorageScope(
      useWalletStore.getState().wallet?.address,
      expectedWalletAddress,
    )
    void (async () => {
      await yieldToQuantumChatHost(undefined, { priority: 'background' })
      if (!isLoadContextCurrent()) return
      await mapWithConcurrency(identityRemaps, UNREAD_REPAIR_CONCURRENCY, async (remap) => {
        if (!isLoadContextCurrent()) return
        await localChatStorage.updateConversation(remap.conversationId, {
          remoteIdentityId: remap.canonicalRemoteId,
          sessionRecordId: remap.canonicalRemoteId,
        })
      })
      if (!isLoadContextCurrent()) return
      for (const { sourceId, targetId } of artifactRekeys) {
        if (!isLoadContextCurrent()) return
        await rekeyConversationArtifacts(sourceId, targetId)
        await yieldToQuantumChatHost(undefined, { priority: 'background' })
      }
      if (!isLoadContextCurrent()) return
      const finalConvs = useChatStore.getState().conversations
      const walletToCanonical = new Map<string, Conversation>()
      const toRekey: Array<{ sourceId: string; targetId: string }> = []
      for (const c of finalConvs) {
        if (!matchesLocalConversationContext(c, localConversationContext)) continue
        if (!c.remoteWalletAddress) continue
        const localWalletAddress = c.localWalletAddress || localConversationContext.localWalletAddress
        const canonicalKey = `${buildLocalConversationKey(
          localWalletAddress,
          c.remoteWalletAddress,
        )}:${c.remoteIdentityId}`
        const prev = walletToCanonical.get(canonicalKey)
        if (!prev) {
          walletToCanonical.set(canonicalKey, c)
        } else {
          const prevActive = prev.lastMessage?.timestamp || 0
          const curActive = c.lastMessage?.timestamp || 0
          if (curActive > prevActive) {
            toRekey.push({ sourceId: prev.id, targetId: c.id })
            walletToCanonical.set(canonicalKey, c)
          } else {
            toRekey.push({ sourceId: c.id, targetId: prev.id })
          }
        }
      }
      for (const { sourceId, targetId } of toRekey) {
        if (!isLoadContextCurrent()) return
        await rekeyConversationArtifacts(sourceId, targetId)
        await yieldToQuantumChatHost(undefined, { priority: 'background' })
      }
    })().catch((error) => {
      console.warn('[QuantumChat] Deferred conversation repair failed:', error)
    })

    scheduleRemoteConversationIdentityResolution(
      libraryConversations.map((conversation) => ({
        id: conversation.id,
        remoteIdentityId: conversation.remoteIdentityId,
      })),
      localConversationContext,
    )
  } catch (error) {
    console.error('Failed to load conversations:', error)
    useChatStore.getState().setConversationsReady(true)
  }
}

function resolveConversationIdentityLocally(
  remoteIdentityId: string,
  contactByIdentity: Map<string, ChatContact>,
): { identityId: string; walletAddress?: string } {
  const knownContact = contactByIdentity.get(remoteIdentityId)
  const cachedWalletAddress = getCachedIdentityResolutionValue(
    walletAddressByIdentityCache,
    remoteIdentityId,
  ) || undefined
  const walletAddress = knownContact?.walletAddress || cachedWalletAddress

  if (walletAddress) {
    rememberResolvedWalletAddress(remoteIdentityId, walletAddress)
  }

  if (!walletAddress) {
    return { identityId: remoteIdentityId }
  }

  return {
    identityId: remoteIdentityId,
    walletAddress,
  }
}

function scheduleRemoteConversationIdentityResolution(
  conversations: Array<{ id: string; remoteIdentityId: string }>,
  localContext: Pick<Conversation, 'localIdentityId' | 'localWalletAddress'> = getActiveLocalConversationContext(),
): void {
  if (!bundleServer || conversations.length === 0) {
    return
  }

  void mapWithConcurrency(conversations, 3, async (conversation) => {
    const { contacts } = useChatStore.getState()
    const contactByIdentity = new Map(contacts.map((contact) => [contact.identityId, contact]))
    const resolvedRemote = await resolveConversationIdentity(
      conversation.remoteIdentityId,
      contactByIdentity,
    )

    const store = useChatStore.getState()
    const existing = store.conversations.find(
      (item) => matchesLocalConversationContext(item, localContext)
        && (item.id === conversation.id || item.remoteIdentityId === conversation.remoteIdentityId),
    )
    if (!existing) {
      return
    }

    const changes: Partial<Conversation> = {}
    if (resolvedRemote.walletAddress && resolvedRemote.walletAddress !== existing.remoteWalletAddress) {
      changes.remoteWalletAddress = resolvedRemote.walletAddress
    }

    if (Object.keys(changes).length === 0) {
      return
    }

    const storageChanges: Record<string, unknown> = {}
    if (changes.remoteWalletAddress) {
      storageChanges.remoteWalletAddress = changes.remoteWalletAddress
    }

    await localChatStorage.updateConversation(existing.id, storageChanges as any)
    store.updateConversation(existing.id, changes)
  }).catch((error) => {
    if (__DEV__) console.warn('[QuantumChat] Deferred conversation identity resolution failed:', error)
  })
}

async function resolveConversationIdentity(
  remoteIdentityId: string,
  contactByIdentity: Map<string, ChatContact>
): Promise<{ identityId: string; walletAddress?: string }> {
  const knownContact = contactByIdentity.get(remoteIdentityId)
  const walletAddress = await resolveWalletAddressForIdentity(
    remoteIdentityId,
    knownContact?.walletAddress,
  )

  if (!walletAddress) {
    return { identityId: remoteIdentityId }
  }

  return {
    identityId: remoteIdentityId,
    walletAddress,
  }
}

async function loadLatestPreviewableStoredMessage(
  conversationId: string,
  remoteIdentityId: string,
  searchDepth: number,
  myIdentityId?: string | null,
): Promise<
  | { message: any; preview: NonNullable<ReturnType<typeof buildDirectConversationPreviewFromStoredMessage>> }
  | { controlOnly: true }
  | null
> {
  const conversationKeys = conversationId === remoteIdentityId
    ? [conversationId]
    : [conversationId, remoteIdentityId]
  let scannedAny = false

  for (const key of conversationKeys) {
    let before: number | undefined
    for (let scanned = 0; scanned < searchDepth; scanned += 1) {
      const page = await localChatStorage.getMessages(key, { limit: 1, before }).catch(() => [])
      if (page.length === 0) {
        break
      }
      scannedAny = true
      const candidate = page[0] as StoredMessage & {
        timestamp?: number
        deleted?: boolean
        senderIdentityId?: string
      }
      if (
        typeof candidate?.content === 'string'
        || isStoredLockedViewOncePlaceholder(candidate)
      ) {
        const preview = buildDirectConversationPreviewFromStoredMessage(
          candidate as DecryptedMessage & { senderIdentityId?: string; deleted?: boolean },
          myIdentityId,
        )
        if (preview) {
          return { message: candidate, preview }
        }
      }
      const nextBefore = candidate?.timestamp ?? candidate?.createdAt
      if (!Number.isFinite(nextBefore) || nextBefore === before) {
        break
      }
      before = nextBefore
      if (scanned > 0 && scanned % 8 === 0) {
        await yieldToQuantumChatHost(undefined, { priority: 'realtime' })
      }
    }
  }

  return scannedAny ? { controlOnly: true } : null
}

/**
 * Hydrates missing conversation previews in one store write.
 */
async function loadMissingLastMessages(
  conversations: Conversation[],
  localIdentityId?: string | null,
  expectedWalletAddress?: string | null,
): Promise<void> {
  const conversationsWithoutLastMessage = conversations.filter(
    (conversation) => !conversation.lastMessage && conversation.hasVisibleActivity !== false,
  )
  if (conversationsWithoutLastMessage.length === 0) return
  
  const myIdentityId = localIdentityId ?? chatIdentity?.id
  const isContextCurrent = () => !expectedWalletAddress || isSameAccountStorageScope(
    useWalletStore.getState().wallet?.address,
    expectedWalletAddress,
  )
  
  const pendingUpdates: Array<{ id: string; changes: Partial<Conversation> }> = []
  let controlOnlyCount = 0
  
  const BATCH_SIZE = 2
  const MESSAGE_SEARCH_DEPTH = 8
  for (let i = 0; i < conversationsWithoutLastMessage.length; i += BATCH_SIZE) {
    const batch = conversationsWithoutLastMessage.slice(i, i + BATCH_SIZE)
    
    await Promise.all(
      batch.map(async (conv) => {
        try {
          if (!isContextCurrent()) return
          const hydratedPreview = await loadLatestPreviewableStoredMessage(
            conv.id,
            conv.remoteIdentityId,
            MESSAGE_SEARCH_DEPTH,
            myIdentityId,
          )
          if (!isContextCurrent()) return
          
          if (hydratedPreview && 'preview' in hydratedPreview) {
            const { message: lastVisibleMsg, preview: lastMessage } = hydratedPreview
            const currentLastMessage = useChatStore.getState().conversations.find(
              (conversation) => conversation.id === conv.id,
            )?.lastMessage
            if (
              pickPreferredConversationLastMessage(currentLastMessage, lastMessage)
              !== lastMessage
            ) {
              return
            }
            await localChatStorage.updateConversation(conv.id, {
              hasVisibleActivity: true,
              lastMessage: {
                content: lastMessage.content,
                timestamp: lastMessage.timestamp,
                senderId: lastVisibleMsg.senderId ?? lastVisibleMsg.senderIdentityId ?? '',
              },
            })
            if (!isContextCurrent()) return
            const latestLastMessage = pickPreferredConversationLastMessage(
              useChatStore.getState().conversations.find(
                (conversation) => conversation.id === conv.id,
              )?.lastMessage,
              lastMessage,
            )
            if (latestLastMessage !== lastMessage && latestLastMessage) {
              await localChatStorage.updateConversation(conv.id, {
                lastMessage: {
                  content: latestLastMessage.content,
                  timestamp: latestLastMessage.timestamp,
                  senderId: latestLastMessage.isOwn
                    ? (myIdentityId ?? '')
                    : conv.remoteIdentityId,
                },
              })
            }
            pendingUpdates.push({
              id: conv.id,
              changes: { hasVisibleActivity: true, lastMessage: latestLastMessage },
            })
          } else if (hydratedPreview && 'controlOnly' in hydratedPreview) {
            controlOnlyCount++
            await localChatStorage.updateConversation(conv.id, {
              hasVisibleActivity: false,
            })
            pendingUpdates.push({
              id: conv.id,
              changes: { hasVisibleActivity: false },
            })
            if (__DEV__) {
              console.log(
                `[ChatInit] Conversation ${conv.id.slice(0, 8)}… with ${conv.remoteIdentityId.slice(0, 8)}… has no visible messages in last ${MESSAGE_SEARCH_DEPTH} — keeping without preview`
              )
            }
          }
        } catch {
          // Leave preview empty on read failure.
        }
      })
    )
    await yieldToQuantumChatHost(undefined, { priority: 'background' })
    if (!isContextCurrent()) return
  }

  if (__DEV__) {
    console.log(
      `[ChatInit] loadMissingLastMessages: ${conversationsWithoutLastMessage.length} checked, ${pendingUpdates.length} hydrated, ${controlOnlyCount} control-only (kept)`
    )
  }

  if (
    !isContextCurrent()
  ) {
    return
  }

  if (pendingUpdates.length > 0) {
    const store = useChatStore.getState()
    store.batchUpdateConversations(pendingUpdates.map((update) => ({
      ...update,
      changes: {
        ...update.changes,
        lastMessage: pickPreferredConversationLastMessage(
          store.conversations.find((conversation) => conversation.id === update.id)?.lastMessage,
          update.changes.lastMessage,
        ),
      },
    })))
  }
}

const conversationHandlePromisesByIdentity = new Map<string, Promise<ConversationHandle | null>>()

export async function tryOpenLocalConversation(
  remoteIdentityId: string,
): Promise<ConversationHandle | null> {
  const client = chatClient
  if (
    !client
    || !remoteIdentityId
    || remoteIdentityId === 'undefined'
    || remoteIdentityId === 'null'
  ) {
    return null
  }

  const handle = await client.tryOpenLocalConversation(remoteIdentityId)
  return chatClient === client ? handle : null
}

export async function getOrCreateConversation(remoteIdentityId: string): Promise<ConversationHandle | null> {
  const existing = conversationHandlePromisesByIdentity.get(remoteIdentityId)
  if (existing) {
    return existing
  }

  const promise = getOrCreateConversationInternal(remoteIdentityId)
  conversationHandlePromisesByIdentity.set(remoteIdentityId, promise)

  try {
    return await promise
  } finally {
    if (conversationHandlePromisesByIdentity.get(remoteIdentityId) === promise) {
      conversationHandlePromisesByIdentity.delete(remoteIdentityId)
    }
  }
}

async function getOrCreateConversationInternal(remoteIdentityId: string): Promise<ConversationHandle | null> {
  if (!chatClient) return null
  
  // Reject invalid identity IDs.
  if (!remoteIdentityId || remoteIdentityId === 'undefined' || remoteIdentityId === 'null') {
    console.warn('getOrCreateConversation called with invalid identity ID:', remoteIdentityId)
    return null
  }
  
  try {
    let handle: ConversationHandle
    try {
      handle = await chatClient.getOrCreateConversation(remoteIdentityId)
    } catch (firstError) {
      throw firstError
    }
    
    setActiveConversationHandleState(handle)
    
    // Use the canonical identity from the handle.
    const canonicalRemoteId = handle.getRemoteIdentity().id
    
    const localConversationContext = getActiveLocalConversationContext()

    // Resolve the stable wallet address.
    const store = useChatStore.getState()
    const remoteContact = store.contacts.find(
      c => matchesAccountStorageScope(c.localWalletAddress, localConversationContext.localWalletAddress)
        && (c.identityId === canonicalRemoteId || c.identityId === remoteIdentityId)
    )
    const remoteWallet = remoteContact?.walletAddress

    // Match existing conversations across known identifiers.
    const handleId = handle.getId()
    const storedConversation = await localChatStorage.getConversation(handleId).catch(() => null)
    const storedDisappearingTimer = mapStoredDisappearingTimer(storedConversation?.disappearingTimer ?? null)
    const storedRemoteSignalFields = storedConversation
      ? getStoredRemoteSignalFields(storedConversation)
      : {}
    const existing = store.conversations.find(
      (c) => matchesLocalConversationContext(c, localConversationContext)
        && (
          c.id === handleId
          || c.remoteIdentityId === canonicalRemoteId
          || c.remoteIdentityId === remoteIdentityId
          || (remoteWallet && c.remoteWalletAddress === remoteWallet)
        )
    )
    
    if (existing && existing.id !== handleId) {
      const oldId = existing.id
      await rekeyConversationArtifacts(oldId, handleId)
      store.addConversation({
        ...existing,
        id: handleId,
        ...localConversationContext,
        remoteIdentityId: canonicalRemoteId,
        remoteWalletAddress: remoteWallet || existing.remoteWalletAddress,
        disappearingTimer: storedDisappearingTimer ?? existing.disappearingTimer ?? null,
        remoteScreenshotProtection:
          storedRemoteSignalFields.remoteScreenshotProtection ?? existing.remoteScreenshotProtection,
        remoteScreenshotProtectionUpdatedAt:
          storedRemoteSignalFields.remoteScreenshotProtectionUpdatedAt ?? existing.remoteScreenshotProtectionUpdatedAt,
        remoteTorEnabled:
          storedRemoteSignalFields.remoteTorEnabled ?? existing.remoteTorEnabled,
        remoteTorUpdatedAt:
          storedRemoteSignalFields.remoteTorUpdatedAt ?? existing.remoteTorUpdatedAt,
      })
      await reconcileDirectUnreadState({
        conversationId: handleId,
        localIdentityId: localConversationContext.localIdentityId,
        localWalletAddress: localConversationContext.localWalletAddress,
      })
    } else if (existing) {
      const conversationUpdates: Partial<Conversation> = {}
      if (!existing.localIdentityId && localConversationContext.localIdentityId) {
        conversationUpdates.localIdentityId = localConversationContext.localIdentityId
      }
      if (!existing.localWalletAddress && localConversationContext.localWalletAddress) {
        conversationUpdates.localWalletAddress = localConversationContext.localWalletAddress
      }
      if (!existing.localDisplayName && localConversationContext.localDisplayName) {
        conversationUpdates.localDisplayName = localConversationContext.localDisplayName
      }
      if (existing.remoteIdentityId !== canonicalRemoteId || !existing.remoteWalletAddress) {
        conversationUpdates.remoteIdentityId = canonicalRemoteId
        conversationUpdates.remoteWalletAddress = remoteWallet || existing.remoteWalletAddress
      }
      if (storedDisappearingTimer || existing.disappearingTimer) {
        conversationUpdates.disappearingTimer = storedDisappearingTimer ?? existing.disappearingTimer ?? null
      }
      Object.assign(conversationUpdates, storedRemoteSignalFields)
      if (Object.keys(conversationUpdates).length > 0) {
        store.updateConversation(existing.id, conversationUpdates)
      }
    } else {
      store.addConversation({
        id: handleId,
        ...localConversationContext,
        remoteIdentityId: canonicalRemoteId,
        remoteWalletAddress: remoteWallet,
        createdAt: Date.now(),
        unreadCount: 0,
        disappearingTimer: storedDisappearingTimer,
        ...storedRemoteSignalFields,
      })
    }
    
    return handle
  } catch (error) {
    console.error('Failed to get/create conversation:', error)
    return null
  }
}

export function setActiveConversation(handle: ConversationHandle | null): void {
  setActiveConversationHandleState(handle)
  useChatStore.getState().setActiveConversation(handle?.getId() || null)
}

export async function markLocalConversationAsRead(
  conversationId: string,
  remoteIdentityId: string,
): Promise<boolean> {
  const client = chatClient
  if (!client) return false

  await client.markConversationAsRead(conversationId, remoteIdentityId, true)
  return chatClient === client
}

// Messages

export function sendMessage(
  remoteIdentityId: string,
  content: DirectMessageContent,
  optimistic?: OptimisticSendContext,
): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
  const runtime = activeChatRuntime
  if (!runtime || !isChatRuntimeCurrent(runtime) || !chatClient || !chatIdentity) {
    recordServiceDiagnostic('send', 'service_send_unavailable', {
      recipientIdentityId: remoteIdentityId,
      deliveryStage: 'failed',
      transportPath: getRelayTransportPath(),
      reason: 'chat_not_initialized',
    })
    return Promise.resolve({ success: false, error: 'Chat not initialized' })
  }

  return runtime.lease.track(sendMessageForRuntime(
    runtime,
    remoteIdentityId,
    content,
    optimistic,
  ))
}

async function sendMessageForRuntime(
  runtime: QuantumChatRuntime,
  remoteIdentityId: string,
  content: DirectMessageContent,
  optimistic?: OptimisticSendContext,
): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
  assertChatRuntimeCurrent(runtime)
  if (!chatClient || !chatIdentity) {
    return { success: false, error: 'Chat not initialized' }
  }

  const wireContent = serializeDirectMessageContent(content)
  const preSendEnvelope = parseDirectEnvelope(wireContent)
  const outgoingMessageKind = classifyDirectMessageKind(wireContent, preSendEnvelope)
  const isOutgoingControl = isControlEnvelope(preSendEnvelope)
  const previewDisplayContent = getEnvelopeBody(preSendEnvelope)
  const previewReplyTo = getEnvelopeReplyReference(preSendEnvelope)
  const previewOneTime = optimistic?.oneTime ?? getEnvelopeOneTimeState(preSendEnvelope)
  const previewDisappearingTimer = optimistic?.disappearingTimer ?? getEnvelopeDisappearingTimer(preSendEnvelope)
  const localConversationContext = getActiveLocalConversationContext()
  const bleRoute = !isOutgoingControl && outgoingMessageKind !== 'view_once'
    ? await getBLETransportRoute(remoteIdentityId)
    : null
  assertChatRuntimeCurrent(runtime)
  const preferBLE = isBleDirectRoute(bleRoute)

  syncBundleServerAccessToken()
  if (!preferBLE && !(await ensureBoundChatTransportAccess(runtime, chatIdentity.id))) {
    recordServiceDiagnostic('send', 'service_send_unavailable', {
      recipientIdentityId: remoteIdentityId,
      deliveryStage: 'failed',
      messageKind: outgoingMessageKind,
      hasAttachments: false,
      transportPath: getRelayTransportPath(),
      reason: 'identity_unbound',
    })
    return { success: false, error: 'Chat identity is not yet bound to the active Backend session' }
  }

  if (isOutgoingControl) {
    try {
      let handle = activeConversationHandle
      if (!handle || handle.getRemoteIdentity().id !== remoteIdentityId) {
        handle = await getOrCreateConversation(remoteIdentityId)
      }
      assertChatRuntimeCurrent(runtime)
      if (!handle) return { success: false, error: 'Could not create conversation' }
      recordServiceDiagnostic('send', 'service_control_dispatch', {
        conversationId: handle.getId(),
        recipientIdentityId: remoteIdentityId,
        deliveryStage: 'relaying',
        messageKind: outgoingMessageKind,
        transportPath: getRelayTransportPath(),
      })
      const result = await handle.sendMessageViaRelay(
        wireContent,
        { messageKind: outgoingMessageKind },
      )
      assertChatRuntimeCurrent(runtime)
      if (!result.relayAccepted || !result.relayed) {
        if (isRecipientUnavailableRelayFailure(result)) {
          markRemoteAccountUnavailable(remoteIdentityId)
        }
        recordServiceDiagnostic('send', 'service_control_failed', {
          conversationId: handle.getId(),
          recipientIdentityId: remoteIdentityId,
          deliveryStage: 'failed',
          messageKind: outgoingMessageKind,
          transportPath: getRelayTransportPath(),
          error: result.relayError ?? 'Relay did not accept control message',
          relayAccepted: false,
        })
        return {
          success: false,
          error: result.relayError ?? 'Control message was encrypted locally but not accepted by the relay',
        }
      }
      recordServiceDiagnostic('send', 'service_control_sent', {
        conversationId: handle.getId(),
        recipientIdentityId: remoteIdentityId,
        deliveryStage: 'relayed',
        messageKind: outgoingMessageKind,
        transportPath: getRelayTransportPath(),
        relayId: result.relayed.id,
        serverSequence: result.relayed.serverSequence,
      })
      return { success: true, message: undefined }
    } catch (error) {
      recordServiceDiagnostic('send', 'service_control_failed', {
        recipientIdentityId: remoteIdentityId,
        deliveryStage: 'failed',
        messageKind: outgoingMessageKind,
        transportPath: getRelayTransportPath(),
        error: describeDiagnosticError(error),
      })
      return { success: false, error: (error as Error).message }
    }
  }

  let optimisticMessageId: string | null = optimistic?.messageId || null
  const sendStartedAt = optimistic?.sendStartedAt ?? Date.now()

  try {
    let handle = activeConversationHandle
    if (!handle || handle.getRemoteIdentity().id !== remoteIdentityId) {
      handle = await getOrCreateConversation(remoteIdentityId)
    }
    assertChatRuntimeCurrent(runtime)
    
    if (!handle) {
      if (optimisticMessageId) {
        useChatStore.getState().updateMessage(optimisticMessageId, {
          status: 'failed',
          ...getFailedDeliveryState(),
        })
      }
      recordServiceDiagnostic('send', 'service_send_failed', {
        messageId: optimisticMessageId,
        recipientIdentityId: remoteIdentityId,
        deliveryStage: 'failed',
        transportPath: getRelayTransportPath(),
        reason: 'conversation_unavailable',
      })
      return { success: false, error: 'Could not create conversation' }
    }

    const conversationId = handle.getId()
    await reconcileOptimisticConversation(optimistic, conversationId)
    optimisticMessageId = optimistic?.messageId || createLocalMessageId()
    const optimisticTimestamp = optimistic?.timestamp ?? Date.now()
    const localOrderTimestamp = optimistic?.localOrderTimestamp ?? createLocalOrderTimestamp(optimisticTimestamp)
    const previewDisappearing = optimistic?.disappearing
      ?? createOutgoingDirectDisappearingState(previewDisappearingTimer, optimisticTimestamp)
    const { textContent: previewText } = parseMediaFromContent(previewDisplayContent)
    const {
      preview: optimisticConversationPreview,
    } = previewOneTime
      ? { preview: getViewOncePreviewLabel(previewOneTime.kind) }
      : buildDirectMessagePreview(wireContent, undefined, {
          isOwn: true,
          envelope: preSendEnvelope,
        })

    upsertOptimisticMessage({
      id: optimisticMessageId,
      conversationId,
      senderId: chatIdentity.id,
      localIdentityId: localConversationContext.localIdentityId,
      localWalletAddress: localConversationContext.localWalletAddress,
      content: previewText,
      timestamp: optimisticTimestamp,
      localOrderTimestamp,
      status: 'sending',
      ...getQueuedDeliveryState(),
      signatureVerified: true,
      replyTo: previewReplyTo,
      oneTime: previewOneTime,
      disappearing: previewDisappearing,
      systemEvent: getEnvelopeSystemEvent(preSendEnvelope),
    })

    useChatStore.getState().updateConversation(conversationId, {
      lastMessage: {
        content: optimisticConversationPreview,
        timestamp: optimisticTimestamp,
        isOwn: true,
      },
    })
    recordServiceDiagnostic('send', 'service_message_queued', {
      messageId: optimisticMessageId,
      conversationId,
      recipientIdentityId: remoteIdentityId,
      deliveryStage: 'queued',
      messageKind: outgoingMessageKind,
      hasAttachments: false,
      transportPath: getRelayTransportPath(),
    })
    if (!optimistic) {
      recordChatLatency('send', 'tap_to_optimistic_bubble', Date.now() - sendStartedAt, {
        remoteIdentityId,
        hasAttachments: false,
        torEnabled: useTorStore.getState().enabled,
      })
    }

    if (preferBLE) {
      useChatStore.getState().updateMessage(optimisticMessageId, getRelayingDeliveryState('Sending nearby'))
      recordServiceDiagnostic('send', 'service_ble_dispatch', {
        messageId: optimisticMessageId,
        conversationId,
        recipientIdentityId: remoteIdentityId,
        deliveryStage: 'relaying',
        messageKind: outgoingMessageKind,
        hasAttachments: false,
        transportPath: getRelayTransportPath('ble_mesh'),
      })

      const result = await handle.sendMessage(wireContent, {
        messageKind: outgoingMessageKind,
        localOrderTimestamp,
        disappearing: mapDisappearingStateToStored(previewDisappearing),
      })
      assertChatRuntimeCurrent(runtime)

      const displayContent = previewDisplayContent
      const replyTo: ChatMessage['replyTo'] = previewReplyTo
      const oneTime = previewOneTime
      const disappearing = previewDisappearing
      const { textContent, attachments } = parseMediaFromContent(displayContent)
      const localAttachments = annotateViewOnceAttachments(attachments, oneTime)

      const bleResult = await trySendViaBLE(remoteIdentityId, result.encrypted)
      assertChatRuntimeCurrent(runtime)
      const bleQueued = Boolean(bleResult.success || bleResult.stored)
      const bleDelivered = Boolean(bleResult.success)
      const bleStatus: NonNullable<ChatMessage['status']> = bleResult.success
        ? 'delivered'
        : bleResult.stored
          ? 'sending'
          : 'failed'
      const persistedBLEMessage = await localChatStorage.getMessage(result.decrypted.id)
      assertChatRuntimeCurrent(runtime)
      if (bleStatus === 'delivered') {
        await localChatStorage.updateMessageStatus(result.decrypted.id, 'delivered')
      } else if (
        persistedBLEMessage
        && persistedBLEMessage.status !== 'delivered'
        && persistedBLEMessage.status !== 'read'
      ) {
        await localChatStorage.storeMessage({
          ...persistedBLEMessage,
          status: bleStatus,
        })
        await localChatStorage.updateDecryptedMessage(result.decrypted.id, {
          status: bleStatus,
        }).catch(() => {})
      }
      assertChatRuntimeCurrent(runtime)
      const chatMessage: ChatMessage = {
        id: result.decrypted.id,
        conversationId,
        senderId: chatIdentity.id,
        localIdentityId: localConversationContext.localIdentityId,
        localWalletAddress: localConversationContext.localWalletAddress,
        content: textContent,
        timestamp: result.decrypted.timestamp,
        localOrderTimestamp,
        status: bleStatus,
        ...(bleStatus === 'delivered'
          ? getPersistedDeliveryState(bleStatus, true)
          : bleResult.stored
          ? getQueuedDeliveryState()
          : getFailedDeliveryState('BLE send failed')),
        signatureVerified: true,
        relayed: false,
        attachments: localAttachments,
        replyTo,
        oneTime,
        disappearing,
        systemEvent: getEnvelopeSystemEvent(preSendEnvelope),
      }

      useChatStore.getState().replaceMessage(optimisticMessageId, chatMessage)

      const { preview: lastMessageContent } = buildDirectMessagePreview(wireContent, localAttachments, {
        isOwn: true,
        envelope: preSendEnvelope,
      })
      useChatStore.getState().updateConversation(conversationId, {
        lastMessage: {
          content: lastMessageContent,
          timestamp: chatMessage.timestamp,
          isOwn: true,
        },
      })
      await localChatStorage.updateConversation(conversationId, {
        lastMessage: {
          content: lastMessageContent,
          timestamp: chatMessage.timestamp,
          senderId: chatIdentity.id,
        },
      }).catch(() => {})

      recordServiceDiagnostic('send', bleQueued ? 'service_ble_send_success' : 'service_ble_send_failed', {
        messageId: chatMessage.id,
        optimisticMessageId,
        conversationId,
        recipientIdentityId: remoteIdentityId,
        deliveryStage: chatMessage.deliveryStage,
        messageKind: outgoingMessageKind,
        hasAttachments: false,
        transportPath: getRelayTransportPath('ble_mesh'),
        stored: bleResult.stored,
        error: bleQueued ? undefined : bleResult.error,
      })

      if (!bleQueued) {
        await localChatStorage.updateMessageStatus(chatMessage.id, 'failed').catch(() => {})
        return { success: false, message: chatMessage, error: bleResult.error ?? 'BLE send failed' }
      }

      if (bleDelivered) {
        void clearRemoteAccountUnavailableAfterAcceptedOutboundMessage(
          remoteIdentityId,
          outgoingMessageKind,
        )
      }
      return { success: true, message: chatMessage }
    }

    useChatStore.getState().updateMessage(optimisticMessageId, getQueuedDeliveryState('Preparing'))
    recordServiceDiagnostic('send', 'service_relay_prepare', {
      messageId: optimisticMessageId,
      conversationId,
      recipientIdentityId: remoteIdentityId,
      deliveryStage: 'queued',
      messageKind: outgoingMessageKind,
      hasAttachments: false,
      transportPath: getRelayTransportPath(),
    })

    // Encrypt and relay the message.
    const result = await handle.sendMessageViaRelay(wireContent, {
      messageKind: outgoingMessageKind,
      localOrderTimestamp,
      disappearing: mapDisappearingStateToStored(previewDisappearing),
      onRelayNetworkStart: (decrypted) => {
        if (!isChatRuntimeCurrent(runtime)) return
        useChatStore.getState().updateMessage(optimisticMessageId!, getRelayingDeliveryState())
        recordServiceDiagnostic('send', 'service_relay_dispatch', {
          messageId: decrypted.id,
          optimisticMessageId,
          conversationId,
          recipientIdentityId: remoteIdentityId,
          deliveryStage: 'relaying',
          messageKind: outgoingMessageKind,
          hasAttachments: false,
          transportPath: getRelayTransportPath(),
        })
      },
    })
    assertChatRuntimeCurrent(runtime)
    const relayAccepted = Boolean(result.relayAccepted && result.relayed)
    if (relayAccepted) {
      void clearRemoteAccountUnavailableAfterAcceptedOutboundMessage(
        remoteIdentityId,
        outgoingMessageKind,
      )
    } else if (isRecipientUnavailableRelayFailure(result)) {
      markRemoteAccountUnavailable(remoteIdentityId)
    }
    const relayStatus: NonNullable<ChatMessage['status']> = relayAccepted ? 'sent' : 'sending'
    
    let chatMessage: ChatMessage
    let localAttachments: MediaAttachment[] | undefined
    let disappearing: DisappearingMessageState | undefined

    try {
      const displayContent = previewDisplayContent
      const replyTo: ChatMessage['replyTo'] = previewReplyTo
      const oneTime = previewOneTime
      disappearing = previewDisappearing
      const parsedMedia = parseMediaFromContent(displayContent)
      localAttachments = annotateViewOnceAttachments(parsedMedia.attachments, oneTime)
      chatMessage = {
        id: result.decrypted.id,
        conversationId,
        senderId: chatIdentity.id,
        localIdentityId: localConversationContext.localIdentityId,
        localWalletAddress: localConversationContext.localWalletAddress,
        content: parsedMedia.textContent,
        timestamp: result.decrypted.timestamp,
        localOrderTimestamp,
        status: relayStatus,
        ...(relayAccepted ? getPersistedDeliveryState(relayStatus, true) : getRelayingDeliveryState()),
        signatureVerified: true,
        relayed: relayAccepted,
        serverSequence: result.relayed?.serverSequence,
        attachments: localAttachments,
        replyTo,
        oneTime,
        disappearing,
        systemEvent: getEnvelopeSystemEvent(preSendEnvelope),
      }
      
      useChatStore.getState().replaceMessage(optimisticMessageId, chatMessage)
      if (relayAccepted) {
        reconcilePersistedOutgoingStatus(chatMessage.id, chatIdentity.id)
      }
      recordServiceDiagnostic('send', 'service_relay_result', {
        messageId: chatMessage.id,
        optimisticMessageId,
        conversationId,
        recipientIdentityId: remoteIdentityId,
        deliveryStage: relayAccepted ? chatMessage.deliveryStage : 'relaying',
        messageKind: outgoingMessageKind,
        hasAttachments: false,
        transportPath: getRelayTransportPath(),
        relayAccepted,
        relayId: result.relayed?.id,
        serverSequence: result.relayed?.serverSequence,
        error: relayAccepted ? undefined : result.relayError,
      })
      if (relayAccepted) {
        trackOutboundReceiptToken((result.relayed as { deliveryToken?: string } | undefined)?.deliveryToken)
        recordChatLatency('send', 'tap_to_relay_accept', Date.now() - sendStartedAt, {
          messageId: chatMessage.id,
          remoteIdentityId,
          hasAttachments: false,
          serverSequence: result.relayed?.serverSequence,
          torEnabled: useTorStore.getState().enabled,
        })
        scheduleOutboundStatusSyncFallback('direct_send_relay_accepted')
      }

      const { preview: lastMessageContent } = buildDirectMessagePreview(wireContent, localAttachments, {
        isOwn: true,
        envelope: preSendEnvelope,
      })
      
      useChatStore.getState().updateConversation(conversationId, {
        lastMessage: {
          content: lastMessageContent,
          timestamp: chatMessage.timestamp,
          isOwn: true,
        },
      })
      await localChatStorage.updateConversation(conversationId, {
        lastMessage: {
          content: lastMessageContent,
          timestamp: chatMessage.timestamp,
          senderId: chatIdentity.id,
        },
      }).catch(() => {})
    } catch (localError) {
      if (relayAccepted && outgoingMessageKind === 'call_invitation') {
        recordServiceDiagnostic('send', 'service_call_invitation_projection_failed', {
          optimisticMessageId,
          conversationId,
          recipientIdentityId: remoteIdentityId,
          deliveryStage: 'relayed',
          messageKind: outgoingMessageKind,
          hasAttachments: false,
          transportPath: getRelayTransportPath(),
          relayAccepted,
          relayId: result.relayed?.id,
          serverSequence: result.relayed?.serverSequence,
          error: describeDiagnosticError(localError),
        })
        return { success: true }
      }

      throw localError
    }
    
    // Do not fall back to plaintext-metadata relay storage.
    let relayError: string | undefined
    if (!relayAccepted) {
      relayError = result.relayError ?? 'Message could not be relayed'
      recordServiceDiagnostic('send', 'service_fallback_failed', {
        messageId: chatMessage.id,
        conversationId,
        recipientIdentityId: remoteIdentityId,
        deliveryStage: 'relaying',
        messageKind: outgoingMessageKind,
        hasAttachments: false,
        transportPath: getRelayTransportPath(),
        error: relayError,
      })
    }

    if (relayError) {
      if (useTorStore.getState().enabled && result.relayTransient === true) {
        await localChatStorage.updateMessageStatus(chatMessage.id, 'sending').catch(() => {})
        assertChatRuntimeCurrent(runtime)
        useChatStore.getState().updateMessage(chatMessage.id, {
          status: 'sending',
          relayed: false,
          ...getRelayingDeliveryState('Retry pending'),
        })
        schedulePendingRelayRetry(runtime, remoteIdentityId, chatMessage.id)
        recordServiceDiagnostic('send', 'service_retry_scheduled', {
          messageId: chatMessage.id,
          conversationId,
          recipientIdentityId: remoteIdentityId,
          deliveryStage: 'relaying',
          messageKind: outgoingMessageKind,
          transportPath: getRelayTransportPath(),
          error: relayError,
        })
        return {
          success: true,
          message: {
            ...chatMessage,
            status: 'sending',
            relayed: false,
            ...getRelayingDeliveryState('Retry pending'),
          },
        }
      }

      await localChatStorage.updateMessageStatus(chatMessage.id, 'failed').catch(() => {})
      useChatStore.getState().updateMessage(chatMessage.id, {
        status: 'failed',
        relayed: false,
        ...getFailedDeliveryState(),
      })
      recordServiceDiagnostic('send', 'service_send_failed', {
        messageId: chatMessage.id,
        conversationId,
        recipientIdentityId: remoteIdentityId,
        deliveryStage: 'failed',
        messageKind: outgoingMessageKind,
        hasAttachments: false,
        transportPath: getRelayTransportPath(),
        error: relayError,
      })
      return {
        success: false,
        message: {
          ...chatMessage,
          status: 'failed',
          relayed: false,
          ...getFailedDeliveryState(),
        },
        error: relayError,
      }
    }
    
    void runtime.lease.track(
      sendOwnContactProfile(runtime, remoteIdentityId).catch(() => undefined),
    )
    return { success: true, message: chatMessage }
  } catch (error) {
    if (error instanceof StaleWalletRuntimeError) {
      return { success: false, error: error.message }
    }
    console.error('Failed to send message:', error)
    if (optimisticMessageId) {
      useChatStore.getState().updateMessage(optimisticMessageId, {
        status: 'failed',
        ...getFailedDeliveryState(),
      })
    }
    recordServiceDiagnostic('send', 'service_send_failed', {
      messageId: optimisticMessageId,
      recipientIdentityId: remoteIdentityId,
      deliveryStage: 'failed',
      messageKind: outgoingMessageKind,
      hasAttachments: false,
      transportPath: getRelayTransportPath(),
      error: describeDiagnosticError(error),
    })
    return { success: false, error: (error as Error).message }
  }
}

export async function retryStoredFailedMessage(
  remoteIdentityId: string,
  failedMessage: ChatMessage,
): Promise<StoredRetryResult> {
  const runtime = activeChatRuntime
  if (!runtime || !isChatRuntimeCurrent(runtime) || !chatClient || !chatIdentity) {
    return { success: false, retriedStored: false, error: 'Chat not initialized' }
  }

  const storedMessage = await localChatStorage.getMessage(failedMessage.id).catch(() => null)
  assertChatRuntimeCurrent(runtime)
  if (!storedMessage?.encryptedData) {
    return { success: false, retriedStored: false, error: 'Message is not available for stored retry' }
  }

  syncBundleServerAccessToken()
  if (!(await ensureBoundChatTransportAccess(runtime, chatIdentity.id))) {
    return {
      success: false,
      retriedStored: true,
      error: 'Chat identity is not yet bound to the active Backend session',
    }
  }

  let handle = activeConversationHandle
  if (!handle || handle.getRemoteIdentity().id !== remoteIdentityId) {
    handle = await getOrCreateConversation(remoteIdentityId)
  }
  if (!handle) {
    return { success: false, retriedStored: true, error: 'Could not create conversation' }
  }

  useChatStore.getState().updateMessage(failedMessage.id, {
    status: 'sending',
    relayed: false,
    ...getRelayingDeliveryState(),
  })

  try {
    const result = await handle.resendMessageViaRelay(failedMessage.id)
    const relayAccepted = Boolean(result.relayAccepted && result.relayed)
    const relayStatus: NonNullable<ChatMessage['status']> = relayAccepted ? 'sent' : 'sending'
    if (!relayAccepted) {
      if (isRecipientUnavailableRelayFailure(result)) {
        markRemoteAccountUnavailable(remoteIdentityId)
      }
      const relayError = result.relayError ?? 'Message could not be relayed'
      await localChatStorage.updateMessageStatus(failedMessage.id, 'failed').catch(() => {})
      useChatStore.getState().updateMessage(failedMessage.id, {
        status: 'failed',
        relayed: false,
        ...getFailedDeliveryState(),
      })
      recordServiceDiagnostic('send', 'service_retry_failed', {
        messageId: failedMessage.id,
        conversationId: handle.getId(),
        recipientIdentityId: remoteIdentityId,
        deliveryStage: 'failed',
        transportPath: getRelayTransportPath(),
        error: relayError,
      })
      return { success: false, retriedStored: true, message: failedMessage, error: relayError }
    }

    void clearRemoteAccountUnavailableAfterAcceptedOutboundMessage(
      remoteIdentityId,
      storedMessage.messageKind,
    )
    const retriedMessage: ChatMessage = {
      ...failedMessage,
      id: result.decrypted.id,
      conversationId: handle.getId(),
      timestamp: result.decrypted.timestamp,
      localOrderTimestamp: failedMessage.localOrderTimestamp ?? failedMessage.timestamp,
      status: relayStatus,
      ...getPersistedDeliveryState(relayStatus, true),
      relayed: true,
      serverSequence: result.relayed?.serverSequence,
      deleted: false,
    }
    useChatStore.getState().updateMessage(failedMessage.id, retriedMessage)
    reconcilePersistedOutgoingStatus(retriedMessage.id, chatIdentity.id)
    await localChatStorage.updateMessageStatus(retriedMessage.id, relayStatus).catch(() => {})
    await persistDirectMessageLocalOrderTimestamp(
      retriedMessage.id,
      retriedMessage.localOrderTimestamp ?? retriedMessage.timestamp,
    )

    const { preview: lastMessageContent } = buildDirectMessagePreview(
      retriedMessage.content,
      retriedMessage.attachments,
      { isOwn: true },
    )
    useChatStore.getState().updateConversation(handle.getId(), {
      lastMessage: {
        content: lastMessageContent,
        timestamp: retriedMessage.timestamp,
        isOwn: true,
      },
    })
    await localChatStorage.updateConversation(handle.getId(), {
      lastMessage: {
        content: lastMessageContent,
        timestamp: retriedMessage.timestamp,
        senderId: chatIdentity.id,
      },
    }).catch(() => {})

    recordServiceDiagnostic('send', 'service_retry_success', {
      messageId: retriedMessage.id,
      conversationId: handle.getId(),
      recipientIdentityId: remoteIdentityId,
      deliveryStage: retriedMessage.deliveryStage,
      transportPath: getRelayTransportPath(),
      relayId: result.relayed?.id,
      serverSequence: result.relayed?.serverSequence,
    })
    trackOutboundReceiptToken((result.relayed as { deliveryToken?: string } | undefined)?.deliveryToken)
    scheduleOutboundStatusSyncFallback('direct_retry_relay_accepted')
    return { success: true, retriedStored: true, message: retriedMessage }
  } catch (error) {
    await localChatStorage.updateMessageStatus(failedMessage.id, 'failed').catch(() => {})
    useChatStore.getState().updateMessage(failedMessage.id, {
      status: 'failed',
      relayed: false,
      ...getFailedDeliveryState(),
    })
    return {
      success: false,
      retriedStored: true,
      message: failedMessage,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Syncs screenshot protection with a direct peer.
 */
export async function sendScreenshotProtectionState(
  remoteIdentityId: string,
  enabled: boolean
): Promise<boolean> {
  try {
    const envelope = createDirectEnvelope('screenshot_protection', { enabled, updatedAt: Date.now() })
    const result = await sendMessage(remoteIdentityId, envelope)
    if (!result.success) {
      throw new Error(result.error || 'Failed to deliver screenshot protection state')
    }
    return true
  } catch (error) {
    console.warn('[QuantumChat] Failed to send screenshot protection state:', error)
    return false
  }
}

/**
 * Sends a best-effort screenshot notice.
 */
export async function sendScreenshotTakenNotification(
  remoteIdentityId: string,
): Promise<boolean> {
  try {
    const envelope = createDirectEnvelope('screenshot_taken', { takenAt: Date.now() })
    const result = await sendMessage(remoteIdentityId, envelope)
    if (!result.success) {
      throw new Error(result.error || 'Failed to deliver screenshot notification')
    }
    return true
  } catch (error) {
    console.warn('[QuantumChat] Failed to send screenshot notification:', error)
    return false
  }
}

export async function sendDisappearingTimerState(
  remoteIdentityId: string,
  timer: DisappearingMessageTimer | null,
): Promise<boolean> {
  try {
    const envelope = createDirectEnvelope('disappearing_timer', {
      timer,
      updatedAt: timer?.updatedAt ?? Date.now(),
    })
    const result = await sendMessage(remoteIdentityId, envelope)
    if (!result.success) {
      throw new Error(result.error || 'Failed to deliver disappearing timer state')
    }
    return true
  } catch (error) {
    console.warn('[QuantumChat] Failed to send disappearing timer state:', error)
    return false
  }
}

export async function syncDisappearingTimerStateIfNeeded(
  remoteIdentityId: string,
  timer: DisappearingMessageTimer | null,
  source: HiddenControlSyncSource,
): Promise<boolean> {
  const normalizedTimer = normalizeDisappearingTimer(timer ?? null)
  return syncDirectDisappearingTimerState({
    remoteIdentityId,
    timerKey: serializeDisappearingTimerForSync(normalizedTimer),
    source,
    deliver: async (identityId) => sendDisappearingTimerState(identityId, normalizedTimer),
  })
}

export async function setDirectConversationDisappearingTimer(
  remoteIdentityId: string,
  timer: DisappearingMessageTimer | null,
  source: HiddenControlSyncSource = 'chat_screen',
): Promise<boolean> {
  const handle = await getOrCreateConversation(remoteIdentityId)
  if (!handle) {
    return false
  }

  const nextTimer = timer
    ? {
        ...timer,
        updatedAt: timer.updatedAt ?? Date.now(),
        updatedBy: chatIdentity?.id ?? timer.updatedBy,
      }
    : null

  await persistDirectConversationDisappearingTimer(handle.getId(), nextTimer)
  return syncDisappearingTimerStateIfNeeded(handle.getRemoteIdentity().id, nextTimer, source)
}

export async function syncScreenshotProtectionStateIfNeeded(
  remoteIdentityId: string,
  enabled: boolean,
  source: HiddenControlSyncSource,
): Promise<boolean> {
  return syncDirectHiddenControlState({
    controlType: 'screenshot_protection',
    remoteIdentityId,
    enabled,
    source,
    deliver: sendScreenshotProtectionState,
  })
}

export async function syncScreenshotProtectionStateForRecipients(
  remoteIdentityIds: Array<string | null | undefined>,
  enabled: boolean,
  source: HiddenControlSyncSource,
): Promise<void> {
  await Promise.allSettled(
    uniqueSortedIds(remoteIdentityIds).map((remoteIdentityId) =>
      syncScreenshotProtectionStateIfNeeded(remoteIdentityId, enabled, source)
    )
  )
}

const MEDIA_SEND_LOG_PREFIX = '[MediaSend]'

function summarizeMediaSendValue(value?: string | null): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  if (value.length <= 96) {
    return value
  }

  return `${value.slice(0, 40)}...${value.slice(-32)}`
}

function describeMediaSendAttachment(
  attachment: Pick<MediaAttachment, 'id' | 'type' | 'source' | 'uri' | 'fileName' | 'mimeType' | 'fileSize' | 'width' | 'height' | 'durationMs'>
): Record<string, unknown> {
  return {
    id: attachment.id,
    type: attachment.type,
    source: attachment.source ?? null,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    width: attachment.width,
    height: attachment.height,
    durationMs: attachment.durationMs,
    uri: summarizeMediaSendValue(attachment.uri),
  }
}

function logMediaSend(event: string, details?: Record<string, unknown>): void {
  if (!__DEV__) {
    return
  }

  if (details) {
    console.log(`${MEDIA_SEND_LOG_PREFIX} ${event}`, details)
    return
  }

  console.log(`${MEDIA_SEND_LOG_PREFIX} ${event}`)
}

/**
 * Sends encrypted media references with a chat message.
 */
export async function sendMediaMessage(
  remoteIdentityId: string,
  content: string,
  attachments: ChatMessage['attachments'],
  onProgress?: (progress: MessageSendProgress) => void,
  optimistic?: OptimisticSendContext,
): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
  const runtime = activeChatRuntime
  const sendStartedAt = optimistic?.sendStartedAt ?? Date.now()
  const attachmentSendId = optimistic?.attachmentSendId ?? null
  const oneTime = optimistic?.oneTime
  const disappearingTimer = optimistic?.disappearingTimer ?? null
  const attachmentSummaries = attachments?.map((attachment) => describeMediaSendAttachment(attachment)) ?? []
  const sendLogContext = {
    remoteIdentityId: summarizeMediaSendValue(remoteIdentityId),
    attachmentCount: attachmentSummaries.length,
    attachmentSendId,
    attachments: attachmentSummaries,
    contentLength: content.length,
    optimisticMessageId: optimistic?.messageId ?? null,
    optimisticConversationId: optimistic?.conversationId ?? null,
    activeConversationId: activeConversationHandle?.getId() ?? null,
  }
  let optimisticMessageId: string | null = optimistic?.messageId || null
  let currentConversationId: string | null = optimistic?.conversationId ?? null
  let lastSuccessfulAttachmentStage: string | null = 'send_started'
  let preparedAttachments: PreparedOutgoingMediaAttachment[] = []
  let mediaRelayAccepted = false

  const buildAttachmentContext = (
    overrides: Partial<AttachmentPipelineTraceContext> = {},
  ): AttachmentPipelineTraceContext | null => {
    if (!attachmentSendId) {
      return null
    }

    return {
      attachmentSendId,
      sendStartedAt,
      attachmentCount: attachments?.length ?? 0,
      conversationId: currentConversationId ?? undefined,
      optimisticMessageId: optimisticMessageId ?? undefined,
      ...overrides,
    }
  }

  logMediaSend('send_media_message_start', sendLogContext)

  if (!runtime || !isChatRuntimeCurrent(runtime) || !chatClient || !chatIdentity) {
    console.warn(`${MEDIA_SEND_LOG_PREFIX} send_media_message_unavailable`, {
      ...sendLogContext,
      reason: 'chat_not_initialized',
    })
    recordServiceDiagnostic('send', 'service_send_unavailable', {
      recipientIdentityId: remoteIdentityId,
      deliveryStage: 'failed',
      hasAttachments: true,
      transportPath: getRelayTransportPath(),
      reason: 'chat_not_initialized',
    })
    recordAttachmentPipelineFailure(buildAttachmentContext(), {
      failureStage: 'chat_not_initialized',
      lastSuccessfulStage: lastSuccessfulAttachmentStage,
      error: 'Chat not initialized',
    })
    return { success: false, error: 'Chat not initialized' }
  }

  const localConversationContext = getActiveLocalConversationContext()
  
  if (!attachments || attachments.length === 0) {
    logMediaSend('send_media_message_fallback_to_text', sendLogContext)
    return sendMessage(remoteIdentityId, content)
  }

  syncBundleServerAccessToken()
  if (!(await ensureBoundChatTransportAccess(runtime, chatIdentity.id))) {
    console.warn(`${MEDIA_SEND_LOG_PREFIX} send_media_message_identity_unbound`, {
      ...sendLogContext,
      senderIdentityId: summarizeMediaSendValue(chatIdentity.id),
    })
    recordServiceDiagnostic('send', 'service_send_unavailable', {
      recipientIdentityId: remoteIdentityId,
      deliveryStage: 'failed',
      hasAttachments: true,
      transportPath: getRelayTransportPath(),
      reason: 'identity_unbound',
      attachmentCount: attachments.length,
    })
    recordAttachmentPipelineFailure(buildAttachmentContext(), {
      failureStage: 'identity_unbound',
      lastSuccessfulStage: lastSuccessfulAttachmentStage,
      error: 'Chat identity is not yet bound to the active Backend session',
    })
    return { success: false, error: 'Chat identity is not yet bound to the active Backend session' }
  }
  try {
    let handle = activeConversationHandle
    if (!handle || handle.getRemoteIdentity().id !== remoteIdentityId) {
      handle = await getOrCreateConversation(remoteIdentityId)
    }
    
    if (!handle) {
      if (optimisticMessageId) {
        useChatStore.getState().updateMessage(optimisticMessageId, {
          status: 'failed',
          ...getFailedDeliveryState(),
        })
      }
      recordServiceDiagnostic('send', 'service_send_failed', {
        messageId: optimisticMessageId,
        recipientIdentityId: remoteIdentityId,
        deliveryStage: 'failed',
        hasAttachments: true,
        transportPath: getRelayTransportPath(),
        reason: 'conversation_unavailable',
      })
      recordAttachmentPipelineFailure(buildAttachmentContext(), {
        failureStage: 'conversation_unavailable',
        lastSuccessfulStage: lastSuccessfulAttachmentStage,
        error: 'Could not create conversation',
      })
      return { success: false, error: 'Could not create conversation' }
    }
    
    const conversationId = handle.getId()
    currentConversationId = conversationId
    logMediaSend('send_media_message_conversation_ready', {
      ...sendLogContext,
      senderIdentityId: summarizeMediaSendValue(chatIdentity.id),
      conversationId: summarizeMediaSendValue(conversationId),
      optimisticMessageId,
    })
    await reconcileOptimisticConversation(optimistic, conversationId)
    optimisticMessageId = optimistic?.messageId || createLocalMessageId()
    const optimisticTimestamp = optimistic?.timestamp ?? Date.now()
    const localOrderTimestamp = optimistic?.localOrderTimestamp ?? createLocalOrderTimestamp(optimisticTimestamp)
    const optimisticDisappearing = optimistic?.disappearing
      ?? createOutgoingDirectDisappearingState(disappearingTimer, optimisticTimestamp)
    const optimisticAttachments = annotateViewOnceAttachments(
      attachments.map((attachment) => ({
        ...attachment,
        isEncrypted: false,
      })),
      oneTime,
    ) ?? []
    const optimisticPreview = oneTime
      ? getViewOncePreviewLabel(oneTime.kind)
      : content || `📎 ${optimisticAttachments[0].type === 'voice_note'
        ? 'Voice message'
        : optimisticAttachments[0].type === 'image'
          ? 'Photo'
          : optimisticAttachments[0].type === 'video'
            ? 'Video'
            : optimisticAttachments[0].type === 'document'
              ? 'Document'
              : 'Attachment'}`

    upsertOptimisticMessage({
      id: optimisticMessageId,
      conversationId,
      senderId: chatIdentity.id,
      localIdentityId: localConversationContext.localIdentityId,
      localWalletAddress: localConversationContext.localWalletAddress,
      content,
      timestamp: optimisticTimestamp,
      localOrderTimestamp,
      status: 'sending',
      ...getQueuedDeliveryState(),
      signatureVerified: true,
      attachments: optimisticAttachments,
      replyTo: optimistic?.replyTo,
      oneTime,
      disappearing: optimisticDisappearing,
    })
    useChatStore.getState().updateConversation(conversationId, {
      lastMessage: {
        content: optimisticPreview,
        timestamp: optimisticTimestamp,
        isOwn: true,
      },
    })
    recordServiceDiagnostic('send', 'service_message_queued', {
      messageId: optimisticMessageId,
      conversationId,
      recipientIdentityId: remoteIdentityId,
      deliveryStage: 'queued',
      hasAttachments: true,
      transportPath: getRelayTransportPath(),
    })
    if (!optimistic) {
      recordChatLatency('send', 'tap_to_optimistic_bubble', Date.now() - sendStartedAt, {
        remoteIdentityId,
        hasAttachments: true,
        torEnabled: useTorStore.getState().enabled,
      })
    }
    useChatStore.getState().updateMessage(optimisticMessageId, getRelayingDeliveryState('Uploading'))
    recordServiceDiagnostic('send', 'service_upload_dispatch', {
      messageId: optimisticMessageId,
      conversationId,
      recipientIdentityId: remoteIdentityId,
      deliveryStage: 'relaying',
      hasAttachments: true,
      transportPath: getRelayTransportPath(),
      attachmentCount: attachments.length,
    })
    const recordAttachmentDiagnostic = (
      name: string,
      fields: Record<string, TelemetryFieldValue>,
    ): void => {
      recordServiceDiagnostic('send', name, fields)
    }

    const preparationResults = await Promise.allSettled(
      attachments.map((attachment) => prepareOutgoingMediaAttachment(attachment)),
    )
    const preparationFailure = preparationResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    )
    if (preparationFailure) {
      await Promise.allSettled(
        preparationResults
          .filter((result): result is PromiseFulfilledResult<PreparedOutgoingMediaAttachment> => (
            result.status === 'fulfilled'
          ))
          .map((result) => releasePreparedOutgoingMediaAttachment(result.value)),
      )
      throw preparationFailure.reason
    }
    preparedAttachments = preparationResults.map(
      (result) => (result as PromiseFulfilledResult<PreparedOutgoingMediaAttachment>).value,
    )

    const uploadedMedia: Array<{
      id: string
      storagePath: string
      downloadUrl: string
      encryptionKey: string
      type: string
      fileName: string
      mimeType: string
      fileSize: number
      width?: number
      height?: number
      durationMs?: number
      waveform?: number[]
    }> = []
    
    const uploadConcurrency = useTorStore.getState().enabled ? 2 : 3
    try {
      const uploadResults = await mapWithConcurrency(
        preparedAttachments,
        uploadConcurrency,
        async (preparedAttachment, i) => {
          const attachment = preparedAttachment.attachment
          const attachmentSummary = attachmentSummaries[i] ?? describeMediaSendAttachment(attachment)

          onProgress?.({
            stage: 'attachment_upload',
            percentage: Math.floor((i / attachments.length) * 80),
            completed: i + 1,
            total: attachments.length,
          })
          logMediaSend('send_media_message_attachment_upload_start', {
            ...sendLogContext,
            conversationId: summarizeMediaSendValue(conversationId),
            optimisticMessageId,
            attachmentIndex: i + 1,
            attachmentCount: attachments.length,
            attachment: attachmentSummary,
          })

          const uploaded = await uploadEncryptedMedia(
            preparedAttachment,
            chatIdentity!.id,
            remoteIdentityId,
            conversationId,
            (mediaProgress) => {
              const baseProgress = (i / attachments.length) * 80
              const itemProgress = (mediaProgress.percentage / 100) * (80 / attachments.length)
              onProgress?.({
                stage: 'attachment_upload',
                percentage: Math.floor(baseProgress + itemProgress),
                completed: i + 1,
                total: attachments.length,
              })
            },
            {
              attachmentSendId,
              sendStartedAt,
              attachmentIndex: i + 1,
              attachmentCount: attachments.length,
              optimisticMessageId,
              conversationId,
              attempt: 1,
              recordDiagnostic: recordAttachmentDiagnostic,
            },
          )
          logMediaSend('send_media_message_attachment_upload_success', {
            ...sendLogContext,
            conversationId: summarizeMediaSendValue(conversationId),
            optimisticMessageId,
            attachmentIndex: i + 1,
            attachmentCount: attachments.length,
            attachment: attachmentSummary,
            uploadedMediaId: uploaded.id,
            storagePath: summarizeMediaSendValue(uploaded.storagePath),
            encryptedSize: uploaded.encryptedSize,
            isChunked: uploaded.isChunked,
            totalChunks: uploaded.totalChunks,
          })

          return {
            id: uploaded.id,
            storagePath: uploaded.storagePath,
            downloadUrl: uploaded.downloadUrl,
            encryptionKey: uploaded.encryptionKey,
            type: attachment.type,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            fileSize: attachment.fileSize,
            width: attachment.width,
            height: attachment.height,
            durationMs: attachment.durationMs,
            waveform: attachment.waveform,
          }
        },
      )
      uploadedMedia.push(...uploadResults)
    } catch (uploadError) {
      const failedIndex = uploadedMedia.length
      const failedAttachment = attachments[failedIndex] ?? attachments[0]
      const failedSummary = attachmentSummaries[failedIndex] ?? describeMediaSendAttachment(failedAttachment)
      console.error(`${MEDIA_SEND_LOG_PREFIX} send_media_message_attachment_upload_failed`, {
        ...sendLogContext,
        conversationId: summarizeMediaSendValue(conversationId),
        optimisticMessageId,
        attachmentIndex: failedIndex + 1,
        attachmentCount: attachments.length,
        attachment: failedSummary,
        error: describeDiagnosticError(uploadError),
      })
      useChatStore.getState().updateMessage(optimisticMessageId, {
        status: 'failed',
        ...getFailedDeliveryState(),
      })
      recordServiceDiagnostic('send', 'service_upload_failed', {
        messageId: optimisticMessageId,
        conversationId,
        recipientIdentityId: remoteIdentityId,
        deliveryStage: 'failed',
        hasAttachments: true,
        transportPath: getRelayTransportPath(),
        attachmentName: failedAttachment.fileName,
        error: describeDiagnosticError(uploadError),
      })
      const failureDetails = getAttachmentPipelineFailureDetails(uploadError)
      recordAttachmentPipelineFailure(buildAttachmentContext({
        attachmentIndex: failedIndex + 1,
        fileSize: failedAttachment.fileSize,
        mimeType: failedAttachment.mimeType,
      }), {
        failureStage: failureDetails?.failureStage ?? 'upload_encrypt_started',
        lastSuccessfulStage: failureDetails?.lastSuccessfulStage ?? lastSuccessfulAttachmentStage,
        statusCode: failureDetails?.statusCode ?? undefined,
        failureReason: failureDetails?.failureReason ?? undefined,
        transient: failureDetails?.transient ?? undefined,
        error: describeDiagnosticError(uploadError),
      })
      await requestMediaSendAbandonmentForSend(
        optimisticMessageId,
        runtime.lease.walletScope,
      ).catch((cleanupError) => {
        recordServiceDiagnostic('send', 'service_media_cleanup_schedule_failed', {
          messageId: optimisticMessageId,
          conversationId,
          reason: 'upload_failed',
          error: describeDiagnosticError(cleanupError),
        })
      })
      return { success: false, error: `Failed to upload ${failedAttachment.fileName}: ${(uploadError as Error).message}` }
    }
    lastSuccessfulAttachmentStage = 'chat_media_insert_succeeded'
    logMediaSend('send_media_message_all_uploads_complete', {
      ...sendLogContext,
      conversationId: summarizeMediaSendValue(conversationId),
      optimisticMessageId,
      uploadedMediaCount: uploadedMedia.length,
    })
    
    onProgress?.({ stage: 'preparing_message', percentage: 85 })
    useChatStore.getState().updateMessage(optimisticMessageId, getQueuedDeliveryState('Preparing'))
    recordServiceDiagnostic('send', 'service_relay_prepare', {
      messageId: optimisticMessageId,
      conversationId,
      recipientIdentityId: remoteIdentityId,
      deliveryStage: 'queued',
      hasAttachments: true,
      transportPath: getRelayTransportPath(),
      attachmentCount: attachments.length,
    })
    
    // QMEDIA references carry the encrypted media ID and key.
    const mediaReferences = buildQMediaReferences(uploadedMedia)
    
    const messageBody = mediaReferences + (content ? `\n${content}` : '')
    const messageContent = serializeDirectMessageContent(oneTime
      ? createDirectEnvelope('view_once', {
          kind: oneTime.kind,
          body: messageBody,
          ...(optimistic?.replyTo ? { replyTo: optimistic.replyTo } : {}),
          ...(disappearingTimer ? { disappearing: disappearingTimer } : {}),
        })
      : optimistic?.replyTo
        ? createDirectEnvelope('text', {
            text: messageBody,
            replyTo: optimistic.replyTo,
            ...(disappearingTimer ? { disappearing: disappearingTimer } : {}),
          })
        : disappearingTimer
          ? createDirectEnvelope('text', {
              text: messageBody,
              disappearing: disappearingTimer,
            })
          : messageBody)
    const outgoingEnvelope = parseDirectEnvelope(messageContent)
    const outgoingMessageKind = classifyDirectMessageKind(messageContent, outgoingEnvelope)
    logMediaSend('send_media_message_relay_dispatch', {
      ...sendLogContext,
      conversationId: summarizeMediaSendValue(conversationId),
      optimisticMessageId,
      uploadedMediaCount: uploadedMedia.length,
      messageContentLength: messageContent.length,
      mediaReferenceLength: mediaReferences.length,
      messageKind: outgoingMessageKind,
    })
    const result = await handle.sendMessageViaRelay(
      messageContent,
      attachmentSendId
        ? {
            messageKind: outgoingMessageKind,
            localOrderTimestamp,
            disappearing: mapDisappearingStateToStored(optimisticDisappearing),
            attachmentTrace: {
              attachmentSendId,
              sendStartedAt,
              attachmentCount: attachments.length,
              conversationId,
              optimisticMessageId,
            },
            onRelayNetworkStart: (decrypted) => {
              if (!isChatRuntimeCurrent(runtime)) return
              onProgress?.({ stage: 'sending_message', percentage: 90 })
              useChatStore.getState().updateMessage(optimisticMessageId!, getRelayingDeliveryState())
              recordServiceDiagnostic('send', 'service_relay_dispatch', {
                messageId: decrypted.id,
                optimisticMessageId,
                conversationId,
                recipientIdentityId: remoteIdentityId,
                deliveryStage: 'relaying',
                hasAttachments: true,
                transportPath: getRelayTransportPath(),
                attachmentCount: attachments.length,
              })
            },
          }
        : {
            messageKind: outgoingMessageKind,
            localOrderTimestamp,
            disappearing: mapDisappearingStateToStored(optimisticDisappearing),
            onRelayNetworkStart: (decrypted) => {
              if (!isChatRuntimeCurrent(runtime)) return
              onProgress?.({ stage: 'sending_message', percentage: 90 })
              useChatStore.getState().updateMessage(optimisticMessageId!, getRelayingDeliveryState())
              recordServiceDiagnostic('send', 'service_relay_dispatch', {
                messageId: decrypted.id,
                optimisticMessageId,
                conversationId,
                recipientIdentityId: remoteIdentityId,
                deliveryStage: 'relaying',
                hasAttachments: true,
                transportPath: getRelayTransportPath(),
                attachmentCount: attachments.length,
              })
            },
          },
    )
    const relayAccepted = Boolean(result.relayAccepted && result.relayed)
    mediaRelayAccepted = relayAccepted
    if (relayAccepted) {
      void clearRemoteAccountUnavailableAfterAcceptedOutboundMessage(
        remoteIdentityId,
        outgoingMessageKind,
      )
    } else if (isRecipientUnavailableRelayFailure(result)) {
      markRemoteAccountUnavailable(remoteIdentityId)
    }
    await recordMediaSendRelayOutcome(
      uploadedMedia.map((media) => media.id),
      relayAccepted
        ? 'accepted'
        : result.relayTransient === false
          ? 'terminal_failure'
          : 'transient_failure',
      runtime.lease.walletScope,
    ).catch((outboxError) => {
      recordServiceDiagnostic('send', 'service_media_outbox_update_failed', {
        messageId: optimisticMessageId,
        conversationId,
        relayAccepted,
        error: describeDiagnosticError(outboxError),
      })
    })
    assertChatRuntimeCurrent(runtime)
    const relayStatus: NonNullable<ChatMessage['status']> = relayAccepted ? 'sent' : 'sending'
    lastSuccessfulAttachmentStage = 'relay_encrypt_succeeded'
    logMediaSend('send_media_message_relay_result', {
      ...sendLogContext,
      conversationId: summarizeMediaSendValue(conversationId),
      optimisticMessageId,
      relayAccepted,
      relayId: result.relayed?.id ?? null,
      serverSequence: result.relayed?.serverSequence ?? null,
      relayError: result.relayError ?? null,
    })
    
    onProgress?.({ stage: 'caching_locally', percentage: 95 })
    
    // Cache sender media after picker URIs expire.
    const MAX_CACHE_ATTEMPTS = 2
    const localAttachments = await Promise.all(
      attachments.map(async (attachment, i) => {
        const uploaded = uploadedMedia[i]
        const sourceAttachment = preparedAttachments[i]?.attachment ?? attachment
        const attachmentSummary = attachmentSummaries[i] ?? describeMediaSendAttachment(attachment)

        let finalUri = sourceAttachment.uri
        logMediaSend('send_media_message_local_cache_start', {
          ...sendLogContext,
          conversationId: summarizeMediaSendValue(conversationId),
          optimisticMessageId,
          attachmentIndex: i + 1,
          attachmentCount: attachments.length,
          attachment: attachmentSummary,
          uploadedMediaId: uploaded.id,
        })
        recordAttachmentPipelineStage(buildAttachmentContext({
          attachmentIndex: i + 1,
          fileSize: sourceAttachment.fileSize,
          mimeType: sourceAttachment.mimeType,
          messageId: result.decrypted.id,
        }), 'local_cache_started', {
          attempt: 1,
          uploadedMediaId: uploaded.id,
        })

        for (let attempt = 0; attempt < MAX_CACHE_ATTEMPTS; attempt++) {
          try {
            const cached = await cacheMediaFromFile(
              uploaded.id,
              result.decrypted.id,
              conversationId,
              sourceAttachment
            )

            const fileInfo = await FileSystem.getInfoAsync(cached.localUri)

            if (fileInfo.exists) {
              finalUri = cached.localUri
              logMediaSend('send_media_message_local_cache_success', {
                ...sendLogContext,
                conversationId: summarizeMediaSendValue(conversationId),
                optimisticMessageId,
                attachmentIndex: i + 1,
                attachmentCount: attachments.length,
                attempt: attempt + 1,
                uploadedMediaId: uploaded.id,
                localUri: summarizeMediaSendValue(cached.localUri),
              })
              break
            }
          } catch (cacheError) {
            console.warn(`${MEDIA_SEND_LOG_PREFIX} send_media_message_local_cache_attempt_failed`, {
              ...sendLogContext,
              conversationId: summarizeMediaSendValue(conversationId),
              optimisticMessageId,
              attachmentIndex: i + 1,
              attachmentCount: attachments.length,
              attempt: attempt + 1,
              uploadedMediaId: uploaded.id,
              error: describeDiagnosticError(cacheError),
            })
            if (attempt < MAX_CACHE_ATTEMPTS - 1) {
              await new Promise(r => setTimeout(r, 200))
            } else {
              console.warn('Failed to cache media after retries, using picker URI:', cacheError)
              console.warn(`${MEDIA_SEND_LOG_PREFIX} send_media_message_local_cache_fallback_picker_uri`, {
                ...sendLogContext,
                conversationId: summarizeMediaSendValue(conversationId),
                optimisticMessageId,
                attachmentIndex: i + 1,
                attachmentCount: attachments.length,
                uploadedMediaId: uploaded.id,
                pickerUri: summarizeMediaSendValue(sourceAttachment.uri),
              })
            }
          }
        }

        return {
          id: uploaded.id,
          type: sourceAttachment.type,
          uri: finalUri,
          fileName: sourceAttachment.fileName,
          mimeType: sourceAttachment.mimeType,
          fileSize: sourceAttachment.fileSize,
          width: sourceAttachment.width,
          height: sourceAttachment.height,
          durationMs: sourceAttachment.durationMs,
          waveform: sourceAttachment.waveform,
          isEncrypted: false,
          isViewOnce: Boolean(oneTime),
        }
      })
    )
    
    const chatMessage: ChatMessage = {
      id: result.decrypted.id,
      conversationId: handle.getId(),
      senderId: chatIdentity.id,
      localIdentityId: localConversationContext.localIdentityId,
      localWalletAddress: localConversationContext.localWalletAddress,
      content,
      timestamp: result.decrypted.timestamp,
      localOrderTimestamp,
      status: relayStatus,
      ...(relayAccepted ? getPersistedDeliveryState(relayStatus, true) : getRelayingDeliveryState()),
      signatureVerified: true,
      relayed: relayAccepted,
      serverSequence: result.relayed?.serverSequence,
      attachments: localAttachments,
      replyTo: optimistic?.replyTo,
      oneTime,
      disappearing: optimisticDisappearing,
    }
    
    useChatStore.getState().replaceMessage(optimisticMessageId, chatMessage)
    if (relayAccepted) {
      reconcilePersistedOutgoingStatus(chatMessage.id, chatIdentity.id)
    }
    recordServiceDiagnostic('send', 'service_relay_result', {
      messageId: chatMessage.id,
      optimisticMessageId,
      conversationId: handle.getId(),
      recipientIdentityId: remoteIdentityId,
      deliveryStage: relayAccepted ? chatMessage.deliveryStage : 'relaying',
      hasAttachments: true,
      transportPath: getRelayTransportPath(),
      relayAccepted,
      relayId: result.relayed?.id,
      serverSequence: result.relayed?.serverSequence,
      attachmentCount: attachments.length,
      error: relayAccepted ? undefined : result.relayError,
      failureReason: relayAccepted ? undefined : result.relayFailureReason,
      statusCode: relayAccepted ? undefined : result.relayStatusCode,
      transient: relayAccepted ? undefined : result.relayTransient,
    })
    if (relayAccepted) {
      trackOutboundReceiptToken((result.relayed as { deliveryToken?: string } | undefined)?.deliveryToken)
      recordChatLatency('send', 'tap_to_relay_accept', Date.now() - sendStartedAt, {
        messageId: chatMessage.id,
        remoteIdentityId,
        hasAttachments: true,
        serverSequence: result.relayed?.serverSequence,
        torEnabled: useTorStore.getState().enabled,
      })
      scheduleOutboundStatusSyncFallback('media_send_relay_accepted')
    }
    const { preview: lastMessageContent } = buildDirectMessagePreview(
      messageContent,
      localAttachments,
      { isOwn: true, envelope: outgoingEnvelope },
    )
    
    useChatStore.getState().updateConversation(handle.getId(), {
      lastMessage: {
        content: lastMessageContent,
        timestamp: chatMessage.timestamp,
        isOwn: true,
      },
    })
    await localChatStorage.updateConversation(handle.getId(), {
      lastMessage: {
        content: lastMessageContent,
        timestamp: chatMessage.timestamp,
        senderId: chatIdentity.id,
      },
    }).catch(() => {})

    if (!relayAccepted) {
      await localChatStorage.updateMessageStatus(chatMessage.id, 'failed').catch(() => {})
      const failedMessage: ChatMessage = {
        ...chatMessage,
        status: 'failed',
        relayed: false,
        ...getFailedDeliveryState(),
      }
      useChatStore.getState().updateMessage(chatMessage.id, failedMessage)
      useChatStore.getState().updateConversation(conversationId, {
        lastMessage: {
          content: optimisticPreview,
          timestamp: failedMessage.timestamp,
          isOwn: true,
        },
      })
      recordServiceDiagnostic('send', 'service_send_failed', {
        messageId: chatMessage.id,
        conversationId,
        recipientIdentityId: remoteIdentityId,
        deliveryStage: 'failed',
        hasAttachments: true,
        transportPath: getRelayTransportPath(),
        error: result.relayError ?? 'Failed to relay media message',
        attachmentCount: attachments.length,
      })
      recordAttachmentPipelineFailure(buildAttachmentContext({
        messageId: chatMessage.id,
      }), {
        failureStage: 'relay_accept_failed',
        lastSuccessfulStage: lastSuccessfulAttachmentStage,
        statusCode: result.relayStatusCode ?? undefined,
        failureReason: result.relayFailureReason ?? result.relayError ?? undefined,
        transient: result.relayTransient ?? undefined,
        error: result.relayError ?? 'Failed to relay media message',
      })
      console.warn(`${MEDIA_SEND_LOG_PREFIX} send_media_message_relay_failed`, {
        ...sendLogContext,
        conversationId: summarizeMediaSendValue(conversationId),
        optimisticMessageId,
        relayError: result.relayError ?? 'Failed to relay media message',
      })
      return {
        success: false,
        message: failedMessage,
        error: result.relayError ?? 'Failed to relay media message',
      }
    }
    
    onProgress?.({ stage: 'complete', percentage: 100 })
    logMediaSend('send_media_message_success', {
      ...sendLogContext,
      conversationId: summarizeMediaSendValue(conversationId),
      optimisticMessageId,
      finalMessageId: chatMessage.id,
      relayId: result.relayed?.id ?? null,
      serverSequence: result.relayed?.serverSequence ?? null,
    })
    void runtime.lease.track(
      sendOwnContactProfile(runtime, remoteIdentityId).catch(() => undefined),
    )
    return { success: true, message: chatMessage }
  } catch (error) {
    if (optimisticMessageId && !mediaRelayAccepted) {
      await requestMediaSendAbandonmentForSend(
        optimisticMessageId,
        runtime.lease.walletScope,
      ).catch((cleanupError) => {
        recordServiceDiagnostic('send', 'service_media_cleanup_schedule_failed', {
          messageId: optimisticMessageId,
          reason: 'send_failed',
          error: describeDiagnosticError(cleanupError),
        })
      })
    }
    if (error instanceof StaleWalletRuntimeError) {
      return { success: false, error: error.message }
    }
    console.error(`${MEDIA_SEND_LOG_PREFIX} send_media_message_failed`, {
      ...sendLogContext,
      optimisticMessageId,
      error: describeDiagnosticError(error),
    })
    if (optimisticMessageId) {
      useChatStore.getState().updateMessage(optimisticMessageId, {
        status: 'failed',
        ...getFailedDeliveryState(),
      })
    }
    recordServiceDiagnostic('send', 'service_send_failed', {
      messageId: optimisticMessageId,
      recipientIdentityId: remoteIdentityId,
      deliveryStage: 'failed',
      hasAttachments: true,
      transportPath: getRelayTransportPath(),
      error: describeDiagnosticError(error),
      attachmentCount: attachments.length,
    })
    const failureDetails = getAttachmentPipelineFailureDetails(error)
    recordAttachmentPipelineFailure(buildAttachmentContext(), {
      failureStage: failureDetails?.failureStage ?? 'send_media_message',
      lastSuccessfulStage: failureDetails?.lastSuccessfulStage ?? lastSuccessfulAttachmentStage,
      statusCode: failureDetails?.statusCode ?? undefined,
      failureReason: failureDetails?.failureReason ?? undefined,
      transient: failureDetails?.transient ?? undefined,
      error: describeDiagnosticError(error),
    })
    return { success: false, error: (error as Error).message }
  } finally {
    await Promise.allSettled(
      preparedAttachments.map(releasePreparedOutgoingMediaAttachment),
    )
  }
}

async function applyViewOnceConsumption(
  targetMessageId: string,
  conversationId: string,
  consumedAt: number = Date.now(),
  source: ViewOnceConsumptionSource = { kind: 'local' },
): Promise<boolean> {
  const store = useChatStore.getState()
  const inMemoryMessage = store.messages.find((message) => message.id === targetMessageId)
  const storedDecryptedMessage = await localChatStorage.getDecryptedMessage(targetMessageId).catch(() => null)
  const storedEncryptedMessage = await localChatStorage.getMessage(targetMessageId).catch(() => null)
  const storedEnvelope = storedDecryptedMessage?.content
    ? parseDirectEnvelope(storedDecryptedMessage.content)
    : null
  const storedOneTime = inMemoryMessage?.oneTime
    ?? getStoredOneTimeState(storedDecryptedMessage ?? { messageKind: undefined, oneTime: undefined })
    ?? getStoredOneTimeState(storedEncryptedMessage ?? { messageKind: undefined, oneTime: undefined })
    ?? (storedEnvelope ? getEnvelopeOneTimeState(storedEnvelope) : undefined)
  const storedAttachments = storedDecryptedMessage?.content
    ? parseMediaFromContent(getEnvelopeBody(storedEnvelope ?? { type: 'plain', text: storedDecryptedMessage.content })).attachments
    : undefined

  const targetExists = Boolean(inMemoryMessage || storedDecryptedMessage || storedEncryptedMessage)
  const storedDecryptedConversationId = typeof storedDecryptedMessage?.conversationId === 'string'
    ? storedDecryptedMessage.conversationId
    : undefined
  const storedEncryptedConversationId = typeof storedEncryptedMessage?.conversationId === 'string'
    ? storedEncryptedMessage.conversationId
    : undefined
  const targetConversationId = inMemoryMessage?.conversationId
    ?? storedDecryptedConversationId
    ?? storedEncryptedConversationId
  const targetSenderId = inMemoryMessage?.senderId
    ?? storedDecryptedMessage?.senderId
    ?? storedEncryptedMessage?.senderId
  const targetTimestamp = inMemoryMessage?.timestamp ?? storedDecryptedMessage?.timestamp
  const targetOneTime = storedOneTime
  const decision = authorizeViewOnceConsumption({
    consumedAt,
    requestedConversationId: conversationId,
    targetExists,
    targetConversationId,
    targetSenderId,
    targetOneTime,
    source,
  })

  if (!decision.allowed || !targetOneTime) {
    const senderFields = source.kind === 'remote'
      ? { senderIdentityId: source.controlSenderId }
      : {}
    const suppressionReason = decision.allowed ? 'target_not_view_once' : decision.reason
    recordServiceDiagnostic('receive', 'service_message_suppressed', {
      messageId: targetMessageId,
      conversationId,
      envelopeType: 'view_once_consumed',
      suppressionReason,
      ...senderFields,
    })
    return false
  }

  const resolvedConversationId = targetConversationId ?? conversationId
  const consumedUpdates = getConsumedOneTimeUpdates({ oneTime: targetOneTime }, consumedAt)

  store.updateMessage(targetMessageId, consumedUpdates)

  if (storedDecryptedMessage) {
    await localChatStorage.updateDecryptedMessage(targetMessageId, {
      content: VIEW_ONCE_CONSUMED_TEXT,
      messageKind: 'view_once',
      oneTime: {
        state: 'consumed',
        kind: targetOneTime?.kind,
        consumedAt,
      },
    }).catch(() => {})
  }

  if (storedEncryptedMessage) {
    await localChatStorage.storeMessage({
      ...storedEncryptedMessage,
      content: undefined,
      messageKind: 'view_once',
      oneTime: {
        state: 'consumed',
        kind: targetOneTime?.kind,
        consumedAt,
      },
      encryptedData: {
        ...storedEncryptedMessage.encryptedData,
        ciphertext: '',
        tag: '',
        nonce: '',
        signature: '',
        x3dhData: undefined,
      },
    }).catch(() => {})
  }

  const attachmentsToDelete = inMemoryMessage?.attachments ?? storedAttachments
  if (attachmentsToDelete?.length) {
    await Promise.allSettled(
      attachmentsToDelete.map((attachment) => deleteCachedMedia(attachment.id)),
    )
  }
  await deleteCachedMediaForMessage(targetMessageId, resolvedConversationId).catch(() => {})

  if (typeof targetTimestamp !== 'number') {
    return true
  }

  const currentConversation = store.conversations.find((conversation) => conversation.id === resolvedConversationId)
  if (currentConversation?.lastMessage?.timestamp === targetTimestamp) {
    store.updateConversation(resolvedConversationId, {
      lastMessage: {
        content: VIEW_ONCE_CONSUMED_TEXT,
        timestamp: targetTimestamp,
        isOwn: currentConversation.lastMessage.isOwn,
      },
    })
  }

  const storedConversation = await localChatStorage.getConversation(resolvedConversationId).catch(() => null)
  if (storedConversation?.lastMessage?.timestamp === targetTimestamp) {
    await localChatStorage.updateConversation(resolvedConversationId, {
      lastMessage: {
        content: VIEW_ONCE_CONSUMED_TEXT,
        timestamp: targetTimestamp,
        senderId: storedConversation.lastMessage.senderId,
      },
    }).catch(() => {})
  }
  return true
}

export async function consumeDirectViewOnceMessage(
  message: ChatMessage,
  remoteIdentityId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!isLockedOneTimeMessage(message)) {
    return { success: true }
  }

  const consumedAt = Date.now()
  await applyViewOnceConsumption(message.id, message.conversationId, consumedAt)

  const result = await sendMessage(
    remoteIdentityId,
    createDirectEnvelope('view_once_consumed', {
      targetMessageId: message.id,
      consumedAt,
    }),
  )
  await applyViewOnceConsumption(message.id, message.conversationId, consumedAt)
  return result
}

export async function revealDirectViewOnceMessage(
  message: ChatMessage,
): Promise<{ success: boolean; payload?: OneTimeRevealPayload; error?: string }> {
  if (!chatClient) {
    return { success: false, error: 'Chat not initialized' }
  }
  if (!isLockedOneTimeMessage(message)) {
    return { success: false, error: 'Message is no longer available' }
  }

  const alreadyOpened = await localChatStorage.isMessageProcessed(message.id).catch(() => false)
  if (alreadyOpened) {
    await applyViewOnceConsumption(message.id, message.conversationId, Date.now())
    return { success: false, error: 'This one-time message was already opened' }
  }

  await deleteCachedMediaForMessage(message.id, message.conversationId).catch(() => {})

  try {
    const decrypted = await chatClient.revealStoredViewOnceMessage(message.id)
    const envelope = parseDirectEnvelope(decrypted.content)
    if (envelope.type !== 'view_once') {
      return { success: false, error: 'Stored message is not a view-once envelope' }
    }

    const { textContent, attachments } = parseMediaFromContent(envelope.body)
    return {
      success: true,
      payload: {
        kind: envelope.kind,
        content: textContent,
        attachments: annotateViewOnceAttachments(
          attachments,
          createLockedOneTimeMessage(envelope.kind),
        ),
      },
    }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

async function parseStoredMessages(
  messages: any[],
  conversationId: string,
  remoteDisplayName: string | undefined,
  localIdentityIdOverride?: string,
  isContextCurrent?: () => boolean,
): Promise<{
  chatMessages: ChatMessage[]
  deferredReactions: Array<{ targetMessageId: string; emoji: string; senderId: string; timestamp: number }>
  deferredDeletions: Array<{ targetMessageId: string; senderId: string }>
  deferredConversationDeletes: Array<{ targetIdentityId: string; issuedAt: number }>
  deferredViewOnceConsumptions: Array<{
    targetMessageId: string
    consumedAt: number
    source: ViewOnceConsumptionSource
  }>
}> {
  const effectiveLocalId = localIdentityIdOverride ?? chatIdentity?.id
  const chatMessages: ChatMessage[] = []
  const deferredReactions: Array<{ targetMessageId: string; emoji: string; senderId: string; timestamp: number }> = []
  const deferredDeletions: Array<{ targetMessageId: string; senderId: string }> = []
  const deferredConversationDeletes: Array<{ targetIdentityId: string; issuedAt: number }> = []
  const deferredViewOnceConsumptions: Array<{
    targetMessageId: string
    consumedAt: number
    source: ViewOnceConsumptionSource
  }> = []

  for (const msg of messages) {
    if (isContextCurrent && !isContextCurrent()) {
      break
    }
    const storedOneTime = getStoredOneTimeState(msg)
    const storedDisappearing = mapStoredDisappearingState((msg as { disappearing?: StoredDisappearingMessageState }).disappearing)
    if (isStoredLockedViewOncePlaceholder(msg)) {
      const isOwn = Boolean(effectiveLocalId && msg.senderId === effectiveLocalId)
      const baseStatus: ChatMessage['status'] =
        msg.status === 'read' ? 'read'
        : msg.status === 'delivered' ? 'delivered'
        : msg.status === 'sent' ? 'sent'
        : msg.status === 'failed' ? 'failed'
        : isOwn ? 'sent' : 'delivered'
      if (hasDisappearingMessageExpired(storedDisappearing)) {
        continue
      }

      chatMessages.push({
        id: msg.id,
        conversationId,
        senderId: msg.senderId,
        senderName: isOwn
          ? 'You'
          : (remoteDisplayName || `User ${msg.senderId.slice(0, 8)}`),
        content: '',
        timestamp: msg.timestamp,
        localOrderTimestamp: (msg as { localOrderTimestamp?: number }).localOrderTimestamp,
        status: baseStatus,
        ...getPersistedDeliveryState(baseStatus, isOwn),
        signatureVerified: msg.signatureVerified,
        serverSequence: msg.serverSequence,
        oneTime: storedOneTime,
        disappearing: storedDisappearing,
      })

      const alreadyOpened = await localChatStorage.isMessageProcessed(msg.id).catch(() => false)
      if (alreadyOpened) {
        deferredViewOnceConsumptions.push({
          targetMessageId: msg.id,
          consumedAt: Date.now(),
          source: { kind: 'local' },
        })
      }
      continue
    }

    const envelope = parseDirectEnvelope(typeof msg.content === 'string' ? msg.content : '')

    if (envelope.type === 'reaction') {
      deferredReactions.push({
        targetMessageId: envelope.targetMessageId,
        emoji: envelope.emoji,
        senderId: msg.senderId,
        timestamp: msg.timestamp,
      })
      continue
    }
    if (envelope.type === 'deletion') {
      deferredDeletions.push({
        targetMessageId: envelope.deletionTarget,
        senderId: msg.senderId,
      })
      continue
    }
    if (envelope.type === 'conversation_delete') {
      deferredConversationDeletes.push({
        targetIdentityId: envelope.targetIdentityId,
        issuedAt: envelope.issuedAt,
      })
      continue
    }
    if (envelope.type === 'view_once_consumed') {
      deferredViewOnceConsumptions.push({
        targetMessageId: envelope.targetMessageId,
        consumedAt: envelope.consumedAt,
        source: {
          kind: 'remote',
          controlSenderId: msg.senderId,
          localIdentityId: effectiveLocalId,
        },
      })
      continue
    }
    if (envelope.type === 'crypto_payment_request_update') {
      await applyCryptoPaymentRequestUpdate(envelope.update, { conversationId })
      continue
    }
    if (envelope.type === 'screenshot_protection') {
      updateRemoteScreenshotProtection(msg.senderId, envelope.enabled, envelope.updatedAt ?? msg.timestamp)
      continue
    }
    if (envelope.type === 'tor_state') {
      continue
    }
    if (envelope.type === 'disappearing_timer') {
      await applyIncomingDirectDisappearingTimer(
        conversationId,
        msg.senderId,
        envelope.timer,
        envelope.updatedAt,
        msg.senderId,
      )
      continue
    }
    if (envelope.type === 'ble_route_capability') {
      await handleBLERouteCapability(msg.senderId, envelope.capability)
      continue
    }
    if (envelope.type === 'hidden_control') {
      try {
        await processDirectGroupControlEnvelope(
          envelope.raw as Parameters<typeof processDirectGroupControlEnvelope>[0],
          msg.senderId,
        )
      } catch (error) {
        console.warn('[QuantumChat] Failed to process hidden control envelope:', error)
      }
      continue
    }

    const rawContent = getEnvelopeBody(envelope)
    const oneTime = storedOneTime ?? getEnvelopeOneTimeState(envelope)
    const envelopeDisappearingTimer = getEnvelopeDisappearingTimer(envelope)
    const rawReplyTo = getEnvelopeReplyReference(envelope)
    const replyTo = normalizeReplyReference(rawReplyTo, remoteDisplayName, effectiveLocalId)

    const isOwn = Boolean(effectiveLocalId && msg.senderId === effectiveLocalId)
    const { textContent, attachments } = parseMediaFromContent(rawContent)
    const annotatedAttachments = annotateViewOnceAttachments(attachments, oneTime)
    const initialAttachments = !isOwn && shouldBlockIncomingMediaInSpectre()
      ? createSpectreBlockedMediaAttachments(annotatedAttachments)
      : annotatedAttachments
    const baseStatus: ChatMessage['status'] =
      msg.status === 'read' ? 'read'
      : msg.status === 'delivered' ? 'delivered'
      : msg.status === 'sent' ? 'sent'
      : msg.status === 'failed' ? 'failed'
      : isOwn ? 'sent' : 'delivered'
    const disappearing = storedDisappearing
      ?? (isOwn
        ? createOutgoingDirectDisappearingState(envelopeDisappearingTimer, msg.timestamp)
        : createIncomingDirectDisappearingState(envelopeDisappearingTimer, msg.timestamp))
    if (hasDisappearingMessageExpired(disappearing)) {
      continue
    }

    chatMessages.push({
      id: msg.id,
      conversationId,
      senderId: msg.senderId,
      senderName: isOwn
        ? 'You'
        : (remoteDisplayName || `User ${msg.senderId.slice(0, 8)}`),
      content: textContent,
      timestamp: msg.timestamp,
      localOrderTimestamp: (msg as { localOrderTimestamp?: number }).localOrderTimestamp,
      status: baseStatus,
      ...getPersistedDeliveryState(baseStatus, isOwn),
      signatureVerified: true,
      serverSequence: msg.serverSequence,
      attachments: initialAttachments,
      replyTo,
      oneTime,
      disappearing,
      systemEvent: getEnvelopeSystemEvent(envelope),
    })
  }

  return {
    chatMessages,
    deferredReactions,
    deferredDeletions,
    deferredConversationDeletes,
    deferredViewOnceConsumptions,
  }
}

async function mergeStoredMessagesIntoChatStore(
  messages: any[],
  conversationId: string,
  remoteIdentityId: string,
  localIdentityId?: string,
  expectedWalletAddress?: string,
  options: {
    signal?: AbortSignal
    resolveAttachments?: boolean
    scheduleDerivedWork?: boolean
  } = {},
): Promise<ChatMessage[]> {
  const isContextCurrent = () => (
    !options.signal?.aborted
    && (
      !expectedWalletAddress
      || isSameAccountStorageScope(
        useWalletStore.getState().wallet?.address,
        expectedWalletAddress,
      )
    )
  )
  if (!isContextCurrent()) {
    return []
  }
  const remoteDisplayName = useChatStore.getState().contacts.find(
    (contact) => contact.identityId === remoteIdentityId,
  )?.displayName

  const {
    chatMessages,
    deferredReactions,
    deferredDeletions,
    deferredConversationDeletes,
    deferredViewOnceConsumptions,
  } = await parseStoredMessages(
    messages,
    conversationId,
    remoteDisplayName,
    localIdentityId,
    isContextCurrent,
  )
  if (!isContextCurrent()) {
    return []
  }

  const conversationDelete = [...deferredConversationDeletes]
    .sort((a, b) => b.issuedAt - a.issuedAt)[0]
  if (conversationDelete) {
    const deleted = await applyIncomingDirectConversationDelete({
      conversationId,
      targetIdentityId: conversationDelete.targetIdentityId,
      localIdentityId: localIdentityId ?? chatIdentity?.id,
      client: chatClient,
    })
    if (!isContextCurrent()) {
      return []
    }
    if (deleted) {
      return []
    }
  }

  useChatStore.getState().mergeMessages(chatMessages, conversationId)
  applyDeferredUpdates(
    chatMessages,
    deferredReactions,
    deferredDeletions,
    deferredViewOnceConsumptions,
    conversationId,
    isContextCurrent,
    expectedWalletAddress,
    { resolveAttachments: options.resolveAttachments !== false },
  )
  if (options.scheduleDerivedWork !== false) {
    scheduleStoredMessageDerivedWork(
      conversationId,
      localIdentityId ?? chatIdentity?.id,
      expectedWalletAddress ?? useWalletStore.getState().wallet?.address,
      isContextCurrent,
    )
  }

  return chatMessages
}

const deferredStoredMessageWork = new Map<string, Promise<void>>()
let storedMessageWorkGeneration = 0

function scheduleStoredMessageDerivedWork(
  conversationId: string,
  localIdentityId: string | null | undefined,
  localWalletAddress: string | null | undefined,
  isContextCurrent: () => boolean,
): void {
  const walletScope = normalizeAccountStorageScope(localWalletAddress) ?? 'unscoped'
  const key = `${walletScope}:${conversationId}`
  if (deferredStoredMessageWork.has(key)) {
    return
  }

  const generation = storedMessageWorkGeneration
  let task!: Promise<void>
  task = (async () => {
    await yieldAfterMessageChunk()
    if (
      generation !== storedMessageWorkGeneration
      || !isContextCurrent()
      || (
        localWalletAddress
        && !isSameAccountStorageScope(useWalletStore.getState().wallet?.address, localWalletAddress)
      )
    ) {
      return
    }

    const conversation = useChatStore.getState().conversations.find(
      (entry) => entry.id === conversationId,
    )
    if (conversation && !conversation.lastMessage) {
      await loadMissingLastMessages(
        [conversation],
        localIdentityId,
        localWalletAddress,
      )
    }
    if (
      generation !== storedMessageWorkGeneration
      || !isContextCurrent()
      || (
        localWalletAddress
        && !isSameAccountStorageScope(useWalletStore.getState().wallet?.address, localWalletAddress)
      )
    ) {
      return
    }

    await reconcileDirectUnreadState({
      conversationId,
      localIdentityId,
      localWalletAddress,
    })
  })()
    .catch((error) => {
      console.warn('[QuantumChat] Deferred message projection repair failed:', error)
    })
    .finally(() => {
      if (deferredStoredMessageWork.get(key) === task) {
        deferredStoredMessageWork.delete(key)
      }
    })
  deferredStoredMessageWork.set(key, task)
}

async function loadStoredDirectMessagesWithLegacyKey(
  conversationId: string,
  remoteIdentityId: string,
  options: { limit?: number; before?: number } = {},
): Promise<any[]> {
  const [primaryMessages, legacyMessages, storedPrimary, storedLegacy] = await Promise.all([
    localChatStorage.getDecryptedMessages(conversationId, options),
    conversationId === remoteIdentityId
      ? Promise.resolve([])
      : localChatStorage.getDecryptedMessages(remoteIdentityId, options).catch(() => []),
    localChatStorage.getMessages(conversationId, options).catch(() => []),
    conversationId === remoteIdentityId
      ? Promise.resolve([])
      : localChatStorage.getMessages(remoteIdentityId, options).catch(() => []),
  ])
  const mergedById = new Map<string, any>()

  for (const message of [...storedLegacy, ...storedPrimary]) {
    if (!message?.id) continue
    if (typeof message.content !== 'string' && !isStoredLockedViewOncePlaceholder(message)) continue
    const storedMessage = message as Record<string, any>
    mergedById.set(message.id, {
      ...message,
      timestamp: storedMessage.timestamp ?? message.createdAt ?? message.encryptedData?.metadata?.timestamp ?? Date.now(),
      signatureVerified: storedMessage.signatureVerified ?? true,
    })
  }

  for (const message of [...legacyMessages, ...primaryMessages]) {
    if (message?.id) {
      mergedById.set(message.id, message)
    }
  }

  return [...mergedById.values()].sort(compareStoredMessagesForDisplay)
}

async function loadMessagesWithLegacyBLEKey(
  conversationId: string,
  remoteIdentityId: string,
  options: { limit?: number; before?: number } = {},
): Promise<any[]> {
  const messages = await loadStoredDirectMessagesWithLegacyKey(
    conversationId,
    remoteIdentityId,
    options,
  )
  return applyStoredCryptoPaymentRequestSettlements(conversationId, messages)
}

type LoadCachedDirectMessagesOptions = {
  conversationId?: string
  limit?: number
  signal?: AbortSignal
  resolveAttachments?: boolean
  scheduleDerivedWork?: boolean
}

export const DIRECT_CHAT_CACHE_PAGE_SIZE = WARM_DIRECT_CONVERSATION_MESSAGE_LIMIT

function getValidatedDirectConversationHint(
  conversationId: string | undefined,
  remoteIdentityId: string,
  walletAddress: string,
): Conversation | null {
  const normalizedConversationId = conversationId?.trim()
  if (!normalizedConversationId) return null

  return useChatStore.getState().conversations.find((conversation) => (
    conversation.id === normalizedConversationId
    && matchesStrictAccountStorageScope(conversation.localWalletAddress, walletAddress)
    && (
      conversation.remoteIdentityId === remoteIdentityId
      || conversation.remoteWalletAddress === remoteIdentityId
    )
  )) ?? null
}

function getInMemoryMessagesForDirectConversation(
  remoteIdentityId: string,
  walletAddress: string,
  conversationId?: string,
): ChatMessage[] | null {
  const store = useChatStore.getState()
  const hintedConversation = getValidatedDirectConversationHint(
    conversationId,
    remoteIdentityId,
    walletAddress,
  )
  if (hintedConversation) {
    const hintedMessages = store._messagesByConversationId.get(hintedConversation.id)
    return hintedMessages?.length
      ? [...hintedMessages].sort(compareStoredMessagesForDisplay)
      : null
  }

  const context = {
    ...getActiveLocalConversationContext(),
    localWalletAddress: walletAddress,
  }
  const messagesById = new Map<string, ChatMessage>()

  for (const conversation of store.conversations) {
    if (
      !matchesLocalConversationContext(conversation, context)
      || (
        conversation.remoteIdentityId !== remoteIdentityId
        && conversation.remoteWalletAddress !== remoteIdentityId
      )
    ) {
      continue
    }

    for (const message of store._messagesByConversationId.get(conversation.id) ?? []) {
      messagesById.set(message.id, message)
    }
  }

  return messagesById.size > 0
    ? [...messagesById.values()].sort(compareStoredMessagesForDisplay)
    : null
}

function applyDeferredUpdates(
  chatMessages: ChatMessage[],
  deferredReactions: Array<{ targetMessageId: string; emoji: string; senderId: string; timestamp: number }>,
  deferredDeletions: Array<{ targetMessageId: string; senderId: string }>,
  deferredViewOnceConsumptions: Array<{
    targetMessageId: string
    consumedAt: number
    source: ViewOnceConsumptionSource
  }>,
  conversationId: string,
  isContextCurrent: () => boolean = () => true,
  expectedWalletAddress?: string,
  options: { resolveAttachments?: boolean } = {},
) {
  for (const reaction of deferredReactions) {
    if (!isContextCurrent()) return
    useChatStore.getState().addReaction(reaction.targetMessageId, {
      emoji: reaction.emoji,
      senderId: reaction.senderId,
      timestamp: reaction.timestamp,
    })
  }
  for (const deletion of deferredDeletions) {
    if (!isContextCurrent()) return
    const messages = useChatStore.getState().messages
    if (!canDeleteDirectMessageForEveryone(deletion.targetMessageId, deletion.senderId, messages)) {
      recordServiceDiagnostic('receive', 'service_message_suppressed', {
        messageId: deletion.targetMessageId,
        conversationId,
        senderIdentityId: deletion.senderId,
        envelopeType: 'deletion',
        suppressionReason: 'deletion_sender_mismatch',
      })
      continue
    }
    useChatStore.getState().updateMessage(deletion.targetMessageId, { deleted: true, content: '' })
  }
  for (const consumption of deferredViewOnceConsumptions) {
    if (!isContextCurrent()) return
    void applyViewOnceConsumption(
      consumption.targetMessageId,
      conversationId,
      consumption.consumedAt,
      consumption.source,
    )
  }

  if (options.resolveAttachments === false) {
    return
  }

  const messagesWithAttachments = chatMessages.filter((message) => (message.attachments?.length || 0) > 0)
  void mapWithConcurrency(messagesWithAttachments, 2, async (message) => {
    if (!isContextCurrent()) return
    const locallyResolved = await resolveAttachmentUris(message.attachments, expectedWalletAddress)
    if (!isContextCurrent()) return
    if (locallyResolved?.some((attachment, index) => attachment.uri !== message.attachments?.[index]?.uri)) {
      useChatStore.getState().updateMessage(message.id, { attachments: locallyResolved })
    }
    const attachments = (locallyResolved || message.attachments || []) as ParsedAttachment[]
    const pendingAttachments = attachments.filter(
      (attachment) => !attachment.uri && attachment.isEncrypted
    )
    if (!pendingAttachments.some((attachment) => shouldAutoHydrateAttachment(attachment))) return

    const hydrated = await downloadMediaAttachments(
      message.id,
      conversationId,
      attachments,
      'quantumChat.applyDeferredUpdates',
    )
    if (!isContextCurrent()) return
    useChatStore.getState().updateMessage(message.id, { attachments: hydrated })
  }).catch((error) => {
    console.warn('Failed to hydrate stored media attachments:', error)
  })
}

export async function loadCachedMessages(
  remoteIdentityId: string,
  options: LoadCachedDirectMessagesOptions = {},
): Promise<ChatMessage[]> {
  const walletAddress = useWalletStore.getState().wallet?.address
  if (!walletAddress || options.signal?.aborted) return []
  const isContextCurrent = () => (
    !options.signal?.aborted
    && isSameAccountStorageScope(
      useWalletStore.getState().wallet?.address,
      walletAddress,
    )
  )
  const limit = Number.isInteger(options.limit)
    ? Math.min(Math.max(options.limit as number, 1), 50)
    : DIRECT_CHAT_CACHE_PAGE_SIZE

  try {
    const inMemoryMessages = getInMemoryMessagesForDirectConversation(
      remoteIdentityId,
      walletAddress,
      options.conversationId,
    )
    if (inMemoryMessages) {
      return isContextCurrent() ? inMemoryMessages : []
    }

    const hintedConversation = getValidatedDirectConversationHint(
      options.conversationId,
      remoteIdentityId,
      walletAddress,
    )
    if (hintedConversation) {
      const messages = await loadMessagesWithLegacyBLEKey(
        hintedConversation.id,
        remoteIdentityId,
        { limit },
      )
      if (!isContextCurrent()) return []
      return mergeStoredMessagesIntoChatStore(
        messages,
        hintedConversation.id,
        hintedConversation.remoteIdentityId || remoteIdentityId,
        hintedConversation.localIdentityId,
        walletAddress,
        {
          signal: options.signal,
          resolveAttachments: options.resolveAttachments,
          scheduleDerivedWork: options.scheduleDerivedWork,
        },
      )
    }

    const storedIdentity = await localChatStorage.getIdentityByAddress(walletAddress)
    if (!storedIdentity?.id || !isContextCurrent()) return []
    const localIdentityId = storedIdentity.id
    let conversation = await localChatStorage.getConversationByParticipants(localIdentityId, remoteIdentityId)
    if (!isContextCurrent()) return []

    if (!conversation) {
      const allConversations = await localChatStorage.getConversations(localIdentityId)
      if (!isContextCurrent()) return []
      conversation = allConversations.find((c: any) => c.remoteWalletAddress === remoteIdentityId) ?? null
    }

    if (!conversation) return []

    const messages = await loadMessagesWithLegacyBLEKey(conversation.id, remoteIdentityId, { limit })
    if (!isContextCurrent()) return []
    return mergeStoredMessagesIntoChatStore(
      messages,
      conversation.id,
      conversation.remoteIdentityId || remoteIdentityId,
      localIdentityId,
      walletAddress,
      {
        signal: options.signal,
        resolveAttachments: options.resolveAttachments,
        scheduleDerivedWork: options.scheduleDerivedWork,
      },
    )
  } catch (error) {
    console.warn('[QuantumChat] Failed to load cached messages:', error)
    return []
  }
}

interface LoadMessagesOptions {
  skipCachedReload?: boolean
}

export async function loadMessages(
  remoteIdentityId: string,
  options: LoadMessagesOptions = {},
): Promise<ChatMessage[]> {
  if (!chatClient || !chatIdentity) return []

  const store = useChatStore.getState()
  store.setLoadingMessages(true)

  try {
    let handle = activeConversationHandle
    const activeConversation = handle
      ? store.conversations.find((conversation) => conversation.id === handle?.getId())
      : undefined
    const activeHandleMatches = Boolean(
      handle
      && (
        handle.getRemoteIdentity().id === remoteIdentityId
        || isSameAccountStorageScope(
          activeConversation?.remoteWalletAddress,
          remoteIdentityId,
        )
      ),
    )
    if (!activeHandleMatches) {
      handle = await tryOpenLocalConversation(remoteIdentityId)
    }

    let chatMessages: ChatMessage[]
    if (handle) {
      const conversationHandle = handle
      chatMessages = options.skipCachedReload
        ? useChatStore.getState()._messagesByConversationId.get(conversationHandle.getId()) ?? []
        : await loadMessagesWithLegacyBLEKey(conversationHandle.getId(), remoteIdentityId, { limit: 50 })
            .then((messages) => mergeStoredMessagesIntoChatStore(
              messages,
              conversationHandle.getId(),
              conversationHandle.getRemoteIdentity().id || remoteIdentityId,
            ))
    } else {
      const localConversation = store.conversations.find(
        (conversation) => conversation.remoteIdentityId === remoteIdentityId
          || isSameAccountStorageScope(conversation.remoteWalletAddress, remoteIdentityId),
      )
      chatMessages = options.skipCachedReload && localConversation
        ? useChatStore.getState()._messagesByConversationId.get(localConversation.id) ?? []
        : await loadCachedMessages(remoteIdentityId)
    }

    // Show cached messages immediately.
    useChatStore.getState().setLoadingMessages(false)

    // Sync with the server in the background.
    useChatStore.getState().setSyncingMessages(true)
    pollForNewMessages()
      .catch((error) => console.warn('[QuantumChat] Background poll failed:', error))
      .finally(() => useChatStore.getState().setSyncingMessages(false))

    return chatMessages
  } catch (error) {
    console.error('Failed to load messages:', error)
    return []
  } finally {
    useChatStore.getState().setLoadingMessages(false)
  }
}

export async function loadOlderMessages(
  remoteIdentityId: string,
  beforeTimestamp: number,
  limit: number = 30,
): Promise<ChatMessage[]> {
  if (!chatClient || !chatIdentity) return []

  try {
    const conversation = await localChatStorage.getConversationByParticipants(
      chatIdentity.id,
      remoteIdentityId,
    )
    if (!conversation) return []

    const messages = await loadMessagesWithLegacyBLEKey(
      conversation.id,
      remoteIdentityId,
      { limit, before: beforeTimestamp },
    )
    if (messages.length === 0) return []

    return mergeStoredMessagesIntoChatStore(
      messages,
      conversation.id,
      conversation.remoteIdentityId || remoteIdentityId,
    )
  } catch (error) {
    console.warn('[QuantumChat] Failed to load older messages:', error)
    return []
  }
}

// Polling and Realtime
const POLL_SAFETY_TIMEOUT_MS = 30_000

function yieldAfterMessageChunk(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

async function getVerifiedRemoteWalletAddressFromBundle(
  remoteIdentityId: string,
  bundle: PublicKeyBundle | null | undefined,
): Promise<string | undefined> {
  const walletAddress = bundle?.walletAuthorization?.payload.walletAddress
  return bundle
    && bundle.identityId === remoteIdentityId
    && (await verifyPublicKeyBundleAsync(bundle)).valid
    && walletAddress
    && (await verifyPublicKeyBundleWalletAuthorizationAsync(bundle, walletAddress)).valid
    ? walletAddress
    : undefined
}

async function getVerifiedRemoteWalletAddress(
  remoteIdentityId: string,
  authenticatedSenderBundle?: PublicKeyBundle,
): Promise<string | undefined> {
  const fromAuthenticatedBundle = await getVerifiedRemoteWalletAddressFromBundle(
    remoteIdentityId,
    authenticatedSenderBundle,
  )
  if (fromAuthenticatedBundle) {
    return fromAuthenticatedBundle
  }
  const bundle = await localChatStorage.getPublicKeyBundle(remoteIdentityId).catch(() => null)
  return getVerifiedRemoteWalletAddressFromBundle(remoteIdentityId, bundle)
}

async function clearRemoteAccountUnavailableAfterAuthenticatedInboundMessage(
  message: Pick<DecryptedMessage, 'conversationId' | 'senderId' | 'signatureVerified'>,
  authenticatedSenderBundle?: PublicKeyBundle,
): Promise<void> {
  if (!message.signatureVerified || !message.senderId) return
  if (!hasRemoteAccountUnavailableMarker()) return
  const localWalletAddress = useWalletStore.getState().wallet?.address
  if (!localWalletAddress) return

  const remoteWalletAddress = await getVerifiedRemoteWalletAddress(
    message.senderId,
    authenticatedSenderBundle,
  )
  if (!isSameAccountStorageScope(
    useWalletStore.getState().wallet?.address,
    localWalletAddress,
  )) return
  clearRemoteAccountUnavailableAfterMessage(
    message.senderId,
    remoteWalletAddress,
    localWalletAddress,
    message.conversationId,
  )
}

async function clearRemoteAccountUnavailableAfterAcceptedOutboundMessage(
  remoteIdentityId: string,
  messageKind?: string,
): Promise<void> {
  if (!isAvailabilityCorroboratingOutboundMessageKind(messageKind)) return
  if (!hasRemoteAccountUnavailableMarker()) return
  const localWalletAddress = useWalletStore.getState().wallet?.address
  if (!localWalletAddress) return

  const remoteWalletAddress = await getVerifiedRemoteWalletAddress(remoteIdentityId)
  if (!isSameAccountStorageScope(
    useWalletStore.getState().wallet?.address,
    localWalletAddress,
  )) return
  clearRemoteAccountUnavailableAfterMessage(
    remoteIdentityId,
    remoteWalletAddress,
    localWalletAddress,
  )
}

async function lockAuthenticatedInboundIdentityReplacement(
  senderIdentityId: string,
  conversationId: string,
  authenticatedSenderBundle?: PublicKeyBundle,
): Promise<{
  walletAddress?: string
  previousContact?: ChatContact
}> {
  const localWalletAddress = useWalletStore.getState().wallet?.address
  const walletAddress = await getVerifiedRemoteWalletAddress(
    senderIdentityId,
    authenticatedSenderBundle,
  )
  if (
    !walletAddress
    || !localWalletAddress
    || !isSameAccountStorageScope(
      useWalletStore.getState().wallet?.address,
      localWalletAddress,
    )
  ) {
    return {}
  }

  const state = useChatStore.getState()
  const previousContact = state.contacts.find((contact) => (
    contact.identityId !== senderIdentityId
    && isSameAccountStorageScope(contact.walletAddress, walletAddress)
    && matchesAccountStorageScope(contact.localWalletAddress, localWalletAddress)
  ))
  const previousConversation = state.conversations.find((conversation) => (
    conversation.remoteIdentityId !== senderIdentityId
    && matchesAccountStorageScope(conversation.localWalletAddress, localWalletAddress)
    && (
      conversation.id === conversationId
      || isSameAccountStorageScope(conversation.remoteWalletAddress, walletAddress)
    )
  ))
  if (!previousContact && !previousConversation) {
    return { walletAddress, previousContact }
  }

  const bundle = authenticatedSenderBundle
    ?? await localChatStorage.getPublicKeyBundle(senderIdentityId).catch(() => null)
  if (!bundle) {
    return { walletAddress, previousContact }
  }

  if (previousContact) {
    const pendingReplacement = await getPendingContactIdentityReplacementFromManager(
      previousContact.identityId,
      walletAddress,
    )
    if (pendingReplacement?.newIdentityId !== senderIdentityId) {
      await addContactFromBundle(bundle, previousContact.displayName, walletAddress)
    }
    return { walletAddress, previousContact }
  }

  const result = await lockConversationIdentityReplacement(
    previousConversation!.remoteIdentityId,
    bundle,
    walletAddress,
    previousConversation!.displayName,
  )
  const lockedContact = result.identityReplacement
    ? useChatStore.getState().contacts.find((contact) => (
      contact.identityId === previousConversation!.remoteIdentityId
      && matchesAccountStorageScope(contact.localWalletAddress, localWalletAddress)
    ))
    : undefined
  return { walletAddress, previousContact: lockedContact }
}

function recordRealtimeMessageProjected(
  msg: Pick<DecryptedMessage, 'id' | 'conversationId' | 'senderId'>,
  realtimeRequestedAt?: number,
): void {
  if (!realtimeRequestedAt || !Number.isFinite(realtimeRequestedAt)) return
  recordChatLatency(
    'receive',
    'realtime_wakeup_to_projection',
    Math.max(0, Date.now() - realtimeRequestedAt),
    {
      messageId: msg.id,
      senderId: msg.senderId,
      conversationId: msg.conversationId,
    },
  )
}

async function dispatchPendingMessages(
  messages: PendingMessageFetchResult['messages'],
  options: Pick<MessagePollOptions, 'suppressLocalNotifications'> & {
    runtime: QuantumChatRuntime
    realtimeRequestedAt?: number
  },
): Promise<void> {
  assertChatRuntimeCurrent(options.runtime)
  let loggedFirstDispatch = false
  const chatState = useChatStore.getState()
  const activeConversation = chatState.conversations.find(
    (conversation) => conversation.id === chatState.activeConversationId,
  )
  await mapWithConcurrency(
    prioritizePendingDirectMessageGroups(
      groupPendingDirectMessagesByConversation(messages),
      chatState.activeConversationId,
      activeConversation?.remoteIdentityId,
    ),
    INCOMING_MESSAGE_DISPATCH_CONCURRENCY,
    async (conversationMessages) => {
      for (let index = 0; index < conversationMessages.length; index += 1) {
        assertChatRuntimeCurrent(options.runtime)
        const msg = conversationMessages[index]
        try {
          const { authenticatedSenderBundle, ...decryptedMessage } = msg
          if (!loggedFirstDispatch) {
            loggedFirstDispatch = true
            recordCatchupTiming('first_dispatch', {
              elapsedMs: options.runtime.pollStartedAt
                ? Math.max(0, Date.now() - options.runtime.pollStartedAt)
                : -1,
              serverSequence: decryptedMessage.serverSequence ?? -1,
            })
          }
          recordServiceDiagnostic('poll', 'service_poll_message_dispatch', {
            messageId: decryptedMessage.id,
            conversationId: decryptedMessage.conversationId,
            senderIdentityId: decryptedMessage.senderId,
            serverSequence: decryptedMessage.serverSequence,
            deliveryStage: 'dispatching',
            transportPath: getRelayTransportPath(),
          })
          const corroboratesAvailability = await handleIncomingMessage(decryptedMessage, {
            suppressLocalNotifications: options?.suppressLocalNotifications,
            runtime: options.runtime,
            realtimeRequestedAt: options.realtimeRequestedAt,
            authenticatedSenderBundle,
          })
          assertChatRuntimeCurrent(options.runtime)
          if (corroboratesAvailability) {
            await clearRemoteAccountUnavailableAfterAuthenticatedInboundMessage(
              decryptedMessage,
              authenticatedSenderBundle,
            )
          }
        } catch (error) {
          recordServiceDiagnostic('poll', 'service_poll_message_failed', {
            messageId: msg.id,
            conversationId: msg.conversationId,
            senderIdentityId: msg.senderId,
            serverSequence: msg.serverSequence,
            deliveryStage: 'dispatch_failed',
            transportPath: getRelayTransportPath(),
            error: describeDiagnosticError(error),
          })
          console.warn(`[QuantumChat] Failed to process relayed message ${msg.id}:`, error)
        }

        if ((index + 1) % INCOMING_MESSAGE_YIELD_EVERY === 0) {
          await yieldAfterMessageChunk()
          assertChatRuntimeCurrent(options.runtime)
        }
      }
    },
  )
}

type RuntimePendingMessage = PendingMessageFetchResult['messages'][number] & {
  runtime: QuantumChatRuntime
  realtimeRequestedAt?: number
}

const realtimeMessageDispatchQueue = createMessageDispatchQueue<RuntimePendingMessage>({
  dispatch: async (messages) => {
    const runtime = messages[0]?.runtime
    if (!runtime || !isChatRuntimeCurrent(runtime)) return
    const realtimeRequestedAt = messages.reduce<number | undefined>((earliest, message) => {
      if (!message.realtimeRequestedAt) return earliest
      return earliest === undefined
        ? message.realtimeRequestedAt
        : Math.min(earliest, message.realtimeRequestedAt)
    }, undefined)
    await dispatchPendingMessages(
      messages
        .filter((message) => message.runtime === runtime)
        .map(({ runtime: _runtime, realtimeRequestedAt: _requestedAt, ...message }) => message),
      { runtime, realtimeRequestedAt },
    )
  },
  yieldAfterBatch: yieldAfterMessageChunk,
  recordDiagnostic: (name, fields) => recordServiceDiagnostic('poll', name, fields),
})

async function pollGroupsForDirectCycle(fullResync: boolean): Promise<void> {
  try {
    await syncGroupConversations(fullResync)
  } catch (error) {
    console.warn('[QuantumChat] Failed to sync group conversations during fallback polling:', error)
  }

  try {
    await pollForNewGroupMessages()
  } catch (error) {
    console.warn('[QuantumChat] Failed to poll group messages during fallback polling:', error)
  }
}

export function setDirectChatInteractionActive(active: boolean): void {
  setChatInteractionActive(active)
}

export function catchUpMailboxForBoundSession(): void {
  syncBundleServerAccessToken()
  syncRealtimeSubscriptionForTransport()
  if (!isInitialMailboxCatchupSettled()) {
    return
  }
  void pollForNewMessages({ fullResync: true }).catch(() => {})
}

export function pollForNewMessages(options?: MessagePollOptions): Promise<MessagePollResult> {
  const runtime = activeChatRuntime
  if (!runtime || !isChatRuntimeCurrent(runtime) || !runtime.client || !runtime.identity) {
    return Promise.resolve({
      lastServerSequence: runtime?.lastServerSequence ?? 0,
      fullResyncCompleted: false,
    })
  }

  if (runtime.pollPromise) {
    runtime.queuedPollOptions = mergePollOptions(runtime.queuedPollOptions, options) || {}
    if (getMessagePollPriority(options) > runtime.activePollPriority) {
      runtime.pollAbortController?.abort()
    }
    if (
      runtime.pollStartedAt > 0
      && Date.now() - runtime.pollStartedAt > POLL_SAFETY_TIMEOUT_MS
    ) {
      recordChatOperationalCounter('stuck', 'message_poll_waiting')
      recordServiceDiagnostic('poll', 'service_poll_stuck_waiting', {
        elapsedMs: Date.now() - runtime.pollStartedAt,
        afterSequence: runtime.lastServerSequence,
        deliveryStage: 'poll_waiting',
        transportPath: getRelayTransportPath(),
      })
    }
    return runtime.pollPromise
  }

  let task: Promise<MessagePollResult>
  task = runMessagePollChain(runtime, options).finally(() => {
    if (runtime.pollPromise === task) {
      runtime.pollPromise = null
      runtime.pollStartedAt = 0
    }
  })
  runtime.pollPromise = runtime.lease.track(task)
  return runtime.pollPromise
}

export async function reconcileMessagingPushWakeup(): Promise<boolean> {
  const result = await pollForNewMessages({
    fullResync: true,
    suppressLocalNotifications: true,
  })
  return result.fullResyncCompleted
}

async function runMessagePollChain(
  runtime: QuantumChatRuntime,
  options?: MessagePollOptions,
): Promise<MessagePollResult> {
  let currentOptions = options
  while (true) {
    assertChatRuntimeCurrent(runtime)
    const controller = new AbortController()
    const abortForRuntime = () => controller.abort()
    runtime.lease.signal.addEventListener('abort', abortForRuntime, { once: true })
    runtime.pollAbortController = controller
    runtime.activePollPriority = getMessagePollPriority(currentOptions)
    try {
      return await runMessagePoll(runtime, currentOptions, controller.signal)
    } catch (error) {
      if (
        !controller.signal.aborted
        || runtime.lease.signal.aborted
        || !isChatRuntimeCurrent(runtime)
      ) {
        throw error
      }
      recordChatOperationalCounter('duplicate', 'message_poll_superseded')
      recordServiceDiagnostic('poll', 'service_poll_superseded', {
        activePriority: runtime.activePollPriority,
        queuedPriority: getMessagePollPriority(runtime.queuedPollOptions ?? undefined),
      })
      currentOptions = runtime.queuedPollOptions ?? {}
      runtime.queuedPollOptions = null
    } finally {
      runtime.lease.signal.removeEventListener('abort', abortForRuntime)
      if (runtime.pollAbortController === controller) {
        runtime.pollAbortController = null
        runtime.activePollPriority = 0
      }
    }
  }
}

async function runMessagePoll(
  runtime: QuantumChatRuntime,
  options?: MessagePollOptions,
  signal?: AbortSignal,
): Promise<MessagePollResult> {
  assertChatRuntimeCurrent(runtime)
  const client = runtime.client
  const identity = runtime.identity
  if (!client || !identity) {
    return {
      lastServerSequence: runtime.lastServerSequence,
      fullResyncCompleted: false,
    }
  }
  syncBundleServerAccessToken()

  if (!(await ensureBoundChatTransportAccess(runtime, identity.id))) {
    assertChatRuntimeCurrent(runtime)
    resetMailboxCatchupBanner()
    return {
      lastServerSequence: runtime.lastServerSequence,
      fullResyncCompleted: false,
    }
  }
  assertChatRuntimeCurrent(runtime)
  runtime.pollStartedAt = Date.now()
  let totalDirectMessageCount = 0
  let completedFullResync = false
  let completedRequestedFullResync = false
  const observedMailboxTokens = new Set<string>()
  const observedMailboxSequences = new Map<string, number>()

  try {
    let currentOptions: MessagePollOptions | null = options ?? {}
    while (currentOptions) {
      do {
      assertChatRuntimeCurrent(runtime)
      runtime.queuedPollOptions = null

      const fullResync = Boolean(currentOptions?.fullResync)
      const pollSource = currentOptions?.source ?? 'scheduled'
      const realtimeFastPath = isRealtimeDirectPollFastPath(currentOptions)
      if (!Number.isSafeInteger(runtime.lastServerSequence)) {
        recordServiceDiagnostic('poll', 'unsafe_relay_cursor_reset', {
          source: pollSource,
          lastServerSequence: runtime.lastServerSequence,
        })
        runtime.lastServerSequence = 0
      }
      const replayMailbox = Boolean(currentOptions?.replayMailbox)
      const afterSequence = resolveRelayFetchAfterSequence({
        lastServerSequence: runtime.lastServerSequence,
        replayMailbox,
      })
      const pollSpan = startChatLatencySpan('poll', 'message_cycle', {
        torEnabled: useTorStore.getState().enabled,
        fullResync,
        source: pollSource,
        pollIntervalMs: getMessagePollIntervalMs(),
        afterSequence: afterSequence ?? -1,
      })
      recordCatchupTiming('poll_cycle_start', {
        source: pollSource,
        afterSequence: afterSequence ?? -1,
        fastPath: realtimeFastPath,
        intervalMs: getMessagePollIntervalMs(),
        wakeupServerSequence: currentOptions?.latestServerSequence ?? -1,
        wakeupToPollStartMs: currentOptions?.realtimeRequestedAt
          ? Math.max(0, Date.now() - currentOptions.realtimeRequestedAt)
          : -1,
      })
      advanceMailboxCatchupBanner('checking_mailbox')
      recordServiceDiagnostic('poll', 'service_poll_cycle_start', {
        fullResync,
        source: pollSource,
        afterSequence: afterSequence ?? -1,
        wakeupServerSequence: currentOptions?.latestServerSequence ?? null,
        wakeupToPollStartMs: currentOptions?.realtimeRequestedAt
          ? Math.max(0, Date.now() - currentOptions.realtimeRequestedAt)
          : null,
        lastServerSequence: runtime.lastServerSequence,
        pollIntervalMs: getMessagePollIntervalMs(),
        deliveryStage: 'polling',
        transportPath: getRelayTransportPath(),
      })

      let directMessageCount = 0
      let groupPollAttempted = false
      let relayAdvanceSequence = afterSequence ?? runtime.lastServerSequence
      let relayHighestSeenSequence = afterSequence ?? runtime.lastServerSequence
      let quarantinedRelayCount = 0
      let blockedRelayCount = 0
      let directFetchSucceeded = false

      try {
        let pendingResult: PendingMessageFetchResult = {
          messages: [],
          pendingCount: 0,
          highestSeenSequence: afterSequence ?? runtime.lastServerSequence,
          advanceSequence: afterSequence ?? runtime.lastServerSequence,
          quarantinedCount: 0,
          blockedCount: 0,
        }
        let catchUpDispatch: Promise<void> = Promise.resolve()
        let catchUpBatch: PendingMessageFetchResult['messages'] = []
        let loggedFirstDecrypt = false
        const flushCatchUpBatch = () => {
          if (catchUpBatch.length === 0) return
          const batch = catchUpBatch
          catchUpBatch = []
          catchUpDispatch = catchUpDispatch.then(() => {
            assertChatRuntimeCurrent(runtime)
            return dispatchPendingMessages(batch, {
              suppressLocalNotifications: currentOptions?.suppressLocalNotifications,
              runtime,
              realtimeRequestedAt: currentOptions?.realtimeRequestedAt,
            })
          }).catch((error) => {
            if (error instanceof StaleWalletRuntimeError) return
            recordServiceDiagnostic('poll', 'service_poll_incremental_dispatch_failed', {
              messageCount: batch.length,
              conversationId: batch[0]?.conversationId,
              senderIdentityId: batch[0]?.senderId,
              serverSequence: batch[batch.length - 1]?.serverSequence,
              deliveryStage: 'dispatch_failed',
              transportPath: getRelayTransportPath(),
              error: describeDiagnosticError(error),
            })
          })
        }
        try {
          const onDecryptedMessage = (
            message: PendingMessageFetchResult['messages'][number],
            cursor: { advanceSequence: number },
          ) => {
            if (!isChatRuntimeCurrent(runtime)) return
            if (!loggedFirstDecrypt) {
              loggedFirstDecrypt = true
              recordCatchupTiming('first_decrypted', {
                elapsedMs: Math.max(0, Date.now() - runtime.pollStartedAt),
                source: pollSource,
                fastPath: realtimeFastPath,
                serverSequence: message.serverSequence ?? -1,
              })
              advanceMailboxCatchupBanner('decrypting')
            }
            advanceRuntimeRelayCursor(runtime, cursor.advanceSequence)
            if (realtimeFastPath) {
              void runtime.lease.track(realtimeMessageDispatchQueue.enqueue([{
                ...message,
                runtime,
                realtimeRequestedAt: currentOptions?.realtimeRequestedAt,
              }], {
                source: pollSource,
                latestServerSequence: currentOptions?.latestServerSequence ?? message.serverSequence,
              }))
              return
            }
            catchUpBatch.push(message)
            if (catchUpBatch.length >= CATCHUP_DISPATCH_BATCH_SIZE) {
              flushCatchUpBatch()
            }
          }

          let fetchAfterSequence = afterSequence
          try {
            const prefetchedRows = await takeSealedPrefetchRows(runtime.lease.walletScope)
            if (prefetchedRows.length > 0) {
              const prefetchResult = await client.fetchPendingMessages(fetchAfterSequence, {
                fastPath: realtimeFastPath,
                skipRelayHttp: true,
                prefetchedRows,
                signal,
                onDecryptedMessage,
              })
              fetchAfterSequence = Math.max(
                fetchAfterSequence ?? 0,
                prefetchResult.advanceSequence,
              )
              runtime.lastServerSequence = Math.max(
                runtime.lastServerSequence,
                prefetchResult.advanceSequence,
              )
            }
          } catch (error) {
            if (signal?.aborted) throw error
          }

          pendingResult = await client.fetchPendingMessages(fetchAfterSequence, {
            fastPath: realtimeFastPath,
            signal,
            onDecryptedMessage,
          })
          flushCatchUpBatch()
          assertChatRuntimeCurrent(runtime)
          directFetchSucceeded = true
        } catch (error) {
          flushCatchUpBatch()
          if (signal?.aborted) throw error
          console.error('Failed to poll for messages:', error)
          recordServiceDiagnostic('poll', 'service_poll_fetch_failed', {
            fullResync,
            source: pollSource,
            afterSequence: afterSequence ?? -1,
            lastServerSequence: runtime.lastServerSequence,
            deliveryStage: 'poll_error',
            transportPath: getRelayTransportPath(),
            error: describeDiagnosticError(error),
          })
        }

        if (pendingResult.pendingCount > 0) {
          advanceMailboxCatchupBanner('decrypting')
        }
        relayAdvanceSequence = pendingResult.advanceSequence
        relayHighestSeenSequence = pendingResult.highestSeenSequence
        quarantinedRelayCount = pendingResult.quarantinedCount
        blockedRelayCount = pendingResult.blockedCount
        if (quarantinedRelayCount > 0) {
          recordChatOperationalCounter(
            'orphan',
            'relay_rows_quarantined',
            quarantinedRelayCount,
          )
        }
        if (blockedRelayCount > 0) {
          recordChatOperationalCounter('stuck', 'relay_cursor_blocked', blockedRelayCount)
        }
        const previousCursor = runtime.lastServerSequence
        runtime.lastServerSequence = Math.max(runtime.lastServerSequence, relayAdvanceSequence)
        if (runtime.lastServerSequence > previousCursor) {
          await persistRelayMailboxCursor(runtime)
        }

        directMessageCount = pendingResult.messages.length
        totalDirectMessageCount += directMessageCount
        for (const token of pendingResult.mailboxTokens ?? []) {
          observedMailboxTokens.add(token)
        }
        for (const [mailboxToken, serverSequence] of pendingResult.mailboxSequences ?? []) {
          observedMailboxSequences.set(
            mailboxToken,
            Math.max(observedMailboxSequences.get(mailboxToken) ?? 0, serverSequence),
          )
        }
        recordServiceDiagnostic('poll', 'service_poll_fetch_result', {
          fullResync,
          source: pollSource,
          afterSequence: afterSequence ?? -1,
          pendingCount: pendingResult.pendingCount,
          directMessageCount,
          relayAdvanceSequence,
          relayHighestSeenSequence,
          quarantinedRelayCount,
          blockedRelayCount,
          lastServerSequence: runtime.lastServerSequence,
          deliveryStage: 'poll_fetched',
          transportPath: getRelayTransportPath(),
        })

        groupPollAttempted = shouldPollGroupsThisCycle(runtime, fullResync)
        const groupPollPromise = groupPollAttempted
          ? pollGroupsForDirectCycle(fullResync).then(() => {
            assertChatRuntimeCurrent(runtime)
          })
          : null

        if (!realtimeFastPath) {
          void runtime.lease.track(catchUpDispatch)
        }

        if (groupPollPromise) {
          await groupPollPromise
        }
        const completedThisFullResync = fullResync && directFetchSucceeded
        completedFullResync = completedFullResync || completedThisFullResync
        completedRequestedFullResync = completedRequestedFullResync || completedThisFullResync

        pollSpan.end({
          directMessageCount,
          groupPollAttempted,
          relayAdvanceSequence,
          relayHighestSeenSequence,
          quarantinedRelayCount,
          blockedRelayCount,
          lastServerSequence: runtime.lastServerSequence,
        })
        recordCatchupTiming('poll_cycle_complete', {
          source: pollSource,
          elapsedMs: Math.max(0, Date.now() - runtime.pollStartedAt),
          afterSequence: afterSequence ?? -1,
          directMessageCount,
          pendingCount: pendingResult.pendingCount,
        })
        recordServiceDiagnostic('poll', 'service_poll_cycle_complete', {
          fullResync,
          source: pollSource,
          afterSequence: afterSequence ?? -1,
          directMessageCount,
          groupPollAttempted,
          relayAdvanceSequence,
          relayHighestSeenSequence,
          quarantinedRelayCount,
          blockedRelayCount,
          lastServerSequence: runtime.lastServerSequence,
          deliveryStage: 'poll_complete',
          transportPath: getRelayTransportPath(),
        })

        if (directMessageCount > 0) {
          scheduleOutboundStatusSyncFallback('poll_received_direct_messages', 750)
        }

        // Burst only when HTTP polling is the primary receive path.
        if (shouldContinueDirectBurstPolling({
          fallbackDirectPolling: shouldUseDirectBurstPolling(),
          directMessageCount,
          consecutiveBurstPolls: runtime.consecutiveBurstPolls,
          maxBurstPolls: MAX_BURST_POLLS,
        })) {
          runtime.consecutiveBurstPolls++
          runtime.queuedPollOptions = mergePollOptions(
            runtime.queuedPollOptions,
            { fullResync: false },
          ) || {}
        } else {
          runtime.consecutiveBurstPolls = 0
        }
      } catch (error) {
        runtime.consecutiveBurstPolls = 0
        pollSpan.end({
          directMessageCount,
          groupPollAttempted,
          relayAdvanceSequence,
          relayHighestSeenSequence,
          quarantinedRelayCount,
          blockedRelayCount,
          lastServerSequence: runtime.lastServerSequence,
          error: true,
        })
        recordServiceDiagnostic('poll', 'service_poll_cycle_failed', {
          fullResync,
          source: pollSource,
          afterSequence: afterSequence ?? -1,
          directMessageCount,
          groupPollAttempted,
          relayAdvanceSequence,
          relayHighestSeenSequence,
          quarantinedRelayCount,
          blockedRelayCount,
          lastServerSequence: runtime.lastServerSequence,
          deliveryStage: 'poll_error',
          transportPath: getRelayTransportPath(),
          error: describeDiagnosticError(error),
        })
        throw error
      }

        currentOptions = runtime.queuedPollOptions
      } while (currentOptions)
      if (completedFullResync) {
        await reconcileAllDirectUnreadStates({
          localIdentityId: identity.id,
          localWalletAddress: runtime.lease.walletScope,
        })
        assertChatRuntimeCurrent(runtime)
        completedFullResync = false
      }
      currentOptions = runtime.queuedPollOptions
    }
  } finally {
    if (!signal?.aborted) runtime.queuedPollOptions = null
  }
  return {
    lastServerSequence: runtime.lastServerSequence,
    fullResyncCompleted: completedRequestedFullResync,
    directMessageCount: totalDirectMessageCount,
    mailboxTokens: Array.from(observedMailboxTokens),
    mailboxSequences: observedMailboxSequences,
  }
}

/**
 * Downloads and caches received media in the background.
 */
async function downloadMediaAttachments(
  messageId: string,
  conversationId: string,
  attachments: ParsedAttachment[],
  source: string,
  runtime: QuantumChatRuntime | null = activeChatRuntime,
): Promise<MediaAttachment[]> {
  if (!runtime || !isChatRuntimeCurrent(runtime)) {
    throw new StaleWalletRuntimeError()
  }
  const task = hydrateMessageAttachments(messageId, conversationId, attachments, {
    backgroundOnly: true,
    runtime: {
      walletScope: runtime.lease.walletScope,
      generation: runtime.lease.generation,
      isCurrent: () => isChatRuntimeCurrent(runtime),
    },
    diagnostics: {
      source,
      messageId,
      conversationId,
      recordDiagnostic: (eventName, fields) =>
        recordServiceDiagnostic('receive', eventName, fields),
    },
  })
  return runtime.lease.track(task)
}

async function sendDirectLocalNotificationWithPrivacy(params: {
  recipientIdentityId?: string | null
  senderIdentityId: string
  conversationId: string
  localWalletAddress?: string
  remoteWalletAddress?: string
  messageId?: string
}): Promise<void> {
  const notificationCopy = await buildDirectLocalNotificationCopy(
    params.recipientIdentityId,
    params.senderIdentityId,
  )

  await sendLocalNotification(
    notificationCopy.title,
    notificationCopy.body,
    {
      conversationId: params.conversationId,
      localWalletAddress: params.localWalletAddress,
      remoteIdentityId: params.senderIdentityId,
      remoteWalletAddress: params.remoteWalletAddress,
      messageId: params.messageId,
    },
  )
}

async function handleIncomingMessage(
  msg: DecryptedMessage & { serverSequence?: number },
  options?: Pick<MessagePollOptions, 'suppressLocalNotifications'> & {
    runtime?: QuantumChatRuntime
    realtimeRequestedAt?: number
    authenticatedSenderBundle?: PublicKeyBundle
  },
): Promise<boolean> {
  if (options?.runtime) {
    assertChatRuntimeCurrent(options.runtime)
  }
  if (!msg.senderId || !msg.conversationId) {
    console.warn('Received message with missing sender/conversation ID, skipping')
    return false
  }
  
  if (chatIdentity && msg.senderId === chatIdentity.id) {
    await reconcileDirectUnreadState({
      conversationId: msg.conversationId,
      localIdentityId: chatIdentity.id,
      localWalletAddress: useWalletStore.getState().wallet?.address,
    })
    return false
  }
  
  // Skip messages already processed by another receive path.
  if (recentlyProcessedMessageIds.has(msg.id)) {
    const localConversationContext = getActiveLocalConversationContext()
    if (!isDirectSenderBlocked(msg.senderId, useChatStore.getState().contacts)) {
      await markIncomingDirectMessageReadIfActive(msg, {
        conversationId: msg.conversationId,
        senderIdentityId: msg.senderId,
        localConversationContext,
        isCallInvite: buildDirectMessagePreview(msg.content).isCallInvite,
      })
    }
    await reconcileDirectUnreadState({
      conversationId: msg.conversationId,
      localIdentityId: localConversationContext.localIdentityId,
      localWalletAddress: localConversationContext.localWalletAddress,
    })
    return false
  }
  recentlyProcessedMessageIds.add(msg.id)
  if (recentlyProcessedMessageIds.size > MAX_PROCESSED_IDS) {
    const first = recentlyProcessedMessageIds.values().next().value
    if (first) recentlyProcessedMessageIds.delete(first)
  }

  try {
  const handleStartedAt = Date.now()
  
  const { addMessage, updateConversation, conversations, addConversation, updateContact, updateMessage, contacts } = useChatStore.getState()
  const storedOneTime = getStoredOneTimeState(msg)
  const storedDisappearing = mapStoredDisappearingState((msg as { disappearing?: StoredDisappearingMessageState }).disappearing)
  const localConversationContext = getActiveLocalConversationContext()

  const senderBlocked = isDirectSenderBlocked(msg.senderId, contacts)
  const lockedViewOnce = isStoredLockedViewOncePlaceholder(msg)
  const corroboratesAvailability = isAuthenticatedRemoteAvailabilityCorroboration({
    signatureVerified: msg.signatureVerified,
    senderIdentityId: msg.senderId,
    localIdentityId: chatIdentity?.id,
    senderBlocked,
    lockedViewOnce,
  })

  if (senderBlocked) {
    recordServiceDiagnostic('receive', 'service_message_suppressed', {
      messageId: msg.id,
      conversationId: msg.conversationId,
      senderIdentityId: msg.senderId,
      serverSequence: msg.serverSequence,
      deliveryStage: 'blocked_sender',
      suppressionReason: 'blocked_contact',
    })
    await deleteDirectMessagesAndReconcile({
      conversationId: msg.conversationId,
      localIdentityId: localConversationContext.localIdentityId,
      localWalletAddress: localConversationContext.localWalletAddress,
      messageIds: [msg.id],
    })
    syncGlobalBadge().catch(() => {})
    return false
  }

  if (lockedViewOnce) {
    const senderContact = contacts.find((contact) => contact.identityId === msg.senderId)
    const senderDisplayName = getDirectSenderDisplayName(senderContact, msg.senderId)
    const senderWallet = senderContact?.walletAddress
    const preview = getViewOncePreviewLabel('text')
    const localOrderTimestamp = getIncomingDirectOrderTimestamp(msg, createLocalOrderTimestamp)
    const chatMessage = buildLockedViewOnceChatMessage({
      message: msg,
      localConversationContext,
      senderDisplayName,
      localOrderTimestamp,
      oneTime: storedOneTime,
      disappearing: storedDisappearing,
    })
    if (!addMessage(chatMessage)) {
      recordServiceDiagnostic('receive', 'service_message_suppressed', {
        messageId: msg.id,
        conversationId: chatMessage.conversationId,
        senderIdentityId: msg.senderId,
        serverSequence: msg.serverSequence,
        suppressionReason: 'already_stored',
      })
      await markIncomingDirectMessageReadIfActive(msg, {
        conversationId: msg.conversationId,
        projectedConversationId: chatMessage.conversationId,
        senderIdentityId: msg.senderId,
        senderWalletAddress: senderWallet,
        localConversationContext,
      })
      await reconcileDirectUnreadState({
        conversationId: chatMessage.conversationId,
        localIdentityId: localConversationContext.localIdentityId,
        localWalletAddress: localConversationContext.localWalletAddress,
      })
      return false
    }
    recordRealtimeMessageProjected(msg, options?.realtimeRequestedAt)

    const { activeConversationId } = useChatStore.getState()
    const isActiveChat = isActiveDirectThread({
      activeConversationId,
      conversations,
      localConversationContext,
      conversationId: msg.conversationId,
      projectedConversationId: chatMessage.conversationId,
      senderIdentityId: msg.senderId,
      senderWalletAddress: senderWallet,
    })
    const isAppBackground = AppState.currentState !== 'active'
    if (!isActiveChat && !isAppBackground && !options?.suppressLocalNotifications) {
      sendDirectLocalNotificationWithPrivacy({
        recipientIdentityId: localConversationContext.localIdentityId,
        senderIdentityId: msg.senderId,
        conversationId: chatMessage.conversationId,
        localWalletAddress: localConversationContext.localWalletAddress,
        remoteWalletAddress: senderWallet,
        messageId: msg.id,
      }).catch(() => {})
    }

    let existingConv = conversations.find(
      (conversation) => matchesLocalConversationContext(conversation, localConversationContext)
        && (conversation.id === chatMessage.conversationId || conversation.remoteIdentityId === msg.senderId),
    )
    if (
      existingConv
      && existingConv.id !== chatMessage.conversationId
      && existingConv.remoteIdentityId === msg.senderId
    ) {
      await rekeyConversationArtifacts(existingConv.id, chatMessage.conversationId)
      existingConv = useChatStore.getState().conversations.find(
        (conversation) => conversation.id === chatMessage.conversationId,
      )
    }
    if (existingConv) {
      updateConversation(existingConv.id, {
        ...localConversationContext,
        lastMessage: {
          content: preview,
          timestamp: msg.timestamp,
          isOwn: false,
        },
        unreadCount: 0,
        remoteIdentityId: msg.senderId,
      })
    } else {
      addConversation({
        id: chatMessage.conversationId,
        ...localConversationContext,
        remoteIdentityId: msg.senderId,
        remoteWalletAddress: senderWallet,
        createdAt: msg.timestamp,
        lastMessage: {
          content: preview,
          timestamp: msg.timestamp,
          isOwn: false,
        },
        unreadCount: 0,
      })
    }

    await persistDirectMessageLocalOrderTimestamp(chatMessage.id, localOrderTimestamp)
    if (isActiveChat && !isAppBackground) {
      await markActiveIncomingDirectMessageRead(msg, {
        conversationId: chatMessage.conversationId,
        localIdentityId: localConversationContext.localIdentityId,
        localWalletAddress: localConversationContext.localWalletAddress,
      })
    }
    await reconcileDirectUnreadState({
      conversationId: chatMessage.conversationId,
      localIdentityId: localConversationContext.localIdentityId,
      localWalletAddress: localConversationContext.localWalletAddress,
    })
    recordChatLatency('receive', 'handle_incoming_to_store', Date.now() - handleStartedAt, {
      messageId: msg.id,
      senderId: msg.senderId,
      conversationId: chatMessage.conversationId,
      hasAttachments: false,
    })

    if (senderContact) {
      updateContact(msg.senderId, {
        isOnline: true,
        lastSeenAt: Date.now(),
      })
    }

    const alreadyOpened = await localChatStorage.isMessageProcessed(msg.id).catch(() => false)
    if (alreadyOpened) {
      await applyViewOnceConsumption(msg.id, msg.conversationId, Date.now())
    }
    return false
  }
  
  const incomingEnvelope = parseDirectEnvelope(msg.content)
  const recordSuppressedEnvelope = (reason: string): void => {
    recordServiceDiagnostic('receive', 'service_message_suppressed', {
      messageId: msg.id,
      conversationId: msg.conversationId,
      senderIdentityId: msg.senderId,
      serverSequence: msg.serverSequence,
      envelopeType: incomingEnvelope.type,
      suppressionReason: reason,
    })
  }
  const reconcileIncomingDirectUnread = async () => {
    const options = {
      conversationId: msg.conversationId,
      localIdentityId: localConversationContext.localIdentityId,
      localWalletAddress: localConversationContext.localWalletAddress,
    }
    await markDirectUnreadProjectionDirty(options)
    return reconcileDirectUnreadState(options)
  }

  if (incomingEnvelope.type === 'reaction') {
    recordSuppressedEnvelope('reaction_applied')
    useChatStore.getState().addReaction(incomingEnvelope.targetMessageId, {
      emoji: incomingEnvelope.emoji,
      senderId: msg.senderId,
      timestamp: msg.timestamp,
    })
    updateContact(msg.senderId, { isOnline: true, lastSeenAt: Date.now() })
    await reconcileIncomingDirectUnread()
    return false
  }
  if (incomingEnvelope.type === 'deletion') {
    if (!canDeleteDirectMessageForEveryone(incomingEnvelope.deletionTarget, msg.senderId, useChatStore.getState().messages)) {
      recordSuppressedEnvelope('deletion_sender_mismatch')
      updateContact(msg.senderId, { isOnline: true, lastSeenAt: Date.now() })
      await reconcileIncomingDirectUnread()
      return false
    }
    recordSuppressedEnvelope('deletion_applied')
    useChatStore.getState().updateMessage(incomingEnvelope.deletionTarget, {
      deleted: true,
      content: '',
    })
    updateContact(msg.senderId, { isOnline: true, lastSeenAt: Date.now() })
    await reconcileIncomingDirectUnread()
    return false
  }
  if (incomingEnvelope.type === 'conversation_delete') {
    const deleted = await applyIncomingDirectConversationDelete({
      conversationId: msg.conversationId,
      targetIdentityId: incomingEnvelope.targetIdentityId,
      localIdentityId: chatIdentity?.id,
      client: chatClient,
    })
    recordSuppressedEnvelope(deleted ? 'conversation_delete_applied' : 'conversation_delete_ignored')
    updateContact(msg.senderId, { isOnline: true, lastSeenAt: Date.now() })
    await reconcileIncomingDirectUnread()
    if (deleted) {
      syncGlobalBadge().catch(() => {})
    }
    return false
  }
  if (incomingEnvelope.type === 'screenshot_protection') {
    recordSuppressedEnvelope('remote_screenshot_state_updated')
    updateRemoteScreenshotProtection(msg.senderId, incomingEnvelope.enabled, incomingEnvelope.updatedAt ?? msg.timestamp)
    updateContact(msg.senderId, { isOnline: true, lastSeenAt: Date.now() })
    await reconcileIncomingDirectUnread()
    return false
  }
  if (incomingEnvelope.type === 'tor_state') {
    recordSuppressedEnvelope('remote_tor_state_ignored')
    updateContact(msg.senderId, { isOnline: true, lastSeenAt: Date.now() })
    await reconcileIncomingDirectUnread()
    return false
  }
  if (incomingEnvelope.type === 'view_once_consumed') {
    const applied = await applyViewOnceConsumption(
      incomingEnvelope.targetMessageId,
      msg.conversationId,
      incomingEnvelope.consumedAt,
      {
        kind: 'remote',
        controlSenderId: msg.senderId,
        localIdentityId: chatIdentity?.id,
      },
    )
    recordSuppressedEnvelope(applied ? 'view_once_consumed_applied' : 'view_once_consumed_ignored')
    updateContact(msg.senderId, { isOnline: true, lastSeenAt: Date.now() })
    await reconcileIncomingDirectUnread()
    return false
  }
  if (incomingEnvelope.type === 'crypto_payment_request_update') {
    const applied = await applyCryptoPaymentRequestUpdate(incomingEnvelope.update, {
      conversationId: msg.conversationId,
    })
    recordSuppressedEnvelope(applied ? 'crypto_payment_request_update_applied' : 'crypto_payment_request_update_ignored')
    updateContact(msg.senderId, { isOnline: true, lastSeenAt: Date.now() })
    await reconcileIncomingDirectUnread()
    return false
  }
  if (incomingEnvelope.type === 'disappearing_timer') {
    recordSuppressedEnvelope('remote_disappearing_timer_updated')
    await applyIncomingDirectDisappearingTimer(
      msg.conversationId,
      msg.senderId,
      incomingEnvelope.timer,
      incomingEnvelope.updatedAt,
      msg.senderId,
    )
    updateContact(msg.senderId, { isOnline: true, lastSeenAt: Date.now() })
    await reconcileIncomingDirectUnread()
    return false
  }
  if (incomingEnvelope.type === 'ble_route_capability') {
    recordSuppressedEnvelope('ble_route_capability_processed')
    await handleBLERouteCapability(msg.senderId, incomingEnvelope.capability)
    updateContact(msg.senderId, { isOnline: true, lastSeenAt: Date.now() })
    await reconcileIncomingDirectUnread()
    return false
  }
  if (incomingEnvelope.type === 'hidden_control') {
    recordSuppressedEnvelope('hidden_control_processed')
    try {
      await processDirectGroupControlEnvelope(
        incomingEnvelope.raw as Parameters<typeof processDirectGroupControlEnvelope>[0],
        msg.senderId,
      )
    } catch (error) {
      console.warn('[QuantumChat] Failed to process hidden control envelope:', error)
    }
    updateContact(msg.senderId, { isOnline: true, lastSeenAt: Date.now() })
    await reconcileIncomingDirectUnread()
    return false
  }

  const processedContent = getEnvelopeBody(incomingEnvelope)
  const incomingReplyTo = getEnvelopeReplyReference(incomingEnvelope)
  const incomingOneTime = storedOneTime ?? getEnvelopeOneTimeState(incomingEnvelope)
  const incomingDisappearingTimer = getEnvelopeDisappearingTimer(incomingEnvelope)
  const incomingDisappearing = storedDisappearing
    ?? createIncomingDirectDisappearingState(incomingDisappearingTimer, msg.timestamp)
  
  // Extract media attachments.
  const { textContent, attachments } = parseMediaFromContent(processedContent)
  const annotatedMessageAttachments = annotateViewOnceAttachments(attachments, incomingOneTime)
  const messageAttachments = shouldBlockIncomingMediaInSpectre()
    ? createSpectreBlockedMediaAttachments(annotatedMessageAttachments)
    : annotatedMessageAttachments
  
  const inboundIdentityReplacement = corroboratesAvailability
    ? await lockAuthenticatedInboundIdentityReplacement(
      msg.senderId,
      msg.conversationId,
      options?.authenticatedSenderBundle,
    )
    : {}
  const senderContact = contacts.find((contact) => contact.identityId === msg.senderId)
  const senderDisplayContact = senderContact ?? inboundIdentityReplacement.previousContact
  const senderDisplayName = getDirectSenderDisplayName(senderDisplayContact, msg.senderId)
  const normalizedReplyTo = normalizeReplyReference(
    incomingReplyTo,
    senderDisplayName,
    chatIdentity?.id,
  )

  const chatMessage = buildIncomingDirectChatMessage({
    message: msg,
    localConversationContext,
    conversationId: msg.conversationId,
    senderDisplayName,
    content: textContent,
    localOrderTimestamp: getIncomingDirectOrderTimestamp(msg, createLocalOrderTimestamp),
    attachments: messageAttachments,
    replyTo: normalizedReplyTo,
    oneTime: incomingOneTime,
    disappearing: incomingDisappearing,
    systemEvent: getEnvelopeSystemEvent(incomingEnvelope),
  })
  
  if (senderContact?.trustState === 'blocked') {
    await deleteDirectMessagesAndReconcile({
      conversationId: msg.conversationId,
      localIdentityId: localConversationContext.localIdentityId,
      localWalletAddress: localConversationContext.localWalletAddress,
      messageIds: [msg.id],
    })
    syncGlobalBadge().catch(() => {})
    return false
  }
  if (!addMessage(chatMessage)) {
    recordServiceDiagnostic('receive', 'service_message_suppressed', {
      messageId: msg.id,
      conversationId: chatMessage.conversationId,
      senderIdentityId: msg.senderId,
      serverSequence: msg.serverSequence,
      suppressionReason: 'already_stored',
    })
    await markIncomingDirectMessageReadIfActive(msg, {
      conversationId: msg.conversationId,
      projectedConversationId: chatMessage.conversationId,
      senderIdentityId: msg.senderId,
      senderWalletAddress: inboundIdentityReplacement.walletAddress ?? senderContact?.walletAddress,
      localConversationContext,
      isCallInvite: buildDirectMessagePreview(msg.content, messageAttachments).isCallInvite,
    })
    await reconcileDirectUnreadState({
      conversationId: chatMessage.conversationId,
      localIdentityId: localConversationContext.localIdentityId,
      localWalletAddress: localConversationContext.localWalletAddress,
    })
    return false
  }
  completeMailboxCatchupBanner('messages')
  recordRealtimeMessageProjected(msg, options?.realtimeRequestedAt)

  const {
    preview: lastMessageContent,
    isCallInvite,
  } = buildDirectMessagePreview(msg.content, messageAttachments)
  
  if (
    messageAttachments
    && messageAttachments.length > 0
    && !shouldBlockIncomingMediaInSpectre()
    && messageAttachments.some((attachment) => shouldAutoHydrateAttachment(attachment))
  ) {
    downloadMediaAttachments(
      msg.id,
      chatMessage.conversationId,
      messageAttachments as ParsedAttachment[],
      'quantumChat.handleIncomingMessage',
      options?.runtime,
    )
      .then(localAttachments => {
        if (options?.runtime && !isChatRuntimeCurrent(options.runtime)) return
        updateMessage(msg.id, { attachments: localAttachments })
      })
      .catch(error => {
        console.warn('Failed to download media attachments:', error)
      })
  }
  
  const senderWallet = inboundIdentityReplacement.walletAddress ?? senderContact?.walletAddress

  const { activeConversationId, conversations: activeConversations } = useChatStore.getState()
  const isActiveChat = isActiveDirectThread({
    activeConversationId,
    conversations: activeConversations,
    localConversationContext,
    conversationId: msg.conversationId,
    projectedConversationId: chatMessage.conversationId,
    senderIdentityId: msg.senderId,
    senderWalletAddress: senderWallet,
  })
  const isAppBackground = AppState.currentState !== 'active'

  let preexistingConv = useChatStore.getState().conversations.find(
    (c) => matchesLocalConversationContext(c, localConversationContext)
      && (
        c.id === chatMessage.conversationId
        || c.remoteIdentityId === msg.senderId
        || (senderWallet && c.remoteWalletAddress === senderWallet)
      )
  )
  if (
    preexistingConv
    && preexistingConv.id !== chatMessage.conversationId
    && preexistingConv.remoteIdentityId === msg.senderId
  ) {
    await rekeyConversationArtifacts(preexistingConv.id, chatMessage.conversationId)
    preexistingConv = useChatStore.getState().conversations.find(
      (conversation) => conversation.id === chatMessage.conversationId,
    )
  }

  if (!preexistingConv) {
    addConversation({
      id: chatMessage.conversationId,
      ...localConversationContext,
      remoteIdentityId: msg.senderId,
      remoteWalletAddress: senderWallet,
      createdAt: msg.timestamp,
      lastMessage: {
        content: lastMessageContent,
        timestamp: msg.timestamp,
        isOwn: false,
      },
      unreadCount: 0,
    })
  }

  await persistDirectMessageDisappearingState(chatMessage.id, incomingDisappearing)
  await persistDirectMessageLocalOrderTimestamp(chatMessage.id, chatMessage.localOrderTimestamp ?? chatMessage.timestamp)
  if (isActiveChat && !isAppBackground) {
    await markActiveIncomingDirectMessageRead(msg, {
      conversationId: chatMessage.conversationId,
      localIdentityId: localConversationContext.localIdentityId,
      localWalletAddress: localConversationContext.localWalletAddress,
      isCallInvite,
    })
  }
  recordChatLatency('receive', 'handle_incoming_to_store', Date.now() - handleStartedAt, {
    messageId: msg.id,
    senderId: msg.senderId,
    conversationId: chatMessage.conversationId,
    hasAttachments: Boolean(messageAttachments && messageAttachments.length > 0),
  })

  // Notify only when this chat is not active.
  if (!isActiveChat) {
    if (!isAppBackground && !isCallInvite && !options?.suppressLocalNotifications) {
      // Use a local foreground preview.
      sendDirectLocalNotificationWithPrivacy({
        recipientIdentityId: localConversationContext.localIdentityId,
        senderIdentityId: msg.senderId,
        conversationId: chatMessage.conversationId,
        localWalletAddress: localConversationContext.localWalletAddress,
        remoteWalletAddress: senderWallet,
        messageId: msg.id,
      }).catch(() => {})
    }
  }
  
  if (senderContact) {
    updateContact(senderContact.identityId, {
      isOnline: true,
      lastSeenAt: Date.now(),
    })
  }

  const allowWalletConversationMerge = !(
    senderContact?.identityChanged === true
    && senderContact.identityId !== msg.senderId
  )
  
  const existingConv = useChatStore.getState().conversations.find(
    (c) => matchesLocalConversationContext(c, localConversationContext)
      && (
        c.id === chatMessage.conversationId
        || c.remoteIdentityId === msg.senderId
        || (allowWalletConversationMerge && senderWallet && c.remoteWalletAddress === senderWallet)
      )
  )
  
  if (existingConv) {
    const updates: Partial<Conversation> = {
      ...localConversationContext,
      lastMessage: {
        content: lastMessageContent,
        timestamp: msg.timestamp,
        isOwn: false,
      },
      unreadCount: 0,
      remoteIdentityId: existingConv.remoteIdentityId === msg.senderId
        ? msg.senderId
        : existingConv.remoteIdentityId,
    }
    if (senderWallet && !existingConv.remoteWalletAddress) {
      updates.remoteWalletAddress = senderWallet
    }
    updateConversation(existingConv.id, updates)

    // Keep only the canonical conversation.
    const wallet = existingConv.remoteWalletAddress || senderWallet
    if (allowWalletConversationMerge && wallet) {
      const latest = useChatStore.getState().conversations
      const dupes = latest.filter(
        (c) => matchesLocalConversationContext(c, localConversationContext)
          && c.id !== existingConv.id
          && (
            c.remoteIdentityId === msg.senderId
            || (wallet && c.remoteWalletAddress === wallet)
          )
      )
      for (const dupe of dupes) {
        await rekeyConversationArtifacts(dupe.id, existingConv.id)
      }
    }
  } else {
    addConversation({
      id: chatMessage.conversationId,
      ...localConversationContext,
      remoteIdentityId: msg.senderId,
      remoteWalletAddress: senderWallet,
      createdAt: msg.timestamp,
      lastMessage: {
        content: lastMessageContent,
        timestamp: msg.timestamp,
        isOwn: false,
      },
      unreadCount: 0,
    })
  }

  await localChatStorage.updateConversation(chatMessage.conversationId, {
    lastMessage: {
      content: lastMessageContent,
      timestamp: msg.timestamp,
      senderId: msg.senderId,
    },
  }).catch(() => {})
  await reconcileDirectUnreadState({
    conversationId: chatMessage.conversationId,
    localIdentityId: localConversationContext.localIdentityId,
    localWalletAddress: localConversationContext.localWalletAddress,
  })

  if (!isCallInvite && !isActiveChat) {
    syncGlobalBadge().catch(() => {})
  }
  return corroboratesAvailability
  } catch (error) {
    if (!useChatStore.getState().getMessageById(msg.id)) {
      recentlyProcessedMessageIds.delete(msg.id)
    }
    throw error
  }
}

async function sendOwnContactProfile(
  runtime: QuantumChatRuntime,
  recipientIdentityId: string,
  options: { requireSavedContact?: boolean } = {},
): Promise<void> {
  const client = runtime.client
  const identity = runtime.identity
  if (
    !client
    || !identity
    || !isChatRuntimeCurrent(runtime)
    || recipientIdentityId === identity.id
  ) {
    return
  }
  const contact = useChatStore.getState().contacts.find(
    (candidate) => candidate.identityId === recipientIdentityId,
  )
  if (!canShareOwnContactProfileWith(contact, options)) {
    return
  }
  const profile = await ensureOwnContactProfile(identity.id)
  if (!isChatRuntimeCurrent(runtime)) return
  if (!(await contactNeedsProfileSync(recipientIdentityId, profile))) {
    return
  }
  const result = await client.sendContactProfile(recipientIdentityId, profile)
  if (result.ok && isChatRuntimeCurrent(runtime)) {
    await markContactProfileSynced(recipientIdentityId, profile)
  }
}

async function handleContactProfileReceived(
  runtime: QuantumChatRuntime,
  senderIdentityId: string,
  profile: unknown,
): Promise<'applied' | 'rejected' | 'retry'> {
  if (!isChatRuntimeCurrent(runtime)) return 'retry'
  const bundle = await localChatStorage.getPublicKeyBundle(senderIdentityId)
  if (!bundle) return 'rejected'
  if (!isChatRuntimeCurrent(runtime)) return 'retry'
  const applied = await applyContactProfileSnapshot(bundle, profile)
  if (!applied) return 'rejected'
  if (!isChatRuntimeCurrent(runtime)) return 'retry'
  await refreshLocalContactProjection(runtime.lease.walletScope, runtime.lease.signal)
  return 'applied'
}

// Event listeners

function setupEventListeners(runtime: QuantumChatRuntime): void {
  const client = runtime.client
  if (!client || !isChatRuntimeCurrent(runtime)) return
  
  // Clear existing listeners.
  eventUnsubscribers.forEach(unsub => unsub())
  eventUnsubscribers.length = 0
  client.setProfileSyncResponseHandler(async (senderIdentityId, profile) => {
    return handleContactProfileReceived(runtime, senderIdentityId, profile)
  })
  eventUnsubscribers.push(() => client.setProfileSyncResponseHandler(null))

  const appStateSubscription = AppState.addEventListener('change', (nextState) => {
    const previousAppState = lastKnownAppState
    const resumed =
      (previousAppState === 'background' || previousAppState === 'inactive') &&
      nextState === 'active'
    if (nextState === 'background' || nextState === 'inactive') {
      lastBackgroundedAt = Date.now()
    }
    lastKnownAppState = nextState

    if (resumed) {
      clearIdentityResolutionCaches()
      scheduleMediaSendCleanup(runtime.lease.walletScope)

      const torState = useTorStore.getState()
      const now = Date.now()
      const backgroundedMs = lastBackgroundedAt > 0 ? now - lastBackgroundedAt : 0
      const resumedFromBackground = previousAppState === 'background'
      const catchup = evaluateForegroundMailboxCatchup({
        lastServerSequence: runtime.lastServerSequence,
        backgroundedMs,
        realtimeDead: resumedFromBackground || (!torState.enabled && !S.realtimeChannel),
        now,
        lastRequestedAt: lastForegroundReconcileRequestedAt,
        inFlight: foregroundReconcileInFlight,
      })

      const recoverForegroundSession = async (): Promise<boolean> => {
        await recoverBoundSessionOnForeground(runtime.identity?.id)
        syncBundleServerAccessToken()
        return Boolean(getCurrentBackendSessionToken())
      }
      const hydrateLocalConversations = () => loadCachedConversations().catch((error) => {
        console.warn('[QuantumChat] Failed to hydrate conversations after resume:', error)
      })
      const vaultReady =
        useWalletStore.getState().isVaultUnlocked
        && Boolean(useWalletStore.getState().wallet)
        && useAuthStore.getState().isAuthenticated

      if (!vaultReady) {
        pendingForegroundReconcile = {
          fullResync: catchup.fullResync,
          restartRealtime: true,
          backgroundedMs,
        }
        void hydrateLocalConversations()
        if (__DEV__) console.log('[QuantumChat] Foreground resume queued — vault locked')
        recordServiceDiagnostic('performance', 'foreground_reconcile_skipped', {
          reason: 'vault_locked_queued',
          backgroundedMs,
        })
        return
      }

      if (torState.enabled && torState.status !== 'connected') {
        pendingForegroundReconcile = {
          fullResync: catchup.fullResync,
          restartRealtime: true,
          backgroundedMs,
        }
        void recoverForegroundSession()
          .then(() => hydrateLocalConversations())
          .catch((error) => {
            console.warn('[QuantumChat] Foreground session recovery failed:', error)
          })
        if (__DEV__) console.log('[QuantumChat] Foreground resume queued — Tor not connected yet')
        recordServiceDiagnostic('performance', 'foreground_reconcile_skipped', {
          reason: 'tor_not_connected_queued',
          torStatus: torState.status,
        })
        return
      }

      pendingForegroundReconcile = null
      if (catchup.urgentCatchup) {
        beginMailboxCatchupBurst()
      }
      if (catchup.skipReason) {
        void recoverForegroundSession()
          .then(() => hydrateLocalConversations())
          .catch((error) => {
            console.warn('[QuantumChat] Foreground session recovery failed:', error)
          })
        recordServiceDiagnostic('performance', 'foreground_reconcile_skipped', {
          reason: catchup.skipReason,
          elapsedSinceLastMs: lastForegroundReconcileRequestedAt > 0
            ? now - lastForegroundReconcileRequestedAt
            : null,
          debounceMs: FOREGROUND_RECONCILE_DEBOUNCE_MS,
          urgentCatchup: catchup.urgentCatchup,
          backgroundedMs,
        })
        return
      }
      lastForegroundReconcileRequestedAt = now
      foregroundReconcileInFlight = true
      lastBackgroundedAt = 0

      const runForegroundReconcile = () => {
        if (AppState.currentState !== 'active') {
          foregroundReconcileInFlight = false
          recordServiceDiagnostic('performance', 'foreground_reconcile_skipped', {
            reason: 'not_active_after_interactions',
            appState: AppState.currentState,
          })
          return
        }

        const startedAt = Date.now()
        void (async () => {
          try {
            const hasFreshToken = await recoverForegroundSession()
            if (!hasFreshToken) {
              await hydrateLocalConversations()
              return
            }
            await reconcileQuantumChat({
              fullResync: catchup.fullResync,
              restartRealtime: catchup.restartRealtime,
              reason: 'foreground_resume',
              suppressLocalNotifications: true,
            })
          } catch (error) {
            console.warn('[QuantumChat] Foreground reconciliation failed:', error)
          } finally {
            foregroundReconcileInFlight = false
            recordServiceDiagnostic('performance', 'foreground_reconcile_complete', {
              elapsedMs: Date.now() - startedAt,
              debounceMs: FOREGROUND_RECONCILE_DEBOUNCE_MS,
              fullResync: catchup.fullResync,
              restartRealtime: catchup.restartRealtime,
              backgroundedMs,
              urgentCatchup: catchup.urgentCatchup,
            })
          }
        })()
      }

      if (catchup.urgentCatchup) {
        runForegroundReconcile()
        return
      }

      InteractionManager.runAfterInteractions(runForegroundReconcile)
    }
  })
  eventUnsubscribers.push(() => appStateSubscription.remove())

  const torStoreUnsubscribe = useTorStore.subscribe((state, previousState) => {
    const enabledChanged = state.enabled !== previousState.enabled
    const statusChanged = state.status !== previousState.status

    if (!enabledChanged && !statusChanged) {
      return
    }

    clearIdentityResolutionCaches()

    if (enabledChanged) {
      scheduleMessagePolling()
      syncRealtimeSubscriptionForTransport()
    }

    if (state.enabled && state.status === 'connected' && previousState.status !== 'connected') {
      scheduleMessagePolling()
      void (async () => {
        await new Promise((r) => setTimeout(r, TOR_CONFIG.POST_CONNECT_STABILIZATION_MS))

        resetAuthCooldowns()

        const pending = pendingForegroundReconcile
        pendingForegroundReconcile = null
        await recoverBoundSessionOnForeground(runtime.identity?.id)
        syncBundleServerAccessToken()

        const bundleHealthPromise = ensureBundleHealth('manual_recovery')
          .catch((e) => {
            console.warn('[QuantumChat] Tor recovery: ensureBundleHealth failed:', e)
            return false
          })

        const localHydrationPromise = (async () => {
          const walletAddress = useWalletStore.getState().wallet?.address
          if (!walletAddress) return
          try {
            await ensureLocalChatHydration(walletAddress).fullLocalReady
            await syncContactsIntoChatClient(useChatStore.getState().contacts, walletAddress)
            await loadConversations()
          } catch (e) {
            console.warn('[QuantumChat] Tor recovery: local hydration failed:', e)
          }
        })()

        await Promise.allSettled([
          bundleHealthPromise,
          localHydrationPromise,
        ])

        await recoverPendingRelayDeliveries(runtime).catch((error) => {
          if (error instanceof StaleWalletRuntimeError) return
          recordServiceDiagnostic('send', 'service_retry_recovery_failed', {
            error: describeDiagnosticError(error),
          })
        })

        try {
          await reconcileQuantumChat({
            fullResync: pending?.fullResync
              || runtime.lastServerSequence <= 0
              || isForegroundMailboxStale(
                pending?.backgroundedMs
                  ?? (lastBackgroundedAt > 0 ? Date.now() - lastBackgroundedAt : 0),
              ),
            restartRealtime: pending?.restartRealtime ?? false,
            reason: 'manual_recovery',
            skipBundleHealth: true,
          })
        } catch (e) { console.warn('[QuantumChat] Tor recovery: reconciliation failed:', e) }
      })()
      return
    }

    if (enabledChanged) {
      resetAuthCooldowns()
      const torJustDisabled = !state.enabled && previousState.enabled
      reconcileQuantumChat({
        fullResync: torJustDisabled,
        restartRealtime: torJustDisabled,
        reason: 'manual_recovery',
      }).catch((error) => {
        console.warn('[QuantumChat] Transport reconfiguration failed:', error)
      })
    } else if (statusChanged && previousState.status === 'connected') {
      reconcileQuantumChat({
        fullResync: false,
        restartRealtime: false,
        reason: 'manual_recovery',
      }).catch((error) => {
        console.warn('[QuantumChat] Transport reconfiguration failed:', error)
      })
    }
  })
  eventUnsubscribers.push(torStoreUnsubscribe)

  const spectreStoreUnsubscribe = useSpectreStore.subscribe((state, previousState) => {
    if (state.enabled === previousState.enabled) {
      return
    }

    clearIdentityResolutionCaches()
    scheduleMessagePolling()
    syncRealtimeSubscriptionForTransport()
    resetAuthCooldowns()

    reconcileQuantumChat({
      fullResync: true,
      restartRealtime: !state.enabled,
      reason: 'manual_recovery',
    }).catch((error) => {
      console.warn('[QuantumChat] Spectre transport reconfiguration failed:', error)
    })
  })
  eventUnsubscribers.push(spectreStoreUnsubscribe)
  
  eventUnsubscribers.push(
    client.on('contact:added', () => {
      if (!isChatRuntimeCurrent(runtime)) return
      void runtime.lease.track(
        refreshLocalContactProjection(runtime.lease.walletScope, runtime.lease.signal)
          .catch((error) => {
            if (error instanceof StaleWalletRuntimeError) return
            console.warn('[QuantumChat] Incoming contact projection failed:', error)
          }),
      )
    })
  )

  eventUnsubscribers.push(
    client.on('profile:requested', (event) => {
      if (!isChatRuntimeCurrent(runtime)) return
      const requesterIdentityId = (event.data as { requesterIdentityId?: string })?.requesterIdentityId
      if (!requesterIdentityId) return
      void runtime.lease.track(
        sendOwnContactProfile(runtime, requesterIdentityId, { requireSavedContact: true })
          .catch(() => undefined),
      )
    }),
  )

  eventUnsubscribers.push(
    client.on('message:received', (event) => {
      if (!isChatRuntimeCurrent(runtime)) return
      if (__DEV__) console.log('Message received event:', event)

      const eventData = event.data as {
        message: DecryptedMessage & { serverSequence?: number }
        authenticatedSenderBundle?: PublicKeyBundle
        conversation?: {
          remoteIdentityId?: string
        }
      }
      void runtime.lease.track(processMessageReceivedEvent({
        eventData,
        handleIncomingMessage: async (message, authenticatedSenderBundle) => {
          const corroboratesAvailability = await handleIncomingMessage(message, {
            runtime,
            authenticatedSenderBundle,
          })
          if (corroboratesAvailability) {
            await clearRemoteAccountUnavailableAfterAuthenticatedInboundMessage(
              message,
              authenticatedSenderBundle,
            )
          }
        },
        recordDiagnostic: (name, fields) => recordServiceDiagnostic('receive', name, fields),
        transportPath: getRelayTransportPath(),
        onAdvanceSequence: (serverSequence) => {
          if (!isChatRuntimeCurrent(runtime)) return
          advanceRuntimeRelayCursor(runtime, serverSequence)
        },
      }).catch(e => console.warn('[QuantumChat] handleIncomingMessage failed:', e)))
    })
  )
  
  eventUnsubscribers.push(
    client.on('bundle:published', () => {
      if (!isChatRuntimeCurrent(runtime)) return
      void resyncActiveWalletPushRegistration('bundle_published')
    })
  )

  eventUnsubscribers.push(
    client.on('mailbox_scope:registered', () => {
      if (!isChatRuntimeCurrent(runtime)) return
      scheduleRealtimeMailboxSubscriptionRefresh()
    })
  )

  eventUnsubscribers.push(
    client.on('security:warning', (event) => {
      if (!isChatRuntimeCurrent(runtime)) return
      console.warn('Security warning:', event)
      
      const data = event.data as {
        type: string
        message?: string
        details?: string
        severity: string
        contactId?: string
        identityId?: string
        requiresAction?: boolean
      }
      useChatStore.getState().addSecurityAlert({
        type: data.type as 'identity_key_changed' | 'bundle_stale' | 'key_mismatch' | 'replay_attempt',
        message: data.message || data.details || 'Security warning',
        severity: data.severity as 'low' | 'medium' | 'high' | 'critical',
        contactId: data.contactId || data.identityId,
        requiresAction: data.requiresAction,
      })
    })
  )
  
  eventUnsubscribers.push(
    client.on('identity:key_changed', (event) => {
      if (!isChatRuntimeCurrent(runtime)) return
      console.warn('Identity key changed:', event)
      
      const data = event.data as { identityId: string; severity?: string }
      useChatStore.getState().addSecurityAlert({
        type: 'identity_key_changed',
        message: `Identity keys changed for ${data.identityId}`,
        severity: (data.severity as 'low' | 'medium' | 'high' | 'critical') || 'high',
        contactId: data.identityId,
        requiresAction: true,
      })
    })
  )
  
  eventUnsubscribers.push(
    client.on('contact:identity_migrated', (event) => {
      if (!isChatRuntimeCurrent(runtime)) return
      const data = event.data as {
        oldIdentityId: string
        newIdentityId: string
        walletAddress: string
        conversationId: string
      }
      if (!data) return

      const { contacts, updateContact: updateC, addSecurityAlert } = useChatStore.getState()

      const oldContact = contacts.find(c => c.identityId === data.oldIdentityId)
      if (oldContact) {
        updateC(data.oldIdentityId, {
          trustState: 'changed',
          identityChanged: true,
        })
      }

      addSecurityAlert({
        type: 'identity_key_changed',
        message: `Chat identity changed for ${oldContact?.displayName || data.walletAddress}. Verify the safety number before migrating this conversation.`,
        severity: 'high',
        contactId: data.oldIdentityId,
        requiresAction: true,
      })
    })
  )

  eventUnsubscribers.push(
    client.on('conversation:created', (event) => {
      if (!isChatRuntimeCurrent(runtime)) return
      const raw = event.data as {
        conversationId?: string
        remoteIdentityId?: string
        conversation?: {
          id: string
          remoteIdentityId: string
          hasVisibleActivity?: boolean
        }
      }
      const data = {
        conversationId: raw.conversationId || raw.conversation?.id,
        remoteIdentityId: raw.remoteIdentityId || raw.conversation?.remoteIdentityId,
        hasVisibleActivity: raw.conversation?.hasVisibleActivity,
      }
      const { conversations, addConversation } = useChatStore.getState()
      
      // Prevent duplicate conversations.
      const exists = conversations.some(
        c => c.id === data.conversationId || c.remoteIdentityId === data.remoteIdentityId
      )
      if (data.conversationId && data.remoteIdentityId && !exists) {
        addConversation({
          id: data.conversationId,
          remoteIdentityId: data.remoteIdentityId,
          createdAt: Date.now(),
          unreadCount: 0,
          hasVisibleActivity: data.hasVisibleActivity,
        })
      }
    })
  )
  
  eventUnsubscribers.push(
    client.on('conversation:updated', (event) => {
      if (!isChatRuntimeCurrent(runtime)) return
      const data = event.data as { conversationId: string; updates?: Record<string, unknown> }
      if (data.updates) {
        const { lastMessage, ...safeUpdates } = data.updates
        if (Object.keys(safeUpdates).length > 0) {
          useChatStore.getState().updateConversation(data.conversationId, safeUpdates as Partial<Conversation>)
        }
      }
    })
  )

  eventUnsubscribers.push(
    client.on('message:delivered', (event) => {
      if (!isChatRuntimeCurrent(runtime)) return
      const data = event.data as { messageId?: string }
      if (data?.messageId) {
        const store = useChatStore.getState()
        const message = store.getMessageById(data.messageId)
        if (!message || compareMessageStatus(message.status, 'delivered') >= 0) return
        store.updateMessage(data.messageId, {
          status: 'delivered',
          deliveryStage: 'delivered',
          deliveryHint: 'Delivered',
        })
      }
    })
  )

  eventUnsubscribers.push(
    client.on('message:read', (event) => {
      if (!isChatRuntimeCurrent(runtime)) return
      const data = event.data as { messageId?: string }
      if (data?.messageId) {
        const store = useChatStore.getState()
        const message = store.getMessageById(data.messageId)
        if (!message || compareMessageStatus(message.status, 'read') >= 0) return
        store.updateMessage(data.messageId, {
          status: 'read',
          deliveryStage: 'read',
          deliveryHint: 'Read',
        })
        void runtime.lease.track(
          armDirectMessageOnRead(data.messageId, Date.now()).catch(() => undefined),
        )
      }
    })
  )

  // Reset broken sessions after repeated failures.
  const trackDecryptionFailure = async (senderId: string) => {
    assertChatRuntimeCurrent(runtime)
    const now = Date.now()
    const entry = decryptionFailureCounts.get(senderId) || { count: 0, lastFailure: 0 }

    if (now - entry.lastFailure > FAILURE_COUNT_RESET_MS) {
      entry.count = 0
    }

    entry.count++
    entry.lastFailure = now
    decryptionFailureCounts.set(senderId, entry)

    if (entry.count >= MAX_CONSECUTIVE_FAILURES) {
      console.warn(
        `[QuantumChat] ${entry.count} consecutive decryption failures for ${senderId.slice(0, 8)}… — archiving session and re-publishing bundle`
      )
      decryptionFailureCounts.delete(senderId)

      try {
        const { archiveSession } = await import('@spectra/core-crypto')
        assertChatRuntimeCurrent(runtime)
        const session = await getActiveSession(senderId)
        assertChatRuntimeCurrent(runtime)
        if (session) {
          await archiveSession(session.id, 'error')
          assertChatRuntimeCurrent(runtime)
        }
      } catch (resetErr) {
        console.warn('[QuantumChat] Auto session reset failed:', resetErr)
      }

      await ensureBundleHealth('decryption_failure')
      assertChatRuntimeCurrent(runtime)

      useChatStore.getState().addSecurityAlert({
        type: 'key_mismatch',
        message: `Repeated decryption failures with ${senderId.slice(0, 8)}… — session has been reset. New messages will re-establish encryption.`,
        severity: 'medium',
        contactId: senderId,
      })
    }
  }

  eventUnsubscribers.push(
    client.on('message:decryption_failed', (event) => {
      if (!isChatRuntimeCurrent(runtime)) return
      const data = event.data as { messageId?: string; senderId?: string; error?: string }
      recordServiceDiagnostic('receive', 'service_message_decryption_failed', {
        messageId: data?.messageId,
        senderIdentityId: data?.senderId,
        deliveryStage: 'decryption_failed',
        transportPath: getRelayTransportPath(),
        error: data?.error,
      })
      if (data?.senderId) {
        void runtime.lease.track(trackDecryptionFailure(data.senderId).catch((error) => {
          if (error instanceof StaleWalletRuntimeError) return
          console.warn('[QuantumChat] Decryption failure recovery failed:', error)
        }))
      }
    })
  )

  eventUnsubscribers.push(
    client.on('message:undecryptable', (event) => {
      if (!isChatRuntimeCurrent(runtime)) return
      const data = event.data as {
        messageId?: string
        senderId?: string
        error?: string
        retryRequested?: boolean
        repairOutcome?: string
        repairFailureReason?: string
        bootstrapFailure?: boolean
      }
      recordServiceDiagnostic('receive', 'service_message_undecryptable', {
        messageId: data?.messageId,
        senderIdentityId: data?.senderId,
        deliveryStage: 'undecryptable',
        transportPath: getRelayTransportPath(),
        error: data?.error,
        retryRequested: data?.retryRequested,
        repairOutcome: data?.repairOutcome,
        repairFailureReason: data?.repairFailureReason,
        bootstrapFailure: data?.bootstrapFailure,
      })
      if (data?.senderId) {
        void runtime.lease.track(trackDecryptionFailure(data.senderId).catch((error) => {
          if (error instanceof StaleWalletRuntimeError) return
          console.warn('[QuantumChat] Decryption failure recovery failed:', error)
        }))
      }
    })
  )

}

// Session repair

/**
 * Archives a contact session so the next message starts fresh.
 */
export async function repairSessionForContact(
  remoteIdentityId: string
): Promise<{ success: boolean; error?: string }> {
  if (!chatClient) {
    return { success: false, error: 'Chat not initialized' }
  }

  try {
    const { archiveSession, getActiveSessionByRemoteIdentity } = await import('@spectra/core-crypto')

    const session = await getActiveSessionByRemoteIdentity(remoteIdentityId)
    if (session) {
      await archiveSession(session.id, 'manual')
    }

    decryptionFailureCounts.delete(remoteIdentityId)
    await ensureBundleHealth('manual_recovery')

    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

/**
 * Archives all active sessions and republishes the local bundle.
 */
export async function repairAllSessions(): Promise<{ success: boolean; repaired: number; error?: string }> {
  if (!chatClient || !chatIdentity) {
    return { success: false, repaired: 0, error: 'Chat not initialized' }
  }

  try {
    const { archiveSession } = await import('@spectra/core-crypto')
    const { contacts } = useChatStore.getState()
    let repaired = 0

    for (const contact of contacts) {
      try {
        const session = await getActiveSession(contact.identityId)
        if (session) {
          await archiveSession(session.id, 'manual')
          repaired++
        }
      } catch {
        // Continue with the next contact.
      }
    }

    decryptionFailureCounts.clear()
    await ensureBundleHealth('manual_recovery')

    return { success: true, repaired }
  } catch (error) {
    return { success: false, repaired: 0, error: (error as Error).message }
  }
}

// Safety numbers

export async function getSafetyNumber(remoteIdentityId: string): Promise<SafetyNumber | null> {
  if (!chatClient) return null
  
  try {
    const myBundle = await chatClient.getPublicKeyBundle()
    if (!myBundle) {
      return null
    }
    
    const { contacts } = useChatStore.getState()
    const contact = contacts.find((c) => c.identityId === remoteIdentityId)
    
    if (!contact?.publicKeyBundle) {
      return null
    }
    
    return generateSafetyNumberFromBundlesAsync(myBundle, contact.publicKeyBundle)
  } catch (error) {
    console.error('Failed to generate safety number:', error)
    return null
  }
}

// Session access

/**
 * Gets the active Double Ratchet session for call keys.
 */
export async function getActiveSessionByRemoteIdentity(remoteIdentityId: string): Promise<Session | null> {
  if (!chatClient) return null
  return getActiveSession(remoteIdentityId)
}

/**
 * Gets the local ML-DSA-65 signing key for in-process use only.
 * The exported function name is retained for backward compatibility.
 */
export async function getLocalDilithiumPrivateKey(): Promise<string | null> {
  if (!chatIdentity) return null

  try {
    const identityWithKeys = await localChatStorage.getIdentity(chatIdentity.id)
    return identityWithKeys?.dilithiumPrivateKey || null
  } catch (error) {
    console.warn('Failed to load local ML-DSA-65 private key:', error)
    return null
  }
}

export type { PublicKeyBundle, SafetyNumber, Session }
export { whenInitialMailboxCatchupSettled }
