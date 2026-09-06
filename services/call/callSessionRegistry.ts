/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'
import type { CallEndReason, CallType } from '@/lib/types'
import { describeCallError, recordCallDiagnostic } from './callDiagnostics'

export const CALL_SESSION_REGISTRY_KEY = 'spectra.call-session-registry.v1'
const HANDLED_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PENDING_SESSION_TTL_MS = 2 * 60 * 60 * 1000

type CallPushSource = 'expo' | 'message'

export interface IncomingCallPushPayload {
  type: 'call' | 'call_end'
  callSessionId: string
  callType?: CallType
  notificationScopeId?: string
  callerIdentityId?: string
  callerName?: string
  conversationId?: string
  endReason?: CallEndReason
  receivedAt: number
  source: CallPushSource
}

interface StoredCallSessionRegistry {
  handled: Record<string, number>
  pending: Record<string, IncomingCallPushPayload>
}

function emptyRegistry(): StoredCallSessionRegistry {
  return {
    handled: {},
    pending: {},
  }
}
let registryMutationQueue: Promise<void> = Promise.resolve()
const registryListeners = new Set<() => void>()

function notifyRegistryListeners(): void {
  for (const listener of registryListeners) {
    try {
      listener()
    } catch {}
  }
}

function isCallType(value: unknown): value is CallType {
  return value === 'voice' || value === 'video'
}

function isCallEndReason(value: unknown): value is CallEndReason {
  return (
    value === 'completed' ||
    value === 'declined' ||
    value === 'busy' ||
    value === 'timeout' ||
    value === 'network_error' ||
    value === 'crypto_error' ||
    value === 'cancelled' ||
    value === 'missed'
  )
}

function pruneRegistry(registry: StoredCallSessionRegistry): StoredCallSessionRegistry {
  const now = Date.now()
  const handled: Record<string, number> = {}
  const pending: Record<string, IncomingCallPushPayload> = {}

  for (const [sessionId, handledAt] of Object.entries(registry.handled || {})) {
    if (typeof handledAt === 'number' && now - handledAt <= HANDLED_SESSION_TTL_MS) {
      handled[sessionId] = handledAt
    }
  }

  for (const [sessionId, payload] of Object.entries(registry.pending || {})) {
    if (!payload || typeof payload.receivedAt !== 'number') {
      continue
    }

    if (now - payload.receivedAt <= PENDING_SESSION_TTL_MS) {
      pending[sessionId] = payload
    }
  }

  return { handled, pending }
}

async function readRegistry(): Promise<StoredCallSessionRegistry> {
  try {
    const raw = await getAppKeyValueStorage().getItem(CALL_SESSION_REGISTRY_KEY)
    if (!raw) {
      return emptyRegistry()
    }

    const parsed = JSON.parse(raw) as StoredCallSessionRegistry
    return pruneRegistry({
      handled: parsed?.handled || {},
      pending: parsed?.pending || {},
    })
  } catch (error) {
    recordCallDiagnostic('recovery', 'registry_read_failed', {
      error: describeCallError(error),
    })
    return emptyRegistry()
  }
}

async function writeRegistry(registry: StoredCallSessionRegistry): Promise<void> {
  const next = pruneRegistry(registry)
  recordCallDiagnostic('recovery', 'registry_write', {
    pendingCount: Object.keys(next.pending).length,
    handledCount: Object.keys(next.handled).length,
  })
  await getAppKeyValueStorage().setItem(CALL_SESSION_REGISTRY_KEY, JSON.stringify(next))
}

async function mutateRegistry(
  mutate: (registry: StoredCallSessionRegistry) => boolean | void,
): Promise<boolean> {
  const mutation = registryMutationQueue.then(async () => {
    const registry = await readRegistry()
    if (mutate(registry) === false) {
      return false
    }
    await writeRegistry(registry)
    return true
  })
  registryMutationQueue = mutation.then(() => undefined, () => undefined)
  const changed = await mutation
  if (changed) {
    notifyRegistryListeners()
  }
  return changed
}

export function subscribeToIncomingCallSessionChanges(listener: () => void): () => void {
  registryListeners.add(listener)
  return () => {
    registryListeners.delete(listener)
  }
}

