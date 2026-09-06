/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Subscription and polling lifecycle for QuantumChat.
 * Shared state lives in `_state`; callbacks bridge back to `index.ts`.
 */

import * as S from './_state'
import type { DirectMessagePollSource } from './directMessagePolling'
import { AppState, InteractionManager } from 'react-native'
import { hasBoundBackendAccessForIdentity, ensureBoundBackendAccessForIdentity, getCachedBackendAccessToken } from '../backend/session'
import { isSpectraBackendConfigured } from '@/services/backend/client'
import {
  subscribeBackendRealtime,
  type BackendRealtimeLifecycleEvent,
  type BackendRealtimeSubscription,
} from '@/services/backend/realtime'
import { createRealtimeSubscriberId } from '@/services/backend/realtimeSubscriberId'
import { useChatStore } from '@/store/chatStore'
import { useAuthStore } from '@/store/authStore'
import { useSpectreStore } from '@/store/spectreStore'
import { completeMailboxCatchupBanner } from '@/store/mailboxCatchupBannerStore'
import { useTorStore } from '../tor/torStore'
import { TOR_CHAT_POLL_INTERVAL_MS, TOR_OUTBOUND_STATUS_SYNC_TIMER_MS } from '../tor/torConstants'
import { isClearnetEgressAllowed } from '../tor/torEgressPolicy'
import {
  recordCatchupTiming,
  recordChatDiagnostic,
  recordChatOperationalCounter,
} from '../chat/chatDiagnostics'
import {
  deriveRecipientMailboxToken,
  deriveScopedRecipientMailboxToken,
  listRealtimeMailboxTokens,
  localChatStorage,
  MAILBOX_SCOPE_REGISTRATION_VERSION,
  type BundleServer,
  type MailboxScopeState,
} from '@spectra/core-crypto'

// Callback bridge

interface SubscriptionCallbacks {
  pollForNewMessages: (options?: MessagePollOptions) => Promise<MessagePollResult | void>
  mergePendingMessagePoll?: (options: MessagePollOptions) => boolean
  processControlMessagesNow: () => Promise<void>
  pollForNewGroupMessages: () => Promise<void>
  syncGroupConversations: (fullResync: boolean) => Promise<void>
  syncOutboundRelayStatuses: (options?: { force?: boolean }) => Promise<void>
  applyOutboundRelayStatus: (relayMessageId: string, status: 'delivered' | 'read') => Promise<void>
  reconcileQuantumChat: (options?: { fullResync?: boolean; restartRealtime?: boolean; reason?: string }) => Promise<void>
  syncBundleServerAccessToken: () => void
  trackRuntimeTask?: (task: Promise<void>) => Promise<void>
}

let callbacks: SubscriptionCallbacks | null = null
let groupRealtimeChannel: BackendRealtimeSubscription | null = null
let lifecycleGeneration = 0
let receiveWorkQueue: Promise<void> = Promise.resolve()

export function initSubscriptionManager(cbs: SubscriptionCallbacks): void {
  lifecycleGeneration += 1
  cancelDeferredOutboundStatusSyncSchedule()
  deferredOutboundStatusSync = null
  callbacks = cbs
  receiveWorkQueue = Promise.resolve()
  lastMissedRealtimeRecoveryAt = 0
  lastMissingRealtimeRetryAt = 0
  lastScopedRealtimeRefreshAt = 0
  primaryRealtimeSubscribed = false
  realtimeRecoveryAttempts = 0
  consecutiveEmptyScheduledPolls = 0
  lastRealtimeWakeupAt = 0
  mailboxCatchupCompleted = false
  resetCatchupBurst()
  lastRealtimeWakeupSequences.clear()
  pendingScopedCatchupTokens = null
  scopedMissedEventRecoveryAt.clear()
  clearRealtimeVisibilityRetry()
  clearScopedMailboxRetries()
  clearScopedRealtimeRefreshTimer()
  resetInitialMailboxCatchupGate()
}

export function disposeSubscriptionManager(): void {
  lifecycleGeneration += 1
  callbacks = null
  receiveWorkQueue = Promise.resolve()
  messagePollInFlight = false
  messagePollQueued = null
  pendingRealtimeWakeup = null
  pendingScopedCatchupTokens = null
  messagePollInteractionTask?.cancel()
  messagePollInteractionTask = null
  clearRealtimeVisibilityRetry()
  controlProcessingInteractionTask?.cancel()
  controlProcessingInteractionTask = null
  controlProcessingInFlight = false
  controlProcessingQueued = false
  outboundStatusSyncInFlight = false
  outboundStatusSyncQueued = null
  cancelDeferredOutboundStatusSyncSchedule()
  interactiveChatOpen = false
  deferredOutboundStatusSync = null
  consecutiveEmptyScheduledPolls = 0
  lastRealtimeWakeupAt = 0
  mailboxCatchupCompleted = false
  resetCatchupBurst()
  scopedMissedEventRecoveryAt.clear()
  clearScopedMailboxRetries()
  clearScopedRealtimeRefreshTimer()
  resetInitialMailboxCatchupGate()
  messagePollingStarted = false
}

// Local timers

const REALTIME_LIVENESS_INTERVAL_MS = 45_000
const REALTIME_CATCHUP_BURST_POLL_INTERVAL_MS = 1_000
const REALTIME_BACKUP_POLL_INTERVAL_MS = 5_000
const REALTIME_BACKUP_POLL_IDLE_INTERVAL_MS = 15_000
const REALTIME_BACKUP_POLL_HEALTHY_INTERVAL_MS = 30_000
const REALTIME_RECENT_WAKEUP_MS = 60_000
const REALTIME_CATCHUP_BURST_MAX_POLLS = 10
const REALTIME_CATCHUP_BURST_MAX_MS = 15_000
const REALTIME_MESSAGE_POLL_DEBOUNCE_MS = 20
const REALTIME_MESSAGE_POLL_MAX_WAIT_MS = 120
const REALTIME_INTERACTION_MAX_WAIT_MS = 24
const REALTIME_MISSED_EVENT_RECOVERY_DELAY_MS = 750
const REALTIME_MISSED_EVENT_RECOVERY_COOLDOWN_MS = 30_000
const REALTIME_MISSING_CHANNEL_RETRY_COOLDOWN_MS = 5_000
const REALTIME_SCOPED_REFRESH_COOLDOWN_MS = 10_000
const REALTIME_RECOVERY_BASE_DELAY_MS = 1_000
const REALTIME_RECOVERY_MAX_DELAY_MS = 30_000
const REALTIME_VISIBILITY_RETRY_DELAYS_MS = [150, 350, 750] as const
const DEFERRED_OUTBOUND_STATUS_SYNC_IDLE_DELAY_MS = 500
const SCOPED_MISSED_EVENT_RECOVERY_COOLDOWN_MS = 30_000
const SCOPED_SUBSCRIPTION_STALE_MS = 7_500
const RECEIPT_CHANNEL_TTL_MS = 2 * 60 * 60 * 1_000
const MAX_RECEIPT_RECOVERY_SUBSCRIPTIONS = 24
const MAX_SCOPED_MAILBOX_SUBSCRIPTIONS = 8
const SCOPED_REALTIME_REFRESH_DEBOUNCE_MS = 400

type MessagePollSource = DirectMessagePollSource

type MessagePollOptions = {
  fullResync?: boolean
  source?: MessagePollSource
  latestServerSequence?: number
  realtimeRequestedAt?: number
}

type MessagePollResult = {
  lastServerSequence: number
  fullResyncCompleted?: boolean
  directMessageCount?: number
  mailboxTokens?: string[]
  mailboxSequences?: Map<string, number>
}

type MessagePollWakeup = {
  count: number
  firstQueuedAt: number
  latestServerSequence?: number
  mailboxSequences: Map<string, number>
}

type OutboundStatusSyncRequest = {
  reason: string
  force: boolean
}

type RealtimeMessagePayload = {
  payload?: {
    server_sequence?: unknown
    delivery_class?: unknown
  }
} | undefined

let realtimeLivenessTimer: ReturnType<typeof setInterval> | null = null
let realtimeRecoveryTimer: ReturnType<typeof setTimeout> | null = null
let realtimeMessagePollTimer: ReturnType<typeof setTimeout> | null = null
const outboundReceiptChannels = new Map<string, {
  channel: BackendRealtimeSubscription
  timeout: ReturnType<typeof setTimeout>
}>()
const scopedMailboxChannels = new Map<string, {
  channel: BackendRealtimeSubscription
  subscribed: boolean
  startedAt: number
}>()
const scopedMailboxRetries = new Map<string, {
  attempts: number
  timer: ReturnType<typeof setTimeout> | null
}>()
const scopedMissedEventRecoveryAt = new Map<string, number>()
let messagePollInFlight = false
let messagePollQueued: MessagePollWakeup | null = null
let pendingRealtimeWakeup: MessagePollWakeup | null = null
let messagePollInteractionTask: { cancel: () => void } | null = null
let realtimeVisibilityRetryTimer: ReturnType<typeof setTimeout> | null = null
let realtimeVisibilityRetryState: {
  attempts: number
  mailboxSequences: Map<string, number>
} | null = null
let controlProcessingInteractionTask: { cancel: () => void } | null = null
let controlProcessingInFlight = false
let controlProcessingQueued = false
let outboundStatusSyncInFlight = false
let outboundStatusSyncQueued: OutboundStatusSyncRequest | null = null
let interactiveChatOpen = false
let deferredOutboundStatusSync: OutboundStatusSyncRequest | null = null
let deferredOutboundStatusSyncInteractionTask: { cancel: () => void } | null = null
let deferredOutboundStatusSyncTimer: ReturnType<typeof setTimeout> | null = null
const backgroundSkipCounts = new Map<string, number>()
let lastMissedRealtimeRecoveryAt = 0
let lastMissingRealtimeRetryAt = 0
let lastScopedRealtimeRefreshAt = 0
let scopedRealtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null
let primaryRealtimeSubscribed = false
let activeRealtimeAccessToken: string | null = null
let realtimeRecoveryAttempts = 0
const lastRealtimeWakeupSequences = new Map<string, number>()
let pendingScopedCatchupTokens: Set<string> | null = null
let consecutiveEmptyScheduledPolls = 0
let lastRealtimeWakeupAt = 0
let mailboxCatchupCompleted = false
let catchupBurstActive = false
let catchupBurstPolls = 0
let catchupBurstStartedAt = 0
let initialCatchupSettled = false
let initialCatchupWaiters: Array<() => void> = []
let messagePollingStarted = false

