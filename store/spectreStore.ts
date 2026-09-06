/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

import { SECURE_STORE_OPTIONS, STORAGE_KEYS } from '@/lib/constants'

const SPECTRE_ENABLED_KEY = STORAGE_KEYS.SPECTRE_MODE
const SPECTRE_SNAPSHOT_KEY = STORAGE_KEYS.SPECTRE_SNAPSHOT
const SPECTRE_WALLET_ID_KEY = STORAGE_KEYS.SPECTRE_WALLET_ID
const SPECTRE_ACCOUNT_MODE_KEY = STORAGE_KEYS.SPECTRE_ACCOUNT_MODE

export type SpectreAccountMode = 'mnemonic' | 'persistent_generated' | 'expendable'
export type SpectreActivationFlow = 'enable' | 'disable'
export type SpectreCachePrivacyMode = 'standard' | 'clear_on_lock' | 'strict'
export type SpectreActivationPhase =
  | 'prepare_account'
  | 'capture_snapshot'
  | 'persist_snapshot'
  | 'enable_tor'
  | 'apply_local_privacy'
  | 'activate_wallet'
  | 'rollback'
  | 'prepare_storage'
  | 'cached_conversations'
  | 'initialize_chat'
  | 'verify_cloud'
  | 'read_snapshot'
  | 'restore_settings'
  | 'disable_tor'
  | 'cleanup_expendable_wallet'
  | 'reset_state'
  | 'finalize_state'
  | 'completed'

interface SpectreSnapshotV1 {
  version: 1
  activeWalletId: string | null
  torEnabled: boolean
  deliveryReceiptsEnabled: boolean
  readReceiptsEnabled: boolean
  screenshotProtectionEnabled: boolean
  appSwitcherPrivacyEnabled: boolean
  autoLockEnabled: boolean
  autoLockTime: string
  failWipeEnabled: boolean
  failWipeAttempts: string
  bluetoothEnabled: boolean
  clearImageCacheOnLockEnabled: boolean
  messageCachePrivacyMode: SpectreCachePrivacyMode
}

export interface SpectreSnapshot {
  version: 2
  capturedAt: number
  generation: string
  primaryWalletId: string | null
  primaryWalletAddress: string | null
  torEnabled: boolean
  deliveryReceiptsEnabled: boolean
  readReceiptsEnabled: boolean
  screenshotProtectionEnabled: boolean
  appSwitcherPrivacyEnabled: boolean
  autoLockEnabled: boolean
  autoLockTime: string
  failWipeEnabled: boolean
  failWipeAttempts: string
  duressProtectionEnabled: boolean
  bluetoothEnabled: boolean
  bluetoothOverrideEnabled: boolean | null
  clearImageCacheOnLockEnabled: boolean
  messageCachePrivacyMode: SpectreCachePrivacyMode
}

type ParsedSpectreSnapshot =
  & Partial<Omit<SpectreSnapshot, 'version'>>
  & Partial<Omit<SpectreSnapshotV1, 'version'>>
  & { version?: unknown }

function parseSpectreAccountMode(raw: string | null): SpectreAccountMode | null {
  if (raw === 'mnemonic' || raw === 'persistent_generated' || raw === 'expendable') {
    return raw
  }

  return null
}

function isCachePrivacyMode(value: unknown): value is SpectreCachePrivacyMode {
  return value === 'standard' || value === 'clear_on_lock' || value === 'strict'
}

function hasCommonSnapshotFields(
  parsed: ParsedSpectreSnapshot,
): boolean {
  return (
    typeof parsed.torEnabled === 'boolean'
    && typeof parsed.deliveryReceiptsEnabled === 'boolean'
    && typeof parsed.readReceiptsEnabled === 'boolean'
    && typeof parsed.screenshotProtectionEnabled === 'boolean'
    && typeof parsed.appSwitcherPrivacyEnabled === 'boolean'
    && typeof parsed.autoLockEnabled === 'boolean'
    && typeof parsed.autoLockTime === 'string'
    && typeof parsed.failWipeEnabled === 'boolean'
    && typeof parsed.failWipeAttempts === 'string'
    && typeof parsed.bluetoothEnabled === 'boolean'
    && typeof parsed.clearImageCacheOnLockEnabled === 'boolean'
    && isCachePrivacyMode(parsed.messageCachePrivacyMode)
  )
}