export function normalizeIncomingCallPushPayload(
  raw: Record<string, unknown> | null | undefined,
  source: CallPushSource,
): IncomingCallPushPayload | null {
  if (!raw) {
    recordCallDiagnostic('recovery', 'normalize_push_payload_skipped', {
      source,
      reason: 'empty_payload',
    })
    return null
  }

  const type = raw.type
  if (type !== 'call' && type !== 'call_end') {
    recordCallDiagnostic('recovery', 'normalize_push_payload_skipped', {
      source,
      reason: 'unsupported_type',
    })
    return null
  }

  const callSessionId =
    typeof raw.callSessionId === 'string'
      ? raw.callSessionId
      : typeof raw.sessionId === 'string'
        ? raw.sessionId
        : null

  if (!callSessionId) {
    recordCallDiagnostic('recovery', 'normalize_push_payload_skipped', {
      source,
      type,
      reason: 'missing_session_id',
    })
    return null
  }

  const callType = isCallType(raw.callType) ? raw.callType : undefined
  if (type === 'call' && !callType) {
    recordCallDiagnostic('recovery', 'normalize_push_payload_skipped', {
      source,
      type,
      sessionId: callSessionId,
      reason: 'missing_call_type',
    })
    return null
  }

  const notificationScopeId =
    typeof raw.notificationScopeId === 'string' &&
      /^nsc1\.[0-9a-f]{32}$/.test(raw.notificationScopeId)
      ? raw.notificationScopeId
      : undefined

  const normalized: IncomingCallPushPayload = {
    type,
    callSessionId,
    callType,
    notificationScopeId,
    callerIdentityId:
      typeof raw.callerIdentityId === 'string'
        ? raw.callerIdentityId
        : typeof raw.remoteIdentityId === 'string'
          ? raw.remoteIdentityId
          : undefined,
    callerName: typeof raw.callerName === 'string' ? raw.callerName : undefined,
    conversationId: typeof raw.conversationId === 'string' ? raw.conversationId : undefined,
    endReason: isCallEndReason(raw.endReason)
      ? raw.endReason
      : isCallEndReason(raw.reason)
        ? raw.reason
        : undefined,
    receivedAt: Date.now(),
    source,
  }

  recordCallDiagnostic('recovery', 'normalize_push_payload_succeeded', {
    source,
    sessionId: normalized.callSessionId,
    type: normalized.type,
    callType: normalized.callType,
  })

  return normalized
}

export async function rememberIncomingCallSession(
  payload: IncomingCallPushPayload,
): Promise<boolean> {
  recordCallDiagnostic('recovery', 'remember_incoming_call_session', {
    sessionId: payload.callSessionId,
    source: payload.source,
    type: payload.type,
    callType: payload.callType,
  })
  return mutateRegistry((registry) => {
    if (registry.handled[payload.callSessionId]) {
      recordCallDiagnostic('recovery', 'remember_incoming_call_session_skipped', {
        sessionId: payload.callSessionId,
        reason: 'already_handled',
      })
      return false
    }
    if (registry.pending[payload.callSessionId]) {
      recordCallDiagnostic('recovery', 'remember_incoming_call_session_skipped', {
        sessionId: payload.callSessionId,
        reason: 'already_pending',
      })
      return false
    }
    registry.pending[payload.callSessionId] = payload
    return true
  })
}

export async function getPendingIncomingCallSession(
  sessionId?: string,
): Promise<IncomingCallPushPayload | null> {
  const registry = await readRegistry()

  if (sessionId) {
    const pending = registry.pending[sessionId] || null
    recordCallDiagnostic('recovery', 'get_pending_incoming_call_session', {
      sessionId,
      found: Boolean(pending),
      mode: 'by_session',
    })
    return pending
  }

  const values = Object.values(registry.pending)
    .sort((left, right) => right.receivedAt - left.receivedAt)
  if (values.length === 0) {
    return null
  }

  recordCallDiagnostic('recovery', 'get_pending_incoming_call_session', {
    found: true,
    mode: 'latest',
    sessionId: values[0]?.callSessionId,
  })
  return values[0]
}

export async function getPendingIncomingCallSessions(): Promise<IncomingCallPushPayload[]> {
  const registry = await readRegistry()
  return Object.values(registry.pending)
    .sort((left, right) => right.receivedAt - left.receivedAt)
}

export async function clearPendingIncomingCallSession(sessionId: string): Promise<void> {
  recordCallDiagnostic('recovery', 'clear_pending_incoming_call_session', { sessionId })
  await mutateRegistry((registry) => {
    delete registry.pending[sessionId]
  })
}

export async function markCallSessionHandled(sessionId: string): Promise<void> {
  recordCallDiagnostic('recovery', 'mark_call_session_handled', { sessionId })
  await mutateRegistry((registry) => {
    registry.handled[sessionId] ??= Date.now()
    delete registry.pending[sessionId]
  })
}