const INITIAL_MAILBOX_CATCHUP_WAIT_MS = 15_000

function resetInitialMailboxCatchupGate(): void {
  const waiters = initialCatchupWaiters
  initialCatchupWaiters = []
  initialCatchupSettled = false
  for (const finish of waiters) finish()
}

function settleInitialMailboxCatchup(): void {
  if (initialCatchupSettled) return
  initialCatchupSettled = true
  completeMailboxCatchupBanner('empty')
  const waiters = initialCatchupWaiters
  initialCatchupWaiters = []
  for (const finish of waiters) finish()
  if (messagePollingStarted && callbacks) {
    startOutboundStatusSync()
    scheduleMessagePolling()
  }
}

export function whenInitialMailboxCatchupSettled(): Promise<void> {
  if (initialCatchupSettled) return Promise.resolve()
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      settleInitialMailboxCatchup()
    }, INITIAL_MAILBOX_CATCHUP_WAIT_MS)
    initialCatchupWaiters.push(finish)
  })
}

export function isInitialMailboxCatchupSettled(): boolean {
  return initialCatchupSettled
}

function resetCatchupBurst(): void {
  catchupBurstActive = false
  catchupBurstPolls = 0
  catchupBurstStartedAt = 0
}

function armMailboxCatchupBurst(now: number = Date.now()): void {
  catchupBurstActive = true
  catchupBurstPolls = 0
  catchupBurstStartedAt = now
  consecutiveEmptyScheduledPolls = 0
  lastRealtimeWakeupAt = 0
}

function shouldUseCatchupBurst(now: number): boolean {
  return catchupBurstActive
    && catchupBurstPolls < REALTIME_CATCHUP_BURST_MAX_POLLS
    && now - catchupBurstStartedAt < REALTIME_CATCHUP_BURST_MAX_MS
}

/** Re-enter the unlock catch-up burst after a long background or dead realtime. */
export function beginMailboxCatchupBurst(now: number = Date.now()): void {
  armMailboxCatchupBurst(now)
  scheduleMessagePolling()
}

/** Tor has no realtime wakeups; fetch receipts right after relay accept. */
export function requestPostSendCatchup(): void {
  if (!useTorStore.getState().enabled) return
  scheduleControlMessageProcessing()
}

// Helpers

export function getMessagePollIntervalMs(now: number = Date.now()): number {
  const spectreEnabled = useSpectreStore.getState().enabled
  return useTorStore.getState().enabled
    ? TOR_CHAT_POLL_INTERVAL_MS
    : spectreEnabled
      ? S.DEFAULT_MESSAGE_POLL_INTERVAL
      : S.realtimeChannel
        ? shouldUseCatchupBurst(now)
          ? REALTIME_CATCHUP_BURST_POLL_INTERVAL_MS
          : !mailboxCatchupCompleted
            ? REALTIME_BACKUP_POLL_INTERVAL_MS
            : lastRealtimeWakeupAt > 0 && now - lastRealtimeWakeupAt < REALTIME_RECENT_WAKEUP_MS
              ? REALTIME_BACKUP_POLL_HEALTHY_INTERVAL_MS
              : consecutiveEmptyScheduledPolls >= 2
                ? REALTIME_BACKUP_POLL_HEALTHY_INTERVAL_MS
                : consecutiveEmptyScheduledPolls === 1
                  ? REALTIME_BACKUP_POLL_IDLE_INTERVAL_MS
                  : REALTIME_BACKUP_POLL_INTERVAL_MS
        : S.DEFAULT_MESSAGE_POLL_INTERVAL
}

export function getBackgroundWorkSkipStats(): Record<string, number> {
  return Object.fromEntries(backgroundSkipCounts.entries())
}

export function clearBackgroundWorkSkipStats(): void {
  backgroundSkipCounts.clear()
}

function isAppForeground(): boolean {
  return AppState.currentState === 'active'
}

function recordBackgroundWorkSkipped(work: string, fields: Record<string, string | number | boolean | null | undefined> = {}): void {
  const count = (backgroundSkipCounts.get(work) || 0) + 1
  backgroundSkipCounts.set(work, count)
  recordChatDiagnostic('performance', 'background_work_skipped', {
    work,
    count,
    appState: AppState.currentState,
    ...fields,
  })
}

function shouldSkipBackgroundWork(work: string, fields?: Record<string, string | number | boolean | null | undefined>): boolean {
  if (isAppForeground()) {
    return false
  }
  recordBackgroundWorkSkipped(work, fields)
  return true
}

function isRealtimeTransportDisabled(): boolean {
  return useTorStore.getState().enabled
    || useSpectreStore.getState().enabled
    || !isClearnetEgressAllowed()
}

function nextRealtimeSubscriberId(channel: 'mailbox' | 'receipt' | 'primary'): string {
  return createRealtimeSubscriberId(`chat-${channel}`)
}

function isUsableMailboxToken(mailboxToken: string): boolean {
  return mailboxToken.trim().length > 0
}

function realtimeRetryDelay(attempts: number): number {
  const exponential = Math.min(
    REALTIME_RECOVERY_MAX_DELAY_MS,
    REALTIME_RECOVERY_BASE_DELAY_MS * (2 ** Math.max(0, attempts - 1)),
  )
  return Math.round(exponential * (0.75 + (Math.random() * 0.5)))
}

function recordRealtimeLifecycle(
  channel: 'primary' | 'scoped' | 'receipt',
  event: BackendRealtimeLifecycleEvent,
): void {
  recordChatDiagnostic('transport', 'realtime_socket_lifecycle', {
    channel,
    state: event.state,
    elapsedMs: event.elapsedMs,
    failureStage: event.failureStage,
    closeCode: event.closeCode,
    closeReason: event.closeReason,
    wasClean: event.wasClean,
  })
}

function trackRuntimeTask(task: Promise<void>): Promise<void> {
  return callbacks?.trackRuntimeTask?.(task) ?? task
}

function enqueueReceiveWork<T>(work: () => Promise<T>): Promise<T> {
  const queuedAt = Date.now()
  const result = receiveWorkQueue.then(() => {
    const waitMs = Date.now() - queuedAt
    if (waitMs >= 50) {
      recordCatchupTiming('receive_queue_wait', { waitMs })
    }
    return work()
  }, work)
  receiveWorkQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

function mergeWakeupIntoActivePoll(wakeup: MessagePollWakeup): void {
  const merged = callbacks?.mergePendingMessagePoll?.({
    source: 'queued',
    latestServerSequence: wakeup.latestServerSequence,
    realtimeRequestedAt: wakeup.firstQueuedAt,
  })
  if (merged) {
    recordChatOperationalCounter('duplicate', 'message_poll_wakeup_merged', wakeup.count)
    recordChatDiagnostic('performance', 'message_poll_wakeup_merged', {
      queuedCount: wakeup.count,
      latestServerSequence: wakeup.latestServerSequence ?? null,
      queuedForMs: Date.now() - wakeup.firstQueuedAt,
    })
  }
}

function scheduleMessagePollStart(
  _source: MessagePollSource,
  callback: () => void,
): { cancel: () => void } {
  if (!isAppForeground()) {
    return InteractionManager.runAfterInteractions(callback)
  }

  let settled = false
  let interactionTask: { cancel: () => void } | null = null
  const timeout = setTimeout(() => {
    if (settled) return
    settled = true
    interactionTask?.cancel()
    callback()
  }, REALTIME_INTERACTION_MAX_WAIT_MS)
  interactionTask = InteractionManager.runAfterInteractions(() => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    callback()
  })

  return {
    cancel: () => {
      settled = true
      clearTimeout(timeout)
      interactionTask?.cancel()
    },
  }
}

function maybeStartRealtimeFromScheduledPoll(): void {
  if (S.realtimeChannel || !S.chatIdentity || !isSpectraBackendConfigured()) {
    return
  }
  syncRealtimeSubscriptionForTransport()
}

function coercePositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value
  }
  if (typeof value === 'string' && /^[1-9][0-9]*$/.test(value)) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed
  }
  return undefined
}

function getRealtimeServerSequence(payload?: RealtimeMessagePayload): number | undefined {
  const nested = payload?.payload
  return coercePositiveInt(nested?.server_sequence)
    ?? coercePositiveInt((nested as { payload?: { server_sequence?: unknown } } | undefined)?.payload?.server_sequence)
}

function mergeMailboxSequences(
  current: Map<string, number>,
  incoming?: ReadonlyMap<string, number>,
): Map<string, number> {
  const merged = new Map(current)
  for (const [mailboxToken, serverSequence] of incoming ?? []) {
    merged.set(mailboxToken, Math.max(merged.get(mailboxToken) ?? 0, serverSequence))
  }
  return merged
}

