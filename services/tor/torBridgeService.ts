/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { TOR_CONFIG, LOG_PREFIX, type BridgeType, type TorStatus } from './torConstants'
import {
  captureTorNetworkSnapshot,
  createTorCorrelationId,
  recordTorDiagnostic,
  recordTorLatency,
  summarizeTorUrl,
} from './torDiagnostics'
import { torAwareFetch } from './torFetch'
import { useTorStore } from './torStore'
import { createSanitizedConsole } from '@/services/logging/mobileLogger'

type BridgeTransport = Exclude<BridgeType, 'none'>
type FetchFn = typeof globalThis.fetch
export type BridgeFetchRoute = 'tor' | 'clearnet'
type BridgeFetchReason = 'tor_enabled' | 'tor_disabled'

interface MoatRequestOptions {
  fetchFn?: FetchFn
  torFetchFn?: FetchFn
  clearnetFetchFn?: FetchFn
  timeoutMs?: number
  correlationId?: string
  torStatus?: TorStatus
  torEnabled?: boolean
}

interface MoatRequestResult<T> {
  data: T
  status: number
  bodyLength: number
  contentType: string | null
}

interface ResolvedMoatRequestOptions {
  fetchFn: FetchFn
  timeoutMs: number
  correlationId: string
  route: BridgeFetchRoute
  torStatus: TorStatus
  torEnabled: boolean
  routeReason: BridgeFetchReason
}

export interface BridgeFetchResult {
  bridges: string[]
  error?: string
  route: BridgeFetchRoute
  torStatus: TorStatus
}

const MOAT_BASE = 'https://bridges.torproject.org/moat'
const console = createSanitizedConsole('TorBridge')

function buildMoatStepError(stepLabel: string, error: unknown, timeoutMs: number): string {
  const message = error instanceof Error ? error.message : String(error)

  if (message === 'This operation was aborted' || message === 'The operation was aborted' || message === 'Aborted') {
    return `${stepLabel} timed out after ${timeoutMs}ms`
  }

  if (/abort/i.test(message) && /timed out/i.test(message)) {
    return `${stepLabel} timed out after ${timeoutMs}ms`
  }

  if (/network request failed/i.test(message)) {
    return `${stepLabel} failed: Network request failed while contacting the Tor Project bridge distributor`
  }

  return `${stepLabel} failed: ${message}`
}

