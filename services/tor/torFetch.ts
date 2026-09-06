/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Fetch wrapper for react-native-nitro-tor.
 */

import { RnTor } from 'react-native-nitro-tor'
import { useTorStore } from './torStore'
import { TOR_CONFIG, LOG_PREFIX, type TorStatus } from './torConstants'
import { recordChatLatency } from '../chat/chatLatency'
import {
  captureTorNetworkSnapshot,
  recordTorDiagnostic,
  startTorLatencySpan,
  summarizeTorUrl,
} from './torDiagnostics'
import {
  assertClearnetEgressAllowed,
  registerClearnetOperation,
} from './torEgressPolicy'
import { createSanitizedConsole } from '@/services/logging/mobileLogger'

type FetchFn = typeof globalThis.fetch

export type TorBodyByteEncoding = 'latin1' | 'utf8' | 'base64'

interface TorHttpBodyByteCandidates {
  preferred: Uint8Array
  preferredEncoding: 'latin1' | 'utf8'
  latin1: Uint8Array
  utf8: Uint8Array
  base64: Uint8Array | null
}

export interface TorByteResponse {
  ok: boolean
  status: number
  headers: Headers
  // Use byteCandidates for opaque encrypted payloads.
  bytes: Uint8Array
  byteCandidates?: {
    preferredEncoding: 'latin1' | 'utf8'
    availableEncodings: TorBodyByteEncoding[]
    latin1: Uint8Array
    utf8: Uint8Array
    base64?: Uint8Array
  }
}

const BASE64_BODY_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

let requestCounter = 0
let failureSnapshotCounter = 0
const console = createSanitizedConsole('TorFetch')

function nextRequestId(): number {
  return ++requestCounter
}

async function captureSampledFailureSnapshot(): Promise<Record<string, unknown>> {
  failureSnapshotCounter += 1

  if (failureSnapshotCounter === 1 || failureSnapshotCounter % 5 === 0) {
    return captureTorNetworkSnapshot()
  }

  return { networkSnapshotSkipped: true }
}

function decodeLatin1Bytes(body: string): Uint8Array {
  const bytes = new Uint8Array(body.length)
  for (let index = 0; index < body.length; index += 1) {
    bytes[index] = body.charCodeAt(index) & 0xff
  }
  return bytes
}

function decodeUtf8Bytes(body: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(body)
  }

  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(body, 'utf8'))
  }

  return decodeLatin1Bytes(body)
}

function decodeBase64Bytes(body: string): Uint8Array | null {
  if (body.length < 16 || body.length % 4 !== 0 || !BASE64_BODY_REGEX.test(body)) {
    return null
  }

  try {
    if (typeof atob === 'function') {
      const binary = atob(body)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index) & 0xff
      }
      return bytes
    }

    if (typeof Buffer !== 'undefined') {
      return Uint8Array.from(Buffer.from(body, 'base64'))
    }
  } catch {
    return null
  }

  return null
}

function shouldPreferUtf8Bytes(body: string): boolean {
  if (body.includes('\ufffd')) {
    return true
  }

  for (let index = 0; index < body.length; index += 1) {
    if (body.charCodeAt(index) > 0xff) {
      return true
    }
  }

  return false
}

function getTorHttpBodyByteCandidates(body: string): TorHttpBodyByteCandidates {
  const latin1 = decodeLatin1Bytes(body)
  const utf8 = decodeUtf8Bytes(body)
  const preferUtf8 = shouldPreferUtf8Bytes(body)

  return {
    preferred: preferUtf8 ? utf8 : latin1,
    preferredEncoding: preferUtf8 ? 'utf8' : 'latin1',
    latin1,
    utf8,
    base64: decodeBase64Bytes(body),
  }
}

/**
 * Send PATCH as POST because RnTor has no native PATCH method.
 */
function torMethodCall(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string
) {
  const timeout_ms = TOR_CONFIG.HTTP_TIMEOUT_MS

  if (method === 'PATCH') {
    headers['X-HTTP-Method-Override'] = 'PATCH'
    const headersJson = JSON.stringify(headers)
    return RnTor.httpPost({ url, body: body ?? '', headers: headersJson, timeout_ms })
  }

  const headersJson = JSON.stringify(headers)

  switch (method) {
    case 'GET':
    case 'HEAD':
      return RnTor.httpGet({ url, headers: headersJson, timeout_ms })
    case 'POST':
      return RnTor.httpPost({ url, body: body ?? '', headers: headersJson, timeout_ms })
    case 'PUT':
      return RnTor.httpPut({ url, body: body ?? '', headers: headersJson, timeout_ms })
    case 'DELETE':
      return RnTor.httpDelete({ url, headers: headersJson, timeout_ms })
    default:
      console.warn(`${LOG_PREFIX} Unsupported HTTP method '${method}', falling back to POST`)
      return RnTor.httpPost({ url, body: body ?? '', headers: headersJson, timeout_ms })
  }
}

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

