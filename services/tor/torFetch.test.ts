/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  torEnabled: true,
  torStatus: 'connected',
  httpGet: vi.fn(),
  httpPost: vi.fn(),
  httpPut: vi.fn(),
  httpDelete: vi.fn(),
  recordChatLatency: vi.fn(),
  captureTorNetworkSnapshot: vi.fn(async () => ({})),
  recordTorDiagnostic: vi.fn(),
  startTorLatencySpan: vi.fn(() => ({ end: vi.fn() })),
  subscribeListener: null as null | ((state: { status: string }, prev: { status: string }) => void),
  subscribe: vi.fn((listener: (state: { status: string }, prev: { status: string }) => void) => {
    void listener
    return () => undefined
  }),
}))

vi.mock('react-native-nitro-tor', () => ({
  RnTor: {
    httpGet: mockState.httpGet,
    httpPost: mockState.httpPost,
    httpPut: mockState.httpPut,
    httpDelete: mockState.httpDelete,
  },
}))

vi.mock('./torStore', () => ({
  useTorStore: {
    getState: () => ({
      enabled: mockState.torEnabled,
      status: mockState.torStatus,
    }),
    subscribe: mockState.subscribe,
  },
}))

vi.mock('./torConstants', () => ({
  LOG_PREFIX: '[TOR]',
  TOR_CONFIG: {
    HTTP_TIMEOUT_MS: 2000,
    FETCH_WAIT_TIMEOUT_MS: 2000,
  },
}))

vi.mock('../chat/chatLatency', () => ({
  recordChatLatency: mockState.recordChatLatency,
}))

vi.mock('./torDiagnostics', () => ({
  captureTorNetworkSnapshot: mockState.captureTorNetworkSnapshot,
  recordTorDiagnostic: mockState.recordTorDiagnostic,
  startTorLatencySpan: mockState.startTorLatencySpan,
  summarizeTorUrl: (url: string) => url,
}))

import { createTorAwareFetch, createTorAwareFetchBytes } from './torFetch'
import { setClearnetEgressAllowed } from './torEgressPolicy'

