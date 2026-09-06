/*
 * Copyright (c) 2026 MOZAGA FOUNDATION.
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-Spectra-Commercial
 * See LICENSE.md, LICENSE-AGPL-3.0.txt, and LICENSE-COMMERCIAL.md for details.
 */

import { setStorageInstance } from '@spectra/core-crypto'
import {
  getAsyncStorageAdapter,
  ensureMigrations,
} from './asyncStorageAdapter'
import { prepareAppKeyValueStorage } from './keyValueStorage'

let _initialized = false

/** Initialize storage once. */
export function initializeStorage(): void {
  if (_initialized) return

  const adapter = getAsyncStorageAdapter()
  setStorageInstance(adapter)
  _initialized = true

  prepareAppKeyValueStorage()
    .then(() => ensureMigrations())
    .catch(e => {
      console.warn('Storage migration failed (non-fatal):', e)
    })
}

export {
  getAsyncStorageAdapter,
  clearStorageCache,
  prepareAsyncStorageScope,
  setAsyncStorageScope,
  clearAsyncStorageScope,
  exportActiveQuantumChatStorageSnapshot,
  getScopedSealedStorageRecord,
  importActiveQuantumChatStorageSnapshot,
  setScopedSealedStorageRecord,
  type QuantumChatStorageSnapshot,
} from './asyncStorageAdapter'

export {
  getAppKeyValueStorage,
  prepareAppKeyValueStorage,
  type KeyValueStorage,
} from './keyValueStorage'

export { cancelPendingNativeCryptoJobs } from './nativeCryptoJobs'
