/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Chat client
 * 
 * Main chat client that orchestrates all components:
 * - Identity management
 * - Multi-session establishment and fallback decryption
 * - Message encryption/decryption with replay protection
 * - Local storage with encryption at rest
 * - Server-side bundle management (optional)
 * - Message relay for offline delivery (optional)
 */

import type {
  ChatConfig,
  ChatIdentity,
  ChatIdentityWithKeys,
  HybridPreKey,
  PrivateKeyBundle,
  PublicKeyBundle,
  Conversation,
  Message,
  DecryptedMessage,
  EncryptedMessage,
  Session,
  SessionRecord,
  ChatEvent,
  SecurityWarningEvent,
  SecurityConfig,
  RelayedMessage,
  ControlMessage,
  ReceiptPolicy,
  PendingMessageFetchOptions,
  PendingMessageFetchResult,
  ProcessedMessageRecord,
  RelayRepairAction,
  RelayRepairOutcome,
  RetryRequestRecord,
  RetryRequestResolution,
  RelayReceiptJob,
  RelayReceiptJobStatus,
  SealedRelayedMessage,
  OutboundSealedRelayRecord,
  OutboundSealedControlRecord,
  MailboxScopeState,
  PublishBundleResult,
  RelayMessageKind,
  CooperativeYieldStage,
  SignedContactProfile,
} from '../types/index'
import {
  ConversationHandle,
  markConversationReadState,
} from './conversationHandle'
import { DEFAULT_SECURITY_CONFIG, SESAME_TIMING } from '../types/index'
import type { TrackedIdentity, IdentityKeyChangeEvent } from '../types/index'
import { ChatError, SessionError, ReplayError } from '../types/index'
import { 
  localChatStorage, 
  initStorageEncryption, 
  initStorageEncryptionFromPassword,
  isStorageEncryptionEnabled
} from '../storage/local'
import { signWithDilithiumAsync, verifyDilithiumSignatureAsync } from '../crypto/dilithium'
import { canonicalJsonStringify } from '../crypto/canonicalJson'
import { bytesToBase64, generateRandomBytes, generateUUID, now, createMessageHash, stringToBytes, concatBytes, hash } from '../crypto/utils'
import {
  SealedEnvelopeReplayCache,
  deriveRecipientMailboxToken,
  deriveScopedRecipientMailboxToken,
  openRelayEnvelope,
  openControlEnvelope,
  sealControlEnvelope,
} from '../crypto/sealedEnvelope'
import {
  bundleSupportsScopedMailboxAsync,
} from '../crypto/bundleCapabilities'
import { verifySignedContactProfile } from '../crypto/contactProfile'
import {
  signPublicKeyBundleWalletAuthorization,
  verifyPublicKeyBundleWalletAuthorizationAsync,
} from '../crypto/walletAuthorization'
import {
  createTrackedIdentityFromBundle,
  hasIdentityChanged,
  updateTrackedIdentity,
  verifyIdentity as markIdentityVerified,
  acknowledgeKeyChange,
  isCommunicationAllowed
} from '../crypto/identityTracking'
import { generateSafetyNumberFromBundlesAsync } from '../crypto/safetyNumber'
import {
  createAnonymousIdentity,
  createLinkedIdentity,
  loadIdentityByAddress,
  exportIdentity,
  importIdentity,
  getPublicKeyBundle,
  storeContactBundle,
  shouldPersistContactBundle,
} from './identity'
import { createCompactTransportBundle } from './transportBundle'
import {
  establishSessionAsInitiator,
  getActiveSessionByRemoteIdentity,
  getAllSessionsForRemoteIdentity,
  encryptSessionMessage,
  establishSessionAndDecrypt,
  getX3DHBootstrapFailureDetails,
  deleteSession,
  archiveSession,
  cleanupProcessedMessages,
  sessionNeedsReestablishment,
  setSessionSecurityConfig
} from './session'
import {
  createPublicKeyBundleAsync,
  bundleNeedsRefresh,
  rotateSignedPreKeyAsync,
  replenishOneTimePreKeysAsync,
  generateOneTimePreKeysAsync,
  verifyPublicKeyBundleAsync,
  STARTUP_PREKEY_COUNT,
  TARGET_PREKEY_COUNT,
} from '../crypto/x3dh'
import { deriveX25519PublicKey } from '../crypto/x25519'
import { 
  createBundleServer, 
  BundleServerRequestError,
  type BundleServer,
  type BundleServerRequestFailureReason,
} from '../server/index'
import type { TelemetryFieldValue, TelemetrySpan } from '../types/index'
import {
  applyRelayReceipt,
  compareMessageStatus,
  shouldSyncOutboundStatus,
  stageRelayDeliveryOutbox,
} from '../messageLifecycle'
import {
  ensureInboundMailboxScopes,
  MAILBOX_SCOPE_REGISTRATION_REFRESH_MS,
  MAILBOX_SCOPE_REGISTRATION_VERSION,
} from './mailboxRegistry'

const CONTROL_MESSAGE_POLL_INTERVAL_MS = 3_000
const TOR_CONTROL_MESSAGE_POLL_INTERVAL_MS = 15_000
const RELAY_MESSAGE_DELETE_INITIAL_DELAY_MS = 5_000
const RELAY_MESSAGE_DELETE_RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 5 * 60 * 1_000] as const
const RETRY_REQUEST_BACKOFF_DELAYS_MS = [15_000, 60_000, 5 * 60 * 1_000, 15 * 60 * 1_000] as const
const RETRY_REQUEST_RECORD_RETENTION_MS = SESAME_TIMING.staleRetention
const RELAY_RECEIPT_JOB_RETENTION_MS = SESAME_TIMING.staleRetention
const RELAY_RECEIPT_JOB_RETRY_DELAYS_MS = [5_000, 15_000, 60_000, 5 * 60 * 1_000] as const
const RELAY_RECEIPT_JOB_CONCURRENCY = 2
const RELAY_RECEIPT_FLUSH_DEBOUNCE_MS = 750
const RELAY_RECEIPT_ACTIVE_RETRY_MS = 100
const RELAY_RECEIPT_RATE_LIMIT_FALLBACK_MS = 60_000
const RELAY_CLEANUP_DEFERRED_DIAGNOSTIC_INTERVAL_MS = 5_000
const MAILBOX_VACUUM_DEBOUNCE_MS = 30_000
const OUTBOUND_STATUS_SYNC_INTERVAL_MS = 20_000
const TOR_OUTBOUND_STATUS_SYNC_INTERVAL_MS = 15_000
const MAX_STATUS_QUERY_LIMIT = 100
const VIEW_ONCE_PREVIEW_TEXT = 'One-time message'
const MAX_PROFILE_CONTROL_BYTES = 192 * 1024
const TERMINAL_MESSAGE_ERROR_MARKERS = [
  'authentication tag mismatch',
  'Failed to decrypt message header',
  'no valid header key found',
  'signature verification failed',
  'Invalid contact key bundle',
  'Invalid contact wallet authorization',
  'Session not ready for receiving',
  'No sessions found for identity',
  'No session found for sender and message has no X3DH data',
] as const

function throwIfChatOperationAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('Chat operation cancelled')
  error.name = 'AbortError'
  throw error
}

type RepairSendResult =
  | { ok: true }
  | {
    ok: false
    reason: 'server_unavailable' | 'not_initialized' | BundleServerRequestFailureReason
    message: string
  }

type RelayRepairDecisionKind =
  | 'resolved'
  | 'repair_pending'
  | 'retry_requested'
  | 'bundle_refresh_requested'
  | 'repair_unavailable'
  | 'hidden_control_skipped'

type RelayRepairDecision = {
  action: RelayRepairAction
  kind: RelayRepairDecisionKind
  advanceCursor: boolean
  allowRelayCleanup: boolean
  shouldEmitUndecryptable: boolean
  repairRequested: boolean
  failureReason?: string
}

type OpenedRelayedMessage = RelayedMessage & {
  sealedEnvelopeNonce?: string
}

type RelayProcessOutcome = {
  relayedMsg: OpenedRelayedMessage
  decrypted?: DecryptedMessage
  authenticatedSenderBundle?: PublicKeyBundle
  advanceCursor: boolean
  quarantinedCount: number
  blockedCount: number
}

type RelayProcessingContext = {
  options: PendingMessageFetchOptions
  senderBundleCache: Map<string, PublicKeyBundle | null>
  inboundConversationCache: Map<string, Conversation>
  trackedSendersThisBatch: Set<string>
  scopeOfferSendersThisBatch: Set<string>
  fetchResult: PendingMessageFetchResult
  processedMessages: PendingMessageFetchResult['messages']
  firstOpenFailureSequence: number | null
  fetchStartedAt: number
}

type InboundDecryptionResult = {
  decrypted: DecryptedMessage
  session: Session
  sessionRecord?: SessionRecord
  privateKeyBundle?: {
    identityId: string
    bundle: PrivateKeyBundle
  }
  publicKeyBundle?: {
    identityId: string
    bundle: PublicKeyBundle
  }
  afterCommit?: () => Promise<void>
}

type VerifiedSenderBundlePin = {
  bundle: PublicKeyBundle
  revision: string
}

type CachedScopedMailboxToken = {
  publicMaterialRevision: string
  token: string
}

function throwIfPendingFetchCancelled(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('Pending message fetch cancelled')
  error.name = 'AbortError'
  throw error
}

function filterPrefetchedSealedRelayRows(
  rows: SealedRelayedMessage[] | undefined,
  afterSequence: number | undefined,
): SealedRelayedMessage[] {
  if (!rows || rows.length === 0) return []
  const minSequence = afterSequence ?? 0
  const nowMs = Date.now()
  return [...rows]
    .filter((row) =>
      row.deliveryClass === 'message'
      && Number.isSafeInteger(row.serverSequence)
      && row.serverSequence > minSequence
      && (!Number.isFinite(row.expiresAt) || row.expiresAt > nowMs)
    )
    .sort((a, b) => a.serverSequence - b.serverSequence)
}

const COOPERATIVE_YIELD_EVERY = 8
const COOPERATIVE_YIELD_INTERVAL_MS = 16

// Chat client

export type ProfileSyncResponseDisposition = 'applied' | 'rejected' | 'retry'

export class QuantumChat {
  private config: ChatConfig
  private securityConfig: SecurityConfig
  private identity: ChatIdentityWithKeys | null = null
  private privateBundle: PrivateKeyBundle | null = null
  private eventListeners: Map<string, Set<(event: ChatEvent) => void>> = new Map()
  private profileSyncResponseHandler: ((
    senderIdentityId: string,
    profile: unknown,
  ) => Promise<ProfileSyncResponseDisposition>) | null = null
  private cleanupInterval: ReturnType<typeof setInterval> | null = null
  private bundleServer: BundleServer | null = null
  private minOPKCount: number
  /** Tracked identities for TOFU (Trust on First Use) */
  private trackedIdentities: Map<string, TrackedIdentity> = new Map()
  private controlMessageFetchPromise: Promise<void> | null = null
  private lastControlMessageFetchAt = 0
  private lastMailboxScopeRefreshAt = 0
  private outboundStatusSyncPromise: Promise<void> | null = null
  private pendingForcedOutboundStatusSync = false
  private relayReceiptJobFlushPromise: Promise<void> | null = null
  private pendingRelayReceiptJobFlush = false
  private receiveMaintenanceTimer: ReturnType<typeof setTimeout> | null = null
  private receiveMaintenanceScheduledAt = 0
  private receiveMaintenancePromise: Promise<void> | null = null
  private pendingReceiveMaintenance = false
  private activeReceiveOperations = 0
  private relayReceiptRateLimitedUntil = new Map<RelayReceiptJobStatus, number>()
  private activeRelayReceiptIds: Set<string> = new Set()
  private lastOutboundStatusSyncAt = 0
  private pendingRelayDeletionIds: Set<string> = new Set()
  private relayDeletionAttempts: Map<string, number> = new Map()
  private inFlightRepairKeys: Set<string> = new Set()
  private inFlightMailboxScopeOffers: Set<string> = new Set()
  private relayDeliveryMutationQueues = new Map<string, Promise<void>>()
  private relayDeletionTimer: ReturnType<typeof setTimeout> | null = null
  private relayDeletionScheduledAt = 0
  private relayDeletionFlushPromise: Promise<void> | null = null
  private lastRelayCleanupDeferredAt = 0
  private lastRelayCleanupDeferredCount = 0
  private lastMailboxVacuumBeforeSequence = 0
  private lastMailboxVacuumAt = 0
  private lastOPKReplenishAt = 0
  private sealedEnvelopeReplayCache = new SealedEnvelopeReplayCache()
  private verifiedSenderBundlePins = new Map<string, VerifiedSenderBundlePin>()
  private scopedMailboxTokenCache = new Map<string, CachedScopedMailboxToken>()
  private scopedMailboxTokenGenerations = new Map<string, number>()
  private lastCooperativeYieldAt = 0
  private itemsSinceCooperativeYield = 0

  private constructor(config: ChatConfig) {
    this.config = config
    this.securityConfig = { ...DEFAULT_SECURITY_CONFIG, ...config.security }
    this.minOPKCount = config.minOPKCount ?? 20
    setSessionSecurityConfig(this.securityConfig)
  }

  /** Whether Tor transport is active (delegates to config callback) */
  isTorEnabled(): boolean {
    return this.config.isTorEnabled?.() ?? false
  }

  areReadReceiptsEnabled(): boolean {
    return this.getReceiptPolicy().readReceiptsEnabled
  }

  private getReceiptPolicy(): ReceiptPolicy {
    const policy = this.config.getReceiptPolicy?.()
    return {
      deliveryReceiptsEnabled: policy?.deliveryReceiptsEnabled ?? true,
      readReceiptsEnabled: policy?.readReceiptsEnabled ?? true,
    }
  }

  recordLatency(
    scope: string,
    name: string,
    elapsedMs: number,
    fields?: Record<string, string | number | boolean | null | undefined>,
  ): void {
    this.config.telemetry?.recordLatency(scope, name, elapsedMs, fields)
  }

  startSpan(
    scope: string,
    name: string,
    fields?: Record<string, string | number | boolean | null | undefined>,
  ): TelemetrySpan {
    return this.config.telemetry?.startSpan(scope, name, fields) ?? { end: () => {} }
  }

  recordDiagnostic(
    scope: string,
    name: string,
    fields?: Record<string, TelemetryFieldValue>,
  ): void {
    this.config.telemetry?.recordDiagnostic?.(scope, name, fields)
  }

  private resetCooperativeYieldClock(): void {
    this.lastCooperativeYieldAt = Date.now()
    this.itemsSinceCooperativeYield = 0
  }

