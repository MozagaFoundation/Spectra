/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  netInfoFetch: vi.fn(),
  torEnabled: false,
  torStatus: 'disconnected' as 'disconnected' | 'connecting' | 'connected' | 'error',
  torFetch: vi.fn(),
}))

vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: mockState.netInfoFetch,
  },
}))

vi.mock('@/lib/constants', () => ({
  STORAGE_KEYS: {
    TOR_ENABLED: 'tor_enabled',
    TOR_BRIDGES: 'tor_bridges',
    TOR_SOCKS_PORT: 'tor_socks_port',
  },
}))

vi.mock('./torStore', () => ({
  useTorStore: {
    getState: () => ({
      enabled: mockState.torEnabled,
      status: mockState.torStatus,
    }),
  },
}))

vi.mock('./torFetch', () => ({
  torAwareFetch: mockState.torFetch,
}))

import { fetchBridgesFromMoat } from './torBridgeService'
import {
  clearTorDiagnosticEvents,
  getRecentTorDiagnosticEvents,
} from './torDiagnostics'

function createAbortError(): Error {
  const error = new Error('Aborted')
  ;(error as Error & { name: string }).name = 'AbortError'
  return error
}

describe('fetchBridgesFromMoat', () => {
  beforeEach(() => {
    mockState.netInfoFetch.mockReset()
    mockState.torFetch.mockReset()
    mockState.torEnabled = false
    mockState.torStatus = 'disconnected'
    mockState.netInfoFetch.mockResolvedValue({
      type: 'wifi',
      isConnected: true,
      isInternetReachable: true,
      details: {
        isConnectionExpensive: false,
      },
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    clearTorDiagnosticEvents()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    clearTorDiagnosticEvents()
  })

  it('returns bridges from the settings endpoint without falling back', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          settings: [
            {
              bridges: {
                type: 'obfs4',
                source: 'bridgedb',
                bridge_strings: [
                  'obfs4 192.0.2.1:9001 cert=abcdef iat-mode=0',
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    )

    const result = await fetchBridgesFromMoat('obfs4', {
      correlationId: 'test-settings',
      fetchFn: fetchFn as unknown as typeof fetch,
    })

    expect(result).toEqual({
      bridges: ['obfs4 192.0.2.1:9001 cert=abcdef iat-mode=0'],
      route: 'clearnet',
      torStatus: 'disconnected',
    })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(
      getRecentTorDiagnosticEvents().some(
        (event) =>
          event.name === 'request_response'
          && event.fields.bodyPreview === '[redacted]',
      ),
    ).toBe(true)
    expect(
      getRecentTorDiagnosticEvents().some(
        (event) => String(event.fields.bodyPreview).includes('192.0.2.1'),
      ),
    ).toBe(false)
  })

  it('falls back to builtin bridges when the settings request fails', async () => {
    const fetchFn = vi.fn()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            obfs4: ['obfs4 198.51.100.10:443 cert=bridgecert iat-mode=0'],
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
            },
          },
        ),
      )

    const result = await fetchBridgesFromMoat('obfs4', {
      correlationId: 'test-fallback',
      fetchFn: fetchFn as unknown as typeof fetch,
    })

    expect(result).toEqual({
      bridges: ['obfs4 198.51.100.10:443 cert=bridgecert iat-mode=0'],
      route: 'clearnet',
      torStatus: 'disconnected',
    })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('returns a timeout-classified error when both endpoints time out', async () => {
    vi.useFakeTimers()

    const fetchFn = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) {
          return
        }

        if (signal.aborted) {
          reject(createAbortError())
          return
        }

        signal.addEventListener(
          'abort',
          () => {
            reject(createAbortError())
          },
          { once: true },
        )
      })
    })

    const resultPromise = fetchBridgesFromMoat('obfs4', {
      correlationId: 'test-timeout',
      fetchFn: fetchFn as unknown as typeof fetch,
      timeoutMs: 25,
    })

    await vi.advanceTimersByTimeAsync(80)

    await expect(resultPromise).resolves.toEqual({
      bridges: [],
      error: 'builtin timed out after 25ms',
      route: 'clearnet',
      torStatus: 'disconnected',
    })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('uses torAwareFetch when Tor is already connected', async () => {
    mockState.torEnabled = true
    mockState.torStatus = 'connected'
    const clearnetFetch = vi.fn()
    vi.stubGlobal('fetch', clearnetFetch)
    mockState.torFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          settings: [
            {
              bridges: {
                type: 'obfs4',
                source: 'bridgedb',
                bridge_strings: ['obfs4 203.0.113.55:443 cert=torroute iat-mode=0'],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    )

    const result = await fetchBridgesFromMoat('obfs4', {
      correlationId: 'test-tor-route',
    })

    expect(result).toEqual({
      bridges: ['obfs4 203.0.113.55:443 cert=torroute iat-mode=0'],
      route: 'tor',
      torStatus: 'connected',
    })
    expect(mockState.torFetch).toHaveBeenCalledTimes(1)
    expect(clearnetFetch).not.toHaveBeenCalled()
    expect(
      getRecentTorDiagnosticEvents().some(
        (event) =>
          event.name === 'route_selected'
          && event.fields.route === '[redacted]'
          && event.fields.routeReason === '[redacted]',
      ),
    ).toBe(true)
  })

  it('keeps bridge discovery on the Tor transport while Tor is connecting', async () => {
    mockState.torEnabled = true
    mockState.torStatus = 'connecting'
    const clearnetFetch = vi.fn()
    vi.stubGlobal('fetch', clearnetFetch as unknown as typeof fetch)
    mockState.torFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          settings: [
            {
              bridges: {
                type: 'obfs4',
                source: 'bridgedb',
                bridge_strings: ['obfs4 198.51.100.42:9001 cert=bootstrap iat-mode=0'],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    )

    const result = await fetchBridgesFromMoat('obfs4', {
      correlationId: 'test-clearnet-route',
    })

    expect(result).toEqual({
      bridges: ['obfs4 198.51.100.42:9001 cert=bootstrap iat-mode=0'],
      route: 'tor',
      torStatus: 'connecting',
    })
    expect(clearnetFetch).not.toHaveBeenCalled()
    expect(mockState.torFetch).toHaveBeenCalledTimes(1)
    expect(
      getRecentTorDiagnosticEvents().some(
        (event) =>
          event.name === 'route_selected'
          && event.fields.route === '[redacted]'
          && event.fields.routeReason === '[redacted]',
      ),
    ).toBe(true)
  })
})
