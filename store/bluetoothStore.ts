/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'
import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'
import type { BLEMeshStatus, BLEMeshConfig } from '@/services/bluetooth/types'
import { DEFAULT_BLE_MESH_CONFIG } from '@/services/bluetooth/types'
import type { NearbyContact } from '@/services/bluetooth/peerRegistry'
import type { BLEDiagnosticSnapshot } from '@/services/bluetooth/diagnostics'
import type { BLEMessageDiagnosticSnapshot } from '@/services/bluetooth/messageDiagnostics'
import { normalizeAccountStorageScope } from '@/lib/accountScope'

export const LEGACY_BLE_MESH_CONFIG_STORAGE_KEY = 'ble_mesh_config'
export const BLE_MESH_CONFIG_STORAGE_PREFIX = 'ble_mesh_config:v2:'

function configKey(scope: string): string {
  return `${BLE_MESH_CONFIG_STORAGE_PREFIX}${scope}`
}

function upsertMessageDiagnostics(
  current: Record<string, BLEMessageDiagnosticSnapshot>,
  snapshot: BLEMessageDiagnosticSnapshot,
): Record<string, BLEMessageDiagnosticSnapshot> {
  const next = { ...current, [snapshot.peerIdentityId]: { ...snapshot } }
  const entries = Object.entries(next)
  if (entries.length <= 32) return next
  const [oldestKey] = entries.reduce((oldest, entry) => (
    entry[1].updatedAt < oldest[1].updatedAt ? entry : oldest
  ))
  delete next[oldestKey]
  return next
}

async function persistConfig(scope: string | null, config: BLEMeshConfig): Promise<void> {
  if (!scope) return
  try {
    await getAppKeyValueStorage().setItem(configKey(scope), JSON.stringify(config))
  } catch (e) {
    console.warn('[BLE::Store] Failed to save config to storage:', e)
  }
}

export async function clearPersistedBluetoothConfig(walletAddress?: string): Promise<void> {
  const scope = normalizeAccountStorageScope(walletAddress)
  if (scope) {
    await getAppKeyValueStorage().multiRemove([
      configKey(scope),
      LEGACY_BLE_MESH_CONFIG_STORAGE_KEY,
    ])
    return
  }

  const keys = await getAppKeyValueStorage().getAllKeys()
  await getAppKeyValueStorage().multiRemove(keys.filter(
    (key) => key === LEGACY_BLE_MESH_CONFIG_STORAGE_KEY
      || key.startsWith(BLE_MESH_CONFIG_STORAGE_PREFIX),
  ))
}

interface BluetoothState {
  walletScope: string | null
  status: BLEMeshStatus
  initialized: boolean
  error: string | null
  internetAvailable: boolean

  config: BLEMeshConfig
  diagnostics: BLEDiagnosticSnapshot
  messageDiagnostics: Record<string, BLEMessageDiagnosticSnapshot>

  nearbyContacts: NearbyContact[]

  stats: {
    totalSent: number
    totalReceived: number
    totalRelayed: number
    totalDropped: number
    peerCount: number
  }

  setStatus: (status: BLEMeshStatus) => void
  setInitialized: (initialized: boolean) => void
  setError: (error: string | null) => void
  setInternetAvailable: (available: boolean) => void
  setConfig: (config: Partial<BLEMeshConfig>) => void
  setDiagnostics: (diagnostics: BLEDiagnosticSnapshot) => void
  setMessageDiagnostics: (diagnostics: BLEMessageDiagnosticSnapshot) => void
  clearMessageDiagnostics: () => void
  setEnabled: (enabled: boolean) => Promise<void>
  setNearbyContacts: (contacts: NearbyContact[]) => void
  setStats: (stats: BluetoothState['stats']) => void

  loadConfig: (walletAddress: string) => Promise<BLEMeshConfig>

  reset: () => void
}

