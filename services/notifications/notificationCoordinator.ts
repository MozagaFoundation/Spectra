/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'
import {
  isLegacySealedMessagePushData,
  normalizeSealedMessagePushData,
  type SealedMessagePushData,
} from '@spectra/privacy-protocol'

import { isSameAccountStorageScope } from '@/lib/accountScope'
import { useAuthStore } from '@/store/authStore'
import { useExoAccountNotificationStore } from '@/store/exoAccountNotificationStore'
import { useWalletStore } from '@/store/walletStore'
import { resolveNotificationScopeWallet } from './notificationScope'
import { prefetchSealedMailbox } from './sealedMailboxPrefetch'

const PENDING_MESSAGING_WORK_KEY = 'spectra:pending_messaging_notification:v2'
const LEGACY_PENDING_CHAT_WAKEUP_KEY = 'spectra:pending_chat_wakeup:v1'
const PENDING_WORK_TTL_MS = 24 * 60 * 60 * 1000
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000
const MAX_DEDUP_EVENTS = 256
const WAKEUP_COALESCE_MS = 25
const LEGACY_ACTIVE_SCOPE = 'legacy_active'

export type MessagingPushIngressSource = 'received' | 'response' | 'background'
export type MessagingReconciliationSource =
  | MessagingPushIngressSource
  | 'bootstrap'
  | 'persona_activation'
  | 'unlock'

interface PendingMessagingWork {
  notificationScopeId: string
  notificationEventId: string
  source: MessagingReconciliationSource
  createdAt: number
}

interface ActiveMessagingWork extends PendingMessagingWork {
  walletAddress: string
  sources: Set<MessagingReconciliationSource>
  legacy?: boolean
}

interface PendingLegacyMessagingWork {
  notificationEventId: string
  source: MessagingReconciliationSource
  createdAt: number
}

const seenEvents = new Map<string, number>()
const activeWork = new Map<string, ActiveMessagingWork>()
let pendingStorageMutation: Promise<unknown> = Promise.resolve()
let reconciliationPromise: Promise<void> | null = null
let coordinatorGeneration = 0
let legacyEventSequence = 0

function parsePendingWork(raw: string | null): PendingMessagingWork[] {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []

    const now = Date.now()
    const entries = new Map<string, PendingMessagingWork>()
    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue
      const candidate = value as Partial<PendingMessagingWork>
      const normalized = normalizeSealedMessagePushData({
        notificationScopeId: candidate.notificationScopeId,
        notificationEventId: candidate.notificationEventId,
      })
      if (
        !normalized ||
        typeof candidate.createdAt !== 'number' ||
        now - candidate.createdAt > PENDING_WORK_TTL_MS
      ) {
        continue
      }

      entries.set(normalized.notificationScopeId, {
        ...normalized,
        source: normalizeReconciliationSource(candidate.source),
        createdAt: candidate.createdAt,
      })
    }
    return [...entries.values()]
  } catch {
    return []
  }
}

function normalizeReconciliationSource(value: unknown): MessagingReconciliationSource {
  switch (value) {
  case 'received':
  case 'response':
  case 'background':
  case 'bootstrap':
  case 'persona_activation':
  case 'unlock':
    return value
  default:
    return 'bootstrap'
  }
}

function parsePendingLegacyWork(raw: string | null): PendingLegacyMessagingWork | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<PendingLegacyMessagingWork>
    if (
      typeof value.createdAt !== 'number'
      || Date.now() - value.createdAt > PENDING_WORK_TTL_MS
    ) {
      return null
    }
    return {
      notificationEventId: typeof value.notificationEventId === 'string'
        ? value.notificationEventId
        : `legacy.migrated.${value.createdAt}`,
      source: normalizeReconciliationSource(value.source),
      createdAt: value.createdAt,
    }
  } catch {
    return null
  }
}

async function readPendingWork(): Promise<PendingMessagingWork[]> {
  const raw = await getAppKeyValueStorage().getItem(PENDING_MESSAGING_WORK_KEY)
  const entries = parsePendingWork(raw)
  if (raw && entries.length === 0) {
    await getAppKeyValueStorage().removeItem(PENDING_MESSAGING_WORK_KEY)
  }
  return entries
}

