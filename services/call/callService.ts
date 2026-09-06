/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Creates call invitations and encrypted WebRTC signaling.
 */

import { isSpectraBackendConfigured } from '@/services/backend/client'
import { backendData } from '@/services/backend/data'
import {
  subscribeBackendRealtime,
  type BackendRealtimeSubscription,
  type BackendRealtimeLifecycleEvent,
} from '@/services/backend/realtime'
import { createRealtimeSubscriberId } from '@/services/backend/realtimeSubscriberId'
import { getCachedBackendAccessToken } from '../backend/session'
import { AppState } from 'react-native'
import {
  ensureBoundBackendAccessForIdentity,
  hasBoundBackendAccessForIdentity,
  invalidateAuthCaches,
} from '../backend/session'
import {
  generateRandomBytes, 
  bytesToBase64, 
  base64ToBytes,
  generateUUID,
  encryptBinary,
  decryptBinary,
  dilithiumSignAsync,
  dilithiumVerifyAsync,
} from '@spectra/core-crypto'
import { getActiveSessionByRemoteIdentity, getIdentity, getLocalDilithiumPrivateKey } from '../quantumChat'
import type { CallType, CallState, CallEndReason } from '@/lib/types'
import { createCallInvitationMessage } from '../shared/callInvitationFormat'
import { isTerminalCallState, shouldIgnoreCallStateTransition } from './callLifecycleUtils'
import {
  describeCallError,
  recordCallDiagnostic,
  startCallLatencySpan,
  type CallDiagnosticField,
} from './callDiagnostics'
import { assertCallAdmission } from './callAdmission'

export interface CallSession {
  id: string
  callerIdentityId: string
  calleeIdentityId: string
  conversationId: string
  callType: CallType
  state: CallState
  isOutgoing: boolean
  encryptionKey: string
  localDilithiumPrivateKey: string | null
  remoteDilithiumPublicKey: string | null
  startedAt?: number
  endedAt?: number
  durationMs?: number
  endReason?: CallEndReason
  signalSequence: number
  lastReceivedSequence: number
}

export interface CallSignal {
  id: string
  callSessionId: string
  senderIdentityId: string
  recipientIdentityId: string
  signalType: 'offer' | 'answer' | 'ice_candidate' | 'hangup' | 'busy' | 'ringing'
  encryptedPayload: string
  nonce: string
  authTag: string
  signature: string
  sequenceNumber: number
  createdAt: number
}

export interface CallSessionSnapshot {
  id: string
  callerIdentityId: string
  calleeIdentityId: string
  conversationId: string
  callType: CallType
  state: CallState
  endReason?: CallEndReason | null
  createdAt: number
  updatedAt: number
  startedAt?: number
  endedAt?: number
}

export interface RTCOffer {
  type: 'offer'
  sdp: string
}

export interface RTCAnswer {
  type: 'answer'
  sdp: string
}

export interface RTCIceCandidate {
  candidate: string
  sdpMLineIndex: number | null
  sdpMid: string | null
}

export type SignalPayload = RTCOffer | RTCAnswer | RTCIceCandidate | { reason: CallEndReason }
const CALL_SESSION_HEARTBEAT_MS = 4_000
const CALL_SIGNAL_POLL_INTERVAL_MS = 2_000
const CALL_SIGNAL_REALTIME_BACKUP_POLL_INTERVAL_MS = 10_000
const CALL_SIGNAL_SEND_RETRY_DELAYS_MS = [250, 750, 1_500] as const
const CALL_AUTH_BINDING_ERROR = 'Secure call setup is still syncing. Please wait a moment and try again.'

type SignalHandler = (
  signal: CallSignal['signalType'],
  payload: SignalPayload,
) => Promise<void> | void

type IncomingSignalRecord = {
  id: string
  signal_type: CallSignal['signalType']
  encrypted_payload: string
  nonce: string
  auth_tag: string
  signature: string
  sequence_number: number
  recipient_identity_id?: string
}

type ConsumeSignalResult = {
  processedIds: string[]
  expiredIds: string[]
}

function buildCallDiagnosticsFields(
  session: CallSession | null | undefined,
  fields: Record<string, CallDiagnosticField> = {},
): Record<string, CallDiagnosticField> {
  return {
    sessionId: session?.id,
    direction: session ? (session.isOutgoing ? 'outgoing' : 'incoming') : undefined,
    callType: session?.callType,
    state: session?.state,
    ...fields,
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function isTransientSignalSendError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /network request failed/i.test(message)
    || /failed to fetch/i.test(message)
    || /network connection was lost/i.test(message)
    || /timed out/i.test(message)
    || /socket is not connected/i.test(message)
  )
}

async function ensureCallDatabaseAccess(identityId: string | null | undefined, context: string): Promise<void> {
  const normalizedIdentityId = identityId?.trim()
  if (!normalizedIdentityId) {
    throw new Error('Call identity is unavailable')
  }

  if (hasBoundBackendAccessForIdentity(normalizedIdentityId)) {
    return
  }

  const session = await ensureBoundBackendAccessForIdentity(normalizedIdentityId)
  if (!session) {
    recordCallDiagnostic('session', 'db_auth_binding_failed', {
      context,
    })
    throw new Error(CALL_AUTH_BINDING_ERROR)
  }
}

async function ensureCurrentCallDatabaseAccess(context: string): Promise<void> {
  await ensureCallDatabaseAccess(getIdentity()?.id, context)
}

function encryptSignal(keyBase64: string, payload: SignalPayload): { 
  encryptedPayload: string
  nonce: string
  authTag: string
} {
  const key = base64ToBytes(keyBase64)
  const payloadJson = JSON.stringify(payload)
  const payloadBytes = new TextEncoder().encode(payloadJson)
  
  const { ciphertext, nonce, tag } = encryptBinary(key, payloadBytes)
  
  return {
    encryptedPayload: ciphertext,
    nonce,
    authTag: tag,
  }
}

function decryptSignal<T extends SignalPayload>(
  keyBase64: string, 
  encryptedPayload: string, 
  nonce: string, 
  authTag: string
): T {
  const key = base64ToBytes(keyBase64)
  const decrypted = decryptBinary(key, encryptedPayload, nonce, authTag)
  const payloadJson = new TextDecoder().decode(decrypted)
  return JSON.parse(payloadJson) as T
}

async function signSignal(data: Uint8Array, privateKey: string): Promise<string> {
  return dilithiumSignAsync(data, privateKey)
}

async function verifySignature(data: Uint8Array, signature: string, publicKey: string): Promise<boolean> {
  return dilithiumVerifyAsync(data, signature, publicKey)
}