const defaultDiagnostics: BLEDiagnosticSnapshot = {
  runId: 0,
  running: false,
  startedAt: null,
  updatedAt: null,
  currentStage: 'idle',
  furthestStage: 'idle',
  lastFailure: null,
  lastFailureCause: null,
  eligibleContactCount: 0,
  noiseSelfTest: 'not_run',
  payloadBudgetSource: 'unknown',
  payloadBudgetBytes: null,
  handshakeProgress: 'not_started',
}

export const useBluetoothStore = create<BluetoothState>((set, get) => ({
  walletScope: null,
  status: 'disabled',
  initialized: false,
  error: null,
  internetAvailable: true,
  config: { ...DEFAULT_BLE_MESH_CONFIG },
  diagnostics: { ...defaultDiagnostics },
  messageDiagnostics: {},
  nearbyContacts: [],
  stats: {
    totalSent: 0,
    totalReceived: 0,
    totalRelayed: 0,
    totalDropped: 0,
    peerCount: 0,
  },

  setStatus: (status) => set({ status }),
  setInitialized: (initialized) => set({ initialized }),
  setError: (error) => set({ error }),
  setInternetAvailable: (internetAvailable) => set({ internetAvailable }),

  setConfig: (updates) => {
    const config = { ...get().config, ...updates }
    set({ config })
    void persistConfig(get().walletScope, config)
  },

  setDiagnostics: (diagnostics) => set({ diagnostics: { ...diagnostics } }),
  setMessageDiagnostics: (diagnostics) => set((state) => ({
    messageDiagnostics: upsertMessageDiagnostics(
      state.messageDiagnostics,
      diagnostics,
    ),
  })),
  clearMessageDiagnostics: () => set({ messageDiagnostics: {} }),

  setEnabled: async (enabled) => {
    const config = { ...get().config, enabled }
    set({
      config,
      status: enabled ? 'initializing' : 'disabled',
    })
    await persistConfig(get().walletScope, config)
  },

  setNearbyContacts: (contacts) => set({ nearbyContacts: contacts }),

  setStats: (stats) => set({ stats }),

  loadConfig: async (walletAddress) => {
    const walletScope = normalizeAccountStorageScope(walletAddress)
    if (!walletScope) {
      set({ walletScope: null, config: { ...DEFAULT_BLE_MESH_CONFIG } })
      return { ...DEFAULT_BLE_MESH_CONFIG }
    }

    try {
      const stored = await getAppKeyValueStorage().getItem(configKey(walletScope))
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<BLEMeshConfig>
        const merged = { ...DEFAULT_BLE_MESH_CONFIG, ...parsed }
        set({ walletScope, config: merged })
        return merged
      }

      const legacy = await getAppKeyValueStorage().getItem(LEGACY_BLE_MESH_CONFIG_STORAGE_KEY)
      if (legacy) {
        const parsed = JSON.parse(legacy) as Partial<BLEMeshConfig>
        const migrated = {
          ...DEFAULT_BLE_MESH_CONFIG,
          ...parsed,
          enabled: false,
          relayEnabled: false,
          storeForwardEnabled: false,
        }
        await getAppKeyValueStorage().setItem(configKey(walletScope), JSON.stringify(migrated))
        await getAppKeyValueStorage().removeItem(LEGACY_BLE_MESH_CONFIG_STORAGE_KEY)
        set({ walletScope, config: migrated })
        return migrated
      }
    } catch (e) {
      console.warn('[BLE::Store] Failed to load config from storage:', e)
    }
    set({ walletScope, config: { ...DEFAULT_BLE_MESH_CONFIG } })
    return { ...DEFAULT_BLE_MESH_CONFIG }
  },

  reset: () =>
    set({
      walletScope: null,
      status: 'disabled',
      initialized: false,
      error: null,
      internetAvailable: true,
      config: { ...DEFAULT_BLE_MESH_CONFIG },
      diagnostics: { ...defaultDiagnostics },
      messageDiagnostics: {},
      nearbyContacts: [],
      stats: {
        totalSent: 0,
        totalReceived: 0,
        totalRelayed: 0,
        totalDropped: 0,
        peerCount: 0,
      },
    }),
}))
