/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Tor daemon lifecycle management.
 */

import { RnTor } from 'react-native-nitro-tor'
import { AppState } from 'react-native'
import { Paths, Directory, File } from 'expo-file-system'
import { useTorStore } from './torStore'
import {
  TOR_CONFIG,
  TOR_SERVICE_STATUS,
  LOG_PREFIX,
  type BridgeType,
} from './torConstants'
import { startTransport, stopTransports, isIPtProxyAvailable } from './iptProxy'
import { registerBackgroundFetch, unregisterBackgroundFetch } from './torBackgroundFetch'
import { normalizeTorBridgeLines } from './torBridgeLines'
import {
  captureTorNetworkSnapshot,
  createTorCorrelationId,
  recordTorDiagnostic,
  startTorLatencySpan,
} from './torDiagnostics'
import { createSanitizedConsole } from '@/services/logging/mobileLogger'

let healthCheckTimer: ReturnType<typeof setInterval> | null = null
let reconnectAttempts = 0
let consecutiveHealthCheckFailures = 0
let startTorInFlightPromise: Promise<boolean> | null = null
let reconnectTorInFlightPromise: Promise<boolean> | null = null
let bridgeConfigurationQueue = Promise.resolve()
let healthCheckInFlight = false
let torLifecycleGeneration = 0
const console = createSanitizedConsole('TorService')

function describeNativeServiceStatus(status: number): string {
  if (status === TOR_SERVICE_STATUS.STARTING) {
    return 'starting'
  }
  if (status === TOR_SERVICE_STATUS.RUNNING) {
    return 'running'
  }
  if (status === TOR_SERVICE_STATUS.STOPPED_OR_ERROR) {
    return 'stopped_or_error'
  }
  return `unknown(${status})`
}

/**
 * Store Tor data in Documents so iOS purges and native paths stay stable.
 */
function getDataDir(): string {
  const docUri = Paths.document.uri
  const plainPath = docUri.startsWith('file://') ? docUri.slice(7) : docUri
  return `${plainPath.replace(/\/+$/, '')}/tor-data`
}