async function performClearnetFetch(
  nativeFetch: FetchFn,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  assertClearnetEgressAllowed()
  const controller = new AbortController()
  const callerSignal = init?.signal
    ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined)
  const abortFromCaller = () => controller.abort()

  if (callerSignal?.aborted) {
    controller.abort()
  } else {
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true })
  }

  const unregister = registerClearnetOperation(() => controller.abort())
  try {
    return await nativeFetch(input, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    unregister()
    callerSignal?.removeEventListener('abort', abortFromCaller)
  }
}

function extractHeaders(raw?: HeadersInit): Record<string, string> {
  const headers: Record<string, string> = {}
  if (!raw) return headers

  if (raw instanceof Headers) {
    raw.forEach((value, key) => {
      headers[key] = value
    })
  } else if (Array.isArray(raw)) {
    for (const [key, value] of raw) {
      headers[key] = value
    }
  } else {
    Object.assign(headers, raw)
  }
  return headers
}

function extractBody(init?: RequestInit): string | undefined {
  if (!init?.body) return undefined

  if (typeof init.body === 'string') return init.body

  try {
    return JSON.stringify(init.body)
  } catch {
    return String(init.body)
  }
}

/**
 * Parse RnTor headers from JSON or raw HTTP header lines.
 */
function parseResponseHeaders(raw: unknown): Record<string, string> {
  const parsed: Record<string, string> = {}
  if (!raw) return parsed

  if (typeof raw === 'object' && raw !== null) {
    try {
      const obj = raw as Record<string, string>
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') parsed[k.toLowerCase()] = v
      }
      return parsed
    } catch { /* try string parsing */ }
  }

  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const obj = JSON.parse(raw) as Record<string, string>
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') parsed[k.toLowerCase()] = v
      }
      return parsed
    } catch {
      for (const line of raw.split(/\r?\n/)) {
        const idx = line.indexOf(':')
        if (idx > 0) {
          parsed[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim()
        }
      }
    }
  }

  return parsed
}

function shouldReturnNullResponseBody(method: string, statusCode: number): boolean {
  return method === 'HEAD' || statusCode === 204 || statusCode === 205 || statusCode === 304
}

function torRequestCancelledError(): Error {
  const error = new Error('Tor request cancelled')
  error.name = 'AbortError'
  return error
}

function throwIfRequestCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw torRequestCancelledError()
  }
}

/**
 * Wait for Tor to leave connecting; reject on timeout.
 */