function mergeWakeup(
  wakeup: MessagePollWakeup | null,
  serverSequence?: number,
  mailboxToken?: string,
  mailboxSequences?: ReadonlyMap<string, number>,
): MessagePollWakeup {
  const incomingMailboxSequences = new Map(mailboxSequences)
  if (mailboxToken && serverSequence) {
    incomingMailboxSequences.set(
      mailboxToken,
      Math.max(incomingMailboxSequences.get(mailboxToken) ?? 0, serverSequence),
    )
  }
  return {
    count: (wakeup?.count ?? 0) + 1,
    firstQueuedAt: wakeup?.firstQueuedAt ?? Date.now(),
    latestServerSequence: Math.max(wakeup?.latestServerSequence ?? 0, serverSequence ?? 0) || undefined,
    mailboxSequences: mergeMailboxSequences(
      wakeup?.mailboxSequences ?? new Map(),
      incomingMailboxSequences,
    ),
  }
}

function mergeWakeupBatch(current: MessagePollWakeup | null, next: MessagePollWakeup): MessagePollWakeup {
  return {
    count: (current?.count ?? 0) + next.count,
    firstQueuedAt: current?.firstQueuedAt ?? next.firstQueuedAt,
    latestServerSequence: Math.max(current?.latestServerSequence ?? 0, next.latestServerSequence ?? 0) || undefined,
    mailboxSequences: mergeMailboxSequences(
      current?.mailboxSequences ?? new Map(),
      next.mailboxSequences,
    ),
  }
}

function clearRealtimeVisibilityRetry(): void {
  if (realtimeVisibilityRetryTimer) {
    clearTimeout(realtimeVisibilityRetryTimer)
    realtimeVisibilityRetryTimer = null
  }
  realtimeVisibilityRetryState = null
}

function noteRealtimeVisibilityTarget(mailboxToken: string, serverSequence: number): void {
  lastRealtimeWakeupSequences.set(
    mailboxToken,
    Math.max(lastRealtimeWakeupSequences.get(mailboxToken) ?? 0, serverSequence),
  )
  const state = realtimeVisibilityRetryState ?? {
    attempts: 0,
    mailboxSequences: new Map<string, number>(),
  }
  if ((state.mailboxSequences.get(mailboxToken) ?? 0) >= serverSequence) return
  state.mailboxSequences.set(mailboxToken, serverSequence)
  state.attempts = 0
  realtimeVisibilityRetryState = state
}

function isRealtimeTargetVisible(
  mailboxToken: string,
  serverSequence: number,
  result: MessagePollResult | void,
): boolean {
  if (result?.mailboxSequences) {
    return (result.mailboxSequences.get(mailboxToken) ?? 0) >= serverSequence
  }
  return (result?.lastServerSequence ?? 0) >= serverSequence
}

function isWakeupSatisfied(
  wakeup: MessagePollWakeup,
  result: MessagePollResult | void,
): boolean {
  if (wakeup.mailboxSequences.size > 0) {
    return Array.from(wakeup.mailboxSequences).every(([mailboxToken, serverSequence]) => (
      isRealtimeTargetVisible(mailboxToken, serverSequence, result)
    ))
  }
  if (wakeup.latestServerSequence) {
    return (result?.lastServerSequence ?? 0) >= wakeup.latestServerSequence
  }
  return result !== undefined
}

function resolveRealtimeVisibilityTargets(result: MessagePollResult | void): void {
  const state = realtimeVisibilityRetryState
  if (!state) return
  for (const [mailboxToken, serverSequence] of Array.from(state.mailboxSequences)) {
    if (isRealtimeTargetVisible(mailboxToken, serverSequence, result)) {
      state.mailboxSequences.delete(mailboxToken)
    }
  }
  if (state.mailboxSequences.size === 0) {
    clearRealtimeVisibilityRetry()
  }
}

function scheduleRealtimeVisibilityRetry(
  wakeup: MessagePollWakeup | null,
  result: MessagePollResult | void,
): void {
  const state = realtimeVisibilityRetryState
  if (!state || !wakeup || realtimeVisibilityRetryTimer) return
  if (isWakeupSatisfied(wakeup, result)) return
  const delayMs = REALTIME_VISIBILITY_RETRY_DELAYS_MS[state.attempts]
  if (delayMs === undefined) {
    recordChatDiagnostic('transport', 'realtime_visibility_retry_exhausted', {
      attempts: state.attempts,
      latestServerSequence: Math.max(...state.mailboxSequences.values()),
      lastServerSequence: result?.lastServerSequence ?? null,
      targetCount: state.mailboxSequences.size,
    })
    return
  }

  state.attempts += 1
  recordChatDiagnostic('transport', 'realtime_visibility_retry_scheduled', {
    attempt: state.attempts,
    delayMs,
    latestServerSequence: Math.max(...state.mailboxSequences.values()),
    lastServerSequence: result?.lastServerSequence ?? null,
    targetCount: state.mailboxSequences.size,
  })
  realtimeVisibilityRetryTimer = setTimeout(() => {
    realtimeVisibilityRetryTimer = null
    const retryState = realtimeVisibilityRetryState
    if (!callbacks || !retryState || retryState.mailboxSequences.size === 0) return
    const retryTargets = new Map(retryState.mailboxSequences)
    requestMessagePoll(
      'websocket',
      Math.max(...retryTargets.values()),
      undefined,
      retryTargets,
    )
  }, delayMs)
}

// Online status

export function startOnlineStatusChecking(): void {
  if (S.onlineStatusInterval) return

  S.setOnlineStatusInterval(setInterval(() => {
    if (shouldSkipBackgroundWork('online_status_update')) {
      return
    }
    if (interactiveChatOpen) {
      return
    }
    updateOnlineStatuses()
  }, 30000))

  updateOnlineStatuses()
}

export function stopOnlineStatusChecking(): void {
  if (S.onlineStatusInterval) {
    clearInterval(S.onlineStatusInterval)
    S.setOnlineStatusInterval(null)
  }
}

export function updateOnlineStatuses(): void {
  const { contacts, batchUpdateContacts } = useChatStore.getState()
  const now = Date.now()

  const updates: Array<{ identityId: string; changes: { isOnline: boolean } }> = []

  for (const contact of contacts) {
    if (contact.lastSeenAt) {
      const shouldBeOnline = (now - contact.lastSeenAt) < S.ONLINE_STATUS_TIMEOUT
      if (contact.isOnline !== shouldBeOnline) {
        updates.push({ identityId: contact.identityId, changes: { isOnline: shouldBeOnline } })
      }
    }
  }

  if (updates.length > 0) {
    batchUpdateContacts(updates)
  }
}

// Message polling

export function scheduleMessagePolling(): void {
  const nextIntervalMs = getMessagePollIntervalMs()
  if (S.pollInterval && S.activePollIntervalMs === nextIntervalMs) {
    return
  }

  if (S.pollInterval) {
    clearInterval(S.pollInterval)
    S.setPollInterval(null)
  }

  S.setActivePollIntervalMs(nextIntervalMs)
  S.setPollInterval(setInterval(() => {
    requestMessagePoll('scheduled')
  }, nextIntervalMs))
}

function flushPendingRealtimeWakeup(): void {
  realtimeMessagePollTimer = null
  const wakeup = pendingRealtimeWakeup
  pendingRealtimeWakeup = null
  if (!wakeup) return
  if (messagePollInFlight) {
    messagePollQueued = mergeWakeupBatch(messagePollQueued, wakeup)
    mergeWakeupIntoActivePoll(messagePollQueued)
    recordChatDiagnostic('performance', 'message_poll_queued', {
      source: 'websocket',
      queuedCount: messagePollQueued.count,
      latestServerSequence: messagePollQueued.latestServerSequence ?? null,
      queuedForMs: Date.now() - messagePollQueued.firstQueuedAt,
    })
    return
  }
  startMessagePoll('websocket', wakeup)
}

function armRealtimeWakeupPoll(): void {
  if (realtimeMessagePollTimer) {
    clearTimeout(realtimeMessagePollTimer)
    realtimeMessagePollTimer = null
  }
  const wakeup = pendingRealtimeWakeup
  if (!wakeup) return
  const delayMs = Math.max(
    0,
    Math.min(
      REALTIME_MESSAGE_POLL_DEBOUNCE_MS,
      REALTIME_MESSAGE_POLL_MAX_WAIT_MS - (Date.now() - wakeup.firstQueuedAt),
    ),
  )
  recordChatDiagnostic('performance', 'message_poll_websocket_event', {
    count: wakeup.count,
    latestServerSequence: wakeup.latestServerSequence ?? null,
    debounceMs: delayMs,
  })
  if (delayMs === 0) {
    flushPendingRealtimeWakeup()
    return
  }
  realtimeMessagePollTimer = setTimeout(flushPendingRealtimeWakeup, delayMs)
}

function requestMessagePoll(
  source: MessagePollSource,
  serverSequence?: number,
  mailboxToken?: string,
  mailboxSequences?: ReadonlyMap<string, number>,
): void {
  if (!callbacks) return

  if (source === 'scheduled' && shouldSkipBackgroundWork('scheduled_message_poll', {
    pollIntervalMs: S.activePollIntervalMs ?? getMessagePollIntervalMs(),
  })) {
    recordCatchupTiming('poll_skipped', {
      source,
      reason: 'background',
      t: Date.now(),
      intervalMs: S.activePollIntervalMs ?? getMessagePollIntervalMs(),
    })
    return
  }

  if (source === 'scheduled') {
    maybeStartRealtimeFromScheduledPoll()
  }

  recordCatchupTiming('poll_requested', {
    source,
    t: Date.now(),
    inFlight: messagePollInFlight,
    queued: Boolean(messagePollQueued),
    subscribed: primaryRealtimeSubscribed,
    intervalMs: S.activePollIntervalMs ?? getMessagePollIntervalMs(),
    serverSequence: serverSequence ?? -1,
  })

  if (source === 'websocket' && !messagePollInFlight) {
    lastRealtimeWakeupAt = Date.now()
    scheduleMessagePolling()
    pendingRealtimeWakeup = mergeWakeup(
      pendingRealtimeWakeup,
      serverSequence,
      mailboxToken,
      mailboxSequences,
    )
    armRealtimeWakeupPoll()
    return
  }

  if (messagePollInFlight) {
    messagePollQueued = mergeWakeup(
      messagePollQueued,
      serverSequence,
      mailboxToken,
      mailboxSequences,
    )
    if (messagePollQueued.latestServerSequence || messagePollQueued.mailboxSequences.size > 0) {
      mergeWakeupIntoActivePoll(messagePollQueued)
    }
    if (source === 'websocket') {
      recordChatDiagnostic('performance', 'message_poll_websocket_event', {
        count: messagePollQueued.count,
        latestServerSequence: messagePollQueued.latestServerSequence ?? null,
        debounceMs: 0,
        coalesced: true,
      })
    }
    recordChatDiagnostic('performance', 'message_poll_queued', {
      source,
      queuedCount: messagePollQueued.count,
      latestServerSequence: messagePollQueued.latestServerSequence ?? null,
      queuedForMs: Date.now() - messagePollQueued.firstQueuedAt,
    })
    return
  }

  const wakeup = serverSequence || (mailboxSequences?.size ?? 0) > 0
    ? mergeWakeup(null, serverSequence, mailboxToken, mailboxSequences)
    : null
  startMessagePoll(source, wakeup)
}