async function readPendingLegacyWork(): Promise<PendingLegacyMessagingWork | null> {
  const raw = await getAppKeyValueStorage().getItem(LEGACY_PENDING_CHAT_WAKEUP_KEY)
  const pending = parsePendingLegacyWork(raw)
  if (raw && !pending) {
    await getAppKeyValueStorage().removeItem(LEGACY_PENDING_CHAT_WAKEUP_KEY)
  }
  return pending
}

async function readSettledPendingWork(): Promise<PendingMessagingWork[]> {
  await pendingStorageMutation.catch(() => undefined)
  return readPendingWork()
}

async function readSettledPendingLegacyWork(): Promise<PendingLegacyMessagingWork | null> {
  await pendingStorageMutation.catch(() => undefined)
  return readPendingLegacyWork()
}

async function writePendingWork(entries: PendingMessagingWork[]): Promise<void> {
  if (entries.length === 0) {
    await getAppKeyValueStorage().removeItem(PENDING_MESSAGING_WORK_KEY)
    return
  }
  await getAppKeyValueStorage().setItem(PENDING_MESSAGING_WORK_KEY, JSON.stringify(entries))
}

function withPendingStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingStorageMutation
    .catch(() => undefined)
    .then(operation)
  pendingStorageMutation = result
  return result
}

function mutatePendingWork<T>(
  mutation: (entries: PendingMessagingWork[]) => Promise<T>,
): Promise<T> {
  return withPendingStorageLock(async () => mutation(await readPendingWork()))
}

async function rememberPendingWork(work: PendingMessagingWork): Promise<void> {
  await mutatePendingWork(async (entries) => {
    const next = entries.filter((entry) => entry.notificationScopeId !== work.notificationScopeId)
    next.push(work)
    await writePendingWork(next)
  })
}

async function removeCompletedPendingWork(completed: PendingMessagingWork[]): Promise<void> {
  if (completed.length === 0) return
  await mutatePendingWork(async (entries) => {
    const next = entries.filter((entry) => !completed.some((work) =>
      entry.notificationScopeId === work.notificationScopeId
      && entry.notificationEventId === work.notificationEventId
    ))
    await writePendingWork(next)
  })
}

async function rememberPendingLegacyWork(
  source: MessagingReconciliationSource,
): Promise<PendingLegacyMessagingWork> {
  const work = {
    notificationEventId: `legacy.${Date.now()}.${++legacyEventSequence}`,
    source,
    createdAt: Date.now(),
  }
  await withPendingStorageLock(async () => {
    await getAppKeyValueStorage().setItem(LEGACY_PENDING_CHAT_WAKEUP_KEY, JSON.stringify(work))
  })
  return work
}

async function removeCompletedPendingLegacyWork(
  completed: PendingLegacyMessagingWork,
): Promise<void> {
  await withPendingStorageLock(async () => {
    const current = await readPendingLegacyWork()
    if (current?.notificationEventId === completed.notificationEventId) {
      await getAppKeyValueStorage().removeItem(LEGACY_PENDING_CHAT_WAKEUP_KEY)
    }
  })
}

function pruneSeenEvents(now: number): void {
  for (const [eventId, seenAt] of seenEvents) {
    if (now - seenAt > DEDUP_TTL_MS) {
      seenEvents.delete(eventId)
    }
  }
  while (seenEvents.size >= MAX_DEDUP_EVENTS) {
    const oldest = seenEvents.keys().next().value
    if (typeof oldest !== 'string') break
    seenEvents.delete(oldest)
  }
}

function claimEvent(notificationEventId: string): boolean {
  const now = Date.now()
  pruneSeenEvents(now)
  if (seenEvents.has(notificationEventId)) return false
  seenEvents.set(notificationEventId, now)
  return true
}

function canPrefetchWallet(walletAddress: string): boolean {
  if (!walletAddress) return false
  return useWalletStore.getState().wallet?.spectreMode !== true
}