function waitForTorConnection(
  requestId: number,
  method: string,
  urlSummary: string,
  signal?: AbortSignal,
): Promise<TorStatus> {
  return new Promise<TorStatus>((resolve, reject) => {
    if (signal?.aborted) {
      reject(torRequestCancelledError())
      return
    }

    const current = useTorStore.getState()
    if (current.status !== 'connecting') {
      resolve(current.status)
      return
    }

    const waitSpan = startTorLatencySpan('fetch', 'wait_for_connection', {
      requestId,
      method,
      url: urlSummary,
    })
    recordTorDiagnostic('fetch', 'wait_for_connection_started', {
      requestId,
      method,
      url: urlSummary,
      timeoutMs: TOR_CONFIG.FETCH_WAIT_TIMEOUT_MS,
    })

    let timeout: ReturnType<typeof setTimeout>
    let unsubscribe = () => {}
    function cleanup() {
      clearTimeout(timeout)
      unsubscribe()
      signal?.removeEventListener('abort', onAbort)
    }
    function onAbort() {
      cleanup()
      recordTorDiagnostic('fetch', 'wait_for_connection_cancelled', {
        requestId,
        method,
        url: urlSummary,
      })
      waitSpan.end({
        success: false,
        cancelled: true,
      })
      reject(torRequestCancelledError())
    }
    timeout = setTimeout(() => {
      cleanup()
      recordTorDiagnostic('fetch', 'wait_for_connection_failed', {
        requestId,
        method,
        url: urlSummary,
        error: 'Timed out waiting for Tor connection',
      })
      waitSpan.end({
        success: false,
        failed: true,
      })
      reject(new Error('Timed out waiting for Tor connection'))
    }, TOR_CONFIG.FETCH_WAIT_TIMEOUT_MS)

    unsubscribe = useTorStore.subscribe((state, prev) => {
      if (state.status === prev.status) return
      if (state.status !== 'connecting') {
        cleanup()
        recordTorDiagnostic('fetch', 'wait_for_connection_completed', {
          requestId,
          method,
          url: urlSummary,
          status: state.status,
        })
        waitSpan.end({
          success: state.status === 'connected',
          status: state.status,
        })
        resolve(state.status)
      }
    })
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

function awaitTorMethodCall<T>(request: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return request
  if (signal.aborted) return Promise.reject(torRequestCancelledError())

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const onAbort = () => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      reject(torRequestCancelledError())
    }

    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) {
      onAbort()
      return
    }
    void request.then(
      (value) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

async function performTorRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body: string | undefined,
  requestId: number,
  signal?: AbortSignal,
): Promise<{
  result: Awaited<ReturnType<typeof torMethodCall>>
  elapsedMs: number
  statusCode: number
  responseHeaders: Record<string, string>
  urlSummary: string
}> {
  const urlSummary = summarizeTorUrl(url)
  const requestSpan = startTorLatencySpan('fetch', 'tor_request', {
    requestId,
    method,
    url: urlSummary,
  })

  console.log(
    `${LOG_PREFIX} [req#${requestId}] ${method} ${url.slice(0, 100)}` +
    (body ? ` (body: ${body.length} chars)` : '')
  )
  recordTorDiagnostic('fetch', 'request_started', {
    requestId,
    method,
    url: urlSummary,
    bodyLength: body?.length ?? 0,
  })

  const startedAt = Date.now()

  try {
    const result = await awaitTorMethodCall(
      torMethodCall(method, url, headers, body),
      signal,
    )
    const elapsedMs = Date.now() - startedAt
    const statusCode = result.status_code || 200
    const responseHeaders = parseResponseHeaders(
      (result as unknown as Record<string, unknown>).headers,
    )

    if (result.error && result.error.length > 0) {
      const networkSnapshot = await captureSampledFailureSnapshot()
      console.warn(
        `${LOG_PREFIX} [req#${requestId}] FAILED after ${elapsedMs}ms: ${result.error}`
      )
      recordChatLatency('transport', 'tor_request', elapsedMs, {
        method,
        statusCode: result.status_code || 502,
        url: urlSummary,
        error: true,
      })
      recordTorDiagnostic('fetch', 'request_failed', {
        requestId,
        method,
        url: urlSummary,
        statusCode: result.status_code || 502,
        error: result.error,
        ...networkSnapshot,
      })
      requestSpan.end({
        success: false,
        statusCode: result.status_code || 502,
      })
      return {
        result,
        elapsedMs,
        statusCode: result.status_code || 502,
        responseHeaders,
        urlSummary,
      }
    }

    console.log(
      `${LOG_PREFIX} [req#${requestId}] ${statusCode} in ${elapsedMs}ms` +
      (result.body ? ` (${result.body.length} chars)` : '')
    )
    recordChatLatency('transport', 'tor_request', elapsedMs, {
      method,
      statusCode,
      url: urlSummary,
    })
    recordTorDiagnostic('fetch', 'request_succeeded', {
      requestId,
      method,
      url: urlSummary,
      statusCode,
      bodyLength: result.body?.length ?? 0,
    })
    requestSpan.end({
      success: true,
      statusCode,
    })

    return {
      result,
      elapsedMs,
      statusCode,
      responseHeaders,
      urlSummary,
    }
  } catch (error) {
    const elapsedMs = Date.now() - startedAt
    if (error instanceof Error && error.name === 'AbortError') {
      recordTorDiagnostic('fetch', 'request_cancelled', {
        requestId,
        method,
        url: urlSummary,
      })
      requestSpan.end({
        success: false,
        cancelled: true,
      })
      throw error
    }
    const errMsg = error instanceof Error ? error.message : String(error)
    const networkSnapshot = await captureSampledFailureSnapshot()

    console.error(
      `${LOG_PREFIX} [req#${requestId}] EXCEPTION after ${elapsedMs}ms: ${errMsg}`
    )
    recordChatLatency('transport', 'tor_request', elapsedMs, {
      method,
      url: urlSummary,
      exception: true,
    })
    recordTorDiagnostic('fetch', 'request_exception', {
      requestId,
      method,
      url: urlSummary,
      error: errMsg,
      ...networkSnapshot,
    })
    requestSpan.end({
      success: false,
      exception: true,
    })

    throw new Error(`Tor request failed: ${errMsg}`)
  }
}

async function prepareTorRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  requestId: number,
): Promise<{
  method: string
  url: string
  headers: Record<string, string>
  body: string | undefined
  urlSummary: string
}> {
  let { enabled, status } = useTorStore.getState()
  const url = extractUrl(input)
  const method = (init?.method ?? 'GET').toUpperCase()
  const urlSummary = summarizeTorUrl(url)

  if (!enabled) {
    throw new Error('prepareTorRequest called while Tor is disabled')
  }
  throwIfRequestCancelled(init?.signal ?? undefined)

  if (status === 'connecting') {
    console.log(
      `${LOG_PREFIX} [req#${requestId}] ${method} ${urlSummary} - Tor is connecting, waiting...`
    )
    status = await waitForTorConnection(requestId, method, urlSummary, init?.signal ?? undefined)
  }

  throwIfRequestCancelled(init?.signal ?? undefined)
  if (!useTorStore.getState().enabled) {
    recordTorDiagnostic('fetch', 'request_blocked', {
      requestId,
      method,
      url: urlSummary,
      reason: 'tor_disabled_while_waiting',
    })
    throw new Error('Tor was disabled while waiting for a connection. Retry the request.')
  }

  if (status !== 'connected') {
    recordTorDiagnostic('fetch', 'request_blocked', {
      requestId,
      method,
      url: urlSummary,
      status,
    })
    throw new Error(
      `Tor is enabled but not connected (status: ${status}). ` +
      'Cannot make network request without leaking IP.'
    )
  }

  const isFormData =
    typeof FormData !== 'undefined' && init?.body instanceof FormData
  if (isFormData) {
    recordTorDiagnostic('fetch', 'request_blocked', {
      requestId,
      method,
      url: urlSummary,
      reason: 'form_data_not_supported',
    })
    throw new Error('Tor cannot safely upload FormData. Use torSafeUpload instead.')
  }

  return {
    method,
    url,
    headers: extractHeaders(init?.headers),
    body: extractBody(init),
    urlSummary,
  }
}

export function createTorAwareFetch(nativeFetch: FetchFn = globalThis.fetch): FetchFn {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const { enabled } = useTorStore.getState()
    if (!enabled) {
      return performClearnetFetch(nativeFetch, input, init)
    }

    const requestId = nextRequestId()
    const request = await prepareTorRequest(input, init, requestId)
    throwIfRequestCancelled(init?.signal ?? undefined)
    const { result, statusCode, responseHeaders } = await performTorRequest(
      request.method,
      request.url,
      request.headers,
      request.body,
      requestId,
      init?.signal ?? undefined,
    )

    if (result.error && result.error.length > 0) {
      return new Response(result.error, {
        status: statusCode,
        statusText: 'Tor Error',
      })
    }

    return new Response(
      shouldReturnNullResponseBody(request.method, statusCode) ? null : (result.body ?? ''),
      {
        status: statusCode,
        headers: responseHeaders,
      },
    )
  }
}

