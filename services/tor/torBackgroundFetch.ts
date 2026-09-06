/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

/**
 * Best-effort background polling when push delivery is unavailable.
 */

import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager from 'expo-task-manager'
import { AppState } from 'react-native'
import { LOG_PREFIX } from './torConstants'
import { useTorStore } from './torStore'
import { recordTorDiagnostic } from './torDiagnostics'
import { createSanitizedConsole } from '@/services/logging/mobileLogger'

const BACKGROUND_FETCH_TASK = 'TOR_MESSAGE_POLL'
const console = createSanitizedConsole('TorBackgroundFetch')

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  const startTime = Date.now()
  const { enabled, status } = useTorStore.getState()
  let startedTorForTask = false

  console.log(`${LOG_PREFIX} [BG] ======== BACKGROUND FETCH TRIGGERED ========`)
  console.log(`${LOG_PREFIX} [BG] Tor enabled=${enabled}, status=${status}`)

  if (AppState.currentState === 'active') {
    recordTorDiagnostic('background_fetch', 'poll_skipped', {
      reason: 'app_active',
      status,
    })
    return BackgroundFetch.BackgroundFetchResult.NoData
  }

  if (!enabled) {
    console.log(`${LOG_PREFIX} [BG] Tor not enabled, returning NoData`)
    return BackgroundFetch.BackgroundFetchResult.NoData
  }

  try {
    if (status !== 'connected') {
      console.log(`${LOG_PREFIX} [BG] Tor not connected, starting daemon for background poll...`)
      const { startTor } = await import('./torService')
      const started = await startTor()
      if (!started) {
        console.warn(`${LOG_PREFIX} [BG] Unable to start Tor for background poll`)
        const errorMessage = useTorStore.getState().errorMessage ?? ''
        if (errorMessage.toLowerCase().includes('cooldown') || errorMessage.toLowerCase().includes('expired')) {
          return BackgroundFetch.BackgroundFetchResult.NoData
        }
        return BackgroundFetch.BackgroundFetchResult.Failed
      }
      startedTorForTask = true
    }

    console.log(`${LOG_PREFIX} [BG] Importing pollForNewMessages...`)
    const { pollForNewMessages } = await import('@/services/quantumChat')
    console.log(`${LOG_PREFIX} [BG] Starting background poll...`)
    await pollForNewMessages()

    const elapsed = Date.now() - startTime
    console.log(`${LOG_PREFIX} [BG] ======== BACKGROUND POLL COMPLETED (${elapsed}ms) ========`)
    return BackgroundFetch.BackgroundFetchResult.NewData
  } catch (err) {
    const elapsed = Date.now() - startTime
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`${LOG_PREFIX} [BG] ======== BACKGROUND POLL FAILED (${elapsed}ms) ========`)
    console.error(`${LOG_PREFIX} [BG] Error: ${errMsg}`)
    return BackgroundFetch.BackgroundFetchResult.Failed
  } finally {
    const appState = String(AppState.currentState)
    if (startedTorForTask && appState !== 'active') {
      try {
        const { stopTor } = await import('./torService')
        console.log(`${LOG_PREFIX} [BG] Stopping Tor after background poll`)
        await stopTor()
      } catch (stopError) {
        console.warn(`${LOG_PREFIX} [BG] Failed to stop Tor after background poll: ${String(stopError)}`)
      }
    }
  }
})

export async function registerBackgroundFetch(): Promise<void> {
  const { enabled } = useTorStore.getState()
  console.log(`${LOG_PREFIX} [BG] registerBackgroundFetch() called (torEnabled=${enabled})`)
  if (!enabled) {
    console.log(`${LOG_PREFIX} [BG] Tor not enabled, skipping registration`)
    return
  }

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK)
    console.log(`${LOG_PREFIX} [BG] Task already registered: ${isRegistered}`)
    if (isRegistered) {
      return
    }

    const bgStatus = await BackgroundFetch.getStatusAsync()
    const statusName = bgStatus === BackgroundFetch.BackgroundFetchStatus.Available ? 'available'
      : bgStatus === BackgroundFetch.BackgroundFetchStatus.Restricted ? 'restricted'
      : bgStatus === BackgroundFetch.BackgroundFetchStatus.Denied ? 'denied'
      : `unknown(${bgStatus})`
    console.log(`${LOG_PREFIX} [BG] Background fetch system status: ${statusName}`)

    if (bgStatus !== BackgroundFetch.BackgroundFetchStatus.Available) {
      console.warn(`${LOG_PREFIX} [BG] Background fetch not available (status=${statusName}), registration may fail`)
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 15 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    })

    console.log(`${LOG_PREFIX} [BG] Background fetch registered successfully (interval: 15min minimum)`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn(`${LOG_PREFIX} [BG] Failed to register background fetch: ${errMsg}`)
  }
}

export async function unregisterBackgroundFetch(): Promise<void> {
  console.log(`${LOG_PREFIX} [BG] unregisterBackgroundFetch() called`)
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK)
    console.log(`${LOG_PREFIX} [BG] Task currently registered: ${isRegistered}`)
    if (!isRegistered) return

    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK)
    console.log(`${LOG_PREFIX} [BG] Background fetch unregistered successfully`)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.warn(`${LOG_PREFIX} [BG] Failed to unregister background fetch: ${errMsg}`)
  }
}
