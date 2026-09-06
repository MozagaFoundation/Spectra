/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { SECURE_STORE_OPTIONS } from '@/lib/constants'
import {
  TOR_STORAGE_KEYS,
  TOR_CONFIG,
  LOG_PREFIX,
  type TorStatus,
  type BridgeType,
} from './torConstants'
import { normalizeTorBridgeLines } from './torBridgeLines'
import { setClearnetEgressAllowed } from './torEgressPolicy'
import { assertBridgeBootstrapConsent } from './snowflakeConsent'

declare const __DEV__: boolean | undefined

function shouldLogTorDebug(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__
}

function formatTorError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function logTorDebug(message: string): void {
  if (shouldLogTorDebug()) {
    console.log(`${LOG_PREFIX} ${message}`)
  }
}

function logTorError(message: string, err: unknown): void {
  if (shouldLogTorDebug()) {
    console.error(`${LOG_PREFIX} ${message}: ${formatTorError(err)}`)
  }
}

let stateTransitionQueue = Promise.resolve()

type PersistedBridgeConfiguration = {
  v: 1
  bridges: string[]
  bridgeType: BridgeType
}

function isBridgeType(value: unknown): value is BridgeType {
  return value === 'none'
    || value === 'obfs4'
    || value === 'snowflake'
    || value === 'webtunnel'
}

function normalizeBridgeConfiguration(
  bridges: string[],
  bridgeType: BridgeType,
): { bridges: string[]; bridgeType: BridgeType } {
  const normalizedBridges = normalizeTorBridgeLines(bridges)
  return {
    bridges: normalizedBridges,
    bridgeType: normalizedBridges.length === 0 ? 'none' : bridgeType,
  }
}

function parseBridgeConfiguration(
  savedConfig: string | null,
  savedBridges: string | null,
  savedBridgeType: string | null,
): { bridges: string[]; bridgeType: BridgeType } {
  if (savedConfig !== null) {
    const parsed = JSON.parse(savedConfig) as Partial<PersistedBridgeConfiguration>
    if (
      parsed?.v !== 1
      || !Array.isArray(parsed.bridges)
      || !parsed.bridges.every((bridge) => typeof bridge === 'string')
      || !isBridgeType(parsed.bridgeType)
    ) {
      throw new Error('Invalid persisted Tor bridge configuration')
    }
    return normalizeBridgeConfiguration(parsed.bridges, parsed.bridgeType)
  }

  const parsedBridges: unknown = savedBridges ? JSON.parse(savedBridges) : []
  if (!Array.isArray(parsedBridges)) {
    throw new Error('Invalid persisted Tor bridge list')
  }
  const bridgeType = savedBridgeType ?? 'none'
  if (!isBridgeType(bridgeType)) {
    throw new Error('Invalid persisted Tor bridge type')
  }
  return normalizeBridgeConfiguration(
    parsedBridges.filter((bridge): bridge is string => typeof bridge === 'string'),
    bridgeType,
  )
}

function enqueueStateTransition(transition: () => Promise<void>): Promise<void> {
  const queued = stateTransitionQueue.then(transition, transition)
  stateTransitionQueue = queued.catch(() => undefined)
  return queued
}

export type TorPresenceGateReason = 'startup' | 'foreground_resume'

export interface TorVerificationSnapshot {
  exitIp: string | null
  exitCountry: string | null
  exitCountryCode: string | null
  isTorVerified: boolean | null
  lastVerifiedAt: number | null
  lastHealthError: string | null
}

interface TorState {
  enabled: boolean
  status: TorStatus
  socksPort: number
  errorMessage: string | null
  bridges: string[]
  bridgeType: BridgeType
  initialized: boolean
  exitIp: string | null
  exitCountry: string | null
  exitCountryCode: string | null
  isTorVerified: boolean | null
  lastVerifiedAt: number | null
  lastHealthError: string | null
  presenceGateReason: TorPresenceGateReason | null

  setEnabled: (enabled: boolean) => Promise<void>
  setStatus: (status: TorStatus, errorMessage?: string | null) => void
  setBridges: (bridges: string[], bridgeType: BridgeType) => Promise<void>
  setVerificationSnapshot: (snapshot: TorVerificationSnapshot) => void
  setLastHealthError: (errorMessage: string | null) => void
  requestPresenceGate: (reason: TorPresenceGateReason) => void
  dismissPresenceGate: () => void
  initialize: () => Promise<void>
  reset: () => void
}