async function prefetchIfNeeded(
  walletAddress: string,
  source: MessagingReconciliationSource,
): Promise<void> {
  if (!canPrefetchWallet(walletAddress)) return
  if (source === 'background') {
    await prefetchSealedMailbox(walletAddress)
    return
  }
  void prefetchSealedMailbox(walletAddress)
}

function canReconcileWallet(walletAddress: string): boolean {
  const auth = useAuthStore.getState()
  const wallet = useWalletStore.getState()
  return auth.isAuthenticated
    && auth.isCloudAuthVerified
    && auth.isIdentityBound
    && wallet.isVaultUnlocked
    && isSameAccountStorageScope(wallet.wallet?.address, walletAddress)
    && wallet.wallet?.spectreMode !== true
}

function mergeActiveWork(work: ActiveMessagingWork): void {
  const existing = activeWork.get(work.notificationScopeId)
  if (!existing) {
    activeWork.set(work.notificationScopeId, work)
    return
  }

  existing.notificationEventId = work.notificationEventId
  existing.createdAt = Math.max(existing.createdAt, work.createdAt)
  for (const source of work.sources) {
    existing.sources.add(source)
  }
}

async function reconcileActiveWallet(): Promise<boolean> {
  const { initializeQuantumChat, reconcileMessagingPushWakeup } = await import('../quantumChat')
  const initialized = await initializeQuantumChat()
  if (!initialized) {
    throw new Error('Messaging runtime is not ready')
  }

  return reconcileMessagingPushWakeup()
}

async function isMessagingRuntimeReady(): Promise<boolean> {
  const { isQuantumChatInitialized } = await import('../quantumChat')
  return isQuantumChatInitialized()
}

async function drainActiveWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, WAKEUP_COALESCE_MS))

  while (activeWork.size > 0) {
    const generation = coordinatorGeneration
    const batch = [...activeWork.values()]
    activeWork.clear()
    const eligible = batch.filter((work) => canReconcileWallet(work.walletAddress))
    if (eligible.length === 0) {
      continue
    }

    try {
      const completed = await reconcileActiveWallet()
      if (generation !== coordinatorGeneration) return
      if (!completed) {
        for (const work of eligible) {
          mergeActiveWork(work)
        }
        return
      }
      await removeCompletedPendingWork(eligible.filter((work) => !work.legacy))
      const legacyWork = eligible.find((work) => work.legacy)
      if (legacyWork) {
        await removeCompletedPendingLegacyWork(legacyWork)
      }
    } catch (error) {
      if (generation === coordinatorGeneration) {
        for (const work of eligible) {
          mergeActiveWork(work)
        }
      }
      throw error
    }
  }
}

function queueActiveWork(work: ActiveMessagingWork): Promise<void> {
  mergeActiveWork(work)
  if (!reconciliationPromise) {
    reconciliationPromise = drainActiveWork()
      .finally(() => {
        reconciliationPromise = null
      })
  }
  return reconciliationPromise
}

async function markInactiveWalletUnread(walletAddress: string): Promise<void> {
  const { wallet } = useWalletStore.getState()
  if (isSameAccountStorageScope(wallet?.address, walletAddress)) return
  await useExoAccountNotificationStore.getState().markWalletUnread(walletAddress)
}

function activeWorkFromPending(
  work: PendingMessagingWork,
  walletAddress: string,
  source: MessagingReconciliationSource,
): ActiveMessagingWork {
  return {
    ...work,
    source,
    walletAddress,
    sources: new Set([work.source, source]),
  }
}

function activeLegacyWorkFromPending(
  work: PendingLegacyMessagingWork,
  walletAddress: string,
  source: MessagingReconciliationSource,
): ActiveMessagingWork {
  return {
    notificationScopeId: LEGACY_ACTIVE_SCOPE,
    notificationEventId: work.notificationEventId,
    source,
    createdAt: work.createdAt,
    walletAddress,
    sources: new Set([work.source, source]),
    legacy: true,
  }
}

