/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import * as SecureStore from 'expo-secure-store'

import { SECURE_STORE_OPTIONS } from '@/lib/constants'

type Listener = (enabled: boolean) => void

export function createSecureBooleanPreference(key: string, defaultEnabled = true) {
  const listeners = new Set<Listener>()
  let cachedEnabled: boolean | null = null

  function notifyListeners(enabled: boolean): void {
    cachedEnabled = enabled
    for (const listener of listeners) {
      listener(enabled)
    }
  }

  async function getEnabled(): Promise<boolean> {
    const value = await SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS)
    const enabled = value === 'true'
      ? true
      : value === 'false'
        ? false
        : defaultEnabled
    cachedEnabled = enabled
    return enabled
  }

  async function setEnabled(enabled: boolean): Promise<void> {
    await SecureStore.setItemAsync(key, String(enabled), SECURE_STORE_OPTIONS)
    notifyListeners(enabled)
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener)

    if (cachedEnabled !== null) {
      listener(cachedEnabled)
    } else {
      void getEnabled()
        .then(listener)
        .catch(() => {})
    }

    return () => {
      listeners.delete(listener)
    }
  }

  return {
    getEnabled,
    setEnabled,
    subscribe,
  }
}