async function requestMoatJson<T>(
  step: 'settings' | 'builtin',
  url: string,
  init: RequestInit,
  options: ResolvedMoatRequestOptions,
): Promise<MoatRequestResult<T>> {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
  const method = (init.method ?? 'GET').toUpperCase()
  const urlSummary = summarizeTorUrl(url)

  recordTorDiagnostic('bridge', 'request_started', {
    correlationId: options.correlationId,
    step,
    method,
    route: options.route,
    torStatus: options.torStatus,
    url: urlSummary,
    timeoutMs: options.timeoutMs,
  })

  try {
    const response = await options.fetchFn(url, {
      ...init,
      signal: controller.signal,
    })
    const elapsedMs = Date.now() - startedAt
    const bodyText = await response.text()
    const contentType = response.headers.get('content-type')

    recordTorLatency('bridge', `request_${step}`, elapsedMs, {
      correlationId: options.correlationId,
      method,
      route: options.route,
      statusCode: response.status,
      url: urlSummary,
    })
    recordTorDiagnostic('bridge', 'request_response', {
      correlationId: options.correlationId,
      step,
      method,
      route: options.route,
      torStatus: options.torStatus,
      statusCode: response.status,
      ok: response.ok,
      url: urlSummary,
      contentType,
      bodyLength: bodyText.length,
      bodyPreview: bodyText.length > 0 ? '[redacted]' : null,
    })

    if (!response.ok) {
      throw new Error(`${step} returned HTTP ${response.status}`)
    }

    try {
      return {
        data: JSON.parse(bodyText) as T,
        status: response.status,
        bodyLength: bodyText.length,
        contentType,
      }
    } catch (error) {
      throw new Error(`${step} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
  } catch (error) {
    const elapsedMs = Date.now() - startedAt
    const networkSnapshot = await captureTorNetworkSnapshot()
    const classifiedError = buildMoatStepError(step, error, options.timeoutMs)

    recordTorLatency('bridge', `request_${step}`, elapsedMs, {
      correlationId: options.correlationId,
      method,
      route: options.route,
      url: urlSummary,
      failed: true,
    })
    recordTorDiagnostic('bridge', 'request_failed', {
      correlationId: options.correlationId,
      step,
      method,
      route: options.route,
      torStatus: options.torStatus,
      url: urlSummary,
      timeoutMs: options.timeoutMs,
      error: classifiedError,
      ...networkSnapshot,
    })

    throw new Error(classifiedError)
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Extract bridge strings for the requested transport.
 */
function extractBridgesFromSettings(
  data: { settings?: Array<{ bridges?: { type?: string; bridge_strings?: string[]; source?: string } }> },
  transport: BridgeTransport,
): string[] {
  if (!data.settings || !Array.isArray(data.settings)) return []

  const allBridges: string[] = []
  for (const entry of data.settings) {
    const bridges = entry.bridges
    if (!bridges?.bridge_strings?.length) continue

    if (bridges.type === transport) {
      console.log(
        `${LOG_PREFIX} [Moat] Found ${bridges.bridge_strings.length} bridges ` +
        `(type=${bridges.type}, source=${bridges.source ?? 'unknown'})`
      )
      allBridges.push(...bridges.bridge_strings)
      continue
    }

    console.log(
      `${LOG_PREFIX} [Moat] Skipping ${bridges.bridge_strings.length} bridges ` +
      `(type=${bridges.type}, wanted=${transport})`
    )
  }

  return allBridges
}

function resolveBridgeFetchRoute(
  options: MoatRequestOptions,
): ResolvedMoatRequestOptions {
  const store = useTorStore.getState()
  const torEnabled = options.torEnabled ?? store.enabled
  const torStatus = options.torStatus ?? store.status
  const route: BridgeFetchRoute = torEnabled ? 'tor' : 'clearnet'
  const routeReason: BridgeFetchReason = torEnabled ? 'tor_enabled' : 'tor_disabled'
  const fetchFn =
    route === 'tor'
      ? (options.torFetchFn ?? options.fetchFn ?? torAwareFetch)
      : (options.clearnetFetchFn ?? options.fetchFn ?? torAwareFetch)

  return {
    fetchFn,
    timeoutMs: options.timeoutMs ?? TOR_CONFIG.BRIDGE_FETCH_TIMEOUT_MS,
    correlationId: options.correlationId ?? createTorCorrelationId('tor-bridge'),
    route,
    torStatus,
    torEnabled,
    routeReason,
  }
}

/**
 * Fetch bridges from Moat/rdsys.
 */
export async function fetchBridgesFromMoat(
  transport: BridgeTransport = 'obfs4',
  options: MoatRequestOptions = {},
): Promise<BridgeFetchResult> {
  const resolvedOptions = resolveBridgeFetchRoute(options)
  const { correlationId, timeoutMs, route, torStatus, torEnabled, routeReason } = resolvedOptions
  const networkSnapshot = await captureTorNetworkSnapshot()

  console.log(`${LOG_PREFIX} fetchBridgesFromMoat(transport=${transport})`)
  recordTorDiagnostic('bridge', 'route_selected', {
    correlationId,
    transport,
    route,
    torStatus,
    torEnabled,
    routeReason,
  })
  recordTorDiagnostic('bridge', 'fetch_started', {
    correlationId,
    transport,
    route,
    torStatus,
    torEnabled,
    routeReason,
    timeoutMs,
    ...networkSnapshot,
  })

  try {
    const settingsUrl = `${MOAT_BASE}/circumvention/settings`
    console.log(`${LOG_PREFIX} [Moat] POST ${settingsUrl} (transports=[${transport}])`)

    const settingsResult = await requestMoatJson<{
      errors?: Array<{ detail?: string; code?: number }>
      settings?: Array<{ bridges?: { type?: string; bridge_strings?: string[]; source?: string } }>
    }>(
      'settings',
      settingsUrl,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transports: [transport] }),
      },
      resolvedOptions,
    )

    if (settingsResult.data.errors?.length) {
      recordTorDiagnostic('bridge', 'settings_api_warning', {
        correlationId,
        transport,
        route,
        torStatus,
        errorCode: settingsResult.data.errors[0]?.code ?? null,
        error: settingsResult.data.errors[0]?.detail ?? 'Unknown settings error',
      })
    }

    const settingsBridges = extractBridgesFromSettings(settingsResult.data, transport)
    if (settingsBridges.length > 0) {
      console.log(`${LOG_PREFIX} [Moat] /settings returned ${settingsBridges.length} ${transport} bridges`)
      recordTorDiagnostic('bridge', 'fetch_succeeded', {
        correlationId,
        transport,
        route,
        torStatus,
        source: 'settings',
        bridgeCount: settingsBridges.length,
        settingsStatusCode: settingsResult.status,
        responseBodyLength: settingsResult.bodyLength,
      })
      return { bridges: settingsBridges, route, torStatus }
    }

    console.log(`${LOG_PREFIX} [Moat] /settings returned 0 bridges for ${transport}, trying /builtin...`)
    recordTorDiagnostic('bridge', 'fallback_requested', {
      correlationId,
      transport,
      route,
      torStatus,
      fromStep: 'settings',
      toStep: 'builtin',
      reason: 'no_matching_bridges',
      settingsStatusCode: settingsResult.status,
      responseBodyLength: settingsResult.bodyLength,
    })
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.warn(`${LOG_PREFIX} [Moat] /settings failed: ${errMsg} - falling back to /builtin`)
    recordTorDiagnostic('bridge', 'fallback_requested', {
      correlationId,
      transport,
      route,
      torStatus,
      fromStep: 'settings',
      toStep: 'builtin',
      reason: 'settings_failed',
      error: errMsg,
    })
  }

  try {
    const builtinUrl = `${MOAT_BASE}/circumvention/builtin`
    console.log(`${LOG_PREFIX} [Moat] GET ${builtinUrl}`)

    const builtinResult = await requestMoatJson<Record<string, string[]>>(
      'builtin',
      builtinUrl,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
      resolvedOptions,
    )

    const availableTypes = Object.keys(builtinResult.data).sort()
    const builtinBridges = builtinResult.data[transport] ?? []

    console.log(`${LOG_PREFIX} [Moat] /builtin available transports: ${availableTypes.join(', ')}`)
    console.log(`${LOG_PREFIX} [Moat] /builtin has ${builtinBridges.length} ${transport} bridges`)

    if (builtinBridges.length > 0) {
      recordTorDiagnostic('bridge', 'fetch_succeeded', {
        correlationId,
        transport,
        route,
        torStatus,
        source: 'builtin',
        bridgeCount: builtinBridges.length,
        builtinStatusCode: builtinResult.status,
        responseBodyLength: builtinResult.bodyLength,
      })
      return { bridges: builtinBridges, route, torStatus }
    }

    const errorMessage =
      `No ${transport} bridges available from Tor Project. ` +
      `Available types: ${availableTypes.join(', ') || 'none'}. ` +
      'Try a different transport or enter bridges manually.'

    recordTorDiagnostic('bridge', 'fetch_empty', {
      correlationId,
      transport,
      route,
      torStatus,
      source: 'builtin',
      bridgeCount: 0,
      availableTypes: availableTypes.join(','),
      builtinStatusCode: builtinResult.status,
    })
    return {
      bridges: [],
      error: errorMessage,
      route,
      torStatus,
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`${LOG_PREFIX} [Moat] /builtin failed: ${errMsg}`)
    recordTorDiagnostic('bridge', 'fetch_failed', {
      correlationId,
      transport,
      route,
      torStatus,
      step: 'builtin',
      error: errMsg,
    })
    return { bridges: [], error: errMsg, route, torStatus }
  }
}
