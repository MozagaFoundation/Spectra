/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Wrapper for the pluggable transport native module.
 */

import { NativeModules, Platform } from 'react-native'
import { LOG_PREFIX } from './torConstants'
import { createSanitizedConsole } from '@/services/logging/mobileLogger'

declare const __DEV__: boolean | undefined

interface IPtProxyNative {
  startObfs4(): Promise<{ port: number }>
  startSnowflake(): Promise<{ port: number }>
  startWebtunnel(): Promise<{ port: number }>
  stopTransports(): Promise<void>
}

const NativeIPtProxy: IPtProxyNative | undefined = NativeModules.IPtProxyModule
const console = createSanitizedConsole('IPtProxy')

function shouldLogTransportDebug(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__
}

if (shouldLogTransportDebug()) {
  console.log(
    `${LOG_PREFIX} [PT] IPtProxyModule native binding: ${NativeIPtProxy ? 'FOUND' : 'NOT FOUND'} (platform=${Platform.OS})`
  )
  if (NativeIPtProxy) {
    console.log(
      `${LOG_PREFIX} [PT] Available methods: ${Object.keys(NativeIPtProxy).join(', ')}`
    )
  }
}

function assertAvailable(): IPtProxyNative {
  if (!NativeIPtProxy) {
    const msg =
      `IPtProxyModule is not available on ${Platform.OS}. ` +
      'Did you run a native rebuild after adding IPtProxy? ' +
      `NativeModules keys: ${Object.keys(NativeModules).filter((k) => k.toLowerCase().includes('ipt')).join(', ') || '(none matching "ipt")'}`
    console.error(`${LOG_PREFIX} [PT] ${msg}`)
    throw new Error(msg)
  }
  return NativeIPtProxy
}

export async function startTransport(
  type: 'obfs4' | 'snowflake' | 'webtunnel'
): Promise<number> {
  const mod = assertAvailable()
  console.log(`${LOG_PREFIX} [PT] ======== STARTING TRANSPORT: ${type} ========`)
  const startTime = Date.now()

  let result: { port: number }
  try {
    switch (type) {
      case 'obfs4':
        console.log(`${LOG_PREFIX} [PT] Calling native startObfs4()...`)
        result = await mod.startObfs4()
        break
      case 'snowflake':
        console.log(`${LOG_PREFIX} [PT] Calling native startSnowflake()...`)
        result = await mod.startSnowflake()
        break
      case 'webtunnel':
        console.log(`${LOG_PREFIX} [PT] Calling native startWebtunnel()...`)
        result = await mod.startWebtunnel()
        break
    }
  } catch (err) {
    const elapsed = Date.now() - startTime
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} [PT] ======== TRANSPORT ${type} FAILED (${elapsed}ms) ========`)
    console.error(`${LOG_PREFIX} [PT] Error: ${errMsg}`)
    if (err instanceof Error && err.stack) {
      console.error(`${LOG_PREFIX} [PT] Stack: ${err.stack}`)
    }
    throw err
  }

  const elapsed = Date.now() - startTime
  console.log(`${LOG_PREFIX} [PT] ======== TRANSPORT ${type} READY (${elapsed}ms) ========`)
  console.log(`${LOG_PREFIX} [PT] Listening on 127.0.0.1:${result.port}`)

  if (!result.port || result.port <= 0) {
    const msg = `Transport ${type} returned invalid port: ${result.port}`
    console.error(`${LOG_PREFIX} [PT] ${msg}`)
    throw new Error(msg)
  }

  return result.port
}

export async function stopTransports(): Promise<void> {
  if (!NativeIPtProxy) {
    console.log(`${LOG_PREFIX} [PT] IPtProxy not available, nothing to stop`)
    return
  }
  console.log(`${LOG_PREFIX} [PT] Stopping all pluggable transports...`)
  const startTime = Date.now()
  try {
    await NativeIPtProxy.stopTransports()
    const elapsed = Date.now() - startTime
    console.log(`${LOG_PREFIX} [PT] All transports stopped (${elapsed}ms)`)
  } catch (err) {
    const elapsed = Date.now() - startTime
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} [PT] stopTransports() failed (${elapsed}ms): ${errMsg}`)
    throw err
  }
}

export function isIPtProxyAvailable(): boolean {
  const available = NativeIPtProxy != null
  if (shouldLogTransportDebug()) {
    console.log(`${LOG_PREFIX} [PT] isIPtProxyAvailable() = ${available}`)
  }
  return available
}