function parseSpectreSnapshot(raw: string | null): {
  snapshot: SpectreSnapshot | null
  migrated: boolean
} {
  if (!raw) {
    return { snapshot: null, migrated: false }
  }

  try {
    const parsed = JSON.parse(raw) as ParsedSpectreSnapshot
    if (!hasCommonSnapshotFields(parsed)) {
      return { snapshot: null, migrated: false }
    }

    if (parsed.version === 1) {
      return {
        migrated: true,
        snapshot: {
          version: 2,
          capturedAt: 0,
          generation: 'legacy-v1',
          primaryWalletId: typeof parsed.activeWalletId === 'string' ? parsed.activeWalletId : null,
          primaryWalletAddress: null,
          torEnabled: parsed.torEnabled!,
          deliveryReceiptsEnabled: parsed.deliveryReceiptsEnabled!,
          readReceiptsEnabled: parsed.readReceiptsEnabled!,
          screenshotProtectionEnabled: parsed.screenshotProtectionEnabled!,
          appSwitcherPrivacyEnabled: parsed.appSwitcherPrivacyEnabled!,
          autoLockEnabled: parsed.autoLockEnabled!,
          autoLockTime: parsed.autoLockTime!,
          failWipeEnabled: parsed.failWipeEnabled!,
          failWipeAttempts: parsed.failWipeAttempts!,
          duressProtectionEnabled: true,
          bluetoothEnabled: parsed.bluetoothEnabled!,
          bluetoothOverrideEnabled: null,
          clearImageCacheOnLockEnabled: true,
          messageCachePrivacyMode: 'strict',
        },
      }
    }

    if (
      parsed.version !== 2
      || typeof parsed.capturedAt !== 'number'
      || !Number.isFinite(parsed.capturedAt)
      || typeof parsed.generation !== 'string'
      || parsed.generation.length === 0
      || !(parsed.primaryWalletId === null || typeof parsed.primaryWalletId === 'string')
      || !(parsed.primaryWalletAddress === null || typeof parsed.primaryWalletAddress === 'string')
      || typeof parsed.duressProtectionEnabled !== 'boolean'
      || !(parsed.bluetoothOverrideEnabled === null || typeof parsed.bluetoothOverrideEnabled === 'boolean')
    ) {
      return { snapshot: null, migrated: false }
    }

    return {
      migrated: false,
      snapshot: {
        version: 2,
        capturedAt: parsed.capturedAt,
        generation: parsed.generation,
        primaryWalletId: parsed.primaryWalletId,
        primaryWalletAddress: parsed.primaryWalletAddress,
        torEnabled: parsed.torEnabled!,
        deliveryReceiptsEnabled: parsed.deliveryReceiptsEnabled!,
        readReceiptsEnabled: parsed.readReceiptsEnabled!,
        screenshotProtectionEnabled: parsed.screenshotProtectionEnabled!,
        appSwitcherPrivacyEnabled: parsed.appSwitcherPrivacyEnabled!,
        autoLockEnabled: parsed.autoLockEnabled!,
        autoLockTime: parsed.autoLockTime!,
        failWipeEnabled: parsed.failWipeEnabled!,
        failWipeAttempts: parsed.failWipeAttempts!,
        duressProtectionEnabled: parsed.duressProtectionEnabled,
        bluetoothEnabled: parsed.bluetoothEnabled!,
        bluetoothOverrideEnabled: parsed.bluetoothOverrideEnabled,
        clearImageCacheOnLockEnabled: parsed.clearImageCacheOnLockEnabled!,
        messageCachePrivacyMode: parsed.messageCachePrivacyMode!,
      },
    }
  } catch (error) {
    console.warn('Failed to parse persisted Spectre snapshot:', error)
    return { snapshot: null, migrated: false }
  }
}

let snapshotOperationQueue: Promise<void> = Promise.resolve()

function serializeSnapshotOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = snapshotOperationQueue.then(operation, operation)
  snapshotOperationQueue = result.then(() => {}, () => {})
  return result
}

export async function readPersistedSpectreSnapshot(): Promise<SpectreSnapshot | null> {
  return serializeSnapshotOperation(async () => {
    const raw = await SecureStore.getItemAsync(SPECTRE_SNAPSHOT_KEY, SECURE_STORE_OPTIONS)
    const parsed = parseSpectreSnapshot(raw)
    if (parsed.migrated && parsed.snapshot) {
      await SecureStore.setItemAsync(
        SPECTRE_SNAPSHOT_KEY,
        JSON.stringify(parsed.snapshot),
        SECURE_STORE_OPTIONS,
      )
    }
    return parsed.snapshot
  })
}

export async function writePersistedSpectreSnapshot(
  snapshot: SpectreSnapshot | null,
): Promise<void> {
  await serializeSnapshotOperation(async () => {
    if (!snapshot) {
      await SecureStore.deleteItemAsync(SPECTRE_SNAPSHOT_KEY, SECURE_STORE_OPTIONS)
      return
    }

    await SecureStore.setItemAsync(
      SPECTRE_SNAPSHOT_KEY,
      JSON.stringify(snapshot),
      SECURE_STORE_OPTIONS,
    )
  })
}

export async function setPersistedSpectreBluetoothOverride(enabled: boolean): Promise<void> {
  await serializeSnapshotOperation(async () => {
    const raw = await SecureStore.getItemAsync(SPECTRE_SNAPSHOT_KEY, SECURE_STORE_OPTIONS)
    const { snapshot } = parseSpectreSnapshot(raw)
    if (!snapshot) {
      throw new Error('Spectre settings snapshot is unavailable')
    }

    await SecureStore.setItemAsync(
      SPECTRE_SNAPSHOT_KEY,
      JSON.stringify({
        ...snapshot,
        bluetoothOverrideEnabled: enabled,
      }),
      SECURE_STORE_OPTIONS,
    )
  })
}

interface SpectreState {
  isLoaded: boolean
  enabled: boolean
  isApplying: boolean
  activationFlow: SpectreActivationFlow | null
  activationPhase: SpectreActivationPhase | null
  activationError: string | null
  activationStartedAt: number | null
  activationFinishedAt: number | null
  themePreviewActive: boolean
  spectreWalletId: string | null
  spectreAccountMode: SpectreAccountMode | null
  initialize: () => Promise<void>
  setEnabled: (enabled: boolean) => Promise<void>
  setSpectreWalletId: (walletId: string | null) => Promise<void>
  setSpectreAccountMode: (mode: SpectreAccountMode | null) => Promise<void>
  startActivation: (
    flow: SpectreActivationFlow,
    phase: SpectreActivationPhase,
  ) => void
  setActivationPhase: (phase: SpectreActivationPhase) => void
  completeActivation: () => void
  failActivation: (error: string) => void
  resetActivationProgress: () => void
  setThemePreviewActive: (active: boolean) => void
  reset: () => Promise<void>
}