function isForbiddenBackendError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /(^|\s)(403|forbidden)(\s|:|$)/i.test(message)
}

async function insertCallSessionRow(session: CallSession): Promise<Error | null> {
  const { error } = await backendData
    .table('call_sessions')
    .insert({
      id: session.id,
      caller_identity_id: session.callerIdentityId,
      callee_identity_id: session.calleeIdentityId,
      conversation_id: session.conversationId,
      call_type: session.callType,
      state: session.state,
    })

  return error
}

async function createCallSessionInDB(session: CallSession): Promise<void> {
  await ensureCallDatabaseAccess(session.callerIdentityId, 'create_call_session')
  const span = startCallLatencySpan('session', 'db_create_session', buildCallDiagnosticsFields(session))
  recordCallDiagnostic('session', 'db_create_session_start', buildCallDiagnosticsFields(session))

  let error = await insertCallSessionRow(session)
  if (error && isForbiddenBackendError(error)) {
    recordCallDiagnostic('session', 'db_create_session_forbidden_retry', buildCallDiagnosticsFields(session, {
      error: error.message,
    }))
    invalidateAuthCaches()
    try {
      await ensureCallDatabaseAccess(session.callerIdentityId, 'create_call_session_retry')
      error = await insertCallSessionRow(session)
    } catch (accessError) {
      error = accessError as Error
    }
  }
  
  if (error) {
    span.end({ outcome: 'error', error: error.message })
    recordCallDiagnostic('session', 'db_create_session_failed', buildCallDiagnosticsFields(session, {
      error: error.message,
    }))
    throw new Error(`Failed to create call session: ${error.message}`)
  }

  span.end({ outcome: 'ok' })
  recordCallDiagnostic('session', 'db_create_session_succeeded', buildCallDiagnosticsFields(session))
}

async function updateCallSessionInDB(
  sessionId: string, 
  updates: Partial<{
    state: CallState
    end_reason: CallEndReason
    started_at: string
    ended_at: string
    duration_ms: number
  }>
): Promise<void> {
  const span = startCallLatencySpan('session', 'db_update_session', {
    sessionId,
    nextState: updates.state,
    endReason: updates.end_reason,
  })

  const { error } = await backendData
    .table('call_sessions')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
  
  if (error) {
    span.end({ outcome: 'error', error: error.message })
    recordCallDiagnostic('session', 'db_update_session_failed', {
      sessionId,
      nextState: updates.state,
      endReason: updates.end_reason,
      error: error.message,
    })
    throw new Error(`Failed to update call session: ${error.message}`)
  }

  span.end({ outcome: 'ok' })
}

async function touchCallSessionInDB(sessionId: string): Promise<void> {
  await updateCallSessionInDB(sessionId, {})
}

export async function getCallSessionSnapshot(
  sessionId: string,
): Promise<CallSessionSnapshot | null> {
  if (!isSpectraBackendConfigured()) {
    recordCallDiagnostic('session', 'snapshot_skipped', {
      sessionId,
      reason: 'backend_not_configured',
    })
    return null
  }

  await ensureCurrentCallDatabaseAccess('fetch_call_session_snapshot')
  const span = startCallLatencySpan('session', 'fetch_snapshot', { sessionId })

  const { data, error } = await backendData
    .table('call_sessions')
    .select(
      'id, caller_identity_id, callee_identity_id, conversation_id, call_type, state, end_reason, created_at, updated_at, started_at, ended_at',
    )
    .eq('id', sessionId)
    .maybeSingle()

  if (error) {
    span.end({ outcome: 'error', error: error.message })
    recordCallDiagnostic('session', 'snapshot_failed', {
      sessionId,
      error: error.message,
    })
    throw new Error(`Failed to fetch call session: ${error.message}`)
  }

  if (!data) {
    span.end({ outcome: 'missing' })
    recordCallDiagnostic('session', 'snapshot_missing', { sessionId })
    return null
  }

  span.end({ outcome: 'ok', state: data.state })
  return {
    id: data.id,
    callerIdentityId: data.caller_identity_id,
    calleeIdentityId: data.callee_identity_id,
    conversationId: data.conversation_id,
    callType: data.call_type,
    state: data.state,
    endReason: data.end_reason,
    createdAt: data.created_at ? Date.parse(data.created_at) : Date.now(),
    updatedAt: data.updated_at ? Date.parse(data.updated_at) : Date.now(),
    startedAt: data.started_at ? Date.parse(data.started_at) : undefined,
    endedAt: data.ended_at ? Date.parse(data.ended_at) : undefined,
  }
}

export function isLiveIncomingCallState(state: CallState | null | undefined): boolean {
  return (
    state === 'initiating' ||
    state === 'ringing' ||
    state === 'connecting' ||
    state === 'reconnecting'
  )
}

async function sendSignalToDB(
  callSessionId: string,
  senderIdentityId: string,
  recipientIdentityId: string,
  signalType: CallSignal['signalType'],
  encryptedPayload: string,
  nonce: string,
  authTag: string,
  signature: string,
  sequenceNumber: number
): Promise<string> {
  await ensureCallDatabaseAccess(senderIdentityId, 'send_call_signal')
  const span = startCallLatencySpan('signal', 'db_insert_signal', {
    sessionId: callSessionId,
    signalType,
    sequenceNumber,
  })

  const { data, error } = await backendData
    .table('call_signals')
    .insert({
      call_session_id: callSessionId,
      sender_identity_id: senderIdentityId,
      recipient_identity_id: recipientIdentityId,
      signal_type: signalType,
      encrypted_payload: encryptedPayload,
      nonce,
      auth_tag: authTag,
      signature,
      sequence_number: sequenceNumber,
    })
    .select('id')
    .single()
  
  if (error) {
    span.end({ outcome: 'error', error: error.message })
    throw new Error(`Failed to send signal: ${error.message}`)
  }

  const signalId = typeof data?.id === 'string' ? data.id : null
  if (!signalId) {
    span.end({ outcome: 'error', error: 'missing signal id' })
    throw new Error('Failed to send signal: missing signal id')
  }
  
  span.end({ outcome: 'ok', signalId })
  return signalId
}