export async function clearTorRuntimeData(): Promise<void> {
  try {
    await stopTor()
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to stop Tor before clearing runtime data:`, error)
  }

  const dataDir = new Directory(`file://${getDataDir()}`)
  if (dataDir.exists) {
    dataDir.delete()
  }
}

function ensureDataDir(dataDir: string): void {
  try {
    const dir = new Directory(`file://${dataDir}`)
    if (!dir.exists) {
      console.log(`${LOG_PREFIX} Creating data directory: ${dataDir}`)
      dir.create({ idempotent: true })
      console.log(`${LOG_PREFIX} Data directory created`)
    } else {
      console.log(`${LOG_PREFIX} Data directory already exists`)
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to create data directory:`, err)
    throw err
  }
}

/**
 * Remove stale lock files left by unclean shutdowns.
 */
function removeStaleLockFile(dataDir: string): void {
  try {
    const lockFile = new File(`file://${dataDir}/lock`)
    if (lockFile.exists) {
      console.log(`${LOG_PREFIX} Removing stale Tor lock file`)
      lockFile.delete()
      console.log(`${LOG_PREFIX} Lock file removed`)
    }
  } catch (err) {
    console.warn(`${LOG_PREFIX} Failed to remove lock file (non-fatal):`, err)
  }
}

function logTorFilesystemState(dataDir: string): void {
  try {
    const dir = new Directory(`file://${dataDir}`)
    const lockFile = new File(`file://${dataDir}/lock`)
    const torrcFile = new File(`file://${dataDir}/torrc`)

    console.log(
      `${LOG_PREFIX} Filesystem state: ` +
      `dir.exists=${String(dir.exists)}, ` +
      `lock.exists=${String(lockFile.exists)}, ` +
      `torrc.exists=${String(torrcFile.exists)}`
    )
  } catch (err) {
    console.warn(`${LOG_PREFIX} Failed to inspect Tor filesystem state:`, err)
  }
}

function writeBridgeTorrc(
  dataDir: string,
  bridges: string[],
  bridgeType: string = 'none',
  transportPort?: number,
): void {
  const lines: string[] = ['UseBridges 1']
  const normalizedBridges = normalizeTorBridgeLines(bridges)

  if (transportPort != null && bridgeType !== 'none') {
    const transportName = bridgeType === 'webtunnel' ? 'webtunnel' : bridgeType
    lines.push(`ClientTransportPlugin ${transportName} socks5 127.0.0.1:${transportPort}`)
  }

  for (const bridge of normalizedBridges) {
    lines.push(`Bridge ${bridge}`)
  }

  const torrcContent = lines.join('\n') + '\n'
  console.log(
    `${LOG_PREFIX} Writing torrc with ${normalizedBridges.length} bridge(s)` +
    (transportPort != null && bridgeType !== 'none' ? ` via ${bridgeType}` : '')
  )

  try {
    const torrcFile = new File(`file://${dataDir}/torrc`)
    torrcFile.write(torrcContent)
    console.log(`${LOG_PREFIX} torrc written to ${dataDir}/torrc`)
  } catch (err) {
    console.error(`${LOG_PREFIX} Failed to write torrc:`, err)
    throw err
  }
}

function removeStaleTorrc(dataDir: string): void {
  try {
    const torrcFile = new File(`file://${dataDir}/torrc`)
    if (torrcFile.exists) {
      console.log(`${LOG_PREFIX} Removing stale torrc from ${dataDir}/torrc`)
      torrcFile.delete()
      console.log(`${LOG_PREFIX} Stale torrc removed`)
    } else {
      console.log(`${LOG_PREFIX} No existing torrc to clean up`)
    }
  } catch (err) {
    console.warn(`${LOG_PREFIX} Failed to remove stale torrc (non-fatal):`, err)
  }
}

/**
 * Poll until Tor reaches a final status or times out.
 */
async function pollServiceStatus(
  reason: string = 'startup',
  correlationId?: string,
): Promise<number> {
  const pollStartedAt = Date.now()
  const deadline = pollStartedAt + TOR_CONFIG.STATUS_POLL_MAX_MS
  let lastStatus: number = TOR_SERVICE_STATUS.STARTING
  let pollCount = 0
  let lastReportedStatus: number | null = null
  const span = startTorLatencySpan('service', 'native_status_poll', {
    correlationId,
    reason,
    pollIntervalMs: TOR_CONFIG.STATUS_POLL_INTERVAL_MS,
    timeoutMs: TOR_CONFIG.STATUS_POLL_MAX_MS,
  })

  console.log(
    `${LOG_PREFIX} Polling getServiceStatus() adaptively ` +
    `(max ${TOR_CONFIG.STATUS_POLL_MAX_MS / 1000}s)`
  )
  recordTorDiagnostic('service', 'native_status_poll_started', {
    correlationId,
    reason,
    timeoutMs: TOR_CONFIG.STATUS_POLL_MAX_MS,
    pollIntervalMs: TOR_CONFIG.STATUS_POLL_INTERVAL_MS,
  })

  while (Date.now() < deadline) {
    try {
      lastStatus = await RnTor.getServiceStatus()
      pollCount++

      if (lastReportedStatus !== lastStatus || pollCount % 5 === 1 || lastStatus !== TOR_SERVICE_STATUS.STARTING) {
        lastReportedStatus = lastStatus
        console.log(
          `${LOG_PREFIX} getServiceStatus() = ${lastStatus} ` +
          `(${describeNativeServiceStatus(lastStatus)}) ` +
          `[poll #${pollCount}, ${Math.round((Date.now() - pollStartedAt) / 1000)}s elapsed]`
        )
        recordTorDiagnostic('service', 'native_status_observed', {
          correlationId,
          reason,
          pollCount,
          nativeStatus: lastStatus,
          nativeStatusLabel: describeNativeServiceStatus(lastStatus),
        })
      }

      if (lastStatus === TOR_SERVICE_STATUS.RUNNING) {
        span.end({
          correlationId,
          reason,
          pollCount,
          finalStatus: lastStatus,
          finalStatusLabel: describeNativeServiceStatus(lastStatus),
          settled: true,
        })
        return TOR_SERVICE_STATUS.RUNNING
      }
      if (lastStatus === TOR_SERVICE_STATUS.STOPPED_OR_ERROR) {
        span.end({
          correlationId,
          reason,
          pollCount,
          finalStatus: lastStatus,
          finalStatusLabel: describeNativeServiceStatus(lastStatus),
          settled: true,
        })
        return TOR_SERVICE_STATUS.STOPPED_OR_ERROR
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} getServiceStatus() threw:`, err)
      recordTorDiagnostic('service', 'native_status_poll_exception', {
        correlationId,
        reason,
        pollCount,
        error: err instanceof Error ? err.message : String(err),
      })
    }

    const elapsedMs = Date.now() - pollStartedAt
    const nextPollDelayMs = elapsedMs < 5_000 ? 250 : TOR_CONFIG.STATUS_POLL_INTERVAL_MS
    await new Promise((r) => setTimeout(r, nextPollDelayMs))
  }

  console.warn(`${LOG_PREFIX} Status polling timed out after ${TOR_CONFIG.STATUS_POLL_MAX_MS / 1000}s (last status: ${lastStatus})`)
  recordTorDiagnostic('service', 'native_status_poll_timeout', {
    correlationId,
    reason,
    pollCount,
    finalStatus: lastStatus,
    finalStatusLabel: describeNativeServiceStatus(lastStatus),
  })
  span.end({
    correlationId,
    reason,
    pollCount,
    finalStatus: lastStatus,
    finalStatusLabel: describeNativeServiceStatus(lastStatus),
    settled: false,
  })
  return lastStatus
}

type TorReadinessCheckResult = {
  nativeStatus: number
  connected: boolean
  error?: string
  ip?: string
  isTor?: boolean
  country?: string
  countryCode?: string
}

export interface EnsureTorReadyOptions {
  reason?: string
  onRecoveryNeeded?: () => void
}

async function getNativeServiceStatusSnapshot(
  reason: string,
  correlationId: string,
): Promise<number> {
  try {
    const nativeStatus = await RnTor.getServiceStatus()
    recordTorDiagnostic('service', 'native_status_snapshot', {
      correlationId,
      reason,
      nativeStatus,
      nativeStatusLabel: describeNativeServiceStatus(nativeStatus),
    })
    return nativeStatus
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    recordTorDiagnostic('service', 'native_status_snapshot_failed', {
      correlationId,
      reason,
      error: errMsg,
    })
    return TOR_SERVICE_STATUS.STOPPED_OR_ERROR
  }
}

async function inspectTorReadiness(
  options: {
    reason: string
    correlationId: string
    includeGeo?: boolean
    persistState?: boolean
  },
): Promise<TorReadinessCheckResult> {
  const nativeStatus = await getNativeServiceStatusSnapshot(
    `${options.reason}_native_status`,
    options.correlationId,
  )

  if (nativeStatus !== TOR_SERVICE_STATUS.RUNNING) {
    return {
      nativeStatus,
      connected: false,
      error:
        nativeStatus === TOR_SERVICE_STATUS.STARTING
          ? 'Tor daemon is still starting'
          : 'Tor daemon is not running',
    }
  }

  const connectivity = await checkTorConnectivity({
    includeGeo: options.includeGeo ?? false,
    persistState: options.persistState ?? true,
    reason: options.reason,
    correlationId: options.correlationId,
  })

  if (connectivity.connected) {
    return {
      nativeStatus,
      ...connectivity,
    }
  }

  recordTorDiagnostic('health', 'probe_failed_daemon_running', {
    correlationId: options.correlationId,
    reason: options.reason,
    error: connectivity.error ?? 'probe_failed',
  })
  return {
    nativeStatus,
    connected: true,
    error: connectivity.error,
  }
}

function applyTorConnectedState(): void {
  const store = useTorStore.getState()
  store.setStatus('connected')
  reconnectAttempts = 0
  consecutiveHealthCheckFailures = 0
  startHealthCheck()
  registerBackgroundFetch().catch((err) =>
    console.warn(`${LOG_PREFIX} Background fetch registration failed (non-fatal):`, err)
  )
}

function refreshExitNodeGeoIfNeeded(reason: string): void {
  const store = useTorStore.getState()
  if (store.exitCountry && store.exitCountryCode) {
    return
  }

  void refreshTorExitNodeDetails(reason).catch((error) => {
    console.warn(`${LOG_PREFIX} Exit-node geo refresh failed (non-fatal):`, error)
  })
}

export async function startTor(): Promise<boolean> {
  if (startTorInFlightPromise) {
    return startTorInFlightPromise
  }

  const lifecycleGeneration = torLifecycleGeneration
  const promise = runStartTor(lifecycleGeneration)
  startTorInFlightPromise = promise

  try {
    return await promise
  } finally {
    if (startTorInFlightPromise === promise) {
      startTorInFlightPromise = null
    }
  }
}

function waitForConnectingTorResult(): Promise<boolean> {
  const startedAt = Date.now()
  const timeoutMs = TOR_CONFIG.START_TIMEOUT_MS
    + TOR_CONFIG.STATUS_POLL_MAX_MS
    + TOR_CONFIG.POST_CONNECT_STABILIZATION_MS

  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const status = useTorStore.getState().status
      if (status === 'connected') {
        clearInterval(timer)
        resolve(true)
        return
      }

      if (status === 'error' || status === 'disconnected' || Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer)
        resolve(false)
      }
    }, 250)
  })
}

async function getNativeStatusAfterStartFailure(
  correlationId: string,
  stage: string,
): Promise<number | null> {
  try {
    const nativeStatus = await RnTor.getServiceStatus()
    recordTorDiagnostic('service', 'native_start_failure_status_observed', {
      correlationId,
      stage,
      nativeStatus,
      nativeStatusLabel: describeNativeServiceStatus(nativeStatus),
    })
    return nativeStatus
  } catch (error) {
    recordTorDiagnostic('service', 'native_start_failure_status_exception', {
      correlationId,
      stage,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

async function runStartTor(lifecycleGeneration = torLifecycleGeneration): Promise<boolean> {
  const store = useTorStore.getState()
  const correlationId = createTorCorrelationId('tor-start')
  const startSpan = startTorLatencySpan('service', 'start_tor', {
    correlationId,
    bridgeType: store.bridgeType,
    bridgeCount: store.bridges.length,
  })
  const isCancelled = () => lifecycleGeneration !== torLifecycleGeneration
  const finishCancelledStart = async (stage: string, cleanNativeRuntime = false): Promise<boolean> => {
    if (!isCancelled()) return false
    recordTorDiagnostic('service', 'start_cancelled', {
      correlationId,
      stage,
      cleanNativeRuntime,
    })
    if (cleanNativeRuntime) {
      await Promise.allSettled([
        RnTor.shutdownService(),
        stopTransports(),
      ])
    }
    if (!useTorStore.getState().enabled) {
      useTorStore.getState().setStatus('disconnected')
    }
    startSpan.end({
      success: false,
      cancelled: true,
      stage,
    })
    return true
  }

  if (await finishCancelledStart('start_requested')) {
    return false
  }

  if (store.status === 'connecting') {
    console.warn(`${LOG_PREFIX} startTor() called while already connecting — awaiting current startup`)
    const success = await waitForConnectingTorResult()
    if (await finishCancelledStart('await_existing_start')) {
      return false
    }
    recordTorDiagnostic('service', 'start_skipped', {
      correlationId,
      reason: 'already_connecting',
      success,
      bridgeType: store.bridgeType,
      bridgeCount: store.bridges.length,
    })
    startSpan.end({
      skipped: true,
      success,
      reason: 'already_connecting',
    })
    return success
  }

  if (store.status === 'connected') {
    console.log(`${LOG_PREFIX} startTor() called while store says connected — verifying transport`)
    const readiness = await inspectTorReadiness({
      reason: 'start_requested_connected_state',
      correlationId,
      includeGeo: false,
      persistState: true,
    })
    if (await finishCancelledStart('verify_existing_transport', true)) {
      return false
    }

    if (readiness.connected) {
      console.log(`${LOG_PREFIX} Existing Tor transport verified — skipping restart`)
      applyTorConnectedState()
      refreshExitNodeGeoIfNeeded('verified_transport_geo_refresh')
      recordTorDiagnostic('service', 'start_skipped', {
        correlationId,
        reason: 'already_connected_verified',
        bridgeType: store.bridgeType,
        bridgeCount: store.bridges.length,
        nativeStatus: readiness.nativeStatus,
        exitIp: readiness.ip ?? null,
      })
      startSpan.end({
        skipped: true,
        success: true,
        reason: 'already_connected_verified',
      })
      return true
    }

    console.warn(
      `${LOG_PREFIX} Existing Tor transport is stale (${readiness.error ?? 'verification failed'}) — restarting`
    )
    recordTorDiagnostic('service', 'stale_connected_detected', {
      correlationId,
      bridgeType: store.bridgeType,
      bridgeCount: store.bridges.length,
      nativeStatus: readiness.nativeStatus,
      nativeStatusLabel: describeNativeServiceStatus(readiness.nativeStatus),
      error: readiness.error ?? 'verification_failed',
    })
    store.setStatus(
      'error',
      readiness.error ?? 'Tor connection lost — restarting...'
    )
  }

  let normalizedBridges: string[]
  try {
    normalizedBridges = normalizeTorBridgeLines(store.bridges)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    store.setStatus('error', message)
    recordTorDiagnostic('service', 'start_blocked', {
      correlationId,
      stage: 'bridge_validation',
      error: message,
    })
    startSpan.end({
      success: false,
      stage: 'bridge_validation',
    })
    return false
  }

  const networkSnapshot = await captureTorNetworkSnapshot()
  if (await finishCancelledStart('network_snapshot')) {
    return false
  }
  console.log(`${LOG_PREFIX} ======== STARTING TOR DAEMON ========`)
  console.log(`${LOG_PREFIX} SOCKS port: ${store.socksPort}`)
  console.log(`${LOG_PREFIX} Target port: ${TOR_CONFIG.TARGET_PORT}`)
  console.log(`${LOG_PREFIX} Timeout: ${TOR_CONFIG.START_TIMEOUT_MS}ms`)
  console.log(`${LOG_PREFIX} Bridges configured: ${normalizedBridges.length} (type: ${store.bridgeType})`)
  recordTorDiagnostic('service', 'start_requested', {
    correlationId,
    socksPort: store.socksPort,
    bridgeType: store.bridgeType,
    bridgeCount: normalizedBridges.length,
    startTimeoutMs: TOR_CONFIG.START_TIMEOUT_MS,
    ...networkSnapshot,
  })

  store.setStatus('connecting')
  store.setLastHealthError(null)
  recordTorDiagnostic('service', 'status_transition_requested', {
    correlationId,
    nextStatus: 'connecting',
  })

  try {
    const dataDir = getDataDir()
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Data directory resolved`)
    }
    recordTorDiagnostic('service', 'data_dir_resolved', {
      correlationId,
      hasDataDir: Boolean(dataDir),
    })

    ensureDataDir(dataDir)

    try {
      const existingStatus = await RnTor.getServiceStatus()
      console.log(`${LOG_PREFIX} Pre-cleanup native status: ${existingStatus}`)
      recordTorDiagnostic('service', 'pre_cleanup_status', {
        correlationId,
        nativeStatus: existingStatus,
        nativeStatusLabel: describeNativeServiceStatus(existingStatus),
      })

      if (existingStatus !== TOR_SERVICE_STATUS.STOPPED_OR_ERROR) {
        console.log(`${LOG_PREFIX} Pre-cleanup: shutting down previous Tor instance...`)
        await RnTor.shutdownService()
        await new Promise((r) => setTimeout(r, 500))
      }
    } catch (err) {
      console.log(`${LOG_PREFIX} Pre-cleanup skipped:`, err)
      recordTorDiagnostic('service', 'pre_cleanup_skipped', {
        correlationId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    if (await finishCancelledStart('pre_cleanup', true)) {
      return false
    }

    removeStaleLockFile(dataDir)
    logTorFilesystemState(dataDir)

    let transportPort: number | undefined
    const needsTransport = store.bridgeType !== 'none' && normalizedBridges.length > 0

    if (needsTransport) {
      if (!isIPtProxyAvailable()) {
        console.error(`${LOG_PREFIX} Bridge type ${store.bridgeType} requires IPtProxy but the native module is not available`)
        recordTorDiagnostic('service', 'start_failed', {
          correlationId,
          stage: 'transport_unavailable',
          bridgeType: store.bridgeType,
          error: `Pluggable transport "${store.bridgeType}" requires a native rebuild with IPtProxy`,
        })
        store.setStatus('error', `Pluggable transport "${store.bridgeType}" requires a native rebuild with IPtProxy`)
        startSpan.end({
          success: false,
          stage: 'transport_unavailable',
        })
        return false
      }

      const transportSpan = startTorLatencySpan('service', 'start_transport', {
        correlationId,
        bridgeType: store.bridgeType,
      })
      try {
        console.log(`${LOG_PREFIX} Starting pluggable transport: ${store.bridgeType}`)
        transportPort = await startTransport(store.bridgeType as 'obfs4' | 'snowflake' | 'webtunnel')
        console.log(`${LOG_PREFIX} Transport ${store.bridgeType} ready on port ${transportPort}`)
        recordTorDiagnostic('service', 'transport_started', {
          correlationId,
          bridgeType: store.bridgeType,
          transportPort,
        })
        transportSpan.end({
          success: true,
          transportPort,
        })
        if (await finishCancelledStart('transport_start', true)) {
          return false
        }
      } catch (ptErr) {
        if (isCancelled()) {
          transportSpan.end({
            success: false,
            cancelled: true,
          })
          await finishCancelledStart('transport_start_exception', true)
          return false
        }
        const ptMsg = ptErr instanceof Error ? ptErr.message : String(ptErr)
        console.error(`${LOG_PREFIX} Failed to start transport ${store.bridgeType}: ${ptMsg}`)
        recordTorDiagnostic('service', 'start_failed', {
          correlationId,
          stage: 'transport_start',
          bridgeType: store.bridgeType,
          error: ptMsg,
        })
        transportSpan.end({
          success: false,
          error: true,
        })
        store.setStatus('error', `Transport ${store.bridgeType} failed: ${ptMsg}`)
        startSpan.end({
          success: false,
          stage: 'transport_start',
        })
        return false
      }
    }

    if (normalizedBridges.length > 0) {
      writeBridgeTorrc(dataDir, normalizedBridges, store.bridgeType, transportPort)
    } else {
      removeStaleTorrc(dataDir)
    }
    logTorFilesystemState(dataDir)

    const startTime = Date.now()
    console.log(`${LOG_PREFIX} Calling RnTor.startTorIfNotRunning()...`)
    recordTorDiagnostic('service', 'native_start_requested', {
      correlationId,
      bridgeType: store.bridgeType,
      bridgeCount: normalizedBridges.length,
      hasTransport: needsTransport,
      transportPort,
    })

    let result: {
      is_success: boolean
      onion_address: string
      control: string
      error_message: string
    }
    try {
      result = await RnTor.startTorIfNotRunning({
        data_dir: dataDir,
        socks_port: store.socksPort,
        target_port: TOR_CONFIG.TARGET_PORT,
        timeout_ms: TOR_CONFIG.START_TIMEOUT_MS,
      })
      if (await finishCancelledStart('native_start', true)) {
        return false
      }
    } catch (startError) {
      if (await finishCancelledStart('native_start_exception', true)) {
        return false
      }
      const msg = startError instanceof Error ? startError.message : String(startError)
      console.error(`${LOG_PREFIX} startTorIfNotRunning() threw: ${msg}`)
      const recoveredStatus = await getNativeStatusAfterStartFailure(correlationId, 'native_start_exception')
      if (await finishCancelledStart('native_start_exception_status', true)) {
        return false
      }
      if (recoveredStatus === TOR_SERVICE_STATUS.STARTING || recoveredStatus === TOR_SERVICE_STATUS.RUNNING) {
        result = {
          is_success: true,
          onion_address: '',
          control: '',
          error_message: '',
        }
      } else {
        recordTorDiagnostic('service', 'start_failed', {
          correlationId,
          stage: 'native_start',
          error: msg,
        })
        store.setStatus('error', `Tor start exception: ${msg}`)
        startSpan.end({
          success: false,
          stage: 'native_start',
        })
        return false
      }
    }

    const elapsed = Date.now() - startTime
    console.log(`${LOG_PREFIX} startTorIfNotRunning() returned after ${elapsed}ms`)
    console.log(`${LOG_PREFIX}   is_success: ${String(result.is_success)}`)
    console.log(`${LOG_PREFIX}   error_message: ${result.error_message || '(none)'}`)
    console.log(`${LOG_PREFIX}   onion_address: ${result.onion_address ? '[redacted]' : '(none)'}`)
    console.log(`${LOG_PREFIX}   control: ${result.control ? '[redacted]' : '(none)'}`)
    recordTorDiagnostic('service', 'native_start_result', {
      correlationId,
      elapsedMs: elapsed,
      isSuccess: result.is_success,
      error: result.error_message || null,
      hasOnionAddress: Boolean(result.onion_address),
      hasControlPort: Boolean(result.control),
    })

    if (!result.is_success) {
      const errMsg = result.error_message || 'Tor failed to start (no error message)'
      const recoveredStatus = await getNativeStatusAfterStartFailure(correlationId, 'native_start_result')
      if (await finishCancelledStart('native_start_result_status', true)) {
        return false
      }
      if (recoveredStatus === TOR_SERVICE_STATUS.STARTING || recoveredStatus === TOR_SERVICE_STATUS.RUNNING) {
        recordTorDiagnostic('service', 'native_start_result_recovered', {
          correlationId,
          nativeStatus: recoveredStatus,
          nativeStatusLabel: describeNativeServiceStatus(recoveredStatus),
          error: errMsg,
        })
      } else {
        console.error(`${LOG_PREFIX} ======== TOR FAILED TO START ========`)
        console.error(`${LOG_PREFIX} ${errMsg}`)
        recordTorDiagnostic('service', 'start_failed', {
          correlationId,
          stage: 'native_start_result',
          error: errMsg,
        })
        store.setStatus('error', errMsg)
        startSpan.end({
          success: false,
          stage: 'native_start_result',
        })
        return false
      }
    }

    const nativeStatus = await pollServiceStatus('startup', correlationId)
    if (await finishCancelledStart('native_status_poll', true)) {
      return false
    }
    if (nativeStatus !== TOR_SERVICE_STATUS.RUNNING) {
      const errMsg =
        nativeStatus === TOR_SERVICE_STATUS.STOPPED_OR_ERROR
          ? 'Tor daemon stopped before it became ready'
          : 'Timed out waiting for Tor daemon readiness'
      recordTorDiagnostic('service', 'start_failed', {
        correlationId,
        stage: 'native_status_poll',
        nativeStatus,
        nativeStatusLabel: describeNativeServiceStatus(nativeStatus),
        error: errMsg,
      })
      store.setStatus('error', errMsg)
      startSpan.end({
        success: false,
        stage: 'native_status_poll',
        nativeStatus,
      })
      return false
    }

    await new Promise((r) => setTimeout(r, TOR_CONFIG.POST_CONNECT_STABILIZATION_MS))
    if (await finishCancelledStart('post_connect_stabilization', true)) {
      return false
    }
    recordTorDiagnostic('service', 'post_connect_stabilization_complete', {
      correlationId,
      stabilizationMs: TOR_CONFIG.POST_CONNECT_STABILIZATION_MS,
    })

    // Do not block startup on exit-country lookup.
    const verification = await inspectTorReadiness({
      reason: 'post_connect_verification',
      correlationId,
      includeGeo: false,
      persistState: true,
    })
    if (await finishCancelledStart('post_connect_verification', true)) {
      return false
    }
    if (!verification.connected) {
      const errMsg = verification.error ?? 'Tor route verification failed after startup'
      console.error(`${LOG_PREFIX} Post-start verification failed: ${errMsg}`)
      recordTorDiagnostic('service', 'start_failed', {
        correlationId,
        stage: 'post_connect_verification',
        nativeStatus: verification.nativeStatus,
        nativeStatusLabel: describeNativeServiceStatus(verification.nativeStatus),
        error: errMsg,
      })
      store.setStatus('error', errMsg)
      startSpan.end({
        success: false,
        stage: 'post_connect_verification',
        nativeStatus: verification.nativeStatus,
      })
      return false
    }

    console.log(`${LOG_PREFIX} ======== TOR STARTED SUCCESSFULLY (${elapsed}ms) ========`)
    applyTorConnectedState()
    refreshExitNodeGeoIfNeeded('post_connect_geo_refresh')
    recordTorDiagnostic('service', 'start_succeeded', {
      correlationId,
      elapsedMs: elapsed,
      bridgeType: store.bridgeType,
      bridgeCount: store.bridges.length,
      nativeStatus,
      exitIp: verification.ip ?? null,
      isTor: verification.isTor ?? null,
    })
    startSpan.end({
      success: true,
      bridgeType: store.bridgeType,
      bridgeCount: store.bridges.length,
    })
    return true
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`${LOG_PREFIX} ======== TOR START EXCEPTION ========`)
    console.error(`${LOG_PREFIX} Exception:`, error)
    recordTorDiagnostic('service', 'start_failed', {
      correlationId,
      stage: 'unexpected_exception',
      error: errMsg,
    })
    store.setStatus('error', errMsg)
    startSpan.end({
      success: false,
      stage: 'unexpected_exception',
    })
    return false
  }
}

export async function ensureTorReady(
  options: EnsureTorReadyOptions = {},
): Promise<boolean> {
  const store = useTorStore.getState()
  const reason = options.reason ?? 'resume'
  const correlationId = createTorCorrelationId('tor-ensure')
  const ensureSpan = startTorLatencySpan('service', 'ensure_tor_ready', {
    correlationId,
    reason,
    storeStatus: store.status,
  })

  if (!store.enabled) {
    recordTorDiagnostic('service', 'ensure_ready_skipped', {
      correlationId,
      reason,
      skippedReason: 'tor_disabled',
    })
    ensureSpan.end({
      skipped: true,
      success: false,
      reason: 'tor_disabled',
    })
    return false
  }

  if (store.status === 'connecting') {
    options.onRecoveryNeeded?.()
    recordTorDiagnostic('service', 'ensure_ready_skipped', {
      correlationId,
      reason,
      skippedReason: 'already_connecting',
    })
    ensureSpan.end({
      skipped: true,
      success: false,
      reason: 'already_connecting',
    })
    return false
  }

  const readiness = await inspectTorReadiness({
    reason: `${reason}_verification`,
    correlationId,
    includeGeo: false,
    persistState: true,
  })

  if (readiness.connected) {
    applyTorConnectedState()
    refreshExitNodeGeoIfNeeded(`${reason}_geo_refresh`)
    recordTorDiagnostic('service', 'ensure_ready_succeeded', {
      correlationId,
      reason,
      nativeStatus: readiness.nativeStatus,
      exitIp: readiness.ip ?? null,
      reusedExistingTransport: true,
    })
    ensureSpan.end({
      success: true,
      reusedExistingTransport: true,
      nativeStatus: readiness.nativeStatus,
    })
    return true
  }

  options.onRecoveryNeeded?.()
  recordTorDiagnostic('service', 'ensure_ready_recovery_requested', {
    correlationId,
    reason,
    nativeStatus: readiness.nativeStatus,
    nativeStatusLabel: describeNativeServiceStatus(readiness.nativeStatus),
    error: readiness.error ?? 'verification_failed',
  })

  if (store.status === 'connected') {
    useTorStore.getState().setStatus(
      'error',
      readiness.error ?? 'Tor connection lost — reconnecting...'
    )
  } else if (readiness.error) {
    useTorStore.getState().setLastHealthError(readiness.error)
  }

  const started = await startTor()
  recordTorDiagnostic('service', 'ensure_ready_completed', {
    correlationId,
    reason,
    success: started,
    nativeStatus: readiness.nativeStatus,
  })
  ensureSpan.end({
    success: started,
    nativeStatus: readiness.nativeStatus,
  })
  return started
}

export async function stopTor(): Promise<void> {
  torLifecycleGeneration += 1
  const correlationId = createTorCorrelationId('tor-stop')
  const stopSpan = startTorLatencySpan('service', 'stop_tor', {
    correlationId,
  })

  console.log(`${LOG_PREFIX} ======== STOPPING TOR DAEMON ========`)
  stopHealthCheck()
  recordTorDiagnostic('service', 'stop_requested', {
    correlationId,
  })

  try {
    await RnTor.shutdownService()
    console.log(`${LOG_PREFIX} RnTor.shutdownService() completed`)
    recordTorDiagnostic('service', 'native_shutdown_completed', {
      correlationId,
    })
  } catch (err) {
    console.warn(`${LOG_PREFIX} RnTor.shutdownService() threw (non-fatal):`, err)
    recordTorDiagnostic('service', 'native_shutdown_failed', {
      correlationId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  try {
    await stopTransports()
    console.log(`${LOG_PREFIX} Pluggable transports stopped`)
    recordTorDiagnostic('service', 'transport_shutdown_completed', {
      correlationId,
    })
  } catch (err) {
    console.warn(`${LOG_PREFIX} stopTransports() threw (non-fatal):`, err)
    recordTorDiagnostic('service', 'transport_shutdown_failed', {
      correlationId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  unregisterBackgroundFetch().catch((err) =>
    console.warn(`${LOG_PREFIX} Background fetch unregistration failed (non-fatal):`, err)
  )

  useTorStore.getState().setStatus('disconnected')
  reconnectAttempts = 0
  consecutiveHealthCheckFailures = 0
  console.log(`${LOG_PREFIX} ======== TOR STOPPED ========`)
  recordTorDiagnostic('service', 'stop_completed', {
    correlationId,
  })
  stopSpan.end({
    success: true,
  })
}

async function runReconnectTor(): Promise<boolean> {
  const correlationId = createTorCorrelationId('tor-reconnect')
  const reconnectSpan = startTorLatencySpan('service', 'reconnect_tor', {
    correlationId,
    attempt: reconnectAttempts + 1,
  })

  console.log(`${LOG_PREFIX} reconnectTor() — attempt ${reconnectAttempts + 1}/${TOR_CONFIG.MAX_RECONNECT_ATTEMPTS}`)
  recordTorDiagnostic('service', 'reconnect_requested', {
    correlationId,
    attempt: reconnectAttempts + 1,
    maxAttempts: TOR_CONFIG.MAX_RECONNECT_ATTEMPTS,
  })
  await stopTor()
  await new Promise((r) => setTimeout(r, TOR_CONFIG.RECONNECT_DELAY_MS))
  const success = await startTor()
  recordTorDiagnostic('service', 'reconnect_completed', {
    correlationId,
    success,
  })
  reconnectSpan.end({
    success,
  })
  return success
}

export async function reconnectTor(): Promise<boolean> {
  if (reconnectTorInFlightPromise) {
    return reconnectTorInFlightPromise
  }

  const reconnect = runReconnectTor()
  reconnectTorInFlightPromise = reconnect
  try {
    return await reconnect
  } finally {
    if (reconnectTorInFlightPromise === reconnect) {
      reconnectTorInFlightPromise = null
    }
  }
}

export type TorBridgeConfigurationResult =
  | {
      outcome: 'applied'
      success: true
      routeReady: boolean
    }
  | {
      outcome: 'restored'
      success: false
      routeReady: true
      error: string
    }
  | {
      outcome: 'rollback_failed'
      success: false
      routeReady: false
      error: string
    }

function bridgeConfigurationsEqual(
  first: { bridges: string[]; bridgeType: BridgeType },
  second: { bridges: string[]; bridgeType: BridgeType },
): boolean {
  return first.bridgeType === second.bridgeType
    && first.bridges.length === second.bridges.length
    && first.bridges.every((bridge, index) => bridge === second.bridges[index])
}

function getBridgeTransitionError(fallback: string): string {
  const state = useTorStore.getState()
  return state.errorMessage || state.lastHealthError || fallback
}

async function runApplyTorBridgeConfiguration(
  bridges: string[],
  bridgeType: BridgeType,
): Promise<TorBridgeConfigurationResult> {
  const normalizedBridges = normalizeTorBridgeLines(bridges)
  const requested = {
    bridges: normalizedBridges,
    bridgeType: normalizedBridges.length === 0 ? 'none' as const : bridgeType,
  }
  const initialState = useTorStore.getState()
  const previous = {
    bridges: [...initialState.bridges],
    bridgeType: initialState.bridgeType,
  }
  const correlationId = createTorCorrelationId('tor-bridge-apply')

  if (bridgeConfigurationsEqual(previous, requested)) {
    return {
      outcome: 'applied',
      success: true,
      routeReady: initialState.enabled && initialState.status === 'connected',
    }
  }

  recordTorDiagnostic('bridge', 'configuration_apply_started', {
    correlationId,
    previousBridgeType: previous.bridgeType,
    previousBridgeCount: previous.bridges.length,
    requestedBridgeType: requested.bridgeType,
    requestedBridgeCount: requested.bridges.length,
    torEnabled: initialState.enabled,
  })

  if (!initialState.enabled) {
    await initialState.setBridges(requested.bridges, requested.bridgeType)
    recordTorDiagnostic('bridge', 'configuration_apply_completed', {
      correlationId,
      outcome: 'applied_while_disabled',
      requestedBridgeType: requested.bridgeType,
      requestedBridgeCount: requested.bridges.length,
    })
    return { outcome: 'applied', success: true, routeReady: false }
  }

  useTorStore.setState(requested)
  const requestedRouteReady = await reconnectTor()
  const requestedState = useTorStore.getState()
  if (
    requestedRouteReady
    && requestedState.enabled
    && requestedState.status === 'connected'
  ) {
    try {
      await requestedState.setBridges(requested.bridges, requested.bridgeType)
      recordTorDiagnostic('bridge', 'configuration_apply_completed', {
        correlationId,
        outcome: 'applied',
        requestedBridgeType: requested.bridgeType,
        requestedBridgeCount: requested.bridges.length,
      })
      return { outcome: 'applied', success: true, routeReady: true }
    } catch (error) {
      recordTorDiagnostic('bridge', 'configuration_persist_failed', {
        correlationId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const applyError = getBridgeTransitionError('Tor could not connect with the requested bridge configuration')
  if (!useTorStore.getState().enabled) {
    useTorStore.setState(previous)
    return {
      outcome: 'rollback_failed',
      success: false,
      routeReady: false,
      error: applyError,
    }
  }

  useTorStore.setState(previous)
  const restored = await reconnectTor()
  const restoredState = useTorStore.getState()
  if (restored && restoredState.enabled && restoredState.status === 'connected') {
    recordTorDiagnostic('bridge', 'configuration_apply_completed', {
      correlationId,
      outcome: 'restored',
      previousBridgeType: previous.bridgeType,
      previousBridgeCount: previous.bridges.length,
      error: applyError,
    })
    return {
      outcome: 'restored',
      success: false,
      routeReady: true,
      error: applyError,
    }
  }

  const rollbackError = getBridgeTransitionError('The previous bridge configuration could not reconnect')
  recordTorDiagnostic('bridge', 'configuration_apply_completed', {
    correlationId,
    outcome: 'rollback_failed',
    previousBridgeType: previous.bridgeType,
    previousBridgeCount: previous.bridges.length,
    applyError,
    rollbackError,
  })
  return {
    outcome: 'rollback_failed',
    success: false,
    routeReady: false,
    error: `${applyError}. ${rollbackError}`,
  }
}

export function applyTorBridgeConfiguration(
  bridges: string[],
  bridgeType: BridgeType,
): Promise<TorBridgeConfigurationResult> {
  const apply = () => runApplyTorBridgeConfiguration(bridges, bridgeType)
  const queued = bridgeConfigurationQueue.then(apply, apply)
  bridgeConfigurationQueue = queued.then(() => undefined, () => undefined)
  return queued
}

export interface TorConnectivityCheckOptions {
  includeGeo?: boolean
  persistState?: boolean
  reason?: string
  correlationId?: string
}

export interface TorConnectivityCheckResult {
  connected: boolean
  ip?: string
  isTor?: boolean
  country?: string
  countryCode?: string
  error?: string
}

function syncTorConnectivityResult(
  result: TorConnectivityCheckResult,
  checkedAt: number = Date.now(),
): void {
  const store = useTorStore.getState()
  if (!result.connected) {
    store.setLastHealthError(result.error ?? 'Tor verification failed')
    return
  }

  const nextIp = result.ip ?? store.exitIp
  const ipChanged = Boolean(result.ip && result.ip !== store.exitIp)

  store.setVerificationSnapshot({
    exitIp: nextIp,
    exitCountry:
      result.country !== undefined
        ? result.country ?? null
        : ipChanged
          ? null
          : store.exitCountry,
    exitCountryCode:
      result.countryCode !== undefined
        ? result.countryCode ?? null
        : ipChanged
          ? null
          : store.exitCountryCode,
    isTorVerified: result.isTor ?? true,
    lastVerifiedAt: checkedAt,
    lastHealthError: null,
  })
}

export async function refreshTorExitNodeDetails(
  reason: string = 'post_connect_verification',
  correlationId: string = createTorCorrelationId('tor-exit-verify'),
): Promise<TorConnectivityCheckResult> {
  return checkTorConnectivity({
    includeGeo: true,
    persistState: true,
    reason,
    correlationId,
  })
}

export async function checkTorConnectivity(
  options: TorConnectivityCheckOptions = {},
): Promise<TorConnectivityCheckResult> {
  const includeGeo = options.includeGeo ?? true
  const persistState = options.persistState ?? false
  const reason = options.reason ?? 'manual_check'
  const correlationId = options.correlationId ?? createTorCorrelationId('tor-health')
  const connectivitySpan = startTorLatencySpan('health', 'check_connectivity', {
    correlationId,
    includeGeo,
    persistState,
    reason,
  })

  console.log(`${LOG_PREFIX} checkTorConnectivity() — pinging ${TOR_CONFIG.HEALTH_CHECK_URL}`)
  recordTorDiagnostic('health', 'check_started', {
    correlationId,
    includeGeo,
    persistState,
    reason,
    healthCheckUrl: TOR_CONFIG.HEALTH_CHECK_URL,
  })
  try {
    const result = await RnTor.httpGet({
      url: TOR_CONFIG.HEALTH_CHECK_URL,
      headers: JSON.stringify({ Accept: 'application/json' }),
      timeout_ms: TOR_CONFIG.HEALTH_CHECK_TIMEOUT_MS,
    })

    const hasError = result.error && result.error.length > 0

    if (hasError) {
      console.warn(`${LOG_PREFIX} Health check HTTP failed: ${result.error}`)
      recordTorDiagnostic('health', 'check_failed', {
        correlationId,
        includeGeo,
        persistState,
        reason,
        error: result.error,
      })
      const failure = { connected: false, error: result.error }
      if (persistState) {
        syncTorConnectivityResult(failure)
      }
      connectivitySpan.end({
        success: false,
        failed: true,
      })
      return failure
    }

    const body = result.body ?? ''
    if (__DEV__) {
      console.log(`${LOG_PREFIX} Health check response received`)
    }

    try {
      const data = JSON.parse(body)
      console.log(`${LOG_PREFIX} Tor IP check: IsTor=${data.IsTor}`)

      let country: string | undefined
      let countryCode: string | undefined
      if (includeGeo && data.IP) {
        try {
          const geo = await RnTor.httpGet({
            url: `http://ip-api.com/json/${data.IP}?fields=country,countryCode`,
            headers: '',
            timeout_ms: TOR_CONFIG.HEALTH_CHECK_TIMEOUT_MS,
          })
          if (!geo.error || geo.error.length === 0) {
            const geoData = JSON.parse(geo.body)
            country = geoData.country
            countryCode = geoData.countryCode
          }
        } catch (geoErr) {
          console.warn(`${LOG_PREFIX} Geo lookup failed (non-fatal):`, geoErr)
          recordTorDiagnostic('health', 'geo_lookup_failed', {
            correlationId,
            reason,
            error: geoErr instanceof Error ? geoErr.message : String(geoErr),
          })
        }
      }

      recordTorDiagnostic('health', 'check_succeeded', {
        correlationId,
        includeGeo,
        persistState,
        reason,
        ip: data.IP,
        isTor: Boolean(data.IsTor),
        country: country ?? null,
        countryCode: countryCode ?? null,
      })
      const success = {
        connected: !!data.IsTor,
        ip: data.IP,
        isTor: data.IsTor,
        country,
        countryCode,
      }
      if (persistState) {
        syncTorConnectivityResult(success)
      }
      connectivitySpan.end({
        success: Boolean(data.IsTor),
        isTor: Boolean(data.IsTor),
      })
      return success
    } catch {
      console.warn(`${LOG_PREFIX} Failed to parse health check JSON`)
      recordTorDiagnostic('health', 'check_failed', {
        correlationId,
        includeGeo,
        persistState,
        reason,
        error: 'Invalid Tor health-check response',
      })
      const failure = { connected: false, error: 'Invalid Tor health-check response' }
      if (persistState) {
        syncTorConnectivityResult(failure)
      }
      connectivitySpan.end({
        success: false,
        failed: true,
      })
      return failure
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`${LOG_PREFIX} Health check exception: ${errMsg}`)
    recordTorDiagnostic('health', 'check_failed', {
      correlationId,
      includeGeo,
      persistState,
      reason,
      error: errMsg,
    })
    const failure = { connected: false, error: errMsg }
    if (persistState) {
      syncTorConnectivityResult(failure)
    }
    connectivitySpan.end({
      success: false,
      failed: true,
    })
    return failure
  }
}

export async function runPeriodicTorHealthCheck(): Promise<void> {
  const { enabled, status } = useTorStore.getState()

  if (!enabled) {
    console.log(`${LOG_PREFIX} Health check: Tor disabled, stopping checks`)
    recordTorDiagnostic('health', 'timer_stopped', {
      reason: 'tor_disabled',
    })
    stopHealthCheck()
    return
  }

  if (status !== 'connected') {
    console.log(`${LOG_PREFIX} Health check: status=${status}, skipping`)
    recordTorDiagnostic('health', 'check_skipped', {
      reason: 'status_not_connected',
      status,
    })
    return
  }

  if (healthCheckInFlight) {
    recordTorDiagnostic('health', 'check_skipped', {
      reason: 'check_in_flight',
    })
    return
  }

  if (AppState.currentState !== 'active') {
    recordTorDiagnostic('health', 'check_skipped', {
      reason: 'app_backgrounded',
      appState: AppState.currentState,
    })
    return
  }

  healthCheckInFlight = true
  try {
    const correlationId = createTorCorrelationId('tor-health')
    const check = await inspectTorReadiness({
      includeGeo: false,
      persistState: false,
      reason: 'periodic_health_check',
      correlationId,
    })

    if (!check.connected) {
      consecutiveHealthCheckFailures++
      console.warn(
        `${LOG_PREFIX} Health check FAILED (${consecutiveHealthCheckFailures}/` +
        `${TOR_CONFIG.HEALTH_CHECK_FAILURE_THRESHOLD}): ${check.error ?? 'no connection'}`
      )
      recordTorDiagnostic('health', 'check_failed_threshold', {
        correlationId,
        consecutiveFailures: consecutiveHealthCheckFailures,
        threshold: TOR_CONFIG.HEALTH_CHECK_FAILURE_THRESHOLD,
        error: check.error ?? 'no connection',
      })

      if (consecutiveHealthCheckFailures < TOR_CONFIG.HEALTH_CHECK_FAILURE_THRESHOLD) {
        return
      }

      reconnectAttempts++

      if (reconnectAttempts <= TOR_CONFIG.MAX_RECONNECT_ATTEMPTS) {
        console.log(`${LOG_PREFIX} Auto-reconnecting (attempt ${reconnectAttempts})...`)
        useTorStore.getState().setStatus('error', 'Connection lost — reconnecting...')
        await reconnectTor()
      } else {
        console.error(
          `${LOG_PREFIX} Max reconnect attempts (${TOR_CONFIG.MAX_RECONNECT_ATTEMPTS}) reached`
        )
        useTorStore.getState().setStatus(
          'error',
          'Tor connection lost. Please reconnect manually or check your bridge configuration.'
        )
        stopHealthCheck()
      }
      return
    }

    consecutiveHealthCheckFailures = 0
    if (check.error) {
      recordTorDiagnostic('health', 'probe_unverified_daemon_running', {
        correlationId,
        error: check.error,
        nativeStatus: check.nativeStatus,
      })
      return
    }

    console.log(`${LOG_PREFIX} Health check OK — IP: ${check.ip}, IsTor: ${check.isTor}`)
    recordTorDiagnostic('health', 'check_healthy', {
      correlationId,
      ip: check.ip,
      isTor: check.isTor ?? null,
    })
  } finally {
    healthCheckInFlight = false
  }
}

function startHealthCheck() {
  stopHealthCheck()
  console.log(
    `${LOG_PREFIX} Starting health check (interval: ${TOR_CONFIG.HEALTH_CHECK_INTERVAL_MS}ms)`
  )
  recordTorDiagnostic('health', 'timer_started', {
    intervalMs: TOR_CONFIG.HEALTH_CHECK_INTERVAL_MS,
  })

  healthCheckTimer = setInterval(() => {
    void runPeriodicTorHealthCheck()
  }, TOR_CONFIG.HEALTH_CHECK_INTERVAL_MS)
}

function stopHealthCheck() {
  if (healthCheckTimer) {
    console.log(`${LOG_PREFIX} Stopping health check timer`)
    clearInterval(healthCheckTimer)
    healthCheckTimer = null
    recordTorDiagnostic('health', 'timer_stopped', {
      reason: 'manual_stop',
    })
  }
}
