/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { SPECTRA_API_URL } from '@/lib/constants'
import {
  assertClearnetEgressAllowed,
  registerClearnetOperation,
} from '@/services/tor/torEgressPolicy'
import { getAppVersionHeaders } from './appVersion'
import { recoverBackendIdentityBinding } from './request'
import { isValidRealtimeSubscriberId } from './realtimeSubscriberId'
import { buildBackendWebSocketUrl } from './url'

export type BackendRealtimeEvent = {
  type: 'event'
  topic: string
  event: string
  payload: Record<string, unknown>
}

export type BackendRealtimeHandler = (event: BackendRealtimeEvent) => void

export type BackendRealtimeLifecycleEvent = {
  state: 'OPEN' | 'SUBSCRIBED' | 'ERROR' | 'CLOSED'
  elapsedMs: number
  failureStage?: 'transport' | 'authorization' | 'ack_timeout' | 'invalid_payload' | 'closed_before_ack' | 'closed_after_ack'
  closeCode?: number
  closeReason?: string
  wasClean?: boolean
}

const SUBSCRIBE_ACK_TIMEOUT_MS = 7_000
const MAX_CLOSE_REASON_LENGTH = 128

function describeRealtimeTopic(topic: unknown): string {
  if (typeof topic !== 'string') return 'invalid'
  const colon = topic.indexOf(':')
  if (colon < 0) return 'unknown'
  const kind = topic.slice(0, colon)
  const token = topic.slice(colon + 1)
  const scheme = token.startsWith('smbx2.')
    ? 'smbx2'
    : token.startsWith('smbx1.')
      ? 'smbx1'
      : token.startsWith('srec')
        ? 'receipt'
        : 'other'
  return `${kind}:${scheme}`
}

function logRealtimeCatchup(
  event: string,
  fields: Record<string, string | number | boolean>,
): void {
  if (typeof __DEV__ === 'undefined' || __DEV__ !== true) return
  const parts = Object.entries(fields)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ')
  console.log(`[ChatCatchup] ${event} ${parts}`)
}

export interface BackendRealtimeSubscription {
  close: () => void
}

type BackendRealtimeRequest = {
  accessToken: string
  subscriberId: string
  topic: string
  onEvent: BackendRealtimeHandler
  onSubscribed?: (topic: string) => void
  onError?: (error: Error) => void
  onLifecycle?: (event: BackendRealtimeLifecycleEvent) => void
}

type RealtimeRequestState = {
  request: BackendRealtimeRequest
  startedAt: number
}

type RealtimeTopicState = {
  subscriberId: string
  requests: Map<symbol, RealtimeRequestState>
  subscribed: boolean
  ackTimeout: ReturnType<typeof setTimeout> | null
}

type RealtimePool = {
  accessToken: string
  baseUrl: string
  socket: WebSocket
  topics: Map<string, RealtimeTopicState>
  opened: boolean
  closed: boolean
  unregisterClearnetOperation: () => void
}

const realtimePools = new Map<string, Map<string, RealtimePool>>()

export function subscribeBackendRealtime(
  request: BackendRealtimeRequest,
  baseUrl = SPECTRA_API_URL,
): BackendRealtimeSubscription {
  if (!isValidRealtimeSubscriberId(request.subscriberId)) {
    throw new Error('Invalid backend realtime subscriber ID')
  }
  assertClearnetEgressAllowed()
  let poolsForBaseUrl = realtimePools.get(baseUrl)
  if (!poolsForBaseUrl) {
    poolsForBaseUrl = new Map()
    realtimePools.set(baseUrl, poolsForBaseUrl)
  }
  let pool = poolsForBaseUrl.get(request.accessToken)
  if (!pool || pool.closed) {
    pool = createRealtimePool(request.accessToken, baseUrl)
    poolsForBaseUrl.set(request.accessToken, pool)
  }

  const requestKey = Symbol(request.subscriberId)
  let topicState = pool.topics.get(request.topic)
  if (!topicState) {
    topicState = {
      subscriberId: request.subscriberId,
      requests: new Map(),
      subscribed: false,
      ackTimeout: null,
    }
    pool.topics.set(request.topic, topicState)
  }
  const requestState = { request, startedAt: Date.now() }
  topicState.requests.set(requestKey, requestState)

  if (pool.opened) {
    emitRealtimeLifecycle(requestState, { state: 'OPEN' })
    if (topicState.requests.size === 1) {
      sendRealtimeSubscribe(pool, request.topic, topicState, false)
    } else if (topicState.subscribed) {
      emitRealtimeLifecycle(requestState, { state: 'SUBSCRIBED' })
      request.onSubscribed?.(request.topic)
    }
  }

  let closed = false
  return {
    close: () => {
      if (closed) return
      closed = true
      removeRealtimeRequest(pool!, request.topic, requestKey)
    },
  }
}