function startMessagePoll(source: MessagePollSource, wakeup: MessagePollWakeup | null = null): void {
  if (!callbacks) return

  const generation = lifecycleGeneration
  const pollForNewMessages = callbacks.pollForNewMessages
  messagePollInFlight = true
  const requestedAt = Date.now()
  recordCatchupTiming('poll_armed', {
    source,
    t: requestedAt,
    serverSequence: wakeup?.latestServerSequence ?? -1,
    wakeupAgeMs: wakeup ? requestedAt - wakeup.firstQueuedAt : 0,
  })
  let pollStartRan = false
  const scheduledPollStart = scheduleMessagePollStart(source, () => {
    pollStartRan = true
    messagePollInteractionTask = null
    if (generation !== lifecycleGeneration || !callbacks) {
      return
    }

    const pollStartedAt = Date.now()
    recordCatchupTiming('poll_started', {
      source,
      t: pollStartedAt,
      deferredMs: pollStartedAt - requestedAt,
      wakeupAgeMs: wakeup ? pollStartedAt - wakeup.firstQueuedAt : 0,
      serverSequence: wakeup?.latestServerSequence ?? -1,
    })
    let pollResult: MessagePollResult | void
    void enqueueReceiveWork(() => pollForNewMessages({
      source,
      fullResync: source !== 'websocket' && !mailboxCatchupCompleted ? true : undefined,
      latestServerSequence: wakeup?.latestServerSequence,
      realtimeRequestedAt: wakeup?.firstQueuedAt,
    }))
      .then((result) => {
        pollResult = result
      })
      .catch((error) => {
        console.warn(
          source === 'websocket'
            ? '[Realtime] Failed to poll messages after sealed realtime event:'
            : '[QuantumChat] Scheduled poll failed:',
          error,
        )
      })
      .finally(() => {
        if (generation !== lifecycleGeneration) return
        messagePollInFlight = false
        resolveRealtimeVisibilityTargets(pollResult)
        if (
          source === 'websocket'
          || (source === 'queued' && Boolean(wakeup?.mailboxSequences.size))
        ) {
          scheduleRealtimeVisibilityRetry(wakeup, pollResult)
        }
        recoverRealtimeAfterScheduledPoll(pollResult, source)
        if (pollResult?.fullResyncCompleted) {
          mailboxCatchupCompleted = true
        }
        if (source === 'scheduled' && S.realtimeChannel) {
          if (mailboxCatchupCompleted) {
            consecutiveEmptyScheduledPolls = (pollResult?.directMessageCount ?? 0) > 0
              ? 0
              : Math.min(consecutiveEmptyScheduledPolls + 1, 2)
          }
          if (catchupBurstActive) {
            catchupBurstPolls += 1
            if (
              (mailboxCatchupCompleted && consecutiveEmptyScheduledPolls >= 1)
              || catchupBurstPolls >= REALTIME_CATCHUP_BURST_MAX_POLLS
              || Date.now() - catchupBurstStartedAt >= REALTIME_CATCHUP_BURST_MAX_MS
            ) {
              catchupBurstActive = false
            }
          }
          scheduleMessagePolling()
        }
        const queued = messagePollQueued
        messagePollQueued = null
        recordChatDiagnostic('performance', 'message_poll_request_complete', {
          source,
          elapsedMs: Date.now() - pollStartedAt,
          deferredMs: pollStartedAt - requestedAt,
          queued: Boolean(queued),
          wakeupCount: wakeup?.count ?? 1,
          latestServerSequence: wakeup?.latestServerSequence ?? null,
          queuedForMs: wakeup ? pollStartedAt - wakeup.firstQueuedAt : 0,
        })
        if (queued) {
          if (isWakeupSatisfied(queued, pollResult)) {
            recordChatDiagnostic('performance', 'message_poll_queue_satisfied', {
              queuedCount: queued.count,
              latestServerSequence: queued.latestServerSequence,
              lastServerSequence: pollResult?.lastServerSequence ?? null,
              queuedForMs: Date.now() - queued.firstQueuedAt,
            })
            return
          }
          recordChatDiagnostic('performance', 'message_poll_queue_drained', {
            queuedCount: queued.count,
            latestServerSequence: queued.latestServerSequence ?? null,
            queuedForMs: Date.now() - queued.firstQueuedAt,
          })
          startMessagePoll('queued', queued)
        }
      })
  })
  messagePollInteractionTask = pollStartRan ? null : scheduledPollStart
}

export function startOutboundStatusSync(): void {
  const nextIntervalMs = useTorStore.getState().enabled
    ? TOR_OUTBOUND_STATUS_SYNC_TIMER_MS
    : S.DEFAULT_MESSAGE_POLL_INTERVAL
  if (S.outboundStatusSyncInterval) return

  S.setOutboundStatusSyncInterval(setInterval(() => {
    requestOutboundStatusSync('interval', { skipBackground: true })
  }, nextIntervalMs))
}

function cancelDeferredOutboundStatusSyncSchedule(): void {
  deferredOutboundStatusSyncInteractionTask?.cancel()
  deferredOutboundStatusSyncInteractionTask = null
  if (deferredOutboundStatusSyncTimer) {
    clearTimeout(deferredOutboundStatusSyncTimer)
    deferredOutboundStatusSyncTimer = null
  }
}

function scheduleDeferredOutboundStatusSync(): void {
  if (
    !deferredOutboundStatusSync
    || interactiveChatOpen
    || deferredOutboundStatusSyncInteractionTask
    || deferredOutboundStatusSyncTimer
  ) {
    return
  }

  const generation = lifecycleGeneration
  let interactionTaskRan = false
  const interactionTask = InteractionManager.runAfterInteractions(() => {
    interactionTaskRan = true
    deferredOutboundStatusSyncInteractionTask = null
    if (
      generation !== lifecycleGeneration
      || interactiveChatOpen
      || !deferredOutboundStatusSync
    ) {
      return
    }

    deferredOutboundStatusSyncTimer = setTimeout(() => {
      deferredOutboundStatusSyncTimer = null
      if (
        generation !== lifecycleGeneration
        || interactiveChatOpen
        || !callbacks
        || !deferredOutboundStatusSync
      ) {
        return
      }

      const deferred = deferredOutboundStatusSync
      deferredOutboundStatusSync = null
      requestOutboundStatusSync(`deferred:${deferred.reason}`, {
        force: deferred.force,
      })
    }, DEFERRED_OUTBOUND_STATUS_SYNC_IDLE_DELAY_MS)
  })
  deferredOutboundStatusSyncInteractionTask = interactionTaskRan ? null : interactionTask
}

export function setChatInteractionActive(active: boolean): void {
  if (interactiveChatOpen === active) return

  interactiveChatOpen = active
  if (active) {
    cancelDeferredOutboundStatusSyncSchedule()
    return
  }

  scheduleDeferredOutboundStatusSync()
}

export function requestOutboundStatusSync(
  reason: string,
  options?: { force?: boolean; skipBackground?: boolean },
): void {
  if (!callbacks) return
  if (options?.skipBackground && shouldSkipBackgroundWork('outbound_status_sync', { reason })) return

  if (outboundStatusSyncInFlight) {
    outboundStatusSyncQueued = {
      reason,
      force: options?.force === true || outboundStatusSyncQueued?.force === true,
    }
    recordChatDiagnostic('performance', 'outbound_status_sync_queued', {
      reason,
      force: outboundStatusSyncQueued.force,
    })
    return
  }

  const generation = lifecycleGeneration
  const syncOutboundRelayStatuses = callbacks.syncOutboundRelayStatuses
  const startedAt = Date.now()
  const force = options?.force === true
  const isRoutineStatusSync = reason === 'interval' || reason === 'queued:interval'
  if (!force && interactiveChatOpen && isRoutineStatusSync) {
    deferredOutboundStatusSync = { reason, force }
    recordChatDiagnostic('performance', 'outbound_status_sync_deferred', {
      reason,
    })
    return
  }

  outboundStatusSyncInFlight = true
  recordChatDiagnostic('performance', 'outbound_status_sync_started', { reason, force })
  void syncOutboundRelayStatuses({ force })
    .catch((error) => {
      console.warn('[QuantumChat] Outbound status sync failed:', error)
    })
    .finally(() => {
      if (generation !== lifecycleGeneration) return
      outboundStatusSyncInFlight = false
      const queuedReason = outboundStatusSyncQueued
      outboundStatusSyncQueued = null
      recordChatDiagnostic('performance', 'outbound_status_sync_complete', {
        reason,
        force,
        elapsedMs: Date.now() - startedAt,
        queued: Boolean(queuedReason),
      })
      if (queuedReason) {
        requestOutboundStatusSync(`queued:${queuedReason.reason}`, {
          force: queuedReason.force,
        })
      }
    })
}