export function normalizeMessagingPushPayload(
  data: Record<string, unknown> | null | undefined,
): SealedMessagePushData | null {
  return normalizeSealedMessagePushData(data)
}

export async function enqueueMessagingPush(
  data: Record<string, unknown> | null | undefined,
  source: MessagingPushIngressSource,
): Promise<boolean> {
  const payload = normalizeMessagingPushPayload(data)
  if (!payload) {
    if (!isLegacySealedMessagePushData(data)) {
      return false
    }

    const work = await rememberPendingLegacyWork(source)
    const { wallet } = useWalletStore.getState()
    if (!wallet?.address || !canReconcileWallet(wallet.address)) {
      if (wallet?.address) {
        await prefetchIfNeeded(wallet.address, source)
      }
      return true
    }
    if (!(await isMessagingRuntimeReady())) {
      await prefetchIfNeeded(wallet.address, source)
      return true
    }

    await queueActiveWork(activeLegacyWorkFromPending(work, wallet.address, source))
    return true
  }

  const work: PendingMessagingWork = {
    ...payload,
    source,
    createdAt: Date.now(),
  }
  if (!claimEvent(payload.notificationEventId)) {
    return false
  }

  // Persist before SecureStore: locked headless delivery may not resolve a scope.
  await rememberPendingWork(work)
  let walletAddress: string | null = null
  try {
    walletAddress = await resolveNotificationScopeWallet(payload.notificationScopeId)
  } catch {
    return true
  }
  if (!walletAddress) {
    return true
  }

  if (!canReconcileWallet(walletAddress)) {
    await markInactiveWalletUnread(walletAddress)
    await prefetchIfNeeded(walletAddress, source)
    return true
  }
  if (!(await isMessagingRuntimeReady())) {
    await prefetchIfNeeded(walletAddress, source)
    return true
  }

  await queueActiveWork(activeWorkFromPending(work, walletAddress, source))
  return true
}

export async function consumePendingMessagingNotifications(
  source: Extract<MessagingReconciliationSource, 'bootstrap' | 'persona_activation' | 'unlock'>,
): Promise<boolean> {
  const { wallet, isVaultUnlocked } = useWalletStore.getState()
  if (!wallet?.address || wallet.spectreMode === true || !isVaultUnlocked || !useAuthStore.getState().isAuthenticated) {
    return false
  }

  const [pending, legacyPending] = await Promise.all([
    readSettledPendingWork(),
    readSettledPendingLegacyWork(),
  ])
  let consumed = false
  for (const work of pending) {
    const walletAddress = await resolveNotificationScopeWallet(work.notificationScopeId)
    if (!walletAddress) {
      continue
    }
    if (!isSameAccountStorageScope(walletAddress, wallet.address)) {
      await markInactiveWalletUnread(walletAddress)
      continue
    }

    consumed = true
    mergeActiveWork(activeWorkFromPending(work, walletAddress, source))
  }
  if (legacyPending) {
    consumed = true
    mergeActiveWork(activeLegacyWorkFromPending(legacyPending, wallet.address, source))
  }

  if (consumed && source !== 'unlock') {
    await queueActiveWork([...activeWork.values()][0]!)
  }
  return consumed
}

export async function clearPendingMessagingNotificationStorage(): Promise<void> {
  coordinatorGeneration++
  activeWork.clear()
  seenEvents.clear()
  await withPendingStorageLock(async () => {
    await writePendingWork([])
    await getAppKeyValueStorage().removeItem(LEGACY_PENDING_CHAT_WAKEUP_KEY)
  })
  const { clearSealedPrefetchRows } = await import('@/services/storage/sealedPrefetchCache')
  const { clearPrefetchSession } = await import('./prefetchSession')
  await Promise.all([
    clearSealedPrefetchRows(),
    clearPrefetchSession(),
  ])
}

export async function hasPendingMessagingNotifications(): Promise<boolean> {
  const [scoped, legacy] = await Promise.all([
    readSettledPendingWork(),
    readSettledPendingLegacyWork(),
  ])
  return scoped.length > 0 || legacy !== null
}
