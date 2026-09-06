/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { create } from 'zustand'

import { STORAGE_KEYS } from '@/lib/constants'
import { getAppKeyValueStorage } from '@/services/storage/keyValueStorage'

interface VdfBannerPreferenceState {
  visible: boolean
  hydrated: boolean
  hydrate: () => Promise<void>
  setVisible: (visible: boolean) => Promise<void>
}

function parseStoredVisibility(raw: string | null): boolean {
  return raw === '1' || raw === 'true'
}

export const useVdfBannerPreferenceStore = create<VdfBannerPreferenceState>((set, get) => ({
  visible: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return
    try {
      const raw = await getAppKeyValueStorage().getItem(STORAGE_KEYS.VDF_BANNER_VISIBLE)
      if (get().hydrated) return
      set({ visible: parseStoredVisibility(raw), hydrated: true })
    } catch {
      if (get().hydrated) return
      set({ hydrated: true })
    }
  },

  setVisible: async (visible) => {
    set({ visible, hydrated: true })
    try {
      const storage = getAppKeyValueStorage()
      if (visible) {
        await storage.setItem(STORAGE_KEYS.VDF_BANNER_VISIBLE, 'true')
        return
      }
      await storage.removeItem(STORAGE_KEYS.VDF_BANNER_VISIBLE)
    } catch {
      // Preference writes must not interrupt VDF work.
    }
  },
}))