export function stopOutboundStatusSync(): void {
  if (S.outboundStatusSyncInterval) {
    clearInterval(S.outboundStatusSyncInterval)
    S.setOutboundStatusSyncInterval(null)
  }
}

function removeOutboundReceiptChannel(deliveryToken: string): void {
  const entry = outboundReceiptChannels.get(deliveryToken)
  if (!entry) return
  outboundReceiptChannels.delete(deliveryToken)
  clearTimeout(entry.timeout)
  entry.channel.close()
}

function stopOutboundReceiptChannels(): void {
  for (const deliveryToken of Array.from(outboundReceiptChannels.keys())) {
    removeOutboundReceiptChannel(deliveryToken)
  }
}

function stopScopedMailboxChannels(): void {
  clearScopedMailboxRetries()
  pendingScopedCatchupTokens = null
  for (const [mailboxToken, entry] of Array.from(scopedMailboxChannels.entries())) {
    scopedMailboxChannels.delete(mailboxToken)
    entry.channel.close()
  }
}

function clearScopedMailboxRetries(): void {
  for (const retry of scopedMailboxRetries.values()) {
    if (retry.timer) clearTimeout(retry.timer)
  }
  scopedMailboxRetries.clear()
}

function clearScopedMailboxRetry(mailboxToken: string): void {
  const retry = scopedMailboxRetries.get(mailboxToken)
  if (retry?.timer) clearTimeout(retry.timer)
  scopedMailboxRetries.delete(mailboxToken)
}