describe('createTorAwareFetchBytes', () => {
  beforeEach(async () => {
    await setClearnetEgressAllowed(true)
    mockState.torEnabled = true
    mockState.torStatus = 'connected'
    mockState.httpGet.mockReset()
    mockState.httpPost.mockReset()
    mockState.httpPut.mockReset()
    mockState.httpDelete.mockReset()
    mockState.recordChatLatency.mockReset()
    mockState.captureTorNetworkSnapshot.mockClear()
    mockState.recordTorDiagnostic.mockReset()
    mockState.startTorLatencySpan.mockClear()
    mockState.subscribe.mockClear()
    mockState.subscribeListener = null
    mockState.subscribe.mockImplementation((listener) => {
      mockState.subscribeListener = listener
      return vi.fn()
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    await setClearnetEgressAllowed(true)
    vi.restoreAllMocks()
  })

  it('builds Tor body decode candidates for binary responses', async () => {
    const body = 'QUJDREVGR0hJSktM'
    const latin1Bytes = Uint8Array.from([...body].map((char) => char.charCodeAt(0)))
    const decodedBase64Bytes = Uint8Array.from([65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76])

    mockState.httpGet.mockResolvedValue({
      status_code: 200,
      body,
      error: '',
      headers: {
        'content-type': 'application/octet-stream',
      },
    })

    const fetchBytes = createTorAwareFetchBytes()
    const response = await fetchBytes('https://example.com/storage/v1/object/sign/chat-media/media.enc')

    expect(mockState.httpGet).toHaveBeenCalledTimes(1)
    expect(response.ok).toBe(true)
    expect(response.status).toBe(200)
    expect(response.bytes).toEqual(latin1Bytes)
    expect(response.byteCandidates).toEqual({
      preferredEncoding: 'latin1',
      availableEncodings: ['base64', 'latin1', 'utf8'],
      latin1: latin1Bytes,
      utf8: latin1Bytes,
      base64: decodedBase64Bytes,
    })
  })

  it('falls back to native fetch when Tor is disabled', async () => {
    mockState.torEnabled = false
    const nativeFetch = vi.fn(async () => new Response(Uint8Array.from([9, 8, 7]), { status: 206 }))

    const fetchBytes = createTorAwareFetchBytes(nativeFetch as typeof fetch)
    const response = await fetchBytes('https://example.com/file.bin')

    expect(nativeFetch).toHaveBeenCalledTimes(1)
    expect(response.ok).toBe(true)
    expect(response.status).toBe(206)
    expect(response.bytes).toEqual(Uint8Array.from([9, 8, 7]))
    expect(response.byteCandidates).toBeUndefined()
  })
})

describe('createTorAwareFetch', () => {
  beforeEach(async () => {
    await setClearnetEgressAllowed(true)
    mockState.torEnabled = true
    mockState.torStatus = 'connected'
    mockState.httpGet.mockReset()
    mockState.httpPost.mockReset()
    mockState.httpPut.mockReset()
    mockState.httpDelete.mockReset()
    mockState.recordChatLatency.mockReset()
    mockState.captureTorNetworkSnapshot.mockClear()
    mockState.recordTorDiagnostic.mockReset()
    mockState.startTorLatencySpan.mockClear()
    mockState.subscribe.mockClear()
    mockState.subscribeListener = null
    mockState.subscribe.mockImplementation((listener) => {
      mockState.subscribeListener = listener
      return vi.fn()
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(async () => {
    await setClearnetEgressAllowed(true)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('delegates to native fetch when Tor is disabled', async () => {
    mockState.torEnabled = false
    const nativeFetch = vi.fn(async () => new Response('native', { status: 202 }))
    const fetchFn = createTorAwareFetch(nativeFetch as typeof fetch)

    const response = await fetchFn('https://example.com/native')

    expect(nativeFetch).toHaveBeenCalledWith(
      'https://example.com/native',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    expect(response.status).toBe(202)
    await expect(response.text()).resolves.toBe('native')
    expect(mockState.httpGet).not.toHaveBeenCalled()
  })

  it('aborts an in-flight native request when the Tor boundary closes', async () => {
    mockState.torEnabled = false
    const nativeFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('native request aborted')))
      }),
    )
    const request = createTorAwareFetch(nativeFetch as typeof fetch)('https://example.com/native')
    await vi.waitFor(() => expect(nativeFetch).toHaveBeenCalledTimes(1))

    await setClearnetEgressAllowed(false)

    await expect(request).rejects.toThrow('native request aborted')
  })

  it('fails closed when Tor is enabled but disconnected', async () => {
    mockState.torStatus = 'disconnected'
    const nativeFetch = vi.fn()
    const fetchFn = createTorAwareFetch(nativeFetch as typeof fetch)

    await expect(fetchFn('https://example.com/private')).rejects.toThrow(
      'Cannot make network request without leaking IP',
    )

    expect(nativeFetch).not.toHaveBeenCalled()
    expect(mockState.httpGet).not.toHaveBeenCalled()
  })

  it('waits for connecting Tor to become connected before dispatching', async () => {
    mockState.torStatus = 'connecting'
    mockState.httpGet.mockResolvedValue({
      status_code: 200,
      body: 'ok',
      error: '',
      headers: {},
    })
    const fetchFn = createTorAwareFetch()
    const requestPromise = fetchFn('https://example.com/queued')

    expect(mockState.subscribe).toHaveBeenCalledTimes(1)
    mockState.torStatus = 'connected'
    mockState.subscribeListener?.({ status: 'connected' }, { status: 'connecting' })

    const response = await requestPromise

    expect(response.status).toBe(200)
    await expect(response.text()).resolves.toBe('ok')
    expect(mockState.httpGet).toHaveBeenCalledTimes(1)
  })

  it('cancels before dispatch while Tor is connecting', async () => {
    mockState.torStatus = 'connecting'
    const controller = new AbortController()
    const fetchFn = createTorAwareFetch()
    const requestPromise = fetchFn('https://example.com/queued', {
      signal: controller.signal,
    })

    expect(mockState.subscribe).toHaveBeenCalledTimes(1)
    controller.abort()

    await expect(requestPromise).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Tor request cancelled',
    })
    expect(mockState.httpGet).not.toHaveBeenCalled()
  })

  it('returns promptly when an active native Tor request is cancelled', async () => {
    let finishRequest!: (value: {
      status_code: number
      body: string
      error: string
      headers: Record<string, string>
    }) => void
    mockState.httpPost.mockImplementation(() => new Promise((resolve) => {
      finishRequest = resolve
    }))
    const controller = new AbortController()
    const fetchFn = createTorAwareFetch()
    const requestPromise = fetchFn('https://example.com/submit', {
      method: 'POST',
      body: '{"sealed":true}',
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(mockState.httpPost).toHaveBeenCalledTimes(1))

    controller.abort()

    await expect(requestPromise).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Tor request cancelled',
    })
    finishRequest({
      status_code: 200,
      body: 'ok',
      error: '',
      headers: {},
    })
    await Promise.resolve()
  })

  it('does not dispatch through Tor after it is disabled during connection wait', async () => {
    mockState.torStatus = 'connecting'
    const fetchFn = createTorAwareFetch()
    const requestPromise = fetchFn('https://example.com/queued')

    expect(mockState.subscribe).toHaveBeenCalledTimes(1)
    mockState.torEnabled = false
    mockState.torStatus = 'connected'
    mockState.subscribeListener?.({ status: 'connected' }, { status: 'connecting' })

    await expect(requestPromise).rejects.toThrow(
      'Tor was disabled while waiting for a connection',
    )
    expect(mockState.httpGet).not.toHaveBeenCalled()
  })

  it('times out instead of falling back while Tor is connecting', async () => {
    vi.useFakeTimers()
    mockState.torStatus = 'connecting'
    const fetchFn = createTorAwareFetch()
    const requestPromise = fetchFn('https://example.com/timeout')
    const rejection = expect(requestPromise).rejects.toThrow('Timed out waiting for Tor connection')

    await vi.advanceTimersByTimeAsync(2_001)

    await rejection
    expect(mockState.httpGet).not.toHaveBeenCalled()
  })

  it('uses POST with X-HTTP-Method-Override for PATCH', async () => {
    mockState.httpPost.mockResolvedValue({
      status_code: 204,
      body: '',
      error: '',
      headers: {},
    })
    const fetchFn = createTorAwareFetch()

    const response = await fetchFn('https://example.com/resource', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer token',
      },
      body: JSON.stringify({ ok: true }),
    })

    expect(response.status).toBe(204)
    expect(mockState.httpPost).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com/resource',
      body: '{"ok":true}',
      headers: JSON.stringify({
        Authorization: 'Bearer token',
        'X-HTTP-Method-Override': 'PATCH',
      }),
    }))
  })

  it('returns a null body for successful HEAD requests', async () => {
    mockState.httpGet.mockResolvedValue({
      status_code: 204,
      body: 'ignored',
      error: '',
      headers: {},
    })
    const fetchFn = createTorAwareFetch()

    const response = await fetchFn('https://example.com/head', { method: 'HEAD' })

    expect(response.status).toBe(204)
    await expect(response.text()).resolves.toBe('')
  })

  it('returns native Tor error text as a non-ok response', async () => {
    mockState.httpGet.mockResolvedValue({
      status_code: 502,
      body: '',
      error: 'Tor stream failed',
      headers: {},
    })
    const fetchFn = createTorAwareFetch()

    const response = await fetchFn('https://example.com/fail')

    expect(response.ok).toBe(false)
    expect(response.status).toBe(502)
    expect(response.statusText).toBe('Tor Error')
    await expect(response.text()).resolves.toBe('Tor stream failed')
  })

  it('blocks FormData bodies on the generic fetch path', async () => {
    const formData = new FormData()
    formData.append('file', 'payload')
    const fetchFn = createTorAwareFetch()

    await expect(fetchFn('https://example.com/upload', {
      method: 'POST',
      body: formData,
    })).rejects.toThrow('Tor cannot safely upload FormData')

    expect(mockState.httpPost).not.toHaveBeenCalled()
  })
})
