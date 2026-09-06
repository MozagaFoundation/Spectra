/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'
import { isSameAccountStorageScope, normalizeAccountStorageScope } from '@/lib/accountScope'
import { abandonChatMediaWithBackend } from '@/services/backend/media'
import { getValidBackendAccessToken } from '@/services/backend/session'
import {
  buildLocalCacheAad,
  openLocalCacheText,
  sealLocalCacheText,
  type LocalCacheCipher,
} from '@/services/storage/localCacheCrypto'
import { useWalletStore } from '@/store/walletStore'

const OUTBOX_PREFIX = 'qc_media_send_outbox_v1_'
const UPLOAD_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000
const MAX_CLEANUP_BATCH = 16
const CLEANUP_CONCURRENCY = 3
const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000
const mediaIdPattern = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/
const objectRefPrefix = 'spectra://objects/'

export type MediaSendOutboxState = 'upload_registered' | 'cleanup_pending'
export type MediaSendRelayOutcome = 'accepted' | 'transient_failure' | 'terminal_failure'

export interface MediaSendOutboxEntry {
  mediaId: string
  objectRef: string
  sendId: string
  conversationId: string
  state: MediaSendOutboxState
  createdAt: number
  updatedAt: number
  expiresAt: number
  cleanupAttemptCount: number
  nextCleanupAt: number
  lastCleanupError?: string
}

interface OutboxPayload {
  v: 1
  entries: MediaSendOutboxEntry[]
}

interface StoredOutbox {
  v: 1
  cipher: LocalCacheCipher
}

export interface RegisterMediaSendUploadInput {
  mediaId: string
  objectRef: string
  sendId: string
  conversationId: string
  expiresAt?: number
}

const scopeLocks = new Map<string, Promise<void>>()
const cleanupTasks = new Map<string, Promise<void>>()
const cleanupRescheduleScopes = new Set<string>()

function resolveScope(walletAddress?: string): string {
  const scope = normalizeAccountStorageScope(
    walletAddress ?? useWalletStore.getState().wallet?.address,
  )
  if (!scope) throw new Error('Media send outbox wallet scope is required')
  return scope
}

function outboxKey(scope: string): string {
  return `${OUTBOX_PREFIX}${scope}`
}

function outboxAad(scope: string): Uint8Array {
  return buildLocalCacheAad(['spectra', 'media-send-outbox', 'v1', scope])
}

function isActiveScope(scope: string): boolean {
  return isSameAccountStorageScope(useWalletStore.getState().wallet?.address, scope)
}

function assertEntryIdentity(mediaId: string, objectRef: string): void {
  if (
    !mediaIdPattern.test(mediaId)
    || !objectRef.startsWith(objectRefPrefix)
    || objectRef.length > 1024
  ) {
    throw new Error('Invalid media send cleanup identity')
  }
}

function isValidEntry(value: unknown): value is MediaSendOutboxEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<MediaSendOutboxEntry>
  return (
    typeof entry.mediaId === 'string'
    && mediaIdPattern.test(entry.mediaId)
    && typeof entry.objectRef === 'string'
    && entry.objectRef.startsWith(objectRefPrefix)
    && entry.objectRef.length <= 1024
    && typeof entry.sendId === 'string'
    && entry.sendId.length > 0
    && entry.sendId.length <= 256
    && typeof entry.conversationId === 'string'
    && entry.conversationId.length > 0
    && entry.conversationId.length <= 256
    && (entry.state === 'upload_registered' || entry.state === 'cleanup_pending')
    && Number.isSafeInteger(entry.createdAt)
    && Number.isSafeInteger(entry.updatedAt)
    && Number.isSafeInteger(entry.expiresAt)
    && Number.isSafeInteger(entry.cleanupAttemptCount)
    && Number.isSafeInteger(entry.nextCleanupAt)
  )
}

async function readOutbox(scope: string): Promise<OutboxPayload> {
  const raw = await getAppKeyValueStorage().getItem(outboxKey(scope))
  if (!raw) return { v: 1, entries: [] }
  const stored = JSON.parse(raw) as StoredOutbox
  if (stored?.v !== 1 || !stored.cipher) throw new Error('Invalid media send outbox')
  const payload = JSON.parse(await openLocalCacheText(
    scope,
    'attachment',
    stored.cipher,
    outboxAad(scope),
  )) as OutboxPayload
  if (
    payload?.v !== 1
    || !Array.isArray(payload.entries)
    || !payload.entries.every(isValidEntry)
  ) {
    throw new Error('Invalid media send outbox payload')
  }
  return payload
}