function scheduleScopedMailboxRetry(mailboxToken: string): void {
  const current = scopedMailboxRetries.get(mailboxToken) ?? { attempts: 0, timer: null }
  if (current.timer) return
  current.attempts += 1
  const delayMs = realtimeRetryDelay(current.attempts)
  current.timer = setTimeout(() => {
    current.timer = null
    if (
      !S.realtimeChannel
      || !primaryRealtimeSubscribed
      || scopedMailboxChannels.has(mailboxToken)
      || isRealtimeTransportDisabled()
    ) {
      return
    }
    try {
      if (subscribeScopedMailboxToken(mailboxToken)) {
        queueScopedSubscriptionCatchup([mailboxToken])
      }
    } catch (error) {
      recordChatDiagnostic('transport', 'scoped_mailbox_realtime_retry_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      scheduleScopedMailboxRetry(mailboxToken)
    }
  }, delayMs)
  scopedMailboxRetries.set(mailboxToken, current)
  recordChatDiagnostic('transport', 'scoped_mailbox_realtime_retry_scheduled', {
    attempt: current.attempts,
    delayMs,
  })
}

function stopGroupRealtimeSubscription(): void {
  const channel = groupRealtimeChannel
  groupRealtimeChannel = null
  if (channel) {
    channel.close()
  }
}

function scheduleControlMessageProcessing(): void {
  if (!callbacks) return
  if (controlProcessingInteractionTask || controlProcessingInFlight) {
    controlProcessingQueued = true
    return
  }

  const generation = lifecycleGeneration
  const processControlMessagesNow = callbacks.processControlMessagesNow
  controlProcessingInteractionTask = InteractionManager.runAfterInteractions(() => {
    controlProcessingInteractionTask = null
    if (generation !== lifecycleGeneration || !callbacks) {
      return
    }

    controlProcessingInFlight = true
    void enqueueReceiveWork(processControlMessagesNow)
      .catch((error) => {
        recordChatDiagnostic('control', 'realtime_control_processing_failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
      .finally(() => {
        if (generation !== lifecycleGeneration) return
        controlProcessingInFlight = false
        if (controlProcessingQueued) {
          controlProcessingQueued = false
          scheduleControlMessageProcessing()
        }
      })
  })
}

function pollForRealtimeMessage(
  payload: RealtimeMessagePayload | undefined,
  mailboxToken: string,
): void {
  const nested = payload?.payload
  const deliveryClass = typeof nested?.delivery_class === 'string'
    ? nested.delivery_class
    : 'missing'
  const serverSequence = getRealtimeServerSequence(payload)
  recordCatchupTiming('realtime_event', {
    t: Date.now(),
    hasServerSequence: Boolean(serverSequence),
    serverSequence: serverSequence ?? -1,
    deliveryClass,
    inFlight: messagePollInFlight,
    payloadKeys: nested && typeof nested === 'object'
      ? Object.keys(nested).sort().join(',')
      : 'none',
    mailboxScheme: mailboxToken.startsWith('smbx2.')
      ? 'smbx2'
      : mailboxToken.startsWith('smbx1.')
        ? 'smbx1'
        : 'other',
  })
  if (nested?.delivery_class === 'control') {
    scheduleControlMessageProcessing()
    return
  }
  if (nested?.delivery_class === undefined) {
    scheduleControlMessageProcessing()
  }
  if (!serverSequence) {
    recordChatDiagnostic('transport', 'realtime_message_wakeup_invalid', {
      hasServerSequence: payload?.payload?.server_sequence !== undefined,
      deliveryClass: typeof payload?.payload?.delivery_class === 'string'
        ? payload.payload.delivery_class
        : null,
    })
    requestMessagePoll('subscription_catchup')
    return
  }
  noteRealtimeVisibilityTarget(mailboxToken, serverSequence)
  recordChatDiagnostic('transport', 'realtime_message_wakeup', {
    deliveryClass: payload?.payload?.delivery_class === 'message' ? 'message' : 'legacy',
    serverSequence,
  })
  requestMessagePoll('websocket', serverSequence, mailboxToken)
}

function noteRealtimeSocketUnhealthy(): void {
  primaryRealtimeSubscribed = false
  consecutiveEmptyScheduledPolls = 0
  lastRealtimeWakeupAt = 0
  scheduleMessagePolling()
  requestMessagePoll('subscription_catchup')
}

function scheduleRealtimeRecycle(status: string): void {
  if (!S.realtimeChannel) return
  realtimeRecoveryAttempts += 1
  const recoveryDelay = realtimeRetryDelay(realtimeRecoveryAttempts)
  console.warn(`[Realtime] Channel ${status}, scheduling recovery in ${recoveryDelay}ms`)
  recordChatDiagnostic('transport', 'realtime_channel_recycle', {
    status,
    recoveryDelayMs: recoveryDelay,
  })
  stopRealtimeSubscription()
  scheduleRealtimeRecovery(recoveryDelay)
}

function recoverScopedMailboxSubscriptions(mailboxTokens?: string[]): number {
  if (!mailboxTokens?.length) return 0
  const primaryMailboxToken = S.chatIdentity
    ? deriveRecipientMailboxToken(S.chatIdentity)
    : null
  let recoveredCount = 0
  for (const mailboxToken of new Set(mailboxTokens)) {
    if (
      !isUsableMailboxToken(mailboxToken)
      || mailboxToken === primaryMailboxToken
    ) continue
    if (recycleScopedMailboxSubscription(mailboxToken, 'scheduled_delivery_missed')) {
      recoveredCount++
    }
  }
  return recoveredCount
}

function getMissedRealtimeMailboxTokens(result: MessagePollResult): string[] {
  if (!result.mailboxSequences) return result.mailboxTokens ?? []
  return Array.from(result.mailboxSequences)
    .filter(([mailboxToken, serverSequence]) => (
      (lastRealtimeWakeupSequences.get(mailboxToken) ?? 0) < serverSequence
    ))
    .map(([mailboxToken]) => mailboxToken)
}

function recoverRealtimeAfterScheduledDelivery(result: MessagePollResult | void, source: MessagePollSource): void {
  if (source !== 'scheduled' || !result?.directMessageCount) return
  if (!S.realtimeChannel || !S.chatIdentity || isRealtimeTransportDisabled()) return
  const subscribedCount = subscribeObservedMailboxTokens(result.mailboxTokens)
  if (subscribedCount > 0) {
    recordChatDiagnostic('transport', 'realtime_observed_mailbox_subscriptions', {
      directMessageCount: result.directMessageCount,
      subscribedCount,
      channelCount: scopedMailboxChannels.size,
    })
    void trackRuntimeTask(refreshRealtimeMailboxSubscriptions()).catch((error) => {
      recordChatDiagnostic('transport', 'scoped_mailbox_realtime_refresh_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    })
    return
  }
  const missedMailboxTokens = getMissedRealtimeMailboxTokens(result)
  if (result.mailboxSequences?.size && missedMailboxTokens.length === 0) {
    recordChatDiagnostic('transport', 'scheduled_delivery_after_realtime_wakeup', {
      directMessageCount: result.directMessageCount,
      latestServerSequence: result.lastServerSequence,
    })
    return
  }
  const recoveredScopedCount = recoverScopedMailboxSubscriptions(missedMailboxTokens)
  if (recoveredScopedCount > 0) {
    recordChatDiagnostic('transport', 'scoped_mailbox_realtime_recovery', {
      directMessageCount: result.directMessageCount,
      observedMailboxCount: result.mailboxTokens?.length ?? 0,
      recoveredScopedCount,
    })
    return
  }
  const primaryMailboxToken = deriveRecipientMailboxToken(S.chatIdentity)
  if (missedMailboxTokens.some((token) => (
    isUsableMailboxToken(token) && token !== primaryMailboxToken
  ))) {
    recordChatDiagnostic('transport', 'scoped_mailbox_realtime_recovery_deferred', {
      channelCount: scopedMailboxChannels.size,
      capacityReached: scopedMailboxChannels.size >= MAX_SCOPED_MAILBOX_SUBSCRIPTIONS,
    })
    void trackRuntimeTask(refreshRealtimeMailboxSubscriptions()).catch((error) => {
      recordChatDiagnostic('transport', 'scoped_mailbox_realtime_refresh_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    })
    return
  }

  const elapsedMs = Date.now() - lastMissedRealtimeRecoveryAt
  if (elapsedMs < REALTIME_MISSED_EVENT_RECOVERY_COOLDOWN_MS) {
    recordChatDiagnostic('transport', 'realtime_missed_event_recovery_skipped', {
      directMessageCount: result.directMessageCount,
      cooldownRemainingMs: REALTIME_MISSED_EVENT_RECOVERY_COOLDOWN_MS - elapsedMs,
    })
    return
  }

  lastMissedRealtimeRecoveryAt = Date.now()
  recordChatDiagnostic('transport', 'realtime_missed_event_recovery', {
    directMessageCount: result.directMessageCount,
    lastServerSequence: result.lastServerSequence,
    recoveryDelayMs: REALTIME_MISSED_EVENT_RECOVERY_DELAY_MS,
  })
  stopRealtimeSubscription()
  scheduleRealtimeRecovery(REALTIME_MISSED_EVENT_RECOVERY_DELAY_MS)
}

function recoverRealtimeAfterScheduledPoll(result: MessagePollResult | void, source: MessagePollSource): void {
  if (source !== 'scheduled') return
  if (!S.chatIdentity || isRealtimeTransportDisabled() || !isSpectraBackendConfigured()) return
  if (!S.realtimeChannel) {
    const elapsedMs = Date.now() - lastMissingRealtimeRetryAt
    if (elapsedMs < REALTIME_MISSING_CHANNEL_RETRY_COOLDOWN_MS) return
    if (!hasBoundBackendAccessForIdentity(S.chatIdentity.id) || !getCachedBackendAccessToken()) return
    lastMissingRealtimeRetryAt = Date.now()
    recordChatDiagnostic('transport', 'realtime_missing_channel_recovery', {
      pollSource: source,
      directMessageCount: result?.directMessageCount ?? 0,
      lastServerSequence: result?.lastServerSequence ?? null,
    })
    startRealtimeSubscription()
    return
  }
  if (!primaryRealtimeSubscribed) {
    const elapsedMs = Date.now() - lastMissingRealtimeRetryAt
    if (elapsedMs < REALTIME_MISSING_CHANNEL_RETRY_COOLDOWN_MS) return
    lastMissingRealtimeRetryAt = Date.now()
    recordChatDiagnostic('transport', 'realtime_unconfirmed_channel_recovery', {
      pollSource: source,
      directMessageCount: result?.directMessageCount ?? 0,
      lastServerSequence: result?.lastServerSequence ?? null,
    })
    stopRealtimeSubscription()
    startRealtimeSubscription()
    return
  }
  if (!result?.directMessageCount && Date.now() - lastScopedRealtimeRefreshAt >= REALTIME_SCOPED_REFRESH_COOLDOWN_MS) {
    lastScopedRealtimeRefreshAt = Date.now()
    void trackRuntimeTask(refreshRealtimeMailboxSubscriptions()).catch((error) => {
      recordChatDiagnostic('transport', 'scoped_mailbox_realtime_refresh_failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }
  recoverRealtimeAfterScheduledDelivery(result, source)
}

function maybeRunScopedSubscriptionCatchup(): void {
  const pendingTokens = pendingScopedCatchupTokens
  if (!pendingTokens) return
  let readyCount = 0
  for (const mailboxToken of pendingTokens) {
    const entry = scopedMailboxChannels.get(mailboxToken)
    if (entry?.subscribed) {
      pendingTokens.delete(mailboxToken)
      readyCount++
    }
  }
  if (pendingTokens.size === 0) {
    pendingScopedCatchupTokens = null
  }
  if (readyCount === 0) return
  recordChatDiagnostic('transport', 'scoped_mailbox_catchup_started', {
    mailboxCount: readyCount,
  })
  requestMessagePoll('subscription_catchup')
}

function queueScopedSubscriptionCatchup(mailboxTokens: Iterable<string>): void {
  const tokens = Array.from(mailboxTokens)
  if (tokens.length === 0) return
  pendingScopedCatchupTokens = new Set([
    ...(pendingScopedCatchupTokens ?? []),
    ...tokens,
  ])
  maybeRunScopedSubscriptionCatchup()
}

function subscribeScopedMailboxToken(mailboxToken: string): boolean {
  if (
    scopedMailboxChannels.has(mailboxToken)
    || scopedMailboxChannels.size >= MAX_SCOPED_MAILBOX_SUBSCRIPTIONS
    || !S.realtimeChannel
    || !primaryRealtimeSubscribed
    || isRealtimeTransportDisabled()
  ) return false
  const accessToken = getCachedBackendAccessToken()
  if (!accessToken || !S.chatIdentity) return false

  let subscribedBeforeAssignment = false
  let failedBeforeAssignment = false
  let channel: BackendRealtimeSubscription | null = null

  channel = subscribeBackendRealtime({
    accessToken,
    subscriberId: nextRealtimeSubscriberId('mailbox'),
    topic: `sealed_mailbox:${mailboxToken}`,
    onEvent: (event) => {
      if (event.event === 'sealed_message_insert') {
        pollForRealtimeMessage({ payload: event.payload }, mailboxToken)
        return
      }
      recordCatchupTiming('realtime_event_ignored', {
        eventName: event.event,
        mailboxScheme: mailboxToken.startsWith('smbx2.') ? 'smbx2' : 'other',
      })
    },
    onSubscribed: () => {
      const entry = scopedMailboxChannels.get(mailboxToken)
      if (!channel) {
        subscribedBeforeAssignment = true
      } else if (entry?.channel === channel) {
        entry.subscribed = true
      } else {
        return
      }
      clearScopedMailboxRetry(mailboxToken)
      recordChatDiagnostic('transport', 'scoped_mailbox_realtime_status', {
        status: 'SUBSCRIBED',
      })
      maybeRunScopedSubscriptionCatchup()
    },
    onError: (error) => {
      if (!channel) {
        failedBeforeAssignment = true
      }
      const entry = scopedMailboxChannels.get(mailboxToken)
      const ownsCurrentEntry = !channel || !entry || entry.channel === channel
      if (ownsCurrentEntry) {
        scopedMailboxChannels.delete(mailboxToken)
        pendingScopedCatchupTokens?.delete(mailboxToken)
      }
      recordChatDiagnostic('transport', 'scoped_mailbox_realtime_status', {
        status: 'ERROR',
        error: error.message,
      })
      if (!ownsCurrentEntry) return
      scheduleScopedMailboxRetry(mailboxToken)
      requestMessagePoll('subscription_catchup')
      maybeRunScopedSubscriptionCatchup()
    },
    onLifecycle: (event) => recordRealtimeLifecycle('scoped', event),
  })

  if (failedBeforeAssignment) {
    channel.close()
    return false
  }
  scopedMailboxChannels.set(mailboxToken, {
    channel,
    subscribed: subscribedBeforeAssignment,
    startedAt: Date.now(),
  })
  if (subscribedBeforeAssignment) {
    maybeRunScopedSubscriptionCatchup()
  }
  return true
}

function recycleScopedMailboxSubscription(mailboxToken: string, reason: string): boolean {
  const now = Date.now()
  const lastRecoveryAt = scopedMissedEventRecoveryAt.get(mailboxToken) ?? 0
  if (now - lastRecoveryAt < SCOPED_MISSED_EVENT_RECOVERY_COOLDOWN_MS) {
    return false
  }

  const entry = scopedMailboxChannels.get(mailboxToken)
  scopedMissedEventRecoveryAt.set(mailboxToken, now)
  if (entry) {
    scopedMailboxChannels.delete(mailboxToken)
    entry.channel.close()
  }
  clearScopedMailboxRetry(mailboxToken)
  const subscribed = subscribeScopedMailboxToken(mailboxToken)
  if (subscribed) {
    queueScopedSubscriptionCatchup([mailboxToken])
  }
  recordChatDiagnostic('transport', 'scoped_mailbox_realtime_recycled', {
    reason,
    previousStatus: entry?.subscribed ? 'SUBSCRIBED' : entry ? 'CONNECTING' : 'MISSING',
    restarted: subscribed,
  })
  return subscribed
}

function subscribeObservedMailboxTokens(mailboxTokens?: string[]): number {
  if (!mailboxTokens?.length || !S.realtimeChannel || !primaryRealtimeSubscribed) return 0
  let subscribedCount = 0
  const catchupTokens = new Set<string>()
  const primaryMailboxToken = S.chatIdentity
    ? deriveRecipientMailboxToken(S.chatIdentity)
    : null
  for (const mailboxToken of mailboxTokens) {
    if (
      !isUsableMailboxToken(mailboxToken)
      || mailboxToken === primaryMailboxToken
    ) {
      continue
    }
    const existingEntry = scopedMailboxChannels.get(mailboxToken)
    if (existingEntry) {
      if (!existingEntry.subscribed
        && recycleScopedMailboxSubscription(mailboxToken, 'scheduled_delivery_unconfirmed')) {
        subscribedCount++
      }
      continue
    }
    if (subscribeScopedMailboxToken(mailboxToken)) {
      subscribedCount++
      catchupTokens.add(mailboxToken)
    }
  }
  queueScopedSubscriptionCatchup(catchupTokens)
  return subscribedCount
}

function startGroupRealtimeSubscription(): void {
  // Group delivery uses the authenticated HTTP poll; no extra socket topic.
}

async function registerRealtimeMailboxScope(
  scope: MailboxScopeState,
  generation: number,
  identity: NonNullable<typeof S.chatIdentity>,
  bundleServer: BundleServer & {
    registerMailboxScope: (mailboxToken: string) => Promise<void>
  },
): Promise<MailboxScopeState> {
  const mailboxToken = deriveScopedRecipientMailboxToken({
    recipient: identity,
    scopeSecret: scope.scopeSecret,
    scopeId: scope.scopeId,
    epoch: scope.epoch,
  })
  const timestamp = Date.now()
  const registeredScope = {
    ...scope,
    acknowledgedAt: scope.acknowledgedAt ?? timestamp,
    registeredAt: timestamp,
    registrationVersion: MAILBOX_SCOPE_REGISTRATION_VERSION,
    updatedAt: timestamp,
  }
  await bundleServer.registerMailboxScope(mailboxToken)
  if (generation !== lifecycleGeneration) {
    throw new Error('Subscription lifecycle changed')
  }
  await localChatStorage.storeMailboxScope(registeredScope)
  return registeredScope
}

async function startScopedMailboxSubscriptions(): Promise<void> {
  const generation = lifecycleGeneration
  const identity = S.chatIdentity
  const bundleServer = S.bundleServer as (BundleServer & {
    listRegisteredMailboxTokens?: (identityId: string) => Promise<string[]>
    registerMailboxScope?: (mailboxToken: string) => Promise<void>
  }) | null
  if (
    !identity
    || !S.realtimeChannel
    || !primaryRealtimeSubscribed
    || !isSpectraBackendConfigured()
  ) return

  try {
    const mailboxTokens = await listRealtimeMailboxTokens({
      identity,
      storage: localChatStorage,
      bundleServer,
      registerScope: bundleServer?.registerMailboxScope
        ? (scope) => registerRealtimeMailboxScope(
          scope,
          generation,
          identity,
          bundleServer as BundleServer & {
            registerMailboxScope: (mailboxToken: string) => Promise<void>
          },
        )
        : undefined,
      localScopeMode: 'preferred',
      registeredMailboxMode: 'none',
      registrationUrgency: 'required',
      onRegistryError: (error) => {
        recordChatDiagnostic('transport', 'registered_mailbox_realtime_failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      },
    })
    if (
      generation !== lifecycleGeneration
      || !S.realtimeChannel
      || !primaryRealtimeSubscribed
      || S.chatIdentity?.id !== identity.id
    ) return
    const primaryMailboxToken = deriveRecipientMailboxToken(identity)
    const catchupTokens = new Set<string>()
    for (const mailbox of mailboxTokens) {
      if (
        mailbox.token === primaryMailboxToken
        || !isUsableMailboxToken(mailbox.token)
      ) continue
      const existingEntry = scopedMailboxChannels.get(mailbox.token)
      const created = existingEntry
        ? !existingEntry.subscribed
          && Date.now() - existingEntry.startedAt >= SCOPED_SUBSCRIPTION_STALE_MS
          && recycleScopedMailboxSubscription(mailbox.token, 'acknowledgement_stale')
        : subscribeScopedMailboxToken(mailbox.token)
      if (created) {
        catchupTokens.add(mailbox.token)
      }
    }

    const activeScopeCount = mailboxTokens.filter((mailbox) => mailbox.source === 'local_scope').length
    const registeredScopeCount = mailboxTokens.filter((mailbox) => mailbox.source === 'server_registry').length
    if (mailboxTokens.length > 0) {
      recordChatDiagnostic('transport', 'scoped_mailbox_realtime_subscriptions', {
        activeScopeCount,
        registeredScopeCount,
        channelCount: scopedMailboxChannels.size,
      })
    }
    if (catchupTokens.size > 0) {
      queueScopedSubscriptionCatchup(catchupTokens)
    }
  } catch (error) {
    recordChatDiagnostic('transport', 'scoped_mailbox_realtime_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function scheduleRealtimeMailboxSubscriptionRefresh(): void {
  if (scopedRealtimeRefreshTimer) return
  scopedRealtimeRefreshTimer = setTimeout(() => {
    scopedRealtimeRefreshTimer = null
    void startScopedMailboxSubscriptions()
  }, SCOPED_REALTIME_REFRESH_DEBOUNCE_MS)
}

export async function refreshRealtimeMailboxSubscriptions(): Promise<void> {
  clearScopedRealtimeRefreshTimer()
  await startScopedMailboxSubscriptions()
}

function clearScopedRealtimeRefreshTimer(): void {
  if (!scopedRealtimeRefreshTimer) return
  clearTimeout(scopedRealtimeRefreshTimer)
  scopedRealtimeRefreshTimer = null
}

export function trackOutboundReceiptToken(deliveryToken?: string | null): void {
  if (!deliveryToken || outboundReceiptChannels.has(deliveryToken) || !callbacks || !isSpectraBackendConfigured()) {
    return
  }
  if (outboundReceiptChannels.size >= MAX_RECEIPT_RECOVERY_SUBSCRIPTIONS) {
    requestOutboundStatusSync('receipt_realtime_capacity', { force: true })
    return
  }

  const spectreEnabled = useSpectreStore.getState().enabled
  const torEnabled = useTorStore.getState().enabled
  if (torEnabled || spectreEnabled || !S.chatIdentity || !S.realtimeChannel) {
    return
  }

  if (!hasBoundBackendAccessForIdentity(S.chatIdentity.id)) {
    return
  }
  const accessToken = getCachedBackendAccessToken()
  if (!accessToken) return
  const activeCallbacks = callbacks

  const timeout = setTimeout(() => {
    removeOutboundReceiptChannel(deliveryToken)
  }, RECEIPT_CHANNEL_TTL_MS)

  const channel = subscribeBackendRealtime({
    accessToken,
    subscriberId: nextRealtimeSubscriberId('receipt'),
    topic: `sealed_receipt:${deliveryToken}`,
    onEvent: (event) => {
      if (event.event === 'sealed_receipt_update') {
        const relayMessageId = typeof event.payload?.message_id === 'string'
          ? event.payload.message_id
          : null
        const status = event.payload?.status
        if (relayMessageId && (status === 'delivered' || status === 'read')) {
          void activeCallbacks.applyOutboundRelayStatus(relayMessageId, status).catch((error) => {
            recordChatDiagnostic('transport', 'receipt_realtime_apply_failed', {
              error: error instanceof Error ? error.message : String(error),
            })
            requestOutboundStatusSync('receipt_channel_apply_failed', { force: true })
          })
        } else {
          requestOutboundStatusSync('receipt_channel_invalid_payload', { force: true })
        }
        if (status === 'read') {
          removeOutboundReceiptChannel(deliveryToken)
        }
      }
    },
    onSubscribed: () => {
      recordChatDiagnostic('transport', 'receipt_realtime_status', {
        status: 'SUBSCRIBED',
      })
    },
    onError: () => {
      removeOutboundReceiptChannel(deliveryToken)
    },
    onLifecycle: (event) => recordRealtimeLifecycle('receipt', event),
  })

  outboundReceiptChannels.set(deliveryToken, { channel, timeout })
}

async function restoreOutboundReceiptSubscriptions(): Promise<void> {
  const generation = lifecycleGeneration
  const identity = S.chatIdentity
  if (!identity || !S.realtimeChannel || !primaryRealtimeSubscribed) return

  try {
    const candidates = await localChatStorage.getMessagesNeedingStatusSync(identity.id)
    if (
      generation !== lifecycleGeneration
      || S.chatIdentity?.id !== identity.id
      || !S.realtimeChannel
      || !primaryRealtimeSubscribed
    ) return
    const deliveryTokens = Array.from(new Set(
      candidates
        .sort((left, right) => right.createdAt - left.createdAt)
        .map((message) => message.relayDeliveryToken)
        .filter((token): token is string => typeof token === 'string' && token.length > 0)
    )).slice(0, MAX_RECEIPT_RECOVERY_SUBSCRIPTIONS)
    for (const deliveryToken of deliveryTokens) {
      trackOutboundReceiptToken(deliveryToken)
    }
    if (deliveryTokens.length > 0) {
      recordChatDiagnostic('transport', 'receipt_realtime_subscriptions_restored', {
        channelCount: deliveryTokens.length,
      })
    }
  } catch (error) {
    recordChatDiagnostic('transport', 'receipt_realtime_restore_failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function startMessagePolling(): void {
  const alreadyStarted = messagePollingStarted
  const skipInitialReconcile = alreadyStarted || Boolean(S.pollInterval)
  messagePollingStarted = true
  armMailboxCatchupBurst()

  startOnlineStatusChecking()
  startSessionRefreshTimer()
  startRealtimeSubscription()
  startRealtimeLivenessMonitor()

  if (initialCatchupSettled || skipInitialReconcile) {
    startOutboundStatusSync()
    scheduleMessagePolling()
  }

  if (skipInitialReconcile) return

  const reconcileRequestedAt = Date.now()
  const generation = lifecycleGeneration
  const reconcile = callbacks!.reconcileQuantumChat
  void enqueueReceiveWork(() => {
    const reconcileStartedAt = Date.now()
    return reconcile({ fullResync: true, reason: 'initialization' }).finally(() => {
      if (generation !== lifecycleGeneration) return
      settleInitialMailboxCatchup()
      recordCatchupTiming('initial_reconcile_complete', {
        elapsedMs: Date.now() - reconcileStartedAt,
        deferredMs: reconcileStartedAt - reconcileRequestedAt,
        pollIntervalMs: S.activePollIntervalMs ?? getMessagePollIntervalMs(),
      })
      recordChatDiagnostic('performance', 'initial_reconcile_complete', {
        elapsedMs: Date.now() - reconcileStartedAt,
        deferredMs: reconcileStartedAt - reconcileRequestedAt,
        pollIntervalMs: S.activePollIntervalMs ?? getMessagePollIntervalMs(),
        appState: AppState.currentState,
      })
    })
  }).catch((error) => {
    console.warn('Initial chat reconciliation failed:', error)
  })
}

export function stopMessagePolling(): void {
  messagePollingStarted = false
  if (S.pollInterval) {
    clearInterval(S.pollInterval)
    S.setPollInterval(null)
  }
  if (realtimeMessagePollTimer) {
    clearTimeout(realtimeMessagePollTimer)
    realtimeMessagePollTimer = null
  }
  if (messagePollInteractionTask) {
    messagePollInteractionTask.cancel()
    messagePollInteractionTask = null
    messagePollInFlight = false
  }
  controlProcessingInteractionTask?.cancel()
  controlProcessingInteractionTask = null
  controlProcessingQueued = false
  S.setActivePollIntervalMs(null)
  messagePollQueued = null
  pendingRealtimeWakeup = null
  mailboxCatchupCompleted = false
  consecutiveEmptyScheduledPolls = 0
  resetCatchupBurst()
  outboundStatusSyncQueued = null
  cancelDeferredOutboundStatusSyncSchedule()
  deferredOutboundStatusSync = null
  stopOutboundStatusSync()
  stopOnlineStatusChecking()
  stopSessionRefreshTimer()
  stopRealtimeLivenessMonitor()
}

// Session refresh

export function startSessionRefreshTimer(): void {
  if (S.sessionRefreshTimer) return
  const generation = lifecycleGeneration
  S.setSessionRefreshTimer(setInterval(async () => {
    const authState = useAuthStore.getState()
    const session = authState.session
    if (!session || !S.chatIdentity?.id) return

    const timeToExpiry = session.expiresAt - Date.now()
    if (timeToExpiry <= 0 || timeToExpiry > S.SESSION_REFRESH_BEFORE_EXPIRY_MS) return

    try {
      await ensureBoundBackendAccessForIdentity(S.chatIdentity.id)
      if (generation !== lifecycleGeneration || !callbacks) return
      callbacks.syncBundleServerAccessToken()
      if (S.realtimeChannel) syncRealtimeSubscriptionForTransport()
    } catch {
      // Retry on the next tick.
    }
  }, S.SESSION_REFRESH_CHECK_INTERVAL_MS))
}

export function stopSessionRefreshTimer(): void {
  if (S.sessionRefreshTimer) {
    clearInterval(S.sessionRefreshTimer)
    S.setSessionRefreshTimer(null)
  }
}

// Realtime subscription

/**
 * Subscribes to Realtime unless Tor requires HTTP polling.
 */
export function startRealtimeSubscription(): void {
  if (S.realtimeChannel) {
    const accessToken = getCachedBackendAccessToken()
    if (
      accessToken
      && activeRealtimeAccessToken
      && accessToken !== activeRealtimeAccessToken
    ) {
      recordChatDiagnostic('transport', 'realtime_access_token_rotated', {})
      stopRealtimeSubscription()
    } else {
      void trackRuntimeTask(refreshRealtimeMailboxSubscriptions()).catch((error) => {
        recordChatDiagnostic('transport', 'scoped_mailbox_realtime_refresh_failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
      return
    }
  }
  if (!S.chatIdentity) {
    recordChatDiagnostic('transport', 'realtime_subscription_deferred', {
      reason: 'missing_identity',
      pollIntervalMs: getMessagePollIntervalMs(),
    })
    return
  }
  if (!isSpectraBackendConfigured()) {
    recordChatDiagnostic('transport', 'realtime_subscription_deferred', {
      reason: 'backend_not_configured',
      pollIntervalMs: getMessagePollIntervalMs(),
    })
    return
  }

  const spectreEnabled = useSpectreStore.getState().enabled
  const torEnabled = useTorStore.getState().enabled
  const clearnetAllowed = isClearnetEgressAllowed()
  if (torEnabled || spectreEnabled || !clearnetAllowed) {
    recordChatDiagnostic('transport', 'message_transport_route', {
      route: spectreEnabled
        ? 'spectre_http_polling'
        : torEnabled
          ? 'tor_http_polling'
          : 'clearnet_egress_blocked',
      torEnabled,
      spectreEnabled,
      clearnetAllowed,
      pollIntervalMs: getMessagePollIntervalMs(),
    })
    if (__DEV__) console.log('[Realtime] Private transport boundary active -- skipping WebSocket subscription')
    return
  }

  const recipientMailboxToken = deriveRecipientMailboxToken(S.chatIdentity)

  recordChatDiagnostic('transport', 'message_transport_route', {
    route: 'sealed_backend_realtime_websocket',
    torEnabled: false,
    spectreEnabled: false,
  })

  if (!hasBoundBackendAccessForIdentity(S.chatIdentity.id)) {
    recordChatDiagnostic('transport', 'realtime_subscription_deferred', {
      reason: 'identity_unbound',
      pollIntervalMs: getMessagePollIntervalMs(),
    })
    if (__DEV__) console.log('[Realtime] No verified cloud access available -- deferring WebSocket subscription')
    return
  }

  const accessToken = getCachedBackendAccessToken()
  if (!accessToken) return
  recordChatDiagnostic('transport', 'realtime_subscription_status', {
    status: 'CONNECTING',
    pollIntervalMs: getMessagePollIntervalMs(),
  })
  primaryRealtimeSubscribed = false
  let subscribedBeforeAssignment = false
  let errorBeforeAssignment: Error | null = null
  const markPrimarySubscribed = (): void => {
    const alreadySubscribed = primaryRealtimeSubscribed
    primaryRealtimeSubscribed = true
    realtimeRecoveryAttempts = 0
    recordChatDiagnostic('transport', 'realtime_subscription_status', {
      status: 'SUBSCRIBED',
      pollIntervalMs: getMessagePollIntervalMs(),
    })
    scheduleMessagePolling()
    requestMessagePoll('subscription_catchup')
    if (alreadySubscribed) return
    void trackRuntimeTask(startScopedMailboxSubscriptions())
    void trackRuntimeTask(restoreOutboundReceiptSubscriptions())
  }
  const handlePrimaryError = (error: Error): void => {
    recordChatDiagnostic('transport', 'realtime_subscription_status', {
      status: 'ERROR',
      pollIntervalMs: getMessagePollIntervalMs(),
      error: error.message,
    })
    noteRealtimeSocketUnhealthy()
    scheduleRealtimeRecycle('CHANNEL_ERROR')
  }
  const channel = subscribeBackendRealtime({
    accessToken,
    subscriberId: nextRealtimeSubscriberId('primary'),
    topic: `sealed_mailbox:${recipientMailboxToken}`,
    onEvent: (event) => {
      if (event.event === 'sealed_message_insert') {
        pollForRealtimeMessage({ payload: event.payload }, recipientMailboxToken)
        return
      }
      recordCatchupTiming('realtime_event_ignored', {
        eventName: event.event,
        mailboxScheme: recipientMailboxToken.startsWith('smbx2.') ? 'smbx2' : 'other',
      })
    },
    onSubscribed: () => {
      if (!S.realtimeChannel) {
        subscribedBeforeAssignment = true
        return
      }
      markPrimarySubscribed()
    },
    onError: (error) => {
      if (!S.realtimeChannel) {
        errorBeforeAssignment = error
        return
      }
      handlePrimaryError(error)
    },
    onLifecycle: (event) => recordRealtimeLifecycle('primary', event),
  })
  activeRealtimeAccessToken = accessToken
  S.setRealtimeChannel(channel)
  if (subscribedBeforeAssignment) markPrimarySubscribed()
  if (errorBeforeAssignment) handlePrimaryError(errorBeforeAssignment)

  startGroupRealtimeSubscription()
  scheduleMessagePolling()
  startRealtimeLivenessMonitor()
}

export function syncRealtimeSubscriptionForTransport(): void {
  if (isRealtimeTransportDisabled()) {
    stopRealtimeSubscription()
    scheduleMessagePolling()
    return
  }

  startRealtimeSubscription()
  scheduleMessagePolling()
}

export function scheduleRealtimeRecovery(delayMs: number): void {
  if (realtimeRecoveryTimer) return
  realtimeRecoveryTimer = setTimeout(() => {
    realtimeRecoveryTimer = null
    if (S.chatIdentity && !isRealtimeTransportDisabled()) {
      callbacks!.reconcileQuantumChat({
        fullResync: true,
        restartRealtime: true,
        reason: 'manual_recovery',
      }).catch(() => {})
    }
  }, delayMs)
}

export function startRealtimeLivenessMonitor(): void {
  if (realtimeLivenessTimer) return

  realtimeLivenessTimer = setInterval(() => {
    if (shouldSkipBackgroundWork('realtime_liveness')) return
    if (isRealtimeTransportDisabled()) return

    if (!S.realtimeChannel) {
      if (S.chatIdentity && isSpectraBackendConfigured() && hasBoundBackendAccessForIdentity(S.chatIdentity.id)) {
        if (__DEV__) console.log('[Realtime] Liveness: channel missing, restarting')
        startRealtimeSubscription()
      }
      return
    }
  }, REALTIME_LIVENESS_INTERVAL_MS)
}

export function stopRealtimeLivenessMonitor(): void {
  if (realtimeLivenessTimer) {
    clearInterval(realtimeLivenessTimer)
    realtimeLivenessTimer = null
  }
}

export function stopRealtimeSubscription(): void {
  primaryRealtimeSubscribed = false
  activeRealtimeAccessToken = null
  clearRealtimeVisibilityRetry()
  if (realtimeRecoveryTimer) {
    clearTimeout(realtimeRecoveryTimer)
    realtimeRecoveryTimer = null
  }
  const channel = S.realtimeChannel
  stopOutboundReceiptChannels()
  stopScopedMailboxChannels()
  stopGroupRealtimeSubscription()
  if (channel) {
    S.setRealtimeChannel(null)
    channel.close()
  }
  if (S.pollInterval) {
    scheduleMessagePolling()
  }
}