function createRealtimePool(accessToken: string, baseUrl: string): RealtimePool {
  const wsUrl = buildBackendWebSocketUrl(baseUrl)
  const RealtimeWebSocket = WebSocket as unknown as new (
    url: string,
    protocols?: string[],
    options?: { headers?: Record<string, string> },
  ) => WebSocket
  const socket = new RealtimeWebSocket(wsUrl, [], {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...getAppVersionHeaders(),
    },
  })
  const pool: RealtimePool = {
    accessToken,
    baseUrl,
    socket,
    topics: new Map(),
    opened: false,
    closed: false,
    unregisterClearnetOperation: () => undefined,
  }
  pool.unregisterClearnetOperation = registerClearnetOperation(() => closeRealtimePool(pool))

  socket.onopen = () => {
    if (pool.closed) return
    pool.opened = true
    let legacySubscribe = true
    for (const [topic, state] of pool.topics) {
      for (const requestState of state.requests.values()) {
        emitRealtimeLifecycle(requestState, { state: 'OPEN' })
      }
      sendRealtimeSubscribe(pool, topic, state, legacySubscribe)
      legacySubscribe = false
    }
  }
  socket.onmessage = (message) => {
    try {
      const parsed = JSON.parse(String(message.data)) as BackendRealtimeEvent | {
        type?: string
        topic?: unknown
        code?: unknown
      }
      if (parsed.type === 'subscribed') {
        if (typeof parsed.topic !== 'string' || !pool.topics.has(parsed.topic)) {
          throw new Error('Backend realtime acknowledgement topic mismatch')
        }
        const state = pool.topics.get(parsed.topic)!
        clearRealtimeAckTimeout(state)
        state.subscribed = true
        logRealtimeCatchup('realtime_ws_subscribed', {
          topicKind: describeRealtimeTopic(parsed.topic),
        })
        for (const requestState of state.requests.values()) {
          emitRealtimeLifecycle(requestState, { state: 'SUBSCRIBED' })
          requestState.request.onSubscribed?.(parsed.topic)
        }
        return
      }
      if (parsed.type === 'error') {
        if (
          typeof parsed.topic !== 'string' ||
          !pool.topics.has(parsed.topic) ||
          typeof parsed.code !== 'string'
        ) {
          throw new Error('Backend realtime rejection payload is invalid')
        }
        const topic = parsed.topic
        const error = new Error(
          parsed.code === 'identity_binding_required'
            ? 'Backend realtime identity binding is stale'
            : 'Backend realtime topic was rejected',
        )
        const failTopic = () => {
          failRealtimeTopic(pool, topic, error, 'authorization')
        }
        if (parsed.code === 'identity_binding_required') {
          void recoverBackendIdentityBinding().catch(() => null).finally(failTopic)
        } else {
          failTopic()
        }
        return
      }
      if (parsed.type === 'event') {
        if (typeof parsed.topic !== 'string' || !pool.topics.has(parsed.topic)) {
          logRealtimeCatchup('realtime_ws_unmatched', {
            topicKind: describeRealtimeTopic(parsed.topic),
            eventName: typeof (parsed as { event?: unknown }).event === 'string'
              ? (parsed as { event: string }).event
              : 'missing',
            subscribedCount: pool.topics.size,
          })
          return
        }
        const event = parsed as BackendRealtimeEvent
        logRealtimeCatchup('realtime_ws_event', {
          topicKind: describeRealtimeTopic(event.topic),
          eventName: event.event,
          deliveryClass: typeof event.payload?.delivery_class === 'string'
            ? event.payload.delivery_class
            : 'missing',
          hasServerSequence: event.payload?.server_sequence !== undefined,
        })
        for (const requestState of pool.topics.get(parsed.topic)!.requests.values()) {
          requestState.request.onEvent(event)
        }
      }
    } catch (error) {
      failRealtimePool(pool, error as Error, 'invalid_payload')
    }
  }
  socket.onerror = () => {
    failRealtimePool(pool, new Error('Backend realtime socket error'), 'transport')
  }
  socket.onclose = (event) => {
    if (pool.closed) return
    pool.unregisterClearnetOperation()
    removeRealtimePool(pool)
    pool.closed = true
    const closeReason = sanitizeCloseReason(event.reason)
    const identityRecovery = closeReason === 'identity binding required'
      ? recoverBackendIdentityBinding().catch(() => null)
      : null
    for (const state of pool.topics.values()) {
      clearRealtimeAckTimeout(state)
      const failureStage = state.subscribed ? 'closed_after_ack' : 'closed_before_ack'
      const error = new Error(
        state.subscribed
          ? 'Backend realtime socket closed'
          : 'Backend realtime socket closed before acknowledgement',
      )
      for (const requestState of state.requests.values()) {
        emitRealtimeLifecycle(requestState, {
          state: 'CLOSED',
          failureStage,
          closeCode: event.code,
          closeReason,
          wasClean: event.wasClean,
        })
        if (identityRecovery) {
          void identityRecovery.finally(() => requestState.request.onError?.(error))
        } else {
          requestState.request.onError?.(error)
        }
      }
    }
    pool.topics.clear()
  }

  return pool
}