async function sendSignalToDBWithRetry(
  callSessionId: string,
  senderIdentityId: string,
  recipientIdentityId: string,
  signalType: CallSignal['signalType'],
  encryptedPayload: string,
  nonce: string,
  authTag: string,
  signature: string,
  sequenceNumber: number,
): Promise<string> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= CALL_SIGNAL_SEND_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(CALL_SIGNAL_SEND_RETRY_DELAYS_MS[attempt - 1])
    }

    try {
      const signalId = await sendSignalToDB(
        callSessionId,
        senderIdentityId,
        recipientIdentityId,
        signalType,
        encryptedPayload,
        nonce,
        authTag,
        signature,
        sequenceNumber,
      )
      recordCallDiagnostic('signal', 'send_succeeded', {
        sessionId: callSessionId,
        senderIdentityId,
        recipientIdentityId,
        signalType,
        sequenceNumber,
        attempt: attempt + 1,
        signalId,
      })
      return signalId
    } catch (error) {
      lastError = error
      if (!isTransientSignalSendError(error) || attempt === CALL_SIGNAL_SEND_RETRY_DELAYS_MS.length) {
        recordCallDiagnostic('signal', 'send_failed', {
          sessionId: callSessionId,
          senderIdentityId,
          recipientIdentityId,
          signalType,
          sequenceNumber,
          attempt: attempt + 1,
          error: describeCallError(error),
          transient: isTransientSignalSendError(error),
        })
        throw error
      }

      recordCallDiagnostic('signal', 'send_retrying', {
        sessionId: callSessionId,
        senderIdentityId,
        recipientIdentityId,
        signalType,
        sequenceNumber,
        attempt: attempt + 1,
        maxAttempts: CALL_SIGNAL_SEND_RETRY_DELAYS_MS.length + 1,
        error: describeCallError(error),
      })
      console.warn(
        `Transient call signal send failure for ${signalType}; retrying (${attempt + 1}/${CALL_SIGNAL_SEND_RETRY_DELAYS_MS.length})`,
        error,
      )
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to send signal')
}