async function writeOutbox(scope: string, payload: OutboxPayload): Promise<void> {
  if (payload.entries.length === 0) {
    await getAppKeyValueStorage().removeItem(outboxKey(scope))
    return
  }
  const cipher = await sealLocalCacheText(
    scope,
    'attachment',
    JSON.stringify(payload),
    outboxAad(scope),
  )
  await getAppKeyValueStorage().setItem(outboxKey(scope), JSON.stringify({ v: 1, cipher } satisfies StoredOutbox))
}

async function withScopeLock<T>(scope: string, operation: () => Promise<T>): Promise<T> {
  const previous = scopeLocks.get(scope) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.catch(() => undefined).then(() => gate)
  scopeLocks.set(scope, tail)
  await previous.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release()
    if (scopeLocks.get(scope) === tail) scopeLocks.delete(scope)
  }
}

async function mutateOutbox<T>(
  scope: string,
  operation: (entries: MediaSendOutboxEntry[]) => T | Promise<T>,
): Promise<T> {
  return await withScopeLock(scope, async () => {
    const payload = await readOutbox(scope)
    const result = await operation(payload.entries)
    await writeOutbox(scope, payload)
    return result
  })
}

export async function registerMediaSendUpload(
  input: RegisterMediaSendUploadInput,
  walletAddress?: string,
): Promise<void> {
  assertEntryIdentity(input.mediaId, input.objectRef)
  if (
    !input.sendId
    || input.sendId.length > 256
    || !input.conversationId
    || input.conversationId.length > 256
  ) {
    throw new Error('Invalid media send outbox registration')
  }
  const scope = resolveScope(walletAddress)
  const now = Date.now()
  const expiresAt = input.expiresAt ?? now + UPLOAD_EXPIRY_MS
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    throw new Error('Invalid media send outbox expiry')
  }
  await mutateOutbox(scope, (entries) => {
    const existing = entries.find((entry) => entry.mediaId === input.mediaId)
    if (existing) {
      if (
        existing.objectRef !== input.objectRef
        || existing.sendId !== input.sendId
        || existing.conversationId !== input.conversationId
      ) {
        throw new Error('Conflicting media send outbox registration')
      }
      return
    }
    entries.push({
      mediaId: input.mediaId,
      objectRef: input.objectRef,
      sendId: input.sendId,
      conversationId: input.conversationId,
      state: 'upload_registered',
      createdAt: now,
      updatedAt: now,
      expiresAt,
      cleanupAttemptCount: 0,
      nextCleanupAt: expiresAt,
    })
  })
}

export async function markMediaSendRelayAccepted(
  mediaIds: readonly string[],
  walletAddress?: string,
): Promise<void> {
  if (mediaIds.length === 0) return
  const scope = resolveScope(walletAddress)
  const accepted = new Set(mediaIds)
  await mutateOutbox(scope, (entries) => {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (accepted.has(entries[index]!.mediaId)) entries.splice(index, 1)
    }
  })
}

export async function recordMediaSendRelayOutcome(
  mediaIds: readonly string[],
  outcome: MediaSendRelayOutcome,
  walletAddress?: string,
): Promise<void> {
  if (outcome === 'accepted') {
    await markMediaSendRelayAccepted(mediaIds, walletAddress)
    return
  }
  if (outcome === 'terminal_failure') {
    await requestMediaSendAbandonment(mediaIds, walletAddress)
  }
}

export async function requestMediaSendAbandonment(
  mediaIds: readonly string[],
  walletAddress?: string,
): Promise<void> {
  if (mediaIds.length === 0) return
  const scope = resolveScope(walletAddress)
  const requested = new Set(mediaIds)
  await markCleanupPending(scope, (entry) => requested.has(entry.mediaId))
  scheduleMediaSendCleanup(scope)
}