export const useSpectreStore = create<SpectreState>((set) => ({
  isLoaded: false,
  enabled: false,
  isApplying: false,
  activationFlow: null,
  activationPhase: null,
  activationError: null,
  activationStartedAt: null,
  activationFinishedAt: null,
  themePreviewActive: false,
  spectreWalletId: null,
  spectreAccountMode: null,

  initialize: async () => {
    try {
      const [enabledValue, walletIdValue, accountModeValue] = await Promise.all([
        SecureStore.getItemAsync(SPECTRE_ENABLED_KEY, SECURE_STORE_OPTIONS),
        SecureStore.getItemAsync(SPECTRE_WALLET_ID_KEY, SECURE_STORE_OPTIONS),
        SecureStore.getItemAsync(SPECTRE_ACCOUNT_MODE_KEY, SECURE_STORE_OPTIONS),
      ])

      set({
        isLoaded: true,
        enabled: enabledValue === 'true',
        activationFlow: null,
        activationPhase: null,
        activationError: null,
        activationStartedAt: null,
        activationFinishedAt: null,
        themePreviewActive: false,
        spectreWalletId: walletIdValue || null,
        spectreAccountMode: parseSpectreAccountMode(accountModeValue),
      })
    } catch (error) {
      console.warn('Failed to initialize Spectre state:', error)
      set({
        isLoaded: true,
        enabled: false,
        activationFlow: null,
        activationPhase: null,
        activationError: null,
        activationStartedAt: null,
        activationFinishedAt: null,
        themePreviewActive: false,
        spectreWalletId: null,
        spectreAccountMode: null,
      })
    }
  },

  setEnabled: async (enabled: boolean) => {
    if (enabled) {
      await SecureStore.setItemAsync(SPECTRE_ENABLED_KEY, 'true', SECURE_STORE_OPTIONS)
    } else {
      await SecureStore.deleteItemAsync(SPECTRE_ENABLED_KEY, SECURE_STORE_OPTIONS)
    }

    set({ enabled })
  },

  setSpectreWalletId: async (walletId: string | null) => {
    if (walletId) {
      await SecureStore.setItemAsync(SPECTRE_WALLET_ID_KEY, walletId, SECURE_STORE_OPTIONS)
    } else {
      await SecureStore.deleteItemAsync(SPECTRE_WALLET_ID_KEY, SECURE_STORE_OPTIONS)
    }

    set({ spectreWalletId: walletId })
  },

  setSpectreAccountMode: async (mode: SpectreAccountMode | null) => {
    if (mode) {
      await SecureStore.setItemAsync(SPECTRE_ACCOUNT_MODE_KEY, mode, SECURE_STORE_OPTIONS)
    } else {
      await SecureStore.deleteItemAsync(SPECTRE_ACCOUNT_MODE_KEY, SECURE_STORE_OPTIONS)
    }

    set({ spectreAccountMode: mode })
  },

  startActivation: (flow: SpectreActivationFlow, phase: SpectreActivationPhase) => {
    const startedAt = Date.now()
    set({
      isApplying: true,
      activationFlow: flow,
      activationPhase: phase,
      activationError: null,
      activationStartedAt: startedAt,
      activationFinishedAt: null,
    })
  },

  setActivationPhase: (phase: SpectreActivationPhase) => {
    set((state) => ({
      activationFlow: state.activationFlow,
      activationPhase: phase,
      activationError: null,
      activationStartedAt: state.activationStartedAt ?? Date.now(),
      activationFinishedAt: phase === 'completed' ? Date.now() : null,
    }))
  },

  completeActivation: () => {
    set((state) => ({
      isApplying: false,
      activationFlow: state.activationFlow,
      activationPhase: 'completed',
      activationError: null,
      activationStartedAt: state.activationStartedAt ?? Date.now(),
      activationFinishedAt: Date.now(),
    }))
  },

  failActivation: (error: string) => {
    set((state) => ({
      isApplying: false,
      activationFlow: state.activationFlow,
      activationPhase: state.activationPhase,
      activationError: error,
      activationStartedAt: state.activationStartedAt ?? Date.now(),
      activationFinishedAt: Date.now(),
    }))
  },

  resetActivationProgress: () => {
    set({
      isApplying: false,
      activationFlow: null,
      activationPhase: null,
      activationError: null,
      activationStartedAt: null,
      activationFinishedAt: null,
    })
  },

  setThemePreviewActive: (active: boolean) => {
    set({ themePreviewActive: active })
  },

  reset: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(SPECTRE_ENABLED_KEY, SECURE_STORE_OPTIONS),
      SecureStore.deleteItemAsync(SPECTRE_WALLET_ID_KEY, SECURE_STORE_OPTIONS),
      SecureStore.deleteItemAsync(SPECTRE_ACCOUNT_MODE_KEY, SECURE_STORE_OPTIONS),
    ])
    await writePersistedSpectreSnapshot(null)

    set({
      enabled: false,
      isApplying: false,
      themePreviewActive: false,
      spectreWalletId: null,
      spectreAccountMode: null,
    })
  },
}))