async function fetchPendingSignals(
  callSessionId: string,
  recipientIdentityId: string,
  afterSequence: number = -1
): Promise<IncomingSignalRecord[]> {
  const nowIso = new Date().toISOString()
  await ensureCallDatabaseAccess(recipientIdentityId, 'fetch_call_signals')
  const span = startCallLatencySpan('signal', 'poll_fetch_pending', {
    sessionId: callSessionId,
    recipientIdentityId,
    afterSequence,
  })

  // Do not block active signaling on stale-row cleanup.
  try {
    const { error: expireError } = await backendData
      .table('call_signals')
      .update({ status: 'expired' })
      .eq('call_session_id', callSessionId)
      .eq('recipient_identity_id', recipientIdentityId)
      .eq('status', 'pending')
      .lt('expires_at', nowIso)

    if (expireError) {
      recordCallDiagnostic('signal', 'expire_stale_failed', {
        sessionId: callSessionId,
        recipientIdentityId,
        error: expireError.message,
      })
      console.warn('Failed to expire stale call signals:', expireError)
    }
  } catch (error) {
    recordCallDiagnostic('signal', 'expire_stale_failed', {
      sessionId: callSessionId,
      recipientIdentityId,
      error: describeCallError(error),
    })
    console.warn('Failed to expire stale call signals:', error)
  }

  try {
    const { data, error } = await backendData
      .table('call_signals')
      .select('id, signal_type, encrypted_payload, nonce, auth_tag, signature, sequence_number')
      .eq('call_session_id', callSessionId)
      .eq('recipient_identity_id', recipientIdentityId)
      .eq('status', 'pending')
      .gt('expires_at', nowIso)
      .gt('sequence_number', afterSequence)
      .order('sequence_number', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    span.end({ outcome: 'ok', signalCount: data?.length || 0 })
    recordCallDiagnostic('signal', 'poll_fetch_succeeded', {
      sessionId: callSessionId,
      recipientIdentityId,
      afterSequence,
      signalCount: data?.length || 0,
    })
    return data || []
  } catch (error) {
    span.end({ outcome: 'error', error: describeCallError(error) })
    recordCallDiagnostic('signal', 'poll_fetch_failed', {
      sessionId: callSessionId,
      recipientIdentityId,
      afterSequence,
      error: describeCallError(error),
    })
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to fetch signals: ${message}`)
  }
}

async function markSignalsProcessed(signalIds: string[], localIdentityId?: string | null): Promise<void> {
  if (signalIds.length === 0) return
  if (localIdentityId) {
    await ensureCallDatabaseAccess(localIdentityId, 'mark_call_signals_processed')
  }
  
  const { error } = await backendData
    .table('call_signals')
    .update({ status: 'processed' })
    .in('id', signalIds)
  
  if (error) {
    recordCallDiagnostic('signal', 'mark_processed_failed', {
      signalCount: signalIds.length,
      error: error.message,
    })
    console.warn('Failed to mark signals as processed:', error)
    return
  }

  recordCallDiagnostic('signal', 'mark_processed_succeeded', {
    signalCount: signalIds.length,
  })
}

async function markSignalsExpired(signalIds: string[], localIdentityId?: string | null): Promise<void> {
  if (signalIds.length === 0) return
  if (localIdentityId) {
    await ensureCallDatabaseAccess(localIdentityId, 'mark_call_signals_expired')
  }

  const { error } = await backendData
    .table('call_signals')
    .update({ status: 'expired' })
    .in('id', signalIds)

  if (error) {
    recordCallDiagnostic('signal', 'mark_expired_failed', {
      signalCount: signalIds.length,
      error: error.message,
    })
    console.warn('Failed to mark signals as expired:', error)
    return
  }

  recordCallDiagnostic('signal', 'mark_expired_succeeded', {
    signalCount: signalIds.length,
  })
}

export class CallService {
  private session: CallSession | null = null
  private encryptionKeyBytes: Uint8Array | null = null
  private signalPollInterval: ReturnType<typeof setInterval> | null = null
  private signalPollInFlight: Promise<void> | null = null
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private realtimeSubscription: BackendRealtimeSubscription | null = null
  private realtimeHealthy = false
  private signalReceptionGeneration = 0
  private processedSignalIds: Set<string> = new Set()
  private processingSignalIds: Set<string> = new Set()
  private bufferedSignalsBySequence: Map<number, IncomingSignalRecord> = new Map()
  private signalSendQueue: Promise<void> = Promise.resolve()
  private dbUpdateQueue: Promise<void> = Promise.resolve()
  private endCallPromise: Promise<void> | null = null
  
  private onStateChange?: (state: CallState) => void
  private onSignalReceived?: SignalHandler
  private onError?: (error: Error) => void
  
  constructor(callbacks?: {
    onStateChange?: (state: CallState) => void
    onSignalReceived?: SignalHandler
    onError?: (error: Error) => void
  }) {
    this.setCallbacks(callbacks)
  }

  setCallbacks(callbacks?: {
    onStateChange?: (state: CallState) => void
    onSignalReceived?: SignalHandler
    onError?: (error: Error) => void
  }): void {
    this.onStateChange = callbacks?.onStateChange
    this.onSignalReceived = callbacks?.onSignalReceived
    this.onError = callbacks?.onError
  }

  private getDiagnosticFields(
    fields: Record<string, CallDiagnosticField> = {},
  ): Record<string, CallDiagnosticField> {
    return buildCallDiagnosticsFields(this.session, fields)
  }

  private recordDiagnostic(
    scope: string,
    name: string,
    fields: Record<string, CallDiagnosticField> = {},
  ): void {
    recordCallDiagnostic(scope, name, this.getDiagnosticFields(fields))
  }

  private startLatencySpan(
    scope: 'session' | 'signal' | 'webrtc' | 'native' | 'recovery' | 'transport',
    name: string,
    fields: Record<string, CallDiagnosticField> = {},
  ): { end: (extraFields?: Record<string, CallDiagnosticField>) => void } {
    return startCallLatencySpan(scope, name, this.getDiagnosticFields(fields))
  }

  ensureSignalPolling(): void {
    if (!this.session || this.signalPollInterval) {
      if (this.session) {
        this.recordDiagnostic('signal', 'ensure_polling_skipped', {
          hasRealtimeSubscription: Boolean(this.realtimeSubscription),
          hasPollInterval: Boolean(this.signalPollInterval),
        })
      }
      return
    }

    this.recordDiagnostic('signal', 'ensure_polling_start')
    this.startSignalPolling()
  }
  
  async initiateCall(
    callerIdentityId: string,
    calleeIdentityId: string,
    conversationId: string,
    callType: CallType
  ): Promise<{ session: CallSession; invitationMessage: string }> {
    assertCallAdmission()

    const span = startCallLatencySpan('session', 'initiate_call', {
      callerIdentityId,
      calleeIdentityId,
      conversationId,
      callType,
    })
    recordCallDiagnostic('session', 'initiate_call_start', {
      callerIdentityId,
      calleeIdentityId,
      conversationId,
      callType,
    })

    if (!isSpectraBackendConfigured()) {
      span.end({ outcome: 'error', error: 'Backend not configured' })
      throw new Error('Backend not configured')
    }
    
    const myIdentity = getIdentity()
    if (!myIdentity) {
      span.end({ outcome: 'error', error: 'No identity found' })
      throw new Error('No identity found')
    }
    
    const localDilithiumPrivateKey = await getLocalDilithiumPrivateKey()
    if (!localDilithiumPrivateKey) {
      span.end({ outcome: 'error', error: 'Secure call signing key unavailable. Reopen the app and try again.' })
      throw new Error('Secure call signing key unavailable. Reopen the app and try again.')
    }
    
    try {
      await ensureCallDatabaseAccess(callerIdentityId, 'initiate_call')
      const chatSession = await getActiveSessionByRemoteIdentity(calleeIdentityId)

      const keyBytes = generateRandomBytes(32)
      const keyBase64 = bytesToBase64(keyBytes)

      const sessionId = generateUUID()

      this.session = {
        id: sessionId,
        callerIdentityId,
        calleeIdentityId,
        conversationId,
        callType,
        state: 'initiating',
        isOutgoing: true,
        encryptionKey: keyBase64,
        localDilithiumPrivateKey,
        remoteDilithiumPublicKey: chatSession?.boundDilithiumKey || null,
        signalSequence: 0,
        lastReceivedSequence: -1,
      }
      
      this.encryptionKeyBytes = keyBytes
      
      await createCallSessionInDB(this.session)
      this.syncSessionHeartbeat()

      this.startSignalPolling()

      const invitationMessage = createCallInvitationMessage(sessionId, callType, keyBase64)
      span.end({ outcome: 'ok', sessionId })
      this.recordDiagnostic('session', 'initiate_call_succeeded', {
        remoteKeyAvailable: Boolean(chatSession?.boundDilithiumKey),
      })
      
      return {
        session: this.session,
        invitationMessage,
      }
    } catch (error) {
      span.end({ outcome: 'error', error: describeCallError(error) })
      recordCallDiagnostic('session', 'initiate_call_failed', {
        callerIdentityId,
        calleeIdentityId,
        conversationId,
        callType,
        error: describeCallError(error),
      })
      throw error
    }
  }
  
  async acceptIncomingCall(
    sessionId: string,
    callerIdentityId: string,
    calleeIdentityId: string,
    conversationId: string,
    callType: CallType,
    encryptionKey: string,
    options?: { skipPolling?: boolean }
  ): Promise<CallSession> {
    assertCallAdmission()

    const span = startCallLatencySpan('session', 'accept_incoming_call', {
      sessionId,
      callerIdentityId,
      calleeIdentityId,
      conversationId,
      callType,
      skipPolling: Boolean(options?.skipPolling),
    })
    recordCallDiagnostic('session', 'accept_incoming_call_start', {
      sessionId,
      callerIdentityId,
      calleeIdentityId,
      conversationId,
      callType,
      skipPolling: Boolean(options?.skipPolling),
    })

    if (!isSpectraBackendConfigured()) {
      span.end({ outcome: 'error', error: 'Backend not configured' })
      throw new Error('Backend not configured')
    }
    
    const myIdentity = getIdentity()
    if (!myIdentity) {
      span.end({ outcome: 'error', error: 'No identity found' })
      throw new Error('No identity found')
    }
    
    const localDilithiumPrivateKey = await getLocalDilithiumPrivateKey()
    if (!localDilithiumPrivateKey) {
      span.end({ outcome: 'error', error: 'Secure call signing key unavailable. Reopen the app and try again.' })
      throw new Error('Secure call signing key unavailable. Reopen the app and try again.')
    }
    
    try {
      await ensureCallDatabaseAccess(calleeIdentityId, 'accept_incoming_call')
      const chatSession = await getActiveSessionByRemoteIdentity(callerIdentityId)

      this.encryptionKeyBytes = base64ToBytes(encryptionKey)

      this.session = {
        id: sessionId,
        callerIdentityId,
        calleeIdentityId,
        conversationId,
        callType,
        state: 'ringing',
        isOutgoing: false,
        encryptionKey,
        localDilithiumPrivateKey,
        remoteDilithiumPublicKey: chatSession?.boundDilithiumKey || null,
        signalSequence: 0,
        lastReceivedSequence: -1,
      }
      
      if (!options?.skipPolling) {
        this.startSignalPolling()
      }

      this.syncSessionHeartbeat()
      span.end({
        outcome: 'ok',
        remoteKeyAvailable: Boolean(chatSession?.boundDilithiumKey),
        pollingStarted: !options?.skipPolling,
      })
      this.recordDiagnostic('session', 'accept_incoming_call_succeeded', {
        remoteKeyAvailable: Boolean(chatSession?.boundDilithiumKey),
        pollingStarted: !options?.skipPolling,
      })
      
      return this.session
    } catch (error) {
      span.end({ outcome: 'error', error: describeCallError(error) })
      recordCallDiagnostic('session', 'accept_incoming_call_failed', {
        sessionId,
        callerIdentityId,
        calleeIdentityId,
        conversationId,
        callType,
        skipPolling: Boolean(options?.skipPolling),
        error: describeCallError(error),
      })
      throw error
    }
  }
  
  async sendOffer(
    sdp: string,
    options?: { transitionState?: boolean },
  ): Promise<void> {
    this.recordDiagnostic('signal', 'send_offer_requested', {
      transitionState: options?.transitionState !== false,
    })
    await this.sendSignal('offer', { type: 'offer', sdp })
    if (options?.transitionState !== false) {
      this.updateState('ringing')
    }
  }
  
  async sendAnswer(
    sdp: string,
    options?: { transitionState?: boolean },
  ): Promise<void> {
    this.recordDiagnostic('signal', 'send_answer_requested', {
      transitionState: options?.transitionState !== false,
    })
    await this.sendSignal('answer', { type: 'answer', sdp })
    if (options?.transitionState !== false) {
      this.updateState('connecting')
    }
  }
  
  async sendIceCandidate(candidate: RTCIceCandidate): Promise<void> {
    this.recordDiagnostic('signal', 'send_ice_requested', {
      hasSdpMid: candidate.sdpMid !== null,
      hasSdpMLineIndex: candidate.sdpMLineIndex !== null,
    })
    await this.sendSignal('ice_candidate', candidate)
  }
  
  async sendRinging(): Promise<void> {
    this.recordDiagnostic('signal', 'send_ringing_requested')
    await this.sendSignal('ringing', { reason: 'ringing' } as any)
  }
  
  markConnecting(): void {
    if (!this.session || isTerminalCallState(this.session.state)) {
      return
    }

    if (this.session.state === 'connected') {
      return
    }

    this.recordDiagnostic('session', 'mark_connecting')
    this.updateState('connecting')
  }

  synchronizeConnected(startedAt?: number | null): void {
    if (!this.session || isTerminalCallState(this.session.state)) {
      return
    }

    const previousStartedAt = this.session.startedAt
    const nextStartedAt =
      typeof startedAt === 'number' && Number.isFinite(startedAt)
        ? startedAt
        : this.session.startedAt || Date.now()

    this.session.startedAt = nextStartedAt
    this.recordDiagnostic('session', 'synchronize_connected', {
      startedAt: nextStartedAt,
    })

    if (this.session.state !== 'connected') {
      this.updateState('connected', {
        started_at: new Date(nextStartedAt).toISOString(),
      })
      return
    }

    if (previousStartedAt !== nextStartedAt) {
      void this.queueSessionUpdate(this.session.id, {
        started_at: new Date(nextStartedAt).toISOString(),
      })
    }
  }

  markConnected(): void {
    this.synchronizeConnected(Date.now())
  }
  
  async endCall(
    reason: CallEndReason = 'completed',
    options?: { suppressStateChange?: boolean },
  ): Promise<void> {
    if (!this.session) return
    if (this.endCallPromise) return this.endCallPromise
    if (isTerminalCallState(this.session.state)) return

    const previousState = this.session.state
    const span = this.startLatencySpan('session', 'end_call', {
      reason,
      previousState,
      suppressStateChange: Boolean(options?.suppressStateChange),
    })
    this.recordDiagnostic('session', 'end_call_start', {
      reason,
      previousState,
      suppressStateChange: Boolean(options?.suppressStateChange),
    })

    const sessionId = this.session.id
    this.session.state = 'ended'
    this.session.endedAt = Date.now()
    this.session.endReason = reason

    if (this.session.startedAt) {
      this.session.durationMs = this.session.endedAt - this.session.startedAt
    }

    this.stopSessionHeartbeat()
    this.stopSignalReception()

    if (!options?.suppressStateChange) {
      this.onStateChange?.('ended')
    }

    this.endCallPromise = (async () => {
      try {
        await this.sendSignal('hangup', { reason })
      } catch {
        this.recordDiagnostic('signal', 'hangup_send_failed', { reason })
      }

      if (!this.session) {
        return
      }

      const endedAt = this.session.endedAt ?? Date.now()

      await this.queueSessionUpdate(sessionId, {
        state: 'ended',
        end_reason: reason,
        ended_at: new Date(endedAt).toISOString(),
        duration_ms: this.session.durationMs,
      })

      this.cleanup()
      span.end({ outcome: 'ok', durationMs: this.session?.durationMs })
    })().finally(() => {
      this.endCallPromise = null
    })

    return this.endCallPromise
  }
  
  async declineCall(): Promise<void> {
    await this.endCall('declined')
  }
  
  getSession(): CallSession | null {
    return this.session
  }
  
  getDuration(): number {
    if (!this.session?.startedAt) return 0
    const endTime = this.session.endedAt || Date.now()
    return endTime - this.session.startedAt
  }
  
  private async sendSignal(type: CallSignal['signalType'], payload: SignalPayload): Promise<void> {
    const span = this.startLatencySpan('signal', 'send_signal', { signalType: type })
    const queuedSend = this.signalSendQueue
      .catch(() => {})
      .then(async () => {
        try {
          const session = this.session
          if (!session) {
            throw new Error('Call session not initialized')
          }
          
          const recipientId = session.isOutgoing
            ? session.calleeIdentityId
            : session.callerIdentityId
          
          const senderId = session.isOutgoing
            ? session.callerIdentityId
            : session.calleeIdentityId
          
          const { encryptedPayload, nonce, authTag } = encryptSignal(session.encryptionKey, payload)
          const nextSequence = session.signalSequence + 1

          const signatureData = new TextEncoder().encode(
            `${type}:${encryptedPayload}:${nonce}:${authTag}:${nextSequence}`
          )
          
          if (!session.localDilithiumPrivateKey) {
            throw new Error('Secure call signing key unavailable. Reopen the app and try again.')
          }

          const signature = await signSignal(signatureData, session.localDilithiumPrivateKey)
          session.signalSequence = nextSequence
          
          await sendSignalToDBWithRetry(
            session.id,
            senderId,
            recipientId,
            type,
            encryptedPayload,
            nonce,
            authTag,
            signature,
            nextSequence,
          )

          span.end({
            outcome: 'ok',
            signalType: type,
            sequenceNumber: nextSequence,
          })
        } catch (error) {
          span.end({ outcome: 'error', error: describeCallError(error), signalType: type })
          throw error
        }
      })

    this.signalSendQueue = queuedSend.catch(() => {})
    return queuedSend
  }
  
  private updateState(
    state: CallState,
    persistence?: Partial<{
      state: CallState
      end_reason: CallEndReason
      started_at: string
      ended_at: string
      duration_ms: number
    }>,
  ): void {
    if (this.session) {
      if (shouldIgnoreCallStateTransition(this.session.state, state)) {
        this.recordDiagnostic('session', 'state_transition_ignored', {
          previousState: this.session.state,
          nextState: state,
        })
        return
      }
      if (this.session.state === state) {
        return
      }

      const previousState = this.session.state
      this.session.state = state
      this.syncSessionHeartbeat()
      this.onStateChange?.(state)
      this.recordDiagnostic('session', 'state_transition', {
        previousState,
        nextState: state,
      })

      void this.queueSessionUpdate(this.session.id, {
        state,
        ...persistence,
      })
    }
  }

  private queueSessionUpdate(
    sessionId: string,
    updates: Partial<{
      state: CallState
      end_reason: CallEndReason
      started_at: string
      ended_at: string
      duration_ms: number
    }>,
  ): Promise<void> {
    this.recordDiagnostic('session', 'queue_session_update', {
      queuedState: updates.state,
      queuedEndReason: updates.end_reason,
    })
    this.dbUpdateQueue = this.dbUpdateQueue
      .catch(() => {})
      .then(async () => {
        await this.ensureSessionDatabaseAccess('update_call_session')
        return updateCallSessionInDB(sessionId, updates)
      })
      .catch((error) => {
        this.recordDiagnostic('session', 'queue_session_update_failed', {
          queuedState: updates.state,
          queuedEndReason: updates.end_reason,
          error: describeCallError(error),
        })
        console.warn('Failed to persist call session update:', error)
      })

    return this.dbUpdateQueue
  }

  private getLocalIdentityId(): string | null {
    if (!this.session) return null
    return this.session.isOutgoing
      ? this.session.callerIdentityId
      : this.session.calleeIdentityId
  }

  private async ensureSessionDatabaseAccess(context: string): Promise<void> {
    await ensureCallDatabaseAccess(this.getLocalIdentityId(), context)
  }

  private getExpectedIncomingSequence(): number {
    if (!this.session) {
      return 1
    }

    return Math.max(1, this.session.lastReceivedSequence + 1)
  }

  private async failSecurely(reason: CallEndReason, message: string): Promise<void> {
    this.recordDiagnostic('session', 'fail_securely', {
      reason,
      message,
    })
    if (this.session && !isTerminalCallState(this.session.state)) {
      const sessionId = this.session.id
      this.session.endReason = reason
      this.session.state = 'failed'
      this.session.endedAt = Date.now()
      this.stopSessionHeartbeat()

      await this.queueSessionUpdate(sessionId, {
        state: 'failed',
        end_reason: reason,
        ended_at: new Date(this.session.endedAt).toISOString(),
      })
    }

    this.cleanup()
    this.onStateChange?.('failed')
    this.onError?.(new Error(message))
  }

  private async handleRemoteTerminalState(reason: CallEndReason): Promise<void> {
    if (!this.session || isTerminalCallState(this.session.state)) {
      return
    }

    this.recordDiagnostic('session', 'remote_terminal_state', { reason })

    const sessionId = this.session.id
    this.session.endReason = reason
    this.session.state = 'ended'
    this.session.endedAt = Date.now()

    if (this.session.startedAt) {
      this.session.durationMs = this.session.endedAt - this.session.startedAt
    }

    this.stopSessionHeartbeat()

    await this.queueSessionUpdate(sessionId, {
      state: 'ended',
      end_reason: reason,
      ended_at: new Date(this.session.endedAt).toISOString(),
      duration_ms: this.session.durationMs,
    })

    this.cleanup()
    this.onStateChange?.('ended')
  }

  private handleRemoteTerminalSnapshot(
    state: 'ended' | 'failed',
    reason: CallEndReason,
    endedAt?: number,
  ): void {
    if (!this.session || isTerminalCallState(this.session.state)) return
    this.session.state = state
    this.session.endReason = reason
    this.session.endedAt = endedAt || Date.now()
    if (this.session.startedAt) {
      this.session.durationMs = this.session.endedAt - this.session.startedAt
    }
    this.stopSessionHeartbeat()
    this.cleanup()
    this.onStateChange?.(state)
  }
  
  private startSignalPolling(): void {
    if (!this.session) return
    if (this.signalPollInterval) return
    const localIdentityId = this.getLocalIdentityId()
    if (!localIdentityId) return
    const sessionId = this.session.id
    const receptionGeneration = ++this.signalReceptionGeneration

    this.recordDiagnostic('signal', 'signal_polling_started', {
      localIdentityId,
      transport: 'realtime_and_polling',
    })

    const accessToken = getCachedBackendAccessToken()
    if (accessToken) {
      try {
        this.realtimeSubscription = subscribeBackendRealtime({
          accessToken,
          subscriberId: createRealtimeSubscriberId('call'),
          topic: `call_signals:${sessionId}`,
          onSubscribed: () => {
            if (!this.isCurrentSignalReception(sessionId, receptionGeneration)) return
            this.realtimeHealthy = true
            this.startSignalPollInterval(CALL_SIGNAL_REALTIME_BACKUP_POLL_INTERVAL_MS)
          },
          onEvent: (event) => {
            if (!this.isCurrentSignalReception(sessionId, receptionGeneration)) return
            if (event.event === 'call_session_update') {
              void this.refreshTerminalSessionState(sessionId)
              return
            }
            if (event.event !== 'call_signal_insert') return
            const signal = event.payload as {
              recipient_identity_id?: string
              signal_type?: string
              sequence_number?: number
            }
            if (signal.recipient_identity_id !== localIdentityId) return
            this.recordDiagnostic('signal', 'realtime_signal_received', {
              signalType: signal.signal_type,
              transport: 'realtime',
              sequenceNumber: signal.sequence_number,
            })
            void this.queueSignalPoll()
          },
          onError: () => {
            this.handleRealtimeFailure(sessionId, receptionGeneration, 'error')
          },
          onLifecycle: (event) => {
            this.handleRealtimeLifecycle(sessionId, receptionGeneration, event)
          },
        })
      } catch (error) {
        this.recordDiagnostic('signal', 'realtime_subscription_failed', {
          error: describeCallError(error),
        })
      }
    }

    this.startSignalPollInterval(CALL_SIGNAL_POLL_INTERVAL_MS)
    void this.queueSignalPoll()
  }

  private startSignalPollInterval(intervalMs: number): void {
    if (!this.session || !Number.isSafeInteger(intervalMs) || intervalMs < 1) return
    if (this.signalPollInterval) {
      clearInterval(this.signalPollInterval)
    }
    this.recordDiagnostic('signal', 'signal_polling_interval_selected', {
      pollIntervalMs: intervalMs,
      hasRealtimeSubscription: Boolean(this.realtimeSubscription),
      realtimeHealthy: this.realtimeHealthy,
    })
    this.signalPollInterval = setInterval(() => {
      if (!this.session || isTerminalCallState(this.session.state)) return
      if (AppState.currentState !== 'active' && this.realtimeHealthy) return
      void this.queueSignalPoll()
    }, intervalMs)
  }

  private handleRealtimeLifecycle(
    sessionId: string,
    receptionGeneration: number,
    event: BackendRealtimeLifecycleEvent,
  ): void {
    if (!this.isCurrentSignalReception(sessionId, receptionGeneration)) return
    if (event.state === 'SUBSCRIBED') {
      this.realtimeHealthy = true
      this.startSignalPollInterval(CALL_SIGNAL_REALTIME_BACKUP_POLL_INTERVAL_MS)
      return
    }
    if (event.state === 'ERROR' || event.state === 'CLOSED') {
      this.handleRealtimeFailure(sessionId, receptionGeneration, event.state.toLowerCase())
    }
  }

  private handleRealtimeFailure(
    sessionId: string,
    receptionGeneration: number,
    stage: string,
  ): void {
    if (
      !this.isCurrentSignalReception(sessionId, receptionGeneration) ||
      (!this.realtimeSubscription && !this.realtimeHealthy)
    ) return
    this.recordDiagnostic('signal', 'realtime_fallback_to_polling', { stage })
    this.realtimeHealthy = false
    const subscription = this.realtimeSubscription
    this.realtimeSubscription = null
    subscription?.close()
    this.startSignalPollInterval(CALL_SIGNAL_POLL_INTERVAL_MS)
    void this.queueSignalPoll()
  }

  private isCurrentSignalReception(sessionId: string, receptionGeneration: number): boolean {
    return Boolean(
      this.session?.id === sessionId &&
      this.signalReceptionGeneration === receptionGeneration &&
      !isTerminalCallState(this.session.state),
    )
  }

  private queueSignalPoll(): Promise<void> {
    if (this.signalPollInFlight) return this.signalPollInFlight
    const task = this.pollForSignals().finally(() => {
      if (this.signalPollInFlight === task) {
        this.signalPollInFlight = null
      }
    })
    this.signalPollInFlight = task
    return task
  }

  private async refreshTerminalSessionState(sessionId: string): Promise<void> {
    if (!this.session || this.session.id !== sessionId) return
    try {
      const snapshot = await getCallSessionSnapshot(sessionId)
      if (
        !snapshot ||
        (snapshot.state !== 'ended' && snapshot.state !== 'failed') ||
        !this.session ||
        this.session.id !== sessionId
      ) {
        return
      }
      this.handleRemoteTerminalSnapshot(
        snapshot.state,
        (snapshot.endReason || 'cancelled') as CallEndReason,
        snapshot.endedAt,
      )
    } catch (error) {
      this.recordDiagnostic('session', 'terminal_snapshot_refresh_failed', {
        error: describeCallError(error),
      })
    }
  }

  private async pollForSignals(): Promise<void> {
    const session = this.session
    if (!session || isTerminalCallState(session.state)) return
    const sessionId = session.id
    const recipientId = session.isOutgoing
      ? session.callerIdentityId
      : session.calleeIdentityId
    const span = this.startLatencySpan('signal', 'poll_cycle', {
      recipientIdentityId: recipientId,
      afterSequence: session.lastReceivedSequence,
    })

    try {
      const signals = await fetchPendingSignals(
        sessionId,
        recipientId,
        session.lastReceivedSequence,
      )
      if (!this.session || this.session.id !== sessionId || isTerminalCallState(this.session.state)) {
        span.end({ outcome: 'stale' })
        return
      }

      const processedIds = new Set<string>()
      const expiredIds = new Set<string>()

      for (const signal of signals) {
        if (
          !this.session ||
          this.session.id !== sessionId ||
          isTerminalCallState(this.session.state)
        ) {
          break
        }
        const outcome = await this.consumeSignal(signal)
        outcome.processedIds.forEach((signalId) => processedIds.add(signalId))
        outcome.expiredIds.forEach((signalId) => expiredIds.add(signalId))
      }

      if (this.session?.id === sessionId) {
        await markSignalsProcessed(Array.from(processedIds), recipientId)
        await markSignalsExpired(Array.from(expiredIds), recipientId)
      }
      span.end({
        outcome: 'ok',
        fetchedSignals: signals.length,
        processedSignals: processedIds.size,
        expiredSignals: expiredIds.size,
      })
    } catch (error) {
      span.end({ outcome: 'error', error: describeCallError(error) })
      this.recordDiagnostic('signal', 'poll_cycle_failed', {
        recipientIdentityId: recipientId,
        error: describeCallError(error),
      })
      console.warn('Failed to poll for signals:', error)
    }
  }

  private async consumeSignal(signal: IncomingSignalRecord): Promise<ConsumeSignalResult> {
    if (!this.session) {
      return {
        processedIds: [],
        expiredIds: [signal.id],
      }
    }

    if (this.processedSignalIds.has(signal.id) || this.processingSignalIds.has(signal.id)) {
      this.recordDiagnostic('signal', 'signal_duplicate_skipped', {
        signalId: signal.id,
        signalType: signal.signal_type,
        sequenceNumber: signal.sequence_number,
      })
      return {
        processedIds: [],
        expiredIds: [],
      }
    }

    const expectedSequence = this.getExpectedIncomingSequence()

    if (signal.sequence_number < expectedSequence) {
      this.processedSignalIds.add(signal.id)
      this.recordDiagnostic('signal', 'signal_stale_skipped', {
        signalId: signal.id,
        signalType: signal.signal_type,
        sequenceNumber: signal.sequence_number,
        expectedSequence,
      })
      return {
        processedIds: [signal.id],
        expiredIds: [],
      }
    }

    if (signal.sequence_number > expectedSequence) {
      const bufferedSignal = this.bufferedSignalsBySequence.get(signal.sequence_number)
      if (!bufferedSignal) {
        this.bufferedSignalsBySequence.set(signal.sequence_number, signal)
        this.recordDiagnostic('signal', 'signal_buffered_out_of_order', {
          signalId: signal.id,
          signalType: signal.signal_type,
          sequenceNumber: signal.sequence_number,
          expectedSequence,
        })
      } else if (bufferedSignal.id !== signal.id) {
        this.recordDiagnostic('signal', 'signal_sequence_conflict', {
          signalType: signal.signal_type,
          sequenceNumber: signal.sequence_number,
          expectedSequence,
        })
        console.warn(
          'Received conflicting call signals for the same sequence number:',
          signal.sequence_number,
        )
      }
      return {
        processedIds: [],
        expiredIds: [],
      }
    }

    return this.processBufferedSignalChain(signal)
  }

  private async processBufferedSignalChain(initialSignal: IncomingSignalRecord): Promise<ConsumeSignalResult> {
    const processedIds: string[] = []
    const expiredIds: string[] = []
    let currentSignal: IncomingSignalRecord | undefined = initialSignal

    while (currentSignal && this.session) {
      if (this.processedSignalIds.has(currentSignal.id) || this.processingSignalIds.has(currentSignal.id)) {
        break
      }

      this.processingSignalIds.add(currentSignal.id)
      this.bufferedSignalsBySequence.delete(currentSignal.sequence_number)

      try {
        const outcome = await this.processSignal(currentSignal)
        this.processedSignalIds.add(currentSignal.id)

        if (outcome === 'expired') {
          expiredIds.push(currentSignal.id)
        } else {
          processedIds.push(currentSignal.id)
        }

        if (this.session) {
          this.session.lastReceivedSequence = currentSignal.sequence_number
        }
      } finally {
        this.processingSignalIds.delete(currentSignal.id)
      }

      if (!this.session) {
        break
      }

      currentSignal = this.bufferedSignalsBySequence.get(this.getExpectedIncomingSequence())
    }

    return {
      processedIds,
      expiredIds,
    }
  }
  
  private async processSignal(signal: IncomingSignalRecord): Promise<'processed' | 'expired'> {
    if (!this.session) return 'expired'
    
    try {
      this.recordDiagnostic('signal', 'process_signal_start', {
        signalId: signal.id,
        signalType: signal.signal_type,
        sequenceNumber: signal.sequence_number,
      })
      if (this.session.remoteDilithiumPublicKey && signal.signature !== 'unsigned') {
        const signatureData = new TextEncoder().encode(
          `${signal.signal_type}:${signal.encrypted_payload}:${signal.nonce}:${signal.auth_tag}:${signal.sequence_number}`
        )
        
        const valid = await verifySignature(signatureData, signal.signature, this.session.remoteDilithiumPublicKey)
        if (!valid) {
          await this.failSecurely('crypto_error', 'Call security validation failed. The remote signal signature was invalid.')
          return 'expired'
        }
      } else if (this.session.remoteDilithiumPublicKey && signal.signature === 'unsigned') {
        await this.failSecurely('crypto_error', 'Call security validation failed. The remote signal was not signed.')
        return 'expired'
      }
      
      const payload = decryptSignal(
        this.session.encryptionKey,
        signal.encrypted_payload,
        signal.nonce,
        signal.auth_tag
      )
      
      switch (signal.signal_type) {
        case 'offer':
          await this.onSignalReceived?.('offer', payload)
          break
        case 'answer':
          await this.onSignalReceived?.('answer', payload)
          break
        case 'ice_candidate':
          await this.onSignalReceived?.('ice_candidate', payload)
          break
        case 'ringing':
          if (this.session?.state === 'initiating' || this.session?.state === 'ringing') {
            this.updateState('ringing')
          }
          await this.onSignalReceived?.('ringing', payload)
          break
        case 'hangup': {
          const hangupPayload = payload as { reason: CallEndReason }
          await this.handleRemoteTerminalState(hangupPayload.reason)
          break
        }
        case 'busy':
          await this.handleRemoteTerminalState('busy')
          break
      }
      this.recordDiagnostic('signal', 'process_signal_succeeded', {
        signalId: signal.id,
        signalType: signal.signal_type,
        sequenceNumber: signal.sequence_number,
      })
      return 'processed'
    } catch (error) {
      this.recordDiagnostic('signal', 'process_signal_failed', {
        signalId: signal.id,
        signalType: signal.signal_type,
        sequenceNumber: signal.sequence_number,
        error: describeCallError(error),
      })
      console.warn('Failed to process signal:', error)
      this.onError?.(error as Error)
      return 'expired'
    }
  }
  
  cleanup(): void {
    this.recordDiagnostic('session', 'cleanup')
    this.stopSessionHeartbeat()
    this.stopSignalReception()
    
    this.processedSignalIds.clear()
    this.processingSignalIds.clear()
    this.bufferedSignalsBySequence.clear()
    
    if (this.encryptionKeyBytes) {
      this.encryptionKeyBytes.fill(0)
      this.encryptionKeyBytes = null
    }
  }

  private shouldHeartbeat(): boolean {
    return Boolean(this.session && !isTerminalCallState(this.session.state))
  }

  private startSessionHeartbeat(): void {
    if (!this.session || this.heartbeatInterval || !this.shouldHeartbeat()) {
      return
    }

    const sessionId = this.session.id
    this.recordDiagnostic('session', 'heartbeat_started')
    const tick = async () => {
      try {
        await this.ensureSessionDatabaseAccess('heartbeat_call_session')
        await touchCallSessionInDB(sessionId)
      } catch (error) {
        this.recordDiagnostic('session', 'heartbeat_failed', {
          error: describeCallError(error),
        })
        console.warn('Failed to heartbeat call session:', error)
      }
    }

    void tick()
    this.heartbeatInterval = setInterval(tick, CALL_SESSION_HEARTBEAT_MS)
  }

  private stopSessionHeartbeat(): void {
    if (!this.heartbeatInterval) {
      return
    }

    clearInterval(this.heartbeatInterval)
    this.heartbeatInterval = null
    this.recordDiagnostic('session', 'heartbeat_stopped')
  }

  private syncSessionHeartbeat(): void {
    if (this.shouldHeartbeat()) {
      this.startSessionHeartbeat()
      return
    }

    this.stopSessionHeartbeat()
  }

  private stopSignalReception(): void {
    this.signalReceptionGeneration++
    this.realtimeHealthy = false
    if (this.signalPollInterval) {
      clearInterval(this.signalPollInterval)
      this.signalPollInterval = null
    }

    if (this.realtimeSubscription) {
      this.realtimeSubscription.close()
      this.realtimeSubscription = null
    }

    if (this.session) {
      this.recordDiagnostic('signal', 'signal_reception_stopped')
    }
  }
}

export {
  createCallInvitationMessage,
  parseCallInvitation,
  isCallInvitation,
  describeCallInvitation,
} from '../shared/callInvitationFormat'