export async function requestMediaSendAbandonmentForSend(
  sendId: string,
  walletAddress?: string,
): Promise<void> {
  if (!sendId || sendId.length > 256) throw new Error('Invalid media send id')
  const scope = resolveScope(walletAddress)
  await markCleanupPending(scope, (entry) => entry.sendId === sendId)
  scheduleMediaSendCleanup(scope)
}

async function markCleanupPending(
  scope: string,
  predicate: (entry: MediaSendOutboxEntry) => boolean,
): Promise<void> {
  const now = Date.now()
  await mutateOutbox(scope, (entries) => {
    for (const entry of entries) {
      if (!predicate(entry) || entry.state === 'cleanup_pending') continue
      entry.state = 'cleanup_pending'
      entry.updatedAt = now
      entry.nextCleanupAt = now
    }
  })
}

export async function listMediaSendOutbox(
  walletAddress?: string,
): Promise<MediaSendOutboxEntry[]> {
  const scope = resolveScope(walletAddress)
  return await withScopeLock(scope, async () => {
    const payload = await readOutbox(scope)
    return payload.entries.map((entry) => ({ ...entry }))
  })
}

export function scheduleMediaSendCleanup(walletAddress?: string): void {
  const scope = resolveScope(walletAddress)
  if (!isActiveScope(scope)) return
  if (cleanupTasks.has(scope)) {
    cleanupRescheduleScopes.add(scope)
    return
  }
  const task = flushMediaSendCleanup(scope).catch(() => undefined).finally(() => {
    if (cleanupTasks.get(scope) !== task) return
    cleanupTasks.delete(scope)
    if (cleanupRescheduleScopes.delete(scope) && isActiveScope(scope)) {
      scheduleMediaSendCleanup(scope)
    }
  })
  cleanupTasks.set(scope, task)
}

export async function flushMediaSendCleanup(
  walletAddress?: string,
  now: number = Date.now(),
): Promise<void> {
  const scope = resolveScope(walletAddress)
  if (!isActiveScope(scope)) return
  const due = await mutateOutbox(scope, (entries) => {
    for (const entry of entries) {
      if (entry.state === 'upload_registered' && entry.expiresAt <= now) {
        entry.state = 'cleanup_pending'
        entry.updatedAt = now
        entry.nextCleanupAt = now
      }
    }
    return entries
      .filter((entry) => entry.state === 'cleanup_pending' && entry.nextCleanupAt <= now)
      .slice(0, MAX_CLEANUP_BATCH)
      .map((entry) => ({ ...entry }))
  })
  if (due.length === 0 || !isActiveScope(scope)) return
  const accessToken = await getValidBackendAccessToken()
  if (!accessToken || !isActiveScope(scope)) return

  let cursor = 0
  const workers = Array.from(
    { length: Math.min(CLEANUP_CONCURRENCY, due.length) },
    async () => {
      while (cursor < due.length) {
        const entry = due[cursor]
        cursor += 1
        if (!entry || !isActiveScope(scope)) return
        try {
          await abandonChatMediaWithBackend(entry.mediaId, entry.objectRef, { accessToken })
          if (!isActiveScope(scope)) return
          await mutateOutbox(scope, (entries) => {
            const index = entries.findIndex((candidate) => candidate.mediaId === entry.mediaId)
            if (index >= 0 && entries[index]!.state === 'cleanup_pending') {
              entries.splice(index, 1)
            }
          })
        } catch (error) {
          if (!isActiveScope(scope)) return
          await recordCleanupFailure(scope, entry.mediaId, error, now)
        }
      }
    },
  )
  await Promise.all(workers)
}

async function recordCleanupFailure(
  scope: string,
  mediaId: string,
  error: unknown,
  now: number,
): Promise<void> {
  await mutateOutbox(scope, (entries) => {
    const entry = entries.find((candidate) => candidate.mediaId === mediaId)
    if (!entry || entry.state !== 'cleanup_pending') return
    entry.cleanupAttemptCount = Math.min(entry.cleanupAttemptCount + 1, 32)
    const exponent = Math.min(entry.cleanupAttemptCount - 1, 10)
    const retryDelay = Math.min(MAX_BACKOFF_MS, 30_000 * (2 ** exponent))
    entry.nextCleanupAt = now + retryDelay
    entry.updatedAt = now
    entry.lastCleanupError = (error instanceof Error ? error.message : String(error)).slice(0, 256)
  })
}