  private async yieldToHost(
    stage: CooperativeYieldStage,
    processed: number,
    total: number,
    priority: 'realtime' | 'background' = 'realtime',
  ): Promise<void> {
    const progress = {
      processed,
      remaining: Math.max(0, total - processed),
      priority,
    }
    try {
      if (this.config.cooperativeScheduler) {
        await this.config.cooperativeScheduler.yieldToHost(stage, progress)
        return
      }
    } catch (error) {
      this.recordDiagnostic('performance', 'cooperative_yield_failed', {
        stage,
        processed,
        remaining: progress.remaining,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  private async maybeYieldToHost(
    stage: CooperativeYieldStage,
    processed: number,
    total: number,
    priority: 'realtime' | 'background' = 'realtime',
  ): Promise<void> {
    this.itemsSinceCooperativeYield += 1
    const elapsed = Date.now() - this.lastCooperativeYieldAt
    const dueByCount = this.itemsSinceCooperativeYield >= COOPERATIVE_YIELD_EVERY
    const dueByTime = this.lastCooperativeYieldAt > 0 && elapsed >= COOPERATIVE_YIELD_INTERVAL_MS
    if (!dueByCount && !dueByTime) return
    this.itemsSinceCooperativeYield = 0
    this.lastCooperativeYieldAt = Date.now()
    await this.yieldToHost(stage, processed, total, priority)
  }

  private getErrorDiagnosticFields(error: unknown): Record<string, TelemetryFieldValue> {
    const message = error instanceof Error ? error.message : String(error)
    if (error instanceof BundleServerRequestError) {
      return {
        error: message,
        failureReason: error.reason,
        statusCode: error.statusCode,
        transient: error.transient,
        retryAfterMs: error.retryAfterMs,
      }
    }

    return { error: message }
  }

  private getRelayDiagnosticFields(
    relayedMsg: Pick<RelayedMessage, 'id' | 'conversationId' | 'senderIdentityId' | 'serverSequence'>,
  ): Record<string, TelemetryFieldValue> {
    return {
      relayId: relayedMsg.id,
      conversationId: relayedMsg.conversationId,
      senderIdentityId: relayedMsg.senderIdentityId,
      serverSequence: relayedMsg.serverSequence,
    }
  }

  private async prepareSenderBundleForDecrypt(relayedMsg: RelayedMessage): Promise<PublicKeyBundle | null> {
    const cachedPin = this.verifiedSenderBundlePins.get(relayedMsg.senderIdentityId)
    if (relayedMsg.senderBundle) {
      if (relayedMsg.senderBundle.identityId !== relayedMsg.senderIdentityId) {
        throw new ChatError('Relay sender bundle identity mismatch', 'INVALID_RELAY_ENVELOPE')
      }
      const verification = await verifyPublicKeyBundleAsync(relayedMsg.senderBundle)
      if (!verification.valid) {
        throw new ChatError(`Invalid relay sender bundle: ${verification.error}`, 'INVALID_RELAY_ENVELOPE')
      }
      if (relayedMsg.senderBundle.walletAuthorization) {
        const walletVerification = await verifyPublicKeyBundleWalletAuthorizationAsync(relayedMsg.senderBundle)
        if (!walletVerification.valid) {
          throw new ChatError(
            `Invalid relay sender wallet authorization: ${walletVerification.error}`,
            'INVALID_RELAY_ENVELOPE',
          )
        }
      }
      const pinnedBundle = cachedPin?.bundle
        ?? await localChatStorage.getPublicKeyBundle(relayedMsg.senderIdentityId)
      if (pinnedBundle && (
        pinnedBundle.identityKey !== relayedMsg.senderBundle.identityKey ||
        pinnedBundle.mlkemIdentityKey !== relayedMsg.senderBundle.mlkemIdentityKey ||
        pinnedBundle.dilithiumKey !== relayedMsg.senderBundle.dilithiumKey
      )) {
        throw new ChatError('Relay sender bundle does not match stored identity keys', 'KEY_MISMATCH')
      }
      const revision = JSON.stringify(relayedMsg.senderBundle)
      if (cachedPin?.revision !== revision) {
        this.verifiedSenderBundlePins.set(relayedMsg.senderIdentityId, {
          bundle: relayedMsg.senderBundle,
          revision,
        })
      }
      this.recordDiagnostic('receive', 'sender_bundle_prepared_from_relay', {
        ...this.getRelayDiagnosticFields(relayedMsg),
        cacheHit: cachedPin?.revision === revision,
      })
      return relayedMsg.senderBundle
    }

    if (cachedPin) {
      return cachedPin.bundle
    }
    const existingBundle = await localChatStorage.getPublicKeyBundle(relayedMsg.senderIdentityId)
    if (existingBundle) {
      this.verifiedSenderBundlePins.set(relayedMsg.senderIdentityId, {
        bundle: existingBundle,
        revision: JSON.stringify(existingBundle),
      })
      return existingBundle
    }

    return null
  }

  private async trackSenderAfterDecrypt(
    senderIdentityId: string,
    authenticatedBundle?: PublicKeyBundle | null,
  ): Promise<void> {
    const senderBundle = authenticatedBundle
      ?? await localChatStorage.getPublicKeyBundle(senderIdentityId)
    if (!senderBundle) {
      return
    }

    const storedBundle = await localChatStorage.getPublicKeyBundle(senderIdentityId)
    if (!storedBundle || JSON.stringify(storedBundle) !== JSON.stringify(senderBundle)) {
      await storeContactBundle(senderBundle)
    }
    if (this.trackedIdentities.has(senderIdentityId)) {
      return
    }

    const tracked = createTrackedIdentityFromBundle(senderBundle)
    this.trackedIdentities.set(senderIdentityId, tracked)
    await localChatStorage.storeTrackedIdentity(tracked)

    this.emit('contact:added', {
      identityId: senderIdentityId,
      isAutoAdded: true
    })
  }

  private async openSealedRelayMessage(sealed: SealedRelayedMessage): Promise<OpenedRelayedMessage> {
    if (!this.identity) {
      throw new ChatError('Identity not initialized', 'NOT_INITIALIZED')
    }
    if (sealed.sealedEnvelope.type !== 'message') {
      throw new ChatError('Expected sealed relay message envelope', 'INVALID_RELAY_ENVELOPE')
    }

    const payload = await openRelayEnvelope({
      recipient: this.identity,
      recipientMailboxToken: sealed.recipientMailboxToken,
      envelope: sealed.sealedEnvelope,
    })
    this.sealedEnvelopeReplayCache.check(payload.envelopeNonce)

    if (payload.senderBundle) {
      const credential = payload.senderCredential
      const bundle = payload.senderBundle
      if (
        credential.senderIdentityId !== bundle.identityId ||
        credential.identityPublicKey !== bundle.identityKey ||
        credential.mlkemPublicKey !== bundle.mlkemIdentityKey ||
        credential.dilithiumPublicKey !== bundle.dilithiumKey
      ) {
        throw new ChatError('Sealed sender credential does not match sender bundle', 'INVALID_RELAY_ENVELOPE')
      }
    }

    return {
      id: sealed.id,
      senderIdentityId: payload.senderCredential.senderIdentityId,
      recipientIdentityId: this.identity.id,
      conversationId: payload.threadToken,
      messageKind: payload.messageKind,
      encryptedData: payload.encryptedMessage,
      senderBundle: payload.senderBundle,
      status: sealed.status,
      serverSequence: sealed.serverSequence,
      createdAt: sealed.createdAt,
      deliveredAt: sealed.deliveredAt,
      expiresAt: sealed.expiresAt,
      sealedEnvelopeNonce: payload.envelopeNonce,
    }
  }

  private acceptSealedRelayReplayNonce(relayedMsg: OpenedRelayedMessage): void {
    if (relayedMsg.sealedEnvelopeNonce) {
      this.sealedEnvelopeReplayCache.accept(relayedMsg.sealedEnvelopeNonce)
    }
  }

  private hasAuthenticatedServerAccess(): boolean {
    if (this.config.server?.type !== 'backend') return true
    if (this.config.server.accessToken) return true
    if (this.config.server.tokenGetter?.()) return true
    return false
  }

  public setServerAccessToken(token: string | null): void {
    if (this.config.server?.type === 'backend') {
      this.config.server.accessToken = token
    }

    const authAwareBundleServer = this.bundleServer as (BundleServer & {
      setAccessToken?: (value: string | null) => void
    }) | null
    authAwareBundleServer?.setAccessToken?.(token)
  }

  public setServerTokenGetter(getter: (() => string | null) | null): void {
    if (this.config.server?.type === 'backend') {
      this.config.server.tokenGetter = getter ?? undefined
    }

    const authAwareBundleServer = this.bundleServer as (BundleServer & {
      setTokenGetter?: (g: (() => string | null) | null) => void
    }) | null
    authAwareBundleServer?.setTokenGetter?.(getter)
  }

  public setBundleServer(bundleServer: BundleServer | null): void {
    this.bundleServer = bundleServer
    if (this.config.server?.type !== 'backend') return
    const authAwareBundleServer = this.bundleServer as (BundleServer & {
      setAccessToken?: (value: string | null) => void
      setTokenGetter?: (g: (() => string | null) | null) => void
    }) | null
    authAwareBundleServer?.setAccessToken?.(this.config.server.accessToken ?? null)
    authAwareBundleServer?.setTokenGetter?.(this.config.server.tokenGetter ?? null)
  }

  private matchesTerminalMessageError(error: unknown): boolean {
    const errMsg = error instanceof Error ? error.message : String(error)
    return TERMINAL_MESSAGE_ERROR_MARKERS.some(marker => errMsg.includes(marker))
  }

  /**
   * Sign a control message with ML-DSA-65.
   */
  private async signControlMessage(message: Omit<ControlMessage, 'signature'>): Promise<ControlMessage> {
    if (!this.identity) {
      throw new ChatError('Identity not initialized', 'NOT_INITIALIZED')
    }

    // Create a canonical representation of the message for signing
    const messageData = concatBytes(
      stringToBytes(message.type),
      stringToBytes(message.referenceMessageId || ''),
      stringToBytes(message.referenceIdentityId || ''),
      stringToBytes(message.timestamp.toString()),
      stringToBytes(canonicalJsonStringify(message.data || {}))
    )

    const signature = await signWithDilithiumAsync(messageData, this.identity.dilithiumPrivateKey)

    return {
      ...message,
      signature
    }
  }

  /**
   * Verify a control message signature
   */
  private async verifyControlMessage(message: ControlMessage, senderDilithiumKey: string): Promise<boolean> {
    const messageData = concatBytes(
      stringToBytes(message.type),
      stringToBytes(message.referenceMessageId || ''),
      stringToBytes(message.referenceIdentityId || ''),
      stringToBytes(message.timestamp.toString()),
      stringToBytes(canonicalJsonStringify(message.data || {}))
    )

    return verifyDilithiumSignatureAsync(messageData, message.signature, senderDilithiumKey)
  }

  private getControlMessageReplayId(message: ControlMessage): string {
    const signedShape = canonicalJsonStringify({
      type: message.type,
      referenceMessageId: message.referenceMessageId || '',
      referenceIdentityId: message.referenceIdentityId || '',
      timestamp: message.timestamp,
      data: message.data || {},
      signature: message.signature
    })
    return `control:${bytesToBase64(hash(stringToBytes(signedShape)))}`
  }

  private validateControlMessageFreshness(message: ControlMessage): void {
    if (!Number.isFinite(message.timestamp)) {
      throw new ChatError('Control message timestamp is invalid', 'INVALID_CONTROL_MESSAGE')
    }
    const currentTime = now()
    if (message.timestamp > currentTime + this.securityConfig.timestampTolerance) {
      throw new ChatError('Control message timestamp is too far in the future', 'INVALID_CONTROL_MESSAGE')
    }
    if (message.timestamp < currentTime - this.securityConfig.processedMessageRetention) {
      throw new ChatError('Control message is older than the supported replay window', 'INVALID_CONTROL_MESSAGE')
    }
  }

  private assertBundleMatchesKnownIdentity(bundle: PublicKeyBundle, identityId: string): void {
    if (bundle.identityId !== identityId) {
      throw new ChatError('Control bundle identity mismatch', 'INVALID_BUNDLE')
    }
    const tracked = this.trackedIdentities.get(identityId)
    if (tracked && (
      tracked.currentIdentityKey !== bundle.identityKey ||
      tracked.currentDilithiumKey !== bundle.dilithiumKey ||
      tracked.currentMlkemKey !== bundle.mlkemIdentityKey
    )) {
      throw new ChatError('Control bundle does not match tracked identity keys', 'KEY_MISMATCH')
    }
  }

  private async storeControlBundleForIdentity(bundle: PublicKeyBundle, identityId: string): Promise<void> {
    this.assertBundleMatchesKnownIdentity(bundle, identityId)
    const existingBundle = await localChatStorage.getPublicKeyBundle(identityId)
    if (existingBundle && (
      existingBundle.identityKey !== bundle.identityKey ||
      existingBundle.mlkemIdentityKey !== bundle.mlkemIdentityKey ||
      existingBundle.dilithiumKey !== bundle.dilithiumKey
    )) {
      throw new ChatError('Control bundle does not match stored identity keys', 'KEY_MISMATCH')
    }
    await storeContactBundle(bundle)
    this.verifiedSenderBundlePins.set(identityId, {
      bundle,
      revision: JSON.stringify(bundle),
    })
  }

  private async sendControlMessageToRecipient(recipientIdentityId: string, controlMessage: ControlMessage): Promise<void> {
    if (!this.identity || !this.bundleServer) {
      throw new ChatError('Client not initialized', 'NOT_INITIALIZED')
    }

    const sealedSend = (this.bundleServer as {
      sendSealedControlMessage?: (record: OutboundSealedControlRecord) => Promise<void>
    }).sendSealedControlMessage

    if (!sealedSend) {
      throw new ChatError('Sealed control relay is required', 'RELAY_UNAVAILABLE')
    }

    const recipientBundle = await localChatStorage.getPublicKeyBundle(recipientIdentityId)
    if (!recipientBundle) {
      throw new ChatError('Recipient bundle required for sealed control message', 'CONTACT_NOT_FOUND')
    }

      await sealedSend.call(
      this.bundleServer,
      await sealControlEnvelope({
        sender: this.identity,
        recipient: recipientBundle,
        controlMessage,
      }),
    )
  }

  private scheduleMailboxScopeRefresh(): void {
    if (!this.identity || !this.bundleServer) return
    const elapsedMs = now() - this.lastMailboxScopeRefreshAt
    if (this.lastMailboxScopeRefreshAt > 0 && elapsedMs < MAILBOX_SCOPE_REGISTRATION_REFRESH_MS) {
      return
    }
    this.lastMailboxScopeRefreshAt = now()
    void ensureInboundMailboxScopes({
      identity: this.identity,
      storage: localChatStorage,
      localScopeMode: 'all',
      registerScope: (scope) => this.registerMailboxScope(scope),
      registrationUrgency: 'refresh',
      nowMs: now,
    }).catch(() => undefined)
  }

  private async registerMailboxScope(scope: MailboxScopeState): Promise<MailboxScopeState> {
    if (!this.identity || !this.bundleServer) {
      throw new ChatError('Client not initialized', 'NOT_INITIALIZED')
    }
    const registerScope = (this.bundleServer as {
      registerMailboxScope?: (mailboxToken: string) => Promise<void>
    }).registerMailboxScope
    if (!registerScope) {
      throw new ChatError('Scoped mailbox registration unavailable', 'RELAY_UNAVAILABLE')
    }
    const mailboxToken = deriveScopedRecipientMailboxToken({
      recipient: {
        id: this.identity.id,
        identityPublicKey: this.identity.identityPublicKey,
        mlkemPublicKey: this.identity.mlkemPublicKey,
        dilithiumPublicKey: this.identity.dilithiumPublicKey,
      },
      scopeSecret: scope.scopeSecret,
      scopeId: scope.scopeId,
      epoch: scope.epoch,
    })
    await registerScope.call(this.bundleServer, mailboxToken)
    const registeredScope = {
      ...scope,
      registeredAt: now(),
      registrationVersion: MAILBOX_SCOPE_REGISTRATION_VERSION,
      updatedAt: now(),
    }
    await this.storeMailboxScope(registeredScope)
    this.emit('mailbox_scope:registered', {
      remoteIdentityId: scope.remoteIdentityId,
      scopeId: scope.scopeId,
      epoch: scope.epoch,
    })
    return registeredScope
  }

  private async maybeOfferMailboxScope(remoteIdentityId: string, remoteBundle?: PublicKeyBundle): Promise<void> {
    if (!this.identity || !this.bundleServer?.isAvailable()) return
    const offerKey = `${this.identity.id}:${remoteIdentityId}`
    if (this.inFlightMailboxScopeOffers.has(offerKey)) return
    this.inFlightMailboxScopeOffers.add(offerKey)

    try {
      const bundle = remoteBundle ?? await localChatStorage.getPublicKeyBundle(remoteIdentityId)
      if (!await bundleSupportsScopedMailboxAsync(bundle)) return

      const existing = await localChatStorage.getMailboxScope(this.identity.id, remoteIdentityId)
      if (
        existing?.status === 'active'
        && existing.registeredAt
        && existing.acknowledgedAt
      ) {
        return
      }
      if (existing?.status === 'pending' && existing.registeredAt) {
        return
      }

      const timestamp = now()
      const scope: MailboxScopeState = {
        localIdentityId: this.identity.id,
        remoteIdentityId,
        scopeId: generateUUID(),
        scopeSecret: bytesToBase64(generateRandomBytes(32)),
        epoch: 0,
        status: 'pending',
        initiatedByLocal: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await this.storeMailboxScope(scope)
      let registeredScope: MailboxScopeState
      try {
        registeredScope = await this.registerMailboxScope(scope)
      } catch (error) {
        this.recordDiagnostic('control', 'mailbox_scope_registration_failed', {
          remoteIdentityId,
          scopeId: scope.scopeId,
          direction: 'offer',
          ...this.getErrorDiagnosticFields(error),
        })
        return
      }

      try {
        await this.sendControlMessageToRecipient(remoteIdentityId, await this.signControlMessage({
          type: 'mailbox_scope_offer',
          referenceIdentityId: this.identity.id,
          timestamp,
          data: {
            scopeId: registeredScope.scopeId,
            scopeSecret: registeredScope.scopeSecret,
            epoch: registeredScope.epoch,
          },
        }))
      } catch (error) {
        this.recordDiagnostic('control', 'mailbox_scope_offer_send_failed', {
          remoteIdentityId,
          scopeId: registeredScope.scopeId,
          ...this.getErrorDiagnosticFields(error),
        })
      }
    } finally {
      this.inFlightMailboxScopeOffers.delete(offerKey)
    }
  }

  private async acceptMailboxScopeOffer(ctrlMsg: ControlMessage): Promise<void> {
    if (!this.identity || !ctrlMsg.referenceIdentityId) return
    const scopeId = typeof ctrlMsg.data?.scopeId === 'string' ? ctrlMsg.data.scopeId : null
    const scopeSecret = typeof ctrlMsg.data?.scopeSecret === 'string' ? ctrlMsg.data.scopeSecret : null
    const epoch = typeof ctrlMsg.data?.epoch === 'number' ? ctrlMsg.data.epoch : 0
    if (!scopeId || !scopeSecret || !Number.isInteger(epoch) || epoch < 0) {
      throw new ChatError('Invalid mailbox scope offer', 'INVALID_CONTROL_MESSAGE')
    }
    const timestamp = now()
    const pendingScope: MailboxScopeState = {
      localIdentityId: this.identity.id,
      remoteIdentityId: ctrlMsg.referenceIdentityId,
      scopeId,
      scopeSecret,
      epoch,
      status: 'pending',
      initiatedByLocal: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.storeMailboxScope(pendingScope)

    let activeScope: MailboxScopeState
    try {
      activeScope = await this.registerMailboxScope({
        ...pendingScope,
        status: 'active',
        acknowledgedAt: timestamp,
      })
    } catch (error) {
      this.recordDiagnostic('control', 'mailbox_scope_registration_failed', {
        remoteIdentityId: ctrlMsg.referenceIdentityId,
        scopeId,
        direction: 'accept',
        ...this.getErrorDiagnosticFields(error),
      })
      return
    }

    await this.sendControlMessageToRecipient(ctrlMsg.referenceIdentityId, await this.signControlMessage({
      type: 'mailbox_scope_ack',
      referenceIdentityId: this.identity.id,
      timestamp,
      data: { scopeId: activeScope.scopeId, epoch: activeScope.epoch },
    }))
  }

  private async markMailboxScopeAcknowledged(ctrlMsg: ControlMessage): Promise<void> {
    if (!this.identity || !ctrlMsg.referenceIdentityId) return
    const scopeId = typeof ctrlMsg.data?.scopeId === 'string' ? ctrlMsg.data.scopeId : null
    if (!scopeId) return
    const scope = await localChatStorage.getMailboxScope(this.identity.id, ctrlMsg.referenceIdentityId)
    if (!scope || scope.scopeId !== scopeId) return
    let registeredScope = scope
    if (!registeredScope.registeredAt) {
      try {
        registeredScope = await this.registerMailboxScope(registeredScope)
      } catch (error) {
        this.recordDiagnostic('control', 'mailbox_scope_registration_failed', {
          remoteIdentityId: ctrlMsg.referenceIdentityId,
          scopeId,
          direction: 'ack',
          ...this.getErrorDiagnosticFields(error),
        })
        return
      }
    }
    await this.storeMailboxScope({
      ...registeredScope,
      status: 'active',
      acknowledgedAt: now(),
      updatedAt: now(),
    })
  }

  private invalidateScopedMailboxToken(remoteIdentityId: string): void {
    this.scopedMailboxTokenCache.delete(remoteIdentityId)
    this.scopedMailboxTokenGenerations.set(
      remoteIdentityId,
      (this.scopedMailboxTokenGenerations.get(remoteIdentityId) ?? 0) + 1,
    )
  }

  private async storeMailboxScope(scope: MailboxScopeState): Promise<void> {
    this.invalidateScopedMailboxToken(scope.remoteIdentityId)
    try {
      await localChatStorage.storeMailboxScope(scope)
    } finally {
      this.invalidateScopedMailboxToken(scope.remoteIdentityId)
    }
  }

  public async getScopedMailboxTokenForRecipient(recipientBundle: PublicKeyBundle): Promise<string | undefined> {
    if (!this.identity || !await bundleSupportsScopedMailboxAsync(recipientBundle)) return undefined
    const remoteIdentityId = recipientBundle.identityId
    const publicMaterialRevision = JSON.stringify([
      this.identity.id,
      remoteIdentityId,
      recipientBundle.identityKey,
      recipientBundle.mlkemIdentityKey,
      recipientBundle.dilithiumKey,
    ])
    const cached = this.scopedMailboxTokenCache.get(remoteIdentityId)
    if (cached?.publicMaterialRevision === publicMaterialRevision) {
      return cached.token
    }

    const generation = this.scopedMailboxTokenGenerations.get(remoteIdentityId) ?? 0
    const scope = await localChatStorage.getMailboxScope(this.identity.id, recipientBundle.identityId)
    const token = scope?.status === 'active' && scope.registeredAt && scope.acknowledgedAt
      ? deriveScopedRecipientMailboxToken({
          recipient: recipientBundle,
          scopeSecret: scope.scopeSecret,
          scopeId: scope.scopeId,
          epoch: scope.epoch,
        })
      : undefined
    if (
      token
      && (this.scopedMailboxTokenGenerations.get(remoteIdentityId) ?? 0) === generation
    ) {
      this.scopedMailboxTokenCache.set(remoteIdentityId, {
        publicMaterialRevision,
        token,
      })
    }
    return token
  }

  private async prepareProfileSyncRequestBundle(message: ControlMessage): Promise<PublicKeyBundle | undefined> {
    if (message.type !== 'profile_sync_request' || !message.referenceIdentityId) return undefined
    const candidate = message.data?.bundle
    if (candidate === undefined) return undefined
    const bundle = candidate as PublicKeyBundle
    if (bundle.identityId !== message.referenceIdentityId) {
      throw new ChatError('Profile request bundle identity mismatch', 'INVALID_BUNDLE')
    }
    const bundleVerification = await verifyPublicKeyBundleAsync(bundle)
    if (!bundleVerification.valid) {
      throw new ChatError('Profile request bundle is invalid', 'INVALID_BUNDLE')
    }
    const walletVerification = await verifyPublicKeyBundleWalletAuthorizationAsync(bundle)
    if (!walletVerification.valid) {
      throw new ChatError('Profile request wallet authorization is invalid', 'INVALID_BUNDLE')
    }
    return bundle
  }

  private async getControlMessageVerificationKey(
    message: ControlMessage,
    attachedBundle?: PublicKeyBundle,
  ): Promise<string | null> {
    if (!message.referenceIdentityId) {
      return null
    }
    if (attachedBundle?.identityId === message.referenceIdentityId) {
      return attachedBundle.dilithiumKey
    }

    const storedBundle = await localChatStorage.getPublicKeyBundle(message.referenceIdentityId)
    return storedBundle?.dilithiumKey || null
  }

  private getOutboundStatusSyncIntervalMs(): number {
    return this.isTorEnabled()
      ? TOR_OUTBOUND_STATUS_SYNC_INTERVAL_MS
      : OUTBOUND_STATUS_SYNC_INTERVAL_MS
  }

  private getControlMessagePollIntervalMs(): number {
    return this.isTorEnabled()
      ? TOR_CONTROL_MESSAGE_POLL_INTERVAL_MS
      : CONTROL_MESSAGE_POLL_INTERVAL_MS
  }

  private getRelayDeletionRetryDelayMs(attempt: number): number {
    const retryIndex = Math.min(attempt, RELAY_MESSAGE_DELETE_RETRY_DELAYS_MS.length - 1)
    return RELAY_MESSAGE_DELETE_RETRY_DELAYS_MS[retryIndex]
  }

  private getRetryRequestKey(messageId: string, senderIdentityId: string): string {
    return `${senderIdentityId}:${messageId}`
  }

  private getRetryRequestBackoffDelayMs(attemptCount: number): number {
    if (attemptCount <= 0) return 0
    const retryIndex = Math.min(attemptCount - 1, RETRY_REQUEST_BACKOFF_DELAYS_MS.length - 1)
    return RETRY_REQUEST_BACKOFF_DELAYS_MS[retryIndex]
  }

  private createHiddenControlSkipDecision(action: RelayRepairAction): RelayRepairDecision {
    return {
      action,
      kind: 'hidden_control_skipped',
      advanceCursor: true,
      allowRelayCleanup: true,
      shouldEmitUndecryptable: false,
      repairRequested: false,
    }
  }

  private shouldPromoteFallbackSession(
    decrypted: Pick<DecryptedMessage, 'sequenceNumber'>,
    conversation: Pick<Conversation, 'expectedSequenceNumber'> | null,
  ): { shouldPromote: boolean; reason: string } {
    if (!conversation) {
      return { shouldPromote: true, reason: 'no_conversation_state' }
    }

    if (decrypted.sequenceNumber === undefined) {
      return { shouldPromote: true, reason: 'no_sequence_number' }
    }

    if (decrypted.sequenceNumber >= conversation.expectedSequenceNumber) {
      return { shouldPromote: true, reason: 'sequence_at_or_ahead_of_expected' }
    }

    return {
      shouldPromote: false,
      reason: 'sequence_older_than_expected',
    }
  }

  private async resolveRetryRequestRecordByKey(
    key: string,
    resolution: RetryRequestResolution,
    relayMessageId?: string,
  ): Promise<void> {
    const existing = await localChatStorage.getRetryRequestRecord(key)
    if (!existing) {
      return
    }

    const resolvedAt = now()
    await localChatStorage.storeRetryRequestRecord({
      ...existing,
      relayMessageId: relayMessageId ?? existing.relayMessageId,
      lastSeenAt: resolvedAt,
      status: 'resolved',
      resolution,
      resolvedAt,
    })
  }

  private async resolveRetryRequestRecord(
    messageId: string | undefined,
    senderIdentityId: string,
    resolution: RetryRequestResolution,
    relayMessageId?: string,
  ): Promise<void> {
    if (!messageId) {
      return
    }

    await this.resolveRetryRequestRecordByKey(
      this.getRetryRequestKey(messageId, senderIdentityId),
      resolution,
      relayMessageId,
    )
  }

  private async resolveRetryRequestRecordByRelayId(
    relayMessageId: string,
    resolution: RetryRequestResolution,
  ): Promise<void> {
    const existing = await localChatStorage.getRetryRequestRecordByRelayId(relayMessageId)
    if (!existing) {
      return
    }

    const resolvedAt = now()
    await localChatStorage.storeRetryRequestRecord({
      ...existing,
      relayMessageId,
      lastSeenAt: resolvedAt,
      status: 'resolved',
      resolution,
      resolvedAt,
    })
  }

  private getRepairOutcomeForAction(action: RelayRepairAction): RelayRepairOutcome {
    return action === 'bundle_refresh'
      ? 'bundle_refresh_requested'
      : 'retry_requested'
  }

  private describeRepairSendFailure(result: Extract<RepairSendResult, { ok: false }>): string {
    return `${result.reason}: ${result.message}`
  }

  private async getPendingRelayRepairDecision(
    relayedMsg: RelayedMessage,
  ): Promise<RelayRepairDecision | null> {
    const record = await localChatStorage.getRetryRequestRecordByRelayId(relayedMsg.id)
    if (!record) {
      return null
    }

    const seenAt = now()
    const isFreshResolvedRecord = Boolean(
      record.status === 'resolved'
      && record.resolvedAt
      && seenAt - record.resolvedAt < RETRY_REQUEST_RECORD_RETENTION_MS
    )

    if (isFreshResolvedRecord) {
      await localChatStorage.storeRetryRequestRecord({
        ...record,
        lastSeenAt: seenAt,
        serverSequence: relayedMsg.serverSequence || record.serverSequence,
      })
      this.recordDiagnostic('repair', 'relay_repair_resolved', {
        ...this.getRelayDiagnosticFields(relayedMsg),
        messageId: record.messageId,
        repairAction: record.repairAction ?? 'message_retry',
        resolution: record.resolution,
      })
      return {
        action: record.repairAction ?? 'message_retry',
        kind: 'resolved',
        advanceCursor: true,
        allowRelayCleanup: true,
        shouldEmitUndecryptable: false,
        repairRequested: false,
      }
    }

    if (record.status !== 'pending') {
      return null
    }

    const backoffDelayMs = this.getRetryRequestBackoffDelayMs(record.attemptCount)
    if (seenAt - record.lastAttemptAt >= backoffDelayMs) {
      return null
    }

    await localChatStorage.storeRetryRequestRecord({
      ...record,
      lastSeenAt: seenAt,
      serverSequence: relayedMsg.serverSequence || record.serverSequence,
    })

    const hasRepairInFlight = Boolean(record.lastRequestedAt)
    this.recordDiagnostic('repair', 'relay_repair_pending', {
      ...this.getRelayDiagnosticFields(relayedMsg),
      messageId: record.messageId,
      repairAction: record.repairAction ?? 'message_retry',
      attemptCount: record.attemptCount,
      backoffDelayMs,
      repairRequested: hasRepairInFlight,
      failureReason: hasRepairInFlight ? undefined : record.lastFailureReason,
    })
    return {
      action: record.repairAction ?? 'message_retry',
      kind: hasRepairInFlight ? 'repair_pending' : 'repair_unavailable',
      advanceCursor: true,
      allowRelayCleanup: hasRepairInFlight,
      shouldEmitUndecryptable: false,
      repairRequested: false,
      failureReason: hasRepairInFlight ? undefined : record.lastFailureReason,
    }
  }

  private async attemptRelayRepair(
    action: RelayRepairAction,
    messageId: string,
    senderIdentityId: string,
    relayMessageId: string,
    serverSequence?: number,
  ): Promise<RelayRepairDecision> {
    const retryKey = this.getRetryRequestKey(messageId, senderIdentityId)
    if (this.inFlightRepairKeys.has(retryKey)) {
      this.recordDiagnostic('repair', 'relay_repair_in_flight', {
        relayId: relayMessageId,
        messageId,
        senderIdentityId,
        serverSequence,
        repairAction: action,
      })
      return {
        action,
        kind: 'repair_pending',
        advanceCursor: false,
        allowRelayCleanup: false,
        shouldEmitUndecryptable: false,
        repairRequested: false,
      }
    }

    this.inFlightRepairKeys.add(retryKey)
    try {
      const seenAt = now()
      const existing = await localChatStorage.getRetryRequestRecord(retryKey)
      this.recordDiagnostic('repair', 'relay_repair_attempt', {
        relayId: relayMessageId,
        messageId,
        senderIdentityId,
        serverSequence,
        repairAction: action,
        previousAttemptCount: existing?.attemptCount ?? 0,
      })
      const isFreshResolvedRecord = Boolean(
        existing?.status === 'resolved'
        && existing.resolvedAt
        && seenAt - existing.resolvedAt < RETRY_REQUEST_RECORD_RETENTION_MS
      )

      if (existing && isFreshResolvedRecord) {
        await localChatStorage.storeRetryRequestRecord({
          ...existing,
          relayMessageId,
          lastSeenAt: seenAt,
          serverSequence: serverSequence ?? existing.serverSequence,
        })
        return {
          action: existing.repairAction ?? action,
          kind: 'resolved',
          advanceCursor: true,
          allowRelayCleanup: true,
          shouldEmitUndecryptable: false,
          repairRequested: false,
        }
      }

      const pendingRecord = existing?.status === 'pending' ? existing : null
      if (pendingRecord) {
        const backoffDelayMs = this.getRetryRequestBackoffDelayMs(pendingRecord.attemptCount)
        if (seenAt - pendingRecord.lastAttemptAt < backoffDelayMs) {
          await localChatStorage.storeRetryRequestRecord({
            ...pendingRecord,
            relayMessageId,
            lastSeenAt: seenAt,
            serverSequence: serverSequence ?? pendingRecord.serverSequence,
          })
          const hasRepairInFlight = Boolean(pendingRecord.lastRequestedAt)
          return {
            action: pendingRecord.repairAction ?? action,
            kind: hasRepairInFlight ? 'repair_pending' : 'repair_unavailable',
            advanceCursor: true,
            allowRelayCleanup: hasRepairInFlight,
            shouldEmitUndecryptable: false,
            repairRequested: false,
            failureReason: hasRepairInFlight ? undefined : pendingRecord.lastFailureReason,
          }
        }
      }

      const sendResult = action === 'bundle_refresh'
        ? await this.requestBundleRefresh(senderIdentityId)
        : await this.requestMessageRetry(messageId, senderIdentityId)

      const lastRequestedAt = sendResult.ok
        ? seenAt
        : pendingRecord?.lastRequestedAt
      const hasRepairInFlight = Boolean(lastRequestedAt)
      const lastFailureReason = sendResult.ok
        ? undefined
        : this.describeRepairSendFailure(sendResult)
      const record: RetryRequestRecord = {
        key: retryKey,
        messageId,
        senderIdentityId,
        relayMessageId,
        attemptCount: pendingRecord ? pendingRecord.attemptCount + 1 : 1,
        lastSeenAt: seenAt,
        lastAttemptAt: seenAt,
        lastRequestedAt,
        repairAction: action,
        lastOutcome: sendResult.ok ? this.getRepairOutcomeForAction(action) : 'repair_unavailable',
        serverSequence,
        lastFailureReason,
        status: 'pending',
      }
      await localChatStorage.storeRetryRequestRecord(record)

      this.recordDiagnostic('repair', 'relay_repair_outcome', {
        relayId: relayMessageId,
        messageId,
        senderIdentityId,
        serverSequence,
        repairAction: action,
        attemptCount: record.attemptCount,
        outcome: sendResult.ok ? record.lastOutcome : 'repair_unavailable',
        advanceCursor: true,
        allowRelayCleanup: hasRepairInFlight,
        failureReason: lastFailureReason,
      })

      return {
        action,
        kind: sendResult.ok
          ? action === 'bundle_refresh'
            ? 'bundle_refresh_requested'
            : 'retry_requested'
          : hasRepairInFlight
            ? 'repair_pending'
            : 'repair_unavailable',
        advanceCursor: true,
        allowRelayCleanup: hasRepairInFlight,
        shouldEmitUndecryptable: true,
        repairRequested: sendResult.ok,
        failureReason: lastFailureReason,
      }
    } finally {
      this.inFlightRepairKeys.delete(retryKey)
    }
  }

  private clearRelayDeletionTimer(): void {
    if (this.relayDeletionTimer) {
      clearTimeout(this.relayDeletionTimer)
      this.relayDeletionTimer = null
    }
    this.relayDeletionScheduledAt = 0
  }

  private ensureRelayDeletionScheduled(delayMs: number): void {
    const safeDelayMs = Math.max(0, delayMs)
    const scheduledAt = Date.now() + safeDelayMs

    if (this.relayDeletionTimer && this.relayDeletionScheduledAt <= scheduledAt) {
      return
    }

    this.clearRelayDeletionTimer()
    this.relayDeletionScheduledAt = scheduledAt
    this.relayDeletionTimer = setTimeout(() => {
      this.clearRelayDeletionTimer()
      void this.flushPendingRelayDeletions()
    }, safeDelayMs)
  }

  scheduleRelayDeletion(
    relayMessageId: string,
    delayMs: number = RELAY_MESSAGE_DELETE_INITIAL_DELAY_MS
  ): void {
    this.pendingRelayDeletionIds.add(relayMessageId)
    if (!this.relayDeletionAttempts.has(relayMessageId)) {
      this.relayDeletionAttempts.set(relayMessageId, 0)
    }
    this.ensureRelayDeletionScheduled(delayMs)
  }

  private async acknowledgeAuthenticatedMessageRelay(
    relayMessageId: string,
    localStatus?: string | null,
  ): Promise<void> {
    try {
      await this.enqueueRelayReceiptJob(relayMessageId, 'delivered')
      if (localStatus === 'read') {
        await this.enqueueRelayReceiptJob(relayMessageId, 'read')
      }
    } catch (error) {
      this.recordDiagnostic('receive', 'relay_ack_before_cleanup_failed', {
        relayId: relayMessageId,
        ...this.getErrorDiagnosticFields(error),
      })
    }
  }

  private mailboxVacuumStatuses(): Array<'delivered' | 'read'> {
    return this.getReceiptPolicy().readReceiptsEnabled ? ['read'] : ['delivered', 'read']
  }

  private async flushMailboxVacuum(beforeSequence: number): Promise<void> {
    if (!this.bundleServer?.isAvailable() || !this.identity) return
    if (typeof this.bundleServer.vacuumOwnedSealedMessages !== 'function') return
    if (!Number.isSafeInteger(beforeSequence) || beforeSequence <= 0) return
    const nowMs = Date.now()
    if (
      nowMs - this.lastMailboxVacuumAt < MAILBOX_VACUUM_DEBOUNCE_MS
      && beforeSequence <= this.lastMailboxVacuumBeforeSequence
    ) {
      return
    }
    const statuses = this.mailboxVacuumStatuses()
    const startedAt = Date.now()
    try {
      const deletedCount = await this.bundleServer.vacuumOwnedSealedMessages(beforeSequence, statuses)
      this.lastMailboxVacuumBeforeSequence = Math.max(this.lastMailboxVacuumBeforeSequence, beforeSequence)
      this.lastMailboxVacuumAt = Date.now()
      this.recordLatency('receive', 'relay_mailbox_vacuum', Date.now() - startedAt, {
        beforeSequence,
        deletedCount,
      })
      this.recordDiagnostic('receive', 'relay_mailbox_vacuum', {
        beforeSequence,
        deletedCount,
        statuses: statuses.join(','),
      })
    } catch (error) {
      this.lastMailboxVacuumAt = Date.now()
      this.recordDiagnostic('receive', 'relay_mailbox_vacuum_failed', {
        beforeSequence,
        ...this.getErrorDiagnosticFields(error),
      })
    }
  }

  private scheduleReceiveMaintenance(delayMs = 0): void {
    if (this.receiveMaintenancePromise) {
      this.pendingReceiveMaintenance = true
      return
    }
    const safeDelayMs = Math.max(0, delayMs)
    const scheduledAt = Date.now() + safeDelayMs
    if (this.receiveMaintenanceTimer) {
      if (scheduledAt >= this.receiveMaintenanceScheduledAt) return
      clearTimeout(this.receiveMaintenanceTimer)
      this.receiveMaintenanceTimer = null
    }
    this.receiveMaintenanceScheduledAt = scheduledAt
    this.receiveMaintenanceTimer = setTimeout(() => {
      this.receiveMaintenanceTimer = null
      this.receiveMaintenanceScheduledAt = 0
      if (this.activeReceiveOperations > 0) {
        this.scheduleReceiveMaintenance(RELAY_RECEIPT_ACTIVE_RETRY_MS)
        return
      }
      this.receiveMaintenancePromise = (async () => {
        await this.flushRelayReceiptJobs()
        await this.flushPendingRelayDeletions()
        await this.syncOutboundRelayStatuses()
      })().catch(() => {}).finally(() => {
        this.receiveMaintenancePromise = null
        if (this.pendingReceiveMaintenance) {
          this.pendingReceiveMaintenance = false
          this.scheduleReceiveMaintenance(RELAY_RECEIPT_ACTIVE_RETRY_MS)
        }
      })
    }, safeDelayMs)
  }

  private getRelayReceiptJobKey(
    relayMessageId: string,
    status: RelayReceiptJobStatus,
  ): string {
    return `${relayMessageId}:${status}`
  }

  private async hasPersistedRelayReceiptJob(relayMessageId: string): Promise<boolean> {
    const [delivered, read] = await Promise.all([
      localChatStorage.getRelayReceiptJob(this.getRelayReceiptJobKey(relayMessageId, 'delivered')),
      localChatStorage.getRelayReceiptJob(this.getRelayReceiptJobKey(relayMessageId, 'read')),
    ])
    const identityId = this.identity?.id
    return Boolean(
      identityId
      && [delivered, read].some((job) => job?.localIdentityId === identityId)
    )
  }

  private async hasUnsettledRelayReceipt(relayMessageId: string): Promise<boolean> {
    if (
      this.activeRelayReceiptIds.has(relayMessageId)
      || await this.hasPersistedRelayReceiptJob(relayMessageId)
    ) {
      return true
    }
    if (!this.getReceiptPolicy().readReceiptsEnabled) {
      return false
    }
    const linkedMessage = await localChatStorage.getMessageByRelayId(relayMessageId)
    return Boolean(linkedMessage && linkedMessage.status !== 'read')
  }

  private async hasRecoverableRelayProjection(relayMessageId: string): Promise<boolean> {
    const identityId = this.identity?.id
    if (!identityId) return false
    try {
      const message = await localChatStorage.getMessageByRelayId(relayMessageId)
      if (
        !message
        || message.relayMessageId !== relayMessageId
        || message.recipientIdentityId !== identityId
        || (
          message.encryptedData?.metadata?.messageId !== undefined
          && message.id !== message.encryptedData.metadata.messageId
        )
      ) {
        return false
      }
      if (message.messageKind === 'view_once') {
        return Boolean(message.oneTime && message.encryptedData)
      }
      if (typeof message.content === 'string') {
        return true
      }
      const decrypted = await localChatStorage.getDecryptedMessage(message.id)
      return Boolean(
        decrypted
        && decrypted.id === message.id
        && decrypted.conversationId === message.conversationId,
      )
    } catch (error) {
      this.recordDiagnostic('receive', 'relay_projection_lookup_failed', {
        relayId: relayMessageId,
        ...this.getErrorDiagnosticFields(error),
      })
      return false
    }
  }

  private async clearSettledRelayReceipt(relayMessageId: string): Promise<void> {
    if (!await this.hasPersistedRelayReceiptJob(relayMessageId)) {
      this.activeRelayReceiptIds.delete(relayMessageId)
    }
  }

  private getRelayReceiptRetryDelayMs(attemptCount: number, error?: unknown): number {
    const retryDelayMs = RELAY_RECEIPT_JOB_RETRY_DELAYS_MS[
      Math.min(attemptCount, RELAY_RECEIPT_JOB_RETRY_DELAYS_MS.length - 1)
    ]
    if (error instanceof BundleServerRequestError && error.reason === 'rate_limited') {
      return Math.max(error.retryAfterMs ?? RELAY_RECEIPT_RATE_LIMIT_FALLBACK_MS, retryDelayMs)
    }
    return retryDelayMs
  }

  private getRelayReceiptRateLimitDelayMs(status?: RelayReceiptJobStatus): number {
    const currentTime = now()
    const blockedUntil = status
      ? this.relayReceiptRateLimitedUntil.get(status) ?? 0
      : Math.max(...this.relayReceiptRateLimitedUntil.values(), 0)
    return Math.max(0, blockedUntil - currentTime)
  }

  private pauseRelayReceiptLanes(error: BundleServerRequestError): number {
    const retryDelayMs = error.retryAfterMs ?? RELAY_RECEIPT_RATE_LIMIT_FALLBACK_MS
    const blockedUntil = now() + retryDelayMs
    this.relayReceiptRateLimitedUntil.set('delivered', blockedUntil)
    this.relayReceiptRateLimitedUntil.set('read', blockedUntil)
    return retryDelayMs
  }

  private isRelayReceiptAcknowledged(message: Message, status: RelayReceiptJobStatus): boolean {
    return status === 'read'
      ? Boolean(message.relayReadReceiptAcknowledgedAt)
      : Boolean(message.relayDeliveredReceiptAcknowledgedAt)
  }

  private async markRelayReceiptAcknowledged(
    relayMessageId: string,
    status: RelayReceiptJobStatus,
  ): Promise<void> {
    const linkedMessage = await localChatStorage.getMessageByRelayId(relayMessageId)
    if (!linkedMessage || this.isRelayReceiptAcknowledged(linkedMessage, status)) return
    await this.enqueueRelayDeliveryMutation(linkedMessage.id, async () => {
      const current = await localChatStorage.getMessage(linkedMessage.id)
      if (!current || current.relayMessageId !== relayMessageId
        || this.isRelayReceiptAcknowledged(current, status)) return
      await localChatStorage.storeMessage({
        ...current,
        ...(status === 'read'
          ? { relayReadReceiptAcknowledgedAt: now() }
          : { relayDeliveredReceiptAcknowledgedAt: now() }),
      })
    })
  }

  private isRelayMessageNotFoundError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    const normalized = message.toLowerCase()
    return normalized.includes('message_not_found')
      || normalized.includes('sealed relay message not found')
  }

  private async enqueueRelayReceiptJob(
    relayMessageId: string,
    status: RelayReceiptJobStatus,
  ): Promise<boolean> {
    if (!this.identity) return false
    const policy = this.getReceiptPolicy()
    if (status === 'delivered' && !policy.deliveryReceiptsEnabled) return false
    if (status === 'read' && !policy.readReceiptsEnabled) {
      this.recordDiagnostic('receive', 'mark_read_skipped_policy', { relayMessageId })
      return false
    }
    const linkedMessage = await Promise.resolve(
      localChatStorage.getMessageByRelayId(relayMessageId),
    ).catch(() => null)
    if (linkedMessage && this.isRelayReceiptAcknowledged(linkedMessage, status)) {
      return false
    }

    this.activeRelayReceiptIds.add(relayMessageId)
    try {
      const nowMs = now()
      const key = this.getRelayReceiptJobKey(relayMessageId, status)
      const existing = await localChatStorage.getRelayReceiptJob(key).catch(() => null)
      const job: RelayReceiptJob = {
        key,
        relayMessageId,
        status,
        localIdentityId: this.identity.id,
        attemptCount: existing?.attemptCount ?? 0,
        createdAt: existing?.createdAt ?? nowMs,
        updatedAt: nowMs,
        nextAttemptAt: Math.max(existing?.nextAttemptAt ?? nowMs, nowMs),
        lastAttemptAt: existing?.lastAttemptAt,
        lastFailureReason: existing?.lastFailureReason,
      }

      await localChatStorage.storeRelayReceiptJob(job)
      if (this.relayReceiptJobFlushPromise) {
        this.pendingRelayReceiptJobFlush = true
      } else {
        this.scheduleReceiveMaintenance(Math.max(
          RELAY_RECEIPT_FLUSH_DEBOUNCE_MS,
          job.nextAttemptAt - nowMs,
        ))
      }
      return true
    } catch (error) {
      await this.clearSettledRelayReceipt(relayMessageId)
      throw error
    }
  }

  private async sendRelayReceiptJob(job: RelayReceiptJob): Promise<void> {
    if (!this.bundleServer?.isAvailable()) {
      throw new Error('bundle_server_unavailable')
    }
    if (job.status === 'read') {
      await this.bundleServer.markRead(job.relayMessageId)
      return
    }
    await this.bundleServer.markDelivered(job.relayMessageId)
  }

  private async flushRelayReceiptJobGroup(
    jobs: RelayReceiptJob[],
    identityId: string,
  ): Promise<void> {
    const ordered = [...jobs].sort((left, right) => {
      if (left.status === right.status) return left.nextAttemptAt - right.nextAttemptAt
      return left.status === 'delivered' ? -1 : 1
    })
    const policy = this.getReceiptPolicy()

    for (const queuedJob of ordered) {
      const job = await localChatStorage.getRelayReceiptJob(queuedJob.key)
      if (!job || job.localIdentityId !== identityId) continue
      if ((job.status === 'delivered' && !policy.deliveryReceiptsEnabled)
        || (job.status === 'read' && !policy.readReceiptsEnabled)) {
        await localChatStorage.deleteRelayReceiptJob(job.key)
        continue
      }
      if (job.status === 'read' && policy.deliveryReceiptsEnabled) {
        const delivered = await localChatStorage.getRelayReceiptJob(
          this.getRelayReceiptJobKey(job.relayMessageId, 'delivered')
        )
        if (delivered?.localIdentityId === identityId) continue
      }
      const rateLimitDelayMs = this.getRelayReceiptRateLimitDelayMs(job.status)
      if (rateLimitDelayMs > 0) {
        const updatedAt = now()
        await localChatStorage.storeRelayReceiptJob({
          ...job,
          updatedAt,
          nextAttemptAt: Math.max(job.nextAttemptAt, updatedAt + rateLimitDelayMs),
        })
        this.scheduleReceiveMaintenance(rateLimitDelayMs)
        continue
      }

      try {
        await this.sendRelayReceiptJob(job)
        await this.markRelayReceiptAcknowledged(job.relayMessageId, job.status)
        await localChatStorage.deleteRelayReceiptJob(job.key)
        this.recordDiagnostic('receive', 'relay_receipt_sent', {
          relayMessageId: job.relayMessageId,
          status: job.status,
          attemptCount: job.attemptCount + 1,
        })
      } catch (error) {
        const attemptCount = job.attemptCount + 1
        const updatedAt = now()
        const errorFields = this.getErrorDiagnosticFields(error)
        if (job.status === 'read' && this.isRelayMessageNotFoundError(error)) {
          await this.markRelayReceiptAcknowledged(job.relayMessageId, job.status)
          await localChatStorage.deleteRelayReceiptJob(job.key)
          this.recordDiagnostic('receive', 'relay_receipt_terminal', {
            relayMessageId: job.relayMessageId,
            status: job.status,
            attemptCount,
            ...errorFields,
          })
          continue
        }
        const retryDelayMs = this.getRelayReceiptRetryDelayMs(attemptCount, error)
        if (error instanceof BundleServerRequestError && error.reason === 'rate_limited') {
          const laneRetryDelayMs = this.pauseRelayReceiptLanes(error)
          this.recordDiagnostic('receive', 'relay_receipt_rate_limited', {
            status: job.status,
            retryDelayMs: laneRetryDelayMs,
          })
        }
        await localChatStorage.storeRelayReceiptJob({
          ...job,
          attemptCount,
          updatedAt,
          lastAttemptAt: updatedAt,
          nextAttemptAt: updatedAt + retryDelayMs,
          lastFailureReason: String(errorFields.failureReason ?? errorFields.error ?? 'unknown'),
        })
        this.scheduleReceiveMaintenance(retryDelayMs)
        this.recordDiagnostic('receive', 'relay_receipt_failed', {
          relayMessageId: job.relayMessageId,
          status: job.status,
          attemptCount,
          ...errorFields,
        })
      }
    }

    const relayMessageId = ordered[0]?.relayMessageId
    if (relayMessageId) {
      await this.clearSettledRelayReceipt(relayMessageId)
      if (this.pendingRelayDeletionIds.has(relayMessageId)) {
        this.ensureRelayDeletionScheduled(0)
      }
    }
  }

  async flushRelayReceiptJobs(): Promise<void> {
    if (!this.bundleServer?.isAvailable() || !this.identity) return
    if (this.activeReceiveOperations > 0) {
      this.scheduleReceiveMaintenance(RELAY_RECEIPT_ACTIVE_RETRY_MS)
      return
    }
    const rateLimitDelayMs = this.getRelayReceiptRateLimitDelayMs()
    if (rateLimitDelayMs > 0) {
      this.scheduleReceiveMaintenance(rateLimitDelayMs)
      return
    }
    if (this.relayReceiptJobFlushPromise) {
      this.pendingRelayReceiptJobFlush = true
      return this.relayReceiptJobFlushPromise
    }

    this.relayReceiptJobFlushPromise = (async () => {
      const jobs = await localChatStorage.getPendingRelayReceiptJobs(now(), 25)
      if (jobs.length >= 25) {
        this.pendingRelayReceiptJobFlush = true
      }
      const identityId = this.identity!.id
      const grouped = new Map<string, RelayReceiptJob[]>()
      for (const job of jobs) {
        if (job.localIdentityId !== identityId) continue
        this.activeRelayReceiptIds.add(job.relayMessageId)
        const group = grouped.get(job.relayMessageId) ?? []
        group.push(job)
        grouped.set(job.relayMessageId, group)
      }
      const groups = Array.from(grouped.values())
      let nextGroupIndex = 0
      await Promise.all(
        Array.from(
          { length: Math.min(RELAY_RECEIPT_JOB_CONCURRENCY, groups.length) },
          async () => {
            while (nextGroupIndex < groups.length) {
              const group = groups[nextGroupIndex]
              nextGroupIndex += 1
              await this.flushRelayReceiptJobGroup(group, identityId)
            }
          },
        ),
      )
    })().finally(async () => {
      this.relayReceiptJobFlushPromise = null
      if (this.pendingRelayReceiptJobFlush) {
        this.pendingRelayReceiptJobFlush = false
        await this.flushRelayReceiptJobs()
      } else {
        const nextRateLimitDelayMs = this.getRelayReceiptRateLimitDelayMs()
        if (nextRateLimitDelayMs > 0) {
          this.scheduleReceiveMaintenance(nextRateLimitDelayMs)
        }
      }
    })

    return this.relayReceiptJobFlushPromise
  }

  private async flushPendingRelayDeletions(): Promise<void> {
    if (!this.bundleServer?.isAvailable() || this.pendingRelayDeletionIds.size === 0) {
      return
    }
    if (this.activeReceiveOperations > 0) {
      this.scheduleReceiveMaintenance(RELAY_RECEIPT_ACTIVE_RETRY_MS)
      return
    }
    const rateLimitDelayMs = this.getRelayReceiptRateLimitDelayMs()
    if (rateLimitDelayMs > 0) {
      this.ensureRelayDeletionScheduled(rateLimitDelayMs)
      return
    }
    if (typeof this.bundleServer.deleteMessages !== 'function' && typeof this.bundleServer.deleteMessage !== 'function') {
      this.recordDiagnostic('receive', 'relay_cleanup_unavailable', {
        pendingCount: this.pendingRelayDeletionIds.size,
      })
      return
    }

    if (this.relayDeletionFlushPromise) {
      return this.relayDeletionFlushPromise
    }

    this.relayDeletionFlushPromise = (async () => {
      const candidates = Array.from(this.pendingRelayDeletionIds)
      const [unsettled, recoverable, tombstoned] = await Promise.all([
        Promise.all(
          candidates.map((relayMessageId) => this.hasUnsettledRelayReceipt(relayMessageId)),
        ),
        Promise.all(
          candidates.map((relayMessageId) => this.hasRecoverableRelayProjection(relayMessageId)),
        ),
        Promise.all(
          candidates.map((relayMessageId) => this.hasAuthenticatedRelayTombstone(relayMessageId)),
        ),
      ])
      const ids = candidates.filter((_, index) => (
        !unsettled[index] && (recoverable[index] || tombstoned[index])
      ))
      const deferredCount = candidates.length - ids.length
      const unprojectedCount = candidates.filter((_, index) => !recoverable[index]).length
      const currentTime = now()
      if (deferredCount > 0 && (
        deferredCount !== this.lastRelayCleanupDeferredCount
        || currentTime - this.lastRelayCleanupDeferredAt >= RELAY_CLEANUP_DEFERRED_DIAGNOSTIC_INTERVAL_MS
      )) {
        this.lastRelayCleanupDeferredAt = currentTime
        this.lastRelayCleanupDeferredCount = deferredCount
        this.recordDiagnostic('receive', 'relay_cleanup_deferred', {
          deferredCount,
          unprojectedCount,
        })
      }
      if (ids.length === 0) {
        if (unprojectedCount > 0) {
          this.ensureRelayDeletionScheduled(
            RELAY_MESSAGE_DELETE_RETRY_DELAYS_MS[RELAY_MESSAGE_DELETE_RETRY_DELAYS_MS.length - 1],
          )
        }
        return
      }

      try {
        const cleanupStartedAt = Date.now()
        if (typeof this.bundleServer!.deleteMessages !== 'function') {
          throw new Error('relay_batch_delete_unavailable')
        }
        const deletedCount = await this.bundleServer!.deleteMessages(ids)
        if (!Number.isSafeInteger(deletedCount) || deletedCount < ids.length) {
          throw new Error('relay_batch_delete_incomplete')
        }
        this.recordLatency('receive', 'relay_cleanup', Date.now() - cleanupStartedAt, {
          batchSize: ids.length,
          deletedCount,
        })
        this.recordDiagnostic('receive', 'relay_cleanup_success', {
          batchSize: ids.length,
          deletedCount,
        })
        for (const id of ids) {
          await this.resolveRetryRequestRecordByRelayId(id, 'relay_deleted')
          this.pendingRelayDeletionIds.delete(id)
          this.relayDeletionAttempts.delete(id)
        }
      } catch (error) {
        this.recordDiagnostic('receive', 'relay_cleanup_batch_failed', {
          batchSize: ids.length,
          ...this.getErrorDiagnosticFields(error),
        })
        let nextRetryDelayMs: number | null = null
        for (const relayMessageId of ids) {
          try {
            const cleanupStartedAt = Date.now()
            if (typeof this.bundleServer!.deleteMessage !== 'function') {
              throw new Error('relay_delete_unavailable')
            }
            const deletedCount = await this.bundleServer!.deleteMessage(relayMessageId)
            if (!Number.isSafeInteger(deletedCount) || deletedCount < 1) {
              await this.acknowledgeAuthenticatedMessageRelay(relayMessageId)
              throw new Error('relay_delete_incomplete')
            }
            this.recordLatency('receive', 'relay_cleanup', Date.now() - cleanupStartedAt, {
              relayId: relayMessageId,
              deletedCount,
            })
            this.recordDiagnostic('receive', 'relay_cleanup_success', {
              relayId: relayMessageId,
              deletedCount,
            })
            await this.resolveRetryRequestRecordByRelayId(relayMessageId, 'relay_deleted')
            this.pendingRelayDeletionIds.delete(relayMessageId)
            this.relayDeletionAttempts.delete(relayMessageId)
          } catch (error) {
            const nextAttempt = (this.relayDeletionAttempts.get(relayMessageId) ?? 0) + 1
            this.relayDeletionAttempts.set(relayMessageId, nextAttempt)
            const retryDelayMs = this.getRelayDeletionRetryDelayMs(nextAttempt)
            nextRetryDelayMs = nextRetryDelayMs === null
              ? retryDelayMs
              : Math.min(nextRetryDelayMs, retryDelayMs)
            this.recordDiagnostic('receive', 'relay_cleanup_failed', {
              relayId: relayMessageId,
              attemptCount: nextAttempt,
              retryDelayMs,
              ...this.getErrorDiagnosticFields(error),
            })
            console.warn('[QuantumChat] Failed to delete relayed message, retrying later:', relayMessageId, error)
          }
        }

        if (nextRetryDelayMs !== null) {
          this.ensureRelayDeletionScheduled(nextRetryDelayMs)
        }
      }
    })().finally(() => {
      this.relayDeletionFlushPromise = null
    })

    return this.relayDeletionFlushPromise
  }

  private queueRelayedMessageFollowUps(relayedMsg: RelayedMessage, decrypted: DecryptedMessage): void {
    if (!this.bundleServer) return

    const policy = this.getReceiptPolicy()
    if (!policy.deliveryReceiptsEnabled) {
      this.recordDiagnostic('receive', 'mark_delivered_skipped_policy', {
        relayId: relayedMsg.id,
        messageId: decrypted.id,
      })
      if (!policy.readReceiptsEnabled) {
        this.recordDiagnostic('receive', 'relay_cleanup_retained_without_receipts', {
          relayId: relayedMsg.id,
          messageId: decrypted.id,
        })
      }
      return
    }

    const markDeliveredStartedAt = Date.now()
    void this.enqueueRelayReceiptJob(relayedMsg.id, 'delivered')
      .then((queued) => {
        if (!queued) return
        this.recordLatency('receive', 'mark_delivered', Date.now() - markDeliveredStartedAt, {
          messageId: decrypted.id,
          relayId: relayedMsg.id,
        })
      })
  }

  private schedulePostDecryptBookkeeping(params: {
    relayedMsg: OpenedRelayedMessage
    decrypted: DecryptedMessage
    senderBundle: PublicKeyBundle | null
    trackSender: boolean
    resolveRetryRecord: boolean
  }): void {
    const startedAt = Date.now()
    const { relayedMsg, decrypted, senderBundle, trackSender, resolveRetryRecord } = params
    void (async () => {
      const tasks: Array<Promise<void>> = []
      if (trackSender) {
        tasks.push(this.trackSenderAfterDecrypt(relayedMsg.senderIdentityId, senderBundle))
      }
      if (resolveRetryRecord) {
        tasks.push(this.resolveRetryRequestRecord(
          relayedMsg.encryptedData.metadata?.messageId || relayedMsg.id,
          relayedMsg.senderIdentityId,
          'message_decrypted',
          relayedMsg.id,
        ))
      }

      const results = await Promise.allSettled(tasks)
      const failedCount = results.filter((result) => result.status === 'rejected').length
      this.recordLatency('receive', 'post_decrypt_bookkeeping', Date.now() - startedAt, {
        messageId: decrypted.id,
        relayId: relayedMsg.id,
        failedCount,
      })
      if (failedCount > 0) {
        this.recordDiagnostic('receive', 'post_decrypt_bookkeeping_failed', {
          ...this.getRelayDiagnosticFields(relayedMsg),
          messageId: decrypted.id,
          failedCount,
        })
      }
    })()
  }

  private getOutboundStatusSyncPriority(status: Message['status'] | undefined): number {
    switch (status) {
      case 'sending':
      case 'sent':
        return 0
      case 'delivered':
        return 1
      default:
        return 2
    }
  }

  private shouldFetchOutboundRelayStatus(message: Message): boolean {
    return shouldSyncOutboundStatus(message, this.identity?.id ?? '')
  }

  private async enqueueRelayDeliveryMutation<T>(
    messageId: string,
    mutation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.relayDeliveryMutationQueues.get(messageId) ?? Promise.resolve()
    const operation = previous.catch(() => undefined).then(mutation)
    const tracked = operation.then(() => undefined, () => undefined)
    this.relayDeliveryMutationQueues.set(messageId, tracked)
    try {
      return await operation
    } finally {
      if (this.relayDeliveryMutationQueues.get(messageId) === tracked) {
        this.relayDeliveryMutationQueues.delete(messageId)
      }
    }
  }

  async stageLocalMessageRelayDelivery(
    messageId: string,
    record: OutboundSealedRelayRecord,
  ): Promise<OutboundSealedRelayRecord> {
    return this.enqueueRelayDeliveryMutation(messageId, async () => {
      const storedMessage = await localChatStorage.getMessage(messageId)
      if (!storedMessage) {
        throw new ChatError('Message is not available for relay staging', 'MESSAGE_NOT_FOUND')
      }
      const staged = stageRelayDeliveryOutbox(storedMessage, record)
      await localChatStorage.storeMessage(staged.message)
      return staged.record
    })
  }

  async linkLocalMessageToRelay(
    messageId: string,
    relayMessageId: string,
    relayDeliveryToken?: string,
  ): Promise<void> {
    const storedMessage = await this.enqueueRelayDeliveryMutation(messageId, async () => {
      return localChatStorage.linkRelayMessage(
        messageId,
        relayMessageId,
        relayDeliveryToken,
      )
    })
    if (
      storedMessage?.status === 'read'
      && storedMessage.relayReadReceiptEligible === true
    ) {
      void this.enqueueRelayReceiptJob(relayMessageId, 'read')
    } else if (storedMessage?.status === 'delivered') {
      void this.enqueueRelayReceiptJob(relayMessageId, 'delivered')
    }
  }

  async syncRelayedMessageStatus(
    relayMessageId: string,
    status: RelayedMessage['status'],
  ): Promise<void> {
    if (status !== 'delivered' && status !== 'read') {
      return
    }

    const storedMessage = await localChatStorage.getMessageByRelayId(relayMessageId)

    if (!storedMessage) {
      this.recordDiagnostic('send', 'relay_status_sync_missing_local_message', {
        relayMessageId,
        status,
      })
      return
    }

    await this.applyRelayedMessageStatus(storedMessage, relayMessageId, status)
  }

  private async applyRelayedMessageStatus(
    storedMessage: NonNullable<Awaited<ReturnType<typeof localChatStorage.getMessageByRelayId>>>,
    relayMessageId: string,
    status: 'delivered' | 'read',
  ): Promise<void> {
    const nextStatus = applyRelayReceipt(storedMessage, { status })
    const advanced = compareMessageStatus(nextStatus, storedMessage.status) > 0
    if (advanced) {
      await localChatStorage.updateMessageStatus(storedMessage.id, nextStatus)
      this.recordDiagnostic('send', 'relay_status_sync_applied', {
        relayMessageId,
        messageId: storedMessage.id,
        previousStatus: storedMessage.status,
        status: nextStatus,
      })
    }
    const projectedStatus = advanced ? nextStatus : storedMessage.status
    if (projectedStatus !== 'delivered' && projectedStatus !== 'read') return
    this.emit(projectedStatus === 'read' ? 'message:read' : 'message:delivered', {
      messageId: storedMessage.id,
      relayMessageId,
    })
  }

  async syncOutboundRelayStatuses(options?: { force?: boolean }): Promise<void> {
    if (!this.bundleServer?.isAvailable() || !this.identity) return

    if (this.outboundStatusSyncPromise) {
      if (options?.force) {
        this.pendingForcedOutboundStatusSync = true
      }
      return this.outboundStatusSyncPromise
    }

    const elapsedSinceLastSync = Date.now() - this.lastOutboundStatusSyncAt
    if (!options?.force && elapsedSinceLastSync < this.getOutboundStatusSyncIntervalMs()) {
      return
    }

    this.lastOutboundStatusSyncAt = Date.now()
    this.outboundStatusSyncPromise = (async () => {
      try {
        const startedAt = Date.now()
        const candidateLoadStartedAt = Date.now()
        const trackedMessages = await localChatStorage.getMessagesNeedingStatusSync(this.identity!.id)
        const syncCandidates = trackedMessages.filter((message) => this.shouldFetchOutboundRelayStatus(message))
        const candidateLoadMs = Date.now() - candidateLoadStartedAt
        const candidatesByRelayId = new Map(
          syncCandidates
            .filter((message) => Boolean(message.relayMessageId))
            .map((message) => [message.relayMessageId!, message]),
        )
        let fetchElapsedMs = 0
        let applyElapsedMs = 0
        let appliedUpdateCount = 0
        let missingDeliveryTokenCount = 0
        const relayStatusQueries = Array.from(
          syncCandidates
            .sort((left, right) => {
              const priorityDelta = this.getOutboundStatusSyncPriority(left.status) - this.getOutboundStatusSyncPriority(right.status)
              if (priorityDelta !== 0) return priorityDelta
              const createdAtDelta = left.createdAt - right.createdAt
              if (createdAtDelta !== 0) return createdAtDelta
              return (left.relayMessageId ?? left.id).localeCompare(right.relayMessageId ?? right.id)
            })
            .reduce((queries, message) => {
              if (!message.relayMessageId || queries.has(message.relayMessageId)) {
                return queries
              }
              if (!message.relayDeliveryToken) {
                missingDeliveryTokenCount += 1
                return queries
              }
              queries.set(message.relayMessageId, {
                id: message.relayMessageId,
                deliveryToken: message.relayDeliveryToken,
              })
              return queries
            }, new Map<string, { id: string; deliveryToken: string }>())
            .values(),
        )

        if (missingDeliveryTokenCount > 0) {
          this.recordDiagnostic('send', 'relay_status_sync_missing_delivery_token', {
            trackedMessageCount: trackedMessages.length,
            syncCandidateCount: syncCandidates.length,
            missingDeliveryTokenCount,
          })
        }

        if (relayStatusQueries.length === 0) {
          return
        }

        const chunkCount = Math.ceil(relayStatusQueries.length / MAX_STATUS_QUERY_LIMIT)
        for (let offset = 0; offset < relayStatusQueries.length; offset += MAX_STATUS_QUERY_LIMIT) {
          const chunk = relayStatusQueries.slice(offset, offset + MAX_STATUS_QUERY_LIMIT)
          const chunkIndex = offset / MAX_STATUS_QUERY_LIMIT
          let updates: Awaited<ReturnType<BundleServer['fetchMessageStatuses']>>
          try {
            const fetchStartedAt = Date.now()
            updates = await this.bundleServer!.fetchMessageStatuses(chunk)
            fetchElapsedMs += Date.now() - fetchStartedAt
          } catch (error) {
            this.recordDiagnostic('send', 'relay_status_sync_batch_failed', {
              trackedMessageCount: trackedMessages.length,
              syncCandidateCount: syncCandidates.length,
              chunkIndex,
              chunkCount,
              relayIdCount: chunk.length,
              ...this.getErrorDiagnosticFields(error),
            })
            console.warn('[QuantumChat] Failed to sync outbound relay status batch:', error)
            continue
          }

          const queryOrder = new Map(chunk.map((query, index) => [query.id, index]))
          const orderedUpdates = updates
            .filter((update) => queryOrder.has(update.id))
            .sort((left, right) => {
              const queryDelta = queryOrder.get(left.id)! - queryOrder.get(right.id)!
              if (queryDelta !== 0) return queryDelta
              return left.status.localeCompare(right.status)
            })
          this.recordDiagnostic('send', 'relay_status_sync_batch', {
            trackedMessageCount: trackedMessages.length,
            syncCandidateCount: syncCandidates.length,
            chunkIndex,
            chunkCount,
            relayIdCount: chunk.length,
            updateCount: orderedUpdates.length,
            ignoredUpdateCount: updates.length - orderedUpdates.length,
          })
          const applyStartedAt = Date.now()
          for (const update of orderedUpdates) {
            try {
              if (update.status !== 'delivered' && update.status !== 'read') {
                continue
              }
              const candidate = candidatesByRelayId.get(update.id)
              if (!candidate) {
                await this.syncRelayedMessageStatus(update.id, update.status)
              } else {
                await this.applyRelayedMessageStatus(candidate, update.id, update.status)
              }
              appliedUpdateCount += 1
            } catch (error) {
              this.recordDiagnostic('send', 'relay_status_sync_apply_failed', {
                chunkIndex,
                chunkCount,
                relayMessageId: update.id,
                status: update.status,
                ...this.getErrorDiagnosticFields(error),
              })
            }
          }
          applyElapsedMs += Date.now() - applyStartedAt
        }
        this.recordDiagnostic('send', 'relay_status_sync_complete', {
          trackedMessageCount: trackedMessages.length,
          syncCandidateCount: syncCandidates.length,
          updateCount: appliedUpdateCount,
          candidateLoadMs,
          fetchElapsedMs,
          applyElapsedMs,
          elapsedMs: Date.now() - startedAt,
        })
      } catch (error) {
        console.warn('[QuantumChat] Failed to sync outbound relay statuses:', error)
      }
    })().finally(async () => {
      this.outboundStatusSyncPromise = null
      if (this.pendingForcedOutboundStatusSync) {
        this.pendingForcedOutboundStatusSync = false
        await this.syncOutboundRelayStatuses({ force: true })
      }
    })

    return this.outboundStatusSyncPromise
  }

  async markConversationAsRead(
    conversationId: string,
    remoteIdentityId: string,
    syncRelayReadState: boolean = true,
  ): Promise<void> {
    await markConversationReadState(
      this,
      conversationId,
      remoteIdentityId,
      syncRelayReadState,
    )
  }

  async markRelayMessageRead(relayMessageId: string): Promise<boolean> {
    if (!this.identity) return false

    if (!this.getReceiptPolicy().readReceiptsEnabled) {
      this.recordDiagnostic('receive', 'mark_read_skipped_policy', {
        relayMessageId,
      })
      return false
    }

    try {
      return await this.enqueueRelayReceiptJob(relayMessageId, 'read')
    } catch (error) {
      console.warn('[QuantumChat] Failed to queue relay message read:', relayMessageId, error)
      return false
    }
  }

  /**
   * Initialize the chat client.
   */
  static async init(config: ChatConfig): Promise<QuantumChat> {
    const client = new QuantumChat(config)
    await client.initialize()
    return client
  }

  private async initialize(): Promise<void> {
    // Initialize storage encryption if key provided
    if (this.config.storageEncryptionKey) {
      initStorageEncryption(this.config.storageEncryptionKey)
    }
    
    // Initialize bundle server if configured
    if (this.config.server) {
      this.bundleServer = await createBundleServer(this.config.server, this.config.telemetry)
    }

    // Create or load identity
    let isNewIdentity = false
    if (this.config.anonymous) {
      const result = await createAnonymousIdentity(this.config)
      this.identity = result.identity
      this.privateBundle = result.privateBundle
      isNewIdentity = true
    } else if (this.config.identity) {
      // Try to load existing identity for this wallet address first
      const existingIdentity = await loadIdentityByAddress(this.config.identity.address)
      
      if (existingIdentity) {
        // Use existing identity - this preserves the one-time pre-keys
        this.identity = existingIdentity.identity
        this.privateBundle = existingIdentity.privateBundle
        
        // Update display name if changed
        if (this.config.displayName && this.identity.displayName !== this.config.displayName) {
          this.identity.displayName = this.config.displayName
          await localChatStorage.storeIdentity(this.identity)
        }
        
        await this.ensureLocalPublicBundle()
        
        await this.checkAndRefreshBundle('startup')
      } else {
        // Create new identity for this wallet address
        const result = await createLinkedIdentity(this.config)
        this.identity = result.identity
        this.privateBundle = result.privateBundle
        isNewIdentity = true
        await this.ensureLocalPublicBundle()
      }
    } else {
      throw new ChatError('Either anonymous or identity must be specified', 'INVALID_CONFIG')
    }

    // Always ensure our bundle exists on the server and OPKs are replenished
    if (
      this.bundleServer?.isAvailable()
      && this.config.autoPublishBundle !== false
      && this.hasAuthenticatedServerAccess()
    ) {
      await this.ensureServerBundle(isNewIdentity)
    }

    // Load tracked identities (TOFU)
    await this.loadTrackedIdentities()

    // Start periodic cleanup
    this.startCleanupInterval()
    this.scheduleReceiveMaintenance()
  }

  private async ensureLocalPublicBundle(): Promise<PublicKeyBundle | null> {
    if (!this.identity || !this.privateBundle) return null

    const existingBundle = await localChatStorage.getPublicKeyBundle(this.identity.id)
    if (existingBundle) return this.ensureLocalWalletAuthorization(existingBundle)

    try {
      if (deriveX25519PublicKey(this.privateBundle.identityPrivateKey) !== this.identity.identityPublicKey) {
        console.warn('[QuantumChat] Local identity key mismatch; bundle repair skipped')
        return null
      }

      const { bundle, privateBundle } = await createPublicKeyBundleAsync(
        this.identity.id,
        this.identity.identityPublicKey,
        this.identity.dilithiumPublicKey,
        this.privateBundle.dilithiumPrivateKey,
        this.privateBundle.identityPrivateKey,
        {
          publicKey: this.identity.mlkemPublicKey,
          privateKey: this.privateBundle.mlkemIdentityPrivateKey,
        },
        this.config.preKeyCount ?? STARTUP_PREKEY_COUNT,
        () => this.yieldToHost('opk_generate', 0, this.config.preKeyCount ?? STARTUP_PREKEY_COUNT, 'background'),
      )

      const authorizedBundle = await this.ensureLocalWalletAuthorization(bundle)
      await localChatStorage.storePublicKeyBundle(this.identity.id, authorizedBundle)
      await localChatStorage.storePrivateKeyBundle(this.identity.id, privateBundle)
      this.privateBundle = privateBundle
      console.warn('[QuantumChat] Repaired missing local public bundle')
      return authorizedBundle
    } catch (e) {
      console.warn('[QuantumChat] Failed to repair local public bundle:', (e as Error).message)
      return null
    }
  }

  /**
   * Verify our bundle is on the server and publish if missing.
   * Called on every init to handle cases where the bundle was lost
   * (DB reset, stale cleanup, first run, etc.).
   */
  private async ensureServerBundle(isNewIdentity: boolean): Promise<void> {
    if (!this.bundleServer?.isAvailable() || !this.identity || !this.hasAuthenticatedServerAccess()) return

    try {
      if (isNewIdentity) {
        await this.publishBundleToServer()
        return
      }

      const exists = await this.bundleServer.bundleExistsOnServer(this.identity.id)
      if (!exists) {
        console.warn('[QuantumChat] Bundle missing from server — re-publishing')
        await this.publishBundleToServer()
      } else {
        const localBundle = await this.ensureLocalPublicBundle()
        if (await this.shouldRepairDirectoryMetadata(localBundle)) {
          await this.publishBundleToServer()
        }
        await this.checkAndReplenishServerOPKs()
      }
    } catch (e) {
      console.error('[QuantumChat] ensureServerBundle failed:', (e as Error).message)
    }
  }

  private async shouldRepairDirectoryMetadata(bundle: PublicKeyBundle | null): Promise<boolean> {
    if (
      !bundle
      || !this.config.identity?.address
      || !this.config.identity.publicKey
      || !this.config.identity.privateKey
    ) {
      return false
    }
    const verification = await verifyPublicKeyBundleWalletAuthorizationAsync(bundle, this.config.identity.address)
    if (verification.valid) return false
    if (verification.error === 'Invalid EXO wallet address') return false
    return true
  }

  private async ensureLocalWalletAuthorization(bundle: PublicKeyBundle): Promise<PublicKeyBundle> {
    const walletAddress = this.config.identity?.address
    const walletPublicKey = this.config.identity?.publicKey
    const walletPrivateKey = this.config.identity?.privateKey
    if (!this.identity || !walletAddress || !walletPublicKey || !walletPrivateKey) return bundle

    const verification = await verifyPublicKeyBundleWalletAuthorizationAsync(bundle, walletAddress)
    if (verification.valid) return bundle

    try {
      const authorizedBundle = {
        ...bundle,
        walletAuthorization: signPublicKeyBundleWalletAuthorization(
          bundle,
          walletAddress,
          walletPublicKey,
          walletPrivateKey,
          now(),
        ),
      }
      await localChatStorage.storePublicKeyBundle(this.identity.id, authorizedBundle)
      return authorizedBundle
    } catch {
      return bundle
    }
  }

  private async publishBundleToServer(bundleOverride?: PublicKeyBundle): Promise<PublishBundleResult> {
    if (!this.bundleServer?.isAvailable()) {
      return { success: false, error: 'Bundle server not available' }
    }
    if (!this.identity) {
      return { success: false, error: 'No identity initialized' }
    }
    if (!this.hasAuthenticatedServerAccess()) {
      return { success: false, error: 'Bundle server authentication unavailable' }
    }

    let bundle = bundleOverride ?? await this.ensureLocalPublicBundle()
    if (!bundle) {
      console.warn('[QuantumChat] publishBundleToServer: no local bundle found')
      return { success: false, error: 'No local bundle found' }
    }

    try {
      const walletAddress = this.config.identity?.address
      bundle = await this.ensureLocalWalletAuthorization(bundle)
      
      const result = await this.bundleServer.publishBundle(
        this.identity.id,
        bundle,
        walletAddress,
      )
      if (result.success) {
        this.emit('bundle:published', { opkCount: result.opkCount })
      } else {
        // Retry publishing later without surfacing transient transport errors.
        console.warn('[QuantumChat] publishBundleToServer failed:', result.error)
      }
      return result
    } catch (e) {
      const error = (e as Error).message
      console.warn('[QuantumChat] publishBundleToServer error:', error)
      return { success: false, error }
    }
  }

  /**
   * Check if our bundle exists on the server.
   * Returns false if the server is unavailable or the bundle is missing.
   */
  async bundleExistsOnServer(): Promise<boolean> {
    if (!this.bundleServer?.isAvailable() || !this.identity) return false
    try {
      return await this.bundleServer.bundleExistsOnServer(this.identity.id)
    } catch {
      return false
    }
  }

  /**
   * Force-publish our bundle to the server.
   * Intended for manual recovery from the UI when the automatic flow failed.
   */
  async forcePublishBundle(): Promise<{ success: boolean; error?: string }> {
    if (!this.bundleServer?.isAvailable()) {
      return { success: false, error: 'Bundle server not available' }
    }
    if (!this.hasAuthenticatedServerAccess()) {
      return { success: false, error: 'Bundle server authentication unavailable' }
    }
    if (!this.identity) {
      return { success: false, error: 'No identity initialized' }
    }
    try {
      const publishResult = await this.publishBundleToServer()
      if (!publishResult.success) {
        return { success: false, error: publishResult.error || 'Could not publish chat bundle' }
      }
      const exists = await this.bundleServer.bundleExistsOnServer(this.identity.id)
      if (exists) {
        return { success: true }
      }
      return { success: false, error: 'Bundle was not persisted after publish' }
    } catch (e) {
      return { success: false, error: (e as Error).message }
    }
  }

  /**
   * Ensure our server-side bundle registration is healthy.
   * Re-publishes the bundle and replenishes OPKs when the server is missing
   * our registration or has run out of one-time pre-keys.
   */
  async ensureServerBundleHealth(): Promise<{
    serverAvailable: boolean
    bundleExists: boolean
    opkCount: number
    republished: boolean
  }> {
    if (!this.bundleServer?.isAvailable() || !this.identity || !this.hasAuthenticatedServerAccess()) {
      return {
        serverAvailable: false,
        bundleExists: false,
        opkCount: 0,
        republished: false,
      }
    }

    let republished = false

    try {
      let bundleExists = await this.bundleServer.bundleExistsOnServer(this.identity.id)

      if (!bundleExists) {
        await this.publishBundleToServer()
        republished = true
        bundleExists = await this.bundleServer.bundleExistsOnServer(this.identity.id)
      }

      // Refresh local/server prekeys before checking final health so we can
      // recover automatically from depleted OPK inventory.
      await this.checkAndRefreshBundle()
      await this.checkAndReplenishServerOPKs()

      let opkCount = await this.bundleServer.getOPKCount(this.identity.id)

      if (opkCount === 0) {
        await this.publishBundleToServer()
        republished = true
        await this.checkAndReplenishServerOPKs()
        opkCount = await this.bundleServer.getOPKCount(this.identity.id)
      }

      return {
        serverAvailable: true,
        bundleExists,
        opkCount,
        republished,
      }
    } catch (error) {
      console.error('[QuantumChat] ensureServerBundleHealth failed:', (error as Error).message)
      return {
        serverAvailable: true,
        bundleExists: false,
        opkCount: 0,
        republished,
      }
    }
  }

  private static readonly OPK_REPLENISH_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes
  private static readonly MAX_SERVER_OPK_COUNT = 150

  /**
   * Check server OPK count and replenish if below threshold.
   *
   * Guards against runaway generation:
   * - Debounced: skips if called within OPK_REPLENISH_COOLDOWN_MS of the last run
   * - Treats getOPKCount errors (returns -1) as "unknown, skip"
   * - Caps: never generates if server already has >= MAX_SERVER_OPK_COUNT
   */
  private async checkAndReplenishServerOPKs(): Promise<void> {
    if (
      !this.bundleServer?.isAvailable()
      || !this.identity
      || !this.privateBundle
      || !this.hasAuthenticatedServerAccess()
    ) return

    const elapsed = Date.now() - this.lastOPKReplenishAt
    if (elapsed < QuantumChat.OPK_REPLENISH_COOLDOWN_MS) return

    try {
      const serverOPKCount = await this.bundleServer.getOPKCount(this.identity.id)

      if (serverOPKCount < 0) return

      if (serverOPKCount >= QuantumChat.MAX_SERVER_OPK_COUNT) return

      if (serverOPKCount < this.minOPKCount) {
        const target = TARGET_PREKEY_COUNT
        const toGenerate = Math.min(target - serverOPKCount, target)
        if (toGenerate <= 0) return

        const bundle = await localChatStorage.getPublicKeyBundle(this.identity.id)
        if (!bundle) return
        const privateBundle = this.privateBundle
        if (!privateBundle) return

        const { preKeys, x25519PrivateKeys, mlkemPrivateKeys } = await generateOneTimePreKeysAsync(
          privateBundle.nextPreKeyId,
          toGenerate,
          () => this.yieldToHost('opk_generate', 0, toGenerate, 'background'),
        )

        x25519PrivateKeys.forEach((key, id) => {
          privateBundle.oneTimePreKeyPrivates.set(id, key)
        })
        mlkemPrivateKeys.forEach((key, id) => {
          privateBundle.mlkemOneTimePreKeyPrivates.set(id, key)
        })
        privateBundle.nextPreKeyId += toGenerate

        bundle.oneTimePreKeys = [...bundle.oneTimePreKeys, ...preKeys]
        
        await localChatStorage.storePrivateKeyBundle(this.identity.id, privateBundle)
        await localChatStorage.storePublicKeyBundle(this.identity.id, bundle)

        const newCount = await this.bundleServer.replenishOPKs(this.identity.id, preKeys)
        
        this.lastOPKReplenishAt = Date.now()
        this.emit('bundle:opk_replenished', { count: newCount })
      }
    } catch {
      // OPK replenishment failed - will retry later
    }
  }

  /**
   * Check if OUR bundle needs proactive rotation/refresh and do it.
   * 
   * 1. Rotate signed pre-key if older than signedPreKeyRotationInterval (2 days)
   * 2. Replenish OPKs if count is below threshold
   * 3. Self-block sends if SPK age exceeds maximumAllowedSignedPreKeyAge (14 days)
   */
  private async checkAndRefreshBundle(mode: 'startup' | 'maintenance' = 'maintenance'): Promise<void> {
    if (!this.identity || !this.privateBundle) return
    
    const bundle = await localChatStorage.getPublicKeyBundle(this.identity.id)
    if (!bundle) return
    
    // Check signed pre-key age for rotation
    const spkAge = now() - (this.privateBundle.signedPreKeyRotatedAt || 0)
    const needsRotation = spkAge >= this.securityConfig.signedPreKeyRotationInterval
    
    // Self-check: if SPK is critically old, force rotation before any sends
    const criticallyOld = spkAge >= this.securityConfig.maximumAllowedSignedPreKeyAge
    
    if (needsRotation || criticallyOld) {
      const { bundle: newBundle, privateBundle: newPrivateBundle } = await rotateSignedPreKeyAsync(
        bundle,
        this.privateBundle,
        this.identity.dilithiumPrivateKey
      )
      const authorizedBundle = await this.ensureLocalWalletAuthorization(newBundle)
      await localChatStorage.storePublicKeyBundle(this.identity.id, authorizedBundle)
      await localChatStorage.storePrivateKeyBundle(this.identity.id, newPrivateBundle)
      this.privateBundle = newPrivateBundle
      
      this.emit('bundle:rotated', { type: 'signed_prekey', bundle: authorizedBundle })
      
      // Re-publish to server if available
      if (this.bundleServer?.isAvailable()) {
        await this.publishBundleToServer()
      }
    }
    
    // Replenish OPKs if below threshold
    const currentBundle = await localChatStorage.getPublicKeyBundle(this.identity.id)
    const currentPrivateBundle = await localChatStorage.getPrivateKeyBundle(this.identity.id)
    const startup = mode === 'startup'
    const opkFloor = startup ? 10 : 50
    const opkTarget = startup ? STARTUP_PREKEY_COUNT : TARGET_PREKEY_COUNT
    const opkBatch = 10
    if (currentBundle && currentPrivateBundle && currentBundle.oneTimePreKeys.length < opkFloor) {
      const { bundle: refreshedBundle, privateBundle: refreshedPrivateBundle } = await replenishOneTimePreKeysAsync(
        currentBundle,
        currentPrivateBundle,
        Math.min(opkTarget, currentBundle.oneTimePreKeys.length + opkBatch),
        () => this.yieldToHost('opk_generate', 0, opkBatch, startup ? 'realtime' : 'background'),
      )
      await localChatStorage.storePublicKeyBundle(this.identity.id, refreshedBundle)
      await localChatStorage.storePrivateKeyBundle(this.identity.id, refreshedPrivateBundle)
      this.privateBundle = refreshedPrivateBundle
      
      this.emit('bundle:rotated', { type: 'opk_replenish', count: refreshedBundle.oneTimePreKeys.length })
      
      // Re-publish OPKs to server if available
      if (this.bundleServer?.isAvailable()) {
        await this.checkAndReplenishServerOPKs()
      }
    }
  }

  /**
   * Start periodic cleanup interval
   */
  private startCleanupInterval(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(async () => {
      try {
        // Cleanup old processed messages
        await cleanupProcessedMessages(this.securityConfig.processedMessageRetention)
        await localChatStorage.cleanupRetryRequestRecords(RETRY_REQUEST_RECORD_RETENTION_MS)
        await localChatStorage.cleanupRelayReceiptJobs(RELAY_RECEIPT_JOB_RETENTION_MS)
        
        // Check bundle freshness
        await this.checkAndRefreshBundle()
      } catch {
        // Cleanup error - will retry later
      }
    }, 60 * 60 * 1000) // 1 hour
  }

  // Identity Methods

  /**
   * Get the current identity (public info only)
   */
  getIdentity(): ChatIdentity | null {
    if (!this.identity) return null
    return {
      id: this.identity.id,
      displayName: this.identity.displayName,
      blockchainAddress: this.identity.blockchainAddress,
      identityPublicKey: this.identity.identityPublicKey,
      mlkemPublicKey: this.identity.mlkemPublicKey,
      dilithiumPublicKey: this.identity.dilithiumPublicKey,
      createdAt: this.identity.createdAt,
      isAnonymous: this.identity.isAnonymous
    }
  }

  /**
   * Get identity ID
   */
  getIdentityId(): string | null {
    return this.identity?.id ?? null
  }

  /**
   * Get public key bundle for sharing with contacts
   */
  async getPublicKeyBundle(): Promise<PublicKeyBundle | null> {
    if (!this.identity) return null
    const bundle = await getPublicKeyBundle(this.identity.id)
    return bundle ? this.ensureLocalWalletAuthorization(bundle) : null
  }

  async reserveOneTimeContactCardPreKey(): Promise<{
    bundle: PublicKeyBundle
    cardOpk: HybridPreKey
  } | null> {
    if (!this.identity || !this.privateBundle) return null
    const bundle = await this.getPublicKeyBundle()
    const cardOpk = bundle?.oneTimePreKeys[0]
    if (!bundle || !cardOpk) return null
    const remainingBundle = {
      ...bundle,
      oneTimePreKeys: bundle.oneTimePreKeys.filter((opk) => opk.id !== cardOpk.id),
    }
    await localChatStorage.storePublicKeyBundle(this.identity.id, remainingBundle)
    await localChatStorage.storePrivateKeyBundle(this.identity.id, this.privateBundle)
    return {
      bundle: {
        ...bundle,
        oneTimePreKeys: [cardOpk],
      },
      cardOpk,
    }
  }

  async releaseOneTimeContactCardPreKey(cardOpk: HybridPreKey): Promise<void> {
    if (!this.identity) return
    const bundle = await this.getPublicKeyBundle()
    if (!bundle || bundle.oneTimePreKeys.some((opk) => opk.id === cardOpk.id)) return
    await localChatStorage.storePublicKeyBundle(this.identity.id, {
      ...bundle,
      oneTimePreKeys: [cardOpk, ...bundle.oneTimePreKeys],
    })
  }

  /**
   * Update display name
   */
  async updateDisplayName(displayName: string): Promise<void> {
    if (!this.identity) throw new ChatError('Not initialized', 'NOT_INITIALIZED')
    
    this.identity.displayName = displayName
    await localChatStorage.storeIdentity(this.identity)
    
    this.emit('identity:updated', { identity: this.getIdentity() })
  }

  /**
   * Export identity for backup
   */
  exportIdentity(): string {
    if (!this.identity) throw new ChatError('Not initialized', 'NOT_INITIALIZED')
    return exportIdentity(this.identity)
  }

  /**
   * Import identity from backup
   */
  async importIdentityBackup(exportedData: string): Promise<void> {
    this.identity = await importIdentity(exportedData)
    this.privateBundle = await localChatStorage.getPrivateKeyBundle(this.identity.id)
    
    if (!this.privateBundle) {
      throw new ChatError('Private key bundle not found for imported identity', 'IMPORT_ERROR')
    }
  }

  /**
   * Check if storage encryption is enabled
   */
  isStorageEncrypted(): boolean {
    return isStorageEncryptionEnabled()
  }

  /**
   * Enable storage encryption with password
   */
  enableStorageEncryption(password: string): void {
    initStorageEncryptionFromPassword(password)
  }

  // Contact Methods

  /**
   * Add a contact by importing their public key bundle
   * This is required before starting a conversation
   * 
   * Tracks identity keys with TOFU and reports changes.
   */
  async addContact(bundle: PublicKeyBundle, options?: {
    expectedWalletAddress?: string
    signal?: AbortSignal
  }): Promise<{
    isNew: boolean
    identityChanged: boolean
    changeEvent?: IdentityKeyChangeEvent
  }> {
    throwIfChatOperationAborted(options?.signal)
    const storedBundle = await localChatStorage.getPublicKeyBundle(bundle.identityId)
    throwIfChatOperationAborted(options?.signal)
    const persistBundle = shouldPersistContactBundle(storedBundle, bundle)
    if (persistBundle) {
      if (options?.expectedWalletAddress) {
        await storeContactBundle(bundle, { expectedWalletAddress: options.expectedWalletAddress })
      } else {
        await storeContactBundle(bundle)
      }
      throwIfChatOperationAborted(options?.signal)
    }

    const durableBundle = persistBundle ? bundle : (storedBundle ?? bundle)

    // Check if we already have a tracked identity
    let tracked = this.trackedIdentities.get(bundle.identityId)
    let isNew = false
    let identityChanged = false
    let changeEvent: IdentityKeyChangeEvent | undefined
    
    if (!tracked) {
      // Auto-trust first-seen identities.
      tracked = createTrackedIdentityFromBundle(bundle)
      await localChatStorage.storeTrackedIdentity(tracked)
      throwIfChatOperationAborted(options?.signal)
      this.trackedIdentities.set(bundle.identityId, tracked)
      isNew = true
    } else {
      // Check if identity keys have changed
      if (hasIdentityChanged(tracked, bundle.identityKey, bundle.dilithiumKey, bundle.mlkemIdentityKey)) {
        // Identity keys changed.
        const result = updateTrackedIdentity(
          tracked,
          bundle.identityKey,
          bundle.dilithiumKey,
          bundle.mlkemIdentityKey,
          'key_change'
        )
        
        tracked = result.updated
        changeEvent = result.event
        await localChatStorage.storeTrackedIdentity(tracked)
        throwIfChatOperationAborted(options?.signal)
        this.trackedIdentities.set(bundle.identityId, tracked)
        identityChanged = true
        
        // Emit security warning
        this.emit('security:warning', {
          type: 'identity_key_changed',
          details: `Identity keys have changed for ${bundle.identityId.slice(0, 8)}...`,
          severity: changeEvent.severity,
          identityId: bundle.identityId,
          requiresAction: true
        } as SecurityWarningEvent['data'])
        
        // Emit dedicated event
        this.emit('identity:key_changed', { 
          identityId: bundle.identityId,
          event: changeEvent
        })
      }
    }
    this.verifiedSenderBundlePins.set(bundle.identityId, {
      bundle: durableBundle,
      revision: JSON.stringify(durableBundle),
    })
    return { isNew, identityChanged, changeEvent }
  }

  /**
   * Get the tracked identity for a contact
   */
  getTrackedIdentity(identityId: string): TrackedIdentity | null {
    return this.trackedIdentities.get(identityId) || null
  }

  async requireContactIdentityVerification(identityId: string): Promise<void> {
    const tracked = this.trackedIdentities.get(identityId)
    if (!tracked) {
      throw new Error('Tracked contact identity is unavailable')
    }
    if (tracked.trustState === 'blocked' || tracked.trustState === 'changed') {
      this.verifiedSenderBundlePins.delete(identityId)
      await localChatStorage.storeTrackedIdentity(tracked)
      return
    }
    const changed: TrackedIdentity = {
      ...tracked,
      trustState: 'changed',
      lastUpdatedAt: Date.now(),
    }
    this.trackedIdentities.set(identityId, changed)
    this.verifiedSenderBundlePins.delete(identityId)
    await localChatStorage.storeTrackedIdentity(changed)
  }

  /**
   * Check if communication with a contact is allowed based on trust state
   */
  isCommunicationAllowedWith(identityId: string): {
    allowed: boolean
    requiresUserAction: boolean
    reason?: string
  } {
    const tracked = this.trackedIdentities.get(identityId)
    if (!tracked) {
      return { 
        allowed: false, 
        requiresUserAction: true,
        reason: 'Contact has not been added yet'
      }
    }
    return isCommunicationAllowed(tracked)
  }

  /**
   * Verify a contact's identity (user has manually verified)
   */
  async verifyContactIdentity(identityId: string): Promise<void> {
    const tracked = this.trackedIdentities.get(identityId)
    if (!tracked) {
      throw new ChatError('Contact not found', 'CONTACT_NOT_FOUND')
    }
    
    const verified = markIdentityVerified(tracked)
    this.trackedIdentities.set(identityId, verified)
    await localChatStorage.storeTrackedIdentity(verified)
    
    this.emit('identity:verified', { identityId })
  }

  /**
   * Acknowledge an identity key change (accept the new keys)
   */
  async acknowledgeIdentityChange(identityId: string): Promise<void> {
    const tracked = this.trackedIdentities.get(identityId)
    if (!tracked) {
      throw new ChatError('Contact not found', 'CONTACT_NOT_FOUND')
    }
    
    if (tracked.trustState !== 'changed') {
      return
    }
    
    const acknowledged = acknowledgeKeyChange(tracked)
    this.trackedIdentities.set(identityId, acknowledged)
    await localChatStorage.storeTrackedIdentity(acknowledged)
    this.verifiedSenderBundlePins.delete(identityId)
  }

  /**
   * Generate a safety number for verifying a contact
   */
  async generateSafetyNumberFor(contactIdentityId: string): Promise<{
    numeric: string
    fingerprint: string
    fullHash: string
  } | null> {
    if (!this.identity) return null
    
    const localBundle = await this.getPublicKeyBundle()
    if (!localBundle) return null

    const contactBundle = await this.getContactBundle(contactIdentityId)
    if (!contactBundle) return null
    
    return generateSafetyNumberFromBundlesAsync(localBundle, contactBundle)
  }

  /**
   * Load tracked identities from storage on initialization
   */
  private async loadTrackedIdentities(): Promise<void> {
    const identities = await localChatStorage.getAllTrackedIdentities()
    for (const tracked of identities) {
      this.trackedIdentities.set(tracked.identityId, tracked)
    }
  }

  /**
   * Fetch a contact's bundle from the server with atomic OPK allocation
   * This is the preferred way to get a contact's bundle when server is available
   * 
   * @param identityId - The contact's identity ID
   * @returns The contact bundle, with an OPK when claimed or redeemed, or null if not found
   */
  async fetchContactBundleFromServer(
    identityId: string,
    signal?: AbortSignal,
    inviteCapability?: string,
  ): Promise<PublicKeyBundle | null> {
    if (signal?.aborted || !this.bundleServer?.isAvailable() || !this.identity) {
      console.warn('[QuantumChat] Server not available for bundle fetch')
      return null
    }

    try {
      const cachedBundle = await getPublicKeyBundle(identityId)
      if (cachedBundle?.oneTimePreKeys?.length && !inviteCapability) {
        return signal?.aborted ? null : cachedBundle
      }
      if (this.config.prepareSessionOpkClaim && !inviteCapability) {
        const claimed = await this.config.prepareSessionOpkClaim({ identityId, signal })
        if (claimed) {
          try {
            await storeContactBundle(claimed)
          } catch (error) {
            console.warn('[QuantumChat] Failed to cache allocated contact bundle:', error)
          }
          return signal?.aborted ? null : claimed
        }
      }
      const capability = inviteCapability ?? (
        cachedBundle ? deriveRecipientMailboxToken(cachedBundle) : null
      )
      if (!capability) {
        return cachedBundle && !signal?.aborted ? cachedBundle : null
      }
      const result = await this.bundleServer.fetchBundle(
        identityId,
        this.identity.id,
        capability,
        signal,
      )
      if (result.error) {
        console.warn('[QuantumChat] Failed to fetch bundle from server:', result.error)
        return null
      }

      if (result.bundle) {
        try {
          await storeContactBundle(result.bundle)
        } catch {
          try {
            await storeContactBundle(result.bundle)
          } catch (error) {
            console.warn('[QuantumChat] Failed to cache allocated contact bundle:', error)
          }
        }
        return signal?.aborted ? null : result.bundle
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * Get a contact's public key bundle
   * If server is available and we don't have a local bundle, tries to fetch from server
   */
  async getStoredContactBundle(identityId: string): Promise<PublicKeyBundle | null> {
    return getPublicKeyBundle(identityId)
  }

  async getContactBundle(identityId: string): Promise<PublicKeyBundle | null> {
    // First try local storage
    const localBundle = await getPublicKeyBundle(identityId)
    
    if (localBundle) {
      return localBundle
    }

    // Try fetching from server if available
    if (this.bundleServer?.isAvailable()) {
      return this.fetchContactBundleFromServer(identityId)
    }

    return null
  }

  /**
   * Refresh a contact's bundle from server
   * This fetches a fresh bundle with a new OPK allocation
   */
  async refreshContactBundle(identityId: string, newBundle?: PublicKeyBundle): Promise<void> {
    // If bundle provided directly, use it
    if (newBundle) {
      await storeContactBundle(newBundle)
    } else if (this.bundleServer?.isAvailable()) {
      // Otherwise try to fetch from server
      const fetchedBundle = await this.fetchContactBundleFromServer(identityId)
      if (!fetchedBundle) {
        throw new ChatError(`Could not fetch fresh bundle for ${identityId}`, 'BUNDLE_FETCH_FAILED')
      }
    }
    
    // Delete existing sessions so new messages use fresh keys
    const sessions = await getAllSessionsForRemoteIdentity(identityId)
    for (const session of sessions) {
      // Only delete sessions that haven't received messages
      if (!session.state.receivedFirstMessage) {
        await deleteSession(session.id)
      }
    }
    
    this.emit('security:warning', {
      type: 'bundle_stale',
      details: `Contact ${identityId} bundle has been refreshed`,
      severity: 'low'
    } as SecurityWarningEvent['data'])
  }

  /**
   * Check if bundle server is available
   */
  isServerAvailable(): boolean {
    return this.bundleServer?.isAvailable() ?? false
  }

  /**
   * Get the bundle server instance (for advanced usage)
   */
  getBundleServer(): BundleServer | null {
    return this.bundleServer
  }

  // Conversation Methods

  private async createLocalConversation(remoteIdentityId: string): Promise<Conversation> {
    if (!this.identity) {
      throw new ChatError('Not initialized', 'NOT_INITIALIZED')
    }

    const conversation: Conversation = {
      id: generateUUID(),
      localIdentityId: this.identity.id,
      remoteIdentityId,
      sessionRecordId: remoteIdentityId,
      hasVisibleActivity: false,
      unreadCount: 0,
      createdAt: now(),
      updatedAt: now(),
      expectedSequenceNumber: 0,
      outgoingSequenceNumber: 0
    }
    await localChatStorage.storeConversation(conversation)

    this.emit('conversation:created', {
      conversation,
      conversationId: conversation.id,
      remoteIdentityId: conversation.remoteIdentityId
    })

    return conversation
  }

  private async getOrCreateInboundConversation(senderIdentityId: string): Promise<Conversation> {
    if (!this.identity) {
      throw new ChatError('Not initialized', 'NOT_INITIALIZED')
    }

    const conversation = await localChatStorage.getConversationByParticipants(
      this.identity.id,
      senderIdentityId
    )
    return conversation ?? this.createLocalConversation(senderIdentityId)
  }

  /**
   * Get or create a conversation with another user
   */
  async getOrCreateConversation(recipientIdentityId: string): Promise<ConversationHandle> {
    const handle = await this.openConversation(recipientIdentityId, false)
    if (!handle) {
      throw new ChatError('Failed to create conversation', 'SESSION_ERROR')
    }
    return handle
  }

  /**
   * Open an existing conversation without creating sessions or records.
   */
  async tryOpenLocalConversation(recipientIdentityId: string): Promise<ConversationHandle | null> {
    return this.openConversation(recipientIdentityId, true)
  }

  private async openConversation(
    recipientIdentityId: string,
    localOnly: boolean,
  ): Promise<ConversationHandle | null> {
    if (!this.identity || !this.privateBundle) {
      throw new ChatError('Not initialized', 'NOT_INITIALIZED')
    }

    // Enforce identity trust before starting a conversation.
    const { allowed, requiresUserAction, reason } = this.isCommunicationAllowedWith(recipientIdentityId)
    if (!allowed) {
      if (requiresUserAction) {
        this.emit('security:warning', {
          type: 'untrusted_identity',
          details: reason || 'Communication not allowed with this contact',
          severity: 'high',
          identityId: recipientIdentityId,
          requiresAction: true
        } as SecurityWarningEvent['data'])
      }
      throw new ChatError(
        reason || 'Communication not allowed with this contact',
        'UNTRUSTED_IDENTITY',
        { identityId: recipientIdentityId, requiresUserAction }
      )
    }

    // Check if we have the recipient's key bundle
    let remoteBundle = await localChatStorage.getPublicKeyBundle(recipientIdentityId)
    if (!remoteBundle) {
      throw new ChatError(
        `Contact ${recipientIdentityId} not found. Add their public key bundle first.`,
        'CONTACT_NOT_FOUND'
      )
    }
    
    // Verify bundle keys against the tracked identity.
    const tracked = this.trackedIdentities.get(recipientIdentityId)
    if (tracked) {
      if (tracked.currentIdentityKey !== remoteBundle.identityKey ||
          tracked.currentDilithiumKey !== remoteBundle.dilithiumKey) {
        this.emit('security:warning', {
          type: 'key_mismatch',
          details: 'Stored bundle keys do not match tracked identity',
          severity: 'critical',
          identityId: recipientIdentityId,
          requiresAction: true
        } as SecurityWarningEvent['data'])
        throw new ChatError(
          'Bundle keys do not match tracked identity keys',
          'KEY_MISMATCH',
          { identityId: recipientIdentityId }
        )
      }
    }
    
    // Soft freshness check: compact transport bundles intentionally omit OPKs,
    // and server fetches allocate at most one OPK, so remote OPK counts are not
    // a reliable freshness signal here. Security still comes from the Double Ratchet.
    const { needsRefresh, reason: refreshReason } = bundleNeedsRefresh(remoteBundle, {
      minOTPKs: 0,
      rotationInterval: this.securityConfig.signedPreKeyRotationInterval
    })
    if (needsRefresh) {
      this.emit('security:warning', {
        type: 'bundle_stale',
        details: `Contact bundle may be stale: ${refreshReason}`,
        severity: 'low',
        identityId: recipientIdentityId
      } as SecurityWarningEvent['data'])
    }

    // Check for existing conversation
    let conversation = await localChatStorage.getConversationByParticipants(
      this.identity.id,
      recipientIdentityId
    )

    // Get or establish session
    let session = await getActiveSessionByRemoteIdentity(recipientIdentityId)
    
    const needsNewSession = !session || sessionNeedsReestablishment(session)

    if (localOnly && (!conversation || needsNewSession)) {
      return null
    }
    
    if (needsNewSession) {
      // Refresh bundle from server before establishing a new session to ensure
      // fresh signed prekeys and OPKs. Stale bundles cause silent decryption
      // failures on the recipient side.
      const remoteTransportAvailable = this.config.isRemoteTransportAvailable?.() ?? true
      if (this.bundleServer?.isAvailable() && remoteTransportAvailable) {
        try {
          const freshBundle = await this.fetchContactBundleFromServer(recipientIdentityId)
          if (freshBundle) {
            remoteBundle = freshBundle
          }
        } catch {
          // Fall back to local bundle if server is unreachable
        }
      }
      
      const result = await establishSessionAsInitiator(
        this.identity,
        this.privateBundle,
        recipientIdentityId,
        { trackedIdentity: tracked || undefined }
      )
      session = result.session
    }

    // Create conversation if it doesn't exist
    if (!conversation) {
      conversation = await this.createLocalConversation(recipientIdentityId)
    }

    if (!session) {
      throw new ChatError('Failed to establish session', 'SESSION_ERROR')
    }

    // Build remote identity info from bundle
    const remoteIdentity: ChatIdentity = {
      id: remoteBundle.identityId,
      identityPublicKey: remoteBundle.identityKey,
      mlkemPublicKey: remoteBundle.mlkemIdentityKey,
      dilithiumPublicKey: remoteBundle.dilithiumKey,
      createdAt: 0, // Unknown
      isAnonymous: true // Unknown
    }

    return new ConversationHandle(
      this,
      conversation,
      session.id,
      this.identity,
      this.privateBundle,
      remoteIdentity
    )
  }

  /**
   * Get all conversations
   */
  async getConversations(): Promise<Conversation[]> {
    if (!this.identity) throw new ChatError('Not initialized', 'NOT_INITIALIZED')
    return localChatStorage.getConversations(this.identity.id)
  }

  /**
   * Get a specific conversation
   */
  async getConversation(conversationId: string): Promise<Conversation | null> {
    return localChatStorage.getConversation(conversationId)
  }

  /**
   * Remove a conversation and all its associated local data.
   * Deletes conversation record, encrypted messages, and decrypted cache.
   * Archives the crypto session so the next message forces a fresh X3DH
   * exchange rather than reusing a potentially stale ratchet state.
   */
  async removeConversation(conversationId: string): Promise<void> {
    const conv = await localChatStorage.getConversation(conversationId)

    if (conv?.remoteIdentityId) {
      const session = await getActiveSessionByRemoteIdentity(conv.remoteIdentityId)
      if (session) {
        await archiveSession(session.id, 'manual')
      }
    }

    await localChatStorage.deleteConversation(conversationId)
  }

  /**
   * Remove a contact from the UI layer while preserving cryptographic state.
   *
   * Contacts are a UI concept independent of the crypto identity store.
   * Deleting a contact must not destroy the public key bundle, session record,
   * or tracked identity; otherwise we lose the ability to decrypt future
   * messages from that person.
   *
   * Only local conversation records are cleaned up here; the caller is
   * responsible for removing the contact from the UI store and Backend.
   */
  async removeContact(identityId: string): Promise<void> {
    if (this.identity) {
      const conversations = await localChatStorage.getConversations(this.identity.id)
      for (const conv of conversations) {
        if (conv.remoteIdentityId === identityId) {
          await localChatStorage.deleteConversation(conv.id)
        }
      }
    }
  }

  // Message Methods

  /**
   * Receive and process an encrypted message from any transport.
   * 
   * Security checks:
   * - Verifies sender identity trust state
   * - Handles concurrent session establishment (race condition fix)
   * - Properly promotes sessions on fallback decryption
   */
  private isViewOnceEnvelopeContent(content?: string): boolean {
    if (!content?.startsWith('{')) {
      return false
    }

    try {
      const parsed = JSON.parse(content)
      return parsed?.v === 2 && parsed?.type === 'view_once'
    } catch {
      return false
    }
  }

  private createStoredLockedViewOnce(): Message['oneTime'] {
    return {
      state: 'locked',
      requiresReveal: true,
    }
  }

  private buildStoredViewOncePlaceholder(
    conversationId: string,
    encryptedData: EncryptedMessage,
    senderIdentityId: string,
  ): {
    message: Message
    decrypted: DecryptedMessage
  } {
    if (!this.identity) {
      throw new ChatError('Not initialized', 'NOT_INITIALIZED')
    }

    const timestamp = encryptedData.metadata?.timestamp || now()
    const messageId = encryptedData.metadata?.messageId || generateUUID()
    const oneTime = this.createStoredLockedViewOnce()

    return {
      message: {
        id: messageId,
        conversationId,
        senderId: senderIdentityId,
        senderIdentityId,
        recipientIdentityId: this.identity.id,
        signatureVerified: false,
        encryptedData,
        messageKind: 'view_once',
        oneTime,
        status: 'delivered',
        createdAt: timestamp,
        messageHash: encryptedData.metadata ? createMessageHash(
          encryptedData.metadata.senderId,
          encryptedData.metadata.recipientId,
          encryptedData.metadata.sessionId,
          encryptedData.metadata.sequenceNumber,
          encryptedData.metadata.timestamp,
          encryptedData.ciphertext
        ) : undefined,
      },
      decrypted: {
        id: messageId,
        conversationId,
        senderId: senderIdentityId,
        content: '',
        timestamp,
        signatureVerified: false,
        sequenceNumber: encryptedData.metadata?.sequenceNumber,
        status: 'delivered',
        messageKind: 'view_once',
        oneTime,
      },
    }
  }

  private async decryptIncomingPayload(
    conversationId: string,
    encryptedData: EncryptedMessage,
    senderIdentityId: string,
    authenticatedSenderBundle?: PublicKeyBundle,
  ): Promise<InboundDecryptionResult> {
    if (!this.identity || !this.privateBundle) {
      throw new ChatError('Not initialized', 'NOT_INITIALIZED')
    }

    // Get the sender's ML-DSA-65 public key (legacy bundle field name).
    const senderBundle = authenticatedSenderBundle
      ?? await localChatStorage.getPublicKeyBundle(senderIdentityId)
    if (!senderBundle) {
      throw new ChatError('Sender key bundle not found', 'CONTACT_NOT_FOUND')
    }

    // Verify sender identity trust.
    const tracked = this.trackedIdentities.get(senderIdentityId)
    if (tracked) {
      // Verify the sender's keys match what we have tracked
      if (tracked.currentDilithiumKey !== senderBundle.dilithiumKey) {
        this.emit('security:warning', {
          type: 'key_mismatch',
          details: 'Sender ML-DSA-65 key does not match tracked identity',
          severity: 'critical',
          identityId: senderIdentityId,
          requiresAction: true
        } as SecurityWarningEvent['data'])
        throw new ChatError(
          'Sender key mismatch - potential security issue',
          'KEY_MISMATCH'
        )
      }
      
      // Check if communication is blocked
      if (tracked.trustState === 'blocked') {
        throw new ChatError('Communication blocked with this identity', 'BLOCKED_IDENTITY')
      }
      
      // Warn about changed identity (but allow message)
      if (tracked.trustState === 'changed') {
        this.emit('security:warning', {
          type: 'identity_key_changed',
          details: 'Identity keys have changed since last verified',
          severity: 'high',
          identityId: senderIdentityId,
          requiresAction: true
        } as SecurityWarningEvent['data'])
      }
    }

    let decrypted: DecryptedMessage
    let sessionRecord: SessionRecord | undefined
    let privateKeyBundle: InboundDecryptionResult['privateKeyBundle']
    let publicKeyBundle: InboundDecryptionResult['publicKeyBundle']
    const afterCommitActions: Array<() => Promise<void>> = []
    
    // Check if we have an existing session
    let session = await getActiveSessionByRemoteIdentity(senderIdentityId)
    const previousSessionId = session?.id
    
    // Determine if we should use X3DH data from the message:
    // 1. No session exists - we must establish as responder
    // 2. Session exists but has DIFFERENT fingerprint than incoming message
    //    (concurrent establishment - both parties initiated)
    // 3. Session exists, fingerprints don't match, and we haven't sent any messages yet
    //    (their session should be preferred to avoid asymmetric state)
    //
    // We do NOT use X3DH data if:
    // - Session exists with matching fingerprint (normal case)
    // - We've already received messages on our session (established and working)
    
    const incomingFingerprint = encryptedData.header?.sessionFingerprint
    const sessionFingerprintMatches = session && incomingFingerprint === session.baseKeyFingerprint
    const weHaveReceivedMessages = session?.state.receivedFirstMessage === true
    
    // Check whether our existing session can receive messages.
    // If we created a session as initiator but haven't received anything yet,
    // our receivingHeaderKey will be null and we can't decrypt incoming messages.
    // In this case, we need to use the X3DH data from the incoming message to 
    // create a proper responder session.
    const sessionCanReceive = session?.state.receivingHeaderKey != null || 
                              session?.state.receivingChainKey != null
    
    // Use X3DH data if:
    // 1. No session exists, OR
    // 2. Session exists but fingerprints don't match and we haven't received yet, OR
    // 3. Session exists but cannot receive (was created as initiator, never received)
    const shouldUseX3DHData = encryptedData.x3dhData && (
      !session || 
      (!sessionFingerprintMatches && !weHaveReceivedMessages) ||
      (!sessionCanReceive && !weHaveReceivedMessages)
    )
    
    const innerDecryptSpan = this.startSpan('receive', 'inner_decrypt', {
      hasX3DH: Boolean(encryptedData.x3dhData),
      hasExistingSession: Boolean(session),
    })
    try {
      if (shouldUseX3DHData) {
        // Establish session as responder using the X3DH data from the message
        const result = await establishSessionAndDecrypt(
          this.identity,
          this.privateBundle,
          encryptedData,
          senderIdentityId,
          senderBundle,
        )
        session = result.session
        decrypted = result.decrypted
        sessionRecord = result.sessionRecord
        if (result.publicBundle) {
          privateKeyBundle = {
            identityId: this.identity.id,
            bundle: result.privateBundle,
          }
          publicKeyBundle = {
            identityId: this.identity.id,
            bundle: result.publicBundle,
          }
        }
        afterCommitActions.push(async () => {
          this.privateBundle = result.privateBundle
          this.emit('session:established', {
            session: result.session,
            isInitiator: false,
            fingerprint: result.session.baseKeyFingerprint,
          })
          if (previousSessionId && previousSessionId !== result.session.id) {
            this.emit('session:switched', {
              previousSessionId,
              newSessionId: result.session.id,
              reason: 'incoming_x3dh',
            })
          }
          void this.checkAndReplenishServerOPKs().catch(() => {})
        })
      } else if (!session) {
        throw new SessionError('No session found for sender and message has no X3DH data')
      } else {
        // Session exists - try normal decryption with fallback
        // This handles out-of-order messages and archived sessions
        try {
          let fallbackSessionPromoted = false
          let fallbackPreviousStatus: 'inactive' | 'archived' | null = null
          const sessionModule = await import('./session')
          const {
            decrypted: msg,
            session: usedSession,
            usedFallback,
            sessionPromotable,
          } = await sessionModule.decryptWithSessionFallback(
            senderIdentityId,
            encryptedData,
            senderBundle.dilithiumKey
          )
          decrypted = msg
          session = usedSession

          if (usedFallback) {
            const fallbackConversation = await localChatStorage.getConversation(conversationId)
            const promotionDecision = this.shouldPromoteFallbackSession(
              msg,
              fallbackConversation,
            )
            const promotedToActive = sessionPromotable && promotionDecision.shouldPromote

            this.recordDiagnostic('receive', 'fallback_session_selected', {
              conversationId,
              senderIdentityId,
              sessionId: usedSession.id,
              sessionStatus: usedSession.status,
              sessionFingerprint: usedSession.baseKeyFingerprint,
              decryptedSequenceNumber: msg.sequenceNumber,
              expectedSequenceNumber: fallbackConversation?.expectedSequenceNumber,
              promotedToActive,
              promotionDecision: promotionDecision.reason,
            })

            if (promotedToActive) {
              fallbackSessionPromoted = true
              fallbackPreviousStatus = usedSession.status === 'archived' ? 'archived' : 'inactive'
              afterCommitActions.push(async () => {
                await sessionModule.promoteSessionToActive(senderIdentityId, usedSession.id)
                this.emit('session:promoted', {
                  sessionId: usedSession.id,
                  previousStatus: fallbackPreviousStatus ?? 'archived',
                })
              })
              this.recordDiagnostic('receive', 'fallback_session_promoted', {
                conversationId,
                senderIdentityId,
                sessionId: usedSession.id,
                sessionFingerprint: usedSession.baseKeyFingerprint,
                decryptedSequenceNumber: msg.sequenceNumber,
                expectedSequenceNumber: fallbackConversation?.expectedSequenceNumber,
              })
            } else if (sessionPromotable) {
              this.recordDiagnostic('receive', 'fallback_session_promotion_skipped', {
                conversationId,
                senderIdentityId,
                sessionId: usedSession.id,
                sessionFingerprint: usedSession.baseKeyFingerprint,
                decryptedSequenceNumber: msg.sequenceNumber,
                expectedSequenceNumber: fallbackConversation?.expectedSequenceNumber,
                reason: promotionDecision.reason,
              })
            }
          }

          if (fallbackSessionPromoted) {
            this.recordDiagnostic('receive', 'fallback_session_promotion_staged', {
              conversationId,
              senderIdentityId,
              sessionId: session.id,
            })
          }
        } catch (decryptError) {
          if (encryptedData.x3dhData) {
            // Ratchet decryption failed but the message carries fresh X3DH data.
            // This happens when the sender re-established their session (e.g. after
            // deleting the conversation) but we still have the old session.
            const result = await establishSessionAndDecrypt(
              this.identity,
              this.privateBundle,
              encryptedData,
              senderIdentityId,
              senderBundle,
            )
            const supersededSessionId = session?.id
            session = result.session
            decrypted = result.decrypted
            sessionRecord = result.sessionRecord
            if (result.publicBundle) {
              privateKeyBundle = {
                identityId: this.identity.id,
                bundle: result.privateBundle,
              }
              publicKeyBundle = {
                identityId: this.identity.id,
                bundle: result.publicBundle,
              }
            }
            afterCommitActions.push(async () => {
              this.privateBundle = result.privateBundle
              if (supersededSessionId) {
                await archiveSession(supersededSessionId, 'superseded')
              }
              this.emit('session:established', {
                session: result.session,
                isInitiator: false,
                fingerprint: result.session.baseKeyFingerprint,
              })
              if (previousSessionId && previousSessionId !== result.session.id) {
                this.emit('session:switched', {
                  previousSessionId,
                  newSessionId: result.session.id,
                  reason: 'decryption_fallback_x3dh',
                })
              }
              void this.checkAndReplenishServerOPKs().catch(() => {})
            })
          } else {
            throw decryptError
          }
        }
      }
    } catch (error) {
      if (error instanceof ReplayError) {
        this.recordDiagnostic('receive', 'inbound_replay_detected', {
          conversationId,
          senderIdentityId,
          messageId: encryptedData.metadata?.messageId,
        })
      }
      throw error
    } finally {
      innerDecryptSpan.end()
    }

    decrypted.conversationId = conversationId
    decrypted.status = 'delivered'
    if (!session) {
      throw new SessionError('Inbound decryption did not select a session')
    }

    return {
      decrypted,
      session,
      sessionRecord,
      privateKeyBundle,
      publicKeyBundle,
      afterCommit: afterCommitActions.length > 0
        ? async () => {
          for (const action of afterCommitActions) {
            await action()
          }
        }
        : undefined,
    }
  }

  private async storeDeferredViewOnceMessage(
    conversationId: string,
    encryptedData: EncryptedMessage,
    senderIdentityId: string,
    options: { emitReceivedEvent?: boolean } = {},
  ): Promise<DecryptedMessage> {
    const existingId = encryptedData.metadata?.messageId
    let existingMessage: Message | null = null
    if (existingId) {
      existingMessage = await localChatStorage.getMessage(existingId)
      if (existingMessage) {
        const existingDecrypted = await localChatStorage.getDecryptedMessage(existingId)
        if (existingDecrypted) {
          return existingDecrypted
        }
      }
    }

    const { message, decrypted } = this.buildStoredViewOncePlaceholder(
      conversationId,
      encryptedData,
      senderIdentityId,
    )

    if (!existingMessage) {
      await localChatStorage.updateConversation(conversationId, {
        unreadProjectionDirty: true,
      })
    }
    await localChatStorage.storeMessage(message)
    await localChatStorage.storeDecryptedMessage(decrypted)
    if (!existingMessage) {
      await localChatStorage.updateConversation(conversationId, {
        unreadProjectionDirty: true,
        hasVisibleActivity: true,
        lastMessage: {
          content: VIEW_ONCE_PREVIEW_TEXT,
          timestamp: decrypted.timestamp,
          senderId: senderIdentityId,
        },
      })
    }

    if (!existingMessage && options.emitReceivedEvent !== false) {
      const updatedConversation = await localChatStorage.getConversation(conversationId)
      this.emit('message:received', {
        message: decrypted,
        conversation: updatedConversation,
      })
    }

    return decrypted
  }

  async receiveDeferredViewOnceMessage(
    conversationId: string,
    encryptedData: EncryptedMessage,
    senderIdentityId: string,
  ): Promise<DecryptedMessage> {
    return this.storeDeferredViewOnceMessage(conversationId, encryptedData, senderIdentityId)
  }

  async revealStoredViewOnceMessage(messageId: string): Promise<DecryptedMessage> {
    const stored = await localChatStorage.getMessage(messageId)
    if (!stored || stored.messageKind !== 'view_once') {
      throw new ChatError('View-once message not found', 'MESSAGE_NOT_FOUND')
    }
    if (stored.oneTime?.state === 'consumed' || !stored.encryptedData.ciphertext) {
      throw new ChatError('This view-once message is no longer available', 'MESSAGE_NOT_FOUND')
    }

    const inbound = await this.decryptIncomingPayload(
      stored.conversationId,
      stored.encryptedData,
      stored.senderIdentityId,
    )
    const metadata = stored.encryptedData.metadata
    const conversation = await localChatStorage.getConversation(stored.conversationId)
    if (!metadata || !conversation) {
      throw new ChatError('View-once message is not available for inbound commit', 'MESSAGE_NOT_FOUND')
    }
    const conversationUpdate: Partial<Conversation> = {
      expectedSequenceNumber: inbound.decrypted.sequenceNumber === undefined
        ? conversation.expectedSequenceNumber
        : Math.max(conversation.expectedSequenceNumber, inbound.decrypted.sequenceNumber + 1),
    }
    const revealed = {
      ...inbound.decrypted,
      conversationId: stored.conversationId,
      messageKind: 'view_once' as const,
      oneTime: stored.oneTime,
    }
    const commitInboundMessage = (localChatStorage as {
      commitInboundMessage?: typeof localChatStorage.commitInboundMessage
    }).commitInboundMessage
    if (typeof commitInboundMessage !== 'function') {
      await localChatStorage.updateConversation(stored.conversationId, conversationUpdate)
      return revealed
    }
    await commitInboundMessage.call(localChatStorage, {
      session: inbound.session,
      sessionRecord: inbound.sessionRecord,
      privateKeyBundle: inbound.privateKeyBundle,
      publicKeyBundle: inbound.publicKeyBundle,
      processedMessage: {
        messageId: metadata.messageId,
        sessionId: inbound.session.id,
        processedAt: now(),
        messageHash: createMessageHash(
          metadata.senderId,
          metadata.recipientId,
          inbound.session.id,
          metadata.sequenceNumber,
          metadata.timestamp,
          stored.encryptedData.ciphertext,
        ),
      },
      message: stored,
      decryptedMessage: revealed,
      conversationUpdate,
    })
    await inbound.afterCommit?.()
    return revealed
  }

  async receiveMessage(
    conversationId: string,
    encryptedData: EncryptedMessage,
    senderIdentityId: string,
    options: {
      emitReceivedEvent?: boolean
      messageKind?: RelayMessageKind
      schedulingPriority?: 'realtime' | 'background'
      authenticatedSenderBundle?: PublicKeyBundle
      relayMessageId?: string
      serverSequence?: number
    } = {},
  ): Promise<DecryptedMessage> {
    if (!this.identity) {
      throw new ChatError('Not initialized', 'NOT_INITIALIZED')
    }

    const decoded = await this.decryptIncomingPayload(
      conversationId,
      encryptedData,
      senderIdentityId,
      options.authenticatedSenderBundle,
    )
    const inbound = (
      decoded
      && typeof decoded === 'object'
      && 'decrypted' in decoded
      && 'session' in decoded
    )
      ? decoded as InboundDecryptionResult
      : null
    const decrypted = inbound
      ? inbound.decrypted
      : decoded as unknown as DecryptedMessage
    await this.maybeYieldToHost(
      'message_store',
      0,
      1,
      options.schedulingPriority ?? 'realtime',
    )
    const storageStartedAt = Date.now()

    const existingMessage = await localChatStorage.getMessage(decrypted.id)
    const isViewOnce = this.isViewOnceEnvelopeContent(decrypted.content)
    const messageKind = isViewOnce ? 'view_once' : options.messageKind
    const oneTime = isViewOnce ? this.createStoredLockedViewOnce() : undefined
    const storedDecrypted: DecryptedMessage = isViewOnce
      ? {
          ...decrypted,
          content: '',
          messageKind: 'view_once',
          oneTime,
        }
      : {
          ...decrypted,
          messageKind,
        }
    if (options.relayMessageId) {
      storedDecrypted.relayMessageId = options.relayMessageId
      storedDecrypted.serverSequence = options.serverSequence
    }

    const message: Message = {
      id: decrypted.id,
      conversationId,
      senderId: senderIdentityId,
      senderIdentityId,
      recipientIdentityId: this.identity.id,
      signatureVerified: decrypted.signatureVerified,
      encryptedData,
      content: isViewOnce ? undefined : decrypted.content,
      messageKind,
      oneTime,
      status: 'delivered',
      createdAt: decrypted.timestamp,
      relayMessageId: options.relayMessageId,
      messageHash: encryptedData.metadata ? createMessageHash(
        encryptedData.metadata.senderId,
        encryptedData.metadata.recipientId,
        encryptedData.metadata.sessionId,
        encryptedData.metadata.sequenceNumber,
        encryptedData.metadata.timestamp,
        encryptedData.ciphertext
      ) : undefined
    }
    const conversation = await localChatStorage.getConversation(conversationId)
    if (!conversation) {
      throw new ChatError('Conversation is not available for inbound commit', 'CONVERSATION_NOT_FOUND')
    }
    const conversationUpdate: Partial<Conversation> = {}
    if (decrypted.sequenceNumber !== undefined) {
      if (decrypted.sequenceNumber < conversation.expectedSequenceNumber) {
        this.emit('security:warning', {
          type: 'session_desync',
          details: `Received message with sequence ${decrypted.sequenceNumber}, expected ${conversation.expectedSequenceNumber}`,
          severity: 'medium',
        } as SecurityWarningEvent['data'])
      }
      conversationUpdate.expectedSequenceNumber = Math.max(
        conversation.expectedSequenceNumber,
        decrypted.sequenceNumber + 1,
      )
    }
    if (!existingMessage && messageKind !== 'hidden_control') {
      conversationUpdate.unreadProjectionDirty = true
      conversationUpdate.hasVisibleActivity = true
      conversationUpdate.lastMessage = {
        content: isViewOnce ? VIEW_ONCE_PREVIEW_TEXT : decrypted.content.substring(0, 100),
        timestamp: decrypted.timestamp,
        senderId: senderIdentityId,
      }
    } else if (!existingMessage) {
      conversationUpdate.unreadProjectionDirty = true
    }
    const commitInboundMessage = (localChatStorage as {
      commitInboundMessage?: typeof localChatStorage.commitInboundMessage
    }).commitInboundMessage
    if (inbound && typeof commitInboundMessage === 'function') {
      const metadata = encryptedData.metadata
      if (!metadata) {
        throw new ChatError('Inbound message metadata is required for commit', 'INVALID_MESSAGE')
      }
      const processedMessage: ProcessedMessageRecord = {
        messageId: metadata.messageId,
        sessionId: inbound.session.id,
        processedAt: now(),
        messageHash: createMessageHash(
          metadata.senderId,
          metadata.recipientId,
          inbound.session.id,
          metadata.sequenceNumber,
          metadata.timestamp,
          encryptedData.ciphertext,
        ),
      }
      await commitInboundMessage.call(localChatStorage, {
        session: inbound.session,
        sessionRecord: inbound.sessionRecord,
        privateKeyBundle: inbound.privateKeyBundle,
        publicKeyBundle: inbound.publicKeyBundle,
        processedMessage,
        message,
        decryptedMessage: storedDecrypted,
        conversationUpdate,
      })
      if (inbound.afterCommit) {
        try {
          await inbound.afterCommit()
        } catch (error) {
          this.recordDiagnostic('receive', 'inbound_post_commit_failed', {
            messageId: decrypted.id,
            ...this.getErrorDiagnosticFields(error),
          })
        }
      }
    } else {
      await localChatStorage.storeMessage(message)
      await localChatStorage.storeDecryptedMessage(storedDecrypted)
      if (Object.keys(conversationUpdate).length > 0) {
        await localChatStorage.updateConversation(conversationId, conversationUpdate)
      }
    }

    if (!existingMessage && options.emitReceivedEvent !== false) {
      const updatedConversation = await localChatStorage.getConversation(conversationId)
      this.emit('message:received', {
        message: storedDecrypted,
        conversation: updatedConversation,
        authenticatedSenderBundle: options.authenticatedSenderBundle,
      })
    }

    this.recordLatency(
      'receive',
      'store_decrypted_message',
      Date.now() - storageStartedAt,
      { created: !existingMessage },
    )
    return storedDecrypted
  }

  private sealedRelayTombstoneId(relayMessageId: string): string | null {
    const identityId = this.identity?.id
    return identityId ? `relay:${identityId}:${relayMessageId}` : null
  }

  private async rememberAuthenticatedSealedRelay(relayMessageId: string): Promise<void> {
    const messageId = this.sealedRelayTombstoneId(relayMessageId)
    const identityId = this.identity?.id
    if (!messageId || !identityId) return
    try {
      await localChatStorage.storeProcessedMessage({
        messageId,
        sessionId: identityId,
        processedAt: now(),
        messageHash: relayMessageId,
      })
    } catch (error) {
      this.recordDiagnostic('poll', 'relay_overlap_tombstone_failed', {
        relayId: relayMessageId,
        ...this.getErrorDiagnosticFields(error),
      })
    }
  }

  private async hasAuthenticatedRelayTombstone(relayMessageId: string): Promise<boolean> {
    const messageId = this.sealedRelayTombstoneId(relayMessageId)
    if (!messageId) return false
    try {
      return await localChatStorage.isMessageProcessed(messageId)
    } catch (error) {
      this.recordDiagnostic('poll', 'relay_overlap_tombstone_lookup_failed', {
        relayId: relayMessageId,
        ...this.getErrorDiagnosticFields(error),
      })
      return false
    }
  }

  private async trySkipAuthenticatedSealedRelay(
    sealed: { id: string; serverSequence: number; deliveryClass: string },
    fetchResult: PendingMessageFetchResult,
  ): Promise<boolean> {
    const identityId = this.identity?.id
    if (!identityId) return false
    try {
      const linkedMessage = await localChatStorage.getMessageByRelayId(sealed.id)
      const authenticatedLocal = (
        linkedMessage?.relayMessageId === sealed.id
        && linkedMessage.recipientIdentityId === identityId
      )
      if (!authenticatedLocal) {
        if (!await this.hasAuthenticatedRelayTombstone(sealed.id)) {
          return false
        }
      } else {
        await this.rememberAuthenticatedSealedRelay(sealed.id)
      }
      fetchResult.highestSeenSequence = Math.max(
        fetchResult.highestSeenSequence,
        sealed.serverSequence,
      )
      fetchResult.advanceSequence = Math.max(
        fetchResult.advanceSequence,
        sealed.serverSequence,
      )
      if (sealed.deliveryClass !== 'control') {
        await this.acknowledgeAuthenticatedMessageRelay(sealed.id, linkedMessage?.status)
      }
      this.scheduleRelayDeletion(sealed.id, 0)
      this.recordDiagnostic('poll', 'relay_overlap_skipped', {
        relayId: sealed.id,
        serverSequence: sealed.serverSequence,
        deliveryClass: sealed.deliveryClass,
      })
      return true
    } catch (overlapLookupError) {
      this.recordDiagnostic('poll', 'relay_overlap_lookup_failed', {
        relayId: sealed.id,
        serverSequence: sealed.serverSequence,
        ...this.getErrorDiagnosticFields(overlapLookupError),
      })
      return false
    }
  }

  private async fetchInboundSealedRelayRows(
    afterSequence: number | undefined,
    options: PendingMessageFetchOptions,
  ): Promise<SealedRelayedMessage[]> {
    if (options.skipRelayHttp) {
      return filterPrefetchedSealedRelayRows(options.prefetchedRows, afterSequence)
    }

    throwIfPendingFetchCancelled(options.signal)
    const scopeStartedAt = Date.now()
    try {
      await ensureInboundMailboxScopes({
        identity: this.identity!,
        storage: localChatStorage,
        localScopeMode: 'all',
        registerScope: (scope) => this.registerMailboxScope(scope),
        registrationUrgency: 'required',
        nowMs: now,
      })
    } catch (error) {
      this.recordDiagnostic('poll', 'mailbox_scope_registration_deferred', {
        ...this.getErrorDiagnosticFields(error),
      })
    }
    this.recordLatency('receive', 'mailbox_scope_ensure', Date.now() - scopeStartedAt, {
      afterSequence: afterSequence ?? -1,
    })

    throwIfPendingFetchCancelled(options.signal)
    const httpStartedAt = Date.now()
    const rowsPromise = options.signal
      ? this.bundleServer!.fetchOwnedSealedMessages(afterSequence, options.signal)
      : this.bundleServer!.fetchOwnedSealedMessages(afterSequence)
    this.scheduleMailboxScopeRefresh()
    const rows = await rowsPromise
    this.recordLatency('receive', 'mailbox_http_get', Date.now() - httpStartedAt, {
      afterSequence: afterSequence ?? -1,
      rowCount: rows.length,
    })
    throwIfPendingFetchCancelled(options.signal)
    return [...rows].sort((a, b) => (a.serverSequence || 0) - (b.serverSequence || 0))
  }

  private recordSealedRelayOpenFailure(
    sealed: SealedRelayedMessage,
    sealedOpenError: unknown,
    context: RelayProcessingContext,
  ): void {
    if (sealed.serverSequence > 0) {
      context.fetchResult.highestSeenSequence = Math.max(
        context.fetchResult.highestSeenSequence,
        sealed.serverSequence,
      )
      if (sealedOpenError instanceof ReplayError) {
        context.fetchResult.advanceSequence = Math.max(
          context.fetchResult.advanceSequence,
          sealed.serverSequence,
        )
        context.fetchResult.quarantinedCount += 1
        this.scheduleRelayDeletion(sealed.id, 0)
      } else {
        context.firstOpenFailureSequence = context.firstOpenFailureSequence === null
          ? sealed.serverSequence
          : Math.min(context.firstOpenFailureSequence, sealed.serverSequence)
        context.fetchResult.blockedCount += 1
      }
    }
    this.recordDiagnostic('poll', 'sealed_relay_open_failed', {
      relayId: sealed.id,
      deliveryClass: sealed.deliveryClass,
      serverSequence: sealed.serverSequence,
      scopedMailbox: sealed.recipientMailboxToken.startsWith('smbx2.'),
      ...this.getErrorDiagnosticFields(sealedOpenError),
    })
  }

  private async processInboundSealedRelayRows(
    rows: SealedRelayedMessage[],
    context: RelayProcessingContext,
  ): Promise<void> {
    const openedEnvelopeNonces = new Set<string>()
    const observedMailboxTokens = new Set(context.fetchResult.mailboxTokens ?? [])
    const observedMailboxSequences = context.fetchResult.mailboxSequences ?? new Map<string, number>()
    let overlapSkippedCount = 0
    let openedCount = 0
    let failedCount = 0
    let cursorBlocked = false
    const sealedOpenSpan = this.startSpan('receive', 'sealed_open_batch', {
      rowCount: rows.length,
    })
    let decryptSpan: TelemetrySpan | null = null

    try {
      for (let index = 0; index < rows.length; index += 1) {
        throwIfPendingFetchCancelled(context.options.signal)
        const sealed = rows[index]
        if (Number.isSafeInteger(sealed.serverSequence) && sealed.serverSequence > 0) {
          observedMailboxSequences.set(
            sealed.recipientMailboxToken,
            Math.max(
              observedMailboxSequences.get(sealed.recipientMailboxToken) ?? 0,
              sealed.serverSequence,
            ),
          )
        }
        observedMailboxTokens.add(sealed.recipientMailboxToken)

        const rowStartedAt = Date.now()
        let yieldStage: CooperativeYieldStage = 'sealed_open'
        if (await this.trySkipAuthenticatedSealedRelay(sealed, context.fetchResult)) {
          overlapSkippedCount += 1
          if (index === 0) {
            this.recordLatency('receive', 'first_row_overlap_skip', Date.now() - rowStartedAt, {
              serverSequence: sealed.serverSequence || 0,
            })
          }
        } else {
          let opened: OpenedRelayedMessage | null = null
          try {
            const candidate = await this.openSealedRelayMessage(sealed)
            if (candidate.sealedEnvelopeNonce) {
              if (openedEnvelopeNonces.has(candidate.sealedEnvelopeNonce)) {
                throw new ReplayError('Sealed envelope replay detected')
              }
              openedEnvelopeNonces.add(candidate.sealedEnvelopeNonce)
            }
            opened = candidate
          } catch (sealedOpenError) {
            failedCount += 1
            this.recordSealedRelayOpenFailure(sealed, sealedOpenError, context)
          }
          if (opened) {
            openedCount += 1
            context.fetchResult.pendingCount = openedCount
            if (!decryptSpan) {
              decryptSpan = this.startSpan('receive', 'decrypt_batch', {
                messageCount: rows.length - overlapSkippedCount - failedCount,
              })
            }
            const outcome = await this.processOpenedRelayMessage(opened, context)
            cursorBlocked = this.commitRelayProcessOutcome(outcome, context, cursorBlocked)
            yieldStage = 'message_decrypt'
            if (index === 0) {
              this.recordLatency('receive', 'first_row_open_decrypt', Date.now() - rowStartedAt, {
                serverSequence: sealed.serverSequence || 0,
                decrypted: Boolean(outcome.decrypted),
              })
            }
          }
        }

        if (index + 1 < rows.length) {
          await this.maybeYieldToHost(yieldStage, index + 1, rows.length, 'realtime')
        }
      }
    } finally {
      sealedOpenSpan.end({
        openedCount,
        failedCount,
        overlapSkippedCount,
      })
      decryptSpan?.end({ processedCount: openedCount })
      context.fetchResult.mailboxTokens = Array.from(observedMailboxTokens)
      context.fetchResult.mailboxSequences = observedMailboxSequences
    }
  }

  private commitRelayProcessOutcome(
    outcome: RelayProcessOutcome,
    context: RelayProcessingContext,
    cursorBlocked: boolean,
  ): boolean {
    const { fetchResult, processedMessages, firstOpenFailureSequence, options } = context
    const relayedMsg = outcome.relayedMsg
    const relaySequence = relayedMsg.serverSequence || 0
    fetchResult.highestSeenSequence = Math.max(fetchResult.highestSeenSequence, relaySequence)
    fetchResult.quarantinedCount += outcome.quarantinedCount
    const decrypted = outcome.decrypted
      ? {
          ...outcome.decrypted,
          authenticatedSenderBundle: outcome.authenticatedSenderBundle,
        }
      : null
    if (decrypted) {
      if (processedMessages.length === 0) {
        this.recordLatency('receive', 'first_decrypt', Date.now() - context.fetchStartedAt, {
          serverSequence: relaySequence,
        })
        this.recordDiagnostic('catchup', 'first_decrypt', {
          elapsedMs: Date.now() - context.fetchStartedAt,
          serverSequence: relaySequence,
        })
      }
      processedMessages.push(decrypted)
    }
    let nextBlocked = cursorBlocked
    if (!cursorBlocked && relaySequence > 0) {
      if (firstOpenFailureSequence !== null && relaySequence >= firstOpenFailureSequence) {
        this.recordDiagnostic('poll', 'relay_cursor_blocked_by_sealed_open_failure', {
          ...this.getRelayDiagnosticFields(relayedMsg),
          blockedSequence: firstOpenFailureSequence,
          advanceCursor: outcome.advanceCursor,
          advanceSequence: fetchResult.advanceSequence,
          blockedCount: fetchResult.blockedCount,
          quarantinedCount: fetchResult.quarantinedCount,
        })
      } else if (outcome.advanceCursor) {
        fetchResult.advanceSequence = Math.max(fetchResult.advanceSequence, relaySequence)
        this.recordDiagnostic('poll', 'relay_cursor_update', {
          ...this.getRelayDiagnosticFields(relayedMsg),
          advanceCursor: outcome.advanceCursor,
          advanceSequence: fetchResult.advanceSequence,
          blockedCount: fetchResult.blockedCount,
          quarantinedCount: fetchResult.quarantinedCount,
        })
      } else {
        nextBlocked = true
        fetchResult.blockedCount += outcome.blockedCount || 1
        this.recordDiagnostic('poll', 'relay_cursor_update', {
          ...this.getRelayDiagnosticFields(relayedMsg),
          advanceCursor: outcome.advanceCursor,
          advanceSequence: fetchResult.advanceSequence,
          blockedCount: fetchResult.blockedCount,
          quarantinedCount: fetchResult.quarantinedCount,
        })
      }
    }
    if (decrypted && options.onDecryptedMessage) {
      try {
        void Promise.resolve(options.onDecryptedMessage(decrypted, {
          advanceSequence: fetchResult.advanceSequence,
        })).catch((error) => {
          this.recordDiagnostic('poll', 'relay_decrypted_projection_failed', {
            ...this.getRelayDiagnosticFields(relayedMsg),
            messageId: decrypted.id,
            ...this.getErrorDiagnosticFields(error),
          })
        })
      } catch (error) {
        this.recordDiagnostic('poll', 'relay_decrypted_projection_failed', {
          ...this.getRelayDiagnosticFields(relayedMsg),
          messageId: decrypted.id,
          ...this.getErrorDiagnosticFields(error),
        })
      }
    }
    return nextBlocked
  }

  private async processOpenedRelayMessage(
    relayedMsg: OpenedRelayedMessage,
    context: RelayProcessingContext,
  ): Promise<RelayProcessOutcome> {
    const { options, senderBundleCache, inboundConversationCache, trackedSendersThisBatch, scopeOfferSendersThisBatch } = context
    const baseOutcome: RelayProcessOutcome = {
      relayedMsg,
      advanceCursor: true,
      quarantinedCount: 0,
      blockedCount: 0,
    }

    const queuedRepairDecision = await this.getPendingRelayRepairDecision(relayedMsg)
    if (queuedRepairDecision) {
      if (queuedRepairDecision.allowRelayCleanup) {
        this.acceptSealedRelayReplayNonce(relayedMsg)
        this.scheduleRelayDeletion(relayedMsg.id, 0)
      }
      this.recordDiagnostic('repair', 'relay_quarantined', {
        ...this.getRelayDiagnosticFields(relayedMsg),
        messageId: relayedMsg.encryptedData.metadata?.messageId,
        repairAction: queuedRepairDecision.action,
        outcome: queuedRepairDecision.kind,
        advanceCursor: queuedRepairDecision.advanceCursor,
        allowRelayCleanup: queuedRepairDecision.allowRelayCleanup,
        failureReason: queuedRepairDecision.failureReason,
      })
      return {
        ...baseOutcome,
        advanceCursor: queuedRepairDecision.advanceCursor,
        quarantinedCount: 1,
        blockedCount: queuedRepairDecision.advanceCursor ? 0 : 1,
      }
    }

    try {
      const cachedSenderBundle = !relayedMsg.senderBundle
        ? senderBundleCache.get(relayedMsg.senderIdentityId)
        : undefined
      const senderBundleStartedAt = Date.now()
      const preparedBundle = cachedSenderBundle !== undefined
        ? cachedSenderBundle
        : await this.prepareSenderBundleForDecrypt(relayedMsg)
      this.recordLatency(
        'receive',
        'sender_bundle_prepare',
        Date.now() - senderBundleStartedAt,
        {
          cached: cachedSenderBundle !== undefined,
          attached: Boolean(relayedMsg.senderBundle),
        },
      )
      if (!relayedMsg.senderBundle) {
        senderBundleCache.set(relayedMsg.senderIdentityId, preparedBundle)
      }
      if (!preparedBundle) {
        throw new ChatError('Sender key bundle not found', 'CONTACT_NOT_FOUND')
      }

      const conversationResolveStartedAt = Date.now()
      let conversation: Conversation | null | undefined = inboundConversationCache.get(relayedMsg.senderIdentityId)
      const conversationCacheHit = Boolean(conversation)
      if (!conversation) {
        conversation = await localChatStorage.getConversationByParticipants(
          this.identity!.id,
          relayedMsg.senderIdentityId
        )

        if (!conversation) {
          conversation = await this.getOrCreateInboundConversation(relayedMsg.senderIdentityId)
        }
        inboundConversationCache.set(relayedMsg.senderIdentityId, conversation)
      }
      this.recordLatency(
        'receive',
        'conversation_resolve',
        Date.now() - conversationResolveStartedAt,
        { cached: conversationCacheHit },
      )
      const conversationId = conversation.id

      const decryptStartedAt = Date.now()
      const decrypted = relayedMsg.messageKind === 'view_once'
        ? await this.storeDeferredViewOnceMessage(
            conversationId,
            relayedMsg.encryptedData,
            relayedMsg.senderIdentityId,
            { emitReceivedEvent: false },
          )
        : await this.receiveMessage(
            conversationId,
            relayedMsg.encryptedData,
            relayedMsg.senderIdentityId,
            {
              emitReceivedEvent: false,
              schedulingPriority: 'realtime',
              authenticatedSenderBundle: preparedBundle,
              ...(relayedMsg.messageKind
                ? { messageKind: relayedMsg.messageKind }
                : {}),
              relayMessageId: relayedMsg.id,
              serverSequence: relayedMsg.serverSequence,
            },
          )
      decrypted.relayMessageId = relayedMsg.id
      decrypted.serverSequence = relayedMsg.serverSequence
      this.recordLatency(
        'receive',
        relayedMsg.messageKind === 'view_once' ? 'defer_view_once_to_store' : 'decrypt_to_store',
        Date.now() - decryptStartedAt,
        {
          messageId: decrypted.id,
          senderIdentityId: relayedMsg.senderIdentityId,
        },
      )
      const linkedProjection = await localChatStorage.getMessageByRelayId(relayedMsg.id)
      if (!linkedProjection) {
        await this.linkLocalMessageToRelay(decrypted.id, relayedMsg.id)
      }

      const shouldTrackSender = relayedMsg.messageKind !== 'view_once'
        && !trackedSendersThisBatch.has(relayedMsg.senderIdentityId)
      if (shouldTrackSender) {
        trackedSendersThisBatch.add(relayedMsg.senderIdentityId)
      }
      const shouldResolveRetryRecord = relayedMsg.messageKind !== 'view_once'

      if (options.fastPath) {
        this.schedulePostDecryptBookkeeping({
          relayedMsg,
          decrypted,
          senderBundle: preparedBundle,
          trackSender: shouldTrackSender,
          resolveRetryRecord: shouldResolveRetryRecord,
        })
      } else {
        if (shouldTrackSender) {
          await this.trackSenderAfterDecrypt(relayedMsg.senderIdentityId, preparedBundle)
        }

        if (shouldResolveRetryRecord) {
          await this.resolveRetryRequestRecord(
            relayedMsg.encryptedData.metadata?.messageId || relayedMsg.id,
            relayedMsg.senderIdentityId,
            'message_decrypted',
            relayedMsg.id,
          )
        }
      }

      this.acceptSealedRelayReplayNonce(relayedMsg)

      this.recordLatency('receive', 'relay_queue_age', Math.max(0, Date.now() - relayedMsg.createdAt), {
        messageId: decrypted.id,
        senderIdentityId: relayedMsg.senderIdentityId,
        serverSequence: relayedMsg.serverSequence,
      })
      if (!scopeOfferSendersThisBatch.has(relayedMsg.senderIdentityId)) {
        scopeOfferSendersThisBatch.add(relayedMsg.senderIdentityId)
        void this.maybeOfferMailboxScope(relayedMsg.senderIdentityId, relayedMsg.senderBundle)
          .catch((scopeError) => {
            this.recordDiagnostic('control', 'mailbox_scope_offer_failed', {
              ...this.getRelayDiagnosticFields(relayedMsg),
              ...this.getErrorDiagnosticFields(scopeError),
            })
          })
      }
      this.queueRelayedMessageFollowUps(relayedMsg, decrypted)
      await this.rememberAuthenticatedSealedRelay(relayedMsg.id)

      return {
        ...baseOutcome,
        decrypted,
        authenticatedSenderBundle: preparedBundle,
      }
    } catch (msgError) {
      if (msgError instanceof ReplayError) {
        if (await this.hasRecoverableRelayProjection(relayedMsg.id)) {
          this.recordDiagnostic('receive', 'relay_duplicate', {
            ...this.getRelayDiagnosticFields(relayedMsg),
            messageId: relayedMsg.encryptedData.metadata?.messageId,
          })
          this.acceptSealedRelayReplayNonce(relayedMsg)
          await this.acknowledgeAuthenticatedMessageRelay(relayedMsg.id)
          this.scheduleRelayDeletion(relayedMsg.id, 0)
          await this.rememberAuthenticatedSealedRelay(relayedMsg.id)
          this.emit('message:duplicate', {
            messageId: relayedMsg.encryptedData.metadata?.messageId,
            senderId: relayedMsg.senderIdentityId,
          })
          return baseOutcome
        }

        const originalMessageId = relayedMsg.encryptedData.metadata?.messageId || relayedMsg.id
        if (await localChatStorage.isMessageProcessed(originalMessageId)) {
          this.recordDiagnostic('receive', 'relay_duplicate', {
            ...this.getRelayDiagnosticFields(relayedMsg),
            messageId: originalMessageId,
          })
          this.acceptSealedRelayReplayNonce(relayedMsg)
          await this.acknowledgeAuthenticatedMessageRelay(relayedMsg.id)
          this.scheduleRelayDeletion(relayedMsg.id, 0)
          await this.rememberAuthenticatedSealedRelay(relayedMsg.id)
          this.emit('message:duplicate', {
            messageId: originalMessageId,
            senderId: relayedMsg.senderIdentityId,
          })
          return baseOutcome
        }

        const repairDecision = relayedMsg.messageKind === 'hidden_control'
          ? this.createHiddenControlSkipDecision('message_retry')
          : await this.attemptRelayRepair(
            'message_retry',
            originalMessageId,
            relayedMsg.senderIdentityId,
            relayedMsg.id,
            relayedMsg.serverSequence,
          )
        this.recordDiagnostic('repair', 'relay_replay_without_projection', {
          ...this.getRelayDiagnosticFields(relayedMsg),
          messageId: originalMessageId,
          outcome: repairDecision.kind,
          advanceCursor: repairDecision.advanceCursor,
          repairRequested: repairDecision.repairRequested,
          failureReason: repairDecision.failureReason,
        })
        return {
          ...baseOutcome,
          advanceCursor: repairDecision.advanceCursor,
          quarantinedCount: 1,
          blockedCount: repairDecision.advanceCursor ? 0 : 1,
        }
      }

      if (msgError instanceof Error &&
          msgError.message.includes('One-time pre-key') &&
          msgError.message.includes('not found')) {
        const originalMessageId = relayedMsg.encryptedData.metadata?.messageId || relayedMsg.id
        const repairAction: RelayRepairAction = relayedMsg.encryptedData.metadata?.messageId
          ? 'message_retry'
          : 'bundle_refresh'
        const repairDecision = relayedMsg.messageKind === 'hidden_control'
          ? this.createHiddenControlSkipDecision(repairAction)
          : await this.attemptRelayRepair(
            repairAction,
            originalMessageId,
            relayedMsg.senderIdentityId,
            relayedMsg.id,
            relayedMsg.serverSequence,
          )
        this.recordDiagnostic('repair', 'relay_opk_miss', {
          ...this.getRelayDiagnosticFields(relayedMsg),
          messageId: originalMessageId,
          repairAction,
          outcome: repairDecision.kind,
          advanceCursor: repairDecision.advanceCursor,
          allowRelayCleanup: repairDecision.allowRelayCleanup,
          failureReason: repairDecision.failureReason,
          messageKind: relayedMsg.messageKind,
        })

        if (repairDecision.allowRelayCleanup) {
          this.acceptSealedRelayReplayNonce(relayedMsg)
          this.scheduleRelayDeletion(relayedMsg.id, 0)
        } else {
          console.warn(
            '[QuantumChat] Leaving relay pending after OPK miss because repair could not be requested:',
            relayedMsg.id,
            repairDecision.failureReason ?? 'unknown_failure',
          )
        }
        return {
          ...baseOutcome,
          advanceCursor: repairDecision.advanceCursor,
          quarantinedCount: 1,
          blockedCount: repairDecision.advanceCursor ? 0 : 1,
        }
      }

      const errMsg = msgError instanceof Error ? msgError.message : String(msgError)
      const x3dhBootstrapFailure = getX3DHBootstrapFailureDetails(msgError)

      const isTerminal = (
        !relayedMsg.encryptedData.x3dhData ||
        Boolean(x3dhBootstrapFailure)
      ) && this.matchesTerminalMessageError(msgError)

      if (isTerminal) {
        const originalMessageId = relayedMsg.encryptedData.metadata?.messageId || relayedMsg.id
        const repairDecision = relayedMsg.messageKind === 'hidden_control'
          ? this.createHiddenControlSkipDecision('message_retry')
          : await this.attemptRelayRepair(
            'message_retry',
            originalMessageId,
            relayedMsg.senderIdentityId,
            relayedMsg.id,
            relayedMsg.serverSequence,
          )
        this.recordDiagnostic('repair', 'relay_terminal_failure', {
          ...this.getRelayDiagnosticFields(relayedMsg),
          messageId: originalMessageId,
          error: errMsg,
          bootstrapFailure: Boolean(x3dhBootstrapFailure),
          outcome: repairDecision.kind,
          advanceCursor: repairDecision.advanceCursor,
          allowRelayCleanup: repairDecision.allowRelayCleanup,
          failureReason: repairDecision.failureReason,
          messageKind: relayedMsg.messageKind,
        })

        if (repairDecision.shouldEmitUndecryptable) {
          if (x3dhBootstrapFailure) {
            console.warn(
              '[QuantumChat] X3DH bootstrap failed for pending relay',
              relayedMsg.id,
              'from',
              relayedMsg.senderIdentityId,
              'opk',
              x3dhBootstrapFailure.usedOneTimePreKeyId ?? 'none',
              'bundleTimestamp',
              x3dhBootstrapFailure.bundleTimestamp ?? 'none',
              'fingerprint',
              x3dhBootstrapFailure.sessionFingerprint ?? 'none',
            )
          }
          console.warn(
            '[QuantumChat] Encountered permanently undecryptable message',
            relayedMsg.id,
            'from',
            relayedMsg.senderIdentityId,
            ':',
            errMsg
          )
        }

        if (repairDecision.allowRelayCleanup) {
          this.acceptSealedRelayReplayNonce(relayedMsg)
          this.scheduleRelayDeletion(relayedMsg.id, 0)
        } else if (repairDecision.shouldEmitUndecryptable) {
          console.warn(
            '[QuantumChat] Leaving permanently undecryptable relay pending because repair could not be requested:',
            relayedMsg.id,
            repairDecision.failureReason ?? 'unknown_failure',
          )
        }

        if (repairDecision.shouldEmitUndecryptable) {
          this.emit('message:undecryptable', {
            messageId: originalMessageId,
            senderId: relayedMsg.senderIdentityId,
            error: errMsg,
            retryRequested: repairDecision.repairRequested,
            repairOutcome: repairDecision.kind,
            repairFailureReason: repairDecision.failureReason,
            bootstrapFailure: Boolean(x3dhBootstrapFailure),
          })
        }
        return {
          ...baseOutcome,
          advanceCursor: repairDecision.advanceCursor,
          quarantinedCount: 1,
          blockedCount: repairDecision.advanceCursor ? 0 : 1,
        }
      }

      console.error(
        '[QuantumChat] Failed to process message',
        relayedMsg.id,
        'from',
        relayedMsg.senderIdentityId,
        ':',
        errMsg
      )
      this.recordDiagnostic('receive', 'relay_process_failed', {
        ...this.getRelayDiagnosticFields(relayedMsg),
        messageId: relayedMsg.encryptedData.metadata?.messageId,
        error: errMsg,
      })
      this.emit('message:decryption_failed', {
        messageId: relayedMsg.id,
        senderId: relayedMsg.senderIdentityId,
        error: errMsg
      })
      return {
        ...baseOutcome,
        advanceCursor: false,
        blockedCount: 1,
      }
    }
  }

  // Server Relay Methods

  /**
   * Fetch and process pending messages from the server relay
   * This should be called periodically (polling) or when a push notification is received
   * 
   * @param afterSequence - Only fetch messages after this server sequence number
   * @returns Decrypted messages plus cursor/quarantine metadata for polling
   */
  async fetchPendingMessages(
    afterSequence?: number,
    options: PendingMessageFetchOptions = {},
  ): Promise<PendingMessageFetchResult> {
    const processedMessages: PendingMessageFetchResult['messages'] = []
    const fetchResult: PendingMessageFetchResult = {
      messages: processedMessages,
      pendingCount: 0,
      highestSeenSequence: afterSequence ?? 0,
      advanceSequence: afterSequence ?? 0,
      quarantinedCount: 0,
      blockedCount: 0,
      mailboxTokens: [],
      mailboxSequences: new Map(),
    }

    if (!this.identity || !this.privateBundle) {
      return fetchResult
    }
    if (!options.skipRelayHttp && !this.bundleServer?.isAvailable()) {
      return fetchResult
    }

    this.activeReceiveOperations++
    const fetchStartedAt = Date.now()
    const fetchPendingSpan = this.startSpan('poll', 'fetch_pending_messages', {
      afterSequence: afterSequence ?? -1,
      torEnabled: this.isTorEnabled(),
    })

    try {
      throwIfPendingFetchCancelled(options.signal)
      this.resetCooperativeYieldClock()
      const senderBundleCache = new Map<string, PublicKeyBundle | null>()
      const inboundConversationCache = new Map<string, Conversation>()
      const trackedSendersThisBatch = new Set<string>()
      const scopeOfferSendersThisBatch = new Set<string>()

      const relayFetchSpan = this.startSpan('receive', 'relay_fetch', {
        afterSequence: afterSequence ?? -1,
        torEnabled: this.isTorEnabled(),
      })
      let inboundRows: SealedRelayedMessage[]
      try {
        inboundRows = await this.fetchInboundSealedRelayRows(afterSequence, options)
      } catch (error) {
        relayFetchSpan.end({ error: true })
        throw error
      }
      relayFetchSpan.end({ rowCount: inboundRows.length })
      if (!options.skipRelayHttp && !options.fastPath) {
        void this.processControlMessages().catch(() => {})
      }
      this.recordDiagnostic('catchup', 'mailbox_rows_ready', {
        afterSequence: afterSequence ?? -1,
        rowCount: inboundRows.length,
        elapsedMs: Date.now() - fetchStartedAt,
        fastPath: Boolean(options.fastPath),
      })
      this.recordDiagnostic('poll', 'relay_batch_received', {
        afterSequence: afterSequence ?? -1,
        rowCount: inboundRows.length,
      })

      if (inboundRows.length > 0) {
        await this.processInboundSealedRelayRows(inboundRows, {
          options,
          senderBundleCache,
          inboundConversationCache,
          trackedSendersThisBatch,
          scopeOfferSendersThisBatch,
          fetchResult,
          processedMessages,
          firstOpenFailureSequence: null,
          fetchStartedAt,
        })
      }

      throwIfPendingFetchCancelled(options.signal)
      if (
        !options.skipRelayHttp
        && (
          fetchResult.pendingCount > 0
          || processedMessages.length > 0
          || !this.isTorEnabled()
        )
      ) {
        void this.flushMailboxVacuum(fetchResult.advanceSequence)
      }

    } catch (error) {
      if (options.signal?.aborted) {
        fetchPendingSpan.end({
          cancelled: true,
          pendingCount: fetchResult.pendingCount,
          processedCount: processedMessages.length,
        })
        throw error
      }
      const errMsg = error instanceof Error ? error.message : String(error)
      this.recordDiagnostic('poll', 'fetch_pending_failed', {
        afterSequence: afterSequence ?? -1,
        error: errMsg,
      })
      if (this.isTorEnabled() && errMsg.includes('Tor is enabled but not connected')) {
        console.log('[QuantumChat] Skipping pending-message fetch until Tor connects')
      } else {
        console.error('[QuantumChat] Error fetching pending messages:', error)
      }
    } finally {
      this.activeReceiveOperations = Math.max(0, this.activeReceiveOperations - 1)
      this.scheduleReceiveMaintenance(RELAY_RECEIPT_FLUSH_DEBOUNCE_MS)
    }

    fetchPendingSpan.end({
      pendingCount: fetchResult.pendingCount,
      processedCount: processedMessages.length,
      advanceSequence: fetchResult.advanceSequence,
      quarantinedCount: fetchResult.quarantinedCount,
      blockedCount: fetchResult.blockedCount,
    })

    return fetchResult
  }

  /**
   * Force-process control messages immediately, bypassing the throttle.
   * Used by the realtime UPDATE subscription to pick up delivery/read
   * receipts as soon as the DB status changes.
   */
  async processControlMessagesNow(): Promise<void> {
    return this.processControlMessages({ force: true })
  }

  private async openSealedControlMessages(rows: SealedRelayedMessage[]): Promise<ControlMessage[]> {
    const identity = this.identity
    if (!identity) return []

    const controlMessages: ControlMessage[] = []
    for (const sealed of rows) {
      if (this.pendingRelayDeletionIds.has(sealed.id)) {
        await this.rememberAuthenticatedSealedRelay(sealed.id)
        continue
      }
      try {
        if (sealed.sealedEnvelope.type !== 'control') {
          throw new ChatError('Expected sealed control envelope', 'INVALID_RELAY_ENVELOPE')
        }
        controlMessages.push((await openControlEnvelope({
          recipient: identity,
          recipientMailboxToken: sealed.recipientMailboxToken,
          envelope: sealed.sealedEnvelope,
          replayCache: this.sealedEnvelopeReplayCache,
        })).controlMessage)
        await this.rememberAuthenticatedSealedRelay(sealed.id)
        this.scheduleRelayDeletion(sealed.id, 0)
      } catch (sealedOpenError) {
        if (sealedOpenError instanceof ReplayError) {
          await this.rememberAuthenticatedSealedRelay(sealed.id)
          this.scheduleRelayDeletion(sealed.id, 0)
          this.recordDiagnostic('control', 'sealed_control_replay', {
            relayId: sealed.id,
            deliveryClass: sealed.deliveryClass,
            serverSequence: sealed.serverSequence,
          })
          continue
        }
        this.recordDiagnostic('control', 'sealed_control_open_failed', {
          relayId: sealed.id,
          deliveryClass: sealed.deliveryClass,
          serverSequence: sealed.serverSequence,
          ...this.getErrorDiagnosticFields(sealedOpenError),
        })
      }
    }

    return controlMessages
  }

  private async fetchOwnedSealedControlMessages(
    bundleServer: BundleServer,
    identity: ChatIdentity,
    force: boolean,
  ): Promise<ControlMessage[]> {
    await ensureInboundMailboxScopes({
      identity,
      storage: localChatStorage,
      localScopeMode: 'all',
      registerScope: (scope) => this.registerMailboxScope(scope),
      registrationUrgency: 'required',
      nowMs: now,
    })

    return await this.openSealedControlMessages(await bundleServer.fetchOwnedSealedControlMessages())
  }

  /**
   * Process pending control messages (receipts, refresh requests, etc.)
   */
  private async processControlMessages(options?: { force?: boolean }): Promise<void> {
    const bundleServer = this.bundleServer
    const identity = this.identity
    if (!bundleServer?.isAvailable() || !identity) return

    if (!options?.force) {
      if (this.controlMessageFetchPromise) {
        return this.controlMessageFetchPromise
      }

      const elapsedSinceLastFetch = Date.now() - this.lastControlMessageFetchAt
      if (elapsedSinceLastFetch < this.getControlMessagePollIntervalMs()) {
        return
      }
    } else if (this.controlMessageFetchPromise) {
      return this.controlMessageFetchPromise
    }

    this.lastControlMessageFetchAt = Date.now()
    this.controlMessageFetchPromise = (async () => {
      const controlFetchSpan = this.startSpan('receive', 'control_message_fetch', {
        torEnabled: this.isTorEnabled(),
      })
      this.recordDiagnostic('control', 'control_processing_start', {
        torEnabled: this.isTorEnabled(),
        forced: Boolean(options?.force),
      })

      try {
        let sealedControlMessages: ControlMessage[] = []
        try {
          sealedControlMessages = await this.fetchOwnedSealedControlMessages(
            bundleServer,
            identity,
            Boolean(options?.force),
          )
        } catch (sealedError) {
          this.recordDiagnostic('control', 'sealed_control_fetch_failed', {
            error: sealedError instanceof Error ? sealedError.message : String(sealedError),
          })
        }
        const controlMessages = sealedControlMessages
        controlFetchSpan.end({ controlCount: controlMessages.length })
        this.recordDiagnostic('control', 'control_processing_batch', {
          controlCount: controlMessages.length,
          forced: Boolean(options?.force),
        })

        for (const ctrlMsg of controlMessages) {
          const replayId = this.getControlMessageReplayId(ctrlMsg)
          if (await localChatStorage.isMessageProcessed(replayId)) {
            this.recordDiagnostic('control', 'control_message_replay_skipped', {
              controlType: ctrlMsg.type,
              referenceMessageId: ctrlMsg.referenceMessageId,
              referenceIdentityId: ctrlMsg.referenceIdentityId,
            })
            continue
          }

          try {
            this.validateControlMessageFreshness(ctrlMsg)
          } catch {
            this.recordDiagnostic('control', 'control_message_rejected', {
              controlType: ctrlMsg.type,
              referenceMessageId: ctrlMsg.referenceMessageId,
              referenceIdentityId: ctrlMsg.referenceIdentityId,
              reason: 'invalid_timestamp',
            })
            this.emit('security:warning', {
              type: 'replay_attempt',
              details: `Rejected stale control message: ${ctrlMsg.type}`,
              severity: 'high',
              identityId: ctrlMsg.referenceIdentityId
            } as SecurityWarningEvent['data'])
            continue
          }

          const unknownProfileRequester = Boolean(
            ctrlMsg.type === 'profile_sync_request'
            && ctrlMsg.referenceIdentityId
            && !await localChatStorage.getPublicKeyBundle(ctrlMsg.referenceIdentityId),
          )

          let profileRequestBundle: PublicKeyBundle | undefined
          try {
            profileRequestBundle = await this.prepareProfileSyncRequestBundle(ctrlMsg)
          } catch (error) {
            this.recordDiagnostic('control', 'control_message_rejected', {
              controlType: ctrlMsg.type,
              referenceIdentityId: ctrlMsg.referenceIdentityId,
              reason: 'invalid_profile_request_bundle',
              ...this.getErrorDiagnosticFields(error),
            })
            continue
          }

          const verificationKey = await this.getControlMessageVerificationKey(
            ctrlMsg,
            profileRequestBundle,
          )
          if (!verificationKey) {
            this.recordDiagnostic('control', 'control_message_rejected', {
              controlType: ctrlMsg.type,
              referenceMessageId: ctrlMsg.referenceMessageId,
              referenceIdentityId: ctrlMsg.referenceIdentityId,
              reason: 'missing_verification_key',
            })
            this.emit('security:warning', {
              type: 'replay_attempt',
              details: `Rejected control message without verification key: ${ctrlMsg.type}`,
              severity: 'high',
              identityId: ctrlMsg.referenceIdentityId
            } as SecurityWarningEvent['data'])
            continue
          }

          if (!await this.verifyControlMessage(ctrlMsg, verificationKey)) {
            this.recordDiagnostic('control', 'control_message_rejected', {
              controlType: ctrlMsg.type,
              referenceMessageId: ctrlMsg.referenceMessageId,
              referenceIdentityId: ctrlMsg.referenceIdentityId,
              reason: 'invalid_signature',
            })
            this.emit('security:warning', {
              type: 'replay_attempt',
              details: `Rejected control message with invalid signature: ${ctrlMsg.type}`,
              severity: 'high',
              identityId: ctrlMsg.referenceIdentityId
            } as SecurityWarningEvent['data'])
            continue
          }

          if (unknownProfileRequester) {
            this.recordDiagnostic('control', 'control_message_rejected', {
              controlType: ctrlMsg.type,
              referenceIdentityId: ctrlMsg.referenceIdentityId,
              reason: 'unknown_profile_requester',
            })
            await localChatStorage.storeProcessedMessage({
              messageId: replayId,
              sessionId: 'control',
              processedAt: now(),
              messageHash: replayId,
            })
            continue
          }

          if (profileRequestBundle && ctrlMsg.referenceIdentityId) {
            try {
              await this.storeControlBundleForIdentity(
                profileRequestBundle,
                ctrlMsg.referenceIdentityId,
              )
            } catch (error) {
              this.recordDiagnostic('control', 'control_message_rejected', {
                controlType: ctrlMsg.type,
                referenceIdentityId: ctrlMsg.referenceIdentityId,
                reason: 'profile_request_bundle_persistence_failed',
                ...this.getErrorDiagnosticFields(error),
              })
              continue
            }
          }

          const processedControlRecord: ProcessedMessageRecord = {
            messageId: replayId,
            sessionId: 'control',
            processedAt: now(),
            messageHash: replayId
          }
          const deferProcessedRecord = ctrlMsg.type === 'profile_sync_response'
            && this.profileSyncResponseHandler !== null
          if (!deferProcessedRecord) {
            await localChatStorage.storeProcessedMessage(processedControlRecord)
          }
          let retryProfileResponse = false

          switch (ctrlMsg.type) {
            case 'bundle_refresh_request':
              // Someone is asking us to send them a fresh bundle
              if (ctrlMsg.referenceIdentityId) {
                this.recordDiagnostic('control', 'bundle_refresh_request_received', {
                  controlType: ctrlMsg.type,
                  referenceIdentityId: ctrlMsg.referenceIdentityId,
                })
                await this.sendBundleRefreshResponse(ctrlMsg.referenceIdentityId)
              }
              break

            case 'bundle_refresh_response':
              // We received a fresh bundle from someone we requested
              if (ctrlMsg.data?.bundle && ctrlMsg.referenceIdentityId) {
                await this.storeControlBundleForIdentity(ctrlMsg.data.bundle as PublicKeyBundle, ctrlMsg.referenceIdentityId)
                this.recordDiagnostic('control', 'bundle_refresh_response_received', {
                  controlType: ctrlMsg.type,
                  referenceIdentityId: ctrlMsg.referenceIdentityId,
                })
                this.emit('bundle:refreshed', {
                  identityId: ctrlMsg.referenceIdentityId,
                  bundle: ctrlMsg.data.bundle
                })
              }
              break

            case 'message_retry_request':
              // Recipient could not decrypt our message; re-encrypt and resend.
              if (ctrlMsg.referenceMessageId && ctrlMsg.referenceIdentityId) {
                this.recordDiagnostic('control', 'message_retry_request_received', {
                  controlType: ctrlMsg.type,
                  referenceMessageId: ctrlMsg.referenceMessageId,
                  referenceIdentityId: ctrlMsg.referenceIdentityId,
                  hasBundle: Boolean(ctrlMsg.data?.bundle),
                })
                await this.handleMessageRetryRequest(
                  ctrlMsg.referenceMessageId,
                  ctrlMsg.referenceIdentityId,
                  ctrlMsg.data?.bundle as PublicKeyBundle | undefined
                )
              }
              break

            case 'message_retry_response':
              // We received a re-encrypted message we requested retry for
              if (ctrlMsg.data?.encryptedMessage && ctrlMsg.referenceIdentityId) {
                // Process as a normal incoming message
                try {
                  const retryResponseBundle = ctrlMsg.data.bundle as PublicKeyBundle | undefined
                  if (retryResponseBundle) {
                    try {
                      await this.storeControlBundleForIdentity(retryResponseBundle, ctrlMsg.referenceIdentityId)
                    } catch (bundleError) {
                      this.recordDiagnostic('control', 'message_retry_response_bundle_rejected', {
                        controlType: ctrlMsg.type,
                        referenceMessageId: ctrlMsg.referenceMessageId,
                        referenceIdentityId: ctrlMsg.referenceIdentityId,
                        ...this.getErrorDiagnosticFields(bundleError),
                      })
                      if (!this.matchesTerminalMessageError(bundleError)) {
                        throw bundleError
                      }
                    }
                  }

                  let conversation = await localChatStorage.getConversationByParticipants(
                    identity.id,
                    ctrlMsg.referenceIdentityId
                  )

                  if (!conversation) {
                    const handle = await this.getOrCreateConversation(ctrlMsg.referenceIdentityId)
                    conversation = handle
                      ? await localChatStorage.getConversation(handle.getId())
                      : null
                  }

                  if (conversation) {
                    const decryptedRetryMessage = await this.receiveMessage(
                      conversation.id,
                      ctrlMsg.data.encryptedMessage as EncryptedMessage,
                      ctrlMsg.referenceIdentityId
                    )
                    await this.resolveRetryRequestRecord(
                      ctrlMsg.referenceMessageId,
                      ctrlMsg.referenceIdentityId,
                      'retry_response_received',
                    )
                    this.recordDiagnostic('control', 'message_retry_response_processed', {
                      controlType: ctrlMsg.type,
                      referenceMessageId: ctrlMsg.referenceMessageId,
                      referenceIdentityId: ctrlMsg.referenceIdentityId,
                      decryptedMessageId: decryptedRetryMessage.id,
                      decryptedSequenceNumber: decryptedRetryMessage.sequenceNumber,
                      conversationId: conversation.id,
                    })
                  }
                } catch (error) {
                  this.recordDiagnostic('control', 'message_retry_response_failed', {
                    controlType: ctrlMsg.type,
                    referenceMessageId: ctrlMsg.referenceMessageId,
                    referenceIdentityId: ctrlMsg.referenceIdentityId,
                    ...this.getErrorDiagnosticFields(error),
                  })
                  if (this.matchesTerminalMessageError(error)) {
                    console.warn('[QuantumChat] Ignoring undecryptable retry response:', error)
                  } else {
                    console.error('[QuantumChat] Failed to process retry response:', error)
                  }
                }
              }
              break

            case 'mailbox_scope_offer':
              try {
                await this.acceptMailboxScopeOffer(ctrlMsg)
                this.recordDiagnostic('control', 'mailbox_scope_offer_accepted', {
                  controlType: ctrlMsg.type,
                  referenceIdentityId: ctrlMsg.referenceIdentityId,
                })
              } catch (error) {
                this.recordDiagnostic('control', 'mailbox_scope_offer_rejected', {
                  controlType: ctrlMsg.type,
                  referenceIdentityId: ctrlMsg.referenceIdentityId,
                  ...this.getErrorDiagnosticFields(error),
                })
              }
              break

            case 'mailbox_scope_ack':
              await this.markMailboxScopeAcknowledged(ctrlMsg)
              this.recordDiagnostic('control', 'mailbox_scope_ack_received', {
                controlType: ctrlMsg.type,
                referenceIdentityId: ctrlMsg.referenceIdentityId,
              })
              break

            case 'profile_sync_request':
              if (ctrlMsg.referenceIdentityId) {
                this.emit('profile:requested', {
                  requesterIdentityId: ctrlMsg.referenceIdentityId,
                })
              }
              break

            case 'profile_sync_response':
              if (
                ctrlMsg.referenceIdentityId
                && ctrlMsg.data?.profile
                && new TextEncoder().encode(JSON.stringify(ctrlMsg.data.profile)).byteLength
                  <= MAX_PROFILE_CONTROL_BYTES
              ) {
                const disposition = this.profileSyncResponseHandler
                  ? await this.profileSyncResponseHandler(
                    ctrlMsg.referenceIdentityId,
                    ctrlMsg.data.profile,
                  )
                  : 'applied'
                retryProfileResponse = disposition === 'retry'
                if (disposition === 'applied') {
                  this.emit('profile:received', {
                    senderIdentityId: ctrlMsg.referenceIdentityId,
                    profile: ctrlMsg.data.profile,
                  })
                }
              } else {
                this.recordDiagnostic('control', 'profile_sync_response_rejected', {
                  referenceIdentityId: ctrlMsg.referenceIdentityId,
                })
              }
              break

            default:
              // Unknown control message type
              this.recordDiagnostic('control', 'control_message_ignored', {
                controlType: ctrlMsg.type,
                referenceMessageId: ctrlMsg.referenceMessageId,
                referenceIdentityId: ctrlMsg.referenceIdentityId,
              })
          }
          if (deferProcessedRecord && !retryProfileResponse) {
            await localChatStorage.storeProcessedMessage(processedControlRecord)
          }
        }
      } catch (error) {
        controlFetchSpan.end({ error: true })
        this.recordDiagnostic('control', 'control_processing_failed', {
          forced: Boolean(options?.force),
          ...this.getErrorDiagnosticFields(error),
        })
      }
    })()

    try {
      await this.controlMessageFetchPromise
    } finally {
      this.controlMessageFetchPromise = null
    }
  }

  /**
   * Handle a message retry request.
   * Re-encrypt the original message with a fresh session and send it
   */
  private async handleMessageRetryRequest(
    originalMessageId: string,
    requesterId: string,
    requesterBundle?: PublicKeyBundle
  ): Promise<void> {
    if (!this.bundleServer?.isAvailable() || !this.identity || !this.privateBundle) return

    try {
      this.recordDiagnostic('repair', 'message_retry_request_handling', {
        messageId: originalMessageId,
        requesterIdentityId: requesterId,
        hasRequesterBundle: Boolean(requesterBundle),
      })
      // Find the original message
      const originalMessage = await localChatStorage.getMessage(originalMessageId)
      if (!originalMessage || !originalMessage.content) {
        this.recordDiagnostic('repair', 'message_retry_request_unavailable', {
          messageId: originalMessageId,
          requesterIdentityId: requesterId,
          reason: 'original_message_unavailable',
        })
        console.warn('[QuantumChat] Cannot retry - original message not found or content unavailable')
        return
      }

      if (requesterBundle) {
        await this.storeControlBundleForIdentity(requesterBundle, requesterId)
      }

      // Re-establish session with the requester
      const { session } = await establishSessionAsInitiator(
        this.identity,
        this.privateBundle,
        requesterId,
        { trackedIdentity: this.trackedIdentities.get(requesterId) || undefined }
      )

      // Re-encrypt the message
      const reEncrypted = await encryptSessionMessage(
        session,
        originalMessage.content,
        this.identity.dilithiumPrivateKey,
        originalMessage.encryptedData.metadata.sequenceNumber,
        undefined
      )

      // Send as retry response
      const responseBundle = await this.getPublicKeyBundle()
      const controlMessage = await this.signControlMessage({
        type: 'message_retry_response',
        referenceMessageId: originalMessageId,
        referenceIdentityId: this.identity.id,
        timestamp: now(),
        data: responseBundle
          ? {
              encryptedMessage: reEncrypted,
              bundle: createCompactTransportBundle(responseBundle),
            }
          : {
              encryptedMessage: reEncrypted,
            }
      })

      await this.sendControlMessageToRecipient(requesterId, controlMessage)

      this.recordDiagnostic('repair', 'message_retry_response_sent', {
        messageId: originalMessageId,
        requesterIdentityId: requesterId,
      })
      this.emit('message:retry_sent', { messageId: originalMessageId, recipientId: requesterId })
    } catch (error) {
      this.recordDiagnostic('repair', 'message_retry_request_failed', {
        messageId: originalMessageId,
        requesterIdentityId: requesterId,
        ...this.getErrorDiagnosticFields(error),
      })
    }
  }

  /**
   * Request a message retry from sender (when we can't decrypt)
   * Ask the sender to re-encrypt with a fresh session.
   */
  async requestMessageRetry(
    messageId: string,
    senderIdentityId: string
  ): Promise<RepairSendResult> {
    this.recordDiagnostic('repair', 'message_retry_request_start', {
      messageId,
      senderIdentityId,
    })
    if (!this.bundleServer?.isAvailable()) {
      this.recordDiagnostic('repair', 'message_retry_request_failed', {
        messageId,
        senderIdentityId,
        failureReason: 'server_unavailable',
      })
      return {
        ok: false,
        reason: 'server_unavailable',
        message: 'Bundle server is unavailable',
      }
    }
    if (!this.identity) {
      this.recordDiagnostic('repair', 'message_retry_request_failed', {
        messageId,
        senderIdentityId,
        failureReason: 'not_initialized',
      })
      return {
        ok: false,
        reason: 'not_initialized',
        message: 'Identity not initialized',
      }
    }

    try {
      // Include our fresh bundle so they can establish a new session
      const ourBundle = await this.getPublicKeyBundle()
      const transportBundle = ourBundle ? createCompactTransportBundle(ourBundle) : undefined

      const controlMessage = await this.signControlMessage({
        type: 'message_retry_request',
        referenceMessageId: messageId,
        referenceIdentityId: this.identity.id,
        timestamp: now(),
        data: transportBundle ? { bundle: transportBundle } : undefined
      })

      await this.sendControlMessageToRecipient(senderIdentityId, controlMessage)

      this.recordDiagnostic('repair', 'message_retry_request_sent', {
        messageId,
        senderIdentityId,
      })
      this.emit('message:retry_requested', { messageId, senderId: senderIdentityId })
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.recordDiagnostic('repair', 'message_retry_request_failed', {
        messageId,
        senderIdentityId,
        ...this.getErrorDiagnosticFields(error),
      })
      return {
        ok: false,
        reason: error instanceof BundleServerRequestError ? error.reason : 'unknown',
        message,
      }
    }
  }

  async requestContactProfile(contactIdentityId: string): Promise<RepairSendResult> {
    if (!this.bundleServer?.isAvailable()) {
      return {
        ok: false,
        reason: 'server_unavailable',
        message: 'Bundle server is unavailable',
      }
    }
    if (!this.identity) {
      return {
        ok: false,
        reason: 'not_initialized',
        message: 'Identity not initialized',
      }
    }

    try {
      const bundle = await this.getPublicKeyBundle()
      if (!bundle) {
        return {
          ok: false,
          reason: 'not_initialized',
          message: 'Local bundle is unavailable',
        }
      }
      await this.sendControlMessageToRecipient(contactIdentityId, await this.signControlMessage({
        type: 'profile_sync_request',
        referenceIdentityId: this.identity.id,
        timestamp: now(),
        data: { bundle: createCompactTransportBundle(bundle) },
      }))
      this.recordDiagnostic('profile', 'profile_sync_request_sent', {
        recipientIdentityId: contactIdentityId,
      })
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof BundleServerRequestError ? error.reason : 'unknown',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async sendContactProfile(
    recipientIdentityId: string,
    profile: SignedContactProfile,
  ): Promise<RepairSendResult> {
    if (!this.bundleServer?.isAvailable()) {
      return {
        ok: false,
        reason: 'server_unavailable',
        message: 'Bundle server is unavailable',
      }
    }
    if (!this.identity) {
      return {
        ok: false,
        reason: 'not_initialized',
        message: 'Identity not initialized',
      }
    }
    if (
      profile.identityId !== this.identity.id
      || !verifySignedContactProfile(
        profile,
        this.identity.dilithiumPublicKey,
        this.identity.id,
      )
      || new TextEncoder().encode(JSON.stringify(profile)).byteLength > MAX_PROFILE_CONTROL_BYTES
    ) {
      return {
        ok: false,
        reason: 'rejected',
        message: 'Contact profile is invalid',
      }
    }

    try {
      await this.sendControlMessageToRecipient(recipientIdentityId, await this.signControlMessage({
        type: 'profile_sync_response',
        referenceIdentityId: this.identity.id,
        timestamp: now(),
        data: { profile },
      }))
      this.recordDiagnostic('profile', 'profile_sync_response_sent', {
        recipientIdentityId,
        revision: profile.revision,
      })
      return { ok: true }
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof BundleServerRequestError ? error.reason : 'unknown',
        message: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Request a bundle refresh from a contact
   * Used when we can't decrypt their messages due to stale bundle
   */
  async requestBundleRefresh(contactIdentityId: string): Promise<RepairSendResult> {
    this.recordDiagnostic('repair', 'bundle_refresh_request_start', {
      contactIdentityId,
    })
    if (!this.bundleServer?.isAvailable()) {
      this.recordDiagnostic('repair', 'bundle_refresh_request_failed', {
        contactIdentityId,
        failureReason: 'server_unavailable',
      })
      return {
        ok: false,
        reason: 'server_unavailable',
        message: 'Bundle server is unavailable',
      }
    }
    if (!this.identity) {
      this.recordDiagnostic('repair', 'bundle_refresh_request_failed', {
        contactIdentityId,
        failureReason: 'not_initialized',
      })
      return {
        ok: false,
        reason: 'not_initialized',
        message: 'Identity not initialized',
      }
    }

    try {
      // Include our fresh bundle so they can respond
      const ourBundle = await this.getPublicKeyBundle()
      const transportBundle = ourBundle ? createCompactTransportBundle(ourBundle) : undefined
      
      const controlMessage = await this.signControlMessage({
        type: 'bundle_refresh_request',
        referenceIdentityId: this.identity.id,
        timestamp: now(),
        data: transportBundle ? { bundle: transportBundle } : undefined
      })

      await this.sendControlMessageToRecipient(contactIdentityId, controlMessage)
      
      this.recordDiagnostic('repair', 'bundle_refresh_request_sent', {
        contactIdentityId,
      })
      this.emit('security:warning', {
        type: 'bundle_stale',
        details: `Requested key refresh from ${contactIdentityId.slice(0, 8)}...`,
        severity: 'medium',
        identityId: contactIdentityId
      } as SecurityWarningEvent['data'])
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.recordDiagnostic('repair', 'bundle_refresh_request_failed', {
        contactIdentityId,
        ...this.getErrorDiagnosticFields(error),
      })
      return {
        ok: false,
        reason: error instanceof BundleServerRequestError ? error.reason : 'unknown',
        message,
      }
    }
  }

  /**
   * Send a bundle refresh response to a contact who requested it
   */
  private async sendBundleRefreshResponse(recipientIdentityId: string): Promise<void> {
    if (!this.bundleServer?.isAvailable() || !this.identity) return

    try {
      this.recordDiagnostic('repair', 'bundle_refresh_response_start', {
        recipientIdentityId,
      })
      const ourBundle = await this.getPublicKeyBundle()
      if (!ourBundle) return

      const controlMessage = await this.signControlMessage({
        type: 'bundle_refresh_response',
        referenceIdentityId: this.identity.id,
        timestamp: now(),
        data: { bundle: createCompactTransportBundle(ourBundle) }
      })

      await this.sendControlMessageToRecipient(recipientIdentityId, controlMessage)
      this.recordDiagnostic('repair', 'bundle_refresh_response_sent', {
        recipientIdentityId,
      })
    } catch (error) {
      this.recordDiagnostic('repair', 'bundle_refresh_response_failed', {
        recipientIdentityId,
        ...this.getErrorDiagnosticFields(error),
      })
    }
  }

  // Event Handling

  setProfileSyncResponseHandler(
    handler: ((
      senderIdentityId: string,
      profile: unknown,
    ) => Promise<ProfileSyncResponseDisposition>) | null,
  ): void {
    this.profileSyncResponseHandler = handler
  }

  /**
   * Subscribe to events
   */
  on(event: string, callback: (event: ChatEvent) => void): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
    
    return () => {
      this.eventListeners.get(event)?.delete(callback)
    }
  }

  emit(type: string, data: any): void {
    const event: ChatEvent = {
      type: type as any,
      data,
      timestamp: now()
    }
    
    this.eventListeners.get(type)?.forEach(callback => {
      try {
        callback(event)
      } catch (error) {
        console.error('Error in event listener:', error)
      }
    })
  }

  // Cleanup

  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    if (this.receiveMaintenanceTimer) {
      clearTimeout(this.receiveMaintenanceTimer)
      this.receiveMaintenanceTimer = null
    }
    this.receiveMaintenanceScheduledAt = 0
    this.pendingReceiveMaintenance = false
    this.activeReceiveOperations = 0
    this.clearRelayDeletionTimer()
    this.pendingRelayDeletionIds.clear()
    this.relayDeletionAttempts.clear()
    this.activeRelayReceiptIds.clear()
    this.relayReceiptRateLimitedUntil.clear()
    this.inFlightRepairKeys.clear()
    this.verifiedSenderBundlePins.clear()
    this.scopedMailboxTokenCache.clear()
    this.scopedMailboxTokenGenerations.clear()
    this.eventListeners.clear()
  }

  /**
   * Clear all local data
   */
  async clearData(): Promise<void> {
    await localChatStorage.clear()
    this.identity = null
    this.privateBundle = null
    this.disconnect()
  }
}

// ConversationHandle extracted to its own file for maintainability
export { ConversationHandle } from './conversationHandle'