export const useTorStore = create<TorState>((set, get) => ({
  enabled: false,
  status: 'disconnected',
  socksPort: TOR_CONFIG.SOCKS_PORT,
  errorMessage: null,
  bridges: [],
  bridgeType: 'none',
  initialized: false,
  exitIp: null,
  exitCountry: null,
  exitCountryCode: null,
  isTorVerified: null,
  lastVerifiedAt: null,
  lastHealthError: null,
  presenceGateReason: null,

  setEnabled: (enabled: boolean) => enqueueStateTransition(async () => {
    logTorDebug(`setEnabled=${enabled}`)
    const egressTransition = setClearnetEgressAllowed(!enabled)
    set((state) => ({
      enabled,
      presenceGateReason: enabled ? state.presenceGateReason : null,
      lastHealthError: enabled ? state.lastHealthError : null,
    }))
    await egressTransition
    try {
      await SecureStore.setItemAsync(
        TOR_STORAGE_KEYS.ENABLED,
        String(enabled),
        SECURE_STORE_OPTIONS
      )
      logTorDebug(`Persisted enabled=${enabled}`)
    } catch (err) {
      logTorError('Failed to persist enabled state', err)
    }
  }),

  setStatus: (status: TorStatus, errorMessage: string | null = null) => {
    const prev = get().status
    logTorDebug(
      `Status transition: ${prev} -> ${status}${errorMessage ? ' (error present)' : ''}`
    )
    set((state) => ({
      status,
      errorMessage,
      presenceGateReason: status === 'connected' ? null : state.presenceGateReason,
      lastHealthError:
        status === 'connected'
          ? null
          : status === 'error'
            ? errorMessage ?? state.lastHealthError
            : state.lastHealthError,
    }))
  },

  setBridges: async (bridges: string[], bridgeType: BridgeType) => {
    const configuration = normalizeBridgeConfiguration(bridges, bridgeType)
    await assertBridgeBootstrapConsent(configuration.bridgeType)
    logTorDebug(`setBridges: type=${configuration.bridgeType}, count=${configuration.bridges.length}`)
    try {
      await SecureStore.setItemAsync(
        TOR_STORAGE_KEYS.BRIDGE_CONFIG,
        JSON.stringify({ v: 1, ...configuration } satisfies PersistedBridgeConfiguration),
        SECURE_STORE_OPTIONS,
      )
      await Promise.allSettled([
        SecureStore.deleteItemAsync(TOR_STORAGE_KEYS.BRIDGES, SECURE_STORE_OPTIONS),
        SecureStore.deleteItemAsync(TOR_STORAGE_KEYS.BRIDGE_TYPE, SECURE_STORE_OPTIONS),
      ])
      set(configuration)
      logTorDebug(`Persisted ${configuration.bridges.length} bridge entries`)
    } catch (err) {
      logTorError('Failed to persist bridges', err)
      throw err
    }
  },

  setVerificationSnapshot: (snapshot: TorVerificationSnapshot) => {
    logTorDebug(
      `setVerificationSnapshot: ip=${snapshot.exitIp ?? 'unknown'}, country=${snapshot.exitCountry ?? 'unknown'}`
    )
    set({
      exitIp: snapshot.exitIp,
      exitCountry: snapshot.exitCountry,
      exitCountryCode: snapshot.exitCountryCode,
      isTorVerified: snapshot.isTorVerified,
      lastVerifiedAt: snapshot.lastVerifiedAt,
      lastHealthError: snapshot.lastHealthError,
    })
  },

  setLastHealthError: (errorMessage: string | null) => {
    logTorDebug(`setLastHealthError=${errorMessage ?? 'null'}`)
    set({ lastHealthError: errorMessage })
  },

  requestPresenceGate: (reason: TorPresenceGateReason) => {
    logTorDebug(`requestPresenceGate=${reason}`)
    set({ presenceGateReason: reason })
  },

  dismissPresenceGate: () => {
    logTorDebug('dismissPresenceGate')
    set({ presenceGateReason: null })
  },

  initialize: () => enqueueStateTransition(async () => {
    logTorDebug('Initializing TorStore')
    await setClearnetEgressAllowed(false)
    try {
      const [savedEnabled, savedConfig, savedBridges, savedBridgeType] = await Promise.all([
        SecureStore.getItemAsync(TOR_STORAGE_KEYS.ENABLED, SECURE_STORE_OPTIONS),
        SecureStore.getItemAsync(TOR_STORAGE_KEYS.BRIDGE_CONFIG, SECURE_STORE_OPTIONS),
        SecureStore.getItemAsync(TOR_STORAGE_KEYS.BRIDGES, SECURE_STORE_OPTIONS),
        SecureStore.getItemAsync(TOR_STORAGE_KEYS.BRIDGE_TYPE, SECURE_STORE_OPTIONS),
      ])

      const enabled = savedEnabled === 'true'
      const { bridges, bridgeType } = parseBridgeConfiguration(
        savedConfig,
        savedBridges,
        savedBridgeType,
      )
      await setClearnetEgressAllowed(!enabled)

      logTorDebug(
        `Loaded persisted state: enabled=${enabled}, bridgeType=${bridgeType}, bridgeCount=${bridges.length}`
      )

      set({
        enabled,
        bridges,
        bridgeType,
        initialized: true,
        exitIp: null,
        exitCountry: null,
        exitCountryCode: null,
        isTorVerified: null,
        lastVerifiedAt: null,
        lastHealthError: null,
        presenceGateReason: null,
      })
    } catch (err) {
      logTorError('Failed to initialize TorStore', err)
      await setClearnetEgressAllowed(false)
      set({
        enabled: true,
        status: 'error',
        errorMessage: 'Tor preferences could not be loaded',
        initialized: true,
      })
    }
  }),

  reset: () => {
    void enqueueStateTransition(async () => {
      set({
        enabled: false,
        status: 'disconnected',
        errorMessage: null,
        bridges: [],
        bridgeType: 'none',
        initialized: false,
        exitIp: null,
        exitCountry: null,
        exitCountryCode: null,
        isTorVerified: null,
        lastVerifiedAt: null,
        lastHealthError: null,
        presenceGateReason: null,
      })
      await setClearnetEgressAllowed(true)
    })
  },
}))