function sendRealtimeSubscribe(
  pool: RealtimePool,
  topic: string,
  state: RealtimeTopicState,
  legacy: boolean,
): void {
  if (pool.closed) return
  clearRealtimeAckTimeout(state)
  state.ackTimeout = setTimeout(() => {
    failRealtimeTopic(
      pool,
      topic,
      new Error('Backend realtime subscription acknowledgement timed out'),
      'ack_timeout',
    )
  }, SUBSCRIBE_ACK_TIMEOUT_MS)
  pool.socket.send(JSON.stringify({
    ...(legacy ? {} : { type: 'subscribe' }),
    subscriberId: state.subscriberId,
    topic,
  }))
}

function removeRealtimeRequest(pool: RealtimePool, topic: string, requestKey: symbol): void {
  const state = pool.topics.get(topic)
  if (!state) return
  state.requests.delete(requestKey)
  if (state.requests.size > 0) return

  clearRealtimeAckTimeout(state)
  pool.topics.delete(topic)
  if (pool.opened && !pool.closed) {
    pool.socket.send(JSON.stringify({ type: 'unsubscribe', topic }))
  }
  if (pool.topics.size === 0) {
    closeRealtimePool(pool)
  }
}

function failRealtimeTopic(
  pool: RealtimePool,
  topic: string,
  error: Error,
  failureStage: NonNullable<BackendRealtimeLifecycleEvent['failureStage']>,
): void {
  const state = pool.topics.get(topic)
  if (!state) return
  clearRealtimeAckTimeout(state)
  pool.topics.delete(topic)
  const requests = [...state.requests.values()]
  if (pool.topics.size === 0) {
    closeRealtimePool(pool)
  } else if (pool.opened && !pool.closed) {
    pool.socket.send(JSON.stringify({ type: 'unsubscribe', topic }))
  }
  for (const requestState of requests) {
    emitRealtimeLifecycle(requestState, { state: 'ERROR', failureStage })
    requestState.request.onError?.(error)
  }
}

function failRealtimePool(
  pool: RealtimePool,
  error: Error,
  failureStage: NonNullable<BackendRealtimeLifecycleEvent['failureStage']>,
): void {
  if (pool.closed) return
  const requests = [...pool.topics.values()]
    .flatMap((state) => {
      clearRealtimeAckTimeout(state)
      return [...state.requests.values()]
    })
  closeRealtimePool(pool)
  for (const requestState of requests) {
    emitRealtimeLifecycle(requestState, { state: 'ERROR', failureStage })
    requestState.request.onError?.(error)
  }
}

function closeRealtimePool(pool: RealtimePool): void {
  if (pool.closed) return
  pool.closed = true
  for (const state of pool.topics.values()) {
    clearRealtimeAckTimeout(state)
  }
  pool.topics.clear()
  pool.unregisterClearnetOperation()
  removeRealtimePool(pool)
  pool.socket.close()
}

function removeRealtimePool(pool: RealtimePool): void {
  const poolsForBaseUrl = realtimePools.get(pool.baseUrl)
  if (!poolsForBaseUrl) return
  if (poolsForBaseUrl.get(pool.accessToken) === pool) {
    poolsForBaseUrl.delete(pool.accessToken)
  }
  if (poolsForBaseUrl.size === 0) {
    realtimePools.delete(pool.baseUrl)
  }
}

function clearRealtimeAckTimeout(state: RealtimeTopicState): void {
  if (!state.ackTimeout) return
  clearTimeout(state.ackTimeout)
  state.ackTimeout = null
}

function emitRealtimeLifecycle(
  state: RealtimeRequestState,
  event: Omit<BackendRealtimeLifecycleEvent, 'elapsedMs'>,
): void {
  state.request.onLifecycle?.({
    ...event,
    elapsedMs: Math.max(0, Date.now() - state.startedAt),
  })
}

function sanitizeCloseReason(reason: unknown): string | undefined {
  if (typeof reason !== 'string') return undefined
  const normalized = reason
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, MAX_CLOSE_REASON_LENGTH)
  return normalized || undefined
}
