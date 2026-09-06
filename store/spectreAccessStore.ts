/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

import { SECURE_STORE_OPTIONS, STORAGE_KEYS } from '@/lib/constants'
import type { SpectreAccessState } from '@/lib/types'

const SPECTRE_ACCESS_STATE_KEY = STORAGE_KEYS.SPECTRE_ACCESS_STATE
const LEGACY_TOR_ENTITLEMENT_STATE_KEY = 'exo_tor_entitlement_state'

function normalizeSpectreAccessState(value: unknown): SpectreAccessState | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Partial<SpectreAccessState> & {
    canRequestSpectreToken?: unknown
  }

  return {
    walletAddress: typeof record.walletAddress === 'string' ? record.walletAddress : null,
    canRequestEphemeralToken:
      record.canRequestEphemeralToken === true || record.canRequestSpectreToken === true,
    spectreTokenLastIssuedAt:
      typeof record.spectreTokenLastIssuedAt === 'string' ? record.spectreTokenLastIssuedAt : null,
    spectreTokenAvailableAt:
      typeof record.spectreTokenAvailableAt === 'string' ? record.spectreTokenAvailableAt : null,
    currentWalletIsSpectre: record.currentWalletIsSpectre === true,
    currentSpectreIsEphemeral: record.currentSpectreIsEphemeral === true,
    currentSpectreExpiresAt:
      typeof record.currentSpectreExpiresAt === 'string' ? record.currentSpectreExpiresAt : null,
    refreshedAt: typeof record.refreshedAt === 'string' ? record.refreshedAt : null,
  }
}

async function persistAccessState(state: SpectreAccessState | null): Promise<void> {
  if (!state) {
    await SecureStore.deleteItemAsync(SPECTRE_ACCESS_STATE_KEY, SECURE_STORE_OPTIONS)
    return
  }

  await SecureStore.setItemAsync(
    SPECTRE_ACCESS_STATE_KEY,
    JSON.stringify(state),
    SECURE_STORE_OPTIONS,
  )
}

interface SpectreAccessStoreState {
  isLoaded: boolean
  isRefreshing: boolean
  lastError: string | null
  access: SpectreAccessState | null
  initialize: () => Promise<void>
  setRefreshing: (refreshing: boolean) => void
  setLastError: (error: string | null) => void
  setAccess: (access: SpectreAccessState | null) => Promise<void>
}

export const useSpectreAccessStore = create<SpectreAccessStoreState>((set) => ({
  isLoaded: false,
  isRefreshing: false,
  lastError: null,
  access: null,

  initialize: async () => {
    try {
      const stored = await SecureStore.getItemAsync(
        SPECTRE_ACCESS_STATE_KEY,
        SECURE_STORE_OPTIONS,
      )
      const legacy = stored
        ? null
        : await SecureStore.getItemAsync(LEGACY_TOR_ENTITLEMENT_STATE_KEY, SECURE_STORE_OPTIONS)
      const access = stored || legacy
        ? normalizeSpectreAccessState(JSON.parse(stored ?? legacy ?? 'null'))
        : null

      if (legacy) {
        await persistAccessState(access)
        await SecureStore.deleteItemAsync(LEGACY_TOR_ENTITLEMENT_STATE_KEY, SECURE_STORE_OPTIONS)
      }

      set({
        isLoaded: true,
        lastError: null,
        access,
      })
    } catch (error) {
      console.warn('Failed to initialize Spectre access state:', error)
      set({
        isLoaded: true,
        lastError: error instanceof Error ? error.message : 'Failed to initialize Spectre access state',
        access: null,
      })
    }
  },

  setRefreshing: (refreshing: boolean) => {
    set({ isRefreshing: refreshing })
  },

  setLastError: (error: string | null) => {
    set({ lastError: error })
  },

  setAccess: async (access: SpectreAccessState | null) => {
    await persistAccessState(access)
    set({ access, lastError: null })
  },
}))