export function createTorAwareFetchBytes(
  nativeFetch: FetchFn = globalThis.fetch,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<TorByteResponse> {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<TorByteResponse> => {
    const { enabled } = useTorStore.getState()
    if (!enabled) {
      const response = await performClearnetFetch(nativeFetch, input, init)
      return {
        ok: response.ok,
        status: response.status,
        headers: response.headers,
        bytes: new Uint8Array(await response.arrayBuffer()),
      }
    }

    const requestId = nextRequestId()
    const request = await prepareTorRequest(input, init, requestId)
    throwIfRequestCancelled(init?.signal ?? undefined)
    const { result, statusCode, responseHeaders } = await performTorRequest(
      request.method,
      request.url,
      request.headers,
      request.body,
      requestId,
      init?.signal ?? undefined,
    )

    if (result.error && result.error.length > 0) {
      return {
        ok: false,
        status: statusCode,
        headers: new Headers(responseHeaders),
        bytes: new Uint8Array(),
      }
    }

    const bodyCandidates = getTorHttpBodyByteCandidates(result.body ?? '')
    const bytes = bodyCandidates.preferred
    const availableEncodings: TorBodyByteEncoding[] = [
      ...(bodyCandidates.base64 ? ['base64' as const] : []),
      'latin1',
      'utf8',
    ]
    recordTorDiagnostic('fetch', 'binary_response_ready', {
      requestId,
      method: request.method,
      url: request.urlSummary,
      statusCode,
      byteLength: bytes.length,
      preferredEncoding: bodyCandidates.preferredEncoding,
      availableEncodings: availableEncodings.join(','),
      latin1Length: bodyCandidates.latin1.length,
      utf8Length: bodyCandidates.utf8.length,
      base64Length: bodyCandidates.base64?.length ?? null,
    })

    return {
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      headers: new Headers(responseHeaders),
      bytes,
      byteCandidates: {
        preferredEncoding: bodyCandidates.preferredEncoding,
        availableEncodings,
        latin1: bodyCandidates.latin1,
        utf8: bodyCandidates.utf8,
        ...(bodyCandidates.base64 ? { base64: bodyCandidates.base64 } : {}),
      },
    }
  }
}

export const torAwareFetch = createTorAwareFetch()
export const torAwareFetchBytes = createTorAwareFetchBytes()
